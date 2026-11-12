import { readdir, readFile } from "node:fs/promises";
const root = "/home/user/conquest/client/models/beasts";
const SEED = 0x5eed1e55; const forward = Uint8Array.from({ length: 256 }, (_, i) => i); { let s = SEED | 0; for (let i = 255; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const j = (s >>> 0) % (i + 1); [forward[i], forward[j]] = [forward[j], forward[i]]; } }
const back = new Uint8Array(256); forward.forEach((to, from) => { back[to] = from; });
function ktx2(b) { const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const w = dv.getUint32(20, true), h = dv.getUint32(24, true), levels = dv.getUint32(40, true), dfdOff = dv.getUint32(48, true); const model = dv.getUint8(dfdOff + 12); const samples = (dv.getUint16(dfdOff + 10, true) - 24) / 16; const chan = dv.getUint8(dfdOff + 4 + 24 + 3) & 0xf; return { kind: model === 163 ? "ETC1S" : "UASTC", w, h, levels, alpha: model === 163 ? samples === 2 : chan === 4 }; }
const groups = {};
for (const n of (await readdir(root)).filter((x) => x.endsWith(".bin"))) {
    let bytes = await readFile(`${root}/${n}`); const u = Buffer.allocUnsafe(bytes.length); for (let i = 0; i < bytes.length; i++) u[i] = back[bytes[i]]; bytes = u;
    const jsonLen = bytes.readUInt32LE(12); const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLen)); const bin = bytes.subarray(20 + jsonLen + 8);
    let phone = 0, rgba = 0; const kinds = [];
    for (const img of json.images ?? []) { const v = json.bufferViews[img.bufferView]; const k = ktx2(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)); const px = k.w * k.h * (k.levels > 1 ? 4 / 3 : 1); phone += px * (k.kind === "ETC1S" && !k.alpha ? 0.5 : 1); rgba += px * 4; kinds.push(`${k.kind}${k.alpha ? "+A" : ""} ${k.w}`); }
    const base = n.split(".")[0].replace(/-\d+$/, ""); const isSkin = n.split(".").length === 3;
    const g = groups[base] ||= { model: null, skins: [] }; const row = { n, mb: bytes.length / 1048576, phone: phone / 1048576, rgba: rgba / 1048576, textures: kinds.length };
    if (isSkin) g.skins.push(row); else (g.model ??= row);
}
console.log("kind: model's own textures (iPhone compressed MB / RGBA fallback MB) + its skins (count, MB compressed / RGBA)");
for (const [k, g] of Object.entries(groups).filter(([, g]) => g.skins.length).sort()) console.log(`  ${k.padEnd(16)} model ${g.model ? `${g.model.textures} tex ${g.model.phone.toFixed(1)}/${g.model.rgba.toFixed(1)}` : "-"}; skins ${g.skins.length}: ${g.skins.reduce((s, r) => s + r.textures, 0)} tex ${g.skins.reduce((s, r) => s + r.phone, 0).toFixed(1)}/${g.skins.reduce((s, r) => s + r.rgba, 0).toFixed(1)} MB`);
