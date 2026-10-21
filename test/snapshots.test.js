// Worlds kept by older versions of the game carried on (generated/world_server_plan.md §5.1): a
// snapshot of a world as each version since 26 kept it (test/fixtures/snapshots, made by npm run
// snapshot-fixture) brought forward through every step to this version, and played on. A kept
// world opened by the server (server/reopen.js): carried on from the latest save that reads,
// brought forward if it's older; refused if a newer version kept it; started afresh from its
// seed, its war and heroes kept, if it can't be carried on; and a player's solo world brought in
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { exportCharacter, saveProgress, saveTalks, saveWorld, writeSave } from "../client/js/app/save.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host, HOST_PLAYER, SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode } from "../client/js/core/wire.js";
import { CantCarryOn, freshStart, importSolo, openWorld } from "../server/reopen.js";
import { writeGzip } from "../server/storage/files.js";
import { DataFolder } from "../server/storage/folder.js";
import { NewerDataError } from "../server/storage/versions.js";
import { encode } from "../client/js/core/wire.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "snapshots");
const made = [];

const fixture = async (version) => decode(gunzipSync(await readFile(path.join(FIXTURES, `${version}.json.gz`))).toString("utf8"));
const versions = async () => (await readdir(FIXTURES)).map((name) => Number(/^(\d+)\.json\.gz$/.exec(name)?.[1])).filter(Number.isInteger).sort((a, b) => a - b);

async function scratch() {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-snapshots-"));

    made.push(folder);

    return folder;
}

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

// A world kept by the server, its latest save the snapshot given (the fixtures' world: seed 3)
async function keptWith(snapshot) {
    const folder = await DataFolder.open(await scratch());
    const stored = await folder.worlds.create({ name: "Old Haven", seed: 3, race: "human", creator: "p-ada" });

    if (snapshot) {
        await writeGzip(path.join(stored.folder, "state", "now.json.gz"), encode(snapshot));
    }

    return { folder, stored };
}

describe("worlds kept by older versions of the game, carried on (core/host.js Host.forward)", () => {
    it("has a fixture of every version from the oldest it can bring forward to this one, and a step for each", async () => {
        const kept = await versions();
        const oldest = Math.min(...Object.keys(SNAPSHOT_STEPS).map(Number));

        assert.ok(kept.includes(SNAPSHOT_VERSION), `a fixture of this version (${SNAPSHOT_VERSION}): npm run snapshot-fixture`);
        // (A step's never taken away, nor its fixture: a world kept, exported or archived by any
        // version since 26 always comes forward. contribution.md, "Never take a step away")
        assert.ok(oldest <= 26, `the oldest version a save is brought forward from (${oldest}) never rises above 26: keep every step`);

        for (let version = oldest; version < SNAPSHOT_VERSION; version++) {
            assert.equal(typeof SNAPSHOT_STEPS[version], "function", `a step from ${version}`);
            assert.ok(kept.includes(version), `a fixture of version ${version}`);
        }
    });

    it("brings every fixture forward to this version, and carries the world on from it", async () => {
        for (const version of await versions()) {
            const kept = await fixture(version);
            const forward = Host.forward(structuredClone(kept));

            assert.equal(forward.version, SNAPSHOT_VERSION, `${version}`);

            const host = Host.restore(buildWorld({ seed: kept.seed }), kept);

            assert.equal(host.battle.time, kept.battle.time, `${version}: at its time`);
            assert.deepEqual([...host.players.keys()].sort(), [HOST_PLAYER, "guest-1"].sort(), `${version}: its players`);
            assert.equal(host.war?.turn, kept.war.turn, `${version}: its war`);

            for (const player of host.players.values()) {
                assert.ok(["owner", "trusted", "player"].includes(player.role), `${version}: ${player.id}'s role`);
                assert.equal(player.away, false);
            }

            for (let step = 0; step < 100; step++) {
                host.advance(STEP_MS);
            }

            assert.equal(host.battle.time, kept.battle.time + 100 * STEP_MS, `${version}: played on`);
        }
    });

    it("refuses a world kept by a newer version, with no version, or older than any step goes back to", async () => {
        const kept = await fixture(SNAPSHOT_VERSION);

        assert.throws(() => Host.forward({ ...kept, version: SNAPSHOT_VERSION + 1 }), /kept by a newer version of the game/);
        assert.throws(() => Host.forward({ ...kept, version: undefined }), /Not a world kept by any version/);
        assert.throws(() => Host.forward({ ...kept, version: 3 }), /older version of the game \(3\) than this one can carry on/);
        assert.equal(Host.forward(kept), kept, "(this version's as it is)");
    });
});

describe("a kept world opened by the server (server/reopen.js)", () => {
    it("carries a world on from its save, brought forward from an older version's, and says so in its journal", async () => {
        const kept = await fixture(26);
        const { stored } = await keptWith(kept);
        const { host, from, forwarded } = await openWorld(stored);

        assert.equal(from, "now.json.gz");
        assert.equal(forwarded, 26);
        assert.equal(host.battle.time, kept.battle.time);
        assert.equal(host.war.turn, kept.war.turn);
        assert.match(await readFile(path.join(stored.folder, "journal.log"), "utf8"), new RegExp(`brought forward from version 26 of the game to ${SNAPSHOT_VERSION}\\.`));
    });

    it("makes a world never saved from its seed, by the server's rules", async () => {
        const { stored } = await keptWith(null);
        const { host, from } = await openWorld(stored);

        assert.equal(from, null);
        assert.deepEqual(host.rules, { rest: "everyone", debug: "none", invasions: true });
        assert.equal(host.battle.time, 0);
    });

    it("refuses a world a newer version kept, saying which server it needs", async () => {
        const { stored } = await keptWith({ ...(await fixture(SNAPSHOT_VERSION)), version: SNAPSHOT_VERSION + 1 });

        stored.writtenBy = "2.8.0";
        await assert.rejects(openWorld(stored), (error) => error instanceof NewerDataError && error.needs === "2.8.0");
    });

    it("starts a world that can't be carried on afresh from its seed: a copy made first, its war carried on, its kept heroes kept", async () => {
        const kept = await fixture(26);
        const { folder, stored } = await keptWith({ ...kept, version: 25 });

        await stored.heroes.keep("p-ada", { hero: { name: "Ada", race: "human", weapon: "sword", boots: false, shape: {}, look: {} }, progress: { gold: 5 } });
        await assert.rejects(openWorld(stored), (error) => error instanceof CantCarryOn && /version 25 of the game, older than any this one can bring forward/.test(error.message));

        const host = await freshStart(stored, { why: "the owner chose it" });

        assert.equal(host.war.turn, kept.war.turn, "(its war carried on)");
        assert.equal(host.players.size, 0);
        assert.equal((await stored.heroes.get("p-ada", 1)).progress.gold, 5, "(its kept heroes kept)");

        // (Its first save after also began its hourly and daily backups: worlds.js LADDER)
        const backups = (await readdir(path.join(folder.root, "backups", stored.id))).filter((name) => !/-(hourly|daily)$/.test(name));

        assert.equal(backups.length, 1);
        assert.match(backups[0], /-before-fresh-start$/);
        assert.deepEqual((await readdir(path.join(folder.root, "backups", stored.id, backups[0], "state"))).sort(), ["now.json.gz"], "(the copy has the old save)");
        assert.match(await readFile(path.join(stored.folder, "journal.log"), "utf8"), /Started afresh from its seed \(the owner chose it\): its war carried on from now\.json\.gz, at turn 1; its kept heroes kept\./);

        // (And it's carried on from that now: the old save one of the autosaves)
        const again = await openWorld(stored);

        assert.equal(again.from, "now.json.gz");
        assert.equal(again.forwarded, null);
        assert.equal(again.host.war.turn, kept.war.turn);
    });

    it("brings a player's solo world in: the same seed and war, their hero to be kept for whoever brings it (server/manage.js bringSolo)", async () => {
        const kept = await fixture(SNAPSHOT_VERSION);
        const items = new Map();

        globalThis.localStorage = { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) };

        try {
            const save = { hero: { name: "Ada", race: "human", weapon: "sword", boots: false, shape: { macro: {} }, look: { skin: "a", hair: "b" } }, seed: 3 };

            assert.ok(writeSave(save));
            saveProgress(save, { toJSON: () => ({ skills: { blades: 3 }, spells: [], gold: 77, pack: [], gear: null }) });
            saveTalks(save, { memory: { barkeep: ["ale"] }, knowledge: ["the road north"] });
            saveWorld(save, kept.war);

            const exported = JSON.parse(JSON.stringify(exportCharacter(save)));
            const folder = await DataFolder.open(await scratch());
            const { stored, kept: hero, turn } = await importSolo(folder.worlds, exported, { creator: "Sam" });

            assert.equal(stored.meta.seed, 3);
            assert.equal(stored.meta.race, "human");
            assert.equal(stored.meta.creator, "Sam");
            assert.equal(stored.meta.name, "Ada's world");
            assert.equal(stored.meta.heroes, "kept");
            assert.equal(turn, kept.war.turn);
            assert.equal(hero.hero.name, "Ada");
            assert.equal(hero.progress.gold, 77);
            assert.deepEqual(hero.talks.knowledge, ["the road north"]);

            const { host } = await openWorld(stored);

            assert.equal(host.war.turn, kept.war.turn, "(its war carried on)");
            assert.equal(host.players.size, 0, "(no one in it till they come)");

            // (Not an export, or a newer game's: refused)
            await assert.rejects(importSolo(folder.worlds, { kind: "something" }), /isn't a character the game kept/);
            await assert.rejects(importSolo(folder.worlds, { ...exported, version: 99 }), (error) => error.newer && /newer version/.test(error.message));
            assert.equal((await readdir(path.join(folder.root, "worlds"))).length, 1, "(nothing left of those refused)");
        } finally {
            delete globalThis.localStorage;
        }
    });
});
