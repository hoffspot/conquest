// The roaming beasts' dens (docs/WILDS.md *Dens*): out in the wild, where each kind's land is, a
// bear's den, a boars' wallow, a puma's or a jaguar's lair, a wyverns' nest and a knucker's hole,
// each kept by the mightiest of its kind round about (its `master`) and a few more of it. Laid out
// from the world plan, once for each plan, after everything else is (and by a draw of its own, so
// nothing else is moved by them): clear of the settlements, the sites, the camps, the roads, the
// water and each other, and only so far in as the land's strong enough for what keeps it. Their
// beasts are put out as a player comes near (host.js #dens), and they wear trails of their own out
// into the country round them (core/tracks.js).
//
// Pure and exact (core/exact.js), the same on every machine.

import { CREATURES } from "./creatures.js";
import { hypot } from "./exact.js";
import { createRandom } from "./random.js";
import { flatSpot } from "./terrain/flats.js";
import { heightAt } from "./terrain/height.js";
import { BIOMES, campTier, CELL, CELLS, RACES, SETTLEMENTS, startFor, WATER, WORLD_SIZE } from "./worldplan/plan.js";

/**
 * Each kind of den: what keeps it (`creature`: one of its kind put out its master, a tier up and
 * `master` times as hardy, with `with` more of it: [least, most]), how many a world has at most
 * (`count`), how level its ground must be if not as DEN.level (`level`: a wyverns' nest on a crag),
 * and how it's spoken of (`one`: one of them; `all`: them all, for the bestiary).
 */
export const DENS = Object.freeze({
    "bear's den": { creature: "bear", with: [0, 1], count: 8, one: "a bear's den", all: "the bears' dens" },
    "boars' wallow": { creature: "boar", with: [1, 3], count: 8, one: "a boars' wallow", all: "the boars' wallows" },
    "puma's lair": { creature: "puma", with: [0, 1], count: 6, one: "a puma's lair", all: "the pumas' lairs" },
    "jaguar's lair": { creature: "jaguar", with: [0, 1], count: 4, one: "a jaguar's lair", all: "the jaguars' lairs" },
    "wyverns' nest": { creature: "wyvern", with: [1, 1], count: 5, level: 2.5, one: "a wyverns' nest", all: "the wyverns' nests" },
    "knucker's hole": { creature: "knucker", with: [0, 0], count: 4, one: "a knucker's hole", all: "the knuckers' holes" },
});

/**
 * How dens are laid out and kept: how far (metres) beyond a settlement's edge one keeps
 * (`clear`), how far (cells) from the sites, the camps and each other (`sites`, `camps`, `apart`),
 * how many tries it has (`tries`); how far from its cell's middle it may be moved to the flattest
 * ground there (`reach`, metres: terrain/flats.js), and how level that must be (`level`: no more
 * than so many metres up or down `round` metres from its middle, every way, unless its kind says:
 * DENS `level`); how near a player comes for its beasts to be put out (`near`, metres) and how far
 * they all go for them to be let go (`far`); how far its beasts roam from it (`roam`); how much
 * hardier its master is (`master`); how long its master's gone once it's slain (`back`, battle
 * ms); and how far round it trees keep clear of it (`ground`, metres).
 */
export const DEN = Object.freeze({ clear: 260, sites: 4, camps: 5, apart: 10, tries: 4000, reach: 48, level: 1.2, round: 7, near: 90, far: 180, roam: 7, master: 1.6, back: 20 * 60 * 1000, ground: 14 });

// Laid out, by plan (once each)
const LAID = new WeakMap();

/**
 * The dens of a world (laid out once for a plan): [{ id ("den-3"), kind (a DENS key), creature,
 * cell ([x, y] cells), at ([x, y] metres: the flattest ground near its cell's middle), seed }].
 */
export function densOf(plan) {
    if (!LAID.has(plan)) {
        LAID.set(plan, Object.freeze(layOut(plan).map((den) => Object.freeze(den))));
    }

    return LAID.get(plan);
}

/** A den of a world by its id, or null. */
export const denOf = (plan, id) => densOf(plan).find((den) => den.id === id) ?? null;

/** How a den is spoken of: "a bear's den". */
export const denWords = (den) => DENS[den.kind]?.one ?? "a den";

/**
 * How strong a den's beasts are, as one whose home is at `from` ([x, y] metres) finds them: its
 * tier from there as a camp's is (worldplan/settle.js campTier), within its kind's.
 */
export function denTier(den, from) {
    const [least, most] = CREATURES[den.creature].tiers;

    return Math.min(most, Math.max(least, campTier(den, from)));
}

function layOut(plan) {
    const random = createRandom(((plan.seed ?? 0) * 0x2545f491 + 0x6b0d) >>> 0);
    const starts = RACES.map(({ id }) => startFor(plan, id)).filter(Boolean);
    const apart = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    const dens = [];

    // Is a point (metres, in a cell) clear of the settlements, the sites, the camps and the dens?
    const clear = (at, cell) =>
        plan.places.every((place) => hypot(at[0] - place.at[0], at[1] - place.at[1]) > (SETTLEMENTS[place.kind]?.radius ?? 40) + DEN.clear) &&
        plan.sites.every((site) => apart(site.cell, cell) >= DEN.sites) &&
        plan.camps.every((camp) => apart(camp.cell, cell) >= DEN.camps) &&
        dens.every((den) => apart(den.cell, cell) >= DEN.apart);

    // Is the ground level enough round a point for a den (`most` metres up or down DEN.round from it)?
    const level = ([x, y], most) => {
        const middle = heightAt(plan, x, y);
        const { round } = DEN;

        return [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]].every(([dx, dy]) => Math.abs(heightAt(plan, x + dx * round, y + dy * round) - middle) <= most);
    };

    // A den of a kind at a cell, if it can be there: where, on the flattest ground near its middle
    const fits = (kind, cell) => {
        const k = cell[1] * CELLS + cell[0];
        const middle = [(cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL];
        const { creature, level: most = DEN.level } = DENS[kind];

        if (plan.water[k] !== WATER.none || plan.road[k] || !CREATURES[creature].biomes.includes(BIOMES[plan.biome[k]].id) || !clear(middle, cell)) {
            return null;
        }

        // (Only so far in as the land's nearly strong enough for what keeps it, from every
        // people's start)
        if (Math.min(...starts.map((start) => campTier({ at: middle }, start.at))) < CREATURES[creature].tiers[0] - 2) {
            return null;
        }

        const at = flatSpot(plan, middle, { reach: DEN.reach, size: WORLD_SIZE });

        return level(at, most) && clear(at, cell) ? at : null;
    };

    for (const [kind, { creature, count }] of Object.entries(DENS)) {
        for (let tries = 0, made = 0; made < count && tries < DEN.tries; tries++) {
            const cell = [random.int(4, CELLS - 5), random.int(4, CELLS - 5)];
            const at = fits(kind, cell);

            if (at) {
                dens.push({ id: `den-${dens.length + 1}`, kind, creature, cell, at, seed: random.int(0, 0x7fffffff) });
                made++;
            }
        }
    }

    return dens;
}
