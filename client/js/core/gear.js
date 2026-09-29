// What a player wears and wields (docs/GAME.md, "Gear"): a slot for each part of them, and the
// pieces that go in each, as in the old dungeon games' inventories:
//
//  - head, amulet, cloak, chest, bracers, gloves, belt, legs, boots, two rings, and both hands;
//  - a weapon in the main hand; one held in both hands (a staff, a war hammer, a bow, spiked
//    gauntlets, a grimoire held open) leaves nothing for the other, except a bow, whose other
//    hand takes a quiver; one-handed (a sword, a wand), the other takes a shield;
//  - each piece as well made as it was (progress.js QUALITIES), and, the better made, with more
//    bonuses rolled on it (a keen sword, a helm of the bear), and named for them;
//  - each people's soldiers' pieces (their uniform: `people`), whose sets bring bonuses of their
//    own worn together, and whose helm, chest and cloak together pass for one of them.
//
// Pure data and arithmetic, no DOM: the host (core/host.js) and the pack (app/pack.js) use it.
// How each piece looks on a character is characters/liveries.js's.

import { ADJECTIVES } from "./war/peoples.js";

/**
 * The slots, as the pack shows them: what each takes (a piece's `slot`: a ring goes on either
 * hand).
 */
export const GEAR_SLOTS = Object.freeze([
    { id: "head", label: "Head", takes: "head" },
    { id: "amulet", label: "Amulet", takes: "amulet" },
    { id: "cloak", label: "Cloak", takes: "cloak" },
    { id: "chest", label: "Chest", takes: "chest" },
    { id: "bracers", label: "Bracers", takes: "bracers" },
    { id: "gloves", label: "Gloves", takes: "gloves" },
    { id: "belt", label: "Belt", takes: "belt" },
    { id: "legs", label: "Legs", takes: "legs" },
    { id: "boots", label: "Boots", takes: "boots" },
    { id: "ring1", label: "Ring", takes: "ring" },
    { id: "ring2", label: "Ring", takes: "ring" },
    { id: "mainHand", label: "Main hand", takes: "mainHand" },
    { id: "offHand", label: "Off hand", takes: "offHand" },
]);

/** The slots' ids, in order. */
export const SLOT_IDS = Object.freeze(GEAR_SLOTS.map(({ id }) => id));

/** The peoples whose soldiers wear a uniform of their own. */
export const UNIFORM_PEOPLES = Object.freeze(["human", "elf", "darkElf", "cat", "lizard", "orc"]);

/**
 * Every piece of gear: its name, the slot it goes in, what a common one costs (gold) and does:
 * `armor` (the share of each blow it takes off), and any bonus of its own (`bonus`: as the rolled
 * ones: a belt's stamina); a weapon's hands (1 or 2); what a shield or a quiver goes with; a
 * uniform's piece (`uniform`: made by a people, `people` on each one); jewellery (`jewel`: only
 * bonuses, always at least one).
 */
export const GEAR = Object.freeze({
    // Weapons (core/weapons.js WEAPONS: how they fight)
    sword: { label: "Sword", slot: "mainHand", hands: 1, price: 30 },
    wand: { label: "Wand", slot: "mainHand", hands: 1, price: 40, magic: true },
    staff: { label: "Staff", slot: "mainHand", hands: 2, price: 20 },
    hammer: { label: "War hammer", slot: "mainHand", hands: 2, price: 35 },
    bow: { label: "Bow", slot: "mainHand", hands: 2, price: 35, quiver: true },
    gauntlets: { label: "Spiked gauntlets", slot: "mainHand", hands: 2, price: 25 },
    grimoire: { label: "Grimoire", slot: "mainHand", hands: 2, price: 45, magic: true },
    // The other hand: shields, with a one-handed weapon; a quiver, with a bow
    roundShield: { label: "Round shield", slot: "offHand", armor: 0.06, price: 20 },
    kiteShield: { label: "Kite shield", slot: "offHand", armor: 0.1, price: 45 },
    shield: { label: "Shield", slot: "offHand", armor: 0.08, price: 40, uniform: true },
    quiver: { label: "Quiver", slot: "offHand", bonus: { ranged: 0.05 }, price: 15, withBow: true },
    // The head
    cap: { label: "Leather cap", slot: "head", armor: 0.02, price: 8 },
    nasalHelm: { label: "Nasal helm", slot: "head", armor: 0.04, price: 30 },
    wizardHat: { label: "Wizard's hat", slot: "head", bonus: { spell: 0.05 }, price: 30 },
    helm: { label: "Helm", slot: "head", armor: 0.05, price: 40, uniform: true },
    // The body
    jerkin: { label: "Leather jerkin", slot: "chest", armor: 0.05, price: 15 },
    gambeson: { label: "Gambeson", slot: "chest", armor: 0.08, price: 25 },
    mail: { label: "Mail shirt", slot: "chest", armor: 0.14, price: 80 },
    plate: { label: "Plate armour", slot: "chest", armor: 0.2, price: 180 },
    hauberk: { label: "Hauberk", slot: "chest", armor: 0.16, price: 120, uniform: true },
    // The forearms and hands
    bracers: { label: "Leather bracers", slot: "bracers", armor: 0.015, price: 10 },
    vambraces: { label: "Vambraces", slot: "bracers", armor: 0.03, price: 30, uniform: true },
    gloves: { label: "Gloves", slot: "gloves", armor: 0.01, price: 6 },
    platedGloves: { label: "Plated gloves", slot: "gloves", armor: 0.025, price: 25 },
    warGloves: { label: "Gauntlets", slot: "gloves", armor: 0.025, price: 25, uniform: true },
    // The waist
    belt: { label: "Belt", slot: "belt", armor: 0.005, bonus: { stamina: 5 }, price: 5 },
    girdle: { label: "War belt", slot: "belt", armor: 0.01, bonus: { stamina: 5 }, price: 20, uniform: true },
    // The legs and feet
    trousers: { label: "Trousers", slot: "legs", armor: 0.005, price: 5 },
    breeches: { label: "Leather breeches", slot: "legs", armor: 0.02, price: 12 },
    greaves: { label: "Greaves", slot: "legs", armor: 0.04, price: 40 },
    legguards: { label: "Leg guards", slot: "legs", armor: 0.04, price: 40, uniform: true },
    leatherBoots: { label: "Leather boots", slot: "boots", armor: 0.015, price: 10 },
    sabatons: { label: "Plate boots", slot: "boots", armor: 0.03, price: 35 },
    warBoots: { label: "War boots", slot: "boots", armor: 0.03, price: 30, uniform: true },
    // (Spiked boots kick: core/weapons.js; worn with no weapon, they're all a player fights with)
    boots: { label: "Spiked boots", slot: "boots", armor: 0.02, price: 25, kicks: true },
    // The back
    travelCloak: { label: "Travelling cloak", slot: "cloak", armor: 0.005, bonus: { stamina: 5 }, price: 12 },
    cloak: { label: "Cloak", slot: "cloak", armor: 0.01, bonus: { stamina: 5 }, price: 25, uniform: true },
    // Jewellery
    amulet: { label: "Amulet", slot: "amulet", price: 60, jewel: true },
    ring: { label: "Ring", slot: "ring", price: 40, jewel: true },
});

/** The pieces of each people's uniform (GEAR ids), as their soldiers wear them. */
export const UNIFORM = Object.freeze(Object.keys(GEAR).filter((id) => GEAR[id].uniform));

/** What each bonus is called, and how it's shown (`share`: a percentage). */
export const STATS = Object.freeze({
    armor: { label: "Armour", share: true },
    hp: { label: "Hit points" },
    stamina: { label: "Stamina" },
    melee: { label: "Melee damage", share: true },
    ranged: { label: "Ranged damage", share: true },
    spell: { label: "Spell power", share: true },
    heal: { label: "Healing", share: true },
    stun: { label: "Stun length", share: true },
    haggle: { label: "Haggling", share: true },
    persuade: { label: "Persuasion", share: true },
});

// Which pieces can have which bonuses (by slot, or a weapon by how it fights)
const MELEE_WEAPONS = ["sword", "staff", "hammer", "gauntlets"];
const MAGIC_WEAPONS = ["wand", "grimoire", "staff"];
const ARMOUR_SLOTS = ["head", "chest", "bracers", "gloves", "belt", "legs", "boots", "cloak", "offHand"];
const JEWELS = ["amulet", "ring"];

/**
 * The bonuses that can be rolled on a piece: each a word before its name (`prefix`: "Keen") or
 * after it ("of the Bear"), what it adds to (STATS), how much ([least, most] on a fine piece: more
 * on better ones), and what it can be on (slots, or weapons by id).
 */
export const AFFIXES = Object.freeze({
    sturdy: { prefix: "Sturdy", stat: "armor", range: [0.01, 0.025], on: [...ARMOUR_SLOTS, "amulet"] },
    keen: { prefix: "Keen", stat: "melee", range: [0.04, 0.1], on: [...MELEE_WEAPONS, "gloves", "bracers", ...JEWELS] },
    trueShot: { prefix: "True", stat: "ranged", range: [0.04, 0.1], on: ["bow", "quiver", "gloves", "bracers", ...JEWELS] },
    arcane: { prefix: "Arcane", stat: "spell", range: [0.04, 0.1], on: [...MAGIC_WEAPONS, "head", "cloak", ...JEWELS] },
    tireless: { prefix: "Tireless", stat: "stamina", range: [5, 15], on: ["mainHand", "boots", "legs", "belt", "cloak", ...JEWELS] },
    bear: { suffix: "of the Bear", stat: "hp", range: [5, 15], on: ["mainHand", "chest", "head", "belt", "legs", "offHand", ...JEWELS] },
    mending: { suffix: "of Mending", stat: "heal", range: [0.05, 0.15], on: ["staff", "wand", "head", "cloak", ...JEWELS] },
    binding: { suffix: "of Binding", stat: "stun", range: [0.08, 0.2], on: [...MAGIC_WEAPONS, "gloves", ...JEWELS] },
    fox: { suffix: "of the Fox", stat: "haggle", range: [0.02, 0.06], on: ["gloves", "belt", ...JEWELS] },
    eloquence: { suffix: "of Eloquence", stat: "persuade", range: [0.05, 0.12], on: ["head", "cloak", ...JEWELS] },
});

/** How many bonuses a piece of each make has rolled on it, and how much stronger each is. */
export const ROLLS = Object.freeze({
    common: { count: 0, strength: 1 },
    fine: { count: 1, strength: 1 },
    masterwork: { count: 2, strength: 1.25 },
    legendary: { count: 3, strength: 1.5 },
});

// A legendary piece's name of its own: a first half, and a second by what it is
const LEGEND = Object.freeze({
    first: ["Dawn", "Grim", "Storm", "Ember", "Frost", "Oath", "Night", "Sun", "Iron", "Blood", "Star", "Thorn", "Wyrm", "Ash", "Gold", "Raven"],
    weapon: ["fang", "bane", "brand", "song", "reaver", "keeper", "fall"],
    armour: ["ward", "guard", "mantle", "hide", "shell", "aegis", "wall"],
    jewel: ["heart", "eye", "tear", "band", "sigil", "star", "spark"],
});

/**
 * Each people's set (its uniform's pieces worn together): its name, and what it brings with
 * this many of them on (3 and 6).
 */
export const SETS = Object.freeze({
    human: { name: "Kingdom's Guard", bonus: { 3: { armor: 0.03 }, 6: { hp: 20, melee: 0.05 } } },
    elf: { name: "Court Wardens", bonus: { 3: { ranged: 0.08 }, 6: { stamina: 20, heal: 0.1 } } },
    darkElf: { name: "Dominion's Shadow", bonus: { 3: { stun: 0.15 }, 6: { spell: 0.1, melee: 0.05 } } },
    cat: { name: "Pride of the Sun", bonus: { 3: { stamina: 15 }, 6: { melee: 0.1, haggle: 0.05 } } },
    lizard: { name: "Covenant Scales", bonus: { 3: { hp: 15 }, 6: { heal: 0.15, armor: 0.03 } } },
    orc: { name: "Horde Ironhide", bonus: { 3: { melee: 0.08 }, 6: { hp: 25, stun: 0.1 } } },
});

/** The pieces that together pass for one of a people's soldiers (all of theirs). */
export const DISGUISE = Object.freeze(["head", "chest", "cloak"]);

/** A weapon's hands (1 or 2; none, 0). */
export const handsOf = (id) => GEAR[id]?.hands ?? 0;

/**
 * Whether a piece can go in the other hand with a weapon (GEAR ids; none: bare-handed, or
 * kicking in spiked boots): null, or why not ("twoHanded": the weapon takes both hands; "quiver":
 * a quiver goes only with a bow; "bow": a bow's other hand takes only a quiver).
 */
export function offHandFits(weapon, piece) {
    const def = GEAR[piece];

    if (!weapon) {
        return def?.withBow ? "quiver" : null;
    }

    if (GEAR[weapon]?.quiver) {
        return def?.withBow ? null : "bow";
    }

    if (def?.withBow) {
        return "quiver";
    }

    return handsOf(weapon) >= 2 ? "twoHanded" : null;
}

/** Whether a weapon leaves the other hand free for anything (false: it's greyed out, or a quiver's only). */
export const offHandFree = (weapon) => !weapon || handsOf(weapon) < 2;

// A seeded pick from a list (random.js random)
const pick = (random, list) => list[Math.floor(random.next() * list.length) % list.length];

/** The bonuses a piece of gear (a GEAR id) can have rolled on it (AFFIXES keys). */
export function affixesFor(id) {
    const { slot } = GEAR[id] ?? {};

    return Object.keys(AFFIXES).filter((key) => AFFIXES[key].on.includes(id) || AFFIXES[key].on.includes(slot));
}

// A bonus's value, rounded as it's shown (a whole percent, or a whole number)
const rounded = (stat, value) => (STATS[stat].share ? Math.round(value * 100) / 100 : Math.round(value));

/**
 * A piece of gear as it's made (random.js random): { id, quality, people (a uniform's), bonuses
 * ({ stat: value }), affixes (AFFIXES keys, for its name), name (a legendary one's own) }. As many
 * bonuses as its make has (ROLLS; jewellery at least one), each different, stronger the better
 * made; a masterwork one's a word before its name and one after.
 */
export function rollGear(id, quality = "common", random, { people = null } = {}) {
    const def = GEAR[id];
    const item = { id, quality };

    if (!def) {
        return item;
    }

    if (def.uniform) {
        item.people = UNIFORM_PEOPLES.includes(people) ? people : "human";
    }

    const { count: made, strength } = ROLLS[quality] ?? ROLLS.common;
    const count = Math.max(made, def.jewel ? 1 : 0);
    const choices = affixesFor(id);
    const chosen = [];

    // (Each adding to something different; a masterwork's two a word before its name and one
    // after, if it can have both)
    for (let k = 0; k < count; k++) {
        const open = choices.filter((key) => !chosen.some((other) => AFFIXES[other].stat === AFFIXES[key].stat));
        const side = count === 2 ? open.filter((key) => Boolean(AFFIXES[key][k ? "suffix" : "prefix"])) : open;
        const from = side.length ? side : open;

        if (!from.length) {
            break;
        }

        chosen.push(pick(random, from));
    }

    if (chosen.length) {
        item.affixes = chosen;
        item.bonuses = Object.fromEntries(chosen.map((key) => {
            const { stat, range: [least, most] } = AFFIXES[key];

            return [stat, rounded(stat, (least + random.next() * (most - least)) * strength)];
        }));
    }

    if (quality === "legendary") {
        const kind = def.slot === "mainHand" ? "weapon" : def.jewel ? "jewel" : "armour";

        item.name = `${pick(random, LEGEND.first)}${pick(random, LEGEND[kind])}`;
    }

    return item;
}

/**
 * A piece's name: a legendary one's own ("Stormward"), or its make's words round what it is: a
 * word before it, its people's ("Orcish helm"), and one after ("Keen orcish helm of the Bear").
 */
export function gearName({ id, people = null, affixes = [], name = null }) {
    const def = GEAR[id];

    if (!def) {
        return id;
    }

    if (name) {
        return name;
    }

    const prefix = affixes.map((key) => AFFIXES[key]?.prefix).find(Boolean);
    const suffix = affixes.map((key) => AFFIXES[key]?.suffix).find(Boolean);
    const own = people && def.uniform ? `${ADJECTIVES[people] ?? people} ${def.label.toLowerCase()}` : def.label;
    const words = [prefix, prefix ? own.toLowerCase() : own, suffix].filter(Boolean).join(" ");

    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What a piece does (as well made as it is: `power`, progress.js QUALITIES): { stat: value },
 * its armour, its own bonus, and those rolled on it.
 */
export function statsOf({ id, bonuses = null }, power = 1) {
    const def = GEAR[id] ?? {};
    const stats = {};
    const add = (stat, value) => {
        stats[stat] = (stats[stat] ?? 0) + value;
    };

    if (def.armor) {
        add("armor", def.armor * power);
    }

    for (const [stat, value] of Object.entries(def.bonus ?? {})) {
        add(stat, value * power);
    }

    for (const [stat, value] of Object.entries(bonuses ?? {})) {
        if (STATS[stat]) {
            add(stat, value);
        }
    }

    return stats;
}

/** How many of each people's uniform pieces are worn (a gear: slot to piece): { people: count }. */
export function setCounts(gear) {
    const counts = {};

    for (const piece of Object.values(gear)) {
        if (piece && GEAR[piece.id]?.uniform && piece.people) {
            counts[piece.people] = (counts[piece.people] ?? 0) + 1;
        }
    }

    return counts;
}

/** What the sets worn bring together: { stat: value }. */
export function setBonuses(gear) {
    const totals = {};

    for (const [people, count] of Object.entries(setCounts(gear))) {
        for (const [needed, bonus] of Object.entries(SETS[people]?.bonus ?? {})) {
            if (count >= Number(needed)) {
                for (const [stat, value] of Object.entries(bonus)) {
                    totals[stat] = (totals[stat] ?? 0) + value;
                }
            }
        }
    }

    return totals;
}

/** The people a player passes for (their uniform's helm, chest and cloak, all a people's), or null. */
export function disguiseOf(gear) {
    const peoples = DISGUISE.map((slot) => (GEAR[gear[slot]?.id]?.uniform ? gear[slot].people : null));

    return peoples[0] && peoples.every((people) => people === peoples[0]) ? peoples[0] : null;
}

/** Whether two pieces are alike (the same, made alike, with the same bonuses): they stack. */
export function sameGear(a, b) {
    const bonuses = (item) => JSON.stringify(Object.entries(item.bonuses ?? {}).sort());

    return (a.people ?? null) === (b.people ?? null) && (a.name ?? null) === (b.name ?? null) && bonuses(a) === bonuses(b) && JSON.stringify(a.affixes ?? []) === JSON.stringify(b.affixes ?? []);
}
