// Broken aqueducts (the terrain plan's M7i-3, §9 row 7 "broken aqueducts"; §9's humans: "ruined
// villages; hill citadels; broken aqueducts"): a row of stone piers striding across a dip in the
// human lands, arches between them carrying a channel that no water's run in for an age, broken
// where piers have fallen and arches with them. Up to a few in each stretch of the humans' land,
// more the bigger it is; each a straight line across ground lower in its middle than at its ends
// (a valley it was built to cross), clear of roads, water, the settlements and the places, far from
// any other and from the arches of rock. Its piers take their squares (walked round, and seen past
// only between them); under its arches is open, walked through; a pier that's fallen leaves only
// rubble, walked over.
//
// Worked out once a world (aqueductsOf), from the plan alone. Exact maths only (it's in core: what's
// blocked is the rules').

import { archesOf } from "./arches.js";
import { cos, hypot, sin, TAU } from "./exact.js";
import { hashOf } from "./noise.js";
import { createRandom } from "./random.js";
import { landHeight } from "./terrain/height.js";
import { CELL, CELLS, CHUNK, RACES, WATER } from "./worldplan/plan.js";

/**
 * The aqueducts: whose land they're in; how many of the plan's cells (32 m a side) a stretch of
 * it has to have for one (about 1 km²), and how many more for each more, up to `most`; how far
 * apart any two are at the least, how far they keep from a settlement's edge, a place or an arch
 * (metres); how far apart their piers stand (metres, each its own) and how many it has; a pier's
 * size (metres along the line and across it); how high its channel runs over the highest ground
 * under it, at the least and the most (metres, each its own), and the tallest a pier may stand;
 * the headings tried from each cell; and how it's broken: a stretch of it kept whole, its piers
 * and arches all standing (`kept`: its share of the piers, at the least and the most, never its
 * ends), save for an arch fallen now and then (`gap`: the chance of one); and beyond it, each pier
 * likely fallen (`fallen`, likelier at its ends by `worn`) or broken (`broken`: standing to `stump`
 * of its height or more), an arch between two whole piers there standing by `spans`.
 */
export const AQUEDUCTS = Object.freeze({
    people: "human",
    least: 1000,
    per: 3000,
    most: 3,
    apart: 900,
    clear: 80,
    spacing: Object.freeze([7.5, 10]),
    piers: Object.freeze([9, 15]),
    pier: Object.freeze([2.2, 2.6]),
    over: Object.freeze([8, 14]),
    tallest: 28,
    headings: 6,
    kept: Object.freeze([0.4, 0.65]),
    gap: 0.3,
    fallen: 0.32,
    worn: 0.3,
    broken: 0.4,
    stump: 0.3,
    spans: 0.5,
});

const made = new WeakMap();

/**
 * A world plan's aqueducts: [{ id, x, y (its first pier's middle, metres), turn (radians: the way
 * along it), spacing (metres between piers), top (the height its channel runs at), variant (0 to 1:
 * its own look), piers: [{ x, y, ground (the land's height there), state ("whole", "broken" or
 * "fallen"), height (how high it stands over its ground: to the channel's foot if whole) }], spans:
 * [whether the arch from each pier to the next stands], kept: [the first pier of the stretch kept
 * whole, and how many] }], the same every time, worked out the first time they're wanted and kept
 * with the plan.
 */
export function aqueductsOf(plan) {
    if (!made.has(plan)) {
        made.set(plan, Object.freeze(placed(plan)));
    }

    return made.get(plan);
}

// Each stretch of the humans' land's aqueducts, the biggest stretches first
function placed(plan) {
    const aqueducts = [];
    const people = RACES.findIndex(({ id }) => id === AQUEDUCTS.people) + 1;
    const arches = archesOf(plan);

    for (const cells of regionsOf(plan, people).sort((a, b) => b.length - a.length || a[0] - b[0])) {
        const wanted = Math.min(AQUEDUCTS.most, 1 + Math.floor((cells.length - AQUEDUCTS.least) / AQUEDUCTS.per));
        let found = 0;

        // (Its cells tried in an order of the world's own)
        const order = cells.map((k) => [hashOf(k % CELLS, Math.floor(k / CELLS), plan.seed * 11 + 1201), k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

        for (const [, k] of order) {
            if (found >= wanted) {
                break;
            }

            const aqueduct = aqueductAt(plan, k, people);

            if (
                aqueduct &&
                aqueducts.every((other) => hypot(other.x - aqueduct.x, other.y - aqueduct.y) >= AQUEDUCTS.apart) &&
                arches.every((arch) => aqueduct.piers.every(({ x, y }) => hypot(arch.x - x, arch.y - y) >= AQUEDUCTS.clear))
            ) {
                aqueducts.push({ ...aqueduct, id: `aqueduct-${aqueducts.length}` });
                found++;
            }
        }
    }

    return aqueducts;
}

// The plan's stretches of a people's land: [[cell index, ...], ...], its cells joined side to side
// (none of them water), big enough for one
function regionsOf(plan, people) {
    const seen = new Uint8Array(CELLS * CELLS);
    const regions = [];

    for (let start = 0; start < CELLS * CELLS; start++) {
        if (seen[start] || plan.territory[start] !== people || plan.water[start] !== WATER.none) {
            continue;
        }

        const cells = [start];

        seen[start] = 1;

        for (let n = 0; n < cells.length; n++) {
            const [i, j] = [cells[n] % CELLS, Math.floor(cells[n] / CELLS)];

            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const [ni, nj] = [i + di, j + dj];
                const k = nj * CELLS + ni;

                if (ni >= 0 && nj >= 0 && ni < CELLS && nj < CELLS && !seen[k] && plan.territory[k] === people && plan.water[k] === WATER.none) {
                    seen[k] = 1;
                    cells.push(k);
                }
            }
        }

        if (cells.length >= AQUEDUCTS.least) {
            regions.push(cells);
        }
    }

    return regions;
}

// An aqueduct from a cell's middle, if one can stand there: of the headings tried, the one across
// the deepest dip (lower in its middle than at its ends) whose every pier's on its people's land,
// no cell under it water or a road's, clear of the settlements and the places; or null
function aqueductAt(plan, k, people) {
    const [i, j] = [k % CELLS, Math.floor(k / CELLS)];
    const [x, y] = [(i + 0.5) * CELL, (j + 0.5) * CELL];
    const own = (n) => hashOf(i, j, plan.seed * 17 + 1303 + n);
    const spacing = AQUEDUCTS.spacing[0] + (AQUEDUCTS.spacing[1] - AQUEDUCTS.spacing[0]) * own(1);
    const count = AQUEDUCTS.piers[0] + Math.floor((AQUEDUCTS.piers[1] - AQUEDUCTS.piers[0] + 1) * own(2));
    let best = null;

    for (let h = 0; h < AQUEDUCTS.headings; h++) {
        const turn = ((h + own(3)) / AQUEDUCTS.headings) * (TAU / 2);
        const [ux, uy] = [cos(turn), sin(turn)];
        const piers = [];
        let fits = true;

        for (let n = 0; n < count && fits; n++) {
            const [px, py] = [x + ux * spacing * n, y + uy * spacing * n];
            const [ci, cj] = [Math.floor(px / CELL), Math.floor(py / CELL)];
            const cell = cj * CELLS + ci;

            fits =
                ci >= 0 &&
                cj >= 0 &&
                ci < CELLS &&
                cj < CELLS &&
                plan.territory[cell] === people &&
                plan.water[cell] === WATER.none &&
                !plan.road[cell] &&
                !plan.places.some(({ at, radius }) => hypot(at[0] - px, at[1] - py) < radius + AQUEDUCTS.clear) &&
                !plan.sites.some(({ at }) => hypot(at[0] - px, at[1] - py) < AQUEDUCTS.clear);
            piers.push({ x: px, y: py, ground: landHeight(plan, px, py) });
        }

        if (!fits) {
            continue;
        }

        // (Across a dip: its ends higher than its lowest; its piers no taller than the tallest)
        const grounds = piers.map(({ ground }) => ground);
        const [high, low] = [Math.max(...grounds), Math.min(...grounds)];
        const dip = Math.min(grounds[0], grounds.at(-1)) - low;

        if (high - low + AQUEDUCTS.over[1] > AQUEDUCTS.tallest || (best && dip <= best.dip)) {
            continue;
        }

        best = { turn, piers, high, dip };
    }

    if (!best) {
        return null;
    }

    const top = best.high + AQUEDUCTS.over[0] + (AQUEDUCTS.over[1] - AQUEDUCTS.over[0]) * own(4);
    const aqueduct = { x, y, turn: best.turn, spacing, top, variant: own(5) };

    return { ...aqueduct, ...fatesOf(aqueduct, best.piers, createRandom(Math.floor(own(6) * 2147483647))) };
}

// What's become of an aqueduct's piers and arches, drawn in turn from its own numbers: a stretch
// kept whole (of piers each inside one chunk, if there's one long enough), and beyond it, its piers
// fallen, broken or whole as they may be, likelier fallen nearer its ends; a pier across a chunk's
// edge fallen whatever (squares are a chunk's own); an arch standing between two whole piers
function fatesOf(aqueduct, grounds, random) {
    const count = grounds.length;
    const length = Math.max(3, Math.min(count - 2, Math.round(count * (AQUEDUCTS.kept[0] + (AQUEDUCTS.kept[1] - AQUEDUCTS.kept[0]) * random.next()))));
    const whole = grounds.map((pier) => inOneChunk(aqueduct, pier));
    let starts = [];

    for (let kept = length; kept >= 3 && !starts.length; kept--) {
        starts = Array.from({ length: count - 1 - kept }, (_, k) => [k + 1, kept]).filter(([start]) => whole.slice(start, start + kept).every(Boolean));
    }

    const [start, kept] = starts.length ? starts[Math.floor(random.next() * starts.length)] : [1, length];
    const inside = (n) => n >= start && n < start + kept;
    const gap = random.next() < AQUEDUCTS.gap ? start + Math.floor(random.next() * (kept - 1)) : -1;
    const piers = grounds.map((pier, n) => {
        const [fate, stands] = [random.next(), random.next()];
        const end = Math.min(n, count - 1 - n);
        const fallen = !whole[n] || (!inside(n) && fate < AQUEDUCTS.fallen + (end === 0 ? AQUEDUCTS.worn : 0));
        const broken = !fallen && !inside(n) && fate < AQUEDUCTS.fallen + AQUEDUCTS.worn + AQUEDUCTS.broken;
        const full = aqueduct.top - pier.ground;

        return { ...pier, state: fallen ? "fallen" : broken ? "broken" : "whole", height: fallen ? 0 : broken ? full * (AQUEDUCTS.stump + (1 - AQUEDUCTS.stump) * stands * 0.8) : full };
    });
    const spans = piers.slice(1).map((pier, n) => {
        const chance = random.next();

        return piers[n].state === "whole" && pier.state === "whole" && (inside(n) && inside(n + 1) ? n !== gap : chance < AQUEDUCTS.spans);
    });

    return { piers, spans, kept: [start, kept] };
}

/** A pier's footprint: its four corners [[x, y], ...] (metres), along its aqueduct and across it. */
export function pierCorners(aqueduct, pier) {
    const [ux, uy] = [cos(aqueduct.turn), sin(aqueduct.turn)];
    const [along, across] = [AQUEDUCTS.pier[0] / 2, AQUEDUCTS.pier[1] / 2];

    return [
        [pier.x - ux * along + uy * across, pier.y - uy * along - ux * across],
        [pier.x + ux * along + uy * across, pier.y + uy * along - ux * across],
        [pier.x + ux * along - uy * across, pier.y + uy * along + ux * across],
        [pier.x - ux * along - uy * across, pier.y - uy * along + ux * across],
    ];
}

/**
 * The squares a standing pier takes: [[x, y], ...] (each square whose middle's in its footprint,
 * or near enough: within a quarter of a square), none for a fallen one.
 */
export function pierSquares(aqueduct, pier) {
    if (pier.state === "fallen") {
        return [];
    }

    const [ux, uy] = [cos(aqueduct.turn), sin(aqueduct.turn)];
    const [along, across] = [AQUEDUCTS.pier[0] / 2 + 0.25, AQUEDUCTS.pier[1] / 2 + 0.25];
    const reach = Math.ceil(hypot(along, across)) + 1;
    const squares = [];

    for (let sy = Math.floor(pier.y) - reach; sy <= Math.floor(pier.y) + reach; sy++) {
        for (let sx = Math.floor(pier.x) - reach; sx <= Math.floor(pier.x) + reach; sx++) {
            const [dx, dy] = [sx + 0.5 - pier.x, sy + 0.5 - pier.y];

            if (Math.abs(dx * ux + dy * uy) <= along && Math.abs(-dx * uy + dy * ux) <= across) {
                squares.push([sx, sy]);
            }
        }
    }

    return squares;
}

/** Whether a pier's footprint's all in one chunk (a pier across a chunk's edge has fallen). */
export function inOneChunk(aqueduct, pier) {
    const squares = pierSquares(aqueduct, { ...pier, state: "whole" });
    const [cx, cy] = [Math.floor(squares[0][0] / CHUNK), Math.floor(squares[0][1] / CHUNK)];

    return squares.every(([x, y]) => Math.floor(x / CHUNK) === cx && Math.floor(y / CHUNK) === cy);
}
