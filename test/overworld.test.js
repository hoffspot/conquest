// The world outside (client/js/core/overworld.js): all 8 km of it on 1-metre squares, made a
// chunk at a time from the world plan, with the town set in where the player starts and the
// other settlements (settlements.js) laid out and set in as the world near them is made
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { squaresOf } from "../client/js/core/grid.js";
import { buildWorld, CHUNK, CHUNKS, FLORA, Overworld, WET, WORLD_SIZE } from "../client/js/core/overworld.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { Settlements, squareOf, waysOut } from "../client/js/core/settlements.js";
import { siteSize, Sites } from "../client/js/core/sites.js";
import { ENTERED, GROUND, HOME_TREES, PLOT, TREE_KINDS } from "../client/js/core/setpieces/pieces.js";
import { layoutTown, SETTLEMENT_KINDS, YARD_FENCE } from "../client/js/core/setpieces/town.js";
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

            for (const layer of ["blocked", "opaque", "ground", "water", "bridge", "heights", "slopes"]) {
                assert.deepEqual(other[layer], chunk[layer], `${chunk.cx}, ${chunk.cy}: ${layer}`);
            }

            assert.deepEqual(other.trees, chunk.trees);
        }

        again.chunks.clear();
        again.last = null;
        assert.deepEqual(again.chunk(around[0].cx, around[0].cy).trees, around[0].trees);
    });

    it("makes the same chunks whatever order they're first made in: roads to the town's neighbours joined at their own ends, bridges from the plan alone", () => {
        // (Seed 2's start town has a capital for a neighbour whose road to it once got joined at
        // the town's end: a road straight across the fields, in the chunks made after the capital)
        const madeIn = (order) => {
            const other = buildWorld({ seed: 2 }).maps.town;

            return new Map(order.map(([cx, cy]) => [`${cx},${cy}`, other.chunk(cx, cy)]));
        };
        // (The chunks from the town to the nearest settlement whose road the plan runs to the
        // town, rather than from it: made from the settlement's side first, it's laid out before
        // the rest are made; from the town's, after)
        const { plan, start, stamp } = buildWorld({ seed: 2 }).maps.town;
        const neighbour = plan.roads
            .filter(({ to }) => to === start.id)
            .map(({ from }) => plan.places.find((place) => place.id === from))
            .sort((a, b) => Math.hypot(a.at[0] - start.at[0], a.at[1] - start.at[1]) - Math.hypot(b.at[0] - start.at[0], b.at[1] - start.at[1]))[0];

        assert.ok(neighbour, "a road runs to the town from another settlement");
        const [from, to] = [squareOf(neighbour).at, stamp.at].map((at) => at.map((v) => Math.floor(v / CHUNK)));
        const order = [];

        for (let cy = Math.min(from[1], to[1]) - 1; cy <= Math.max(from[1], to[1]) + 1; cy++) {
            for (let cx = Math.min(from[0], to[0]) - 1; cx <= Math.max(from[0], to[0]) + 1; cx++) {
                order.push([cx, cy]);
            }
        }

        if (from[0] > to[0] || (from[0] === to[0] && from[1] > to[1])) {
            order.reverse();
        }

        const [first, reversed] = [madeIn(order), madeIn([...order].reverse())];

        for (const [key, chunk] of first) {
            for (const layer of ["blocked", "opaque", "ground", "water", "bridge", "heights", "slopes"]) {
                assert.deepEqual(reversed.get(key)[layer], chunk[layer], `${key}: ${layer}`);
            }

            assert.deepEqual(reversed.get(key).trees, chunk.trees, `${key}: trees`);
        }
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
                assert.ok([GROUND.planks, GROUND.cobbles].includes(chunk.ground[k]), "planks, or a stone bridge's cobbles");
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

    it("grows each people's own trees in its homeland, most of the trees there, and nowhere else", () => {
        const kinds = new Map(TREE_KINDS.map(([kind], variant) => [variant, kind]));
        const home = (cx, cy) => {
            const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => overworld.homeAt(Math.min(WORLD_SIZE - 1, (cx + i) * CHUNK), Math.min(WORLD_SIZE - 1, (cy + j) * CHUNK)));

            return corners.every((one) => one === corners[0]) ? corners[0] : undefined;
        };

        for (const people of [...Object.keys(HOME_TREES), null]) {
            const trees = [];

            for (let cy = 0; cy < CHUNKS && trees.length < 60; cy += 3) {
                for (let cx = 0; cx < CHUNKS && trees.length < 60; cx += 3) {
                    if (home(cx, cy) === people) {
                        trees.push(...overworld.chunk(cx, cy).trees.map(({ variant }) => kinds.get(variant)));
                    }
                }
            }

            assert.ok(trees.length >= 20, `${people}: ${trees.length} trees`);

            const own = trees.filter((kind) => kind === HOME_TREES[people]).length;

            assert.ok(people ? own / trees.length > 0.5 : trees.every((kind) => !Object.values(HOME_TREES).includes(kind)), `${people}: ${own} of ${trees.length} its own`);
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

            // (Or, in a people's homeland, their own; or a great lone oak, lonetrees.js)
            for (const { x, y, variant, lone } of chunks.flatMap((chunk) => chunk.trees)) {
                assert.ok(FLORA[overworld.biomeAt(x, y)].kinds.includes(kinds.get(variant)) || HOME_TREES[overworld.homeAt(x, y)] === kinds.get(variant) || (lone && kinds.get(variant) === "greatoak"), `${id}: a ${kinds.get(variant)}`);
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

    it("finds a way out of the town along the roads, across many chunks and navigation tiles", () => {
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

        // (The tiles baked as it goes: the most a way's ever asked of the mesh at once)
        const navigation = navigatorOf(overworld);
        const start = performance.now();
        const path = navigation.path([world.spawns.player[0] + 0.5, world.spawns.player[1] + 0.5], [goal[0] + 0.5, goal[1] + 0.5]);
        const took = performance.now() - start;
        const length = path.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - path[i][0], y - path[i][1]), 0);

        assert.deepEqual(path.at(-1).slice(0, 2).map(Math.floor), goal);
        assert.ok(length >= 240, `${length.toFixed(0)} m`);
        assert.ok(took < 1500, `${took.toFixed(0)} ms`);

        // Every leg over the mesh, every half metre of it somewhere someone can stand
        for (let i = 1; i < path.length; i++) {
            const [[x0, y0], [x1, y1]] = [path[i - 1], path[i]];
            const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5);

            for (let k = 0; k <= steps; k++) {
                const [x, y] = [x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps];

                assert.ok(navigation.walkable(x, y), `${x}, ${y}`);
            }
        }
    });

    it("walks round the town's yards' fences, in at their gateways", () => {
        const navigation = navigatorOf(overworld);
        let [onFence, stood, ways] = [0, 0, 0];

        for (const yard of overworld.stamp.yards.filter(({ gate }) => gate)) {
            const [w, d] = [yard.w * PLOT, yard.h * PLOT];
            const [s, c] = [Math.sin(yard.facing), Math.cos(yard.facing)];
            const at = (u, v) => [yard.x + (u - w / 2) * c + (v - d / 2) * s, yard.y - (u - w / 2) * s + (v - d / 2) * c];
            const local = ([x, y]) => [(x - yard.x) * c - (y - yard.y) * s + w / 2, (x - yard.x) * s + (y - yard.y) * c + d / 2];
            const gate = [[0, yard.gate.at], [yard.gate.at, 0], [w, yard.gate.at]][yard.gate.side];

            // Nowhere to stand along its fences, but by its gateway
            yard.fence.forEach((runs, k) => {
                for (const [from, to] of runs) {
                    for (let t = from + 0.2; t < to - 0.2; t += 0.25) {
                        const [u, v] = [[0.15, t], [t, 0.15], [w - 0.15, t]][k];

                        if (Math.hypot(u - gate[0], v - gate[1]) > 1.6) {
                            onFence++;
                            stood += navigation.walkable(...at(u, v)) ? 1 : 0;
                        }
                    }
                }
            });

            // From behind it and beside it to its middle: in by its gateway, where it's fenced all round
            const whole = yard.fence.every((runs, k) => runs.reduce((sum, [from, to]) => sum + to - from, 0) >= (k === 1 ? w : d) - YARD_FENCE.gate - 0.3);
            const middle = at(w / 2, d * 0.55);

            if (!whole || !navigation.walkable(...middle)) {
                continue;
            }

            for (const from of [[-1.5, -1.5], [w + 1.5, -1.5], [-1.5, d / 2], [w + 1.5, d / 2], [w * 0.2, -1.5], [w * 0.8, -1.5]].map(([u, v]) => at(u, v))) {
                const path = navigation.walkable(...from) ? navigation.path(from, middle) : null;

                if (!path || Math.hypot(path.at(-1)[0] - middle[0], path.at(-1)[1] - middle[1]) > 0.8) {
                    continue;
                }

                // (Its nearest to the gateway's middle, every 5 cm along it)
                let near = Infinity;

                for (let i = 1; i < path.length; i++) {
                    const steps = Math.ceil(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) / 0.05);

                    for (let k = 0; k <= steps; k++) {
                        const [u, v] = local([path[i - 1][0] + ((path[i][0] - path[i - 1][0]) * k) / steps, path[i - 1][1] + ((path[i][1] - path[i - 1][1]) * k) / steps]);

                        near = Math.min(near, Math.hypot(u - gate[0], v - gate[1]));
                    }
                }

                // (Through it: as wide as it is, and the navigation mesh's half-metre squares either side)
                assert.ok(near < YARD_FENCE.gate / 2 + 0.9, `into the yard at ${yard.x.toFixed(1)}, ${yard.y.toFixed(1)}: ${near.toFixed(2)} m from its gateway`);
                ways++;
            }
        }

        assert.ok(onFence > 100 && stood / onFence < 0.05, `${stood} of ${onFence} places on fences stood on`);
        assert.ok(ways >= 3, `${ways} ways in`);
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

    it("sets each people's castle and places down clear of roads and water, moved off them where it must be, each square's land looked at once", () => {
        const looked = new Map();
        const sites = new Sites(world.plan, {
            facingOf: (site) => overworld.trails.facingOf(site),
            landAt: (x, y) => {
                looked.set(y * WORLD_SIZE + x, (looked.get(y * WORLD_SIZE + x) ?? 0) + 1);

                return overworld.landAt(x, y);
            },
        });
        let moved = 0;

        for (const site of world.plan.sites.filter((each) => siteSize(each))) {
            const [cx, cy] = site.at.map((v) => Math.floor(v / CHUNK));
            const before = sites.set.size;

            looked.clear();
            sites.settle(cx, cy);

            // (Once for each site set down then, at most)
            assert.ok(Math.max(0, ...looked.values()) <= sites.set.size - before, `${site.kind} ${site.id}`);

            const set = sites.set.get(site.id);

            if (!set) {
                continue;
            }

            moved += set.x !== Math.round(site.at[0]) || set.y !== Math.round(site.at[1]) ? 1 : 0;

            for (const square of set.squares) {
                const [x, y] = [square % WORLD_SIZE, Math.floor(square / WORLD_SIZE)];

                if (x % 2 === 0 && y % 2 === 0) {
                    const land = overworld.landAt(x, y);

                    assert.ok(!land.road && !land.water, `${site.kind} on ${land.road ? "a road" : "water"} at ${x}, ${y}`);
                }
            }
        }

        assert.ok(moved >= 1, "some moved off a road");
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

describe("the settlements out in the world (settlements.js)", () => {
    // The village nearest the town that its roads come into, with every chunk it's in made
    let village;
    let settlement;

    before(() => {
        world ??= buildWorld({ seed: 1 });
        overworld ??= world.maps.town;

        const { plan, start } = world;
        const roaded = plan.places.filter((place) => place.kind === "village" && plan.roads.some(({ from, to }) => from === place.id || to === place.id));

        village = roaded.reduce((best, place) => (Math.hypot(place.at[0] - start.at[0], place.at[1] - start.at[1]) < Math.hypot(best.at[0] - start.at[0], best.at[1] - start.at[1]) ? place : best));

        const { at, size } = squareOf(village);

        for (let cy = Math.floor(at[1] / CHUNK); cy <= Math.floor((at[1] + size) / CHUNK); cy++) {
            for (let cx = Math.floor(at[0] / CHUNK); cx <= Math.floor((at[0] + size) / CHUNK); cx++) {
                overworld.chunk(cx, cy);
            }
        }

        settlement = overworld.settlements.laid.get(village.id);
    });

    it("are every place of the plan but the town the player starts in, hamlets and farmsteads too", () => {
        const { places } = overworld.settlements;

        assert.ok(!places.includes(world.start));
        assert.equal(places.length, world.plan.places.filter((place) => SETTLEMENT_KINDS[place.kind]).length - 1);

        for (const kind of ["capital", "city", "town", "village", "hamlet", "farmstead"]) {
            assert.ok(places.some((place) => place.kind === kind), kind);
        }
    });

    it("are laid out as the world near them is first made, the same every time", () => {
        assert.ok(settlement, "the village is laid out");
        assert.deepEqual(settlement.at, squareOf(village).at);
        assert.equal(overworld.settlements.of(village), settlement);

        const again = new Settlements(world.plan, { skip: world.start, landAt: (x, y) => overworld.landAt(x, y) }).of(village);

        assert.equal(JSON.stringify(again.town), JSON.stringify(settlement.town));
        // (A main street out for each way its roads go: one for two going much the same way)
        assert.ok(settlement.town.exits.length >= 1 && settlement.town.exits.length <= waysOut(world.plan, village).length);

        // (Nothing far off is: a place more than a chunk from any chunk made)
        const far = overworld.settlements.places.filter((place) => !overworld.settlements.laid.has(place.id));

        assert.ok(far.length > overworld.settlements.places.length / 2);
    });

    it("have a tavern, a church, a smithy and a guild in every village, and each a tavern (a town hall only in a town or city, a keep in a capital)", () => {
        const names = settlement.town.pieces.filter(({ kind }) => kind === "landmark").map(({ name }) => name);

        for (const name of ENTERED.filter((each) => each !== "hall" && each !== "keep")) {
            assert.ok(names.includes(name), name);
        }

        assert.ok(!names.includes("hall") && !names.includes("keep"));
    });

    it("are set into the world as they were laid out, their pieces each in one chunk", () => {
        const squares = squaresOf(overworld);
        const { at, size, town } = settlement;
        let taken = 0;

        for (let y = at[1]; y < at[1] + size; y++) {
            for (let x = at[0]; x < at[0] + size; x++) {
                const own = overworld.settlements.squareAt(settlement, x, y);

                if (!own || overworld.inTown(x, y) || overworld.settlements.at(x, y) !== settlement) {
                    continue;
                }

                taken += 1;
                assert.equal(squares.blocked(x, y), Boolean(own.blocked), `${x}, ${y}`);
                assert.equal(squares.opaque(x, y), Boolean(own.opaque), `${x}, ${y}`);
                assert.equal(squares.ground(x, y), own.ground, `${x}, ${y}`);
            }
        }

        assert.ok(taken > Math.PI * town.radius ** 2 * 0.8, `${taken} squares`);

        // Every building's squares blocked
        for (const piece of town.pieces.filter(({ kind }) => kind === "house" || kind === "landmark")) {
            assert.ok(squares.blocked(Math.floor(piece.x + at[0]), Math.floor(piece.y + at[1])), piece.key);
        }

        // Its pieces, each in the chunk its middle's in
        let found = 0;

        for (let cy = Math.floor(at[1] / CHUNK); cy <= Math.floor((at[1] + size) / CHUNK); cy++) {
            for (let cx = Math.floor(at[0] / CHUNK); cx <= Math.floor((at[0] + size) / CHUNK); cx++) {
                found += overworld.settlements.piecesIn(cx, cy).filter(({ place }) => place === village.id).length;
            }
        }

        assert.equal(found, town.pieces.length);

        // And its trees grown with the chunks'
        const trees = town.pieces.filter(({ kind }) => kind === "tree").length;
        const grown = [...overworld.chunks.values()].flatMap((chunk) => chunk.trees).filter(({ x, y }) => x >= at[0] && y >= at[1] && x < at[0] + size && y < at[1] + size);

        assert.ok(grown.length >= trees, `${grown.length} trees of ${trees}`);
    });

    it("stand their yards' fences in everyone's way, but not a yard reaching out past their edge over the land's water, a bridge or a road", () => {
        const squares = squaresOf(overworld);
        const { at, town, yards } = settlement;
        let stood = 0;

        assert.ok(yards.length > 0 && yards.every((yard) => town.yards.includes(yard)));

        for (const yard of yards) {
            for (const [i, j] of yard.squares) {
                const [x, y] = [i + at[0], j + at[1]];

                if (!overworld.inTown(x, y) && overworld.settlements.at(x, y) === settlement) {
                    assert.ok(squares.blocked(x, y) && !squares.opaque(x, y), `the fence at ${x}, ${y}`);
                    stood++;
                }
            }
        }

        assert.ok(stood > 0);

        // (Laid out again, its edge drawn in so its yards all reach past it, a river under one of
        // them: that one isn't there, its fence in no one's way; those still there are fenced)
        const [wet] = yards.filter(({ squares: own }) => own.length);
        const under = new Set(wet.squares.map(([i, j]) => `${i + at[0]},${j + at[1]}`));
        const others = new Settlements(world.plan, { skip: world.start, landAt: (x, y) => (under.has(`${x},${y}`) ? { ...overworld.landAt(x, y), water: WET.river } : overworld.landAt(x, y)) });
        const spec = others.specOf(village);
        const laid = layoutTown(spec);

        others.give(village, spec, { ...laid, radius: 0 });

        const again = others.of(village);
        const index = town.yards.indexOf(wet);

        assert.ok(!again.yards.includes(again.town.yards[index]), "the yard over the river isn't there");
        assert.ok(again.town.yards[index].squares.every(([i, j]) => again.town.blocked[j][i] === 0));

        for (const yard of again.yards) {
            assert.ok(yard.squares.every(([i, j]) => again.town.blocked[j][i] === 1));
        }

        assert.equal(again.town.yards.length, town.yards.length);
    });

    it("carry the plan's roads on from their streets' ends", () => {
        const lines = new Set([...overworld.roads.values()].flat().map((segment) => segment[5]).filter((line) => line.ends[village.id]));
        const exits = settlement.town.exits.map(([x, y]) => [x + settlement.at[0], y + settlement.at[1]]);
        const squares = squaresOf(overworld);

        assert.equal(lines.size, world.plan.roads.filter(({ from, to }) => from === village.id || to === village.id).length);

        for (const line of lines) {
            const end = line.ends[village.id] === "start" ? line.points[0] : line.points.at(-1);

            assert.ok(exits.some(([x, y]) => x === end[0] && y === end[1]), `a road ends at ${end}`);
            assert.notEqual(squares.ground(Math.floor(end[0]), Math.floor(end[1])), GROUND.grass);
        }
    });
});
