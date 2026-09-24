// Motion capture: reading BVH files and playing them on our skeleton ("retargeting").
//
// A BVH file is a skeleton (joints, their offsets from their parents, in its own rest pose, often
// a T-pose) and frames of joint rotations. Its skeleton isn't ours: different names, proportions
// and rest pose. Retargeting works bone by bone, in the world:
//
//  1. Pose the BVH skeleton for a frame and take each joint's rotation in the world, turned into
//     our axes (y up, z forward).
//  2. Our bone points where its BVH bone points: first the turn that lines our bone up with the
//     BVH bone at rest ("rest alignment"), then the BVH bone's rotation in the world.
//  3. Each bone's rotation relative to its parent becomes an anatomical joint rotation, which is
//     kept within the joint's range of motion (rig.js), like every other pose.
//
// The hips' height comes from the clip, scaled to our legs; the character is moved at the speed
// the clip's feet push the ground back, so feet don't slide.

import * as THREE from "three";
import { limitRotation } from "./rig.js";

/** Our bones for the joints of MakeHuman's own BVH skeleton (data/animations in MakeHuman 1.1). */
export const MAKEHUMAN_NAMES = Object.freeze({
    Hips: "Hips",
    Spine: "Spine1",
    Spine1: "Spine2",
    Spine2: "Spine3",
    Neck: "Neck",
    Head: "Head",
    LeftShoulder: "Clavicle_L",
    LeftArm: "UpArm_L",
    LeftForeArm: "LoArm_L",
    LeftHand: "Hand_L",
    RightShoulder: "Clavicle_R",
    RightArm: "UpArm_R",
    RightForeArm: "LoArm_R",
    RightHand: "Hand_R",
    LeftUpLeg: "UpLeg_L",
    LeftLeg: "LoLeg_L",
    LeftFoot: "Foot_L",
    LeftToeBase: "Toe_L",
    RightUpLeg: "UpLeg_R",
    RightLeg: "LoLeg_R",
    RightFoot: "Foot_R",
    RightToeBase: "Toe_R",
});

/** Parse a BVH file: { joints: [{ name, parent, offset, channels, end }], frames, frameTime }. */
export function parseBVH(text) {
    const tokens = text.split(/\s+/).filter(Boolean);
    const joints = [];
    const stack = [];
    let i = 0;
    let current = null;

    while (i < tokens.length && tokens[i] !== "MOTION") {
        const token = tokens[i++];

        if (token === "ROOT" || token === "JOINT") {
            current = { name: tokens[i++], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [], end: null };
            joints.push(current);
        } else if (token === "End") {
            i++; // "Site"
            current = { site: true, parent: stack[stack.length - 1] };
        } else if (token === "{") {
            stack.push(current.site ? -2 : joints.indexOf(current));
        } else if (token === "}") {
            stack.pop();
            current = null;
        } else if (token === "OFFSET") {
            const offset = [Number(tokens[i]), Number(tokens[i + 1]), Number(tokens[i + 2])];

            i += 3;

            if (current.site) {
                joints[current.parent].end = offset;
            } else {
                current.offset = offset;
            }
        } else if (token === "CHANNELS") {
            const count = Number(tokens[i++]);

            current.channels = tokens.slice(i, i + count);
            i += count;
        }
    }

    // MOTION, Frames: n, Frame Time: t, then the numbers
    i++;

    const frameCount = Number(tokens[i + 1]);
    const frameTime = Number(tokens[i + 4]);

    i += 5;

    const width = joints.reduce((sum, joint) => sum + joint.channels.length, 0);
    const frames = [];

    for (let f = 0; f < frameCount; f++) {
        frames.push(Float32Array.from(tokens.slice(i + f * width, i + (f + 1) * width), Number));
    }

    return { joints, frames, frameTime };
}

// From z-up (MakeHuman's Blender axes, facing -y) to ours (y up, facing +z): -90 degrees about x
const Z_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const DEG = Math.PI / 180;

/** A BVH frame's joint rotations and positions in the world (BVH axes). */
function poseFrame(bvh, frame) {
    const rotations = [];
    const positions = [];
    const axis = { Xrotation: new THREE.Vector3(1, 0, 0), Yrotation: new THREE.Vector3(0, 1, 0), Zrotation: new THREE.Vector3(0, 0, 1) };
    const turn = new THREE.Quaternion();
    let at = 0;

    bvh.joints.forEach((joint, j) => {
        const local = new THREE.Quaternion();
        const offset = new THREE.Vector3(...joint.offset);

        for (const channel of joint.channels) {
            const value = frame[at++];

            if (axis[channel]) {
                local.multiply(turn.setFromAxisAngle(axis[channel], value * DEG));
            } else if (channel === "Xposition") {
                offset.x += value;
            } else if (channel === "Yposition") {
                offset.y += value;
            } else if (channel === "Zposition") {
                offset.z += value;
            }
        }

        if (joint.parent < 0) {
            rotations[j] = local;
            positions[j] = offset;
        } else {
            rotations[j] = rotations[joint.parent].clone().multiply(local);
            positions[j] = positions[joint.parent].clone().add(offset.applyQuaternion(rotations[joint.parent]));
        }
    });

    return { rotations, positions };
}

/**
 * Retarget a parsed BVH clip to a rig: { frames: [{ rotations (anatomical, per bone), height }],
 * frameTime, duration }. `names` maps our bones to the BVH's joints; bones it leaves out (the
 * fingers) keep the rig's current rotation.
 */
export function retarget(bvh, rig, { names = MAKEHUMAN_NAMES, limit = true } = {}) {
    const index = new Map(bvh.joints.map((joint, j) => [joint.name, j]));
    const rest = poseFrame(bvh, new Float32Array(bvh.frames[0].length));
    const toOurs = (vector) => vector.clone().applyQuaternion(Z_UP);

    // How much bigger our body is (by the height of the hips)
    const hips = index.get(names.Hips);
    const bvhFoot = index.get(names.LeftFoot);
    const bvhLeg = toOurs(rest.positions[hips]).y - toOurs(rest.positions[bvhFoot]).y;
    const ourLeg = rig.heads[0].y - rig.heads[rig.index.get("LeftFoot")].y;
    const scale = ourLeg / bvhLeg;

    // Rest alignment: the turn from our bone's rest direction to its BVH bone's
    const children = new Map();

    bvh.joints.forEach((joint, j) => {
        if (joint.parent >= 0 && !children.has(joint.parent)) {
            children.set(joint.parent, j);
        }
    });

    const align = rig.definition.map(({ name }, b) => {
        const j = index.get(names[name]);

        if (j === undefined || name === "Hips") {
            return new THREE.Quaternion();
        }

        // The BVH bone's direction: to the joint our bone's tail maps to, or its first child
        const ourChild = rig.definition.findIndex(({ parent }) => parent === b);
        const mappedChild = ourChild >= 0 ? index.get(names[rig.definition[ourChild].name]) : undefined;
        const target = mappedChild ?? children.get(j);
        const bvhDirection = target !== undefined ? toOurs(rest.positions[target].clone().sub(rest.positions[j])) : bvh.joints[j].end ? toOurs(new THREE.Vector3(...bvh.joints[j].end)) : null;
        const ourDirection = rig.tails[b].clone().sub(rig.heads[b]);

        if (!bvhDirection || bvhDirection.lengthSq() < 1e-10) {
            return new THREE.Quaternion();
        }

        return new THREE.Quaternion().setFromUnitVectors(ourDirection.normalize(), bvhDirection.normalize());
    });

    const restHeight = toOurs(rest.positions[hips]).y;
    const frames = bvh.frames.map((frame) => {
        const pose = poseFrame(bvh, frame);
        const world = [];
        const rotations = rig.definition.map(({ name, parent }, b) => {
            const j = index.get(names[name]);

            // Our bone's rotation in the world (from its rest orientation)
            if (j === undefined) {
                world[b] = parent >= 0 ? world[parent].clone() : new THREE.Quaternion();
            } else {
                world[b] = Z_UP.clone().multiply(pose.rotations[j]).multiply(Z_UP.clone().invert()).multiply(align[b]);
            }

            if (j === undefined) {
                return null;
            }

            // Relative to the parent, then into the anatomical frame, within the joint's range
            const local = parent >= 0 ? world[parent].clone().invert().multiply(world[b]) : world[b].clone();
            const anatomical = (parent >= 0 ? rig.frames[parent].clone().invert() : new THREE.Quaternion()).multiply(local).multiply(rig.frames[b]);
            const { kind, side } = rig.joints[b];

            return limit ? limitRotation(kind, side, anatomical) : anatomical;
        });
        const root = toOurs(pose.positions[hips]);

        return { rotations, height: (root.y - restHeight) * scale, forward: root.z * scale };
    });

    return { frames, frameTime: bvh.frameTime, duration: frames.length * bvh.frameTime, scale };
}

/** Plays a retargeted clip on a character, looping, moving it along as its feet push. */
export class ClipPlayer {
    constructor(character, clip, walker) {
        this.character = character;
        this.clip = clip;
        this.walker = walker;
        this.time = 0;
        this.speed = null;
    }

    /** Pose the character at the clip's time `t` (seconds, looping). */
    poseAt(t) {
        const { frames, frameTime } = this.clip;
        const rig = this.character.rig;
        const position = (((t / frameTime) % frames.length) + frames.length) % frames.length;
        const a = Math.floor(position);
        const b = (a + 1) % frames.length;
        const blend = position - a;

        frames[a].rotations.forEach((rotation, i) => {
            if (rotation) {
                rig.rotations[i].slerpQuaternions(rotation, frames[b].rotations[i], blend);
            }
        });

        rig.offset.set(0, frames[a].height * (1 - blend) + frames[b].height * blend, 0);
        rig.apply();
        this.character.object.updateMatrixWorld(true);

        // Sit the lower foot on the ground
        rig.offset.y -= Math.min(this.walker.footHeight(0), this.walker.footHeight(1));
        rig.apply();
        this.character.object.updateMatrixWorld(true);
    }

    /** How fast the clip's planted foot pushes back (so how fast to move to keep it planted). */
    #measureSpeed() {
        const { frames, frameTime } = this.clip;
        const object = this.character.object;
        const saved = object.matrixWorld.clone();
        let travelled = 0;
        let previous = null;

        object.updateMatrixWorld(true);

        for (let f = 0; f <= frames.length; f++) {
            this.character.rig.reset();
            this.poseAt(f * frameTime);

            const feet = [0, 1].map((i) => ({ height: this.walker.footHeight(i), z: object.worldToLocal(this.walker.footPoint(i)).z }));
            const planted = feet[0].height <= feet[1].height ? 0 : 1;

            if (previous && previous.planted === planted) {
                travelled += previous.z - feet[planted].z;
            }

            previous = { planted, z: feet[planted].z };
        }

        object.matrixWorld.copy(saved);

        return Math.max(0, travelled / (frames.length * frameTime));
    }

    update(dt) {
        this.speed ??= this.#measureSpeed();
        this.time += dt;
        this.character.rig.reset();
        this.walker.relaxHands();
        this.poseAt(this.time);
        this.character.object.translateZ(this.speed * dt);
        this.character.object.updateMatrixWorld(true);
    }
}
