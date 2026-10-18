// Soil trickling from an ants' nest's roof (client/js/world/trickles.js): none for a while after
// coming in, then now and then a stream near the player, from under the roof where it's high enough,
// its grains falling from the roof, its dust sifting up off the floor, for a second or two
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRICKLE, Trickles } from "../client/js/world/trickles.js";

// A random stream that's the same every run
function seeded(seed) {
    let h = seed >>> 0;

    return () => {
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        h ^= h >>> 15;

        return (h >>> 0) / 4294967296;
    };
}

// What's drawn over `seconds` (dt 0.1) where the player stands at (`x`, `z`) and the roof's `roof(x,
// z)`: the bursts, by kind, each with when (s) and where
function play(trickles, seconds, roof, at = { x: 50, z: 50 }) {
    const drawn = [];

    for (let t = 0; t < seconds; t += 0.1) {
        for (const { kind, at: from } of trickles.update(0.1, at, roof)) {
            drawn.push({ t, kind, x: from.x, y: from.y, z: from.z });
        }
    }

    return drawn;
}

describe("soil trickling from an ants' nest's roof (world/trickles.js)", () => {
    const roof = () => 3.8;

    it("starts none for a while after coming in, then now and then one near the player, under the roof, falling from it", () => {
        const trickles = new Trickles(seeded(5));
        const drawn = play(trickles, 120, roof);
        const grains = drawn.filter(({ kind }) => kind === "trickle");

        assert.ok(grains.length > 0);
        assert.ok(grains[0].t >= TRICKLE.first[0] - 0.1, `the first at ${grains[0].t.toFixed(1)} s`);

        for (const { x, y, z } of grains) {
            const away = Math.hypot(x - 50, z - 50);

            assert.ok(away >= TRICKLE.near[0] - 0.1 && away <= TRICKLE.near[1] + 0.1, `${away.toFixed(2)} m off`);
            assert.ok(Math.abs(y - (3.8 - 0.05)) < 1e-9, "from just under the roof");
        }

        // (Its dust sifting up off the floor where they fall, under them)
        const sifts = drawn.filter(({ kind }) => kind === "sift");

        assert.ok(sifts.length > 0 && sifts.every(({ y }) => y < 0.1));
        assert.ok(sifts.every(({ x, z }) => grains.some((grain) => Math.hypot(grain.x - x, grain.z - z) < 0.1)));
    });

    it("says when one starts, the frame it does, to be heard where it falls (app/game.js)", () => {
        const trickles = new Trickles(seeded(9));
        let starts = 0;

        for (let t = 0; t < 120; t += 0.1) {
            const before = trickles.running;

            trickles.update(0.1, { x: 50, z: 50 }, roof);

            if (trickles.started) {
                starts++;
                assert.equal(before, null);
                assert.equal(trickles.started, trickles.running);
                assert.ok(Math.hypot(trickles.started.x - 50, trickles.started.z - 50) <= TRICKLE.near[1] + 1e-9);
            } else {
                assert.ok(!trickles.running || trickles.running === before, "started unsaid");
            }
        }

        assert.ok(starts >= 120 / TRICKLE.every[1] - 1, `${starts} started`);
    });

    it("runs each for a second or two, as many grains a second as it has, and waits as long as it says between", () => {
        const trickles = new Trickles(seeded(9));
        const drawn = play(trickles, 600, roof).filter(({ kind }) => kind === "trickle");
        // (Each trickle's grains: a run with no gap longer than a frame or two)
        const runs = [];

        for (const grain of drawn) {
            const last = runs.at(-1);

            if (last && grain.t - last.to < 0.35) {
                last.to = grain.t;
                last.count += 1;
            } else {
                runs.push({ from: grain.t, to: grain.t, count: 1 });
            }
        }

        assert.ok(runs.length >= 600 / (TRICKLE.every[1] + TRICKLE.lasts[1]) - 1 && runs.length <= 600 / (TRICKLE.every[0] + TRICKLE.lasts[0]) + 1, `${runs.length} trickles in ten minutes`);

        for (const [k, run] of runs.entries()) {
            const lasted = run.to - run.from;

            assert.ok(lasted >= TRICKLE.lasts[0] - 0.3 && lasted <= TRICKLE.lasts[1] + 0.2, `${lasted.toFixed(2)} s`);
            assert.ok(Math.abs(run.count / (lasted + 0.1) - TRICKLE.grains) < TRICKLE.grains * 0.25, `${run.count} grains in ${lasted.toFixed(2)} s`);

            if (k > 0) {
                const between = run.from - runs[k - 1].to;

                assert.ok(between >= TRICKLE.every[0] - 0.3 && between <= TRICKLE.every[1] + 0.3, `${between.toFixed(1)} s between`);
            }
        }
    });

    it("falls only where the roof's high enough over the open ground, and none where there's no roof", () => {
        // (Only to the east is there roof enough)
        const east = (x) => (x > 50 ? 3.6 : x > 45 ? 1.2 : null);
        const drawn = play(new Trickles(seeded(13)), 300, (x) => east(x));

        assert.ok(drawn.length > 0);
        assert.ok(drawn.every(({ x }) => x > 50));
        assert.deepEqual(play(new Trickles(seeded(13)), 300, () => null), []);
    });

    it("starts again from the beginning in a new place: none running, the first a while off", () => {
        const trickles = new Trickles(seeded(21));

        play(trickles, 60, roof);
        trickles.reset();

        const drawn = play(trickles, TRICKLE.first[0] - 0.2, roof);

        assert.equal(trickles.running, null);
        assert.deepEqual(drawn, []);
    });
});
