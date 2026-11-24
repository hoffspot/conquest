// The rules a world shared by strangers changes, and its preset (generated/multiplayer_scaling_plan.md
// 2-1, Rules R0): each rule a key of the world's RULES that's as it is today till the slice that
// builds its other way turns it on; a world's `preset` setting, company or shared, changed only
// while nobody's in it; a public world only by the shared preset, on a server ready for public
// worlds, which none is; and a world kept before the rules were kept, carried on with today's.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { Host, PRESETS, presetRules, RULE_CHOICES, ruled, RULES, SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { publicReady, publicReason } from "../server/access/cap.js";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { STOP_NOTICE } from "../server/manage.js";
import { afkFor, openWorld, rulesFor } from "../server/reopen.js";
import { schemaReason } from "../server/storage/settings.js";
import { presetOf, PRESET_WORDS, settingsOf, WORLD_SETTINGS } from "../server/storage/worlds.js";
import { WorldServer } from "../server/world-server.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const made = [];
const servers = [];

// The rules as they'd be with every one of them built (what each slice turns on, all at once)
const NONE = Object.freeze(Object.fromEntries(Object.entries(RULE_CHOICES).map(([key, choice]) => [key, { ...choice, built: false }])));
const BUILT = Object.freeze(Object.fromEntries(Object.entries(RULE_CHOICES).map(([key, choice]) => [key, { ...choice, built: true }])));

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
function raw(port, { method = "GET", route = "/", headers = {}, body = null }) {
    const text = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port, path: route, method, headers: { Host: `localhost:${port}`, ...(text ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } : {}), ...headers } }, (response) => {
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

describe("the rules a shared world changes (core/host.js RULE_CHOICES)", () => {
    it("has each as it is today in RULES, its other way named with the slice that builds it, and only those built whose slices are (pvp: 2-2; loot: 2-13)", () => {
        assert.deepEqual(Object.keys(RULE_CHOICES), ["pvp", "loot", "scaling", "director", "instances", "rares", "stock"]);

        for (const [key, { of, shared, slice, built }] of Object.entries(RULE_CHOICES)) {
            assert.equal(RULES[key], of[0], `${key}: today's first`);
            assert.equal(of.length, 2, key);
            assert.equal(shared, of[1], `${key}: a shared world has the other`);
            assert.match(slice, /^2-\d+$/, key);
            assert.equal(built, key === "pvp" || key === "loot", `${key}: turned on by ${slice}, with its tests (pvp's: test/duel.test.js; loot's: test/loot.test.js)`);
        }

        assert.deepEqual(
            Object.fromEntries(Object.entries(RULE_CHOICES).map(([key, { shared }]) => [key, shared])),
            { pvp: "optin", loot: "tagged", scaling: "crowd", director: "area", instances: "party", rares: "character", stock: "personal" },
        );
        // (`pause` was one: no one stops a world for everyone now, in any world, so it's no rule: the plan's 2-7)
        assert.equal(Object.hasOwn(RULES, "pause"), false);
    });

    it("keeps a rule that isn't built as it is today whatever a world's given, and one that is as it's given", () => {
        const asked = { pvp: "optin", loot: "tagged", instances: "party", stock: "nobody's" };

        assert.deepEqual(ruled(asked), { ...RULES, pvp: "optin", loot: "tagged" }, "(pvp and loot built: the rest as today)");
        assert.deepEqual(ruled(asked, NONE), RULES, "(nothing built: as today)");
        assert.deepEqual(ruled({ ...asked, rest: "everyone" }, BUILT), { ...RULES, rest: "everyone", pvp: "optin", loot: "tagged", instances: "party" }, "(built: as given, anything unknown as today)");
        assert.deepEqual(new Host(buildWorld({ seed: 2 }), { populate: false, rules: asked }).rules, { ...RULES, pvp: "optin", loot: "tagged" });
        assert.deepEqual(new Host(buildWorld({ seed: 2 }), { populate: false }).rules, RULES, "(a world a browser hosts never sets them)");
    });

    it("sets them together by a preset: company as today, shared each of those built", () => {
        assert.deepEqual([...PRESETS], ["company", "shared"]);

        const today = Object.fromEntries(Object.keys(RULE_CHOICES).map((key) => [key, RULES[key]]));

        assert.deepEqual(presetRules("company"), today);
        assert.deepEqual(presetRules("shared"), { ...today, pvp: "optin", loot: "tagged" }, "(pvp and loot built: a shared world's players fight only by a duel, and are paid by their tags; the rest as a company's)");
        assert.deepEqual(presetRules("shared", NONE), today, "(none built: as a company's)");
        assert.deepEqual(presetRules(undefined), today);
        assert.deepEqual(presetRules("company", BUILT), today);
        assert.deepEqual(presetRules("shared", BUILT), { pvp: "optin", loot: "tagged", scaling: "crowd", director: "area", instances: "party", rares: "character", stock: "personal" });
        assert.deepEqual(presetRules("shared", { ...NONE, loot: BUILT.loot }), { ...today, loot: "tagged" }, "(one built: that one alone)");
    });

    it("gives a server's world its preset's rules with the server's own, a kept one as it's opened", () => {
        assert.deepEqual(rulesFor({ settings: {} }), { rest: "everyone", debug: "none", invasions: true, afk: RULES.afk, ...presetRules("company") });
        assert.deepEqual(rulesFor({ settings: { preset: "shared", debugCommands: true, awayAfter: 4, outAfter: 15 } }), { rest: "everyone", debug: "owner", invasions: true, afk: { mark: 4 * 60000, out: 15 * 60000 }, ...presetRules("shared") });

        const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules: { rest: "everyone", debug: "owner", mortal: true } });

        host.preset("shared");
        assert.deepEqual(host.rules, { ...RULES, rest: "everyone", debug: "owner", mortal: true, pvp: "optin", loot: "tagged" }, "(its other rules as they were)");
        host.preset("company");
        assert.equal(host.rules.pvp, "war");
        assert.equal(host.rules.loot, "near");
    });

    it("brings a world kept before them forward with each as it was played (SNAPSHOT_STEPS 54)", () => {
        const kept = { version: 54, rules: { rest: "everyone", debug: "owner", invasions: true, mortal: true }, players: [] };
        const forward = SNAPSHOT_STEPS[54](kept);

        assert.ok(SNAPSHOT_VERSION >= 55);
        assert.equal(forward.version, 55);
        // (Its away marks are a rule since: not this step's, filled in as it's restored, rulesOf)
        const then = Object.fromEntries(Object.entries(RULES).filter(([key]) => key !== "afk"));

        assert.deepEqual(forward.rules, { ...then, rest: "everyone", debug: "owner", mortal: true });
        assert.deepEqual(kept.rules, { rest: "everyone", debug: "owner", invasions: true, mortal: true }, "(the one kept left as it was)");
    });
});

describe("a public world (server/access/cap.js publicReason)", () => {
    it("is only by the shared preset, on a server ready for public worlds, which none is yet", () => {
        assert.equal(publicReason({ preset: "company" }), null);
        assert.equal(publicReason({ public: false, preset: "company" }), null);
        assert.match(publicReason({ public: true, preset: "company" }), /A public world plays by the shared preset/);
        assert.match(publicReason({ public: true }), /shared preset/);
        assert.match(publicReason({ public: true, preset: "shared" }), /waits on this server being ready for public worlds\. It still needs: identity, moderation/);
        assert.equal(publicReason({ public: true, preset: "shared" }, { ready: true, missing: [] }), null);
        assert.match(publicReason({ public: true, preset: "company" }, { ready: true, missing: [] }), /shared preset/, "(ready or not)");
        assert.equal(publicReady().ready, false);
    });
});

describe("a world's preset and public settings, on a server", () => {
    let server;
    let admin;
    let world;

    before(async () => {
        const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-rules-"));

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

    it("makes a world a company's and not public, a world kept before either the same, and names each preset for the management page", async () => {
        const details = (await admin("GET", `/worlds/${world.world}`)).json;
        const page = (await admin("GET", "/server")).json;

        assert.deepEqual([details.settings.preset, details.settings.public], ["company", false]);
        assert.deepEqual([WORLD_SETTINGS.preset.default, WORLD_SETTINGS.public.default], ["company", false]);
        assert.deepEqual([...WORLD_SETTINGS.preset.of], [...PRESETS]);
        assert.deepEqual(page.worldSchema.preset.of, ["company", "shared"]);
        assert.match(page.worldSchema.preset.words.company, /^Company/);
        assert.match(page.worldSchema.preset.words.shared, /^Shared/);
        assert.deepEqual(Object.keys(PRESET_WORDS), [...PRESETS]);
        assert.equal(presetOf({ settings: {} }), "company");
        assert.deepEqual([settingsOf({ settings: { listed: true } }).preset, settingsOf({ settings: { listed: true } }).public], ["company", false]);
        assert.match(schemaReason(WORLD_SETTINGS, "preset", "strangers"), /preset must be one of company, shared/);
    });

    it("refuses a public world that isn't shared, and one that is while the server isn't ready, made or changed", async () => {
        const unshared = await admin("PATCH", `/worlds/${world.world}`, { settings: { public: true } });

        assert.equal(unshared.status, 400);
        assert.match(unshared.json.message, /A public world plays by the shared preset/);

        const unready = await admin("PATCH", `/worlds/${world.world}`, { settings: { public: true, preset: "shared" } });

        assert.equal(unready.status, 400);
        assert.match(unready.json.message, /public waits on this server being ready for public worlds/);

        for (const settings of [{ public: true }, { public: true, preset: "shared" }]) {
            assert.equal((await admin("POST", "/worlds", { name: "For strangers", race: "human", seed: 5, settings })).status, 400);
        }

        assert.equal((await admin("GET", `/worlds/${world.world}`)).json.settings.public, false);
        assert.equal((await admin("PATCH", `/worlds/${world.world}`, { settings: { public: false, listed: true } })).status, 200, "(not public: as ever)");
    });

    it("changes a world's preset only while nobody's in it; a kept world opened by its preset's rules", async () => {
        const shared = await admin("PATCH", `/worlds/${world.world}`, { settings: { preset: "shared" } });

        assert.equal(shared.status, 200);
        assert.equal(shared.json.settings.preset, "shared");
        assert.equal((await admin("POST", `/worlds/${world.world}/start`, {})).status, 200);
        await until(() => server.registry.lifeOf(world.world).state, "the world open");

        const going = await admin("PATCH", `/worlds/${world.world}`, { settings: { preset: "company" } });

        assert.equal(going.status, 409);
        assert.equal(going.json.error, "running");
        assert.match(going.json.message, /its preset changes only while nobody's in it/);
        assert.equal((await admin("PATCH", `/worlds/${world.world}`, { settings: { preset: "shared", listed: false } })).status, 200, "(as it is: nothing changed)");
        assert.equal((await admin("POST", `/worlds/${world.world}/aside`, {})).status, 200);

        const back = await admin("PATCH", `/worlds/${world.world}`, { settings: { preset: "company" } });

        assert.equal(back.status, 200);
        assert.equal(back.json.settings.preset, "company");

        const stored = server.worlds.get(world.world);
        const { host } = await openWorld(stored);

        assert.deepEqual(host.rules, { ...RULES, rest: "everyone", debug: "none" });
    });

    it("keeps a world's away marks as settings, in minutes (the plan's 2-8): 10 and 30 unless it says, taken as its rule when it's next opened", async () => {
        const details = (await admin("GET", `/worlds/${world.world}`)).json;

        assert.deepEqual([details.settings.awayAfter, details.settings.outAfter], [10, 30]);
        assert.deepEqual([WORLD_SETTINGS.awayAfter.min, WORLD_SETTINGS.awayAfter.max, WORLD_SETTINGS.outAfter.min, WORLD_SETTINGS.outAfter.max], [1, 120, 1, 720]);
        assert.deepEqual(afkFor({ settings: {} }), { mark: 10 * 60000, out: 30 * 60000 }, "(a world kept before them: the game's own)");
        assert.equal((await admin("PATCH", `/worlds/${world.world}`, { settings: { awayAfter: 0 } })).status, 400);
        assert.equal((await admin("PATCH", `/worlds/${world.world}`, { settings: { outAfter: 721 } })).status, 400);

        const changed = await admin("PATCH", `/worlds/${world.world}`, { settings: { awayAfter: 4, outAfter: 2 } });

        assert.equal(changed.status, 200);
        assert.deepEqual([changed.json.settings.awayAfter, changed.json.settings.outAfter], [4, 2]);

        const { host } = await openWorld(server.worlds.get(world.world));

        assert.deepEqual(host.rules.afk, { mark: 4 * 60000, out: 4 * 60000 }, "(never sent out sooner than marked)");
        assert.equal((await admin("PATCH", `/worlds/${world.world}`, { settings: { awayAfter: 10, outAfter: 30 } })).status, 200);
    });

    it("stops a world with notice from the management page, and not one that isn't going (manage.js stopSoon; the plan's 2-7)", async () => {
        assert.equal(STOP_NOTICE, 60);

        const idle = await admin("POST", `/worlds/${world.world}/stop`, {});

        assert.deepEqual([idle.status, idle.json.error], [409, "not-going"]);
        assert.equal((await admin("POST", `/worlds/${world.world}/start`, {})).status, 200);
        await until(() => server.registry.lifeOf(world.world).state, "the world open");

        // (Asked: its players given a minute; asked again meanwhile, the same notice runs on)
        const asked = await admin("POST", `/worlds/${world.world}/stop`, {});

        assert.equal(asked.status, 200);
        assert.ok(asked.json.stopping > 55 && asked.json.stopping <= 60, `${asked.json.stopping} s`);
        assert.equal(server.manage.stops.size, 1);
        assert.ok((await admin("POST", `/worlds/${world.world}/stop`, {})).json.stopping <= asked.json.stopping);
        assert.equal(server.manage.stops.size, 1);
        assert.ok(server.registry.entries.get(world.world)?.thread, "still going, till its notice is up");

        // (Its notice up: set aside, saved. A short one, for the test)
        server.manage.forgetStops();
        await server.manage.stopSoon(world.world, { by: "the tests", seconds: 0.2 });
        await until(() => !server.registry.entries.get(world.world)?.thread, "the world set aside");
        assert.equal(server.manage.stops.size, 0);
    });
});
