// Natural arches of rock (the terrain plan's M7h-2, §9 "Rock relief: cliffs with strata, boulders
// at their feet, a few arches"; table row 5, "1–3 arches per region"): a band of rock standing
// over open ground, worn through by wind and water, two legs on the ground and nothing under its
// span but air. One to three in each stretch of rocky land (a region: the plan's cells of one
// rocky land joined side to side), more the bigger it is, none in a small one; each on ground
// gentle enough to stand on across its span, well inside its land, clear of roads, water, the
// settlements and the places, and far from any other. Its legs take their squares (they're rock:
// walked round, and seen past only between them); under its span is open, walked through. Each
// stands inside one chunk, so the chunk's made with it whole.
//
// Worked out once a world (archesOf), from the plan alone. Exact maths only (it's in core: what's
// blocked is the rules').

import { cos, hypot, sin, TAU } from "./exact.js";
import { hashOf } from "./noise.js";
import { landHeight } from "./terrain/height.js";
import { BIOMES, CELL, CELLS, CHUNK, WATER } from "./worldplan/plan.js";

/**
 * The arches: the lands they're found in (rocky, bare or high); how many of the plan's cells (32 m
 * a side) a region has to have for one (about 0.6 km²), and how many more for each more, up to
 * `most`; how far apart any two are, at the least, and how far they keep from a settlement's edge
 * or a place (metres); how far their legs' middles are apart and how high the top of the arch's
 * underside stands over the ground (metres, from each one's own numbers); a leg's footprint's
 * radius (metres); and the steepest the land may rise from one foot to the other (rise over run),
 * and the most it may stand above or below a line between them under its span (metres).
 */
export const ARCHES = Object.freeze({
    lands: Object.freeze(["mountain", "badlands", "heath", "savannah", "volcanic", "tundra", "snow", "beach"]),
    least: 600,
    per: 2400,
    most: 3,
    apart: 640,
    clear: 96,
    span: Object.freeze([9, 16]),
    rise: Object.freeze([6, 11]),
    leg: 2.4,
    gentle: 0.3,
    bump: 2,
});

const ROCKY = new Set(ARCHES.lands.map((id) => BIOMES.findIndex((biome) => biome.id === id)));
const made = new WeakMap();

/**
 * A world plan's arches: [{ id, x, y (its middle, metres), turn (radians: the way from one leg to
 * the other), span, rise (metres), land (BIOMES id), variant (0 to 1: its own look) }], the same
 * every time, worked out the first time they're wanted and kept with the plan.
 */
export function archesOf(plan) {
    if (!made.has(plan)) {
        made.set(plan, Object.freeze(placed(plan)));
    }

    return made.get(plan);
}

// Each rocky region's arches, the biggest regions first
function placed(plan) {
    const arches = [];

    for (const region of regionsOf(plan).sort((a, b) => b.cells.length - a.cells.length || a.cells[0] - b.cells[0])) {
        const wanted = Math.min(ARCHES.most, 1 + Math.floor((region.cells.length - ARCHES.least) / ARCHES.per));
        let found = 0;

        // (Its cells tried in an order of the world's own, so where they stand is no pattern)
        const order = region.cells.map((k) => [hashOf(k % CELLS, Math.floor(k / CELLS), plan.seed * 7 + 911), k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

        for (const [, k] of order) {
            if (found >= wanted) {
                break;
            }

            const arch = archAt(plan, k, region.land);

            if (arch && arches.every((other) => hypot(other.x - arch.x, other.y - arch.y) >= ARCHES.apart)) {
                arches.push({ ...arch, id: `arch-${arches.length}` });
                found++;
            }
        }
    }

    return arches;
}

// The plan's rocky regions: [{ land (BIOMES id), cells (indices) }], each its land's cells joined
// side to side (none of them water)
function regionsOf(plan) {
    const seen = new Uint8Array(CELLS * CELLS);
    const regions = [];

    for (let start = 0; start < CELLS * CELLS; start++) {
        if (seen[start] || !ROCKY.has(plan.biome[start]) || plan.water[start] !== WATER.none) {
            continue;
        }

        const biome = plan.biome[start];
        const cells = [start];

        seen[start] = 1;

        for (let n = 0; n < cells.length; n++) {
            const [i, j] = [cells[n] % CELLS, Math.floor(cells[n] / CELLS)];

            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const [ni, nj] = [i + di, j + dj];
                const k = nj * CELLS + ni;

                if (ni >= 0 && nj >= 0 && ni < CELLS && nj < CELLS && !seen[k] && plan.biome[k] === biome && plan.water[k] === WATER.none) {
                    seen[k] = 1;
                    cells.push(k);
                }
            }
        }

        if (cells.length >= ARCHES.least) {
            regions.push({ land: BIOMES[biome].id, cells });
        }
    }

    return regions;
}

// An arch on a cell, if one can stand there: in its middle (inside its chunk), its own way round
// and size, or null
function archAt(plan, k, land) {
    const [i, j] = [k % CELLS, Math.floor(k / CELLS)];
    const [x, y] = [(i + 0.5) * CELL, (j + 0.5) * CELL];

    // (Well inside its land, the cells round it no road nor water)
    for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
            const n = (j + dj) * CELLS + i + di;

            if (i + di < 0 || j + dj < 0 || i + di >= CELLS || j + dj >= CELLS || plan.biome[n] !== plan.biome[k] || plan.water[n] !== WATER.none || plan.road[n]) {
                return null;
            }
        }
    }

    // (Clear of the settlements and the places)
    if (plan.places.some(({ at, radius }) => hypot(at[0] - x, at[1] - y) < radius + ARCHES.clear) || plan.sites.some(({ at }) => hypot(at[0] - x, at[1] - y) < ARCHES.clear)) {
        return null;
    }

    const [turnOf, spanOf, riseOf, variant] = [1, 2, 3, 4].map((n) => hashOf(i, j, plan.seed * 13 + 937 + n));
    const turn = turnOf * TAU;
    const span = ARCHES.span[0] + (ARCHES.span[1] - ARCHES.span[0]) * spanOf;
    const rise = ARCHES.rise[0] + (ARCHES.rise[1] - ARCHES.rise[0]) * riseOf;
    const arch = { x, y, turn, span, rise, land, variant };

    // (Inside its chunk, a couple of squares in, so the chunk's made with all of it)
    const reach = span / 2 + ARCHES.leg + 2;

    if (Math.floor((x - reach) / CHUNK) !== Math.floor((x + reach) / CHUNK) || Math.floor((y - reach) / CHUNK) !== Math.floor((y + reach) / CHUNK)) {
        return null;
    }

    // (On ground gentle enough across its span: its feet not too far apart in height, nor the
    // ground under its span humped or hollowed much off the line between them)
    const [a, b] = feetOf(arch);
    const [ha, hb, hm] = [landHeight(plan, a[0], a[1]), landHeight(plan, b[0], b[1]), landHeight(plan, x, y)];

    if (Math.abs(hb - ha) > ARCHES.gentle * span || Math.abs(hm - (ha + hb) / 2) > ARCHES.bump) {
        return null;
    }

    return arch;
}

/** An arch's feet: [[x, y], [x, y]] (metres: its legs' middles on the ground). */
export function feetOf({ x, y, turn, span }) {
    const [dx, dy] = [(cos(turn) * span) / 2, (sin(turn) * span) / 2];

    return [
        [x - dx, y - dy],
        [x + dx, y + dy],
    ];
}

/** The squares an arch's legs stand on: [[x, y], ...] (each square whose middle's within a leg's footprint). */
export function archSquares(arch) {
    const squares = [];
    const r = ARCHES.leg;

    for (const [fx, fy] of feetOf(arch)) {
        for (let sy = Math.floor(fy - r); sy <= Math.floor(fy + r); sy++) {
            for (let sx = Math.floor(fx - r); sx <= Math.floor(fx + r); sx++) {
                const [dx, dy] = [sx + 0.5 - fx, sy + 0.5 - fy];

                if (dx * dx + dy * dy <= r * r) {
                    squares.push([sx, sy]);
                }
            }
        }
    }

    return squares;
}
