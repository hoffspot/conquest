// The trails out of the wild's camps and lairs (docs/WILDS.md *Tracking*), to follow home as a
// hunter does: each camp's folk wear TRAILS.camp of them out into the wilds, each perilous site's
// (a lair, a ruined castle, the Tower of Sar Mordal, a hell's way in) TRAILS.lair, winding out
// from it round what can't be crossed (water, the settlements). Along each, TRAILS.signs.length
// signs of what made it (a scrape, a dropping, a tuft caught on a thorn: core/lore/bestiary.js
// `sign`), the furthest first: read, each tells which way the trail runs home and adds to what the
// reader knows of what made it (core/bestiary.js `read`); TRAILS.tracked of a home's read, it's
// tracked, marked on the reader's maps (core/explored.js).
//
// Pure and exact (core/exact.js), the same on every machine: laid out from the world plan alone,
// once for each plan.

import { campFolk, LAIRS, lairOf } from "./creatures.js";
import { cos, hypot, sin, TAU } from "./exact.js";
import { createRandom } from "./random.js";
import { compass } from "./ways.js";
import { campTier, landAt, SETTLEMENTS, WATER, WORLD_SIZE } from "./worldplan/plan.js";

/**
 * How many trails each camp wears out (`camp`) and each perilous site (`lair`); how far out of it
 * one starts (`from`, metres) and how long it runs on from there (`length`: [least, most]), in
 * steps of `step` metres, turning as much as `wander` (radians) at each, kept off the water and
 * `clear` metres off the settlements' edges; where along it its signs lie (`signs`: a share of its
 * length, out from where it starts, the furthest first); how near a sign the reader must be to read
 * it (`reach`, metres); and how many of a home's signs read track it home (`tracked`).
 */
export const TRAILS = Object.freeze({ camp: 2, lair: 3, from: 30, length: [170, 250], step: 8, wander: 0.35, clear: 25, signs: Object.freeze([0.92, 0.6, 0.28]), reach: 3, tracked: 3 });

/**
 * What each home is called, by a camp's faction, a perilous site's kind or a rite's theme: the
 * words for where a trail leads.
 */
export const HOMES = Object.freeze({
    bandits: "a bandits' camp",
    wolves: "a wolf pack's camp",
    goblins: "a goblins' camp",
    spiders: "a giant spiders' camp",
    undead: "a camp of the restless dead",
    trolls: "a trolls' camp",
    raiders: "a raiders' camp",
    cultists: "a cultists' camp",
    "dragon's lair": "the drake's lair",
    "dreadthorn's lair": "a Dreadthorn's lair",
    "werewolf's den": "the werewolves' den",
    "ruined castle": "a ruined castle",
    "rift tower": "the Tower of Sar Mordal",
    hell: "a cult's camp at a hell's way in",
});

// Laid out, by plan (once each)
const LAID = new WeakMap();

// How wide the buckets the signs are kept in to be found near a point (metres)
const BUCKET = 256;

// (A whole number for an id: the same every time)
function hashId(id) {
    let hash = 2166136261;

    for (let k = 0; k < id.length; k++) {
        hash = Math.imul(hash ^ id.charCodeAt(k), 16777619) >>> 0;
    }

    return hash;
}

// Can a trail come through here: on the land, in the world, clear of the settlements (`places`:
// those near enough to be in its way)?
function open(plan, places, [x, y]) {
    if (x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE || landAt(plan, x, y).water !== WATER.none) {
        return false;
    }

    return places.every((place) => hypot(x - place.at[0], y - place.at[1]) > (SETTLEMENTS[place.kind]?.radius ?? 40) + TRAILS.clear);
}

// The point a share of the way along a line of points ([[x, y], ...]), and the way it runs there
// (toward its start)
function along(points, share) {
    const lengths = points.slice(1).map((point, k) => hypot(point[0] - points[k][0], point[1] - points[k][1]));
    let left = share * lengths.reduce((sum, each) => sum + each, 0);

    for (let k = 0; k < lengths.length; k++) {
        if (left <= lengths[k] || k === lengths.length - 1) {
            const t = lengths[k] ? Math.min(1, left / lengths[k]) : 0;
            const [a, b] = [points[k], points[k + 1]];

            return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], back: k };
        }

        left -= lengths[k];
    }

    return { at: [...points[0]], back: 0 };
}

// One trail out of a home: wandering out from it its way (`angle`), round what it can't cross;
// null if it can't get far enough to be followed
function wear(plan, home, k, angle) {
    const random = createRandom((Math.imul(plan.seed ?? 0, 0x9e3779b1) ^ hashId(`${home.id}/${k}`)) >>> 0);
    const length = random.range(...TRAILS.length);
    const start = [home.at[0] + cos(angle) * TRAILS.from, home.at[1] + sin(angle) * TRAILS.from];
    const reach = TRAILS.from + TRAILS.length[1] + TRAILS.clear;
    const places = plan.places.filter((place) => hypot(home.at[0] - place.at[0], home.at[1] - place.at[1]) <= reach + (SETTLEMENTS[place.kind]?.radius ?? 40));

    if (!open(plan, places, start)) {
        return null;
    }

    const points = [start];
    let heading = angle;

    for (let gone = 0; gone < length; gone += TRAILS.step) {
        // (Wandering, but drawn back to its way, so it doesn't turn back on itself)
        heading += (random.next() - 0.5) * 2 * TRAILS.wander + (angle - heading) * 0.25;

        const [x, y] = points.at(-1);
        const next = [0, 0.6, -0.6, 1.2, -1.2].map((turn) => [x + cos(heading + turn) * TRAILS.step, y + sin(heading + turn) * TRAILS.step, turn]).find((point) => open(plan, places, point));

        if (!next) {
            break;
        }

        heading += next[2];
        points.push([next[0], next[1]]);
    }

    if (points.length * TRAILS.step < TRAILS.length[0] / 2) {
        return null;
    }

    const id = `${home.id}/${k}`;
    const signs = TRAILS.signs.map((share, index) => {
        const { at, back } = along(points, share);
        // (Which way it runs home from there: toward a point well back along it, or its start)
        const toward = points[Math.max(0, back - 3)];

        return { id: `${id}:${index}`, index, at, way: compass(at, hypot(toward[0] - at[0], toward[1] - at[1]) > 1 ? toward : home.at) };
    });

    return { id, home, k, points, signs };
}

// The homes trails lead to: the wild camps (of a faction that has folk), and the perilous sites
// and the hells' ways in (creatures.js lairOf)
function homesOf(plan) {
    const camps = (plan.camps ?? []).map((camp) => ({ id: camp.id, kind: "camp", what: camp.faction, at: camp.at, trails: TRAILS.camp }));
    const lairs = (plan.sites ?? []).filter((site) => lairOf(site)).map((site) => ({ id: site.id, kind: LAIRS[site.kind] ? "lair" : "rite", what: LAIRS[site.kind] ? site.kind : site.theme, at: site.at, trails: TRAILS.lair }));

    return [...camps, ...lairs];
}

/**
 * Every trail in the world (laid out once for a plan): [{ id ("camp-3/1": its home's id and which
 * of its trails), home ({ id, kind: "camp" | "lair" | "rite", what (a camp's faction, a site's
 * kind, a rite's theme: HOMES), at }), k, points ([[x, y], ...] metres, out from near its home),
 * signs ([{ id ("camp-3/1:0"), index (0, the furthest out), at, way (the way it runs home from
 * there: "north-east") }]) }].
 */
export function trailsOf(plan) {
    if (!LAID.has(plan)) {
        const trails = [];
        const signs = new Map();
        const buckets = new Map();

        for (const { trails: count, ...home } of homesOf(plan)) {
            const turned = (hashId(home.id) % 1000) / 1000;

            for (let k = 0; k < count; k++) {
                const trail = wear(plan, home, k, ((k + turned) / count) * TAU);

                if (!trail) {
                    continue;
                }

                trails.push(trail);

                for (const sign of trail.signs) {
                    const key = `${Math.floor(sign.at[0] / BUCKET)},${Math.floor(sign.at[1] / BUCKET)}`;

                    signs.set(sign.id, { trail, sign });
                    buckets.set(key, [...(buckets.get(key) ?? []), { trail, sign }]);
                }
            }
        }

        LAID.set(plan, { trails, signs, buckets });
    }

    return LAID.get(plan).trails;
}

/** A sign by its id: { trail, sign } (trailsOf's), or null. */
export function signOf(plan, id) {
    trailsOf(plan);

    return (typeof id === "string" && LAID.get(plan).signs.get(id)) || null;
}

/** The signs within `within` metres of a point ([x, y]): [{ trail, sign }], the nearest first. */
export function signsNear(plan, [x, y], within) {
    trailsOf(plan);

    const { buckets } = LAID.get(plan);
    const found = [];

    for (let by = Math.floor((y - within) / BUCKET); by <= Math.floor((y + within) / BUCKET); by++) {
        for (let bx = Math.floor((x - within) / BUCKET); bx <= Math.floor((x + within) / BUCKET); bx++) {
            for (const each of buckets.get(`${bx},${by}`) ?? []) {
                if (hypot(each.sign.at[0] - x, each.sign.at[1] - y) <= within) {
                    found.push(each);
                }
            }
        }
    }

    return found.sort((a, b) => hypot(a.sign.at[0] - x, a.sign.at[1] - y) - hypot(b.sign.at[0] - x, b.sign.at[1] - y));
}

/** The trails passing within `within` metres of a point ([x, y]) somewhere along them. */
export function trailsNear(plan, [x, y], within) {
    return trailsOf(plan).filter(({ points }) => points.some(([px, py]) => Math.abs(px - x) <= within + TRAILS.step && Math.abs(py - y) <= within + TRAILS.step && hypot(px - x, py - y) <= within + TRAILS.step));
}

/**
 * What wore a trail, as one whose home is at `from` ([x, y] metres: where their people start)
 * finds it: a camp's folk at its tier from there (creatures.js campFolk); a lair's master on its
 * first trail, its guards on the others, one kind after another.
 */
export function trailCreature(plan, trail, from) {
    const { home, k } = trail;

    if (home.kind === "camp") {
        const camp = plan.camps.find(({ id }) => id === home.id);

        return campFolk(camp.faction, campTier(camp, from));
    }

    const lair = lairOf(plan.sites.find(({ id }) => id === home.id));

    return k === 0 || !lair.guards.length ? lair.master[0] : lair.guards[(k - 1) % lair.guards.length][0];
}

/** Where a trail leads, in words: "a bandits' camp", "the drake's lair". */
export const homeWords = (home) => HOMES[home.what] ?? "its home";
