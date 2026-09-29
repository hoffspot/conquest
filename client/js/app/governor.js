// Drawing fewer pixels when a device can't keep up. The quality level is a guess made from what
// the browser says of the device (world/view.js detectQuality), and some say little: Safari tells
// nothing of a phone's memory, so every iPhone with more than four cores is taken for a medium
// one however old it is. Played, a device shows what it can do: one whose frames keep coming late
// while the page's own work is well within the time (so it's the drawing that's slow, and fewer
// pixels will help) draws a step smaller, twice at most, and stays so for the rest of the game.
// Only for a quality level left to the game ("auto").

/**
 * `warmup`: how long it plays before it's judged (ms: things being got ready make it slower at
 * first); `window`: how long it's judged over (ms), again after each step; late: its frames come
 * on average (the median) more than `late` times the rate's time apart (the quality level's rate,
 * or 60 a second); busy: the page's own work each frame (updating and drawing, on the CPU) more
 * than `busy` times the rate's time; `steps`: how much of the pixels drawn, each step down.
 */
export const GOVERNOR = Object.freeze({ warmup: 5000, window: 3000, late: 1.25, busy: 0.6, steps: Object.freeze([1, 0.85, 0.7]) });

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)];
};

export class Governor {
    #frames = [];
    #since = null;

    /** @param {number} [step] - How far down it's stepped already (GOVERNOR.steps: a game before). */
    constructor(step = 0) {
        /** How far down it's stepped (GOVERNOR.steps). */
        this.step = Math.max(0, step);
    }

    /** How much of the pixels to draw (1: all of them). */
    get scale() {
        return GOVERNOR.steps[this.step];
    }

    /**
     * A frame drawn at `now` (ms), `interval` ms after the last, the page's own work for it `busy`
     * ms, at no more than `rate` frames a second (0: as the screen refreshes): the scale to draw at
     * from now on if it's to change, or null.
     */
    observe(now, interval, busy, rate) {
        this.#since ??= now;

        if (now - this.#since < GOVERNOR.warmup || this.step === GOVERNOR.steps.length - 1) {
            return null;
        }

        this.#frames.push({ now, interval, busy });

        while (this.#frames[0].now < now - GOVERNOR.window) {
            this.#frames.shift();
        }

        // (A whole window of frames: none dropped at the start of it, the game stopped a while)
        if (this.#frames.length < 2 || now - this.#frames[0].now < GOVERNOR.window * 0.9) {
            return null;
        }

        const time = 1000 / (rate || 60);
        const late = median(this.#frames.map(({ interval }) => interval)) > GOVERNOR.late * time;
        const drawing = median(this.#frames.map(({ busy }) => busy)) < GOVERNOR.busy * time;

        if (!late || !drawing) {
            return null;
        }

        // (A step down, then another whole window at it before it's judged again)
        this.step++;
        this.#frames = [];
        this.#since = now - GOVERNOR.warmup;

        return this.scale;
    }

    /** Start again at every pixel (the quality level changed). */
    reset() {
        this.step = 0;
        this.#frames = [];
        this.#since = null;
    }
}
