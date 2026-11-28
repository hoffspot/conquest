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
import zlib from "node:zlib";
import { isGuid } from "../client/js/core/guid.js";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { decodeFrame } from "../client/js/core/view.js";
import { SHADOW_KIND } from "../client/js/core/viewfeed.js";
import { newPlayerSecret, playerIdOf, proofOf, publicKeyOf } from "../client/js/core/player.js";
import { decode, encode } from "../client/js/core/wire.js";
import { verifyIdentity } from "../server/access/identity.js";
import { MADE_PER_HOUR } from "../server/api.js";
import { newToken } from "../server/access/tokens.js";
import { guard, hostsOf, originsOf, Refusal } from "../server/guards.js";
import { parseText } from "../server/metrics.js";
import { BINARY, PLAY_BINARY, PLAY_LIMITS, PLAY_PROTOCOL } from "../server/play.js";
import { RECONNECTING, Socket } from "../server/relay.js";
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
async function connect(server, protocols = PLAY_PROTOCOL) {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, protocols);
    const game = { lines: [], messages: [], frames: [], socket, closed: null };

    socket.binaryType = "arraybuffer";
    socket.onmessage = ({ data }) => {
        // (Bytes, where they're spoken: kept apart)
        if (typeof data !== "string") {
            game.frames.push(Buffer.from(data));

            return;
        }

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

// How long a game may wait to be let into a world and welcomed (ms, by the clock). A world that
// isn't running is made and restored first, in a thread of its own: about 7 seconds of the
// processor's time over that thread and this (4 with its plan kept: test/plan-cache.js). By the
// clock that takes as many times longer as the machine is busy, with the other test files beside
// this one: at a load of 20 on 4 cores, 15 seconds wasn't enough, and half a minute might not be.
// A minute is eight times what it takes, and still far short of a world that never comes
const ENTERING = 60000;

// Into a world by its session, hello'd with a hero (a slot, or "new"), and ready: the game, once welcomed
async function play(server, world, session, { hero = "new", character = { hero: HERO }, protocols = PLAY_PROTOCOL } = {}) {
    const game = await connect(server, protocols);

    game.send(`enter ${world} ${session}`);
    await until(() => game.line("entered") || game.line("closed"), "entered", ENTERING);

    if (game.line("closed")) {
        return game;
    }

    game.say({ kind: "hello", version: NET_VERSION, character, hero });
    await until(() => game.message("welcome") || game.message("refused"), "welcome", ENTERING);
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
        assert.ok(Date.now() - started < ENTERING, "entered, the world made and restored, within a while");
        await until(() => server.registry.lifeOf(world.world).state?.running, "the clock to run");
        // (In till a second of the world's own time has run, as its thread tells it each second:
        // not 2 seconds by the clock, in which a world on a busy machine ran 850 ms of its own)
        await until(() => server.registry.lifeOf(world.world).state?.worldTime >= 1000, "a second of the world's time to run");

        // (How it's keeping up, as its thread says for the Health page: its steps; the whole of
        // each look at it, its steps among it, so never quicker than they; and how much of its
        // clock's time it's played, all of it unless it fell behind and let time go)
        const { steps, ticks, pace, dropped } = server.registry.lifeOf(world.world).state;

        assert.ok(steps.count >= 20 && ticks.count >= 10, `${steps.count} steps in ${ticks.count} looks`);
        assert.ok(ticks.worst >= steps.worst, "a look with a step in it took the step's time and more");
        assert.ok(pace > 0 && pace <= 1 && dropped >= 0, `pace ${pace}, ${dropped} ms let go`);

        // (And as numbers, added up by the supervisor from what its thread counts of itself and
        // tells each second: every step in a histogram, labelled by its world; its heap and who's
        // in it as they are now)
        const counted = (name, labels = {}) => {
            const families = parseText(server.metrics.registry.text());
            const family = families[name.replace(/_(bucket|sum|count)$/, "")] ?? families[name];

            return family?.samples.find((sample) => sample.name === name && sample.labels.world === world.world && Object.entries(labels).every(([label, value]) => sample.labels[label] === value))?.value;
        };

        await until(() => counted("pellagos_world_step_seconds_count") >= 20, "its steps to be counted");
        assert.ok(counted("pellagos_world_tick_seconds_count") >= 10 && counted("pellagos_world_tick_part_seconds_count", { kind: "ahead" }) >= 10);
        assert.ok(counted("pellagos_world_step_seconds_bucket", { le: "+Inf" }) === counted("pellagos_world_step_seconds_count"));
        assert.ok(counted("pellagos_world_messages_total") >= 1, "what its player's game said to it");
        assert.equal(counted("pellagos_world_players"), 1);
        assert.ok(counted("pellagos_heap_bytes", { thread: "world" }) > 1e6);
        assert.ok(counted("pellagos_world_cpu_seconds_total", { kind: "user" }) > 0);
        // (Its steps' own parts, timed by the probes its thread installs: the battle's pass begun
        // once a step, what's sent after each step timed too, and the steps themselves counted)
        await until(() => counted("pellagos_world_work_total", { kind: "steps" }) >= 20, "its steps' passes to be counted");
        assert.equal(counted("pellagos_world_pass_calls_total", { kind: "battle" }), counted("pellagos_world_work_total", { kind: "steps" }));
        assert.ok(counted("pellagos_world_pass_calls_total", { kind: "flush.ops" }) >= 20 && counted("pellagos_world_pass_seconds_total", { kind: "battle" }) > 0);
        // (And the supervisor's own of it: who was let in, and what the world's sent their game
        // and heard from it, as said and as it went on the wire, compressed)
        assert.equal(counted("pellagos_joins_total"), 1);
        assert.ok(counted("pellagos_play_sent_messages_total") >= 2 && counted("pellagos_play_received_bytes_total") > 0);
        assert.ok(counted("pellagos_play_sent_bytes_total") > 10000, "the world, as a player comes in");
        assert.ok(counted("pellagos_play_sent_wire_bytes_total") > 0 && counted("pellagos_play_sent_wire_bytes_total") <= counted("pellagos_play_sent_bytes_total"));
        assert.equal(parseText(server.metrics.registry.text()).pellagos_play_sockets.samples[0].value, 1);
        assert.equal(parseText(server.metrics.registry.text()).pellagos_worlds.samples.find((sample) => sample.labels.kind === "running").value, 1);

        // Out: the clock stops, and the world's set aside (setAsideMinutes 0)
        game.close();
        await until(() => server.registry.lifeOf(world.world).life === "stored", "set aside");

        const kept = await server.worlds.get(world.world).heroes.get(entered.json.player, 1);
        const stopped = server.worlds.get(world.world).meta.worldTime;

        assert.ok(stopped >= 1000, `it ran while they were in (${stopped} ms of the world's time)`);
        // (Set aside: its saves counted, what it counted kept, what was so of it while it ran let go of)
        assert.ok(counted("pellagos_world_save_seconds_count") >= 1);
        assert.ok(counted("pellagos_world_step_seconds_count") >= 20);
        assert.equal(counted("pellagos_world_players"), undefined);
        assert.equal(counted("pellagos_heap_bytes", { thread: "world" }), undefined);
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

    it("lets a player come in again on another device, or after their link's gone dead, taking their hero over where it stands: the other link told and sent out; a dropped link's place kept five minutes", async () => {
        const made = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Dunmere", race: "human", seed: 4 } })).json;
        const entered = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION } });
        const first = await play(server, made.world, entered.json.session);
        const id = first.message("welcome").id;
        // (Back in by their ticket: a session of their own, the hero they have here)
        const back = async () => {
            const again = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, ticket: entered.json.ticket } });

            // (Their hero in the world now, not yet kept, theirs to choose)
            assert.equal(again.json.player, entered.json.player);
            assert.deepEqual(again.json.heroes, [{ slot: 1, name: "Ada", race: "human", origin: null }]);

            return play(server, made.world, again.json.session, { hero: 1 });
        };

        await until(() => server.registry.lifeOf(made.world).state?.running, "the clock to run");

        // On another device while the first's still in: theirs, taken over; the first told and sent out
        const second = await back();

        assert.equal(second.message("welcome").id, id);
        assert.equal(second.message("welcome").took, true);
        assert.ok(second.message("welcome").snapshot.players.some((player) => player.id === id));
        await until(() => first.line("closed"), "the first sent out");
        assert.equal(first.message("kicked").reason, "elsewhere");
        assert.equal(first.line("closed"), "closed elsewhere");

        // Its link gone dead without a word (its place kept), and in again: taken over, not refused
        second.close(RECONNECTING);
        await wait(500);

        const third = await back();

        assert.equal(third.message("welcome").id, id);
        assert.equal(third.message("welcome").took, true);
        assert.equal(third.message("refused"), null);
        assert.equal(PLAY_LIMITS.grace, 5 * 60 * 1000, "a dropped link's place kept five minutes, then let go of");
        third.close();
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

    it("knows a player by their own identity in every world: proved each time, each proof good once and for this server alone; a ticket from before linked to it; their name kept; banned, by it too", async () => {
        const made = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Kinsmoor", race: "human", seed: 3 } })).json;
        const other = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Farrow", race: "human", seed: 4 } })).json;
        const secret = newPlayerSecret();
        const id = playerIdOf(publicKeyOf(secret));
        const shown = (name = "Wren") => proofOf(secret, { server: server.identity.id, name });
        const enter = (world, body) => server.call("POST", "/enter", { body: { world, net: NET_VERSION, ...body } });

        // A ticket from before identities: linked to theirs the first time they show it with it
        const before = await enter(made.world, { key: made.playerKey });

        assert.equal(before.json.identity, null);

        const linked = await enter(made.world, { key: made.playerKey, ticket: before.json.ticket, player: shown() });

        assert.deepEqual([linked.json.player, linked.json.identity, linked.json.ticket], [before.json.player, id, null]);

        // Their identity alone (their code on another device): the same player, no ticket, their new name kept
        const again = await enter(made.world, { key: made.playerKey, player: shown("Wren the Bold") });

        assert.deepEqual([again.json.player, again.json.ticket], [before.json.player, null]);

        const owner = await enter(made.world, { key: made.ownerKey });
        const players = (await server.call("GET", `/worlds/${made.world}/players`, { auth: `Bearer ${owner.json.session}` })).json.players;
        const listed = players.find((one) => one.id === before.json.player);

        assert.deepEqual([listed.identity, listed.playerName], [id, "Wren the Bold"]);

        // In another world: a player of that world's, known by the same identity
        const there = await enter(other.world, { key: other.playerKey, player: shown() });

        assert.notEqual(there.json.player, before.json.player);
        assert.equal(there.json.identity, id);

        // The server's own record of them (6B-1), one across both worlds: their key and the name
        // they last gave, first and last seen, a day played; no address, no email, no birth date.
        // One who came in by a key alone, with no identity, has none
        const record = server.access.players.get(id);

        assert.deepEqual(Object.keys(record), ["id", "key", "name", "firstSeen", "lastSeen", "days", "minutes", "ageBand", "standing", "flags", "nanny", "agecheck", "attempts"]);
        assert.deepEqual({ ...record, firstSeen: null, lastSeen: null }, { id, key: publicKeyOf(secret), name: "Wren", firstSeen: null, lastSeen: null, days: 1, minutes: 0, ageBand: null, standing: {}, flags: {}, nanny: null, agecheck: null, attempts: null });
        assert.ok(Date.parse(record.firstSeen) <= Date.parse(record.lastSeen));
        assert.equal(server.access.players.size, 1);
        assert.deepEqual(Object.keys(JSON.parse(await readFile(path.join(server.root, "players.json"), "utf8")).players), [id]);

        // A proof shown twice isn't taken the second time (in by the key alone, someone new); nor
        // one made for another server
        const proof = shown();

        assert.equal((await enter(made.world, { key: made.playerKey, player: proof })).json.player, before.json.player);

        const replayed = await enter(made.world, { key: made.playerKey, player: proof });

        assert.equal(replayed.json.identity, null);
        assert.notEqual(replayed.json.player, before.json.player);
        assert.equal((await enter(made.world, { key: made.playerKey, player: proofOf(secret, { server: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ", name: "Wren" }) })).json.identity, null);

        // Banned: by their identity too, from anywhere, with no ticket
        assert.equal((await server.call("POST", `/worlds/${made.world}/players/${before.json.player}/ban`, { auth: `Bearer ${owner.json.session}` })).status, 200);
        assert.equal(server.access.policy.identify({ world: made.world, key: made.playerKey, identity: { id, name: "Wren" }, address: "203.0.113.9", from: "internet" }).principal.why, "banned");
        assert.equal(server.access.policy.identify({ world: made.world, key: made.playerKey, identity: { id: playerIdOf(publicKeyOf(newPlayerSecret())), name: "Bram" }, address: "203.0.113.9", from: "internet" }).principal.kind, "player", "another identity isn't");
        assert.equal((await server.call("POST", `/worlds/${made.world}/players/${before.json.player}/unban`, { auth: `Bearer ${owner.json.session}` })).status, 200);
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

    it("speaks bytes where a game asks for them (pellagos.play.2): 1,500 of them echoed whole, a world's sent on; pellagos.play.1 as ever, bytes closing it", async () => {
        const made = await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Bytewick", race: "human", seed: 5 } });
        const entered = await server.call("POST", "/enter", { body: { world: made.json.world, key: made.json.playerKey, net: NET_VERSION } });
        const game = await play(server, made.json.world, entered.json.session, { protocols: [PLAY_BINARY, PLAY_PROTOCOL] });

        assert.equal(game.socket.protocol, PLAY_BINARY, "the newer of the two offered");
        assert.ok(game.message("welcome"), "and its lines as ever");

        // (The tests' echo: its first byte says so, the rest whatever)
        const bytes = Buffer.from(Array.from({ length: 1500 }, (_, k) => (k * 31 + 7) & 255));

        bytes[0] = BINARY.echo;
        game.socket.send(bytes);
        await until(() => game.frames.length, "the echo");
        assert.equal(game.frames[0].length, 1500);
        assert.ok(game.frames[0].equals(bytes), "every byte as it went");

        // (A world's own bytes for this player: handed from its thread to the socket, as its lines are)
        const peer = game.line("entered").split(" ")[1];
        const frame = new Uint8Array(1500).map((_, k) => (k * 13) & 255);
        const copy = Buffer.from(frame);

        server.registry.entries.get(made.json.world).thread.thread.emit("message", { type: "binary", peer, buffer: frame.buffer });
        await until(() => game.frames.length > 1, "the world's frame");
        assert.ok(game.frames[1].equals(copy));
        assert.equal(game.closed, null);

        // (Bytes that aren't the echo: nothing reads them yet)
        game.socket.send(Buffer.from([200, 1, 2]));
        await until(() => game.closed, "closed");
        assert.equal(game.closed, 1008);

        // (A game that offers only the first protocol gets it, and none of this)
        const old = await connect(server);

        assert.equal(old.socket.protocol, PLAY_PROTOCOL);
        old.socket.send(bytes);
        await until(() => old.closed, "closed");
        assert.equal(old.closed, 1003);
    });

    it("tells a world when bytes wait unwritten on a player's socket, once as they begin to and once they've gone, and lets go of a game with a quarter of a megabyte of frames waiting", async () => {
        const made = await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Slowwick", race: "human", seed: 5 } });
        const entered = await server.call("POST", "/enter", { body: { world: made.json.world, key: made.json.playerKey, net: NET_VERSION } });
        const game = await play(server, made.json.world, entered.json.session, { protocols: [PLAY_BINARY, PLAY_PROTOCOL] });
        const peer = game.line("entered").split(" ")[1];
        const world = server.registry.entries.get(made.json.world).thread;
        const told = [];
        const said = world.waiting.bind(world);
        const real = Object.getOwnPropertyDescriptor(Socket.prototype, "waiting");
        let [waits, its] = [null, null];
        const frame = () => world.thread.emit("message", { type: "binary", peer, buffer: new Uint8Array(200).fill(7).buffer });

        // (What waits on its socket said for it here: a slow link's isn't to be had on one machine)
        world.waiting = (who, bytes) => (told.push([who, bytes]), said(who, bytes));
        Object.defineProperty(Socket.prototype, "waiting", {
            configurable: true,
            get() {
                its = this;

                return waits ?? real.get.call(this);
            },
        });

        try {
            frame();
            await until(() => game.frames.length === 1, "a frame");
            assert.deepEqual(told, [], "nothing waiting, nothing said");

            // (Some waiting as the next is sent: the world told, once, and the frame sent on)
            waits = 5000;
            frame();
            frame();
            await until(() => game.frames.length === 3, "the frames");
            assert.deepEqual(told, [[peer, 5000]]);

            // (All written: the world told so, once)
            waits = 0;
            its.socket.emit("drain");
            its.socket.emit("drain");
            assert.deepEqual(told, [[peer, 5000], [peer, 0]]);
            frame();
            await until(() => game.frames.length === 4, "a frame");
            assert.equal(told.length, 2);

            // (Waiting again, it's told again; and with more than a game's let wait, it's let go)
            waits = PLAY_LIMITS.frames;
            frame();
            await until(() => game.frames.length === 5, "a frame");
            assert.deepEqual(told.at(-1), [peer, PLAY_LIMITS.frames]);
            assert.equal(PLAY_LIMITS.frames, 256 * 1024);
            waits = PLAY_LIMITS.frames + 1;
            frame();
            await until(() => game.closed, "closed");
            assert.equal(game.closed, 1008);
            assert.equal(game.frames.length, 5, "and sent no more");
        } finally {
            Object.defineProperty(Socket.prototype, "waiting", real);
        }

        // (Let go, its place is kept a while for it to come back to: the world taken offline,
        // so the next has room)
        assert.equal((await server.call("POST", `/worlds/${made.json.world}/offline`, { auth: `Key ${server.adminKey}` })).status, 200);
    });

    it("makes each player's views dark where the server's replication is, counted with the world's work and never sent; and stops when it's turned off, with no restart", async () => {
        const made = await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Darkwick", race: "human", seed: 6 } });
        const entered = await server.call("POST", "/enter", { body: { world: made.json.world, key: made.json.playerKey, net: NET_VERSION } });
        const frames = () => parseText(server.metrics.registry.text()).pellagos_world_work_total?.samples.find((sample) => sample.labels.world === made.json.world && sample.labels.kind === "views.frames")?.value ?? 0;

        // (Dark before the world's opened: its thread begins so)
        await server.manage.changeSettings({ replication: "dark" });

        const game = await play(server, made.json.world, entered.json.session, { protocols: [PLAY_BINARY, PLAY_PROTOCOL] });

        await until(() => frames() > 0, "its frames to be counted", ENTERING);
        assert.deepEqual(game.frames, [], "none of them sent, though this game speaks bytes");
        assert.ok(parseText(server.metrics.registry.text()).pellagos_world_work_total.samples.some((sample) => sample.labels.world === made.json.world && sample.labels.kind === "views.bytes" && sample.value > 0));

        // (Off: the running world told at once. Whatever it had made is counted, then no more)
        await server.manage.changeSettings({ replication: "off" });

        let last = -1;
        let since = Date.now();

        await until(() => {
            if (frames() !== last) {
                [last, since] = [frames(), Date.now()];
            }

            return Date.now() - since > 2500;
        }, "its frames to stop", ENTERING);

        // (And dark again, as it runs)
        await server.manage.changeSettings({ replication: "dark" });
        await until(() => frames() > last, "its frames to be counted again", ENTERING);
        assert.deepEqual(game.frames, []);
        assert.equal(game.closed, null);
        await server.manage.changeSettings({ replication: "off" });
        game.close();
        await until(() => server.registry.lifeOf(made.json.world).life === "stored", "set aside");
    });

    it("keeps a player to the quick chat's phrases where the server's Nanny Mode says (6B-16): told to the world as they come in, said in its players lists, their typed line refused and a phrase said; and lifted at once when the setting's turned off, with no restart", async () => {
        const made = await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Nannywick", race: "human", seed: 6 } });
        const entered = await server.call("POST", "/enter", { body: { world: made.json.world, key: made.json.playerKey, net: NET_VERSION } });
        const listed = async () => (await server.manage.players(made.json.world)).find((one) => one.here);
        const chats = () => game.messages.filter((message) => message.kind === "chat").map(({ text, quick }) => [text, quick ?? null]);
        const unsaid = () => game.messages.filter((message) => message.kind === "unsaid").map(({ reason }) => reason);

        // (Every world's, and no country looked up yet: everyone's is unknown, so everyone's in it)
        await server.manage.changeSettings({ nanny: "all" });

        const game = await play(server, made.json.world, entered.json.session);

        await until(async () => (await listed())?.nanny === true, "the players list to say so", ENTERING);
        assert.equal((await server.manage.details(made.json.world)).players[0].nanny, true);
        assert.equal([...server.play.places.values()].find((place) => place.world === made.json.world).nanny, true);

        // Their game's told who's in it, and why they are (6B-17: the chat panel's notice)
        const nannied = () => game.messages.filter((message) => message.kind === "nannied");

        await until(() => nannied().length === 1, "their game told", ENTERING);
        assert.equal(nannied()[0].ids.length, 1);
        assert.deepEqual(nannied()[0].mine, { why: "unknown", code: null, threshold: 18 });

        // A typed shout: refused. A phrase: said
        game.say({ kind: "chat", text: "Is anyone about?", shout: true });
        await until(() => unsaid().length === 1, "the refusal", ENTERING);
        assert.deepEqual(unsaid(), ["nanny"]);
        assert.deepEqual(chats(), []);
        game.say({ kind: "chat", text: "", quick: 13, shout: true });
        await until(() => chats().length === 1, "the phrase", ENTERING);
        assert.deepEqual(chats(), [["Hello!", 13]]);

        // In public worlds alone: this one isn't, so they're out of it, the world told as it runs
        await server.manage.changeSettings({ nanny: "public" });
        await until(async () => (await listed())?.nanny === false, "the players list to say they're out of it", ENTERING);
        await until(() => nannied().length === 2, "their game told they're out of it", ENTERING);
        assert.deepEqual([nannied()[1].ids, nannied()[1].mine], [[], null]);
        game.say({ kind: "chat", text: "Is anyone about now?", shout: true });
        await until(() => chats().length === 2, "the typed line", ENTERING);
        assert.deepEqual(chats().at(-1), ["Is anyone about now?", null]);
        assert.deepEqual(unsaid(), ["nanny"]);

        // On again for every world, then off: in, and out
        await server.manage.changeSettings({ nanny: "all" });
        await until(async () => (await listed())?.nanny === true, "the players list to say so again", ENTERING);
        await server.manage.changeSettings({ nanny: "all", nannyUnknown: false });
        await until(async () => (await listed())?.nanny === false, "unknown countries let be", ENTERING);

        // Their country by the server's country file (6B-19): a listed one, in it and told which;
        // one that isn't listed, out of it. (No file's fetched here: the lookup's stood in for)
        assert.deepEqual(server.manage.overview().countries, { month: null, fetchedAt: null, rows: null, stale: true, error: null, credit: { text: "IP Geolocation by DB-IP", href: "https://db-ip.com" } });

        // (What its Nanny Mode lacks for public worlds, 6B-23: on here, the list reviewed, but no country source)
        const lacks = server.manage.overview().nanny;

        assert.equal(lacks.ready, false);
        assert.equal(lacks.missing.length, 1);
        assert.match(lacks.missing[0], /^There's no country file yet/);
        assert.deepEqual(server.manage.overview().public.missing.at(-1), lacks.missing[0]);
        assert.equal(server.manage.overview().public.ready, false);
        server.countries.country = () => "GB";
        await server.manage.changeSettings({ nannyHoldDays: 29 });
        await until(async () => (await listed())?.nanny === true, "one from a listed country in it", ENTERING);
        await until(() => nannied().at(-1).mine?.why === "country", "told which country", ENTERING);
        assert.deepEqual(nannied().at(-1).mine, { why: "country", code: "GB", threshold: 16 });
        server.countries.country = () => "FR";
        await server.manage.changeSettings({ nannyHoldDays: 30 });
        await until(async () => (await listed())?.nanny === false, "one from a country that isn't listed out of it", ENTERING);
        await server.manage.changeSettings({ nanny: "off", nannyUnknown: true });
        assert.equal(game.closed, null);
        game.close();
        await until(() => server.registry.lifeOf(made.json.world).life === "stored", "set aside");
    });

    it("sends a game that asks its frames beside lockstep, as bytes, where the server's views are dark: one a step, read as frames; none to a game that doesn't ask, nor to one whose socket speaks no bytes", async () => {
        const made = await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Shadewick", race: "human", seed: 7 } });
        const enter = async () => (await server.call("POST", "/enter", { body: { world: made.json.world, key: made.json.ownerKey, net: NET_VERSION } })).json;

        await server.manage.changeSettings({ replication: "dark" });

        // (Three games of the one world: one that asks, one that doesn't, one that asks on the first protocol)
        const [asks, quiet, old] = [await play(server, made.json.world, (await enter()).session, { protocols: [PLAY_BINARY, PLAY_PROTOCOL] }), await play(server, made.json.world, (await enter()).session, { protocols: [PLAY_BINARY, PLAY_PROTOCOL] }), await play(server, made.json.world, (await enter()).session)];

        assert.ok(asks.message("welcome") && quiet.message("welcome") && old.message("welcome"));
        asks.say({ kind: SHADOW_KIND, shadow: true });
        old.say({ kind: SHADOW_KIND, shadow: true });
        await until(() => asks.frames.length >= 40, "its frames", ENTERING);

        const frames = asks.frames.map((bytes) => decodeFrame(new Uint8Array(bytes)));

        assert.ok(frames.every(Boolean), "each a frame");
        assert.ok(frames.every((frame, k) => k === 0 || frame.step === frames[k - 1].step + 1), "one a step");
        assert.ok(JSON.parse(frames[0].sections.enters).some(([index, who]) => index === 0 && who.id === asks.message("welcome").id), "its own hero the first told of");
        assert.deepEqual([quiet.frames.length, old.frames.length], [0, 0]);
        assert.deepEqual([asks.closed, quiet.closed, old.closed], [null, null, null], "and no one the worse for asking");

        // (Asked to stop: no more)
        asks.say({ kind: SHADOW_KIND, shadow: false });
        await new Promise((resolve) => setTimeout(resolve, 400));

        const stopped = asks.frames.length;

        await new Promise((resolve) => setTimeout(resolve, 600));
        assert.equal(asks.frames.length, stopped);
        await server.manage.changeSettings({ replication: "off" });
        [asks, quiet, old].forEach((game) => game.close());
        await until(() => server.registry.lifeOf(made.json.world).life === "stored", "set aside");
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

describe("players making worlds with no creator key (the server's anyoneMakes, madeEach and madeMost: api.js makerOf)", () => {
    // A player's own identity, and a fresh proof of it for `server` (each is good once)
    const playerFor = (server) => {
        const secret = newPlayerSecret();
        let shown = 0;

        return { id: playerIdOf(publicKeyOf(secret)), proof: () => proofOf(secret, { server: server.identity.id, name: `Wren ${(shown += 1)}` }) };
    };
    const make = (server, body) => server.call("POST", "/worlds", { body: { name: "Mine", race: "elf", seed: 5, ...body } });

    it("refuses anyone with no key while it's off, and says so on its card", async () => {
        const server = await serve();
        const wren = playerFor(server);

        assert.equal((await server.call("GET", "/status")).json.server.makers, null);

        const refused = await make(server, { player: wren.proof() });

        assert.equal(refused.status, 403);
        assert.equal(refused.json.error, "maker");
        assert.equal(server.worlds.size, 0);
    });

    it("lets each player make madeEach worlds, all players madeMost, by their own identity: theirs to own, its maker kept, its settings as asked; what's left on its card", async () => {
        const server = await serve({ anyoneMakes: true, madeEach: 1, madeMost: 2 });
        const [wren, ash, bryn] = [playerFor(server), playerFor(server), playerFor(server)];

        assert.deepEqual((await server.call("GET", "/status")).json.server.makers, { each: 1, left: 2 });

        // (No identity shown: nobody to count it against)
        const unproved = await make(server, {});

        assert.equal(unproved.status, 401);
        assert.equal(unproved.json.error, "unproved");

        const first = await make(server, { name: "Wren's Hollow", player: wren.proof(), settings: { listed: true, mostPlayers: 4 } });

        assert.equal(first.status, 200, JSON.stringify(first.json));
        assert.match(first.json.ownerKey, /^[0-9A-Z]{4}/);

        const meta = server.metaOf(first.json.world);

        assert.equal(meta.maker, wren.id);
        assert.match(meta.creator, new RegExp(`^Wren 1 \\(a player, ${wren.id}\\)$`));
        assert.equal(meta.settings.listed, true);
        assert.equal(meta.settings.mostPlayers, 4);
        assert.equal((await server.call("POST", "/enter", { body: { world: first.json.world, key: first.json.ownerKey } })).json.role, "owner", "theirs to own");
        assert.deepEqual((await server.call("GET", "/status")).json.server.makers, { each: 1, left: 1 });

        const again = await make(server, { player: wren.proof() });

        assert.equal(again.status, 409);
        assert.equal(again.json.error, "made-each");
        assert.equal((await make(server, { player: ash.proof() })).status, 200);
        assert.deepEqual((await server.call("GET", "/status")).json.server.makers, { each: 1, left: 0 });

        const full = await make(server, { player: bryn.proof() });

        assert.equal(full.status, 409);
        assert.equal(full.json.error, "made-most");

        // (A creator's key makes worlds as ever, uncounted)
        const creator = (await server.manage.issueCreator("Sam")).key;

        assert.equal((await server.call("POST", "/worlds", { auth: `Key ${creator}`, body: { name: "Sam's", race: "human", seed: 3 } })).status, 200);
        assert.equal(server.worlds.size, 3);
    });

    it("refuses a proof shown before, one for another server, and more than MADE_PER_HOUR from one address in an hour", async () => {
        const server = await serve({ anyoneMakes: true, madeEach: 10, madeMost: 50 });
        const wren = playerFor(server);
        const proof = wren.proof();

        assert.equal((await make(server, { player: proof })).status, 200);
        assert.equal((await make(server, { player: proof })).json.error, "unproved", "a proof's good once");
        assert.equal((await make(server, { player: proofOf(newPlayerSecret(), { server: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ", name: "Wren" }) })).json.error, "unproved", "nor for another server");

        for (let made = 1; made < MADE_PER_HOUR; made += 1) {
            assert.equal((await make(server, { player: wren.proof() })).status, 200);
        }

        const busy = await make(server, { player: wren.proof() });

        assert.equal(busy.status, 429);
        assert.equal(busy.json.error, "wait");
        assert.equal(server.worlds.size, MADE_PER_HOUR);
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

    it("holds a player to Nanny Mode once they've been seen from a listed country (6B-21): from another country the next time, in it still, told the country that holds them; no hold with Nanny Mode off; let go of when its days are set to none, or by a pass", async () => {
        const made = (await server.call("POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Holdfast", race: "human", seed: 8 } })).json;
        const secret = newPlayerSecret();
        const id = playerIdOf(publicKeyOf(secret));
        const file = server.countries.country;
        let shown = 0;
        // (In by their own identity, and into the world: their game, and how the server has them)
        const come = async () => {
            const entered = await server.call("POST", "/enter", { body: { world: made.world, key: made.playerKey, net: NET_VERSION, player: proofOf(secret, { server: server.identity.id, name: `Wren ${(shown += 1)}` }) } });

            assert.equal(entered.status, 200, JSON.stringify(entered.json));

            const game = await play(server, made.world, entered.json.session);
            const place = [...server.play.places.values()].find((one) => one.world === made.world);

            return { game, place: { country: place.country, nanny: place.nanny, why: place.nannyWhy } };
        };
        const gone = async (game) => {
            game.close();
            await until(() => ![...server.play.places.values()].some((one) => one.world === made.world), "out of the world", ENTERING);
        };

        try {
            // Nanny Mode off: seen from the United Kingdom, and nothing held of it
            server.countries.country = () => "GB";

            const before = await come();

            assert.deepEqual([before.place, server.access.players.get(id).nanny], [{ country: "GB", nanny: false, why: null }, null]);
            await gone(before.game);

            // On, for listed countries alone: seen from the United Kingdom, in it, and held from now
            await server.manage.changeSettings({ nanny: "all", nannyUnknown: false });

            const home = await come();

            assert.deepEqual(home.place, { country: "GB", nanny: true, why: { why: "country", code: "GB", threshold: 16 } });
            assert.equal(server.access.players.get(id).nanny.seen, "GB");
            await gone(home.game);

            // From France the next time (a VPN turned on): in it still, held by the United Kingdom's rules
            server.countries.country = () => "FR";

            const away = await come();

            assert.deepEqual(away.place, { country: "FR", nanny: true, why: { why: "held", code: "GB", threshold: 16 } });

            // The hold's days set to none: let go of at once, as the settings change, and not kept
            await server.manage.changeSettings({ nannyHoldDays: 0 });
            await until(() => [...server.play.places.values()].find((one) => one.world === made.world)?.nanny === false, "let go of", ENTERING);
            assert.equal(server.access.players.get(id).nanny, null);
            await gone(away.game);

            // Held again, then a pass (6B-22's): let go of, whenever it was set
            await server.manage.changeSettings({ nannyHoldDays: 30 });
            server.countries.country = () => "GB";
            await gone((await come()).game);
            assert.equal(server.access.players.get(id).nanny.seen, "GB");
            assert.equal(server.access.players.release(id), true);
            server.countries.country = () => "FR";

            const passed = await come();

            assert.deepEqual(passed.place, { country: "FR", nanny: false, why: null });
            await gone(passed.game);
        } finally {
            server.countries.country = file;
            await server.manage.changeSettings({ nanny: "off", nannyUnknown: true, nannyHoldDays: 30 });
        }
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

    it("takes and sends messages of bytes where they're spoken, never compressed, and closes on them where they aren't", () => {
        const bytes = Buffer.from(Array.from({ length: 1500 }, (_, k) => (k * 17 + 3) & 255));

        // (As a browser sends them where compression's agreed: compressed, marked so (RSV1))
        const deflated = zlib.deflateRawSync(bytes, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
        const packed = deflated.subarray(0, deflated.length - 4);

        // (Spoken, on a socket that compresses its text: whole, in two pieces, and compressed)
        for (const frames of [[frame(0x2, bytes)], [frame(0x2, bytes.subarray(0, 700), { fin: false }), frame(0x0, bytes.subarray(700))], [frame(0x42, packed)]]) {
            const raw = fake();
            const socket = new Socket(raw, Buffer.alloc(0), { limit: 64 * 1024, deflate: true, binary: true });
            const heard = [];
            const lines = [];

            socket.onBinary = (message) => heard.push(message);
            socket.onMessage = (text) => lines.push(text);
            frames.forEach((one) => raw.feed(one));
            assert.equal(heard.length, 1);
            assert.ok(Buffer.from(heard[0]).equals(bytes));
            assert.deepEqual(lines, []);

            socket.sendBinary(bytes);

            const sent = Buffer.concat(raw.written);

            assert.equal(sent[0], 0x82, "one binary frame, not compressed (no RSV1)");
            assert.equal(sent[1], 126, "unmasked, its length in two bytes");
            assert.equal(sent.readUInt16BE(2), 1500);
            assert.ok(sent.subarray(4).equals(bytes));
            assert.deepEqual(socket.sent, { messages: 1, bytes: 1500, wire: 1500 });
            assert.ok(socket.open);
        }

        // (Not spoken: closed, can't be taken; and none sent)
        const raw = fake();
        const socket = new Socket(raw, Buffer.alloc(0), { limit: 64 * 1024 });
        let heard = 0;

        socket.onBinary = () => heard++;
        socket.onMessage = () => heard++;
        socket.sendBinary(bytes);
        assert.deepEqual(raw.written, []);
        raw.feed(frame(0x2, bytes));
        assert.equal(heard, 0);
        assert.equal(socket.open, false);
        assert.equal(Buffer.concat(raw.written).readUInt16BE(2), 1003);
    });

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
