// Each people's fortifications (docs/WAR.md *Fortifications*, M14): guard towers and forward
// garrisons, built from a realm's stores of wood, stone and metal (war.js RESOURCES, filled by its
// works' convoys) and kept up from them a turn at a time. Where a people may build one: anywhere in
// its own first lands, and in another's only near a town it's taken. And where its council would
// build: a tower before each town that faces an enemy and by each works, a forward garrison out
// towards the enemy from the towns on its border; the best of them, scored, for the ruler to build
// as the stores allow, or for a player of rank to counsel (the building screen: app/building.js).
//
// Pure numbers on the plan, as the war is: what's set down in the world is the host's.

import { atan2, cos, hypot, sin } from "../exact.js";
import { landAt } from "../worldplan/plan.js";
import { CELL, CELLS, WATER } from "../worldplan/terrain.js";

/**
 * What each fortification is: what it costs to build (`cost`, of each good) and to keep up each
 * turn (`upkeep`), how strong it stands (`hp`), how near another of its people's of the same kind
 * it may be (`apart`, metres), the most a realm keeps (`most`), how far out from what it guards
 * its council sets it (`out`: metres past a town's edge, or from a works' middle), and how many
 * squares across it stands over in the world (`size`: footprintOf).
 */
export const FORTS = Object.freeze({
    tower: { cost: { wood: 40, stone: 40, metal: 10 }, upkeep: { wood: 0.1, stone: 0.1 }, hp: 1200, apart: 150, most: 8, out: 70, size: 4 },
    garrison: { cost: { wood: 100, stone: 30, metal: 40 }, upkeep: { wood: 0.4, metal: 0.2 }, hp: 2400, apart: 500, most: 3, out: 220, size: 10 },
});

/** The kinds of fortification, in the order the building screen shows them. */
export const FORT_KINDS = Object.freeze(Object.keys(FORTS));

/**
 * Where a people may build (metres): in another people's lands only within `captured` of the edge
 * of a town it took from them; never within `clear` of a settlement's edge or `sites` of a site's
 * middle, nor within `forts` of another fortification; on dry land, off the roads, and no steeper
 * than `steep` (the plan's height between a cell and its neighbours). How far a front reaches
 * (`front`: an enemy town this near is one to face) and a works' threat (`threat`).
 */
export const PLACING = Object.freeze({ captured: 100, clear: 20, sites: 40, forts: 40, steep: 0.06, front: 4000, threat: 2500 });

/**
 * How a realm's council weighs where to build: a town by its size (`town`), a works by what it
 * yields (`works`, a turn's goods times this), a forward garrison over a tower (`garrison`), a
 * player's counsel (`counsel`: times as weighty, by its weight), and how much of its stores a realm
 * keeps back for upkeep (`reserve`: turns of it).
 */
export const COUNCIL = Object.freeze({ town: { capital: 3, city: 2, town: 1.4, village: 0.8, hamlet: 0.5 }, works: 0.25, garrison: 1.3, counsel: 3, reserve: 20 });

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const apart = ([ax, ay], [bx, by]) => hypot(ax - bx, ay - by);

/** How far round the squares a fortification stands over its ground's cleared (metres): no crops, no trees. */
export const CLEARING = 3;

/**
 * The squares a fortification stands over in the world, round its point: [x0, y0, x1, y1]
 * (inclusive), FORTS size across; and `clearing` more each way.
 */
export function footprintOf({ kind, at: [x, y] }, clearing = 0) {
    const half = FORTS[kind].size / 2;

    return [x - half - clearing, y - half - clearing, x + half - 1 + clearing, y + half - 1 + clearing];
}

/** Whether a realm's stores hold what something costs. */
export function affords(stores, cost) {
    return Object.entries(cost).every(([good, amount]) => (stores?.[good] ?? 0) >= amount);
}

// How far a place's ground reaches from its middle (metres): settle.js's radius for its kind
function radiusOf(war, id) {
    return war.plan.places.find((place) => place.id === id)?.radius ?? 0;
}

/**
 * Whether one of `realm`'s people may build a fortification at `at` ([x, y] metres): in its own
 * first lands, or within PLACING.captured of the edge of a town it holds that it took from another
 * people; on dry, level ground off the roads, clear of the settlements, sites and other forts.
 */
export function mayBuild(war, realmId, at) {
    const realm = war.realm(realmId);

    if (!realm?.alive) {
        return false;
    }

    const land = landAt(war.plan, at[0], at[1]);

    if (land.water !== WATER.none || land.road || land.biome === "sea" || steepAt(war.plan, at)) {
        return false;
    }

    const own = land.race === realm.race || war.towns.some((town) => town.owner === realmId && town.race !== realm.race && apart(town.at, at) <= radiusOf(war, town.id) + PLACING.captured);

    return own && clearAt(war, at);
}

// Whether a point's clear of the settlements' ground, the sites and the fortifications
function clearAt(war, at) {
    return keptClearNear(war.plan, at).every(({ at: there, clear }) => apart(there, at) > clear) && (war.forts ?? []).every((fort) => apart(fort.at, at) > PLACING.forts);
}

// What a fortification keeps clear of near a point: the settlements (by their ground) and the
// sites, [{ at, clear (metres) }]; bucketed BUCKET metres square the first time a plan's asked
// about, so that only the buckets round a point are looked at (none keeps clear further)
const BUCKET = 256;
const kept = new WeakMap();

function keptClearNear(plan, [x, y]) {
    let buckets = kept.get(plan);

    if (!buckets) {
        buckets = new Map();

        const put = (at, clear) => {
            const k = Math.floor(at[1] / BUCKET) * 4096 + Math.floor(at[0] / BUCKET);

            buckets.set(k, [...(buckets.get(k) ?? []), { at, clear }]);
        };

        for (const place of plan.places) {
            put(place.at, (place.radius ?? 0) + PLACING.clear);
        }

        for (const site of plan.sites) {
            put(site.at, PLACING.sites);
        }

        kept.set(plan, buckets);
    }

    const [bx, by] = [Math.floor(x / BUCKET), Math.floor(y / BUCKET)];

    return [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => buckets.get((by + dy) * 4096 + bx + dx) ?? []));
}

// Whether the plan's ground round a point is steeper than PLACING.steep
function steepAt(plan, [x, y]) {
    const [cx, cy] = [Math.floor(x / CELL), Math.floor(y / CELL)];
    const height = (i, j) => plan.height[j * CELLS + i] ?? 0;

    if (cx < 1 || cy < 1 || cx >= CELLS - 1 || cy >= CELLS - 1) {
        return true;
    }

    return NEIGHBOURS.some(([dx, dy]) => Math.abs(height(cx + dx, cy + dy) - height(cx, cy)) > PLACING.steep);
}

// A point `distance` metres from `from` towards `to`, turned a little either way (each in turn)
// till one may be built on; or null
function siteToward(war, realmId, from, to, distance) {
    const heading = atan2(to[0] - from[0], to[1] - from[1]);

    for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
        const at = [Math.round(from[0] + sin(heading + turn) * distance), Math.round(from[1] + cos(heading + turn) * distance)];

        if (mayBuild(war, realmId, at)) {
            return at;
        }
    }

    return null;
}

/**
 * Where a realm's council would build now, best first: [{ key (the same each turn for the same
 * plan: its kind and what it guards), kind, at ([x, y] metres), about (the town's or works' id it
 * guards), toward (the enemy town it faces, or null), score, cost }]. A tower before each of its
 * towns that faces another people's (an enemy's above all) and by each of its works; a forward
 * garrison out from each of its towns on a front with an enemy, or by a town it's taken. None where
 * it has one of the kind already near, nor of a kind it has the most of.
 */
export function plansFor(war, realmId) {
    const realm = war.realm(realmId);

    if (!realm?.alive) {
        return [];
    }

    const liege = war.liege(realmId);
    const mine = (war.forts ?? []).filter((fort) => fort.realm === realmId);
    const towns = war.towns.filter(({ owner }) => owner === realmId);
    // (Every other people's town, and how much it's to be feared: an enemy's most)
    const others = war.towns.filter(({ owner }) => war.liege(owner) !== liege).map((town) => ({ town, enemy: war.hostile(liege, war.liege(town.owner)) }));
    const plans = [];
    // (The other people's town most to be feared from a point: the nearer, the more)
    const facing = (at) => {
        let best = null;

        for (const { town, enemy } of others) {
            const distance = apart(town.at, at);
            const fear = (enemy ? 1 : 0.3) * Math.max(0, 1 - distance / PLACING.front);

            if (fear > (best?.fear ?? 0)) {
                best = { town, fear, distance, enemy };
            }
        }

        return best;
    };
    // (None of a kind it has the most of already)
    const full = new Set(Object.keys(FORTS).filter((kind) => mine.filter((fort) => fort.kind === kind).length >= FORTS[kind].most));

    if (full.size === Object.keys(FORTS).length) {
        return [];
    }

    const room = (kind, at) => mine.filter((fort) => fort.kind === kind).every((fort) => apart(fort.at, at) > FORTS[kind].apart);
    const add = (kind, about, at, toward, score) => {
        if (at && !full.has(kind) && room(kind, at) && score > 0) {
            plans.push({ key: `${kind}:${about}`, kind, at, about, toward, score: Math.round(score * 1000) / 1000, cost: { ...FORTS[kind].cost } });
        }
    };

    for (const town of towns) {
        const front = facing(town.at);

        if (!front) {
            continue;
        }

        const weight = COUNCIL.town[town.kind] ?? 1;
        const edge = radiusOf(war, town.id);
        const taken = town.race !== realm.race;

        if (!full.has("tower")) {
            add("tower", town.id, siteToward(war, realmId, town.at, front.town.at, edge + FORTS.tower.out), front.town.id, front.fear * weight);
        }

        // (A forward garrison only on a front with an enemy; by a town it's taken, at its edge)
        if (front.enemy && !full.has("garrison")) {
            add("garrison", town.id, siteToward(war, realmId, town.at, front.town.at, edge + (taken ? PLACING.captured * 0.8 : FORTS.garrison.out)), front.town.id, front.fear * weight * COUNCIL.garrison);
        }
    }

    for (const works of (war.works ?? []).filter(({ owner, held }) => owner === realmId && !held)) {
        const front = facing(works.at);
        const yields = WORKS_YIELD[works.kind] ?? 1;

        if (front && !full.has("tower")) {
            add("tower", works.id, siteToward(war, realmId, works.at, front.town.at, FORTS.tower.out), front.town.id, Math.max(0, 1 - front.distance / PLACING.threat) * yields * COUNCIL.works * 2 + 0.05);
        }
    }

    return plans.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
}

// A turn's goods from each kind of works (war.js WORKED.yields, by kind), for weighing a works
const WORKS_YIELD = Object.freeze({ "lumber mill": 3, quarry: 2, mine: 1.5 });
