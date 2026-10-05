// A small static file handler that serves the game client.
//
// Files asked for by their hash (path?h=hash: the game's data, client/js/app/catalog.js) are one
// version for good, so browsers may keep them a year without asking again, when the hash is the
// file's (it's checked, so a file changed since the manifest was made isn't kept under the old
// one). Everything else is checked with the server every time. Parts of a file are served as asked
// (Range: the downloader fetches models a part at a time, app/fetcher.js).
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".wasm": "application/wasm",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".bin": "application/octet-stream",
    ".bvh": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
};

// A hash in an address: the first 10 hex digits of the SHA-256 of the file's bytes
const HASH = /^[0-9a-f]{10}$/;

// Each file's hash, as it was when it last changed (by path: { modified, size, hash })
const hashes = new Map();

async function hashOf(filePath, fileStats) {
    const known = hashes.get(filePath);

    if (known?.modified === fileStats.mtimeMs && known.size === fileStats.size) {
        return known.hash;
    }

    const hash = createHash("sha256").update(await readFile(filePath)).digest("hex").slice(0, 10);

    hashes.set(filePath, { modified: fileStats.mtimeMs, size: fileStats.size, hash });

    return hash;
}

/**
 * The part of a file a Range header asks for ({ start, end }, inclusive), null for all of it (no
 * header, one that isn't understood, or several parts), or false if it's past the file's end.
 */
export function rangeOf(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? "").trim());

    if (!match || (match[1] === "" && match[2] === "")) {
        return null;
    }

    // (bytes=-n: the last n)
    if (match[1] === "") {
        const last = Number(match[2]);

        return last > 0 && size > 0 ? { start: Math.max(0, size - last), end: size - 1 } : false;
    }

    const start = Number(match[1]);
    const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);

    return start < size && start <= end ? { start, end } : false;
}

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
        let hash;

        try {
            const url = new URL(request.url, "http://localhost");

            pathname = decodeURIComponent(url.pathname);
            hash = url.searchParams.get("h");
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

        const modified = fileStats.mtime.toUTCString();
        const lasting = HASH.test(hash ?? "") && hash === (await hashOf(filePath, fileStats));
        const headers = {
            // Asked for by its hash: the same for good. Otherwise always revalidate, so that edits
            // show up on reload during development
            "Cache-Control": lasting ? "public, max-age=31536000, immutable" : "no-cache",
            "Last-Modified": modified,
            "Accept-Ranges": "bytes",
            "X-Content-Type-Options": "nosniff",
        };

        // Not changed since the copy the browser has (to the second, as the date says): "not
        // modified", rather than the whole file again (every file's checked on every load)
        const since = Date.parse(request.headers["if-modified-since"] ?? "");

        if (since >= Date.parse(modified)) {
            response.writeHead(304, headers).end();

            return;
        }

        const type = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

        // A part of it, if that's what's asked for (and the file's as it was when the asker got
        // its other parts: If-Range, as the date says; changed since, all of it)
        const ifRange = request.headers["if-range"];
        const range = ifRange === undefined || ifRange === modified ? rangeOf(request.headers.range, fileStats.size) : null;

        if (range === false) {
            response.writeHead(416, { "Content-Range": `bytes */${fileStats.size}`, ...headers }).end();

            return;
        }

        const { start, end } = range ?? { start: 0, end: fileStats.size - 1 };

        response.writeHead(range ? 206 : 200, {
            "Content-Type": type,
            "Content-Length": Math.max(0, end - start + 1),
            ...(range ? { "Content-Range": `bytes ${start}-${end}/${fileStats.size}` } : {}),
            ...headers,
        });

        if (request.method === "HEAD" || fileStats.size === 0) {
            response.end();

            return;
        }

        createReadStream(filePath, { start, end })
            .on("error", () => response.destroy())
            .pipe(response);
    };
}
