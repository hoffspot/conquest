// A world's kept heroes as character files (server/manage.js heroesFile, takeHome; client/js/app/
// character-file.js; docs/SERVER.md, "Heroes as files"): one of a player's taken home by them, on
// their session, out of the world for good, in the world's land and with its war, what this version
// of the game hasn't got left out and said as the game brings it in; refused to anyone else, and
// where the world doesn't keep heroes; every one of a player's exported by the world's owner from
// the management page; and a kept hero brought into the world as this version plays them, its
// journal told what changed.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { CHARACTER_EXTENSION, CHARACTER_FORMAT, exportOfKept, keptOfExport, readCharacterFile, salvageKept } from "../client/js/app/character-file.js";
import { defaultHero } from "../client/js/app/heroes.js";
import { isGuid } from "../client/js/core/guid.js";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { decode, encode } from "../client/js/core/wire.js";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { WorldServer } from "../server/world-server.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 60000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

// A world server on loopback, with its management page's own listener
async function serve() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-heroes-"));
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });

    made.push(folder);
    servers.push(server);
    await server.settings.change({ setAsideMinutes: 0 });
    await server.listen(0, "127.0.0.1");
    await server.listenAdmin(0);

    return server;
}

// A request to a port: { status, headers, json, text }
function raw(port, { method = "GET", route, headers = {}, body = null }) {
    const text = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port, path: `/api/v1${route}`, method, headers: { Host: `localhost:${port}`, ...(text ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } : {}), ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const answer = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, headers: response.headers, json: answer.startsWith("{") ? JSON.parse(answer) : null, text: answer });
            });
        });

        request.on("error", reject);
        request.end(text ?? undefined);
    });
}

// Into a world by its players' key, as a game comes in: { session, player }
async function enter(server, world, key) {
    const { status, json } = await raw(server.port, { method: "POST", route: "/enter", body: { world, key, net: NET_VERSION } });

    assert.equal(status, 200, JSON.stringify(json));

    return json;
}

// The management page on the server's computer: its calls, its cookie and header with them
async function manager(server) {
    const page = await new Promise((resolve) => http.get({ host: "127.0.0.1", port: server.adminPort, path: "/", headers: { Host: `localhost:${server.adminPort}` } }, resolve));
    const cookie = page.headers["set-cookie"][0].split(";")[0];

    page.resume();

    return (route) => raw(server.adminPort, { route, headers: { Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE } });
}

// A hero as a world keeps one (core/host.js leave, with where and how they were): carrying
// something this version of the game hasn't got
const keptHero = (name, gold = 60) => ({
    hero: { ...defaultHero(), name, race: "elf", weapon: "bow" },
    talks: { memory: { barkeep: { talks: 1, flags: [] } }, knowledge: ["the ford"] },
    explored: { entered: [], visited: "" },
    progress: { skills: { marksman: 200 }, schools: { healing: 0, fire: 0, earth: 0, air: 0, water: 0 }, spells: [], spellXp: {}, gold, pack: [{ id: "potion", quality: "common", count: 2 }, { id: "oldBlade", count: 1 }], gear: { mainHand: { id: "bow", quality: "common" } } },
    standing: {},
    followers: [],
    place: { x: 10, y: 12, facing: 1 },
});

describe("a world's kept heroes as character files", () => {
    let server;
    let world;
    let ada;
    let bram;

    before(async () => {
        server = await serve();
        world = await server.createWorld({ name: "Thornwick", seed: 21, race: "elf", heroes: "kept" });
        ada = await enter(server, world.world, world.playerKey);
        bram = await enter(server, world.world, world.playerKey);
        await server.worlds.get(world.world).heroes.keep(ada.player, keptHero("Ada", 60));
        await server.worlds.get(world.world).heroes.keep(ada.player, keptHero("Élodie", 5));
    });

    it("takes one of a player's heroes home, by them alone and out of the world for good: in the world's land, what this version hasn't got left out and said", async () => {
        const kept = server.worlds.get(world.world).heroes;
        const { slot } = await kept.keep(ada.player, keptHero("Wynn", 60));
        const home = (who, at = slot) => raw(server.port, { method: "POST", route: `/worlds/${world.world}/heroes/${at}/home`, ...(who ? { headers: { Authorization: `Bearer ${who.session}` } } : {}) });

        // (Not another player's, nor without a session, nor a slot with nobody in it)
        assert.equal((await home(bram)).json.error, "no-hero");
        assert.equal((await home(null)).status, 401);
        assert.equal((await home(ada, 5)).status, 404);
        assert.ok(await kept.get(ada.player, slot), "still there");

        const { status, json } = await home(ada);
        const [read, ...others] = readCharacterFile(json.text);

        assert.equal(status, 200);
        assert.equal(json.name, `Wynn${CHARACTER_EXTENSION}`);
        assert.equal(decode(json.text).format, CHARACTER_FORMAT);
        assert.deepEqual(others, []);
        assert.equal(read.name, "Wynn");
        assert.equal(read.exported.save.seed, 21, "in the world's land");
        assert.equal(read.exported.progress.gold, 60);
        assert.deepEqual(read.exported.talks.knowledge, ["the ford"]);
        assert.deepEqual(read.exported.place.place, { x: 10, y: 12, facing: 1 });
        assert.deepEqual(read.left, ["1 thing the game no longer has: old blade."]);

        // (Out of the world for good: forgotten there, its journal told, and not taken twice)
        const journal = path.join(server.worlds.get(world.world).folder, "journal.log");

        assert.equal(await kept.get(ada.player, slot), null);
        assert.match(await readFile(journal, "utf8"), /Wynn \(.+\) taken home, out of the world for good\./);
        assert.equal((await home(ada)).status, 404);
    });

    it("exports every one of a player's heroes for the world's owner, as a file; not where the world doesn't keep heroes", async () => {
        const call = await manager(server);
        const { status, headers, text } = await call(`/worlds/${world.world}/players/${ada.player}/heroes`);

        assert.equal(status, 200);
        assert.equal(headers["content-type"], "application/octet-stream");
        assert.match(headers["content-disposition"], /^attachment; filename="Pellagos-characters-\d{4}-\d\d-\d\d\.pellagos-character"$/);
        assert.deepEqual(readCharacterFile(text).map((one) => one.name), ["Ada", "Élodie"]);
        assert.equal((await call(`/worlds/${world.world}/players/${bram.player}/heroes`)).json.error, "no-hero");

        const brought = await server.createWorld({ name: "Ashby", seed: 22, race: "human", heroes: "brought" });

        assert.equal((await call(`/worlds/${brought.world}/players/${ada.player}/heroes`)).json.error, "not-kept");
    });

    it("brings a kept hero into the world as this version of the game plays them, telling its journal what changed", async () => {
        const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, PLAY_PROTOCOL);
        const lines = [];
        const messages = [];

        socket.onmessage = ({ data }) => (data.startsWith("data\n") ? messages.push(decode(data.slice(5))) : lines.push(data));
        await new Promise((resolve, reject) => {
            socket.onopen = resolve;
            socket.onerror = reject;
        });
        socket.send(`enter ${world.world} ${ada.session}`);
        await until(() => lines.some((line) => line.startsWith("entered") || line.startsWith("closed")), "entered", 120000);
        assert.ok(lines.some((line) => line.startsWith("entered")), lines.join(" | "));
        socket.send(`data\n${encode({ kind: "hello", version: NET_VERSION, character: { hero: { ...defaultHero(), name: "Ada", weapon: "bow" } }, hero: 1 })}`);
        await until(() => messages.some((message) => message.kind === "welcome"), "welcome", 120000);

        const journal = path.join(server.worlds.get(world.world).folder, "journal.log");

        await until(async () => /Ada \(.+\), brought to this version of the game: 1 thing the game no longer has: old blade\./.test(await readFile(journal, "utf8").catch(() => "")), "the journal told");
        socket.close(1000);
    });
});

describe("a kept hero and a character's export, each as the other", () => {
    it("are the same hero: a world's kept hero as an export, and back as the world keeps them", () => {
        const kept = keptHero("Cara", 30);
        const exported = exportOfKept(kept, { seed: 9, created: "2026-10-16T00:00:00.000Z", war: { version: 9, turn: 4, seed: 9 } });
        const back = keptOfExport(exported);

        assert.equal(exported.save.seed, 9);
        assert.equal(exported.world.war.turn, 4);
        assert.ok(isGuid(back.hero.guid), "given an id of its own");
        assert.deepEqual(back.hero, { ...kept.hero, guid: back.hero.guid });
        assert.equal(back.progress.gold, 30);
        assert.deepEqual(back.talks, kept.talks);
        assert.deepEqual(back.place, kept.place);

        // (Salvaged, as a world brings one in: what this version hasn't got left out)
        const { character, left } = salvageKept(kept, { seed: 9 });

        assert.deepEqual(character.progress.pack.filter(Boolean).map((item) => item.id), ["potion"]);
        assert.deepEqual(left, ["1 thing the game no longer has: old blade."]);
        assert.deepEqual(salvageKept(character, { seed: 9 }).left, [], "nothing more, the next time");
    });

    it("keep what the hero's own game kept of them (core/host.js OWN): their wheels and Action Bar, pin, markers, messages, what they've been told once and their settings, through the world keeping them and bringing them back (salvageKept), as through an export", () => {
        const own = {
            wheels: { self: [{ 0: "heal" }, {}], enemy: [{}, {}], quick: ["heal", "potion", null, null, null, null] },
            pin: [120, -45],
            markers: [{ id: "marker-1", x: 30, z: 40, icon: "camp", words: "home", from: null }],
            messages: [{ text: "You find 9 gold.", at: 1760000000000, times: 1 }],
            told: ["spoils"],
        };
        const settings = { autoSnag: true, snagGrades: ["legendary"], snagKinds: null, battleCam: false, dragSpeed: 1.5 };
        const kept = { ...keptHero("Cara", 30), ...own, settings };

        // (Once, a world brought a kept hero back without them: the hero's wheels and Action Bar,
        // set on a world server, gone the next time they came in)
        const { character } = salvageKept(kept, { seed: 9 });

        for (const [key, value] of Object.entries(own)) {
            assert.deepEqual(character[key], value, key);
            assert.deepEqual(keptOfExport(exportOfKept(kept, { seed: 9 }))[key], value, `${key}, through an export`);
        }

        // (Their settings for how they play too: not a character file's, as no export has them)
        assert.deepEqual(character.settings, settings);
        assert.equal(keptOfExport(exportOfKept(kept, { seed: 9 })).settings, undefined);

        // (A hero kept before there were any: none)
        const before = salvageKept(keptHero("Dan", 5), { seed: 9 }).character;

        assert.ok(["wheels", "pin", "markers", "messages", "told", "settings"].every((key) => before[key] === undefined));
    });
});
