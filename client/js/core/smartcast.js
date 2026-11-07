// Two actions that choose what to cast as things are (app/wheel.js ACTIONS: "cure" and
// "buffAll"), for a player whose list of spells has grown longer than their Action Bar:
//
// - Cure: the cure for whatever's on someone, out of the cures the player knows (the tomes' seven:
//   CURE_SPELLS) and the cure draughts and salves they carry (core/afflictions.js CURES). What
//   hinders them first (slowed, a venom's cramps: AFFLICTIONS speed), then whatever will do the
//   most harm before it wears off (cureOrder); a known cure spell that's not cooling down first,
//   then something carried (cureFor). Never a healing spell, Renewal's or Astral Heal's long
//   wait spent on a burn that's over in 4 seconds.
// - Buff all: each of the player's buffs they know (BUFFS) that's off them or has less than a
//   fifth of its time left (REFRESH), cast one after another (buffsDue); not Light (casting it
//   again puts it out), Surge (they take more harm under it) nor Invisibility (anything else cast
//   ends it): those are choices, not chores (BUFF_ALL_LEAVES). One that needs something in hand
//   that isn't is left out, and said why.
//
// Pure: the game (app/game.js) says what's on whom, what's known, carried, cooling down and in
// hand, and casts what this says.

import { AFFLICTIONS } from "./afflictions.js";
import { SPELLS } from "./spells.js";

/** The cure spells: each ends some afflictions and does nothing else (the tomes' seven). */
export const CURE_SPELLS = Object.freeze(Object.keys(SPELLS).filter((id) => SPELLS[id].cures && !SPELLS[id].heal && !SPELLS[id].full));

/** The buffs: the spells that last a while on the caster (or a friend). */
export const BUFFS = Object.freeze(Object.keys(SPELLS).filter((id) => SPELLS[id].lasts && ["self", "friend"].includes(SPELLS[id].target)));

/** The buffs Buff all leaves to the player to cast: each a choice as things are, not a chore. */
export const BUFF_ALL_LEAVES = Object.freeze(["light", "surge", "invisibility"]);

/** How little of a buff's time may be left (a share of how long it lasts) before Buff all casts it again. */
export const REFRESH = 0.2;

// Whether an affliction hinders the one it's on (slows them: AFFLICTIONS speed)
const hinders = (kind) => (AFFLICTIONS[kind]?.speed ?? 1) < 1;

// How much harm an affliction (`ailment`: { kind, until, damage }) will do before it wears off, as
// things are at `now` (ms): each blow of it (AFFLICTIONS every) still to come
function harmLeft({ kind, until, damage }, now) {
    const { every, damage: each = 0 } = AFFLICTIONS[kind] ?? {};

    return every ? Math.max(0, Math.floor((until - now) / every)) * (damage ?? each) : 0;
}

/**
 * The afflictions on someone (`afflictions`: [{ kind, until, damage }], as core/battle.js keeps
 * them) still on at `now` (ms), in the order Cure takes them: what hinders first, then the most
 * harm still to come, then the soonest gone last.
 */
export function cureOrder(afflictions = [], now = 0) {
    return afflictions
        .filter((ailment) => AFFLICTIONS[ailment.kind] && ailment.until > now)
        .sort((a, b) => Number(hinders(b.kind)) - Number(hinders(a.kind)) || harmLeft(b, now) - harmLeft(a, now) || b.until - a.until);
}

/**
 * What Cure would use on someone with `afflictions` on them, at `now` (ms): { kind, spell } (one
 * of the cure spells the player knows, `known`, that `ready(spell)` says isn't cooling down) or
 * { kind, item } (a cure they carry, `carried`: item ids; only for themselves, `self`); or null,
 * nothing on them that they can cure.
 */
export function cureFor(afflictions, { now = 0, known = [], ready = () => true, carried = [], self = true } = {}) {
    for (const { kind } of cureOrder(afflictions, now)) {
        const spell = CURE_SPELLS.find((id) => known.includes(id) && SPELLS[id].cures.includes(kind) && ready(id));

        if (spell) {
            return { kind, spell };
        }

        const item = self ? AFFLICTIONS[kind].cure : null;

        if (item && carried.includes(item)) {
            return { kind, item };
        }
    }

    return null;
}

/** Whether the player knows any cure spell (`known`: spell ids): Cure is theirs to put on a wheel or the Action Bar once they do. */
export const knowsACure = (known = []) => CURE_SPELLS.some((id) => known.includes(id));

/** Whether the player knows any buff Buff all casts (`known`: spell ids). */
export const knowsABuff = (known = []) => BUFFS.some((id) => known.includes(id) && !BUFF_ALL_LEAVES.includes(id));

/**
 * What Buff all would cast, at `now` (ms), for a player with `buffs` on them ([{ kind, until }],
 * as core/battle.js keeps them) who knows `known` (spell ids) and has in hand what
 * `holds(needs)` says (core/spells.js needs: "wand", "grimoire"): `due`, each buff they know that's
 * off them or has less than REFRESH of its time left, in the order the spells are; and `lacking`,
 * those left out for what isn't in hand ([{ spell, needs }]).
 */
export function buffsDue(buffs = [], { now = 0, known = [], holds = () => true } = {}) {
    const due = [];
    const lacking = [];

    for (const spell of BUFFS) {
        if (!known.includes(spell) || BUFF_ALL_LEAVES.includes(spell)) {
            continue;
        }

        const { lasts, needs } = SPELLS[spell];
        const on = buffs.find(({ kind, until }) => kind === spell && until > now);

        if (on && on.until - now >= REFRESH * lasts) {
            continue;
        }

        if (needs && !holds(needs)) {
            lacking.push({ spell, needs });
        } else {
            due.push(spell);
        }
    }

    return { due, lacking };
}
