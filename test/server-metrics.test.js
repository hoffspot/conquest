// How the world server's running, as numbers: what a world's thread counts of itself and tells a
// second's worth at a time (server/world-metrics.js), and the supervisor adding it up into the
// one registry (server/server-metrics.js), labelled by world and thread, never by a player
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { StepTimes, TIME_BUCKETS } from "../client/js/core/runner.js";
import { metricsCost, METRICS_BUDGET } from "../scripts/step-budget.js";
import { parseText, TIME_BUCKETS as SECONDS } from "../server/metrics.js";
import { LABELS, ServerMetrics } from "../server/server-metrics.js";
import { Collections, GC_KINDS, LoopDelay, WorldMetrics } from "../server/world-metrics.js";

const total = (counts) => counts.reduce((sum, count) => sum + count, 0);

// What a registry holds, read back as a scraper would; and one sample's value by its name and labels
const read = (server) => parseText(server.registry.text());
const valueOf = (families, name, labels = {}) => {
    const family = families[name.replace(/_(bucket|sum|count)$/, "")] ?? families[name];

    return family?.samples.find((sample) => sample.name === name && Object.entries(labels).every(([label, value]) => sample.labels[label] === value))?.value;
};

// A world's `state` message, as its thread would send it after `steps` steps of `ms` each
function stateOf(metrics, times, { steps = 20, ms = 2, players = [{ id: "K7Q2MXD4RT.1" }, { id: null }], ...more } = {}) {
    for (let k = 0; k < steps; k++) {
        times.add(ms, k * STEP_MS);
        metrics.tick(ms + 1, 0.25, k * STEP_MS);
    }

    return { running: true, present: 1, players, actors: 40, memory: { heap: 9e7, external: 2e7 }, ...more, metrics: metrics.take({ steps: times, ...more.taking }) };
}

describe("what a world's thread counts of itself (server/world-metrics.js)", () => {
    it("counts each look at the world and its two parts, and tells what's been counted since it last told", () => {
        const metrics = new WorldMetrics({ node: false });
        const times = new StepTimes();

        metrics.tick(3, 1, 50);
        metrics.tick(60, 30, 100);
        metrics.saved(12, true);
        metrics.saved(700, false);
        metrics.heard("command");
        metrics.heard("command");
        metrics.heard("ping");
        metrics.heard(undefined);
        times.add(2.5, 50);

        const first = metrics.take({ steps: times, dropped: 100, cpu: { user: 5000, system: 1000 }, made: { chunks: 3, rooms: 7 } });

        assert.equal(metrics.ticks.count, 2);
        assert.equal(metrics.ticks.worst, 90, "a look's time is its parts' together");
        assert.equal(total(first.ticks.counts), 2);
        assert.equal(first.ticks.sum, 94);
        assert.equal(first.advance.sum, 63);
        assert.equal(first.ahead.sum, 31);
        assert.equal(total(first.steps.counts), 1);
        assert.equal(total(first.saves.counts), 2);
        assert.deepEqual([first.failures, first.messages, first.commands], [1, 4, 2]);
        assert.deepEqual([first.dropped, first.cpu, first.made], [100, { user: 5000, system: 1000 }, { chunks: 3, rooms: 7 }]);
        assert.deepEqual([first.loop, first.gc], [null, {}]);

        // (Asked again: only what's come since. What's kept elsewhere as a running total, the
        // time let go, the thread's CPU and what's made ahead, is told as how much more)
        metrics.tick(1, 1, 150);

        const second = metrics.take({ steps: times, dropped: 250, cpu: { user: 5600, system: 1000 }, made: { chunks: 3, rooms: 9 } });

        assert.equal(total(second.ticks.counts), 1);
        assert.equal(total(second.steps.counts), 0);
        assert.equal(total(second.saves.counts), 0);
        assert.deepEqual([second.failures, second.messages, second.commands], [0, 0, 0]);
        assert.deepEqual([second.dropped, second.cpu, second.made], [150, { user: 600, system: 0 }, { chunks: 0, rooms: 2 }]);
        // (And survives being sent between threads as it is: plain data)
        assert.deepEqual(structuredClone(second), second);
    });

    it("counts a thread's garbage collections by kind, as Node names them", () => {
        const collections = new Collections();

        assert.deepEqual(Object.values(GC_KINDS).sort(), ["incremental", "major", "minor", "weak"]);
        collections.add("minor", 1.5);
        collections.add("minor", 0.5);
        collections.add("major", 20);

        const taken = collections.take();

        assert.ok(taken.minor.count >= 2 && taken.minor.ms >= 2 && taken.major.count >= 1, JSON.stringify(taken));
        collections.stop();
        assert.deepEqual(collections.take(), {});
    });

    it("says how late a thread's event loop ran: nothing till it's sampled, then a hold-up as about what it was", async () => {
        const loop = new LoopDelay();

        assert.equal(loop.take(), null);
        await new Promise((resolve) => setTimeout(resolve, 40));

        // (The thread held for 80 ms: whatever was due meanwhile came that late)
        const started = Date.now();

        while (Date.now() - started < 80) {
            // held
        }

        await new Promise((resolve) => setTimeout(resolve, 40));

        const taken = loop.take();

        loop.stop();
        assert.ok(taken.max >= 40 && taken.max < 2000, JSON.stringify(taken));
        assert.ok(taken.mean >= 0 && taken.mean <= taken.max && taken.p99 <= taken.max, JSON.stringify(taken));
        assert.equal(loop.take(), null, "stopped, it says nothing");
    });

    it("costs a step far less than it may: what's counted of each, timed many times over (scripts/step-budget.js)", () => {
        const cost = metricsCost(20000);

        assert.ok(cost < METRICS_BUDGET, `${(cost * 1000).toFixed(2)} µs a step, and it may cost ${METRICS_BUDGET * 1000}`);
    });
});

describe("the supervisor adding up what its worlds count (server/server-metrics.js)", () => {
    it("keeps its histograms in the buckets the threads count into, in seconds", () => {
        assert.deepEqual(SECONDS, TIME_BUCKETS.map((ms) => ms / 1000));
    });

    it("adds a world's counts to its series each time it tells of them, and sets what's so now", () => {
        const server = new ServerMetrics();
        const metrics = new WorldMetrics({ node: false });
        const times = new StepTimes();

        server.heard("w1", stateOf(metrics, times, { steps: 20, ms: 2, taking: { dropped: 0, cpu: { user: 2e6, system: 5e5 }, made: { chunks: 4, rooms: 1 } } }));
        metrics.saved(30, true);
        metrics.saved(30, false);
        metrics.heard("command");
        metrics.heard("ready");
        server.heard("w1", stateOf(metrics, times, { steps: 10, ms: 60, actors: 55, present: 0, running: false, taking: { dropped: 500, cpu: { user: 3e6, system: 5e5 }, made: { chunks: 4, rooms: 6 } } }));
        server.heard("w2", stateOf(new WorldMetrics({ node: false }), new StepTimes(), { steps: 5, players: [] }));

        const families = read(server);
        const w1 = { world: "w1" };

        assert.equal(families.pellagos_world_step_seconds.type, "histogram");
        assert.equal(valueOf(families, "pellagos_world_step_seconds_count", w1), 30);
        assert.equal(valueOf(families, "pellagos_world_step_seconds_count", { world: "w2" }), 5);
        assert.ok(Math.abs(valueOf(families, "pellagos_world_step_seconds_sum", w1) - (20 * 2 + 10 * 60) / 1000) < 1e-9, "times are seconds");
        // (20 steps of 2 ms are no longer than a step; 10 of 60 ms are)
        assert.equal(valueOf(families, "pellagos_world_step_seconds_bucket", { ...w1, le: "0.05" }), 20);
        assert.equal(valueOf(families, "pellagos_world_step_seconds_bucket", { ...w1, le: "+Inf" }), 30);
        assert.equal(valueOf(families, "pellagos_world_tick_seconds_count", w1), 30);
        assert.equal(valueOf(families, "pellagos_world_tick_part_seconds_count", { ...w1, kind: "advance" }), 30);
        assert.ok(Math.abs(valueOf(families, "pellagos_world_tick_part_seconds_sum", { ...w1, kind: "ahead" }) - (30 * 0.25) / 1000) < 1e-9);
        assert.equal(valueOf(families, "pellagos_world_save_seconds_count", w1), 2);
        assert.equal(valueOf(families, "pellagos_world_save_failures_total", w1), 1);
        assert.equal(valueOf(families, "pellagos_world_messages_total", w1), 2);
        assert.equal(valueOf(families, "pellagos_world_commands_total", w1), 1);
        assert.equal(valueOf(families, "pellagos_world_dropped_seconds_total", w1), 0.5);
        assert.equal(valueOf(families, "pellagos_world_cpu_seconds_total", { ...w1, kind: "user" }), 3);
        assert.equal(valueOf(families, "pellagos_world_cpu_seconds_total", { ...w1, kind: "system" }), 0.5);
        assert.equal(valueOf(families, "pellagos_world_made_ahead_total", { ...w1, kind: "rooms" }), 6);
        // (What's so now is the latest said: who's in it by their heroes, not by links alone)
        assert.equal(valueOf(families, "pellagos_world_actors", w1), 55);
        assert.equal(valueOf(families, "pellagos_world_players", w1), 1);
        assert.equal(valueOf(families, "pellagos_world_present", w1), 0);
        assert.equal(valueOf(families, "pellagos_world_running", w1), 0);
        assert.equal(valueOf(families, "pellagos_heap_bytes", { thread: "world", ...w1 }), 9e7);
        assert.equal(valueOf(families, "pellagos_external_bytes", { thread: "world", ...w1 }), 2e7);
    });

    it("sets how late a world's thread ran and counts its collections, by kind", () => {
        const server = new ServerMetrics();
        const state = stateOf(new WorldMetrics({ node: false }), new StepTimes());

        state.metrics.loop = { mean: 1.5, p99: 12, max: 40 };
        state.metrics.gc = { minor: { count: 9, ms: 18 }, major: { count: 1, ms: 30 } };
        server.heard("w1", state);
        state.metrics.gc = { minor: { count: 1, ms: 2 } };
        server.heard("w1", state);

        const families = read(server);
        const thread = { thread: "world", world: "w1" };

        assert.equal(valueOf(families, "pellagos_event_loop_delay_mean_seconds", thread), 0.0015);
        assert.equal(valueOf(families, "pellagos_event_loop_delay_p99_seconds", thread), 0.012);
        assert.equal(valueOf(families, "pellagos_event_loop_delay_max_seconds", thread), 0.04);
        assert.equal(valueOf(families, "pellagos_gc_total", { ...thread, kind: "minor" }), 10);
        assert.ok(Math.abs(valueOf(families, "pellagos_gc_seconds_total", { ...thread, kind: "minor" }) - 0.02) < 1e-9);
        assert.equal(valueOf(families, "pellagos_gc_total", { ...thread, kind: "major" }), 1);
    });

    it("lets go of what was so of a world while it ran once it's set aside, keeping what it counted; and of all of it once it's deleted", () => {
        const server = new ServerMetrics();
        const metrics = new WorldMetrics({ node: false });
        const times = new StepTimes();

        server.heard("w1", stateOf(metrics, times));
        server.heard("w2", stateOf(new WorldMetrics({ node: false }), new StepTimes()));
        server.setAside("w1");

        let families = read(server);

        assert.equal(valueOf(families, "pellagos_world_players", { world: "w1" }), undefined);
        assert.equal(valueOf(families, "pellagos_heap_bytes", { world: "w1" }), undefined);
        assert.equal(valueOf(families, "pellagos_world_players", { world: "w2" }), 1);
        assert.equal(valueOf(families, "pellagos_world_step_seconds_count", { world: "w1" }), 20);

        // (Started again, a thread of its own counting from nothing: its series carry on)
        server.heard("w1", stateOf(new WorldMetrics({ node: false }), new StepTimes(), { steps: 5 }));
        assert.equal(valueOf(read(server), "pellagos_world_step_seconds_count", { world: "w1" }), 25);

        server.forget("w1");
        families = read(server);
        assert.equal(valueOf(families, "pellagos_world_step_seconds_count", { world: "w1" }), undefined);
        assert.equal(valueOf(families, "pellagos_world_step_seconds_count", { world: "w2" }), 20);
    });

    it("takes a world that's said nothing yet, or one of a server before this (no counts in what it says)", () => {
        const server = new ServerMetrics();

        server.heard("w1", null);
        server.heard("w1", { running: false, present: 0, players: [], actors: 3, memory: { heap: 1, external: 2 } });

        const families = read(server);

        assert.equal(valueOf(families, "pellagos_world_actors", { world: "w1" }), 3);
        assert.deepEqual(families.pellagos_world_step_seconds.samples, []);
    });

    it("counts who's let in by world and what's refused by why, keeping nothing else of either", () => {
        const server = new ServerMetrics();

        server.event("entered", { world: "w1", player: "K7Q2MXD4RT", role: "player", label: "Players' key", address: "203.0.113.7" });
        server.event("entered", { world: "w1", player: "B3B3B3B3B3", role: "owner", label: "The owner's key", address: "203.0.113.8" });
        server.event("refused", { why: "key", address: "203.0.113.9" });
        server.event("refused", { why: "key", world: "w1", address: "203.0.113.9" });
        server.event("refused", { why: "bad-request", address: "203.0.113.9" });
        // (A why that isn't one of the server's short codes is no label of its own)
        server.event("refused", { why: "203.0.113.9 said: hello there", address: "203.0.113.9" });
        server.event("refused", {});
        server.event("left", { world: "w1", player: "K7Q2MXD4RT" });
        server.event("keyIssued", { world: "w1", label: "Sam's key" });

        const text = server.registry.text();
        const families = parseText(text);

        assert.equal(valueOf(families, "pellagos_joins_total", { world: "w1" }), 2);
        assert.equal(valueOf(families, "pellagos_refusals_total", { reason: "key" }), 2);
        assert.equal(valueOf(families, "pellagos_refusals_total", { reason: "bad-request" }), 1);
        assert.equal(valueOf(families, "pellagos_refusals_total", { reason: "other" }), 2);
        assert.doesNotMatch(text, /K7Q2MXD4RT|B3B3B3B3B3|203\.0\.113|Sam|owner's key|Players' key/);
    });

    it("reads the play socket's sockets, backlog and traffic, its worlds' lives and its memory when it's asked, and lets go of a world it no longer has", () => {
        const server = new ServerMetrics();
        const socket = (waiting) => ({ socket: { writableLength: waiting } });
        const watched = {
            worlds: new Map([["w1", {}], ["w2", {}], ["w3", {}]]),
            registry: { lifeOf: (id) => ({ life: { w1: "running", w2: "stored", w3: "stored" }[id] }) },
            play: {
                sockets: new Set([socket(0), socket(4000), socket(1000)]),
                places: new Map([["w1 p1", {}], ["w1 p2", {}]]),
                closed: new Map([["afk", 2], ["server-stopping", 1]]),
                traffic: new Map([["w1", { messages: 10, bytes: 5000, wire: 1200, received: 300 }], ["gone", { messages: 1, bytes: 1, wire: 1, received: 1 }]]),
            },
        };

        server.watch(watched);
        server.heard("w1", { running: true, present: 2, players: [], actors: 1, memory: { heap: 1, external: 1 } });

        let families = read(server);

        assert.equal(valueOf(families, "pellagos_play_sockets"), 3);
        assert.equal(valueOf(families, "pellagos_play_places"), 2);
        assert.equal(valueOf(families, "pellagos_play_backlog_bytes"), 5000);
        assert.equal(valueOf(families, "pellagos_play_backlog_max_bytes"), 4000);
        assert.equal(valueOf(families, "pellagos_play_closed_total", { reason: "afk" }), 2);
        assert.equal(valueOf(families, "pellagos_play_sent_bytes_total", { world: "w1" }), 5000);
        assert.equal(valueOf(families, "pellagos_play_sent_wire_bytes_total", { world: "w1" }), 1200);
        assert.equal(valueOf(families, "pellagos_play_sent_messages_total", { world: "w1" }), 10);
        assert.equal(valueOf(families, "pellagos_play_received_bytes_total", { world: "w1" }), 300);
        assert.equal(valueOf(families, "pellagos_play_sent_bytes_total", { world: "gone" }), undefined, "no series for a world the server hasn't got");
        assert.deepEqual(Object.fromEntries(families.pellagos_worlds.samples.map((sample) => [sample.labels.kind, sample.value])), { stored: 2, waiting: 0, loading: 0, running: 1, empty: 0, stopping: 0 });
        assert.ok(valueOf(families, "pellagos_rss_bytes") > 1e6);
        assert.ok(valueOf(families, "pellagos_heap_bytes", { thread: "supervisor", world: "" }) > 1e5);
        assert.ok(valueOf(families, "pellagos_start_time_seconds") > 1.7e9);

        // (More sent, and asked again: its totals are the socket's own, never less than they were)
        watched.play.traffic.get("w1").bytes = 9000;
        watched.play.closed.set("afk", 3);
        watched.play.sockets.clear();
        families = read(server);
        assert.equal(valueOf(families, "pellagos_play_sent_bytes_total", { world: "w1" }), 9000);
        assert.equal(valueOf(families, "pellagos_play_closed_total", { reason: "afk" }), 3);
        assert.equal(valueOf(families, "pellagos_play_backlog_bytes"), 0);

        // (The world deleted: nothing's said of it again)
        watched.worlds.delete("w1");
        families = read(server);
        assert.doesNotMatch(server.registry.text(), /world="w1"/);
        assert.equal(valueOf(families, "pellagos_worlds", { kind: "running" }), 0);
    });

    it("samples the supervisor's own event loop and collections once it's started, and stops", async () => {
        const server = new ServerMetrics();

        server.sample();
        assert.deepEqual(read(server).pellagos_event_loop_utilization.samples, [], "nothing till it's started");
        server.start(60000);
        server.start(60000);
        await new Promise((resolve) => setTimeout(resolve, 60));

        const held = Date.now();

        while (Date.now() - held < 50) {
            // busy
        }

        await new Promise((resolve) => setTimeout(resolve, 30));
        server.sample();

        const families = read(server);
        const supervisor = { thread: "supervisor", world: "" };
        const busy = valueOf(families, "pellagos_event_loop_utilization");

        assert.ok(busy > 0.1 && busy <= 1, `${busy}`);
        assert.ok(valueOf(families, "pellagos_event_loop_delay_max_seconds", supervisor) >= 0.02, "held for 50 ms, whatever was due came late");
        assert.ok(valueOf(families, "pellagos_event_loop_delay_mean_seconds", supervisor) >= 0);
        server.stop();
        server.sample();
        server.stop();
    });

    it("labels its series by world, thread, kind and reason alone: never by a player, an address or a key", () => {
        const server = new ServerMetrics();

        assert.deepEqual([...LABELS].sort(), ["kind", "reason", "thread", "world"]);

        for (const metric of server.registry.metrics.values()) {
            assert.match(metric.name, /^pellagos_[a-z0-9_]+$/);
            assert.ok(metric.help.length > 10, `${metric.name} says what it is`);
            assert.ok(metric.labels.every((label) => LABELS.includes(label)), `${metric.name}: ${metric.labels}`);
            assert.equal(metric.type === "counter", metric.name.endsWith("_total"), `${metric.name}: a counter's name ends _total, and no other's`);
        }

        assert.throws(() => server.registry.counter("pellagos_player_joins_total", "Joins, by player.", ["player"]), /may not be labelled by player/);
    });
});
