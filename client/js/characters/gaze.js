// Where a character's looking: its eyes and head turned towards something (whoever it's fighting,
// whoever it's talking with, someone passing near), else glancing about now and then. The eyes turn
// in the head, in their own material's shader, about each eye's middle before skinning (there are
// no bones for them); the neck and head turn on top of whatever pose it's in, within their joints'
// ranges. The eyes get there first and the head follows, taking most of the turn.
//
//     gaze.at(point)    // each frame: a point in the world to look at, or null (ahead, glancing)
//     gaze.update(dt)   // as the body's posed: the eyes' and head's turns eased towards it
//     gaze.turn()       // in the pose (Actions' overlay, before Rig.apply): the neck and head

import * as THREE from "three";

/**
 * How far and how quickly a gaze turns (degrees, and of the way a second): the eyes in the head,
 * and the head on the neck (`neck` of its turn in the neck, the rest in the head), which takes
 * `share` of a turn, the eyes the rest. Further round than `behind` it doesn't look: ahead instead.
 * With nothing to look at, it glances about now and then (`glance`: how far, and how long each
 * look lasts, seconds), as often straight ahead as not.
 */
export const GAZE = Object.freeze({
    eyes: Object.freeze({ turn: 28, up: 18, down: 22, ease: 22 }),
    head: Object.freeze({ turn: 55, up: 22, down: 35, ease: 5, neck: 0.4 }),
    share: 0.7,
    behind: 110,
    glance: Object.freeze({ turn: 20, up: 6, down: 12, every: [1.2, 4.5], ahead: 0.5 }),
});

// Where its eyes are, a share of how tall it is
const EYE_HEIGHT = 0.935;

const DEG = Math.PI / 180;
const _eye = new THREE.Vector3();
const _turn = new THREE.Matrix4();
const _up = new THREE.Matrix4();
const _left = new THREE.Box3();
const _right = new THREE.Box3();

// The vertices of each body's eyes, once (HumanData: the same for everyone on it)
const eyeVertices = new WeakMap();

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Let a character's eyes' material turn them (`uniforms`: a Gaze's): each of its vertices turned
 * about the middle of the eye it's nearer, before skinning.
 */
export function lookingEyes(material, uniforms) {
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey;

    material.onBeforeCompile = function (shader, renderer) {
        before.call(this, shader, renderer);
        shader.uniforms.eyeTurn = uniforms.turn;
        shader.uniforms.eyeLeft = uniforms.left;
        shader.uniforms.eyeRight = uniforms.right;
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nuniform mat3 eyeTurn;\nuniform vec3 eyeLeft;\nuniform vec3 eyeRight;")
            .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nobjectNormal = eyeTurn * objectNormal;")
            .replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\nvec3 eyeMiddle = distance( position, eyeLeft ) < distance( position, eyeRight ) ? eyeLeft : eyeRight;\ntransformed = eyeMiddle + eyeTurn * ( transformed - eyeMiddle );",
            );
    };
    material.customProgramCacheKey = function () {
        return `${key.call(this)}|looking`;
    };
}

/** A character's gaze. `uniforms` is what its eyes' material reads (lookingEyes). */
export class Gaze {
    constructor(character, random = Math.random) {
        this.character = character;
        this.random = random;
        this.uniforms = { turn: { value: new THREE.Matrix3() }, left: { value: new THREE.Vector3() }, right: { value: new THREE.Vector3() } };
        /** What it's looking at (a point in the world), or null. */
        this.target = null;
        /** Whether it turns its head and eyes at all (not dead, nor knocked down): eased. */
        this.on = true;
        this.weight = 1;
        // (The head's and eyes' turns now: degrees to its left, and up)
        this.head = { turn: 0, up: 0 };
        this.eyes = { turn: 0, up: 0 };
        // (Glancing: where, and for how much longer)
        this.glance = { turn: 0, up: 0, left: 0 };
        // (Its body's shape the eyes' middles were found for)
        this.shaped = -1;
    }

    /** Look at a point in the world (copied), or, with null, ahead, glancing about now and then. */
    at(point) {
        if (point) {
            this.target = (this.target ?? new THREE.Vector3()).copy(point);
        } else {
            this.target = null;
        }
    }

    /** Ease the eyes and head towards where it's looking, over `dt` seconds. */
    update(dt) {
        const { eyes, head } = GAZE;
        const wanted = this.#wanted(dt);
        const headTurn = clamp(wanted.turn * GAZE.share, -head.turn, head.turn);
        const headUp = clamp(wanted.up * GAZE.share, -head.down, head.up);
        const toward = (now, to, ease) => now + (to - now) * (1 - Math.exp(-ease * dt));

        this.weight = toward(this.weight, this.on ? 1 : 0, head.ease);
        this.head.turn = toward(this.head.turn, headTurn, head.ease);
        this.head.up = toward(this.head.up, headUp, head.ease);
        // (The eyes the rest of the way, from where the head's got to)
        this.eyes.turn = toward(this.eyes.turn, clamp(wanted.turn - this.head.turn, -eyes.turn, eyes.turn), eyes.ease);
        this.eyes.up = toward(this.eyes.up, clamp(wanted.up - this.head.up, -eyes.down, eyes.up), eyes.ease);

        this.#placeEyes();
    }

    // Where it wants to look (degrees to its left, and up, from ahead): at its target, or glancing
    #wanted(dt) {
        const object = this.character.object;

        if (this.target && this.on) {
            object.getWorldPosition(_eye);
            _eye.y += this.character.height * EYE_HEIGHT;

            const dx = this.target.x - _eye.x;
            const dz = this.target.z - _eye.z;
            const turn = wrap(Math.atan2(dx, dz) - object.rotation.y) / DEG;

            if (Math.abs(turn) <= GAZE.behind) {
                return { turn, up: Math.atan2(this.target.y - _eye.y, Math.hypot(dx, dz)) / DEG };
            }
        }

        const glance = this.glance;
        const { turn, up, down, every, ahead } = GAZE.glance;

        glance.left -= dt;

        if (glance.left <= 0) {
            const still = this.random() < ahead;

            glance.turn = still ? 0 : (this.random() * 2 - 1) * turn;
            glance.up = still ? 0 : -down + this.random() * (up + down);
            glance.left = every[0] + this.random() * (every[1] - every[0]);
        }

        return this.on ? glance : { turn: 0, up: 0 };
    }

    // The eyes' turn, and the middles of its eyes (found again when its body's reshaped)
    #placeEyes() {
        const geometry = this.character.geometry;
        const positions = geometry?.attributes.position;

        if (positions && positions.version !== this.shaped) {
            const human = this.character.human;

            if (!eyeVertices.has(human)) {
                eyeVertices.set(human, Uint32Array.from(new Set(human.renderIndices("eyes"))));
            }

            // Each eye's box (its left is +x): its middle across and up, and its eyeball's
            // radius (half as wide as it is) in from its back (the cornea bulges in front)
            const boxes = [_left.makeEmpty(), _right.makeEmpty()];

            for (const v of eyeVertices.get(human)) {
                _eye.fromBufferAttribute(positions, v);
                boxes[_eye.x > 0 ? 0 : 1].expandByPoint(_eye);
            }

            for (const [box, middle] of [[_left, this.uniforms.left.value], [_right, this.uniforms.right.value]]) {
                if (!box.isEmpty()) {
                    box.getCenter(middle);
                    middle.z = box.min.z + (box.max.x - box.min.x) / 2;
                }
            }

            this.shaped = positions.version;
        }

        const weight = this.weight * DEG;

        // (Turned to its left about up, then up about its left: its eyes look along +z)
        _turn.makeRotationY(this.eyes.turn * weight).multiply(_up.makeRotationX(-this.eyes.up * weight));
        this.uniforms.turn.value.setFromMatrix4(_turn);
    }

    /** Turn its neck and head (in Actions' overlay, after the pose and before Rig.apply). */
    turn() {
        const weight = this.weight;

        if (weight < 0.001) {
            return;
        }

        const rig = this.character.rig;
        const { neck } = GAZE.head;

        // (Turning is about up, to its left; looking up, flexing back)
        rig.addAngles("Neck", { turn: this.head.turn * neck * weight, flex: -this.head.up * neck * weight });
        rig.addAngles("Head", { turn: this.head.turn * (1 - neck) * weight, flex: -this.head.up * (1 - neck) * weight });
    }
}
