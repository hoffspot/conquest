// What an ants' nest's chambers hold besides its rock and its fungus (docs/DUNGEONS.md): what tells
// whose nest it is, and what became of those who came before.
// - Its brood, sorted in rings as ants sort it (broodIn): the eggs heaped in the middle of a brood
//   chamber, the curled larvae round them, the pupae in their papery cocoons round those, each kind
//   one instanced mesh.
// - Its midden heap (heapOf, heapGeometry): what the ants carried out and threw away, heaped in the
//   middle of a midden; the gear of those they killed on it and round it (dungeondressing.js
//   middenGearAt).
// - Roots hanging through its roof (rootsUnder): thick on the top level, under the meadow, fewer
//   deeper down, each a twisting tapered tube and a fringe of fine rootlets.
// - A widow's web where one waits under the roof (webAround): a tangle of silk under the roof,
//   anchored to the walls, sticky threads hanging from it to the floor; and its prey hung from it,
//   wrapped in silk (cocoonGeometry).
//
// Each in level metres, chosen by its own stream of numbers (randomOf), so a level's always the
// same. Pure maths on plain numbers and three.js geometry, so it's tested in Node.

import * as THREE from "three";

/**
 * How each's made: the brood's rings (how far out from the middle, metres; how many; how big:
 * least and most), and its light (a room's light, warm, faint); a midden heap (how far it spreads
 * and how high, metres); a heap of the earth they've dug out (as far and high, and how many clods
 * round it); the roots (how many squares in a hundred have a cluster, by how deep the
 * level is; how long the roots, metres; how many to a cluster, and rootlets); a web (how far it
 * spreads from where its widow waits, metres; how many knots under the roof and on the walls; how
 * many threads in its tangle, how many hanging to the floor); the cocoons hung in it (how many,
 * how long, metres).
 */
export const NEST_LIFE = Object.freeze({
    brood: Object.freeze({
        eggs: Object.freeze({ ring: [0, 0.85], count: [18, 26], size: [0.26, 0.36] }),
        larvae: Object.freeze({ ring: [1.45, 2.2], count: [8, 13], size: [0.7, 1] }),
        pupae: Object.freeze({ ring: [2.45, 3.2], count: [7, 11], size: [0.9, 1.25] }),
        light: Object.freeze({ colour: 0xffb46a, intensity: 1.4, distance: 5, y: 0.6, breathe: 0.1, pace: 0.8 }),
    }),
    heap: Object.freeze({ radius: [1.35, 1.75], high: [0.55, 0.85] }),
    spoil: Object.freeze({ radius: [0.6, 0.85], high: [0.4, 0.62], clods: [3, 5] }),
    roots: Object.freeze({ share: Object.freeze([0.05, 0.015, 0.008]), long: [0.35, 1.3], count: [2, 4], rootlets: [5, 10] }),
    web: Object.freeze({ reach: 2.4, knots: [30, 10], threads: [80, 110], hanging: [6, 10] }),
    cocoons: Object.freeze({ count: [1, 2], long: [1.35, 1.75] }),
});

/** A stream of numbers from 0 to 1 for a seed (whole number): the same every time. */
export function randomOf(seed) {
    let a = seed >>> 0;

    return () => {
        a = (a + 0x6d2b79f5) >>> 0;

        let t = a;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A number between `least` and `most`, from a stream
const between = (random, [least, most]) => least + random() * (most - least);

// A colour (0xrrggbb, sRGB) as linear r, g, b
const linear = (hex) => new THREE.Color(hex).toArray();

// --- The brood ---

/**
 * A brood chamber's brood, round its middle (`centre`: [x, z], level metres), where the floor's
 * free (`free(x, z)`: open ground, nothing on it): its eggs heaped in the middle (on the egg pile's
 * squares, `pile`: its half width, metres), its larvae in a ring round them, its pupae round those.
 * { eggs, larvae, pupae: [{ x, y, z, turn, tilt, size }] }.
 */
export function broodIn(centre, free, random, { pile = 1 } = {}) {
    const [cx, cz] = centre;
    const { eggs, larvae, pupae } = NEST_LIFE.brood;
    const placed = { eggs: [], larvae: [], pupae: [] };
    const all = [];
    // (Not on another: as far apart as the larger's half-length and a little more)
    const clear = (x, z, size) => all.every((other) => Math.hypot(other.x - x, other.z - z) > (other.size + size) * 0.45);

    // (The eggs heaped: on the pile's squares, the higher the nearer its middle, one on another)
    const heaped = Math.round(between(random, eggs.count));

    for (let k = 0; k < heaped; k++) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * Math.min(eggs.ring[1], pile * 0.9);
        const size = between(random, eggs.size);
        const [x, z] = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];

        placed.eggs.push({ x, y: size * 0.32 + (1 - r / Math.min(eggs.ring[1], pile * 0.9)) * 0.28 * random(), z, turn: random() * Math.PI * 2, tilt: (random() - 0.5) * 0.8, size });
    }

    // (The larvae and the pupae, each in its ring round them, on the free floor)
    for (const [kind, spec] of [["larvae", larvae], ["pupae", pupae]]) {
        const count = Math.round(between(random, spec.count));

        for (let k = 0, tries = 0; k < count && tries < count * 8; tries++) {
            const a = (k / count + (random() - 0.5) * 0.35) * Math.PI * 2;
            const r = between(random, spec.ring);
            const size = between(random, spec.size);
            const [x, z] = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];

            if (!free(x, z) || !clear(x, z, size)) {
                continue;
            }

            const one = { x, y: 0, z, turn: a + Math.PI / 2 + (random() - 0.5) * 0.9, tilt: 0, size };

            placed[kind].push(one);
            all.push(one);
            k++;
        }
    }

    return placed;
}

// A shape made of rings of points round a line (`spine`: [[x, y, z]...]; each ring's radius,
// `radius(t)` from 0 at its start to 1 at its end, `sides` points round), its colour at each ring
// (`colour(t, side)`: linear r, g, b), closed at each end: { positions, colours, indices }
function ringed(spine, radius, colour, sides = 8) {
    const positions = [];
    const colours = [];
    const indices = [];
    const n = spine.length;

    for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const ahead = new THREE.Vector3(...spine[Math.min(n - 1, k + 1)]).sub(new THREE.Vector3(...spine[Math.max(0, k - 1)])).normalize();
        const side = new THREE.Vector3().crossVectors(ahead, Math.abs(ahead.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        const up = new THREE.Vector3().crossVectors(side, ahead);
        const r = radius(t);

        for (let s = 0; s < sides; s++) {
            const a = (s / sides) * Math.PI * 2;

            positions.push(spine[k][0] + (side.x * Math.cos(a) + up.x * Math.sin(a)) * r, spine[k][1] + (side.y * Math.cos(a) + up.y * Math.sin(a)) * r, spine[k][2] + (side.z * Math.cos(a) + up.z * Math.sin(a)) * r);
            colours.push(...colour(t, s / sides));
        }
    }

    for (let k = 0; k < n - 1; k++) {
        for (let s = 0; s < sides; s++) {
            const [a, b, c, d] = [k * sides + s, k * sides + ((s + 1) % sides), (k + 1) * sides + ((s + 1) % sides), (k + 1) * sides + s];

            indices.push(a, c, b, a, d, c);
        }
    }

    // (Each end closed with a point at its middle)
    for (const [k, way] of [[0, -1], [n - 1, 1]]) {
        const centre = positions.length / 3;

        positions.push(...spine[k]);
        colours.push(...colour(k === 0 ? 0 : 1, 0));

        for (let s = 0; s < sides; s++) {
            const [a, b] = [k * sides + s, k * sides + ((s + 1) % sides)];

            indices.push(...(way < 0 ? [centre, a, b] : [centre, b, a]));
        }
    }

    return { positions, colours, indices };
}

// A BufferGeometry of a ringed shape, its normals worked out from it
function geometryOf({ positions, colours, indices }) {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.userData.shared = true;

    return geometry;
}

const shapes = new Map();

// One of the shapes, made once and shared by every level's
function shapeOf(name, make) {
    if (!shapes.has(name)) {
        shapes.set(name, make());
    }

    return shapes.get(name);
}

/** An egg, a metre long (along z): a smooth oval, a little fuller at one end, glossy ivory. */
export function eggGeometry() {
    return shapeOf("egg", () => {
        const [ivory, pale] = [linear(0xe2d8bc), linear(0xf4eedc)];
        const spine = Array.from({ length: 11 }, (_, k) => [0, 0, -0.5 + k / 10]);

        return geometryOf(ringed(spine, (t) => 0.32 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (1 + 0.1 * (t - 0.5)), (t) => ivory.map((c, i) => c + (pale[i] - c) * t), 10));
    });
}

/**
 * A larva, curled in a C as it lies on its side, a metre long round its curl: plump, its body in
 * soft rings, cream, its head small and amber at one end.
 */
export function larvaGeometry() {
    return shapeOf("larva", () => {
        const [cream, amber] = [linear(0xeee2c4), linear(0xb88a4a)];
        const n = 15;
        const curl = (Math.PI * 4) / 3;
        const bend = 1 / curl;
        const spine = Array.from({ length: n }, (_, k) => {
            const a = (k / (n - 1) - 0.5) * curl;

            return [Math.sin(a) * bend, 0, -Math.cos(a) * bend + bend];
        });
        const radius = (t) => (0.07 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (1 + 0.07 * Math.cos(t * Math.PI * 22));

        return geometryOf(ringed(spine, radius, (t) => (t > 0.9 ? amber : cream.map((c) => c * (0.92 + 0.08 * Math.cos(t * Math.PI * 22)))), 8));
    });
}

/** A pupa in its cocoon, a metre long (along z): barrel-shaped, papery tan, faintly ringed. */
export function pupaGeometry() {
    return shapeOf("pupa", () => {
        const [tan, dark] = [linear(0xc8a26a), linear(0x9a7646)];
        const spine = Array.from({ length: 11 }, (_, k) => [0, 0, -0.5 + k / 10]);
        const radius = (t) => 0.2 * Math.sin(Math.PI * Math.min(0.97, Math.max(0.03, t))) ** 0.55 * (1 + 0.04 * Math.cos(t * Math.PI * 14));

        return geometryOf(ringed(spine, radius, (t) => tan.map((c, i) => c + (dark[i] - c) * (t < 0.12 ? 0.6 : 0.15 * (0.5 + 0.5 * Math.cos(t * Math.PI * 14)))), 9));
    });
}

// --- The midden heap ---

/**
 * A midden's heap (`kind` "heap"), or one of the earth dug out ("spoil"), on its piece (`piece`: its
 * squares, x, y, w, h) and a number of its own (`rough`), its middle moved `out` metres ([x, z]) from
 * the piece's: { kind, x, z (its middle, level metres), radius, high (metres), seed }.
 */
export function heapOf(piece, rough, { kind = "heap", out = [0, 0] } = {}) {
    const random = randomOf(Math.floor(rough * 1e9) ^ (piece.x * 73856093) ^ (piece.y * 19349663));
    const { radius, high } = NEST_LIFE[kind];

    return { kind, x: piece.x + piece.w / 2 + out[0], z: piece.y + piece.h / 2 + out[1], radius: between(random, radius), high: between(random, high), seed: Math.floor(random() * 1e9) };
}

// How far out a heap reaches at an angle (0.8 to 1.2 of its radius, lumpy), and how high it is a
// share of the way out (1 at its middle, 0 at its edge)
function heapEdge(heap, a) {
    const s = heap.seed % 1000;

    return heap.radius * (1 + 0.12 * Math.sin(a * 3 + s) + 0.07 * Math.sin(a * 7 + s * 1.7));
}

// (Rounded over its top, its foot spread soft into the floor)
const heapRise = (share) => Math.max(0, 1 - share ** 1.7) ** 1.4;

/** How high a heap is at a point (level metres), 0 off it. */
export function heapHeightAt(heap, x, z) {
    const [dx, dz] = [x - heap.x, z - heap.z];
    const share = Math.hypot(dx, dz) / heapEdge(heap, Math.atan2(dz, dx));

    return share >= 1 ? 0 : heap.high * heapRise(share);
}

// What a heap's earth is tinted, by its kind (the picture underfoot drawn on it): its three
// colours, then a dark and a pale (a midden's grey-brown refuse, the dark of the ants' husks and the
// pale of bone; the dug earth's ochre and umber, fresher than the trodden floor, the dark of the
// soil under the meadow and the pale of the sand between its layers)
const FLECKS = Object.freeze({
    heap: [0x5e5040, 0x52463a, 0x6a5c4c, 0x2e2218, 0x9a8a70],
    spoil: [0x7a5638, 0x6e4c34, 0x8a6448, 0x4e3424, 0xa88860],
});

// How finely a heap's drawn, by its kind: rings out from its middle, and points round each (a
// midden's wide heap finer than the many small heaps of dug earth)
const DETAIL = Object.freeze({ heap: [12, 30], spoil: [7, 20] });

/**
 * Heaps' surfaces (`heaps`: heapOf's), all in one: each a lumpy mound, tinted as its kind is
 * (FLECKS), to be drawn with the picture underfoot. A BufferGeometry, level metres.
 */
export function heapGeometry(heaps) {
    const positions = [];
    const colours = [];
    const indices = [];

    for (const heap of heaps) {
        heapInto(heap, ...DETAIL[heap.kind ?? "heap"], { positions, colours, indices });
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

// One heap's points, colours and triangles, added to those given
function heapInto(heap, rings, sectors, { positions, colours, indices }) {
    const random = randomOf(heap.seed);
    const flecks = FLECKS[heap.kind ?? "heap"].map(linear);
    const first = positions.length / 3;

    positions.push(heap.x, heap.high, heap.z);
    colours.push(...flecks[0]);

    for (let r = 1; r <= rings; r++) {
        for (let s = 0; s < sectors; s++) {
            const a = (s / sectors) * Math.PI * 2;
            const share = r / rings;
            const reach = heapEdge(heap, a) * share;
            // (Lumpy: in broad swells round it, and a little in each point)
            const swell = Math.sin(a * 3 + (heap.seed % 97) + share * 4) * Math.sin(Math.PI * share) * 0.08;
            const lump = r < rings ? heap.high * (swell + (random() - 0.5) * 0.04) : 0;

            positions.push(heap.x + Math.cos(a) * reach, Math.max(0, heap.high * heapRise(share) + lump), heap.z + Math.sin(a) * reach);

            const pick = random();

            colours.push(...flecks[pick < 0.12 ? 3 : pick < 0.18 ? 4 : Math.floor(random() * 3)]);
        }
    }

    for (let s = 0; s < sectors; s++) {
        indices.push(first, first + 1 + ((s + 1) % sectors), first + 1 + s);
    }

    for (let r = 1; r < rings; r++) {
        for (let s = 0; s < sectors; s++) {
            const [a, b] = [first + 1 + (r - 1) * sectors + s, first + 1 + (r - 1) * sectors + ((s + 1) % sectors)];
            const [c, d] = [a + sectors, b + sectors];

            indices.push(a, b, d, a, d, c);
        }
    }
}

// --- Roots through the roof ---

/**
 * Roots hanging through a level's roof, over its open squares (`squares`: [[x, z]...], level
 * metres, their middles) how high the roof is over a point (`roofAt(x, z)`: metres) and how deep
 * the level is (`depth`, 0 the top): clusters of twisting tapered roots and fine rootlets, the more
 * the nearer the meadow, none of them nor their rootlets hanging lower than 2.1 m over the floor.
 * { tubes: { positions, colours, indices }, lines: { positions, colours } }.
 */
export function rootsUnder(squares, roofAt, depth, random) {
    const { share, long, count, rootlets } = NEST_LIFE.roots;
    const odds = share[Math.min(depth, share.length - 1)];
    const tubes = { positions: [], colours: [], indices: [] };
    const lines = { positions: [], colours: [] };
    const [dark, pale] = [linear(0x3a2a1c), linear(0x7a6448)];

    for (const [sx, sz] of squares) {
        if (random() >= odds) {
            continue;
        }

        const [x, z] = [sx + (random() - 0.5) * 0.6, sz + (random() - 0.5) * 0.6];
        const roof = roofAt(x, z);

        if (!(roof > 2.6)) {
            continue;
        }

        // (Its roots: each from the roof, down, twisting a little, thinning to its tip)
        const roots = Math.round(between(random, count));

        for (let k = 0; k < roots; k++) {
            // (Never down to where anyone's head is: 2.1 m clear under it)
            const length = Math.min(between(random, long), roof - 2.1);

            if (length < 0.25) {
                continue;
            }

            const [ox, oz] = [x + (random() - 0.5) * 0.4, z + (random() - 0.5) * 0.4];
            const [lean, way] = [0.15 + random() * 0.35, random() * Math.PI * 2];
            const thick = 0.02 + random() * 0.035;
            const spine = Array.from({ length: 6 }, (_, j) => {
                const t = j / 5;
                const wander = Math.sin(t * 5 + k * 2.1) * 0.06;

                return [ox + Math.cos(way) * lean * t * length + wander, roof + 0.04 - t * length, oz + Math.sin(way) * lean * t * length - wander];
            });
            const root = ringed(spine, (t) => thick * (1 - t * 0.85), (t) => dark.map((c, i) => c + (pale[i] - c) * t * 0.5), 5);
            const base = tubes.positions.length / 3;

            tubes.positions.push(...root.positions);
            tubes.colours.push(...root.colours);
            tubes.indices.push(...root.indices.map((index) => index + base));

            // (Its rootlets: fine hairs off it, hanging)
            const hairs = Math.round(between(random, rootlets) / roots);

            for (let h = 0; h < hairs; h++) {
                const from = spine[1 + Math.floor(random() * 4)];
                const drop = Math.min(0.12 + random() * 0.45, from[1] - 2.1);

                if (drop < 0.05) {
                    continue;
                }

                const to = [from[0] + (random() - 0.5) * 0.25, from[1] - drop, from[2] + (random() - 0.5) * 0.25];
                const mid = [(from[0] + to[0]) / 2 + (random() - 0.5) * 0.08, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2 + (random() - 0.5) * 0.08];

                lines.positions.push(...from, ...mid, ...mid, ...to);
                lines.colours.push(...dark, ...dark, ...dark, ...pale.map((c) => c * 0.7));
            }
        }
    }

    return { tubes, lines };
}

// --- A widow's web, and its prey ---

/**
 * A black widow's web where it waits under the roof (`spot`: [x, z], level metres): a tangle of
 * silk threads under the roof, some anchored to the walls, and sticky threads hanging from it to
 * the floor, as their webs are; `open(x, y, z)`, how far into the open a point is, and `roofAt(x,
 * z)`, the roof's height over a point (caverns.js cavern's). Line segments: [x, y, z, x, y, z...].
 */
export function webAround(spot, open, roofAt, random) {
    const { reach, knots: [under, walled], threads, hanging } = NEST_LIFE.web;
    const [cx, cz] = spot;
    const knots = [];
    const segments = [];

    // (Its knots: under the roof round where the widow waits, and on the walls, high up)
    for (let k = 0; k < under; k++) {
        const a = random() * Math.PI * 2;
        const r = Math.sqrt(random()) * reach;
        const [x, z] = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
        const roof = roofAt(x, z);

        if (roof > 1.5) {
            knots.push([x, roof - 0.05 - random() * 0.7, z]);
        }
    }

    for (let k = 0; k < walled; k++) {
        const a = random() * Math.PI * 2;
        const y = roofAt(cx, cz) - 0.4 - random() * 1;

        for (let s = 0.3; s <= reach * 1.4; s += 0.1) {
            const [x, z] = [cx + Math.cos(a) * s, cz + Math.sin(a) * s];

            if (open(x, y, z) <= 0) {
                knots.push([x - Math.cos(a) * 0.03, y, z - Math.sin(a) * 0.03]);
                break;
            }
        }
    }

    if (knots.length < 3) {
        return [];
    }

    // (The tangle: threads between knots near each other, each sagging, in three pieces)
    const count = Math.round(between(random, threads));

    for (let k = 0, tries = 0; k < count && tries < count * 6; tries++) {
        const a = knots[Math.floor(random() * knots.length)];
        const b = knots[Math.floor(random() * knots.length)];
        const apart = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

        if (a === b || apart > reach * 1.1) {
            continue;
        }

        const sag = apart * (0.05 + random() * 0.08);
        const point = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
        const [p, q] = [point(1 / 3), point(2 / 3)];

        segments.push(...a, ...p, ...p, ...q, ...q, ...b);
        k++;
    }

    // (The sticky threads, from the tangle straight down to the floor, where it's open)
    const drops = Math.round(between(random, hanging));

    for (let k = 0; k < drops; k++) {
        const from = knots[Math.floor(random() * knots.length)];
        const to = [from[0] + (random() - 0.5) * 0.3, 0.01, from[2] + (random() - 0.5) * 0.3];

        if (open(to[0], 0.3, to[2]) > 0.1) {
            segments.push(...from, ...to);
        }
    }

    return segments;
}

// How wide a body wrapped in silk is, from its head (0) to its feet (1), metres at a metre long:
// the head, the neck, the shoulders widest, the hips, the legs bound together, tapering
const WRAPPED = [[0, 0.015], [0.04, 0.065], [0.09, 0.08], [0.15, 0.06], [0.23, 0.15], [0.34, 0.145], [0.5, 0.12], [0.62, 0.105], [0.8, 0.075], [0.94, 0.05], [1, 0.012]];

/**
 * Prey wrapped in silk, hung from a thread: a body a metre long (along y, its head at 0), bound
 * round and round in dusty silk, its windings paler, darker where what's inside shows through and
 * at its feet. Made once and shared.
 */
export function cocoonGeometry() {
    return shapeOf("cocoon", () => {
        const [silk, shadow, grime] = [linear(0xb3ac9b), linear(0x6e6556), linear(0x5a4a38)];
        const spine = Array.from({ length: 25 }, (_, k) => [0.015 * Math.sin(k * 0.5), -k / 24, 0.012 * Math.cos(k * 0.7)]);
        const radius = (t) => {
            const k = WRAPPED.findIndex(([at]) => at >= t);
            const [[t0, r0], [t1, r1]] = [WRAPPED[Math.max(0, k - 1)], WRAPPED[k]];
            const s = t1 > t0 ? (t - t0) / (t1 - t0) : 0;

            return (r0 + (r1 - r0) * (s * s * (3 - 2 * s))) * (1 + 0.05 * Math.sin(t * 37) + 0.03 * Math.sin(t * 71));
        };
        // (Wound round and round: a band of paler silk spiralling down it, the shadow between)
        const colour = (t, side) => {
            const wound = 0.5 + 0.5 * Math.sin((t * 9 + side) * Math.PI * 2);
            const under = shadow.map((c, i) => c + (silk[i] - c) * (0.45 + 0.55 * wound));

            return under.map((c, i) => c + (grime[i] - c) * Math.max(0, (t - 0.75) * 2.4));
        };

        return geometryOf(ringed(spine, radius, colour, 12));
    });
}
