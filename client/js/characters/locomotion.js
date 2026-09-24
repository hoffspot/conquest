// Walking: poses a character's rig from the gait curves (gait.js) as it moves.
//
//  - A "stride wheel" turns distance into gait phase: the phase advances by the distance walked
//    over the stride length for that speed (from the walk ratio), so cadence and stride change
//    with speed the way people's do, and joint swings scale with the stride.
//  - The joint angles come from the gait curves (forward kinematics). The pelvis rises and falls
//    in a smooth wave, twice a stride, as people's does: lowest just after each heel strike and
//    highest in mid-stance. How far, and how high it is, come from how far the legs reach through
//    a stride, so no planted foot is left in the air. It also sways over the standing foot.
//  - A foot on the ground stays where it landed ("foot locking"): whatever small slide the joint
//    angles would make, two-bone inverse kinematics bends the leg to keep the foot planted, and
//    the swinging foot catches up during its swing.
//  - The trunk counter-rotates against the pelvis, and the head stays level and looking ahead.
//
// A style changes the walk: lean, crouch, arm spread, stance width, swagger and so on. Standing
// still is the same walk with no stride, plus breathing.

import * as THREE from "three";
import { amplitude, CURVES, curveAt, PELVIC_TILT, STANCE, strideLength } from "./gait.js";

/** How a character walks (all angles in degrees). */
export const WALK_STYLES = Object.freeze({
    natural: { lean: 2, crouch: 0, armSpread: 7, armForward: 6, elbow: 0, stanceWidth: 0.12, toeOut: 6, swagger: 1, sway: 0.025, headForward: 0, fingers: 20 },
    orc: { lean: 14, crouch: 9, armSpread: 16, armForward: 10, elbow: 14, stanceWidth: 0.3, toeOut: 12, swagger: 1.8, sway: 0.045, headForward: 16, fingers: 45 },
});

const SIDES = ["Left", "Right"];
const ACCELERATION = 2.5; // metres a second, each second
const UP = new THREE.Vector3(0, 1, 0);

const smooth = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);
};
const wrap = (phase) => ((phase % 1) + 1) % 1;

// The pelvis rises and falls twice a stride, lowest this far after each heel strike (in the
// loading response). How far and how high are measured at these amounts of stride (0 standing
// still), at this many points through a stride
const LOWEST = 0.1;
const LEVELS = [0, 0.25, 0.5, 0.75, 1, 1.3];
const POINTS = 32;

const _point = new THREE.Vector3();
const _target = new THREE.Vector3();

export class Walker {
    /**
     * @param {import("./character.js").Character} character
     * @param {object} [style] - A WALK_STYLES entry, or your own.
     */
    constructor(character, style = WALK_STYLES.natural) {
        this.character = character;
        this.rig = character.rig;
        this.style = { ...WALK_STYLES.natural, ...style };

        /** Gait phase of the left foot (0 at its heel strike). */
        this.phase = 0;
        this.speed = 0;
        this.targetSpeed = 0;
        this.time = 0;
        this.distance = 0;
        this.amount = 0;

        /**
         * Per foot: whether it's planted, the pivot it's planted on (world), how far the joint
         * angles would have slid it, and how far they had when it lifted off.
         */
        this.feet = SIDES.map(() => ({ planted: false, pivot: "heel", lock: new THREE.Vector3(), correction: new THREE.Vector3(), release: new THREE.Vector3() }));

        this.measure();
    }

    /** Walk another way (a WALK_STYLES entry, or your own). */
    setStyle(style) {
        this.style = { ...WALK_STYLES.natural, ...style };
        this.heights = [];
    }

    /** Measure the body (call after the character's shape changes). */
    measure() {
        const rig = this.rig;
        const head = (name) => rig.heads[rig.index.get(name)];
        const tail = (name) => rig.tails[rig.index.get(name)];

        this.legLength = head("LeftUpLeg").y;
        this.hipWidth = head("LeftUpLeg").x - head("RightUpLeg").x;

        // Where each foot touches the ground (heel, ball, toe tip), relative to its bones
        const positions = this.character.positions;
        const human = this.character.human;

        this.contacts = SIDES.map((side) => {
            const foot = rig.index.get(`${side}Foot`);
            const toe = rig.index.get(`${side}ToeBase`);
            let heel = Infinity;
            let tip = -Infinity;

            for (let v = 0; v < human.vertexCount; v++) {
                const bone = human.skinIndices[v * 4];

                if (human.partOf[v] === 0 && (bone === foot || bone === toe) && positions[v * 3 + 1] < 0.04) {
                    heel = Math.min(heel, positions[v * 3 + 2]);
                    tip = Math.max(tip, positions[v * 3 + 2]);
                }
            }

            const ankle = head(`${side}Foot`);
            const ball = head(`${side}ToeBase`);

            return {
                heel: new THREE.Vector3(ankle.x, 0, heel + 0.012).sub(ankle),
                ball: new THREE.Vector3(ball.x, 0, ball.z).sub(ankle),
                tip: new THREE.Vector3(tail(`${side}ToeBase`).x, 0, tip - 0.01).sub(ball),
            };
        });

        this.feet.forEach((foot) => (foot.planted = false));
        this.heights = [];
    }

    /**
     * Advance by `dt` seconds. `speed` is the speed to walk at (metres a second, eased into), in
     * the direction the character faces. Moves the character.
     */
    update(dt, { speed = this.targetSpeed } = {}) {
        const object = this.character.object;

        dt = Math.max(0, dt);

        this.targetSpeed = speed;
        this.time += dt;

        const change = this.targetSpeed - this.speed;

        this.speed += Math.sign(change) * Math.min(Math.abs(change), ACCELERATION * dt);

        // Stride wheel
        const stride = strideLength(Math.max(this.speed, 0.05), this.legLength);
        const step = this.speed * dt;

        this.distance += step;
        this.phase = wrap(this.phase + step / stride);

        // How far the joints swing, easing to nothing when standing still
        const amount = this.speed < 0.02 ? 0 : Math.min(1.3, amplitude(this.speed, this.legLength));

        this.amount += (amount - this.amount) * Math.min(1, dt * 8);

        if (this.amount < 0.01) {
            this.amount = 0;
        }

        object.translateZ(step);
        object.updateMatrixWorld(true);

        this.#pose();
    }

    /** Move the walker's world bookkeeping (when the lab moves the character and ground back). */
    shift(offset) {
        for (const foot of this.feet) {
            foot.lock.sub(offset);
        }
    }

    #pose() {
        const rig = this.rig;
        const s = this.amount;
        const p = this.phase;
        const phases = [p, wrap(p + 0.5)];
        const height = this.#height(p, s);

        this.#setJoints(phases, s, Math.sin(this.time * 2 * Math.PI * 0.25));

        // Sway over the standing foot, and rise and fall
        rig.offset.set(this.style.sway * Math.min(1, s * 1.5) * Math.sin(2 * Math.PI * p), height, 0);
        rig.apply();
        this.character.object.updateMatrixWorld(true);

        // Keep planted feet on the ground where they landed, and swinging feet off it
        SIDES.forEach((side, i) => this.#plant(side, i, phases[i], s));

        // Toes bend to stay flat on the ground as the heel lifts
        SIDES.forEach((side, i) => this.#flattenToes(side, i));
    }

    /**
     * How high the pelvis sits at phase `p` (the left foot's) with `s` of a full stride: a smooth
     * wave, lowest just after each heel strike and highest in mid-stance. How far it rises and
     * falls is how far the legs' reach does through a stride (up to a limit), and it's never
     * higher than lets the feet on the ground touch it; the legs bend to meet the ground where
     * it's lower.
     */
    #height(p, s) {
        const upper = Math.min(LEVELS.length - 1, Math.max(1, LEVELS.findIndex((level) => level >= s)));
        const lower = upper - 1;
        const t = Math.min(1, (s - LEVELS[lower]) / (LEVELS[upper] - LEVELS[lower]));
        const [a, b] = [this.#reach(lower), this.#reach(upper)];
        const middle = a.middle + (b.middle - a.middle) * t;
        const rise = a.rise + (b.rise - a.rise) * t;

        return middle - rise * Math.cos(4 * Math.PI * (p - LOWEST));
    }

    /**
     * How high the pelvis can be through a stride at one of the LEVELS (from posing it at
     * POINTS phases, the feet on the ground just touching it), as the middle and rise of the wave
     * that stays under it. Measured once for each style and body.
     */
    #reach(level) {
        if (!this.heights[level]) {
            const s = LEVELS[level];
            const highest = [];

            for (let k = 0; k < POINTS; k++) {
                const phases = [k / POINTS, wrap(k / POINTS + 0.5)];

                this.#setJoints(phases, s, 0);
                this.rig.apply();
                this.character.object.updateMatrixWorld(true);
                highest.push(Math.min(...[0, 1].filter((i) => s === 0 || phases[i] < STANCE).map((i) => -this.#lowest(i))));
            }

            // Its two steps alike, and no further than a real walk's rise and fall
            const half = POINTS / 2;
            const step = highest.slice(0, half).map((h, k) => Math.min(h, highest[k + half]));
            const rise = Math.min(this.legLength * 0.028, (Math.max(...step) - Math.min(...step)) / 2);
            const middle = Math.min(...highest.map((h, k) => h + rise * Math.cos(4 * Math.PI * (k / POINTS - LOWEST)))) - 0.002;

            this.heights[level] = { middle, rise };
        }

        return this.heights[level];
    }

    /** Set the joints for the feet's phases (left, right), `s` of a full stride. */
    #setJoints(phases, s, breathe) {
        const rig = this.rig;
        const style = this.style;
        const p = phases[0];

        rig.reset();

        // Pelvis: tilt, obliquity (drops on the swinging side) and rotation (forward with the leg)
        const obliquity = s * style.swagger * curveAt(CURVES.pelvicObliquity, p);
        const rotation = s * style.swagger * curveAt(CURVES.pelvicRotation, p);

        rig.setAngles("Hips", { tilt: 0, obliquity, turn: rotation });

        // Trunk: leans, counter-rotates against the pelvis and stays upright
        const lean = style.lean + s * 2 + breathe * 0.6 * (1 - s);
        const turn = 1.3 * rotation;
        const bend = 0.9 * obliquity;
        const shares = { Spine: 0.25, Spine1: 0.35, Spine2: 0.4 };

        for (const [name, share] of Object.entries(shares)) {
            rig.setAngles(name, { flex: lean * share, turn: turn * share, bend: bend * share });
        }

        // Head: level and looking where the body goes
        const headTurn = rotation - turn;
        const headBend = obliquity - bend;
        const headFlex = -lean * 0.9 + style.headForward;

        rig.setAngles("Neck", { flex: style.headForward, turn: headTurn * 0.4, bend: headBend * 0.5 });
        rig.setAngles("Head", { flex: headFlex - style.headForward * 1.6, turn: headTurn * 0.6, bend: headBend * 0.5 });

        // Legs, from the gait curves (stance width sets how far the thighs come in)
        const inward = Math.atan2((this.hipWidth - style.stanceWidth) / 2, this.legLength) * (180 / Math.PI);

        SIDES.forEach((side, i) => {
            const phase = phases[i];
            const crouch = style.crouch;

            rig.setAngles(`${side}UpLeg`, {
                flex: s * (curveAt(CURVES.hipFlexion, phase) - PELVIC_TILT) + crouch + lean * 0.3,
                abduct: -s * curveAt(CURVES.hipAdduction, phase) - inward,
                rotate: -style.toeOut * 0.5,
            });
            rig.setAngles(`${side}Leg`, { flex: s * curveAt(CURVES.kneeFlexion, phase) + crouch * 1.6 });
            rig.setAngles(`${side}Foot`, { flex: s * curveAt(CURVES.ankleDorsiflexion, phase) + crouch * 0.6, rotate: style.toeOut * 0.5, invert: inward * 0.6 });

            // Arms swing against the legs, or carry what's in the hand
            const hold = this.character.holds[side];
            const swing = s * curveAt(CURVES.shoulderFlexion, phase);
            const elbowSwing = s * (curveAt(CURVES.elbowFlexion, phase) - 10);

            rig.setAngles(`${side}Shoulder`, { elevate: 0, protract: swing * 0.15 });

            if (hold?.Arm) {
                const amount = hold.swing ?? 0.3;

                rig.setAngles(`${side}Arm`, { ...hold.Arm, flex: hold.Arm.flex + amount * (swing + style.armForward * s) + breathe * 0.5, abduct: (hold.Arm.abduct ?? 0) + style.armSpread * 0.5 });
                rig.setAngles(`${side}ForeArm`, { ...hold.ForeArm, flex: hold.ForeArm.flex + amount * elbowSwing * 0.5 });
                rig.setAngles(`${side}Hand`, hold.Hand ?? {});
            } else {
                rig.setAngles(`${side}Arm`, {
                    flex: swing + s * style.armForward + breathe * 0.5,
                    abduct: style.armSpread + s * 2,
                    rotate: 5,
                });
                rig.setAngles(`${side}ForeArm`, { flex: 10 + style.elbow + elbowSwing, pronate: 25 });
                rig.setAngles(`${side}Hand`, { flex: 8, deviate: -5 });
            }

            // Fingers: relaxed, or closed round a grip
            const grip = hold?.grips;

            for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
                const curl = grip ? 78 : style.fingers * (finger === "Index" ? 0.7 : finger === "Pinky" ? 1.25 : 1);

                for (const joint of [1, 2, 3]) {
                    rig.setAngles(`${side}Hand${finger}${joint}`, { flex: curl * (joint === 1 ? (grip ? 0.95 : 0.8) : grip ? 1.05 : 1) });
                }
            }

            rig.setAngles(`${side}HandThumb1`, { flex: grip ? 25 : 10, oppose: grip ? 40 : 15 });
            rig.setAngles(`${side}HandThumb2`, { flex: grip ? 45 : style.fingers * 0.5 });
            rig.setAngles(`${side}HandThumb3`, { flex: grip ? 30 : 0 });
        });

    }

    /** How high a foot's lowest point (heel, ball or toe tip) is off the ground: 0 left, 1 right. */
    footHeight(i) {
        return this.#lowest(i);
    }

    /** Where a foot's lowest point is, in the world (or its "heel", "ball" or toe "tip"). */
    footPoint(i, which = null) {
        if (which) {
            return this.#contact(i, which);
        }

        return ["heel", "ball", "tip"].map((point) => this.#contact(i, point)).reduce((low, point) => (point.y < low.y ? point : low));
    }

    /** Relax the hands (for poses that don't set the fingers). */
    relaxHands() {
        for (const side of SIDES) {
            for (const finger of ["Index", "Middle", "Ring", "Pinky"]) {
                for (const joint of [1, 2, 3]) {
                    this.rig.setAngles(`${side}Hand${finger}${joint}`, { flex: this.style.fingers });
                }
            }

            this.rig.setAngles(`${side}HandThumb2`, { flex: this.style.fingers * 0.5 });
        }
    }

    /** A foot's contact point (heel, ball or tip) in the world. */
    #contact(i, which, target = new THREE.Vector3()) {
        const side = SIDES[i];
        const bone = this.rig.bone(which === "tip" ? `${side}ToeBase` : `${side}Foot`);

        return target.copy(this.contacts[i][which]).applyMatrix4(bone.matrixWorld);
    }

    /** Height of a foot's lowest contact point above the ground (the character's feet level). */
    #lowest(i) {
        const ground = this.character.object.getWorldPosition(_point).y;

        return Math.min(...["heel", "ball", "tip"].map((which) => this.#contact(i, which).y)) - ground;
    }

    #plant(side, i, phase, s) {
        const foot = this.feet[i];
        const object = this.character.object;
        const ground = object.getWorldPosition(_point).y;
        const onGround = s === 0 || phase < STANCE;

        // The foot pivots on its heel early in stance, on its ball late in stance
        const pivot = s === 0 || phase < 0.3 ? "heel" : "ball";
        const now = this.#contact(i, pivot);

        now.y = ground;

        if (onGround && !foot.planted) {
            foot.planted = true;
            foot.pivot = pivot;
            foot.lock.copy(now);
        } else if (onGround && foot.pivot !== pivot) {
            // Rolling onto the ball: keep the correction so far, pivoting about the new point
            foot.pivot = pivot;
            foot.lock.copy(now).add(foot.correction);
        } else if (!onGround && foot.planted) {
            foot.planted = false;
            foot.release.copy(foot.correction);
        }

        // Planted: move the foot back by however far its pivot has slid. Swinging: ease that off,
        // and keep the foot clear of the ground
        let lift = 0;

        if (foot.planted) {
            foot.correction.copy(foot.lock).sub(now);
            foot.correction.y = 0;

            // On the ground: its lowest point just touching it
            lift = -this.#lowest(i);
        } else {
            // Lifting off from the ground, easing into clearing it by a little
            const off = smooth(STANCE, STANCE + 0.08, phase);
            const lowest = this.#lowest(i);

            foot.correction.copy(foot.release).multiplyScalar(1 - smooth(STANCE, STANCE + 0.2, phase));
            lift = -lowest + (Math.max(0, 0.008 * off - lowest) + lowest) * off;
        }

        if (foot.correction.lengthSq() < 1e-8 && Math.abs(lift) < 1e-4) {
            return;
        }

        // Where the ankle has to be, in the character's space
        _target.setFromMatrixPosition(this.rig.bone(`${side}Foot`).matrixWorld).add(foot.correction);
        _target.y += lift;
        object.worldToLocal(_target);
        this.rig.reach(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, _target);
    }

    #flattenToes(side, i) {
        const ground = this.character.object.getWorldPosition(_point).y;
        const ball = this.#contact(i, "ball");
        const tip = this.#contact(i, "tip");

        if (ball.y - ground > 0.04 || tip.y >= ground) {
            return;
        }

        // Bend the toes up about the ball until the tip is back on the ground
        const toe = this.rig.bone(`${side}ToeBase`);
        const along = tip.clone().sub(ball);
        const angle = Math.atan2(ground - tip.y, Math.hypot(along.x, along.z));
        const axis = new THREE.Vector3().crossVectors(along, UP).normalize();
        const turn = new THREE.Quaternion().setFromAxisAngle(axis, Math.min(angle, 1.2));
        const parent = toe.parent.getWorldQuaternion(new THREE.Quaternion());
        const world = toe.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn);

        toe.quaternion.copy(parent.invert().multiply(world));
        toe.updateMatrixWorld(true);
    }
}
