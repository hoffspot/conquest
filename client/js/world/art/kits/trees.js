// Trees grown from rules for each kind, so that each one is a little different and nothing needs
// downloading. A trunk that leans a little and tapers from its foot, which swells out into the
// ground in buttresses, roots running out from them into the soil, darker and mossy low down,
// on a patch of bare earth, moss and fallen leaves or needles; boughs set round it the
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
// shadows) draw only the tiles in view. In the world outside, where there are far more of them
// and they come and go as the player does (world/chunks3d.js), each variant is kept once and
// drawn wherever it stands (Woodland), only those in view.
//
// The leaves don't cast shadows themselves: thousands of overlapping cards, each tested against
// its picture, would cost more to draw into the sun's shadows than everything else in the view.
// Each crown's shadow is cast by its shell instead, a rounded mass of 180 triangles round where
// its leaves grow, drawn only into the shadows.

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { createRandom } from "../../../core/random.js";
import { TREE_KINDS } from "../../../core/setpieces/pieces.js";

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
 * - foot: how far it swells out in buttresses (a share of the trunk's radius), how many roots
 *   run out from them over the ground and how far (metres), and how dark and mossy the bark is
 *   at the ground (red, green, blue: shares of its colour).
 */
export const SPECIES = Object.freeze({
    oak: {
        height: [7, 9],
        trunk: { radius: 0.34, reach: 0.62, taper: 0.45, lean: 0.05, crook: 0.18 },
        boughs: { count: [6, 8], from: 0.3, to: 0.95, angle: [48, 75], length: [0.38, 0.5], shape: "spread", bend: 0.05, crook: 0.45, thickness: 0.58 },
        branches: { count: [4, 6], from: 0.25, angle: [35, 65], length: [0.35, 0.55], bend: 0.12, crook: 0.4 },
        leaves: { size: [1.5, 2], perBranch: 9, from: 0.1 },
        foot: { flare: 0.8, roots: [4, 6], reach: [0.6, 0.9], tint: [0.62, 0.66, 0.5] },
        bark: "oak",
    },
    beech: {
        height: [8, 10],
        trunk: { radius: 0.27, reach: 0.9, taper: 0.3, lean: 0.03, crook: 0.06 },
        boughs: { count: [11, 14], from: 0.3, to: 0.97, angle: [38, 60], length: [0.3, 0.4], shape: "dome", bend: 0.1, crook: 0.2, thickness: 0.45 },
        branches: { count: [3, 5], from: 0.25, angle: [30, 60], length: [0.45, 0.65], bend: 0.12, crook: 0.25 },
        leaves: { size: [1.5, 1.95], perBranch: 8, from: 0.1 },
        foot: { flare: 0.95, roots: [5, 6], reach: [0.6, 0.9], tint: [0.66, 0.7, 0.56] },
        bark: "beech",
    },
    birch: {
        height: [7.5, 9.5],
        trunk: { radius: 0.17, reach: 0.96, taper: 0.22, lean: 0.07, crook: 0.08 },
        boughs: { count: [9, 13], from: 0.35, to: 0.96, angle: [32, 50], length: [0.22, 0.32], shape: "oval", bend: -0.18, crook: 0.2, thickness: 0.4 },
        branches: { count: [3, 4], from: 0.3, angle: [25, 45], length: [0.45, 0.65], bend: -0.35, crook: 0.2 },
        leaves: { size: [1.1, 1.45], perBranch: 7, from: 0.15 },
        foot: { flare: 0.4, roots: [2, 3], reach: [0.35, 0.55], tint: [0.34, 0.33, 0.31] },
        bark: "birch",
    },
    pine: {
        height: [8.5, 10.5],
        trunk: { radius: 0.26, reach: 1, taper: 0.2, lean: 0.06, crook: 0.12 },
        boughs: { count: [11, 14], from: 0.55, to: 0.97, angle: [55, 82], length: [0.2, 0.3], shape: "top", bend: 0.22, crook: 0.4, thickness: 0.42 },
        branches: { count: [3, 4], from: 0.35, angle: [30, 60], length: [0.4, 0.6], bend: 0.25, crook: 0.3 },
        leaves: { size: [1.35, 1.7], perBranch: 4, from: 0.45, tufts: true },
        foot: { flare: 0.5, roots: [3, 4], reach: [0.45, 0.7], tint: [0.66, 0.62, 0.52] },
        bark: "pine",
    },
    spruce: {
        height: [7.5, 9.5],
        trunk: { radius: 0.24, reach: 1, taper: 0.08, lean: 0.02, crook: 0.03 },
        boughs: { count: [56, 70], whorl: 7, from: 0.08, to: 0.97, angle: [80, 100], length: [0.36, 0.42], shape: "cone", bend: -0.2, crook: 0.12, thickness: 0.3, sides: 3, segments: 3 },
        branches: null,
        leaves: { size: [1.2, 1.55], perBranch: 7, from: 0.05, flat: true },
        foot: { flare: 0.6, roots: [4, 5], reach: [0.5, 0.8], tint: [0.62, 0.64, 0.5] },
        bark: "spruce",
    },
    poplar: {
        height: [9.5, 12],
        trunk: { radius: 0.25, reach: 1, taper: 0.15, lean: 0.02, crook: 0.05 },
        boughs: { count: [16, 20], from: 0.12, to: 0.97, angle: [16, 28], length: [0.16, 0.22], shape: "column", bend: 0.2, crook: 0.15, thickness: 0.3, sides: 4 },
        branches: { count: [2, 3], from: 0.35, angle: [18, 30], length: [0.4, 0.6], bend: 0.2, crook: 0.2 },
        leaves: { size: [1.25, 1.6], perBranch: 7, from: 0.1 },
        foot: { flare: 0.55, roots: [3, 4], reach: [0.45, 0.7], tint: [0.64, 0.66, 0.54] },
        bark: "poplar",
    },
    apple: {
        height: [4.2, 5.2],
        trunk: { radius: 0.15, reach: 0.4, taper: 0.55, lean: 0.12, crook: 0.3 },
        boughs: { count: [5, 7], from: 0.55, to: 1, angle: [45, 65], length: [0.45, 0.6], shape: "spread", bend: 0.1, crook: 0.55, thickness: 0.65 },
        branches: { count: [3, 5], from: 0.2, angle: [35, 60], length: [0.45, 0.65], bend: 0.06, crook: 0.45 },
        leaves: { size: [1.1, 1.4], perBranch: 8, from: 0.1 },
        foot: { flare: 0.5, roots: [3, 4], reach: [0.35, 0.55], tint: [0.6, 0.62, 0.5] },
        bark: "apple",
    },

    // Each people's own (core/setpieces/pieces.js HOME_TREES). The cat folk's acacia: a short trunk
    // forking into a few climbing limbs, spreading out level at the top in a flat umbrella
    acacia: {
        height: [5.5, 7],
        trunk: { radius: 0.24, reach: 0.5, taper: 0.45, lean: 0.12, crook: 0.3 },
        boughs: { count: [7, 9], from: 0.85, to: 1, angle: [55, 75], length: [0.45, 0.58], shape: "column", bend: 0.1, crook: 0.35, thickness: 0.5 },
        branches: null,
        leaves: { size: [1.6, 2], perBranch: 9, from: 0.7, flat: true },
        foot: { flare: 0.5, roots: [3, 4], reach: [0.4, 0.6], tint: [0.66, 0.62, 0.52] },
        bark: "acacia",
    },
    // The orcs' ironbark: a squat, blasted, twisted thing, a few rust-red leaves left on it
    ironbark: {
        height: [5, 6.5],
        trunk: { radius: 0.36, reach: 0.75, taper: 0.55, lean: 0.14, crook: 0.4 },
        boughs: { count: [4, 6], from: 0.4, to: 0.95, angle: [40, 75], length: [0.3, 0.45], shape: "spread", bend: 0.14, crook: 0.8, thickness: 0.55 },
        branches: { count: [2, 3], from: 0.3, angle: [35, 70], length: [0.4, 0.6], bend: 0.18, crook: 0.8 },
        leaves: { size: [0.9, 1.2], perBranch: 3, from: 0.55 },
        foot: { flare: 0.9, roots: [4, 6], reach: [0.6, 0.9], tint: [0.55, 0.5, 0.48] },
        bark: "ironbark",
    },
    // The lizard folk's willow: a stout trunk, its boughs arching out and its long twigs hanging
    // down all round in curtains
    willow: {
        height: [7, 9],
        trunk: { radius: 0.32, reach: 0.5, taper: 0.4, lean: 0.1, crook: 0.2 },
        boughs: { count: [7, 9], from: 0.5, to: 1, angle: [30, 55], length: [0.32, 0.42], shape: "dome", bend: 0.02, crook: 0.3, thickness: 0.55 },
        branches: { count: [5, 7], from: 0.25, angle: [25, 50], length: [0.7, 1], bend: -0.9, crook: 0.1 },
        leaves: { size: [1.3, 1.7], perBranch: 7, from: 0.2 },
        foot: { flare: 0.9, roots: [5, 7], reach: [0.7, 1], tint: [0.5, 0.58, 0.44] },
        bark: "willow",
    },
    // The elves' silverbark: tall and straight, its bark pale as birch without the black, its
    // leaves gold-green
    silverbark: {
        height: [11, 14],
        trunk: { radius: 0.22, reach: 0.93, taper: 0.3, lean: 0.03, crook: 0.05 },
        boughs: { count: [10, 12], from: 0.38, to: 0.97, angle: [26, 44], length: [0.26, 0.34], shape: "oval", bend: 0.06, crook: 0.15, thickness: 0.42 },
        branches: { count: [3, 4], from: 0.3, angle: [25, 45], length: [0.45, 0.6], bend: 0.04, crook: 0.2 },
        leaves: { size: [1.6, 2], perBranch: 6, from: 0.15 },
        foot: { flare: 0.9, roots: [5, 7], reach: [0.7, 1], tint: [0.72, 0.74, 0.7] },
        bark: "silverbark",
    },
    // The dark elves' nightspire: a spruce's tiers, taller and narrower, black, its needles violet
    nightspire: {
        height: [9, 11.5],
        trunk: { radius: 0.24, reach: 1, taper: 0.1, lean: 0.03, crook: 0.05 },
        boughs: { count: [49, 63], whorl: 7, from: 0.1, to: 0.97, angle: [70, 95], length: [0.24, 0.3], shape: "cone", bend: -0.3, crook: 0.14, thickness: 0.3, sides: 3, segments: 3 },
        branches: null,
        leaves: { size: [1.1, 1.45], perBranch: 7, from: 0.05, flat: true },
        foot: { flare: 0.6, roots: [4, 5], reach: [0.5, 0.8], tint: [0.5, 0.48, 0.55] },
        bark: "nightspire",
    },
});

/** The kinds, in the order of their pictures across the bark and the leaves' pictures. */
export const KINDS = Object.freeze(Object.keys(SPECIES));

/**
 * The trees there are ([kind, seed]): each kind grown several ways, the broadleaved ones more
 * often than the rest (core/setpieces/pieces.js TREE_KINDS, so the world's rules can choose them
 * by kind).
 */
export const VARIANTS = TREE_KINDS;

// How finely wood is made: sides round, and segments along, a trunk, a bough and a branch
// (a kind's boughs can be finer: `sides`, `segments`)
const ROUND = [7, 4, 3];
const SEGMENTS = [7, 3, 2];

// How far up the bark's pattern repeats (metres; it goes once round each limb)
const BARK_REPEAT = 1.6;

// How low a bough or a spray of leaves comes to the ground (metres)
const GROUND_CLEAR = 0.2;

// A trunk's foot: how far round it's made (sides), the heights of its rings (metres; below the
// ground too, so there's no edge where it stands), and how high it swells out (at most, metres;
// less up a short trunk); and how high up the bark is darker and mossy (metres)
const FOOT_SIDES = 12;
const FOOT_RINGS = [-0.2, 0, 0.1, 0.3];
const FOOT_TOP = 0.75;
const MOSS_HEIGHT = 1.1;

// A crown's shell (what casts its shadow): how far round each of its corners it reaches out to
// the leaves (cos of the angle), and how low it comes (metres; not into the ground, where the
// ground inside it would be lit)
const SHELL_CONE = Math.cos((32 * Math.PI) / 180);
const SHELL_FOOT = 0.15;

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
function limb(random, { from, direction, length, radius, taper, segments, bend, crook }) {
    const points = [from.clone()];
    const radii = [radius];
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

        radii.push(radius * (1 - (1 - taper) * t));
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
 * Grow a tree of a kind (SPECIES) from a seed: { height, wood: { position, normal, uv, color,
 * index }, leaves: { position, normal, uv, color, index }, crown: { centre, radius }, shell:
 * { position, index } (the crown's, which casts its shadow), patch: { radius } (of the earth
 * and fallen leaves round its foot) } (arrays; metres).
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
    const stem = limb(random, { from: new THREE.Vector3(), direction: lean, length: height * trunk.reach, radius: trunk.radius * (height / 10), taper: trunk.taper, segments: SEGMENTS[0], bend: 0, crook: trunk.crook });

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
    const leaves = cards(random, species, tips, height, cell);

    // The foot and roots (from their own seed, so they change nothing above them)
    const foot = rootedFoot(createRandom(seed * 7919 + kind.length * 104729 + 1), species, stem, cell);
    const wood = tubes([...limbs, ...foot.roots], cell);

    join(wood, foot.geometry);
    wood.color = [];

    for (let k = 1; k < wood.position.length; k += 3) {
        const y = wood.position[k];
        const clean = Math.min(1, Math.max(0, y / MOSS_HEIGHT)) ** 0.7;

        wood.color.push(...species.foot.tint.map((share) => share + (1 - share) * clean));
    }

    return { height, wood, leaves: leaves.geometry, crown: leaves.crown, shell: leaves.shell, patch: { radius: foot.patch } };
}

// The wood: each limb a tube (squashed lower than it's wide, by `squash`), its bark's pattern (the
// kind's, `cell` across the bark's picture) running up it
function tubes(limbs, cell) {
    const position = [];
    const normal = [];
    const uv = [];
    const index = [];
    const frame = { n: new THREE.Vector3(), b: new THREE.Vector3(), t: new THREE.Vector3() };

    for (const { points, radii, level, sides: finer, squash = 1 } of limbs) {
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

                // (Lower than it's wide, if squashed: a root along the ground)
                const up = Math.hypot(nx, ny / squash, nz);

                position.push(points[k].x + nx * radii[k], points[k].y + ny * radii[k] * squash, points[k].z + nz * radii[k]);
                normal.push(nx / up, ny / squash / up, nz / up);
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

// Add one geometry's arrays ({ position, normal, uv, index }) to another's
function join(into, from) {
    const first = into.position.length / 3;

    into.position.push(...from.position);
    into.normal.push(...from.normal);
    into.uv.push(...from.uv);
    into.index.push(...from.index.map((k) => k + first));
}

// A trunk's foot, swelling out into buttresses where it meets the ground, one over each root, and
// on down into it; and the roots, running out from the buttresses over the ground and into it:
// { geometry: { position, normal, uv, index }, roots (limbs, for tubes), patch (how far round
// it the earth is bare, metres) }
function rootedFoot(random, species, stem, cell) {
    const { foot } = species;
    const count = random.int(...foot.roots);
    const start = random.next() * Math.PI * 2;
    const lobes = Array.from({ length: count }, (_, k) => ({
        angle: start + ((k + (random.next() - 0.5) * 0.6) / count) * Math.PI * 2,
        strength: 0.6 + 0.4 * random.next(),
        reach: random.range(...foot.reach),
    }));
    const top = Math.min(FOOT_TOP, stem.length * 0.4);
    const heights = [...FOOT_RINGS, top];

    // Round the trunk as tubes() goes round it, so the bark's pattern carries on up
    const axis = stem.points[1].clone().sub(stem.points[0]).normalize();
    const n = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? _a.set(1, 0, 0) : _a.set(0, 1, 0)).normalize();
    const b = new THREE.Vector3().crossVectors(axis, n).normalize();

    // Swelling out towards the ground (all round, and more over each root), to nothing at the top
    const low = (h) => {
        const s = Math.min(1, Math.max(0, h / top));

        return 1 - s * s * (3 - 2 * s);
    };
    const lobe = (angle) => lobes.reduce((sum, { angle: at, strength }) => sum + strength * Math.max(0, Math.cos(angle - at)) ** 4, 0);
    const radius = (angle, h) => radiusAt(stem, Math.max(0, h) / stem.length) * (1.015 + 0.45 * foot.flare * low(h) ** 2 + foot.flare * low(h) ** 2 * lobe(angle));
    const centre = (h) => (h < 0 ? stem.points[0].clone().addScaledVector(axis, h) : along(stem, h / stem.length).point);
    const position = [];
    const normal = [];
    const uv = [];
    const index = [];
    const out = new THREE.Vector3();
    const around = new THREE.Vector3();
    const facing = new THREE.Vector3();

    heights.forEach((h, k) => {
        const [below, above] = [heights[Math.max(0, k - 1)], heights[Math.min(heights.length - 1, k + 1)]];
        const middle = centre(h);

        for (let s = 0; s <= FOOT_SIDES; s++) {
            const angle = (s / FOOT_SIDES) * Math.PI * 2;
            const r = radius(angle, h);

            out.copy(n).multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle));
            around.copy(n).multiplyScalar(-Math.sin(angle)).addScaledVector(b, Math.cos(angle));
            position.push(middle.x + out.x * r, middle.y + out.y * r, middle.z + out.z * r);

            // Leaning back as it spreads (up the slope of the foot, and to the sides of a ridge)
            const slope = (radius(angle, above) - radius(angle, below)) / (above - below);
            const side = (radius(angle + 0.05, h) - radius(angle - 0.05, h)) / (0.1 * r);

            facing.copy(out).addScaledVector(axis, -slope).addScaledVector(around, -side).normalize();
            normal.push(facing.x, facing.y, facing.z);
            uv.push((cell + 0.04 + 0.92 * (s / FOOT_SIDES)) / KINDS.length, h / BARK_REPEAT);
        }
    });

    for (let k = 0; k < heights.length - 1; k++) {
        for (let s = 0; s < FOOT_SIDES; s++) {
            const a = k * (FOOT_SIDES + 1) + s;
            const c = a + FOOT_SIDES + 1;

            index.push(a, c, a + 1, a + 1, c, c + 1);
        }
    }

    // The roots: each on down from its buttress, as one spur, broad and low along the ground (the
    // top of it showing, as a ridge in the earth), then steeply down into it while still thick
    // (going in gently, a root would show as a long thin point, like a claw)
    const base = stem.radii[0] * (1.015 + 0.45 * foot.flare);
    const roots = lobes.map(({ angle, strength, reach }) => {
        const way = n.clone().multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle)).setY(0).normalize();
        const side = new THREE.Vector3(-way.z, 0, way.x);
        const at = (distance, y, aside) => stem.points[0].clone().addScaledVector(way, distance).addScaledVector(side, aside).setY(y);
        const thick = stem.radii[0] * 0.6 * strength * (0.75 + 0.5 * foot.flare);
        const wander = () => (random.next() - 0.5) * 0.25 * reach;
        const radii = [thick * 1.15, thick * 0.9, thick * 0.7, thick * 0.6];

        return {
            points: [
                at(base * 0.45, Math.min(top * 0.5, stem.radii[0] * 1.3), 0),
                at(base + 0.25 * reach, 0.4 * thick, wander()),
                at(base + 0.55 * reach, 0.05 * thick, wander()),
                at(base + 0.68 * reach, -1.5 * thick, wander()),
            ],
            radii,
            level: 2,
            sides: 6,
            squash: 0.7,
        };
    });
    const patch = Math.min(2.4, base * 2 + 0.75 * Math.max(...lobes.map(({ reach }) => reach)));

    return { geometry: { position, normal, uv, index }, roots, patch };
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

    return {
        geometry: { position, normal, uv, color, index },
        crown: { centre: centre.toArray(), radius: radius.toArray() },
        shell: crownShell(placed.map((card) => card.centre), centre, radius),
    };
}

let ball = null;

// The shell round a crown, for its shadow: an icosphere's corners pushed out from the crown's
// middle as far as the cards' middles reach that way (a spruce's comes to a point, a poplar's is
// tall and narrow, a pine's sits on its bare trunk), smoothed with their neighbours:
// { position, index } (metres)
function crownShell(middles, centre, radius) {
    if (!ball) {
        const sphere = new THREE.IcosahedronGeometry(1, 2);

        sphere.deleteAttribute("normal");
        sphere.deleteAttribute("uv");

        const merged = mergeVertices(sphere);
        const corners = merged.getAttribute("position");
        const index = [...merged.getIndex().array];
        const neighbours = Array.from({ length: corners.count }, () => new Set());

        for (let k = 0; k < index.length; k += 3) {
            for (let j = 0; j < 3; j++) {
                neighbours[index[k + j]].add(index[k + ((j + 1) % 3)]).add(index[k + ((j + 2) % 3)]);
            }
        }

        ball = { directions: Array.from({ length: corners.count }, (_, k) => new THREE.Vector3().fromBufferAttribute(corners, k)), index, neighbours: neighbours.map((set) => [...set]) };
    }

    // The cards' middles as if the crown were round (a share of its radius each way)
    const out = middles.map((middle) => middle.clone().sub(centre).divide(radius));
    const reach = ball.directions.map((direction) => {
        let most = 0.3;

        for (const to of out) {
            const along = to.dot(direction);

            if (along > SHELL_CONE * to.length()) {
                most = Math.max(most, along);
            }
        }

        return most;
    });
    const smooth = reach.map((most, k) => 0.5 * most + (0.5 * ball.neighbours[k].reduce((sum, j) => sum + reach[j], 0)) / ball.neighbours[k].length);
    const position = [];

    ball.directions.forEach((direction, k) => {
        const corner = direction.clone().multiplyScalar(smooth[k]).multiply(radius).add(centre);

        position.push(corner.x, Math.max(SHELL_FOOT, corner.y), corner.z);
    });

    return { position, index: [...ball.index] };
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
    // (The peoples' own, patterned as one of those)
    acacia: { base: "#6e6152", dark: "#342a20", light: "#8e8070", pattern: "oak" },
    ironbark: { base: "#3b3431", dark: "#161211", light: "#5d514b", pattern: "oak" },
    willow: { base: "#5b5243", dark: "#2c261e", light: "#7a6f5c", pattern: "oak" },
    silverbark: { base: "#cfd2cb", dark: "#8c948f", light: "#eceee8", pattern: "beech" },
    nightspire: { base: "#2c2630", dark: "#110d14", light: "#4a4054", pattern: "spruce" },
};

// A kind's bark, 128 by 256 pixels, repeating up it
function barkPicture(context, kind) {
    const [width, height] = [128, 256];
    const random = createRandom(kind.length * 31 + kind.charCodeAt(0));
    const colours = BARKS[kind];
    const pattern = colours.pattern ?? kind;

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

    if (pattern === "oak" || pattern === "poplar" || pattern === "apple") {
        // Deep furrows between ridges, running up and meeting
        for (let k = 0; k < (pattern === "oak" ? 26 : 16); k++) {
            const x = (k / (pattern === "oak" ? 26 : 16)) * width + random.next() * 6;
            let y = random.next() * height;
            const points = [];

            for (let j = 0; j < 7; j++) {
                points.push([x + (random.next() - 0.5) * 10, y]);
                y += 20 + random.next() * 30;
            }

            context.strokeStyle = colours.dark;
            context.lineWidth = pattern === "oak" ? 3 + random.next() * 3 : 2 + random.next() * 2;
            wrapped(context, width, height, () => {
                context.beginPath();
                points.forEach(([px, py], j) => (j ? context.lineTo(px, py) : context.moveTo(px, py)));
                context.stroke();
            });
        }
    } else if (pattern === "birch") {
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
    } else if (pattern === "pine" || pattern === "spruce") {
        // Plates (a pine's orange, a spruce's small scales), cracked apart
        const [across, up] = pattern === "pine" ? [4, 7] : [7, 16];

        for (let row = 0; row < up; row++) {
            for (let column = 0; column < across; column++) {
                // Each plate its own size, a little out of line with its neighbours
                const [w, h] = [(width / across) * (0.75 + random.next() * 0.45), (height / up) * (0.65 + random.next() * 0.7)];
                const x = column * (width / across) + (row % 2) * (width / across) * 0.5 + (random.next() - 0.5) * 8;
                const y = row * (height / up) + (random.next() - 0.5) * 14;

                context.fillStyle = random.chance(0.5) ? colours.light : colours.base;
                context.strokeStyle = colours.dark;
                context.lineWidth = pattern === "pine" ? 3 : 2;
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
    acacia: { greens: ["#4e5e26", "#687a30", "#869640"], shape: "oval", length: [14, 20], count: 110 },
    ironbark: { greens: ["#4a2014", "#6e2e18", "#8e4a22"], shape: "toothed", length: [24, 34], count: 20 },
    willow: { greens: ["#4c6420", "#6a8428", "#8ea43a"], shape: "narrow", length: [40, 56], count: 60 },
    silverbark: { greens: ["#6e8c46", "#a6bc6a", "#d8cf86"], shape: "oval", length: [38, 50], count: 34 },
    nightspire: { greens: ["#221e2a", "#312a3e", "#473b5a"], needles: "spray" },
};

// One leaf, its stalk at (0, 0), pointing up the y axis (negative), `length` long
function leaf(context, shape, length, fill, vein) {
    const w = length * (shape === "toothed" ? 0.62 : shape === "heart" ? 0.8 : shape === "lobed" ? 0.55 : shape === "narrow" ? 0.24 : 0.5);

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
        // An oval (beech, apple), a narrow blade (willow) or a heart (poplar), pointed at the tip
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

// What lies round each kind's foot: fallen leaves (their colours, and how long, pixels of 128),
// or needles and cones; an apple tree's windfalls
const LITTER = {
    oak: { leaves: ["#5e4a30", "#6e5636", "#4e3e28", "#7a603c"], size: 8 },
    beech: { leaves: ["#74482c", "#865634", "#5e3c26", "#946440"], size: 7 },
    birch: { leaves: ["#8a7436", "#7a6c38", "#96803e", "#5e5430"], size: 5 },
    pine: { needles: ["#7a5634", "#86603a", "#5e452c"], cones: "#4e3420" },
    spruce: { needles: ["#5e4630", "#6a5036", "#4e3c28"], cones: "#44301e" },
    poplar: { leaves: ["#847438", "#6e6434", "#5a5630", "#907e44"], size: 6 },
    apple: { leaves: ["#646036", "#72683a", "#52502e"], size: 6, fruit: ["#8a3226", "#a08036"] },
    acacia: { leaves: ["#8a7a40", "#9a8a4a", "#6e6434"], size: 3 },
    ironbark: { leaves: ["#3a2a22", "#4a2a1e", "#2a2220"], size: 6 },
    willow: { leaves: ["#7a7038", "#6a6232", "#8a7a3e"], size: 6 },
    silverbark: { leaves: ["#c8a848", "#b89a40", "#d8c070", "#a08a3c"], size: 7 },
    nightspire: { needles: ["#3a3044", "#2c2434", "#4a3c56"], cones: "#1e1822" },
};

// The patch round a tree's foot, seen from above, fading out at its edge: bare earth, moss, and
// what's fallen from the tree
function litterPicture(context, kind) {
    const random = createRandom(kind.charCodeAt(1) * 31 + kind.length);
    const litter = LITTER[kind];
    const size = 128;
    const middle = size / 2;
    // A spot round the middle, thinning out further out (0: the middle, 1: the edge)
    const spot = (most = 1) => {
        const r = most * Math.sqrt(random.next()) * (size * 0.46);
        const a = random.next() * Math.PI * 2;

        return [middle + Math.cos(a) * r, middle + Math.sin(a) * r, r / (size * 0.46)];
    };

    // Earth, darkest by the trunk, in blotches so its edge is ragged
    for (let k = 0; k < 200; k++) {
        const [x, y, out] = spot();

        context.fillStyle = `rgba(${58 + random.int(0, 16)}, ${46 + random.int(0, 12)}, ${30 + random.int(0, 8)}, ${0.13 * (1 - out) ** 1.5})`;
        context.beginPath();
        context.arc(x, y, 6 + random.next() * 12, 0, Math.PI * 2);
        context.fill();
    }

    // Moss, further out
    for (let k = 0; k < 40; k++) {
        const [x, y, out] = spot(0.9);

        context.fillStyle = `rgba(${66 + random.int(0, 20)}, ${88 + random.int(0, 24)}, 38, ${0.3 * (1 - out)})`;
        context.beginPath();
        context.arc(x, y, 3 + random.next() * 6, 0, Math.PI * 2);
        context.fill();
    }

    // What's fallen
    context.lineCap = "round";

    if (litter.needles) {
        for (let k = 0; k < 420; k++) {
            const [x, y, out] = spot(0.95);
            const a = random.next() * Math.PI * 2;
            const length = 4 + random.next() * 4;

            context.strokeStyle = litter.needles[random.int(0, litter.needles.length - 1)];
            context.globalAlpha = 0.7 * (1 - out * out);
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + Math.cos(a) * length, y + Math.sin(a) * length);
            context.stroke();
        }

        for (let k = 0; k < 5; k++) {
            const [x, y] = spot(0.7);

            context.globalAlpha = 1;
            context.fillStyle = litter.cones;
            context.beginPath();
            context.ellipse(x, y, 4.5, 2.6, random.next() * Math.PI, 0, Math.PI * 2);
            context.fill();
        }
    } else {
        for (let k = 0; k < 90; k++) {
            const [x, y, out] = spot();
            const long = litter.size * (0.7 + random.next() * 0.6);

            context.fillStyle = litter.leaves[random.int(0, litter.leaves.length - 1)];
            context.globalAlpha = 0.7 * (1 - out * out);
            context.beginPath();
            context.ellipse(x, y, long / 2, long / 4, random.next() * Math.PI, 0, Math.PI * 2);
            context.fill();
        }

        for (const colour of litter.fruit ?? []) {
            const [x, y] = spot(0.8);

            context.globalAlpha = 1;
            context.fillStyle = colour;
            context.beginPath();
            context.arc(x, y, 3.2, 0, Math.PI * 2);
            context.fill();
        }
    }

    context.globalAlpha = 1;
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

/**
 * The trees' materials: { bark, leaves, litter (round their feet) }, every kind's pictures side
 * by side on each; and the crowns' shells', which cast their shadows but are never seen:
 * { shadows, dapple } (dapple: the shadows' own, `customDepthMaterial`).
 */
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
        const bark = new THREE.MeshLambertMaterial({ name: "bark", color: drawn ? 0xffffff : 0x5d4a3d, map: drawn ? texture(atlas(128, 256, (context, kind) => barkPicture(context, SPECIES[kind].bark)), true) : null, vertexColors: true });
        const leaves = new THREE.MeshLambertMaterial({
            name: "leaves",
            color: drawn ? 0xffffff : 0x4a7a29,
            map: drawn ? texture(atlas(256, 256, foliagePicture), false) : null,
            vertexColors: true,
            alphaTest: 0.45,
            // (Soft-edged where the picture's drawn multisampled, as the hair is; a plain cut-out
            // at the same edge where it isn't)
            alphaToCoverage: true,
            side: THREE.DoubleSide,
        });

        bark.shadowSide = THREE.DoubleSide;

        // Seen from behind, a card's leaves are lit as from in front (as the crown is), not dark;
        // and they stir in the breeze, each part of a crown in its own time, more the higher up
        leaves.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, { windTime: TREE_WIND.time, windSway: TREE_WIND.sway });
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nuniform float windTime;\nuniform float windSway;")
                .replace("#include <begin_vertex>", `#include <begin_vertex>
{
    vec4 windLocal = vec4(position, 1.0);
#ifdef USE_BATCHING
    windLocal = batchingMatrix * windLocal;
#endif
    vec3 windAt = (modelMatrix * windLocal).xyz;
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

        // A shell is drawn only into the sun's shadows (shadowOnly), and there by its far side, so a
        // crown's leaves, inside it, aren't in its shadow
        const shadows = new THREE.MeshBasicMaterial({ name: "crown shadows", colorWrite: false, depthWrite: false });

        // Into the shadows, a shell is drawn with holes in it, as sunlight comes through a crown
        // (bigger and more of them towards its edge as the sun sees it, where the leaves are
        // thinner), so its shadow is dappled, with a broken edge
        const dapple = new THREE.MeshDepthMaterial();

        dapple.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vDappleAt;\nvarying float vDappleFacing;").replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
vDappleAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDappleFacing = abs(normalize(mat3(modelViewMatrix) * normal).z);`,
            );
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    "#include <common>",
                    `#include <common>
varying vec3 vDappleAt;
varying float vDappleFacing;

float dappleHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float dappleNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(dappleHash(i), dappleHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(dappleHash(i + vec3(0.0, 1.0, 0.0)), dappleHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
        mix(mix(dappleHash(i + vec3(0.0, 0.0, 1.0)), dappleHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(dappleHash(i + vec3(0.0, 1.0, 1.0)), dappleHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
        f.z
    );
}`,
                )
                .replace(
                    "#include <clipping_planes_fragment>",
                    `#include <clipping_planes_fragment>
if (0.5 * dappleNoise(vDappleAt * 1.9) + 0.3 * dappleNoise(vDappleAt * 4.7) + 0.2 * dappleNoise(vDappleAt * 11.0) > mix(0.38, 0.74, vDappleFacing)) discard;`,
                );
        };
        dapple.customProgramCacheKey = () => "crown dapple";

        // The earth and fallen leaves round each foot, laid over the ground (drawn over it, and
        // fading into it)
        const litter = new THREE.MeshLambertMaterial({
            name: "litter",
            color: drawn ? 0xffffff : 0x4a3a28,
            map: drawn ? texture(atlas(128, 128, litterPicture), false) : null,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -4,
        });

        materials = { bark, leaves, litter, shadows, dapple };
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

// A variant's wood, leaves and crown's shell, grown once: { kind, wood, leaves, shell }
// (BufferGeometry, metres), and how far round its foot the earth is bare (patch, metres)
function grownGeometry(variant) {
    const index = ((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;

    if (!grown.has(index)) {
        const [kind, seed] = VARIANTS[index];
        const tree = growTree(kind, seed);

        const shell = new THREE.BufferGeometry();

        shell.setAttribute("position", new THREE.Float32BufferAttribute(tree.shell.position, 3));
        shell.setIndex(tree.shell.index);
        shell.computeVertexNormals();
        grown.set(index, { kind, wood: geometryOf(tree.wood), leaves: geometryOf(tree.leaves), shell, patch: tree.patch.radius });
    }

    return grown.get(index);
}

// The patches of earth and fallen leaves round trees' feet ([{ x, z, turn, radius, kind }],
// metres), a little over the ground, each a square of its kind's picture
function patches(placed) {
    const position = [];
    const normal = [];
    const uv = [];
    const index = [];

    for (const { x, z, turn, radius, kind } of placed) {
        const first = position.length / 3;
        const cell = KINDS.indexOf(kind);

        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
            const [a, b] = [(u - 0.5) * 2 * radius, (v - 0.5) * 2 * radius];

            position.push(x + a * Math.cos(turn) + b * Math.sin(turn), 0.01, z - a * Math.sin(turn) + b * Math.cos(turn));
            normal.push(0, 1, 0);
            uv.push((cell + u) / KINDS.length, v);
        }

        index.push(first, first + 2, first + 1, first, first + 3, first + 2);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);

    return geometry;
}

// Laid on the ground (so not cut away in front of the player: town3d.js), and never casting a
// shadow
function onGround(mesh) {
    mesh.receiveShadow = true;
    mesh.userData.onGround = true;
    mesh.renderOrder = -1;
}

// A crown's shell (or all of them) is drawn only into the sun's shadows: Three.js draws those
// first, then the view, where it's drawn as none of its triangles
function shadowOnly(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.customDepthMaterial = treeMaterials().dapple;
    mesh.onBeforeShadow = () => mesh.geometry.setDrawRange(0, Infinity);
    mesh.onBeforeRender = () => mesh.geometry.setDrawRange(0, 0);
}

/**
 * A tree (a VARIANTS index): a Group in metres, its trunk's foot at (0, 0, 0), the wood, the
 * leaves, the crown's shell (casting the crown's shadow) and the patch round its foot sharing
 * the trees' materials; grown once for each variant, copied after.
 */
export function treeObject(variant) {
    const { kind, wood, leaves, shell, patch } = grownGeometry(variant);
    const { bark, leaves: foliage, litter, shadows } = treeMaterials();
    const group = new THREE.Group();
    const parts = [new THREE.Mesh(wood, bark), new THREE.Mesh(leaves, foliage), new THREE.Mesh(shell, shadows), new THREE.Mesh(patches([{ x: 0, z: 0, turn: 0, radius: patch, kind }]), litter)];

    group.name = `tree-${kind}`;
    group.add(...parts);
    parts[0].castShadow = true;
    parts[0].receiveShadow = true;
    parts[1].receiveShadow = true;
    shadowOnly(parts[2]);
    onGround(parts[3]);

    return group;
}

/**
 * Plant trees: [{ x, z (their trunks' feet, metres), variant, size (1: as grown), turn (radians
 * about the trunk) }], merged a `tile` metres square of the map at a time (the tiles out of view
 * aren't drawn), and the crowns' shells (casting their shadows) and the patches round their feet
 * all together: { object (a Group of the meshes), boxes (each tree's Box3 above the ground, in
 * order) }.
 */
export function plantTrees(placements, { tile = 24 } = {}) {
    const tiles = new Map();
    const boxes = [];
    const matrix = new THREE.Matrix4();
    const turned = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const at = new THREE.Vector3();
    const shells = [];
    const grounds = [];

    for (const { x, z, variant, size = 1, turn = 0 } of placements) {
        const { kind, wood, leaves, shell, patch } = grownGeometry(variant);
        const key = `${Math.floor(x / tile)},${Math.floor(z / tile)}`;

        matrix.compose(at.set(x, 0, z), turned.setFromAxisAngle(UP, turn), scale.setScalar(size));

        const parts = [wood.clone().applyMatrix4(matrix), leaves.clone().applyMatrix4(matrix)];
        const box = new THREE.Box3();

        for (const part of parts) {
            part.computeBoundingBox();
            box.union(part.boundingBox);
        }

        box.min.y = Math.max(0, box.min.y);
        boxes.push(box);

        if (!tiles.has(key)) {
            tiles.set(key, { wood: [], leaves: [] });
        }

        tiles.get(key).wood.push(parts[0]);
        tiles.get(key).leaves.push(parts[1]);
        shells.push(shell.clone().applyMatrix4(matrix));
        grounds.push({ x, z, turn, radius: patch * size, kind });
    }

    const { bark, leaves, litter, shadows } = treeMaterials();
    const object = new THREE.Group();

    object.name = "trees";

    for (const [key, parts] of tiles) {
        for (const [geometries, material] of [[parts.wood, bark], [parts.leaves, leaves]]) {
            const mesh = new THREE.Mesh(mergeGeometries(geometries), material);

            mesh.name = `${material.name} ${key}`;
            mesh.castShadow = material !== leaves;
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false;
            object.add(mesh);
        }
    }

    // (Few enough triangles that drawing the shells out of the sun's view costs nothing)
    if (shells.length) {
        const cast = new THREE.Mesh(mergeGeometries(shells), shadows);

        cast.name = shadows.name;
        cast.matrixAutoUpdate = false;
        shadowOnly(cast);
        object.add(cast);

        const floor = new THREE.Mesh(patches(grounds), litter);

        floor.name = litter.name;
        floor.matrixAutoUpdate = false;
        onGround(floor);
        object.add(floor);
    }

    return { object, boxes };
}

// How much room the woodland's batches start with: trees, and the vertices and indices of the
// variants grown (each grows as more is needed)
const WOODLAND = Object.freeze({ trees: 2048, vertices: 48000, indices: 96000 });

const _matrix = new THREE.Matrix4();
const _turned = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _at = new THREE.Vector3();

/**
 * Trees planted and felled a lot at a time, as the world outside is drawn round the player
 * (world/chunks3d.js): each variant kept once and drawn wherever it's planted (Three.js's
 * BatchedMesh), the wood in one draw call and the leaves in another, only the trees in view
 * (and, into the sun's shadows, only those in its); the crowns' shells and the patches round
 * their feet merged a lot at a time, as plantTrees merges them.
 */
export class Woodland {
    constructor() {
        const { bark, leaves } = treeMaterials();

        this.wood = new THREE.BatchedMesh(WOODLAND.trees, WOODLAND.vertices, WOODLAND.indices, bark);
        this.leaves = new THREE.BatchedMesh(WOODLAND.trees, WOODLAND.vertices, WOODLAND.indices, leaves);
        this.wood.name = "woodland bark";
        this.leaves.name = "woodland leaves";

        for (const batch of [this.wood, this.leaves]) {
            batch.userData.room = { vertices: WOODLAND.vertices, indices: WOODLAND.indices };

            // (Each tree is culled on its own; the whole woodland never is)
            batch.frustumCulled = false;
            batch.receiveShadow = true;
            batch.matrixAutoUpdate = false;
        }

        this.wood.castShadow = true;

        // Each variant's geometry in the batches ([wood, leaves] ids), and its box
        this.variants = new Map();
        this.planted = 0;
        this.object = new THREE.Group();
        this.object.name = "woodland";
        this.object.add(this.wood, this.leaves);
    }

    /**
     * Plant a lot of trees: [{ x, z (their trunks' feet, metres), variant, size, turn }]. Returns
     * the lot: { object (a Group of their shells and the patches round their feet, to add to the
     * scene), boxes (each tree's Box3 above the ground, in order), ids }.
     */
    plant(placements) {
        const shells = [];
        const grounds = [];
        const boxes = [];
        const ids = [];

        this.#room(placements.length);

        for (const { x, z, variant, size = 1, turn = 0 } of placements) {
            const { wood, leaves, box } = this.#variant(variant);
            const { kind, shell, patch } = grownGeometry(variant);

            _matrix.compose(_at.set(x, 0, z), _turned.setFromAxisAngle(UP, turn), _scale.setScalar(size));

            const pair = [this.wood.addInstance(wood), this.leaves.addInstance(leaves)];

            this.wood.setMatrixAt(pair[0], _matrix);
            this.leaves.setMatrixAt(pair[1], _matrix);
            ids.push(pair);

            const placed = box.clone().applyMatrix4(_matrix);

            placed.min.y = Math.max(0, placed.min.y);
            boxes.push(placed);
            shells.push(shell.clone().applyMatrix4(_matrix));
            grounds.push({ x, z, turn, radius: patch * size, kind });
        }

        this.planted += placements.length;

        const object = new THREE.Group();
        const { litter, shadows } = treeMaterials();

        object.name = "woodland lot";

        if (shells.length) {
            const cast = new THREE.Mesh(mergeGeometries(shells), shadows);

            cast.name = shadows.name;
            cast.matrixAutoUpdate = false;
            shadowOnly(cast);

            const floor = new THREE.Mesh(patches(grounds), litter);

            floor.name = litter.name;
            floor.matrixAutoUpdate = false;
            onGround(floor);
            object.add(cast, floor);
        }

        return { object, boxes, ids };
    }

    /** Fell a lot of trees (plant's): gone from the batches, and its shells and patches thrown away. */
    fell(lot) {
        for (const [wood, leaves] of lot.ids) {
            this.wood.deleteInstance(wood);
            this.leaves.deleteInstance(leaves);
        }

        this.planted -= lot.ids.length;
        lot.ids = [];
        lot.object.removeFromParent();
        lot.object.traverse((node) => node.geometry?.dispose());
    }

    /** Let go of everything on the GPU (the batches: the materials are shared). */
    dispose() {
        this.wood.dispose();
        this.leaves.dispose();
    }

    // A variant's wood and leaves in the batches (added the first time it's planted, the batches
    // made bigger if they're full), and its box
    #variant(variant) {
        const index = ((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;

        if (!this.variants.has(index)) {
            const { wood, leaves } = grownGeometry(index);
            const box = new THREE.Box3();

            for (const [batch, geometry] of [[this.wood, wood], [this.leaves, leaves]]) {
                const vertices = geometry.attributes.position.count;
                const indices = geometry.index.count;

                if (batch.unusedVertexCount < vertices || batch.unusedIndexCount < indices) {
                    const room = batch.userData.room;

                    room.vertices = Math.max(2 * room.vertices, room.vertices + vertices);
                    room.indices = Math.max(2 * room.indices, room.indices + indices);
                    batch.setGeometrySize(room.vertices, room.indices);
                }

                geometry.computeBoundingBox();
                box.union(geometry.boundingBox);
            }

            this.variants.set(index, { wood: this.wood.addGeometry(wood), leaves: this.leaves.addGeometry(leaves), box });
        }

        return this.variants.get(index);
    }

    // Room in the batches for so many more trees
    #room(more) {
        const needed = this.planted + more;

        if (needed > this.wood.maxInstanceCount) {
            const most = Math.max(needed, 2 * this.wood.maxInstanceCount);

            this.wood.setInstanceCount(most);
            this.leaves.setInstanceCount(most);
        }
    }
}
