// The land's own features, so the world between the settlements isn't one lawn: boulders, rocky
// outcrops, trees long fallen and gone silver, old stumps, dead trees still standing, bushes, a
// cairn or a standing stone, termite mounds on the savannah, haystacks and scarecrows in the
// fields, a stretch of ruined wall, and, rarely, the ribs of some great beast bleaching in the
// badlands. Each kind of land has its own (LANDS: how many to a chunk, and of which kinds), and
// they gather as they would: boulders where the land is rocky, fallen wood where it's been let go
// (smooth noise fields across the world, the same for every chunk, so they carry on across the
// chunks' edges). A boulder lies among a few smaller stones (CLUSTER), strung out along the way
// the rock runs there (its strike: slow noise, so a stretch's stones all lie one way).
//
// A chunk's features are tried on a grid (FEATURE_GRID metres, a random way in), from the chunk's
// own random numbers, the same every time it's made. Each takes the squares under it (`squares`),
// and hides what's behind it if it's taller than anyone's eyes (`opaque`); it's kept clear of
// roads, water and bridges, of the trees, the town, the settlements' streets and buildings and the
// places still to come (sites and camps), and a couple of squares inside its chunk (so it never
// meets the next chunk's trees). The grass, flowers, pebbles and sticks between them are the
// drawing's alone (world/art/kits/wilds.js): they're in no one's way. Pure data, no DOM.

import { fractal } from "./noise.js";
import { cos, hypot, sin, TAU } from "./exact.js";
import { createRandom } from "./random.js";

/** Features are tried every this many metres (a random way in). */
export const FEATURE_GRID = 8;

/** How far (squares) a feature keeps inside its chunk's edges. */
const EDGE = 3;

/** How far (squares) a feature keeps from roads, bridges and water. */
const CLEAR = 2;

/** Taller than this (metres), a feature hides what's behind it. */
const EYES = 1.65;

/**
 * A boulder's cluster (the research report behind M7b: one dominant stone, the rest smaller):
 * how many smaller stones round it (as rocky as the land is, more), how big (to the boulder's
 * size), how far from it beyond its own size (metres), how far they stray across its strike (to
 * how far along it), how far the boulders and stones turn from the strike (radians, either way),
 * and how slow the strike's noise is (metres).
 */
export const CLUSTER = Object.freeze({ stones: [1, 5], size: [0.25, 0.55], reach: [1.2, 4.5], across: 0.35, turn: 0.25, strike: 400 });

/**
 * Each land's features: about how many to a chunk (64 metres square: before those that can't be
 * placed), and how likely each kind is. Kinds a rocky stretch favours and kinds let-go land
 * favours are ROCKY and DEAD.
 */
export const LANDS = Object.freeze({
    sea: { count: 0, kinds: {} },
    lake: { count: 0, kinds: {} },
    beach: { count: 2, kinds: { log: 3, boulder: 2, outcrop: 1 } },
    farmland: { count: 3, kinds: { haystack: 4, scarecrow: 1, bush: 3, boulder: 1, stump: 1, logpile: 1 } },
    meadow: { count: 4, kinds: { boulder: 4, bush: 4, stump: 2, log: 1, cairn: 0.4, menhir: 0.3, ruin: 0.3 } },
    woods: { count: 7, kinds: { log: 4, stump: 4, boulder: 2, bush: 3, snag: 1, logpile: 0.4 } },
    heath: { count: 6, kinds: { boulder: 4, bush: 4, outcrop: 1, cairn: 0.8, menhir: 0.6, snag: 1 } },
    marsh: { count: 5, kinds: { snag: 4, stump: 3, log: 3, bush: 1 } },
    elfwood: { count: 6, kinds: { boulder: 3, log: 2, stump: 2, bush: 3, menhir: 1 } },
    darkwood: { count: 8, kinds: { log: 5, snag: 3, stump: 3, boulder: 3 } },
    savannah: { count: 4, kinds: { mound: 5, bush: 3, boulder: 2, log: 1, ribs: 0.2 } },
    jungle: { count: 7, kinds: { log: 4, bush: 5, boulder: 2, stump: 2 } },
    badlands: { count: 6, kinds: { boulder: 5, outcrop: 3, snag: 1, ribs: 0.5, ruin: 0.3 } },
    volcanic: { count: 6, kinds: { boulder: 5, outcrop: 4, snag: 1 } },
    tundra: { count: 5, kinds: { boulder: 5, outcrop: 1, cairn: 1, snag: 1, bush: 1 } },
    snow: { count: 4, kinds: { boulder: 5, outcrop: 2, cairn: 0.5 } },
    mountain: { count: 9, kinds: { outcrop: 5, boulder: 5, cairn: 0.5, snag: 0.5 } },
});

/**
 * Each people's homeland's own features, mixed with its lands' (where the plan's territory is
 * theirs): about how many more to a chunk, and how likely each kind is. The cat folk's termite
 * spires and granite kopjes; the orcs' skulls on poles, clusters of stakes and the wrack of old
 * fights; the lizard folk's mangroves and carved stelae; the elves' moonstones and leaf lamps; the
 * dark elves' webbed stumps, cocoons and black crystal.
 */
export const HOMELANDS = Object.freeze({
    cat: { count: 4, kinds: { termites: 5, kopje: 3 } },
    orc: { count: 4, kinds: { skullpole: 3, stakes: 3, wrack: 2 } },
    lizard: { count: 4, kinds: { mangrove: 4, stela: 1.5 } },
    elf: { count: 3, kinds: { moonstone: 2, leaflamp: 3 } },
    darkElf: { count: 5, kinds: { webstump: 3, cocoon: 2, crystals: 3 } },
});

/** The kinds a rocky stretch has more of, and those land let go has more of. */
export const ROCKY = Object.freeze(["boulder", "outcrop", "cairn", "menhir"]);
export const DEAD = Object.freeze(["log", "stump", "snag", "logpile"]);

/**
 * Each kind: its size (metres: a boulder's or bush's radius, a log's or wall's length, a mound's
 * or stump's radius), its height to its size, whether it runs along its length (`long`: its
 * squares a line), how much of its footprint it takes (to its size), and whether it stands in
 * ploughed fields as well as on grass (`fields`).
 */
export const FEATURES = Object.freeze({
    boulder: { size: [0.7, 1.5], height: [0.8, 1.4], take: 0.8 },
    // (A boulder's smaller stones: CLUSTER's share of a boulder's size)
    stone: { size: [0.7 * CLUSTER.size[0], 1.5 * CLUSTER.size[1]], height: [0.6, 1.1], take: 0.7 },
    outcrop: { size: [1.8, 3.2], height: [0.5, 0.9], take: 0.7 },
    log: { size: [5, 9], height: [0.1, 0.13], long: true, take: 0.5 },
    stump: { size: [0.45, 0.8], height: [0.8, 1.3], take: 0.9 },
    snag: { size: [0.25, 0.4], height: [12, 18], take: 1 },
    bush: { size: [0.6, 1.2], height: [1, 1.3], take: 0.75 },
    cairn: { size: [0.5, 0.7], height: [1.6, 2.2], take: 1 },
    menhir: { size: [0.5, 0.8], height: [3, 4.2], take: 1 },
    mound: { size: [0.7, 1.2], height: [1.8, 2.8], take: 0.9 },
    haystack: { size: [1.2, 1.6], height: [1.4, 1.8], take: 0.85, fields: true },
    scarecrow: { size: [0.4, 0.5], height: [3.6, 4.4], take: 1, fields: true },
    logpile: { size: [1.6, 2.4], height: [0.35, 0.45], long: true, take: 0.6 },
    ruin: { size: [3, 5.5], height: [0.25, 0.45], long: true, take: 0.5 },
    ribs: { size: [5, 7], height: [0.5, 0.7], long: true, take: 1 },
    // The peoples' homelands' own (HOMELANDS)
    termites: { size: [0.5, 0.9], height: [2.5, 4], take: 0.9 },
    kopje: { size: [1.4, 2.6], height: [0.6, 1], take: 0.8 },
    skullpole: { size: [0.2, 0.3], height: [8, 11], take: 1 },
    stakes: { size: [0.6, 0.9], height: [1.2, 1.6], take: 0.9 },
    wrack: { size: [0.7, 1], height: [0.45, 0.65], take: 0.8 },
    mangrove: { size: [0.8, 1.3], height: [1.6, 2.4], take: 0.8 },
    stela: { size: [0.35, 0.45], height: [4.5, 6], take: 1 },
    moonstone: { size: [0.4, 0.55], height: [4.5, 6], take: 1 },
    leaflamp: { size: [0.3, 0.4], height: [6, 7.5], take: 1 },
    webstump: { size: [0.5, 0.8], height: [1.5, 2], take: 0.9 },
    cocoon: { size: [0.5, 0.7], height: [0.6, 0.8], take: 0.8 },
    crystals: { size: [0.5, 0.9], height: [2, 3], take: 0.9 },
});

// The kinds that don't hide what's behind them, however tall (poles, lamps, stakes)
const SEE_THROUGH = new Set(["scarecrow", "ribs", "skullpole", "leaflamp", "stakes"]);

// A land's features, and a homeland's mixed in where there's one
const mixed = new Map();

function featuresFor(land, home) {
    if (!home) {
        return LANDS[land];
    }

    const key = `${land}:${home}`;

    if (!mixed.has(key)) {
        const own = LANDS[land] ?? { count: 0, kinds: {} };
        const theirs = HOMELANDS[home];

        // (A few more than the land's alone, about half of them theirs)
        mixed.set(key, own.count ? { count: Math.max(own.count, (own.count + theirs.count) * 0.75), kinds: { ...scaled(own.kinds, own.count), ...scaled(theirs.kinds, theirs.count) } } : own);
    }

    return mixed.get(key);
}

// Weights scaled to add up to `total`
function scaled(kinds, total) {
    const sum = Object.values(kinds).reduce((a, b) => a + b, 0);

    return Object.fromEntries(Object.entries(kinds).map(([kind, weight]) => [kind, (weight / sum) * total]));
}

// A smoothstep from a to b
const ease = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

/** How rocky the land is at a point (0 to 1: a smooth field across the world, from its seed). */
export function rockiness(x, y, seed) {
    return ease(0.38, 0.72, fractal(x, y, 110, seed * 31 + 1));
}

/** How much the land's been let go at a point (fallen wood, stumps: 0 to 1). */
export function neglect(x, y, seed) {
    return ease(0.4, 0.7, fractal(x, y, 140, seed * 31 + 2));
}

/** Which way the rock runs at a point (its strike: radians, a smooth field across the world). */
export function strikeAt(x, y, seed) {
    return fractal(x, y, CLUSTER.strike, seed * 31 + 4, 2) * TAU;
}

/**
 * A chunk's features: [{ kind, x, y (its middle, metres), size, height, turn (radians), variant
 * (0 to 1: which of its looks), squares ([x, y]: those it takes), opaque }]. `random` is the
 * chunk's own (features' only: the same numbers every time), `landAt(x, y)` the land's id,
 * `homeAt(x, y)` whose homeland it is (a people's id, or null: HOMELANDS' mixed in), and
 * `free(x, y, fields)` whether a square (the chunk's or not) can have a feature on it and near it:
 * grass (or ploughed, if `fields`), in no field's strips (but if `fields`), not blocked, not a road,
 * bridge or water, in no settlement or clearing.
 */
export function featuresOf({ x0, y0, size, seed, random, landAt, homeAt = () => null, free }) {
    const features = [];
    const taken = new Set();
    const steps = size / FEATURE_GRID;

    for (let gy = 0; gy < steps; gy++) {
        for (let gx = 0; gx < steps; gx++) {
            // (Every try takes the same random numbers, placed or not, so what's placed stays the
            // same whatever's round it)
            const [fx, fy, chance, pick, grow, tall, turn, variant] = Array.from({ length: 8 }, () => random.next());
            const [x, y] = [x0 + (gx + fx) * FEATURE_GRID, y0 + (gy + fy) * FEATURE_GRID];
            const home = homeAt(Math.floor(x), Math.floor(y));
            const land = featuresFor(landAt(Math.floor(x), Math.floor(y)), HOMELANDS[home] ? home : null);

            if (!land?.count) {
                continue;
            }

            const [rocky, dead] = [rockiness(x, y, seed), neglect(x, y, seed)];
            const odds = (land.count / (steps * steps)) * (0.35 + 0.8 * Math.max(rocky, dead) + 0.25 * (rocky + dead));

            if (chance >= odds) {
                continue;
            }

            const kind = pickKind(land.kinds, pick, rocky, dead);
            const spec = FEATURES[kind];
            const feature = {
                kind,
                x,
                y,
                size: spec.size[0] + (spec.size[1] - spec.size[0]) * grow * (ROCKY.includes(kind) ? 0.6 + 0.4 * rocky : 1),
                turn: turn * Math.PI * 2,
                variant,
            };

            // (A boulder lies along the way the rock runs there, give or take)
            if (kind === "boulder") {
                feature.turn = strikeAt(x, y, seed) + (turn - 0.5) * 2 * CLUSTER.turn;
            }

            feature.height = feature.size * (spec.height[0] + (spec.height[1] - spec.height[0]) * tall);
            feature.squares = squaresOf(feature, spec);
            feature.opaque = feature.height > EYES && !SEE_THROUGH.has(kind);

            if (fits(feature, spec)) {
                features.push(feature);

                if (kind === "boulder") {
                    features.push(...clusterOf(feature, rocky, seed).filter((stone) => fits(stone, FEATURES.stone)));
                }
            }
        }
    }

    return features;

    // Whether a feature fits where it is (inside the chunk, clear of the rest and of what's not
    // free), taking its squares (and a square round them) if it does
    function fits(feature, spec) {
        if (!feature.squares.every(([sx, sy]) => sx >= x0 + EDGE && sy >= y0 + EDGE && sx < x0 + size - EDGE && sy < y0 + size - EDGE && !taken.has(`${sx},${sy}`)) || !clear(feature.squares, (cx, cy) => free(cx, cy, spec.fields))) {
            return false;
        }

        for (const [sx, sy] of feature.squares) {
            // (Kept a square apart from each other)
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    taken.add(`${sx + dx},${sy + dy}`);
                }
            }
        }

        return true;
    }
}

/**
 * The smaller stones round a boulder (CLUSTER): strung out along its strike, either side of it,
 * from its own random numbers (from where it lies: so the chunk's other features stay as they
 * were), as many more as the land is rocky.
 */
export function clusterOf(boulder, rocky, seed) {
    const random = createRandom((Math.imul(Math.floor(boulder.x * 16), 73856093) ^ Math.imul(Math.floor(boulder.y * 16), 19349663) ^ Math.imul(seed + 5, 83492791)) >>> 0);
    const count = CLUSTER.stones[0] + Math.floor(random.next() * (CLUSTER.stones[1] - CLUSTER.stones[0] + 1) * (0.4 + 0.6 * rocky));
    const [ax, ay] = [cos(boulder.turn), sin(boulder.turn)];
    const stones = [];

    for (let k = 0; k < count; k++) {
        const [side, far, off, grow, tall, turn, variant] = Array.from({ length: 7 }, () => random.next());
        const along = (side < 0.5 ? -1 : 1) * (boulder.size + CLUSTER.reach[0] + (CLUSTER.reach[1] - CLUSTER.reach[0]) * far);
        const across = (off - 0.5) * 2 * CLUSTER.across * along;
        const stone = {
            kind: "stone",
            x: boulder.x + ax * along - ay * across,
            y: boulder.y + ay * along + ax * across,
            size: boulder.size * (CLUSTER.size[0] + (CLUSTER.size[1] - CLUSTER.size[0]) * grow),
            turn: boulder.turn + (turn - 0.5) * 2 * CLUSTER.turn,
            variant,
        };

        stone.height = stone.size * (FEATURES.stone.height[0] + (FEATURES.stone.height[1] - FEATURES.stone.height[0]) * tall);
        stone.squares = squaresOf(stone, FEATURES.stone);
        stone.opaque = false;
        stones.push(stone);
    }

    return stones;
}

// Which kind, of a land's (their weights, the rocky kinds more likely where it's rocky and the
// let-go kinds where it's been let go)
function pickKind(kinds, pick, rocky, dead) {
    const weighted = Object.entries(kinds).map(([kind, weight]) => [kind, weight * (ROCKY.includes(kind) ? 0.5 + 1.5 * rocky : 1) * (DEAD.includes(kind) ? 0.5 + 1.5 * dead : 1)]);
    const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
    let left = pick * total;

    for (const [kind, weight] of weighted) {
        left -= weight;

        if (left < 0) {
            return kind;
        }
    }

    return weighted.at(-1)[0];
}

// The squares a feature takes: those whose middles are within its footprint (a disc, or for a
// long one a strip along its length), at least the one it stands on
function squaresOf({ x, y, size, turn }, { long, take }) {
    const squares = new Map();
    const add = (sx, sy) => squares.set(`${sx},${sy}`, [sx, sy]);

    add(Math.floor(x), Math.floor(y));

    if (long) {
        const [ax, ay] = [cos(turn), sin(turn)];
        const half = (size / 2) * take + 0.5;

        for (let t = -half; t <= half; t += 0.5) {
            add(Math.floor(x + ax * t), Math.floor(y + ay * t));
        }
    } else {
        const reach = size * take;

        for (let sy = Math.floor(y - reach); sy <= Math.floor(y + reach); sy++) {
            for (let sx = Math.floor(x - reach); sx <= Math.floor(x + reach); sx++) {
                if (hypot(sx + 0.5 - x, sy + 0.5 - y) <= reach) {
                    add(sx, sy);
                }
            }
        }
    }

    return [...squares.values()];
}

// Whether every square a feature takes, and every square CLEAR round them, is free
function clear(squares, free) {
    const checked = new Set();

    for (const [sx, sy] of squares) {
        for (let dy = -CLEAR; dy <= CLEAR; dy++) {
            for (let dx = -CLEAR; dx <= CLEAR; dx++) {
                const key = `${sx + dx},${sy + dy}`;

                if (!checked.has(key)) {
                    checked.add(key);

                    if (!free(sx + dx, sy + dy)) {
                        return false;
                    }
                }
            }
        }
    }

    return true;
}
