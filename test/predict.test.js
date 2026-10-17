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

describe("your hero, running with the stick held over a phone's link (predict.js)", () => {
    // The stick held: an order sent every 500 ms (app/steering.js), each coming back done `took(k)`
    // ms later (some taking longer than the next is sent after); the copy running at `pace` once
    // the first's done, and turning `turn` (radians) once the order sent at `turnAt` is done.
    // How far the hero's drawn going each frame (m/s), and which way (radians), after `from` ms.
    const run = ({ took, turnAt = Infinity, turn = 0, until = 8000, from = 2000 }) => {
        const prediction = new Prediction();
        const actor = hero();
        const pace = 6.3;
        const frame = 1000 / 60;
        const orders = [];
        const going = [];
        let heading = 0;
        let last = null;

        for (let now = 0, k = 0; now < until; now += frame) {
            if (now >= k * 500) {
                const facing = now >= turnAt ? turn : 0;
                const to = [actor.x + Math.sin(facing) * 30, actor.y + Math.cos(facing) * 30];

                orders.push({ order: prediction.ordered(actor, to, true, now, [Math.sin(facing), Math.cos(facing)]), due: now + took(k), facing });
                k++;
            }

            // (The copy going on a frame as it was, then hearing what's done: going its new way from the next)
            if (actor.progress) {
                actor.x += (Math.sin(heading) * pace * frame) / 1000;
                actor.y += (Math.cos(heading) * pace * frame) / 1000;
            }

            for (const sent of orders.filter(({ due }) => due <= now)) {
                orders.splice(orders.indexOf(sent), 1);
                prediction.done({ ok: true }, now, sent.order);
                heading = sent.facing;
                [actor.progress, actor.pace] = [{ left: 30, at: 0 }, pace];
            }

            if (actor.progress) {
                actor.path = [[actor.x + Math.sin(heading) * 30, actor.y + Math.cos(heading) * 30]];
            }

            const drawn = prediction.at(actor, actor.x, actor.y, now);

            if (last && now > from) {
                going.push({ at: now, speed: (apart(drawn, last) / frame) * 1000, way: Math.atan2(drawn[0] - last[0], drawn[1] - last[1]) });
            }

            last = drawn;
        }

        return { going, pace, prediction };
    };

    it("is drawn going on at the same pace, as far ahead as the orders take to come back, each sent again before the last's come", () => {
        // (Each taking 350 to 650 ms: half a second there and back and in hand, give or take)
        const { going, pace, prediction } = run({ took: (k) => 350 + ((k * 7) % 4) * 100 });
        const speeds = going.map(({ speed }) => speed / pace);

        assert.ok(Math.min(...speeds) > 0.85 && Math.max(...speeds) < 1.15, `drawn going ${Math.min(...speeds).toFixed(2)} to ${Math.max(...speeds).toFixed(2)} times their pace`);
        assert.ok(Math.abs(prediction.lead - 500) < 100, `${prediction.lead} ms ahead`);
    });

    it("turns at once when the stick's turned, going on at the same pace, the copy turning when the host hears", () => {
        const { going, pace } = run({ took: () => 450, turnAt: 4000, turn: Math.PI / 2, from: 3000 });
        const after = going.filter(({ at }) => at > 4000 + 1000 / 60);

        // (Going east at once, give or take a few degrees as they come round to where the copy
        // turned; never back the way they came; and as fast as they were going, give or take)
        const ways = after.map(({ way }) => way);
        const speeds = going.map(({ speed }) => speed / pace);

        assert.ok(after.filter(({ at }) => at > 4000 + PREDICT.blend).every(({ way }) => Math.abs(way - Math.PI / 2) < 0.15), `${Math.min(...ways).toFixed(2)} to ${Math.max(...ways).toFixed(2)} radians, once turned`);
        assert.ok(ways.every((way) => way > -0.05 && way < Math.PI / 2 + 0.15), "turning, not going back");
        assert.ok(Math.min(...speeds) > 0.85 && Math.max(...speeds) < 1.15, `${Math.min(...speeds).toFixed(2)} to ${Math.max(...speeds).toFixed(2)} times their pace`);
    });
});
