// The frame's jobs done a couple of times a second (client/js/app/clocks.js, app/game.js #due):
// each at its own share of the time, so they don't all land in one frame as they did, and none
// begun on a frame that stepped the battle unless it's been asked for now
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clockTurn, DUE, followsNow, nextSlot, PUT_OFF, WAIT } from "../client/js/app/clocks.js";

// The game's ten jobs' shares of each half second (app/game.js PACED), and one every two seconds
const OFFSETS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];

// Frames of `dt` seconds (or what a function of the frame's number says) for `seconds`, the battle
// stepped every twentieth of a second, each job's clock kept as app/game.js #due keeps it: for
// each frame, which jobs were done in it and whether it stepped
function play({ dt, seconds, offsets = OFFSETS, every = 0.5 }) {
    const clocks = offsets.map(() => 0);
    const frames = [];
    let now = 0;
    let owed = 0;

    for (let frame = 0; now < seconds; frame++) {
        const gap = typeof dt === "function" ? dt(frame) : dt;

        now += gap;
        owed += gap;

        const stepped = owed >= 0.05;

        owed -= stepped ? 0.05 * Math.floor(owed / 0.05) : 0;

        const done = [];

        offsets.forEach((offset, job) => {
            const turn = clockTurn(clocks[job], gap, stepped);

            clocks[job] = turn === DUE ? nextSlot(now, every, offset) : turn === PUT_OFF ? 0 : clocks[job] - gap;

            if (turn === DUE) {
                done.push(job);
            }
        });

        frames.push({ now, stepped, done });
    }

    return frames;
}

describe("the frame's jobs done every so often (app/clocks.js)", () => {
    it("gives a clock its turn: not yet, due, or put off a frame when it comes due on one that stepped the battle, unless it's asked for now", () => {
        assert.equal(clockTurn(0.3, 0.016, false), WAIT);
        assert.equal(clockTurn(0.3, 0.016, true), WAIT);
        assert.equal(clockTurn(0.01, 0.016, false), DUE);
        assert.equal(clockTurn(0.01, 0.016, true), PUT_OFF);
        assert.equal(clockTurn(0, 0.016, true), DUE, "asked for now (or put off already): never put off");
        assert.equal(clockTurn(-1, 0.016, true), DUE);
        assert.equal(clockTurn(0, 0, false), DUE);
    });

    it("has a job next due at its own share of the time, never sooner than half its while", () => {
        assert.ok(Math.abs(nextSlot(10, 0.5, 0) - 0.5) < 1e-9);
        assert.ok(Math.abs(nextSlot(10.1, 0.5, 0) - 0.4) < 1e-9);
        assert.ok(Math.abs(nextSlot(10, 0.5, 0.15) - 0.65) < 1e-9, "0.15 s off: its own slot, not the next one 0.15 s on");
        assert.ok(Math.abs(nextSlot(10.4, 0.5, 0) - 0.6) < 1e-9, "done late: not again a tenth of a second on");
        assert.ok(Math.abs(nextSlot(0.01, 2, 0.075) - 2.065) < 1e-9);

        for (let now = 0; now < 3; now += 0.013) {
            for (const offset of OFFSETS) {
                const left = nextSlot(now, 0.5, offset);
                const at = (now + left - offset) / 0.5;

                assert.ok(left >= 0.25 - 1e-9 && left <= 0.75 + 1e-9, `${left}`);
                assert.ok(Math.abs(at - Math.round(at)) < 1e-6, "on its own slot");
            }
        }
    });

    it("spreads the ten of them over the frames: all in the first, as ever, then never two in one at 60 frames a second, each a couple of times a second", () => {
        const frames = play({ dt: 1 / 60, seconds: 60 });

        assert.equal(frames[0].done.length, OFFSETS.length, "all at the start");

        const after = frames.slice(1);

        // (Before: one frame in thirty did all ten)
        assert.equal(Math.max(...after.map(({ done }) => done.length)), 1);

        for (const job of OFFSETS.keys()) {
            const times = after.filter(({ done }) => done.includes(job)).map(({ now }) => now);
            const gaps = times.slice(1).map((time, k) => time - times[k]);

            assert.ok(times.length >= 118 && times.length <= 120, `job ${job}: ${times.length} times in a minute`);
            assert.ok(Math.min(...gaps) > 0.44 && Math.max(...gaps) < 0.56, `job ${job}: every half second or so (${Math.min(...gaps)} to ${Math.max(...gaps)})`);
        }
    });

    it("begins none on a frame that stepped the battle while there are frames that don't, and still does them all when every frame steps", () => {
        const quick = play({ dt: 1 / 60, seconds: 30 }).slice(1);

        assert.ok(quick.some(({ stepped }) => stepped) && quick.some(({ stepped }) => !stepped));
        assert.deepEqual(quick.filter(({ stepped, done }) => stepped && done.length), [], "at 60 frames a second, two frames in three don't step");

        // (At 20 frames a second every frame steps: each put off a frame, once, and done)
        const slow = play({ dt: 1 / 20, seconds: 30 }).slice(1);

        assert.ok(slow.every(({ stepped }) => stepped));

        for (const job of OFFSETS.keys()) {
            const times = slow.filter(({ done }) => done.includes(job)).length;

            assert.ok(times >= 50 && times <= 60, `job ${job}: ${times} times in half a minute`);
        }

        // (Frames of uneven length, a hitch now and then: none lost, none come together for good)
        const uneven = play({ dt: (frame) => (frame % 97 === 0 ? 0.12 : 1 / 60 + ((frame * 7) % 5) / 1000), seconds: 60 }).slice(1);
        const together = uneven.filter(({ done }) => done.length > 1).length;

        assert.ok(together < uneven.length / 50, `${together} frames of ${uneven.length} with more than one`);
        // (A hitch of an eighth of a second spans three of their shares: those three, no more)
        assert.ok(Math.max(...uneven.slice(-600).map(({ done }) => done.length)) <= 4, "and never all in one again");
    });

    it("looks again at what follows the battle on the frame after one that stepped it, or the player told it something; every tenth of a second without; every frame played on by hand", () => {
        // (Sixty frames a second, a step every third: as app/game.js #update asks it)
        const every = 0.1;
        let clock = 0;
        let last = -Infinity;
        let due = true;
        let looks = 0;
        const frame = (stepped, told = false) => {
            clock += 1 / 60;

            const fresh = followsNow(false, due || told, clock, last, every);

            due = stepped;
            last = fresh ? clock : last;
            looks += fresh ? 1 : 0;

            return fresh;
        };

        assert.equal(frame(false), true, "the first frame");

        const seen = [];

        for (let k = 0; k < 60; k++) {
            seen.push(frame(k % 3 === 0));
        }

        assert.equal(looks, 21, "twenty times a second, not sixty");
        assert.ok(seen.every((fresh, k) => fresh === (k % 3 === 1)), "on the frame after each that stepped");

        // (Told something between steps: looked at in the very next frame)
        frame(true);
        assert.equal(frame(false), true);
        assert.equal(frame(false, true), true, "a tap answers at once");
        assert.equal(frame(false), false);

        // (No step coming, a joined game waiting on its host: every tenth of a second all the same)
        looks = 0;

        for (let k = 0; k < 60; k++) {
            frame(false);
        }

        assert.ok(looks >= 8 && looks <= 10, `${looks} looks in a second with no step`);

        // (Played on by hand, every frame; and the clock gone back, at once)
        assert.equal(followsNow(true, false, 5, 5, every), true);
        assert.equal(followsNow(false, false, 5, 5, every), false);
        assert.equal(followsNow(false, false, 1, 5, every), true);
    });
});
