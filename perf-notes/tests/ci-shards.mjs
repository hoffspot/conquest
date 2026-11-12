import { readFileSync } from "node:fs";
const runs = readFileSync("runs.tsv", "utf8").trim().split("\n").map((l) => l.split("\t"));
const t = (s) => Date.parse(s) / 1000;
const per = {};
const table = [];
for (const [id, event, conclusion, started] of runs) {
    if (conclusion !== "success") continue;
    const { jobs } = JSON.parse(readFileSync(`jobs/${id}.json`, "utf8"));
    const row = {};
    for (const job of jobs) {
        const s = job.steps.find((x) => /^Its share/.test(x.name));
        const d = (t(s.completed_at) - t(s.started_at)) / 60;
        const key = job.name.replace("e2e (", "s").replace(" of 8)", "");
        row[key] = d;
        (per[key] ??= []).push(d);
    }
    // speed proxy for test and motion jobs: unit step and motion step
    const test = jobs.find((j) => j.name === "test"), motion = jobs.find((j) => j.name === "motion");
    const st = (job, re) => { const s = job.steps.find((x) => re.test(x.name)); return (t(s.completed_at) - t(s.started_at)) / 60; };
    row.unit = st(test, /npm test/); row.mc = st(motion, /check:motion/);
    table.push({ id, started, row });
}
const keys = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "motion", "test"];
console.log("run".padEnd(12), keys.map((k) => k.padStart(6)).join(""), "  unit   mc  ratio(share/own): test motion");
for (const { id, row } of table) console.log(id.padEnd(12), keys.map((k) => row[k].toFixed(1).padStart(6)).join(""), row.unit.toFixed(1).padStart(6), row.mc.toFixed(1).padStart(5), (row.test / row.unit).toFixed(2).padStart(8), (row.motion / row.mc).toFixed(2).padStart(6));
console.log();
for (const k of keys) { const a = per[k]; const mean = a.reduce((s, v) => s + v, 0) / a.length; const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / a.length); console.log(k.padEnd(7), "mean", mean.toFixed(1), "sd", sd.toFixed(1), "min", Math.min(...a).toFixed(1), "max", Math.max(...a).toFixed(1)); }
// only runs after the last durations.json change? print dates
console.log(table.map((x) => x.started).slice(0, 3), table.at(-1).started);
