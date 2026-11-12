// Per dungeon theme, if every kind's model is read: what the parsers alone keep (exact bytes from
// the files: BIN chunk copy + JSON text + image-bytes copies + int16 animation outputs), and the
// page's copies of the textures as an iPhone holds them (ETC2 RGB 0.5 B/px, else 1 B/px, with mips)
import { readFile } from "node:fs/promises";
const C = "/home/user/conquest/client/";
const { MODELS, modelsInside } = await import(C + "js/beasts/model.js");
const { THEMES } = await import(C + "js/core/dungeons/themes.js");
const { ASSETS } = await import(C + "js/app/assets.js");
const SEED = 0x5eed1e55; const forward = Uint8Array.from({ length: 256 }, (_, i) => i); { let s = SEED | 0; for (let i = 255; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const j = (s >>> 0) % (i + 1); [forward[i], forward[j]] = [forward[j], forward[i]]; } }
const back = new Uint8Array(256); forward.forEach((to, from) => { back[to] = from; });
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }; const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const memo = new Map();
async function held(p) {
    if (memo.has(p)) return memo.get(p);
    let bytes = await readFile(C + p); const u = Buffer.allocUnsafe(bytes.length); for (let i = 0; i < bytes.length; i++) u[i] = back[bytes[i]]; bytes = u;
    const jsonLen = bytes.readUInt32LE(12); const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLen)); const bin = bytes.subarray(20 + jsonLen + 8);
    let images = 0, tex = 0;
    for (const img of json.images ?? []) { const v = json.bufferViews[img.bufferView]; images += v.byteLength; const b = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const w = dv.getUint32(20, true), h = dv.getUint32(24, true), levels = dv.getUint32(40, true), dfd = dv.getUint32(48, true); const etc1s = dv.getUint8(dfd + 12) === 163; const alpha = etc1s ? (dv.getUint16(dfd + 10, true) - 24) / 16 === 2 : true; tex += w * h * (levels > 1 ? 4 / 3 : 1) * (etc1s && !alpha ? 0.5 : 1); }
    const outs = new Set(); for (const a of json.animations ?? []) for (const s of a.samplers) outs.add(s.output);
    let norm = 0; for (const i of outs) { const acc = json.accessors[i]; if (acc.normalized) norm += acc.count * COMPS[acc.type] * SIZE[acc.componentType]; }
    const r = { file: bytes.length, parser: bytes.length - 28 - jsonLen + jsonLen + images + norm, tex, isSkin: !(json.meshes ?? []).length };
    memo.set(p, r); return r;
}
const MB = (n) => (n / 1048576).toFixed(1).padStart(5);
for (const theme of Object.keys(THEMES)) {
    const kinds = modelsInside({ kind: "dungeon", theme }); const files = new Set();
    for (const id of kinds) { const { asset, skins = [] } = MODELS[id]; files.add(ASSETS.models[asset].files[0].path); for (const s of (ASSETS.models[`${asset}-skins`]?.files ?? []).filter(({ path }) => skins.some((skin) => skin && path.endsWith(`.${skin}.bin`)))) files.add(s.path); }
    let file = 0, parser = 0, tex = 0, skinTex = 0; for (const p of files) { const r = await held(p); file += r.file; if (!r.isSkin) parser += r.parser; tex += r.tex; if (r.isSkin) skinTex += r.tex; }
    console.log(`${theme.padEnd(10)} ${String(files.size).padStart(2)} files ${MB(file)} MB: parsers alone keep ${MB(parser)} MB; textures' page copies ${MB(tex)} MB (of which skins' ${MB(skinTex)})`);
}
