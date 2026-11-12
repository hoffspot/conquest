// The start town as buildTown makes it: what its meshes hold on the page (and send to the card)
import { load } from "./harness.mjs";
const seed = Number(process.argv[2] ?? 2);
const { buildWorld } = await load("core/overworld.js");
const { buildTown } = await load("world/town3d.js");
const world = buildWorld({ seed });
const ow = world.maps.town;
const groundAt = (x, z) => ow.heightAt?.(x, z) ?? 0;
globalThis.FontFace ??= class { load() { return Promise.reject(new Error("no fonts")); } };
const town = await buildTown(world, { groundAt, landAt: (x, z) => ow.biomeAt?.(x, z) ?? "meadow" });
console.log("seed", seed, "town", world.town.kind, world.start?.id, "pieces", world.town.pieces.length, "field trees", world.trees.length, "children", town.object.children.length);
const cats = {};
town.object.traverse((o) => {
    if (!o.isMesh) return;
    const top = o.parent === town.object ? "blocks+extras" : (o.parent.name || "?");
    const name = (o.name || o.material?.name || "?").replace(/[-\d.,]+ ?/g, "#");
    const k = `${top}/${name}`;
    const g = o.geometry;
    const c = (cats[k] ??= { meshes: 0, corners: 0, tris: 0, bytes: 0, indexed: 0, per: "" });
    c.meshes++;
    const n = g.attributes.position.count;
    c.corners += n; c.tris += (g.index ? g.index.count : n) / 3;
    let b = g.index ? g.index.array.byteLength : 0;
    for (const a of Object.values(g.attributes)) b += a.array.byteLength;
    c.bytes += b; if (g.index) c.indexed++;
    c.per = Object.entries(g.attributes).map(([an, a]) => `${an}:${a.itemSize}${a.array.constructor.name.replace("Array", "")}`).join(" ");
});
let total = 0;
for (const [k, c] of Object.entries(cats).sort((a, b) => b[1].bytes - a[1].bytes)) {
    total += c.bytes;
    if (c.bytes > 50000) console.log(`${(c.bytes / 1048576).toFixed(2).padStart(6)} MB ${String(c.meshes).padStart(3)} meshes (${c.indexed} indexed) ${String(c.corners).padStart(7)} corners ${String(Math.round(c.tris)).padStart(7)} tris  ${k}   [${c.per}]`);
}
console.log("total geometry on the page", (total / 1048576).toFixed(1), "MB");
