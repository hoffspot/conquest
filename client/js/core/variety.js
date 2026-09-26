// Variety: choosing one of a few ways of doing something (one of an attack's animations, a
// fireball's look) at random, but never the same way twice in a row.
//
// The first time, any of them; after that, any but the last one chosen.

/**
 * One of `count` choices (0 to count - 1) at random, never `previous` (when there's another to
 * choose). `random` gives numbers from 0 up to 1.
 */
export function pickAnother(count, previous = null, random = Math.random) {
    if (count <= 1) {
        return 0;
    }

    if (previous === null || previous < 0 || previous >= count) {
        return Math.min(count - 1, Math.floor(random() * count));
    }

    const pick = Math.min(count - 2, Math.floor(random() * (count - 1)));

    return pick >= previous ? pick + 1 : pick;
}

/** Remembers the last choice made for each kind of thing (by key), to choose another next time. */
export class Variety {
    constructor(random = Math.random) {
        this.random = random;
        this.last = new Map();
    }

    /** One of `count` ways of doing `key`, never the one chosen for it last time. */
    next(key, count) {
        const pick = pickAnother(count, this.last.get(key) ?? null, this.random);

        this.last.set(key, pick);

        return pick;
    }
}
