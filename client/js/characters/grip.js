// A power grip: a hand closed round a haft, a pole or a hilt as a real one closes (the user's
// photos of a hand round a pole). The haft lies across the palm on the diagonal, from the base of
// the index finger to the heel of the hand, against the palm's skin. Each finger's joints are
// fitted so its bones lie round it: the knuckle, the middle joint and the end joint each as far
// as keeps that finger on the haft and not in it, so the four stack in a staircase down the
// diagonal. The thumb comes round the other side, across the haft, its tip on the index finger.
// Fitted to each body's own hand (how long its palm and fingers are, how thick its palm is: a
// small hand goes less far round a thick haft than a big one) and to the haft's thickness, once
// when what's held is put in the hand (equipment.js socketOn), and closed so each frame (closeHand).

import * as THREE from "three";
import { blendRotation, jointRotation } from "./rig.js";

export const DIGITS = Object.freeze(["Index", "Middle", "Ring", "Pinky"]);

// The fingers pressed together round the haft (turned at the knuckles towards each other,
// degrees: as a fist's, equipment.js FIST_HAND)
const SPREAD = [10, -4, -9, -14];
// Where the haft crosses the palm: at the index finger, this share of the way from the wrist to
// its knuckle (in the palm, just short of the knuckle), and from there down the diagonal to the
// heel of the hand
const ACROSS = 0.9;
// How far the haft sinks into the skin of the palm and the fingers (metres: the flesh gives)
const SINK = 0.0015;
// How thick each finger's three bones are (from the bone to the skin, as shares of the palm's
// length, the wrist to the middle knuckle: as the bodies' fingers are, about), thinner towards
// the tip; and the thumb's, its base in the ball of the thumb
const FINGER_THICK = [0.105, 0.1, 0.065];
const THUMB_THICK = [0.12, 0.1, 0.075];
// Each finger joint's range in a grip (degrees: the knuckle, the middle and the end joint), and
// the thumb's (its base's flexion and opposition, and its middle and end joints' flexion)
const FINGER_RANGE = [[0, 90], [0, 100], [0, 80]];
const THUMB_RANGE = [[-20, 80], [-20, 50], [0, 60], [0, 80]];
// How much a finger's end joint is held to bending about 0.7 as far as its middle joint, as a
// real finger's are tied (squared degrees against squared metres of the bones off the haft), and
// the thumb's two outer joints to bending about 30° (as round a pole they do: not straight)
const TIED = 4e-8;
const BENT = 1.5e-7;
// How much a thumb bone along the haft counts against it (it goes round, across it)
const ACROSS_HAFT = 2e-4;
// How much more a bone sunk in the haft (or the thumb in a finger) counts than one off it
const SUNK = 30;

const _turn = new THREE.Quaternion();
const _local = new THREE.Quaternion();
const _rotation = new THREE.Quaternion();
const _inverse = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();

// A digit's bones (rig indices), each with the one it hangs from
function digitBones(rig, Side, digit) {
    const hand = rig.index.get(`${Side}Hand`);
    const bones = [1, 2, 3].map((j) => rig.index.get(`${Side}Hand${digit}${j}`));

    return bones.map((bone, j) => ({ bone, parent: j === 0 ? hand : bones[j - 1], next: j < 2 ? bones[j + 1] : -1 }));
}

// Where a digit's joints are (its knuckle, middle and end joints and its tip: in the hand's
// anatomical frame, from the wrist), its joints turned as `angles` says ([{ flex, ... }] for each
// of its three bones): as Rig.apply poses them, each bone's turn from rest its parent's rest frame,
// the joint, then out of its own
function digitPoints(rig, hand, bones, angles, points) {
    const turn = _turn.copy(rig.frames[hand]).invert();

    points[0].copy(rig.heads[bones[0].bone]).sub(rig.heads[hand]).applyQuaternion(turn);

    for (let j = 0; j < 3; j++) {
        const { bone, parent, next } = bones[j];
        const { kind, side } = rig.joints[bone];

        jointRotation(kind, side, angles[j], _rotation);
        turn.multiply(_local.copy(rig.frames[parent]).multiply(_rotation).multiply(_inverse.copy(rig.frames[bone]).invert()));
        points[j + 1].copy(points[j]).add(_offset.copy(next >= 0 ? rig.heads[next] : rig.tails[bone]).sub(rig.heads[bone]).applyQuaternion(turn));
    }

    return points;
}

// How far a segment (a to b) is from a line (through `at`, along unit `along`)
function fromLine(a, b, at, along) {
    const d = _d.subVectors(b, a);
    const w = _w.subVectors(a, at);
    const du = d.dot(along);
    const den = d.dot(d) - du * du;
    const s = den > 1e-12 ? Math.min(1, Math.max(0, (du * along.dot(w) - d.dot(w)) / den)) : 0;
    const point = _p.copy(a).addScaledVector(d, s).sub(at);

    return point.addScaledVector(along, -point.dot(along)).length();
}

// How far apart two segments are (a to b, c to d: their nearest points)
function fromSegment(a, b, c, d) {
    const u = _d.subVectors(b, a);
    const v = _e.subVectors(d, c);
    const w = _w.subVectors(a, c);
    const uu = u.dot(u);
    const uv = u.dot(v);
    const vv = v.dot(v);
    const uw = u.dot(w);
    const vw = v.dot(w);
    const den = uu * vv - uv * uv;
    let s = den > 1e-12 ? Math.min(1, Math.max(0, (uv * vw - vv * uw) / den)) : 0;
    let t = vv > 1e-12 ? (uv * s + vw) / vv : 0;

    // (The nearest point on the second past its end: from that end, the nearest on the first)
    if (t < 0 || t > 1) {
        t = Math.min(1, Math.max(0, t));
        s = uu > 1e-12 ? Math.min(1, Math.max(0, (uv * t - uw) / uu)) : 0;
    }

    return _p.copy(w).addScaledVector(u, s).addScaledVector(v, -t).length();
}

// Minimise `cost` over some angles (coordinate descent, each kept in its range), from `start`
function fit(cost, start, ranges) {
    const best = [...start];
    let least = cost(best);

    for (const step of [8, 4, 2]) {
        let moved = true;

        while (moved) {
            moved = false;

            for (let j = 0; j < best.length; j++) {
                for (const sign of [-1, 1]) {
                    const was = best[j];

                    best[j] = Math.min(ranges[j][1], Math.max(ranges[j][0], was + sign * step));

                    const value = best[j] === was ? Infinity : cost(best);

                    if (value < least - 1e-12) {
                        least = value;
                        moved = true;
                    } else {
                        best[j] = was;
                    }
                }
            }
        }
    }

    return best;
}

/**
 * A power grip for a body's hand (`side`: "left" or "right") round a haft `radius` metres thick,
 * lying across the palm turned `turn` radians from straight across (towards the fingers at the
 * thumb's side: the item's turn in its socket), on the palm's skin (`palm`: the hand bone's skin's
 * points, as the body rests). A hilt (`hilt`: from its pommel to its guard, metres along it from
 * its middle) is held with the fingers between them, the index finger at the guard if the hand's
 * too broad for it. Returns where the haft's middle is (`position`: in the hand bone's frame, as a
 * socket's, equipment.js socketOn) and the angles that close each finger's joints round it
 * (`fingers`: three [{ flex, spread }] for each of DIGITS) and the thumb's (`thumb`).
 */
export function powerGrip(character, side, { radius, turn = 0, palm = null, hilt = null }) {
    const { rig } = character;
    const Side = side === "left" || side === "Left" ? "Left" : "Right";
    const hand = rig.index.get(`${Side}Hand`);
    const toHand = rig.frames[hand].clone().invert();
    const inHand = (point) => point.clone().sub(rig.heads[hand]).applyQuaternion(toHand);
    // (The palm faces the body's middle: the right's +x in its anatomical frame, the left's -x)
    const out = Side === "Left" ? -1 : 1;
    const length = rig.heads[rig.index.get(`${Side}HandMiddle1`)].distanceTo(rig.heads[hand]);
    const along = new THREE.Vector3(0, -Math.sin(turn), Math.cos(turn));

    // The haft across the palm from the base of the index finger to the heel of the hand, its
    // middle where it passes between the index and little fingers' knuckles, laid on the palm's
    // skin, sunk SINK into it
    const index = inHand(rig.heads[rig.index.get(`${Side}HandIndex1`)]);
    const middle = (index.z + inHand(rig.heads[rig.index.get(`${Side}HandPinky1`)]).z) / 2;
    const at = new THREE.Vector3(0, index.y * ACROSS + ((middle - index.z) * along.y) / along.z, middle);
    const skin = (palm ?? []).map(inHand);
    const sunk = (x) => {
        let deepest = -Infinity;

        at.x = x;

        for (const point of skin) {
            _w.subVectors(point, at);
            deepest = Math.max(deepest, radius - _w.addScaledVector(along, -_w.dot(along)).length());
        }

        return deepest;
    };
    let [near, far] = [0, length];

    for (let k = 0; k < 24 && skin.length; k++) {
        const x = (near + far) / 2;

        [near, far] = sunk(out * x) > SINK ? [x, far] : [near, x];
    }

    at.x = out * (skin.length ? far : 0.24 * length + radius);

    // Each finger fitted round it: its bones on the haft (as thick as they are), none sunk in it
    const points = [0, 1, 2, 3].map(() => new THREE.Vector3());
    const fingerThick = FINGER_THICK.map((share) => share * length);
    const fingers = DIGITS.map((digit, k) => {
        const bones = digitBones(rig, Side, digit);
        const angles = [{ flex: 0, spread: SPREAD[k] }, { flex: 0 }, { flex: 0 }];
        const cost = (flex) => {
            flex.forEach((value, j) => (angles[j].flex = value));
            digitPoints(rig, hand, bones, angles, points);

            let sum = 0;

            for (let j = 0; j < 3; j++) {
                const gap = fromLine(points[j], points[j + 1], at, along) - radius - fingerThick[j] + SINK;

                sum += (gap > 0 ? gap * gap : SUNK * gap * gap) * (j === 2 ? 0.6 : 1);
            }

            return sum + TIED * (flex[2] - 0.7 * flex[1]) ** 2;
        };

        return fit(cost, [40, 40, 28], FINGER_RANGE).map((flex, j) => ({ flex, spread: j === 0 ? SPREAD[k] : 0 }));
    });

    // The thumb round the other side, across the haft: its two outer bones on it, none of it sunk
    // in the haft or the index and middle fingers, its tip on the index finger (as far round as
    // that's come: a small hand round a thick haft, at its end)
    const fingerBones = [0, 1].flatMap((k) => {
        const at = digitPoints(rig, hand, digitBones(rig, Side, DIGITS[k]), fingers[k], [0, 1, 2, 3].map(() => new THREE.Vector3()));

        return [1, 2].map((j) => ({ from: at[j], to: at[j + 1], thick: fingerThick[j] }));
    });
    const thumbBones = digitBones(rig, Side, "Thumb");
    const thumbThick = THUMB_THICK.map((share) => share * length);
    const thumbAngles = [{ flex: 0, oppose: 0 }, { flex: 0 }, { flex: 0 }];
    const thumbCost = ([flex, oppose, middle, end]) => {
        Object.assign(thumbAngles[0], { flex, oppose });
        thumbAngles[1].flex = middle;
        thumbAngles[2].flex = end;
        digitPoints(rig, hand, thumbBones, thumbAngles, points);

        let sum = 0;

        for (let j = 0; j < 3; j++) {
            const gap = fromLine(points[j], points[j + 1], at, along) - radius - thumbThick[j] + SINK;

            sum += gap < 0 ? SUNK * gap * gap : j > 0 ? gap * gap : 0;

            if (j > 0) {
                const lying = _d.subVectors(points[j + 1], points[j]).normalize().dot(along);

                sum += ACROSS_HAFT * lying * lying;

                for (const bone of fingerBones) {
                    const over = fromSegment(points[j], points[j + 1], bone.from, bone.to) - thumbThick[j] - bone.thick + SINK;

                    sum += over < 0 ? SUNK * over * over : 0;
                }
            }
        }

        const tip = Math.min(fromSegment(points[3], points[3], fingerBones[0].from, fingerBones[0].to) - thumbThick[2] - fingerBones[0].thick, fromSegment(points[3], points[3], fingerBones[1].from, fingerBones[1].to) - thumbThick[2] - fingerBones[1].thick);

        return sum + tip * tip + BENT * ((middle - 30) ** 2 + (end - 30) ** 2);
    };
    // (From the best of a coarse look over its range)
    let start = null;
    let least = Infinity;

    for (let flex = -20; flex <= 80; flex += 20) {
        for (let oppose = -20; oppose <= 50; oppose += 35) {
            for (let middle = 0; middle <= 60; middle += 30) {
                for (let end = 0; end <= 60; end += 30) {
                    const value = thumbCost([flex, oppose, middle, end]);

                    if (value < least) {
                        least = value;
                        start = [flex, oppose, middle, end];
                    }
                }
            }
        }
    }

    const [flex, oppose, middleFlex, endFlex] = fit(thumbCost, start, THUMB_RANGE);

    // (Slid along a hilt till the fingers are between its pommel and its guard: lying across the
    // palm at a slant, they reach up it from the knuckles. None of the fit changes, made to the
    // haft's line)
    if (hilt) {
        let [low, high] = [Infinity, -Infinity];

        fingers.forEach((angles, k) => {
            digitPoints(rig, hand, digitBones(rig, Side, DIGITS[k]), angles, points);

            for (let j = 0; j < 3; j++) {
                for (const point of [points[j], points[j + 1]]) {
                    const up = _w.subVectors(point, at).dot(along);

                    low = Math.min(low, up - fingerThick[j]);
                    high = Math.max(high, up + fingerThick[j]);
                }
            }
        });

        const [pommel, guard] = hilt;
        const slide = high - low > guard - pommel ? guard - high : (pommel + guard - low - high) / 2;

        at.addScaledVector(along, -slide);
    }

    return { position: at.applyQuaternion(rig.frames[hand]), fingers, thumb: [{ flex, oppose }, { flex: middleFlex }, { flex: endFlex }] };
}

// Each hand's finger and thumb bones' names, as closeHand sets them
const CLOSED = Object.fromEntries(["Left", "Right"].map((Side) => [Side, { fingers: DIGITS.map((digit) => [1, 2, 3].map((j) => `${Side}Hand${digit}${j}`)), thumb: [1, 2, 3].map((j) => `${Side}HandThumb${j}`) }]));

/**
 * Close a hand round what it grips as powerGrip has it (`grip`), `weight` of the way from how its
 * fingers are (blended as their joints move: never out of their range on the way).
 */
export function closeHand(rig, side, grip, weight = 1) {
    const names = CLOSED[side === "left" || side === "Left" ? "Left" : "Right"];
    const set = (name, angles) => {
        const index = rig.index.get(name);
        const { kind, side: sign } = rig.joints[index];

        if (weight >= 1) {
            jointRotation(kind, sign, angles, rig.rotations[index]);
        } else if (weight > 0) {
            blendRotation(kind, sign, rig.rotations[index], jointRotation(kind, sign, angles, _rotation), weight, rig.rotations[index]);
        }
    };

    names.fingers.forEach((bones, k) => bones.forEach((name, j) => set(name, grip.fingers[k][j])));
    names.thumb.forEach((name, k) => set(name, grip.thumb[k]));
}
