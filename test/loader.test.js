// The loader (client/js/app/loader.js): every file fetched by its hash, what came from this device
// (a copy the service worker keeps, which says so) told from what was downloaded; and the game's
// downloads asked to be kept for good only where it's installed (client/js/app/device.js
// keepDownloads), where browsers grant it without asking
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Loader } from "../client/js/app/loader.js";

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
