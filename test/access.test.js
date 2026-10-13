// Who may come into the world server's worlds (generated/world_server_plan.md §7, §13): the keys,
// short codes, return tickets and sessions it hands out and how it keeps them (never as they
// are), the parts players play, bans, the limits on how much it takes and from whom, the access
// hooks every check goes through, and the server's own identity, proved before anything secret's
// sent
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { isHome, plainAddress } from "../server/access/addresses.js";
import { fingerprintOf, IDENTITY_FILE, ServerIdentity, verifyIdentity } from "../server/access/identity.js";
import { Access } from "../server/access/index.js";
import { AddressBlocks, CodeGuard, Counts, LIMITS, Rate } from "../server/access/limits.js";
import { ACTIONS } from "../server/access/policy.js";
import { SECRETS_FILE, ServerSecrets } from "../server/access/secrets.js";
import { SESSION, Sessions } from "../server/access/sessions.js";
import { crockfordOf, hashOf, longKeyOf, newLongKey, newShortCode, newSealKey, newToken, readable, sameHash, seal, shortCodeOf, unseal } from "../server/access/tokens.js";
import { ACCESS_FILE, ADDRESS_BAN_HOURS, MOST_KEYS } from "../server/access/world.js";
import { NewerDataError } from "../server/storage/versions.js";

const made = [];

// A new empty folder of its own, for a test (all of them taken away after)
async function scratch() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-access-"));

    made.push(folder);

    return folder;
}

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const modeOf = async (file) => (await stat(file)).mode & 0o777;
const posix = process.platform !== "win32";

// Short codes hashed cheaply in the tests (the server's own cost takes 128 MiB and a good part of a second)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const HOME = "192.168.1.20";
const AWAY = "203.0.113.7";

// A server's access with one world (or more), on a clock the test moves on (ms)
async function server({ worlds = ["keptworld1"] } = {}) {
    const root = await scratch();
    const time = { now: Date.parse("2026-10-12T20:00:00Z") };
    const clock = () => time.now;
    const { access, adminKey } = await Access.open(root, { clock, cost: CHEAP });

    for (const world of worlds) {
        await access.addWorld(world, path.join(root, "worlds", world));
    }

    const events = [];

    access.policy.listeners.push((event, detail) => events.push([event, detail]));

    return { root, time, access, adminKey, events, policy: access.policy };
}

// Into a world with what's shown: { principal, why } if refused, else what Access.enter gives
async function enter(access, request) {
    const { principal } = access.policy.identify({ from: "home", address: HOME, ...request });
    const allowed = access.policy.allows(principal, "world.enter", { world: request.world, meta: request.meta });

    if (!allowed.yes) {
        return { refused: allowed.why, principal };
    }

    return { ...(await access.enter(principal)), principal };
}

describe("keys, codes and tokens, and how they're kept (server/access/tokens.js)", () => {
    it("makes long keys of 30 Crockford characters in six groups, named by their first four, read forgivingly", () => {
        const { text, id } = newLongKey();

        assert.match(text, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){5}$/);
        assert.equal(id, text.slice(0, 4));
        assert.deepEqual(longKeyOf(text.toLowerCase().replace(/-/g, " ")), { id, plain: text.replace(/-/g, "") });

        // (O read as 0, I and L as 1; anything else in it, or the wrong length, isn't a key)
        assert.equal(readable("ko2m9-xdirt-al"), "K02M9XD1RTA1");
        assert.equal(readable("k-o2 m9"), "K02M9");
        assert.equal(readable("KQ2M9U"), null);
        assert.equal(longKeyOf("KQ2M9-XD4RT"), null);
        assert.equal(longKeyOf(42), null);

        const code = newShortCode();

        assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
        assert.equal(shortCodeOf(code.toLowerCase()), code.replace("-", ""));
        assert.equal(shortCodeOf("ABC"), null);
    });

    it("writes bytes in Crockford's base 32, five bits a character", () => {
        assert.equal(crockfordOf(Buffer.from([0xff])), "ZW");
        assert.equal(crockfordOf(Buffer.from([0, 0, 0, 0, 0])), "00000000");
        assert.equal(crockfordOf(Buffer.from("hello")), "D1JPRV3F");
        assert.equal(crockfordOf(Buffer.from("hello"), 4), "D1JP");
    });

    it("keeps tokens as their hash, compared in constant time, and seals what has to be shown again", () => {
        const token = newToken();

        assert.match(token, /^[A-Za-z0-9_-]{22}$/);
        assert.notEqual(newToken(), token);
        assert.ok(sameHash(hashOf(token), hashOf(token)));
        assert.ok(!sameHash(hashOf(token), hashOf(newToken())));
        assert.ok(!sameHash(hashOf(token), "short"));

        const key = newSealKey();
        const sealed = seal("KQ2M9-XD4RT-AH3PW-C8NVB-7J2KQ-M9XDA", key);

        assert.ok(!sealed.includes("KQ2M9"));
        assert.equal(unseal(sealed, key), "KQ2M9-XD4RT-AH3PW-C8NVB-7J2KQ-M9XDA");
        assert.equal(unseal(sealed, newSealKey()), null);

        // (Tampered with: it won't open)
        const [iv, tag, text] = sealed.split(".");

        assert.equal(unseal([iv, tag, `A${text.slice(1)}`].join("."), key), null);
        assert.equal(unseal("nonsense", key), null);
    });
});

describe("the server's own secrets (server/access/secrets.js)", () => {
    it("makes the admin key at the first start, shows it then alone, and keeps only what proves it", async () => {
        const root = await scratch();
        const first = await ServerSecrets.open(root, { cost: CHEAP });

        assert.ok(longKeyOf(first.adminKey));
        assert.ok(first.secrets.isAdmin(first.adminKey));
        assert.ok(first.secrets.isAdmin(first.adminKey.toLowerCase().replace(/-/g, "")));
        assert.ok(!first.secrets.isAdmin(newLongKey().text));

        const file = path.join(root, SECRETS_FILE);
        const kept = await readFile(file, "utf8");

        assert.ok(!kept.includes(first.adminKey) && !kept.includes(first.adminKey.replace(/-/g, "")), "the admin key is never written as it is");

        if (posix) {
            assert.equal(await modeOf(file), 0o600);
        }

        // (Started again: no new key, the old one still works; a new one, and the old doesn't)
        const again = await ServerSecrets.open(root, { cost: CHEAP });

        assert.equal(again.adminKey, null);
        assert.ok(again.secrets.isAdmin(first.adminKey));

        const fresh = await again.secrets.newAdminKey();

        assert.ok(again.secrets.isAdmin(fresh));
        assert.ok(!again.secrets.isAdmin(first.adminKey));
        assert.ok((await ServerSecrets.open(root, { cost: CHEAP })).secrets.isAdmin(fresh));
    });

    it("issues creator keys, labelled, shown once, and revoked", async () => {
        const { secrets } = await ServerSecrets.open(await scratch(), { cost: CHEAP });
        const { key, creator } = await secrets.issueCreator("  Sam's\nlaptop  ");

        assert.equal(creator.label, "Sam's laptop");
        assert.deepEqual(secrets.creatorOf(key), creator);
        assert.equal(secrets.creatorOf(newLongKey().text), null);
        assert.ok(!JSON.stringify(secrets.creators()).includes("hash"));
        assert.ok(await secrets.revokeCreator(creator.id));
        assert.equal(secrets.creatorOf(key), null);
        assert.ok(!(await secrets.revokeCreator(creator.id)));
    });

    it("refuses secrets a newer server kept, saying which it needs", async () => {
        const root = await scratch();

        await ServerSecrets.open(root, { cost: CHEAP });

        const file = path.join(root, SECRETS_FILE);
        const kept = JSON.parse(await readFile(file, "utf8"));

        await writeFile(file, JSON.stringify({ ...kept, secretsVersion: 99, writtenBy: "9.0.0" }));
        await assert.rejects(ServerSecrets.open(root, { cost: CHEAP }), (error) => error instanceof NewerDataError && /9\.0\.0/.test(error.message));
    });
});

describe("into a world with a key, and back with a ticket (server/access/world.js, index.js)", () => {
    it("gives a new player a ticket and a session; brings them back by key and ticket, or the ticket alone, as the same player", async () => {
        const { access, events } = await server();
        const { key } = await access.issueKey("keptworld1", { label: "Tuesday group", role: "player" });

        const first = await enter(access, { world: "keptworld1", key });

        assert.equal(first.role, "player");
        assert.match(first.ticket, /^[A-Za-z0-9_-]{22}$/);
        assert.match(first.session, /^[A-Za-z0-9_-]{22}$/);
        assert.equal(access.world("keptworld1").key(key.slice(0, 4)).used, 1);

        const back = await enter(access, { world: "keptworld1", key, ticket: first.ticket });

        assert.equal(back.player, first.player);
        assert.equal(back.ticket, null, "a ticket's given once");
        assert.equal((await enter(access, { world: "keptworld1", ticket: first.ticket })).player, first.player);

        // (The session says who they are, in that world alone)
        const { principal } = access.policy.identify({ world: "keptworld1", session: first.session, from: "home" });

        assert.equal(principal.player.id, first.player);
        assert.equal(access.policy.identify({ world: "keptworld2", session: first.session }).principal.kind, "refused");

        // (Nothing shown, a key that isn't the world's, or a ticket that isn't: refused, "key")
        assert.equal((await enter(access, { world: "keptworld1" })).refused, "key");
        assert.equal((await enter(access, { world: "keptworld1", key: newLongKey().text })).refused, "key");
        assert.equal((await enter(access, { world: "keptworld1", ticket: newToken() })).refused, "key");
        assert.equal((await enter(access, { world: "nosuchworl", key })).refused, "no-world");

        assert.deepEqual(events.filter(([event]) => event === "entered").map(([, detail]) => [detail.label, detail.new]), [["Tuesday group", true], ["Tuesday group", false], ["Tuesday group", false]]);
    });

    it("keeps no key, ticket or session as it is, and still knows them after a restart", async () => {
        const { root, access, time } = await server();
        const { key } = await access.issueKey("keptworld1", { label: "Friends", role: "trusted" });
        const first = await enter(access, { world: "keptworld1", key });
        const kept = await readFile(path.join(root, "worlds", "keptworld1", ACCESS_FILE), "utf8");

        for (const secret of [key, key.replace(/-/g, ""), first.ticket, first.session]) {
            assert.ok(!kept.includes(secret), `${secret} isn't kept as it is`);
        }

        if (posix) {
            assert.equal(await modeOf(path.join(root, "worlds", "keptworld1", ACCESS_FILE)), 0o600);
        }

        // (Started again: keys and tickets work; sessions were in memory, and are gone)
        const { access: again } = await Access.open(root, { clock: () => time.now, cost: CHEAP });

        await again.addWorld("keptworld1", path.join(root, "worlds", "keptworld1"));

        const back = await enter(again, { world: "keptworld1", key, ticket: first.ticket });

        assert.equal(back.player, first.player);
        assert.equal(back.role, "trusted");
        assert.equal(again.policy.identify({ world: "keptworld1", session: first.session }).principal.kind, "refused");

        // (Its owner can be shown a key again: it's sealed, not hashed alone)
        assert.equal(again.world("keptworld1").showKey(key.slice(0, 4)), key);
    });

    it("ends the sessions of a revoked key, and lets its players back only with a key that works: the same players, by their tickets", async () => {
        const { access, events } = await server();
        const { key } = await access.issueKey("keptworld1", { label: "Old", role: "player" });
        const ada = await enter(access, { world: "keptworld1", key });
        const { revoked, ended } = await access.revokeKey("keptworld1", key.slice(0, 4), { by: "owner" });

        assert.equal(revoked.label, "Old");
        assert.deepEqual(ended.map((session) => session.player), [ada.player]);
        assert.equal(access.policy.identify({ world: "keptworld1", session: ada.session }).principal.kind, "refused");
        assert.equal((await enter(access, { world: "keptworld1", key, ticket: ada.ticket })).refused, "key");
        assert.equal((await enter(access, { world: "keptworld1", ticket: ada.ticket })).refused, "key");

        const { key: fresh } = await access.issueKey("keptworld1", { label: "New", role: "player" });

        assert.equal((await enter(access, { world: "keptworld1", key: fresh, ticket: ada.ticket })).player, ada.player);
        assert.ok(events.some(([event, detail]) => event === "keyRevoked" && detail.label === "Old" && detail.by === "owner"));
    });

    it("replaces a key: the old stops working, the new has its label and part, and its players' sessions end", async () => {
        const { access } = await server();
        const { key } = await access.issueKey("keptworld1", { label: "Raid night", role: "trusted" });
        const ada = await enter(access, { world: "keptworld1", key });
        const replaced = await access.replaceKey("keptworld1", key.slice(0, 4));

        assert.notEqual(replaced.key, key);
        assert.equal(replaced.record.label, "Raid night");
        assert.equal(replaced.record.role, "trusted");
        assert.deepEqual(replaced.ended.map((session) => session.player), [ada.player]);
        assert.equal(access.world("keptworld1").key(key.slice(0, 4)).replacedBy, replaced.record.id);
        assert.equal((await enter(access, { world: "keptworld1", key })).refused, "key");

        const back = await enter(access, { world: "keptworld1", key: replaced.key, ticket: ada.ticket });

        assert.equal(back.player, ada.player);
        assert.equal(back.role, "trusted");
        assert.equal((await access.replaceKey("keptworld1", key.slice(0, 4))).record, null);
    });

    it("lets in as many new players as a key's uses, and none after its expiry; returning players come back", async () => {
        const { access, time } = await server();
        const once = await access.issueKey("keptworld1", { label: "One", uses: 1 });
        const ada = await enter(access, { world: "keptworld1", key: once.key });

        assert.equal((await enter(access, { world: "keptworld1", key: once.key })).refused, "key");
        assert.equal((await enter(access, { world: "keptworld1", key: once.key, ticket: ada.ticket })).player, ada.player);

        const day = await access.issueKey("keptworld1", { label: "Tonight", expires: new Date(time.now + 3600000) });
        const syl = await enter(access, { world: "keptworld1", key: day.key });

        time.now += 3600000;
        assert.equal((await enter(access, { world: "keptworld1", key: day.key })).refused, "key");
        assert.equal((await enter(access, { world: "keptworld1", key: day.key, ticket: syl.ticket })).refused, "key");
        assert.equal((await enter(access, { world: "keptworld1", ticket: syl.ticket })).refused, "key");

        // (What can't be a key's: refused with the reason)
        assert.match((await access.issueKey("keptworld1", { role: "king" })).reason, /no part/);
        assert.match((await access.issueKey("keptworld1", { uses: 0 })).reason, /one player/);
        assert.match((await access.issueKey("keptworld1", { expires: new Date(time.now - 1) })).reason, /to come/);
    });

    it(`holds a world to ${MOST_KEYS} keys that work`, async () => {
        const { access } = await server();

        for (let k = 0; k < MOST_KEYS; k++) {
            assert.ok((await access.issueKey("keptworld1", { label: `Key ${k}` })).key);
        }

        assert.match((await access.issueKey("keptworld1", {})).reason, /10 keys/);

        const [first] = access.world("keptworld1").keys();

        await access.revokeKey("keptworld1", first.id);
        assert.ok((await access.issueKey("keptworld1", {})).key);
        assert.equal(access.world("keptworld1").working().length, MOST_KEYS);
    });

    it(`bans a player by their ticket for good and their address for ${ADDRESS_BAN_HOURS} hours, ending their sessions; and lifts it`, async () => {
        const { access, time } = await server();
        const { key } = await access.issueKey("keptworld1", { label: "Everyone" });
        const ada = await enter(access, { world: "keptworld1", key, address: AWAY, from: "internet" });
        const { banned, ended } = await access.ban("keptworld1", ada.player, { by: "owner" });

        assert.ok(banned);
        assert.deepEqual(ended.map((session) => session.player), [ada.player]);
        assert.equal((await enter(access, { world: "keptworld1", key, ticket: ada.ticket })).refused, "banned");

        // (A fresh key from the same address: banned too, for a day; from another, let in)
        assert.equal((await enter(access, { world: "keptworld1", key, address: AWAY, from: "internet" })).refused, "banned");
        assert.ok((await enter(access, { world: "keptworld1", key, address: "198.51.100.9", from: "internet" })).session);

        time.now += ADDRESS_BAN_HOURS * 3600000;
        assert.ok((await enter(access, { world: "keptworld1", key, address: AWAY, from: "internet" })).session);
        assert.equal((await enter(access, { world: "keptworld1", key, ticket: ada.ticket })).refused, "banned");

        assert.ok(await access.unban("keptworld1", ada.player));
        assert.equal((await enter(access, { world: "keptworld1", key, ticket: ada.ticket })).player, ada.player);
        assert.equal(access.world("keptworld1").player(ada.player).role, "player");
    });

    it("reissues a lost ticket: the old no longer works", async () => {
        const { access } = await server();
        const { key } = await access.issueKey("keptworld1", {});
        const ada = await enter(access, { world: "keptworld1", key });
        const ticket = await access.world("keptworld1").reissueTicket(ada.player);

        assert.equal((await enter(access, { world: "keptworld1", ticket })).player, ada.player);
        assert.equal((await enter(access, { world: "keptworld1", ticket: ada.ticket })).refused, "key");
    });
});

describe("short codes (server/access/index.js redeem)", () => {
    it("trades a code once for the world and its key, and refuses it after, the same whatever's wrong", async () => {
        const { access, time } = await server();
        const { key } = await access.issueKey("keptworld1", { label: "Table" });
        const { code, record } = await access.makeCode("keptworld1", { key: key.slice(0, 4) });

        assert.equal(record.uses, 1);
        assert.deepEqual(await access.redeem(code.toLowerCase().replace("-", "")), { ok: true, world: "keptworld1", key });
        assert.deepEqual(await access.redeem(code), { ok: false, reason: "code" });

        // (A wrong one, one that can't be a code, one past its time: all just "code", each holding the next back longer)
        time.now += 60000;

        const later = await access.makeCode("keptworld1", { key: key.slice(0, 4), minutes: 15 });

        time.now += 15 * 60000;
        assert.deepEqual(await access.redeem(later.code), { ok: false, reason: "code" });
    });

    it("holds back the next guess after each wrong one, doubling from a second to five minutes", async () => {
        const { access, time } = await server();
        const { key } = await access.issueKey("keptworld1", {});
        const { code } = await access.makeCode("keptworld1", { key: key.slice(0, 4), uses: 2 });

        assert.equal((await access.redeem("WRNG-C0DE")).reason, "code");
        assert.deepEqual(await access.redeem(code), { ok: false, reason: "wait", wait: 1000 });

        time.now += 1000;
        assert.equal((await access.redeem("WRNG-C0DE")).reason, "code");
        assert.equal((await access.redeem(code)).wait, 2000);

        // (Waited out, a right one goes through, and the next needn't wait)
        time.now += 2000;
        assert.ok((await access.redeem(code)).ok);
        assert.equal((await access.redeem("WRNG-C0DE")).reason, "code");

        const guard = new CodeGuard({ clock: () => 0 });

        for (let k = 0; k < 12; k++) {
            guard.failed();
        }

        assert.equal(guard.waitFor(), LIMITS.codeMost);
    });

    it(`burns every short code after ${LIMITS.codeBurn} wrong guesses in an hour`, async () => {
        const { access, time, events } = await server({ worlds: ["keptworld1", "keptworld2"] });
        const one = await access.issueKey("keptworld1", {});
        const two = await access.issueKey("keptworld2", {});
        const codes = [await access.makeCode("keptworld1", { key: one.key.slice(0, 4), minutes: 60 }), await access.makeCode("keptworld2", { key: two.key.slice(0, 4), minutes: 60, uses: 5 })];

        // (As fast as the backoff lets anyone guess: 20 fit in the hour, just)
        const started = time.now;

        for (let k = 0; k < LIMITS.codeBurn; k++) {
            time.now += access.guard.waitFor();
            assert.equal((await access.redeem("WRNG-C0DE", { address: `198.51.100.${k}` })).reason, "code");
        }

        assert.ok(time.now - started < LIMITS.codeBurnWindow);
        time.now += access.guard.waitFor();

        for (const { code } of codes) {
            time.now += access.guard.waitFor();
            assert.equal((await access.redeem(code)).reason, "code");
        }

        assert.deepEqual(events.filter(([event]) => event === "codesBurned").map(([, detail]) => detail.world), ["keptworld1", "keptworld2"]);
        assert.deepEqual(access.world("keptworld1").codes(), []);
    });

    it("refuses codes that can't be made, and forgets those of a key revoked", async () => {
        const { access } = await server();
        const { key } = await access.issueKey("keptworld1", {});
        const id = key.slice(0, 4);

        assert.match((await access.makeCode("keptworld1", { key: "NONE" })).reason, /key that works/);
        assert.match((await access.makeCode("keptworld1", { key: id, minutes: 5 })).reason, /15 to 60/);
        assert.match((await access.makeCode("keptworld1", { key: id, uses: 0 })).reason, /1 to 20/);

        const { code } = await access.makeCode("keptworld1", { key: id });

        await access.revokeKey("keptworld1", id);
        assert.equal((await access.redeem(code)).reason, "code");
    });
});

describe("the access hooks (server/access/policy.js)", () => {
    it("lets each part do what it may in a world: owners everything, trusted players invite if the world allows, players play", async () => {
        const { access, policy } = await server();
        const owner = await enter(access, { world: "keptworld1", key: (await access.issueKey("keptworld1", { role: "owner" })).key });
        const trusted = await enter(access, { world: "keptworld1", key: (await access.issueKey("keptworld1", { role: "trusted" })).key });
        const player = await enter(access, { world: "keptworld1", key: (await access.issueKey("keptworld1", { role: "player" })).key });
        const may = (who, action, target = {}) => policy.allows(who.principal, action, { world: "keptworld1", ...target }).yes;
        const open = { settings: { trustedMayInvite: true } };

        for (const action of ["world.manage", "world.delete", "key.issue", "key.revoke", "player.kick", "player.ban"]) {
            assert.ok(may(owner, action), `an owner may ${action}`);
            assert.ok(!may(player, action), `a player may not ${action}`);
        }

        assert.ok(!may(trusted, "key.issue"));
        assert.ok(may(trusted, "key.issue", { meta: open, role: "player" }));
        assert.ok(!may(trusted, "key.issue", { meta: open, role: "owner" }));
        assert.ok(!may(trusted, "key.revoke", { meta: open }));

        // (A locked world: its owners alone come in)
        assert.ok(!may(player, "world.enter", { meta: { state: "locked" } }));
        assert.equal(policy.allows(player.principal, "world.enter", { world: "keptworld1", meta: { state: "locked" } }).why, "locked");
        assert.ok(may(owner, "world.enter", { meta: { state: "locked" } }));

        // (Nobody's anything in another world; nothing but the named actions are)
        assert.ok(!may(owner, "world.manage", { world: "keptworld2" }));
        assert.ok(!policy.allows(owner.principal, "world.explode", { world: "keptworld1" }).yes);
        assert.equal(ACTIONS.length, 11);
    });

    it("takes the admin key from home alone, and creator keys to make worlds", async () => {
        const { access, policy, adminKey } = await server();
        const asked = (request) => policy.identify({ address: HOME, from: "home", ...request }).principal;

        assert.ok(policy.allows(asked({ key: adminKey }), "server.manage").yes);
        assert.ok(policy.allows(asked({ key: adminKey }), "world.create").yes);
        assert.ok(policy.allows(asked({ key: adminKey, from: "mac" }), "server.manage").yes);
        assert.deepEqual(asked({ key: adminKey, address: AWAY, from: "internet" }).kind, "refused");
        assert.equal(policy.allows(asked({ key: adminKey, address: AWAY, from: "internet" }), "server.manage").why, "home");

        // (In a world, the admin's its owner)
        const admin = await enter(access, { world: "keptworld1", key: adminKey });

        assert.equal(admin.role, "owner");
        assert.equal((await enter(access, { world: "keptworld1", ticket: admin.ticket })).player, admin.player);

        const { key } = await access.secrets.issueCreator("Sam");

        assert.ok(policy.allows(asked({ key }), "world.create").yes);
        assert.ok(!policy.allows(asked({ key }), "server.manage").yes);
        assert.ok(!policy.allows(asked({}), "world.create").yes);
        assert.equal((await enter(access, { world: "keptworld1", key })).refused, "role");

        // (A session for the creator, for /api/v1: still a creator)
        const session = access.sessionFor(asked({ key }));

        assert.equal(policy.identify({ session }).principal.kind, "creator");
        assert.ok(policy.allows(policy.identify({ session }).principal, "world.create").yes);
    });

    it("counts each refusal against its address, blocking it a while past too many", async () => {
        const { policy, access } = await server();

        for (let k = 0; k < LIMITS.strikes; k++) {
            policy.on("refused", { why: "key", address: AWAY });
        }

        assert.equal(access.blocks.blockedFor(AWAY), LIMITS.block);
        assert.equal(access.blocks.blockedFor(HOME), 0);
        assert.deepEqual(policy.admits(null, "keptworld1", { hero: {} }), { yes: true, why: null, character: { hero: {} } });
        assert.equal(policy.admits(null, "keptworld1", null).yes, false);
    });
});

describe("how much the server takes, and from whom (server/access/limits.js)", () => {
    it("counts what's open by what it's counted by, up to the most", () => {
        const counts = new Counts(LIMITS.socketsPerTicket);

        for (let k = 0; k < 3; k++) {
            assert.ok(counts.take("ticket"));
        }

        assert.ok(!counts.take("ticket"));
        assert.ok(counts.take("another"));
        counts.give("ticket");
        assert.ok(counts.take("ticket"));
        assert.equal(counts.count("ticket"), 3);
        assert.deepEqual([LIMITS.socketsPerTicket, LIMITS.socketsPerAddress, LIMITS.players], [3, 32, 64]);
    });

    it("lets through so many messages a minute, filling up again as the minute goes", () => {
        const time = { now: 0 };
        const rate = new Rate(LIMITS.chat, { clock: () => time.now });

        for (let k = 0; k < LIMITS.chat; k++) {
            assert.ok(rate.allow("ada"));
        }

        assert.ok(!rate.allow("ada"));
        assert.ok(rate.allow("syl"));
        time.now += 60000 / LIMITS.chat;
        assert.ok(rate.allow("ada"));
        assert.ok(!rate.allow("ada"));
    });

    it("blocks an address for 15 minutes after 20 strikes in 10, longer each time again within a day", () => {
        const time = { now: 0 };
        const blocks = new AddressBlocks({ clock: () => time.now });

        for (let k = 0; k < LIMITS.strikes - 1; k++) {
            assert.equal(blocks.strike(AWAY), 0);
            time.now += 1000;
        }

        // (Strikes older than the window don't count)
        time.now += LIMITS.strikeWindow;
        assert.equal(blocks.strike(AWAY), 0);

        for (let k = 0; k < LIMITS.strikes - 1; k++) {
            blocks.strike(AWAY);
        }

        assert.equal(blocks.blockedFor(AWAY), LIMITS.block);
        assert.deepEqual(blocks.blocked().map((block) => [block.address, block.times]), [[AWAY, 1]]);

        time.now += LIMITS.block;
        assert.equal(blocks.blockedFor(AWAY), 0);

        for (let k = 0; k < LIMITS.strikes; k++) {
            blocks.strike(AWAY);
        }

        assert.equal(blocks.blockedFor(AWAY), 2 * LIMITS.block);
        blocks.lift(AWAY);
        assert.equal(blocks.blockedFor(AWAY), 0);
    });
});

describe("home addresses and the internet (server/access/addresses.js)", () => {
    it("takes the Wi-Fi's private ranges, link-local and the machine itself as home; the rest, CGNAT among it, as the internet", () => {
        for (const address of ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.20", "169.254.3.4", "127.0.0.1", "::1", "fd12:3456::7", "fe80::1%en0", "::ffff:192.168.1.2", "[fd00::1]"]) {
            assert.ok(isHome(address), `${address} is home`);
        }

        for (const address of ["100.64.0.1", "100.127.255.255", "8.8.8.8", "172.32.0.1", "203.0.113.7", "2001:db8::1", "::ffff:8.8.8.8", "nonsense", null]) {
            assert.ok(!isHome(address), `${address} is the internet`);
        }

        assert.equal(plainAddress("::FFFF:10.1.2.3"), "10.1.2.3");
        assert.equal(plainAddress("FE80::1%en0"), "fe80::1");
        assert.equal(plainAddress("not an address"), null);
    });
});

describe("sessions (server/access/sessions.js)", () => {
    it("ends a session idle too long, or on too long whatever it does", () => {
        const time = { now: 0 };
        const sessions = new Sessions({ clock: () => time.now });
        const token = sessions.start({ world: "keptworld1", player: "ADA", role: "player", via: "KQ2M" });

        assert.equal(sessions.use(token).player, "ADA");
        time.now += SESSION.idle;
        assert.ok(sessions.use(token));
        time.now += SESSION.idle + 1;
        assert.equal(sessions.use(token), null);

        const busy = sessions.start({ world: "keptworld1", player: "SYL" });

        for (let at = 0; at < SESSION.most; at += SESSION.idle / 2) {
            time.now += SESSION.idle / 2;
            assert.ok(sessions.use(busy) || at + SESSION.idle / 2 >= SESSION.most);
        }

        time.now += 1;
        assert.equal(sessions.use(busy), null);
        assert.equal(sessions.use("not a token"), null);
    });
});

describe("the server's identity (server/access/identity.js)", () => {
    it("makes an Ed25519 key pair once, kept 0600, its id the public key's fingerprint", async () => {
        const root = await scratch();
        const { identity, made: first } = await ServerIdentity.open(root);
        const { identity: again, made: second } = await ServerIdentity.open(root);

        assert.ok(first && !second);
        assert.equal(again.id, identity.id);
        assert.match(identity.id, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
        assert.equal(fingerprintOf(identity.publicKey), identity.id);

        if (posix) {
            assert.equal(await modeOf(path.join(root, IDENTITY_FILE)), 0o600);
        }
    });

    it("proves itself by signing the game's nonce; any other server, nonce or id fails", async () => {
        const { identity } = await ServerIdentity.open(await scratch());
        const { identity: other } = await ServerIdentity.open(await scratch());
        const nonce = newToken();
        const answer = identity.answer(nonce);

        assert.ok(verifyIdentity({ ...answer, nonce }));
        assert.ok(!verifyIdentity({ ...answer, nonce: newToken() }));
        assert.ok(!verifyIdentity({ ...answer, nonce, id: other.id }));
        assert.ok(!verifyIdentity({ ...other.answer(nonce), nonce, id: identity.id }));
        assert.ok(!verifyIdentity({ ...answer, nonce, signature: "garbage" }));
        assert.equal(identity.answer("short"), null);
        assert.equal(identity.answer(42), null);
    });
});
