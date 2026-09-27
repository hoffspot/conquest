// The world outside (client/js/core/overworld.js): all 8 km of it on 1-metre squares, made a
// chunk at a time from the world plan, with the town set in where the player starts
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { squaresOf } from "../client/js/core/grid.js";
import { buildWorld, CHUNK, CHUNKS, FLORA, Overworld, WET, WORLD_SIZE } from "../client/js/core/overworld.js";
import { findPath } from "../client/js/core/pathfinding.js";
import { GROUND, TREE_KINDS } from "../client/js/core/setpieces/pieces.js";
import { BIOMES, CELL, CELLS } from "../client/js/core/worldplan/plan.js";

let world;
let overworld;
let around;

// The chunks `reach` chunks or less round the town's
function chunksRound(reach) {
    const [cx, cy] = [Math.floor(world.stamp.at[0] / CHUNK), Math.floor(world.stamp.at[1] / CHUNK)];
    const chunks = [];

    for (let y = cy - reach; y <= cy + reach; y++) {
        for (let x = cx - reach; x <= cx + reach; x++) {
            chunks.push(overworld.chunk(x, y));
        }
    }

    return chunks;
}

// Every square of some chunks: { x, y, k (its index in its chunk), chunk }
function* squaresIn(chunks) {
    for (const chunk of chunks) {
        for (let k = 0; k < CHUNK * CHUNK; k++) {
            yield { x: chunk.x0 + (k % CHUNK), y: chunk.y0 + Math.floor(k / CHUNK), k, chunk };
        }
    }
}

describe("the world outside (overworld.js)", () => {
    before(() => {
        world = buildWorld({ seed: 1 });
        overworld = world.maps.town;
        around = chunksRound(6);
    });

    it("is the whole world, read as any map is, blocked off its edges", () => {
        const squares = squaresOf(overworld);

        assert.ok(overworld instanceof Overworld);
        assert.equal(squares.width, WORLD_SIZE);
        assert.equal(squares.height, WORLD_SIZE);
        assert.equal(CHUNKS * CHUNK, WORLD_SIZE);

        for (const [x, y] of [[-1, 0], [0, -1], [WORLD_SIZE, 10], [10, WORLD_SIZE]]) {
            assert.ok(squares.blocked(x, y) && squares.opaque(x, y), `${x}, ${y}`);
        }
    });

    it("makes the same chunks every time, however they're come to", () => {
        const again = new Overworld({ plan: world.plan, stamp: world.stamp, start: world.start });

        // (In another order, one of them made from scratch after the first was let go)
        for (const chunk of [...around].reverse().slice(0, 12)) {
            const other = again.chunk(chunk.cx, chunk.cy);

            for (const layer of ["blocked", "opaque", "ground", "water", "bridge"]) {
                assert.deepEqual(other[layer], chunk[layer], `${chunk.cx}, ${chunk.cy}: ${layer}`);
            }

            assert.deepEqual(other.trees, chunk.trees);
        }

        again.chunks.clear();
        again.last = null;
        assert.deepEqual(again.chunk(around[0].cx, around[0].cy).trees, around[0].trees);
    });

    it("sets the town in where the player's people start, just as it was made", () => {
        const { stamp, home, start } = world;
        const squares = squaresOf(overworld);

        assert.equal(start.race, "human");
        assert.ok(Math.hypot(stamp.at[0] + stamp.width / 2 - start.at[0], stamp.at[1] + stamp.height / 2 - start.at[1]) < 2);

        for (let y = 0; y < stamp.height; y++) {
            for (let x = 0; x < stamp.width; x++) {
                const [wx, wy] = [stamp.at[0] + x, stamp.at[1] + y];

                assert.equal(squares.blocked(wx, wy), Boolean(home.blocked[y][x]));
                assert.equal(squares.opaque(wx, wy), Boolean(home.opaque[y][x]));
                assert.equal(squares.ground(wx, wy), home.ground[y][x]);
            }
        }

        // Everything in it moved with it
        assert.deepEqual(world.spawns.player, [home.spawns.player[0] + stamp.at[0], home.spawns.player[1] + stamp.at[1]]);
        assert.deepEqual(world.origin, [home.origin + stamp.at[0], home.origin + stamp.at[1]]);
        assert.equal(world.tavern.door.x, home.tavern.door.x + stamp.at[0]);

        const free = [world.spawns.player, world.spawns.orc, ...world.patrol, world.tavern.outside, ...world.links.flatMap(({ ends }) => ends.filter((end) => end.map === "town").map(({ arrive }) => arrive))];

        for (const [x, y] of free) {
            assert.ok(!squares.blocked(x, y), `${x}, ${y}`);
        }
    });

    it("carries the town's streets on as roads, and the roads over rivers on bridges", () => {
        const { stamp } = world;
        const squares = squaresOf(overworld);
        let leaving = 0;
        let bridges = 0;

        // Roads outside the town, just past the edges of its streets
        for (let y = stamp.at[1] - 1; y <= stamp.at[1] + stamp.height; y++) {
            for (let x = stamp.at[0] - 1; x <= stamp.at[0] + stamp.width; x++) {
                if (!overworld.inTown(x, y) && squares.ground(x, y) === GROUND.road) {
                    leaving++;
                }
            }
        }

        assert.ok(leaving >= 3, `${leaving} squares of road round the town`);

        for (const { k, chunk } of squaresIn(around)) {
            if (chunk.bridge[k]) {
                bridges += chunk.water[k] === WET.river ? 1 : 0;
                assert.equal(chunk.blocked[k], 0, "bridges can be walked over");
                assert.equal(chunk.ground[k], GROUND.planks);
            } else if (chunk.water[k]) {
                assert.equal(chunk.blocked[k], 1, "water can't be walked into");
                assert.equal(chunk.opaque[k], 0, "but can be seen over");
            }
        }

        assert.ok(bridges > 0, "a road crosses a river near the town");

        // Each bridge a straight deck from dry land to dry land, walked over from end to end,
        // drawn in one chunk (its middle's)
        const decks = around.flatMap((chunk) => chunk.bridges.map((bridge) => ({ ...bridge, chunk })));

        assert.ok(decks.length > 0);

        for (const { a, b, half, chunk } of decks) {
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const wet = (x, y) => overworld.chunkAt(x, y).water[(y - overworld.chunkAt(x, y).y0) * CHUNK + (x - overworld.chunkAt(x, y).x0)];

            assert.ok(length > 4 && length < 40 && half > 1 && half < 3, `${length} by ${half * 2}`);
            assert.equal(wet(Math.floor(a[0]), Math.floor(a[1])), WET.none, "from dry land");
            assert.equal(wet(Math.floor(b[0]), Math.floor(b[1])), WET.none, "to dry land");
            assert.deepEqual([chunk.cx, chunk.cy], [Math.floor((a[0] + b[0]) / 2 / CHUNK), Math.floor((a[1] + b[1]) / 2 / CHUNK)]);

            for (let t = 0; t <= length; t += 0.25) {
                const [x, y] = [Math.floor(a[0] + ((b[0] - a[0]) * t) / length), Math.floor(a[1] + ((b[1] - a[1]) * t) / length)];

                assert.ok(!squares.blocked(x, y), `over the bridge at ${x}, ${y}`);
            }
        }
    });

    it("grows trees as thick as the land has them, of its own kinds, clear of roads and water", () => {
        const counts = {};
        const kinds = new Map(TREE_KINDS.map(([kind], variant) => [variant, kind]));

        // Chunks of each kind of land, all of them that land (a chunk is 2 × 2 cells), and clear
        // of the settlements, sites and camps still to be built: up to six of each
        const open = (cx, cy) => overworld.clearings.every(({ at, radius }) => Math.hypot(at[0] - (cx + 0.5) * CHUNK, at[1] - (cy + 0.5) * CHUNK) > radius + CHUNK);
        const whole = (id) => {
            const biome = BIOMES.findIndex((b) => b.id === id);
            const step = CHUNK / CELL;
            const found = [];

            for (let cy = 0; cy < CHUNKS && found.length < 6; cy++) {
                for (let cx = 0; cx < CHUNKS && found.length < 6; cx++) {
                    const cells = [0, 1].flatMap((j) => [0, 1].map((i) => (cy * step + j) * CELLS + cx * step + i));

                    if (cells.every((k) => world.plan.biome[k] === biome && !world.plan.water[k]) && open(cx, cy)) {
                        found.push(overworld.chunk(cx, cy));
                    }
                }
            }

            return found;
        };

        for (const id of ["woods", "farmland", "darkwood", "badlands"]) {
            const chunks = whole(id);

            assert.ok(chunks.length >= 3, id);
            counts[id] = chunks.reduce((sum, chunk) => sum + chunk.trees.length, 0) / chunks.length;

            for (const { x, y, variant } of chunks.flatMap((chunk) => chunk.trees)) {
                assert.ok(FLORA[overworld.biomeAt(x, y)].kinds.includes(kinds.get(variant)), `${id}: a ${kinds.get(variant)}`);
            }
        }

        assert.ok(counts.woods > 3 * counts.farmland && counts.darkwood > 3 * counts.farmland, JSON.stringify(counts));
        assert.ok(counts.woods >= 15 && counts.badlands <= 4, JSON.stringify(counts));

        // Each tree's trunk fills the four squares round its point, and none stands in the town,
        // on a road or in water
        const squares = squaresOf(overworld);

        for (const chunk of around) {
            for (const { x, y } of chunk.trees) {
                for (const [sx, sy] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
                    assert.ok(squares.blocked(sx, sy) && squares.opaque(sx, sy));
                    assert.ok(!overworld.inTown(sx, sy));
                    assert.notEqual(squares.ground(sx, sy), GROUND.road);
                    assert.equal(chunk.water[(sy - chunk.y0) * CHUNK + (sx - chunk.x0)], WET.none);
                }
            }
        }
    });

    it("finds a way out of the town along the roads, across many chunks", () => {
        const [cx, cy] = world.spawns.player;
        let goal = null;

        // A square of road about 250 metres from the town
        for (const { x, y, k, chunk } of squaresIn(around)) {
            const far = Math.hypot(x - cx, y - cy);

            if (chunk.ground[k] === GROUND.road && !chunk.blocked[k] && far > 240 && far < 280) {
                goal = [x, y];
                break;
            }
        }

        assert.ok(goal, "a road leads away from the town");

        const start = performance.now();
        const path = findPath(overworld, world.spawns.player, goal);
        const took = performance.now() - start;

        assert.deepEqual(path.at(-1), goal);
        assert.ok(path.length >= 240, `${path.length} steps`);
        assert.ok(took < 1500, `${took.toFixed(0)} ms`);

        const squares = squaresOf(overworld);

        for (const [x, y] of path) {
            assert.ok(!squares.blocked(x, y));
        }
    });

    it("lets the player walk out of the town into the world", () => {
        const battle = new Battle(world, { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: world.spawns.player });
        const [x, y] = world.spawns.player;
        const squares = squaresOf(overworld);
        let goal = null;

        // Somewhere open 90 or so metres west or east of the town's edge
        for (const dx of [-1, 1]) {
            const edge = dx < 0 ? world.stamp.at[0] - 90 : world.stamp.at[0] + world.stamp.width + 90;

            for (let dy = 0; dy < 60 && !goal; dy++) {
                for (const sy of [y + dy, y - dy]) {
                    if (!goal && !squares.blocked(edge, sy)) {
                        goal = [edge, sy];
                    }
                }
            }
        }

        assert.ok(goal);
        battle.command("player", { type: "move", to: goal });

        for (let t = 0; t < 150000 && player.order; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        assert.ok(Math.hypot(player.x - (goal[0] + 0.5), player.y - (goal[1] + 0.5)) < 1.5, `at ${player.x.toFixed(1)}, ${player.y.toFixed(1)}; going to ${goal}, from ${x}, ${y}`);
        assert.ok(!overworld.inTown(Math.floor(player.x), Math.floor(player.y)));
    });

    it("makes chunks quickly", () => {
        const fresh = new Overworld({ plan: world.plan, stamp: world.stamp, start: world.start });
        const start = performance.now();

        for (let k = 0; k < 16; k++) {
            fresh.chunk(40 + (k % 4), 60 + Math.floor(k / 4));
        }

        const each = (performance.now() - start) / 16;

        assert.ok(each < 40, `${each.toFixed(1)} ms a chunk`);
    });
});
