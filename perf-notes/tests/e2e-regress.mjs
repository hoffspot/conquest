// Least squares: a test's CI seconds against counts of what it does (static counts from its source; loops aren't unrolled)
import { readFileSync } from "node:fs";
const root = "/home/user/conquest/e2e/";
const tests = JSON.parse(readFileSync("e2e-tests.json", "utf8")).filter((t) => t.seconds !== null && ["pellagos.spec.js"].includes(t.file));
const src = {};
const feats = {
    load: /await playing\(|\.reload\(/g,
    title: /await title\(/g,
    click: /\.click\(|\.tap\(|\.dblclick\(|mouse\.(down|up|move|click)\(|keyboard\.(press|down|up|type)\(|doubleTap\(|\.fill\(|\.check\(|selectOption\(|touchscreen/g,
    evaluate: /\.evaluate\(/g,
    expectLoc: /await expect\((?!\.poll)[^)]*locator|await expect\(page\./g,
    poll: /expect\.poll\(/g,
    wff: /waitForFunction\(/g,
    playUntil: /playUntil\(/g,
    wft: /waitForTimeout\(/g,
    shot: /screenshot\(/g,
};
const X = [], y = [];
for (const t of tests) {
    src[t.file] ??= readFileSync(root + t.file, "utf8").split("\n");
    const body = src[t.file].slice(t.line - 1, t.end).join("\n");
    const row = [1];
    for (const re of Object.values(feats)) row.push((body.match(re) ?? []).length);
    X.push(row); y.push(t.seconds);
}
const names = ["const", ...Object.keys(feats)];
// normal equations with a little ridge
const n = names.length;
const A = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0);
for (let i = 0; i < X.length; i++) for (let j = 0; j < n; j++) { b[j] += X[i][j] * y[i]; for (let k = 0; k < n; k++) A[j][k] += X[i][j] * X[i][k]; }
for (let j = 0; j < n; j++) A[j][j] += 1e-6;
// gauss
for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let k = i; k < n; k++) A[r][k] -= f * A[i][k]; b[r] -= f * b[i]; } }
const w = Array(n).fill(0);
for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= A[i][k] * w[k]; w[i] = s / A[i][i]; }
const mean = y.reduce((s, v) => s + v, 0) / y.length;
let ssr = 0, sst = 0; const contrib = Array(n).fill(0);
for (let i = 0; i < X.length; i++) { let p = 0; for (let j = 0; j < n; j++) { p += w[j] * X[i][j]; contrib[j] += w[j] * X[i][j]; } ssr += (y[i] - p) ** 2; sst += (y[i] - mean) ** 2; }
console.log("tests", X.length, "total min", (y.reduce((s, v) => s + v, 0) / 60).toFixed(1), "R2", (1 - ssr / sst).toFixed(2));
for (let j = 0; j < n; j++) console.log(names[j].padEnd(10), "coef", w[j].toFixed(2).padStart(7), "s each; occurrences", String(X.reduce((s, r) => s + r[j], 0)).padStart(5), "; share of total", (contrib[j] / 60).toFixed(1).padStart(6), "min");
