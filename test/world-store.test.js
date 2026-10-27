// The worlds the world server keeps (generated/world_server_plan.md §5): a world made and kept,
// saved as it's played (each war turn, and when asked), five saves before the latest kept, a
// spoilt latest passed over for the newest that reads, the heroes it keeps for its players (six
// each at most), the last five crash reports its players' games sent; and a world saved by one
// process carried on by another, exactly as it was
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { MOST_CHARACTERS, SAVE_VERSION } from "../client/js/app/save.js";
import { isGuid } from "../client/js/core/guid.js";
import { CRASHES, CRASHES_FILE, reportOf } from "../server/storage/crashes.js";
import { readGzip, readJSON, writeGzip, writeJSON } from "../server/storage/files.js";
import { DataFolder } from "../server/storage/folder.js";
import { MOST_HEROES } from "../server/storage/heroes.js";
import { NewerDataError } from "../server/storage/versions.js";
import { AUTOSAVES, FORMAT_VERSION, WORLD_SETTINGS } from "../server/storage/worlds.js";

const made = [];
const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function scratch() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-worlds-"));

    made.push(folder);

    return folder;
}

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

// A world kept in a new data folder
async function kept(options = {}) {
    const folder = await DataFolder.open(await scratch());
    const world = await folder.worlds.create({ name: "Hollowmere", seed: 7, race: "elf", creator: "p-ada", ...options });

    return { folder, world };
}

// A stand-in for a snapshot of a world (only what's kept is looked at here: it's opaque)
const snapshotAt = (time) => ({ version: 27, seed: 7, battle: { time, actors: [] }, war: { version: 9 }, mark: time });

const HERO = (name) => ({ hero: { name, race: "elf", weapon: "bow", boots: false, shape: {}, look: {} }, talks: { memory: {}, knowledge: [] }, explored: {}, progress: { gold: 12 }, standing: {}, followers: [] });

describe("the worlds kept (server/storage/worlds.js)", () => {
    it("makes a world: what it is in world.json, its settings filled in, its making in its journal", async () => {
        const { folder, world } = await kept({ settings: { listed: true } });

        assert.match(world.id, /^[a-z0-9]{10}$/);
        assert.deepEqual(await folder.worlds.ids(), [world.id]);

        const stored = await readJSON(path.join(world.folder, "world.json"));

        assert.equal(stored.formatVersion, FORMAT_VERSION);
        assert.equal(stored.name, "Hollowmere");
        assert.equal(stored.seed, 7);
        assert.equal(stored.race, "elf");
        assert.equal(stored.creator, "p-ada");
        assert.equal(stored.heroes, "kept");
        assert.deepEqual(Object.keys(stored.settings), Object.keys(WORLD_SETTINGS));
        assert.equal(stored.settings.listed, true);
        assert.equal(stored.settings.pauseWhenHidden, true);
        assert.match(await readFile(path.join(world.folder, "journal.log"), "utf8"), /Z Made by p-ada: "Hollowmere", seed 7, home people Elves\.\n$/);

        // (Never saved: it's made from its seed when it's first played)
        assert.deepEqual(await (await folder.worlds.open(world.id)).load(), { snapshot: null, from: null, passed: [] });
    });

    it("refuses a world that can't be, with every reason", async () => {
        const folder = await DataFolder.open(await scratch());

        await assert.rejects(folder.worlds.create({ name: " ", seed: -1, race: "goblin", heroes: "sometimes", settings: { mostPlayers: 9 } }), (error) => {
            for (const reason of ["needs a name", "seed is a whole number", 'no people called "goblin"', "kept or brought in", "mostPlayers must be a whole number from 1 to 8"]) {
                assert.ok(error.message.includes(reason), reason);
            }

            return true;
        });
        assert.deepEqual(await folder.worlds.ids(), []);
        await assert.rejects(folder.worlds.open("../../etc"), /Not a world's id/);
    });

    it("keeps five saves before the latest, the oldest let go; world.json says when, the world's time and its versions", async () => {
        const { folder, world } = await kept();

        for (let k = 1; k <= AUTOSAVES + 2; k++) {
            await world.save(snapshotAt(k * 1000), { why: k === 1 ? "empty" : "turn", played: k * 60000 });
        }

        const state = path.join(world.folder, "state");

        assert.deepEqual((await readdir(state)).sort(), ["auto-1.json.gz", "auto-2.json.gz", "auto-3.json.gz", "auto-4.json.gz", "auto-5.json.gz", "now.json.gz"]);
        assert.equal(JSON.parse(await readGzip(path.join(state, "now.json.gz"))).mark, 7000);
        assert.equal(JSON.parse(await readGzip(path.join(state, "auto-1.json.gz"))).mark, 6000);
        assert.equal(JSON.parse(await readGzip(path.join(state, "auto-5.json.gz"))).mark, 2000);

        const again = await folder.worlds.open(world.id);

        assert.equal(again.meta.worldTime, 7000);
        assert.equal(again.meta.played, 7 * 60000);
        assert.deepEqual(again.meta.versions, { snapshot: 27, war: 9 });
        assert.ok(again.meta.savedAt);
        assert.equal((await again.load()).snapshot.mark, 7000);

        // (A war turn's save isn't in the journal: there's one a minute; others are)
        assert.equal((await readFile(path.join(world.folder, "journal.log"), "utf8")).match(/Saved/g).length, 1);
    });

    it("saves one at a time, in the order asked, each as the world was when it was asked", async () => {
        const { world } = await kept();
        const snapshot = snapshotAt(1000);
        const saving = [world.save(snapshot), world.save(snapshotAt(2000)), world.save(snapshotAt(3000))];

        // (Changed after it's asked to be saved: saved as it was)
        snapshot.mark = "changed";
        await Promise.all(saving);
        assert.equal((await world.load()).snapshot.mark, 3000);
        assert.equal(JSON.parse(await readGzip(path.join(world.folder, "state", "auto-2.json.gz"))).mark, 1000);
    });

    it("carries on from the newest save that reads when the latest is spoilt, and says so in the journal; refuses when none reads", async () => {
        const { world } = await kept();
        const state = path.join(world.folder, "state");

        for (let k = 1; k <= 3; k++) {
            await world.save(snapshotAt(k * 1000));
        }

        // (The latest cut short; the one before it gzipped but not a world)
        const whole = await readFile(path.join(state, "now.json.gz"));

        await writeFile(path.join(state, "now.json.gz"), whole.subarray(0, whole.length >> 1));
        await writeGzip(path.join(state, "auto-1.json.gz"), '{"not":"a world"}');

        const loaded = await world.load();

        assert.equal(loaded.from, "auto-2.json.gz");
        assert.equal(loaded.snapshot.mark, 1000);
        assert.deepEqual(loaded.passed.map(({ name }) => name), ["now.json.gz", "auto-1.json.gz"]);
        assert.match(await readFile(path.join(world.folder, "journal.log"), "utf8"), /now\.json\.gz couldn't be read \(.+\); auto-1\.json\.gz couldn't be read \(it isn't a snapshot of a world\): carried on from auto-2\.json\.gz\./);

        await writeFile(path.join(state, "auto-2.json.gz"), "spoilt");
        await assert.rejects(world.load(), /None of world .+'s saves could be read/);
    });

    it("refuses a world kept by a newer server, saying which it needs", async () => {
        const { folder, world } = await kept();
        const file = path.join(world.folder, "world.json");

        await writeJSON(file, { ...(await readJSON(file)), formatVersion: FORMAT_VERSION + 1, writtenBy: "2.7.0" });
        await assert.rejects(folder.worlds.open(world.id), (error) => error instanceof NewerDataError && error.needs === "2.7.0");
    });
});

describe("the heroes a world keeps (server/storage/heroes.js)", () => {
    it("keeps up to six for each player, as the game does on a device, and lists, gives back and forgets them", async () => {
        const { world } = await kept();

        assert.equal(MOST_HEROES, MOST_CHARACTERS);
        assert.deepEqual(await world.heroes.list("p-ada"), []);

        for (let k = 1; k <= MOST_HEROES; k++) {
            assert.deepEqual(await world.heroes.keep("p-ada", HERO(`Ada ${k}`)), { ok: true, slot: k });
        }

        assert.deepEqual(await world.heroes.keep("p-ada", HERO("Ada 7")), { ok: false, reason: "full" });
        assert.deepEqual((await world.heroes.list("p-ada")).map(({ slot, name, race }) => [slot, name, race]), Array.from({ length: 6 }, (_, k) => [k + 1, `Ada ${k + 1}`, "elf"]));

        // (Another's are their own)
        assert.deepEqual(await world.heroes.keep("p-bryn", HERO("Bryn")), { ok: true, slot: 1 });

        // (Kept again where it was; one forgotten, its slot the next one free)
        const ada = await world.heroes.get("p-ada", 3);

        ada.progress.gold = 99;
        await world.heroes.keep("p-ada", ada, { slot: 3 });
        assert.equal((await world.heroes.get("p-ada", 3)).progress.gold, 99);
        assert.equal(await world.heroes.forget("p-ada", 2), true);
        assert.equal(await world.heroes.forget("p-ada", 2), false);
        assert.equal(await world.heroes.get("p-ada", 2), null);
        assert.deepEqual(await world.heroes.keep("p-ada", HERO("Ada again")), { ok: true, slot: 2 });

        const stored = await readJSON(path.join(world.folder, "heroes", "p-ada", "1.json"));

        assert.equal(stored.saveVersion, SAVE_VERSION);
        assert.equal(stored.character.hero.name, "Ada 1");

        // (Each with its own id, the same every time it's given back: client/js/core/guid.js)
        const ids = await Promise.all([1, 3, 4].map(async (slot) => (await world.heroes.get("p-ada", slot)).hero.guid));

        assert.ok(ids.every(isGuid) && new Set(ids).size === 3);
        assert.equal(stored.character.hero.guid, ids[0]);
        assert.equal((await world.heroes.get("p-ada", 1)).hero.guid, ids[0]);

        // (One kept before heroes had ids: given one, and kept with it)
        await writeJSON(path.join(world.folder, "heroes", "p-ada", "5.json"), { ...stored, character: { ...stored.character, hero: { ...stored.character.hero, guid: undefined, name: "Ada 5" } } });

        const old = (await world.heroes.get("p-ada", 5)).hero.guid;

        assert.ok(isGuid(old));
        assert.equal((await world.heroes.get("p-ada", 5)).hero.guid, old);
    });

    it("refuses a player id that couldn't be one, and a hero kept by a newer server", async () => {
        const { world } = await kept();

        await assert.rejects(world.heroes.keep("../escape", HERO("Eve")), /Not a player's id/);
        await assert.rejects(world.heroes.get("p-ada", 7), /Not a hero's slot/);

        await world.heroes.keep("p-ada", HERO("Ada"));

        const file = path.join(world.folder, "heroes", "p-ada", "1.json");

        await writeJSON(file, { ...(await readJSON(file)), saveVersion: SAVE_VERSION + 1, writtenBy: "2.9.0" });
        await assert.rejects(world.heroes.get("p-ada", 1), (error) => error instanceof NewerDataError && error.needs === "2.9.0");
    });
});

describe("the crash reports a world keeps (server/storage/crashes.js)", () => {
    // A debug log as the game copies it (client/js/app/telemetry.js text()), its crash `n` minutes past the hour
    const log = (n, extra = []) => ({ build: "b1", code: "abc1234567", built: "2026-10-27T10:00:00.000Z", events: [{ kind: "crash", summary: `Crash ${n}`, at: `2026-10-27T11:${String(n).padStart(2, "0")}:00.000Z` }, ...extra] });

    it("takes a debug log with a crash among its events, and nothing else", () => {
        assert.deepEqual(reportOf(log(4, [{ kind: "freeze", summary: "A freeze" }])), { crashed: "2026-10-27T11:04:00.000Z", build: "b1", code: "abc1234567", built: "2026-10-27T10:00:00.000Z", events: log(4, [{ kind: "freeze", summary: "A freeze" }]).events });
        assert.equal(reportOf({ events: [{ kind: "freeze" }] }), null, "no crash");
        assert.equal(reportOf({ events: [] }), null);
        assert.equal(reportOf({ events: ["crash"] }), null);
        assert.equal(reportOf({ events: Array.from({ length: CRASHES.events + 1 }, () => ({ kind: "crash" })) }), null, "too many events");
        assert.equal(reportOf(null), null);
        assert.equal(reportOf({ build: 7, events: [{ kind: "crash", at: "never" }] }).crashed, null, "a crash whose time doesn't read, kept without one");
        assert.equal(reportOf({ code: "x".repeat(200), events: [{ kind: "crash" }] }).code.length, 64);
    });

    it("keeps the last five, newest first, in the world's folder; two sent at once both kept; cleared, none", async () => {
        const { world } = await kept();

        assert.deepEqual(await world.crashes.list(), []);

        const first = await world.crashes.add(reportOf(log(1)), { player: "P1", name: "Ada", from: "home", when: new Date("2026-10-27T12:00:00Z") });

        assert.match(first.id, /^[0-9a-f]{12}$/);
        assert.deepEqual({ ...first, id: null }, { id: null, received: "2026-10-27T12:00:00.000Z", crashed: "2026-10-27T11:01:00.000Z", player: "P1", name: "Ada", from: "home", build: "b1", code: "abc1234567", built: "2026-10-27T10:00:00.000Z", events: log(1).events });

        await Promise.all([2, 3, 4, 5, 6, 7].map((n) => world.crashes.add(reportOf(log(n)), { player: `P${n}` })));

        const reports = await world.crashes.list();

        assert.equal(reports.length, CRASHES.kept);
        assert.deepEqual(reports.map(({ player }) => player), ["P7", "P6", "P5", "P4", "P3"], "the newest first, the oldest let go");
        assert.deepEqual((await readJSON(path.join(world.folder, CRASHES_FILE))).reports, reports, "kept in the world's folder");

        assert.equal(await world.crashes.clear(), CRASHES.kept);
        assert.deepEqual(await world.crashes.list(), []);
        assert.equal(await world.crashes.clear(), 0);
    });

    it("starts again from none if what's kept can't be read", async () => {
        const { world } = await kept();

        await writeFile(path.join(world.folder, CRASHES_FILE), "{ spoilt");
        assert.deepEqual(await world.crashes.list(), []);
        await world.crashes.add(reportOf(log(9)), { player: "P9" });
        assert.deepEqual((await world.crashes.list()).map(({ player }) => player), ["P9"]);
    });
});

describe("a world saved, the server started again, and restored (server/keeper.js)", () => {
    // A world played in a process of its own: made and saved (`save`), or restored (`restore`),
    // then played on; what its checksums were said as JSON
    const play = async (mode, data, steps) => {
        const url = (file) => pathToFileURL(path.join(ROOT, file)).href;
        const script = `
            import { STEP_MS } from ${JSON.stringify(url("client/js/core/battle.js"))};
            import { Host } from ${JSON.stringify(url("client/js/core/host.js"))};
            import { buildWorld } from ${JSON.stringify(url("client/js/core/overworld.js"))};
            import { WorldRunner } from ${JSON.stringify(url("client/js/core/runner.js"))};
            import { Keeper } from ${JSON.stringify(url("server/keeper.js"))};
            import { DataFolder } from ${JSON.stringify(url("server/storage/folder.js"))};

            const folder = await DataFolder.open(${JSON.stringify(data)});
            const out = {};
            let host;
            let stored;

            if (${JSON.stringify(mode)} === "save") {
                stored = await folder.worlds.create({ name: "Kept", seed: 2, race: "human" }, { id: "keptworld1" });
                host = new Host(buildWorld({ seed: 2, race: "human" }), { populate: false, rules: { rest: "everyone", debug: "owner" } });
                host.populate();
                host.join({ id: "p-ada", hero: { name: "Ada", race: "human", weapon: "sword", boots: false, shape: {}, look: {} }, role: "owner" });
            } else {
                stored = await folder.worlds.open("keptworld1");
                const { snapshot, from } = await stored.load();
                host = Host.restore(buildWorld({ seed: stored.meta.seed, race: stored.meta.race }), snapshot);
                out.from = from;
                out.restored = host.checksum();
                out.time = host.battle.time;
            }

            const runner = new WorldRunner(host);
            const keeper = new Keeper(runner, stored);

            if (${JSON.stringify(mode)} === "save") {
                const me = host.battle.actor("p-ada");

                host.command("p-ada", { type: "move", to: [me.square[0] + 12, me.square[1] + 4] });
                runner.advance(${steps} * STEP_MS);
                await keeper.settled();
                out.turns = keeper.saved;
                await keeper.save("stopped");
                out.saved = host.checksum();
                out.time = host.battle.time;
            }

            runner.advance(200 * STEP_MS);
            out.after = host.checksum();
            out.war = host.war?.turn ?? null;
            console.log(JSON.stringify(out));
        `;
        const { stdout } = await run(process.execPath, ["--input-type=module", "-e", script], { cwd: ROOT, maxBuffer: 1 << 24 });

        return JSON.parse(stdout.trim().split("\n").at(-1));
    };

    it("restores it in another process exactly as it was saved, and plays on the same", async () => {
        const data = await scratch();
        const saved = await play("save", data, 1300);
        const restored = await play("restore", data);

        // (Saved on the war's turn as it came, then when it was stopped)
        assert.ok(saved.turns >= 1, `${saved.turns} saved on war turns`);
        assert.equal(restored.from, "now.json.gz");
        assert.equal(restored.time, saved.time);
        assert.equal(restored.restored, saved.saved, "the same world, to the checksum");
        assert.equal(restored.after, saved.after, "and the same 200 steps later");
        assert.equal(restored.war, saved.war);

        const meta = await readJSON(path.join(data, "worlds", "keptworld1", "world.json"));

        assert.equal(meta.worldTime, saved.time);
        assert.equal(meta.played, 1300 * 50);
        assert.match(await readFile(path.join(data, "worlds", "keptworld1", "journal.log"), "utf8"), /Saved \(stopped\)\./);
    });
});
