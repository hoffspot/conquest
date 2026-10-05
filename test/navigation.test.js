import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { AREA, KEEP_TILES, Navigation, navigatorOf, ROOMS, squaresNavigation, TILE, tileOf } from "../client/js/core/navigation.js";
import { bakeTile } from "../client/js/core/navigation/bake.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { tileInput } from "../client/js/core/navigation/tiles.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { WADE } from "../client/js/core/terrain/waters.js";
import { CHUNK } from "../client/js/core/worldplan/plan.js";
import { parseGrid } from "./helpers.js";

// The world of seed 1: its start town, the middle of the river to its south (2 m deep), and the
// road's stone bridge over the river to the town's south-east, up a ramp from each bank (found by
// looking, and checked below)
const DEEP = [2931.5, 5192.5];
const BRIDGE = { a: [2995.6216216216217, 5142.594594594595], b: [3016.4, 5159.3], half: 2.2, stone: true, ramps: [8, 8] };
// (And a ford over a small river 730 m to the town's north-east, and a mountain stream 1.7 km
// to its west, running fast)
const FORD = [3112.5, 4374.5];
const STREAM = [1526.5, 4051.5];

const length = (path) => path.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - path[i][0], y - path[i][1]), 0);
const same = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

describe("navigation meshes (navigation.js)", () => {
    let recast;
    let world;
    let town;
    let middle;

    before(async () => {
        recast = await loadRecast();
        world = buildWorld({ seed: 1 });
        town = world.maps.town;
        middle = world.stamp.middle;
    });

    it("bakes a tile from the ground and what stands on it, the same whichever chunks were made first", () => {
        const [tx, ty] = tileOf(...middle);
        const here = tileInput(town, tx, ty);

        // Another world of the same seed, its chunks made the other way round first
        const other = buildWorld({ seed: 1 }).maps.town;
        const [cx, cy] = [Math.floor(middle[0] / CHUNK), Math.floor(middle[1] / CHUNK)];

        for (let dy = 1; dy >= -1; dy--) {
            for (let dx = 1; dx >= -1; dx--) {
                other.chunk(cx + dx, cy + dy);
            }
        }

        const there = tileInput(other, tx, ty);

        for (const part of ["positions", "indices", "areas"]) {
            assert.ok(same(here[part], there[part]), part);
        }

        const data = bakeTile(recast, here, tx, ty);

        assert.ok(data.length > 1000);
        assert.ok(same(data, bakeTile(recast, there, tx, ty)), "the same bytes");

        // The town's streets are walked as roads, and nothing's on the buildings' tops
        const navigation = new Navigation(recast, town);

        navigation.add(tx, ty, data);

        const { areas, positions } = navigation.polygons(tx, ty);

        assert.ok(areas.includes(AREA.road) && areas.includes(AREA.ground));
        assert.ok(positions.every((value, i) => i % 3 !== 1 || value < town.ground.heightAt(positions[i - 1], positions[i + 1]) + 1), "on the ground, not on a roof");
    });

    it("finds ways round buildings and over bridges, and keeps out of deep water", () => {
        const navigation = new Navigation(recast, town);

        // A building in the town: from one side of it to the other, the way goes round it
        const chunk = town.chunkAt(Math.floor(middle[0]), Math.floor(middle[1]));
        let wall = null;

        for (let y = Math.floor(middle[1]) - 20; y < middle[1] + 20 && !wall; y++) {
            for (let x = Math.floor(middle[0]) - 20; x < middle[0] + 20 && !wall; x++) {
                const solid = (sx, sy) => {
                    const c = town.chunkAt(sx, sy);

                    return c.solid[(sy - c.y0) * CHUNK + (sx - c.x0)] === 1;
                };

                // (Six squares of solid across, with open ground either side)
                if (!solid(x - 2, y) && [0, 1, 2, 3, 4, 5].every((dx) => solid(x + dx, y)) && !solid(x + 8, y) && navigation.walkable(x - 2.5, y + 0.5) && navigation.walkable(x + 8.5, y + 0.5)) {
                    wall = [x, y];
                }
            }
        }

        assert.ok(chunk && wall, "a building to walk round");

        const [from, to] = [[wall[0] - 2.5, wall[1] + 0.5], [wall[0] + 8.5, wall[1] + 0.5]];
        const round = navigation.path(from, to);

        assert.ok(round.length > 2, "round it");
        assert.ok(length(round) > 11 + 0.5, `longer than straight through (${length(round).toFixed(1)} m)`);
        assert.ok(Math.hypot(round.at(-1)[0] - to[0], round.at(-1)[1] - to[1]) < 0.1, "all the way");
        assert.equal(navigation.raycast(from, to).hit, true, "straight at it, it's hit");

        // Deep water isn't walked; the bridge over the river is, straight over
        assert.equal(navigation.walkable(...DEEP), false);

        const { a, b } = BRIDGE;
        const [ux, uy] = [(b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])];
        const across = navigation.path([a[0] - ux * 4, a[1] - uy * 4], [b[0] + ux * 4, b[1] + uy * 4]);

        assert.ok(Math.abs(length(across) - (Math.hypot(b[0] - a[0], b[1] - a[1]) + 8)) < 0.5, `straight over (${length(across).toFixed(1)} m)`);
        assert.ok(Math.abs(across[1][2] - town.deckOf(BRIDGE, 0.5)) < 0.6, "up on the deck");
    });

    it("finds a settlement's ways in from every way out of it, over its streets' bridges, and walks nowhere inside its buildings", () => {
        const navigation = new Navigation(recast, town);
        // (The elves' capital, a main street of its out over a river on a bridge of its own: found
        // by looking)
        const settlement = town.settlements.of(town.settlements.places.find(({ id }) => id === "elf-capital-1"));
        const { at, town: layout } = settlement;
        const market = [at[0] + layout.market.centre[0], at[1] + layout.market.centre[1]];

        assert.ok(settlement.bridges.length > 0, "a bridge of its own");

        for (const [x, y] of layout.exits) {
            const way = navigation.path([at[0] + x, at[1] + y], market);

            assert.ok(Math.hypot(way.at(-1)[0] - market[0], way.at(-1)[1] - market[1]) < 2, `in from ${at[0] + x}, ${at[1] + y}`);
        }

        // The ground inside its buildings (two squares and more in from their walls) isn't walked
        let inside = 0;

        for (let j = 2; j < layout.height - 2; j += 3) {
            for (let i = 2; i < layout.width - 2; i += 3) {
                if ([-2, -1, 0, 1, 2].every((dj) => [-2, -1, 0, 1, 2].every((di) => layout.blocked[j + dj][i + di])) && inside++ < 200) {
                    assert.equal(navigation.walkable(at[0] + i + 0.5, at[1] + j + 0.5), false, `inside at ${at[0] + i}, ${at[1] + j}`);
                }
            }
        }

        assert.ok(inside > 100, `${inside} squares inside`);
        navigation.dispose();
    });

    it("walks the plank walks over a lizard folk's lagoon", () => {
        const navigation = new Navigation(recast, town);
        const settlement = town.settlements.of(town.settlements.places.find(({ id }) => id === "lizard-city-1"));
        const { at, town: layout } = settlement;

        assert.ok(layout.walks.length > 0);

        for (const { a, b } of layout.walks) {
            const [x, y] = [at[0] + (a[0] + b[0]) / 2, at[1] + (a[1] + b[1]) / 2];
            const found = navigation.nearest([x, y]);

            assert.ok(found && Math.hypot(found[0] - x, found[1] - y) < 0.05, `on the walk at ${x.toFixed(1)}, ${y.toFixed(1)}`);
            assert.ok(Math.abs(found[2] - town.ground.heightAt(x, y) - 0.16) < 0.3, "on its planks");
        }

        navigation.dispose();
    });

    it("wades across a ford, straight over, but never into the river's deep water beside it", () => {
        const navigation = new Navigation(recast, town);
        const ford = town.waters.river(...FORD, 0);
        const chunk = town.chunkAt(Math.floor(FORD[0]), Math.floor(FORD[1]));

        assert.equal(ford.ford, 1, "a ford");
        assert.equal(chunk.blocked[(Math.floor(FORD[1]) - chunk.y0) * CHUNK + (Math.floor(FORD[0]) - chunk.x0)], 0, "its squares open");

        // From one bank to the other, across the way the water runs
        const [vx, vy] = town.waters.current(...FORD);
        const [ax, ay] = [-vy / Math.hypot(vx, vy), vx / Math.hypot(vx, vy)];
        const [from, to] = [[FORD[0] - ax * 9, FORD[1] - ay * 9], [FORD[0] + ax * 9, FORD[1] + ay * 9]];
        const across = navigation.path(from, to);

        assert.ok(navigation.walkable(...FORD), "walked");
        assert.ok(Math.hypot(across.at(-1)[0] - to[0], across.at(-1)[1] - to[1]) < 0.5 && length(across) < 18 * 1.2, `straight over (${length(across).toFixed(1)} m)`);

        // (Up or down the river, where it runs deep, it isn't)
        let deep = null;

        for (let r = 20; r < 60 && !deep; r += 2) {
            for (let k = 0; k < 32 && !deep; k++) {
                const [x, y] = [FORD[0] + Math.cos((k / 32) * 2 * Math.PI) * r, FORD[1] + Math.sin((k / 32) * 2 * Math.PI) * r];
                const river = town.waters.river(x, y, 0);

                if (river && river.ford === 0 && river.gap < -river.half * 0.5 && town.surfaceAt(x, y) - town.heightAt(x, y) > 1) {
                    deep = [x, y];
                }
            }
        }

        assert.ok(deep && !navigation.walkable(...deep), `not beside it (${deep})`);
    });

    it("steps across a mountain stream, however fast it runs", () => {
        const navigation = new Navigation(recast, town);
        const stream = town.waters.river(...STREAM, 0);
        const chunk = town.chunkAt(Math.floor(STREAM[0]), Math.floor(STREAM[1]));
        const square = (Math.floor(STREAM[1]) - chunk.y0) * CHUNK + (Math.floor(STREAM[0]) - chunk.x0);

        assert.ok(stream.stream && stream.gap <= 0, "a stream");
        assert.ok(stream.depth * stream.speed > WADE.sweep, "too fast to wade, were it a river");
        assert.ok(chunk.water[square] && !chunk.blocked[square], "its squares open");

        const [vx, vy] = town.waters.current(...STREAM);
        const [ax, ay] = [-vy / Math.hypot(vx, vy), vx / Math.hypot(vx, vy)];
        const [from, to] = [[STREAM[0] - ax * 6, STREAM[1] - ay * 6], [STREAM[0] + ax * 6, STREAM[1] + ay * 6]];
        const across = navigation.path(from, to);

        assert.ok(Math.hypot(across.at(-1)[0] - to[0], across.at(-1)[1] - to[1]) < 0.5 && length(across) < 12 * 1.1, `straight over (${length(across).toFixed(1)} m)`);
    });

    it("climbs ground as steep as 37 degrees, dearer from 30, but not a cliff", () => {
        // (A world of one slope rising along x, nothing on it: Recast's ledge filter takes a
        // climb's height to be the most the ground can rise from one voxel to the next but one, so
        // with a climb of half a metre ground steeper than 27 degrees was never walked at all)
        const chunk = { x0: 0, y0: 0, ground: new Uint8Array(CHUNK * CHUNK), water: new Uint8Array(CHUNK * CHUNK), solid: new Uint8Array(CHUNK * CHUNK), trees: [] };
        const slope = (degrees) => {
            const rise = Math.tan((degrees * Math.PI) / 180);

            return { ground: { heightAt: (x) => rise * x }, heightAt: (x) => rise * x, chunkAt: (x, y) => ({ ...chunk, x0: Math.floor(x / CHUNK) * CHUNK, y0: Math.floor(y / CHUNK) * CHUNK }), chunk: () => chunk, bridgesNear: () => [] };
        };
        const [tx, ty] = [4, 4];
        const [from, to] = [[tx * TILE + 6, ty * TILE + 16], [tx * TILE + 26, ty * TILE + 16]];

        for (const [degrees, area] of [[24, AREA.ground], [35, AREA.steep]]) {
            const navigation = new Navigation(recast, slope(degrees));
            const end = navigation.path(from, to)?.at(-1);

            assert.ok(end && Math.hypot(end[0] - to[0], end[1] - to[1]) < 0.5, `up ${degrees} degrees`);
            assert.ok(navigation.polygons(tx, ty).areas.every((each) => each === area), `${degrees} degrees`);
        }

        assert.equal(bakeTile(recast, tileInput(slope(41), tx, ty), tx, ty), null, "a cliff");
    });

    it("walks the trails up the mountainsides from end to end", () => {
        // (Three of seed 1's that couldn't be walked all the way before their stone steps: their
        // ways cut ever deeper into the mountains below their sites, too narrow at the foot of the
        // cutting to stand in, or too steep; walked forty metres at a time, as far as a way's found)
        const navigation = new Navigation(recast, town);

        for (const id of ["trail ruins-32", "trail cave-79", "trail ruins-45"]) {
            const points = town.trails.find(town.trails.all.find((trail) => trail.id === id));
            const stops = [points[0]];
            let walked = 0;

            for (let k = 1; k < points.length; k++) {
                const [[ax, ay], [bx, by]] = [points[k - 1], points[k]];
                const run = Math.hypot(bx - ax, by - ay);

                for (let d = 0; d < run; d += 1) {
                    if (++walked % 40 === 0) {
                        stops.push([ax + ((bx - ax) * d) / run, ay + ((by - ay) * d) / run]);
                    }
                }
            }

            stops.push(points.at(-1));

            for (let k = 1; k < stops.length; k++) {
                const path = navigation.path(stops[k - 1], stops[k]);
                const end = path?.at(-1);

                assert.ok(end && Math.hypot(end[0] - stops[k][0], end[1] - stops[k][1]) < 1.5, `${id} to ${stops[k].map(Math.round)}`);
                assert.ok(length(path) < 120, `${id} to ${stops[k].map(Math.round)}: ${length(path).toFixed(0)} m`);
            }
        }
    });

    it("finds the same ways whichever order its tiles came in", () => {
        const [tx, ty] = tileOf(...middle);
        const tiles = [];

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                tiles.push([tx + dx, ty + dy, bakeTile(recast, tileInput(town, tx + dx, ty + dy), tx + dx, ty + dy)]);
            }
        }

        const forwards = new Navigation(recast, town);
        const backwards = new Navigation(recast, town);

        tiles.forEach(([x, y, data]) => forwards.add(x, y, data));
        tiles.toReversed().forEach(([x, y, data]) => backwards.add(x, y, data));

        for (let k = 0; k < 20; k++) {
            const from = [middle[0] - 30 + ((k * 37) % 60), middle[1] - 30 + ((k * 53) % 60)];
            const to = [middle[0] - 30 + ((k * 71) % 60), middle[1] - 30 + ((k * 29) % 60)];

            assert.deepEqual(forwards.path(from, to), backwards.path(from, to), `way ${k}`);
        }
    });

    it("bakes and finds ways within its budgets", () => {
        const navigation = new Navigation(recast, town);
        const [tx, ty] = tileOf(...middle);
        const bakes = [];

        // (The chunks made already: the tiles' own work only)
        for (let dx = -2; dx <= 2; dx++) {
            const input = tileInput(town, tx + dx, ty + 1);
            const start = performance.now();

            navigation.add(tx + dx, ty + 1, bakeTile(recast, input, tx + dx, ty + 1));
            bakes.push(performance.now() - start);
        }

        // (Every tile a way below could ask for baked first: the ways' own work only)
        navigation.around(...middle, 40 + TILE * 1.5);

        const times = [];

        for (let k = 0; k < 100; k++) {
            const from = [middle[0] - 40 + ((k * 37) % 80), middle[1] - 40 + ((k * 53) % 80)];
            const to = [middle[0] - 40 + ((k * 71) % 80), middle[1] - 40 + ((k * 29) % 80)];
            const start = performance.now();
            const path = navigation.path(from, to);

            if (path.length && Math.hypot(path.at(-1)[0] - to[0], path.at(-1)[1] - to[1]) < 1) {
                times.push(performance.now() - start);
            }
        }

        bakes.sort((p, q) => p - q);
        times.sort((p, q) => p - q);

        // (Generous for slow machines: about 4.5 ms a tile and 0.12 ms a way at the 95th centile here)
        assert.ok(bakes[2] < 25, `a tile in ${bakes[2].toFixed(1)} ms`);
        assert.ok(times.length > 50 && times[Math.floor(times.length * 0.95)] < 2, `a way in ${times[Math.floor(times.length * 0.95)]?.toFixed(2)} ms`);
    });

    it("gives a map of squares a mesh of its own: through a doorway a square wide, a body's width from walls", () => {
        // Two rooms, a wall between them with a doorway a square wide, and a table in one
        const rows = parseGrid([
            "##########",
            "#........#",
            "#..##....#",
            "#..##....#",
            "#........#",
            "####.#####",
            "#........#",
            "#........#",
            "##########",
        ]);
        const map = { blocked: rows };
        const navigation = navigatorOf(map);

        assert.equal(navigation.measures, ROOMS);
        assert.equal(navigatorOf(map), navigation, "kept for the map");

        const way = navigation.path([2.5, 2.5], [7.5, 7.5]);
        const end = way.at(-1);

        assert.ok(end && Math.hypot(end[0] - 7.5, end[1] - 7.5) < 0.01, "all the way, through the doorway");
        assert.ok(way.some(([x, y]) => x > 4 && x < 5 && y > 4.5 && y < 6.5), "by the doorway");

        // Every half metre of the way at least the walkers' radius from every blocked square
        const clearance = (x, y) => Math.min(...rows.flatMap((row, sy) => row.map((blocked, sx) => (blocked ? Math.hypot(x - Math.min(Math.max(x, sx), sx + 1), y - Math.min(Math.max(y, sy), sy + 1)) : Infinity))));

        for (let i = 1; i < way.length; i++) {
            for (let t = 0; t <= 1; t += 0.05) {
                const [x, y] = [way[i - 1][0] + (way[i][0] - way[i - 1][0]) * t, way[i - 1][1] + (way[i][1] - way[i - 1][1]) * t];

                assert.ok(clearance(x, y) >= ROOMS.radius - 0.05, `${x.toFixed(2)}, ${y.toFixed(2)} is ${clearance(x, y).toFixed(2)} m from a wall`);
            }
        }

        // The same squares, the same mesh, the same way
        assert.deepEqual(squaresNavigation({ blocked: rows.map((row) => [...row]) }).path([2.5, 2.5], [7.5, 7.5]), way);
        assert.equal(navigation.walkable(3.5, 2.5), false, "not on the table");
    });

    it("lets go of the tiles longest unused", () => {
        const navigation = new Navigation(recast, town);

        for (let k = 0; k <= KEEP_TILES; k++) {
            navigation.add(k % 200, Math.floor(k / 200), null);
        }

        assert.equal(navigation.tiles.size, KEEP_TILES);
        assert.equal(navigation.has(0, 0), false);
        assert.equal(navigation.has(1, 0), true);
    });
});
