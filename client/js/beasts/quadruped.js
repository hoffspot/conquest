// A four-legged creature, built from a look (beasts/looks.js) and sculpted in one piece
// (sculpt.js): a deep chest, a tucked-up waist and a haunch (sloping down behind, a hyena's); a
// neck flowing into a head with its face: a muzzle and a jaw that opens on its teeth (or a cat's
// short face of whisker pads over a small chin, or a crocodile's long flat jaws lined with teeth,
// its eyes and nostrils raised on top), eyes (slit, some; under heavy brows, some), ears of their
// kind. Legs as an animal's are: a dog's up on its toes (upper arm, forearm and pastern in front;
// thigh, shin and the long bone from the hock behind); a bear's pillars in front and flat-footed
// behind, with long claws; a crocodile's sprawling out to the sides to splayed, clawed toes; a
// dragon's with great hooked talons; hooves. A tail: a dog's brush of fur, slim at its root, full
// and drawn to a point; a cat's long hanging curve; a crocodile's deep flat one with its double
// ridge of scutes; a spade or a sting at a dragon's or wyvern's tip. What makes each kind itself
// is added: a mane, a crest, tusks, horns, a frill of spikes, quills, armour plates, a bear's hump,
// spots and stripes, bands across the belly, and wings (as a bat's: below).
//
// It moves itself (pose): walking in a trot, running in a gallop (each leg swinging and folding
// as it comes through, each footfall told; a crocodile's swung round forward and back, its body
// and tail swaying), breathing and looking about when it stands, and resting its ways; lunging
// and snapping (or rearing and mauling, goring, bristling, stinging, breathing fire) to attack,
// flinching when struck, and falling on its side when it dies. A wyvern or a dragon folds its
// wings along its flanks, and opens them to beat when it runs or strikes; and it flies: its legs
// tucked up under it, its neck stretched out ahead and its tail streaming behind, its wings spread
// wide, beating or held out to glide.

import * as THREE from "three";
import { Sculpt } from "./sculpt.js";
import { aim, cone, CONE_WAY, ellipsoid, joint, limb, membrane, part, shade, skin } from "./shapes.js";

const TAU = Math.PI * 2;

// Where each leg's in its stride (0 to 1) at a trot and a gallop: diagonal pairs together at a
// trot; front then hind at a gallop
const TROT = { lf: 0, rh: 0, rf: 0.5, lh: 0.5 };
const GALLOP = { lf: 0, rf: 0.12, lh: 0.5, rh: 0.62 };

// Each leg's three bones (upper, lower, and the pastern or the bone below the hock): how long, as
// shares of the leg, and how they're angled at rest (radians, + back at the bottom)
const FRONT = { lengths: [0.4, 0.42, 0.18], angles: [0.3, -0.35, 0.2] };
const HIND = { lengths: [0.36, 0.38, 0.26], angles: [-0.5, 1, -0.55] };

// A bear's: straight pillars in front; behind, a short shin and a long flat foot on the ground
const PILLAR = { lengths: [0.44, 0.44, 0.12], angles: [0.12, -0.18, 0.08] };
const PLANTIGRADE = { lengths: [0.46, 0.42, 0.12], angles: [-0.25, 0.45, -0.2] };

// A sprawling leg's (a crocodile's): the upper bone out sideways, drooping a little (radians),
// the lower one down, and the foot
const SPRAWL = { lengths: [0.45, 0.45, 0.1], angles: [0, 0, 0] };
const SPRAWL_DROOP = 0.3;

// A wing's bones (shares of its reach): the upper arm, the forearm, and three fingers, each with
// how far it sweeps back from straight out (radians) when the wing's open
const WING = { upper: 0.22, fore: 0.3, fingers: [[0.56, 0.05], [0.52, 0.55], [0.46, 1.15]] };

// How far each of a wing's joints turns folded and open (radians, for its right side: its left's
// mirrored), and how far it beats (up and down, lagging towards the tip). Folded, the shoulder
// rolls the wing on edge and swings it back, the arm along the top of the flank and the skin
// hanging down over it; the forearm doubles back along the upper arm and the fingers along that.
// (The shoulder turns about its own x first, then y, then the body's z: "ZYX".)
const FOLDED = { shoulder: [-1.45, 1.45, 0.3], elbow: [0, -2.9, 0], wrist: [0, 2.9, 0], spread: 0.2 };
const SPREAD = { shoulder: [0, 0.4, 0.2], elbow: [0, -0.75, 0], wrist: [0, 0.2, 0], spread: 1 };
const BEAT = { shoulder: 0.75, elbow: 0.3, wrist: 0.28, finger: 0.14, lag: 0.7 };

const UP = CONE_WAY;

const smooth = (u) => u * u * (3 - 2 * u);
const taperOf = (snout) => snout.taper ?? 0.7;


// A point on an ellipsoid's surface (radii r, centred at c), the way `towards` points, sunk in a
// little (a share of the way out)
function onSurface([rx, ry, rz], [cx, cy, cz], [ux, uy, uz], sink = 0.9) {
    const reach = sink / Math.hypot(ux / rx, uy / ry, uz / rz);

    return [cx + ux * reach, cy + uy * reach, cz + uz * reach];
}

// A wing put in its pose: `open` (0 folded along the flank, 1 spread), and beating (`beat`: up
// and down, -1 to 1, by `phase` radians through the stroke)
function spreadWing(wing, open, beat, phase) {
    const side = wing.side;
    const turn = (bone, key, flap) => {
        const [x, y, z] = FOLDED[key].map((folded, axis) => folded + (SPREAD[key][axis] - folded) * open);

        bone.rotation.set(x, side * y, side * (z + flap));
    };

    turn(wing.shoulder, "shoulder", beat * BEAT.shoulder * Math.sin(phase));
    turn(wing.elbow, "elbow", beat * BEAT.elbow * Math.sin(phase - BEAT.lag));
    turn(wing.wrist, "wrist", beat * BEAT.wrist * Math.sin(phase - BEAT.lag * 2));

    const spread = FOLDED.spread + (SPREAD.spread - FOLDED.spread) * open;

    for (const finger of wing.fingers) {
        finger.base.rotation.set(0, side * finger.sweep * spread, 0);
        finger.mid.rotation.set(0, side * 0.12 * spread, side * beat * BEAT.finger * Math.sin(phase - BEAT.lag * 3));
    }
}

// A wing's skin: panels between its fingers, and between its last finger and the flank, each a
// grid of points bound to the bones either side of it (so it stretches as they spread and gathers
// as they fold), the trailing edge drawn in between the tips; lighter across its middle, where
// it's thinnest. Made in the pose the body's skin was bound in (spread), and bound as it is.
function webWing(wing, body, material) {
    const bones = body.skeleton.bones;
    const inverse = body.parent.matrixWorld.clone().invert();
    const at = (bone, local = [0, 0, 0]) => new THREE.Vector3(...local).applyMatrix4(bone.matrixWorld).applyMatrix4(inverse);
    const torso = wing.shoulder.parent;
    const ROWS = 6;
    const COLUMNS = 4;

    // Each rib, from its root to its tip: a point, and the bones it goes with ([bone, weight]...)
    const finger = ({ base, mid, end }) => (u) => {
        const [from, to, bone, t] = u < 0.5 ? [base, mid, base, u / 0.5] : [mid, end, mid, (u - 0.5) / 0.5];

        return { point: at(from).lerp(at(to), t), bones: [[bone, 1]] };
    };
    const flank = (u) => ({ point: at(wing.elbow).lerp(at(torso, wing.flank), u), bones: [[wing.elbow, 1 - u], [torso, u]] });
    const ribs = [...wing.fingers.map(finger), flank];
    const positions = [];
    const colours = [];
    const skinIndex = [];
    const skinWeight = [];
    const index = [];
    const base = new THREE.Color(material.color);
    const add = (point, weights, light) => {
        const merged = new Map();

        for (const [bone, weight] of weights) {
            merged.set(bone, (merged.get(bone) ?? 0) + weight);
        }

        const list = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 4);

        while (list.length < 4) {
            list.push([null, 0]);
        }

        positions.push(point.x, point.y, point.z);
        colours.push(base.r * light, base.g * light, base.b * light);
        skinIndex.push(...list.map(([bone]) => Math.max(0, bones.indexOf(bone))));
        skinWeight.push(...list.map(([, weight]) => weight));

        return positions.length / 3 - 1;
    };

    for (let n = 0; n < ribs.length - 1; n++) {
        const [a, b] = [ribs[n], ribs[n + 1]];
        const grid = [];

        for (let row = 0; row <= ROWS; row++) {
            const u = row / ROWS;
            const [p, q] = [a(u), b(u)];
            const line = [];

            for (let column = 0; column <= COLUMNS; column++) {
                const v = column / COLUMNS;
                const point = p.point.clone().lerp(q.point, v);

                // (The trailing edge drawn in between the tips, towards the wrist)
                if (row === ROWS) {
                    const root = a(0).point.clone().lerp(b(0).point, v);

                    point.lerp(root, 0.22 * Math.sin(v * Math.PI));
                }

                const weights = [...p.bones.map(([bone, w]) => [bone, w * (1 - v)]), ...q.bones.map(([bone, w]) => [bone, w * v])];

                line.push(add(point, weights, 0.85 + 0.35 * Math.sin(v * Math.PI) * (0.4 + u * 0.6)));
            }

            grid.push(line);
        }

        for (let row = 0; row < ROWS; row++) {
            for (let column = 0; column < COLUMNS; column++) {
                const [p, q, r, s] = [grid[row][column], grid[row][column + 1], grid[row + 1][column], grid[row + 1][column + 1]];

                index.push(p, r, q, q, r, s);
            }
        }
    }

    // (And between the upper arm and the flank, near the body)
    const shoulder = add(at(wing.shoulder), [[wing.shoulder, 1]], 0.85);
    const elbow = add(at(wing.elbow), [[wing.elbow, 1]], 0.85);
    const flankAt = add(at(torso, wing.flank), [[torso, 1]], 0.85);

    index.push(shoulder, elbow, flankAt);

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    material.vertexColors = true;
    material.color.set(0xffffff);

    const web = new THREE.SkinnedMesh(geometry, material);

    web.castShadow = true;
    web.frustumCulled = false;
    web.userData.alive = true;
    body.parent.add(web);
    web.bind(body.skeleton, body.bindMatrix);

    return web;
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
    const bodyY = lowSlung ? girth * (look.clearance ?? 1.25) : height - girth;

    const object = new THREE.Group();
    const body = joint(object, "body", [0, bodyY, 0]);
    const torso = joint(body, "torso");

    // The body: a deep chest with the withers above it, a tucked-up waist, a haunch and rump (lower
    // than the shoulders in a hyena, sloping down to its short hind legs)
    const chest = look.chest ?? 1.1;
    const haunch = look.haunch ?? 0.95;
    const drop = (1 - (look.slope ?? 1)) * bodyY;

    sculpt.add(torso, { ellipsoid: [width * chest, girth * 1.02 * chest, length * 0.3] }, fur, { at: [0, -girth * 0.06, length * 0.2] });
    sculpt.add(torso, { ellipsoid: [width * 0.78, girth * 0.55, length * 0.22] }, fur, { at: [0, girth * 0.42, length * 0.22] });
    sculpt.add(torso, { ellipsoid: [width * 0.8, girth * (lowSlung ? 0.95 : 0.74), length * 0.3] }, fur, { at: [0, girth * (lowSlung ? 0 : 0.14) - drop * 0.4, -length * 0.04] });
    sculpt.add(torso, { ellipsoid: [width * 0.9 * haunch, girth * 0.84 * haunch, length * 0.24] }, fur, { at: [0, girth * 0.1 - drop * 0.85, -length * 0.28] });
    sculpt.add(torso, { ellipsoid: [width * 0.7 * haunch, girth * 0.62 * haunch, length * 0.15] }, fur, { at: [0, girth * 0.22 - drop, -length * 0.42] });

    // (Its underside paler; a darker saddle; its markings)
    sculpt.paint(torso, [width * 0.85, girth * 0.55, length * 0.46], belly, { at: [0, -girth * 0.78, length * 0.02], soft: girth * 0.5 });

    if (colours.saddle) {
        sculpt.paint(torso, [width * 0.7, girth * 0.4, length * 0.36], colours.saddle, { at: [0, girth * 0.75, -length * 0.05], soft: girth * 0.45, strength: 0.8 });
    }

    // (A bear's hump of muscle over its shoulders)
    if (look.hump) {
        sculpt.add(torso, { ellipsoid: [width * 0.85, girth * 0.62, length * 0.2] }, colours.saddle ?? fur, { at: [0, girth * 0.72, length * 0.24] });
    }

    // (Bands across the belly: a dragon's)
    for (let k = 0; look.bellyBands && k < 9; k++) {
        sculpt.paint(torso, [width * 0.9, girth * 0.4, length * 0.018], shade(colours.belly ?? colours.fur, -0.35).getHex(), { at: [0, -girth * 0.85, length * (0.38 - k * 0.09)], soft: length * 0.01, strength: 0.7 });
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

        const sink = drop * Math.min(1, Math.max(0, (length * 0.1 - along) / (length * 0.5)));

        part(torso, cone(girth * (0.3 - k * 0.012), width * 0.1, 4), crest, { at: [0, girth * (0.86 - Math.abs(k - 3) * 0.012) - sink, along], turn: [-0.5, 0, 0], shadow: false });
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

    // The face: a muzzle with its nose (a cat's short one of whisker pads over a small chin); a
    // jaw beneath, a piece of its own that opens, with the dark of the mouth inside; teeth
    const r = snout.radius;
    const wide = snout.flat ?? 1;
    const face = look.face ?? "snout";
    const muzzleAt = [0, -hy * (face === "cat" ? 0.22 : 0.12), hz * (face === "cat" ? 0.7 : 0.85)];
    const tip = snout.length * 0.95;
    let jaw;

    if (face === "cat") {
        for (const side of [-1, 1]) {
            sculpt.add(head, { ellipsoid: [r * 0.62, r * 0.55, r * 0.6] }, colours.mask ?? fur, { at: [side * r * 0.42, muzzleAt[1], muzzleAt[2] + r * 0.45], blend: r * 0.35 });
        }

        part(head, cone(r * 0.32, r * 0.28, 3), hard, { at: [0, muzzleAt[1] + r * 0.42, muzzleAt[2] + r * 0.95], turn: [Math.PI * 0.62, 0, 0] });
        part(head, ellipsoid(r * 0.5, r * 0.25, r * 0.45, 10), mouth, { at: [0, muzzleAt[1] - r * 0.45, muzzleAt[2] + r * 0.4], shadow: false });
        jaw = joint(head, "jaw", [0, muzzleAt[1] - r * 0.45, muzzleAt[2] - r * 0.1]);
        sculpt.add(jaw, { ellipsoid: [r * 0.55, r * 0.3, r * 0.65] }, colours.mask ?? belly, { at: [0, -r * 0.05, r * 0.55], blend: r * 0.2, group: 1 });

        const whisker = skin(colours.whiskers ?? 0xe8e4dc, { roughness: 0.4, clear });

        for (const side of [-1, 1]) {
            for (let k = 0; k < 4; k++) {
                part(head, cone(r * 2.1, r * 0.018, 3), whisker, { at: [side * r * 0.7, muzzleAt[1] + r * (0.05 - k * 0.1), muzzleAt[2] + r * 0.62], turn: aim([side, 0.12 - k * 0.14, 0.35 - k * 0.08], UP), shadow: false });
            }

            sculpt.paint(head, [r * 0.3, r * 0.35, r * 0.3], dark, { at: [side * r * 0.72, muzzleAt[1] + r * 0.1, muzzleAt[2] + r * 0.55], soft: r * 0.15, strength: look.muzzleMarks ? 0.8 : 0 });
            part(head, cone(r * 0.42, r * 0.09, 5), ivory, { at: [side * r * 0.3, muzzleAt[1] - r * 0.4, muzzleAt[2] + r * 0.85], turn: [Math.PI, 0, 0], shadow: false });
            part(jaw, cone(r * 0.3, r * 0.08, 5), ivory, { at: [side * r * 0.25, r * 0.15, r * 0.95], shadow: false });
        }
    } else {
        sculpt.add(head, { limb: [snout.length, r, r * (snout.taper ?? 0.7)] }, colours.mask ?? fur, { at: muzzleAt, turn: [-Math.PI / 2, 0, 0], scale: snout.flat ? [wide, 1, 1] : null, blend: hy * 0.35 });
        // (A nose; a reptile's two nostrils on a knob at the snout's tip)
        if (scaly) {
            const knob = [0, muzzleAt[1] + r * taperOf(snout) * 0.55, muzzleAt[2] + snout.length + r * taperOf(snout) * 0.3];

            sculpt.add(head, { ellipsoid: [r * taperOf(snout) * wide * 0.55, r * 0.3, r * 0.4] }, colours.mask ?? fur, { at: knob, blend: r * 0.25 });

            for (const side of [-1, 1]) {
                part(head, ellipsoid(r * 0.12, r * 0.07, r * 0.16, 6), mouth, { at: [side * r * 0.2 * wide, knob[1] + r * 0.2, knob[2] + r * 0.1], turn: [0, side * 0.5, 0], shadow: false });
            }
        } else {
            part(head, ellipsoid(r * 0.62 * wide * (snout.nose ?? 1), r * 0.5 * (snout.nose ?? 1), r * 0.45, 10), hard, { at: [0, muzzleAt[1] + r * 0.2, muzzleAt[2] + snout.length + r * 0.45] });
        }
        part(head, ellipsoid(r * 0.6 * wide, r * 0.35, tip * 0.5, 10), mouth, { at: [0, muzzleAt[1] - r * 0.55, muzzleAt[2] + tip * 0.45], shadow: false });
        jaw = joint(head, "jaw", [0, muzzleAt[1] - r * 0.62, muzzleAt[2] - r * 0.2]);
        sculpt.add(jaw, { limb: [tip, r * 0.62, r * 0.42] }, colours.mask ?? belly, { turn: [-Math.PI / 2, 0, 0], scale: snout.flat ? [wide, 1, 1] : null, blend: r * 0.3, group: 1 });

        // (Rows of teeth all along the jaws, top and bottom between them: a crocodile's, a
        // dragon's; or a canine's fangs)
        if (look.teeth) {
            const taper = snout.taper ?? 0.7;

            for (let k = 0; k < look.teeth; k++) {
                const u = (k + 0.5) / look.teeth;
                const radius = r * (1 + (taper - 1) * u) * wide;
                const long = r * (0.32 + (k % 4 === 1 ? 0.25 : 0) + (u < 0.2 ? 0.2 : 0));

                for (const side of [-1, 1]) {
                    part(head, cone(long, r * 0.07, 4), ivory, { at: [side * radius * 0.82, muzzleAt[1] - r * 0.62, muzzleAt[2] + snout.length * u], turn: [Math.PI, 0, side * 0.12], shadow: false });
                    part(jaw, cone(long * 0.85, r * 0.065, 4), ivory, { at: [side * radius * 0.7, r * 0.28, tip * (u + 0.5 / look.teeth)], turn: [0, 0, -side * 0.12], shadow: false });
                }
            }
        } else if (look.fangs ?? !look.hooves) {
            for (const side of [-1, 1]) {
                part(jaw, cone(r * 0.55, r * 0.12, 5), ivory, { at: [side * r * 0.4 * wide, r * 0.25, tip * 0.92], shadow: false });
                part(head, cone(r * 0.6, r * 0.13, 5), ivory, { at: [side * r * 0.45 * wide, muzzleAt[1] - r * 0.45, muzzleAt[2] + tip * 0.85], turn: [Math.PI, 0, 0], shadow: false });
            }
        }
    }

    // Eyes set in the skull (forward, a cat's; on top, raised, a crocodile's), slit if they are;
    // brows over them; ears on top; tusks and horns
    const pupil = skin(0x050404, { roughness: 0.1 });
    const eyeWay = face === "cat" ? [0.42, 0.3, 0.86] : face === "croc" ? [0.45, 0.85, 0.35] : [0.55, 0.38, 0.75];
    const eyeSize = hx * (face === "cat" ? 0.23 : 0.19) * (look.eyeSize ?? 1);

    for (const side of [-1, 1]) {
        const at = onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * eyeWay[0], eyeWay[1], eyeWay[2]], 1.02);

        if (face === "croc") {
            sculpt.add(head, { ellipsoid: [eyeSize * 1.4, eyeSize * 1.1, eyeSize * 1.4] }, fur, { at, blend: eyeSize });
        }

        part(head, ellipsoid(eyeSize, eyeSize * 0.85, eyeSize * 0.75, 10), eyes, { at: face === "croc" ? [at[0], at[1] + eyeSize * 0.5, at[2]] : at, turn: [0, side * (face === "cat" ? 0.3 : 0.5), 0] });

        if (look.slit) {
            part(head, ellipsoid(eyeSize * 0.18, eyeSize * 0.7, eyeSize * 0.2, 6), pupil, { at: [at[0] + side * eyeSize * 0.3 * (face === "cat" ? 0.4 : 1), at[1] + (face === "croc" ? eyeSize * 0.5 : 0), at[2] + eyeSize * 0.62], turn: [0, side * 0.4, 0], shadow: false });
        }

        if (look.brows) {
            // (Heavy, and low over the eye towards the snout: a scowl)
            sculpt.add(head, { ellipsoid: [eyeSize * 2.1, eyeSize * 0.75, eyeSize * 1.5] }, fur, { at: [at[0] * 0.92, at[1] + eyeSize * 0.75, at[2] + eyeSize * 0.1], turn: [0.35, side * 0.35, side * 0.45], blend: eyeSize * 0.5 });
        }

        if (look.ears && look.ears !== "none") {
            const ears = {
                round: ellipsoid(hx * 0.32, hx * 0.3, hx * 0.1, 10),
                big: ellipsoid(hx * 0.4, hx * 0.5, hx * 0.1, 12),
                cat: cone(hy * 0.62, hx * 0.3, 4),
                small: cone(hy * 0.55, hx * 0.3, 6),
                pointed: cone(hy * 1.15, hx * 0.3, 6),
            };
            const place = look.ears === "cat" ? [side * 0.62, 0.75, -0.05] : look.ears === "big" ? [side * 0.5, 0.9, -0.2] : [side * 0.5, 0.85, -0.1];

            part(head, ears[look.ears] ?? ears.pointed, earSkin, { at: onSurface([hx, hy, hz], [0, 0, hz * 0.3], place, 0.97), turn: [-0.25, side * 0.3, -side * (look.ears === "big" ? 0.15 : 0.35)], scale: look.ears === "cat" ? [1, 1, 0.45] : null });
        }

        // (A frill of spikes sweeping back from the cheeks and skull: a dragon's)
        for (let k = 0; look.frill && k < look.frill; k++) {
            const u = k / Math.max(1, look.frill - 1);
            const where = onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * 0.8, -0.45 + u * 0.9, -0.55 - u * 0.2], 0.92);

            part(head, cone(hx * (0.55 - Math.abs(u - 0.4) * 0.4), hx * 0.09, 4), hard, { at: where, turn: aim([side * 0.55, -0.1 + u * 0.35, -1], UP), shadow: false });
        }

        if (look.tusks) {
            part(head, cone(look.tusks, r * 0.3, 6), ivory, { at: [side * r * 0.85 * wide, muzzleAt[1] - r * 0.3, muzzleAt[2] + snout.length * 0.6], turn: [0.35, 0, side * 0.55] });
        }

        if (look.horns) {
            const horn = joint(head, `horn-${side}`, onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * 0.45, 0.8, -0.3], 0.85));

            horn.rotation.set(-1.15, 0, -side * 0.4);

            // (Curving back as it goes: a few pieces, each turned a little more)
            let from = horn;

            for (let k = 0; k < 3; k++) {
                const long = look.horns / 3;

                part(from, limb(long, hx * 0.17 * (1 - k * 0.3), hx * 0.17 * (1 - (k + 1) * 0.3), 7), ivory, { turn: [Math.PI, 0, 0] });
                from = joint(from, `horn-${side}-${k}`, [0, long, 0]);
                from.rotation.x = -0.28;
            }

            part(from, cone(look.horns * 0.2, hx * 0.05, 6), ivory);

            if (look.horned) {
                part(head, cone(look.horns * 0.4, hx * 0.1, 6), ivory, { at: onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * 0.7, 0.45, -0.45], 0.9), turn: aim([side * 0.35, 0.25, -1], UP) });
                part(head, cone(look.horns * 0.25, hx * 0.07, 5), ivory, { at: onSurface([hx, hy, hz], [0, 0, hz * 0.3], [side * 0.25, 0.95, -0.1], 0.9), turn: aim([side * 0.2, 0.6, -1], UP) });
            }
        }
    }

    // Four legs: each three bones and a paw or hoof, the upper one's muscle melting into the body.
    // A bear's are pillars, flat-footed behind (plantigrade); a crocodile's sprawl, the upper leg
    // out sideways and the lower one down to a splayed, long-toed foot
    const legs = {};
    const plantigrade = Boolean(look.plantigrade);
    const crouch = look.crouch ?? 1;
    const toeSkin = skin(colours.fur, { roughness: 0.7, clear, flat: scaly });
    const clawSkin = colours.claws ? skin(colours.claws, { roughness: 0.4, clear }) : hard;

    for (const [name, front, side] of [["lf", 1, -1], ["rf", 1, 1], ["lh", -1, -1], ["rh", -1, 1]]) {
        const spec = lowSlung ? SPRAWL : plantigrade ? (front > 0 ? PILLAR : PLANTIGRADE) : front > 0 ? FRONT : HIND;
        const topY = (front > 0 ? -girth * 0.1 : girth * 0.05 - drop) - (lowSlung ? girth * 0.25 : 0);
        const reach = bodyY + topY;
        const span = lowSlung ? Math.sin(SPRAWL_DROOP) * spec.lengths[0] + spec.lengths[1] * Math.cos((Math.PI / 2 - SPRAWL_DROOP) * 0.08) + spec.lengths[2] : spec.lengths.reduce((sum, share, k) => sum + share * Math.cos(spec.angles.slice(0, k + 1).reduce((a, b) => a + b, 0) * crouch), 0);
        const legThick = thick * (lowSlung && front < 0 ? 1.2 : 1);
        const [upper, lower, cannon] = spec.lengths.map((share) => (share * reach) / span);
        const hip = joint(body, `hip-${name}`, [side * width * (lowSlung ? 0.72 : 0.55), topY, front * length * (front > 0 ? 0.26 : 0.3)]);
        const muscle = front > 0 ? [legThick * 1.5, upper * 0.55, legThick * 1.9] : [legThick * 1.75, upper * 0.62, legThick * 2.3];

        sculpt.add(hip, { ellipsoid: lowSlung ? [legThick * 1.3, upper * 0.5, legThick * 1.6] : muscle }, fur, { at: [0, -upper * 0.25, front > 0 ? 0 : legThick * 0.2] });
        sculpt.add(hip, { limb: [upper, legThick * (front > 0 ? 1.2 : 1.35), legThick * 0.9] }, fur, { blend: legThick * 0.8 });

        const knee = joint(hip, `knee-${name}`, [0, -upper, 0]);

        sculpt.add(knee, { limb: [lower, legThick * 0.88, legThick * (plantigrade ? 0.8 : 0.6)] }, fur, { blend: legThick * 0.6 });

        const ankle = joint(knee, `ankle-${name}`, [0, -lower, 0]);

        sculpt.add(ankle, { limb: [cannon, legThick * (plantigrade ? 0.78 : 0.58), legThick * (plantigrade ? 0.72 : 0.52)] }, fur, { blend: legThick * 0.4 });

        const foot = joint(ankle, `foot-${name}`, [0, -cannon, 0]);

        if (look.hooves) {
            part(foot, limb(legThick * 0.75, legThick * 0.55, legThick * 0.72, 8), hard, { at: [0, legThick * 0.55, legThick * 0.08] });
        } else if (lowSlung || look.talons) {
            // (A reptile's foot: a flat sole, and long toes spread out on the ground, clawed; a
            // dragon's, three great toes forward and one behind, each with a hooked talon)
            const talons = Boolean(look.talons);

            sculpt.add(foot, { ellipsoid: [legThick * 0.9, legThick * 0.35, legThick * 1.0] }, fur, { at: [0, legThick * 0.3, legThick * 0.3], blend: legThick * 0.4 });

            const toes = talons ? 4 : front > 0 ? 5 : 4;

            for (let k = 0; k < toes; k++) {
                const behind = talons && k === toes - 1;
                const fan = behind ? Math.PI - side * 0.5 : (k / ((talons ? toes - 1 : toes) - 1) - 0.5) * (talons ? 0.9 : front > 0 ? 1.5 : 1.1) + side * 0.2;
                const long = legThick * (behind ? 0.6 : talons ? 1.2 : front > 0 ? 1.1 : 1.5) * (1 - Math.abs(k / (toes - 1) - 0.55) * (talons ? 0.2 : 0.5));
                const way = [Math.sin(fan), -0.1, Math.cos(fan)];
                const root = [way[0] * legThick * 0.6, legThick * 0.2, legThick * 0.3 + way[2] * legThick * 0.6];
                const claw = legThick * 0.3 * (look.claws ?? 1);
                const tip = [root[0] + way[0] * long, legThick * 0.12, root[2] + way[2] * long];

                part(foot, limb(long, legThick * (talons ? 0.3 : 0.2), legThick * (talons ? 0.2 : 0.12), 5), toeSkin, { at: root, turn: aim(way), shadow: false });

                // (A talon hooks down: two pieces, the second turned further)
                part(foot, cone(claw * 0.6, legThick * (talons ? 0.14 : 0.08), 5), clawSkin, { at: tip, turn: aim([way[0], 0.1, way[2]], UP), shadow: false });
                part(foot, cone(claw * 0.55, legThick * (talons ? 0.1 : 0.06), 5), clawSkin, { at: [tip[0] + way[0] * claw * 0.5, tip[1] - claw * 0.02, tip[2] + way[2] * claw * 0.5], turn: aim([way[0] * 0.6, -0.8, way[2] * 0.6], UP), shadow: false });
            }
        } else {
            // (A paw: a pad, darker beneath, and claws; a bear's broad, with long curved claws)
            const broad = plantigrade ? 1.25 : 1;

            sculpt.add(foot, { ellipsoid: [legThick * 0.78 * broad, legThick * 0.48, legThick * 1.1 * broad] }, fur, { at: [0, legThick * 0.4, legThick * (plantigrade ? 0.55 : 0.4)], blend: legThick * 0.4 });
            sculpt.paint(foot, [legThick * 0.9 * broad, legThick * 0.3, legThick * 1.2 * broad], dark, { at: [0, legThick * 0.08, legThick * 0.4], soft: legThick * 0.25, strength: 0.6 });

            for (const toe of plantigrade ? [-2, -1, 0, 1, 2] : [-1, 0, 1]) {
                const claw = (plantigrade ? (front > 0 ? 0.75 : 0.5) : 0.35) * (look.claws ?? 1);
                const out = plantigrade ? toe * 0.24 : toe * 0.35;

                part(foot, cone(legThick * claw, legThick * (plantigrade ? 0.09 : 0.1), 4), hard, { at: [out * legThick * broad, legThick * 0.2, legThick * (plantigrade ? 1.45 - Math.abs(toe) * 0.12 : 1.35)], turn: [Math.PI / 2 + (plantigrade ? 0.9 : 0.5), 0, -toe * 0.08], shadow: false });
            }
        }

        const rest = lowSlung ? [0, 0, 0] : spec.angles.map((angle) => angle * crouch);

        hip.rotation.set(rest[0], 0, lowSlung ? side * (Math.PI / 2 - SPRAWL_DROOP) : 0);
        knee.rotation.set(rest[1], 0, lowSlung ? -side * (Math.PI / 2 - SPRAWL_DROOP) * 0.92 : 0);
        ankle.rotation.set(rest[2], 0, 0);
        legs[name] = { hip, knee, ankle, foot, front, side, rest: [hip.rotation.x, knee.rotation.x, ankle.rotation.x], restZ: [hip.rotation.z, knee.rotation.z] };
    }

    // The tail: bones hanging back from the rump, tapering to its tip. A dog's is a brush of fur,
    // slim at its root, full along its length and drawn to a point; a crocodile's deep and flat
    // from side to side, a double ridge of scutes along its top; a dragon's ends in a spade
    const tailParts = [];
    const tail = look.tail ?? { length: length * 0.5, radius: width * 0.18 };
    const segments = tail.segments ?? (tail.bushy ? 6 : tail.length > length ? 7 : 5);
    const segment = tail.length / segments;
    const across = tail.bushy
        ? (u) => 0.5 * (1 - u) + 1.05 * Math.sin(Math.PI * Math.pow(u, 0.72)) * (1 - 0.15 * u) + 0.05
        : (u) => 1 - u * (tail.taper ?? 0.8);
    let from = joint(torso, "tail", [0, girth * (tail.bushy ? 0.5 : 0.4) - drop, -length * 0.46]);

    from.rotation.x = tail.lift ?? -0.6;

    for (let k = 0; k < segments; k++) {
        const r0 = tail.radius * across(k / segments);
        const r1 = tail.radius * across((k + 1) / segments);
        const tipped = look.tipColour && k >= segments - (tail.bushy ? 2 : 1);
        const tint = tipped ? look.tipColour : colours.tail ?? fur;

        sculpt.add(from, { limb: [segment, r0, r1] }, tint, { turn: [Math.PI / 2, 0, 0], scale: tail.flatten ?? null, blend: Math.max(r0, r1) * 0.7 });

        if (look.spines) {
            part(from, cone(r0 * 1.1, r0 * 0.45, 4), hard, { at: [0, r0 * 0.75, -segment * 0.5], turn: [-0.7, Math.PI / 4, 0] });
        }

        // (The scutes: two rows, meeting in one towards the tip)
        for (let n = 0; tail.ridge && n < 2; n++) {
            const u = (n + 0.5) / 2;
            const rows = k < segments * 0.55 ? [-1, 1] : [0];

            for (const row of rows) {
                part(from, cone(r0 * 0.55, r0 * 0.28, 4), hard, { at: [row * r0 * 0.4, r0 * (tail.flatten?.[2] ?? 1) * 0.85, -segment * u], turn: [-0.35, Math.PI / 4, row * 0.2], shadow: false });
            }
        }

        tailParts.push(from);
        from = joint(from, `tail-${k + 1}`, [0, 0, -segment]);
        from.rotation.x = tail.curl ?? 0.1;
    }

    if (tail.sting) {
        part(from, cone(tail.sting, tail.radius * 0.8, 6), ivory, { turn: [-Math.PI / 2, 0, 0] });
    }

    if (tail.spade) {
        const w = tail.spade * 0.45;

        part(from, membrane([[0, tail.spade * 0.1], [w, -tail.spade * 0.35], [w * 0.35, -tail.spade * 0.55], [0, -tail.spade], [-w * 0.35, -tail.spade * 0.55], [-w, -tail.spade * 0.35]]), skin(colours.wings ?? dark, { roughness: 0.7, side: THREE.DoubleSide, clear }), { shadow: false });
        part(from, membrane([[0, tail.spade * 0.1], [w * 0.2, -tail.spade * 0.4], [0, -tail.spade * 0.85], [-w * 0.2, -tail.spade * 0.4]]), hard, { turn: [0, 0, Math.PI / 2], shadow: false });
    }

    // Wings (a wyvern's, a dragon's), as a bat's: from each shoulder an arm (upper arm and
    // forearm) to a wrist with a hooked thumb, three long fingers fanning back from it, and skin
    // stretched between them and back to the flank, its trailing edge scalloped between their tips.
    // Every bone bends, so a wing folds up along the flank at rest and opens out to beat, its
    // skin stretching with it (bound to its bones, as the body's skin is: below)
    const wings = [];

    for (const side of look.wings ? [-1, 1] : []) {
        const span = look.wings.span;
        const thick = look.wings.bone ?? width * 0.12;
        const boneSkin = skin(colours.wingBones ?? shade(colours.wings ?? colours.fur, -0.2).getHex(), { roughness: 0.6, clear });
        const out = [0, 0, side * Math.PI / 2];
        const shoulder = joint(torso, `wing-${side}`, [side * width * 0.68, girth * 0.72, length * 0.2]);

        shoulder.rotation.order = "ZYX";

        sculpt.add(shoulder, { ellipsoid: [thick * 2.2, thick * 1.6, thick * 2.4] }, fur, { blend: thick * 1.5 });
        part(shoulder, limb(span * WING.upper, thick * 1.2, thick * 0.9, 7), boneSkin, { turn: out });

        const elbow = joint(shoulder, `wing-${side}-elbow`, [side * span * WING.upper, 0, 0]);

        part(elbow, ellipsoid(thick * 1.05, thick * 1.05, thick * 1.05, 8), boneSkin);
        part(elbow, limb(span * WING.fore, thick * 0.9, thick * 0.65, 7), boneSkin, { turn: out });

        const wrist = joint(elbow, `wing-${side}-wrist`, [side * span * WING.fore, 0, 0]);

        part(wrist, ellipsoid(thick * 0.85, thick * 0.8, thick * 0.9, 8), boneSkin);
        part(wrist, cone(span * 0.07, thick * 0.4, 5), hard, { at: [0, thick * 0.3, thick * 0.5], turn: aim([side * 0.2, 0.5, 1], UP) });

        const fingers = WING.fingers.map(([share, sweep], n) => {
            const long = span * share;
            const base = joint(wrist, `wing-${side}-finger-${n}`);
            const mid = joint(base, `wing-${side}-finger-${n}-mid`, [side * long * 0.5, 0, 0]);
            const end = joint(mid, `wing-${side}-finger-${n}-tip`, [side * long * 0.5, 0, 0]);

            part(base, limb(long * 0.5, thick * 0.55, thick * 0.4, 6), boneSkin, { turn: out });
            part(mid, limb(long * 0.5, thick * 0.4, thick * 0.12, 6), boneSkin, { turn: out });

            return { base, mid, end, sweep };
        });

        const wing = { shoulder, elbow, wrist, fingers, side, flank: [side * width * 0.5, girth * 0.35, -length * 0.22] };

        spreadWing(wing, 1, 0, 0);
        wings.push(wing);
    }

    // The skin over it all, bound to its bones
    const mesh = sculpt.build(object, material, key);

    for (const wing of wings) {
        webWing(wing, mesh, skin(colours.wings ?? shade(colours.fur, -0.3).getHex(), { roughness: 0.78, side: THREE.DoubleSide, clear }));
    }

    mesh.geometry.computeBoundingBox();

    const box = mesh.geometry.boundingBox;
    const rest = { neck: neck.rotation.x, head: head.rotation.x, tail: tailParts.map((each) => each.rotation.x) };
    const frontY = -girth * 0.1;
    const hindY = girth * 0.05 - drop;
    let phase = 0;
    let open = 0;
    let opened = 0;
    let wingPhase = 0;
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
        // (A sprawling leg, folding, lifts its elbow or knee out and up instead)
        if (lowSlung) {
            leg.hip.rotation.z += leg.side * Math.abs(k) * 0.3 * weight;

            return;
        }

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
         * `rest`: { name, w: how far into it, t: seconds }; flying, if it has wings, `fly`: {
         * amount: 0 on the ground to 1 aloft, beat: 0 gliding to 1 beating hard }), telling each
         * footfall (`onStep`).
         */
        pose({ dt, t, speed, run, attack, react, dead, rest: resting, onStep, fly = null }) {
            const stride = lowSlung ? length * 0.42 : bodyY * (run ? 3.4 : 2.3);
            const moving = Math.min(1, speed / 0.5);
            const gait = run && !lowSlung ? GALLOP : TROT;

            phase = (phase + (speed / stride) * dt) % 1;
            open = 0;

            // The legs: each swinging through its stride, folding as it comes forward (a sprawling
            // leg swung round forward and back, and lifted out to the side as it comes through)
            for (const [name, leg] of Object.entries(legs)) {
                const p = (phase + gait[name]) % 1;
                const swing = Math.cos(p * TAU) * (lowSlung ? 0.6 : run ? 0.7 : 0.4) * moving;
                const lift = Math.max(0, -Math.sin(p * TAU)) * moving * (run ? 1.3 : 1);
                const [h, k, a] = leg.rest;

                if (lowSlung) {
                    leg.hip.rotation.set(0, -leg.side * swing, leg.restZ[0] + leg.side * lift * 0.35);
                    leg.knee.rotation.set(0, 0, leg.restZ[1]);
                    leg.ankle.rotation.set(0, leg.side * swing * 0.8, 0);
                } else {
                    leg.hip.rotation.set(h - swing, 0, 0);

                    if (leg.front > 0) {
                        leg.knee.rotation.x = k - lift * 0.35;
                        leg.ankle.rotation.x = a + lift * 1.5;
                    } else {
                        leg.knee.rotation.x = k + lift * 0.45;
                        leg.ankle.rotation.x = a - lift * 0.8;
                    }
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
            body.rotation.set(run && !lowSlung ? Math.sin(phase * TAU) * 0.07 * moving : 0, lowSlung ? Math.sin(phase * TAU) * 0.12 * moving : 0, 0);
            torso.scale.set(breathe, breathe, 1);

            // The head: bobbing as it goes, looking about as it stands; the tail swaying
            neck.rotation.set(rest.neck + Math.sin(phase * TAU * 2) * 0.05 * moving, Math.sin(t * 0.37) * 0.35 * (1 - moving), 0);
            head.rotation.set(rest.head, Math.sin(t * 0.61) * 0.15 * (1 - moving), 0);
            jaw.rotation.x = 0.03 + Math.max(0, Math.sin(t * 0.9)) * 0.05 * (1 - moving) + (run ? 0.25 : 0) * moving;
            // (a sprawling creature's swinging against its body's side to side; a hanging tail
            // lifting out behind it as it runs)
            tailParts.forEach((each, k) => {
                const sway = lowSlung ? -Math.sin(phase * TAU - k * 0.5) * 0.14 * moving + Math.sin(t * 0.8 - k * 0.6) * 0.05 : Math.sin(t * 2.4 + phase * TAU - k * 0.6) * (0.12 + k * 0.05);

                each.rotation.set(rest.tail[k] + (k === 0 ? (tail.runLift ?? 0.45) * (run ? 1 : 0.3) * moving : 0), sway, 0);
            });
            quills.scale.setScalar(1);

            // Flying: its legs tucked up under it, its neck out ahead and its head level, its tail
            // streaming out behind, rising a little with each downstroke
            const aloft = fly && wings.length ? smooth(Math.min(1, fly.amount)) : 0;

            if (aloft > 0) {
                for (const leg of Object.values(legs)) {
                    bendLeg(leg, leg.front > 0 ? [1.5, -2, 1.4] : [1.4, -0.4, 1], aloft);
                }

                neck.rotation.x += (rest.neck + 0.45 - neck.rotation.x) * aloft;
                head.rotation.x += (rest.head - 0.35 - head.rotation.x) * aloft;
                body.position.y += Math.sin(wingPhase) * girth * 0.35 * fly.beat * aloft;
                tailParts.forEach((each, k) => {
                    each.rotation.x += (rest.tail[k] * 0.2 + Math.sin(t * 1.3 - k * 0.7) * 0.04 - each.rotation.x) * aloft;
                    each.rotation.y *= 1 - aloft * 0.7;
                });
            }

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

            // The wings: folded along the flanks, opening to beat when it runs or strikes (slower,
            // the bigger they are), and held spread a while when it stretches
            // (Flying, spread wide, beating slower the bigger they are, or held out to glide)
            const spread = attack || run || aloft > 0.5 ? 1 : Math.max(0, open);

            opened += (spread - opened) * Math.min(1, dt * 3);
            wingPhase += dt * (aloft > 0 ? (TAU * 1.6 * (0.55 + 0.45 * fly.beat)) / Math.sqrt(look.wings?.span ?? 1) : (7 / Math.sqrt(look.wings?.span ?? 1)) * (attack ? 1.3 : 1));

            for (const wing of wings) {
                spreadWing(wing, Math.max(opened, aloft), aloft > 0 ? Math.max(0.08, fly.beat) * aloft + (attack || run ? 1 : 0.15 * opened) * (1 - aloft) : attack || run ? 1 : 0.15 * opened, wingPhase);
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
                    spreadWing(wing, opened * (1 - fall) + 0.55 * fall, 0, 0);
                    wing.shoulder.rotation.z += wing.side * (wing.side === dead.side ? -0.5 : 0.6) * fall;
                }
            }
        },
    };
}
