// Keeping the game moving (app/governor.js: Game options, Adaptive): below 30 frames a second it
// draws less, a step at a time (fewer pixels, then the level below); back near 60 a while it
// draws more again, up to the quality chosen; a step that let it fall is tried again only later
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Governor, GOVERNOR, ladder } from "../client/js/app/governor.js";

// Frames every `interval` ms for `seconds`, from `from` (ms): each step it took ([s, quality, scale])
function play(governor, { interval, seconds = 30, from = 0 }) {
    const steps = [];

    for (let now = from + interval; now < from + seconds * 1000; now += interval) {
        const rung = governor.observe(now, interval);

        if (rung) {
            steps.push([Math.round(now / 100) / 10, rung.quality, rung.scale]);
        }
    }

    return steps;
}

const SLOW = 1000 / 25;
const FAST = 1000 / 60;

describe("keeping up (app/governor.js)", () => {
    it("steps down from the quality chosen: fewer pixels, then the level below, to the lowest at half the pixels", () => {
        assert.deepEqual(ladder(["low", "medium", "high"], "high").map(({ quality, scale }) => `${quality} ${scale}`), [
            "high 1",
            "high 0.85",
            "high 0.7",
            "medium 1",
            "medium 0.85",
            "medium 0.7",
            "low 1",
            "low 0.85",
            "low 0.7",
            "low 0.6",
            "low 0.5",
        ]);
        assert.deepEqual(ladder(["low", "medium", "high"], "low").map(({ scale }) => scale), [1, 0.85, 0.7, 0.6, 0.5]);
    });

    it("leaves a game that keeps up as it is, and one between 30 and 60 a second too", () => {
        for (const interval of [FAST, 1000 / 40, 1000 / 31]) {
            const governor = new Governor({ ceiling: "high" });

            assert.deepEqual(play(governor, { interval, seconds: 60 }), []);
            assert.deepEqual(governor.rung, { quality: "high", scale: 1 });
        }
    });

    it("steps down while it's below 30 a second: not before it's played a while, then once it's settled at each step", () => {
        const governor = new Governor({ ceiling: "high" });
        const steps = play(governor, { interval: SLOW, seconds: 40 });

        assert.deepEqual(
            steps.slice(0, 4).map(([, quality, scale]) => [quality, scale]),
            [
                ["high", 0.85],
                ["high", 0.7],
                ["medium", 1],
                ["medium", 0.85],
            ],
        );
        assert.ok(steps[0][0] >= (GOVERNOR.warmup + GOVERNOR.window * 0.9) / 1000, `not before it's played a while (${steps[0][0]} s)`);
        assert.ok(steps[1][0] - steps[0][0] >= (GOVERNOR.settle + GOVERNOR.window * 0.9) / 1000, "judged again once settled, over a whole window");

        // (And no lower than the lowest)
        play(governor, { interval: SLOW, seconds: 200, from: 40000 });
        assert.deepEqual(governor.rung, { quality: "low", scale: 0.5 });
    });

    it("steps back up once it's been near 60 a while, up to the quality chosen and no further", () => {
        const governor = new Governor({ ceiling: "medium" });

        play(governor, { interval: SLOW, seconds: 15 });
        assert.deepEqual(governor.rung, { quality: "medium", scale: 0.7 });

        // (The step it left was blocked a while: up only once that's past, a step at a time)
        const ups = play(governor, { interval: FAST, seconds: 400, from: 15000 });

        assert.deepEqual(
            ups.map(([, quality, scale]) => [quality, scale]),
            [
                ["medium", 0.85],
                ["medium", 1],
            ],
        );
        assert.ok(ups[0][0] - 15 >= GOVERNOR.up / 1000, `near 60 a while first (${ups[0][0]} s)`);
        assert.deepEqual(governor.rung, { quality: "medium", scale: 1 });
    });

    it("tries a step that let it fall again only after a while, longer each time, so it doesn't see-saw", () => {
        const governor = new Governor({ ceiling: "high" });
        let now = 0;
        const run = (interval, seconds) => {
            const steps = play(governor, { interval, seconds, from: now });

            now += seconds * 1000;

            return steps;
        };

        // (Slow at every pixel, fine at 85 %: down, back up after a minute, down again; then two)
        const at = () => governor.rung.scale;
        const ticks = [];

        for (let k = 0; k < 600; k++) {
            run(at() === 1 ? SLOW : FAST, 1);
            ticks.push(at());
        }

        const down = ticks.indexOf(0.85);
        const ups = ticks.map((scale, k) => (scale === 1 && ticks[k - 1] === 0.85 ? k : null)).filter((k) => k !== null);

        assert.ok(ups.length >= 2 && ups.length <= 4, `tried again a few times in ten minutes, not every few seconds (${ups})`);
        assert.ok(ups[0] - down >= GOVERNOR.retry / 1000, `not again for a minute (${down}, ${ups})`);
        assert.ok(ups[1] - ups[0] > ups[0] - down, `waits longer each time (${down}, ${ups})`);
    });

    it("forgives a hitch now and then, and a game stopped a while", () => {
        const hitchy = new Governor({ ceiling: "high" });
        let now = 0;

        // (One frame in ten ten times late)
        for (let k = 0; k < 2000; k++) {
            const interval = k % 10 === 0 ? 166 : FAST;

            now += interval;
            assert.equal(hitchy.observe(now, interval), null);
        }

        // (Stopped a minute in the background: not slow, judged afresh)
        assert.equal(hitchy.observe(now + 60000, 60000), null);
        assert.deepEqual(play(hitchy, { interval: FAST, seconds: 20, from: now + 60000 }), []);
    });

    it("carries on from where a game before left it, and goes back to the quality chosen when that's chosen again", () => {
        const governor = new Governor({ ceiling: "high", at: { quality: "medium", scale: 0.85 } });

        assert.deepEqual(governor.rung, { quality: "medium", scale: 0.85 });
        governor.setCeiling("high");
        assert.deepEqual(governor.rung, { quality: "medium", scale: 0.85 }, "(the same quality chosen: carries on)");
        governor.setCeiling("low");
        assert.deepEqual(governor.rung, { quality: "low", scale: 1 });
        play(governor, { interval: SLOW, seconds: 15 });
        assert.ok(governor.step > 0);
        governor.reset();
        assert.deepEqual(governor.rung, { quality: "low", scale: 1 });
    });
});
