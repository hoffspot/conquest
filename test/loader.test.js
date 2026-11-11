// The loader (client/js/app/loader.js): every file fetched by its hash, what came from this device
// (a copy the service worker keeps, which says so) told from what was downloaded; and the game's
// downloads asked to be kept for good only where it's installed (client/js/app/device.js
// keepDownloads), where browsers grant it without asking
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keptBy, Loader } from "../client/js/app/loader.js";

// (device.js asks the page what shape the screen is as it's loaded)
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { keepDownloads } = await import("../client/js/app/device.js");

const BASE = "https://example.github.io/conquest/";

describe("the loader (loader.js)", () => {
    it("fetches every file by its hash, counting what came from this device apart from what was downloaded, and keeps only the data", async () => {
        const manifest = [
            { id: "code", files: [["js/app/game.js", 300, "0123456789"]] },
            { id: "body", files: [["characters/vitruvian.bin", 500, "abcdefabcd"]] },
        ];
        const fetched = [];
        const fetch = globalThis.fetch;

        globalThis.fetch = async (url) => {
            fetched.push(url);

            // (The code's kept by the service worker; the body's downloaded)
            return new Response(new Uint8Array(url.includes("game.js") ? 300 : 500), { status: 200, headers: url.includes("game.js") ? { "X-Pellagos-Kept": "1" } : {} });
        };

        try {
            const loader = new Loader(manifest, { base: BASE });

            await loader.load();

            assert.deepEqual(fetched.toSorted(), [`${BASE}characters/vitruvian.bin?h=abcdefabcd`, `${BASE}js/app/game.js?h=0123456789`]);
            assert.deepEqual({ loaded: loader.loaded, kept: loader.kept, downloaded: loader.downloaded }, { loaded: 800, kept: 300, downloaded: 500 });
            assert.ok(loader.files.has(`${BASE}characters/vitruvian.bin`));
            assert.ok(!loader.files.has(`${BASE}js/app/game.js`));
        } finally {
            globalThis.fetch = fetch;
        }
    });

    it("on a visit after the first, asks the service worker which files it keeps and doesn't ask for those it only downloads: the code, the fonts, the WebAssembly; the data it reads is still read", async () => {
        const manifest = [
            { id: "code", files: [["js/app/game.js", 300, "0123456789"], ["js/app/hud.js", 200, "1111111111"], ["js/app/new.js", 100, "2222222222"]] },
            { id: "navigation", files: [["vendor/recast/recast.wasm", 400, "3333333333"]] },
            { id: "body", files: [["characters/vitruvian.bin", 500, "abcdefabcd"]] },
        ];
        const address = (path, hash) => `${BASE}${path}?h=${hash}`;
        const keeps = [address("js/app/game.js", "0123456789"), address("js/app/hud.js", "1111111111"), address("vendor/recast/recast.wasm", "3333333333"), address("characters/vitruvian.bin", "abcdefabcd")];
        const asked = [];
        const fetched = [];
        const fetch = globalThis.fetch;

        // (The worker, as sw.js answers: of the addresses asked about, those it keeps)
        const worker = {
            postMessage: (message, [port]) => {
                asked.push(message);
                port.postMessage({ kept: message.urls.filter((url) => keeps.includes(url)) });
            },
        };

        globalThis.fetch = async (url) => {
            fetched.push(url);

            return new Response(new Uint8Array(url.includes("new.js") ? 100 : 500), { status: 200, headers: keeps.includes(url) ? { "X-Pellagos-Kept": "1" } : {} });
        };

        try {
            const loader = new Loader(manifest, { base: BASE, worker });
            const heard = [];

            await loader.load(() => heard.push(loader.loaded));

            // (Asked once, only about what it doesn't read itself: not the body)
            assert.deepEqual(asked, [{ kind: "kept", urls: [address("js/app/game.js", "0123456789"), address("js/app/hud.js", "1111111111"), address("js/app/new.js", "2222222222"), address("vendor/recast/recast.wasm", "3333333333")] }]);

            // (Only the file it doesn't keep downloaded, and the body read from what it keeps)
            assert.deepEqual(fetched.toSorted(), [address("characters/vitruvian.bin", "abcdefabcd"), address("js/app/new.js", "2222222222")]);
            assert.deepEqual({ loaded: loader.loaded, total: loader.total, kept: loader.kept, downloaded: loader.downloaded }, { loaded: 1500, total: 1500, kept: 1400, downloaded: 100 });
            assert.deepEqual(loader.groups.map(({ id, loaded, done }) => [id, loaded, done]), [["code", 600, 3], ["navigation", 400, 1], ["body", 500, 1]]);
            assert.ok(loader.groups.every(({ time }) => time >= 0));
            assert.ok(loader.files.has(`${BASE}characters/vitruvian.bin`));
            assert.equal(heard.at(-1), 1500);
            assert.ok(heard.includes(300), "each kept file told as it's counted");
        } finally {
            globalThis.fetch = fetch;
        }
    });

    it("asks for everything as before when no service worker looks after the page, or one that doesn't say what it keeps (an older release's)", async () => {
        const urls = [`${BASE}js/app/game.js?h=0123456789`];
        const silent = { postMessage: () => {} };
        const broken = {
            postMessage: () => {
                throw new Error("gone");
            },
        };
        const muddled = { postMessage: (_, [port]) => port.postMessage({ kept: "all of them" }) };

        assert.deepEqual([...(await keptBy(null, urls))], []);
        assert.deepEqual([...(await keptBy(silent, urls, 20))], []);
        assert.deepEqual([...(await keptBy(broken, urls))], []);
        assert.deepEqual([...(await keptBy(muddled, urls))], []);
        assert.deepEqual([...(await keptBy(silent, []))], [], "nothing to ask about");

        const fetched = [];
        const fetch = globalThis.fetch;

        globalThis.fetch = async (url) => {
            fetched.push(url);

            return new Response(new Uint8Array(300), { status: 200 });
        };

        try {
            const loader = new Loader([{ id: "code", files: [["js/app/game.js", 300, "0123456789"]] }], { base: BASE, worker: broken });

            await loader.load();
            assert.deepEqual(fetched, urls);
            assert.deepEqual({ loaded: loader.loaded, kept: loader.kept, downloaded: loader.downloaded }, { loaded: 300, kept: 0, downloaded: 300 });
        } finally {
            globalThis.fetch = fetch;
        }
    });
});

describe("the game's downloads kept for good (device.js keepDownloads)", () => {
    it("asks only where the game's installed, and not again once it's granted; nothing where it can't be asked", async () => {
        const asked = [];
        const storage = (persisted) => ({ persisted: async () => persisted, persist: async () => asked.push("persist") > 0 });

        assert.equal(await keepDownloads(storage(false), false), false);
        assert.deepEqual(asked, []);
        assert.equal(await keepDownloads(storage(false), true), true);
        assert.deepEqual(asked, ["persist"]);
        assert.equal(await keepDownloads(storage(true), true), true);
        assert.deepEqual(asked, ["persist"]);
        assert.equal(await keepDownloads(undefined, true), false);
        assert.equal(await keepDownloads({ persist: async () => { throw new Error("refused"); } }, true), false);
    });
});
