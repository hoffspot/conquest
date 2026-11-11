import { expect, test } from "./fixtures.js";

// The service worker (client/sw.js) in a real browser: the game's data and code kept by the hash
// of their bytes and never downloaded again, what no release in use lists let go of, and the game
// started offline (generated/asset_streaming_plan.md, section 5; generated/game_delivery_plan.md).

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function title(page, load) {
    await load();
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
}

// The addresses the worker keeps by hash for what the game needs to start, sorted
const kept = (page) => page.evaluate(async () => (await (await caches.open("pellagos-boot-v2")).keys()).map(({ url }) => url).sort());

test("keeps the game's data by its hash, downloads none of it again, lets go of what no release lists, and starts offline", async ({ page }) => {
    const context = page.context();

    await title(page, () => page.goto("/"));

    // (The worker running, and in charge of the page)
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;

        if (!navigator.serviceWorker.controller) {
            await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
        }
    });

    // What this release keeps by hash of the data it downloads before it starts: the manifest's
    const listed = await page.evaluate(async () => {
        const { MANIFEST } = await import("./js/app/manifest.js");

        return MANIFEST.flatMap(({ files }) => files.filter(([, , hash]) => hash).map(([path, , hash]) => new URL(`${path}?h=${hash}`, document.baseURI).href)).sort();
    });

    expect(listed.length).toBeGreaterThan(5);

    // (All of it kept by now: the loader downloaded each through the worker, which keeps one once
    // it's all come and checked)
    const missing = async (urls) => {
        const all = await kept(page);

        return urls.filter((url) => !all.includes(url));
    };

    // (And what the page asked for itself before the worker took over, which it's asked to keep
    // from the browser's own copies: its style sheet, the modules it preloads and main.js)
    const own = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"], script[type="module"][src]')].map((each) => each.href || each.src).filter((url) => /\?h=[0-9a-f]{10}$/.test(url)));

    expect(own.length).toBeGreaterThan(60);
    await expect.poll(() => missing([...listed, ...own]), { timeout: 30000 }).toEqual([]);

    // A copy an older release kept: let go of once a page says its release (and none lists it)
    const older = await page.evaluate(async () => {
        const url = new URL("characters/human.bin?h=0000000000", document.baseURI).href;

        await (await caches.open("pellagos-boot-v2")).put(url, new Response("an older body"));

        return url;
    });

    // Loaded again, through the worker. The loader asks it which of the manifest's files it keeps,
    // and asks only for the data it reads itself; the code's first asked for as the page imports it
    // (by hash too: its import map), so what isn't imported before the title isn't asked for at
    // all: playing together's, say. (It used to ask for every file, only to count it.) What it does
    // ask for, the worker answers from what it keeps; the older copy's let go of
    const fetched = [];
    const asked = () => [...new Set(fetched.filter(({ byWorker }) => !byWorker).map(({ url }) => url))].sort();

    context.on("request", (request) => {
        if (request.url().includes("?h=")) {
            fetched.push({ url: request.url(), byWorker: Boolean(request.serviceWorker()) });
        }
    });

    await title(page, () => page.reload());

    const loaded = asked();
    const data = listed.filter((url) => /\.(json|bin|jpg|png|gltf)\?h=/.test(url));
    const together = listed.find((url) => /\/js\/app\/together\.js\?h=/.test(url));

    expect(data.length).toBeGreaterThan(5);
    expect(loaded).toEqual(expect.arrayContaining(data));
    expect(loaded).toContainEqual(expect.stringMatching(/\/js\/main\.js\?h=[0-9a-f]{10}$/));
    expect(loaded).toContainEqual(expect.stringMatching(/\/js\/app\/game\.js\?h=[0-9a-f]{10}$/));
    expect(loaded).toContainEqual(expect.stringMatching(/\/styles\.css\?h=[0-9a-f]{10}$/));
    expect(loaded).toEqual(expect.arrayContaining(own));

    // (Not asked for: what's only downloaded to be kept, and isn't imported before the title)
    const unasked = listed.filter((url) => !loaded.includes(url));

    expect(together).toBeTruthy();
    expect(unasked).toContain(together);
    expect(unasked.length).toBeGreaterThan(10);
    expect(fetched.filter(({ byWorker }) => byWorker)).toEqual([]);
    expect(await missing([...listed, ...loaded])).toEqual([]);
    await expect.poll(async () => (await kept(page)).includes(older), { timeout: 30000 }).toBe(false);

    // And again: the same asked for by the page and answered from what's kept, none downloaded
    fetched.length = 0;
    await title(page, () => page.reload());
    expect(asked()).toEqual(loaded);
    expect(fetched.filter(({ byWorker }) => byWorker)).toEqual([]);

    // (And the loading screen knew: all of it from this device)
    expect(await page.evaluate(() => ({ loaded: window.pellagos.loader.loaded === window.pellagos.loader.total, kept: window.pellagos.loader.kept === window.pellagos.loader.total, downloaded: window.pellagos.loader.downloaded }))).toEqual({ loaded: true, kept: true, downloaded: 0 });

    // The worker knows the page's release, which lists all it keeps: those files, and no others
    const state = await page.evaluate(async () => (await (await caches.open("pellagos-state-v2")).match(new URL("sw-state.json", document.baseURI).href))?.json());
    const { ASSETS } = await page.evaluate(() => import("./js/app/assets.js").then(({ ASSETS }) => ({ ASSETS: { release: ASSETS.release } })));

    expect(state.newest).toBe(ASSETS.release);
    expect(state.releases[ASSETS.release].boot).toEqual(expect.arrayContaining([...listed, ...loaded]));
    expect(await kept(page)).toEqual(state.releases[ASSETS.release].boot.toSorted());

    // Offline, the game starts all the same
    await context.setOffline(true);
    await title(page, () => page.reload());
    await expect(page.locator("#titlename")).toHaveText("Pellagos");
});
