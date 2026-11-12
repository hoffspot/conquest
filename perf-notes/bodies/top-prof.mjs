// Top self-time functions of a .cpuprofile: node top-prof.mjs file [n]
import { readFileSync } from "node:fs";
const profile = JSON.parse(readFileSync(process.argv[2], "utf8"));
const n = Number(process.argv[3] ?? 30);
const self = new Map();
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const dt = profile.timeDeltas;
let total = 0;
profile.samples.forEach((id, i) => {
    const node = byId.get(id);
    const f = node.callFrame;
    const key = `${f.functionName || "(anonymous)"} ${f.url.split("/").slice(-2).join("/")}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
    total += dt[i] ?? 0;
});
console.log(`total ${(total / 1000).toFixed(0)} ms`);
for (const [key, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, n)) {
    console.log(`${(t / 1000).toFixed(0).padStart(7)} ms ${((100 * t) / total).toFixed(1).padStart(5)}%  ${key}`);
}
