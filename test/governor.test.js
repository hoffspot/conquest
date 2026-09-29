// Drawing fewer pixels when a device can't keep up (app/governor.js): only when its frames come
// late with the page's own work well within the time, after a while, twice at most
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Governor, GOVERNOR } from "../client/js/app/governor.js";

// Frames every `interval` ms (each `busy` ms of the page's work) for `seconds`, at `rate`: when
// (s) the governor stepped down, and to what
function play(governor, { interval, busy, rate = 60, seconds = 30, from = 0 }) {
    const steps = [];

    for (let now = from; now < from + seconds * 1000; now += interval) {
        const scale = governor.observe(now, interval, busy, rate);

        if (scale !== null) {
            steps.push([Math.round(now / 100) / 10, scale]);
        }
    }

    return steps;
}

describe("the governor (app/governor.js)", () => {
    it("leaves a device that keeps up as it is", () => {
        const governor = new Governor();

        assert.deepEqual(play(governor, { interval: 1000 / 60, busy: 6 }), []);
        assert.equal(governor.scale, 1);
    });

    it("steps a device that draws too slowly down, after a while, then again, and no further", () => {
        const governor = new Governor();
        const steps = play(governor, { interval: 1000 / 30, busy: 6 });

        assert.deepEqual(steps.map(([, scale]) => scale), [0.85, 0.7]);
        assert.ok(steps[0][0] >= (GOVERNOR.warmup + GOVERNOR.window * 0.9) / 1000, `not before it's played a while (${steps[0][0]} s)`);
        assert.ok(steps[1][0] - steps[0][0] >= (GOVERNOR.window * 0.9) / 1000, "judged again over a whole window");
        assert.equal(governor.scale, 0.7);
    });

    it("leaves one whose own work is what's slow: fewer pixels wouldn't help", () => {
        assert.deepEqual(play(new Governor(), { interval: 1000 / 30, busy: 25 }), []);
    });

    it("keeps to the quality level's rate: 30 a second is keeping up on low", () => {
        assert.deepEqual(play(new Governor(), { interval: 1000 / 30, busy: 8, rate: 30 }), []);
        assert.deepEqual(play(new Governor(), { interval: 50, busy: 8, rate: 30 }).length, 2);
    });

    it("forgives a slow start, and a hitch now and then", () => {
        const governor = new Governor();

        play(governor, { interval: 50, busy: 6, seconds: 4.5 });
        assert.deepEqual(play(governor, { interval: 1000 / 60, busy: 6, seconds: 20, from: 4500 }), []);

        // (One frame in ten ten times late)
        const hitchy = new Governor();
        let now = 0;

        for (let k = 0; k < 2000; k++) {
            const interval = k % 10 === 0 ? 166 : 1000 / 60;

            now += interval;
            assert.equal(hitchy.observe(now, interval, 6, 60), null);
        }
    });

    it("judges only a whole window of play, after the game's stopped a while", () => {
        const governor = new Governor();

        play(governor, { interval: 1000 / 60, busy: 6, seconds: 10 });

        // (Stopped for a minute, then slow: judged only once it's been slow a whole window)
        const steps = play(governor, { interval: 1000 / 30, busy: 6, seconds: 10, from: 70000 });

        assert.ok(steps.length > 0 && steps[0][0] >= 70 + (GOVERNOR.window * 0.9) / 1000, JSON.stringify(steps));
    });

    it("carries on from where a game before left it, and starts again when reset", () => {
        const governor = new Governor(1);

        assert.equal(governor.scale, 0.85);
        assert.deepEqual(play(governor, { interval: 1000 / 30, busy: 6 }).map(([, scale]) => scale), [0.7]);

        governor.reset();
        assert.equal(governor.scale, 1);
    });
});
