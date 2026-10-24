// The wilds director (docs/WILDS.md *The wilds director*): every so far a player crosses the wilds
// (DIRECTOR.every), something's dealt ahead of them from a deck of what the wilds hold, as the
// old tabletop wilderness dice did, so that crossing them is more than one guarded chest after
// another. Each card comes once a deck, the deck shuffled again once it's all been dealt (never
// the one just dealt first again: Left 4 Dead's director dealt its bosses so). The cards:
// - an adventurer's cache, kept by brigands (core/caches.js);
// - a fallen adventurer's remains, to search (FINDS remains): a little gold, now and then a piece
//   of gear, a draught or a treasure map, and sometimes a note in their hand of somewhere near;
// - an old campsite (FINDS campsite): a ring of stones, the ashes long cold. Camped at, it's safe
//   with the wild nearer than anywhere else, and they wake well rested (WELL_RESTED).
//
// Pure data and arithmetic, no DOM; the world's host deals them (host.js #caches, #putFind).

import { CACHE_GEAR, cacheMake } from "./caches.js";
import { TIERS } from "./creatures.js";
import { hypot } from "./exact.js";
import { rollGear } from "./gear.js";
import { CHEST_GOLD } from "./places.js";
import { ITEMS, rollBoost } from "./progress.js";
import { foundMap } from "./treasure.js";

/** How often a card's dealt: one each `every` metres ([least, most]) a player crosses the wilds; and the cards in a deck. */
export const DIRECTOR = Object.freeze({ every: [250, 450], cards: Object.freeze(["cache", "remains", "campsite"]) });

/** The cards that are no fight: what's dealt after a hard one (the pacing). */
export const PEACEFUL = Object.freeze(["remains", "campsite"]);

/**
 * The pacing (Left 4 Dead's director: "Algorithm adjusts pacing, not difficulty"):
 * - a hard fight, one a player fell below `hard` of their health in (or fell): once it's over (no
 *   foe after them for `over` ms), a quiet spell of `quiet` ms ([least, most]), the wild about
 *   them only `fewer` of what it would be, no elite, and the next card dealt a peaceful one;
 * - a long calm, `calm` ms and `calmMetres` crossed without a fight: a build-up, the land's
 *   hunters heard ahead of them (`from` metres off, [least, most], within `spread` radians of the
 *   way they're going): beasts calling, folk drumming; `warn` ms later ([least, most]), they come
 *   for them.
 */
export const PACING = Object.freeze({ hard: 0.5, over: 5000, quiet: [60000, 90000], fewer: 0.5, calm: 240000, calmMetres: 400, from: [70, 90], spread: 0.8, warn: [12000, 20000] });

/**
 * A deck (`deck`: the cards still to deal, the next first) with a peaceful card next: the first
 * of its peaceful ones brought to the front; or, none left in it, the deck shuffled again
 * (shuffled: never `last`, the one just dealt, first) and its first peaceful one brought to the
 * front, so none's dealt twice a deck.
 */
export function peacefulNext(deck, random, last = null) {
    const cards = deck.some((card) => PEACEFUL.includes(card)) ? deck : shuffled(random, last);
    const k = cards.findIndex((card) => PEACEFUL.includes(card) && (cards === deck || card !== last));

    return k > 0 ? [cards[k], ...cards.slice(0, k), ...cards.slice(k + 1)] : [...cards];
}

/**
 * A deck shuffled (random.js random): each card once, in an order of its own; never `last` (the
 * card just dealt) first, so no card comes twice running.
 */
export function shuffled(random, last = null) {
    const deck = [...DIRECTOR.cards];

    for (let k = deck.length - 1; k > 0; k--) {
        const pick = random.int(0, k);

        [deck[k], deck[pick]] = [deck[pick], deck[k]];
    }

    if (deck.length > 1 && deck[0] === last) {
        deck.push(deck.shift());
    }

    return deck;
}

/**
 * The peaceful finds: how near a player one's said and marked on their maps (`seen`, metres), let
 * go once every player's further than `far` (and none camped at it), and what each is:
 * - remains: what each player near when they're searched (within `reach` metres) has a share of:
 *   `gold` ([least, most], CHEST_GOLD more for each tier past the first), a piece of gear `gear`
 *   of the time (made as a cache's at the tier), a healing draught `potion` of the time, a
 *   treasure map `map` of the time (made as a chest's at the tier), and a note in their hand of a
 *   place round about they hadn't found (`note` of the time, within `noteReach` metres);
 * - campsite: camped at within `near` metres of its ring, no camp's refused for the wild unless
 *   something hostile's within `safe` metres (not host.js REST.clear's 40), the fire lit in the
 *   ring, and those who camp there wake well rested (WELL_RESTED).
 */
export const FINDS = Object.freeze({
    seen: 60,
    far: 220,
    remains: Object.freeze({ reach: 6, gold: [6, 16], gear: 0.35, potion: 0.4, map: 0.2, note: 0.5, noteReach: 1500 }),
    campsite: Object.freeze({ near: 8, safe: 16 }),
});

/** The boon of a night at an old campsite: the breath back half again as fast, a little more healed by every heal, for 20 minutes. */
export const WELL_RESTED = Object.freeze({ id: "rested", label: "Well rested", recoveryTimes: 1.5, heal: 0.1, ms: 20 * 60000 });

/**
 * A player's share of a fallen adventurer's remains, out where the land's of a tier (random.js
 * random; `people`: the maker of any people's piece): { gold, items }, FINDS remains'.
 */
export function rollRemains(tier, random, { people = "human" } = {}) {
    const rules = FINDS.remains;
    const at = Math.max(1, Math.min(TIERS, tier));
    const gold = Math.round(random.int(...rules.gold) * (1 + CHEST_GOLD * (at - 1)));
    const items = [];

    if (random.chance(rules.gear)) {
        const id = CACHE_GEAR[Math.floor(random.next() * CACHE_GEAR.length) % CACHE_GEAR.length];
        const made = rollGear(id, cacheMake(at, random), random, { people });

        items.push(ITEMS[id].magic ? { ...made, boost: rollBoost(random) } : made);
    }

    if (random.chance(rules.potion)) {
        items.push({ id: "potion", quality: "common" });
    }

    if (random.chance(rules.map)) {
        items.push(foundMap(at, random));
    }

    return { gold, items };
}

/**
 * The place a fallen adventurer's note tells of, if any: of `places` ([{ id, at }]: those rumours
 * are told of, core/rumours.js rumouredOf), the nearest to `at` ([x, y] metres) within FINDS
 * remains' noteReach that `known(id, x, y)` says the player hasn't found; or null.
 */
export function noteOf(places, at, known) {
    let best = null;

    for (const place of places) {
        const far = hypot(place.at[0] - at[0], place.at[1] - at[1]);

        if (far <= FINDS.remains.noteReach && !known(place.id, ...place.at) && (!best || far < best.far || (far === best.far && place.id < best.id))) {
            best = { id: place.id, far };
        }
    }

    return best?.id ?? null;
}
