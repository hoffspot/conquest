// How long sharing a capital's buildings' corners takes: each merged mesh spread out again into a
// corner a triangle's corner, in floats, and shared again (as partsOf does a piece at a time)
import { load } from "./harness.mjs";
const THREE = await import(new URL("../../../../../../home/user/conquest/.claude/worktrees/agent-a6dcab61fbc43fe04/node_modules/three/build/three.module.js", import.meta.url).href).catch(() => null);
const { buildWorld } = await load("core/overworld.js");
const { Chunks } = await load("world/chunks3d.js");
const { sharedCorners } = await load("world/art/engine/corners.js");
const world = buildWorld({ seed: 1 });
const chunks = new Chunks(world, { undergrowth: 0 });
chunks.fill(3696.5, 4976.5, 2);
let guard = 0;
while (chunks.busy && guard++ < 200000) { chunks.update(3696.5, 4976.5, { budget: 50 }); await new Promise((r) => setImmediate(r)); }
const spread = [];
chunks.object.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.layer || o.parent?.name !== "buildings") return;
    const g = o.geometry.toNonIndexed();
    const n = g.attributes.position.count;
    const normal = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { normal[i * 3] = g.attributes.normal.getX(i); normal[i * 3 + 1] = g.attributes.normal.getY(i); normal[i * 3 + 2] = g.attributes.normal.getZ(i); }
    g.setAttribute("normal", new g.attributes.position.constructor(normal, 3));
    spread.push(g);
});
for (let run = 0; run < 3; run++) {
    const t = performance.now();
    let corners = 0;
    for (const g of spread) { corners += g.attributes.position.count; sharedCorners(g); }
    console.log(`run ${run}: ${corners} corners shared in ${(performance.now() - t).toFixed(0)} ms (${((performance.now() - t) * 1000 / corners).toFixed(2)} microseconds a corner)`);
}
