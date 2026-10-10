// How a dungeon's bosses and mini-bosses look (core/dungeons/themes.js's `bosses` and `minis`, each
// a creature of the wild with a title): bigger than others of their kind, and each its own way, by
// its id there (REGALIA): a crown or a helm on a people-shaped one's head, its body tinted, its eyes
// and what glows on it brighter. The rules know nothing of this: it's how they're drawn
// (beast.js dressingCreature), from the champion's rank and id the host gives the creature
// (core/host.js #rouse: its `wild.champion` and `wild.regalia`).

import { EQUIPMENT } from "../characters/equipment.js";

/**
 * By rank: how much bigger than others of its kind (`scale`), and how much brighter what glows on
 * it (`glow`: its eyes, a wraith's light); the colour its body's tinted, if any (`tint`). A dungeon's
 * boss or mini-boss; or one of the wild's elites (core/creatures.js ELITES), gilded, and radiant
 * besides (world/ailments3d.js "elite").
 */
export const CHAMPION_LOOKS = Object.freeze({
    boss: { scale: 1.22, glow: 1.6 },
    mini: { scale: 1.1, glow: 1.25 },
    elite: { scale: 1.25, glow: 1.8, tint: 0xf4dc9c },
});

/**
 * How tall a champion's made at most by being one (metres: a dungeon's lowest roof, a hideout's
 * tunnels, has room for it), and how much bigger one already that tall is made at least.
 */
export const CHAMPION_HEIGHT = Object.freeze({ tallest: 3.3, least: 1.05 });

/**
 * Each boss's and mini-boss's own look, by its id in its theme (core/dungeons/themes.js): what a
 * people-shaped one wears besides its kind's (`wear`: EQUIPMENT ids, each in place of whatever it
 * had in that slot), the colour its body's tinted (`tint`, times its own), and how much bigger or
 * brighter it is again (`scale`, `glow`, times its rank's). A theme's added with ids of its own:
 * one not here looks as its rank has it.
 */
export const REGALIA = Object.freeze({
    // The caves': a troll crowned, the Goblin King bigger than the wild's (its own crown and cape
    // on it already: beasts/looks.js), the frost troll's circlet of silver like ice; the
    // broodmother vast and blood-marked, the cave bear and the old tusker grizzled
    trollKing: { wear: ["crown"] },
    goblinKing: { scale: 1.15, glow: 1.2 },
    broodmother: { tint: 0xc07060, scale: 1.45, glow: 1.4 },
    frostTroll: { wear: ["circletElf"] },
    troll: {},
    bear: { tint: 0x9a9088, scale: 1.15 },
    ogre: { wear: ["orcHelm"] },
    tusker: { tint: 0xa8a49c, scale: 1.1 },
    brood: { tint: 0xb07068, scale: 1.2 },
    // An outlaws' hideout's: their king crowned, the ogre captain and the hired muscle helmed, the
    // lieutenant in a soldier's helm, the hedge priest hooded
    banditLord: { wear: ["crown"] },
    ogreBoss: { wear: ["orcHelm"] },
    lieutenant: { wear: ["nasalHelm"] },
    enforcer: { wear: ["orcHelm"] },
    hedgePriest: { wear: ["darkHood"] },
    // An ancient temple's: the tomb lord's eyes and the dread wraith's light burning brighter, the
    // tomb champion's bones gilded, the high priest hooded in black
    tombLord: { glow: 1.5 },
    dreadWraith: { scale: 1.12, glow: 1.6 },
    champion: { tint: 0xd8b868 },
    wraith: {},
    highPriest: { wear: ["darkHood"] },
});

/**
 * How a champion looks (`rank`: "boss", "mini" or "elite"; `id`: its REGALIA id), or null for one
 * that isn't: { scale (times its kind's size), glow (times what glows on it), tint (a colour its
 * body's darkened to, or null), wear (EQUIPMENT ids it wears) }.
 */
export function championLook(rank, id = null) {
    const ranked = CHAMPION_LOOKS[rank];

    if (!ranked) {
        return null;
    }

    const own = REGALIA[id] ?? {};

    return { scale: ranked.scale * (own.scale ?? 1), glow: ranked.glow * (own.glow ?? 1), tint: own.tint ?? ranked.tint ?? null, wear: own.wear ?? [] };
}

/**
 * How much bigger a champion (its championLook) is drawn than its kind, standing `tall` metres as
 * one of its kind: its look's, but no taller than CHAMPION_HEIGHT's tallest for it (a troll or an
 * ogre, already big, only a little bigger).
 */
export function championScale(look, tall) {
    return Math.min(look.scale, Math.max(CHAMPION_HEIGHT.least, CHAMPION_HEIGHT.tallest / tall));
}

/** What a people-shaped one wears (EQUIPMENT ids) with `wear` on: each of those in place of whatever was in its slot. */
export function wearing(equipment, wear) {
    const slots = new Set(wear.map((each) => EQUIPMENT[each]?.slot).filter(Boolean));

    return [...equipment.filter((each) => !slots.has(EQUIPMENT[each]?.slot)), ...wear];
}
