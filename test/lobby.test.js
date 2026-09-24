import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { Lobby } from "../server/lobby.js";

// A fake player connection that records every message the lobby sends it
function connect(lobby) {
    const inbox = [];
    const player = lobby.connect((message) => inbox.push(message));

    return {
        player,
        inbox,
        send: (message) => lobby.handleMessage(player, JSON.stringify(message)),
        last: (type) => inbox.filter((message) => message.type === type).at(-1),
        all: (type) => inbox.filter((message) => message.type === type),
    };
}

// Answer the latency pings so that the lobby finishes measuring
function answerPings(client) {
    for (let i = 0; i < 3; i++) {
        client.send({ type: "latency-pong" });
    }
}

describe("Lobby", () => {
    let lobby;

    beforeEach(() => {
        mock.timers.enable({ apis: ["setInterval", "Date"] });
        lobby = new Lobby({ log: () => {}, random: () => 0 });
    });

    afterEach(() => {
        lobby.close();
        mock.timers.reset();
    });

    it("sends the room list and a latency ping when a player connects", () => {
        const alice = connect(lobby);

        assert.deepEqual(alice.last("room-list").roomList, Array(10).fill("empty"));
        assert.ok(alice.last("latency-ping"));
    });

    it("measures latency three times and sets the tick lag", () => {
        const alice = connect(lobby);

        mock.timers.tick(250);
        alice.send({ type: "latency-pong" });
        alice.send({ type: "latency-pong" });
        alice.send({ type: "latency-pong" });
        // A fourth, unrequested pong is ignored
        alice.send({ type: "latency-pong" });

        assert.equal(alice.all("latency-ping").length, 3);
        assert.equal(alice.player.latencyTrips.length, 3);
        // Average round trip of ~83ms rounds to one extra tick of lag
        assert.equal(alice.player.tickLag, 2);
    });

    it("puts two players in a room and starts the game once both have loaded", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        answerPings(alice);
        answerPings(bob);

        alice.send({ type: "join-room", roomId: 3 });
        assert.deepEqual(alice.last("joined-room"), { type: "joined-room", roomId: 3, color: "blue" });
        assert.equal(bob.last("room-list").roomList[2], "waiting");

        bob.send({ type: "join-room", roomId: 3 });
        assert.deepEqual(bob.last("joined-room"), { type: "joined-room", roomId: 3, color: "green" });
        assert.equal(alice.last("room-list").roomList[2], "starting");

        // With random() = 0 the players get spawn locations 0 and 1, and map 0
        assert.deepEqual(alice.last("initialize-level"), { type: "initialize-level", spawnLocations: { blue: 0, green: 1 }, currentLevel: 0, seed: 0 });
        assert.deepEqual(bob.last("initialize-level"), alice.last("initialize-level"));

        alice.send({ type: "initialized-level" });
        // Sending it twice must not count as both players being ready
        alice.send({ type: "initialized-level" });
        assert.equal(alice.last("play-game"), undefined);

        bob.send({ type: "initialized-level" });
        assert.ok(alice.last("play-game"));
        assert.ok(bob.last("play-game"));
        assert.equal(alice.last("room-list").roomList[2], "running");
    });

    it("runs the lockstep clock, waiting for players who fall behind", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        alice.send({ type: "initialized-level" });
        bob.send({ type: "initialized-level" });

        // Tick 0 can always go out; commands are scheduled one tick later (tick lag 1)
        mock.timers.tick(100);
        assert.deepEqual(alice.last("game-tick"), { type: "game-tick", tick: 1, commands: [] });

        // Alice gives an order during her tick 0, Bob only confirms his tick
        alice.send({ type: "command", uids: [5, 6], details: { type: "move", to: { x: 1, y: 2 } }, currentTick: 0 });
        bob.send({ type: "command", currentTick: 0 });

        mock.timers.tick(100);
        assert.deepEqual(bob.last("game-tick"), {
            type: "game-tick",
            tick: 2,
            commands: [{ uids: [5, 6], details: { type: "move", to: { x: 1, y: 2 } }, team: "blue" }],
        });

        // Bob stops responding: the clock waits for him
        alice.send({ type: "command", currentTick: 1 });
        mock.timers.tick(500);
        assert.equal(alice.all("game-tick").length, 2);

        bob.send({ type: "command", currentTick: 1 });
        mock.timers.tick(100);
        assert.equal(alice.all("game-tick").length, 3);
    });

    it("ignores malformed commands", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        alice.send({ type: "initialized-level" });
        bob.send({ type: "initialized-level" });

        alice.send({ type: "command", uids: "all", details: { type: "hunt" }, currentTick: 0 });
        alice.send({ type: "command", uids: [1], details: null, currentTick: 0 });
        alice.send({ type: "command", uids: [1], details: { type: "hunt" }, currentTick: -5 });
        lobby.handleMessage(alice.player, "this is not json");
        lobby.handleMessage(alice.player, "null");

        bob.send({ type: "command", currentTick: 0 });
        mock.timers.tick(200);

        assert.ok(alice.all("game-tick").every((message) => message.commands.length === 0));
    });

    it("relays only the fields a command needs, so nothing harmful reaches the other player", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        alice.send({ type: "initialized-level" });
        bob.send({ type: "initialized-level" });

        // Deep nesting like this used to make the server crash when it sent the next tick
        // (JSON.stringify can't even produce it, so write the JSON out by hand)
        const nested = "[".repeat(7000) + "]".repeat(7000);

        lobby.handleMessage(alice.player, `{"type":"command","currentTick":0,"uids":[1],"details":{"type":"hunt","junk":${nested}}}`);
        alice.send({ type: "command", currentTick: 0, uids: [2], details: { type: "attack", toUid: 7, previousOrder: { type: "patrol" } } });
        bob.send({ type: "command", currentTick: 0 });

        mock.timers.tick(100);

        assert.deepEqual(bob.last("game-tick").commands, [
            { uids: [1], details: { type: "hunt" }, team: "blue" },
            { uids: [2], details: { type: "attack", toUid: 7 }, team: "blue" },
        ]);
    });

    it("still counts a player's tick as confirmed when their command is invalid", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        alice.send({ type: "initialized-level" });
        bob.send({ type: "initialized-level" });

        alice.send({ type: "command", currentTick: 3, uids: [1], details: { type: "nonsense" } });

        assert.equal(lobby.rooms[0].lastTickConfirmed.blue, 4);
    });

    it("ends a starting game for the other player when someone leaves it", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "leave-room", roomId: 1 });

        assert.deepEqual(alice.last("end-game"), { type: "end-game", message: "The green player left the game." });
        assert.equal(lobby.rooms[0].status, "empty");
        assert.equal(bob.player.room, undefined);

        // Bob can join another game straight away
        bob.send({ type: "join-room", roomId: 2 });
        assert.equal(bob.last("joined-room").roomId, 2);
    });

    it("rejects joining a full or invalid room, or two rooms at once", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);
        const carol = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        carol.send({ type: "join-room", roomId: 1 });
        assert.ok(carol.last("join-rejected"));
        assert.equal(lobby.rooms[0].players.length, 2);

        carol.send({ type: "join-room", roomId: 11 });
        carol.send({ type: "join-room", roomId: "2" });
        assert.equal(carol.all("join-rejected").length, 3);

        carol.send({ type: "join-room", roomId: 2 });
        carol.send({ type: "join-room", roomId: 3 });
        assert.equal(carol.all("join-rejected").length, 4);
        assert.equal(lobby.rooms[2].status, "empty");
    });

    it("lets a waiting player leave the room", () => {
        const alice = connect(lobby);

        alice.send({ type: "join-room", roomId: 4 });
        alice.send({ type: "leave-room", roomId: 4 });

        assert.equal(lobby.rooms[3].status, "empty");
        assert.equal(alice.player.room, undefined);
    });

    it("ends the game for both players when one is defeated, and empties the room", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        alice.send({ type: "initialized-level" });
        bob.send({ type: "initialized-level" });

        bob.send({ type: "lose-game" });

        assert.deepEqual(alice.last("end-game"), { type: "end-game", message: "The green team has been defeated." });
        assert.deepEqual(bob.last("end-game"), alice.last("end-game"));

        // The book's server removed players while looping over them and left one behind
        assert.deepEqual(lobby.rooms[0].players, []);
        assert.equal(lobby.rooms[0].status, "empty");
        assert.equal(alice.player.room, undefined);
        assert.equal(bob.player.room, undefined);

        // The room can be used again straight away
        const carol = connect(lobby);

        carol.send({ type: "join-room", roomId: 1 });
        assert.equal(carol.last("joined-room").color, "blue");
    });

    it("ends a running game when a player disconnects", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });

        lobby.disconnect(bob.player);

        assert.deepEqual(alice.last("end-game"), { type: "end-game", message: "The green player has been disconnected." });
        assert.equal(lobby.rooms[0].status, "empty");
        assert.equal(lobby.players.size, 1);
    });

    it("frees the room when a waiting player disconnects", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 2 });
        lobby.disconnect(alice.player);

        assert.equal(bob.last("room-list").roomList[1], "empty");
    });

    it("relays chat to the room, stripping markup", () => {
        const alice = connect(lobby);
        const bob = connect(lobby);

        alice.send({ type: "join-room", roomId: 1 });
        bob.send({ type: "join-room", roomId: 1 });
        alice.send({ type: "initialized-level" });
        bob.send({ type: "initialized-level" });

        alice.send({ type: "chat", message: "<script>hi</script>" });
        alice.send({ type: "chat", message: 42 });

        assert.deepEqual(bob.all("chat"), [{ type: "chat", from: "blue", message: "scripthi/script" }]);
    });
});
