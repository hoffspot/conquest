// The frames lately, for whoever judges how the game's keeping up (client/js/app/frames.js): a
// window of them kept in typed rings, its middle found only when asked; and the beat, how often the
// browser's asking for frames, which the governor and the throng judge against (a phone saving its
// battery asks for 30: fed a steady 30 they used to take the picture away for good)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BEAT, Beat, beatChanged, FrameWindow } from "../client/js/app/frames.js";
import { Governor } from "../client/js/app/governor.js";
import { savingPower } from "../client/js/app/pacing.js";
import { Throng } from "../client/js/app/throng.js";

// (The middle as the governor, the throng and the budget each found it before: a list of frames
// mapped, copied and sorted every frame)
const middle = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe("a window of frames (app/frames.js FrameWindow)", () => {
    it("keeps the frames of its span, and finds the same middle as a sorted copy of them", () => {
        const window = new FrameWindow(3000);
        let frames = [];
        let now = 0;
        let seed = 7;

        assert.equal(window.length, 0);
        assert.equal(window.first, Infinity);
        assert.ok(Number.isNaN(window.median()));
        assert.equal(window.least(), Infinity);

        for (let k = 0; k < 4000; k++) {
            seed = (seed * 48271) % 2147483647;

            const interval = 8 + (seed % 3000) / 100;

            now += interval;
            window.push(now, interval);
            frames.push({ now, interval });
            frames = frames.filter((frame) => frame.now >= now - 3000);

            if (k % 37 === 0) {
                assert.equal(window.length, frames.length);
                assert.equal(window.first, frames[0].now);
                assert.equal(window.median(), Math.fround(middle(frames.map((frame) => frame.interval))));
                assert.equal(window.least(), Math.fround(Math.min(...frames.map((frame) => frame.interval))));
            }
        }

        window.clear();
        assert.equal(window.length, 0);
    });

    it("leaves out of the middle the frames not to be judged by, and says nothing once they're most of them", () => {
        const window = new FrameWindow(1000);

        for (let k = 1; k <= 10; k++) {
            window.push(k * 10, k <= 4 ? NaN : k);
        }

        assert.equal(window.length, 10);
        assert.equal(window.median(), 8, "the middle of 5 to 10");
        assert.equal(window.least(), 5);

        window.push(110, NaN);
        window.push(120, NaN);
        window.push(130, NaN);
        assert.ok(Number.isNaN(window.median()), "7 of 13 not to be judged by");
        assert.equal(window.median(0.4), 8, "unless fewer are asked for");
    });

    it("lets go of the oldest when frames come faster than it has room for, and of those past its span when it's trimmed", () => {
        const window = new FrameWindow(1000);

        for (let k = 0; k < 2000; k++) {
            window.push(k * 0.1, 1);
        }

        assert.ok(window.length > 200 && window.length < 300, `${window.length}`);
        window.trim(5000);
        assert.equal(window.length, 0);
    });
});

// Frames drawn every `interval` ms for `seconds` from `from` (ms), the game's own work before each
// taking `work` ms: the beat at the end
function beatAfter(beat, { interval, work = 4, seconds = 12, from = 0 }) {
    let now = from;
    let value = beat.value;

    while (now < from + seconds * 1000) {
        const gap = typeof interval === "function" ? interval(now) : interval;

        now += gap;
        value = beat.observe(now, gap, work);
    }

    return value;
}

describe("the beat: how often the browser's asking for frames (app/frames.js Beat)", () => {
    it("is 60 a second till it's shown otherwise, and never faster, whatever the screen", () => {
        assert.equal(new Beat().value, BEAT.least);
        assert.equal(beatAfter(new Beat(), { interval: 1000 / 60 }), BEAT.least);
        assert.equal(beatAfter(new Beat(), { interval: 1000 / 120 }), BEAT.least);
        // (Times to the millisecond, as Safari gives them: 16 and 17)
        assert.equal(beatAfter(new Beat(), { interval: (now) => (Math.round(now) % 3 ? 17 : 16) }), BEAT.least);
    });

    it("is 30 a second for a browser that asks for no more, the game keeping up easily (an iPhone's Low Power Mode)", () => {
        const beat = new Beat();

        assert.equal(beatAfter(beat, { interval: 1000 / 30 }), Math.fround(1000 / 30));
        assert.ok(savingPower(beat.value));

        // (Set so as it plays: known within the span, and 60 again as soon as it's turned off)
        const turned = new Beat();

        beatAfter(turned, { interval: 1000 / 60, seconds: 20 });
        assert.equal(beatAfter(turned, { interval: 1000 / 30, seconds: BEAT.span / 1000 - 1, from: 20000 }), BEAT.least, "not yet");
        assert.equal(beatAfter(turned, { interval: 1000 / 30, seconds: 3, from: 29000 }), Math.fround(1000 / 30));
        assert.ok(beatChanged(turned.value, 1000 / 60));
        assert.equal(beatAfter(turned, { interval: 1000 / 60, seconds: 1, from: 32000 }), BEAT.least);
        assert.ok(!savingPower(turned.value));
    });

    it("isn't taken from frames the game itself made late: a device too slow for 60 is still judged against 60", () => {
        // (Every frame 33 ms after the last because its own work took 25: nothing said of the browser)
        const slow = new Beat();

        assert.equal(beatAfter(slow, { interval: 1000 / 30, work: 25, seconds: 60 }), BEAT.least);

        // (Keeping up at 60, then too slow for good: the beat stays as it was, however long)
        const slowed = new Beat();

        beatAfter(slowed, { interval: 1000 / 60, seconds: 20 });
        assert.equal(beatAfter(slowed, { interval: 1000 / 25, work: 30, seconds: 120, from: 20000 }), BEAT.least);

        // (Missing every other frame with little work of its own, its graphics behind, but for
        // one frame in three hundred: the screen's own beat shows)
        const missing = new Beat();
        let frames = 0;

        assert.equal(beatAfter(missing, { interval: () => (frames++ % 300 === 0 ? 1000 / 60 : 1000 / 30), seconds: 60 }), BEAT.least);

        // (A game stopped a while says nothing either)
        const stopped = new Beat();

        beatAfter(stopped, { interval: 1000 / 60, seconds: 2 });
        assert.equal(stopped.observe(60000, 58000, 0), BEAT.least);
    });

    it("tells a phone saving its power by a beat of about 30, not a screen's 60, nor a stall", () => {
        assert.ok(savingPower(1000 / 30) && savingPower(33) && savingPower(34));
        assert.ok(!savingPower(1000 / 60) && !savingPower(1000 / 40) && !savingPower(1000 / 20) && !savingPower(BEAT.least));
    });
});

describe("a browser asking for 30 frames a second, the device keeping up with every one (app/governor.js, app/throng.js)", () => {
    it("has nothing taken away: every body in full, the quality chosen at every pixel, however the times are rounded", () => {
        // (The frame loop as app/game.js #frame runs it: the beat first, then the throng, then
        // the governor unless the throng changed something. Low chosen, 14 about who could be in
        // a crowd, for two minutes. Before: 10 in full at 1.4 s, 6 at 4.3 s, for good; and with
        // exact times, Low at 0.85 of its pixels at 11 s, 0.7, 0.6, then half at 41 s.)
        for (const stamp of [(time) => Math.round(time), (time) => Math.round(time * 1000) / 1000, (time) => time]) {
            const beat = new Beat();
            const throng = new Throng();
            const governor = new Governor({ levels: ["low", "medium", "high"], ceiling: "low" });
            const said = [];
            let last = 0;

            for (let k = 1; k <= 30 * 120; k++) {
                const now = stamp(k * (1000 / 30));
                const interval = now - last;
                const about = { beat: beat.observe(now, interval, 9), built: 0 };
                const full = throng.observe(now, interval, { crowdable: 14, inFull: Math.min(14, throng.full), ...about });

                last = now;

                if (full !== null) {
                    said.push(`${Math.round(now / 100) / 10} s: ${full} in full`);
                    governor.hold(now);
                } else {
                    const rung = governor.observe(now, interval, about);

                    if (rung) {
                        said.push(`${Math.round(now / 100) / 10} s: ${rung.quality} at ${rung.scale}`);
                    }
                }
            }

            // (The beat's taken for 60 for the first quarter second, no more: nothing comes of it)
            assert.deepEqual(said, []);
            assert.equal(throng.full, Infinity);
            assert.deepEqual(governor.rung, { quality: "low", scale: 1 });
        }
    });
});
