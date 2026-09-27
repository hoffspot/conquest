// Trees grown from rules for each kind, so that each one is a little different and nothing needs
// downloading. A trunk that tapers from a flared foot and leans a little; boughs set round it the
// way that kind grows them (an oak's spreading and crooked, a beech's in a dome, a birch's
// arching over, a pine's in a flat crown on a bare trunk, a spruce's in whorls, tier on tier, a
// poplar's straight up, an apple tree's low and twisted), bending up to the light or down under
// their weight; smaller branches on those; bark drawn for each kind. Leaves in clusters on cards
// at the branches' ends (lobed oak leaves, beech's, birch's small ones, poplar's, needles in
// sprays on the spruce and in tufts on the pine, apples among the apple tree's), lit as if the
// crown were one soft mass, and darker deep inside it.
//
// Grown in metres, standing on (0, 0, 0), from a seed, so the same variant grows the same tree
// every time; each variant once, then copied wherever it stands. Every kind's bark is drawn side
// by side on one picture, and its leaves on another, so all the trees share two materials; and
// planted (plantTrees) they're merged a tile of the map at a time, so the camera (and the sun's
// shadows) draw only the tiles in view.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRandom } from "../../../core/random.js";

/**
 * How each kind grows. Heights in metres; angles in degrees from the parent's direction;
 * lengths as shares of the tree's height (boughs) or their bough's length (branches).
 *
 * - trunk: its radius at the foot, how far up it goes as a leader (a share of the height), how
 *   much it tapers by the top, how far it leans and how crooked it is.
 * - boughs: how many, from how far up the trunk to how far, spread how (shape: how long they
 *   are up the trunk), whorls (set in rings of that many, as a spruce's), bend (up, or down if
 *   less than 0, a share of their direction each metre), crook (random turning).
 * - branches: on each bough, likewise.
 * - leaves: the cards' size (metres), how many on each branch (and bough, if it has none), from
 *   how far along; flat (lying level along the bough, as a spruce's sprays).
 */
export const SPECIES = Object.freeze({
    oak: {
        height: [7, 9],
        trunk: { radius: 0.34, reach: 0.62, taper: 0.45, lean: 0.05, crook: 0.18 },
        boughs: { count: [6, 8], from: 0.3, to: 0.95, angle: [48, 75], length: [0.38, 0.5], shape: "spread", bend: 0.05, crook: 0.45, thickness: 0.58 },
        branches: { count: [4, 6], from: 0.25, angle: [35, 65], length: [0.35, 0.55], bend: 0.12, crook: 0.4 },
        leaves: { size: [1.5, 2], perBranch: 9, from: 0.1 },
        bark: "oak",
    },
    beech: {
        height: [8, 10],
        trunk: { radius: 0.27, reach: 0.9, taper: 0.3, lean: 0.03, crook: 0.06 },
        boughs: { count: [11, 14], from: 0.3, to: 0.97, angle: [38, 60], length: [0.3, 0.4], shape: "dome", bend: 0.1, crook: 0.2, thickness: 0.45 },
        branches: { count: [3, 5], from: 0.25, angle: [30, 60], length: [0.45, 0.65], bend: 0.12, crook: 0.25 },
        leaves: { size: [1.5, 1.95], perBranch: 8, from: 0.1 },
        bark: "beech",
    },
    birch: {
        height: [7.5, 9.5],
        trunk: { radius: 0.17, reach: 0.96, taper: 0.22, lean: 0.07, crook: 0.08 },
        boughs: { count: [9, 13], from: 0.35, to: 0.96, angle: [32, 50], length: [0.22, 0.32], shape: "oval", bend: -0.18, crook: 0.2, thickness: 0.4 },
        branches: { count: [3, 4], from: 0.3, angle: [25, 45], length: [0.45, 0.65], bend: -0.35, crook: 0.2 },
        leaves: { size: [1.1, 1.45], perBranch: 7, from: 0.15 },
        bark: "birch",
    },
    pine: {
        height: [8.5, 10.5],
        trunk: { radius: 0.26, reach: 1, taper: 0.2, lean: 0.06, crook: 0.12 },
        boughs: { count: [11, 14], from: 0.55, to: 0.97, angle: [55, 82], length: [0.2, 0.3], shape: "top", bend: 0.22, crook: 0.4, thickness: 0.42 },
        branches: { count: [3, 4], from: 0.35, angle: [30, 60], length: [0.4, 0.6], bend: 0.25, crook: 0.3 },
        leaves: { size: [1.35, 1.7], perBranch: 4, from: 0.45, tufts: true },
        bark: "pine",
    },
    spruce: {
        height: [7.5, 9.5],
        trunk: { radius: 0.24, reach: 1, taper: 0.08, lean: 0.02, crook: 0.03 },
        boughs: { count: [56, 70], whorl: 7, from: 0.08, to: 0.97, angle: [80, 100], length: [0.36, 0.42], shape: "cone", bend: -0.2, crook: 0.12, thickness: 0.3, sides: 3, segments: 3 },
        branches: null,
        leaves: { size: [1.2, 1.55], perBranch: 7, from: 0.05, flat: true },
        bark: "spruce",
    },
    poplar: {
        height: [9.5, 12],
        trunk: { radius: 0.25, reach: 1, taper: 0.15, lean: 0.02, crook: 0.05 },
        boughs: { count: [16, 20], from: 0.12, to: 0.97, angle: [16, 28], length: [0.16, 0.22], shape: "column", bend: 0.2, crook: 0.15, thickness: 0.3, sides: 4 },
        branches: { count: [2, 3], from: 0.35, angle: [18, 30], length: [0.4, 0.6], bend: 0.2, crook: 0.2 },
        leaves: { size: [1.25, 1.6], perBranch: 7, from: 0.1 },
        bark: "poplar",
    },
    apple: {
        height: [4.2, 5.2],
        trunk: { radius: 0.15, reach: 0.4, taper: 0.55, lean: 0.12, crook: 0.3 },
        boughs: { count: [5, 7], from: 0.55, to: 1, angle: [45, 65], length: [0.45, 0.6], shape: "spread", bend: 0.1, crook: 0.55, thickness: 0.65 },
        branches: { count: [3, 5], from: 0.2, angle: [35, 60], length: [0.45, 0.65], bend: 0.06, crook: 0.45 },
        leaves: { size: [1.1, 1.4], perBranch: 8, from: 0.1 },
        bark: "apple",
    },
});

/** The kinds, in the order of their pictures across the bark and the leaves' pictures. */
export const KINDS = Object.freeze(Object.keys(SPECIES));

/**
 * The trees there are ([kind, seed]): each kind grown several ways, the broadleaved ones more
 * often than the rest, as in the fields round an old town. Their number is the pieces'
 * TREE_VARIANTS (core/setpieces/pieces.js).
 */
export const VARIANTS = Object.freeze([
    ["oak", 1], ["beech", 1], ["birch", 1], ["spruce", 1], ["pine", 1], ["oak", 2],
    ["poplar", 1], ["birch", 2], ["spruce", 2], ["beech", 2], ["apple", 1], ["oak", 3],
    ["pine", 2], ["spruce", 3], ["birch", 3], ["beech", 3], ["oak", 4], ["spruce", 4],
    ["poplar", 2], ["apple", 2], ["birch", 4], ["pine", 3], ["beech", 4], ["oak", 5],
]);

// How finely wood is made: sides round, and segments along, a trunk, a bough and a branch
// (a kind's boughs can be finer: `sides`, `segments`)
const ROUND = [7, 4, 3];
const SEGMENTS = [7, 3, 2];

// How far up the bark's pattern repeats (metres; it goes once round each limb)
const BARK_REPEAT = 1.6;

// How low a bough or a spray of leaves comes to the ground (metres)
const GROUND_CLEAR = 0.2;

const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Where a shape puts its longest boughs up the trunk (t: 0 at the lowest, 1 at the highest):
// the length each gets, as a share of the longest
const SHAPES = {
    // An oak's or an apple tree's: long low limbs, shorter higher up
    spread: (t) => 1 - 0.55 * t,
    // A beech's: longest a little below the middle, rounding off above and below
    dome: (t) => Math.max(0.25, 1 - ((t - 0.35) / 0.75) ** 2),
    // A birch's: an egg, longest low down
    oval: (t) => Math.max(0.3, 1 - ((t - 0.3) / 0.8) ** 2),
    // A pine's: only at the top, longest in the middle of the crown
    top: (t) => Math.max(0.35, 1 - Math.abs(t - 0.45) * 1.4),
    // A spruce's: longest at the bottom, to a point at the top
    cone: (t) => 0.1 + 0.95 * (1 - t) ** 1.1,
    // A poplar's: all short, a little shorter at the top
    column: (t) => 1 - 0.45 * t,
};

// A limb (trunk, bough or branch) grown as a path: its points, radii, and how long it is
function limb(random, { from, direction, length, radius, taper, segments, bend, crook, flare = false }) {
    const points = [from.clone()];
    const radii = [radius * (flare ? 1.5 : 1)];
    const heading = direction.clone().normalize();
    const step = length / segments;

    for (let k = 1; k <= segments; k++) {
        // Up to the light (or down under its weight), and a little crooked
        heading.addScaledVector(UP, bend * step);
        heading.x += (random.next() - 0.5) * crook * step;
        heading.y += (random.next() - 0.5) * crook * step * 0.5;
        heading.z += (random.next() - 0.5) * crook * step;
        heading.normalize();

        const next = points[k - 1].clone().addScaledVector(heading, step);

        // A drooping bough rests on the ground rather than going into it
        if (next.y < GROUND_CLEAR) {
            next.y = GROUND_CLEAR;
            heading.y = Math.max(0, heading.y);
            heading.normalize();
        }

        points.push(next);

        const t = k / segments;

        radii.push(radius * (1 - (1 - taper) * t) * (flare && k === 1 ? 1.12 : 1));
    }

    return { points, radii, length };
}

// The point and direction a share t of the way along a limb
function along({ points }, t) {
    const at = t * (points.length - 1);
    const k = Math.min(points.length - 2, Math.floor(at));
    const f = at - k;

    return { point: points[k].clone().lerp(points[k + 1], f), direction: points[k + 1].clone().sub(points[k]).normalize() };
}

function radiusAt({ radii }, t) {
    const at = t * (radii.length - 1);
    const k = Math.min(radii.length - 2, Math.floor(at));

    return radii[k] + (radii[k + 1] - radii[k]) * (at - k);
}

// A direction `angle` degrees from `axis`, turned `around` radians about it
function aside(axis, angle, around) {
    const side = Math.abs(axis.y) > 0.9 ? _a.set(1, 0, 0) : _a.set(0, 1, 0);
    const u = _b.crossVectors(axis, side).normalize().clone();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    const tilt = (angle * Math.PI) / 180;

    return axis.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(u.multiplyScalar(Math.cos(around)), Math.sin(tilt)).addScaledVector(v.multiplyScalar(Math.sin(around)), Math.sin(tilt)).normalize();
}

/**
 * Grow a tree of a kind (SPECIES) from a seed: { height, wood: { position, normal, uv, index },
 * leaves: { position, normal, uv, color, index }, crown: { centre, radius } } (arrays; metres).
 */
export function growTree(kind, seed) {
    const species = SPECIES[kind];
    const random = createRandom(seed * 7919 + kind.length * 104729);
    const range = ([least, most]) => random.range(least, most);
    const height = range(species.height);
    const limbs = [];
    const tips = [];

    // The trunk: up, leaning a little
    const { trunk } = species;
    const lean = new THREE.Vector3((random.next() - 0.5) * 2 * trunk.lean, 1, (random.next() - 0.5) * 2 * trunk.lean);
    const stem = limb(random, { from: new THREE.Vector3(), direction: lean, length: height * trunk.reach, radius: trunk.radius * (height / 10), taper: trunk.taper, segments: SEGMENTS[0], bend: 0, crook: trunk.crook, flare: true });

    limbs.push({ ...stem, level: 0 });

    // The boughs, round it the way the kind grows them
    const { boughs, branches } = species;
    const count = random.int(...boughs.count);
    const around = random.next() * Math.PI * 2;

    for (let k = 0; k < count; k++) {
        const whorl = boughs.whorl ? Math.floor(k / boughs.whorl) : k;
        const whorls = boughs.whorl ? Math.ceil(count / boughs.whorl) : count;
        const share = whorls > 1 ? whorl / (whorls - 1) : 0.5;
        // (Up the trunk, from `from` to `to` of its length)
        const t = Math.min(0.99, boughs.from + (boughs.to - boughs.from) * share + (boughs.whorl ? 0 : (random.next() - 0.5) * 0.06));
        const { point, direction } = along(stem, t);
        const spin = boughs.whorl ? around + ((k % boughs.whorl) / boughs.whorl) * Math.PI * 2 + whorl * 0.7 + (random.next() - 0.5) * 0.5 : around + k * GOLDEN + (random.next() - 0.5) * 0.4;
        const bough = limb(random, {
            from: point,
            direction: aside(direction, range(boughs.angle), spin),
            length: height * range(boughs.length) * SHAPES[boughs.shape](Math.min(1, Math.max(0, share))),
            radius: radiusAt(stem, t) * boughs.thickness,
            taper: 0.2,
            segments: boughs.segments ?? SEGMENTS[1],
            bend: boughs.bend,
            crook: boughs.crook,
        });

        limbs.push({ ...bough, level: 1, sides: boughs.sides });

        if (!branches) {
            tips.push({ limb: bough, from: species.leaves.from, count: species.leaves.perBranch + 1, level: 1 });
            continue;
        }

        // Branches on the bough
        const n = random.int(...branches.count);

        for (let j = 0; j < n; j++) {
            const s = branches.from + (1 - branches.from) * ((j + 0.5) / n) + (random.next() - 0.5) * 0.1;
            const at = along(bough, Math.min(0.97, s));
            const branch = limb(random, {
                from: at.point,
                direction: aside(at.direction, range(branches.angle), random.next() * Math.PI * 2),
                length: bough.length * range(branches.length) * (1.1 - 0.4 * s),
                radius: radiusAt(bough, s) * 0.6,
                taper: 0.25,
                segments: SEGMENTS[2],
                bend: branches.bend,
                crook: branches.crook,
            });

            limbs.push({ ...branch, level: 2 });
            tips.push({ limb: branch, from: species.leaves.from, count: species.leaves.perBranch, level: 2 });
        }

        // And leaves on the bough's own end
        tips.push({ limb: bough, from: 0.75, count: 2, level: 1 });
    }

    // A leader's top, where the trunk stops short of the crown's top, carries leaves too
    if (trunk.reach >= 0.9) {
        tips.push({ limb: stem, from: 0.9, count: 3, level: 0 });
    }

    const cell = KINDS.indexOf(kind);
    const wood = tubes(limbs, cell);
    const leaves = cards(random, species, tips, height, cell);

    return { height, wood, leaves: leaves.geometry, crown: leaves.crown };
}

// The wood: each limb a tube, its bark's pattern (the kind's, `cell` across the bark's picture)
// running up it
function tubes(limbs, cell) {
    const position = [];
    const normal = [];
    const uv = [];
    const index = [];
    const frame = { n: new THREE.Vector3(), b: new THREE.Vector3(), t: new THREE.Vector3() };

    for (const { points, radii, level, sides: finer } of limbs) {
        const sides = finer ?? ROUND[level];
        const first = position.length / 3;
        let travelled = 0;

        for (let k = 0; k < points.length; k++) {
            const tangent = frame.t.copy(points[Math.min(points.length - 1, k + 1)]).sub(points[Math.max(0, k - 1)]).normalize();

            // Carried along the limb without twisting
            if (k === 0) {
                frame.n.crossVectors(tangent, Math.abs(tangent.y) > 0.9 ? _a.set(1, 0, 0) : _a.set(0, 1, 0)).normalize();
            } else {
                frame.n.addScaledVector(tangent, -frame.n.dot(tangent)).normalize();
                travelled += points[k].distanceTo(points[k - 1]);
            }

            frame.b.crossVectors(tangent, frame.n).normalize();

            for (let s = 0; s <= sides; s++) {
                const angle = (s / sides) * Math.PI * 2;
                const [c, d] = [Math.cos(angle), Math.sin(angle)];
                const nx = frame.n.x * c + frame.b.x * d;
                const ny = frame.n.y * c + frame.b.y * d;
                const nz = frame.n.z * c + frame.b.z * d;

                position.push(points[k].x + nx * radii[k], points[k].y + ny * radii[k], points[k].z + nz * radii[k]);
                normal.push(nx, ny, nz);
                uv.push((cell + 0.04 + 0.92 * (s / sides)) / KINDS.length, travelled / BARK_REPEAT);
            }
        }

        for (let k = 0; k < points.length - 1; k++) {
            for (let s = 0; s < sides; s++) {
                const a = first + k * (sides + 1) + s;
                const b = a + sides + 1;

                index.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
    }

    return { position, normal, uv, index };
}

// The leaves: cards round the ends of the branches, each a cluster of leaves (its picture: the
// kind's, `cell` across the leaves' picture), turned every which way (or lying level along the
// bough, for a spruce's sprays), lit as the crown's rounded mass would be, and darker deep inside
function cards(random, species, tips, height, cell) {
    const placed = [];
    const { leaves } = species;
    const range = ([least, most]) => random.range(least, most);

    for (const { limb: owner, from, count, level } of tips) {
        for (let k = 0; k < count; k++) {
            const t = from + (1 - from) * ((k + random.next()) / count);
            const { point, direction } = along(owner, Math.min(1, t));
            const size = range(leaves.size) * (level === 0 ? 1.1 : 1);
            let facing;
            let length;

            let offset = null;

            if (leaves.flat) {
                // A spray lying level along the bough, a little tilted, to one side of it then the
                // other, as its side shoots grow
                facing = new THREE.Vector3((random.next() - 0.5) * 0.5, 1, (random.next() - 0.5) * 0.5).normalize();
                length = direction.clone().setY(direction.y * 0.3).normalize();
                offset = new THREE.Vector3().crossVectors(length, UP).normalize().multiplyScalar((k % 2 ? 1 : -1) * size * 0.3);
            } else {
                // Turned every which way, but mostly out from the tree and up to the light
                const out = point.clone().setY(0).normalize();

                facing = new THREE.Vector3(random.next() - 0.5, random.next() - 0.3, random.next() - 0.5).normalize().addScaledVector(out, 0.5).addScaledVector(direction, 0.4).normalize();
                length = new THREE.Vector3().crossVectors(facing, new THREE.Vector3(random.next() - 0.5, random.next() - 0.5, random.next() - 0.5)).normalize();
            }

            // A tuft (a pine's) is a few cards crossed through the same point
            const crossed = leaves.tufts ? 2 : 1;

            for (let c = 0; c < crossed; c++) {
                const spin = (c * Math.PI) / crossed;
                const side = new THREE.Vector3().crossVectors(facing, length).normalize();
                const across = length.clone().multiplyScalar(Math.cos(spin)).addScaledVector(side, Math.sin(spin));
                const up = new THREE.Vector3().crossVectors(across, facing).normalize();
                const centre = point.clone().addScaledVector(direction, size * 0.25);

                if (offset) {
                    centre.add(offset);
                }

                centre.y = Math.max(centre.y, GROUND_CLEAR + size * 0.4);

                placed.push({ centre, across, up, size, shade: 0.88 + random.next() * 0.24, warm: random.next() });
            }
        }
    }

    // The crown: round the cards' middles, as wide as they spread
    const centre = new THREE.Vector3();

    for (const card of placed) {
        centre.add(card.centre);
    }

    centre.divideScalar(Math.max(1, placed.length));

    const reach = new THREE.Vector3();

    for (const card of placed) {
        reach.x = Math.max(reach.x, Math.abs(card.centre.x - centre.x));
        reach.y = Math.max(reach.y, Math.abs(card.centre.y - centre.y));
        reach.z = Math.max(reach.z, Math.abs(card.centre.z - centre.z));
    }

    const radius = new THREE.Vector3(Math.max(1, reach.x), Math.max(1, reach.y), Math.max(1, reach.z));
    const position = [];
    const normal = [];
    const uv = [];
    const color = [];
    const index = [];
    const corner = new THREE.Vector3();
    const shading = new THREE.Vector3();

    for (const { centre: middle, across, up, size, shade, warm } of placed) {
        const first = position.length / 3;

        // Outer leaves in the light, inner ones in the crown's shade
        const depth = Math.min(1, Math.hypot((middle.x - centre.x) / radius.x, (middle.y - centre.y) / radius.y, (middle.z - centre.z) / radius.z));
        const light = (0.5 + 0.5 * depth) * shade * (0.9 + 0.1 * Math.min(1, middle.y / height + 0.3));

        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
            corner.copy(middle).addScaledVector(across, (u - 0.5) * size).addScaledVector(up, (v - 0.35) * size);
            position.push(corner.x, corner.y, corner.z);

            // The crown's rounded mass, leaning up to the sky
            shading.set((corner.x - centre.x) / radius.x, (corner.y - centre.y) / radius.y + 0.35, (corner.z - centre.z) / radius.z).normalize();
            normal.push(shading.x, shading.y, shading.z);
            uv.push((cell + 0.01 + 0.98 * u) / KINDS.length, v);
            color.push(light * (1 + 0.06 * (warm - 0.5)), light * (1 + 0.03 * (warm - 0.5)), light * (1 - 0.08 * (warm - 0.5)));
        }

        index.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }

    return { geometry: { position, normal, uv, color, index }, crown: { centre: centre.toArray(), radius: radius.toArray() } };
}

// --- Pictures: bark and leaves, drawn on canvases (in the browser) ---

// Seamless: draw at (x, y) and wherever it wraps round the picture's edges
function wrapped(context, width, height, draw) {
    for (const dx of [-width, 0, width]) {
        for (const dy of [-height, 0, height]) {
            context.save();
            context.translate(dx, dy);
            draw();
            context.restore();
        }
    }
}

const BARKS = {
    oak: { base: "#4d3f33", dark: "#221912", light: "#6e5d4d" },
    beech: { base: "#8e8b82", dark: "#5f5c55", light: "#aaa79d" },
    birch: { base: "#e6e1d6", dark: "#27221e", light: "#f5f2ea" },
    pine: { base: "#8c5634", dark: "#3f2415", light: "#b8784a" },
    spruce: { base: "#5d4a3d", dark: "#2c2119", light: "#7a6555" },
    poplar: { base: "#76705f", dark: "#3b372d", light: "#8f8a78" },
    apple: { base: "#574434", dark: "#2a1f16", light: "#77624d" },
};

// A kind's bark, 128 by 256 pixels, repeating up it
function barkPicture(context, kind) {
    const [width, height] = [128, 256];
    const random = createRandom(kind.length * 31 + kind.charCodeAt(0));
    const colours = BARKS[kind];

    context.fillStyle = colours.base;
    context.fillRect(0, 0, width, height);

    // Fine grain up the bark
    for (let k = 0; k < 220; k++) {
        const [x, y, length, wobble] = [random.next() * width, random.next() * height, 20 + random.next() * 90, (random.next() - 0.5) * 4];

        context.strokeStyle = random.chance(0.5) ? colours.light : colours.dark;
        context.globalAlpha = 0.12 + random.next() * 0.15;
        context.lineWidth = 1 + random.next() * 1.5;
        wrapped(context, width, height, () => {
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + wobble, y + length);
            context.stroke();
        });
    }

    context.globalAlpha = 1;

    if (kind === "oak" || kind === "poplar" || kind === "apple") {
        // Deep furrows between ridges, running up and meeting
        for (let k = 0; k < (kind === "oak" ? 26 : 16); k++) {
            const x = (k / (kind === "oak" ? 26 : 16)) * width + random.next() * 6;
            let y = random.next() * height;
            const points = [];

            for (let j = 0; j < 7; j++) {
                points.push([x + (random.next() - 0.5) * 10, y]);
                y += 20 + random.next() * 30;
            }

            context.strokeStyle = colours.dark;
            context.lineWidth = kind === "oak" ? 3 + random.next() * 3 : 2 + random.next() * 2;
            wrapped(context, width, height, () => {
                context.beginPath();
                points.forEach(([px, py], j) => (j ? context.lineTo(px, py) : context.moveTo(px, py)));
                context.stroke();
            });
        }
    } else if (kind === "birch") {
        // Black lenticels across the white, and rough dark patches
        for (let k = 0; k < 60; k++) {
            const [x, y, w, h] = [random.next() * width, random.next() * height, 6 + random.next() * 22, 1 + random.next() * 2.5];

            context.fillStyle = colours.dark;
            context.globalAlpha = 0.55 + random.next() * 0.4;
            wrapped(context, width, height, () => context.fillRect(x, y, w, h));
        }

        for (let k = 0; k < 7; k++) {
            const [x, y, r] = [random.next() * width, random.next() * height, 5 + random.next() * 12];

            context.fillStyle = colours.dark;
            context.globalAlpha = 0.75;
            wrapped(context, width, height, () => {
                context.beginPath();
                context.moveTo(x, y - r * 1.6);
                context.lineTo(x + r, y);
                context.lineTo(x, y + r * 1.6);
                context.lineTo(x - r, y);
                context.fill();
            });
        }

        context.globalAlpha = 1;
    } else if (kind === "pine" || kind === "spruce") {
        // Plates (a pine's orange, a spruce's small scales), cracked apart
        const [across, up] = kind === "pine" ? [4, 7] : [7, 16];

        for (let row = 0; row < up; row++) {
            for (let column = 0; column < across; column++) {
                // Each plate its own size, a little out of line with its neighbours
                const [w, h] = [(width / across) * (0.75 + random.next() * 0.45), (height / up) * (0.65 + random.next() * 0.7)];
                const x = column * (width / across) + (row % 2) * (width / across) * 0.5 + (random.next() - 0.5) * 8;
                const y = row * (height / up) + (random.next() - 0.5) * 14;

                context.fillStyle = random.chance(0.5) ? colours.light : colours.base;
                context.strokeStyle = colours.dark;
                context.lineWidth = kind === "pine" ? 3 : 2;
                wrapped(context, width, height, () => {
                    context.beginPath();

                    if (context.roundRect) {
                        context.roundRect(x + 2, y + 2, w - 4, h - 4, 4);
                    } else {
                        context.rect(x + 2, y + 2, w - 4, h - 4);
                    }

                    context.fill();
                    context.stroke();
                });
            }
        }
    } else {
        // A beech's smooth grey: soft pale patches, a few dark eyes
        for (let k = 0; k < 30; k++) {
            const [x, y, r] = [random.next() * width, random.next() * height, 6 + random.next() * 18];

            context.fillStyle = colours.light;
            context.globalAlpha = 0.18;
            wrapped(context, width, height, () => {
                context.beginPath();
                context.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
                context.fill();
            });
        }

        for (let k = 0; k < 5; k++) {
            const [x, y] = [random.next() * width, random.next() * height];

            context.strokeStyle = colours.dark;
            context.globalAlpha = 0.7;
            context.lineWidth = 2;
            wrapped(context, width, height, () => {
                context.beginPath();
                context.moveTo(x - 7, y);
                context.quadraticCurveTo(x, y - 5, x + 7, y);
                context.stroke();
            });
        }

        context.globalAlpha = 1;
    }
}

// Each kind's leaves: their greens (dark to light), their shape, how long (of the 256-pixel
// card), how many to a cluster; and a spruce's and a pine's needles
const FOLIAGE = {
    oak: { greens: ["#2d5019", "#3f6a22", "#557f2d"], shape: "lobed", length: [46, 62], count: 30 },
    beech: { greens: ["#3f6e1f", "#57872b", "#72a038"], shape: "oval", length: [42, 56], count: 34 },
    birch: { greens: ["#5a8a27", "#74a432", "#91bb45"], shape: "toothed", length: [26, 36], count: 52 },
    poplar: { greens: ["#46742a", "#5e8e33", "#76a53f"], shape: "heart", length: [34, 44], count: 38 },
    apple: { greens: ["#365f1f", "#4a7a29", "#60913a"], shape: "oval", length: [36, 48], count: 32, fruit: "#b82a1e" },
    spruce: { greens: ["#2e5234", "#3d6844", "#528055"], needles: "spray" },
    pine: { greens: ["#34522a", "#466a33", "#5a7f3f"], needles: "tufts" },
};

// One leaf, its stalk at (0, 0), pointing up the y axis (negative), `length` long
function leaf(context, shape, length, fill, vein) {
    const w = length * (shape === "toothed" ? 0.62 : shape === "heart" ? 0.8 : shape === "lobed" ? 0.55 : 0.5);

    context.beginPath();
    context.moveTo(0, 0);

    if (shape === "lobed") {
        // An oak's: rounded lobes down each side
        for (const side of [1, -1]) {
            context.moveTo(0, 0);

            for (let k = 0; k < 4; k++) {
                const y0 = -length * (0.15 + k * 0.2);
                const bulge = w * (0.55 + 0.25 * Math.sin((k / 3) * Math.PI));

                context.quadraticCurveTo(side * bulge * 1.2, y0 - length * 0.05, side * bulge * 0.35, y0 - length * 0.12);
            }

            context.quadraticCurveTo(side * w * 0.2, -length * 1.02, 0, -length);
        }
    } else if (shape === "toothed") {
        // A birch's: a pointed triangle, its edges finely toothed
        for (const side of [1, -1]) {
            context.moveTo(0, 0);

            for (let k = 0; k <= 8; k++) {
                const t = k / 8;
                const half = w * 0.5 * (t < 0.35 ? 0.4 + t * 1.7 : (1 - t) * 1.55);

                context.lineTo(side * (half + (k % 2) * 1.5), -length * t);
            }
        }
    } else {
        // An oval (beech, apple) or a heart (poplar), pointed at the tip
        const shoulder = shape === "heart" ? 0.25 : 0.45;

        context.bezierCurveTo(w * 0.7, -length * shoulder * 0.4, w * 0.6, -length * (shoulder + 0.35), 0, -length);
        context.bezierCurveTo(-w * 0.6, -length * (shoulder + 0.35), -w * 0.7, -length * shoulder * 0.4, 0, 0);
    }

    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = vein;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -length * 0.92);
    context.stroke();
}

// A kind's cluster of leaves (or needles), 256 pixels square, on nothing
function foliagePicture(context, kind) {
    const random = createRandom(kind.charCodeAt(0) * 17 + kind.length);
    const foliage = FOLIAGE[kind];
    const greens = foliage.greens;

    context.lineCap = "round";

    if (foliage.needles === "spray") {
        // A spruce's flat spray: a twig forking, short needles thick along each part
        const twigs = [[[128, 250], [128, 20]], [[128, 190], [40, 90]], [[128, 190], [216, 90]], [[128, 120], [60, 40]], [[128, 120], [196, 40]], [[128, 230], [60, 170]], [[128, 230], [196, 170]]];

        for (const [[x0, y0], [x1, y1]] of twigs) {
            const length = Math.hypot(x1 - x0, y1 - y0);
            const [dx, dy] = [(x1 - x0) / length, (y1 - y0) / length];

            context.strokeStyle = "#4a3624";
            context.lineWidth = 3;
            context.beginPath();
            context.moveTo(x0, y0);
            context.lineTo(x1, y1);
            context.stroke();

            for (let s = 0; s < length; s += 2.4) {
                for (const side of [1, -1]) {
                    const [x, y] = [x0 + dx * s, y0 + dy * s];
                    const needle = 16 + random.next() * 9 - (s / length) * 6;
                    const angle = Math.atan2(dy, dx) + side * (0.8 + random.next() * 0.5);

                    context.strokeStyle = greens[random.int(0, 2)];
                    context.lineWidth = 2.6;
                    context.beginPath();
                    context.moveTo(x, y);
                    context.lineTo(x + Math.cos(angle) * needle, y + Math.sin(angle) * needle);
                    context.stroke();
                }
            }
        }
    } else if (foliage.needles === "tufts") {
        // A pine's tufts: long needles in brushes fanning from the twigs' ends
        const ends = [[128, 70], [70, 110], [186, 110], [100, 170], [156, 170], [128, 130]];

        context.strokeStyle = "#5a4027";
        context.lineWidth = 4;

        for (const [x, y] of ends) {
            context.beginPath();
            context.moveTo(128, 255);
            context.quadraticCurveTo(128, 200, x, y + 30);
            context.stroke();
        }

        for (const [x, y] of ends) {
            for (let k = 0; k < 70; k++) {
                const angle = -Math.PI / 2 + (random.next() - 0.5) * 2.6;
                const needle = 38 + random.next() * 30;

                context.strokeStyle = greens[random.int(0, 2)];
                context.lineWidth = 1.8;
                context.beginPath();
                context.moveTo(x, y + 28);
                context.quadraticCurveTo(x + Math.cos(angle) * needle * 0.5, y + 28 + Math.sin(angle) * needle * 0.6, x + Math.cos(angle) * needle, y + 28 + Math.sin(angle) * needle);
                context.stroke();
            }
        }
    } else {
        // A cluster of leaves on a forking twig: darker ones first, behind
        context.strokeStyle = "#4b3a28";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(128, 256);
        context.quadraticCurveTo(122, 180, 128, 60);
        context.moveTo(126, 170);
        context.quadraticCurveTo(90, 140, 60, 110);
        context.moveTo(127, 130);
        context.quadraticCurveTo(170, 110, 196, 80);
        context.stroke();

        const leaves = [];

        for (let k = 0; k < foliage.count; k++) {
            const r = Math.sqrt(random.next());
            const angle = random.next() * Math.PI * 2;

            leaves.push({ x: 128 + Math.cos(angle) * r * 92, y: 122 + Math.sin(angle) * r * 98, turn: angle + Math.PI / 2 + (random.next() - 0.5) * 1.2, length: random.range(...foliage.length), tone: random.int(0, 2) });
        }

        leaves.sort((a, b) => a.tone - b.tone);

        for (const { x, y, turn, length, tone } of leaves) {
            context.save();
            context.translate(x, y);
            context.rotate(turn);
            leaf(context, foliage.shape, length, greens[tone], "rgba(20, 40, 10, 0.45)");
            context.restore();
        }

        // An apple tree's apples among the leaves
        if (foliage.fruit) {
            for (let k = 0; k < 2; k++) {
                const [x, y, r] = [80 + random.next() * 96, 80 + random.next() * 90, 6 + random.next() * 2];
                const shine = context.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);

                shine.addColorStop(0, "#f06a4a");
                shine.addColorStop(1, foliage.fruit);
                context.fillStyle = shine;
                context.beginPath();
                context.arc(x, y, r, 0, Math.PI * 2);
                context.fill();
            }
        }
    }
}

// Every kind's picture side by side, each `width` by `height` pixels (and kept to its own)
function atlas(width, height, draw) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = width * KINDS.length;
    canvas.height = height;

    KINDS.forEach((kind, cell) => {
        context.save();
        context.translate(cell * width, 0);
        context.beginPath();
        context.rect(0, 0, width, height);
        context.clip();
        draw(context, kind);
        context.restore();
    });

    return canvas;
}

// --- Materials: the bark and the leaves, shared by every tree (so they merge) ---

/**
 * The breeze in the leaves: the time (seconds, set each frame by the game), and how far they
 * sway (metres, at the tree's top: none at the foot of the crown, 1.5 metres up).
 */
export const TREE_WIND = Object.freeze({ time: { value: 0 }, sway: { value: 0.06 } });

// Nearer the camera than this, a tree fades out (metres: all gone at the first, all there at the
// second), so the camera never looks through a wall of leaves
export const NEAR_FADE = Object.freeze([3, 7]);

// Fade what's near the camera out, a dithered pattern of it gone (after whatever else the
// material's shader does)
function nearFade(material) {
    const before = material.onBeforeCompile.bind(material);
    const key = material.customProgramCacheKey();

    material.onBeforeCompile = (shader, renderer) => {
        before(shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
{
    float nearDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

    if (nearDither > smoothstep(${NEAR_FADE[0].toFixed(1)}, ${NEAR_FADE[1].toFixed(1)}, length(vViewPosition))) discard;
}`);
    };
    material.customProgramCacheKey = () => `near|${key}`;
}

let materials = null;

/** The trees' materials: { bark, leaves }, every kind's pictures side by side on each. */
export function treeMaterials() {
    if (!materials) {
        const drawn = typeof document !== "undefined";
        const texture = (canvas, repeat) => {
            const result = new THREE.CanvasTexture(canvas);

            result.colorSpace = THREE.SRGBColorSpace;
            result.anisotropy = 4;
            result.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;

            return result;
        };
        const bark = new THREE.MeshLambertMaterial({ name: "bark", color: drawn ? 0xffffff : 0x5d4a3d, map: drawn ? texture(atlas(128, 256, (context, kind) => barkPicture(context, SPECIES[kind].bark)), true) : null });
        const leaves = new THREE.MeshLambertMaterial({
            name: "leaves",
            color: drawn ? 0xffffff : 0x4a7a29,
            map: drawn ? texture(atlas(256, 256, foliagePicture), false) : null,
            vertexColors: true,
            alphaTest: 0.45,
            side: THREE.DoubleSide,
        });

        bark.shadowSide = THREE.DoubleSide;
        leaves.shadowSide = THREE.DoubleSide;

        // Seen from behind, a card's leaves are lit as from in front (as the crown is), not dark;
        // and they stir in the breeze, each part of a crown in its own time, more the higher up
        leaves.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, { windTime: TREE_WIND.time, windSway: TREE_WIND.sway });
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nuniform float windTime;\nuniform float windSway;")
                .replace("#include <begin_vertex>", `#include <begin_vertex>
{
    vec3 windAt = (modelMatrix * vec4(position, 1.0)).xyz;
    float windPhase = windAt.x * 0.37 + windAt.z * 0.29 + windAt.y * 0.8;
    float windHow = windSway * clamp((windAt.y - 1.5) / 6.0, 0.0, 1.0);

    transformed.x += windHow * (sin(windTime * 1.7 + windPhase) + 0.4 * sin(windTime * 4.3 + windPhase * 2.1));
    transformed.z += windHow * 0.7 * cos(windTime * 1.3 + windPhase * 1.3);
    transformed.y += windHow * 0.3 * sin(windTime * 3.1 + windPhase * 1.7);
}`);
            shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
        };
        leaves.customProgramCacheKey = () => "leaves";

        for (const material of [bark, leaves]) {
            nearFade(material);
        }

        materials = { bark, leaves };
    }

    return materials;
}

function geometryOf({ position, normal, uv, color, index }) {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));

    if (color) {
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
    }

    geometry.setIndex(index);

    return geometry;
}

const grown = new Map();

// A variant's wood and leaves, grown once: { kind, wood, leaves } (BufferGeometry, metres)
function grownGeometry(variant) {
    const index = ((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;

    if (!grown.has(index)) {
        const [kind, seed] = VARIANTS[index];
        const tree = growTree(kind, seed);

        grown.set(index, { kind, wood: geometryOf(tree.wood), leaves: geometryOf(tree.leaves) });
    }

    return grown.get(index);
}

/**
 * A tree (a VARIANTS index): a Group in metres, its trunk's foot at (0, 0, 0), the wood and the
 * leaves meshes sharing the trees' materials; grown once for each variant, copied after.
 */
export function treeObject(variant) {
    const { kind, wood, leaves } = grownGeometry(variant);
    const { bark, leaves: foliage } = treeMaterials();
    const group = new THREE.Group();

    group.name = `tree-${kind}`;
    group.add(new THREE.Mesh(wood, bark), new THREE.Mesh(leaves, foliage));
    group.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
    });

    return group;
}

/**
 * Plant trees: [{ x, z (their trunks' feet, metres), variant, size (1: as grown), turn (radians
 * about the trunk) }], merged a `tile` metres square of the map at a time (the tiles out of view
 * aren't drawn): { object (a Group of the tiles' meshes), boxes (each tree's Box3, in order) }.
 */
export function plantTrees(placements, { tile = 24 } = {}) {
    const tiles = new Map();
    const boxes = [];
    const matrix = new THREE.Matrix4();
    const turned = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const at = new THREE.Vector3();

    for (const { x, z, variant, size = 1, turn = 0 } of placements) {
        const { wood, leaves } = grownGeometry(variant);
        const key = `${Math.floor(x / tile)},${Math.floor(z / tile)}`;

        matrix.compose(at.set(x, 0, z), turned.setFromAxisAngle(UP, turn), scale.setScalar(size));

        const parts = [wood.clone().applyMatrix4(matrix), leaves.clone().applyMatrix4(matrix)];
        const box = new THREE.Box3();

        for (const part of parts) {
            part.computeBoundingBox();
            box.union(part.boundingBox);
        }

        boxes.push(box);

        if (!tiles.has(key)) {
            tiles.set(key, { wood: [], leaves: [] });
        }

        tiles.get(key).wood.push(parts[0]);
        tiles.get(key).leaves.push(parts[1]);
    }

    const { bark, leaves } = treeMaterials();
    const object = new THREE.Group();

    object.name = "trees";

    for (const [key, parts] of tiles) {
        for (const [geometries, material] of [[parts.wood, bark], [parts.leaves, leaves]]) {
            const mesh = new THREE.Mesh(mergeGeometries(geometries), material);

            mesh.name = `${material.name} ${key}`;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false;
            object.add(mesh);
        }
    }

    return { object, boxes };
}
