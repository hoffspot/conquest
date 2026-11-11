// Keeping the game moving (Game options: Adaptive). The quality the player chose (Visual
// quality) is the most it draws; the game aims at 60 frames a second, and if it falls below 30
// for a few seconds it draws less: fewer pixels first (a step at a time), then the quality level
// below, at every pixel again, and fewer of its; down to the lowest level at half the pixels. When
// it's been back near 60 a while it tries the step above again; one that let it fall below 30 is
// tried again only after a minute, then two, then four... so it doesn't see-saw. A step changes
// nothing that's already drawn but the pixels; a level redraws the far land and the undergrowth.
//
// It's judged against the frames the browser's asking for (the beat: app/frames.js Beat), not
// against 60 whatever the screen: a phone saving its battery asks for 30, and 30 drawn is then all
// there is to draw. Frames the game spent building in aren't judged by (drawing less cures nothing
// of them: frames.js BUILDING). And steps down that bought nothing are put back: an iPhone's slow
// stretches were its building, and it was drawn at 0.7 of Low's pixels for them.

import { BEAT, beatChanged, BUILDING, FrameWindow } from "./frames.js";

/**
 * `warmup`: how long it plays before it's judged at all (ms: things being got ready make it slow
 * at first); `settle`: how long after a step before it's judged again (ms); `window`: how long
 * it's judged over (ms); `floor`: the frames a second it mustn't stay below; `target`: what it
 * aims at, and `near`: how much of that is near enough (a step up then); `up`: how long it must
 * have been near the target before it steps up (ms); `pause`: a gap longer than this between
 * frames (ms) is the game stopped (in the background), not slow; `scales`: the share of the pixels
 * drawn at each step of a level; `lowest`: and at the lowest level, past those; `retry`: how long
 * before a step that fell below the floor is tried again (ms, doubling each time it does);
 * `every`: how often it's judged (ms: the frames are only kept in between); `over`: on a beat
 * slower than 60 a second, too slow only at more than this many beats a frame; `gain`: a step
 * down has bought something once the frames come this much quicker than before it. Stepped down
 * to the last step with nothing bought, the steps are all put back and held there: not tried
 * again till the beat changes, the frames come `worse` times as slowly as they did then, or
 * `retry` has gone by (doubling each time).
 */
export const GOVERNOR = Object.freeze({
    warmup: 5000,
    settle: 4000,
    window: 3000,
    floor: 30,
    target: 60,
    near: 0.9,
    up: 15000,
    pause: 1000,
    scales: Object.freeze([1, 0.85, 0.7]),
    lowest: Object.freeze([0.6, 0.5]),
    retry: 60000,
    every: 250,
    over: 1.3,
    gain: 0.05,
    worse: 1.2,
});

/**
 * The steps down from the quality `ceiling` (a name in `levels`, lowest first): { quality, scale }
 * each, the ceiling at every pixel first.
 */
export function ladder(levels, ceiling) {
    const top = Math.max(0, levels.indexOf(ceiling));
    const steps = [];

    for (let level = top; level >= 0; level--) {
        steps.push(...GOVERNOR.scales.map((scale) => ({ quality: levels[level], scale })));
    }

    return [...steps, ...GOVERNOR.lowest.map((scale) => ({ quality: levels[0], scale }))];
}

export class Governor {
    #frames = new FrameWindow(GOVERNOR.window);
    #looked = -Infinity;
    #since = null;
    #good = null;
    #blocked = new Map();
    #failed = new Map();
    // (Steps down being tried: the step they began at, and how the frames came there)
    #run = null;
    // (Steps down that bought nothing, put back: held where it is; and how many times that's been)
    #held = null;
    #futile = 0;

    /**
     * @param {object} [options]
     * @param {string[]} [options.levels] - The quality levels, lowest first.
     * @param {string} [options.ceiling] - The quality chosen: the most it draws.
     * @param {object} [options.at] - Where a game before left it ({ quality, scale }), to carry on
     *     from there.
     */
    constructor({ levels = ["low", "medium", "high"], ceiling = levels.at(-1), at = null } = {}) {
        this.levels = levels;
        this.ceiling = ceiling;
        this.steps = ladder(levels, ceiling);
        /** Which step it's at (0: the quality chosen, every pixel). */
        this.step = Math.max(0, at ? this.steps.findIndex(({ quality, scale }) => quality === at.quality && scale === at.scale) : 0);
    }

    /** Where it's at: the quality level drawn, and the share of its pixels ({ quality, scale }). */
    get rung() {
        return this.steps[this.step];
    }

    /** The share of the pixels drawn (1: all of them). */
    get scale() {
        return this.rung.scale;
    }

    /** The quality level drawn. */
    get quality() {
        return this.rung.quality;
    }

    /** The quality chosen: back to it, at every pixel, if it's changed. */
    setCeiling(ceiling) {
        if (ceiling !== this.ceiling) {
            this.ceiling = ceiling;
            this.steps = ladder(this.levels, ceiling);
            this.reset();
        }
    }

    /**
     * A frame drawn at `now` (ms), `interval` ms after the last, on a `beat` (ms a frame the
     * browser's asking for: frames.js Beat), the frame before it having spent `built` ms building
     * (app/game.js #visit): where it's to be drawn from now on ({ quality, scale }) if that's to
     * change, or null.
     */
    observe(now, interval, { beat = BEAT.least, built = 0 } = {}) {
        this.#since ??= now;

        // (The game stopped a while: judged afresh)
        if (interval > GOVERNOR.pause) {
            this.#frames.clear();
            this.#good = null;

            return null;
        }

        if (now - this.#since < GOVERNOR.warmup) {
            return null;
        }

        // (A frame that went to building isn't judged by: kept, as one that says nothing)
        this.#frames.push(now, built > beat * BUILDING ? NaN : interval);

        // (Judged a few times a second: nothing's worked out in between)
        if (now - this.#looked < GOVERNOR.every) {
            return null;
        }

        this.#looked = now;

        // (A whole window of frames: none dropped at the start of it)
        if (this.#frames.length < 2 || now - this.#frames.first < GOVERNOR.window * 0.9) {
            return null;
        }

        const typical = this.#frames.median();

        // (Most of them went to building: nothing to judge by)
        if (Number.isNaN(typical)) {
            return null;
        }

        // Below the floor (on a slower beat, well behind it): a step down
        if (typical > Math.max(1000 / GOVERNOR.floor, beat * GOVERNOR.over)) {
            const last = this.steps.length - 1;
            const run = this.#run;
            const bought = !run || typical <= run.typical * (1 - GOVERNOR.gain);

            this.#good = null;

            // (Every step there is tried, and the frames no quicker than where they began: what's
            // slow isn't what's drawn. A step alone isn't judged so: on a screen that shows a
            // frame late or not at all, the frames come no quicker till enough's been taken away.)
            if (!bought && this.step >= last) {
                return this.#putBack(now, beat);
            }

            if (this.step >= last || this.#holding(now, typical, beat)) {
                return null;
            }

            // (The step it was at let it, so it's tried again later)
            const failed = (this.#failed.get(this.step) ?? 0) + 1;

            this.#failed.set(this.step, failed);
            this.#blocked.set(this.step, now + GOVERNOR.retry * 2 ** (failed - 1));

            const trying = bought ? { from: this.step, typical, beat } : run;
            const rung = this.#move(now, this.step + 1);

            this.#run = trying;

            return rung;
        }

        // (Not too slow where the steps tried left it: they stand. Unless it's the beat that's
        // slowed since they began, the browser asking for fewer frames, a phone set to save its
        // battery: they answered a slowness that wasn't one, and are put back)
        if (this.#run && beat > this.#run.beat && beatChanged(beat, this.#run.beat)) {
            return this.#putBack(now, beat);
        }

        this.#run = null;

        // Near the target a while: a step up, unless that step fell below the floor lately
        if (typical <= beat / GOVERNOR.near) {
            this.#good ??= now;
        } else {
            this.#good = null;
        }

        if (this.step > 0 && this.#good !== null && now - this.#good >= GOVERNOR.up && now >= (this.#blocked.get(this.step - 1) ?? 0)) {
            return this.#move(now, this.step - 1);
        }

        return null;
    }

    // Held where it is, steps down having bought nothing (#putBack)? Till the beat changes (and
    // nothing's held against the new one), the frames come a good deal slower than they did then,
    // or it's time to try again
    #holding(now, typical, beat) {
        const held = this.#held;

        if (!held) {
            return false;
        }

        if (beatChanged(beat, held.beat)) {
            this.#futile = 0;
        } else if (typical <= held.typical * GOVERNOR.worse && now < held.until) {
            return true;
        }

        this.#held = null;

        return false;
    }

    // The steps down just tried put back (they bought nothing: what's slow isn't what's drawn),
    // and held there; none of them held against being stepped up to, as one that failed is
    #putBack(now, beat) {
        const { from, typical } = this.#run;

        for (let step = from; step < this.step; step++) {
            const failed = (this.#failed.get(step) ?? 1) - 1;

            this.#blocked.delete(step);

            if (failed > 0) {
                this.#failed.set(step, failed);
            } else {
                this.#failed.delete(step);
            }
        }

        const rung = this.#move(now, from);

        this.#futile++;
        this.#held = { beat, typical, until: now + GOVERNOR.retry * 2 ** (this.#futile - 1) };

        return rung;
    }

    // To a step: judged again only once it's settled there
    #move(now, step) {
        this.step = step;
        this.#frames.clear();
        this.#good = null;
        this.#run = null;
        this.#held = null;
        this.#since = now - GOVERNOR.warmup + GOVERNOR.settle;

        return this.rung;
    }

    /**
     * Something else changed what's drawn at `now` (ms: more drawn in crowds, app/throng.js): judged
     * again only once that's settled, where it is.
     */
    hold(now) {
        this.#frames.clear();
        this.#good = null;
        this.#run = null;
        this.#since = Math.max(this.#since ?? now, now - GOVERNOR.warmup + GOVERNOR.settle);
    }

    /** Start again at the quality chosen, every pixel, nothing held against any step. */
    reset() {
        this.step = 0;
        this.#frames.clear();
        this.#looked = -Infinity;
        this.#good = null;
        this.#since = null;
        this.#blocked.clear();
        this.#failed.clear();
        this.#run = null;
        this.#held = null;
        this.#futile = 0;
    }
}
