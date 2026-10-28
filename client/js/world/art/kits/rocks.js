// Rocks as stone breaks and weathers (the research report "Realistic procedural rock generation"):
// not a ball pushed in and out by noise and cut flat, lit facet by facet, but a few big fracture
// planes joined by edges worn round, quiet noise on top, and dirt, wear, moss and lichen where
// they'd be.
//
// Each rock's shape is a radius for every way out from its middle (`shapeOf`): its stone's joint
// sets (two or three roughly square to each other, each a plane either side, as granite and
// limestone split), a bedding pair for sandstone, many breaks for basalt or scree, none for a
// water-worn cobble, over a squashed core; the planes and the core joined by a smooth minimum
// (exponential, so it doesn't matter which comes first), its width (`round`) how long the rock's
// weathered: a fresh block's edges sharp, a granite corestone's worn round, a corner where three
// planes meet rounder than an edge where two do, as stone weathers. A chip or two knocked off its
// edges, a sandstone's bedding showing as grooves, and noise of a few hundredths of its size.
// Each land's rocks are its stone's (LAND_ROCKS): weathered granite in the green lands, fresh
// jointed granite and scree in the mountains, sandstone slabs on the savannah and the badlands,
// pale limestone on the heath, cobbles on the shore, black basalt in the volcanic lands.
//
// That radius is read at the corners of a ball of triangles divided `detail` times (an
// icosahedron's, made once for each detail and welded: `sphereOf`), so a rock is a few hundred
// triangles near and a hundred or so far, the far one's corners among the near one's (the ball's
// divided in halves, quarters and so on), so the two look alike. Its normals are its faces'
// smoothed where they turn less than its family's crease and kept apart where they turn more:
// a worn rock is lit as one soft mass, a fresh one keeps its edges.
//
// Its colour's baked into its corners, as the atlas multiplies: darker where the sky's hidden
// (its own hollows, and the ground at its foot: `open`, from its shape read a little way out from
// each corner), lighter on its worn edges and darker, dirtier, in its hollows (how its surface
// bends round each corner), lighter and darker in broad patches, and banded along a sandstone's
// bedding. Moss, snow and lichen are put on where it's placed (`stoneColour`), as it's turned and
// tilted: moss on what faces up and to the north, damp at the foot in the wet lands; snow on its
// tops, filling its hollows first; lichen in colonies, round patches of it on what's open to the
// weather, most on its tops and to the west. Its foot takes the ground's colour, as the ground
// builds up round it (`foot`).
//
// A chunk's rocks are drawn with the cliffs' material (engine/atlas.js cliffMaterial: its
// picture laid on from three sides by where each pixel is in the world, so no seams and no
// stretching), into a mesh of their own, its corners shared between triangles (`StoneMesher`);
// on High with rockMaterial, which paints its lichen colonies pixel by pixel, crisp with dark
// rims, and finer relief near.

import * as THREE from "three";
import { allAtOnce } from "../../../core/steps.js";
import { LAYERS, ROCKS_HIGH } from "../engine/atlas.js";
import { MATERIALS } from "../engine/painters.js";

const TAU = Math.PI * 2;

/**
 * Each family of rock, as its stone breaks and weathers: how many joint sets it splits along
 * (`sets`, each a plane either side, roughly square to each other, `jitter` radians off square;
 * `upright`: the first two standing, as a standing stone's sides; `gaps`: how likely a plane's
 * missing, the core round there),
 * how far out its planes are (`at`, of its core's radius), how many more breaks it has (`extra`),
 * whether its first set's its bedding (`bedding`: near level, its planes as far out as `bed`),
 * how worn round its edges are (`round`: the smooth minimum's width, of its radius), how squat it
 * is (`squash`), its core's noise (`noise`: of its radius, a cycle or two round it) and finer
 * noise over all of it (`fine`), how many chips are knocked off its edges (`chips`) or pits worn
 * in its faces (`pits`), the grooves along its bedding (`grooves`: how far apart, of its size,
 * and how deep), how sharply its faces must turn to keep an edge (`crease`, degrees), how far
 * into the ground it's set (`sunk`, of its height), and how lichened it is (`lichen`: 0 to 1;
 * the land's own moss and snow come on top).
 */
export const ROCK_FAMILIES = Object.freeze({
    // (Granite gone round in the ground and laid bare: a corestone)
    corestone: { sets: 3, jitter: 0.3, at: [0.5, 0.96], gaps: 0.25, extra: [0, 2], round: [0.16, 0.28], squash: [0.6, 0.86], noise: 0.08, fine: 0.014, chips: [0, 1], pits: [0, 0], crease: 75, sunk: 0.3, lichen: 0.55 },
    // (Granite freshly broken: angular, jointed, chipped)
    talus: { sets: 3, jitter: 0.32, at: [0.5, 0.92], gaps: 0.15, extra: [2, 5], round: [0.025, 0.05], squash: [0.55, 0.92], noise: 0.025, fine: 0.01, chips: [1, 3], pits: [0, 0], crease: 36, sunk: 0.18, lichen: 0.35 },
    // (Sandstone: a slab along its bedding, cross-jointed, its beds in grooves)
    slab: { sets: 3, bedding: true, bed: [0.32, 0.48], jitter: 0.22, at: [0.55, 0.96], gaps: 0.2, extra: [0, 2], round: [0.05, 0.09], squash: [0.8, 1], noise: 0.03, fine: 0.012, chips: [1, 2], pits: [0, 0], grooves: { every: 0.13, depth: 0.045 }, crease: 40, sunk: 0.12, lichen: 0.3 },
    // (Limestone: blocky, its faces pitted)
    block: { sets: 3, jitter: 0.18, at: [0.52, 0.94], gaps: 0.15, extra: [0, 2], round: [0.06, 0.11], squash: [0.62, 0.9], noise: 0.03, fine: 0.012, chips: [0, 2], pits: [2, 4], crease: 44, sunk: 0.22, lichen: 0.8 },
    // (A cobble worn smooth by water: no planes, a flattened ellipsoid)
    cobble: { sets: 0, at: [1, 1], extra: [0, 0], round: [0.02, 0.02], squash: [0.45, 0.7], noise: 0.02, fine: 0.006, chips: [0, 0], pits: [0, 0], crease: 180, sunk: 0.3, lichen: 0.05 },
    // (A standing stone: tall, its sides near flat, dressed long ago and worn since)
    standing: { sets: 2, upright: true, jitter: 0.08, at: [0.8, 0.94], extra: [0, 1], round: [0.08, 0.14], squash: [1, 1], noise: 0.03, fine: 0.01, chips: [0, 2], pits: [0, 2], crease: 50, sunk: 0.15, lichen: 0.9 },
    // (Basalt: dense, dark, broken every way)
    basalt: { sets: 0, at: [0.62, 0.86], extra: [7, 11], round: [0.02, 0.04], squash: [0.55, 0.9], noise: 0.02, fine: 0.008, chips: [1, 2], pits: [0, 0], crease: 34, sunk: 0.15, lichen: 0.1 },
});

/** Each land's family of rock (ROCK_FAMILIES), as its stone is (wilds.js LOOKS' `stone`). */
export const LAND_ROCKS = Object.freeze({
    farmland: "corestone",
    meadow: "corestone",
    woods: "corestone",
    marsh: "corestone",
    darkwood: "corestone",
    jungle: "corestone",
    heath: "block",
    elfwood: "block",
    savannah: "slab",
    badlands: "slab",
    volcanic: "basalt",
    tundra: "talus",
    snow: "talus",
    mountain: "talus",
    beach: "cobble",
});

/** A land's family of rock (LAND_ROCKS; a meadow's for any other). */
export const familyOf = (land) => LAND_ROCKS[land] ?? "corestone";

/**
 * How finely a rock's ball is divided, by what it's for: near the player, and further off (and
 * on Low). A boulder or a standing stone `big`; a boulder's lesser stones, an outcrop's and a
 * kopje's lesser ones `small`; a cairn's stones and those strewn round a boulder `tiny`; pebbles
 * `pebble` (an octahedron, -1).
 */
export const ROCK_DETAIL = Object.freeze({
    big: { near: 3, far: 1 },
    small: { near: 2, far: 0 },
    tiny: { near: 1, far: 0 },
    pebble: { near: -1, far: -1 },
});

/**
 * How a rock's baked: how far out from each corner its shape's read to see how much of the sky's
 * hidden (`reach`, of its size) and how much a hidden sky darkens it (`hidden`); how much darker
 * its foot is, at the ground, rising over `foot` of its height above it; how much lighter its
 * worn edges are (`edge`) and darker its hollows (`hollow`), and how sharply it must bend to be
 * either (`edges`, `hollows`: its curvature, 1 over metres in its own size); how much lighter and
 * darker it is in broad patches (`patches`); how strongly a sandstone's banded (`bands`, and how
 * far apart, of its size: `banding`); the dirt in its hollows (a multiplier); and the lichen's
 * colonies: how many to a rock at the most, how big round (of its size), and their dark rims.
 */
export const ROCK_SHADE = Object.freeze({
    reach: [0.05, 0.12, 0.24],
    hidden: 0.42,
    darkFoot: 0.5,
    foot: 0.28,
    edge: 0.22,
    hollow: 0.34,
    edges: [3.5, 11],
    hollows: [0.6, 4.5],
    patches: 0.16,
    bands: 0.09,
    banding: 0.075,
    dirt: [0.78, 0.7, 0.6],
    colonies: 16,
    colony: [0.035, 0.11],
    rim: 0.6,
});

/**
 * The lichens that grow on rock, as multipliers of the stone's picture (engine/atlas.js
 * ROCKS_HIGH's, which paints them on High): a grey-green crust, the yellow-green of map lichen,
 * orange (Xanthoria), and a pale crust; which a stone takes (by its
 * picture: limestone the orange and the pale, sandstone the grey-green, granite the map lichen
 * and the grey-green, basalt hardly any).
 */
export const LICHEN_KINDS = Object.freeze(["crust", "map", "orange", "pale"].map((name, k) => Object.freeze({ name, colour: ROCKS_HIGH.kinds[k] })));
const LICHENS_OF = Object.freeze({
    rock: [0, 1, 1, 3],
    "rock-pale": [2, 3, 0, 2],
    "rock-red": [0, 0, 3, 1],
    "rock-dark": [0, 3],
    granite: [1, 0, 3],
    marble: [3, 2],
});

/**
 * Moss and snow as rocks wear them (sRGB): the moss's thick green and the darker thin fringe
 * round it; the snow. Each is put on as a multiplier of the rock's own picture (its layer's
 * colour), as bright as it should be however dark the stone.
 */
export const ROCK_GROWTH = Object.freeze({ moss: 0x5b6e34, fringe: 0x3c4826, snow: 0xe8edf2, most: 4 });

// --- Balls, welded ---

const spheres = new Map();

/**
 * A unit ball of triangles, `detail` times divided (an icosahedron's; -1 an octahedron), its
 * corners shared: { positions (Float32Array, x y z each), triangles (Uint16Array, three corners
 * each, counter-clockwise from outside), neighbours (each corner's, an array) }. Made once.
 */
export function sphereOf(detail) {
    if (!spheres.has(detail)) {
        const geometry = detail < 0 ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, detail);
        const corners = geometry.attributes.position.array;
        const seen = new Map();
        const positions = [];
        const triangles = new Uint16Array(corners.length / 3);

        for (let i = 0; i < corners.length / 3; i++) {
            const [x, y, z] = [corners[i * 3], corners[i * 3 + 1], corners[i * 3 + 2]];
            const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;

            if (!seen.has(key)) {
                const l = Math.hypot(x, y, z);

                seen.set(key, positions.length / 3);
                positions.push(x / l, y / l, z / l);
            }

            triangles[i] = seen.get(key);
        }

        geometry.dispose();

        const count = positions.length / 3;
        const near = Array.from({ length: count }, () => new Set());

        for (let t = 0; t < triangles.length; t += 3) {
            for (let k = 0; k < 3; k++) {
                near[triangles[t + k]].add(triangles[t + ((k + 1) % 3)]);
                near[triangles[t + k]].add(triangles[t + ((k + 2) % 3)]);
            }
        }

        spheres.set(detail, Object.freeze({ positions: Float32Array.from(positions), triangles, neighbours: near.map((set) => [...set]) }));
    }

    return spheres.get(detail);
}

// --- Noise ---

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// A lattice point's value, 0 to 1 (as core/noise.js hashOf, in three dimensions)
function lattice(i, j, k, seed) {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683) + Math.imul(seed, 1274126177);

    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 2246822519);

    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// 3D value noise from 0 to 1, smooth to its second derivative (read thousands of times a rock)
function noise3(x, y, z, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const fz = fade(z - z0);
    const a = lattice(x0, y0, z0, seed);
    const b = lattice(x0 + 1, y0, z0, seed);
    const c = lattice(x0, y0 + 1, z0, seed);
    const d = lattice(x0 + 1, y0 + 1, z0, seed);
    const e = lattice(x0, y0, z0 + 1, seed);
    const f = lattice(x0 + 1, y0, z0 + 1, seed);
    const g = lattice(x0, y0 + 1, z0 + 1, seed);
    const h = lattice(x0 + 1, y0 + 1, z0 + 1, seed);
    const near = a + (b - a) * fx + (c + (d - c) * fx - a - (b - a) * fx) * fy;
    const far = e + (f - e) * fx + (g + (h - g) * fx - e - (f - e) * fx) * fy;

    return near + (far - near) * fz;
}

const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};
const unit = ([x, y, z]) => {
    const l = Math.hypot(x, y, z) || 1;

    return [x / l, y / l, z / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A seeded random: next() from 0 to 1, range(a, b), int(a, b), pick(list), chance(p)
export function randomOf(seed) {
    let state = seed >>> 0 || 1;
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    return {
        next,
        range: (a, b) => a + (b - a) * next(),
        int: (a, b) => a + Math.floor(next() * (b - a + 1)),
        pick: (list) => list[Math.floor(next() * list.length)],
        chance: (p) => next() < p,
    };
}

// A way out, any way at all, the same for every way
function anyWay(random) {
    const z = random.range(-1, 1);
    const a = random.range(0, TAU);
    const r = Math.sqrt(1 - z * z);

    return [r * Math.cos(a), z, r * Math.sin(a)];
}

// `way` turned off itself by up to `by` radians, any way round
function jittered(way, by, random) {
    const off = anyWay(random);

    return unit([way[0] + off[0] * Math.tan(by), way[1] + off[1] * Math.tan(by), way[2] + off[2] * Math.tan(by)]);
}

// Three ways square to each other, turned any way at all
function frameOf(random) {
    const a = anyWay(random);
    const helper = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const b = unit([a[1] * helper[2] - a[2] * helper[1], a[2] * helper[0] - a[0] * helper[2], a[0] * helper[1] - a[1] * helper[0]]);
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

    return [a, b, c];
}

// The smooth minimum of some values (exponential: the same whichever order they're in), `k` wide
function smoothMin(values, count, k) {
    let least = Infinity;

    for (let i = 0; i < count; i++) {
        least = Math.min(least, values[i]);
    }

    if (k <= 0) {
        return least;
    }

    let sum = 0;

    for (let i = 0; i < count; i++) {
        sum += Math.exp(-(values[i] - least) / k);
    }

    return least - k * Math.log(sum);
}

// --- Shapes ---

/**
 * A rock's shape, from its family (ROCK_FAMILIES) and its own random numbers: `radius(way)`, how
 * far out it is along a unit way from its middle (its core and planes joined smoothly, its chips,
 * pits and grooves, its noise); and how that's set in its look (`toLook(way, r)`: squashed,
 * stretched, a little of it below the ground, a flat foot), and back (`depth(point)`: how far
 * outside it a point in its look is, below 0 inside).
 */
export function shapeOf(random, family, { squash = null, stretch = [1, 1], core = null } = {}) {
    const look = ROCK_FAMILIES[family];
    const seed = random.int(1, 1e6);
    const planes = [];

    if (look.sets) {
        const turn = random.range(0, TAU);
        const frame = look.upright ? [[Math.cos(turn), 0, Math.sin(turn)], [-Math.sin(turn), 0, Math.cos(turn)], [0, 1, 0]] : frameOf(random);

        for (let s = 0; s < look.sets; s++) {
            const bedding = look.bedding && s === 0;
            const axis = bedding ? jittered([0, 1, 0], 0.12, random) : jittered(frame[s], look.jitter, random);

            for (const side of [1, -1]) {
                const at = bedding ? random.range(...look.bed) : random.range(...look.at);

                // (Not every joint's open: a face where there's none, the core's round)
                if (bedding || !random.chance(look.gaps ?? 0)) {
                    planes.push({ normal: axis.map((v) => v * side), at });
                }
            }
        }
    }

    for (let k = random.int(...look.extra); k > 0; k--) {
        planes.push({ normal: unit([random.range(-1, 1), random.range(-0.2, 1), random.range(-1, 1)]), at: random.range(...look.at) });
    }

    // (A cobble's axes as Zingg's classes have them: a disc, a blade, a rod or a sphere; the rest
    // nearly round, the planes giving them their shape)
    const axes = core ?? (family === "cobble" ? random.pick([[1, 0.95, 0.9], [1, 0.62, 0.55], [1, 0.7, 0.92], [1, 0.9, 0.62]]) : [random.range(0.86, 1.14), random.range(0.86, 1.14), random.range(0.86, 1.14)]);
    const round = random.range(...look.round);
    const tall = squash ?? random.range(...look.squash);
    const bed = planes[0]?.normal ?? [0, 1, 0];
    const grooves = look.grooves ? { ...look.grooves, phase: random.next() } : null;
    const values = new Float64Array(planes.length + 1);

    // (Before its chips and pits: its core and planes, and its noise)
    const whole = (u) => {
        const ellipse = 1 / Math.sqrt((u[0] / axes[0]) ** 2 + (u[1] / axes[1]) ** 2 + (u[2] / axes[2]) ** 2);
        const lump = 1 + look.noise * (noise3(u[0] * 1.3 + 3, u[1] * 1.3 + 3, u[2] * 1.3 + 3, seed) * 2 - 1 + 0.5 * (noise3(u[0] * 2.7, u[1] * 2.7, u[2] * 2.7, seed + 2) * 2 - 1));
        let count = 1;

        values[0] = ellipse * lump;

        for (const { normal, at } of planes) {
            const along = dot(u, normal);

            if (along > 0.05) {
                values[count++] = at / along;
            }
        }

        return smoothMin(values, count, round) * (1 + look.fine * (noise3(u[0] * 5.5, u[1] * 5.5, u[2] * 5.5, seed + 1) * 2 - 1));
    };

    // Chips off its edges and pits in its faces, where its sphere's corners show its edges
    const cuts = [];
    const probe = sphereOf(2).positions;
    const edges = [];
    const faces = [];

    for (let i = 0; i < probe.length; i += 3) {
        const u = [probe[i], probe[i + 1], probe[i + 2]];
        const r = whole(u);
        const sharp = planes.filter(({ normal, at }) => dot(u, normal) > 0.05 && at / dot(u, normal) < r * 1.12).length;

        (sharp >= 2 ? edges : faces).push([u, r]);
    }

    for (let k = random.int(...look.chips); k > 0 && edges.length; k--) {
        const [u, r] = random.pick(edges);
        const normal = jittered(u, 0.35, random);

        const spread = random.range(0.28, 0.42);

        cuts.push({ way: u, normal, at: r * dot(u, normal) * random.range(0.86, 0.93), spread, inside: Math.cos(spread), dent: false });
    }

    for (let k = random.int(...look.pits); k > 0 && faces.length; k--) {
        const [u, r] = random.pick(faces);

        const spread = random.range(0.12, 0.2);

        cuts.push({ way: u, normal: u, at: r * random.range(0.93, 0.96), spread, inside: Math.cos(spread), dent: true });
    }

    const carved = (u) => {
        let r = whole(u);

        for (const { way, normal, at, spread, inside, dent } of cuts) {
            const along = dot(u, way);

            if (along > inside) {
                const angle = Math.acos(Math.min(1, along));
                const w = smoothstep(spread, spread * 0.55, angle);

                // (A chip: flat where it broke off; a pit: a dish worn in)
                const cut = dent ? at + (1 - Math.cos((angle / spread) * Math.PI * 0.5)) * (r - at) * 0.4 : at / Math.max(0.05, dot(u, normal));

                r -= w * Math.max(0, r - cut);
            }
        }

        if (grooves) {
            const h = (dot(u, bed) * r) / grooves.every + grooves.phase;
            const f = h - Math.floor(h);

            // (A groove just above each bed, easing in and out so no step shows)
            r *= 1 - grooves.depth * (1 - smoothstep(0, 0.45, f)) * smoothstep(0, 0.06, f);
        }

        return r;
    };

    // (As big as a rock's ball: its furthest out 1)
    let furthest = 0;

    for (let i = 0; i < probe.length; i += 3) {
        furthest = Math.max(furthest, carved([probe[i], probe[i + 1], probe[i + 2]]));
    }

    const scale = 1 / furthest;
    const radius = (u) => carved(u) * scale;
    const [sx, sz] = stretch;
    const lift = tall * 0.32;
    const toLook = (u, r) => [u[0] * r * 0.5 * sx, Math.max(-0.12, u[1] * r * 0.5 * tall + lift), u[2] * r * 0.5 * sz];
    const depth = ([x, y, z]) => {
        const q = [x / (0.5 * sx), (y - lift) / (0.5 * tall), z / (0.5 * sz)];
        const l = Math.hypot(q[0], q[1], q[2]) || 1e-6;

        return (l - radius([q[0] / l, q[1] / l, q[2] / l])) * 0.5 * Math.min(sx, tall, sz);
    };

    return { family, radius, toLook, depth, bed, seed, squash: tall, round };
}

// --- Looks ---

/**
 * A rock (about a metre across, standing on the ground: its foot near y 0, as wilds.js's looks
 * are), `detail` times divided (ROCK_DETAIL), of a family (ROCK_FAMILIES), textured with `layer`
 * (an atlas layer's name), from its own random numbers: { count, position, normal, color (its
 * own: hidden sky, worn edges, dirty hollows, patches, bands; no moss, snow or lichen yet), data
 * (four to a corner: its moss's noise, how open to the sky it is, its lichen's colonies, how it
 * bends: convex below 0, hollow above), layer, lichen (each corner's kind of lichen,
 * LICHEN_KINDS'), index, top, family }. `ground` is where the ground comes to on it (y, in its
 * look: its foot darker below and just above), `lichen` how lichened it is (1 as its family is).
 */
export function rockLook(random, options = {}) {
    return allAtOnce(rockMaking(random, options));
}

/** The same (rockLook), made a step at a time (each a yield), returning it. */
export function* rockMaking(random, { family = "corestone", detail = 3, layer = "rock", squash = null, stretch = [1, 1], core = null, ground = null, lichen = 1 } = {}) {
    const shape = shapeOf(random, family, { squash, stretch, core });

    return yield* lookMaking([{ shape, at: [0, 0, 0], turn: 0, tilt: [0, 0], scale: [1, 1, 1], layer, detail, lichen }], random, { ground });
}

/**
 * Several rocks as one look (an outcrop, a kopje, a cairn): each { family, detail, layer, at,
 * turn, tilt, scale (as wilds.js place's), squash, stretch, core, lichen }, from the same random
 * numbers; where they touch they hide each other's sky.
 */
export function pileLook(random, members, options = {}) {
    return allAtOnce(pileMaking(random, members, options));
}

/** The same (pileLook), made a step at a time (each a yield: a rock of it each), returning it. */
export function* pileMaking(random, members, { ground = 0 } = {}) {
    return yield* lookMaking(
        members.map((member) => ({ ...member, shape: shapeOf(random, member.family ?? "corestone", member), turn: member.turn ?? 0, tilt: member.tilt ?? [0, 0], scale: member.scale ?? [1, 1, 1], at: member.at ?? [0, 0, 0], lichen: member.lichen ?? 1 })),
        random,
        { ground },
    );
}

// A member's way from its look to the pile's (as wilds.js place: tilted about x, then z, then
// turned about the upright, stretched first), and back
function placing({ at, turn, tilt, scale }) {
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const [ca, sa, cb, sb] = [Math.cos(tilt[0]), Math.sin(tilt[0]), Math.cos(tilt[1]), Math.sin(tilt[1])];
    const m = [cb * c, -ca * sb * c + sa * s, sa * sb * c + ca * s, sb, ca * cb, -sa * cb, -cb * s, ca * sb * s + sa * c, -sa * sb * s + ca * c];

    return {
        point: ([x, y, z]) => {
            const [px, py, pz] = [x * scale[0], y * scale[1], z * scale[2]];

            return [m[0] * px + m[1] * py + m[2] * pz + at[0], m[3] * px + m[4] * py + m[5] * pz + at[1], m[6] * px + m[7] * py + m[8] * pz + at[2]];
        },
        normal: ([x, y, z]) => {
            const [a, b, d] = [x / scale[0], y / scale[1], z / scale[2]];

            return unit([m[0] * a + m[1] * b + m[2] * d, m[3] * a + m[4] * b + m[5] * d, m[6] * a + m[7] * b + m[8] * d]);
        },
        back: ([x, y, z]) => {
            const [px, py, pz] = [x - at[0], y - at[1], z - at[2]];

            // (The matrix turns only, so its transpose turns back)
            return [(m[0] * px + m[3] * py + m[6] * pz) / scale[0], (m[1] * px + m[4] * py + m[7] * pz) / scale[1], (m[2] * px + m[5] * py + m[8] * pz) / scale[2]];
        },
        size: Math.min(scale[0], scale[1], scale[2]),
    };
}

function* lookMaking(members, random, { ground }) {
    const built = members.map((member) => {
        const sphere = sphereOf(member.detail);
        const { positions, triangles } = sphere;
        const count = positions.length / 3;
        const into = placing(member);
        const points = [];

        for (let i = 0; i < count; i++) {
            const u = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];

            points.push(into.point(member.shape.toLook(u, member.shape.radius(u))));
        }

        // (How far round it is from its middle, to pass it by when it's far off)
        const middle = [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k], 0) / count);
        const reach = Math.max(...points.map((p) => Math.hypot(p[0] - middle[0], p[1] - middle[1], p[2] - middle[2])));

        return { member, sphere, into, points, triangles, middle, reach };
    });

    // (Where the ground comes to: given, or as its family's sunk into it)
    const top = Math.max(...built.flatMap(({ points }) => points.map((p) => p[1])));
    const groundLine = ground ?? (top * ROCK_FAMILIES[members[0].shape.family].sunk) / (1 + ROCK_FAMILIES[members[0].shape.family].sunk);

    // How far outside the whole look a point is (below 0 inside one of its rocks)
    const outside = (p) => {
        let least = Infinity;

        for (const { member, into, middle, reach } of built) {
            const off = Math.hypot(p[0] - middle[0], p[1] - middle[1], p[2] - middle[2]) - reach;

            least = Math.min(least, off > 0.3 ? off : member.shape.depth(into.back(p)) * into.size);
        }

        return least;
    };
    const parts = [];

    for (const piece of built) {
        parts.push(shade(piece, outside, groundLine, top, random));

        if (built.length > 1) {
            yield;
        }
    }

    const count = parts.reduce((sum, { position }) => sum + position.length / 3, 0);
    const look = { count, position: new Float32Array(count * 3), normal: new Float32Array(count * 3), color: new Float32Array(count * 3), data: new Float32Array(count * 4), layer: new Float32Array(count), lichen: new Uint8Array(count), index: null, top, ground: groundLine, family: members[0].shape.family };
    const index = [];
    let base = 0;

    for (const part of parts) {
        look.position.set(part.position, base * 3);
        look.normal.set(part.normal, base * 3);
        look.color.set(part.color, base * 3);
        look.data.set(part.data, base * 4);
        look.layer.fill(part.layer, base, base + part.position.length / 3);
        look.lichen.set(part.lichen, base);

        for (const k of part.index) {
            index.push(k + base);
        }

        base += part.position.length / 3;
    }

    look.index = count > 65535 ? Uint32Array.from(index) : Uint16Array.from(index);

    return look;
}

// One rock of a look shaded: its corners, split where its faces turn sharper than its family's
// crease, each with its normal (its faces' round it, weighted by their size), its colour and data
function shade({ member, sphere, into, points, triangles }, outside, groundLine, top, random) {
    const { shape } = member;
    const family = ROCK_FAMILIES[shape.family];
    const count = points.length;
    const faces = triangles.length / 3;
    const faceNormals = new Float64Array(faces * 3);
    const smooth = new Float64Array(count * 3);

    // Each face's normal (its size in its length), and each corner's smooth normal from them
    for (let f = 0; f < faces; f++) {
        const [a, b, c] = [points[triangles[f * 3]], points[triangles[f * 3 + 1]], points[triangles[f * 3 + 2]]];
        const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];

        faceNormals.set(n, f * 3);

        for (let k = 0; k < 3; k++) {
            const i = triangles[f * 3 + k];

            smooth[i * 3] += n[0];
            smooth[i * 3 + 1] += n[1];
            smooth[i * 3 + 2] += n[2];
        }
    }

    const normalOf = (i) => unit([smooth[i * 3], smooth[i * 3 + 1], smooth[i * 3 + 2]]);

    // How each corner bends: its neighbours above or below the plane it faces, over how far off
    // they are (twice that's about 1 over its radius of curvature: a ball half a metre round, -4)
    const bend = new Float64Array(count);

    for (let i = 0; i < count; i++) {
        const n = normalOf(i);
        const p = points[i];
        let sum = 0;

        for (const j of sphere.neighbours[i]) {
            const d = [points[j][0] - p[0], points[j][1] - p[1], points[j][2] - p[2]];

            sum += (2 * dot(n, d)) / Math.max(1e-6, dot(d, d));
        }

        bend[i] = sum / sphere.neighbours[i].length;
    }

    // Each corner's own colour and data
    const kinds = LICHENS_OF[member.layer] ?? LICHENS_OF.rock;
    const colonies = Array.from({ length: Math.round(ROCK_SHADE.colonies * family.lichen * member.lichen * random.range(0.5, 1)) }, () => {
        const u = anyWay(random);

        return { at: into.point(shape.toLook(u, shape.radius(u))), size: random.range(...ROCK_SHADE.colony) * Math.max(...member.scale), kind: random.pick(kinds) };
    });
    const corner = points.map((p, i) => {
        const n = normalOf(i);
        let hidden = 0;

        for (const reach of ROCK_SHADE.reach) {
            const q = [p[0] + n[0] * reach, p[1] + n[1] * reach, p[2] + n[2] * reach];

            hidden += Math.max(0, reach - Math.max(0, outside(q))) / reach / ROCK_SHADE.reach.length;
        }

        const open = Math.min(1, Math.max(0, 1 - hidden * 1.6));
        const curve = bend[i];
        const worn = smoothstep(ROCK_SHADE.edges[0], ROCK_SHADE.edges[1], -curve);
        const hollow = smoothstep(ROCK_SHADE.hollows[0], ROCK_SHADE.hollows[1], curve);
        const foot = 1 - ROCK_SHADE.darkFoot * (1 - smoothstep(groundLine - 0.02, groundLine + ROCK_SHADE.foot * Math.max(0.1, top - groundLine), p[1]));
        const patch = 1 + ROCK_SHADE.patches * (noise3(p[0] * 1.7, p[1] * 1.7, p[2] * 1.7, shape.seed + 3) * 2 - 1);
        const warm = (noise3(p[0] * 1.1 + 9, p[1] * 1.1, p[2] * 1.1, shape.seed + 4) - 0.5) * 0.08;
        const band = shape.family === "slab" ? 1 + ROCK_SHADE.bands * Math.sin((dot(p, into.normal(shape.bed)) / ROCK_SHADE.banding) * TAU + noise3(p[0] * 3, p[1] * 3, p[2] * 3, shape.seed + 5) * 3) : 1;
        const light = (1 - ROCK_SHADE.hidden * (1 - open)) * foot * patch * band * (1 + ROCK_SHADE.edge * worn) * (1 - ROCK_SHADE.hollow * hollow * 0.5);
        const dirt = ROCK_SHADE.dirt.map((v) => 1 + (v - 1) * hollow);
        const colour = [light * (1 + warm) * dirt[0], light * dirt[1], light * (1 - warm) * dirt[2]].map((v) => Math.min(1.25, Math.max(0, v)));

        // (Its lichen: the colony it's most in, ragged round its edge)
        let lichen = 0;
        let kind = kinds[0];
        const ragged = 0.75 + 0.5 * noise3(p[0] * 14, p[1] * 14, p[2] * 14, shape.seed + 7);

        for (const colony of colonies) {
            const d = Math.hypot(p[0] - colony.at[0], p[1] - colony.at[1], p[2] - colony.at[2]);
            const size = colony.size * ragged;
            const amount = smoothstep(size, size * 0.55, d);

            if (amount > lichen) {
                lichen = amount;
                kind = colony.kind;
            }
        }

        return { n, colour, data: [noise3(p[0] * 4.5, p[1] * 4.5, p[2] * 4.5, shape.seed + 6), open, lichen, Math.max(-1, Math.min(1, curve / 12))], kind };
    });

    // Split where its faces turn sharper than its family's crease: each face's corners take the
    // normals of the faces round them that turn less than that from it
    const crease = Math.cos((family.crease * Math.PI) / 180);
    const around = Array.from({ length: count }, () => []);

    for (let f = 0; f < faces; f++) {
        for (let k = 0; k < 3; k++) {
            around[triangles[f * 3 + k]].push(f);
        }
    }

    const units = new Float64Array(faces * 3);

    for (let f = 0; f < faces; f++) {
        const l = Math.hypot(faceNormals[f * 3], faceNormals[f * 3 + 1], faceNormals[f * 3 + 2]) || 1;

        units[f * 3] = faceNormals[f * 3] / l;
        units[f * 3 + 1] = faceNormals[f * 3 + 1] / l;
        units[f * 3 + 2] = faceNormals[f * 3 + 2] / l;
    }

    const position = [];
    const normal = [];
    const color = [];
    const data = [];
    const lichen = [];
    const index = [];
    const made = new Map();

    for (let f = 0; f < faces; f++) {
        for (let k = 0; k < 3; k++) {
            const i = triangles[f * 3 + k];
            const round = around[i];
            let mask = 0;

            // (Which of the faces round it it shares a normal with: a bit each)
            for (let r = 0; r < round.length; r++) {
                const g = round[r];

                if (units[g * 3] * units[f * 3] + units[g * 3 + 1] * units[f * 3 + 1] + units[g * 3 + 2] * units[f * 3 + 2] >= crease) {
                    mask |= 1 << r;
                }
            }

            const key = i * 4096 + mask;

            if (!made.has(key)) {
                let [x, y, z] = [0, 0, 0];

                for (let r = 0; r < round.length; r++) {
                    if (mask & (1 << r)) {
                        x += faceNormals[round[r] * 3];
                        y += faceNormals[round[r] * 3 + 1];
                        z += faceNormals[round[r] * 3 + 2];
                    }
                }

                const l = Math.hypot(x, y, z) || 1;
                const { colour, data: own, kind } = corner[i];

                made.set(key, position.length / 3);
                position.push(points[i][0], points[i][1], points[i][2]);
                normal.push(x / l, y / l, z / l);
                color.push(colour[0], colour[1], colour[2]);
                data.push(own[0], own[1], own[2], own[3]);
                lichen.push(kind);
            }

            index.push(made.get(key));
        }
    }

    return { position, normal, color, data, lichen, index, layer: LAYERS.indexOf(member.layer) };
}

// --- Placed ---

const _colour = new THREE.Color();
const linearOf = (hex) => {
    _colour.setHex(hex);

    return [_colour.r, _colour.g, _colour.b];
};

// Each layer's moss, its fringe and snow, as multipliers of its picture (ROCK_GROWTH)
const growths = new Map();

function growthOf(layer) {
    if (!growths.has(layer)) {
        const base = linearOf(MATERIALS[LAYERS[layer]]?.base ?? MATERIALS.rock.base);
        const over = (hex) => linearOf(hex).map((v, k) => Math.min(ROCK_GROWTH.most, v / Math.max(0.02, base[k])));

        growths.set(layer, { moss: over(ROCK_GROWTH.moss), fringe: over(ROCK_GROWTH.fringe), snow: over(ROCK_GROWTH.snow) });
    }

    return growths.get(layer);
}

/**
 * Corner `i` of a look's colour where it's placed (into `out`): its own (from its look), times
 * `tint`; moss on what faces up (its normal as placed: `ny`) and to the north (-z), damp creeping
 * up from its foot in the wet lands, as much as the land's `moss`; snow on its tops, filling its
 * hollows first, as much as `snow`; lichen in its colonies (its look's), most on what's open to the
 * weather, on its tops and to the west (-x), as much as `lichen`, of its kind (LICHEN_KINDS) —
 * unless `crisp`, when the material paints the colonies pixel by pixel; its foot taking the
 * ground's colour (`ground`: a multiplier) up to `footBand` metres over the ground (it's `above`
 * it). Returns how much lichen it has. (Its arguments one by one: it's done for every corner of a
 * chunk's rocks)
 */
export function stoneColour(out, look, i, nx, ny, nz, above, { tint = [1, 1, 1], moss = 0, snow = 0, lichen = 0, wet = 0, footBand = 0.3, ground = null, crisp = false }) {
    const grain = look.data[i * 4];
    const open = look.data[i * 4 + 1];
    const colonies = look.data[i * 4 + 2];
    const bend = look.data[i * 4 + 3];
    const growth = growthOf(look.layer[i]);
    let r = look.color[i * 3] * tint[0];
    let g = look.color[i * 3 + 1] * tint[1];
    let b = look.color[i * 3 + 2] * tint[2];

    // (The ground's colour up its foot, ragged)
    if (ground && above < footBand) {
        const f = 0.85 * (1 - smoothstep(0, footBand, above + (grain - 0.5) * footBand * 0.5));

        r += (r * ground[0] * 0.9 - r) * f;
        g += (g * ground[1] * 0.9 - g) * f;
        b += (b * ground[2] * 0.9 - b) * f;
    }

    if (moss > 0) {
        const damp = wet * (1 - smoothstep(0, 0.45, above)) * (0.4 + grain);
        const m = Math.min(1, moss * smoothstep(0.3, 0.85, ny * 0.85 + (grain - 0.5) * 0.9 + 0.18 * Math.max(0, -nz) + 0.12 * (1 - open)) + damp);
        const fringe = smoothstep(0.06, 0.32, m) * (1 - smoothstep(0.32, 0.85, m));
        const thick = smoothstep(0.32, 0.85, m);

        r *= 1 + (growth.fringe[0] - 1) * fringe + (growth.moss[0] - 1) * thick;
        g *= 1 + (growth.fringe[1] - 1) * fringe + (growth.moss[1] - 1) * thick;
        b *= 1 + (growth.fringe[2] - 1) * fringe + (growth.moss[2] - 1) * thick;
    }

    let lichenous = 0;

    if (lichen > 0 && colonies > 0) {
        lichenous = Math.min(1, colonies * lichen * (0.45 + 0.55 * open) * (0.55 + 0.3 * Math.max(0, -nx) + 0.3 * Math.max(0, ny)));

        if (!crisp) {
            const colour = LICHEN_KINDS[look.lichen[i]].colour;

            r *= 1 + (colour[0] - 1) * lichenous;
            g *= 1 + (colour[1] - 1) * lichenous;
            b *= 1 + (colour[2] - 1) * lichenous;
        }
    }

    if (snow > 0) {
        const s = snow * smoothstep(0.58, 0.88, ny + 0.3 * Math.max(0, bend) + (grain - 0.5) * 0.45);
        const shade = 0.82 + 0.18 * open;

        r += (growth.snow[0] * shade - r) * s;
        g += (growth.snow[1] * shade - g) * s;
        b += (growth.snow[2] * shade - b) * s;
    }

    out[0] = r;
    out[1] = g;
    out[2] = b;

    return lichenous;
}

/**
 * Rocks placed into one mesh, their corners shared between triangles: each corner's position,
 * normal, colour, texture coordinates (how many copies of its layer's picture to a metre, for the
 * cliffs' material), layer, and for rockMaterial `rock` (how worn its edge, how hollow, how much
 * lichen, and which: 0 to 1 each). Grows as it's filled.
 */
export class StoneMesher {
    constructor(capacity = 1024) {
        this.count = 0;
        this.indices = 0;
        this.#allocate(capacity, capacity * 2);
    }

    #allocate(capacity, indices) {
        const old = this.arrays;

        this.capacity = capacity;
        this.room = indices;
        this.arrays = { position: new Float32Array(capacity * 3), normal: new Float32Array(capacity * 3), color: new Float32Array(capacity * 3), uv: new Float32Array(capacity * 2), layer: new Float32Array(capacity), rock: new Uint8Array(capacity * 4), index: new Uint32Array(indices) };

        if (old) {
            for (const [name, array] of Object.entries(old)) {
                this.arrays[name].set(array.subarray(0, Math.min(array.length, this.arrays[name].length)));
            }
        }
    }

    /**
     * A look (rockLook's, pileLook's) placed: turned `turn` about the upright, tilted, stretched by
     * `scale`, at `at` (as wilds.js place); its colours put on as `stoneColour` does (`growth`:
     * the land's moss, snow, lichen and wet; `ground` its colour at a rock's foot, `groundAt(x, z)`
     * the ground's height, `origin` where the mesh is in the world, `crisp` for rockMaterial's
     * lichen), each layer's picture `perMetre` copies to a metre.
     */
    place(look, { at, turn = 0, tilt = [0, 0], scale = [1, 1, 1], tint = [1, 1, 1], growth = {}, ground = null, groundAt = null, origin = [0, 0], perMetre = () => 1, crisp = false }) {
        const n = look.count;

        if (this.count + n > this.capacity || this.indices + look.index.length > this.room) {
            this.#allocate(Math.max(this.capacity * 2, this.count + n), Math.max(this.room * 2, this.indices + look.index.length));
        }

        const { position, normal, color, uv, layer, rock, index } = this.arrays;
        const [c, s] = [Math.cos(turn), Math.sin(turn)];
        const [ca, sa, cb, sb] = [Math.cos(tilt[0]), Math.sin(tilt[0]), Math.cos(tilt[1]), Math.sin(tilt[1])];
        const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = [cb * c, -ca * sb * c + sa * s, sa * sb * c + ca * s, sb, ca * cb, -sa * cb, -cb * s, ca * sb * s + sa * c, -sa * sb * s + ca * c];
        const [sx, sy, sz] = scale;
        const base = this.count;
        const out = [0, 0, 0];
        const settings = { ...growth, tint, ground, crisp, footBand: Math.min(0.45, Math.max(0.12, 0.1 + 0.18 * Math.max(sx, sz))) };
        const P = look.position;
        const N = look.normal;

        for (let i = 0; i < n; i++) {
            const j = base + i;
            const [x, y, z] = [P[i * 3] * sx, P[i * 3 + 1] * sy, P[i * 3 + 2] * sz];
            const [a, b, d] = [N[i * 3] / sx, N[i * 3 + 1] / sy, N[i * 3 + 2] / sz];
            const px = m0 * x + m1 * y + m2 * z + at[0];
            const py = m3 * x + m4 * y + m5 * z + at[1];
            const pz = m6 * x + m7 * y + m8 * z + at[2];
            let nx = m0 * a + m1 * b + m2 * d;
            let ny = m3 * a + m4 * b + m5 * d;
            let nz = m6 * a + m7 * b + m8 * d;
            const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);

            nx *= l;
            ny *= l;
            nz *= l;

            const above = groundAt ? py - groundAt(px + origin[0], pz + origin[1]) : Infinity;
            const lichen = stoneColour(out, look, i, nx, ny, nz, above, settings);
            const bend = look.data[i * 4 + 3];

            position[j * 3] = px;
            position[j * 3 + 1] = py;
            position[j * 3 + 2] = pz;
            normal[j * 3] = nx;
            normal[j * 3 + 1] = ny;
            normal[j * 3 + 2] = nz;
            color[j * 3] = out[0];
            color[j * 3 + 1] = out[1];
            color[j * 3 + 2] = out[2];
            uv[j * 2] = perMetre(look.layer[i]);
            uv[j * 2 + 1] = 0;
            layer[j] = look.layer[i];
            rock[j * 4] = Math.round(255 * smoothstep(0, 0.6, -bend));
            rock[j * 4 + 1] = Math.round(255 * smoothstep(0, 0.4, bend));
            rock[j * 4 + 2] = Math.round(255 * lichen);
            rock[j * 4 + 3] = Math.round((255 * look.lichen[i]) / (LICHEN_KINDS.length - 1));
        }

        for (let k = 0; k < look.index.length; k++) {
            index[this.indices + k] = look.index[k] + base;
        }

        this.count += n;
        this.indices += look.index.length;
    }

    /**
     * A Three.js geometry of what's been placed, packed into fewer bytes (#packed): its corners'
     * normals in bytes, colours and texture coordinates in half floats; `rock` only if `crisp`
     * (rockMaterial reads it).
     */
    geometry({ crisp = false } = {}) {
        const n = this.count;
        const { position, normal, color, uv, layer, rock, index } = this.arrays;
        const geometry = new THREE.BufferGeometry();
        const normals = new Int8Array(n * 4);
        const colours = new Uint16Array(n * 3);
        const uvs = new Uint16Array(n * 2);
        const layers = new Uint16Array(n);

        for (let i = 0; i < n; i++) {
            normals[i * 4] = Math.round(normal[i * 3] * 127);
            normals[i * 4 + 1] = Math.round(normal[i * 3 + 1] * 127);
            normals[i * 4 + 2] = Math.round(normal[i * 3 + 2] * 127);
            colours[i * 3] = half(color[i * 3]);
            colours[i * 3 + 1] = half(color[i * 3 + 1]);
            colours[i * 3 + 2] = half(color[i * 3 + 2]);
            uvs[i * 2] = half(uv[i * 2]);
            uvs[i * 2 + 1] = 0;
            layers[i] = half(layer[i]);
        }

        geometry.setAttribute("position", new THREE.BufferAttribute(position.slice(0, n * 3), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 4, true));
        geometry.setAttribute("color", new THREE.Float16BufferAttribute(colours, 3));
        geometry.setAttribute("uv", new THREE.Float16BufferAttribute(uvs, 2));
        geometry.setAttribute("layer", new THREE.Float16BufferAttribute(layers, 1));

        if (crisp) {
            geometry.setAttribute("rock", new THREE.BufferAttribute(rock.slice(0, n * 4), 4, true));
        }

        geometry.setIndex(new THREE.BufferAttribute(n > 65535 ? index.slice(0, this.indices) : Uint16Array.from(index.subarray(0, this.indices)), 1));
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();

        return geometry;
    }
}

// A number as a half float's bits, rounded to the nearest (as wilds.js's half: quicker than
// three.js's DataUtils.toHalfFloat, tens of thousands a chunk)
const _float = new Float32Array(1);
const _bits = new Uint32Array(_float.buffer);

function half(value) {
    _float[0] = value;

    const bits = _bits[0];
    const sign = (bits >>> 16) & 0x8000;
    const size = bits & 0x7fffffff;

    if (size < 0x38800000) {
        return sign | Math.round(Math.abs(value) * 16777216);
    }

    return sign | Math.min(0x7bff, (size - 0x38000000 + 0x1000) >>> 13);
}

/** How many bytes a look keeps (rockLook's, pileLook's). */
export const lookBytes = (look) => look.position.byteLength + look.normal.byteLength + look.color.byteLength + look.data.byteLength + look.layer.byteLength + look.lichen.byteLength + look.index.byteLength;
