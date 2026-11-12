// What of sharing corners takes the time: a made-up town of boxes turned every which way
import { load } from "./harness.mjs";
const { sharedCorners, byteNormal } = await load("world/art/engine/corners.js");
const THREE = await import(process.argv[2] + "/node_modules/three/build/three.module.js");
const { mergeGeometries } = await import(process.argv[2] + "/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js");
const boxes = [];
for (let k = 0; k < 4000; k++) {
    const g = new THREE.BoxGeometry(1 + (k % 7), 1 + (k % 5), 1 + (k % 3)).toNonIndexed();
    g.rotateY(k * 0.37).translate(k % 64, 0, Math.floor(k / 64));
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.5 + (k % 10) / 20), 3));
    g.setAttribute("layer", new THREE.BufferAttribute(new Float32Array(n).fill(k % 60), 1));
    boxes.push(g);
}
const all = mergeGeometries(boxes);
const corners = all.attributes.position.count;
for (let run = 0; run < 5; run++) {
    const t = performance.now();
    const shared = sharedCorners(all);
    const ms = performance.now() - t;
    console.log(`run ${run}: ${corners} corners, ${shared.attributes.position.count} kept, ${ms.toFixed(0)} ms (${(ms * 1000 / corners).toFixed(2)} microseconds a corner)`);
}
const t = performance.now();
const into = new Int8Array(4);
const normal = all.attributes.normal.array;
for (let i = 0; i < corners; i += 6) byteNormal(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2], into);
console.log(`its ${corners / 6} faces' normals' bytes alone, none remembered: ${(performance.now() - t).toFixed(0)} ms`);
