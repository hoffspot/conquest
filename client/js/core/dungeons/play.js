// Dungeons in play (core/host.js #dungeons: docs/DUNGEONS.md): how near a player has to come for
// a dungeon's levels to be made and its first level woken, how its boss and mini-bosses stand out
// from their kind, what's in its small chests and the boss's hoard, and the share each player gets
// of the hoard (matched to their power). Pure: seeded numbers only.

import { CACHE_GEAR, cacheMake } from "../caches.js";
import { TIERS } from "../creatures.js";
import { ITEMS, rollBoost } from "../progress.js";
import { rollGear } from "../gear.js";
import { CHEST_GOLD } from "../places.js";

/**
 * How dungeons are kept: made (and their first level woken) once a player's within `near` metres
 * of the way in; each level's foes woken while a player's on it or the level above, let go once
 * no one is (those slain staying slain till it's made again); let go wholly, and once its hoard's
 * opened made again, once every player's `far` from its way in and none is in it.
 */
export const DELVES = Object.freeze({ near: 45, far: 120 });

/**
 * How a dungeon's boss and mini-bosses stand out from their kind (on top of their tiers): `hp`
 * times as many hit points, blows `power` times as hard.
 */
export const CHAMPIONS = Object.freeze({ boss: { hp: 4, power: 1.3 }, mini: { hp: 2, power: 1.12 } });

/**
 * What's in a dungeon's small chest (a share for each player near it when it's opened): a little
 * gold (`gold`, more each tier as a place's chest has it, CHEST_GOLD), a piece of gear sometimes
 * (`gear`), a healing draught sometimes (`potion`).
 */
export const COFFER = Object.freeze({ gold: [6, 18], gear: 0.4, potion: 0.3 });

/**
 * What's in the boss's hoard (a share for each player in the dungeon when it's opened, at their
 * own power: hoardTier): gold (`gold`, more each tier), gear (`gear` pieces, made `up` tiers
 * better than a cache's at the tier), healing draughts (`potions`).
 */
export const HOARD = Object.freeze({ gold: [80, 150], gear: [3, 5], up: 2, potions: [1, 2] });

// A piece of gear for a chest: any but a people's uniform, made as a cache's at a tier, a wand's or
// grimoire's boost rolled
function gearPiece(tier, random, people) {
    const id = CACHE_GEAR[Math.floor(random.next() * CACHE_GEAR.length) % CACHE_GEAR.length];
    const made = rollGear(id, cacheMake(tier, random), random, { people });

    return ITEMS[id].magic ? { ...made, boost: rollBoost(random) } : made;
}

const goldAt = ([least, most], tier, random) => Math.round(random.int(least, most) * (1 + CHEST_GOLD * (Math.max(1, tier) - 1)));

/** A share of a small chest's (COFFER) at a level's tier: { gold, items }. */
export function rollCoffer(tier, random, { people = "human" } = {}) {
    const items = [];

    if (random.chance(COFFER.gear)) {
        items.push(gearPiece(tier, random, people));
    }

    if (random.chance(COFFER.potion)) {
        items.push({ id: "potion", quality: "common" });
    }

    return { gold: goldAt(COFFER.gold, tier, random), items };
}

/** A share of the boss's hoard (HOARD) at a tier (hoardTier's): { gold, items }. */
export function rollHoard(tier, random, { people = "human" } = {}) {
    const items = [];
    const made = Math.min(TIERS, tier + HOARD.up);

    for (let k = random.int(...HOARD.gear); k > 0; k--) {
        items.push(gearPiece(made, random, people));
    }

    for (let k = random.int(...HOARD.potions); k > 0; k--) {
        items.push({ id: "potion", quality: "common" });
    }

    return { gold: goldAt(HOARD.gold, tier, random), items };
}

/**
 * The tier a player's share of the hoard is at: their power's (their might, 0 to 8, plus one) or
 * the dungeon's deepest level's, whichever's higher.
 */
export const hoardTier = (levelTier, might) => Math.min(TIERS, Math.max(levelTier, 1 + might));

/** Which of a dungeon's foes one is (its level, its pack, its place in the pack): for the slain to stay slain. */
export const foeKey = (level, pack, k) => `${level}/${pack}/${k}`;
