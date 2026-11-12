// How long the battle's steps take (host.advance(STEP_MS)), a town at peace and with a field battle
// and an invasion on (the size a phone's given: invasions.js SIZE.most.low 120): the frames that
// carry a step (one in three at 60 a second) carry this on top of their own update and drawing.
import { STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const world = buildWorld({ seed: 3 });
const host = new Host(world, { populate: false });
host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
host.populate();
const run = (label, n) => { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); host.advance(STEP_MS); t.push(performance.now() - s); } t.sort((a, b) => a - b); const q = (p) => t[Math.min(t.length - 1, Math.floor(t.length * p))].toFixed(2); console.log(`${label}: ${host.battle.actors.length} actors; step ms median ${q(0.5)}, p90 ${q(0.9)}, p99 ${q(0.99)}, max ${q(1)}; steps over 8 ms: ${t.filter((x) => x > 8).length} of ${n}`); };
run("warming (first 10 s)", 200);
for (let k = 0; k < 3; k++) run("peace", 400);
host.command(HOST_PLAYER, { type: "fieldBattle", size: Number(process.argv[2] ?? 4), facing: 0 });
host.command(HOST_PLAYER, { type: "invade" });
for (let k = 0; k < 6; k++) run(`battle +${k * 20}s`, 400);
