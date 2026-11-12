// A measured run on the page (client/js/app/measuring.js): asked for by the page's link, the first
// game under way measured, how long's left counted down, the report kept on the device as it goes,
// the screen kept awake; and nothing of it without the parameter. And the frame the debug log
// timed, handed to a meter (telemetry.js lastInto)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FRAME, MEASURE } from "../client/js/app/measure.js";
import { keptMeasure, leftWords, MeasuredRun, measureOf, MEASURING } from "../client/js/app/measuring.js";
import { PHASE, PHASES, Telemetry } from "../client/js/app/telemetry.js";

// A page's storage, in memory
function storage() {
    const kept = new Map();

    return { kept, getItem: (key) => (kept.has(key) ? kept.get(key) : null), setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key) };
}

// The countdown's place on the page, as far as a run needs it
const element = () => ({ hidden: true, dataset: {}, textContent: "" });

// A game as a run needs it: its meter fed by `frames` of `interval` ms each
function game() {
    return {
        measure: null,
        measureAbout: () => ({ quality: "high", pixels: 1, hz: 60, world: { map: "town", together: null, players: 1, actors: 12, avatars: 9 }, guard: 0, device: { agent: "test" } }),
        frames(count, interval = 1000 / 60) {
            for (let n = 0; n < count && this.measure; n++) {
                this.measure.frame[FRAME.interval] = interval;
                this.measure.frame[FRAME.work] = 9;
                PHASES.forEach((name, k) => (this.measure.frame[FRAME.phases + k] = 1 + k));
                this.measure.observe(1, 150);
            }
        },
    };
}

// A run on the page, on a clock of its own and a timer the test turns by hand (`turn`)
function run(asked, { lock = true } = {}) {
    const page = { storage: storage(), element: element(), time: Date.UTC(2026, 10, 12, 9), timers: [], locks: [], released: 0 };
    const wakeLock = lock
        ? {
              request: async (kind) => {
                  page.locks.push(kind);

                  return { release: async () => page.released++ };
              },
          }
        : null;
    const measured = new MeasuredRun(asked, {
        element: page.element,
        storage: page.storage,
        wakeLock,
        clock: () => page.time,
        every: (work, ms) => {
            const timer = { work, ms };

            page.timers.push(timer);

            return () => page.timers.splice(page.timers.indexOf(timer), 1);
        },
        about: { code: "abc1234567", build: "b1", built: null },
    });

    // (A second goes by: the timer's work done)
    page.turn = (ms = 1000) => {
        page.time += ms;
        [...page.timers].forEach(({ work }) => work());
    };

    return { measured, page };
}

describe("the run a link asks for (measuring.js measureOf)", () => {
    const of = (search) => measureOf(new URLSearchParams(search));

    it("is none without the parameter", () => {
        assert.equal(of(""), null);
        assert.equal(of("?play&seed=3&minutes=12"), null);
        assert.equal(of("?join=ABCD"), null);
        assert.equal(measureOf(null), null);
    });

    it("has its name and its minutes: twelve unless said, thirty at most", () => {
        assert.deepEqual(of("?play&measure=iphone-8-spread&minutes=12"), { name: "iphone-8-spread", minutes: 12 });
        assert.deepEqual(of("?join=ABCD&measure=one.town"), { name: "one.town", minutes: MEASURE.minutes });
        assert.deepEqual(of("?measure"), { name: "run", minutes: 12 });
        assert.deepEqual(of("?measure=a&minutes=0.34"), { name: "a", minutes: 0.34 });
        assert.deepEqual(of("?measure=a&minutes=900"), { name: "a", minutes: MEASURE.most });
        assert.deepEqual(of("?measure=a&minutes=-3"), { name: "a", minutes: 12 });
        assert.deepEqual(of("?measure=a&minutes=soon"), { name: "a", minutes: 12 });
    });

    it("keeps a name to letters, digits, dots and dashes, forty at most", () => {
        assert.equal(of(`?measure=${encodeURIComponent("<b>my phone</b> / one")}`).name, "-b-my-phone-b-one");
        assert.equal(of(`?measure=${"x".repeat(200)}`).name.length, MEASURING.name);
    });

    it("says how long's left as a clock does", () => {
        assert.equal(leftWords(12 * 60000), "12:00");
        assert.equal(leftWords(61000), "1:01");
        assert.equal(leftWords(900), "0:01");
        assert.equal(leftWords(0), "0:00");
        assert.equal(leftWords(-5), "0:00");
    });
});

describe("a measured run on the page (measuring.js MeasuredRun)", () => {
    it("measures the first game under way: its meter the game's, the countdown shown, the screen asked to stay awake", async () => {
        const { measured, page } = run({ name: "kitchen", minutes: 2 });
        const played = game();

        assert.equal(page.element.hidden, true, "nothing shown before a game's under way");
        assert.equal(page.timers.length, 0);

        measured.attach(played);
        await null;

        assert.equal(played.measure, measured.meter);
        assert.equal(page.element.hidden, false);
        assert.equal(page.element.dataset.measure, "running");
        assert.equal(page.element.textContent, "Measuring kitchen: 2:00 left");
        assert.deepEqual(page.locks, ["screen"]);
        assert.deepEqual(page.timers.map(({ ms }) => ms), [MEASURING.tick]);

        // (Half a minute of frames: the countdown follows the frames measured, not the clock)
        played.frames(1800);
        page.turn();
        assert.equal(page.element.textContent, "Measuring kitchen: 1:30 left");
        page.turn();
        assert.equal(page.element.textContent, "Measuring kitchen: 1:30 left", "stopped while the game is");

        // (Another game come to: the same run carried on in it; and the lock asked for again as the page comes back)
        const next = game();

        measured.attach(next);
        assert.equal(next.measure, measured.meter);
        assert.equal(page.timers.length, 1);
        await measured.wake();
        assert.deepEqual(page.locks, ["screen", "screen"]);
    });

    it("keeps the report on the device every ten seconds as it goes, and as it ends", async () => {
        const { measured, page } = run({ name: "kitchen", minutes: 1 });
        const played = game();
        const kept = () => keptMeasure(page.storage);
        let done = null;

        measured.onDone = (report) => (done = report);
        assert.equal(kept(), null);
        measured.attach(played);
        await null;

        played.frames(600);
        page.turn();

        const first = kept();

        assert.equal(first.name, "kitchen");
        assert.equal(first.done, false);
        assert.equal(first.frames, 600);
        assert.equal(first.began, "2026-11-12T09:00:00.000Z");
        assert.deepEqual([first.code, first.build, first.quality, first.hz, first.world.map, first.device.agent], ["abc1234567", "b1", "high", 60, "town", "test"]);
        assert.equal(first.rows.length, 1);

        // (Not again for ten seconds)
        played.frames(600);

        for (let second = 1; second < MEASURING.keep / 1000; second++) {
            page.turn();
            assert.equal(kept().frames, 600, `${second} s on`);
        }

        page.turn();
        assert.equal(kept().frames, 1200);

        // (Measured through: kept as it ended, the timer stopped, the screen let go, the game's meter taken away)
        played.frames(5000);
        assert.equal(measured.done, false, "ended at the next look, not in a frame");
        page.turn();
        assert.equal(measured.done, true);
        assert.equal(kept().done, true);
        assert.equal(kept().seconds, 60);
        assert.deepEqual(done, kept());
        assert.equal(page.timers.length, 0);
        assert.equal(page.released, 1);
        assert.equal(played.measure, null);
        assert.equal(page.element.dataset.measure, "done");
        assert.equal(page.element.textContent, "Measured kitchen: 1:00 of play, kept on this device.");

        // (And nothing more of it: a game come to after isn't measured)
        const later = game();

        measured.attach(later);
        assert.equal(later.measure, null);
        await measured.wake();
        assert.deepEqual(page.locks, ["screen"]);
    });

    it("runs where there's no wake lock, no storage and nowhere to show it; and whatever the game says of itself", async () => {
        const measured = new MeasuredRun({ name: "bare", minutes: 0.05 }, { every: () => () => {} });
        const played = { measure: null, measureAbout: () => { throw new Error("half taken down"); } };

        measured.attach(played);
        await measured.wake();
        Object.assign(played, { frames: game().frames });
        played.frames(400);
        measured.tick();
        assert.equal(measured.done, true);
        assert.equal(measured.report().name, "bare");
        assert.ok(Math.abs(measured.report().frames - 180) <= 1);

        // (A lock refused, as on a low battery: the run goes on)
        const refused = new MeasuredRun({ name: "refused", minutes: 1 }, { every: () => () => {}, wakeLock: { request: async () => { throw new Error("NotAllowedError"); } } });

        refused.attach(game());
        await refused.wake();
        assert.equal(refused.done, false);
    });

    it("reads back only a report of its own kind", () => {
        const kept = storage();

        assert.equal(keptMeasure(kept), null);
        kept.setItem(MEASURING.key, "{ spoilt");
        assert.equal(keptMeasure(kept), null);
        kept.setItem(MEASURING.key, JSON.stringify({ measure: 99 }));
        assert.equal(keptMeasure(kept), null);
        kept.setItem(MEASURING.key, JSON.stringify({ measure: MEASURE.version, name: "x" }));
        assert.equal(keptMeasure(kept).name, "x");
        assert.equal(keptMeasure(null), null);
    });
});

describe("the frame the debug log timed, for a meter (telemetry.js lastInto)", () => {
    it("writes the last frame's work and each phase's time where it's asked, and makes nothing of a frame not yet had", () => {
        const time = { now: 1000 };
        const log = new Telemetry({ now: () => time.now, clock: () => 0 });
        const into = new Float64Array(FRAME.phases + PHASES.length);

        log.lastInto(into, FRAME.work, FRAME.phases);
        assert.deepEqual([...into], new Array(into.length).fill(0));

        // (Two frames: the second's is what's written)
        for (const scale of [1, 2]) {
            log.begin(time.now);

            for (const name of PHASES) {
                time.now += scale * (PHASE[name] + 1);
                log.mark(PHASE[name]);
            }

            time.now += 3;
            log.end(16);
        }

        log.lastInto(into, FRAME.work, FRAME.phases);
        assert.equal(into[FRAME.work], 2 * 36 + 3);
        assert.deepEqual([...into.subarray(FRAME.phases)], PHASES.map((name, k) => 2 * (k + 1)));
        assert.equal(into[FRAME.interval], 0, "the interval is the game's to write");
    });
});
