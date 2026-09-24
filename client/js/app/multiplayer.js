import { TICK_MS } from "../core/config.js";
import { levels } from "../core/data/levels.js";
import { createMission } from "../core/missions.js";
import { MULTIPLAYER_SERVER } from "./hosting.js";
import { showMessageBox, switchToScreen } from "./ui.js";

const statusMessages = {
    starting: "Game Starting",
    running: "Game in Progress",
    waiting: "Waiting for second player",
    empty: "Open",
};

// The multiplayer server normally serves the game too, so connect back to the same host (see
// hosting.js). Add ?server=ws://host:port to the page URL to use a different server.
// Returns null when there is no server (a copy of the game on a static web host).
function serverUrl() {
    const override = new URLSearchParams(window.location.search).get("server");

    if (override) {
        return override;
    }

    if (MULTIPLAYER_SERVER !== "same-origin") {
        return MULTIPLAYER_SERVER || null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

    return `${protocol}//${window.location.host || "localhost:8080"}`;
}

/** Is there a multiplayer server to play on? */
export function hasMultiplayerServer() {
    return serverUrl() !== null;
}

/**
 * Two player games over WebSocket.
 *
 * The game uses deterministic lockstep: players never send unit positions, only commands.
 * The server collects every player's commands and broadcasts them in numbered ticks, and each
 * client only advances its simulation once it has the commands for the next tick. Because both
 * clients run the same simulation with the same commands, they stay in sync.
 */
export class Multiplayer {
    websocket = undefined;
    roomId = undefined;
    color = undefined;
    selectedRoomId = undefined;

    #tickInterval;
    #ending = false;

    constructor(app) {
        this.app = app;
        this.gamesList = document.getElementById("multiplayergameslist");
        this.joinButton = document.getElementById("multiplayerjoin");
    }

    // Connect to the server and open the multiplayer game lobby
    start() {
        // Ignore repeated clicks while already connecting or connected
        if (this.websocket) {
            return;
        }

        if (!("WebSocket" in window)) {
            showMessageBox("Your browser does not support WebSocket. Multiplayer will not work.");

            return;
        }

        if (!hasMultiplayerServer()) {
            showMessageBox("Multiplayer needs the game's server, which this copy of the game doesn't have.");

            return;
        }

        this.roomId = undefined;
        this.color = undefined;
        this.selectedRoomId = undefined;
        this.#ending = false;
        this.#setLobbyEnabled(true);

        const websocket = new WebSocket(serverUrl());

        websocket.addEventListener("open", () => switchToScreen("multiplayerlobbyscreen"));
        websocket.addEventListener("message", (ev) => this.#handleMessage(ev.data));
        // A "close" event follows every connection error, so there is no need to also listen for "error"
        websocket.addEventListener("close", () => {
            if (this.websocket === websocket) {
                this.endGame("Error connecting to multiplayer server.");
            }
        });

        this.websocket = websocket;
    }

    send(messageObject) {
        if (this.websocket?.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(messageObject));
        }
    }

    #handleMessage(data) {
        let message;

        try {
            message = JSON.parse(data);
        } catch {
            console.warn("Ignoring malformed message from server", data);

            return;
        }

        switch (message.type) {
            case "room-list":
                this.updateRoomStatus(message.roomList);
                break;

            case "joined-room":
                this.roomId = message.roomId;
                this.color = message.color;
                break;

            case "join-rejected":
                this.#setLobbyEnabled(true);
                showMessageBox(message.reason ?? "Could not join that game.");
                break;

            case "initialize-level":
                // Ignore games in a room the player has just left
                if (this.roomId !== undefined) {
                    this.initLevel(message.spawnLocations, message.currentLevel, message.seed);
                }

                break;

            case "play-game":
                if (this.roomId !== undefined) {
                    this.play();
                }

                break;

            case "latency-ping":
                this.send({ type: "latency-pong" });
                break;

            case "game-tick":
                this.lastReceivedTick = message.tick;
                this.commands.set(message.tick, message.commands);
                break;

            case "end-game":
                // A player who left a starting game stays in the lobby
                if (this.roomId !== undefined || this.app.activeMode === this) {
                    this.endGame(message.message);
                }

                break;

            case "chat":
                this.app.game.showMessage(message.from, message.message);
                break;
        }
    }

    /* Lobby */

    updateRoomStatus(roomList) {
        const rows = roomList.map((status, index) => {
            const roomId = index + 1;
            const row = document.createElement("li");

            row.textContent = `Game ${roomId}. ${statusMessages[status] ?? status}`;
            row.className = status;
            row.setAttribute("role", "option");
            row.dataset.roomId = roomId;

            // Rooms that are running or starting cannot be joined
            if (status === "running" || status === "starting") {
                row.setAttribute("aria-disabled", "true");
            } else {
                // Let keyboard users move between the rooms they can join
                row.tabIndex = 0;
            }

            return row;
        });

        this.gamesList.replaceChildren(...rows);

        // Keep the player's current room (or their earlier choice) selected
        this.#selectRoom(this.roomId ?? this.selectedRoomId);
    }

    #selectRoom(roomId) {
        this.selectedRoomId = undefined;

        for (const row of this.gamesList.children) {
            const selected = Number(row.dataset.roomId) === roomId && row.getAttribute("aria-disabled") !== "true";

            row.classList.toggle("selected", selected);
            row.setAttribute("aria-selected", String(selected));

            if (selected) {
                this.selectedRoomId = roomId;
            }
        }
    }

    // Called when the player clicks a room in the list
    handleRoomClick(row, { join = false } = {}) {
        if (!row || this.gamesList.getAttribute("aria-disabled") === "true") {
            return;
        }

        this.#selectRoom(Number(row.dataset.roomId));

        if (join && this.selectedRoomId !== undefined) {
            this.join();
        }
    }

    #setLobbyEnabled(enabled) {
        this.gamesList.setAttribute("aria-disabled", String(!enabled));
        this.joinButton.disabled = !enabled;
    }

    join() {
        if (this.selectedRoomId === undefined) {
            // Ask player to select a room first
            showMessageBox("Please select a game room to join.");

            return;
        }

        this.send({ type: "join-room", roomId: this.selectedRoomId });

        // Disable room list and join button until the game starts or the player leaves the room
        this.#setLobbyEnabled(false);
    }

    cancel() {
        if (this.roomId) {
            // If the player is in a room, cancel will just leave the room
            this.send({ type: "leave-room", roomId: this.roomId });
            this.#setLobbyEnabled(true);

            this.roomId = undefined;
            this.color = undefined;
        } else {
            // If the player is not in a room, leave the multiplayer screen itself
            this.closeAndExit();
        }
    }

    closeAndExit() {
        const websocket = this.websocket;

        // Clear the connection first so that closing it isn't reported as an error
        this.websocket = undefined;
        websocket?.close();

        this.#setLobbyEnabled(true);
        this.app.showMainMenu();
    }

    /* Playing */

    // Set up the level the server chose, on the map generated from its seed (or on the book's map,
    // for a server that sends no seed)
    async initLevel(spawnLocations, levelIndex, seed) {
        const { app } = this;
        const definition = levels.multiplayer[levelIndex];

        if (!definition) {
            this.endGame("The server asked for a level that this game does not have.");

            return;
        }

        let level;

        try {
            level = createMission(definition, { seed, classic: !Number.isInteger(seed) });
        } catch (error) {
            console.error(error);
            this.endGame(`Could not make the map.\n${error.message}`);

            return;
        }

        const game = app.game;

        // Commands go to the server, which sends them back to both players as part of a game tick
        game.commandHandler = (uids, details) => this.sendCommand(uids, details);
        game.loadLevel(level, { team: this.color });

        this.commands = new Map([[0, []]]);
        this.lastReceivedTick = 0;
        this.currentTick = 0;
        this.sentCommandForTick = false;

        // Add starting items for both teams at their respective spawn locations
        for (const [team, spawnIndex] of Object.entries(spawnLocations)) {
            const spawn = level.spawnLocations[Number(spawnIndex)];

            for (const itemDetails of level.teamStartingItems) {
                game.add({ ...itemDetails, x: itemDetails.x + spawn.x, y: itemDetails.y + spawn.y, team });
            }
        }

        // Start with the view over the player's own base
        const spawn = level.spawnLocations[Number(spawnLocations[this.color])];

        try {
            await app.prepareLevel(level, spawn.startX, spawn.startY);
        } catch (error) {
            console.error(error);
            this.endGame(`Could not load the level.\n${error.message}`);

            return;
        }

        // Tell the server that this player is ready
        this.send({ type: "initialized-level" });
    }

    play() {
        this.app.startLevel(this, "external");

        // Instead of stepping the game itself, the loop waits for the server's ticks
        this.#tickInterval = setInterval(() => this.tickLoop(), TICK_MS);
    }

    sendCommand(uids, details) {
        this.sentCommandForTick = true;
        this.send({ type: "command", uids, details, currentTick: this.currentTick });
    }

    tickLoop() {
        // Wait for the server to catch up if the commands for this tick haven't arrived yet
        if (this.currentTick > this.lastReceivedTick) {
            return;
        }

        const commands = this.commands.get(this.currentTick) ?? [];

        this.commands.delete(this.currentTick);

        try {
            for (const { uids, details, team } of commands) {
                this.app.game.processCommand(uids, details, team);
            }

            this.app.runTick();
        } catch (error) {
            // Stop cleanly rather than freezing both players' games
            console.error(error);
            this.endGame(`The game stopped because of an error.\n${error.message}`);

            return;
        }

        // In case no command was sent for this tick, send an empty command so the server knows we are keeping up
        if (!this.sentCommandForTick) {
            this.sendCommand();
        }

        // Move on to the next tick
        this.currentTick++;
        this.sentCommandForTick = false;
    }

    // The level's defeat trigger fired: tell the server, which ends the game for both players
    handleLevelEnd(success) {
        if (!success) {
            this.send({ type: "lose-game" });
        }
    }

    async endGame(message) {
        // The game can only end once (e.g. the server ends it and then the connection drops)
        if (this.#ending) {
            return;
        }

        this.#ending = true;
        clearInterval(this.#tickInterval);
        this.#tickInterval = undefined;

        if (this.app.activeMode === this) {
            this.app.stopLevel();
        }

        // Show reason for game ending, and on OK, exit multiplayer screen
        await showMessageBox(message);
        this.closeAndExit();
    }

    // The player chose to leave a running game; the server tells the other player
    leaveGame() {
        this.#ending = true;
        clearInterval(this.#tickInterval);
        this.#tickInterval = undefined;
        this.app.stopLevel();
        this.closeAndExit();
    }

    sendChatMessage(message) {
        this.send({ type: "chat", message });
    }
}
