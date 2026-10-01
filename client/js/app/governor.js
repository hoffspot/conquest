// Keeping the game moving (Game options: Adaptive). The quality the player chose (Visual
// quality) is the most it draws; the game aims at 60 frames a second, and if it falls below 30
// for a few seconds it draws less: fewer pixels first (a step at a time), then the quality level
// below, at every pixel again, and fewer of its; down to the lowest level at half the pixels. When
// it's been back near 60 a while it tries the step above again; one that let it fall below 30 is
// tried again only after a minute, then two, then four... so it doesn't see-saw. A step changes
// nothing that's already drawn but the pixels; a level redraws the far land and the undergrowth.

/**
 * `warmup`: how long it plays before it's judged at all (ms: things being got ready make it slow
 * at first); `settle`: how long after a step before it's judged again (ms); `window`: how long
 * it's judged over (ms); `floor`: the frames a second it mustn't stay below; `target`: what it
 * aims at, and `near`: how much of that is near enough (a step up then); `up`: how long it must
 * have been near the target before it steps up (ms); `pause`: a gap longer than this between
 * frames (ms) is the game stopped (in the background), not slow; `scales`: the share of the pixels
 * drawn at each step of a level; `lowest`: and at the lowest level, past those; `retry`: how long
 * before a step that fell below the floor is tried again (ms, doubling each time it does).
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
});

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)];
};

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
    #frames = [];
    #since = null;
    #good = null;
    #blocked = new Map();
    #failed = new Map();

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
     * A frame drawn at `now` (ms), `interval` ms after the last: where it's to be drawn from now
     * on ({ quality, scale }) if that's to change, or null.
     */
    observe(now, interval) {
        this.#since ??= now;

        // (The game stopped a while: judged afresh)
        if (interval > GOVERNOR.pause) {
            this.#frames = [];
            this.#good = null;

            return null;
        }

        if (now - this.#since < GOVERNOR.warmup) {
            return null;
        }

        this.#frames.push({ now, interval });

        while (this.#frames[0].now < now - GOVERNOR.window) {
            this.#frames.shift();
        }

        // (A whole window of frames: none dropped at the start of it)
        if (this.#frames.length < 2 || now - this.#frames[0].now < GOVERNOR.window * 0.9) {
            return null;
        }

        const typical = median(this.#frames.map(({ interval }) => interval));

        // Below the floor: a step down (and the step it was at let it, so it's tried again later)
        if (typical > 1000 / GOVERNOR.floor && this.step < this.steps.length - 1) {
            const failed = (this.#failed.get(this.step) ?? 0) + 1;

            this.#failed.set(this.step, failed);
            this.#blocked.set(this.step, now + GOVERNOR.retry * 2 ** (failed - 1));

            return this.#move(now, this.step + 1);
        }

        // Near the target a while: a step up, unless that step fell below the floor lately
        if (typical <= 1000 / (GOVERNOR.target * GOVERNOR.near)) {
            this.#good ??= now;
        } else {
            this.#good = null;
        }

        if (this.step > 0 && this.#good !== null && now - this.#good >= GOVERNOR.up && now >= (this.#blocked.get(this.step - 1) ?? 0)) {
            return this.#move(now, this.step - 1);
        }

        return null;
    }

    // To a step: judged again only once it's settled there
    #move(now, step) {
        this.step = step;
        this.#frames = [];
        this.#good = null;
        this.#since = now - GOVERNOR.warmup + GOVERNOR.settle;

        return this.rung;
    }

    /** Start again at the quality chosen, every pixel, nothing held against any step. */
    reset() {
        this.step = 0;
        this.#frames = [];
        this.#good = null;
        this.#since = null;
        this.#blocked.clear();
        this.#failed.clear();
    }
}
