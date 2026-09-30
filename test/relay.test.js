// The relay (server/relay.js: docs/WAR.md M11), on the real server, talked to by real WebSockets
// (Node's own): a host opens a room and is given its code; others join it by the code; what each
// says reaches the other untouched, big or small; one who leaves is told of; the host gone, so's
// the room; no room, no joining. A link that drops keeps its place a while, for a new link to take
// back with its token; one closed saying goodbye has left.
import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { EventEmitter } from "node:events";
import { attachRelay, CODE_LENGTH, CODE_LETTERS, RECONNECTING, RELAY_LIMITS, RELAY_PATH, roomCode, Socket } from "../server/relay.js";
import { createServer } from "../server/index.js";

let server;
let relayUrl;

// (And a relay of its own that keeps a dropped link's place only a moment)
const GRACE = 300;
let quick;
let quickUrl;

before(async () => {
    server = createServer();
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    relayUrl = `ws://localhost:${server.httpServer.address().port}${RELAY_PATH}`;

    const httpServer = http.createServer();

    quick = { httpServer, relay: attachRelay(httpServer, { limits: { ...RELAY_LIMITS, grace: GRACE } }) };
    httpServer.listen(0);
    await once(httpServer, "listening");
    quickUrl = `ws://localhost:${httpServer.address().port}${RELAY_PATH}`;
});

after(() => {
    server.close();
    quick.relay.close();
    quick.httpServer.close();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A WebSocket to the relay, its messages queued to be waited for in turn
async function connect(url = relayUrl) {
    const socket = new WebSocket(url);
    const heard = [];
    const waiting = [];

    socket.addEventListener("message", ({ data }) => {
        const next = waiting.shift();

        if (next) {
            next(data);
        } else {
            heard.push(data);
        }
    });
    socket.closed = new Promise((resolve) => socket.addEventListener("close", resolve));
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve);
        socket.addEventListener("error", reject);
    });

    // The next message
    socket.next = () => (heard.length ? Promise.resolve(heard.shift()) : new Promise((resolve) => waiting.push(resolve)));

    return socket;
}

// A host with a room: its code, and its token
async function hosting(url = relayUrl) {
    const host = await connect(url);

    host.send("host");

    const [what, code, token] = (await host.next()).split(" ");

    assert.equal(what, "hosting");

    return { host, code, token };
}

// One who's joined a room: their name in it, and their token
async function joining(code, url = relayUrl) {
    const socket = await connect(url);

    socket.send(`join ${code}`);

    const [what, peer, token] = (await socket.next()).split(" ");

    assert.equal(what, "joined");

    return { socket, peer, token };
}

// A link dropped without a word (the relay's end of it cut, as a lost signal leaves it)
function cut(socket) {
    socket.socket.destroy();
}

describe("the relay (server/relay.js)", () => {
    it("makes room codes of its letters, none taken twice", () => {
        const taken = new Set();

        for (let k = 0; k < 200; k++) {
            const code = roomCode(taken);

            assert.equal(code.length, CODE_LENGTH);
            assert.ok([...code].every((letter) => CODE_LETTERS.includes(letter)), code);
            assert.ok(!taken.has(code));
            taken.add(code);
        }

        // (Taken: another)
        let calls = 0;

        assert.equal(roomCode(new Set(["AAAA"]), (n) => (calls++ < CODE_LENGTH ? 0 : n - 1)), "ZZZZ");
    });

    it("opens a room for a host, lets others join it by its code, and passes what each says to the other, untouched", async () => {
        const { host, code, token } = await hosting();

        assert.match(code, new RegExp(`^[${CODE_LETTERS}]{${CODE_LENGTH}}$`));
        assert.match(token, /^[\w-]{12}$/);
        assert.ok(server.relay.rooms.has(code));

        // Two join (the code in any case), each given a token of their own
        const ann = await connect();

        ann.send(`join ${code.toLowerCase()}`);

        const [joined, first, annToken] = (await ann.next()).split(" ");

        assert.deepEqual([joined, first], ["joined", "p1"]);
        assert.match(annToken, /^[\w-]{12}$/);
        assert.notEqual(annToken, token);
        assert.equal(await host.next(), "peer p1");

        const bo = await connect();

        bo.send(`join ${code}`);
        assert.match(await bo.next(), /^joined p2 /);
        assert.equal(await host.next(), "peer p2");

        // Still there? (Either can ask)
        ann.send("ping");
        assert.equal(await ann.next(), "pong");
        host.send("ping");
        assert.equal(await host.next(), "pong");

        // To the host, from each; from the host to one, and to all
        ann.send("data\nhello from ann\nwith a second line");
        assert.equal(await host.next(), "from p1\nhello from ann\nwith a second line");
        host.send("to p2\njust for bo");
        assert.equal(await bo.next(), "data\njust for bo");
        host.send("all\nfor everyone ✓");
        assert.equal(await ann.next(), "data\nfor everyone ✓");
        assert.equal(await bo.next(), "data\nfor everyone ✓");

        // Something big (a world's state), in one piece
        const big = "x".repeat(3_000_000);

        host.send(`to p1\n${big}`);
        assert.equal((await ann.next()).length, 5 + big.length);

        // One leaves: the host's told; put out by the host: gone too
        bo.close();
        assert.equal(await host.next(), "gone p2");
        host.send("kick p1");
        await ann.closed;
        assert.equal(await host.next(), "gone p1");
        host.close();
        await host.closed;
    });

    it("closes the room when its host goes, telling those in it", async () => {
        const { host, code } = await hosting();
        const one = await connect();

        one.send(`join ${code}`);
        assert.match(await one.next(), /^joined p1 /);
        assert.equal(await host.next(), "peer p1");

        host.close();
        assert.equal(await one.next(), "closed");
        await one.closed;

        // (No room any more)
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(!server.relay.rooms.has(code));

        const late = await connect();

        late.send(`join ${code}`);
        assert.equal(await late.next(), "error no-room");
        await late.closed;
    });

    it("keeps the place of one whose link dropped: back on a new link with their token, the host never told they'd gone; not back in time, gone", async () => {
        const { host, code } = await hosting(quickUrl);
        const ann = await joining(code, quickUrl);

        assert.equal(await host.next(), "peer p1");

        // Dropped: nothing said to the host, and what it sends meanwhile goes nowhere
        cut(quick.relay.rooms.get(code).peers.get("p1").socket);
        await ann.socket.closed;
        host.send("to p1\nlost");

        // Back on a new link, with a wrong token: turned away; with theirs, theirs again
        const wrong = await connect(quickUrl);

        wrong.send(`rejoin ${code} p1 ${ann.token.replace(/./, (c) => (c === "A" ? "B" : "A"))}`);
        assert.equal(await wrong.next(), "error gone");

        const back = await connect(quickUrl);

        back.send(`rejoin ${code} p1 ${ann.token}`);
        assert.equal(await back.next(), `joined p1 ${ann.token}`);
        back.send("data\nback again");
        assert.equal(await host.next(), "from p1\nback again", "(and never a word of their going)");
        host.send("to p1\nwelcome back");
        assert.equal(await back.next(), "data\nwelcome back");

        // Dropped again, and not back in time: gone, and their place with them
        cut(quick.relay.rooms.get(code).peers.get("p1").socket);
        assert.equal(await host.next(), "gone p1");

        const late = await connect(quickUrl);

        late.send(`rejoin ${code} p1 ${ann.token}`);
        assert.equal(await late.next(), "error gone");
        host.close();
    });

    it("keeps a room whose host's link dropped: those in it told it's away, and back; the host told who's still here; not back in time, closed", async () => {
        const { host, code, token } = await hosting(quickUrl);
        const ann = await joining(code, quickUrl);
        const bo = await joining(code, quickUrl);

        assert.equal(await host.next(), "peer p1");
        assert.equal(await host.next(), "peer p2");

        cut(quick.relay.rooms.get(code).host);
        assert.equal(await ann.socket.next(), "away");
        assert.equal(await bo.socket.next(), "away");

        // (Nobody new while the host's away; and Bo leaves meanwhile)
        const newcomer = await connect(quickUrl);

        newcomer.send(`join ${code}`);
        assert.equal(await newcomer.next(), "error away");
        bo.socket.close();
        await bo.socket.closed;

        // The host back: its room again, told who's still here; those in it told it's back
        const again = await connect(quickUrl);

        again.send(`rehost ${code} ${token}`);
        assert.equal(await again.next(), `hosting ${code} ${token}`);
        assert.equal(await again.next(), "here p1");
        assert.equal(await ann.socket.next(), "back");
        again.send("to p1\nstill here?");
        assert.equal(await ann.socket.next(), "data\nstill here?");

        // Dropped again, and not back in time: the room's closed, and those in it told
        cut(quick.relay.rooms.get(code).host);
        assert.equal(await ann.socket.next(), "away");
        assert.equal(await ann.socket.next(), "closed");
        await wait(20);
        assert.ok(!quick.relay.rooms.has(code));

        const late = await connect(quickUrl);

        late.send(`rehost ${code} ${token}`);
        assert.equal(await late.next(), "error gone");
    });

    it("keeps the place of a link closed saying it's only reconnecting; one closed saying goodbye has left", async () => {
        const { host, code } = await hosting(quickUrl);
        const ann = await joining(code, quickUrl);

        assert.equal(await host.next(), "peer p1");

        // (Given up on for another: its place kept, and taken back)
        ann.socket.close(RECONNECTING);
        await ann.socket.closed;

        const back = await connect(quickUrl);

        back.send(`rejoin ${code} p1 ${ann.token}`);
        assert.match(await back.next(), /^joined p1 /);

        // (A new link taking the place of one the relay still thinks is there: the old one let go)
        const again = await connect(quickUrl);

        again.send(`rejoin ${code} p1 ${ann.token}`);
        assert.match(await again.next(), /^joined p1 /);
        await back.closed;
        again.send("data\nhere");
        assert.equal(await host.next(), "from p1\nhere");

        // Goodbye: gone at once
        again.close();
        assert.equal(await host.next(), "gone p1");
        host.close();
    });

    it("reads a big message come in many small pieces whole, and lets go of one too slow to take what's sent it", () => {
        // (A socket of its own, fed a client's masked frame a kilobyte at a time)
        const wire = Object.assign(new EventEmitter(), { writableLength: 0, written: [], write: (data) => wire.written.push(data), end() {}, destroy() {} });
        const socket = new Socket(wire);
        const heard = [];
        const text = "x".repeat(200 * 1024);
        const payload = Buffer.from(text);
        const mask = Buffer.from([1, 2, 3, 4]);
        const header = Buffer.alloc(10);

        header[0] = 0x81;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);

        const frame = Buffer.concat([header, mask, payload.map((byte, k) => byte ^ mask[k & 3])]);

        socket.onMessage = (message) => heard.push(message);

        for (let at = 0; at < frame.length; at += 1024) {
            wire.emit("data", frame.subarray(at, at + 1024));
        }

        assert.equal(heard.length, 1);
        assert.equal(heard[0], text);

        // (A great deal still waiting to go to it: let go rather than piled up)
        let closed = false;

        socket.onClose = () => (closed = true);
        wire.writableLength = 64 * 1024 * 1024;
        socket.send("more");
        assert.ok(closed);
    });

    it("turns away anything but the relay's WebSockets, and those who don't say who they are", async () => {
        const port = server.httpServer.address().port;
        const elsewhere = new WebSocket(`ws://localhost:${port}/somewhere`);

        await new Promise((resolve) => {
            elsewhere.addEventListener("error", resolve);
            elsewhere.addEventListener("close", resolve);
        });
        assert.notEqual(elsewhere.readyState, WebSocket.OPEN);

        const stranger = await connect();

        stranger.send("hello?");
        await stranger.closed;
    });
});
