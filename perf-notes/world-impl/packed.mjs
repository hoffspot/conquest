// The merged buildings at a place as they're given to the graphics card: corners drawn, corners
// kept, bytes; and how near a normal's three bytes come to the way it faced
//   node packed.mjs [x,z]
import { load } from "./harness.mjs";
const where = process.argv[2] ?? "3696.5,4976.5";
const { buildWorld } = await load("core/overworld.js");
const { Chunks } = await load("world/chunks3d.js");
const corners = await load("world/art/engine/corners.js").catch(() => null);
const world = buildWorld({ seed: 1 });
const chunks = new Chunks(world, { undergrowth: 0 });
const [x, z] = where.split(",").map(Number);
chunks.fill(x, z, 2);
let guard = 0;
const t0 = performance.now();
while (chunks.busy && guard++ < 200000) { chunks.update(x, z, { budget: 50 }); await new Promise((r) => setImmediate(r)); }
const total = { meshes: 0, drawn: 0, kept: 0, bytes: 0, index16: 0, index32: 0, formats: new Set() };
chunks.object.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.layer || o.parent?.name !== "buildings") return;
    const g = o.geometry;
    total.meshes++;
    total.kept += g.attributes.position.count;
    total.drawn += g.index ? g.index.count : g.attributes.position.count;
    if (g.index) { total.bytes += g.index.array.byteLength; total[g.index.array.BYTES_PER_ELEMENT === 2 ? "index16" : "index32"]++; }
    for (const [name, a] of Object.entries(g.attributes)) { total.bytes += a.array.byteLength; total.formats.add(`${name}:${a.itemSize}x${a.array.constructor.name.replace("Array", "")}${a.normalized ? "n" : ""}`); }
});
console.log(`${total.meshes} atlas meshes of buildings: ${total.drawn} corners drawn (${Math.round(total.drawn / 3)} triangles), ${total.kept} kept (${(100 * total.kept / total.drawn).toFixed(1)}%), ${(total.bytes / 1048576).toFixed(2)} MB, ${(total.bytes / total.drawn).toFixed(1)} bytes a corner drawn; indices 16-bit in ${total.index16} meshes, 32-bit in ${total.index32}; ${[...total.formats].join(" ")}; built in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
if (corners) {
    // A million ways to face, evenly over the sphere: how far off the bytes are, and rounded side by side
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const stats = { best: [0, 0], naive: [0, 0] };
    const into = new Int8Array(4);
    const N = 1000000;
    for (let k = 0; k < N; k++) {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const n = [r * Math.cos(a), u, r * Math.sin(a)];
        corners.byteNormal(...n, into);
        const off = (q) => (Math.acos(Math.min(1, (q[0] * n[0] + q[1] * n[1] + q[2] * n[2]) / Math.hypot(q[0], q[1], q[2]))) * 180) / Math.PI;
        const [b, v] = [off(into), off(n.map((c) => Math.round(c * 127)))];
        stats.best[0] = Math.max(stats.best[0], b); stats.best[1] += b / N;
        stats.naive[0] = Math.max(stats.naive[0], v); stats.naive[1] += v / N;
    }
    console.log(`a normal's bytes, over a million ways to face: off by ${stats.best[0].toFixed(3)} degrees at most, ${stats.best[1].toFixed(4)} on average (rounded side by side: ${stats.naive[0].toFixed(3)} at most, ${stats.naive[1].toFixed(4)} on average)`);
}
