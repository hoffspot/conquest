// The broker (generated/world_server_plan.md §8.3, §12.3, §15 S7), over real sockets: a player's
// own world announced and listed, watched as it comes and goes; a joiner connected to it, the two
// passing signals (and no more than they may); relaying when they can't connect directly, or
// refused when the server doesn't relay; a host whose link drops keeping its world till it expires,
// and taking it back; and what it refuses (a bad announcement, too many from one address, another
// site's page, the broker turned off).
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { announcementOf, attachBroker, BROKER_LIMITS, BROKER_PROTOCOL } from "../server/broker.js";
import { WorldServer } from "../server/world-server.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const WORLD = Object.freeze({ name: "Ada's world", people: "human", players: 1, most: 8, net: 113, visibility: "listed", direct: true, local: true });

const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 10000) {
    const end = Date.now() + ms;

    while (!test()) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(10);
    }
}

// A world server on loopback, its broker's listings lasting `expire` ms, the STUN servers it tells of none
async function serve({ settings = {}, expire = BROKER_LIMITS.expire, signals = BROKER_LIMITS.signals } = {}) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-broker-"));

    made.push(folder);

    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, funnel: false, ice: [] });

    servers.push(server);
    await server.settings.change(settings);
    await server.listen(0, "127.0.0.1");
    server.broker.close();
    server.broker = attachBroker([server.http, server.https], server, { limits: { ...BROKER_LIMITS, expire, signals }, ice: [] });

    return server;
}

/**
 * A game's link to the broker: { lines, send(line), heard(start) (the last line so starting),
 * count(start), next(start, at) (the next line so starting not yet taken, or the `at`th: waited
 * for), close(code) }.
 */
async function open(server) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/broker`, BROKER_PROTOCOL);
    const link = { lines: [], closed: null, taken: new Map() };

    socket.onmessage = ({ data }) => link.lines.push(String(data));
    socket.onclose = ({ code }) => (link.closed = code);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error("refused"));
    });
    link.send = (line) => socket.send(line);
    link.heard = (start) => link.lines.findLast((line) => line.startsWith(start)) ?? null;
    link.count = (start) => link.lines.filter((line) => line.startsWith(start)).length;
    link.next = async (start, at = link.taken.get(start) ?? 0) => {
        await until(() => link.count(start) > at, `"${start}" (heard: ${JSON.stringify(link.lines.map((line) => line.slice(0, 60)))})`);
        link.taken.set(start, at + 1);

        return link.lines.filter((line) => line.startsWith(start))[at];
    };
    link.close = (code = 1000) => socket.close(code);

    return link;
}

// A host's world announced: [link, id, token]
async function announce(server, world = WORLD) {
    const host = await open(server);

    host.send(`announce\n${JSON.stringify(world)}`);

    const [, id, token] = (await host.next("announced")).split(" ");

    return [host, id, token];
}

describe("announcements", () => {
    it("keep what's said of a world, cut to size, and refuse what can't be one", () => {
        assert.deepEqual(announcementOf({ ...WORLD, name: `  ${"x".repeat(80)}  `, players: 20 }), { name: "x".repeat(60), people: "human", players: 8, most: 8, net: 113, visibility: "listed", direct: true, local: true, temporary: false });
        assert.equal(announcementOf({ ...WORLD, name: "" }), null);
        assert.equal(announcementOf({ ...WORLD, most: 0 }), null);
        assert.equal(announcementOf({ ...WORLD, net: "113" }), null);
        assert.equal(announcementOf({ ...WORLD, people: "<script>" }), null);
        assert.equal(announcementOf(null), null);
        assert.equal(announcementOf({ ...WORLD, visibility: "secret" }).visibility, "listed");
    });
});

describe("the broker", () => {
    it("says what STUN servers to try and whether it relays; lists a world as it's announced, kept, changed and withdrawn", async () => {
        const server = await serve();
        const watcher = await open(server);

        assert.deepEqual(JSON.parse((await watcher.next("broker ", 0)).slice(7)), { ice: [], relaying: true });
        watcher.send("watch");
        assert.equal(await watcher.next("seen ", 0), "seen []");

        const [host, id, token] = await announce(server);

        assert.match(id, /^[A-Z]{4}$/);

        const listed = JSON.parse((await watcher.next("+ ", 0)).slice(2));

        assert.deepEqual(listed, { id, name: "Ada's world", people: "human", players: 1, most: 8, net: 113, direct: true, through: false, near: true, temporary: false });

        // (Kept, saying how many are in it now: the watchers told)
        host.send(`keep ${id} ${token}\n${JSON.stringify({ players: 3 })}`);
        assert.equal(JSON.parse((await watcher.next("+ ", 1)).slice(2)).players, 3);

        // (On the status card too, as each caller would see it; and the broker's said there)
        const card = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/status`)).json();

        assert.deepEqual(card.server.broker, { path: "/broker", protocol: BROKER_PROTOCOL, relaying: true });
        assert.deepEqual(
            card.players.map((one) => [one.id, one.players]),
            [[id, 3]],
        );

        // (Kept as for its code alone: no longer listed)
        host.send(`keep ${id} ${token}\n${JSON.stringify({ visibility: "code" })}`);
        assert.equal(await watcher.next("- ", 0), `- ${id}`);
        host.send(`keep ${id} ${token}\n${JSON.stringify({ visibility: "listed" })}`);
        await watcher.next("+ ", 2);

        // (A keep with the wrong token isn't one)
        host.send(`keep ${id} ${"x".repeat(token.length)}`);
        assert.equal(await host.next("error"), "error gone");

        // (A newcomer sees it in the list)
        const late = await open(server);

        late.send("watch");
        assert.deepEqual(
            JSON.parse((await late.next("seen ", 0)).slice(5)).map((one) => one.id),
            [id],
        );

        host.send(`withdraw ${id}`);
        assert.equal(await watcher.next("- ", 1), `- ${id}`);
        assert.equal(server.broker.listings.size, 0);
        [watcher, late, host].forEach((link) => link.close());
    });

    it("lists a world that can't be reached directly as through the server while it relays, and only on the same network when it doesn't; a world for its code alone, never", async () => {
        const server = await serve();
        const [host, id] = await announce(server, { ...WORLD, direct: false, local: false });
        const [coded, codedId] = await announce(server, { ...WORLD, visibility: "code" });
        const watcher = await open(server);

        watcher.send("watch");

        const seen = JSON.parse((await watcher.next("seen ", 0)).slice(5));

        assert.deepEqual(
            seen.map((one) => [one.id, one.through]),
            [[id, true]],
        );

        // (Relaying turned off: hidden, and everyone told it no longer relays)
        await server.manage.changeSettings({ relaying: false });
        assert.equal(JSON.parse((await watcher.next("broker ", 1)).slice(7)).relaying, false);
        assert.equal(await watcher.next("seen ", 1), "seen []");

        // (On the same network, a world that can be reached there is listed still)
        const [local, localId] = await announce(server, { ...WORLD, direct: false, local: true });

        assert.equal(JSON.parse((await watcher.next("+ ", 0)).slice(2)).id, localId);

        // (One for its code alone can still be joined by it)
        const joiner = await open(server);

        joiner.send(`connect ${codedId.toLowerCase()}`);
        assert.match(await joiner.next("peer "), /^peer p\d+$/);
        [host, coded, local, watcher, joiner].forEach((link) => link.close());
    });

    it("connects a joiner to a world: each told the other's name for it, signals passed both ways, as many as an attempt may", async () => {
        const server = await serve({ signals: 4 });
        const [host, id] = await announce(server);
        const joiner = await open(server);

        joiner.send(`connect ${id}`);

        const peer = (await joiner.next("peer ")).split(" ")[1];
        const told = await host.next("peer ");

        assert.equal(told.split(" ")[1], peer);
        assert.deepEqual(JSON.parse(told.split(" ").slice(2).join(" ")), { near: true });

        const offer = JSON.stringify({ sdp: { type: "offer", sdp: "v=0..." } });

        joiner.send(`signal ${peer}\n${offer}`);
        assert.equal(await host.next("signal "), `signal ${peer}\n${offer}`);
        host.send(`signal ${peer}\n{"sdp":{"type":"answer"}}`);
        assert.equal(await joiner.next("signal "), `signal ${peer}\n{"sdp":{"type":"answer"}}`);

        // (Another's name for an attempt passes nothing; past the attempt's signals, refused)
        const other = await open(server);

        other.send("watch");
        await other.next("seen ", 0);
        host.send(`signal p999\n{}`);
        joiner.send(`signal ${peer}\n{"candidate":2}`);
        joiner.send(`signal ${peer}\n{"candidate":3}`);
        await host.next("signal ", 2);
        joiner.send(`signal ${peer}\n{"candidate":4}`);
        assert.equal(await joiner.next("error "), "error signals");
        assert.equal(host.count("signal "), 3);

        // (The joiner gone: its host told)
        joiner.close();
        assert.equal(await host.next("gone "), `gone ${peer}`);
        [host, other].forEach((link) => link.close());
    });

    it("relays what the two say when they can't connect directly, and puts out one the host kicks; or says it doesn't relay", async () => {
        const server = await serve();
        const [host, id] = await announce(server);
        const joiner = await open(server);

        joiner.send(`connect ${id}`);

        const peer = (await joiner.next("peer ")).split(" ")[1];

        await host.next("peer ");

        // (Not relayed till it's asked for: nothing passes)
        joiner.send("data\nhello?");
        joiner.send(`relay ${peer}`);
        assert.equal(await host.next("relay "), `relay ${peer}`);
        assert.equal(await joiner.next("relay "), `relay ${peer}`);
        joiner.send("data\nhello");
        assert.equal(await host.next("from "), `from ${peer}\nhello`);
        assert.equal(host.count("from "), 1);

        const big = "w".repeat(200 * 1024);

        host.send(`to ${peer}\n${big}`);
        assert.equal(await joiner.next("data\n"), `data\n${big}`);

        host.send(`kick ${peer}`);
        assert.equal(await joiner.next("closed"), "closed");
        assert.equal(await host.next("gone "), `gone ${peer}`);

        // (The server not relaying: the asker told so)
        await server.manage.changeSettings({ relaying: false });

        const second = await open(server);

        second.send(`connect ${id}`);

        const other = (await second.next("peer ")).split(" ")[1];

        second.send(`relay ${other}`);
        assert.equal(await second.next("error "), "error relaying-off");
        [host, second].forEach((link) => link.close());
    });

    it("keeps a world whose host's link drops till it expires: those relayed told it's away, and back when a new link keeps it; a host that leaves takes it down", async () => {
        const server = await serve({ expire: 600 });
        const [host, id, token] = await announce(server);
        const joiner = await open(server);
        const watcher = await open(server);

        watcher.send("watch");
        await watcher.next("seen ", 0);
        joiner.send(`connect ${id}`);

        const peer = (await joiner.next("peer ")).split(" ")[1];

        joiner.send(`relay ${peer}`);
        await joiner.next("relay ");

        // (Dropped: not left)
        host.close(4000);
        assert.equal(await joiner.next("away", 0), "away");

        const late = await open(server);

        late.send(`connect ${id}`);
        assert.equal(await late.next("error "), "error away");

        const back = await open(server);

        back.send(`keep ${id} ${token}`);
        assert.equal(await back.next("announced "), `announced ${id} ${token}`);
        assert.equal(await back.next("here"), `here ${peer}`);
        assert.equal(await joiner.next("back", 0), "back");
        back.send(`to ${peer}\nstill here`);
        assert.equal(await joiner.next("data\n"), "data\nstill here");

        // (Not kept again: gone when it expires, the watchers and those in it told)
        await watcher.next("- ", 0);
        assert.equal(watcher.heard("- "), `- ${id}`);
        assert.equal(await joiner.next("closed"), "closed");
        back.send(`keep ${id} ${token}`);
        assert.equal(await back.next("error "), "error gone");

        // (A host that leaves: down at once)
        const [leaving, leavingId] = await announce(server);

        await watcher.next("+ ", 0);
        leaving.close(1000);
        assert.equal(await watcher.next("- ", 1), `- ${leavingId}`);
        [back, late, watcher].forEach((link) => link.close());
    });

    it("refuses a bad announcement, more than 3 from one address, a joiner for a world that isn't there, and anything it doesn't know", async () => {
        const server = await serve();
        const host = await open(server);

        host.send("announce\nnot json");
        assert.equal(await host.next("error "), "error bad");

        for (let k = 0; k < 3; k++) {
            host.send(`announce\n${JSON.stringify(WORLD)}`);
            await host.next("announced ", k);
        }

        host.send(`announce\n${JSON.stringify(WORLD)}`);
        assert.equal(await host.next("error ", 1), "error too-many");

        const joiner = await open(server);

        joiner.send("connect ZZZZ");
        assert.equal(await joiner.next("error "), "error no-room");

        const stranger = await open(server);

        stranger.send("hello there");
        await until(() => stranger.closed !== null, "closed");
        assert.equal(stranger.closed, 1008);
        [host, joiner].forEach((link) => link.close());
    });

    it("takes no socket from another site's page, nor any while it's turned off", async () => {
        const server = await serve();
        const upgrade = (headers) =>
            new Promise((resolve, reject) => {
                const request = http.request({
                    host: "127.0.0.1",
                    port: server.port,
                    path: "/broker",
                    headers: { Host: `127.0.0.1:${server.port}`, Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": randomBytes(16).toString("base64"), "Sec-WebSocket-Protocol": BROKER_PROTOCOL, ...headers },
                });

                request.on("upgrade", (response, socket) => {
                    socket.destroy();
                    resolve(response.statusCode);
                });
                request.on("response", (response) => {
                    response.resume();
                    resolve(response.statusCode);
                });
                request.on("error", reject);
                request.end();
            });

        assert.equal(await upgrade({ Origin: `http://127.0.0.1:${server.port}` }), 101);
        assert.equal(await upgrade({ Origin: "https://evil.example" }), 403);
        assert.equal(await upgrade({ "Sec-WebSocket-Protocol": "other" }), 400);


        await server.manage.changeSettings({ broker: false });
        assert.equal(await upgrade({}), 403);
        await assert.rejects(open(server), /refused/);
    });
});
