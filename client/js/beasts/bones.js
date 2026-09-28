// A skeleton's bones, laid out as a body's are (beasts/biped.js hangs them on its joints): a
// skull (a domed cranium, a brow ridge over deep sockets with a light in each, cheekbones and
// their arches back to the ears, the hole of the nose, rows of teeth above and in the jaw below,
// which hinges and chatters); a spine of vertebrae (seven in the neck, twelve behind the ribs,
// five in the small of the back, each with its bony spur and wings) curved as a spine is; twelve
// pairs of ribs sloping down to a breastbone (the lowest two floating free); collarbones and
// shoulder blades; a pelvis of flaring hip bones round a sacrum; an upper arm and the two bones of
// the forearm side by side; a hand of wrist bones, knuckles and jointed fingers; a thigh bone with
// its ball and neck, a kneecap, the shin and the thin bone beside it, and a foot of heel, arch and
// toes. Sizes are a real body's, for one 1.8 m tall, scaled to its height.
//
// Every bone's a plain piece (shapes.js), so the creature's pieces fold into a few things to draw
// (sculpt.js fold) however many there are.

import * as THREE from "three";
import { aim, CONE_WAY, cone, ellipsoid, glowSpot, joint, limb, part, ring, skin } from "./shapes.js";

// A bone from one point to another (in its parent's frame), tapering from one width to another
function rod(parent, from, to, r0, r1, material, detail = 5) {
    const way = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];

    return part(parent, limb(Math.hypot(...way), r0, r1, detail), material, { at: from, turn: aim(way), shadow: false });
}

// A knob of bone (a joint's end, a skull's part)
function knob(parent, radii, at, material, turn = [0, 0, 0], detail = 7) {
    return part(parent, ellipsoid(...radii, detail), material, { at, turn, shadow: false });
}

// The turn that lays a rib (a ring's arc, from its +x round towards its +y) round one side of the
// chest: from the spine at the back, round the side, to the front; tilted down towards the front
function ribTurn(side, tilt) {
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(side, 0, 0), new THREE.Vector3(0, -side, 0));

    basis.premultiply(new THREE.Matrix4().makeRotationX(tilt));

    const euler = new THREE.Euler().setFromRotationMatrix(basis);

    return [euler.x, euler.y, euler.z];
}

// Each rib's reach out to the side, and forward, at the back (metres, for one 1.8 m tall); how far
// round to the front it comes (a share of half a turn: the lowest two float free)
const RIBS = {
    wide: [0.055, 0.075, 0.09, 0.1, 0.108, 0.114, 0.118, 0.12, 0.118, 0.112, 0.095, 0.075],
    deep: [0.04, 0.052, 0.06, 0.066, 0.07, 0.073, 0.075, 0.075, 0.073, 0.07, 0.055, 0.04],
    round: [0.93, 0.93, 0.93, 0.93, 0.93, 0.93, 0.92, 0.86, 0.84, 0.8, 0.5, 0.42],
};

/**
 * A skull on a head joint (its origin where the spine meets it), at a scale (`s`: its height over
 * 1.8 m): bone, teeth, the dark of its holes, and its eyes' light (a colour). Returns { jaw (a
 * joint), glows (the lights in its sockets: sprites, to flicker) }.
 */
export function skull(head, s, { bone, teeth, dark, eyes, light }) {
    const at = (x, y, z) => [x * s, y * s, z * s];
    const size = (x, y, z) => [x * s, y * s, z * s];

    // (Its holes: near black, just proud of the bone round them, so they look sunk into it)
    const hole = skin(0x0c0a08, { roughness: 1 });

    // The cranium, the forehead, the brow ridge over the sockets
    knob(head, size(0.07, 0.058, 0.094), at(0, 0.07, -0.014), bone, [0, 0, 0], 12);
    knob(head, size(0.064, 0.05, 0.05), at(0, 0.066, 0.036), bone, [0, 0, 0], 10);
    knob(head, size(0.062, 0.013, 0.02), at(0, 0.054, 0.074), bone, [0.15, 0, 0], 8);

    // The face below: the temples hollowed either side, cheekbones and their arches back to the
    // ears, the upper jaw
    knob(head, size(0.05, 0.034, 0.042), at(0, 0.014, 0.056), bone, [0, 0, 0], 9);

    for (const side of [-1, 1]) {
        knob(head, size(0.02, 0.016, 0.024), at(side * 0.05, 0.022, 0.058), bone);
        rod(head, at(side * 0.062, 0.02, 0.05), at(side * 0.068, 0.022, 0.002), 0.0065 * s, 0.0055 * s, bone);
        knob(head, size(0.012, 0.02, 0.022), at(side * 0.064, 0.05, 0.03), dark);

        // (The sockets, deep and dark with a rim of bone round each, a point of light far in
        // each; the ear's hole)
        knob(head, size(0.021, 0.019, 0.007), at(side * 0.03, 0.036, 0.073), hole, [0, side * 0.25, 0]);
        part(head, ring(0.021 * s, 0.0035 * s, Math.PI * 2, 14), bone, { at: at(side * 0.03, 0.036, 0.075), turn: [0, side * 0.25, 0], scale: [1, 0.92, 1], shadow: false });
        knob(head, size(0.006, 0.006, 0.004), at(side * 0.03, 0.035, 0.078), eyes, [0, 0, 0], 6);
        knob(head, size(0.006, 0.008, 0.006), at(side * 0.07, 0.024, -0.004), hole);
    }

    // The nose: the bridge, and the hole beneath it
    knob(head, size(0.008, 0.012, 0.008), at(0, 0.034, 0.092), bone);
    knob(head, size(0.011, 0.016, 0.006), at(0, 0.013, 0.088), hole);

    // The upper teeth, round the front of the jaw
    const row = (parent, y, centre, radius) => {
        for (let k = 0; k < 10; k++) {
            const a = -1.25 + (k / 9) * 2.5;
            const front = Math.abs(a) < 0.5;

            knob(parent, size(front ? 0.0035 : 0.0045, 0.0065, 0.004), at(Math.sin(a) * radius * 1.15, y, centre + Math.cos(a) * radius), teeth, [0, a, 0], 5);
        }
    };

    row(head, -0.014, 0.058, 0.03);

    // The lower jaw: its U round the front, its two branches up to the hinge, the chin; its teeth
    const jaw = joint(head, "jaw", at(0, 0.012, 0.012));
    const arc = Math.PI * 1.15;

    part(jaw, ring(0.034 * s, 0.0075 * s, arc, 14), bone, { at: at(0, -0.042, 0.035), turn: [Math.PI / 2, 0, Math.PI / 2 - arc / 2], scale: [1.12, 1.2, 1], shadow: false });

    for (const side of [-1, 1]) {
        rod(jaw, at(side * 0.05, 0.0, -0.012), at(side * 0.043, -0.042, 0.01), 0.007 * s, 0.008 * s, bone);
    }

    knob(jaw, size(0.014, 0.011, 0.008), at(0, -0.046, 0.074), bone);
    row(jaw, -0.028, 0.035, 0.034);

    // A glow round each point of light in the sockets
    const glows = [];

    for (const side of [-1, 1]) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpot(), color: light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));

        glow.position.set(...at(side * 0.03, 0.035, 0.08));
        glow.scale.setScalar(0.042 * s);
        head.add(glow);
        glows.push(glow);
    }

    return { jaw, glows };
}

/**
 * The spine's vertebrae, ribs, breastbone, collarbones and shoulder blades, and the pelvis, on the
 * trunk's joints (`pelvis`: at the hips' height; `waist`: the small of the back's; `chest`, from
 * the lowest ribs up; `neck`, to the head, `neckLength` long), for its shoulders' reach
 * (`shoulders`) and height up the chest (`shoulderY`).
 */
export function trunk({ pelvis, waist, chest, neck }, s, { bone, gristle, waistLength, chestLength, neckLength, shoulders, shoulderY }) {
    const at = (x, y, z) => [x * s, y * s, z * s];
    const size = (x, y, z) => [x * s, y * s, z * s];

    // A vertebra: its body, the spur back from it, its wings out to the sides
    const vertebra = (parent, y, z, big, tall) => {
        knob(parent, [0.017 * s * big, tall * 0.42, 0.015 * s * big], [0, y, z], bone, [0, 0, 0], 6);
        part(parent, cone(0.026 * s * big, 0.006 * s * big, 4), bone, { at: [0, y, z - 0.012 * s * big], turn: aim([0, -0.55, -1], CONE_WAY), shadow: false });
        rod(parent, [-0.022 * s * big, y, z - 0.008 * s * big], [0.022 * s * big, y, z - 0.008 * s * big], 0.0035 * s * big, 0.0035 * s * big, bone, 4);
    };

    // The small of the back: five big vertebrae, curving in
    for (let k = 0; k < 5; k++) {
        const u = k / 4;

        vertebra(waist, waistLength * (0.12 + u * 0.8), -0.035 * s + Math.sin(u * Math.PI) * 0.012 * s, 1.3, waistLength * 0.2);
    }

    // Behind the ribs: twelve, curving out; and each pair of ribs from one
    const spineZ = (u) => -0.045 * s - Math.sin(u * Math.PI) * 0.012 * s;
    const top = chestLength - 0.018 * s;
    const gap = (chestLength + 0.02 * s) / 12.5;
    const fronts = [];

    for (let k = 0; k < 12; k++) {
        const u = k / 11;
        const y = top - k * gap;
        const z = spineZ(u);

        vertebra(chest, y, z, 0.95 + u * 0.3, gap);

        const wide = RIBS.wide[k] * s;
        const deep = RIBS.deep[k] * s;
        const tilt = 0.32 + k * 0.025;
        const centre = [0, y - deep * Math.sin(tilt), z + deep * Math.cos(tilt)];
        const round = RIBS.round[k] * Math.PI;

        for (const side of [-1, 1]) {
            part(chest, ring(1, 0.05, round, 16), bone, { at: centre, turn: ribTurn(side, tilt), scale: [deep, wide, 0.11 * s], shadow: false });

            // (Where it ends at the front, joined to the breastbone by gristle, the upper ten)
            if (k < 10) {
                const end = new THREE.Vector3(side * wide * Math.sin(round), 0, -deep * Math.cos(round)).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt);

                fronts.push({ k, end: [centre[0] + end.x, centre[1] + end.y, centre[2] + end.z] });
            }
        }
    }

    // The breastbone, down the front, and the gristle from the ribs' ends to it
    const breast = (k) => {
        const tilt = 0.32 + k * 0.025;
        const deep = RIBS.deep[k] * s;
        const y = top - k * gap;

        return [0, y - deep * Math.sin(tilt) - Math.sin(tilt) * deep * 0.95, spineZ(k / 11) + deep * Math.cos(tilt) * 1.95];
    };
    const [upper, lower] = [breast(0), breast(6)];

    knob(chest, size(0.024, 0.022, 0.007), [0, upper[1] + 0.005 * s, upper[2]], bone, [-0.25, 0, 0]);
    rod(chest, upper, lower, 0.013 * s, 0.011 * s, bone, 6);
    part(chest, cone(0.03 * s, 0.008 * s, 4), bone, { at: lower, turn: aim([0, -1, 0.25], CONE_WAY), shadow: false });

    for (const { k, end } of fronts) {
        const onto = k < 7 ? [0, upper[1] + (lower[1] - upper[1]) * (k / 6), upper[2] + (lower[2] - upper[2]) * (k / 6)] : [end[0] * 0.45, lower[1] - (k - 6) * 0.018 * s, lower[2] - 0.01 * s];

        rod(chest, end, [onto[0] + Math.sign(end[0]) * 0.012 * s, onto[1], onto[2]], 0.004 * s, 0.004 * s, gristle, 4);
    }

    // Collarbones, from the top of the breastbone out to the shoulders; the shoulder blades, flat on
    // the back of the ribs, with the ridge along each up to the shoulder's point
    for (const side of [-1, 1]) {
        const inner = [side * 0.018 * s, upper[1] + 0.012 * s, upper[2] - 0.004 * s];
        const middle = [side * shoulders * 0.5, shoulderY + 0.012 * s, upper[2] - 0.004 * s];
        const outer = [side * shoulders * 0.92, shoulderY + 0.008 * s, -0.01 * s];

        rod(chest, inner, middle, 0.006 * s, 0.0055 * s, bone, 5);
        rod(chest, middle, outer, 0.0055 * s, 0.006 * s, bone, 5);
        knob(chest, size(0.048, 0.068, 0.006), [side * 0.088 * s, shoulderY - 0.085 * s, spineZ(0.3) - 0.02 * s], bone, [0.15, -side * 0.45, side * 0.08], 8);
        rod(chest, [side * 0.05 * s, shoulderY - 0.05 * s, spineZ(0.3) - 0.03 * s], [side * shoulders * 0.9, shoulderY - 0.004 * s, -0.018 * s], 0.005 * s, 0.006 * s, bone, 4);
    }

    // The neck: seven small vertebrae up to the skull
    for (let k = 0; k < 7; k++) {
        const u = (k + 0.5) / 7;

        vertebra(neck, neckLength * u, -0.012 * s + Math.sin(u * Math.PI) * 0.008 * s, 0.72, neckLength / 7);
    }

    // The pelvis: the sacrum at the back between the two flaring hip bones, each curving down and
    // round to the sockets of the hips and meeting its fellow at the front; the sitting bones
    knob(pelvis, size(0.04, 0.056, 0.018), at(0, 0.02, -0.048), bone, [-0.45, 0, 0], 8);
    part(pelvis, cone(0.03 * s, 0.012 * s, 5), bone, { at: at(0, -0.02, -0.062), turn: [Math.PI - 0.5, 0, 0], shadow: false });

    for (const side of [-1, 1]) {
        knob(pelvis, size(0.068, 0.058, 0.012), at(side * 0.074, 0.058, -0.012), bone, [0.1, side * 0.75, side * 0.28], 10);
        part(pelvis, ring(0.066 * s, 0.006 * s, Math.PI * 0.9, 12), bone, { at: at(side * 0.074, 0.058, -0.012), turn: [0.1 + Math.PI / 2, side * 0.75 + Math.PI / 2, side * 0.28], scale: [1, 0.85, 1], shadow: false });
        knob(pelvis, size(0.028, 0.034, 0.028), at(side * 0.074, -0.028, 0.004), bone, [0, 0, side * 0.2], 8);
        rod(pelvis, at(side * 0.07, -0.022, 0.026), at(side * 0.008, -0.05, 0.052), 0.008 * s, 0.009 * s, bone, 5);
        rod(pelvis, at(side * 0.064, -0.05, 0.0), at(side * 0.01, -0.062, 0.04), 0.007 * s, 0.007 * s, bone, 5);
        knob(pelvis, size(0.016, 0.022, 0.018), at(side * 0.05, -0.064, -0.01), bone);
    }
}

/**
 * An arm's bones on its joints (`shoulder`, `elbow`, `hand`), for its bones' lengths and side
 * (-1 left, 1 right); its fingers curled round a grip (`grip`) or loose.
 */
export function arm({ shoulder, elbow, hand }, s, { bone, upperArm, foreArm, side, grip = false }) {
    const at = (x, y, z) => [x * s, y * s, z * s];
    const size = (x, y, z) => [x * s, y * s, z * s];
    const r = (value) => value * s;

    // The upper arm: its ball in the shoulder, the shaft, the knuckle of the elbow
    knob(shoulder, size(0.022, 0.022, 0.022), at(0, -0.006, 0), bone, [0, 0, 0], 8);
    rod(shoulder, [0, -r(0.02), 0], [0, -upperArm + r(0.02), 0], r(0.0105), r(0.009), bone, 6);
    knob(shoulder, size(0.024, 0.012, 0.014), [0, -upperArm + r(0.008), 0], bone);

    // The forearm's two bones side by side: the ulna, with the point of the elbow, on the inside;
    // the radius, widening to the wrist, on the outside
    rod(elbow, at(-side * 0.009, -0.004, -0.004), [-side * r(0.011), -foreArm + r(0.012), 0], r(0.008), r(0.0045), bone, 5);
    knob(elbow, size(0.01, 0.014, 0.01), at(-side * 0.008, 0.008, -0.012), bone);
    rod(elbow, at(side * 0.01, -0.008, 0.003), [side * r(0.012), -foreArm + r(0.008), r(0.004)], r(0.005), r(0.008), bone, 5);

    // The hand: the wrist's bones; four knuckle bones and their fingers, three bones each, bent a
    // little (or round a grip); the thumb
    knob(hand, size(0.018, 0.012, 0.01), at(0, -0.01, 0), bone);

    for (let k = 0; k < 4; k++) {
        const z = (1.5 - k) * 0.011;
        const knuckle = [-side * r(0.002), -r(0.078) + k * r(0.004), r(z * 1.25)];
        let from = knuckle;
        let bend = 0;

        rod(hand, at(0, -0.016, z), knuckle, r(0.0042), r(0.0036), bone, 4);

        for (const [n, long] of [0.038, 0.024, 0.018].entries()) {
            bend += grip ? [0.9, 1.1, 0.8][n] : [0.15, 0.25, 0.2][n];

            const to = [from[0] - side * Math.sin(bend) * r(long) * (k === 3 ? 0.8 : 1), from[1] - Math.cos(bend) * r(long) * (k === 3 ? 0.8 : 1), from[2]];

            rod(hand, from, to, r(0.0034 - n * 0.0005), r(0.003 - n * 0.0005), bone, 4);
            from = to;
        }
    }

    let from = at(-side * 0.006, -0.018, 0.02);
    const thumb = [
        [-side * 0.3, -1, 0.6, 0.042],
        [-side * (grip ? 0.9 : 0.4), -1, 0.4, 0.03],
        [-side * (grip ? 1.2 : 0.5), -1, 0.2, 0.022],
    ];

    for (const [x, y, z, long] of thumb) {
        const length = Math.hypot(x, y, z);
        const to = [from[0] + (x / length) * r(long), from[1] + (y / length) * r(long), from[2] + (z / length) * r(long)];

        rod(hand, from, to, r(0.0045), r(0.0035), bone, 4);
        from = to;
    }
}

/**
 * A leg's bones on its joints (`hip`, `knee`, `foot`), for its bones' lengths and side: the
 * thigh bone's ball and neck and the knob beside it, its shaft slanting in to the knee; the
 * kneecap; the shin and the thin bone beside it, with the ankle's knobs; the foot.
 */
export function leg({ hip, knee, foot }, s, { bone, thigh, shin, side }) {
    const at = (x, y, z) => [x * s, y * s, z * s];
    const size = (x, y, z) => [x * s, y * s, z * s];
    const r = (value) => value * s;

    knob(hip, size(0.022, 0.022, 0.022), at(0, 0, 0), bone, [0, 0, 0], 8);
    rod(hip, [0, 0, 0], at(side * 0.042, -0.032, 0), r(0.011), r(0.012), bone, 5);
    knob(hip, size(0.016, 0.022, 0.016), at(side * 0.046, -0.028, -0.004), bone);
    rod(hip, at(side * 0.042, -0.04, 0), [side * r(0.008), -thigh + r(0.03), r(0.004)], r(0.0135), r(0.0115), bone, 6);
    knob(hip, size(0.028, 0.019, 0.026), [0, -thigh + r(0.014), -r(0.002)], bone, [0, 0, 0], 8);

    knob(knee, size(0.014, 0.018, 0.007), at(0, 0.014, 0.03), bone);
    knob(knee, size(0.028, 0.011, 0.022), at(0, -0.012, 0), bone);
    rod(knee, at(0, -0.02, 0.004), [-side * r(0.004), -shin + r(0.02), r(0.004)], r(0.0125), r(0.0095), bone, 6);
    rod(knee, at(side * 0.025, -0.03, -0.006), [side * r(0.023), -shin + r(0.01), -r(0.004)], r(0.005), r(0.0045), bone, 4);
    knob(knee, size(0.009, 0.012, 0.009), [-side * r(0.012), -shin + r(0.012), r(0.004)], bone);
    knob(knee, size(0.008, 0.012, 0.008), [side * r(0.024), -shin + r(0.008), -r(0.004)], bone);

    // The foot: the ankle's bone and the heel under it, the arch, five long bones out to the toes,
    // each toe of two bones (the great toe's thicker)
    knob(foot, size(0.016, 0.012, 0.02), at(0, -0.012, 0.004), bone);
    knob(foot, size(0.016, 0.02, 0.03), at(0, -0.04, -0.028), bone);
    knob(foot, size(0.026, 0.012, 0.018), at(side * 0.004, -0.032, 0.03), bone);

    for (let k = 0; k < 5; k++) {
        const x = side * (-0.02 + k * 0.011);
        const great = k === 0;
        const ball = [x * 1.35 * s, -r(0.058), r(0.112 - k * 0.006)];
        let from = ball;

        rod(foot, [x * s, -r(0.036), r(0.042)], ball, r(great ? 0.007 : 0.0045), r(great ? 0.0065 : 0.004), bone, 4);

        for (const [n, long] of (great ? [0.03, 0.022] : [0.022, 0.014]).entries()) {
            const to = [from[0], from[1] - r(0.004) * n, from[2] + r(long * (1 - k * 0.08))];

            rod(foot, from, to, r(great ? 0.0065 : 0.0038), r(great ? 0.0055 : 0.0032), bone, 4);
            from = to;
        }
    }
}
