import { readFileSync, readdirSync } from "node:fs";
const t = (s) => Date.parse(s) / 1000;
const jobs = [];
for (const dir of ["jobs", "jobs2"]) for (const f of readdirSync(dir)) {
    const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")).jobs ?? [];
    for (const job of j) if (job.started_at && job.completed_at && job.conclusion !== "skipped") jobs.push({ wf: job.workflow_name, name: job.name, created: t(job.created_at), start: t(job.started_at), end: t(job.completed_at), mac: job.labels?.some((l) => /macos/.test(l)), run: job.run_id, concl: job.conclusion });
}
console.log("jobs", jobs.length);
// concurrency timeline (linux only)
const ev = [];
for (const j of jobs.filter((j) => !j.mac)) { ev.push([j.start, 1]); ev.push([j.end, -1]); }
ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
let n = 0, max = 0, last = ev[0][0]; const hist = {};
for (const [time, d] of ev) { hist[n] = (hist[n] ?? 0) + (time - last); last = time; n += d; max = Math.max(max, n); }
console.log("max concurrent linux jobs", max);
const total = Object.values(hist).reduce((s, v) => s + v, 0);
for (const k of Object.keys(hist).map(Number).sort((a, b) => a - b)) if (hist[k] > 60) console.log(String(k).padStart(3), (hist[k] / 3600).toFixed(2) + " h", ((hist[k] / total) * 100).toFixed(1) + "%");
// queued jobs: how many were running when created
const queued = jobs.filter((j) => j.start - j.created > 60);
console.log("jobs queued over 60 s:", queued.length, "of", jobs.length);
const byRun = {};
for (const q of queued) (byRun[q.run] ??= []).push(q);
for (const [run, qs] of Object.entries(byRun)) {
    const at = Math.min(...qs.map((q) => q.created));
    const running = jobs.filter((j) => !j.mac && j.start <= at + 5 && j.end > at + 5).length;
    console.log(run, qs[0].wf, "queued", qs.length, "jobs, wait", Math.round(Math.min(...qs.map((q) => q.start - q.created))) + ".." + Math.round(Math.max(...qs.map((q) => q.start - q.created))) + " s; linux jobs running at creation+5s:", running, qs[0].mac ? "(mac)" : "");
}
// pages workflow durations
const pages = jobs.filter((j) => j.wf === "Deploy to GitHub Pages" && j.name === "build" && j.concl === "success").map((j) => (j.end - j.start) / 60);
console.log("pages build min:", pages.map((v) => v.toFixed(1)).join(" "));
const mac = jobs.filter((j) => j.wf === "Mac app").map((j) => j.name + " " + ((j.end - j.start) / 60).toFixed(1));
console.log("mac jobs:", mac.join(", "));
