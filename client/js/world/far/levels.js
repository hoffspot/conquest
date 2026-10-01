// The far land's levels (world/far/far.js): squares of ground round the player, each twice as
// coarse and twice as wide as the one inside it, out to the horizon (the geometry clipmap's
// nesting, after Losasso and Hoppe; its edges eased into the next level's as CDLOD does). The
// heights are the land's as it's seen from afar (core/terrain/height.js distantHeights), worked
// out off the page's thread (far-worker.js); this part's the same in Node and the browser, without
// Three.js, so it's tested as it is.

import { distantHeights } from "../../core/terrain/height.js";

/**
 * Each level's cells a side; the finest level's spacing (metres between its corners: each level
 * out, twice that); how near the player the far land isn't drawn (metres: the chunks' ground is,
 * world/chunks3d.js, out past where the near camera stops at NEAR_FAR); and how far the near
 * camera sees (metres), the far camera from (metres).
 */
export const FAR = Object.freeze({ cells: 64, finest: 8, hole: 112, nearFar: 160, from: 40 });

/** How many levels the far land has at each quality level (view.js QUALITY far). */
export const FAR_LEVELS = Object.freeze({ low: 3, medium: 4, high: 5 });

/** A level's spacing (metres). */
export const spacingOf = (level) => FAR.finest * 2 ** level;

/** How far a level reaches from its middle each way (metres). */
export const reachOf = (level) => (FAR.cells / 2) * spacingOf(level);

/** How far the far land reaches with `levels` levels (metres): its outermost level's reach. */
export const farReach = (levels) => reachOf(levels - 1);

/**
 * Where a level's middle is with the player at (x, z) (metres): on the lattice twice its spacing,
 * so that its corners on every other line are the next level out's (and its edges lie on that
 * level's lines).
 */
export function middleOf(level, x, z) {
    const lattice = 2 * spacingOf(level);

    return [Math.round(x / lattice) * lattice, Math.round(z / lattice) * lattice];
}

/**
 * A level's ground round its middle ([x, z] metres): its heights (metres) and water (1 where it's
 * water) at its (cells + 1)² corners, row by row (north to south, each west to east), and the
 * ground's up at each ([x, y, z] in turn). Along its edges, every other corner is put halfway
 * between its neighbours, as the next level out has the ground there, so the two meet without a
 * crack.
 */
export function sampleLevel(plan, level, [mx, mz]) {
    const step = spacingOf(level);
    const count = FAR.cells + 1;
    const reach = reachOf(level);
    const { heights, water } = distantHeights(plan, mx - reach, mz - reach, count, step);
    const at = (i, j) => j * count + i;

    for (let k = 1; k < count - 1; k += 2) {
        for (const [i, j, di, dj] of [
            [k, 0, 1, 0],
            [k, count - 1, 1, 0],
            [0, k, 0, 1],
            [count - 1, k, 0, 1],
        ]) {
            heights[at(i, j)] = (heights[at(i - di, j - dj)] + heights[at(i + di, j + dj)]) / 2;
        }
    }

    // The ground's up, from its slope across each corner (one-sided at the edges)
    const normals = new Float32Array(count * count * 3);

    for (let j = 0; j < count; j++) {
        for (let i = 0; i < count; i++) {
            const [i0, i1, j0, j1] = [Math.max(0, i - 1), Math.min(count - 1, i + 1), Math.max(0, j - 1), Math.min(count - 1, j + 1)];
            const dx = (heights[at(i1, j)] - heights[at(i0, j)]) / ((i1 - i0) * step);
            const dz = (heights[at(i, j1)] - heights[at(i, j0)]) / ((j1 - j0) * step);
            const length = Math.sqrt(dx * dx + 1 + dz * dz);

            normals.set([-dx / length, 1 / length, -dz / length], at(i, j) * 3);
        }
    }

    return { level, middle: [mx, mz], heights, water, normals };
}
