// What the world plan is made of: the peoples who live in it and the climate each lives in, the
// kinds of land (biomes), and the enemies whose camps are scattered through the wild places.
//
// Each people keeps its own climate in every world (the plan warms, cools, wets and dries the land
// round wherever their heartland falls), so elves always live in their old forests and the cat
// folk on their savannah, however the lands are arranged.

/**
 * The peoples, in the order their territories are numbered (territory k + 1 is RACES[k]), their
 * names (all of them, and one of them):
 *
 * - climate: the temperature and moisture of their heartland (0 to 1: 0 is arctic or desert
 *   dry, 1 tropical or sodden), which the land round it takes on.
 * - lands: the biomes of their territory, by how wet it is there (dry to wet), and on hills.
 * - names: the sounds their place names are made from (starts, middles, ends).
 * - structures: buildings found only in their lands.
 */
export const RACES = Object.freeze([
    {
        id: "human",
        name: "Humans",
        one: "a human",
        climate: { temperature: 0.55, moisture: 0.55 },
        lands: { dry: "heath", mid: "farmland", wet: "woods", hills: "meadow" },
        names: {
            starts: ["Ash", "Brom", "Cal", "Dun", "Elm", "Fen", "Gal", "Hart", "Ing", "Kel", "Lang", "Mar", "Nor", "Oak", "Pen", "Red", "Stan", "Thorn", "Wil", "York"],
            middles: ["", "", "", "e", "ing", "den", "ham", "ley"],
            ends: ["ford", "ton", "wick", "bury", "field", "stead", "bridge", "moor", "dale", "worth", "gate", "holm"],
        },
        structures: ["abbey", "windmill", "manor"],
    },
    {
        id: "elf",
        name: "Elves",
        one: "an elf",
        climate: { temperature: 0.55, moisture: 0.8 },
        lands: { dry: "meadow", mid: "elfwood", wet: "elfwood", hills: "elfwood" },
        names: {
            starts: ["Ael", "Cael", "Eil", "Fae", "Ith", "Lor", "Mel", "Nim", "Qua", "Sil", "Tal", "Yl", "Ara", "Elen", "Galad"],
            middles: ["", "a", "e", "i", "ae", "ia", "ari", "ele"],
            ends: ["thil", "wen", "ion", "dor", "lin", "nor", "riel", "thas", "vyn", "lond", "mere", "ost"],
        },
        structures: ["moonwell", "tree hall", "starwatch"],
    },
    {
        id: "darkElf",
        name: "Dark elves",
        one: "a dark elf",
        climate: { temperature: 0.4, moisture: 0.7 },
        lands: { dry: "heath", mid: "darkwood", wet: "darkwood", hills: "darkwood" },
        names: {
            starts: ["Vel", "Zyr", "Mal", "Xan", "Ryl", "Ulv", "Dra", "Qil", "Sza", "Nyx", "Vor", "Ilh"],
            middles: ["", "a", "i", "y", "ae", "ith", "or"],
            ends: ["oth", "ryn", "zar", "dra", "ghul", "vek", "thra", "mith", "rae", "zith", "lor", "duth"],
        },
        structures: ["spider shrine", "obsidian spire", "shadow gate"],
    },
    {
        id: "cat",
        name: "Cat folk",
        one: "one of the cat folk",
        climate: { temperature: 0.82, moisture: 0.3 },
        lands: { dry: "savannah", mid: "savannah", wet: "savannah", hills: "savannah" },
        names: {
            starts: ["Ra", "Sha", "Khe", "Mi", "Ta", "Ja", "Ni", "Sa", "Ka", "Ze", "Ma", "Pu"],
            middles: ["", "", "r", "rr", "ss", "h", "mi"],
            ends: ["rah", "ssa", "mir", "ruun", "sha", "khan", "ari", "pur", "tali", "zeh", "mau", "rri"],
        },
        structures: ["sun temple", "pride rock", "watering hole"],
    },
    {
        id: "lizard",
        name: "Lizard folk",
        one: "one of the lizard folk",
        climate: { temperature: 0.85, moisture: 0.85 },
        lands: { dry: "jungle", mid: "jungle", wet: "marsh", hills: "jungle" },
        names: {
            starts: ["Ssk", "Xa", "Zol", "Tss", "Ix", "Kss", "Yaz", "Sith", "Chak", "Oq", "Tla", "Hiss"],
            middles: ["", "a", "i", "o", "ss", "x", "tz"],
            ends: ["tlan", "ix", "ssa", "koth", "zul", "tek", "oq", "rith", "xal", "chak", "ssik", "iztl"],
        },
        structures: ["ziggurat", "hatchery", "serpent pool"],
    },
    {
        id: "orc",
        name: "Orcs",
        one: "an orc",
        climate: { temperature: 0.6, moisture: 0.12 },
        lands: { dry: "badlands", mid: "badlands", wet: "heath", hills: "volcanic" },
        names: {
            starts: ["Gor", "Mug", "Grom", "Ur", "Kra", "Druk", "Zug", "Bol", "Rok", "Thrak", "Gash", "Nar"],
            middles: ["", "", "a", "u", "ug", "ra"],
            ends: ["gash", "rak", "dush", "mog", "grat", "ruk", "gor", "zag", "bur", "tuk", "nak", "rot"],
        },
        structures: ["war totem", "skull pit", "fighting pit"],
    },
]);

/** The peoples by id. */
export const RACE = Object.freeze(Object.fromEntries(RACES.map((race) => [race.id, race])));

/**
 * The kinds of land, in the order they're numbered in the plan's `biome` layer; `colour` for the
 * world map. `wild` biomes are where no people live (the climate alone decides them).
 */
export const BIOMES = Object.freeze([
    { id: "sea", colour: "#2c5a7a", water: true },
    { id: "lake", colour: "#3f7aa0", water: true },
    { id: "farmland", colour: "#b8b565" },
    { id: "meadow", colour: "#8fbf5f" },
    { id: "woods", colour: "#4d7f3a" },
    { id: "heath", colour: "#9a8a66" },
    { id: "marsh", colour: "#5f7d5a" },
    { id: "elfwood", colour: "#3fa06a" },
    { id: "darkwood", colour: "#3d3a52" },
    { id: "savannah", colour: "#cfb35f" },
    { id: "jungle", colour: "#2f7a3a" },
    { id: "badlands", colour: "#a0684a" },
    { id: "volcanic", colour: "#4a3632" },
    { id: "tundra", colour: "#a9b6b0" },
    { id: "snow", colour: "#eef2f4" },
    { id: "mountain", colour: "#7d7670" },
    { id: "beach", colour: "#e0d09a" },
]);

/** Each biome's number in the plan's `biome` layer, by id. */
export const BIOME = Object.freeze(Object.fromEntries(BIOMES.map(({ id }, k) => [id, k])));

/**
 * The enemies who make camps in the wild, and where they like to (biomes, or near: ruins,
 * roads, caves). Their camps send out patrols that roam no further than a camp's `roam` metres,
 * so meeting them means a camp is somewhere near; the camps' strength (tier) is decided in play,
 * by how far they are from where the player started.
 */
export const FACTIONS = Object.freeze([
    { id: "bandits", name: "Bandits", biomes: ["farmland", "meadow", "woods", "heath"], near: "roads" },
    { id: "wolves", name: "Wolf pack", biomes: ["woods", "tundra", "heath", "elfwood"] },
    { id: "goblins", name: "Goblins", biomes: ["heath", "mountain", "badlands", "woods"], near: "caves" },
    { id: "spiders", name: "Giant spiders", biomes: ["darkwood", "jungle"] },
    { id: "undead", name: "Restless dead", biomes: ["marsh", "heath", "tundra"], near: "ruins" },
    { id: "trolls", name: "Trolls", biomes: ["mountain", "snow", "tundra"] },
    { id: "raiders", name: "Raiders", biomes: ["badlands", "savannah", "volcanic"] },
    { id: "cultists", name: "Cultists", biomes: ["marsh", "jungle", "darkwood", "volcanic"], near: "ruins" },
]);

/**
 * Each people's works (docs/WAR.md *The works*): where what they build with comes from, `count` of
 * each in their lands. A lumber mill in the woods, a mine and a quarry up in the hills, where
 * there are any (`biomes`, `hills`: the land each would rather be in; anywhere in their lands
 * otherwise); and what each yields (`yields`): wood, metal or stone.
 */
export const WORKS = Object.freeze([
    { kind: "lumber mill", count: 2, yields: "wood", biomes: ["woods", "elfwood", "darkwood", "jungle", "marsh", "savannah"], hills: false },
    { kind: "mine", count: 2, yields: "metal", biomes: ["mountain", "badlands", "volcanic", "heath", "tundra"], hills: true },
    { kind: "quarry", count: 2, yields: "stone", biomes: ["mountain", "heath", "badlands", "meadow", "tundra", "savannah"], hills: true },
]);

/**
 * The places between the settlements: what they are, how many in a world, and where they're
 * found (biomes; `wild`: only outside every people's lands; `race`: in each people's lands).
 */
export const SITES = Object.freeze([
    { kind: "ruins", count: 36, biomes: null },
    { kind: "cave", count: 28, biomes: ["mountain", "heath", "badlands", "volcanic", "tundra", "darkwood", "woods"], hills: true },
    { kind: "shrine", count: 26, biomes: null },
    { kind: "standing stones", count: 14, biomes: ["heath", "meadow", "tundra", "marsh", "farmland"] },
    { kind: "watchtower", count: 18, biomes: null, near: "roads" },
    { kind: "ruined castle", count: 5, biomes: null, wild: true },
    { kind: "dragon's lair", count: 1, biomes: ["volcanic", "mountain", "snow"], wild: true },
]);
