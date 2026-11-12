// What's near the players made ahead on the world server (server/ahead.js; generated/
// world_server_plan.md §3.1): the game's own workers run on Node's threads (server/workers.js),
// giving what they would in a browser (a settlement laid out, a navigation tile baked, a chunk's
// heights worked out, to the same bytes as here); round a player out in the world the chunks are
// made a piece at a time between steps, nearest first, and the navigation's tiles baked off the
// world's thread, those of the buildings opened near them too; what the host says it will soon
// want made after those (the ground a town's soldiers will stand on, a dungeon's levels); as many
// chunks kept as all that takes; what was waiting round a player who's gone let go; the meshes of
// more buildings' insides kept than a browser keeps; and a way that falls short looked for
// further over tiles sent off to be baked, not baked in the step
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { DELVES } from "../client/js/core/dungeons/play.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { dungeonFrom } from "../client/js/core/insides.js";
import { bakeTile } from "../client/js/core/navigation/bake.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { KEEP_ROOMS, keepRooms, navigatorOf } from "../client/js/core/navigation.js";
import { CHUNK, CHUNKS, KEEP, buildWorld } from "../client/js/core/overworld.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { layoutTown, SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { CORNERS } from "../client/js/core/terrain/ground.js";
import { heightsOf } from "../client/js/core/terrain/height.js";
import { HOST_PLAYER, Host, MUSTER, SOON } from "../client/js/core/host.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { NavBaker } from "../client/js/world/navbaker.js";
import { AHEAD, Ahead } from "../server/ahead.js";
import { installWorkers, ThreadWorker } from "../server/workers.js";

installWorkers();

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// The chunks a box of squares touches ([x0, y0, x1, y1], both ends in): [[cx, cy]...]
function chunksIn([x0, y0, x1, y1]) {
    const chunks = [];

    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
        for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
            chunks.push([cx, cy]);
        }
    }

    return chunks;
}

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
        // (What the worker sends back, caught as it's added: the navigation keeps no copy of a
        // tile's data beside the mesh's own)
        const add = navigation.add.bind(navigation);
        let came = null;

        navigation.add = (ax, ay, data) => {
            came = ax === tx && ay === ty ? Uint8Array.from(data) : came;
            add(ax, ay, data);
        };

        assert.ok(baker.worker, "(on a worker)");
        world.maps.town.chunkAt(x, y);
        baker.bake(tx, ty);
        assert.equal(navigation.has(tx, ty), false, "(not baked here)");
        assert.ok(await until(() => navigation.has(tx, ty)), "(come back)");
        assert.deepEqual(came, here);
        assert.ok(here.length > 1000);
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

        // (A little each time: a piece of a chunk at the least, and no more of it than there's
        // time for. By a clock that says the time allowed has gone by: one piece, the chunk left
        // half made, carried on the next time it's pumped)
        const waiting = ahead.chunks.length;
        const clock = ahead.clock;
        let ticks = 0;

        ahead.clock = () => (ticks++ ? AHEAD.budget + 1 : 0);
        ahead.pump();
        assert.equal(ahead.made, 0);
        assert.equal(ahead.chunks.length, waiting);
        assert.equal(overworld.making.size, 1, "one begun, a piece of it made (the first with no settlement by it still being laid out)");

        let pumps = 1;

        while (!ahead.made) {
            ticks = 0;
            ahead.pump();
            pumps++;
        }

        assert.ok(pumps > 8, `the first chunk made over ${pumps} pumps, a piece each`);
        assert.equal(ahead.chunks.length, waiting - 1);
        assert.equal(overworld.making.size, 0);
        ahead.clock = clock;
        assert.ok(await until(() => (ahead.pump(), !ahead.chunks.length)));
        assert.ok(ring(AHEAD.chunks).every(made), "every chunk round them made");

        // (And the navigation's tiles round them baked off the world's thread, as their ground's made)
        const navigation = navigatorOf(overworld);
        const [tx, ty] = navigation.tileOf(x, y);

        assert.ok(await until(() => (ahead.pump(), navigation.has(tx, ty))), "their tile baked");
        assert.ok(navigation.later, "(ways waiting on tiles wait for the worker)");
        ahead.dispose();
    });

    it("works the land's heights out on a worker for the chunks waiting, as the browser does, and they're the heights worked out here", async () => {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const [x, y] = startFor(world.plan, "cat").at;
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
        const ahead = new Ahead(world);

        assert.ok(ahead.terrains.worker, "(on a worker)");
        ahead.around(x, y, 96);
        assert.ok(await until(() => overworld.ground.has(cx + 2, cy + 2) && overworld.ground.has(cx - 3, cy - 3)), "(given)");
        assert.deepEqual(overworld.ground.natural.get((cy + 2) * 1024 + cx + 2), heightsOf(world.plan, (cx + 2) * CHUNK, (cy + 2) * CHUNK, CORNERS, 1));

        // (And those further off it's asked for by name: the ground wanted soon)
        ahead.terrains.want([[cx + 9, cy], [cx + 9, cy]]);
        assert.ok(await until(() => overworld.ground.has(cx + 9, cy)), "(given)");
        ahead.dispose();
    });

    it("makes the ground a town's soldiers will stand on before a player's near enough to bring them out, after what's round the players; and is told what's wanted by the host alone", async () => {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const place = world.plan.places.find(({ id }) => id === "human-city-1");
        const edge = SETTLEMENT_KINDS[place.kind].radius;
        const at = (off) => nearestFree(squaresOf(overworld), [Math.round(place.at[0] - edge - off), Math.round(place.at[1])], { within: 40 });
        const host = new Host(world, { populate: false });

        host.join({ id: "p1", hero: HERO, square: at(MUSTER.near + SOON.margin - 20), map: "town" });
        host.populate();

        const ahead = new Ahead(world, { host });
        const [box] = host.soon().boxes.filter(([x0, y0, x1, y1]) => place.at[0] >= x0 && place.at[0] <= x1 && place.at[1] >= y0 && place.at[1] <= y1 && x1 - x0 > 2 * (edge + SOON.folk + 1));
        const made = ([cx, cy]) => overworld.made(cx * CHUNK, cy * CHUNK, cx * CHUNK, cy * CHUNK);

        assert.ok(box, "(the city's ground wanted soon)");

        const beyond = chunksIn(box);

        // (Looked over as it's pumped: no one's asked it for anything, core/runner.js bakeAhead's
        // around; what the host says is enough)
        const me = host.battle.actor("p1");
        const [mx, my] = [Math.floor(me.x / CHUNK), Math.floor(me.y / CHUNK)];
        const far = beyond.filter(([cx, cy]) => Math.max(Math.abs(cx - mx), Math.abs(cy - my)) > AHEAD.chunks);

        ahead.pump();
        assert.ok(far.length > 4, `(${far.length} of its chunks further off than what's made round a player)`);
        assert.ok(far.every((chunk) => made(chunk) || ahead.chunks.some(([cx, cy]) => cx === chunk[0] && cy === chunk[1])), "waiting to be made");
        assert.ok(ahead.chunks.findIndex(([cx, cy]) => cx === far[0][0] && cy === far[0][1]) >= ahead.chunks.filter(([cx, cy]) => Math.max(Math.abs(cx - mx), Math.abs(cy - my)) <= AHEAD.chunks).length, "after what's round the player");
        assert.equal(ahead.wanted, new Set([...host.soon().boxes.flatMap(chunksIn), ...chunksIn([(mx - 3) * CHUNK, (my - 3) * CHUNK, (mx + 3) * CHUNK, (my + 3) * CHUNK])].map(([cx, cy]) => cy * CHUNKS + cx)).size, "the chunks round the player and those wanted soon, each once");

        assert.ok(await until(() => (ahead.pump(), ahead.settled), 120000), "settled");
        assert.ok(beyond.every(made), "all the city's ground made");

        // (So the step that musters it makes none of its own)
        let inStep = 0;
        const groundChunk = overworld.ground.chunk.bind(overworld.ground);

        host.battle.place("p1", "town", at(MUSTER.near - 10));
        assert.ok(await until(() => (ahead.pump(), ahead.settled), 120000), "settled again");
        overworld.ground.chunk = (cx, cy) => {
            inStep += overworld.ground.peek(cx, cy) ? 0 : 1;

            return groundChunk(cx, cy);
        };

        const events = [];

        for (let k = 0; k < 12 && !events.some(({ type }) => type === "muster"); k++) {
            events.push(...host.advance(50));
        }

        assert.ok(events.some(({ type, town }) => type === "muster" && town === place.id), "(mustered)");
        assert.equal(inStep, 0, "no chunk made in its steps");
        ahead.dispose();
    });

    it("keeps as many chunks as its players and what's wanted soon take, so none's let go to make another, and settles with players in six towns", async () => {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "none" } });
        const peoples = ["human", "elf", "darkElf", "cat", "lizard", "orc"];

        peoples.forEach((race, k) => host.join({ id: `p${k + 1}`, hero: { ...HERO, name: `P${k + 1}`, race }, square: startFor(world.plan, race).at.map(Math.round), map: "town" }));
        host.populate();

        const ahead = new Ahead(world, { host });

        ahead.pump();
        assert.ok(ahead.wanted > KEEP, `${ahead.wanted} chunks wanted: more than a browser keeps`);
        assert.equal(overworld.kept, ahead.wanted + AHEAD.spareChunks);
        assert.equal(overworld.ground.kept, overworld.kept);
        assert.ok(await until(() => (ahead.pump(), ahead.settled), 240000), "settled, as it never could with fewer kept than wanted");

        const wanted = host.soon().around.flatMap(([x, y]) => Array.from({ length: 49 }, (_, k) => [Math.floor(x / CHUNK) - 3 + (k % 7), Math.floor(y / CHUNK) - 3 + Math.floor(k / 7)]));

        assert.ok(wanted.every(([cx, cy]) => overworld.made(cx * CHUNK, cy * CHUNK, cx * CHUNK, cy * CHUNK)), "every chunk round every one of them made, and kept");

        // (Pumped on with no one moving: nothing more to make)
        const made = ahead.made;

        for (let k = 0; k < 50; k++) {
            ahead.pump();
        }

        assert.equal(ahead.made, made, "none made again");

        // (One of them gone from the world: what the world keeps follows; never fewer than a browser's)
        const before = overworld.kept;

        host.leave("p6");
        host.advance(50);
        ahead.pump();
        assert.ok(overworld.kept < before && overworld.kept >= KEEP);
        ahead.dispose();
    });

    it("lets go of what was waiting round a player who's gone elsewhere: its chunks, and its navigation's tiles", async () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "none" } });
        const [here, there] = [startFor(world.plan, "lizard").at.map(Math.round), startFor(world.plan, "darkElf").at.map(Math.round)];
        const near = ([px, py], reach) => ([cx, cy]) => Math.abs(cx - Math.floor(px / CHUNK)) <= reach && Math.abs(cy - Math.floor(py / CHUNK)) <= reach;

        host.join({ id: "p1", hero: HERO, square: here, map: "town" });

        const ahead = new Ahead(world, { host });
        const runner = new WorldRunner(host);
        const { tile } = ahead.navBaker.navigation.measures;

        runner.bakeAhead(ahead);
        assert.ok(ahead.chunks.length > 30 && ahead.chunks.every(near(here, AHEAD.chunks)), "(what's round them waiting)");
        assert.ok(ahead.navBaker.queue.length > 50, "(and its tiles)");

        // (Through a portal to somewhere far off: what's round where they are now, and none of
        // what was waiting where they were)
        host.battle.place("p1", "town", there);
        runner.bakeAhead(ahead);
        assert.ok(ahead.chunks.length > 30 && ahead.chunks.every(near(there, AHEAD.chunks)), "only what's round where they are now");
        assert.ok(ahead.navBaker.queue.length > 50 && ahead.navBaker.queue.every(([tx, ty]) => Math.abs((tx + 0.5) * tile - there[0]) <= AHEAD.reach + tile && Math.abs((ty + 0.5) * tile - there[1]) <= AHEAD.reach + tile), "and its tiles");

        // (Gone from the world: nothing waiting)
        host.leave("p1");
        ahead.stale = true;
        ahead.pump();
        assert.deepEqual([ahead.chunks.length, ahead.navBaker.queue.length, ahead.wanted], [0, 0, 0]);
        ahead.dispose();
    });

    it("works a dungeon's levels out on the layouts' worker before anyone's at its door, the dungeon it would be made as here, and it's made of them", async () => {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const squares = squaresOf(overworld);
        const from = (site, off) => nearestFree(squares, [Math.round(site.at[0] - off), Math.round(site.at[1])], { within: 20 });
        const site = world.plan.sites.find((each) => {
            if (each.kind !== "dungeon") {
                return false;
            }

            try {
                return Boolean(from(each, 100));
            } catch {
                return false;
            }
        });
        const host = new Host(world, { populate: false });

        host.join({ id: "p1", hero: HERO, square: from(site, SOON.delve - 50), map: "town" });
        host.populate();

        const ahead = new Ahead(world, { host });
        const building = () => world.interiors.buildings.get(`site:${site.id}`);

        assert.ok(await until(() => (ahead.pump(), building()?.given), 120000), "its levels given, worked out on the worker");
        assert.ok(!building().made, "(not made yet)");

        const { given } = building();

        assert.deepEqual(given.from, dungeonFrom(building()));
        assert.deepEqual(given.dungeon, buildDungeon(given.from), "the dungeon it would be made as here");

        // (Come to: made of what was given)
        host.battle.place("p1", "town", from(site, DELVES.near - 15));

        for (let k = 0; k < 12 && !building().made; k++) {
            host.advance(50);
        }

        assert.ok(building().made);
        assert.equal(building().dungeon, given.dungeon);
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
