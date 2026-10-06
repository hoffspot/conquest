// The skeleton: 52 Mixamo-named bones fitted to the body's joints, posed with anatomical joint
// angles (flexion, abduction, rotation...) that are limited to a real body's range of motion.
//
// Bones rest "world-aligned": at rest every bone's rotation is zero, so its local axes are the
// world's (x to the character's left, y up, z forward). Joint angles, though, are measured from
// the anatomical position (standing, arms hanging at the sides, palms facing the thighs), and the
// body's rest pose is not that: the arms hang out at about 50 degrees with the elbows bent. So
// each bone has a rest frame, `frames[b]`, the rotation from its anatomical orientation to its
// rest orientation, and a joint rotation q (in the anatomical frame) becomes the bone's local
// rotation frames[parent] * q * inverse(frames[b]).
//
// Ranges of motion are the American Academy of Orthopaedic Surgeons' normal values (see
// docs/CHARACTERS.md). Joint rotations from other sources (inverse kinematics, motion capture)
// are limited too, by splitting them into a twist about the bone and a swing of the bone, and
// keeping the swing inside an ellipse and the twist inside its range.

import * as THREE from "three";

const DEG = Math.PI / 180;

const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];
const NX = [-1, 0, 0];
const NY = [0, -1, 0];
const NZ = [0, 0, -1];

// How the reference body (MakeHuman's, as the sliders start: what every keyed pose, gait curve
// and clip was made on) rests its thighs, shins and fingers: each one's direction in its
// anatomical frame as the rest pose has it (the left side's; the right's mirrored: restOf). A
// body made from other data whose own default body rests them otherwise (its HumanData's
// landmarks.rest, as restOf measures them) is measured as though that default rested them so, so
// an angle puts its limbs where it puts the reference body's: Vitruvian's knees rest 9°
// straighter than MakeHuman's (measured from its own rest, they locked straight in every stride
// and its running feet slid), its thumbs 44° to 66° from MakeHuman's and its fingers about 20°
// (they gripped elsewhere). Each shape's own difference from its default is kept, as on
// MakeHuman's body.
const REST = {
    UpLeg: [0.0056, -0.9982, 0.0602],
    Leg: [-0.0054, -0.9983, -0.0582],
    HandThumb1: [-0.6825, -0.3588, 0.6368],
    HandThumb2: [-0.4978, -0.6884, 0.5275],
    HandThumb3: [-0.5462, -0.7966, 0.259],
    HandIndex1: [-0.2775, -0.95, 0.1429],
    HandIndex2: [-0.4754, -0.8751, 0.0909],
    HandIndex3: [-0.5868, -0.8051, 0.0868],
    HandMiddle1: [-0.3403, -0.9311, -0.1316],
    HandMiddle2: [-0.435, -0.8978, -0.069],
    HandMiddle3: [-0.551, -0.8292, -0.0939],
    HandRing1: [-0.3053, -0.9039, -0.2997],
    HandRing2: [-0.4253, -0.8779, -0.2199],
    HandRing3: [-0.5242, -0.8085, -0.2677],
    HandPinky1: [-0.3814, -0.8317, -0.4035],
    HandPinky2: [-0.5251, -0.7861, -0.3259],
    HandPinky3: [-0.5103, -0.7853, -0.3505],
};

// Each kind of joint's movements: the axis each turns about in the anatomical position (for the
// left side and the middle of the body; the right side mirrors them) and its range in degrees.
// A joint rotation applies them in order: the last (the twist about the bone) first.
const spine = (flex, bend, turn) => [
    { name: "flex", axis: X, range: flex },
    { name: "bend", axis: NZ, range: bend },
    { name: "turn", axis: Y, range: turn, twist: true },
];

// A finger's joints, in its own plane (FINGERS: each finger's)
const FINGER = [
    { name: "flex", axis: NZ, range: [-10, 100] },
    { name: "spread", axis: X, range: [-20, 20] },
];

export const JOINTS = {
    // The pelvis in the world: tilt (top forward), obliquity (left side up), turn (left side forward)
    pelvis: [
        { name: "tilt", axis: X, range: [-30, 30] },
        { name: "obliquity", axis: Z, range: [-20, 20] },
        { name: "turn", axis: NY, range: [-180, 180], twist: true },
    ],
    // Thoracolumbar flexion 80, extension 25, side bending 35, rotation 45, over three bones
    // (flexion mostly lumbar, rotation mostly thoracic)
    Spine: spine([-10, 35], [-12, 12], [-10, 10]),
    Spine1: spine([-8, 25], [-12, 12], [-15, 15]),
    Spine2: spine([-7, 20], [-11, 11], [-20, 20]),
    // Neck flexion 45, extension 45, side bending 45, rotation 60, over the neck and head
    Neck: spine([-25, 25], [-25, 25], [-30, 30]),
    Head: spine([-20, 20], [-20, 20], [-30, 30]),
    // Hip: flexion 120, extension 30, abduction 45, adduction 30, rotation 45 each way
    UpLeg: [
        { name: "flex", axis: NX, range: [-30, 120] },
        { name: "abduct", axis: Z, range: [-30, 45] },
        { name: "rotate", axis: NY, range: [-45, 45], twist: true },
    ],
    // Knee: flexion 140, hyperextension up to 5
    Leg: [
        { name: "flex", axis: X, range: [-5, 140] },
        { name: "rotate", axis: NY, range: [-10, 10], twist: true },
    ],
    // Ankle: dorsiflexion 20, plantarflexion 50; subtalar inversion 20, eversion 10
    Foot: [
        { name: "flex", axis: NX, range: [-50, 20] },
        { name: "invert", axis: NZ, range: [-10, 20] },
        { name: "rotate", axis: Y, range: [-15, 15], twist: true },
    ],
    // Big toe: extension 70, flexion 45
    ToeBase: [{ name: "flex", axis: NX, range: [-45, 70] }],
    // Shoulder girdle (clavicle): elevation, depression, protraction, retraction
    Shoulder: [
        { name: "elevate", axis: Z, range: [-10, 40] },
        { name: "protract", axis: NY, range: [-25, 25] },
    ],
    // Shoulder: flexion 180, extension 60, abduction 180, internal rotation 70, external 90
    Arm: [
        { name: "flex", axis: NX, range: [-60, 180] },
        { name: "abduct", axis: Z, range: [-30, 180] },
        { name: "rotate", axis: NY, range: [-90, 70], twist: true },
    ],
    // Elbow: flexion 150; forearm pronation and supination 80 each
    ForeArm: [
        { name: "flex", axis: NX, range: [0, 150] },
        { name: "pronate", axis: NY, range: [-80, 80], twist: true },
    ],
    // Wrist: flexion 80, extension 70, radial deviation 20, ulnar deviation 30
    Hand: [
        { name: "flex", axis: NZ, range: [-70, 80] },
        { name: "deviate", axis: NX, range: [-30, 20] },
    ],
    // The thumb lies turned from the fingers, down and out from the side of the palm and partly
    // in front of it, so it bends about its own axes (in the hand's frame, measured from the
    // body's rest pose): flexing curls it towards its pad, across the palm to the little finger
    // (all three joints: CMC, MCP 50, IP 80), and opposing (the CMC only; palmar abduction 70)
    // brings it out in front of the palm. A fist or a grip closes it over the curled fingers
    thumb: [
        { name: "flex", axis: [0.7, -0.7, -0.14], range: [-20, 80] },
        { name: "oppose", axis: [-0.447, -0.277, -0.851], range: [-20, 50] },
    ],
};

// Each finger bends in its own plane, square to the way it rests across the palm (as the reference
// body rests it, REST: fanned out, the index 9° to the thumb's side, the little finger 26° to the
// other), as a real finger does. Bent about one axis across the hand, the fingers stayed fanned as
// they curled: a fist's fingers splayed apart and their folded tips turned out. Each finger's
// joints are FINGER's turned about the palm's normal into its plane (TURNS: the turn, the same for
// either hand, as their frames mirror each other)
const TURNS = {};

for (const digit of ["Index", "Middle", "Ring", "Pinky"]) {
    const [, y, z] = REST[`Hand${digit}1`];
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...X), -Math.atan2(z, -y));

    JOINTS[`Hand${digit}`] = FINGER.map(({ axis, ...movement }) => ({ ...movement, axis: new THREE.Vector3(...axis).applyQuaternion(turn).toArray() }));
    TURNS[`Hand${digit}`] = turn;
}

/** The kind of joint a bone ends at (a key of JOINTS) and its side: -1 right, 0 middle, 1 left. */
export function jointOf(boneName) {
    const side = boneName.startsWith("Left") ? 1 : boneName.startsWith("Right") ? -1 : 0;
    const part = boneName.replace(/^(Left|Right)/, "");

    if (boneName === "Hips") {
        return { kind: "pelvis", side };
    }

    if (/^HandThumb/.test(part)) {
        return { kind: "thumb", side };
    }

    if (/^Hand(Index|Middle|Ring|Pinky)/.test(part)) {
        return { kind: part.replace(/\d$/, ""), side };
    }

    return { kind: part, side };
}

const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** A movement's axis for a side of the body (mirrored across the body's midline for the right). */
function axisFor(axis, side) {
    return side < 0 ? _axis.set(axis[0], -axis[1], -axis[2]) : _axis.set(axis[0], axis[1], axis[2]);
}

/**
 * A joint rotation (in the anatomical frame) from angles in degrees ({ flex: 30, ... }),
 * limited to the joint's range unless `limit` is false.
 */
export function jointRotation(kind, side, angles, target = new THREE.Quaternion(), limit = true) {
    target.identity();

    for (const { name, axis, range } of JOINTS[kind]) {
        let angle = angles[name] ?? 0;

        if (limit) {
            angle = Math.min(range[1], Math.max(range[0], angle));
        }

        if (angle) {
            target.multiply(_q.setFromAxisAngle(axisFor(axis, side), angle * DEG));
        }
    }

    return target;
}

const _euler = new THREE.Euler();
const _unturned = new THREE.Quaternion();

/**
 * The angles (degrees) of a joint rotation (in the anatomical frame), as jointRotation takes
 * them: the turn about each movement's axis, in their order (not for the thumb, whose axes are
 * its own). Into `target`.
 */
export function jointAngles(kind, side, rotation, target = {}) {
    // (A finger's turned back out of its plane, its movements FINGER's)
    const turn = TURNS[kind];
    const movements = turn ? FINGER : JOINTS[kind];

    rotation = turn ? _unturned.copy(turn).invert().multiply(rotation).multiply(turn) : rotation;
    const along = movements.map(({ axis }) => axis.findIndex((value) => value !== 0));
    const order = [...along, ...[0, 1, 2].filter((k) => !along.includes(k))].map((k) => "XYZ"[k]).join("");

    _euler.setFromQuaternion(rotation, order);
    movements.forEach(({ name, axis }, i) => {
        const turn = [_euler.x, _euler.y, _euler.z][along[i]];

        target[name] = (turn * axisFor(axis, side).getComponent(along[i])) / DEG;
    });

    return target;
}

const _twist = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _vector = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

/**
 * Split a joint rotation (in the anatomical frame) into a twist about the bone's axis (`axis`,
 * or none) and a swing after it: returns the twist (radians) and puts the swing, as a rotation
 * vector (its axis times its angle, radians), in `swing`.
 */
function splitRotation(rotation, axis, swing) {
    let twist = 0;

    _swing.copy(rotation);

    if (axis) {
        const along = rotation.x * axis.x + rotation.y * axis.y + rotation.z * axis.z;

        _twist.set(axis.x * along, axis.y * along, axis.z * along, rotation.w);

        if (_twist.lengthSq() < 1e-12) {
            _twist.identity();
        } else {
            _twist.normalize();
        }

        twist = 2 * Math.atan2(_twist.x * axis.x + _twist.y * axis.y + _twist.z * axis.z, _twist.w);
        twist = ((twist + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        _swing.multiply(_twist.invert());
    }

    const angle = 2 * Math.acos(Math.min(1, Math.abs(_swing.w)));
    const scale = angle > 1e-9 ? ((_swing.w < 0 ? -1 : 1) * angle) / Math.sin(angle / 2) : 0;

    swing.set(_swing.x * scale, _swing.y * scale, _swing.z * scale);

    return twist;
}

// Each kind of joint's twist about the bone (or none) and its other movements, the swing (found
// once: limitRotation is called dozens of times a frame for each arm reaching somewhere)
const SPLIT = Object.fromEntries(Object.entries(JOINTS).map(([kind, movements]) => [kind, { twist: movements.find((movement) => movement.twist) ?? null, swings: movements.filter((movement) => !movement.twist) }]));
const _swingVector = new THREE.Vector3();
const _swingAngles = new Float64Array(3);

/**
 * Keep a joint rotation (in the anatomical frame) within the joint's range: the twist about the
 * bone within its range, the swing within the ellipse its other two movements' ranges make.
 */
export function limitRotation(kind, side, rotation) {
    if (kind === "pelvis") {
        return rotation;
    }

    const { twist: twistMovement, swings } = SPLIT[kind];

    // The twist about the bone's own axis, and the swing (as a rotation vector, degrees), in
    // terms of the other movements (their angles in _swingAngles, in order)
    const twistAngle = splitRotation(rotation, twistMovement ? axisFor(twistMovement.axis, side) : null, _vector) / DEG;
    const angles = _swingAngles;

    _vector.divideScalar(DEG);

    let outside = 0;

    for (let k = 0; k < swings.length; k++) {
        const { axis, range } = swings[k];
        const value = _vector.dot(axisFor(axis, side));
        const limit = value >= 0 ? range[1] : -range[0];

        angles[k] = value;
        outside += limit > 0 ? (value / limit) ** 2 : value ? Infinity : 0;
    }

    if (outside > 1) {
        const shrink = Number.isFinite(outside) ? 1 / Math.sqrt(outside) : 0;

        for (let k = 0; k < swings.length; k++) {
            const { range } = swings[k];
            const limit = angles[k] >= 0 ? range[1] : -range[0];

            angles[k] = limit > 0 ? angles[k] * shrink : 0;
        }
    }

    const twist = twistMovement ? Math.min(twistMovement.range[1], Math.max(twistMovement.range[0], twistAngle)) : 0;

    // Rebuild: swing (as a rotation vector) after twist
    const swingVector = _swingVector.set(0, 0, 0);

    for (let k = 0; k < swings.length; k++) {
        swingVector.addScaledVector(axisFor(swings[k].axis, side), angles[k] * DEG);
    }

    const swingAngle = swingVector.length();

    if (swingAngle > 1e-9) {
        rotation.setFromAxisAngle(swingVector.divideScalar(swingAngle), swingAngle);
    } else {
        rotation.identity();
    }

    if (twistMovement) {
        rotation.multiply(_q.setFromAxisAngle(axisFor(twistMovement.axis, side), twist * DEG));
    }

    return rotation;
}

/**
 * Blend a joint rotation (in the anatomical frame) `t` of the way from `from` to `to` as the
 * joint itself moves: the twist about the bone and the swing (as a rotation vector) each along a
 * straight line, so between two rotations in the joint's range it stays in range (where a slerp
 * can swing an elbow sideways on the way). Into `target` (which may be `from`).
 */
export function blendRotation(kind, side, from, to, t, target = new THREE.Quaternion()) {
    const twistMovement = SPLIT[kind].twist;
    const axis = twistMovement ? axisFor(twistMovement.axis, side) : null;
    const twistFrom = splitRotation(from, axis, _from);
    const twist = twistFrom + (splitRotation(to, axis, _to) - twistFrom) * t;
    const swing = _from.lerp(_to, t);
    const angle = swing.length();

    if (angle > 1e-9) {
        target.setFromAxisAngle(swing.divideScalar(angle), angle);
    } else {
        target.identity();
    }

    return axis ? target.multiply(_q.setFromAxisAngle(axis, twist)) : target;
}

// The limbs REST lists (thighs, shins, fingers), and the turn from a body's frame for one as its
// default rests it (`rest`: its data's landmarks.rest, if not the reference body's) to the
// reference body's: the frame turned by the least that takes the reference body's direction
// for the limb onto its default's (`limb`: a bone's name)
function fromReference(frame, limb, rest) {
    const side = limb.startsWith("Left") ? "Left" : "Right";
    const [reference, own] = [REST, rest ?? {}].map((table) => table[limb.slice(side.length)]);

    if (!reference || !own) {
        return frame;
    }

    const mirror = side === "Left" ? 1 : -1;

    return frame.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(mirror * reference[0], reference[1], reference[2]), new THREE.Vector3(mirror * own[0], own[1], own[2])));
}

/**
 * How a body (`rig`, fitted to its default shape, measured from its own rest: no `rest`) rests
 * the limbs REST lists: each one's direction in its anatomical frame, the left side's, to the
 * ten-thousandth (a body's data's landmarks.rest, scripts/build-vitruvian.js; REST is MakeHuman's).
 */
export function restOf(rig) {
    const head = (name) => rig.heads[rig.index.get(name)];
    const tail = (name) => rig.tails[rig.index.get(name)];
    const along = { UpLeg: () => head("LeftLeg").clone().sub(head("LeftUpLeg")), Leg: () => head("LeftFoot").clone().sub(head("LeftLeg")) };

    return Object.fromEntries(
        Object.keys(REST).map((limb) => {
            const name = `Left${limb}`;
            const direction = (along[limb]?.() ?? tail(name).clone().sub(head(name))).normalize().applyQuaternion(rig.frames[rig.index.get(name)].clone().invert());

            return [limb, direction.toArray().map((value) => Math.round(value * 1e4) / 1e4)];
        }),
    );
}

/** The rotation whose y axis points along `down` reversed... a frame from where two axes go. */
function frame(yAxis, xAxis) {
    const y = yAxis.clone().normalize();
    const z = new THREE.Vector3().crossVectors(xAxis, y).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);

    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** The same frame, from where the y and z axes go. */
function frameYZ(yAxis, zAxis) {
    const y = yAxis.clone().normalize();
    const x = new THREE.Vector3().crossVectors(y, zAxis).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);

    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const _parentWorld = new THREE.Quaternion();
const _world = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _target = new THREE.Vector3();
const _delta = new THREE.Quaternion();
const _hingeCross = new THREE.Vector3();
const _hingeEnd = new THREE.Quaternion();
const _hingeTwist = new THREE.Quaternion();
const _was = new THREE.Quaternion();
const _now = new THREE.Quaternion();
const _identity = new THREE.Quaternion();

// --- Reaching with an arm, anatomically (Rig.reachArm) ---

// The elbow's swivel (round the line from the shoulder to the wrist) is searched in this many
// steps round, after trying near where it was
const SWIVEL_STEPS = 24;

// What a way of reaching costs, in degrees squared: how far each joint would go past its range
// (the shoulder, the forearm's twist, the wrist), plus how far the wrist is cocked (COMFORT),
// plus how far the elbow points from its natural way (NATURAL times 1 - the cosine between them),
// plus (STEADY a degree squared) how far the swivel moved from last time
const NATURAL = 700;
const STEADY = 0.06;

// A way the elbow is asked to point (an archer's drawing elbow up behind) counts for more
const HINTED = 3000;

// A shoulder past its range is worse than a hand turned a little otherwise than wanted
const SHOULDER = 10;

// Bending the wrist from where it rests costs a little too (degrees squared, times this): of the
// ways to reach, the one keeping the wrist nearer straight, as people do, swivelling the elbow
// rather than cocking the wrist
const COMFORT = 0.1;

// Straining less than this (degrees squared), near where it was is good enough
const GOOD_STRAIN = 4;

// The elbow bends at most this far (degrees), and the forearm turns this far each way
const ELBOW_MOST = 148;
const PRONATION = 80;

const _S = new THREE.Vector3();
const _W = new THREE.Vector3();
const _E = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _prefer = new THREE.Vector3();
const _xA = new THREE.Vector3();
const _yA = new THREE.Vector3();
const _zA = new THREE.Vector3();
const _yF = new THREE.Vector3();
const _zF = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _Farm = new THREE.Quaternion();
const _Ffore = new THREE.Quaternion();
const _Fhand = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _parentFrame = new THREE.Quaternion();
const _body = new THREE.Quaternion();
const _left = new THREE.Vector3();
const _back = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);
const _relaxedFore = new THREE.Quaternion();
const _relaxedHand = new THREE.Quaternion();
const _handLimited = new THREE.Quaternion();
const _offsetWorld = new THREE.Vector3();
const _wanted = new THREE.Quaternion();
const _partly = new THREE.Quaternion();
const _aimAxis = new THREE.Vector3();
const _start = new THREE.Quaternion();

// How far round from last time a reaching arm's elbow is tried first (radians)
const NUDGES = [0, -0.2, 0.2, -0.45, 0.45];

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A skeleton for the body, posed with joint rotations. */
export class Rig {
    /**
     * `bones`: [{ name, parent }], parents first (from HumanData); `rest`: how its data's default
     * body rests its limbs, if not as the reference body's (HumanData's landmarks.rest: REST).
     */
    constructor(bones, rest = null) {
        this.definition = bones;
        this.rest = rest;
        this.bones = bones.map(({ name }) => Object.assign(new THREE.Bone(), { name }));

        // Bones are posed by their quaternions alone, and nothing reads their Euler angles: so
        // three.js isn't to work each bone's Euler angles out again every time its quaternion's
        // set (a matrix made and taken apart: about a twelfth of a walking character's frame).
        // `bone.rotation` goes stale; setting it still sets the quaternion
        for (const bone of this.bones) {
            bone.quaternion._onChange(() => {});
        }

        bones.forEach(({ parent }, i) => parent >= 0 && this.bones[parent].add(this.bones[i]));
        this.root = this.bones[0];
        this.skeleton = new THREE.Skeleton(this.bones, bones.map(() => new THREE.Matrix4()));
        this.index = new Map(bones.map(({ name }, i) => [name, i]));
        this.joints = bones.map(({ name }) => jointOf(name));

        // Rest frames, joint rotations (anatomical frame) and the rest joint positions
        this.frames = bones.map(() => new THREE.Quaternion());
        this.rotations = bones.map(() => new THREE.Quaternion());
        this.heads = bones.map(() => new THREE.Vector3());
        this.tails = bones.map(() => new THREE.Vector3());

        /** Where the pelvis (the Hips bone's head) is, relative to where it rests. */
        this.offset = new THREE.Vector3();
    }

    bone(name) {
        return this.bones[this.index.get(name)];
    }

    /** Fit the skeleton to a body's joints (HumanData.shape's `joints`). */
    fit(joints) {
        this.definition.forEach(({ parent }, i) => {
            this.heads[i].fromArray(joints, i * 6);
            this.tails[i].fromArray(joints, i * 6 + 3);
            this.skeleton.boneInverses[i].makeTranslation(-this.heads[i].x, -this.heads[i].y, -this.heads[i].z);
            this.bones[i].position.copy(this.heads[i]);

            if (parent >= 0) {
                this.bones[i].position.sub(this.heads[parent]);
            }
        });

        this.#measureFrames();
        this.apply();
    }

    /** The rest frames of the limbs, from the rest pose. */
    #measureFrames() {
        const head = (name) => this.heads[this.index.get(name)];
        const tail = (name) => this.tails[this.index.get(name)];
        const set = (name, rotation) => this.frames[this.index.get(name)].copy(rotation);

        this.frames.forEach((rotation) => rotation.identity());

        for (const side of ["Left", "Right"]) {
            // Legs: hip to ankle straight down in the anatomical position (the thigh and shin as
            // the reference body's rest along it, if the data's default rests them otherwise: REST)
            const leg = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), head(`${side}Foot`).clone().sub(head(`${side}UpLeg`)).normalize());

            set(`${side}UpLeg`, fromReference(leg, `${side}UpLeg`, this.rest));
            set(`${side}Leg`, fromReference(leg, `${side}Leg`, this.rest));

            // Arms: hanging straight down, the elbow bending forward: its hinge across the arm,
            // level from front to back, as the reference body's lies (where its forearm, bent at
            // rest, bends). Not from how a body's own rest bends it: Vitruvian's forearm rests all
            // but straight, and its hinge came out 45° off, twisting every forearm and grip
            const upper = tail(`${side}Arm`).clone().sub(head(`${side}Arm`));
            const fore = tail(`${side}ForeArm`).clone().sub(head(`${side}ForeArm`));
            const bend = new THREE.Vector3().crossVectors(upper, new THREE.Vector3(...Z)).normalize().negate();

            set(`${side}Arm`, frame(upper.clone().negate(), bend));
            set(`${side}ForeArm`, frame(fore.clone().negate(), bend));

            // Hands: fingers down, thumb forward, palm facing the thigh (each finger's bones as the
            // reference body's rest in it, if the data's default rests them otherwise: REST)
            const hand = head(`${side}HandMiddle1`).clone().sub(head(`${side}Hand`));
            const across = head(`${side}HandIndex1`).clone().sub(head(`${side}HandPinky1`));
            const handFrame = frameYZ(hand.clone().negate(), across);

            set(`${side}Hand`, handFrame);

            for (const name of this.index.keys()) {
                if (name.startsWith(`${side}Hand`) && name !== `${side}Hand`) {
                    set(name, fromReference(handFrame, name, this.rest));
                }
            }
        }
    }

    /** Set a joint's rotation from anatomical angles in degrees (limited to its range). */
    setAngles(name, angles) {
        const i = this.index.get(name);
        const { kind, side } = this.joints[i];

        jointRotation(kind, side, angles, this.rotations[i]);
    }

    /**
     * Turn a posed bone back `1 - t` of the way to `from` (its local rotation before), as its
     * joint moves (blendRotation: never out of the joint's range on the way).
     */
    blendBone(name, from, t) {
        const i = this.index.get(name);
        const bone = this.bones[i];
        const parent = this.frames[this.definition[i].parent] ?? _identity;
        const { kind, side } = this.joints[i];

        // (A bone's local rotation is its parent's rest frame, the joint rotation, then out of its own)
        _was.copy(parent).invert().multiply(from).multiply(this.frames[i]);
        _now.copy(parent).invert().multiply(bone.quaternion).multiply(this.frames[i]);
        blendRotation(kind, side, _was, _now, t, _now);
        bone.quaternion.copy(parent).multiply(_now).multiply(_was.copy(this.frames[i]).invert());
    }

    /** Put every joint back in the anatomical position (or the rest pose, with `rest`). */
    reset(rest = false) {
        this.definition.forEach(({ parent }, i) => {
            const rotation = this.rotations[i].identity();

            // At rest every bone's local rotation is zero: the joint rotation is the change of
            // rest frame from the parent
            if (rest) {
                rotation.copy(this.frames[i]);

                if (parent >= 0) {
                    rotation.premultiply(_q.copy(this.frames[parent]).invert());
                }
            }
        });
        this.offset.set(0, 0, 0);
    }

    /** Pose the bones from the joint rotations and the pelvis offset. */
    apply() {
        this.definition.forEach(({ parent }, i) => {
            const bone = this.bones[i];

            _q.copy(this.frames[i]).invert();
            bone.quaternion.copy(this.rotations[i]).multiply(_q);

            if (parent >= 0) {
                bone.quaternion.premultiply(this.frames[parent]);
            }
        });

        this.root.position.copy(this.heads[0]).add(this.offset);
    }

    /**
     * Bend a limb (three bones: say LeftUpLeg, LeftLeg, LeftFoot) so its end reaches `target` (a
     * point in the rig's space), keeping the middle joint on the side it was bending to, or, given
     * `pole` (a direction in the upper bone's anatomical frame: forward, (0, 0, 1), for a knee),
     * bending it that way, however near straight the limb was, about its own hinge (#reachHinged).
     * The end bone keeps its orientation in the world. Call after apply() and updateMatrixWorld().
     */
    reach(upperName, lowerName, endName, target, { pole = null } = {}) {
        if (pole) {
            this.#reachHinged(upperName, lowerName, endName, target, pole);

            return;
        }

        const upper = this.bone(upperName);
        const lower = this.bone(lowerName);
        const end = this.bone(endName);
        const space = this.root.parent;
        const toSpace = (bone, vector) => {
            vector.setFromMatrixPosition(bone.matrixWorld);

            return space ? space.worldToLocal(vector) : vector;
        };

        toSpace(upper, _a);
        toSpace(lower, _b);
        toSpace(end, _c);

        const endWorld = end.getWorldQuaternion(new THREE.Quaternion());
        const upperLength = _a.distanceTo(_b);
        const lowerLength = _b.distanceTo(_c);
        const toTarget = _target.copy(target).sub(_a);
        const distance = Math.min(upperLength + lowerLength - 1e-4, Math.max(Math.abs(upperLength - lowerLength) + 1e-4, toTarget.length()));

        toTarget.normalize();

        // The bend direction: where the middle joint is now, away from the line to the target
        const bendDirection = new THREE.Vector3().copy(_b).sub(_a);

        bendDirection.addScaledVector(toTarget, -bendDirection.dot(toTarget));

        if (bendDirection.lengthSq() < 1e-6) {
            bendDirection.copy(_b).sub(_a);
            bendDirection.addScaledVector(toTarget, -bendDirection.dot(toTarget));
        }

        if (bendDirection.lengthSq() < 1e-10) {
            bendDirection.set(0, 0, 1).applyQuaternion(upper.getWorldQuaternion(new THREE.Quaternion()));
        }

        bendDirection.normalize();

        // Law of cosines: the angle at the upper joint
        const cosine = (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance);
        const angle = Math.acos(Math.min(1, Math.max(-1, cosine)));
        const middle = _a.clone().addScaledVector(toTarget, Math.cos(angle) * upperLength).addScaledVector(bendDirection, Math.sin(angle) * upperLength);
        const reached = _a.clone().addScaledVector(toTarget, distance);

        this.#turn(upper, _b.clone().sub(_a).normalize(), middle.clone().sub(_a).normalize());
        upper.updateMatrixWorld(true);
        toSpace(lower, _b);
        toSpace(end, _c);
        this.#turn(lower, _c.clone().sub(_b).normalize(), reached.sub(_b).normalize());
        lower.updateMatrixWorld(true);

        // The end keeps its world orientation
        end.parent.getWorldQuaternion(_parentWorld);
        end.quaternion.copy(_parentWorld.invert().multiply(endWorld));
        end.updateMatrixWorld(true);
    }

    /**
     * Reach an arm's hand to a grip as a real arm would (or as near as it can), every joint in
     * its range: the shoulder, the elbow (bending only one way, at most ELBOW_MOST), the forearm
     * turning the palm (pronation and supination, PRONATION each way) and the wrist (bending and
     * tilting, never twisting). The hand turns the way it's wanted as far as the arm can turn it:
     * the turn about the forearm goes to the forearm, the rest to the wrist, within their ranges;
     * what's past them is left undone (the hand points a little otherwise) rather than breaking
     * the wrist. Of all the ways the elbow could swivel round the line from the shoulder to the
     * wrist, the one that strains the joints least, keeps the elbow down and out, and moves least
     * from last time.
     *
     * `side` "Left" or "Right". The goal (world space): `grip` (where the hand's grip point goes),
     * `offset` (the grip point from the wrist, in the hand's anatomical frame), and which way the
     * hand turns: `hand` (its anatomical frame, a quaternion), or `aim` ({ axis: a direction in
     * the hand's anatomical frame, such as what it holds points along, or the palm; toward: the
     * world direction it should point }, the hand turning the least it can from easy, so the
     * roll about the axis comes naturally), or neither (relaxed). Easy is the forearm turned
     * `pronate` degrees and the wrist at `wrist` (anatomical angles); `hold` (0 to 1) how far the
     * hand turns from easy to the way wanted (easing in and out of it). `bend`: which way the
     * elbow should point, if not the natural way (down, out and a little back; world), `bent` (0
     * to 1) how much. `swivel`: last time's, to stay near. Sets the arm's bones; returns
     * { swivel, strain (degrees, how far past their ranges the joints were wanted), grip
     * (reached), frame (the hand's anatomical frame) }.
     */
    reachArm(side, { grip, offset, hand = null, aim = null, hold = 1, pronate = 25, wrist = null, bend = null, bent = 1, swivel = null }) {
        const s = side === "Left" ? 1 : -1;
        const iArm = this.index.get(`${side}Arm`);
        const iFore = this.index.get(`${side}ForeArm`);
        const iHand = this.index.get(`${side}Hand`);
        const upper = this.bones[iArm];
        const lower = this.bones[iFore];
        const end = this.bones[iHand];
        const parent = upper.parent;
        const iParent = this.index.get(parent.name);

        // The arm's parent's anatomical frame, the shoulder, and the bones' lengths (in the world)
        parent.getWorldQuaternion(_qa);
        _parentFrame.copy(_qa).multiply(this.frames[iParent]);
        upper.getWorldPosition(_S);

        const L1 = _S.distanceTo(lower.getWorldPosition(_E));
        const L2 = _E.distanceTo(end.getWorldPosition(_W));
        const scale = L1 / Math.max(1e-6, this.heads[iFore].distanceTo(this.heads[iArm]));
        const most = L1 + L2 - 1e-4;
        const least = Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos((180 - ELBOW_MOST) * DEG));

        // The body's own left and back (the elbows' natural way: down, out, a little back)
        (this.root.parent ?? this.root).getWorldQuaternion(_body);
        _left.set(1, 0, 0).applyQuaternion(_body);
        _back.set(0, 0, -1).applyQuaternion(_body);

        const relaxedFore = jointRotation("ForeArm", s, { pronate }, _relaxedFore);
        const relaxedHand = jointRotation("Hand", s, wrist ?? { flex: -8, deviate: -4 }, _relaxedHand);
        const handLimited = _handLimited;
        const offsetWorld = _offsetWorld;
        const wanted = _wanted;
        const partly = _partly;
        const axis = _aimAxis;
        const best = { phi: 0, cost: Infinity, strain: 0 };
        let target = null;
        // (What the last swivel tried cost, and how far past their ranges it strained the joints)
        let cost = 0;
        let strained = 0;

        // The frames and strain for one swivel; kept in _Farm, _Ffore, _Fhand (and _W: the wrist)
        const evaluate = (phi) => {
            _dir.copy(target).sub(_S);

            const dist = Math.min(most, Math.max(least, _dir.length()));

            _dir.normalize();

            // Round the line from the shoulder to the wrist: 0 is straight down from it
            _u.copy(_down).addScaledVector(_dir, -_down.dot(_dir));

            if (_u.lengthSq() < 1e-6) {
                _u.copy(_back).addScaledVector(_dir, -_back.dot(_dir));
            }

            _u.normalize();
            _v.crossVectors(_dir, _u);
            _bend.copy(_u).multiplyScalar(Math.cos(phi)).addScaledVector(_v, Math.sin(phi));

            const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist)));
            const sinA = Math.sqrt(1 - cosA * cosA);

            _E.copy(_S).addScaledVector(_dir, L1 * cosA).addScaledVector(_bend, L1 * sinA);
            _W.copy(_S).addScaledVector(_dir, dist);

            // The upper arm: along it up to the shoulder, the elbow's hinge across the arm's plane
            _yA.copy(_S).sub(_E).divideScalar(L1);
            _xA.crossVectors(_dir, _bend).normalize();
            _zA.crossVectors(_xA, _yA);
            _Farm.setFromRotationMatrix(_m.makeBasis(_xA, _yA, _zA));

            // The forearm, before it turns: the same hinge
            _yF.copy(_E).sub(_W).divideScalar(L2);
            _zF.crossVectors(_xA, _yF);
            _Ffore.setFromRotationMatrix(_m.makeBasis(_xA, _yF, _zF));

            // The shoulder, as far as it's past its range
            _qa.copy(_parentFrame).invert().multiply(_Farm);
            _qb.copy(_qa);

            const shoulder = _qa.angleTo(limitRotation("Arm", s, _qb)) / DEG;
            let strain = SHOULDER * shoulder * shoulder;
            let comfort = 0;

            let goal = hand;

            if (aim) {
                // Aiming: from easy (the forearm turned, the wrist as it rests), the least turn
                // that points the axis the way wanted
                wanted.copy(_Ffore).multiply(relaxedFore).multiply(relaxedHand);
                axis.copy(aim.axis).applyQuaternion(wanted);
                goal = wanted.premultiply(_qa.setFromUnitVectors(axis.normalize(), aim.toward));
            }

            if (goal && hold < 0.999) {
                // Only partly held: that far from relaxed towards it
                const easy = _qc.copy(_Ffore).multiply(relaxedFore).multiply(relaxedHand);

                goal = partly.copy(easy).slerp(goal, Math.max(0, hold));
            }

            if (goal) {
                // The hand's turn about the forearm goes to the forearm, as far as it turns
                _qa.copy(_Ffore).invert().multiply(goal);

                const theta = wrap(2 * Math.atan2(_qa.y, _qa.w));
                const want = (s > 0 ? -theta : theta) / DEG;
                const tau = Math.min(PRONATION, Math.max(-PRONATION, want));
                const twist = want - tau;

                _Ffore.multiply(jointRotation("ForeArm", s, { pronate: tau }, _qc, false));

                // The rest to the wrist, within its range
                _qa.copy(_Ffore).invert().multiply(goal);
                handLimited.copy(_qa);
                limitRotation("Hand", s, handLimited);

                const beyond = _qa.angleTo(handLimited) / DEG;
                const cocked = handLimited.angleTo(relaxedHand) / DEG;

                strain += twist * twist + beyond * beyond;
                comfort = COMFORT * cocked * cocked;
                _Fhand.copy(_Ffore).multiply(handLimited);
            } else {
                _Ffore.multiply(relaxedFore);
                _Fhand.copy(_Ffore).multiply(relaxedHand);
            }

            // The elbow's natural way (down, out and a little back), or the way wanted, across the
            // line to the wrist
            _prefer.copy(_down).addScaledVector(_left, 0.6 * s).addScaledVector(_back, 0.2);

            if (bend) {
                _prefer.normalize().multiplyScalar(1 - bent).addScaledVector(bend, bent);
            }

            _prefer.addScaledVector(_dir, -_prefer.dot(_dir));

            const natural = _prefer.lengthSq() > 1e-6 ? 1 - _bend.dot(_prefer.normalize()) : 0;
            const moved = swivel === null ? 0 : wrap(phi - swivel) / DEG;

            cost = strain + comfort + (bend ? NATURAL + (HINTED - NATURAL) * bent : NATURAL) * natural + STEADY * moved * moved;
            strained = strain;
        };

        const tryPhi = (phi) => {
            evaluate(phi);

            if (cost < best.cost) {
                best.phi = wrap(phi);
                best.cost = cost;
                best.strain = strained;
            }
        };

        // Where the wrist goes: back from the grip by the grip's offset in the hand (wanted, or
        // as last reached)
        const solve = (frame) => {
            target = offsetWorld.copy(offset).multiplyScalar(scale).applyQuaternion(frame).negate().add(grip);
            best.cost = Infinity;

            if (swivel !== null) {
                for (const nudge of NUDGES) {
                    tryPhi(swivel + nudge);
                }
            }

            if (best.strain > GOOD_STRAIN || swivel === null) {
                for (let k = 0; k < SWIVEL_STEPS; k++) {
                    tryPhi(-Math.PI + (2 * Math.PI * k) / SWIVEL_STEPS);
                }
            }

            for (let step = Math.PI / SWIVEL_STEPS; step > 0.004; step /= 2) {
                const around = best.phi;

                tryPhi(around - step);
                tryPhi(around + step);
            }

            evaluate(best.phi);
        };

        // (A relaxed or aimed hand's offset is along the forearm: a first guess, then from where it went)
        if (hand) {
            solve(hand);
        } else {
            solve(_start.setFromUnitVectors(_up, _dir.copy(grip).sub(_S).normalize().negate()));
        }

        // Again, from the hand's frame as it could be (the grip moves with it)
        solve(_start.copy(_Fhand));

        // Pose the bones: each one's world rotation is its anatomical frame out of its rest frame
        _qa.copy(_Farm).multiply(_qb.copy(this.frames[iArm]).invert());
        parent.getWorldQuaternion(_qc);
        upper.quaternion.copy(_qc.invert().multiply(_qa));
        _qb.copy(_Ffore).multiply(_qc.copy(this.frames[iFore]).invert());
        lower.quaternion.copy(_qc.copy(_qa).invert().multiply(_qb));
        _qa.copy(_Fhand).multiply(_qc.copy(this.frames[iHand]).invert());
        end.quaternion.copy(_qc.copy(_qb).invert().multiply(_qa));
        upper.updateMatrixWorld(true);

        return {
            swivel: best.phi,
            strain: Math.sqrt(best.strain),
            grip: offsetWorld.copy(offset).multiplyScalar(scale).applyQuaternion(_Fhand).add(_W).clone(),
            frame: _Fhand.clone(),
        };
    }

    /** Turn a bone so a direction (in the rig's space) becomes another. */
    /**
     * reach() given a pole: the middle joint bends about its hinge (across the limb, square to the
     * pole: a knee's about its anatomical x) and only about it, so the limb keeps the bend it rests
     * with across that (a knee that rests turned in a little, as women's do, stays so, rather than
     * being pushed out straight and swinging sideways as it bends: a joint a knee hasn't got). The
     * hinge's angle is the one that makes the limb as long as the way to the target, and the upper
     * bone turns the whole limb onto it, the pole (square to the limb) the way the upper bone's
     * pole, turned as it is, points (square to the way to the target). Then the end bone keeps its
     * orientation in the world, and as much of its twist as is past its joint's range the middle
     * joint takes, within its own (a bent knee turns the shin a little, as it can: the foot stays
     * where it is, the shin turning about itself).
     */
    #reachHinged(upperName, lowerName, endName, target, pole) {
        const u = this.index.get(upperName);
        const l = this.index.get(lowerName);
        const e = this.index.get(endName);
        const upper = this.bones[u];
        const lower = this.bones[l];
        const end = this.bones[e];
        const space = this.root.parent;
        const spaceRotation = space ? space.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
        const endWorld = end.getWorldQuaternion(new THREE.Quaternion());
        const frame = this.frames[u];
        const inverse = frame.clone().invert();
        const lowerInverse = this.frames[l].clone().invert();
        // The limb in the upper bone's anatomical frame with the middle joint at none: the upper
        // bone, the lower (each from its own anatomical frame: their rest frames needn't be one)
        const thigh = this.heads[l].clone().sub(this.heads[u]).applyQuaternion(inverse);
        const shin = this.heads[e].clone().sub(this.heads[l]).applyQuaternion(lowerInverse);
        const hinge = new THREE.Vector3(0, 1, 0).cross(pole).normalize();

        // The hinge's angle: |thigh + R(angle) shin| = the way to the target, R turning about the
        // hinge. thigh · R shin = along + across cos(angle - at)
        const along = thigh.dot(hinge) * shin.dot(hinge);
        const thighAcross = thigh.clone().addScaledVector(hinge, -thigh.dot(hinge));
        const shinAcross = shin.clone().addScaledVector(hinge, -shin.dot(hinge));
        const cosine = thighAcross.dot(shinAcross);
        const sine = _hingeCross.crossVectors(shinAcross, thighAcross).dot(hinge);
        const across = Math.hypot(cosine, sine);
        const at = Math.atan2(sine, cosine);
        const toTarget = _target.copy(target);

        _a.setFromMatrixPosition(upper.matrixWorld);
        toTarget.sub(space ? space.worldToLocal(_a) : _a);

        const wanted = ((toTarget.length() ** 2 - thigh.lengthSq() - shin.lengthSq()) / 2 - along) / across;
        const angle = at + Math.acos(Math.min(1, Math.max(-1, wanted)));
        const bend = new THREE.Quaternion().setFromAxisAngle(hinge, angle);

        // The limb, and its pole square to it, in the upper bone's frame; and where they go in the
        // rig's space: along the way to the target, and the upper bone's pole as it's turned now
        // (square to that way). (Nearly along it, the limb's turned onto it as little as it can)
        const limb = shin.clone().applyQuaternion(bend).add(thigh).normalize();
        const turned = upper.getWorldQuaternion(new THREE.Quaternion()).multiply(frame).premultiply(spaceRotation.clone().invert());
        const way = toTarget.normalize();
        const facing = pole.clone().applyQuaternion(turned);

        facing.addScaledVector(way, -facing.dot(way));

        if (facing.lengthSq() > 1e-6) {
            const side = pole.clone().addScaledVector(limb, -pole.dot(limb)).normalize();

            turned.copy(frameYZ(way, facing)).multiply(frameYZ(limb, side).invert());
        } else {
            turned.premultiply(_delta.setFromUnitVectors(limb.applyQuaternion(turned), way));
        }

        // The bones: the upper's world turn from its frame's; the lower's from the bend
        upper.parent.getWorldQuaternion(_parentWorld);
        upper.quaternion.copy(_parentWorld.invert()).multiply(spaceRotation).multiply(turned).multiply(inverse);
        upper.updateMatrixWorld(true);

        const keepEnd = () => {
            lower.quaternion.copy(frame).multiply(bend).multiply(lowerInverse);
            lower.updateMatrixWorld(true);
            end.parent.getWorldQuaternion(_parentWorld);
            end.quaternion.copy(_parentWorld.invert().multiply(endWorld));
            end.updateMatrixWorld(true);
        };

        keepEnd();

        // The end's twist past its range, taken by the middle joint within its own (about the
        // lower bone's own line: the end stays where it is)
        const endJoint = SPLIT[this.joints[e].kind]?.twist;
        const middleJoint = SPLIT[this.joints[l].kind]?.twist;

        if (endJoint && middleJoint) {
            const s = this.joints[e].side;
            const endTurn = _hingeEnd.copy(lowerInverse).multiply(end.quaternion).multiply(this.frames[e]);
            const axis = axisFor(endJoint.axis, s).clone();
            const twist = splitRotation(endTurn, axis, _vector) / DEG;
            const past = twist - Math.min(endJoint.range[1], Math.max(endJoint.range[0], twist));
            const most = Math.min(-middleJoint.range[0], middleJoint.range[1]);
            const taken = Math.max(-most, Math.min(most, past));

            // (About the lower bone's own line, the way the end's twist turns)
            if (Math.abs(taken) > 0.01) {
                const line = shin.clone().normalize();

                bend.multiply(_hingeTwist.setFromAxisAngle(line.multiplyScalar(Math.sign(line.dot(axis)) || 1), taken * DEG));
                keepEnd();
            }
        }
    }

    #turn(bone, from, to) {
        const space = this.root.parent;
        const spaceRotation = space ? space.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();

        from.applyQuaternion(spaceRotation);
        to.applyQuaternion(spaceRotation);
        _delta.setFromUnitVectors(from, to);
        bone.parent.getWorldQuaternion(_parentWorld);
        bone.getWorldQuaternion(_world);
        _world.premultiply(_delta);
        bone.quaternion.copy(_parentWorld.invert().multiply(_world));
    }
}
