import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { metresOf } from "../client/js/core/terrain/curve.js";
import { HEIGHT_STEP, heightAt, heightsOf, SLOPE_CLASS, slopeClass, stillOf, waterAt } from "../client/js/core/terrain/height.js";
import { simplex } from "../client/js/core/terrain/simplex.js";
import { watersOf } from "../client/js/core/terrain/waters.js";
import { BIOMES, CELL, CELLS, CHUNK, planWorld, WATER } from "../client/js/core/worldplan/plan.js";
import { MOUNTAIN, SEA_LEVEL } from "../client/js/core/worldplan/terrain.js";

const plan = planWorld(1);

// Points spread over the world, the same every run
function* spread(count) {
    for (let k = 0; k < count; k++) {
        yield [((k * 7919) % 8000) + 96.5, ((k * 104729) % 8000) + 96.5];
    }
}

describe("simplex noise (terrain/simplex.js)", () => {
    test("stays between -1 and 1, the same for the same seed, and rises as its slope says", () => {
        const out = [0, 0, 0];
        let [low, high] = [0, 0];

        for (let k = 0; k < 200000; k++) {
            const [x, y] = [(k % 500) * 0.173, Math.floor(k / 500) * 0.131];
            const [n] = simplex(x, y, 7, out);

            [low, high] = [Math.min(low, n), Math.max(high, n)];

            if (k % 997 === 0) {
                const e = 1e-6;
                const [n1, dx, dy] = simplex(x, y, 7, [0, 0, 0]);

                assert.equal(simplex(x, y, 7, [0, 0, 0])[0], n1);
                assert.ok(Math.abs((simplex(x + e, y, 7)[0] - simplex(x - e, y, 7)[0]) / (2 * e) - dx) < 1e-5);
                assert.ok(Math.abs((simplex(x, y + e, 7)[0] - simplex(x, y - e, 7)[0]) / (2 * e) - dy) < 1e-5);
            }
        }

        assert.ok(low >= -1.001 && low < -0.95, `lowest ${low}`);
        assert.ok(high <= 1.001 && high > 0.95, `highest ${high}`);
        assert.notEqual(simplex(3.3, 4.4, 1)[0], simplex(3.3, 4.4, 2)[0]);
    });
});

describe("the ground's height (terrain/height.js)", () => {
    test("rises with the plan's height: the sea at 0, the plains low and gentle, the peaks hundreds of metres up", () => {
        let last = -Infinity;

        for (let h = 0; h <= 1; h += 0.005) {
            assert.ok(metresOf(h) > last);
            last = metresOf(h);
        }

        assert.ok(Math.abs(metresOf(SEA_LEVEL)) < 1e-9);
        assert.ok(metresOf(0.45) < 30);
        assert.ok(metresOf(MOUNTAIN) > 80 && metresOf(1) > 300);
    });

    test("is the same wherever and in whatever order it's asked, in whole 1/1024ths of a metre a Float32Array holds exactly", () => {
        const [x0, y0] = [40 * CHUNK, 70 * CHUNK];
        const first = heightsOf(plan, x0, y0, CHUNK + 1, 1);

        // (Other chunks, then this one again backwards)
        heightsOf(plan, 12 * CHUNK, 99 * CHUNK, 33, 2);

        for (let k = first.length - 1; k >= 0; k -= 7) {
            const [i, j] = [k % (CHUNK + 1), Math.floor(k / (CHUNK + 1))];
            const height = heightAt(plan, x0 + i, y0 + j);

            assert.equal(height, first[k]);
            assert.equal(Math.fround(height), height);
            assert.equal(Math.round(height / HEIGHT_STEP) * HEIGHT_STEP, height);
        }

        // (A chunk's edge is its neighbour's edge)
        const east = heightsOf(plan, x0 + CHUNK, y0, CHUNK + 1, 1);

        for (let j = 0; j <= CHUNK; j++) {
            assert.equal(east[j * (CHUNK + 1)], first[j * (CHUNK + 1) + CHUNK]);
        }
    });

    test("can be walked almost everywhere on the plains, and hardly anywhere up the mountains", () => {
        const counts = {};

        for (const [x, y] of spread(12000)) {
            const k = Math.floor(y / CELL) * CELLS + Math.floor(x / CELL);
            const land = BIOMES[plan.biome[k]].id;
            const kind = ["farmland", "meadow", "savannah", "jungle", "elfwood", "darkwood"].includes(land) ? "plains" : land === "mountain" ? "mountains" : null;

            if (!kind || plan.water[k] !== WATER.none) {
                continue;
            }

            const slope = slopeClass(heightAt(plan, x, y), heightAt(plan, x + 1, y), heightAt(plan, x, y + 1), heightAt(plan, x + 1, y + 1));

            counts[kind] ??= [0, 0];
            counts[kind][0]++;
            counts[kind][1] += slope === SLOPE_CLASS.open ? 1 : 0;
        }

        const open = (kind) => counts[kind][1] / counts[kind][0];

        assert.ok(counts.plains[0] > 1000 && counts.mountains[0] > 100);
        assert.ok(open("plains") > 0.9, `plains open ${open("plains")}`);
        assert.ok(open("mountains") < 0.35, `mountains open ${open("mountains")}`);
    });

    test("carves lakes and the sea under their water, and a channel for each river, its surface always running down", () => {
        const waters = watersOf(plan);
        let [lakes, rivers] = [0, 0];

        for (let k = 0; k < CELLS * CELLS; k++) {
            const [x, y] = [((k % CELLS) + 0.5) * CELL, (Math.floor(k / CELLS) + 0.5) * CELL];

            // (A lake's middle, well in from its shore)
            if (plan.water[k] === WATER.lake && [-1, 0, 1].every((dj) => [-1, 0, 1].every((di) => plan.water[k + dj * CELLS + di] === WATER.lake))) {
                const height = heightAt(plan, x, y);

                assert.ok(stillOf(plan, x, y).level > height);
                assert.equal(waterAt(plan, x, y, height), stillOf(plan, x, y).level);
                lakes++;
            }
        }

        for (let cy = 0; cy < 128; cy += 3) {
            for (let cx = 0; cx < 128; cx += 3) {
                for (const [ax, ay, bx, by, half, from, to] of waters.riversNear(cx, cy)) {
                    assert.ok(to <= from, "rivers run down");
                    assert.ok(half >= 1.5);

                    // (In the channel, wherever it wanders to: its bed below the surface)
                    for (let t = 0.1; t < 1; t += 0.2) {
                        const [x, y] = [ax + (bx - ax) * t, ay + (by - ay) * t];

                        for (let dx = -12; dx <= 12; dx++) {
                            const surface = waterAt(plan, x + dx, y);

                            if (surface !== null && waters.river(x + dx, y, 0)?.gap <= 0) {
                                assert.ok(heightAt(plan, x + dx, y) < surface);
                                rivers++;
                            }
                        }
                    }
                }
            }
        }

        assert.ok(lakes > 10 && rivers > 100, `${lakes} lake points, ${rivers} river points`);
    });

    test("is quick enough to make a chunk's heights as it's needed", () => {
        const times = [];

        for (let k = 0; k < 12; k++) {
            const started = performance.now();

            heightsOf(plan, (20 + k * 7) * CHUNK, (30 + k * 5) * CHUNK, CHUNK + 1, 1);
            times.push(performance.now() - started);
        }

        times.sort((a, b) => a - b);
        // (About 6 ms on a desktop; generous, for slow test machines)
        assert.ok(times[6] < 60, `median ${times[6]} ms`);
    });
});
