// Who allocates as a world's stepped: V8's sampling heap profiler, counting what's since been
// collected too, over a few minutes of one player in their town (a quiet world: the steady
// garbage every step makes), by function (self) and by the functions above it.
//
//     node alloc.mjs [seconds] [--invasion]
import { Session } from "node:inspector/promises";

const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { Host } = await import(`${ROOT}/host.js`);
const { buildWorld } = await import(`${ROOT}/overworld.js`);

const seconds = Number(process.argv[2] ?? 120);
const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false, rules: process.argv.includes("--invasion") ? {} : { invasions: false } });

host.join({ id: "player", hero: { name: "Solo", race: "human", shape: {}, look: {}, weapon: "sword", boots: false } });
host.populate();

for (let t = 0; t < 30000; t += STEP_MS) {
    host.advance(STEP_MS);
}

const session = new Session();

session.connect();
await session.post("HeapProfiler.enable");
await session.post("HeapProfiler.startSampling", { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });

function stepping() {
    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        host.advance(STEP_MS);
    }
}

stepping();

const { profile } = await session.post("HeapProfiler.stopSampling");
const self = new Map();
const inclusive = new Map();
let total = 0;
const label = ({ functionName, url, lineNumber }) => `${functionName || "(anonymous)"} ${url.replace(/^.*\/conquest\//, "")}:${lineNumber + 1}`;

(function walk(node, above) {
    const name = label(node.callFrame);
    const chain = above.includes(name) ? above : [...above, name];

    if (node.selfSize) {
        total += node.selfSize;
        self.set(name, (self.get(name) ?? 0) + node.selfSize);

        for (const each of chain) {
            inclusive.set(each, (inclusive.get(each) ?? 0) + node.selfSize);
        }
    }

    for (const child of node.children) {
        walk(child, chain);
    }
})(profile.head, []);

const steps = seconds * 20;
const show = (map, title, most) => {
    console.log(`\n== ${title} ==`);

    for (const [name, bytes] of [...map].sort((a, b) => b[1] - a[1]).slice(0, most)) {
        console.log(`${(bytes / steps / 1024).toFixed(1).padStart(8)} KB a step ${((bytes / total) * 100).toFixed(1).padStart(5)}%  ${name}`);
    }
};

console.log(`${seconds} s, ${host.battle.actors.length} in the world: about ${(total / steps / 1024).toFixed(0)} KB allocated a step (${(total / seconds / 2 ** 20).toFixed(1)} MB a second)`);
show(self, "allocating (self)", 28);
show(inclusive, "allocating (with what they call)", 40);
