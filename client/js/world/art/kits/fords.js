// The fords' ways over, drawn (core/terrain/waters.js fordOf; core/overworld.js onFordWay, which
// treads the banks bare either side): a row of stepping stones straight across the water at each
// ford's middle, their tops just clear of it, of the land's own rock (bigger, in rocky lands); and
// in wooded lands a fallen tree's trunk lying across the river near them, each its own: askew of
// them, thick at its root and tapering to its broken top, bent, knotted, a bare branch or two
// sticking up from it, its ends up on the banks. Only drawn: none of it stands in anyone's way
// (nothing's blocked, and the navigation
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
 * The fallen trunk across a ford in wooded lands, each its own (metres; the least and the most of
 * each, where there are two): how thick round its root end is, how much of that its top end is,
 * how far past the water each end lies up its bank, how far askew of straight across it lies
 * (radians: about 25°), how far its middle sags, how far its line wanders off straight, how far
 * any of it keeps from the stones' row (and how much further off it may lie), how often it lies
 * upstream of them rather than down, how many rings and sides it's made of, how many knots, bare
 * branches and roots it has (roots only where it was torn up rather than snapped: `torn` of the
 * time), how often it's lain long enough to have lost its bark, and how far into the ground it's
 * settled (a share of its thickness).
 */
export const FORD_TRUNK = Object.freeze({
    radius: [0.22, 0.38],
    taper: [0.4, 0.62],
    beyond: [0.6, 2.4],
    skew: 0.45,
    sag: [0, 0.18],
    bend: 0.3,
    clear: 1.5,
    spread: 2.2,
    upstream: 0.25,
    rings: 11,
    sides: 9,
    knots: [2, 5],
    branches: [1, 3],
    roots: [3, 5],
    torn: 0.55,
    barkless: 0.3,
    settled: 0.35,
});

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

        // (A fallen trunk, in wooded lands: each its own, lying across near the stones)
        if (WOODED.includes(land)) {
            trunks.push(fallenTrunk({ at: [fx, fy], banks: [[ax, ay], [bx, by]], way: [wx, wy] }, groundAt));
        }
    }

    return { stones, trunks };
}

/**
 * A fallen tree's trunk across a ford (fordOf's: its middle, its banks, the way it runs), each its
 * own from where the ford is: { limbs: [{ kind ("trunk", "branch", "knot" or "root"), points
 * ([x, y, height] along its middle, from its foot), radii (at each), ends ([its foot's, its tip's]:
 * "torn", "snapped", "cut" (a stub's, flush) or null: none, where it grows out of the trunk) }],
 * barkless, tone, side (1 downstream of the stones, -1 up), skew (radians) }.
 */
export function fallenTrunk({ at: [fx, fy], banks: [[ax, ay], [bx, by]], way: [wx, wy] }, groundAt) {
    const roll = (k) => hashOf(Math.round(fx * 8), Math.round(fy * 8), 4001 + k * 7);
    const between = ([least, most], t) => least + (most - least) * t;
    const long = Math.hypot(bx - ax, by - ay) || 1;
    const [ux, uy] = [(bx - ax) / long, (by - ay) / long];
    const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
    // (Which way it lies: askew of straight across, either way; up or downstream of the stones)
    const side = roll(0) < FORD_TRUNK.upstream ? -1 : 1;
    const skew = (roll(1) * 2 - 1) * FORD_TRUNK.skew;
    const [dx, dy] = [ux * Math.cos(skew) + wx * Math.sin(skew), uy * Math.cos(skew) + wy * Math.sin(skew)];
    // (How far it reaches either way from its middle: over the water, a way along it, and on up
    // each bank its own way)
    const shift = (roll(2) - 0.5) * 1.2;
    const reach = [(long / 2 + shift) / Math.cos(skew) + between(FORD_TRUNK.beyond, roll(3)), (long / 2 - shift) / Math.cos(skew) + between(FORD_TRUNK.beyond, roll(4))];
    const bend = (roll(10) * 2 - 1) * FORD_TRUNK.bend;
    // (Clear of the stones all along it, however askew it lies and however it bends)
    const off = FORD_TRUNK.clear + Math.max(...reach) * Math.abs(Math.sin(skew)) + Math.abs(bend) + 0.05 + roll(5) * FORD_TRUNK.spread;
    const [cx, cy] = [mx + ux * shift + wx * off * side, my + uy * shift + wy * off * side];
    // (How far a point is from the stones' row, on the trunk's side of it)
    const awayOf = ([x, y]) => ((x - mx) * wx + (y - my) * wy) * side;
    // (Its root at one end, thick and flared; its top at the other, thinner)
    const rootFirst = roll(6) < 0.5;
    const root = between(FORD_TRUNK.radius, roll(7));
    const top = root * between(FORD_TRUNK.taper, roll(8));
    const sag = between(FORD_TRUNK.sag, roll(9));
    const n = FORD_TRUNK.rings;
    const lift = (r) => r * (1 - 2 * FORD_TRUNK.settled);
    const points = [];
    const radii = [];

    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const along = -reach[0] + (reach[0] + reach[1]) * t;
        // (Bent a little one way, and wandering a little ring by ring)
        const aside = bend * Math.sin(Math.PI * t) + (hashOf(i, Math.round(fx * 8), 4093) - 0.5) * 0.08;
        const [x, y] = [cx + dx * along - dy * aside, cy + dy * along + dx * aside];
        const fromRoot = rootFirst ? t : 1 - t;
        const r = (root + (top - root) * fromRoot) * (1 + 0.28 * Math.max(0, 1 - fromRoot / 0.14));

        points.push([x, y, 0]);
        radii.push(r);
    }

    // (Lying on the banks at its ends and sagging between, never down through the ground or the
    // river's bed: up on whatever's under it, where something is)
    const [first, last] = [points[0], points[n - 1]];
    const [ha, hb] = [groundAt(first[0], first[1]) + lift(radii[0]), groundAt(last[0], last[1]) + lift(radii[n - 1])];

    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const [x, y] = points[i];

        points[i][2] = Math.max(ha + (hb - ha) * t - sag * 4 * t * (1 - t), groundAt(x, y) + lift(radii[i]));
    }

    const limbs = [{ kind: "trunk", points, radii, ends: rootFirst ? [roll(11) < FORD_TRUNK.torn ? "torn" : "snapped", "snapped"] : ["snapped", roll(11) < FORD_TRUNK.torn ? "torn" : "snapped"] }];
    // (A point on its surface, and the way out from its middle there: `i` a ring, `angle` round it
    // from straight up)
    const axisAt = (i) => {
        const [p, q] = [points[Math.max(0, i - 1)], points[Math.min(n - 1, i + 1)]];
        const d = [q[0] - p[0], q[2] - p[2], q[1] - p[1]];
        const length = Math.hypot(...d) || 1;

        return d.map((value) => value / length);
    };
    const outAt = (i, angle) => {
        const axis = axisAt(i);
        const level = Math.hypot(axis[0], axis[2]) || 1;
        const side = [-axis[2] / level, 0, axis[0] / level];
        const up = [axis[1] * side[2] - axis[2] * side[1], axis[2] * side[0] - axis[0] * side[2], axis[0] * side[1] - axis[1] * side[0]];
        const lifted = up[1] < 0 ? up.map((value) => -value) : up;

        return lifted.map((value, k) => value * Math.cos(angle) + side[k] * Math.sin(angle));
    };
    const towardTop = (i) => axisAt(i).map((value) => value * (rootFirst ? 1 : -1));
    const offset = ([x, y, h], [ox, oh, oy], length) => [x + ox * length, y + oy * length, h + oh * length];
    const ringOf = (fromRoot) => Math.round((rootFirst ? fromRoot : 1 - fromRoot) * (n - 1));

    // Bare branches, towards its top, sticking up and out from it; now and then forked
    const branches = Math.round(between(FORD_TRUNK.branches, roll(12)));

    for (let b = 0; b < branches; b++) {
        const r = (k) => hashOf(b, Math.round(fy * 8), 4211 + k * 13 + Math.round(fx * 8));
        const i = ringOf(0.35 + 0.55 * r(0));
        const lean = 0.35 + 0.6 * r(2);
        const length = 0.45 + 1.1 * r(3);
        // (Up and out from it, to one side or the other: away from the stones, if it'd reach over them)
        const grown = (angle) => {
            const out = outAt(i, angle);
            const way = out.map((value, k) => value * Math.cos(lean) + towardTop(i)[k] * Math.sin(lean));
            const base = offset(points[i], out, radii[i] * 0.8);
            const middle = offset(base, way, length * 0.55);
            // (Drooping a little, bending as it goes)
            const tip = offset(offset(middle, way, length * 0.45), [Math.cos(r(4) * 6.3) * 0.25, -0.2, Math.sin(r(4) * 6.3) * 0.25], length * 0.3);

            return { way, base, middle, tip };
        };
        const tilt = (r(1) * 2 - 1) * 1.3;
        const tried = grown(tilt);
        const { way, base, middle, tip } = awayOf(tried.tip) < FORD_TRUNK.clear / 2 || awayOf(tried.middle) < FORD_TRUNK.clear / 2 ? grown(-tilt) : tried;
        const thick = radii[i] * (0.22 + 0.15 * r(5));

        limbs.push({ kind: "branch", points: [base, middle, tip], radii: [thick, thick * 0.55, 0.018], ends: [null, "snapped"] });

        if (r(6) < 0.45) {
            const fork = outAt(i, (r(7) * 2 - 1) * 1.3).map((value, k) => value * 0.5 + way[k] * 0.7);

            limbs.push({ kind: "branch", points: [middle, offset(middle, fork, length * 0.4)], radii: [thick * 0.45, 0.014], ends: [null, "snapped"] });
        }
    }

    // Knots: the stubs of branches long gone, here and there round it
    const knots = Math.round(between(FORD_TRUNK.knots, roll(13)));

    for (let k = 0; k < knots; k++) {
        const r = (j) => hashOf(k, Math.round(fx * 8), 4327 + j * 11 + Math.round(fy * 8));
        const i = Math.max(1, Math.min(n - 2, ringOf(0.1 + 0.8 * r(0))));
        const out = outAt(i, (r(1) * 2 - 1) * 2.4);
        const base = offset(points[i], out, radii[i] * 0.7);
        const thick = radii[i] * (0.14 + 0.12 * r(2));

        limbs.push({ kind: "knot", points: [base, offset(base, out, radii[i] * 0.3 + 0.03 + 0.06 * r(3))], radii: [thick, thick * 0.7], ends: [null, "cut"] });
    }

    // Torn up by its roots: a few broken roots splayed out from its root end, back and down
    if (limbs[0].ends.includes("torn")) {
        const end = rootFirst ? 0 : n - 1;
        const roots = Math.round(between(FORD_TRUNK.roots, roll(14)));

        for (let k = 0; k < roots; k++) {
            const r = (j) => hashOf(k, Math.round(fy * 8), 4441 + j * 17 + Math.round(fx * 8));
            const out = outAt(end, (k / roots) * Math.PI * 2 + r(0));
            const way = out.map((value, j) => value * 0.8 - towardTop(end)[j] * 0.5 + (j === 1 ? -0.25 : 0));
            const base = offset(points[end], out, radii[end] * 0.6);

            limbs.push({ kind: "root", points: [base, offset(base, way, 0.3 + 0.45 * r(1))], radii: [radii[end] * (0.25 + 0.12 * r(2)), 0.03], ends: [null, "snapped"] });
        }
    }

    return { limbs, barkless: roll(15) < FORD_TRUNK.barkless, tone: 0.82 + 0.26 * roll(16), side, skew };
}

/**
 * What's drawn at a chunk's fords (fordParts'): a mesh at the chunk's corner (`[x0, y0]`, metres),
 * with the atlas, casting shadows; or null if there's nothing.
 */
export function fordsMesh({ stones, trunks }, [x0, y0]) {
    if (!stones.length && !trunks.length) {
        return null;
    }

    const mesher = new Mesher(stones.length * FORD_STONES.sides * 9 + trunks.length * FORD_TRUNK.sides * FORD_TRUNK.rings * 12);

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

// A fallen trunk (fallenTrunk's): each of its limbs a tube of bark (or, lain long enough, of grey
// weathered wood), a little out of round, darker underneath; its broken and torn ends ragged, the
// wood showing
function trunkOf(mesher, { limbs, barkless, tone }, [x0, y0]) {
    const bark = barkless ? { layer: LAYER.deadwood, uvScale: METRES.deadwood } : { layer: LAYER.bark, uvScale: METRES.bark };
    const wood = { layer: LAYER.deadwood, uvScale: METRES.deadwood };

    limbs.forEach((limb, k) => tube(mesher, limb, { bark, wood, tone, seed: k, sides: limb.kind === "trunk" ? FORD_TRUNK.sides : 5 }, [x0, y0]));
}

// A limb's tube: a ring round each of its points (its world [x, y, height] taken to the chunk's
// [x, height, z]), joined side to side; its ends ragged where it's broken or torn, flush where cut
function tube(mesher, { kind, points, radii, ends }, { bark, wood, tone, seed, sides }, [x0, y0]) {
    const at = points.map(([x, y, h]) => [x - x0, h, y - y0]);
    const n = at.length;
    const axisAt = (i) => {
        const [p, q] = [at[Math.max(0, i - 1)], at[Math.min(n - 1, i + 1)]];
        const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        const length = Math.hypot(...d) || 1;

        return d.map((value) => value / length);
    };
    // (Each ring's two ways across, the first level where it can be: the same way round from
    // ring to ring, so it doesn't twist)
    const frames = at.map((point, i) => {
        const axis = axisAt(i);
        const helper = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const u = cross(axis, helper);
        const length = Math.hypot(...u) || 1;
        const across = u.map((value) => value / length);

        return { axis, u: across, v: cross(across, axis) };
    });
    const rings = at.map((point, i) => {
        const { u, v } = frames[i];

        return Array.from({ length: sides }, (_, k) => {
            const angle = (k / sides) * Math.PI * 2 + seed;
            // (Out of round: each corner its own way out, the trunk a little flattened)
            const r = radii[i] * (0.88 + 0.24 * hashOf(i * 31 + k, seed, 4513)) * (kind === "trunk" ? 1 - 0.08 * Math.abs(Math.sin(angle)) : 1);
            const [c, s] = [Math.cos(angle) * r, Math.sin(angle) * r];

            return point.map((value, j) => value + u[j] * c + v[j] * s);
        });
    });
    // (Darker underneath, as it lies; a little lighter on top)
    const shade = (i, point) => {
        const t = tone * (0.55 + 0.5 * Math.max(0, Math.min(1, 0.5 + (point[1] - at[i][1]) / (2 * (radii[i] || 1)))));

        return [t, t * 0.98, t * 0.95];
    };

    for (let i = 0; i + 1 < n; i++) {
        for (let k = 0; k < sides; k++) {
            const next = (k + 1) % sides;
            const corners = [rings[i][k], rings[i + 1][k], rings[i + 1][next], rings[i][next]];
            const middle = [0, 1, 2].map((j) => (at[i][j] + at[i + 1][j]) / 2);
            const out = [0, 1, 2].map((j) => (corners[0][j] + corners[1][j] + corners[2][j] + corners[3][j]) / 4 - middle[j]);

            face(mesher, corners, [shade(i, corners[0]), shade(i + 1, corners[1]), shade(i + 1, corners[2]), shade(i, corners[3])], out, bark);
        }
    }

    // Its ends: where it grows out of the trunk, nothing; cut, flush; broken, a ragged point of
    // splinters, longer where it was torn
    const pale = [0.92 * tone, 0.86 * tone, 0.78 * tone];

    for (const [end, i, sign] of [[ends[0], 0, -1], [ends[1], n - 1, 1]]) {
        if (!end) {
            continue;
        }

        const axis = frames[i].axis.map((value) => value * sign);
        // (Long splinters and short in turn, all their own lengths: a jagged break, not a saw's)
        const ragged = end === "cut" ? 0 : end === "torn" ? 2 : 1.5;
        const splinters = rings[i].map((point, k) => point.map((value, j) => value + axis[j] * radii[i] * ragged * (k % 2 ? 0.25 + 0.75 * hashOf(k, seed, 4597 + i) : 0.1 + 0.3 * hashOf(k, seed, 4603 + i))));
        const centre = at[i].map((value, j) => value + axis[j] * radii[i] * ragged * 0.2);

        for (let k = 0; k < sides; k++) {
            const next = (k + 1) % sides;

            // (The splinters' sides, bark outside; then the broken wood across)
            if (ragged > 0) {
                face(mesher, [rings[i][k], splinters[k], splinters[next], rings[i][next]], [shade(i, rings[i][k]), pale, pale, shade(i, rings[i][next])], [0, 1, 2].map((j) => (rings[i][k][j] + rings[i][next][j]) / 2 - at[i][j]), bark);
            }

            face(mesher, [centre, splinters[k], splinters[next]], [pale, pale, pale], axis, wood);
        }
    }
}

// The cross product of two vectors
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
