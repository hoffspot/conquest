// What the world server remembers of how it's been running (server/history.js): a ring of the last
// day and one of the last week for each thing charted, gaps where nothing was measured, kept in a
// file across restarts; and its points measured from the server's metrics
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import { CHART_POINTS, CHARTED, History, HISTORY_FILE, HISTORY_FORMAT, Ring, RINGS, samplerOf } from "../server/history.js";
import { ServerMetrics } from "../server/server-metrics.js";
import { WorldServer } from "../server/world-server.js";

const made = [];

after(async () => {
    for (const folder of made) {
        await rm(folder, { recursive: true, force: true });
    }
});

async function folderOf() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-history-"));

    made.push(folder);

    return folder;
}

const HOUR = 3600000;
const DAY = 24 * HOUR;
// (A time of day that's a whole number of both rings' steps)
const NOON = Date.UTC(2026, 10, 12, 12);

describe("a ring of points (server/history.js Ring)", () => {
    it("keeps a day at ten seconds and a week at five minutes", () => {
        assert.equal(RINGS.day.step * RINGS.day.points, DAY);
        assert.equal(RINGS.week.step * RINGS.week.points, 7 * DAY);
        assert.equal(RINGS.day.step, 10000);
        assert.equal(RINGS.week.step, 300000);
    });

    it("keeps its newest points, oldest first, with gaps where nothing was measured, and forgets what's older than it holds", () => {
        const ring = new Ring({ step: 10, points: 4 });

        assert.ok(ring.empty);
        assert.deepEqual(ring.read(5), [null, null, null, null]);
        ring.put(ring.slotOf(100), 1);
        ring.put(ring.slotOf(119), 2);
        assert.deepEqual(ring.read(), [null, null, 1, 2]);
        // (Two slots never measured, then one that was)
        ring.put(14, 5);
        assert.deepEqual(ring.read(), [2, null, null, 5]);
        // (The same slot again: its latest; and read later, what's moved out of it is gone)
        ring.put(14, 6);
        assert.deepEqual(ring.read(), [2, null, null, 6]);
        assert.deepEqual(ring.read(16), [null, 6, null, null]);
        assert.deepEqual(ring.read(100), [null, null, null, null]);
        // (Long after: nothing of before is left to be read as if it were new)
        ring.put(1000, 9);
        assert.deepEqual(ring.read(), [null, null, null, 9]);
        assert.ok(!ring.empty);
    });

    it("comes back from what it was kept as, and starts afresh from anything else", () => {
        const ring = new Ring({ step: 10, points: 4 });

        ring.put(7, 1.5);
        ring.put(9, 2.5);

        const kept = JSON.parse(JSON.stringify(ring));
        const back = Ring.from({ step: 10, points: 4 }, kept);

        assert.deepEqual(back.read(), [null, 1.5, null, 2.5]);
        assert.equal(back.end, 9);
        assert.ok(Ring.from({ step: 10, points: 8 }, kept).empty, "a ring of another size isn't this one");
        assert.ok(Ring.from({ step: 10, points: 4 }, { end: "9", values: kept.values }).empty);
        assert.ok(Ring.from({ step: 10, points: 4 }, null).empty);
    });
});

describe("the server's history (server/history.js History)", () => {
    it("takes a point of each thing into its day, and makes its week's five minutes of them: the worst of what's judged by its worst, the mean of the rest", () => {
        const history = new History();

        for (let k = 0; k < 30; k++) {
            history.record(NOON + k * 10000, [
                { id: "step-p99", world: "w1", value: k === 7 ? 80 : 4 },
                { id: "pace", world: "w1", value: k < 15 ? 1 : 0.5 },
                { id: "rss", value: 2e8 + k },
                { id: "no-such-thing", value: 1 },
                { id: "sent", value: NaN },
            ]);
        }

        const day = history.read("day", NOON + 299999);
        const week = history.read("week", NOON + 299999);
        const of = (read, id) => read.series.find((one) => one.id === id);

        assert.deepEqual(day.series.map((one) => one.id), ["step-p99", "pace", "rss"], "what isn't charted, or isn't a number, is left out");
        assert.equal(day.step, 10000);
        assert.equal(day.end, NOON + 300000);
        assert.equal(of(day, "step-p99").values.length, RINGS.day.points);
        assert.deepEqual(of(day, "step-p99").values.slice(-30).map((value, k) => [k, value]).filter(([, value]) => value !== 4), [[7, 80]]);
        assert.ok(of(day, "step-p99").values.slice(0, -30).every((value) => value === null));
        assert.deepEqual([of(day, "step-p99").world, of(day, "step-p99").unit, of(day, "step-p99").limit, of(day, "step-p99").title], ["w1", "ms", 50, CHARTED["step-p99"].title]);
        assert.equal(of(day, "rss").world, null);
        assert.equal(week.step, 300000);
        assert.equal(of(week, "step-p99").values.at(-1), 80, "five minutes' slowest");
        assert.equal(of(week, "pace").values.at(-1), 0.75, "five minutes' mean");
        assert.equal(of(week, "step-p99").values.filter((value) => value !== null).length, 1);
        assert.equal(history.read("fortnight", NOON).span, "day", "any other span is the day");
    });

    it("gives the page no more points than it can draw: neighbours folded together, as a week's are", () => {
        const history = new History();

        for (let k = 0; k < 24; k++) {
            history.record(NOON + k * 10000, [{ id: "step-p99", world: "w1", value: k === 3 ? 90 : 5 }, { id: "pace", world: "w1", value: k < 12 ? 1 : 0 }]);
        }

        const read = history.read("day", NOON + 239999, { most: CHART_POINTS });
        const steps = read.series.find((one) => one.id === "step-p99").values;
        const pace = read.series.find((one) => one.id === "pace").values;

        assert.equal(read.step, 120000, "a day, a point every two minutes");
        assert.equal(steps.length, CHART_POINTS);
        assert.deepEqual(steps.slice(-3), [null, 90, 5]);
        assert.deepEqual(pace.slice(-3), [null, 1, 0]);
        assert.equal(history.read("week", NOON, { most: CHART_POINTS }).step, 900000, "a week, every fifteen");
    });

    it("is kept in its file and read back after a restart: the day before still there, the time it was down a gap", async () => {
        const file = path.join(await folderOf(), HISTORY_FILE);
        const history = await History.open(file);

        // (A day and a bit of a world running, a point every ten seconds)
        for (let at = NOON - DAY - HOUR; at < NOON; at += 10000) {
            history.record(at, [{ id: "step-p99", world: "w1", value: 3 + ((at / 10000) % 5) }, { id: "rss", value: 3e8 }]);
        }

        await history.save();

        const kept = JSON.parse(gunzipSync(await readFile(file)).toString("utf8"));

        assert.equal(kept.format, HISTORY_FORMAT);
        assert.ok((await readFile(file)).length < 200000, "small on the disk");

        // (The server down ten minutes, then started again)
        const again = await History.open(file);
        const restarted = NOON + 600000;

        again.record(restarted, [{ id: "step-p99", world: "w1", value: 7 }, { id: "rss", value: 4e8 }]);

        const day = again.read("day", restarted).series.find((one) => one.id === "step-p99").values;
        const week = again.read("week", restarted).series.find((one) => one.id === "step-p99").values;

        assert.equal(day.length, RINGS.day.points);
        assert.equal(day.at(-1), 7);
        assert.ok(day.slice(-61, -1).every((value) => value === null), "nothing was measured while it was down");
        assert.ok(day.slice(0, -61).every((value) => value >= 3 && value <= 7), "every point of the rest of the last 24 hours is there");
        assert.equal(day.filter((value) => value !== null).length, RINGS.day.points - 60);
        assert.equal(week.filter((value) => value !== null).length, 25 * 12 + 1, "and the week's: the 25 hours before, and now");
        assert.equal(week.at(-1), 7);
        assert.deepEqual(week.slice(-3, -1), [null, null]);

        // (A week on with nothing measured: none of it is shown as if it were new)
        assert.deepEqual((await History.open(file)).read("day", NOON + 8 * DAY).series, []);
    });

    it("starts afresh from a file that isn't one, and keeps nothing of a world that's deleted", async () => {
        const file = path.join(await folderOf(), HISTORY_FILE);

        await writeFile(file, "not gzip");
        assert.deepEqual((await History.open(file)).read("day", NOON).series, []);
        assert.deepEqual((await History.open(path.join(path.dirname(file), "none.json.gz"))).read("day", NOON).series, []);
        assert.deepEqual(new History({ kept: { format: HISTORY_FORMAT, series: [{ id: "nothing", world: null }, null, { id: "rss", world: 4 }] } }).read("day", NOON).series, []);

        const history = new History();

        history.record(NOON, [{ id: "actors", world: "w1", value: 3 }, { id: "actors", world: "w2", value: 4 }, { id: "rss", value: 1 }]);
        history.forget("w1");
        assert.deepEqual(history.read("day", NOON).series.map((one) => one.world), ["w2", null]);
        await history.save();
    });
});

describe("the history's points, measured from the server's metrics (server/history.js samplerOf)", () => {
    it("says each world's slowest steps, pace, players and memory since it was last asked, and the server's own", () => {
        const metrics = new ServerMetrics();
        const time = { now: 0 };
        const buckets = (ms, count) => {
            const counts = new Array(15).fill(0);

            counts[[0.5, 1, 2, 5, 10, 20, 35, 50, 75, 100, 150, 250, 500, 1000].findIndex((bound) => ms <= bound)] = count;

            return { counts, sum: ms * count };
        };
        const none = buckets(1, 0);
        const state = (steps, more = {}) => ({ running: true, present: 2, players: [{ id: "a" }, { id: "b" }], actors: 30, memory: { heap: 9e7, external: 1e7 }, metrics: { steps, ticks: steps, advance: none, ahead: none, saves: none, failures: 0, messages: 0, commands: 0, dropped: 0, cpu: null, made: { chunks: 0, rooms: 0 }, loop: null, gc: {}, ...more } });
        const server = {
            worlds: new Map([["w1", {}], ["w2", {}]]),
            registry: { going: [{ id: "w1" }], lifeOf: (id) => ({ life: id === "w1" ? "running" : "stored" }) },
            play: { sockets: new Set([{ socket: { writableLength: 0 } }, { socket: { writableLength: 0 } }]), places: new Map(), closed: new Map(), traffic: new Map([["w1", { messages: 1, bytes: 4000, wire: 1000, received: 10 }]]) },
        };

        metrics.watch(server);

        const sampler = samplerOf(metrics, server, { clock: () => time.now });

        metrics.heard("w1", state(buckets(3, 200)));
        assert.equal(sampler(), null, "the first time, there's nothing yet to measure since");

        // (Ten seconds on: 200 steps, four of them slow; half a second let go; 50 KB sent)
        time.now = 10000;
        metrics.heard("w1", state(buckets(3, 196)));
        metrics.heard("w1", state(buckets(70, 4), { dropped: 500 }));
        server.play.traffic.get("w1").wire = 51000;

        const samples = sampler();
        const of = (id) => samples.find((one) => one.id === id);

        assert.ok(of("step-p99").value > 50 && of("step-p99").value <= 75, `${of("step-p99").value} ms: its slowest 1% were in the bucket over a step`);
        assert.equal(of("step-p99").world, "w1");
        assert.ok(of("tick-p99").value > 50);
        assert.equal(of("pace").value, 0.95);
        assert.equal(of("world-players").value, 2);
        assert.equal(of("actors").value, 30);
        assert.equal(of("world-memory").value, 1e8);
        assert.equal(of("sockets").value, 2);
        assert.equal(of("sent").value, 5000, "bytes a second, as they went on the wire");
        assert.ok(of("rss").value > 1e6);
        assert.equal(of("busy"), undefined, "the supervisor's own aren't sampled till it's started");
        assert.ok(samples.every((one) => CHARTED[one.id]), "every point is of something charted");
        assert.ok(samples.every((one) => one.world === undefined || one.world === "w1"), "nothing of a world that isn't going");

        // (Ten seconds with no step played: no slowest step to say, and the history keeps none)
        time.now = 20000;

        const idle = sampler();
        const history = new History();

        assert.ok(Number.isNaN(idle.find((one) => one.id === "step-p99").value));
        history.record(NOON, idle);
        assert.ok(!history.read("day", NOON).series.some((one) => one.id === "step-p99"));
        assert.ok(history.read("day", NOON).series.some((one) => one.id === "actors"));
    });
});

describe("the world server keeping its history (server/world-server.js, manage.js)", () => {
    it("takes a point each time it samples itself, writes them as it stops, and shows them again after a restart", async () => {
        const folder = await folderOf();
        let server = await WorldServer.open(folder, { awake: () => ({ stop() {} }), router: false, funnel: false });

        await server.listen(0, "127.0.0.1");
        assert.deepEqual(server.manage.history("day").series, []);
        server.metrics.sample();
        server.metrics.sample();

        const before = server.manage.history("day");

        assert.equal(before.span, "day");
        assert.equal(before.step, 120000);
        assert.ok(before.series.some((one) => one.id === "rss" && one.world === null && one.name === null && one.values.at(-1) > 1e6));
        assert.ok(before.series.every((one) => one.values.length === CHART_POINTS));
        await server.close();

        server = await WorldServer.open(folder, { awake: () => ({ stop() {} }), router: false, funnel: false });

        const after = server.manage.history("day");

        assert.deepEqual(after.series.map((one) => one.id).sort(), before.series.map((one) => one.id).sort());
        assert.ok(after.series.find((one) => one.id === "rss").values.some((value) => value > 1e6), "what was measured before it stopped");
        assert.equal(server.manage.history("week").step, 900000);
        await server.close();
    });
});
