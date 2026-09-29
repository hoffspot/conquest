// When the world's drawn (app/pacing.js): no oftener than the quality level's rate, on the
// screen's own beat
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pacing } from "../client/js/app/pacing.js";

// Which of the browser's askings, every `every` ms for `seconds`, a world drawn at `rate` is
// drawn on (each taking `drawing` ms, the next asking the first refresh after it's done)
function drawn(every, rate, { seconds = 2, drawing = 0 } = {}) {
    const pacing = new Pacing();
    const frames = [];

    for (let now = 0; now < seconds * 1000; ) {
        const draw = pacing.due(now, rate);

        frames.push(draw);
        now += draw && drawing > every ? Math.ceil(drawing / every) * every : every;
    }

    return frames;
}

const perSecond = (frames, every) => (frames.filter(Boolean).length * 1000) / (frames.length * every);

describe("pacing (app/pacing.js)", () => {
    it("draws every other frame of a 120 Hz screen at 60, evenly", () => {
        const frames = drawn(1000 / 120, 60).slice(10);

        assert.ok(Math.abs(perSecond(frames, 1000 / 120) - 60) < 1);
        assert.ok(frames.every((draw, k) => k === 0 || draw !== frames[k - 1]), "drawn, skipped, drawn...");
    });

    it("draws a 144 Hz screen at 72, a 90 Hz one at 90 (never fewer than the rate, never unevenly)", () => {
        assert.ok(Math.abs(perSecond(drawn(1000 / 144, 60).slice(10), 1000 / 144) - 72) < 1);
        assert.ok(drawn(1000 / 90, 60).every(Boolean));
    });

    it("draws a 60 Hz screen at 30 on low, and every frame at 60", () => {
        assert.ok(Math.abs(perSecond(drawn(1000 / 60, 30).slice(10), 1000 / 60) - 30) < 1);
        assert.ok(drawn(1000 / 60, 60).every(Boolean));
        assert.ok(Math.abs(perSecond(drawn(1000 / 120, 30).slice(10), 1000 / 120) - 30) < 1);
    });

    it("draws every frame, however fast the screen, with no rate", () => {
        assert.ok(drawn(1000 / 144, 0).every(Boolean));
        assert.ok(drawn(1000 / 120, undefined).every(Boolean));
    });

    it("draws whenever it's asked while drawing takes longer than the rate allows", () => {
        // (Each drawing taking 20 ms at 60: the screen asks every other refresh, at 30)
        assert.ok(drawn(1000 / 60, 60, { drawing: 20 }).every(Boolean));
    });

    it("follows the screen changing its rate", () => {
        const pacing = new Pacing();
        let now = 0;
        const run = (every, count) => Array.from({ length: count }, () => pacing.due((now += every), 60));

        run(1000 / 120, 60);
        assert.ok(Math.abs(pacing.refresh - 1000 / 120) < 0.01);

        // (Down to 60 Hz: every frame drawn, once the faster refresh is forgotten)
        run(1000 / 60, 40);
        assert.ok(run(1000 / 60, 20).every(Boolean));
        assert.ok(Math.abs(pacing.refresh - 1000 / 60) < 0.01);
    });
});
