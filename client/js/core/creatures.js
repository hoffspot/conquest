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
// people's lands (`people`: the uniques).
//
// When (the terrain plan's M7e, §9 Night in play): some are the night's own, out only after dark
// (`night` "only": the bats, the restless dead (skeletons, ghosts, wraiths), the wisps, the black
// shuck, the shadow stalkers, the hodmedods, the mares),
// gone to ground by day; some hunt by night, met more often then (`night` "more": the wolves, the
// big cats, the hyenas and jackals, the scorpions, the badgers, the hounds of Annwn, the Nandi
// bear, the bloodflies, the giant centipedes, the kelpies, the ahuizotls, the draugar, the
// cultists at their rites); and some see in the
// dark as by day (`darkSight`), so out of the light they see a hero before the hero sees them.
// Pure data and arithmetic, no DOM.

import { landAt, SETTLEMENTS } from "./worldplan/plan.js";
import { cos, hypot, pow, sin } from "./exact.js";

/** The team the wild's creatures are all on. */
export const WILD = "beasts";

/**
 * The team of what comes through the rift outside the Tower of Sar Mordal (the Behemoth of the
 * Rift: CREATURES kaiju): everyone's enemy, whatever their side, and everyone its (host.js #against).
 */
export const RIFT = "rift";

/** How many tiers there are, and how much stronger each is than the last (hit points and blows each). */
export const TIERS = 10;
export const TIER_GROWTH = 1.18;

/**
 * Where tiers go up (metres from the nearest people's home): the first as far as FROM + EVERY,
 * then one more each EVERY further (up to OPEN, out in the open); the high, cold and burning
 * lands (PERILOUS) far out two more, up to TIERS.
 */
export const TIER_LAND = Object.freeze({ from: 600, every: 850, open: 8, perilous: ["snow", "mountain", "volcanic"], perilousFrom: 6 });

// Lands no creature's found on (water, and the beach)
const BARREN = new Set(["sea", "lake", "beach"]);

// A creature's pack, and how it grows further out: its least to start with, one more every
// PACK_EVERY tiers above its least tier, up to its most
const PACK_EVERY = 2;

/**
 * How the colossal fight (the Behemoth of the Rift: CREATURES kaiju, battle.js #colossus), in
 * metres and ms:
 *  - `body`: the middle of its body, `ahead` metres before where it stands (where its model's made
 *    standing, under its hips: its hind feet 2.5 metres before that, its fore feet 12), and how
 *    far it reaches every way from there (`half`): the squares it stands over (battle.js
 *    `footprint`), what's after it closing to the nearest of them;
 *  - `sight`: how far it sees whoever it'd fight; `turn`: how fast it turns (radians a second);
 *  - `tread`: whoever's under it as it walks, every `every` ms: within `reach` of its body's
 *    middle, hurt (`damage`) and thrown aside (`toss`); standing, its feet shifted every `still`
 *    ms, whoever's within `round` of its body's middle (under it, or hard against it);
 *  - its moves, each its weapon's attack of that id (weapons.js NATURAL kaiju), made no sooner
 *    than `every` ms after it last made it: `slam`, its jaws slammed down `ahead` metres before
 *    where it stands (or `near`, whichever catches more), `radius` round, whenever anyone's there;
 *    `roar`, everyone within `radius` thrown off their feet, once `crowd` of them are; `breath`,
 *    raked over the ground from `reach[0]` to `reach[1]` metres before its mouth (`mouth` metres
 *    before where it stands: as beasts/beam.js aims it), a blast `radius` round where it lands
 *    every `tick` ms, whoever it catches hurt once and thrown, whenever enough of them (`crowd`)
 *    stand where it would land (or all of them about, with fewer left).
 */
export const COLOSSUS = Object.freeze({
    body: Object.freeze({ ahead: 7, half: 6 }),
    sight: 90,
    turn: 0.6,
    tread: Object.freeze({ every: 700, still: 1800, reach: 6.5, round: 7.5, damage: Object.freeze([5, 9]), toss: 1.2 }),
    slam: Object.freeze({ ahead: 16, near: 10, radius: 5, toss: 1.6, every: 5000 }),
    roar: Object.freeze({ radius: 15, toss: 2, crowd: 5, every: 18000 }),
    breath: Object.freeze({ mouth: 15.9, reach: Object.freeze([13, 18]), radius: 4, tick: 250, toss: 2.6, crowd: 3, every: 12000 }),
});

/**
 * Every creature: its name, hit points and weapon (at the first tier's), walking and chasing
 * speeds (m/s), `temper` (and `guard`: how near, squares, a territorial one lets anyone come),
 * how far it wanders (`roam`, metres) and chases (`leash`), its pack ([least, most]), the tiers
 * it's found at ([least, most]), where (`biomes`, or null for any land; `people`: only in their
 * lands' wilds), how it bleeds, and whether it has `hands` (to carry what a beast wouldn't: a
 * spell's tome, spoils.js); when it's about (`night`: "only" after dark, "more" often after dark)
 * and whether it sees in the dark (`darkSight`). Some go about with others of their own among them
 * (`band`: each of a pack but its leader, by chance, one of those: memberOf), and have their own
 * elite (`elite`: what leads them in their elite's place, ELITES; one that's an elite itself,
 * `king`, goes by its own name). How it fights besides its weapon (battle.js, the actor's `wild`:
 * traitsOf): too heavy to be thrown by a blast, or not solid enough (`steady`); keeping `keep`
 * metres off whoever it's after; a bomb it lobs now and then (`bomb`), and as a dungeon's boss
 * (`boss`: what of `bomb` it does otherwise, its throne room's: the caves' Goblin King); taking to
 * the air now and then once it's badly hurt (`hover`: at `below` its hit points or fewer, a share;
 * `ms` up there, `every` ms at least from coming down to going up again, `rise` ms going up and
 * as long coming down), out of reach of any blow up close meanwhile (battle.js #hover); calling
 * more of a kind to it now and then while it fights (`call`: { kind, count: [least, most], `most`
 * of them about it at once, every `every` ms, the first `first` ms after it sets on someone:
 * battle.js #calls, brought by the host, host.js #flock), and as a dungeon's boss its `boss`
 * `call`'s (the ants' nest's Ant Monster); bursting as it dies (`burst`: a bomb of that `kind` left
 * where it falls, battle.js BOMBS, its `damage` at the blast's heart: a hell's Cinder Husk). How
 * little some kinds of harm hurt it (`wards`: { fire, water, air, earth, magic }, a share kept
 * off each, as a player's charms keep it: battle.js `charmed`, half at most). One too vast for any
 * of that fights its own way (`colossus`: COLOSSUS, battle.js #colossus).
 */
export const CREATURES = Object.freeze({
    // Near home, everywhere
    rat: { name: "Giant rat", hp: 22, weapon: "rat", speed: 1.2, chase: 2.8, temper: "aggressive", roam: 8, leash: 18, pack: [1, 2], tiers: [1, 3], biomes: null, blood: "red" },
    porcupine: { name: "Porcupine", hp: 34, weapon: "porcupine", speed: 0.8, chase: 1.6, temper: "defensive", roam: 6, leash: 10, pack: [1, 1], tiers: [1, 3], biomes: ["woods", "meadow", "heath", "farmland", "elfwood", "tundra"], blood: "red" },
    slime: { name: "Green slime", hp: 30, weapon: "slime", speed: 0.8, chase: 1.5, temper: "defensive", roam: 6, leash: 12, pack: [1, 2], tiers: [1, 3], biomes: ["meadow", "farmland", "woods", "marsh", "jungle", "elfwood"], blood: "slime" },
    bats: { name: "Bat swarm", hp: 26, weapon: "bats", speed: 1.6, chase: 3.2, temper: "aggressive", roam: 10, leash: 20, pack: [1, 1], tiers: [1, 4], biomes: null, blood: "red", night: "only", darkSight: true , steady: true },
    // Further out
    wolf: { name: "Wolf", hp: 24, weapon: "wolf", speed: 1.4, chase: 3.2, temper: "aggressive", roam: 12, leash: 24, pack: [2, 4], tiers: [2, 5], biomes: ["woods", "tundra", "heath", "elfwood", "meadow", "snow", "darkwood"], blood: "red", night: "more", darkSight: true },
    boar: { name: "Wild boar", hp: 44, weapon: "boar", speed: 1.2, chase: 3, temper: "territorial", guard: 5, roam: 8, leash: 16, pack: [1, 2], tiers: [2, 5], biomes: ["woods", "farmland", "meadow", "heath", "jungle"], blood: "red" },
    snake: { name: "Adder", hp: 20, weapon: "snake", speed: 0.8, chase: 1.8, temper: "territorial", guard: 3, roam: 5, leash: 10, pack: [1, 1], tiers: [2, 6], biomes: ["heath", "meadow", "marsh", "savannah", "badlands", "jungle", "farmland"], blood: "red" },
    bandit: { name: "Bandit", hp: 32, hands: true, weapon: "sword", speed: 1.3, chase: 2.4, temper: "aggressive", roam: 10, leash: 22, pack: [1, 3], tiers: [2, 7], biomes: ["farmland", "meadow", "woods", "heath"], blood: "red", armor: 0.05 },
    // (The leader of the outlaws holding a place: core/places.js; met only there)
    banditChief: { name: "Bandit chief", hp: 64, hands: true, weapon: "sword", speed: 1.3, chase: 2.4, temper: "aggressive", roam: 4, leash: 20, pack: [1, 1], tiers: [1, 10], biomes: [], blood: "red", armor: 0.2, perilous: true },
    // Far out
    bear: { name: "Brown bear", hp: 60, weapon: "bear", speed: 1.2, chase: 2.8, temper: "territorial", guard: 7, roam: 10, leash: 18, pack: [1, 1], tiers: [3, 7], biomes: ["woods", "mountain", "tundra", "elfwood", "darkwood"], blood: "red" , steady: true },
    puma: { name: "Puma", hp: 40, weapon: "puma", speed: 1.4, chase: 3.4, temper: "territorial", guard: 7, roam: 12, leash: 22, pack: [1, 1], tiers: [3, 7], biomes: ["mountain", "woods", "heath", "badlands", "darkwood"], blood: "red", night: "more", darkSight: true },
    direWolf: { name: "Dire wolf", hp: 30, weapon: "direWolf", speed: 1.5, chase: 3.4, temper: "aggressive", roam: 14, leash: 26, pack: [1, 3], tiers: [3, 8], biomes: ["tundra", "snow", "woods", "heath", "mountain"], blood: "red", night: "more", darkSight: true },
    // (A werewolf: a man or a woman under a curse, out only by night at the head of the wolves it
    // calls to it, two to four of them, dire wolves and wolves; quick, strong and too heavy to be
    // thrown. Its claws rake and lay a wound open, and now and then it springs on whoever it's
    // after: weapons.js. Drawn from a model of its own once it's read: beasts/model.js)
    werewolf: { name: "Werewolf", hp: 64, weapon: "werewolf", speed: 1.4, chase: 3.8, temper: "aggressive", roam: 14, leash: 30, pack: [3, 5], tiers: [5, 9], biomes: ["woods", "darkwood", "heath", "tundra", "elfwood", "mountain", "meadow"], blood: "red", armor: 0.1, night: "only", darkSight: true, steady: true, band: { direWolf: 0.55, wolf: 0.45 } },
    goblin: { name: "Goblin raider", hp: 26, hands: true, weapon: "cleaver", speed: 1.4, chase: 2.6, temper: "aggressive", roam: 10, leash: 22, pack: [2, 5], tiers: [3, 8], biomes: ["heath", "mountain", "badlands", "woods"], blood: "red", band: { goblinBomber: 0.3 }, elite: "goblinKing" },
    // (The goblins' own, never met on their own: a bomber among a raiding party, keeping off and
    // lobbing lit bombs; and the Goblin King leading a war band, their elite, a great cleaver up
    // close and a bigger bomb now and then at whoever keeps off: BANDS, ELITES; the caves' boss,
    // harder still, three at a time and oftener: dungeons/themes.js)
    goblinBomber: { name: "Goblin bomber", hp: 22, hands: true, weapon: "goblinBomber", speed: 1.4, chase: 2.6, temper: "aggressive", roam: 10, leash: 22, pack: [1, 1], tiers: [3, 8], biomes: [], blood: "red", keep: 4 },
    goblinKing: { name: "Goblin King", hp: 34, hands: true, weapon: "cleaver", speed: 1.3, chase: 2.5, temper: "aggressive", roam: 10, leash: 22, pack: [1, 1], tiers: [3, 8], biomes: [], blood: "red", armor: 0.1, king: true, bomb: { kind: "bigBomb", damage: [8, 15], every: 7000, beyond: 3.5, reach: 11 }, boss: { bomb: { every: 4500, volley: 3, spread: 3 } } },
    skeleton: { name: "Skeleton", hp: 34, hands: true, weapon: "skeleton", speed: 1, chase: 2, temper: "aggressive", roam: 6, leash: 16, pack: [1, 3], tiers: [3, 9], biomes: ["marsh", "heath", "tundra"], blood: "none", armor: 0.1, night: "only", darkSight: true },
    cultist: { name: "Cultist", hp: 28, hands: true, weapon: "wand", speed: 1.2, chase: 2.2, temper: "aggressive", roam: 8, leash: 20, pack: [1, 3], tiers: [3, 8], biomes: ["marsh", "jungle", "darkwood", "volcanic"], blood: "red", night: "more" },
    // The far wilds
    troll: { name: "Troll", hp: 90, hands: true, weapon: "hammer", speed: 1, chase: 2.2, temper: "aggressive", roam: 8, leash: 18, pack: [1, 2], tiers: [4, 9], biomes: ["mountain", "snow", "tundra", "heath"], blood: "red", armor: 0.1 , steady: true },
    ogre: { name: "Ogre", hp: 80, hands: true, weapon: "hammer", speed: 1, chase: 2, temper: "aggressive", roam: 8, leash: 18, pack: [1, 2], tiers: [4, 9], biomes: ["badlands", "heath", "mountain", "savannah", "marsh"], blood: "red", armor: 0.05 , steady: true },
    wyvern: { name: "Wyvern", hp: 60, weapon: "wyvern", speed: 1.3, chase: 3, temper: "aggressive", roam: 14, leash: 26, pack: [1, 2], tiers: [5, 9], biomes: ["mountain", "badlands", "volcanic", "snow"], blood: "red", armor: 0.1 , steady: true },
    // Only in the wilds of each people's lands
    blackShuck: { name: "Black shuck", hp: 50, weapon: "blackShuck", speed: 1.5, chase: 3.4, temper: "aggressive", roam: 14, leash: 26, pack: [1, 1], tiers: [3, 8], biomes: null, people: "human", blood: "none", night: "only", darkSight: true },
    boggart: { name: "Boggart", hp: 30, hands: true, weapon: "boggart", speed: 1.2, chase: 2.4, temper: "territorial", guard: 6, roam: 8, leash: 16, pack: [1, 1], tiers: [1, 6], biomes: null, people: "human", blood: "red" },
    badger: { name: "Badger", hp: 30, weapon: "badger", speed: 1, chase: 2.4, temper: "territorial", guard: 4, roam: 6, leash: 12, pack: [1, 1], tiers: [1, 4], biomes: ["woods", "heath", "meadow"], people: "human", blood: "red", night: "more", darkSight: true },
    wildBull: { name: "Wild bull", hp: 56, weapon: "wildBull", speed: 1.1, chase: 2.8, temper: "territorial", guard: 6, roam: 8, leash: 16, pack: [1, 2], tiers: [2, 6], biomes: ["meadow", "farmland"], people: "human", blood: "red", steady: true },
    rookFlock: { name: "Rook flock", hp: 24, weapon: "rookFlock", speed: 1.6, chase: 3.2, temper: "territorial", guard: 6, roam: 10, leash: 18, pack: [1, 1], tiers: [1, 4], biomes: ["farmland", "meadow"], people: "human", blood: "red", steady: true },
    knucker: { name: "Knucker", hp: 70, weapon: "knucker", speed: 0.9, chase: 2.4, temper: "territorial", guard: 6, roam: 6, leash: 14, pack: [1, 1], tiers: [3, 8], biomes: ["woods", "marsh", "meadow"], people: "human", blood: "red", steady: true },
    hodmedod: { name: "Hodmedod", hp: 44, weapon: "hodmedod", speed: 1.1, chase: 2.6, temper: "aggressive", roam: 8, leash: 18, pack: [1, 1], tiers: [2, 7], biomes: ["farmland"], people: "human", blood: "none", night: "only", darkSight: true },
    wisp: { name: "Will-o'-wisp", hp: 22, weapon: "wisp", speed: 1, chase: 2, temper: "aggressive", roam: 12, leash: 20, pack: [1, 2], tiers: [1, 7], biomes: null, people: "elf", blood: "none", night: "only", darkSight: true , steady: true },
    treant: { name: "Blighted treant", hp: 80, weapon: "treant", speed: 0.7, chase: 1.4, temper: "territorial", guard: 5, roam: 4, leash: 12, pack: [1, 1], tiers: [4, 9], biomes: null, people: "elf", blood: "sap", armor: 0.15 , steady: true },
    mandrake: { name: "Mandrake", hp: 20, weapon: "mandrake", speed: 0.8, chase: 1.6, temper: "defensive", roam: 4, leash: 10, pack: [1, 2], tiers: [1, 4], biomes: ["elfwood"], people: "elf", blood: "sap" },
    cwnAnnwn: { name: "Hound of Annwn", hp: 28, weapon: "cwnAnnwn", speed: 1.5, chase: 3.4, temper: "aggressive", roam: 14, leash: 26, pack: [2, 4], tiers: [3, 7], biomes: null, people: "elf", blood: "red", night: "more", darkSight: true },
    pixies: { name: "Pixie swarm", hp: 20, weapon: "pixies", speed: 1.5, chase: 3, temper: "territorial", guard: 5, roam: 10, leash: 18, pack: [1, 1], tiers: [1, 4], biomes: ["elfwood", "meadow"], people: "elf", blood: "none", steady: true },
    hart: { name: "Hart", hp: 40, weapon: "hart", speed: 1.4, chase: 3, temper: "territorial", guard: 6, roam: 12, leash: 20, pack: [1, 3], tiers: [2, 5], biomes: ["meadow", "elfwood"], people: "elf", blood: "red" },
    kelpie: { name: "Kelpie", hp: 62, weapon: "kelpie", speed: 1.4, chase: 3.2, temper: "aggressive", roam: 10, leash: 22, pack: [1, 1], tiers: [3, 8], biomes: null, people: "elf", blood: "red", night: "more", darkSight: true, steady: true },
    caveSpider: { name: "Cave spider", hp: 24, weapon: "caveSpider", speed: 1.3, chase: 2.8, temper: "territorial", guard: 5, roam: 8, leash: 18, pack: [1, 4], tiers: [1, 7], biomes: null, people: "darkElf", blood: "ichor", darkSight: true },
    shadowStalker: { name: "Shadow stalker", hp: 50, weapon: "shadowStalker", speed: 1.4, chase: 3.4, temper: "aggressive", roam: 14, leash: 26, pack: [1, 1], tiers: [4, 9], biomes: null, people: "darkElf", blood: "none", night: "only", darkSight: true },
    olm: { name: "Cave olm", hp: 26, weapon: "olm", speed: 0.8, chase: 2, temper: "territorial", guard: 3, roam: 5, leash: 10, pack: [1, 2], tiers: [1, 4], biomes: null, people: "darkElf", blood: "red", darkSight: true },
    centipede: { name: "Giant centipede", hp: 26, weapon: "centipede", speed: 1.3, chase: 2.8, temper: "aggressive", roam: 10, leash: 18, pack: [1, 2], tiers: [1, 5], biomes: null, people: "darkElf", blood: "ichor", night: "more", darkSight: true },
    basilisk: { name: "Basilisk", hp: 44, weapon: "basilisk", speed: 0.9, chase: 2.2, temper: "territorial", guard: 5, roam: 6, leash: 12, pack: [1, 1], tiers: [3, 7], biomes: null, people: "darkElf", blood: "red", darkSight: true },
    draugr: { name: "Draugr", hp: 72, hands: true, weapon: "draugr", speed: 1, chase: 2.4, temper: "aggressive", roam: 8, leash: 20, pack: [1, 2], tiers: [4, 9], biomes: null, people: "darkElf", blood: "none", armor: 0.1, night: "more", darkSight: true, steady: true },
    mare: { name: "Mare", hp: 34, weapon: "mare", speed: 1.2, chase: 2.8, temper: "aggressive", roam: 10, leash: 20, pack: [1, 1], tiers: [2, 6], biomes: null, people: "darkElf", blood: "none", night: "only", darkSight: true, steady: true },
    hyena: { name: "Hyena", hp: 22, weapon: "hyena", speed: 1.4, chase: 3, temper: "aggressive", roam: 14, leash: 24, pack: [2, 5], tiers: [1, 7], biomes: null, people: "cat", blood: "red", night: "more", darkSight: true },
    scorpion: { name: "Sand scorpion", hp: 30, weapon: "scorpion", speed: 1, chase: 2.2, temper: "territorial", guard: 4, roam: 6, leash: 12, pack: [1, 2], tiers: [1, 7], biomes: null, people: "cat", blood: "ichor", armor: 0.1, night: "more" },
    jackal: { name: "Jackal", hp: 18, weapon: "jackal", speed: 1.5, chase: 3.2, temper: "aggressive", roam: 14, leash: 24, pack: [2, 4], tiers: [1, 4], biomes: null, people: "cat", blood: "red", night: "more", darkSight: true },
    capeBuffalo: { name: "Cape buffalo", hp: 64, weapon: "capeBuffalo", speed: 1.1, chase: 3, temper: "territorial", guard: 6, roam: 10, leash: 18, pack: [1, 3], tiers: [3, 7], biomes: null, people: "cat", blood: "red", steady: true },
    nandiBear: { name: "Nandi bear", hp: 62, weapon: "nandiBear", speed: 1.3, chase: 3.2, temper: "aggressive", roam: 12, leash: 24, pack: [1, 1], tiers: [4, 8], biomes: null, people: "cat", blood: "red", night: "more", darkSight: true, steady: true },
    locustSwarm: { name: "Locust swarm", hp: 22, weapon: "locustSwarm", speed: 1.6, chase: 3.2, temper: "aggressive", roam: 12, leash: 20, pack: [1, 1], tiers: [1, 4], biomes: null, people: "cat", blood: "ichor", steady: true },
    spittingCobra: { name: "Spitting cobra", hp: 30, weapon: "spittingCobra", speed: 1, chase: 2.4, temper: "territorial", guard: 4, roam: 6, leash: 12, pack: [1, 1], tiers: [2, 6], biomes: null, people: "cat", blood: "red" },
    bogFrog: { name: "Bog frog", hp: 28, weapon: "bogFrog", speed: 1, chase: 2, temper: "territorial", guard: 3, roam: 6, leash: 12, pack: [1, 2], tiers: [1, 6], biomes: null, people: "lizard", blood: "red" },
    crocodile: { name: "Marsh crocodile", hp: 60, weapon: "crocodile", speed: 0.8, chase: 2.4, temper: "territorial", guard: 5, roam: 6, leash: 12, pack: [1, 1], tiers: [3, 8], biomes: null, people: "lizard", blood: "red", armor: 0.15 , steady: true },
    giantLeech: { name: "Giant leech", hp: 20, weapon: "giantLeech", speed: 0.6, chase: 1.4, temper: "territorial", guard: 3, roam: 4, leash: 8, pack: [1, 2], tiers: [1, 3], biomes: ["marsh"], people: "lizard", blood: "red" },
    jaguar: { name: "Jaguar", hp: 42, weapon: "jaguar", speed: 1.4, chase: 3.4, temper: "territorial", guard: 7, roam: 12, leash: 22, pack: [1, 1], tiers: [2, 6], biomes: ["jungle"], people: "lizard", blood: "red", night: "more", darkSight: true },
    boa: { name: "Great boa", hp: 58, weapon: "boa", speed: 0.8, chase: 2.2, temper: "territorial", guard: 4, roam: 6, leash: 12, pack: [1, 1], tiers: [4, 8], biomes: null, people: "lizard", blood: "red", steady: true },
    bloodflies: { name: "Bloodfly swarm", hp: 18, weapon: "bloodflies", speed: 1.6, chase: 3.4, temper: "aggressive", roam: 10, leash: 20, pack: [1, 1], tiers: [1, 4], biomes: ["jungle", "marsh"], people: "lizard", blood: "red", night: "more", darkSight: true, steady: true },
    ahuizotl: { name: "Ahuizotl", hp: 38, weapon: "ahuizotl", speed: 1.2, chase: 2.8, temper: "territorial", guard: 5, roam: 6, leash: 14, pack: [1, 2], tiers: [3, 7], biomes: ["marsh", "jungle"], people: "lizard", blood: "red", night: "more", darkSight: true },
    magmaSlime: { name: "Magma slime", hp: 45, weapon: "magmaSlime", speed: 0.7, chase: 1.4, temper: "territorial", guard: 3, roam: 5, leash: 10, pack: [1, 2], tiers: [1, 8], biomes: null, people: "orc", blood: "none", armor: 0.1 },
    rockTusker: { name: "Rock tusker", hp: 80, weapon: "rockTusker", speed: 1.1, chase: 2.8, temper: "territorial", guard: 6, roam: 8, leash: 16, pack: [1, 1], tiers: [4, 9], biomes: null, people: "orc", blood: "none", armor: 0.2 , steady: true },
    gilaMonster: { name: "Gila monster", hp: 30, weapon: "gilaMonster", speed: 0.6, chase: 1.4, temper: "defensive", roam: 5, leash: 10, pack: [1, 1], tiers: [1, 4], biomes: ["badlands", "heath"], people: "orc", blood: "red" },
    salamander: { name: "Salamander", hp: 32, weapon: "salamander", speed: 0.9, chase: 2.2, temper: "territorial", guard: 4, roam: 6, leash: 12, pack: [1, 2], tiers: [2, 6], biomes: ["volcanic", "badlands"], people: "orc", blood: "red" },
    deathWorm: { name: "Death worm", hp: 40, weapon: "deathWorm", speed: 0.8, chase: 2, temper: "territorial", guard: 4, roam: 6, leash: 12, pack: [1, 1], tiers: [2, 6], biomes: ["badlands"], people: "orc", blood: "red" },
    vultureFlock: { name: "Vulture flock", hp: 30, weapon: "vultureFlock", speed: 1.4, chase: 3, temper: "aggressive", roam: 12, leash: 22, pack: [1, 1], tiers: [1, 4], biomes: ["badlands", "heath"], people: "orc", blood: "red", steady: true },
    chimera: { name: "Chimera", hp: 85, weapon: "chimera", speed: 1.3, chase: 3, temper: "aggressive", roam: 10, leash: 24, pack: [1, 1], tiers: [5, 9], biomes: ["volcanic", "badlands"], people: "orc", blood: "red", steady: true },
    // (The ants' nests' own, met only there (dungeons/themes.js `nest`), each drawn from a model of
    // its own once it's read (beasts/model.js): a giant ant, as big as a hound, its mandibles'
    // bite burning; a great centipede, four metres long, its fangs venomous,
    // rearing to strike the harder; and the Ant Monster, the nest's great queen, spitting acid at
    // whoever keeps off and calling its flock to it now and then while it fights (`call`), the
    // more as the nest's boss)
    ant: { name: "Giant ant", hp: 24, weapon: "ant", speed: 1.1, chase: 2.6, temper: "aggressive", roam: 8, leash: 18, pack: [1, 3], tiers: [1, 9], biomes: [], blood: "ichor", armor: 0.05, darkSight: true },
    greatCentipede: { name: "Great centipede", hp: 52, weapon: "greatCentipede", speed: 0.9, chase: 2, temper: "aggressive", roam: 8, leash: 18, pack: [1, 2], tiers: [3, 10], biomes: [], blood: "ichor", armor: 0.1, darkSight: true, steady: true },
    // (And the spiders that hunt their tunnels, met only there, each drawn from a model of its own:
    // the dungeon spider, as big as a hound, biting, springing, or spitting its web to slow whoever
    // it's after; each pack of them led by an elite dungeon spider, its own kind (`elite`, as the
    // goblins' Goblin King is theirs), red and black, its markings glowing, its sting the worse and
    // its web sprayed from its spinnerets, bursting apart as it dies)
    dungeonSpider: { name: "Dungeon spider", hp: 32, weapon: "dungeonSpider", speed: 1.1, chase: 2.2, temper: "aggressive", roam: 8, leash: 18, pack: [1, 3], tiers: [2, 10], biomes: [], blood: "ichor", armor: 0.05, darkSight: true, elite: "eliteDungeonSpider" },
    eliteDungeonSpider: { name: "Elite dungeon spider", hp: 72, weapon: "eliteDungeonSpider", speed: 1, chase: 1.9, temper: "aggressive", roam: 8, leash: 20, pack: [1, 1], tiers: [3, 10], biomes: [], blood: "ichor", armor: 0.15, darkSight: true, steady: true, king: true },
    // (And what else has crept into the tunnels, each drawn from a model of its own: a dungeon
    // scorpion, armoured, its pincers and its sting; giant cockroaches, quick, in their numbers,
    // carrying sickness; dungeon wasps, hovering, diving to sting)
    dungeonScorpion: { name: "Dungeon scorpion", hp: 64, weapon: "dungeonScorpion", speed: 0.9, chase: 2.2, temper: "aggressive", roam: 6, leash: 18, pack: [1, 2], tiers: [3, 10], biomes: [], blood: "ichor", armor: 0.25, darkSight: true, steady: true },
    giantCockroach: { name: "Giant cockroach", hp: 22, weapon: "giantCockroach", speed: 1.4, chase: 3.2, temper: "aggressive", roam: 10, leash: 18, pack: [2, 4], tiers: [1, 8], biomes: [], blood: "ichor", armor: 0.1, darkSight: true },
    dungeonWasp: { name: "Dungeon wasp", hp: 26, weapon: "dungeonWasp", speed: 1.4, chase: 3.4, temper: "aggressive", roam: 10, leash: 22, pack: [2, 3], tiers: [2, 10], biomes: [], blood: "ichor", darkSight: true },
    // (A black widow: hanging unseen in the dark under a nest's roof, dropping on its thread onto
    // whoever passes beneath (`lurk`: battle.js #lurk), its bite a venom of its own)
    blackWidow: { name: "Black widow", hp: 54, weapon: "blackWidow", speed: 1, chase: 2.6, temper: "aggressive", roam: 4, leash: 18, pack: [1, 1], tiers: [3, 10], biomes: [], blood: "ichor", armor: 0.1, darkSight: true, lurk: { within: 3.5, drop: 1800 } },
    antMonster: { name: "Ant Monster", hp: 96, weapon: "antMonster", speed: 1.4, chase: 2.8, temper: "aggressive", roam: 6, leash: 24, pack: [1, 1], tiers: [4, 10], biomes: [], blood: "ichor", armor: 0.2, darkSight: true, steady: true, call: { kind: "ant", count: [2, 3], most: 4, every: 20000, first: 6000 }, boss: { call: { count: [2, 4], most: 6, every: 15000 } } },
    // The mightiest: only in the perilous places
    dragon: { name: "Drake", hp: 90, weapon: "dragon", speed: 1, chase: 2.2, temper: "aggressive", roam: 6, leash: 30, pack: [1, 1], tiers: [10, 10], biomes: [], blood: "red", armor: 0.25, perilous: true , steady: true },
    // (The mightiest of all, each in a lair of its own: worldplan/settle.js DREADTHORN_LAIRS. On
    // the ground for the most part; it breathes fire as it bites, and takes to the air when badly
    // hurt)
    dreadthorn: { name: "Dreadthorn", hp: 220, weapon: "dreadthorn", speed: 1, chase: 2.4, temper: "aggressive", roam: 6, leash: 34, pack: [1, 1], tiers: [10, 10], biomes: [], blood: "red", armor: 0.35, perilous: true, steady: true, hover: { below: 0.4, ms: 12000, every: 25000, rise: 2000 } },
    // (The Moonfang: the first of the werewolves, the master of each of their dens, met only there,
    // by day or night (worldplan/settle.js WEREWOLF_DENS): half as tall again as a werewolf, its
    // claws and its spring the heavier, two of its werewolves and three dire wolves with it: LAIRS)
    moonfang: { name: "Moonfang", hp: 170, weapon: "moonfang", speed: 1.4, chase: 3.6, temper: "aggressive", roam: 6, leash: 32, pack: [1, 1], tiers: [9, 9], biomes: [], blood: "red", armor: 0.25, perilous: true, darkSight: true, steady: true },
    // (The restless dead of whoever lived in the ruins long ago, only ever met there: core/places.js
    // PLACE_BANDS, and in the ruined castles with their lords: LAIRS)
    ghost: { name: "Restless ghost", hp: 26, weapon: "ghost", speed: 1.1, chase: 2.3, temper: "aggressive", roam: 6, leash: 16, pack: [1, 2], tiers: [3, 9], biomes: [], blood: "none", armor: 0.15, night: "only", darkSight: true , steady: true },
    wraith: { name: "Wraith", hp: 46, weapon: "wraith", speed: 1.2, chase: 2.6, temper: "aggressive", roam: 6, leash: 18, pack: [1, 1], tiers: [5, 10], biomes: [], blood: "none", armor: 0.2, night: "only", darkSight: true , steady: true },
    wightLord: { name: "Wight lord", hp: 70, hands: true, weapon: "wightLord", speed: 1.1, chase: 2.2, temper: "aggressive", roam: 4, leash: 26, pack: [1, 1], tiers: [9, 10], biomes: [], blood: "none", armor: 0.25, perilous: true, darkSight: true , steady: true },
    frostTroll: { name: "Frost troll", hp: 75, hands: true, weapon: "frostTroll", speed: 1, chase: 2.2, temper: "aggressive", roam: 10, leash: 22, pack: [1, 1], tiers: [9, 10], biomes: ["snow"], blood: "red", armor: 0.2, perilous: true , steady: true },
    // (A hell's flayed, its sacrifices and its priests, skinned and given back their lives below:
    // only there, in its first two levels (core/dungeons/themes.js hell), each drawn from a model of
    // its own. In the Breach, flaylings in swarms, quick, their claws leaving wounds that bleed;
    // cinder husks, burnt out and slow, shrugging off fire, bursting in embers as they fall
    // (`burst`); pyre acolytes keeping off, hurling fire that burns on the ground. In the Halls of
    // Bone, ossuary priests raising its skeletons (`call`) and cursing with grave-rot; dirge wardens,
    // armoured, their halberds sweeping whoever's near off their feet, their dirge chilling; and,
    // fewest, a flayed hierarch, its curse drawing back into it the life it takes, weapons.js `drain`)
    flayling: { name: "Flayling", hp: 32, weapon: "flayling", speed: 1.3, chase: 3.9, temper: "aggressive", roam: 8, leash: 22, pack: [3, 5], tiers: [9, 10], biomes: [], blood: "red", darkSight: true },
    cinderHusk: { name: "Cinder husk", hp: 58, weapon: "cinderHusk", speed: 0.8, chase: 2.1, temper: "aggressive", roam: 6, leash: 20, pack: [2, 3], tiers: [9, 10], biomes: [], blood: "none", armor: 0.1, darkSight: true, steady: true, wards: { fire: 0.5 }, burst: { kind: "cinders", damage: [8, 14] } },
    pyreAcolyte: { name: "Pyre acolyte", hp: 40, weapon: "pyreAcolyte", speed: 1.0, chase: 2.6, temper: "aggressive", roam: 6, leash: 22, pack: [1, 2], tiers: [9, 10], biomes: [], blood: "red", darkSight: true, keep: 5, wards: { fire: 0.3 } },
    ossuaryPriest: { name: "Ossuary priest", hp: 52, weapon: "ossuaryPriest", speed: 0.9, chase: 2.4, temper: "aggressive", roam: 5, leash: 22, pack: [1, 1], tiers: [9, 10], biomes: [], blood: "red", armor: 0.1, darkSight: true, keep: 4, call: { kind: "skeleton", count: [1, 2], most: 4, every: 14000, first: 2500 } },
    dirgeWarden: { name: "Dirge warden", hp: 92, weapon: "dirgeWarden", speed: 0.9, chase: 2.3, temper: "aggressive", roam: 4, leash: 20, pack: [1, 2], tiers: [9, 10], biomes: [], blood: "red", armor: 0.35, darkSight: true, steady: true, wards: { water: 0.5 } },
    flayedHierarch: { name: "Flayed hierarch", hp: 115, weapon: "flayedHierarch", speed: 0.95, chase: 2.4, temper: "aggressive", roam: 5, leash: 24, pack: [1, 1], tiers: [9, 10], biomes: [], blood: "red", armor: 0.25, darkSight: true, steady: true, wards: { magic: 0.3 } },
    // (A hell's gorgers, headless brutes with a maw in the belly: only there, in its last two
    // levels, each drawn from a model of its own. In the River of Fire, slag gorgers spewing molten
    // slag that burns on the ground, shrugging off fire; forge brutes, their clubs knocking whoever
    // they catch off their feet, burning; and, fewest, chained gluttons, whose bite feeds them
    // (weapons.js `drain`). In the Pit, bloat gorgers spewing bile, bursting in it as they fall
    // (`burst`); pit ravagers, quick, their clubs and teeth leaving wounds that bleed; and, fewest,
    // a gorger warlord under skulls and banners, roaring its bloat gorgers to it (`call`))
    slagGorger: { name: "Slag gorger", hp: 70, weapon: "slagGorger", speed: 0.9, chase: 2.4, temper: "aggressive", roam: 6, leash: 22, pack: [2, 3], tiers: [9, 10], biomes: [], blood: "red", armor: 0.1, darkSight: true, wards: { fire: 0.5 } },
    forgeBrute: { name: "Forge brute", hp: 95, weapon: "forgeBrute", speed: 0.95, chase: 2.3, temper: "aggressive", roam: 5, leash: 22, pack: [1, 2], tiers: [9, 10], biomes: [], blood: "red", armor: 0.25, darkSight: true, steady: true, wards: { fire: 0.3 } },
    chainedGlutton: { name: "Chained glutton", hp: 125, weapon: "chainedGlutton", speed: 1, chase: 2.2, temper: "aggressive", roam: 4, leash: 22, pack: [1, 1], tiers: [9, 10], biomes: [], blood: "red", armor: 0.3, darkSight: true, steady: true },
    bloatGorger: { name: "Bloat gorger", hp: 75, weapon: "bloatGorger", speed: 0.9, chase: 2.1, temper: "aggressive", roam: 6, leash: 22, pack: [2, 3], tiers: [9, 10], biomes: [], blood: "slime", darkSight: true, burst: { kind: "bile", damage: [8, 14] } },
    pitRavager: { name: "Pit ravager", hp: 85, weapon: "pitRavager", speed: 1.1, chase: 3, temper: "aggressive", roam: 8, leash: 24, pack: [2, 3], tiers: [9, 10], biomes: [], blood: "red", armor: 0.15, darkSight: true },
    gorgerWarlord: { name: "Gorger warlord", hp: 160, weapon: "gorgerWarlord", speed: 1.05, chase: 2.3, temper: "aggressive", roam: 4, leash: 26, pack: [1, 1], tiers: [9, 10], biomes: [], blood: "red", armor: 0.35, darkSight: true, steady: true, call: { kind: "bloatGorger", count: [1, 2], most: 3, every: 16000, first: 3000 } },
    // (The Lord of the Pit's henchmen, horned and clawed, a man's height and broad: only in a hell's
    // Pit, in twos and threes, and about his throne (dungeons/themes.js hell's `bosses` `guard`),
    // each in one of their model's four skins. Their claws rend, leaving wounds that bleed, and the
    // blow staggers)
    henchman: { name: "Pit henchman", hp: 90, weapon: "henchman", speed: 1, chase: 2.6, temper: "aggressive", roam: 5, leash: 24, pack: [2, 3], tiers: [9, 10], biomes: [], blood: "red", armor: 0.25, darkSight: true, steady: true },
    // (A hell's walkers, lean and sinewy, a head taller than a man, as if flayed, from one model in
    // its five skins: one kind on each level, wearing that level's (beasts/model.js `skins`). Most
    // at home in the River of Fire, as hellwalkers, its own skin or charred, met there the most;
    // brimstone walkers in the Breach, ash walkers in the Halls of Bone, bile walkers in the Pit.
    // Quick, their claws raking, leaving wounds that bleed)
    ...Object.fromEntries(
        [
            ["brimstoneWalker", "Brimstone walker"],
            ["ashWalker", "Ash walker"],
            ["hellwalker", "Hellwalker"],
            ["bileWalker", "Bile walker"],
        ].map(([id, name]) => [id, { name, hp: 66, weapon: "hellwalker", speed: 1.15, chase: 3.3, temper: "aggressive", roam: 8, leash: 24, pack: [2, 3], tiers: [9, 10], biomes: [], blood: "red", armor: 0.1, darkSight: true }]),
    ),

    // (The lord of a hell, on its throne at the bottom of the pit: core/dungeons/themes.js hell. A
    // great horned brute for now, red as a coal, its fists burning and hellfire in its hands,
    // until a bought model of its own is read: beasts/looks.js)
    // (A cult's high priest, keeping its rite by a hell's portal at night: host.js #lairs, RITES)
    cultLeader: { name: "High priest of the cult", hp: 80, hands: true, weapon: "cultLeader", speed: 1.2, chase: 2.3, temper: "aggressive", roam: 3, leash: 24, pack: [1, 1], tiers: [10, 10], biomes: [], blood: "red", armor: 0.15, perilous: true, darkSight: true },
    // (The River of Fire's master, a hell's third level's (dungeons/themes.js `hell`): the Greater
    // Demon, the Lord of the Pit's before the Infernal Demon took the Pit)
    greaterDemon: { name: "Greater demon", hp: 80, hands: true, weapon: "greaterDemon", speed: 1.1, chase: 2.4, temper: "aggressive", roam: 4, leash: 26, pack: [1, 1], tiers: [10, 10], biomes: [], blood: "red", armor: 0.25, perilous: true, darkSight: true, steady: true },
    demonLord: { name: "Demon lord", hp: 120, hands: true, weapon: "demonLord", speed: 1.1, chase: 2.4, temper: "aggressive", roam: 4, leash: 30, pack: [1, 1], tiers: [10, 10], biomes: [], blood: "red", armor: 0.3, perilous: true, darkSight: true, steady: true },
    // (A fiend of the hells, met in packs on every level of one: core/dungeons/themes.js hell.
    // Lean, winged and horned, a head and more taller than a man, its claws raking and its spring
    // heavy; drawn from a bought model of its own once that's read, a horned stand-in till then:
    // beasts/model.js, beasts/looks.js)
    fiend: { name: "Fiend", hp: 78, weapon: "fiend", speed: 1.2, chase: 3.1, temper: "aggressive", roam: 8, leash: 24, pack: [1, 3], tiers: [9, 10], biomes: [], blood: "red", armor: 0.15, darkSight: true, steady: true },
    // (The Behemoth of the Rift: one of the great beasts of the other world come through the rift
    // outside the Tower of Sar Mordal (docs/WILDS.md *The Kaiju*), 36 metres long and 13 tall,
    // drawn from a bought model of its own (beasts/model.js). On no side but its own (RIFT), it's
    // everyone's enemy; too vast to be thrown, it fights its own way (`colossus`: battle.js
    // #colossus) and is met only where one's come against a town by night)
    // (The rift's own small kind, come through it into the Tower of Sar Mordal and kept round it:
    // the Behemoth's kind, a man's height, quick and hungry, the kind that killed Sinclair's wife
    // (riftlings); and one bigger, leading them, breathing the rift's green fire (a rift stalker):
    // only ever met there, LAIRS "rift tower". Drawn from the Kaiju's model, small: beasts/model.js)
    riftling: { name: "Riftling", hp: 46, weapon: "riftling", speed: 1.5, chase: 3.6, temper: "aggressive", roam: 6, leash: 28, pack: [1, 1], tiers: [7, 9], biomes: [], blood: "ichor", armor: 0.1, darkSight: true },
    riftStalker: { name: "Rift stalker", hp: 150, weapon: "riftStalker", speed: 1.3, chase: 3, temper: "aggressive", roam: 4, leash: 30, pack: [1, 1], tiers: [9, 9], biomes: [], blood: "ichor", armor: 0.25, perilous: true, darkSight: true, steady: true },
    kaiju: { name: "Behemoth of the Rift", hp: 2400, weapon: "kaiju", speed: 1.5, chase: 2.2, temper: "aggressive", roam: 0, leash: 400, pack: [1, 1], tiers: [10, 10], biomes: [], blood: "ichor", armor: 0.3, perilous: true, darkSight: true, steady: true, colossus: COLOSSUS },
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
 * (metres), and how long the master's gone once it's slain (battle ms); `within`, its master keeps
 * inside, by its hoard (a ruined castle's wight lord in its keep's hall), half its guards with it;
 * what's in its hoard once the master's slain (`hoard`: progress.js LOOT, "hoard" if it doesn't
 * say), and whether an old relic's in it too (`relic`: progress.js rollRelic).
 */
export const LAIRS = Object.freeze({
    "dragon's lair": { master: ["dragon", 10], guards: [["wyvern", 2, 8]], near: 110, back: 45 * 60 * 1000 },
    "dreadthorn's lair": { master: ["dreadthorn", 10], guards: [["wyvern", 3, 9]], near: 130, back: 60 * 60 * 1000, hoard: "greatHoard", relic: true },
    "werewolf's den": { master: ["moonfang", 9], guards: [["werewolf", 1, 8], ["werewolf", 1, 8], ["direWolf", 3, 8]], near: 100, back: 40 * 60 * 1000, relic: true },
    "ruined castle": { master: ["wightLord", 9], guards: [["skeleton", 3, 7], ["ghost", 2, 7], ["wraith", 1, 8]], near: 90, back: 30 * 60 * 1000, within: true, relic: true },
    // (The Tower of Sar Mordal: its rift's own, the rift stalker in Sinclair's study at the top of
    // it, by his hoard, a riftling with it and two in the hall below; the rest round the rift outside)
    "rift tower": { master: ["riftStalker", 9], guards: [["riftling", 4, 8], ["riftling", 2, 9]], near: 100, back: 40 * 60 * 1000, within: true, hoard: "greatHoard", relic: true },
});

/**
 * The rites kept at the hells' ways in (a dungeon's site of the hell's theme: core/dungeons
 * themes.js `hell`, its cult's camp round its portal), by the theme: held as a lair is (LAIRS: its
 * `master`, the cult's high priest, and its `guards`, the cult's faithful; how `near` a player
 * comes for them to be there), but only after dark (`night`), the cult gone at daybreak. Slain to
 * the last of them, the portal they keep lets anyone through till daybreak (host.js `enter`), and
 * they're back at it the next night.
 */
export const RITES = Object.freeze({
    hell: { master: ["cultLeader", 10], guards: [["cultist", 4, 10], ["cultist", 2, 9]], near: 110, night: true },
});

/** Who holds a perilous site (LAIRS', by its kind), or keeps a rite at it (RITES', by its theme: a hell's way in); or null. */
export const lairOf = (site) => LAIRS[site.kind] ?? (site.theme ? RITES[site.theme] : null) ?? null;

/** How much more often the night's creatures are met after dark (weights, by their `night`). */
export const NIGHT_WEIGHT = Object.freeze({ only: 3, more: 2 });

/** Is a creature about by day (none of the night's own)? */
export const outByDay = (creature) => CREATURES[creature]?.night !== "only";

/** How many hit points, and how much harder its blows are, a creature of a tier has (than the first tier's). */
export const tierPower = (tier) => pow(TIER_GROWTH, Math.max(1, tier) - 1);

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
    const nearest = Math.min(...homes.map(([hx, hy]) => hypot(x - hx, y - hy)));
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
 * they are come twice as often. By day (`dark` false) none of the night's own; after dark, the
 * night's creatures more often (NIGHT_WEIGHT).
 */
export function candidatesAt(land, tier, dark = false) {
    const found = Object.entries(CREATURES).filter(([id, creature]) => livesOn(id, land) && tier >= creature.tiers[0] && tier <= creature.tiers[1] && (!creature.perilous || id === "frostTroll") && (dark || outByDay(id)));

    return found.map(([id, creature]) => ({ id, weight: (creature.people ? 2 : 1) * (dark ? (NIGHT_WEIGHT[creature.night] ?? 1) : 1) }));
}

/**
 * Which creatures, and how many, to put out at a place (`random`: createRandom's; `dark`: is it
 * after dark): one kind that lives there at its tier then (null if none do), its pack as big as
 * that tier has it.
 */
export function encounterAt(plan, [x, y], homes, random, dark = false) {
    const land = landAt(plan, x, y);
    const tier = tierAt([x, y], homes, land.biome);
    const candidates = candidatesAt(land, tier, dark);

    if (!candidates.length) {
        return null;
    }

    const { id } = random.pickWeighted(candidates, ({ weight }) => weight);

    return { creature: id, tier, count: packOf(id, tier) };
}

/**
 * The wild's elites (docs/WILDS.md *Elites*): now and then (`chance` of the packs put out about a
 * player, in land of tier `least` or more), an elite of a kind that lives there leads its kind
 * ("Elite Wolf"): `hp` times the hit points and `power` times the blows of one of them, and `up`
 * tiers on the land's. Put out `from` to `to` metres from the player (further than the wild's
 * others, to be seen coming) on dry ground clear of the settlements and roads; it walks a round
 * of `stops` about where it was put out, `loop` metres off; it sees `sight` squares (further than
 * the others) but goes no further than `leash` metres beyond its round after anyone, so a wide
 * berth passes it by; let go once every player's `far` away. Never two within `apart` metres of
 * each other; a player one's been put out near has no other for `rest` ms. Seen on the minimap
 * from `marker` metres. None of the perilous kinds.
 */
export const ELITES = Object.freeze({ chance: 1 / 12, least: 2, hp: 3, power: 1.25, up: 1, from: 80, to: 100, loop: 10, stops: 6, sight: 18, leash: 12, far: 160, apart: 400, rest: 600000, marker: 80 });

/** What an elite of a kind's called: "Elite Wolf"; one that's an elite itself, its own name ("Goblin King"). */
export const eliteName = (creature) => (CREATURES[creature].king ? CREATURES[creature].name : `Elite ${CREATURES[creature].name}`);

/** What leads a pack of a kind as its elite (ELITES): its own (`elite`: the goblins', the Goblin King), or one of it. */
export const eliteOf = (creature) => CREATURES[creature].elite ?? creature;

/**
 * What the `k`th of a pack of a kind is (a creature id): its leader (k 0) the kind itself; any
 * other, now and then (by the `chance`, a number 0 to 1), one of those it goes about with
 * (`band`: a goblin bomber among goblin raiders).
 */
export function memberOf(creature, k, chance) {
    let share = 0;

    for (const [other, odds] of k > 0 ? Object.entries(CREATURES[creature].band ?? {}) : []) {
        share += odds;

        if (chance < share) {
            return other;
        }
    }

    return creature;
}

/** The creatures whose fall is always news (`notable`), besides the perilous places' own: the dragon's lair's guards. */
export const NOTABLE = Object.freeze(["wyvern"]);

/**
 * Whether one of the wild's creatures (an actor's `wild`) is a foe of note, its fall told across
 * the screen and not only rising off its body (app/game.js `#slain`): an elite, a dungeon's boss
 * or mini-boss (`champion`), a perilous place's own (`unique`: the bandit chief, the dragon, the
 * wight lord, the frost troll), a site's or a lair's master (`master`, the host's), or a wyvern.
 * Anyone else (a wolf, an orc, a soldier) isn't: no `wild`, or none of these.
 */
export function notable(wild, { master = false } = {}) {
    return Boolean(wild && (master || wild.elite || wild.champion || wild.unique || NOTABLE.includes(wild.creature)));
}

/**
 * How a creature fights besides its weapon (battle.js, its actor's `wild`): `steady`, `keep`,
 * `bomb`, `hover` and, one that has them, `call`, `lurk` and `burst` (CREATURES); as a dungeon's
 * boss (`boss`), its bomb and its call as its `boss` has them.
 */
export function traitsOf(creature, { boss = false } = {}) {
    const { steady = false, keep = null, bomb = null, call = null, boss: asBoss = null, hover = null, lurk = null, burst = null, colossus = null } = CREATURES[creature] ?? {};

    return { steady, keep, bomb: bomb ? { ...bomb, damage: [...bomb.damage], ...(boss ? asBoss?.bomb : {}) } : null, hover: hover ? { ...hover } : null, ...(call ? { call: { ...call, count: [...call.count], ...(boss ? asBoss?.call : {}) } } : {}), ...(lurk ? { lurk: { ...lurk } } : {}), ...(burst ? { burst: { ...burst, damage: [...burst.damage] } } : {}), ...(colossus ? { colossus: structuredClone(colossus) } : {}) };
}

/** The round an elite walks ([[x, y], ...] metres): ELITES.stops evenly about where it was put out (`at`), ELITES.loop metres off. */
export function eliteRound([x, y]) {
    return Array.from({ length: ELITES.stops }, (each, k) => {
        const angle = (k / ELITES.stops) * Math.PI * 2;

        return [x + cos(angle) * ELITES.loop, y + sin(angle) * ELITES.loop];
    });
}

/** What a wild camp's folk are at its tier (CAMP_FOLK). */
export function campFolk(faction, tier) {
    return (CAMP_FOLK[faction] ?? CAMP_FOLK.bandits).find(([, from]) => tier >= from)[0];
}

/** Is a place clear of every settlement (metres beyond each's edge)? */
export function clearOfSettlements(plan, [x, y], beyond) {
    return plan.places.every((place) => hypot(x - place.at[0], y - place.at[1]) > (SETTLEMENTS[place.kind]?.radius ?? 40) + beyond);
}
