import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { WorldServer } from "../server/world-server.js";
import { expect, test } from "./fixtures.js";

// A world server of another version than the page's (generated/multiplayer_scaling_plan.md F-5).
// The game's website is published minutes after a change is merged and a server updates itself
// overnight, so the two differ for some hours of most days. A game the server turns away for
// being the older says so, with what to do; if it has the update downloaded already, it starts
// it at once. And a page that isn't the server's own sends a tap on a world open to anyone to
// the game on the server itself, which always matches it.

test.describe.configure({ mode: "default" });

// Short codes hashed cheaply (the server's own cost is for a Mac, not a test)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const SAVE = {
    version: 1,
    seed: 777,
    created: "2026-10-13T12:00:00.000Z",
    hero: {
        name: "Ivo",
        weapon: "sword",
        race: "human",
        parts: [],
        shape: { macro: { gender: 0.5, muscle: 0.5, weight: 0.4, height: 0.5, bust: 0.4, african: 0.2, asian: 0.2, caucasian: 0.6 }, details: {} },
        look: { skin: { tone: "#d9b394" }, eyes: { iris: "#5a7a3a" }, hair: { style: "short", beard: "none", colour: "#3a2a1a" } },
    },
};

let server;
let folder;
let base;
let world;

test.beforeAll(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-version-"));
    server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), interfaces: { lo: [{ address: "127.0.0.1", family: "IPv4", internal: false }] } });
    await server.settings.change({ setAsideMinutes: 0 });
    await server.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${server.port}`;
    world = (await server.createWorld({ name: "Openfield", seed: 43, race: "human", heroes: "brought", settings: { open: true } })).world;
});

test.afterAll(async () => {
    await server?.close();
    await rm(folder, { recursive: true, force: true });
});

async function ready(page, more = {}) {
    await page.addInitScript(
        ({ settings, character, more }) => {
            localStorage.setItem("pellagos.settings", JSON.stringify(settings));
            localStorage.setItem("pellagos.save", JSON.stringify(character));

            for (const [key, value] of Object.entries(more)) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        },
        { settings: { quality: "low", renderScale: 0.5, shadows: false }, character: SAVE, more },
    );
    page.on("pageerror", (error) => {
        throw error;
    });
}

test("a server newer than the game turns it away: told to reload; with the update downloaded already, the page's loaded again at once", async ({ page }) => {
    await ready(page);

    // (The server updated since this page was loaded: it answers a game of the version before)
    await page.route(`${base}/api/v1/enter`, (route) =>
        route.fulfill({ status: 409, json: { error: "version", message: "That server plays another version of the game than yours: open the game from the server itself.", net: NET_VERSION + 1, version: "99.0.0" } }),
    );
    await page.goto(`${base}/`);

    const row = page.locator(`#titleserver li[data-world="${world}"]`);

    await expect(row).toContainText("Open to anyone: tap to join", { timeout: 30000 });
    await row.getByRole("button").click();

    // (No update downloaded: told which is the newer, and what to do)
    await expect(page.locator("#worldsstatus")).toHaveText(/^That server plays a newer version of the game than yours\. Reload this page for the newest version/, { timeout: 30000 });
    expect(await page.evaluate(() => window.pellagos.updater.ready)).toBeNull();

    // (The update all downloaded, as the updater says once it is: the page's loaded again at once)
    await page.evaluate(() => {
        window.before = true;
        window.pellagos.updater.ready = { release: "next" };
    });
    await Promise.all([page.waitForEvent("load", { timeout: 60000 }), page.locator(`#worldslist li[data-world="${world}"]`).getByRole("button").click()]);
    await expect(page.locator(`#titleserver li[data-world="${world}"]`)).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.before)).toBeUndefined();
});

test("from a page that isn't the server's own, a world open to anyone on a server of another version opens the game from the server itself", async ({ page }) => {
    const key = `127.0.0.1:${server.port}`;

    await ready(page, { "pellagos.servers": { version: 1, servers: [{ key, host: "127.0.0.1", port: server.port, secure: false, name: "Studio Mac" }] } });

    // (The server's card as it is, but of the version after this page's; answered to this page,
    // which the server itself wouldn't take a game from)
    await page.route(`${base}/api/v1/status`, async (route) => {
        const card = await (await fetch(`${base}/api/v1/status`)).json();

        await route.fulfill({ json: { ...card, server: { ...card.server, net: NET_VERSION + 1 } }, headers: { "Access-Control-Allow-Origin": "*" } });
    });
    await page.goto("/");
    await page.locator("#multiplayerbutton").click();
    await page.locator("#mpjoinserver").click();

    const head = page.locator(`#worlds li[data-server="${key}"]`);
    const row = page.locator(`#worlds li[data-world="${world}"]`);

    await expect(head).toContainText("That server plays a newer version of the game than yours", { timeout: 30000 });
    await expect(head.getByRole("link", { name: "Open the game from this server" })).toBeVisible();
    await expect(row).toContainText("Openfield");
    await expect(row).toContainText("Open to anyone: tap to open the game from its server");
    await expect(row.getByRole("button")).toBeEnabled();
    await row.getByRole("button").click();
    await page.waitForURL((url) => url.origin === base, { timeout: 60000 });
});
