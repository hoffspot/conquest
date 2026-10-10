// How strong a side is, as the wild weighs it when it puts its foes out against them
// (docs/WILDS.md, "A side's strength"): the players there, and everyone with them, their hired
// adventurers and the creatures they've called or raised.
//
// Each one's fighting value is how long they'd last and how fast they harm, met in the middle:
// √(toughness × harm), from what they are now (their health, armour, shield, knack for slipping
// blows; their weapon and power, the spells they cast), so gear, skills and a creature's tier
// all count. A side's strength (S) is the sum of its members' values over its strongest
// player's: a player alone is 1, two alike 2, a player and a hired warrior about 1.4. The wild
// answers it with an opposition a little less than it (F = S^0.8: OPPOSITION), each of a
// party's members finding it a little easier than alone, and every ally still worth having.
//
// Pure data and arithmetic, no DOM: the world's host weighs sides with it (host.js #side), and
// what's made of it is the same in every browser (exact.js pow, sqrt).

import { pow, sqrt } from "./exact.js";
import { SPELL_COOLDOWN, SPELLS } from "./spells.js";
import { armsOf } from "./weapons.js";

/**
 * Who's counted on a side: those within `reach` metres of where foes are put out (or of any of
 * a group's players), and the players `apart` metres or less from one another, one after
 * another, one group. Armour, slipping blows and a shield each count as taking off at most `most`
 * of what comes at someone; a shield, only what comes from in front of them, about `front` of it.
 */
export const STRENGTH = Object.freeze({ reach: 60, apart: 60, most: 0.9, front: 0.5 });

/** How the wild answers a side's strength S: an opposition of S^`answer` (1 alone; about 3 for four alike). */
export const OPPOSITION = Object.freeze({ answer: 0.8 });

// What a spell does on average, before the caster's power
const meanOf = ([least, most]) => (least + most) / 2;

/**
 * How hard someone is to put down: their health, over the share of each blow that gets through
 * their armour, their knack for slipping it (`dodge`) and the shield they catch it on.
 */
export function toughness(actor) {
    const shield = actor.shield ? Math.min(STRENGTH.most, (actor.shield.chance ?? 0) * (actor.shield.share ?? 0) * STRENGTH.front) : 0;
    const through = (1 - Math.min(STRENGTH.most, actor.armor ?? 0)) * (1 - Math.min(STRENGTH.most, actor.dodge ?? 0)) * (1 - shield);

    return (actor.maxHp ?? actor.hp ?? 0) / through;
}

/**
 * How fast someone's weapon harms, in hit points a second: their best attack's blow on average
 * (as strong as their power for it), over the time from one to the next. Kicks mixed in with a
 * weapon's blows (weapons.js armsOf `either`), the two on average.
 */
export function weaponHarm(actor) {
    let best = 0;

    for (const attack of armsOf(actor.weapon, actor.boots)) {
        const each = attack.either ?? [attack];
        const power = actor.power?.[attack.kind === "ranged" ? "ranged" : "melee"] ?? 1;
        const rate = each.reduce((sum, one) => sum + (meanOf(one.damage) * power * 1000) / one.interval, 0) / each.length;

        best = Math.max(best, rate);
    }

    return best;
}

/**
 * How fast someone's spells harm (`spells`: spells.js ids; `power`, their spell power), in hit
 * points a second, and what share of their time casting them takes ({ rate, used }): each spell
 * cast as often as it's ready, the hardest-hitting for the time it takes first (a cast holds the
 * next for SPELL_COOLDOWN, or as long as it takes to cast, whichever's longer), till there's no
 * more time to cast in.
 */
export function spellHarm(spells, power = 1) {
    const castable = spells
        .map((id) => SPELLS[id])
        .filter((spell) => spell?.damage && spell.target === "enemy")
        .map((spell) => ({ dealt: meanOf(spell.damage) * power, slot: Math.max(spell.castTime ?? 0, SPELL_COOLDOWN), every: spell.cooldown ?? SPELL_COOLDOWN }))
        .sort((a, b) => b.dealt / b.slot - a.dealt / a.slot);
    let [rate, used] = [0, 0];

    for (const { dealt, slot, every } of castable) {
        const share = Math.min(slot / every, 1 - used);

        rate += (dealt * 1000 * share) / slot;
        used += share;

        if (used >= 1) {
            break;
        }
    }

    return { rate, used };
}

/** How fast someone harms (hit points a second): their spells (`spells`), and their weapon whenever they aren't casting. */
export function harm(actor, spells = actor.casts ?? []) {
    const { rate, used } = spellHarm(spells, actor.power?.spell ?? 1);

    return rate + weaponHarm(actor) * (1 - used);
}

/** Someone's fighting value: √(toughness × harm); nothing, for one who can't harm or has fallen. */
export function fightingValue(actor, spells = actor?.casts ?? []) {
    if (!actor || actor.dead) {
        return 0;
    }

    return sqrt(toughness(actor) * harm(actor, spells));
}

/**
 * A side's strength (S): its members' fighting values (`values`) summed, over its strongest
 * player's (`strongest`). 1 for a player alone; never less than 1.
 */
export function sideStrength(values, strongest) {
    const sum = values.reduce((total, value) => total + value, 0);

    return strongest > 0 ? Math.max(1, sum / strongest) : 1;
}

/** The opposition the wild sets against a side of strength S (OPPOSITION): S^0.8, 1 alone. */
export function opposition(strength) {
    return pow(Math.max(1, strength), OPPOSITION.answer);
}

/**
 * Players in groups ({ id, map, x, y }, in order: the world's own): those on one map `apart`
 * metres or less from one another, one after another, one group. Each group's players in the
 * order given; the groups in the order of their first.
 */
export function groupsOf(players, apart = STRENGTH.apart) {
    const groups = [];
    const placed = new Set();

    for (const first of players) {
        if (placed.has(first.id)) {
            continue;
        }

        const group = [first];

        placed.add(first.id);

        for (let k = 0; k < group.length; k++) {
            for (const other of players) {
                const [dx, dy] = [other.x - group[k].x, other.y - group[k].y];
                const near = other.map === group[k].map && dx * dx + dy * dy <= apart * apart;

                if (!placed.has(other.id) && near) {
                    placed.add(other.id);
                    group.push(other);
                }
            }
        }

        groups.push(group.sort((a, b) => players.indexOf(a) - players.indexOf(b)));
    }

    return groups;
}
