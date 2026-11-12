// How many texels of the body's picture a metre of its skin gets (512 square), by body area: the
// screen size past which a body can't show its finest level. node texel-density.mjs
import { REPO, makeKit } from "./harness.mjs";
const kit = makeKit(64);
const human = kit.human;
const positions = human.basePositions;
const indices = human.renderIndices("body");
const uvs = human.uvs;
const source = human.renderSource;
const SIZE = 512;
const samples = [];
let area3 = 0; let areaUv = 0;
const byBone = new Map();
for (let t = 0; t < indices.length; t += 3) {
    const r = [indices[t], indices[t + 1], indices[t + 2]];
    const p = r.map((k) => [positions[source[k] * 3], positions[source[k] * 3 + 1], positions[source[k] * 3 + 2]]);
    const u = r.map((k) => [uvs[k * 2] * SIZE, uvs[k * 2 + 1] * SIZE]);
    const e1 = [0, 1, 2].map((k) => p[1][k] - p[0][k]);
    const e2 = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
    const a3 = 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
    const au = 0.5 * Math.abs((u[1][0] - u[0][0]) * (u[2][1] - u[0][1]) - (u[2][0] - u[0][0]) * (u[1][1] - u[0][1]));
    if (a3 < 1e-10 || au < 1e-10) continue;
    const density = Math.sqrt(au / a3); // texels a metre
    samples.push([density, a3]);
    area3 += a3; areaUv += au;
    const bone = human.bones[human.skinIndices[source[r[0]] * 4]].name.replace(/^(Left|Right)/, "");
    const group = /Head|Neck/.test(bone) ? "head+neck" : /Hand/.test(bone) ? "hands" : /Arm|Shoulder/.test(bone) ? "arms" : /Foot|Toe/.test(bone) ? "feet" : /Leg/.test(bone) ? "legs" : "torso";
    const g = byBone.get(group) ?? [0, 0]; g[0] += a3; g[1] += au; byBone.set(group, g);
}
samples.sort((a, b) => a[0] - b[0]);
const pct = (q) => { let acc = 0; for (const [d, a] of samples) { acc += a; if (acc >= q * area3) return d; } return samples.at(-1)[0]; };
let height = 0; for (let v = 0; v < human.vertexCount; v++) if (human.partOf[v] === 0) height = Math.max(height, positions[v * 3 + 1]);
console.log(`body ${height.toFixed(2)} m tall, skin area ${area3.toFixed(2)} m2, picture used ${(100 * areaUv / SIZE / SIZE).toFixed(0)}% of 512x512`);
console.log(`texels a metre at 512: mean ${Math.sqrt(areaUv / area3).toFixed(0)}; by area: 5% ${pct(0.05).toFixed(0)}, 25% ${pct(0.25).toFixed(0)}, median ${pct(0.5).toFixed(0)}, 75% ${pct(0.75).toFixed(0)}, 95% ${pct(0.95).toFixed(0)}, 99% ${pct(0.99).toFixed(0)}`);
for (const [group, [a3, au]] of byBone) console.log(`   ${group}: ${Math.sqrt(au / a3).toFixed(0)} texels/m (${(100 * a3 / area3).toFixed(0)}% of the skin)`);
// A body H pixels tall shows H/height pixels a metre. Its finest level (512) is sampled only where texels/pixel < 2 with
// trilinear filtering (level >= 1 everywhere otherwise): pixels/m > density/2.
for (const q of [0.5, 0.95, 0.99, 1]) {
    const d = q === 1 ? samples.at(-1)[0] : pct(q);
    console.log(`the ${q === 1 ? "densest triangle" : `${q * 100}% densest skin`} (${d.toFixed(0)} texels/m): level 0 of 512 first sampled when the body is over ${(d / 2 * height).toFixed(0)} px tall; level 1 (256) first needed over ${(d / 4 * height).toFixed(0)} px`);
}
