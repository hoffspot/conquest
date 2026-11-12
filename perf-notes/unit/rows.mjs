// Reads a PERF_OUT file of the reviewer's hook: one line a test process, its CPU and what it built.
// node rows.mjs <file.jsonl> [how many]
import { readFileSync } from "node:fs";

const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").map((line) => JSON.parse(line));
const most = Number(process.argv[3] ?? 400);
const tests = rows.filter((row) => /\.test\.js$/.test(row.file ?? ""));
const s = (ms) => ((ms ?? 0) / 1000).toFixed(1).padStart(6);
let [cpu, lay, layN, build, buildN] = [0, 0, 0, 0, 0];

console.log("file".padEnd(34), "   CPU   wall   plan (n)  buildWorld (n)  seeds");

for (const row of tests.sort((a, b) => (b.ms.layOutWorld ?? 0) - (a.ms.layOutWorld ?? 0) || b.cpu - a.cpu).slice(0, most)) {
    console.log(row.file.split("/").pop().padEnd(34), s(row.cpu), s(row.wall), s(row.ms.layOutWorld), `(${row.calls.layOutWorld ?? 0})`.padEnd(5), s(row.ms.buildWorld), `(${row.calls.buildWorld ?? 0})`.padEnd(6), JSON.stringify(row.seeds.layOutWorld ?? {}));
}

for (const row of rows) {
    cpu += row.cpu;
    lay += row.ms.layOutWorld ?? 0;
    layN += row.calls.layOutWorld ?? 0;
    build += row.ms.buildWorld ?? 0;
    buildN += row.calls.buildWorld ?? 0;
}

console.log(`${rows.length} processes (${tests.length} test files): CPU ${s(cpu)} s; layOutWorld ${layN} calls ${s(lay)} s; buildWorld ${buildN} calls ${s(build)} s`);
