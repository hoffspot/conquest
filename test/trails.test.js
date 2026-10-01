// Roads kept to their grade, and the trails up into the hills (client/js/core/terrain/ways.js,
// ground.js graded, core/trails.js): found their own way over the land at a walker's grade, laid
// into the world the same whichever chunks are made first, and walked from end to end
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildWorld, CHUNK } from "../client/js/core/overworld.js";
import { CELL } from "../client/js/core/worldplan/plan.js";
import { GRADE, graded } from "../client/js/core/terrain/ground.js";
import { landHeight, stillWaterAt } from "../client/js/core/terrain/height.js";
import { rounded, wayOver } from "../client/js/core/terrain/ways.js";

const length = (points) => points.slice(1).reduce((sum, [x, y], k) => sum + Math.hypot(x - points[k][0], y - points[k][1]), 0);

// Every metre along a way ([x, y] points)
function* along(points) {
    for (let k = 1; k < points.length; k++) {
        const [[ax, ay], [bx, by]] = [points[k - 1], points[k]];
        const run = Math.hypot(bx - ax, by - ay);

        for (let d = 0; d < run; d += 1) {
            yield [ax + ((bx - ax) * d) / run, ay + ((by - ay) * d) / run];
        }
    }
}

describe("roads and trails on the land (terrain/ways.js, core/trails.js)", () => {
    let world;
    let overworld;
    // (A trail up to a cave in the hills south-west of the start town, branching from the trail to
    // another cave below it)
    let trail;

    before(() => {
        world = buildWorld({ seed: 1 });
        overworld = world.maps.town;
        trail = overworld.trails.all.find(({ id }) => id === "trail cave-79");
    });

    it("keeps a road's heights to its grade, cutting into the land as much as it builds up over it", () => {
        const heights = [0, 0, 0, 5, 10, 10, 10, 3, 0, 0];
        const kept = graded(heights, 1);

        kept.slice(1).forEach((h, k) => assert.ok(Math.abs(h - kept[k]) <= 1 + 1e-9, `${kept}`));
        // (As much cut as filled, where it had to be changed)
        const changed = heights.map((h, k) => kept[k] - h);

        assert.ok(Math.abs(changed.reduce((a, b) => a + b, 0)) < 3, `${changed}`);
        // (Left alone where it was gentle enough)
        assert.deepEqual(graded([0, 0.5, 1, 1.5], 1), [0, 0.5, 1, 1.5]);
    });

    it("finds a way up a steep slope in hairpins, keeping to a walker's grade, out of the water", () => {
        assert.ok(trail, "a trail up to the cave");

        const points = overworld.trails.find(trail);
        const [from, to] = [trail.from, trail.to];
        const climb = Math.abs(landHeight(overworld.plan, ...to) - landHeight(overworld.plan, ...from));
        const straight = Math.hypot(to[0] - from[0], to[1] - from[1]);

        assert.ok(points && points.length > 10, "found");
        assert.deepEqual(points[0], from);
        assert.deepEqual(points.at(-1), to);
        assert.ok(climb > 100, `climbing ${climb.toFixed(0)} m`);
        // (Longer than the straight way, climbing not much faster than its grade on the whole: a
        // step steeper than it is dear, not forbidden)
        assert.ok(length(points) > straight * 1.3, `${length(points).toFixed(0)} m against ${straight.toFixed(0)}`);
        assert.ok(climb / length(points) <= GRADE.path * 1.3, `${(climb / length(points)).toFixed(2)} on average`);

        // (Turning back on itself: hairpins)
        let hairpins = 0;

        for (let k = 2; k < points.length; k++) {
            const [ax, ay] = [points[k - 1][0] - points[k - 2][0], points[k - 1][1] - points[k - 2][1]];
            const [bx, by] = [points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]];

            hairpins += (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1) < -0.2 ? 1 : 0;
        }

        assert.ok(hairpins > 0, "turning back on itself");

        for (const [x, y] of along(points)) {
            assert.ok(x >= trail.box[0] && y >= trail.box[1] && x <= trail.box[2] && y <= trail.box[3], "within its room");
            assert.equal(stillWaterAt(overworld.plan, x, y, landHeight(overworld.plan, x, y)), null, "never into a lake or the sea");
        }
    });

    it("takes a road too steep to grade up in hairpins, and two roads sharing the slope, one up and one down, share them", () => {
        // (Seed 2's tracks up from the coast north-east of its start town: one runs up the
        // slope, the other down it)
        const other = buildWorld({ seed: 2 }).maps.town;
        const lines = new Map([...other.roads.values()].flat().map((segment) => [segment[5].id, segment[5]]));
        // (The stretch found its own way: from the first of its points much closer together than
        // the plan's cells' to the last)
        const climb = ({ planned }) => {
            const close = planned.map((point, k) => (k > 0 && Math.hypot(point[0] - planned[k - 1][0], point[1] - planned[k - 1][1]) < CELL / 6 ? k : 0)).filter((k) => k > 0);

            return planned.slice(close[0] - 1, close.at(-1) + 1);
        };
        const [up, down] = [climb(lines.get("road 0040")), climb(lines.get("road 0148"))];

        assert.ok(up.length > 20, `${up.length} points`);
        assert.deepEqual([...down].reverse(), up);
    });

    it("rounds a way's turns, keeping its ends", () => {
        const way = rounded([[0, 0], [10, 0], [10, 10]]);

        assert.deepEqual(way[0], [0, 0]);
        assert.deepEqual(way.at(-1), [10, 10]);
        assert.ok(way.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 10));
        assert.ok(!way.some(([x, y]) => x === 10 && y === 0), "the corner cut");
    });

    it("finds the same way wherever it's found", () => {
        const again = wayOver(overworld.plan, trail.from, trail.to, { grade: GRADE.path, box: trail.box, avoid: (x, y) => overworld.trails.keepOut.some(([x0, y0, x1, y1]) => x >= x0 && y >= y0 && x < x1 && y < y1) });

        assert.deepEqual(rounded(again), overworld.trails.find(trail));
    });

    it("lays a trail into the world the same whichever of its chunks are made first, and it can be walked from end to end", () => {
        const points = overworld.trails.find(trail);
        const chunks = [...new Set(points.map(([x, y]) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`))].map((key) => key.split(",").map(Number));
        const other = buildWorld({ seed: 1 }).maps.town;

        // (This world's from the road up; the other's from the cave down)
        for (const [cx, cy] of chunks) {
            overworld.chunk(cx, cy);
        }

        for (const [cx, cy] of [...chunks].reverse()) {
            other.chunk(cx, cy);
        }

        for (const [cx, cy] of chunks) {
            const [a, b] = [overworld.chunk(cx, cy), other.chunk(cx, cy)];

            for (const layer of ["ground", "blocked", "water", "bridge"]) {
                assert.ok(a[layer].every((value, k) => value === b[layer][k]), `${layer} in ${cx}, ${cy}`);
            }

            assert.ok(overworld.ground.chunk(cx, cy).heights.every((h, k) => h === other.ground.chunk(cx, cy).heights[k]), `heights in ${cx}, ${cy}`);
        }

        // (Every square along it walkable, and its ground a path's: what's beside it may be cut
        // too steep to climb)
        let [squares, steepest, last] = [0, 0, null];

        for (const [x, y] of along(points)) {
            const chunk = overworld.chunkAt(Math.floor(x), Math.floor(y));
            const k = (Math.floor(y) - chunk.y0) * CHUNK + (Math.floor(x) - chunk.x0);

            if (overworld.settled(Math.floor(x), Math.floor(y))) {
                continue;
            }

            assert.equal(chunk.blocked[k], 0, `walkable at ${Math.floor(x)}, ${Math.floor(y)}`);

            if (!chunk.bridge[k]) {
                const h = overworld.heightAt(x, y);

                if (last && Math.hypot(x - last[0], y - last[1]) >= 2) {
                    steepest = Math.max(steepest, Math.abs(h - last[2]) / Math.hypot(x - last[0], y - last[1]));
                    last = [x, y, h];
                } else if (!last) {
                    last = [x, y, h];
                }
            } else {
                last = null;
            }

            squares++;
        }

        // (Its own grade along it, cut and built to; steeper only for a step or two where a
        // hairpin's legs come together: 45 in 100 at the very worst, two metres at a time)
        assert.ok(squares > 300, `${squares} squares`);
        assert.ok(steepest <= 0.45, `steepest ${steepest.toFixed(2)}`);
    });
});
