// How the world's save (save.js saveWorld: the war's snapshot and the legends, wire.encode'd) grows
// with hours of play (a turn a minute), and what making it costs. The war alone (no host).
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { encode } from "/home/user/conquest/client/js/core/wire.js";
const hero = (name, race, weapon) => ({ name, race, weapon, boots: false, shape: {}, look: {} });
const seed = Number(process.argv[2] ?? 3);
const world = buildWorld({ seed });
const host = new Host(world, { populate: false });
host.join({ id: HOST_PLAYER, hero: hero("Ada", "human", "sword"), progress: { gold: 40 } });
const war = host.war;
const measure = () => {
    const times = []; let text = "";
    for (let run = 0; run < 3; run++) { const s = performance.now(); text = encode({ created: 1, seed, war: war.snapshot(), legends: host.legends?.toJSON?.() ?? null }); times.push((performance.now() - s).toFixed(2)); }
    const ascii = /^[\x00-\x7f]*$/.test(text);
    const snap = war.snapshot();
    const parts = Object.entries(snap).map(([k, v]) => [k, JSON.stringify(v)?.length ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(", ");
    console.log(`turn ${String(war.turn).padStart(4)} (${(war.turn / 60).toFixed(0)} h): ${text.length} chars${ascii ? " (ASCII)" : ""}; snapshot+encode ${times.join(" / ")} ms; biggest: ${parts}`);
};
measure();
for (const turns of [60, 180, 600, 1200, 3000]) { const s = performance.now(); const from = war.turn; while (war.turn < turns) war.step(); console.log(`  (${((performance.now() - s) / (turns - from)).toFixed(2)} ms a war turn here, the war alone)`); measure(); }
