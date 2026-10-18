// Clips from another skeleton's file played on this one (config `retarget`): a humanoid's walk on a
// demon, say, from a library of clips made for a skeleton with the same bones' names (Unreal's
// mannequin's, as Mesh2Motion's are). Bones are paired by name, or as `bones` renames them. Each
// of this skeleton's paired bones turns in the world as its pair turns from where that one rests,
// once it's laid the way its pair lies at rest: an A-pose's arm, down at an angle, is first raised
// out to the side as a T-pose's is, and then turned as that arm turns. Its own twist about that
// way, and so how its mesh lies on it, stays its own. Bones laid as they rest instead
// (`unaligned`) take only the turns: legs bent at rest stay bent, as far again as the other's
// bend.
//
// The hips (the topmost bone paired) are carried as the other's are, every distance scaled by how
// high each stands at the hips over its lowest bone, posed as the other rests; so its feet meet the
// ground where the other's do. Bones the other hasn't got (wings, a tail, a jaw) stay as they rest
// on their parents, for clips.invent to move. Only the skeleton's own bones move it: a clip that
// carries its armature as well (an object's keys left in by mistake) is read without them. Both
// face +z, with +y up, as the pipeline has every asset.

import { Matrix4, Quaternion, Vector3 } from "three";
import { channelsByNode, duration, worldMatrix } from "./animation.js";

const turnOf = (matrix) => new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix));
const placeOf = (matrix) => new Vector3().setFromMatrixPosition(matrix);
const sizeOf = (matrix) => new Vector3().setFromMatrixScale(matrix);

/** A document's bones: the joints of its skins, in its tree's order (parents first). */
function bonesOf(document) {
    const joints = new Set(document.getRoot().listSkins().flatMap((skin) => skin.listJoints()));
    const ordered = [];
    const visit = (node) => {
        if (joints.has(node)) {
            ordered.push(node);
        }

        node.listChildren().forEach(visit);
    };

    for (const scene of document.getRoot().listScenes()) {
        scene.listChildren().forEach(visit);
    }

    return ordered;
}

/**
 * Where each of the document's nodes is in the world (Map(node => Matrix4)) with its paired bones
 * turned in the world as `turn(pair)` has them and the hips at `hips` (a Vector3); every other
 * node as it rests on its parent.
 */
function pose(document, pairs, turn, hips) {
    const byNode = new Map(pairs.map((pair) => [pair.node, pair]));
    const world = new Map();
    const visit = (node, parent) => {
        const pair = byNode.get(node);
        const rest = new Matrix4().compose(new Vector3().fromArray(node.getTranslation()), new Quaternion().fromArray(node.getRotation()), new Vector3().fromArray(node.getScale()));
        let matrix = new Matrix4().multiplyMatrices(parent, rest);

        if (pair) {
            const place = pair === pairs[0] ? hips : placeOf(matrix);

            matrix = new Matrix4().compose(place, turn(pair), sizeOf(matrix));
        }

        world.set(node, matrix);

        for (const child of node.listChildren()) {
            visit(child, matrix);
        }
    };

    for (const scene of document.getRoot().listScenes()) {
        for (const node of scene.listChildren()) {
            visit(node, new Matrix4());
        }
    }

    return world;
}

/**
 * Adds clips from `source` (a glTF document) to `document`, played on its bones: `clips`: {
 * "the source's name": "the name here" }; `bones`: { "a bone here": "the source's bone" (or null,
 * left out) }, where the names differ; `unaligned(name)`: whether a bone takes the turns without
 * first being laid as its pair rests; `fps`: keyframes a second. Returns { bones (the names
 * paired), hips, scale (of distances), clips: [{ from, name, seconds }] }.
 */
export function retargetClips(document, source, { clips, bones = {}, unaligned = () => false, fps = 30 }) {
    const root = document.getRoot();
    const sourceBones = new Map(bonesOf(source).map((node) => [node.getName(), node]));

    if (!sourceBones.size) {
        throw new Error("its file has no skeleton (no skin) to take clips from");
    }

    // Each bone here with its pair, parents first (the first, the topmost: the hips)
    const pairs = bonesOf(document)
        .map((node) => ({ node, from: sourceBones.get(node.getName() in bones ? bones[node.getName()] : node.getName()) }))
        .filter((pair) => pair.from);

    if (!pairs.length) {
        throw new Error(`no bones here have the names of its (${[...sourceBones.keys()].slice(0, 6).join(", ")}...): bones pairs them by name`);
    }

    const paired = new Map(pairs.map((pair) => [pair.node, pair]));
    const pairedParent = (node) => {
        for (let up = node.getParentNode(); up; up = up.getParentNode()) {
            if (paired.has(up)) {
                return paired.get(up);
            }
        }

        return null;
    };
    const sourceCache = new Map();
    const cache = new Map();

    for (const pair of pairs) {
        pair.rest = worldMatrix(pair.node, null, 0, cache);
        pair.sourceRest = worldMatrix(pair.from, null, 0, sourceCache);
        pair.unturn = turnOf(pair.sourceRest).invert();
    }

    // How each is laid as its pair rests: turned from the way it points (towards the bones paired
    // below it, together) to the way its pair points; one with none below it, as its parent is
    for (const pair of pairs) {
        const below = pairs.filter((other) => pairedParent(other.node) === pair);
        const here = new Vector3();
        const there = new Vector3();

        for (const other of below) {
            here.add(placeOf(other.rest).sub(placeOf(pair.rest)).normalize());
            there.add(placeOf(other.sourceRest).sub(placeOf(pair.sourceRest)).normalize());
        }

        if (unaligned(pair.node.getName())) {
            pair.lay = new Quaternion();
        } else if (below.length && here.lengthSq() > 1e-8 && there.lengthSq() > 1e-8) {
            pair.lay = new Quaternion().setFromUnitVectors(here.normalize(), there.normalize());
        } else {
            pair.lay = pairedParent(pair.node)?.lay.clone() ?? new Quaternion();
        }

        pair.laid = pair.lay.clone().multiply(turnOf(pair.rest));
    }

    // Heights at the hips over the lowest bone: the source's at rest, this one's laid as it rests
    // (or, where the hips are the lowest, a crawler's, how far its bones reach from them)
    const hips = pairs[0];
    const laid = pose(document, pairs, (pair) => pair.laid, placeOf(hips.rest));
    const laidPlaces = pairs.map((pair) => placeOf(laid.get(pair.node)));
    const sourcePlaces = pairs.map((pair) => placeOf(pair.sourceRest));
    const lowest = (places) => Math.min(...places.map((place) => place.y));
    const reach = (places) => Math.max(...places.map((place) => place.distanceTo(places[0])));
    const height = laidPlaces[0].y - lowest(laidPlaces);
    const sourceHeight = sourcePlaces[0].y - lowest(sourcePlaces);
    const ratio = height > 1e-6 && sourceHeight > 1e-6 ? height / sourceHeight : reach(laidPlaces) / reach(sourcePlaces);
    const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    const ground = lowest(pairs.map((pair) => placeOf(pair.rest)));
    const sourceHips = sourcePlaces[0];
    const restHips = placeOf(hips.rest);
    const sourceJoints = new Set(sourceBones.values());
    const buffer = root.listBuffers()[0] ?? document.createBuffer();
    const made = [];

    for (const [from, name] of Object.entries(clips)) {
        const animation = source.getRoot().listAnimations().find((one) => one.getName() === from);

        if (!animation) {
            throw new Error(`its file has no clip ${from} (it has ${source.getRoot().listAnimations().map((one) => one.getName()).join(", ")})`);
        }

        if (root.listAnimations().some((one) => one.getName() === name)) {
            throw new Error(`there's a clip ${name} already`);
        }

        const moving = new Map([...channelsByNode(animation)].filter(([node]) => sourceJoints.has(node)));
        const seconds = duration(animation);
        const count = seconds > 0 ? Math.max(2, Math.round(seconds * fps) + 1) : 1;
        const times = Array.from({ length: count }, (_, i) => (count > 1 ? (i * seconds) / (count - 1) : 0));
        const turns = new Map(pairs.map((pair) => [pair, []]));
        const places = [];

        for (const time of times) {
            const sourceWorld = new Map();
            const turned = new Map(pairs.map((pair) => [pair, turnOf(worldMatrix(pair.from, moving, time, sourceWorld)).multiply(pair.unturn).multiply(pair.laid)]));
            const at = placeOf(worldMatrix(hips.from, moving, time, sourceWorld));
            const place = new Vector3(restHips.x + (at.x - sourceHips.x) * scale, ground + height + (at.y - sourceHips.y) * scale, restHips.z + (at.z - sourceHips.z) * scale);
            const world = pose(document, pairs, (pair) => turned.get(pair), place);
            const parentOf = (pair) => world.get(pair.node.getParentNode()) ?? new Matrix4();

            for (const pair of pairs) {
                const local = turnOf(parentOf(pair)).invert().multiply(turned.get(pair)).normalize();
                const keys = turns.get(pair);
                const last = keys.length - 4;

                // (Each the same way round as the one before, so they're eased between the short way)
                if (last >= 0 && local.x * keys[last] + local.y * keys[last + 1] + local.z * keys[last + 2] + local.w * keys[last + 3] < 0) {
                    local.set(-local.x, -local.y, -local.z, -local.w);
                }

                keys.push(...local.toArray());
            }

            places.push(...place.applyMatrix4(parentOf(hips).clone().invert()).toArray());
        }

        const clip = document.createAnimation(name);
        const input = document.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
        const channel = (node, path, values) => {
            const sampler = document
                .createAnimationSampler()
                .setInput(input)
                .setOutput(document.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(values)).setBuffer(buffer))
                .setInterpolation("LINEAR");

            clip.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
        };

        for (const pair of pairs) {
            channel(pair.node, "rotation", turns.get(pair));
        }

        channel(hips.node, "translation", places);
        made.push({ from, name, seconds: Math.round(seconds * 1000) / 1000 });
    }

    return { bones: pairs.map((pair) => pair.node.getName()), hips: hips.node.getName(), scale, clips: made };
}
