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
// proves to be another than the one pinned is sent no key. And getting people in (docs/SERVER.md):
// a newcomer with no character follows a world's invite link, makes one for it, and goes straight
// in; the server's own address shows its worlds on the title, one open to anyone joined with a tap.

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
    // (Its Wi-Fi this computer's loopback: the invite links it makes, closed to the internet, are to it)
    server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), interfaces: { lo: [{ address: "127.0.0.1", family: "IPv4", internal: false }] } });
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
    await worlds.getByRole("button", { name: "Add", exact: true }).click();

    const row = worlds.locator(`li[data-server="127.0.0.1:${server.port}"]`);

    await expect(row).toContainText("Version", { timeout: 30000 });
    await row.getByRole("button", { name: "Make a world" }).click();

    const ask = owner.locator("#worldask");

    await ask.locator("#worldaskmaker").fill(server.adminKey);
    await ask.locator("#worldaskname").fill("Thornwick");
    await ask.locator("#worldaskcharacters").selectOption("own");
    await ask.getByRole("button", { name: "Make it" }).click();

    // (A world whose characters are its own, and the owner's first time in: a new one, looking as Brand does)
    await expect(ask.locator("#worldasktitle")).toHaveText("Who goes into Thornwick?", { timeout: 60000 });
    await expect(ask).toBeVisible();
    await expect(ask.locator("#worldasknote")).toHaveText("Characters in Thornwick are Thornwick's own, made there. This is your first time in.");
    await ask.getByRole("button", { name: /A new character/ }).click();
    await playing(owner);

    const world = [...server.worlds.keys()][0];
    const ownerId = await owner.evaluate(() => window.pellagos.game.me);

    expect(ownerId).toMatch(/^[0-9A-Z]{10}\.1$/);
    expect(server.metaOf(world).name).toBe("Thornwick");

    // The server's pinned: the owner's game knows its id
    expect(await owner.evaluate(() => JSON.parse(localStorage.getItem("pellagos.servers")).servers[0].id)).toBe(server.identity.id);

    // The World panel from the party menu too, playing alone (its World button), and back to the
    // game from it; the world held for no one while it's open
    const party = owner.getByRole("dialog", { name: "Party" });
    const panel = owner.locator("#worldpanel");

    await owner.locator("#partybutton").click();
    await expect(party).toBeVisible();
    await expect(party.getByRole("tab", { name: "Players" })).toBeHidden();
    await party.getByRole("button", { name: "World" }).click();
    await expect(panel).toBeVisible();
    await expect(party).toBeHidden();
    await expect(panel.locator("#worldpaneltitle")).toHaveText("Thornwick");
    await expect(panel.locator("#worldpanelpeople li")).toHaveText(["Brand(you)"]);
    await panel.getByRole("button", { name: "Back to the game" }).click();
    await expect(panel).toBeHidden();
    expect(await owner.evaluate(() => window.pellagos.game.running)).toBe(true);

    // An invite link from the World panel
    await owner.locator("#menubutton").click();
    await owner.locator("#worldbutton").click();
    await expect(panel.locator("#worldpaneltitle")).toHaveText("Thornwick");
    await panel.getByRole("button", { name: "Invite link" }).click();
    await expect(panel.locator("#worldpanelinvitelink")).toBeVisible({ timeout: 30000 });
    await expect(panel.locator("#worldpanelqr")).toHaveAttribute("src", /^data:image\/gif;base64,/);
    await expect(panel.locator("#worldpanelwhere")).toContainText("It works only on the server's own Wi-Fi");

    const link = await panel.locator("#worldpanelinvitelink").getAttribute("href");

    expect(link.startsWith(`http://127.0.0.1:${server.port}/#server=127.0.0.1%3A${server.port}`)).toBe(true);
    expect(link).toContain(`id=${server.identity.id}`);
    await panel.getByRole("button", { name: "Back to the game" }).click();

    // The guest follows the link: straight to choosing a hero (the key's never in their address bar)
    await guest.goto(link);
    await expect(guest.locator("#worldask #worldasktitle")).toHaveText("Who goes into Thornwick?", { timeout: 60000 });
    await expect(guest.locator("#worldask")).toBeVisible();
    expect(guest.url()).not.toContain("key=");
    await guest.locator("#worldask").getByRole("button", { name: /A new character/ }).click();
    await playing(guest);

    const guestId = await guest.evaluate(() => window.pellagos.game.me);

    expect(guestId).toMatch(/^[0-9A-Z]{10}\.1$/);
    expect(guestId).not.toBe(ownerId);

    // Both in the world, in each other's copy
    await expect.poll(() => owner.evaluate(() => window.pellagos.game.others().map(({ name }) => name)), { timeout: 60000 }).toEqual(["Syl"]);
    await expect.poll(() => lifeOf(world).state?.running, { timeout: 60000 }).toBe(true);

    // (The guest sets their quick actions, puts a marker on the map, turns auto-snag on and the
    // battle cam off: their own, kept with their hero by the world, core/host.js OWN)
    const quick = ["stun", "burn", null, null, null, null];
    const flip = (page, switches) =>
        page.evaluate((switches) => {
            for (const [id, on] of switches) {
                const box = document.querySelector(id);

                box.checked = on;
                box.dispatchEvent(new Event("change"));
            }
        }, switches);

    await guest.evaluate((quick) => {
        window.pellagos.game.setQuick(quick);
        window.pellagos.game.addMarker([40, -12], { icon: "camp", words: "home" });
    }, quick);
    await flip(guest, [
        ["#snagswitch", true],
        ["#battlecamswitch", false],
    ]);

    // Both leave: the world stops, and is set aside (stored), its clock where it stopped
    for (const page of [guest, owner]) {
        await page.locator("#menubutton").click();
        await page.locator("#quitbutton").click();
        await expect(page.locator("#title")).toBeVisible();
    }

    await expect.poll(() => lifeOf(world).life, { timeout: 60000 }).toBe("stored");

    // (Their settings as another device or browser would have them, before they come back)
    await flip(guest, [
        ["#snagswitch", false],
        ["#battlecamswitch", true],
    ]);

    // The guest comes back from the Worlds screen: the world they hold a ticket for, and their hero kept there
    await guest.locator("#worldsbutton").click();

    const theirs = guest.locator(`#worlds li[data-world="${world}"]`);

    await expect(theirs).toContainText("Thornwick", { timeout: 30000 });
    await theirs.getByRole("button").click();

    const choose = guest.locator("#worldask");

    await expect(choose.locator("#worldasktitle")).toHaveText("Who goes into Thornwick?", { timeout: 60000 });
    await expect(choose).toBeVisible();
    await choose.getByRole("button", { name: /^Syl/ }).click();
    await playing(guest);
    expect(await guest.evaluate(() => window.pellagos.game.me)).toBe(guestId);

    // (Their quick actions, marker and settings as they left them: the settings this device's again)
    expect(await guest.evaluate(() => window.pellagos.game.wheels.quick)).toEqual(quick);
    expect(await guest.evaluate(() => [window.pellagos.game.autoSnag, window.pellagos.game.cameraSettings.battle])).toEqual([true, false]);
    await expect(guest.locator("#snagswitch")).toBeChecked();
    await expect(guest.locator("#battlecamswitch")).not.toBeChecked();
    expect(await guest.evaluate(() => window.pellagos.game.markerView().map(({ x, z, icon, words }) => ({ x, z, icon, words })))).toEqual([{ x: 40, z: -12, icon: "camp", words: "home" }]);

    await ownerContext.close();
    await guestContext.close();
});

test("a world that takes copies: a character on this device copied in once, told first what a copy is, and one from a file, told what was changed; each the world's own, never taken home; a world whose characters are its own: one made there taken home, out of it for good", async ({ page }) => {
    await ready(page, save("Ada", "human", "sword"));

    // (A world that takes copies and one whose characters are its own, their keys held by the game)
    const copies = await server.createWorld({ name: "Fernhollow", seed: 31, race: "human", characters: "copies" });
    const own = await server.createWorld({ name: "Ownby", seed: 33, race: "human", characters: "own" });
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
        ({ key, port, id, worlds }) => localStorage.setItem("pellagos.servers", JSON.stringify({ version: 1, servers: [{ key, host: "127.0.0.1", port, secure: false, id, name: null, seen: null, worlds }] })),
        { key, port: server.port, id: server.identity.id, worlds: { [copies.world]: { name: "Fernhollow", key: copies.playerKey }, [own.world]: { name: "Ownby", key: own.playerKey } } },
    );
    await page.goto(`${base}/`);

    const ask = page.locator("#worldask");
    const into = async (world, name) => {
        await page.locator("#worldsbutton").click();
        await page.locator(`#worlds li[data-world="${world}"]`).getByRole("button").click();
        await expect(ask.locator("#worldasktitle")).toHaveText(`Who goes into ${name}?`, { timeout: 60000 });
    };
    const quit = async () => {
        await page.locator("#menubutton").click();
        await page.locator("#quitbutton").click();
        await expect(page.locator("#title")).toBeVisible();
    };
    // (Ada's own id, once the game's moved her under an id of her own and given her one)
    await expect.poll(() => page.evaluate(() => localStorage.getItem("pellagos.characters")), { timeout: 60000 }).not.toBeNull();

    const ada = await page.evaluate(() => JSON.parse(localStorage.getItem(`pellagos.${JSON.parse(localStorage.getItem("pellagos.characters")).ids[0]}.save`)).hero.guid);

    // One from a file copied in, told first what a copy is and what couldn't come
    await into(copies.world, "Fernhollow");
    await expect(ask.locator("#worldasknote")).toContainText("Fernhollow keeps a copy of each character brought in, once each.");

    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), ask.getByRole("button", { name: /^Copy one from a file/ }).click()]);

    await chooser.setFiles({ name: "Old Bram.pellagos-character", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
    await expect(ask.locator("#worldasktitle")).toHaveText("Copy Old Bram into Fernhollow?");
    await expect(ask.locator("#worldasknote")).toHaveText("A copy of Old Bram comes into Fernhollow and stays there, Fernhollow's own: it can't be taken out again. Changed to suit this version of the game: 1 thing the game no longer has: old blade.");
    await ask.getByRole("button", { name: "Copy Old Bram in" }).click();
    await playing(page);
    expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Old Bram");

    const [player] = (await page.evaluate(() => window.pellagos.game.me)).split(".");

    await quit();
    await expect.poll(async () => (await server.worlds.get(copies.world).heroes.list(player)).map(({ name }) => name), { timeout: 60000 }).toEqual(["Old Bram"]);

    // Ada, on this device, copied in: asked first, told what a copy is
    await into(copies.world, "Fernhollow");
    await expect(ask.getByRole("button", { name: /^Old Bram · Fernhollow's copy/ })).toBeVisible();
    await expect(ask.getByRole("button", { name: /^Take one home/ })).toHaveCount(0);
    await ask.getByRole("button", { name: /^Copy Ada in/ }).click();
    await expect(ask.locator("#worldasktitle")).toHaveText("Copy Ada into Fernhollow?");
    await expect(ask.locator("#worldasknote")).toContainText(`Ada on this device carries on as they are: nothing the copy does in Fernhollow comes back to them, and the copy can't be taken out again.`);
    await ask.getByRole("button", { name: "Copy Ada in" }).click();
    await playing(page);
    expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Ada");
    await quit();
    await expect.poll(async () => (await server.worlds.get(copies.world).heroes.list(player)).map(({ name, origin }) => [name, origin === ada]), { timeout: 60000 }).toEqual([["Old Bram", false], ["Ada", true]]);

    // Copied once: said so, not offered again
    await into(copies.world, "Fernhollow");
    await expect(ask.getByRole("button", { name: /^Ada · Fernhollow's copy/ })).toBeVisible();
    await expect(ask.getByRole("button", { name: /^Ada: copied in already/ })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#worlds")).toBeHidden();

    // A world whose characters are its own: a new one, made there, looking as Ada does
    await into(own.world, "Ownby");
    await ask.getByRole("button", { name: /^A new character/ }).click();
    await playing(page);

    const [ownPlayer] = (await page.evaluate(() => window.pellagos.game.me)).split(".");

    await quit();
    await expect.poll(async () => (await server.worlds.get(own.world).heroes.list(ownPlayer)).map(({ name }) => name), { timeout: 60000 }).toEqual(["Ada"]);

    // Taken home: asked first, out of Ownby for good, a character of their own on this device
    await into(own.world, "Ownby");
    await ask.getByRole("button", { name: /^Take one home/ }).click();
    await expect(ask.locator("#worldasktitle")).toHaveText("Take which character home?");
    await ask.getByRole("button", { name: /^Ada/ }).click();
    await expect(ask.locator("#worldasktitle")).toHaveText("Take Ada home?");
    await expect(ask.locator("#worldasknote")).toHaveText("Ada will leave Ownby for good and be kept on this device instead. A copy of Ownby as it is now comes with them, as one of the worlds on this device. This can't be undone.");
    await ask.getByRole("button", { name: "Take Ada home" }).click();

    const imported = page.locator("#imported");

    await expect(imported.locator("#importednote")).toHaveText("One character is now among the characters on this device.");
    await imported.getByRole("button", { name: "OK" }).click();

    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.characters")).ids.map((id) => JSON.parse(localStorage.getItem(`pellagos.${id}.save`))).map(({ hero, seed }) => [hero.name, seed, hero.guid]));

    expect(kept.map(([name, seed]) => [name, seed]).sort()).toEqual([["Ada", 33], ["Ada", 777]]);
    expect(new Set(kept.map(([, , guid]) => guid)).size).toBe(2);
    expect(await server.worlds.get(own.world).heroes.list(ownPlayer)).toEqual([]);
});

test("a world on this device brought to a server (Bring my world) with a character who's been in it: told how, and what comes with it; refused a key that makes no worlds; then a world of the server's, in its land, its owner going in as that character", async ({ page }) => {
    await ready(page, save("Wren", "human", "sword"));

    const before = server.worlds.size;

    await page.goto(`${base}/`);
    await page.locator("#worldsbutton").click();

    const worlds = page.locator("#worlds");

    await page.locator("#worldsaddress").fill(`127.0.0.1:${server.port}`);
    await worlds.getByRole("button", { name: "Add", exact: true }).click();

    const row = worlds.locator(`li[data-server="127.0.0.1:${server.port}"]`);

    await expect(row).toContainText("Version", { timeout: 30000 });
    await row.getByRole("button", { name: "Bring my world" }).click();

    // The worlds on this device, each with who's been in it, and how it works
    const ask = page.locator("#worldask");

    await expect(ask.locator("#worldasktitle")).toHaveText("Bring my world to the server");
    await expect(ask.locator("#worldasknote")).toContainText("Each world on this device has its own land");
    await expect(ask.locator(".world-help").first().locator("li")).toHaveCount(4);
    await expect(ask.locator(".world-help").nth(1)).toContainText("To bring one from another device or browser, export the character there while they're in it");
    await ask.getByRole("button", { name: /^Wren's world, as Wren/ }).click();

    // What comes with it, and the key that makes worlds: one that doesn't, refused, saying which will
    await expect(ask.locator("#worldasktitle")).toHaveText(/^Bring Wren's world to /);
    await expect(ask.locator(".world-help").first()).toContainText("A copy of Wren, with all they carry, know and have found there, kept by the world as your first character there");
    await expect(ask.locator("#worldaskname")).toHaveValue("Wren's world");
    await ask.locator("#worldaskmaker").fill("NOT-A-KEY");
    await ask.getByRole("button", { name: "Bring it to the server" }).click();
    await expect(ask.locator("#worldaskstatus")).toContainText("That key doesn't make worlds on");
    expect(server.worlds.size).toBe(before);

    await ask.locator("#worldaskmaker").fill(server.adminKey);
    await ask.locator("#worldaskname").fill("Wren's Vale");
    await ask.getByRole("button", { name: "Bring it to the server" }).click();

    // Brought: said what came of it, and in, as its owner, to Wren
    await expect(ask.locator("#worldasktitle")).toHaveText(/^Wren's Vale is on /, { timeout: 120000 });
    await expect(ask.locator("#worldasknote")).toContainText("You're its owner, and Wren is kept there for you.");

    const world = [...server.worlds.keys()].find((id) => server.metaOf(id).name === "Wren's Vale");

    expect(server.metaOf(world)).toMatchObject({ seed: 777, race: "human", heroes: "kept" });
    await ask.getByRole("button", { name: "Go in" }).click();
    await expect(ask.locator("#worldasktitle")).toHaveText("Who goes into Wren's Vale?", { timeout: 60000 });
    // (A copy of theirs, the world's own: their Wren stays on this device as they are)
    await expect(ask.getByRole("button", { name: /^Wren · Wren's Vale's copy/ })).toBeVisible();
    await expect(ask.getByRole("button", { name: /^Take one home/ })).toHaveCount(0);
    await ask.getByRole("button", { name: /^Wren/ }).click();
    await playing(page);
    expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Wren");

    const [player, slot] = (await page.evaluate(() => window.pellagos.game.me)).split(".");

    expect(slot).toBe("1");
    expect(server.access.world(world).player(player).role).toBe("owner");
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

test("a newcomer with no character follows a world's invite link: makes a character, told it's for that world, and goes straight in", async ({ page }) => {
    await ready(page, null);

    const made = await server.createWorld({ name: "Brackenmoor", seed: 41, race: "human", heroes: "kept" });
    const { link } = await server.manage.invite(made.world);

    // (The game opened from the link: their character made first, for the world, with nothing to choose)
    await page.goto(link);
    await expect(page.locator("#createtitle")).toHaveText("Your character for Brackenmoor", { timeout: 60000 });
    await expect(page.locator("#worldask")).toBeHidden();
    await page.getByRole("button", { name: "Next: weapon" }).click();
    await page.getByRole("button", { name: "Next: name" }).click();
    await page.locator("#nameinput").fill("Wren");
    await page.getByRole("button", { name: "Begin" }).click();

    // (Straight in: never asked who goes in)
    await playing(page);
    expect(await page.evaluate(() => window.pellagos.game.hero.name)).toBe("Wren");
    expect(server.access.world(made.world).players().map(({ role }) => role)).toEqual(["player"]);
});

test("the server's own address shows its worlds on the title: one open to anyone joined with a tap, no key or link, choosing which of theirs visits it", async ({ page }) => {
    await ready(page, save("Ivo", "human", "sword"));

    const made = await server.createWorld({ name: "Openfield", seed: 43, race: "human", heroes: "brought", settings: { open: true } });

    await page.goto(`${base}/`);

    const door = page.locator("#titleserver");
    const row = door.locator(`li[data-world="${made.world}"]`);

    await expect(door).toBeVisible({ timeout: 30000 });
    await expect(door.locator("#titleservername")).toHaveText(/^Worlds on /);
    await expect(row).toContainText("Openfield");
    await expect(row).toContainText("Open to anyone: tap to join");
    await expect(row).toContainText("Visit as your own");
    await row.getByRole("button").click();

    // (Which of theirs visits: the characters on this device, or a new one; told how visiting goes)
    const ask = page.locator("#worldask");

    await expect(ask.locator("#worldasktitle")).toHaveText("Who visits Openfield?", { timeout: 60000 });
    await expect(ask.locator("#worldasknote")).toHaveText("You visit Openfield as one of the characters on this device. What they gain there stays with them, kept as you play; when you leave, they leave Openfield with you.");
    await expect(ask.getByRole("button", { name: /^A new character/ })).toBeVisible();
    await ask.getByRole("button", { name: /^Ivo/ }).click();

    // (In as Ivo, by the world's open door: their ticket kept, to come back by)
    await playing(page);

    const access = server.access.world(made.world);

    expect(access.players().map(({ via }) => via)).toEqual([access.door().id]);
    expect(await page.evaluate((world) => Boolean(JSON.parse(localStorage.getItem("pellagos.servers")).servers[0].worlds[world].ticket), made.world)).toBe(true);
});

test("back into a world on a server after the game's reloaded: straight back in, each stage of the way shown as it's come to, as the same character where they stood; a stage that can't be got past says why, to try again; Cancel stops it and lets the world go", async ({ page }) => {
    await ready(page, save("Tamsin", "human", "sword"));
    // (Each stage of the way back in, as it's marked: "reach:now", "reach:done", ...)
    await page.addInitScript(() => {
        window.stagesSeen = [];
        document.addEventListener("DOMContentLoaded", () => {
            new MutationObserver((changes) => {
                for (const { target, attributeName } of changes) {
                    if (attributeName === "data-state" && target.dataset.state !== "waiting") {
                        window.stagesSeen.push(`${target.dataset.stage}:${target.dataset.state}`);
                    }
                }
            }).observe(document.querySelector("#rejoinstages"), { subtree: true, attributes: true });
        });
    });

    const made = await server.createWorld({ name: "Hollowmere", seed: 47, race: "human", heroes: "brought", settings: { open: true } });
    const rejoin = page.locator("#rejoin");
    const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.inworld")));
    const where = () => page.evaluate(() => (({ x, y }) => ({ x, y }))(window.pellagos.game.battle.actor(window.pellagos.game.me)));
    const backIn = async () => {
        await playing(page);
        await expect(rejoin).toBeHidden();
        expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Tamsin");

        const now = await where();

        expect(Math.hypot(now.x - stood.x, now.y - stood.y)).toBeLessThan(1.5);
    };

    // In, as Tamsin, by the world's open door: where they are kept, written as they play
    await page.goto(`${base}/`);
    await page.locator(`#titleserver li[data-world="${made.world}"]`).getByRole("button").click({ timeout: 30000 });
    await page.locator("#worldask").getByRole("button", { name: /^Tamsin/ }).click({ timeout: 60000 });
    await playing(page);

    const stood = await where();
    const record = await kept();

    expect(record).toMatchObject({ kind: "server", world: made.world, worldName: "Hollowmere", hero: null, name: "Tamsin" });
    expect(record.character).toEqual(expect.any(String));
    expect(Date.now() - record.at).toBeLessThan(60000);

    // Reloaded: straight back in, the dialog naming where and who, each stage marked under way and
    // then done, in order; then in the world again as Tamsin, where she stood
    await page.reload();
    await expect(rejoin).toBeVisible({ timeout: 60000 });
    await expect(rejoin.locator("#rejointitle")).toHaveText("Back into Hollowmere");
    await expect(rejoin.locator("#rejoinabout")).toHaveText(/, as Tamsin\.$/);
    await backIn();
    expect(await page.evaluate(() => window.stagesSeen)).toEqual(["reach:now", "reach:done", "prove:now", "prove:done", "enter:now", "enter:done", "open:now", "open:done", "ask:now"]);
    expect(server.access.world(made.world).players()).toHaveLength(1);

    // Its place in the world refused (the server unreachable for it): that stage crossed out, said
    // why, Try again; tried again once it's reachable, back in
    await page.route("**/api/v1/enter", (route) => route.abort());
    await page.reload();
    await expect(rejoin.locator('li[data-stage="enter"]')).toHaveAttribute("data-state", "failed", { timeout: 60000 });
    await expect(rejoin.locator('li[data-stage="prove"]')).toHaveAttribute("data-state", "done");
    await expect(rejoin.locator('li[data-stage="open"]')).toHaveAttribute("data-state", "waiting");
    await expect(rejoin.locator("#rejoinproblem")).toBeVisible();
    await expect(rejoin.locator("#rejoinproblem")).not.toBeEmpty();
    await page.unroute("**/api/v1/enter");
    await rejoin.getByRole("button", { name: "Try again" }).click();
    await backIn();

    // Held up finding its place, and cancelled: the title, the world let go of; reloaded again,
    // nothing to go back into
    await page.route("**/api/v1/enter", () => {});
    await page.reload();
    await expect(rejoin.locator('li[data-stage="enter"]')).toHaveAttribute("data-state", "now", { timeout: 60000 });
    await rejoin.getByRole("button", { name: "Cancel" }).click();
    await expect(rejoin).toBeHidden();
    await expect(page.locator("#title")).toBeVisible();
    expect(await kept()).toBeNull();
    await page.unroute("**/api/v1/enter");
    await page.reload();
    await expect(page.locator("#titleserver")).toBeVisible({ timeout: 30000 });
    await expect(rejoin).toBeHidden();
});

test("You: the player's own name and id, the same on every server; their code carries them to a new device, where the world knows them as the same player, ticket or none", async ({ browser }) => {
    const first = await browser.newContext();
    const second = await browser.newContext();
    const page = await first.newPage();
    const other = await second.newPage();

    await ready(page, save("Wren", "human", "sword"));
    await ready(other, save("Bram", "human", "bow"));

    const made = await server.createWorld({ name: "Kinsmoor", seed: 44, race: "human", heroes: "brought", settings: { open: true } });
    const access = server.access.world(made.world);

    // You: going by the name of the character played last, till it's changed; their id; their code
    await page.goto(`${base}/`);
    await page.locator("#youbutton").click();

    const you = page.locator("#you");

    await expect(you.locator("#youname")).toHaveValue("Wren");
    await expect(you.locator("#youid")).toHaveText(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await you.locator("#youname").fill("Wren the Bold");
    await you.getByRole("button", { name: "Keep this name" }).click();
    await expect(you.locator("#youstatus")).toContainText("Kept");
    await you.getByRole("button", { name: "Show my code" }).click();
    await expect(you.locator("#youcodetext")).toHaveText(/^([0-9A-Z]{6}-){8}[0-9A-Z]{6}$/);
    await expect(you.locator("#youqr")).toHaveAttribute("src", /^data:image\//);

    const id = await you.locator("#youid").textContent();
    const code = await you.locator("#youcodetext").textContent();

    await you.getByRole("button", { name: "Back" }).click();

    // In the open world: known by it, by the name they go by
    const door = (on) => on.locator(`#titleserver li[data-world="${made.world}"]`);

    await door(page).getByRole("button").click();
    await expect(page.locator("#worldasktitle")).toHaveText("Who visits Kinsmoor?", { timeout: 60000 });

    const known = access.playerByIdentity(id);

    expect([known?.playerName, access.players().length]).toEqual(["Wren the Bold", 1]);

    // A new device, with no ticket: their code used there, asked first
    await other.goto(`${base}/`);
    await other.locator("#youbutton").click();
    await expect(other.locator("#youname")).toHaveValue("Bram");
    expect(await other.locator("#youid").textContent()).not.toBe(id);
    await other.getByRole("button", { name: "Use my code from another device" }).click();

    const ask = other.locator("#worldask");

    await ask.locator("#worldaskplayercode").fill("not a code");
    await ask.getByRole("button", { name: "Use this code" }).click();
    await expect(ask.locator("#worldaskstatus")).toContainText("isn't a player code");
    await expect(ask.locator("#worldaskplayername")).toHaveValue("Bram");
    await ask.locator("#worldaskplayercode").fill(code.toLowerCase());
    await ask.locator("#worldaskplayername").fill("Wren the Bold");
    await ask.getByRole("button", { name: "Use this code" }).click();
    await expect(other.locator("#youid")).toHaveText(id);
    await expect(other.locator("#youstatus")).toHaveText("You're Wren the Bold here now too.");
    await other.locator("#you").getByRole("button", { name: "Back" }).click();

    // Into the same world from there: the same player, no ticket needed
    await door(other).getByRole("button").click();
    await expect(other.locator("#worldasktitle")).toHaveText("Who visits Kinsmoor?", { timeout: 60000 });
    expect(access.players().map((player) => player.id)).toEqual([known.id]);
    expect(access.playerByIdentity(id).playerName).toBe("Wren the Bold");

    await first.close();
    await second.close();
});
