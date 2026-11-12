// Inspect every model (.glb, and the scrambled .bin, unscrambled in memory only): extensions,
// meshes, triangles, animations, and each texture's format, size and what it takes on the GPU.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
const root = "/home/user/conquest/client/models";
const SEED = 0x5eed1e55;
const forward = Uint8Array.from({ length: 256 }, (_, i) => i); { let s = SEED | 0; for (let i = 255; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const j = (s >>> 0) % (i + 1); [forward[i], forward[j]] = [forward[j], forward[i]]; } }
const back = new Uint8Array(256); forward.forEach((to, from) => { back[to] = from; });
async function walk(dir) { const out = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...await walk(p)); else if (/\.(glb|bin)$/.test(e.name)) out.push(p); } return out; }
function ktx2(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const vk = dv.getUint32(12, true), w = dv.getUint32(20, true), h = dv.getUint32(24, true), levels = dv.getUint32(40, true), scheme = dv.getUint32(44, true), dfdOff = dv.getUint32(48, true);
    const model = dv.getUint8(dfdOff + 4 + 8); const samples = (dv.getUint16(dfdOff + 4 + 6, true) - 24) / 16;
    // alpha: ETC1S has 2 slices (samples 2) when alpha; UASTC channel id 3 = RGB, 4 = RGBA
    const chan = dv.getUint8(dfdOff + 4 + 24 + 3) & 0xf;
    const kind = model === 163 ? "ETC1S" : model === 166 ? "UASTC" : `vk${vk}`;
    const alpha = model === 163 ? samples === 2 : chan === 4 || chan === 5;
    return { kind, w, h, levels, scheme, alpha };
}
function png(b) { return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 6 || b[25] === 4 }; }
function jpg(b) { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), alpha: false }; i += 2 + b.readUInt16BE(i + 2); } return { w: 0, h: 0 }; }
function webp(b) { const f = b.toString("latin1", 12, 16); if (f === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: Boolean(b[20] & 0x10) }; if (f === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false }; if (f === "VP8L") { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff), alpha: Boolean((v >> 28) & 1) }; } return { w: 0, h: 0 }; }
const mips = 4 / 3;
const rows = []; const totals = {};
for (const file of await walk(root)) {
    let bytes = await readFile(file);
    const scrambled = file.endsWith(".bin");
    if (scrambled) { const u = Buffer.allocUnsafe(bytes.length); for (let i = 0; i < bytes.length; i++) u[i] = back[bytes[i]]; bytes = u; }
    if (bytes.toString("latin1", 0, 4) !== "glTF") { rows.push({ file, note: "not a GLB" }); continue; }
    const jsonLen = bytes.readUInt32LE(12); const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLen)); const binStart = 20 + jsonLen + 8; const bin = bytes.subarray(binStart);
    const view = (i) => { const v = json.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
    const images = (json.images ?? []).map((img) => { const b = view(img.bufferView); const mime = img.mimeType; const d = mime === "image/ktx2" ? ktx2(b) : mime === "image/png" ? png(b) : mime === "image/jpeg" ? jpg(b) : mime === "image/webp" ? webp(b) : { w: 0, h: 0 }; const px = d.w * d.h; const gpu = mime === "image/ktx2" ? px * (d.kind === "ETC1S" && !d.alpha ? 0.5 : 1) * (d.levels > 1 ? mips : 1) : px * 4 * mips; return { mime, bytes: b.length, ...d, gpu, raw: px * 4 * mips }; });
    let tris = 0, verts = 0; const seenAcc = new Set();
    for (const m of json.meshes ?? []) for (const p of m.primitives) { const acc = p.indices !== undefined ? json.accessors[p.indices] : json.accessors[p.attributes.POSITION]; tris += acc.count / 3; if (!seenAcc.has(p.attributes.POSITION)) { seenAcc.add(p.attributes.POSITION); verts += json.accessors[p.attributes.POSITION].count; } }
    const imgViews = new Set((json.images ?? []).map((i) => i.bufferView));
    const animAcc = new Set(); for (const a of json.animations ?? []) for (const s of a.samplers) { animAcc.add(s.input); animAcc.add(s.output); }
    const animViews = new Set([...animAcc].map((a) => json.accessors[a].bufferView));
    let imgBytes = 0, animBytes = 0, geoBytes = 0; (json.bufferViews ?? []).forEach((v, i) => { if (imgViews.has(i)) imgBytes += v.byteLength; else if (animViews.has(i)) animBytes += v.byteLength; else geoBytes += v.byteLength; });
    // uncompressed animation size (what three.js holds as Float32 tracks)
    let animFloats = 0; for (const a of animAcc) { const acc = json.accessors[a]; animFloats += acc.count * ({ SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type] ?? 1); }
    const lods = json.extras?.lod ? "lods" : "";
    rows.push({ file: path.relative(root, file), size: bytes.length, gz: zlib.gzipSync(bytes, { level: 6 }).length, ext: (json.extensionsUsed ?? []).join(","), meshes: (json.meshes ?? []).length, prims: (json.meshes ?? []).reduce((s, m) => s + m.primitives.length, 0), tris: Math.round(tris), verts, joints: Math.max(0, ...(json.skins ?? []).map((s) => s.joints.length)), anims: (json.animations ?? []).length, imgBytes, animBytes, geoBytes, animMB: animFloats * 4 / 1048576, images, lods, materials: (json.materials ?? []).length });
}
const MB = (n) => (n / 1048576).toFixed(2);
// Summaries by folder
const byDir = {};
for (const r of rows) { if (r.note) { console.log("NOT GLB:", r.file); continue; } const d = r.file.split("/")[0]; const t = byDir[d] ||= { files: 0, size: 0, gz: 0, img: 0, anim: 0, geo: 0, gpu: 0, raw: 0, kinds: {}, ext: {}, animMB: 0, tris: 0 }; t.files++; t.size += r.size; t.gz += r.gz; t.img += r.imgBytes; t.anim += r.animBytes; t.geo += r.geoBytes; t.animMB += r.animMB; t.tris += r.tris; for (const e of r.ext.split(",")) t.ext[e] = (t.ext[e] ?? 0) + 1; for (const i of r.images) { const k = i.mime === "image/ktx2" ? `ktx2 ${i.kind}${i.alpha ? "+A" : ""} ${i.w}x${i.h}${i.levels > 1 ? " mips" : " NO-mips"}` : `${i.mime} ${i.w}x${i.h}`; t.kinds[k] = (t.kinds[k] ?? 0) + 1; t.gpu += i.gpu; t.raw += i.raw; } }
for (const [d, t] of Object.entries(byDir)) { console.log(`\n== models/${d}: ${t.files} files, ${MB(t.size)} MB (gzip ${MB(t.gz)}); inside: textures ${MB(t.img)}, animation ${MB(t.anim)}, geometry+rest ${MB(t.geo)}; ${t.tris} triangles (all LODs)`); console.log(`   extensions: ${JSON.stringify(t.ext)}`); console.log(`   textures on the GPU if all loaded: ${MB(t.gpu)} MB compressed (would be ${MB(t.raw)} MB as RGBA8+mips); animations as Float32 tracks: ${t.animMB.toFixed(1)} MB`); console.log(`   texture kinds: ${Object.entries(t.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}x ${k}`).join("; ")}`); }
console.log("\n== The twelve biggest models");
for (const r of rows.filter((r) => !r.note).sort((a, b) => b.size - a.size).slice(0, 12)) console.log(`  ${r.file.padEnd(34)} ${MB(r.size).padStart(6)} MB gz ${MB(r.gz).padStart(6)}: tex ${MB(r.imgBytes)} anim ${MB(r.animBytes)} (${r.anims} clips, ${r.animMB.toFixed(1)} MB as floats) geo ${MB(r.geoBytes)}; ${r.tris} tris, ${r.joints} joints, ${r.prims} prims, ${r.materials} mats; GPU tex ${MB(r.images.reduce((s, i) => s + i.gpu, 0))} MB: ${Object.entries(r.images.reduce((o, i) => { const k = `${i.kind ?? i.mime} ${i.w}`; o[k] = (o[k] ?? 0) + 1; return o; }, {})).map(([k, n]) => `${n}x${k}`).join(",")}`);
const nonK = rows.filter((r) => !r.note && r.images.some((i) => i.mime !== "image/ktx2"));
console.log(`\n== Models with textures that are NOT KTX2: ${nonK.length}`); for (const r of nonK) console.log(`  ${r.file}: ${r.images.filter((i) => i.mime !== "image/ktx2").map((i) => `${i.mime} ${i.w}x${i.h} ${(i.bytes / 1024).toFixed(0)}K -> ${MB(i.gpu)} MB GPU`).join("; ")}`);
const noMesh = rows.filter((r) => !r.note && !r.ext.includes("EXT_meshopt_compression")); console.log(`\n== Models without EXT_meshopt_compression: ${noMesh.length}: ${noMesh.map((r) => `${r.file} (${MB(r.size)} MB, gz ${MB(r.gz)})`).join(", ")}`);
const big = rows.filter((r) => !r.note).flatMap((r) => r.images.filter((i) => i.w >= 2048 || i.h >= 2048).map((i) => `${r.file}: ${i.kind ?? i.mime} ${i.w}x${i.h}`)); console.log(`\n== Textures 2048 or more on a side: ${big.length}`); console.log(big.slice(0, 40).join("\n"));
const all = rows.filter((r) => !r.note); console.log(`\nAll: ${all.length} models, ${MB(all.reduce((s, r) => s + r.size, 0))} MB, gzip ${MB(all.reduce((s, r) => s + r.gz, 0))} MB`);
