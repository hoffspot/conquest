// The game's side of world servers (generated/world_server_plan.md §7.6, §8.1, §9.5, §15 S3):
// addresses as players type them, invite links, the servers it remembers (and carries to another
// page as a code), the server's identity checked as the server makes it and pinned, nothing secret
// sent to a server that isn't the one pinned, and a world made, entered and played in, over real
// sockets to a world server in this process
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { addressOf, inviteLink, inviteOf, KnownServers, ServerClient, ServerRefusal, SERVERS_KEY } from "../client/js/app/servers.js";
import { fingerprintOf, newNonce, verifyIdentity } from "../client/js/core/identity.js";
import { fingerprintOf as serverFingerprintOf } from "../server/access/identity.js";
import { WorldServer } from "../server/world-server.js";

// Short codes hashed cheaply in the tests
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword" });

// A link that notices a drop quickly, and gives up on coming back soon
const QUICK = Object.freeze({ ping: 200, patience: 1000, first: 50, most: 200, jitter: 0, within: 5000 });

const made = [];
const running = [];

after(async () => {
    await Promise.all(running.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 30000) {
    const end = Date.now() + ms;

    while (!test()) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

// localStorage, in memory
function memory() {
    const kept = new Map();

    return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key), kept };
}

// A world server listening on loopback: { server, address (as the game knows it), adminKey }
async function serve() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-servers-"));

    made.push(folder);

    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });

    await server.settings.change({ setAsideMinutes: 0 });
    await server.listen(0, "127.0.0.1");
    running.push(server);

    return { server, address: addressOf(`127.0.0.1:${server.port}`), adminKey: server.adminKey };
}

// fetch, counting what's asked of each API path
function counting() {
    const asked = [];

    return { asked, fetch: (url, options) => (asked.push(`${options?.method ?? "GET"} ${new URL(url).pathname}`), fetch(url, options)) };
}

describe("addresses and invites (app/servers.js)", () => {
    it("takes an address as a player types it, and refuses what isn't one", () => {
        assert.deepEqual(addressOf("studio-mac.local"), { host: "studio-mac.local", port: 8480, secure: false, key: "studio-mac.local:8480" });
        assert.equal(addressOf("192.168.1.20:9000").key, "192.168.1.20:9000");
        assert.equal(addressOf("[fd00::20]:8480").key, "[fd00::20]:8480");
        assert.equal(addressOf("fd00::20").key, "[fd00::20]:8480");
        assert.equal(addressOf("  Studio-Mac.Local.  ").key, "studio-mac.local:8480");
        assert.deepEqual(addressOf("https://pellagos.example.org/whatever?x#y"), { host: "pellagos.example.org", port: 443, secure: true, key: "pellagos.example.org:443" });
        assert.equal(addressOf("ws://10.0.0.5:8480/play").key, "10.0.0.5:8480");

        for (const junk of ["", "   ", "http://", "a b", "host:99999", "host:0", "-bad-.com", "[zz::1]", "host:port", "<script>"]) {
            assert.equal(addressOf(junk), null, JSON.stringify(junk));
        }
    });

    it("carries the server, its id, the world and a key in an invite link's fragment, and reads them back", () => {
        const address = addressOf("studio-mac.local:8480");
        const link = inviteLink("http://studio-mac.local:8480/?x=1#old", { address, id: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE", world: "abcdefghij", key: "K7Q2M-XD4RT-AAAAA-BBBBB-CCCCC-DDDDD" });

        assert.ok(link.startsWith("http://studio-mac.local:8480/?x=1#server="), link);
        assert.deepEqual(inviteOf(link), { address, id: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE", world: "abcdefghij", key: "K7Q2M-XD4RT-AAAAA-BBBBB-CCCCC-DDDDD", code: null });
        assert.equal(inviteOf(inviteLink("https://hoffspot.github.io/conquest/", { address: addressOf("https://far.example.org:8480"), world: "w", code: "ABCD1234" })).address.secure, true);
        assert.equal(inviteOf("https://hoffspot.github.io/conquest/"), null);
        assert.equal(inviteOf("#server=not%20an%20address"), null);
    });
});

describe("the server's identity, as the game checks it (core/identity.js)", () => {
    it("makes the server's own fingerprints, and checks a proof as Node does", async () => {
        for (let k = 0; k < 50; k++) {
            const publicKey = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;

            assert.equal(fingerprintOf(publicKey), serverFingerprintOf(publicKey));
        }

        const { server } = await serve();
        const nonce = newNonce();
        const answer = server.identity.answer(nonce);

        assert.ok(verifyIdentity({ ...answer, nonce }));
        assert.equal(verifyIdentity({ ...answer, nonce: newNonce() }), false, "another nonce");
        assert.equal(verifyIdentity({ ...answer, id: "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", nonce }), false, "another id");
        assert.equal(verifyIdentity({ ...answer, signature: answer.signature.replace(/^./, (c) => (c === "A" ? "B" : "A")), nonce }), false, "a spoilt signature");
        assert.equal(verifyIdentity({ id: answer.id, publicKey: "!!", signature: "??", nonce }), false, "nonsense");
    });
});

describe("the servers the game remembers (app/servers.js KnownServers)", () => {
    it("keeps servers and what they hold for each world, and carries them to another page as a code", () => {
        const storage = memory();
        const servers = new KnownServers(storage);
        const address = addressOf("studio-mac.local");

        servers.remember(address, { id: "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE", name: "Studio" });
        servers.keepWorld(address.key, "abcdefghij", { name: "Thornwick", key: "KEY", ticket: "TICKET", player: "P1", role: "player" });
        assert.equal(new KnownServers(storage).get(address.key).worlds.abcdefghij.ticket, "TICKET", "kept in storage");

        const code = servers.export();
        const elsewhere = new KnownServers(memory());

        assert.deepEqual(elsewhere.import(code), { added: [address.key], merged: [], conflicts: [] });
        assert.equal(elsewhere.get(address.key).worlds.abcdefghij.key, "KEY");
        assert.equal(elsewhere.import("not a code"), null);

        // (A server known by another id keeps its pin: a code doesn't move one)
        const other = new KnownServers(memory());

        other.remember(address, { id: "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ" });
        assert.deepEqual(other.import(code).conflicts, [address.key]);
        assert.equal(other.get(address.key).id, "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ");
        assert.equal(other.get(address.key).worlds.abcdefghij, undefined);

        servers.forget(address.key);
        assert.equal(new KnownServers(storage).get(address.key), null);
        assert.ok(storage.kept.has(SERVERS_KEY));
    });
});

describe("a world on a world server, from the game (app/servers.js ServerClient, app/together.js)", () => {
    it("pins the server's id, makes a world, enters it as its owner, plays in it, and comes back by its ticket", async () => {
        const { server, address, adminKey } = await serve();
        const servers = new KnownServers(memory());
        const client = new ServerClient(servers.remember(address), { servers, timing: QUICK });

        // (Its card: anyone may ask)
        const card = await client.status();

        assert.equal(card.server.id, server.identity.id);
        assert.equal(servers.get(address.key).id, null, "nothing's pinned until it's proved");

        const made = await client.makeWorld(adminKey, { name: "Thornwick", race: "human", heroes: "kept", seed: 3 });

        assert.equal(servers.get(address.key).id, server.identity.id, "pinned when it proved itself");
        assert.equal(servers.get(address.key).worlds[made.world].key, made.ownerKey);

        const entered = await client.enter({ world: made.world });

        assert.equal(entered.role, "owner");
        assert.equal(entered.card.heroes, "kept");
        assert.ok(entered.ticket);
        assert.equal(servers.get(address.key).worlds[made.world].ticket, entered.ticket, "its ticket kept");

        let waited = null;
        const { joining, close } = await client.play({ world: made.world, session: entered.session, character: { hero: HERO }, hero: "new", onWaiting: (n) => (waited = n) });
        const heard = {};

        joining.onWelcome = (welcome) => (heard.welcome = welcome);
        joining.onRefused = (reason) => (heard.refused = reason);
        await until(() => heard.welcome || heard.refused, "the welcome");
        assert.equal(heard.refused, undefined);
        assert.equal(heard.welcome.id, `${entered.player}.1`);
        assert.equal(waited, null, "nothing to wait for");
        close();

        // (Back again, by what's remembered: the same player, the same hero kept for them)
        await until(() => server.registry.lifeOf(made.world).life === "stored", "set aside", 60000);

        const again = new ServerClient(servers.get(address.key), { servers, timing: QUICK });
        const back = await again.enter({ world: made.world });

        assert.equal(back.player, entered.player);
        assert.deepEqual(
            back.heroes.map(({ slot, name }) => [slot, name]),
            [[1, "Ada"]],
        );
    });

    it("trades a short code for a world and its key; and sends nothing secret to a server that isn't the one pinned", async () => {
        const { server, address, adminKey } = await serve();
        const servers = new KnownServers(memory());
        const owner = new ServerClient(servers.remember(address), { servers, timing: QUICK });
        const made = await owner.makeWorld(adminKey, { name: "Ashby", race: "human", seed: 3 });
        const entered = await owner.enter({ world: made.world });
        const { codes, keys } = await owner.keys(made.world, entered.session);

        assert.equal(codes.length, 0);

        const players = keys.find((one) => one.role === "player");
        const { code } = await owner.makeCode(made.world, entered.session, { key: players.id });

        // (Another player's game: the code, once)
        const theirs = new KnownServers(memory());
        const guest = new ServerClient(theirs.remember(address), { servers: theirs, timing: QUICK });
        const redeemed = await guest.redeem(code);

        assert.equal(redeemed.world, made.world);
        assert.equal(redeemed.role, "player");
        assert.equal(theirs.get(address.key).worlds[made.world].key, made.playerKey);
        await assert.rejects(new ServerClient(theirs.get(address.key), { timing: QUICK }).redeem(code), (error) => error instanceof ServerRefusal && error.error === "code");

        // (Pinned to another server's id: proved not to be it, and no key or ticket sent)
        const { fetch, asked } = counting();
        const pinned = new KnownServers(memory());
        const record = pinned.remember(address, { id: "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA" });

        pinned.keepWorld(address.key, made.world, { key: made.playerKey });
        await assert.rejects(new ServerClient(record, { servers: pinned, fetch, timing: QUICK }).enter({ world: made.world }), (error) => error.error === "identity");
        assert.deepEqual(asked, [], "nothing asked of its API");
        assert.equal(pinned.get(address.key).id, "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", "the pin's kept");

        // (An invite's id that isn't the server's: the same)
        await assert.rejects(new ServerClient(theirs.remember(addressOf(`localhost:${server.port}`)), { expect: "BBBBB-BBBBB-BBBBB-BBBBB-BBBBB", fetch, timing: QUICK }).redeem("ABCD1234"), (error) => error.error === "identity");
        assert.deepEqual(asked, []);
    });

    it("is told it's sent out, and why; and gives a place up that the server no longer keeps", async () => {
        const { server, address, adminKey } = await serve();
        const servers = new KnownServers(memory());
        const client = new ServerClient(servers.remember(address), { servers, timing: QUICK });
        const made = await client.makeWorld(adminKey, { name: "Fenwick", race: "human", heroes: "brought", seed: 3 });
        const entered = await client.enter({ world: made.world });

        // (Sent out: told why)
        let closed = null;
        const first = await client.play({ world: made.world, session: entered.session, character: { hero: HERO }, onClosed: (reason) => (closed = reason) });

        await until(() => server.play.places.size === 1, "in");
        server.closePlaces(() => true, "kicked");
        await until(() => closed, "sent out");
        assert.equal(closed, "kicked");
        first.close();

        // (Its link dropped, and its place not kept: given up, not tried for ever)
        let dropped = false;
        const lost = [];
        const second = await client.play({ world: made.world, session: (await client.enter({ world: made.world })).session, character: { hero: HERO }, onLink: (state) => lost.push(state), onDrop: () => (dropped = true) });

        second.link.place.line = second.link.place.line.replace(/\S+$/, "not-its-token");
        second.link.socket.close(4000);
        await until(() => dropped, "given up");
        assert.deepEqual(lost, ["lost"]);
    });
});
