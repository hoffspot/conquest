// The memory guard (app/game.js #memoryGuarding): on a touch screen (a phone or a tablet), what the
// game holds is looked at every so often, as Safari's debug log tells it (game.js memoryNow: the
// graphics card's, the sound's, the way-finding's, and the bodies' and the buildings' floors'
// copies on the page; not the page's heap, which only some browsers tell of, whatever the browser),
// and past a mark it holds less: fewer bodies in full (the rest drawn in their crowds, the furthest
// first: game.js #rationing, #folkRoom, #marshal), less of the sound kept decoded (audio/sound.js
// squeeze), and the beasts' bodies and models none's drawn from let go of at once, not after a
// while. Once it's well under the mark again for a while, it holds as much as before; a while that
// doubles each time holding as much as before takes it straight back past the mark.
//
// Safari on an iPhone closes a page that holds too much with no warning, and tells it nothing of
// its memory: two players' crash reports of 2026-11-11 had it let the game's tab go at 541 MB
// (in a human city: 30 bodies about, the sound 82 MB) and 551 MB (out in the cat folk's wilds: 98
// beasts and people about, after 575), the same mark as a city's smithy's 537 MB on 2026-10-27.

/**
 * How the memory guard holds the game to a phone's memory:
 *  - `every`: how often what's held is looked at (seconds);
 *  - `marks`: what's held (MB, as memoryNow's `totalMB` without a heap: Safari's) past which it holds less, a level for
 *    each (1, then 2);
 *  - `ease`, `hold`: back down a level once it's this much (MB) under that level's mark, and has
 *    been at it this long (seconds), so it isn't let go and taken up again and again;
 *  - `again`, `forget`: holding less itself takes what's held well under the mark (the sound alone
 *    goes from 82 MB to 24, a body's 10 to 15), so it came down, built and decoded it all again,
 *    passed the mark and went up, every 40 to 90 seconds in a busy place. So a level come to within
 *    `again` seconds of coming down doubles the wait before it comes down from then on (30
 *    seconds, a minute, two... `forget` at most), forgotten once it's held as much as ever for
 *    `forget` seconds;
 *  - `bodies`: how many bodies held in full at each level at most (as QUALITY's `bodies`, never
 *    more than it);
 *  - `sound`: how much of the recorded sounds kept decoded at each level at most (bytes: sound.js
 *    DECODED_BUDGET; null, as it was).
 */
export const MEMORY_GUARD = Object.freeze({
    every: 2,
    marks: Object.freeze([400, 460]),
    ease: 40,
    hold: 30,
    again: 120,
    forget: 600,
    bodies: Object.freeze([Infinity, 20, 12]),
    sound: Object.freeze([null, 24 * 1024 * 1024, 12 * 1024 * 1024]),
});

/**
 * The memory guard's level after looking at what's held (`totalMB`), from where it was (`level`,
 * since `since`, seconds; `wait`: how long it stays at a level before coming down, seconds; `left`:
 * when it last came down, or null), `now` (seconds): up at once to the highest whose mark it's
 * past, the wait doubled if it came down less than `again` seconds ago; down a level once it's
 * `ease` under that level's mark and has been at it `wait` seconds; the wait as it began once it's
 * been at no level for `forget` seconds. Returns { level, since, wait, left } (since: when it came
 * to the level).
 */
export function guardLevel(totalMB, { level = 0, since = 0, now = 0, guard = MEMORY_GUARD, wait = guard.hold, left = null } = {}) {
    const up = guard.marks.filter((mark) => totalMB >= mark).length;

    if (up > level) {
        const soon = left !== null && now - left < guard.again;

        return { level: up, since: now, wait: soon ? Math.min(wait * 2, guard.forget) : wait, left };
    }

    if (level > 0 && totalMB < guard.marks[level - 1] - guard.ease && now - since >= wait) {
        return { level: level - 1, since: now, wait, left: now };
    }

    if (level === 0 && wait !== guard.hold && now - since >= guard.forget) {
        return { level, since, wait: guard.hold, left: null };
    }

    return { level, since, wait, left };
}

/**
 * The guard itself: its level, kept from look to look, and what's done as it changes.
 *  - `onLevel(level, was)`: the level's changed (the game: the sound squeezed or let be, the
 *    bodies' budget as the level has it);
 *  - `letGo(level)`: it's gone up a level, so everything held that nothing's using is to be let go
 *    of at once, not after a while (the game: the beasts' bodies and models none's drawn from, and
 *    the character kit's idle caches).
 */
export class MemoryGuard {
    /** Its level (0: holding as much as ever), since when (seconds), the wait before it comes down, and when it last did. */
    level = 0;
    since = 0;
    wait;
    left = null;

    constructor({ guard = MEMORY_GUARD, onLevel = () => {}, letGo = () => {} } = {}) {
        this.guard = guard;
        this.wait = guard.hold;
        this.onLevel = onLevel;
        this.letGo = letGo;
    }

    /** What's held (`totalMB`) looked at, `now` (seconds): the level it's at from now, whoever's to act on a change told. */
    look(totalMB, now) {
        const was = this.level;
        const { level, since, wait, left } = guardLevel(totalMB, { level: was, since: this.since, now, guard: this.guard, wait: this.wait, left: this.left });

        this.level = level;
        this.since = since;
        this.wait = wait;
        this.left = left;

        if (level !== was) {
            this.onLevel(level, was);
        }

        if (level > was) {
            this.letGo(level);
        }

        return level;
    }
}
