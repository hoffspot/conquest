// A measured run on the page (docs/GAME.md *Measuring a device*): asked for by the link the game's
// opened with, `?measure=<name>&minutes=12` beside whatever else it says (`?play`, `?join=CODE`, or
// nothing: the first game played from the page is the one measured). While it runs:
//
//  - every frame's counted by its meter (app/measure.js Meter, handed to the game as its
//    `measure`: app/game.js #measured), and the game draws at one quality throughout, Adaptive
//    off for the run (main.js applyViewSettings), so the frames measured are all of one kind;
//  - how long is left is counted down in a corner of the screen;
//  - the report as far as it's got is kept on the device every MEASURING.keep ms (localStorage,
//    MEASURING.key), so a run the browser ends early, the tab closed for the memory it took,
//    leaves what it had measured;
//  - the screen's kept awake where the browser lets a page ask (a wake lock), asked for again
//    whenever the page comes back into view.
//
// Without the parameter none of this is made: measureOf answers null, and nothing here runs.

import { MEASURE, Meter } from "./measure.js";

/**
 * - `key`: where the run's report is kept on the device (the last run's: one).
 * - `keep`: how often it's kept while the run's measured (ms).
 * - `tick`: how often the countdown's looked at (ms).
 * - `name`: the most letters of a run's name.
 */
export const MEASURING = Object.freeze({ key: "pellagos.measure", keep: 10000, tick: 1000, name: 40 });

/**
 * The run a page's address asks for (`params`: its URLSearchParams): { name, minutes }, or null
 * if it asks for none. A name is letters, digits, dots and dashes ("run" if it's given none);
 * `minutes` is MEASURE.minutes unless said, MEASURE.most at most.
 */
export function measureOf(params) {
    if (!params?.has?.("measure")) {
        return null;
    }

    const name = String(params.get("measure") ?? "")
        .trim()
        .replace(/[^\w.-]+/g, "-")
        .slice(0, MEASURING.name);
    const minutes = Number(params.get("minutes"));

    return { name: name || "run", minutes: minutes > 0 ? Math.min(MEASURE.most, minutes) : MEASURE.minutes };
}

/** How long's left of a run, as the countdown says it: "11:32". */
export function leftWords(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The last run's report kept on a device (`storage`), or null. */
export function keptMeasure(storage) {
    try {
        const kept = JSON.parse(storage?.getItem(MEASURING.key) ?? "null");

        return kept !== null && typeof kept === "object" && kept.measure === MEASURE.version ? kept : null;
    } catch {
        return null;
    }
}

export class MeasuredRun {
    #storage;
    #wakeLock;
    #element;
    #clock;
    #every;
    #ticking = null;
    #lock = null;
    #keptAt = -Infinity;
    #began = null;
    #finished = false;

    /**
     * @param {object} asked - What was asked for (measureOf's: { name, minutes }).
     * @param {object} [options]
     * @param {Element} [options.element] - Where the countdown's shown (index.html #measure: its
     *   `[data-measure-text]` the words).
     * @param {Storage} [options.storage] - Where the report's kept (localStorage).
     * @param {object} [options.wakeLock] - The browser's wake lock (navigator.wakeLock), if it has one.
     * @param {Function} [options.clock] - The time of day (ms since 1970).
     * @param {Function} [options.every] - Something done every so often ((work, ms) => stop: setInterval's).
     * @param {object} [options.about] - What every report says of this copy of the game ({ code, build, built }).
     */
    constructor(asked, { element = null, storage = null, wakeLock = null, clock = () => Date.now(), every = null, about = {} } = {}) {
        /** The run's name, and its meter. */
        this.name = asked.name;
        this.meter = new Meter({ minutes: asked.minutes });
        this.about = about;
        this.#element = element;
        this.#storage = storage;
        this.#wakeLock = wakeLock;
        this.#clock = clock;
        this.#every =
            every ??
            ((work, ms) => {
                const timer = setInterval(work, ms);

                return () => clearInterval(timer);
            });

        /** The game being measured (the first played from the page), once there's one. */
        this.game = null;

        /** Called with the report once the run's measured through. */
        this.onDone = null;
    }

    /** Is the run measured through? */
    get done() {
        return this.#finished;
    }

    /**
     * A game under way: the first is the one measured, its frames counted from now on (a game
     * come to later, another world gone into, carries the same run on). The countdown's shown,
     * and the screen asked to stay awake.
     */
    attach(game) {
        if (this.#finished) {
            return;
        }

        this.game = game;
        game.measure = this.meter;

        if (this.#ticking) {
            return;
        }

        this.#began = this.#clock();
        this.#ticking = this.#every(() => this.tick(), MEASURING.tick);
        this.wake();
        this.#show(`Measuring ${this.name}: ${leftWords(this.meter.left)} left`);
    }

    /** The screen asked to stay awake (again, the page back in view: the browser lets go of it whenever it's hidden). */
    async wake() {
        if (this.#finished || !this.#ticking || !this.#wakeLock?.request) {
            return;
        }

        try {
            const lock = await this.#wakeLock.request("screen");

            // (Done meanwhile: let go of at once)
            if (this.#finished) {
                lock?.release?.();
            } else {
                this.#lock = lock;
            }
        } catch {
            // (Refused, as on a low battery or a page out of view: the run goes on, the screen the owner's to keep awake)
        }
    }

    /** The countdown brought up to date; the report kept, if it's time; the run ended, once it's measured through. */
    tick() {
        if (this.#finished || !this.#ticking) {
            return;
        }

        if (this.meter.done) {
            this.#finish();

            return;
        }

        this.#show(`Measuring ${this.name}: ${leftWords(this.meter.left)} left`);

        if (this.#clock() - this.#keptAt >= MEASURING.keep) {
            this.keep();
        }
    }

    /**
     * The run as measured so far (Meter.report), with what it was a run of: its name, when it
     * began, this copy of the game, and what the game says of how it's drawn, where it is and
     * the device (app/game.js measureAbout).
     */
    report() {
        let game = {};

        try {
            game = this.game?.measureAbout?.() ?? {};
        } catch {
            // (A game half taken down: the frames it had are still the report)
        }

        return this.meter.report({ name: this.name, began: this.#began === null ? null : new Date(this.#began).toISOString(), ...this.about, ...game });
    }

    /** The report kept on the device as it stands. Returns it. */
    keep() {
        const report = this.report();

        this.#keptAt = this.#clock();

        try {
            this.#storage?.setItem(MEASURING.key, JSON.stringify(report));
        } catch {
            // (Storage full or refused: the report's still to be had from the page)
        }

        return report;
    }

    // Measured through: the report kept as it ended, the screen let go of, and whoever's waiting told
    #finish() {
        this.#finished = true;
        this.#ticking?.();
        this.#ticking = null;
        this.#lock?.release?.()?.catch?.(() => {});
        this.#lock = null;

        if (this.game?.measure === this.meter) {
            this.game.measure = null;
        }

        const report = this.keep();

        this.say(`Measured ${this.name}: ${leftWords(Math.round(this.meter.elapsed / 1000) * 1000)} of play, kept on this device.`);
        this.onDone?.(report);
    }

    /** Words shown where the countdown was (how the run ended, and what became of its report). */
    say(words) {
        this.#show(words);
    }

    #show(words) {
        const element = this.#element;

        if (!element) {
            return;
        }

        const text = element.querySelector?.("[data-measure-text]") ?? element;

        element.hidden = false;
        element.dataset.measure = this.#finished ? "done" : "running";

        if (text.textContent !== words) {
            text.textContent = words;
        }
    }
}
