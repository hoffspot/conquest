// Crafting as the pack shows it at a crafter's (docs/CRAFTING.md *The five stages*, 5: app/pack.js
// draws it, app/game.js gives it what the player carries and how mighty they are): everything a
// crafter makes, by piece, each piece's main materials, and what the pack's short of for each
// (greyed, never hidden: the owner's choice); a piece's three slots, each one's choices from what's
// carried (never the stash's), and what goes in them first; the piece shown before it's made (its
// make, its name, each power and the range it'll come out in, a legendary weapon's effect, the fee
// and what its ingredients are worth); an ingredient's card (what it is, its make, what it's for,
// where it comes from); and what gear broken down gives back, in words.
//
// Pure, no DOM: the crafters' rules are core/crafting.js's, the very ones the host makes things by
// (core/host.js #craft), so what's shown is what's made.

import { CREATURES } from "../core/creatures.js";
import { ingredientsOf, MAKE_ABOVE, powerOf, recipesAt, salvageOf, salvagesAt, sourcesOf, usesOf } from "../core/crafting.js";
import { blockMost, GEAR, levelFactor, levelOf, statsOf } from "../core/gear.js";
import { INGREDIENTS, NEW_BEASTS } from "../core/materials.js";
import { ITEMS, itemLabel, priceOf, QUALITIES } from "../core/progress.js";
import { RECIPES } from "../core/recipes.js";
import { listed, whereNew, whereOf } from "./bestiary.js";
import { blowsOf, boostsWorded, effectWords, kindOf, MAKES, rangeWorded, worded } from "./gearinfo.js";

/** Each kind of ingredient (core/materials.js INGREDIENT_KINDS), in words: its name, and one of it. */
export const KIND_WORDS = Object.freeze({
    metal: Object.freeze({ label: "Metal", one: "a metal" }),
    wood: Object.freeze({ label: "Wood", one: "a wood" }),
    cloth: Object.freeze({ label: "Cloth", one: "a cloth" }),
    leather: Object.freeze({ label: "Leather", one: "a leather" }),
    gem: Object.freeze({ label: "Gem", one: "a gem" }),
    essence: Object.freeze({ label: "Essence", one: "an essence" }),
});

/** The crafters (core/recipes.js CRAFTERS), in words, as an ingredient's card says who sells it. */
export const CRAFTER_WORDS = Object.freeze({
    smith: "blacksmiths",
    swordsmith: "swordsmiths",
    armorer: "armorers",
    scriptorium: "occult scriptoria",
    bowyer: "bowyers",
    leatherworker: "leatherworkers",
    tailor: "tailors",
    jeweller: "jewellers",
    masterSwordsmith: "the Master Swordsmiths",
    masterArmorer: "the Master Armorers",
    emporium: "the Mystic Emporiums",
});

/**
 * Where a piece goes, as a crafter's list groups its pieces (core/gear.js GEAR `slot`), each under
 * its heading, in this order.
 */
export const CRAFT_GROUPS = Object.freeze([
    Object.freeze({ heading: "Weapons", slots: Object.freeze(["mainHand"]) }),
    Object.freeze({ heading: "The other hand", slots: Object.freeze(["offHand"]) }),
    Object.freeze({ heading: "Head", slots: Object.freeze(["head"]) }),
    Object.freeze({ heading: "Body", slots: Object.freeze(["chest"]) }),
    Object.freeze({ heading: "Forearms and hands", slots: Object.freeze(["bracers", "gloves"]) }),
    Object.freeze({ heading: "Waist", slots: Object.freeze(["belt"]) }),
    Object.freeze({ heading: "Legs and feet", slots: Object.freeze(["legs", "boots"]) }),
    Object.freeze({ heading: "Back", slots: Object.freeze(["cloak"]) }),
    Object.freeze({ heading: "Jewellery", slots: Object.freeze(["amulet", "ring"]) }),
]);

// The makes, the commonest first, and where one comes among them
const ORDER = Object.freeze(Object.keys(QUALITIES));
const rank = (make) => ORDER.indexOf(make);

// How much of each thing a pack (its places: stacks or null) holds, of any make, marked as junk
// or not, as crafting.js heldIn counts it: Map(id → count)
function heldOf(pack) {
    const held = new Map();

    for (const stack of pack) {
        if (stack) {
            held.set(stack.id, (held.get(stack.id) ?? 0) + stack.count);
        }
    }

    return held;
}

/** Some of a thing, in words: "an iron ingot", "3 iron ingots". */
export function thingsSaid({ id, count = 1 }) {
    const name = itemLabel({ id }).toLowerCase();

    return count > 1 ? `${count} ${name.endsWith("s") ? name : `${name}s`}` : `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

// So many of a kind of ingredient, in words: "a metal", "2 of a metal"
const someOf = (kind, count) => (count === 1 ? KIND_WORDS[kind].one : `${count} of ${KIND_WORDS[kind].one}`);

/** What a piece (a RECIPES id) takes, in words: "A metal, a leather, and an essence if you like". */
export function takesWords(base) {
    const [first, second] = RECIPES[base].slots;
    const words = `${someOf(first.kind, first.count)}, ${someOf(second.kind, second.count)}, and an essence if you like`;

    return `${words[0].toUpperCase()}${words.slice(1)}`;
}

// What a pack (`held`: heldOf) is short of to make a piece (RECIPES id) of a main material:
// [{ id (the main material, too few of it) or kind (no second of that kind, enough of it), need,
// have, text }], none if it holds what it takes (the essence, never: it can be left out)
function lackingFor(held, base, main) {
    const [first, second] = RECIPES[base].slots;
    const have = held.get(main) ?? 0;
    const lacking = [];

    if (have < first.count) {
        lacking.push({ id: main, need: first.count, have, text: `${itemLabel({ id: main })} (${have} of ${first.count})` });
    }

    if (!ingredientsOf(second.kind).some((id) => (held.get(id) ?? 0) >= second.count)) {
        lacking.push({ kind: second.kind, need: second.count, have: 0, text: someOf(second.kind, second.count) });
    }

    return lacking;
}

/**
 * Everything a crafter (core/recipes.js CRAFTERS id; in a capital, `capital`, working to the
 * legendary) makes, as its list shows it (core/crafting.js recipesAt): its pieces under headings
 * by where they go (CRAFT_GROUPS), each piece's main materials, the commoner first, each with what
 * a pack (its places: never the stash's) is short of to make it (`lacking`: greyed, not hidden).
 * [{ heading, pieces: [{ base, label, noun, takes, mains: [{ main, make, label, word, lacking,
 * can }] }] }]
 */
export function craftList(shop, pack, { capital = false } = {}) {
    const held = heldOf(pack);
    const pieces = new Map();

    for (const { base, main, make } of recipesAt(shop, { capital })) {
        if (!pieces.has(base)) {
            pieces.set(base, { base, label: itemLabel({ id: base }), noun: RECIPES[base].noun, takes: takesWords(base), mains: [] });
        }

        const lacking = lackingFor(held, base, main);

        pieces.get(base).mains.push({ main, make, label: itemLabel({ id: main }), word: INGREDIENTS[main].word, lacking, can: lacking.length === 0 });
    }

    return CRAFT_GROUPS.map(({ heading, slots }) => ({ heading, pieces: [...pieces.values()].filter(({ base }) => slots.includes(GEAR[base].slot)) })).filter(({ pieces: some }) => some.length);
}

/**
 * What goes in a piece's slots first, of a main material (`main`), from what a pack carries:
 * the main material; the commonest second carried, enough of it, that leaves the piece as well made
 * as its main material can make it (MAKE_ABOVE), or else the finest carried, or none; and no
 * essence. [main, second, null], as the craft command takes them.
 */
export function usingFirst(pack, base, main) {
    const held = heldOf(pack);
    const second = RECIPES[base].slots[1];
    const enough = ingredientsOf(second.kind).filter((id) => (held.get(id) ?? 0) >= second.count);
    const reach = rank(INGREDIENTS[main].make) - MAKE_ABOVE;

    return [main, enough.find((id) => rank(INGREDIENTS[id].make) >= reach) ?? enough.at(-1) ?? null, null];
}

/**
 * A piece's slots (a RECIPES id's: its main material, its second, its essence), filled with
 * `using` so far, each with the choices a pack (never the stash) gives it: [{ slot, kind, count,
 * optional, heading, takes, chosen, choices: [{ id, label, make, have, need, enough, worked }] }],
 * each slot's choices what's carried of its kind, the commonest first, and what's chosen for it if
 * it isn't carried. A main material finer than the crafter works (`worked`: false) is a master's.
 */
export function slotsOf(pack, shop, base, using, { capital = false } = {}) {
    const held = heldOf(pack);
    const worked = new Set(recipesAt(shop, { capital }).filter((each) => each.base === base).map(({ main }) => main));

    return RECIPES[base].slots.map(({ kind, count, optional = false }, slot) => {
        const chosen = using[slot] ?? null;
        const ids = ingredientsOf(kind).filter((id) => (held.get(id) ?? 0) > 0 || id === chosen);

        return {
            slot,
            kind,
            count,
            optional,
            heading: slot === 0 ? "Main material" : optional ? "Essence" : "Second",
            takes: optional ? "An essence, if you like: it adds a power and names the piece, but never makes it worse" : `${someOf(kind, count)[0].toUpperCase()}${someOf(kind, count).slice(1)}${slot === 0 ? ": it sets how well made the piece is" : ": the piece is never more than a make finer than it"}`,
            chosen,
            choices: ids.map((id) => {
                const have = held.get(id) ?? 0;

                return { id, label: itemLabel({ id }), make: INGREDIENTS[id].make, have, need: count, enough: have >= count, worked: slot > 0 || worked.has(id) };
            }),
        };
    });
}

/**
 * A piece as it would be made (core/crafting.js previewOf's `shown`: make, name, level, powers,
 * effect), described for its card as gear is (app/gearinfo.js describe): { label (its name), rarity
 * (its make), kind, lines: [{ text, tone }] }: its level, its blows (a weapon's), a legendary
 * weapon's effect, a wand's spell power and a shield's block (each rolled as it's made), its own
 * armour and bonus, and each power its ingredients bring, the range it'll come out in, and which of
 * them brings it.
 */
export function previewInfo(shown, base) {
    const { make, level, name, powers, effect } = shown;
    const def = GEAR[base];
    const power = QUALITIES[make]?.power ?? 1;
    const lines = [{ text: `Level ${level}, your might's`, tone: "note" }];

    if (def.slot === "mainHand") {
        lines.push(...blowsOf(base, power * levelFactor(level)).map((text) => ({ text, tone: "base" })));
    }

    if (effect) {
        lines.push({ text: effectWords(effect, level, def.slot === "mainHand" ? base : null), tone: "effect" });
    }

    if (def.magic) {
        lines.push({ text: boostsWorded("made"), tone: "base" });
    }

    // (A shield: how much of a blow caught on it, rolled as a bought one's is, gear.js rollBlock)
    if (def.robust) {
        const most = blockMost(base, make);
        const least = 0.5 + (0.25 * (levelOf(level) - 1)) / 99;

        lines.push({ text: `Blocks ${Math.round(most * least * 100)}–${Math.round(most * 100)}% of a blow caught on it, rolled as it's made`, tone: "base" });

        if (def.spells) {
            lines.push({ text: "Catches spells as well as blows", tone: "base" });
        }
    }

    for (const [stat, value] of Object.entries(statsOf({ id: base, level }, power))) {
        lines.push({ text: stat === "armor" ? `Armour: takes ${Math.round(value * 100)}% off each blow` : worded(stat, value), tone: "base" });
    }

    for (const { stat, range, from } of powers) {
        lines.push({ text: `${rangeWorded(stat, range, { full: true })} (${listed(from.map((id) => itemLabel({ id })))})`, tone: "bonus" });
    }

    return { label: name, rarity: make, kind: kindOf(base), lines, rolls: null, compare: [], price: null };
}

// The pieces an ingredient's power is shown on, on its card: a weapon's, a wand's and what's worn
// (core/materials.js FAMILIES `arms`, `magic`, `worn`)
const READ_AS = Object.freeze([
    ["sword", "In a weapon"],
    ["wand", "In a wand or grimoire"],
    ["helm", "Worn"],
]);

// Some pieces' names, in words: the first few, and how many more
const someNames = (bases, most = 6) => listed([...bases.slice(0, most).map((base) => itemLabel({ id: base }).toLowerCase()), ...(bases.length > most ? [`${bases.length - most} more`] : [])]);

// How many creatures not yet in the bestiary an ingredient's card says where they're met
const UNKNOWN_SAID = 3;

/**
 * Where an ingredient comes from, in words, as its card says it (core/crafting.js sourcesOf): the
 * crafters that sell it; the creatures that leave it, by name once they're in the player's bestiary
 * (`known(kind)`), and till then where they're met, "something in the mountains", as Monster
 * Hunter's ??? is; and that gear broken down at a crafter's gives it back. [{ text, tone }]
 */
export function sourcesWords(id, { known = () => false } = {}) {
    const { sold, dropped, planned, salvage } = sourcesOf(id);
    const lines = [];

    if (sold.length) {
        lines.push({ text: `Sold by ${listed(sold.map((shop) => CRAFTER_WORDS[shop] ?? shop))}.`, tone: "set" });
    }

    const creatures = [...new Set([...dropped, ...planned])];
    const named = creatures.filter((kind) => CREATURES[kind] && known(kind)).map((kind) => CREATURES[kind].name);
    const unknown = [...new Set(creatures.filter((kind) => !(CREATURES[kind] && known(kind))).map((kind) => (CREATURES[kind] ? whereOf(kind) : whereNew(NEW_BEASTS[kind]))))];

    if (named.length) {
        lines.push({ text: `Left by ${listed(named)}.`, tone: "set" });
    }

    // (Each that's not yet in the bestiary, where it's met: a line of its own, the first few)
    for (const where of unknown.slice(0, UNKNOWN_SAID)) {
        lines.push({ text: `Left by something ${where}.`, tone: "set" });
    }

    if (unknown.length > UNKNOWN_SAID) {
        lines.push({ text: "And by more you've yet to meet.", tone: "set" });
    }

    if (salvage) {
        lines.push({ text: "Given back by gear broken down at a crafter's.", tone: "set" });
    }

    return lines.length ? lines : [{ text: "Not to be had anywhere yet.", tone: "note" }];
}

/**
 * An ingredient's card (core/materials.js INGREDIENTS), as gearinfo.js describe gives gear's: {
 * label, rarity (its make: progress.js gradeOf), made (its make in words, "Very rare"; none, a
 * common one), kind, lines: [{ text, tone }], price }: what it is
 * (`about`); its power in a weapon, a wand or grimoire, and worn (core/crafting.js powerOf), as
 * strong as it comes on a piece of the player's level (`level`: their might's); what it goes into
 * (usesOf: its kind's slots); where it comes from (sourcesWords: `known`, the kinds of creature in
 * the player's bestiary); what the guild pays for a creature's part; what it sells for (`haggle`).
 */
export function ingredientInfo(id, { known = () => false, level = 1, haggle = 0 } = {}) {
    const { kind, make, about } = INGREDIENTS[id];
    const at = levelOf(level);
    const lines = [{ text: about, tone: "note" }];

    for (const [base, place] of READ_AS) {
        const { stat, range } = powerOf(id, base, at);

        lines.push({ text: `${place}: ${rangeWorded(stat, range)}`, tone: "bonus" });
    }

    lines.push({ text: `Each at level ${at}, as you'd make it: rolled within that as it's made, the finer the ingredient, the stronger.`, tone: "note" });

    const uses = usesOf(id);

    if (kind === "essence") {
        lines.push({ text: "Goes into anything made, as its essence, if you like: it names the piece, and never makes it worse.", tone: "base" });
    } else {
        const mains = uses.filter(({ slot }) => slot === 0).map(({ base }) => base);
        const seconds = uses.filter(({ slot }) => slot === 1).map(({ base }) => base);

        if (mains.length) {
            lines.push({ text: `The main material of ${someNames(mains)}: it sets how well made the piece is.`, tone: "base" });
        }

        if (seconds.length) {
            lines.push({ text: `The second of ${someNames(seconds)}.`, tone: "base" });
        }
    }

    lines.push(...sourcesWords(id, { known }));

    if (ITEMS[id]?.part) {
        lines.push({ text: `The adventurers' guild pays ${ITEMS[id].price} gold for it.`, tone: "note" });
    }

    return { label: itemLabel({ id }), rarity: make, made: make === "common" ? null : MAKES[make], kind: `Ingredient: ${KIND_WORDS[kind].one}`, lines, rolls: null, compare: [], price: priceOf({ id }, { haggle, selling: true }) };
}

/**
 * What a stack of gear broken down at a crafter (CRAFTERS id; in a capital, `capital`) gives back,
 * so many of it (`count`: the whole stack, unless said), or null if that crafter won't break it down
 * (core/crafting.js salvagesAt: what it makes, no finer than it works, never what's bound): {
 * yields: [{ id, count }], words ("an iron ingot", "2 steel ingots") }.
 */
export function salvageInfo(stack, shop, { capital = false, count = stack?.count ?? 1 } = {}) {
    if (!salvagesAt(shop, stack, { capital })) {
        return null;
    }

    const yields = salvageOf(stack).map((each) => ({ id: each.id, count: each.count * count }));

    return { yields, words: yieldsSaid(yields) };
}

/** What comes back of gear broken down ([{ id, count }]), in words: "an iron ingot and 2 steel ingots". */
export const yieldsSaid = (yields) => listed(yields.map(thingsSaid));
