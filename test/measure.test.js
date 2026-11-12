// A measured run (client/js/app/measure.js): every frame of some minutes of play counted into
// histograms, and told as one small report: each minute's percentiles of the frames' intervals,
// their work, each phase and a step; frames that came late; steps, draw calls and what was held
import assert from "node:assert/strict";
import { Session } from "node:inspector/promises";
import { describe, it } from "node:test";
import { MEMORY_GUARD } from "../client/js/app/memoryguard.js";
import { bucketMs, bucketOf, FRAME, MEASURE, Meter, percentileOf, PERCENTILES, SERIES } from "../client/js/app/measure.js";
import { PHASES } from "../client/js/app/telemetry.js";
import { createRandom } from "../client/js/core/random.js";

// How far a time read from a histogram may be from the time itself: half a bucket (2.2%), or the
// first bucket's width under it
const near = (read, ms, what) => assert.ok(Math.abs(read - ms) <= Math.max(MEASURE.low, ms * (2 ** (0.5 / MEASURE.per) - 1) + 1e-9), `${what}: ${read} read for ${ms}`);

// The time at a share of the way through `times`, as a sorted array has it (the nearest rank)
const ranked = (times, share) => [...times].sort((a, b) => a - b)[Math.max(1, Math.ceil(share * times.length)) - 1];

// A frame's times written into a meter, and observed: `phases` (ms each, PHASES' order), the work
// their sum
function frame(meter, interval, phases, steps = 0, calls = 0) {
    meter.frame[FRAME.interval] = interval;
    meter.frame[FRAME.work] = phases.reduce((sum, ms) => sum + ms, 0);
    phases.forEach((ms, k) => (meter.frame[FRAME.phases + k] = ms));

    return meter.observe(steps, calls);
}

// A run of `minutes` as a phone might have it: frames at 60 a second with a late one now and
// then, a step of the world every third frame, each phase's time its own. Returns what was put in
function play(meter, minutes, random = createRandom(7).next) {
    const put = { intervals: [], works: [], perStep: [], phases: PHASES.map(() => []), rows: [] };
    let elapsed = 0;

    for (let n = 0; elapsed < minutes * 60000; n++) {
        const late = random() < 0.02 ? 30 + random() * 220 : 0;
        const interval = 16.4 + random() * 0.6 + late;
        const phases = PHASES.map((name, k) => (k + 1) * 0.3 * (0.5 + random()) + (name === "draw" ? late / 2 : 0));
        const steps = n % 3 === 0 ? 1 + (random() < 0.1 ? 1 : 0) : 0;
        const minute = Math.floor(elapsed / 60000);

        assert.equal(frame(meter, interval, phases, steps, 180 + Math.floor(random() * 40)), true);
        put.rows[minute] ??= { intervals: [], works: [], steps: 0, stepMs: 0 };
        put.rows[minute].intervals.push(interval);
        put.rows[minute].works.push(meter.frame[FRAME.work]);
        put.rows[minute].steps += steps;
        put.rows[minute].stepMs += steps ? phases[0] : 0;
        put.intervals.push(interval);
        put.works.push(meter.frame[FRAME.work]);
        phases.forEach((ms, k) => put.phases[k].push(ms));

        if (steps) {
            put.perStep.push(phases[0] / steps);
        }

        // (What's held, read as often as the guard reads it)
        if (Math.floor((elapsed + interval) / (MEASURE.every * 1000)) > Math.floor(elapsed / (MEASURE.every * 1000)) && !meter.done) {
            meter.memory(380 + (n % 90));
        }

        elapsed += interval;
    }

    return put;
}

describe("the histograms' buckets (measure.js bucketOf, bucketMs)", () => {
    it("puts a time in a bucket whose middle is within 2.2% of it, from 0.05 ms to 3 s", () => {
        for (let ms = MEASURE.low; ms < 3000; ms *= 1.013) {
            near(bucketMs(bucketOf(ms)), ms, "a bucket's middle");
        }

        assert.equal(bucketOf(0), 0);
        assert.equal(bucketOf(-1), 0);
        assert.equal(bucketOf(NaN), 0);
        assert.equal(bucketOf(MEASURE.low / 2), 0);
        assert.equal(bucketOf(1e9), MEASURE.buckets - 1, "everything past the last, in the last");
        assert.ok(bucketMs(MEASURE.buckets - 1) > 3000);
    });

    it("measures what the debug log marks, and a step", () => {
        assert.deepEqual(SERIES, ["interval", "work", "perStep", ...PHASES]);
        assert.equal(FRAME.phases + PHASES.length, SERIES.length);
        assert.equal(MEASURE.every, MEMORY_GUARD.every, "what's held, read as often as the guard reads it");
    });
});

describe("a measured run's percentiles (measure.js Meter)", () => {
    it("match a sorted array's, for each minute and for the run, to within a bucket", () => {
        const meter = new Meter({ minutes: 3 });
        const put = play(meter, 3);
        const report = meter.report();

        assert.equal(report.done, true);
        assert.equal(report.rows.length, 3);
        assert.equal(report.frames, put.intervals.length);
        assert.equal(report.total.interval.count, put.intervals.length);

        report.rows.forEach((row, minute) => {
            const { intervals, works } = put.rows[minute];

            PERCENTILES.forEach((share, k) => {
                near(row.interval[k], ranked(intervals, share), `minute ${minute + 1}'s interval p${share * 100}`);
                near(row.work[k], ranked(works, share), `minute ${minute + 1}'s work p${share * 100}`);
            });

            // (The worst is the worst itself, not a bucket's)
            assert.equal(row.interval.at(-1), Math.round(Math.max(...intervals) * 100) / 100);
            assert.equal(row.work.at(-1), Math.round(Math.max(...works) * 100) / 100);
        });

        for (const share of PERCENTILES) {
            const key = `p${share * 100}`;

            near(report.total.interval[key], ranked(put.intervals, share), `the run's interval ${key}`);
            near(report.total.work[key], ranked(put.works, share), `the run's work ${key}`);
            near(report.total.perStep[key], ranked(put.perStep, share), `the run's step ${key}`);
            PHASES.forEach((name, k) => near(report.total[name][key], ranked(put.phases[k], share), `the run's ${name} ${key}`));
        }

        // (And any other, read back from a histogram the report carries)
        for (const share of [0.1, 0.25, 0.75, 0.9, 0.999]) {
            near(percentileOf(report.histograms.interval, share), ranked(put.intervals, share), `the interval's p${share * 100}, read back`);
            near(percentileOf(report.histograms.draw, share), ranked(put.phases[PHASES.indexOf("draw")], share), `drawing's p${share * 100}, read back`);
        }

        assert.equal(percentileOf([], 0.5), null);
        near(report.total.interval.mean, put.intervals.reduce((sum, ms) => sum + ms, 0) / put.intervals.length, "the mean");
    });

    it("counts the frames that came late, the steps played and what one took, and the draw calls", () => {
        const meter = new Meter({ minutes: 2 });
        const put = play(meter, 2);
        const report = meter.report();

        MEASURE.over.forEach((ms, k) => {
            assert.equal(report.over[ms], put.intervals.filter((interval) => interval > ms).length, `over ${ms} ms`);
            assert.equal(report.rows[0].over[k], put.rows[0].intervals.filter((interval) => interval > ms).length);
        });
        assert.ok(report.over[33] > report.over[100] && report.over[100] > report.over[200] && report.over[200] > 0);

        const steps = put.rows.reduce((sum, row) => sum + row.steps, 0);

        assert.equal(report.stepsPlayed, steps);
        assert.equal(report.rows[1].stepsPlayed, put.rows[1].steps);
        assert.equal(report.total.perStep.count, put.perStep.length, "a step's time, only of the frames that played one");
        assert.equal(report.stepMs, Math.round((put.rows.reduce((sum, row) => sum + row.stepMs, 0) / steps) * 100) / 100);
        assert.equal(report.rows[0].stepMs, Math.round((put.rows[0].stepMs / put.rows[0].steps) * 100) / 100);
        assert.ok(report.calls.mean >= 180 && report.calls.mean < 220 && report.calls.most <= 219 && report.calls.most >= report.calls.mean);
        assert.ok(report.rows[0].calls >= 180 && report.rows[0].callsMost <= 219);
    });

    it("keeps a row for each minute and for the part of one under way, with every phase, and stops when the run's done", () => {
        const meter = new Meter({ minutes: 1.5 });

        assert.equal(meter.report().rows.length, 0, "nothing yet");
        assert.equal(meter.left, 90000);

        // (Twenty seconds in: one row, the part of a minute so far)
        for (let n = 0; n < 1200; n++) {
            frame(meter, 1000 / 60, PHASES.map((name, k) => k + 1), 1, 100);
        }

        const early = meter.report({ name: "kitchen" });

        assert.equal(early.name, "kitchen");
        assert.equal(early.measure, MEASURE.version);
        assert.equal(early.done, false);
        assert.equal(early.rows.length, 1);
        assert.equal(early.rows[0].minute, 1);
        assert.equal(early.rows[0].seconds, 20);
        assert.equal(early.rows[0].frames, 1200);
        assert.equal(early.seconds, 20);

        for (const [k, name] of PHASES.entries()) {
            near(early.rows[0][name][0], k + 1, `${name}'s middle`);
            assert.equal(early.rows[0][name].at(-1), k + 1, `${name}'s worst`);
        }

        assert.deepEqual(meter.report({ name: "kitchen" }), early, "asking doesn't change it");

        // (On to the end: a whole minute's row, then the half)
        let counted = 1200;

        while (frame(meter, 1000 / 60, PHASES.map(() => 1))) {
            counted++;
        }

        const report = meter.report();

        assert.equal(meter.done, true);
        assert.equal(meter.closed, 1);
        assert.equal(meter.left, 0);
        assert.equal(report.frames, counted);
        assert.ok(Math.abs(report.frames - 5400) <= 1);
        assert.deepEqual(report.rows.map(({ minute, seconds }) => [minute, seconds]), [[1, 60], [2, 30]]);
        assert.ok(Math.abs(report.rows[0].frames - 3600) <= 1);
        assert.equal(frame(meter, 500, PHASES.map(() => 400)), false, "nothing counted after");
        assert.deepEqual(meter.report(), report);
    });

    it("leaves a minute's row empty when a frame took minutes (the page put away), and keeps what's held", () => {
        const meter = new Meter({ minutes: 4 });

        frame(meter, 1000, PHASES.map(() => 1));
        meter.memory(301.4);
        meter.memory(412);
        frame(meter, 150000, PHASES.map(() => 1));
        meter.memory(380);
        frame(meter, 1000, PHASES.map(() => 1));

        const report = meter.report();

        assert.deepEqual(report.rows.map(({ minute, frames, heldMB }) => [minute, frames, heldMB]), [[1, 2, 412], [2, 0, 0], [3, 1, 380]]);
        assert.deepEqual(report.rows[1].interval, [0, 0, 0, 0]);
        assert.equal(report.heldMB, 412);
        assert.deepEqual(report.held, { every: MEMORY_GUARD.every, mb: [301, 412, 380] });
        assert.equal(report.total.interval.worst, 150000);

        // (Never more readings than the guard's cadence gives the run)
        for (let n = 0; n < 1000; n++) {
            meter.memory(100);
        }

        assert.ok(meter.report().held.mb.length <= (4 * 60) / MEMORY_GUARD.every + 8);
    });

    it("is as long as it's asked to be: twelve minutes unless said, thirty at most", () => {
        assert.equal(new Meter().minutes, MEASURE.minutes);
        assert.equal(new Meter({ minutes: "nonsense" }).minutes, 12);
        assert.equal(new Meter({ minutes: 500 }).minutes, MEASURE.most);
        assert.equal(new Meter({ minutes: 1 / 3 }).left, 20000);
    });
});

describe("a measured run's report (measure.js Meter.report)", () => {
    const bytes = (report) => new TextEncoder().encode(JSON.stringify(report)).length;

    it("is under 48 KB for fifteen minutes, as a phone has them", () => {
        const meter = new Meter({ minutes: MEASURE.sized });

        play(meter, MEASURE.sized);

        const report = meter.report({ name: "iphone-8-spread", device: { agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1" } });

        assert.equal(report.rows.length, MEASURE.sized);
        assert.ok(Math.abs(report.held.mb.length - (MEASURE.sized * 60) / MEASURE.every) <= 1, `${report.held.mb.length} readings`);
        assert.equal(MEASURE.bytes, 48 * 1024);
        assert.ok(bytes(report) < MEASURE.bytes, `${bytes(report)} bytes`);
    });

    it("is under 48 KB for fifteen minutes however the times fall: every bucket of every histogram filled", () => {
        const meter = new Meter({ minutes: MEASURE.sized });
        const random = createRandom(11).next;
        let elapsed = 0;

        // (Times spread over the histograms' whole range, 0.03 ms to 4 s, long numbers all)
        const anywhere = () => 0.03 * 2 ** (random() * 17);

        for (let n = 0; elapsed < MEASURE.sized * 60000; n++) {
            const interval = n % 4 ? 1000 / 60 + random() : anywhere();

            frame(meter, interval, PHASES.map(anywhere), 1 + (n % 3), 1000 + (n % 9000));
            elapsed += interval;

            if (n % 100 === 0) {
                meter.memory(1000 + (n % 9000));
            }
        }

        const report = meter.report({ name: "x".repeat(40) });

        assert.equal(meter.done, true);
        assert.ok(report.histograms.draw.length > MEASURE.buckets - 8 && report.histograms.perStep.length > MEASURE.buckets - 24, "every bucket");
        assert.ok(bytes(report) < MEASURE.bytes, `${bytes(report)} bytes`);
    });
});

describe("measuring a frame (measure.js Meter.observe)", () => {
    it("makes nothing: no object, array or number left for the garbage collector", async () => {
        // Runs made ready first (making a meter makes its arrays), and the times they'll be given
        const runs = Array.from({ length: 4 }, () => new Meter({ minutes: MEASURE.most }));
        const random = createRandom(3).next;
        const times = Float64Array.from({ length: 4096 * SERIES.length }, () => 0.2 + random() * 20);
        const frames = Math.ceil((MEASURE.most * 60000) / 16.7);

        // A run measured through, minute after minute
        const measured = (meter) => {
            const into = meter.frame;
            let at = 0;

            for (let n = 0; n < frames; n++) {
                for (let k = 0; k < into.length; k++) {
                    into[k] = times[at + k];
                }

                into[FRAME.interval] = 16.7;
                at = (at + into.length) % times.length;
                meter.observe(n & 3, 200 + (n & 63));

                if ((n & 127) === 0) {
                    meter.memory(400 + (n & 31));
                }
            }
        };

        // What each function made while `work` was done (bytes, by the function's name), as the
        // engine's own sampling of what's made tells it: one in every 128 bytes or so looked at,
        // whether or not it's since been collected
        const session = new Session();

        session.connect();
        await session.post("HeapProfiler.enable");

        const madeIn = async (work) => {
            await session.post("HeapProfiler.startSampling", { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
            work();

            const { profile } = await session.post("HeapProfiler.stopSampling");
            const made = new Map();
            const walk = (node) => {
                made.set(node.callFrame.functionName, (made.get(node.callFrame.functionName) ?? 0) + node.selfSize);
                node.children.forEach(walk);
            };

            walk(profile.head);

            return made;
        };

        // (The first run is the engine's to learn the code on: what it makes then is its own, the
        // numbers of arithmetic it hasn't compiled yet)
        measured(runs[0]);

        // (Each frame making one number alone would be 16 bytes a frame, 1.7 MB over a run. A run
        // the engine went back to learning in is measured again)
        const after = [];

        for (const meter of runs.slice(1)) {
            after.push(await madeIn(() => measured(meter)));
        }

        session.disconnect();

        const least = (name) => Math.min(...after.map((made) => made.get(name) ?? 0));

        assert.equal(runs[1].done, true);
        assert.ok(Math.abs(runs[1].report().frames - frames) <= 1);
        assert.ok(after[0].has("measured"), "what's made is told by the function that made it");
        assert.equal(least("observe"), 0, `observe() made ${after.map((made) => made.get("observe") ?? 0).join(", ")} bytes over ${frames} frames`);

        // (Closing a minute, once a minute, makes no object either; but it runs too seldom for the
        // engine to compile it, so its arithmetic's numbers are made and dropped: 1.5 KB a minute
        // as measured, 4 KB at most)
        const closing = ["#close", "#row", "#tally", "percentile", "bucketMs"].reduce((sum, name) => sum + least(name), 0);

        assert.ok(closing < MEASURE.most * 4096, `closing ${MEASURE.most} minutes made ${closing} bytes`);
    });
});
