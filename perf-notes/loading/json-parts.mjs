import { readdir, readFile } from "node:fs/promises";
import zlib from "node:zlib";
const root = "/home/user/conquest/client/models/beasts";
const SEED = 0x5eed1e55; const forward = Uint8Array.from({ length: 256 }, (_, i) => i); { let s = SEED | 0; for (let i = 255; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const j = (s >>> 0) % (i + 1); [forward[i], forward[j]] = [forward[j], forward[i]]; } }
const back = new Uint8Array(256); forward.forEach((to, from) => { back[to] = from; });
const tot = {}; let all = 0, files = 0, allGz = 0, sharedTimes = 0, timeAcc = 0, uniqueTimes = 0, constOut = 0, outs = 0;
for (const n of (await readdir(root)).filter((x) => x.endsWith(".bin"))) {
    let bytes = await readFile(`${root}/${n}`); const u = Buffer.allocUnsafe(bytes.length); for (let i = 0; i < bytes.length; i++) u[i] = back[bytes[i]]; bytes = u;
    const jsonLen = bytes.readUInt32LE(12); const text = bytes.toString("utf8", 20, 20 + jsonLen); const json = JSON.parse(text);
    all += jsonLen; files++; allGz += zlib.gzipSync(Buffer.from(text)).length;
    for (const [k, v] of Object.entries(json)) tot[k] = (tot[k] ?? 0) + JSON.stringify(v).length;
    if (n === "dreadthorn.bin" || n === "order-mounted.bin") {
        console.log(n, "json", jsonLen, Object.entries(json).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length + " items," : ""}${(JSON.stringify(v).length / 1024).toFixed(0)}K`).join(" "));
        console.log("  sample accessor:", JSON.stringify(json.accessors.at(-1)), " sample sampler:", JSON.stringify(json.animations[0].samplers[0]), " sample channel:", JSON.stringify(json.animations[0].channels[0]), " sample bufferView:", JSON.stringify(json.bufferViews.at(-1)).slice(0, 300));
        const ins = new Set(); let samplers = 0; for (const a of json.animations) for (const s of a.samplers) { ins.add(s.input); samplers++; }
        const two = json.animations.flatMap((a) => a.samplers).filter((s) => json.accessors[s.output].count <= 2).length;
        console.log(`  samplers ${samplers}, distinct time accessors ${ins.size}, outputs with 2 keys or fewer (constant or a straight line): ${two}`);
    }
    for (const a of json.animations ?? []) { const ins = new Set(); for (const s of a.samplers) { ins.add(s.input); timeAcc++; outs++; if (json.accessors[s.output].count <= 2) constOut++; } uniqueTimes += ins.size; }
}
console.log(`\nbeasts: ${files} files, JSON chunks ${(all / 1048576).toFixed(1)} MB (gzip would be ${(allGz / 1048576).toFixed(1)} MB)`);
console.log(Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1048576).toFixed(1)} MB`).join(", "));
console.log(`samplers ${outs}; distinct time accessors (per clip) ${uniqueTimes}; outputs of 2 keys or fewer ${constOut} (${(100 * constOut / outs).toFixed(0)}%)`);
