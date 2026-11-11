// The Node stage of the pipeline (README.md): makes the GLB Blender wrote ready for the game.
// It's turned to face +z, sized in metres and stood on its origin; clips that should play in
// place have their travel taken out (and every clip's travel is measured, to match its playing
// speed to how fast the creature moves); redundant keyframes, duplicates and anything unused are
// taken out; it's validated, lower-detail copies are made, and it's compressed.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Logger, PropertyType } from "@gltf-transform/core";
import { KHRTextureTransform } from "@gltf-transform/extensions";
import { clearNodeParent, cloneDocument, compactPrimitive, dedup, join, meshopt, prune, quantize, reorder, resample, simplify, simplifyPrimitive, unpartition, weld, weldPrimitive } from "@gltf-transform/functions";
import { bounds, channelsByNode, duration, loops, playInPlace, rootMotion, sampleChannel, visitVertices } from "./animation.js";
import { createIO, MeshoptEncoder, MeshoptSimplifier } from "./gltf.js";
import { inventClip } from "./invent.js";
import { encodeTextures } from "./ktx2.js";
import { retargetClips } from "./retarget.js";
import { seat } from "./seat.js";
import { moveDocument, scaleDocument } from "./transform.js";
import { validate } from "./validate.js";
import { surfaceOf, trianglesOf, walkJson, walkOf } from "./walk.js";

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

/**
 * Duplicates made one (dedup), but the materials `apart` names (* and ? wildcards): each kept
 * apart from the same material of another name, its own, so simplify's `materials` can give it a
 * share of its own (a scene's own parts set onto it, a copy of its material each). Their textures
 * are still shared.
 */
export async function dedupKeeping(document, apart = []) {
    const kept = document
        .getRoot()
        .listMaterials()
        .filter((material) => apart.some((pattern) => wildcard(pattern, material.getName())));

    // (A mark of its own while dedup looks: the same but for its name, it's not the same)
    for (const material of kept) {
        material.setExtras({ ...material.getExtras(), apart: material.getName() });
    }

    await document.transform(dedup());

    for (const material of kept) {
        const extras = { ...material.getExtras() };

        delete extras.apart;
        material.setExtras(extras);
    }
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
 * Bones held where they stand through some clips (`hold`: { clip: [bone names] }): their keys in
 * those clips left out, as if the clip never moved them (a pack's arrow flown off on the hand's
 * socket bone as its bow's loosed, which would carry whatever the game hangs on that bone off with
 * it). A clip left with nothing keeps one channel, as glTF wants one. Returns how many were left out.
 */
export function holdBones(document, hold) {
    let held = 0;

    for (const animation of document.getRoot().listAnimations()) {
        const bones = new Set(hold[animation.getName()] ?? []);

        for (const channel of animation.listChannels()) {
            if (bones.has(channel.getTargetNode()?.getName()) && animation.listChannels().length > 1) {
                const sampler = channel.getSampler();

                channel.dispose();

                if (sampler && !sampler.listParents().some((parent) => parent.propertyType === "AnimationChannel")) {
                    sampler.dispose();
                }

                held++;
            }
        }
    }

    return held;
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
 * of them kept, at most `error` of its size astray; `seams`, the places where one mesh meets
 * another kept where they are: seamsOf's), on the same skeleton and materials as the full mesh.
 * Resolves with the meshes made.
 */
export async function packLod(document, level, { ratio, error = 0.01, materials, seams = null, permissive = Boolean(seams) }) {
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

            simplifyKeeping(lower, { ratio: ratioOf(primitive, { ratio, materials }), error, seams, permissive });
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

// How a model's rocks are seated (config `seat`): lib/seat.js's options, its materials by name
function seatingOf({ materials, gap, drop }) {
    return { gap, drop, rock: (primitive) => materials.some((pattern) => wildcard(pattern, primitive.getMaterial()?.getName() ?? "")) };
}

/** The share of a primitive's vertices simplifying keeps: its material's own (`materials`), or `ratio`. */
export function ratioOf(primitive, { ratio, materials = {} }) {
    const name = primitive.getMaterial()?.getName() ?? "";
    const own = Object.entries(materials).find(([pattern]) => wildcard(pattern, name));

    return own ? own[1] : ratio;
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
            throw new Error(`retarget[${i}] (${path.basename(spec.from)}): ${error.message}`, { cause: error });
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

    await dedupKeeping(document, config.apart);
    await document.transform(join({ keepMeshes: true }), resample({ tolerance: config.resample }), prune(), unpartition());

    if (root.listTextures().length < textures) {
        result.texturesMadeFactors = textures - root.listTextures().length;
    }

    if (Object.keys(config.clips.hold).length) {
        result.bonesHeld = holdBones(document, config.clips.hold);
        await document.transform(prune());
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

    // Where it can be walked, from its triangles as they are before they're simplified: as JSON,
    // and the same as a module a game can import (its default export), so it's there without a
    // download of its own wherever the game's code runs
    if (config.walk) {
        const file = glb.replace(/\.glb$/, ".walk.json");

        result.walk = { file, module: file.replace(/\.json$/, ".js"), ...walkOf(trianglesOf(document), config.walk) };

        // (And the top of its ground, its terrain's own triangles, where a game lays its own land
        // in their place: walk.ground)
        if (config.walk.ground) {
            const { materials, square } = config.walk.ground;

            const ground = surfaceOf(trianglesOf(document, { materials }), square, "highest");
            // (And the highest of all else over each of its patches: what stands on it, its castle,
            // its bridge, its rocks; NONE where nothing does)
            const over = surfaceOf(trianglesOf(document, { except: materials }), square, "highest", ground).heights;

            result.walk.ground = { materials, ...ground, over };
        }

        const json = JSON.stringify(walkJson({ ...result.walk, file: undefined, module: undefined }));

        await writeFile(file, json);
        await writeFile(result.walk.module, `// Where ${path.basename(glb, ".glb")} can be walked, baked by utilities/blenderpipeline (README, *Where it can be walked*)\nexport default ${json};\n`);
    }

    // (Cut into cells: where one cell meets the next, and one material another, kept where they
    // are as they're simplified, so no gap opens between them)
    const seams = config.cells ? seamsOf(document) : null;

    if (seams) {
        result.seams = seams.size;
    }

    // Lower-detail copies in this file, beside the full mesh, sharing everything else
    if (config.packLods) {
        for (const [i, lod] of config.lods.entries()) {
            const meshes = await packLod(document, i + 1, { ...lod, seams });

            result.lods.push({ packed: true, level: i + 1, ratio: lod.ratio, error: lod.error ?? 0.01, meshes: meshes.map((mesh) => mesh.getName()) });
        }
    }

    // (Cut into cells, all of it quantized on one grid, so where one cell meets the next is the
    // same point in both; its texture coordinates past 0 to 1 brought into it, so they're
    // quantized as the rest are. Both at 16 bits: what 14 or 12 would take anyway)
    const quantizing = {
        ...(config.cells ? { quantizationVolume: "scene", quantizePosition: 16 } : {}),
        ...(config.tiledTexcoords ? { quantizeTexcoord: 16 } : {}),
    };

    // (Lower-detail files are made from the mesh as Blender gave it, as packed ones are)
    const original = config.packLods || !config.lods.length ? null : cloneDocument(document);

    // The full mesh itself simplified, when even that's more than the game wants
    if (config.simplify) {
        simplifyFull(document, { ...config.simplify, seams });
    }

    // (Its rocks that touch nothing, as it's drawn, the full meshes and each lower detail packed
    // beside them: set down, or left out)
    if (config.seat) {
        result.seated = seat(document, seatingOf(config.seat));
    }

    // (After it's simplified, so every copy's texture coordinates are as made when they're weighed)
    if (config.tiledTexcoords && config.compress !== "none") {
        result.texcoordsTiled = tileTexcoords(document);
    }

    // (Tangents left out: Three.js works them out as it draws, from how the texture lies)
    if (!config.tangents) {
        for (const mesh of root.listMeshes()) {
            for (const primitive of mesh.listPrimitives()) {
                if (primitive.getAttribute("TANGENT")) {
                    primitive.setAttribute("TANGENT", null);
                    result.tangentsLeftOut = (result.tangentsLeftOut ?? 0) + 1;
                }
            }
        }

        await document.transform(prune());
    }

    // Checked before it's compressed: the validator can't read meshopt's compression
    result.validation = await validate(await io.writeBinary(document), { ktx2: config.textures.format === "ktx2" });

    for (const [i, lod] of (original ? config.lods : []).entries()) {
        const copy = cloneDocument(original);

        // (Some materials' parts by ratios of their own, or seams kept: each primitive on its own)
        if (lod.materials || seams) {
            for (const mesh of copy.getRoot().listMeshes()) {
                for (const primitive of mesh.listPrimitives()) {
                    simplifyKeeping(primitive, { ratio: ratioOf(primitive, lod), error: lod.error ?? 0.01, seams, permissive: lod.permissive ?? Boolean(seams) });
                }
            }

            await copy.transform(prune());
        } else {
            await copy.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: lod.error ?? 0.01 }), prune());
        }

        if (config.seat) {
            seat(copy, seatingOf(config.seat));
        }

        if (config.tiledTexcoords && config.compress !== "none") {
            tileTexcoords(copy);
        }

        await compress(copy, config.compress, quantizing);
        await io.write(lodFile(i + 1), copy);
        result.lods.push({ file: lodFile(i + 1), ratio: lod.ratio, error: lod.error ?? 0.01 });
    }

    await compress(document, config.compress, quantizing);
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

/** The full meshes (not the packed lower-detail ones) welded and simplified: { ratio, error, materials, seams }. */
function simplifyFull(document, { ratio, error = 0.01, materials, seams = null, permissive = false }) {
    for (const node of document.getRoot().listNodes()) {
        if (node.getMesh() && node.getExtras().lod === undefined) {
            for (const primitive of node.getMesh().listPrimitives()) {
                simplifyKeeping(primitive, { ratio: ratioOf(primitive, { ratio, materials }), error, seams, permissive });
            }
        }
    }
}

// A place, to the tenth of a millimetre, as a key
const placeKey = (array, i) => `${Math.round(array[i] * 1e4)} ${Math.round(array[i + 1] * 1e4)} ${Math.round(array[i + 2] * 1e4)}`;

/**
 * Where one of a document's full meshes meets another, or a primitive another (where one cell
 * meets the next, one material another): the places (placeKey's) a vertex of one has and a vertex
 * of another has too. Found by sorting every vertex by its place, so only those shared are kept.
 */
export function seamsOf(document) {
    const arrays = [];

    for (const node of document.getRoot().listNodes()) {
        if (node.getMesh() && node.getExtras().lod === undefined) {
            for (const primitive of node.getMesh().listPrimitives()) {
                const position = primitive.getAttribute("POSITION");

                if (position) {
                    arrays.push(position.getArray());
                }
            }
        }
    }

    const total = arrays.reduce((sum, array) => sum + array.length / 3, 0);
    const owner = new Uint32Array(total);
    const quantized = new Int32Array(total * 3);
    let n = 0;

    for (const [i, array] of arrays.entries()) {
        for (let v = 0; v < array.length; v += 3, n++) {
            owner[n] = i;
            quantized[n * 3] = Math.round(array[v] * 1e4);
            quantized[n * 3 + 1] = Math.round(array[v + 1] * 1e4);
            quantized[n * 3 + 2] = Math.round(array[v + 2] * 1e4);
        }
    }

    const order = new Uint32Array(total).map((_, i) => i);
    const same = (a, b) => quantized[a * 3] === quantized[b * 3] && quantized[a * 3 + 1] === quantized[b * 3 + 1] && quantized[a * 3 + 2] === quantized[b * 3 + 2];

    order.sort((a, b) => quantized[a * 3] - quantized[b * 3] || quantized[a * 3 + 1] - quantized[b * 3 + 1] || quantized[a * 3 + 2] - quantized[b * 3 + 2]);

    const seams = new Set();

    for (let i = 0; i < total; ) {
        let j = i + 1;

        while (j < total && same(order[i], order[j])) {
            j++;
        }

        // (More than one mesh or primitive has a vertex here)
        for (let k = i + 1; k < j; k++) {
            if (owner[order[k]] !== owner[order[i]]) {
                const v = order[i];

                seams.add(`${quantized[v * 3]} ${quantized[v * 3 + 1]} ${quantized[v * 3 + 2]}`);
                break;
            }
        }

        i = j;
    }

    return seams;
}

/**
 * A primitive welded and simplified as glTF-Transform's simplifyPrimitive does it, `ratio` of its
 * triangles kept, at most `error` astray; but with `seams` (seamsOf's), its vertices at those
 * places locked where they are, and its other edges free to move (meshopt's own LockBorder locks
 * every open edge, which a building's carving is full of). `permissive`: edges where its texture
 * coordinates or normals part (every corner of carved stone has them) may be collapsed too, as a
 * lower detail, seen from further off, can afford.
 */
export function simplifyKeeping(primitive, { ratio, error = 0.01, seams = null, permissive = false }) {
    weldPrimitive(primitive);

    if (!seams && !permissive) {
        return simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio, error });
    }

    if (primitive.getMode() !== 4 || !primitive.getIndices()) {
        return primitive;
    }

    const position = primitive.getAttribute("POSITION");
    const positions = position.getArray();
    const source = primitive.getIndices();
    const indices = new Uint32Array(source.getArray());
    const locks = new Uint8Array(position.getCount());

    for (let v = 0; seams && v < locks.length; v++) {
        locks[v] = seams.has(placeKey(positions, v * 3)) ? 1 : 0;
    }

    const target = Math.floor((ratio * indices.length) / 3) * 3;
    // (Collapsing across a seam, where the texture or the shading would move least: its texture
    // coordinates and normals weighed as it's simplified)
    const [attributes, stride, weights] = permissive ? seamAttributes(primitive) : [new Float32Array(0), 0, []];
    const [kept] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, stride, weights, locks, target, error, permissive ? ["Permissive"] : []);

    // (A small part simplified to nothing, a window's glass, say: kept as it is, rather than left
    // a primitive with no triangles, which meshopt's compression can't write)
    if (!kept.length) {
        return primitive;
    }
    primitive.setIndices(source.clone().setArray(kept));

    // (Its old indices let go of, if nothing else has them: the document's root aside)
    if (source.listParents().length === 1) {
        source.dispose();
    }

    compactPrimitive(primitive);

    if (primitive.getAttribute("POSITION").getCount() <= 65534) {
        primitive.getIndices().setArray(new Uint16Array(primitive.getIndices().getArray()));
    }

    return primitive;
}

// How much a texture coordinate moving by its whole span (one tile), and a normal turning right
// round, weigh against a vertex moving by the mesh's whole size, as a permissive simplify weighs
// collapsing a seam
const SEAM_WEIGHTS = { texcoord: 0.5, normal: 0.25 };

// A primitive's texture coordinates and normals, a vertex's after another's ([attributes, stride, weights])
function seamAttributes(primitive) {
    const count = primitive.getAttribute("POSITION").getCount();
    const uv = primitive.getAttribute("TEXCOORD_0");
    const normal = primitive.getAttribute("NORMAL");
    const stride = (uv ? 2 : 0) + (normal ? 3 : 0);
    const attributes = new Float32Array(count * stride);
    const element = [];

    for (let v = 0; v < count; v++) {
        let at = v * stride;

        if (uv) {
            uv.getElement(v, element);
            attributes[at++] = element[0];
            attributes[at++] = element[1];
        }

        if (normal) {
            normal.getElement(v, element);
            attributes[at++] = element[0];
            attributes[at++] = element[1];
            attributes[at] = element[2];
        }
    }

    return [attributes, stride, [...(uv ? [SEAM_WEIGHTS.texcoord, SEAM_WEIGHTS.texcoord] : []), ...(normal ? [SEAM_WEIGHTS.normal, SEAM_WEIGHTS.normal, SEAM_WEIGHTS.normal] : [])]];
}

async function compress(document, how, quantizing = {}) {
    if (how === "meshopt") {
        await document.transform(meshopt({ encoder: MeshoptEncoder, ...quantizing }));
    } else if (how === "quantize") {
        await document.transform(reorder({ encoder: MeshoptEncoder }), quantize(quantizing));
    }
}

/**
 * Texture coordinates past 0 to 1 (a texture tiled over a wall) brought into it, each material's
 * on its own, its textures given the offset and scale that put them back (KHR_texture_transform):
 * glTF-Transform quantizes only those within it, and keeps the rest as floats, twice the size.
 * Returns the materials whose were.
 */
function tileTexcoords(document) {
    const root = document.getRoot();
    const done = [];
    const byMaterial = new Map();

    for (const mesh of root.listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const material = primitive.getMaterial();
            const uv = primitive.getAttribute("TEXCOORD_0");

            // (Only where every texture reads the first set: a second set would need its own)
            if (material && uv && !primitive.getAttribute("TEXCOORD_1")) {
                byMaterial.set(material, [...(byMaterial.get(material) ?? []), uv]);
            }
        }
    }

    for (const [material, coordinates] of byMaterial) {
        const low = [Infinity, Infinity];
        const high = [-Infinity, -Infinity];

        for (const uv of new Set(coordinates)) {
            const [min, max] = [uv.getMin([]), uv.getMax([])];

            for (const axis of [0, 1]) {
                low[axis] = Math.min(low[axis], min[axis]);
                high[axis] = Math.max(high[axis], max[axis]);
            }
        }

        if (low.every((value) => value >= 0) && high.every((value) => value <= 1)) {
            continue;
        }

        // (Whole units off, so a tile's still where it was; and a span of at least one)
        const offset = low.map((value) => Math.floor(value));
        const scale = high.map((value, axis) => Math.max(1, Math.ceil(value - offset[axis])));
        const infos = textureInfosOf(material);

        // (A texture with its own transform already, or another material's texture coordinates
        // shared with this one: left as they are)
        if (!infos.length || infos.some((info) => info.getExtension("KHR_texture_transform"))) {
            continue;
        }

        const users = new Set(coordinates.flatMap((uv) => uv.listParents().filter((parent) => parent.propertyType === PropertyType.PRIMITIVE)));

        if ([...users].some((primitive) => primitive.getMaterial() !== material)) {
            continue;
        }

        for (const uv of new Set(coordinates)) {
            const array = uv.getArray();

            for (let i = 0; i < array.length; i += 2) {
                array[i] = (array[i] - offset[0]) / scale[0];
                array[i + 1] = (array[i + 1] - offset[1]) / scale[1];
            }

            uv.setArray(array);
        }

        const transforms = document.createExtension(KHRTextureTransform);

        for (const info of infos) {
            info.setExtension("KHR_texture_transform", transforms.createTransform().setOffset(offset).setScale(scale));
        }

        done.push({ material: material.getName(), offset, scale });
    }

    return done;
}

// A material's textures' infos (how each is read): colour, normals, occlusion, metal and roughness, glow
function textureInfosOf(material) {
    return [
        [material.getBaseColorTexture(), material.getBaseColorTextureInfo()],
        [material.getNormalTexture(), material.getNormalTextureInfo()],
        [material.getOcclusionTexture(), material.getOcclusionTextureInfo()],
        [material.getMetallicRoughnessTexture(), material.getMetallicRoughnessTextureInfo()],
        [material.getEmissiveTexture(), material.getEmissiveTextureInfo()],
    ]
        .filter(([texture, info]) => texture && info)
        .map(([, info]) => info);
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
