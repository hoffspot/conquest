// The world's water, from the plan: its rivers, its lakes and the sea, and the height each one's
// surface stands at (metres). The overworld reads which squares are wet from here (overworld.js);
// the terrain is carved down under the water to meet it (height.js). The same for every plan,
// whatever's asked first.
//
// Rivers run from each river cell to the one it runs into, as a curve through the cells' middles
// (bending round each cell's middle, from halfway along the way in to halfway along the way out),
// drawn as a few straight pieces, wandering a little more besides. Each cell's stretch is:
// - calm, where it falls gently: its surface sloping steadily down;
// - rapids, where it falls faster;
// - steps, where it falls steeply: pools held level, each spilling over a lip into the next, where
//   the land drops most (a waterfall, where the drop's high);
// and a few calm, small rivers' stretches are fords: wider and shallow, over gravel. How fast each
// runs comes from Manning's equation, from its depth and the fall of its surface. Whoever's in the
// water can wade it where it's shallow and slow enough (wadeable).

import { metresOf } from "./curve.js";
import { noise } from "../random.js";
import { CELL, CELLS, WATER } from "../worldplan/terrain.js";
import { hypot, pow } from "../exact.js";

/** Rivers: their half-widths (metres: the least and most, wider the more rain runs in them). */
export const RIVER_HALF = Object.freeze([1.5, 5]);

/** How far rivers wander from their courses (metres). */
export const WANDER = 7;

/**
 * How deep a river is under its surface in its middle (metres): `least`, and `perHalf` more for
 * each metre of its half-width.
 */
export const RIVER_DEPTH = Object.freeze({ least: 0.75, perHalf: 0.3 });

/**
 * Streams: where at least `flow` cells' rain runs in the hills and mountains (the plan's height
 * `height` and up) but not enough for a river, a stream runs, on down to the river, lake or sea it
 * finds: narrower than a river (half-widths `half`, metres), and shallow (`depth`: as RIVER_DEPTH).
 */
export const STREAMS = Object.freeze({ flow: 20, height: 0.5, half: [0.6, 1.4], depth: { least: 0.3, perHalf: 0.12 } });

/** What runs in each cell (Waters.running): nothing, a river, a stream. */
export const RUNNING = Object.freeze({ none: 0, river: 1, stream: 2 });

/** What each cell's stretch of a river is like. */
export const REACH = Object.freeze({ calm: 0, rapids: 1, steps: 2 });

/**
 * Fords: on calm stretches of rivers no wider than `half` (metres, half-width), about one in
 * `every` of them, so deep in the middle (metres), and this much wider than the river round them.
 */
export const FORDS = Object.freeze({ half: 3, every: 5, depth: 0.35, widen: 1.4 });

/**
 * Wading: through water no deeper than `deepest` (metres), and only where its depth times its
 * speed is under `sweep` (square metres a second: deeper or faster, and it sweeps a body away).
 */
export const WADE = Object.freeze({ deepest: 0.5, sweep: 0.6 });

/** Whether water this deep (metres) running this fast (metres a second) can be waded. */
export function wadeable(depth, speed) {
    return depth <= WADE.deepest && depth * speed < WADE.sweep;
}

// How far below the land's own height at a river cell's middle its surface is at least (metres)
const SUNK = 0.4;

// The pieces each cell's curve is drawn with
const PIECES = 4;

// A stretch falls as rapids from this fall a metre; in steps from this, or if it falls STEP_DROP
// metres or more; and a step falls at least STEP_LEAST metres
const RAPIDS = 0.02;
const STEPS = 0.08;
const STEP_DROP = 2.5;
const STEP_LEAST = 0.6;

// How fast rivers run: Manning's roughness for a river's bed (rougher the steeper it falls:
// boulders), and a ford's gravel, the least fall a metre reckoned with (a level river still runs),
// a pool's, and the slowest and fastest they run (metres a second)
const ROUGH = { bed: 0.035, steeper: 0.25, ford: 0.045 };
const LEAST_FALL = 0.0004;
const POOL_FALL = 0.002;
const SPEED = { least: 0.25, most: 4.5 };

// Over a lip, the water speeds to what falling its height gives (gravity, metres a second
// squared; reckoned on no more than LIP_MOST metres), over the last LIP_RUN metres before it; and
// below it, churns that fast for a little way (a metre and a half for each metre it fell, and two)
const GRAVITY = 9.81;
const LIP_MOST = 3;
const LIP_RUN = 4;

// Where a river runs into a lake or the sea, it widens this much as it goes in
const MOUTH = 1.6;

// How many steps placeOf takes back through the wandering
const PLACING = 8;

// Where along a pool's piece the land under it is looked at (0 its start, 1 its end)
const ALONG = [0, 0.25, 0.5, 0.75, 1];

// The chunks rivers are listed by (metres a side: the world plan's CHUNK, which this can't import:
// plan.js is built on this)
const CHUNK = 64;
const CHUNKS = (CELLS * CELL) / CHUNK;

// A plan's waters, made once for it
const MADE = new WeakMap();

// The land's own height at a point (height.js landHeight, which is built on this: so given by it),
// and whether a lake or the sea stands there
let landOf = null;
let stillAt = null;

/**
 * Give the land's own height ((plan, x, y) => metres), for rivers' surfaces to keep under, and
 * whether a lake or the sea stands at a point ((plan, x, y) => boolean: never asking the rivers),
 * for those running out into it.
 */
export function setLandOf(land, still = null) {
    landOf = land;
    stillAt = still;
}

/**
 * What runs in each of the plan's cells (RUNNING, a Uint8Array a cell each): its rivers, and the
 * streams: each cell of the hills and mountains enough rain runs through (STREAMS), and on from
 * each the way its water goes (to the cell beside it more runs through) until it meets a river, a
 * lake or the sea. `plan`: its water, flow and height (the plan's, or the land's as it's shaped,
 * settling it: worldplan/settle.js).
 */
export function runningIn({ water, flow, height }) {
    const runs = new Uint8Array(CELLS * CELLS);

    for (let k = 0; k < CELLS * CELLS; k++) {
        runs[k] = water[k] === WATER.river ? RUNNING.river : RUNNING.none;
    }

    for (let k = 0; k < CELLS * CELLS; k++) {
        if (water[k] !== WATER.none || flow[k] < STREAMS.flow || height[k] < STREAMS.height) {
            continue;
        }

        for (let at = k; at >= 0 && runs[at] === RUNNING.none && water[at] === WATER.none; at = below(flow, at)) {
            runs[at] = RUNNING.stream;
        }
    }

    return runs;
}

// The cell a cell's water goes on to: the one beside it more runs through than any other (and
// more than through it), or -1
function below(flow, k) {
    const [i, j] = [k % CELLS, Math.floor(k / CELLS)];
    let [best, most] = [-1, flow[k]];

    for (const [di, dj] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]) {
        const [ni, nj] = [i + di, j + dj];

        if (ni >= 0 && nj >= 0 && ni < CELLS && nj < CELLS && flow[nj * CELLS + ni] > most) {
            [best, most] = [nj * CELLS + ni, flow[nj * CELLS + ni]];
        }
    }

    return best;
}

/**
 * The waters of a world plan (made once for it; or `made`, those of the same land worked out
 * already as it was settled: worldplan/plan.js layOutWorld).
 */
export function watersOf(plan, made = null) {
    if (!MADE.has(plan)) {
        MADE.set(plan, made ?? new Waters(plan));
    }

    return MADE.get(plan);
}

export class Waters {
    /** @param {object} plan - The world plan (worldplan/plan.js planWorld). */
    constructor(plan) {
        this.plan = plan;
        this.near = new Map();
        this.courses = new Map();
        this.bare = new Map();
        this.shapes = new Map();
        this.made = null;
        this.links = null;
        this.runs = null;
    }

    /**
     * What runs in each cell (RUNNING, a Uint8Array a cell each): runningIn the plan.
     */
    get running() {
        this.runs ??= runningIn(this.plan);

        return this.runs;
    }

    /**
     * The height of each cell's water's surface (metres, a Float32Array a cell each): the sea's,
     * 0; a river's, the level the plan fills it to or the land's own height at its middle,
     * whichever's lower (so a river crossing a wide hollow runs along its floor, and cuts through
     * its rim to leave it), never below the sea's, and never higher than any cell upstream of it,
     * so rivers only ever run down; a lake's, its level, all of it at one level (as low as any
     * river running into it is).
     */
    get surfaces() {
        this.made ??= this.#surfaces();

        return this.made;
    }

    #surfaces() {
        const { plan } = this;
        const surface = new Float32Array(CELLS * CELLS);
        const rivers = [];

        for (let k = 0; k < CELLS * CELLS; k++) {
            surface[k] = plan.water[k] === WATER.sea ? 0 : metresOf(plan.level?.[k] ?? plan.height[k]);

            if (this.running[k]) {
                rivers.push(k);

                if (landOf) {
                    surface[k] = Math.max(0, Math.min(surface[k], landOf(plan, ((k % CELLS) + 0.5) * CELL, (Math.floor(k / CELLS) + 0.5) * CELL) - SUNK));
                }
            }
        }

        // From upstream down (a river cell runs into one more water runs through: so by how much
        // runs through each, then index), each lowering the river or lake cell it runs into to its
        // own level at most, once its own is settled
        rivers.sort((a, b) => plan.flow[a] - plan.flow[b] || a - b);

        for (const k of rivers) {
            const into = this.downstream(k % CELLS, Math.floor(k / CELLS));

            if (into && plan.water[into[1] * CELLS + into[0]] !== WATER.sea) {
                const n = into[1] * CELLS + into[0];

                surface[n] = Math.min(surface[n], surface[k]);
            }
        }

        // Each lake at one level: its lowest cell's
        const seen = new Uint8Array(CELLS * CELLS);

        for (let k = 0; k < CELLS * CELLS; k++) {
            if (plan.water[k] !== WATER.lake || seen[k]) {
                continue;
            }

            const lake = [k];

            seen[k] = 1;

            for (let n = 0; n < lake.length; n++) {
                const [i, j] = [lake[n] % CELLS, Math.floor(lake[n] / CELLS)];

                for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
                    const m = nj * CELLS + ni;

                    if (ni >= 0 && nj >= 0 && ni < CELLS && nj < CELLS && !seen[m] && plan.water[m] === WATER.lake) {
                        seen[m] = 1;
                        lake.push(m);
                    }
                }
            }

            const level = Math.min(...lake.map((m) => surface[m]));

            for (const m of lake) {
                surface[m] = level;
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

            if (this.running[nj * CELLS + ni] && plan.flow[nj * CELLS + ni] > most) {
                most = plan.flow[nj * CELLS + ni];
                best = [ni, nj];
            }
        }

        return best;
    }

    // Each river cell's links: the cell it runs into (`into`, an index, or -1), and the one of
    // those running into it that most water runs in from (`main`: its river carries on from that
    // one; the rest join it from the side), made once
    #linked() {
        if (!this.links) {
            const { plan } = this;
            const into = new Int32Array(CELLS * CELLS).fill(-1);
            const main = new Int32Array(CELLS * CELLS).fill(-1);

            for (let k = 0; k < CELLS * CELLS; k++) {
                if (this.running[k]) {
                    const next = this.downstream(k % CELLS, Math.floor(k / CELLS));

                    into[k] = next ? next[1] * CELLS + next[0] : -1;
                }
            }

            for (let k = 0; k < CELLS * CELLS; k++) {
                const next = into[k];

                if (next >= 0 && this.running[next] && (main[next] < 0 || plan.flow[k] > plan.flow[main[next]])) {
                    main[next] = k;
                }
            }

            this.links = { into, main };
        }

        return this.links;
    }

    // A river cell's half-width (metres), wider the more rain runs in it (a stream's narrower)
    #half(k) {
        const flow = Math.sqrt(this.plan.flow[k]);

        return this.running[k] === RUNNING.stream ? Math.min(STREAMS.half[1], Math.max(STREAMS.half[0], 0.3 + flow * 0.1)) : Math.min(RIVER_HALF[1], Math.max(RIVER_HALF[0], 0.9 + flow * 0.09));
    }

    // Where a river cell's curve starts and ends, and the surface's height and the river's
    // half-width at each end and at its middle: { start, end, s: [start, middle, end], h: [...] }
    #ends(k) {
        const { surfaces } = this;
        const { into, main } = this.#linked();
        const middle = middleOf(k);
        const [up, next] = [main[k], into[k]];
        const half = this.#half(k);
        const ends = { start: middle, end: middle, s: [surfaces[k], surfaces[k], surfaces[k]], h: [Math.max(this.running[k] === RUNNING.stream ? STREAMS.half[0] : RIVER_HALF[0], half * 0.8), half, half] };

        if (up >= 0) {
            ends.start = halfway(middleOf(up), middle);
            ends.s[0] = (surfaces[up] + surfaces[k]) / 2;
            ends.h[0] = (this.#half(up) + half) / 2;
        }

        if (next < 0) {
            return ends;
        }

        const lower = Math.min(surfaces[k], surfaces[next]);

        if (!this.running[next]) {
            // (Into a lake or the sea: all the way to its cell's middle, widening as it goes)
            ends.end = middleOf(next);
            ends.s[2] = lower;
            ends.h[2] = half * MOUTH;
        } else if (main[next] === k) {
            ends.end = halfway(middle, middleOf(next));
            ends.s[2] = (surfaces[k] + lower) / 2;
            ends.h[2] = (half + this.#half(next)) / 2;
        } else {
            // (Joining a bigger river from the side: to the middle of that one's curve)
            const along = middleOf(next);
            const [from, to] = [main[next] >= 0 ? halfway(middleOf(main[next]), along) : along, into[next] >= 0 ? halfway(along, middleOf(into[next])) : along];

            ends.end = [0.25 * from[0] + 0.5 * along[0] + 0.25 * to[0], 0.25 * from[1] + 0.5 * along[1] + 0.25 * to[1]];
            ends.s[2] = lower;
        }

        return ends;
    }

    /**
     * A river cell's course: its pieces, each { ax, ay, bx, by (metres, unwandered), length, dx, dy
     * (the way it runs, unwandered: a unit vector), half: [at a, at b], surface: [at a, at b], depth:
     * [at a, at b] (metres under the surface in the river's middle), speed (metres a second, in its
     * middle, away from any lip), lip (how far its surface drops at its end, metres), plunge (how
     * far it dropped at its start), ford (how much a ford it is at each end: 0 to 1), stream
     * (whether it's a mountain stream's), box ([x0, y0, x1, y1], round its line and its width) },
     * and what kind of reach it is (REACH). Made once.
     */
    course(k) {
        if (!this.courses.has(k)) {
            const own = this.#bare(k);
            const up = this.#linked().main[k];

            // (Its first piece churning below any step the cell above ended with)
            if (up >= 0) {
                own.pieces[0].plunge = Math.max(own.pieces[0].plunge, this.#bare(up).pieces.at(-1).lip);
            }

            this.courses.set(k, own);
        }

        return this.courses.get(k);
    }

    // A cell's course, but for the step it might start below (made once)
    #bare(k) {
        if (!this.bare.has(k)) {
            this.bare.set(k, this.#course(k));
        }

        return this.bare.get(k);
    }

    // A cell's course's shape (made once): its curve's corners (`points`), the surface at each
    // (`surface`), its half-width at each (`half`), its pieces' lengths, what kind of reach it is,
    // whether it runs out into a lake or the sea (`mouth`) and which corners are in it (`still`)
    #shape(k) {
        if (!this.shapes.has(k)) {
            const { plan } = this;
            const ends = this.#ends(k);
            const control = middleOf(k);

            // The curve's corners: from its start round its cell's middle to its end
            const points = [];

            for (let p = 0; p <= PIECES; p++) {
                const t = p / PIECES;
                const [a, b, c] = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t];

                points.push([a * ends.start[0] + b * control[0] + c * ends.end[0], a * ends.start[1] + b * control[1] + c * ends.end[1]]);
            }

            // At each corner: its surface (falling steadily from the start to the middle, then to
            // the end) and half-width
            const along = (values, t) => (t <= 0.5 ? values[0] + (values[1] - values[0]) * t * 2 : values[1] + (values[2] - values[1]) * (t - 0.5) * 2);
            const surface = points.map((_, p) => along(ends.s, p / PIECES));
            const half = points.map((_, p) => along(ends.h, p / PIECES));
            const lengths = points.slice(1).map(([x, y], p) => hypot(x - points[p][0], y - points[p][1]));
            const length = lengths.reduce((sum, l) => sum + l, 0);
            const drop = surface[0] - surface[PIECES];
            const fall = length > 0 ? drop / length : 0;
            const reach = fall >= STEPS || drop >= STEP_DROP ? REACH.steps : fall >= RAPIDS ? REACH.rapids : REACH.calm;
            const { into } = this.#linked();
            const mouth = into[k] >= 0 && !this.running[into[k]];

            // Running out into a lake or the sea: at its level from the first corner in it, so none
            // of the river stands out over it (in steps, from the last corner before it: a pool
            // spills over a lip at its shore, not out in it)
            const still = surface.map((_, p) => mouth && stillAt !== null && p > 0 && stillAt(plan, ...points[p]));

            still.forEach((wet, p) => {
                surface[p] = wet ? surface[PIECES] : surface[p];
            });

            this.shapes.set(k, { ends, points, surface, half, lengths, reach, mouth, still });
        }

        return this.shapes.get(k);
    }

    // The lowest the land lies under one of a course's pieces (`p`, of its corners `points`),
    // where it lies in the world, less SUNK (metres)
    #lowest(points, p) {
        const [[ax, ay], [bx, by]] = [points[p], points[p + 1]];

        return Math.min(...ALONG.map((t) => landOf(this.plan, ...this.placeOf(ax + (bx - ax) * t, ay + (by - ay) * t)))) - SUNK;
    }

    // The level a cell's first pool is held at, in steps: the surface at its start, but where the
    // land under its first piece lies lower (by STEP_LEAST or more), there, so it drops at its
    // very start (over the lip the cell above it ends with); its start's surface in any other reach
    #first(k) {
        const { surface, points, reach, still } = this.#shape(k);

        if (reach !== REACH.steps || !landOf) {
            return surface[0];
        }

        const target = still[1] ? surface[PIECES] : Math.max(surface[PIECES], Math.min(surface[0], this.#lowest(points, 0)));

        return still[1] || surface[0] - target >= STEP_LEAST ? target : surface[0];
    }

    #course(k) {
        const { plan } = this;
        const { ends, points, surface, half, lengths, reach, mouth, still } = this.#shape(k);

        // A ford: the middle half of a calm, small river's cell (easing in and out round it), about
        // one in FORDS.every of them, not where it starts, ends, or joins another
        const { into, main } = this.#linked();
        const stream = this.running[k] === RUNNING.stream;
        const fordable = !stream && reach === REACH.calm && ends.h[1] <= FORDS.half && main[k] >= 0 && into[k] >= 0 && this.running[into[k]] && main[into[k]] === k;
        const ford = fordable && pick(k, plan.seed) % FORDS.every === 0 ? [0, 1, 1, 1, 0] : [0, 0, 0, 0, 0];

        // Where it ends: the surface there, but lower if the cell it carries on into starts with a
        // drop (#first), which it spills over
        const next = into[k];
        const end = next >= 0 && this.running[next] && main[next] === k ? Math.min(surface[PIECES], this.#first(next)) : surface[PIECES];

        // In steps: each pool held level, dropping where the land under the river does, by at
        // least STEP_LEAST (and at the cell's end, to meet the next): under the land all along its
        // piece, where it lies in the world, so it never stands out over the land below it
        const level = surface.slice();

        if (reach === REACH.steps) {
            let low = (level[0] = this.#first(k));

            for (let p = 1; p < PIECES; p++) {
                const land = landOf ? this.#lowest(points, p) : surface[p];
                const target = still[p + 1] ? surface[PIECES] : Math.max(surface[PIECES], Math.min(low, land));

                level[p] = still[p + 1] || level[p - 1] - target >= STEP_LEAST ? target : level[p - 1];
                low = Math.min(low, target);
            }
        }

        const pieces = [];

        for (let p = 0; p < PIECES; p++) {
            const [[ax, ay], [bx, by]] = [points[p], points[p + 1]];
            const l = lengths[p] || 1;
            const halves = [half[p] * (1 + (FORDS.widen - 1) * ford[p]), half[p + 1] * (1 + (FORDS.widen - 1) * ford[p + 1])];
            const depth = halves.map((h, e) => {
                const own = stream ? STREAMS.depth.least + STREAMS.depth.perHalf * Math.min(h, STREAMS.half[1]) : RIVER_DEPTH.least + RIVER_DEPTH.perHalf * Math.min(h, RIVER_HALF[1]);

                return own + (FORDS.depth - own) * ford[p + e];
            });
            const steps = reach === REACH.steps;
            const levels = steps ? [level[p], level[p]] : [surface[p], surface[p + 1]];
            // (How far it drops at its end: to the next pool, or at the cell's end to where it ends)
            const lip = levels[1] - (p + 1 === PIECES ? end : steps ? level[p + 1] : levels[1]);
            const plunge = steps && p > 0 ? level[p - 1] - level[p] : 0;
            const slope = steps ? POOL_FALL : Math.max(LEAST_FALL, (levels[0] - levels[1]) / l);
            const rough = ford[p] + ford[p + 1] > 0 ? ROUGH.ford : ROUGH.bed + ROUGH.steeper * slope;
            // (Slowing to a stop as it runs out into a lake or the sea)
            const out = mouth ? 1 - (p + 0.5) / PIECES : 1;
            const speed = Math.min(SPEED.most, Math.max(SPEED.least, (pow(0.6 * ((depth[0] + depth[1]) / 2), 2 / 3) * Math.sqrt(slope)) / rough)) * out;
            const wide = Math.max(...halves);

            pieces.push({
                ax,
                ay,
                bx,
                by,
                length: l,
                dx: (bx - ax) / l,
                dy: (by - ay) / l,
                half: halves,
                surface: levels,
                depth,
                speed,
                lip: Math.max(0, lip),
                plunge: Math.max(0, plunge),
                ford: [ford[p], ford[p + 1]],
                stream,
                box: [Math.min(ax, bx) - wide, Math.min(ay, by) - wide, Math.max(ax, bx) + wide, Math.max(ay, by) + wide],
            });
        }

        return { reach, pieces };
    }

    /** The river pieces near a chunk (cx, cy: chunks of CHUNK metres): course's, of every river cell near it. */
    riversNear(cx, cy) {
        const key = cy * CHUNKS + cx;

        if (!this.near.has(key)) {
            const pieces = [];
            const reach = Math.ceil((WANDER + RIVER_HALF[1] * MOUTH) / CELL) + 1;
            const [c0, c1] = [Math.floor((cx * CHUNK) / CELL) - reach, Math.floor(((cx + 1) * CHUNK) / CELL) + reach];
            const [r0, r1] = [Math.floor((cy * CHUNK) / CELL) - reach, Math.floor(((cy + 1) * CHUNK) / CELL) + reach];

            for (let j = Math.max(0, r0); j <= Math.min(CELLS - 1, r1); j++) {
                for (let i = Math.max(0, c0); i <= Math.min(CELLS - 1, c1); i++) {
                    const k = j * CELLS + i;

                    if (this.running[k] && this.#linked().into[k] >= 0) {
                        pieces.push(...this.course(k).pieces);
                    }
                }
            }

            this.near.set(key, pieces);
        }

        return this.near.get(key);
    }

    // Where a point is taken to be, for rivers: moved a wandering way, so they don't run straight
    #wandered(px, py) {
        const seed = this.plan.seed;

        return [px + (noise(px, py, seed + 51, 40, 2) - 0.5) * 2 * WANDER, py + (noise(px, py, seed + 61, 40, 2) - 0.5) * 2 * WANDER];
    }

    /**
     * Where in the world a point of a river's course (unwandered, metres: course()'s) lies: the
     * point that wanders to it ([x, y], metres), found by stepping back by how far each guess
     * wanders off it (the wandering bends slowly, so a few steps do).
     */
    placeOf(wx, wy) {
        let [px, py] = [wx, wy];

        for (let k = 0; k < PLACING; k++) {
            const [ax, ay] = this.#wandered(px, py);

            [px, py] = [px + wx - ax, py + wy - ay];
        }

        return [px, py];
    }

    /** Is a point (metres) in a river? */
    riverAt(px, py) {
        const river = this.river(px, py, 0);

        return river !== null && river.gap <= 0;
    }

    /**
     * The river nearest a point (metres), as the ground is carved for it: { gap (how far outside
     * its bank the point is, metres: less than 0 in it), half (its half-width), surface (its
     * surface's height there, metres), depth (how deep it is in its middle there, metres), speed
     * (how fast it runs there, metres a second: fastest in its middle, still at its banks), along
     * (the way it runs, unwandered: a unit vector), ford (how much a ford it is there: 1 in a ford,
     * easing to 0 round it), stream (whether it's a mountain stream) }, or null if there's none
     * within `within` metres of its bank.
     */
    river(px, py, within) {
        const pieces = this.riversNear(Math.floor(px / CHUNK), Math.floor(py / CHUNK));

        return pieces.length ? this.#nearest(pieces, this.#wandered(px, py), within) : null;
    }

    // The river nearest a point taken to be at (wx, wy) (wandered) among some pieces: river's
    #nearest(pieces, [wx, wy], within) {
        let [best, gap, at] = [null, Infinity, 0];

        for (const piece of pieces) {
            const { ax, ay, box } = piece;

            if (wx < box[0] - within || wy < box[1] - within || wx > box[2] + within || wy > box[3] + within) {
                continue;
            }

            const t = Math.max(0, Math.min(1, ((wx - ax) * piece.dx + (wy - ay) * piece.dy) / piece.length));
            const off = hypot(wx - (ax + piece.dx * piece.length * t), wy - (ay + piece.dy * piece.length * t)) - (piece.half[0] + (piece.half[1] - piece.half[0]) * t);

            if (off <= within && off < gap) {
                [best, gap, at] = [piece, off, t];
            }
        }

        if (!best) {
            return null;
        }

        const lerp = ([a, b]) => a + (b - a) * at;
        const half = lerp(best.half);
        // (How far from its middle line, to its banks: 0 to 1)
        const out = Math.max(0, Math.min(1, (half + gap) / half));
        const run = at * best.length;
        let speed = best.speed;

        // (Speeding up over a lip; churning below one)
        if (best.lip > 0) {
            speed += Math.sqrt(2 * GRAVITY * Math.min(best.lip, LIP_MOST)) * smoothstep(best.length - LIP_RUN, best.length, run);
        }

        if (best.plunge > 0) {
            speed = Math.max(speed, Math.sqrt(2 * GRAVITY * Math.min(best.plunge, LIP_MOST)) * (1 - smoothstep(0, 2 + 1.5 * best.plunge, run)));
        }

        return {
            gap,
            half,
            surface: lerp(best.surface),
            depth: lerp(best.depth),
            speed: Math.min(SPEED.most, speed) * (1 - out * out),
            along: [best.dx, best.dy],
            ford: lerp(best.ford),
            stream: best.stream,
        };
    }

    /**
     * How the water runs at a point (metres) in a river: [east, south] (metres a second, the way
     * it runs through the wandering), or null where there's no river.
     */
    current(px, py) {
        return this.flowing(px, py, 0)?.current ?? null;
    }

    /**
     * The river nearest a point (metres), as river() has it, and how its water runs there
     * (`current`: as current() has it, or null outside it), at once: for drawing it.
     */
    flowing(px, py, within) {
        const pieces = this.riversNear(Math.floor(px / CHUNK), Math.floor(py / CHUNK));

        if (!pieces.length) {
            return null;
        }

        const w0 = this.#wandered(px, py);
        const river = this.#nearest(pieces, w0, within);

        if (!river || river.gap > 0 || river.speed <= 0) {
            return river && { ...river, current: null };
        }

        // The wandering's stretch here (its Jacobian, over a metre), undone from the way the
        // unwandered river runs
        const [w1, w2] = [this.#wandered(px + 1, py), this.#wandered(px, py + 1)];
        const [a, b, c, d] = [w1[0] - w0[0], w2[0] - w0[0], w1[1] - w0[1], w2[1] - w0[1]];
        const det = a * d - b * c || 1;
        const [ex, ey] = [(d * river.along[0] - b * river.along[1]) / det, (-c * river.along[0] + a * river.along[1]) / det];
        const length = hypot(ex, ey) || 1;

        return { ...river, current: [(ex / length) * river.speed, (ey / length) * river.speed] };
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

// A cell's middle (metres)
function middleOf(k) {
    return [((k % CELLS) + 0.5) * CELL, (Math.floor(k / CELLS) + 0.5) * CELL];
}

// Halfway between two points
function halfway([ax, ay], [bx, by]) {
    return [(ax + bx) / 2, (ay + by) / 2];
}

// A whole number for a cell and a seed, the same every time (to pick fords by)
function pick(k, seed) {
    let h = Math.imul(k | 0, 374761393) + Math.imul(seed | 0, 668265263) + 1442695041;

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return (h ^ (h >>> 16)) >>> 0;
}

function smoothstep(from, to, value) {
    const t = Math.max(0, Math.min(1, (value - from) / (to - from)));

    return t * t * (3 - 2 * t);
}
