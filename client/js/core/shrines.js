// The wayside shrines out in the land (the world plan's sites of kind "shrine"; docs/WILDS.md
// *Shrines*), each to one of the twelve gods (core/lore/gods.js PANTHEON: the Six of the Hearth
// and the Wild Six), every god at two or three of them. Prayed at, each answers each player once a
// world day with its god's gift (GIFTS): a boon for half an hour (SHRINE.ms) in character with
// what the god is god of, one god's at a time, a new one in place of another god's (a tavern's
// drink and a priest's blessing still go with it). And each is a sanctuary (SHRINE.sanctuary):
// nothing hostile put out near it, those chasing give up at its edge, and a rest there cures
// what's on the one resting (host.js).
//
// Pure and exact: the same on every machine, from the world plan alone.

import { hypot } from "./exact.js";
import { PANTHEON, PANTHEON_IDS } from "./lore/gods.js";
import { createRandom } from "./random.js";
import { restingOf } from "./sites.js";

/**
 * How near a shrine's heart (sites.js heartOf: before its figure) one must be to pray there
 * (`reach`, metres); how long its gift lasts (`ms`, battle ms); how far round it its sanctuary
 * reaches (`sanctuary`, metres, from where it rests: sites.js restingOf); and what a rest in it
 * cures (`cures`: afflictions.js, the poisons, the sicknesses and the withering curse).
 */
export const SHRINE = Object.freeze({ reach: 4, ms: 30 * 60 * 1000, sanctuary: 60, cures: Object.freeze(["poison", "venom", "disease", "pox", "wither"]) });

/** A god's gift's boon's id (the host's boons: one of these at a time). */
export const giftId = (god) => `god-${god}`;

/**
 * Each god's gift at a shrine: its name (`label`), what it does in words (`does`: told, and in the
 * pack's list of what's on the player), and its boon (host.js #outfit: blows harder in hand
 * (`melee`) and shot (`ranged`), healing (`heal`), stunning (`stun`), spells (`spell`), bashing
 * (`bash`), armour (`armor`), dodging (`dodge`), hit points (`hp`), the elements' and magic's harm
 * kept off (`wardFire`...), gold found (`fortune`), breath (`staminaTimes`) and its coming back
 * (`recoveryTimes`), and seeing in the dark (`darkSight`)).
 */
export const GIFTS = Object.freeze({
    aurelia: { label: "Aurelia's Dawn", does: "your blood runs warm: twenty more hit points, and your healing a sixth the stronger", hp: 20, heal: 0.15 },
    brannoc: { label: "The Red Horn", does: "your blows and your shots land a twelfth the harder", melee: 0.08, ranged: 0.08 },
    ithriel: { label: "A Thread of the Veil", does: "your spells strike a sixth the harder", spell: 0.15 },
    morvaine: { label: "The Lantern's Ward", does: "a quarter of magic's harm kept off you, and your armour the stronger", wardMagic: 0.25, armor: 0.03 },
    seliane: { label: "The Rose's Grace", does: "your healing a quarter the stronger, and your breath back a quarter the faster", heal: 0.25, recoveryTimes: 1.25 },
    dunmar: { label: "Anvilhand's Mettle", does: "your armour the stronger, and your shield's bash the harder", armor: 0.06, bash: 0.15 },
    tharos: { label: "Thunder in the Hand", does: "your blows stun the more and land a little harder, and a quarter of the storm's harm kept off you", stun: 0.2, melee: 0.05, wardAir: 0.25 },
    nerreth: { label: "The Tide's Strength", does: "a quarter more breath, and a third of water's harm kept off you", staminaTimes: 1.25, wardWater: 0.3 },
    ceryn: { label: "Harvest Plenty", does: "fifteen more hit points, and your breath back a third the faster", hp: 15, recoveryTimes: 1.3 },
    lunara: { label: "Moonsight", does: "you see in the dark as the night's creatures do, and dodge the more", darkSight: true, dodge: 0.05 },
    wick: { label: "Fortune's Wink", does: "you dodge the more, and find a quarter more gold", dodge: 0.06, fortune: 0.25 },
    bacchar: { label: "Revelry", does: "half as much breath again and your blows the harder, if your guard's the looser", staminaTimes: 1.5, melee: 0.06, armor: -0.02 },
});

/** Each god's gift as a boon (host.js), for SHRINE.ms: by its id. */
export const GIFT_BOONS = Object.freeze(Object.fromEntries(Object.entries(GIFTS).map(([god, { label, does: _does, ...boon }]) => [giftId(god), Object.freeze({ id: giftId(god), label, god, ...boon, ms: SHRINE.ms })])));

// Laid out, by plan (once each)
const LAID = new WeakMap();

/**
 * The shrines of a world (the plan's sites of kind "shrine", by their ids in order), each to one
 * of the twelve: dealt out round them in an order of the world's own, so each has two or three.
 * [{ site, god (a PANTHEON id), at (where it rests: sites.js restingOf, [x, y] metres) }].
 */
export function shrinesOf(plan) {
    if (!LAID.has(plan)) {
        const sites = (plan.sites ?? []).filter(({ kind }) => kind === "shrine").sort((a, b) => (a.id < b.id ? -1 : 1));
        const order = createRandom(((plan.seed ?? 0) * 0x5bd1e995 + 0x1b873593) >>> 0).shuffle(PANTHEON_IDS);

        LAID.set(plan, Object.freeze(sites.map((site, k) => Object.freeze({ site, god: order[k % order.length], at: restingOf(plan, site).at }))));
    }

    return LAID.get(plan);
}

/** A shrine by its site's id: { site, god }, or null. */
export const shrineOf = (plan, id) => shrinesOf(plan).find(({ site }) => site.id === id) ?? null;

/** The god a shrine's to, as they're named: "Tharos, the Thunderlord". */
export const godWords = (god) => (PANTHEON[god] ? `${PANTHEON[god].name}, ${PANTHEON[god].title}` : "a forgotten god");

/** The shrine whose sanctuary a point's in ([x, y] metres, out in the world: SHRINE.sanctuary of where it rests), or null. */
export function sanctuaryAt(plan, [x, y]) {
    return shrinesOf(plan).find(({ at }) => hypot(x - at[0], y - at[1]) <= SHRINE.sanctuary) ?? null;
}
