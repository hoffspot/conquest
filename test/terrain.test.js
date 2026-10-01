import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { metresOf } from "../client/js/core/terrain/curve.js";
import { HEIGHT_STEP, heightAt, heightsOf, SLOPE_CLASS, slopeClass, stillOf, waterAt } from "../client/js/core/terrain/height.js";
import { simplex } from "../client/js/core/terrain/simplex.js";
import { FORDS, REACH, RIVER_HALF, RUNNING, STREAMS, wadeable, watersOf } from "../client/js/core/terrain/waters.js";
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
                for (const { ax, ay, bx, by, half, surface, stream } of waters.riversNear(cx, cy)) {
                    assert.ok(surface[1] <= surface[0], "rivers run down");
                    assert.ok(Math.min(...half) >= (stream ? STREAMS.half[0] : RIVER_HALF[0]));

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

describe("the rivers (terrain/waters.js)", () => {
    const waters = watersOf(plan);
    const rivers = [];

    for (let k = 0; k < CELLS * CELLS; k++) {
        if (plan.water[k] === WATER.river && waters.downstream(k % CELLS, Math.floor(k / CELLS))) {
            rivers.push(k);
        }
    }

    const into = (k) => {
        const [i, j] = waters.downstream(k % CELLS, Math.floor(k / CELLS));

        return j * CELLS + i;
    };

    test("run as curves through their cells, each piece on from the last and turning gently, and only ever down", () => {
        let joins = 0;

        for (const k of rivers.filter((_, n) => n % 7 === 0)) {
            const { pieces } = waters.course(k);

            pieces.forEach((piece, p) => {
                assert.ok(piece.surface[1] <= piece.surface[0], "down");
                assert.ok(Math.min(...piece.half) >= RIVER_HALF[0]);

                if (p > 0) {
                    const last = pieces[p - 1];

                    assert.ok(Math.abs(last.bx - piece.ax) < 1e-9 && Math.abs(last.by - piece.ay) < 1e-9, "joined");
                    assert.ok(piece.surface[0] <= last.surface[1] + 1e-9, "down");
                    // (Turning less than 60° from one piece to the next)
                    assert.ok(last.dx * piece.dx + last.dy * piece.dy > 0.5, "gently");
                }
            });

            // (On into the next cell's course, if it carries this river on)
            const next = into(k);

            if (plan.water[next] === WATER.river && waters.downstream(next % CELLS, Math.floor(next / CELLS))) {
                const [end, start] = [pieces.at(-1), waters.course(next).pieces[0]];

                if (Math.abs(end.bx - start.ax) < 1e-9 && Math.abs(end.by - start.ay) < 1e-9) {
                    assert.ok(start.surface[0] <= end.surface[1] + 1e-9, "down into the next");
                    assert.ok(end.dx * start.dx + end.dy * start.dy > 0.5, "gently into the next");
                    joins++;
                }
            }
        }

        assert.ok(joins > 100, `${joins} joins`);
    });

    test("fall calmly, in rapids, or in steps: level pools, each spilling over a lip into the next", () => {
        const kinds = [0, 0, 0];
        let lips = 0;

        for (const k of rivers) {
            const { reach, pieces } = waters.course(k);

            kinds[reach]++;

            if (reach === REACH.steps) {
                pieces.forEach((piece, p) => {
                    assert.equal(piece.surface[0], piece.surface[1], "a level pool");

                    if (p + 1 < pieces.length) {
                        assert.ok(Math.abs(piece.lip - (piece.surface[1] - pieces[p + 1].surface[0])) < 1e-9, "spilling over its lip");
                        assert.equal(pieces[p + 1].plunge, piece.lip, "into the next");
                    }

                    lips += piece.lip > 0 ? 1 : 0;
                });
            } else {
                // (No lips, but at its end where the cell it carries on into starts with a drop)
                assert.ok(pieces.slice(0, -1).every(({ lip }) => lip === 0));
            }

            // (Spilling at its end down onto where the next cell starts, which plunges as far)
            const [end, next] = [pieces.at(-1), into(k)];

            if (end.lip > 0 && plan.water[next] === WATER.river && Math.abs(waters.course(next).pieces[0].ax - end.bx) < 1e-9 && Math.abs(waters.course(next).pieces[0].ay - end.by) < 1e-9) {
                const start = waters.course(next).pieces[0];

                assert.ok(Math.abs(end.surface[1] - end.lip - start.surface[0]) < 1e-9, "down onto the next");
                assert.ok(start.plunge >= end.lip, "plunging into it");
            }
        }

        assert.ok(kinds[REACH.calm] > kinds[REACH.rapids] && kinds[REACH.rapids] > kinds[REACH.steps] && kinds[REACH.steps] > 10 && lips > kinds[REACH.steps], `${kinds} reaches, ${lips} lips`);
    });

    test("run fastest in their middles and still at their banks, faster down rapids and over lips, the way their courses go", () => {
        const calm = [];
        const rapid = [];

        for (const k of rivers.filter((_, n) => n % 3 === 0)) {
            const { reach, pieces } = waters.course(k);
            const piece = pieces[1];
            const [x, y] = [(piece.ax + piece.bx) / 2, (piece.ay + piece.by) / 2];
            const middle = waters.river(x, y, 0);

            if (!middle || middle.gap > -piece.half[0] * 0.5) {
                continue;
            }

            (reach === REACH.calm ? calm : reach === REACH.rapids ? rapid : []).push(middle.speed);

            const current = waters.current(x, y);

            assert.ok(current[0] * piece.dx + current[1] * piece.dy > 0, "downstream");
        }

        // (Across each river: slow by its banks, fast in its middle)
        const [banks, middles] = [[], []];

        for (const k of rivers.filter((_, n) => n % 11 === 0)) {
            const piece = waters.course(k).pieces[2];
            const [x, y] = [(piece.ax + piece.bx) / 2, (piece.ay + piece.by) / 2];

            for (let off = -20; off <= 20; off += 0.25) {
                const river = waters.river(x - piece.dy * off, y + piece.dx * off, 0);

                if (river && river.gap <= 0) {
                    (river.gap > -0.3 ? banks : river.gap < -river.half * 0.7 ? middles : []).push(river.speed);
                }
            }
        }

        banks.sort((a, b) => a - b);
        middles.sort((a, b) => a - b);
        assert.ok(banks[Math.floor(banks.length / 2)] < middles[Math.floor(middles.length / 2)] * 0.4, `${banks[Math.floor(banks.length / 2)]} by the banks, ${middles[Math.floor(middles.length / 2)]} in the middle`);

        calm.sort((a, b) => a - b);
        rapid.sort((a, b) => a - b);
        assert.ok(calm.length > 50 && rapid.length > 5 && rapid[Math.floor(rapid.length / 2)] > calm[Math.floor(calm.length / 2)] * 2, `calm ${calm[Math.floor(calm.length / 2)]}, rapids ${rapid[Math.floor(rapid.length / 2)]}`);
        assert.ok(calm[0] > 0.15 && calm.at(-1) < 4.6, "never still in their middles, never past the fastest");
    });

    test("have fords on small calm rivers: wider, and shallow and slow enough to wade across", () => {
        let fords = 0;

        for (const k of rivers) {
            const { reach, pieces } = waters.course(k);
            const ford = pieces.findIndex(({ ford }) => ford[1] === 1);

            if (ford < 0) {
                continue;
            }

            assert.equal(reach, REACH.calm);

            const piece = pieces[ford];
            const [x, y] = [piece.bx, piece.by];
            const river = waters.river(x, y, 0);

            if (river?.ford === 1 && river.gap < -1) {
                assert.ok(river.depth <= FORDS.depth + 1e-9 && river.half > piece.half[0] / FORDS.widen);
                assert.ok(wadeable(waterAt(plan, x, y, heightAt(plan, x, y)) - heightAt(plan, x, y), river.speed), "wadeable");
                fords++;
            }
        }

        assert.ok(fords > 30, `${fords} fords`);
    });

    test("never raise their banks up out of the lake or sea they run into", () => {
        let points = 0;

        for (const k of rivers) {
            const next = into(k);

            if (plan.water[next] !== WATER.lake) {
                continue;
            }

            const piece = waters.course(k).pieces.at(-1);

            for (let off = -20; off <= 20; off += 2) {
                const [x, y] = [piece.bx - piece.dy * off, piece.by + piece.dx * off];
                const still = stillOf(plan, x, y);

                if (still && still.wetness > 0.75 && !waters.riverAt(x, y)) {
                    assert.ok(heightAt(plan, x, y) < still.level, `the lake's bed at ${x}, ${y}`);
                    points++;
                }
            }
        }

        assert.ok(points > 20, `${points} points`);
    });

    test("run down from the hills and mountains as streams, narrow and shallow, falling in steps, on into a river, a lake or the sea", () => {
        const { running } = waters;
        let [streams, steps, lips, ends] = [0, 0, 0, 0];

        for (let k = 0; k < CELLS * CELLS; k++) {
            if (running[k] !== RUNNING.stream) {
                continue;
            }

            streams++;
            assert.equal(plan.water[k], WATER.none, "on dry land");

            const next = waters.downstream(k % CELLS, Math.floor(k / CELLS));

            assert.ok(next, "running on");

            const on = next[1] * CELLS + next[0];

            assert.ok(running[on] || plan.water[on] === WATER.lake || plan.water[on] === WATER.sea, "into a stream, a river, a lake or the sea");
            ends += running[on] === RUNNING.stream ? 0 : 1;

            const { reach, pieces } = waters.course(k);

            steps += reach === REACH.steps ? 1 : 0;

            // (Widening a little where they run out into a lake or the sea)
            for (const piece of pieces) {
                assert.ok(piece.stream && piece.surface[1] <= piece.surface[0], "down");
                assert.ok(Math.min(...piece.half) >= STREAMS.half[0] && Math.max(...piece.half) <= STREAMS.half[1] * 1.6, `${piece.half} wide`);
                assert.ok(piece.depth.every((depth) => depth <= 0.5), "shallow");
                assert.deepEqual(piece.ford, [0, 0], "no fords");
                lips += piece.lip >= 1 ? 1 : 0;
            }
        }

        // (Hundreds of cells of them, falling in steps more often than rivers do: over lips a metre
        // high and more)
        assert.ok(streams > 300 && ends > 20 && steps > streams / 10 && lips > 50, `${streams} cells, ${ends} ends, ${steps} in steps, ${lips} lips`);
    });
});
