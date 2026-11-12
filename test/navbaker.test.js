// Navigation tiles baked off the asking thread (client/js/world/navbaker.js, navworker.js), on
// Node's threads as the world server runs the game's workers (server/workers.js): a building's
// floors as it's got ready, kept till each floor's mesh is made, which takes them and bakes none;
// the tiles under a way a copy of someone else's world is sent, before its battle asks the mesh
// about them in a step; each kind of mesh's tiles the same bytes as baking them here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { bakeTile } from "../client/js/core/navigation/bake.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { OVERWORLD, ROOMS, SCENES } from "../client/js/core/navigation/settings.js";
import { dropTiles, floorOf, floorWants, navigatorOf, releaseNavigation, squaresNavigation } from "../client/js/core/navigation.js";
import { sceneryMap } from "../client/js/core/scenery.js";
import { ALONG, FLOOR_TILES, NavBaker } from "../client/js/world/navbaker.js";
import { installWorkers, ThreadWorker } from "../server/workers.js";
import { parseGrid } from "./helpers.js";

installWorkers();

// Wait (giving the workers' answers their turn) till `done()`, or `ms` have gone by
async function until(done, ms = 30000) {
    const end = performance.now() + ms;

    while (!done() && performance.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }

    return done();
}

// A building's floor: two rooms and a doorway a square wide
const floorMap = () => ({
    blocked: parseGrid([
        "####################",
        "#........#.........#",
        "#........#.........#",
        "#..................#",
        "#........#.........#",
        "#........#.........#",
        "####################",
    ]),
});

// A map of squares wider than a tile, nothing on it but its edge
const open = (width, height) => ({ blocked: Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0))) });

describe("navigation tiles baked off the asking thread (world/navbaker.js)", () => {
    it("bakes each kind of mesh's tiles on the worker to the bytes baked here: the overworld's, a map of squares', a scene's with its ledges left", async () => {
        const recast = await loadRecast();
        const worker = new ThreadWorker(new URL("../client/js/world/navworker.js", import.meta.url));
        const back = [];

        worker.onmessage = ({ data }) => back.push(data);

        const rooms = floorOf(floorMap());
        const scene = floorOf(sceneryMap("bellhaven", "site:bellhaven/grounds"));
        // (A tile of the scene's with floors at several heights: its bridge and courts)
        const [sx, sy] = [5, 9];
        const jobs = [
            { mesh: 1, tx: 0, ty: 0, input: rooms.input(0, 0), measures: ROOMS, here: bakeTile(recast, rooms.input(0, 0), 0, 0, ROOMS) },
            { mesh: 2, tx: sx, ty: sy, input: scene.input(sx, sy), measures: SCENES, here: bakeTile(recast, scene.input(sx, sy), sx, sy, SCENES) },
            // (With no measures said: the overworld's; and with the overworld's said, as its
            // own tiles are sent, a copy of them by the time they're there)
            { tx: 0, ty: 0, input: rooms.input(0, 0), here: bakeTile(recast, rooms.input(0, 0), 0, 0, OVERWORLD) },
            { tx: 1, ty: 0, input: rooms.input(0, 0), measures: OVERWORLD, here: bakeTile(recast, rooms.input(0, 0), 1, 0, OVERWORLD) },
        ];

        assert.equal(rooms.measures, ROOMS);
        assert.equal(scene.measures, SCENES);

        for (const { mesh, tx, ty, input, measures } of jobs) {
            worker.postMessage({ mesh, tx, ty, input, measures });
        }

        assert.ok(await until(() => back.length === jobs.length), "(come back)");
        worker.terminate();

        for (const [k, { mesh, tx, ty, here }] of jobs.entries()) {
            assert.deepEqual({ mesh: back[k].mesh, tx: back[k].tx, ty: back[k].ty }, { mesh, tx, ty });
            assert.ok(here.length > 1000);
            assert.deepEqual(back[k].data, here);
        }

        // (And they are three kinds: the scene's as the overworld would bake it is another tile,
        // a ledge filtered out of it)
        assert.notDeepEqual(bakeTile(recast, scene.input(sx, sy), sx, sy, OVERWORLD), jobs[1].here);
        assert.notDeepEqual(jobs[2].here, jobs[0].here);
    });

    it("bakes a building's floors as it's got ready, kept till each floor's mesh is made: the mesh takes them and bakes none, and walks as one baked here", async () => {
        const town = open(40, 40);
        const baker = new NavBaker(navigatorOf(town));
        const floor = floorMap();
        const hall = open(70, 40);

        assert.ok(baker.worker, "(on a worker)");
        assert.equal(floorWants(floor, 0, 0), true);

        baker.floor(floor);
        baker.floor(hall);
        // (Asked once, however often it's said)
        baker.floor(floor);
        assert.equal(baker.asked.size, 1 + 6);
        assert.ok(await until(() => !baker.asked.size), "(come back)");
        assert.equal(floorWants(floor, 0, 0), false);
        assert.equal([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].some(([tx, ty]) => floorWants(hall, tx, ty)), false);

        // Its mesh, made when it's first walked: every tile taken, none baked
        const navigation = navigatorOf(floor);
        const way = navigation.path([2.5, 2.5], [16.5, 1.5]);
        const here = squaresNavigation(floorMap());

        assert.equal(navigation.baked, 0);
        assert.equal(navigation.has(0, 0), true);
        assert.ok(way.length >= 3, "through the doorway");
        assert.deepEqual(way, here.path([2.5, 2.5], [16.5, 1.5]));
        assert.deepEqual(navigation.polygons(0, 0), here.polygons(0, 0));
        assert.equal(here.baked, 1);
        here.dispose();

        const wide = navigatorOf(hall);

        assert.deepEqual(wide.path([2.5, 2.5], [67.5, 37.5]).at(-1).slice(0, 2), [67.5, 37.5]);
        assert.equal(wide.baked, 0);

        // (Asked again with its mesh made: nothing to bake)
        baker.floor(floor);
        assert.equal(baker.asked.size, 0);

        // Its mesh let go of and made again: baked where it's wanted, as ever (what was baked
        // ahead was taken)
        releaseNavigation(floor);
        assert.equal(floorWants(floor, 0, 0), true);
        assert.equal(navigatorOf(floor).path([2.5, 2.5], [16.5, 1.5]).length, way.length);
        assert.equal(navigatorOf(floor).baked, 1);

        for (const map of [town, floor, hall]) {
            releaseNavigation(map);
        }

        baker.dispose();
    });

    it("sends a big floor's tiles a few at a time, and drops what comes back for a floor let go of meanwhile", async () => {
        const town = open(40, 40);
        const baker = new NavBaker(navigatorOf(town));
        // (A scene's size of floor: 6 by 6 tiles)
        const big = open(190, 190);
        const gone = floorMap();

        baker.floor(big);
        assert.equal(baker.asked.size, FLOOR_TILES);
        assert.equal(baker.floorTiles.length, 36 - FLOOR_TILES);

        // (The next lot each frame)
        baker.pump();
        assert.equal(baker.asked.size, 2 * FLOOR_TILES);
        baker.pump();
        assert.equal(baker.floorTiles.length, 0);

        // A floor let go of before its tile's back: nothing kept for it; nor is what was still
        // to send sent
        baker.floor(gone);
        baker.forget(gone);
        assert.ok(await until(() => !baker.asked.size), "(come back)");
        assert.equal(floorWants(gone, 0, 0), true);
        assert.equal(floorWants(big, 5, 5), false);

        // (And a mesh let go of while a tile of its was away takes nothing: no tile's added to
        // a mesh that's gone, nor is it let go of twice)
        const mesh = navigatorOf(gone);
        const data = bakeTile(await loadRecast(), floorOf(gone).input(0, 0), 0, 0, ROOMS);

        releaseNavigation(gone);
        assert.equal(mesh.disposed, true);
        mesh.add(0, 0, data);
        mesh.dispose();
        assert.equal(mesh.tiles.size, 0);

        // What's kept for a floor is let go of with it
        baker.forget(big);
        assert.equal(floorWants(big, 5, 5), true);

        for (const map of [town, big, gone]) {
            releaseNavigation(map);
        }

        baker.dispose();
    });

    it("doesn't take a tile baked from what stood there before: one let go of while it was away, what stands on it changed, is baked again from what's there now", async () => {
        const map = open(40, 40);
        const navigation = navigatorOf(map);
        const baker = new NavBaker(navigation);
        const baked = [];

        baker.onBaked = (tx, ty) => baked.push(`${tx} ${ty}`);
        baker.bake(0, 0);
        baker.bake(1, 0);
        assert.equal(baker.asked.size, 2);

        // A wall goes up across the first tile while it's away (as a fortification does:
        // core/host.js, dropTiles)
        for (let y = 1; y < 20; y++) {
            map.blocked[y][12] = 1;
        }

        dropTiles(map, [12, 1, 12, 19]);
        assert.equal(navigation.changed(0, 0), 1);
        assert.equal(navigation.changed(1, 0), 0);
        assert.ok(await until(() => !baker.asked.size), "(come back, the first twice)");
        assert.deepEqual(baked, ["1 0", "0 0"]);

        // The tile's the ground as it is now: as one baked here from it, the wall walked round
        const here = squaresNavigation(map);

        here.ensure(0, 0);
        assert.deepEqual(navigation.polygons(0, 0), here.polygons(0, 0));
        assert.equal(navigation.walkable(12.5, 10.5), false);
        assert.equal(navigation.walkable(14.5, 10.5), true);
        assert.equal(navigation.baked, 0);
        here.dispose();
        releaseNavigation(map);
        baker.dispose();
    });

    it("has the tiles a way runs over wanted for a copy: those within a few metres of its first stretch, no others, whatever the host's word of it is", () => {
        const map = open(400, 200);
        const navigation = navigatorOf(map);
        const baker = new NavBaker(navigation);
        const { tile } = navigation.measures;
        const wanted = () => baker.wanted.map(([tx, ty]) => `${tx} ${ty}`).sort();

        // (Along a tile's edge: the tiles either side of it; and round a corner)
        baker.along([10, tile - 1], [[10 + tile, tile - 1], [10 + tile, tile + 20]]);
        assert.deepEqual(wanted(), ["0 0", "0 1", "1 0", "1 1"]);

        // A long way: as far as ALONG.far along it, and the reach beyond
        baker.wanted = [];
        baker.along([2, 100], [[398, 100]]);

        const last = Math.floor((2 + ALONG.far + ALONG.reach) / tile);

        assert.deepEqual(wanted(), Array.from({ length: last + 1 }, (_, tx) => `${tx} 3`).sort());
        assert.ok(last < Math.floor(398 / tile));

        // (Nothing of a way that isn't one: the host's word, off the wire)
        baker.wanted = [];

        for (const junk of [null, "way", [[NaN, 3]], [null], [["a", "b"]]]) {
            baker.along([2, 100], junk);
        }

        baker.along([NaN, 100], [[30, 100]]);
        baker.along([Infinity, 100], [[30, 100]]);
        assert.deepEqual(wanted(), ["0 3"]);

        releaseNavigation(map);
        baker.dispose();

        // (Without a worker, none: a tile's baked where it's wanted, as ever)
        const none = new NavBaker(navigatorOf(map));

        none.dispose();
        none.along([2, 100], [[98, 100]]);
        none.floor(floorMap());
        assert.deepEqual([none.wanted.length, none.asked.size, none.floorTiles.length], [0, 0, 0]);
        releaseNavigation(map);
    });

    it("has a battle given its ways (a copy's) ask the mesh where a walker stepping round another may stand without baking a tile in a step, and come out the same as one that baked it there", async () => {
        // Two walkers sent at each other along ways handed to them, as a copy takes the host's
        const play = async (ahead) => {
            const world = open(40, 40);
            const battle = new Battle(world, { seed: 1 });
            const navigation = navigatorOf(world);
            const baker = ahead ? new NavBaker(navigation) : null;

            battle.add({ id: "one", kind: "folk", team: "t", neutral: true, square: [10, 20] });
            battle.add({ id: "two", kind: "folk", team: "t", neutral: true, square: [20, 20] });
            battle.replay = [];

            for (const [id, to] of [["one", [20.5, 20.5]], ["two", [10.5, 20.5]]]) {
                const actor = battle.actor(id);

                Object.assign(actor, { path: [to], pathGoal: [Math.floor(to[0]), Math.floor(to[1])], lastPathAt: 0 });

                // (As the game does with each way heard: app/game.js #bakeUnder)
                baker?.along([actor.x, actor.y], actor.path);
            }

            if (baker) {
                assert.ok(baker.wanted.length > 0);

                while (baker.wanted.length) {
                    baker.pump();
                }

                assert.ok(await until(() => !baker.asked.size), "(come back)");
            }

            const tiles = navigation.tiles.size;

            // (The worker's tiles are this mesh's kind: as one baked here)
            if (baker) {
                const here = squaresNavigation(open(40, 40));

                here.ensure(0, 0);
                assert.deepEqual(navigation.polygons(0, 0), here.polygons(0, 0));
                here.dispose();
            }

            for (let t = 0; t < 6000; t += STEP_MS) {
                battle.advance(STEP_MS);
            }

            const out = { baked: navigation.baked, tiles, asked: navigation.tiles.size, actors: battle.actors.map(({ id, x, y, path, facing }) => ({ id, x, y, path, facing })) };

            baker?.dispose();
            releaseNavigation(world);

            return out;
        };

        const before = await play(false);
        const after = await play(true);

        // (They step round each other: the mesh is asked, and its tile baked in that step)
        assert.ok(before.baked >= 1, "baked in a step, with nothing baked ahead");
        assert.equal(before.tiles, 0);
        assert.equal(after.baked, 0, "none baked in a step");
        assert.ok(after.tiles >= before.asked);
        assert.notEqual(after.actors[0].y, 20.5, "(one stepped aside)");
        assert.deepEqual(after.actors, before.actors);
    });
});
