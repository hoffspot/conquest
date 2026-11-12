import { readFileSync } from "node:fs";
const graph = JSON.parse(readFileSync("import-graph.json", "utf8"));
const times = Object.fromEntries(readFileSync("../unit-times.tsv", "utf8").trim().split("\n").map((l) => l.split("\t")).map(([f, s]) => [f, Number(s)]));
const totalTime = Object.values(times).reduce((s, v) => s + v, 0);
const tests = Object.keys(graph);
const always = tests.filter((t) => graph[t].scans || graph[t].reads);
const alwaysTime = always.reduce((s, t) => s + (times[t] ?? 0), 0);
console.log("timed files", Object.keys(times).length, "total file-seconds", totalTime.toFixed(0), "; always-run (scan/read files/spawn):", always.length, "files", alwaysTime.toFixed(0), "s =", ((alwaysTime / totalTime) * 100).toFixed(0) + "%");
const merges = readFileSync("merge-files.txt", "utf8").split("## ").filter(Boolean).map((b) => { const [h, ...files] = b.trim().split("\n"); return { h, files }; });
const reach = {};
for (const t of tests) for (const f of graph[t].files) (reach[f] ??= new Set()).add(t);
let docsOnly = 0, noClientCode = 0; const fr = []; const rows = [];
for (const { h, files } of merges) {
    const md = files.every((f) => f.endsWith(".md"));
    if (md) docsOnly++;
    const code = files.filter((f) => !f.endsWith(".md"));
    const sel = new Set(always);
    let all = false;
    for (const f of code) {
        if (f === "package.json" || f === "package-lock.json" || f.startsWith(".github/") || f === "eslint.config.js" || f === "test/helpers.js") all = true;
        for (const t of reach[f] ?? []) sel.add(t);
        if (f.startsWith("test/") && f.endsWith(".test.js")) sel.add(f);
    }
    const selected = md ? [] : all ? tests : [...sel];
    const time = selected.reduce((s, t) => s + (times[t] ?? 0), 0);
    fr.push(time / totalTime);
    const e2eTouched = files.filter((f) => f.startsWith("e2e/")).length;
    rows.push(`${h.slice(0, 7)} files ${String(files.length).padStart(3)} ${md ? "DOCS-ONLY" : ""} unit tests selected ${String(selected.length).padStart(3)}/${tests.length} time ${(time / totalTime * 100).toFixed(0).padStart(3)}%  e2e specs touched ${e2eTouched}  core ${files.filter((f) => f.startsWith("client/js/core/")).length} app ${files.filter((f) => f.startsWith("client/js/app/") || f === "client/js/main.js").length} world/chars ${files.filter((f) => /client\/js\/(world|characters|beasts)\//.test(f)).length} server ${files.filter((f) => f.startsWith("server/")).length}`);
}
console.log(rows.join("\n"));
fr.sort((a, b) => a - b);
console.log("docs-only merges:", docsOnly, "of", merges.length);
console.log("unit time selected: median", (fr[Math.floor(fr.length / 2)] * 100).toFixed(0) + "%", "mean", ((fr.reduce((s, v) => s + v, 0) / fr.length) * 100).toFixed(0) + "%", "p25", (fr[Math.floor(fr.length * 0.25)] * 100).toFixed(0) + "%", "p75", (fr[Math.floor(fr.length * 0.75)] * 100).toFixed(0) + "%");
console.log("merges under 50% of unit time:", fr.filter((v) => v < 0.5).length, "; under 25%:", fr.filter((v) => v < 0.25).length);
