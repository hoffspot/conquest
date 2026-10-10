// A body thrown by a blast and falling as it will (docs/CHARACTERS.md *Thrown*): a ragdoll of
// points joined by sticks, after Jakobsen's "Advanced Character Physics" (the Hitman ragdolls)
// and position-based dynamics (Müller et al.): no physics engine, a few hundred lines, cheap
// enough to throw a handful of bodies at once on a phone.
//
// Sixteen points stand at the body's joints (POINTS: the pelvis, the chest, the neck, the top of
// the head, and each shoulder, elbow, wrist, hip, knee and ankle), each with its share of the
// body's weight. Sticks hold them as far apart as the body has them when it's thrown (STICKS:
// its bones, and braces across the trunk so it twists but doesn't fold up); knees and elbows bend
// only the way they do, and only so far (LIMBS); the head, the thighs and the arms swing no
// further than their joints let them (CONES, and APART: a knee kept off its shoulder); the ground
// holds every point above it, with a little friction and next to no bounce. What holds a joint
// moves the trunk the other way as it moves the limb, each as much as it's light, so the body's
// momentum is kept and the holds don't fling it about. Each frame is stepped in RAGDOLL.substeps
// small steps, each projecting every constraint once (XPBD's "small steps": steadier than as
// many passes in one).
//
// The body's drawn from the points: each limb's bones turned as far as its points have turned
// since it was thrown (frameOf: a frame from a bone's direction and a reference across the body),
// then held to their joints' ranges of motion (rig.js limitRotation), so however the points lie
// the body's never posed as no body can be; what the points don't reach (the hands, the feet,
// the fingers, the collarbones) keeps the pose it was thrown in. Down, actions.js keeps what's
// drawn out of the ground.

import * as THREE from "three";
import { limitRotation } from "./rig.js";

// The points: a name, the bone it's at (its head, or `tail`: the top of the head), its mass
// (kilograms, of a body of 70) and its reach (metres: how far its flesh comes out round it, kept
// off the ground)
const POINTS = Object.freeze([
    { name: "pelvis", bone: "Hips", mass: 12, radius: 0.14 },
    { name: "chest", bone: "Spine2", mass: 12, radius: 0.15 },
    { name: "neck", bone: "Neck", mass: 4, radius: 0.07 },
    { name: "head", bone: "Head", tail: true, mass: 5, radius: 0.1 },
    { name: "leftShoulder", bone: "LeftArm", mass: 3, radius: 0.06 },
    { name: "leftElbow", bone: "LeftForeArm", mass: 2, radius: 0.05 },
    { name: "leftWrist", bone: "LeftHand", mass: 1, radius: 0.05 },
    { name: "rightShoulder", bone: "RightArm", mass: 3, radius: 0.06 },
    { name: "rightElbow", bone: "RightForeArm", mass: 2, radius: 0.05 },
    { name: "rightWrist", bone: "RightHand", mass: 1, radius: 0.05 },
    { name: "leftHip", bone: "LeftUpLeg", mass: 6, radius: 0.09 },
    { name: "leftKnee", bone: "LeftLeg", mass: 4, radius: 0.06 },
    { name: "leftAnkle", bone: "LeftFoot", mass: 2, radius: 0.05 },
    { name: "rightHip", bone: "RightUpLeg", mass: 6, radius: 0.09 },
    { name: "rightKnee", bone: "RightLeg", mass: 4, radius: 0.06 },
    { name: "rightAnkle", bone: "RightFoot", mass: 2, radius: 0.05 },
]);

const P = Object.fromEntries(POINTS.map(({ name }, k) => [name, k]));

// The sticks: two points, and how stiff (1 held exactly; less, giving): the bones, then the
// braces across the trunk, the shoulders and the hips, the head held up on the neck
const STICKS = Object.freeze([
    ["pelvis", "chest", 1],
    ["chest", "neck", 1],
    ["neck", "head", 1],
    ["chest", "leftShoulder", 1],
    ["chest", "rightShoulder", 1],
    ["leftShoulder", "rightShoulder", 1],
    ["leftShoulder", "leftElbow", 1],
    ["leftElbow", "leftWrist", 1],
    ["rightShoulder", "rightElbow", 1],
    ["rightElbow", "rightWrist", 1],
    ["pelvis", "leftHip", 1],
    ["pelvis", "rightHip", 1],
    ["leftHip", "rightHip", 1],
    ["leftHip", "leftKnee", 1],
    ["leftKnee", "leftAnkle", 1],
    ["rightHip", "rightKnee", 1],
    ["rightKnee", "rightAnkle", 1],
    // (The trunk braced: hips to shoulders, crosswise too)
    ["leftHip", "leftShoulder", 0.9],
    ["rightHip", "rightShoulder", 0.9],
    ["leftHip", "rightShoulder", 0.6],
    ["rightHip", "leftShoulder", 0.6],
    ["pelvis", "neck", 0.8],
    // (The head held up on the shoulders, giving)
    ["head", "leftShoulder", 0.25],
    ["head", "rightShoulder", 0.25],
    ["head", "chest", 0.3],
]);

// The limbs: each from its root (a hip, a shoulder) through its middle joint (a knee, an elbow)
// to its end, on its trunk (`trunk`: the pelvis, or the chest, TRUNKS). Its middle joint bends one
// way (`bends`: a knee's forward of the line from hip to ankle, 1; an elbow's behind the line from
// shoulder to wrist, -1), as the limb's swung (its front turned with it from hanging straight
// down: swung), and no further than a knee's 140° or an elbow's 150° (`least`: the nearest its
// ends come, of the limb's length); and out of the line it bends in no further than its root
// turns the limb about itself (`twist`, of how far it's bent: a hip's 35°, a shoulder's 65°, as
// tangents). How far it swings at its root: CONES
const LIMBS = Object.freeze([
    { root: "leftHip", joint: "leftKnee", end: "leftAnkle", trunk: "pelvis", side: 1, bends: 1, least: 0.36, twist: 0.7, frames: ["leftThigh", "leftShin"] },
    { root: "rightHip", joint: "rightKnee", end: "rightAnkle", trunk: "pelvis", side: -1, bends: 1, least: 0.36, twist: 0.7, frames: ["rightThigh", "rightShin"] },
    { root: "leftShoulder", joint: "leftElbow", end: "leftWrist", trunk: "chest", side: 1, bends: -1, least: 0.28, twist: 2.1, frames: ["leftArm", "leftForeArm"] },
    { root: "rightShoulder", joint: "rightElbow", end: "rightWrist", trunk: "chest", side: -1, bends: -1, least: 0.28, twist: 2.1, frames: ["rightArm", "rightForeArm"] },
]);

// What's kept apart (sticks that only push): a knee and the shoulder over it, never nearer than
// `share` of the thigh's and the trunk's lengths put together, so a hip bends no further than it
// does (about 120°) and a leg's never thrown up over the body
const APART = Object.freeze([
    { a: "leftKnee", b: "leftShoulder", root: "leftHip", share: 0.5 },
    { a: "rightKnee", b: "rightShoulder", root: "rightHip", share: 0.5 },
]);

// How far a part swings at its joint, near enough as the joint's range has it (rig.js JOINTS): a
// cone about a way out of its trunk (TRUNKS `trunk`), `most` degrees round; the head on the neck,
// each thigh at its hip, each arm at its shoulder. `pivot` is the joint, `tip` the part's far end,
// `axis` the cone's middle in the trunk's frame ([across to its left, up, front]; a limb's `side`
// turning it to the right for the right). A thigh swings forward 120° and back 30°, an arm every
// way but behind the back and across it
const CONES = Object.freeze([
    { pivot: "neck", tip: "head", trunk: "chest", side: 1, axis: [0, 1, 0], most: 40 },
    { pivot: "leftHip", tip: "leftKnee", trunk: "pelvis", side: 1, axis: [0, -Math.SQRT1_2, Math.SQRT1_2], most: 75 },
    { pivot: "rightHip", tip: "rightKnee", trunk: "pelvis", side: -1, axis: [0, -Math.SQRT1_2, Math.SQRT1_2], most: 75 },
    { pivot: "leftShoulder", tip: "leftElbow", trunk: "chest", side: 1, axis: [Math.sqrt(3) / 2, 0, 0.5], most: 115 },
    { pivot: "rightShoulder", tip: "rightElbow", trunk: "chest", side: -1, axis: [Math.sqrt(3) / 2, 0, 0.5], most: 115 },
]);

// The trunk's two frames, from its points: what's across it (from its right to its left) and up it
const TRUNKS = Object.freeze({ pelvis: { left: "leftHip", right: "rightHip", low: "pelvis", high: "chest" }, chest: { left: "leftShoulder", right: "rightShoulder", low: "chest", high: "neck" } });

// A limb's middle joint moved `by` metres along `towards` (a unit THREE.Vector3) from halfway
// between its ends, and its ends the other way, each as much as it's light: the limb's momentum
// kept, so holding a knee or an elbow to how it bends doesn't fling the body
function bend(root, joint, end, towards, by) {
    const push = by / (joint.inverse + (root.inverse + end.inverse) / 4);

    joint.at.addScaledVector(towards, push * joint.inverse);
    root.at.addScaledVector(towards, (-push * root.inverse) / 2);
    end.at.addScaledVector(towards, (-push * end.inverse) / 2);
}

// (How much of the way back to its cone a part's brought each small step: all at once, and the
// cones fight the ground)
const CONE_STIFFNESS = 0.5;

/**
 * How a thrown body's stepped and when it's still (seconds, metres, metres a second): `substeps`
 * small steps a frame of at most `longest` (a slow frame's taken as one that long); damped
 * `damping` a second in the air; on the ground its points' sliding dies away `friction` a second
 * (a tenth of it left in a quarter of a second) and they bounce `bounce` of how fast they hit;
 * still once none of it has moved faster than `still` for `stillFor`, or after `most` at most.
 */
export const RAGDOLL = Object.freeze({ substeps: 8, longest: 1 / 20, damping: 0.4, friction: 10, bounce: 0.1, still: 0.25, stillFor: 0.3, most: 3.5 });

// Which bones are posed by which of the body's frames (frameOf), and as how much of the turn
// between two (the spine bends a third of the way at each of its three bones)
const POSED = Object.freeze({
    Hips: ["pelvis"],
    Spine: ["pelvis", "torso", 1 / 3],
    Spine1: ["pelvis", "torso", 2 / 3],
    Spine2: ["torso"],
    Neck: ["torso", "head", 1 / 2],
    Head: ["head"],
    LeftArm: ["leftArm"],
    LeftForeArm: ["leftForeArm"],
    RightArm: ["rightArm"],
    RightForeArm: ["rightForeArm"],
    LeftUpLeg: ["leftThigh"],
    LeftLeg: ["leftShin"],
    RightUpLeg: ["rightThigh"],
    RightLeg: ["rightShin"],
});

// The body's frames: the trunk's and the head's, each a bone's direction (from one point to
// another) and what's across it ("hips": left hip from right; "shoulders": left shoulder from
// right); and each limb's two (LIMBS `frames`, #limbFrames), about its middle joint's hinge
const FRAMES = Object.freeze({
    pelvis: ["pelvis", "chest", "hips"],
    torso: ["chest", "neck", "shoulders"],
    head: ["neck", "head", "shoulders"],
});
const NAMES = Object.freeze([...Object.keys(FRAMES), ...LIMBS.flatMap(({ frames }) => frames)]);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _across = new THREE.Vector3();
const _up = new THREE.Vector3();
const _front = new THREE.Vector3();
const _limbFront = new THREE.Vector3();
const _limbAcross = new THREE.Vector3();
const _along = new THREE.Vector3();
const _lower = new THREE.Vector3();
const _hinge = new THREE.Vector3();
const _swing = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _r = new THREE.Quaternion();
const _identity = new THREE.Quaternion();

/**
 * A frame (a rotation, into `target`) whose y is `along` and whose x is as near `across` as is
 * square to it (or, where `across` lies near along it, `otherwise`).
 */
export function frameOf(along, across, otherwise, target = new THREE.Quaternion()) {
    const y = _a.copy(along).normalize();
    const x = _b.copy(across).normalize();
    // (Across lying near along the bone, the other way across, coming in smoothly)
    const near = Math.abs(x.dot(y));
    const blend = near < 0.7 ? 0 : Math.min(1, (near - 0.7) / 0.25);

    if (blend > 0) {
        x.lerp(_c.copy(otherwise).normalize(), blend);
    }

    x.addScaledVector(y, -x.dot(y)).normalize();

    const z = _c.crossVectors(x, y);

    return target.setFromRotationMatrix(_m.makeBasis(x, y, z));
}

const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

/**
 * A trunk's frame (TRUNKS: the pelvis's or the chest's) from where its points are (`at(name)`):
 * across it, up it and its front, each a unit (into `across`, `up`, `front`).
 */
function trunkFrame({ left, right, low, high }, at, across, up, front) {
    across.subVectors(at(left), at(right)).normalize();
    up.subVectors(at(high), at(low));
    up.addScaledVector(across, -up.dot(across)).normalize();
    front.crossVectors(across, up);
}

/**
 * How a limb's swung from hanging straight down its trunk (`up`, `across`, `front`: its frame) to
 * `along` (a unit), the shortest way, turns what's across it and its front (into `across` and
 * `front`): turned about itself no more than that, as the rig has a joint (rig.js limitRotation:
 * its swing from hanging down, then its twist).
 */
function swung(along, across, up, front, intoAcross, intoFront) {
    const down = _c.copy(up).negate();

    // (Straight up: over the front)
    if (down.dot(along) < -0.9999) {
        _swing.setFromAxisAngle(across, Math.PI);
    } else {
        _swing.setFromUnitVectors(down, along);
    }

    intoAcross.copy(across).applyQuaternion(_swing);
    intoFront.copy(front).applyQuaternion(_swing);
}

export class Ragdoll {
    /**
     * A ragdoll of a character's body (character.js: its rig, and its object, which the rig's
     * space is), thrown as it stands posed now (throw).
     */
    constructor(rig, object) {
        this.rig = rig;
        this.object = object;
        this.points = POINTS.map(({ mass, radius }) => ({ at: new THREE.Vector3(), was: new THREE.Vector3(), velocity: new THREE.Vector3(), inverse: 1 / mass, radius }));
        this.sticks = STICKS.map(([a, b, stiffness]) => ({ a: P[a], b: P[b], stiffness, length: 0 }));
        this.limbs = LIMBS.map((limb) => ({ ...limb, root: P[limb.root], joint: P[limb.joint], end: P[limb.end], least: 0, share: limb.least }));
        this.apart = APART.map(({ a, b, root, share }) => ({ a: P[a], b: P[b], root: P[root], share, least: 0 }));
        this.cones = CONES.map(({ pivot, tip, trunk, side, axis, most }) => ({ pivot: P[pivot], tip: P[tip], trunk, base: P[TRUNKS[trunk].low], axis: [axis[0] * side, axis[1], axis[2]], cos: Math.cos((most * Math.PI) / 180), sin: Math.sin((most * Math.PI) / 180) }));

        // Each bone's rotation in the rig's space when thrown, and its local rotation then (for
        // those the points don't reach); the frames when thrown (to turn the bones from)
        this.thrown = rig.bones.map(() => new THREE.Quaternion());
        this.local = rig.bones.map(() => new THREE.Quaternion());
        this.frames0 = Object.fromEntries(NAMES.map((name) => [name, new THREE.Quaternion()]));
        this.frames = Object.fromEntries(NAMES.map((name) => [name, new THREE.Quaternion()]));
        this.turns = Object.fromEntries(NAMES.map((name) => [name, new THREE.Quaternion()]));
        this.posed = rig.bones.map(() => new THREE.Quaternion());
        // (How each bone's turned in the rig's space as the points have it, before its joint's
        // held to its range, and as it's posed)
        this.wanted = rig.bones.map(() => new THREE.Quaternion());
        this.local3 = rig.bones.map(() => new THREE.Vector3());
        this.time = 0;
        this.still = 0;
        this.grounded = false;
        this.done = false;
    }

    /** Where a point is (POINTS name), in the world. */
    point(name) {
        return this.points[P[name]].at;
    }

    /**
     * Throw the body as it's posed now: every point moving at `velocity` (metres a second, in
     * the world, a THREE.Vector3), the body turning about its pelvis at `spin` (radians a second,
     * a THREE.Vector3: about its axis, as fast as it's long), pulled down by `gravity` (metres a
     * second²; a blast's throw is quicker than a fall from that high would be, to read well).
     */
    throw({ velocity, spin, gravity = 9.8 }) {
        const rig = this.rig;
        const object = this.object;

        object.updateMatrixWorld(true);

        // The bones as they're posed, in the rig's space: each one's rotation, and where its head is
        rig.definition.forEach(({ parent }, i) => {
            const bone = rig.bones[i];

            this.local[i].copy(bone.quaternion);
            this.thrown[i].copy(parent >= 0 ? this.thrown[parent] : _identity).multiply(bone.quaternion);
            this.local3[i].copy(bone.position);

            if (parent >= 0) {
                this.local3[i].applyQuaternion(this.thrown[parent]).add(this.local3[parent]);
            }
        });

        // Each point where its joint is, in the world (the top of the head out along its bone,
        // as far as it rests: in its bone's frame, at rest the rig's)
        POINTS.forEach(({ bone, tail }, k) => {
            const i = rig.index.get(bone);
            const at = this.points[k].at.copy(this.local3[i]);

            if (tail) {
                at.add(_a.copy(rig.tails[i]).sub(rig.heads[i]).applyQuaternion(this.thrown[i]));
            }

            object.localToWorld(at);
        });

        const pelvis = this.points[P.pelvis].at;

        for (const point of this.points) {
            point.was.copy(point.at);
            point.velocity.copy(velocity).add(_b.copy(point.at).sub(pelvis).cross(spin).negate());
        }

        for (const stick of this.sticks) {
            stick.length = this.points[stick.a].at.distanceTo(this.points[stick.b].at);
        }

        for (const limb of this.limbs) {
            limb.least = (this.points[limb.root].at.distanceTo(this.points[limb.joint].at) + this.points[limb.joint].at.distanceTo(this.points[limb.end].at)) * limb.share;
        }

        for (const kept of this.apart) {
            kept.least = (this.points[kept.root].at.distanceTo(this.points[kept.a].at) + this.points[kept.root].at.distanceTo(this.points[kept.b].at)) * kept.share;
        }

        this.gravity = gravity;
        this.#frames(this.frames0);
        Object.assign(this, { time: 0, still: 0, grounded: false, done: false });
    }

    /**
     * Step it on `dt` seconds over the ground (`ground(x, z)`: its height there, metres). Returns
     * whether it's still: settled on the ground, or past RAGDOLL.most.
     */
    step(dt, ground) {
        if (this.done || dt <= 0) {
            return this.done;
        }

        dt = Math.min(dt, RAGDOLL.longest);

        const h = dt / RAGDOLL.substeps;
        const damping = Math.exp(-RAGDOLL.damping * h);
        const sliding = Math.exp(-RAGDOLL.friction * h);
        let fastest = 0;

        for (let s = 0; s < RAGDOLL.substeps; s++) {
            // Each point on its way, falling
            for (const point of this.points) {
                point.velocity.y -= this.gravity * h;
                point.velocity.multiplyScalar(damping);
                point.was.copy(point.at);
                point.at.addScaledVector(point.velocity, h);
            }

            this.#constrain();

            // How fast each went, as it was held; and on the ground, sliding less and hardly
            // bouncing
            for (const point of this.points) {
                point.velocity.subVectors(point.at, point.was).divideScalar(h);

                const floor = ground(point.at.x, point.at.z) + point.radius;

                if (point.at.y < floor) {
                    point.at.y = floor;
                    this.grounded = true;

                    if (point.velocity.y < 0) {
                        point.velocity.y *= -RAGDOLL.bounce;
                    }

                    point.velocity.x *= sliding;
                    point.velocity.z *= sliding;
                }

                fastest = Math.max(fastest, point.velocity.length());
            }
        }

        this.time += dt;
        this.still = this.grounded && fastest < RAGDOLL.still ? this.still + dt : 0;
        this.done = this.still >= RAGDOLL.stillFor || this.time >= RAGDOLL.most;

        return this.done;
    }

    // Every stick held to its length, and every knee and elbow to the way and as far as it bends
    #constrain() {
        const points = this.points;

        for (const { a, b, stiffness, length } of this.sticks) {
            const pa = points[a];
            const pb = points[b];
            const d = _a.subVectors(pb.at, pa.at);
            const now = d.length();
            const total = pa.inverse + pb.inverse;

            if (now < 1e-9 || total <= 0) {
                continue;
            }

            const push = ((now - length) / (now * total)) * stiffness;

            pa.at.addScaledVector(d, push * pa.inverse);
            pb.at.addScaledVector(d, -push * pb.inverse);
        }

        for (const { a, b, least } of this.apart) {
            const pa = points[a];
            const pb = points[b];
            const d = _a.subVectors(pb.at, pa.at);
            const now = d.length();

            if (now < least && now > 1e-9) {
                const push = (now - least) / (now * (pa.inverse + pb.inverse));

                pa.at.addScaledVector(d, push * pa.inverse);
                pb.at.addScaledVector(d, -push * pb.inverse);
            }
        }

        const at = (name) => points[P[name]].at;

        // Swung further than its joint lets it: brought back to the edge of its cone, its trunk
        // pushed the other way (each as much as it's light)
        for (const { pivot, tip, trunk, base, axis, cos, sin } of this.cones) {
            const pp = points[pivot];
            const pt = points[tip];
            const pb = points[base];
            const d = _b.subVectors(pt.at, pp.at);
            const length = d.length();

            if (length < 1e-9) {
                continue;
            }

            trunkFrame(TRUNKS[trunk], at, _across, _up, _front);

            const middle = _c.set(0, 0, 0).addScaledVector(_across, axis[0]).addScaledVector(_up, axis[1]).addScaledVector(_front, axis[2]);

            d.divideScalar(length);

            const now = d.dot(middle);

            if (now >= cos) {
                continue;
            }

            // (Turned towards its middle as far as its edge; straight away from it, any way round)
            const round = _d.copy(d).addScaledVector(middle, -now);

            if (round.lengthSq() < 1e-9) {
                round.copy(Math.abs(middle.dot(_front)) < 0.9 ? _front : _up).addScaledVector(middle, -middle.dot(round));
            }

            round.normalize();

            const move = _a.copy(middle).multiplyScalar(cos).addScaledVector(round, sin).multiplyScalar(length).add(pp.at).sub(pt.at);
            const total = pt.inverse + pb.inverse;

            pt.at.addScaledVector(move, (CONE_STIFFNESS * pt.inverse) / total);
            pb.at.addScaledVector(move, (-CONE_STIFFNESS * pb.inverse) / total);
        }

        for (const { root, joint, end, trunk, bends, least, twist } of this.limbs) {
            const pr = points[root];
            const pj = points[joint];
            const pe = points[end];

            trunkFrame(TRUNKS[trunk], at, _across, _up, _front);

            // Bent the wrong way: the joint brought back over the line from end to end, its front
            // the trunk's swung as the limb has; and bent sideways further than its root turns the
            // limb about itself, brought back towards the line it bends in
            swung(_along.subVectors(pj.at, pr.at).normalize(), _across, _up, _front, _limbAcross, _limbFront);

            const mid = _a.addVectors(pr.at, pe.at).multiplyScalar(0.5);
            const span = _d.subVectors(pe.at, pr.at).normalize();

            _limbFront.addScaledVector(span, -_limbFront.dot(span)).normalize();

            const out = _b.subVectors(pj.at, mid);
            const wrong = out.dot(_limbFront) * bends;

            if (wrong < 0) {
                bend(pr, pj, pe, _limbFront, -wrong * bends);
                out.subVectors(pj.at, mid.addVectors(pr.at, pe.at).multiplyScalar(0.5));
            }

            const aside = out.dot(_limbAcross);
            const most = twist * Math.max(0, wrong);

            if (Math.abs(aside) > most) {
                bend(pr, pj, pe, _limbAcross, -(aside - Math.sign(aside) * most));
            }

            // Folded too far: its ends kept as far apart as it can bend
            const ends = _a.subVectors(pe.at, pr.at);
            const apart = ends.length();

            if (apart < least && apart > 1e-9) {
                const total = pr.inverse + pe.inverse;
                const push = (apart - least) / (apart * total);

                pr.at.addScaledVector(ends, push * pr.inverse);
                pe.at.addScaledVector(ends, -push * pe.inverse);
            }
        }
    }

    // The way a part of the body faces (into `target`): square to what's across it (from `right`
    // to `left`) and up it (from `low` to `high`)
    #facing(left, right, low, high, target) {
        const across = _a.subVectors(this.points[left].at, this.points[right].at);
        const up = _b.subVectors(this.points[high].at, this.points[low].at);

        return target.crossVectors(across, up).normalize();
    }

    // The body's frames as its points are now (FRAMES; each limb's, #limbFrames), in the rig's
    // space, into `target`
    #frames(target) {
        const object = this.object;
        const local = POINTS.map(({ name }) => object.worldToLocal(this.points[P[name]].at.clone()));
        const hips = new THREE.Vector3().subVectors(local[P.leftHip], local[P.rightHip]);
        const shoulders = new THREE.Vector3().subVectors(local[P.leftShoulder], local[P.rightShoulder]);
        // (Where across lies along a bone: the way the trunk faces, instead)
        const front = new THREE.Vector3().crossVectors(shoulders, new THREE.Vector3().subVectors(local[P.neck], local[P.pelvis]));
        const across = { hips, shoulders };

        for (const [name, [from, to, side]] of Object.entries(FRAMES)) {
            frameOf(new THREE.Vector3().subVectors(local[P[to]], local[P[from]]), across[side], front, target[name]);
        }

        for (const limb of this.limbs) {
            this.#limbFrames(limb, local, front, target);
        }

        return local;
    }

    // A limb's two frames (its upper bone's and its lower's, `local`: the points in the rig's
    // space), about its middle joint's hinge: across both, the line it bends about, turned so it
    // bends as the joint does (a knee back, an elbow forward: never the other way, the limb turned
    // about itself to suit), so the joint only ever bends, never twists; nearly straight, what's
    // across the limb as it's swung from its trunk (swung), turned towards that as it bends
    #limbFrames({ root, joint, end, trunk, bends, frames: [upperFrame, lowerFrame] }, local, front, target) {
        const at = (name) => local[P[name]];

        trunkFrame(TRUNKS[trunk], at, _across, _up, _front);

        const upper = _along.subVectors(local[joint], local[root]).normalize();
        const lower = _lower.subVectors(local[end], local[joint]).normalize();

        swung(upper, _across, _up, _front, _limbAcross, _limbFront);
        _hinge.crossVectors(upper, lower);

        const bent = smooth(0.1, 0.35, _hinge.length());

        if (bent > 0) {
            // (Turned about the limb from across it to the hinge, as far as it's bent)
            _hinge.normalize().multiplyScalar(bends);

            const turn = Math.atan2(_c.crossVectors(_limbAcross, _hinge).dot(upper), _limbAcross.dot(_hinge));

            _limbAcross.applyAxisAngle(upper, turn * bent);
        }

        frameOf(upper, _limbAcross, front, target[upperFrame]);
        frameOf(lower, _limbAcross, front, target[lowerFrame]);
    }

    /**
     * Pose the character as the body lies now: the bones the points reach turned as their frames
     * have since it was thrown, each held to its joint's range; the rest as they were posed then;
     * the pelvis where its point is. Its object's moved first to stand on the ground under the
     * pelvis (`ground(x, z)`), facing as it did, so it's drawn (and culled) where the body is.
     */
    pose(ground) {
        const rig = this.rig;
        const object = this.object;
        const pelvis = this.points[P.pelvis].at;

        object.position.x = pelvis.x;
        object.position.z = pelvis.z;
        object.position.y = ground(pelvis.x, pelvis.z);
        object.updateMatrixWorld(true);

        const local = this.#frames(this.frames);

        for (const name in this.frames) {
            this.turns[name].copy(this.frames[name]).multiply(_q.copy(this.frames0[name]).invert());
        }

        rig.definition.forEach(({ parent }, i) => {
            const bone = rig.bones[i];
            const by = POSED[bone.name];
            const above = parent >= 0 ? this.posed[parent] : _identity;
            const joint = rig.rotations[i];

            // (Each joint turned as the points have it from the bone above as they have that:
            // one held to its range doesn't throw out the ones below it)
            if (by) {
                // (Turned as its frame has, or part of the way between two)
                const turn = by.length === 1 ? this.turns[by[0]] : _r.slerpQuaternions(this.turns[by[0]], this.turns[by[1]], by[2]);

                this.wanted[i].copy(turn).multiply(this.thrown[i]);
                _q.copy(parent >= 0 ? this.wanted[parent] : _identity).invert().multiply(this.wanted[i]);
            } else {
                _q.copy(this.local[i]);
                this.wanted[i].copy(parent >= 0 ? this.wanted[parent] : _identity).multiply(_q);
            }

            // (Its joint's rotation, held to its range: the pelvis turns as it will)
            joint.copy(parent >= 0 ? rig.frames[parent] : _identity).invert().multiply(_q).multiply(rig.frames[i]);

            const { kind, side } = rig.joints[i];

            if (kind !== "pelvis") {
                limitRotation(kind, side, joint);
            }

            _q.copy(joint).multiply(_r.copy(rig.frames[i]).invert());

            if (parent >= 0) {
                _q.premultiply(rig.frames[parent]);
            }

            this.posed[i].copy(above).multiply(_q);
        });

        rig.offset.copy(local[P.pelvis]).sub(rig.heads[0]);
    }

    /** How the body lies, once still: face up (its front to the sky) or not. */
    get faceUp() {
        return this.#facing(P.leftHip, P.rightHip, P.pelvis, P.chest, _c).y >= 0;
    }

    /** Which way along the ground the body lies, from its head to its pelvis (radians, as an actor's facing). */
    get lying() {
        const pelvis = this.points[P.pelvis].at;
        const head = this.points[P.head].at;

        return Math.atan2(pelvis.x - head.x, pelvis.z - head.z);
    }
}
