import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorldServer } from "../server/world-server.js";
import { expect, test } from "./fixtures.js";

// The world server's management page (generated/world_server_plan.md §10, §15 S4), in a browser, as
// its owner uses it on the server's own computer: a world made, started and set aside, backed up by
// hand and restored, a player's lost ticket reissued (the old one no longer works, the new one
// does), exported, deleted with its name typed, and brought in again from its export. And from
// the Wi-Fi, the page asks for the admin key first.

test.describe.configure({ mode: "default" });

// Short codes hashed cheaply (the server's own cost is for a Mac, not a test)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

let server;
let folder;

test.beforeAll(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-admin-"));
    server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });
    await server.listen(0, "127.0.0.1");
    await server.listenAdmin(0);
});

test.afterAll(async () => {
    await server?.close();
    await rm(folder, { recursive: true, force: true });
});

// A call to the play port's API, as a player's game makes it: { status, json }
async function enter(body) {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/v1/enter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    return { status: response.status, json: await response.json() };
}

test("the management page on the server's computer: a world made, started, set aside, backed up and restored, a player's ticket reissued, exported, deleted with its name typed, and brought in again", async ({ page }) => {
    test.setTimeout(240000);

    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://localhost:${server.adminPort}/`);

    // (On the computer itself: no key asked for, the admin key shown)
    await expect(page.locator("#who")).toContainText("on this computer");
    await expect(page.locator("#overview")).toContainText(server.adminKey);
    await expect(page.locator("#overview")).toContainText(server.identity.id);

    // A world made
    await page.locator('[data-tab="new"]').click();
    await page.locator('#new [name="name"]').fill("Ashby");
    await page.locator('#new [name="seed"]').fill("5");
    await page.locator('#new [name="heroes"]').selectOption("kept");
    await page.locator('#new button[type="submit"]').click();

    const shown = page.locator("#shown");

    await expect(shown.locator("#showntitle")).toHaveText("Ashby is made");

    const [ownerKey, playerKey] = await shown.locator(".shown-value").allTextContents();

    expect(playerKey).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){5}$/);
    await expect(shown.locator("a").first()).toHaveAttribute("href", new RegExp(`#server=localhost%3A${server.port}&id=${server.identity.id}&world=[a-z0-9]{10}&key=${ownerKey}$`));
    await page.locator("#shownclose").click();

    const card = page.locator("#worlds .card", { hasText: "Ashby" });

    await expect(card).toBeVisible();
    await expect(card.locator(".life")).toHaveText("Set aside");
    await expect(card).toContainText("Never played");

    const world = await card.getAttribute("data-world");

    // Started, saved by hand, then set aside: saved
    await card.getByRole("button", { name: "Start" }).click();
    await expect(page.locator("#status")).toHaveText("Ashby is open.", { timeout: 60000 });
    await card.getByRole("button", { name: "Save now" }).click();
    await expect(page.locator("#status")).toHaveText("Ashby is saved.", { timeout: 60000 });
    await expect(card.getByRole("button", { name: "Set aside" })).toBeVisible();
    await card.getByRole("button", { name: "Set aside" }).click();
    await expect(page.locator("#status")).toHaveText("Ashby is set aside: saved, and using nothing.", { timeout: 60000 });
    await expect(card.locator(".life")).toHaveText("Set aside");
    await expect(card.locator(".words")).toContainText("Set aside: saved at day 1");

    // Backed up by hand, and restored from it (backed up as it was first)
    await card.getByRole("button", { name: "Backups" }).click();

    const dialog = page.locator("#world");

    await expect(dialog.locator("#worldname")).toHaveText("Ashby");
    await expect(dialog.locator("tbody tr", { hasText: "The latest save" })).toBeVisible();
    await dialog.getByRole("button", { name: "Back up now" }).click();

    const byHand = dialog.locator("tbody tr", { hasText: "Made by hand" });

    await expect(byHand).toBeVisible({ timeout: 30000 });
    await byHand.getByRole("button", { name: "Restore" }).click();
    await expect(page.locator("#confirmtitle")).toHaveText("Restore Ashby");
    await page.locator("#confirmgo").click();
    await expect(dialog.locator("tbody tr", { hasText: "Before a restore" })).toBeVisible({ timeout: 30000 });

    // A player who's lost their ticket given a new one: the old no longer works, the new one does
    const first = await enter({ world, key: playerKey });

    expect(first.status).toBe(200);
    await dialog.locator('[data-world-tab="players"]').click();

    const row = dialog.locator(`tr[data-player="${first.json.player}"]`);

    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "New ticket" }).click();
    await expect(shown.locator("#showntitle")).toContainText("A new ticket");

    const link = await shown.locator("a").first().getAttribute("href");
    const ticket = new URLSearchParams(link.slice(link.indexOf("#") + 1)).get("ticket");

    expect(link).toContain(`#server=`);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]{22}$/);
    await page.locator("#shownclose").click();
    expect((await enter({ world, ticket: first.json.ticket })).json.error).toBe("key");
    expect((await enter({ world, ticket })).json.player).toBe(first.json.player);

    // Its heroes mode switched, while it's set aside
    await dialog.locator('[data-world-tab="settings"]').click();
    await dialog.locator('select[name="heroes"]').selectOption("brought");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.locator("#worldstatus")).toHaveText("Saved.");
    expect(server.metaOf(world).heroes).toBe("brought");
    await page.locator("#worldclose").click();
    await expect(card).toContainText("Brought in by their players");

    // What's happened to it, as Activity has it
    await page.locator('[data-tab="activity"]').click();
    await expect(page.locator("#activity")).toContainText("was given a new ticket");
    await expect(page.locator("#activity")).toContainText("Restored from");
    await page.locator('[data-tab="worlds"]').click();

    // Exported, to bring in again once it's gone
    const exported = page.waitForEvent("download");
    const file = path.join(folder, "ashby.pellagos.json.gz");

    await card.getByRole("button", { name: "Export" }).click();
    await (await exported).saveAs(file);
    await expect(page.locator("#status")).toHaveText("Ashby exported: it's in your downloads.");

    // Deleted, its name typed (the wrong name first)
    await card.getByRole("button", { name: "Delete" }).click();
    await page.locator("#confirmname").fill("Ash");
    await page.locator("#confirmgo").click();
    await expect(page.locator("#confirmstatus")).toHaveText('Type "Ashby" to go on.');
    await page.locator("#confirmname").fill("Ashby");
    await page.locator("#confirmgo").click();
    await expect(page.locator("#status")).toHaveText("Ashby was deleted.");
    await expect(page.locator("#worlds")).toContainText("No worlds yet");
    expect(server.metaOf(world)).toBe(null);

    // (The server's own journal keeps that it was)
    await page.locator('[data-tab="activity"]').click();
    await expect(page.locator("#activity")).toContainText('The world "Ashby"');

    // Brought in again from its export: a new world, with keys of its own, as it was
    await page.locator('[data-tab="new"]').click();
    await page.locator("#importbutton").click();
    await expect(page.locator("#importstatus")).toHaveText("Choose the exported file first (a .json.gz).");
    await page.locator("#importfile").setInputFiles(file);
    await page.locator("#importbutton").click();
    await expect(shown.locator("#showntitle")).toHaveText("Ashby is brought in", { timeout: 30000 });

    const [broughtOwner, broughtPlayer] = await shown.locator(".shown-value").allTextContents();

    expect([broughtOwner, broughtPlayer]).not.toContain(playerKey);
    await page.locator("#shownclose").click();

    const brought = page.locator("#worlds .card", { hasText: "Ashby" });

    await expect(brought).toBeVisible();
    await expect(brought).toContainText("Brought in by their players");
    expect(await brought.getAttribute("data-world")).not.toBe(world);
    expect(server.metaOf(await brought.getAttribute("data-world")).seed).toBe(5);

    expect(errors).toEqual([]);
});

test("from the Wi-Fi, the page at /admin asks for the admin key first", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${server.port}/admin`);
    await expect(page.locator("#signin")).toBeVisible();
    await expect(page.locator("#tabs")).toBeHidden();

    await page.locator("#signinkey").fill("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA");
    await page.locator("#signin button").click();
    await expect(page.locator("#signinstatus")).not.toBeEmpty();
    await expect(page.locator("#tabs")).toBeHidden();

    await page.locator("#signinkey").fill(server.adminKey);
    await page.locator("#signin button").click();
    await expect(page.locator("#who")).toContainText("from the Wi-Fi");
    await expect(page.locator("#overview")).toContainText("with the admin key");
    await expect(page.locator("#overview")).not.toContainText(server.adminKey);
});
