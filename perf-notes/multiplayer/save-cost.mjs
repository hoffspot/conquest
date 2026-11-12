// What a world server's save and a welcome cost its world's thread: a world with players spread
// over several peoples' towns (as scripts/step-budget.js sets them out), its snapshot taken and
// encoded (keeper.js save -> storage/worlds.js save: both on the world's thread, between steps).
//
//   node save-cost.mjs [players=4]
import { gzipSync } from "node:zlib";

const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { Host } = await import(`${ROOT}/host.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);
const { RACE, startFor } = await import(`${ROOT}/worldplan/plan.js`);
const { decode, encode } = await import(`${ROOT}/wire.js`);

const PLAYERS = Number(process.argv[2] ?? 4);
const peoples = Object.keys(RACE);
const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "none" } });

for (let k = 0; k < PLAYERS; k++) {
    const race = peoples[k % peoples.length];
    const { at } = startFor(world.plan, race);

    host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: "sword", boots: false }, square: [Math.round(at[0]) + Math.floor(k / peoples.length) * 3, Math.round(at[1])], map: "town" });
}

host.populate();

const steps = [];

for (let k = 0; k < 600; k++) {
    const a = performance.now();

    host.advance(STEP_MS);
    steps.push(performance.now() - a);
}

const sorted = (list) => [...list].sort((a, b) => a - b);
const med = (list) => sorted(list)[Math.floor(list.length / 2)];
const times = { snapshot: [], encode: [], decode: [] };
let text = "";

for (let k = 0; k < 9; k++) {
    let a = performance.now();
    const snapshot = host.snapshot();

    times.snapshot.push(performance.now() - a);
    a = performance.now();
    text = encode(snapshot);
    times.encode.push(performance.now() - a);
    a = performance.now();
    decode(text);
    times.decode.push(performance.now() - a);
}

const memory = process.memoryUsage();

console.log(`${PLAYERS} players over ${Math.min(PLAYERS, peoples.length)} towns (${peoples.slice(0, PLAYERS).join(", ")}): ${host.battle.actors.length} actors after 30 s`);
console.log(`  steps (no making ahead here, so the first are slow): median ${med(steps).toFixed(2)} ms, last 200 mean ${(steps.slice(-200).reduce((s, e) => s + e, 0) / 200).toFixed(2)} ms`);
console.log(`  snapshot ${(text.length / 1024).toFixed(0)} KB: snapshot() median ${med(times.snapshot).toFixed(1)} ms (${sorted(times.snapshot)[0].toFixed(1)}-${sorted(times.snapshot).at(-1).toFixed(1)}), encode ${med(times.encode).toFixed(1)} ms (${sorted(times.encode)[0].toFixed(1)}-${sorted(times.encode).at(-1).toFixed(1)}), decode ${med(times.decode).toFixed(1)} ms; gzip ${(gzipSync(text).length / 1024).toFixed(0)} KB`);
console.log(`  heap ${(memory.heapUsed / 2 ** 20).toFixed(0)} MB, external ${(memory.external / 2 ** 20).toFixed(0)} MB, rss ${(memory.rss / 2 ** 20).toFixed(0)} MB`);
