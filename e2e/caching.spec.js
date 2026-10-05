import { expect, test } from "./fixtures.js";

// The service worker (client/sw.js) in a real browser: the game's data kept by the hash of its
// bytes and never downloaded again, what no release in use lists let go of, and the game started
// offline (generated/asset_streaming_plan.md, section 5).

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

    // What this release keeps by hash: the manifest's data
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

    // Loaded again, through the worker: each kept as it's downloaded, the older copy let go of
    const fetched = [];

    context.on("request", (request) => {
        if (request.url().includes("?h=")) {
            fetched.push({ url: request.url(), byWorker: Boolean(request.serviceWorker()) });
        }
    });

    await title(page, () => page.reload());
    await expect.poll(() => kept(page), { timeout: 30000 }).toEqual(listed);
    expect(listed).not.toContain(older);

    // And again: each asked for by the page and answered from what's kept, none downloaded
    fetched.length = 0;
    await title(page, () => page.reload());
    expect(fetched.filter(({ byWorker }) => !byWorker).map(({ url }) => url).sort()).toEqual(listed);
    expect(fetched.filter(({ byWorker }) => byWorker)).toEqual([]);

    // The worker knows the page's release
    const state = await page.evaluate(async () => (await (await caches.open("pellagos-state-v2")).match(new URL("sw-state.json", document.baseURI).href))?.json());
    const { ASSETS } = await page.evaluate(() => import("./js/app/assets.js").then(({ ASSETS }) => ({ ASSETS: { release: ASSETS.release } })));

    expect(state.newest).toBe(ASSETS.release);
    expect(state.releases[ASSETS.release].boot.sort()).toEqual(listed);

    // Offline, the game starts all the same
    await context.setOffline(true);
    await title(page, () => page.reload());
    await expect(page.locator("#titlename")).toHaveText("Pellagos");
});
