// The crafters' rules (docs/CRAFTING.md): what a crafter makes, and of what (recipes.js); what a
// piece made of these ingredients would be (its make, its name, each power and how strong it can
// come out, the fee), before it's made; whether a pack holds what it takes; the piece made, its
// powers rolled; and what gear broken down gives back, one piece or all that's marked as junk.
//
// A piece is as well made as its main material (the first of its recipe's slots), but never more
// than a make above the poorest of what goes with it (MAKE_ABOVE: the essence, a creature's part
// the player may leave out, never lowers it). Every ingredient brings its family's power, as the
// piece reads it (materials.js FAMILIES: a weapon's, a wand's, or what's worn), as strong as its
// own make and the piece's level have it (RANGES, MAKE_STRENGTH, gear.js levelFactor), rolled
// within that as a found piece's bonuses are. Its level is its maker's might's, as what's bought
// is (host.js #buy). A legendary weapon lets loose the effect of its essence's family (or, with
// none, its main material's), not one by chance.
//
// Pure data and arithmetic, no DOM, no clock, no Math.random: the host makes what's crafted with
// the world's dice (random.js random), the same in every game (core/host.js, stage 2), and the
// pack shows it first by the same arithmetic.

import { DESIGNS, GEAR, levelFactor, levelOf, rollBlock, STATS, UNIFORM_PEOPLES } from "./gear.js";
import { FAMILIES, INGREDIENTS, MAKE_STRENGTH, MORE_SPOILS, NEW_BEASTS, ON_BLOW, RANGES } from "./materials.js";
import { bound, isJunk, ITEMS, QUALITIES, rollBoost } from "./progress.js";
import { CRAFT_FEE, CRAFTERS, RECIPES, SALVAGE } from "./recipes.js";
import { SPOILS } from "./spoils.js";

/**
 * What the host says, refusing to make something or to break it down (core/host.js REFUSALS, as of
 * stage 2: docs/CRAFTING.md *Multiplayer*): the reasons craftRefusal gives, and the host's own for
 * what the pack lacks, what's changed since the player was shown it, and what won't be broken
 * down. Each a reason never given before, for nothing else.
 */
export const CRAFT_REFUSALS = Object.freeze({
    uncrafted: "That isn't made here.",
    unfit: "That isn't what it's made of.",
    unworked: "That's finer work than is done here: a master's.",
    lacking: "You haven't all it takes.",
    craftChanged: "That's changed since you looked: look again.",
    unsalvaged: "That isn't broken down here.",
    salvageNone: "None of your junk is broken down here.",
    salvageChanged: "Your junk's changed since you looked: look again.",
});

// The makes, the commonest first, and where one comes among them
const ORDER = Object.freeze(Object.keys(QUALITIES));
const rank = (make) => ORDER.indexOf(make);

/** How many makes above the poorest of what goes with it (its recipe's slots but its first and the essence) a piece can come out. */
export const MAKE_ABOVE = 1;

// An ingredient by its id (materials.js INGREDIENTS), or null for anything else
const ingredient = (id) => (typeof id === "string" && Object.hasOwn(INGREDIENTS, id) ? INGREDIENTS[id] : null);

/** The ingredients of a kind (materials.js INGREDIENT_KINDS), the commonest first: ids. */
export const ingredientsOf = (kind) => ORDER.flatMap((make) => Object.keys(INGREDIENTS).filter((id) => INGREDIENTS[id].kind === kind && INGREDIENTS[id].make === make));

/**
 * How a piece reads its ingredients' powers (materials.js FAMILIES): "magic", a wand's or a
 * grimoire's; "arms", a weapon's that strikes, or a quiver's; "worn", anything else's.
 */
export const placeOf = (base) => (GEAR[base]?.magic ? "magic" : GEAR[base]?.slot === "mainHand" || GEAR[base]?.withBow ? "arms" : "worn");

// The pieces whose blows are shots, that read melee as ranged
const SHOOTS = Object.freeze(["bow", "quiver"]);

/** What an ingredient adds to on a piece (a recipe's: RECIPES id): a gear.js STATS key or one of materials.js ON_BLOW, or null. */
export function statOf(id, base) {
    const family = FAMILIES[ingredient(id)?.family];

    if (!family || !Object.hasOwn(RECIPES, base)) {
        return null;
    }

    const stat = family[placeOf(base)];

    return stat === "melee" && SHOOTS.includes(base) ? "ranged" : stat;
}

// Whether a power's a share (shown as a percentage): gear.js STATS says, and every blow is one
const isShare = (stat) => Boolean(ON_BLOW[stat] || STATS[stat]?.share);

// A power's value as it's kept and shown: a whole percent, or a whole number
const rounded = (stat, value) => (isShare(stat) ? Math.round(value * 100) / 100 : Math.round(value));

// How many times its range an ingredient's power is on a piece of a level
const timesOf = (id, level) => MAKE_STRENGTH[ingredient(id).make] * levelFactor(level);

/** An ingredient's power on a piece (RECIPES id) of a `level`: { stat, range: [least, most] }, as it's shown (rounded), or null. */
export function powerOf(id, base, level = 1) {
    const stat = statOf(id, base);

    if (!stat) {
        return null;
    }

    const [least, most] = RANGES[stat];
    const times = timesOf(id, level);

    return { stat, range: [rounded(stat, least * times), rounded(stat, most * times)] };
}

/**
 * Why a piece (RECIPES id) can't be made of these (`using`: an ingredient's id for each of its
 * slots, in order, null for the essence left out) at a shop (CRAFTERS id): "uncrafted", the shop
 * doesn't make it; "unfit", an ingredient left out that can't be, or not of its slot's kind;
 * "unworked", its main material's finer than the shop works (CRAFTERS `best`). Or null.
 */
export function craftRefusal(shop, base, using) {
    const crafter = Object.hasOwn(CRAFTERS, shop) ? CRAFTERS[shop] : null;
    const slots = Object.hasOwn(RECIPES, base) ? RECIPES[base].slots : null;

    if (!crafter || !slots || !crafter.makes.includes(base)) {
        return "uncrafted";
    }

    if (!Array.isArray(using) || using.length > slots.length || slots.some((slot, k) => ((using[k] ?? null) === null ? !slot.optional : ingredient(using[k])?.kind !== slot.kind))) {
        return "unfit";
    }

    return rank(ingredient(using[0]).make) > rank(crafter.best) ? "unworked" : null;
}

/**
 * The make a piece (RECIPES id) of these comes out (`using`, as craftRefusal has it: each fitting
 * its slot): its main material's, but no finer than MAKE_ABOVE above the poorest of the rest but
 * the essence.
 */
export function makeOf(base, using) {
    const { slots } = RECIPES[base];
    const others = slots.map((slot, k) => (k > 0 && !slot.optional ? rank(ingredient(using[k]).make) : Infinity));

    return ORDER[Math.min(rank(ingredient(using[0]).make), Math.min(...others) + MAKE_ABOVE)];
}

/** A piece's name, made of these: its main material's word, its essence's if it has one, and its recipe's noun ("Adamantite Demon Sword"). */
export function nameOf(base, using) {
    const { slots, noun } = RECIPES[base];
    const essence = slots.findIndex(({ kind }) => kind === "essence");

    return [ingredient(using[0])?.word, ingredient(using[essence])?.word, noun].filter(Boolean).join(" ");
}

/** The effect a legendary weapon made of these lets loose (core/legendary.js EFFECTS id): its essence's family's, or with none its main material's (materials.js FAMILIES `legend`). */
export function legendOf(base, using) {
    const essence = RECIPES[base].slots.findIndex(({ kind }) => kind === "essence");

    return FAMILIES[(ingredient(using[essence]) ?? ingredient(using[0])).family].legend;
}

/**
 * What a crafter asks for making a piece (RECIPES id) of a make, at a level (gear.js levelOf):
 * CRAFT_FEE of what a piece of that make and level would cost (progress.js QUALITIES price, as
 * escalating as that is), less the haggling, as what's bought is. Gold, at least 1.
 */
export function feeOf(base, make, level = 1, { haggle = 0 } = {}) {
    return Math.max(1, Math.round((GEAR[base]?.price ?? 0) * (QUALITIES[make]?.price ?? 1) * CRAFT_FEE * levelFactor(level) * (1 - haggle)));
}

/** What a piece of these takes: [{ id, count }], each ingredient once, its slot's count (the essence's left out, none). */
export function needs(base, using) {
    const counts = new Map();

    RECIPES[base].slots.forEach(({ count }, k) => {
        if (ingredient(using[k])) {
            counts.set(using[k], (counts.get(using[k]) ?? 0) + count);
        }
    });

    return [...counts].map(([id, count]) => ({ id, count }));
}

/** How much a pack (its places: stacks or null) holds of a thing, of any make, marked as junk or not. */
export const heldIn = (pack, id) => pack.reduce((sum, stack) => sum + (stack?.id === id ? stack.count : 0), 0);

/** What a pack's short of, to make a piece of these: [{ id, need, have }], none if it holds it all. */
export function lackingIn(pack, base, using) {
    return needs(base, using)
        .map(({ id, count }) => ({ id, need: count, have: heldIn(pack, id) }))
        .filter(({ need, have }) => have < need);
}

/** What the ingredients of a piece of these are worth (gold: progress.js ITEMS price, a creature's part what the guild pays for it). */
export const worthOf = (base, using) => needs(base, using).reduce((sum, { id, count }) => sum + (ITEMS[id]?.price ?? 0) * count, 0);

/**
 * The powers a piece (RECIPES id) of these has, of a `level`: [{ stat, range: [least, most], from
 * (ingredient ids) }], in its slots' order, two ingredients that add to the same thing together.
 */
export function powersOf(base, using, level = 1) {
    const powers = [];

    for (const id of using) {
        const power = ingredient(id) ? powerOf(id, base, level) : null;

        if (!power) {
            continue;
        }

        const same = powers.find(({ stat }) => stat === power.stat);

        if (same) {
            same.range = same.range.map((value, k) => rounded(power.stat, value + power.range[k]));
            same.from.push(id);
        } else {
            powers.push({ ...power, from: [id] });
        }
    }

    return powers;
}

/**
 * What a piece (RECIPES id) of these (`using`) would be, made at a shop (CRAFTERS id) for a maker of
 * a `level` (their might's: gear.js levelOf) and their haggling: { reason (craftRefusal's, and
 * nothing else then), make, name, level, powers (powersOf), effect (a legendary weapon's), fee
 * (feeOf), worth (what its ingredients are worth: worthOf), needs }. What the pack shows before
 * it's made, and what the host makes it by.
 */
export function previewOf(shop, base, using, { level = 1, haggle = 0 } = {}) {
    const reason = craftRefusal(shop, base, using);

    if (reason) {
        return { reason };
    }

    const make = makeOf(base, using);
    const at = levelOf(level);
    const def = GEAR[base];

    return {
        reason: null,
        make,
        name: nameOf(base, using),
        level: at,
        powers: powersOf(base, using, at),
        effect: make === "legendary" && def.slot === "mainHand" ? legendOf(base, using) : null,
        fee: feeOf(base, make, at, { haggle }),
        worth: worthOf(base, using),
        needs: needs(base, using),
    };
}

// A seeded pick from a list (random.js random), as gear.js picks
const pick = (random, list) => list[Math.floor(random.next() * list.length) % list.length];

/**
 * A piece made of these (`using`: fitting its recipe, craftRefusal's null), with the world's dice
 * (random.js random): of its make (makeOf) and `level` (its maker's might, as levelOf has it), each
 * ingredient's power rolled within its range (powerOf: as a found piece's bonuses are, gear.js
 * rollGear), named for what it's made of (nameOf); a shield's block and a wand's or a grimoire's
 * boost rolled as a bought one's are; a legendary weapon's effect its essence's (legendOf); a
 * uniform's piece and a design the crafter's `people`'s (gear.js DESIGNS), a mace one of its looks.
 * The same piece every time for the same dice.
 */
export function craftItem(base, using, random, { level = 1, people = null } = {}) {
    const def = GEAR[base];
    const make = makeOf(base, using);
    const at = levelOf(level);
    const item = { id: base, quality: make };

    if (at > 1) {
        item.level = at;
    }

    if (def.uniform) {
        item.people = UNIFORM_PEOPLES.includes(people) ? people : "human";
    }

    const bonuses = {};

    for (const id of using) {
        const stat = ingredient(id) ? statOf(id, base) : null;

        if (!stat) {
            continue;
        }

        const [least, most] = RANGES[stat];
        const value = rounded(stat, (least + random.next() * (most - least)) * timesOf(id, at));

        bonuses[stat] = rounded(stat, (bonuses[stat] ?? 0) + value);
    }

    item.bonuses = bonuses;

    if (def.robust) {
        item.boost = rollBlock(base, make, random, at);
    }

    if (def.magic) {
        item.boost = rollBoost(random, at);
    }

    if (make === "legendary" && def.slot === "mainHand") {
        item.effect = legendOf(base, using);
    }

    const looks = def.looks ? (DESIGNS[base] ? (Object.hasOwn(DESIGNS[base], people ?? "") ? DESIGNS[base][people] : null) : def.looks) : null;

    if (looks?.length) {
        item.look = pick(random, looks);
    }

    item.name = nameOf(base, using);

    return item;
}

/**
 * The recipes a crafter (CRAFTERS id) makes, as its list shows them: each piece in each main
 * material it works ([{ base, main (an ingredient id), make (the main material's) }]), its pieces
 * in their order, the commoner materials first.
 */
export function recipesAt(shop) {
    const crafter = Object.hasOwn(CRAFTERS, shop) ? CRAFTERS[shop] : null;

    if (!crafter) {
        return [];
    }

    return crafter.makes.flatMap((base) =>
        ingredientsOf(RECIPES[base].slots[0].kind)
            .filter((id) => rank(INGREDIENTS[id].make) <= rank(crafter.best))
            .map((id) => ({ base, main: id, make: INGREDIENTS[id].make })),
    );
}

/** What a piece of gear broken down gives back (recipes.js SALVAGE): [{ id, count }], by its main material's kind and its make; none for anything else. */
export function salvageOf(item) {
    const recipe = item && Object.hasOwn(RECIPES, item.id) ? RECIPES[item.id] : null;

    if (!recipe) {
        return [];
    }

    const [{ kind, count }] = recipe.slots;

    return [{ id: SALVAGE[kind][QUALITIES[item.quality] ? item.quality : "common"], count: Math.ceil(count / 2) }];
}

/** Whether a crafter (CRAFTERS id) breaks a thing down: gear it makes, no finer than it works, not bound to its hero (progress.js bound). */
export function salvagesAt(shop, item) {
    const crafter = Object.hasOwn(CRAFTERS, shop) ? CRAFTERS[shop] : null;

    return Boolean(crafter && item && crafter.makes.includes(item.id) && rank(QUALITIES[item.quality] ? item.quality : "common") <= rank(crafter.best) && !bound(item));
}

// Things given back, those alike together: [{ id, count }]
const together = (yields) => {
    const counts = new Map();

    for (const { id, count } of yields) {
        counts.set(id, (counts.get(id) ?? 0) + count);
    }

    return [...counts].map(([id, count]) => ({ id, count }));
};

/**
 * What breaking down all the junk carried at a crafter (CRAFTERS id) comes to, as progress.js
 * junkSale does for selling it: each stack of gear in the pack marked as junk that it breaks down
 * (salvagesAt), each piece giving back what salvageOf says; and the junk gear it won't, still
 * junk for one that will. Never the stash's. { salvaged: [{ index, stack, yields }], count (pieces
 * broken down), yields (all they give back, alike together), kept: [{ index, stack }], left
 * (pieces kept) }
 */
export function junkSalvage(pack, shop) {
    const salvaged = [];
    const kept = [];

    pack.forEach((stack, index) => {
        if (!isJunk(stack) || bound(stack) || !GEAR[stack.id]) {
            return;
        }

        if (salvagesAt(shop, stack)) {
            salvaged.push({ index, stack, yields: salvageOf(stack).map(({ id, count }) => ({ id, count: count * stack.count })) });
        } else {
            kept.push({ index, stack });
        }
    });

    const pieces = (list) => list.reduce((sum, { stack }) => sum + stack.count, 0);

    return { salvaged, count: pieces(salvaged), yields: together(salvaged.flatMap(({ yields }) => yields)), kept, left: pieces(kept) };
}

/**
 * Where an ingredient comes from: { sold (the crafters that sell it: CRAFTERS ids), dropped (the
 * creatures that leave it: spoils.js SPOILS), planned (those that will, stage 3's: materials.js
 * NEW_BEASTS and MORE_SPOILS), salvage (whether gear broken down gives it back: recipes.js
 * SALVAGE) }. What its card tells, with what it's used for (usesOf).
 */
export function sourcesOf(id) {
    const leaves = (items) => items.some((each) => each.id === id);

    return {
        sold: Object.keys(CRAFTERS).filter((shop) => CRAFTERS[shop].sells.includes(id)),
        dropped: Object.keys(SPOILS).filter((creature) => leaves(SPOILS[creature].items)),
        planned: [...Object.keys(NEW_BEASTS).filter((creature) => leaves(NEW_BEASTS[creature].items)), ...Object.keys(MORE_SPOILS).filter((creature) => leaves(MORE_SPOILS[creature]))],
        salvage: Object.values(SALVAGE).some((makes) => Object.values(makes).includes(id)),
    };
}

/**
 * What an ingredient's used for: each recipe with a slot of its kind ([{ base, slot (its index),
 * stat (statOf: what it adds to there) }]).
 */
export function usesOf(id) {
    const kind = ingredient(id)?.kind;

    return Object.keys(RECIPES).flatMap((base) => {
        const slot = RECIPES[base].slots.findIndex((each) => each.kind === kind);

        return slot < 0 ? [] : [{ base, slot, stat: statOf(id, base) }];
    });
}
