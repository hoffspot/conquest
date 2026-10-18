// The Node stage of the pipeline (README.md): makes the GLB Blender wrote ready for the game.
// It's turned to face +z, sized in metres and stood on its origin; clips that should play in
// place have their travel taken out (and every clip's travel is measured, to match its playing
// speed to how fast the creature moves); redundant keyframes, duplicates and anything unused are
// taken out; it's validated, lower-detail copies are made, and it's compressed.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Logger, PropertyType } from "@gltf-transform/core";
import { clearNodeParent, cloneDocument, dedup, join, meshopt, prune, quantize, reorder, resample, simplify, simplifyPrimitive, unpartition, weld, weldPrimitive } from "@gltf-transform/functions";
import { bounds, channelsByNode, duration, loops, playInPlace, rootMotion, sampleChannel, visitVertices } from "./animation.js";
import { createIO, MeshoptEncoder, MeshoptSimplifier } from "./gltf.js";
import { inventClip } from "./invent.js";
import { encodeTextures } from "./ktx2.js";
import { retargetClips } from "./retarget.js";
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

// (-0 made 0, as JSON writes it)
export const round = (value, places = 4) => (typeof value === "number" ? Number(value.toFixed(places)) + 0 : Array.isArray(value) ? value.map((v) => round(v, places)) : value);

/**
 * Tangents that aren't a unit long made so. MikkTSpace gives none (no length) where a triangle's UVs
 * have no area, as a few of a bought model's may: the glTF Validator counts each as an error, and
 * a normal map shades it as a black speck. Each of those gets a direction at right angles to its
 * normal (any: UVs with no area have no direction to follow), keeping its handedness; any other
 * that's too long or short is scaled to a unit. Returns how many were mended.
 */
export function mendTangents(document) {
    const done = new Set();
    const tangent = [0, 0, 0, 0];
    const normal = [0, 0, 0];
    let mended = 0;

    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const tangents = primitive.getAttribute("TANGENT");
            const normals = primitive.getAttribute("NORMAL");

            if (!tangents || !normals || done.has(tangents)) {
                continue;
            }

            done.add(tangents);

            for (let i = 0; i < tangents.getCount(); i++) {
                tangents.getElement(i, tangent);

                let length = Math.hypot(tangent[0], tangent[1], tangent[2]);

                if (Math.abs(length - 1) < 1e-3) {
                    continue;
                }

                if (length < 1e-6) {
                    // (The axis least along the normal, less its part along the normal)
                    normals.getElement(i, normal);

                    const axis = [1, 2].reduce((best, k) => (Math.abs(normal[k]) < Math.abs(normal[best]) ? k : best), 0);

                    for (let k = 0; k < 3; k++) {
                        tangent[k] = (k === axis ? 1 : 0) - normal[k] * normal[axis];
                    }

                    length = Math.hypot(tangent[0], tangent[1], tangent[2]);
                }

                tangents.setElement(i, [tangent[0] / length, tangent[1] / length, tangent[2] / length, tangent[3] < 0 ? -1 : 1]);
                mended++;
            }
        }
    }

    return mended;
}

/**
 * Channels that never move a bone from where it stands at rest left out: a clip need only say
 * what moves (Three.js holds a bone no clip moves where it stands). A clip left with nothing
 * keeps one channel, as glTF wants one. Returns how many were left out.
 */
export function trimStill(document, { tolerance = 1e-5 } = {}) {
    let trimmed = 0;

    for (const animation of document.getRoot().listAnimations()) {
        for (const channel of animation.listChannels()) {
            const node = channel.getTargetNode();
            const path = channel.getTargetPath();
            const output = channel.getSampler()?.getOutput();

            if (!node || !output || !["translation", "rotation", "scale"].includes(path) || animation.listChannels().length === 1) {
                continue;
            }

            const rest = path === "translation" ? node.getTranslation() : path === "rotation" ? node.getRotation() : node.getScale();
            const value = [];
            let still = true;

            for (let i = 0; i < output.getCount() && still; i++) {
                output.getElement(i, value);

                // (A rotation and its negation are the same turn)
                still =
                    path === "rotation"
                        ? Math.abs(value.reduce((sum, v, k) => sum + v * rest[k], 0)) > 1 - tolerance
                        : value.every((v, k) => Math.abs(v - rest[k]) <= tolerance * Math.max(1, Math.abs(rest[k])));
            }

            if (still && channel.getSampler().getInterpolation() !== "CUBICSPLINE") {
                const sampler = channel.getSampler();

                channel.dispose();

                if (!sampler.listParents().some((parent) => parent.propertyType === "AnimationChannel")) {
                    sampler.dispose();
                }

                trimmed++;
            }
        }
    }

    return trimmed;
}

/**
 * The rest pose taken from a clip's first frame: each bone the clip moves stood as it is there.
 * For a source whose skeleton rests where its clips never have it (a root bone resting tens of
 * metres off that every clip brings back): the model's measured, turned and moved to its origin
 * as its clips show it. Its clips aren't changed (glTF's keyframes are where a bone is, not how far
 * it's moved from its rest). Returns how many bones were moved.
 */
export function restFromClip(document, name) {
    const clip = document.getRoot().listAnimations().find((animation) => animation.getName() === name);

    if (!clip) {
        throw new Error(`restPose: there's no clip ${name}`);
    }

    const set = { translation: "setTranslation", rotation: "setRotation", scale: "setScale" };
    let moved = 0;

    for (const [node, paths] of channelsByNode(clip)) {
        // (A morph's weights aren't a bone's place)
        const kept = Object.entries(paths).filter(([path]) => set[path]);

        for (const [path, channel] of kept) {
            node[set[path]](sampleChannel(channel, 0));
        }

        moved += kept.length > 0 ? 1 : 0;
    }

    return moved;
}

/**
 * Only the morph targets (shape keys) of these names kept, on every mesh: a face's 52 ARKit
 * shapes, say, that nothing in the game moves (10 MB on a demon's head). The clips' channels that
 * weigh them keep only theirs, and a mesh left with none loses its channels. Returns how many
 * targets were left out (one for each mesh, however many primitives it has).
 */
export function keepMorphs(document, names) {
    const root = document.getRoot();
    let dropped = 0;

    for (const mesh of root.listMeshes()) {
        const count = Math.max(0, ...mesh.listPrimitives().map((primitive) => primitive.listTargets().length));
        const targetNames = mesh.getExtras()?.targetNames ?? [];
        const kept = [...Array(count).keys()].filter((i) => names.includes(targetNames[i]));

        if (kept.length === count) {
            continue;
        }

        for (const primitive of mesh.listPrimitives()) {
            for (const [i, target] of primitive.listTargets().entries()) {
                if (!kept.includes(i)) {
                    primitive.removeTarget(target);
                }
            }
        }

        const only = (weights) => kept.map((i) => weights[i] ?? 0);
        const extras = { ...mesh.getExtras() };

        delete extras.targetNames;
        mesh.setWeights(only(mesh.getWeights()));
        mesh.setExtras(kept.length ? { ...extras, targetNames: kept.map((i) => targetNames[i]) } : extras);

        for (const node of root.listNodes().filter((one) => one.getMesh() === mesh && one.getWeights().length)) {
            node.setWeights(only(node.getWeights()));
        }

        for (const animation of root.listAnimations()) {
            for (const channel of animation.listChannels().filter((one) => one.getTargetPath() === "weights" && one.getTargetNode()?.getMesh() === mesh)) {
                if (!kept.length) {
                    animation.removeChannel(channel);
                    continue;
                }

                // (A keyframe's weights, or a cubic spline's three sets of them, one after another)
                const output = channel.getSampler().getOutput();
                const all = output.getArray();
                const sets = all.length / count;

                output.setArray(Float32Array.from({ length: sets * kept.length }, (_, k) => all[Math.floor(k / kept.length) * count + kept[k % kept.length]]));
            }
        }

        dropped += count - kept.length;
    }

    return dropped;
}

/**
 * The clips clips.invent asks for, made in turn (one may be made from one made before it). One
 * made from a clip of its own name takes that one's place: an idle from another skeleton's file
 * (retarget), say, given a wing's breath. Returns [{ name, from }].
 */
export function inventClips(document, list) {
    for (const spec of list) {
        const there = document
            .getRoot()
            .listAnimations()
            .find((animation) => animation.getName() === spec.name);

        if (there && spec.from !== spec.name) {
            throw new Error(`clips.invent ${spec.name}: there's a clip ${spec.name} already`);
        }

        inventClip(document, spec);
        there?.dispose();
    }

    return list.map(({ name, from }) => ({ name, from }));
}

/**
 * Vertices one bone moves given to another to move: { "bone": "the bone to have them" }. For a
 * bone nothing moves in the game (one a control rig moved, its constraints muted): a mouth's inside
 * left behind as the head goes on, stretched out into a spike. A vertex already moved by the other
 * bone in part is moved by it as far as the two together moved it. Returns how many were given.
 */
export function moveWeights(document, moves) {
    const bones = new Set(document.getRoot().listSkins().flatMap((skin) => skin.listJoints().map((joint) => joint.getName())));

    for (const [from, to] of Object.entries(moves)) {
        for (const name of [from, to]) {
            if (!bones.has(name)) {
                throw new Error(`reweight: there's no bone ${name}`);
            }
        }
    }

    let moved = 0;

    for (const node of document.getRoot().listNodes()) {
        const skin = node.getSkin();

        if (!skin || !node.getMesh()) {
            continue;
        }

        const names = skin.listJoints().map((joint) => joint.getName());

        for (const primitive of node.getMesh().listPrimitives()) {
            for (let set = 0; primitive.getAttribute(`JOINTS_${set}`); set++) {
                const joints = primitive.getAttribute(`JOINTS_${set}`);
                const weights = primitive.getAttribute(`WEIGHTS_${set}`);
                const j = [];
                const w = [];

                for (let i = 0; i < joints.getCount(); i++) {
                    joints.getElement(i, j);
                    weights.getElement(i, w);

                    let changed = false;

                    for (let k = 0; k < j.length; k++) {
                        const to = w[k] > 0 && moves[names[j[k]]];

                        if (!to) {
                            continue;
                        }

                        if (!names.includes(to)) {
                            throw new Error(`reweight: ${to} isn't in ${node.getName()}'s skeleton`);
                        }

                        const index = names.indexOf(to);
                        const already = j.findIndex((joint, other) => other !== k && joint === index && w[other] > 0);

                        if (already >= 0) {
                            w[already] += w[k];
                            w[k] = 0;
                            j[k] = 0;
                        } else {
                            j[k] = index;
                        }

                        changed = true;
                    }

                    if (changed) {
                        joints.setElement(i, j);
                        weights.setElement(i, w);
                        moved++;
                    }
                }
            }
        }
    }

    return moved;
}

/**
 * Each clip's keyframes thinned to `fps` a second: at each 1/fps from the clip's start, the
 * nearest there is, and always its last, so the clip keeps its length and a loop still meets its
 * start (Blender's own frame step stops short of a clip's last frame where its length isn't a
 * multiple of the step). A sampler keyed no more often keeps every keyframe; a CUBICSPLINE one is
 * left as it is (its tangents are for the keys it has). Returns how many keyframes were left out.
 */
export function thinKeys(document, fps) {
    let dropped = 0;

    for (const animation of document.getRoot().listAnimations()) {
        const samplers = animation.listSamplers().filter((sampler) => sampler.getInput() && sampler.getOutput() && sampler.getInterpolation() !== "CUBICSPLINE");
        const start = Math.min(...samplers.map((sampler) => sampler.getInput().getArray()[0]));
        const kept = new Map();

        for (const sampler of samplers) {
            const input = sampler.getInput();
            const times = input.getArray();
            const last = times.length - 1;

            if (!kept.has(input)) {
                const indices = [];

                for (let k = 0, i = 0; start + k / fps <= times[last] + 1e-6; k++) {
                    const time = start + k / fps;

                    while (i < last && Math.abs(times[i + 1] - time) < Math.abs(times[i] - time)) {
                        i++;
                    }

                    if (indices.at(-1) !== i) {
                        indices.push(i);
                    }
                }

                if (indices.at(-1) !== last) {
                    indices.push(last);
                }

                const thinned = indices.length < times.length ? document.createAccessor().setType("SCALAR").setArray(new Float32Array(indices.map((index) => times[index]))).setBuffer(input.getBuffer()) : null;

                kept.set(input, { indices, thinned });
            }

            const { indices, thinned } = kept.get(input);

            if (!thinned) {
                continue;
            }

            // (A key's values: one element, or one for each morph target)
            const output = sampler.getOutput();
            const values = output.getArray();
            const span = values.length / times.length;
            const array = new values.constructor(indices.length * span);

            indices.forEach((index, n) => array.set(values.subarray(index * span, (index + 1) * span), n * span));
            sampler.setInput(thinned).setOutput(document.createAccessor().setType(output.getType()).setNormalized(output.getNormalized()).setArray(array).setBuffer(output.getBuffer()));
            dropped += times.length - indices.length;
        }
    }

    return dropped;
}

/**
 * A lower-detail copy of every mesh, in the same document: a mesh of its own on a node of its
 * own ("<name>.lod<level>", extras.lod = level), its vertices welded then simplified (`ratio`
 * of them kept, at most `error` of its size astray), on the same skeleton and materials as the
 * full mesh. Resolves with the meshes made.
 */
export async function packLod(document, level, { ratio, error = 0.01 }) {
    const root = document.getRoot();
    const made = [];

    await MeshoptSimplifier.ready;

    for (const node of root.listNodes()) {
        const mesh = node.getMesh();

        if (!mesh || node.getExtras().lod !== undefined) {
            continue;
        }

        const copy = document.createMesh(`${mesh.getName()}.lod${level}`);

        for (const primitive of mesh.listPrimitives()) {
            const lower = document.createPrimitive().setMode(primitive.getMode()).setMaterial(primitive.getMaterial());

            for (const semantic of primitive.listSemantics()) {
                lower.setAttribute(semantic, primitive.getAttribute(semantic).clone());
            }

            if (primitive.getIndices()) {
                lower.setIndices(primitive.getIndices().clone());
            }

            for (const target of primitive.listTargets()) {
                const lowerTarget = document.createPrimitiveTarget();

                for (const semantic of target.listSemantics()) {
                    lowerTarget.setAttribute(semantic, target.getAttribute(semantic).clone());
                }

                lower.addTarget(lowerTarget);
            }

            weldPrimitive(lower);
            simplifyPrimitive(lower, { simplifier: MeshoptSimplifier, ratio, error });
            copy.addPrimitive(lower);
        }

        const lodNode = document
            .createNode(`${node.getName()}.lod${level}`)
            .setMesh(copy)
            .setSkin(node.getSkin())
            .setTranslation(node.getTranslation())
            .setRotation(node.getRotation())
            .setScale(node.getScale())
            .setExtras({ lod: level });
        const parent = node.getParentNode();

        if (parent) {
            parent.addChild(lodNode);
        } else {
            for (const scene of root.listScenes().filter((scene) => scene.listChildren().includes(node))) {
                scene.addChild(lodNode);
            }
        }

        made.push(copy);
    }

    return made;
}

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

    result.tangentsMended = mendTangents(document);

    if (Object.keys(config.reweight).length) {
        result.reweighted = moveWeights(document, config.reweight);
    }

    if (config.morphs !== true) {
        result.morphsLeftOut = keepMorphs(document, config.morphs);
    }

    if (config.restPose) {
        result.restPose = restFromClip(document, config.restPose);
    }

    if (config.turn) {
        moveDocument(document, { turn: (config.turn * Math.PI) / 180 });
    }

    // Clips from other skeletons' files, played on its bones (facing +z now, as theirs do)
    result.retargeted = [];

    for (const [i, spec] of config.retarget.entries()) {
        const source = await io.read(spec.from);
        const unaligned = (name) => spec.unaligned.some((pattern) => wildcard(pattern, name));

        try {
            const made = retargetClips(document, source, { clips: spec.clips, bones: spec.bones, unaligned, fps: spec.fps });

            result.retargeted.push({ from: path.basename(spec.from), bones: made.bones.length, hips: made.hips, scale: round(made.scale), clips: made.clips });
        } catch (error) {
            throw new Error(`retarget[${i}] (${path.basename(spec.from)}): ${error.message}`);
        }
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

    // Clips made up from those there are, sized and turned as the rest are now
    result.invented = inventClips(document, config.clips.invent);

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

    // Tidied: the clips thinned to clips.fps keyframes a second, if asked; keyframes that a
    // straight line between others gives anyway, duplicates, a mesh's parts that share a material
    // joined (one draw call; not separate objects, which keep their names), anything nothing uses
    // (a texture of one colour made the material's colour), one buffer
    const textures = root.listTextures().length;

    if (config.clips.fps) {
        result.keyframesThinned = thinKeys(document, config.clips.fps);
    }

    await document.transform(dedup(), join({ keepMeshes: true }), resample({ tolerance: config.resample }), prune(), unpartition());

    if (root.listTextures().length < textures) {
        result.texturesMadeFactors = textures - root.listTextures().length;
    }

    if (config.clips.trimStill) {
        result.stillChannelsTrimmed = trimStill(document);
        await document.transform(prune());
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

    // Textures the GPU keeps compressed
    if (config.textures.format === "ktx2") {
        result.ktx2 = await encodeTextures(document, config.textures.ktx2, { maxSize: config.textures.maxSize });
    }

    // Whether each clip loops, and how far out it reaches at any moment of any clip
    for (const [i, animation] of root.listAnimations().entries()) {
        result.clips[i].loops = loops(document, animation, { rootBone });
    }

    result.bounds = { rest: boxOf(bounds(document)), ...reach(document) };

    // Lower-detail copies in this file, beside the full mesh, sharing everything else
    if (config.packLods) {
        for (const [i, lod] of config.lods.entries()) {
            const meshes = await packLod(document, i + 1, lod);

            result.lods.push({ packed: true, level: i + 1, ratio: lod.ratio, error: lod.error ?? 0.01, meshes: meshes.map((mesh) => mesh.getName()) });
        }
    }

    // (Lower-detail files are made from the mesh as Blender gave it, as packed ones are)
    const original = config.packLods || !config.lods.length ? null : cloneDocument(document);

    // The full mesh itself simplified, when even that's more than the game wants
    if (config.simplify) {
        simplifyFull(document, config.simplify);
    }

    // Checked before it's compressed: the validator can't read meshopt's compression
    result.validation = await validate(await io.writeBinary(document), { ktx2: config.textures.format === "ktx2" });

    for (const [i, lod] of (original ? config.lods : []).entries()) {
        const copy = cloneDocument(original);

        await copy.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: lod.error ?? 0.01 }), prune());
        await compress(copy, config.compress);
        await io.write(lodFile(i + 1), copy);
        result.lods.push({ file: lodFile(i + 1), ratio: lod.ratio, error: lod.error ?? 0.01 });
    }

    await compress(document, config.compress);
    await io.write(glb, document);
    result.finalValidation = await validate(await readFile(glb), { ignore: config.compress === "meshopt" ? MESHOPT_IGNORED : [], ktx2: config.textures.format === "ktx2" });

    return result;
}

/**
 * A variant's GLB (config.variants): only its materials, and in them only the textures it gives,
 * made as the model's are (the material extensions the game doesn't draw left out, KTX2): no
 * meshes, skins, clips or scene. The game puts its textures on the model's materials of the same
 * names, in place of theirs.
 */
export async function optimizeVariant(config, name, { raw, glb }) {
    const io = await createIO();
    const document = await io.read(raw);
    const root = document.getRoot();
    const own = new Set(Object.keys(config.variants[name].materials));

    document.setLogger(new Logger(Logger.Verbosity.WARN));

    // (Their parts too: a mesh's primitives, an animation's samplers, left behind would keep the
    // geometry and the clips' keyframes in the file)
    const parts = [
        ...root.listAnimations().flatMap((animation) => [...animation.listChannels(), ...animation.listSamplers()]),
        ...root.listMeshes().flatMap((mesh) => mesh.listPrimitives().flatMap((primitive) => [...primitive.listTargets(), primitive])),
    ];

    for (const property of [...parts, ...root.listAnimations(), ...root.listScenes(), ...root.listNodes(), ...root.listSkins(), ...root.listMeshes()]) {
        property.dispose();
    }

    // (The model's other materials came with it: they're the main file's)
    for (const material of root.listMaterials()) {
        if (!own.has(material.getName())) {
            material.dispose();
        }
    }

    // (Its buffer kept: there's one, and its textures are written into it)
    await document.transform(prune({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE], keepLeaves: false }));

    if (config.stripMaterialExtensions) {
        for (const extension of root.listExtensionsUsed()) {
            if (extension.extensionName.startsWith("KHR_materials_") && !KEPT_MATERIAL_EXTENSIONS.has(extension.extensionName)) {
                extension.dispose();
            }
        }
    }

    const missing = [...own].filter((material) => !root.listMaterials().some((one) => one.getName() === material));

    if (missing.length) {
        throw new Error(`variants.${name}: the export has no material ${missing.join(", ")}`);
    }

    const ktx2 = config.textures.format === "ktx2" ? await encodeTextures(document, config.textures.ktx2, { maxSize: config.textures.maxSize }) : [];

    await io.write(glb, document);

    return { name, glb, ktx2, validation: await validate(await readFile(glb), { ktx2: config.textures.format === "ktx2" }) };
}

/** The full meshes (not the packed lower-detail ones) welded and simplified: { ratio, error }. */
function simplifyFull(document, { ratio, error = 0.01 }) {
    for (const node of document.getRoot().listNodes()) {
        if (node.getMesh() && node.getExtras().lod === undefined) {
            for (const primitive of node.getMesh().listPrimitives()) {
                weldPrimitive(primitive);
                simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio, error });
            }
        }
    }
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
