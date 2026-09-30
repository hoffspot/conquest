// The world's water, from the plan: its rivers (a line from each river cell to the cell it runs
// into, wandering, wider the more rain runs in them), its lakes and the sea (blended between the
// cells' middles, a little ragged), and the height each one's surface stands at (metres). The
// overworld reads which squares are wet from here (overworld.js); the terrain is carved down under
// the water to meet it (height.js). The same for every plan, whatever's asked first.

import { metresOf } from "./curve.js";
import { noise } from "../random.js";
import { CELL, CELLS, WATER } from "../worldplan/terrain.js";
import { hypot } from "../exact.js";

/** Rivers: their half-widths (metres: the least and most, wider the more rain runs in them). */
export const RIVER_HALF = Object.freeze([1.5, 5]);

/** How far rivers wander from a straight line between cells (metres). */
export const WANDER = 7;

// The chunks rivers are listed by (metres a side: the world plan's CHUNK, which this can't import:
// plan.js is built on this)
const CHUNK = 64;
const CHUNKS = (CELLS * CELL) / CHUNK;

// A plan's waters, made once for it
const MADE = new WeakMap();

/** The waters of a world plan (made once for it). */
export function watersOf(plan) {
    if (!MADE.has(plan)) {
        MADE.set(plan, new Waters(plan));
    }

    return MADE.get(plan);
}

export class Waters {
    /** @param {object} plan - The world plan (worldplan/plan.js planWorld). */
    constructor(plan) {
        this.plan = plan;
        this.near = new Map();
        this.surfaces = this.#surfaces();
    }

    // The height of each river cell's surface (metres): the level the plan fills it to, never
    // higher than any cell upstream of it, so rivers only ever run down (a lake's, its level; the
    // sea's, 0)
    #surfaces() {
        const { plan } = this;
        const surface = new Float32Array(CELLS * CELLS);
        const rivers = [];

        for (let k = 0; k < CELLS * CELLS; k++) {
            surface[k] = plan.water[k] === WATER.sea ? 0 : metresOf(plan.level?.[k] ?? plan.height[k]);

            if (plan.water[k] === WATER.river) {
                rivers.push(k);
            }
        }

        // From the highest down (the same order whatever: level, then index), each lowering the
        // cell it runs into to its own level at most
        rivers.sort((a, b) => surface[b] - surface[a] || a - b);

        for (const k of rivers) {
            const into = this.downstream(k % CELLS, Math.floor(k / CELLS));

            if (into) {
                const n = into[1] * CELLS + into[0];

                surface[n] = Math.min(surface[n], surface[k]);
            }
        }

        return surface;
    }

    /**
     * The cell a river cell runs into: a lake or the sea beside it, or the river cell beside it
     * that more water runs through ([i, j]), or null.
     */
    downstream(i, j) {
        const { plan } = this;
        const here = plan.flow[j * CELLS + i];
        let best = null;
        let most = here;

        for (const [di, dj] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
            const [ni, nj] = [i + di, j + dj];

            if (ni < 0 || nj < 0 || ni >= CELLS || nj >= CELLS) {
                continue;
            }

            const w = plan.water[nj * CELLS + ni];

            if (w === WATER.sea || w === WATER.lake) {
                return [ni, nj];
            }

            if (w === WATER.river && plan.flow[nj * CELLS + ni] > most) {
                most = plan.flow[nj * CELLS + ni];
                best = [ni, nj];
            }
        }

        return best;
    }

    /**
     * The river lines near a chunk (cx, cy: chunks of CHUNK metres): [ax, ay, bx, by, half-width,
     * the surface's height at a, at b] (metres).
     */
    riversNear(cx, cy) {
        const key = cy * CHUNKS + cx;

        if (!this.near.has(key)) {
            const { plan, surfaces } = this;
            const segments = [];
            const reach = Math.ceil((WANDER + RIVER_HALF[1]) / CELL) + 1;
            const [c0, c1] = [Math.floor((cx * CHUNK) / CELL) - reach, Math.floor(((cx + 1) * CHUNK) / CELL) + reach];
            const [r0, r1] = [Math.floor((cy * CHUNK) / CELL) - reach, Math.floor(((cy + 1) * CHUNK) / CELL) + reach];

            for (let j = Math.max(0, r0); j <= Math.min(CELLS - 1, r1); j++) {
                for (let i = Math.max(0, c0); i <= Math.min(CELLS - 1, c1); i++) {
                    const k = j * CELLS + i;

                    if (plan.water[k] !== WATER.river) {
                        continue;
                    }

                    const into = this.downstream(i, j);

                    if (into) {
                        const half = Math.min(RIVER_HALF[1], Math.max(RIVER_HALF[0], 0.9 + Math.sqrt(plan.flow[k]) * 0.09));
                        const n = into[1] * CELLS + into[0];

                        segments.push([(i + 0.5) * CELL, (j + 0.5) * CELL, (into[0] + 0.5) * CELL, (into[1] + 0.5) * CELL, half, surfaces[k], Math.min(surfaces[k], surfaces[n])]);
                    }
                }
            }

            this.near.set(key, segments);
        }

        return this.near.get(key);
    }

    // Where a point is taken to be, for rivers: moved a wandering way, so they don't run straight
    #wandered(px, py) {
        const seed = this.plan.seed;

        return [px + (noise(px, py, seed + 51, 40, 2) - 0.5) * 2 * WANDER, py + (noise(px, py, seed + 61, 40, 2) - 0.5) * 2 * WANDER];
    }

    /** Is a point (metres) in a river? */
    riverAt(px, py) {
        const segments = this.riversNear(Math.floor(px / CHUNK), Math.floor(py / CHUNK));

        if (!segments.length) {
            return false;
        }

        const [wx, wy] = this.#wandered(px, py);

        return segments.some((segment) => fromSegment(wx, wy, segment) <= segment[4]);
    }

    /**
     * The river nearest a point (metres), as the ground is carved for it: { gap (how far outside
     * its bank the point is, metres: less than 0 in it), half (its half-width), surface (its
     * surface's height there, metres) }, or null if there's none within `within` metres of its
     * bank.
     */
    river(px, py, within) {
        const segments = this.riversNear(Math.floor(px / CHUNK), Math.floor(py / CHUNK));

        if (!segments.length) {
            return null;
        }

        const [wx, wy] = this.#wandered(px, py);
        let best = null;

        for (const segment of segments) {
            const [ax, ay, bx, by, half, sa, sb] = segment;
            const [dx, dy] = [bx - ax, by - ay];
            const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / (dx * dx + dy * dy || 1)));
            const gap = hypot(wx - (ax + dx * t), wy - (ay + dy * t)) - half;

            if (gap <= within && (!best || gap < best.gap)) {
                best = { gap, half, surface: sa + (sb - sa) * t };
            }
        }

        return best;
    }

    /**
     * How wet a point (metres) is with still water (a lake or the sea): the cells' wetness
     * blended across their middles (`blend`, 0 to 1), a little ragged (`wet`: still water where
     * it's more than a half), and the height its surface stands at (`level`, metres: the sea's,
     * 0; a lake's, its own).
     */
    still(px, py) {
        const { plan } = this;
        const [fx, fy] = [px / CELL - 0.5, py / CELL - 0.5];
        const [i, j] = [Math.floor(fx), Math.floor(fy)];
        const [tx, ty] = [fx - i, fy - j];
        let [level, most] = [0, -1];
        const wet = (ci, cj, weight) => {
            if (ci < 0 || cj < 0 || ci >= CELLS || cj >= CELLS) {
                if (weight > most) {
                    [level, most] = [0, weight];
                }

                return 1;
            }

            const k = cj * CELLS + ci;
            const w = plan.water[k];

            if (w !== WATER.sea && w !== WATER.lake) {
                return 0;
            }

            if (weight > most) {
                [level, most] = [this.surfaces[k], weight];
            }

            return 1;
        };
        const [a, b] = [wet(i, j, (1 - tx) * (1 - ty)), wet(i + 1, j, tx * (1 - ty))];
        const [c, d] = [wet(i, j + 1, (1 - tx) * ty), wet(i + 1, j + 1, tx * ty)];
        const top = a + (b - a) * tx;
        const bottom = c + (d - c) * tx;
        const blend = top + (bottom - top) * ty;

        return { blend, wet: blend > 0 ? blend + (noise(px, py, plan.seed + 41, 9, 2) - 0.5) * 0.3 : 0, level };
    }

    /** Is a point (metres) in a lake or the sea? */
    stillAt(px, py) {
        const { blend, wet } = this.still(px, py);

        return blend > 0 && wet > 0.5;
    }
}

// How far a point is from a line segment ([ax, ay, bx, by, ...])
function fromSegment(px, py, [ax, ay, bx, by]) {
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));

    return hypot(px - (ax + dx * t), py - (ay + dy * t));
}
