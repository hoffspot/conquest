// Updates downloaded in the background (client/js/app/updater.js): the page asks for itself afresh
// every so often, and a release whose name isn't its own is new; the service worker's asked to
// download its files (its import map's, its manifest's, main.js's); once they're there, an update's
// ready. The same release, a release being downloaded, a page that names nothing, no service
// worker, or no network: nothing's asked
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { releaseFrom, Updater, UPDATES } from "../client/js/app/updater.js";

const BASE = "https://example.github.io/conquest/";

// A release's page, manifest and catalog, as the build writes them (scripts/build-manifest.js)
function releaseNamed(name, { game = "0123456789" } = {}) {
    const map = {
        imports: {
            three: "./vendor/three-r186/three.module.min.js?h=aaaaaaaaaa",
            "three/addons/": "./vendor/three-r186/addons/",
            "./js/app/game.js": `./js/app/game.js?h=${game}`,
            "./js/app/manifest.js": `./js/app/manifest.js?h=${name.slice(0, 9)}1`,
            "./js/app/assets.js": `./js/app/assets.js?h=${name.slice(0, 9)}2`,
        },
    };
    const html = `<!DOCTYPE html><html><head><script type="importmap">\n${JSON.stringify(map, null, 4)}\n</script><script type="module" src="js/main.js?h=bbbbbbbbbb"></script></head></html>`;
    const modules = {
        [new URL(map.imports["./js/app/manifest.js"], BASE).href]: { MANIFEST: [{ id: "body", files: [["characters/vitruvian.bin", 100, "cccccccccc"]] }] },
        [new URL(map.imports["./js/app/assets.js"], BASE).href]: { ASSETS: { release: name, models: { barrel: { files: [{ path: "models/barrel.gltf", hash: "dddddddddd" }] } } } },
    };

    return { html, load: async (url) => modules[url] };
}

// An updater on a page of release `own`, the server's page being `served`, its messages to the
// service worker kept (or none taken: no service worker), its clock moved on by `pass(ms)`
function updating({ own = "e000000001", served = releaseNamed("e000000002"), worker = true, offline = false } = {}) {
    let time = 0;
    const posted = [];
    const fetched = [];
    const updater = new Updater({
        release: own,
        base: BASE,
        post: (message) => (worker ? posted.push(message) : false),
        fetch: async (url, options) => {
            fetched.push({ url, options });

            if (offline) {
                throw new TypeError("Failed to fetch");
            }

            return new Response(served.html, { status: 200 });
        },
        load: served.load,
        now: () => time,
    });

    return { updater, posted, fetched, pass: (ms) => (time += ms), served };
}

describe("updates downloaded in the background (updater.js)", () => {
    it("reads a release's files from its page: its modules, main.js, its manifest's and its catalog's, by hash; nothing from a page that doesn't name them", async () => {
        const { html, load } = releaseNamed("e000000002");
        const release = await releaseFrom(html, BASE, load);

        assert.equal(release.release, "e000000002");
        assert.ok(release.boot.includes(`${BASE}js/app/game.js?h=0123456789`));
        assert.ok(release.boot.includes(`${BASE}js/main.js?h=bbbbbbbbbb`));
        assert.ok(release.boot.includes(`${BASE}characters/vitruvian.bin?h=cccccccccc`));
        assert.ok(release.boot.includes(`${BASE}vendor/three-r186/three.module.min.js?h=aaaaaaaaaa`));
        assert.deepEqual(release.assets, [`${BASE}models/barrel.gltf?h=dddddddddd`]);
        assert.equal(await releaseFrom("<html>no map</html>", BASE, load), null);
    });

    it("looks every so often, not before: the page, afresh; a newer release, the service worker's asked to download it", async () => {
        const { updater, posted, fetched, pass } = updating();

        await updater.check();
        assert.deepEqual(fetched, []);

        pass(UPDATES.every);
        await updater.check();
        assert.deepEqual(fetched.map(({ url, options }) => [url, options.cache]), [[`${BASE}index.html`, "no-store"]]);
        assert.equal(posted.length, 1);
        assert.equal(posted[0].kind, "prefetch");
        assert.equal(posted[0].release, "e000000002");
        assert.ok(posted[0].boot.includes(`${BASE}js/app/game.js?h=0123456789`));

        // (Asked to look straight away, as the title screen does after a while: already downloading it)
        await updater.check({ asked: true });
        assert.equal(posted.length, 1);
    });

    it("finds nothing new in its own release, and asks nothing with no service worker or no network", async () => {
        for (const { options, posts } of [
            { options: { own: "e000000002" }, posts: 0 },
            { options: { worker: false }, posts: 0 },
            { options: { offline: true }, posts: 0 },
        ]) {
            const { updater, posted } = updating(options);

            await updater.check({ asked: true });
            assert.equal(posted.length, posts, JSON.stringify(options));
            assert.equal(updater.next, null);
        }
    });

    it("hears how far the download's got and when it's all there (an update ready), only of its own; one not all there is asked for again", async () => {
        const { updater, posted } = updating();
        const heard = [];

        updater.onProgress = (progress) => heard.push(progress);
        updater.onReady = (release) => heard.push(release.release);

        await updater.check({ asked: true });
        updater.heard({ kind: "prefetching", release: "someother", done: 1, total: 2 });
        updater.heard({ kind: "prefetching", release: "e000000002", done: 1, total: 2 });
        assert.deepEqual(heard, [{ done: 1, total: 2 }]);

        // (Not all of it: asked for again at the next look)
        updater.heard({ kind: "unfetched", release: "e000000002" });
        assert.equal(updater.ready, null);
        await updater.check({ asked: true });
        assert.equal(posted.length, 2);

        updater.heard({ kind: "prefetched", release: "e000000002" });
        assert.equal(updater.ready.release, "e000000002");
        assert.deepEqual(heard, [{ done: 1, total: 2 }, "e000000002"]);

        // (Ready: no more looking)
        await updater.check({ asked: true });
        assert.equal(posted.length, 2);
    });
});
