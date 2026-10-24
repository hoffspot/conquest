import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorldServer } from "../server/world-server.js";
import { expect, test } from "./fixtures.js";

// Players' own worlds through a world server's broker (generated/world_server_plan.md §8.3, §9.6,
// §15 S7), in two browsers at once on the server's own page: a world opened from the game's menu
// through the server, listed on it, and joined from the Worlds screen point to point (WebRTC, on
// loopback); its listing taken down when it's closed. And a host whose browser can't be reached
// directly (no ICE candidate gets through): joined relayed by the server, and hidden from the list
// once the server no longer relays. (The broker's expiry, caps and refusals: test/broker.test.js.)

// (Two worlds drawn at once, without a GPU: more than the usual time; one test after the other)
test.setTimeout(420000);
test.describe.configure({ mode: "default" });

// (WebRTC's host candidates as plain addresses, not mDNS names a container can't resolve)
test.use({
    launchOptions: {
        args: ["--enable-unsafe-swiftshader", "--disable-features=WebRtcHideLocalIpsWithMdns"],
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    },
});

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const ELF = {
    version: 1,
    seed: 777,
    created: "2026-10-13T12:00:00.000Z",
    hero: {
        name: "Syl",
        weapon: "bow",
        race: "elf",
        parts: [],
        shape: { macro: { gender: 0.1, muscle: 0.4, weight: 0.3, height: 0.7, bust: 0.4, african: 0.05, asian: 0.15, caucasian: 0.8 }, details: { earLength: 0.9, earPoint: 0.9 } },
        look: { skin: { tone: "#ecd0b6" }, eyes: { iris: "#3fa6e8" }, hair: { style: "long", beard: "none", colour: "#e8dcb0" } },
    },
};

let server;
let folder;
let base;

test.beforeAll(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-broker-"));
    server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, funnel: false, ice: [] });
    await server.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${server.port}`;
});

test.afterAll(async () => {
    await server?.close();
    await rm(folder, { recursive: true, force: true });
});

// Drawn cheaply, a character kept already (if given), errors thrown; and, `blocked`, a browser no
// direct link gets through to (ICE only through relays, of which there are none)
async function ready(page, { character = null, blocked = false } = {}) {
    await page.addInitScript(
        ({ character, blocked }) => {
            localStorage.setItem("pellagos.settings", JSON.stringify({ quality: "low", renderScale: 0.5, shadows: false }));

            if (character) {
                localStorage.setItem("pellagos.save", JSON.stringify(character));
            }

            if (blocked) {
                const Real = window.RTCPeerConnection;

                window.RTCPeerConnection = class extends Real {
                    constructor(config = {}) {
                        super({ ...config, iceTransportPolicy: "relay" });
                    }
                };
            }
        },
        { character, blocked },
    );
    page.on("pageerror", (error) => {
        throw error;
    });
}

async function playing(page) {
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 180000, polling: 250 });
}

// The host plays, and opens their world from the menu: through the server, a code
async function opened(host) {
    await host.goto(`${base}/?play&seed=2`);
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 30000 });
    await expect(invite.locator("#invitestatus")).toContainText("Your world's open to others through");

    return [invite, await invite.locator("#invitecode").textContent()];
}

test("a player's own world through the server's broker: listed on it, joined from the Worlds screen point to point; its listing gone when it's closed", async ({ ownBrowser: browser }) => {
    const host = await (await browser.newContext()).newPage();
    const guest = await (await browser.newContext()).newPage();

    await ready(host);
    await ready(guest, { character: ELF });

    const [invite, code] = await opened(host);

    // (The page's own server: no other named in the link; listed for players there to see)
    await expect(invite.locator("#invitelink")).toHaveText(new RegExp(`\\?join=${code}$`));
    await expect(invite.locator("#invitelisting")).toBeVisible();
    await invite.locator("#invitelisting").click();
    await expect.poll(() => server.broker.listings.get(code)?.said.visibility).toBe("listed");
    await invite.getByRole("button", { name: "Back to the game" }).click();

    // The elf finds it on the server's Worlds screen, and joins it
    await guest.goto(`${base}/`);
    await guest.locator("#worldsbutton").click();
    await guest.locator("#worldsaddress").fill(`127.0.0.1:${server.port}`);
    await guest.locator("#worlds").getByRole("button", { name: "Add", exact: true }).click();

    const listed = guest.locator(`#worlds li.player-world[data-listing="${code}"]`);

    await expect(listed).toContainText("A player's world", { timeout: 30000 });
    // (Said as the host's reachability check found it: on loopback, its own address, private or not)
    await expect(listed).toContainText(`1 of 8 in · ${server.broker.listings.get(code).said.direct ? "linked directly" : "on your network"}`);
    await listed.getByRole("button").click();

    const join = guest.locator("#join");

    await expect(join.locator("#joincode")).toHaveValue(code);
    await join.getByRole("button", { name: "Join" }).click();
    await playing(guest);
    expect(await guest.evaluate(() => window.pellagos.together.link.how)).toBe("direct");
    await expect.poll(() => host.evaluate(() => window.pellagos.game.others().length), { timeout: 30000 }).toBe(1);

    // (Closed to others: taken down on the server)
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();
    await invite.getByRole("button", { name: "Close the world to others" }).click();
    await expect.poll(() => server.broker.listings.size, { timeout: 30000 }).toBe(0);
});

test("a host whose game's reloaded opens their world to friends again under its code, each stage shown, and the friend in it goes straight back in", async ({ ownBrowser: browser }) => {
    const host = await (await browser.newContext()).newPage();
    const guest = await (await browser.newContext()).newPage();
    const bram = { ...ELF, hero: { ...ELF.hero, name: "Bram", race: "human", weapon: "sword", guid: "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d" } };
    const syl = { ...ELF, hero: { ...ELF.hero, guid: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e" } };

    // (Each a character kept on their device, from the first time it's opened; the host's stages of
    // the way back in, as they're marked)
    for (const [page, character] of [
        [host, bram],
        [guest, syl],
    ]) {
        await page.addInitScript((character) => {
            localStorage.setItem("pellagos.settings", JSON.stringify({ quality: "low", renderScale: 0.5, shadows: false }));

            if (!localStorage.getItem("pellagos.characters")) {
                localStorage.setItem("pellagos.save", JSON.stringify(character));
            }

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
        }, character);
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    // Bram plays, and opens his world through the server: kept to open again
    await host.goto(`${base}/`);
    await host.locator("#continuebutton").click({ timeout: 60000 });
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 30000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();
    expect(await host.evaluate(() => JSON.parse(localStorage.getItem("pellagos.inworld")))).toMatchObject({ kind: "hosting", code, name: "Bram", listed: false });

    // Syl joins by its code
    await guest.goto(`${base}/?join=${code}`);
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect.poll(() => host.evaluate(() => window.pellagos.game.others().length), { timeout: 30000 }).toBe(1);

    // Bram's game reloaded: his world loaded and opened to friends again, the dialog naming it and
    // each stage under way and then done; under its code, told so
    await host.reload();

    const rejoin = host.locator("#rejoin");

    await expect(rejoin).toBeVisible({ timeout: 60000 });
    await expect(rejoin.locator("#rejointitle")).toHaveText("Back into your world");
    await expect(rejoin.locator("#rejoinabout")).toHaveText(`Opening it to your friends again, under its code, ${code}, as Bram.`);
    await playing(host);
    await expect(rejoin).toBeHidden({ timeout: 60000 });
    expect(await host.evaluate(() => window.stagesSeen)).toEqual(["load:now", "load:done", "reopen:now"]);
    expect(await host.evaluate(() => window.pellagos.together.code)).toBe(code);
    await expect(host.locator("#banner")).toContainText(`Your world's open to friends again, under its code, ${code}: those who were in it are coming back.`);

    // Syl's game, told the world was opened again, goes straight back in by its code
    await expect(guest.locator("#rejoin #rejointitle")).toHaveText("Back into Bram's world", { timeout: 60000 });
    await playing(guest);
    await expect(guest.locator("#rejoin")).toBeHidden();
    await expect.poll(() => host.evaluate(() => window.pellagos.game.others().length), { timeout: 60000 }).toBe(1);
    expect(await guest.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Syl");
});

test("a host no direct link gets through to is joined relayed by the server; and hidden from its list once the server doesn't relay", async ({ ownBrowser: browser }) => {
    const host = await (await browser.newContext()).newPage();
    const guest = await (await browser.newContext()).newPage();

    await ready(host, { blocked: true });
    await ready(guest, { character: ELF });

    const [invite, code] = await opened(host);

    await invite.locator("#invitelisting").click();
    await invite.getByRole("button", { name: "Back to the game" }).click();
    await expect.poll(() => server.broker.listings.get(code)?.said).toMatchObject({ visibility: "listed", direct: false, local: false });

    // (Joined by the code's link: tried directly, then relayed)
    await guest.goto(`${base}/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    expect(await guest.evaluate(() => window.pellagos.together.link.how)).toBe("relayed");

    // (Listed through the server while it relays; hidden once it doesn't)
    const players = async () => (await (await fetch(`${base}/api/v1/status`)).json()).players.map((one) => [one.id, one.through]);

    expect(await players()).toEqual([[code, true]]);
    await server.manage.changeSettings({ relaying: false });
    expect(await players()).toEqual([]);
});
