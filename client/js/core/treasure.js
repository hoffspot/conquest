// Treasure maps (docs/WILDS.md *Treasure maps*): a map found now and then in a chest, or a common
// one bought at any adventurers' guild, read out in the world to mark where something was buried.
// It's marked as a circle to search on the reader's world map, and on their party's; somewhere
// in it the spot glints once a hunter's near. Whoever buried it left something keeping it: a band
// of that land's brigands (caches.js CACHE_BANDS), woken as a hunter comes near the circle. Once
// the last of them falls the treasure's dug up, and everyone of the reader's party there, or who
// fought for it, finds a share of it (their own).
//
// The rarer the map (it comes in the makes gear does: progress.js QUALITIES), the further off
// where it leads, the wider the circle, the more and the fiercer those keeping it, and the richer
// what's buried: gold, gear, and from a fine map on, a prize as well made as the map is.
//
// Pure data and arithmetic, no DOM; the world's host keeps the hunts (host.js #treasures).

import { CACHE_BANDS, CACHE_GEAR, cacheClear, cacheMake, cacheTier } from "./caches.js";
import { TIERS } from "./creatures.js";
import { cos, hypot, sin } from "./exact.js";
import { rollGear } from "./gear.js";
import { wayAcross } from "./journey.js";
import { CHEST_GOLD } from "./places.js";
import { ITEMS, QUALITIES, rollBoost } from "./progress.js";
import { landAt, WORLD_SIZE } from "./worldplan/plan.js";

/** A treasure map's id (progress.js ITEMS): one item, in any make. */
export const TREASURE_MAP = "treasureMap";

/** The makes a treasure map comes in, the commonest first (progress.js QUALITIES). */
export const MAP_GRADES = Object.freeze(Object.keys(QUALITIES));

/**
 * Each make of map: how far from where it's read what it leads to lies (`reach`: [least, most]
 * metres), how wide the circle it's in (`radius`, metres), how many keep it, their leader too
 * (`count`: [least, most]), how many tiers above where it lies they are (`up`: caches.js
 * cacheTier), whether their leader's an elite (`elite`: creatures.js ELITES), how much more gold
 * there is than in an adventurer's cache (`gold`: times caches.js CACHE_LOOT's), how many pieces of
 * gear (`gear`: [least, most], as well made as a cache's at its tier), and the make of the prize
 * in each share (`prize`, or none).
 */
export const TREASURES = Object.freeze({
    common: { reach: [300, 700], radius: 40, count: [3, 4], up: 0, elite: false, gold: 1.5, gear: [1, 2], prize: null },
    fine: { reach: [450, 950], radius: 50, count: [3, 5], up: 0, elite: false, gold: 2, gear: [1, 2], prize: "fine" },
    masterwork: { reach: [600, 1300], radius: 60, count: [4, 5], up: 1, elite: false, gold: 3, gear: [2, 3], prize: "masterwork" },
    rare: { reach: [800, 1700], radius: 75, count: [4, 6], up: 1, elite: false, gold: 4.5, gear: [2, 3], prize: "rare" },
    veryRare: { reach: [1000, 2200], radius: 90, count: [5, 6], up: 2, elite: true, gold: 6, gear: [2, 3], prize: "veryRare" },
    legendary: { reach: [1300, 2800], radius: 110, count: [5, 7], up: 2, elite: true, gold: 9, gear: [3, 4], prize: "legendary" },
});

/**
 * The hunts: how many a player may be on at once (`most`: maps they've read and not dug up or
 * given up); how near the edge of its circle a hunter comes for those keeping it to wake
 * (`rouse`, metres); how near its spot they come to see it glint (`seen`, metres); how far its spot
 * may shift from where the map has it, to stand on open enough ground for its keepers (`shift`,
 * metres); how far into the world from its edge (`margin`, metres); how many places to try for
 * it (`tries`); gold in a share (`gold`: [least, most], before its make's and its tier's); and how
 * likely another map in a share (`map`), as well made as this one or the next better.
 */
export const TREASURE = Object.freeze({ most: 3, rouse: 40, seen: 15, shift: 12, margin: 150, tries: 24, gold: [20, 45], map: 0.12 });

/**
 * How likely a treasure map is in each player's share of a chest (host.js #opened: by its kind):
 * a place's chest or an adventurer's cache now and then, a hoard more often.
 */
export const MAP_FINDS = Object.freeze({ chest: 0.1, cache: 0.1, dungeon: 0.08, hoard: 0.3, greatHoard: 0.5 });

/**
 * How well made a map found in a chest is, by its tier (creatures.js tierAt: the first band of
 * tiers it's at or above, from the most dangerous down, each make as likely as its share): the
 * further out, the rarer the map.
 */
export const MAP_MAKES = Object.freeze([
    [9, { rare: 0.45, veryRare: 0.4, legendary: 0.15 }],
    [7, { masterwork: 0.4, rare: 0.35, veryRare: 0.2, legendary: 0.05 }],
    [5, { fine: 0.4, masterwork: 0.35, rare: 0.2, veryRare: 0.05 }],
    [3, { common: 0.5, fine: 0.35, masterwork: 0.15 }],
    [1, { common: 0.8, fine: 0.2 }],
]);

/** A make that's a map's, or common. */
export const gradeOfMap = (quality) => (TREASURES[quality] ? quality : "common");

/** A map found in a chest of a tier (MAP_MAKES), as `random` has it: { id, quality }. */
export function foundMap(tier, random) {
    const [, makes] = MAP_MAKES.find(([from]) => tier >= from) ?? MAP_MAKES.at(-1);
    let pick = random.next();
    const quality = Object.keys(makes).find((make) => (pick -= makes[make]) < 0) ?? Object.keys(makes).at(-1);

    return { id: TREASURE_MAP, quality };
}

/**
 * A player's share of a chest with a treasure map in it now and then (MAP_FINDS: by the chest's
 * `kind`, as well made as its `tier` has it: foundMap), put in before an old relic of the dead's
 * if the share ends with one (`relic`). The share, changed.
 */
export function withMap(bundle, kind, tier, random, { relic = false } = {}) {
    if (random.chance(MAP_FINDS[kind] ?? MAP_FINDS.chest)) {
        bundle.items.splice(relic ? bundle.items.length - 1 : bundle.items.length, 0, foundMap(tier, random));
    }

    return bundle;
}

/**
 * How strong those keeping a treasure are: as an adventurer's cache's would be where it lies
 * (`land`: creatures.js tierAt; `might`, 0 to 8, the reader's: caches.js cacheTier), and its
 * make's `up` tiers more, up to TIERS.
 */
export function treasureTier(land, might, grade) {
    return Math.min(TIERS, cacheTier(land, might) + TREASURES[gradeOfMap(grade)].up);
}

/** How many keep a treasure of a make (TREASURES `count`), their leader too, as `random` has it. */
export function treasureCount(grade, random) {
    return random.int(...TREASURES[gradeOfMap(grade)].count);
}

/** The band keeping a treasure buried on land of a kind (`biome`): one of those found there (caches.js CACHE_BANDS), or outlaws. */
export function treasureBand(biome, random) {
    const found = Object.keys(CACHE_BANDS).filter((id) => CACHE_BANDS[id].lands.includes(biome));

    return found.length ? found[Math.floor(random.next() * found.length) % found.length] : "bandits";
}

/**
 * Where a map read at `from` ([x, y] metres) leads (a `grade` of map, as `random` has it): out of
 * reach of the world's edge (TREASURE.margin), as far off as its make has it, any way, on ground a
 * cache could be on (caches.js cacheClear: dry, clear of the settlements, the roads, the places
 * worth finding and the camps, and of any other treasure, `others`), and a way there across the
 * world from where it's read (journey.js wayAcross). And the circle to search for it: its make's
 * `radius`, its middle anywhere that keeps the spot well inside it. { at, centre, radius }, or
 * null if nowhere was found (TREASURE.tries).
 */
export function placeTreasure(plan, from, grade, random, { nearRoad = () => false, others = [] } = {}) {
    const { reach, radius } = TREASURES[gradeOfMap(grade)];
    const [least, most] = [TREASURE.margin, WORLD_SIZE - TREASURE.margin];

    for (let tries = 0; tries < TREASURE.tries; tries++) {
        const angle = random.next() * Math.PI * 2;
        const far = random.range(reach[0], reach[1]);
        const at = [Math.floor(from[0] + cos(angle) * far) + 0.5, Math.floor(from[1] + sin(angle) * far) + 0.5];

        if (at[0] < least || at[1] < least || at[0] > most || at[1] > most) {
            continue;
        }

        if (!cacheClear(plan, at, { nearRoad, others }) || landAt(plan, at[0], at[1]).water || !wayAcross(plan, from, at)) {
            continue;
        }

        // (The circle's middle off the spot, but never so far it's near the edge)
        const turn = random.next() * Math.PI * 2;
        const off = radius * 0.65 * Math.sqrt(random.next());

        return { at, centre: [at[0] + cos(turn) * off, at[1] + sin(turn) * off], radius };
    }

    return null;
}

/** Whether a point ([x, y] metres) is within reach of waking those keeping a treasure (TREASURE.rouse past its circle's edge). */
export function nearTreasure(treasure, [x, y]) {
    return hypot(x - treasure.centre[0], y - treasure.centre[1]) <= treasure.radius + TREASURE.rouse;
}

/**
 * One player's share of a treasure dug up (random.js random; `people`: the maker of any people's
 * piece in it): { gold, items }. Gold as a cache's (CHEST_GOLD more each tier past the first) times
 * its make's; pieces of gear as well made as a cache's at its tier (caches.js cacheMake); from a
 * fine map on, a prize as well made as the map; a healing draught; and now and then (TREASURE.map)
 * another map, as well made or the next better.
 */
export function rollTreasure(tier, grade, random, { people = "human", level = 1, falloff = 1 } = {}) {
    const make = gradeOfMap(grade);
    const spec = TREASURES[make];
    const gold = Math.round(random.int(...TREASURE.gold) * spec.gold * (1 + CHEST_GOLD * (Math.max(1, tier) - 1)));
    const items = [];
    const piece = (quality) => {
        const id = CACHE_GEAR[Math.floor(random.next() * CACHE_GEAR.length) % CACHE_GEAR.length];
        const made = rollGear(id, quality, random, { people, level });

        return ITEMS[id].magic ? { ...made, boost: rollBoost(random, level) } : made;
    };

    // (The map's prize as well made as the map, whatever: its other pieces, less likely
    // exceptional for one it came too easily to: caches.js cacheMake)
    for (let k = random.int(...spec.gear); k > 0; k--) {
        items.push(piece(cacheMake(tier, random, { falloff })));
    }

    if (spec.prize) {
        items.push(piece(spec.prize));
    }

    items.push({ id: "potion", quality: "common" });

    if (random.chance(TREASURE.map)) {
        const next = MAP_GRADES[Math.min(MAP_GRADES.length - 1, MAP_GRADES.indexOf(make) + random.int(0, 1))];

        items.push({ id: TREASURE_MAP, quality: next });
    }

    return { gold, items };
}

/**
 * Who's hunting a treasure (`hunters(owner)`: the reader, and those of their party): those of them
 * in the world now (`players`: ids). The one rule for it, the host's and the maps' alike.
 */
export function huntersOf(treasure, players, partyOf = () => []) {
    const party = new Set([treasure.owner, ...partyOf(treasure.owner)]);

    return players.filter((id) => party.has(id));
}
