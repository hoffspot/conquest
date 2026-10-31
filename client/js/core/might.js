// How mighty a hero is, and how strong a foe, on one scale from 0 to 100 (docs/WILDS.md *Might and
// power*): what a hero finds is made for their might (each piece's level: core/gear.js), and an
// easy kill, a foe far weaker than them, finds the exceptional less often (falloff).
//
// Both are worked out from a fighting value (core/strength.js: √(toughness × harm), how long they'd
// last and how fast they harm, met in the middle; whoever has the higher wins a fight between
// them), on a scale that goes up a step each time it's so many times as much (MIGHT): a fresh hero's
// 0, the mightiest's 100. One tier of a creature's (creatures.js TIER_GROWTH) is about six steps of
// it.
//
//  - A hero's might is what's lasting about them, and nothing else: their gear (its make, its level,
//    what's rolled on it, a legendary weapon's effect), their skills and abilities, the spells they
//    know and their charms. Not their followers, nor what they've called or raised, nor a boon,
//    a draught or a spell cast on them, all of which pass.
//  - A foe's power is its own, as it is (its tier, an elite's or a champion's strength); or, for a
//    pack of the wild's, those of it that came at a player together (host.js #fights).
//
// Pure arithmetic, the same in every browser (exact.js log): the host and the pack (app/gearinfo.js)
// both use it.

import { AFFLICTIONS } from "./afflictions.js";
import { KINDS } from "./battle.js";
import { RESEARCH } from "./bestiary.js";
import { exp, log, pow, sqrt } from "./exact.js";
import { effectOf, levelOf, SLOT_IDS } from "./gear.js";
import { chargeOf, EFFECTS, effectAt, WARD_CHARGE } from "./legendary.js";
import { ABILITIES, ARMOR_CAP, weaponOf } from "./progress.js";
import { SPELL_COOLDOWN, SPELLS } from "./spells.js";
import { spellHarm, toughness, weaponHarm } from "./strength.js";
import { armsOf, blowEvery } from "./weapons.js";

/**
 * The scale: a fighting value of `least` (a fresh hero's, with a sword) is 0, and `span` times as
 * much (a hero of the highest ranks in legendary gear of the highest level) is `top`, 100; each step
 * between them as many times as much as the one before.
 */
export const MIGHT = Object.freeze({ least: 20.6, span: 18, top: 100 });

// Steps of the scale to each e-fold of a fighting value
const STEPS = MIGHT.top / log(MIGHT.span);

/** A fighting value on the scale (MIGHT): 0 to 100, whole. */
export function scaleOf(value) {
    return value > 0 ? Math.max(0, Math.min(MIGHT.top, Math.round(STEPS * log(value / MIGHT.least)))) : 0;
}

/** The fighting value a step of the scale is (scaleOf's inverse). */
export const valueAt = (step) => MIGHT.least * exp(step / STEPS);

/**
 * What the measure counts of a hero that a fighting value of its own doesn't (strength.js): the
 * healing they'd do in a fight `seconds` long (as hit points more: their healing spells as if
 * cast `healing` of the time, the rest of it spent fighting), and a foe stunned (by Hexes, as long
 * as `stun` of what a stun's spell holds them for between casts, at most `stunned` of the fight)
 * as harm not done to them; and, a ward worn (core/legendary.js EFFECTS `ward`), the blows they'd
 * take, one every `struck` ms, filling its charge.
 */
export const FIGHT = Object.freeze({ seconds: 30, healing: 0.2, stun: 0.25, stunned: 0.3, struck: 1500 });

/**
 * A hero as their lasting gear and skills make them (core/progress.js; `bonus`: what they give,
 * with any boon's on top for the battle's own: host.js #outfit): their weapon, whether they kick,
 * their power for blows, shots, healing, stuns and spells, armour, dodging, shield, hit points, how
 * much sooner their blows come (`haste`), the harm they get back (`leech`), how likely a blow is to
 * leave its foe bleeding (`bleed`), the effect their blows let loose (`legendary`: a legendary
 * weapon's, or a unique's worn anywhere: { effect, level, charge }, or null: core/legendary.js),
 * and the ward the blows they take let loose (`ward`: a unique's, { effect, level, charge }, or
 * null). One of each at most: the weapon's first, then each piece's as they're worn (gear.js
 * SLOT_IDS), at its own level.
 */
export function fighterOf(progress, bonus = progress.bonuses()) {
    const weapon = weaponOf(progress);
    const pieces = ["mainHand", ...SLOT_IDS.filter((slot) => slot !== "mainHand")].map((slot) => progress.gear[slot]).filter(Boolean);
    const blows = pieces.find((item) => effectOf(item) && !EFFECTS[effectOf(item)].ward) ?? null;
    const warding = pieces.find((item) => effectOf(item) && EFFECTS[effectOf(item)].ward) ?? null;

    return {
        weapon,
        boots: progress.kicks() || weapon === "boots",
        power: { melee: 1 + bonus.melee, ranged: 1 + bonus.ranged, heal: 1 + bonus.heal, stun: 1 + bonus.stun, spell: 1 + bonus.spell, bash: 1 + bonus.bash },
        armor: Math.min(ARMOR_CAP, bonus.armor),
        dodge: bonus.dodge,
        shield: progress.guard(bonus),
        maxHp: KINDS.player.hp + bonus.hp,
        haste: bonus.haste,
        leech: bonus.leech,
        bleed: bonus.bleed,
        legendary: blows && WEAPONS_HELD(weapon) ? { effect: effectOf(blows), level: levelOf(blows.level), charge: chargeOf(weapon) } : null,
        ward: warding ? { effect: effectOf(warding), level: levelOf(warding.level), charge: WARD_CHARGE.blows } : null,
    };
}

// (A legendary effect is a weapon's in hand: not spiked boots' alone)
const WEAPONS_HELD = (weapon) => weapon !== "boots";

// What a blow does on average, before power
const meanOf = ([least, most]) => (least + most) / 2;

/**
 * How fast a hero's weapon harms with all that comes with it (hit points a second): its blows
 * (weaponHarm), an ability's doubled blow now and then (Power strike, Aimed shot), the bleeding
 * its blows leave (Vicious: at most one going at a time), and a legendary weapon's effect, let
 * loose once its charge is full.
 */
function blowsHarm(actor, abilities) {
    const arms = armsOf(actor.weapon, actor.boots);
    const attack = arms[0];

    if (!attack) {
        return 0;
    }

    const kind = attack.kind === "ranged" ? "ranged" : "melee";
    const power = actor.power[kind] ?? 1;
    const every = blowEvery(attack.either?.[0] ?? attack, actor.haste);
    const blows = weaponHarm(actor);
    const ability = Object.entries(ABILITIES).find(([id, { blow, factor }]) => blow === kind && factor > 1 && abilities.includes(id))?.[1];
    const doubled = ability ? (blows * every * (ability.factor - 1)) / ability.cooldown : 0;
    const { damage, every: bleedEvery, ms } = AFFLICTIONS.bleed;
    const bleeding = actor.bleed > 0 ? Math.min(1, (actor.bleed * ms) / every) * ((damage * power * 1000) / bleedEvery) : 0;
    const numbers = actor.legendary ? effectAt(actor.legendary.effect, actor.legendary.level) : null;
    const effect = numbers ? (meanOf(numbers.damage) * power * 1000) / (actor.legendary.charge * every) : 0;

    return blows + doubled + bleeding + effect;
}

/**
 * The healing a hero would do in a fight FIGHT.seconds long (hit points): their best healing
 * spell's cast as often as it's ready, the life their blows draw back (Leeching), and Vampirism's.
 */
function healed(actor, spells, levelOf, blows) {
    const heals = spells.map((id) => SPELLS[id]).filter((spell) => spell?.heal && !spell.full);
    const best = heals.reduce((most, spell) => Math.max(most, (meanOf(spell.heal) * actor.power.heal * 1000) / Math.max(spell.cooldown ?? SPELL_COOLDOWN, SPELL_COOLDOWN)), 0);
    const drained = spells.includes("vampirism") ? (meanOf(SPELLS.vampirism.drain[Math.min(levelOf("vampirism"), SPELLS.vampirism.drain.length) - 1]) * 1000) / SPELLS.vampirism.cooldown : 0;

    return ((best + drained) * FIGHT.healing + (actor.leech ?? 0) * blows) * FIGHT.seconds;
}

/** How much of a fight a hero's stuns hold a foe (0 to FIGHT.stunned): Stun's and Hold's, as strong as their stuns (Hexes, Binding). */
function stunning(actor, spells) {
    const holds = spells.map((id) => SPELLS[id]).filter((spell) => spell?.stun && !spell.damage && spell.target === "enemy");
    const best = holds.reduce((most, spell) => Math.max(most, spell.stun / Math.max(spell.cooldown ?? SPELL_COOLDOWN, SPELL_COOLDOWN)), 0);

    // (Stun, that anyone casts, as a fresh hero would: only what's beyond it)
    const plain = SPELLS.stun.stun / Math.max(SPELLS.stun.cooldown, SPELL_COOLDOWN);

    return Math.max(0, Math.min(FIGHT.stunned, FIGHT.stun * (best * actor.power.stun - plain)));
}

/**
 * A hero's fighting value as what's lasting about them makes them (fighterOf, with what the spells
 * they know add: spellHarm, healed, stunning): √(toughness × harm).
 */
export function heroValue(progress) {
    const actor = fighterOf(progress);
    const known = progress.known();
    const abilities = progress.abilities();
    const blows = blowsHarm(actor, abilities);
    // (Casting only what harms faster than their blows do: a mighty weapon's wielder doesn't leave
    // off it for a weak spell)
    const spells = known.filter((id) => !SPELLS[id]?.damage || (meanOf(SPELLS[id].damage) * actor.power.spell * 1000) / Math.max(SPELLS[id].castTime ?? 0, SPELL_COOLDOWN) > blows);
    const { rate, used } = spellHarm(spells, actor.power.spell);
    const harm = rate + blows * (1 - used);
    const hp = actor.maxHp + healed(actor, known, (spell) => progress.levelOf(spell), blows * (1 - used));
    const lasting = toughness({ ...actor, maxHp: hp }) / (1 - stunning(actor, known)) / (1 - warded(actor));

    return harm > 0 ? sqrt(lasting * harm) : 0;
}

/**
 * How much of the harm done a hero a ward they wear keeps off them on average (0 to 1: none
 * worn, 0): every blow its `guard` the lighter, and, its stone skin up (as long as it lasts, of
 * that and the time it takes to fill its charge again: FIGHT `struck`), its `harden` the lighter
 * again.
 */
function warded(actor) {
    const numbers = actor.ward ? effectAt(actor.ward.effect, actor.ward.level) : null;

    if (!numbers?.guard) {
        return 0;
    }

    const up = (numbers.skin ?? 0) / ((numbers.skin ?? 0) + actor.ward.charge * FIGHT.struck);

    return 1 - (1 - numbers.guard) * (1 - (numbers.harden ?? 0) * up);
}

/** A hero's might (0 to 100): their lasting fighting value (heroValue) on the scale. */
export const mightOf = (progress) => scaleOf(heroValue(progress));

/**
 * The tier a hero's might is worth to what came with the tiers of old (0 to 10: the war's stage,
 * the smith's makes, a cache's, a treasure's, a dungeon's and a hoard's tier): one every ten.
 */
export const mightTier = (might) => Math.max(0, Math.min(10, Math.floor((might ?? 0) / 10)));

/**
 * A foe's power (0 to 100): its own fighting value on the scale (strength.js toughness × harm,
 * as it is: its tier, an elite's or a champion's strength), or the colossal's, the mightiest.
 */
export function powerOf(actor) {
    if (!actor) {
        return 0;
    }

    if (actor.wild?.colossus || actor.colossal) {
        return MIGHT.top;
    }

    const { lasting, harm } = partsOf(actor);

    return scaleOf(sqrt(lasting * harm));
}

/**
 * A foe's toughness and harm (strength.js), whatever its health now: what a pack's made of when
 * those that came at a player together are reckoned as one (packPower).
 */
export function partsOf(actor) {
    return { lasting: toughness(actor), harm: weaponHarm(actor) + spellHarm(actor.casts ?? [], actor.power?.spell ?? 1).rate };
}

/** A pack's power, of those of it that came at a player (`parts`: [{ lasting, harm }]): as one, √(toughness of them all × harm of them all). */
export function packPower(parts) {
    const lasting = parts.reduce((sum, part) => sum + part.lasting, 0);
    const harm = parts.reduce((sum, part) => sum + part.harm, 0);

    return lasting > 0 && harm > 0 ? scaleOf(sqrt(lasting * harm)) : 0;
}

/**
 * The power a tier of the land stands for, where nothing was fought for what's found (a cache's
 * band, a place's chest, a dungeon's level, a treasure's or a fallen adventurer's land): ten steps
 * a tier, about what its packs are.
 */
export const tierPowerOf = (tier) => Math.max(0, Math.min(MIGHT.top, 10 * ((tier ?? 1) - 1)));

/** How much stronger a hero is against a kind they've Mastered in their bestiary (bestiary.js RESEARCH `edge`), on the scale: about 2. */
export const MASTERED_STEPS = Math.round(STEPS * log(sqrt(RESEARCH.edge)));

/**
 * What a hero finds is made for, from a fight's power (`power`) and their might (`might`):
 * `below` under their might at the least, `above` over it at the most, then `luck` either way
 * (the world's dice: random.js random); and how much less likely the exceptional is (falloff),
 * past `grace` steps weaker than them, `halves` steps more halving it, never less than `floor`.
 */
export const LOOT_LEVEL = Object.freeze({ below: 10, above: 5, luck: 3, grace: 10, halves: 10, floor: 0.1 });

/** A piece's level for a hero of a `might` from a fight of a `power` (LOOT_LEVEL; random.js random): 1 to 100. */
export function levelFor(power, might, random) {
    const at = Math.max(might - LOOT_LEVEL.below, Math.min(might + LOOT_LEVEL.above, power));
    const luck = random.int(-LOOT_LEVEL.luck, LOOT_LEVEL.luck);

    return levelOf(at + luck);
}

/**
 * How much less likely the exceptional is for a hero `gap` steps mightier than what they fought
 * (LOOT_LEVEL): as likely, up to `grace`; then half as likely each `halves` steps further; never
 * less than `floor`.
 */
export function falloff(gap) {
    if (!(gap > LOOT_LEVEL.grace)) {
        return 1;
    }

    return Math.max(LOOT_LEVEL.floor, pow(0.5, (gap - LOOT_LEVEL.grace) / LOOT_LEVEL.halves));
}

/**
 * How a fight looks to a hero, by the gap between their might and a foe's power (falloff): "easy"
 * (what it leaves less likely exceptional), "fair", "hard", "deadly" (FIGHT_LOOKS).
 */
export const FIGHT_LOOKS = Object.freeze({ easy: LOOT_LEVEL.grace, hard: -10, deadly: -25 });

export function fightLook(gap) {
    return gap > FIGHT_LOOKS.easy ? "easy" : gap < FIGHT_LOOKS.deadly ? "deadly" : gap < FIGHT_LOOKS.hard ? "hard" : "fair";
}
