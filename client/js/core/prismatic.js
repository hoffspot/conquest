// Prismatic chains (docs/MAGIC.md, "Prismatic Destruction"): a reason to practise all four
// elements. A player who casts an element's spells in order, from its first to its last, each
// landing within CHAIN.window of the one before, makes every attack spell they cast stronger as
// they go (CHAIN.step for each spell past the first), and, at the last of them, earns that
// element's piece of the Prismatic sigil: the stacks of the chain give way to the piece's own
// CHAIN.piece, kept while the sigil lasts. Then another element whose piece they haven't got,
// from its first spell, within the same window of the last; with all four pieces (every attack
// spell twice as strong), the sigil is whole, and they have CHAIN.ready to cast Prismatic
// Destruction with it. Cast, or let go, it's spent: every stack and piece with it. And a chain
// let lapse (the next spell not landing in time) loses everything there is.
//
// Anything cast out of the chain's order (another element's spell mid-chain, a lower one, a hex,
// a heal, a blow) is let be: it neither counts nor breaks it. Healing has no part in it.
//
// A chain as it stands, kept on the player's battle actor (battle.js `prism`, in snapshots, so
// every copy of the world sees the same): { element (the one being cast up through, or null
// between them), step (its tier reached), at (when the last of it landed: ms of battle time),
// pieces (the elements whose piece is held), readyAt (when the sigil came whole, or null) }, or
// null for none.
//
// Pure data and rules, no DOM: the battle (battle.js) keeps it and works it.

import { SCHOOLS } from "./spells.js";

/**
 * The chain's rules: how long a spell has to land after the one before (ms), how much stronger
 * every attack spell is for each spell of a chain past its first, and for each piece of the sigil
 * held (shares), and how long the whole sigil waits to be cast (ms).
 */
export const CHAIN = Object.freeze({ window: 10000, step: 0.05, piece: 0.25, ready: 15000 });

/** The elements whose spells make chains, in the sigil's order. */
export const ELEMENTS = Object.freeze(["fire", "earth", "air", "water"]);

/**
 * Prismatic Destruction (spells.js `prismatic`: on its target and every enemy within its `area`
 * round them): the share of their whole health it takes from the mightiest (mighty), which may
 * not kill them outright; anyone else it kills.
 */
export const PRISMATIC = Object.freeze({ mighty: 0.75 });

/**
 * What a spell (by id, SPELLS') landing for its caster at `time` makes of their chain (`prism`):
 * { prism, change }, change saying what happened: "start" (an element's first spell, a new
 * chain), "step" (the next of it), "piece" (its last: the element's piece of the sigil), "whole"
 * (the fourth piece: the sigil whole), or null (nothing: out of order, not an element's, or with
 * the sigil whole already).
 */
export function chainAfter(prism, spell, time) {
    const live = prism && !lapsed(prism, time) ? prism : null;
    const pieces = live?.pieces ?? [];

    if (!ELEMENTS.includes(spell?.school) || isWhole(live)) {
        return { prism: live, change: null };
    }

    // (An element's first spell, with no chain being cast up through: one whose piece isn't held)
    if (spell.tier === 1 && !live?.element && !pieces.includes(spell.school)) {
        return { prism: { element: spell.school, step: 1, at: time, pieces: [...pieces], readyAt: null }, change: "start" };
    }

    if (!live?.element || spell.school !== live.element || spell.tier !== live.step + 1) {
        return { prism: live, change: null };
    }

    if (spell.tier < SCHOOLS[spell.school].tiers.length) {
        return { prism: { ...live, pieces: [...pieces], step: spell.tier, at: time }, change: "step" };
    }

    const held = ELEMENTS.filter((element) => pieces.includes(element) || element === spell.school);
    const whole = held.length === ELEMENTS.length;

    return { prism: { element: null, step: 0, at: time, pieces: held, readyAt: whole ? time : null }, change: whole ? "whole" : "piece" };
}

/** Is a chain's sigil whole: all four pieces held, Prismatic Destruction to be cast? */
export const isWhole = (prism) => Number.isFinite(prism?.readyAt);

/** Has a chain lapsed by `time`: the next spell not landed in time, or the whole sigil not cast? */
export function lapsed(prism, time) {
    if (!prism) {
        return false;
    }

    return isWhole(prism) ? time - prism.readyAt > CHAIN.ready : time - prism.at > CHAIN.window;
}

/**
 * How much stronger a chain makes every attack spell its caster casts (a share: 0.25 is 25%
 * stronger): CHAIN.step for each spell of the chain being cast up through past its first, and
 * CHAIN.piece for each piece of the sigil held.
 */
export function bonusOf(prism) {
    if (!prism) {
        return 0;
    }

    return CHAIN.step * Math.max(0, (prism.element ? prism.step : 0) - 1) + CHAIN.piece * prism.pieces.length;
}

/**
 * The spell a chain's next (by element): the next tier of the element being cast up through; or,
 * between chains, the first of an element whose piece isn't held. Null for none (no chain, or
 * the sigil whole).
 */
export function nextOf(prism, element) {
    if (!prism || isWhole(prism) || !ELEMENTS.includes(element)) {
        return null;
    }

    if (prism.element) {
        return prism.element === element ? (SCHOOLS[element].tiers[prism.step] ?? null) : null;
    }

    return prism.pieces.includes(element) ? null : SCHOOLS[element].tiers[0];
}

/**
 * Is one of the mightiest, whom Prismatic Destruction doesn't kill outright: a dungeon's boss,
 * an elite, one of the perilous places' own, a seat's ruler, or a player.
 */
export function mighty(actor) {
    return actor.kind === "player" || Boolean(actor.ruler) || Boolean(actor.wild?.elite) || Boolean(actor.wild?.unique) || actor.wild?.champion === "boss";
}
