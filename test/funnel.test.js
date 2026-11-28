// Tailscale Funnel and the tunnel listener (generated/world_server_plan.md §9.4, §15 S6d), against
// a Tailscale command of the tests' own (test/fake-tailscale.js): asked for while the internet's
// answered and the `funnel` setting's on, by `funnel --bg --https=443 --yes <the tunnel>`; let go
// when it's closed or the server stops; each way it can't be had said, with where to put it right.
// Through the tunnel listener, on loopback alone, everything's the internet's: from X-Forwarded-
// For's address, by the tunnel's names, keys needed, never the management page; the play socket
// taken; closed with the internet. And what games say of reaching the server from elsewhere
// ("Test this server") kept for the management page.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { Funnel, FUNNEL_REFUSALS, FUNNEL_TIMES, jittered } from "../server/funnel.js";
import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import { connectionOf, countrySaid, FRONTS, frontOf, guard, NO_COUNTRY } from "../server/guards.js";
import { tailscale } from "../server/platform/index.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { WorldServer } from "../server/world-server.js";
import { fakeTailscale } from "./fake-tailscale.js";

// Short codes hashed cheaply in the tests (the server's own cost takes 128 MiB and a good part of a second)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const NAME = "studio-mac.tail1234.ts.net";

const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 20000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

// A world server on loopback (loopback made the internet, as the `home` option lets the tests),
// its Tailscale the fake one, its tunnel listener on any free port; open to the internet through
// Funnel unless `settings` say otherwise
async function serve(run, { settings = {} } = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-funnel-"));

    made.push(root);

    const server = await WorldServer.open(root, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, funnel: { run }, tunnelPort: 0, home: () => false });

    await server.settings.change({ setAsideMinutes: 0, internet: true, funnel: true, ...settings });
    await server.listen(0, "127.0.0.1");
    servers.push(server);

    return server;
}

/** A request through the tunnel listener, as Tailscale's proxy sends it on: { status, json }. */
function through(server, { route = "/api/v1/status", method = "GET", host = NAME, forwarded = "198.51.100.7", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const asked = http.request({ host: "127.0.0.1", port: server.tunnelPort, path: route, method, agent: false, headers: { Host: host, ...(forwarded ? { "X-Forwarded-For": forwarded } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const text = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, json: text.startsWith("{") ? JSON.parse(text) : text });
            });
        });

        asked.on("error", reject);
        asked.end(body ? JSON.stringify(body) : undefined);
    });
}

describe("Tailscale's command (server/platform)", () => {
    it("is tried where each system keeps it, and said to be missing when it's nowhere", async () => {
        const tried = [];
        const execFile = (command, args, options, done) => {
            tried.push(command);
            done(Object.assign(new Error("no such file"), { code: "ENOENT" }), "", "");
        };

        assert.deepEqual(await tailscale({ system: "darwin", execFile })(["status", "--json"]), { missing: true });
        assert.deepEqual(tried, ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale", "/usr/local/bin/tailscale", "tailscale"]);

        const answered = await tailscale({ system: "linux", execFile: (command, args, options, done) => done(null, '{"BackendState":"Running"}', "") })(["status", "--json"]);

        assert.deepEqual(answered, { ok: true, stdout: '{"BackendState":"Running"}', stderr: "", timedOut: false });
    });
});

describe("Tailscale Funnel (server/funnel.js)", () => {
    const server = { tunnelPort: 8482 };

    it("asks for it to the tunnel, says where the internet comes in, and lets it go", async () => {
        const run = fakeTailscale();
        const funnel = new Funnel(server, { run });

        await funnel.follow(true);
        assert.equal(funnel.state().url, `https://${NAME}`);
        assert.equal(run.target, "http://127.0.0.1:8482");
        assert.deepEqual(run.calls.slice(0, 3), ["status --json", "serve status --json", "funnel --bg --https=443 --yes http://127.0.0.1:8482"]);

        await funnel.follow(false);
        assert.equal(run.target, null);
        assert.equal(run.calls.at(-1), "funnel --https=443 off");
        assert.equal(funnel.state().url, null);
    });

    it("says why it can't be had: not installed, signed out, not allowed on the tailnet (and where to allow it), or something else served there", async () => {
        const failed = async (options) => {
            const run = fakeTailscale(options);
            const funnel = new Funnel(server, { run });
            const state = await funnel.follow(true);

            await funnel.close();

            return { state, run };
        };

        assert.equal((await failed({ installed: false })).state.error.message, FUNNEL_REFUSALS.missing);

        const signedOut = await failed({ backend: "NeedsLogin" });

        assert.equal(signedOut.state.error.message, FUNNEL_REFUSALS.NeedsLogin);
        assert.equal(signedOut.state.allow, "https://login.tailscale.com/a/1a2b3c4d");

        const notAllowed = await failed({ allowed: false });

        assert.match(notAllowed.state.error.message, /isn't allowed for this computer on its tailnet yet: allow it at https:\/\/login\.tailscale\.com\/f\/funnel\?node=nX1y2Z3/);
        assert.equal(notAllowed.state.allow, "https://login.tailscale.com/f/funnel?node=nX1y2Z3");
        assert.ok(notAllowed.state.retryAt, "asked again later");

        // (Something of the owner's own already served there: left as it is, never taken over)
        const busy = await failed({ served: "http://127.0.0.1:3000" });

        assert.match(busy.state.error.message, /already serves something else at https:\/\/studio-mac\.tail1234\.ts\.net \(http:\/\/127\.0\.0\.1:3000\)/);
        assert.ok(!busy.run.calls.some((call) => call.startsWith("funnel --bg")));
        assert.equal(busy.run.target, "http://127.0.0.1:3000");
    });

    it("asks an older Tailscale without --yes", async () => {
        const run = fakeTailscale({ old: true });
        const state = await new Funnel(server, { run }).follow(true);

        assert.equal(state.url, `https://${NAME}`);
        assert.ok(run.calls.includes("funnel --bg --https=443 http://127.0.0.1:8482"));
    });
});

describe("the tunnel listener (server/world-server.js, guards.js)", () => {
    it("takes the internet through Funnel with no certificate of the server's own: as the internet's, by the tunnel's names, never the management page", async () => {
        const run = fakeTailscale();
        const server = await serve(run);

        await until(() => server.funnel.state().url, "Funnel open");
        assert.ok(server.tunnelPort > 0);
        assert.equal(run.target, `http://127.0.0.1:${server.tunnelPort}`);

        // (Its card, from X-Forwarded-For's address; Funnel's address among the server's)
        const card = await through(server);

        assert.equal(card.status, 200);
        assert.deepEqual(card.json.you, { address: "198.51.100.7", from: "internet", home: false });
        assert.ok(card.json.addresses.includes(`https://${NAME}`));

        // (By the tunnel's own address too, should Tailscale not pass the name on; another name refused)
        assert.equal((await through(server, { host: `127.0.0.1:${server.tunnelPort}` })).status, 200);
        assert.equal((await through(server, { host: "evil.example" })).json.error, "host");

        // (The game's own files through it, a page's Origin not asked of them; the API's calls are)
        assert.equal((await through(server, { route: "/", headers: { Origin: "https://evil.example" } })).status, 200);
        assert.equal((await through(server, { headers: { Origin: "https://evil.example" } })).json.error, "origin");
        assert.equal((await through(server, { headers: { Origin: `https://${NAME}` } })).status, 200);

        // (Never the management page, nor the admin key)
        assert.equal((await through(server, { route: "/admin" })).json.error, "home");
        assert.equal((await through(server, { route: "/api/v1/server", headers: { Authorization: `Key ${server.adminKey}`, "X-Pellagos": "manage" } })).status, 403);

        // (The page says so; plain straight to the port is still refused, as there's no certificate)
        const internet = server.manage.internet();

        assert.equal(internet.tunneled, true);
        assert.equal(internet.direct, false);
        assert.match(internet.words, /Answers the internet through Tailscale Funnel, at https:\/\/studio-mac\.tail1234\.ts\.net/);
        assert.match(internet.funnel.words, /brings the internet to the server at https:\/\/studio-mac\.tail1234\.ts\.net/);
    });

    it("takes the play socket through it, a key needed; and sends out whoever came that way when the internet's closed, Funnel let go", async () => {
        const run = fakeTailscale();
        const server = await serve(run);
        const world = await server.createWorld({ name: "Through", seed: 7, race: "human" });

        await until(() => server.funnel.state().url, "Funnel open");

        const entered = await through(server, { method: "POST", route: "/api/v1/enter", body: { world: world.world, key: world.playerKey, net: NET_VERSION } });

        assert.equal(entered.status, 200, JSON.stringify(entered.json));

        // (Node's WebSocket, plain, to the tunnel's own address: as Tailscale's proxy brings it)
        const socket = new WebSocket(`ws://127.0.0.1:${server.tunnelPort}/play`, PLAY_PROTOCOL);
        const lines = [];
        let closed = false;

        socket.onmessage = ({ data }) => lines.push(data);
        socket.onclose = () => (closed = true);
        await new Promise((resolve, reject) => {
            socket.onopen = resolve;
            socket.onerror = reject;
        });
        socket.send(`enter ${world.world} ${entered.json.session}`);
        await until(() => lines.some((line) => line.startsWith("entered ") || line.startsWith("closed ")), "in");
        assert.ok(lines.some((line) => line.startsWith("entered ")), lines.join(" | "));

        const [place] = server.play.places.values();

        assert.equal(place.from, "internet");
        assert.equal(place.tunnel, true);

        // (Closed to the internet: sent out, Funnel let go, the tunnel listener closed)
        await server.manage.changeSettings({ internet: false });
        await until(() => lines.includes("closed internet-closed") || closed, "sent out");
        await until(() => server.tunnel === null && run.target === null, "the tunnel closed");
        assert.equal(run.calls.at(-1), "funnel --https=443 off");
        assert.equal(server.manage.internet().addresses.length, 0);
    });

    it("asks Tailscale again when the tunnel's port is changed", async () => {
        const run = fakeTailscale();
        const server = await serve(run);

        await until(() => server.funnel.state().url, "Funnel open");

        const before = server.tunnelPort;

        server.tunnelPortGiven = null;
        await server.manage.changeSettings({ tunnelPort: before === 48482 ? 48483 : 48482 });
        await until(() => server.tunnelPort !== before && run.target === `http://127.0.0.1:${server.tunnelPort}`, "Funnel to the new port");
        assert.equal((await through(server)).status, 200);
    });

    it("says the tunnel's port is taken, if it is", async () => {
        const first = await serve(fakeTailscale());

        await until(() => first.funnel.state().url, "Funnel open");

        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-funnel-"));

        made.push(root);

        const second = await WorldServer.open(root, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, funnel: { run: fakeTailscale() }, tunnelPort: first.tunnelPort, home: () => false });

        await second.settings.change({ internet: true, funnel: true });
        await second.listen(0, "127.0.0.1");
        servers.push(second);
        await until(() => second.tunnelError, "the port refused");
        assert.match(second.manage.internet().funnel.words, /The tunnel's port on this computer \(\d+\) is taken by something else/);
    });
});

describe("what's in front of the tunnel listener (guards.js FRONTS; the scaling plan's 6C-1)", () => {
    // A request as the server's guard sees it: over a socket (direct, or the tunnel listener's by a front), with headers
    const asked = ({ address = "127.0.0.1", front = undefined, tunnel = front !== undefined, secure = false, host = "play.example.com", headers = {} }) =>
        connectionOf({ socket: { remoteAddress: address, tunnel, ...(front === undefined ? {} : { front }), encrypted: secure }, headers: { host, ...headers } }, { origin: undefined });
    const standing = { hosts: new Set(["play.example.com"]), tunnelHosts: new Set(["play.example.com"]), origins: new Set(), internetClosed: null, tunnelClosed: null };
    const from = (request) => guard(asked(request), standing);
    // (Every header anyone might put an address in, each claiming somewhere else)
    const claims = { "x-forwarded-for": "192.168.1.5", "cf-connecting-ip": "192.168.1.6", "x-real-ip": "192.168.1.7", forwarded: "for=192.168.1.8", "true-client-ip": "192.168.1.9" };

    it("names three fronts, each trusted for one header: Tailscale Funnel and a reverse proxy for X-Forwarded-For's last address, Cloudflare Tunnel for CF-Connecting-IP; a name that's none is Funnel", () => {
        assert.deepEqual(Object.keys(FRONTS), ["funnel", "cloudflared", "proxy"]);
        assert.deepEqual(Object.fromEntries(Object.entries(FRONTS).map(([name, front]) => [name, [front.address, front.last, front.country]])), {
            funnel: ["x-forwarded-for", true, null],
            cloudflared: ["cf-connecting-ip", false, "cf-ipcountry"],
            proxy: ["x-forwarded-for", true, null],
        });
        assert.equal(frontOf("no such front"), FRONTS.funnel);
        assert.equal(frontOf(undefined), FRONTS.funnel);
    });

    it("believes no header on a direct connection: where it's from is the socket's own address, whatever the headers claim", () => {
        // (From the internet, claiming to be at home: the internet's still)
        assert.deepEqual(from({ address: "203.0.113.50", secure: true, headers: claims }), { address: "203.0.113.50", from: "internet", tunnel: false });
        // (From home, claiming an address out on the internet: home's still)
        assert.deepEqual(from({ address: "192.168.1.20", headers: { "x-forwarded-for": "198.51.100.7", "cf-connecting-ip": "198.51.100.8" } }), { address: "192.168.1.20", from: "home", tunnel: false });
        assert.equal(asked({ address: "203.0.113.50", headers: claims }).forwarded, undefined, "(not so much as read)");
        assert.equal(asked({ address: "203.0.113.50", headers: claims }).front, null);
    });

    it("believes Tailscale Funnel's X-Forwarded-For, its last address, and nothing else it's sent", () => {
        assert.deepEqual(from({ front: "funnel", headers: { "x-forwarded-for": "198.51.100.7" } }), { address: "198.51.100.7", from: "internet", tunnel: true });
        assert.deepEqual(from({ front: "funnel", headers: { "x-forwarded-for": "192.168.1.5, 10.0.0.9, 198.51.100.7" } }).address, "198.51.100.7", "(the earlier ones are anyone's say)");
        assert.deepEqual(from({ front: "funnel", headers: { ...claims, "x-forwarded-for": "198.51.100.7" } }).address, "198.51.100.7");
        // (No X-Forwarded-For: not Cloudflare's header in its place)
        assert.deepEqual(from({ front: "funnel", headers: { "cf-connecting-ip": "198.51.100.8" } }), { address: "tunnel", from: "internet", tunnel: true });
        // (A socket of the tunnel's with no front named, as before fronts had names: Funnel's)
        assert.deepEqual(from({ tunnel: true, headers: { "x-forwarded-for": "198.51.100.7", "cf-connecting-ip": "198.51.100.8" } }).address, "198.51.100.7");
        // (Never home, though it comes from loopback and says a home address)
        assert.equal(from({ front: "funnel", headers: { "x-forwarded-for": "192.168.1.5" } }).from, "internet");
    });

    it("believes Cloudflare Tunnel's CF-Connecting-IP, one address, and never an X-Forwarded-For a visitor wrote themselves", () => {
        // (And its country, none said here: a front that says countries always answers of one, 6B-20)
        assert.deepEqual(from({ front: "cloudflared", headers: { "cf-connecting-ip": "198.51.100.7" } }), { address: "198.51.100.7", from: "internet", tunnel: true, country: null });
        assert.equal(from({ front: "cloudflared", headers: { "cf-connecting-ip": "2001:db8::7" } }).address, "2001:db8::7");
        assert.equal(from({ front: "cloudflared", headers: { ...claims, "cf-connecting-ip": "198.51.100.7" } }).address, "198.51.100.7");
        // (X-Forwarded-For alone, which Cloudflare passes on with whatever the visitor put in it: not believed)
        assert.equal(from({ front: "cloudflared", headers: { "x-forwarded-for": "192.168.1.5, 198.51.100.7" } }).address, "tunnel");
        // (More than one address in it isn't Cloudflare's doing: nothing usable)
        assert.equal(from({ front: "cloudflared", headers: { "cf-connecting-ip": "192.168.1.5, 198.51.100.7" } }).address, "tunnel");
        assert.equal(from({ front: "cloudflared", headers: { "cf-connecting-ip": "not an address" } }).address, "tunnel");
    });

    it("takes a visitor's country from the front that says it, Cloudflare's CF-IPCountry, and from nowhere else (6B-20): no country in the answer on a direct connection or behind Funnel or a proxy, whatever the header claims", () => {
        const cloud = (said) => from({ front: "cloudflared", headers: { "cf-connecting-ip": "198.51.100.7", ...(said === undefined ? {} : { "cf-ipcountry": said }) } });

        assert.deepEqual(cloud("GB"), { address: "198.51.100.7", from: "internet", tunnel: true, country: "GB" });
        assert.equal(cloud("br").country, "BR");

        // (Where Cloudflare couldn't tell, or it's Tor; nothing said; anything that isn't two letters: no country, said so)
        for (const none of ["XX", "T1", "xx", undefined, "", "GBR", "G", "1A", "GB, BR"]) {
            assert.deepEqual(cloud(none), { address: "198.51.100.7", from: "internet", tunnel: true, country: null }, String(none));
        }

        assert.deepEqual(NO_COUNTRY, ["XX", "T1"]);
        assert.deepEqual([countrySaid(" id "), countrySaid(null), countrySaid(["GB"])], ["ID", null, null]);

        // (A header claiming a country that isn't listed, to slip Nanny Mode: not so much as read)
        const claim = { "cf-ipcountry": "FR", "x-country": "FR" };

        assert.deepEqual(from({ address: "203.0.113.50", secure: true, headers: claim }), { address: "203.0.113.50", from: "internet", tunnel: false });
        assert.deepEqual(from({ address: "192.168.1.20", headers: claim }), { address: "192.168.1.20", from: "home", tunnel: false });
        assert.deepEqual(from({ front: "funnel", headers: { ...claim, "x-forwarded-for": "198.51.100.7" } }), { address: "198.51.100.7", from: "internet", tunnel: true });
        assert.deepEqual(from({ front: "proxy", headers: { ...claim, "x-forwarded-for": "198.51.100.7" } }), { address: "198.51.100.7", from: "internet", tunnel: true });
        assert.equal(asked({ address: "203.0.113.50", headers: claim }).country, undefined);
        assert.equal(asked({ front: "funnel", headers: claim }).country, undefined);
    });

    it("believes a reverse proxy's X-Forwarded-For, its last address, as Funnel's", () => {
        assert.deepEqual(from({ front: "proxy", headers: { ...claims, "x-forwarded-for": "192.168.1.5, 198.51.100.7" } }), { address: "198.51.100.7", from: "internet", tunnel: true });
        assert.equal(from({ front: "proxy", headers: { "cf-connecting-ip": "198.51.100.8", "x-real-ip": "198.51.100.9" } }).address, "tunnel");
    });

    it("waits a little more or less before asking Tailscale again, by chance, never more than a fifth either way", async () => {
        assert.equal(FUNNEL_TIMES.jitter, 0.2);
        assert.deepEqual([jittered(60000, 0), jittered(60000, 0.5), jittered(60000, 1)], [48000, 60000, 72000]);

        const server = { tunnelPort: 8482 };

        for (const [random, wait] of [[0, 48000], [0.5, 60000], [0.999, 71976]]) {
            const funnel = new Funnel(server, { run: fakeTailscale({ backend: "Stopped" }), clock: () => 1000000, random: () => random });
            const state = await funnel.follow(true);

            assert.equal(Date.parse(state.retryAt) - 1000000, wait, String(random));
            await funnel.follow(false);
        }
    });

    it("takes the internet through Cloudflare Tunnel, run by the owner under a name of theirs: Tailscale never asked, the name among the server's, Cloudflare's header believed and no other", async () => {
        const run = fakeTailscale();
        const server = await serve(run, { settings: { front: "cloudflared", frontHost: "Play.Example.com" } });
        const cloud = (extra = {}) => through(server, { host: "play.example.com", forwarded: null, ...extra });

        await until(() => server.tunnelPort > 0, "the tunnel listening");
        assert.deepEqual([server.front, server.frontName, server.frontUrl], ["cloudflared", "play.example.com", "https://play.example.com"]);
        assert.deepEqual(run.calls.filter((call) => call.startsWith("funnel")), [], "(Tailscale's Funnel isn't asked for)");

        // (Its card, from CF-Connecting-IP; its name among the server's addresses)
        const card = await cloud({ headers: { "CF-Connecting-IP": "198.51.100.7", "X-Forwarded-For": "192.168.1.5" } });

        assert.equal(card.status, 200);
        assert.deepEqual(card.json.you, { address: "198.51.100.7", from: "internet", home: false });
        assert.ok(card.json.addresses.includes("https://play.example.com"));

        // (X-Forwarded-For alone isn't believed: where it's from can't be told)
        assert.deepEqual((await cloud({ headers: { "X-Forwarded-For": "198.51.100.9" } })).json.you, { address: "tunnel", from: "internet", home: false });

        // (By its own name alone; a page of its own may use it; never the management page)
        assert.equal((await cloud({ host: NAME })).json.error, "host");
        assert.equal((await cloud({ headers: { "CF-Connecting-IP": "198.51.100.7", Origin: "https://play.example.com" } })).status, 200);
        assert.equal((await cloud({ route: "/admin", headers: { "CF-Connecting-IP": "198.51.100.7" } })).json.error, "home");

        const internet = server.manage.internet();

        assert.equal(internet.tunneled, true);
        assert.match(internet.words, /Answers the internet through Cloudflare Tunnel, at https:\/\/play\.example\.com \(its own certificate\)/);

        // (No name given, or one that isn't a host's: not reached through it, and said so)
        await server.manage.changeSettings({ frontHost: "not a host name" });
        assert.deepEqual([server.frontName, server.frontUrl, server.manage.internet().tunneled], [null, null, false]);
        assert.match(server.manage.internet().words, /its front has no name yet/);
        await until(() => server.tunnelPort > 0, "the tunnel listening again");
        assert.equal((await cloud({ headers: { "CF-Connecting-IP": "198.51.100.7" } })).json.error, "host");

        // (Back to Tailscale Funnel: asked for, and X-Forwarded-For believed again)
        await server.manage.changeSettings({ front: "funnel" });
        await until(() => server.funnel.state().url, "Funnel open");
        assert.deepEqual((await through(server, { headers: { "CF-Connecting-IP": "198.51.100.8" } })).json.you, { address: "198.51.100.7", from: "internet", home: false });
    });
});

describe("a player's country from the front (server/play.js; the scaling plan's 6B-20)", () => {
    // The play socket opened through the tunnel listener as a front's proxy would, with the
    // headers it adds (Node's own WebSocket can't send any): upgraded, then one line sent
    function play(server, { headers, line }) {
        return new Promise((resolve, reject) => {
            const key = randomBytes(16).toString("base64");
            const socket = net.connect(server.tunnelPort, "127.0.0.1", () => {
                socket.write([`GET /play HTTP/1.1`, `Host: play.example.com`, "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", `Sec-WebSocket-Protocol: ${PLAY_PROTOCOL}`, ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`), "", ""].join("\r\n"));
            });
            let heard = "";

            socket.on("error", reject);
            socket.on("data", (data) => {
                heard += data.toString("latin1");

                if (!heard.includes("\r\n\r\n") || socket.sent) {
                    return;
                }

                socket.sent = true;

                if (!heard.startsWith("HTTP/1.1 101") || !heard.includes(createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64"))) {
                    reject(new Error(heard.split("\r\n")[0]));

                    return;
                }

                // (One text frame, masked as a client's must be)
                const text = Buffer.from(line, "utf8");
                const mask = randomBytes(4);

                socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | text.length]), mask, text.map((byte, k) => byte ^ mask[k % 4])]));
                resolve(socket);
            });
        });
    }

    it("is the front's say where the front says one, before the country file and in place of it: Cloudflare's GB in Nanny Mode for the United Kingdom's rules though the file says elsewhere; one it couldn't tell unknown, the file not asked; and by the file behind a front that says none", async () => {
        const server = await serve(fakeTailscale(), { settings: { front: "cloudflared", frontHost: "play.example.com", nanny: "all" } });
        const world = await server.createWorld({ name: "Fronted", seed: 7, race: "human" });
        const asked = [];

        // (The country file stood in for: it would say France of anyone)
        server.countries.country = (address) => {
            asked.push(address);

            return "FR";
        };
        await until(() => server.tunnelPort > 0, "the tunnel listening");

        const come = async (headers) => {
            const entered = await through(server, { method: "POST", route: "/api/v1/enter", host: "play.example.com", forwarded: null, headers, body: { world: world.world, key: world.playerKey, net: NET_VERSION } });

            assert.equal(entered.status, 200, JSON.stringify(entered.json));

            const before = new Set(server.play.places.values());
            const socket = await play(server, { headers, line: `enter ${world.world} ${entered.json.session}` });

            await until(() => [...server.play.places.values()].some((place) => !before.has(place)), "in the world");

            const place = [...server.play.places.values()].find((one) => !before.has(one));

            return { socket, place: { address: place.address, country: place.country, nanny: place.nanny, why: place.nannyWhy } };
        };

        // Cloudflare says the United Kingdom: in it, by its rules; the file not asked
        const briton = await come({ "CF-Connecting-IP": "198.51.100.7", "CF-IPCountry": "GB" });

        assert.deepEqual(briton.place, { address: "198.51.100.7", country: "GB", nanny: true, why: { why: "country", code: "GB", threshold: 16 } });
        assert.deepEqual(asked, []);

        // Cloudflare couldn't tell (Tor): unknown, and so in it; the file still not asked
        const hidden = await come({ "CF-Connecting-IP": "198.51.100.8", "CF-IPCountry": "T1" });

        assert.deepEqual(hidden.place, { address: "198.51.100.8", country: null, nanny: true, why: { why: "unknown", code: null, threshold: 18 } });
        assert.deepEqual(asked, []);

        // Cloudflare says a country that isn't listed: out of it
        const french = await come({ "CF-Connecting-IP": "198.51.100.9", "CF-IPCountry": "FR" });

        assert.deepEqual(french.place, { address: "198.51.100.9", country: "FR", nanny: false, why: null });

        for (const { socket } of [briton, hidden, french]) {
            socket.destroy();
        }

        // Behind a front that says no country (a proxy of the owner's): the file's, whatever header claims one
        await server.manage.changeSettings({ front: "proxy" });
        await until(() => server.tunnelPort > 0 && server.play.places.size === 0, "the tunnel open again, everyone out");

        const proxied = await come({ "X-Forwarded-For": "198.51.100.10", "CF-IPCountry": "GB" });

        assert.deepEqual(proxied.place, { address: "198.51.100.10", country: "FR", nanny: false, why: null });
        assert.deepEqual(asked, ["198.51.100.10"]);
        proxied.socket.destroy();
    });
});

describe("Test this server's reports (server/manage.js report, POST /reachability)", () => {
    it("keeps what a game found at the server's own addresses alone, says it, and tells home from the internet", async () => {
        const server = await serve(fakeTailscale());

        await until(() => server.funnel.state().url, "Funnel open");
        assert.match(server.manage.internet().tests.words, /Not tested from outside yet/);

        // (Through the tunnel, from the internet)
        const reported = await through(server, {
            method: "POST",
            route: "/api/v1/reachability",
            body: {
                results: [
                    { address: `https://${NAME}`, ok: true, ms: 182.4, socket: true },
                    { address: "https://203.0.113.9:8480", ok: false, error: "timed out" },
                    { address: "https://evil.example", ok: true },
                ],
            },
        });

        assert.equal(reported.status, 200, JSON.stringify(reported.json));
        assert.deepEqual(
            reported.json.report.results.map(({ address }) => address),
            [`https://${NAME}`],
            "only the server's own addresses kept",
        );

        const { tests } = server.manage.internet();

        assert.equal(tests.reports.length, 1);
        assert.match(tests.words, /from the internet \(through Tailscale Funnel, from 198\.51\.100\.7\): reached it at https:\/\/studio-mac\.tail1234\.ts\.net \(182 ms, and played there\)/);

        // (None of its own: refused; and too often from one address: told to wait)
        assert.equal((await through(server, { method: "POST", route: "/api/v1/reachability", body: { results: [{ address: "https://evil.example", ok: true }] } })).status, 400);

        for (let k = 0; k < 6; k++) {
            await through(server, { method: "POST", route: "/api/v1/reachability", forwarded: "198.51.100.99", body: { results: [{ address: `https://${NAME}`, ok: true }] } });
        }

        assert.equal((await through(server, { method: "POST", route: "/api/v1/reachability", forwarded: "198.51.100.99", body: { results: [{ address: `https://${NAME}`, ok: true }] } })).json.error, "wait");
        assert.equal(server.reports.length, 5, "the last 5 kept");
    });

    it("says a test from the server's own Wi-Fi proves nothing of the internet", async () => {
        const report = { at: new Date().toISOString(), from: "home", tunnel: false, address: "192.168.1.20", results: [{ address: "http://studio-mac.local:8480", ok: true, socket: false, ms: 4, error: null }] };
        const server = await serve(fakeTailscale(), { settings: { funnel: false } });

        server.reports = [report];
        assert.match(server.manage.internet().tests.words, /from this server's own Wi-Fi: reached it at http:\/\/studio-mac\.local:8480 \(4 ms\)\. From here that doesn't show the internet can reach it/);
    });
});
