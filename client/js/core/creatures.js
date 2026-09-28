// The wild's creatures (docs/WILDS.md): what each is, how strong, how it behaves, and where it's
// found. The drawing's in client/js/beasts (their looks by the same ids).
//
// How strong: each has its hit points and weapon (weapons.js NATURAL, or a people's weapon) at
// the first tier's; a creature met at a higher tier is stronger, TIER_GROWTH times as many hit
// points and as hard blows for each tier up (so about a third more to beat, each tier). The
// tier a place has goes up the further it is from every people's home (where a player of theirs
// starts: tierAt), so what's near home is about a match for a new adventurer, and the danger grows
// the further they go; the high snows and mountains far from anywhere, and the perilous sites
// (the dragon's lair, the ruined castles), hold the mightiest, a match only for a player near the
// height of their power.
//
// How it behaves (its `temper`): an aggressive one comes for anyone it sees; a territorial one
// for anyone who comes within `guard` squares of it; a defensive one fights only whoever strikes
// it or its pack. Any of them wanders near where it's found, never goes more than its `leash`
// from there after anyone, and the people's soldiers go after any that's a menace (aggressive or
// territorial) or that's fighting.
//
// Where: in the lands whose kinds (biomes) it likes, anywhere (null), or only in the wilds of one
// people's lands (`people`: the uniques). Pure data and arithmetic, no DOM.

import { landAt, SETTLEMENTS } from "./worldplan/plan.js";

/** The team the wild's creatures are all on. */
export const WILD = "beasts";

/** How many tiers there are, and how much stronger each is than the last (hit points and blows each). */
export const TIERS = 10;
export const TIER_GROWTH = 1.18;

/**
 * Where tiers go up (metres from the nearest people's home): the first as far as FROM + EVERY,
 * then one more each EVERY further (up to OPEN, out in the open); the high, cold and burning
 * lands (PERILOUS) far out two more, up to TIERS.
 */
export const TIER_LAND = Object.freeze({ from: 1200, every: 850, open: 8, perilous: ["snow", "mountain", "volcanic"], perilousFrom: 6 });

// Lands no creature's found on (water, and the beach)
const BARREN = new Set(["sea", "lake", "beach"]);

// A creature's pack, and how it grows further out: its least to start with, one more every
// PACK_EVERY tiers above its least tier, up to its most
const PACK_EVERY = 2;

/**
 * Every creature: its name, hit points and weapon (at the first tier's), walking and chasing
 * speeds (m/s), `temper` (and `guard`: how near, squares, a territorial one lets anyone come),
 * how far it wanders (`roam`, metres) and chases (`leash`), its pack ([least, most]), the tiers
 * it's found at ([least, most]), where (`biomes`, or null for any land; `people`: only in their
 * lands' wilds), and how it bleeds.
 */
export const CREATURES = Object.freeze({
    // Near home, everywhere
    rat: { name: "Giant rat", hp: 22, weapon: "rat", speed: 1.2, chase: 2.8, temper: "aggressive", roam: 8, leash: 18, pack: [1, 2], tiers: [1, 3], biomes: null, blood: "red" },
    porcupine: { name: "Porcupine", hp: 34, weapon: "porcupine", speed: 0.8, chase: 1.6, temper: "defensive", roam: 6, leash: 10, pack: [1, 1], tiers: [1, 3], biomes: ["woods", "meadow", "heath", "farmland", "elfwood", "tundra"], blood: "red" },
    slime: { name: "Green slime", hp: 30, weapon: "slime", speed: 0.8, chase: 1.5, temper: "defensive", roam: 6, leash: 12, pack: [1, 2], tiers: [1, 3], biomes: ["meadow", "farmland", "woods", "marsh", "jungle", "elfwood"], blood: "slime" },
    bats: { name: "Bat swarm", hp: 26, weapon: "bats", speed: 1.6, chase: 3.2, temper: "aggressive", roam: 10, leash: 20, pack: [1, 1], tiers: [1, 4], biomes: null, blood: "red" },
    // Further out
    wolf: { name: "Wolf", hp: 24, weapon: "wolf", speed: 1.4, chase: 3.2, temper: "aggressive", roam: 12, leash: 24, pack: [2, 4], tiers: [2, 5], biomes: ["woods", "tundra", "heath", "elfwood", "meadow", "snow", "darkwood"], blood: "red" },
    boar: { name: "Wild boar", hp: 44, weapon: "boar", speed: 1.2, chase: 3, temper: "territorial", guard: 5, roam: 8, leash: 16, pack: [1, 2], tiers: [2, 5], biomes: ["woods", "farmland", "meadow", "heath", "jungle"], blood: "red" },
    snake: { name: "Adder", hp: 20, weapon: "snake", speed: 0.8, chase: 1.8, temper: "territorial", guard: 3, roam: 5, leash: 10, pack: [1, 1], tiers: [2, 6], biomes: ["heath", "meadow", "marsh", "savannah", "badlands", "jungle", "farmland"], blood: "red" },
    bandit: { name: "Bandit", hp: 32, weapon: "sword", speed: 1.3, chase: 2.4, temper: "aggressive", roam: 10, leash: 22, pack: [1, 3], tiers: [2, 7], biomes: ["farmland", "meadow", "woods", "heath"], blood: "red", armor: 0.05 },
    // Far out
    bear: { name: "Brown bear", hp: 60, weapon: "bear", speed: 1.2, chase: 2.8, temper: "territorial", guard: 7, roam: 10, leash: 18, pack: [1, 1], tiers: [3, 7], biomes: ["woods", "mountain", "tundra", "elfwood", "darkwood"], blood: "red" },
    puma: { name: "Puma", hp: 40, weapon: "puma", speed: 1.4, chase: 3.4, temper: "territorial", guard: 7, roam: 12, leash: 22, pack: [1, 1], tiers: [3, 7], biomes: ["mountain", "woods", "heath", "badlands", "darkwood"], blood: "red" },
    direWolf: { name: "Dire wolf", hp: 30, weapon: "direWolf", speed: 1.5, chase: 3.4, temper: "aggressive", roam: 14, leash: 26, pack: [1, 3], tiers: [3, 8], biomes: ["tundra", "snow", "woods", "heath", "mountain"], blood: "red" },
    goblin: { name: "Goblin raider", hp: 26, weapon: "cleaver", speed: 1.4, chase: 2.6, temper: "aggressive", roam: 10, leash: 22, pack: [2, 5], tiers: [3, 8], biomes: ["heath", "mountain", "badlands", "woods"], blood: "red" },
    skeleton: { name: "Skeleton", hp: 34, weapon: "skeleton", speed: 1, chase: 2, temper: "aggressive", roam: 6, leash: 16, pack: [1, 3], tiers: [3, 9], biomes: ["marsh", "heath", "tundra"], blood: "none", armor: 0.1 },
    cultist: { name: "Cultist", hp: 28, weapon: "wand", speed: 1.2, chase: 2.2, temper: "aggressive", roam: 8, leash: 20, pack: [1, 3], tiers: [3, 8], biomes: ["marsh", "jungle", "darkwood", "volcanic"], blood: "red" },
    // The far wilds
    troll: { name: "Troll", hp: 90, weapon: "hammer", speed: 1, chase: 2.2, temper: "aggressive", roam: 8, leash: 18, pack: [1, 2], tiers: [4, 9], biomes: ["mountain", "snow", "tundra", "heath"], blood: "red", armor: 0.1 },
    ogre: { name: "Ogre", hp: 80, weapon: "hammer", speed: 1, chase: 2, temper: "aggressive", roam: 8, leash: 18, pack: [1, 2], tiers: [4, 9], biomes: ["badlands", "heath", "mountain", "savannah", "marsh"], blood: "red", armor: 0.05 },
    wyvern: { name: "Wyvern", hp: 60, weapon: "wyvern", speed: 1.3, chase: 3, temper: "aggressive", roam: 14, leash: 26, pack: [1, 2], tiers: [5, 9], biomes: ["mountain", "badlands", "volcanic", "snow"], blood: "red", armor: 0.1 },
    // Only in the wilds of each people's lands
    blackShuck: { name: "Black shuck", hp: 50, weapon: "blackShuck", speed: 1.5, chase: 3.4, temper: "aggressive", roam: 14, leash: 26, pack: [1, 1], tiers: [3, 8], biomes: null, people: "human", blood: "none" },
    boggart: { name: "Boggart", hp: 30, weapon: "boggart", speed: 1.2, chase: 2.4, temper: "territorial", guard: 6, roam: 8, leash: 16, pack: [1, 1], tiers: [2, 6], biomes: null, people: "human", blood: "red" },
    wisp: { name: "Will-o'-wisp", hp: 22, weapon: "wisp", speed: 1, chase: 2, temper: "aggressive", roam: 12, leash: 20, pack: [1, 2], tiers: [2, 7], biomes: null, people: "elf", blood: "none" },
    treant: { name: "Blighted treant", hp: 80, weapon: "treant", speed: 0.7, chase: 1.4, temper: "territorial", guard: 5, roam: 4, leash: 12, pack: [1, 1], tiers: [4, 9], biomes: null, people: "elf", blood: "sap", armor: 0.15 },
    caveSpider: { name: "Cave spider", hp: 24, weapon: "caveSpider", speed: 1.3, chase: 2.8, temper: "territorial", guard: 5, roam: 8, leash: 18, pack: [1, 4], tiers: [2, 7], biomes: null, people: "darkElf", blood: "ichor" },
    shadowStalker: { name: "Shadow stalker", hp: 50, weapon: "shadowStalker", speed: 1.4, chase: 3.4, temper: "aggressive", roam: 14, leash: 26, pack: [1, 1], tiers: [4, 9], biomes: null, people: "darkElf", blood: "none" },
    hyena: { name: "Hyena", hp: 22, weapon: "hyena", speed: 1.4, chase: 3, temper: "aggressive", roam: 14, leash: 24, pack: [2, 5], tiers: [2, 7], biomes: null, people: "cat", blood: "red" },
    scorpion: { name: "Sand scorpion", hp: 30, weapon: "scorpion", speed: 1, chase: 2.2, temper: "territorial", guard: 4, roam: 6, leash: 12, pack: [1, 2], tiers: [2, 7], biomes: null, people: "cat", blood: "ichor", armor: 0.1 },
    bogFrog: { name: "Bog frog", hp: 28, weapon: "bogFrog", speed: 1, chase: 2, temper: "territorial", guard: 3, roam: 6, leash: 12, pack: [1, 2], tiers: [2, 6], biomes: null, people: "lizard", blood: "red" },
    crocodile: { name: "Marsh crocodile", hp: 60, weapon: "crocodile", speed: 0.8, chase: 2.4, temper: "territorial", guard: 5, roam: 6, leash: 12, pack: [1, 1], tiers: [3, 8], biomes: null, people: "lizard", blood: "red", armor: 0.15 },
    magmaSlime: { name: "Magma slime", hp: 45, weapon: "magmaSlime", speed: 0.7, chase: 1.4, temper: "territorial", guard: 3, roam: 5, leash: 10, pack: [1, 2], tiers: [3, 8], biomes: null, people: "orc", blood: "none", armor: 0.1 },
    rockTusker: { name: "Rock tusker", hp: 80, weapon: "rockTusker", speed: 1.1, chase: 2.8, temper: "territorial", guard: 6, roam: 8, leash: 16, pack: [1, 1], tiers: [4, 9], biomes: null, people: "orc", blood: "none", armor: 0.2 },
    // The mightiest: only in the perilous places
    dragon: { name: "Dragon", hp: 90, weapon: "dragon", speed: 1, chase: 2.2, temper: "aggressive", roam: 6, leash: 30, pack: [1, 1], tiers: [10, 10], biomes: [], blood: "red", armor: 0.25, perilous: true },
    wightLord: { name: "Wight lord", hp: 70, weapon: "wightLord", speed: 1.1, chase: 2.2, temper: "aggressive", roam: 4, leash: 26, pack: [1, 1], tiers: [9, 10], biomes: [], blood: "none", armor: 0.25, perilous: true },
    frostTroll: { name: "Frost troll", hp: 75, weapon: "frostTroll", speed: 1, chase: 2.2, temper: "aggressive", roam: 10, leash: 22, pack: [1, 1], tiers: [9, 10], biomes: ["snow"], blood: "red", armor: 0.2, perilous: true },
});

/**
 * The wild camps' folk (the world plan's camps: worldplan/races.js FACTIONS), by faction: what
 * each is, by tier (the first whose tier it is at or above, from the mightiest down).
 */
export const CAMP_FOLK = Object.freeze({
    bandits: [["bandit", 1]],
    wolves: [["direWolf", 4], ["wolf", 1]],
    goblins: [["goblin", 1]],
    spiders: [["caveSpider", 1]],
    undead: [["skeleton", 1]],
    trolls: [["frostTroll", 9], ["troll", 1]],
    raiders: [["ogre", 5], ["goblin", 1]],
    cultists: [["cultist", 1]],
});

/**
 * The perilous sites (the world plan's), and who holds each: its master (and its tier), and those
 * who guard it with it ([kind, how many, tier]); how near a player must come for them to be there
 * (metres), and how long the master's gone once it's slain (battle ms).
 */
export const LAIRS = Object.freeze({
    "dragon's lair": { master: ["dragon", 10], guards: [["wyvern", 2, 8]], near: 110, back: 45 * 60 * 1000 },
    "ruined castle": { master: ["wightLord", 9], guards: [["skeleton", 4, 7]], near: 90, back: 30 * 60 * 1000 },
});

/** How many hit points, and how much harder its blows are, a creature of a tier has (than the first tier's). */
export const tierPower = (tier) => TIER_GROWTH ** (Math.max(1, tier) - 1);

/** Is a creature a menace (the people's soldiers go after it): one that comes for others. */
export const menaces = (creature) => CREATURES[creature]?.temper !== "defensive";

/** How big a creature's pack is at a tier: its least, and one more every PACK_EVERY tiers above its least tier, up to its most. */
export function packOf(id, tier) {
    const { pack: [least, most], tiers: [first] } = CREATURES[id];

    return Math.min(most, least + Math.floor(Math.max(0, tier - first) / PACK_EVERY));
}

/**
 * The tier of a place in the world ([x, y] metres), from how far it is from the nearest of
 * `homes` (where each people's players start: [[x, y]]) and what land it is (`biome`): one to
 * TIER_LAND.open out in the open, up to TIERS in the high and burning lands far out.
 */
export function tierAt([x, y], homes, biome = null) {
    const nearest = Math.min(...homes.map(([hx, hy]) => Math.hypot(x - hx, y - hy)));
    const open = Math.min(TIER_LAND.open, 1 + Math.floor(Math.max(0, nearest - TIER_LAND.from) / TIER_LAND.every));

    return open >= TIER_LAND.perilousFrom && TIER_LAND.perilous.includes(biome) ? Math.min(TIERS, open + 2) : open;
}

/** Can a creature live on land of a kind (`biome`), in a people's lands (`race`, or none)? */
export function livesOn(id, { biome, race }) {
    const creature = CREATURES[id];

    if (BARREN.has(biome)) {
        return false;
    }

    if (creature.people && creature.people !== race) {
        return false;
    }

    return creature.biomes === null || creature.biomes.includes(biome);
}

/**
 * What creatures could be met at a place in the world: those that live on its land (landAt's
 * { biome, race }) and are found at its tier (none of the perilous places' masters, who only
 * come from there, save the frost trolls of the high snows). The uniques of the people whose lands
 * they are come twice as often.
 */
export function candidatesAt(land, tier) {
    const found = Object.entries(CREATURES).filter(([id, creature]) => livesOn(id, land) && tier >= creature.tiers[0] && tier <= creature.tiers[1] && (!creature.perilous || id === "frostTroll"));

    return found.map(([id, creature]) => ({ id, weight: creature.people ? 2 : 1 }));
}

/**
 * Which creatures, and how many, to put out at a place (`random`: createRandom's): one kind
 * that lives there at its tier (null if none do), its pack as big as that tier has it.
 */
export function encounterAt(plan, [x, y], homes, random) {
    const land = landAt(plan, x, y);
    const tier = tierAt([x, y], homes, land.biome);
    const candidates = candidatesAt(land, tier);

    if (!candidates.length) {
        return null;
    }

    const { id } = random.pickWeighted(candidates, ({ weight }) => weight);

    return { creature: id, tier, count: packOf(id, tier) };
}

/** What a wild camp's folk are at its tier (CAMP_FOLK). */
export function campFolk(faction, tier) {
    return (CAMP_FOLK[faction] ?? CAMP_FOLK.bandits).find(([, from]) => tier >= from)[0];
}

/** Is a place clear of every settlement (metres beyond each's edge)? */
export function clearOfSettlements(plan, [x, y], beyond) {
    return plan.places.every((place) => Math.hypot(x - place.at[0], y - place.at[1]) > (SETTLEMENTS[place.kind]?.radius ?? 40) + beyond);
}
