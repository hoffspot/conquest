import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { addressOf, inviteLink } from "../client/js/app/invites.js";
import { newKey, pem, pemOfKey, selfSigned } from "../server/net/x509.js";
import { WorldServer } from "../server/world-server.js";
import { dnsHosts, FakeAcme, lookupOf, TOKENS } from "../test/fake-acme.js";
import { FakeRouter } from "../test/fake-router.js";
import { fakeTailscale } from "../test/fake-tailscale.js";
import { expect, test } from "./fixtures.js";

// The world server from the internet, over TLS (generated/world_server_plan.md §9.1, §15 S6): a
// server open to the internet (here no address is home, so the browser on loopback is the
// internet), its certificate one the browser's told to take. A page asked for plainly is sent on
// to https; the game, as the server serves it securely, follows an invite link into a world and
// plays in it over wss; its management page isn't there to be had. And on the server's own
// computer, the management page says how it stands with the internet, and takes a certificate of
// the owner's own, or sets the server up to get free ones from Let's Encrypt itself (here from a
// certificate authority of the tests' own, DuckDNS's API faked); what the home's router forwards
// (a router of the tests' own), or why it won't and how to forward the port by hand; and, with one
// switch, opens the server to the internet, lets it in through Tailscale Funnel (a Tailscale of
// the tests' own), shows what a game found testing it from outside, and closes it again.

// (A world drawn without a GPU: more than the usual time)
test.setTimeout(300000);
test.describe.configure({ mode: "default" });

// Short codes hashed cheaply (the server's own cost is for a Mac, not a test)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const hero = {
    version: 1,
    seed: 777,
    created: "2026-10-13T12:00:00.000Z",
    hero: {
        name: "Brand",
        weapon: "sword",
        race: "human",
        parts: [],
        shape: { macro: { gender: 0.5, muscle: 0.5, weight: 0.4, height: 0.5, bust: 0.4, african: 0.2, asian: 0.2, caucasian: 0.6 }, details: {} },
        look: { skin: { tone: "#d9b394" }, eyes: { iris: "#5a7a3a" }, hair: { style: "short", beard: "none", colour: "#3a2a1a" } },
    },
};

/** A key and a certificate signed by it, for `names`. */
function pair(names) {
    const { privateKey } = newKey();

    return { key: pemOfKey(privateKey), cert: pem("CERTIFICATE", selfSigned({ key: privateKey, names, days: 7 })) };
}

const made = [];
const servers = [];

async function serve(options = {}) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-secure-"));

    made.push(folder);

    // (Its router never asked: test/router.test.js asks one of its own)
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, ...options });

    await server.settings.change({ setAsideMinutes: 0 });
    await server.listen(0, "127.0.0.1");
    servers.push(server);

    return server;
}

test.afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

test("from the internet, over TLS alone: a page asked for plainly sent on to https; the game there follows an invite into a world and plays over wss; no management page", async ({ ownBrowser: browser }) => {
    const server = await serve({ home: () => false });

    await server.useCertificate(pair(["127.0.0.1", "localhost"]));
    await server.manage.changeSettings({ internet: true });

    const world = await server.createWorld({ name: "Farhold", seed: 4, race: "human" });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    await page.addInitScript(
        ({ settings, character }) => {
            localStorage.setItem("pellagos.settings", JSON.stringify(settings));
            localStorage.setItem("pellagos.save", JSON.stringify(character));
        },
        { settings: { quality: "low", renderScale: 0.5, shadows: false }, character: hero },
    );
    page.on("pageerror", (error) => {
        throw error;
    });

    // (Asked for plainly: sent on to the same page over TLS, a secure context)
    const secure = `https://127.0.0.1:${server.port}/`;

    await page.goto(`http://127.0.0.1:${server.port}/`);
    expect(page.url()).toBe(secure);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true);

    // (An invite to the server's secure address: into the world, a new hero, over wss)
    const link = inviteLink(secure, { address: addressOf(`https://127.0.0.1:${server.port}`), id: server.identity.id, world: world.world, key: world.playerKey });

    expect(link).toContain("secure=1");
    await page.goto(link);
    await expect(page.locator("#worldask #worldasktitle")).toHaveText("Who goes into Farhold", { timeout: 60000 });
    await page.locator("#worldask").getByRole("button", { name: /A new hero/ }).click();
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 180000, polling: 250 });

    const [place] = server.play.places.values();

    expect(place.from).toBe("internet");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.servers")).servers[0].secure)).toBe(true);

    // (The management page isn't to be had from there)
    const admin = await page.request.get(`${secure}admin`);

    expect(admin.status()).toBe(403);
    expect((await admin.json()).error).toBe("home");

    await context.close();
});

test("on the server's computer, the management page says how it stands with the internet, takes a certificate of the owner's own, and turns the internet on", async ({ page }) => {
    const server = await serve();

    await server.listenAdmin(0);
    page.on("pageerror", (error) => {
        throw error;
    });
    await page.goto(`http://localhost:${server.adminPort}/`);

    const internet = page.locator("section.panel", { has: page.getByRole("heading", { name: "The internet" }) });

    await expect(internet).toContainText("Answers its own Wi-Fi alone");

    // (A certificate of the owner's own, put in from its files)
    const own = pair(["pellagos.example.com", "127.0.0.1"]);

    await internet.getByText("A certificate of your own").click();
    await internet.locator('input[name="key"]').setInputFiles({ name: "privkey.pem", mimeType: "application/x-pem-file", buffer: Buffer.from(own.key) });
    await internet.locator('input[name="cert"]').setInputFiles({ name: "fullchain.pem", mimeType: "application/x-pem-file", buffer: Buffer.from(own.cert) });
    await internet.getByRole("button", { name: "Use it" }).click();

    const after = page.locator("section.panel", { has: page.getByRole("heading", { name: "The internet" }) });

    await expect(after).toContainText("It has a certificate for pellagos.example.com, 127.0.0.1");
    await expect(after).toContainText("Fingerprint (SHA-256)");
    expect(server.certificate.names).toEqual(["pellagos.example.com", "127.0.0.1"]);

    // (Turned on in Settings: it says where the internet reaches it)
    await page.locator('#tabs [data-tab="settings"]').click();
    await page.getByLabel("Answer the internet (over TLS alone, once the server has a certificate)").check();
    await page.locator("#settings").getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#status")).toHaveText("Saved.");
    await page.locator('#tabs [data-tab="overview"]').click();

    const open = page.locator("section.panel", { has: page.getByRole("heading", { name: "The internet" }) });

    await expect(open).toContainText("Answers the internet, over TLS alone");
    await expect(open).toContainText(`https://pellagos.example.com:${server.port}/`);
    expect(server.internetClosed).toBe(null);
});

test("on the server's computer, the management page sets it up to get free certificates (a DuckDNS name), shows how that goes, never the token, and stops it", async ({ page }) => {
    const fake = await new FakeAcme().start();
    const kept = new Map();
    const tokens = { where: "the tests' memory", get: async (name) => kept.get(name) ?? null, set: async (name, token) => void kept.set(name, token), remove: async (name) => kept.delete(name) };
    const server = await serve({ acme: { directory: fake.directory, fetch: dnsHosts(fake.dns).fetch, lookup: lookupOf(fake.dns), poll: 20 }, tokens });

    try {
        await server.listenAdmin(0);
        page.on("pageerror", (error) => {
            throw error;
        });
        await page.goto(`http://localhost:${server.adminPort}/`);

        const internet = () => page.locator("section.panel", { has: page.getByRole("heading", { name: "The internet" }) });

        // (Opened, the form asks the server what it takes: the routes, the CA's terms)
        await internet().getByText("A free certificate from Let's Encrypt").click();
        await expect(internet().locator('select[name="route"]')).toHaveValue("duckdns");
        await expect(internet().getByRole("link", { name: "terms of service" })).toHaveAttribute("href", `${fake.base}/terms`);
        await expect(internet().locator('input[name="address"]')).toBeHidden();
        await internet().locator('input[name="name"]').fill("sam.duckdns.org");
        await internet().locator('input[name="token"]').fill(TOKENS.duckdns);

        // (Not without agreeing to the terms)
        await internet().getByRole("button", { name: "Get a certificate" }).click();
        await expect(internet().locator("details.acme [role=status]")).toHaveText("Getting a certificate means agreeing to Let's Encrypt's terms of service.");
        await internet().getByLabel("I agree to Let's Encrypt's terms of service").check();
        await internet().getByRole("button", { name: "Get a certificate" }).click();

        // (Got, taken up, and said: the token never shown)
        await expect(internet()).toContainText(/Gets its certificate for sam\.duckdns\.org from Let's Encrypt \(a free DuckDNS name\) and renews it itself/, { timeout: 20000 });
        await expect(internet()).toContainText("It has a certificate for sam.duckdns.org");
        expect(server.certificate.names).toEqual(["sam.duckdns.org"]);
        expect(kept.get("acme:duckdns")).toBe(TOKENS.duckdns);
        expect(await page.content()).not.toContain(TOKENS.duckdns);

        // (Stopped: the route and its token forgotten, the certificate kept)
        await internet().getByRole("button", { name: "Stop getting them" }).click();
        await page.locator("#confirmgo").click();
        await expect(internet().getByText("A free certificate from Let's Encrypt")).toBeVisible();
        expect(kept.size).toBe(0);
        expect(server.certificate.names).toEqual(["sam.duckdns.org"]);
    } finally {
        fake.close();
    }
});

test("on the server's computer, the management page says what the router forwards and how the internet sees the home; or why it won't, and how to forward the port by hand", async ({ page }) => {
    const fake = await new FakeRouter({ speaks: ["natpmp", "stun"] }).start();
    const router = { gateways: async () => ({ v4: "127.0.0.1", v6: null }), lan: "127.0.0.1", v6: null, port: fake.port, ssdp: { address: "127.0.0.1", port: fake.ssdpPort }, stun: [{ host: "127.0.0.1", port: fake.stunPort }], reach: () => "127.0.0.1", quick: true };
    const server = await serve({ router });

    try {
        await server.listenAdmin(0);
        page.on("pageerror", (error) => {
            throw error;
        });
        await page.goto(`http://localhost:${server.adminPort}/`);

        const internet = () => page.locator("section.panel", { has: page.getByRole("heading", { name: "The internet" }) });

        // (Not asked while the internet isn't answered: nothing said of the router)
        await expect(internet().getByRole("heading", { name: "The router" })).toHaveCount(0);

        // (Turned on in Settings: the router asked, by NAT-PMP here)
        await page.locator('#tabs [data-tab="settings"]').click();
        await page.getByLabel("Answer the internet (over TLS alone, once the server has a certificate)").check();
        await page.locator("#settings").getByRole("button", { name: "Save" }).click();
        await expect(page.locator("#status")).toHaveText("Saved.");
        await page.locator('#tabs [data-tab="overview"]').click();
        await expect(internet()).toContainText(`The router (NAT-PMP) sends the internet's port ${server.port} to this computer`, { timeout: 20000 });
        await expect(internet()).toContainText("The server reached itself by its public address: the port is open.");
        await expect(internet()).toContainText("203.0.113.9");
        expect(fake.mappings.has(`natpmp ${server.port}`)).toBe(true);

        // (The router turned stubborn: asked again, it says why, and how to forward the port by hand)
        fake.refuse.natpmp = 2;
        await internet().getByRole("button", { name: "Ask the router again" }).click();
        await expect(internet()).toContainText("The router wouldn't let the internet in: NAT-PMP: The router refused (forwarding may be turned off in its settings).", { timeout: 20000 });
        await expect(internet()).toContainText(`Forward it by hand: in the router's settings (at http://127.0.0.1/), send TCP port ${server.port} to this computer (127.0.0.1), port ${server.port}.`);
    } finally {
        await server.close();
        fake.close();
    }
});

test("on the server's computer, the management page opens to the internet, lets it in through Tailscale Funnel, shows a game's test from outside, and closes it again", async ({ page }) => {
    const run = fakeTailscale({ allowed: false });
    const server = await serve({ funnel: { run }, tunnelPort: 0 });
    const name = "studio-mac.tail1234.ts.net";

    await server.listenAdmin(0);
    page.on("pageerror", (error) => {
        throw error;
    });
    await page.goto(`http://localhost:${server.adminPort}/`);

    const internet = () => page.locator("section.panel", { has: page.getByRole("heading", { name: "The internet" }) });

    // (Closed: one switch opens it; with no way in yet, it says so)
    await expect(internet()).toContainText("Answers its own Wi-Fi alone");
    await internet().getByRole("button", { name: "Open to the internet" }).click();
    await expect(internet()).toContainText("It's open to the internet, but has no certificate yet");

    // (Tailscale Funnel: on a tailnet that hasn't allowed it, where to allow it; allowed, asked again)
    await internet().getByText("Tailscale Funnel", { exact: true }).click();
    await internet().getByRole("button", { name: "Use Tailscale Funnel" }).click();
    await expect(internet()).toContainText("Funnel isn't allowed for this computer on its tailnet yet", { timeout: 20000 });
    await expect(internet().getByRole("link", { name: "Put it right in Tailscale" })).toHaveAttribute("href", "https://login.tailscale.com/f/funnel?node=nX1y2Z3");
    run.allowed = true;
    await internet().getByRole("button", { name: "Ask Tailscale again" }).click();
    await expect(internet()).toContainText(`Answers the internet through Tailscale Funnel, at https://${name}`, { timeout: 20000 });
    await expect(internet()).toContainText(`Players type ${name} in the game.`);
    expect(run.target).toBe(`http://127.0.0.1:${server.tunnelPort}`);

    // (A game's test from outside, through the tunnel: shown once the page looks again)
    await new Promise((resolve, reject) => {
        const body = JSON.stringify({ results: [{ address: `https://${name}`, ok: true, ms: 240, socket: true }] });
        const asked = http.request({ host: "127.0.0.1", port: server.tunnelPort, path: "/api/v1/reachability", method: "POST", agent: false, headers: { Host: name, "X-Forwarded-For": "198.51.100.7", "Content-Type": "application/json" } }, (response) => {
            response.resume();
            response.on("end", () => (response.statusCode === 200 ? resolve() : reject(new Error(`reported: ${response.statusCode}`))));
        });

        asked.on("error", reject);
        asked.end(body);
    });
    await expect(internet()).toContainText(`from the internet (through Tailscale Funnel, from 198.51.100.7): reached it at https://${name} (240 ms, and played there)`, { timeout: 20000 });

    // (Closed with the one switch: Funnel let go, the internet no longer answered)
    await internet().getByRole("button", { name: "Close to the internet" }).click();
    await page.locator("#confirmgo").click();
    await expect(internet()).toContainText("Answers its own Wi-Fi alone");
    await expect.poll(() => run.target).toBe(null);
    expect(server.tunnel).toBe(null);
});
