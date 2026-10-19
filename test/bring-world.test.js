// A player's own world brought to a world server ("Bring my world to the server": server/reopen.js
// importSolo, server/manage.js bringSolo, POST /worlds/bring; client/js/app/servers.js bringWorld;
// docs/SERVER.md, "Bringing your own world"): a character and their world, as the game exports
// them, made a world of the server's, with the solo world's land (its seed and home people) and
// its war carried on; their hero its first kept hero, put right as this version plays them; and
// whoever brought it its owner, coming in by the owner's key and the ticket it gave them, straight
// to their hero. Only with a key that makes worlds; refusing what isn't a character's world, one
// kept by a newer game, and a game of another version; nothing left of what's refused.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { after, before, describe, it } from "node:test";
import { exportOfKept } from "../client/js/app/character-file.js";
import { defaultHero } from "../client/js/app/heroes.js";
import { SAVE_VERSION } from "../client/js/app/save.js";
import { addressOf, BRING_FORMAT as GAME_FORMAT, KnownServers, ServerClient, ServerRefusal } from "../client/js/app/servers.js";
import { isGuid } from "../client/js/core/guid.js";
import { Host } from "../client/js/core/host.js";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { BRING_FORMAT, BRING_LIMIT } from "../server/manage.js";
import { WorldServer } from "../server/world-server.js";

// Short codes and keys hashed cheaply in the tests
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

// A world server on loopback
async function serve() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-bring-"));
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });

    made.push(folder);
    servers.push(server);
    await server.listen(0, "127.0.0.1");

    return server;
}

// Bytes sent to the API as they are (a file's), with `headers`: { status, json }
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

// The character's own id, as kept on their device (core/guid.js)
const ADA = "3f2b1c9e-7a4d-4e0f-9b21-5c6d7e8f9a0b";

// localStorage, in memory
function memory() {
    const kept = new Map();

    return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key) };
}

// A character and their world, as the game exports them: an elf archer in the land of seed 21, its
// war at turn 4, carrying something this version of the game hasn't got
function solo(name = "Ada") {
    const war = { ...new Host(buildWorld({ seed: 21, race: "elf" })).snapshot().war, turn: 4 };
    const kept = {
        hero: { ...defaultHero(), name, race: "elf", weapon: "bow", guid: ADA },
        talks: { memory: { barkeep: { talks: 1, flags: [] } }, knowledge: ["the ford"] },
        explored: { entered: [], visited: "" },
        progress: { skills: { marksman: 200 }, schools: { healing: 0, fire: 0, earth: 0, air: 0, water: 0 }, spells: [], spellXp: {}, gold: 75, pack: [{ id: "potion", quality: "common", count: 2 }, { id: "oldBlade", count: 1 }], gear: { mainHand: { id: "bow", quality: "common" } } },
        standing: {},
        followers: [],
        place: { x: 10, y: 12, facing: 1 },
    };

    return exportOfKept(kept, { seed: 21, created: "2026-10-01T09:00:00.000Z", war });
}

const sent = (character, more = {}) => gzipSync(Buffer.from(JSON.stringify({ format: BRING_FORMAT, net: NET_VERSION, name: "Ada's Vale", firstHero: "bring", character, ...more })));

describe("a player's own world brought to a world server", () => {
    let server;
    let creator;
    let character;

    before(async () => {
        server = await serve();
        creator = (await server.manage.issueCreator("Sam")).key;
        character = solo();
    });

    it("makes it a world of the server's: the solo world's land and war, its hero the first kept by whoever brought it, its owner, who comes in by the key and ticket it gave them", async () => {
        const { status, json } = await upload(server.port, "/worlds/bring", sent(character), { Authorization: `Key ${creator}` });

        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.name, "Ada's Vale");
        assert.equal(json.hero, "Ada");
        assert.equal(json.turn, 4, "its war carried on");
        assert.deepEqual(json.left, ["1 thing the game no longer has: old blade."]);
        assert.match(json.ownerKey, /^[0-9A-Z]{4}/);
        assert.match(json.playerKey, /^[0-9A-Z]{4}/);
        assert.ok(json.ticket);

        const meta = server.metaOf(json.world);

        assert.deepEqual([meta.seed, meta.race, meta.heroes, meta.firstHero, meta.creator], [21, "elf", "kept", "bring", "Sam"]);

        const stored = server.worlds.get(json.world);
        const { snapshot } = await stored.load();

        assert.equal(snapshot.war.turn, 4, "its war saved as it was");

        // (They come in as its owner, by their ticket and the owner's key, to their hero; another
        // player, by the players' key, to none of theirs yet)
        const enter = async (body) => {
            const answer = await new Promise((resolve, reject) => {
                const text = JSON.stringify({ ...body, world: json.world, net: NET_VERSION });
                const request = http.request({ host: "127.0.0.1", port: server.port, path: "/api/v1/enter", method: "POST", headers: { Host: `localhost:${server.port}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } }, (response) => {
                    const parts = [];

                    response.on("data", (part) => parts.push(part));
                    response.on("end", () => resolve(JSON.parse(Buffer.concat(parts).toString("utf8"))));
                });

                request.on("error", reject);
                request.end(text);
            });

            return answer;
        };
        const owner = await enter({ key: json.ownerKey, ticket: json.ticket });

        assert.equal(owner.role, "owner");
        assert.equal(owner.player, json.player);
        assert.equal(owner.ticket, null, "known already: no new ticket");
        assert.deepEqual(owner.heroes, [{ slot: 1, name: "Ada", race: "elf", origin: ADA }], "a copy of theirs");
        assert.deepEqual((await enter({ ticket: json.ticket })).heroes.map(({ name }) => name), ["Ada"], "by their ticket alone, too");

        const guest = await enter({ key: json.playerKey });

        assert.equal(guest.role, "player");
        assert.deepEqual(guest.heroes, []);

        // (Their hero kept as they were, put right; and the world's journal says how it came)
        const { character: hero } = JSON.parse(await readFile(path.join(stored.folder, "heroes", json.player, "1.json"), "utf8"));

        assert.equal(hero.progress.gold, 75);
        assert.deepEqual(hero.progress.pack.filter(Boolean).map(({ id }) => id), ["potion"]);
        // (A copy, the world's own: an id of its own, and theirs as its origin, as they're still on their device)
        assert.ok(isGuid(hero.hero.guid) && hero.hero.guid !== ADA);
        assert.equal(hero.hero.origin, ADA);
        assert.deepEqual(hero.talks.knowledge, ["the ford"]);
        assert.match(await readFile(path.join(stored.folder, "journal.log"), "utf8"), new RegExp(`Brought from a solo game by Sam, its owner now, as player ${json.player}: Ada, its first kept hero; its war carried on, at turn 4\\. Of Ada, as this version of the game plays them: 1 thing the game no longer has: old blade\\.`));
    });

    it("refuses what isn't a character's world, one kept by a newer game, a game of another version, too big, and anyone who can't make worlds: nothing left of them", async () => {
        const before = server.worlds.size;
        const refused = async (bytes, key = creator) => {
            const answered = await upload(server.port, "/worlds/bring", bytes, key ? { Authorization: `Key ${key}` } : {});

            return answered.json?.error ?? `status ${answered.status}`;
        };
        const someWorld = await server.createWorld({ name: "Ashby", seed: 3, race: "human" });

        assert.equal(await refused(Buffer.from("not a world")), "not-a-world");
        assert.equal(await refused(gzipSync(Buffer.from(JSON.stringify({ format: "pellagos.bring.9", character })))), "not-a-world");
        assert.equal(await refused(sent({ kind: "nobody" })), "not-a-world");
        assert.equal(await refused(sent({ ...character, saveVersion: SAVE_VERSION + 1 })), "newer");
        assert.equal(await refused(sent(character, { net: NET_VERSION + 1 })), "version");
        assert.match(await refused(Buffer.alloc(BRING_LIMIT + 1)), /^(too-big|status 413)$/);
        assert.match(await refused(sent(character), null), /^(key|role)$/, "no key makes no worlds");
        assert.match(await refused(sent(character), someWorld.playerKey), /^(key|role)$/, "nor does a player's key");
        assert.equal(server.worlds.size, before + 1, "nothing left of those refused");
    });
});

describe("bringing a world from the game (app/servers.js ServerClient bringWorld)", () => {
    it("sends the character and their world, gzipped, with the game's version; keeps the owner's key and their ticket, so they come in as its owner, to their hero", async () => {
        const server = await serve();
        const address = addressOf(`127.0.0.1:${server.port}`);
        const known = new KnownServers(memory());
        const client = new ServerClient(known.remember(address), { servers: known });

        assert.equal(GAME_FORMAT, BRING_FORMAT, "the game and the server agree on what's sent");
        await assert.rejects(client.bringWorld("WRONG-KEY", { character: solo("Bram") }), (error) => error instanceof ServerRefusal && error.error === "key");

        const brought = await client.bringWorld(server.adminKey, { character: solo("Bram"), firstHero: "new" });

        assert.equal(brought.name, "Bram's world", "named after them, unless it's named");
        assert.deepEqual(known.get(address.key).worlds[brought.world], { name: "Bram's world", key: brought.ownerKey, playerKey: brought.playerKey, ticket: brought.ticket, player: brought.player, role: "owner" });

        const entered = await new ServerClient(known.get(address.key), { servers: known }).enter({ world: brought.world });

        assert.equal(entered.role, "owner");
        assert.equal(entered.player, brought.player);
        assert.deepEqual(entered.heroes.map(({ slot, name }) => [slot, name]), [[1, "Bram"]]);
    });
});
