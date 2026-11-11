// The frame's jobs done a couple of times a second (app/game.js #update: the fortifications near
// drawn, the soldiers marshalled, the bodies' budget, who's shut in, the folk's room, the throng,
// the boss's bar, what's heard, the criers, sizing up, the doors): each on a clock of its own, a
// number of seconds till it's next due (0 or less: now).
//
// They all began at 0 and were all set back to the same half second by the same arithmetic, so
// they were all due in the same frame for ever: one frame in thirty carried all of them, each a
// few passes over everyone about, and a third of the time that frame stepped the battle too (2 ms
// on a computer and 10 on a phone with a fight in it). So each has its own share of the time
// (`offset`: a different twentieth of a second into each half), kept to whenever it's done, and
// one that comes due on a frame that stepped waits for the next.

/** A clock's turn this frame: not yet; due on a frame that stepped the battle, so put off to the next; or due. */
export const WAIT = 0;
export const PUT_OFF = 1;
export const DUE = 2;

/**
 * A clock's turn: `left` seconds it had till it's due (0 or less: it's been asked for now, and
 * is never put off), `dt` seconds on, on a frame that `stepped` the battle or didn't.
 */
export function clockTurn(left, dt, stepped) {
    if (left - dt > 0) {
        return WAIT;
    }

    return stepped && left > 0 ? PUT_OFF : DUE;
}

/**
 * How long (seconds) from `now` till a job done every `every` seconds is next due, `offset`
 * seconds into each of them: its own share of the time, so two jobs with different offsets don't
 * come due together, however late either was done. Never sooner than half of `every`.
 */
export function nextSlot(now, every, offset = 0) {
    const since = (((now - offset) % every) + every) % every;
    const left = every - since;

    return left < every / 2 ? left + every : left;
}
