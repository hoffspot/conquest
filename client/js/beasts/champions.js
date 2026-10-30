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
 * boss or mini-boss, or a hell's level's own boss (`floor`); or one of the wild's elites
 * (core/creatures.js ELITES), gilded, and radiant besides (world/ailments3d.js "elite"); or
 * Lunara's guardian under a full moon (`moon`: core/rings.js TRIAL), pale as moonsilver.
 */
export const CHAMPION_LOOKS = Object.freeze({
    boss: { scale: 1.22, glow: 1.6 },
    floor: { scale: 1.16, glow: 1.4 },
    mini: { scale: 1.1, glow: 1.25 },
    elite: { scale: 1.25, glow: 1.8, tint: 0xf4dc9c },
    moon: { scale: 1.3, glow: 2, tint: 0xdce6ff },
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
    // An ants' nest's: the Ant Monster its own size (the biggest it's drawn already: beasts/model.js),
    // its eyes the brighter; the brood warden a soldier of the nest, bigger and redder, the
    // tunnel crawler grey with age, and the widow matriarch bigger, blacker and glossier
    antMonster: { glow: 1.2 },
    warden: { tint: 0xd8906a, scale: 1.25 },
    crawler: { tint: 0xa8a098, scale: 1.05 },
    matriarch: { tint: 0x8a7a90, scale: 1.3, glow: 1.3 },
    // A hell's, its levels' masters burnt and blackened by it, horned, their eyes burning: the
    // Breach Priest hooded, the Bone Lord's bones scorched, the Forge Demon's eyes burning, the
    // Gatekeeper helmed; and the lord of the Pit, horned already, its eyes burning brightest. Its
    // mini-bosses the same way, the less
    breachPriest: { wear: ["darkHood"], tint: 0xc07060, glow: 1.4 },
    boneLord: { tint: 0xa08070, glow: 1.4 },
    forgeDemon: { glow: 1.4 },
    gatekeeper: { wear: ["orcHelm"], tint: 0xb06050, glow: 1.3 },
    demonLord: { glow: 1.5 },
    fireCaller: { wear: ["darkHood"], tint: 0xd08070 },
    magmaHeart: { tint: 0xe08060, scale: 1.15 },
    breachHound: { tint: 0xa05040, scale: 1.1 },
    boneChampion: { tint: 0xa08070 },
    flayedKing: { tint: 0xb07060 },
    wailer: { glow: 1.3 },
    moltenLord: { tint: 0xe09060, scale: 1.2 },
    brander: { tint: 0xd06040 },
    forgeChimera: { tint: 0xc06048 },
    pitPriest: { wear: ["darkHood"], tint: 0xa05050 },
    doomedKnight: { tint: 0x907070 },
    herald: { glow: 1.4 },
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
