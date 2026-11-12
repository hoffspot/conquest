// What the world server counts and times (generated/multiplayer_scaling_plan.md 6A-1): a registry
// of counters (what only goes up: bytes sent, joins), gauges (what's so now: sockets open, a
// world's heap) and histograms (how long things took, counted into fixed buckets: a world's
// steps), and what it holds written out as Prometheus's text format, which anything that scrapes
// Prometheus reads (https://prometheus.io/docs/instrumenting/exposition_formats/).
//
// It needs nothing but JavaScript: the server has no runtime dependency, and a metrics library
// would be its first. Counting is a few additions, so it can be done where the work is: a
// series (a metric with its labels' values: `steps.with({ world })`) is found once and kept, and
// counting into it afterwards looks nothing up.
//
// A label says which of a metric's series a number belongs to (which world, which reason). The
// registry is told at the start which labels there may be, and refuses any other: a series for
// each player, address or key would grow for ever, and name someone.

// A metric's name and a label's, as Prometheus has them
const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** The bounds of a histogram of times (seconds): half a millisecond to a second, a step (50 ms) among them. */
export const TIME_BUCKETS = Object.freeze([0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.035, 0.05, 0.075, 0.1, 0.15, 0.25, 0.5, 1]);

// A number as the text format has it
function numberOf(value) {
    return Number.isNaN(value) ? "NaN" : value === Infinity ? "+Inf" : value === -Infinity ? "-Inf" : String(value);
}

// A label's value and a help line, escaped as the text format asks
const escapeValue = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const escapeHelp = (text) => String(text).replace(/\\/g, "\\\\").replace(/\n/g, "\\n");

// `{a="1",b="2"}` for a series' labels (and any more, as a histogram's `le`); nothing for none
function labelText(names, values, more = "") {
    const parts = names.map((name, k) => `${name}="${escapeValue(values[k])}"`);

    if (more) {
        parts.push(more);
    }

    return parts.length ? `{${parts.join(",")}}` : "";
}

// One counter's or gauge's series: a number
class Value {
    constructor() {
        this.value = 0;
    }

    /** More (or, a gauge's, less). */
    inc(by = 1) {
        this.value += by;
    }

    /** What it is now (a gauge). */
    set(value) {
        this.value = value;
    }
}

// One counter's series: it only goes up
class Count extends Value {
    inc(by = 1) {
        if (!(by >= 0)) {
            throw new RangeError(`A counter only goes up: it can't be given ${by}.`);
        }

        this.value += by;
    }

    set() {
        throw new TypeError("A counter is counted up (inc), not set.");
    }

    /** Up to `total`, where what it counts is added up elsewhere and read from there (never down: a lower total is left). */
    rise(total) {
        if (total > this.value) {
            this.value = total;
        }
    }
}

// One histogram's series: how many fell in each bucket (the last, over every bound), how many in
// all and what they came to
class Spread {
    constructor(bounds) {
        this.bounds = bounds;
        this.counts = new Array(bounds.length + 1).fill(0);
        this.count = 0;
        this.sum = 0;
    }

    /** One more (a time, a size). */
    observe(value) {
        const { bounds } = this;
        let k = 0;

        while (k < bounds.length && value > bounds[k]) {
            k++;
        }

        this.counts[k]++;
        this.count++;
        this.sum += value;
    }

    /**
     * Many more at once, counted elsewhere into the same buckets (a world's thread counts its own
     * steps and says how many more since it last said: world-worker.js): `counts` a bucket each,
     * and `sum` what they came to.
     */
    merge({ counts, sum = 0 }) {
        if (counts.length !== this.counts.length) {
            throw new RangeError(`These are ${counts.length} buckets, and the histogram has ${this.counts.length}.`);
        }

        for (let k = 0; k < counts.length; k++) {
            this.counts[k] += counts[k];
            this.count += counts[k];
        }

        this.sum += sum;
    }
}

// A metric: its name, what it is in words, its labels' names, and a series for each set of their
// values it's been asked for
class Metric {
    constructor(type, name, help, labels, make) {
        Object.assign(this, { type, name, help, labels, make });

        /** Its series, by their labels' values: { values, series }. */
        this.all = new Map();
    }

    // The values of its labels, in their order; refused if they aren't exactly its own
    #valuesOf(labels) {
        const given = Object.keys(labels);

        if (given.length !== this.labels.length || !this.labels.every((name) => labels[name] !== undefined)) {
            throw new TypeError(`${this.name} is labelled by ${this.labels.join(", ") || "nothing"}, not ${given.join(", ") || "nothing"}.`);
        }

        return this.labels.map((name) => String(labels[name]));
    }

    /** The series with these labels' values (made at nothing, the first time): keep it, and count into it. */
    with(labels = {}) {
        const values = this.#valuesOf(labels);
        const key = values.join("\u0000");
        let found = this.all.get(key);

        if (!found) {
            found = { values, series: this.make() };
            this.all.set(key, found);
        }

        return found.series;
    }

    /** Every series whose labels have these values let go of (a world deleted: `{ world }`). Returns how many. */
    forget(labels = {}) {
        const wanted = Object.entries(labels).map(([name, value]) => [this.labels.indexOf(name), String(value)]);
        let gone = 0;

        if (wanted.some(([at]) => at < 0)) {
            return 0;
        }

        for (const [key, { values }] of this.all) {
            if (wanted.every(([at, value]) => values[at] === value)) {
                this.all.delete(key);
                gone++;
            }
        }

        return gone;
    }

    /** Counted, set or observed with no labels (a metric that has none). */
    inc(by) {
        this.with().inc(by);
    }

    set(value) {
        this.with().set(value);
    }

    observe(value) {
        this.with().observe(value);
    }

    // Its lines in the text format
    lines() {
        const lines = [`# HELP ${this.name} ${escapeHelp(this.help)}`, `# TYPE ${this.name} ${this.type}`];

        for (const { values, series } of this.all.values()) {
            if (this.type !== "histogram") {
                lines.push(`${this.name}${labelText(this.labels, values)} ${numberOf(series.value)}`);
                continue;
            }

            let below = 0;

            series.bounds.forEach((bound, k) => {
                below += series.counts[k];
                lines.push(`${this.name}_bucket${labelText(this.labels, values, `le="${numberOf(bound)}"`)} ${below}`);
            });
            lines.push(`${this.name}_bucket${labelText(this.labels, values, 'le="+Inf"')} ${series.count}`);
            lines.push(`${this.name}_sum${labelText(this.labels, values)} ${numberOf(series.sum)}`);
            lines.push(`${this.name}_count${labelText(this.labels, values)} ${series.count}`);
        }

        return lines;
    }
}

export class Metrics {
    /**
     * @param {object} [options]
     * @param {string[]} [options.labels] - The labels its metrics may have (none other is taken:
     *   never one that names a player, an address or a key).
     */
    constructor({ labels = [] } = {}) {
        this.allowed = new Set(labels);

        /** Its metrics, by name, in the order they were made. */
        this.metrics = new Map();

        /** What's asked before it's written out (collect): gauges read from where they're kept. */
        this.collectors = [];
    }

    #add(type, name, help, labels, make) {
        if (!NAME.test(name)) {
            throw new TypeError(`${JSON.stringify(name)} isn't a metric's name.`);
        }

        if (this.metrics.has(name)) {
            throw new TypeError(`There's a metric ${name} already.`);
        }

        for (const label of labels) {
            if (!LABEL.test(label) || label === "le" || label.startsWith("__")) {
                throw new TypeError(`${JSON.stringify(label)} isn't a label's name.`);
            }

            if (!this.allowed.has(label)) {
                throw new TypeError(`${name} may not be labelled by ${label}: only by ${[...this.allowed].join(", ") || "nothing"}.`);
            }
        }

        const metric = new Metric(type, name, help, Object.freeze([...labels]), make);

        this.metrics.set(name, metric);

        return metric;
    }

    /** A counter (what only goes up; its name ends `_total`), labelled by `labels`. */
    counter(name, help, labels = []) {
        return this.#add("counter", name, help, labels, () => new Count());
    }

    /** A gauge (what's so now), labelled by `labels`. */
    gauge(name, help, labels = []) {
        return this.#add("gauge", name, help, labels, () => new Value());
    }

    /** A histogram (how many fell under each of `buckets`' bounds, rising; times in seconds), labelled by `labels`. */
    histogram(name, help, labels = [], buckets = TIME_BUCKETS) {
        const bounds = Object.freeze([...buckets]);

        if (!bounds.length || bounds.some((bound, k) => !Number.isFinite(bound) || (k > 0 && bound <= bounds[k - 1]))) {
            throw new RangeError(`${name}'s buckets must be numbers, each more than the one before.`);
        }

        const metric = this.#add("histogram", name, help, labels, () => new Spread(bounds));

        metric.bounds = bounds;

        return metric;
    }

    /** `collector()` called before it's written out or read, to set what's only worth reading then. */
    onCollect(collector) {
        this.collectors.push(collector);
    }

    /** What's only read when asked for, read now. */
    collect() {
        for (const collector of this.collectors) {
            collector();
        }
    }

    /** Every series labelled so let go of, in every metric (a world deleted: `{ world }`). */
    forget(labels) {
        for (const metric of this.metrics.values()) {
            metric.forget(labels);
        }
    }

    /** All of it as Prometheus's text format (version 0.0.4: served as TEXT_TYPE). */
    text() {
        this.collect();

        return `${[...this.metrics.values()].flatMap((metric) => metric.lines()).join("\n")}\n`;
    }
}

/** What Prometheus's text format is served as. */
export const TEXT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

/**
 * The value under which `share` (0-1) of a histogram's observations fell, as near as its buckets
 * say (within the bucket it falls in, as if they were spread evenly: Prometheus's
 * histogram_quantile). `counts` a bucket each (not running totals), the last over every bound:
 * there it's the last bound, the most that can be said. Null with nothing observed.
 */
export function quantile(bounds, counts, share) {
    const total = counts.reduce((sum, count) => sum + count, 0);

    if (!total) {
        return null;
    }

    const rank = share * total;
    let below = 0;

    for (let k = 0; k < bounds.length; k++) {
        if (counts[k] > 0 && below + counts[k] >= rank) {
            const from = k ? bounds[k - 1] : 0;

            return from + ((bounds[k] - from) * Math.max(0, rank - below)) / counts[k];
        }

        below += counts[k];
    }

    return bounds[bounds.length - 1];
}

// A sample line's labels, read back: { name: value }
function labelsOf(text) {
    const labels = {};
    const each = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"\s*,?/gy;
    let found;
    let end = 0;

    while ((found = each.exec(text))) {
        labels[found[1]] = found[2].replace(/\\(.)/g, (_, escaped) => (escaped === "n" ? "\n" : escaped));
        end = each.lastIndex;
    }

    if (end !== text.length) {
        throw new SyntaxError(`These aren't labels: ${text}`);
    }

    return labels;
}

/**
 * Prometheus's text format read back (what a scraper would make of it; for the tests, and for
 * whoever reads a server's /metrics by hand): { name: { type, help, samples: [{ name, labels,
 * value }] } }, a histogram's `_bucket`, `_sum` and `_count` lines under its own name. A line
 * that isn't the format's is refused.
 */
export function parseText(text) {
    const families = {};
    const family = (name) => (families[name] ??= { type: "untyped", help: "", samples: [] });

    for (const line of text.split("\n")) {
        if (!line.trim()) {
            continue;
        }

        const told = /^# (HELP|TYPE) ([a-zA-Z_:][a-zA-Z0-9_:]*) (.*)$/.exec(line);

        if (told) {
            if (told[1] === "TYPE") {
                family(told[2]).type = told[3];
            } else {
                family(told[2]).help = told[3].replace(/\\(.)/g, (_, escaped) => (escaped === "n" ? "\n" : escaped));
            }

            continue;
        }

        if (line.startsWith("#")) {
            continue;
        }

        const sample = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})? (\S+)$/.exec(line);

        if (!sample) {
            throw new SyntaxError(`This isn't a line of Prometheus's text format: ${line}`);
        }

        const [, name, labels = "", number] = sample;
        const value = number === "+Inf" ? Infinity : number === "-Inf" ? -Infinity : Number(number);

        if (Number.isNaN(value) && number !== "NaN") {
            throw new SyntaxError(`This isn't a number: ${number}`);
        }

        const base = name.replace(/_(bucket|sum|count)$/, "");

        (families[base]?.type === "histogram" ? families[base] : family(name)).samples.push({ name, labels: labelsOf(labels), value });
    }

    return families;
}
