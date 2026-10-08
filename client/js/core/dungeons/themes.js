// What each kind of dungeon is (core/dungeons: docs/DUNGEONS.md), as data: how its levels are dug
// (layouts.js), how it's drawn and sounds, what it's called, who's in it (packs of the wild's
// creatures, the mini-bosses along the way and the boss at the bottom, each by the tiers it suits),
// and how each kind of room in it is dressed (its props, by plan character: interiors.js PLAN_KEY)
// and lit. Start with caves, an outlaws' hideout and an ancient temple; add more with
// registerTheme (a new layout with layouts.js registerLayout, new art by the theme's `style`).
//
// Everything's chosen from these lists by seed in a way (seeds.js pickStable) that adding to a list
// changes only the choices the new entry wins, so the dungeons already found stay as they were.

import { GROUND } from "../setpieces/pieces.js";

/**
 * Where a prop goes in a room (place.js): against a wall, facing out from it ("wall"); free
 * standing with ground all round ("open"); as near the room's middle as it can ("centre"); in a
 * corner ("corner"); in rows across a hall, aisles kept clear ("rows": a pillared hall's pillars);
 * along both long sides ("sides": a gallery's tombs); at the head of a hall, against its north
 * wall on the middle way ("head": a sanctum's altar).
 */
export const PROP_PLACES = Object.freeze(["wall", "open", "centre", "corner", "rows", "sides", "head"]);

/**
 * The themes, by id: { id, name (what the kind's called), layout (layouts.js LAYOUTS), hoard
 * ("head" to put the boss's hoard at the head of its hall, else at the far end), style (the
 * art's: world/interiors3d.js), ground (setpieces/pieces.js GROUND), sound, names ({ forms, adj,
 * place }: what one's called), packs ([{ id, creatures, size: [least, most], weight }]), minis
 * ([{ id, creature, title, weight }]), bosses (as minis), rooms ({ kind: [{ id, weight, props:
 * [{ char, count: [least, most], at (PROP_PLACES), size: [w, h], mirror }], torches: [least, most]
 * }] }: each kind of room a layout digs, and "any" for kinds not listed) }.
 */
export const THEMES = {
    caves: {
        id: "caves",
        name: "caves",
        layout: "caves",
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
            { id: "goblinKing", creature: "goblin", title: "the Goblin King", weight: 1 },
            { id: "frostTroll", creature: "frostTroll", title: "the Frost Troll", weight: 1 },
        ],
        rooms: {
            mouth: [{ id: "mouth", props: [{ char: "*", count: [1, 2], at: "wall" }, { char: "j", count: [0, 1], at: "open" }], torches: [1, 1] }],
            cavern: [
                { id: "pillars", weight: 2, props: [{ char: "*", count: [3, 6], at: "open" }, { char: "j", count: [0, 2], at: "open" }], torches: [0, 1] },
                { id: "camp", weight: 1, props: [{ char: "x", count: [1, 1], at: "centre" }, { char: "u", count: [2, 4], at: "wall" }, { char: "K", count: [0, 1], at: "wall" }], torches: [0, 1] },
                { id: "bonepit", weight: 1, props: [{ char: "j", count: [3, 6], at: "open" }, { char: "m", count: [1, 3], at: "wall" }], torches: [0, 0] },
            ],
            grotto: [
                { id: "drip", weight: 2, props: [{ char: "*", count: [1, 3], at: "open" }, { char: "m", count: [0, 2], at: "wall" }], torches: [0, 1] },
                { id: "nest", weight: 1, props: [{ char: "j", count: [2, 4], at: "open" }], torches: [0, 0] },
            ],
            nook: [{ id: "nook", props: [{ char: "m", count: [0, 2], at: "wall" }, { char: "j", count: [0, 1], at: "open" }], torches: [0, 0] }],
            arena: [{ id: "throne", props: [{ char: "*", count: [4, 7], at: "open" }, { char: "j", count: [3, 6], at: "open" }, { char: "x", count: [1, 1], at: "centre" }], torches: [2, 3] }],
        },
    },
    hideout: {
        id: "hideout",
        name: "an outlaws' hideout",
        layout: "accretion",
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
            gate: [{ id: "gate", props: [{ char: "%", count: [1, 2], at: "wall" }, { char: "K", count: [0, 1], at: "corner" }], torches: [2, 2] }],
            hall: [
                { id: "mess", weight: 2, props: [{ char: "T", count: [2, 3], at: "open", size: [3, 1] }, { char: "K", count: [1, 2], at: "corner" }, { char: "x", count: [0, 1], at: "wall" }], torches: [2, 3] },
                { id: "loot", weight: 1, props: [{ char: "%", count: [3, 5], at: "wall" }, { char: "K", count: [1, 3], at: "corner" }], torches: [1, 2] },
            ],
            quarters: [{ id: "bunks", props: [{ char: "u", count: [3, 5], at: "wall" }, { char: "%", count: [0, 1], at: "corner" }], torches: [1, 2] }],
            store: [{ id: "store", props: [{ char: "%", count: [2, 3], at: "wall" }, { char: "K", count: [1, 2], at: "corner" }], torches: [0, 1] }],
            den: [
                { id: "armoury", weight: 1, props: [{ char: "R", count: [1, 2], at: "wall", size: [2, 1] }, { char: "%", count: [0, 1], at: "corner" }], torches: [1, 1] },
                { id: "kennel", weight: 1, props: [{ char: "j", count: [2, 3], at: "open" }, { char: "u", count: [1, 2], at: "wall" }], torches: [0, 1] },
            ],
            arena: [{ id: "chief", props: [{ char: "T", count: [1, 1], at: "centre", size: [3, 1] }, { char: "Y", count: [1, 1], at: "wall" }, { char: "%", count: [2, 4], at: "corner" }, { char: "K", count: [2, 3], at: "wall" }], torches: [3, 4] }],
        },
    },
    ancient: {
        id: "ancient",
        name: "an ancient temple",
        layout: "axial",
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
            vestibule: [{ id: "vestibule", props: [{ char: "Z", count: [2, 2], at: "wall", mirror: true }, { char: "m", count: [0, 1], at: "corner" }], torches: [2, 2] }],
            hypostyle: [{ id: "pillars", props: [{ char: "I", count: [6, 16], at: "rows" }, { char: "m", count: [0, 2], at: "open" }, { char: "j", count: [0, 2], at: "open" }], torches: [2, 4] }],
            gallery: [{ id: "tombs", props: [{ char: "t", count: [4, 8], at: "sides", size: [2, 1] }, { char: "k", count: [1, 2], at: "wall", mirror: true }, { char: "j", count: [0, 2], at: "open" }], torches: [2, 2] }],
            rotunda: [{ id: "rotunda", props: [{ char: "Z", count: [1, 1], at: "centre" }, { char: "I", count: [4, 6], at: "wall", mirror: true }, { char: "m", count: [0, 2], at: "open" }], torches: [2, 4] }],
            chapel: [{ id: "chapel", props: [{ char: "a", count: [1, 1], at: "centre", size: [2, 1] }, { char: "k", count: [2, 2], at: "corner", mirror: true }, { char: "j", count: [0, 2], at: "open" }], torches: [2, 2] }],
            shrine: [{ id: "shrine", props: [{ char: "s", count: [1, 1], at: "wall" }, { char: "k", count: [1, 2], at: "corner" }, { char: "m", count: [0, 1], at: "open" }], torches: [1, 1] }],
            ossuary: [{ id: "ossuary", props: [{ char: "j", count: [3, 5], at: "open" }, { char: "t", count: [1, 2], at: "wall", size: [2, 1] }], torches: [0, 1] }],
            cell: [{ id: "cell", props: [{ char: "m", count: [0, 2], at: "wall" }, { char: "j", count: [0, 1], at: "open" }], torches: [0, 1] }],
            stairhall: [{ id: "stairhall", props: [{ char: "Z", count: [2, 2], at: "wall", mirror: true }], torches: [2, 2] }],
            arena: [{ id: "sanctum", props: [{ char: "I", count: [6, 10], at: "rows" }, { char: "a", count: [1, 1], at: "head", size: [2, 1] }, { char: "k", count: [2, 4], at: "corner", mirror: true }, { char: "y", count: [2, 2], at: "open", mirror: true }], torches: [2, 4] }],
        },
    },
};

/** Add a theme (as THEMES' own), or replace one with the same id. */
export function registerTheme(theme) {
    THEMES[theme.id] = theme;
}

/** The themes found in the wilds, in a stable order (registerTheme adds to it). */
export const themeIds = () => Object.keys(THEMES);
