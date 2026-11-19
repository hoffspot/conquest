// Playout time (generated/multiplayer_scaling_plan.md 3-19): when, of the world's time, a game
// draws those it's told of in frames. Frames come late and unevenly, so they're drawn a little
// behind the world, far enough that the telling after the moment drawn has nearly always come
// and each is drawn between two tellings (core/mirror.js Ring): the world's time is reckoned from
// the frame that came soonest of those lately heard, and the delay from how much later than that
// the rest came.
//
// Pure: no DOM, no network; whoever has it says what the time is.

/**
 * `steps`: how many of the world's steps behind it everyone's drawn, before lateness. `kept`:
 * how many frames' comings the reckoning's from. `late`: the share of them that came no later
 * than the delay allows for. `least` and `most`: the delay's bounds (ms). `slew`: how fast the
 * time drawn may run ahead of or behind the clock to come to where it should be (a share of
 * time passing), so nothing jumps; further off than `jump` (ms), it's set there at once (a page
 * that was hidden).
 */
export const PLAYOUT = Object.freeze({ steps: 2, kept: 40, late: 0.95, least: 100, most: 400, slew: 0.1, jump: 1000 });

export class Playout {
    // How far the world's time was ahead of the clock as each of the latest frames came (ms)
    #leads = [];

    // The time drawn less the clock, as it's applied; and the clock when it last was
    #offset = null;

    #asked = null;

    /** @param {object} [options] - `stepMs`: how long a step of the world is. */
    constructor({ stepMs = 50 } = {}) {
        this.stepMs = stepMs;

        /** How far behind the world it draws (ms), as last reckoned. */
        this.delay = Math.max(PLAYOUT.least, PLAYOUT.steps * stepMs);
    }

    /** A frame's come: it tells of the world as of `time` (ms, the world's), and came at `now` (ms, the clock's). */
    heard(time, now) {
        this.#leads.push(time - now);

        if (this.#leads.length > PLAYOUT.kept) {
            this.#leads.shift();
        }

        // (The soonest come says what time it is there; the rest, how late frames come)
        const sorted = [...this.#leads].sort((a, b) => b - a);
        const late = sorted[0] - sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * PLAYOUT.late))];

        this.delay = Math.max(PLAYOUT.least, Math.min(PLAYOUT.most, PLAYOUT.steps * this.stepMs + late));
        this.#target = sorted[0] - this.delay;
    }

    #target = null;

    /** The world's time to draw at, the clock being at `now` (ms): null till a frame's come. */
    at(now) {
        if (this.#target === null) {
            return null;
        }

        const off = this.#offset === null ? Infinity : Math.abs(this.#target - this.#offset);

        if (off > PLAYOUT.jump) {
            this.#offset = this.#target;
        } else if (off > 0) {
            const most = Math.max(0, now - this.#asked) * PLAYOUT.slew;

            this.#offset += Math.max(-most, Math.min(most, this.#target - this.#offset));
        }

        this.#asked = now;

        return now + this.#offset;
    }
}
