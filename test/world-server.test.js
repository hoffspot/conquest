// The world server on the Wi-Fi, end to end (generated/world_server_plan.md §15, S2): Node clients
// over real sockets make a world, come into it with a key, leave it (its clock stopped: the war's
// time just where it was), come back to the same hero in the same place, and are sent out when
// their key's revoked; a short code works once; a third world waits while two run; and the port
// refuses what it should (other hosts, other origins, the internet, query strings, too much), and
// stands up to garbage on its socket
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { isGuid } from "../client/js/core/guid.js";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { decode, encode } from "../client/js/core/wire.js";
import { verifyIdentity } from "../server/access/identity.js";
import { newToken } from "../server/access/tokens.js";
import { guard, hostsOf, originsOf, Refusal } from "../server/guards.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { Socket } from "../server/relay.js";
import { REMEMBERED } from "../server/storage/visitors.js";
import { WorldServer } from "../server/world-server.js";

// Short codes hashed cheaply in the tests (the server's own cost takes 128 MiB and a good part of a second)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword" });

const made = [];
const servers = [];

async function scratch() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-world-server-"));

    made.push(folder);

    return folder;
}

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

// A world server listening on loopback, its worlds set aside as soon as they're empty (unless `settings` say otherwise)
async function serve(settings = {}) {
    const server = await WorldServer.open(await scratch(), { cost: CHEAP, awake: () => ({ stop() {} }) });

    await server.settings.change({ setAsideMinutes: 0, ...settings });
    await server.listen(0, "127.0.0.1");
    servers.push(server);

    const base = `http://127.0.0.1:${server.port}/api/v1`;

    // An API call: { status, json }
    server.call = async (method, route, { body, auth } = {}) => {
        const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: body ? JSON.stringify(body) : undefined });

        return { status: response.status, json: await response.json() };
    };

    return server;
}

// A raw HTTP request (headers as given, Host and Origin among them): { status, json }
function raw(server, { method = "GET", route = "/api/v1/status", headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port: server.port, path: route, method, headers: { Host: `127.0.0.1:${server.port}`, ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const text = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, headers: response.headers, json: text.startsWith("{") ? JSON.parse(text) : text });
            });
        });

        request.on("error", reject);
        request.end(body);
    });
}

/**
 * A player's game in Node on the play socket: { lines, messages (the world's, decoded), send(line),
 * say(message) (to the world), welcome(), close(code) }.
 */
async function connect(server) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, PLAY_PROTOCOL);
    const game = { lines: [], messages: [], socket, closed: null };

    socket.onmessage = ({ data }) => {
        game.lines.push(data);

        if (data.startsWith("data\n")) {
            game.messages.push(decode(data.slice(5)));
        }
    };
    socket.onclose = ({ code }) => (game.closed = code);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
    });
    game.send = (line) => socket.send(line);
    game.say = (message) => socket.send(`data\n${encode(message)}`);
    game.line = (start) => game.lines.find((line) => line.startsWith(start)) ?? null;
    game.message = (kind) => game.messages.findLast((message) => message.kind === kind) ?? null;
    game.close = (code = 1000) => socket.close(code);

    return game;
}

// Into a world by its session, hello'd with a hero (a slot, or "new"), and ready: the game, once welcomed
async function play(server, world, session, { hero = "new", character = { hero: HERO } } = {}) {
    const game = await connect(server);

    game.send(`enter ${world} ${session}`);
    await until(() => game.line("entered") || game.line("closed"), "entered");

    if (game.line("closed")) {
        return game;
    }

    game.say({ kind: "hello", version: NET_VERSION, character, hero });
    await until(() => game.message("welcome") || game.message("refused"), "welcome");
    game.say({ kind: "ready" });

    return game;
}

describe("the world server on the Wi-Fi (server/world-server.js, api.js, play.js)", () => {
    let server;
    let world;

    before(async () => {
        server = await serve();

        const made = await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Thornwick", race: "human", seed: 3 } });

        assert.equal(made.status, 200);
        world = made.json;
    });

    it("proves itself before anything secret's sent: its id, its public key, the nonce signed", async () => {
        const status = await server.call("GET", "/status");
        const game = await connect(server);
        const nonce = newToken();

        game.send(`hi ${nonce}`);
        await until(() => game.line("hi "), "the server's hi");

        const [, id, publicKey, signature] = game.line("hi ").split(" ");

        assert.equal(id, status.json.server.id);
        assert.ok(verifyIdentity({ id, publicKey, nonce, signature }));
        assert.equal(status.json.server.net, NET_VERSION);
        assert.deepEqual(status.json.worlds, [], "a new world's unlisted");
        game.close();
    });

    it("lets a player in by a key, freezes the world when they leave, brings them back to the same hero in the same place, and sends them out when their key's revoked", async () => {
        const entered = await server.call("POST", "/enter", { body: { world: world.world, key: world.playerKey, net: NET_VERSION } });

        assert.equal(entered.status, 200);
        assert.equal(entered.json.role, "player");
        assert.match(entered.json.ticket, /^[A-Za-z0-9_-]{22}$/);
        assert.deepEqual(entered.json.heroes, []);

        // In: the clock runs
        const started = Date.now();
        let game = await play(server, world.world, entered.json.session);

        assert.equal(game.message("welcome").id, `${entered.json.player}.1`);
        assert.ok(Date.now() - started < 15000, "entered, the world made and restored, within a while");
        await until(() => server.registry.lifeOf(world.world).state?.running, "the clock to run");
        await wait(2000);

        // Out: the clock stops, and the world's set aside (setAsideMinutes 0)
        game.close();
        await until(() => server.registry.lifeOf(world.world).life === "stored", "set aside");

        const kept = await server.worlds.get(world.world).heroes.get(entered.json.player, 1);
        const stopped = server.worlds.get(world.world).meta.worldTime;

        assert.ok(stopped >= 1000, `it ran while they were in (${stopped} ms of the world's time)`);
        await wait(1000);
        assert.equal(server.worlds.get(world.world).meta.worldTime, stopped, "nothing moved while nobody was in it");

        // Back, by key and ticket: the same player, their hero to choose, the same hero where they left it
        const again = await server.call("POST", "/enter", { body: { world: world.world, key: world.playerKey, ticket: entered.json.ticket } });

        assert.equal(again.json.player, entered.json.player);
        assert.equal(again.json.ticket, null);
        assert.deepEqual(again.json.heroes, [{ slot: 1, name: "Ada", race: "human", origin: null }], "made here, no copy");

        game = await play(server, world.world, again.json.session, { hero: 1 });

        const actor = game.message("welcome").snapshot.battle.actors.find((one) => one.id === `${entered.json.player}.1`);

        assert.deepEqual([actor.x, actor.y], [kept.place.x, kept.place.y]);
        assert.equal(game.message("welcome").snapshot.battle.time, stopped, "the world's time just where it stopped");

        // Their key revoked by the owner: sent out, saying why; and not let back in by it
        const owner = await server.call("POST", "/enter", { body: { world: world.world, key: world.ownerKey } });
        const revoked = await server.call("DELETE", `/worlds/${world.world}/keys/${world.playerKey.slice(0, 4)}`, { auth: `Bearer ${owner.json.session}` });

        assert.equal(revoked.status, 200);
        await until(() => game.line("closed"), "sent out");
        assert.equal(game.line("closed"), "closed key-revoked");
        assert.equal((await server.call("POST", "/enter", { body: { world: world.world, key: world.playerKey, ticket: entered.json.ticket } })).json.error, "key");

        // (The journal's line is written as the key's revoked, not waited for: read till it's there)
        const file = path.join(server.worlds.get(world.world).folder, "journal.log");
        const readJournal = () => readFile(file, "utf8");

        await until(async () => /The key "Players' key" was revoked/.test(await readJournal()), "the key's revoking in the journal");

        const journal = await readJournal();

        assert.match(journal, /The key "Players' key" was revoked/);
        assert.ok(!journal.includes(world.playerKey) && !journal.includes(world.playerKey.replace(/-/g, "")), "no key in the journal");
    });

    it("copies a character into a world that takes copies once, by anyone, as the world's own; never takes a copy home; takes one made in a world of its own home, out of it for good, only while they're not in it", async () => {
        const made = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Copperby", race: "human", seed: 3, characters: "copies" } })).json;
        const ada = { hero: { ...HERO, guid: "3f2b1c9e-7a4d-4e0f-9b21-5c6d7e8f9a0b" } };
        const first = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION } });

        assert.deepEqual([first.json.card.characters, first.json.card.heroes, first.json.card.firstHero], ["copies", "kept", "bring"]);

        // Copied in: the world's own, an id of its own, theirs its origin
        let game = await play(server, made.world, first.json.session, { hero: "copy", character: ada });

        assert.ok(game.message("welcome"), JSON.stringify(game.message("refused")));
        game.close();
        await until(() => server.registry.lifeOf(made.world).life === "stored", "set aside");

        const copy = await server.worlds.get(made.world).heroes.get(first.json.player, 1);

        assert.equal(copy.hero.origin, ada.hero.guid);
        assert.ok(isGuid(copy.hero.guid) && copy.hero.guid !== ada.hero.guid);

        // Once: not again, by them, nor by anyone else (another device, another player)
        const second = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION } });

        assert.notEqual(second.json.player, first.json.player);
        game = await play(server, made.world, second.json.session, { hero: "copy", character: ada });
        assert.equal(game.message("refused")?.reason, "copied");
        game.close();

        // Never taken home: a copy stays in the world it was copied into
        const again = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, ticket: first.json.ticket, net: NET_VERSION } });

        assert.deepEqual(again.json.heroes.map(({ slot, origin }) => [slot, origin]), [[1, ada.hero.guid]]);
        assert.equal((await server.call("POST", `/worlds/${made.world}/heroes/1/home`, { auth: `Bearer ${again.json.session}` })).json.error, "copy-stays");

        // A world of its own: one made there taken home, out of it for good; not while they're in it
        const own = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Ownby", race: "human", seed: 3, characters: "own" } })).json;
        const entered = await server.call("POST", "/enter", { body: { world: own.world, key: own.playerKey, net: NET_VERSION } });

        assert.equal(entered.json.card.characters, "own");
        game = await play(server, own.world, entered.json.session, { hero: "copy", character: ada });
        assert.equal(game.message("refused")?.reason, "character", "no copies in a world of its own");
        game.close();
        game = await play(server, own.world, entered.json.session, { character: ada });
        assert.ok(game.message("welcome"));
        await until(() => server.registry.lifeOf(own.world).state?.players.some((one) => one.player === entered.json.player), "in");
        assert.equal((await server.call("POST", `/worlds/${own.world}/heroes/1/home`, { auth: `Bearer ${entered.json.session}` })).json.error, "playing", "not while they're in it");
        game.close();
        await until(() => server.registry.lifeOf(own.world).life === "stored", "set aside");

        const made1 = await server.worlds.get(own.world).heroes.get(entered.json.player, 1);

        assert.equal(made1.hero.origin, undefined, "made new here, no copy");

        const home = await server.call("POST", `/worlds/${own.world}/heroes/1/home`, { auth: `Bearer ${entered.json.session}` });

        assert.equal(home.status, 200, JSON.stringify(home.json));
        assert.equal(home.json.count, 1);
        assert.equal(decode(home.json.text).characters[0].save.hero.guid, made1.hero.guid, "the same character, their own id with them");
        assert.equal(await server.worlds.get(own.world).heroes.get(entered.json.player, 1), null, "gone from the world for good");
        assert.match(await readFile(path.join(server.worlds.get(own.world).folder, "journal.log"), "utf8"), /Ada \([^)]+\) taken home, out of the world for good\./);
    });

    it("remembers a visitor to a world whose players bring their own, for their player, by their character's own id: what the world knows of them, never what they carry, which comes from their device each time; another player bringing the same id gets none of it", async () => {
        const made = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Wayfare", race: "human", seed: 3, characters: "visiting" } })).json;
        const guid = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
        const ada = (gold) => ({ hero: { ...HERO, guid }, progress: { gold }, talks: { memory: {}, knowledge: ["what their own world taught them"] }, standing: { points: 40 } });
        const first = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION } });
        const player = first.json.player;
        const theirs = (game) => game.message("welcome").snapshot.players.find((one) => one.id === player);
        const visitors = server.worlds.get(made.world).visitors;

        // The first time: what they carry theirs; what their own world knew of them not this one's
        let game = await play(server, made.world, first.json.session, { character: ada(50) });

        assert.equal(theirs(game).progress.gold, 50);
        assert.deepEqual(theirs(game).talks.knowledge, []);
        assert.equal(theirs(game).standing.points ?? 0, 0);
        game.close();
        await until(() => server.registry.lifeOf(made.world).life === "stored", "set aside");

        // Gone: what the world knows of them remembered, for them, by their id; not what they carry
        const remembered = await visitors.get(player, guid);

        assert.ok(remembered.place && Number.isFinite(remembered.place.x), "where they stood");
        assert.ok(Object.keys(remembered).every((kind) => REMEMBERED.includes(kind)), Object.keys(remembered).join(", "));
        assert.equal("progress" in remembered, false);
        assert.deepEqual((await visitors.list(player)).map(({ guid: id, name }) => [id, name]), [[guid, "Ada"]]);

        // (What its folk learnt of them meanwhile, as it would be had they talked)
        await visitors.keep(player, { hero: { ...HERO, guid }, ...remembered, talks: { memory: { barkeep: { talks: 2, flags: [] } }, knowledge: ["the ford"] } });

        // Back: what the world remembers of them, where they left; what they carry as their device has it now
        const again = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, ticket: first.json.ticket } });

        game = await play(server, made.world, again.json.session, { character: ada(80) });

        const actor = game.message("welcome").snapshot.battle.actors.find((one) => one.id === player);

        assert.equal(theirs(game).progress.gold, 80, "what they carry, from their device");
        assert.deepEqual(theirs(game).talks.knowledge, ["the ford"]);
        assert.deepEqual([actor.x, actor.y], [remembered.place.x, remembered.place.y]);
        game.close();
        await until(() => server.registry.lifeOf(made.world).life === "stored", "set aside");

        // Another player bringing a character with the same id: none of it
        const other = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION } });

        game = await play(server, made.world, other.json.session, { character: ada(5) });
        assert.deepEqual(game.message("welcome").snapshot.players.find((one) => one.id === other.json.player).talks.knowledge, []);
        game.close();
        await until(() => server.registry.lifeOf(made.world).life === "stored", "set aside");
        assert.deepEqual((await visitors.get(player, guid)).talks.knowledge, ["the ford"], "and theirs untouched");
    });

    it("takes a world offline for upkeep: everyone sent out, nobody let in, its owners neither, its character rule changed only then (or set aside); and back online", async () => {
        const made = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Offton", race: "human", seed: 3 } })).json;
        const admin = { auth: `Key ${server.adminKey}` };
        const entered = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION } });
        const game = await play(server, made.world, entered.json.session);

        assert.ok(game.message("welcome"));
        await until(() => server.registry.lifeOf(made.world).state?.running, "running");

        // (Not while anyone's in it)
        const running = await server.call("PATCH", `/worlds/${made.world}`, { ...admin, body: { characters: "visiting" } });

        assert.equal(running.status, 409);
        assert.match(running.json.message, /Take the world offline first/);

        const offline = await server.call("POST", `/worlds/${made.world}/offline`, admin);

        assert.equal(offline.status, 200, JSON.stringify(offline.json));
        assert.equal(offline.json.offline, true);
        await until(() => game.line("closed"), "sent out");
        assert.equal(game.line("closed"), "closed offline");

        for (const key of [made.playerKey, made.ownerKey]) {
            const refused = await server.call("POST", "/enter", { body: { world: made.world, key, net: NET_VERSION } });

            assert.equal(refused.json.error, "offline");
        }

        assert.equal((await server.call("GET", `/worlds/${made.world}`, admin)).json.words, "Offline: nobody may come in till it's brought back online.");

        const listed = await server.call("PATCH", `/worlds/${made.world}`, { ...admin, body: { settings: { listed: true } } });

        assert.equal(listed.json.characters, "own");
        assert.equal((await server.call("GET", "/status")).json.worlds.find(({ id }) => id === made.world).offline, true, "said so to anyone who asks");

        // Offline: its character rule changed; a rule there isn't, refused
        assert.equal((await server.call("PATCH", `/worlds/${made.world}`, { ...admin, body: { characters: "sometimes" } })).status, 400);

        const changed = await server.call("PATCH", `/worlds/${made.world}`, { ...admin, body: { characters: "visiting" } });

        assert.deepEqual([changed.json.characters, changed.json.heroes, changed.json.firstHero], ["visiting", "brought", "new"]);

        // Back online: let in again
        assert.equal((await server.call("POST", `/worlds/${made.world}/online`, admin)).json.offline, false);

        const back = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION } });

        assert.equal(back.status, 200);
        assert.equal(back.json.card.characters, "visiting");
        assert.match(await readFile(path.join(server.worlds.get(made.world).folder, "journal.log"), "utf8"), /Taken offline by [^:]+: nobody may come in till it's brought back online\.[\s\S]*its characters: visiting[\s\S]*Brought back online/);
    });

    it("trades a short code once for the world and its key", async () => {
        const owner = await server.call("POST", "/enter", { body: { world: world.world, key: world.ownerKey } });
        const key = await server.call("POST", `/worlds/${world.world}/keys`, { auth: `Bearer ${owner.json.session}`, body: { label: "Table", role: "player" } });
        const code = await server.call("POST", `/worlds/${world.world}/codes`, { auth: `Bearer ${owner.json.session}`, body: { key: key.json.record.id } });

        assert.equal(code.status, 200);

        const redeemed = await server.call("POST", "/codes/redeem", { body: { code: code.json.code } });

        assert.equal(redeemed.status, 200);
        assert.equal(redeemed.json.key, key.json.key);
        assert.equal(redeemed.json.world, world.world);
        assert.ok(redeemed.json.session);

        const twice = await server.call("POST", "/codes/redeem", { body: { code: code.json.code } });

        assert.equal(twice.status, 401);
        assert.equal(twice.json.error, "code");
    });

    it("lets only a world's owner (or a trusted player, if it allows) manage its keys", async () => {
        const owner = await server.call("POST", "/enter", { body: { world: world.world, key: world.ownerKey } });

        assert.equal(owner.json.role, "owner");

        const fresh = await server.call("POST", `/worlds/${world.world}/keys`, { auth: `Bearer ${owner.json.session}`, body: { label: "Guests" } });
        const guest = await server.call("POST", "/enter", { body: { world: world.world, key: fresh.json.key } });

        assert.equal((await server.call("GET", `/worlds/${world.world}/keys`, { auth: `Bearer ${guest.json.session}` })).status, 403);
        assert.equal((await server.call("POST", "/worlds", { auth: `Bearer ${guest.json.session}`, body: { name: "Mine", race: "elf" } })).status, 403, "only creators and the admin make worlds");
        assert.equal((await server.call("POST", "/enter", { body: { world: "nosuchwrld", key: fresh.json.key } })).json.error, "no-world");
    });
});

describe("worlds waiting their turn (server/registry.js, play.js)", () => {
    it("makes a third world wait while two run, and lets it in when one's set aside", async () => {
        const server = await serve({ worldsAtOnce: 2, setAsideMinutes: 10 });
        const worlds = [];

        for (const name of ["One", "Two", "Three"]) {
            worlds.push((await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name, race: "human", seed: 3 } })).json);
        }

        const sessions = await Promise.all(worlds.map(async ({ world, playerKey }) => (await server.call("POST", "/enter", { body: { world, key: playerKey } })).json.session));
        const [first, second] = await Promise.all([play(server, worlds[0].world, sessions[0]), play(server, worlds[1].world, sessions[1])]);
        const third = await connect(server);

        third.send(`enter ${worlds[2].world} ${sessions[2]}`);
        await until(() => third.line("waiting"), "the third to wait");
        assert.equal(third.line("waiting"), "waiting 1");
        assert.equal(third.line("entered"), null);

        // (The second's left, and is set aside: the third goes)
        second.close();
        await until(() => server.registry.lifeOf(worlds[1].world).life === "empty", "the second empty");
        await server.registry.setAside(worlds[1].world);
        await until(() => third.line("entered"), "the third let in");
        first.close();
        third.close();
    });
});

describe("what the port refuses (server/guards.js)", () => {
    let server;

    before(async () => {
        server = await serve();
    });

    it("refuses another site's name for the server (DNS rebinding), other sites' pages, and a page from anywhere but the game's", async () => {
        assert.equal((await raw(server, { headers: { Host: "evil.example" } })).status, 421);
        assert.equal((await raw(server, { headers: { Origin: "https://evil.example" } })).status, 403);
        assert.equal((await raw(server, { headers: { Origin: "null" } })).status, 403);

        const game = await raw(server, { headers: { Origin: "https://hoffspot.github.io" } });

        assert.equal(game.status, 200);
        assert.equal(game.headers["access-control-allow-origin"], "https://hoffspot.github.io");
        assert.equal((await raw(server, { headers: { Origin: `http://127.0.0.1:${server.port}` } })).status, 200, "its own pages");

        // (The game's own files, behind the same guards)
        assert.equal((await raw(server, { route: "/" })).status, 200);
        assert.equal((await raw(server, { route: "/", headers: { Host: "evil.example" } })).status, 421);
    });

    it("takes nothing in a query string, nor a body past 64 KB", async () => {
        assert.equal((await raw(server, { route: "/api/v1/status?key=KQ2M9" })).status, 400);
        assert.equal((await raw(server, { method: "POST", route: "/api/v1/enter", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ world: "x".repeat(70000) }) })).status, 413);
        assert.equal((await raw(server, { method: "POST", route: "/api/v1/enter", headers: { "Content-Type": "application/json" }, body: "{not json" })).status, 400);
    });

    it("takes home addresses plain or over TLS; the internet over TLS alone, and only when it's open", () => {
        const hosts = hostsOf(8480, { interfaces: {}, hostname: "studio-mac", names: ["pellagos-sam.duckdns.org"] });
        const origins = originsOf(hosts);
        const refused = (why) => (error) => error instanceof Refusal && error.error === why;
        const ask = (address, { secure = false, internetClosed, host = "studio-mac.local:8480" } = {}) => guard({ address, host, secure }, { hosts, origins, ...(internetClosed === undefined ? {} : { internetClosed }) });

        // (Home: plain or TLS alike, as it's counted)
        assert.deepEqual(ask("192.168.1.20"), { address: "192.168.1.20", from: "home", tunnel: false });
        assert.deepEqual(ask("::ffff:10.0.0.4", { secure: true }), { address: "10.0.0.4", from: "home", tunnel: false });
        assert.deepEqual(ask("fe80::1%en0"), { address: "fe80::1", from: "home", tunnel: false });

        // (The internet, the carrier-grade NAT range among it: refused while it's closed, saying why, plain or TLS)
        for (const address of ["203.0.113.7", "100.64.1.1", "2001:db8::1"]) {
            assert.throws(() => ask(address), refused("internet"));
            assert.throws(() => ask(address, { secure: true }), refused("internet"));
            assert.throws(() => ask(address, { secure: true, internetClosed: "No certificate." }), (error) => refused("internet")(error) && error.message === "No certificate.");
        }

        // (Open: over TLS it's taken, by the certificate's name; plain it's refused, naming the secure address)
        const open = { internetClosed: null, host: "pellagos-sam.duckdns.org:8480" };

        assert.deepEqual(ask("203.0.113.7", { ...open, secure: true }), { address: "203.0.113.7", from: "internet", tunnel: false });
        assert.throws(() => ask("203.0.113.7", open), (error) => refused("secure")(error) && /https:\/\/pellagos-sam\.duckdns\.org:8480/.test(error.message));

        // (Still another site's name is refused before it's told anything: DNS rebinding)
        assert.throws(() => ask("203.0.113.7", { ...open, secure: true, host: "evil.example:8480" }), refused("host"));

        // (The secure origins are the server's own too, and a server on 443 is reached without its port)
        assert.ok(origins.has("https://pellagos-sam.duckdns.org:8480") && origins.has("http://studio-mac.local:8480"));
        assert.ok(hostsOf(443, { interfaces: {}, hostname: "studio-mac", names: ["pellagos.example.com"] }).has("pellagos.example.com"));

        // (Through a tunnel: the internet's, whatever loopback address it comes from, from
        // X-Forwarded-For's last address (earlier ones are anyone's say); plain is its own TLS; by the
        // tunnel's names alone; refused while the tunnel's closed)
        const tunnelHosts = new Set(["studio-mac.tail1234.ts.net", "127.0.0.1:8482"]);
        const through = (forwarded, extra = {}) => guard({ address: "127.0.0.1", host: "studio-mac.tail1234.ts.net", tunnel: true, forwarded, ...extra }, { hosts, tunnelHosts, origins, tunnelClosed: null, ...extra });

        assert.deepEqual(through("198.51.100.7"), { address: "198.51.100.7", from: "internet", tunnel: true });
        assert.deepEqual(through("10.0.0.9, 198.51.100.7"), { address: "198.51.100.7", from: "internet", tunnel: true });
        assert.deepEqual(through(undefined), { address: "tunnel", from: "internet", tunnel: true });
        assert.throws(() => through("198.51.100.7", { host: "studio-mac.local:8480" }), refused("host"));
        assert.throws(() => through("198.51.100.7", { tunnelClosed: "Closed." }), (error) => refused("internet")(error) && error.message === "Closed.");
    });

    it("closes a socket that hasn't entered a world, or speaks no sense; and stands up to garbage", async () => {
        // (Nonsense first: closed)
        const nonsense = await connect(server);

        nonsense.send("gimme everything");
        await until(() => nonsense.closed !== null, "nonsense closed");

        // (Random bytes on the raw port, a hundred times: each connection let go, the server still answering)
        for (let k = 0; k < 100; k++) {
            await new Promise((resolve) => {
                const socket = net.connect(server.port, "127.0.0.1", () => socket.end(randomBytes(1 + (k * 37) % 400)));

                socket.on("error", resolve);
                socket.on("close", resolve);
                socket.resume();
            });
        }

        // (Addresses that aren't addresses, and upgrades to anywhere but the play socket: refused, not thrown or left hanging)
        const raw = (lines) =>
            new Promise((resolve) => {
                let heard = "";
                const socket = net.connect(server.port, "127.0.0.1", () => socket.write(`${[...lines, `Host: 127.0.0.1:${server.port}`].join("\r\n")}\r\n\r\n`));

                socket.setTimeout(5000, () => socket.destroy());
                socket.on("data", (data) => (heard += data));
                socket.on("error", () => {});
                socket.on("close", () => resolve(heard.split("\r\n")[0]));
            });
        const upgrade = ["Connection: Upgrade", "Upgrade: websocket", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", `Sec-WebSocket-Protocol: ${PLAY_PROTOCOL}`];

        assert.match(await raw(["GET http://[ HTTP/1.1", "Connection: close"]), / 400 /);
        assert.match(await raw(["GET http://[ HTTP/1.1", ...upgrade]), / 404 /);
        assert.match(await raw(["GET /elsewhere HTTP/1.1", ...upgrade]), / 404 /);
        assert.equal((await server.call("GET", "/health")).status, 200);
    });
});

describe("the hand-written WebSocket frames, fuzzed (server/relay.js Socket)", () => {
    // A socket in memory: what's written to it, and what's read from it handed in
    function fake() {
        const handlers = {};

        return {
            written: [],
            destroyed: false,
            on: (event, handler) => (handlers[event] = handler),
            write(data) {
                this.written.push(data);
            },
            end() {},
            destroy() {
                this.destroyed = true;
            },
            setNoDelay() {},
            writableLength: 0,
            feed: (data) => handlers.data?.(data),
        };
    }

    // A client's frame (masked), as RFC 6455 has it: opcode, payload, fin
    function frame(opcode, payload, { fin = true, mask = randomBytes(4), length = payload.length } = {}) {
        const header = length < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | length]) : length < 65536 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 126, length >> 8, length & 255]) : Buffer.concat([Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 127]), (() => {
            const big = Buffer.alloc(8);

            big.writeBigUInt64BE(BigInt(length));

            return big;
        })()]);
        const masked = Buffer.from(payload).map((byte, k) => byte ^ mask[k & 3]);

        return Buffer.concat([header, mask, masked]);
    }

    it("reads whole messages however they're split, and closes on frames that break the rules, never throwing", () => {
        // (A message split into pieces at every byte)
        const message = "data\n" + "x".repeat(300);
        const bytes = frame(0x1, Buffer.from(message));

        for (const cut of [1, 2, 3, 7, 50, bytes.length - 1]) {
            const raw = fake();
            const socket = new Socket(raw, Buffer.alloc(0), { limit: 64 * 1024 });
            const heard = [];

            socket.onMessage = (text) => heard.push(text);
            raw.feed(bytes.subarray(0, cut));
            raw.feed(bytes.subarray(cut));
            assert.deepEqual(heard, [message], `split at ${cut}`);
        }

        // (Fragments put together; unmasked, too long, binary or out of order: closed)
        const raw = fake();
        const socket = new Socket(raw, Buffer.alloc(0), { limit: 1024 });
        const heard = [];

        socket.onMessage = (text) => heard.push(text);
        raw.feed(Buffer.concat([frame(0x1, Buffer.from("he"), { fin: false }), frame(0x0, Buffer.from("llo"))]));
        assert.deepEqual(heard, ["hello"]);

        for (const bad of [Buffer.from([0x81, 0x05, 104, 101, 108, 108, 111]), frame(0x1, Buffer.alloc(2000)), frame(0x2, Buffer.from("bin")), frame(0x1, Buffer.alloc(0), { length: 2 ** 40 })]) {
            const one = fake();
            const closing = new Socket(one, Buffer.alloc(0), { limit: 1024 });

            one.feed(bad);
            assert.ok(!closing.open, "closed");
        }

        // (Ten thousand random frames and bytes: never a throw)
        let seed = 42;
        const random = (n) => {
            seed = (seed * 1103515245 + 12345) % 2 ** 31;

            return seed % n;
        };

        for (let k = 0; k < 10000; k++) {
            const one = fake();
            const fuzzed = new Socket(one, Buffer.alloc(0), { limit: 4096 });
            const parts = random(2) ? [randomBytes(random(64))] : [frame(random(16), randomBytes(random(300)), { fin: Boolean(random(2)) }), randomBytes(random(8))];

            fuzzed.onMessage = () => {};
            assert.doesNotThrow(() => parts.forEach((part) => one.feed(part)));
        }
    });
});
