// Last Colony server: serves the game client over HTTP and runs the multiplayer lobby over WebSocket.
//
//   npm start                 -> http://localhost:8080
//   PORT=3000 npm start       -> use a different port
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { Lobby } from "./lobby.js";
import { createStaticHandler } from "./static.js";

const CLIENT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

// How often to check that WebSocket connections are still alive
const HEARTBEAT_INTERVAL_MS = 30000;
// Largest WebSocket message accepted from a client
const MAX_MESSAGE_BYTES = 16 * 1024;

/**
 * Create (but don't start) the HTTP + WebSocket server.
 * @returns {{httpServer: http.Server, lobby: Lobby, close: () => Promise<void>}}
 */
export function createServer({ clientDirectory = CLIENT_DIRECTORY, log = console.log, lobbyOptions = {} } = {}) {
    const lobby = new Lobby({ log, ...lobbyOptions });
    const httpServer = http.createServer(createStaticHandler(clientDirectory));
    const wsServer = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES });

    wsServer.on("connection", (socket, request) => {
        const address = request.socket.remoteAddress;

        log(`Connection from ${address} accepted.`);

        const player = lobby.connect((message) => {
            if (socket.readyState !== WebSocket.OPEN) {
                return;
            }

            try {
                socket.send(JSON.stringify(message));
            } catch (error) {
                // Never let one bad message take down the server (and every game on it)
                log(`Could not send ${message.type} message to ${address}: ${error.message}`);
            }
        });

        socket.isAlive = true;
        socket.on("pong", () => {
            socket.isAlive = true;
        });

        socket.on("message", (data, isBinary) => {
            if (!isBinary) {
                lobby.handleMessage(player, data.toString());
            }
        });

        socket.on("close", () => {
            log(`Connection from ${address} disconnected.`);
            lobby.disconnect(player);
        });

        socket.on("error", (error) => log(`Connection error from ${address}: ${error.message}`));
    });

    // Drop connections that stop answering pings (e.g. a laptop that went to sleep)
    const heartbeat = setInterval(() => {
        for (const socket of wsServer.clients) {
            if (!socket.isAlive) {
                socket.terminate();
                continue;
            }

            socket.isAlive = false;
            socket.ping();
        }
    }, HEARTBEAT_INTERVAL_MS);

    const close = () => new Promise((resolve) => {
        clearInterval(heartbeat);
        lobby.close();

        for (const socket of wsServer.clients) {
            socket.terminate();
        }

        wsServer.close(() => httpServer.close(() => resolve()));
    });

    return { httpServer, lobby, close };
}

// Start the server when this file is run directly (not when imported by the tests)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT) || 8080;
    const host = process.env.HOST;
    const server = createServer();

    server.httpServer.listen(port, host, () => {
        console.log(`Last Colony is running at http://${host ?? "localhost"}:${port}`);

        // Addresses other devices on the same network (e.g. a phone) can use
        if (!host) {
            for (const address of Object.values(os.networkInterfaces()).flat()) {
                if (address?.family === "IPv4" && !address.internal) {
                    console.log(`On your phone or another computer: http://${address.address}:${port}`);
                }
            }
        }
    });

    const shutdown = async () => {
        console.log("Shutting down...");
        await server.close();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
