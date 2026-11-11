// The memory guard (app/game.js #memoryGuarding): on a touch screen (a phone or a tablet), what the
// game holds is looked at every so often, as Safari's debug log tells it (game.js memoryNow: the
// graphics card's, the sound's, the way-finding's, and the bodies' and the buildings' floors'
// copies on the page; not the page's heap, which only some browsers tell of, whatever the browser),
// and past a mark it holds less: fewer bodies in full (the rest drawn in their crowds, the furthest
// first: game.js #rationing, #folkRoom, #marshal), less of the sound kept decoded (audio/sound.js
// squeeze), and the beasts' bodies and models none's drawn from let go of at once, not after a
// while. Once it's well under the mark again for a while, it holds as much as before.
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
    bodies: Object.freeze([Infinity, 20, 12]),
    sound: Object.freeze([null, 24 * 1024 * 1024, 12 * 1024 * 1024]),
});

/**
 * The memory guard's level after looking at what's held (`totalMB`), from where it was (`level`,
 * since `since`, seconds), `now` (seconds): up at once to the highest whose mark it's past; down a
 * level once it's `ease` under that level's mark and has been at it `hold` seconds. Returns
 * { level, since } (since: when it came to it).
 */
export function guardLevel(totalMB, { level = 0, since = 0, now = 0, guard = MEMORY_GUARD } = {}) {
    const up = guard.marks.filter((mark) => totalMB >= mark).length;

    if (up > level) {
        return { level: up, since: now };
    }

    if (level > 0 && totalMB < guard.marks[level - 1] - guard.ease && now - since >= guard.hold) {
        return { level: level - 1, since: now };
    }

    return { level, since };
}
