// How many players a world server takes, as its settings (generated/multiplayer_scaling_plan.md
// 1-13; server/storage/settings.js CAPS): `playersAtOnce`, in all its worlds together, and
// `mostPlayersCeiling`, in any one of them. Each only lowers what a server takes: its default and
// its most are what a server always took (64, and 8 a world, the game's own number), so no server
// that's run as one can be given more. The ceiling is told to games (the status card), bounds a
// world's own setting as it's made or changed, and holds a world whose setting is above it
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { MOST_PLAYERS, NET_VERSION } from "../client/js/core/netplay.js";
import { decode, encode } from "../client/js/core/wire.js";
import { LIMITS } from "../server/access/limits.js";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { readJSON, writeJSON } from "../server/storage/files.js";
import { CAPS, settingReason, SETTINGS } from "../server/storage/settings.js";
import { WORLD_SETTINGS } from "../server/storage/worlds.js";
import { WorldServer } from "../server/world-server.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword" });
const ENTERING = 60000;
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function until(test, what, ms = ENTERING) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}

// A world server listening on loopback (opened as one that's run is: no `limits`)
async function serve() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-caps-"));

    made.push(folder);

    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });

    await server.settings.change({ setAsideMinutes: 0 });
    await server.listen(0, "127.0.0.1");
    servers.push(server);
    server.call = async (method, route, { body, auth = `Key ${server.adminKey}` } = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.port}/api/v1${route}`, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth, [ADMIN_HEADER]: ADMIN_VALUE } : {}) }, body: body ? JSON.stringify(body) : undefined });

        return { status: response.status, json: await response.json() };
    };

    return server;
}

// A player's game into a world by its players' key, said hello, and welcomed or refused: { entered (the /enter answer), welcome, refused, close() }
async function comeIn(server, world) {
    const entered = await server.call("POST", "/enter", { auth: null, body: { world: world.world, key: world.playerKey, net: NET_VERSION } });

    if (entered.status !== 200) {
        return { entered };
    }

    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, PLAY_PROTOCOL);
    const heard = [];

    socket.onmessage = ({ data }) => heard.push(data);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
    });
    socket.send(`enter ${world.world} ${entered.json.session}`);
    await until(() => heard.some((line) => line.startsWith("entered")), "entered");
    socket.send(`data\n${encode({ kind: "hello", version: NET_VERSION, character: { hero: HERO }, hero: "new" })}`);

    const said = (kind) => heard.filter((line) => line.startsWith("data\n")).map((line) => decode(line.slice(5))).find((message) => message.kind === kind);

    await until(() => said("welcome") || said("refused"), "a welcome");
    socket.send(`data\n${encode({ kind: "ready" })}`);

    return { entered, welcome: said("welcome"), refused: said("refused"), close: () => socket.close() };
}

describe("how many a world server takes, as its settings (storage/settings.js CAPS)", () => {
    it("has both at what a server always took, and lets neither be set higher", () => {
        assert.deepEqual(CAPS, { players: 64, mostPlayers: 8 });
        assert.equal(CAPS.players, LIMITS.players);
        assert.equal(CAPS.mostPlayers, MOST_PLAYERS, "a world's most is the game's own number");
        assert.equal(CAPS.mostPlayers, WORLD_SETTINGS.mostPlayers.max, "and the most a world's own setting takes");
        assert.deepEqual({ ...SETTINGS.playersAtOnce, about: null }, { kind: "integer", min: 1, max: 64, default: 64, about: null });
        assert.deepEqual({ ...SETTINGS.mostPlayersCeiling, about: null }, { kind: "integer", min: 1, max: 8, default: 8, about: null });

        for (const [key, over] of [["playersAtOnce", 65], ["mostPlayersCeiling", 9], ["mostPlayersCeiling", 100], ["playersAtOnce", 0], ["mostPlayersCeiling", 2.5]]) {
            assert.match(settingReason(key, over), new RegExp(`^${key} must be a whole number from 1 to ${SETTINGS[key].max}`), `${key} ${over}`);
        }

        assert.equal(settingReason("mostPlayersCeiling", 8), null);
        assert.equal(settingReason("playersAtOnce", 64), null);
    });

    it("takes no more on a server that's run as one, whatever it's asked: by its settings, its file's or a request", async () => {
        const server = await serve();

        assert.deepEqual(server.limits, {});
        assert.deepEqual([server.mostPlayersCeiling, server.playersAtOnce], [8, 64]);
        assert.deepEqual(await server.settings.change({ mostPlayersCeiling: 9 }), { ok: false, reasons: ["mostPlayersCeiling must be a whole number from 1 to 8, not 9."] });
        assert.deepEqual(await server.settings.change({ playersAtOnce: 100 }), { ok: false, reasons: ["playersAtOnce must be a whole number from 1 to 64, not 100."] });

        const asked = await server.call("PATCH", "/server", { body: { settings: { mostPlayersCeiling: 25, playersAtOnce: 500 } } });

        assert.equal(asked.status, 400);
        assert.deepEqual([server.mostPlayersCeiling, server.playersAtOnce], [8, 64]);

        // (And a world's own setting no higher, as ever)
        const world = await server.call("POST", "/worlds", { body: { name: "Too Many", race: "human", seed: 3, settings: { mostPlayers: 9 } } });

        assert.equal(world.status, 400);
        assert.match(world.json.message, /mostPlayers must be a whole number from 1 to 8/);

        // (Nor by its settings' file, written by hand: a server whose file asks more won't start)
        const file = path.join(server.root, "server.json");

        await server.close();
        await writeJSON(file, { ...(await readJSON(file)), mostPlayersCeiling: 25 });
        await assert.rejects(WorldServer.open(server.root, { cost: CHEAP, awake: () => ({ stop() {} }) }), /mostPlayersCeiling must be a whole number from 1 to 8, not 25/);
        await writeJSON(file, { ...(await readJSON(file)), mostPlayersCeiling: 8, playersAtOnce: 65 });
        await assert.rejects(WorldServer.open(server.root, { cost: CHEAP, awake: () => ({ stop() {} }) }), /playersAtOnce must be a whole number from 1 to 64, not 65/);
    });

    it("tells games its ceiling, bounds a world's own setting by it, and holds a world whose setting is above it to it", async () => {
        const server = await serve();
        const status = async () => (await server.call("GET", "/status", { auth: null })).json;

        assert.equal((await status()).server.mostPlayers, 8);

        // A world made while a world may take 8, listed
        const world = (await server.call("POST", "/worlds", { body: { name: "Thornwick", race: "human", seed: 3, settings: { listed: true } } })).json;

        assert.equal(server.worlds.get(world.world).meta.settings.mostPlayers, 8);
        assert.equal((await status()).worlds[0].most, 8);

        // The ceiling lowered to 2: told, and the world's card says what it now takes
        assert.equal((await server.call("PATCH", "/server", { body: { settings: { mostPlayersCeiling: 2 } } })).status, 200);
        assert.equal((await status()).server.mostPlayers, 2);
        assert.equal((await status()).worlds[0].most, 2);
        assert.equal(server.worlds.get(world.world).meta.settings.mostPlayers, 8, "its own setting left as it was");

        const shown = (await server.call("GET", "/server")).json;

        assert.deepEqual([shown.worldSchema.mostPlayers.max, shown.worldSchema.mostPlayers.default, shown.schema.mostPlayersCeiling.max], [2, 2, 8]);

        // A world made now: 2 unless fewer are asked for, and no more
        const over = await server.call("POST", "/worlds", { body: { name: "Three", race: "human", seed: 4, settings: { mostPlayers: 3 } } });

        assert.equal(over.status, 400);
        assert.match(over.json.message, /mostPlayers must be a whole number from 1 to 2 on this server, not 3/);

        const small = (await server.call("POST", "/worlds", { body: { name: "Small", race: "human", seed: 5 } })).json;

        assert.equal(server.worlds.get(small.world).meta.settings.mostPlayers, 2);
        assert.equal((await server.call("PATCH", `/worlds/${small.world}`, { body: { settings: { mostPlayers: 3 } } })).status, 400);
        assert.equal((await server.call("PATCH", `/worlds/${small.world}`, { body: { settings: { mostPlayers: 1 } } })).status, 200);
        // (The older world's other settings still change, its 8 said again as it stands)
        assert.equal((await server.call("PATCH", `/worlds/${world.world}`, { body: { settings: { mostPlayers: 8, listed: true } } })).status, 200);

        // The world whose setting says 8 takes 2: the third is told it's full
        const first = await comeIn(server, world);
        const second = await comeIn(server, world);

        assert.ok(first.welcome && second.welcome, "two come in");
        await until(() => server.registry.lifeOf(world.world).state?.players.filter((one) => one.id).length === 2, "both in the world");

        const third = await comeIn(server, world);

        assert.equal(third.entered.status, 409);
        assert.equal(third.entered.json.error, "full");
        first.close();
        second.close();
    });

    it("takes as many in all its worlds together as its setting says", async () => {
        const server = await serve();

        await server.settings.change({ playersAtOnce: 1 });

        const world = (await server.call("POST", "/worlds", { body: { name: "Thornwick", race: "human", seed: 3 } })).json;
        const first = await comeIn(server, world);

        assert.ok(first.welcome);

        // (A second player's socket: closed, "full", as a server with 64 in closes the 65th)
        const entered = await server.call("POST", "/enter", { auth: null, body: { world: world.world, key: world.playerKey, net: NET_VERSION } });
        const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, PLAY_PROTOCOL);
        const heard = [];

        socket.onmessage = ({ data }) => heard.push(data);
        await new Promise((resolve, reject) => {
            socket.onopen = resolve;
            socket.onerror = reject;
        });
        socket.send(`enter ${world.world} ${entered.json.session}`);
        await until(() => heard.length > 0, "an answer");
        assert.deepEqual(heard, ["closed full"]);
        first.close();
    });
});
