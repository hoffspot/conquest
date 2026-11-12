// Vertex formats and sizes of the merged buildings (and other big chunk meshes) at a place
import { load } from "./harness.mjs";
const quality = process.argv[2] ?? "low";
const where = process.argv[3] ?? "3696.5,4976.5";
const { buildWorld, CHUNK } = await load("core/overworld.js");
const { Chunks } = await load("world/chunks3d.js");
const { QUALITY } = await load("world/view.js");
const { signDetail } = await load("world/art/kits/signs.js");
const q = QUALITY[quality];
signDetail(q.signs);
const world = buildWorld({ seed: 1 });
const chunks = new Chunks(world, { undergrowth: q.undergrowth, cliffs: q.cliffs, rocks: q.rocks });
chunks.setSpacing(q.ground);
const [x, z] = where.split(",").map(Number);
chunks.fill(x, z);
let guard = 0;
while (chunks.busy && guard++ < 200000) { chunks.update(x, z, { budget: 50 }); await new Promise((r) => setImmediate(r)); }
const cats = {};
chunks.object.traverse((o) => {
    if (!o.isMesh || o.isBatchedMesh) return;
    const parent = o.parent?.name?.replace(/[-\d.,]+ ?/g, "#") ?? "?";
    const name = (o.name || o.material?.name || o.type).replace(/[-\d.,]+ ?/g, "#");
    let k = `${parent}/${name}`;
    if (/sign|board|finger/.test(name)) k = "buildings/signs+boards";
    const g = o.geometry;
    const c = (cats[k] ??= { meshes: 0, verts: 0, tris: 0, bytes: 0, indexed: 0, attrs: {}, unique: 0, hashed: 0 });
    c.meshes++;
    const n = g.attributes.position.count;
    c.verts += n;
    c.tris += (g.index ? g.index.count : n) / 3;
    if (g.index) { c.indexed++; c.bytes += g.index.array.byteLength; }
    for (const [an, a] of Object.entries(g.attributes)) {
        const arr = a.array ?? a.data?.array;
        c.attrs[an] = `${a.itemSize}x${arr.constructor.name.replace("Array", "")}${a.normalized ? "n" : ""}`;
        c.bytes += arr.byteLength;
    }
    // how many distinct corners (were it indexed)
    if (!g.index && n <= 2000000) {
        const names = Object.keys(g.attributes);
        const seen = new Set();
        const arrs = names.map((an) => [g.attributes[an].array, g.attributes[an].itemSize]);
        for (let i = 0; i < n; i++) {
            let key = "";
            for (const [arr, size] of arrs) for (let j = 0; j < size; j++) key += arr[i * size + j].toFixed(4) + ",";
            seen.add(key);
        }
        c.unique += seen.size; c.hashed += n;
    }
});
for (const [k, c] of Object.entries(cats).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 12)) {
    console.log(`${k}: ${c.meshes} meshes (${c.indexed} indexed), ${c.verts} corners, ${Math.round(c.tris)} tris, ${(c.bytes / 1048576).toFixed(2)} MB, ${(c.bytes / c.verts).toFixed(1)} B/corner; distinct corners ${c.hashed ? (100 * c.unique / c.hashed).toFixed(0) + "%" : "n/a"}`);
    console.log("     ", JSON.stringify(c.attrs));
}
// textures of signs
let signBytes = 0, signs = 0;
const seenT = new Set();
chunks.object.traverse((o) => { const t = o.material?.map; if (t && /sign|board|finger/.test(o.name) && !seenT.has(t)) { seenT.add(t); signs++; signBytes += t.image.width * t.image.height * 4 * (t.generateMipmaps ? 4 / 3 : 1); } });
console.log(`sign pictures: ${signs}, ${(signBytes / 1048576).toFixed(1)} MB with mipmaps (quality ${quality}, signs x${q.signs})`);
