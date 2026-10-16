import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorldServer } from "../server/world-server.js";
import { expect, test } from "./fixtures.js";

// Worlds on a world server, from the game (generated/world_server_plan.md §15 S3), in two browsers
// at once, both playing the game as the server itself serves it: one player adds the server by its
// address, makes a world with the key the server printed, goes in as a new hero, and makes an
// invite link from the World panel; another follows the link, goes in as a new hero of their own,
// and both are in the world; they leave, and the world stops and is set aside, its time just where
// it stopped; the second comes back from the Worlds screen to the same hero. And a server that
// proves to be another than the one pinned is sent no key.

// (Two worlds drawn at once, without a GPU: more than the usual time; these tests one after the
// other, never side by side)
test.setTimeout(420000);
test.describe.configure({ mode: "default" });

// Short codes hashed cheaply (the server's own cost is for a Mac, not a test)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const save = (name, race, weapon) => ({
    version: 1,
    seed: 777,
    created: "2026-10-13T12:00:00.000Z",
    hero: {
        name,
        weapon,
        race,
        parts: [],
        shape: { macro: { gender: 0.5, muscle: 0.5, weight: 0.4, height: 0.5, bust: 0.4, african: 0.2, asian: 0.2, caucasian: 0.6 }, details: {} },
        look: { skin: { tone: "#d9b394" }, eyes: { iris: "#5a7a3a" }, hair: { style: "short", beard: "none", colour: "#3a2a1a" } },
    },
});

let server;
let folder;
let base;

test.beforeAll(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-worlds-"));
    server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });
    await server.settings.change({ setAsideMinutes: 0 });
    await server.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${server.port}`;
});

test.afterAll(async () => {
    await server?.close();
    await rm(folder, { recursive: true, force: true });
});

// Drawn cheaply (two worlds at once in software), a character kept already, and errors thrown
async function ready(page, character) {
    await page.addInitScript(
        ({ settings, character }) => {
            localStorage.setItem("pellagos.settings", JSON.stringify(settings));

            if (character && !localStorage.getItem("pellagos.characters")) {
                localStorage.setItem("pellagos.save", JSON.stringify(character));
            }
        },
        { settings: { quality: "low", renderScale: 0.5, shadows: false }, character },
    );
    page.on("pageerror", (error) => {
        throw error;
    });
}

async function playing(page) {
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 180000, polling: 250 });
}

// The world's life on the server, and its clock
const lifeOf = (world) => server.registry.lifeOf(world);

test("a world made on a server and shared by an invite link: both play in it, leave, and it waits; the second comes back to the same hero", async ({ ownBrowser: browser }) => {
    const ownerContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const guest = await guestContext.newPage();

    await ready(owner, save("Brand", "human", "sword"));
    await ready(guest, save("Syl", "elf", "bow"));

    // The owner adds the server by its address, and makes a world with the server's admin key
    await owner.goto(`${base}/`);
    await owner.locator("#worldsbutton").click();

    const worlds = owner.locator("#worlds");

    await owner.locator("#worldsaddress").fill(`127.0.0.1:${server.port}`);
    await worlds.getByRole("button", { name: "Add" }).click();

    const row = worlds.locator(`li[data-server="127.0.0.1:${server.port}"]`);

    await expect(row).toContainText("Version", { timeout: 30000 });
    await row.getByRole("button", { name: "Make a world" }).click();

    const ask = owner.locator("#worldask");

    await ask.locator("#worldaskmaker").fill(server.adminKey);
    await ask.locator("#worldaskname").fill("Thornwick");
    await ask.locator("#worldaskheroes").selectOption("kept");
    await ask.getByRole("button", { name: "Make it" }).click();

    // (A world that keeps its heroes, and the owner's first time in: a new hero, looking as Brand does)
    await expect(ask.locator("#worldasktitle")).toHaveText("Who goes into Thornwick", { timeout: 60000 });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: /A new hero/ }).click();
    await playing(owner);

    const world = [...server.worlds.keys()][0];
    const ownerId = await owner.evaluate(() => window.pellagos.game.me);

    expect(ownerId).toMatch(/^[0-9A-Z]{10}\.1$/);
    expect(server.metaOf(world).name).toBe("Thornwick");

    // The server's pinned: the owner's game knows its id
    expect(await owner.evaluate(() => JSON.parse(localStorage.getItem("pellagos.servers")).servers[0].id)).toBe(server.identity.id);

    // An invite link from the World panel
    await owner.locator("#menubutton").click();
    await owner.locator("#worldbutton").click();

    const panel = owner.locator("#worldpanel");

    await expect(panel.locator("#worldpaneltitle")).toHaveText("Thornwick");
    await panel.getByRole("button", { name: "Make an invite link" }).click();
    await expect(panel.locator("#worldpanelinvitelink")).toBeVisible({ timeout: 30000 });

    const link = await panel.locator("#worldpanelinvitelink").getAttribute("href");

    expect(link).toContain(`#server=127.0.0.1%3A${server.port}`);
    expect(link).toContain(`id=${server.identity.id}`);
    await panel.getByRole("button", { name: "Back to the game" }).click();

    // The guest follows the link: straight to choosing a hero (the key's never in their address bar)
    await guest.goto(link);
    await expect(guest.locator("#worldask #worldasktitle")).toHaveText("Who goes into Thornwick", { timeout: 60000 });
    await expect(guest.locator("#worldask")).toBeVisible();
    expect(guest.url()).not.toContain("key=");
    await guest.locator("#worldask").getByRole("button", { name: /A new hero/ }).click();
    await playing(guest);

    const guestId = await guest.evaluate(() => window.pellagos.game.me);

    expect(guestId).toMatch(/^[0-9A-Z]{10}\.1$/);
    expect(guestId).not.toBe(ownerId);

    // Both in the world, in each other's copy
    await expect.poll(() => owner.evaluate(() => window.pellagos.game.others().map(({ name }) => name)), { timeout: 60000 }).toEqual(["Syl"]);
    await expect.poll(() => lifeOf(world).state?.running, { timeout: 60000 }).toBe(true);

    // Both leave: the world stops, and is set aside (stored), its clock where it stopped
    for (const page of [guest, owner]) {
        await page.locator("#menubutton").click();
        await page.locator("#quitbutton").click();
        await expect(page.locator("#title")).toBeVisible();
    }

    await expect.poll(() => lifeOf(world).life, { timeout: 60000 }).toBe("stored");

    // The guest comes back from the Worlds screen: the world they hold a ticket for, and their hero kept there
    await guest.locator("#worldsbutton").click();

    const theirs = guest.locator(`#worlds li[data-world="${world}"]`);

    await expect(theirs).toContainText("Thornwick", { timeout: 30000 });
    await theirs.getByRole("button").click();

    const choose = guest.locator("#worldask");

    await expect(choose.locator("#worldasktitle")).toHaveText("Who goes into Thornwick", { timeout: 60000 });
    await expect(choose).toBeVisible();
    await choose.getByRole("button", { name: /^Syl/ }).click();
    await playing(guest);
    expect(await guest.evaluate(() => window.pellagos.game.me)).toBe(guestId);

    await ownerContext.close();
    await guestContext.close();
});

test("a first hero brought into a world from a character file, told first what was changed to suit this version of the game; and taken home again, a copy among the saved characters, in the world's land", async ({ page }) => {
    await ready(page, null);

    // (A world that keeps its heroes and lets a first one be brought in, its key held by the game)
    const made = await server.createWorld({ name: "Fernhollow", seed: 31, race: "human", heroes: "kept", firstHero: "bring" });
    const key = `127.0.0.1:${server.port}`;
    const created = "2025-05-05T05:05:05.000Z";
    const file = {
        format: "pellagos.character.1",
        characters: [
            {
                kind: "pellagos-solo-world",
                version: 1,
                saveVersion: 2,
                save: { version: 2, id: "oldbram1", hero: save("Old Bram", "human", "sword").hero, seed: 5, created, played: created },
                progress: { created, seed: 5, format: 2, skills: { blade: 80 }, gold: 41, pack: [{ id: "potion", count: 1 }, { id: "oldBlade", count: 1 }], gear: { mainHand: { id: "sword" } } },
            },
        ],
    };

    await page.addInitScript(
        ({ key, port, id, world, playerKey }) => localStorage.setItem("pellagos.servers", JSON.stringify({ version: 1, servers: [{ key, host: "127.0.0.1", port, secure: false, id, name: null, seen: null, worlds: { [world]: { name: "Fernhollow", key: playerKey } } }] })),
        { key, port: server.port, id: server.identity.id, world: made.world, playerKey: made.playerKey },
    );
    await page.goto(`${base}/`);

    const ask = page.locator("#worldask");
    const into = async () => {
        await page.locator("#worldsbutton").click();
        await page.locator(`#worlds li[data-world="${made.world}"]`).getByRole("button").click();
        await expect(ask.locator("#worldasktitle")).toHaveText("Who goes into Fernhollow", { timeout: 60000 });
    };

    // Their first time in: brought in from the file, told first what couldn't come
    await into();

    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), ask.getByRole("button", { name: /^Bring one from a file/ }).click()]);

    await chooser.setFiles({ name: "Old Bram.pellagos-character", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
    await expect(ask.locator("#worldasktitle")).toHaveText("Bring Old Bram in?");
    await expect(ask.locator("#worldasknote")).toHaveText("Changed to suit this version of the game: 1 thing the game no longer has: old blade.");
    await ask.getByRole("button", { name: "Bring Old Bram in" }).click();
    await playing(page);
    expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Old Bram");

    const [player] = (await page.evaluate(() => window.pellagos.game.me)).split(".");

    await page.locator("#menubutton").click();
    await page.locator("#quitbutton").click();
    await expect(page.locator("#title")).toBeVisible();
    await expect.poll(async () => (await server.worlds.get(made.world).heroes.list(player)).map(({ name }) => name), { timeout: 60000 }).toEqual(["Old Bram"]);

    // Taken home: a copy among the saved characters, in Fernhollow's land, with what they carry
    await into();
    await ask.getByRole("button", { name: /^Take one home/ }).click();
    await expect(ask.locator("#worldasktitle")).toHaveText("Take which hero home?");
    await ask.getByRole("button", { name: /^Old Bram/ }).click();

    const imported = page.locator("#imported");

    await expect(imported.locator("#importednote")).toHaveText("One character is now among your saved characters.");
    await expect(imported.locator(".about")).toHaveText("Human · Sword · 41 gold");
    await imported.getByRole("button", { name: "OK" }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.characters")).ids.map((id) => JSON.parse(localStorage.getItem(`pellagos.${id}.save`))).map(({ hero, seed }) => [hero.name, seed]))).toEqual([["Old Bram", 31]]);
    expect((await server.worlds.get(made.world).heroes.list(player)).map(({ name }) => name)).toEqual(["Old Bram"]);
});

test("a server that proves to be another than the one pinned is sent no key", async ({ page }) => {
    await ready(page, save("Brand", "human", "sword"));

    // (A world made, and its key held by a game that pinned another server at that address)
    const made = await server.createWorld({ name: "Ashby", seed: 3, race: "human" });
    const key = `127.0.0.1:${server.port}`;

    await page.addInitScript(
        ({ key, port, world, playerKey }) =>
            localStorage.setItem(
                "pellagos.servers",
                JSON.stringify({ version: 1, servers: [{ key, host: "127.0.0.1", port, secure: false, id: "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", name: null, seen: null, worlds: { [world]: { name: "Ashby", key: playerKey } } }] }),
            ),
        { key, port: server.port, world: made.world, playerKey: made.playerKey },
    );

    const asked = [];

    page.on("request", (request) => {
        if (/\/api\/v1\/(enter|codes)/.test(request.url())) {
            asked.push(request.url());
        }
    });

    await page.goto(`${base}/`);
    await page.locator("#worldsbutton").click();

    const theirs = page.locator(`#worlds li[data-world="${made.world}"]`);

    await expect(theirs).toContainText("Ashby", { timeout: 30000 });
    await theirs.getByRole("button").click();
    await expect(page.locator("#worldsstatus")).toContainText("This isn't the server you played on before", { timeout: 30000 });
    expect(asked).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.servers")).servers[0].id)).toBe("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA");
});
