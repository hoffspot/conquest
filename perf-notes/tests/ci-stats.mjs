import { readFileSync } from "node:fs";
const runs = readFileSync("runs.tsv", "utf8").trim().split("\n").map((l) => l.split("\t"));
const t = (s) => (s ? Date.parse(s) / 1000 : null);
const m = (s) => (s / 60).toFixed(1);
const stat = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? `n=${b.length} min ${m(b[0])} med ${m(b[Math.floor(b.length / 2)])} p90 ${m(b[Math.floor(b.length * 0.9)])} max ${m(b.at(-1))}` : "none"; };
const stats = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? `n=${b.length} min ${b[0].toFixed(0)}s med ${b[Math.floor(b.length / 2)].toFixed(0)}s p90 ${b[Math.floor(b.length * 0.9)].toFixed(0)}s max ${b.at(-1).toFixed(0)}s` : "none"; };
const all = { wall: [], queue: [], unit: [], lint: [], motion: [], shareTest: [], shareMotion: [], shareE2e: [], e2eJob: [], testJob: [], motionJob: [], setup: [], spread: [], slowest: [], fastest: [], sumJobs: [], checkout: [], node: [], models: [], npmci: [] };
const rows = [];
for (const [id, event, conclusion, started, updated] of runs) {
    const { jobs } = JSON.parse(readFileSync(`jobs/${id}.json`, "utf8"));
    if (conclusion !== "success") { rows.push([id, event, conclusion, m(t(updated) - t(started))].join(" ")); continue; }
    const wall = t(updated) - t(started);
    all.wall.push(wall);
    const durs = [];
    let line = [id, event, m(wall)];
    for (const job of jobs) {
        const d = t(job.completed_at) - t(job.started_at);
        durs.push(d);
        all.queue.push(t(job.started_at) - t(job.created_at));
        const step = (re) => { const s = job.steps.find((x) => re.test(x.name)); return s ? t(s.completed_at) - t(s.started_at) : null; };
        const push = (k, v) => v !== null && all[k].push(v);
        push("checkout", step(/^Run actions\/checkout/)); push("node", step(/setup-node/)); push("models", step(/^Run .*licensed-models/)); push("npmci", step(/npm ci/));
        const share = step(/^Its share/);
        if (job.name === "test") { push("unit", step(/npm test/)); push("lint", step(/lint/)); push("shareTest", share); all.testJob.push(d); line.push("test " + m(d) + " (unit " + m(step(/npm test/)) + " share " + m(share) + ")"); }
        else if (job.name === "motion") { push("motion", step(/check:motion/)); push("shareMotion", share); all.motionJob.push(d); line.push("motion " + m(d) + " (mc " + m(step(/check:motion/)) + " share " + m(share) + ")"); }
        else { push("shareE2e", share); all.e2eJob.push(d); }
        const first = job.steps.find((x) => /checkout/.test(x.name)); const ci = job.steps.find((x) => /npm ci/.test(x.name));
        if (first && ci) all.setup.push(t(ci.completed_at) - t(job.started_at));
    }
    const e = jobs.filter((j) => j.name.startsWith("e2e")).map((j) => t(j.completed_at) - t(j.started_at));
    line.push("e2e " + m(Math.min(...e)) + ".." + m(Math.max(...e)));
    const qmax = Math.max(...jobs.map((j) => t(j.started_at) - t(j.created_at)));
    line.push("queueMax " + m(qmax));
    all.spread.push(Math.max(...durs) - Math.min(...durs)); all.slowest.push(Math.max(...durs)); all.fastest.push(Math.min(...durs)); all.sumJobs.push(durs.reduce((s, v) => s + v, 0));
    rows.push(line.join(" | "));
}
console.log(rows.join("\n"));
console.log();
for (const k of ["wall", "slowest", "fastest", "spread", "sumJobs", "testJob", "motionJob", "e2eJob", "unit", "motion", "shareTest", "shareMotion", "shareE2e"]) console.log(k.padEnd(12), stat(all[k]));
for (const k of ["queue", "setup", "checkout", "node", "models", "npmci", "lint"]) console.log(k.padEnd(12), stats(all[k]));
const ev = {}; for (const r of runs) { ev[r[1] + ":" + r[2]] = (ev[r[1] + ":" + r[2]] ?? 0) + 1; } console.log(ev);
