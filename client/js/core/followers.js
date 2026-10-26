// What a player's own do: the adventurers they've hired (docs/WAR.md M9: by their calling), and
// the creatures at their side (docs/MAGIC.md: called by Summon, raised by Zombify).
// - Each calling's way of fighting, of its own accord (`wayOf`): a mage's spells at whom it fights,
//   a cleric's healing (its leader first), a warrior's those after its leader first, a rogue's
//   whom its leader's fighting first, a ranger's keeping its distance.
// - The orders they take (UNIT_ORDERS: core/host.js #orderUnit), each held on them on the
//   player's follower wheel (app/wheel.js) or given in talk.
// - The ability each can be told to use (UNIT_ABILITIES, `abilityOf`): a blow made stronger at
//   whom the player's fighting, a greater spell at them, or healing on the player.
//
// Pure data, no DOM.

import { SCHOOLS, SPELLS } from "./spells.js";

/**
 * The orders one of a player's own takes (core/host.js #orderUnit): go for whom the player's
 * fighting (`assist`), follow, wait where they are, guard the player (`guard`: at their side,
 * taking on only those after them or it), break off and run back to them (`fallback`), start no
 * fights (`hold`: only fighting back) or go after any enemy seen again (`free`), use their own
 * ability (`ability`), or go for good (`dismiss`).
 */
export const UNIT_ORDERS = Object.freeze(["assist", "follow", "wait", "guard", "fallback", "hold", "free", "ability", "dismiss"]);

/**
 * One falling back (the `fallback` order): running back to its leader, after no one, till it's
 * as near them as a follower keeps (battle.js FOLLOW.near) or `ms` have passed, `pace` times as
 * fast as it chases.
 */
export const FALL_BACK = Object.freeze({ ms: 8000, pace: 1.25 });

/** How near its leader one guarding them (the `guard` order) takes on those after them (squares). */
export const GUARD_REACH = 6;

/** How near a foe comes to one that keeps its distance (a ranger) before it backs off (metres). */
export const KEEP_OFF = 4;

/**
 * How near one of a player's own they can give a draught, a meal or a cure (metres): as far as a
 * spell cast on them reaches (core/spells.js SPELL_REACH).
 */
export const GIVE_REACH = 16;

/**
 * Whether a thing to use (its `use`: core/progress.js ITEMS) can be given to one of a player's
 * own: one that heals or cures, and does nothing else (not a spell's scroll, a bomb, a boon...).
 */
export const givable = (use) => Boolean(use?.heal || use?.cure) && !["cast", "bomb", "learn", "boon", "safety", "treasure", "ward", "buff", "stamina"].some((key) => use[key]);

/** A cleric's healing, the weakest first (battle.js #mend), as the peoples' healers'. */
export const CLERIC_HEALS = Object.freeze(["vigor", "mendWounds"]);

/**
 * Each calling's way of fighting, of its own accord (core/battle.js #follow): its spells (`casts`,
 * the stronger first: a mage's, its people's school's first two, as their soldiers' casters'),
 * its healing (`heals`: a cleric's, its leader first), whom it goes for first (`tactic`:
 * "protect", those after its leader; "flank", whom its leader's fighting), and how near it lets
 * a foe come before backing off (`keep`: a ranger's, metres). `school`: a school of magic
 * (spells.js SCHOOLS), the mage's.
 */
export function wayOf(calling, school = "fire") {
    const tiers = (SCHOOLS[school] ?? SCHOOLS.fire).tiers;

    return (
        {
            mage: { casts: [tiers[1], tiers[0]] },
            cleric: { heals: [...CLERIC_HEALS] },
            warrior: { tactic: "protect" },
            rogue: { tactic: "flank" },
            ranger: { keep: KEEP_OFF },
        }[calling] ?? {}
    );
}

/**
 * The ability each of a player's own can be told to use (the `ability` order), once each
 * `cooldown` ms (kept with them: battle.js `abilityReadyAt`):
 * - a blow (`blow`: "melee", "ranged", or "any", whichever they fight with) `factor` times as hard,
 *   stunning for `stun` ms too, at whom the player's fighting, going for them;
 * - their school's `tier`th spell (core/spells.js SCHOOLS) at them at once, `spell`;
 * - a heal (`heal`: a spell) on the player at once.
 */
export const UNIT_ABILITIES = Object.freeze({
    shieldBash: { label: "Shield bash", about: "Goes for your foe, the next blow slamming the shield into them: stunned 2 seconds.", blow: "melee", factor: 1, stun: 2000, cooldown: 15000 },
    aimedShot: { label: "Aimed shot", about: "A careful shot at your foe, two and a half times as hard.", blow: "ranged", factor: 2.5, cooldown: 12000 },
    backstab: { label: "Backstab", about: "Slips round to your foe, the next blow three times as hard.", blow: "melee", factor: 3, cooldown: 15000 },
    greaterSpell: { label: "Greater spell", about: "Their school's third spell at your foe, at once.", spell: 2, cooldown: 20000 },
    healYou: { label: "Heal me", about: "Detraumatize on you at once: heals well, and stops bleeding.", heal: "detraumatize", cooldown: 15000 },
    savage: { label: "Savage blow", about: "Goes for your foe, the next blow twice as hard.", blow: "any", factor: 2, cooldown: 12000 },
    graveGrip: { label: "Grave grip", about: "Goes for your foe, the next blow seizing them: held 2.5 seconds.", blow: "any", factor: 1, stun: 2500, cooldown: 15000 },
});

/** Each calling's ability, and a called creature's and a risen one's (UNIT_ABILITIES). */
const ABILITY_OF = Object.freeze({ warrior: "shieldBash", ranger: "aimedShot", rogue: "backstab", mage: "greaterSpell", cleric: "healYou", summon: "savage", risen: "graveGrip" });

/**
 * The ability one of a player's own uses (UNIT_ABILITIES), by what they are: a hired
 * adventurer's calling, or a creature called (`summon`) or risen (`risen`). Null for none.
 */
export function abilityOf({ calling = null, kind = null }) {
    return ABILITY_OF[kind === "adventurer" ? calling : kind] ?? null;
}

/**
 * What an ability's called (UNIT_ABILITIES `label`): a greater spell by its own name, for a
 * mage of a school (`school`).
 */
export function abilityLabel(id, school = null) {
    const ability = UNIT_ABILITIES[id];

    if (ability?.spell !== undefined && school) {
        return SPELLS[SCHOOLS[school]?.tiers[ability.spell]]?.label ?? ability.label;
    }

    return ability?.label ?? null;
}
