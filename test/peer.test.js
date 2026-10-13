// Players' own worlds, the game's side (client/js/app/peer.js; generated/world_server_plan.md
// §8.3, §9.6, §15 S7), in Node against a real world server's broker, with a WebRTC of the tests'
// own (test/fake-rtc.js): a world listed and joined point to point, a snapshot sent in pieces;
// relayed by the server when no direct link can be made, or refused when it doesn't relay; the
// host's link to the broker made again; the world closed. And the reachability check's verdicts.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { BrokerHost, BrokerJoin, brokerOf, PEER_TIMING, PIECE, Pieces, piecesOf, reachability, reachabilityOf } from "../client/js/app/peer.js";
import { joinWorld, openWorld } from "../client/js/app/together.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { WorldServer } from "../server/world-server.js";
import { FakeRTC } from "./fake-rtc.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const WORLD = Object.freeze({ name: "Ada's world", people: "human", players: 1, most: 8, net: 113, visibility: "listed", direct: true, local: true });
const QUICK = Object.freeze({ ...PEER_TIMING, direct: 400, restart: 300, gather: 200, first: 50, most: 200, within: 5000 });

const made = [];
const servers = [];
const links = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

afterEach(() => {
    FakeRTC.blocked = false;

    for (const link of links.splice(0)) {
        link.close();
    }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 10000) {
    const end = Date.now() + ms;

    while (!test()) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(10);
    }
}

async function serve(settings = {}) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-peer-"));

    made.push(folder);

    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, funnel: false, ice: [] });

    servers.push(server);
    await server.settings.change(settings);
    await server.listen(0, "127.0.0.1");

    return server;
}

const brokerAt = (server) => brokerOf({ host: "127.0.0.1", port: server.port, secure: false });

// A host listing a world, hearing what's said: { host, code, heard: [[peer, text]], gone: [peer] }
async function hosting(server, options = {}) {
    const host = await BrokerHost.open(brokerAt(server), { RTC: FakeRTC, timing: QUICK, ...options });
    const record = { host, heard: [], gone: [], peers: [] };

    links.push(host);
    host.onFrom = (peer, text) => record.heard.push([peer, text]);
    host.onGone = (peer) => record.gone.push(peer);
    host.onPeer = (peer) => record.peers.push(peer);
    record.code = await host.host(WORLD);

    return record;
}

async function joining(server, code, options = {}) {
    const joiner = await BrokerJoin.open(brokerAt(server), { RTC: FakeRTC, timing: QUICK, ...options });
    const record = { joiner, heard: [], closed: 0 };

    links.push(joiner);
    joiner.onData = (text) => record.heard.push(text);
    joiner.onClosed = () => record.closed++;
    record.peer = await joiner.join(code);

    return record;
}

describe("pieces", () => {
    it("cut a message too long for a data channel to be sure of, and join it again", () => {
        const text = "é".repeat(PIECE * 2) + "x".repeat(10);
        const cut = piecesOf(text);
        const joined = new Pieces();

        assert.equal(cut.length, 3);
        assert.ok(cut.every((piece) => piece.length <= PIECE + 1));
        assert.deepEqual(
            cut.map((piece) => piece[0]),
            ["+", "+", "="],
        );
        assert.deepEqual(
            cut.map((piece) => joined.add(piece)),
            [null, null, text],
        );
        assert.deepEqual(piecesOf("hello"), ["=hello"]);
        assert.equal(joined.add("=hello"), "hello");
    });
});

describe("the reachability check", () => {
    const host = (address) => ({ type: "host", address, port: 5000 });
    const mapped = (port, base = "192.168.1.5") => ({ type: "srflx", address: "203.0.113.9", port, relatedAddress: base, relatedPort: 5000 });

    it("says a host can be reached from anywhere when its router maps it the same way for every STUN server, or it has a public address; on its own network when it has any", () => {
        assert.deepEqual(reachabilityOf([host("192.168.1.5"), mapped(61000), mapped(61000)]), { direct: true, local: true });
        assert.deepEqual(reachabilityOf([host("192.168.1.5"), mapped(61000), mapped(61002)]), { direct: false, local: true });
        assert.deepEqual(reachabilityOf([host("8f2c1a3e-0c1d-4e5f-9a7b-1c2d3e4f5a6b.local")]), { direct: false, local: true });
        assert.deepEqual(reachabilityOf([host("198.51.100.20")]), { direct: true, local: true });
        assert.deepEqual(reachabilityOf([]), { direct: false, local: false });
    });

    it("gathers the candidates once, with the STUN servers it's given", async () => {
        assert.deepEqual(await reachability({ ice: [], RTC: FakeRTC, timing: QUICK }), { direct: false, local: true });
        assert.deepEqual(await reachability({ ice: [{ urls: "stun:a" }, { urls: "stun:b" }], RTC: FakeRTC, timing: QUICK }), { direct: true, local: true });
        assert.deepEqual(await reachability({ RTC: null }), { direct: false, local: false });
    });
});

describe("a player's own world through the broker", () => {
    it("is joined point to point: what each says reaches the other, a snapshot in pieces; and the host hears when the joiner's gone", async () => {
        const server = await serve();
        const host = await hosting(server);

        assert.match(host.code, /^[A-Z]{4}$/);
        assert.deepEqual(host.host.word, { ice: [], relaying: true });

        const joined = await joining(server, host.code.toLowerCase());

        assert.equal(joined.joiner.how, "direct");
        await until(() => host.peers.includes(joined.peer), "the host told of the joiner");

        joined.joiner.data("hello");
        await until(() => host.heard.length, "the joiner heard");
        assert.deepEqual(host.heard, [[joined.peer, "hello"]]);

        const snapshot = "s".repeat(350 * 1024);

        host.host.to(joined.peer, snapshot);
        await until(() => joined.heard.length, "the snapshot heard");
        assert.equal(joined.heard[0], snapshot);
        assert.ok(host.host.peers.get(joined.peer).channel.channel.sent.every((length) => length <= PIECE + 1));

        joined.joiner.close();
        await until(() => host.gone.length, "the host told the joiner's gone");
        assert.deepEqual(host.gone, [joined.peer]);
    });

    it("is relayed by the server when no direct link can be made; and refused when the server doesn't relay", async () => {
        const server = await serve();
        const host = await hosting(server);

        FakeRTC.blocked = true;

        const joined = await joining(server, host.code);

        assert.equal(joined.joiner.how, "relayed");
        await until(() => host.peers.includes(joined.peer), "the host told of the joiner");
        joined.joiner.data("hello through the server");
        await until(() => host.heard.length, "the joiner heard");
        assert.deepEqual(host.heard, [[joined.peer, "hello through the server"]]);
        host.host.to(joined.peer, "welcome");
        await until(() => joined.heard.length, "the host heard");
        assert.deepEqual(joined.heard, ["welcome"]);

        // (The world closed: the joiner told)
        host.host.close();
        await until(() => joined.closed, "the joiner told it's closed");

        await server.manage.changeSettings({ relaying: false });

        const second = await hosting(server);

        await assert.rejects(joining(server, second.code), /relaying-off/);
        await assert.rejects(joining(server, "ZZZZ"), /no-room/);
    });

    it("keeps its listing when the host's link to the broker drops: made again, and kept on the new one", async () => {
        const server = await serve();
        const host = await hosting(server);
        let lost = 0;
        let found = 0;

        host.host.onLost = () => lost++;
        host.host.onFound = () => found++;

        const joined = await joining(server, host.code);

        // (The broker's link closed under it: the direct link to the joiner carries on)
        server.broker.closeWhere((socket) => socket.hosting?.size > 0);
        await until(() => found === 1, "the link made again");
        assert.equal(lost, 1);
        assert.equal(server.broker.listings.get(host.code).host !== null, true);
        joined.joiner.data("still here");
        await until(() => host.heard.length, "the joiner heard");
        assert.deepEqual(host.heard, [[joined.peer, "still here"]]);
    });
});

describe("playing a player's own world through the broker (together.js)", () => {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
    const GUEST = Object.freeze({ hero: { name: "Bryn", shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });

    // A world opened through the broker and joined, its copy played after the host's: point to point, or (blocked) relayed
    async function play(server) {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const game = { host, hosting: null, others: () => [] };
        const broker = { address: brokerAt(server), RTC: FakeRTC, timing: QUICK };
        const world = await openWorld(game, { broker: { ...broker, listing: { name: "Ada's world", people: "human", most: 8, net: NET_VERSION, listed: true } } });
        const joined = await joinWorld({ code: world.code, character: GUEST, broker });

        links.push(world, joined);
        joined.joining.onWelcome = ({ seed, race, snapshot }) => joined.joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        await until(() => joined.joining.host, "welcomed");

        for (let k = 0; k < 30; k++) {
            host.advance(STEP_MS);
        }

        world.hosting.flush();
        await until(() => joined.joining.host.battle.time + joined.joining.behind * STEP_MS >= host.battle.time, "the steps sent");

        while (joined.joining.step()) {
            // (Played)
        }

        return { host, world, joined };
    }

    it("plays point to point: the world sent and played after the host's, listed on the server as it asked", async () => {
        const server = await serve();
        const { host, world, joined } = await play(server);

        assert.equal(joined.link.how, "direct");
        assert.equal(joined.joining.host.battle.time, host.battle.time);
        assert.equal(joined.joining.desyncs, 0);
        // (No STUN servers here: not reachable from anywhere, so listed as through the server)
        assert.deepEqual(
            server.broker.seen({ address: "127.0.0.1", from: "home" }).map((one) => [one.id, one.name, one.direct, one.through, one.near]),
            [[world.code, "Ada's world", false, true, true]],
        );
    });

    it("plays relayed by the server when no direct link can be made", async () => {
        const server = await serve();

        FakeRTC.blocked = true;

        const { host, joined } = await play(server);

        assert.equal(joined.link.how, "relayed");
        assert.equal(joined.joining.host.battle.time, host.battle.time);
        assert.equal(joined.joining.desyncs, 0);
    });
});
