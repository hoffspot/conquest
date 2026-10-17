// Getting people into a world on a world server (docs/SERVER.md, "Getting people in"): its invite
// link (server/manage.js invite; access/index.js inviteKey, replaceInvite), one for anyone, to the
// game's page on the server itself at its internet address if it has one (else its Wi-Fi's), with
// the world's players' key, the same each time; replaced, the old one letting nobody new in, those
// who came by it kept. And a world open to anyone (its `open` setting; access/policy.js): anyone
// comes in without a key, by its door, and back by their ticket; no more newcomers an hour than
// OPEN says; bans as ever; turned off, no newcomers, those already in still welcome.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { inviteOf } from "../client/js/app/invites.js";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { OPEN, OPEN_DOOR, PLAYERS_KEY } from "../server/access/world.js";
import { WorldServer } from "../server/world-server.js";

// Short codes and keys hashed cheaply in the tests
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

// A world server on loopback, its Wi-Fi a made-up one
async function serve() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-invite-"));
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), interfaces: { en0: [{ address: "192.168.1.20", family: "IPv4", internal: false }] }, hostname: "studio-mac" });

    made.push(folder);
    servers.push(server);
    await server.listen(0, "127.0.0.1");

    return server;
}

// A call to the API: { status, json }
function call(port, method, route, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
        const text = JSON.stringify(body);
        const request = http.request({ host: "127.0.0.1", port, path: `/api/v1${route}`, method, headers: { Host: `localhost:${port}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text), ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const answer = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, json: answer.startsWith("{") ? JSON.parse(answer) : null });
            });
        });

        request.on("error", reject);
        request.end(text);
    });
}

describe("a world's invite link (manage.js invite)", () => {
    let server;
    let world;

    before(async () => {
        server = await serve();
        world = await server.createWorld({ name: "Ashby", seed: 3, race: "human" });
    });

    it("is one for anyone: the game's page on the server itself, on its Wi-Fi while it's closed to the internet, with the world's players' key, the same each time", async () => {
        const owner = (await call(server.port, "POST", "/enter", { world: world.world, key: world.ownerKey, net: NET_VERSION })).json;
        const { status, json } = await call(server.port, "POST", `/worlds/${world.world}/invite`, {}, { Authorization: `Bearer ${owner.session}` });

        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.everywhere, false);
        assert.equal(json.page, `http://192.168.1.20:${server.port}/`, "its Wi-Fi's IPv4 address, not its .local name");
        assert.equal(json.key, world.playerKey, "the players' key made with the world");
        assert.equal(json.open, false);

        const invite = inviteOf(json.link);

        assert.ok(json.link.startsWith(json.page));
        assert.deepEqual([invite.address.key, invite.address.secure, invite.id, invite.world, invite.key], [`192.168.1.20:${server.port}`, false, server.identity.id, world.world, world.playerKey]);
        assert.equal((await call(server.port, "POST", `/worlds/${world.world}/invite`, {}, { Authorization: `Bearer ${owner.session}` })).json.link, json.link, "the same link each time");

        // (A player can't make one; nor replace it)
        const player = (await call(server.port, "POST", "/enter", { world: world.world, key: world.playerKey, net: NET_VERSION })).json;

        assert.equal((await call(server.port, "POST", `/worlds/${world.world}/invite`, {}, { Authorization: `Bearer ${player.session}` })).json.error, "role");
    });

    it("carries the server's internet address once it's open to the internet, to work anywhere", async () => {
        await server.settings.change({ internet: true });
        server.certificate = { names: ["pellagos.duckdns.org"] };

        try {
            const { page, everywhere } = server.invitePage();

            assert.equal(page, `https://pellagos.duckdns.org:${server.port}/`);
            assert.equal(everywhere, true);

            const { json } = await call(server.port, "POST", `/worlds/${world.world}/invite`, {}, { Authorization: `Key ${server.adminKey}` });
            const invite = inviteOf(json.link);

            assert.equal(json.link.split("#")[0], `https://pellagos.duckdns.org:${server.port}/`);
            assert.deepEqual([invite.address.key, invite.address.secure], [`pellagos.duckdns.org:${server.port}`, true]);
        } finally {
            server.certificate = null;
            await server.settings.change({ internet: false });
        }
    });

    it("replaced, the old link lets nobody new in; those who came by it come back as before, by their ticket (and the old key with it)", async () => {
        const owner = (await call(server.port, "POST", "/enter", { world: world.world, key: world.ownerKey, net: NET_VERSION })).json;
        const first = (await call(server.port, "POST", `/worlds/${world.world}/invite`, {}, { Authorization: `Bearer ${owner.session}` })).json;
        const came = (await call(server.port, "POST", "/enter", { world: world.world, key: first.key, net: NET_VERSION })).json;

        assert.ok(came.ticket);

        const { json: again } = await call(server.port, "POST", `/worlds/${world.world}/invite`, { replace: true }, { Authorization: `Bearer ${owner.session}` });

        assert.notEqual(again.key, first.key);
        assert.equal(server.access.world(world.world).inviteKey().label, PLAYERS_KEY);
        assert.equal((await call(server.port, "POST", "/enter", { world: world.world, key: first.key, net: NET_VERSION })).json.error, "key", "nobody new by the old link");
        assert.equal((await call(server.port, "POST", "/enter", { world: world.world, ticket: came.ticket, net: NET_VERSION })).status, 200, "back by their ticket alone");
        assert.equal((await call(server.port, "POST", "/enter", { world: world.world, key: first.key, ticket: came.ticket, net: NET_VERSION })).status, 200, "and with the old key their game kept");
        assert.ok((await call(server.port, "POST", "/enter", { world: world.world, key: again.key, net: NET_VERSION })).json.ticket, "someone new by the new one");
    });
});

describe("a world open to anyone (its open setting)", () => {
    let server;
    let world;
    let owner;

    before(async () => {
        server = await serve();
        world = await server.createWorld({ name: "Fernhollow", seed: 5, race: "elf" });
        owner = (await call(server.port, "POST", "/enter", { world: world.world, key: world.ownerKey, net: NET_VERSION })).json;
    });

    const enter = (body) => call(server.port, "POST", "/enter", { world: world.world, net: NET_VERSION, ...body });

    it("lets nobody in without a key till it's opened; then anyone, by its door, and back by their ticket; and shows it to anyone who asks the server", async () => {
        assert.equal((await enter({})).json.error, "key");
        assert.deepEqual((await call(server.port, "GET", "/status")).json.worlds, []);

        const changed = await call(server.port, "PATCH", `/worlds/${world.world}`, { settings: { open: true } }, { Authorization: `Bearer ${owner.session}` });

        assert.equal(changed.status, 200, JSON.stringify(changed.json));
        assert.ok(server.access.world(world.world).keys().some((key) => key.open && key.label === OPEN_DOOR), "its door among its keys");

        const newcomer = await enter({});

        assert.equal(newcomer.status, 200, JSON.stringify(newcomer.json));
        assert.equal(newcomer.json.role, "player");
        assert.ok(newcomer.json.ticket);
        assert.equal((await enter({ ticket: newcomer.json.ticket })).json.player, newcomer.json.player, "the same player, back by their ticket");

        const { worlds } = (await call(server.port, "GET", "/status")).json;

        assert.deepEqual(worlds.map(({ name, open }) => [name, open]), [["Fernhollow", true]]);
    });

    it("lets no more newcomers in from one address an hour than OPEN.perAddress; a ban holds as ever", async () => {
        const door = server.access.world(world.world).door();
        const already = server.access.world(world.world).newcomers(door.id, new Date(Date.now() - 3600 * 1000), "127.0.0.1");

        for (let k = already; k < OPEN.perAddress; k++) {
            assert.equal((await enter({})).status, 200);
        }

        const turned = await enter({});

        assert.equal(turned.status, 429);
        assert.equal(turned.json.error, "busy");

        // (One who came by the door banned: not let in by it again, ticket or no; nor anyone from
        // the address they came from, for a day)
        const banned = server.access.world(world.world).players().find((one) => one.via === door.id);
        const ban = await call(server.port, "POST", `/worlds/${world.world}/players/${banned.id}/ban`, {}, { Authorization: `Bearer ${owner.session}` });

        assert.equal(ban.status, 200, JSON.stringify(ban.json));
        assert.equal((await enter({})).json.error, "banned");
    });

    it("turned off, lets no newcomer in without a key; those already in still come back", async () => {
        const second = await serve();
        const other = await second.createWorld({ name: "Mossgate", seed: 8, race: "human" });
        const boss = (await call(second.port, "POST", "/enter", { world: other.world, key: other.ownerKey, net: NET_VERSION })).json;
        const into = (body) => call(second.port, "POST", "/enter", { world: other.world, net: NET_VERSION, ...body });

        await call(second.port, "PATCH", `/worlds/${other.world}`, { settings: { open: true } }, { Authorization: `Bearer ${boss.session}` });

        const came = (await into({})).json;

        await call(second.port, "PATCH", `/worlds/${other.world}`, { settings: { open: false } }, { Authorization: `Bearer ${boss.session}` });
        assert.equal((await into({})).json.error, "key", "no newcomer without a key");
        assert.equal((await into({ ticket: came.ticket })).json.player, came.player, "back by their ticket");
        assert.deepEqual((await call(second.port, "GET", "/status")).json.worlds, [], "no longer shown");
    });
});
