// The world server's management (generated/world_server_plan.md §10, §15 S4), over real sockets:
// the page's own listener on the computer itself answers there alone, by its own names, from its own
// pages, each call carrying the page's cookie and header; from the Wi-Fi the admin key's traded for
// a session, never taken from the internet, and never answered to other sites; and a world's owner
// changes it (its heroes mode only while it's set aside), starts it, sets it aside, sends its
// players out, bans them, gives them new tickets, backs it up, restores it, exports it and deletes
// it (its name typed); and the server's settings, creator keys, journal and health.
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { decode, encode } from "../client/js/core/wire.js";
import { ADMIN_COOKIE, ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { guard, Refusal } from "../server/guards.js";
import { clockOf, EXPORT_FORMAT, IMPORT_LIMIT } from "../server/manage.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { SERVER_VERSION } from "../server/storage/versions.js";
import { LADDER } from "../server/storage/worlds.js";
import { WorldServer } from "../server/world-server.js";

// Short codes hashed cheaply in the tests
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword" });

const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 30000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

// A world server on loopback, with its management page's own listener (any free ports)
async function serve() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-admin-"));
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });

    made.push(folder);
    servers.push(server);
    await server.settings.change({ setAsideMinutes: 0 });
    await server.listen(0, "127.0.0.1");
    await server.listenAdmin(0);

    return server;
}

// A raw HTTP request to a port (headers as given, Host among them; a body's length said, as a browser
// says it, whatever the method): { status, headers, json, body }
function raw(port, { method = "GET", route = "/", host = `localhost:${port}`, headers = {}, body = null }) {
    const text = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port, path: route, method, headers: { Host: host, ...(text ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } : {}), ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const bytes = Buffer.concat(parts);
                const text = bytes.toString("utf8");

                resolve({ status: response.statusCode, headers: response.headers, json: text.startsWith("{") ? JSON.parse(text) : null, body: bytes });
            });
        });

        request.on("error", reject);
        request.end(text ?? undefined);
    });
}

// The management page on the computer itself: loaded (its cookie taken), then its calls, as the page makes them
async function mac(server) {
    const page = await raw(server.adminPort, {});
    const cookie = page.headers["set-cookie"][0].split(";")[0];

    return {
        page,
        cookie,
        call: (method, route, body) => raw(server.adminPort, { method, route: `/api/v1${route}`, headers: { Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE }, body }),
    };
}

// A file sent as it is (bytes, not JSON), as the page sends a world's file: { status, json }
function upload(port, route, bytes, headers = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port, path: `/api/v1${route}`, method: "POST", headers: { Host: `localhost:${port}`, "Content-Type": "application/octet-stream", "Content-Length": bytes.length, ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const text = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, json: text.startsWith("{") ? JSON.parse(text) : null });
            });
        });

        request.on("error", (error) => (error.code === "EPIPE" || error.code === "ECONNRESET" ? resolve({ status: 413, json: null }) : reject(error)));
        request.end(bytes);
    });
}

// A call to the play port's API (from the Wi-Fi): { status, json }
const wifi = (server, method, route, { body, auth, headers = {} } = {}) =>
    raw(server.port, { method, route: `/api/v1${route}`, host: `127.0.0.1:${server.port}`, headers: { ...(auth ? { Authorization: auth } : {}), ...headers }, body });

// A player's game on the play socket, into a world by a session and hello'd as a new hero: { lines, line(start), close() }
async function play(server, world, session) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, PLAY_PROTOCOL);
    const game = { lines: [], messages: [] };

    socket.onmessage = ({ data }) => {
        game.lines.push(data);

        if (data.startsWith("data\n")) {
            game.messages.push(decode(data.slice(5)));
        }
    };
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
    });
    game.line = (start) => game.lines.find((line) => line.startsWith(start)) ?? null;
    game.close = () => socket.close(1000);
    socket.send(`enter ${world} ${session}`);
    await until(() => game.line("entered") || game.line("closed"), "entered");
    socket.send(`data\n${encode({ kind: "hello", version: NET_VERSION, character: { hero: HERO }, hero: "new" })}`);
    await until(() => game.messages.some((message) => message.kind === "welcome"), "welcome");
    socket.send(`data\n${encode({ kind: "ready" })}`);

    return game;
}

describe("the management page's own listener, on the server's computer (server/admin.js)", () => {
    let server;

    before(async () => {
        server = await serve();
    });

    it("serves the page, giving it the cookie its calls carry (kept from other sites' pages)", async () => {
        const { page, cookie } = await mac(server);

        assert.equal(page.status, 200);
        assert.match(page.body.toString("utf8"), /<title>Pellagos Server<\/title>/);
        assert.match(page.headers["set-cookie"][0], new RegExp(`^${ADMIN_COOKIE}=[A-Za-z0-9_-]{32}; Path=/; HttpOnly; SameSite=Strict$`));
        assert.ok(cookie.length > 20);
    });

    it("answers its own names alone (no DNS rebinding), its own pages alone, and calls carrying both its header and its cookie", async () => {
        const { cookie, call } = await mac(server);
        const route = "/api/v1/server";

        // (Another name pointed at the computer: refused, the page and the API alike)
        assert.equal((await raw(server.adminPort, { host: "evil.example" })).status, 421);
        assert.equal((await raw(server.adminPort, { host: `evil.example:${server.adminPort}`, route, headers: { Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE } })).status, 421);
        assert.equal((await raw(server.adminPort, { host: `127.0.0.1:${server.adminPort}` })).status, 200);

        // (Another site's page, in the computer's own browser: refused, whatever it carries)
        const foreign = await raw(server.adminPort, { route, headers: { Origin: "https://evil.example", Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE } });

        assert.equal(foreign.status, 403);
        assert.equal(foreign.json.error, "origin");
        assert.equal(foreign.headers["access-control-allow-origin"], undefined);
        assert.equal((await raw(server.adminPort, { route, headers: { Origin: "null", Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE } })).status, 403);

        // (A call without the header, or the cookie, or with another: refused)
        for (const headers of [{ Cookie: cookie }, { [ADMIN_HEADER]: ADMIN_VALUE }, { Cookie: `${ADMIN_COOKIE}=nope`, [ADMIN_HEADER]: ADMIN_VALUE }, { Cookie: cookie, [ADMIN_HEADER]: "please" }]) {
            const refused = await raw(server.adminPort, { route, headers });

            assert.equal(refused.status, 403);
            assert.equal(refused.json.error, "csrf");
        }

        // (Its own page's call: the admin, needing no key)
        const answered = await call("GET", "/server");

        assert.equal(answered.status, 200);
        assert.equal(answered.json.overview.mac, true);
        assert.equal(answered.json.overview.adminKey, server.adminKey, "the admin key shown on the computer itself");
        assert.equal(answered.json.overview.id, server.identity.id);
        assert.ok(answered.json.schema.worldsAtOnce && answered.json.worldSchema.listed);
        assert.match(answered.json.overview.recommended.words, /^Recommended: up to \d+ at once \(memory allows \d+, the processor \d+\)\.$/);

        // (The game's own calls aren't the page's)
        assert.equal((await call("POST", "/enter", { world: "aaaaaaaaaa" })).status, 404);
    });

    it("listens on loopback alone", () => {
        assert.equal(server.admin.http.address().address, "127.0.0.1");
    });
});

describe("the server's management from the Wi-Fi (server/api.js /server)", () => {
    let server;

    before(async () => {
        server = await serve();
    });

    it("serves the page at /admin, and answers the admin key, traded for a session, with the management header", async () => {
        const page = await raw(server.port, { route: "/admin", host: `127.0.0.1:${server.port}` });

        assert.equal(page.status, 200);
        assert.match(page.body.toString("utf8"), /<title>Pellagos Server<\/title>/);
        assert.equal(page.headers["set-cookie"], undefined, "no cookie off the computer: the key's the proof");

        // (Nobody, or the wrong key: refused)
        assert.equal((await wifi(server, "GET", "/server", { headers: { [ADMIN_HEADER]: ADMIN_VALUE } })).status, 403);
        assert.equal((await wifi(server, "POST", "/server/session", { auth: "Key AAAAA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", headers: { [ADMIN_HEADER]: ADMIN_VALUE } })).status, 401);

        // (The admin key without the header: refused, as another site's page would be)
        assert.equal((await wifi(server, "POST", "/server/session", { auth: `Key ${server.adminKey}` })).json.error, "csrf");

        const { json } = await wifi(server, "POST", "/server/session", { auth: `Key ${server.adminKey}`, headers: { [ADMIN_HEADER]: ADMIN_VALUE } });
        const answered = await wifi(server, "GET", "/server", { auth: `Bearer ${json.session}`, headers: { [ADMIN_HEADER]: ADMIN_VALUE } });

        assert.equal(answered.status, 200);
        assert.equal(answered.json.overview.mac, false);
        assert.equal(answered.json.overview.adminKey, null, "the admin key's shown on the computer itself alone");

        // (Its session manages worlds too)
        const world = await wifi(server, "POST", "/worlds", { auth: `Bearer ${json.session}`, body: { name: "Ashby", race: "human" } });

        assert.equal(world.status, 200);
        assert.equal((await wifi(server, "GET", `/worlds/${world.json.world}`, { auth: `Bearer ${json.session}` })).json.name, "Ashby");

        // (What's for the computer itself alone isn't here)
        assert.equal((await wifi(server, "POST", "/server/admin-key", { auth: `Key ${server.adminKey}`, headers: { [ADMIN_HEADER]: ADMIN_VALUE } })).status, 404);
        assert.equal((await wifi(server, "POST", "/server/stop", { auth: `Key ${server.adminKey}`, headers: { [ADMIN_HEADER]: ADMIN_VALUE } })).status, 404);
    });

    it("answers the server's management to its own pages alone: never the game's on GitHub Pages", async () => {
        const headers = { Origin: "https://hoffspot.github.io", [ADMIN_HEADER]: ADMIN_VALUE };
        const refused = await wifi(server, "GET", "/server", { auth: `Key ${server.adminKey}`, headers });

        assert.equal(refused.status, 403);
        assert.equal(refused.json.error, "origin");
        assert.equal(refused.headers["access-control-allow-origin"], undefined);

        // (Nor may another site's page send the header: it's never allowed across sites)
        const asked = await wifi(server, "OPTIONS", "/server", { headers: { Origin: "https://hoffspot.github.io", "Access-Control-Request-Headers": ADMIN_HEADER } });

        assert.doesNotMatch(asked.headers["access-control-allow-headers"], new RegExp(ADMIN_HEADER, "i"));

        // (From the server's own page: answered)
        assert.equal((await wifi(server, "GET", "/server", { auth: `Key ${server.adminKey}`, headers: { Origin: `http://127.0.0.1:${server.port}`, [ADMIN_HEADER]: ADMIN_VALUE } })).status, 200);
    });

    it("never takes the admin key from the internet", async () => {
        // (The port refuses the internet outright, until TLS comes)
        assert.throws(() => guard({ address: "203.0.113.7", host: `127.0.0.1:${server.port}`, origin: undefined }, server), (error) => error instanceof Refusal && error.error === "internet");

        // (And the access hooks never take the admin key from there, nor let it manage the server)
        const { principal } = server.access.policy.identify({ key: server.adminKey, address: "203.0.113.7", from: "internet" });

        assert.deepEqual([principal.kind, principal.why], ["refused", "home"]);
        assert.equal(server.access.policy.allows({ kind: "admin", from: "internet" }, "server.manage").why, "home");
        assert.equal(server.access.policy.allows({ kind: "admin", from: "home" }, "server.manage").yes, true);
        assert.equal(server.access.policy.allows({ kind: "admin", from: "mac" }, "server.manage").yes, true);
    });
});

describe("a world's management (server/manage.js)", () => {
    let server;
    let admin;
    let world;

    before(async () => {
        server = await serve();
        admin = await mac(server);
        world = (await admin.call("POST", "/worlds", { name: "Thornwick", race: "human", seed: 3, settings: { mostPlayers: 4 } })).json;
    });

    it("shows a world's state in words and its clock, and changes it: its heroes mode only while it's set aside", async () => {
        const details = await admin.call("GET", `/worlds/${world.world}`);

        assert.equal(details.status, 200);
        assert.equal(details.json.life, "stored");
        assert.match(details.json.words, /^Never played/);
        assert.equal(details.json.settings.mostPlayers, 4);
        assert.deepEqual(clockOf(0), { day: 1, hour: "07:12" }, "a new world's mid-morning");

        // (Bad changes refused, every reason given, nothing changed)
        const bad = await admin.call("PATCH", `/worlds/${world.world}`, { name: "", heroes: "everyone's", settings: { mostPlayers: 99 }, colour: "red" });

        assert.equal(bad.status, 400);
        assert.match(bad.json.message, /a name.*kept or brought.*mostPlayers.*"colour"/s);
        assert.equal(server.metaOf(world.world).name, "Thornwick");

        // (Set aside: its heroes mode, name and rules change)
        const changed = await admin.call("PATCH", `/worlds/${world.world}`, { name: "Thornwick Vale", heroes: "brought", settings: { listed: true } });

        assert.equal(changed.status, 200);
        assert.deepEqual([changed.json.name, changed.json.heroes, changed.json.settings.listed, changed.json.settings.mostPlayers], ["Thornwick Vale", "brought", true, 4]);
        assert.equal((await wifi(server, "GET", "/status")).json.worlds[0].heroes, "brought", "listed now, as it's changed");

        // (Going: its heroes mode can't change, its rules can, and its thread's told)
        const started = await admin.call("POST", `/worlds/${world.world}/start`, {});

        assert.equal(started.status, 200);
        await until(() => server.registry.lifeOf(world.world).state, "the world open");

        const refused = await admin.call("PATCH", `/worlds/${world.world}`, { heroes: "kept" });

        assert.equal(refused.status, 409);
        assert.equal(refused.json.error, "running");
        assert.equal((await admin.call("PATCH", `/worlds/${world.world}`, { settings: { mostPlayers: 6 } })).status, 200);

        // (Set aside: saved, and its heroes mode changes; what its thread wrote kept what was changed while it ran)
        const aside = await admin.call("POST", `/worlds/${world.world}/aside`, {});

        assert.equal(aside.status, 200);
        assert.equal(aside.json.life, "stored");
        assert.match(aside.json.words, /^Set aside: saved at day 1/);
        assert.equal(server.metaOf(world.world).settings.mostPlayers, 6);
        assert.equal(server.metaOf(world.world).name, "Thornwick Vale");
        assert.equal((await admin.call("PATCH", `/worlds/${world.world}`, { heroes: "kept" })).json.heroes, "kept");
    });

    it("sends a player out, gives them a new ticket (the old no longer works), bans them and lifts it, and changes their part", async () => {
        // (A game of another version first: refused, saying the server's, for the game to say which is the newer)
        const other = await wifi(server, "POST", "/enter", { body: { world: world.world, key: world.playerKey, net: NET_VERSION + 1 } });

        assert.equal(other.status, 409);
        assert.deepEqual({ error: other.json.error, net: other.json.net, version: other.json.version }, { error: "version", net: NET_VERSION, version: SERVER_VERSION });

        const entered = await wifi(server, "POST", "/enter", { body: { world: world.world, key: world.playerKey, net: NET_VERSION } });

        assert.equal(entered.status, 200);

        const game = await play(server, world.world, entered.json.session);
        const player = entered.json.player;

        await until(async () => (await admin.call("GET", `/worlds/${world.world}/players`)).json.players[0]?.here, "the player shown in");

        const players = (await admin.call("GET", `/worlds/${world.world}/players`)).json.players;

        assert.deepEqual([players.length, players[0].id, players[0].role, players[0].name, players[0].via], [1, player, "player", "Ada", "Players' key"]);

        // (Sent out, saying why)
        assert.equal((await admin.call("POST", `/worlds/${world.world}/players/${player}/kick`, {})).json.kicked, 1);
        await until(() => game.line("closed"), "sent out");
        assert.equal(game.line("closed"), "closed kicked");

        // (A new ticket: the old no longer brings them back; the new does, as themselves)
        const { ticket } = (await admin.call("POST", `/worlds/${world.world}/players/${player}/ticket`, {})).json;

        assert.equal((await wifi(server, "POST", "/enter", { body: { world: world.world, ticket: entered.json.ticket } })).json.error, "key");

        const back = await wifi(server, "POST", "/enter", { body: { world: world.world, ticket } });

        assert.equal(back.status, 200);
        assert.equal(back.json.player, player);

        // (Banned: refused by their ticket; lifted: back)
        assert.equal((await admin.call("POST", `/worlds/${world.world}/players/${player}/ban`, {})).status, 200);
        assert.equal((await wifi(server, "POST", "/enter", { body: { world: world.world, ticket } })).json.error, "banned");
        assert.equal((await admin.call("POST", `/worlds/${world.world}/players/${player}/role`, { role: "trusted" })).json.error, "banned");
        assert.equal((await admin.call("POST", `/worlds/${world.world}/players/${player}/unban`, {})).json.unbanned, true);

        // (Made trusted)
        assert.equal((await admin.call("POST", `/worlds/${world.world}/players/${player}/role`, { role: "trusted" })).status, 200);
        assert.equal((await wifi(server, "POST", "/enter", { body: { world: world.world, ticket } })).json.role, "trusted");
        assert.equal((await admin.call("POST", `/worlds/${world.world}/players/AAAAAAAAAA/kick`, {})).status, 404);

        await until(() => server.registry.lifeOf(world.world).life === "stored", "set aside once they're gone");
    });

    it("lists its saves and backups, backs it up by hand, restores one (backed up first), and exports it", async () => {
        const listed = (await admin.call("GET", `/worlds/${world.world}/backups`)).json.backups;
        const kinds = (kind, why) => listed.filter((backup) => backup.kind === kind && (!why || backup.why === why));

        assert.ok(kinds("autosave").some((backup) => backup.id === "now"), "its latest save");
        assert.equal(kinds("backup", "hourly").length, 1, "an hourly backup made as it was first saved");
        assert.equal(kinds("backup", "daily").length, 1, "and a daily one");
        assert.ok(LADDER.hourly.keep === 12 && LADDER.daily.keep === 7);

        // (By hand)
        const after = (await admin.call("POST", `/worlds/${world.world}/backups`, {})).json.backups;
        const byHand = after.find((backup) => backup.why === "by-hand");

        assert.ok(byHand, "made by hand");

        // (Restored: what it was before backed up first, its journal told)
        const timeBefore = server.metaOf(world.world).worldTime;
        const restored = await admin.call("POST", `/worlds/${world.world}/backups/${byHand.id}/restore`, {});

        assert.equal(restored.status, 200);
        assert.equal(server.metaOf(world.world).worldTime, timeBefore);
        assert.ok((await admin.call("GET", `/worlds/${world.world}/backups`)).json.backups.some((backup) => backup.why === "before-restore"));
        assert.equal((await admin.call("POST", `/worlds/${world.world}/backups/nothing-here/restore`, {})).status, 404);
        assert.equal((await admin.call("POST", `/worlds/${world.world}/backups/..%2F..%2Fsecrets/restore`, {})).status, 404);

        // (Exported: one gzipped JSON file, its world, its latest snapshot and its kept heroes, nothing of who may come in)
        const exported = await raw(server.adminPort, { route: `/api/v1/worlds/${world.world}/export`, headers: { Cookie: admin.cookie, [ADMIN_HEADER]: ADMIN_VALUE } });

        assert.equal(exported.status, 200);
        assert.match(exported.headers["content-disposition"], /^attachment; filename="Thornwick-Vale-.*\.pellagos\.json\.gz"$/);

        const bundle = JSON.parse(gunzipSync(exported.body).toString("utf8"));

        assert.equal(bundle.format, EXPORT_FORMAT);
        assert.equal(bundle.world.name, "Thornwick Vale");
        assert.equal(decode(bundle.snapshot).battle.time, timeBefore);
        assert.ok(!JSON.stringify(bundle).includes(world.playerKey), "no key in it");
    });

    it("restores it from each kind of backup: its latest save and autosaves, hourly, daily, by hand, and from before a restore", async () => {
        const listed = (await admin.call("GET", `/worlds/${world.world}/backups`)).json.backups;
        const kinds = new Map();

        for (const backup of listed) {
            kinds.set(backup.kind === "autosave" ? backup.id.replace(/-\d+$/, "") : backup.why, backup);
        }

        assert.deepEqual([...kinds.keys()].filter((kind) => ["now", "hourly", "daily", "by-hand", "before-restore"].includes(kind)).sort(), ["before-restore", "by-hand", "daily", "hourly", "now"]);

        for (const [kind, backup] of kinds) {
            const restored = await admin.call("POST", `/worlds/${world.world}/backups/${backup.id}/restore`, {});

            assert.equal(restored.status, 200, `restored from ${kind} (${backup.id})`);
            assert.equal(restored.json.id, world.world);
        }
    });

    it("brings a world in from its file: a world of its own with its save, its time and its kept heroes, and new keys; refusing what isn't one, a newer one, one too big, and anyone who can't make worlds", async () => {
        const exported = (await raw(server.adminPort, { route: `/api/v1/worlds/${world.world}/export`, headers: { Cookie: admin.cookie, [ADMIN_HEADER]: ADMIN_VALUE } })).body;
        const bundle = JSON.parse(gunzipSync(exported).toString("utf8"));
        const page = { Cookie: admin.cookie, [ADMIN_HEADER]: ADMIN_VALUE };
        const brought = await upload(server.adminPort, "/worlds/import", exported, page);

        assert.equal(brought.status, 200, JSON.stringify(brought.json));
        assert.notEqual(brought.json.world, world.world, "an id of its own");
        assert.equal(brought.json.name, bundle.world.name);
        assert.match(brought.json.ownerKey, /^[0-9A-Z]{4}/);
        assert.match(brought.json.playerKey, /^[0-9A-Z]{4}/);

        const details = (await admin.call("GET", `/worlds/${brought.json.world}`)).json;

        assert.equal(details.seed, bundle.world.seed);
        assert.equal(server.metaOf(brought.json.world).worldTime, decode(bundle.snapshot).battle.time, "its time, from its save");
        assert.ok((await admin.call("GET", `/worlds/${brought.json.world}/backups`)).json.backups.some((backup) => backup.id === "now"), "its save kept");
        assert.ok((await readdir(path.join(server.root, "worlds", brought.json.world))).includes("journal.log"));

        // (Its players come in by its own new keys: the old world's don't open it)
        assert.equal((await wifi(server, "POST", "/enter", { body: { world: brought.json.world, key: world.playerKey } })).json.error, "key");
        assert.equal((await wifi(server, "POST", "/enter", { body: { world: brought.json.world, key: brought.json.playerKey } })).status, 200);

        // (Not a world's file; a newer server's; too big; and a player, who can't make worlds)
        const refused = async (bytes, headers = page) => {
            const answered = await upload(server.adminPort, "/worlds/import", bytes, headers);

            return answered.json?.error ?? `status ${answered.status}`;
        };

        assert.equal(await refused(Buffer.from("not a world")), "not-a-world");
        assert.equal(await refused(gzipSync(Buffer.from(JSON.stringify({ format: "pellagos.world.9", world: {} })))), "not-a-world");
        assert.equal(await refused(gzipSync(Buffer.from(JSON.stringify({ ...bundle, snapshot: encode({ ...decode(bundle.snapshot), version: 9999 }) })))), "newer");
        assert.match(await refused(Buffer.alloc(IMPORT_LIMIT + 1)), /^(too-big|status 413)$/);
        assert.equal((await upload(server.port, "/worlds/import", exported, { Host: `127.0.0.1:${server.port}`, Authorization: `Key ${world.playerKey}` })).status, 401, "a player's key makes no worlds");
        assert.equal(server.worlds.size, 2, "nothing left of those refused");
        assert.equal((await admin.call("DELETE", `/worlds/${brought.json.world}`, { confirm: brought.json.name })).status, 200);
    });

    it("deletes it only with its name typed: everyone sent out, its backups kept", async () => {
        const wrong = await admin.call("DELETE", `/worlds/${world.world}`, { confirm: "Thornwick" });

        assert.equal(wrong.status, 400);
        assert.equal(wrong.json.error, "confirm");
        assert.ok(server.metaOf(world.world));

        const deleted = await admin.call("DELETE", `/worlds/${world.world}`, { confirm: "Thornwick Vale" });

        assert.equal(deleted.status, 200);
        assert.equal(server.metaOf(world.world), null);
        assert.deepEqual(await readdir(path.join(server.root, "worlds")), []);
        assert.ok((await readdir(path.join(server.root, "backups", world.world))).some((name) => name.endsWith("before-delete")), "a last backup kept");
        assert.equal((await wifi(server, "POST", "/enter", { body: { world: world.world, key: world.playerKey } })).json.error, "no-world");
        assert.match((await admin.call("GET", "/server/journal")).json.activity[0].text, /"Thornwick Vale" .* was deleted by the admin, on the server's computer/);
    });
});

describe("the server's settings, creator keys, journal and health (server/manage.js)", () => {
    let server;
    let admin;

    before(async () => {
        server = await serve();
        admin = await mac(server);
    });

    it("changes its settings, each checked; makes and revokes creator keys; journals both; says how it's keeping up", async () => {
        assert.equal((await admin.call("PATCH", "/server", { settings: { worldsAtOnce: 0 } })).status, 400);

        const changed = await admin.call("PATCH", "/server", { settings: { worldsAtOnce: 3, adminPort: 9481 } });

        assert.equal(changed.status, 200);
        assert.equal(changed.json.restart, true, "a port changes when it's next started");
        assert.equal(server.settings.get("worldsAtOnce"), 3);

        const creator = await admin.call("POST", "/server/creators", { label: "Sam" });

        assert.equal(creator.status, 200);
        assert.equal((await wifi(server, "POST", "/worlds", { auth: `Key ${creator.json.key}`, body: { name: "Sam's", race: "elf" } })).status, 200);
        assert.equal((await admin.call("DELETE", `/server/creators/${creator.json.creator.id}`)).status, 200);
        assert.equal((await wifi(server, "POST", "/worlds", { auth: `Key ${creator.json.key}`, body: { name: "Again", race: "elf" } })).json.error, "key", "a revoked creator key opens nothing");

        const activity = (await admin.call("GET", "/server/journal")).json.activity.map((entry) => entry.text).join("\n");

        assert.match(activity, /settings were changed by the admin, on the server's computer: worldsAtOnce 3/);
        assert.match(activity, /A creator key, "Sam", was made/);
        assert.match(activity, /A creator key \(.{4}\) was revoked/);
        assert.match(activity, /Made by Sam: "Sam's"/);

        const health = await admin.call("GET", "/server/health");

        assert.equal(health.json.health, "ok");
        assert.deepEqual(health.json.worlds, []);
        assert.ok(health.json.server.rss > 0 && health.json.machine.cores >= 1);

        // (A new admin key, from the computer itself: the old one no longer works)
        const old = server.adminKey;
        const renewed = await admin.call("POST", "/server/admin-key", {});

        assert.equal(renewed.status, 200);
        assert.notEqual(renewed.json.key, old);
        assert.equal((await wifi(server, "POST", "/server/session", { auth: `Key ${old}`, headers: { [ADMIN_HEADER]: ADMIN_VALUE } })).status, 401);
        assert.equal((await wifi(server, "POST", "/server/session", { auth: `Key ${renewed.json.key}`, headers: { [ADMIN_HEADER]: ADMIN_VALUE } })).status, 200);
    });
});
