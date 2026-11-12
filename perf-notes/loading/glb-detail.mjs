// One model's buffers: which are meshopt-compressed (mode, filter), compressed vs raw size, by use
import { readFile } from "node:fs/promises";
const SEED = 0x5eed1e55; const forward = Uint8Array.from({ length: 256 }, (_, i) => i); { let s = SEED | 0; for (let i = 255; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const j = (s >>> 0) % (i + 1); [forward[i], forward[j]] = [forward[j], forward[i]]; } }
const back = new Uint8Array(256); forward.forEach((to, from) => { back[to] = from; });
for (const file of process.argv.slice(2)) {
    let bytes = await readFile(file); if (file.endsWith(".bin")) { const u = Buffer.allocUnsafe(bytes.length); for (let i = 0; i < bytes.length; i++) u[i] = back[bytes[i]]; bytes = u; }
    const jsonLen = bytes.readUInt32LE(12); const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLen));
    const use = new Map(); const mark = (acc, what) => { if (acc === undefined) return; const v = json.accessors[acc].bufferView; if (v !== undefined && !use.has(v)) use.set(v, what); };
    for (const m of json.meshes ?? []) for (const p of m.primitives) { mark(p.indices, "indices"); for (const [k, a] of Object.entries(p.attributes)) mark(a, k.replace(/_\d+$/, "")); for (const t of p.targets ?? []) for (const [k, a] of Object.entries(t)) mark(a, "morph " + k); }
    for (const a of json.animations ?? []) for (const s of a.samplers) { mark(s.input, "anim times"); mark(s.output, "anim values"); }
    for (const s of json.skins ?? []) mark(s.inverseBindMatrices, "inverse binds");
    for (const i of json.images ?? []) use.set(i.bufferView, "image");
    const by = {};
    (json.bufferViews ?? []).forEach((v, i) => { const what = use.get(i) ?? "other"; const mo = v.extensions?.EXT_meshopt_compression; const t = by[what] ||= { views: 0, stored: 0, raw: 0, modes: {} }; t.views++; t.stored += mo ? mo.byteLength : v.byteLength; t.raw += v.byteLength; const k = mo ? `${mo.mode}/${mo.filter ?? "NONE"}` : "uncompressed"; t.modes[k] = (t.modes[k] ?? 0) + 1; });
    console.log(`\n${file.split("/").slice(-2).join("/")}: ${(bytes.length / 1048576).toFixed(2)} MB, json ${(jsonLen / 1024).toFixed(0)} KB, extras.lod: ${JSON.stringify(json.extras?.lod ?? json.scenes?.[0]?.extras ?? null)?.slice(0, 120)}`);
    for (const [what, t] of Object.entries(by).sort((a, b) => b[1].stored - a[1].stored)) console.log(`  ${what.padEnd(16)} ${String(t.views).padStart(4)} views, stored ${(t.stored / 1024).toFixed(0).padStart(6)} KB, decoded ${(t.raw / 1024).toFixed(0).padStart(6)} KB  ${JSON.stringify(t.modes)}`);
    // accessor component types for attributes
    const types = {}; for (const m of json.meshes ?? []) for (const p of m.primitives) for (const [k, a] of Object.entries(p.attributes)) { const acc = json.accessors[a]; const key = `${k}:${acc.componentType}${acc.normalized ? "n" : ""}:${acc.type}`; types[key] = (types[key] ?? 0) + 1; }
    console.log("  attributes:", JSON.stringify(types));
    const an = json.animations ?? []; if (an.length) { const paths = {}; let keys = 0; for (const a of an) for (const c of a.channels) { paths[c.target.path] = (paths[c.target.path] ?? 0) + 1; } const comp = {}; for (const a of an) for (const s of a.samplers) { const o = json.accessors[s.output]; comp[`${o.componentType}${o.normalized ? "n" : ""}:${o.type}`] = (comp[`${o.componentType}${o.normalized ? "n" : ""}:${o.type}`] ?? 0) + o.count; keys += json.accessors[s.input].count; } console.log(`  animations: ${an.length} clips, channels ${JSON.stringify(paths)}, output components ${JSON.stringify(comp)}; names: ${an.map((a) => a.name).slice(0, 40).join(",")}`); }
}
