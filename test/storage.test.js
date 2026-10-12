// What the world server keeps, and how (generated/world_server_plan.md §5, §5.1): its folders on
// each operating system (server/platform), files written whole or not at all, its data folder and
// settings each carrying a version, brought forward a step at a time from an older server's (a
// copy made first), and refused from a newer one, saying which server they need
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { DATA_OVERRIDE, folders, platformFor } from "../server/platform/index.js";
import { exists, readGzip, readJSON, stampOf, writeAtomic, writeGzip } from "../server/storage/files.js";
import { DataFolder, LAYOUT_VERSION, readLayout } from "../server/storage/folder.js";
import { CONFIG_VERSION, SETTINGS, settingReason, Settings, SettingsError } from "../server/storage/settings.js";
import { forward, NewerDataError, SERVER_VERSION } from "../server/storage/versions.js";

const made = [];

// A new empty folder of its own, for a test (all of them taken away after)
async function scratch() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-storage-"));

    made.push(folder);

    return folder;
}

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const modeOf = async (file) => (await stat(file)).mode & 0o777;
const posix = process.platform !== "win32";

describe("the world server's folders on each system (server/platform)", () => {
    it("keeps its data, logs and caches where each system keeps an app's", () => {
        assert.deepEqual(folders({ system: "darwin", env: {}, home: "/Users/ada" }), {
            data: "/Users/ada/Library/Application Support/io.github.hoffspot.pellagos-server",
            logs: "/Users/ada/Library/Logs/io.github.hoffspot.pellagos-server",
            cache: "/Users/ada/Library/Caches/io.github.hoffspot.pellagos-server",
        });

        // (Linux: the XDG folders, where they're set; their defaults where they aren't, or aren't absolute)
        assert.deepEqual(folders({ system: "linux", env: {}, home: "/home/ada" }), {
            data: "/home/ada/.local/share/pellagos-server",
            logs: "/home/ada/.local/state/pellagos-server/logs",
            cache: "/home/ada/.cache/pellagos-server",
        });
        assert.equal(folders({ system: "linux", env: { XDG_DATA_HOME: "/srv/data", XDG_CACHE_HOME: "relative" }, home: "/home/ada" }).data, "/srv/data/pellagos-server");
        assert.equal(folders({ system: "linux", env: { XDG_CACHE_HOME: "relative" }, home: "/home/ada" }).cache, "/home/ada/.cache/pellagos-server");

        assert.deepEqual(folders({ system: "win32", env: { APPDATA: "C:\\Users\\ada\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\ada\\AppData\\Local" }, home: "C:\\Users\\ada" }), {
            data: "C:\\Users\\ada\\AppData\\Roaming\\Pellagos Server",
            logs: "C:\\Users\\ada\\AppData\\Local\\Pellagos Server\\Logs",
            cache: "C:\\Users\\ada\\AppData\\Local\\Pellagos Server\\Cache",
        });

        // (Any other system as Linux; and the data somewhere else if it's asked)
        assert.equal(platformFor("freebsd"), platformFor("linux"));
        assert.equal(folders({ system: "darwin", env: { [DATA_OVERRIDE]: "/tmp/world-data" }, home: "/Users/ada" }).data, "/tmp/world-data");
    });
});

describe("writing what it keeps (server/storage/files.js)", () => {
    it("writes a file whole, its owner's alone, and leaves nothing else behind", async () => {
        const folder = await scratch();
        const file = path.join(folder, "deep", "er", "settings.json");

        await writeAtomic(file, "first\n");
        await writeAtomic(file, "second\n");
        assert.equal(await readFile(file, "utf8"), "second\n");
        assert.deepEqual(await readdir(path.dirname(file)), ["settings.json"], "(no temporary file left)");

        if (posix) {
            assert.equal(await modeOf(file), 0o600);
            assert.equal(await modeOf(path.dirname(file)), 0o700);
        }
    });

    it("leaves the old file as it was when the new one can't be put in its place", async () => {
        const folder = await scratch();
        const file = path.join(folder, "now.json");

        await writeAtomic(file, "kept\n");

        // (Where it would go, a folder with something in it: the rename's refused)
        const blocked = path.join(folder, "blocked");

        await mkdir(path.join(blocked, "inside"), { recursive: true });
        await assert.rejects(writeAtomic(blocked, "lost\n"));
        assert.ok((await stat(blocked)).isDirectory());
        assert.deepEqual((await readdir(folder)).sort(), ["blocked", "now.json"], "(the temporary file taken away)");
        assert.equal(await readFile(file, "utf8"), "kept\n");
    });

    it("gzips what it's given and reads it back the same", async () => {
        const folder = await scratch();
        const file = path.join(folder, "now.json.gz");
        const text = JSON.stringify({ battle: { time: 123450, actors: Array.from({ length: 200 }, (_, k) => ({ id: `a${k}`, x: k * 1.5, y: -k })) } });

        await writeGzip(file, text);
        assert.equal(await readGzip(file), text);
        assert.ok((await stat(file)).size < text.length / 3, "(smaller kept than it is)");
        assert.equal(stampOf(new Date(Date.UTC(2026, 9, 12, 22, 41, 5, 250))), "2026-10-12T22-41-05Z");
    });
});

describe("versions (server/storage/versions.js)", () => {
    const steps = { 1: (data) => ({ ...data, two: true }), 2: (data) => ({ ...data, three: data.two }) };

    it("brings older data forward a step for each version, and leaves the current as it is", () => {
        assert.deepEqual(forward("A thing", { one: true }, { found: 1, current: 3, steps }), { one: true, two: true, three: true });
        assert.deepEqual(forward("A thing", { one: true }, { found: 3, current: 3, steps }), { one: true });
    });

    it("refuses newer data, saying which server it needs; and a step missing, or no version at all", () => {
        assert.throws(
            () => forward("A thing", {}, { found: 4, current: 3, steps, writtenBy: "2.5.0" }),
            (error) => error instanceof NewerDataError && error.needs === "2.5.0" && error.found === 4 && error.reads === 3 && /written by Pellagos server 2\.5\.0/.test(error.message) && /Use Pellagos server 2\.5\.0 or later/.test(error.message),
        );
        assert.throws(() => forward("A thing", {}, { found: 1, current: 3, steps: { 1: steps[1] } }), /no way forward from version 2/);
        assert.throws(() => forward("A thing", {}, { found: undefined, current: 3, steps }), /no version this server knows/);
        assert.match(SERVER_VERSION, /^\d+\.\d+\.\d+/);
    });
});

describe("the server's settings (server/storage/settings.js)", () => {
    it("has a schema for every setting, its default within it", () => {
        for (const [key, setting] of Object.entries(SETTINGS)) {
            assert.equal(settingReason(key, setting.default), null, key);
            assert.ok(setting.about, key);
        }

        assert.equal(SETTINGS.port.default, 8480);
        assert.equal(SETTINGS.worldsAtOnce.default, 2);
        assert.equal(SETTINGS.setAsideMinutes.default, 2);
    });

    it("starts from the defaults, keeps what's changed, refuses a bad value with the reason, and keeps keys it doesn't know", async () => {
        const folder = await scratch();
        const file = path.join(folder, "server.json");
        const settings = await Settings.open(file);

        assert.equal(settings.get("port"), 8480);
        assert.deepEqual(Object.keys(settings.all()), Object.keys(SETTINGS));
        assert.deepEqual(await readJSON(file), { configVersion: CONFIG_VERSION, writtenBy: SERVER_VERSION, ...settings.all() });

        assert.deepEqual(await settings.change({ port: 9000, keepAwake: false }), { ok: true });
        assert.deepEqual(await settings.change({ port: "eighty", worldsAtOnce: 0, mystery: 1 }), {
            ok: false,
            reasons: ['port must be a whole number from 1 to 65535, not "eighty".', "worldsAtOnce must be a whole number from 1 to 64, not 0.", 'There\'s no setting called "mystery".'],
        });
        assert.equal(settings.get("port"), 9000, "(nothing changed by a refused change)");

        // (Something a newer server keeps: it comes through this one unharmed)
        await writeFile(file, JSON.stringify({ ...(await readJSON(file)), relayLimit: 12 }));

        const again = await Settings.open(file);

        assert.equal(again.get("port"), 9000);
        assert.equal(again.get("keepAwake"), false);
        await again.change({ bonjour: false });
        assert.equal((await readJSON(file)).relayLimit, 12);
        assert.throws(() => again.get("relayLimit"), /no setting called "relayLimit"/);
    });

    it("fills in a setting added since, with its default; refuses a file with a value its setting can't have, or that isn't JSON", async () => {
        const folder = await scratch();
        const file = path.join(folder, "server.json");

        await writeFile(file, JSON.stringify({ configVersion: CONFIG_VERSION, writtenBy: "2.0.0", port: 9100 }));
        assert.equal((await Settings.open(file)).get("worldsAtOnce"), 2);
        assert.equal((await readJSON(file)).worldsAtOnce, 2, "(written in)");

        await writeFile(file, JSON.stringify({ configVersion: CONFIG_VERSION, port: 70000 }));
        await assert.rejects(Settings.open(file), (error) => error instanceof SettingsError && /port must be a whole number from 1 to 65535, not 70000/.test(error.message));

        await writeFile(file, "{ port: 1");
        await assert.rejects(Settings.open(file), (error) => error instanceof SettingsError && /isn't JSON/.test(error.message));
    });
});

describe("the data folder (server/storage/folder.js)", () => {
    it("is made in an empty folder, its owner's alone, saying how it's laid out and by which server", async () => {
        const root = path.join(await scratch(), "data");
        const folder = await DataFolder.open(root);

        assert.deepEqual(await readLayout(root), { layout: LAYOUT_VERSION, writtenBy: SERVER_VERSION });
        assert.equal(await readFile(path.join(root, "VERSION"), "utf8"), `${LAYOUT_VERSION}\nPellagos server ${SERVER_VERSION}\n`);
        assert.equal(folder.settings.get("port"), 8480);
        assert.deepEqual((await readdir(root)).sort(), ["VERSION", "server.json"]);

        if (posix) {
            assert.equal(await modeOf(root), 0o700);
            assert.equal(await modeOf(path.join(root, "server.json")), 0o600);
        }

        // (And opened again, as it was left)
        await folder.settings.change({ worldsAtOnce: 3 });
        assert.equal((await DataFolder.open(root)).settings.get("worldsAtOnce"), 3);
    });

    it("refuses a folder laid out by a newer server, and newer settings, saying which server it needs", async () => {
        const root = await scratch();

        await writeFile(path.join(root, "VERSION"), `${LAYOUT_VERSION + 1}\nPellagos server 2.4.0\n`);
        await assert.rejects(DataFolder.open(root), (error) => error instanceof NewerDataError && error.needs === "2.4.0" && error.reads === LAYOUT_VERSION && error.message.includes(root));

        const other = await scratch();

        await DataFolder.open(other);
        await writeFile(path.join(other, "server.json"), JSON.stringify({ configVersion: CONFIG_VERSION + 1, writtenBy: "2.6.1", port: 8480 }));
        await assert.rejects(DataFolder.open(other), (error) => error instanceof NewerDataError && error.needs === "2.6.1" && /server\.json/.test(error.message));
    });

    it("refuses a folder with things in it but no VERSION (not one of the server's)", async () => {
        const root = await scratch();

        await writeFile(path.join(root, "holiday.jpg"), "");
        await assert.rejects(DataFolder.open(root), /isn't a Pellagos server's data folder/);
        assert.deepEqual(await readdir(root), ["holiday.jpg"], "(nothing written in it)");
    });

    it("lays an older server's folder out anew a step at a time, and brings its settings forward, a copy of each made first", async () => {
        const root = await scratch();
        const clock = () => new Date(Date.UTC(2026, 9, 12, 21, 0, 0));

        // (Laid out by an older server: a step's to move worlds.json into worlds/, the next to
        // write a marker; and its settings called the port "playPort")
        await writeFile(path.join(root, "VERSION"), "1\nPellagos server 2.0.0\n");
        await writeFile(path.join(root, "worlds.json"), '["first"]');
        await writeFile(path.join(root, "server.json"), JSON.stringify({ configVersion: 1, writtenBy: "2.0.0", playPort: 9300 }));

        const steps = {
            1: async (at) => {
                await mkdir(path.join(at, "worlds"));
                await writeFile(path.join(at, "worlds", "index.json"), await readFile(path.join(at, "worlds.json")));
                await rm(path.join(at, "worlds.json"));
            },
            2: async (at) => writeFile(path.join(at, "worlds", "moved"), "yes"),
        };
        const settingsSteps = { 1: ({ playPort, ...rest }) => ({ ...rest, port: playPort }) };
        const folder = await DataFolder.open(root, { current: 3, steps, configVersion: 2, settingsSteps, clock });

        assert.deepEqual(await readLayout(root), { layout: 3, writtenBy: SERVER_VERSION });
        assert.equal(await readFile(path.join(root, "worlds", "index.json"), "utf8"), '["first"]');
        assert.ok(await exists(path.join(root, "worlds", "moved")));
        assert.ok(!(await exists(path.join(root, "worlds.json"))));
        assert.equal(folder.settings.get("port"), 9300);
        assert.equal((await readJSON(path.join(root, "server.json"))).configVersion, 2);
        assert.equal((await readJSON(path.join(root, "server.json"))).playPort, undefined);

        // (The copies: the whole folder as it was, before it was laid out anew; the settings as they were)
        const backups = path.join(root, "backups", "server");

        assert.deepEqual((await readdir(backups)).sort(), ["2026-10-12T21-00-00Z-before-layout-3", "2026-10-12T21-00-00Z-before-settings-2.json"]);
        assert.deepEqual((await readdir(path.join(backups, "2026-10-12T21-00-00Z-before-layout-3"))).sort(), ["VERSION", "server.json", "worlds.json"]);
        assert.equal(await readFile(path.join(backups, "2026-10-12T21-00-00Z-before-layout-3", "VERSION"), "utf8"), "1\nPellagos server 2.0.0\n");
        assert.equal((await readJSON(path.join(backups, "2026-10-12T21-00-00Z-before-settings-2.json"))).playPort, 9300);
    });

    it("lays nothing out when a step's missing (never half done)", async () => {
        const root = await scratch();

        await writeFile(path.join(root, "VERSION"), "1\nPellagos server 2.0.0\n");
        await assert.rejects(DataFolder.open(root, { current: 3, steps: { 1: async () => {} } }), /no way forward from layout 2/);
        assert.deepEqual(await readLayout(root), { layout: 1, writtenBy: "2.0.0" });
        assert.ok(!(await exists(path.join(root, "backups"))));
    });
});
