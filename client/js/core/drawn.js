// Others drawn from the mirror (generated/multiplayer_scaling_plan.md 3-19): for a game that's
// sent its player's frames, where to draw each of those they tell of, now. Each frame's taken by
// a mirror of its own as it comes (core/mirror.js; a shadow's waits for its copy, this doesn't),
// and timed by a playout clock (core/playout.js), so `of(id, now)` is where that character was
// a little behind the world: between two tellings, carried on a little past the latest, there at
// once when it's placed, faded as it comes and goes.
//
// A lockstep game asks for it with `?mirror`, to set what's drawn from frames beside what its
// copy has (app/game.js draws others from it; the copy's still played, and is still the truth of
// everything else). Pure: no DOM, no network.

import { Battle } from "./battle.js";
import { Mirror } from "./mirror.js";
import { Playout } from "./playout.js";
import { decodeFrame } from "./view.js";

/** How many frames wait for the world to be made before the oldest are let go of. */
export const DRAWN = Object.freeze({ waiting: 6000 });

export class Drawn {
    #waiting = [];

    #world = null;

    constructor({ stepMs = 50 } = {}) {
        this.stepMs = stepMs;
        this.playout = new Playout({ stepMs });

        /** Its mirror (null till the world's known and a frame's come that tells of its own hero). */
        this.mirror = null;

        /** How many frames it's taken, and how many were asked where to draw someone it couldn't say of. */
        this.frames = 0;
        this.unknown = 0;

        /**
         * Told, if set: `onTimed(time, now)` the world's time each frame is of, as it comes; and
         * `onSelf({ time, seq, hero, at })` the frames' word of the player's own hero, as a
         * lockstep link's `self` is (core/netplay.js Joining.self).
         */
        this.onTimed = null;
        this.onSelf = null;
    }

    /** The world its characters are of (core/battle.js: a battle's `world`), once it's made: the frames that waited are taken. */
    begin(world) {
        if (this.#world) {
            return;
        }

        this.#world = world;

        for (const [bytes, now] of this.#waiting.splice(0)) {
            this.take(bytes, now);
        }
    }

    /** A frame come (bytes), at `now` (ms, the clock's). */
    take(bytes, now) {
        if (!this.#world) {
            this.#waiting.push([bytes, now]);

            if (this.#waiting.length > DRAWN.waiting) {
                this.#waiting.shift();
            }

            return;
        }

        const frame = decodeFrame(bytes);

        if (!frame) {
            return;
        }

        // (Its frames begin with the one that tells of its own hero, as a shadow's do)
        if (!this.mirror) {
            let first;

            try {
                first = JSON.parse(frame.sections.enters ?? "[]").some(([index]) => index === 0);
            } catch {
                first = false;
            }

            if (!first) {
                return;
            }

            this.mirror = new Mirror(new Battle(this.#world, { seed: 1 }), { stepMs: this.stepMs });
        }

        const selves = this.mirror.selves;

        this.mirror.apply(bytes);
        this.playout.heard(frame.step * this.stepMs, now);
        this.frames++;

        // (The world's time, as every frame says it; and its word of the player's own hero and
        // the last of their commands done, when it has one: what a look ahead begins from,
        // app/forecast.js, the scaling plan's 3-20)
        this.onTimed?.(frame.step * this.stepMs, now);

        if (this.mirror.selves !== selves && this.mirror.self && Number.isInteger(this.mirror.done)) {
            this.onSelf?.({ time: this.mirror.asof, seq: this.mirror.done, hero: this.mirror.self, at: now });
        }
    }

    /** The battle those it draws are characters of (the mirror's, never stepped): null till it has a frame. */
    get battle() {
        return this.mirror?.battle ?? null;
    }

    /** The world's time it draws at, the clock being at `now`: null till it has a frame. */
    time(now) {
        return this.mirror ? this.playout.at(now) : null;
    }

    /**
     * How to draw the character with an id, the clock being at `now` (core/mirror.js drawn: { x,
     * y, heading, map, alpha, known }), or null if the frames have never said (it's then not to
     * be seen). `ready` says whether it's being told anything at all yet.
     */
    of(id, now) {
        const time = this.time(now);
        const drawn = time === null ? null : this.mirror.drawn(id, time);

        if (!drawn) {
            this.unknown++;
        }

        return drawn;
    }

    /** Whether it has frames to draw from. */
    get ready() {
        return Boolean(this.mirror);
    }
}
