// Walking and running: poses a character's rig from the gait curves (gait.js) as it moves.
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
// Faster than people can walk (walkToRunSpeed), the walk turns into a run: the joints blend to
// the sprinting curves, each foot is on the ground for a quarter of the stride instead of most of
// it (both feet off the ground between steps), landing on the ball of the foot; the body leans
// forward, is lowest in the middle of each step and highest in the air, and the arms pump with the
// elbows bent.
//
// A style changes the walk: lean, crouch, arm spread, stance width, swagger and so on. Standing
// still is the same walk with no stride, plus breathing.

import * as THREE from "three";
import { amplitude, CURVES, curveAt, PELVIC_TILT, RUN_CURVES, RUN_STANCE, runStrideLength, STANCE, strideLength, walkToRunSpeed } from "./gait.js";
import { jointAngles, limitRotation } from "./rig.js";

/**
 * What an overlay (Walker.overlay) says when the feet are to be planted only where it plants
 * them (a fall's clip: those it frees, Walker.freed, follow its legs), not shuffled round under
 * the body as a turned body's are.
 */
export const STEPPED = "stepped";

/**
 * What an overlay (Walker.overlay) says while the body sits (Actions.setSeated): the feet are
 * where the sitting legs put them, not planted, but not through the floor: a foot the pose puts
 * into it is lifted onto it (a longer leg's knee higher), as people of every height sit on the
 * same bench.
 */
export const SEATED = "seated";

/** How a character walks (all angles in degrees). */
export const WALK_STYLES = Object.freeze({
    natural: { lean: 2, crouch: 0, armSpread: 7, armForward: 6, elbow: 0, stanceWidth: 0.12, toeOut: 6, swagger: 1, sway: 0.025, headForward: 0, fingers: 20 },
    orc: { lean: 14, crouch: 9, armSpread: 16, armForward: 10, elbow: 14, stanceWidth: 0.3, toeOut: 12, swagger: 1.8, sway: 0.045, headForward: 16, fingers: 45 },
});

const SIDES = ["Left", "Right"];

// The thumb round a grip: closed over the curled fingers (rig.js JOINTS.thumb)
const GRIP_THUMB = [{ flex: 55, oppose: -10 }, { flex: 35 }, { flex: 25 }];
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

// Running in a robe to the ankles (Character.robed), the knee bent past this (degrees) only this
// share as far again: the heel kicked up behind to about 85° rather than 122°, inside the robe
const ROBED_KNEE = Object.freeze({ from: 60, share: 0.4 });

// How fast feet shuffle back under a character turning on the spot (metres a second)
const SHUFFLE = 0.8;

// A leg is never stretched further than this share of its length (a planted foot slides a little
// instead), and how quickly a lifted foot stops making up for how far it had slid (per second),
// however long it's in the air
const REACH = 0.985;
const LET_GO = 5;

// Knees bend forward (in the thigh's anatomical frame)
export const KNEE = new THREE.Vector3(0, 0, 1);

// How far the shin bends over a planted foot standing (degrees of the ankle's dorsiflexion: its
// range's 20, less a little) before the heel lifts, up onto the ball of the foot
const DORSIFLEXION = 19;
const RISES = 4;

// How far past its range a hip may be turned keeping a foot planted where a fall plants it, before
// the foot's let go of (degrees)
const HIP_GIVE = 2;

// How far short of the most a leg's let reach the knees give, leaning over a planted foot (m)
const GIVE_SPARE = 0.001;

// Running: from the fastest walk to this much faster, the walk blends into a run. Running, the
// body leans this much further forward (degrees), the feet land this far apart (metres), and the
// body rises and falls this share of the leg's length (each way) through each step, lowest this
// far through a stride (mid-stance)
const RUN_BLEND = 1.4;
const RUN_LEAN = 9;
const RUN_STANCE_WIDTH = 0.05;
const RUN_RISE = 0.035;
const RUN_LOWEST = RUN_STANCE * 0.45;

const _point = new THREE.Vector3();
const _target = new THREE.Vector3();
const _knee = new THREE.Vector3();
const _shin = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _across = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _reach = new THREE.Vector3();
const _hips = new THREE.Vector3();
const _under = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _ankle = new THREE.Quaternion();
const _hipTurn = new THREE.Quaternion();
const _hipHeld = new THREE.Quaternion();
const _lift = new THREE.Quaternion();
const _footTurn = new THREE.Quaternion();
const _ball = new THREE.Vector3();
const _heel = new THREE.Vector3();
const _angles = {};

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

        /** How much it's running rather than walking (0 to 1). */
        this.run = 0;

        /** Hears each footstep as a foot lands, moving: (foot (0 left, 1 right), speed). */
        this.onStep = null;

        /**
         * How far each foot is let go of the ground, 0 to 1 (a kick lifts one: its leg follows
         * the joint angles, not the ground): ("Left" or "Right") => share, or null for neither.
         */
        this.freed = null;

        /**
         * The pelvis as the walk has it this frame, before anything's layered over it: where it
         * is (the rig's offset) and how it's turned. Anything layered over the walk leans the body
         * over the feet (a rest's weight shifted, a blow's lunge): it doesn't step them.
         */
        this.stance = { offset: new THREE.Vector3(), turn: new THREE.Quaternion() };

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
        this.runHeight = null;
    }

    /** Measure the body (call after the character's shape changes). */
    measure() {
        const rig = this.rig;
        const head = (name) => rig.heads[rig.index.get(name)];
        const tail = (name) => rig.tails[rig.index.get(name)];

        this.legLength = head("LeftUpLeg").y;
        this.hipWidth = head("LeftUpLeg").x - head("RightUpLeg").x;

        // How far each leg reaches, hip to ankle
        this.reaches = SIDES.map((side) => head(`${side}Leg`).distanceTo(head(`${side}UpLeg`)) + head(`${side}Foot`).distanceTo(head(`${side}Leg`)));

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
        this.runHeight = null;
    }

    /**
     * Advance by `dt` seconds. `speed` is the speed to walk at (metres a second, eased into), in
     * the direction the character faces; the walker moves the character. Or, when something else
     * moves it (the game, following the battle), `moved` is how far it went since the last update
     * (metres), and the legs keep up with that.
     */
    update(dt, { speed = this.targetSpeed, moved = null } = {}) {
        const object = this.character.object;

        dt = Math.max(0, dt);

        this.time += dt;

        if (moved === null) {
            this.targetSpeed = speed;

            const change = this.targetSpeed - this.speed;

            this.speed += Math.sign(change) * Math.min(Math.abs(change), ACCELERATION * dt);
        } else if (dt > 0) {
            // Walking as fast as it's moved (smoothed a little, as it's moved in steps)
            this.targetSpeed = moved / dt;
            this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 12);
        }

        // Running, faster than anyone can walk (eased in and out)
        const fastest = walkToRunSpeed(this.legLength);
        const running = smooth(fastest, fastest + RUN_BLEND, this.speed);

        this.run += (running - this.run) * Math.min(1, dt * 6);

        if (this.run < 0.001) {
            this.run = 0;
        }

        // Stride wheel
        const pace = Math.max(this.speed, 0.05);
        const stride = strideLength(pace, this.legLength) * (1 - this.run) + runStrideLength(pace, this.legLength) * this.run;
        const step = moved ?? this.speed * dt;

        this.distance += step;
        this.phase = wrap(this.phase + step / stride);

        // How far the joints swing, easing to nothing when standing still
        const amount = this.speed < 0.02 ? 0 : Math.min(1.3, amplitude(this.speed, this.legLength));

        this.amount += (amount - this.amount) * Math.min(1, dt * 8);

        if (this.amount < 0.01) {
            this.amount = 0;
        }

        if (moved === null) {
            object.translateZ(step);
        }

        // (Where it is now: the bones are posed, and their matrices worked out, once the joints
        // are set, #pose)
        object.updateWorldMatrix(true, false);

        this.#pose(dt);
    }

    /** Lift both feet (say after the character is put somewhere else), to plant them afresh. */
    release() {
        this.feet.forEach((foot) => (foot.planted = false));
    }

    /** Move the walker's world bookkeeping (when the lab moves the character and ground back). */
    shift(offset) {
        for (const foot of this.feet) {
            foot.lock.sub(offset);
        }
    }

    #pose(dt = 0) {
        const rig = this.rig;
        const s = this.amount;
        const r = this.run;
        const p = this.phase;
        const phases = [p, wrap(p + 0.5)];
        const height = this.#height(p, s) * (1 - r) + (r > 0 ? this.#runningHeight(p) * r : 0);

        this.#setJoints(phases, s, Math.sin(this.time * 2 * Math.PI * 0.25), r);

        // Sway over the standing foot (less, running), and rise and fall
        rig.offset.set(this.style.sway * Math.min(1, s * 1.5) * (1 - 0.6 * r) * Math.sin(2 * Math.PI * p), height, 0);

        // Anything layered over the walk (an attack, a flinch, a fall; told how far into its
        // stride the walk is) changes the joints now. It
        // says false when the feet shouldn't be kept on the ground (down on it, falling), STEPPED
        // when they're kept only where it plants them
        this.stance.offset.copy(rig.offset);
        this.stance.turn.copy(rig.rotations[0]);

        const planted = this.overlay?.(dt, s) ?? true;

        this.stepped = planted === STEPPED;

        rig.apply();
        this.character.object.updateMatrixWorld(true);

        // Standing, a body leaning over its planted feet bends its knees as far as keeps them there
        if (planted && planted !== SEATED && s === 0) {
            this.#give();
        }

        if (!planted || planted === SEATED) {
            this.release();

            if (planted === SEATED) {
                SIDES.forEach((side, i) => this.#onFloor(side, i));
            }

            // (Sitting, the hands still reach: raising a tankard)
            this.afterPose?.(dt);

            return;
        }

        // Keep planted feet on the ground where they landed, and swinging feet off it
        SIDES.forEach((side, i) => this.#plant(side, i, phases[i], s, dt, r));

        // Toes bend to stay flat on the ground as the heel lifts
        SIDES.forEach((side, i) => this.#flattenToes(side, i));

        // Anything layered over the walk that places the hands (reaching to swing a weapon)
        this.afterPose?.(dt);
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

    /**
     * How high the pelvis sits running, at phase `p`: a smooth wave twice a stride, lowest in the
     * middle of each foot's time on the ground (as low as lets that foot touch the ground in the
     * sprinting pose) and highest in the air between steps. Measured once for each style and body.
     */
    #runningHeight(p) {
        if (this.runHeight === null) {
            this.#setJoints([RUN_LOWEST, wrap(RUN_LOWEST + 0.5)], 1, 0, 1);
            this.rig.apply();
            this.character.object.updateMatrixWorld(true);
            this.runHeight = -this.#lowest(0) - 0.004;
        }

        const rise = this.legLength * RUN_RISE;

        return this.runHeight + rise - rise * Math.cos(4 * Math.PI * (p - RUN_LOWEST));
    }

    /**
     * Set the joints for the feet's phases (left, right), `s` of a full stride, `r` of the way
     * from walking to running.
     */
    #setJoints(phases, s, breathe, r = 0) {
        const rig = this.rig;
        const style = this.style;
        const p = phases[0];
        const walk = 1 - r;
        const mix = (a, b) => a * walk + b * r;
        // (A sprinting curve, not worked out when it's not running at all)
        const running = (curve, phase) => (r > 0 ? curveAt(curve, phase) : 0);

        rig.reset();

        // Pelvis: tilt, obliquity (drops on the swinging side) and rotation (forward with the leg),
        // turning further running
        const obliquity = mix(s, 1.2) * style.swagger * curveAt(CURVES.pelvicObliquity, p);
        const rotation = mix(s, 1.5) * style.swagger * curveAt(CURVES.pelvicRotation, p);

        rig.setAngles("Hips", { tilt: 0, obliquity, turn: rotation });

        // Trunk: leans (further running), counter-rotates against the pelvis and stays upright
        const lean = style.lean + mix(s * 2 + breathe * 0.6 * (1 - s), RUN_LEAN);
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

        // Legs, from the gait curves (stance width sets how far the thighs come in; running, the
        // feet land nearly in a line; in a robe to the ankles, its heels not kicked up behind as
        // high: Character.robed)
        const robed = (knee) => (this.character.robed && knee > ROBED_KNEE.from ? ROBED_KNEE.from + (knee - ROBED_KNEE.from) * ROBED_KNEE.share : knee);
        const inward = Math.atan2((this.hipWidth - mix(style.stanceWidth, RUN_STANCE_WIDTH)) / 2, this.legLength) * (180 / Math.PI);

        SIDES.forEach((side, i) => {
            const phase = phases[i];
            const crouch = style.crouch * walk;

            rig.setAngles(`${side}UpLeg`, {
                flex: mix(s * (curveAt(CURVES.hipFlexion, phase) - PELVIC_TILT), running(RUN_CURVES.thigh, phase)) + crouch + lean * 0.3,
                abduct: -mix(s, 1.2) * curveAt(CURVES.hipAdduction, phase) - inward,
                rotate: -style.toeOut * 0.5 * walk,
            });
            rig.setAngles(`${side}Leg`, { flex: mix(s * curveAt(CURVES.kneeFlexion, phase), robed(running(RUN_CURVES.kneeFlexion, phase))) + crouch * 1.6 });
            rig.setAngles(`${side}Foot`, { flex: mix(s * curveAt(CURVES.ankleDorsiflexion, phase), running(RUN_CURVES.ankleDorsiflexion, phase)) + crouch * 0.6, rotate: style.toeOut * 0.5 * walk, invert: inward * 0.6 });

            // Arms swing against the legs (pumping, running), or carry what's in the hand
            const hold = this.character.holds[side];
            const swing = s * curveAt(CURVES.shoulderFlexion, phase);
            const elbowSwing = s * (curveAt(CURVES.elbowFlexion, phase) - 10);
            const pump = running(RUN_CURVES.shoulderFlexion, phase);
            const bend = running(RUN_CURVES.elbowFlexion, phase);

            rig.setAngles(`${side}Shoulder`, { elevate: 0, protract: mix(swing, pump) * 0.15 });

            if (hold?.Arm) {
                // Carrying something, the arm pumps less, the elbow bending towards a sprinter's (and
                // held out a little from what hangs at that hip: Character.hung)
                const amount = hold.swing ?? 0.3;

                rig.setAngles(`${side}Arm`, { ...hold.Arm, flex: hold.Arm.flex + mix(amount * (swing + style.armForward * s) + breathe * 0.5, (0.35 + amount * 0.6) * pump), abduct: (hold.Arm.abduct ?? 0) + style.armSpread * 0.5 + (this.character.hung?.[side] ?? 0) * 0.5 });
                rig.setAngles(`${side}ForeArm`, { ...hold.ForeArm, flex: mix(hold.ForeArm.flex + amount * elbowSwing * 0.5, hold.ForeArm.flex + (bend - hold.ForeArm.flex) * 0.6) });
                rig.setAngles(`${side}Hand`, hold.Hand ?? {});
            } else {
                rig.setAngles(`${side}Arm`, {
                    flex: mix(swing + s * style.armForward + breathe * 0.5, pump),
                    abduct: mix(style.armSpread + s * 2, 10) + (this.character.clearing?.[side] ?? 0),
                    rotate: mix(5, 15),
                });
                rig.setAngles(`${side}ForeArm`, { flex: mix(10 + style.elbow + elbowSwing, bend), pronate: mix(25, 45) });
                rig.setAngles(`${side}Hand`, { flex: mix(8, 0), deviate: -5 });
            }

            // Fingers: relaxed, or closed round a grip
            const grip = hold?.grips;

            ["Index", "Middle", "Ring", "Pinky"].forEach((finger, k) => {
                const curl = grip ? hold.curl?.[k] ?? 78 : style.fingers * (finger === "Index" ? 0.7 : finger === "Pinky" ? 1.25 : 1);

                for (const joint of [1, 2, 3]) {
                    // (A fist's fingers as it has them, equipment.js FIST_HAND: each joint's curl, the knuckles turned together)
                    const flex = grip && hold.fingers ? hold.fingers[joint - 1] : curl * (joint === 1 ? (grip ? 0.95 : 0.8) : grip ? 1.05 : 1);

                    rig.setAngles(`${side}Hand${finger}${joint}`, { flex, spread: grip && joint === 1 ? (hold.spread?.[k] ?? 0) : 0 });
                }
            });

            // The thumb closed over the fingers round a grip (or as the hold says: a wand's pinched), or resting by the index
            const thumb = grip ? hold.thumb ?? GRIP_THUMB : [{ flex: 10, oppose: 10 }, { flex: style.fingers * 0.5 }, { flex: 6 }];

            thumb.forEach((angles, k) => rig.setAngles(`${side}HandThumb${k + 1}`, angles));
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

    // Lower the pelvis as far as lets each planted foot (not let go of the ground) stay where it
    // is with its leg no straighter than the walk has it, or than it reaches (REACH)
    #give() {
        const object = this.character.object;
        const scale = object.getWorldScale(_scale).y;
        let drop = 0;

        SIDES.forEach((side, i) => {
            const foot = this.feet[i];

            if (!foot.planted || this.freed?.(side) > 0) {
                return;
            }

            const now = this.#contact(i, foot.pivot, _under);
            const ankle = _target.setFromMatrixPosition(this.rig.bone(`${side}Foot`).matrixWorld);
            const hip = _hip.setFromMatrixPosition(this.rig.bone(`${side}UpLeg`).matrixWorld);
            // (A millimetre short of that, so it's within reach after rounding)
            const most = Math.max(this.reaches[i] * REACH * scale, ankle.distanceTo(hip)) - GIVE_SPARE * scale;

            ankle.x += foot.lock.x - now.x;
            ankle.z += foot.lock.z - now.z;
            ankle.y -= this.#lowest(i);
            ankle.sub(hip);

            const across = ankle.x * ankle.x + ankle.z * ankle.z;

            if (ankle.lengthSq() > most * most && across < most * most) {
                drop = Math.max(drop, -ankle.y - Math.sqrt(most * most - across));
            }
        });

        if (drop > 1e-4) {
            this.rig.offset.y -= drop / scale;
            this.rig.apply();
            object.updateMatrixWorld(true);
        }
    }

    #plant(side, i, phase, s, dt = 0, r = 0) {
        const foot = this.feet[i];
        const free = Math.min(1, Math.max(0, this.freed?.(side) ?? 0));
        const object = this.character.object;
        const ground = object.getWorldPosition(_point).y;
        const stance = STANCE + (RUN_STANCE - STANCE) * r;
        const onGround = s === 0 || phase < stance;

        // Walking, the foot pivots on its heel early in stance, on its ball late in stance;
        // running, it lands on the ball
        const pivot = r < 0.5 && (s === 0 || phase < stance * 0.48) ? "heel" : "ball";
        const now = this.#contact(i, pivot);

        now.y = ground;

        if (onGround && !foot.planted) {
            foot.planted = true;
            foot.pivot = pivot;
            foot.lock.copy(now);

            if (s > 0 && this.speed > 0.3) {
                this.onStep?.(i, this.speed);
            }
        } else if (onGround && foot.pivot !== pivot) {
            // Rolling onto the ball: keep the correction so far, pivoting about the new point
            foot.pivot = pivot;
            foot.lock.copy(now).add(foot.correction);
        } else if (!onGround && foot.planted) {
            foot.planted = false;
            foot.release.copy(foot.correction);
        }

        // Standing still and turned (to face someone), the feet shuffle round under the body
        // (not while the other's off the ground, kicking: this one stands firm), but not after a
        // body leaning over them: towards where the foot would be under the pelvis as the walk
        // has it (moved back and turned back from where what's layered over the walk put it)
        const other = SIDES[1 - i];

        if (foot.planted && s === 0 && dt > 0 && !this.stepped && !(this.freed?.(other) > 0)) {
            const { rig, stance } = this;
            const space = rig.root.parent ?? rig.root;
            const hips = _hips.copy(rig.heads[0]);
            const under = space.worldToLocal(_under.copy(now)).sub(hips).sub(rig.offset);

            under.applyQuaternion(_turn.copy(rig.rotations[0]).invert().premultiply(stance.turn)).add(hips).add(stance.offset);
            space.localToWorld(under);

            const off = foot.lock.distanceTo(under);

            if (off > 0.02) {
                foot.lock.lerp(under, Math.min(1, (dt * SHUFFLE) / off));
            }
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
            // Lifting off from the ground, easing into clearing it by a little (and, however long
            // it's in the air, soon no longer making up for how far it had slid)
            const off = smooth(stance, stance + 0.08, phase);
            const lowest = this.#lowest(i);

            foot.release.multiplyScalar(Math.exp(-LET_GO * dt));
            foot.correction.copy(foot.release).multiplyScalar(1 - smooth(stance, stance + 0.2, phase));
            lift = -lowest + (Math.max(0, 0.008 * off - lowest) + lowest) * off;
        }

        // Let go of the ground (kicking): the leg as the joint angles have it, as far as it's
        // free; mostly free, the foot plants afresh wherever it comes down
        if (free > 0) {
            foot.correction.multiplyScalar(1 - free);
            lift *= 1 - free;

            if (free > 0.5) {
                foot.planted = false;
                foot.release.set(0, 0, 0);
            }
        }

        if (foot.correction.lengthSq() < 1e-8 && Math.abs(lift) < 1e-4) {
            return;
        }

        // Where the ankle has to be: no further from the hip than the leg reaches (a planted foot
        // that would need it slides along with the body instead)
        _target.setFromMatrixPosition(this.rig.bone(`${side}Foot`).matrixWorld);
        _hip.setFromMatrixPosition(this.rig.bone(`${side}UpLeg`).matrixWorld);

        // (As far as it reaches, or as straight as the walk has it)
        const reach = Math.max(this.reaches[i] * REACH * object.getWorldScale(_scale).y, _target.distanceTo(_hip));

        _target.y += lift;

        const d = _reach.copy(_target).sub(_hip);
        const c = foot.correction;

        if (d.clone().add(c).lengthSq() > reach * reach) {
            const a = c.lengthSq();
            const b = 2 * d.dot(c);
            const e = d.lengthSq() - reach * reach;
            const share = e >= 0 ? 0 : (-b + Math.sqrt(Math.max(0, b * b - 4 * a * e))) / (2 * a);

            c.multiplyScalar(Math.min(1, Math.max(0, share)));

            if (foot.planted) {
                foot.lock.copy(now).add(c);
            }
        }

        // In the character's space, the knee bending forward
        _target.add(c);
        object.worldToLocal(_target);
        this.rig.reach(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, _target, { pole: KNEE });

        // (Planted only where a fall's clip plants it, a foot its hip can't keep it at within its
        // range is let go of, the hip held to its range: it goes with the body as it falls, and
        // is planted again where it's got to. Not through the ground as it's let go of, the body
        // sinking onto it: lifted out, the knee bent to it, as a swinging foot's kept clear)
        if (this.stepped && foot.planted && this.#holdHip(side) > HIP_GIVE) {
            const under = -this.#lowest(i);

            foot.planted = false;

            if (under > 0) {
                _target.setFromMatrixPosition(this.rig.bone(`${side}Foot`).matrixWorld);
                _target.y += under;
                object.worldToLocal(_target);
                this.rig.reach(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, _target, { pole: KNEE });
            }
        }

        // Standing, crouched lower than the ankle bends, or walking, the body come further over
        // the foot than it bends (late in stance, on the ball): up onto the ball of the foot, the
        // heel lifted, rather than the shin bent further over it (a few times: the shin tips as
        // the ankle rises)
        if (foot.planted && free === 0 && (s === 0 || foot.pivot === "ball")) {
            for (let k = 0; k < RISES && this.#rise(side, i); k++) {
                // (Again, from where the last lift left the shin)
            }
        }
    }

    // Sitting: a foot the pose puts into the floor brought onto it forward, the shin swung forward
    // about the knee (the thigh level on the seat, as it was: a long-legged body's feet further out
    // in front of it), the foot turned as it was; straight up, if it can't reach it so
    #onFloor(side, i) {
        const under = -this.#lowest(i);

        if (!(under > 0)) {
            return;
        }

        const object = this.character.object;
        const knee = _knee.setFromMatrixPosition(this.rig.bone(`${side}Leg`).matrixWorld);
        const shin = _shin.setFromMatrixPosition(this.rig.bone(`${side}Foot`).matrixWorld).sub(knee);
        const forward = _ahead.set(0, 0, 1).applyQuaternion(object.getWorldQuaternion(_footTurn)).setY(0).normalize();
        const across = _across.crossVectors(UP, forward);
        const down = shin.y + under;
        const aside = shin.dot(across);
        const out = shin.lengthSq() - down * down - aside * aside;

        if (out > 0 && shin.dot(forward) < Math.sqrt(out)) {
            shin.copy(across).multiplyScalar(aside).addScaledVector(forward, Math.sqrt(out)).setY(down);
        } else {
            shin.y += under;
        }

        _target.copy(knee).add(shin);
        object.worldToLocal(_target);
        this.rig.reach(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, _target, { pole: KNEE });
    }

    // Hold a hip (`side`'s) within its range, the leg below going with it; returns how far past
    // its range it was (degrees)
    #holdHip(side) {
        const rig = this.rig;
        const b = rig.index.get(`${side}UpLeg`);
        const bone = rig.bones[b];
        const parent = rig.frames[rig.definition[b].parent];
        const { kind, side: s } = rig.joints[b];

        _hipTurn.copy(parent).invert().multiply(bone.quaternion).multiply(rig.frames[b]);
        _hipHeld.copy(_hipTurn);
        limitRotation(kind, s, _hipHeld);

        const over = (_hipTurn.angleTo(_hipHeld) * 180) / Math.PI;

        if (over > HIP_GIVE) {
            bone.quaternion.copy(parent).multiply(_hipHeld).multiply(_hipTurn.copy(rig.frames[b]).invert());
            bone.updateMatrixWorld(true);
        }

        return over;
    }

    // Lift a planted foot's heel (turning it about the ball, which stays where it is) as far as
    // keeps its ankle within DORSIFLEXION, the leg reached again to the ankle there. Whether it
    // was lifted
    #rise(side, i) {
        const rig = this.rig;
        const b = rig.index.get(`${side}Foot`);
        const foot = rig.bones[b];
        const { kind, side: s } = rig.joints[b];

        _ankle.copy(rig.frames[rig.definition[b].parent]).invert().multiply(foot.quaternion).multiply(rig.frames[b]);

        const over = jointAngles(kind, s, _ankle, _angles).flex - DORSIFLEXION;

        if (!(over > 0.25)) {
            return false;
        }

        const ball = this.#contact(i, "ball", _ball);
        const forward = this.#contact(i, "heel", _heel).sub(ball).negate();
        const axis = forward.crossVectors(UP, forward.setY(0)).normalize();

        _lift.setFromAxisAngle(axis, (over * Math.PI) / 180);
        _target.setFromMatrixPosition(foot.matrixWorld).sub(ball).applyQuaternion(_lift).add(ball);
        foot.quaternion.copy(foot.parent.getWorldQuaternion(_footTurn).invert().multiply(foot.getWorldQuaternion(_ankle).premultiply(_lift)));
        foot.updateMatrixWorld(true);
        this.character.object.worldToLocal(_target);
        rig.reach(`${side}UpLeg`, `${side}Leg`, `${side}Foot`, _target, { pole: KNEE });

        return true;
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
