// A village's pieces made ready to merge (partsOf), a piece at a time as the chunks do it: how
// long each takes, and how much of that is sharing its corners (the least of five goes each)
import { load } from "./harness.mjs";
const { buildWorld } = await load("core/overworld.js");
const { builderOf, grounded, partsOf, PIXEL, placed } = await load("world/town3d.js");
const { sharedCorners } = await load("world/art/engine/corners.js");
const THREE = await import(process.argv[2] + "/node_modules/three/build/three.module.js");
globalThis.FontFace ??= class { load() { return Promise.reject(new Error("no fonts")); } };
const world = buildWorld({ seed: 1 });
const overworld = world.maps.town;
const place = world.plan.places.find(({ kind }) => kind === (process.argv[3] ?? "capital"));
overworld.settlements.of(place);
const pieces = overworld.settlements.laid.get(place.id).town.pieces.filter(({ kind }) => kind !== "tree").slice(0, 120);
const rows = [];
for (const piece of pieces) {
    const build = builderOf(piece.kind === "house" ? { ...piece, settlement: place.kind } : piece);
    if (!build) continue;
    const object = await build(piece);
    const group = new THREE.Group();
    group.scale.setScalar(PIXEL);
    group.add(placed(object, piece, [0, 0], grounded(object, piece, () => 0)));
    group.updateMatrixWorld(true);
    let [ready, shared, corners] = [Infinity, Infinity, 0];
    for (let run = 0; run < 5; run++) {
        const t = performance.now();
        const parts = partsOf(group, { atlas: true });
        ready = Math.min(ready, performance.now() - t);
        // (Spread out again, and shared again: the sharing alone)
        const spread = parts.filter(({ geometry }) => geometry.attributes.layer).map(({ geometry }) => {
            const g = geometry.toNonIndexed();
            const n = g.attributes.position.count;
            const normal = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) { normal[i * 3] = g.attributes.normal.getX(i); normal[i * 3 + 1] = g.attributes.normal.getY(i); normal[i * 3 + 2] = g.attributes.normal.getZ(i); }
            g.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
            return g;
        });
        corners = spread.reduce((sum, g) => sum + g.attributes.position.count, 0);
        const t2 = performance.now();
        spread.forEach(sharedCorners);
        shared = Math.min(shared, performance.now() - t2);
    }
    rows.push({ what: piece.name ?? piece.kind, corners, ready, shared });
}
rows.sort((a, b) => b.ready - a.ready);
const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
console.log(`${rows.length} pieces of ${place.kind} ${place.id}: ${sum("corners")} corners, made ready in ${sum("ready").toFixed(0)} ms in all, ${sum("shared").toFixed(0)} ms of it sharing corners`);
for (const row of rows.slice(0, 6)) console.log(`  ${row.what}: ${row.corners} corners, ready in ${row.ready.toFixed(1)} ms, ${row.shared.toFixed(1)} ms of it sharing`);
