import { load } from "./harness.mjs";
const { buildWorld, CHUNK, CHUNKS } = await load("core/overworld.js");
const world = buildWorld({ seed: 1 });
const ow = world.maps.town;
const plan = world.plan;
const { BIOMES } = await load("core/worldplan.js").catch(() => ({}));
console.log("plan size", plan.size, "cell", plan.cell, "cells", plan.cells, BIOMES?.map((b) => b.id).join(","));
// sample: for each biome, a few cells; count trees in that chunk
const byBiome = new Map();
for (let k = 0; k < plan.cells * plan.cells; k += 97) {
    const b = plan.biome[k];
    if (!byBiome.has(b)) byBiome.set(b, []);
    if (byBiome.get(b).length < 6) byBiome.get(b).push(k);
}
const out = [];
for (const [b, ks] of byBiome) {
    for (const k of ks) {
        const cxw = (k % plan.cells + 0.5) * plan.cell, cyw = (Math.floor(k / plan.cells) + 0.5) * plan.cell;
        const [cx, cy] = [Math.floor(cxw / CHUNK), Math.floor(cyw / CHUNK)];
        if (cx < 1 || cy < 1 || cx >= CHUNKS - 1 || cy >= CHUNKS - 1) continue;
        const chunk = ow.chunk(cx, cy);
        out.push([BIOMES?.[b]?.id ?? b, cx, cy, chunk.trees.length]);
    }
}
out.sort((a, b) => b[3] - a[3]);
console.log(out.slice(0, 25).map((r) => r.join(" ")).join("\n"));
