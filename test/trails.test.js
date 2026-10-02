// Roads kept to their grade, and the trails up into the hills (client/js/core/terrain/ways.js,
// ground.js graded, core/trails.js): found their own way over the land at a walker's grade, in
// stone steps where it's too steep for a path (art/kits/steps.js draws them), laid into the world
// the same whichever chunks are made first, and walked from end to end
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildWorld, CHUNK } from "../client/js/core/overworld.js";
import { CELL } from "../client/js/core/worldplan/plan.js";
import { GRADE, graded, ROAD, STAIRS, stairsOf, stepsOf } from "../client/js/core/terrain/ground.js";
import { landHeight, stillWaterAt } from "../client/js/core/terrain/height.js";
import { rounded, wayOver } from "../client/js/core/terrain/ways.js";
import { routeTrail, TRAILS } from "../client/js/core/trails.js";
import { atlasMaterial, LAYERS } from "../client/js/world/art/engine/atlas.js";
import { STEP_STONE, stepsMesh, stonesOf } from "../client/js/world/art/kits/steps.js";

// (The atlas's material paints a canvas: enough of one for it to in Node, every other drawing
// call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

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

    it("climbs in stone steps where its land's too steep for a path, and nowhere else, cut far less into it", () => {
        // (A path's land every ROAD.step metres: level, then up a mountainside rising 0.6 a metre,
        // then level again)
        const climb = 0.6 * ROAD.step;
        const land = [...Array(20).fill(0), ...Array.from({ length: 30 }, (_, k) => (k + 1) * climb), ...Array(20).fill(30 * climb)];
        const most = stairsOf(land);

        assert.equal(most.length, land.length - 1);
        assert.equal(most[0], GRADE.path * ROAD.step);
        assert.equal(most[35], GRADE.steps * ROAD.step);
        assert.equal(most.at(-1), GRADE.path * ROAD.step);

        const kept = graded(land, most, { pinned: true });

        kept.slice(1).forEach((h, k) => assert.ok(Math.abs(h - kept[k]) <= most[k] + 1e-9, `${k}`));

        // (Its steps only up the mountainside, and a little either side where it eases in)
        const reach = STAIRS.reach;
        const runs = stepsOf(kept, GRADE.path * ROAD.step);

        assert.ok(runs.length > 0);

        for (const [from, to] of runs) {
            assert.ok(from >= 20 * ROAD.step - reach && to <= 50 * ROAD.step + reach, `steps from ${from} to ${to} m`);
        }

        // (Kept to a path's grade all the way, it would be cut much deeper into the mountainside)
        const cut = (heights) => Math.max(...land.map((h, k) => h - heights[k]));

        assert.ok(cut(kept) < cut(graded(land, GRADE.path * ROAD.step, { pinned: true })) / 2, `${cut(kept).toFixed(1)} m`);
    });

    it("finds a way never climbing faster than it's let between the points it turns at", () => {
        // (Its ends aside: they're where it's going from and to, not on the points it looks at)
        const { from, to, box } = trail;
        const steps = { grade: GRADE.steps, steep: STAIRS.rising, cost: STAIRS.cost };
        const way = wayOver(overworld.plan, from, to, { grade: GRADE.path, box, steps, hard: GRADE.steps });

        assert.ok(way && way.length > 10, "found");

        for (let k = 2; k < way.length - 1; k++) {
            const run = Math.hypot(way[k][0] - way[k - 1][0], way[k][1] - way[k - 1][1]);
            const rise = Math.abs(landHeight(overworld.plan, ...way[k]) - landHeight(overworld.plan, ...way[k - 1]));

            assert.ok(rise / run <= GRADE.steps + 1e-9, `${(rise / run).toFixed(3)} from ${way[k - 1]} to ${way[k]}`);
        }

        // (And without its steps, nor turning back on itself, it'd go no further than it's let: none
        // the steeper, but none found up this mountainside so soon)
        assert.equal(wayOver(overworld.plan, from, to, { grade: GRADE.path, box, hard: GRADE.path }), null);
    });

    it("rounds a way's turns, keeping its ends", () => {
        const way = rounded([[0, 0], [10, 0], [10, 10]]);

        assert.deepEqual(way[0], [0, 0]);
        assert.deepEqual(way.at(-1), [10, 10]);
        assert.ok(way.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 10));
        assert.ok(!way.some(([x, y]) => x === 10 && y === 0), "the corner cut");
    });

    it("finds the same way wherever it's found", () => {
        // (As the terrain worker's given it: terrains.js)
        const { from, to, box, avoid } = structuredClone(trail);
        const again = routeTrail(overworld.plan, { from, to, box, avoid }, overworld.trails.keepOut);

        assert.deepEqual(again, overworld.trails.find(trail));
        assert.ok(avoid.length > 0, "going round the sites near it");
    });

    it("eases the ground between ways that meet (a hairpin's two legs side by side) with no step, and a number everywhere", () => {
        const points = overworld.trails.find(trail);
        // (Its tightest turn: where one leg comes nearest another, further along it)
        let turn = null;

        points.forEach(([x, y], k) => {
            points.slice(k + 6).forEach(([qx, qy]) => {
                const gap = Math.hypot(qx - x, qy - y);

                if (!turn || gap < turn.gap) {
                    turn = { at: [x, y], gap };
                }
            });
        });

        assert.ok(turn.gap < 4, `legs ${turn.gap.toFixed(1)} m apart`);

        let steepest = 0;

        for (let j = -16; j <= 16; j++) {
            for (let i = -16; i <= 16; i++) {
                const [x, y] = [turn.at[0] + i * 0.25, turn.at[1] + j * 0.25];
                const [h, east, south] = [overworld.heightAt(x, y), overworld.heightAt(x + 0.25, y), overworld.heightAt(x, y + 0.25)];

                assert.ok(Number.isFinite(h), `${x}, ${y}`);
                steepest = Math.max(steepest, Math.abs(east - h) / 0.25, Math.abs(south - h) / 0.25);
            }
        }

        // (Between legs a metre or two apart and as much apart in height, the ground climbs as
        // steeply as that needs, but never in a step: where the nearer way's height was taken
        // alone, it stepped as much as 10 in 1 between a hairpin's legs)
        assert.ok(steepest < 3.2, `steepest ${steepest.toFixed(2)} between the legs`);
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
        // (Its grade over the way walked, two metres at a time: round a hairpin's turn, further
        // than straight across it)
        let [squares, steepest, last, walked, previous] = [0, 0, null, 0, null];

        for (const [x, y] of along(points)) {
            const chunk = overworld.chunkAt(Math.floor(x), Math.floor(y));
            const k = (Math.floor(y) - chunk.y0) * CHUNK + (Math.floor(x) - chunk.x0);

            walked += previous ? Math.hypot(x - previous[0], y - previous[1]) : 0;
            previous = [x, y];

            if (overworld.settled(Math.floor(x), Math.floor(y))) {
                continue;
            }

            assert.equal(chunk.blocked[k], 0, `walkable at ${Math.floor(x)}, ${Math.floor(y)}`);

            if (!chunk.bridge[k]) {
                const h = overworld.heightAt(x, y);

                if (last && walked - last[1] >= 2) {
                    steepest = Math.max(steepest, Math.abs(h - last[0]) / (walked - last[1]));
                    last = [h, walked];
                } else if (!last) {
                    last = [h, walked];
                }
            } else {
                last = null;
            }

            squares++;
        }

        // (Its own grade along it, cut and built to; steeper only for a step or two where a
        // hairpin's legs come together: half as steep as it's long at the very worst, two metres
        // at a time; its way's ended past the floor dug in front of its cave since M7a, which
        // turns it differently near the top)
        assert.ok(squares > 300, `${squares} squares`);
        assert.ok(steepest <= 0.5, `steepest ${steepest.toFixed(3)}`);
    });
});

describe("the trails up the mountainsides, and their stone steps (core/trails.js, art/kits/steps.js)", () => {
    let world;
    let overworld;

    before(() => {
        world = buildWorld({ seed: 1 });
        overworld = world.maps.town;
    });

    // Every metre along a trail, with how deep it's cut into the land's own lie there (metres)
    const cuts = (points) => {
        const each = [];

        for (const [x, y] of along(points)) {
            overworld.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
            each.push({ x, y, cut: landHeight(overworld.plan, x, y) - overworld.heightAt(x, y) });
        }

        return each;
    };

    it("cuts no trail deep into a mountainside below its site: they go round, and up in steps", () => {
        // (Kept to a path's grade on ways too short for their climb, four of seed 1's trails were cut
        // 28 to 50 metres deep into the mountains below their sites; now none's more than the floor
        // dug in front of a cave in a hillside, 9 metres at most)
        let [deepest, trails] = [0, 0];

        for (const trail of overworld.trails.all) {
            const points = overworld.trails.find(trail);

            if (points) {
                trails++;
                deepest = Math.max(deepest, ...cuts(points).map(({ cut }) => cut));
            }
        }

        assert.ok(trails >= 20, `${trails} trails`);
        assert.ok(deepest < 10, `cut ${deepest.toFixed(1)} m deep`);
    });

    it("lays a stone step across the path for every rise of its steps, its tread over the path, set into the ground", () => {
        const trail = overworld.trails.all.find(({ id }) => id === "trail cave-79");
        const points = overworld.trails.find(trail);
        const chunks = [...new Set(points.map(([x, y]) => `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`))].map((key) => key.split(",").map(Number));
        const groundAt = (x, y) => overworld.heightAt(x, y);
        const profileOf = (line) => overworld.ground.profileOf(line);

        for (const [cx, cy] of chunks) {
            overworld.chunk(cx, cy);
        }

        const line = overworld.pathsNear(...chunks[0]).find(({ id }) => id === trail.id);
        const { heights, steps } = profileOf(line);
        const own = stonesOf([line], profileOf, groundAt, [0, 0, Infinity, Infinity]);

        assert.ok(steps.length > 0, "it climbs in steps");
        // (Each chunk lays those whose middles are in it, so none twice and none missed)
        assert.equal(chunks.reduce((sum, [cx, cy]) => sum + stonesOf([line], profileOf, groundAt, [cx * CHUNK, cy * CHUNK, (cx + 1) * CHUNK, (cy + 1) * CHUNK]).length, 0), own.length);
        // (One for each rise of its steps' climb, give or take where their treads are kept long or short)
        const climb = steps.reduce((sum, [from, to]) => sum + Math.abs(heights[to / ROAD.step] - heights[from / ROAD.step]), 0);

        assert.ok(own.length > (climb / STAIRS.rise) * 0.6 && own.length < (climb / STAIRS.rise) * 1.6, `${own.length} stones climbing ${climb.toFixed(1)} m`);

        for (const { x, y, along, deep, half, top, bottom } of own) {
            assert.ok(Math.abs(Math.hypot(...along) - 1) < 1e-9);
            assert.ok(deep > 0 && half > TRAILS.half);
            // (Its tread over the path at its back, so none of the path shows through it; its foot
            // in the ground under its front)
            for (const across of [-1, 0, 1]) {
                const v = TRAILS.half * across;

                assert.ok(top >= groundAt(x + along[0] * (deep / 2) - along[1] * v, y + along[1] * (deep / 2) + along[0] * v), `tread at ${x}, ${y}`);
            }

            assert.ok(bottom < groundAt(x - along[0] * (deep / 2), y - along[1] * (deep / 2)), `foot at ${x}, ${y}`);
        }

        // (Drawn as one mesh with the atlas, of the old stones, casting shadows: a tread, a riser and
        // two sides a stone, two triangles each)
        const mesh = stepsMesh(own, (x, y) => overworld.biomeAt(x, y), [0, 0]);
        const layers = new Set(mesh.geometry.attributes.layer.array);
        const old = Object.values(STEP_STONE).map((name) => LAYERS.indexOf(name));

        assert.equal(mesh.material, atlasMaterial());
        assert.ok(mesh.castShadow);
        assert.ok([...layers].every((layer) => old.includes(layer)), `layers ${[...layers]}`);
        assert.ok(mesh.geometry.attributes.position.count >= own.length * 24 && mesh.geometry.attributes.position.count <= own.length * 48);
        assert.equal(stepsMesh([], () => "meadow", [0, 0]), null);
    });
});

