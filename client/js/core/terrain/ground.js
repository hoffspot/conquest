// The ground the world is played on: the land's own height (height.js) with what's built on it
// levelled into it. Settlements, castles and special places, and camps stand on flat pads, eased
// into the land round them; roads follow the land's lie smoothed along their length, so they
// rise and fall gently, with shoulders easing out to the land beside them. Everything here is
// worked out the same way whatever's asked first, in every browser, so every player stands on the
// same ground.
//
// Heights are kept a chunk at a time, at each metre's corner (65 by 65 for a 64-metre chunk), and
// read between corners over two triangles a square (split from north-west to south-east), the
// way the drawn ground is built from them, so what stands on the ground stands on what's drawn.
// The land's own heights for a chunk are the costly part (a few milliseconds): they can be worked
// out ahead, off the page's thread, and given (`give`); otherwise they're worked out when wanted.

import { heightAt, heightsOf, HEIGHT_STEP, SLOPE_CLASS, slopeClass, waterAt } from "./height.js";
import { hypot } from "../exact.js";

/** A chunk's size (metres a side), and its corners a side. */
export const CHUNK = 64;
export const CORNERS = CHUNK + 1;

/** How far a pad eases into the land round it (metres). */
export const PAD_EASE = 24;

/**
 * How steeply a pad that may lie with the land (`tilt`: the town and the settlements) may tilt,
 * at most (rise over run): it's laid on the plane that best fits the land under it, no steeper.
 */
export const PAD_TILT = 0.08;

/**
 * Roads: how far their shoulders ease out to the land (metres): `batter` times as far as the road's
 * cut into it or built up over it there, at least `shoulder` and at most `most` (so a bank's no
 * steeper than 1 in `batter` on average, and 1.5 in `batter` at its steepest); and how far along
 * they're smoothed (metres, each way).
 */
export const ROAD = Object.freeze({ shoulder: 3, batter: 2.5, most: 12, smoothing: 12, step: 2 });

// Grading a road's heights (graded): how many times over, at most, and how near its grade is near enough (metres)
const GRADING = Object.freeze({ passes: 400, near: 0.001 });

/**
 * The steepest each kind of road climbs (rise over run): a trade road for laden carts, a road, a
 * track, a foot path (core/trails.js). Where the land's steeper, a road's cut into it and built up
 * over it, as much of each.
 */
export const GRADE = Object.freeze({ trade: 0.1, road: 0.12, track: 0.15, path: 0.25 });

// How many chunks' heights to keep
const KEEP = 256;

// How far above the water a road's taken over it (metres: its bridge's ends, on the banks)
const BANK = 0.6;

function smoothstep(from, to, value) {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));

    return t * t * (3 - 2 * t);
}

const round = (height) => Math.round(height / HEIGHT_STEP) * HEIGHT_STEP;

/**
 * A pad: somewhere built on, levelled to one height. `{ id, x0, y0, x1, y1 }` (a rectangle,
 * metres) or `{ id, at: [x, y], radius }` (a disc), either raised `raise` metres above the land
 * under it on average (or sunk below it, if less than nothing), and eased into the land round it
 * over `ease` metres (PAD_EASE if not said: a cave's pit is eased in steeply). A rectangle that may lie with the
 * land (`tilt`) is laid on the plane that best fits the land under it, no steeper than PAD_TILT,
 * rather than level.
 */
export class Ground {
    /**
     * @param {object} plan - The world plan.
     * @param {object} [options]
     * @param {Function} [options.padsNear] - The pads that reach into a chunk (cx, cy), eased edges
     *     and all: the same whenever asked.
     * @param {Function} [options.roadsNear] - The roads through a chunk (cx, cy): [{ line, k
     *     (which of its segments), half (half-width, metres) }], each line { planned: [[x, y],
     *     ...], kind (GRADE's) }: the same whenever asked.
     * @param {Function} [options.settledNear] - The pads of the settlements reaching into a chunk
     *     (cx, cy), padsNear's: those the roads come to, which they climb to gently. Asking must
     *     settle nothing else, nor change anything.
     */
    constructor(plan, { padsNear = () => [], roadsNear = () => [], settledNear = () => [] } = {}) {
        this.plan = plan;
        this.padsNear = padsNear;
        this.roadsNear = roadsNear;
        this.settledNear = settledNear;
        this.natural = new Map();
        this.chunks = new Map();
        this.levels = new Map();
        this.tilts = new Map();
        this.profiles = new Map();
    }

    /** Whether a chunk's land heights are kept (given or worked out). */
    has(cx, cy) {
        return this.natural.has(cy * 1024 + cx);
    }

    /** Give a chunk's land heights (height.js heightsOf, its corners), worked out elsewhere. */
    give(cx, cy, heights) {
        if (!this.natural.has(cy * 1024 + cx) && heights.length === CORNERS * CORNERS) {
            this.natural.set(cy * 1024 + cx, heights);
        }
    }

    // The land's own heights at a chunk's corners (given, or worked out now)
    #natural(cx, cy) {
        const key = cy * 1024 + cx;

        if (!this.natural.has(key)) {
            this.natural.set(key, heightsOf(this.plan, cx * CHUNK, cy * CHUNK, CORNERS, 1));
        }

        const heights = this.natural.get(key);

        this.natural.delete(key);

        if (this.natural.size >= KEEP) {
            this.natural.delete(this.natural.keys().next().value);
        }

        this.natural.set(key, heights);

        return heights;
    }

    /**
     * The ground at a chunk's corners (metres, a Float32Array of CORNERS × CORNERS, row by row
     * from its north-west corner), and each of its squares' slope class (a Uint8Array of CHUNK ×
     * CHUNK: height.js SLOPE_CLASS): { heights, slopes }.
     */
    chunk(cx, cy) {
        const key = cy * 1024 + cx;
        let made = this.chunks.get(key);

        if (made) {
            this.chunks.delete(key);
        } else {
            made = this.#make(cx, cy);

            if (this.chunks.size >= KEEP) {
                this.chunks.delete(this.chunks.keys().next().value);
            }
        }

        this.chunks.set(key, made);

        return made;
    }

    /** A chunk's ground if it's kept (chunk's), else null: nothing's worked out. */
    peek(cx, cy) {
        return this.chunks.get(cy * 1024 + cx) ?? null;
    }

    #make(cx, cy) {
        const [x0, y0] = [cx * CHUNK, cy * CHUNK];
        const heights = Float32Array.from(this.#natural(cx, cy));
        const roads = this.roadsNear(cx, cy);
        const pads = [...this.padsNear(cx, cy)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

        if (roads.length || pads.length) {
            for (let j = 0; j < CORNERS; j++) {
                for (let i = 0; i < CORNERS; i++) {
                    const k = j * CORNERS + i;
                    const [x, y] = [x0 + i, y0 + j];
                    const land = heights[k];
                    // (On a pad, its own height; off them, the roads levelled into the land as
                    // the pads have eased it: a road's own height is its profile's, which the
                    // settlements' pads are in already)
                    const padded = this.#onPads(pads, x, y, land);
                    const height = round(this.#onAnyPad(pads, x, y) ? padded : this.#onRoads(roads, x, y, padded));

                    // (But water keeps its channel and its lakes: bridges cross it)
                    if (height !== land && waterAt(this.plan, x, y, land) === null) {
                        heights[k] = height;
                    }
                }
            }
        }

        const slopes = new Uint8Array(CHUNK * CHUNK);

        for (let j = 0; j < CHUNK; j++) {
            for (let i = 0; i < CHUNK; i++) {
                const k = j * CORNERS + i;

                slopes[j * CHUNK + i] = slopeClass(heights[k], heights[k + 1], heights[k + CORNERS], heights[k + CORNERS + 1]);
            }
        }

        return { heights, slopes };
    }

    // A road's height along it, every ROAD.step metres from its start: the land's (with the
    // settlements it comes to levelled in), smoothed ROAD.smoothing metres each way, then kept to
    // its GRADE (graded) ({ heights, starts (each segment's distance along it at its start) })
    #profile(line) {
        if (!this.profiles.has(line)) {
            const points = line.planned;
            const starts = [0];
            const raw = [];

            for (let k = 1; k < points.length; k++) {
                starts.push(starts[k - 1] + hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
            }

            const length = starts.at(-1);
            const count = Math.max(2, Math.floor(length / ROAD.step) + 1);
            let segment = 0;

            for (let s = 0; s < count; s++) {
                const along = Math.min(length, s * ROAD.step);

                while (segment < points.length - 2 && starts[segment + 1] < along) {
                    segment++;
                }

                const span = starts[segment + 1] - starts[segment] || 1;
                const t = (along - starts[segment]) / span;
                const [[ax, ay], [bx, by]] = [points[segment], points[segment + 1]];

                // (Over water, the road's on a bridge: it keeps to its banks' height)
                const [x, y] = [ax + (bx - ax) * t, ay + (by - ay) * t];
                const land = this.#onPads(this.settledNear(Math.floor(x / CHUNK), Math.floor(y / CHUNK)), x, y, this.#landAt(x, y));
                const water = waterAt(this.plan, x, y, land);

                raw.push(water === null ? land : Math.max(land, water + BANK));
            }

            const reach = Math.round(ROAD.smoothing / ROAD.step);
            const heights = raw.map((_, s) => {
                let [sum, n] = [0, 0];

                for (let d = -reach; d <= reach; d++) {
                    if (s + d >= 0 && s + d < raw.length) {
                        sum += raw[s + d];
                        n++;
                    }
                }

                return sum / n;
            });

            // (Its ends at the land's own height there, so roads and trails meeting end to end
            // meet at one height)
            heights[0] = raw[0];
            heights[heights.length - 1] = raw.at(-1);
            this.profiles.set(line, { heights: graded(heights, (GRADE[line.kind] ?? GRADE.track) * ROAD.step, { pinned: true }), starts });
        }

        return this.profiles.get(line);
    }

    // The land's own height at any point (worked out there, never read between kept corners: so
    // it's the same whichever chunks happen to be kept)
    #landAt(x, y) {
        return heightAt(this.plan, x, y);
    }

    // A point's height with the roads near it levelled in: on a road, its height; beside it, eased
    // out to the land's over its shoulder (as wide as the cut or fill there needs); where ways
    // meet, their heights eased together by how near each one's middle is
    #onRoads(roads, x, y, height) {
        const near = [];

        for (const road of roads) {
            const [ax, ay] = road.line.planned[road.k];
            const [bx, by] = road.line.planned[road.k + 1];
            const [dx, dy] = [bx - ax, by - ay];
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
            const [ex, ey] = [x - (ax + dx * t), y - (ay + dy * t)];

            // (Too far off for its banks to reach, by the square of the distance: no need of more)
            if (ex * ex + ey * ey >= (road.half + ROAD.most) * (road.half + ROAD.most)) {
                continue;
            }

            const off = hypot(ex, ey) - road.half;

            const { heights, starts } = this.#profile(road.line);
            const along = (starts[road.k] + t * hypot(dx, dy)) / ROAD.step;
            const s = Math.min(heights.length - 1, Math.floor(along));
            const surface = heights[s] + (heights[Math.min(heights.length - 1, s + 1)] - heights[s]) * (along - s);
            const width = Math.min(ROAD.most, Math.max(ROAD.shoulder, Math.abs(height - surface) * ROAD.batter));

            if (off < width) {
                // (How far onto it: 1 on the way itself, easing to nothing at its shoulder's edge)
                near.push({ id: road.line.id ?? "", k: road.k, centre: hypot(ex, ey), surface, reach: 1 - smoothstep(0, width, off) });
            }
        }

        if (near.length === 0) {
            return height;
        }

        // Where ways meet (a trail leaving a road, two roads crossing, a hairpin's two legs side by
        // side), each way's height by how near its middle is, easing from one to the next, so the
        // ground has no step between them; on a way's middle, all but its own. (Taken in the same
        // order however they were laid, so the sum's the same.)
        near.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.k - b.k));

        let [sum, weight, reach] = [0, 0, 0];

        for (const each of near) {
            const share = each.reach / (0.25 + each.centre * each.centre);

            sum += share * each.surface;
            weight += share;
            reach = Math.max(reach, each.reach);
        }

        // (None reaching it after all: at the very edge of their shoulders)
        if (weight === 0) {
            return height;
        }

        const surface = sum / weight;

        return surface + (height - surface) * (1 - reach);
    }

    // A pad's height: the land's under it, on average (sampled on a grid across it), and as far
    // above or below that as it's raised (`raise`, metres)
    #level(pad) {
        if (!this.levels.has(pad.id)) {
            const [x0, y0, x1, y1] = pad.at ? [pad.at[0] - pad.radius, pad.at[1] - pad.radius, pad.at[0] + pad.radius, pad.at[1] + pad.radius] : [pad.x0, pad.y0, pad.x1, pad.y1];
            let [sum, n] = [0, 0];

            for (let j = 0; j <= 4; j++) {
                for (let i = 0; i <= 4; i++) {
                    const [x, y] = [x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * j) / 4];

                    if (!pad.at || hypot(x - pad.at[0], y - pad.at[1]) <= pad.radius) {
                        sum += this.#landAt(x, y);
                        n++;
                    }
                }
            }

            // (Raised on a mound above the land's, or sunk into it, as far as it asks)
            this.levels.set(pad.id, round(sum / n + (pad.raise ?? 0)));
        }

        return this.levels.get(pad.id);
    }

    /** The height a pad is levelled to (metres): at its middle, if it tilts. */
    levelOf(pad) {
        return this.#level(pad);
    }

    /** How a pad tilts: [rise east, rise south] (metres a metre), [0, 0] if it's level. */
    tiltOf(pad) {
        return this.#tilt(pad);
    }

    // How a pad that may lie with the land tilts: the plane that best fits the land under it (on
    // the grid its level is from: rise across it against how far across, the least squares'),
    // no steeper than PAD_TILT; level for the rest
    #tilt(pad) {
        if (!pad.tilt || pad.at) {
            return [0, 0];
        }

        if (!this.tilts.has(pad.id)) {
            const level = this.#level(pad) - (pad.raise ?? 0);
            let [across, east, down, south] = [0, 0, 0, 0];

            for (let j = 0; j <= 4; j++) {
                for (let i = 0; i <= 4; i++) {
                    const [dx, dy] = [((pad.x1 - pad.x0) * (i - 2)) / 4, ((pad.y1 - pad.y0) * (j - 2)) / 4];
                    const rise = this.#landAt(pad.x0 + ((pad.x1 - pad.x0) * i) / 4, pad.y0 + ((pad.y1 - pad.y0) * j) / 4) - level;

                    [across, east, down, south] = [across + dx * dx, east + dx * rise, down + dy * dy, south + dy * rise];
                }
            }

            const [gx, gy] = [across ? east / across : 0, down ? south / down : 0];
            const steep = hypot(gx, gy);

            this.tilts.set(pad.id, steep > PAD_TILT ? [(gx * PAD_TILT) / steep, (gy * PAD_TILT) / steep] : [gx, gy]);
        }

        return this.tilts.get(pad.id);
    }

    // A pad's height at a point of it (its middle's level, and as it tilts)
    #padAt(pad, x, y) {
        const [gx, gy] = this.#tilt(pad);

        return gx || gy ? this.#level(pad) + gx * (x - (pad.x0 + pad.x1) / 2) + gy * (y - (pad.y0 + pad.y1) / 2) : this.#level(pad);
    }

    // Is a point on a pad (not just in the land eased round it)?
    #onAnyPad(pads, x, y) {
        return pads.some((pad) => (pad.at ? hypot(x - pad.at[0], y - pad.at[1]) <= pad.radius : x >= pad.x0 && x <= pad.x1 && y >= pad.y0 && y <= pad.y1));
    }

    // A point's height with the pads near it levelled in (eased from the pad's height at its
    // nearest point)
    #onPads(pads, x, y, height) {
        for (const pad of pads) {
            const off = pad.at ? hypot(x - pad.at[0], y - pad.at[1]) - pad.radius : hypot(Math.max(pad.x0 - x, 0, x - pad.x1), Math.max(pad.y0 - y, 0, y - pad.y1));

            if (off < (pad.ease ?? PAD_EASE)) {
                const level = pad.at ? this.#level(pad) : this.#padAt(pad, Math.min(pad.x1, Math.max(pad.x0, x)), Math.min(pad.y1, Math.max(pad.y0, y)));

                height = level + (height - level) * smoothstep(0, pad.ease ?? PAD_EASE, off);
            }
        }

        return height;
    }

    /**
     * The ground's height at a point (metres), read between its square's corners over the
     * square's two triangles (north-west to south-east), as it's drawn.
     */
    heightAt(x, y) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
        const key = cy * 1024 + cx;

        // (The chunk last read kept to hand: most reads are in the same one as the last)
        if (key !== this.lastKey) {
            this.last = this.chunk(cx, cy);
            this.lastKey = key;
        }

        return between(this.last.heights, x - cx * CHUNK, y - cy * CHUNK);
    }

    /** A square's slope class (height.js SLOPE_CLASS). */
    slopeAt(x, y) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

        return this.chunk(cx, cy).slopes[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)] ?? SLOPE_CLASS.open;
    }
}

/**
 * Heights along a line (metres, evenly spaced) kept to rising or falling no more than `most`
 * metres from each to the next, near the heights as they were: wherever two side by side are
 * too far apart, each is moved half the excess towards the other (the higher cut down as much as
 * the lower's built up), over and over, forwards and back, till none are (or GRADING.passes have gone by:
 * then whatever's left is cut down to fit). With its ends `pinned`, they're kept as they are.
 */
export function graded(heights, most, { pinned = false } = {}) {
    const kept = heights.slice();
    const n = kept.length;
    // (Ends pinned stay as they are: the other side moves all the way)
    const share = (k) => (pinned && (k === 0 || k === n - 1) ? 0 : 1);

    for (let pass = 0; pass < GRADING.passes; pass++) {
        let worst = 0;
        const meet = (a, b) => {
            const rise = kept[b] - kept[a];
            const over = Math.abs(rise) - most;

            if (over > 0 && share(a) + share(b) > 0) {
                const step = (rise > 0 ? over : -over) / (share(a) + share(b));

                kept[a] += step * share(a);
                kept[b] -= step * share(b);
                worst = Math.max(worst, over);
            }
        };

        for (let k = 1; k < n; k++) {
            meet(k - 1, k);
        }

        for (let k = n - 1; k > 0; k--) {
            meet(k - 1, k);
        }

        if (worst <= GRADING.near) {
            break;
        }
    }

    for (let k = 1; k < n; k++) {
        kept[k] = Math.min(kept[k], kept[k - 1] + most);
    }

    for (let k = n - 2; k >= 0; k--) {
        kept[k] = Math.min(kept[k], kept[k + 1] + most);
    }

    return kept;
}

/**
 * A height read between a chunk's corners (heights: CORNERS × CORNERS) at (u, v) metres into it,
 * over each square's two triangles, split from its north-west corner to its south-east.
 */
export function between(heights, u, v) {
    const i = Math.min(CHUNK - 1, Math.max(0, Math.floor(u)));
    const j = Math.min(CHUNK - 1, Math.max(0, Math.floor(v)));
    const [s, t] = [Math.min(1, Math.max(0, u - i)), Math.min(1, Math.max(0, v - j))];
    const k = j * CORNERS + i;
    const [nw, ne, sw, se] = [heights[k], heights[k + 1], heights[k + CORNERS], heights[k + CORNERS + 1]];

    // (Above the diagonal, the north-east triangle; below it, the south-west)
    return s >= t ? nw + (ne - nw) * s + (se - ne) * t : nw + (sw - nw) * t + (se - sw) * s;
}
