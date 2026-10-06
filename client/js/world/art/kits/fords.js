// The fords' ways over, drawn (core/terrain/waters.js fordOf; core/overworld.js onFordWay, which
// treads the banks bare either side): a row of stepping stones straight across the water at each
// ford's middle, their tops just clear of it, of the land's own rock (bigger, in rocky lands); and
// in wooded lands a fallen trunk lying across the river a little downstream of them, its ends up on
// the banks. Only drawn: none of it stands in anyone's way (nothing's blocked, and the navigation
// mesh wades the ford as the water's there), so the crossing they show is walked as it was. One
// mesh a chunk, with the atlas, as the stone steps are (steps.js).

import * as THREE from "three";
import { hashOf } from "../../../core/noise.js";
import { LAYERS, atlasMaterial } from "../engine/atlas.js";
import { MATERIALS } from "../engine/painters.js";
import { LOOKS, Mesher } from "./wilds.js";

/**
 * The stepping stones (metres): how far apart along the way over, how big round (the least and
 * the most), how far their tops stand over the water (or the ground, on a bank), how many sides
 * each has, how far past the water onto each bank the row goes, how far each wanders off the line,
 * and how deep each is sunk.
 */
export const FORD_STONES = Object.freeze({ apart: 0.85, radius: [0.22, 0.32], clear: 0.09, sides: 7, beyond: 0.5, wander: 0.15, sink: 0.25 });

/** How much bigger the stones are in the rocky lands: boulders to step on. */
export const ROCKY = Object.freeze({ mountain: 1.5, badlands: 1.4, volcanic: 1.4, snow: 1.3 });

/**
 * The fallen trunk across a ford in wooded lands (metres): how thick round, how far past the water
 * its ends lie up each bank, how far downstream of the stones it lies, how many sides it has, and
 * how far into the banks its ends are settled.
 */
export const FORD_TRUNK = Object.freeze({ radius: 0.3, beyond: 1.4, downstream: 1.8, sides: 8, settled: 0.4 });

/** The lands a ford has a fallen trunk across it in. */
export const WOODED = Object.freeze(["woods", "darkwood", "elfwood", "jungle"]);

// Each layer's index, and how many metres one copy of its texture covers
const LAYER = Object.fromEntries(LAYERS.map((name, k) => [name, k]));
const METRES = Object.fromEntries(Object.entries(MATERIALS).map(([name, { world }]) => [name, world / 5]));

/**
 * What's drawn at the fords (waters.js fordOf's) whose middles are in a box ([x0, y0, x1, y1],
 * metres): { stones: [{ x, y, radius, top, bottom, rock, seed }], trunks: [{ a, b ([x, y, height]:
 * its ends' middles), radius, seed }] }. `groundAt(x, y)` is the ground's height (the river's bed
 * under it), `landAt(x, y)` the land's kind (BIOMES' ids).
 */
export function fordParts(fords, { groundAt, landAt }, [x0, y0, x1, y1]) {
    const stones = [];
    const trunks = [];

    for (const { at: [fx, fy], banks: [[ax, ay], [bx, by]], way: [wx, wy], surface } of fords) {
        if (fx < x0 || fy < y0 || fx >= x1 || fy >= y1) {
            continue;
        }

        const land = landAt(Math.floor(fx), Math.floor(fy));
        const rock = (LOOKS[land] ?? LOOKS.meadow).stone;
        const scale = ROCKY[land] ?? 1;
        const long = Math.hypot(bx - ax, by - ay) || 1;
        const [ux, uy] = [(bx - ax) / long, (by - ay) / long];
        // (The row across: from a little up one bank to a little up the other, the stones as far
        // apart as they're big)
        const reach = long + 2 * FORD_STONES.beyond;
        const count = Math.max(2, Math.round(reach / (FORD_STONES.apart * scale)) + 1);

        for (let k = 0; k < count; k++) {
            const seed = hashOf(Math.round(fx * 8) + k * 131, Math.round(fy * 8), 3301);
            const along = -FORD_STONES.beyond + (reach * k) / (count - 1) + (hashOf(k, Math.round(fx * 8), 3307) - 0.5) * 0.2;
            const off = (seed - 0.5) * 2 * FORD_STONES.wander;
            const [x, y] = [ax + ux * along - uy * off, ay + uy * along + ux * off];
            const ground = groundAt(x, y);
            const radius = (FORD_STONES.radius[0] + (FORD_STONES.radius[1] - FORD_STONES.radius[0]) * hashOf(k, Math.round(fy * 8), 3313)) * scale;

            stones.push({ x, y, radius, top: Math.max(surface + FORD_STONES.clear * scale, ground + 0.06), bottom: ground - FORD_STONES.sink, rock, seed });
        }

        // (A fallen trunk, in wooded lands: lying across a little downstream, its ends up the banks)
        if (WOODED.includes(land)) {
            const [dx, dy] = [wx * FORD_TRUNK.downstream, wy * FORD_TRUNK.downstream];
            const [pa, pb] = [
                [ax - ux * FORD_TRUNK.beyond + dx, ay - uy * FORD_TRUNK.beyond + dy],
                [bx + ux * FORD_TRUNK.beyond + dx, by + uy * FORD_TRUNK.beyond + dy],
            ];
            const lift = FORD_TRUNK.radius - FORD_TRUNK.settled * FORD_TRUNK.radius;

            trunks.push({ a: [...pa, groundAt(...pa) + lift], b: [...pb, groundAt(...pb) + lift], radius: FORD_TRUNK.radius, seed: hashOf(Math.round(fx * 8), Math.round(fy * 8), 3319) });
        }
    }

    return { stones, trunks };
}

/**
 * What's drawn at a chunk's fords (fordParts'): a mesh at the chunk's corner (`[x0, y0]`, metres),
 * with the atlas, casting shadows; or null if there's nothing.
 */
export function fordsMesh({ stones, trunks }, [x0, y0]) {
    if (!stones.length && !trunks.length) {
        return null;
    }

    const mesher = new Mesher(stones.length * FORD_STONES.sides * 9 + trunks.length * FORD_TRUNK.sides * 12);

    for (const stone of stones) {
        stoneOf(mesher, stone, [x0, y0]);
    }

    for (const trunk of trunks) {
        trunkOf(mesher, trunk, [x0, y0]);
    }

    const mesh = new THREE.Mesh(mesher.geometry(), atlasMaterial());

    mesh.name = "fords";
    mesh.position.set(x0, 0, y0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
}

// A stepping stone: a low, rough prism, its top a little narrower than its foot and worn paler,
// its corners each their own way out
function stoneOf(mesher, { x, y, radius, top, bottom, rock, seed }, [x0, y0]) {
    const [layer, uvScale] = [LAYER[rock] ?? LAYER.rock, METRES[rock] ?? METRES.rock];
    const sides = FORD_STONES.sides;
    const turn = seed * Math.PI * 2;
    const tone = 0.9 + seed * 0.2;
    const [lit, worn, dark] = [[tone, tone, tone], [tone * 1.1, tone * 1.1, tone * 1.08], [tone * 0.55, tone * 0.55, tone * 0.55]];
    const ring = (h, share) =>
        Array.from({ length: sides }, (_, k) => {
            const angle = turn + (k / sides) * Math.PI * 2;
            const r = radius * share * (0.82 + 0.3 * hashOf(Math.floor(seed * 1e6), k, 3323));

            return [x - x0 + Math.cos(angle) * r, h, y - y0 + Math.sin(angle) * r];
        });
    const [upper, lower] = [ring(top, 0.85), ring(bottom, 1.1)];
    const middle = [x - x0, top + radius * 0.06, y - y0];

    for (let k = 0; k < sides; k++) {
        const next = (k + 1) % sides;
        const outward = [(upper[k][0] + upper[next][0]) / 2 - middle[0], 0, (upper[k][2] + upper[next][2]) / 2 - middle[2]];

        // (Its top, rising a little to its middle; its sides, darker towards their feet)
        face(mesher, [middle, upper[k], upper[next]], [worn, worn, worn], [0, 1, 0], { layer, uvScale });
        face(mesher, [lower[k], lower[next], upper[next], upper[k]], [dark, dark, lit, lit], outward, { layer, uvScale });
    }
}

// A face of three or four corners, wound to face `out` (the Mesher's faces are seen from the side
// they're wound counter-clockwise from), each corner its colour
function face(mesher, corners, colours, out, options) {
    const [p, q, r] = corners;
    const [e, f] = [[q[0] - p[0], q[1] - p[1], q[2] - p[2]], [r[0] - p[0], r[1] - p[1], r[2] - p[2]]];
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
    const order = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? [...corners.keys()].reverse() : [...corners.keys()];
    const [points, own] = [order.map((k) => corners[k]), order.map((k) => colours[k])];

    if (points.length === 3) {
        mesher.tri(...points, { ...options, colours: own });
    } else {
        mesher.quad(...points, { ...options, colours: own });
    }
}

// The fallen trunk: a log of bark from one end to the other, its sawn-off, weathered ends showing
// the wood
function trunkOf(mesher, { a, b, radius, seed }, [x0, y0]) {
    const sides = FORD_TRUNK.sides;
    const [ax, ah, ay] = [a[0] - x0, a[2], a[1] - y0];
    const [bx, bh, by] = [b[0] - x0, b[2], b[1] - y0];
    const along = [bx - ax, bh - ah, by - ay];
    const length = Math.hypot(...along) || 1;
    const axis = along.map((v) => v / length);
    // (Two ways across it, the first level)
    const level = Math.hypot(axis[0], axis[2]) || 1;
    const u = [-axis[2] / level, 0, axis[0] / level];
    const v = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
    const ringAt = ([cx, ch, cy], r) =>
        Array.from({ length: sides }, (_, k) => {
            const angle = (k / sides) * Math.PI * 2 + seed;
            const [c, s] = [Math.cos(angle) * r, Math.sin(angle) * r];

            return [cx + u[0] * c + v[0] * s, ch + u[1] * c + v[1] * s, cy + u[2] * c + v[2] * s];
        });
    const [ra, rb] = [ringAt([ax, ah, ay], radius), ringAt([bx, bh, by], radius * 0.85)];
    const bark = { layer: LAYER.bark, uvScale: METRES.bark };
    const wood = { layer: LAYER.deadwood, uvScale: METRES.deadwood };

    // (Darker underneath, as it lies)
    const shade = (point) => {
        const t = 0.6 + 0.4 * Math.max(0, Math.min(1, (point[1] - Math.min(ah, bh) + radius) / (2 * radius)));

        return [t, t, t];
    };

    for (let k = 0; k < sides; k++) {
        const next = (k + 1) % sides;
        const middle = [(ra[k][0] + ra[next][0]) / 2 - ax, (ra[k][1] + ra[next][1]) / 2 - ah, (ra[k][2] + ra[next][2]) / 2 - ay];

        face(mesher, [ra[k], rb[k], rb[next], ra[next]], [ra[k], rb[k], rb[next], ra[next]].map(shade), middle, bark);
    }

    // (Its ends, each a fan of the wood)
    const ends = [0.9, 0.85, 0.78];

    for (const [ring, centre, out] of [[ra, [ax, ah, ay], -1], [rb, [bx, bh, by], 1]]) {
        for (let k = 0; k < sides; k++) {
            face(mesher, [centre, ring[k], ring[(k + 1) % sides]], [ends, ends, ends], axis.map((value) => value * out), wood);
        }
    }
}
