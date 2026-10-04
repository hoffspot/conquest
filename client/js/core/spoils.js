// What the wild's creatures leave behind (docs/WILDS.md): their parts, each worth what the
// adventurers' guild pays for it (the stronger the creature, the more), some good to eat or drink;
// and what each creature might have on it, each thing with its chance (never certain). The
// people-shaped ones carry a little gold and gear, as the orc does.
//
// When one's brought down, everyone near who's playing finds their own bundle of it (rolled for
// each of them: rollSpoils), seen only by them, to pick up or leave (core/host.js).
//
// Pure data and arithmetic, no DOM.

import { CREATURES, tierPower } from "./creatures.js";
import { rollTome, tomeOf } from "./spells.js";

/**
 * The creatures' parts: each one's name, what the guild pays for it (gold), what it looks like in
 * the pack (`icon`: a kind of picture, app/icons.js; `tint`: its colour), and what it does if it's
 * eaten or drunk (`use`: as a draught's, progress.js ITEMS).
 */
export const PARTS = Object.freeze({
    ratTail: { label: "Rat tail", worth: 2, icon: "tail", tint: "#c9938a" },
    ratTooth: { label: "Rat's incisors", worth: 3, icon: "fang", tint: "#e6c77c" },
    quill: { label: "Porcupine quill", worth: 2, icon: "quill", tint: "#e8e0cc" },
    slimeGel: { label: "Slime jelly", worth: 3, icon: "gel", tint: "#58c040" },
    batWing: { label: "Bat wing", worth: 2, icon: "wing", tint: "#4a3a34" },
    wolfPelt: { label: "Wolf pelt", worth: 7, icon: "pelt", tint: "#6a655c" },
    wolfFang: { label: "Wolf fang", worth: 4, icon: "fang", tint: "#efe6d0" },
    boarTusk: { label: "Boar tusk", worth: 6, icon: "tusk", tint: "#ece2c8" },
    boarHide: { label: "Boar hide", worth: 6, icon: "hide", tint: "#6e5440" },
    boarMeat: { label: "Boar meat", worth: 3, icon: "meat", tint: "#b8483e", use: { heal: 15 } },
    snakeSkin: { label: "Adder skin", worth: 5, icon: "skin", tint: "#7a7a40" },
    venomSac: { label: "Venom sac", worth: 7, icon: "gland", tint: "#9ac04a" },
    bearPelt: { label: "Bear pelt", worth: 16, icon: "pelt", tint: "#5a3e28" },
    bearClaw: { label: "Bear claw", worth: 8, icon: "claw", tint: "#2a2018" },
    bearMeat: { label: "Bear meat", worth: 5, icon: "meat", tint: "#a0403a", use: { heal: 25 } },
    pumaPelt: { label: "Puma pelt", worth: 14, icon: "pelt", tint: "#b08050" },
    pumaClaw: { label: "Puma claw", worth: 7, icon: "claw", tint: "#3a2a1a" },
    direPelt: { label: "Dire wolf pelt", worth: 12, icon: "pelt", tint: "#2e2c2e" },
    direFang: { label: "Dire wolf fang", worth: 8, icon: "fang", tint: "#f4ecd8" },
    goblinEar: { label: "Goblin ear", worth: 4, icon: "ear", tint: "#6a8a3a" },
    boneDust: { label: "Bone dust", worth: 5, icon: "dust", tint: "#d8cfb4" },
    oldSkull: { label: "Old skull", worth: 6, icon: "skull", tint: "#d8cfb4" },
    cultSigil: { label: "Cult sigil", worth: 8, icon: "sigil", tint: "#8a2f5a" },
    trollHide: { label: "Troll hide", worth: 22, icon: "hide", tint: "#6b7a6a" },
    trollBlood: { label: "Troll's blood", worth: 15, icon: "vial", tint: "#4a7a3a", use: { heal: 40 } },
    ogreTooth: { label: "Ogre tooth", worth: 12, icon: "fang", tint: "#e0d0a0" },
    ogreHide: { label: "Ogre hide", worth: 18, icon: "hide", tint: "#a08060" },
    wyvernScale: { label: "Wyvern scale", worth: 20, icon: "scale", tint: "#3e5a4a" },
    wyvernSting: { label: "Wyvern sting", worth: 30, icon: "sting", tint: "#d8ccaa" },
    shuckFur: { label: "Spectral fur", worth: 18, icon: "pelt", tint: "#20202a" },
    shuckFang: { label: "Shuck fang", worth: 14, icon: "fang", tint: "#ff7a5a" },
    boggartCharm: { label: "Boggart's charm", worth: 10, icon: "charm", tint: "#8a6a3a" },
    wispEssence: { label: "Wisp essence", worth: 12, icon: "essence", tint: "#9ae8ff", use: { stamina: 1000 } },
    heartwood: { label: "Blighted heartwood", worth: 25, icon: "wood", tint: "#5a4a3a" },
    blightCap: { label: "Blight cap", worth: 12, icon: "fungus", tint: "#8a4a9a" },
    spiderSilk: { label: "Spider silk", worth: 6, icon: "silk", tint: "#e8e8f0" },
    venomGland: { label: "Venom gland", worth: 8, icon: "gland", tint: "#8a2020" },
    shadowPelt: { label: "Shadow pelt", worth: 30, icon: "pelt", tint: "#2a1e3a" },
    shadowClaw: { label: "Shadow claw", worth: 18, icon: "claw", tint: "#a060ff" },
    hyenaHide: { label: "Hyena hide", worth: 6, icon: "hide", tint: "#a08a5a" },
    hyenaJaw: { label: "Hyena jaw", worth: 5, icon: "jaw", tint: "#e6dcc4" },
    scorpionSting: { label: "Scorpion sting", worth: 9, icon: "sting", tint: "#b89458" },
    carapace: { label: "Carapace plate", worth: 7, icon: "plate", tint: "#b89458" },
    frogLegs: { label: "Frog legs", worth: 3, icon: "meat", tint: "#9ac060", use: { heal: 12 } },
    poisonSkin: { label: "Poison frog skin", worth: 8, icon: "skin", tint: "#5a7a2a" },
    crocHide: { label: "Crocodile hide", worth: 20, icon: "hide", tint: "#3e4a2c" },
    crocTooth: { label: "Crocodile tooth", worth: 8, icon: "fang", tint: "#e8e0c0" },
    magmaCore: { label: "Magma core", worth: 18, icon: "core", tint: "#ff7020" },
    obsidian: { label: "Obsidian shard", worth: 10, icon: "shard", tint: "#2a2230" },
    stoneTusk: { label: "Stone tusk", worth: 22, icon: "tusk", tint: "#b8b0a0" },
    geodeHeart: { label: "Geode heart", worth: 30, icon: "core", tint: "#c080ff" },
    dragonScale: { label: "Dragon scale", worth: 60, icon: "scale", tint: "#6e1812" },
    dragonFang: { label: "Dragon fang", worth: 90, icon: "fang", tint: "#f0e4c8" },
    dragonHeart: { label: "Dragon's heart", worth: 250, icon: "heart", tint: "#c02010" },
    crownShard: { label: "Wight crown shard", worth: 120, icon: "shard", tint: "#c8a840" },
    graveIron: { label: "Grave-iron", worth: 60, icon: "ingot", tint: "#3a3f4a" },
    frostHeart: { label: "Frost heart", worth: 140, icon: "heart", tint: "#80d0ff" },
    frostHide: { label: "Frost troll hide", worth: 70, icon: "hide", tint: "#b8c8d8" },
});

/**
 * What each creature might leave: gold (the people-shaped: [least, most], at its first tier), and
 * things, each with its chance (0 to 1) and how many ([least, most]).
 */
export const SPOILS = Object.freeze({
    rat: { items: [{ id: "ratTail", chance: 0.5 }, { id: "ratTooth", chance: 0.2 }] },
    porcupine: { items: [{ id: "quill", chance: 0.7, count: [1, 3] }] },
    slime: { items: [{ id: "slimeGel", chance: 0.6 }] },
    bats: { items: [{ id: "batWing", chance: 0.6, count: [1, 2] }] },
    wolf: { items: [{ id: "wolfPelt", chance: 0.35 }, { id: "wolfFang", chance: 0.45 }] },
    boar: { items: [{ id: "boarTusk", chance: 0.4 }, { id: "boarHide", chance: 0.3 }, { id: "boarMeat", chance: 0.5 }] },
    snake: { items: [{ id: "snakeSkin", chance: 0.35 }, { id: "venomSac", chance: 0.3 }] },
    bandit: { gold: [3, 12], items: [{ id: "potion", chance: 0.2 }, { id: "sword", chance: 0.04 }] },
    banditChief: { gold: [15, 40], items: [{ id: "potion", chance: 0.6 }, { id: "sword", chance: 0.15 }] },
    bear: { items: [{ id: "bearPelt", chance: 0.35 }, { id: "bearClaw", chance: 0.45 }, { id: "bearMeat", chance: 0.4 }] },
    puma: { items: [{ id: "pumaPelt", chance: 0.35 }, { id: "pumaClaw", chance: 0.45 }] },
    direWolf: { items: [{ id: "direPelt", chance: 0.35 }, { id: "direFang", chance: 0.45 }] },
    goblin: { gold: [2, 9], items: [{ id: "goblinEar", chance: 0.5 }, { id: "potion", chance: 0.1 }] },
    skeleton: { gold: [1, 6], items: [{ id: "boneDust", chance: 0.5 }, { id: "oldSkull", chance: 0.2 }] },
    cultist: { gold: [4, 12], items: [{ id: "cultSigil", chance: 0.3 }, { id: "potion", chance: 0.15 }] },
    troll: { items: [{ id: "trollHide", chance: 0.35 }, { id: "trollBlood", chance: 0.3 }] },
    ogre: { gold: [6, 20], items: [{ id: "ogreTooth", chance: 0.4 }, { id: "ogreHide", chance: 0.25 }] },
    wyvern: { items: [{ id: "wyvernScale", chance: 0.45, count: [1, 3] }, { id: "wyvernSting", chance: 0.25 }] },
    blackShuck: { items: [{ id: "shuckFur", chance: 0.4 }, { id: "shuckFang", chance: 0.35 }] },
    boggart: { gold: [2, 8], items: [{ id: "boggartCharm", chance: 0.4 }] },
    wisp: { items: [{ id: "wispEssence", chance: 0.5 }] },
    treant: { items: [{ id: "heartwood", chance: 0.4 }, { id: "blightCap", chance: 0.4, count: [1, 2] }] },
    caveSpider: { items: [{ id: "spiderSilk", chance: 0.5, count: [1, 2] }, { id: "venomGland", chance: 0.3 }] },
    shadowStalker: { items: [{ id: "shadowPelt", chance: 0.35 }, { id: "shadowClaw", chance: 0.4 }] },
    hyena: { items: [{ id: "hyenaHide", chance: 0.35 }, { id: "hyenaJaw", chance: 0.35 }] },
    scorpion: { items: [{ id: "scorpionSting", chance: 0.4 }, { id: "carapace", chance: 0.4 }] },
    bogFrog: { items: [{ id: "frogLegs", chance: 0.55 }, { id: "poisonSkin", chance: 0.3 }] },
    crocodile: { items: [{ id: "crocHide", chance: 0.35 }, { id: "crocTooth", chance: 0.5, count: [1, 2] }] },
    magmaSlime: { items: [{ id: "magmaCore", chance: 0.4 }, { id: "obsidian", chance: 0.4 }] },
    rockTusker: { items: [{ id: "stoneTusk", chance: 0.45 }, { id: "geodeHeart", chance: 0.2 }] },
    dragon: { gold: [30, 80], items: [{ id: "dragonScale", chance: 0.9, count: [2, 4] }, { id: "dragonFang", chance: 0.5 }, { id: "dragonHeart", chance: 0.3 }] },
    wightLord: { gold: [20, 60], items: [{ id: "crownShard", chance: 0.5 }, { id: "graveIron", chance: 0.5 }] },
    frostTroll: { items: [{ id: "frostHeart", chance: 0.45 }, { id: "frostHide", chance: 0.5 }] },
});

/**
 * A spell's tome (spells.js TOMES), carried now and then by a creature with hands (creatures.js
 * `hands`: never a beast) from the middle tiers on (`tier`): as likely as `chance` at that tier, a
 * little likelier each tier beyond (`perTier`); on one of the perilous places' unique creatures,
 * `perilous`. Which tome, as rare as each is (spells.js TOME_RARITY).
 */
export const TOME_DROP = Object.freeze({ tier: 4, chance: 0.03, perTier: 0.005, perilous: 0.2 });

/** How much likelier a thing is to be found for each tier a creature's above its least (up to MOST_CHANCE). */
export const CHANCE_PER_TIER = 0.04;
const MOST_CHANCE = 0.95;

/**
 * What one player finds on a creature they were near when it fell (random.js random): { gold,
 * items: [{ id, quality, count }] }, for its tier: its gold that much more (as its strength is:
 * creatures.js tierPower), each thing a little likelier. Often nothing at all.
 */
export function rollSpoils(creature, tier, random, least = tier) {
    const table = SPOILS[creature];

    if (!table) {
        return { gold: 0, items: [] };
    }

    const above = Math.max(0, tier - least);
    const gold = table.gold ? Math.round(random.int(...table.gold) * tierPower(tier)) : 0;
    const items = [];

    for (const { id, chance, count = [1, 1] } of table.items) {
        if (random.chance(Math.min(MOST_CHANCE, chance + above * CHANCE_PER_TIER))) {
            items.push({ id, quality: "common", count: random.int(...count) });
        }
    }

    // (Now and then, carried by one with hands, from the middle tiers on: a tome)
    const { hands, perilous } = CREATURES[creature] ?? {};

    if (hands && tier >= TOME_DROP.tier && random.chance(perilous ? TOME_DROP.perilous : TOME_DROP.chance + (tier - TOME_DROP.tier) * TOME_DROP.perTier)) {
        items.push({ id: tomeOf(rollTome(random)), quality: "common", count: 1 });
    }

    return { gold, items };
}
