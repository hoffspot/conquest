// Motion capture: reading BVH files and glTF clips and playing them on our skeleton
// ("retargeting").
//
// A BVH file is a skeleton (joints, their offsets from their parents, in its own rest pose, often
// a T-pose) and frames of joint rotations; a glTF clip is keyframes for a skeleton's joints. Their
// skeleton isn't ours: different names, proportions and rest pose. Retargeting works bone by bone,
// in the world:
//
//  1. Pose the clip's skeleton for a frame and take each joint's turn from its rest pose in the
//     world, in our axes (y up, z forward).
//  2. Our bone points where its clip bone points: first the turn that lines our bone up with the
//     clip's bone at rest ("rest alignment"), then the clip bone's turn in the world.
//  3. Each bone's rotation relative to its parent becomes an anatomical joint rotation, which is
//     kept within the joint's range of motion (rig.js), like every other pose.
//
// The hips' height comes from the clip, scaled to our legs; the character is moved at the speed
// the clip's feet push the ground back, so feet don't slide.

import * as THREE from "three";
import { jointRotation, limitRotation } from "./rig.js";

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

/**
 * Our bones for the joints of Mesh2Motion's human skeleton (the Unreal mannequin's names, as in
 * Quaternius's Universal Animation Library): client/characters/animations/mesh2motion.glb.
 */
export const MESH2MOTION_NAMES = Object.freeze({
    Hips: "pelvis",
    Spine: "spine_01",
    Spine1: "spine_02",
    Spine2: "spine_03",
    Neck: "neck_01",
    Head: "head",
    ...Object.fromEntries(
        [["Left", "l"], ["Right", "r"]].flatMap(([side, s]) => [
            [`${side}Shoulder`, `clavicle_${s}`],
            [`${side}Arm`, `upperarm_${s}`],
            [`${side}ForeArm`, `lowerarm_${s}`],
            [`${side}Hand`, `hand_${s}`],
            ...["Thumb", "Index", "Middle", "Ring", "Pinky"].flatMap((finger) => [1, 2, 3].map((k) => [`${side}Hand${finger}${k}`, `${finger.toLowerCase()}_0${k}_${s}`])),
            [`${side}UpLeg`, `thigh_${s}`],
            [`${side}Leg`, `calf_${s}`],
            [`${side}Foot`, `foot_${s}`],
            [`${side}ToeBase`, `ball_${s}`],
        ]),
    ),
});

/**
 * The bones lined up with Mesh2Motion's at rest: its rest pose is a T-pose, ours has the arms
 * down, and the rest is just built differently (retarget's `match`).
 */
export const MESH2MOTION_MATCH = Object.freeze(["LeftArm", "LeftForeArm", "RightArm", "RightForeArm"]);

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

/** The rotation from the axes to a frame along `direction`, with `hinge` (made square to it) as y. */
function basis(direction, hinge) {
    const x = direction.clone().normalize();
    const y = hinge.clone().addScaledVector(x, -hinge.dot(x)).normalize();

    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y)));
}

/**
 * A parsed BVH clip as poses (see gltfPoses): MakeHuman's are z up, facing -y, and every joint's
 * rest rotation is none, so a joint's rotation in the world is its turn from rest.
 */
function bvhPoses(bvh) {
    const toOurs = (vector) => vector.clone().applyQuaternion(Z_UP);
    const ours = (pose) => ({
        rotations: pose.rotations.map((rotation) => Z_UP.clone().multiply(rotation).multiply(Z_UP.clone().invert())),
        positions: pose.positions.map(toOurs),
    });

    return {
        names: bvh.joints.map(({ name }) => name),
        parents: bvh.joints.map(({ parent }) => parent),
        ends: bvh.joints.map(({ end }) => (end ? toOurs(new THREE.Vector3(...end)) : null)),
        rest: ours(poseFrame(bvh, new Float32Array(bvh.frames[0].length))),
        poses: bvh.frames.map((frame) => ours(poseFrame(bvh, frame))),
        frameTime: bvh.frameTime,
        loop: true,
    };
}

/**
 * A glTF clip on its skeleton (`root`, from GLTFLoader, y up and facing +z as ours), sampled
 * `fps` times a second: { names, parents, rest: { positions }, poses: [{ rotations, positions }],
 * frameTime, loop }, each joint's turn from its rest pose and its place in the world. A looping
 * clip's last frame is its first, so it's left out; a clip played once keeps it.
 */
export function gltfPoses(root, clip, { fps = 30, loop = true } = {}) {
    const joints = [];

    root.traverse((node) => node !== root && joints.push(node));

    const index = new Map(joints.map((joint, j) => [joint, j]));
    const sample = () => {
        root.updateMatrixWorld(true);

        return joints.map((joint) => {
            const position = new THREE.Vector3();
            const rotation = new THREE.Quaternion();

            joint.matrixWorld.decompose(position, rotation, new THREE.Vector3());

            return { position, rotation };
        });
    };
    const rest = sample();
    const mixer = new THREE.AnimationMixer(root);

    // (Played once and held at its end, so its last frame isn't its first again)
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);

    action.clampWhenFinished = true;
    action.play();
    const count = Math.max(1, Math.round(clip.duration * fps));
    const poses = [];

    for (let f = 0; f < count + (loop ? 0 : 1); f++) {
        mixer.setTime(Math.min(clip.duration, f / fps));

        const pose = sample();

        poses.push({
            rotations: pose.map(({ rotation }, j) => rotation.multiply(rest[j].rotation.clone().invert())),
            positions: pose.map(({ position }) => position),
        });
    }

    action.stop();
    mixer.uncacheRoot(root);
    root.updateMatrixWorld(true);

    return {
        names: joints.map(({ name }) => name),
        parents: joints.map((joint) => index.get(joint.parent) ?? -1),
        ends: joints.map(() => null),
        rest: { positions: rest.map(({ position }) => position) },
        poses,
        frameTime: 1 / fps,
        loop,
    };
}

/**
 * Retarget a clip to a rig: a parsed BVH file, or poses (gltfPoses). Gives { frames: [{ rotations
 * (anatomical, per bone), height, forward, side }], frameTime, duration, loop, scale }: the
 * pelvis's height, and how far forward and to the side it is, from where it rests, scaled to our
 * legs. `names` maps our bones to the clip's joints; bones it leaves out keep the rig's current
 * rotation. `match`: the bones to line up with the clip's at rest (all of them, if not given).
 */
export function retarget(clip, rig, { names = MAKEHUMAN_NAMES, limit = true, match = null } = {}) {
    const source = clip.poses ? clip : bvhPoses(clip);
    const index = new Map(source.names.map((name, j) => [name, j]));
    const rest = source.rest.positions;

    // How much bigger our body is (by the height of the hips)
    const hips = index.get(names.Hips);
    const theirLeg = rest[hips].y - rest[index.get(names.LeftFoot)].y;
    const ourLeg = rig.heads[0].y - rig.heads[rig.index.get("LeftFoot")].y;
    const scale = ourLeg / theirLeg;

    // Rest alignment: the turn that lines our bone up with its clip bone at rest. A bone in
    // `match` (all, by default) is turned to point where the clip's does (where the rest poses
    // differ: a T-pose's arms out, ours down); any other turns with its parent, keeping our rest
    // pose's shape (where the skeletons are built differently: collarbones, a foot's pitch, a
    // relaxed hand)
    const children = new Map();

    source.parents.forEach((parent, j) => {
        if (parent >= 0 && !children.has(parent)) {
            children.set(parent, j);
        }
    });

    // Our bone's child that carries on from its tail (the neck from the chest, not a collarbone)
    const continuing = (b) => {
        let child = -1;

        rig.definition.forEach((bone, c) => {
            if (bone.parent === b && (child < 0 || rig.heads[c].distanceToSquared(rig.tails[b]) < rig.heads[child].distanceToSquared(rig.tails[b]))) {
                child = c;
            }
        });

        return child;
    };
    const ourDirectionOf = (b) => rig.tails[b].clone().sub(rig.heads[b]).normalize();

    // Which way our limb's middle joint (an elbow, a knee: `next`, below `b`) bends: as the rig
    // bends it (rig.js frames), not as our rest pose happens to (Vitruvian's forearm rests all but
    // straight, and the elbow's hinge from it came out 47° off, rolling every arm)
    const bentAt = (b, next) => {
        const { kind, side } = rig.joints[next];
        const local = rig.frames[b].clone().multiply(jointRotation(kind, side, { flex: 30 })).multiply(rig.frames[next].clone().invert());

        return ourDirectionOf(next).applyQuaternion(local);
    };

    // The clip bone's direction at rest: to the joint our bone's next maps to, or its first child
    const theirDirectionOf = (b) => {
        const j = index.get(names[rig.definition[b].name]);
        const next = continuing(b);
        const target = (next >= 0 ? index.get(names[rig.definition[next].name]) : undefined) ?? children.get(j);
        const direction = target !== undefined ? rest[target].clone().sub(rest[j]) : source.ends[j]?.clone();

        return direction && direction.lengthSq() > 1e-10 ? direction.normalize() : null;
    };

    const align = [];

    rig.definition.forEach(({ name, parent }, b) => {
        const inherited = parent >= 0 ? align[parent] : new THREE.Quaternion();
        const j = index.get(names[name]);

        align[b] = inherited.clone();

        if (j === undefined || name === "Hips" || (match && !match.includes(name))) {
            return;
        }

        const theirs = theirDirectionOf(b);

        if (!theirs) {
            return;
        }

        // The upper bone of a limb whose middle joint (an elbow) is lined up too is also turned
        // about itself so the joint bends about the same axis in both (bent at rest, however
        // little, both show it); the lower bone then only swings in that plane
        const next = continuing(b);
        const ours = ourDirectionOf(b).applyQuaternion(inherited);
        const theirNext = next >= 0 && match?.includes(rig.definition[next].name) ? theirDirectionOf(next) : null;
        const theirHinge = theirNext ? theirs.clone().cross(theirNext) : null;
        const ourNext = theirHinge ? (HINGED.has(rig.joints[next].kind) ? bentAt(b, next) : ourDirectionOf(next)).applyQuaternion(inherited) : null;
        const ourHinge = ourNext ? ours.clone().cross(ourNext) : null;

        if (theirHinge && theirHinge.lengthSq() > 1e-4 && ourHinge.lengthSq() > 1e-4) {
            align[b].premultiply(basis(theirs, theirHinge).multiply(basis(ours, ourHinge).invert()));
        } else {
            align[b].premultiply(new THREE.Quaternion().setFromUnitVectors(ours, theirs));
        }
    });

    const frames = source.poses.map((pose) => {
        const world = [];
        const rotations = rig.definition.map(({ name, parent }, b) => {
            const j = index.get(names[name]);

            // Our bone's rotation in the world (from its rest orientation)
            if (j === undefined) {
                world[b] = parent >= 0 ? world[parent].clone() : new THREE.Quaternion();

                return null;
            }

            world[b] = pose.rotations[j].clone().multiply(align[b]);

            // Relative to the parent, then into the anatomical frame, within the joint's range
            const local = parent >= 0 ? world[parent].clone().invert().multiply(world[b]) : world[b].clone();
            const anatomical = (parent >= 0 ? rig.frames[parent].clone().invert() : new THREE.Quaternion()).multiply(local).multiply(rig.frames[b]);
            const { kind, side } = rig.joints[b];

            return limit ? limitRotation(kind, side, anatomical) : anatomical;
        });
        const moved = pose.positions[hips].clone().sub(rest[hips]).multiplyScalar(scale);

        return { rotations, height: moved.y, forward: moved.z, side: moved.x };
    });

    return { frames, frameTime: source.frameTime, duration: (frames.length - (source.loop ? 0 : 1)) * source.frameTime, loop: source.loop, scale };
}

// The joints that bend one way only, about a hinge (an elbow, a knee)
const HINGED = new Set(["ForeArm", "Leg"]);

// A clip played once holds its last pose this long before it starts again
const HOLD = 1;

/**
 * Plays a retargeted clip on a character, looping (or once, then again after a pause). Given
 * `moves`, it's moved along as the clip's feet push; otherwise it stays where it is, its pelvis
 * going where the clip's does (swaying, stepping or falling down).
 */
export class ClipPlayer {
    constructor(character, clip, walker, { moves = true } = {}) {
        this.character = character;
        this.clip = clip;
        this.walker = walker;
        this.moves = moves;
        this.time = 0;
        this.speed = moves ? null : 0;
        this.ground = null;
    }

    /** Pose the character at the clip's time `t` (seconds). */
    poseAt(t) {
        const { frameTime, duration, loop } = this.clip;
        const rig = this.character.rig;
        const cycle = duration + HOLD;

        // Sit the lower foot on the ground: every frame of a clip that loops; one played once
        // (falling down, say) as it was in its first frame, so it can leave the ground
        if (!loop) {
            this.ground ??= this.#lowestFootAt(0);
        }

        this.#pose(loop ? t / frameTime : Math.min(((t % cycle) + cycle) % cycle, duration) / frameTime);
        rig.offset.y -= loop ? this.#lowestFoot() : this.ground;
        rig.apply();
        this.character.object.updateMatrixWorld(true);
    }

    // Pose the joints and pelvis at a frame (a fraction between two blends them)
    #pose(position) {
        const { frames, loop } = this.clip;
        const rig = this.character.rig;
        const at = loop ? ((position % frames.length) + frames.length) % frames.length : Math.min(position, frames.length - 1);
        const a = Math.floor(at);
        const b = loop ? (a + 1) % frames.length : Math.min(a + 1, frames.length - 1);
        const blend = at - a;
        const mix = (key) => frames[a][key] * (1 - blend) + frames[b][key] * blend;

        frames[a].rotations.forEach((rotation, i) => {
            if (rotation) {
                rig.rotations[i].slerpQuaternions(rotation, frames[b].rotations[i], blend);
            }
        });

        rig.offset.set(this.moves ? 0 : mix("side"), mix("height"), this.moves ? 0 : mix("forward"));
        rig.apply();
        this.character.object.updateMatrixWorld(true);
    }

    #lowestFoot() {
        return Math.min(this.walker.footHeight(0), this.walker.footHeight(1));
    }

    #lowestFootAt(position) {
        this.#pose(position);

        return this.#lowestFoot();
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
