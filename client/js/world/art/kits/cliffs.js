// Cliffs of rock where the land's too steep to climb (the terrain plan's M7h, §9 "Rock relief:
// cliffs with strata, boulders at their feet"). The ground there was a smooth slope with rock
// painted on it; now a skin of rock stands out from it: the ground's own shape on a 2 m lattice,
// each point pushed out along the ground's normal by how steep it is, so where it's a cliff (past
// 38°: core/terrain/height.js SLOPE.cliff) it stands proud, and where it eases off it sinks back
// under the ground, no edge to it. How far out: a little for all of it, and the bedding of the
// rock (a ledge jutting at the foot of each layer, every 5.5 m of height, the layers' heights
// wandering a little across the land, each layer a shade of its own), and the rock broken up by
// noise into faces and crags. Lit flat, a face at a time, as broken stone is; moss on the ledges'
// tops in a green land, snow on them high up or in the cold; and scree at the cliffs' feet, chips
// of the same rock. The rock's picture laid on from three sides by where it is in the world
// (engine/atlas.js cliffMaterial), so no seams and no smears however the skin bends. Only what's
// drawn: it's on ground no one walks (or sinks under where they could), so the rules don't know of
// it. A mesh a chunk, only where there are cliffs; every chunk's the same as its neighbours' at
// their edges (worked out from the world, not the chunk).
//
// Not on a road, a bridge, water or what's built.

import * as THREE from "three";
import { hashOf } from "../../../core/noise.js";
import { CHUNK } from "../../../core/overworld.js";
import { WORLD_SIZE } from "../../../core/worldplan/plan.js";
import { GROUND } from "../../../core/setpieces/pieces.js";
import { between } from "../../../core/terrain/ground.js";
import { SLOPE } from "../../../core/terrain/height.js";
import { ALPINE } from "../../ground.js";
import { cliffMaterial, LAYERS } from "../engine/atlas.js";
import { MATERIALS } from "../engine/painters.js";
import { LOOKS } from "./wilds.js";

/**
 * How the cliffs are made: the lattice (metres), how far each of its points is moved off it (of a
 * step, so no grid shows), and how tall a step of it may stand before it's split (metres, into at
 * most `most`: a sheer face isn't one long sliver); the steepness (rise over run) they start
 * standing out at and are wholly out by (from a little under the climbable to a little over: 36°
 * to 41°); how far the skin sinks under the ground where it's not a cliff, and how far it stands
 * out at the least where it is (metres); the bedding (each layer's height, how far its foot juts;
 * how far the layers rise and fall across the land, tilted, and wander, metres); the rock broken up
 * (how far, metres, in buttresses 13 m across and crags 6.5 m: nothing finer than the lattice
 * draws, or it's spikes); how many times larger the rock's picture is on them than on a boulder;
 * how much of a cliff the ground is where its colour's all the ground's beside it and where it's
 * all the rock's (`edge`: so where it comes out of the ground no line shows); and the scree at
 * their feet (how many chips a cell at most, how big, metres).
 */
export const CLIFFS = Object.freeze({
    step: 2,
    jitter: 0.42,
    tall: 2.5,
    most: 6,
    from: 0.7265,
    full: 0.8693,
    sunk: 0.5,
    proud: 0.35,
    layer: 5.5,
    ledge: 0.75,
    dip: 26,
    wander: 1.4,
    broken: [1.1, 0.9],
    picture: 3,
    edge: [0.15, 0.65],
    scree: { chips: 3, size: [0.18, 0.55] },
});

// How many rows of the lattice are worked out a step (cliffsInto)
const ROWS = 4;

// How many of the lattice's nodes outside a chunk each way the ground round it is read at
// (GroundNear): its rises wanted a node further out than the skin's points furthest out (the
// lattice a point past the chunk, moved off it by up to most of a step)
const MARGIN = 3;

const LAYER = Object.fromEntries(LAYERS.map((name, k) => [name, k]));
const METRES = Object.fromEntries(Object.entries(MATERIALS).map(([name, { world }]) => [name, world / 5]));
const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

// 3D value noise from 0 to 1 at a point (lattice units)
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

/**
 * How much of a cliff the ground is at a point (0 to 1), from how steep it is there (`gradient`: the
 * ground's rise along x and along y), and the ground's normal ([x, up, y]).
 */
export function cliffOf([gx, gy]) {
    const steep = Math.hypot(gx, gy);
    const length = Math.hypot(gx, 1, gy);

    return { cliff: smoothstep(CLIFFS.from, CLIFFS.full, steep), normal: [-gx / length, 1 / length, -gy / length], steep };
}

/**
 * How far out from the ground the rock stands at a point (metres, along the ground's normal; under
 * it, where it's no cliff), and which layer of the bedding it's in: { out, layer, up (how far up
 * its layer it is, 0 at its foot to 1 at its top) }.
 */
export function standsOut(x, y, height, cliff) {
    // (The layers tilted and bent across the land, so they run across a slope, not along it)
    const bedding = height + CLIFFS.dip * (noise3(x / 190, y / 190, 0.5, 67) - 0.5) * 2 + CLIFFS.wander * (noise3(x / 29, y / 29, 0.5, 71) - 0.5) * 2;
    const layer = Math.floor(bedding / CLIFFS.layer);
    const up = bedding / CLIFFS.layer - layer;
    // (Each layer jutting low down, receding up it to the next: a smooth swell, not a step, or the
    // lattice catches its edge as a spike)
    const ledge = CLIFFS.ledge * 0.5 * (1 + Math.cos(2 * Math.PI * (up - 0.2)));

    if (cliff <= 0) {
        return { out: -CLIFFS.sunk, layer, up };
    }

    const [buttress, crag] = CLIFFS.broken;
    const broken = buttress * (noise3(x / 13, height / 13, y / 13, 2) - 0.5) + crag * (noise3(x / 6.5, height / 6.5, y / 6.5, 3) - 0.5);

    return { out: cliff * (CLIFFS.proud + ledge + broken) - (1 - cliff) * CLIFFS.sunk, layer, up };
}

/**
 * The ground round a chunk as the skin reads it: its height anywhere (the chunks' own corners'
 * heights, `heightsOf(cx, cy)`: core/terrain/ground.js between, as the ground's drawn) and how it
 * rises (worked out over 4 m on the 2 m lattice once, and blended between), so the skin's the same
 * on both sides of a chunk's edge.
 */
export class GroundNear {
    constructor(heightsOf, cx, cy) {
        this.heightsOf = heightsOf;
        this.kept = new Map();
        this.x0 = cx * CHUNK;
        this.y0 = cy * CHUNK;

        // (The lattice's heights from MARGIN steps outside the chunk to MARGIN past it, and its
        // rises from a step less outside to a step less past)
        const { step } = CLIFFS;
        const span = CHUNK / step + 1 + MARGIN * 2;

        this.span = span;
        this.nodes = new Float64Array(span * span);
        this.rises = new Float64Array(span * span * 2);

        for (let j = 0; j < span; j++) {
            for (let i = 0; i < span; i++) {
                this.nodes[j * span + i] = this.height(this.x0 + (i - MARGIN) * step, this.y0 + (j - MARGIN) * step);
            }
        }

        for (let j = 1; j < span - 1; j++) {
            for (let i = 1; i < span - 1; i++) {
                const k = j * span + i;

                this.rises[k * 2] = (this.nodes[k + 1] - this.nodes[k - 1]) / (2 * step);
                this.rises[k * 2 + 1] = (this.nodes[k + span] - this.nodes[k - span]) / (2 * step);
            }
        }
    }

    /** The ground's height at a point (world metres; kept to the world). */
    height(px, py) {
        const [x, y] = [Math.min(WORLD_SIZE - 0.01, Math.max(0, px)), Math.min(WORLD_SIZE - 0.01, Math.max(0, py))];
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
        const key = cy * 1024 + cx;
        let heights = this.kept.get(key);

        if (!heights) {
            heights = this.heightsOf(cx, cy);
            this.kept.set(key, heights);
        }

        return between(heights, x - cx * CHUNK, y - cy * CHUNK);
    }

    /** How the ground rises at a point (world metres, within a step of the chunk): [along x, along y]. */
    rise(x, y) {
        const { step } = CLIFFS;
        const [u, v] = [(x - this.x0) / step + MARGIN, (y - this.y0) / step + MARGIN];
        const [i, j] = [Math.min(this.span - 3, Math.max(1, Math.floor(u))), Math.min(this.span - 3, Math.max(1, Math.floor(v)))];
        const [s, t] = [u - i, v - j];
        const at = (di, dj, axis) => this.rises[((j + dj) * this.span + i + di) * 2 + axis];
        const blend = (axis) => (at(0, 0, axis) * (1 - s) + at(1, 0, axis) * s) * (1 - t) + (at(0, 1, axis) * (1 - s) + at(1, 1, axis) * s) * t;

        return [blend(0), blend(1)];
    }
}

// Where the skin is over the ground at a point of the world (x, y metres): [x, height, y] in the
// world, and the rest of what's known there ({ cliff, layer, up, height })
function surfaceAt(ground, x, y) {
    const height = ground.height(x, y);
    const { cliff, normal } = cliffOf(ground.rise(x, y));
    const { out, layer, up } = standsOut(x, y, height, cliff);

    return { world: [x + normal[0] * out, height + normal[1] * out, y + normal[2] * out], cliff, layer, up, height, x, y };
}

// The skin's normal at a point of it (`here`) from the points of it each way round it (world
// positions): out of the rock, upwards
function normalAt(east, west, south, north) {
    const [ux, uy, uz] = [east[0] - west[0], east[1] - west[1], east[2] - west[2]];
    const [vx, vy, vz] = [south[0] - north[0], south[1] - north[1], south[2] - north[2]];
    const normal = [vy * uz - vz * uy, vz * ux - vx * uz, vx * uy - vy * ux];
    const length = (Math.hypot(...normal) || 1) * Math.sign(normal[1] || 1);

    return normal.map((v) => v / length);
}

// A point of the skin worked out on its own (a cell's side split, its middle): its normal blended
// from the lattice points' it's between (`from`: [[point, weight], ...]), so a side's split the same
// in the cell either side of it
function skinAt(ground, x, y, x0, y0, from) {
    const here = surfaceAt(ground, x, y);
    const normal = [0, 0, 0];

    for (const [point, weight] of from) {
        normal[0] += point.normal[0] * weight;
        normal[1] += point.normal[1] * weight;
        normal[2] += point.normal[2] * weight;
    }

    const length = Math.hypot(...normal) || 1;

    return { ...here, at: [here.world[0] - x0, here.world[1], here.world[2] - y0], normal: normal.map((v) => v / length) };
}

// Where a point of the lattice is in the world: moved off it a little its own way (the same
// whichever chunk asks)
function latticeAt(x, y) {
    const { step, jitter } = CLIFFS;

    return [x + (hashOf(x, y, 953) - 0.5) * 2 * jitter * step, y + (hashOf(x, y, 967) - 0.5) * 2 * jitter * step];
}

/**
 * The cliffs in a chunk (`chunk`: overworld.js's, its squares' ground, water, bridges and what's
 * built), into a mesher (kits/wilds.js Mesher), about the chunk's corner: the skin of rock over its
 * steep ground and the scree at the cliffs' feet. `heightsOf(cx, cy)` each chunk's corners'
 * heights (core/terrain/ground.js Ground's chunk), `landAt` the land at a square. A few rows of
 * the lattice a step (each a yield: a chunk all cliff is 25 to 30 ms of work); how many triangles
 * it made, at the end.
 */
export function* cliffsInto(mesher, chunk, heightsOf, landAt) {
    const { step } = CLIFFS;
    const cells = CHUNK / step;
    const corners = cells + 1;
    // (The lattice a point further out each way: the skin's normals at the chunk's edge from its
    // neighbours' points, as theirs are)
    const span = corners + 2;
    const { x0, y0 } = chunk;
    const ground = new GroundNear(heightsOf, Math.floor(x0 / CHUNK), Math.floor(y0 / CHUNK));
    const lattice = new Array(span * span);
    let any = false;

    for (let j = 0; j < span; j++) {
        for (let i = 0; i < span; i++) {
            const [x, y] = latticeAt(x0 + (i - 1) * step, y0 + (j - 1) * step);

            lattice[j * span + i] = surfaceAt(ground, x, y);
        }

        if (j % ROWS === ROWS - 1) {
            yield;
        }
    }

    const points = new Array(corners * corners);

    for (let j = 0; j < corners; j++) {
        for (let i = 0; i < corners; i++) {
            const k = (j + 1) * span + i + 1;
            const here = lattice[k];

            points[j * corners + i] = { ...here, at: [here.world[0] - x0, here.world[1], here.world[2] - y0], normal: normalAt(lattice[k + 1].world, lattice[k - 1].world, lattice[k + span].world, lattice[k - span].world) };
            any ||= here.cliff > 0.02;
        }
    }

    if (!any) {
        return 0;
    }

    const before = mesher.count;
    const land = landAt(Math.floor(x0 + CHUNK / 2), Math.floor(y0 + CHUNK / 2));
    const look = LOOKS[land] ?? LOOKS.mountain;
    const layer = LAYER[look.stone] ?? LAYER.rock;
    // (The rock's picture three times the size it is on a boulder: on a cliff, at its own size, it
    // shows as a fine pattern repeating across the face. How many copies to a metre, each vertex's:
    // cliffMaterial lays it on)
    const copies = 1 / ((METRES[look.stone] ?? 1) * CLIFFS.picture);
    const uvs = [[copies, 0], [copies, 0], [copies, 0]];
    const snowLine = ALPINE.snow[0] - ALPINE.wander;

    for (let j = 0; j < cells; j++) {
        for (let i = 0; i < cells; i++) {
            const corner = [points[j * corners + i], points[j * corners + i + 1], points[(j + 1) * corners + i + 1], points[(j + 1) * corners + i]];

            if (Math.max(...corner.map(({ cliff }) => cliff)) < 0.02 || !open(chunk, i * step, j * step)) {
                continue;
            }

            for (const [p, q, r] of cellTriangles(corner, ground, x0, y0)) {
                mesher.tri(p.at, q.at, r.at, { layer, colours: [p, q, r].map((point) => rockColour(look, point, snowLine)), normals: [p.normal, q.normal, r.normal], uvs });
            }
        }

        if (j % ROWS === ROWS - 1) {
            yield;
        }
    }

    scree(mesher, chunk, ground, points, corners, { layer, uvs, look });

    return (mesher.count - before) / 3;
}

/**
 * A chunk's cliffs drawn (what cliffsInto made, in `mesher`): a mesh at the chunk's corner
 * ([x0, y0], metres), drawn with cliffMaterial, casting shadows and taking them.
 */
export function cliffMesh(mesher, [x0, y0]) {
    const mesh = new THREE.Mesh(mesher.geometry(), cliffMaterial());

    mesh.name = "cliffs";
    mesh.position.set(x0, 0, y0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
}

// A cell of the skin's triangles (its corners counter-clockwise from above: [a, b, c, d]): two, split
// along the diagonal that keeps the rock's faces least bent; or, where one of its sides stands
// taller than CLIFFS.tall, that side split into as many pieces as it takes (worked out from the
// side alone, so the cell beside it splits it the same) and the cell's triangles fanned from its
// middle
function cellTriangles(corner, ground, x0, y0) {
    const [a, b, c, d] = corner;
    const pieces = (p, q) => Math.min(CLIFFS.most, Math.max(1, Math.ceil(Math.abs(p.height - q.height) / CLIFFS.tall)));
    const sides = [[a, b], [b, c], [c, d], [d, a]];
    const counts = sides.map(([p, q]) => pieces(p, q));

    if (counts.every((n) => n === 1)) {
        const split = Math.abs(a.at[1] - c.at[1]) < Math.abs(b.at[1] - d.at[1]);

        return split ? [[a, c, b], [a, d, c]] : [[a, d, b], [b, d, c]];
    }

    // (Round its edge, each side's own pieces, and fanned from its middle)
    const ring = [];

    sides.forEach(([p, q], k) => {
        ring.push(p);

        for (let n = 1; n < counts[k]; n++) {
            const t = n / counts[k];

            ring.push(skinAt(ground, p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, x0, y0, [[p, 1 - t], [q, t]]));
        }
    });

    const middle = skinAt(ground, (a.x + b.x + c.x + d.x) / 4, (a.y + b.y + c.y + d.y) / 4, x0, y0, corner.map((p) => [p, 0.25]));

    // (The ring runs a, b, c, d: clockwise from above, as the triangles a, c, b are)
    return ring.map((p, k) => [middle, ring[(k + 1) % ring.length], p]);
}

// Whether a cell of the lattice (its corner, metres into the chunk) is open to the cliffs: none of
// its squares a road, a bridge, water or built on
function open(chunk, ox, oy) {
    for (let sy = oy; sy < oy + CLIFFS.step; sy++) {
        for (let sx = ox; sx < ox + CLIFFS.step; sx++) {
            const k = sy * CHUNK + sx;

            if (chunk.ground?.[k] === GROUND.road || chunk.bridge?.[k] || chunk.water?.[k] || chunk.solid?.[k]) {
                return false;
            }
        }
    }

    return true;
}

// The rock's colour at a point of the skin (each point's own, the same in every triangle it's a
// corner of, so the colours blend across the rock, no face standing out): its layer's own shade,
// darker up under the ledge above; where it's hardly a cliff (at its brow and its foot, where it
// comes out of the ground), the ground's colour there (CLIFFS.edge), so where it meets the ground
// no line of rock shows; moss on what faces up in a green land, snow high up or in the cold, patchy
function rockColour(look, { layer, up, height, normal, x, y, cliff }, snowLine) {
    const shade = 0.74 + 0.28 * hashOf(layer, 17, 401);
    const rock = [1, 0.985, 0.96].map((v) => v * shade * (1 - 0.28 * smoothstep(0.55, 1, up)));
    const tint = mix(groundTint(look), rock, smoothstep(CLIFFS.edge[0], CLIFFS.edge[1], cliff));
    const facesUp = smoothstep(0.62, 0.9, normal[1]);
    const snow = Math.max(look.snow ?? 0, smoothstep(snowLine, snowLine + ALPINE.wander * 2, height));
    const speckle = hashOf(Math.floor(x * 3.1), Math.floor(y * 2.7), 211);

    if (snow > 0 && facesUp > 0) {
        return mix(tint, [1.15, 1.17, 1.2], Math.min(1, facesUp * snow * (0.7 + 0.5 * speckle)));
    }

    if (look.moss > 0 && facesUp > 0) {
        return mix(tint, [0.24, 0.3, 0.14], Math.min(0.8, facesUp * look.moss * (0.25 + 0.55 * speckle)));
    }

    return tint;
}

// The scree at the cliffs' feet: chips of the rock where the ground below a cliff eases off
function scree(mesher, chunk, ground, points, corners, { layer, uvs, look }) {
    const { step, scree: { chips, size } } = CLIFFS;

    for (let j = 1; j < corners - 1; j++) {
        for (let i = 1; i < corners - 1; i++) {
            const here = points[j * corners + i];

            // (Where it's eased off below a cliff: a cliff within a step uphill of it)
            if (here.cliff > 0.15 || !open(chunk, Math.min(CHUNK - step, i * step), Math.min(CHUNK - step, j * step))) {
                continue;
            }

            const above = [points[j * corners + i - 1], points[j * corners + i + 1], points[(j - 1) * corners + i], points[(j + 1) * corners + i]].filter((p) => p.cliff > 0.6 && p.height > here.height + 0.5);

            if (!above.length) {
                continue;
            }

            const [wx, wy] = [chunk.x0 + i * step, chunk.y0 + j * step];
            const count = Math.floor(hashOf(wx, wy, 907) * (chips + 1));

            for (let n = 0; n < count; n++) {
                const [dx, dy] = [(hashOf(wx, wy, 911 + n) - 0.5) * step * 1.6, (hashOf(wx, wy, 919 + n) - 0.5) * step * 1.6];
                const [x, y] = [wx + dx, wy + dy];
                const r = size[0] + (size[1] - size[0]) * hashOf(wx, wy, 929 + n) ** 2;

                chip(mesher, [x - chunk.x0, ground.height(x, y) - r * 0.35, y - chunk.y0], r, hashOf(wx, wy, 937 + n), { layer, uvs, look });
            }
        }
    }
}

// A chip of rock (an octahedron, jittered and flattened), `r` metres across
function chip(mesher, [x, y, z], r, seed, { layer, uvs, look }) {
    const turn = seed * Math.PI * 2;
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const jitter = (k) => 0.7 + 0.6 * hashOf(Math.floor(seed * 1e6), k, 941);
    const corners = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([px, py, pz], k) => {
        const [u, v, w] = [px * r * jitter(k), py * r * 0.6 * jitter(k + 6), pz * r * jitter(k + 12)];

        return [x + u * c - w * s, y + v, z + u * s + w * c];
    });
    const faces = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
    const shade = 0.75 + 0.3 * hashOf(Math.floor(seed * 1e5), 3, 947);
    const tint = [shade, shade * 0.98, shade * 0.95];

    for (const [a, b, d] of faces) {
        mesher.tri(corners[a], corners[b], corners[d], { layer, colours: look.moss > 0.5 ? mix(tint, [0.3, 0.38, 0.2], 0.15) : tint, uvs });
    }
}

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

// The ground's colour beside a cliff where it comes out of it (as a tint of the rock's picture):
// its land's grass, and the rock the ground's painted with on a slope so steep (GROUND_ROCK of it)
const tints = new Map();

function groundTint(look) {
    if (!tints.has(look)) {
        const stone = new THREE.Color(MATERIALS[look.stone]?.base ?? MATERIALS.rock.base);
        const [dark, light] = look.grass.map((hex) => new THREE.Color(hex));
        const grass = dark.clone().lerp(light, 0.5).lerp(new THREE.Color(MATERIALS.rock.base), GROUND_ROCK);

        tints.set(look, [grass.r / stone.r, grass.g / stone.g, grass.b / stone.b]);
    }

    return tints.get(look);
}

// How much of the ground beside a cliff, where it comes out of it, is painted rock (world/ground.js
// ROCK_FROM: at 36°, about a third)
const GROUND_ROCK = 0.35;

/** The steepness (rise over run) past which the ground's a cliff, as the rules have it. */
export const CLIFF_STEEP = SLOPE.cliff;
