// Ground made ahead for those not yet in (generated/multiplayer_scaling_plan.md 1-26): the host
// says where one coming in would be stood, changing nothing (core/host.js whereFor), and what
// ground a town by them would want as they arrive (soon's `coming` and `theirs`); a world that
// lets only so many in at once says where those waiting will stand (core/netplay.js Session
// coming) and lets each in once whoever makes the world ahead says their ground is made (ground),
// those behind them meanwhile, and after WELCOMES.timeout whether it is or not; the world server's
// maker (server/ahead.js expect, grounded) makes it after what's round the players in. Made in
// time, the steps one comes in on make no ground of their own; and the world's the same step for
// step, and everything it sends, whether their ground was made ahead or by the steps.
import assert from "node:assert/strict";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host, MUSTER, SOON } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { characterFrom, Hosting, NET_VERSION, WELCOMES } from "../client/js/core/netplay.js";
import { buildWorld, CHUNK, CHUNKS } from "../client/js/core/overworld.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { decode, encode } from "../client/js/core/wire.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { AHEAD, Ahead } from "../server/ahead.js";
import { KeptHeroes } from "../server/storage/heroes.js";

const CITY = "human-city-1";
const guest = (name, race = "human") => ({ hero: { name, shape: {}, look: {}, weapon: "sword", boots: false, race } });
const hello = (name, race) => encode({ kind: "hello", version: NET_VERSION, character: guest(name, race) });

// Where a hero kept in each of three towns far from one another was when they left (seed 2: the
// city, and the two settlements furthest from it and from each other), a little inside its edge;
// worked out on a world of its own, so none of the worlds played has any of it made
function keptPlaces() {
    const world = buildWorld({ seed: 2 });
    const towns = world.plan.places.filter(({ kind }) => SETTLEMENT_KINDS[kind]);
    const city = towns.find(({ id }) => id === CITY);
    const far = (a, b) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
    const second = towns.reduce((best, town) => (far(town, city) > far(best, city) ? town : best));
    const third = towns.reduce((best, town) => (Math.min(far(town, city), far(town, second)) > Math.min(far(best, city), far(best, second)) ? town : best));

    return [city, second, third].map((town) => {
        const edge = SETTLEMENT_KINDS[town.kind].radius;
        const [x, y] = nearestFree(squaresOf(world.maps.town), [Math.round(town.at[0] - edge + 12), Math.round(town.at[1])], { within: 40 });

        return { town, place: { x: x + 0.5, y: y + 0.5, facing: 0 } };
    });
}

// The chunks a box of squares touches, by their keys
function chunksOf([x0, y0, x1, y1]) {
    const keys = [];

    for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(CHUNKS - 1, Math.floor(y1 / CHUNK)); cy++) {
        for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(CHUNKS - 1, Math.floor(x1 / CHUNK)); cx++) {
            keys.push(cy * CHUNKS + cx);
        }
    }

    return keys;
}

describe("where one coming in would stand (core/host.js whereFor, soon's coming)", () => {
    let kept;

    before(() => {
        kept = keptPlaces();
    });

    it("is where they were when they left, or where they'd come in new, as join takes them; and nothing changes for the asking", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.populate();

        const [{ place }] = kept;
        const [made, sum, snapshot] = [world.maps.town.chunks.size, host.checksum(), encode(host.snapshot())];
        const [sx, sy] = world.spawns.player;
        const elves = startFor(world.plan, "elf").at;

        assert.deepEqual(host.whereFor({ place }), [place.x, place.y]);
        assert.deepEqual(host.whereFor({}), [sx + 0.5, sy + 0.5], "new: the world's start");
        assert.deepEqual(host.whereFor({ place: { x: 1, y: Number.NaN, facing: 0 } }), [sx + 0.5, sy + 0.5], "a place that isn't one: as new");
        assert.deepEqual(host.whereFor({ square: [Math.round(elves[0]), Math.round(elves[1])], map: "town" }), [Math.round(elves[0]) + 0.5, Math.round(elves[1]) + 0.5], "another people's start");
        assert.equal(host.whereFor({ square: [3, 3], map: "tavern" }), null, "not out in the world: nowhere to say");

        // (And join stands them there)
        const where = host.whereFor({ place });

        assert.deepEqual([world.maps.town.chunks.size, host.checksum(), encode(host.snapshot())], [made, sum, snapshot]);
        host.join({ id: "p1", ...guest("Ada"), place });
        assert.deepEqual([host.battle.actor("p1").x, host.battle.actor("p1").y], where);
    });

    it("has the ground a town would stand its people on as they arrive wanted before they're in, said to be theirs, with no player in the world at all", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.populate();

        const [{ town, place }, { place: other }] = kept;
        const edge = SETTLEMENT_KINDS[town.kind].radius;
        const [sum, made] = [host.checksum(), world.maps.town.chunks.size];
        const muster = [Math.floor(town.at[0] - edge - SOON.town), Math.floor(town.at[1] - edge - SOON.town), Math.ceil(town.at[0] + edge + SOON.town), Math.ceil(town.at[1] + edge + SOON.town)];

        assert.deepEqual(host.soon(), { around: [], boxes: [], dungeons: [], theirs: [], foreseen: [] }, "no one in, no one coming: nothing");

        const { around, boxes, dungeons, theirs } = host.soon([[place.x, place.y], [other.x, other.y]]);

        assert.deepEqual([around, dungeons], [[], []], "those are the players' own");
        assert.equal(theirs.length, 2);
        assert.ok(theirs[0].some((box) => String(box) === String(muster)), "the city's soldiers' ground, the first's");
        assert.ok(!theirs[1].some((box) => String(box) === String(muster)), "not the second's, in another town");
        assert.ok(theirs[1].length > 0, "who has their own town's");
        assert.deepEqual([...new Set(theirs.flat().map(String))].sort(), [...new Set(boxes.map(String))].sort(), "every box someone's, no one in the world");
        assert.deepEqual([host.checksum(), world.maps.town.chunks.size], [sum, made], "nothing changed, nothing made");

        // (As a player stood there would have it wanted: the same boxes)
        host.join({ id: "p1", ...guest("Ada"), place });
        assert.ok(!host.mustered.has(town.id), "(not mustered till the world's next looked round)");
        assert.deepEqual(host.soon().boxes.map(String).sort(), theirs[0].map(String).sort());
        assert.ok(MUSTER.near > 0);
    });
});

describe("waiting for one's ground (core/netplay.js Session ground, coming)", () => {
    // A world opened as a world server opens it, two let in at once, each who says hello a hero
    // it keeps (`places`, by peer: where they were), by a clock the test moves
    function opened(places = {}) {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.populate();

        const game = { host, time: 0, sent: [], made: new Set() };
        const hosting = new Hosting(host, { send: (peer, text) => game.sent.push({ peer, kind: decode(text).kind, text }), clock: () => game.time });

        hosting.welcomes = 2;
        hosting.characterOf = (peer, character) => {
            const brought = characterFrom(character);

            return brought && { ...brought, ...(places[peer] ? { place: places[peer] } : {}) };
        };

        return Object.assign(game, {
            hosting,
            look: () => {
                host.advance(STEP_MS);
                hosting.flush();
                game.time += STEP_MS;
            },
            welcomed: () => game.sent.filter(({ kind }) => kind === "welcome").map(({ peer }) => peer),
            placesTold: (peer) => game.sent.filter((one) => one.kind === "queued" && one.peer === peer).map(({ text }) => decode(text).place),
        });
    }

    let kept;

    before(() => {
        kept = keptPlaces();
    });

    it("says where each waiting will stand, in their order: a kept hero's place, a newcomer's start", () => {
        const [{ place: a }, { place: b }] = kept;
        const game = opened({ p1: a, p3: b });
        const { host, hosting } = game;
        const elves = startFor(host.world.plan, "elf").at;

        assert.deepEqual(hosting.coming(), []);
        hosting.hear("p1", hello("One"));
        hosting.hear("p2", hello("Two", "elf"));
        hosting.hear("p3", hello("Three"));
        hosting.hear("p4", hello("Four"));
        assert.deepEqual(hosting.coming(), [[a.x, a.y], [Math.round(elves[0]) + 0.5, Math.round(elves[1]) + 0.5], [b.x, b.y], host.world.spawns.player.map((v) => v + 0.5)]);
        assert.equal(host.players.size, 0, "no one's in for the asking");

        // (Those let in are no longer coming; nor one who's gone)
        game.look();
        assert.deepEqual(game.welcomed(), ["p1", "p2"]);
        hosting.gone("p4");
        assert.deepEqual(hosting.coming(), [[b.x, b.y]]);
    });

    it("lets one in once their ground's said to be made, those behind them meanwhile, and they keep their place in the line", () => {
        const [{ place: a }, { place: b }] = kept;
        const game = opened({ p1: a, p2: b, p3: a, p4: a });
        const { hosting } = game;
        const asked = [];

        hosting.ground = (place, peer) => {
            asked.push([peer, place]);

            return game.made.has(peer);
        };
        game.made.add("p2").add("p4");

        for (const peer of ["p1", "p2", "p3", "p4"]) {
            hosting.hear(peer, hello(peer));
        }

        game.look();
        assert.deepEqual(game.welcomed(), ["p2", "p4"], "those whose ground's made, past those whose isn't");
        assert.deepEqual([...hosting.waiting.keys()], ["p1", "p3"]);
        assert.deepEqual([game.placesTold("p1"), game.placesTold("p3")], [[1], [2]]);
        assert.deepEqual(asked[0], ["p1", [a.x, a.y]], "asked of where they'd stand");

        // (Their places free, and p1's ground made: p1; p3 a look after theirs is)
        hosting.hear("p2", encode({ kind: "ready" }));
        hosting.hear("p4", encode({ kind: "ready" }));
        game.look();
        assert.deepEqual(game.welcomed(), ["p2", "p4"], "room, but no ground: no one");
        game.made.add("p1");
        game.look();
        assert.deepEqual(game.welcomed(), ["p2", "p4", "p1"]);
        assert.deepEqual(game.placesTold("p3"), [2, 1]);
        game.made.add("p3");
        game.look();
        assert.deepEqual(game.welcomed(), ["p2", "p4", "p1", "p3"]);
    });

    it("waits no longer than WELCOMES.timeout after their hello: then they're let in as ever", () => {
        const [{ place }] = kept;
        const game = opened({ p1: place, p2: place });
        const { hosting } = game;

        hosting.ground = () => false;
        hosting.hear("p1", hello("One"));

        // (p2's hello half the wait later)
        const looks = WELCOMES.timeout / STEP_MS;
        const came = {};

        for (let look = 1; look <= looks * 2 && Object.keys(came).length < 2; look++) {
            if (look === looks / 2) {
                hosting.hear("p2", hello("Two"));
            }

            game.look();

            for (const peer of game.welcomed()) {
                came[peer] ??= look;
            }
        }

        // (Each at the first look WELCOMES.timeout after their hello, the clock moving a step a look)
        assert.deepEqual(came, { p1: looks + 1, p2: looks / 2 + looks });
    });

    it("keeps no one waiting where no one says whether their ground's made (a player's own world), nor one with nowhere to say, nor one taking over theirs in the world", () => {
        const [{ place }] = kept;
        const plain = opened({ p1: place, p2: place });

        plain.hosting.hear("p1", hello("One"));
        plain.hosting.hear("p2", hello("Two"));
        plain.look();
        assert.deepEqual(plain.welcomed(), ["p1", "p2"], "no ground asked after: let in at the next look, as ever");

        // (One who can't come in at all is told so in their turn, not kept waiting on ground)
        const game = opened({ p1: place });
        const { hosting } = game;

        hosting.ground = () => false;
        hosting.characterOf = (peer, character) => (peer === "p2" ? null : { ...characterFrom(character), place });
        hosting.hear("p1", hello("One"));
        hosting.hear("p2", hello("Two"));
        assert.deepEqual(hosting.coming(), [[place.x, place.y]]);
        game.look();
        assert.deepEqual(game.welcomed(), []);
        assert.deepEqual(game.sent.filter(({ kind }) => kind === "refused").map(({ peer }) => peer), ["p2"]);
        assert.deepEqual([...hosting.waiting.keys()], ["p1"]);

        // (And one whose hero's in the world already, on another link, takes it over where it
        // stands: a world server's players, each known by their own id)
        const server = opened({ p1: place, p9: place });

        server.hosting.byCharacter = false;
        server.hosting.idOf = () => "K7.1";
        server.hosting.hear("p1", hello("One"));
        server.look();
        assert.deepEqual(server.welcomed(), ["p1"]);
        server.hosting.ground = () => false;
        server.hosting.hear("p9", hello("One"));
        assert.deepEqual(server.hosting.coming(), [], "theirs is in already: no ground to make");
        server.look();
        assert.deepEqual(server.welcomed(), ["p1", "p9"]);
        assert.equal(decode(server.sent.findLast(({ kind }) => kind === "welcome").text).took, true);
    });
});

describe("ground made ahead for those waiting to come in (server/ahead.js expect, grounded)", () => {
    const PEERS = ["p1", "p2", "p3", "p4"];
    // How many looks after their welcome each says they're ready, and how often what's wanted is
    // made between two steps (a world server looks at its world twice a step)
    const LOADING = 3;
    const PUMPS = 2;
    let kept;
    let made;
    let unmade;

    // A storm on a world no one's in: four say hello at once, three heroes kept in three towns far
    // apart and a fourth beside the first, let in two at a time, each ready LOADING looks after
    // their welcome. With `ahead`, their ground's made ahead and each is let in once it is; without,
    // nothing's made for them till they're in, and each is let in at the look `schedule` says (the
    // other run's: so the two worlds are let into alike). The maker's clock is a count of its own
    // askings, so each pump makes the same whatever the machine. Played till all are in and
    // `after` looks more; each look's kept: { sum, sent, chunks, tiles (made inside the step), in }
    function storm({ ahead, schedule = null, after: more = 30 }) {
        const world = buildWorld({ seed: 2 });
        const overworld = world.maps.town;
        const navigation = navigatorOf(overworld);
        const host = new Host(world, { populate: false });

        host.populate();

        const game = { time: 0, look: 0, ticks: 0, stepping: false, inSteps: 0, sent: [], came: new Map() };
        const hosting = new Hosting(host, { send: (peer, text) => game.sent.push(`${peer} ${text}`), clock: () => game.time });
        const runner = new WorldRunner(host, { hosting });
        const places = { p1: kept[0].place, p2: kept[1].place, p3: kept[2].place, p4: { ...kept[0].place, y: kept[0].place.y + 3 } };
        const groundChunk = overworld.ground.chunk.bind(overworld.ground);

        overworld.ground.chunk = (cx, cy) => {
            if (game.stepping && !overworld.ground.peek(cx, cy)) {
                game.inSteps++;
            }

            return groundChunk(cx, cy);
        };

        Ahead.coming = ahead;

        const maker = new Ahead(world, { host, clock: () => game.ticks++ });

        hosting.welcomes = 2;
        hosting.characterOf = (peer, character) => ({ ...characterFrom(character), place: places[peer] });
        hosting.ground = schedule ? (_place, peer) => game.look >= schedule.get(peer) : ([x, y]) => maker.grounded(x, y);
        hosting.onJoin = (_id, peer) => game.came.set(peer, game.look);

        const played = [];
        let last = Infinity;

        for (game.look = 0; game.look < Math.min(last + more, 4000); game.look++) {
            if (game.look === 0) {
                for (const peer of PEERS) {
                    hosting.hear(peer, hello(peer));
                }
            }

            for (const [peer, came] of game.came) {
                if (game.look === came + LOADING) {
                    hosting.hear(peer, encode({ kind: "ready" }));
                }
            }

            const [chunks, tiles, aheadOf] = [game.inSteps, navigation.baked, maker.made];

            game.stepping = true;
            runner.advance(STEP_MS);
            game.stepping = false;
            game.time += STEP_MS;
            played.push({ sum: host.checksum(), sent: game.sent.splice(0), chunks: game.inSteps - chunks, tiles: navigation.baked - tiles, in: host.players.size });

            if (game.came.size === PEERS.length && last === Infinity) {
                last = game.look;
            }

            maker.expect(hosting.coming());

            for (let k = 0; k < PUMPS; k++) {
                runner.bakeAhead(maker);
            }

            played.at(-1).ahead = maker.made - aheadOf;
        }

        maker.dispose();
        Ahead.coming = true;

        return { host, hosting, maker, played, came: game.came, places, overworld };
    }

    before(() => {
        kept = keptPlaces();
        made = storm({ ahead: true });
        unmade = storm({ ahead: false, schedule: made.came });
    });

    after(() => {
        Ahead.coming = true;
    });

    it("makes each one's ground while they wait, and lets them in when it's made: the first to say hello first, one whose ground another's made at once", () => {
        const { came, played } = made;

        assert.deepEqual([...came.keys()].sort(), PEERS, "all in");
        assert.ok(came.get("p1") > 1, `p1 waited for their ground (${came.get("p1")} looks)`);
        assert.ok(came.get("p1") < came.get("p2") && came.get("p2") < came.get("p3"), `in the order they waited (${[...came]})`);
        // (p4 stands beside p1, on the same ground: in as soon as there's room, before p2 or p3)
        assert.ok(came.get("p4") <= came.get("p2"), `p4 at look ${came.get("p4")}, p2 at ${came.get("p2")}`);
        assert.ok(Math.max(...came.values()) * STEP_MS < WELCOMES.timeout, "none let in for having waited too long");
        assert.ok(played.slice(0, came.get("p1")).reduce((sum, look) => sum + look.ahead, 0) >= (2 * AHEAD.coming.chunks + 1) * (2 * AHEAD.coming.chunks + 1), "the chunks round p1 made between steps before they're in");
    });

    it("has their ground made when it says so: the chunks round them, their town's people's, and the tiles near them", () => {
        // (A world where it's all made at once, to ask after)
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.populate();

        const maker = new Ahead(world, { host });
        const [{ place, town }] = kept;
        const overworld = world.maps.town;
        const navigation = navigatorOf(overworld);
        const edge = SETTLEMENT_KINDS[town.kind].radius;
        const wanted = [...chunksOf([place.x - AHEAD.coming.chunks * CHUNK, place.y - AHEAD.coming.chunks * CHUNK, place.x + AHEAD.coming.chunks * CHUNK, place.y + AHEAD.coming.chunks * CHUNK]), ...chunksOf([town.at[0] - edge - SOON.town, town.at[1] - edge - SOON.town, town.at[0] + edge + SOON.town, town.at[1] + edge + SOON.town])];
        const isMade = (key) => overworld.made((key % CHUNKS) * CHUNK, Math.floor(key / CHUNKS) * CHUNK, (key % CHUNKS) * CHUNK, Math.floor(key / CHUNKS) * CHUNK);

        assert.equal(maker.grounded(place.x, place.y), false, "nothing made");
        maker.expect([[place.x, place.y]]);
        maker.pump();
        assert.equal(maker.wanted, new Set([...chunksOf([place.x - AHEAD.coming.chunks * CHUNK, place.y - AHEAD.coming.chunks * CHUNK, place.x + AHEAD.coming.chunks * CHUNK, place.y + AHEAD.coming.chunks * CHUNK]), ...host.soon([[place.x, place.y]]).boxes.flatMap(chunksOf)]).size, "the chunks round them and under what their town wants, each once");

        let pumps = 0;

        while (!maker.grounded(place.x, place.y) && pumps++ < 100000) {
            assert.ok(!wanted.every(isMade) || maker.navBaker.queue.length + maker.navBaker.asked.size > 0 || !maker.chunks.length, "(not said till it's so)");
            maker.pump();
        }

        assert.ok(maker.grounded(place.x, place.y), "made");
        assert.ok(wanted.every(isMade), "every chunk round them and under their town's people");

        const { tile } = navigation.measures;

        for (const [dx, dy] of [[0, 0], [-AHEAD.coming.reach, 0], [AHEAD.coming.reach, AHEAD.coming.reach], [0, -AHEAD.coming.reach]]) {
            assert.ok(navigation.has(Math.floor((place.x + dx) / tile), Math.floor((place.y + dy) / tile)), `the tile ${dx}, ${dy} m from them`);
        }

        // (No longer expected: what was theirs is no one's, and let go of)
        maker.expect([]);
        maker.pump();
        assert.equal(maker.wanted, 0);
        assert.deepEqual(maker.chunks, []);
        maker.dispose();

        // (The switch: nothing made for them, and no one kept waiting)
        Ahead.coming = false;

        const cold = new Ahead(buildWorld({ seed: 2 }), { host: null });

        cold.expect([[place.x, place.y]]);
        cold.pump();
        assert.deepEqual([cold.coming, cold.chunks, cold.grounded(place.x, place.y)], [[], [], true]);
        cold.dispose();
        Ahead.coming = true;
    });

    it("leaves the steps they come in on no ground to make, where without it each made their own", () => {
        // (But the world's opening step, before anyone's hello is answered: its own patrol's
        // way found, the same either way, far from where anyone will stand)
        const inSteps = ({ played }) => played.slice(1).reduce((sum, look) => sum + look.chunks, 0);
        const tilesIn = ({ played }) => played.slice(1).reduce((sum, look) => sum + look.tiles, 0);

        assert.equal(unmade.played[0].chunks, made.played[0].chunks);
        assert.equal(inSteps(made), 0, "made ahead: no step makes a chunk");
        assert.ok(inSteps(unmade) >= 3 * 4, `not made ahead: the steps make them (${inSteps(unmade)})`);
        assert.equal(tilesIn(made), 0, "nor bakes a tile of the navigation's");
        assert.ok(tilesIn(unmade) >= 3, `where they baked their own (${tilesIn(unmade)})`);

        // (Each town brought to life by their coming, either way)
        for (const { town } of kept) {
            assert.ok(made.host.mustered.has(town.id) && unmade.host.mustered.has(town.id), `(${town.id} mustered)`);
        }
    });

    it("is the same world step for step, and sends the same, whether their ground was made ahead or by the steps", () => {
        assert.deepEqual([...unmade.came], [...made.came], "(let in at the same looks)");
        assert.equal(unmade.played.length, made.played.length);

        for (const [look, one] of made.played.entries()) {
            assert.equal(unmade.played[look].sum, one.sum, `the world after look ${look}`);
            assert.deepEqual(unmade.played[look].sent, one.sent, `what was sent at look ${look}`);
        }

        assert.equal(encode(unmade.host.snapshot()), encode(made.host.snapshot()));
        assert.ok(made.played.some(({ sent }) => sent.some((text) => text.includes('"kind":"welcome"'))), "(welcomes among it)");
    });
});

describe("the heroes last in a world (server/storage/heroes.js lastPlaces)", () => {
    it("says where those kept together last were, the latest first, and no one kept long before them", async () => {
        const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-last-"));

        try {
            const heroes = new KeptHeroes(path.join(folder, "heroes"));
            const keep = async (player, slot, place, at) => {
                await heroes.keep(player, { ...guest(player), ...(place ? { place } : {}) }, { slot });
                await utimes(path.join(folder, "heroes", player, `${slot}.json`), at / 1000, at / 1000);
            };
            const now = Date.UTC(2026, 10, 12);

            assert.deepEqual(await heroes.lastPlaces(), [], "none kept");
            await keep("early", 1, { x: 1.5, y: 2.5, facing: 0 }, now - 3600000);
            await keep("ada", 1, { x: 10.5, y: 20.5, facing: 1 }, now - 4000);
            await keep("ada", 2, { x: 30.5, y: 40.5, facing: 0 }, now - 86400000);
            await keep("bea", 3, { x: 50.5, y: 60.5, facing: 0 }, now);
            await keep("cat", 1, null, now - 1000);

            assert.deepEqual(await heroes.lastPlaces({ within: 10000 }), [[50.5, 60.5], [10.5, 20.5]], "those kept within ten seconds of the last, who have a place");
            assert.deepEqual(await heroes.lastPlaces({ within: 10000, most: 1 }), [[50.5, 60.5]]);
            assert.deepEqual(await heroes.lastPlaces({ within: 2 * 3600000 }), [[50.5, 60.5], [10.5, 20.5], [1.5, 2.5]]);
        } finally {
            await rm(folder, { recursive: true, force: true });
        }
    });
});
