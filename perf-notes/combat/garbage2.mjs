// How much a step allocates, by another way: the young generation's collections counted (and what
// each found used, summed) over many steps: node --trace-gc garbage2.mjs --n 100 | grep ...
// Here: perf_hooks' gc entries, and v8's heap statistics' own count of bytes allocated, where it has one.
import { parseArgs } from "node:util";
import { PerformanceObserver } from "node:perf_hooks";
import v8 from "node:v8";
import { muster } from "./bench.mjs";

const { values } = parseArgs({ allowPositionals: true, options: { n: { type: "string", default: "100" }, mode: { type: "string", default: "lasting" }, steps: { type: "string", default: "600" }, runs: { type: "string" }, seconds: { type: "string" }, quiet: { type: "boolean" }, battle: { type: "string" }, json: { type: "boolean" }, size: { type: "string" } } });
const { navigatorOf } = await import("/home/user/conquest/client/js/core/navigation.js");
const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
const navigation = navigatorOf(world);

for (let y = 16; y < 160; y += 32) {
    for (let x = 16; x < 160; x += 32) {
        navigation.path([x, y], [x + 1, y + 1]);
    }
}

let collections = [];
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        collections.push({ kind: entry.detail.kind, ms: entry.duration });
    }
});

observer.observe({ entryTypes: ["gc"] });

for (const n of values.n.split(",").map(Number)) {
    const { battle } = muster(n, values.mode, world);

    for (let k = 0; k < 200; k++) {
        battle.advance(50);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    collections = [];

    const steps = Number(values.steps);
    const before = v8.getHeapStatistics();
    const start = performance.now();

    for (let k = 0; k < steps; k++) {
        battle.advance(50);
    }

    const ms = performance.now() - start;

    await new Promise((resolve) => setTimeout(resolve, 20));

    const after = v8.getHeapStatistics();
    const minor = collections.filter(({ kind }) => kind === 1);
    const pause = collections.reduce((sum, each) => sum + each.ms, 0);

    console.log(`n=${n} (${values.mode}): over ${steps} steps (${ms.toFixed(0)} ms), ${minor.length} young collections and ${collections.length - minor.length} others, ${pause.toFixed(1)} ms in them in all (the longest ${Math.max(0, ...collections.map((each) => each.ms)).toFixed(2)} ms)${after.total_allocated_bytes !== undefined ? `; ${((after.total_allocated_bytes - before.total_allocated_bytes) / steps / 1024).toFixed(0)} KB allocated a step` : ""}`);
}
