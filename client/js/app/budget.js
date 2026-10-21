// How big an invasion this device can draw (docs/WAR.md *Invasions*): the frames' work watched
// while there's none on, how long each takes to update and draw, and the size it has room for
// (core/invasions.js sizeFor) told to the host whenever it's changed by a tenth or more, as a
// "budget" command (core/host.js: an invasion's as big as the smallest told by the players in its
// town). Pure: the game gives it each frame's timings.

import { sizeFor } from "../core/invasions.js";

/**
 * How it's judged: `warmup` ms of play first (things being got ready make it slow at first),
 * then over the last `window` ms of frames, the middling frame's work; a gap longer than `pause`
 * between frames is the game stopped (judged afresh); and a size told again only once it's
 * changed by `change` of the last told.
 */
export const BUDGET = Object.freeze({ warmup: 5000, window: 10000, pause: 1000, change: 0.1 });

const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)];
};

export class InvasionBudget {
    #frames = [];
    #since = null;

    /** The size last told the host, or null. */
    told = null;

    /**
     * A frame at `now` (ms), `interval` ms after the last, its update and drawing taking `work` ms,
     * on a device of a kind (`device`: world/view.js detectQuality's): the size to tell the host
     * now, or null (nothing new to tell, or not judged yet).
     */
    observe(now, interval, work, device) {
        this.#since ??= now;

        if (interval > BUDGET.pause) {
            this.#frames = [];
            this.#since = now;

            return null;
        }

        if (now - this.#since < BUDGET.warmup) {
            return null;
        }

        this.#frames.push({ now, work });

        while (this.#frames[0].now < now - BUDGET.window) {
            this.#frames.shift();
        }

        if (now - this.#frames[0].now < BUDGET.window * 0.9) {
            return null;
        }

        const size = sizeFor(median(this.#frames.map(({ work: each }) => each)), device);

        if (this.told !== null && Math.abs(size - this.told) < this.told * BUDGET.change) {
            return null;
        }

        this.told = size;

        return size;
    }

    /** Judged afresh from now (an invasion on: its own frames not what's to be measured). */
    hold() {
        this.#frames = [];
        this.#since = null;
    }
}
