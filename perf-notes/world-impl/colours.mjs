// The buildings' corners' colours, normals, layers and texture coordinates as they're merged: their
// ranges, and what packing them into fewer bytes would lose
//   node colours.mjs [x,z]   (a place in seed 1's world: the human capital unless given)
import { load } from "./harness.mjs";
const where = process.argv[2] ?? "3696.5,4976.5";
const { buildWorld } = await load("core/overworld.js");
const { Chunks } = await load("world/chunks3d.js");
const world = buildWorld({ seed: 1 });
const chunks = new Chunks(world, { undergrowth: 0 });
const [x, z] = where.split(",").map(Number);
chunks.fill(x, z, Number(process.argv[3] ?? 1));
let guard = 0;
while (chunks.busy && guard++ < 200000) { chunks.update(x, z, { budget: 50 }); await new Promise((r) => setImmediate(r)); }
const stats = { corners: 0, colourMax: 0, colourMin: 9, over1: 0, dark: 0, layerMax: 0, layerFrac: 0, uvMax: 0, uvMin: 0, normalLen: [9, 0], distinctColours: new Set(), names: {} };
const hist = new Array(11).fill(0);
chunks.object.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.layer || o.parent?.name !== "buildings") return;
    const g = o.geometry;
    const n = g.attributes.position.count;
    stats.names[o.material.name] = (stats.names[o.material.name] ?? 0) + n;
    stats.corners += n;
    const c = g.attributes.color.array, l = g.attributes.layer.array, uv = g.attributes.uv.array, nm = g.attributes.normal.array;
    for (let i = 0; i < n * 3; i++) {
        const v = c[i];
        if (v > stats.colourMax) stats.colourMax = v;
        if (v < stats.colourMin) stats.colourMin = v;
        if (v > 1) stats.over1++;
        if (v < 0.02) stats.dark++;
        hist[Math.min(10, Math.floor(v * 10))]++;
    }
    for (let i = 0; i < n; i++) {
        if (l[i] > stats.layerMax) stats.layerMax = l[i];
        if (l[i] !== Math.round(l[i])) stats.layerFrac++;
        const len = Math.hypot(nm[i * 3], nm[i * 3 + 1], nm[i * 3 + 2]);
        if (len < stats.normalLen[0]) stats.normalLen[0] = len;
        if (len > stats.normalLen[1]) stats.normalLen[1] = len;
        stats.distinctColours.add(`${c[i * 3]},${c[i * 3 + 1]},${c[i * 3 + 2]}`);
    }
    for (let i = 0; i < n * 2; i++) {
        if (uv[i] > stats.uvMax) stats.uvMax = uv[i];
        if (uv[i] < stats.uvMin) stats.uvMin = uv[i];
    }
});
console.log(JSON.stringify({ ...stats, distinctColours: stats.distinctColours.size }, null, 1));
console.log("colour components by tenth (0 to 1, the last over 1):", hist.join(" "));
