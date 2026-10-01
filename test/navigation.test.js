import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { AREA, KEEP_TILES, Navigation, TILE, tileOf } from "../client/js/core/navigation.js";
import { bakeTile } from "../client/js/core/navigation/bake.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { tileInput } from "../client/js/core/navigation/tiles.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CHUNK } from "../client/js/core/worldplan/plan.js";

// The world of seed 1: its start town, a lake's deep water near it, and the road's bridge over the
// river to the town's south-east (found by looking, and checked below)
const DEEP = [2967.5, 5161.5];
const BRIDGE = { a: [3001.0675675675675, 5146.108108108108], b: [3011.304347826087, 5155.304347826087], half: 2.2 };

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

        navigation.around(...middle, TILE * 1.5);

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
