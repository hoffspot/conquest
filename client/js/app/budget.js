// How big an invasion this device can draw (docs/WAR.md *Invasions*): the frames' work watched
// while there's none on, how long each takes to update and draw, and the size it has room for
// (core/invasions.js sizeFor) told to the host whenever it's changed by a tenth or more, as a
// "budget" command (core/host.js: an invasion's as big as the smallest told by the players in its
// town). Pure: the game gives it each frame's timings.
//
// A frame's work is the processor's alone: it ends when the drawing's been handed over, not when
// the picture's made. So a device kept back by its graphics, its frames coming late or the game
// already drawing less to keep up (app/governor.js), is told the least, whatever its work says: a
// bigger invasion would only take more of the picture away.

import { SIZE, sizeFor } from "../core/invasions.js";
import { BEAT, FrameWindow } from "./frames.js";

/**
 * How it's judged: `warmup` ms of play first (things being got ready make it slow at first),
 * then over the last `window` ms of frames, the middling frame's work, looked at every `every`
 * ms; a gap longer than `pause` between frames is the game stopped (judged afresh); a size told
 * again only once it's changed by `change` of the last told; and the least told while the
 * middling frame comes more than `behind` beats after the one before (frames.js Beat).
 */
export const BUDGET = Object.freeze({ warmup: 5000, window: 10000, pause: 1000, change: 0.1, every: 500, behind: 1.2 });

export class InvasionBudget {
    #work = new FrameWindow(BUDGET.window);
    #intervals = new FrameWindow(BUDGET.window);
    #looked = -Infinity;
    #since = null;

    /** The size last told the host, or null. */
    told = null;

    /**
     * A frame at `now` (ms), `interval` ms after the last, its update and drawing taking `work` ms,
     * on a device of a kind (`device`: world/view.js detectQuality's); `beat`: how often the
     * browser's asking for frames (ms a frame: frames.js Beat), and `step`: how many steps below
     * the quality chosen the game's drawing to keep up (Governor.step; 0, at it). Returns the size
     * to tell the host now, or null (nothing new to tell, or not judged yet).
     */
    observe(now, interval, work, device, { beat = BEAT.least, step = 0 } = {}) {
        this.#since ??= now;

        if (interval > BUDGET.pause) {
            this.#work.clear();
            this.#intervals.clear();
            this.#since = now;

            return null;
        }

        if (now - this.#since < BUDGET.warmup) {
            return null;
        }

        this.#work.push(now, work);
        this.#intervals.push(now, interval);

        if (now - this.#looked < BUDGET.every || now - this.#work.first < BUDGET.window * 0.9) {
            return null;
        }

        this.#looked = now;

        // (Kept back by more than its own work: its graphics, most likely)
        const behind = step > 0 || this.#intervals.median() > beat * BUDGET.behind;
        const size = behind ? SIZE.least : sizeFor(this.#work.median(), device);

        if (this.told !== null && Math.abs(size - this.told) < this.told * BUDGET.change) {
            return null;
        }

        this.told = size;

        return size;
    }

    /** Judged afresh from now (an invasion on: its own frames not what's to be measured). */
    hold() {
        this.#work.clear();
        this.#intervals.clear();
        this.#since = null;
    }
}
