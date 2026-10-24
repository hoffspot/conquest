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

    // A copy an older release kept: let go of once a page says its release (and none lists it)
    const older = await page.evaluate(async () => {
        const url = new URL("characters/human.bin?h=0000000000", document.baseURI).href;

        await (await caches.open("pellagos-boot-v2")).put(url, new Response("an older body"));

        return url;
    });

    // Loaded again, through the worker: each kept as it's downloaded (the manifest's data, and the
    // code, which the page asks for by hash too: its import map), the older copy let go of
    const fetched = [];
    const asked = () => [...new Set(fetched.filter(({ byWorker }) => !byWorker).map(({ url }) => url))].sort();

    context.on("request", (request) => {
        if (request.url().includes("?h=")) {
            fetched.push({ url: request.url(), byWorker: Boolean(request.serviceWorker()) });
        }
    });

    await title(page, () => page.reload());

    const loaded = asked();

    expect(loaded).toEqual(expect.arrayContaining(listed));
    expect(loaded).toContainEqual(expect.stringMatching(/\/js\/main\.js\?h=[0-9a-f]{10}$/));
    await expect.poll(() => kept(page), { timeout: 30000 }).toEqual(loaded);
    expect(loaded).not.toContain(older);

    // And again: each asked for by the page and answered from what's kept, none downloaded
    fetched.length = 0;
    await title(page, () => page.reload());
    expect(asked()).toEqual(loaded);
    expect(fetched.filter(({ byWorker }) => byWorker)).toEqual([]);

    // The worker knows the page's release, which lists all it keeps
    const state = await page.evaluate(async () => (await (await caches.open("pellagos-state-v2")).match(new URL("sw-state.json", document.baseURI).href))?.json());
    const { ASSETS } = await page.evaluate(() => import("./js/app/assets.js").then(({ ASSETS }) => ({ ASSETS: { release: ASSETS.release } })));

    expect(state.newest).toBe(ASSETS.release);
    expect(state.releases[ASSETS.release].boot).toEqual(expect.arrayContaining(loaded));

    // Offline, the game starts all the same
    await context.setOffline(true);
    await title(page, () => page.reload());
    await expect(page.locator("#titlename")).toHaveText("Pellagos");
});
