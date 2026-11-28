// Reports of players (generated/multiplayer_scaling_plan.md 6B-6): what a player in a public
// world tells the server's owner of another, from the chat panel's Players tab. The world's host
// hears it (client/js/core/netplay.js Session, "report"), the server makes the report of it
// (server/play.js `report`) and keeps it here, in `reports.json` in its data folder.
//
// A report: { id, at, world, why, by, about, lines, places, reviewed }. `by` and `about` are
// { player, identity, name }: each one's player id in that world, their own identity (storage/
// players.js) or null, and their hero's name. `lines` are the latest lines between the two from
// the chat log (storage/chatlog.js), `places` where each stood ({ by, about }). `reviewed` is
// null till the owner's looked at it ({ at, by, lift }).
//
// Two rules, by the clock:
//   - One player makes REPORTS.hour reports an hour at most ("reportMany").
//   - REPORTS.reporters different players reporting the same one within REPORTS.withinMs mutes
//     them: their shouts and what they say to the area channel are refused (Session `muted`) in
//     every world of the server, till the owner has reviewed a report of them and lifted it
//     (`review`). Nobody's banned or sent out by a report: that's a person's to decide.
//
// Who's who: by their own identity where they came in by one, else by their player id in that
// world (`keyOf`).
//
// Kept twelve months (REPORTS.months), and REPORTS.most at most, the oldest let go of first.

import path from "node:path";

import { REPORT_WHYS } from "../../client/js/core/netplay.js";
import { exists, readJSON, writeJSON } from "../storage/files.js";
import { SERVER_VERSION } from "../storage/versions.js";

const DAY = 86400000;

export const REPORTS_FILE = "reports.json";
export const REPORTS_VERSION = 1;

/**
 * How many reports a player may make in an hour; how many lines between the two a report
 * carries; how many different reporters within how long mute whoever they report; how long a
 * report's kept (months of thirty days), and how many are.
 */
export const REPORTS = Object.freeze({ hour: 5, hourMs: 3600000, lines: 20, reporters: 3, withinMs: 600000, months: 12, most: 2000 });

/** Who someone is to the reports: their own identity, else their player id in that world. */
export const keyOf = ({ world, player, identity = null } = {}) => identity ?? `${world}/${player}`;

const who = (one) => ({ player: String(one.player), identity: one.identity ?? null, name: String(one.name ?? "") });

export class Reports {
    constructor(file, { reports = [], muted = {}, next = 1 } = {}, { clock = Date.now } = {}) {
        Object.assign(this, { file, reports, muted, next, clock });
        this.writing = Promise.resolve();
        this.error = null;
    }

    /** The reports of the server whose data folder is `root` (none yet, with no file). */
    static async open(root, { clock = Date.now } = {}) {
        const file = path.join(root, REPORTS_FILE);

        if (!(await exists(file))) {
            return new Reports(file, {}, { clock });
        }

        const { reportsVersion, reports = [], muted = {}, next = 1 } = await readJSON(file);

        if (reportsVersion !== REPORTS_VERSION) {
            throw new Error(`The server's reports (${REPORTS_FILE}) are version ${reportsVersion}, and this server reads version ${REPORTS_VERSION}.`);
        }

        const store = new Reports(file, { reports, muted, next }, { clock });

        if (store.#age()) {
            await store.#write();
        }

        return store;
    }

    #write() {
        this.writing = this.writing
            .then(() => writeJSON(this.file, { reportsVersion: REPORTS_VERSION, writtenBy: SERVER_VERSION, next: this.next, reports: this.reports, muted: this.muted }))
            .then(
                () => {
                    this.error = null;
                },
                (error) => {
                    this.error = error.message;
                },
            );

        return this.writing;
    }

    // Reports too old, or too many, let go of. Returns whether any were
    #age() {
        const before = this.reports.length;
        const oldest = this.clock() - REPORTS.months * 30 * DAY;

        this.reports = this.reports.filter((report) => Date.parse(report.at) >= oldest).slice(-REPORTS.most);

        return this.reports.length !== before;
    }

    /**
     * A report made: of `about` by `by` (each { player, identity, name }) in a world, for a
     * reason (REPORT_WHYS), with the lines between them and where each stood. Returns { ok:
     * true, id, muted } (`muted`: this one muted who it's about), or { ok: false, reason }:
     * "reportWhy", "reportWho" (of themselves), "reportMany". Written in its turn.
     */
    make({ world, by, about, why, lines = [], places = {} } = {}) {
        if (!REPORT_WHYS.includes(why)) {
            return { ok: false, reason: "reportWhy" };
        }

        const now = this.clock();
        const [reporter, subject] = [keyOf({ world, ...by }), keyOf({ world, ...about })];

        if (reporter === subject) {
            return { ok: false, reason: "reportWho" };
        }

        const mine = (report) => keyOf({ world: report.world, ...report.by }) === reporter;
        const theirs = (report) => keyOf({ world: report.world, ...report.about }) === subject;

        if (this.reports.filter((report) => mine(report) && now - Date.parse(report.at) < REPORTS.hourMs).length >= REPORTS.hour) {
            return { ok: false, reason: "reportMany" };
        }

        const report = { id: `r${this.next++}`, at: new Date(now).toISOString(), world, why, by: who(by), about: who(about), lines: lines.slice(-REPORTS.lines), places: { by: places.by ?? null, about: places.about ?? null }, reviewed: null };

        this.reports.push(report);
        this.#age();

        // (Different players, lately, of the same one: muted till someone's looked)
        const lately = this.reports.filter((one) => theirs(one) && now - Date.parse(one.at) < REPORTS.withinMs);
        const muted = !Object.hasOwn(this.muted, subject) && new Set(lately.map((one) => keyOf({ world: one.world, ...one.by }))).size >= REPORTS.reporters;

        if (muted) {
            this.muted[subject] = { since: report.at, name: report.about.name, reports: lately.map((one) => one.id) };
        }

        this.#write();

        return { ok: true, id: report.id, muted };
    }

    /** Whether someone (keyOf) is muted by reports of them. */
    isMuted(key) {
        return Object.hasOwn(this.muted, key);
    }

    /** How many reports wait to be looked at, and how many players are muted by them. */
    counts() {
        return { waiting: this.reports.filter((report) => report.reviewed === null).length, muted: Object.keys(this.muted).length };
    }

    /** The reports, newest first (copies; `waiting`: only those not looked at yet), and who's muted by them ({ key, since, name, reports }). */
    list({ waiting = false } = {}) {
        return {
            reports: structuredClone(this.reports.filter((report) => !waiting || report.reviewed === null)).reverse(),
            muted: Object.entries(this.muted).map(([key, mute]) => ({ key, ...structuredClone(mute) })),
        };
    }

    /**
     * A report looked at by the owner (`by`, who): marked so, and, with `lift`, the mute on who
     * it's about lifted. Can be done again, to lift a mute kept the first time. Returns the
     * report (a copy) and whether a mute was lifted ({ report, lifted }), or null for none by
     * that id.
     */
    async review(id, { by = "", lift = false } = {}) {
        const report = this.reports.find((one) => one.id === id);

        if (!report) {
            return null;
        }

        const key = keyOf({ world: report.world, ...report.about });
        const lifted = lift === true && this.isMuted(key);

        report.reviewed = { at: new Date(this.clock()).toISOString(), by: String(by), lift: lift === true };

        if (lifted) {
            delete this.muted[key];
        }

        await this.#write();

        return { report: structuredClone(report), lifted };
    }

    /** Once everything so far is written. */
    flush() {
        return this.writing;
    }
}
