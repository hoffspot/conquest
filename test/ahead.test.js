// What's near the players made ahead on the world server (server/ahead.js; generated/
// world_server_plan.md §3.1): the game's own workers run on Node's threads (server/workers.js),
// giving what they would in a browser (a settlement laid out, a navigation tile baked, to the same
// bytes as here); round a player out in the world the chunks are made a few at a time between
// steps, nearest first, and the navigation's tiles baked off the world's thread, those of the
// buildings opened near them too; the meshes of more buildings' insides kept than a browser
// keeps; and a way that falls short looked for further over tiles sent off to be baked, not baked
// in the step
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bakeTile } from "../client/js/core/navigation/bake.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { KEEP_ROOMS, keepRooms, navigatorOf } from "../client/js/core/navigation.js";
import { CHUNK, buildWorld } from "../client/js/core/overworld.js";
import { layoutTown } from "../client/js/core/setpieces/town.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { NavBaker } from "../client/js/world/navbaker.js";
import { AHEAD, Ahead } from "../server/ahead.js";
import { installWorkers, ThreadWorker } from "../server/workers.js";

installWorkers();

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// Wait (giving the workers' answers their turn) till `done()`, or `ms` have gone by
async function until(done, ms = 30000) {
    const end = performance.now() + ms;

    while (!done() && performance.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }

    return done();
}

describe("made ahead on the world server (server/ahead.js, server/workers.js)", () => {
    it("runs the game's own workers on Node's threads: a settlement laid out there as it's laid out here", async () => {
        assert.equal(globalThis.Worker, ThreadWorker);

        const world = buildWorld({ seed: 2 });
        const { settlements } = world.maps.town;
        const [cx, cy] = startFor(world.plan, "elf").at.map((v) => Math.floor(v / CHUNK));
        const place = [...settlements.near(cx, cy), ...settlements.near(cx + 1, cy), ...settlements.near(cx, cy + 1)][0];

        assert.ok(place, "(a settlement near the elves' start)");

        const spec = settlements.specOf(place);
        const worker = new globalThis.Worker(new URL("../client/js/world/layout-worker.js", import.meta.url), { type: "module" });
        let heard = null;

        worker.onmessage = ({ data }) => (heard = data);
        worker.postMessage({ id: place.id, spec });
        assert.ok(await until(() => heard), "(an answer)");
        worker.terminate();
        assert.equal(heard.id, place.id);
        assert.deepEqual(heard.town, layoutTown(spec));
    });

    it("bakes the navigation's tiles on a worker to the same bytes as baking them here", async () => {
        const world = buildWorld({ seed: 2 });
        const navigation = navigatorOf(world.maps.town);
        const baker = new NavBaker(navigation);
        const [x, y] = startFor(world.plan, world.start.race).at;
        const [tx, ty] = navigation.tileOf(x, y);
        const here = bakeTile(await loadRecast(), navigation.input(tx, ty), tx, ty);

        assert.ok(baker.worker, "(on a worker)");
        world.maps.town.chunkAt(x, y);
        baker.bake(tx, ty);
        assert.equal(navigation.has(tx, ty), false, "(not baked here)");
        assert.ok(await until(() => navigation.has(tx, ty)), "(come back)");
        assert.deepEqual([...navigation.tiles.values()].find((tile) => tile.tx === tx && tile.ty === ty).data, here);
        baker.dispose();
    });

    it("bakes every tile round a point at once on a worker as the game loads (ready), and is done once they're all in", async () => {
        const world = buildWorld({ seed: 2 });
        const navigation = navigatorOf(world.maps.town);
        const baker = new NavBaker(navigation);
        const [x, y] = startFor(world.plan, world.start.race).at;
        const [tx0, ty0] = navigation.tileOf(x - 52, y - 52);
        const [tx1, ty1] = navigation.tileOf(x + 52, y + 52);

        await baker.ready(x, y, 52);

        // (Every one in, none baked here: the world's ground under them made here, as it loads)
        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                assert.ok(navigation.has(tx, ty), `tile ${tx} ${ty} in`);
            }
        }

        assert.equal(navigation.baked, 0);
        assert.equal(baker.asked.size, 0);
        baker.dispose();
    });

    it("makes the chunks round a player between steps, nearest first, a little each time, and their navigation baked off the world's thread", async () => {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const [x, y] = startFor(world.plan, "orc").at;
        const ahead = new Ahead(world);
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
        const ring = (reach) => {
            const chunks = [];

            for (let dy = -reach; dy <= reach; dy++) {
                for (let dx = -reach; dx <= reach; dx++) {
                    chunks.push([cx + dx, cy + dy]);
                }
            }

            return chunks;
        };
        const made = ([ax, ay]) => overworld.made(ax * CHUNK, ay * CHUNK, ax * CHUNK, ay * CHUNK);

        assert.ok(!ring(AHEAD.chunks).every(made), "(not made yet)");
        ahead.around(x, y, 96);
        assert.ok(ahead.chunks.length > 0);
        assert.deepEqual(ahead.chunks[0], [cx, cy], "(its own first)");

        // (A little each time: within the budget, but one at the least)
        const waiting = ahead.chunks.length;

        ahead.pump();
        assert.ok(ahead.made >= 1 && ahead.chunks.length < waiting);
        assert.ok(await until(() => (ahead.pump(), !ahead.chunks.length)));
        assert.ok(ring(AHEAD.chunks).every(made), "every chunk round them made");

        // (And the navigation's tiles round them baked off the world's thread, as their ground's made)
        const navigation = navigatorOf(overworld);
        const [tx, ty] = navigation.tileOf(x, y);

        assert.ok(await until(() => (ahead.pump(), navigation.has(tx, ty))), "their tile baked");
        assert.ok(navigation.later, "(ways waiting on tiles wait for the worker)");
        ahead.dispose();
    });

    it("bakes the insides of the buildings the host has open between steps, a tile at a time, and is settled once all's made", async () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        host.advance(50);

        const ahead = new Ahead(world, { host });
        const insides = [...host.open.keys()].flatMap((key) => world.interiors.buildings.get(key).maps.map((id) => world.maps[id]));

        assert.ok(insides.length > 0, "(buildings open round the start)");
        ahead.around(...host.battle.actor(HOST_PLAYER).square, 96);
        assert.equal(ahead.settled, false);
        assert.ok(await until(() => (ahead.pump(), ahead.settled), 60000), "settled");
        assert.ok(ahead.rooms > 0);

        for (const map of insides) {
            const navigation = navigatorOf(map);
            const { tile } = navigation.measures;

            for (let ty = 0; ty * tile < navigation.size[1]; ty++) {
                for (let tx = 0; tx * tile < navigation.size[0]; tx++) {
                    assert.ok(navigation.has(tx, ty), `${map.id} ${tx},${ty}`);
                }
            }
        }

        ahead.dispose();
    });

    it("keeps every open building's insides' meshes, however many are open, so baking them ahead never lets one go to make another", async () => {
        const world = buildWorld({ seed: 2 });
        const keys = Array.from({ length: AHEAD.rooms + 8 }, (_, k) => `room:${k}`);
        const rooms = keys.map(() => ({ blocked: Array.from({ length: 8 }, () => new Array(8).fill(0)) }));
        const opened = { ...world, maps: { ...world.maps, ...Object.fromEntries(keys.map((key, k) => [key, rooms[k]])) }, interiors: { buildings: new Map(keys.map((key) => [key, { maps: [key] }])) } };
        const ahead = new Ahead(opened, { host: { open: new Map(keys.map((key) => [key, []])) } });

        assert.ok(await until(() => (ahead.pump(), ahead.settled), 20000), "settled, every one baked");

        const meshes = rooms.map((map) => navigatorOf(map));
        const baked = ahead.rooms;

        for (let k = 0; k < 20; k++) {
            ahead.pump();
        }

        assert.equal(ahead.rooms, baked, "(none baked again)");
        assert.ok(
            rooms.every((map, k) => navigatorOf(map) === meshes[k]),
            "(none let go of)",
        );
        ahead.dispose();
        keepRooms(AHEAD.rooms);
    });

    it("keeps as many buildings' insides' meshes as it's told (core/navigation.js keepRooms), the longest unused let go of", () => {
        const room = () => ({ blocked: Array.from({ length: 8 }, () => new Array(8).fill(0)) });
        const rooms = Array.from({ length: KEEP_ROOMS + 4 }, room);

        keepRooms(KEEP_ROOMS + 8);

        const meshes = rooms.map((map) => navigatorOf(map));

        assert.ok(
            rooms.every((map, k) => navigatorOf(map) === meshes[k]),
            "(all kept)",
        );

        // (Back to a browser's: the longest unused let go of as the next comes)
        keepRooms(KEEP_ROOMS);
        navigatorOf(room());
        assert.notEqual(navigatorOf(rooms[0]), meshes[0]);
        assert.equal(navigatorOf(rooms.at(-1)), meshes.at(-1));
    });

    it("looks for a way that falls short further over tiles sent off to be baked, not baked in the step (widenLater)", () => {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const navigation = navigatorOf(overworld);
        const [sx, sy] = startFor(world.plan, world.start.race).at;
        const sent = [];

        navigation.later = (tx, ty) => sent.push([tx, ty]);
        navigation.widenLater = true;

        // (Somewhere it can't be got to: the middle of a building, walled round)
        let inside = null;

        for (let r = 4; r < 60 && !inside; r++) {
            for (let a = 0; a < 32 && !inside; a++) {
                const [x, y] = [Math.round(sx + r * Math.cos(a)), Math.round(sy + r * Math.sin(a))];
                let walled = true;

                for (let dy = -3; dy <= 3 && walled; dy++) {
                    for (let dx = -3; dx <= 3 && walled; dx++) {
                        walled = overworld.squares.blocked(x + dx, y + dy);
                    }
                }

                inside = walled ? [x + 0.5, y + 0.5] : null;
            }
        }

        assert.ok(inside, "(a building near the start)");

        const baked = navigation.baked;

        navigation.path([sx, sy], inside);
        assert.ok(sent.length > 0, "the tiles further round sent off");
        assert.ok(
            sent.every(([tx, ty]) => !navigation.has(tx, ty)),
            "none baked here",
        );

        // (Those between were baked here, as for any way that isn't to wait: a player's)
        assert.ok(navigation.baked > baked);
    });
});
