// The service worker (client/sw.js), run with stand-ins for the browser's caches and network
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://example.github.io";

// Load sw.js with a fake network that answers every request with `body`, the way GitHub Pages
// does (letting browsers reuse the file for ten minutes), and with the network failing if asked
function loadServiceWorker({ offline = false, stored = [] } = {}) {
    const handlers = {};
    const saved = new Map();
    const requests = [];
    const deleted = [];
    const clock = { now: 1000000, network: offline ? "offline" : "online" };

    const context = vm.createContext({
        URL, Headers, Request, Response, console,
        Date: { now: () => clock.now },
        self: {
            location: { origin: ORIGIN },
            addEventListener: (type, handler) => {
                handlers[type] = handler;
            },
            skipWaiting: () => {},
            clients: { claim: async () => {} },
        },
        caches: {
            keys: async () => [...stored],
            delete: async (name) => {
                deleted.push(name);

                return true;
            },
            open: async () => ({
                match: async (request) => saved.get(request.url)?.clone(),
                put: async (request, response) => {
                    saved.set(request.url, response);
                },
            }),
        },
        fetch: async (input, options = {}) => {
            requests.push({ url: typeof input === "string" ? input : input.url, cache: options.cache });

            if (clock.network === "offline") {
                throw new TypeError("Failed to fetch");
            }

            const response = new Response(clock.version ?? "new version", { status: 200, headers: { "Cache-Control": "max-age=600", "Content-Type": "text/javascript" } });

            // A response from the page's own site, as browsers give them
            return Object.defineProperty(response, "type", { value: "basic" });
        },
    });

    vm.runInContext(SOURCE, context);

    // Send a request to the service worker, as the page would (a path on the game's site, or an
    // address elsewhere). Returns its response, or undefined if it leaves the request alone.
    const request = async (path, { mode = "cors", page = "page-1" } = {}) => {
        let responded;
        const waiting = [];

        handlers.fetch({
            request: { url: path.startsWith("/") ? `${ORIGIN}${path}` : path, method: "GET", mode },
            clientId: mode === "navigate" ? "" : page,
            respondWith: (promise) => {
                responded = promise;
            },
            waitUntil: (promise) => waiting.push(promise),
        });

        const response = await responded;

        // (What it carries on with after answering: its copy saved)
        await Promise.all(waiting);

        return response;
    };

    const activate = async () => {
        let done;

        handlers.activate({ waitUntil: (promise) => (done = promise) });
        await done;
    };

    return { request, requests, saved, deleted, activate, clock };
}

describe("service worker", () => {
    it("always checks code and pages with the server, rather than the browser's own cache", async () => {
        const worker = loadServiceWorker();

        await worker.request("/js/main.js");
        await worker.request("/", { mode: "navigate" });

        assert.deepEqual(worker.requests, [
            { url: `${ORIGIN}/js/main.js`, cache: "no-cache" },
            { url: `${ORIGIN}/`, cache: "no-cache" },
        ]);
    });

    it("tells the page not to reuse code without asking again, however long the server allows", async () => {
        const worker = loadServiceWorker();
        const response = await worker.request("/js/main.js");

        assert.equal(response.headers.get("Cache-Control"), "no-cache");
        assert.equal(response.headers.get("Content-Type"), "text/javascript");
        assert.equal(await response.text(), "new version");
    });

    it("keeps a copy of the code for playing offline", async () => {
        const online = loadServiceWorker();

        await online.request("/js/main.js");
        assert.ok(online.saved.has(`${ORIGIN}/js/main.js`));

        const offline = loadServiceWorker({ offline: true });

        await assert.rejects(offline.request("/js/main.js"), /Failed to fetch/, "nothing saved yet");
    });

    it("checks a file once for a page: asked for again straight after (the page importing what the loader fetched), it's the copy just checked", async () => {
        const worker = loadServiceWorker();

        await worker.request("/js/main.js");
        worker.clock.now += 20000;
        worker.clock.version = "newer version";

        const again = await worker.request("/js/main.js");

        assert.equal(worker.requests.length, 1, "not asked again");
        assert.equal(await again.text(), "new version", "the copy just checked");
        assert.equal(again.headers.get("Cache-Control"), "no-cache");

        // (The page loaded afresh, a reload: checked with the server again, the update shown)
        assert.equal(await (await worker.request("/js/main.js", { page: "page-2" })).text(), "newer version");
        assert.equal(worker.requests.length, 2);

        // (And a minute on, by the same page)
        worker.clock.now += 60000;
        worker.clock.version = "newest version";

        assert.equal(await (await worker.request("/js/main.js", { page: "page-2" })).text(), "newest version");
        assert.equal(worker.requests.length, 3);
    });

    it("checks a file it hasn't a copy of, or couldn't reach the server for, whenever it's asked", async () => {
        const worker = loadServiceWorker();

        await worker.request("/js/a.js");
        await worker.request("/js/b.js");
        assert.deepEqual(worker.requests.map(({ url }) => url), [`${ORIGIN}/js/a.js`, `${ORIGIN}/js/b.js`]);

        // (Offline: the copy it had; back online, checked straight away)
        const offline = loadServiceWorker();

        await offline.request("/js/main.js");
        offline.clock.now += 120000;
        offline.clock.network = "offline";
        assert.equal(await (await offline.request("/js/main.js")).text(), "new version");
        offline.clock.network = "online";
        offline.clock.version = "newer version";
        assert.equal(await (await offline.request("/js/main.js")).text(), "newer version");
    });

    it("keeps 3D models and images, taking them from its copy first", async () => {
        const worker = loadServiceWorker();

        await worker.request("/models/kaykit/barrel.gltf");
        await worker.request("/models/kaykit/barrel.gltf");
        await worker.request("/models/kaykit/barrel.bin");
        await worker.request("/images/icons/icon-192.png");

        // The model was fetched once, the second time coming from the copy
        assert.deepEqual(worker.requests.map(({ url }) => url), [`${ORIGIN}/models/kaykit/barrel.gltf`, `${ORIGIN}/models/kaykit/barrel.bin`, `${ORIGIN}/images/icons/icon-192.png`]);
    });

    it("checks the characters' data with the server, as it's rebuilt with the code", async () => {
        const worker = loadServiceWorker();

        await worker.request("/characters/human.bin");

        assert.deepEqual(worker.requests, [{ url: `${ORIGIN}/characters/human.bin`, cache: "no-cache" }]);
    });

    it("clears out old copies: its own older versions and the game it replaced", async () => {
        const worker = loadServiceWorker({ stored: ["pellagos-v0", "pellagos-v1", "last-colony-v2", "another-site-v1"] });

        await worker.activate();

        assert.deepEqual(worker.deleted, ["pellagos-v0", "last-colony-v2"]);
    });

    it("leaves other sites alone", async () => {
        const worker = loadServiceWorker();

        assert.equal(await worker.request("https://cdn.example.com/library.js"), undefined);
        assert.deepEqual(worker.requests, []);
    });
});
