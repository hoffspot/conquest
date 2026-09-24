// A small static file handler that serves the game client.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".txt": "text/plain; charset=utf-8",
};

/**
 * Create a request handler that serves files from rootDirectory.
 * Requests for "/" serve index.html; paths outside the root directory are rejected.
 */
export function createStaticHandler(rootDirectory) {
    const root = path.resolve(rootDirectory);

    return async function handleRequest(request, response) {
        if (request.method !== "GET" && request.method !== "HEAD") {
            response.writeHead(405, { "Allow": "GET, HEAD" }).end();

            return;
        }

        let pathname;

        try {
            pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        } catch {
            response.writeHead(400).end("Bad request");

            return;
        }

        if (pathname.endsWith("/")) {
            pathname += "index.html";
        }

        const filePath = path.join(root, pathname);

        // Never serve anything outside the client directory
        if (filePath !== root && !filePath.startsWith(root + path.sep)) {
            response.writeHead(403).end("Forbidden");

            return;
        }

        let fileStats;

        try {
            fileStats = await stat(filePath);
        } catch {
            fileStats = undefined;
        }

        if (!fileStats?.isFile()) {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");

            return;
        }

        response.writeHead(200, {
            "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
            "Content-Length": fileStats.size,
            // Always revalidate, so that edits show up on reload during development
            "Cache-Control": "no-cache",
            "Last-Modified": fileStats.mtime.toUTCString(),
            "X-Content-Type-Options": "nosniff",
        });

        if (request.method === "HEAD") {
            response.end();

            return;
        }

        createReadStream(filePath)
            .on("error", () => response.destroy())
            .pipe(response);
    };
}
