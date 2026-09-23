// The multiplayer lobby: game rooms, players and the lockstep game clock.
//
// The lobby knows nothing about sockets. Each player is created with a send(object) function,
// which keeps this logic easy to test and independent of the WebSocket library.

const TEAM_COLORS = ["blue", "green"];
const MAX_CHAT_LENGTH = 200;

// Number of latency measurements taken for each player when they connect
const LATENCY_MEASUREMENTS = 3;

export class Lobby {
    #nextPlayerId = 1;

    /**
     * @param {object} [options]
     * @param {number} [options.roomCount=10]
     * @param {number} [options.tickMs=100]  the game clock runs one tick every tickMs milliseconds
     * @param {number} [options.spawnLocationCount=4]  number of spawn points on the multiplayer map
     * @param {() => number} [options.random=Math.random]
     * @param {(...args: any[]) => void} [options.log=console.log]
     */
    constructor({ roomCount = 10, tickMs = 100, spawnLocationCount = 4, random = Math.random, log = console.log } = {}) {
        this.tickMs = tickMs;
        this.spawnLocationCount = spawnLocationCount;
        this.random = random;
        this.log = log;

        this.players = new Set();
        this.rooms = Array.from({ length: roomCount }, (_, index) => ({
            roomId: index + 1,
            status: "empty",
            players: [],
        }));
    }

    /** Register a newly connected player. */
    connect(send, { name = "player" } = {}) {
        const player = {
            id: this.#nextPlayerId++,
            name,
            send,
            room: undefined,
            color: undefined,
            latencyTrips: [],
            // Game commands run at least one tick after the server receives them
            tickLag: 1,
        };

        this.players.add(player);

        // Send a fresh game room status list the first time player connects
        this.#sendRoomList(player);

        // Measure latency for player
        this.#measureLatencyStart(player);

        return player;
    }

    /** Handle a raw message (a JSON string) from a player. Malformed or unexpected messages are ignored. */
    handleMessage(player, data) {
        let message;

        try {
            message = JSON.parse(String(data));
        } catch {
            return;
        }

        if (message === null || typeof message !== "object") {
            return;
        }

        const room = player.room;

        switch (message.type) {
            case "join-room":
                this.#joinRoom(player, message.roomId);
                break;

            case "leave-room":
                if (room && room.roomId === message.roomId && room.status === "waiting") {
                    this.#leaveRoom(player);
                    this.#sendRoomListToEveryone();
                }

                break;

            case "initialized-level":
                if (room?.status === "starting") {
                    room.playersReady.add(player);

                    if (room.playersReady.size === room.players.length) {
                        // Both players are ready, start the game
                        this.#startGame(room);
                    }
                }

                break;

            case "latency-pong":
                this.#measureLatencyEnd(player);
                break;

            case "command":
                if (room?.status === "running" && Number.isInteger(message.currentTick) && message.currentTick >= 0) {
                    if (message.uids !== undefined) {
                        if (!isValidCommand(message)) {
                            break;
                        }

                        // Record who sent the command so clients only let players command their own units
                        room.commands.push({ uids: message.uids, details: message.details, team: player.color });
                    }

                    // The player has now confirmed every tick up to currentTick + tickLag
                    room.lastTickConfirmed[player.color] = Math.max(room.lastTickConfirmed[player.color], message.currentTick + player.tickLag);
                }

                break;

            case "lose-game":
                if (room?.status === "running") {
                    this.#endGame(room, `The ${player.color} team has been defeated.`);
                }

                break;

            case "chat":
                if (room?.status === "running" && typeof message.message === "string") {
                    // Strip any HTML tags and limit the length of the message
                    const cleanedMessage = message.message.replace(/[<>]/g, "").trim().slice(0, MAX_CHAT_LENGTH);

                    if (cleanedMessage) {
                        this.#sendToRoom(room, { type: "chat", from: player.color, message: cleanedMessage });
                    }
                }

                break;
        }
    }

    /** Remove a player whose connection has closed. */
    disconnect(player) {
        if (!this.players.delete(player)) {
            return;
        }

        const room = player.room;

        if (!room) {
            return;
        }

        if (room.status === "running" || room.status === "starting") {
            // End the game and notify the other player
            this.#endGame(room, `The ${player.color} player has been disconnected.`);
        } else {
            this.#leaveRoom(player);
            this.#sendRoomListToEveryone();
        }
    }

    /** Stop every running game clock (used when shutting the server down). */
    close() {
        for (const room of this.rooms) {
            clearInterval(room.interval);
            room.interval = undefined;
        }
    }

    roomList() {
        return this.rooms.map((room) => room.status);
    }

    #sendRoomList(player) {
        player.send({ type: "room-list", roomList: this.roomList() });
    }

    #sendRoomListToEveryone() {
        const message = { type: "room-list", roomList: this.roomList() };

        for (const player of this.players) {
            player.send(message);
        }
    }

    #sendToRoom(room, message) {
        for (const player of room.players) {
            player.send(message);
        }
    }

    #joinRoom(player, roomId) {
        const room = Number.isInteger(roomId) ? this.rooms[roomId - 1] : undefined;

        if (!room || player.room || !(room.status === "empty" || room.status === "waiting")) {
            player.send({ type: "join-rejected", reason: player.room ? "You are already in a game room." : "That game room is not available." });
            this.#sendRoomList(player);

            return;
        }

        this.log(`Adding player ${player.id} to room ${roomId}`);

        // Choose player color: blue for the first player, green for the second
        const takenColors = new Set(room.players.map((other) => other.color));

        player.color = TEAM_COLORS.find((color) => !takenColors.has(color));
        player.room = room;
        room.players.push(player);
        room.status = room.players.length === TEAM_COLORS.length ? "starting" : "waiting";

        // Confirm to player that they were added
        player.send({ type: "joined-room", roomId, color: player.color });
        this.#sendRoomListToEveryone();

        if (room.status === "starting") {
            this.#initializeGame(room);
        }
    }

    #leaveRoom(player) {
        const room = player.room;

        if (!room) {
            return;
        }

        this.log(`Removing player ${player.id} from room ${room.roomId}`);

        room.players = room.players.filter((other) => other !== player);
        player.room = undefined;
        player.color = undefined;

        room.status = room.players.length === 0 ? "empty" : "waiting";
    }

    #initializeGame(room) {
        this.log(`Both players joined. Initializing game for room ${room.roomId}`);

        // Players who have loaded the level
        room.playersReady = new Set();

        // Load the first multiplayer level for both players.
        // This logic can change later to let the players pick a level
        const currentLevel = 0;

        // Randomly select a different spawn location for each player
        const spawns = Array.from({ length: this.spawnLocationCount }, (_, index) => index);
        const spawnLocations = {};

        for (const player of room.players) {
            spawnLocations[player.color] = spawns.splice(Math.floor(this.random() * spawns.length), 1)[0];
        }

        this.#sendToRoom(room, { type: "initialize-level", spawnLocations, currentLevel });
    }

    #startGame(room) {
        this.log(`Both players are ready. Starting game in room ${room.roomId}`);

        room.status = "running";
        room.commands = [];
        room.lastTickConfirmed = Object.fromEntries(room.players.map((player) => [player.color, 0]));
        room.currentTick = 0;

        this.#sendRoomListToEveryone();

        // Notify players to start the game
        this.#sendToRoom(room, { type: "play-game" });

        // Commands are scheduled to run after the largest of the players' tick lags
        const roomTickLag = Math.max(...room.players.map((player) => player.tickLag));

        room.interval = setInterval(() => this.#tickRoom(room, roomTickLag), this.tickMs);
    }

    #tickRoom(room, roomTickLag) {
        // Only move on once every player has sent in commands up to the present tick
        const laggingPlayers = room.players.filter((player) => room.lastTickConfirmed[player.color] < room.currentTick);

        if (laggingPlayers.length > 0) {
            return;
        }

        this.#sendToRoom(room, { type: "game-tick", tick: room.currentTick + roomTickLag, commands: room.commands });
        room.currentTick++;
        room.commands = [];
    }

    #endGame(room, message) {
        this.log(`Ending game in room ${room.roomId}: ${message}`);

        // Stop the game loop on the server
        clearInterval(room.interval);
        room.interval = undefined;

        // Tell both players to end game
        this.#sendToRoom(room, { type: "end-game", message });

        // Empty the room (iterate over a copy, since leaving the room changes room.players)
        for (const player of [...room.players]) {
            this.#leaveRoom(player);
        }

        this.#sendRoomListToEveryone();
    }

    #measureLatencyStart(player) {
        player.latencyTrips.push({ start: Date.now() });
        player.send({ type: "latency-ping" });
    }

    #measureLatencyEnd(player) {
        const currentMeasurement = player.latencyTrips.at(-1);

        // Ignore pongs we did not ask for
        if (!currentMeasurement || currentMeasurement.end !== undefined) {
            return;
        }

        currentMeasurement.end = Date.now();
        currentMeasurement.roundTrip = currentMeasurement.end - currentMeasurement.start;

        // Calculate the average round trip for all the trips so far
        const totalTime = player.latencyTrips.reduce((total, trip) => total + trip.roundTrip, 0);

        player.averageRoundTrip = totalTime / player.latencyTrips.length;

        // By default game commands are run one tick after they are received by the server.
        // If averageRoundTrip is greater than a tick, increase tickLag to adjust for latency
        player.tickLag = 1 + Math.round(player.averageRoundTrip / this.tickMs);

        this.log(`Latency for player ${player.id}: attempt ${player.latencyTrips.length}, average round trip ${player.averageRoundTrip}ms, tick lag ${player.tickLag}`);

        // Measure latency at least thrice
        if (player.latencyTrips.length < LATENCY_MEASUREMENTS) {
            this.#measureLatencyStart(player);
        }
    }
}

// Basic sanity checks for a command's shape; the game validates the details further when it runs them
function isValidCommand(message) {
    return Array.isArray(message.uids)
        && message.uids.length <= 500
        && message.uids.every(Number.isInteger)
        && message.details !== null
        && typeof message.details === "object"
        && typeof message.details.type === "string";
}
