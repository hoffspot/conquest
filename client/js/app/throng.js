// Keeping a crowded fight moving (Game options: Adaptive, before app/governor.js draws less of
// everything): with many bodies about (hired adventurers, the wild's people-shaped creatures), when
// the frames come too slowly, those least seen of them are drawn in their kind's crowd (world/crowd.js:
// one figure for everyone of a kind, posed on the graphics card from moves recorded once) a few at
// a time, and drawn in full again, a few at a time, once there's time to spare a while. One drawn in
// full again that made it too slow is tried again only after a while, then twice as long, and so on,
// so it doesn't see-saw. How many are drawn in full is all this says (app/game.js #thronging says
// which, the biggest on the screen and those fighting the player first).

/**
 * `keep`: never fewer drawn in full than this; `from`: it acts only with more than this many about
 * that could be in a crowd; `step`: how many more in the crowds at a time, `back`: how many fewer;
 * `slow`: the frames a second under which (the middle of a `window`, ms) it's too slow; `fast`: the
 * share of `target` frames a second over which there's time to spare, and `up`: how long (ms) there
 * has to have been before any are drawn in full again; `settle`: how long after a change before it's
 * judged again (ms); `pause`: a gap between frames longer than this (ms) is the game stopped, not
 * slow; `retry`: how long (ms, doubling each time) before more are drawn in full again after doing so
 * made it too slow.
 */
export const THRONG = Object.freeze({
    keep: 6,
    from: 10,
    step: 4,
    back: 2,
    slow: 48,
    target: 60,
    fast: 0.9,
    window: 1500,
    settle: 1500,
    up: 6000,
    pause: 1000,
    retry: 20000,
});

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export class Throng {
    #frames = [];
    #from = null;
    #good = null;
    #raised = null;
    #blocked = 0;
    #failed = 0;

    /** How many of those that could be in a crowd are drawn in full (Infinity: all of them). */
    full = Infinity;

    /**
     * A frame drawn at `now` (ms), `interval` ms after the last, with `crowdable` about that could be
     * in a crowd and `inFull` of them drawn in full: how many are to be drawn in full from now on, if
     * that's to change (else null).
     */
    observe(now, interval, { crowdable, inFull }) {
        // (The game stopped a while: judged afresh)
        if (interval > THRONG.pause) {
            this.#frames = [];
            this.#good = null;

            return null;
        }

        // (Too few about to be worth it: all in full again)
        if (crowdable <= THRONG.keep && this.full !== Infinity) {
            return this.#change(now, Infinity);
        }

        this.#from ??= now;
        this.#frames.push({ now, interval });

        while (this.#frames[0].now < now - THRONG.window) {
            this.#frames.shift();
        }

        // (A whole window of frames since it last changed)
        if (now - this.#from < THRONG.window * 0.9 || this.#frames.length < 2) {
            return null;
        }

        const typical = median(this.#frames.map(({ interval }) => interval));

        // Too slow: more in the crowds; straight after fewer were, as many as came out of them (and
        // not fewer again for a while)
        if (typical > 1000 / THRONG.slow && crowdable > THRONG.from && inFull > THRONG.keep) {
            const raised = this.#raised !== null && now - this.#raised < THRONG.settle + THRONG.window * 2;

            if (raised) {
                this.#failed++;
                this.#blocked = now + THRONG.retry * 2 ** (this.#failed - 1);
            }

            this.#raised = null;

            return this.#change(now, Math.max(THRONG.keep, Math.min(this.full, inFull) - (raised ? THRONG.back : THRONG.step)));
        }

        this.#good = typical <= 1000 / (THRONG.target * THRONG.fast) ? (this.#good ?? now) : null;

        // Time to spare a while: fewer in the crowds
        if (this.full !== Infinity && this.#good !== null && now - this.#good >= THRONG.up && now >= this.#blocked) {
            const full = this.full + THRONG.back;

            this.#raised = now;

            return this.#change(now, full >= crowdable ? Infinity : full);
        }

        return null;
    }

    // How many are drawn in full from now (judged again once it's settled)
    #change(now, full) {
        this.full = full;
        this.#frames = [];
        this.#good = null;
        this.#from = now + THRONG.settle;

        return full;
    }

    /** All drawn in full again, nothing held against drawing more so. */
    reset() {
        this.full = Infinity;
        this.#frames = [];
        this.#from = null;
        this.#good = null;
        this.#raised = null;
        this.#blocked = 0;
        this.#failed = 0;
    }
}
