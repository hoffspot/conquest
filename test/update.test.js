// Updating the server (generated/world_server_plan.md §11, "Updating"; §15 S9): the newest
// release found in the project's list, and only one its key signed taken; how the server was
// installed, so whether it updates itself; a release unpacked beside the version running; the
// updater's refusals, and an update made ready (every world and the server's own files backed up
// first). Then for real, in processes, as the menu-bar app runs it: a server from the previous
// release updated to the next, bringing every fixture world forward as it's first started, and an
// update that fails to start rolled back to the version before, with everything as it was.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { decode } from "../client/js/core/wire.js";
import { makeKeyPair, signArchive } from "../scripts/release-key.js";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { SERVER_JOURNAL } from "../server/manage.js";
import { BACKUPS, exists, readJSON, writeGzip } from "../server/storage/files.js";
import { SERVER_VERSION } from "../server/storage/versions.js";
import { chooseVersion, CURRENT, ENTRY, installOf, readCurrent, readLast, rollBack, unpackRelease, updatesItself, VERSIONS, versionFolder, writeCurrent } from "../server/update/installed.js";
import { archiveName, compareVersions, latestRelease, readReleaseKey, signatureName, verifySignature } from "../server/update/releases.js";
import { WorldServer } from "../server/world-server.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "test/fixtures/snapshots");
const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function scratch(name = "update") {
    const folder = await mkdtemp(path.join(os.tmpdir(), `pellagos-${name}-`));

    made.push(folder);

    return folder;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// (`what` says what it waited for: words, or a function giving them then)
async function until(test, what, ms = 30000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, () => `waited for ${typeof what === "function" ? what() : what}`);
        await wait(50);
    }
}

// A release of the server as the build makes it (scripts/build-mac-app.js sourceArchive): its one
// folder, pellagos-server-<version>/, with the server, the game's code (not its pictures, models
// and sounds: the server doesn't read those) and a package.json saying its version; `change`
// alters it first (a release that won't start). Returns the archive's file
async function release(work, version, change = async () => {}) {
    const staging = path.join(work, `staging-${version}`);
    const folder = path.join(staging, `pellagos-server-${version}`);

    await mkdir(path.join(folder, "client"), { recursive: true });
    await cp(path.join(ROOT, "server"), path.join(folder, "server"), { recursive: true });
    await cp(path.join(ROOT, "client/js"), path.join(folder, "client/js"), { recursive: true });
    await cp(path.join(ROOT, "client/vendor"), path.join(folder, "client/vendor"), { recursive: true });

    for (const name of await readdir(path.join(ROOT, "client"))) {
        if (/\.(html|css|json|webmanifest)$/.test(name)) {
            await cp(path.join(ROOT, "client", name), path.join(folder, "client", name));
        }
    }

    await writeFile(path.join(folder, "package.json"), JSON.stringify({ name: "pellagos-server", version, private: true, type: "module" }));
    await change(folder);

    const file = path.join(work, archiveName(version));

    execFileSync("tar", ["-czf", file, "-C", staging, path.basename(folder)]);
    await rm(staging, { recursive: true, force: true });

    return file;
}

// The project's releases, as GitHub lists them, for the server to find (`listed`: [{ version, archive, signature }])
async function releases(listed) {
    const assets = new Map();
    const server = http.createServer((request, response) => {
        if (request.url === "/releases") {
            const list = listed.map(({ version }) => ({
                tag_name: `server-v${version}`,
                draft: false,
                prerelease: false,
                body: `Version ${version}.`,
                published_at: "2026-10-13T09:00:00Z",
                html_url: `https://example.invalid/${version}`,
                assets: [archiveName(version), signatureName(version)].map((name) => ({ name, browser_download_url: `http://127.0.0.1:${server.address().port}/assets/${name}` })),
            }));

            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify(list));
        } else if (assets.has(request.url)) {
            response.writeHead(200);
            response.end(assets.get(request.url));
        } else {
            response.writeHead(404);
            response.end();
        }
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    return {
        url: `http://127.0.0.1:${server.address().port}/releases`,
        async add({ version, archive, signature }) {
            assets.set(`/assets/${archiveName(version)}`, archive);
            assets.set(`/assets/${signatureName(version)}`, signature);
            listed.push({ version });
        },
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

describe("the server's releases", () => {
    it("compare by version, the newest found among the server's own, its archive and signature both there", () => {
        assert.equal(compareVersions("2.4.0", "2.10.0"), -1);
        assert.equal(compareVersions("2.4.1", "2.4.0"), 1);
        assert.equal(compareVersions("2.4.0", "2.4.0"), 0);

        const asset = (version, ...names) => names.map((name) => ({ name: name(version), browser_download_url: `https://x/${name(version)}` }));
        const both = (version) => asset(version, archiveName, signatureName);
        const latest = latestRelease([
            { tag_name: "server-v2.4.0", assets: both("2.4.0"), body: "Notes", published_at: "2026-10-01T00:00:00Z", html_url: "https://x/2.4.0" },
            { tag_name: "server-v2.10.0", assets: both("2.10.0"), body: "Newer" },
            { tag_name: "server-v3.0.0", draft: true, assets: both("3.0.0") },
            { tag_name: "server-v2.11.0", prerelease: true, assets: both("2.11.0") },
            { tag_name: "server-v2.12.0", assets: asset("2.12.0", archiveName) },
            { tag_name: "game-v9.0.0", assets: both("9.0.0") },
        ]);

        assert.equal(latest.version, "2.10.0");
        assert.equal(latest.notes, "Newer");
        assert.equal(latest.archive, `https://x/${archiveName("2.10.0")}`);
        assert.equal(latest.signature, `https://x/${signatureName("2.10.0")}`);
        assert.equal(latestRelease([]), null);
        assert.equal(latestRelease({ message: "rate limited" }), null);
    });

    it("are taken only signed by the project's key: the archive as it was signed, and that key", () => {
        const { privateKey, publicKey } = makeKeyPair();
        const other = makeKeyPair();
        const bytes = Buffer.from("the server's archive");
        const signature = signArchive(bytes, privateKey);

        assert.equal(verifySignature(bytes, signature, publicKey), true);
        assert.equal(verifySignature(bytes, `${signature}\n`, publicKey), true);
        assert.equal(verifySignature(Buffer.from("the server's archive, changed"), signature, publicKey), false);
        assert.equal(verifySignature(bytes, signature, other.publicKey), false);
        assert.equal(verifySignature(bytes, "not a signature", publicKey), false);
        assert.equal(readReleaseKey(path.join(os.tmpdir(), "no-such-release-key.pem")), null);
    });
});

describe("how the server was installed", () => {
    it("says whether it updates itself, or what its owner types", async () => {
        const work = await scratch();

        assert.equal((await installOf(ROOT)).kind, "checkout");
        assert.deepEqual((await installOf("/opt/homebrew/Cellar/pellagos-server/2.4.0/libexec")).commands, ["brew update", "brew upgrade pellagos-server", "brew services restart pellagos-server"]);
        assert.equal((await installOf("/Applications/Pellagos Server.app/Contents/Resources/app")).kind, "app");
        assert.equal((await installOf(path.join(work, VERSIONS, "2.4.0"))).kind, "installed");
        assert.equal((await installOf(path.join(work, "pellagos-server-2.4.0"))).kind, "archive");
        assert.deepEqual(["checkout", "homebrew", "app", "installed", "archive"].map(updatesItself), [false, false, true, true, true]);
    });

    it("runs the newer of its own version and the one an update installed, if that's there whole", async () => {
        const root = await scratch();
        const own = { version: "2.4.0", code: "/the/app" };

        assert.equal((await chooseVersion(root, own)).code, own.code);

        await writeCurrent(root, { version: "2.5.0", previous: "2.4.0", state: "trying" });
        assert.equal((await chooseVersion(root, own)).code, own.code, "not there");

        await mkdir(path.dirname(path.join(versionFolder(root, "2.5.0"), ENTRY)), { recursive: true });
        await writeFile(path.join(versionFolder(root, "2.5.0"), ENTRY), "");

        const chosen = await chooseVersion(root, own);

        assert.equal(chosen.code, versionFolder(root, "2.5.0"));
        assert.equal(chosen.trying, true);
        assert.equal((await chooseVersion(root, { version: "2.6.0", code: "/newer/app" })).code, "/newer/app", "the app's newer");
    });
});

describe("a release unpacked", () => {
    it("goes beside the version running, whole, if it's the version it says", async () => {
        const work = await scratch();
        const root = path.join(work, "data");
        const archive = await release(work, "99.0.0");

        await mkdir(root);
        assert.equal(await unpackRelease(root, archive, "99.0.0"), versionFolder(root, "99.0.0"));
        assert.equal(JSON.parse(await readFile(path.join(versionFolder(root, "99.0.0"), "package.json"), "utf8")).version, "99.0.0");
        assert.ok(await exists(path.join(versionFolder(root, "99.0.0"), ENTRY)));

        await assert.rejects(unpackRelease(root, archive, "99.0.1"), /is version 99.0.0, not 99.0.1/);
        assert.equal(await exists(versionFolder(root, "99.0.1")), false);
        assert.deepEqual((await readdir(path.join(root, VERSIONS))).sort(), ["99.0.0"]);
    });
});

describe("an update that failed", () => {
    it("is undone: the server's files and every world as the backups had them, the version before run again, the failed one let go", async () => {
        const root = await scratch();
        const backup = "2026-10-13T09-00-00Z-before-update-99.0.1";

        await mkdir(path.join(root, BACKUPS, "server", backup), { recursive: true });
        await writeFile(path.join(root, BACKUPS, "server", backup, "server.json"), "before");
        await writeFile(path.join(root, "server.json"), "after");
        await writeFile(path.join(root, "made-by-the-new-version.json"), "after");
        await mkdir(path.join(root, BACKUPS, "abcdefghij", "2026-10-13T09-00-00Z-before-update", "state"), { recursive: true });
        await writeFile(path.join(root, BACKUPS, "abcdefghij", "2026-10-13T09-00-00Z-before-update", "world.json"), "before");
        await mkdir(path.join(root, "worlds", "abcdefghij", "state"), { recursive: true });
        await writeFile(path.join(root, "worlds", "abcdefghij", "world.json"), "after");
        await writeFile(path.join(root, "worlds", "abcdefghij", "state", "now.json.gz"), "after");

        for (const version of ["99.0.0", "99.0.1"]) {
            await mkdir(path.dirname(path.join(versionFolder(root, version), ENTRY)), { recursive: true });
            await writeFile(path.join(versionFolder(root, version), ENTRY), "");
        }

        const current = { version: "99.0.1", previous: "99.0.0", state: "trying", backups: { server: backup, worlds: { abcdefghij: "2026-10-13T09-00-00Z-before-update" } } };
        const last = await rollBack(root, current, "it fell over", { own: { version: "98.0.0", code: "/the/app" } });

        assert.equal(await readFile(path.join(root, "server.json"), "utf8"), "before");
        assert.equal(await exists(path.join(root, "made-by-the-new-version.json")), false);
        assert.equal(await readFile(path.join(root, "worlds", "abcdefghij", "world.json"), "utf8"), "before");
        assert.equal(await exists(path.join(root, "worlds", "abcdefghij", "state", "now.json.gz")), false);
        assert.equal(await exists(versionFolder(root, "99.0.1")), false);
        assert.equal((await readCurrent(root)).version, "99.0.0");
        assert.deepEqual({ ...last, when: null }, { from: "99.0.0", to: "99.0.1", outcome: "rolled-back", why: "it fell over", when: null, worlds: null });
        assert.equal((await readLast(root)).outcome, "rolled-back");

        // (The version before the launcher's own: none left to name)
        await rollBack(root, { ...current, version: "99.0.0", previous: "98.0.0" }, "it fell over too", { own: { version: "98.0.0", code: "/the/app" } });
        assert.equal(await exists(path.join(root, VERSIONS, CURRENT)), false);
    });
});

describe("the updater", () => {
    // A server whose code is a release's (not this checkout), finding releases on `found`, with `key`
    async function updating({ found, key, code }) {
        const root = await scratch();
        let restarted = 0;
        const server = await WorldServer.open(root, { awake: () => ({ stop() {} }), router: false, funnel: false, onRestart: () => restarted++, update: { releases: found.url, key, code } });

        servers.push(server);

        return { root, server, restarted: () => restarted };
    }

    it("refuses what it can't do: a checkout, no key, no newer version, players in, a release its key didn't sign", async () => {
        const work = await scratch();
        const { privateKey, publicKey } = makeKeyPair();
        const archive = await readFile(await release(work, "99.0.0"));
        const found = await releases([]);
        const code = path.join(work, "pellagos-server-98.0.0");

        try {
            const checkout = await updating({ found, key: publicKey, code: ROOT });

            await assert.rejects(checkout.server.updater.update({ version: "99.0.0" }), { error: "not-here", message: /git pull/ });

            const keyless = await updating({ found, key: null, code });

            await assert.rejects(keyless.server.updater.update({ version: "99.0.0" }), { error: "no-key" });

            const { root, server } = await updating({ found, key: publicKey, code });

            assert.equal((await server.updater.check()).newer, null);
            await assert.rejects(server.updater.update({ version: "99.0.0" }), { error: "not-newer", message: /no newer version/ });

            await found.add({ version: "99.0.0", archive, signature: signArchive(Buffer.from("something else"), privateKey) });

            const state = await server.updater.check();

            assert.equal(state.newer.version, "99.0.0");
            assert.equal(state.install.kind, "archive");
            assert.equal(state.key, true);
            await assert.rejects(server.updater.update({ version: "99.0.1" }), { error: "not-newer", message: /The newer version is 99.0.0/ });

            // (A player in)
            server.registry.entries.set("somewhere", { thread: { state: { present: 1 } } });
            await assert.rejects(server.updater.update({ version: "99.0.0" }), { error: "players-in", message: /A player is in/ });
            server.registry.entries.delete("somewhere");

            // (Signed by no one it knows: downloaded, refused, nothing installed)
            assert.deepEqual(await server.updater.update({ version: "99.0.0", by: "the admin" }), { updating: "99.0.0" });
            await until(() => server.updater.failed, "the update to fail");
            assert.match(server.updater.failed.why, /isn't signed by the project's key/);
            assert.equal(await exists(path.join(root, VERSIONS, "99.0.0")), false);
            assert.equal(await readCurrent(root), null);
        } finally {
            await found.close();
        }
    });

    it("makes an update ready: every world and the server's own files backed up, the release unpacked beside, then the server restarted", async () => {
        const work = await scratch();
        const { privateKey, publicKey } = makeKeyPair();
        const archive = await readFile(await release(work, "99.0.0"));
        const found = await releases([]);

        try {
            await found.add({ version: "99.0.0", archive, signature: signArchive(archive, privateKey) });

            const { root, server, restarted } = await updating({ found, key: publicKey, code: path.join(work, "pellagos-server-98.0.0") });
            const made = [];

            for (const name of ["Ashby", "Bryn"]) {
                made.push((await server.createWorld({ name, seed: 5, race: "human" })).world);
            }

            await server.updater.check();
            await server.updater.update({ version: "99.0.0", by: "the admin" });
            await until(() => restarted() === 1, "the server to be restarted");

            const current = await readCurrent(root);

            assert.deepEqual({ ...current, since: null, backups: null }, { version: "99.0.0", previous: SERVER_VERSION, state: "trying", since: null, by: "the admin", backups: null });
            assert.match(current.backups.server, /-before-update-99\.0\.0$/);
            assert.ok(await exists(path.join(root, BACKUPS, "server", current.backups.server, "server.json")));
            assert.equal(await exists(path.join(root, BACKUPS, "server", current.backups.server, "worlds")), false);
            assert.deepEqual(Object.keys(current.backups.worlds).sort(), [...made].sort());

            for (const id of made) {
                assert.match(current.backups.worlds[id], /-before-update$/);
                assert.ok(await exists(path.join(root, BACKUPS, id, current.backups.worlds[id], "world.json")));
            }

            assert.ok(await exists(path.join(versionFolder(root, "99.0.0"), ENTRY)));
            assert.equal((await server.updater.state()).busy.stage, "restarting");
            assert.match(await readFile(path.join(root, SERVER_JOURNAL), "utf8"), new RegExp(`Updating from ${SERVER_VERSION.replace(/\./g, "\\.")} to 99\\.0\\.0, as the admin asked`));
        } finally {
            await found.close();
        }
    });
});

describe("an update, for real", () => {
    it("takes a server from the previous release to the next, every fixture world brought forward; and one that won't start is rolled back, everything as it was", { timeout: 240000 }, async () => {
        const work = await scratch("update-real");
        const root = path.join(work, "data");
        const { privateKey, publicKey } = makeKeyPair();
        const keyFile = path.join(work, "release-key.pem");

        await writeFile(keyFile, publicKey);

        // (The previous release, unpacked by hand: the launcher's own version)
        const previous = path.join(work, "previous");

        await mkdir(previous);
        execFileSync("tar", ["-xzf", await release(work, "98.0.0"), "-C", previous]);

        // Its data folder: a world saved by each version of the game the fixtures keep, and one never saved
        const fixtures = (await readdir(FIXTURES)).map((name) => Number(/^(\d+)\.json\.gz$/.exec(name)?.[1])).filter(Number.isInteger);
        const setUp = await WorldServer.open(root, { awake: () => ({ stop() {} }), router: false, funnel: false });
        const worlds = {};

        for (const version of fixtures) {
            const { world } = await setUp.createWorld({ name: `Kept by ${version}`, seed: 5, race: "human" });
            const text = gunzipSync(await readFile(path.join(FIXTURES, `${version}.json.gz`))).toString("utf8");

            await writeGzip(path.join(root, "worlds", world, "state", "now.json.gz"), text);
            worlds[world] = version;
        }

        worlds[(await setUp.createWorld({ name: "Never saved", seed: 6, race: "elf" })).world] = null;
        await setUp.close();
        assert.ok(fixtures.some((version) => version < SNAPSHOT_VERSION), "a fixture older than this version");

        const found = await releases([]);
        const archive = await readFile(await release(work, "99.0.0"));

        await found.add({ version: "99.0.0", archive, signature: signArchive(archive, privateKey) });

        // The server, as the menu-bar app runs it: its lines read, its pipe kept open
        const child = spawn(process.execPath, [path.join(previous, "pellagos-server-98.0.0/server/world.js"), "--app", "--port", "0", "--admin", "0", "--data", root, "--releases", found.url, "--release-key", keyFile], { stdio: ["pipe", "pipe", "pipe"] });
        let said = "";
        const told = [];

        child.stdout.on("data", (text) => {
            said += text;

            for (const line of String(text).split("\n")) {
                if (line.startsWith("@pellagos ")) {
                    told.push(JSON.parse(line.slice(10)));
                }
            }
        });
        child.stderr.on("data", (text) => (said += text));

        const exited = new Promise((resolve) => child.on("exit", resolve));
        let ended = null;

        child.on("exit", (code) => (ended = code));

        const running = (version, after = 0) =>
            until(
                () => {
                    assert.equal(ended, null, `it ended (${ended}): ${said.slice(-3000)}`);

                    return told.slice(after).some((one) => one.state === "running" && one.version === version);
                },
                () => `version ${version} to run: ${said.slice(-3000)}`,
                120000,
            );

        // (The management page on the computer itself: its cookie, then its calls)
        const page = async () => {
            const port = Number(new URL(told.findLast((one) => one.state === "running").page).port);
            const loaded = await fetch(`http://localhost:${port}/`);
            const cookie = loaded.headers.get("set-cookie").split(";")[0];

            return async (method, route, body) => {
                const response = await fetch(`http://localhost:${port}/api/v1${route}`, { method, headers: { Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });

                return { status: response.status, json: await response.json() };
            };
        };

        try {
            await running("98.0.0");

            let call = await page();

            assert.equal((await call("GET", "/server/update")).json.install.kind, "archive");
            assert.equal((await call("POST", "/server/update", { check: true })).json.newer.version, "99.0.0");

            let mark = told.length;

            assert.deepEqual((await call("POST", "/server/update", { version: "99.0.0" })).json, { updating: "99.0.0" });
            await running("99.0.0", mark);
            assert.ok(told.slice(mark).some((one) => one.state === "updating"), "said it was updating");

            // (The launcher keeps the update, and says how it went, once the new version's said it's
            // running: after that line, not with it)
            await until(() => /Updated from 98\.0\.0 to 99\.0\.0/.test(said), () => `the launcher to keep the update: ${said.slice(-3000)}`);
            call = await page();

            const updated = (await call("GET", "/server/update")).json;

            assert.equal(updated.version, "99.0.0");
            assert.equal(updated.install.kind, "installed");
            assert.deepEqual({ ...updated.last, when: null, worlds: null }, { from: "98.0.0", to: "99.0.0", outcome: "updated", why: null, when: null, worlds: null });
            assert.equal(updated.current.state, "kept");
            assert.deepEqual(updated.last.worlds.filter((one) => one.forwarded !== null).map((one) => one.forwarded).sort(), fixtures.filter((version) => version < SNAPSHOT_VERSION).sort());

            // Every world saved as this version of the game keeps it (the one never saved, still so)
            for (const [id, version] of Object.entries(worlds)) {
                const now = path.join(root, "worlds", id, "state", "now.json.gz");

                if (version === null) {
                    assert.equal(await exists(now), false);
                } else {
                    assert.equal(decode(gunzipSync(await readFile(now)).toString("utf8")).version, SNAPSHOT_VERSION, `world ${id}, kept by ${version}`);
                }
            }

            // Then a release that won't start: tried, failed, and everything put back
            const broken = await readFile(
                await release(work, "99.0.1", async (folder) => {
                    const serve = path.join(folder, ENTRY);

                    await writeFile(serve, `throw new Error("Forced failure for the test: version 99.0.1 won't start");\n${await readFile(serve, "utf8")}`);
                }),
            );

            await found.add({ version: "99.0.1", archive: broken, signature: signArchive(broken, privateKey) });

            const before = {};

            for (const id of Object.keys(worlds)) {
                before[id] = await readFile(path.join(root, "worlds", id, "world.json"), "utf8");
            }

            assert.equal((await call("POST", "/server/update", { check: true })).json.newer.version, "99.0.1");
            mark = told.length;
            await call("POST", "/server/update", { version: "99.0.1" });
            await until(() => /Version 99\.0\.1 didn't start/.test(said), () => `the new version to fail: ${said.slice(-3000)}`, 120000);
            await running("99.0.0", mark);
            call = await page();

            const rolledBack = (await call("GET", "/server/update")).json;

            assert.equal(rolledBack.version, "99.0.0");
            assert.equal(rolledBack.last.outcome, "rolled-back");
            assert.equal(rolledBack.last.to, "99.0.1");
            assert.match(rolledBack.last.why, /Forced failure for the test/);
            assert.equal(rolledBack.current.version, "99.0.0");
            assert.equal(await exists(versionFolder(root, "99.0.1")), false);

            for (const id of Object.keys(worlds)) {
                assert.equal(await readFile(path.join(root, "worlds", id, "world.json"), "utf8"), before[id], `world ${id} as it was`);
            }

            // Stopped as the app stops it
            child.stdin.end();
            assert.equal(await exited, 0);
            assert.equal(told.at(-1).state, "stopped");
            assert.equal((await readJSON(path.join(root, VERSIONS, CURRENT))).version, "99.0.0");
        } finally {
            child.kill();
            await found.close();
        }
    });
});
