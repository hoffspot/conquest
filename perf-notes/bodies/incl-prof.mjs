// Inclusive time of functions in a .cpuprofile (each counted once per stack): node incl-prof.mjs file [n] [filter]
import { readFileSync } from "node:fs";
const profile = JSON.parse(readFileSync(process.argv[2], "utf8"));
const n = Number(process.argv[3] ?? 40);
const filter = process.argv[4] ?? "";
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
const keyOf = (node) => { const f = node.callFrame; return `${f.functionName || "(anonymous)"} ${f.url.split("/").slice(-2).join("/")}:${f.lineNumber + 1}`; };
const incl = new Map();
let total = 0;
profile.samples.forEach((id, i) => {
    const d = profile.timeDeltas[i] ?? 0;
    total += d;
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) {
        const key = keyOf(byId.get(at));
        if (!seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) ?? 0) + d); }
    }
});
console.log(`total ${(total / 1000).toFixed(0)} ms`);
for (const [key, t] of [...incl].filter(([k]) => k.includes(filter)).sort((a, b) => b[1] - a[1]).slice(0, n)) {
    console.log(`${(t / 1000).toFixed(0).padStart(7)} ms ${((100 * t) / total).toFixed(1).padStart(5)}%  ${key}`);
}
