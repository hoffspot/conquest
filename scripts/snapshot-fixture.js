// npm run snapshot-fixture: a snapshot of a world as this version of the game keeps it
// (core/host.js snapshot, SNAPSHOT_VERSION), for test/snapshots.test.js to bring forward through
// every step to the current version and carry on from (generated/world_server_plan.md §5.1).
// Run it when you bump SNAPSHOT_VERSION, once your change is in: it writes
// test/fixtures/snapshots/<SNAPSHOT_VERSION>.json.gz. Keep the older ones: they're the worlds kept
// by older versions that must still load.
//
// The world: seed 3, its host's player and an elf who joined, out in the elves' town; a field
// battle under way near the host, and an invasion coming to the host's town; a minute of it
// played.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host, HOST_PLAYER, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { spawnFor } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { encode } from "../client/js/core/wire.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });

const world = buildWorld({ seed: 3 });
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
host.populate();
host.join({ id: "guest-1", hero: hero("Syl", "elf", "bow"), progress: { gold: 12 }, ...spawnFor(world, "elf") });

const ada = host.battle.actor(HOST_PLAYER);

host.command(HOST_PLAYER, { type: "move", to: [ada.square[0] + 8, ada.square[1] + 3] });
host.command(HOST_PLAYER, { type: "fieldBattle", size: 4, facing: 0 });
host.command(HOST_PLAYER, { type: "invade" });

for (let step = 0; step < 1200; step++) {
    host.advance(STEP_MS);
}

const folder = path.join(ROOT, "test", "fixtures", "snapshots");
const file = path.join(folder, `${SNAPSHOT_VERSION}.json.gz`);

mkdirSync(folder, { recursive: true });
writeFileSync(file, gzipSync(encode(host.snapshot()), { level: 9 }));
console.log(`Wrote ${path.relative(ROOT, file)}: version ${SNAPSHOT_VERSION}, ${host.battle.actors.length} in the battle, ${host.players.size} players, the war at turn ${host.war?.turn ?? "-"}`);
