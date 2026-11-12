// The world server's structured log (server/log.js): one line of JSON for each thing that happens,
// only the fields a line may have, every string scrubbed; and, on a real server with players
// coming in, keys made and wrong keys tried, never a key, a ticket, a session, a token or a whole
// address in any line
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ACCESS_EVENTS, accessLine, FIELDS, Log, netOf, scrub } from "../server/log.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { WorldServer } from "../server/world-server.js";

const made = [];
const servers = [];

after(async () => {
    for (const server of servers) {
        await server.close().catch(() => {});
    }

    for (const folder of made) {
        await rm(folder, { recursive: true, force: true });
    }
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 60000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

// A log that keeps its lines, on a clock that stands still
function kept() {
    const lines = [];
    const log = new Log({ write: (line) => lines.push(line), clock: () => new Date(Date.UTC(2026, 10, 12, 12)) });

    return { log, lines, read: () => lines.map((line) => JSON.parse(line)) };
}

// Things that must never be in a line: a key and a short code as the server writes them, a ticket, a session, a token, addresses
const KEY = "K7Q2M-XD4RT-9PLWZ-3HVBN-6CYJA-8FGSE";
const CODE = "QX7PM-2KD9R";
const TOKEN = "c2Vzc2lvbi10b2tlbi1mb3ItYS1wbGF5ZXItMTIzNDU2Nzg5MA";
const ADDRESSES = ["203.0.113.77", "2001:db8:85a3::8a2e:370:7334", "::ffff:198.51.100.23", "fe80::1c2d:3e4f:5a6b:7c8d"];

describe("a structured log's lines (server/log.js)", () => {
    it("writes one line of JSON for each event: when, what, and its fields", () => {
        const { log, lines, read } = kept();

        log.event("world.life", { world: "mj7dyu057o", life: "running" });
        log.event("server.listening", { port: 8480, version: "2.0.0", worlds: 3 });

        assert.equal(lines.length, 2);
        assert.ok(lines.every((line) => line.endsWith("\n") && line.indexOf("\n") === line.length - 1), "a line each");
        assert.deepEqual(read(), [
            { t: "2026-11-12T12:00:00.000Z", event: "world.life", world: "mj7dyu057o", life: "running" },
            { t: "2026-11-12T12:00:00.000Z", event: "server.listening", port: 8480, version: "2.0.0", worlds: 3 },
        ]);
    });

    it("writes no field but those a line may have, whatever it's given", () => {
        const { log, read } = kept();

        log.event("player.entered", { world: "w1", player: "K7Q2MXD4RT", key: KEY, token: TOKEN, session: TOKEN, ticket: TOKEN, code: CODE, address: ADDRESSES[0], label: "Sam's key", cookie: "pellagos-admin=abc", authorization: `Key ${KEY}`, password: "hunter2", secret: TOKEN, count: 2, first: true, ms: NaN, role: null, by: undefined, life: { nested: KEY }, reason: ["a"] });

        assert.deepEqual(read(), [{ t: "2026-11-12T12:00:00.000Z", event: "player.entered", world: "w1", player: "K7Q2MXD4RT", count: 2, first: true }]);

        for (const name of ["key", "code", "token", "session", "ticket", "address", "label", "cookie", "authorization", "password", "secret"]) {
            assert.ok(!Object.hasOwn(FIELDS, name), `${name} is no field of a line`);
        }
    });

    it("scrubs every string of anything shaped like a key, a code, a token or a whole address", () => {
        const { log, lines } = kept();
        const sentence = `A game tested reaching the server from the internet (${ADDRESSES[0]}), then ${ADDRESSES[1]} and ${ADDRESSES[2]} and [${ADDRESSES[3]}]:8480, with the key ${KEY}, the code ${CODE} and the session ${TOKEN} at 14:05:09.`;

        log.event("journal", { text: sentence, by: `the holder of ${KEY}`, reason: TOKEN, world: ADDRESSES[0], player: CODE });
        log.event(`refused ${KEY}`, { net: ADDRESSES[1] });

        const written = lines.join("");

        for (const secret of [KEY, CODE, TOKEN, ...ADDRESSES, "198.51.100.23", KEY.slice(0, 11), TOKEN.slice(0, 24)]) {
            assert.ok(!written.includes(secret), `${secret} in ${written}`);
        }

        // (What's left says what was there, and what network an address was on; a time of day is no address)
        assert.equal(scrub(sentence), "A game tested reaching the server from the internet (203.0.113.x), then 2001:db8:85a3::x and 198.51.100.x and [fe80:0:0::x]:8480, with the key [key], the code [key] and the session [token] at 14:05:09.");
        assert.equal(scrub("Saved (turn). Backed up (before-update) at 2026-10-12T22-41-05Z; the world mj7dyu057o, player K7Q2MXD4RT."), "Saved (turn). Backed up (before-update) at 2026-10-12T22-41-05Z; the world mj7dyu057o, player K7Q2MXD4RT.");
    });

    it("says of an address only the network it's on", () => {
        assert.equal(netOf("203.0.113.77"), "203.0.113.x");
        assert.equal(netOf("::ffff:198.51.100.23"), "198.51.100.x");
        assert.equal(netOf("2001:db8:85a3::8a2e:370:7334"), "2001:db8:85a3::x");
        assert.equal(netOf("2001:db8:85a3:1:2:3:4:5"), "2001:db8:85a3::x");
        assert.equal(netOf("::1"), "0:0:0::x");
        assert.equal(netOf("[fe80::1%en0]"), "fe80:0:0::x");
        assert.equal(netOf("not an address"), null);
        assert.equal(netOf(undefined), null);
    });

    it("names what the access hooks tell of, with a key by its id and an address by its network, and never a key's label", () => {
        assert.deepEqual(accessLine("entered", { world: "w1", player: "K7Q2MXD4RT", role: "player", via: "k3f9", label: KEY, address: ADDRESSES[0], new: true }), ["player.entered", { world: "w1", player: "K7Q2MXD4RT", role: "player", reason: undefined, net: "203.0.113.x", keyId: "k3f9", codeId: undefined, listing: undefined, by: undefined, count: undefined, first: true }]);
        assert.equal(accessLine("refused", { why: "key", address: ADDRESSES[1] })[1].net, "2001:db8:85a3::x");
        assert.equal(accessLine("kicked", {}), null);
        assert.deepEqual(Object.keys(ACCESS_EVENTS).sort(), ["announced", "banned", "codeMade", "codeRedeemed", "codesBurned", "entered", "keyIssued", "keyReplaced", "keyRevoked", "left", "refused", "unbanned", "withdrawn"]);

        const { log, lines } = kept();

        for (const event of Object.keys(ACCESS_EVENTS)) {
            log.access(event, { world: "w1", player: "K7Q2MXD4RT", role: "owner", via: "k3f9", key: "k3f9", code: "c81d", label: KEY, address: ADDRESSES[0], why: "key", by: "the admin", count: 3, listing: "l1", replacedBy: "k9a1", ticket: TOKEN, session: TOKEN });
        }

        log.access("kicked", { world: "w1" });
        assert.equal(lines.length, Object.keys(ACCESS_EVENTS).length);
        assert.ok(!lines.join("").includes(KEY) && !lines.join("").includes(TOKEN) && !lines.join("").includes(ADDRESSES[0]));
        assert.ok(lines.every((line) => Object.keys(JSON.parse(line)).every((name) => name === "t" || name === "event" || Object.hasOwn(FIELDS, name))));
    });

    it("writes nothing with nowhere to write, and never stops the server over a line it can't write", () => {
        new Log().event("world.life", { world: "w1" });
        new Log({ write: () => {
            throw new Error("EPIPE");
        } }).event("world.life", { world: "w1" });
        new Log({ write: () => {} }).event("world.life", null);
    });
});

// A call to the server's API on its play port: { status, json }
function call(server, method, route, { body = null, auth = null } = {}) {
    const text = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port: server.port, path: `/api/v1${route}`, method, headers: { Host: `127.0.0.1:${server.port}`, ...(auth ? { Authorization: auth } : {}), ...(text ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } : {}) } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const said = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, json: said.startsWith("{") ? JSON.parse(said) : null });
            });
        });

        request.on("error", reject);
        request.end(text ?? undefined);
    });
}

describe("a world server's log, with players coming in (server/world-server.js)", () => {
    it("says who came in, what was refused, the keys made and what its worlds did, and never a key, a ticket, a session, a token or a whole address", async () => {
        const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-log-"));
        const lines = [];
        const server = await WorldServer.open(folder, { cost: { N: 1024, r: 8, p: 1 }, awake: () => ({ stop() {} }), router: false, funnel: false, log: (line) => lines.push(line) });

        made.push(folder);
        servers.push(server);
        await server.settings.change({ setAsideMinutes: 0 });
        await server.listen(0, "127.0.0.1");

        const secrets = [server.adminKey];
        const world = await call(server, "POST", "/worlds", { auth: `Key ${server.adminKey}`, body: { name: "Thornwick", race: "human", seed: 3 } });

        assert.equal(world.status, 200);
        secrets.push(world.json.ownerKey, world.json.playerKey);

        // (A key made, with a label that's a secret of someone's; a wrong key tried; then in by the players' key)
        const issued = await server.access.issueKey(world.json.world, { label: `For Sam ${KEY}`, role: "trusted" }, { by: "the admin" });

        secrets.push(issued.key);
        assert.equal((await call(server, "POST", "/enter", { body: { world: world.json.world, key: KEY } })).status, 401);

        const entered = await call(server, "POST", "/enter", { body: { world: world.json.world, key: world.json.playerKey } });

        assert.equal(entered.status, 200);
        secrets.push(entered.json.session, entered.json.ticket);

        const socket = new WebSocket(`ws://127.0.0.1:${server.port}/play`, PLAY_PROTOCOL);
        const heard = [];

        socket.onmessage = ({ data }) => heard.push(data);
        await new Promise((resolve, reject) => {
            socket.onopen = resolve;
            socket.onerror = reject;
        });
        socket.send(`enter ${world.json.world} ${entered.json.session}`);
        await until(() => heard.some((line) => line.startsWith("entered ")), "a place in the world");
        secrets.push(heard.find((line) => line.startsWith("entered ")).split(" ")[2]);
        socket.send("data\nnot what a game says");

        // (A line its thread put in the world's journal with what mustn't be logged in it, as an
        // error's words might have: heard from the thread as its own are, and scrubbed as they are)
        server.registry.entries.get(world.json.world).thread.thread.emit("message", { type: "journal", text: `Couldn't save (turn): ${KEY} at 203.0.113.77, ${TOKEN}` });
        server.registry.entries.get(world.json.world).thread.thread.emit("message", { type: "journal", text: { not: "a sentence" } });
        socket.close();
        await until(() => server.registry.lifeOf(world.json.world).life === "stored", "the world set aside");

        // (The server's own journal's lines too: a new admin key, and a sentence with an address in it)
        secrets.push((await server.manage.newAdminKey()).key);
        await server.manage.journal(`A game tested reaching the server from the internet (203.0.113.77), with ${KEY}.`);
        await server.close();
        secrets.push(KEY, TOKEN, "203.0.113.77", "127.0.0.1", "::1", server.identity.id);

        const written = lines.join("");
        const read = lines.map((line) => JSON.parse(line));
        const events = read.map((line) => line.event);

        assert.ok(secrets.every((secret) => typeof secret === "string" && secret.length >= 3), "every secret was there to look for");

        for (const secret of secrets) {
            assert.ok(!written.includes(secret), `${secret.slice(0, 6)}… is in the log`);
        }

        // (Each a line of JSON, with when and what, and no field a line may not have)
        assert.ok(lines.every((line) => line.endsWith("}\n") && !line.slice(0, -1).includes("\n")));
        assert.ok(read.every((line) => !Number.isNaN(Date.parse(line.t)) && typeof line.event === "string"));
        assert.ok(read.every((line) => Object.keys(line).every((name) => name === "t" || name === "event" || Object.hasOwn(FIELDS, name))));

        for (const event of ["server.listening", "key.issued", "refused", "player.entered", "player.left", "world.life", "journal", "server.stopped"]) {
            assert.ok(events.includes(event), `${event} among ${[...new Set(events)].join(", ")}`);
        }

        const came = read.find((line) => line.event === "player.entered");

        assert.deepEqual([came.world, came.player, came.role, came.net, came.first], [world.json.world, entered.json.player, "player", "127.0.0.x", true]);
        assert.ok(read.some((line) => line.event === "refused" && line.reason === "key" && line.net === "127.0.0.x"));
        assert.equal(read.find((line) => line.event === "world.life").life, "loading");
        assert.ok(read.some((line) => line.event === "world.life" && line.life === "running" && line.world === world.json.world));
        assert.equal(read.filter((line) => line.event === "world.life").at(-1).life, "stored");
        assert.ok(read.some((line) => line.event === "journal" && /new admin key/.test(line.text)));
        assert.ok(read.some((line) => line.event === "journal" && line.text === "A game tested reaching the server from the internet (203.0.113.x), with [key]."));

        // (And what the world's own thread journalled, in its thread: it was saved as its last
        // player left, each line in the log by its world and in the world's journal as written)
        const journalled = read.filter((line) => line.event === "world.journal");
        const journal = await readFile(path.join(folder, "worlds", world.json.world, "journal.log"), "utf8");

        assert.ok(journalled.length >= 2 && journalled.every((line) => line.world === world.json.world && typeof line.text === "string"));
        assert.ok(journalled.some((line) => /^Saved \(/.test(line.text)), journalled.map((line) => line.text).join(" | "));
        assert.ok(journalled.filter((line) => /^Saved \(/.test(line.text)).every((line) => journal.includes(` ${line.text}\n`)), "each as the world's journal has it");
        assert.ok(journalled.some((line) => line.text === "Couldn't save (turn): [key] at 203.0.113.x, [token]"));

        // (The journals people read are as they were: the log's beside them, not in their place)
        assert.match(await readFile(path.join(folder, "journal.log"), "utf8"), /A new admin key was made/);
        assert.match(await readFile(path.join(folder, "worlds", world.json.world, "journal.log"), "utf8"), /came in, as a player, by the key "Players' key"\./);
    });
});
