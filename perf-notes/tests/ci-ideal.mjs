import { readFileSync } from "node:fs";
const runs = readFileSync("runs.tsv", "utf8").trim().split("\n").map((l) => l.split("\t"));
const t = (s) => Date.parse(s) / 1000;
const planned = { test: 20 + 21, motion: 13 + 28 }; // minutes of work as the split plans them; e2e jobs 41
const res = [];
const speeds = [];
for (const [id, , conclusion] of runs) {
    if (conclusion !== "success") continue;
    const { jobs } = JSON.parse(readFileSync(`jobs/${id}.json`, "utf8"));
    let W = 0, S = 0, max = 0; const ss = [];
    for (const j of jobs) {
        const a = (t(j.completed_at) - t(j.started_at)) / 60;
        const w = planned[j.name] ?? 41;
        const s = w / a;
        W += w; S += s; max = Math.max(max, a); ss.push(s); speeds.push(s);
    }
    // n jobs at these speeds, work shared in proportion: all end at W / S
    const ideal = W / S;
    // 20 jobs: assume the same mix of speeds twice; unit tests (20) and motion (13) can't be split, so the floor is the slowest runner's unit tests
    res.push({ id, max, ideal, mean: jobs.reduce((s, j) => s + (t(j.completed_at) - t(j.started_at)) / 60, 0) / jobs.length, slowest: Math.min(...ss), fastest: Math.max(...ss) });
}
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log("runs", res.length);
console.log("slowest job (today's wall, without queueing): median", med(res.map((r) => r.max)).toFixed(1));
console.log("mean job:", med(res.map((r) => r.mean)).toFixed(1));
console.log("if work were shared in proportion to each runner's speed (all end together): median", med(res.map((r) => r.ideal)).toFixed(1), "min; saving median", med(res.map((r) => r.max - r.ideal)).toFixed(1));
console.log("slowest runner speed / fastest in a run: median", med(res.map((r) => r.slowest / r.fastest)).toFixed(2));
speeds.sort((a, b) => a - b);
const hist = {}; for (const s of speeds) { const k = (Math.round(s * 10) / 10).toFixed(1); hist[k] = (hist[k] ?? 0) + 1; }
console.log("speed (planned/actual) histogram:", hist);
// Monte Carlo: with N e2e-style jobs drawn from the observed speeds, static equal split: expected wall for total e2e work of 379 min + unit 20 + motion 13 as today
const draw = () => speeds[Math.floor(Math.random() * speeds.length)];
const sim = (n, work) => { const out = []; for (let k = 0; k < 20000; k++) { let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, work / n / draw()); out.push(mx); } out.sort((a, b) => a - b); return [out[Math.floor(out.length / 2)], out[Math.floor(out.length * 0.9)]]; };
for (const [n, work, label] of [[10, 412, "10 jobs, today's work (379+33)"], [20, 412, "20 jobs, today's work"], [10, 412 * 0.7, "10 jobs, 30% less work"], [10, 412 * 0.5, "10 jobs, half the work"], [20, 412 * 0.5, "20 jobs, half the work"], [14, 412, "14 jobs"], [16, 412, "16 jobs"]]) { const [m, p] = sim(n, work); console.log(label.padEnd(34), "static split: wall median", m.toFixed(1), "p90", p.toFixed(1), "| speed-proportional:", (work / n / med(speeds)).toFixed(1)); }
