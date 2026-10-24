// A quick action's press (app/quickbar.js): a finger or the mouse down on its slot, becoming a tap
// (lifted where it went down: used), a hold (QUICK_HOLD_MS still: changed), a flick (STRAY up or
// down: its spell turned), or nothing (slid off, or lost). It's told of each pointer's down, move
// and lift as plain numbers, not the page's events, so it's tested without a page
// (test/press.test.js).
//
// It never waits on a lift that may not come. A phone's Safari doesn't always say a finger's been
// lifted (a swipe in from the screen's edge, or, since iOS 27, a touch it hands to a gesture of its
// own, never ends), and a press waited on for ever would leave its slot deaf to every touch after
// it till the page was loaded again. So:
//
//  - a press begun while another's still held takes over from it (the one held was lost), said
//    (onStale) for the debug log;
//  - a press ends the moment it can't be a tap (held, flicked or slid off), not at the lift;
//  - every way a press ends goes through one #drop, done before anything's told of it, so nothing
//    that's told (and fails) can leave it held;
//  - it's let go of (release) when the bar's put away, the game stops listening, or the page is
//    hidden or loses the player;
//  - and it's dropped once every finger's off the screen (bare), if it was begun before they were.

/** How long a slot's held before it's to be changed (ms), not tapped. */
export const QUICK_HOLD_MS = 500;

/**
 * How long after every finger's off the screen a press begun before then is dropped as lost (ms):
 * long enough for its own lift, if it's coming, to be heard first. (The thumb stick's too:
 * app/steering.js)
 */
export const BARE_MS = 100;

/** How far a finger can stray from where it went down and still tap (pixels); as far up or down, more up or down than across, and it's a flick. */
export const STRAY = 24;

export class Press {
    #press = null;

    /**
     * @param {object} [options]
     * @param {Function} [options.live] - Whether a hold may still change the slot (the bar's up).
     * @param {Function} [options.now] - The time (ms: performance.now).
     * @param {object} [options.timers] - `set(work, ms)` and `clear(timer)` (setTimeout's).
     */
    constructor({ live = () => true, now = () => performance.now(), timers = { set: (work, ms) => setTimeout(work, ms), clear: (timer) => clearTimeout(timer) } } = {}) {
        this.live = live;
        this.now = now;
        this.timers = timers;

        /** Hears a tap: lifted where it went down, before it was held. */
        this.onUse = () => {};

        /** Hears a hold: QUICK_HOLD_MS down without straying (the pointer's id: its lift's still to come). */
        this.onChoose = () => {};

        /** Hears a flick ("up" or "down"). */
        this.onFlick = () => {};

        /**
         * Hears a press dropped as lost: `ms` since it began, `how` ("again": another begun over
         * it; "bare": every finger off the screen) and the last that was heard of it (`last`:
         * "down" or "move").
         */
        this.onStale = () => {};
    }

    /** Whether a press is held (one that could still be a tap). */
    get pressing() {
        return this.#press !== null;
    }

    /**
     * A pointer down (`pointer`: its id; `x`, `y`: where, pixels; `button`: the mouse's; `kind`:
     * "mouse", "touch" or "pen"). Returns whether it's taken (not a mouse's other buttons), for
     * the page's own default to be stopped and the pointer kept to the slot.
     */
    down({ pointer, x, y, button = 0, kind = "" }) {
        if (button > 0) {
            return false;
        }

        const lost = this.#press;
        const now = this.now();

        this.#drop();

        if (lost) {
            this.onStale({ ms: now - lost.at, how: "again", last: lost.last });
        }

        const press = { pointer, x, y, kind, at: now, last: "down" };

        press.hold = this.timers.set(() => this.#held(press), QUICK_HOLD_MS);
        this.#press = press;

        return true;
    }

    /** A pointer moved (`pointer`, `x`, `y`): strayed far enough up or down, a flick; any other way, slid off. */
    move({ pointer, x, y }) {
        const press = this.#press;

        if (press?.pointer !== pointer) {
            return;
        }

        const [dx, dy] = [x - press.x, y - press.y];

        press.last = "move";

        if (Math.abs(dy) >= STRAY && Math.abs(dy) > Math.abs(dx)) {
            this.#drop();
            this.onFlick(dy < 0 ? "up" : "down");
        } else if (Math.hypot(dx, dy) > STRAY) {
            this.#drop();
        }
    }

    /** A pointer lifted (`pointer`): if it's the press's, a tap. */
    up({ pointer }) {
        if (this.#press?.pointer !== pointer) {
            return;
        }

        this.#drop();
        this.onUse();
    }

    /** A pointer's press called off (`pointer`: the browser's cancel, or the pointer no longer kept to the slot): nothing. */
    cancel({ pointer }) {
        if (this.#press?.pointer === pointer) {
            this.#drop();
        }
    }

    /** Let go of whatever's held, without a word (the bar put away, the game not listening, the page hidden). */
    release() {
        this.#drop();
    }

    /**
     * Every finger off the screen as of `at` (ms, as `now`): a press a finger began before then
     * was lost (its lift never said), and is dropped. (A mouse's isn't a finger's, and one begun
     * since is another's.)
     */
    bare(at) {
        const press = this.#press;

        if (!press || press.kind === "mouse" || press.at > at) {
            return;
        }

        this.#drop();
        this.onStale({ ms: this.now() - press.at, how: "bare", last: press.last });
    }

    // Held long enough: changed, if it's still this press and the bar's still up; over, either way
    #held(press) {
        if (this.#press !== press) {
            return;
        }

        this.#drop();

        if (this.live()) {
            this.onChoose(press.pointer);
        }
    }

    #drop() {
        if (this.#press) {
            this.timers.clear(this.#press.hold);
            this.#press = null;
        }
    }
}
