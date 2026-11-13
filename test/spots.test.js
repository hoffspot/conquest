// Where soldiers are stood by a way looked for there and then (client/js/core/host.js #spots,
// Host.widening): an invasion's lines and its reinforcements each take a free square only if
// there's a way from it to where the lines meet. Every copy of the world asks its own navigation
// mesh for that way, and none of them is sent, so the mesh of a world server (server/ahead.js:
// widenLater) must answer as a browser's does, or the server and the games joined to it stand
// the same soldiers on other squares.
//
// First, what a way over the mesh goes by that a snapshot doesn't carry, and why that doesn't
// reach a joined copy for the ways that are walked:
//
//   1. The mesh alone. Navigation.path makes sure of the tiles in the box between a way's ends
//      (MARGIN round it) and then looks over every tile the mesh has, those outside the box too
//      (core/navigation.js #path, #way). So the way found goes by which other tiles happen to
//      be in: a shorter way round by a tile next to the box is taken only by a mesh that has it.
//   2. Two hosts, neither replaying: one carried on from the other's snapshot (Host.restore:
//      its mesh begun again with no tiles) finds another way for the same move order, and the
//      worlds part. No such pair plays together (test/bearing.test.js carries one on as a copy).
//   3. A host and a joined copy (core/netplay.js): the copy takes the host's ways (battle.js
//      #route, #replayed) and finds none of its own, so the same order leaves them the same.
//
// Then the ways that aren't sent, #spots' own:
//
//   4. The mesh's answer `now` on a world server's mesh is a browser's, where its answer as for
//      any other way falls short.
//   5. A world server's host and a copy joined to it stand an invasion's lines and its
//      reinforcements on the same squares; with Host.widening off, as it was, they don't, and
//      the copy's found astray and sent the world again.
//   6. A browser's host plays the same with Host.widening on or off.
//   7. The same with the server's own Ahead and its worker (server/ahead.js).
//
//     node --import ./test/plan-cache.js --test test/spots.test.js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { Navigation, navigatorOf } from "../client/js/core/navigation.js";
import { Hosting, Joining } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode, encode } from "../client/js/core/wire.js";
import { layoutOf } from "../scripts/load.js";
import { Ahead } from "../server/ahead.js";
import { installWorkers } from "../server/workers.js";
import { unexpired } from "./helpers.js";

installWorkers();

// Host.widening's expiry (contribution.md, section 3, *Two netcodes side by side*): off, it
// plays a fault, so it's to be taken out once nothing's left to compare with
const EXPIRES = "2027-11-12";


// Seed 2, in its first town: a walk whose box is two tiles (166, 207 and 167, 207), with a
// shorter way round by the two tiles north of them (166, 206 and 167, 206)
const FROM = [5361.5636119999035, 6639.250570629885];
const TO = [5331.5, 6635.5];
const NORTH = [
    [166, 206],
    [167, 206],
];

const HERO = Object.freeze({ shape: {}, look: {}, weapon: "sword", boots: false });
const lengthOf = (way) => way.reduce((sum, [x, y], k) => sum + (k ? Math.hypot(x - way[k - 1][0], y - way[k - 1][1]) : 0), 0);
const flat = (way) => JSON.stringify(way.map(([x, y]) => [x, y]));

// A host of seed 2 with one player standing at FROM
function hostAt() {
    const world = buildWorld({ seed: 2 });
    const [{ race }] = layoutOf(world.plan, 6, "towns");
    const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });

    host.join({ id: "p1", hero: { ...HERO, name: "P1", race }, square: [Math.floor(FROM[0]), Math.floor(FROM[1])], map: "town", role: "owner" });
    host.populate();

    return host;
}

// The ways a host's battle finds from now on, as they're found: [[time, id, way], ...]
function waysOf(host) {
    const ways = [];
    const told = host.battle.onPath;

    host.battle.onPath = (id, way) => {
        ways.push([host.battle.time, id, JSON.stringify(way)]);
        told?.(id, way);
    };

    return ways;
}

describe("a way found over the mesh goes by what's baked beyond its box (core/navigation.js #way)", () => {
    it("1. is another way on a mesh that has the tiles next to the box than on one with the box's alone", () => {
        const bare = navigatorOf(buildWorld({ seed: 2 }).maps.town);
        const more = navigatorOf(buildWorld({ seed: 2 }).maps.town);

        NORTH.forEach(([tx, ty]) => more.ensure(tx, ty));

        const [short, long] = [more.path(FROM, TO), bare.path(FROM, TO)];

        console.log(`  1. box's tiles alone: ${[...bare.tiles.values()].map(({ tx, ty }) => `${tx},${ty}`).join(" ")}: ${lengthOf(long).toFixed(1)} m, ${long.length} corners; with ${NORTH.join(" ")} too: ${lengthOf(short).toFixed(1)} m, ${short.length} corners`);
        assert.equal(bare.tiles.size, 2, "the bare mesh made the box's two tiles and no more");
        assert.ok(NORTH.every(([tx, ty]) => !bare.has(tx, ty)));
        assert.deepEqual([short.at(-1)[0], short.at(-1)[1]], TO, "both get there");
        assert.deepEqual([long.at(-1)[0], long.at(-1)[1]], TO, "(so the bare mesh never looks further: #path's WIDER is only for a way that falls short)");
        assert.notEqual(flat(short), flat(long), "by another way");
        assert.ok(lengthOf(short) < lengthOf(long) - 10);

        // (Not the order the tiles went in, nor Detour's references: the same tiles, the same way)
        NORTH.toReversed().forEach(([tx, ty]) => bare.ensure(tx, ty));
        assert.equal(flat(bare.path(FROM, TO)), flat(short), "the same tiles put in in another order give the same way");
    });

    it("2. parts a host from one carried on from its snapshot, neither taking the other's ways (no such pair plays together)", () => {
        const first = hostAt();

        // (The first host's mesh has the tiles to the north, as it would had anyone walked there)
        NORTH.forEach(([tx, ty]) => navigatorOf(first.battle.maps.town).ensure(tx, ty));

        for (let step = 0; step < 20; step++) {
            first.advance(STEP_MS);
        }

        const second = Host.restore(buildWorld({ seed: 2 }), decode(encode(first.snapshot())));

        assert.equal(second.checksum(), first.checksum(), "the same world to begin with");

        const ways = [waysOf(first), waysOf(second)];
        let parted = -1;

        for (const host of [first, second]) {
            assert.equal(host.command("p1", { type: "move", to: [Math.floor(TO[0]), Math.floor(TO[1])] }).ok, true);
        }

        for (let step = 0; step < 400 && parted < 0; step++) {
            first.advance(STEP_MS);
            second.advance(STEP_MS);
            parted = first.checksum() === second.checksum() ? -1 : step;
        }

        const [mine, theirs] = ways.map((found) => found.find(([, id]) => id === "p1"));

        console.log(`  2. the move's way: ${JSON.parse(mine[2]).length} corners on the host, ${JSON.parse(theirs[2]).length} on the one carried on; the worlds' sums part ${parted} steps after the order`);
        assert.notEqual(mine[2], theirs[2], "another way for the same order");
        assert.ok(parted >= 0, "and the worlds part");
        assert.ok(NORTH.every(([tx, ty]) => !navigatorOf(second.battle.maps.town).has(tx, ty)), "the one carried on never made the tiles to the north");
    });

    it("3. doesn't part a host from a joined copy, which takes the host's ways and finds none", () => {
        const host = hostAt();
        const post = [];
        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
        const joining = new Joining({ send: (text) => post.push({ from: "peer", text }) });
        const deliver = () => {
            while (post.length) {
                const { from, text } = post.shift();

                from ? hosting.hear(from, text) : joining.hear(text);
            }
        };
        let astray = 0;
        const play = (steps) => {
            for (let step = 0; step < steps; step++) {
                host.advance(STEP_MS);
                hosting.flush();
                deliver();

                while (joining.step()) {
                    // (every step it's been sent)
                }

                astray += joining.astray ? 1 : 0;
                deliver();
            }
        };

        NORTH.forEach(([tx, ty]) => navigatorOf(host.battle.maps.town).ensure(tx, ty));
        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn", race: host.players.get("p1").hero?.race ?? "human" }, progress: { gold: 50 } });
        deliver();
        play(20);

        const copy = navigatorOf(joining.host.battle.maps.town);
        const path = Navigation.prototype.path;
        let found = 0;

        Navigation.prototype.path = function (...args) {
            found += this === copy ? 1 : 0;

            return path.apply(this, args);
        };

        try {
            assert.equal(host.command("p1", { type: "move", to: [Math.floor(TO[0]), Math.floor(TO[1])] }).ok, true);
            play(400);
        } finally {
            Navigation.prototype.path = path;
        }

        console.log(`  3. joined: the copy found ${found} ways of its own, ${joining.checks} checks, astray in ${astray} steps; it never made the tiles to the north: ${NORTH.every(([tx, ty]) => !copy.has(tx, ty))}`);
        assert.equal(found, 0, "the copy found no way of its own");
        assert.equal(astray, 0, "never astray");
        assert.ok(joining.checks >= 100);
        assert.equal(joining.host.checksum(), host.checksum());
    });
});


// Seed 1, its first town, an invasion's town line: a square in a yard and where the lines meet.
// The way falls short over the tiles between them and gets there over those a ring further round
const YARD = [2822.5, 5011.5];
const MEET = [2871.49169921875, 5053.1044921875];

// With Host.widening off, as it was, what `play` gives
async function unwidened(play) {
    assert.equal(Host.widening, true, "Host.widening is on");
    Host.widening = false;

    try {
        return await play();
    } finally {
        Host.widening = true;
    }
}

// A host of `seed` with a player in its first town and a copy joined, an invasion called up and
// played for `steps`. The host's mesh is a browser's ("browser"); or as a world server's is
// ("server": somewhere to send tiles and widenLater, as server/ahead.js gives it, the tiles sent
// baked after the step that sent them); or the server's own ("ahead": an Ahead with its worker,
// all it wants round the player made before the invasion). Returns how many spots' ways the
// copy looked for itself (`own`) and the host did (`all`; `asked`, in the invasion's own step),
// how many of the copy's ended elsewhere than the host's same asking, for how many steps the
// copy was astray, whether the two ended the same, how many soldiers came up as reinforcements,
// and what the host's steps were (their events and sums)
async function invaded(seed, mesh, steps = 40) {
    const world = buildWorld({ seed });
    const [{ race, at }] = layoutOf(world.plan, 6, "towns");
    const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });

    host.join({ id: "p1", hero: { ...HERO, name: "P1", race }, square: at, map: "town", role: "owner" });
    host.populate();

    const navigation = navigatorOf(host.battle.maps.town);
    const sent = [];
    const ahead = mesh === "ahead" ? new Ahead(world, { host }) : null;

    if (mesh === "server") {
        navigation.later = (tx, ty) => sent.push([tx, ty]);
        navigation.widenLater = true;
    }

    const post = [];
    const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
    const joining = new Joining({ send: (text) => post.push({ from: "peer", text }) });
    const deliver = () => {
        while (post.length) {
            const { from, text } = post.shift();

            from ? hosting.hear(from, text) : joining.hear(text);
        }
    };
    const turn = () => new Promise((resolve) => setTimeout(resolve, 2));
    const played = [];
    let [astray, reinforced] = [0, 0];
    const play = async (count) => {
        for (let step = 0; step < count; step++) {
            const events = host.advance(STEP_MS);

            played.push(`${encode(events)}${host.checksum()}`);
            reinforced += events.filter((event) => event.type === "invasion" && event.change === "reinforced").reduce((sum, { ids }) => sum + ids.length, 0);
            sent.splice(0).forEach(([tx, ty]) => navigation.ensure(tx, ty));

            // (The server's own: between steps, and its worker's answers given their turn)
            if (ahead) {
                ahead.pump();
                await turn();
            }

            hosting.flush();
            deliver();

            while (joining.step()) {
                // (every step it's been sent)
            }

            astray += joining.astray ? 1 : 0;
            deliver();
        }
    };

    try {
        assert.equal(navigation.widenLater, mesh !== "browser", "(the mesh as it's meant)");
        joining.onWelcome = ({ seed: worldSeed, race: people, snapshot }) => joining.attach(Host.restore(buildWorld({ seed: worldSeed, race: people }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn", race }, progress: { gold: 50 } });
        deliver();
        await play(20);

        for (const end = performance.now() + 60000; ahead && !ahead.settled && performance.now() < end; ) {
            ahead.pump();
            await turn();
        }

        const copy = navigatorOf(joining.host.battle.maps.town);
        const path = Navigation.prototype.path;
        const ends = { host: [], copy: [] };

        Navigation.prototype.path = function (...args) {
            const way = path.apply(this, args);

            // (#spots' askings alone: the only ones said whether they're for now)
            (args[2]?.now === undefined ? [] : this === copy ? ends.copy : this === navigation ? ends.host : []).push(JSON.stringify(way.at(-1) ?? null));

            return way;
        };

        try {
            assert.equal(host.command("p1", { type: "invade" }).ok, true);
            await play(1);

            const asked = ends.host.length;

            await play(steps);

            return { own: ends.copy.length, asked, all: ends.host.length, elsewhere: ends.copy.filter((end, k) => end !== ends.host[k]).length, astray, same: joining.host.checksum() === host.checksum(), checks: joining.checks, reinforced, played, snapshot: encode(host.snapshot()) };
        } finally {
            Navigation.prototype.path = path;
        }
    } finally {
        ahead?.dispose();
    }
}

describe("a way asked for now on a world server's mesh (core/navigation.js path's `now`)", () => {
    it("4. is a browser's, where asked as any other it falls short and the tiles further round are sent on", () => {
        const browser = navigatorOf(buildWorld({ seed: 1 }).maps.town);
        const server = navigatorOf(buildWorld({ seed: 1 }).maps.town);
        const sent = [];

        server.later = (tx, ty) => sent.push([tx, ty]);
        server.widenLater = true;

        const there = browser.nearest(MEET) ?? MEET;
        const [short, baked] = [server.path(YARD, there), server.baked];
        const whole = browser.path(YARD, there);

        console.log(`  4. as any other way: ${lengthOf(short).toFixed(1)} m and ${sent.length} tiles sent on; a browser's: ${lengthOf(whole).toFixed(1)} m over ${browser.tiles.size} tiles`);
        assert.ok(Math.hypot(whole.at(-1)[0] - there[0], whole.at(-1)[1] - there[1]) < 0.01, "a browser's gets there");
        assert.ok(Math.hypot(short.at(-1)[0] - there[0], short.at(-1)[1] - there[1]) > 10, "a world server's falls short");
        assert.ok(sent.length > 0, "the tiles further round sent on, none of them made");
        assert.ok(browser.tiles.size > server.tiles.size);

        // (Now: the same tiles made in the step, none sent on, and the same way)
        sent.splice(0);

        const now = server.path(YARD, there, { now: true });

        assert.equal(flat(now), flat(whole), "the same way as a browser's");
        assert.equal(sent.length, 0, "none sent on");
        assert.ok(server.baked > baked, "the tiles further round made here");
        assert.deepEqual([...server.tiles.keys()].sort(), [...browser.tiles.keys()].sort(), "the same tiles in");
        assert.equal(flat(browser.path(YARD, there, { now: true })), flat(whole), "(a browser's the same, asked either way)");

        // (To wait is still to wait: nothing made for it)
        const waiting = navigatorOf(buildWorld({ seed: 1 }).maps.town);

        waiting.later = (tx, ty) => sent.push([tx, ty]);
        assert.deepEqual(waiting.path(YARD, there, { wait: true, now: true }), []);
        assert.equal(waiting.baked, 0);
        assert.ok(sent.length > 0);
    });
});

describe("soldiers stood where there's a way from, on a world server and in the games joined to it (core/host.js #spots, Host.widening)", () => {
    it("5. stands an invasion's lines and its reinforcements on the same squares in both; as it was, the server passed over squares the copy took (seed 1)", async () => {
        const server = await invaded(1, "server", 1100);
        const [was, browser] = await unwidened(async () => [await invaded(1, "server"), await invaded(1, "browser")]);

        console.log(`  5. a world server's (widenLater): the copy looked for ${server.own} spots' ways itself (${server.asked} at the invasion), ${server.elsewhere} ending elsewhere than the server's, astray in ${server.astray} steps of 1,100, ${server.reinforced} come up as reinforcements`);
        console.log(`     as it was (Host.widening off): the server asked ${was.all} and the copy ${was.own}, ${was.elsewhere} ending elsewhere, astray in ${was.astray} steps; set right by the world sent again: ${was.same}. A browser's host, as it was: ${browser.elsewhere} and ${browser.astray}`);
        assert.ok(server.asked > 100 && server.own > server.asked, "the copy asks its own mesh for each soldier's spot's way, at the invasion and after: none of them sent");
        assert.equal(server.own, server.all, "as many as the server asks its own");
        assert.equal(server.elsewhere, 0, "each of the copy's ways ends where the server's does");
        assert.equal(server.astray, 0, "the copy's never astray");
        assert.ok(server.reinforced >= 10, `reinforcements came up (${server.reinforced})`);
        assert.equal(server.same, true);
        assert.ok(server.checks >= 200);

        // (The fault, as it was: the test bites)
        assert.ok(was.elsewhere > 0, "the server's way fell short where the copy's looked further");
        assert.ok(was.astray > 0, "and the copy was found astray");
        assert.equal(was.same, true, "(and set right)");

        // (A browser's host and its copy widened alike before, too)
        assert.equal(browser.elsewhere, 0);
        assert.equal(browser.astray, 0);
    });

    it("6. plays the same on a browser's host with Host.widening on or off: an invasion and its reinforcements, step for step (seed 1)", async () => {
        const on = await invaded(1, "browser", 1050);
        const off = await unwidened(() => invaded(1, "browser", 1050));

        assert.ok(on.reinforced >= 10 && on.asked > 100, `(an invasion's lines stood, ${on.reinforced} come up as reinforcements)`);
        assert.equal(on.played.length, 1071);
        assert.equal(
            on.played.findIndex((step, k) => step !== off.played[k]),
            -1,
            "the same events and the same sum each step",
        );
        assert.equal(on.snapshot, off.snapshot, "the world at the end");
        assert.deepEqual([on.own, on.all, on.elsewhere, on.astray, on.same], [off.own, off.all, 0, 0, true], "and its copy as it was");
    });

    it("7. stands them the same on a world server's own mesh, made ahead by its worker (server/ahead.js Ahead; seed 1)", async () => {
        const server = await invaded(1, "ahead");
        const was = await unwidened(() => invaded(1, "ahead"));

        console.log(`  7. the server's own Ahead: ${server.elsewhere} of the copy's ${server.own} ending elsewhere, astray in ${server.astray} steps; as it was: ${was.elsewhere} of ${was.own}, astray in ${was.astray}`);
        assert.ok(server.asked > 100);
        assert.equal(server.elsewhere, 0);
        assert.equal(server.astray, 0);
        assert.equal(server.same, true);
        assert.ok(was.elsewhere > 0 && was.astray > 0, "(as it was, they stood elsewhere)");
    });

    it("has a date after which Host.widening is taken out, not yet passed", () => {
        assert.equal(Host.widening, true, "on, unless a test says otherwise");
        unexpired("Host.widening", EXPIRES);
    });
});
