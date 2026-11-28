// Age checks (server/access/agecheck.js, server/api.js; the scaling plan's 6B-22), against a
// provider of the tests' own.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { NET_VERSION } from "../client/js/core/netplay.js";
import { newPlayerSecret, playerIdOf, proofOf, publicKeyOf } from "../client/js/core/player.js";
import { adapterFault, AGE_REFUSED, AGECHECK, AGECHECK_FIELDS, AgeChecks, AgeRefusal, fakeProvider, keyNameOf, providerKey } from "../server/access/agecheck.js";
import { nannyFor } from "../server/access/nanny.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { PLAYERS_FILE, PlayerStore } from "../server/storage/players.js";
import { TokenFile } from "../server/storage/tokens.js";
import { WorldServer } from "../server/world-server.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const DAY = 86400000;
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function until(test, what, ms = 20000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
}

const someone = (name) => {
    const key = publicKeyOf(newPlayerSecret());

    return { id: playerIdOf(key), key, name };
};
const refused = (error) => (thrown) => thrown instanceof AgeRefusal && thrown.error === error && thrown.message === AGE_REFUSED[error];

// The server's players in a folder of their own, a provider of the tests', and the checks between them, on a clock the test moves
async function checks({ provider = fakeProvider() } = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-agecheck-"));
    const clock = { now: Date.UTC(2026, 10, 28, 12) };
    const passed = [];

    made.push(root);

    const players = await PlayerStore.open(root, { clock: () => clock.now });
    const ages = new AgeChecks({ players, provider, clock: () => clock.now, onPassed: (id) => passed.push(id) });
    const wren = someone("Wren");

    await players.seen(wren);

    return { root, clock, players, ages, provider, passed, wren };
}

describe("an age-check provider's adapter (server/access/agecheck.js)", () => {
    it("is a name, begin and status; its key kept in the token store under its name, never in the settings", async () => {
        assert.equal(adapterFault(fakeProvider()), null);
        assert.match(adapterFault(null), /an object/);
        assert.match(adapterFault({ name: "Bad Name", begin() {}, status() {} }), /lowercase letters/);
        assert.match(adapterFault({ name: "half", begin() {} }), /needs begin and status/);
        assert.throws(() => new AgeChecks({ players: {}, provider: { name: "half" } }), TypeError);

        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-agecheck-"));

        made.push(root);

        const tokens = new TokenFile(path.join(root, "tokens.json"));

        assert.equal(keyNameOf("yoti"), "agecheck:yoti");
        assert.equal(await providerKey(tokens, "yoti"), null);
        await tokens.set(keyNameOf("yoti"), "sk_test_0123456789");
        assert.equal(await providerKey(tokens, "yoti"), "sk_test_0123456789");
        assert.equal(await providerKey(null, "yoti"), null);
        assert.deepEqual(AGECHECK, { attempts: 3, days: 30, sessionMinutes: 30, least: 13, most: 21 });
    });
});

describe("an age check (server/access/agecheck.js AgeChecks)", () => {
    it("with no provider, isn't offered: begun or asked after, refused, saying age checks aren't set up here", async () => {
        const { ages, wren } = await checks({ provider: null });

        assert.deepEqual(ages.offered(), { offered: false, provider: null });
        await assert.rejects(() => ages.begin(wren.id, 16), refused("no-provider"));
        await assert.rejects(() => ages.status(wren.id), refused("no-provider"));
        assert.equal(AGE_REFUSED["no-provider"], "Age checks aren't set up on this server yet, so Nanny Mode can't be turned off here for now.");
    });

    it("passed: the provider asked by the server for the age that's needed, the player sent to the provider's own page; four things kept and no more, their tries forgotten, their hold let go of, and Nanny Mode lifted for them", async () => {
        const { ages, players, provider, passed, wren, root } = await checks();

        players.sighted(wren.id, "GB");
        assert.deepEqual(ages.offered(), { offered: true, provider: "fake" });

        const begun = await ages.begin(wren.id, 16);

        assert.deepEqual({ ...begun, until: null }, { url: "https://agecheck.invalid/fake-1", provider: "fake", threshold: 16, left: 2, until: null });
        assert.deepEqual(provider.begun.map(({ id, threshold }) => [id, threshold]), [["fake-1", 16]]);
        assert.match(provider.begun[0].reference, /^[A-Za-z0-9_-]{24}$/);
        assert.deepEqual(players.get(wren.id).attempts.count, 1);

        // (Still at it)
        assert.deepEqual(await ages.status(wren.id), { state: "pending" });
        assert.equal(players.get(wren.id).agecheck, null);

        provider.answer("fake-1", { state: "passed" });
        assert.deepEqual(await ages.status(wren.id), { state: "passed", threshold: 16 });
        assert.deepEqual(passed, [wren.id]);

        const record = players.get(wren.id);

        assert.deepEqual(Object.keys(record.agecheck), AGECHECK_FIELDS);
        assert.deepEqual(record.agecheck, { passed: true, threshold: 16, date: "2026-11-28", provider: "fake" });
        assert.deepEqual([record.attempts, record.nanny], [null, null]);

        // (And nothing else of it anywhere in what's kept: no reference, no session, no page)
        await players.flush();

        const kept = await readFile(path.join(root, PLAYERS_FILE), "utf8");

        assert.ok(!kept.includes(provider.begun[0].reference) && !kept.includes("fake-1") && !kept.includes("agecheck.invalid"));

        // (The rule reads it: over sixteen shown, out of the United Kingdom's Nanny Mode, not Brazil's at eighteen)
        const settings = { nanny: "all", nannyCountries: [{ code: "GB", threshold: 16 }, { code: "BR", threshold: 18 }], nannyUnknown: true, nannyHoldDays: 30 };

        assert.equal(nannyFor({ country: "GB", record, settings }).on, false);
        assert.equal(nannyFor({ country: "BR", record, settings }).on, true);

        // (Passed already, for that age: no need of another. For an older one: begun)
        await assert.rejects(() => ages.begin(wren.id, 16), refused("age-passed"));
        assert.equal((await ages.begin(wren.id, 18)).threshold, 18);
    });

    it("isn't passed by a fail, by an age under the one asked, by an answer that isn't this session's, or by one asked for twice: Nanny Mode stays, the try counted, nothing else kept", async () => {
        for (const [how, answer] of [
            ["a fail", { state: "failed" }],
            ["under the age asked", { state: "passed", over: 15 }],
            ["no age said", { state: "passed", over: undefined }],
            ["another session's reference (forged)", { state: "passed", reference: "someone-elses-reference" }],
            ["no reference at all", { state: "passed", reference: null }],
            ["a state it doesn't know", { state: "approved" }],
        ]) {
            const { ages, players, provider, passed, wren } = await checks();

            await ages.begin(wren.id, 16);
            provider.answer("fake-1", answer);
            assert.deepEqual(await ages.status(wren.id), { state: "failed", left: 2 }, how);
            assert.deepEqual([players.get(wren.id).agecheck, players.get(wren.id).attempts.count, passed], [null, 1, []], how);

            // (The session's over: the same answer isn't asked for again, replayed)
            provider.answer("fake-1", { state: "passed", over: 16, reference: provider.begun[0].reference });
            await assert.rejects(() => ages.status(wren.id), refused("age-session"), how);
            assert.equal(players.get(wren.id).agecheck, null, how);
        }

        // A pass taken once isn't there to take twice; and no one's session is another's
        const { ages, players, provider, wren } = await checks();
        const ash = someone("Ash");

        await players.seen(ash);
        await ages.begin(wren.id, 16);
        await assert.rejects(() => ages.status(ash.id), refused("age-session"));
        provider.answer("fake-1", { state: "passed" });
        assert.equal((await ages.status(wren.id)).state, "passed");
        await assert.rejects(() => ages.status(wren.id), refused("age-session"));
        assert.equal(players.get(ash.id).agecheck, null);
    });

    it("runs out: a session not finished in half an hour is over, the try spent; three tries in thirty days and no more, a fourth once the thirty are up", async () => {
        const { ages, players, provider, clock, wren } = await checks();

        await ages.begin(wren.id, 16);
        clock.now += AGECHECK.sessionMinutes * 60000 - 1;
        assert.deepEqual(await ages.status(wren.id), { state: "pending" });
        clock.now += 1;
        provider.answer("fake-1", { state: "passed" });
        assert.deepEqual(await ages.status(wren.id), { state: "failed", left: 2 }, "(too late, though the provider says yes)");
        assert.equal(players.get(wren.id).agecheck, null);

        // The second and third; the fourth refused, saying none are left
        assert.equal((await ages.begin(wren.id, 16)).left, 1);
        assert.equal((await ages.begin(wren.id, 16)).left, 0);
        await assert.rejects(() => ages.begin(wren.id, 16), (thrown) => refused("age-tries")(thrown) && thrown.left === 0);
        assert.equal(provider.begun.length, 3, "(the provider isn't asked, or paid, for a fourth)");
        assert.equal(players.get(wren.id).attempts.count, 3);

        // A moment short of thirty days from the first: still none. Thirty days: three again
        clock.now = players.get(wren.id).attempts.since + AGECHECK.days * DAY - 1;
        await assert.rejects(() => ages.begin(wren.id, 16), refused("age-tries"));
        clock.now += 1;
        assert.equal((await ages.begin(wren.id, 16)).left, 2);
        assert.equal(players.get(wren.id).attempts.count, 1);
    });

    it("needs a player the server knows by their identity, a provider that answers, and a page of the provider's own over TLS", async () => {
        const { ages, players, wren } = await checks();

        await assert.rejects(() => ages.begin(someone("Stranger").id, 16), refused("no-identity"));

        // (An age out of range asked for: the nearest it checks for; none said: the oldest)
        assert.equal((await ages.begin(wren.id, 99)).threshold, 21);
        assert.equal((await ages.begin(wren.id, undefined)).threshold, 21);

        for (const provider of [
            { name: "down", begin: async () => Promise.reject(new Error("ECONNREFUSED")), status: async () => ({}) },
            { name: "plain", begin: async () => ({ id: "x", url: "http://agecheck.invalid/x" }), status: async () => ({}) },
            { name: "script", begin: async () => ({ id: "x", url: "javascript:alert(1)" }), status: async () => ({}) },
            { name: "empty", begin: async () => ({}), status: async () => ({}) },
        ]) {
            const mine = await checks({ provider });

            await assert.rejects(() => mine.ages.begin(mine.wren.id, 16), refused("age-provider"), provider.name);
            assert.equal(mine.players.get(mine.wren.id).attempts, null, `${provider.name}: no try spent on a provider that didn't answer`);
        }

        // (Out of reach while it's asked how it went: the session kept, to ask again)
        let down = true;
        const flaky = fakeProvider();
        const real = flaky.status.bind(flaky);

        flaky.status = async (id) => (down ? Promise.reject(new Error("timeout")) : real(id));

        const mine = await checks({ provider: flaky });

        await mine.ages.begin(mine.wren.id, 16);
        await assert.rejects(() => mine.ages.status(mine.wren.id), refused("age-provider"));
        down = false;
        flaky.answer("fake-1", { state: "passed" });
        assert.equal((await mine.ages.status(mine.wren.id)).state, "passed");
        assert.equal(players.get(wren.id).agecheck, null, "(each server's players its own)");
    });

    it("is taken back by a moderator's check again: the pass and the tries gone, to be checked afresh", async () => {
        const { ages, players, provider, passed, wren } = await checks();

        assert.equal(ages.again(wren.id), false, "(nothing to take back)");
        await ages.begin(wren.id, 16);
        provider.answer("fake-1", { state: "passed" });
        await ages.status(wren.id);
        assert.equal(ages.again(wren.id), true);
        assert.deepEqual([players.get(wren.id).agecheck, players.get(wren.id).attempts, passed], [null, null, [wren.id, wren.id]]);
        assert.equal((await ages.begin(wren.id, 16)).left, 2);
    });
});

describe("the age check's routes (server/api.js: /agecheck)", () => {
    // A world server on loopback with a provider of the tests', Nanny Mode on for listed countries, everyone taken for the United Kingdom's
    async function serve({ provider = fakeProvider() } = {}) {
        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-agecheck-"));

        made.push(root);

        const server = await WorldServer.open(root, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, funnel: false, ...(provider ? { ageProvider: provider } : {}) });

        await server.settings.change({ setAsideMinutes: 0, nanny: "all", nannyUnknown: false });
        await server.listen(0, "127.0.0.1");
        servers.push(server);
        server.countries.country = () => "GB";

        return server;
    }

    const call = async (server, method, route, { session = null, key = null, body = null } = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.port}/api/v1${route}`, { method, headers: { ...(session ? { Authorization: `Bearer ${session}` } : key ? { Authorization: `Key ${key}`, "X-Pellagos": "manage" } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

        return { status: response.status, json: await response.json() };
    };

    // Into a world by their own identity (or a key alone), and onto its play socket: their session and their place
    async function come(server, world, secret = null) {
        const entered = await call(server, "POST", "/enter", { body: { world: world.world, key: world.playerKey, net: NET_VERSION, ...(secret ? { player: proofOf(secret, { server: server.identity.id, name: "Wren" }) } : {}) } });

        assert.equal(entered.status, 200, JSON.stringify(entered.json));

        const before = new Set(server.play.places.values());
        const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, PLAY_PROTOCOL);

        await new Promise((resolve, reject) => {
            socket.onopen = resolve;
            socket.onerror = reject;
        });
        socket.send(`enter ${world.world} ${entered.json.session}`);
        await until(() => [...server.play.places.values()].some((place) => !before.has(place)), "in the world");

        return { session: entered.json.session, socket, place: [...server.play.places.values()].find((place) => !before.has(place)) };
    }

    it("lifts Nanny Mode at once for a player who passes, in the world they're in, with no restart; and a check again by the admin puts them back", async () => {
        const provider = fakeProvider();
        const server = await serve({ provider });
        const world = await server.createWorld({ name: "Checked", seed: 5, race: "human" });
        const secret = newPlayerSecret();
        const id = playerIdOf(publicKeyOf(secret));
        const { session, socket, place } = await come(server, world, secret);

        assert.deepEqual([place.nanny, place.nannyWhy], [true, { why: "country", code: "GB", threshold: 16 }]);
        assert.deepEqual((await call(server, "GET", "/agecheck")).json, { offered: true, provider: "fake" });

        // Begun, for the age the United Kingdom's rules name; nothing the game sends is taken for a result
        const begun = await call(server, "POST", "/agecheck/begin", { session });

        assert.equal(begun.status, 200, JSON.stringify(begun.json));
        assert.deepEqual({ ...begun.json, until: null }, { url: "https://agecheck.invalid/fake-1", provider: "fake", threshold: 16, left: 2, until: null });
        assert.deepEqual((await call(server, "POST", "/agecheck/status", { session, body: { state: "passed", threshold: 16, passed: true } })).json, { state: "pending" });
        assert.equal(place.nanny, true);

        // Passed at the provider: asked after, lifted where they stand
        provider.answer("fake-1", { state: "passed" });
        assert.deepEqual((await call(server, "POST", "/agecheck/status", { session })).json, { state: "passed", threshold: 16 });
        assert.deepEqual([place.nanny, place.nannyWhy], [false, null]);
        assert.deepEqual(server.access.players.get(id).agecheck, { passed: true, threshold: 16, date: new Date().toISOString().slice(0, 10), provider: "fake" });

        // (Asked after again: no session; begun again: passed already)
        assert.deepEqual([(await call(server, "POST", "/agecheck/status", { session })).status, (await call(server, "POST", "/agecheck/status", { session })).json.error], [409, "age-session"]);
        assert.equal((await call(server, "POST", "/agecheck/begin", { session })).json.error, "age-passed");

        // The admin's check again: back in Nanny Mode where they stand; not for anyone without the admin key
        assert.equal((await call(server, "POST", `/server/players/${id}/agecheck/again`, { session })).status >= 400, true);
        assert.deepEqual((await call(server, "POST", `/server/players/${id}/agecheck/again`, { key: server.adminKey })).json, { again: true });
        assert.equal(place.nanny, true);
        assert.equal(server.access.players.get(id).agecheck, null);
        socket.close();
    });

    it("refuses whoever shows no session, or came in with no identity of their own; and says none's offered on a server with no provider", async () => {
        const server = await serve();
        const world = await server.createWorld({ name: "Unchecked", seed: 6, race: "human" });

        assert.equal((await call(server, "POST", "/agecheck/begin")).status >= 400, true);
        assert.equal((await call(server, "POST", "/agecheck/begin", { session: "not-a-session" })).status >= 400, true);

        const { session, socket } = await come(server, world);
        const none = await call(server, "POST", "/agecheck/begin", { session });

        assert.deepEqual([none.status, none.json.error, none.json.message], [403, "no-identity", AGE_REFUSED["no-identity"]]);
        socket.close();

        const bare = await serve({ provider: null });
        const there = await bare.createWorld({ name: "Bare", seed: 7, race: "human" });
        const mine = await come(bare, there, newPlayerSecret());

        assert.deepEqual((await call(bare, "GET", "/agecheck")).json, { offered: false, provider: null });

        const refusal = await call(bare, "POST", "/agecheck/begin", { session: mine.session });

        assert.deepEqual([refusal.status, refusal.json.error, refusal.json.message], [404, "no-provider", "Age checks aren't set up on this server yet, so Nanny Mode can't be turned off here for now."]);
        assert.equal(mine.place.nanny, true);
        mine.socket.close();
    });
});
