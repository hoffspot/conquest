// What the world server remembers of how it's been running (generated/
// multiplayer_scaling_plan.md 6A-4), with no service behind it: for each thing charted on the
// management page's Health (a world's slowest steps, the server's memory), a ring of the last
// day at one point every ten seconds and a ring of the last week at one every five minutes
// (RINGS), kept in one file in the data folder (HISTORY_FILE) and read back when the server
// starts, so a restart leaves a gap in the charts as long as it was down, and nothing else.
//
// A ring's points are at fixed times (the clock's, cut into its steps), so it needs no time kept
// with each: where its newest is says when they all were. A point never measured (the server
// down, a world set aside) is NaN in the ring and null to whoever reads it, drawn as a gap. A
// ring is 4 bytes a point: 42 KB for a thing's day and week, about a megabyte for a server with
// three worlds, and far less in its file (gzipped, most of it gaps or much the same).

import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { quantile } from "./metrics.js";
import { writeGzip } from "./storage/files.js";

/** The rings kept of each thing: how far apart their points are (ms), and how many there are (a day at ten seconds; a week at five minutes). */
export const RINGS = Object.freeze({ day: Object.freeze({ step: 10000, points: 8640 }), week: Object.freeze({ step: 300000, points: 2016 }) });

/** Where it's kept, in the data folder; what its file says it is; and how often it's written (ms). */
export const HISTORY_FILE = "history.json.gz";
export const HISTORY_FORMAT = "pellagos.history.1";
export const HISTORY_SAVE = 300000;

/** How many points of a ring the management page's charts are given at most: more are folded together, as a week's are made of a day's. */
export const CHART_POINTS = 720;

/**
 * What's charted (by id): what it is in words, its unit ("ms", "bytes", "share" (0-1) or
 * "count"), whether there's one for each world (`world`), and how a five-minute point is made
 * of its ten-second ones (`fold`: their "max", for what's judged by its worst, or their "mean").
 * `limit`: a line drawn across its chart (a step's 50 ms).
 */
export const CHARTED = Object.freeze({
    "step-p99": Object.freeze({ title: "Steps, slowest 1%", unit: "ms", world: true, fold: "max", limit: 50 }),
    "tick-p99": Object.freeze({ title: "Whole ticks, slowest 1%", unit: "ms", world: true, fold: "max", limit: 50 }),
    pace: Object.freeze({ title: "Pace", unit: "share", world: true, fold: "mean" }),
    "world-players": Object.freeze({ title: "Players", unit: "count", world: true, fold: "max" }),
    actors: Object.freeze({ title: "In its battle", unit: "count", world: true, fold: "max" }),
    "world-memory": Object.freeze({ title: "Memory", unit: "bytes", world: true, fold: "max" }),
    sockets: Object.freeze({ title: "Players' games linked", unit: "count", world: false, fold: "max" }),
    sent: Object.freeze({ title: "Sent to players' games, a second", unit: "bytes", world: false, fold: "mean" }),
    "loop-p99": Object.freeze({ title: "The server's event loop, late (slowest 1%)", unit: "ms", world: false, fold: "max" }),
    busy: Object.freeze({ title: "The server's own thread, busy", unit: "share", world: false, fold: "mean" }),
    rss: Object.freeze({ title: "The server's memory", unit: "bytes", world: false, fold: "max" }),
});

const gunzipped = promisify(gunzip);

// Points folded together `each` at a time, the newest group whole (the oldest may be short): their max or their mean, null where none of them was measured
function folded(values, each, fold) {
    const out = [];

    for (let end = values.length; end > 0; end -= each) {
        const group = values.slice(Math.max(0, end - each), end).filter((value) => value !== null);

        out.push(!group.length ? null : fold === "max" ? Math.max(...group) : group.reduce((sum, value) => sum + value, 0) / group.length);
    }

    return out.reverse();
}

/** A ring of `points` numbers, one every `step` ms of the clock: the newest at slot `end` (the clock's time over `step`, whole), the rest behind it. */
export class Ring {
    constructor({ step, points }, { end = -1, values = null } = {}) {
        this.step = step;
        this.points = points;
        this.end = end;
        this.values = values ?? new Float32Array(points).fill(NaN);
    }

    /** The slot the clock's time `now` (ms) falls in. */
    slotOf(now) {
        return Math.floor(now / this.step);
    }

    /** Moved on to `slot` (never back): what's between its newest and there never measured. */
    reach(slot) {
        if (slot <= this.end) {
            return;
        }

        if (this.end < 0 || slot - this.end >= this.points) {
            this.values.fill(NaN);
        } else {
            for (let at = this.end + 1; at <= slot; at++) {
                this.values[at % this.points] = NaN;
            }
        }

        this.end = slot;
    }

    /** `value` at `slot` (one before the ring's reach, or behind the last it was given a later one for, is let go). */
    put(slot, value) {
        this.reach(slot);

        if (slot > this.end - this.points) {
            this.values[slot % this.points] = value;
        }
    }

    /** Its points up to `slot`, oldest first, null where nothing was measured. */
    read(slot = this.end) {
        const out = new Array(this.points);

        for (let k = 0; k < this.points; k++) {
            const at = slot - this.points + 1 + k;
            const value = at < 0 || at > this.end || at <= this.end - this.points ? NaN : this.values[at % this.points];

            out[k] = Number.isNaN(value) ? null : value;
        }

        return out;
    }

    /** Whether nothing in it was ever measured. */
    get empty() {
        return this.values.every((value) => Number.isNaN(value));
    }

    toJSON() {
        return { end: this.end, values: Buffer.from(this.values.buffer, this.values.byteOffset, this.values.byteLength).toString("base64") };
    }

    /** A ring as it was kept (toJSON), or a new one if what's kept isn't one of this shape. */
    static from(shape, kept) {
        const bytes = typeof kept?.values === "string" ? Buffer.from(kept.values, "base64") : null;

        if (!bytes || bytes.length !== shape.points * 4 || !Number.isInteger(kept.end)) {
            return new Ring(shape);
        }

        const values = new Float32Array(shape.points);

        Buffer.from(values.buffer).set(bytes);

        return new Ring(shape, { end: kept.end, values });
    }
}

export class History {
    /**
     * @param {object} [options]
     * @param {string} [options.file] - Where it's kept (none: in memory alone).
     * @param {object} [options.kept] - What was read from there.
     */
    constructor({ file = null, kept = null } = {}) {
        this.file = file;

        /** What's kept, by `${id} ${world}`: { id, world, day, week, folding: { slot, sum, count, max } }. */
        this.series = new Map();
        this.saving = Promise.resolve();

        for (const one of kept?.series ?? []) {
            if (CHARTED[one?.id] && (typeof one.world === "string" || one.world === null)) {
                this.series.set(`${one.id} ${one.world ?? ""}`, { id: one.id, world: one.world, day: Ring.from(RINGS.day, one.day), week: Ring.from(RINGS.week, one.week), folding: null });
            }
        }
    }

    /** The history kept in `file`, or a new one if there's none there that reads (a file cut short or of another format is started afresh: it's only charts). */
    static async open(file) {
        let kept;

        try {
            kept = JSON.parse((await gunzipped(await readFile(file))).toString("utf8"));
        } catch {
            kept = null;
        }

        return new History({ file, kept: kept?.format === HISTORY_FORMAT ? kept : null });
    }

    #of(id, world) {
        const key = `${id} ${world ?? ""}`;
        let one = this.series.get(key);

        if (!one) {
            one = { id, world: world ?? null, day: new Ring(RINGS.day), week: new Ring(RINGS.week), folding: null };
            this.series.set(key, one);
        }

        return one;
    }

    /**
     * What was measured at `now` (the clock's, ms): [{ id (CHARTED's), world (its id, or null),
     * value }], a point in each one's day; and its week's point for these five minutes made of
     * all there've been in them so far.
     */
    record(now, samples) {
        for (const { id, world = null, value } of samples) {
            if (!CHARTED[id] || !Number.isFinite(value)) {
                continue;
            }

            const one = this.#of(id, world);
            const slot = one.week.slotOf(now);

            if (one.folding?.slot !== slot) {
                one.folding = { slot, sum: 0, count: 0, max: -Infinity };
            }

            one.folding.sum += value;
            one.folding.count++;
            one.folding.max = Math.max(one.folding.max, value);
            one.day.put(one.day.slotOf(now), value);
            one.week.put(slot, CHARTED[id].fold === "max" ? one.folding.max : one.folding.sum / one.folding.count);
        }
    }

    /**
     * The last day or week (`span`: RINGS') as it stands at `now`: { span, step (ms between
     * points), end (when the newest point's time ends, ms), series: [{ id, world, title, unit,
     * limit, values (oldest first, null where nothing was measured) }] }, those with nothing
     * measured in it left out. With `most`, no more points than that: neighbours folded together
     * as each thing's are (CHARTED's `fold`), `step` their time together.
     */
    read(span, now, { most = Infinity } = {}) {
        const shape = RINGS[span] ?? RINGS.day;
        const name = RINGS[span] ? span : "day";
        const slot = Math.floor(now / shape.step);
        const each = Math.max(1, Math.ceil(shape.points / most));
        const series = [];

        for (const one of this.series.values()) {
            const values = one[name].read(slot);

            if (values.some((value) => value !== null)) {
                const { title, unit, limit = null, fold } = CHARTED[one.id];

                series.push({ id: one.id, world: one.world, title, unit, limit, values: each > 1 ? folded(values, each, fold) : values });
            }
        }

        return { span: name, step: shape.step * each, end: (slot + 1) * shape.step, series };
    }

    /** A world's history let go of (deleted). */
    forget(world) {
        for (const [key, one] of this.series) {
            if (one.world === world) {
                this.series.delete(key);
            }
        }
    }

    /** Written to its file, whole (after any write before it). Resolves once it's there, or couldn't be: it's only charts. */
    save() {
        if (!this.file) {
            return Promise.resolve();
        }

        const text = JSON.stringify({ format: HISTORY_FORMAT, series: [...this.series.values()].filter((one) => !one.day.empty || !one.week.empty).map(({ id, world, day, week }) => ({ id, world, day, week })) });

        this.saving = this.saving.then(() => writeGzip(this.file, text)).catch(() => {});

        return this.saving;
    }
}

/**
 * What's charted, measured from the server's metrics (server-metrics.js ServerMetrics, with the
 * `server` it watches) over the time since it was last asked: `sampler()` returns the samples
 * History.record takes, and null the first time (there's nothing yet to measure since).
 */
export function samplerOf(metrics, server, { clock = () => performance.now() } = {}) {
    const ms = (value) => (value === null || value === undefined ? NaN : value * 1000);
    let before = null;

    return () => {
        metrics.registry.collect();

        const at = clock();
        const now = { at, worlds: new Map(), wire: 0 };
        const samples = [];
        const going = new Set(server.registry.going.map((entry) => entry.id));

        for (const id of going) {
            const labels = { world: id };
            const thread = { thread: "world", world: id };

            if (!metrics.known.has(id)) {
                continue;
            }

            const counted = { steps: [...metrics.world.step.with(labels).counts], ticks: [...metrics.world.tick.with(labels).counts], dropped: metrics.world.dropped.with(labels).value };
            const was = before?.worlds.get(id);

            now.worlds.set(id, counted);
            samples.push({ id: "world-players", world: id, value: metrics.world.players.with(labels).value });
            samples.push({ id: "actors", world: id, value: metrics.world.actors.with(labels).value });
            samples.push({ id: "world-memory", world: id, value: metrics.thread.heap.with(thread).value + metrics.thread.external.with(thread).value });

            if (was) {
                const { bounds } = metrics.world.step;
                const since = (counts, old) => counts.map((count, k) => count - old[k]);

                // (Its slowest 1% since, as near as the buckets say; nothing, with no step played)
                samples.push({ id: "step-p99", world: id, value: ms(quantile(bounds, since(counted.steps, was.steps), 0.99)) });
                samples.push({ id: "tick-p99", world: id, value: ms(quantile(bounds, since(counted.ticks, was.ticks), 0.99)) });
                samples.push({ id: "pace", world: id, value: Math.max(0, Math.min(1, 1 - ((counted.dropped - was.dropped) * 1000) / Math.max(1, at - before.at))) });
            }
        }

        for (const id of going) {
            now.wire += metrics.known.has(id) ? metrics.server.wire.with({ world: id }).value : 0;
        }

        const supervisor = { thread: "supervisor", world: "" };

        samples.push({ id: "sockets", value: metrics.server.sockets.with().value });
        samples.push({ id: "rss", value: metrics.server.rss.with().value });

        if (metrics.sampling) {
            samples.push({ id: "busy", value: metrics.server.utilization.with().value });
            samples.push({ id: "loop-p99", value: ms(metrics.thread.loopP99.with(supervisor).value) });
        }

        if (before) {
            samples.push({ id: "sent", value: (Math.max(0, now.wire - before.wire) * 1000) / Math.max(1, at - before.at) });
        }

        const first = before === null;

        before = now;

        return first ? null : samples;
    };
}
