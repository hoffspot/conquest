import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
const root = "/home/user/conquest";
const g = JSON.parse(readFileSync("import-graph.json", "utf8"));
const reach = {};
for (const t in g) for (const f of g[t].files) (reach[f] ??= new Set()).add(t);
const walk = (dir, out = []) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!["vendor", "node_modules"].includes(e.name)) walk(p, out); } else if (e.name.endsWith(".js")) out.push(p); } return out; };
const files = [...walk(path.join(root, "client/js")), ...walk(path.join(root, "server")), ...walk(path.join(root, "scripts"))].map((f) => ({ f: path.relative(root, f), lines: readFileSync(f, "utf8").split("\n").length }));
const byDir = {};
for (const { f, lines } of files) { const d = f.split("/").slice(0, f.startsWith("client/js/") ? 3 : 1).join("/"); const b = (byDir[d] ??= { files: 0, lines: 0, unFiles: 0, unLines: 0 }); b.files++; b.lines += lines; if (!reach[f]) { b.unFiles++; b.unLines += lines; } }
console.log("dir".padEnd(26), "files  lines   not imported by any unit test: files  lines");
for (const [d, b] of Object.entries(byDir).sort((a, b) => b[1].lines - a[1].lines)) console.log(d.padEnd(26), String(b.files).padStart(5), String(b.lines).padStart(7), String(b.unFiles).padStart(24), String(b.unLines).padStart(7), ((b.unLines / b.lines) * 100).toFixed(0).padStart(4) + "%");
const un = files.filter(({ f }) => !reach[f]).sort((a, b) => b.lines - a.lines);
console.log("\nlargest files no unit test imports (directly or indirectly):");
for (const { f, lines } of un.slice(0, 45)) console.log(String(lines).padStart(6), f);
console.log("\ncore files no unit test imports:", un.filter(({ f }) => f.startsWith("client/js/core/")).map(({ f, lines }) => f + " (" + lines + ")").join(", ") || "none");
// thinly reached: only 1-2 tests reach
const thin = files.filter(({ f }) => reach[f] && reach[f].size <= 2 && f.startsWith("client/js/core/")).sort((a, b) => b.lines - a.lines).slice(0, 15);
console.log("\ncore files only 1-2 tests reach:", thin.map(({ f, lines }) => f.replace("client/js/core/", "") + " (" + lines + "L, " + reach[f].size + ")").join(", "));
const tl = readdirSync(path.join(root, "test")).filter((f) => f.endsWith(".test.js")).reduce((s, f) => s + readFileSync(path.join(root, "test", f), "utf8").split("\n").length, 0);
console.log("\nunit test lines:", tl, "; game.js lines:", files.find(({ f }) => f === "client/js/app/game.js")?.lines, "main.js:", files.find(({ f }) => f === "client/js/main.js")?.lines, "host.js:", files.find(({ f }) => f === "client/js/core/host.js")?.lines, "battle.js:", files.find(({ f }) => f === "client/js/core/battle.js")?.lines);
