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

// Ten minutes and a moment: past the time a file just kept is kept whatever the releases say
const GRACE = 10 * 60000 + 1;

const full = (path) => (path.startsWith("/") ? `${ORIGIN}${path}` : path);

/** A file's hash, as scripts/build-manifest.js makes it. */
const hashOf = (body) => createHash("sha256").update(body).digest("hex").slice(0, 10);

// Load sw.js with a fake network that answers every request with `files[path]` (or "new version"),
// the way GitHub Pages does (whatever the query, letting browsers reuse the file for ten minutes),
// and with the network failing if asked. `stored` is what the caches hold to start with
// ({ name: { path: body } }), `open` the pages open (their ids), `estimate` what the browser says
// of its storage.
function loadServiceWorker({ offline = false, stored = {}, files = {}, open = ["page-1"], estimate } = {}) {
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
            clients: { claim: async () => {}, matchAll: async () => open.map((id) => ({ id })) },
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
            const response = new Response(body, { status: 200, headers: { "Cache-Control": "max-age=600", "Content-Type": "text/javascript" } });

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
    const request = async (path, { mode = "cors", page = "page-1", range } = {}) => {
        let responded;
        const waiting = [];

        handlers.fetch({
            request: { url: full(path), method: "GET", mode, headers: new Headers(range ? { range } : {}) },
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

    const activate = async () => {
        const waiting = [];

        handlers.activate({ waitUntil: (promise) => waiting.push(promise) });
        await finish(waiting);
    };

    // The addresses a cache holds
    const kept = (name) => [...(store.get(name)?.keys() ?? [])];

    return { request, requests, tell, activate, kept, deleted, clock, files, open, names: () => [...store.keys()], context };
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
