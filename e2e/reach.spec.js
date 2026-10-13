import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { newKey, pem, pemOfKey, selfSigned } from "../server/net/x509.js";
import { WorldServer } from "../server/world-server.js";
import { fakeTailscale } from "../test/fake-tailscale.js";
import { expect, test } from "./fixtures.js";

// Reaching a server from the game (generated/world_server_plan.md §9.3, §9.5, §15 S6e), in a
// browser: Test this server, from the game's own Worlds screen and from the management page's code
// (#test), trying the server's internet address (Tailscale Funnel's here, a Tailscale of the tests'
// own, its name brought to the server's tunnel as Tailscale would) and telling the server, whose
// page then says so; and a page opened over https that can't reach a server at home over plain
// http, handing the player to the server's own page with what's needed in the link.

test.describe.configure({ mode: "default" });

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const FUNNEL = "https://studio-mac.tail1234.ts.net";

const servers = [];
const folders = [];

async function serve(options = {}, settings = {}) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-reach-"));
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, ...options });

    folders.push(folder);
    servers.push(server);
    await server.settings.change({ setAsideMinutes: 0, ...settings });
    await server.listen(0, "127.0.0.1");

    return server;
}

test.afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
    await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

test("Test this server: the game tries the server's internet address and tells it, from its Worlds screen and from the page's code; the management page says so", async ({ page }) => {
    const server = await serve({ funnel: { run: fakeTailscale() }, tunnelPort: 0 }, { internet: true, funnel: true });

    await expect.poll(() => server.funnel.state().url, { timeout: 20000 }).toBe(FUNNEL);

    // (Funnel's name brought to the server's tunnel, as Tailscale's servers would)
    await page.route(`${FUNNEL}/**`, async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace(FUNNEL, `http://127.0.0.1:${server.tunnelPort}`) }) }));
    page.on("pageerror", (error) => {
        throw error;
    });
    await page.goto(`http://127.0.0.1:${server.port}/`);
    await page.locator("#worldsbutton").click();

    const worlds = page.locator("#worlds");
    const row = worlds.locator(`li[data-server="127.0.0.1:${server.port}"]`);

    await page.locator("#worldsaddress").fill(`127.0.0.1:${server.port}`);
    await worlds.getByRole("button", { name: "Add" }).click();
    await expect(row).toContainText("Version", { timeout: 30000 });
    await row.getByRole("button", { name: "Test this server" }).click();
    await expect(page.locator("#worldsstatus")).toContainText(`Tested: reached at ${FUNNEL} (`, { timeout: 30000 });
    await expect(page.locator("#worldsstatus")).toContainText("Its owner sees this on its management page. This device seems to be on the server's own network");
    expect(server.reports[0].results[0]).toMatchObject({ address: FUNNEL, ok: true });

    // (The management page's code: the game opened afresh at #test, testing its own server at once)
    await page.goto("about:blank");
    await page.goto(`http://127.0.0.1:${server.port}/#test`);
    await expect(page.locator("#worldsstatus")).toContainText(`Tested: reached at ${FUNNEL} (`, { timeout: 30000 });
    expect(server.reports.length).toBe(2);
    expect(page.url()).not.toContain("#test");

    // (The page shows what was found, and the code to scan)
    await server.listenAdmin(0);
    await page.goto(`http://localhost:${server.adminPort}/`);

    const internet = page.locator("section.panel", { has: page.getByRole("heading", { name: "The internet" }) });

    await expect(internet).toContainText(`from the internet (through Tailscale Funnel): reached it at ${FUNNEL} (`);
    await expect(internet.getByRole("link", { name: `${FUNNEL}/#test` })).toBeVisible();
});

test("a page opened over https that can't reach a server at home over plain http hands the player to the server's own page", async ({ ownBrowser: browser }) => {
    const { privateKey } = newKey();
    const server = await serve({ home: () => false }, { internet: true });

    await server.useCertificate({ key: pemOfKey(privateKey), cert: pem("CERTIFICATE", selfSigned({ key: privateKey, names: ["127.0.0.1"], days: 7 })) });

    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    page.on("pageerror", (error) => {
        throw error;
    });

    // (Known, with a world and its key, at a home address this page can't reach plainly)
    await page.addInitScript(() => {
        localStorage.setItem(
            "pellagos.servers",
            JSON.stringify({ version: 1, servers: [{ key: "10.255.255.1:8480", host: "10.255.255.1", port: 8480, secure: false, id: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE", name: "Studio Mac", worlds: { abcdefghij: { name: "Thornwick", key: "KEY-123" } } }] }),
        );
    });
    await page.goto(`https://127.0.0.1:${server.port}/`);
    await page.locator("#worldsbutton").click();

    const row = page.locator('#worlds li[data-server="10.255.255.1:8480"]');

    await expect(row).toContainText("browsers won't let it reach a server at home over plain http", { timeout: 30000 });

    const link = row.getByRole("link", { name: "Open the game from the server: http://10.255.255.1:8480" });

    await expect(link).toHaveAttribute("href", /^http:\/\/10\.255\.255\.1:8480\/#server=10\.255\.255\.1%3A8480&id=AAAAA-BBBBB-CCCCC-DDDDD-EEEEE$/);
    await context.close();
});
