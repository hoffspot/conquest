// The frames lately, for whoever judges how the game's keeping up (app/governor.js, app/throng.js,
// app/budget.js, app/pacing.js): each frame's time and one number of it (how long since the frame
// before, or how long its work took), kept in typed rings over the last so many milliseconds. Their
// middle is found only when it's asked for, sorted in a scratch array of its own: nothing's made
// each frame, where a list of frames mapped, copied and sorted every frame made 149 KB of garbage
// a frame for the three of them.

/**
 * A frame the game spent building in (the buildings' insides and their folk, the crowds' figures,
 * the soldiers and creatures dressed a step at a time: app/game.js #visit) for more than this share
 * of the beat says nothing of how fast the game draws: drawing less wouldn't have made it any
 * quicker, so it isn't judged by (NaN, to a FrameWindow).
 */
export const BUILDING = 0.5;

/** How many frames a second a window has room for at most (those past it, the oldest, are let go). */
const MOST = 240;

export class FrameWindow {
    #at;
    #value;
    #scratch;
    #head = 0;
    #size = 0;

    /**
     * @param {number} span - How long it keeps frames for (ms).
     */
    constructor(span) {
        const room = Math.ceil((span / 1000) * MOST) + 2;

        this.span = span;
        this.#at = new Float64Array(room);
        this.#value = new Float32Array(room);
        this.#scratch = new Float32Array(room);
    }

    /**
     * A frame at `now` (ms) and its number (`value`; NaN for a frame not to be judged by, kept so
     * that how many there were is known): those older than the span let go.
     */
    push(now, value) {
        const room = this.#at.length;

        if (this.#size === room) {
            this.#head = (this.#head + 1) % room;
            this.#size--;
        }

        const slot = (this.#head + this.#size) % room;

        this.#at[slot] = now;
        this.#value[slot] = value;
        this.#size++;
        this.trim(now);
    }

    /** Those older than the span at `now` (ms) let go (as each frame kept does). */
    trim(now) {
        const room = this.#at.length;

        while (this.#size && this.#at[this.#head] < now - this.span) {
            this.#head = (this.#head + 1) % room;
            this.#size--;
        }
    }

    /** How many frames it holds. */
    get length() {
        return this.#size;
    }

    /** When the oldest frame it holds was (ms); Infinity with none. */
    get first() {
        return this.#size ? this.#at[this.#head] : Infinity;
    }

    /**
     * The middle of the frames' numbers, or NaN if there's nothing to judge by: no frames, or
     * fewer than `share` of them to be judged by (the rest NaN).
     */
    median(share = 0.5) {
        const room = this.#at.length;
        const scratch = this.#scratch;
        let count = 0;

        for (let k = 0; k < this.#size; k++) {
            const value = this.#value[(this.#head + k) % room];

            if (value === value) {
                scratch[count++] = value;
            }
        }

        if (!count || count < this.#size * share) {
            return NaN;
        }

        const judged = scratch.subarray(0, count);

        judged.sort();

        return judged[Math.floor(count / 2)];
    }

    /** The least of the frames' numbers (Infinity with none to judge by). */
    least() {
        const room = this.#at.length;
        let least = Infinity;

        for (let k = 0; k < this.#size; k++) {
            const value = this.#value[(this.#head + k) % room];

            if (value < least) {
                least = value;
            }
        }

        return least;
    }

    /** Emptied. */
    clear() {
        this.#head = 0;
        this.#size = 0;
    }
}

/**
 * The beat: how often the browser's asking for frames (ms a frame), as far as the frames drawn
 * show it. A phone saving its battery asks for 30 a second (an iPhone's Low Power Mode), as a
 * browser's energy saver or a 30 Hz screen does: 30 drawn is then keeping up, not slow.
 *  - `span`: it's the shortest time between two frames over this long (ms), so that a device
 *    missing every other frame still shows the screen's own beat now and then;
 *  - `least`: never shorter than the game draws (60 a second), which it's taken to be till it's
 *    shown otherwise;
 *  - `room`: a frame shows the beat only if the game's own work before it took no more than this
 *    share of the time it came after: one the game itself made late says nothing of what the
 *    browser asked for (with none that do, the beat's as it was);
 *  - `every`: how often it's looked for (ms), `pause`: a gap longer than this (ms) is the game
 *    stopped, not a beat;
 *  - `changed`: by how much of itself it has to move to count as another beat.
 */
export const BEAT = Object.freeze({ span: 10000, least: 1000 / 60, room: 0.5, every: 250, pause: 1000, changed: 0.1 });

export class Beat {
    #frames = new FrameWindow(BEAT.span);
    #looked = -Infinity;

    /** The beat as it was last looked for (ms a frame). */
    value = BEAT.least;

    /**
     * A frame drawn at `now` (ms), `interval` ms after the one before, the game's own work before
     * it having taken `work` ms: the beat (ms a frame).
     */
    observe(now, interval, work = 0) {
        if (interval <= BEAT.pause && work <= interval * BEAT.room) {
            this.#frames.push(now, interval);
        }

        if (now - this.#looked >= BEAT.every) {
            this.#looked = now;
            this.#frames.trim(now);

            const least = this.#frames.least();

            if (Number.isFinite(least)) {
                this.value = Math.max(BEAT.least, least);
            }
        }

        return this.value;
    }
}

/** Is `beat` (ms) another beat than `before`: a screen or a browser asking for frames at another rate? */
export const beatChanged = (beat, before) => Math.abs(beat - before) > before * BEAT.changed;
