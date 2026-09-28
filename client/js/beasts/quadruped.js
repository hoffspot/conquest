// A four-legged creature, built from a look (beasts/looks.js) and sculpted in one piece
// (sculpt.js): a deep chest, a tucked-up waist and a haunch; a neck flowing into a head with a
// muzzle, a jaw that opens on its teeth, eyes and ears; legs as an animal's are (a front leg of
// upper arm, forearm and pastern; a hind leg of thigh, shin and the long bone from the hock that
// makes it bend back), each ending in a paw or a hoof; and a tail. What makes each kind itself is
// added: a mane, tusks, horns, quills, armour plates, wings, spots and stripes and a paler belly
// painted on. Wolves, bears, boars, rats, porcupines, hyenas, crocodiles, dragons and the rest are
// all this, sized and coloured their own way.
//
// It moves itself (pose): walking in a trot, running in a gallop (each leg swinging and folding
// as it comes through, each footfall told), breathing and looking about when it stands, lunging
// and snapping (or rearing and mauling, goring, bristling, stinging, breathing fire) to attack,
// flinching when struck, and falling on its side when it dies. A wyvern or a dragon has wings,
// folded along its back, beating when it runs or strikes.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { cone, ellipsoid, joint, limb, membrane, part, shade, skin } from "./shapes.js";

const TAU = Math.PI * 2;

// Where each leg's in its stride (0 to 1) at a trot and a gallop: diagonal pairs together at a
// trot; front then hind at a gallop
const TROT = { lf: 0, rh: 0, rf: 0.5, lh: 0.5 };
const GALLOP = { lf: 0, rf: 0.12, lh: 0.5, rh: 0.62 };

// Each leg's three bones (upper, lower, and the pastern or the bone below the hock): how long, as
// shares of the leg, and how they're angled at rest (radians, + back at the bottom)
const FRONT = { lengths: [0.4, 0.42, 0.18], angles: [0.3, -0.35, 0.2] };
const HIND = { lengths: [0.36, 0.38, 0.26], angles: [-0.5, 1, -0.55] };

const smooth = (u) => u * u * (3 - 2 * u);

// A point on an ellipsoid's surface (radii r, centred at c), the way `towards` points, sunk in a
// little (a share of the way out)
function onSurface([rx, ry, rz], [cx, cy, cz], [ux, uy, uz], sink = 0.9) {
    const reach = sink / Math.hypot(ux / rx, uy / ry, uz / rz);

    return [cx + ux * reach, cy + uy * reach, cz + uz * reach];
}

/**
 * Build a four-legged creature from its look ({ length, height, girth, width, colours, and the
 * rest: beasts/looks.js}): { object, height, length, joints, materials, pose(state) }. `key`
 * shares its body with every other built from the same look.
 */
export function quadruped(look, random, key = null) {
    const { length, height, girth, width } = look;
    const colours = look.colours;
    const spectral = Boolean(look.spectral);
    const clear = spectral ? 0.3 : 0;
    const fur = new THREE.Color(colours.fur);
    const belly = new THREE.Color(colours.belly ?? shade(colours.fur, 0.3).getHex());
    const dark = colours.dark ?? shade(colours.fur, -0.6).getHex();
    const scaly = Boolean(look.flat);
    const sculpt = new Sculpt({ blend: girth * 0.35, grain: look.grain ?? (scaly ? "scales" : "fur"), grainSize: look.grainSize ?? (scaly ? girth * 0.22 : girth * 0.06), countershade: 0.14 });
    const material = new THREE.MeshStandardMaterial({
        roughness: look.roughness ?? 0.9,
        metalness: scaly ? 0.05 : 0,
        transparent: spectral,
        opacity: 1 - clear,
        depthWrite: !spectral,
        emissive: spectral ? new THREE.Color(colours.aura ?? shade(colours.fur, 0.25).getHex()) : new THREE.Color(0),
        emissiveIntensity: spectral ? 0.35 : 1,
    });
    const hard = skin(dark, { roughness: 0.55, clear });
    const eyes = skin(colours.eyes ?? 0x201810, { roughness: 0.1, glow: colours.glow ?? null, glowing: colours.glow ? 2.4 : 1 });
    const ivory = skin(colours.ivory ?? 0xe8dfc8, { roughness: 0.45 });
    const mouth = skin(0x4a1414, { roughness: 0.6 });
    const earSkin = skin(colours.fur, { roughness: 0.9, clear, flat: scaly });
    const lowSlung = Boolean(look.lowSlung);
    const thick = look.legs ?? width * 0.3;

    // Where the body's middle is: its chest's top at its shoulder height (low, a crocodile's)
    const bodyY = lowSlung ? girth * 1.25 : height - girth;

    const object = new THREE.Group();
    const body = joint(object, "body", [0, bodyY, 0]);
    const torso = joint(body, "torso");

    // The body: a deep chest with the withers above it, a tucked-up waist, a haunch and rump
    const chest = look.chest ?? 1.1;
    const haunch = look.haunch ?? 0.95;

    sculpt.add(torso, { ellipsoid: [width * chest, girth * 1.02 * chest, length * 0.3] }, fur, { at: [0, -girth * 0.06, length * 0.2] });
    sculpt.add(torso, { ellipsoid: [width * 0.78, girth * 0.55, length * 0.22] }, fur, { at: [0, girth * 0.42, length * 0.22] });
    sculpt.add(torso, { ellipsoid: [width * 0.8, girth * (lowSlung ? 0.95 : 0.74), length * 0.3] }, fur, { at: [0, girth * (lowSlung ? 0 : 0.14), -length * 0.04] });
    sculpt.add(torso, { ellipsoid: [width * 0.9 * haunch, girth * 0.84 * haunch, length * 0.24] }, fur, { at: [0, girth * 0.1, -length * 0.28] });
    sculpt.add(torso, { ellipsoid: [width * 0.7 * haunch, girth * 0.62 * haunch, length * 0.15] }, fur, { at: [0, girth * 0.22, -length * 0.42] });

    // (Its underside paler; a darker saddle; its markings)
    sculpt.paint(torso, [width * 0.85, girth * 0.55, length * 0.46], belly, { at: [0, -girth * 0.78, length * 0.02], soft: girth * 0.5 });

    if (colours.saddle) {
        sculpt.paint(torso, [width * 0.7, girth * 0.4, length * 0.36], colours.saddle, { at: [0, girth * 0.75, -length * 0.05], soft: girth * 0.45, strength: 0.8 });
    }

    const markings = look.spots ?? look.stripes ?? 0;

    for (let k = 0; k < markings; k++) {
        const along = (random() - 0.5) * length * 0.8;
        const round = (random() - 0.5) * Math.PI * (look.stripes ? 0.7 : 1);
        const at = [Math.sin(round) * width * 0.95, girth * 0.1 + Math.cos(round) * girth * 0.9, along];

        sculpt.paint(torso, look.stripes ? [width * 0.06, girth * 0.5, width * 0.05] : [girth * 0.12, girth * 0.12, girth * 0.12], dark, { at, turn: [0, 0, -round], soft: girth * 0.05, strength: 0.85 });
    }

    if (look.mane) {
        sculpt.add(torso, { ellipsoid: [width * 1.15, girth * 1.15, length * 0.17] }, colours.mane ?? shade(colours.fur, -0.35).getHex(), { at: [0, girth * 0.3, length * 0.34] });
    }

    // A crest: a ridge of dark bristles down the neck and back (a boar's, a hyena's)
    const crest = look.crest ? skin(colours.mane ?? dark, { roughness: 1 }) : null;

    for (let k = 0; crest && k < 14; k++) {
        const along = length * 0.36 - (k / 13) * length * 0.72;

        part(torso, cone(girth * (0.3 - k * 0.012), width * 0.1, 4), crest, { at: [0, girth * (0.86 - Math.abs(k - 3) * 0.012), along], turn: [-0.5, 0, 0], shadow: false });
    }

    // Quills, bristling out of its back; armour plates along it
    const quills = joint(torso, "quills");
    const quillSkin = skin(colours.ivory ?? 0xe8e0cc, { roughness: 0.5 });

    for (let k = 0; k < (look.quills ?? 0); k++) {
        const along = -length * 0.4 + random() * length * 0.72;
        const round = (random() - 0.5) * Math.PI * 1.15;
        const long = length * (0.3 + random() * 0.25);

        part(quills, cone(long, width * 0.03, 4), random() > 0.35 ? quillSkin : hard, {
            at: [Math.sin(round) * width * 0.8, girth * 0.12 + Math.cos(round) * girth * 0.8, along],
            turn: [-1.15 - random() * 0.35, 0, -round * 0.85],
            shadow: false,
        });
    }

    for (let k = 0; k < (look.plates ?? 0); k++) {
        const along = length * 0.36 - (k / Math.max(1, look.plates - 1)) * length * 0.8;

        for (const side of look.plateRows === 2 ? [-1, 1] : [0]) {
            part(torso, cone(girth * (look.plateRows === 2 ? 0.28 : 0.42), width * 0.16, 4), hard, { at: [side * width * 0.32, girth * (0.72 + (look.plateRows === 2 ? 0 : 0.1)), along], turn: [-0.3, Math.PI / 4, side * 0.25] });
        }
    }

    // The neck, flowing into the shoulders, and the head
    const neckLength = look.neck ?? length * 0.3;
    const neckUp = look.neckUp ?? 0.55;
    const [hx, hy, hz] = look.head ?? [width * 0.7, girth * 0.6, length * 0.16];
    const snout = look.snout ?? { length: hz * 1.2, radius: hy * 0.45 };
    const neck = joint(torso, "neck", [0, girth * 0.4, length * 0.34]);

    neck.rotation.x = -neckUp;
    sculpt.add(neck, { limb: [neckLength, width * 0.62, hx * 0.78] }, fur, { turn: [-Math.PI / 2, 0, 0], blend: girth * 0.3 });

    if (look.mane) {
        sculpt.add(neck, { limb: [neckLength * 0.9, width * 0.95, hx * 1.05] }, colours.mane ?? shade(colours.fur, -0.35).getHex(), { turn: [-Math.PI / 2, 0, 0], at: [0, girth * 0.12, 0] });
    }

    for (let k = 0; look.spines && k < 5; k++) {
        part(neck, cone(girth * 0.3, width * 0.12, 4), hard, { at: [0, width * 0.55 - k * width * 0.03, neckLength * (0.1 + k * 0.18)], turn: [-0.6, Math.PI / 4, 0] });
    }

    const head = joint(neck, "head", [0, 0, neckLength]);

    head.rotation.x = neckUp * 0.85;
    sculpt.add(head, { ellipsoid: [hx, hy, hz] }, fur, { at: [0, 0, hz * 0.3], blend: hy * 0.4 });
    sculpt.add(head, { ellipsoid: [hx * 0.78, hy * 0.72, hz * 0.8] }, colours.mask ?? fur, { at: [0, -hy * 0.25, hz * 0.62], blend: hy * 0.4 });

    // The muzzle, and its nose
    const r = snout.radius;
    const wide = snout.flat ?? 1;
    const muzzleAt = [0, -hy * 0.12, hz * 0.85];

    sculpt.add(head, { limb: [snout.length, r, r * (snout.taper ?? 0.7)] }, colours.mask ?? fur, { at: muzzleAt, turn: [-Math.PI / 2, 0, 0], scale: snout.flat ? [wide, 1, 1] : null, blend: hy * 0.35 });
    part(head, ellipsoid(r * 0.62 * wide, r * 0.5, r * 0.45, 10), hard, { at: [0, muzzleAt[1] + r * 0.2, muzzleAt[2] + snout.length + r * 0.45] });

    // Inside the mouth, dark; the jaw beneath, a piece of its own that opens, with its teeth
    const tip = snout.length * 0.95;

    part(head, ellipsoid(r * 0.6 * wide, r * 0.35, tip * 0.5, 10), mouth, { at: [0, muzzleAt[1] - r * 0.55, muzzleAt[2] + tip * 0.45], shadow: false });

    const jaw = joint(head, "jaw", [0, muzzleAt[1] - r * 0.62, muzzleAt[2] - r * 0.2]);

    sculpt.add(jaw, { limb: [tip, r * 0.62, r * 0.42] }, colours.mask ?? belly, { turn: [-Math.PI / 2, 0, 0], scale: snout.flat ? [wide, 1, 1] : null, blend: r * 0.3, group: 1 });

    if (look.fangs ?? !look.hooves) {
        for (const side of [-1, 1]) {
            part(jaw, cone(r * 0.55, r * 0.12, 5), ivory, { at: [side * r * 0.4 * wide, r * 0.25, tip * 0.92], shadow: false });
            part(head, cone(r * 0.6, r * 0.13, 5), ivory, { at: [side * r * 0.45 * wide, muzzleAt[1] - r * 0.45, muzzleAt[2] + tip * 0.85], turn: [Math.PI, 0, 0], shadow: false });
        }
    }

    // Eyes, set in the skull; ears on top; tusks and horns
    for (const side of [-1, 1]) {
        part(head, ellipsoid(hx * 0.19, hx * 0.16, hx * 0.14, 10), eyes, { at: onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * 0.55, 0.38, 0.75], 1.02), turn: [0, side * 0.5, 0] });

        if (look.ears && look.ears !== "none") {
            const ear = look.ears === "round" ? ellipsoid(hx * 0.32, hx * 0.3, hx * 0.1, 10) : cone(hy * (look.ears === "small" ? 0.55 : 1.15), hx * 0.3, 6);

            part(head, ear, earSkin, { at: onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * 0.5, 0.85, -0.1], 0.97), turn: [-0.25, side * 0.3, -side * 0.35] });
        }

        if (look.tusks) {
            part(head, cone(look.tusks, r * 0.3, 6), ivory, { at: [side * r * 0.85 * wide, muzzleAt[1] - r * 0.3, muzzleAt[2] + snout.length * 0.6], turn: [0.35, 0, side * 0.55] });
        }

        if (look.horns) {
            part(head, cone(look.horns, hx * 0.2, 7), ivory, { at: onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * 0.45, 0.8, -0.3], 0.85), turn: [-0.95, 0, -side * 0.45] });
        }
    }

    // Four legs: each three bones and a paw or hoof, the upper one's muscle melting into the body
    const legs = {};

    for (const [name, front, side] of [["lf", 1, -1], ["rf", 1, 1], ["lh", -1, -1], ["rh", -1, 1]]) {
        const spec = front > 0 ? FRONT : HIND;
        const topY = front > 0 ? -girth * 0.1 : girth * 0.05;
        const reach = (bodyY + topY) * (front > 0 ? 1 : look.slope ?? 1);
        const span = lowSlung ? 1.35 : spec.lengths.reduce((sum, share, k) => sum + share * Math.cos(spec.angles.slice(0, k + 1).reduce((a, b) => a + b, 0)), 0);
        const [upper, lower, cannon] = spec.lengths.map((share) => (share * reach) / span);
        const hip = joint(body, `hip-${name}`, [side * width * (lowSlung ? 0.8 : 0.55), topY, front * length * (front > 0 ? 0.26 : 0.3)]);
        const muscle = front > 0 ? [thick * 1.5, upper * 0.55, thick * 1.9] : [thick * 1.75, upper * 0.62, thick * 2.3];

        sculpt.add(hip, { ellipsoid: muscle }, fur, { at: [0, -upper * 0.25, front > 0 ? 0 : thick * 0.2] });
        sculpt.add(hip, { limb: [upper, thick * (front > 0 ? 1.2 : 1.35), thick * 0.9] }, fur, { blend: thick * 0.8 });

        const knee = joint(hip, `knee-${name}`, [0, -upper, 0]);

        sculpt.add(knee, { limb: [lower, thick * 0.88, thick * 0.6] }, fur, { blend: thick * 0.6 });

        const ankle = joint(knee, `ankle-${name}`, [0, -lower, 0]);

        sculpt.add(ankle, { limb: [cannon, thick * 0.58, thick * 0.52] }, fur, { blend: thick * 0.4 });

        const foot = joint(ankle, `foot-${name}`, [0, -cannon, 0]);

        if (look.hooves) {
            part(foot, limb(thick * 0.75, thick * 0.55, thick * 0.72, 8), hard, { at: [0, thick * 0.55, thick * 0.08] });
        } else {
            sculpt.add(foot, { ellipsoid: [thick * 0.78, thick * 0.48, thick * 1.1] }, fur, { at: [0, thick * 0.4, thick * 0.4], blend: thick * 0.4 });
            sculpt.paint(foot, [thick * 0.9, thick * 0.3, thick * 1.2], dark, { at: [0, thick * 0.08, thick * 0.4], soft: thick * 0.25, strength: 0.6 });

            for (const toe of [-1, 0, 1]) {
                part(foot, cone(thick * 0.35, thick * 0.1, 4), hard, { at: [toe * thick * 0.35, thick * 0.12, thick * 1.35], turn: [Math.PI / 2 + 0.5, 0, 0], shadow: false });
            }
        }

        // (Low-slung: the upper leg out to the side, the rest down)
        const splay = lowSlung ? 1.15 : 0;
        const bend = lowSlung ? 0.3 : 1;

        hip.rotation.set(spec.angles[0] * bend, 0, side * splay);
        knee.rotation.set(spec.angles[1] * bend, 0, -side * splay);
        ankle.rotation.set(spec.angles[2] * bend, 0, 0);
        legs[name] = { hip, knee, ankle, front, side, rest: [hip.rotation.x, knee.rotation.x, ankle.rotation.x] };
    }

    // The tail: bones hanging back from the rump, thick and tapering, or a bushy brush
    const tailParts = [];
    const tail = look.tail ?? { length: length * 0.5, radius: width * 0.18 };
    const segments = tail.length > length ? 5 : 4;
    const segment = tail.length / segments;
    let from = joint(torso, "tail", [0, girth * 0.4, -length * 0.46]);

    from.rotation.x = tail.lift ?? -0.6;

    for (let k = 0; k < segments; k++) {
        const r0 = tail.radius * (1 - (k / segments) * 0.75);
        const r1 = tail.radius * (1 - ((k + 1) / segments) * 0.75);
        const tint = colours.tail ?? (k === segments - 1 && look.tipColour ? look.tipColour : fur);

        if (tail.bushy) {
            sculpt.add(from, { ellipsoid: [r0 * 1.6, r0 * 1.6, segment * 0.62] }, tint, { at: [0, 0, -segment * 0.5], blend: r0 * 0.8 });
        } else {
            sculpt.add(from, { limb: [segment, r0, r1] }, tint, { turn: [Math.PI / 2, 0, 0], blend: r0 * 0.6 });
        }

        if (look.spines) {
            part(from, cone(r0 * 1.1, r0 * 0.45, 4), hard, { at: [0, r0 * 0.75, -segment * 0.5], turn: [-0.7, Math.PI / 4, 0] });
        }

        tailParts.push(from);
        from = joint(from, `tail-${k + 1}`, [0, 0, -segment]);
        from.rotation.x = tail.curl ?? 0.1;
    }

    if (tail.sting) {
        part(from, cone(tail.sting, tail.radius * 0.8, 6), ivory, { turn: [-Math.PI / 2, 0, 0] });
    }

    // Wings (a wyvern's, a dragon's): an arm out from each shoulder with a membrane stretched from
    // it back to the flank, folded along its back at rest, beating when it runs or strikes
    const wings = [];

    if (look.wings) {
        const span = look.wings.span;
        const hide = skin(colours.wings ?? shade(colours.fur, -0.3).getHex(), { roughness: 0.75, side: THREE.DoubleSide, clear });

        for (const side of [-1, 1]) {
            const root = joint(torso, `wing-${side}`, [side * width * 0.55, girth * 0.7, length * 0.2]);

            sculpt.add(root, { limb: [span * 0.45, width * 0.16, width * 0.08] }, fur, { turn: [0, 0, side * Math.PI / 2], blend: width * 0.2 });
            part(root, membrane([[0, girth * 0.3], [side * span * 0.45, 0], [side * span * 0.45, -span * 0.3], [side * span * 0.2, -length * 0.35], [0, -length * 0.45]]), hide, { shadow: false });

            const tipJoint = joint(root, "tip", [side * span * 0.45, 0, 0]);

            sculpt.add(tipJoint, { limb: [span * 0.55, width * 0.08, width * 0.035] }, fur, { turn: [0, 0, side * Math.PI / 2], blend: width * 0.1 });
            part(tipJoint, membrane([[0, 0], [side * span * 0.55, span * 0.02], [side * span * 0.42, -span * 0.16], [side * span * 0.34, -span * 0.3], [side * span * 0.18, -span * 0.3], [0, -span * 0.3]]), hide, { shadow: false });

            for (const reach of [0.3, 0.55, 0.85]) {
                part(tipJoint, limb(span * 0.32, width * 0.025, width * 0.012, 5), hard, { at: [side * span * 0.55 * reach, 0, 0], turn: [Math.PI / 2 + 0.2, 0, 0], shadow: false });
            }

            wings.push({ root, tip: tipJoint, side });
        }
    }

    // The skin over it all, bound to its bones
    const mesh = sculpt.build(object, material, key);

    mesh.geometry.computeBoundingBox();

    const box = mesh.geometry.boundingBox;
    const rest = { neck: neck.rotation.x, head: head.rotation.x, tail: tailParts.map((each) => each.rotation.x) };
    const frontY = -girth * 0.1;
    const hindY = girth * 0.05;
    let phase = 0;
    let open = 0;
    const planted = { lf: false, rf: false, lh: false, rh: false };

    // Pitch the body (nose up, -) about a point in it (y, z in the body's frame), which stays put:
    // the hind hips when it rears, the shoulders when it sits
    const pitch = (angle, [py, pz]) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        body.rotation.x += angle;
        body.position.y += py - (py * cos - pz * sin);
        body.position.z += pz - (py * sin + pz * cos);
    };

    // The legs folded or reached (added to what they're doing), by a weight
    const bendLeg = (leg, [h, k, a], weight) => {
        leg.hip.rotation.x += h * weight;
        leg.knee.rotation.x += k * weight;
        leg.ankle.rotation.x += a * weight;
    };

    // What it does when it's been standing a while (each weighted in and out: `w`, and `t`
    // seconds into it): sitting, lying down, sniffing the ground, scratching, howling, shaking
    // itself, yawning, grooming, rooting, stretching, basking
    const RESTS = {
        sit(w) {
            pitch(-0.55 * w, [frontY, length * 0.26]);
            bendLeg(legs.lf, [0.55, 0, 0], w);
            bendLeg(legs.rf, [0.55, 0, 0], w);
            bendLeg(legs.lh, [-0.75, 1.3, -0.3], w);
            bendLeg(legs.rh, [-0.75, 1.3, -0.3], w);
            neck.rotation.x += 0.35 * w;
            tailParts[0].rotation.x -= 0.5 * w;
        },
        lie(w, t) {
            body.position.y -= (bodyY - girth * 1.05) * w;
            bendLeg(legs.lf, [-0.6, -0.95, 0.1], w);
            bendLeg(legs.rf, [-0.6, -0.95, 0.1], w);
            bendLeg(legs.lh, [-0.9, 1.6, -0.6], w);
            bendLeg(legs.rh, [-0.9, 1.6, -0.6], w);
            legs.lh.hip.rotation.z -= 0.35 * w;
            legs.rh.hip.rotation.z += 0.35 * w;
            neck.rotation.x += (0.45 + Math.sin(t * 0.3) * 0.08) * w;
            tailParts.forEach((each, k) => (each.rotation.x += (k ? 0 : -0.3) * w));
        },
        sniff(w, t) {
            neck.rotation.x += (0.95 + Math.sin(t * 0.8) * 0.12) * w;
            neck.rotation.y += Math.sin(t * 0.55) * 0.45 * w;
            head.rotation.x += (0.35 + Math.sin(t * 14) * 0.03) * w;
        },
        scratch(w, t) {
            RESTS.sit(w);
            legs.lh.hip.rotation.x += (-0.9 + Math.sin(t * 22) * 0.25) * w;
            legs.lh.hip.rotation.z -= 0.5 * w;
            neck.rotation.y -= 0.6 * w;
            head.rotation.z = -0.4 * w;
        },
        howl(w, t) {
            RESTS.sit(w);
            neck.rotation.x -= 1.05 * w;
            head.rotation.x -= 0.35 * w;
            jaw.rotation.x += (0.35 + Math.sin(t * 3) * 0.08) * w;
        },
        shake(w, t) {
            body.rotation.z += Math.sin(t * 26) * 0.18 * w;
            neck.rotation.y += Math.sin(t * 26 + 1) * 0.35 * w;
            tailParts.forEach((each) => (each.rotation.y += Math.sin(t * 26 + 2) * 0.4 * w));
        },
        yawn(w, t) {
            const gape = Math.max(0, Math.sin(Math.min(1, t / 3) * Math.PI));

            neck.rotation.x -= 0.3 * gape * w;
            head.rotation.x -= 0.3 * gape * w;
            jaw.rotation.x += 0.95 * gape * w;
        },
        groom(w, t) {
            pitch(-1.05 * w, [hindY, -length * 0.3]);
            bendLeg(legs.lh, [1.05 - 0.5, 0.6, -0.3], w);
            bendLeg(legs.rh, [1.05 - 0.5, 0.6, -0.3], w);
            bendLeg(legs.lf, [-0.6 + Math.sin(t * 9) * 0.35, -1.2, 0.8], w);
            bendLeg(legs.rf, [-0.6 + Math.sin(t * 9 + 0.8) * 0.35, -1.2, 0.8], w);
            neck.rotation.x += 0.9 * w;
            head.rotation.x += 0.3 * w;
        },
        root(w, t) {
            neck.rotation.x += (1.05 + Math.sin(t * 5) * 0.15) * w;
            head.rotation.x += 0.4 * w;
            body.position.z += Math.sin(t * 5) * length * 0.03 * w;
        },
        stretch(w, t) {
            const reach = Math.max(0, Math.sin(Math.min(1, t / 3.5) * Math.PI));

            pitch(0.3 * reach * w, [hindY, -length * 0.3]);
            bendLeg(legs.lf, [-0.9, -0.2, 0.2], reach * w);
            bendLeg(legs.rf, [-0.9, -0.2, 0.2], reach * w);
            neck.rotation.x -= 0.3 * reach * w;
            jaw.rotation.x += 0.4 * reach * w;
            open = Math.max(open, reach * w);
        },
        bask(w, t) {
            body.position.y -= (bodyY - girth * 1.05) * w;
            jaw.rotation.x += (0.5 + Math.sin(t * 0.2) * 0.1) * w;
            neck.rotation.x -= 0.1 * w;
        },
    };

    // Its attacks, each over `u` (0 to 1), landing at `hit`; `out` rises to 1 at the blow and back
    const ATTACKS = {
        // Lunging and snapping
        bite({ u, hit, before, after, out }) {
            body.position.z += length * 0.28 * out;
            neck.rotation.x += 0.25 * out;
            jaw.rotation.x = u < hit ? 0.8 * before : 0.8 * Math.max(0, 1 - after * 4);
        },
        // Two quick snaps, the head turning into them
        snap({ u, out }) {
            body.position.z += length * 0.12 * out;
            neck.rotation.y += Math.sin(u * Math.PI * 2) * 0.3;
            jaw.rotation.x = 0.7 * Math.abs(Math.sin(u * Math.PI * 2.5));
        },
        // A crouch, then a leap on its prey, forelegs reaching
        pounce({ u, hit, before, after }) {
            const crouch = u < hit * 0.55 ? smooth(u / (hit * 0.55)) : 0;
            const leap = u < hit * 0.55 ? 0 : u < hit ? smooth((u - hit * 0.55) / (hit * 0.45)) : 1 - smooth(after);

            body.position.y -= girth * 0.45 * crouch;
            body.position.y += girth * 0.9 * Math.sin(leap * Math.PI * 0.9) * (u < hit ? 1 : 0.5);
            body.position.z += length * 0.55 * leap;
            pitch(-0.35 * leap + 0.15 * crouch, [hindY, -length * 0.3]);
            bendLeg(legs.lf, [-1.0, -0.3, 0.3], leap);
            bendLeg(legs.rf, [-1.0, -0.3, 0.3], leap);
            bendLeg(legs.lh, [-0.4, 0.8, -0.5], crouch);
            bendLeg(legs.rh, [-0.4, 0.8, -0.5], crouch);
            jaw.rotation.x = 0.8 * (u < hit ? before : Math.max(0, 1 - after * 3));
        },
        // Rearing up on its hind legs, and bringing both forepaws down
        maul({ u, hit, after, out }) {
            const angle = -0.95 * out;

            pitch(angle, [hindY, -length * 0.3]);
            legs.lh.hip.rotation.x -= angle;
            legs.rh.hip.rotation.x -= angle;
            bendLeg(legs.lf, [-1.2 + (u > hit ? 1.2 * after : 0), -0.3, 0.8], out);
            bendLeg(legs.rf, [-0.9 + (u > hit ? 1.1 * after : 0), -0.4, 0.8], out);
            neck.rotation.x += 0.5 * out;
            jaw.rotation.x = 0.6 * out;
        },
        // A forepaw raised and raked across
        swipe({ u, hit, before, after, out }) {
            const leg = legs.rf;
            const across = u < hit ? -0.5 * smooth(before) : -0.5 + 1.3 * smooth(after);

            pitch(-0.25 * out, [hindY, -length * 0.3]);
            leg.hip.rotation.x += -1.2 * out;
            leg.hip.rotation.z += across * out;
            leg.ankle.rotation.x += 0.9 * out;
            body.rotation.y += -across * 0.25 * out;
            neck.rotation.y += 0.3 * out;
            jaw.rotation.x = 0.4 * out;
        },
        // Head down, charging, and a toss of the tusks
        gore({ u, hit, before, after, out }) {
            body.position.z += length * 0.25 * out;
            neck.rotation.x = rest.neck + (u < hit ? 0.5 * smooth(before) : 0.5 - 1.2 * Math.sin(after * Math.PI));
        },
        // A butt of the head, low then flung up
        toss({ u, hit, before, after, out }) {
            neck.rotation.x = rest.neck + (u < hit ? 0.7 * smooth(before) : 0.7 - 1.5 * smooth(Math.min(1, after * 2)) * (1 - smooth(after)));
            body.position.z += length * 0.12 * out;
            pitch(u < hit ? 0 : -0.2 * Math.sin(after * Math.PI), [hindY, -length * 0.3]);
        },
        // Up on its hind legs a little, and both forefeet stamped down
        stamp({ u, hit, out }) {
            const up = u < hit ? out : 0;

            pitch(-0.45 * up, [hindY, -length * 0.3]);
            bendLeg(legs.lf, [-0.7, 0, 0.6], up);
            bendLeg(legs.rf, [-0.7, 0, 0.6], up);
            neck.rotation.x += 0.35 * out;
        },
        // A bite, then the head shaken side to side
        shake({ u, hit, before, after, out }) {
            body.position.z += length * 0.2 * out;
            jaw.rotation.x = u < hit ? 0.7 * before : 0.15;
            neck.rotation.y += u < hit ? 0 : Math.sin(after * Math.PI * 6) * 0.45 * (1 - after);
            head.rotation.z = u < hit ? 0 : Math.sin(after * Math.PI * 6) * 0.3 * (1 - after);
        },
        // The body twisting and the tail whipped round
        tailSlap({ u, hit, before, after, out }) {
            const swing = u < hit ? -0.4 * smooth(before) : -0.4 + 1.2 * smooth(after) * (1 - smooth(after) * 0.6);

            body.rotation.y += swing * 0.6;
            tailParts.forEach((each, k) => (each.rotation.y += swing * (1 + k * 0.35)));
            neck.rotation.y -= swing * 0.5;
            jaw.rotation.x = 0.2 * out;
        },
        // Quills flared, backing into the attacker
        bristle({ out }) {
            quills.scale.setScalar(1 + 0.4 * out);
            body.position.z -= length * 0.2 * out;
            tailParts[0].rotation.x = rest.tail[0] + 0.9 * out;
        },
        // The tail brought up over the back and stabbed down
        sting({ out }) {
            tailParts.forEach((each, k) => (each.rotation.x = rest.tail[k] + (k === 0 ? 1.4 : 0.9) * out));
            body.position.z += length * 0.1 * out;
            jaw.rotation.x = 0.4 * out;
        },
        // The head drawn back and up, then thrust out, jaws wide (fire, or venom, from them)
        breath({ u, hit, before, after, out }) {
            neck.rotation.x = rest.neck + (u < hit ? -0.45 * smooth(before) : -0.45 + 0.8 * smooth(Math.min(1, after * 3)));
            body.position.z += length * 0.08 * out;
            jaw.rotation.x = u < hit ? 0.2 * before : 0.9 * (1 - smooth(after));
            open = Math.max(open, out);
        },
        spit({ u, hit, before, after }) {
            neck.rotation.x = rest.neck + (u < hit ? -0.35 * smooth(before) : -0.35 + 0.6 * smooth(Math.min(1, after * 4)));
            jaw.rotation.x = u < hit ? 0.1 : 0.7 * (1 - smooth(after));
        },
    };

    return {
        object,
        height: box.max.y,
        length: box.max.z - box.min.z,
        joints: { torso, head, jaw, body, mouth: jaw, quills },
        materials: { body: material },
        attacks: Object.keys(ATTACKS),
        rests: Object.keys(RESTS),

        /**
         * Put it in its pose for a moment: `speed` (m/s), `run` (galloping), `t` (seconds), and
         * what it's doing (`attack`: { u: 0 to 1 through it, hit, style }; `react`, `dead`: { u };
         * `rest`: { name, w: how far into it, t: seconds }), telling each footfall (`onStep`).
         */
        pose({ dt, t, speed, run, attack, react, dead, rest: resting, onStep }) {
            const stride = bodyY * (run ? 3.4 : 2.3);
            const moving = Math.min(1, speed / 0.5);
            const gait = run ? GALLOP : TROT;

            phase = (phase + (speed / stride) * dt) % 1;

            // The legs: each swinging through its stride, folding as it comes forward
            for (const [name, leg] of Object.entries(legs)) {
                const p = (phase + gait[name]) % 1;
                const swing = Math.cos(p * TAU) * (run ? 0.7 : 0.4) * moving;
                const lift = Math.max(0, -Math.sin(p * TAU)) * moving * (run ? 1.3 : 1);
                const [h, k, a] = leg.rest;

                leg.hip.rotation.set(h - swing, 0, lowSlung ? leg.side * 1.15 : 0);

                if (leg.front > 0) {
                    leg.knee.rotation.x = k - lift * 0.35;
                    leg.ankle.rotation.x = a + lift * 1.5;
                } else {
                    leg.knee.rotation.x = k + lift * 0.45;
                    leg.ankle.rotation.x = a - lift * 0.8;
                }

                const down = Math.sin(p * TAU) > 0;

                if (down && !planted[name] && moving > 0.3) {
                    onStep?.(name, speed);
                }

                planted[name] = down;
            }

            // The body: bobbing with its stride, rocking at a gallop, breathing when it stands
            const bob = Math.abs(Math.sin(phase * TAU * 2)) * girth * (run ? 0.16 : 0.06) * moving;
            const breathe = 1 + Math.sin(t * 2.2) * 0.018 * (1 - moving);

            body.position.set(0, bodyY + bob, 0);
            body.rotation.set(run ? Math.sin(phase * TAU) * 0.07 * moving : 0, 0, 0);
            torso.scale.set(breathe, breathe, 1);

            // The head: bobbing as it goes, looking about as it stands; the tail swaying
            neck.rotation.set(rest.neck + Math.sin(phase * TAU * 2) * 0.05 * moving, Math.sin(t * 0.37) * 0.35 * (1 - moving), 0);
            head.rotation.set(rest.head, Math.sin(t * 0.61) * 0.15 * (1 - moving), 0);
            jaw.rotation.x = 0.03 + Math.max(0, Math.sin(t * 0.9)) * 0.05 * (1 - moving) + (run ? 0.25 : 0) * moving;
            tailParts.forEach((each, k) => {
                each.rotation.set(rest.tail[k], Math.sin(t * 2.4 + phase * TAU - k * 0.6) * (0.2 + k * 0.08), 0);
            });
            quills.scale.setScalar(1);

            // Resting, weighted in and out
            if (resting && RESTS[resting.name] && !dead) {
                RESTS[resting.name](resting.w, resting.t);
            }

            // Attacking, its way
            if (attack) {
                const { u, hit } = attack;
                const before = Math.min(1, u / hit);
                const after = u > hit ? Math.min(1, (u - hit) / (1 - hit)) : 0;
                const out = u < hit ? smooth(before) : 1 - smooth(after);

                (ATTACKS[attack.style] ?? ATTACKS.bite)({ u, hit, before, after, out });
            }

            // The wings: folded along the back, opening to beat when it runs or strikes
            open += ((attack || run ? 1 : 0) - open) * Math.min(1, dt * 3);

            for (const wing of wings) {
                const beat = Math.sin(t * 6 + (attack ? attack.u * 4 : 0));

                wing.root.rotation.set(0, wing.side * (0.95 * (1 - open) + 0.15 * open), wing.side * (0.55 * (1 - open) + (0.35 + beat * 0.7) * open));
                wing.tip.rotation.set(0, wing.side * 1.2 * (1 - open), -wing.side * (2.3 * (1 - open) + (0.15 + Math.sin(t * 6 - 0.7) * 0.35) * open));
            }

            // Struck: flinching away, head up
            if (react) {
                const jolt = Math.sin(react.u * Math.PI);

                body.position.z -= length * 0.1 * jolt;
                neck.rotation.x -= 0.3 * jolt;
                jaw.rotation.x = 0.45 * jolt;
            }

            // Dead: fallen on its side, legs out stiff
            if (dead) {
                const fall = smooth(Math.min(1, dead.u));

                body.rotation.z = dead.side * (Math.PI / 2) * fall;
                body.position.y = bodyY - (bodyY - width * 0.95) * fall;

                for (const leg of Object.values(legs)) {
                    leg.hip.rotation.x = leg.rest[0] * (1 - fall) + leg.front * 0.35 * fall;
                    leg.knee.rotation.x = leg.rest[1] * (1 - fall * 0.7);
                    leg.ankle.rotation.x = leg.rest[2] * (1 - fall * 0.7);
                }

                neck.rotation.x = rest.neck + 0.3 * fall;
                jaw.rotation.x = 0.35 * fall;

                for (const wing of wings) {
                    wing.root.rotation.set(0, wing.side * 0.3, wing.side * (wing.side === dead.side ? -0.2 : 0.9) * fall);
                    wing.tip.rotation.set(0, 0, -wing.side * 0.4 * fall);
                }
            }
        },
    };
}
