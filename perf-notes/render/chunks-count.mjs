import { load } from "./harness.mjs";
const quality = process.argv[2] ?? "low";
const where = process.argv[3] ?? "spawn";
const { buildWorld, CHUNK, CHUNKS } = await load("core/overworld.js");
const { Chunks, REACH } = await load("world/chunks3d.js");
const { QUALITY } = await load("world/view.js");
const THREE = await import("/home/user/conquest/node_modules/three/build/three.module.js");
const q = QUALITY[quality];
const world = buildWorld({ seed: 1 });
const chunks = new Chunks(world, { undergrowth: q.undergrowth, cliffs: q.cliffs, rocks: q.rocks });
chunks.setSpacing(q.ground);
let [x, z] = world.spawns.player.map((v) => v + 0.5);
if (where !== "spawn") { const [a, b] = where.split(",").map(Number); x = a; z = b; }
console.log("at", x, z, "biome", world.maps.town.biomeAt?.(Math.floor(x), Math.floor(z)));
const t0 = performance.now();
chunks.fill(x, z);
let guard = 0;
while (chunks.busy && guard++ < 200000) { chunks.update(x, z, { budget: 50 }); await new Promise((r) => setImmediate(r)); }
console.log("built in", Math.round(performance.now() - t0), "ms; chunks drawn", chunks.drawn.size);
// walk a little to fill "kept" ring? (kept = 3: only by walking). Count as drawn 5x5.
const by = {};
let nodes = 0, meshes = 0, tris = 0, cpuBytes = 0, visibleNodes = 0;
const geos = new Set();
const mats = new Set();
chunks.object.updateMatrixWorld(true);
chunks.object.traverse((o) => {
    nodes++;
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    meshes++;
    const g = o.geometry;
    const count = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    let t = count / 3;
    let inst = 1;
    if (o.isInstancedMesh) inst = o.count;
    if (o.isBatchedMesh) { t = 0; inst = 0; }
    let name = o.name || o.material?.name || o.type;
    name = name.replace(/[-\d.,]+ ?/g, "#");
    const k = `${o.parent?.name?.replace(/[-\d.,]+ ?/g, "#") ?? "?"}/${name}${o.castShadow ? " [casts]" : ""}`;
    by[k] ??= { meshes: 0, tris: 0, bytes: 0 };
    by[k].meshes++;
    by[k].tris += t * inst;
    tris += t * inst;
    if (!geos.has(g)) {
        geos.add(g);
        let b = 0;
        for (const a of Object.values(g.attributes)) b += (a.array ?? a.data?.array)?.byteLength ?? 0;
        if (g.index) b += g.index.array.byteLength;
        by[k].bytes += b;
        cpuBytes += b;
    }
    for (const m of [o.material].flat()) mats.add(m);
});
console.log(`nodes ${nodes}, drawables ${meshes}, triangles ${Math.round(tris)}, geometry bytes ${(cpuBytes / 1048576).toFixed(1)} MB, materials ${mats.size}`);
const rows = Object.entries(by).sort((a, b) => b[1].tris - a[1].tris);
for (const [k, v] of rows) console.log(`${String(v.meshes).padStart(4)} meshes ${String(Math.round(v.tris)).padStart(8)} tris ${(v.bytes / 1048576).toFixed(2).padStart(7)} MB  ${k}`);
// Woodland
const w = chunks.woodland;
console.log("trees planted", w.planted, "wood instances max", w.wood.maxInstanceCount, "variants", w.variants.size);
// Textures
const texs = new Map();
const note = (t, from) => { if (t?.isTexture && !texs.has(t)) texs.set(t, from); };
for (const m of mats) {
    for (const [k, v] of Object.entries(m)) note(v, `${m.name}.${k}`);
    for (const [k, u] of Object.entries(m.uniforms ?? {})) note(u?.value, `${m.name}.u.${k}`);
    for (const [k, v] of Object.entries(m.userData ?? {})) { note(v, `${m.name}.ud.${k}`); if (v?.value?.isTexture) note(v.value, `${m.name}.ud.${k}`); }
}
let texBytes = 0;
const tb = {};
for (const [t, from] of texs) {
    const img = t.image ?? {};
    const w2 = img.width ?? 0, h2 = img.height ?? 0, d = img.depth ?? 1;
    const fmt = t.format, type = t.type;
    const ch = fmt === THREE.RedFormat ? 1 : fmt === THREE.RGFormat ? 2 : 4;
    const tyb = type === THREE.FloatType ? 4 : type === THREE.HalfFloatType ? 2 : 1;
    const mips = t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter ? 4 / 3 : 1;
    const bytes = w2 * h2 * d * ch * tyb * mips;
    texBytes += bytes;
    const k = `${from.replace(/[-\d.,]+ ?/g, "#")} ${w2}x${h2}${d > 1 ? "x" + d : ""} ch${ch} ${t.isCompressedTexture ? "COMPRESSED" : ""}`;
    tb[k] ??= { n: 0, bytes: 0 };
    tb[k].n++; tb[k].bytes += bytes;
}
console.log(`textures ${texs.size}, ${(texBytes / 1048576).toFixed(1)} MB (uncompressed est.)`);
for (const [k, v] of Object.entries(tb).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 40)) console.log(`${String(v.n).padStart(4)} x ${(v.bytes / 1048576).toFixed(2).padStart(7)} MB  ${k}`);
globalThis.__chunks = chunks;
export { chunks, world, THREE, x, z };
