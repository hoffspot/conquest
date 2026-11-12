// For every recorded sound: the lowest decode rate that loses less than X dB of its energy
// (everything above that rate's Nyquist), and what the sounds would then hold decoded.
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
const require = createRequire("/home/user/conquest/package.json");
const { MPEGDecoder } = require("mpg123-decoder");
const A = "/home/user/conquest/client/js/audio/";
const { RECORDED, ON_DEMAND } = await import(A + "recorded.js");
const { SAMPLES } = await import(A + "samples.js");
const decoder = new MPEGDecoder(); await decoder.ready;
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let len = 2; len <= n; len <<= 1) { const ang = -2 * Math.PI / len; const wr = Math.cos(ang), wi = Math.sin(ang); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
const N = 4096; const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
function spectrum(samples) { const power = new Float64Array(N / 2); for (let at = 0; ; at += N / 2) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N && at + i < samples.length; i++) re[i] = samples[at + i] * win[i]; fft(re, im); for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k]; if (at + N >= samples.length) break; } return power; }
const above = (power, rate, hz) => { const total = power.reduce((s, p) => s + p, 0) || 1e-30; let s = 0; for (let k = Math.ceil(hz / (rate / N)); k < N / 2; k++) s += power[k]; return 10 * Math.log10(s / total + 1e-30); };
const RATES = [16000, 22050, 24000, 32000, 44100, 48000];
async function measure(file) { await decoder.reset(); const { channelData, sampleRate } = decoder.decode(new Uint8Array(await readFile(file))); const p = spectrum(channelData[0]); return { rate: sampleRate, samples: channelData[0].length, lost: Object.fromEntries(RATES.filter((r) => r < sampleRate).map((r) => [r, above(p, sampleRate, r / 2)])), hi: [16000, 17000, 18000, 20000].map((hz) => above(p, sampleRate, hz)) }; }
const later = new Set(ON_DEMAND);
const rows = [];
for (const [name, variants] of Object.entries(RECORDED)) for (const { file } of variants) rows.push({ name, group: later.has(name) ? "demand" : "start", bed: /Loop$|^wind|Lapping|caveDrips/.test(name) && variants.length === 1, ...(await measure(path.join("/home/user/conquest/client/sounds", file))) });
const music = [];
for (const [name, list] of Object.entries(SAMPLES)) for (const { file } of list) music.push({ name, group: "music", ...(await measure(path.join("/home/user/conquest/client/music", file))) });
const MB = (n) => (n / 1048576).toFixed(1);
const pick = (r, db) => RATES.find((rate) => rate >= r.rate || r.lost[rate] <= db);
console.log("48 kHz effects: energy above 16/17/18/20 kHz for the brightest five:"); for (const r of rows.filter((x) => x.rate === 48000).toSorted((a, b) => b.hi[0] - a.hi[0]).slice(0, 5)) console.log("   ", r.name, r.hi.map((d) => d.toFixed(1)).join(" / "));
const eff = rows.filter((x) => x.rate === 48000); const q = (v, p) => v.toSorted((a, b) => a - b)[Math.floor(v.length * p)];
console.log("48 kHz effects: above 17 kHz: median", q(eff.map((r) => r.hi[1]), 0.5).toFixed(1), "max", Math.max(...eff.map((r) => r.hi[1])).toFixed(1), "; above 18 kHz: max", Math.max(...eff.map((r) => r.hi[2])).toFixed(1));
for (const db of [-60, -50, -40]) {
    console.log(`\nLowest rate losing no more than ${db} dB of a file's energy:`);
    for (const [label, set] of [["sounds at the start", rows.filter((r) => r.group === "start")], ["sounds on demand, not beds", rows.filter((r) => r.group === "demand" && !r.bed)], ["beds", rows.filter((r) => r.bed)], ["music", music]]) {
        const now = set.reduce((s, r) => s + r.samples * 4, 0); const then = set.reduce((s, r) => s + r.samples * (pick(r, db) / r.rate) * 4, 0);
        const hist = {}; for (const r of set) hist[pick(r, db)] = (hist[pick(r, db)] ?? 0) + 1;
        console.log(`  ${label.padEnd(28)} ${String(set.length).padStart(4)} files: ${MB(now).padStart(6)} MB -> ${MB(then).padStart(6)} MB (${(100 * (1 - then / now)).toFixed(0)}% less)  rates: ${JSON.stringify(hist)}`);
    }
}
// Simple rules
const rule = (label, f) => { const parts = [["start", rows.filter((r) => r.group === "start")], ["demand effects", rows.filter((r) => r.group === "demand" && !r.bed)], ["beds", rows.filter((r) => r.bed)], ["music", music]].map(([l, set]) => `${l} ${MB(set.reduce((s, r) => s + r.samples * 4, 0))} -> ${MB(set.reduce((s, r) => s + r.samples * (Math.min(r.rate, f(r)) / r.rate) * 4, 0))}`); console.log(`${label}: ${parts.join("; ")}`); };
console.log(); rule("Rule: effects at 32 kHz, beds at 24 kHz, music as is", (r) => (r.group === "music" ? 32000 : r.bed ? 24000 : 32000));
console.log("beds counted:", rows.filter((r) => r.bed).length, "names:", [...new Set(rows.filter((r) => r.bed).map((r) => r.name))].join(","));
decoder.free();
