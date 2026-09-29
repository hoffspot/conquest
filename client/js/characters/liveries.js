// Each people's colours, as their soldiers wear them in uniform and their officials in livery
// (docs/GAME.md, "Uniforms and livery"), chosen to set off their skin or fur:
//
//  - humans (of every colour): royal blue and gold, bright steel;
//  - elves (pale): forest green and silver, silvered steel;
//  - dark elves (ashen violet): deep violet, black and silver, black steel;
//  - cat folk (tawny, gold, grey fur): indigo and saffron, bronze;
//  - lizard folk (green scales): crimson and turquoise, bronze;
//  - orcs (green): blood red and black, blackened iron.
//
// Each has an emblem of its own on its surcoats, shields and cloaks: the humans' crown, the elves'
// leaf, the dark elves' spider, the cat folk's sun, the lizard folk's serpent, the orcs' claws.
// A soldier's kit is their people's uniform (`soldierKit`: helm, surcoat over mail or the like,
// vambraces, gauntlets, belt, leg guards, war boots; a shield with a one-handed weapon, a quiver
// with a bow; a captain's cloak); an official's their people's livery (`liveryKit`: a tunic in
// their colours with the emblem, a chain of office, a long robe).
//
// And how each piece of gear (core/gear.js) is drawn on a character: `dress` turns what a player
// wears into equipment (characters/equipment.js), each people's make of a uniform's pieces in its
// colours and metal. Pure data, no DOM.

import { WEAPONS } from "../core/weapons.js";

/**
 * Each people's colours: their cloth (`main`), its trim, a darker shade (`dark`: trousers, a
 * cloak's lining), their metal's colour and how it shines, their leather, and their emblem.
 */
export const LIVERIES = Object.freeze({
    human: { main: "#2f55ad", trim: "#e0b848", dark: "#27324f", metal: "#c3c8cc", leather: "#4a3322", emblem: "crown" },
    elf: { main: "#3a8a55", trim: "#e8eef2", dark: "#2a4636", metal: "#dde3ea", leather: "#5a4a32", emblem: "leaf" },
    darkElf: { main: "#5e2f8c", trim: "#d6cfe6", dark: "#1d1724", metal: "#3c3844", leather: "#1e1a22", emblem: "spider" },
    cat: { main: "#3447a3", trim: "#eda83a", dark: "#232a55", metal: "#b8863a", leather: "#6a4424", emblem: "sun" },
    lizard: { main: "#a8322a", trim: "#3fc4aa", dark: "#4a1a16", metal: "#a87a3a", leather: "#3e3a22", emblem: "serpent" },
    orc: { main: "#9a2218", trim: "#1b1614", dark: "#32100c", metal: "#4a4642", leather: "#3a2616", emblem: "claws" },
});

/** The peoples with a livery. */
export const LIVERIED = Object.freeze(Object.keys(LIVERIES));

// A people with a livery (anyone else wears the humans')
const liveried = (people) => (LIVERIES[people] ? people : "human");

/**
 * How each of a people's uniform pieces (core/gear.js UNIFORM) is drawn: its equipment ids,
 * each people's own make (made by equipment.js from LIVERIES: `${id}.${people}`). An orc's
 * chest is a blackened breastplate over bare arms, not mail under a surcoat.
 */
export function uniformLook(piece, people) {
    const p = liveried(people);

    switch (piece) {
        case "helm":
            return [`helm.${p}`];
        case "hauberk":
            return p === "orc" ? ["breastplate.orc"] : p === "lizard" ? ["gambeson.lizard", "surcoat.lizard"] : [`mail.${p}`, `surcoat.${p}`];
        case "vambraces":
            return [`vambraces.${p}`];
        case "warGloves":
            return [`gauntlets.${p}`];
        case "girdle":
            return [`belt.${p}`];
        case "legguards":
            return [`trousers.${p}`, `greaves.${p}`];
        case "warBoots":
            return [`sabatons.${p}`];
        case "cloak":
            return [`cloak.${p}`];
        case "shield":
            return [`shield.${p}`];
        default:
            return [];
    }
}

// How the other pieces of gear are drawn (the weapons are core/weapons.js's; jewellery doesn't show)
const LOOKS = Object.freeze({
    roundShield: ["roundShield"],
    kiteShield: ["kiteShield"],
    quiver: ["quiver"],
    cap: ["leatherCap"],
    nasalHelm: ["nasalHelm"],
    wizardHat: ["wizardHat"],
    jerkin: ["jerkin"],
    gambeson: ["gambeson"],
    mail: ["mail"],
    plate: ["mail", "breastplate"],
    bracers: ["bracers"],
    gloves: ["gloves"],
    platedGloves: ["gauntlets"],
    belt: ["belt"],
    trousers: ["trousers"],
    breeches: ["breeches"],
    greaves: ["breeches", "greaves"],
    leatherBoots: ["boots"],
    sabatons: ["sabatons"],
    boots: ["spikedBoots"],
    travelCloak: ["travelCloak"],
});

/** How a piece of gear ({ id, people }: core/gear.js) is drawn: its equipment ids. */
export const lookOf = ({ id, people = null }) => LOOKS[id] ?? uniformLook(id, people);

/** What a character wearing some gear ([{ id, people }]) has on: equipment ids, each once. */
export const dress = (pieces) => [...new Set(pieces.flatMap((piece) => lookOf(piece)))];

// The weapons a soldier carries a shield with (one-handed), and one worn on both hands (spiked
// gauntlets: no gauntlets of the uniform's under them)
const SHIELDED = new Set(["sword", "cleaver"]);

/**
 * A soldier's kit (equipment ids): their people's uniform, what they fight with (a core/
 * weapons.js WEAPONS key) and what goes with it; a captain's cloak.
 */
export function soldierKit(people, weapon, { captain = false } = {}) {
    const p = liveried(people);
    const under = p === "orc" ? ["loincloth"] : [`livery.${p}`];
    const pieces = ["helm", "hauberk", "vambraces", ...(weapon === "gauntlets" ? [] : ["warGloves"]), "girdle", "legguards", "warBoots", ...(captain ? ["cloak"] : []), ...(SHIELDED.has(weapon) ? ["shield"] : [])];

    return [...under, ...pieces.flatMap((piece) => uniformLook(piece, p)), ...(WEAPONS[weapon]?.equipment ?? []), ...(weapon === "bow" ? ["quiver"] : [])];
}

/**
 * The livery of each of a people's officials (by their part, and a man's or a woman's): a tunic
 * in their colours with their emblem (`livery`), a chain of office, trousers or a long robe, a
 * cloak and crown for their ruler. (`.` marks a people's make of it.)
 */
const LIVERY = Object.freeze({
    ruler: { m: ["livery.", "chain", "trousers.", "boots", "belt.", "cloak.", "crown"], f: ["livery.", "robe.", "chain", "boots", "cloak.", "crown"] },
    steward: { m: ["livery.", "chain", "trousers.", "boots", "belt."], f: ["livery.", "robe.", "chain", "boots"] },
    reeve: { m: ["livery.", "chain", "trousers.", "boots", "belt."], f: ["livery.", "robe.", "chain", "boots"] },
    clerk: { m: ["livery.", "trousers.", "boots", "belt."], f: ["livery.", "robe.", "boots"] },
    councillor: { m: ["livery.", "robe.", "chain", "boots"], f: ["livery.", "robe.", "chain", "boots"] },
    envoy: { m: ["livery.", "robe.", "chain", "cloak.", "boots"], f: ["livery.", "robe.", "chain", "cloak.", "boots"] },
});

/** The parts that wear their people's livery. */
export const LIVERY_PARTS = Object.freeze(Object.keys(LIVERY));

/** An official's livery (equipment ids), in their people's colours: their part's, a man's or a woman's. */
export function liveryKit(people, part, sex = "m") {
    const p = liveried(people);
    const kit = LIVERY[part]?.[sex] ?? LIVERY[part]?.m ?? [];

    return kit.map((id) => (id.endsWith(".") ? `${id}${p}` : id));
}
