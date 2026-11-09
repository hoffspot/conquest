// A rider on a horse (core/mounts.js; world/mounts3d.js): the rider's clips (the catalog's
// beast-horse-rider: Malbers Animations' rider on its horse, getting up and down from either side,
// riding each of the horse's gaits, flinching and thrown) put on a character's own body, retargeted
// (bvh.js), as the horse's own clips play: its joints the clips', its pelvis where the clips have
// it over the horse, whoever's riding and whatever their size (their legs as long as they are).

import * as THREE from "three";
import { gltfPoses, MESH2MOTION_MATCH, MESH2MOTION_NAMES, retarget } from "./bvh.js";
import { powerGrip } from "./grip.js";

/** The catalog's model the rider's clips are in (bones and clips only: no body of its own). */
export const RIDER_CLIPS = "beast-horse-rider";

/** The rider's clips played once and held at their end (the rest loop, as the horse's do). */
const ONCE = new Set(["Mount Left", "Mount Right", "Dismount Left", "Dismount Right", "Fall", "Death", "Death 2", "Death Gallop", "Hit Left", "Hit Right", "Hit Front Left", "Hit Front Right", "Rear", "Jump"]);

/**
 * Where the rider's clips have them (metres, in the horse's frame: its feet's middle, y up, facing
 * +z): getting up and down, from where the horse stands; riding, from its seat, `under` the
 * horse's CG bone (as it rises and falls with its gait), their pelvis 0.93 over that.
 */
export const SEAT = Object.freeze({ under: 0.66 });

/** Getting up into the saddle and down from it, by the side it's done from (battle.js mount's `side`). */
export const MOUNTING = Object.freeze({ left: Object.freeze({ up: "Mount Left", down: "Dismount Left" }), right: Object.freeze({ up: "Mount Right", down: "Dismount Right" }) });

/**
 * A rider's hands on the reins (the owner's photos of a hand on a rein): each closed in a loose
 * fist round its rein, as round a haft `radius` metres thick (grip.js powerGrip), the thumb over
 * the curled index finger, and the rein coming out of the top of the fist under the thumb, between
 * its pad and the index finger (pinchOf).
 */
export const REIN_HOLD = Object.freeze({ radius: 0.01 });

const _a = new THREE.Quaternion();
const _pelvis = new THREE.Vector3();
const _at = new THREE.Vector3();
const _pad = new THREE.Vector3();

/** A body's hands closed round its reins (REIN_HOLD), fitted to its own hands: { Left, Right }, as powerGrip has them. */
export function reinGrips(character) {
    return Object.fromEntries(["Left", "Right"].map((side) => [side, powerGrip(character, side, { radius: REIN_HOLD.radius })]));
}

/**
 * Where a rider holds a rein in a hand (`side`: "Left" or "Right"), as their body's posed now
 * (world, its matrices up to date): under the thumb, between the middle of its end bone (its pad)
 * and the middle of the curled index finger's middle bone.
 */
export function pinchOf(rig, side, out = new THREE.Vector3()) {
    const middle = (name, at) => {
        const i = rig.index.get(name);

        return rig.bones[i].localToWorld(at.subVectors(rig.tails[i], rig.heads[i]).multiplyScalar(0.5));
    };

    return middle(`${side}HandThumb3`, out).lerp(middle(`${side}HandIndex2`, _pad), 0.5);
}

/** The rider's clips, read (wantClips), fitted to each body that rides as it first does. */
export class RiderClips {
    /** @param {{ scene: THREE.Object3D, animations: THREE.AnimationClip[] }} gltf */
    constructor(gltf) {
        this.gltf = gltf;
        this.clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
        this.poses = new Map();
        this.fitted = new WeakMap();
    }

    /** Whether it has a clip (by name). */
    has(name) {
        return this.clips.has(name);
    }

    /** How long a clip is (seconds), 0 for none. */
    length(name) {
        return this.clips.get(name)?.duration ?? 0;
    }

    // A clip's poses (gltfPoses), sampled once for every body
    #poses(name) {
        if (!this.poses.has(name)) {
            const clip = this.clips.get(name);

            this.poses.set(name, clip ? gltfPoses(this.gltf.scene, clip, { loop: !ONCE.has(name) }) : null);
        }

        return this.poses.get(name);
    }

    // A clip fitted to a body's rig (retarget's frames), and where its pelvis is in each frame
    #fitted(rig, name) {
        let mine = this.fitted.get(rig);

        if (!mine) {
            mine = new Map();
            this.fitted.set(rig, mine);
        }

        if (!mine.has(name)) {
            const poses = this.#poses(name);
            const hips = poses ? poses.names.indexOf(MESH2MOTION_NAMES.Hips) : -1;

            mine.set(name, poses && hips >= 0 ? { ...retarget(poses, rig, { names: MESH2MOTION_NAMES, match: MESH2MOTION_MATCH }), pelvis: poses.poses.map(({ positions }) => positions[hips].clone()) } : null);
        }

        return mine.get(name);
    }

    /**
     * Pose a body's rig as the clips are (`posed`: [{ clip, weight, time }], blended as the horse's
     * own are), its pelvis `lift` metres higher than they have it (a riding clip's seat: SEAT): its
     * joints set (rig.rotations) and its pelvis put (rig.offset) where theirs is in the horse's
     * frame, which the body's drawn in. Whether it was (none of the clips had: not).
     */
    pose(rig, posed, lift = 0) {
        let total = 0;

        for (const { clip, weight, time } of posed) {
            const fit = weight > 0 ? this.#fitted(rig, clip) : null;

            if (!fit) {
                continue;
            }

            const { frames, frameTime, loop, pelvis } = fit;
            const count = frames.length;
            const at = loop ? (((time / frameTime) % count) + count) % count : Math.min(Math.max(0, time / frameTime), count - 1);
            const a = Math.floor(at);
            const b = loop ? (a + 1) % count : Math.min(a + 1, count - 1);
            const u = at - a;
            const share = weight / (total + weight);

            frames[a].rotations.forEach((rotation, i) => {
                if (!rotation) {
                    return;
                }

                _a.slerpQuaternions(rotation, frames[b].rotations[i], u);

                if (total === 0) {
                    rig.rotations[i].copy(_a);
                } else {
                    rig.rotations[i].slerp(_a, share);
                }
            });

            _at.lerpVectors(pelvis[a], pelvis[b], u);

            if (total === 0) {
                _pelvis.copy(_at);
            } else {
                _pelvis.lerp(_at, share);
            }

            total += weight;
        }

        if (total === 0) {
            return false;
        }

        _pelvis.y += lift;
        rig.offset.copy(_pelvis).sub(rig.heads[0]);

        return true;
    }
}
