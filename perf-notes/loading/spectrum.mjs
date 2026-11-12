// How much of each 48 kHz effect's energy is above 16 kHz (what a 32 kHz copy would lose), and of
// each 32 kHz bed's above 12 kHz / 11 kHz (what a 24 kHz or 22.05 kHz copy would lose).
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
const require = createRequire("/home/user/conquest/package.json");
const { MPEGDecoder } = require("mpg123-decoder");
const decoder = new MPEGDecoder(); await decoder.ready;
function fft(re, im) { // in-place radix-2
    const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len; const wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
// Energy above each cutoff as a share of the whole, by Welch (Hann windows of 4096)
function shares(samples, rate, cutoffs) {
    const N = 4096; const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const power = new Float64Array(N / 2);
    for (let at = 0; at + N <= samples.length || at === 0; at += N / 2) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N && at + i < samples.length; i++) re[i] = samples[at + i] * win[i]; fft(re, im); for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k]; if (at + N >= samples.length) break; }
    const total = power.reduce((s, p) => s + p, 0) || 1e-30;
    return cutoffs.map((hz) => { let s = 0; for (let k = Math.ceil(hz / (rate / N)); k < N / 2; k++) s += power[k]; return 10 * Math.log10(s / total + 1e-30); });
}
const base = "/home/user/conquest/client/sounds";
const names = (await readdir(base)).filter((n) => n.endsWith(".mp3")).sort();
const res48 = [], res32 = [];
for (const n of names) {
    await decoder.reset();
    const { channelData, sampleRate } = decoder.decode(new Uint8Array(await readFile(path.join(base, n))));
    const s = channelData[0];
    if (sampleRate === 48000) res48.push({ n, db: shares(s, sampleRate, [16000, 15000, 12000]) });
    else res32.push({ n, sec: s.length / sampleRate, db: shares(s, sampleRate, [12000, 11025, 8000]) });
}
const q = (arr, p) => arr.toSorted((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))];
for (const [i, hz] of [[0, 16000], [1, 15000], [2, 12000]]) { const v = res48.map((r) => r.db[i]); console.log(`48 kHz effects (${res48.length}): energy above ${hz} Hz relative to whole: median ${q(v, 0.5).toFixed(1)} dB, 90th pct ${q(v, 0.9).toFixed(1)} dB, max ${Math.max(...v).toFixed(1)} dB; files above -60 dB: ${v.filter((x) => x > -60).length}, above -40 dB: ${v.filter((x) => x > -40).length}`); }
console.log("  the ten 48 kHz effects with most above 16 kHz:", res48.toSorted((a, b) => b.db[0] - a.db[0]).slice(0, 10).map((r) => `${r.n.replace(/\.[0-9a-f]{8}\.mp3/, "")} ${r.db[0].toFixed(1)}`).join(", "));
console.log(`32 kHz beds (${res32.length}): energy above 12 kHz / 11.025 kHz / 8 kHz, dB relative to whole:`);
for (const r of res32.toSorted((a, b) => b.db[0] - a.db[0])) console.log(`  ${r.n.replace(/\.[0-9a-f]{8}\.mp3/, "").padEnd(18)} ${r.sec.toFixed(0).padStart(3)} s  ${r.db.map((d) => d.toFixed(1).padStart(7)).join(" ")}`);
// music
const mb = "/home/user/conquest/client/music"; const mres = [];
for (const n of (await readdir(mb)).filter((x) => x.endsWith(".mp3"))) { await decoder.reset(); const { channelData, sampleRate } = decoder.decode(new Uint8Array(await readFile(path.join(mb, n)))); mres.push(shares(channelData[0], sampleRate, [12000, 11025, 8000])); }
for (const [i, hz] of [[0, 12000], [1, 11025], [2, 8000]]) { const v = mres.map((r) => r[i]); console.log(`music (${mres.length}, 32 kHz): above ${hz} Hz: median ${q(v, 0.5).toFixed(1)} dB, 90th ${q(v, 0.9).toFixed(1)} dB, max ${Math.max(...v).toFixed(1)} dB`); }
decoder.free();
