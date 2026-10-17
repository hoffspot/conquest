import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorldServer } from "../server/world-server.js";
import { FakeNetwork } from "../test/fake-bonjour.js";
import { expect, test } from "./fixtures.js";

// Nearby servers on the Wi-Fi (generated/world_server_plan.md §8.2, §15 S5), in a browser: two
// world servers on a fake Bonjour network find each other; a player who adds the one sees the
// other under it, "Nearby", and adds it with a tap (its id expected, its listed world shown); and
// the management page says the server's shown on the Wi-Fi, and lists the one it found.

test.describe.configure({ mode: "default" });

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const network = new FakeNetwork();
const servers = [];
const folders = [];

async function serve(name) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-nearby-"));
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), name, bonjour: network.bonjour("127.0.0.1") });

    folders.push(folder);
    servers.push(server);
    server.nearby.lookup = (host) => network.lookup(host);
    await server.listen(0, "127.0.0.1");

    return server;
}

let studio;
let sams;

test.beforeAll(async () => {
    network.addresses.set("127.0.0.1", "127.0.0.1");
    studio = await serve("Studio Mac");
    sams = await serve("Sam's Mac");
    await sams.createWorld({ name: "Riverhold", seed: 9, race: "elf", settings: { listed: true } });
    sams.nearby.settle = 1;
    sams.nearby.refresh();
    await studio.listenAdmin(0);
    await expect.poll(() => studio.nearby.list()[0]?.worlds, { timeout: 10000 }).toBe(1);
});

test.afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

test("a server found near the one a player knows, listed under it and added with a tap; and the management page saying so", async ({ page }) => {
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${studio.port}/`);
    await page.locator("#worldsbutton").click();

    const worlds = page.locator("#worlds");

    await page.locator("#worldsaddress").fill(`127.0.0.1:${studio.port}`);
    await worlds.getByRole("button", { name: "Add", exact: true }).click();
    await expect(worlds.locator(`li[data-server="127.0.0.1:${studio.port}"] .name`)).toHaveText("Studio Mac", { timeout: 30000 });

    // (The other, nearby: found by the one known)
    const near = worlds.locator(`li.nearby[data-nearby="${sams.identity.id}"]`);

    await expect(near).toContainText("Sam's Mac");
    await expect(near).toContainText("On the Wi-Fi with Studio Mac · 1 world listed");
    await near.locator("button").click();

    const added = worlds.locator(`li[data-server="127.0.0.1:${sams.port}"]`);

    await expect(added.locator(".name")).toHaveText("Sam's Mac", { timeout: 30000 });
    await expect(added).toContainText("Version");
    await expect(worlds.locator("li[data-world]", { hasText: "Riverhold" })).toBeVisible();
    await expect(near).toHaveCount(0);

    // (Known by the id it advertised: the one it must prove)
    const known = await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.servers")));

    expect(JSON.stringify(known)).toContain(sams.identity.id);

    // The management page: shown on the Wi-Fi, and the server it found
    await page.goto(`http://localhost:${studio.adminPort}/`);
    await expect(page.locator("#overview")).toContainText("Shown to others on the Wi-Fi as “Studio Mac”");
    await expect(page.locator(`#overview tr[data-nearby="${sams.identity.id}"]`)).toContainText("Sam's Mac");
    expect(errors).toEqual([]);
});
