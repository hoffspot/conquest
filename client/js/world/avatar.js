// A character in the world, kept in step with its actor in the battle (core/battle.js): its body
// (characters/character.js), the walk that moves its legs (locomotion.js) and the actions layered
// over it (actions.js: attacking, flinching, falling).
//
// The battle moves actors from square to square in fixed steps; the game gives the avatar where
// its actor is between two steps, and the avatar walks there. It follows on a spring, which
// rounds off the corners of the square-by-square path, so that a character runs in smooth lines
// rather than zig-zagging from square to square, and it faces the way it's going (or, standing,
// the way its actor faces), turning smoothly.

import * as THREE from "three";
import { Actions } from "../characters/actions.js";
import { Walker, WALK_STYLES } from "../characters/locomotion.js";

// How fast characters turn (radians a second)
const TURN_SPEED = 9;

// How closely a character follows its place in the battle: the stiffness of a critically damped
// spring (per second). It trails by 2 / FOLLOW seconds' travel: under a third of a metre walking,
// about a metre and a quarter sprinting
const FOLLOW = 12;

// Faster than this (metres a second), a character faces the way it's going
const HEADING_SPEED = 0.5;

/**
 * How often a character's body is posed (walk, actions, feet on the ground, hands reaching:
 * most of what a character costs a frame), by how it's seen. It follows its actor every frame
 * whatever; between poses the whole of it moves as it was last posed. `sizes`: every frame when
 * it's this tall on the screen (drawing buffer pixels) or taller, at most every so many frames
 * when it's smaller; unless it's moving so fast that the quickest of it would be seen to be out
 * by more than `slide` pixels between poses (a foot on the ground sliding along with the body,
 * or a hand in a blow, which goes about `swing` metres a second). `unseen`: every so many frames
 * when it's out of view (it's posed straight away when it comes back into it). `clear`: what it
 * holds is kept out of its body (Actions.keepClear) only when it's posed at least this often:
 * seen big enough that a few centimetres of it in the body would show.
 */
export const POSING = Object.freeze({
    sizes: [
        [150, 1],
        [75, 2],
        [35, 3],
        [0, 4],
    ],
    slide: 1.5,
    swing: 4,
    unseen: 8,
    clear: 2,
});

/**
 * How often (every so many frames) to pose a character `tall` pixels tall on the screen (0 out
 * of view), going `slide` pixels across it a frame (POSING).
 */
export function posingEvery(tall, slide = 0) {
    if (tall <= 0) {
        return POSING.unseen;
    }

    const most = POSING.sizes.find(([over]) => tall >= over)[1];

    // (A foot on the ground slides with the body for every frame but the one it's posed in)
    return slide > 0 ? Math.min(most, 1 + Math.floor(POSING.slide / slide)) : most;
}

// Avatars start counting to their first pose at different frames, so that those posed every so
// many frames aren't all posed in the same one
let staggered = 0;

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class Avatar {
    /**
     * @param {import("../characters/character.js").Character} character
     * @param {object} [options]
     * @param {string} [options.walk] - A WALK_STYLES key.
     * @param {string} [options.guard] - How it holds its weapon to fight (actions.js GUARDS).
     */
    constructor(character, { walk = "natural", guard = null } = {}) {
        this.character = character;
        this.object = character.object;
        this.walker = new Walker(character, WALK_STYLES[walk] ?? WALK_STYLES.natural);
        this.actions = new Actions(character);
        this.actions.setWeapon(guard);
        this.walker.overlay = (dt, walking) => this.actions.apply(dt, walking);
        this.walker.freed = (side) => this.actions.free[side];
        this.walker.afterPose = () => this.actions.place();
        this.facing = 0;
        this.last = new THREE.Vector3();

        /** Where it's drawn, following its actor, and how fast that's moving (metres, m/s). */
        this.follow = { x: 0, z: 0, vx: 0, vz: 0 };

        /** How often its body's posed: every so many updates (posingEvery). */
        this.every = 1;

        // Since it was last posed: how many updates, how long (seconds) and how far it's gone (metres)
        this.unposed = { frames: staggered++ % POSING.unseen, dt: 0, moved: 0 };
    }

    /** Put it straight somewhere (metres), facing a way (radians from south, towards east). */
    place(x, z, facing = 0) {
        this.object.position.set(x, 0, z);
        this.object.rotation.y = facing;
        this.facing = facing;
        this.last.copy(this.object.position);
        Object.assign(this.follow, { x, z, vx: 0, vz: 0 });
        Object.assign(this.unposed, { dt: 0, moved: 0 });
        this.walker.release();
    }

    /**
     * Walk towards where its actor is now (metres), facing the way it's going, or, standing still
     * or when `steer` is false (attacking), the way its actor faces (`facing`). Its body's posed
     * every `every` updates, for all the time and way since it last was.
     */
    update(dt, x, z, facing, steer = true) {
        const object = this.object;
        const follow = this.follow;

        // The spring, stepped exactly (so it's the same at any frame rate)
        const decay = Math.exp(-FOLLOW * dt);
        const ex = follow.x - x;
        const ez = follow.z - z;
        const jx = follow.vx + FOLLOW * ex;
        const jz = follow.vz + FOLLOW * ez;

        follow.x = x + (ex + jx * dt) * decay;
        follow.z = z + (ez + jz * dt) * decay;
        follow.vx = (follow.vx - FOLLOW * jx * dt) * decay;
        follow.vz = (follow.vz - FOLLOW * jz * dt) * decay;

        const moved = Math.hypot(follow.x - this.last.x, follow.z - this.last.z);
        const heading = steer && Math.hypot(follow.vx, follow.vz) > HEADING_SPEED ? Math.atan2(follow.vx, follow.vz) : facing;
        const most = TURN_SPEED * dt;
        const turn = wrapAngle(heading - this.facing);

        object.position.set(follow.x, 0, follow.z);
        this.last.copy(object.position);
        this.facing = wrapAngle(this.facing + Math.max(-most, Math.min(most, turn)));
        object.rotation.y = this.facing;

        const unposed = this.unposed;

        unposed.frames++;
        unposed.dt += dt;
        unposed.moved += moved;

        if (unposed.frames >= this.every) {
            this.actions.keepClear = this.every <= POSING.clear;
            this.walker.update(unposed.dt, { moved: unposed.moved });
            this.character.expressions?.update(unposed.dt, this.actions);
            Object.assign(unposed, { frames: 0, dt: 0, moved: 0 });
        }
    }

    /**
     * How fast the quickest of it is going (metres a second), as drawn: the whole of it, or, in
     * the middle of something quick (a blow, a flinch, a fall), its hands.
     */
    get motion() {
        const speed = Math.hypot(this.follow.vx, this.follow.vz);

        return this.actions.quick ? Math.max(speed, POSING.swing) : speed;
    }

    /**
     * Which way a point in the world (metres) is from the character, as an angle in its own frame
     * (0 straight ahead, positive to its left): for reactions and falls.
     */
    angleTo(x, z) {
        const dx = x - this.object.position.x;
        const dz = z - this.object.position.z;

        return wrapAngle(Math.atan2(dx, dz) - this.facing);
    }

    /** A point on the character in the world: its chest (height 0.72 of it), head (0.93)... */
    point(share = 0.72, target = new THREE.Vector3()) {
        return target.set(this.object.position.x, this.object.position.y + this.character.height * share, this.object.position.z);
    }

    /** Where a hand is in the world ("Right" or "Left"): where spells leave and bows are drawn. */
    hand(side = "Right", target = new THREE.Vector3()) {
        return this.character.rig.bone(`${side}Hand`).getWorldPosition(target);
    }
}
