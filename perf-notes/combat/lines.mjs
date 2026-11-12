// A function's self time by line (the profile's positionTicks), summed over its nodes.
import { readFileSync } from "node:fs";

const [file, wanted, top = "15"] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(file, "utf8"));
const lines = new Map();
let ticks = 0;
let all = 0;

for (const node of profile.nodes) {
    all += node.hitCount ?? 0;

    if (node.callFrame.functionName === wanted) {
        for (const { line, ticks: count } of node.positionTicks ?? []) {
            lines.set(line, (lines.get(line) ?? 0) + count);
            ticks += count;
        }
    }
}

console.log(`${wanted}: ${ticks} ticks of ${all} (${((ticks / all) * 100).toFixed(1)}% of the whole profile)`);

for (const [line, count] of [...lines].sort((a, b) => b[1] - a[1]).slice(0, Number(top))) {
    console.log(`${String(count).padStart(7)}  line ${line}`);
}
