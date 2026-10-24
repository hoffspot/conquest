// A small static file handler that serves the game client.
//
// Files asked for by their hash (path?h=hash: the game's data, client/js/app/catalog.js) are one
// version for good, so browsers may keep them a year without asking again, when the hash is the
// file's (it's checked, so a file changed since the manifest was made isn't kept under the old
// one). Everything else is checked with the server every time. Parts of a file are served as asked
// (Range: the downloader fetches models a part at a time, app/fetcher.js).
//
// Each file's tag (ETag) is the hash of its bytes, not when it was written: a release unpacked or
// copied anew gives every file a new date, but a file that's the same is still "not modified", and
// one rolled back to an older version isn't taken as the newer one the browser has. Code, pages and
// other text are sent compressed (brotli, or gzip where the browser can't take brotli, as over
// plain http), each version compressed once and kept a while (COMPRESSED): about a quarter of the
// bytes (generated/game_delivery_plan.md, stage 1).
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants as zlib, gzip } from "node:zlib";

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

// What's worth compressing: text (code, pages, data written as JSON) and the navigation's
// WebAssembly. Not pictures, sounds or models, which are compressed already
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".mjs", ".json", ".webmanifest", ".svg", ".txt", ".bvh", ".gltf", ".wasm"]);

/**
 * Compressing: each encoding's quality (brotli 9 is game.js in 60 ms, within a tenth of its best,
 * which takes a second), the largest file compressed (bytes), and how much of what's compressed is
 * kept, the least recently sent let go of first (bytes).
 */
export const COMPRESSED = Object.freeze({ brotli: 9, gzip: 6, largest: 16 * 1024 * 1024, kept: 64 * 1024 * 1024 });

const compressors = {
    br: (bytes) => promisify(brotliCompress)(bytes, { params: { [zlib.BROTLI_PARAM_QUALITY]: COMPRESSED.brotli, [zlib.BROTLI_PARAM_SIZE_HINT]: bytes.length } }),
    gzip: (bytes) => promisify(gzip)(bytes, { level: COMPRESSED.gzip }),
};

// Each file's version compressed (by path, hash and encoding: its bytes, or the promise of them
// while they're made), the least recently sent first
const compressed = new Map();
let compressedBytes = 0;

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

// A file's version compressed (`encoding`: "br" or "gzip"), made once and kept a while
async function compressedOf(filePath, hash, encoding) {
    const key = `${filePath}\n${hash}\n${encoding}`;
    const kept = compressed.get(key);

    if (kept) {
        compressed.delete(key);
        compressed.set(key, kept);

        return kept;
    }

    const made = readFile(filePath).then((bytes) => compressors[encoding](bytes));

    compressed.set(key, made);

    try {
        const bytes = await made;

        if (compressed.get(key) === made) {
            compressed.set(key, bytes);
            compressedBytes += bytes.length;

            // (The least recently sent let go of, to keep within what's kept)
            for (const [each, value] of compressed) {
                if (compressedBytes <= COMPRESSED.kept) {
                    break;
                }

                if (Buffer.isBuffer(value)) {
                    compressed.delete(each);
                    compressedBytes -= value.length;
                }
            }
        }

        return bytes;
    } catch (error) {
        compressed.delete(key);

        throw error;
    }
}

/**
 * Which encoding to send in, from the request's Accept-Encoding: brotli if it's taken, else gzip,
 * else none (null). (An encoding taken at q=0 isn't taken.)
 */
export function encodingFor(header) {
    const taken = new Set(String(header ?? "").split(",").map((part) => part.trim().split(";")).filter(([, ...params]) => !params.some((param) => /^\s*q\s*=\s*0(\.0*)?\s*$/.test(param))).map(([name]) => name.trim().toLowerCase()));

    return taken.has("br") ? "br" : taken.has("gzip") ? "gzip" : null;
}

/**
 * Whether an If-None-Match header names the copy the browser has as this file's version (`hash`):
 * any of its tags whose hash is the file's, whatever encoding it was sent in, as the bytes it
 * stands for are the same (weak or strong, as GET compares them: RFC 9110 13.1.2); or "*".
 */
export function sameVersion(header, hash) {
    return String(header ?? "").split(",").map((tag) => tag.trim()).some((tag) => tag === "*" || tag.replace(/^W\//, "").replace(/^"|"$/g, "").split(".")[0] === hash);
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
        const version = await hashOf(filePath, fileStats);
        const lasting = HASH.test(hash ?? "") && hash === version;
        const extension = path.extname(filePath).toLowerCase();
        const compressible = COMPRESSIBLE.has(extension) && fileStats.size > 0 && fileStats.size <= COMPRESSED.largest;

        // A part of it, if that's what's asked for (and the file's as it was when the asker got
        // its other parts: If-Range, by its tag or its date; changed since, all of it). Parts are
        // never compressed: they're of the models, which are already
        const ifRange = request.headers["if-range"];
        const range = ifRange === undefined || ifRange === `"${version}"` || ifRange === modified ? rangeOf(request.headers.range, fileStats.size) : null;
        const encoding = compressible && !range ? encodingFor(request.headers["accept-encoding"]) : null;
        const headers = {
            // Asked for by its hash: the same for good. Otherwise always revalidate, so that edits
            // show up on reload during development
            "Cache-Control": lasting ? "public, max-age=31536000, immutable" : "no-cache",
            "ETag": `"${version}${encoding ? `.${encoding}` : ""}"`,
            "Last-Modified": modified,
            "Accept-Ranges": "bytes",
            "X-Content-Type-Options": "nosniff",
            ...(compressible ? { "Vary": "Accept-Encoding" } : {}),
        };

        // The same version as the copy the browser has: "not modified", rather than the whole file
        // again (every file's checked on every load). By its tag where it's sent one (when it was
        // written is then not asked: RFC 9110 13.1.3); by its date only if it's the very date, so
        // a file rolled back to an older one isn't taken for the newer
        const tagged = request.headers["if-none-match"];
        const unchanged = tagged !== undefined ? sameVersion(tagged, version) : request.headers["if-modified-since"] === modified;

        if (unchanged) {
            response.writeHead(304, headers).end();

            return;
        }

        if (range === false) {
            response.writeHead(416, { "Content-Range": `bytes */${fileStats.size}`, ...headers }).end();

            return;
        }

        const type = MIME_TYPES[extension] ?? "application/octet-stream";

        // (Compressed, unless that fails: then as it is, under its own tag)
        const bytes = encoding ? await compressedOf(filePath, version, encoding).catch(() => null) : null;

        if (bytes) {
            response.writeHead(200, { "Content-Type": type, "Content-Encoding": encoding, "Content-Length": bytes.length, ...headers });
            response.end(request.method === "HEAD" ? undefined : bytes);

            return;
        }

        headers.ETag = `"${version}"`;

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
