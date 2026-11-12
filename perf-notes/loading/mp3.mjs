// Read every MP3's headers: rate, channels, frames (so duration), and what it would hold decoded.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
function scan(buf) {
    let at = 0;
    if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) at = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
    let frames = 0, rate = 0, channels = 0, mode = -1, samples = 0, ms = 0, lr = 0, vbrFrames = null;
    while (at + 4 <= buf.length) {
        if (buf[at] !== 0xff || (buf[at + 1] & 0xe0) !== 0xe0) { at++; continue; }
        const version = (buf[at + 1] >> 3) & 3, layer = (buf[at + 1] >> 1) & 3, bi = buf[at + 2] >> 4, ri = (buf[at + 2] >> 2) & 3, pad = (buf[at + 2] >> 1) & 1;
        if (version === 1 || layer !== 1 || bi === 0 || bi === 15 || ri === 3) { at++; continue; }
        const r = RATES[version][ri]; const kbps = (version === 3 ? BR1 : BR2)[bi];
        const spf = version === 3 ? 1152 : 576;
        const len = Math.floor((spf / 8) * kbps * 1000 / r) + pad;
        const m = buf[at + 3] >> 6; const ext = (buf[at + 3] >> 4) & 3;
        if (frames === 0) {
            rate = r; mode = m; channels = m === 3 ? 1 : 2;
            // Xing/Info header?
            const side = version === 3 ? (m === 3 ? 17 : 32) : (m === 3 ? 9 : 17);
            const tag = buf.toString("latin1", at + 4 + side, at + 8 + side);
            if (tag === "Xing" || tag === "Info") { at += len; continue; }
        }
        if (m === 1 && (ext & 2)) ms++; else if (m !== 3) lr++;
        frames++; samples += spf; at += len;
    }
    return { rate, channels, mode, frames, samples, seconds: samples / rate, msShare: frames ? ms / frames : 0 };
}
const out = {};
for (const dir of ["sounds", "music"]) {
    const base = `/home/user/conquest/client/${dir}`;
    const names = (await readdir(base)).filter((n) => n.endsWith(".mp3"));
    const rows = [];
    for (const n of names) { const buf = await readFile(path.join(base, n)); rows.push({ n, bytes: buf.length, ...scan(buf) }); }
    out[dir] = rows;
    const by = {};
    for (const r of rows) { const k = `${r.rate} Hz, ${r.channels} ch (mode ${["stereo", "joint", "dual", "mono"][r.mode]})`; by[k] ||= { files: 0, mp3: 0, seconds: 0, decoded: 0, decoded48: 0, mono: 0 }; const b = by[k]; b.files++; b.mp3 += r.bytes; b.seconds += r.seconds; b.decoded += r.samples * r.channels * 4; b.decoded48 += r.seconds * 48000 * r.channels * 4; b.mono += r.samples * 4; }
    console.log(`\n== client/${dir}: ${rows.length} files, ${(rows.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(1)} MB of MP3, ${(rows.reduce((s, r) => s + r.seconds, 0) / 60).toFixed(1)} minutes`);
    for (const [k, b] of Object.entries(by)) console.log(`  ${k}: ${b.files} files, mp3 ${(b.mp3 / 1048576).toFixed(2)} MB, ${b.seconds.toFixed(0)} s, decoded float32 at own rate ${(b.decoded / 1048576).toFixed(1)} MB (at 48 kHz ${(b.decoded48 / 1048576).toFixed(1)} MB), as mono ${(b.mono / 1048576).toFixed(1)} MB, as int16 same channels ${(b.decoded / 2 / 1048576).toFixed(1)} MB`);
}
import { writeFile } from "node:fs/promises";
await writeFile("/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/loading/mp3.json", JSON.stringify(out));
