// What the world server counts and times (server/metrics.js): counters, gauges and histograms with
// fixed buckets, each series by its labels' values; no label taken but those the registry's told
// of; all of it written as Prometheus's text format, which reads back as what was counted
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { Metrics, parseText, quantile, TEXT_TYPE, TIME_BUCKETS } from "../server/metrics.js";

describe("the metrics registry (server/metrics.js)", () => {
    it("counts up, by its labels' values, and never down", () => {
        const metrics = new Metrics({ labels: ["world", "reason"] });
        const joins = metrics.counter("pellagos_joins_total", "Players come in.", ["world"]);
        const all = metrics.counter("pellagos_requests_total", "Requests.");

        joins.with({ world: "a" }).inc();
        joins.with({ world: "a" }).inc(2);
        joins.with({ world: "b" }).inc();
        all.inc();
        all.inc(4);

        assert.equal(joins.with({ world: "a" }).value, 3);
        assert.equal(joins.with({ world: "b" }).value, 1);
        assert.equal(all.with().value, 5);
        assert.equal(joins.with({ world: "a" }), joins.with({ world: "a" }), "a series is found once, and is the same after");
        assert.throws(() => joins.with({ world: "a" }).inc(-1), RangeError);
        // (Or raised to a total that's added up elsewhere: never lowered)
        all.with().rise(9);
        all.with().rise(7);
        assert.equal(all.with().value, 9);
        assert.throws(() => joins.with({ world: "a" }).set(1), TypeError);
        assert.throws(() => joins.with({}), /labelled by world/);
        assert.throws(() => joins.with({ world: "a", reason: "x" }), /labelled by world/);
    });

    it("keeps what's so now in a gauge, set or moved either way", () => {
        const metrics = new Metrics({ labels: ["world"] });
        const sockets = metrics.gauge("pellagos_sockets", "Sockets open.");
        const heap = metrics.gauge("pellagos_world_heap_bytes", "A world's heap.", ["world"]);

        sockets.set(4);
        sockets.inc();
        sockets.inc(-2);
        heap.with({ world: "a" }).set(1.5e8);

        assert.equal(sockets.with().value, 3);
        assert.equal(heap.with({ world: "a" }).value, 1.5e8);
    });

    it("counts a histogram's observations into fixed buckets, one on a bound in that bound's", () => {
        const metrics = new Metrics();
        const steps = metrics.histogram("pellagos_step_seconds", "A step.", [], [0.01, 0.05, 0.1]);
        const series = steps.with();

        for (const value of [0.001, 0.01, 0.02, 0.05, 0.07, 0.2, 3]) {
            steps.observe(value);
        }

        assert.deepEqual(series.counts, [2, 2, 1, 2]);
        assert.equal(series.count, 7);
        assert.ok(Math.abs(series.sum - 3.351) < 1e-9);
        assert.ok(TIME_BUCKETS.includes(0.05), "a step (50 ms) is one of the bounds of a histogram of times");
        assert.throws(() => metrics.histogram("pellagos_bad_seconds", "Bad.", [], [0.1, 0.05]), RangeError);
        assert.throws(() => metrics.histogram("pellagos_none_seconds", "None.", [], []), RangeError);
    });

    it("takes into a histogram what was counted elsewhere into the same buckets", () => {
        const metrics = new Metrics({ labels: ["world"] });
        const steps = metrics.histogram("pellagos_step_seconds", "A step.", ["world"], [0.01, 0.05]);
        const series = steps.with({ world: "a" });

        series.observe(0.02);
        series.merge({ counts: [3, 1, 2], sum: 0.5 });
        series.merge({ counts: [0, 0, 0] });

        assert.deepEqual(series.counts, [3, 2, 2]);
        assert.equal(series.count, 7);
        assert.ok(Math.abs(series.sum - 0.52) < 1e-9);
        assert.throws(() => series.merge({ counts: [1, 2], sum: 0 }), RangeError);
    });

    it("takes no label but those it was told of, so none can name a player, an address or a key", () => {
        const metrics = new Metrics({ labels: ["world", "thread"] });

        assert.throws(() => metrics.counter("pellagos_joins_total", "Joins.", ["player"]), /may not be labelled by player/);
        assert.throws(() => metrics.gauge("pellagos_sockets", "Sockets.", ["address"]), /may not be labelled by address/);
        assert.throws(() => metrics.histogram("pellagos_step_seconds", "Steps.", ["le"]), /isn't a label's name/);
        assert.throws(() => metrics.counter("pellagos joins", "Joins."), /isn't a metric's name/);
        metrics.counter("pellagos_joins_total", "Joins.", ["world", "thread"]);
        assert.throws(() => metrics.counter("pellagos_joins_total", "Joins again."), /already/);
    });

    it("lets go of a world's series, in every metric, and of no other's", () => {
        const metrics = new Metrics({ labels: ["world", "reason"] });
        const joins = metrics.counter("pellagos_joins_total", "Joins.", ["world"]);
        const closed = metrics.counter("pellagos_closed_total", "Closed.", ["world", "reason"]);
        const refused = metrics.counter("pellagos_refused_total", "Refused.", ["reason"]);

        joins.with({ world: "a" }).inc();
        joins.with({ world: "b" }).inc();
        closed.with({ world: "a", reason: "afk" }).inc();
        closed.with({ world: "a", reason: "kicked" }).inc();
        closed.with({ world: "b", reason: "afk" }).inc();
        refused.with({ reason: "full" }).inc();
        metrics.forget({ world: "a" });

        const read = parseText(metrics.text());

        assert.deepEqual(read.pellagos_joins_total.samples.map((sample) => sample.labels), [{ world: "b" }]);
        assert.deepEqual(read.pellagos_closed_total.samples.map((sample) => sample.labels), [{ world: "b", reason: "afk" }]);
        assert.equal(read.pellagos_refused_total.samples.length, 1);
    });

    it("reads what's only worth reading when asked, just before it's written out", () => {
        const metrics = new Metrics();
        const memory = metrics.gauge("pellagos_memory_bytes", "Memory.");
        let asked = 0;

        metrics.onCollect(() => memory.set(++asked * 100));
        assert.equal(parseText(metrics.text()).pellagos_memory_bytes.samples[0].value, 100);
        assert.equal(parseText(metrics.text()).pellagos_memory_bytes.samples[0].value, 200);
    });
});

describe("Prometheus's text format (server/metrics.js text, parseText)", () => {
    it("writes each metric with its help and type, and reads back as what was counted", () => {
        const metrics = new Metrics({ labels: ["world", "reason"] });
        const joins = metrics.counter("pellagos_joins_total", "Players come in,\nby world.", ["world"]);
        const sockets = metrics.gauge("pellagos_sockets", "Sockets open.");
        const steps = metrics.histogram("pellagos_step_seconds", "A step.", ["world"], [0.01, 0.05, 0.1]);

        joins.with({ world: "a" }).inc(3);
        joins.with({ world: 'the "old" one\\\n' }).inc();
        sockets.set(2.5);

        for (const value of [0.001, 0.02, 0.02, 0.07, 4]) {
            steps.with({ world: "a" }).observe(value);
        }

        const text = metrics.text();
        const read = parseText(text);

        assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
        assert.match(TEXT_TYPE, /^text\/plain; version=0\.0\.4/);
        assert.match(text, /^# HELP pellagos_joins_total Players come in,\\nby world\.\n# TYPE pellagos_joins_total counter\n/);
        assert.deepEqual(Object.keys(read), ["pellagos_joins_total", "pellagos_sockets", "pellagos_step_seconds"]);
        assert.deepEqual(read.pellagos_joins_total, {
            type: "counter",
            help: "Players come in,\nby world.",
            samples: [
                { name: "pellagos_joins_total", labels: { world: "a" }, value: 3 },
                { name: "pellagos_joins_total", labels: { world: 'the "old" one\\\n' }, value: 1 },
            ],
        });
        assert.deepEqual(read.pellagos_sockets.samples, [{ name: "pellagos_sockets", labels: {}, value: 2.5 }]);
        assert.equal(read.pellagos_step_seconds.type, "histogram");
        // (A histogram's buckets are running totals, each with its bound as `le`, the last over all)
        assert.deepEqual(
            read.pellagos_step_seconds.samples.map(({ name, labels, value }) => [name.replace("pellagos_step_seconds", ""), labels.le ?? null, value]),
            [
                ["_bucket", "0.01", 1],
                ["_bucket", "0.05", 3],
                ["_bucket", "0.1", 4],
                ["_bucket", "+Inf", 5],
                ["_sum", null, 4.111],
                ["_count", null, 5],
            ],
        );
        assert.ok(read.pellagos_step_seconds.samples.every((sample) => sample.labels.world === "a"));
    });

    it("writes a metric nothing's been counted in with its help and type alone, and numbers that aren't finite as the format has them", () => {
        const metrics = new Metrics();

        metrics.counter("pellagos_never_total", "Never.");
        metrics.gauge("pellagos_odd", "Odd.").set(Infinity);

        const text = metrics.text();

        assert.equal(text, "# HELP pellagos_never_total Never.\n# TYPE pellagos_never_total counter\n# HELP pellagos_odd Odd.\n# TYPE pellagos_odd gauge\npellagos_odd +Inf\n");
        assert.equal(parseText(text).pellagos_odd.samples[0].value, Infinity);
        assert.deepEqual(parseText(text).pellagos_never_total.samples, []);
    });

    it("refuses to read what isn't the format", () => {
        assert.throws(() => parseText("pellagos_sockets two\n"), SyntaxError);
        assert.throws(() => parseText("pellagos sockets 2\n"), SyntaxError);
        assert.throws(() => parseText('pellagos_sockets{world="a} 2\n'), SyntaxError);
        assert.deepEqual(parseText("# a comment\n\npellagos_sockets 2\n").pellagos_sockets.samples[0].value, 2);
    });
});

describe("a histogram's percentiles (server/metrics.js quantile)", () => {
    it("says under which value a share of the observations fell, as near as the buckets say", () => {
        const bounds = [0.01, 0.05, 0.1];

        assert.equal(quantile(bounds, [0, 0, 0, 0], 0.99), null);
        assert.equal(quantile(bounds, [10, 0, 0, 0], 0.5), 0.005);
        assert.equal(quantile(bounds, [0, 100, 0, 0], 0.5), 0.03);
        assert.ok(Math.abs(quantile(bounds, [90, 10, 0, 0], 0.99) - 0.046) < 1e-9);
        // (Over every bound, it's the last bound: the most that can be said)
        assert.equal(quantile(bounds, [0, 0, 0, 5], 0.99), 0.1);
        assert.equal(quantile(bounds, [99, 0, 0, 1], 0.99), 0.01);
    });
});

describe("the metrics' dependencies", () => {
    it("has none: the registry is JavaScript alone, as the server has no package to run on", async () => {
        const source = await readFile(new URL("../server/metrics.js", import.meta.url), "utf8");

        assert.doesNotMatch(source, /^import /m);
    });
});
