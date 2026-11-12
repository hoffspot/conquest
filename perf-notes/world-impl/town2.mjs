// The start town as buildTown makes it, its trees merged (as before) or planted in a woodland (as
// the game plants them now): what its meshes hold on the page (and send to the card)
import { load } from "./harness.mjs";
const seed = Number(process.argv[2] ?? 2);
const how = process.argv[3] ?? "woodland";
const { buildWorld } = await load("core/overworld.js");
const { buildTown } = await load("world/town3d.js");
const { Woodland } = await load("world/art/kits/trees.js");
const world = buildWorld({ seed });
const ow = world.maps.town;
const groundAt = (x, z) => ow.heightAt?.(x, z) ?? 0;
globalThis.FontFace ??= class { load() { return Promise.reject(new Error("no fonts")); } };
const woodland = how === "woodland" ? new Woodland() : null;
// (What the batches hold with no tree planted: their room for 2048 trees and 48,000 corners each)
const bytesOf = (g) => (g.index ? g.index.array.byteLength : 0) + Object.values(g.attributes).reduce((sum, a) => sum + a.array.byteLength, 0);
const empty = woodland ? bytesOf(woodland.wood.geometry) + bytesOf(woodland.leaves.geometry) : 0;
const town = await buildTown(world, { groundAt, landAt: (x, z) => ow.biomeAt?.(x, z) ?? "meadow", woodland });
console.log("seed", seed, "town", world.town.kind, "pieces", world.town.pieces.length, "field trees", world.trees.length, "trees planted in the woodland", woodland?.planted ?? 0);
const cats = {};
let triangles = 0;
const count = (o, top) => {
    const name = (o.name || o.material?.name || "?").replace(/[-\d.,]+ ?/g, "#");
    const k = `${top}/${name}`;
    const g = o.geometry;
    const c = (cats[k] ??= { meshes: 0, corners: 0, tris: 0, bytes: 0 });
    c.meshes++;
    c.corners += g.attributes.position.count;
    c.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    c.bytes += bytesOf(g);
};
town.object.traverse((o) => o.isMesh && count(o, o.parent === town.object ? "blocks+extras" : o.parent.name || "?"));
if (woodland) {
    count(woodland.wood, "woodland");
    count(woodland.leaves, "woodland");
}
let total = 0;
for (const [k, c] of Object.entries(cats).sort((a, b) => b[1].bytes - a[1].bytes)) {
    total += c.bytes;
    if (/tree|woodland/.test(k)) triangles += c.tris;
    if (c.bytes > 50000) console.log(`${(c.bytes / 1048576).toFixed(2).padStart(6)} MB ${String(c.meshes).padStart(3)} meshes ${String(c.corners).padStart(7)} corners ${String(Math.round(c.tris)).padStart(7)} tris  ${k}`);
}
console.log("total geometry on the page", (total / 1048576).toFixed(1), "MB", woodland ? `(the woodland's batches with no tree planted: ${(empty / 1048576).toFixed(2)} MB, and each variant once)` : "");
