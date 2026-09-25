// Pellagos server: serves the game client over HTTP, for playing locally and on other devices on
// the same network (GitHub Pages serves the same files online).
//
//   npm start                 -> http://localhost:8080
//   PORT=3000 npm start       -> use a different port
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticHandler } from "./static.js";

const CLIENT_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");

/**
 * Create (but don't start) the HTTP server.
 * @returns {{httpServer: http.Server, close: () => Promise<void>}}
 */
export function createServer({ clientDirectory = CLIENT_DIRECTORY } = {}) {
    const httpServer = http.createServer(createStaticHandler(clientDirectory));
    const close = () => new Promise((resolve) => {
        httpServer.closeAllConnections?.();
        httpServer.close(() => resolve());
    });

    return { httpServer, close };
}

// Start the server when this file is run directly (not when imported by the tests)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const port = Number(process.env.PORT) || 8080;
    const host = process.env.HOST;
    const server = createServer();

    server.httpServer.listen(port, host, () => {
        console.log(`Pellagos is running at http://${host ?? "localhost"}:${port}`);

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
