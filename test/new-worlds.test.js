// How a world made on a server is played unless it's said (generated/multiplayer_scaling_plan.md
// 3-34; the server's newWorlds setting, WorldServer.newNetcode): lockstep, as worlds always were,
// till the server's set to make them replicated, and then only while replicated views are on.
// A world that says how it's played is played so; worlds already made don't change
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { NETCODES } from "../client/js/core/netplay.js";
import { settingReason, SETTINGS } from "../server/storage/settings.js";
import { netcodeOf, WORLD_SETTINGS } from "../server/storage/worlds.js";
import { WorldServer } from "../server/world-server.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const made = [];

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("how a new world on a server is played", () => {
    it("is a setting of the server's that defaults to lockstep, each choice a netcode there is", () => {
        assert.equal(SETTINGS.newWorlds.kind, "choice");
        assert.equal(SETTINGS.newWorlds.default, "lockstep", "today's way till the owner says otherwise");
        assert.deepEqual([...SETTINGS.newWorlds.of], [...NETCODES]);
        assert.deepEqual(Object.keys(SETTINGS.newWorlds.words), [...NETCODES]);
        assert.equal(WORLD_SETTINGS.netcode.default, "lockstep", "a world kept with no netcode said is lockstep still");
        assert.equal(settingReason("newWorlds", "replicated"), null);
        assert.equal(settingReason("newWorlds", "views.1"), 'newWorlds must be one of lockstep, replicated, not "views.1".');
    });

    it("makes worlds lockstep till it's set to replicated with replicated views on, and never changes one that's made or that says", async () => {
        const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-new-worlds-"));

        made.push(folder);

        const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });
        let seed = 1;
        const make = async (settings) => {
            const { world } = await server.createWorld({ name: `World ${seed}`, seed: seed++, race: "human", ...(settings === undefined ? {} : { settings }) });

            return server.worlds.get(world);
        };

        try {
            assert.equal(server.newNetcode, "lockstep");

            const first = await make();

            assert.equal(first.meta.settings.netcode, "lockstep");

            // (Asked for, with replicated views off or dark: lockstep still, so nobody's kept out of it)
            assert.deepEqual(await server.settings.change({ newWorlds: "replicated" }), { ok: true });
            assert.equal(server.newNetcode, "lockstep");
            assert.equal((await make()).meta.settings.netcode, "lockstep");
            await server.settings.change({ replication: "dark" });
            assert.equal(server.newNetcode, "lockstep");

            // (And with them on: replicated, unless the world says)
            await server.settings.change({ replication: "on" });
            assert.equal(server.newNetcode, "replicated");
            assert.equal((await make()).meta.settings.netcode, "replicated");
            assert.equal((await make({ listed: true })).meta.settings.netcode, "replicated", "with other settings said");
            assert.equal((await make({ netcode: "lockstep" })).meta.settings.netcode, "lockstep", "lockstep still chosen for a world");
            assert.equal(netcodeOf(first.meta), "lockstep", "one made before isn't changed");
            assert.equal(server.mostPlayersOf((await make()).meta), 8, "and a replicated world takes 8 still");

            // (Turned back: lockstep again)
            await server.settings.change({ newWorlds: "lockstep" });
            assert.equal(server.newNetcode, "lockstep");
            assert.equal((await make()).meta.settings.netcode, "lockstep");
            assert.equal((await make({ netcode: "replicated" })).meta.settings.netcode, "replicated", "replicated still chosen for a world");
        } finally {
            await server.close();
        }
    });
});
