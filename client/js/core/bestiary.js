// The bestiary (docs/GAME.md *The bestiary*): what a player's found out about each kind of
// creature (core/creatures.js CREATURES), as a hunter's research is in Monster Hunter. Seeing one
// for the first time, reading a sign of one left on a trail, and each one slain earn its kind
// points (RESEARCH); enough of them and its page in the journal goes up a level, telling more of
// it (app/bestiary.js): Sighted (where it's met, and what it is), Known (its ways, its home, the
// sign of it), Studied (how strong it is, and how it fights) and Mastered (what it leaves).
// Mastered, the player strikes it harder (`edge`: battle.js, the actor's `mastered`), and the
// adventurers' guilds pay for their notes on it (payOf). Kept with the character, as what they've
// learnt and carry is (core/progress.js Progress `bestiary`), into whatever world they go.

import { CREATURES } from "./creatures.js";

/**
 * How a kind's research grows, and what it's worth: the points the first sight of one earns
 * (`seen`), a sign of one read (`sign`), a wary beast left be, unfought (`spared`: core/wary.js),
 * one slain (`slain`), and one of the mightiest slain
 * (`mighty`: a lair's master, a perilous one, an elite at the head of its kind, a dungeon's boss or
 * mini-boss); the points each level takes and its name; how much harder its kind's struck once
 * it's Mastered (`edge`); and how far off (m) one's seen, light allowing (battle.js canSee).
 */
export const RESEARCH = Object.freeze({
    seen: 1,
    sign: 2,
    spared: 1,
    slain: 1,
    mighty: 5,
    levels: Object.freeze([
        Object.freeze({ name: "Sighted", points: 1 }),
        Object.freeze({ name: "Known", points: 4 }),
        Object.freeze({ name: "Studied", points: 8 }),
        Object.freeze({ name: "Mastered", points: 14 }),
    ]),
    edge: 1.1,
    sight: 30,
});

/** The last level (Mastered). */
export const MASTERED = RESEARCH.levels.length;

/**
 * What the adventurers' guilds pay for a player's notes on a kind once it's Mastered: gold, and
 * merit (to the registered: core/standing.js earn), more for one met further out (by the least
 * tier it's met at: `perTier` more of each a tier), twice as much for the mightiest (`perilous`).
 */
export const PAY = Object.freeze({ gold: 12, goldPerTier: 6, merit: 2, meritPerTier: 0.5, perilous: 2 });

/** The level `points` of research come to (0: none yet, to MASTERED). */
export const levelAt = (points) => RESEARCH.levels.filter((level) => points >= level.points).length;

/** What the guilds pay for the notes on a kind Mastered: { gold, merit }. */
export function payOf(kind) {
    const spec = CREATURES[kind];
    const tier = spec?.tiers?.[0] ?? 1;
    const times = spec?.perilous ? PAY.perilous : 1;

    return { gold: Math.round((PAY.gold + PAY.goldPerTier * tier) * times), merit: Math.round((PAY.merit + PAY.meritPerTier * tier) * times) };
}

// A count kept: a whole number, none if it isn't one
const whole = (value) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** A player's research into each kind of creature. */
export class Bestiary {
    /** @param {object} [kept] - As toJSON gave it: { [kind]: { points, seen, signs, slain } }. */
    constructor(kept = null) {
        /**
         * Each kind met's research (CREATURES ids): its points, whether one's been seen, and how
         * many signs of it read and how many slain.
         */
        this.kinds = {};

        for (const [kind, entry] of Object.entries(kept && typeof kept === "object" && !Array.isArray(kept) ? kept : {})) {
            if (CREATURES[kind] && entry && typeof entry === "object") {
                this.kinds[kind] = { points: whole(entry.points), seen: entry.seen === true, signs: whole(entry.signs), slain: whole(entry.slain) };
            }
        }
    }

    /** A kind's level (0, none yet, to MASTERED). */
    levelOf(kind) {
        return levelAt(this.kinds[kind]?.points ?? 0);
    }

    /** A kind's research: { points, seen, signs, slain, level } (all nothing for one not met). */
    entry(kind) {
        const entry = this.kinds[kind] ?? { points: 0, seen: false, signs: 0, slain: 0 };

        return { ...entry, level: levelAt(entry.points) };
    }

    /**
     * One of a kind seen for the first time. Returns its level gone up ({ creature, from, to,
     * how: "seen" }), or null (seen before, or not a creature).
     */
    see(kind) {
        if (!CREATURES[kind] || this.kinds[kind]?.seen) {
            return null;
        }

        return this.#grow(kind, RESEARCH.seen, "seen", (entry) => (entry.seen = true));
    }

    /** A sign of a kind read (on a trail: core/tracks.js). Returns its level gone up, or null. */
    read(kind) {
        return CREATURES[kind] ? this.#grow(kind, RESEARCH.sign, "sign", (entry) => entry.signs++) : null;
    }

    /** A wary beast of a kind left be, unfought (core/wary.js MOODS `spared`). Returns its level gone up, or null. */
    spare(kind) {
        return CREATURES[kind] ? this.#grow(kind, RESEARCH.spared, "spared", () => {}) : null;
    }

    /** One of a kind slain (`mighty`: one of the mightiest, RESEARCH). Returns its level gone up, or null. */
    slay(kind, { mighty = false } = {}) {
        return CREATURES[kind] ? this.#grow(kind, mighty ? RESEARCH.mighty : RESEARCH.slain, "slain", (entry) => entry.slain++) : null;
    }

    /** The kinds Mastered (CREATURES ids, in the order they were first met). */
    mastered() {
        return Object.keys(this.kinds).filter((kind) => this.levelOf(kind) >= MASTERED);
    }

    /** What's kept. */
    toJSON() {
        return structuredClone(this.kinds);
    }

    // A kind's research grown by `points` (and its counts, `count`): its level gone up, or null
    #grow(kind, points, how, count) {
        const entry = (this.kinds[kind] ??= { points: 0, seen: false, signs: 0, slain: 0 });
        const from = levelAt(entry.points);

        count(entry);
        entry.points += points;

        const to = levelAt(entry.points);

        return to > from ? { creature: kind, from, to, how } : null;
    }
}
