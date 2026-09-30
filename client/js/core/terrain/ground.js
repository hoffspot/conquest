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

/** Roads: how far their shoulders ease out to the land (metres), and how far along they're smoothed (metres, each way). */
export const ROAD = Object.freeze({ shoulder: 3, smoothing: 12, step: 2 });

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
 * metres) or `{ id, at: [x, y], radius }` (a disc).
 */
export class Ground {
    /**
     * @param {object} plan - The world plan.
     * @param {object} [options]
     * @param {Function} [options.padsNear] - The pads that reach into a chunk (cx, cy), eased edges
     *     and all: the same whenever asked.
     * @param {Function} [options.roadsNear] - The roads through a chunk (cx, cy): [{ line, k
     *     (which of its segments), half (half-width, metres) }], each line { planned: [[x, y],
     *     ...] }: the same whenever asked.
     */
    constructor(plan, { padsNear = () => [], roadsNear = () => [] } = {}) {
        this.plan = plan;
        this.padsNear = padsNear;
        this.roadsNear = roadsNear;
        this.natural = new Map();
        this.chunks = new Map();
        this.levels = new Map();
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
                    const height = round(this.#onPads(pads, x, y, this.#onRoads(roads, x, y, land)));

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

    // A road's height along it: the land's, smoothed ROAD.smoothing metres each way, every
    // ROAD.step metres from its start ({ at (each sample's distance along it), heights, starts
    // (each segment's distance along it at its start) })
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
                const land = this.#landAt(x, y);
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

            this.profiles.set(line, { heights, starts });
        }

        return this.profiles.get(line);
    }

    // The land's own height at any point (worked out there, never read between kept corners: so
    // it's the same whichever chunks happen to be kept)
    #landAt(x, y) {
        return heightAt(this.plan, x, y);
    }

    // A point's height with the roads near it levelled in
    #onRoads(roads, x, y, height) {
        let best = null;

        for (const road of roads) {
            const [ax, ay] = road.line.planned[road.k];
            const [bx, by] = road.line.planned[road.k + 1];
            const [dx, dy] = [bx - ax, by - ay];
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
            const off = hypot(x - (ax + dx * t), y - (ay + dy * t)) - road.half;

            if (off < ROAD.shoulder && (!best || off < best.off)) {
                best = { road, t, off, length: hypot(dx, dy) };
            }
        }

        if (!best) {
            return height;
        }

        const { heights, starts } = this.#profile(best.road.line);
        const along = (starts[best.road.k] + best.t * best.length) / ROAD.step;
        const s = Math.min(heights.length - 1, Math.floor(along));
        const surface = heights[s] + (heights[Math.min(heights.length - 1, s + 1)] - heights[s]) * (along - s);

        return surface + (height - surface) * smoothstep(0, ROAD.shoulder, best.off);
    }

    // A pad's height: the land's under it, on average (sampled on a grid across it)
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

            this.levels.set(pad.id, round(sum / n));
        }

        return this.levels.get(pad.id);
    }

    /** The height a pad is levelled to (metres). */
    levelOf(pad) {
        return this.#level(pad);
    }

    // A point's height with the pads near it levelled in
    #onPads(pads, x, y, height) {
        for (const pad of pads) {
            const off = pad.at ? hypot(x - pad.at[0], y - pad.at[1]) - pad.radius : hypot(Math.max(pad.x0 - x, 0, x - pad.x1), Math.max(pad.y0 - y, 0, y - pad.y1));

            if (off < PAD_EASE) {
                const level = this.#level(pad);

                height = level + (height - level) * smoothstep(0, PAD_EASE, off);
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

        return between(this.chunk(cx, cy).heights, x - cx * CHUNK, y - cy * CHUNK);
    }

    /** A square's slope class (height.js SLOPE_CLASS). */
    slopeAt(x, y) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

        return this.chunk(cx, cy).slopes[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)] ?? SLOPE_CLASS.open;
    }
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
