// Keeping the game moving (app/governor.js: Game options, Adaptive): below 30 frames a second it
// draws less, a step at a time (fewer pixels, then the level below); back near 60 a while it
// draws more again, up to the quality chosen; a step that let it fall is tried again only later
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Governor, GOVERNOR, ladder } from "../client/js/app/governor.js";

// Frames every `interval` ms (or as many as a function of the step it's at says) for `seconds`,
// from `from` (ms), on a `beat` (ms a frame; none: 60 a second), each having spent `built` ms
// building: each step it took ([s, quality, scale])
function play(governor, { interval, seconds = 30, from = 0, beat, built }) {
    const steps = [];
    let now = from;

    for (;;) {
        const gap = typeof interval === "function" ? interval(governor.step) : interval;

        now += gap;

        if (now >= from + seconds * 1000) {
            return steps;
        }

        const rung = governor.observe(now, gap, { beat, built });

        if (rung) {
            steps.push([Math.round(now / 100) / 10, rung.quality, rung.scale]);
        }
    }
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

        // (And no lower than the lowest, where it stays while each step's bought something: a
        // fourteenth quicker a step, from 12 frames a second to 26)
        const helped = new Governor({ ceiling: "high" });

        play(helped, { interval: (step) => 80 * 0.93 ** step, seconds: 240 });
        assert.deepEqual(helped.rung, { quality: "low", scale: 0.5 });
        assert.deepEqual(play(helped, { interval: (step) => 80 * 0.93 ** step, seconds: 300, from: 240000 }), []);
    });

    it("puts every step back once none of them has bought anything, and tries again only after a while, longer each time", () => {
        const governor = new Governor({ ceiling: "high" });
        const steps = play(governor, { interval: SLOW, seconds: 900 });
        const last = governor.steps.length - 1;
        const backs = steps.map(([at, quality, scale], k) => (quality === "high" && scale === 1 ? [at, k] : null)).filter(Boolean);

        // (Down every step there is, each as slow as the one before; then all of them back at once)
        assert.deepEqual(
            steps.slice(0, last).map(([, quality, scale]) => ({ quality, scale })),
            governor.steps.slice(1),
        );
        assert.deepEqual(steps[last].slice(1), ["high", 1], "back to the quality chosen, every pixel");
        assert.ok(backs.length >= 2 && backs.length <= 4, `tried again a few times in a quarter of an hour (${backs.map(([at]) => at)})`);

        // (Left there a minute, then two, before it's tried again)
        const waits = backs.slice(0, -1).map(([at, k]) => steps[k + 1][0] - at);

        assert.ok(waits[0] >= GOVERNOR.retry / 1000 && waits[0] < (GOVERNOR.retry / 1000) * 1.5, `a minute (${waits})`);
        assert.ok(waits.length < 2 || waits[1] >= (GOVERNOR.retry / 1000) * 2, `then two (${waits})`);

        // (Held there, it steps down at once if the frames come a good deal slower than they did)
        const held = new Governor({ ceiling: "low" });

        play(held, { interval: SLOW, seconds: 45 });
        assert.deepEqual(held.rung, { quality: "low", scale: 1 }, "all four of Low's steps put back");
        assert.deepEqual(play(held, { interval: SLOW, seconds: 20, from: 45000 }), [], "held");
        assert.equal(play(held, { interval: SLOW * GOVERNOR.worse * 1.1, seconds: 6, from: 65000 }).length, 1, "slower still: tried again");
    });

    it("judges against the frames the browser's asking for: 30 a second on a beat of 30 is keeping up", () => {
        const beat = 1000 / 30;

        // (A phone saving its battery, however long: nothing taken away)
        for (const interval of [beat, Math.round(beat), beat * 1.2]) {
            const governor = new Governor({ ceiling: "low" });

            assert.deepEqual(play(governor, { interval, beat, seconds: 120 }), [], `${interval} ms a frame`);
            assert.deepEqual(governor.rung, { quality: "low", scale: 1 });
        }

        // (Well behind that beat, it's too slow as ever; and back near it a while, it steps up)
        const behind = new Governor({ ceiling: "high" });
        const down = play(behind, { interval: (step) => (step ? beat : beat * 2), beat, seconds: 12 });

        assert.deepEqual(down.map(([, quality, scale]) => [quality, scale]), [["high", 0.85]]);
        assert.deepEqual(play(behind, { interval: beat, beat, seconds: 120, from: 12000 }).map(([, quality, scale]) => [quality, scale]), [["high", 1]]);
    });

    it("puts back steps that answered a slowness that wasn't one: the browser asking for fewer frames from then on", () => {
        const governor = new Governor({ ceiling: "high" });

        // (A phone set to save its battery as it plays: 30 a second from now, the beat not known yet)
        assert.deepEqual(play(governor, { interval: 1000 / 29, seconds: 9 }).map(([, quality, scale]) => [quality, scale]), [["high", 0.85]]);
        // (Known: the step's put back, and nothing more taken away)
        assert.deepEqual(play(governor, { interval: 1000 / 29, beat: 1000 / 29, seconds: 60, from: 9000 }).map(([, quality, scale]) => [quality, scale]), [["high", 1]]);
    });

    it("leaves the quality alone through a stretch of building at 25 frames a second: drawing less cures none of it", () => {
        // (An iPhone's slow stretches, 2026-11-11: single steps of building taking 20 to 200 ms
        // against 6 ms a frame, 18.5 to 31.6 ms a frame of it for seconds on end)
        const governor = new Governor({ ceiling: "low" });

        assert.deepEqual(play(governor, { interval: FAST, seconds: 10 }), []);
        assert.deepEqual(play(governor, { interval: SLOW, built: 25, seconds: 30, from: 10000 }), []);
        assert.deepEqual(governor.rung, { quality: "low", scale: 1 });

        // (One frame in three building, the rest keeping up: as it is. Most of them building,
        // the rest slow: nothing to judge by)
        let now = 40000;

        for (let k = 0; k < 3000; k++) {
            const building = k % 3 === 0;
            const interval = building ? 60 : FAST;

            now += interval;
            assert.equal(governor.observe(now, interval, { built: building ? 45 : 2 }), null);
        }

        for (let k = 0; k < 600; k++) {
            now += SLOW;
            assert.equal(governor.observe(now, SLOW, { built: k % 3 ? 25 : 2 }), null);
        }

        // (Slow with little of it building, within what a frame gives it: too slow, as ever)
        assert.equal(play(governor, { interval: SLOW, built: 6, seconds: 6, from: now }).length, 1);
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

    it("holds while something else changes what's drawn (app/throng.js), judging again once that's settled", () => {
        const governor = new Governor({ ceiling: "high" });

        play(governor, { interval: FAST, seconds: 10 });
        governor.hold(10000);

        const steps = play(governor, { interval: SLOW, seconds: 20, from: 10000 });

        assert.ok(steps[0][0] - 10 >= (GOVERNOR.settle + GOVERNOR.window * 0.9) / 1000 - 0.05, `not before it's settled (${steps[0][0]} s)`);
        assert.deepEqual(steps[0].slice(1), ["high", 0.85]);
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
