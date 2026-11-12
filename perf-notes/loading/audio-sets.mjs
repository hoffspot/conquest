// Per score: its recordings' decoded size; the recorded sounds downloaded at the start vs on demand; beds
import { readFile } from "node:fs/promises";
import path from "node:path";
const A = "/home/user/conquest/client/js/audio/";
const { SCORES } = await import(A + "scores.js");
const { scoreFiles, sampleFiles } = await import(A + "instruments.js");
const { RECORDED, ON_DEMAND } = await import(A + "recorded.js");
const mp3 = JSON.parse(await readFile("/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/loading/mp3.json", "utf8"));
const info = new Map([...mp3.sounds, ...mp3.music].map((r) => [r.n, r]));
const MB = (n) => (n / 1048576).toFixed(1);
const dec = (file) => { const r = info.get(path.basename(String(file))); if (!r) throw new Error("no " + file); return r; };
console.log("== Music: each score's recordings, decoded (float32 mono at 32 kHz)");
const sets = {};
for (const name of Object.keys(SCORES)) {
    const files = scoreFiles(SCORES[name]);
    sets[name] = new Set(files.map(([id]) => id));
    let d = 0, m = 0, s = 0; for (const [, url] of files) { const r = dec(url.pathname); d += r.samples * 4; m += r.bytes; s += r.seconds; }
    console.log(`  ${name.padEnd(12)} ${String(files.length).padStart(3)} recordings, mp3 ${(m / 1024).toFixed(0).padStart(4)} KB, ${s.toFixed(0).padStart(3)} s, decoded ${MB(d)} MB`);
}
const sizeOfIds = (ids) => { let d = 0; const all = new Map(sampleFiles()); for (const id of ids) d += dec(all.get(id).pathname).samples * 4; return d; };
const first = new Set([...sets.town, ...sets.tavern, ...sets.battle]);
console.log(`  FIRST (town+tavern+battle), union: ${first.size} recordings, decoded ${MB(sizeOfIds(first))} MB`);
const tavernOnly = [...sets.tavern].filter((id) => !sets.town.has(id) && !sets.battle.has(id));
const battleOnly = [...sets.battle].filter((id) => !sets.town.has(id) && !sets.tavern.has(id));
const townOnly = [...sets.town].filter((id) => !sets.tavern.has(id) && !sets.battle.has(id));
console.log(`  only the tavern's: ${tavernOnly.length}, ${MB(sizeOfIds(tavernOnly))} MB; only a fight's: ${battleOnly.length}, ${MB(sizeOfIds(battleOnly))} MB; only the town's: ${townOnly.length}, ${MB(sizeOfIds(townOnly))} MB`);
const allIds = new Set(Object.values(sets).flatMap((s) => [...s]));
console.log(`  all scores, union: ${allIds.size} recordings, decoded ${MB(sizeOfIds(allIds))} MB`);

console.log("\n== Recorded sounds (client/sounds)");
const later = new Set(ON_DEMAND);
let groups = { start: { n: 0, f: 0, d: 0, d32: 0, m: 0, s: 0 }, demand: { n: 0, f: 0, d: 0, d32: 0, m: 0, s: 0 } };
const rows = [];
for (const [name, variants] of Object.entries(RECORDED)) {
    const g = groups[later.has(name) ? "demand" : "start"]; g.n++;
    let d = 0, sec = 0, rate = 0;
    for (const { file } of variants) { const r = dec(file); g.f++; g.d += r.samples * 4; g.m += r.bytes; g.s += r.seconds; g.d32 += r.seconds * Math.min(r.rate, 32000) * 4; d += r.samples * 4; sec += r.seconds; rate = r.rate; }
    rows.push({ name, variants: variants.length, d, sec, rate, when: later.has(name) ? "demand" : "start" });
}
for (const [k, g] of Object.entries(groups)) console.log(`  ${k}: ${g.n} sounds, ${g.f} files, mp3 ${MB(g.m)} MB, ${g.s.toFixed(0)} s, decoded ${MB(g.d)} MB (if nothing were above 32 kHz: ${MB(g.d32)} MB)`);
rows.sort((a, b) => b.d - a.d);
console.log("  biggest decoded:"); for (const r of rows.slice(0, 28)) console.log(`    ${r.name.padEnd(22)} ${r.when.padEnd(6)} ${r.variants} variants ${r.sec.toFixed(1).padStart(6)} s @${r.rate} -> ${MB(r.d)} MB`);
const startRows = rows.filter((r) => r.when === "start");
console.log("  at-the-start sounds by rate:", JSON.stringify(startRows.reduce((o, r) => { o[r.rate] = (o[r.rate] ?? 0) + r.d / 1048576; return o; }, {})));
const durs = mp3.sounds.filter((r) => r.rate === 48000).map((r) => r.seconds).sort((a, b) => a - b);
console.log(`  48 kHz effects: median ${durs[durs.length >> 1].toFixed(2)} s, 90th pct ${durs[Math.floor(durs.length * 0.9)].toFixed(2)} s, longest ${durs.at(-1).toFixed(1)} s`);
