import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorldServer } from "../server/world-server.js";
import { expect, keeping, playing, test } from "./fixtures.js";

// Worlds on a world server, from the game (generated/world_server_plan.md §15 S3), in two browsers
// at once, both playing the game as the server itself serves it: one player adds the server by its
// address, makes a world with the key the server printed, goes in as a new hero, and makes an
// invite link from the World panel; another follows the link, goes in as a new hero of their own,
// and both are in the world; they leave, and the world stops and is set aside, its time just where
// it stopped; the second comes back from the Worlds screen to the same hero. And a server that
// proves to be another than the one pinned is sent no key. And getting people in (docs/SERVER.md):
// a newcomer with no character follows a world's invite link, makes one for it, and goes straight
// in; the server's own address shows its worlds on the title, one open to anyone joined with a tap.
// And a crash in a world on the server: its debug log sent there as the player comes back in.

// (Two worlds drawn at once, without a GPU: more than the usual time; these tests one after the
// other, never side by side)
test.setTimeout(660000);
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

// (A world on a server, made ready there and sent: given longer than one on the device to be
// playing; and not drawn once it is: what's looked at here is who's let into which world, as whom,
// in the menus and on the server)
const LONGER = { timeout: 180000, drawn: false };

// The world's life on the server, and its clock
const lifeOf = (world) => server.registry.lifeOf(world);

test("a world made on a server and shared by an invite link: both play in it, leave, and it waits; the second comes back to the same hero", async ({ ownBrowser: browser }) => {
    const ownerContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const guest = await guestContext.newPage();

    await ready(owner, save("Brand", "human", "sword"));
    await ready(guest, save("Syl", "elf", "bow"));

    // The owner hosts on the server (the game opened from it knows it: Multiplayer, Host on a
    // Server), making a world with the server's admin key; given its invite link, goes in
    await owner.goto(`${base}/`);
    await owner.locator("#multiplayerbutton").click();
    await owner.locator("#mphostserver").click();

    const host = owner.locator("#hostserver");
    const choice = host.locator(`#hostserverlist li[data-server="127.0.0.1:${server.port}"]`);

    await expect(choice).toContainText("Makes worlds for those with a creator key", { timeout: 30000 });
    await choice.getByRole("button").click();
    await host.locator("#hostserverkey").fill(server.adminKey);
    await host.locator("#hostservername").fill("Thornwick");
    await host.locator("#hostservercharacters").selectOption("own");
    await host.getByRole("button", { name: "Make the world" }).click();
    await expect(host.locator("#hostserverdonenote")).toContainText("Thornwick is on", { timeout: 60000 });
    await expect(host.locator("#hostserverlink")).toHaveText(/#server=.*&world=[a-z0-9]{10}&key=/);
    await host.getByRole("button", { name: "Go in" }).click();

    const ask = owner.locator("#worldask");

    // (A world whose characters are its own, and the owner's first time in: a new one, looking as Brand does)
    await expect(ask.locator("#worldasktitle")).toHaveText("Who goes into Thornwick?", { timeout: 60000 });
    await expect(ask).toBeVisible();
    await expect(ask.locator("#worldasknote")).toHaveText("Characters in Thornwick are Thornwick's own, made there. This is your first time in.");
    await ask.getByRole("button", { name: /A new character/ }).click();
    await playing(owner, null, LONGER);

    const world = [...server.worlds.keys()][0];
    const ownerId = await owner.evaluate(() => window.pellagos.game.me);

    expect(ownerId).toMatch(/^[0-9A-Z]{10}\.1$/);
    expect(server.metaOf(world).name).toBe("Thornwick");

    // The server's pinned: the owner's game knows its id
    expect(await owner.evaluate((key) => JSON.parse(localStorage.getItem("pellagos.servers")).servers.find((one) => one.key === key).id, `127.0.0.1:${server.port}`)).toBe(server.identity.id);

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
    await playing(guest, null, LONGER);

    const guestId = await guest.evaluate(() => window.pellagos.game.me);

    expect(guestId).toMatch(/^[0-9A-Z]{10}\.1$/);
    expect(guestId).not.toBe(ownerId);

    // Both in the world, in each other's copy
    await expect.poll(() => owner.evaluate(() => window.pellagos.game.others().map(({ name }) => name)), { timeout: 60000 }).toEqual(["Syl"]);
    await expect.poll(() => lifeOf(world).state?.running, { timeout: 60000 }).toBe(true);

    // (The guest sets their Action Bar, puts a marker on the map, turns auto-snag on and the
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

    // The guest comes back from Multiplayer, Join a World Hosted on a Server: the world they hold a ticket for, and their hero kept there
    await guest.locator("#multiplayerbutton").click();
    await guest.locator("#mpjoinserver").click();

    const theirs = guest.locator(`#worlds li[data-world="${world}"]`);

    await expect(theirs).toContainText("Thornwick", { timeout: 30000 });
    await theirs.getByRole("button").click();

    const choose = guest.locator("#worldask");

    await expect(choose.locator("#worldasktitle")).toHaveText("Who goes into Thornwick?", { timeout: 60000 });
    await expect(choose).toBeVisible();
    await choose.getByRole("button", { name: /^Syl/ }).click();
    await playing(guest, null, LONGER);
    expect(await guest.evaluate(() => window.pellagos.game.me)).toBe(guestId);

    // (Their Action Bar, marker and settings as they left them: the settings this device's again)
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
        await page.locator("#multiplayerbutton").click();
        await page.locator("#mpjoinserver").click();
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
    await playing(page, null, LONGER);
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
    await playing(page, null, LONGER);
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
    // (Back to Multiplayer, open under it: closed too)
    await expect(page.locator("#multiplayer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#multiplayer")).toBeHidden();

    // A world whose characters are its own: a new one, made there, looking as Ada does
    await into(own.world, "Ownby");
    await ask.getByRole("button", { name: /^A new character/ }).click();
    await playing(page, null, LONGER);

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

test("a world on this device brought to a server (Host on a Server, a world from this device) with a character who's been in it: told what comes with it; refused a key that makes no worlds; then a world of the server's, in its land, its invite link given, its owner going in as that character; deleted by its owner from the World panel, its name typed", async ({ page }) => {
    await ready(page, save("Wren", "human", "sword"));

    const before = server.worlds.size;

    await page.goto(`${base}/`);
    await page.locator("#multiplayerbutton").click();
    await page.locator("#mphostserver").click();

    // The server chosen (the game opened from it knows it), and a world from this device: each
    // with who's been in it, and what comes with it
    const host = page.locator("#hostserver");
    const choice = host.locator(`#hostserverlist li[data-server="127.0.0.1:${server.port}"]`);

    await expect(choice).toContainText("Makes worlds for those with a creator key", { timeout: 30000 });
    await choice.getByRole("button").click();
    await host.getByRole("radio", { name: "A world from this device" }).click();
    await expect(host.getByRole("radio", { name: "A world from this device" })).toHaveAttribute("aria-checked", "true");
    await expect(host.locator("#hostserverwhich option")).toHaveText([/^Wren's world, as Wren/]);
    await expect(host.locator(".world-help")).toContainText("a copy of the character with it, kept there as your first character");
    await expect(host.locator("#hostservername")).toHaveValue("Wren's world");

    // The key that makes worlds: one that doesn't, refused, saying which will
    await host.locator("#hostserverkey").fill("NOT-A-KEY");
    await host.getByRole("button", { name: "Bring it to the server" }).click();
    await expect(host.locator("#hostserverstatus")).toContainText("That key doesn't make worlds on");
    expect(server.worlds.size).toBe(before);

    await host.locator("#hostserverkey").fill(server.adminKey);
    await host.locator("#hostservername").fill("Wren's Vale");
    await host.getByRole("button", { name: "Bring it to the server" }).click();

    // Brought: said what came of it, its invite link given, and in, as its owner, to Wren
    await expect(host.locator("#hostserverdonenote")).toContainText("Wren's Vale is on", { timeout: 120000 });
    await expect(host.locator("#hostserverdonenote")).toContainText("you're its owner. Wren's Vale came with its land");
    await expect(host.locator("#hostserverdonenote")).toContainText("Wren is kept there for you.");
    await expect(host.locator("#hostserverlink")).toHaveText(/#server=.*&world=[a-z0-9]{10}&key=/);

    const world = [...server.worlds.keys()].find((id) => server.metaOf(id).name === "Wren's Vale");

    expect(server.metaOf(world)).toMatchObject({ seed: 777, race: "human", heroes: "kept" });
    await host.getByRole("button", { name: "Go in" }).click();

    const ask = page.locator("#worldask");

    await expect(ask.locator("#worldasktitle")).toHaveText("Who goes into Wren's Vale?", { timeout: 60000 });
    // (A copy of theirs, the world's own: their Wren stays on this device as they are)
    await expect(ask.getByRole("button", { name: /^Wren · Wren's Vale's copy/ })).toBeVisible();
    await expect(ask.getByRole("button", { name: /^Take one home/ })).toHaveCount(0);
    await ask.getByRole("button", { name: /^Wren/ }).click();
    await playing(page, null, LONGER);
    expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Wren");

    const [player, slot] = (await page.evaluate(() => window.pellagos.game.me)).split(".");

    expect(slot).toBe("1");
    expect(server.access.world(world).player(player).role).toBe("owner");

    // Done with it: its owner deletes it from the World panel, told first what goes with it; a
    // name not its own refused, and then its name typed
    await page.locator("#menubutton").click();
    await page.locator("#worldbutton").click();

    const panel = page.locator("#worldpanel");

    await expect(panel.locator("#worldpaneldeleting")).toBeVisible();
    await expect(panel.locator("#worldpaneldeletenote")).toContainText("Wren's Vale goes from");
    await expect(panel.locator("#worldpaneldeletenote")).toContainText("its land, its war and the heroes it keeps gone with it");
    await panel.getByRole("button", { name: "Delete this world…" }).click();
    await panel.locator("#worldpaneldeletename").fill("Wren's Val");
    await panel.getByRole("button", { name: "Delete it for good" }).click();
    await expect(panel.locator("#worldpanelstatus")).toHaveText("That isn't its name: type “Wren's Vale” exactly.");
    expect(server.worlds.has(world)).toBe(true);
    await panel.locator("#worldpaneldeletename").fill("Wren's Vale");
    await panel.getByRole("button", { name: "Delete it for good" }).click();
    await expect(page.locator("#titlenote")).toHaveText("Wren's Vale was deleted. The server keeps a backup of it, for its owner.", { timeout: 30000 });
    expect(server.worlds.has(world)).toBe(false);
    expect(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem("pellagos.servers")).servers.find((one) => one.key === key).worlds[id] ?? null, { key: `127.0.0.1:${server.port}`, id: world })).toBeNull();
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
    await page.locator("#multiplayerbutton").click();
    await page.locator("#mpjoinserver").click();

    const theirs = page.locator(`#worlds li[data-world="${made.world}"]`);

    await expect(theirs).toContainText("Ashby", { timeout: 30000 });
    await theirs.getByRole("button").click();
    await expect(page.locator("#worldsstatus")).toContainText("This isn't the server you played on before", { timeout: 30000 });
    expect(asked).toEqual([]);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem("pellagos.servers")).servers.find((one) => one.key === key).id, key)).toBe("AAAAA-AAAAA-AAAAA-AAAAA-AAAAA");
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
    await playing(page, null, LONGER);
    expect(await page.evaluate(() => window.pellagos.game.hero.name)).toBe("Wren");
    expect(server.access.world(made.world).players().map(({ role }) => role)).toEqual(["player"]);
});

test("the server's own address shows its worlds on the title: one open to anyone joined with a tap, no key or link, choosing which of theirs visits it; its play socket speaks bytes, 1,500 echoed whole", async ({ page }) => {
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
    await playing(page, null, LONGER);

    const access = server.access.world(made.world);

    expect(access.players().map(({ via }) => via)).toEqual([access.door().id]);
    expect(await page.evaluate((world) => Boolean(JSON.parse(localStorage.getItem("pellagos.servers")).servers.find((one) => one.worlds?.[world])?.worlds[world].ticket), made.world)).toBe(true);

    // (The game's own link to the world speaks bytes with this server (pellagos.play.2; the scaling
    // plan's 3-12): 1,500 of them, the tests' echo, come back as they went, as a buffer)
    const echoed = await page.evaluate(async () => {
        const { link } = window.pellagos.together;
        const bytes = new Uint8Array(1500).map((_, k) => (k * 31 + 7) & 255);

        bytes[0] = 0;

        // (Half a minute for it: none back fails here, not at the test's eleven minutes)
        const back = await new Promise((resolve) => {
            link.onBinary = resolve;
            setTimeout(() => resolve(new ArrayBuffer(0)), 30000);
            link.sendBinary(bytes);
        });
        const heard = new Uint8Array(back);

        return { spoken: link.spoken, buffer: back instanceof ArrayBuffer, length: heard.length, same: heard.every((byte, k) => byte === bytes[k]) };
    });

    expect(echoed).toEqual({ spoken: "pellagos.play.2", buffer: true, length: 1500, same: true });
    // (And its lines go on as ever: still in the world)
    expect(await page.evaluate(() => Boolean(window.pellagos.inWorld))).toBe(true);
});

test("a game opened with ?shadow in a world whose server's views are dark is sent its player's frames beside lockstep and holds each to its copy: a minute's, and no difference", async ({ page }) => {
    await ready(page, save("Una", "human", "sword"));
    await server.settings.change({ replication: "dark" });

    try {
        const made = await server.createWorld({ name: "Shadefield", seed: 47, race: "human", heroes: "brought", settings: { open: true } });

        await page.goto(`${base}/?shadow`);

        const row = page.locator(`#titleserver li[data-world="${made.world}"]`);

        await expect(row).toContainText("Shadefield", { timeout: 30000 });
        await row.getByRole("button").click();
        await page.locator("#worldask").getByRole("button", { name: /^Una/ }).click({ timeout: 60000 });
        await playing(page, null, LONGER);

        // (Its shadow, as its link's joining keeps it: frames coming, each held to the copy)
        const shadow = () => page.evaluate(() => {
            const held = window.pellagos.together?.joining.shadow;

            return held ? { live: held.live, counts: { ...held.counts }, differences: held.differences, lines: [...held.lines], known: held.mirror?.size ?? 0 } : null;
        });

        await expect.poll(async () => (await shadow())?.live, { timeout: 30000 }).toBe(true);

        // (The hero sent about meanwhile, so there's something to tell of)
        const walk = (dx, dy) => page.evaluate(([x, y]) => {
            const { game } = window.pellagos;
            const me = game.host.battle.actor(game.me);

            game.remote.command({ type: "move", to: [me.square[0] + x, me.square[1] + y], run: true });
        }, [dx, dy]);

        await walk(6, 3);

        // (A minute of the world's steps, 20 a second: by the frames held, not by the clock)
        await expect.poll(async () => (await shadow()).counts.compared, { timeout: 150000, intervals: [5000] }).toBeGreaterThanOrEqual(1200);
        await walk(-5, -2);
        await expect.poll(async () => (await shadow()).counts.compared, { timeout: 60000, intervals: [2000] }).toBeGreaterThanOrEqual(1300);

        const found = await shadow();

        expect(found.lines).toEqual([]);
        expect(found.differences).toBe(0);
        expect(found.known).toBeGreaterThanOrEqual(2);
        expect(found.counts.frames).toBeGreaterThanOrEqual(found.counts.compared);
        // (Lockstep as ever beside it: still in the world, its copy never astray)
        expect(await page.evaluate(() => Boolean(window.pellagos.inWorld) && !window.pellagos.together.joining.astray)).toBe(true);
        // (And nothing of it in the debug log, there being nothing to say)
        expect(await page.evaluate(() => (JSON.parse(localStorage.getItem("pellagos.debuglog") ?? "[]") ?? []).filter((event) => event?.kind === "shadow").length)).toBe(0);
    } finally {
        await server.settings.change({ replication: "off" });
    }
});

test("a game opened with ?mirror draws the others where its player's frames say they are, a little behind its copy and beside it; its own hero and lockstep as ever", async ({ page }) => {
    await ready(page, save("Una", "human", "sword"));
    await server.settings.change({ replication: "dark" });

    try {
        const made = await server.createWorld({ name: "Glassfield", seed: 47, race: "human", heroes: "brought", settings: { open: true } });

        await page.goto(`${base}/?mirror`);

        const row = page.locator(`#titleserver li[data-world="${made.world}"]`);

        await expect(row).toContainText("Glassfield", { timeout: 30000 });
        await row.getByRole("button").click();
        await page.locator("#worldask").getByRole("button", { name: /^Una/ }).click({ timeout: 60000 });
        await playing(page, null, LONGER);

        // (Those drawn, as the game has them on the screen, beside where the frames and the copy say)
        const seen = () => page.evaluate(() => {
            const { game, together } = window.pellagos;
            const drawn = together?.joining.drawn;

            if (!drawn?.ready) {
                return null;
            }

            const now = game.remote.clock();
            const me = game.host.battle.actor(game.me);
            const found = { frames: drawn.frames, delay: drawn.playout.delay, faults: drawn.mirror.faults.length, known: drawn.mirror.size, shown: 0, drawnApart: 0, copyApart: 0, hidden: 0 };

            for (const actor of game.host.battle.actors) {
                const avatar = game.avatars.get(actor.id);
                const at = actor.id === game.me || actor.map !== me.map ? null : drawn.of(actor.id, now);

                if (!avatar || !at || at.alpha < 1) {
                    continue;
                }

                if (!avatar.object.visible) {
                    found.hidden++;

                    continue;
                }

                const [ox, oz] = game.originOf(actor.map);

                found.shown++;
                found.drawnApart = Math.max(found.drawnApart, Math.hypot(avatar.object.position.x - ox - at.x, avatar.object.position.z - oz - at.y));
                found.copyApart = Math.max(found.copyApart, Math.hypot(actor.x - at.x, actor.y - at.y));
            }

            return found;
        });

        await expect.poll(async () => (await seen())?.frames ?? 0, { timeout: 60000, intervals: [2000] }).toBeGreaterThanOrEqual(200);
        await page.evaluate(() => {
            const { game } = window.pellagos;
            const me = game.host.battle.actor(game.me);

            game.remote.command({ type: "move", to: [me.square[0] + 5, me.square[1] + 3], run: true });
        });
        await expect.poll(async () => (await seen()).frames, { timeout: 60000, intervals: [2000] }).toBeGreaterThanOrEqual(400);

        const found = await seen();

        expect(found.faults).toBe(0);
        expect(found.known).toBeGreaterThanOrEqual(2);
        expect(found.shown).toBeGreaterThanOrEqual(1);
        // (On the screen where the frames say, give or take what a body trails where it's put;
        // and that no further from the copy than someone goes in the time it's drawn behind)
        expect(found.drawnApart).toBeLessThan(1.5);
        expect(found.copyApart).toBeLessThan(4);
        expect(found.delay).toBeGreaterThanOrEqual(100);
        expect(found.delay).toBeLessThanOrEqual(400);
        // (Its own hero looked ahead from the mirror, the world's time told by its frames: 3-20)
        const looked = await page.evaluate(() => ({ ...window.pellagos.game.forecast.corrections }));

        expect(looked.mirrored).toBeGreaterThanOrEqual(10);
        expect(looked.timed).toBeGreaterThanOrEqual(400);
        expect(looked.snaps).toBe(0);
        // (Lockstep as ever beside it, and its shadow sound)
        expect(await page.evaluate(() => Boolean(window.pellagos.inWorld) && !window.pellagos.together.joining.astray && window.pellagos.together.joining.shadow.differences === 0)).toBe(true);
    } finally {
        await server.settings.change({ replication: "off" });
    }
});

test("a replicated world: two players, neither's game holding a copy of it, see each other move, fight a foe and trade", async ({ ownBrowser: browser }) => {
    const pages = [];

    for (const [name, weapon] of [["Una", "sword"], ["Bram", "sword"]]) {
        const page = await (await browser.newContext()).newPage();

        await ready(page, save(name, "human", weapon));
        pages.push(page);
    }

    const [una, bram] = pages;

    await server.settings.change({ replication: "on" });

    try {
        const made = await server.createWorld({ name: "Mirrormere", seed: 47, race: "human", heroes: "brought", settings: { open: true, netcode: "replicated", experimental: true } });

        for (const [page, name] of [[una, "Una"], [bram, "Bram"]]) {
            await page.goto(`${base}/`);

            const row = page.locator(`#titleserver li[data-world="${made.world}"]`);

            await expect(row).toContainText("Mirrormere", { timeout: 30000 });
            await row.getByRole("button").click();
            await page.locator("#worldask").getByRole("button", { name: new RegExp(`^${name}`) }).click({ timeout: 60000 });
            await playing(page, null, LONGER);
        }

        // What a game has of the world: its link, what it was sent, who it knows of
        const has = (page) => page.evaluate(() => {
            const { game, together } = window.pellagos;
            const link = together.joining;
            const me = game.host.battle.actor(game.me);

            return { me: game.me, mirror: Boolean(link.mirror), ops: link.received.ops ?? 0, world: link.received.state ?? 0, frames: link.frames, known: game.host.battle.actors.length, faults: link.mirror?.faults.length ?? -1, at: [me.x, me.y], gold: game.progress.gold, time: game.host.battle.time };
        });
        const [unaHas, bramHas] = [await has(una), await has(bram)];

        // (No copy: no world sent, no step of it; a few dozen characters, not the thousands the world has)
        for (const one of [unaHas, bramHas]) {
            expect(one.mirror).toBe(true);
            expect(one.ops + one.world).toBe(0);
            expect(one.faults).toBe(0);
            expect(one.known).toBeGreaterThanOrEqual(3);
            expect(one.known).toBeLessThan(400);
        }

        // Moving: Una walks; her own game and Bram's both have her where she went
        const where = (page, id) => page.evaluate((who) => {
            const { game } = window.pellagos;
            const actor = game.host.battle.actor(who);
            const avatar = game.avatars.get(who);
            const [ox, oz] = actor ? game.originOf(actor.map) : [0, 0];

            return actor ? { x: actor.x, y: actor.y, dead: actor.dead, hp: actor.hp, drawn: avatar ? [avatar.object.position.x - ox, avatar.object.position.z - oz] : null, shown: Boolean(avatar?.object.visible) } : null;
        }, id);
        const command = (page, sent) => page.evaluate((what) => new Promise((resolve) => {
            window.pellagos.game.remote.command(what, (result) => resolve(result ?? null));
        }), sent);

        expect(await command(una, { type: "move", to: [Math.floor(unaHas.at[0]) + 6, Math.floor(unaHas.at[1]) + 3], run: true })).toEqual({ ok: true });
        await expect.poll(async () => Math.abs((await where(una, unaHas.me)).x - unaHas.at[0]), { timeout: 30000 }).toBeGreaterThan(4);
        await expect.poll(async () => Math.abs((await where(bram, unaHas.me))?.x - unaHas.at[0]), { timeout: 30000 }).toBeGreaterThan(4);

        const seen = await where(bram, unaHas.me);

        // (Drawn in Bram's game, as herself, where his game has her)
        expect(seen.shown).toBe(true);
        expect(Math.hypot(seen.drawn[0] - seen.x, seen.drawn[1] - seen.y)).toBeLessThan(1.5);

        // (Her own hero looked ahead, from her frames' word of them: the scaling plan's 3-22)
        const ahead = await una.evaluate(() => {
            const { game, together } = window.pellagos;

            return { looks: game.forecast.corrections.looks, timed: game.forecast.corrections.timed, self: together.joining.self !== null, viewed: game.viewed, stamina: game.forecast.stamina, most: game.forecast.maxStamina };
        });

        expect(ahead.viewed && ahead.self).toBe(true);
        expect(ahead.looks).toBeGreaterThanOrEqual(5);
        expect(ahead.timed).toBeGreaterThanOrEqual(100);
        expect(ahead.stamina).toBeGreaterThan(0);
        expect(ahead.stamina).toBeLessThanOrEqual(ahead.most);

        // (And the town's folk and guards about her, each given a body from what the frames said they're drawn as)
        const drawn = await una.evaluate(() => {
            const { game } = window.pellagos;
            const count = (kind) => game.host.battle.actors.filter((actor) => actor.kind === kind && actor.map === game.mapId && game.avatars.get(actor.id)?.object.visible).length;

            return { folk: count("folk"), soldiers: count("soldier"), known: game.host.folk.size };
        });

        expect(drawn.known).toBeGreaterThanOrEqual(3);
        expect(drawn.folk + drawn.soldiers).toBeGreaterThanOrEqual(1);

        if (process.env.REPLICATED_SHOT) {
            await una.screenshot({ path: process.env.REPLICATED_SHOT });
        }

        // Fighting: Una sets on the orc by the town's edge, and it falls in her game as in the world
        expect((await command(una, { type: "engage", target: "orc", lock: true })).ok).toBe(true);
        await expect.poll(async () => (await where(una, "orc"))?.dead ?? false, { timeout: 150000, intervals: [3000] }).toBe(true);
        expect((await where(una, unaHas.me)).dead).toBe(false);
        // (Done with it: she stands where she is, so the two stay side by side for the trade)
        await command(una, { type: "unlock" });
        await command(una, { type: "stop" });

        // Trading: side by side, one asks, the other takes it up, gold's offered, both agree
        const beside = await where(una, unaHas.me);

        await command(bram, { type: "move", to: [Math.floor(beside.x) + 1, Math.floor(beside.y)], run: true });
        await expect.poll(async () => {
            const [a, b] = [await where(una, unaHas.me), await where(una, bramHas.me)];

            return b ? Math.hypot(a.x - b.x, a.y - b.y) : 99;
        }, { timeout: 90000, intervals: [2000] }).toBeLessThan(3);

        const trade = (page) => page.evaluate(() => {
            const { game } = window.pellagos;
            const now = game.worldview.trade(game.me);

            return now ? { open: now.open, rev: now.rev ?? 0, offers: now.offers } : null;
        });

        expect((await command(una, { type: "trade", with: bramHas.me })).ok).toBe(true);
        // (Asked: Bram's game has it, not yet open)
        await expect.poll(() => bram.evaluate(() => [...window.pellagos.game.host.trades.values()].map(({ open }) => open)), { timeout: 30000 }).toEqual([false]);
        expect((await command(bram, { type: "trade", with: unaHas.me })).ok).toBe(true);
        await expect.poll(async () => (await trade(una))?.open, { timeout: 30000 }).toBe(true);
        expect((await command(una, { type: "offer", gold: 5 })).ok).toBe(true);
        // (Her own offer's gold, by her id: an id may well have a 5 in it, so the offers' text isn't looked through for one)
        await expect.poll(async () => (await trade(bram))?.offers?.[unaHas.me]?.gold, { timeout: 30000 }).toBe(5);
        await expect.poll(async () => (await trade(una))?.offers?.[unaHas.me]?.gold, { timeout: 30000 }).toBe(5);

        const { rev } = await trade(una);
        const before = [(await has(una)).gold, (await has(bram)).gold];

        // (An agreeing refused says why, and how the two and their trade stood in that game just after)
        const agree = async (page) => {
            const result = await command(page, { type: "agree", rev });

            return result?.ok ? result : { ...result, rev, una: await where(page, unaHas.me), bram: await where(page, bramHas.me), trade: await trade(page) };
        };

        expect(await agree(una)).toEqual({ ok: true });
        expect(await agree(bram)).toEqual({ ok: true });
        await expect.poll(async () => (await has(bram)).gold, { timeout: 30000 }).toBe(before[1] + 5);
        await expect.poll(async () => (await has(una)).gold, { timeout: 30000 }).toBe(before[0] - 5);
        expect(await trade(una)).toBe(null);

        // (Still no copy, and nothing the frames said that couldn't be so)
        for (const one of [await has(una), await has(bram)]) {
            expect(one.ops + one.world).toBe(0);
            expect(one.faults).toBe(0);
        }

        // The kill switch: the server's replication turned off, both are sent out and told why,
        // and nobody's let back in while it's off (running worlds told as the management page's
        // change tells them: server/manage.js)
        await server.settings.change({ replication: "off" });

        for (const { thread } of server.registry.entries.values()) {
            thread?.replicate("off");
        }

        for (const page of [una, bram]) {
            await expect.poll(() => page.evaluate(() => Boolean(window.pellagos.inWorld)), { timeout: 30000 }).toBe(false);
            await expect(page.locator("body")).toContainText("turned off on its server for now", { timeout: 30000 });
        }
    } finally {
        await server.settings.change({ replication: "off" });
    }
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
        await playing(page, null, LONGER);
        await expect(rejoin).toBeHidden();
        expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Tamsin");

        const now = await where();

        expect(Math.hypot(now.x - stood.x, now.y - stood.y)).toBeLessThan(1.5);
    };

    // In, as Tamsin, by the world's open door: where they are kept, written as they play
    await page.goto(`${base}/`);
    await page.locator(`#titleserver li[data-world="${made.world}"]`).getByRole("button").click({ timeout: 30000 });
    await page.locator("#worldask").getByRole("button", { name: /^Tamsin/ }).click({ timeout: 60000 });
    await playing(page, null, LONGER);

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

test("a crash in a world on a server: the debug log sent to the server as the player comes straight back in, once, and kept there; with Send crash reports turned off, nothing sent", async ({ page }) => {
    // (As ready() has it, but the settings laid down only the first time, kept from load to load as
    // a device keeps them; and the next load, once it's asked for, finding the last game's notes
    // never closed, as a page that fell over leaves them)
    await keeping(page, { renderScale: 0.5 });
    await page.addInitScript(
        ({ character }) => {
            const notes = JSON.parse(localStorage.getItem("pellagos.alive") ?? "null");

            if (!localStorage.getItem("pellagos.characters")) {
                localStorage.setItem("pellagos.save", JSON.stringify(character));
            }

            if (sessionStorage.getItem("crash") === "next" && notes) {
                sessionStorage.removeItem("crash");
                localStorage.setItem("pellagos.alive", JSON.stringify({ ...notes, closed: false }));
            }
        },
        { character: save("Bryony", "human", "sword") },
    );
    page.on("pageerror", (error) => {
        throw error;
    });

    const made = await server.createWorld({ name: "Fernhollow", seed: 51, race: "human", heroes: "brought", settings: { open: true } });
    const rejoin = page.locator("#rejoin");
    const sent = () => server.worlds.get(made.world).crashes.list();
    const waiting = () => page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.crashreports") ?? "[]"));
    const crashes = () => page.evaluate(() => window.pellagos.telemetry.events.filter(({ kind }) => kind === "crash").length);
    const fallOver = async () => {
        await page.evaluate(() => sessionStorage.setItem("crash", "next"));
        await page.reload();
    };

    // In, as Bryony, by the world's open door
    await page.goto(`${base}/`);
    await page.locator(`#titleserver li[data-world="${made.world}"]`).getByRole("button").click({ timeout: 30000 });
    await page.locator("#worldask").getByRole("button", { name: /^Bryony/ }).click({ timeout: 60000 });
    await playing(page, null, LONGER);
    expect(await sent()).toEqual([]);

    // Fallen over: straight back in, and the log as it stood sent as she comes in (the crash first),
    // let go of here once it's taken
    await fallOver();
    await expect(rejoin).toBeVisible({ timeout: 60000 });
    expect(await crashes()).toBe(1);
    await playing(page, null, LONGER);
    await expect.poll(async () => (await sent()).length, { timeout: 30000 }).toBe(1);

    const [report] = await sent();

    expect(report.events[0]).toMatchObject({ kind: "crash", summary: "The game stopped while playing and loaded again (reload)" });
    expect(report).toMatchObject({ code: "dev", from: "home", player: server.access.world(made.world).players()[0].id });
    expect(Date.now() - Date.parse(report.crashed)).toBeLessThan(120000);
    expect(await waiting()).toEqual([]);

    // Game options, Debug log: Send crash reports, on to start with, turned off
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#logbutton").click();
    await expect(page.locator("#crashswitch")).toBeChecked();
    await page.locator("#menulog label.switch", { hasText: "Send crash reports" }).click();
    await expect(page.locator("#crashswitch")).not.toBeChecked();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).sendCrashes)).toBe(false);

    // Fallen over again: the debug log keeps it, but nothing waits to be sent (her way back in held
    // up, and cancelled), and the server has only the first
    await page.route("**/api/v1/enter", () => {});
    await fallOver();
    await expect(rejoin.locator('li[data-stage="enter"]')).toHaveAttribute("data-state", "now", { timeout: 60000 });
    expect(await crashes()).toBe(2);
    expect(await waiting()).toEqual([]);
    await rejoin.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("#title")).toBeVisible();
    await page.unroute("**/api/v1/enter");
    expect(await sent()).toHaveLength(1);
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
