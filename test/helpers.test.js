// The tests' own helpers for speed limits (test/helpers.js): work timed by the processor's time
// it took, not the clock's, and judged twice before it fails
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cpuMs, quickEnough } from "./helpers.js";

describe("work timed by the processor's time (helpers.js cpuMs)", () => {
    it("counts the work, and none of the waiting: a fifth of a second asleep is next to nothing", () => {
        // (Asleep on this thread, as it is while a busy machine's other work has the cores)
        const started = performance.now();
        const asleep = cpuMs(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200));

        assert.ok(performance.now() - started >= 190, "slept by the clock");
        assert.ok(asleep < 100, `${asleep.toFixed(1)} ms asleep`);

        // (And work: more of it, more time; by the clock it never took less)
        let sum = 0;
        const work = (times) => () => {
            for (let k = 0; k < times; k++) {
                sum += Math.sqrt(k % 1000);
            }
        };
        const clock = performance.now();
        const little = cpuMs(work(4e5));
        const much = cpuMs(work(4e7));
        const byClock = performance.now() - clock;

        assert.ok(sum > 0);
        assert.ok(much > 5 && much > little * 3, `${little.toFixed(1)} ms, then ${much.toFixed(1)} ms for a hundred times the work`);
        assert.ok(much <= byClock + 20, `${much.toFixed(1)} ms of ${byClock.toFixed(1)} ms by the clock`);
    });
});

describe("work that's to be quick enough (helpers.js quickEnough)", () => {
    it("passes work under its limit the first time, timed once; over, times it once more and fails only if it's over both, saying both", () => {
        const timed = (...times) => {
            const left = [...times];
            const time = () => left.shift();

            return { time, left };
        };

        // (Under: timed once)
        let { time, left } = timed(4, 99);

        assert.equal(quickEnough(5, time), 4);
        assert.deepEqual(left, [99]);

        // (Over, then under: the second counts)
        ({ time, left } = timed(7, 3, 99));
        assert.equal(quickEnough(5, time), 3);
        assert.deepEqual(left, [99]);

        // (Over both times, or right on the limit: it fails, worded as it's asked to be)
        ({ time } = timed(7, 6));
        assert.throws(() => quickEnough(5, time, (ms) => `${ms} ms a chunk`), { name: "AssertionError", message: "6 ms a chunk (7 ms a chunk the first time)" });
        assert.throws(() => quickEnough(5, timed(5, 5).time), /5\.0 ms \(5\.0 ms the first time\)/);
    });
});
