// The whole server as one archive (server/storage/archive.js, manage.js; docs/SERVER.md,
// "Archives"): made with every world, its keys' and players' hashes, the settings and the
// server's identity, but not its backups, the versions updates installed or a DNS host's token;
// restored into another data folder, which is then the same server (the same id, the same worlds,
// keys and admin key working), what was there kept in its backups; refused where there are
// worlds already; its worlds brought in one by one as new ones instead, with keys of their own,
// one whose save is too old to carry on started afresh from its seed, its war and heroes kept, and
// said so. And from the command line, as the Mac installer's --uninstall makes one.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { decode, encode } from "../client/js/core/wire.js";
import { ARCHIVE_FORMAT, archiveFolder, readArchive, RESTORING, worldsIn } from "../server/storage/archive.js";
import { exists, readGzip, writeGzip } from "../server/storage/files.js";
import { WorldServer } from "../server/world-server.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const OLDEST = Math.min(SNAPSHOT_VERSION, ...Object.keys(SNAPSHOT_STEPS).map(Number));
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function scratch(name = "archive") {
    const folder = await mkdtemp(path.join(os.tmpdir(), `pellagos-${name}-`));

    made.push(folder);

    return folder;
}

// A server on the data folder at `root`, as the tests run one; `restarts` counts its onRestart
async function open(root) {
    const restarts = { count: 0 };
    const server = await WorldServer.open(root, { cost: CHEAP, awake: () => ({ stop() {} }), router: false, funnel: false, onRestart: () => restarts.count++ });

    servers.push(server);

    return { server, restarts };
}

async function close(server) {
    await server.close();
    servers.splice(servers.indexOf(server), 1);
}

// A world's newest save, kept by a version of the game older than any this one brings forward
async function tooOld(server, id) {
    const file = path.join(server.root, "worlds", id, "state", "now.json.gz");
    const fixture = decode(gunzipSync(await readFile(path.join(ROOT, "test/fixtures/snapshots", `${OLDEST}.json.gz`))).toString("utf8"));

    await mkdir(path.dirname(file), { recursive: true });
    await writeGzip(file, encode({ ...fixture, version: OLDEST - 5 }));
}

describe("the server's archive", () => {
    it("holds everything it needs to be the same server again, and restored into another folder, is it: its id, its worlds, their keys and its admin key", { timeout: 120000 }, async () => {
        const first = await scratch();
        const { server: a } = await open(first);
        const thornwick = await a.createWorld({ name: "Thornwick", seed: 5, race: "human" });
        const ashby = await a.createWorld({ name: "Ashby", seed: 6, race: "elf" });
        const { id } = a.identity;
        const adminKey = a.adminKey;

        // (What it leaves out: the backups, the versions updates installed, a DNS host's token)
        await mkdir(path.join(first, "backups", "server", "old"), { recursive: true });
        await writeFile(path.join(first, "backups", "server", "old", "server.json"), "{}");
        await mkdir(path.join(first, "versions", "9.9.9"), { recursive: true });
        await mkdir(path.join(first, "certificates"), { recursive: true });
        await writeFile(path.join(first, "certificates", "tokens.json"), '{"duckdns":"a secret"}');

        const { name, body, worlds } = await a.manage.archive({ by: "the test" });
        const archive = readArchive(body);

        assert.match(name, /\.pellagos-archive$/);
        assert.equal(worlds, 2);
        assert.equal(JSON.parse(gunzipSync(body).toString("utf8")).format, ARCHIVE_FORMAT);
        assert.ok(archive.files.has("identity.key") && archive.files.has("secrets.json") && archive.files.has("server.json") && archive.files.has("VERSION"));
        assert.ok(archive.files.has(`worlds/${thornwick.world}/access.json`) && archive.files.has(`worlds/${thornwick.world}/world.json`));
        assert.deepEqual([...archive.files.keys()].filter((file) => /^(backups|versions)\//.test(file) || file.endsWith("tokens.json")), []);
        assert.deepEqual(worldsIn(archive).map((world) => world.name).sort(), ["Ashby", "Thornwick"]);
        await close(a);

        // Restored into a new server's folder: put in place when it next starts, what was there kept
        const second = await scratch();
        const opened = await open(second);
        const { restarts } = opened;
        let b = opened.server;
        const read = b.manage.readArchive(body);

        assert.notEqual(b.identity.id, id);
        assert.equal(read.restorable, true);
        assert.deepEqual(read.worlds.map((world) => world.carries), ["yes", "yes"]);
        assert.deepEqual(await b.manage.restoreArchive(read.id, { by: "the test" }), { restoring: true, worlds: 2 });
        assert.ok(await exists(path.join(second, RESTORING)));
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(restarts.count, 1);
        await close(b);

        ({ server: b } = await open(second));
        assert.equal(b.identity.id, id, "the same server, as players' games know it");
        assert.deepEqual([...b.worlds.keys()].sort(), [thornwick.world, ashby.world].sort());
        assert.ok(b.access.world(thornwick.world).keyOf(thornwick.playerKey), "its players' key still works");
        assert.ok(b.access.world(ashby.world).keyOf(ashby.ownerKey), "and its owner's");
        assert.ok(b.access.secrets.isAdmin(adminKey), "and the admin key");
        assert.equal(await exists(path.join(second, RESTORING)), false);
        assert.ok((await readdir(path.join(second, "backups", "server"))).some((backup) => backup.endsWith("-before-restore")), "what was there, in the backups");
        assert.match(await readFile(path.join(second, "journal.log"), "utf8"), /Restored from an archive Pellagos server/);
    });

    it("isn't restored over a server with worlds of its own: its worlds are brought in as new ones instead, one too old to carry on started afresh, saying so", { timeout: 180000 }, async () => {
        const { server: a } = await open(await scratch());
        const kept = await a.createWorld({ name: "Kept long ago", seed: 7, race: "human" });

        await a.createWorld({ name: "Lately", seed: 8, race: "orc" });
        await tooOld(a, kept.world);

        const { body } = await a.manage.archive();

        await close(a);

        const { server: c } = await open(await scratch());

        await c.createWorld({ name: "Already here", seed: 9, race: "elf" });

        const read = c.manage.readArchive(body);

        assert.equal(read.restorable, false);
        assert.match(read.why, /has worlds of its own/);
        await assert.rejects(c.manage.restoreArchive(read.id), { error: "not-empty" });
        assert.equal(read.worlds.find((world) => world.id === kept.world).carries, "afresh");

        const { results } = await c.manage.bringInFromArchive(read.id, [kept.world, "nosuchworld"], { by: "the test" });
        const [old, missing] = results;

        assert.equal(missing.error, "That world isn't in the archive, or it doesn't read.");
        assert.notEqual(old.world, kept.world, "a new world, with an id of its own");
        assert.ok(old.ownerKey && old.playerKey, "and keys of its own");
        assert.match(old.salvaged, new RegExp(`kept by version ${OLDEST - 5} of the game.*started afresh from its seed`));

        const { snapshot } = await c.worlds.get(old.world).load();

        assert.equal(snapshot.version, SNAPSHOT_VERSION);
        assert.match(await readFile(path.join(c.root, "worlds", old.world, "journal.log"), "utf8"), /Started afresh from its seed/);
    });

    it("refuses what isn't one, one in a newer format, and one naming a file outside the data folder", async () => {
        const archive = (files, format = ARCHIVE_FORMAT) => gzipSync(Buffer.from(JSON.stringify({ format, archivedBy: "9.9.9", files })));

        assert.throws(() => readArchive(Buffer.from("not an archive")), /isn't a Pellagos server's archive/);
        assert.throws(() => readArchive(archive({}, "pellagos.archive.2")), (error) => error.newer && /newer format \(pellagos\.archive\.2\), made by Pellagos server 9\.9\.9/.test(error.message));

        for (const file of ["../escape", "worlds/../../x", "/etc/passwd", "backups/server/x", "versions/1.0.0/x", "certificates/tokens.json", ".hidden"]) {
            assert.throws(() => readArchive(archive({ [file]: { text: "x" } })), /names a file it can't hold/, file);
        }

        assert.equal(readArchive(archive({ "worlds/abc/state/now.json.gz": { gz: "{}" } })).files.size, 1);
    });

    it("starts a world that can't be carried on afresh from its seed, its owner having said so", { timeout: 120000 }, async () => {
        const { server } = await open(await scratch());
        const { world } = await server.createWorld({ name: "Stuck", seed: 11, race: "cat" });

        await tooOld(server, world);
        await assert.rejects(server.manage.start(world), { error: "broken" });
        await server.manage.startAfresh(world, { by: "the test" });

        const { snapshot } = await server.worlds.get(world).load();

        assert.equal(snapshot.version, SNAPSHOT_VERSION);
        assert.ok(await readGzip(path.join(server.root, "worlds", world, "state", "now.json.gz")));
    });

    it("is made and staged from the command line, as the Mac installer's --uninstall makes one", { timeout: 120000 }, async () => {
        const first = await scratch();
        const { server } = await open(first);

        await server.createWorld({ name: "Carried", seed: 12, race: "human" });
        await close(server);

        const world = path.join(ROOT, "server/world.js");
        const file = path.join(await scratch("archive-out"), "kept.pellagos-archive");
        const made = spawnSync(process.execPath, [world, "--archive", file, "--data", first], { encoding: "utf8" });

        assert.equal(made.status, 0, made.stderr);
        assert.match(made.stdout, /The server's archive \(1 world, from /);
        assert.equal(readArchive(await readFile(file)).files.has("identity.key"), true);
        assert.deepEqual((await archiveFolder(first)).worlds, 1);

        // (Staged into an empty folder; refused where there are worlds, but --replace)
        const empty = await scratch();
        const staged = spawnSync(process.execPath, [world, "--restore", file, "--data", empty], { encoding: "utf8" });

        assert.equal(staged.status, 0, staged.stderr);
        assert.ok(await exists(path.join(empty, RESTORING)));

        const refused = spawnSync(process.execPath, [world, "--restore", file, "--data", first], { encoding: "utf8" });

        assert.equal(refused.status, 1);
        assert.match(refused.stderr, /has worlds of its own \(1\).*--replace/);
        assert.equal(spawnSync(process.execPath, [world, "--restore", file, "--data", first, "--replace"], { encoding: "utf8" }).status, 0);
    });
});
