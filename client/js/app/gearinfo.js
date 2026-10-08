// What a thing is, for the pack (app/pack.js) to show when it's tapped: its name in the colour of
// how well made it is, what kind of thing it is (a two-handed weapon, the off hand, a ring), what
// it does (a weapon's blows, armour, its own bonus and those rolled on it, a draught's use), the
// set it's part of and how far that set's worn, and, for gear in the pack (or a shop's, or
// another's), what putting it on would change (better or worse), and what it's worth. A shop's
// ware has what's rolled on it as it's bought said as what it could be. Pure: from the player's
// progress (core/progress.js), no DOM.

import { AFFIXES, affixesFor, blockMost, disguiseOf, GEAR, GEAR_SLOTS, handsOf, offHandFits, ROLLS, setCounts, SETS, STATS, statsOf } from "../core/gear.js";
import { ADJECTIVES } from "../core/war/peoples.js";
import { BOOSTS, priceOf, QUALITIES } from "../core/progress.js";
import { WEAPONS } from "../core/weapons.js";

/** Each make's name as shown (a common one, none), rarest last. */
export const MAKES = Object.freeze({ common: "Common", fine: "Fine", masterwork: "Masterwork", legendary: "Legendary" });

// A bonus as shown: "+12% melee damage", "+5 hit points"; armour: "takes 4% off each blow"
function worded(stat, value) {
    const { label, share } = STATS[stat];
    const amount = share ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;

    return stat === "armor" ? `Armour: takes ${amount} more off each blow` : `${value < 0 ? "−" : "+"}${amount.replace("-", "")} ${label.toLowerCase()}`;
}

// A bonus that could be anywhere from `least` to `most`, as shown: "+5–13% melee damage"
function spanned(stat, least, most) {
    const { label, share } = STATS[stat];
    const [from, to] = share ? [Math.round(least * 100), Math.round(most * 100)] : [Math.round(least), Math.round(most)];
    const amount = `${from}–${to}${share ? "%" : ""}`;

    return stat === "armor" ? `Armour: takes ${amount} more off each blow` : `+${amount} ${label.toLowerCase()}`;
}

// What kind of thing a piece is, in words
function kindOf(id) {
    const def = GEAR[id];

    if (def.slot === "mainHand") {
        return def.quiver ? "Two-handed weapon (a quiver in the other hand)" : handsOf(id) >= 2 ? "Two-handed weapon" : "One-handed weapon";
    }

    if (def.withBow) {
        return "Off hand, with a bow";
    }

    if (def.robust) {
        return def.spells ? "Off hand: a mage's shield (with a wand or a sword)" : "Off hand: a shield (with a sword)";
    }

    return def.slot === "ring" ? "Ring" : (GEAR_SLOTS.find(({ takes }) => takes === def.slot)?.label ?? def.slot);
}

// A weapon's blows, in words: damage (as well made as it is) and reach
function blowsOf(id, power) {
    return (WEAPONS[id]?.attacks ?? []).map(({ damage: [least, most], reach, kind }) => `${kind === "ranged" ? `Shoots from ${reach} m` : "Up close"}: ${Math.round(least * power)}–${Math.round(most * power)} damage`);
}

/**
 * A thing's description: { label, rarity (its make), kind, lines: [{ text, tone }] (tone: "base",
 * "bonus", "set", "note"), rolls (a shop's ware: what's rolled on it as it's bought, rolledOf; or
 * null), compare: [{ text, tone ("better", "worse", "note") }], price (sold) }. `index`: its slot
 * in the pack (to compare with what's worn); `outside`: not carried (another's: compared as if it
 * were); `ware`: a shop's, nothing rolled on it yet (compared as it is, but for its spell power);
 * `haggle`: the player's.
 */
export function describe(item, progress, { index = null, label = item.id, haggle = 0, outside = false, ware = false } = {}) {
    const def = GEAR[item.id];
    const quality = item.quality ?? "common";
    const lines = [];

    if (!def) {
        return { label, rarity: quality, kind: null, lines, rolls: null, compare: [], price: priceOf(item, { haggle, selling: true }) };
    }

    const power = QUALITIES[quality]?.power ?? 1;

    // What it does
    if (def.slot === "mainHand") {
        for (const text of blowsOf(item.id, power)) {
            lines.push({ text, tone: "base" });
        }
    }

    if (def.magic && ware) {
        lines.push({ text: boostsWorded(), tone: "base" });
    } else if (def.magic && item.boost) {
        lines.push({ text: `+${Math.round(item.boost * 100)}% spell power`, tone: "base" });
    }

    if (def.spellTimes) {
        lines.push({ text: `Held in both hands: spells ${Math.round((def.spellTimes - 1) * 100)}% stronger again`, tone: "base" });
    }

    // (A shield: how much of a blow caught on it it takes, of the most one of its make can; and a
    // spellward's spells)
    if (def.robust && ware) {
        const most = blockMost(item.id, quality);

        lines.push({ text: `Blocks ${Math.round(most * 50)}–${Math.round(most * 100)}% of a blow caught on it, rolled as it's bought (the more, the rarer)`, tone: "base" });
    } else if (def.robust) {
        lines.push({ text: `Blocks ${Math.round((item.boost ?? 0) * 100)}% of a blow caught on it (up to ${Math.round(blockMost(item.id, quality) * 100)}% for its make)`, tone: "base" });

        if (def.spells) {
            lines.push({ text: "Catches spells as well as blows", tone: "base" });
        }
    }

    if (def.kicks) {
        lines.push({ text: "Kicks as well as fighting with what's in hand", tone: "base" });
    }

    const own = statsOf({ id: item.id }, power);

    for (const [stat, value] of Object.entries(own)) {
        lines.push({ text: stat === "armor" ? `Armour: takes ${Math.round(value * 100)}% off each blow` : worded(stat, value), tone: "base" });
    }

    for (const [stat, value] of Object.entries(item.bonuses ?? {})) {
        if (STATS[stat]) {
            lines.push({ text: worded(stat, value), tone: "bonus" });
        }
    }

    // The set it's part of, and how far it's worn
    if (def.uniform && item.people && SETS[item.people]) {
        const { name, bonus } = SETS[item.people];
        const worn = setCounts(progress.gear)[item.people] ?? 0;

        lines.push({ text: `${name} (${ADJECTIVES[item.people]} uniform): ${worn} worn`, tone: "set" });

        for (const [count, bonuses] of Object.entries(bonus)) {
            lines.push({ text: `${count} worn: ${Object.entries(bonuses).map(([stat, value]) => worded(stat, value)).join(", ")}`, tone: worn >= Number(count) ? "set" : "note" });
        }

        if (["head", "chest", "cloak"].includes(def.slot)) {
            lines.push({ text: `With their helm, hauberk and cloak on, you pass for one of their soldiers.`, tone: "note" });
        }
    }

    // (Against what's worn: from the pack, or as if it were carried; a ware's rolled spell power
    // left out, not being known yet)
    const tried = index !== null ? progress.trying(index) : outside || ware ? progress.tryingOn(item) : null;
    const rolls = ware ? rolledOf(item) : null;
    const compare = tried ? comparing(progress, tried, item.id, { unknown: ware && def.magic ? ["spell"] : [], rolled: Boolean(rolls) }) : [];

    return { label, rarity: quality, kind: kindOf(item.id), lines, rolls, compare, price: priceOf(item, { haggle, selling: true }) };
}

// A wand's or grimoire's spell power, as it's rolled when it's bought (core/progress.js
// rollBoost): from the least to the most there is, and under what most are
function boostsWorded() {
    const total = BOOSTS.reduce((sum, { weight }) => sum + weight, 0);
    let sum = 0;
    const most = BOOSTS.find(({ weight }) => (sum += weight) > total / 2).band[1];

    return `+${Math.round(BOOSTS[0].band[0] * 100)}–${Math.round(BOOSTS.at(-1).band[1] * 100)}% spell power, rolled as it's bought (most under +${Math.round(most * 100)}%)`;
}

/**
 * What's rolled on a piece of a make as it's bought (core/gear.js rollGear: a shop's ware), or null
 * for nothing: { count (how many bonuses, each a different one), title (that, in words), choices:
 * [{ name (the word it puts in the piece's name), text (how much it could add) }] }.
 */
export function rolledOf({ id, quality = "common" }) {
    const def = GEAR[id];
    const { count: made, strength } = ROLLS[quality] ?? ROLLS.common;
    const choices = affixesFor(id);
    const count = Math.min(Math.max(made, def?.jewel ? 1 : 0), choices.length);

    if (!def || !count) {
        return null;
    }

    const which = count === choices.length ? (count === 1 ? "this bonus" : `all ${count} of these bonuses`) : count === 1 ? "one of these bonuses" : `${count} of these bonuses, each different`;

    return {
        count,
        title: `Comes with ${which}, rolled as it's bought${quality === "legendary" ? ", and a name of its own" : ""}:`,
        choices: choices.map((key) => {
            const { prefix, suffix, stat, range: [least, most] } = AFFIXES[key];

            return { name: prefix ?? suffix, text: spanned(stat, least * strength, most * strength) };
        }),
    };
}

// What putting on a piece would change (as progress.trying has it), `id` the piece's: each total
// better or worse (but those `unknown`), and what would come off; and (`rolled`: a ware with
// bonuses to come) that that's before them
function comparing(progress, { reason, before, after, off, weapon }, id, { unknown = [], rolled = false } = {}) {
    if (reason) {
        return [{ text: REASONS[reason] ?? "Can't be put on now.", tone: "note" }];
    }

    const changes = Object.keys(STATS)
        .filter((stat) => !unknown.includes(stat) && Math.abs((after[stat] ?? 0) - (before[stat] ?? 0)) > 1e-6)
        .map((stat) => {
            const change = after[stat] - before[stat];

            return { text: stat === "armor" ? `${change > 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}% armour` : worded(stat, change), tone: change > 0 ? "better" : "worse" };
        });

    const was = progress.gear.mainHand?.id ?? null;

    if (GEAR[id]?.slot === "mainHand" && weapon !== was) {
        changes.unshift({ text: `Fights with a ${WEAPONS[weapon]?.label.toLowerCase() ?? weapon} instead`, tone: "note" });
    }

    const taken = off.filter((piece) => piece.id !== id || GEAR[piece.id]?.slot !== GEAR[id]?.slot);

    // (What else comes off, and why: the weapon's other hand not free for it)
    for (const piece of taken.slice(1)) {
        changes.push({ text: `${OFF_HANDS[offHandFits(id, piece.id)] ?? "Takes both hands"}: the ${GEAR[piece.id]?.label.toLowerCase() ?? piece.id} comes off`, tone: "worse" });
    }

    if (!changes.length) {
        return [{ text: `No better or worse than what's worn${rolled ? ", before what's rolled on it" : ""}`, tone: "note" }];
    }

    return rolled ? [...changes, { text: "Before what's rolled on it", tone: "note" }] : changes;
}

// Why what's in the other hand comes off with a weapon put on (core/gear.js offHandFits), in words
const OFF_HANDS = Object.freeze({ twoHanded: "Takes both hands", bow: "A bow's other hand takes only a quiver", ward: "A wand's other hand takes only a spellward" });

/** Why a piece can't be put on (core/progress.js equip), in words. */
export const REASONS = Object.freeze({
    item: "That can't be worn.",
    slot: "That doesn't go there.",
    twoHanded: "The weapon in hand takes both hands.",
    bow: "A bow's other hand takes only a quiver.",
    quiver: "A quiver goes only with a bow.",
    ward: "A wand's other hand takes only a mage's shield, a spellward.",
    unarmed: "That would leave nothing to fight with: put on another weapon, or spiked boots.",
    full: "There's no room in the pack for what comes off.",
    room: "There's no room in the pack for it.",
});

/**
 * The totals of everything worn and grown into, as the pack shows them beside the paperdoll:
 * [{ label, value }], and the sets worn ([{ name, people, count, of, next }]) and who they pass for.
 */
export function totals(progress, { hp = 50, stamina = 50 } = {}) {
    const bonus = progress.bonuses();
    const shield = progress.guard(bonus);
    const pct = (value) => `${Math.round(value * 100)}%`;
    const rows = [
        { label: "Armour", value: `${pct(bonus.armor)} off each blow` },
        { label: "Dodge", value: `${pct(bonus.dodge)} of blows and shots` },
        { label: "Block", value: shield ? `${pct(shield.chance)} of blows from in front${shield.spells ? " and spells" : ""}, ${pct(shield.share)} of each` : "No shield in hand" },
        { label: "Hit points", value: String(hp + bonus.hp) },
        { label: "Stamina", value: String(stamina + bonus.stamina) },
        { label: "Melee", value: `+${pct(bonus.melee)}` },
        { label: "Ranged", value: `+${pct(bonus.ranged)}` },
        { label: "Spells", value: `+${pct(bonus.spell)}` },
        { label: "Healing", value: `+${pct(bonus.heal)}` },
        { label: "Stuns", value: `+${pct(bonus.stun)}` },
        { label: "Haggling", value: pct(bonus.haggle) },
        { label: "Persuasion", value: pct(bonus.persuade) },
        { label: "Might", value: String(progress.might()) },
    ];
    const sets = Object.entries(setCounts(progress.gear)).map(([people, count]) => {
        const next = Object.keys(SETS[people].bonus).map(Number).find((at) => at > count) ?? null;

        return { people, name: SETS[people].name, count, next };
    });

    return { rows, sets, disguise: disguiseOf(progress.gear) };
}
