// Keeping a crowded fight moving (app/throng.js: Game options, Adaptive): with many about who could
// be drawn in their kind's crowd, frames coming too slowly put those least seen in it, a few at a
// time, never all; frames to spare a while bring them back, a few at a time; one brought back that
// made it too slow is tried again only later
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Throng, THRONG } from "../client/js/app/throng.js";

const SLOW = 1000 / 30;
const FAST = 1000 / 60;

// Frames every so often (`interval`: ms, or a function of how many are drawn in full) for `seconds`
// from `from` (ms), `crowdable` about, as many drawn in full as the throng says, on a `beat` (ms a
// frame; none: 60 a second), each frame having spent `built` ms building: each change ([s, full])
function play(throng, { interval, seconds = 30, from = 0, crowdable = 30, beat, built }) {
    const changes = [];
    let now = from;

    while (now < from + seconds * 1000) {
        const inFull = Math.min(throng.full, crowdable);
        const gap = typeof interval === "function" ? interval(inFull) : interval;

        now += gap;

        const full = throng.observe(now, gap, { crowdable, inFull, beat, built });

        if (full !== null) {
            changes.push([Math.round(now / 100) / 10, full]);
        }
    }

    return changes;
}

describe("keeping a crowded fight moving (app/throng.js)", () => {
    it("leaves a fight that keeps up as it is, and one with few about however slow", () => {
        const fast = new Throng();

        assert.deepEqual(play(fast, { interval: FAST, seconds: 60 }), []);
        assert.equal(fast.full, Infinity);

        const few = new Throng();

        assert.deepEqual(play(few, { interval: SLOW, seconds: 60, crowdable: THRONG.from }), []);
        assert.equal(few.full, Infinity);
    });

    it("too slow, puts a few more in the crowds at a time, once it's settled each time, never all of them", () => {
        const throng = new Throng();
        // (Each one fewer in full a little quicker, and too slow still with the fewest)
        const changes = play(throng, { interval: (inFull) => 20 + inFull * 0.6, seconds: 30 });

        assert.deepEqual(changes.slice(0, 3).map(([, full]) => full), [30 - THRONG.step, 30 - 2 * THRONG.step, 30 - 3 * THRONG.step]);
        assert.ok(changes[0][0] <= 2, `straight away, over a window (${changes[0][0]} s)`);
        assert.ok(changes[1][0] - changes[0][0] >= (THRONG.settle + THRONG.window * 0.9) / 1000, "judged again once settled, over a whole window");
        assert.equal(throng.full, THRONG.keep);
        assert.equal(changes.at(-1)[1], THRONG.keep);
        assert.deepEqual(play(throng, { interval: (inFull) => 20 + inFull * 0.6, seconds: 120, from: 30000 }), [], "and left there while it's too slow");
    });

    it("draws them all in full again once as many as can be are in the crowds and it's no quicker, and tries again only after a while, longer each time", () => {
        const throng = new Throng();
        const changes = play(throng, { interval: SLOW, seconds: 300 });
        const least = changes.findIndex(([, full]) => full === THRONG.keep);
        const backs = changes.map(([at, full], k) => (full === Infinity ? [at, k] : null)).filter(Boolean);

        // (As slow with 6 in full as with 30: the bodies aren't what's slow)
        assert.deepEqual(changes.slice(0, least + 2).map(([, full]) => full), [26, 22, 18, 14, 10, 6, Infinity]);
        assert.ok(backs.length >= 2 && backs.length <= 4, `tried again a few times in five minutes (${backs.map(([at]) => at)})`);

        const waits = backs.slice(0, -1).map(([at, k]) => changes[k + 1][0] - at);

        assert.ok(waits[0] >= THRONG.retry / 1000 && waits[0] < (THRONG.retry / 1000) * 1.5, `left so 20 seconds (${waits})`);
        assert.ok(waits.length < 2 || waits[1] >= (THRONG.retry / 1000) * 2, `then 40 (${waits})`);
    });

    it("judges against the frames the browser's asking for: 30 a second on a beat of 30 is keeping up, and all stay in full", () => {
        const beat = 1000 / 30;

        // (A phone saving its battery: fed 30 a second it used to leave 6 in full, for good)
        for (const interval of [beat, Math.round(beat), beat * 1.2]) {
            const throng = new Throng();

            assert.deepEqual(play(throng, { interval, beat, seconds: 120, crowdable: 14 }), [], `${interval} ms a frame`);
            assert.equal(throng.full, Infinity);
        }

        // (Well behind that beat it's too slow, as ever; near it again, they come back)
        const behind = new Throng();

        assert.deepEqual(play(behind, { interval: (inFull) => (inFull > 22 ? beat * 1.5 : beat), beat, seconds: 8 }).map(([, full]) => full), [26, 22]);
        play(behind, { interval: beat, beat, seconds: 120, from: 8000 });
        assert.equal(behind.full, Infinity);
    });

    it("draws in full again those put in the crowds for a slowness that wasn't one: the browser asking for fewer frames from then on", () => {
        const throng = new Throng();

        // (A phone set to save its battery as it plays: 30 a second from now, the beat not known yet)
        assert.deepEqual(play(throng, { interval: SLOW, seconds: 8 }).map(([, full]) => full), [26, 22, 18]);
        // (Known: all in full again at once, and left so)
        assert.deepEqual(play(throng, { interval: SLOW, beat: SLOW, seconds: 60, from: 8000 }).map(([, full]) => full), [Infinity]);
    });

    it("leaves everyone in full through a stretch of building at 25 frames a second: fewer bodies cure none of it", () => {
        const throng = new Throng();

        assert.deepEqual(play(throng, { interval: 1000 / 25, built: 25, seconds: 60 }), []);
        assert.equal(throng.full, Infinity);
        // (As slow with little of it building: too slow, as ever)
        assert.equal(play(throng, { interval: 1000 / 25, built: 6, seconds: 3, from: 60000 }).length, 1);
    });

    it("with time to spare a while, brings them back a few at a time, all of them in the end", () => {
        const throng = new Throng();

        play(throng, { interval: SLOW, seconds: 6 });

        const shed = throng.full;
        const back = play(throng, { interval: FAST, seconds: 300, from: 6000 });

        assert.ok(shed < 30);
        assert.equal(back[0][1], shed + THRONG.back);
        assert.ok(back[0][0] - 6 >= THRONG.up / 1000, `time to spare a while first (${back[0][0]} s)`);
        assert.equal(throng.full, Infinity);
        assert.deepEqual(
            back.slice(1, -1).map(([, full], k) => full - back[k][1]),
            back.slice(1, -1).map(() => THRONG.back),
        );
    });

    it("tries again only after a while, longer each time, more drawn in full that made it too slow, so it doesn't see-saw", () => {
        const throng = new Throng();
        // (Too slow with more than 14 drawn in full, fast enough with 14 or fewer)
        const fullAt = [];

        for (let k = 0; k < 600; k++) {
            play(throng, { interval: (inFull) => (inFull > 14 ? SLOW : FAST), seconds: 1, from: k * 1000 });
            fullAt.push(Math.min(throng.full, 30));
        }

        const raises = fullAt.map((full, k) => (k > 0 && full > 14 && fullAt[k - 1] <= 14 ? k : null)).filter((k) => k !== null);

        assert.ok(raises.length >= 2 && raises.length <= 6, `tried again a few times in ten minutes, not every few seconds (${raises})`);
        assert.ok(raises[2] - raises[1] > raises[1] - raises[0], `waits longer each time (${raises})`);
        assert.ok(fullAt.slice(60).filter((full) => full > 14).length < 60, "mostly where it keeps up");
    });

    it("forgives a hitch now and then, and a game stopped a while; all drawn in full again once there are few about", () => {
        const throng = new Throng();
        let now = 0;

        for (let k = 0; k < 2000; k++) {
            const interval = k % 10 === 0 ? 166 : FAST;

            now += interval;
            assert.equal(throng.observe(now, interval, { crowdable: 30, inFull: 30 }), null);
        }

        assert.equal(throng.observe(now + 60000, 60000, { crowdable: 30, inFull: 30 }), null);

        play(throng, { interval: SLOW, seconds: 10, from: now + 60000 });
        assert.ok(throng.full < 30);
        assert.equal(throng.observe(now + 80000, FAST, { crowdable: THRONG.keep, inFull: THRONG.keep }), Infinity);
        assert.equal(throng.full, Infinity);

        throng.reset();
        assert.equal(throng.full, Infinity);
    });
});
