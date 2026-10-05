// What a built asset is, read back from the GLB written (as the game will read it), with what the
// Blender and Node stages found and did, checked against the asset's budgets
// (<name>.report.json, and a summary printed)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageUtils } from "@gltf-transform/core";
import { duration } from "./animation.js";
import { HERE } from "./blender.js";
import { createIO } from "./gltf.js";
import { round } from "./optimize.js";

const MEGABYTE = 1024 * 1024;
const SLOTS = ["BaseColor", "MetallicRoughness", "Normal", "Occlusion", "Emissive"];

/** What's in a GLB: its meshes, materials, textures and clips, and its size. */
export async function inspectGlb(file) {
    const io = await createIO();
    const bytes = await readFile(file);
    const document = await io.readBinary(new Uint8Array(bytes));
    const root = document.getRoot();
    const meshes = { meshes: root.listMeshes().length, drawCalls: 0, vertices: 0, triangles: 0, skinned: root.listSkins().length > 0, joints: 0, influences: 0, morphTargets: 0 };

    for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const count = primitive.getAttribute("POSITION")?.getCount() ?? 0;
            const indices = primitive.getIndices();
            const sets = primitive.listSemantics().filter((semantic) => semantic.startsWith("JOINTS_")).length;

            meshes.drawCalls += 1;
            meshes.vertices += count;
            meshes.triangles += primitive.getMode() === 4 ? (indices ? indices.getCount() : count) / 3 : 0;
            meshes.influences = Math.max(meshes.influences, sets * 4);
            meshes.morphTargets = Math.max(meshes.morphTargets, primitive.listTargets().length);
        }
    }

    for (const skin of root.listSkins()) {
        meshes.joints = Math.max(meshes.joints, skin.listJoints().length);
    }

    const textures = root.listTextures().map((texture) => {
        const [width, height] = ImageUtils.getSize(texture.getImage(), texture.getMimeType()) ?? [0, 0];

        return { name: texture.getName(), mimeType: texture.getMimeType(), width, height, bytes: texture.getImage().byteLength, gpuBytes: Math.round((width * height * 4 * 4) / 3) };
    });

    const materials = root.listMaterials().map((material) => ({
        name: material.getName(),
        alphaMode: material.getAlphaMode(),
        doubleSided: material.getDoubleSided(),
        textures: SLOTS.filter((slot) => material[`get${slot}Texture`]()).map((slot) => slot[0].toLowerCase() + slot.slice(1)),
        baseColor: round(material.getBaseColorFactor(), 3),
        roughness: round(material.getRoughnessFactor(), 3),
        metallic: round(material.getMetallicFactor(), 3),
    }));

    const clips = root.listAnimations().map((animation) => ({
        name: animation.getName(),
        seconds: round(duration(animation)),
        channels: animation.listChannels().length,
        keyframes: animation.listSamplers().reduce((sum, sampler) => sum + (sampler.getInput()?.getCount() ?? 0), 0),
    }));

    return {
        bytes: bytes.length,
        extensionsUsed: root.listExtensionsUsed().map((extension) => extension.extensionName).sort(),
        extensionsRequired: root.listExtensionsRequired().map((extension) => extension.extensionName).sort(),
        ...meshes,
        materials,
        textures,
        clips,
    };
}

/** The budgets an asset's within, or not: [{ budget, limit, value, ok }]. */
export function checkBudgets(glb, budgets) {
    const values = {
        triangles: glb.triangles,
        vertices: glb.vertices,
        joints: glb.joints,
        drawCalls: glb.drawCalls,
        textureSize: Math.max(0, ...glb.textures.map((texture) => Math.max(texture.width, texture.height))),
        textureMegabytes: round(glb.textures.reduce((sum, texture) => sum + texture.gpuBytes, 0) / MEGABYTE, 2),
        kilobytes: round(glb.bytes / 1024, 1),
    };

    return Object.entries(budgets).map(([budget, limit]) => {
        if (budget === "clips") {
            const missing = limit.filter((name) => !glb.clips.some((clip) => clip.name === name));

            return { budget, limit, value: missing.length ? `missing ${missing.join(", ")}` : "all there", ok: missing.length === 0 };
        }

        return { budget, limit, value: values[budget], ok: values[budget] <= limit };
    });
}

const relative = (file) => path.relative(HERE, file).split(path.sep).join("/");

/** The report on a built asset, from what each stage did and the GLB read back. */
export async function makeReport(config, { blender, optimized, glb }) {
    const file = await inspectGlb(glb);
    const lods = [];

    for (const lod of optimized.lods) {
        const read = await inspectGlb(lod.file);

        lods.push({ file: relative(lod.file), ratio: lod.ratio, error: lod.error, triangles: read.triangles, vertices: read.vertices, kilobytes: round(read.bytes / 1024, 1) });
    }

    const clips = file.clips.map((clip) => {
        const done = optimized.clips.find((one) => one.name === clip.name) ?? {};
        const action = blender.actions?.find((one) => one.name === clip.name);

        return { ...clip, loops: done.loops, inPlace: done.inPlace, rootMotion: done.rootMotion, from: action?.from ?? null };
    });

    const warnings = [...(blender.warnings ?? [])];
    const missing = (blender.actions ?? []).filter((action) => !file.clips.some((clip) => clip.name === action.name));

    if (missing.length) {
        warnings.push(`actions not in the GLB: ${missing.map((action) => action.name).join(", ")}`);
    }

    const budgets = checkBudgets(file, config.budgets);

    return {
        name: config.name,
        config: relative(config.file),
        source: relative(config.source),
        glb: relative(glb),
        built: { blender: blender.blender, gltfExporter: blender.exporter, sourceSavedWith: blender.savedWith },
        kilobytes: round(file.bytes / 1024, 1),
        compression: config.compress,
        extensionsRequired: file.extensionsRequired,
        extensionsUsed: file.extensionsUsed,
        meshes: { drawCalls: file.drawCalls, vertices: file.vertices, triangles: file.triangles, skinned: file.skinned, joints: file.joints, influences: file.influences, morphTargets: file.morphTargets },
        materials: file.materials,
        textures: file.textures.map(({ name, mimeType, width, height, bytes, gpuBytes }) => ({ name, mimeType, width, height, kilobytes: round(bytes / 1024, 1), gpuMegabytes: round(gpuBytes / MEGABYTE, 2) })),
        clips,
        scale: optimized.scale,
        bounds: optimized.bounds,
        lods,
        exported: {
            objects: blender.objects,
            armature: blender.armature ?? null,
            fps: blender.fps ?? null,
            baking: blender.materials,
            texturesShrunk: blender.images,
            materialExtensionsLeftOut: optimized.strippedExtensions ?? [],
            texturesOfOneColourMadeFactors: optimized.texturesMadeFactors ?? 0,
        },
        budgets,
        validation: { beforeCompression: optimized.validation, final: optimized.finalValidation },
        notes: blender.notes ?? [],
        warnings,
    };
}

/** Whether a report's asset is fit to use: { ok, problems }. */
export function judge(report, { strict = false } = {}) {
    const problems = [];

    if (report.validation.beforeCompression.errors || report.validation.final.errors) {
        problems.push(`glTF Validator: ${report.validation.beforeCompression.errors + report.validation.final.errors} errors`);
    }

    if (report.warnings.some((warning) => warning.startsWith("actions not in the GLB"))) {
        problems.push("actions missing from the GLB");
    }

    const over = report.budgets.filter((budget) => !budget.ok);

    if (strict && over.length) {
        problems.push(`over budget: ${over.map((budget) => budget.budget).join(", ")}`);
    }

    return { ok: problems.length === 0, problems };
}

/** A few lines saying what was built. */
export function summarize(report) {
    const { meshes, textures, clips, bounds } = report;
    const lines = [`${report.name}: ${report.glb}, ${report.kilobytes} KB (${report.compression})`];
    const [width, height, length] = bounds.rest.size.map((v) => v.toFixed(2));

    lines.push(`  ${meshes.triangles} triangles, ${meshes.vertices} vertices, ${meshes.drawCalls} draw call${meshes.drawCalls === 1 ? "" : "s"}${meshes.skinned ? `, ${meshes.joints} joints (${meshes.influences} a vertex)` : ""}`);
    lines.push(`  ${textures.length} texture${textures.length === 1 ? "" : "s"}${textures.length ? `: ${textures.map((t) => `${t.width}x${t.height} ${t.mimeType.split("/")[1]}`).join(", ")}, ${textures.reduce((sum, t) => sum + t.gpuMegabytes, 0).toFixed(1)} MB on the GPU` : ""}`);

    if (clips.length) {
        lines.push(`  ${clips.length} clip${clips.length === 1 ? "" : "s"}: ${clips.map((clip) => `${clip.name} ${clip.seconds.toFixed(2)} s${describeClip(clip)}`).join(", ")}`);
    }

    lines.push(`  ${width} x ${height} x ${length} m (across, up, along), reaching ${bounds.radius.toFixed(2)} m from its origin`);

    for (const lod of report.lods) {
        lines.push(`  ${lod.file}: ${lod.triangles} triangles, ${lod.kilobytes} KB`);
    }

    const over = report.budgets.filter((budget) => !budget.ok);

    if (report.budgets.length) {
        lines.push(over.length ? `  OVER BUDGET: ${over.map((b) => `${b.budget} ${b.value} (limit ${Array.isArray(b.limit) ? b.limit.join(", ") : b.limit})`).join("; ")}` : `  within its ${report.budgets.length} budgets`);
    }

    const { beforeCompression, final } = report.validation;

    lines.push(`  glTF Validator: ${beforeCompression.errors + final.errors} errors, ${beforeCompression.warnings} warnings`);

    for (const warning of report.warnings) {
        lines.push(`  warning: ${warning}`);
    }

    return lines;
}

function describeClip(clip) {
    const parts = [];

    if (clip.loops) {
        parts.push("loops");
    }

    if (clip.rootMotion?.distance > 0.01) {
        parts.push(`${clip.inPlace ? "travel taken out" : "travels"} ${clip.rootMotion.speed.toFixed(2)} m/s`);
    }

    return parts.length ? ` (${parts.join(", ")})` : "";
}
