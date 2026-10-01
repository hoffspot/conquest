// A joined game's own hero drawn going where they're sent at once, ahead of the copy of the world
// while the host hears of it, and closed up to the copy within 150 ms (app/predict.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PREDICT, Prediction } from "../client/js/app/predict.js";

// A hero as the copy has them: standing, walking at 1.4 m/s
const hero = () => ({ x: 10, y: 10, map: "town", dead: false, progress: null, path: [], pace: 1.4, walkPace: 1.4, speed: 1.4, afflictions: [] });
const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

describe("your hero, drawn ahead (predict.js)", () => {
    it("sets off at once, keeps as far ahead along the way as the host took to hear, and arrives with the copy", () => {
        const prediction = new Prediction();
        const actor = hero();
        const frame = 1000 / 60;
        let now = 0;

        assert.deepEqual(prediction.at(actor, actor.x, actor.y, now), [10, 10]);
        prediction.ordered(actor, [20, 10], false, now);

        // (Not heard yet: going east at walking pace all the same)
        for (; now < 240; now += frame) {
            prediction.at(actor, actor.x, actor.y, now);
        }

        const before = prediction.at(actor, actor.x, actor.y, now);

        assert.ok(Math.abs(before[0] - (10 + (1.4 * now) / 1000)) < 1e-9 && before[1] === 10, `${before}`);

        // (Heard done: the copy walks its way; drawn as far ahead of it, with no jump)
        prediction.done({ ok: true }, now);
        actor.progress = { left: 10, at: 0 };
        actor.path = [[20, 10]];

        let last = before;
        let most = 0;

        for (const end = now + 8000; now < end; now += frame) {
            actor.x = Math.min(20, actor.x + (1.4 * frame) / 1000);

            if (actor.x >= 20) {
                [actor.progress, actor.path] = [null, []];
            }

            const drawn = prediction.at(actor, actor.x, actor.y, now);

            most = Math.max(most, apart(drawn, last));
            last = drawn;

            if (actor.progress) {
                assert.ok(drawn[0] >= actor.x && drawn[0] <= 20 + 1e-9);
            }
        }

        // (Never more than a frame's walk and a hair from one frame to the next)
        assert.ok(most < (1.4 * frame) / 1000 + 0.01, `${most} m in a frame`);
        // (Arrived, together)
        assert.deepEqual(last, [20, 10]);
    });

    it("closes up to the copy within 150 ms when the host had the hero go nowhere", () => {
        const prediction = new Prediction();
        const actor = hero();
        let now = 0;

        prediction.at(actor, actor.x, actor.y, now);
        prediction.ordered(actor, [10, 30], true, now);

        for (; now <= 300; now += 16) {
            prediction.at(actor, actor.x, actor.y, now);
        }

        const off = apart(prediction.at(actor, actor.x, actor.y, now), [10, 10]);
        const seconds = now / 1000;

        // (Setting off at a walk, speeding up as a runner does: 6 m/s each second)
        assert.ok(Math.abs(off - (1.4 * seconds + 3 * seconds * seconds)) < 1e-9, `${off} m ahead, running`);
        prediction.done({ ok: false }, now);

        const from = now;
        const gaps = [];

        for (; now <= from + PREDICT.blend + 16; now += 16) {
            gaps.push(apart(prediction.at(actor, actor.x, actor.y, now), [10, 10]));
        }

        assert.ok(gaps.every((gap, k) => k === 0 || gap <= gaps[k - 1] + 1e-9), "(closing all the while)");
        assert.equal(gaps.at(-1), 0);
    });

    it("is drawn where the copy has them at once, gone far (through a door, or by magic), or on another map", () => {
        const prediction = new Prediction();
        const actor = hero();

        prediction.at(actor, 10, 10, 0);
        assert.deepEqual(prediction.at(actor, 40, 10, 16), [40, 10]);

        actor.map = "taproom";
        assert.deepEqual(prediction.at(actor, 5, 5, 32), [5, 5]);

        // (Any other order: no guessing)
        prediction.ordered(actor, [9, 5], false, 48);
        prediction.other();
        assert.deepEqual(prediction.at(actor, 5, 5, 300), [5, 5]);
    });
});
