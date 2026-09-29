// The land's own things, drawn: the features core/wilds.js places (boulders and outcrops, fallen
// trees, stumps, dead trees, bushes, cairns, standing stones, termite mounds, haystacks,
// scarecrows, log piles, ruined walls, a great beast's ribs), and the undergrowth between them,
// which is the drawing's alone (it's in no one's way): tufts of grass, wildflowers of a dozen
// kinds, ferns, reeds, mushrooms, pebbles and stones, sticks, fallen leaves, molehills, rabbit
// holes, bones, cacti, tumbleweed, shards of obsidian, shells and driftwood.
//
// Every look is made here from a seed, several of each (VARIANTS), once, the first time it's
// wanted: rocks are balls pushed in and out by noise and cut flat by a few planes (so they break
// into facets as stone does); trunks and branches are tapered, bent tubes; blades of grass and
// petals are real geometry, not pictures with holes in, so nothing is drawn twice over the same
// pixel and the GPU keeps its early depth test. Each is placed turned its own way, stretched a
// little and tinted a little, so no two look alike, and a chunk's are baked into one mesh drawn
// with the atlas (engine/atlas.js: the rocks, bark and silvered wood its textures, the rest its
// plain colours): the features in one, always drawn, casting shadows; the undergrowth in another,
// only near the player (wildsMaterial: it sways in the breeze, and sinks into the ground before
// it's far enough off to be missed).
//
// Where the undergrowth grows comes from each square of the chunk: grass, not blocked, no road,
// bridge or water (thinner in settlements), how much and of what from its land (UNDERGROWTH) and
// smooth fields across the world (core/noise.js), so flowers grow in drifts of one kind, tufts in
// clumps, pebbles where it's rocky and sticks where it's let go, and bare stretches between.

import * as THREE from "three";
import { hashOf, fractal } from "../../../core/noise.js";
import { GROUND } from "../../../core/setpieces/pieces.js";
import { neglect, rockiness } from "../../../core/wilds.js";
import { LAYERS, atlasMaterial, wildsMaterial } from "../engine/atlas.js";
import { MATERIALS } from "../engine/painters.js";
import { TREE_WIND } from "./trees.js";

const TAU = Math.PI * 2;

// Each layer's index, and how many metres one copy of its texture covers
const LAYER = Object.fromEntries(LAYERS.map((name, k) => [name, k]));
const METRES = Object.fromEntries(Object.entries(MATERIALS).map(([name, { world }]) => [name, world / 5]));

// A colour (sRGB hex) as the vertices want it: linear RGB
const _colour = new THREE.Color();
const linear = (hex) => {
    _colour.setHex(hex);

    return [_colour.r, _colour.g, _colour.b];
};

// --- Building geometry ---

/**
 * Triangles, each vertex with its position, normal, colour (linear RGB, times its layer's
 * texture), texture coordinates (in copies of its layer's texture), layer, and how much it sways
 * (0 to 1). Grows as it's filled.
 */
class Mesher {
    constructor(capacity = 1024) {
        this.count = 0;
        this.#allocate(capacity);
    }

    #allocate(capacity) {
        const old = this.arrays;

        this.capacity = capacity;
        this.arrays = { position: new Float32Array(capacity * 3), normal: new Float32Array(capacity * 3), color: new Float32Array(capacity * 3), uv: new Float32Array(capacity * 2), layer: new Float32Array(capacity), sway: new Float32Array(capacity) };

        if (old) {
            for (const [name, array] of Object.entries(old)) {
                this.arrays[name].set(array);
            }
        }
    }

    /** Room for `more` vertices. */
    reserve(more) {
        if (this.count + more > this.capacity) {
            this.#allocate(Math.max(this.capacity * 2, this.count + more));
        }
    }

    /** One vertex. */
    vertex(p, n, c, uv, layer, sway) {
        this.reserve(1);

        const { position, normal, color, uv: uvs, layer: layers, sway: sways } = this.arrays;
        const i = this.count++;

        position.set(p, i * 3);
        normal.set(n, i * 3);
        color.set(c, i * 3);
        uvs[i * 2] = uv[0];
        uvs[i * 2 + 1] = uv[1];
        layers[i] = layer;
        sways[i] = sway;
    }

    /**
     * A triangle of three points (counter-clockwise seen from outside), lit flat unless `normals`
     * are given; `colours` one for all or one each; texture coordinates given, or projected onto
     * the plane it faces most (`uvScale` metres to a copy); `sways` one for all or one each.
     */
    tri(a, b, c, { layer = LAYER.plain, colours = [1, 1, 1], normals = null, uvs = null, uvScale = 1, sways = 0 } = {}) {
        const flat = normals ? null : faceNormal(a, b, c);
        const points = [a, b, c];
        const each = Array.isArray(colours[0]) ? colours : [colours, colours, colours];
        const swaying = Array.isArray(sways) ? sways : [sways, sways, sways];
        const axis = flat ? dominant(flat) : 1;

        for (let k = 0; k < 3; k++) {
            const p = points[k];
            const uv = uvs ? uvs[k] : axis === 0 ? [p[2] / uvScale, p[1] / uvScale] : axis === 1 ? [p[0] / uvScale, p[2] / uvScale] : [p[0] / uvScale, p[1] / uvScale];

            this.vertex(p, normals ? normals[k] : flat, each[k], uv, layer, swaying[k]);
        }
    }

    /** A quad (two triangles), its corners counter-clockwise seen from outside. */
    quad(a, b, c, d, options = {}) {
        const colours = options.colours && Array.isArray(options.colours[0]) ? options.colours : null;
        const sways = Array.isArray(options.sways) ? options.sways : null;
        const uvs = options.uvs ?? null;
        const normals = options.normals ?? null;

        this.tri(a, b, c, { ...options, colours: colours ? [colours[0], colours[1], colours[2]] : options.colours, sways: sways ? [sways[0], sways[1], sways[2]] : options.sways, uvs: uvs && [uvs[0], uvs[1], uvs[2]], normals: normals && [normals[0], normals[1], normals[2]] });
        this.tri(a, c, d, { ...options, colours: colours ? [colours[0], colours[2], colours[3]] : options.colours, sways: sways ? [sways[0], sways[2], sways[3]] : options.sways, uvs: uvs && [uvs[0], uvs[2], uvs[3]], normals: normals && [normals[0], normals[2], normals[3]] });
    }

    /** What's been made, trimmed to size: a part to place (place()). */
    part() {
        const n = this.count;
        const { position, normal, color, uv, layer, sway } = this.arrays;
        let top = 0;

        for (let i = 1; i < n * 3; i += 3) {
            top = Math.max(top, position[i]);
        }

        return { count: n, top, position: position.slice(0, n * 3), normal: normal.slice(0, n * 3), color: color.slice(0, n * 3), uv: uv.slice(0, n * 2), layer: layer.slice(0, n), sway: sway.slice(0, n) };
    }

    /** A Three.js geometry of what's been made (with `sway` if `swaying`). */
    geometry(swaying = false) {
        const n = this.count;
        const { position, normal, color, uv, layer, sway } = this.arrays;
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(position.slice(0, n * 3), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(normal.slice(0, n * 3), 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(color.slice(0, n * 3), 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv.slice(0, n * 2), 2));
        geometry.setAttribute("layer", new THREE.BufferAttribute(layer.slice(0, n), 1));

        if (swaying) {
            geometry.setAttribute("sway", new THREE.BufferAttribute(sway.slice(0, n), 1));
        }

        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();

        return geometry;
    }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
    const l = length(a) || 1;

    return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a, b, t) => a.map((value, k) => value + (b[k] - value) * t);
const faceNormal = (a, b, c) => unit(cross(sub(b, a), sub(c, a)));

// Which axis a normal points most along (0 x, 1 y, 2 z)
function dominant([x, y, z]) {
    const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)];

    return ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
}

/**
 * Place a part into a mesher: turned `turn` about the upright, tilted, stretched by `scale` ([x,
 * y, z]), at `at` ([x, y, z]), its colours times `tint` (and its texture shifted by `shift`, so
 * no two rocks show the same patch of stone).
 */
function place(mesher, part, { at, turn = 0, tilt = [0, 0], scale = [1, 1, 1], tint = [1, 1, 1], shift = [0, 0] }) {
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const [ca, sa, cb, sb] = [Math.cos(tilt[0]), Math.sin(tilt[0]), Math.cos(tilt[1]), Math.sin(tilt[1])];

    // Tilted about x, then about z, then turned about the upright, as one matrix (by rows)
    const m = [cb * c, -ca * sb * c + sa * s, sa * sb * c + ca * s, sb, ca * cb, -sa * cb, -cb * s, ca * sb * s + sa * c, -sa * sb * s + ca * c];

    const n = part.count;

    mesher.reserve(n);

    const { position, normal, color, uv, layer, sway } = mesher.arrays;
    const [sx, sy, sz] = scale;
    const [ix, iy, iz] = [1 / sx, 1 / sy, 1 / sz];
    const base = mesher.count;
    const [P, N, C, U, L, S] = [part.position, part.normal, part.color, part.uv, part.layer, part.sway];

    const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = m;
    const [ax, ay, az, t0, t1, t2, u0, u1] = [at[0], at[1], at[2], tint[0], tint[1], tint[2], shift[0], shift[1]];

    for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        const j3 = (base + i) * 3;
        const x = P[i3] * sx;
        const y = P[i3 + 1] * sy;
        const z = P[i3 + 2] * sz;
        const a = N[i3] * ix;
        const b = N[i3 + 1] * iy;
        const d = N[i3 + 2] * iz;
        const nx = m0 * a + m1 * b + m2 * d;
        const ny = m3 * a + m4 * b + m5 * d;
        const nz = m6 * a + m7 * b + m8 * d;
        const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);

        position[j3] = m0 * x + m1 * y + m2 * z + ax;
        position[j3 + 1] = m3 * x + m4 * y + m5 * z + ay;
        position[j3 + 2] = m6 * x + m7 * y + m8 * z + az;
        normal[j3] = nx * l;
        normal[j3 + 1] = ny * l;
        normal[j3 + 2] = nz * l;
        color[j3] = C[i3] * t0;
        color[j3 + 1] = C[i3 + 1] * t1;
        color[j3 + 2] = C[i3 + 2] * t2;
        uv[(base + i) * 2] = U[i * 2] + u0;
        uv[(base + i) * 2 + 1] = U[i * 2 + 1] + u1;
        layer[base + i] = L[i];
        sway[base + i] = S[i];
    }

    mesher.count += n;
}

// 3D value noise from 0 to 1 (for pushing rocks in and out)
function noise3(x, y, z, seed) {
    const [x0, y0, z0] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const smooth = (t) => t * t * (3 - 2 * t);
    const [fx, fy, fz] = [smooth(x - x0), smooth(y - y0), smooth(z - z0)];
    const at = (i, j, k) => hashOf(i + k * 157, j - k * 311, seed + k * 7);
    const plane = (k) => {
        const top = at(x0, y0, k) + (at(x0 + 1, y0, k) - at(x0, y0, k)) * fx;
        const bottom = at(x0, y0 + 1, k) + (at(x0 + 1, y0 + 1, k) - at(x0, y0 + 1, k)) * fx;

        return top + (bottom - top) * fy;
    };

    return plane(z0) + (plane(z0 + 1) - plane(z0)) * fz;
}

// A seeded random: next() from 0 to 1, range(a, b), int(a, b), pick(list), chance(p)
function randomOf(seed) {
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

// The points of a unit ball of triangles, `detail` times divided (each triangle's corners)
const balls = new Map();

function ballOf(detail) {
    if (!balls.has(detail)) {
        const geometry = detail < 0 ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, detail);
        const position = geometry.attributes.position.array;
        const faces = [];

        for (let i = 0; i < position.length; i += 9) {
            faces.push([0, 1, 2].map((k) => [position[i + k * 3], position[i + k * 3 + 1], position[i + k * 3 + 2]]));
        }

        geometry.dispose();
        balls.set(detail, faces);
    }

    return balls.get(detail);
}

// --- Rocks ---

/**
 * A rock, about a metre across and standing on the ground, into a mesher: a ball (`detail` times
 * divided: -1 an octahedron) pushed in and out by noise (`rough`), cut flat by `cuts` planes (its
 * facets), squashed to `squash` of its width tall and sunk a little into the ground; textured
 * with `layer`, darker at its foot, and green with moss (`moss`), white with snow (`snow`) or
 * flecked with lichen (`lichen`) on top.
 */
function rock(mesher, random, { detail = 1, rough = 0.28, cuts = 4, squash = 0.7, layer = "rock", moss = 0, snow = 0, lichen = 0.2, stretch = [1, 1] } = {}) {
    const seed = random.int(1, 1e6);
    const planes = Array.from({ length: cuts }, () => {
        const normal = unit([random.range(-1, 1), random.range(-0.2, 1), random.range(-1, 1)]);

        return { normal, at: random.range(0.62, 0.9) };
    });
    const shaped = new Map();
    const shape = (p) => {
        const key = p.map((v) => v.toFixed(4)).join();

        if (!shaped.has(key)) {
            let r = 1 + rough * (noise3(p[0] * 1.8 + 5, p[1] * 1.8 + 5, p[2] * 1.8 + 5, seed) - 0.5) * 2 + 0.08 * (noise3(p[0] * 5, p[1] * 5, p[2] * 5, seed + 1) - 0.5);

            for (const { normal, at } of planes) {
                const along = p[0] * normal[0] + p[1] * normal[1] + p[2] * normal[2];

                if (along * r > at) {
                    r = at / along;
                }
            }

            const y = p[1] * r * squash;

            shaped.set(key, [p[0] * r * 0.5 * stretch[0], Math.max(-0.12, y * 0.5 + squash * 0.32), p[2] * r * 0.5 * stretch[1]]);
        }

        return shaped.get(key);
    };
    const [mossy, snowy, grey] = [linear(0x6f8a45), [1.18, 1.2, 1.22], [1, 1, 1]];
    const top = squash * 0.82;

    for (const face of ballOf(detail)) {
        const [a, b, c] = face.map(shape);
        const normal = faceNormal(a, b, c);
        const colours = [a, b, c].map((p) => {
            const foot = 0.55 + 0.45 * Math.min(1, Math.max(0, p[1] / top));
            let colour = grey.map((v) => v * foot);

            if (moss && normal[1] > 0.35) {
                const amount = Math.min(1, moss * (normal[1] - 0.35) * 2.2 * (0.5 + noise3(p[0] * 4, p[1] * 4, p[2] * 4, seed + 2)));

                colour = lerp(colour, mossy.map((v) => v * foot * 1.6), amount);
            }

            if (snow && normal[1] > 0.45) {
                colour = lerp(colour, snowy, Math.min(1, snow * (normal[1] - 0.45) * 3));
            }

            return colour;
        });

        if (lichen && random.chance(lichen * 0.25)) {
            const fleck = random.pick([linear(0xc8c07a), linear(0xa9b48e), linear(0xd9d4c4)]);

            colours[random.int(0, 2)] = fleck.map((v) => v * 1.1);
        }

        mesher.tri(a, b, c, { layer: LAYER[layer], colours, uvScale: METRES[layer] ?? 1 });
    }
}

/** A part made by drawing into a fresh mesher. */
function made(draw) {
    const mesher = new Mesher();

    draw(mesher);

    return mesher.part();
}

// --- Tubes and turned shapes ---

// Two directions square to a direction and to each other
function frameOf(direction) {
    const d = unit(direction);
    const helper = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = unit(cross(d, helper));

    return [u, cross(u, d)];
}

/**
 * A tube through points ([x, y, z]), its radius at each (`radii`), `sides` round: the rings
 * square to the way it runs; textured with `layer` (round it and along it, `uvScale` metres to
 * a copy), coloured by ring (`colours`: one, or one a ring), swaying by ring (`sways`), closed at
 * its ends if asked (`caps`: [start, end], each true, or a colour for the cut face).
 */
function tube(mesher, points, radii, sides, { layer = LAYER.plain, colours = [1, 1, 1], sways = 0, uvScale = 1, caps = [false, false], wobble = null } = {}) {
    const rings = points.map((p, k) => {
        const along = unit(sub(points[Math.min(points.length - 1, k + 1)], points[Math.max(0, k - 1)]));
        const [u, v] = frameOf(along);

        return Array.from({ length: sides }, (_, j) => {
            const angle = (j / sides) * TAU;
            const r = radii[k] * (wobble ? wobble(k, j) : 1);
            const out = [u[0] * Math.cos(angle) + v[0] * Math.sin(angle), u[1] * Math.cos(angle) + v[1] * Math.sin(angle), u[2] * Math.cos(angle) + v[2] * Math.sin(angle)];

            return { p: [p[0] + out[0] * r, p[1] + out[1] * r, p[2] + out[2] * r], n: out };
        });
    });
    const ringColour = (k) => (Array.isArray(colours[0]) ? colours[Math.min(k, colours.length - 1)] : colours);
    const ringSway = (k) => (Array.isArray(sways) ? sways[Math.min(k, sways.length - 1)] : sways);
    let run = 0;

    for (let k = 0; k < rings.length - 1; k++) {
        const step = length(sub(points[k + 1], points[k]));

        for (let j = 0; j < sides; j++) {
            const [a, b, c, d] = [rings[k][j], rings[k][(j + 1) % sides], rings[k + 1][(j + 1) % sides], rings[k + 1][j]];
            const [u0, u1] = [(j / sides) * TAU * radii[k] / uvScale, ((j + 1) / sides) * TAU * radii[k] / uvScale];

            mesher.quad(a.p, d.p, c.p, b.p, {
                layer,
                normals: [a.n, d.n, c.n, b.n],
                colours: [ringColour(k), ringColour(k + 1), ringColour(k + 1), ringColour(k)],
                sways: [ringSway(k), ringSway(k + 1), ringSway(k + 1), ringSway(k)],
                uvs: [[u0, run / uvScale], [u0, (run + step) / uvScale], [u1, (run + step) / uvScale], [u1, run / uvScale]],
            });
        }

        run += step;
    }

    for (const [end, k] of [[0, 0], [1, rings.length - 1]]) {
        if (!caps[end]) {
            continue;
        }

        const centre = points[k];
        const colour = Array.isArray(caps[end]) ? caps[end] : ringColour(k);

        for (let j = 0; j < sides; j++) {
            const [a, b] = [rings[k][j].p, rings[k][(j + 1) % sides].p];

            if (end === 0) {
                mesher.tri(centre, a, b, { layer: LAYER.plain, colours: colour, sways: ringSway(k) });
            } else {
                mesher.tri(centre, b, a, { layer: LAYER.plain, colours: colour, sways: ringSway(k) });
            }
        }
    }
}

/**
 * A shape turned on a lathe about the upright: `profile` [[radius, height]...] from the bottom up,
 * `sides` round, each ring's radius pushed in and out by `jitter` (0: none), coloured by ring.
 */
function lathe(mesher, profile, sides, { layer = LAYER.plain, colours = [1, 1, 1], jitter = 0, random = null, sways = 0, uvScale = 1, twist = 0 } = {}) {
    const rings = profile.map(([r, y], k) => Array.from({ length: sides }, (_, j) => {
        const angle = ((j + (k % 2) * twist) / sides) * TAU;
        const push = jitter && random && r > 0 ? 1 + random.range(-jitter, jitter) : 1;

        return [Math.cos(angle) * r * push, y, Math.sin(angle) * r * push];
    }));
    const ringColour = (k) => (Array.isArray(colours[0]) ? colours[Math.min(k, colours.length - 1)] : colours);
    const ringSway = (k) => (Array.isArray(sways) ? sways[Math.min(k, sways.length - 1)] : sways);

    for (let k = 0; k < rings.length - 1; k++) {
        for (let j = 0; j < sides; j++) {
            const [a, b, c, d] = [rings[k][j], rings[k][(j + 1) % sides], rings[k + 1][(j + 1) % sides], rings[k + 1][j]];
            const options = { layer, uvScale, colours: [ringColour(k), ringColour(k + 1), ringColour(k + 1), ringColour(k)], sways: [ringSway(k), ringSway(k + 1), ringSway(k + 1), ringSway(k)] };

            if (profile[k + 1][0] === 0) {
                mesher.tri(a, d, b, { ...options, colours: [ringColour(k), ringColour(k + 1), ringColour(k)], sways: [ringSway(k), ringSway(k + 1), ringSway(k)] });
            } else {
                mesher.quad(a, d, c, b, options);
            }
        }
    }
}

// Points along a gently bending line from `a` to `b`, `count` of them, bent up to `bend` metres
// out of true (a random way)
function bent(random, a, b, count, bend) {
    const [u, v] = frameOf(sub(b, a));
    const [su, sv] = [random.range(-bend, bend), random.range(-bend, bend)];

    return Array.from({ length: count }, (_, k) => {
        const t = k / (count - 1);
        const off = Math.sin(t * Math.PI);

        return [a[0] + (b[0] - a[0]) * t + (u[0] * su + v[0] * sv) * off, a[1] + (b[1] - a[1]) * t + (u[1] * su + v[1] * sv) * off, a[2] + (b[2] - a[2]) * t + (u[2] * su + v[2] * sv) * off];
    });
}

// --- Wood ---

const END_GRAIN = linear(0xc9ae84);
const ROOT_EARTH = linear(0x4a3524);

/**
 * A tree long fallen and gone silver, lying along x: about a metre long (placed stretched to its
 * length), its trunk bending and tapering, bark still on here and there, broken branches sticking
 * up out of it, its root plate torn up at one end with earth still in it, and the other end
 * splintered where it snapped.
 */
function fallenTree(mesher, random) {
    const r0 = random.range(0.055, 0.07);
    const r1 = r0 * random.range(0.45, 0.65);
    const points = bent(random, [-0.5, r0 * 0.85, 0], [0.5, r1 * 0.8, 0], 6, 0.03).map(([x, y, z]) => [x, y, z]);
    const barked = random.chance(0.5);
    const layer = barked ? LAYER.bark : LAYER.deadwood;

    tube(mesher, points, points.map((_, k) => r0 + (r1 - r0) * (k / (points.length - 1))), 7, {
        layer,
        uvScale: METRES[barked ? "bark" : "deadwood"] * 0.1,
        wobble: (k, j) => 1 + 0.08 * Math.sin(j * 2.3 + k * 1.7),
        caps: [false, END_GRAIN],
    });

    // Its root plate, torn up standing on edge, earth in it, roots sticking out
    const plate = r0 * random.range(2.6, 3.4);
    const [px, py] = [-0.5 - 0.01, plate * 0.72];
    const rim = Array.from({ length: 10 }, (_, k) => {
        const angle = (k / 10) * TAU;
        const r = plate * random.range(0.7, 1.1);

        return [px + random.range(-0.01, 0.01), py + Math.sin(angle) * r, Math.cos(angle) * r];
    });

    for (let k = 0; k < rim.length; k++) {
        const [a, b] = [rim[k], rim[(k + 1) % rim.length]];

        mesher.tri([px - 0.012, py, 0], a, b, { colours: ROOT_EARTH });
        mesher.tri([px + 0.004, py, 0], b, a, { colours: ROOT_EARTH.map((v) => v * 1.2) });
    }

    for (let k = 0; k < random.int(5, 8); k++) {
        const angle = random.range(0, TAU);
        const from = [px - 0.004, py + Math.sin(angle) * plate * 0.6, Math.cos(angle) * plate * 0.6];
        const to = [px - random.range(0.02, 0.06), py + Math.sin(angle) * plate * random.range(1.2, 1.6), Math.cos(angle) * plate * random.range(1.2, 1.6)];

        tube(mesher, [from, to], [r0 * 0.18, r0 * 0.04], 4, { layer: LAYER.deadwood, uvScale: 0.5 });
    }

    // Broken branches
    for (let k = 0; k < random.int(2, 4); k++) {
        const t = random.range(0.15, 0.85);
        const at = points[Math.round(t * (points.length - 1))];
        const angle = random.pick([-1, 1]) * random.range(0.7, 1.35);
        const reach = random.range(0.05, 0.14);
        const tip = [at[0] + random.range(0.01, 0.07), at[1] + Math.cos(angle) * reach, at[2] + Math.sin(angle) * reach];

        tube(mesher, [at, tip], [r0 * 0.3, r0 * 0.14], 5, { layer: LAYER.deadwood, uvScale: 0.6, caps: [false, END_GRAIN] });
    }
}

/**
 * An old stump, about a metre across (placed at its size): sawn or broken off, its roots
 * flaring into the ground, its top pale where it was cut, and shelf fungus on its side now and
 * then.
 */
function stump(mesher, random) {
    const r = 0.5;
    const height = random.range(0.5, 0.9);
    const sawn = random.chance(0.5);
    const profile = [[r * 1.25, -0.02], [r * 1.05, height * 0.15], [r, height * 0.6], [r * 0.97, height]];

    lathe(mesher, profile, 9, { layer: LAYER.bark, uvScale: METRES.bark, jitter: 0.06, random, colours: [[0.7, 0.7, 0.7], [0.9, 0.9, 0.9], [1, 1, 1], [1, 1, 1]] });

    // Its top: sawn flat and pale, or broken off jagged
    const rim = Array.from({ length: 9 }, (_, j) => {
        const angle = (j / 9) * TAU;

        return [Math.cos(angle) * r * 0.97, height + (sawn ? 0 : random.range(0, 0.25)), Math.sin(angle) * r * 0.97];
    });
    const middle = [0, height + (sawn ? 0 : random.range(0.05, 0.3)), 0];

    for (let j = 0; j < 9; j++) {
        mesher.tri(middle, rim[(j + 1) % 9], rim[j], { colours: [END_GRAIN.map((v) => v * 1.1), END_GRAIN.map((v) => v * 0.8), END_GRAIN.map((v) => v * 0.8)] });
    }

    // Roots running out along the ground
    for (let k = 0; k < random.int(3, 5); k++) {
        const angle = random.range(0, TAU);
        const out = random.range(0.8, 1.4);

        tube(mesher, [[Math.cos(angle) * r * 0.8, height * 0.2, Math.sin(angle) * r * 0.8], [Math.cos(angle) * r * out * 1.3, -0.02, Math.sin(angle) * r * out * 1.3]], [r * 0.25, r * 0.06], 5, { layer: LAYER.bark, uvScale: METRES.bark });
    }

    // Shelf fungus
    if (random.chance(0.45)) {
        const colour = random.pick([linear(0xc98a3a), linear(0xd8c9a4), linear(0x9c6a3c)]);

        for (let k = 0; k < random.int(1, 3); k++) {
            const angle = random.range(0, TAU);
            const y = random.range(0.15, 0.7) * height;
            const [cx, cz] = [Math.cos(angle) * r, Math.sin(angle) * r];
            const size = random.range(0.12, 0.2);
            const edge = Array.from({ length: 5 }, (_, j) => {
                const a = angle + ((j / 4) - 0.5) * 2.2;

                return [cx + Math.cos(a) * size, y, cz + Math.sin(a) * size];
            });

            for (let j = 0; j < 4; j++) {
                mesher.tri([cx * 0.95, y + 0.02, cz * 0.95], edge[j + 1], edge[j], { colours: colour });
            }
        }
    }
}

/**
 * A tree dead and still standing, bleached and bare, about a metre tall (placed at its height):
 * its trunk leaning a little and tapering to a broken top, a few bare branches reaching up.
 */
function snag(mesher, random) {
    const r0 = random.range(0.035, 0.05);
    const lean = [random.range(-0.06, 0.06), 0, random.range(-0.06, 0.06)];
    const points = bent(random, [0, -0.02, 0], [lean[0], 1, lean[2]], 5, 0.02);

    tube(mesher, points, points.map((_, k) => r0 * (1 - (k / (points.length - 1)) * 0.72)), 6, { layer: LAYER.deadwood, uvScale: 0.25, caps: [false, END_GRAIN] });

    for (let k = 0; k < random.int(3, 5); k++) {
        const t = random.range(0.35, 0.9);
        const from = points[Math.round(t * (points.length - 1))];
        const angle = random.range(0, TAU);
        const reach = random.range(0.12, 0.3) * (1.1 - t);
        const tip = [from[0] + Math.cos(angle) * reach, from[1] + reach * random.range(0.6, 1.3), from[2] + Math.sin(angle) * reach];
        const middle = lerp(from, tip, 0.5).map((v, i) => (i === 1 ? v - reach * 0.15 : v));

        tube(mesher, [from, middle, tip], [r0 * 0.35, r0 * 0.22, r0 * 0.06], 4, { layer: LAYER.deadwood, uvScale: 0.25 });
    }
}

/** A pile of logs, about a metre long (placed at its size): three, then two, then one, their ends pale. */
function logPile(mesher, random) {
    const r = random.range(0.07, 0.09);

    for (const [row, count] of [[0, 3], [1, 2], [2, 1]]) {
        for (let j = 0; j < count; j++) {
            const z = (j - (count - 1) / 2) * r * 2.05;
            const y = r + row * r * 1.75;
            const shift = random.range(-0.05, 0.05);

            tube(mesher, [[-0.5 + shift, y, z], [0.5 + shift, y, z]], [r * random.range(0.9, 1.05), r * random.range(0.9, 1.05)], 6, { layer: LAYER.bark, uvScale: METRES.bark * 0.2, caps: [END_GRAIN, END_GRAIN] });
        }
    }
}

// --- Stone ---

/** A cairn: flat stones stacked, smaller as they go up, about a metre tall (placed at its height). */
function cairn(mesher, random, layer) {
    let y = 0;
    const count = random.int(5, 8);

    for (let k = 0; k < count; k++) {
        const width = 0.62 * (1 - (k / count) * 0.6) * random.range(0.85, 1.1);
        const tall = random.range(0.13, 0.2);
        const part = made((inner) => rock(inner, random, { detail: 0, rough: 0.2, cuts: 2, squash: 0.45, layer, lichen: 0.4 }));

        place(mesher, part, { at: [random.range(-0.04, 0.04), y - tall * 0.25, random.range(-0.04, 0.04)], turn: random.range(0, TAU), scale: [width, tall / 0.37, width * random.range(0.8, 1)], shift: [random.next(), random.next()] });
        y += tall * 0.78;
    }
}

/** A standing stone, about a metre tall (placed at its height): tall and flat-sided, leaning a little, lichened. */
function menhir(mesher, random, layer) {
    const part = made((inner) => rock(inner, random, { detail: 1, rough: 0.16, cuts: 5, squash: 1, layer, lichen: 0.8 }));

    place(mesher, part, { at: [0, -0.05, 0], turn: random.range(0, TAU), tilt: [random.range(-0.08, 0.08), random.range(-0.08, 0.08)], scale: [0.42, 1.18, 0.28], shift: [random.next(), random.next()] });
}

/**
 * An outcrop, about a metre across (placed at its size): a few angular stones breaking out of the
 * ground together, the biggest in the middle.
 */
function outcrop(mesher, random, look) {
    const count = random.int(3, 6);

    for (let k = 0; k < count; k++) {
        const angle = random.range(0, TAU);
        const out = k === 0 ? 0 : random.range(0.18, 0.42);
        const size = k === 0 ? random.range(0.45, 0.6) : random.range(0.18, 0.36);
        const part = made((inner) => rock(inner, random, { detail: k === 0 ? 1 : 0, rough: 0.2, cuts: k === 0 ? 6 : 3, squash: random.range(0.5, 0.95), ...look }));

        place(mesher, part, { at: [Math.cos(angle) * out, -0.03, Math.sin(angle) * out], turn: random.range(0, TAU), tilt: [random.range(-0.25, 0.25), random.range(-0.25, 0.25)], scale: [size, size * random.range(0.8, 1.4), size * random.range(0.7, 1)], shift: [random.next(), random.next()] });
    }
}

/**
 * Basalt columns (the volcanic lands' outcrops), about a metre across: six-sided pillars packed
 * together, standing to different heights.
 */
function columns(mesher, random) {
    const colour = (y) => [0.6 + 0.4 * y, 0.6 + 0.4 * y, 0.62 + 0.4 * y];

    for (let k = 0; k < random.int(5, 9); k++) {
        const angle = random.range(0, TAU);
        const out = k === 0 ? 0 : random.range(0.14, 0.38);
        const [cx, cz] = [Math.cos(angle) * out, Math.sin(angle) * out];
        const r = random.range(0.09, 0.13);
        const height = random.range(0.25, 1) * (1 - out);

        lathe({ tri: (a, b, c, o) => mesher.tri(...[a, b, c].map(([x, y, z]) => [x + cx, y, z + cz]), o), quad: (a, b, c, d, o) => mesher.quad(...[a, b, c, d].map(([x, y, z]) => [x + cx, y, z + cz]), o) }, [[r, -0.02], [r, height], [0, height + r * 0.2]], 6, { layer: LAYER["rock-dark"], uvScale: METRES["rock-dark"] * 0.4, colours: [colour(0), colour(1), colour(1)] });
    }
}

/**
 * A stretch of ruined wall, about a metre long (placed at its length): courses of squared
 * stone, broken off unevenly along the top, a few blocks fallen at its foot.
 */
function ruin(mesher, random) {
    const courses = random.int(3, 5);
    const block = [0.14, 0.08, 0.1];
    const across = Math.floor(1 / block[0]);
    const tops = Array.from({ length: across }, (_, j) => Math.max(1, Math.round(courses * (0.35 + 0.65 * Math.sin((j / across) * Math.PI) * random.range(0.5, 1.1)))));
    const box = (x0, y0, z0, x1, y1, z1, shade) => {
        const c = [shade, shade, shade];
        const o = { layer: LAYER.stone, uvScale: METRES.stone * 0.08, colours: c };

        mesher.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], o);
        mesher.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], o);
        mesher.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], o);
        mesher.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], o);
        mesher.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], o);
    };

    for (let j = 0; j < across; j++) {
        for (let k = 0; k < tops[j]; k++) {
            const offset = (k % 2) * block[0] * 0.5;
            const x0 = -0.5 + j * block[0] + offset * (j === 0 ? 0 : 1);
            const x1 = Math.min(0.5, x0 + block[0] - 0.004);

            box(x0, k * block[1], -block[2] / 2, x1, (k + 1) * block[1] - 0.003, block[2] / 2, random.range(0.75, 1.05));
        }
    }

    for (let k = 0; k < random.int(2, 5); k++) {
        const [x, z] = [random.range(-0.5, 0.5), random.range(0.08, 0.2) * random.pick([-1, 1])];

        box(x, -0.01, z, x + block[0] * 0.9, block[1] * 0.9, z + block[2] * 0.8, random.range(0.7, 0.95));
    }
}

// --- Living things, and the dead ---

/**
 * A bush, about a metre across (placed at its size): a few lumpy rounds of leaves, darker below,
 * lighter on top; berries or flowers on some (`look`: its colours, and what's on it).
 */
function bush(mesher, random, { leaves, bloom = null, blooms = 0 }) {
    const count = random.int(2, 4);
    const surface = [];

    for (let k = 0; k < count; k++) {
        const angle = random.range(0, TAU);
        const out = k === 0 ? 0 : random.range(0.15, 0.3);
        const r = k === 0 ? random.range(0.38, 0.46) : random.range(0.22, 0.34);
        const centre = [Math.cos(angle) * out, r * 0.8, Math.sin(angle) * out];
        const seed = random.int(1, 1e6);

        for (const face of ballOf(k === 0 ? 1 : 0)) {
            const points = face.map((p) => {
                const push = 1 + 0.35 * (noise3(p[0] * 2.2 + k, p[1] * 2.2, p[2] * 2.2, seed) - 0.5);

                return [centre[0] + p[0] * r * push, Math.max(0, centre[1] + p[1] * r * push * 0.85), centre[2] + p[2] * r * push];
            });
            const colours = points.map((p) => {
                const shade = 0.55 + 0.6 * Math.min(1, p[1] / (r * 1.6));
                const tone = noise3(p[0] * 9, p[1] * 9, p[2] * 9, seed + 1);

                return leaves.map((v, i) => v * shade * (0.85 + tone * 0.3) * (i === 1 ? 1 + tone * 0.1 : 1));
            });

            mesher.tri(points[0], points[1], points[2], { colours });

            if (points[0][1] > r * 0.6) {
                surface.push(points[0]);
            }
        }
    }

    for (let k = 0; bloom && k < Math.min(blooms, 12) && surface.length; k++) {
        const p = random.pick(surface);
        const size = random.range(0.025, 0.04);

        for (const face of ballOf(-1)) {
            mesher.tri(...face.map(([x, y, z]) => [p[0] + x * size, p[1] + y * size, p[2] + z * size]), { colours: bloom.map((v) => v * random.range(0.85, 1.1)) });
        }
    }
}

/** A termite mound, about a metre tall (placed at its height): a lumpy spire of red earth, a smaller one or two leaning on it. */
function mound(mesher, random) {
    const earth = linear(random.pick([0xa0633f, 0x8c5a3a, 0xb07448]));
    const spire = (cx, cz, r, h) => {
        const profile = [[r, -0.02], [r * 0.85, h * 0.25], [r * 0.55, h * 0.55], [r * 0.3, h * 0.85], [0, h]];

        lathe({ tri: (a, b, c, o) => mesher.tri(...[a, b, c].map(([x, y, z]) => [x + cx, y, z + cz]), o), quad: (a, b, c, d, o) => mesher.quad(...[a, b, c, d].map(([x, y, z]) => [x + cx, y, z + cz]), o) }, profile, 7, { random, jitter: 0.18, colours: profile.map((_, k) => earth.map((v) => v * (0.8 + k * 0.07))) });
    };

    spire(0, 0, 0.32, 1);

    for (let k = 0; k < random.int(1, 2); k++) {
        const angle = random.range(0, TAU);

        spire(Math.cos(angle) * 0.22, Math.sin(angle) * 0.22, random.range(0.12, 0.18), random.range(0.35, 0.6));
    }
}

/** A haystack, about a metre across (placed at its size): straw, round and domed, a little lopsided. */
function haystack(mesher, random) {
    const profile = [[0.5, -0.02], [0.52, 0.3], [0.48, 0.55], [0.36, 0.8], [0.18, 0.95], [0, 1]];

    lathe(mesher, profile, 10, { layer: LAYER.thatch, uvScale: METRES.thatch * 0.3, random, jitter: 0.05, colours: profile.map((_, k) => [0.8 + k * 0.05, 0.8 + k * 0.05, 0.75 + k * 0.05]) });
}

/** A scarecrow, about a metre tall (placed at its height): a post and crossbar, a sack for a head under a hat, a ragged coat, straw at the sleeves. */
function scarecrow(mesher, random) {
    const wood = linear(0x6a4a32);
    const coat = linear(random.pick([0x7a3a2c, 0x4a5a3a, 0x5a4a6a, 0x8a7a5a]));
    const sack = linear(0xc9b48a);
    const straw = linear(0xd8bf6a);

    tube(mesher, [[0, -0.05, 0], [0, 0.9, 0]], [0.018, 0.016], 5, { colours: wood });
    tube(mesher, [[-0.28, 0.66, 0], [0.28, 0.66, 0]], [0.014, 0.014], 5, { colours: wood });

    // The coat: its body and sleeves, ragged at the hem
    const hem = Array.from({ length: 7 }, (_, j) => [-0.13 + j * (0.26 / 6), 0.28 + random.range(-0.03, 0.03), 0]);

    for (const side of [0.035, -0.035]) {
        const face = [[-0.14, 0.7, side], [0.14, 0.7, side]];

        for (let j = 0; j < hem.length - 1; j++) {
            const [a, b] = [[hem[j][0], hem[j][1], side], [hem[j + 1][0], hem[j + 1][1], side]];
            const top = lerp(face[0], face[1], (j + 0.5) / (hem.length - 1));

            mesher.tri(side > 0 ? a : b, side > 0 ? b : a, top, { colours: coat });
        }

        mesher.tri(side > 0 ? [0.14, 0.7, side] : [-0.14, 0.7, side], side > 0 ? [-0.14, 0.7, side] : [0.14, 0.7, side], [0, 0.3, side], { colours: coat.map((v) => v * 0.9) });
    }

    tube(mesher, [[-0.27, 0.66, 0], [0.27, 0.66, 0]], [0.04, 0.04], 5, { colours: coat.map((v) => v * 0.85) });

    for (const x of [-0.29, 0.29]) {
        for (let k = 0; k < 4; k++) {
            mesher.tri([x, 0.66, 0], [x + Math.sign(x) * 0.08, 0.6 + k * 0.03, random.range(-0.03, 0.03)], [x + Math.sign(x) * 0.07, 0.64 + k * 0.03, random.range(-0.03, 0.03)], { colours: straw });
        }
    }

    // The head, and a hat
    lathe({ tri: (a, b, c, o) => mesher.tri(...[a, b, c].map(([x, y, z]) => [x, y + 0.72, z]), o), quad: (a, b, c, d, o) => mesher.quad(...[a, b, c, d].map(([x, y, z]) => [x, y + 0.72, z]), o) }, [[0.03, 0], [0.075, 0.05], [0.07, 0.12], [0, 0.16]], 6, { colours: sack });
    lathe({ tri: (a, b, c, o) => mesher.tri(...[a, b, c].map(([x, y, z]) => [x, y + 0.85, z]), o), quad: (a, b, c, d, o) => mesher.quad(...[a, b, c, d].map(([x, y, z]) => [x, y + 0.85, z]), o) }, [[0.13, 0], [0.13, 0.01], [0.06, 0.02], [0.05, 0.1], [0, 0.12]], 7, { colours: linear(0x3a2e24) });
}

/**
 * The ribs of some great beast long dead, bleached, about a metre long (placed at its length):
 * its spine along the ground, its ribs arching up over it, its skull at one end with its horns.
 */
function ribs(mesher, random) {
    const bone = linear(0xe6dcc4);
    const count = random.int(5, 7);

    tube(mesher, bent(random, [-0.45, 0.02, 0], [0.4, 0.03, 0], 5, 0.02), [0.025, 0.03, 0.03, 0.025, 0.015], 5, { colours: bone });

    for (let k = 0; k < count; k++) {
        const x = -0.3 + (k / (count - 1)) * 0.55;
        const reach = 0.18 * Math.sin(((k + 1) / (count + 1)) * Math.PI) + 0.06;

        for (const side of [-1, 1]) {
            if (random.chance(0.12)) {
                continue;
            }

            const points = [[x, 0.03, 0], [x - 0.01, reach * 0.9, side * reach * 0.5], [x - 0.02, reach * 0.95, side * reach], [x - 0.02, 0.02, side * reach * 1.15]];

            tube(mesher, points, [0.012, 0.01, 0.009, 0.006], 3, { colours: bone.map((v) => v * random.range(0.9, 1.05)) });
        }
    }

    // The skull, and its horns
    const skull = made((inner) => rock(inner, random, { detail: 0, rough: 0.15, cuts: 2, squash: 0.6, layer: "plain", lichen: 0 }));

    place(mesher, skull, { at: [0.47, 0, 0], turn: random.range(-0.3, 0.3), scale: [0.16, 0.14, 0.1], tint: bone });

    for (const side of [-1, 1]) {
        tube(mesher, [[0.47, 0.06, side * 0.04], [0.44, 0.1, side * 0.11], [0.4, 0.16, side * 0.13]], [0.014, 0.01, 0.003], 4, { colours: bone.map((v) => v * 0.9) });
    }
}

// --- Undergrowth ---

const UP = [0, 1, 0];

// A blade (of grass, a reed, a leaf's spike) from `foot` leaning `lean` metres out along `dir`
// ([x, z]) as it rises `height`, `width` wide at its foot: a quad to its middle and a point to
// its tip, coloured from `base` to `tip`, swaying most at its tip
function blade(mesher, foot, dir, height, lean, width, base, tip, sway = 1) {
    const side = [-dir[1], 0, dir[0]];
    const end = [foot[0] + dir[0] * lean, foot[1] + height * (1 - 0.12 * Math.min(1, lean / height)), foot[2] + dir[1] * lean];
    const at = (p, w, sign) => [p[0] + side[0] * w * sign, p[1], p[2] + side[2] * w * sign];
    const normal = unit([dir[0] * 0.35, 1, dir[1] * 0.35]);

    mesher.tri(at(foot, width / 2, -1), at(foot, width / 2, 1), end, { normals: [normal, normal, normal], colours: [base, base, tip], sways: [0, 0, sway] });

    return end;
}

/**
 * A tuft of grass: `blades` blades from a little round its middle, leaning out, `height` tall
 * (metres: [least, most]), coloured `base` at the foot to `tip`; some with seed heads (`heads`:
 * how many, in `head`'s colour).
 */
function tuft(mesher, random, { height = [0.25, 0.6], blades = [8, 14], base, tip, spread = 0.3, width = 0.06, heads = 0, head = null }) {
    const count = random.int(...blades);

    for (let k = 0; k < count; k++) {
        const angle = random.range(0, TAU);
        const out = random.range(0, spread * 0.5) * random.range(0.3, 1);
        const lean = random.range(-0.5, 0.5) + angle;
        const h = random.range(...height);
        const foot = [Math.cos(angle) * out, -0.02, Math.sin(angle) * out];
        const shade = random.range(0.85, 1.12);
        const end = blade(mesher, foot, [Math.cos(lean), Math.sin(lean)], h, h * random.range(0.2, 0.55), width * random.range(0.7, 1.3), base.map((v) => v * shade), tip.map((v) => v * shade), Math.min(1.3, h / 0.35));

        if (k < heads && head) {
            // A seed head: a narrow diamond at its tip
            const up = [end[0], end[1] + 0.07, end[2]];
            const side = [-Math.sin(lean) * 0.012, 0, Math.cos(lean) * 0.012];
            const middle = [end[0] + 0.004, end[1] + 0.035, end[2]];

            mesher.quad(end, [middle[0] + side[0], middle[1], middle[2] + side[2]], up, [middle[0] - side[0], middle[1], middle[2] - side[2]], { normals: [UP, UP, UP, UP], colours: head, sways: 1.2 });
        }
    }
}

// A flower's head: petals round a middle, `petals` of them (`jagged`: points between, as a
// cornflower's), `radius` out, cupped up by `cup` of its radius, the middle `centre`
function head(mesher, at, { petals = 5, radius = 0.03, colour, centre, cup = 0.2, jagged = false, sway = 1 }) {
    const points = jagged ? petals * 2 : petals;
    const rim = Array.from({ length: points }, (_, k) => {
        const angle = (k / points) * TAU;
        const r = jagged && k % 2 ? radius * 0.5 : radius;

        return [at[0] + Math.cos(angle) * r, at[1] + cup * r, at[2] + Math.sin(angle) * r];
    });

    for (let k = 0; k < points; k++) {
        mesher.tri(at, rim[(k + 1) % points], rim[k], { normals: [UP, UP, UP], colours: [centre, colour, colour], sways: sway });
    }
}

// A stem: one thin blade, green, from `foot` to `top`
function stem(mesher, foot, top, green, width = 0.012) {
    const side = unit(cross(sub(top, foot), [0.3, 0, 1]));
    const w = width / 2;

    mesher.tri([foot[0] - side[0] * w, foot[1], foot[2] - side[2] * w], [foot[0] + side[0] * w, foot[1], foot[2] + side[2] * w], top, { normals: [UP, UP, UP], colours: [green.map((v) => v * 0.7), green.map((v) => v * 0.7), green], sways: [0, 0, 1] });
}

// A little ball (a bud, a berry, a clock gone to seed): an octahedron
function bud(mesher, at, radius, colour, sway = 1, squash = 1) {
    for (const face of ballOf(-1)) {
        mesher.tri(...face.map(([x, y, z]) => [at[0] + x * radius, at[1] + y * radius * squash, at[2] + z * radius]), { colours: colour, sways: sway });
    }
}

const GREEN = linear(0x4c7a2e);

/**
 * A clump of flowers of one kind (FLOWERS): several stems from round a point, each with its head,
 * as that kind grows.
 */
function flowers(mesher, random, kind) {
    const look = FLOWERS[kind];
    const count = random.int(...look.count);

    for (let k = 0; k < count; k++) {
        const angle = random.range(0, TAU);
        const out = random.range(0, look.spread);
        const foot = [Math.cos(angle) * out, -0.02, Math.sin(angle) * out];
        const h = random.range(...look.height);
        const top = [foot[0] + random.range(-0.04, 0.04), h, foot[2] + random.range(-0.04, 0.04)];
        const colour = look.colours ? random.pick(look.colours) : look.colour;
        const tint = random.range(0.9, 1.1);

        stem(mesher, foot, top, GREEN);

        if (look.bells) {
            // Bells down one side of the stem's top
            for (let b = 0; b < look.bells; b++) {
                const t = 1 - (b / look.bells) * look.along;
                const at = [top[0] * t + foot[0] * (1 - t) + 0.02, h * t - 0.02, top[2] * t + foot[2] * (1 - t)];
                const size = look.radius * (1 - b / (look.bells * 2.2));
                const rim = Array.from({ length: 4 }, (_, j) => [at[0] + Math.cos((j / 4) * TAU + b) * size, at[1] - size * 1.4, at[2] + Math.sin((j / 4) * TAU + b) * size]);

                // A bell hanging open-mouthed: four sides to a point at its top
                for (let j = 0; j < 4; j++) {
                    mesher.tri(at, rim[j], rim[(j + 1) % 4], { colours: [colour.map((v) => v * tint * 0.8), colour.map((v) => v * tint), colour.map((v) => v * tint)], sways: t });
                }
            }
        } else if (look.umbel) {
            // Rays out from the top, a little cluster of white at each
            for (let r = 0; r < look.umbel; r++) {
                const a = (r / look.umbel) * TAU + random.range(-0.3, 0.3);
                const end = [top[0] + Math.cos(a) * 0.06, top[1] + 0.02, top[2] + Math.sin(a) * 0.06];

                stem(mesher, top, end, GREEN, 0.006);
                head(mesher, end, { petals: 6, radius: look.radius, colour, centre: colour, cup: 0.1 });
            }
        } else if (look.puff) {
            bud(mesher, top, look.radius, colour.map((v) => v * tint));
        } else if (look.spike) {
            // A spike of flowers up the stem's top
            const base = [top[0], h * 0.7, top[2]];

            mesher.quad(base, [top[0] + 0.012, h * 0.85, top[2]], [top[0], h + 0.03, top[2]], [top[0] - 0.012, h * 0.85, top[2]], { normals: [UP, UP, UP, UP], colours: colour.map((v) => v * tint), sways: 1 });
            mesher.quad(base, [top[0], h * 0.85, top[2] + 0.012], [top[0], h + 0.03, top[2]], [top[0], h * 0.85, top[2] - 0.012], { normals: [UP, UP, UP, UP], colours: colour.map((v) => v * tint * 0.9), sways: 1 });
        } else {
            head(mesher, top, { petals: look.petals, radius: look.radius * random.range(0.85, 1.15), colour: colour.map((v) => v * tint), centre: look.centre, cup: look.cup, jagged: look.jagged });
        }
    }

    // Leaves at the foot of the taller ones
    if (look.leaves) {
        for (let k = 0; k < look.leaves; k++) {
            const angle = random.range(0, TAU);

            blade(mesher, [0, -0.02, 0], [Math.cos(angle), Math.sin(angle)], 0.06, 0.2, 0.07, GREEN.map((v) => v * 0.8), GREEN, 0.3);
        }
    }
}

/**
 * The wildflowers: how many stems a clump has, how tall, how far they spread, and their heads
 * (petals and colour, a middle of another colour, how cupped; or bells down the stem, an umbel
 * of tiny white flowers, a puff, a spike).
 */
const FLOWERS = Object.freeze({
    daisy: { count: [6, 11], height: [0.1, 0.22], spread: 0.4, petals: 5, radius: 0.045, colour: linear(0xf4f1e6), centre: linear(0xe9b92a), cup: 0.05 },
    poppy: { count: [4, 8], height: [0.35, 0.6], spread: 0.45, petals: 5, radius: 0.065, colour: linear(0xd22c1e), centre: linear(0x1a1210), cup: 0.45 },
    cornflower: { count: [4, 7], height: [0.3, 0.55], spread: 0.4, petals: 5, radius: 0.05, colour: linear(0x3a6fd8), centre: linear(0x27336e), cup: 0.2, jagged: true },
    buttercup: { count: [7, 12], height: [0.15, 0.4], spread: 0.45, petals: 5, radius: 0.035, colour: linear(0xf3c81f), centre: linear(0xd49a12), cup: 0.55 },
    dandelion: { count: [3, 6], height: [0.08, 0.2], spread: 0.35, petals: 5, radius: 0.045, colour: linear(0xf6c520), centre: linear(0xe0a814), cup: 0.1, leaves: 4 },
    clock: { count: [2, 5], height: [0.2, 0.35], spread: 0.35, puff: true, radius: 0.045, colour: linear(0xf1efe8) },
    foxglove: { count: [1, 3], height: [0.8, 1.3], spread: 0.3, bells: 6, along: 0.45, radius: 0.035, colours: [linear(0xc0508e), linear(0xa25aa8), linear(0xe8d6e2)], leaves: 5 },
    parsley: { count: [2, 4], height: [0.7, 1.05], spread: 0.35, umbel: 4, radius: 0.04, colour: linear(0xf2f0e4) },
    yarrow: { count: [2, 4], height: [0.4, 0.65], spread: 0.35, umbel: 3, radius: 0.04, colours: [linear(0xf0e2e2), linear(0xe7b9c8)] },
    heather: { count: [10, 17], height: [0.18, 0.38], spread: 0.5, spike: true, colours: [linear(0xa45a9c), linear(0xc27ab4), linear(0x8e4d86)] },
    lavender: { count: [7, 12], height: [0.35, 0.55], spread: 0.35, spike: true, colours: [linear(0x7d66c2), linear(0x9a84d6)] },
    bluebell: { count: [5, 8], height: [0.2, 0.36], spread: 0.45, bells: 4, along: 0.3, radius: 0.028, colour: linear(0x4a5fc8) },
    campion: { count: [4, 7], height: [0.3, 0.55], spread: 0.4, petals: 5, radius: 0.04, colours: [linear(0xe46aa2), linear(0xf2f0ea)], centre: linear(0xf6e2ea), cup: 0.3, jagged: true },
    thistle: { count: [1, 2], height: [0.6, 0.95], spread: 0.3, puff: true, radius: 0.06, colour: linear(0x9a4fb2), leaves: 6 },
    cotton: { count: [5, 8], height: [0.25, 0.45], spread: 0.4, puff: true, radius: 0.04, colour: linear(0xfbfbf6) },
});

/**
 * A fern (or bracken, browned): fronds arching out from its middle, leaflets down both sides of
 * each, smaller towards the tip.
 */
function fern(mesher, random, colour) {
    const count = random.int(5, 8);
    const size = random.range(0.4, 0.7);

    for (let k = 0; k < count; k++) {
        const angle = (k / count) * TAU + random.range(-0.3, 0.3);
        const dir = [Math.cos(angle), Math.sin(angle)];
        const reach = size * random.range(0.8, 1.1);
        const spine = Array.from({ length: 5 }, (_, j) => {
            const t = j / 4;

            return [dir[0] * reach * t * 0.8, size * 1.15 * Math.sin(t * Math.PI * 0.72) - 0.02, dir[1] * reach * t * 0.8];
        });
        const shade = random.range(0.85, 1.1);

        for (let j = 0; j < 4; j++) {
            const [a, b] = [spine[j], spine[j + 1]];
            const leaflet = size * 0.28 * (1 - j / 4.5);
            const side = [-dir[1], 0, dir[0]];
            const sway = [(j + 0.5) / 4, (j + 1) / 4];

            for (const sign of [-1, 1]) {
                const tip = [(a[0] + b[0]) / 2 + side[0] * leaflet * sign + dir[0] * leaflet * 0.4, (a[1] + b[1]) / 2 - leaflet * 0.2, (a[2] + b[2]) / 2 + side[2] * leaflet * sign + dir[1] * leaflet * 0.4];

                mesher.tri(a, b, tip, { normals: [UP, UP, UP], colours: [colour.map((v) => v * 0.75 * shade), colour.map((v) => v * shade), colour.map((v) => v * 1.12 * shade)], sways: [sway[0], sway[1], sway[1]] });
            }
        }
    }
}

/** Reeds, and a bulrush or two: tall thin blades, and brown heads on stems among them. */
function reeds(mesher, random, bulrushes = true) {
    const base = linear(0x5a6a3a);
    const tip = linear(0x9aa870);

    for (let k = 0; k < random.int(8, 14); k++) {
        const angle = random.range(0, TAU);
        const foot = [Math.cos(angle) * random.range(0, 0.15), -0.02, Math.sin(angle) * random.range(0, 0.15)];

        blade(mesher, foot, [Math.cos(angle), Math.sin(angle)], random.range(0.8, 1.5), random.range(0.05, 0.3), 0.025, base, tip, 1.4);
    }

    for (let k = 0; bulrushes && k < random.int(1, 3); k++) {
        const foot = [random.range(-0.1, 0.1), -0.02, random.range(-0.1, 0.1)];
        const h = random.range(1, 1.4);

        stem(mesher, foot, [foot[0], h, foot[2]], base, 0.014);
        tube(mesher, [[foot[0], h - 0.16, foot[2]], [foot[0], h, foot[2]]], [0.022, 0.02], 5, { colours: linear(0x5a3a22), sways: [0.85, 1], caps: [true, true] });
    }
}

/** Mushrooms (`kind`: fly agaric, red with white flecks; brown caps in a cluster; puffballs). */
function mushrooms(mesher, random, kind) {
    const count = kind === "agaric" ? random.int(1, 3) : random.int(3, 5);

    for (let k = 0; k < count; k++) {
        const angle = random.range(0, TAU);
        const [x, z] = [Math.cos(angle) * random.range(0, 0.12), Math.sin(angle) * random.range(0, 0.12)];

        if (kind === "puffball") {
            bud(mesher, [x, 0.02, z], random.range(0.025, 0.05), linear(0xf0ebdc), 0, 0.8);
            continue;
        }

        const h = kind === "agaric" ? random.range(0.1, 0.18) : random.range(0.04, 0.09);
        const r = kind === "agaric" ? random.range(0.045, 0.07) : random.range(0.02, 0.035);
        const cap = kind === "agaric" ? linear(0xc8261a) : random.pick([linear(0x9a7048), linear(0xb89060), linear(0x7a5534)]);
        const at = (p) => [p[0] + x, p[1], p[2] + z];

        const sides = kind === "agaric" ? 7 : 5;

        tube(mesher, [[x, -0.01, z], [x, h, z]], [r * 0.28, r * 0.22], 3, { colours: linear(0xece4d2) });
        lathe({ tri: (a, b, c, o) => mesher.tri(at(a), at(b), at(c), o), quad: (a, b, c, d, o) => mesher.quad(at(a), at(b), at(c), at(d), o) }, kind === "agaric" ? [[r * 0.3, h - 0.004], [r, h + r * 0.1], [r * 0.8, h + r * 0.5], [0, h + r * 0.82]] : [[r * 0.3, h - 0.004], [r, h + r * 0.15], [0, h + r * 0.7]], sides, { colours: [linear(0xe8dcc4), cap, cap, cap] });

        if (kind === "agaric") {
            for (let f = 0; f < 5; f++) {
                const a = random.range(0, TAU);
                const t = random.range(0.3, 0.8);

                bud(mesher, [x + Math.cos(a) * r * t * 0.9, h + r * (0.82 - t * 0.5), z + Math.sin(a) * r * t * 0.9], r * 0.12, linear(0xf4efe2), 0, 0.5);
            }
        }
    }
}

/** Pebbles, `count` of them, scattered round a point. */
function pebbles(mesher, random, count, layer = "rock") {
    for (let k = 0; k < count; k++) {
        const angle = random.range(0, TAU);
        const out = random.range(0, 0.35);
        const size = random.range(0.04, 0.12);
        const part = made((inner) => rock(inner, random, { detail: -1, rough: 0.3, cuts: 1, squash: random.range(0.4, 0.7), layer, lichen: 0 }));
        const shade = random.range(0.75, 1.15);

        place(mesher, part, { at: [Math.cos(angle) * out, -0.01, Math.sin(angle) * out], turn: random.range(0, TAU), scale: [size, size, size * random.range(0.7, 1)], tint: [shade, shade * random.range(0.95, 1.02), shade * random.range(0.9, 1.02)], shift: [random.next(), random.next()] });
    }
}

/** Sticks and a fallen branch or two, lying about. */
function sticks(mesher, random, colour) {
    for (let k = 0; k < random.int(1, 3); k++) {
        const angle = random.range(0, TAU);
        const len = random.range(0.3, 0.9);
        const [dx, dz] = [Math.cos(angle) * len * 0.5, Math.sin(angle) * len * 0.5];
        const [cx, cz] = [random.range(-0.2, 0.2), random.range(-0.2, 0.2)];
        const r = random.range(0.01, 0.025);
        const points = bent(random, [cx - dx, r * 0.8, cz - dz], [cx + dx, r * 0.8, cz + dz], 3, 0.04);

        tube(mesher, points, [r, r * 0.8, r * 0.5], 3, { colours: colour.map((v) => v * random.range(0.8, 1.1)) });

        if (random.chance(0.4)) {
            const from = points[1];
            const a = angle + random.pick([-0.7, 0.7]);
            const to = [from[0] + Math.cos(a) * len * 0.35, r * 0.8, from[2] + Math.sin(a) * len * 0.35];

            tube(mesher, [from, to], [r * 0.6, r * 0.3], 3, { colours: colour });
        }
    }
}

/** Fallen leaves, flat on the ground, in the colours of autumn. */
function leaves(mesher, random) {
    const colours = [linear(0xb8641e), linear(0xd09a2a), linear(0x8a4a1e), linear(0x6a5a2a), linear(0xa83a1a)];

    for (let k = 0; k < random.int(10, 20); k++) {
        const [x, z] = [random.range(-0.35, 0.35), random.range(-0.35, 0.35)];
        const a = random.range(0, TAU);
        const [l, w] = [random.range(0.04, 0.07), random.range(0.015, 0.03)];
        const [ax, az, bx, bz] = [Math.cos(a) * l, Math.sin(a) * l, -Math.sin(a) * w, Math.cos(a) * w];
        const colour = random.pick(colours);
        const y = 0.008 + k * 0.0005;

        mesher.quad([x - ax, y, z - az], [x + bx, y, z + bz], [x + ax, y, z + az], [x - bx, y, z - bz], { normals: [UP, UP, UP, UP], colours: colour });
    }
}

/** A molehill: a little mound of fresh earth. */
function molehill(mesher, random) {
    const earth = linear(0x5a3f2a);

    lathe(mesher, [[0.2, -0.02], [0.14, 0.05], [0.06, 0.09], [0, 0.1]], 7, { random, jitter: 0.2, colours: [earth.map((v) => v * 0.9), earth, earth.map((v) => v * 1.1), earth.map((v) => v * 1.15)] });
}

/** A rabbit's hole: dark, in a ring of scratched-out earth. */
function burrow(mesher, random) {
    const earth = linear(0x6a4a30);
    const hole = linear(0x120c08);
    const rim = Array.from({ length: 8 }, (_, k) => [Math.cos((k / 8) * TAU) * 0.11, 0.012, Math.sin((k / 8) * TAU) * 0.08]);

    for (let k = 0; k < 8; k++) {
        mesher.tri([0, 0.004, 0], rim[(k + 1) % 8], rim[k], { normals: [UP, UP, UP], colours: hole });
    }

    lathe(mesher, [[0.3, -0.01], [0.2, 0.05], [0.12, 0.012]], 8, { random, jitter: 0.15, colours: [earth.map((v) => v * 0.85), earth, earth.map((v) => v * 0.7)] });
}

/** Bones, bleached: a few lying about, and now and then a horned skull. */
function bones(mesher, random) {
    const bone = linear(0xe8e0cc);

    for (let k = 0; k < random.int(2, 4); k++) {
        const a = random.range(0, TAU);
        const l = random.range(0.15, 0.35);
        const [cx, cz] = [random.range(-0.2, 0.2), random.range(-0.2, 0.2)];

        tube(mesher, [[cx - Math.cos(a) * l / 2, 0.015, cz - Math.sin(a) * l / 2], [cx + Math.cos(a) * l / 2, 0.015, cz + Math.sin(a) * l / 2]], [0.014, 0.012], 4, { colours: bone.map((v) => v * random.range(0.9, 1.05)), caps: [true, true] });
    }

    if (random.chance(0.4)) {
        const skull = made((inner) => rock(inner, random, { detail: 0, rough: 0.12, cuts: 2, squash: 0.6, layer: "plain", lichen: 0 }));

        place(mesher, skull, { at: [0, -0.01, 0], turn: random.range(0, TAU), scale: [0.22, 0.14, 0.13], tint: bone });

        for (const side of [-1, 1]) {
            tube(mesher, [[0.03, 0.06, side * 0.05], [0, 0.1, side * 0.15], [-0.05, 0.16, side * 0.17]], [0.014, 0.009, 0.002], 4, { colours: bone.map((v) => v * 0.85) });
        }
    }
}

/** A cactus: round and ribbed with a flower on top, or pads of prickly pear. */
function cactus(mesher, random) {
    const green = linear(random.pick([0x4f7a3a, 0x5a8a48, 0x46703a]));

    if (random.chance(0.5)) {
        const h = random.range(0.25, 0.5);
        const r = random.range(0.12, 0.2);
        const rings = [[r * 0.9, -0.02], [r, h * 0.3], [r * 0.95, h * 0.7], [r * 0.55, h * 0.95], [0, h]];

        for (let k = 0; k < rings.length - 1; k++) {
            for (let j = 0; j < 12; j++) {
                const point = (ring, i) => {
                    const a = (i / 12) * TAU;
                    const rr = rings[ring][0] * (i % 2 ? 0.86 : 1);

                    return [Math.cos(a) * rr, rings[ring][1], Math.sin(a) * rr];
                };

                mesher.quad(point(k, j), point(k + 1, j), point(k + 1, j + 1), point(k, j + 1), { colours: [green.map((v) => v * 0.8), green, green, green.map((v) => v * 0.8)] });
            }
        }

        head(mesher, [0, h + 0.005, 0], { petals: 6, radius: 0.04, colour: linear(random.pick([0xe86aa0, 0xf2c830, 0xe84a3a])), centre: linear(0xf6e6a0), cup: 0.4, sway: 0 });
    } else {
        const pads = random.int(3, 6);
        const ball = made((inner) => rock(inner, random, { detail: 0, rough: 0.08, cuts: 0, squash: 1, layer: "plain", lichen: 0 }));

        for (let k = 0; k < pads; k++) {
            const y = 0.12 + (k > 1 ? 0.18 : 0) + random.range(-0.03, 0.03);
            const x = random.range(-0.15, 0.15);

            place(mesher, ball, { at: [x, y - 0.12, random.range(-0.05, 0.05)], turn: random.range(-0.6, 0.6), tilt: [random.range(-0.4, 0.4), random.range(-0.5, 0.5)], scale: [0.2, 0.28, 0.05], tint: green });
        }
    }
}

/** A tumbleweed: a ball of dry twigs. */
function tumbleweed(mesher, random) {
    const dry = linear(0xb89a62);
    const r = random.range(0.2, 0.32);

    for (let k = 0; k < 18; k++) {
        const a = unit([random.range(-1, 1), random.range(-1, 1), random.range(-1, 1)]);
        const b = unit([random.range(-1, 1), random.range(-1, 1), random.range(-1, 1)]);
        const p = (d) => [d[0] * r, r * 0.9 + d[1] * r, d[2] * r];
        const side = unit(cross(sub(b, a), [0, 1, 0])).map((v) => v * 0.01);

        mesher.tri(p(a), p(b), [p(a)[0] + side[0], p(a)[1] + 0.012, p(a)[2] + side[2]], { colours: dry.map((v) => v * random.range(0.8, 1.1)) });
    }
}

/** Shards of obsidian, black and glassy, sticking up out of the ash. */
function shards(mesher, random) {
    for (let k = 0; k < random.int(3, 6); k++) {
        const [x, z] = [random.range(-0.25, 0.25), random.range(-0.25, 0.25)];
        const h = random.range(0.08, 0.35);
        const r = random.range(0.04, 0.08);
        const tip = [x + random.range(-0.05, 0.05), h, z + random.range(-0.05, 0.05)];
        const base = Array.from({ length: 3 }, (_, j) => [x + Math.cos((j / 3) * TAU + k) * r, -0.01, z + Math.sin((j / 3) * TAU + k) * r]);
        const colour = linear(random.pick([0x16161c, 0x1c1a24, 0x22202a]));

        for (let j = 0; j < 3; j++) {
            mesher.tri(base[j], base[(j + 1) % 3], tip, { colours: [colour, colour, colour.map((v) => v * 3)] });
        }
    }
}

/** Shells on the sand, and a piece of driftwood. */
function shore(mesher, random) {
    for (let k = 0; k < random.int(2, 5); k++) {
        const at = [random.range(-0.3, 0.3), 0.006, random.range(-0.3, 0.3)];

        head(mesher, at, { petals: 5, radius: random.range(0.018, 0.03), colour: linear(random.pick([0xf2e8dc, 0xe8c8b8, 0xd8c0a0])), centre: linear(0xc8a890), cup: 0.4, sway: 0 });
    }

    if (random.chance(0.5)) {
        sticks(mesher, random, linear(0xb8b0a0));
    }
}

/** The ring of stones and cold ashes of someone's old campfire, charred sticks across it. */
function campfire(mesher, random) {
    const ash = linear(0x4a4640);
    const rim = Array.from({ length: 10 }, (_, k) => [Math.cos((k / 10) * TAU) * 0.4, 0.01, Math.sin((k / 10) * TAU) * 0.4]);

    for (let k = 0; k < 10; k++) {
        mesher.tri([0, 0.015, 0], rim[(k + 1) % 10], rim[k], { normals: [UP, UP, UP], colours: [ash.map((v) => v * 0.6), ash, ash] });
    }

    for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU + random.range(-0.1, 0.1);
        const stone = made((inner) => rock(inner, random, { detail: 0, rough: 0.25, cuts: 2, squash: 0.6, layer: "rock", lichen: 0.1 }));

        place(mesher, stone, { at: [Math.cos(a) * 0.48, -0.02, Math.sin(a) * 0.48], turn: random.range(0, TAU), scale: [0.16, 0.16, 0.14], tint: [0.8, 0.78, 0.76], shift: [random.next(), random.next()] });
    }

    for (let k = 0; k < 3; k++) {
        const a = random.range(0, TAU);

        tube(mesher, [[-Math.cos(a) * 0.3, 0.05, -Math.sin(a) * 0.3], [Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3]], [0.035, 0.03], 5, { colours: linear(0x1e1814), caps: [true, true] });
    }
}

// --- Each people's own lands ---
//
// What lies about round each people's homes: the cat folk's termite spires and kopjes, bleached
// horned skulls and potsherds in the dry grass; the orcs' skulls on poles, clusters of sharpened
// stakes, the wrack of old battles and bones; the lizard folk's mangrove roots, glyph-carved
// stelae with a serpent on top, broken eggshells and carved stones; the elves' moonstones, leaf
// lamps on slender posts, fallen petals and moon-pale buds; the dark elves' dead stumps shrouded
// in web, silk cocoons, clusters of black crystal with violet hearts, glowing caps and blackthorn.
// Features are about a metre across (placed at their size and height); the little things lying
// about are at their own size.

const BONE = linear(0xe8e0cc);
const IRON = linear(0x5a5c60);
const SILK = linear(0xe6e2ea);
// (Lights: as bright as the land's things are drawn, a little brighter than white)
const VIOLET = linear(0xb070ff).map((v) => v * 1.3);
const MOONLIGHT = linear(0xd8ecff).map((v) => v * 1.25);

// A flat ring of triangles round `at` in the plane of `u` and `v` (a disc facing out), coloured
function disc(mesher, at, u, v, radius, sides, colour, rim = colour) {
    const point = (k) => {
        const a = (k / sides) * TAU;

        return [at[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * radius, at[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * radius, at[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * radius];
    };

    for (let k = 0; k < sides; k++) {
        mesher.tri(at, point(k), point(k + 1), { colours: [colour, rim, rim] });
        mesher.tri(at, point(k + 1), point(k), { colours: [colour, rim, rim] });
    }
}

// A thin strand (silk, a hair, a rope) from `a` to `b`, seen from both sides
function strand(mesher, a, b, width, colour) {
    const side = unit(cross(sub(b, a), [0.2, 1, 0.3])).map((v) => v * width);
    const quad = [[a[0] - side[0], a[1] - side[1], a[2] - side[2]], [b[0] - side[0], b[1] - side[1], b[2] - side[2]], [b[0] + side[0], b[1] + side[1], b[2] + side[2]], [a[0] + side[0], a[1] + side[1], a[2] + side[2]]];

    mesher.quad(quad[0], quad[1], quad[2], quad[3], { colours: colour });
    mesher.quad(quad[3], quad[2], quad[1], quad[0], { colours: colour });
}

// A horned beast's skull (an antelope's, an ox's) at `at`, facing `facing`, `size` long
function hornedSkull(mesher, random, at, facing, size, { spiral = false } = {}) {
    const [dx, dz] = [Math.cos(facing), Math.sin(facing)];
    const skull = made((inner) => rock(inner, random, { detail: 0, rough: 0.1, cuts: 2, squash: 0.6, layer: "plain", lichen: 0 }));

    place(mesher, skull, { at: [at[0], at[1] - size * 0.08, at[2]], turn: -facing, scale: [size, size * 0.6, size * 0.55], tint: BONE });

    for (const side of [-1, 1]) {
        const [sx, sz] = [-dz * side, dx * side];
        const root = [at[0] - dx * size * 0.2 + sx * size * 0.18, at[1] + size * 0.22, at[2] - dz * size * 0.2 + sz * size * 0.18];
        const points = spiral
            ? Array.from({ length: 6 }, (_, k) => {
                const t = k / 5;

                return [root[0] - dx * size * 1.1 * t + sx * size * 0.12 * Math.sin(t * 9), root[1] + size * 0.5 * t + size * 0.1 * Math.cos(t * 9), root[2] - dz * size * 1.1 * t + sz * size * 0.12 * Math.sin(t * 9)];
            })
            : [root, [root[0] + sx * size * 0.45, root[1] + size * 0.12, root[2] + sz * size * 0.45], [root[0] + sx * size * 0.62 - dx * size * 0.1, root[1] + size * 0.5, root[2] + sz * size * 0.62 - dz * size * 0.1]];

        tube(mesher, points, points.map((_, k) => size * 0.07 * (1 - k / points.length)), 4, { colours: BONE.map((v) => v * 0.82) });
    }
}

// The cat folk's: a termite mound, a fluted spire of red earth, eroded into fins and chimneys
function termiteMound(mesher, random) {
    const earth = linear(random.pick([0xa0583a, 0xb06a42, 0x94502e]));
    const spires = random.int(1, 3);

    for (let k = 0; k < spires; k++) {
        const angle = random.range(0, TAU);
        const out = k === 0 ? 0 : random.range(0.2, 0.32);
        const [cx, cz] = [Math.cos(angle) * out, Math.sin(angle) * out];
        const tall = k === 0 ? 1 : random.range(0.35, 0.6);
        const r = k === 0 ? 0.42 : random.range(0.14, 0.22);
        const shift = () => ({ tri: (a, b, c, o) => mesher.tri(...[a, b, c].map(([x, y, z]) => [x + cx, y, z + cz]), o), quad: (a, b, c, d, o) => mesher.quad(...[a, b, c, d].map(([x, y, z]) => [x + cx, y, z + cz]), o) });

        lathe(shift(), [[r, -0.03], [r * 0.82, tall * 0.18], [r * 0.52, tall * 0.5], [r * 0.3, tall * 0.8], [r * 0.12, tall * 0.97], [0, tall]], 9, { layer: LAYER.mud, uvScale: METRES.mud * 0.3, jitter: 0.28, random, colours: [earth.map((v) => v * 0.75), earth, earth.map((v) => v * 1.08), earth.map((v) => v * 1.12), earth.map((v) => v * 1.15), earth.map((v) => v * 1.2)] });
    }
}

// The cat folk's: a kopje, rounded granite boulders heaped where the savannah breaks
function kopje(mesher, random) {
    const count = random.int(3, 6);

    for (let k = 0; k < count; k++) {
        const angle = random.range(0, TAU);
        const out = k === 0 ? 0 : random.range(0.2, 0.4);
        const size = k === 0 ? random.range(0.6, 0.75) : random.range(0.28, 0.5);
        const lift = k > 2 ? random.range(0.25, 0.4) : -0.05;
        const part = made((inner) => rock(inner, random, { detail: k === 0 ? 1 : 0, rough: 0.12, cuts: 1, squash: random.range(0.7, 0.95), layer: random.pick(["granite", "rock-red"]), lichen: 0.3 }));

        place(mesher, part, { at: [Math.cos(angle) * out, lift, Math.sin(angle) * out], turn: random.range(0, TAU), tilt: [random.range(-0.2, 0.2), random.range(-0.2, 0.2)], scale: [size, size * 0.85, size * random.range(0.8, 1)], shift: [random.next(), random.next()] });
    }

    // (A sun painted on its biggest stone)
    if (random.chance(0.35)) {
        disc(mesher, [0.02, 0.42, 0.33], [1, 0, 0], [0, 1, 0.2], 0.09, 10, linear(0xd8a030), linear(0xb86a20));
    }
}

// The cat folk's: bleached horned skulls in the grass
function hornSkull(mesher, random) {
    hornedSkull(mesher, random, [0, 0.06, 0], random.range(0, TAU), random.range(0.22, 0.3), { spiral: random.chance(0.6) });

    for (let k = 0; k < random.int(0, 3); k++) {
        const a = random.range(0, TAU);

        tube(mesher, [[Math.cos(a) * 0.3, 0.015, Math.sin(a) * 0.3], [Math.cos(a + 0.4) * 0.5, 0.015, Math.sin(a + 0.4) * 0.5]], [0.016, 0.012], 4, { colours: BONE, caps: [true, true] });
    }
}

// The cat folk's: the shards of a broken water jar, painted
function potsherds(mesher, random) {
    const clay = linear(random.pick([0xb8683e, 0xc47a48, 0xa85a34]));
    const paint = linear(random.pick([0xe8dcc0, 0x2a2420, 0x8a3a20]));

    for (let k = 0; k < random.int(4, 8); k++) {
        const [x, z] = [random.range(-0.3, 0.3), random.range(-0.3, 0.3)];
        const a = random.range(0, TAU);
        const [l, w] = [random.range(0.05, 0.1), random.range(0.04, 0.08)];
        const lift = random.range(0.005, 0.04);
        const corners = [[x - Math.cos(a) * l, 0.006, z - Math.sin(a) * l], [x - Math.sin(a) * w, lift, z + Math.cos(a) * w], [x + Math.cos(a) * l, 0.006, z + Math.sin(a) * l], [x + Math.sin(a) * w, 0.01, z - Math.cos(a) * w]];
        const colour = k % 3 === 0 ? paint : clay;

        mesher.quad(...corners, { colours: colour });
        mesher.quad(corners[3], corners[2], corners[1], corners[0], { colours: clay.map((v) => v * 0.7) });
    }

    // (And the jar's foot, still whole)
    if (random.chance(0.5)) {
        lathe(mesher, [[0.08, -0.01], [0.11, 0.06], [0.12, 0.1]], 8, { colours: [clay.map((v) => v * 0.8), clay, clay] });
    }
}

// The orcs': a skull on a pole, horned, rags of red hanging from it
function skullPole(mesher, random) {
    const lean = [random.range(-0.06, 0.06), 0, random.range(-0.06, 0.06)];
    const top = [lean[0], 1, lean[2]];

    tube(mesher, [[0, -0.02, 0], top], [0.035, 0.028], 5, { layer: LAYER.deadwood, uvScale: 0.25 });
    tube(mesher, [[top[0], 1, top[2]], [top[0], 1.08, top[2]]], [0.03, 0], 4, { colours: IRON });
    hornedSkull(mesher, random, [top[0], 0.9, top[2] + 0.03], Math.PI / 2, 0.16);

    for (let k = 0; k < random.int(2, 4); k++) {
        const a = random.range(0, TAU);
        const from = [top[0] + Math.cos(a) * 0.03, 0.8, top[2] + Math.sin(a) * 0.03];
        const drop = random.range(0.2, 0.45);

        strand(mesher, from, [from[0] + Math.cos(a) * 0.05, 0.8 - drop, from[2] + Math.sin(a) * 0.05], random.range(0.02, 0.045), linear(random.pick([0x8a1e18, 0x5a1410, 0x2a2420])));
    }
}

// The orcs': a cluster of sharpened stakes driven in at angles, points out
function stakes(mesher, random) {
    const count = random.int(5, 9);

    for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU + random.range(-0.2, 0.2);
        const foot = [Math.cos(a) * 0.15, -0.02, Math.sin(a) * 0.15];
        const out = random.range(0.3, 0.55);
        const tip = [Math.cos(a) * out, random.range(0.6, 1), Math.sin(a) * out];
        const mid = lerp(foot, tip, 0.8);

        tube(mesher, [foot, mid, tip], [0.035, 0.03, 0.001], 5, { layer: LAYER.deadwood, uvScale: 0.25 });
    }

    // (Lashed together round the middle)
    tube(mesher, Array.from({ length: 9 }, (_, k) => [Math.cos((k / 8) * TAU) * 0.2, 0.25, Math.sin((k / 8) * TAU) * 0.2]), Array(9).fill(0.012), 3, { colours: linear(0x6a5a3a) });
}

// The orcs': the wrack of an old fight: a broken cart wheel, a shield, spears, a helm, bones
function wrack(mesher, random) {
    const wood = linear(0x6a4a2e);

    // (A wheel lying on its side, spokes broken)
    const hub = [random.range(-0.2, 0.2), 0.04, random.range(-0.2, 0.2)];
    const rim = Array.from({ length: 13 }, (_, k) => [hub[0] + Math.cos((k / 12) * TAU) * 0.4, 0.04 + Math.sin(k) * 0.01, hub[2] + Math.sin((k / 12) * TAU) * 0.4]);

    tube(mesher, rim.slice(0, random.int(8, 13)), Array(13).fill(0.03), 3, { colours: wood });

    for (let k = 0; k < 6; k += random.int(1, 2)) {
        tube(mesher, [hub, rim[k * 2]], [0.018, 0.015], 3, { colours: wood });
    }

    // (A round shield, painted, tipped against it; two spears)
    disc(mesher, [hub[0] + 0.35, 0.28, hub[2] - 0.1], [0, 1, 0.35], [1, 0, 0], 0.26, 10, linear(0x8a1e18), linear(0x3a2a1e));

    for (let k = 0; k < 2; k++) {
        const a = random.range(0, TAU);
        const [x, z] = [random.range(-0.3, 0.3), random.range(-0.3, 0.3)];
        const [a0, a1] = [[x - Math.cos(a) * 0.6, 0.02, z - Math.sin(a) * 0.6], [x + Math.cos(a) * 0.6, 0.02, z + Math.sin(a) * 0.6]];

        tube(mesher, [a0, a1], [0.015, 0.015], 3, { colours: wood });
        tube(mesher, [a1, [a1[0] + Math.cos(a) * 0.14, 0.02, a1[2] + Math.sin(a) * 0.14]], [0.025, 0], 4, { colours: IRON });
    }

    bones(mesher, random);
}

// The orcs': bones heaped where something was eaten, a skull on top
function bonePile(mesher, random) {
    for (let k = 0; k < random.int(6, 11); k++) {
        const a = random.range(0, TAU);
        const [x, z] = [random.range(-0.18, 0.18), random.range(-0.18, 0.18)];
        const l = random.range(0.15, 0.35);
        const y = 0.02 + k * 0.012;

        tube(mesher, [[x - Math.cos(a) * l / 2, y, z - Math.sin(a) * l / 2], [x + Math.cos(a) * l / 2, y + random.range(-0.02, 0.04), z + Math.sin(a) * l / 2]], [0.018, 0.014], 4, { colours: BONE.map((v) => v * random.range(0.78, 1.02)), caps: [true, true] });
    }

    hornedSkull(mesher, random, [0, 0.13, 0], random.range(0, TAU), 0.15);
}

// The orcs': a broken blade or two and a split shield, lying where they fell
function brokenBlades(mesher, random) {
    for (let k = 0; k < random.int(1, 3); k++) {
        const a = random.range(0, TAU);
        const [x, z] = [random.range(-0.2, 0.2), random.range(-0.2, 0.2)];
        const l = random.range(0.2, 0.45);
        const [ux, uz, sx, sz] = [Math.cos(a), Math.sin(a), -Math.sin(a) * 0.025, Math.cos(a) * 0.025];

        mesher.quad([x + sx, 0.012, z + sz], [x + ux * l + sx * 0.4, 0.012, z + uz * l + sz * 0.4], [x + ux * l - sx * 0.4, 0.012, z + uz * l - sz * 0.4], [x - sx, 0.012, z - sz], { normals: [UP, UP, UP, UP], colours: IRON.map((v) => v * 1.3) });
        tube(mesher, [[x - ux * 0.12, 0.02, z - uz * 0.12], [x, 0.02, z]], [0.016, 0.016], 4, { colours: linear(0x3a2a1e) });
    }

    if (random.chance(0.6)) {
        disc(mesher, [random.range(-0.15, 0.15), 0.02, random.range(-0.15, 0.15)], [1, 0, 0], [0, 0.08, 1], 0.2, 9, linear(0x5a3a22), linear(0x3a3a3e));
    }
}

// The lizard folk's: mangrove roots arching out of the mud round a short trunk
function mangrove(mesher, random) {
    const bark = { layer: LAYER.bark, uvScale: METRES.bark };
    const crown = [random.range(-0.05, 0.05), random.range(0.7, 0.9), random.range(-0.05, 0.05)];

    tube(mesher, [[0, 0.35, 0], [crown[0] * 0.5, 0.6, crown[2] * 0.5], crown], [0.09, 0.08, 0.06], 6, bark);

    for (let k = 0; k < random.int(6, 9); k++) {
        const a = random.range(0, TAU);
        const out = random.range(0.35, 0.5);
        const from = [Math.cos(a) * 0.04, random.range(0.3, 0.55), Math.sin(a) * 0.04];
        const knee = [Math.cos(a) * out * 0.6, from[1] + random.range(0.02, 0.12), Math.sin(a) * out * 0.6];
        const foot = [Math.cos(a) * out, -0.03, Math.sin(a) * out];

        tube(mesher, [from, knee, foot], [0.04, 0.03, 0.025], 4, bark);
    }

    // (A tuft of leaves at its top)
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const tip = [crown[0] + Math.cos(a) * 0.3, crown[1] + random.range(-0.05, 0.12), crown[2] + Math.sin(a) * 0.3];

        mesher.tri(crown, tip, [tip[0] + Math.sin(a) * 0.1, tip[1] - 0.03, tip[2] - Math.cos(a) * 0.1], { colours: linear(random.pick([0x2e6a28, 0x3a7a30])), sways: [0, 1, 1] });
        mesher.tri(crown, [tip[0] + Math.sin(a) * 0.1, tip[1] - 0.03, tip[2] - Math.cos(a) * 0.1], tip, { colours: linear(0x2a5a22), sways: [0, 1, 1] });
    }
}

// The lizard folk's: a stela of lime-washed stone carved with glyphs, a serpent's head on top
function stela(mesher) {
    const lime = linear(0xe6e0d0);
    const [w, d, h] = [0.32, 0.16, 1];
    const box = (x0, y0, z0, x1, y1, z1, colour, layer = LAYER.plain) => {
        const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];

        for (const [a, b, e, f] of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]]) {
            mesher.quad(c[a], c[b], c[e], c[f], { layer, colours: colour, uvScale: 0.5 });
        }
    };

    box(-w * 0.6, -0.02, -d * 0.7, w * 0.6, 0.12, d * 0.7, lime.map((v) => v * 0.8));
    box(-w / 2, 0.12, -d / 2, w / 2, h * 0.8, d / 2, lime, LAYER.glyphs ?? LAYER.plain);

    // (The serpent's head, jaws open, a crest of red, jade eyes)
    const head = [0, h * 0.88, 0];

    tube(mesher, [[0, h * 0.78, -0.02], head, [0, h * 0.92, 0.2]], [0.13, 0.12, 0.06], 6, { colours: lime, caps: [false, true] });
    tube(mesher, [[0, h * 0.83, 0.02], [0, h * 0.8, 0.19]], [0.07, 0.03], 4, { colours: linear(0xb83a2a) });

    for (const side of [-1, 1]) {
        bud(mesher, [side * 0.08, h * 0.95, 0.08], 0.025, linear(0x2a9a6a).map((v) => v * 1.6), 0);
        tube(mesher, [[side * 0.04, h * 0.98, -0.04], [side * 0.05, h * 1.08, -0.12]], [0.025, 0], 3, { colours: linear(0xb83a2a) });
    }
}

// The lizard folk's: eggshells, broken and hatched, pale green and speckled
function eggshells(mesher, random) {
    for (let k = 0; k < random.int(2, 4); k++) {
        const [x, z] = [random.range(-0.25, 0.25), random.range(-0.25, 0.25)];
        const r = random.range(0.05, 0.08);
        const shell = linear(random.pick([0xd8e4c8, 0xc8d8b0, 0xe8e4d4]));
        const at = (p) => [p[0] + x, p[1], p[2] + z];

        lathe({ tri: (a, b, c, o) => mesher.tri(at(a), at(b), at(c), o), quad: (a, b, c, d, o) => mesher.quad(at(a), at(b), at(c), at(d), o) }, [[0.001, 0], [r * 0.7, r * 0.2], [r, r * 0.7], [r * 0.95, r * 1.1]], 6, { colours: [shell.map((v) => v * 0.8), shell, shell, shell.map((v) => v * 0.9)] });

        for (let s = 0; s < 2; s++) {
            const a = random.range(0, TAU);

            bud(mesher, at([Math.cos(a) * r * 0.97, r * random.range(0.3, 0.9), Math.sin(a) * r * 0.97]), r * 0.12, linear(0x5a6a3a), 0, 0.4);
        }
    }
}

// The lizard folk's: a carved stone, sunk in the mud, glyphs on it
function glyphStone(mesher, random) {
    const part = made((inner) => rock(inner, random, { detail: 0, rough: 0.1, cuts: 5, squash: 0.8, layer: "glyphs", lichen: 0.5 }));

    place(mesher, part, { at: [0, -0.04, 0], turn: random.range(0, TAU), tilt: [random.range(-0.2, 0.2), random.range(-0.2, 0.2)], scale: [0.4, 0.34, 0.32], tint: [0.95, 1, 0.92], shift: [random.next(), random.next()] });
}

// The elves': a moonstone, a pale standing stone with a crescent cut in it that holds the light
function moonstone(mesher, random) {
    const part = made((inner) => rock(inner, random, { detail: 1, rough: 0.08, cuts: 3, squash: 1, layer: random.pick(["marble", "rock-pale"]), lichen: 0.2, moss: 0.4 }));

    place(mesher, part, { at: [0, -0.05, 0], turn: random.range(0, TAU), tilt: [random.range(-0.05, 0.05), random.range(-0.05, 0.05)], scale: [0.36, 1.2, 0.24], shift: [random.next(), random.next()] });

    // (The crescent, facing south, and its twin to the north)
    for (const face of [1, -1]) {
        const points = Array.from({ length: 7 }, (_, k) => {
            const a = -1.2 + (k / 6) * 2.4;

            return [Math.cos(a) * 0.1, 0.72 + Math.sin(a) * 0.1, face * 0.125];
        });
        const inner = points.map(([x, y, z]) => [x * 0.55 + 0.035, 0.72 + (y - 0.72) * 0.75, z]);

        for (let k = 0; k < 6; k++) {
            const quad = [points[k], points[k + 1], inner[k + 1], inner[k]];

            mesher.quad(...(face > 0 ? quad : [...quad].reverse()), { colours: MOONLIGHT });
        }
    }
}

// The elves': a slender post of verdigris curling over at its head, a glowing bud hanging from it
function leafLamp(mesher, random) {
    const green = linear(0x4a8a78);
    const crook = Array.from({ length: 8 }, (_, k) => {
        const t = k / 7;
        const a = t * Math.PI * 1.1;

        return t < 0.6 ? [0, t / 0.6 * 0.9, 0] : [Math.sin((t - 0.6) * 5) * 0.18, 0.9 + Math.sin(a) * 0.08, 0];
    });

    tube(mesher, crook, crook.map((_, k) => 0.03 * (1 - k / 10)), 5, { colours: green });

    const tip = crook.at(-1);

    tube(mesher, [tip, [tip[0], tip[1] - 0.12, tip[2]]], [0.005, 0.005], 3, { colours: green });
    lathe({ tri: (a, b, c, o) => mesher.tri(...[a, b, c].map(([x, y, z]) => [x + tip[0], y + tip[1] - 0.12, z + tip[2]]), o), quad: (a, b, c, d, o) => mesher.quad(...[a, b, c, d].map(([x, y, z]) => [x + tip[0], y + tip[1] - 0.12, z + tip[2]]), o) }, [[0, -0.14], [0.045, -0.1], [0.05, -0.04], [0.02, 0]], 6, { colours: MOONLIGHT });

    // (Leaves of copper curling round its foot)
    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + random.range(-0.3, 0.3);

        mesher.tri([0, 0.02, 0], [Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14], [Math.cos(a + 0.5) * 0.08, 0.2, Math.sin(a + 0.5) * 0.08], { colours: green.map((v) => v * 1.2) });
        mesher.tri([0, 0.02, 0], [Math.cos(a + 0.5) * 0.08, 0.2, Math.sin(a + 0.5) * 0.08], [Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14], { colours: green });
    }
}

// The elves': fallen petals and golden leaves, and moss
function petals(mesher, random) {
    const colours = [linear(0xf4d8e0), linear(0xfaf0f4), linear(0xe8c050), linear(0xf0e0a0), linear(0xd8a8c8)];

    for (let k = 0; k < random.int(14, 26); k++) {
        const [x, z] = [random.range(-0.4, 0.4), random.range(-0.4, 0.4)];
        const a = random.range(0, TAU);
        const [l, w] = [random.range(0.025, 0.05), random.range(0.015, 0.03)];
        const [ax, az, bx, bz] = [Math.cos(a) * l, Math.sin(a) * l, -Math.sin(a) * w, Math.cos(a) * w];
        const y = 0.008 + k * 0.0004;

        mesher.quad([x - ax, y, z - az], [x + bx, y, z + bz], [x + ax, y, z + az], [x - bx, y, z - bz], { normals: [UP, UP, UP, UP], colours: random.pick(colours) });
    }
}

// The elves': moon-pale buds on slender stems, glowing a little
function moonbuds(mesher, random) {
    for (let k = 0; k < random.int(3, 7); k++) {
        const [x, z] = [random.range(-0.18, 0.18), random.range(-0.18, 0.18)];
        const top = [x + random.range(-0.03, 0.03), random.range(0.15, 0.32), z + random.range(-0.03, 0.03)];

        stem(mesher, [x, 0, z], top, linear(0x4a8a5a));
        bud(mesher, top, random.range(0.018, 0.028), MOONLIGHT.map((v) => v * random.range(0.8, 1)), 1, 1.3);
    }
}

// The dark elves': a dead stump shrouded in web
function webStump(mesher, random) {
    stump(mesher, random);

    const r = 0.5;

    for (let k = 0; k < random.int(7, 11); k++) {
        const a = random.range(0, TAU);
        const from = [Math.cos(a) * r * 0.9, random.range(0.3, 0.8), Math.sin(a) * r * 0.9];
        const to = [Math.cos(a + random.range(-0.6, 0.6)) * random.range(0.9, 1.5), 0.01, Math.sin(a + random.range(-0.6, 0.6)) * random.range(0.9, 1.5)];

        strand(mesher, from, to, 0.006, SILK);
    }

    // (A sheet of web over its top)
    const rim = Array.from({ length: 8 }, (_, k) => [Math.cos((k / 8) * TAU) * r * 1.1, 0.55 + random.range(0, 0.25), Math.sin((k / 8) * TAU) * r * 1.1]);

    for (let k = 0; k < 8; k++) {
        mesher.tri([0, 0.95, 0], rim[(k + 1) % 8], rim[k], { colours: SILK.map((v) => v * 0.8) });
        mesher.tri([0, 0.95, 0], rim[k], rim[(k + 1) % 8], { colours: SILK.map((v) => v * 0.7) });
    }
}

// The dark elves': something wrapped in silk, lying where the spiders left it
function cocoon(mesher, random) {
    const lie = random.range(0, TAU);
    const [dx, dz] = [Math.cos(lie), Math.sin(lie)];
    const points = Array.from({ length: 6 }, (_, k) => {
        const t = k / 5 - 0.5;

        return [dx * t * 0.9, 0.16 + Math.sin((k / 5) * Math.PI) * 0.04, dz * t * 0.9];
    });

    tube(mesher, points, [0.05, 0.14, 0.17, 0.16, 0.12, 0.04], 7, { colours: SILK.map((v) => v * 0.85), caps: [true, true], wobble: (k, j) => 1 + ((k * 7 + j * 3) % 5) * 0.03 });

    // (Its lines still out to the grass)
    for (let k = 0; k < 6; k++) {
        const t = random.range(0, 1);
        const p = points[Math.floor(t * 5)];
        const a = random.range(0, TAU);

        strand(mesher, p, [p[0] + Math.cos(a) * 0.5, 0.01, p[2] + Math.sin(a) * 0.5], 0.004, SILK);
    }
}

// The dark elves': a cluster of black crystal, violet light at its heart
function crystals(mesher, random) {
    for (let k = 0; k < random.int(4, 8); k++) {
        const a = random.range(0, TAU);
        const out = k === 0 ? 0 : random.range(0.1, 0.35);
        const [x, z] = [Math.cos(a) * out, Math.sin(a) * out];
        const h = k === 0 ? 1 : random.range(0.3, 0.7);
        const r = k === 0 ? 0.14 : random.range(0.05, 0.1);
        const lean = [Math.cos(a) * out * 0.8, 0, Math.sin(a) * out * 0.8];
        const tip = [x + lean[0], h, z + lean[2]];
        const shoulder = [x + lean[0] * 0.8, h * 0.8, z + lean[2] * 0.8];
        const base = Array.from({ length: 5 }, (_, j) => [x + Math.cos((j / 5) * TAU + k) * r, -0.02, z + Math.sin((j / 5) * TAU + k) * r]);
        const upper = base.map(([bx, , bz]) => [bx + (shoulder[0] - x) + (bx - x) * -0.1, shoulder[1], bz + (shoulder[2] - z) + (bz - z) * -0.1]);
        const black = linear(random.pick([0x16141c, 0x1e1a28]));

        for (let j = 0; j < 5; j++) {
            mesher.quad(base[j], base[(j + 1) % 5], upper[(j + 1) % 5], upper[j], { colours: [black, black, black.map((v) => v * 4), black.map((v) => v * 4)] });
            mesher.tri(upper[j], upper[(j + 1) % 5], tip, { colours: [black.map((v) => v * 4), black.map((v) => v * 4), VIOLET] });
        }
    }
}

// The dark elves': toadstools that glow violet in the dark
function glowcaps(mesher, random) {
    for (let k = 0; k < random.int(3, 7); k++) {
        const a = random.range(0, TAU);
        const [x, z] = [Math.cos(a) * random.range(0, 0.15), Math.sin(a) * random.range(0, 0.15)];
        const h = random.range(0.04, 0.12);
        const r = random.range(0.025, 0.05);
        const at = (p) => [p[0] + x, p[1], p[2] + z];

        tube(mesher, [[x, -0.01, z], [x, h, z]], [r * 0.25, r * 0.2], 3, { colours: linear(0x3a3040) });
        lathe({ tri: (p, q, s, o) => mesher.tri(at(p), at(q), at(s), o), quad: (p, q, s, t, o) => mesher.quad(at(p), at(q), at(s), at(t), o) }, [[r * 0.3, h - 0.004], [r, h + r * 0.12], [r * 0.6, h + r * 0.5], [0, h + r * 0.6]], 6, { colours: [VIOLET.map((v) => v * 0.6), VIOLET, VIOLET, VIOLET] });
    }
}

// The dark elves': blackthorn, a tangle of black twigs set with long thorns
function blackthorn(mesher, random) {
    const black = linear(0x1a1618);

    for (let k = 0; k < random.int(4, 7); k++) {
        const a = random.range(0, TAU);
        const from = [random.range(-0.05, 0.05), 0, random.range(-0.05, 0.05)];
        const to = [Math.cos(a) * random.range(0.2, 0.4), random.range(0.15, 0.45), Math.sin(a) * random.range(0.2, 0.4)];
        const points = bent(random, from, to, 4, 0.06);

        tube(mesher, points, [0.012, 0.009, 0.006, 0.002], 3, { colours: black });

        for (const p of points.slice(1, 3)) {
            const b = random.range(0, TAU);

            tube(mesher, [p, [p[0] + Math.cos(b) * 0.06, p[1] + 0.03, p[2] + Math.sin(b) * 0.06]], [0.005, 0], 3, { colours: black });
        }
    }
}

// --- Each land's look ---

/**
 * How each land's rocks and grass look: its stone (an atlas layer), moss on its rocks (0 to 1),
 * snow on them, its grass's colours (at the foot and the tips: sRGB), and the colour of its fallen
 * wood.
 */
export const LOOKS = Object.freeze({
    farmland: { stone: "rock", moss: 0.3, grass: [0x3f5a24, 0x9ab85a] },
    meadow: { stone: "rock", moss: 0.35, grass: [0x3f5a24, 0xa2c05e] },
    woods: { stone: "rock", moss: 0.9, grass: [0x2f4a1e, 0x6f9440] },
    heath: { stone: "rock-pale", moss: 0.4, grass: [0x4a4a26, 0xa6a064] },
    marsh: { stone: "rock", moss: 0.8, grass: [0x34502e, 0x7a9a5c] },
    elfwood: { stone: "rock-pale", moss: 0.8, grass: [0x2e5a24, 0x8ad05a] },
    darkwood: { stone: "rock", moss: 1, grass: [0x22301a, 0x4e6a34] },
    savannah: { stone: "rock-red", moss: 0, grass: [0x6a5a2a, 0xd8c078] },
    jungle: { stone: "rock", moss: 1, grass: [0x2a5a1e, 0x6ab040] },
    badlands: { stone: "rock-red", moss: 0, grass: [0x5a4a2a, 0xb89a62] },
    volcanic: { stone: "rock-dark", moss: 0, grass: [0x3a3a2a, 0x7a7a52] },
    tundra: { stone: "rock", moss: 0.3, snow: 0.35, grass: [0x4a5a44, 0x9aa88a] },
    snow: { stone: "rock", moss: 0, snow: 1, grass: [0x6a7a6a, 0xc8d0c4] },
    mountain: { stone: "rock", moss: 0.2, snow: 0.3, grass: [0x44503a, 0x8e9a76] },
    beach: { stone: "rock-pale", moss: 0, grass: [0x6a7a5a, 0xb8c49a] },
});

const lookOfLand = (land) => LOOKS[land] ?? LOOKS.meadow;

/**
 * What grows where on each land: about how many things to the square metre where it's lushest
 * (before the fields thin it: bare stretches, drifts, clumps), and how likely each is. Flowers
 * (FLOWERS' kinds) grow in drifts of one kind; the rest as ROCKS, DEADWOOD, SHADE and WET say.
 */
export const UNDERGROWTH = Object.freeze({
    meadow: { density: 0.26, kinds: { tuft: 10, tall: 2.5, daisy: 2, poppy: 1.6, cornflower: 1, buttercup: 2, dandelion: 1.4, clock: 0.6, parsley: 1, yarrow: 0.8, campion: 1, thistle: 0.5, pebbles: 1, stones: 0.4, molehill: 0.6, burrow: 0.2, sticks: 0.3, campfire: 0.015 } },
    farmland: { density: 0.17, kinds: { tuft: 10, tall: 3, poppy: 3, cornflower: 2, parsley: 2, dandelion: 1.5, daisy: 1, pebbles: 1.2, molehill: 0.8, sticks: 0.3, campfire: 0.01 } },
    woods: { density: 0.15, kinds: { tuft: 6, fern: 4, bluebell: 2, foxglove: 1, agaric: 0.6, brown: 1.4, puffball: 0.4, sticks: 3, leaves: 3, pebbles: 0.6, stones: 0.4, burrow: 0.3 } },
    heath: { density: 0.24, kinds: { tuft: 6, heather: 6, bracken: 2, thistle: 0.8, pebbles: 1.5, stones: 1, sticks: 0.4, burrow: 0.3 } },
    marsh: { density: 0.24, kinds: { tuft: 5, reeds: 5, cotton: 2, fern: 1, brown: 0.6, sticks: 1, pebbles: 0.3 } },
    elfwood: { density: 0.25, kinds: { tuft: 6, fern: 3, bluebell: 2.5, foxglove: 1.5, campion: 1.5, daisy: 1, agaric: 0.4, brown: 0.6, leaves: 1.5, sticks: 1, pebbles: 0.5 } },
    darkwood: { density: 0.13, kinds: { tuft: 3, fern: 5, brown: 2, agaric: 1, puffball: 0.5, sticks: 4, leaves: 2, stones: 0.8, pebbles: 0.5, ring: 0.05 } },
    savannah: { density: 0.22, kinds: { dry: 10, tall: 4, yarrow: 0.5, pebbles: 1, stones: 0.6, bones: 0.4, sticks: 0.4 } },
    jungle: { density: 0.24, kinds: { tuft: 5, fern: 7, campion: 1, poppy: 0.5, brown: 0.6, sticks: 1.5, leaves: 1, pebbles: 0.4 } },
    badlands: { density: 0.1, kinds: { dry: 5, cactus: 2, tumbleweed: 1, bones: 1, pebbles: 2, stones: 2 } },
    volcanic: { density: 0.07, kinds: { dry: 2, shards: 3, pebbles: 3, stones: 3 } },
    tundra: { density: 0.15, kinds: { tuft: 6, cotton: 2, heather: 1.5, pebbles: 2, stones: 1.5 } },
    snow: { density: 0.05, kinds: { tuft: 2, pebbles: 2, stones: 2 } },
    mountain: { density: 0.12, kinds: { tuft: 4, heather: 1, pebbles: 3, stones: 3, scree: 1.5, bones: 0.2 } },
    beach: { density: 0.08, kinds: { marram: 4, shore: 3, pebbles: 2, sticks: 0.5 } },
});

/**
 * What else lies about in each people's homeland (where the plan's territory is theirs), mixed
 * with its land's own undergrowth, and how likely each is (as the land's kinds are weighed).
 */
export const HOME_UNDERGROWTH = Object.freeze({
    cat: { potsherds: 0.6, hornskull: 0.45 },
    orc: { bonepile: 0.9, blades: 0.9 },
    lizard: { eggshells: 0.8, glyphstone: 0.5 },
    elf: { petals: 3, moonbuds: 2.5 },
    darkElf: { glowcaps: 1.6, blackthorn: 2 },
});

/** Kinds that gather where it's rocky; where the land's let go; in trees' shade; by water. */
const ROCKS = new Set(["pebbles", "stones", "scree"]);
const DEADWOOD = new Set(["sticks", "leaves", "agaric", "brown", "puffball", "ring"]);
const SHADE = new Set(["fern", "bluebell", "foxglove", "agaric", "brown", "puffball", "leaves", "ring"]);
const WET = new Set(["reeds", "cotton"]);

/** The lands whose flowers bloom in drifts. */
const BLOOMS = new Set(Object.entries(UNDERGROWTH).filter(([, { kinds }]) => Object.keys(kinds).some((kind) => FLOWERS[kind] && !WET.has(kind))).map(([land]) => land));

/** Kinds that grow in settlements too (where they're thinner). */
const TENDED = new Set(["tuft", "daisy", "dandelion", "clock", "buttercup", "pebbles", "stones", "sticks", "leaves", "dry"]);

/** How many looks of each kind are made. */
export const VARIANTS = 8;

// Each look, made the first time it's wanted, by kind, land and number
const looks = new Map();

function lookOf(kind, land, index) {
    const key = `${kind}:${land}:${index}`;

    if (!looks.has(key)) {
        const random = randomOf(hashOf(index + 1, kind.length * 131 + [...kind].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 7), [...land].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 11)) * 4294967296);

        looks.set(key, made((mesher) => draw(mesher, random, kind, land)));
    }

    return looks.get(key);
}

// Draw one look of a kind for a land
function draw(mesher, random, kind, land) {
    const look = lookOfLand(land);
    const stone = { layer: look.stone, moss: look.moss, snow: look.snow ?? 0, lichen: look.moss ? 0.3 : 0.15 };
    const [base, tip] = look.grass.map(linear);

    switch (kind) {
        case "boulder":
            return rock(mesher, random, { detail: 1, rough: random.range(0.2, 0.35), cuts: random.int(2, 6), squash: random.range(0.55, 0.9), ...stone });
        case "outcrop":
            return land === "volcanic" && random.chance(0.6) ? columns(mesher, random) : outcrop(mesher, random, stone);
        case "log":
            return fallenTree(mesher, random);
        case "stump":
            return stump(mesher, random);
        case "snag":
            return snag(mesher, random);
        case "bush":
            return bush(mesher, random, bushLook(random, land));
        case "cairn":
            return cairn(mesher, random, look.stone);
        case "menhir":
            return menhir(mesher, random, look.stone);
        case "mound":
            return mound(mesher, random);
        case "haystack":
            return haystack(mesher, random);
        case "scarecrow":
            return scarecrow(mesher, random);
        case "logpile":
            return logPile(mesher, random);
        case "ruin":
            return ruin(mesher, random);
        case "ribs":
            return ribs(mesher, random);
        case "tuft":
            return tuft(mesher, random, { base, tip, heads: random.int(0, 2), head: linear(0xb8a878) });
        case "tall":
            return tuft(mesher, random, { base, tip: lerp(tip, linear(0xd8c890), 0.3), height: [0.55, 0.95], blades: [8, 14], spread: 0.16, heads: random.int(2, 5), head: linear(0xc8b484) });
        case "dry":
            return tuft(mesher, random, { base: linear(0x6a5a2e), tip: linear(0xd8c47e), height: [0.3, 0.7], blades: [8, 14], spread: 0.14, heads: random.int(0, 3), head: linear(0xe0cc90) });
        case "marram":
            return tuft(mesher, random, { base: linear(0x5a6a50), tip: linear(0xb0c0a0), height: [0.45, 0.8], blades: [9, 14], spread: 0.18, width: 0.02 });
        case "fern":
            return fern(mesher, random, linear(random.pick([0x2f6a22, 0x3a7a2a, 0x2a5e1e])));
        case "bracken":
            return fern(mesher, random, linear(random.pick([0x6e5424, 0x5e6028, 0x7a4a20])));
        case "reeds":
            return reeds(mesher, random);
        case "agaric":
        case "brown":
        case "puffball":
            return mushrooms(mesher, random, kind);
        case "ring": {
            // A fairy ring: pale buttons of mushrooms in a circle, a metre or two across
            const count = random.int(12, 18);
            const r = random.range(0.9, 1.6);

            for (let k = 0; k < count; k++) {
                const a = (k / count) * TAU + random.range(-0.1, 0.1);

                bud(mesher, [Math.cos(a) * r, 0.012, Math.sin(a) * r], random.range(0.02, 0.035), linear(random.pick([0xd8c8a8, 0xc8b08a, 0xe4d8c0])), 0, 0.6);
            }

            return undefined;
        }
        case "pebbles":
            return pebbles(mesher, random, random.int(3, 8), look.stone);
        case "stones":
            pebbles(mesher, random, random.int(1, 3), look.stone);

            return rockLittle(mesher, random, stone);
        case "scree":
            return pebbles(mesher, random, random.int(10, 18), look.stone);
        case "sticks":
            return sticks(mesher, random, linear(random.pick([0x5a4232, 0x6e5a48, 0x7a7064])));
        case "leaves":
            return leaves(mesher, random);
        case "molehill":
            return molehill(mesher, random);
        case "burrow":
            return burrow(mesher, random);
        case "bones":
            return bones(mesher, random);
        case "cactus":
            return cactus(mesher, random);
        case "tumbleweed":
            return tumbleweed(mesher, random);
        case "shards":
            return shards(mesher, random);
        case "shore":
            return shore(mesher, random);
        case "campfire":
            return campfire(mesher, random);
        // Each people's own lands'
        case "termites":
            return termiteMound(mesher, random);
        case "kopje":
            return kopje(mesher, random);
        case "hornskull":
            return hornSkull(mesher, random);
        case "potsherds":
            return potsherds(mesher, random);
        case "skullpole":
            return skullPole(mesher, random);
        case "stakes":
            return stakes(mesher, random);
        case "wrack":
            return wrack(mesher, random);
        case "bonepile":
            return bonePile(mesher, random);
        case "blades":
            return brokenBlades(mesher, random);
        case "mangrove":
            return mangrove(mesher, random);
        case "stela":
            return stela(mesher);
        case "eggshells":
            return eggshells(mesher, random);
        case "glyphstone":
            return glyphStone(mesher, random);
        case "moonstone":
            return moonstone(mesher, random);
        case "leaflamp":
            return leafLamp(mesher, random);
        case "petals":
            return petals(mesher, random);
        case "moonbuds":
            return moonbuds(mesher, random);
        case "webstump":
            return webStump(mesher, random);
        case "cocoon":
            return cocoon(mesher, random);
        case "crystals":
            return crystals(mesher, random);
        case "glowcaps":
            return glowcaps(mesher, random);
        case "blackthorn":
            return blackthorn(mesher, random);
        default:
            return FLOWERS[kind] ? flowers(mesher, random, kind) : undefined;
    }
}

// A stone or two, bigger than pebbles
function rockLittle(mesher, random, stone) {
    const part = made((inner) => rock(inner, random, { detail: 0, rough: 0.3, cuts: 3, squash: random.range(0.5, 0.8), ...stone }));

    place(mesher, part, { at: [random.range(-0.2, 0.2), 0, random.range(-0.2, 0.2)], turn: random.range(0, TAU), scale: [0.3, 0.3, 0.26], shift: [random.next(), random.next()] });
}

// A bush's colours for a land: its leaves, and its berries or flowers
function bushLook(random, land) {
    const looks = {
        heath: [{ leaves: linear(0x3e5a26), bloom: linear(0xf2c830), blooms: 22 }, { leaves: linear(0x4a5a2e) }],
        savannah: [{ leaves: linear(0x6a7a3a) }, { leaves: linear(0x7a7a44), bloom: linear(0xe8e0c0), blooms: 8 }],
        jungle: [{ leaves: linear(0x2e7a2a), bloom: linear(0xe84a6a), blooms: 10 }, { leaves: linear(0x3a8a30) }],
        tundra: [{ leaves: linear(0x4a5a3a), bloom: linear(0xc83a3a), blooms: 12 }],
    }[land] ?? [
        { leaves: linear(0x3e6a2a) },
        { leaves: linear(0x3a6226), bloom: linear(0x9a1c2a), blooms: 16 },
        { leaves: linear(0x44702c), bloom: linear(0x2a2a4a), blooms: 16 },
        { leaves: linear(0x4a7430), bloom: linear(0xf2eef0), blooms: 20 },
        { leaves: linear(0x3a5e2a), bloom: linear(0xe8a0c0), blooms: 14 },
    ];

    return random.pick(looks);
}

// A tint a little its own: lighter or darker, a little warmer or cooler
function tintOf(h) {
    const shade = 0.86 + h * 0.26;
    const warm = (hashOf(Math.floor(h * 1e6), 7, 3) - 0.5) * 0.08;

    return [shade * (1 + warm), shade, shade * (1 - warm)];
}

// --- Features, placed ---

/**
 * A chunk's features (core/wilds.js's) drawn: { mesh (at the chunk's corner, drawn with the atlas,
 * casting shadows), boxes ({ min: [x, z], max: [x, z], top }: each one's, in the world, for how
 * tall things stand on each square) }. `landAt(x, y)` is each point's land.
 */
export function featureMesh(features, landAt, [x0, y0]) {
    const mesher = new Mesher(Math.max(64, features.length * 400));
    const boxes = [];

    for (const feature of features) {
        const land = landAt(Math.floor(feature.x), Math.floor(feature.y));
        const index = Math.floor(feature.variant * VARIANTS) % VARIANTS;
        const part = lookOf(feature.kind, land, index);
        const { scale, turn } = fit(feature, part);
        const tint = tintOf(hashOf(Math.floor(feature.x * 10), Math.floor(feature.y * 10), 17));

        place(mesher, part, { at: [feature.x - x0, 0, feature.y - y0], turn, scale, tint, shift: [feature.variant * 7.3, feature.variant * 3.1] });

        const reach = Math.max(scale[0], scale[2]) * 0.7;

        boxes.push({ min: [feature.x - reach, feature.y - reach], max: [feature.x + reach, feature.y + reach], top: part.top * scale[1] });
    }

    const mesh = new THREE.Mesh(mesher.geometry(), atlasMaterial());

    mesh.name = "wilds";
    mesh.position.set(x0, 0, y0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return { mesh, boxes };
}

// How a feature's look is stretched and turned to its size (its looks are about a metre)
function fit({ kind, size, height, turn }, part) {
    const tall = height / Math.max(0.01, part.top);

    switch (kind) {
        case "log":
        case "logpile":
        case "ruin":
        case "ribs":
            // (Lying along its length: core's turn is from east towards south, ours about the upright)
            return { scale: [size, size, size], turn: -turn };
        case "snag":
        case "scarecrow":
            return { scale: [height, height, height], turn };
        case "stump":
            return { scale: [size * 2, size * 2, size * 2], turn };
        case "menhir":
            return { scale: [size * 2.4, tall, size * 2.4], turn };
        case "mound":
            return { scale: [size * 3, tall, size * 3], turn };
        case "cairn":
            return { scale: [tall, tall, tall], turn };
        default:
            return { scale: [size * 2, tall, size * 2], turn };
    }
}

// --- Undergrowth, placed ---

// The fields' grid (metres), and how far (squares) trees' shade and water's wet reach
const FIELD_STEP = 4;
const SHADE_REACH = 4;
const WET_REACH = 3;

/**
 * Where a chunk's undergrowth grows, and what: [{ kind, look (which of its looks), x, y (metres, in
 * the world), turn, size, tint }]. From each square of it (overworld.js's chunk): grass, not
 * blocked, no road, bridge or water; how much and what from its land, and from the fields (bare
 * stretches and lush ones, drifts of flowers, rocky ground, let-go ground), the trees' shade and
 * the water's edge; thinner in settlements. The same every time for the same chunk. `density`
 * thins it all (for slower devices).
 */
export function undergrowthOf(overworld, chunk, { density = 1 } = {}) {
    const { x0, y0 } = chunk;
    const size = Math.sqrt(chunk.ground.length);
    const seed = overworld.plan.seed;
    const grid = size / FIELD_STEP + 1;
    const fields = { rocky: new Float32Array(grid * grid), dead: new Float32Array(grid * grid), lush: new Float32Array(grid * grid), clump: new Float32Array(grid * grid), bloom: new Float32Array(grid * grid) };

    for (let j = 0; j < grid; j++) {
        for (let i = 0; i < grid; i++) {
            const [x, y] = [x0 + i * FIELD_STEP, y0 + j * FIELD_STEP];
            const k = j * grid + i;

            fields.rocky[k] = rockiness(x, y, seed);
            fields.dead[k] = neglect(x, y, seed);
            fields.lush[k] = 0.25 + 1.5 * fractal(x, y, 55, seed * 31 + 5, 2) ** 1.5;
            fields.clump[k] = fractal(x, y, 11, seed * 31 + 6, 2);
            fields.bloom[k] = Math.min(1, Math.max(0, (fractal(x, y, 38, seed * 31 + 7, 2) - 0.45) / 0.2));
        }
    }

    const field = (name, i, j) => {
        const [fi, fj] = [i / FIELD_STEP, j / FIELD_STEP];
        const [gi, gj] = [Math.min(grid - 2, Math.floor(fi)), Math.min(grid - 2, Math.floor(fj))];
        const [ti, tj] = [fi - gi, fj - gj];
        const f = fields[name];
        const top = f[gj * grid + gi] + (f[gj * grid + gi + 1] - f[gj * grid + gi]) * ti;
        const bottom = f[(gj + 1) * grid + gi] + (f[(gj + 1) * grid + gi + 1] - f[(gj + 1) * grid + gi]) * ti;

        return top + (bottom - top) * tj;
    };

    // Squares in trees' shade, and by water
    const shade = near(size, chunk.trees.map(({ x, y }) => [x - x0, y - y0]), SHADE_REACH);
    const wet = near(size, [...chunk.water.keys()].filter((k) => chunk.water[k]).map((k) => [k % size, Math.floor(k / size)]), WET_REACH);
    const drifts = new Map();
    const drift = (kind, x, y) => {
        if (!drifts.has(kind)) {
            drifts.set(kind, [...kind].reduce((sum, c) => sum * 31 + c.charCodeAt(0), seed + 101) % 100003);
        }

        const value = fractal(x, y, 26, drifts.get(kind), 2);

        return value < 0.5 ? 0 : Math.min(1, (value - 0.5) / 0.22);
    };
    const items = [];

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const k = j * size + i;
            const [x, y] = [x0 + i, y0 + j];

            if (chunk.ground[k] !== GROUND.grass || chunk.blocked[k] || chunk.water[k] || chunk.bridge[k]) {
                continue;
            }

            const land = overworld.biomeAt(x, y);
            const spec = UNDERGROWTH[land];

            if (!spec) {
                continue;
            }

            const tended = overworld.settled(x, y);
            const bloom = BLOOMS.has(land) ? field("bloom", i, j) : 0;
            const odds = spec.density * field("lush", i, j) * (1 + 1.5 * bloom) * (tended ? 0.3 : 1) * density;

            if (hashOf(x, y, seed + 1) >= odds) {
                continue;
            }

            const [rocky, dead, clump] = [field("rocky", i, j), field("dead", i, j), field("clump", i, j)];
            const home = HOME_UNDERGROWTH[overworld.homeAt?.(x, y)];
            const weights = [];
            let total = 0;

            for (const [kind, weight] of home ? [...Object.entries(spec.kinds), ...Object.entries(home)] : Object.entries(spec.kinds)) {
                let w = weight;

                if (tended && !TENDED.has(kind)) {
                    continue;
                }

                if (FLOWERS[kind] && !WET.has(kind)) {
                    w *= 0.08 + (1 + 5 * bloom) * drift(kind, x, y);
                }

                if (ROCKS.has(kind)) {
                    w *= 0.25 + 2 * rocky;
                }

                if (DEADWOOD.has(kind)) {
                    w *= 0.25 + 1.5 * dead;
                }

                if (SHADE.has(kind)) {
                    w *= shade[k] ? 2.5 : 0.5;
                }

                if (WET.has(kind)) {
                    w *= wet[k] ? 4 : land === "marsh" ? 1 : 0.05;
                }

                if (kind === "tuft" || kind === "tall" || kind === "dry" || kind === "marram") {
                    w *= 0.4 + 1.4 * clump;
                }

                if (w > 0) {
                    weights.push([kind, w]);
                    total += w;
                }
            }

            let left = hashOf(x, y, seed + 2) * total;
            const [kind] = weights.find(([, w]) => (left -= w) < 0) ?? weights.at(-1) ?? [null];

            if (!kind) {
                continue;
            }

            items.push({
                kind,
                land,
                look: Math.floor(hashOf(x, y, seed + 3) * VARIANTS),
                x: x + 0.15 + hashOf(x, y, seed + 4) * 0.7,
                y: y + 0.15 + hashOf(x, y, seed + 5) * 0.7,
                turn: hashOf(x, y, seed + 6) * TAU,
                size: 0.8 + hashOf(x, y, seed + 7) * 0.45,
                tint: tintOf(hashOf(x, y, seed + 8)),
            });
        }
    }

    return items;
}

// Which squares of a chunk are within `reach` of any of some points ([x, y] in the chunk)
function near(size, points, reach) {
    const within = new Uint8Array(size * size);

    for (const [px, py] of points) {
        for (let y = Math.max(0, Math.floor(py - reach)); y <= Math.min(size - 1, Math.floor(py + reach)); y++) {
            for (let x = Math.max(0, Math.floor(px - reach)); x <= Math.min(size - 1, Math.floor(px + reach)); x++) {
                if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= reach) {
                    within[y * size + x] = 1;
                }
            }
        }
    }

    return within;
}

/** The undergrowth is drawn in tiles this many metres square (each shown only while it's near). */
export const TILE = 32;

/**
 * A chunk's undergrowth (undergrowthOf's) being built a few things at a time, then drawn as a mesh
 * for each TILE of it, at the tile's corner, with the atlas's undergrowth material (swaying, and
 * sinking into the ground away from the player: engine/atlas.js WILDS, whose `focus` the game
 * keeps where the player is).
 */
export class Growth {
    constructor(items, [x0, y0]) {
        this.items = items;
        this.origin = [x0, y0];
        this.index = 0;
        this.tiles = new Map();
    }

    /** Place what can be placed before `until` (performance.now()'s); whether it's all placed. */
    grow(until = Infinity) {
        while (this.index < this.items.length) {
            if (this.index % 8 === 0 && performance.now() > until) {
                return false;
            }

            const { kind, land, look, x, y, turn, size, tint } = this.items[this.index++];
            const [tx, ty] = [Math.floor((x - this.origin[0]) / TILE), Math.floor((y - this.origin[1]) / TILE)];
            const key = `${tx},${ty}`;

            if (!this.tiles.has(key)) {
                this.tiles.set(key, { at: [this.origin[0] + tx * TILE, this.origin[1] + ty * TILE], mesher: new Mesher(4096) });
            }

            const { at, mesher } = this.tiles.get(key);

            place(mesher, lookOf(kind, land, look), { at: [x - at[0], 0, y - at[1]], turn, scale: [size, size, size], tint, shift: [x * 0.37, y * 0.29] });
        }

        return true;
    }

    /** A mesh for each tile with anything in it (`userData.tile`: [x0, y0], its corner). */
    meshes() {
        return [...this.tiles.values()].filter(({ mesher }) => mesher.count).map(({ at, mesher }) => {
            const mesh = new THREE.Mesh(mesher.geometry(true), wildsMaterial(TREE_WIND.time));

            mesh.name = "undergrowth";
            mesh.position.set(at[0], 0, at[1]);
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            mesh.userData.tile = at;

            return mesh;
        });
    }
}

/** A chunk's undergrowth (undergrowthOf's) drawn, all at once: a Group of its tiles' meshes. */
export function undergrowthMesh(items, origin) {
    const growth = new Growth(items, origin);
    const group = new THREE.Group();

    growth.grow();
    group.name = "undergrowth";
    group.add(...growth.meshes());

    return group;
}

// The peoples' homelands' own features (core/wilds.js HOMELANDS)
const HOME_FEATURES = ["termites", "kopje", "skullpole", "stakes", "wrack", "mangrove", "stela", "moonstone", "leaflamp", "webstump", "cocoon", "crystals"];

/** Every kind drawn here (the features' and the undergrowth's), for tests and the lab. */
export const KINDS = Object.freeze([...new Set(["boulder", "outcrop", "log", "stump", "snag", "bush", "cairn", "menhir", "mound", "haystack", "scarecrow", "logpile", "ruin", "ribs", ...HOME_FEATURES, ...Object.values(UNDERGROWTH).flatMap(({ kinds }) => Object.keys(kinds)), ...Object.values(HOME_UNDERGROWTH).flatMap((kinds) => Object.keys(kinds))])]);

/** One look of a kind for a land, as a geometry on its own (for tests and the lab). */
export function lookGeometry(kind, land = "meadow", index = 0) {
    const part = lookOf(kind, land, index);
    const mesher = new Mesher(part.count);

    place(mesher, part, { at: [0, 0, 0] });

    return mesher.geometry(true);
}
