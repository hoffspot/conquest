// The sites the world plan puts in each people's lands, built where they stand: each people's
// castle and its own special places (the cat folk's sun temple, pride rock and watering hole, the
// orcs' war totem, skull pit and fighting pit, the elves' moonwell...), the humans' castle, abbey,
// windmill and manor, and every people's watchtowers. Each is set down clear of the roads and the
// water, facing the nearest road, and stands on its squares (no one walks through it). What's
// drawn of each is a piece, as a settlement's are (settlements.js), in its people's style (world/
// art/peoples).
//
// Pure data, no DOM; the same for the same plan.

import { GOD_IDS } from "./lore/gods.js";
import { layoutCastle } from "./setpieces/castle.js";
import { footprint } from "./setpieces/town.js";
import { LANDMARKS, PEOPLE_PLACES, PLOT, pieceCatalog, towerKey } from "./setpieces/pieces.js";
import { CELLS, CHUNK, CHUNKS, WORLD_SIZE } from "./worldplan/plan.js";
import { atan2, cos, hypot, sin } from "./exact.js";
import { heightAt } from "./terrain/height.js";

// The humans' own (plots across and deep): their castle, laid out by castle.js, and the rest as
// their landmarks are built
const HUMAN_PLACES = Object.freeze({ castle: [18, 16], abbey: LANDMARKS.church, windmill: LANDMARKS.windmill, manor: LANDMARKS.keep });
const HUMAN_LANDMARK = Object.freeze({ abbey: "church", windmill: "windmill", manor: "keep" });

// A watchtower, anyone's: two plots square
const WATCHTOWER = [2, 2];

// How far a site may be moved off its cell's middle to stand clear of the roads and the water
// (metres), in steps of
const SHIFT = 48;
const SHIFT_STEP = 4;

// How far round a site trees and the land's features keep clear of it (metres)
export const SITE_MARGIN = 6;

/**
 * Where some sites would rather stand, of the spots they may: on the highest ground round about
 * (each people's castle, watching over its lands; the dark elves' spire and the elves' starwatch;
 * the cat folk's pride rock; the watchtowers) or the lowest (the cat folk's watering hole, the
 * lizard folk's serpent pool, the elves' moonwell), the land's own height looked at (height.js);
 * and how far their ground's raised on a mound above the land's (or sunk into it), metres.
 */
export const LIE = Object.freeze({
    castle: { lie: "high", raise: 4 },
    "obsidian spire": { lie: "high", raise: 5 },
    starwatch: { lie: "high", raise: 3 },
    "pride rock": { lie: "high", raise: 4 },
    watchtower: { lie: "high", raise: 2 },
    "watering hole": { lie: "low", raise: -1.5 },
    "serpent pool": { lie: "low", raise: -1.2 },
    moonwell: { lie: "low", raise: -0.8 },
});

/**
 * Lie: how far a site that would rather lie high or low may be moved off its cell's middle to
 * (metres); how far apart the spots tried are, and the land's looked at on a lattice how far
 * apart (metres); how far round a spot its land's looked at to see how it lies (metres past its
 * own reach); and how far its land may rise or fall across it (metres), at most, for it to stand
 * there (or its pad would stand out of the land, or into it).
 */
const LYING = Object.freeze({ shift: 64, step: 16, lattice: 8, round: 24, across: 6 });

const TAU = Math.PI * 2;
const catalog = new Map(pieceCatalog().map((piece) => [piece.key, piece]));

/** The size (plots across and deep) of what's built at a site, or null if nothing is. */
export function siteSize(site) {
    if (site.kind === "watchtower" && site.race) {
        return WATCHTOWER;
    }

    if (site.race === "human") {
        return HUMAN_PLACES[site.kind] ?? null;
    }

    return PEOPLE_PLACES[site.race]?.[site.kind] ?? null;
}

/**
 * The sites that are built, each set down in the world the first time a chunk near it's made
 * (`settle`), as the settlements are laid out: { site, x, y (its middle, metres), facing, w, h
 * (plots), pieces ([{ ...piece, x, y (metres, in the world), site (its id) }]), squares (Set of
 * `y * WORLD_SIZE + x` it stands on), radius (how far it reaches from its middle, metres) }.
 * `landAt(x, y)` is the land a square is ({ road, water }: overworld.js's). Each site's clearing
 * (`clearings`: { at, radius }, where trees and the land's features keep off) moves to where it's
 * set down and grows to its size.
 */
export class Sites {
    constructor(plan, { landAt, clearing = 12 }) {
        this.plan = plan;
        this.landAt = landAt;
        this.set = new Map();
        this.near = new Map();
        this.byChunk = new Map();
        this.bySquare = new Set();
        this.clearings = new Map();

        for (const site of plan.sites) {
            const size = siteSize(site);

            this.clearings.set(site.id, { at: site.at, radius: clearing });

            if (!size) {
                continue;
            }

            // (Near every chunk it could reach, moved as far as it may be)
            const reach = (LIE[site.kind] ? LYING.shift : SHIFT) + hypot(size[0], size[1]) * (PLOT / 2) + SITE_MARGIN;

            for (let cy = Math.floor((site.at[1] - reach) / CHUNK); cy <= Math.floor((site.at[1] + reach) / CHUNK); cy++) {
                for (let cx = Math.floor((site.at[0] - reach) / CHUNK); cx <= Math.floor((site.at[0] + reach) / CHUNK); cx++) {
                    if (cx >= 0 && cy >= 0 && cx < CHUNKS && cy < CHUNKS) {
                        const chunk = cy * CHUNKS + cx;

                        this.near.set(chunk, [...(this.near.get(chunk) ?? []), site]);
                    }
                }
            }
        }
    }

    /** Set down every site near a chunk (before making it). */
    settle(cx, cy) {
        for (const site of this.near.get(cy * CHUNKS + cx) ?? []) {
            if (this.set.has(site.id)) {
                continue;
            }

            const set = this.#setDown(site, siteSize(site));

            this.set.set(site.id, set);

            if (!set) {
                continue;
            }

            for (const square of set.squares) {
                this.bySquare.add(square);
            }

            const chunk = Math.floor(set.y / CHUNK) * CHUNKS + Math.floor(set.x / CHUNK);

            this.byChunk.set(chunk, [...(this.byChunk.get(chunk) ?? []), set]);
            Object.assign(this.clearings.get(site.id), { at: [set.x, set.y], radius: set.radius + SITE_MARGIN });
        }
    }

    /** What a site has on a square (metres): { blocked, opaque }, or null. */
    squareAt(x, y) {
        return this.bySquare.has(y * WORLD_SIZE + x) ? { blocked: 1, opaque: 1 } : null;
    }

    /** The pieces of the sites whose middles are in a chunk, in the world's metres (settled). */
    piecesIn(cx, cy) {
        return (this.byChunk.get(cy * CHUNKS + cx) ?? []).flatMap(({ pieces }) => pieces);
    }

    // Where a site is built: its cell's middle, or near it, clear of roads and water, facing the
    // nearest road (the spot that lies best first, for those that would rather stand high or
    // low: LIE); or null if there's nowhere
    #setDown(site, [w, h], lie = LIE[site.kind]?.lie) {
        const facing = this.#facing(site);
        const size = WORLD_SIZE;
        // (Its land looked at every other square: no road or stream is narrower; each square
        // looked at once, however many of the tries it's under)
        const looked = new Map();
        const clear = (i, j) => {
            if (i < 0 || j < 0 || i >= size || j >= size) {
                return false;
            }

            if (i % 2 || j % 2) {
                return true;
            }

            const k = j * size + i;

            if (!looked.has(k)) {
                const land = this.landAt(i, j);

                looked.set(k, !land.road && !land.water);
            }

            return looked.get(k);
        };
        // (The squares that weren't clear under earlier tries: most tries overlap the last, so
        // one of these is under most of those that fail, and looked for first)
        const unclear = [];
        const tries = lie ? this.#lying(site, [w, h], lie) : rings(site.at);

        for (const [x, y] of tries) {
            const corners = footprint({ x, y, w, h, facing });

            if (unclear.some(([i, j]) => within(corners, i + 0.5, j + 0.5))) {
                continue;
            }

            const found = firstInside(corners, (i, j) => !clear(i, j));

            if (found) {
                unclear.push(found);
                continue;
            }

            const squares = inside(corners);

            return {
                site,
                x,
                y,
                facing,
                w,
                h,
                pieces: this.#pieces(site, x, y, facing, [w, h]),
                squares: new Set(squares.map(([i, j]) => j * size + i)),
                radius: hypot(w, h) * (PLOT / 2),
            };
        }

        // (None that lies well clear: wherever's clear, as for any other)
        return lie ? this.#setDown(site, [w, h], null) : null;
    }

    // The spots a site that would rather lie high or low may stand (LIE), best first: LYING.step
    // apart within LYING.shift of its cell's middle, each as high (or low) as it stands over the
    // land LYING.round past its reach, and none whose land rises or falls more than LYING.across
    // over its own reach (then the nearest its cell's middle, then the first). The land's looked
    // at on a lattice LYING.lattice apart, each point once.
    #lying(site, [w, h], lie) {
        const reach = hypot(w, h) * (PLOT / 2);
        const heights = new Map();
        const { lattice } = LYING;
        const land = (x, y) => {
            const [i, j] = [Math.round(x / lattice), Math.round(y / lattice)];
            const key = j * 4096 + i;

            if (!heights.has(key)) {
                heights.set(key, heightAt(this.plan, Math.min(WORLD_SIZE - 1, Math.max(0, i * lattice)), Math.min(WORLD_SIZE - 1, Math.max(0, j * lattice))));
            }

            return heights.get(key);
        };
        // (Eight ways round, as far out as asked)
        const round = (x, y, far) => [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]].map(([dx, dy]) => land(x + (dx && dy ? dx * far * 0.7071 : dx * far), y + (dx && dy ? dy * far * 0.7071 : dy * far)));
        const spots = [];
        const n = Math.floor(LYING.shift / LYING.step);

        for (let j = -n; j <= n; j++) {
            for (let i = -n; i <= n; i++) {
                if (i * i + j * j > n * n) {
                    continue;
                }

                const [x, y] = [Math.round(site.at[0] + i * LYING.step), Math.round(site.at[1] + j * LYING.step)];
                const middle = land(x, y);
                const across = round(x, y, reach);

                if (across.some((height) => Math.abs(height - middle) > LYING.across)) {
                    continue;
                }

                const out = round(x, y, reach + LYING.round);
                const above = middle - out.reduce((sum, height) => sum + height, 0) / out.length;

                spots.push({ at: [x, y], score: lie === "high" ? above : -above, far: i * i + j * j, k: spots.length });
            }
        }

        return spots.sort((a, b) => b.score - a.score || a.far - b.far || a.k - b.k).map(({ at }) => at);
    }

    // Which way a site faces: towards the nearest road within a few cells (radians, as
    // characters face: 0 south), or south
    #facing(site) {
        const [cx, cy] = site.cell;
        let best = null;

        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
                const [x, y] = [cx + dx, cy + dy];

                if ((dx || dy) && x >= 0 && y >= 0 && x < CELLS && y < CELLS && this.plan.road[y * CELLS + x] && (!best || dx * dx + dy * dy < best.d)) {
                    best = { d: dx * dx + dy * dy, dx, dy };
                }
            }
        }

        return best ? atan2(best.dx, best.dy) : 0;
    }

    // What's built at a site: one piece of its people's (a special place, a castle, a watchtower),
    // or the humans' castle as castle.js lays it out, or one of their landmarks
    #pieces(site, x, y, facing, [w, h]) {
        const own = { site: site.id, seed: site.seed, facing };

        if (site.kind === "watchtower") {
            return [site.race === "human" ? { ...catalog.get(towerKey("round", "roof")), ...own, key: towerKey("round", "roof"), x, y, w, h } : { kind: "tower", people: site.race, key: `tower-${site.race}`, ...own, x, y, w, h }];
        }

        if (site.race !== "human") {
            return [{ kind: "structure", people: site.race, name: site.kind, key: `structure-${site.race}-${site.kind}`, ...own, x, y, w, h }];
        }

        if (site.kind !== "castle") {
            const name = HUMAN_LANDMARK[site.kind];

            return [{ kind: "landmark", name, key: `landmark-${name}`, ...own, x, y, w, h, style: "stone", storeys: 2, patron: GOD_IDS[site.seed % GOD_IDS.length] }];
        }

        // (The humans' castle: laid out facing south, its gate to the road, then turned)
        const castle = layoutCastle({ width: w, height: h, gate: "s", seed: site.seed });
        const [c, s] = [cos(facing), sin(facing)];

        return castle.pieces.map((piece) => {
            const spec = catalog.get(piece.key);
            const [u, v] = [(piece.x + piece.w / 2 - w / 2) * PLOT, (piece.y + piece.h / 2 - h / 2) * PLOT];

            return { ...spec, ...piece, ...own, x: x + u * c + v * s, y: y - u * s + v * c };
        });
    }
}

// The spots a site may be moved to, nearest its cell's middle first: on rings SHIFT_STEP apart,
// out to SHIFT
function* rings(at) {
    for (let r = 0; r <= SHIFT; r += SHIFT_STEP) {
        const tries = r === 0 ? 1 : Math.round((TAU * r) / SHIFT_STEP);

        for (let k = 0; k < tries; k++) {
            const a = (k / tries) * TAU;

            yield [Math.round(at[0] + cos(a) * r), Math.round(at[1] + sin(a) * r)];
        }
    }
}

// The squares whose middles are inside a turned rectangle's corners ([[x, y] x4]): [[i, j]]
function inside(corners) {
    const squares = [];

    eachInside(corners, (i, j) => {
        squares.push([i, j]);
    });

    return squares;
}

// The first square whose middle is inside a turned rectangle's corners (as inside's) for which
// test(i, j) holds: [i, j], or null
function firstInside(corners, test) {
    let found = null;

    eachInside(corners, (i, j) => {
        if (test(i, j)) {
            found = [i, j];

            return false;
        }

        return true;
    });

    return found;
}

// Visit(i, j) each square whose middle is inside a polygon's corners, a row at a time; stops, and
// returns false, as soon as a visit returns false. (A middle is inside if it's left of an odd
// number of the places the polygon's sides cross its row: found once a row, not for every square)
function eachInside(corners, visit) {
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const [i0, i1] = [Math.floor(Math.min(...xs)), Math.ceil(Math.max(...xs))];

    for (let j = Math.floor(Math.min(...ys)); j < Math.ceil(Math.max(...ys)); j++) {
        const crossings = crossingsAt(corners, j + 0.5);

        for (let i = i0; i < i1; i++) {
            const px = i + 0.5;
            let left = 0;

            for (const x of crossings) {
                if (px < x) {
                    left++;
                }
            }

            if (left % 2 === 1 && visit(i, j) === false) {
                return false;
            }
        }
    }

    return true;
}

// Whether a point is inside a polygon's corners (as eachInside has it)
function within(corners, px, py) {
    let left = 0;

    for (const x of crossingsAt(corners, py)) {
        if (px < x) {
            left++;
        }
    }

    return left % 2 === 1;
}

// Where a polygon's sides cross a row (py): their x
function crossingsAt(corners, py) {
    const crossings = [];

    for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
        const [ax, ay] = corners[k];
        const [bx, by] = corners[last];

        if (ay > py !== by > py) {
            crossings.push(((bx - ax) * (py - ay)) / (by - ay) + ax);
        }
    }

    return crossings;
}
