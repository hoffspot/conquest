// What three's GLTFParser alone keeps alive once a model's read (nothing in the scene or the clips
// needs it): the BIN chunk's copy (body), the JSON's text (content) and its objects (json: measured
// here with the heap before and after JSON.parse), the images' bytes (bufferView slices in
// parser.cache), and the normalized animation outputs (the clips hold Float32 copies).
// Run: node --expose-gc parser-held.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const root = "/home/user/conquest/client/models";
const SEED = 0x5eed1e55; const forward = Uint8Array.from({ length: 256 }, (_, i) => i); { let s = SEED | 0; for (let i = 255; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const j = (s >>> 0) % (i + 1); [forward[i], forward[j]] = [forward[j], forward[i]]; } }
const back = new Uint8Array(256); forward.forEach((to, from) => { back[to] = from; });
async function walk(dir) { const out = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...await walk(p)); else if (/\.(glb|bin)$/.test(e.name)) out.push(p); } return out; }
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }; const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const rows = [];
const keep = [];
for (const file of await walk(root)) {
    let bytes = await readFile(file); if (file.endsWith(".bin")) { const u = Buffer.allocUnsafe(bytes.length); for (let i = 0; i < bytes.length; i++) u[i] = back[bytes[i]]; bytes = u; }
    if (bytes.toString("latin1", 0, 4) !== "glTF") continue;
    const jsonLen = bytes.readUInt32LE(12); const text = bytes.toString("utf8", 20, 20 + jsonLen);
    globalThis.gc(); const before = process.memoryUsage().heapUsed; let json = JSON.parse(text); globalThis.gc(); const objects = process.memoryUsage().heapUsed - before;
    const body = bytes.length - 20 - jsonLen - 8;
    const images = (json.images ?? []).reduce((s, i) => s + json.bufferViews[i.bufferView].byteLength, 0);
    const outs = new Set(); for (const a of json.animations ?? []) for (const s of a.samplers) outs.add(s.output);
    let norm = 0, floatAnim = 0; for (const i of outs) { const acc = json.accessors[i]; const b = acc.count * COMPS[acc.type] * SIZE[acc.componentType]; if (acc.normalized) norm += b; else floatAnim += b; }
    // what stays needed: geometry buffers decoded + float anim + Float32 copies of normalized
    rows.push({ file: path.relative(root, file), size: bytes.length, body, text: jsonLen, objects, images, norm, freed: body + jsonLen + objects + images + norm });
    json = null;
}
const MB = (n) => (n / 1048576).toFixed(2).padStart(6);
console.log("file                                 size   | body  jsonText jsonObjs imgCopy  int16anim | parser-only total (x file size)");
for (const r of rows.sort((a, b) => b.freed - a.freed).slice(0, 22)) console.log(`${r.file.padEnd(34)} ${MB(r.size)} | ${MB(r.body)} ${MB(r.text)}  ${MB(r.objects)}  ${MB(r.images)}  ${MB(r.norm)}    | ${MB(r.freed)} MB (${(r.freed / r.size).toFixed(1)}x)`);
const by = {}; for (const r of rows) { const d = r.file.split("/")[0]; const t = by[d] ||= { n: 0, size: 0, freed: 0, objects: 0, text: 0 }; t.n++; t.size += r.size; t.freed += r.freed; t.objects += r.objects; t.text += r.text; }
for (const [d, t] of Object.entries(by)) console.log(`${d}: ${t.n} files, ${MB(t.size)} MB on disk; the parser alone keeps ${MB(t.freed)} MB if all were read (${(t.freed / t.size).toFixed(2)}x); JSON objects ${MB(t.objects)} MB from ${MB(t.text)} MB of text (${(t.objects / t.text).toFixed(1)}x)`);
const pick = (n) => rows.find((r) => r.file.endsWith(n));
for (const n of ["horse-2.bin", "werewolf-2.bin", "bellhaven-2.bin", "medieval-town-2.bin", "meshsmith-houses-2.bin", "timber-forts-2.bin", "bellhaven-keep.bin", "bellhaven-far-3.bin"]) { const r = pick(n); if (r) console.log(`${r.file}: file ${MB(r.size)}, parser-only ${MB(r.freed)} MB (body ${MB(r.body)}, json text ${MB(r.text)}, objects ${MB(r.objects)}, image copies ${MB(r.images)}, int16 anim ${MB(r.norm)})`); }
