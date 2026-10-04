// What a thing is, for the pack (app/pack.js) to show when it's tapped: its name in the colour of
// how well made it is, what kind of thing it is (a two-handed weapon, the off hand, a ring), what
// it does (a weapon's blows, armour, its own bonus and those rolled on it, a draught's use), the
// set it's part of and how far that set's worn, and, for gear in the pack, what putting it on
// would change (better or worse), and what it's worth. Pure: from the player's progress
// (core/progress.js), no DOM.

import { disguiseOf, GEAR, GEAR_SLOTS, handsOf, setCounts, SETS, STATS, statsOf } from "../core/gear.js";
import { ADJECTIVES } from "../core/war/peoples.js";
import { priceOf, QUALITIES } from "../core/progress.js";
import { WEAPONS } from "../core/weapons.js";

/** Each make's name as shown (a common one, none), rarest last. */
export const MAKES = Object.freeze({ common: "Common", fine: "Fine", masterwork: "Masterwork", legendary: "Legendary" });

// A bonus as shown: "+12% melee damage", "+5 hit points"; armour: "takes 4% off each blow"
function worded(stat, value) {
    const { label, share } = STATS[stat];
    const amount = share ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;

    return stat === "armor" ? `Armour: takes ${amount} more off each blow` : `${value < 0 ? "−" : "+"}${amount.replace("-", "")} ${label.toLowerCase()}`;
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

    return def.slot === "ring" ? "Ring" : (GEAR_SLOTS.find(({ takes }) => takes === def.slot)?.label ?? def.slot);
}

// A weapon's blows, in words: damage (as well made as it is) and reach
function blowsOf(id, power) {
    return (WEAPONS[id]?.attacks ?? []).map(({ damage: [least, most], reach, kind }) => `${kind === "ranged" ? `Shoots from ${reach} m` : "Up close"}: ${Math.round(least * power)}–${Math.round(most * power)} damage`);
}

/**
 * A thing's description: { label, rarity (its make), kind, lines: [{ text, tone }] (tone: "base",
 * "bonus", "set", "note"), compare: [{ text, tone ("better", "worse", "note") }], price (sold) }.
 * `index`: its slot in the pack (to compare with what's worn); `haggle`: the player's.
 */
export function describe(item, progress, { index = null, label = item.id, haggle = 0 } = {}) {
    const def = GEAR[item.id];
    const quality = item.quality ?? "common";
    const lines = [];

    if (!def) {
        return { label, rarity: quality, kind: null, lines, compare: [], price: priceOf(item, { haggle, selling: true }) };
    }

    const power = QUALITIES[quality]?.power ?? 1;

    // What it does
    if (def.slot === "mainHand") {
        for (const text of blowsOf(item.id, power)) {
            lines.push({ text, tone: "base" });
        }
    }

    if (def.magic && item.boost) {
        lines.push({ text: `+${Math.round(item.boost * 100)}% spell power`, tone: "base" });
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

    const compare = index === null ? [] : comparing(progress, index);

    return { label, rarity: quality, kind: kindOf(item.id), lines, compare, price: priceOf(item, { haggle, selling: true }) };
}

// What putting on the piece in a slot of the pack would change: each total better or worse, and
// what would come off
function comparing(progress, index) {
    const { reason, before, after, off, weapon } = progress.trying(index);

    if (reason) {
        return [{ text: REASONS[reason] ?? "Can't be put on now.", tone: "note" }];
    }

    const changes = Object.keys(STATS)
        .filter((stat) => Math.abs((after[stat] ?? 0) - (before[stat] ?? 0)) > 1e-6)
        .map((stat) => {
            const change = after[stat] - before[stat];

            return { text: stat === "armor" ? `${change > 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}% armour` : worded(stat, change), tone: change > 0 ? "better" : "worse" };
        });

    const was = progress.gear.mainHand?.id ?? null;

    if (GEAR[progress.pack[index]?.id]?.slot === "mainHand" && weapon !== was) {
        changes.unshift({ text: `Fights with a ${WEAPONS[weapon]?.label.toLowerCase() ?? weapon} instead`, tone: "note" });
    }

    const taken = off.filter((piece) => piece.id !== progress.pack[index]?.id || GEAR[piece.id]?.slot !== GEAR[progress.pack[index]?.id]?.slot);

    for (const piece of taken.slice(1)) {
        changes.push({ text: `Takes both hands: the ${GEAR[piece.id]?.label.toLowerCase() ?? piece.id} comes off`, tone: "worse" });
    }

    return changes.length ? changes : [{ text: "No better or worse than what's worn", tone: "note" }];
}

/** Why a piece can't be put on (core/progress.js equip), in words. */
export const REASONS = Object.freeze({
    item: "That can't be worn.",
    slot: "That doesn't go there.",
    twoHanded: "The weapon in hand takes both hands.",
    bow: "A bow's other hand takes only a quiver.",
    quiver: "A quiver goes only with a bow.",
    unarmed: "That would leave nothing to fight with: put on another weapon, or spiked boots.",
    full: "There's no room in the pack for what comes off.",
});

/**
 * The totals of everything worn and grown into, as the pack shows them beside the paperdoll:
 * [{ label, value }], and the sets worn ([{ name, people, count, of, next }]) and who they pass for.
 */
export function totals(progress, { hp = 50, stamina = 50 } = {}) {
    const bonus = progress.bonuses();
    const pct = (value) => `${Math.round(value * 100)}%`;
    const rows = [
        { label: "Armour", value: `${pct(bonus.armor)} off each blow` },
        { label: "Dodge", value: `${pct(bonus.dodge)} of blows and shots` },
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
