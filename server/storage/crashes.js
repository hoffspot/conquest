// The crash reports a world keeps (docs/SERVER.md *Crash reports*): sent by a player's game as it
// comes back into the world after falling over in it (client/js/app/crash-reports.js), each the
// game's debug log as it stood then (client/js/app/telemetry.js: the crash, and what was kept
// before it), with who sent it and when. The last CRASHES.kept, newest first, in one file in the
// world's folder, so they're kept as it is (backed up, archived, gone with it):
//
//   crashes.json    { reports: [{ id, received, crashed, player, name, from, build, code, built, events }] }
//
// For the server's admin alone to see, copy and clear (manage.js crashes; the management page's
// world, Crash reports).

import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { exists, readJSON, writeJSON } from "./files.js";

/**
 * - `kept`: how many a world keeps (the newest).
 * - `bytes`: the most a report may be, as it's sent (JSON).
 * - `events`: the most events of the debug log one may carry.
 */
export const CRASHES = Object.freeze({ kept: 5, bytes: 256 * 1024, events: 10 });

/** The file a world keeps them in. */
export const CRASHES_FILE = "crashes.json";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// A short word as it's kept (a build's, a code's), or null
const word = (value) => (typeof value === "string" && value ? value.slice(0, 64) : null);

/**
 * A crash report as a game sends it (the debug log, as app/telemetry.js text() writes it: { build,
 * code, built, events }), checked: { crashed (when the crash was, its event's), build, code, built,
 * events }; or null if it isn't one (no crash among its events, too many of them).
 */
export function reportOf(given) {
    const events = Array.isArray(given?.events) ? given.events : null;

    if (!events?.length || events.length > CRASHES.events || !events.every(isObject)) {
        return null;
    }

    const crash = events.find((event) => event.kind === "crash");
    const crashed = typeof crash?.at === "string" ? new Date(crash.at) : null;

    if (!crash) {
        return null;
    }

    return { crashed: crashed && !Number.isNaN(crashed.getTime()) ? crashed.toISOString() : null, build: word(given.build), code: word(given.code), built: word(given.built), events };
}

export class CrashReports {
    #writing = Promise.resolve();

    /** @param {string} file - Where they're kept (a world's crashes.json). */
    constructor(file) {
        this.file = file;
    }

    /** The reports kept, newest first (none if there are none, or they can't be read). */
    async list() {
        if (!(await exists(this.file))) {
            return [];
        }

        try {
            const { reports } = await readJSON(this.file);

            return Array.isArray(reports) ? reports.filter(isObject) : [];
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
     * A report kept (`report`, as reportOf checked it), with who sent it (`player`: their id in the
     * world; `name`, the name they go by there, if known; `from`: "home" or "internet") and when
     * (`when`); the oldest past CRASHES.kept let go. Returns it as kept.
     */
    add(report, { player = null, name = null, from = null, when = new Date() } = {}) {
        return this.#change(async () => {
            const kept = { id: randomBytes(6).toString("hex"), received: when.toISOString(), crashed: report.crashed, player, name, from, build: report.build, code: report.code, built: report.built, events: report.events };

            await writeJSON(this.file, { reports: [kept, ...(await this.list())].slice(0, CRASHES.kept) });

            return kept;
        });
    }

    /** Every report let go of. Returns how many there were. */
    clear() {
        return this.#change(async () => {
            const had = (await this.list()).length;

            await rm(this.file, { force: true });

            return had;
        });
    }
}
