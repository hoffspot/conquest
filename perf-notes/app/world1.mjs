// A real world in Node, as scripts/snapshot-fixture.js makes one: how many actors and links, and
// how big the save's parts are.
import { STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { encode } from "/home/user/conquest/client/js/core/wire.js";
import { linkAt } from "/home/user/conquest/client/js/core/interiors.js";

const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const seed = Number(process.argv[2] ?? 3);
const t0 = performance.now();
const world = buildWorld({ seed });
const host = new Host(world, { populate: false });
host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
host.populate();
console.log("built in", (performance.now() - t0).toFixed(0), "ms");
const me = host.battle.actor(HOST_PLAYER);
const kinds = () => { const k = {}; for (const a of host.battle.actors) k[a.kind] = (k[a.kind] ?? 0) + 1; return k; };
console.log("start: actors", host.battle.actors.length, kinds(), "links", host.battle.links.length, "me at", me.map, me.x, me.y);
for (let step = 0; step < 1200; step++) host.advance(STEP_MS);
console.log("after 60 s: actors", host.battle.actors.length, kinds(), "links", host.battle.links.length, "war turn", host.war?.turn);

// linkAt as #stepIn calls it every frame
const sq = [Math.floor(me.x), Math.floor(me.y)];
for (let run = 0; run < 3; run++) {
    const N = 20000; const s = performance.now(); let hit = 0;
    for (let i = 0; i < N; i++) hit += linkAt(host.battle.links, me.map, sq) ? 1 : 0;
    console.log(`linkAt x${N}: ${((performance.now() - s) / N * 1000).toFixed(2)} us each (links ${host.battle.links.length})`);
}

// The save's parts
const size = (label, value, enc = JSON.stringify) => {
    const times = []; let text = "";
    for (let run = 0; run < 5; run++) { const s = performance.now(); text = enc(value); times.push(performance.now() - s); }
    console.log(`${label}: ${text.length} chars (${(text.length * 2 / 1024).toFixed(0)} KB as UTF-16), encode ms ${times.map((t) => t.toFixed(2)).join(" ")}`);
    return text;
};
const snapTimes = [];
let snap;
for (let run = 0; run < 5; run++) { const s = performance.now(); snap = host.war.snapshot(); snapTimes.push(performance.now() - s); }
console.log("war.snapshot() ms", snapTimes.map((t) => t.toFixed(2)).join(" "));
size("world (war+legends, wire.encode)", { created: 1, seed, war: snap, legends: host.legends?.toJSON?.() ?? null }, encode);
const self = host.players.get(HOST_PLAYER);
size("progress", { created: 1, seed, format: 2, ...self.progress.toJSON() });
size("explored", { created: 1, seed, ...self.explored.toJSON() });
size("standing", { created: 1, seed, ...self.standing.toJSON() });
size("vitals", { created: 1, seed, vitals: host.vitalsOf?.(HOST_PLAYER) ?? null });
