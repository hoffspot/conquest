// The service worker (client/sw.js), run with stand-ins for the browser's caches and network
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://example.github.io";

// Load sw.js with a fake network that answers every request with `body`, the way GitHub Pages
// does (letting browsers reuse the file for ten minutes), and with the network failing if asked
function loadServiceWorker({ offline = false } = {}) {
    const handlers = {};
    const saved = new Map();
    const requests = [];

    const context = vm.createContext({
        URL, Headers, Request, Response, console,
        self: {
            location: { origin: ORIGIN },
            addEventListener: (type, handler) => {
                handlers[type] = handler;
            },
            skipWaiting: () => {},
            clients: { claim: async () => {} },
        },
        caches: {
            keys: async () => [],
            open: async () => ({
                match: async (request) => saved.get(request.url)?.clone(),
                put: async (request, response) => {
                    saved.set(request.url, response);
                },
            }),
        },
        fetch: async (input, options = {}) => {
            requests.push({ url: typeof input === "string" ? input : input.url, cache: options.cache });

            if (offline) {
                throw new TypeError("Failed to fetch");
            }

            const response = new Response("new version", { status: 200, headers: { "Cache-Control": "max-age=600", "Content-Type": "text/javascript" } });

            // A response from the page's own site, as browsers give them
            return Object.defineProperty(response, "type", { value: "basic" });
        },
    });

    vm.runInContext(SOURCE, context);

    // Send a request to the service worker, as the page would (a path on the game's site, or an
    // address elsewhere). Returns its response, or undefined if it leaves the request alone.
    const request = async (path, { mode = "cors" } = {}) => {
        let responded;

        handlers.fetch({
            request: { url: path.startsWith("/") ? `${ORIGIN}${path}` : path, method: "GET", mode },
            respondWith: (promise) => {
                responded = promise;
            },
        });

        return responded;
    };

    return { request, requests, saved };
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

    it("leaves other sites alone", async () => {
        const worker = loadServiceWorker();

        assert.equal(await worker.request("https://cdn.example.com/library.js"), undefined);
        assert.deepEqual(worker.requests, []);
    });
});
