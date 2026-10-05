// Reading a glTF document's animations as Three.js would play them: a node's transform at any
// moment of a clip, where it is in the world, where a skinned mesh's vertices are; and from that,
// how far a clip carries the creature (root motion), taking that out (playing it in place),
// whether it loops, and how far out of its rest pose it ever reaches.

import { Matrix3, Matrix4, Quaternion, Vector3 } from "three";

const _a = new Quaternion();
const _b = new Quaternion();

/** Where `time` falls among a sampler's keyframe times: [index before, share of the way on]. */
function locate(times, time) {
    const last = times.length - 1;

    if (time <= times[0] || last === 0) {
        return [0, 0];
    }

    if (time >= times[last]) {
        return [last, 0];
    }

    let low = 0;
    let high = last;

    while (high - low > 1) {
        const middle = (low + high) >> 1;

        if (times[middle] <= time) {
            low = middle;
        } else {
            high = middle;
        }
    }

    return [low, (time - times[low]) / (times[low + 1] - times[low])];
}

/** A channel's value at `time` (seconds), as an array. */
export function sampleChannel(channel, time) {
    const sampler = channel.getSampler();
    const times = sampler.getInput().getArray();
    const output = sampler.getOutput();
    const size = output.getElementSize();
    const mode = sampler.getInterpolation();
    const value = (index, part = 0) => output.getElement(mode === "CUBICSPLINE" ? index * 3 + part : index, new Array(size));
    const [index, share] = locate(times, time);
    const path = channel.getTargetPath();

    if (mode === "STEP" || share === 0) {
        return value(index, 1);
    }

    if (mode === "CUBICSPLINE") {
        const span = times[index + 1] - times[index];
        const [p0, m0, p1, m1] = [value(index, 1), value(index, 2), value(index + 1, 1), value(index + 1, 0)];
        const t = share;
        const t2 = t * t;
        const t3 = t2 * t;
        const result = p0.map((_, i) => (2 * t3 - 3 * t2 + 1) * p0[i] + (t3 - 2 * t2 + t) * span * m0[i] + (-2 * t3 + 3 * t2) * p1[i] + (t3 - t2) * span * m1[i]);

        return path === "rotation" ? _a.fromArray(result).normalize().toArray() : result;
    }

    const from = value(index);
    const to = value(index + 1);

    if (path === "rotation") {
        return _a.fromArray(from).slerp(_b.fromArray(to), share).toArray();
    }

    return from.map((v, i) => v + (to[i] - v) * share);
}

/** The channels of a clip by the node they move: Map(node => { translation, rotation, scale }). */
export function channelsByNode(animation) {
    const byNode = new Map();

    for (const channel of animation?.listChannels() ?? []) {
        const node = channel.getTargetNode();

        if (node && channel.getSampler()) {
            byNode.set(node, { ...byNode.get(node), [channel.getTargetPath()]: channel });
        }
    }

    return byNode;
}

/** How long a clip lasts (seconds): its last keyframe. */
export function duration(animation) {
    let end = 0;

    for (const channel of animation.listChannels()) {
        const times = channel.getSampler()?.getInput()?.getArray();

        if (times?.length) {
            end = Math.max(end, times[times.length - 1]);
        }
    }

    return end;
}

/** A node's own transform at a moment of a clip (or at rest, with no clip). */
export function localMatrix(node, byNode, time, target = new Matrix4()) {
    const moving = byNode?.get(node) ?? {};
    const t = moving.translation ? sampleChannel(moving.translation, time) : node.getTranslation();
    const r = moving.rotation ? sampleChannel(moving.rotation, time) : node.getRotation();
    const s = moving.scale ? sampleChannel(moving.scale, time) : node.getScale();

    return target.compose(new Vector3().fromArray(t), new Quaternion().fromArray(r), new Vector3().fromArray(s));
}

/** A node's transform in the world at a moment of a clip, through its parents. */
export function worldMatrix(node, byNode, time, cache = new Map()) {
    if (cache.has(node)) {
        return cache.get(node);
    }

    const local = localMatrix(node, byNode, time);
    const parent = node.getParentNode();
    const world = parent ? new Matrix4().multiplyMatrices(worldMatrix(parent, byNode, time, cache), local) : local;

    cache.set(node, world);

    return world;
}

/**
 * The mesh nodes in a document with where each one's vertices are in the world at a moment of a
 * clip (or at rest): calls `visit(x, y, z)` for every `stride`th vertex, skinned as Three.js
 * skins it (a skinned mesh's own node's transform ignored, as glTF says).
 */
export function visitVertices(document, visit, { animation = null, time = 0, stride = 1 } = {}) {
    const byNode = channelsByNode(animation);
    const cache = new Map();
    const point = new Vector3();
    const sum = new Vector3();
    const part = new Vector3();

    for (const node of document.getRoot().listNodes()) {
        const mesh = node.getMesh();

        if (!mesh) {
            continue;
        }

        const skin = node.getSkin();
        const joints = skin?.listJoints() ?? [];
        const matrices = joints.map((joint, i) => {
            const inverse = new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i, new Array(16)));

            return new Matrix4().multiplyMatrices(worldMatrix(joint, byNode, time, cache), inverse);
        });
        const world = worldMatrix(node, byNode, time, cache);

        for (const primitive of mesh.listPrimitives()) {
            const position = primitive.getAttribute("POSITION");
            const jointsOf = primitive.getAttribute("JOINTS_0");
            const weightsOf = primitive.getAttribute("WEIGHTS_0");
            const which = [0, 0, 0, 0];
            const weight = [0, 0, 0, 0];

            for (let i = 0; i < position.getCount(); i += stride) {
                point.fromArray(position.getElement(i, [0, 0, 0]));

                if (skin && jointsOf && weightsOf) {
                    jointsOf.getElement(i, which);
                    weightsOf.getElement(i, weight);
                    sum.set(0, 0, 0);

                    for (let k = 0; k < 4; k++) {
                        if (weight[k] > 0) {
                            sum.add(part.copy(point).applyMatrix4(matrices[which[k]]).multiplyScalar(weight[k]));
                        }
                    }

                    point.copy(sum);
                } else {
                    point.applyMatrix4(world);
                }

                visit(point.x, point.y, point.z);
            }
        }
    }
}

/** The box round every vertex at a moment of a clip (or at rest): { min, max, size }. */
export function bounds(document, options) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    visitVertices(
        document,
        (x, y, z) => {
            min[0] = Math.min(min[0], x);
            min[1] = Math.min(min[1], y);
            min[2] = Math.min(min[2], z);
            max[0] = Math.max(max[0], x);
            max[1] = Math.max(max[1], y);
            max[2] = Math.max(max[2], z);
        },
        options,
    );

    return { min, max, size: max.map((v, i) => v - min[i]) };
}

/** The skin's joints that have no joint over them. */
function skeletonRoots(skin) {
    const joints = new Set(skin.listJoints());

    return skin.listJoints().filter((joint) => !joints.has(joint.getParentNode()));
}

/** Whether a node's channels in a clip stay as they are all the way through. */
function holdsStill(channels, end) {
    for (const channel of Object.values(channels ?? {})) {
        const first = sampleChannel(channel, 0);

        for (let k = 1; k <= 8; k++) {
            if (sampleChannel(channel, (end * k) / 8).some((v, i) => Math.abs(v - first[i]) > 1e-4)) {
                return false;
            }
        }
    }

    return true;
}

/** Where a node is in the world at a moment of a clip. */
function position(node, byNode, time) {
    return new Vector3().setFromMatrixPosition(worldMatrix(node, byNode, time));
}

/**
 * The bone that carries a clip's travel, and how far it goes: { bone, distance (metres across
 * the ground, start to end), speed (metres a second), direction ([x, z], or null) }. The bone is
 * `rootBone` if named, else the topmost moving bone (the first, from the skeleton's root down,
 * whose translation carries it more than a millimetre across the ground).
 */
export function rootMotion(document, animation, { rootBone = null } = {}) {
    const skin = document.getRoot().listSkins()[0];

    if (!skin) {
        return null;
    }

    const byNode = channelsByNode(animation);
    const end = duration(animation);
    const travel = (bone) => {
        const from = position(bone, byNode, 0);
        const to = position(bone, byNode, end);

        return new Vector3(to.x - from.x, 0, to.z - from.z);
    };
    let bone = null;

    if (rootBone) {
        bone = skin.listJoints().find((joint) => joint.getName() === rootBone);

        if (!bone) {
            throw new Error(`clips.rootBone: no bone ${rootBone} (bones: ${skin.listJoints().slice(0, 12).map((joint) => joint.getName()).join(", ")}...)`);
        }
    } else {
        // Breadth first from the skeleton's roots, down through bones that hold still: the
        // topmost that's carried across the ground (not a bone swung by a turning parent)
        const queue = skeletonRoots(skin);
        const joints = new Set(skin.listJoints());

        while (queue.length && !bone) {
            const joint = queue.shift();

            if (byNode.get(joint)?.translation && travel(joint).length() > 1e-3) {
                bone = joint;
            } else if (holdsStill(byNode.get(joint), end)) {
                queue.push(...joint.listChildren().filter((child) => joints.has(child)));
            }
        }

        bone ??= skeletonRoots(skin)[0];
    }

    const moved = travel(bone);
    const distance = moved.length();

    return {
        bone: bone.getName(),
        distance,
        speed: end > 0 ? distance / end : 0,
        direction: distance > 1e-6 ? [moved.x / distance, moved.z / distance] : null,
    };
}

/**
 * Takes a clip's travel across the ground out of its root bone (rootMotion), so it plays in
 * place: the bone's drift from start to end, spread evenly over the clip, is taken off each of
 * its keyframes (its sway and bounce stay). Returns what was taken out (rootMotion), or null.
 */
export function playInPlace(document, animation, options) {
    const motion = rootMotion(document, animation, options);

    if (!motion || motion.distance < 1e-6) {
        return motion;
    }

    const byNode = channelsByNode(animation);
    const bone = document.getRoot().listNodes().find((node) => node.getName() === motion.bone && byNode.get(node)?.translation);
    const channel = byNode.get(bone)?.translation;

    if (!channel) {
        return motion;
    }

    const sampler = channel.getSampler();
    const times = sampler.getInput().getArray();
    const end = duration(animation);
    let output = sampler.getOutput();

    // (Its own copy, if anything else shares it)
    if (output.listParents().filter((parent) => parent.propertyType === "AnimationSampler").length > 1) {
        output = output.clone();
        sampler.setOutput(output);
    }

    const values = Float32Array.from(output.getArray());
    const cubic = sampler.getInterpolation() === "CUBICSPLINE";
    const drift = new Vector3(motion.direction[0] * motion.distance, 0, motion.direction[1] * motion.distance);
    const parent = bone.getParentNode();
    const toParent = new Matrix3();

    for (let k = 0; k < times.length; k++) {
        // The drift so far, in the world, turned into the bone's parent's space
        toParent.setFromMatrix4(parent ? worldMatrix(parent, byNode, times[k]) : new Matrix4()).invert();

        const local = drift.clone().multiplyScalar(end > 0 ? times[k] / end : 0).applyMatrix3(toParent);
        const at = (cubic ? k * 3 + 1 : k) * 3;

        values[at] -= local.x;
        values[at + 1] -= local.y;
        values[at + 2] -= local.z;
    }

    output.setArray(values);

    return motion;
}

/**
 * Whether a clip ends as it starts, so it can play round and round: every channel's value at its
 * end within `tolerance` of its start (rotations within about a degree), the root bone's travel
 * across the ground aside.
 */
export function loops(document, animation, { tolerance = 0.01, rootBone = null } = {}) {
    const end = duration(animation);

    if (end <= 0) {
        return false;
    }

    const motion = rootMotion(document, animation, { rootBone });

    for (const channel of animation.listChannels()) {
        const path = channel.getTargetPath();
        const start = sampleChannel(channel, 0);
        const finish = sampleChannel(channel, end);

        if (path === "rotation") {
            const dot = Math.abs(start.reduce((sum, v, i) => sum + v * finish[i], 0));

            if (dot < 0.9998) {
                return false;
            }
        } else if (path === "translation" && motion && channel.getTargetNode().getName() === motion.bone && motion.distance > 1e-6) {
            // (Only its height: its travel across is root motion)
            const parent = channel.getTargetNode().getParentNode();
            const world = parent ? worldMatrix(parent, channelsByNode(animation), end) : new Matrix4();
            const a = new Vector3().fromArray(start).applyMatrix4(world);
            const b = new Vector3().fromArray(finish).applyMatrix4(world);

            if (Math.abs(a.y - b.y) > tolerance) {
                return false;
            }
        } else if (start.some((v, i) => Math.abs(v - finish[i]) > tolerance)) {
            return false;
        }
    }

    return true;
}
