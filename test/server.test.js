// Integration tests: start the real server and talk to it over HTTP and WebSocket
import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import { createServer } from "../server/index.js";

let server;
let baseUrl;

before(async () => {
    server = createServer({ log: () => {} });
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    baseUrl = `http://localhost:${server.httpServer.address().port}`;
});

after(() => server.close());

// Open a WebSocket connection and collect its messages
async function connectClient() {
    const socket = new WebSocket(baseUrl.replace("http", "ws"));
    const messages = [];
    const waiters = [];

    socket.on("message", (data) => {
        const message = JSON.parse(data.toString());

        messages.push(message);

        // Answer latency pings like the game does
        if (message.type === "latency-ping") {
            socket.send(JSON.stringify({ type: "latency-pong" }));
        }

        for (const waiter of [...waiters]) {
            if (waiter.test(message)) {
                waiters.splice(waiters.indexOf(waiter), 1);
                waiter.resolve(message);
            }
        }
    });

    await once(socket, "open");

    return {
        socket,
        messages,
        send: (message) => socket.send(JSON.stringify(message)),
        // Resolve with the first message (already received or future) of the given type
        waitFor(type, test = () => true) {
            const existing = messages.find((message) => message.type === type && test(message));

            if (existing) {
                return Promise.resolve(existing);
            }

            return new Promise((resolve) => waiters.push({ test: (message) => message.type === type && test(message), resolve }));
        },
    };
}

describe("HTTP server", () => {
    it("serves the game", async () => {
        const response = await fetch(`${baseUrl}/`);

        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /text\/html/);
        assert.match(await response.text(), /<title>Last Colony<\/title>/);
    });

    it("serves scripts, images and sounds with the right types", async () => {
        for (const [path, type] of [
            ["/js/main.js", "text/javascript"],
            ["/images/maps/plains.png", "image/png"],
            ["/audio/message.ogg", "audio/ogg"],
            ["/audio/message.mp3", "audio/mpeg"],
        ]) {
            const response = await fetch(baseUrl + path);

            assert.equal(response.status, 200, path);
            assert.match(response.headers.get("content-type"), new RegExp(type), path);
            await response.arrayBuffer();
        }
    });

    it("does not serve files outside the client directory", async () => {
        for (const path of ["/../package.json", "/%2e%2e/package.json", "/..%2fpackage.json", "/%2e%2e%2fserver/index.js"]) {
            const response = await fetch(baseUrl + path);

            assert.ok([403, 404].includes(response.status), `${path} returned ${response.status}`);
        }
    });

    it("returns 404 for missing files and 405 for other methods", async () => {
        assert.equal((await fetch(`${baseUrl}/nope.js`)).status, 404);
        assert.equal((await fetch(`${baseUrl}/`, { method: "POST" })).status, 405);
    });
});

describe("multiplayer over WebSocket", () => {
    it("plays a game: join, load, tick with commands, chat and defeat", async () => {
        const blue = await connectClient();
        const green = await connectClient();

        await blue.waitFor("room-list");

        blue.send({ type: "join-room", roomId: 5 });
        await blue.waitFor("joined-room");
        green.send({ type: "join-room", roomId: 5 });

        const init = await green.waitFor("initialize-level");

        assert.deepEqual(Object.keys(init.spawnLocations), ["blue", "green"]);
        assert.notEqual(init.spawnLocations.blue, init.spawnLocations.green);

        blue.send({ type: "initialized-level" });
        green.send({ type: "initialized-level" });
        await Promise.all([blue.waitFor("play-game"), green.waitFor("play-game")]);

        // Blue sends a command on tick 0; both players then keep confirming ticks
        blue.send({ type: "command", uids: [7], details: { type: "hunt" }, currentTick: 0 });
        green.send({ type: "command", currentTick: 0 });

        const withCommand = (message) => message.commands.length > 0;
        const [blueTick, greenTick] = await Promise.all([
            blue.waitFor("game-tick", withCommand),
            green.waitFor("game-tick", withCommand),
        ]);

        assert.deepEqual(blueTick, greenTick);
        assert.deepEqual(blueTick.commands, [{ uids: [7], details: { type: "hunt" }, team: "blue" }]);

        green.send({ type: "chat", message: "gg" });
        assert.equal((await blue.waitFor("chat")).message, "gg");

        green.send({ type: "lose-game" });

        const end = await blue.waitFor("end-game");

        assert.equal(end.message, "The green team has been defeated.");
        assert.equal(server.lobby.rooms[4].status, "empty");

        blue.socket.close();
        green.socket.close();
    });

    it("ends the game when a player's connection drops", async () => {
        const blue = await connectClient();
        const green = await connectClient();

        blue.send({ type: "join-room", roomId: 6 });
        await blue.waitFor("joined-room");
        green.send({ type: "join-room", roomId: 6 });
        await blue.waitFor("initialize-level");

        green.socket.terminate();

        const end = await blue.waitFor("end-game");

        assert.equal(end.message, "The green player has been disconnected.");
        blue.socket.close();
    });
});
