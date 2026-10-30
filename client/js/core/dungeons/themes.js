// What each kind of dungeon is (core/dungeons: docs/DUNGEONS.md), as data: how its levels are dug
// (layouts.js), how it's drawn and sounds, what it's called, who's in it (packs of the wild's
// creatures, the mini-bosses along the way and the boss at the bottom, each by the tiers it suits),
// and how each kind of room in it is dressed (its props, by plan character: interiors.js PLAN_KEY)
// and lit. Start with caves, an outlaws' hideout, an ancient temple and an ants' nest; add more with
// registerTheme (a new layout with layouts.js registerLayout, new art by the theme's `style`).
//
// Everything's chosen from these lists by seed in a way (seeds.js pickStable) that adding to a list
// changes only the choices the new entry wins, so the dungeons already found stay as they were.

import { GROUND } from "../setpieces/pieces.js";
import { pickStable } from "./seeds.js";

/**
 * Where a prop goes in a room (place.js): against a wall, facing out from it ("wall"); free
 * standing with ground all round ("open"); as near the room's middle as it can ("centre"); in a
 * corner ("corner"); in rows across a hall, aisles kept clear ("rows": a pillared hall's pillars);
 * along both long sides ("sides": a gallery's tombs); at the head of a hall, against its north
 * wall on the middle way ("head": a sanctum's altar); its long side against the rock, whichever
 * way that is ("back": the Hellforge).
 */
export const PROP_PLACES = Object.freeze(["wall", "open", "centre", "corner", "rows", "sides", "head", "back"]);

/**
 * The themes, by id: { id, name (what the kind's called), layout (layouts.js LAYOUTS), lands (how
 * likely the theme is in each land, by BIOMES id: themeFor), hoard
 * ("head" to put the boss's hoard at the head of its hall, else at the far end), style (the
 * art's: world/interiors3d.js), ground (setpieces/pieces.js GROUND), sound, names ({ forms, adj,
 * place }: what one's called), packs ([{ id, creatures, size: [least, most], weight }]), minis
 * ([{ id, creature, title, weight }]), bosses (as minis, and `guard`: the creatures about it, in
 * turn, if not one of the theme's packs), rooms ({ kind: [{ id, weight, props:
 * [{ char, count: [least, most], at (PROP_PLACES), size: [w, h], mirror; or `tries`, each its own
 * at and size, tried in turn }], torches: [least, most], glows: [least, most] }] }: each kind of
 * room a layout digs, and "any" for kinds not listed; "goal", the room furthest in, if it's to have
 * a look of its own, its first prop placed before anyone waits there), lava (its caverns flooded
 * with lava: { rooms (which kinds), wide (how wide its causeways are), islands: [least, most],
 * island (how far across each is) }: place.js flood), rim (its throne hall's side walls lined with
 * lava, on its bottom level: { doors, clear: how far from its ways in and anything else that
 * blocks, squares }: place.js lavaRim), lit
 * (how its rooms are lit: by torches on their walls, one more in the way in's room and the
 * arena's; or "glow", by colonies of glowing fungus on their walls, each room's look's `glows`,
 * torches only where its look has them) }.
 */
export const THEMES = {
    caves: {
        id: "caves",
        name: "caves",
        layout: "caves",
        lands: { mountain: 4, snow: 3, volcanic: 3, badlands: 3, tundra: 2, heath: 2 },
        style: "dungeon-caves",
        ground: GROUND.soil,
        sound: "cave",
        names: {
            forms: ["the {adj} Caverns", "the {adj} Deeps", "the {adj} Grotto", "the Caves of {place}", "{place} Hollows", "the {adj} Delve"],
            adj: ["Weeping", "Echoing", "Black", "Dripping", "Hollow", "Gnawed", "Glittering", "Sunless", "Coiled", "Mossy"],
            place: ["Old Grum", "Skarrow", "the Low Fells", "Duncairn", "Wyrmhole", "Grimsby Tor", "the Deep Root", "Blackwater"],
        },
        packs: [
            { id: "spiders", creatures: ["caveSpider"], size: [2, 4], weight: 3 },
            { id: "goblins", creatures: ["goblin"], size: [3, 5], weight: 3 },
            { id: "bats", creatures: ["bats"], size: [3, 5], weight: 2 },
            { id: "rats", creatures: ["rat"], size: [3, 5], weight: 1 },
            { id: "slimes", creatures: ["slime"], size: [2, 3], weight: 1 },
            { id: "wolves", creatures: ["direWolf"], size: [2, 3], weight: 1 },
            { id: "stalkers", creatures: ["shadowStalker"], size: [1, 2], weight: 1 },
            { id: "tuskers", creatures: ["rockTusker"], size: [1, 2], weight: 1 },
            { id: "trolls", creatures: ["troll"], size: [1, 2], weight: 1 },
            { id: "frost", creatures: ["frostTroll"], size: [1, 2], weight: 1 },
        ],
        minis: [
            { id: "troll", creature: "troll", title: "Cave troll", weight: 2 },
            { id: "bear", creature: "bear", title: "Great cave bear", weight: 1 },
            { id: "ogre", creature: "ogre", title: "Ogre", weight: 1 },
            { id: "tusker", creature: "rockTusker", title: "Old rock tusker", weight: 1 },
            { id: "brood", creature: "caveSpider", title: "Brood guardian", weight: 1 },
        ],
        bosses: [
            { id: "trollKing", creature: "troll", title: "the Troll King", weight: 2 },
            { id: "broodmother", creature: "caveSpider", title: "the Broodmother", weight: 2 },
            // (The goblins' elite on its throne, harder than met in the wild: its own war band
            // about it, raiders and bombers: creatures.js `boss`)
            { id: "goblinKing", creature: "goblinKing", title: "the Goblin King", weight: 1, guard: ["goblin", "goblinBomber"] },
            { id: "frostTroll", creature: "frostTroll", title: "the Frost Troll", weight: 1 },
        ],
        rooms: {
            mouth: [{ id: "mouth", props: [{ char: "*", count: [1, 2], at: "wall" }, { char: "j", count: [0, 1], at: "open" }, { char: "d", count: [3, 5], at: "wall" }], torches: [1, 1] }],
            cavern: [
                { id: "pillars", weight: 2, props: [{ char: "*", count: [3, 6], at: "open" }, { char: "j", count: [0, 2], at: "open" }, { char: "d", count: [2, 4], at: "wall" }, { char: "i", count: [0, 1], at: "open" }], torches: [0, 1] },
                { id: "camp", weight: 1, props: [{ char: "x", count: [1, 1], at: "centre" }, { char: "u", count: [2, 4], at: "wall" }, { char: "K", count: [0, 1], at: "wall" }, { char: "J", count: [0, 1], at: "wall", size: [2, 1] }, { char: "d", count: [3, 5], at: "wall" }], torches: [0, 1] },
                { id: "bonepit", weight: 1, props: [{ char: "j", count: [3, 6], at: "open" }, { char: "m", count: [1, 3], at: "wall" }, { char: "i", count: [1, 3], at: "open" }, { char: "d", count: [2, 3], at: "wall" }], torches: [0, 0] },
            ],
            grotto: [
                { id: "drip", weight: 2, props: [{ char: "*", count: [1, 3], at: "open" }, { char: "m", count: [0, 2], at: "wall" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 1] },
                { id: "nest", weight: 1, props: [{ char: "j", count: [2, 4], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 0] },
            ],
            nook: [{ id: "nook", props: [{ char: "m", count: [0, 2], at: "wall" }, { char: "j", count: [0, 1], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 0] }],
            arena: [{ id: "throne", props: [{ char: "*", count: [4, 7], at: "open" }, { char: "j", count: [3, 6], at: "open" }, { char: "x", count: [1, 1], at: "centre" }, { char: "i", count: [1, 3], at: "open" }, { char: "d", count: [2, 4], at: "wall" }], torches: [2, 3] }],
        },
    },
    hideout: {
        id: "hideout",
        name: "an outlaws' hideout",
        layout: "accretion",
        lands: { woods: 4, farmland: 3, meadow: 3, darkwood: 3, heath: 2, marsh: 2, elfwood: 2 },
        style: "dungeon-hideout",
        ground: GROUND.soil,
        sound: "cave",
        names: {
            forms: ["the {adj} Den", "the {place} Hideout", "the {adj} Warren", "{place}'s Hole", "the Smugglers' {adj} Cellars"],
            adj: ["Cutthroat", "Rat's", "Black Dog", "Crooked", "Gallows", "Red Hand", "Broken Key", "Hangman's"],
            place: ["Mad Jory", "Blind Tam", "Red Wenna", "Old Crake", "Long Hob", "Shiv Morrow", "Black Annis"],
        },
        packs: [
            { id: "outlaws", creatures: ["bandit"], size: [3, 5], weight: 5 },
            { id: "hounds", creatures: ["wolf"], size: [2, 3], weight: 1 },
            { id: "cultists", creatures: ["cultist"], size: [2, 4], weight: 1 },
            { id: "boggarts", creatures: ["boggart"], size: [2, 3], weight: 1 },
            { id: "muscle", creatures: ["ogre"], size: [1, 2], weight: 1 },
            { id: "sworn", creatures: ["banditChief"], size: [2, 3], weight: 1 },
        ],
        minis: [
            { id: "lieutenant", creature: "banditChief", title: "Outlaw lieutenant", weight: 3 },
            { id: "enforcer", creature: "ogre", title: "Hired ogre", weight: 1 },
            { id: "hedgePriest", creature: "cultist", title: "Hedge priest", weight: 1 },
        ],
        bosses: [
            { id: "banditLord", creature: "banditChief", title: "the Outlaw King", weight: 3 },
            { id: "ogreBoss", creature: "ogre", title: "the Ogre Captain", weight: 1 },
        ],
        rooms: {
            gate: [{ id: "gate", props: [{ char: "%", count: [1, 2], at: "wall" }, { char: "K", count: [0, 1], at: "corner" }, { char: "n", count: [0, 1], at: "wall" }, { char: "J", count: [0, 1], at: "wall", size: [3, 1] }, { char: "d", count: [2, 3], at: "wall" }], torches: [2, 2] }],
            hall: [
                { id: "mess", weight: 2, props: [{ char: "T", count: [2, 3], at: "open", size: [3, 1] }, { char: "K", count: [1, 2], at: "corner" }, { char: "x", count: [0, 1], at: "wall" }, { char: "e", count: [0, 1], at: "wall", size: [2, 1] }, { char: "d", count: [2, 4], at: "wall" }], torches: [2, 3] },
                { id: "loot", weight: 1, props: [{ char: "%", count: [3, 5], at: "wall" }, { char: "K", count: [1, 3], at: "corner" }, { char: "e", count: [0, 1], at: "wall", size: [2, 1] }, { char: "d", count: [3, 5], at: "wall" }], torches: [1, 2] },
            ],
            quarters: [{ id: "bunks", props: [{ char: "u", count: [3, 5], at: "wall" }, { char: "%", count: [0, 1], at: "corner" }, { char: "o", count: [1, 2], at: "wall" }, { char: "d", count: [2, 3], at: "wall" }], torches: [1, 2] }],
            store: [{ id: "store", props: [{ char: "%", count: [2, 3], at: "wall" }, { char: "K", count: [1, 2], at: "corner" }, { char: "e", count: [1, 2], at: "wall", size: [2, 1] }, { char: "J", count: [0, 1], at: "wall", size: [3, 1] }, { char: "d", count: [3, 5], at: "wall" }], torches: [0, 1] }],
            den: [
                { id: "armoury", weight: 1, props: [{ char: "R", count: [1, 2], at: "wall", size: [2, 1] }, { char: "%", count: [0, 1], at: "corner" }, { char: "n", count: [1, 2], at: "wall" }, { char: "X", count: [0, 1], at: "wall", size: [2, 1] }, { char: "A", count: [0, 1], at: "open" }], torches: [1, 1] },
                { id: "kennel", weight: 1, props: [{ char: "j", count: [2, 3], at: "open" }, { char: "u", count: [1, 2], at: "wall" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [2, 3], at: "wall" }], torches: [0, 1] },
            ],
            arena: [{ id: "chief", props: [{ char: "T", count: [1, 1], at: "centre", size: [3, 1] }, { char: "Y", count: [1, 1], at: "wall" }, { char: "%", count: [2, 4], at: "corner" }, { char: "K", count: [2, 3], at: "wall" }, { char: "e", count: [1, 1], at: "wall", size: [2, 1] }, { char: "n", count: [0, 1], at: "wall" }, { char: "d", count: [2, 4], at: "wall" }], torches: [3, 4] }],
        },
    },
    ancient: {
        id: "ancient",
        name: "an ancient temple",
        layout: "axial",
        lands: { jungle: 4, savannah: 3, badlands: 2, marsh: 2, elfwood: 2, darkwood: 2 },
        hoard: "head",
        style: "dungeon-ancient",
        ground: GROUND.courtyard,
        sound: "crypt",
        names: {
            forms: ["the Tomb of {place}", "the Sunken Temple of {place}", "the {adj} Vaults", "the Halls of {place}", "the {adj} Sepulchre"],
            adj: ["Forgotten", "Silent", "Drowned", "Hollow", "Starless", "Ashen", "Graven", "Nameless"],
            place: ["Ur-Kalath", "the Sun King", "Ysmeret", "Old Varn", "the Nine", "Hesperon", "Tal Moraine", "the Last Priest"],
        },
        packs: [
            { id: "dead", creatures: ["skeleton"], size: [3, 5], weight: 4 },
            { id: "shades", creatures: ["ghost"], size: [2, 3], weight: 2 },
            { id: "cult", creatures: ["cultist"], size: [2, 4], weight: 2 },
            { id: "serpents", creatures: ["snake"], size: [2, 3], weight: 1 },
            { id: "scorpions", creatures: ["scorpion"], size: [2, 4], weight: 1 },
            { id: "rats", creatures: ["rat"], size: [3, 5], weight: 1 },
            { id: "wisps", creatures: ["wisp"], size: [2, 3], weight: 1 },
            { id: "wraiths", creatures: ["wraith"], size: [1, 2], weight: 1 },
        ],
        minis: [
            { id: "champion", creature: "skeleton", title: "Tomb champion", weight: 2 },
            { id: "wraith", creature: "wraith", title: "Wraith", weight: 1 },
            { id: "highPriest", creature: "cultist", title: "Cult high priest", weight: 1 },
        ],
        bosses: [
            { id: "tombLord", creature: "wightLord", title: "the Tomb Lord", weight: 3 },
            { id: "dreadWraith", creature: "wraith", title: "the Dread Wraith", weight: 1 },
        ],
        rooms: {
            vestibule: [{ id: "vestibule", props: [{ char: "Z", count: [2, 2], at: "wall", mirror: true }, { char: "m", count: [0, 1], at: "corner" }, { char: "v", count: [2, 2], at: "wall", mirror: true }], torches: [2, 2] }],
            hypostyle: [{ id: "pillars", props: [{ char: "I", count: [6, 16], at: "rows" }, { char: "m", count: [0, 2], at: "open" }, { char: "j", count: [0, 2], at: "open" }, { char: "v", count: [0, 2], at: "wall" }, { char: "i", count: [0, 1], at: "open" }], torches: [2, 4] }],
            gallery: [{ id: "tombs", props: [{ char: "t", count: [4, 8], at: "sides", size: [2, 1] }, { char: "k", count: [1, 2], at: "wall", mirror: true }, { char: "j", count: [0, 2], at: "open" }, { char: "v", count: [0, 2], at: "wall" }], torches: [2, 2] }],
            rotunda: [{ id: "rotunda", props: [{ char: "Z", count: [1, 1], at: "centre" }, { char: "I", count: [4, 6], at: "wall", mirror: true }, { char: "m", count: [0, 2], at: "open" }, { char: "v", count: [1, 2], at: "wall" }], torches: [2, 4] }],
            chapel: [{ id: "chapel", props: [{ char: "a", count: [1, 1], at: "centre", size: [2, 1] }, { char: "k", count: [2, 2], at: "corner", mirror: true }, { char: "j", count: [0, 2], at: "open" }, { char: "v", count: [1, 2], at: "wall", mirror: true }], torches: [2, 2] }],
            shrine: [{ id: "shrine", props: [{ char: "s", count: [1, 1], at: "wall" }, { char: "k", count: [1, 2], at: "corner" }, { char: "m", count: [0, 1], at: "open" }, { char: "v", count: [1, 1], at: "wall" }], torches: [1, 1] }],
            ossuary: [{ id: "ossuary", props: [{ char: "j", count: [3, 5], at: "open" }, { char: "t", count: [1, 2], at: "wall", size: [2, 1] }, { char: "i", count: [1, 2], at: "open" }, { char: "d", count: [2, 4], at: "wall" }], torches: [0, 1] }],
            cell: [{ id: "cell", props: [{ char: "m", count: [0, 2], at: "wall" }, { char: "j", count: [0, 1], at: "open" }, { char: "d", count: [1, 2], at: "wall" }, { char: "i", count: [0, 1], at: "open" }], torches: [0, 1] }],
            stairhall: [{ id: "stairhall", props: [{ char: "Z", count: [2, 2], at: "wall", mirror: true }, { char: "v", count: [0, 2], at: "wall" }], torches: [2, 2] }],
            arena: [{ id: "sanctum", props: [{ char: "I", count: [6, 10], at: "rows" }, { char: "a", count: [1, 1], at: "head", size: [2, 1] }, { char: "k", count: [2, 4], at: "corner", mirror: true }, { char: "y", count: [2, 2], at: "open", mirror: true }, { char: "v", count: [2, 4], at: "wall", mirror: true }, { char: "i", count: [0, 2], at: "open" }], torches: [2, 4] }],
        },
    },
    // (An ants' nest: dug as ants dig (layouts.js nest), a gallery winding up through the earth and
    // chambers off it on short stalks, its chambers heaped with what the ants have dragged in, its
    // middens near the top, its larders between and its brood deep down; giant ants in their numbers, great centipedes in its deeper tunnels, packs of
    // dungeon spiders each led by an elite dungeon spider, giant cockroaches, dungeon wasps and
    // dungeon scorpions, and the Ant Monster, their great queen, calling her flock to her in her
    // chamber at the bottom
    // (creatures.js). All of them drawn from models of their own, read at its door: beasts/model.js
    // modelsInside, app/readying.js)
    nest: {
        id: "nest",
        name: "an ants' nest",
        layout: "nest",
        lands: { savannah: 4, badlands: 3, meadow: 2, farmland: 2, heath: 2, jungle: 2 },
        style: "dungeon-caves",
        ground: GROUND.soil,
        sound: "nest",
        names: {
            forms: ["the {adj} Nest", "the {adj} Mound", "the Ant Hills of {place}", "{place} Warrens", "the {adj} Hive", "the Brood Halls of {place}"],
            adj: ["Teeming", "Seething", "Red", "Biting", "Swarming", "Crawling", "Hollow", "Amber"],
            place: ["Old Varro", "Dunmere", "the Dry Hills", "Kessick", "Redearth", "Thornbrake", "Gall Rise", "Sallow Down"],
        },
        packs: [
            { id: "workers", creatures: ["ant"], size: [3, 5], weight: 5 },
            { id: "soldiers", creatures: ["ant"], size: [4, 6], weight: 2 },
            { id: "crawlers", creatures: ["greatCentipede"], size: [1, 2], weight: 2 },
            // (A crawler come in among the ants: every fourth of them)
            { id: "hunted", creatures: ["ant", "ant", "ant", "greatCentipede"], size: [3, 5], weight: 1 },
            // (The spiders that hunt its tunnels, each pack led by an elite dungeon spider)
            { id: "spiders", creatures: ["eliteDungeonSpider", "dungeonSpider", "dungeonSpider", "dungeonSpider"], size: [3, 5], weight: 2 },
            // (What else has crept in: giant cockroaches at what the ants leave, dungeon wasps
            // hovering in its galleries, a dungeon scorpion or two in its deeper tunnels)
            { id: "roaches", creatures: ["giantCockroach"], size: [3, 5], weight: 2 },
            { id: "wasps", creatures: ["dungeonWasp"], size: [2, 4], weight: 2 },
            { id: "scorpions", creatures: ["dungeonScorpion"], size: [1, 2], weight: 1 },
            // (A black widow, hanging unseen under the roof of a gallery till someone passes beneath)
            { id: "widow", creatures: ["blackWidow"], size: [1, 1], weight: 2 },
        ],
        minis: [
            { id: "warden", creature: "ant", title: "Brood warden", weight: 2 },
            { id: "crawler", creature: "greatCentipede", title: "Tunnel crawler", weight: 2 },
            { id: "matriarch", creature: "blackWidow", title: "Widow matriarch", weight: 2 },
        ],
        bosses: [{ id: "antMonster", creature: "antMonster", title: "the Ant Monster", weight: 1, guard: ["ant"] }],
        // (Twice the small chests other dungeons have, and the adventurers who died in it, many of
        // them, each to be searched for what's left on them: place.js, play.js FALLEN)
        chests: 2,
        fallen: true,
        // (No ant lights a torch: it's lit by the fungus growing on its walls, thickest on its
        // midden heaps and round the queen's chamber, dark between; a torch only at its mouth, the
        // last that came in's, still burning)
        lit: "glow",
        rooms: {
            mouth: [{ id: "mouth", props: [{ char: "m", count: [1, 3], at: "wall" }, { char: "j", count: [1, 2], at: "open" }, { char: "i", count: [1, 1], at: "open" }, { char: "d", count: [2, 4], at: "wall" }], torches: [1, 1], glows: [0, 1] }],
            // (Its rooms by their part in the nest, as its layout has them: layouts.js nest. A
            // gallery's stretch is narrow: a pillar of earth at most in it. Its brood heaped in
            // the middle of a brood chamber, `E`; the heap of what it's thrown out in a midden's, `z`)
            gallery: [{ id: "galleries", props: [{ char: "*", count: [0, 1], at: "open" }, { char: "j", count: [1, 3], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "m", count: [1, 3], at: "wall" }, { char: "d", count: [2, 4], at: "wall" }], torches: [0, 0], glows: [1, 2] }],
            larder: [{ id: "larder", props: [{ char: "j", count: [4, 7], at: "open" }, { char: "i", count: [2, 4], at: "open" }, { char: "m", count: [0, 2], at: "wall" }, { char: "d", count: [2, 3], at: "wall" }], torches: [0, 0], glows: [1, 2] }],
            brood: [{ id: "brood", props: [{ char: "E", count: [1, 1], at: "centre", size: [2, 2] }, { char: "m", count: [2, 4], at: "wall" }, { char: "j", count: [1, 2], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 0], glows: [1, 2] }],
            midden: [{ id: "midden", props: [{ char: "z", count: [1, 1], at: "centre", size: [2, 2] }, { char: "j", count: [3, 6], at: "open" }, { char: "i", count: [1, 3], at: "open" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 0], glows: [2, 3] }],
            nook: [{ id: "nook", props: [{ char: "m", count: [0, 2], at: "wall" }, { char: "j", count: [1, 2], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 0], glows: [0, 1] }],
            arena: [{ id: "chamber", props: [{ char: "*", count: [3, 5], at: "open" }, { char: "j", count: [5, 8], at: "open" }, { char: "i", count: [3, 5], at: "open" }, { char: "m", count: [2, 4], at: "wall" }, { char: "d", count: [2, 4], at: "wall" }], torches: [0, 0], glows: [4, 5] }],
        },
    },
    // (A hell (docs/DUNGEONS.md *Hells*): four levels deep, each a realm of its own, gone down
    // through portals, each sealed till its floor's boss falls; never dealt to a wild dungeon's
    // site (`wild: false`: themeFor), its ways in laid out by a pass of their own. Met only at the
    // highest tiers (`tiers`), whoever's in it suiting them all (`tiered: false`: its packs are
    // its own, not chosen by tier). Its realms, top to bottom (`realms`, each as a theme's fields
    // for its level): the Breach, brimstone caves where hell breaks through the rock, the cult's
    // possessed faithful in them; the Halls of Bone, flesh and bone, the dead walking; the River
    // of Fire, a fortress over it; and the Pit, the demon lord's throne at its heart and, beyond
    // it, the portal back up into the wilds (`exit`). Each level's boss (`warden`) guards its
    // portal down; the bottom level's before the throne. Its fiends hunt every level in packs, more
    // of them the deeper down (creatures.js `fiend`); the rest are the wild's creatures, until
    // bought models of more demons are read)
    hell: {
        id: "hell",
        name: "a hell",
        // (Each level dug as its realm digs it: `realms`' `layout`; this for whatever asks of the
        // theme as a whole)
        layout: "caves",
        wild: false,
        levels: 4,
        tiers: [9, 10],
        tiered: false,
        portals: true,
        exit: true,
        style: "dungeon-caves",
        ground: GROUND.soil,
        sound: "hellBreach",
        names: {
            forms: ["the {adj} Pit", "the Gates of {place}", "the {adj} Abyss", "the Descent into {place}", "the Hells of {place}"],
            adj: ["Burning", "Screaming", "Blackened", "Bleeding", "Howling", "Smouldering", "Endless", "Nameless"],
            place: ["Gehenna", "Malebolge", "Dis", "Tophet", "Acheron", "Abaddon", "Erebus", "Avernus"],
        },
        realms: [
            {
                id: "breach",
                name: "the Breach",
                layout: "caves",
                look: "hell-breach",
                style: "dungeon-caves",
                ground: GROUND.soil,
                sound: "hellBreach",
                packs: [
                    { id: "faithful", creatures: ["cultist"], size: [3, 5], weight: 3 },
                    { id: "slimes", creatures: ["magmaSlime"], size: [2, 3], weight: 2 },
                    { id: "salamanders", creatures: ["salamander"], size: [2, 3], weight: 1 },
                    { id: "hounds", creatures: ["blackShuck"], size: [2, 3], weight: 2 },
                    { id: "wraiths", creatures: ["wraith"], size: [1, 2], weight: 1 },
                    { id: "bats", creatures: ["bats"], size: [3, 5], weight: 1 },
                    { id: "fiends", creatures: ["fiend"], size: [1, 2], weight: 1 },
                    // (Its flayed: creatures.js)
                    { id: "flaylings", creatures: ["flayling"], size: [3, 5], weight: 3 },
                    { id: "husks", creatures: ["cinderHusk"], size: [2, 3], weight: 2 },
                    { id: "acolytes", creatures: ["pyreAcolyte"], size: [1, 2], weight: 2 },
                    // (Its walkers, in their brimstone skin: creatures.js)
                    { id: "walkers", creatures: ["brimstoneWalker"], size: [1, 2], weight: 1 },
                ],
                minis: [
                    { id: "fireCaller", creature: "cultist", title: "Fire-caller", weight: 2 },
                    { id: "magmaHeart", creature: "magmaSlime", title: "Magma heart", weight: 1 },
                    { id: "breachHound", creature: "blackShuck", title: "Hound of the Breach", weight: 1 },
                ],
                warden: { id: "breachPriest", creature: "cultist", title: "the Breach Priest", guard: ["cultist", "magmaSlime"] },
                rooms: {
                    mouth: [{ id: "breach", props: [{ char: "*", count: [1, 2], at: "wall" }, { char: "k", count: [2, 2], at: "wall", mirror: true }, { char: "j", count: [1, 2], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [2, 3], at: "wall" }], torches: [1, 1] }],
                    cavern: [
                        { id: "rite", weight: 2, props: [{ char: "a", count: [1, 1], at: "centre", size: [2, 1] }, { char: "k", count: [2, 4], at: "open" }, { char: "j", count: [1, 3], at: "open" }, { char: "i", count: [0, 2], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 1] },
                        { id: "pillars", weight: 2, props: [{ char: "~", count: [0, 1], at: "wall", size: [3, 2] }, { char: "*", count: [3, 6], at: "open" }, { char: "j", count: [1, 2], at: "open" }, { char: "y", count: [0, 1], at: "open" }, { char: "d", count: [2, 4], at: "wall" }], torches: [0, 1] },
                        { id: "bonepit", weight: 1, props: [{ char: "~", count: [0, 1], at: "wall", size: [2, 2] }, { char: "j", count: [3, 6], at: "open" }, { char: "i", count: [1, 3], at: "open" }, { char: "m", count: [1, 2], at: "wall" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 0] },
                    ],
                    grotto: [{ id: "smoke", props: [{ char: "~", count: [1, 1], at: "wall", size: [2, 2] }, { char: "*", count: [1, 3], at: "open" }, { char: "m", count: [0, 2], at: "wall" }, { char: "j", count: [0, 2], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 1] }],
                    // (The room furthest in, its master's, by the portal down: the cult's altar, the
                    // rift torn open over it, world/interiors3d.js breachRift)
                    goal: [{ id: "rift", props: [{ char: "a", count: [1, 1], at: "centre", size: [2, 1] }, { char: "k", count: [2, 3], at: "open" }, { char: "j", count: [1, 3], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 0] }],
                    nook: [{ id: "nook", props: [{ char: "~", count: [0, 1], at: "wall", size: [2, 2] }, { char: "m", count: [0, 2], at: "wall" }, { char: "j", count: [1, 2], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 0] }],
                },
            },
            {
                id: "bone",
                name: "the Halls of Bone",
                layout: "accretion",
                look: "hell-bone",
                style: "dungeon-ancient",
                ground: GROUND.courtyard,
                sound: "hellBone",
                packs: [
                    { id: "dead", creatures: ["skeleton"], size: [3, 5], weight: 4 },
                    { id: "barrow", creatures: ["draugr"], size: [1, 2], weight: 2 },
                    { id: "wraiths", creatures: ["wraith"], size: [1, 2], weight: 2 },
                    { id: "shades", creatures: ["ghost"], size: [2, 3], weight: 2 },
                    { id: "stalkers", creatures: ["shadowStalker"], size: [1, 2], weight: 1 },
                    { id: "fiends", creatures: ["fiend"], size: [1, 2], weight: 2 },
                    // (Its flayed: creatures.js)
                    { id: "priests", creatures: ["ossuaryPriest"], size: [1, 1], weight: 2 },
                    { id: "wardens", creatures: ["dirgeWarden"], size: [1, 2], weight: 2 },
                    { id: "hierarch", creatures: ["flayedHierarch"], size: [1, 1], weight: 1 },
                    // (Its walkers, ash grey: creatures.js)
                    { id: "walkers", creatures: ["ashWalker"], size: [1, 2], weight: 1 },
                ],
                minis: [
                    { id: "boneChampion", creature: "skeleton", title: "Bone champion", weight: 2 },
                    { id: "flayedKing", creature: "draugr", title: "Flayed king", weight: 1 },
                    { id: "wailer", creature: "wraith", title: "Wailing shade", weight: 1 },
                ],
                warden: { id: "boneLord", creature: "wightLord", title: "the Bone Lord", guard: ["skeleton"] },
                rooms: {
                    gate: [{ id: "gate", props: [{ char: "Z", count: [2, 2], at: "wall", mirror: true }, { char: "&", count: [0, 1], at: "open", size: [2, 2] }, { char: "j", count: [1, 3], at: "open" }, { char: "k", count: [0, 2], at: "corner" }, { char: "d", count: [1, 2], at: "wall" }], torches: [1, 1] }],
                    hall: [
                        { id: "ossuary", weight: 2, props: [{ char: "t", count: [2, 4], at: "sides", size: [2, 1] }, { char: "&", count: [0, 1], at: "open", size: [2, 2] }, { char: "j", count: [2, 4], at: "open" }, { char: "i", count: [0, 2], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 1] },
                        { id: "charnel", weight: 1, props: [{ char: "I", count: [2, 4], at: "open" }, { char: "&", count: [1, 2], at: "open", size: [2, 2] }, { char: "j", count: [3, 6], at: "open" }, { char: "i", count: [1, 2], at: "open" }, { char: "y", count: [0, 1], at: "wall" }], torches: [0, 1] },
                    ],
                    quarters: [{ id: "pens", props: [{ char: "&", count: [1, 1], at: "open", size: [2, 2] }, { char: "j", count: [2, 4], at: "open" }, { char: "i", count: [1, 3], at: "open" }, { char: "m", count: [0, 1], at: "wall" }, { char: "d", count: [2, 3], at: "wall" }], torches: [0, 1] }],
                    store: [{ id: "bonestore", props: [{ char: "j", count: [4, 7], at: "open" }, { char: "t", count: [1, 2], at: "wall", size: [2, 1] }, { char: "d", count: [2, 4], at: "wall" }], torches: [0, 1] }],
                    // (The room furthest in, its master's, by the portal down: the heart the halls
                    // beat to, the sacs where its demons are born round it, world/flesh.js)
                    goal: [{ id: "heart", props: [{ char: "@", count: [1, 1], at: "centre", size: [2, 2] }, { char: "&", count: [1, 2], at: "open", size: [2, 2] }, { char: "j", count: [1, 3], at: "open" }, { char: "i", count: [0, 1], at: "open" }], torches: [0, 0] }],
                    den: [{ id: "flaying", props: [{ char: "a", count: [1, 1], at: "centre", size: [2, 1] }, { char: "&", count: [1, 2], at: "open", size: [2, 2] }, { char: "k", count: [2, 3], at: "corner" }, { char: "i", count: [1, 2], at: "open" }, { char: "j", count: [1, 3], at: "open" }], torches: [0, 1] }],
                },
            },
            {
                id: "fire",
                name: "the River of Fire",
                layout: "caves",
                look: "hell-fire",
                style: "dungeon-caves",
                ground: GROUND.soil,
                sound: "hellFire",
                // (Its caverns and grottos flooded with lava, causeways three squares wide across
                // them, an island or two off them: place.js flood)
                lava: { rooms: ["cavern", "grotto"], wide: 3, islands: [1, 2], island: 2 },
                packs: [
                    { id: "slimes", creatures: ["magmaSlime"], size: [2, 4], weight: 3 },
                    { id: "salamanders", creatures: ["salamander"], size: [2, 3], weight: 3 },
                    { id: "hounds", creatures: ["blackShuck"], size: [2, 3], weight: 2 },
                    { id: "chimera", creatures: ["chimera"], size: [1, 1], weight: 1 },
                    { id: "wyverns", creatures: ["wyvern"], size: [1, 2], weight: 1 },
                    { id: "fiends", creatures: ["fiend"], size: [1, 3], weight: 2 },
                    // (Its gorgers: creatures.js)
                    { id: "slagGorgers", creatures: ["slagGorger"], size: [2, 3], weight: 2 },
                    { id: "forgeBrutes", creatures: ["forgeBrute"], size: [1, 2], weight: 2 },
                    { id: "glutton", creatures: ["chainedGlutton"], size: [1, 1], weight: 1 },
                    // (Its hellwalkers, at home here, met the most: creatures.js)
                    { id: "hellwalkers", creatures: ["hellwalker"], size: [2, 3], weight: 3 },
                ],
                minis: [
                    { id: "moltenLord", creature: "magmaSlime", title: "Molten lord", weight: 1 },
                    { id: "brander", creature: "salamander", title: "Fire-brander", weight: 2 },
                    { id: "forgeChimera", creature: "chimera", title: "Forge chimera", weight: 1 },
                ],
                warden: { id: "forgeBeast", creature: "chimera", title: "the Forge Beast", guard: ["salamander"] },
                rooms: {
                    mouth: [{ id: "landing", props: [{ char: "*", count: [1, 2], at: "wall" }, { char: "y", count: [1, 2], at: "wall" }, { char: "d", count: [2, 3], at: "wall" }], torches: [1, 1] }],
                    cavern: [
                        { id: "forge", weight: 2, props: [{ char: "y", count: [2, 3], at: "open" }, { char: "A", count: [1, 2], at: "open" }, { char: "m", count: [1, 2], at: "wall" }, { char: "d", count: [2, 3], at: "wall" }], torches: [0, 1] },
                        { id: "slag", weight: 2, props: [{ char: "*", count: [3, 6], at: "open" }, { char: "m", count: [1, 3], at: "wall" }, { char: "j", count: [0, 2], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 1] },
                    ],
                    grotto: [{ id: "cinders", props: [{ char: "*", count: [1, 3], at: "open" }, { char: "y", count: [0, 1], at: "open" }, { char: "m", count: [1, 2], at: "wall" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 1] }],
                    // (The room furthest in, its master's, by the portal down: the Hellforge,
                    // world/interiors3d.js hellforge, its anvils before it)
                    goal: [{ id: "hellforge", props: [{ char: "F", count: [1, 1], tries: [{ at: "back", size: [3, 2] }, { at: "back", size: [2, 2] }, { at: "open", size: [2, 2] }] }, { char: "A", count: [1, 2], at: "open" }, { char: "y", count: [1, 2], at: "open" }, { char: "m", count: [1, 2], at: "wall" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 0] }],
                    nook: [{ id: "nook", props: [{ char: "m", count: [1, 2], at: "wall" }, { char: "j", count: [0, 1], at: "open" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 0] }],
                },
            },
            {
                id: "pit",
                name: "the Pit",
                layout: "axial",
                look: "hell-pit",
                style: "dungeon-ancient",
                ground: GROUND.courtyard,
                sound: "hellPit",
                hoard: "head",
                // (Its lava only a rim: its throne hall's side walls lined with it, place.js lavaRim)
                rim: { doors: 3, clear: 2 },
                packs: [
                    { id: "legion", creatures: ["wraith", "skeleton", "skeleton"], size: [3, 5], weight: 2 },
                    { id: "faithful", creatures: ["cultist"], size: [3, 5], weight: 2 },
                    { id: "doomed", creatures: ["draugr"], size: [1, 2], weight: 2 },
                    { id: "stalkers", creatures: ["shadowStalker"], size: [1, 2], weight: 1 },
                    { id: "hounds", creatures: ["blackShuck"], size: [2, 3], weight: 1 },
                    { id: "embers", creatures: ["magmaSlime", "salamander"], size: [2, 3], weight: 1 },
                    { id: "fiends", creatures: ["fiend"], size: [2, 3], weight: 3 },
                    // (Its gorgers: creatures.js)
                    { id: "bloatGorgers", creatures: ["bloatGorger"], size: [2, 3], weight: 2 },
                    { id: "ravagers", creatures: ["pitRavager"], size: [2, 3], weight: 2 },
                    { id: "warlord", creatures: ["gorgerWarlord"], size: [1, 1], weight: 1 },
                    // (Its lord's henchmen, and its walkers, bile green: creatures.js)
                    { id: "henchmen", creatures: ["henchman"], size: [2, 3], weight: 2 },
                    { id: "walkers", creatures: ["bileWalker"], size: [1, 2], weight: 1 },
                ],
                minis: [
                    { id: "pitPriest", creature: "cultist", title: "Pit priest", weight: 1 },
                    { id: "doomedKnight", creature: "draugr", title: "Doomed knight", weight: 1 },
                    { id: "herald", creature: "wraith", title: "Herald of the Pit", weight: 1 },
                ],
                warden: { id: "gatekeeper", creature: "ogre", title: "the Gatekeeper", guard: ["draugr"] },
                rooms: {
                    vestibule: [{ id: "vestibule", props: [{ char: "Z", count: [2, 2], at: "wall", mirror: true }, { char: "y", count: [2, 2], at: "open", mirror: true }, { char: "j", count: [0, 2], at: "open" }], torches: [1, 2] }],
                    hypostyle: [{ id: "pillars", props: [{ char: "I", count: [6, 14], at: "rows" }, { char: "y", count: [1, 2], at: "open" }, { char: "j", count: [0, 2], at: "open" }, { char: "i", count: [0, 1], at: "open" }], torches: [1, 3] }],
                    gallery: [{ id: "watchers", props: [{ char: "Z", count: [2, 4], at: "sides" }, { char: "k", count: [1, 2], at: "wall", mirror: true }, { char: "j", count: [0, 2], at: "open" }], torches: [1, 2] }],
                    rotunda: [{ id: "rotunda", props: [{ char: "y", count: [1, 1], at: "centre" }, { char: "I", count: [4, 6], at: "wall", mirror: true }, { char: "j", count: [1, 2], at: "open" }], torches: [1, 2] }],
                    chapel: [{ id: "altar", props: [{ char: "a", count: [1, 1], at: "centre", size: [2, 1] }, { char: "k", count: [2, 2], at: "corner", mirror: true }, { char: "i", count: [0, 2], at: "open" }, { char: "j", count: [1, 2], at: "open" }], torches: [1, 2] }],
                    shrine: [{ id: "shrine", props: [{ char: "s", count: [1, 1], at: "wall" }, { char: "k", count: [1, 2], at: "corner" }, { char: "j", count: [0, 1], at: "open" }], torches: [1, 1] }],
                    ossuary: [{ id: "ossuary", props: [{ char: "j", count: [3, 5], at: "open" }, { char: "t", count: [1, 2], at: "wall", size: [2, 1] }, { char: "i", count: [1, 2], at: "open" }, { char: "d", count: [1, 3], at: "wall" }], torches: [0, 1] }],
                    cell: [{ id: "cell", props: [{ char: "j", count: [1, 2], at: "open" }, { char: "i", count: [0, 1], at: "open" }, { char: "d", count: [1, 2], at: "wall" }], torches: [0, 1] }],
                    stairhall: [{ id: "stairhall", props: [{ char: "Z", count: [2, 2], at: "wall", mirror: true }, { char: "y", count: [0, 2], at: "open" }], torches: [1, 2] }],
                    arena: [{ id: "throne", props: [{ char: "Y", count: [1, 1], at: "head" }, { char: "I", count: [6, 10], at: "rows" }, { char: "y", count: [2, 2], at: "open", mirror: true }, { char: "Z", count: [2, 4], at: "wall", mirror: true }, { char: "j", count: [2, 4], at: "open" }, { char: "i", count: [0, 2], at: "open" }], torches: [2, 3] }],
                },
            },
        ],
        // (The Lord of the Pit, its henchmen about it)
        bosses: [{ id: "demonLord", creature: "demonLord", title: "the Lord of the Pit", weight: 1, guard: ["henchman"] }],
        // (Its realms' packs, mini-bosses (their wardens among them) and rooms all together, for
        // whatever asks of the theme as a whole: who may be in it, beasts/model.js modelsInside)
        get packs() {
            return this.realms.flatMap(({ id, packs }) => packs.map((pack) => ({ ...pack, id: `${id}-${pack.id}` })));
        },
        get minis() {
            return this.realms.flatMap(({ minis, warden }) => [...minis, { ...warden, weight: 1 }]);
        },
        get rooms() {
            return Object.assign({}, ...this.realms.map(({ rooms }) => rooms));
        },
    },
};

/**
 * Which theme a dungeon found in the wilds has, by its seed and the land its way in's in (a BIOMES
 * id): any of them but those never found there (`wild: false`: a hell, laid out by a pass of its
 * own), the likelier as the theme's `lands` has that land (1 for one it doesn't name), chosen
 * stably as themes are added (seeds.js pickStable).
 */
export function themeFor(seed, land) {
    return pickStable(seed, "theme", Object.values(THEMES), (theme) => (theme.wild === false ? 0 : (theme.lands?.[land] ?? 1))).id;
}

/**
 * A theme as it is on one of its levels (`index`, from the top): the theme, or for one with a
 * realm on each level (`realms`: a hell's), its realm's fields over its own.
 */
export function realmOf(theme, index) {
    const realm = theme.realms?.[Math.min(index, theme.realms.length - 1)];

    return realm ? { ...theme, ...realm, realm: realm.id } : theme;
}

/**
 * A dungeon's name, from its theme's names (forms with {adj} and {place} filled in), by seed,
 * stable as names are added.
 */
export function dungeonName(theme, seed) {
    const strings = (list) => list.map((id) => ({ id }));
    const form = pickStable(seed, "name", strings(theme.names.forms)).id;

    return form.replace("{adj}", pickStable(seed, "adj", strings(theme.names.adj)).id).replace("{place}", pickStable(seed, "place", strings(theme.names.place)).id);
}

/** Add a theme (as THEMES' own), or replace one with the same id. */
export function registerTheme(theme) {
    THEMES[theme.id] = theme;
}

/** The themes found in the wilds, in a stable order (registerTheme adds to it). */
export const themeIds = () => Object.keys(THEMES);
