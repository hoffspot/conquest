// The service worker (client/sw.js), run with stand-ins for the browser's caches, pages and network
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://example.github.io";

const SHELL = "pellagos-shell-v2";
const BOOT = "pellagos-boot-v2";
const ASSETS = "pellagos-assets-v2";
const PARTS = "pellagos-parts-v1";

// Ten minutes and a moment: past the time a file just kept is kept whatever the releases say
const GRACE = 10 * 60000 + 1;

const full = (path) => (path.startsWith("/") ? `${ORIGIN}${path}` : path);

/** A file's hash, as scripts/build-manifest.js makes it. */
const hashOf = (body) => createHash("sha256").update(body).digest("hex").slice(0, 10);

// Load sw.js with a fake network that answers every request with `files[path]` (or "new version"),
// the way GitHub Pages does (whatever the query, letting browsers reuse the file for ten minutes),
// and with the network failing if asked. `stored` is what the caches hold to start with
// ({ name: { path: body } }), `open` the pages open (their ids), `pages` where some of them are
// ({ id: path }: the rest unknown to it, as a worker's is), `estimate` what the browser says of its
// storage.
function loadServiceWorker({ offline = false, stored = {}, files = {}, open = ["page-1"], pages = {}, estimate, tags = false } = {}) {
    const handlers = {};
    const store = new Map();
    const requests = [];
    const deleted = [];
    const clock = { now: 1000000, network: offline ? "offline" : "online" };

    const cache = (name) => {
        if (!store.has(name)) {
            store.set(name, new Map());
        }

        const entries = store.get(name);
        const key = (request) => (typeof request === "string" ? request : request.url);

        return {
            match: async (request) => {
                const entry = entries.get(key(request));

                return entry && new Response(entry.bytes.slice(0), { status: entry.status, headers: entry.headers });
            },
            put: async (request, response) => {
                entries.set(key(request), { bytes: await response.arrayBuffer(), status: response.status, headers: new Headers(response.headers) });
            },
            delete: async (request) => entries.delete(key(request)),
            keys: async () => [...entries.keys()].map((url) => ({ url })),
        };
    };

    for (const [name, entries] of Object.entries(stored)) {
        store.set(name, new Map(Object.entries(entries).map(([path, body]) => [full(path), { bytes: new TextEncoder().encode(body).buffer, status: 200, headers: new Headers() }])));
    }

    const context = vm.createContext({
        URL, Headers, Request, Response, console, crypto,
        Date: { now: () => clock.now },
        self: {
            location: { origin: ORIGIN, href: `${ORIGIN}/sw.js` },
            addEventListener: (type, handler) => {
                handlers[type] = handler;
            },
            skipWaiting: () => {},
            clients: { claim: async () => {}, matchAll: async () => open.map((id) => ({ id })), get: async (id) => (pages[id] ? { id, type: "window", url: full(pages[id]) } : undefined) },
            navigator: estimate ? { storage: { estimate: async () => estimate } } : {},
        },
        caches: {
            keys: async () => [...store.keys()],
            open: async (name) => cache(name),
            delete: async (name) => {
                deleted.push(name);

                return store.delete(name);
            },
        },
        fetch: async (input, options = {}) => {
            const url = typeof input === "string" ? input : input.url;
            const range = typeof input === "string" ? null : input.headers?.get("range");

            requests.push({ url, cache: options.cache, ...(range ? { range } : {}) });

            if (clock.network === "offline") {
                throw new TypeError("Failed to fetch");
            }

            const body = files[new URL(url).pathname] ?? clock.version ?? "new version";
            // (With `tags`, tagged by its hash, as the game's own server tags it, and "not modified"
            // if asked with that tag)
            const tag = tags ? `"${hashOf(body)}"` : null;
            const asked = new Headers(options.headers ?? {}).get("if-none-match");

            if (asked) {
                requests.at(-1).tagged = asked;
            }

            const response = tag && asked === tag ? new Response(null, { status: 304, headers: { ETag: tag } }) : new Response(body, { status: 200, headers: { "Cache-Control": "max-age=600", "Content-Type": "text/javascript", ...(tag ? { ETag: tag } : {}) } });

            // A response from the page's own site, as browsers give them
            return Object.defineProperty(response, "type", { value: "basic" });
        },
    });

    vm.runInContext(SOURCE, context);

    // What it carries on with after answering (its copies saved, what it knows saved)
    const finish = async (waiting) => {
        for (let done = 0; done < waiting.length; done = waiting.length) {
            await Promise.all(waiting.slice(done));
        }
    };

    // Send a request to the service worker, as the page would (a path on the game's site, or an
    // address elsewhere). Returns its response, or undefined if it leaves the request alone.
    const request = async (path, { mode = "cors", page = "page-1", range, destination = "" } = {}) => {
        let responded;
        const waiting = [];

        handlers.fetch({
            request: { url: full(path), method: "GET", mode, destination, headers: new Headers(range ? { range } : {}) },
            clientId: mode === "navigate" ? "" : page,
            respondWith: (promise) => {
                responded = promise;
            },
            waitUntil: (promise) => waiting.push(promise),
        });

        const response = await responded;

        await finish(waiting);

        return response;
    };

    // A page telling the worker its release, as js/app/device.js does
    const tell = async (page, message) => {
        const waiting = [];

        handlers.message({ data: { kind: "release", ...message }, source: { id: page }, waitUntil: (promise) => waiting.push(promise) });
        await finish(waiting);
    };

    // Any other message from a page (`source`: the page, as the worker sees it)
    const send = async (message, source) => {
        const waiting = [];

        handlers.message({ data: message, source, waitUntil: (promise) => waiting.push(promise) });
        await finish(waiting);
    };

    const activate = async () => {
        const waiting = [];

        handlers.activate({ waitUntil: (promise) => waiting.push(promise) });
        await finish(waiting);
    };

    // The addresses a cache holds
    const kept = (name) => [...(store.get(name)?.keys() ?? [])];

    return { request, requests, tell, send, activate, kept, deleted, clock, files, open, names: () => [...store.keys()], context };
}

// A release, as a page tells it (catalog.js, releaseOf): files given as [path, body]
function release(name, { boot = [], assets = [] }, started) {
    const url = ([path, body]) => full(`${path}?h=${hashOf(body)}`);

    return { release: name, boot: boot.map(url), assets: assets.map(url), started };
}

const address = ([path, body]) => `${path}?h=${hashOf(body)}`;

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
        assert.deepEqual(online.kept(SHELL), [`${ORIGIN}/js/main.js`]);

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

    it("gives images and models without a hash from its copy first, then checks them with the server, at most once a minute", async () => {
        const worker = loadServiceWorker({ files: { "/images/icons/icon-192.png": "an icon" } });

        await worker.request("/models/kaykit/barrel.gltf");
        await worker.request("/models/kaykit/barrel.bin");
        assert.equal(await (await worker.request("/images/icons/icon-192.png")).text(), "an icon");
        assert.equal(worker.requests.length, 3);

        // (Asked for again straight away: the copy, not checked again)
        await worker.request("/images/icons/icon-192.png");
        assert.equal(worker.requests.length, 3);

        // A minute on, the copy is given, and then checked: a change shows the next time
        worker.clock.now += 60000;
        worker.files["/images/icons/icon-192.png"] = "a new icon";
        assert.equal(await (await worker.request("/images/icons/icon-192.png")).text(), "an icon");
        assert.deepEqual(worker.requests.at(-1), { url: `${ORIGIN}/images/icons/icon-192.png`, cache: "no-cache" });
        assert.equal(await (await worker.request("/images/icons/icon-192.png")).text(), "a new icon");

        // (Offline, the copy as it is)
        worker.clock.now += 60000;
        worker.clock.network = "offline";
        assert.equal(await (await worker.request("/images/icons/icon-192.png")).text(), "a new icon");
    });

    it("never checks the music's recordings again, as their names change with what's in them", async () => {
        const worker = loadServiceWorker();

        await worker.request("/music/harp-46.ff3ae0be.mp3");
        worker.clock.now += 3600000;
        await worker.request("/music/harp-46.ff3ae0be.mp3");

        assert.deepEqual(worker.requests.map(({ url }) => url), [`${ORIGIN}/music/harp-46.ff3ae0be.mp3`]);
    });

    it("checks the characters' data asked for by name with the server, as it's rebuilt with the code", async () => {
        const worker = loadServiceWorker();

        await worker.request("/characters/human.bin");

        assert.deepEqual(worker.requests, [{ url: `${ORIGIN}/characters/human.bin`, cache: "no-cache" }]);
    });

    it("keeps a file known by its hash once its bytes are checked, and never asks the server for it again", async () => {
        const worker = loadServiceWorker({ files: { "/characters/human.bin": "the body" } });
        const url = address(["/characters/human.bin", "the body"]);

        assert.equal(await (await worker.request(url)).text(), "the body");
        assert.deepEqual(worker.requests, [{ url: full(url), cache: "no-cache" }]);
        assert.deepEqual(worker.kept(BOOT), [full(url)]);

        // (An hour on, the server having moved on, and offline: the copy kept, never asked for)
        worker.clock.now += 3600000;
        worker.files["/characters/human.bin"] = "a newer body";
        assert.equal(await (await worker.request(url)).text(), "the body");
        worker.clock.network = "offline";
        assert.equal(await (await worker.request(url)).text(), "the body");
        assert.equal(worker.requests.length, 1);
    });

    it("keeps what a page loaded by hash before it took over (a first visit: main.js and its imports) when the page asks, from the browser's copy, checked by its hash; one kept already, another site's, or one without a hash, not fetched", async () => {
        const files = { "/js/main.js": "the main module", "/js/app/device.js": "the device module", "/js/app/debug.js": "a newer debug module" };
        const worker = loadServiceWorker({ files, stored: { [BOOT]: { [address(["/js/app/fullscreen.js", "kept"])]: "kept" } } });
        const main = address(["/js/main.js", "the main module"]);
        const device = address(["/js/app/device.js", "the device module"]);
        const debug = address(["/js/app/debug.js", "the debug module"]);
        const fullscreen = address(["/js/app/fullscreen.js", "kept"]);

        await worker.tell("page-1", { kind: "keep", urls: [main, device, debug, fullscreen, "https://elsewhere.example/js/main.js?h=0123456789", "/js/app/version.js"].map(full) });

        assert.deepEqual(worker.requests, [main, device, debug].map((url) => ({ url: full(url), cache: "force-cache" })));
        assert.deepEqual(worker.kept(BOOT).sort(), [fullscreen, main, device].map(full).sort());

        // (Asked for by the page next time: from what's kept)
        assert.equal(await (await worker.request(main)).text(), "the main module");
        assert.equal(worker.requests.length, 3);
    });

    it("hands on, but doesn't keep, a file whose bytes aren't the ones its hash names (a release published meanwhile)", async () => {
        const worker = loadServiceWorker({ files: { "/characters/human.bin": "a newer body" } });
        const url = address(["/characters/human.bin", "the body"]);

        assert.equal(await (await worker.request(url)).text(), "a newer body");
        assert.deepEqual(worker.kept(BOOT), []);

        await worker.request(url);
        assert.equal(worker.requests.length, 2, "asked for again");
    });

    it("keeps a file in the catalog with the catalog's, once a page has said it's one", async () => {
        const worker = loadServiceWorker({ files: { "/models/dragon.glb": "a dragon", "/models/jmi/chest.glb": "a chest" } });

        await worker.tell("page-1", release("r1", { boot: [["/models/jmi/chest.glb", "a chest"]], assets: [["/models/dragon.glb", "a dragon"]] }, 1));
        await worker.request(address(["/models/dragon.glb", "a dragon"]));
        await worker.request(address(["/models/jmi/chest.glb", "a chest"]));

        assert.deepEqual(worker.kept(ASSETS), [full(address(["/models/dragon.glb", "a dragon"]))]);
        assert.deepEqual(worker.kept(BOOT), [full(address(["/models/jmi/chest.glb", "a chest"]))]);
    });

    it("leaves a part of a file (a range, as the downloader asks for) to the server", async () => {
        const worker = loadServiceWorker({ files: { "/models/dragon.glb": "a dragon" } });
        const url = address(["/models/dragon.glb", "a dragon"]);

        await worker.request(url, { range: "bytes=0-99" });

        assert.deepEqual(worker.requests, [{ url: full(url), cache: undefined, range: "bytes=0-99" }]);
        assert.deepEqual([...worker.kept(BOOT), ...worker.kept(ASSETS)], []);
    });

    it("gives a file asked for by name (a worker's module, the font, the WebAssembly) its copy by hash, if the release lists it, without the network; anything else as before", async () => {
        const navworker = ["/js/world/navworker.js", "navworker v1"];
        const font = ["/fonts/Sign.woff2", "font v1"];
        const worker = loadServiceWorker({ files: { [navworker[0]]: navworker[1], [font[0]]: font[1] } });

        await worker.tell("page-1", release("r1", { boot: [navworker, font] }, 1));

        // (Kept as the loader fetched them by hash)
        await worker.request(address(navworker));
        await worker.request(address(font));
        worker.requests.length = 0;

        assert.equal(await (await worker.request(navworker[0])).text(), "navworker v1");
        assert.equal(await (await worker.request(font[0], { page: "worker-7" })).text(), "font v1");
        assert.deepEqual(worker.requests, []);

        // (Not listed: from the network first, as before; nor a part of one)
        await worker.request("/js/other.js");
        await worker.request(navworker[0], { range: "bytes=0-9" });
        assert.deepEqual(worker.requests.map(({ url }) => url), [full("/js/other.js"), full(navworker[0])]);
    });

    it("gives a page its own release's copy of a file asked for by name, and what's not a page it knows (a worker) the newest's", async () => {
        const old = ["/js/world/navworker.js", "navworker v1"];
        const now = ["/js/world/navworker.js", "navworker v2"];
        const worker = loadServiceWorker({ open: ["page-1", "page-2"] });

        // (Each page's kept as its loader fetched it by hash, the server on each version then)
        await worker.tell("page-1", release("r1", { boot: [old] }, 1));
        worker.files[old[0]] = old[1];
        await worker.request(address(old), { page: "page-1" });
        await worker.tell("page-2", release("r2", { boot: [now] }, 2));
        worker.files[now[0]] = now[1];
        await worker.request(address(now), { page: "page-2" });
        worker.requests.length = 0;

        assert.equal(await (await worker.request(old[0], { page: "page-1" })).text(), "navworker v1");
        assert.equal(await (await worker.request(old[0], { page: "page-2" })).text(), "navworker v2");
        assert.equal(await (await worker.request(old[0], { page: "worker-3" })).text(), "navworker v2");
        assert.deepEqual(worker.requests, []);
    });

    it("gives the site's other pages (the model viewer, the labs), which never say a release, none of a release's copies: what they ask for by name from the network, as the server has it now; the game's page before it's said, the newest's", async () => {
        const old = ["/js/beasts/model.js", "model v1"];
        const worker = loadServiceWorker({ open: ["page-1", "viewer-1", "game-2"], pages: { "viewer-1": "/model-viewer.html?creature=stoneGolem", "game-2": "/index.html?play" } });

        // (The game last played on a release now gone by: its copy kept)
        await worker.tell("page-1", release("r1", { boot: [old] }, 1));
        worker.files[old[0]] = old[1];
        await worker.request(address(old), { page: "page-1" });

        // (The server moved on since; the model viewer opened, not the game: the server's, not the
        // game's last, which wouldn't work with the viewer's own code)
        worker.files[old[0]] = "model v2";
        worker.requests.length = 0;
        assert.equal(await (await worker.request(old[0], { page: "viewer-1" })).text(), "model v2");
        assert.deepEqual(worker.requests.map(({ url }) => url), [full(old[0])]);

        // (The game's page, before it's said its release: the newest's, kept)
        worker.requests.length = 0;
        assert.equal(await (await worker.request(old[0], { page: "game-2" })).text(), "model v1");
        assert.deepEqual(worker.requests, []);
    });

    it("fetches a file by hash once though it's asked for again while it comes (the page importing what the loader's fetching)", async () => {
        const game = ["/js/app/game.js", "game v1"];
        const worker = loadServiceWorker({ files: { [game[0]]: game[1] } });
        const [first, second] = await Promise.all([worker.request(address(game)), worker.request(address(game))]);

        assert.equal(await first.text(), "game v1");
        assert.equal(await second.text(), "game v1");
        assert.equal(worker.requests.length, 1);
        assert.deepEqual(worker.kept(BOOT), [full(address(game))]);
    });

    it("lists a release's files as a page tells them, each time (a release told before with fewer keeps them all)", async () => {
        const game = ["/js/app/game.js", "game v1"];
        const body = ["/characters/vitruvian.bin", "body v1"];
        const worker = loadServiceWorker({ files: { [game[0]]: game[1], [body[0]]: body[1] } });

        await worker.tell("page-1", release("r1", { boot: [body] }, 1));
        await worker.request(address(body));
        await worker.request(address(game));
        await worker.tell("page-1", release("r1", { boot: [body, game] }, 1));
        worker.clock.now += GRACE;
        await worker.activate();

        assert.deepEqual(worker.kept(BOOT).toSorted(), [full(address(body)), full(address(game))].toSorted());
    });

    it("downloads in the background what it doesn't keep of a release a page found newer than its own, one at a time, saying how far it's got; and keeps it till a page on it says so", async () => {
        const game = ["/js/app/game.js", "game v1"];
        const hud = ["/js/app/hud.js", "hud v1"];
        const newer = ["/js/app/game.js", "game v2"];
        const worker = loadServiceWorker({ open: ["page-1", "page-2"], files: { [game[0]]: game[1], [hud[0]]: hud[1] } });
        const said = [];

        await worker.tell("page-1", release("r1", { boot: [game, hud] }, 1));
        await worker.request(address(game));
        await worker.request(address(hud));
        worker.requests.length = 0;

        // (The server on the newer release now)
        worker.files[newer[0]] = newer[1];
        await worker.send({ kind: "prefetch", ...release("r2", { boot: [newer, hud] }) }, { id: "page-1", postMessage: (message) => said.push(JSON.parse(JSON.stringify(message))) });

        assert.deepEqual(worker.requests.map(({ url }) => url), [full(address(newer))]);
        assert.deepEqual(said, [{ kind: "prefetching", release: "r2", done: 1, total: 1 }, { kind: "prefetched", release: "r2", files: 1, missing: 0 }]);

        // (Kept though no page is on it yet, long after)
        worker.clock.now += GRACE;
        await worker.tell("page-1", release("r1", { boot: [game, hud] }, 1));
        assert.ok(worker.kept(BOOT).includes(full(address(newer))));

        // A page on it, loaded: everything there, nothing asked for
        await worker.tell("page-2", release("r2", { boot: [newer, hud] }, 2));
        assert.equal(await (await worker.request(address(newer), { page: "page-2" })).text(), "game v2");
        assert.equal(worker.requests.length, 1);
    });

    it("says a newer release isn't all there if a file of it couldn't be kept (the server moved on again, or offline)", async () => {
        const newer = ["/js/app/game.js", "game v2"];
        const worker = loadServiceWorker({ files: { [newer[0]]: "game v3" } });
        const said = [];

        await worker.send({ kind: "prefetch", ...release("r2", { boot: [newer] }) }, { id: "page-1", postMessage: (message) => said.push(JSON.parse(JSON.stringify(message))) });

        assert.deepEqual(said.at(-1), { kind: "unfetched", release: "r2", files: 1, missing: 1 });
        assert.deepEqual(worker.kept(BOOT), []);
    });

    it("checks a page (or anything asked for by name) with the server by its own copy's tag, so \"not modified\" doesn't hang on the browser's HTTP cache; changed, the new one", async () => {
        const version = ["/js/app/version.js", "version v1"];
        const worker = loadServiceWorker({ tags: true, files: { [version[0]]: version[1] } });

        assert.equal(await (await worker.request(version[0])).text(), "version v1");
        worker.clock.now += 60001;
        assert.equal(await (await worker.request(version[0])).text(), "version v1");
        assert.deepEqual(worker.requests, [
            { url: full(version[0]), cache: "no-cache" },
            { url: full(version[0]), cache: "no-store", tagged: `"${hashOf("version v1")}"` },
        ]);

        // (Changed on the server: all of it, the new one)
        worker.files[version[0]] = "version v2";
        worker.clock.now += 60001;
        assert.equal(await (await worker.request(version[0])).text(), "version v2");
    });

    it("tells the page's loader a copy it gives it is one it keeps (a header); an import, the copy without it, as a response of its own", async () => {
        const game = ["/js/app/game.js", "game v1"];
        const worker = loadServiceWorker({ files: { [game[0]]: game[1] } });

        assert.equal((await worker.request(address(game))).headers.get("X-Pellagos-Kept"), null);
        assert.equal((await worker.request(address(game))).headers.get("X-Pellagos-Kept"), "1");

        const imported = await worker.request(address(game), { destination: "script" });

        assert.equal(imported.headers.get("X-Pellagos-Kept"), null);
        assert.equal(imported.headers.get("Content-Type"), "text/javascript");
        assert.equal(await imported.text(), "game v1");
        assert.equal(worker.requests.length, 1);
    });

    it("gives the catalog's files 1 GiB at most, whatever the browser says it has (recent Chrome says 10 GiB more than it's using, whatever the disk)", async () => {
        const worker = loadServiceWorker({ estimate: { quota: 10 * 1024 ** 3, usage: 0 } });

        assert.equal(await worker.context.room(0), 1024 ** 3);
        assert.equal(await loadServiceWorker({ estimate: { quota: 600 * 1024 ** 2, usage: 0 } }).context.room(0), 300 * 1024 ** 2);
    });

    it("takes over the copies the cache before it kept, taking on those now known by their hash rather than downloading them again", async () => {
        const worker = loadServiceWorker({
            stored: { "pellagos-v1": { "/js/main.js": "old code", "/characters/human.bin": "the body", "/models/jmi/chest.glb": "an old chest" } },
            files: { "/models/jmi/chest.glb": "a new chest" },
        });

        await worker.activate();
        assert.ok(!worker.names().includes("pellagos-v1"));

        // Offline, the code it had
        worker.clock.network = "offline";
        assert.equal(await (await worker.request("/js/main.js")).text(), "old code");

        // A file now known by its hash, with the same bytes: taken on, not downloaded
        const body = address(["/characters/human.bin", "the body"]);

        assert.equal(await (await worker.request(body)).text(), "the body");
        assert.ok(worker.kept(BOOT).includes(full(body)));
        assert.ok(!worker.kept(SHELL).includes(full("/characters/human.bin")), "its copy by name let go of");

        // One that's changed since: downloaded
        worker.clock.network = "online";
        worker.requests.length = 0;

        const chest = address(["/models/jmi/chest.glb", "a new chest"]);

        assert.equal(await (await worker.request(chest)).text(), "a new chest");
        assert.deepEqual(worker.requests.map(({ url }) => url), [full(chest)]);
    });

    it("keeps by hash what the cache before it saved by hash (asked for by the new release's pages before it took over), if the bytes are right", async () => {
        const body = address(["/characters/human.bin", "the body"]);
        const chest = address(["/models/jmi/chest.glb", "a chest"]);
        const worker = loadServiceWorker({ stored: { "pellagos-v1": { [body]: "the body", [chest]: "a different chest" } } });

        await worker.activate();

        assert.deepEqual(worker.kept(BOOT), [full(body)]);
        assert.deepEqual(worker.kept(SHELL), []);
    });

    it("clears out old copies: its own older versions and the game it replaced", async () => {
        const worker = loadServiceWorker({ stored: { "pellagos-v0": {}, "pellagos-v1": {}, [SHELL]: {}, "last-colony-v2": {}, "another-site-v1": {} } });

        await worker.activate();

        assert.deepEqual(worker.deleted, ["pellagos-v0", "pellagos-v1", "last-colony-v2"]);
    });

    it("lets go of nothing it keeps by hash until a page has said its release", async () => {
        const worker = loadServiceWorker({ stored: { [BOOT]: { [address(["/characters/human.bin", "the body"])]: "the body" } } });

        worker.clock.now += GRACE;
        await worker.activate();

        assert.equal(worker.kept(BOOT).length, 1);
    });

    it("lets go of what a release replaced or removed once no page open is on it, and keeps what it left as it was", async () => {
        const files = { "/characters/human.bin": "body 1", "/models/jmi/chest.glb": "a chest", "/models/dragon.glb": "dragon 1", "/models/wyvern.glb": "a wyvern" };
        const worker = loadServiceWorker({ files, open: ["page-1"] });
        const first = { boot: [["/characters/human.bin", "body 1"], ["/models/jmi/chest.glb", "a chest"]], assets: [["/models/dragon.glb", "dragon 1"], ["/models/wyvern.glb", "a wyvern"]] };

        await worker.tell("page-1", release("r1", first, 1));

        for (const file of [...first.boot, ...first.assets]) {
            await worker.request(address(file));
        }

        // The next release: the body and the dragon changed, the wyvern gone, the chest as it was
        const second = { boot: [["/characters/human.bin", "body 2"], ["/models/jmi/chest.glb", "a chest"]], assets: [["/models/dragon.glb", "dragon 2"]] };

        Object.assign(files, { "/characters/human.bin": "body 2", "/models/dragon.glb": "dragon 2" });
        worker.open.push("page-2");
        await worker.tell("page-2", release("r2", second, 2));

        for (const file of [...second.boot, ...second.assets]) {
            await worker.request(address(file), { page: "page-2" });
        }

        const all = () => [...worker.kept(BOOT), ...worker.kept(ASSETS)].sort();
        const urls = (...list) => list.map((file) => full(address(file))).sort();

        // (The first page still open: its release's files kept too)
        worker.clock.now += GRACE;
        await worker.tell("page-2", release("r2", second, 2));
        assert.deepEqual(all(), urls(...first.boot, ...first.assets, second.boot[0], ...second.assets));

        // Closed: the files only it listed let go of
        worker.open.splice(worker.open.indexOf("page-1"), 1);
        await worker.tell("page-2", release("r2", second, 2));
        assert.deepEqual(all(), urls(...second.boot, ...second.assets));

        // The chest downloaded once, whatever else the release changed
        assert.equal(worker.requests.filter(({ url }) => url.includes("/models/jmi/chest.glb")).length, 1);

        // The newest release's files kept with no page open (for starting offline)
        worker.open.length = 0;
        await worker.activate();
        assert.deepEqual(all(), urls(...second.boot, ...second.assets));
    });

    it("doesn't take a page open a while, telling its release again, as having the newest", async () => {
        const files = { "/characters/human.bin": "body 2" };
        const worker = loadServiceWorker({ files, open: ["page-1", "page-2"] });
        const first = { boot: [["/characters/human.bin", "body 1"]] };
        const second = { boot: [["/characters/human.bin", "body 2"]] };

        await worker.tell("page-1", release("r1", first, 1));
        await worker.tell("page-2", release("r2", second, 2));
        await worker.request(address(second.boot[0]), { page: "page-2" });

        // (An update's worker taking over: the old page tells its release again)
        await worker.tell("page-1", release("r1", first, 1));

        worker.open.length = 0;
        worker.clock.now += GRACE;
        await worker.activate();
        assert.deepEqual(worker.kept(BOOT), [full(address(second.boot[0]))]);
    });

    it("makes room by letting go of the catalog's least recently used files, never those needed to start", async () => {
        const files = { "/characters/human.bin": "a body that's needed to start", "/models/dragon.glb": "a".repeat(300), "/models/wyvern.glb": "b".repeat(300) };
        const assets = [["/models/dragon.glb", files["/models/dragon.glb"]], ["/models/wyvern.glb", files["/models/wyvern.glb"]]];
        const boot = [["/characters/human.bin", files["/characters/human.bin"]]];

        // Room for 400 bytes of the catalog's: half of what's free (200) and what they take (600)
        const worker = loadServiceWorker({ files, estimate: { quota: 1000, usage: 800 } });

        await worker.tell("page-1", release("r1", { boot, assets }, 1));

        for (const file of [...boot, ...assets]) {
            await worker.request(address(file));
            worker.clock.now += 1000;
        }

        // (The dragon used since the wyvern was kept)
        await worker.request(address(assets[0]));
        await worker.tell("page-1", release("r1", { boot, assets }, 1));

        assert.deepEqual(worker.kept(ASSETS), [full(address(assets[0]))]);
        assert.deepEqual(worker.kept(BOOT), [full(address(boot[0]))]);
    });

    it("counts a file the downloader read from what it keeps as used, when the page says so, so it isn't let go of first", async () => {
        const files = { "/characters/human.bin": "a body that's needed to start", "/models/dragon.glb": "a".repeat(300), "/models/wyvern.glb": "b".repeat(300) };
        const assets = [["/models/dragon.glb", files["/models/dragon.glb"]], ["/models/wyvern.glb", files["/models/wyvern.glb"]]];
        const boot = [["/characters/human.bin", files["/characters/human.bin"]]];
        const worker = loadServiceWorker({ files, estimate: { quota: 1000, usage: 800 } });

        await worker.tell("page-1", release("r1", { boot, assets }, 1));

        for (const file of [...boot, ...assets]) {
            await worker.request(address(file));
            worker.clock.now += 1000;
        }

        // (The dragon read by the downloader since the wyvern was kept: not asked for, told; and
        // another site's file told of, not taken)
        await worker.tell("page-1", { kind: "used", urls: [full(address(assets[0])), "https://elsewhere.example/models/dragon.glb"] });
        await worker.tell("page-1", release("r1", { boot, assets }, 1));

        assert.deepEqual(worker.kept(ASSETS), [full(address(assets[0]))]);
        assert.deepEqual(worker.kept(BOOT), [full(address(boot[0]))]);
    });

    it("keeps the parts of a model the downloader has so far (a download cut off by a reload carries on), till no release in use lists it or it's kept whole", async () => {
        const dragon = ["/models/dragon.glb", "a dragon"];
        const wyvern = ["/models/wyvern.glb", "a wyvern"];
        const chest = ["/models/chest.glb", "a chest"];
        const part = (file, from) => `${address(file)}&part=${from}`;
        const worker = loadServiceWorker({
            stored: {
                [PARTS]: { [part(dragon, 0)]: "a dra", [part(dragon, 5)]: "gon", [part(wyvern, 0)]: "a wy", [part(chest, 0)]: "a ch" },
                [ASSETS]: { [address(chest)]: "a chest" },
            },
        });

        // (Not let go of as an old copy, nor before a page has said its release)
        await worker.activate();
        assert.equal(worker.kept(PARTS).length, 4);

        // The dragon's being downloaded; the wyvern's no longer in the catalog; the chest's all here
        await worker.tell("page-1", release("r1", { assets: [dragon, chest] }, 1));
        assert.deepEqual(worker.kept(PARTS), [full(part(dragon, 0)), full(part(dragon, 5))]);
    });

    it("leaves other sites alone", async () => {
        const worker = loadServiceWorker();

        assert.equal(await worker.request("https://cdn.example.com/library.js"), undefined);
        assert.deepEqual(worker.requests, []);
    });
});

describe("the service worker's letting go (toLetGo)", () => {
    const { toLetGo } = loadServiceWorker().context;
    const now = 100 * 60000;
    const entries = [
        { url: "a", bytes: 100, used: 1 },
        { url: "b", bytes: 100, used: 3 },
        { url: "c", bytes: 100, used: 2 },
        { url: "boot", bytes: 1000, used: 0 },
        { url: "unlisted", bytes: 50, used: 0 },
        { url: "just kept", bytes: 10, used: now - 1000 },
    ];
    const releases = [{ boot: ["boot"], assets: ["a", "b", "c"] }];
    const urls = (list) => Array.from(list, ({ url }) => url);

    it("lets go of what no release in use lists, unless it was kept or used a moment ago", () => {
        assert.deepEqual(urls(toLetGo({ entries, releases, now })), ["unlisted"]);
        assert.deepEqual(urls(toLetGo({ entries, releases, now: now + GRACE })), ["unlisted", "just kept"]);
    });

    it("over budget, lets go of the catalog's least recently used first, until they fit; never the files needed to start", () => {
        assert.deepEqual(urls(toLetGo({ entries, releases, budget: 150, now })), ["unlisted", "a", "c"]);
        assert.deepEqual(urls(toLetGo({ entries, releases, budget: 0, now })), ["unlisted", "a", "c", "b"]);
        assert.deepEqual(urls(toLetGo({ entries, releases, budget: 300, now })), ["unlisted"]);
    });

    it("keeps what any release in use lists", () => {
        assert.deepEqual(urls(toLetGo({ entries, releases: [...releases, { boot: ["unlisted"], assets: [] }], now })), []);
    });
});
