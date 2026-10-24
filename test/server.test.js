// Integration tests: start the real server and talk to it over HTTP
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { createServer } from "../server/index.js";
import { encodingFor, rangeOf, sameVersion } from "../server/static.js";

let server;
let baseUrl;

before(async () => {
    server = createServer();
    server.httpServer.listen(0);
    await once(server.httpServer, "listening");
    baseUrl = `http://localhost:${server.httpServer.address().port}`;
});

after(() => server.close());

describe("HTTP server", () => {
    it("serves the game", async () => {
        const response = await fetch(`${baseUrl}/`);

        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /text\/html/);
        assert.match(await response.text(), /<title>Pellagos<\/title>/);
    });

    it("serves scripts, character data and models with the right types", async () => {
        for (const [path, type] of [
            ["/js/main.js", "text/javascript"],
            ["/characters/human.json", "application/json"],
            ["/characters/human.bin", "application/octet-stream"],
            ["/models/kaykit/barrel.gltf", "model/gltf\\+json"],
            ["/models/kaykit/hexagons_medieval.png", "image/png"],
        ]) {
            const response = await fetch(baseUrl + path);

            assert.equal(response.status, 200, path);
            assert.match(response.headers.get("content-type"), new RegExp(type), path);
            await response.arrayBuffer();
        }
    });

    it("says how big files are, so the loader can show real progress", async () => {
        const response = await fetch(`${baseUrl}/characters/human.bin`);
        const length = Number(response.headers.get("content-length"));

        assert.ok(length > 1_000_000, `human.bin is ${length} bytes`);
        assert.equal((await response.arrayBuffer()).byteLength, length);
    });

    it("says a file hasn't changed since the copy the browser has, rather than sending it again", async () => {
        const first = await fetch(`${baseUrl}/js/main.js`);
        const modified = first.headers.get("last-modified");

        await first.arrayBuffer();
        assert.ok(modified);

        const same = await fetch(`${baseUrl}/js/main.js`, { headers: { "If-Modified-Since": modified } });

        assert.equal(same.status, 304);
        assert.equal(same.headers.get("last-modified"), modified);
        assert.equal((await same.arrayBuffer()).byteLength, 0);

        // (A copy from before it changed: all of it again)
        const older = await fetch(`${baseUrl}/js/main.js`, { headers: { "If-Modified-Since": new Date(Date.parse(modified) - 1000).toUTCString() } });

        assert.equal(older.status, 200);
        assert.ok((await older.arrayBuffer()).byteLength > 0);
    });

    it("tags each file by the hash of its bytes: the same version is \"not modified\" whatever date it was written, in any encoding; another isn't; nor is a copy newer than the file (one rolled back)", async () => {
        const first = await fetch(`${baseUrl}/js/main.js`, { headers: { "Accept-Encoding": "identity" } });
        const tag = first.headers.get("etag");
        const hash = createHash("sha256").update(Buffer.from(await first.arrayBuffer())).digest("hex").slice(0, 10);

        assert.equal(tag, `"${hash}"`);

        for (const sent of [tag, `W/${tag}`, `"${hash}.br"`, `"0123456789", "${hash}.gzip"`, "*"]) {
            const same = await fetch(`${baseUrl}/js/main.js`, { headers: { "If-None-Match": sent } });

            assert.equal(same.status, 304, sent);
            assert.equal((await same.arrayBuffer()).byteLength, 0, sent);
        }

        // (Another version, even with the date the file was written: all of it, as the tag's asked
        // by first)
        const other = await fetch(`${baseUrl}/js/main.js`, { headers: { "If-None-Match": "\"0123456789\"", "If-Modified-Since": first.headers.get("last-modified") } });

        assert.equal(other.status, 200);
        assert.ok((await other.arrayBuffer()).byteLength > 0);

        // (A copy dated after the file: one of a newer version, the file rolled back since)
        const newer = await fetch(`${baseUrl}/js/main.js`, { headers: { "If-Modified-Since": new Date(Date.parse(first.headers.get("last-modified")) + 60000).toUTCString() } });

        assert.equal(newer.status, 200);
        await newer.arrayBuffer();
    });

    it("sends code and pages compressed, brotli where it's taken and gzip where it isn't (as over plain http), each tagged so; models, pictures and parts as they are", async () => {
        const file = await readFile(new URL("../client/js/app/game.js", import.meta.url));
        const hash = createHash("sha256").update(file).digest("hex").slice(0, 10);

        for (const [accepted, encoding] of [["gzip, deflate, br, zstd", "br"], ["gzip, deflate", "gzip"], ["br;q=0, gzip", "gzip"], ["identity", null]]) {
            const response = await fetch(`${baseUrl}/js/app/game.js`, { headers: { "Accept-Encoding": accepted } });

            assert.equal(response.headers.get("content-encoding"), encoding, accepted);
            assert.equal(response.headers.get("etag"), `"${hash}${encoding ? `.${encoding}` : ""}"`, accepted);
            assert.equal(response.headers.get("vary"), "Accept-Encoding", accepted);
            assert.ok(encoding ? Number(response.headers.get("content-length")) < file.length / 3 : Number(response.headers.get("content-length")) === file.length, `${accepted}: ${response.headers.get("content-length")} bytes of ${file.length}`);
            assert.ok(Buffer.from(await response.arrayBuffer()).equals(file), accepted);
        }

        for (const path of ["/characters/human.bin", "/models/kaykit/hexagons_medieval.png"]) {
            const response = await fetch(baseUrl + path, { headers: { "Accept-Encoding": "br, gzip" } });

            assert.equal(response.headers.get("content-encoding"), null, path);
            await response.arrayBuffer();
        }

        const part = await fetch(`${baseUrl}/js/app/game.js`, { headers: { "Accept-Encoding": "br", "Range": "bytes=0-99" } });

        assert.equal(part.status, 206);
        assert.equal(part.headers.get("content-encoding"), null);
        assert.ok(Buffer.from(await part.arrayBuffer()).equals(file.subarray(0, 100)));
    });

    it("does not serve files outside the client directory", async () => {
        for (const path of ["/../package.json", "/%2e%2e/package.json", "/..%2fpackage.json", "/%2e%2e%2fserver/index.js"]) {
            const response = await fetch(baseUrl + path);

            assert.ok([403, 404].includes(response.status), `${path} returned ${response.status}`);
        }
    });

    it("serves a part of a file, as the downloader asks for it a part at a time", async () => {
        const whole = new Uint8Array(await readFile(new URL("../client/characters/human.bin", import.meta.url)));
        const part = await fetch(`${baseUrl}/characters/human.bin`, { headers: { Range: "bytes=1000-1999" } });

        assert.equal(part.status, 206);
        assert.equal(part.headers.get("content-range"), `bytes 1000-1999/${whole.length}`);
        assert.equal(part.headers.get("content-length"), "1000");
        assert.deepEqual(new Uint8Array(await part.arrayBuffer()), whole.subarray(1000, 2000));

        // (Its last part, asked for past its end: what there is)
        const last = await fetch(`${baseUrl}/characters/human.bin`, { headers: { Range: `bytes=${whole.length - 10}-${whole.length + 1000}` } });

        assert.equal(last.status, 206);
        assert.deepEqual(new Uint8Array(await last.arrayBuffer()), whole.subarray(whole.length - 10));

        // (Past its end altogether: nothing to send)
        const past = await fetch(`${baseUrl}/characters/human.bin`, { headers: { Range: `bytes=${whole.length}-` } });

        assert.equal(past.status, 416);
        assert.equal(past.headers.get("content-range"), `bytes */${whole.length}`);

        // (The file changed since the asker's other parts: all of it)
        const changed = await fetch(`${baseUrl}/characters/human.bin`, { headers: { Range: "bytes=0-99", "If-Range": "Thu, 01 Jan 2004 00:00:00 GMT" } });

        assert.equal(changed.status, 200);
        assert.equal((await changed.arrayBuffer()).byteLength, whole.length);
        assert.equal((await fetch(`${baseUrl}/js/main.js`)).headers.get("accept-ranges"), "bytes");
    });

    it("lets browsers keep a file asked for by its hash for good, but only if it's the file's", async () => {
        const hash = createHash("sha256").update(await readFile(new URL("../client/models/jmi/chest.glb", import.meta.url))).digest("hex").slice(0, 10);
        const right = await fetch(`${baseUrl}/models/jmi/chest.glb?h=${hash}`);
        const wrong = await fetch(`${baseUrl}/models/jmi/chest.glb?h=0123456789`);

        assert.equal(right.headers.get("cache-control"), "public, max-age=31536000, immutable");
        assert.equal(wrong.headers.get("cache-control"), "no-cache");
        assert.equal((await fetch(`${baseUrl}/models/jmi/chest.glb`)).headers.get("cache-control"), "no-cache");
        await Promise.all([right.arrayBuffer(), wrong.arrayBuffer()]);
    });

    it("returns 404 for missing files and 405 for other methods", async () => {
        assert.equal((await fetch(`${baseUrl}/nope.js`)).status, 404);
        assert.equal((await fetch(`${baseUrl}/`, { method: "POST" })).status, 405);
    });
});

describe("what a browser's sent in and has (encodingFor, sameVersion)", () => {
    it("sends brotli where it's taken, else gzip, else as it is; never one taken at q=0", () => {
        assert.equal(encodingFor("gzip, deflate, br, zstd"), "br");
        assert.equal(encodingFor("gzip, deflate"), "gzip");
        assert.equal(encodingFor("br;q=0, gzip;q=0.5"), "gzip");
        assert.equal(encodingFor("BR"), "br");
        assert.equal(encodingFor("identity"), null);
        assert.equal(encodingFor(undefined), null);
        assert.equal(encodingFor("gzip;q=0"), null);
    });

    it("knows the copy a browser has by its tag's hash, in any encoding, weak or strong, among several; or any for *", () => {
        assert.equal(sameVersion('"0123456789"', "0123456789"), true);
        assert.equal(sameVersion('W/"0123456789.br"', "0123456789"), true);
        assert.equal(sameVersion('"aaaaaaaaaa", "0123456789.gzip"', "0123456789"), true);
        assert.equal(sameVersion("*", "0123456789"), true);
        assert.equal(sameVersion('"aaaaaaaaaa"', "0123456789"), false);
        assert.equal(sameVersion('W/"6adcb970-9a606"', "0123456789"), false);
        assert.equal(sameVersion("", "0123456789"), false);
    });
});

describe("the part of a file a Range header asks for (rangeOf)", () => {
    it("reads one part: from and to, from to the end, or the last so many bytes, kept within the file", () => {
        assert.deepEqual(rangeOf("bytes=0-99", 1000), { start: 0, end: 99 });
        assert.deepEqual(rangeOf("bytes=900-", 1000), { start: 900, end: 999 });
        assert.deepEqual(rangeOf("bytes=-100", 1000), { start: 900, end: 999 });
        assert.deepEqual(rangeOf("bytes=-5000", 1000), { start: 0, end: 999 });
        assert.deepEqual(rangeOf("bytes=990-5000", 1000), { start: 990, end: 999 });
    });

    it("takes all of it for no header, one it doesn't understand, or several parts; and nothing for a part past the end", () => {
        assert.equal(rangeOf(undefined, 1000), null);
        assert.equal(rangeOf("bytes=0-9,20-29", 1000), null);
        assert.equal(rangeOf("lines=1-2", 1000), null);
        assert.equal(rangeOf("bytes=-", 1000), null);
        assert.equal(rangeOf("bytes=1000-", 1000), false);
        assert.equal(rangeOf("bytes=50-10", 1000), false);
        assert.equal(rangeOf("bytes=-0", 1000), false);
    });
});
