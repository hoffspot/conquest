// Integration tests: start the real server and talk to it over HTTP
import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import { createServer } from "../server/index.js";

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
