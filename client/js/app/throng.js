// Keeping a crowded fight moving (Game options: Adaptive, before app/governor.js draws less of
// everything): with many bodies about (hired adventurers, the wild's people-shaped creatures), when
// the frames come too slowly, those least seen of them are drawn in their kind's crowd (world/crowd.js:
// one figure for everyone of a kind, posed on the graphics card from moves recorded once) a few at
// a time, and drawn in full again, a few at a time, once there's time to spare a while. One drawn in
// full again that made it too slow is tried again only after a while, then twice as long, and so on,
// so it doesn't see-saw. How many are drawn in full is all this says (app/game.js #thronging says
// which, the biggest on the screen and those fighting the player first).
//
// Judged as the governor is: against the frames the browser's asking for (the beat: app/frames.js
// Beat; fed a steady 30, a phone saving its battery, it used to leave 6 in full for good), never by
// the frames the game spent building in (frames.js BUILDING), and those put in the crowds for
// nothing are drawn in full again.

import { BEAT, beatChanged, BUILDING, FrameWindow } from "./frames.js";

/**
 * `keep`: never fewer drawn in full than this; `from`: it acts only with more than this many about
 * that could be in a crowd; `step`: how many more in the crowds at a time, `back`: how many fewer;
 * `slow`: the frames a second under which (the middle of a `window`, ms) it's too slow, of `target`
 * (on a slower beat, as much slower: 24 of 30); `fast`: the share of `target` frames a second over
 * which there's time to spare, and `up`: how long (ms) there has to have been before any are drawn
 * in full again; `settle`: how long after a change before it's judged again (ms); `pause`: a gap
 * between frames longer than this (ms) is the game stopped, not slow; `retry`: how long (ms,
 * doubling each time) before more are drawn in full again after doing so made it too slow; `every`:
 * how often it's judged (ms: the frames are only kept in between); `gain`: more in the crowds have
 * bought something once the frames come this much quicker than before. With as many in the crowds
 * as can be and nothing bought, they're all drawn in full again and left so: till the beat changes,
 * the frames come `worse` times as slowly as they did then, or `retry` has gone by (doubling each
 * time).
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
    every: 250,
    gain: 0.05,
    worse: 1.2,
});

export class Throng {
    #frames = new FrameWindow(THRONG.window);
    #looked = -Infinity;
    #from = null;
    #good = null;
    #raised = null;
    #blocked = 0;
    #failed = 0;
    // (More being put in the crowds: how many were in full before, and how the frames came then)
    #run = null;
    // (Those put in the crowds for nothing, drawn in full again: left so; and how many times)
    #held = null;
    #futile = 0;

    /** How many of those that could be in a crowd are drawn in full (Infinity: all of them). */
    full = Infinity;

    /**
     * A frame drawn at `now` (ms), `interval` ms after the last, with `crowdable` about that could be
     * in a crowd and `inFull` of them drawn in full, on a `beat` (ms a frame the browser's asking
     * for: frames.js Beat), the frame before it having spent `built` ms building (app/game.js
     * #visit): how many are to be drawn in full from now on, if that's to change (else null).
     */
    observe(now, interval, { crowdable, inFull, beat = BEAT.least, built = 0 }) {
        // (The game stopped a while: judged afresh)
        if (interval > THRONG.pause) {
            this.#frames.clear();
            this.#good = null;

            return null;
        }

        // (Too few about to be worth it: all in full again)
        if (crowdable <= THRONG.keep && this.full !== Infinity) {
            return this.#change(now, Infinity);
        }

        this.#from ??= now;
        // (A frame that went to building isn't judged by: kept, as one that says nothing)
        this.#frames.push(now, built > beat * BUILDING ? NaN : interval);

        const more = crowdable > THRONG.from && inFull > THRONG.keep;

        // (Nothing could come of it: no more to put in the crowds, none to bring back. And judged
        // a few times a second: nothing's worked out in between)
        if ((!more && this.full === Infinity && !this.#run) || now - this.#looked < THRONG.every) {
            return null;
        }

        this.#looked = now;

        // (A whole window of frames since it last changed)
        if (now - this.#from < THRONG.window * 0.9 || this.#frames.length < 2) {
            return null;
        }

        const typical = this.#frames.median();

        // (Most of them went to building: nothing to judge by)
        if (Number.isNaN(typical)) {
            return null;
        }

        if (typical > (beat * THRONG.target) / THRONG.slow) {
            const run = this.#run;
            const bought = !run || typical <= run.typical * (1 - THRONG.gain);

            this.#good = null;

            // (As many in the crowds as can be, and the frames no quicker than before any were:
            // what's slow isn't the bodies. A few more alone aren't judged so: on a screen that
            // shows a frame late or not at all, the frames come no quicker till enough are.)
            if (!bought && !more) {
                return this.#putBack(now, beat);
            }

            if (!more || this.#holding(now, typical, beat)) {
                return null;
            }

            // Too slow: more in the crowds; straight after fewer were, as many as came out of them
            // (and not fewer again for a while)
            const raised = this.#raised !== null && now - this.#raised < THRONG.settle + THRONG.window * 2;

            if (raised) {
                this.#failed++;
                this.#blocked = now + THRONG.retry * 2 ** (this.#failed - 1);
            }

            this.#raised = null;

            const trying = raised ? null : bought ? { full: this.full, typical, beat } : run;
            const full = this.#change(now, Math.max(THRONG.keep, Math.min(this.full, inFull) - (raised ? THRONG.back : THRONG.step)));

            this.#run = trying;

            return full;
        }

        // (Not too slow with those in the crowds that are: they stay. Unless it's the beat that's
        // slowed since the first went in, the browser asking for fewer frames, a phone set to save
        // its battery: they answered a slowness that wasn't one, and are drawn in full again)
        if (this.#run && beat > this.#run.beat && beatChanged(beat, this.#run.beat)) {
            return this.#putBack(now, beat);
        }

        this.#run = null;
        this.#good = typical <= beat / THRONG.fast ? (this.#good ?? now) : null;

        // Time to spare a while: fewer in the crowds
        if (this.full !== Infinity && this.#good !== null && now - this.#good >= THRONG.up && now >= this.#blocked) {
            const full = this.full + THRONG.back;

            this.#raised = now;

            return this.#change(now, full >= crowdable ? Infinity : full);
        }

        return null;
    }

    // Left as it is, more in the crowds having bought nothing (#putBack)? Till the beat changes
    // (and nothing's held against the new one), the frames come a good deal slower than they did
    // then, or it's time to try again
    #holding(now, typical, beat) {
        const held = this.#held;

        if (!held) {
            return false;
        }

        if (beatChanged(beat, held.beat)) {
            this.#futile = 0;
        } else if (typical <= held.typical * THRONG.worse && now < held.until) {
            return true;
        }

        this.#held = null;

        return false;
    }

    // Those just put in the crowds drawn in full again (it bought nothing: what's slow isn't the
    // bodies), and left so
    #putBack(now, beat) {
        const { full, typical } = this.#run;

        this.#change(now, full);
        this.#futile++;
        this.#held = { beat, typical, until: now + THRONG.retry * 2 ** (this.#futile - 1) };

        return full;
    }

    // How many are drawn in full from now (judged again once it's settled)
    #change(now, full) {
        this.full = full;
        this.#frames.clear();
        this.#good = null;
        this.#run = null;
        this.#held = null;
        this.#from = now + THRONG.settle;

        return full;
    }

    /** All drawn in full again, nothing held against drawing more so. */
    reset() {
        this.full = Infinity;
        this.#frames.clear();
        this.#looked = -Infinity;
        this.#from = null;
        this.#good = null;
        this.#raised = null;
        this.#blocked = 0;
        this.#failed = 0;
        this.#run = null;
        this.#held = null;
        this.#futile = 0;
    }
}
