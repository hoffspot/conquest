// What a player waits for at each kind of dungeon's door: its creatures' model files (and skins)
import { readFile } from "node:fs/promises";
import zlib from "node:zlib";
const C = "/home/user/conquest/client/";
const { MODELS, modelsInside } = await import(C + "js/beasts/model.js");
const { THEMES } = await import(C + "js/core/dungeons/themes.js");
const { ASSETS } = await import(C + "js/app/assets.js");
const gzOf = new Map();
async function gz(p) { if (!gzOf.has(p)) { try { gzOf.set(p, zlib.gzipSync(await readFile(C + p), { level: 6 }).length); } catch { gzOf.set(p, null); } } return gzOf.get(p); }
for (const theme of Object.keys(THEMES)) {
    const kinds = modelsInside({ kind: "dungeon", theme });
    const files = new Map();
    for (const id of kinds) { const { asset, skins = [] } = MODELS[id]; const f = ASSETS.models[asset].files[0]; files.set(f.path, f.bytes); for (const s of (ASSETS.models[`${asset}-skins`]?.files ?? []).filter(({ path }) => skins.some((skin) => skin && path.endsWith(`.${skin}.bin`)))) files.set(s.path, s.bytes); }
    let bytes = 0, z = 0; for (const [p, b] of files) { bytes += b; z += (await gz(p)) ?? b; }
    console.log(`${theme.padEnd(14)} ${String(kinds.length).padStart(2)} kinds from models, ${String(files.size).padStart(2)} files, ${(bytes / 1048576).toFixed(1).padStart(5)} MB (gzipped whole: ${(z / 1048576).toFixed(1)} MB)  ${kinds.join(",").slice(0, 150)}`);
}
const tiers = {}; let n = 0, total = 0; for (const [name, m] of Object.entries(ASSETS.models)) { const t = tiers[m.tier] ||= { n: 0, bytes: 0 }; t.n++; for (const f of m.files) { t.bytes += f.bytes; total += f.bytes; n++; } }
console.log("catalog:", Object.entries(tiers).map(([k, t]) => `${k}: ${t.n} entries ${(t.bytes / 1048576).toFixed(1)} MB`).join("; "), `; ${n} files ${(total / 1048576).toFixed(1)} MB`);
console.log("near tier:", Object.entries(ASSETS.models).filter(([, m]) => m.tier === "near").map(([k, m]) => `${k} ${(m.files.reduce((s, f) => s + f.bytes, 0) / 1024).toFixed(0)}K`).join(", ").slice(0, 600));
