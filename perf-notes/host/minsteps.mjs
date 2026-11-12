// The least each step took over several runs of the same world (the same steps each time: what's
// left is the step's own cost, not the machine's other work): mean, percentiles, the slow ones.
import { readFileSync } from "node:fs";

const runs = process.argv.slice(2).map((file) => JSON.parse(readFileSync(file, "utf8")));
const least = runs[0].map((_, k) => Math.min(...runs.map((run) => run[k])));
const sorted = [...least].sort((a, b) => a - b);
const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];

console.log(`${least.length} steps, least of ${runs.length} runs: mean ${(least.reduce((a, b) => a + b, 0) / least.length).toFixed(3)} ms, p50 ${at(0.5).toFixed(2)}, p90 ${at(0.9).toFixed(2)}, p99 ${at(0.99).toFixed(2)}, p99.9 ${at(0.999).toFixed(2)}, worst ${sorted.at(-1).toFixed(1)}`);
console.log(`over 10 ms: ${least.map((ms, k) => [ms, k]).filter(([ms]) => ms > 10).map(([ms, k]) => `${ms.toFixed(0)}@${(k * 0.05).toFixed(2)}s`).join(" ")}`);
