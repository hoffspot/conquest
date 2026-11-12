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
import { BrokerHost, BrokerJoin, brokerOf, Channel, HIGH, MOST, PACKED, packed, PEER_TIMING, PIECE, Pieces, piecesOf, reachability, reachabilityOf, unpacked } from "../client/js/app/peer.js";
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

    it("keep no more of a message than the longest a game says: one whose pieces run on past it is let go of, the next joined as ever", () => {
        const joined = new Pieces();
        const piece = `+${"x".repeat(PIECE)}`;

        assert.equal(MOST.message, 4 * 1024 * 1024);

        // (Pieces with no end to them: none kept once they're past the most)
        for (let k = 0; k < MOST.message / PIECE + 10; k++) {
            assert.equal(joined.add(piece), null);
        }

        assert.equal(joined.parts.length, 0);
        assert.equal(joined.add("=the end"), null, "its last piece too: not a message");
        assert.equal(joined.add("+hel"), null);
        assert.equal(joined.add("=lo"), "hello");

        // (A world as long as one's allowed comes whole)
        const world = "w".repeat(MOST.message);

        assert.equal(piecesOf(world).map((each) => joined.add(each)).at(-1), world);
    });

    it("wait to go on a channel that's full, and close one whose other end has left more than MOST.waiting waiting", () => {
        const sent = [];
        const closed = [];
        const data = { readyState: "open", bufferedAmount: 0, addEventListener: () => {}, send: (piece) => sent.push(piece), close: () => closed.push(true) };
        const channel = new Channel(data);

        // (Open: it says it reads compressed messages, before anything else)
        assert.deepEqual(sent, [`=${PACKED.can}`]);
        channel.send("hello");
        assert.deepEqual(sent.slice(1), ["=hello"]);
        assert.equal(channel.queued, 0);

        // Its other end slow: what's sent waits, a world and its steps and more, till it's too much
        data.bufferedAmount = HIGH + 1;

        const world = "w".repeat(600 * 1024);

        for (let k = 0; k < Math.floor(MOST.waiting / world.length); k++) {
            channel.send(world);
        }

        assert.equal(sent.length, 2);
        assert.equal(channel.queued, Math.floor(MOST.waiting / world.length) * world.length);
        assert.deepEqual(closed, []);
        channel.send(world);
        assert.deepEqual(closed, [true], "closed: whoever runs the link lets them go");
        assert.deepEqual([channel.waiting.length, channel.queued], [0, 0]);
    });

    // Two ends of a data channel, each with a Channel on it: what one sends the other hears a
    // moment later; `sent`, the pieces each put on the wire; `old`, an end from before messages
    // were compressed (it reads every message as it comes, and says nothing of its own)
    const linked = ({ old = false } = {}) => {
        const end = () => {
            const data = { readyState: "open", bufferedAmount: 0, sent: [], other: null, addEventListener: () => {}, close: () => {} };

            data.send = (piece) => {
                data.sent.push(piece);
                setTimeout(() => data.other.heard(piece), 0);
            };

            return data;
        };
        const [a, b] = [end(), end()];
        const heard = { a: [], b: [] };
        const pieces = new Pieces();

        // (Each made with the other to hear it: the first words go as they're made)
        b.other = { heard: (piece) => one.heard(piece) };

        const two = old
            ? {
                  send: (text) => piecesOf(text).forEach((piece) => b.send(piece)),
                  heard: (piece) => {
                      const whole = pieces.add(piece);

                      if (whole !== null) {
                          heard.b.push(whole);
                      }
                  },
              }
            : null;

        a.other = { heard: (piece) => (two ?? theirs).heard(piece) };

        const one = new Channel(a);
        const theirs = old ? null : new Channel(b);

        one.onText = (text) => heard.a.push(text);

        if (theirs) {
            theirs.onText = (text) => heard.b.push(text);
        }

        return { one, two: two ?? theirs, wire: { a: a.sent, b: b.sent }, heard };
    };
    const settled = () => new Promise((resolve) => setTimeout(resolve, 50));
    // (A world as it's sent: JSON, the same few words over and over)
    const WORLD = JSON.stringify({ kind: "welcome", snapshot: { actors: Array.from({ length: 2500 }, (_, k) => ({ id: `townsfolk:human-town-4/${k}`, x: k * 1.37, y: k * 2.11, hp: 100, team: "human", kind: "folk" })) } });

    it("compress a long message on its way to a game that's said it reads them, a world a fifth of its size and less on the wire and whole as it's heard; a short one goes as it is; and all of it's heard in the order it was said", async () => {
        const { one, two, wire, heard } = linked();

        await settled();
        assert.deepEqual([one.packs, two.packs], [true, true], "each has heard the other reads them");
        assert.deepEqual(heard, { a: [], b: [] }, "(that word told to no one)");

        // A step's worth, the world, and what's done after it, said at once: heard in that order,
        // though the world takes a moment to compress and another to read back
        const ops = (step) => `{"kind":"ops","step":${step},"ops":[["a",50]]}`;

        one.send(ops(1));
        one.send(WORLD);
        one.send(ops(2));
        one.send(ops(3));
        two.send('{"kind":"ready"}');
        await settled();
        assert.deepEqual(heard.b, [ops(1), WORLD, ops(2), ops(3)]);
        assert.deepEqual(heard.a, ['{"kind":"ready"}']);

        const sent = wire.a.slice(1);
        const onWire = sent.reduce((sum, piece) => sum + piece.length, 0);

        assert.equal(sent[0], `=${ops(1)}`);
        assert.equal(sent.at(-1), `=${ops(3)}`);
        assert.equal(sent.filter((piece) => piece[0] === PACKED.last).length, 1, "the world's last piece marked compressed");
        assert.ok(sent.every((piece) => piece.length <= PIECE + 1));
        assert.ok(onWire < WORLD.length / 5, `${onWire} characters on the wire for ${WORLD.length}`);
        assert.deepEqual(one.sent, { text: WORLD.length + ops(1).length * 3, wire: onWire }, "(as it counts them)");

        // (By itself: there and back, shorter; what won't read, and what reads longer than may be, nothing)
        const out = await packed(WORLD);

        assert.ok(out.length < WORLD.length / 5);
        assert.equal(await unpacked(out), WORLD);
        assert.equal(await unpacked("not base64 of anything deflated"), null);
        assert.equal(await unpacked(await packed("0".repeat(2 * 1024 * 1024)), 64 * 1024), null, "two megabytes of noughts, in a few bytes: not read past the most a message may be");
        assert.equal(await packed("xy"), null, "(no shorter compressed: sent as it is)");
    });

    it("send everything plain to a game from before messages were compressed, which never hears that they can be: its messages are read as ever, and it's told what it's told", async () => {
        const { one, two, wire, heard } = linked({ old: true });

        await settled();
        assert.equal(one.packs, false);
        // (What it heard of that: one message that isn't JSON, which such a game lets go of unread)
        assert.deepEqual(heard.b, [PACKED.can]);
        assert.throws(() => JSON.parse(heard.b[0]), SyntaxError);

        one.send(WORLD);
        one.send('{"kind":"refused","reason":"version","net":224}');
        two.send('{"kind":"hello","version":223}');
        await settled();
        assert.deepEqual(heard.b.slice(1), [WORLD, '{"kind":"refused","reason":"version","net":224}']);
        assert.deepEqual(heard.a, ['{"kind":"hello","version":223}']);
        assert.ok(wire.a.every((piece) => piece[0] === "=" || piece[0] === "+"), "nothing marked compressed");
    });

    it("leave out a compressed message that won't read, and carry on with the next", async () => {
        const { one, two, heard } = linked();

        await settled();
        // (As a game might send one: its last piece marked compressed, and nothing of the kind in it)
        two.channel.send(`${PACKED.last}bm90IGRlZmxhdGVk`);
        two.send('{"kind":"ping","t":1}');
        await settled();
        assert.deepEqual(heard.a, ['{"kind":"ping","t":1}']);
        assert.equal(one.inbox.length, 0);
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

    it("takes back its listing from a page started again, under its code: whoever was in it told to come in again; one let go of isn't", async () => {
        const server = await serve();
        const first = await hosting(server);
        const joined = await joining(server, first.code);
        const reasons = [];
        const { token } = first.host;

        joined.joiner.onClosed = (reason) => reasons.push(reason);

        // (Its page gone, as one reloading goes: its link to the broker closed, its listing not withdrawn)
        first.host.closing = true;
        clearInterval(first.host.keeping);
        first.host.socket.close(1000);
        await until(() => server.broker.listings.get(first.code)?.host === null, "its host gone");

        // (The page started again: its listing taken back afresh, the joiner told to come in again)
        const again = await BrokerHost.open(brokerAt(server), { RTC: FakeRTC, timing: QUICK });

        links.push(again);
        assert.equal(await again.reclaim(first.code, token, WORLD), first.code);
        await until(() => reasons.length === 1, "the joiner told");
        assert.deepEqual(reasons, ["again"]);
        assert.equal(server.broker.listings.get(first.code).host !== null, true);

        // (Come in again)
        const back = await joining(server, first.code);

        assert.match(back.peer, /^p\d+$/);

        // (One the broker's let go of: not taken back)
        const late = await BrokerHost.open(brokerAt(server), { RTC: FakeRTC, timing: QUICK });

        links.push(late);
        await assert.rejects(late.reclaim("ZZZZ", "nope", WORLD), /gone/);
    });

    it("says its world's no longer open to others when the broker's let its listing go though its link's open (an older server's way), its code not shown on", async () => {
        const server = await serve();
        const host = await hosting(server, { timing: { ...QUICK, keep: 300, ping: 100 } });
        let dropped = 0;

        host.host.onDrop = () => dropped++;

        // (Let go as an older server let one go, 45 s after its last keep, a page in the background
        // keeping it once a minute: its next keep's answered "error gone")
        server.broker.listings.delete(host.code);
        await until(() => dropped === 1, "told its listing's gone");
        assert.equal(host.host.closing, true);
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
