// How much of a solo world's stepping is garbage collection, and how fast it allocates: the
// collector's own entries (perf_hooks) over a few minutes of one player standing in their town.
import { PerformanceObserver, constants } from "node:perf_hooks";

const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { Host } = await import(`${ROOT}/host.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);

const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false });

host.join({ id: "player", hero: { name: "Solo", race: "human", shape: {}, look: {}, weapon: "sword", boots: false } });
host.populate();

for (let t = 0; t < 30000; t += STEP_MS) {
    host.advance(STEP_MS);
}

let minor = 0;
let major = 0;
let minorMs = 0;
let majorMs = 0;
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        if (entry.detail.kind === constants.NODE_PERFORMANCE_GC_MINOR) {
            minor++;
            minorMs += entry.duration;
        } else {
            major++;
            majorMs += entry.duration;
        }
    }
});

observer.observe({ entryTypes: ["gc"] });

const seconds = Number(process.argv[2] ?? 300);
const { user, system } = process.threadCpuUsage();

for (let t = 0; t < seconds * 1000; t += STEP_MS) {
    host.advance(STEP_MS);

    if (t % 5000 === 0) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

await new Promise((resolve) => setTimeout(resolve, 50));

const after = process.threadCpuUsage();
const cpu = (after.user + after.system - user - system) / 1000;

console.log(`${seconds} s of a solo world (${host.battle.actors.length} in it): ${cpu.toFixed(0)} ms cpu in all (${(cpu / (seconds * 20)).toFixed(3)} ms a step); ${minor} scavenges (${minorMs.toFixed(0)} ms), ${major} other collections (${majorMs.toFixed(0)} ms): ${(((minorMs + majorMs) / cpu) * 100).toFixed(1)}% of it; a scavenge every ${((seconds * 20) / Math.max(1, minor)).toFixed(0)} steps`);
