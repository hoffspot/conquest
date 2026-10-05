// The Node stage of the pipeline (README.md): makes the GLB Blender wrote ready for the game.
// It's turned to face +z, sized in metres and stood on its origin; clips that should play in
// place have their travel taken out (and every clip's travel is measured, to match its playing
// speed to how fast the creature moves); redundant keyframes, duplicates and anything unused are
// taken out; it's validated, lower-detail copies are made, and it's compressed.

import { readFile } from "node:fs/promises";
import { Logger } from "@gltf-transform/core";
import { clearNodeParent, cloneDocument, dedup, join, meshopt, prune, quantize, reorder, resample, simplify, unpartition, weld } from "@gltf-transform/functions";
import { bounds, duration, loops, playInPlace, rootMotion, visitVertices } from "./animation.js";
import { createIO, MeshoptEncoder, MeshoptSimplifier } from "./gltf.js";
import { moveDocument, scaleDocument } from "./transform.js";
import { validate } from "./validate.js";

// Material extensions kept (Three.js's standard material draws them); the rest are left out
const KEPT_MATERIAL_EXTENSIONS = new Set(["KHR_materials_emissive_strength", "KHR_materials_unlit"]);

// The validator can't read EXT_meshopt_compression: what that brings it to say about a file
// that has it (the file's checked before it's compressed instead)
const MESHOPT_IGNORED = ["UNSUPPORTED_EXTENSION", "BUFFER_MISSING_GLB_DATA", "BUFFER_VIEW_TOO_LONG", "BUFFER_GLB_CHUNK_TOO_BIG", "ACCESSOR_TOTAL_OFFSET_ALIGNMENT"];

const AXES = { width: 0, height: 1, length: 2 };

// How many moments of each clip its reach is measured at, and about how many vertices
const MOMENTS = 9;
const VERTICES = 4000;

/** Whether a name matches a pattern with * and ? wildcards. */
export function wildcard(pattern, name) {
    const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");

    return new RegExp(`^${source}$`).test(name);
}

export const round = (value, places = 4) => (typeof value === "number" ? Number(value.toFixed(places)) : Array.isArray(value) ? value.map((v) => round(v, places)) : value);

/**
 * Makes the Blender stage's GLB (`raw`) ready for the game, written to `glb` (and its
 * lower-detail copies to `lodFile(1)`, `lodFile(2)`...). Returns what it did and found.
 */
export async function optimize(config, { raw, glb, lodFile }) {
    const io = await createIO();
    const document = await io.read(raw);
    const root = document.getRoot();
    const result = { clips: [], lods: [] };

    document.setLogger(new Logger(Logger.Verbosity.WARN));

    // Skinned meshes at the top of the scene, as glTF would have them (their parents' transforms
    // don't move them anyway)
    for (const node of root.listNodes()) {
        if (node.getSkin()) {
            if (node.getParentNode()) {
                clearNodeParent(node);
            }

            node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
        }
    }

    if (config.turn) {
        moveDocument(document, { turn: (config.turn * Math.PI) / 180 });
    }

    const rest = bounds(document);

    if (!Number.isFinite(rest.size[0])) {
        throw new Error("the export has no vertices");
    }

    let factor = 1;

    if (config.size) {
        const [key, value] = Object.entries(config.size)[0];
        const measured = key === "longest" ? Math.max(...rest.size) : rest.size[AXES[key]];

        factor = key === "scale" ? value : value / measured;
        scaleDocument(document, factor);
    }

    result.scale = round(factor, 6);

    if (config.origin === "feet") {
        const box = bounds(document);

        moveDocument(document, { offset: [-(box.min[0] + box.max[0]) / 2, -box.min[1], -(box.min[2] + box.max[2]) / 2] });
    }

    // Each clip's travel, measured, or taken out to play in place
    const { inPlace, rootBone } = config.clips;
    const names = root.listAnimations().map((animation) => animation.getName());
    const unmatched = inPlace === true ? [] : inPlace.filter((pattern) => !names.some((name) => wildcard(pattern, name)));

    if (unmatched.length) {
        throw new Error(`clips.inPlace names clips there aren't: ${unmatched.join(", ")} (there are ${names.join(", ")})`);
    }

    for (const animation of root.listAnimations()) {
        const name = animation.getName();
        const still = inPlace === true || inPlace.some((pattern) => wildcard(pattern, name));
        const motion = still ? playInPlace(document, animation, { rootBone }) : rootMotion(document, animation, { rootBone });

        result.clips.push({
            name,
            inPlace: still,
            rootMotion: motion && { bone: motion.bone, distance: round(motion.distance), speed: round(motion.speed), direction: round(motion.direction) },
        });
    }

    // Tidied: keyframes that a straight line between others gives anyway, duplicates, a mesh's
    // parts that share a material joined (one draw call; not separate objects, which keep their
    // names), anything nothing uses (a texture of one colour made the material's colour), one buffer
    const textures = root.listTextures().length;

    await document.transform(dedup(), join({ keepMeshes: true }), resample({ tolerance: config.resample }), prune(), unpartition());

    if (root.listTextures().length < textures) {
        result.texturesMadeFactors = textures - root.listTextures().length;
    }

    if (config.stripMaterialExtensions) {
        const stripped = root
            .listExtensionsUsed()
            .filter((extension) => extension.extensionName.startsWith("KHR_materials_") && !KEPT_MATERIAL_EXTENSIONS.has(extension.extensionName));

        for (const extension of stripped) {
            extension.dispose();
        }

        if (stripped.length) {
            await document.transform(prune());
            result.strippedExtensions = stripped.map((extension) => extension.extensionName);
        }
    }

    // Whether each clip loops, and how far out it reaches at any moment of any clip
    for (const [i, animation] of root.listAnimations().entries()) {
        result.clips[i].loops = loops(document, animation, { rootBone });
    }

    result.bounds = { rest: boxOf(bounds(document)), ...reach(document) };

    // Checked before it's compressed: the validator can't read meshopt's compression
    result.validation = await validate(await io.writeBinary(document));

    for (const [i, lod] of config.lods.entries()) {
        const copy = cloneDocument(document);

        await copy.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: lod.error ?? 0.01 }), prune());
        await compress(copy, config.compress);
        await io.write(lodFile(i + 1), copy);
        result.lods.push({ file: lodFile(i + 1), ratio: lod.ratio, error: lod.error ?? 0.01 });
    }

    await compress(document, config.compress);
    await io.write(glb, document);
    result.finalValidation = await validate(await readFile(glb), { ignore: config.compress === "meshopt" ? MESHOPT_IGNORED : [] });

    return result;
}

async function compress(document, how) {
    if (how === "meshopt") {
        await document.transform(meshopt({ encoder: MeshoptEncoder }));
    } else if (how === "quantize") {
        await document.transform(reorder({ encoder: MeshoptEncoder }), quantize());
    }
}

function boxOf(box) {
    return { min: round(box.min), max: round(box.max), size: round(box.size) };
}

/** The box round it at every moment of every clip, and the farthest any vertex gets from its origin. */
function reach(document) {
    const animations = document.getRoot().listAnimations();
    let count = 0;

    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            count += primitive.getAttribute("POSITION")?.getCount() ?? 0;
        }
    }

    const stride = Math.max(1, Math.round(count / VERTICES));
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let radius = 0;

    for (const animation of animations.length ? animations : [null]) {
        const end = animation ? duration(animation) : 0;

        for (let k = 0; k < (animation ? MOMENTS : 1); k++) {
            visitVertices(
                document,
                (x, y, z) => {
                    min[0] = Math.min(min[0], x);
                    min[1] = Math.min(min[1], y);
                    min[2] = Math.min(min[2], z);
                    max[0] = Math.max(max[0], x);
                    max[1] = Math.max(max[1], y);
                    max[2] = Math.max(max[2], z);
                    radius = Math.max(radius, Math.hypot(x, y, z));
                },
                { animation, time: (end * k) / (MOMENTS - 1), stride },
            );
        }
    }

    return { animated: boxOf({ min, max, size: max.map((v, i) => v - min[i]) }), radius: round(radius) };
}
