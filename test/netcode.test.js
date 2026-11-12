// A world's netcode and the server's replication switch (generated/multiplayer_scaling_plan.md
// F-4): how a world's played with those who come in is a setting of its own, lockstep the only
// choice there is, changed only while nobody's in it; a world may be marked experimental, said
// on its card; the server's `replication` turns every world's replicated views off at once; and
// every such switch has a date it must be gone by.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { NETCODES, NET_VERSION } from "../client/js/core/netplay.js";
import { SERVER_REFUSALS } from "../client/js/app/servers.js";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { schemaReason, SETTINGS, settingReason } from "../server/storage/settings.js";
import { netcodeOf, NETCODE_WORDS, settingsOf, WORLD_SETTINGS } from "../server/storage/worlds.js";
import { WorldServer } from "../server/world-server.js";
import { unexpired } from "./helpers.js";

// Each switch of the two netcodes' coexistence, and the day it must be gone by (or argued for):
// a setting that chooses between ways of doing one thing, or marks a world as trying one
const SWITCHES = Object.freeze({
    "world netcode": "2027-11-12",
    "world experimental": "2027-11-12",
    "server replication": "2027-11-12",
});

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function until(test, what, ms = 30000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}

// An HTTP request to a port on loopback: { status, headers, json }
function raw(port, { method = "GET", route = "/", host = `localhost:${port}`, headers = {}, body = null }) {
    const text = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port, path: route, method, headers: { Host: host, ...(text ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } : {}), ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const said = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, headers: response.headers, json: said.startsWith("{") ? JSON.parse(said) : null });
            });
        });

        request.on("error", reject);
        request.end(text ?? undefined);
    });
}

describe("the schema of a setting that's one of a few (server/storage/settings.js)", () => {
    it("takes a world's netcode as lockstep alone, and nothing that would let more than 8 in", () => {
        assert.deepEqual([...WORLD_SETTINGS.netcode.of], [...NETCODES]);
        assert.deepEqual([...NETCODES], ["lockstep"]);
        assert.equal(WORLD_SETTINGS.netcode.default, "lockstep");
        assert.equal(schemaReason(WORLD_SETTINGS, "netcode", "lockstep"), null);
        assert.equal(schemaReason(WORLD_SETTINGS, "netcode", "views.1"), 'netcode must be lockstep, not "views.1".');
        assert.match(schemaReason(WORLD_SETTINGS, "netcode", true), /must be lockstep, not true/);
        assert.deepEqual(Object.keys(NETCODE_WORDS), [...NETCODES], "each named for the management page");

        assert.equal(WORLD_SETTINGS.experimental.default, false);
        assert.equal(schemaReason(WORLD_SETTINGS, "experimental", "yes"), 'experimental must be true or false, not "yes".');

        // (The owner's decision: no world above 8 until the new netcode exists)
        assert.equal(WORLD_SETTINGS.mostPlayers.max, 8);
    });

    it("takes the server's replication as off, dark or on, off unless it's set", () => {
        assert.deepEqual(SETTINGS.replication.of, ["off", "dark", "on"]);
        assert.equal(SETTINGS.replication.default, "off");
        assert.deepEqual(Object.keys(SETTINGS.replication.words), SETTINGS.replication.of);

        for (const value of ["off", "dark", "on"]) {
            assert.equal(settingReason("replication", value), null);
        }

        assert.equal(settingReason("replication", "shadow"), 'replication must be one of off, dark, on, not "shadow".');
        assert.match(settingReason("replication", false), /not false/);
    });

    it("reads a world made before either setting as lockstep and not experimental", () => {
        const older = { settings: { mostPlayers: 6, listed: true } };

        assert.equal(netcodeOf(older), "lockstep");
        assert.equal(netcodeOf(null), "lockstep");
        assert.equal(netcodeOf({ settings: { netcode: "views.1" } }), "views.1");
        assert.deepEqual(Object.keys(settingsOf(older)), Object.keys(WORLD_SETTINGS));
        assert.deepEqual({ ...settingsOf(older) }, { ...Object.fromEntries(Object.entries(WORLD_SETTINGS).map(([key, { default: value }]) => [key, value])), mostPlayers: 6, listed: true });
    });
});

describe("a world's netcode and the server's replication, on a world server (server/api.js, manage.js)", () => {
    let server;
    let admin;
    let world;

    const enter = (speaks) => raw(server.port, { method: "POST", route: "/api/v1/enter", host: `127.0.0.1:${server.port}`, body: { world: world.world, key: world.playerKey, net: NET_VERSION, ...(speaks ? { speaks } : {}) } });

    before(async () => {
        const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-netcode-"));

        server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });
        made.push(folder);
        servers.push(server);
        await server.settings.change({ setAsideMinutes: 0 });
        await server.listen(0, "127.0.0.1");
        await server.listenAdmin(0);

        const page = await raw(server.adminPort, {});
        const cookie = page.headers["set-cookie"][0].split(";")[0];

        admin = (method, route, body) => raw(server.adminPort, { method, route: `/api/v1${route}`, headers: { Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE }, body });
        world = (await admin("POST", "/worlds", { name: "Thornwick", race: "human", seed: 3, settings: { listed: true } })).json;
    });

    it("makes a world lockstep and not experimental, says both on its card, and gives the management page each choice in words", async () => {
        const details = (await admin("GET", `/worlds/${world.world}`)).json;
        const card = (await raw(server.port, { route: "/api/v1/status", host: `127.0.0.1:${server.port}` })).json.worlds[0];
        const page = (await admin("GET", "/server")).json;

        assert.deepEqual([details.settings.netcode, details.settings.experimental], ["lockstep", false]);
        assert.deepEqual([card.netcode, card.experimental, card.most], ["lockstep", false, 8]);
        assert.equal(page.settings.replication, "off");
        assert.deepEqual(page.schema.replication.of, ["off", "dark", "on"]);
        assert.deepEqual(page.worldSchema.netcode.of, ["lockstep"]);
        assert.match(page.worldSchema.netcode.words.lockstep, /^Lockstep/);
    });

    it("refuses a netcode there isn't, marks a world experimental, and turns the server's replication to dark and back", async () => {
        const bad = await admin("PATCH", `/worlds/${world.world}`, { settings: { netcode: "views.1" } });

        assert.equal(bad.status, 400);
        assert.match(bad.json.message, /netcode must be lockstep/);
        assert.equal((await admin("POST", "/worlds", { name: "Too many", race: "human", seed: 4, settings: { mostPlayers: 9 } })).status, 400, "and no world of more than 8");

        const marked = await admin("PATCH", `/worlds/${world.world}`, { settings: { experimental: true, netcode: "lockstep" } });

        assert.equal(marked.status, 200);
        assert.equal(marked.json.settings.experimental, true);
        assert.equal((await raw(server.port, { route: "/api/v1/status", host: `127.0.0.1:${server.port}` })).json.worlds[0].experimental, true);

        assert.equal((await admin("PATCH", "/server", { settings: { replication: "maybe" } })).status, 400);

        const dark = await admin("PATCH", "/server", { settings: { replication: "dark" } });

        assert.equal(dark.status, 200);
        assert.equal(dark.json.settings.replication, "dark");

        // (Dark does nothing yet: a lockstep world's entered as ever)
        assert.equal((await enter()).status, 200);
        assert.equal((await admin("PATCH", "/server", { settings: { replication: "off" } })).json.settings.replication, "off");
    });

    it("lets nobody into a world played another way while replication's off, and changes how a world's played only while nobody's in it", async () => {
        const stored = server.worlds.get(world.world);

        // (A world set to views, as a later server will set one: there's no way to here)
        await stored.writeMeta({ settings: { ...stored.meta.settings, netcode: "views.1" } });

        // (A game that speaks lockstep alone, said or not: told it can't play it, in words)
        for (const speaks of [undefined, ["lockstep"]]) {
            const refused = await enter(speaks);

            assert.equal(refused.status, 409);
            assert.deepEqual([refused.json.error, refused.json.netcode], ["netcode", "views.1"]);
        }

        // (One that says it speaks it: the kill switch, at off; and at on too, on a server that can't play it)
        const off = await enter(["lockstep", "views.1"]);

        assert.equal(off.status, 409);
        assert.deepEqual([off.json.error, off.json.netcode], ["replication", "views.1"]);
        assert.match(off.json.message, /turned off on its server for now\. It's saved/);
        assert.equal(off.json.message, SERVER_REFUSALS.replication);
        await server.settings.change({ replication: "on" });
        assert.equal((await enter(["lockstep", "views.1"])).json.error, "replication");
        await server.settings.change({ replication: "off" });

        // (Going: how it's played can't change; set aside, it reopens as lockstep, its save as it was)
        assert.equal((await admin("POST", `/worlds/${world.world}/start`, {})).status, 200);
        await until(() => server.registry.lifeOf(world.world).state, "the world open");

        const going = await admin("PATCH", `/worlds/${world.world}`, { settings: { netcode: "lockstep" } });

        assert.equal(going.status, 409);
        assert.equal(going.json.error, "running");
        assert.match(going.json.message, /how it's played changes only while nobody's in it/);
        assert.equal((await admin("POST", `/worlds/${world.world}/aside`, {})).status, 200);

        const back = await admin("PATCH", `/worlds/${world.world}`, { settings: { netcode: "lockstep" } });

        assert.equal(back.status, 200);
        assert.equal(back.json.settings.netcode, "lockstep");
        assert.equal((await enter()).status, 200);
    });
});

describe("the switches' expiry (test/helpers.js unexpired)", () => {
    it("fails once a switch's date has passed, and not before", () => {
        assert.doesNotThrow(() => unexpired("a switch", "2027-05-01", new Date("2027-04-30T23:59:59Z")));
        assert.throws(() => unexpired("a switch", "2027-05-01", new Date("2027-05-01T00:00:00Z")), /The switch "a switch" expired on 2027-05-01: take it out/);
        assert.throws(() => unexpired("a switch", "next spring"), /an expiry as 2027-05-01/);
    });

    it("has a date for every switch there is, none of them passed", () => {
        // (A setting that's one of a few is a switch, and so is a world's experimental mark: one
        // added without a date here fails)
        const switches = [...Object.entries(WORLD_SETTINGS).map(([key, setting]) => [`world ${key}`, setting]), ...Object.entries(SETTINGS).map(([key, setting]) => [`server ${key}`, setting])].filter(([name, { kind }]) => kind === "choice" || name === "world experimental").map(([name]) => name);

        assert.deepEqual(switches.sort(), Object.keys(SWITCHES).sort());

        for (const [name, date] of Object.entries(SWITCHES)) {
            unexpired(name, date);
        }
    });
});
