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

// Each kind of joint's movements: the axis each turns about in the anatomical position (for the
// left side and the middle of the body; the right side mirrors them) and its range in degrees.
// A joint rotation applies them in order: the last (the twist about the bone) first.
const spine = (flex, bend, turn) => [
    { name: "flex", axis: X, range: flex },
    { name: "bend", axis: NZ, range: bend },
    { name: "turn", axis: Y, range: turn, twist: true },
];

const finger = [
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
    finger,
    thumb: [
        { name: "flex", axis: NZ, range: [-10, 60] },
        { name: "oppose", axis: NX, range: [-20, 60] },
    ],
};

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
        return { kind: "finger", side };
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

const _twist = new THREE.Quaternion();
const _swing = new THREE.Quaternion();
const _vector = new THREE.Vector3();

/**
 * Keep a joint rotation (in the anatomical frame) within the joint's range: the twist about the
 * bone within its range, the swing within the ellipse its other two movements' ranges make.
 */
export function limitRotation(kind, side, rotation) {
    const movements = JOINTS[kind];
    const twistMovement = movements.find((movement) => movement.twist);
    const swings = movements.filter((movement) => !movement.twist);

    if (kind === "pelvis") {
        return rotation;
    }

    // Twist: the rotation about the bone's own axis
    let twistAngle = 0;

    if (twistMovement) {
        const axis = axisFor(twistMovement.axis, side).clone();
        const along = rotation.x * axis.x + rotation.y * axis.y + rotation.z * axis.z;

        _twist.set(axis.x * along, axis.y * along, axis.z * along, rotation.w);

        if (_twist.lengthSq() < 1e-12) {
            _twist.identity();
        } else {
            _twist.normalize();
        }

        twistAngle = 2 * Math.atan2(_twist.x * axis.x + _twist.y * axis.y + _twist.z * axis.z, _twist.w) / DEG;
        twistAngle = ((twistAngle + 540) % 360) - 180;
        _swing.copy(rotation).multiply(_twist.invert());
    } else {
        _swing.copy(rotation);
    }

    // Swing as a rotation vector (axis times angle), in terms of the two swing movements
    const angle = 2 * Math.acos(Math.min(1, Math.abs(_swing.w)));
    const sign = _swing.w < 0 ? -1 : 1;
    const scale = angle > 1e-9 ? (sign * angle) / Math.sin(angle / 2) / DEG : 0;

    _vector.set(_swing.x * scale, _swing.y * scale, _swing.z * scale);

    const angles = {};
    let outside = 0;

    for (const { name, axis, range } of swings) {
        const value = _vector.dot(axisFor(axis, side));
        const limit = value >= 0 ? range[1] : -range[0];

        angles[name] = value;
        outside += limit > 0 ? (value / limit) ** 2 : value ? Infinity : 0;
    }

    if (outside > 1) {
        const shrink = Number.isFinite(outside) ? 1 / Math.sqrt(outside) : 0;

        for (const { name, range } of swings) {
            const limit = angles[name] >= 0 ? range[1] : -range[0];

            angles[name] = limit > 0 ? angles[name] * shrink : 0;
        }
    }

    if (twistMovement) {
        angles[twistMovement.name] = Math.min(twistMovement.range[1], Math.max(twistMovement.range[0], twistAngle));
    }

    // Rebuild: swing (as a rotation vector) after twist
    const swingVector = new THREE.Vector3();

    for (const { name, axis } of swings) {
        swingVector.addScaledVector(axisFor(axis, side), angles[name] * DEG);
    }

    const swingAngle = swingVector.length();

    if (swingAngle > 1e-9) {
        rotation.setFromAxisAngle(swingVector.divideScalar(swingAngle), swingAngle);
    } else {
        rotation.identity();
    }

    if (twistMovement) {
        rotation.multiply(_q.setFromAxisAngle(axisFor(twistMovement.axis, side), angles[twistMovement.name] * DEG));
    }

    return rotation;
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

/** A skeleton for the body, posed with joint rotations. */
export class Rig {
    /** `bones`: [{ name, parent }], parents first (from HumanData). */
    constructor(bones) {
        this.definition = bones;
        this.bones = bones.map(({ name }) => Object.assign(new THREE.Bone(), { name }));
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
            // Legs: hip to ankle straight down in the anatomical position
            const leg = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), head(`${side}Foot`).clone().sub(head(`${side}UpLeg`)).normalize());

            set(`${side}UpLeg`, leg);
            set(`${side}Leg`, leg);

            // Arms: hanging straight down, the elbow bending forward
            const upper = tail(`${side}Arm`).clone().sub(head(`${side}Arm`));
            const fore = tail(`${side}ForeArm`).clone().sub(head(`${side}ForeArm`));
            const bend = new THREE.Vector3().crossVectors(upper, fore).normalize().negate();

            set(`${side}Arm`, frame(upper.clone().negate(), bend));
            set(`${side}ForeArm`, frame(fore.clone().negate(), bend));

            // Hands: fingers down, thumb forward, palm facing the thigh
            const hand = head(`${side}HandMiddle1`).clone().sub(head(`${side}Hand`));
            const across = head(`${side}HandIndex1`).clone().sub(head(`${side}HandPinky1`));
            const handFrame = frameYZ(hand.clone().negate(), across);

            set(`${side}Hand`, handFrame);

            for (const name of this.index.keys()) {
                if (name.startsWith(`${side}Hand`) && name !== `${side}Hand`) {
                    set(name, handFrame);
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
     * bending it that way, however near straight the limb was. The end bone keeps its orientation
     * in the world. Call after apply() and updateMatrixWorld().
     */
    reach(upperName, lowerName, endName, target, { pole = null } = {}) {
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

        // The bend direction: the way the joint bends (the pole, turned with the upper bone), or
        // where the middle joint is now, away from the line to the target. (Where the middle
        // joint is can be almost on that line, when the limb's nearly straight or the target has
        // moved across it, and then which side it's on flickers from frame to frame)
        const bendDirection = new THREE.Vector3();

        if (pole) {
            const turned = upper.getWorldQuaternion(new THREE.Quaternion()).multiply(this.frames[this.index.get(upperName)]);

            if (space) {
                turned.premultiply(space.getWorldQuaternion(new THREE.Quaternion()).invert());
            }

            bendDirection.copy(pole).applyQuaternion(turned);
            bendDirection.addScaledVector(toTarget, -bendDirection.dot(toTarget));
        }

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

    /** Turn a bone so a direction (in the rig's space) becomes another. */
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
