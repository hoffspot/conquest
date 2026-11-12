// The measured runs a world keeps (docs/SERVER.md *Measured runs*): sent by a player's game as a
// run asked for by its link ends (`?measure=<name>`: client/js/app/measuring.js; docs/GAME.md
// *Measuring a device*), each the run's report (client/js/app/measure.js Meter.report: how the
// device kept up, a row a minute), with who sent it and when. The last MEASURES.kept, newest
// first, in one file in the world's folder, so they're kept as it is (backed up, archived, gone
// with it):
//
//   measures.json   { runs: [{ id, received, player, name, from, run, began, minutes, seconds, done, code, build, report }] }
//
// Modelled on its crash reports (crashes.js), and keeping nothing of the player they don't: their
// id in the world, the name they go by there, and whether they came from home or the internet;
// the rest is the report, which says of the device what a debug log says. For the server's admin
// alone to see, copy and clear (manage.js measures; the management page's world, Measured runs).

import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { exists, readJSON, writeJSON } from "./files.js";

/**
 * - `kept`: how many a world keeps (the newest).
 * - `bytes`: the most a run may be, as it's sent (JSON: the game's own is under 48 KB for fifteen
 *   minutes, measure.js MEASURE.bytes).
 * - `rows`: the most minutes' rows one may carry (measure.js MEASURE.most, and the part of one).
 */
export const MEASURES = Object.freeze({ kept: 20, bytes: 64 * 1024, rows: 31 });

/** The file a world keeps them in. */
export const MEASURES_FILE = "measures.json";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// A short word as it's kept (a run's name, a build's, a code's), or null
const word = (value) => (typeof value === "string" && value ? value.slice(0, 64) : null);

// A number as it's kept (none below nought), or null
const count = (value) => (Number.isFinite(value) && value >= 0 ? value : null);

/**
 * A measured run as a game sends it (measure.js Meter.report: { measure, name, began, minutes,
 * seconds, done, rows: [...], ... }), checked: { run (its name), began, minutes, seconds, done,
 * code, build, report (as sent) }; or null if it isn't one (no format number, no rows or too many
 * of them, a row that isn't one).
 */
export function runOf(given) {
    const rows = isObject(given) && Array.isArray(given.rows) ? given.rows : null;

    if (!rows || !Number.isInteger(given.measure) || given.measure < 1 || !rows.length || rows.length > MEASURES.rows || !rows.every(isObject)) {
        return null;
    }

    const began = typeof given.began === "string" ? new Date(given.began) : null;

    return {
        run: word(given.name),
        began: began && !Number.isNaN(began.getTime()) ? began.toISOString() : null,
        minutes: count(given.minutes),
        seconds: count(given.seconds),
        done: given.done === true,
        code: word(given.code),
        build: word(given.build),
        report: given,
    };
}

export class MeasuredRuns {
    #writing = Promise.resolve();

    /** @param {string} file - Where they're kept (a world's measures.json). */
    constructor(file) {
        this.file = file;
    }

    /** The runs kept, newest first (none if there are none, or they can't be read). */
    async list() {
        if (!(await exists(this.file))) {
            return [];
        }

        try {
            const { runs } = await readJSON(this.file);

            return Array.isArray(runs) ? runs.filter(isObject) : [];
        } catch {
            return [];
        }
    }

    // One change at a time, in the order asked for: two sent at once both kept
    #change(work) {
        const changing = this.#writing.then(work);

        this.#writing = changing.catch(() => {});

        return changing;
    }

    /**
     * A run kept (`run`, as runOf checked it), with who sent it (`player`: their id in the world;
     * `name`, the name they go by there, if known; `from`: "home" or "internet") and when (`when`);
     * the oldest past MEASURES.kept let go. Returns it as kept.
     */
    add(run, { player = null, name = null, from = null, when = new Date() } = {}) {
        return this.#change(async () => {
            const kept = { id: randomBytes(6).toString("hex"), received: when.toISOString(), player, name, from, ...run };

            await writeJSON(this.file, { runs: [kept, ...(await this.list())].slice(0, MEASURES.kept) });

            return kept;
        });
    }

    /** Every run let go of. Returns how many there were. */
    clear() {
        return this.#change(async () => {
            const had = (await this.list()).length;

            await rm(this.file, { force: true });

            return had;
        });
    }
}
