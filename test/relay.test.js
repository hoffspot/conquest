// The relay (server/relay.js: docs/WAR.md M11), on the real server, talked to by real WebSockets
// (Node's own): a host opens a room and is given its code; others join it by the code; what each
// says reaches the other untouched, big or small; one who leaves is told of; the host gone, so's
// the room; no room, no joining
import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import { CODE_LENGTH, CODE_LETTERS, RELAY_PATH, roomCode } from "../server/relay.js";
import { createServer } from "../server/index.js";

let server;
let relayUrl;

before(async () => {
    server = createServer();
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    relayUrl = `ws://localhost:${server.httpServer.address().port}${RELAY_PATH}`;
});

after(() => server.close());

// A WebSocket to the relay, its messages queued to be waited for in turn
async function connect() {
    const socket = new WebSocket(relayUrl);
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

// A host with a room, and its code
async function hosting() {
    const host = await connect();

    host.send("host");

    const [what, code] = (await host.next()).split(" ");

    assert.equal(what, "hosting");

    return { host, code };
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
        const { host, code } = await hosting();

        assert.match(code, new RegExp(`^[${CODE_LETTERS}]{${CODE_LENGTH}}$`));
        assert.ok(server.relay.rooms.has(code));

        // Two join (the code in any case)
        const ann = await connect();

        ann.send(`join ${code.toLowerCase()}`);
        assert.equal(await ann.next(), "joined p1");
        assert.equal(await host.next(), "peer p1");

        const bo = await connect();

        bo.send(`join ${code}`);
        assert.equal(await bo.next(), "joined p2");
        assert.equal(await host.next(), "peer p2");

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
        assert.equal(await one.next(), "joined p1");
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
