// The cap on a world's players, and what passes 8 (generated/multiplayer_scaling_plan.md 3-33;
// server/access/cap.js): only a replicated, public, shared world on a server ready for public
// worlds; a world in lockstep never, whatever the ceiling; the ceiling up a tier at a time. And
// the pin on the cap itself: 8 for as long as no server is ready, which is today
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { MOST_PLAYERS } from "../client/js/core/netplay.js";
import { CAP_TIERS, capReason, capWorld, ceilingReason, LOCKSTEP_MOST, mayPass, mostFor, PUBLIC_NEEDS, publicReady } from "../server/access/cap.js";
import { CAPS, Settings, SETTINGS } from "../server/storage/settings.js";
import { WORLD_SETTINGS } from "../server/storage/worlds.js";
import { WorldServer } from "../server/world-server.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const PASSING = Object.freeze({ netcode: "replicated", public: true, shared: true });
const made = [];

after(async () => {
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function folder() {
    const one = await mkdtemp(path.join(os.tmpdir(), "pellagos-cap-"));

    made.push(one);

    return one;
}

describe("the cap on a world's players", () => {
    it("is 8, the game's own number, for as long as no server is ready for public worlds: the pin that changes when a tier's raised", () => {
        const { ready, missing } = publicReady();

        assert.equal(LOCKSTEP_MOST, MOST_PLAYERS);
        assert.equal(LOCKSTEP_MOST, 8);
        assert.deepEqual([...CAP_TIERS], [16, 25, 50]);
        assert.equal(ready, false, "nothing a public world needs is built");
        assert.deepEqual(missing, PUBLIC_NEEDS);
        assert.ok(missing.length > 0);

        // (Not ready, the cap is 8; ready, it's 8 or one of the tiers and nothing between)
        assert.ok(ready ? [LOCKSTEP_MOST, ...CAP_TIERS].includes(CAPS.mostPlayers) : CAPS.mostPlayers === LOCKSTEP_MOST, `the cap is ${CAPS.mostPlayers}`);
        assert.equal(SETTINGS.mostPlayersCeiling.max, CAPS.mostPlayers);
        assert.equal(WORLD_SETTINGS.mostPlayers.max, CAPS.mostPlayers);
    });

    it("lets a world pass 8 only if it's replicated, public and shared, on a server that's ready", () => {
        assert.equal(mayPass(PASSING, true), true);
        assert.equal(mayPass(PASSING, false), false, "the server's not ready");

        for (const lacking of [{ netcode: "lockstep" }, { netcode: undefined }, { public: false }, { public: undefined }, { shared: false }, { shared: "yes" }]) {
            assert.equal(mayPass({ ...PASSING, ...lacking }, true), false, JSON.stringify(lacking));
        }

        assert.equal(mayPass(null, true), false);
        assert.equal(mayPass(PASSING, "yes"), false);

        // (No world is public or shared yet, whatever its settings say)
        assert.deepEqual(capWorld({ netcode: "replicated", public: true, shared: true }), { netcode: "replicated", public: false, shared: false });
        assert.equal(mayPass(capWorld({ netcode: "replicated", public: true, shared: true }), true), false);
    });

    it("holds a world in lockstep to 8 whatever the ceiling comes to, and a passing one to the ceiling", () => {
        assert.equal(mostFor(8, 8, false), 8);
        assert.equal(mostFor(6, 8, false), 6);
        assert.equal(mostFor(8, 5, false), 5, "a ceiling lowered still holds");
        assert.equal(mostFor(25, 25, false), 8, "lockstep's cap is untouched");
        assert.equal(mostFor(25, 50, true), 25);
        assert.equal(mostFor(50, 16, true), 16);
        assert.equal(mostFor(4, 50, true), 4);
    });

    it("says why a world can't ask for more than 8", () => {
        assert.equal(capReason(8, { netcode: "lockstep" }, false), null);
        assert.equal(capReason(undefined, { netcode: "lockstep" }, false), null);
        assert.equal(capReason(16, PASSING, true), null);
        assert.match(capReason(9, { netcode: "lockstep" }, true), /above 8 .* isn't replicated or public or shared/);
        assert.match(capReason(16, { ...PASSING, shared: false }, true), /this one isn't shared\.$/);
        assert.match(capReason(16, PASSING, false), /this server isn't ready for them\.$/);
    });

    it("raises the ceiling a tier at a time, and only on a server that's ready", () => {
        assert.equal(ceilingReason(8, 8, false), null);
        assert.equal(ceilingReason(3, 8, false), null, "lowering is always allowed");
        assert.equal(ceilingReason(undefined, 8, false), null);
        assert.match(ceilingReason(16, 8, false), /waits on this server being ready/);
        assert.equal(ceilingReason(16, 8, true), null);
        assert.equal(ceilingReason(16, 4, true), null, "from a lowered ceiling, the first tier");
        assert.match(ceilingReason(25, 8, true), /the next is 16, not 25/);
        assert.match(ceilingReason(12, 8, true), /the next is 16, not 12/);
        assert.equal(ceilingReason(25, 16, true), null);
        assert.equal(ceilingReason(50, 25, true), null);
        assert.match(ceilingReason(64, 50, true), /there's none above this, not 64/);
        assert.equal(ceilingReason(16, 25, true), null, "and back down");
    });

    it("is what a server's settings and its worlds are held to", async () => {
        const settings = await Settings.open(path.join(await folder(), "server.json"));

        assert.deepEqual(await settings.change({ mostPlayersCeiling: 16 }), { ok: false, reasons: ["mostPlayersCeiling must be a whole number from 1 to 8, not 16.", "mostPlayersCeiling above 8 waits on this server being ready for public worlds."] });
        assert.equal(settings.get("mostPlayersCeiling"), 8);
        assert.deepEqual(await settings.change({ mostPlayersCeiling: 6 }), { ok: true });
        assert.deepEqual(await settings.change({ mostPlayersCeiling: 8 }), { ok: true });

        const server = await WorldServer.open(await folder(), { cost: CHEAP, awake: () => ({ stop() {} }) });

        try {
            // (A world set to replicated is no nearer passing 8: it isn't public or shared, and the server isn't ready)
            assert.equal(server.passesCap({ netcode: "replicated" }), false);
            assert.equal(server.ceilingFor({ netcode: "replicated" }), 8);
            assert.equal(server.mostPlayersOf({ settings: { mostPlayers: 25, netcode: "replicated" } }), 8, "one brought in from elsewhere asking more");
            assert.equal(server.mostPlayersOf({ settings: { mostPlayers: 25, netcode: "lockstep" } }), 8);
            assert.equal(server.overCeiling({ mostPlayers: 8 }), null);
            assert.match(server.overCeiling({ mostPlayers: 16, netcode: "replicated" }), /above 8 .* isn't public or shared/);
            assert.match(server.overCeiling({ mostPlayers: 16 }, { netcode: "replicated" }), /above 8 .* isn't public or shared/, "its netcode as it's kept");
            await assert.rejects(server.createWorld({ name: "Too many", seed: 3, race: "human", settings: { mostPlayers: 16, netcode: "replicated" } }));
        } finally {
            await server.close();
        }
    });
});
