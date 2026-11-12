// The woodland's batches: each variant's triangles, and what culling and sorting its trees costs a frame
import { load } from "./harness.mjs";
const THREE = await import("/home/user/conquest/.claude/worktrees/agent-a6dcab61fbc43fe04/node_modules/three/build/three.module.js");
const { Woodland, VARIANTS } = await load("world/art/kits/trees.js");
const woodland = new Woodland();
const N = Number(process.argv[2] ?? 2400);
// trees on a 7x7 chunks square (448 m), as many as N
const placements = [];
let s = 1;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let k = 0; k < N; k++) placements.push({ x: rnd() * 448, z: rnd() * 448, variant: k % VARIANTS.length, size: 0.9 + rnd() * 0.2, turn: rnd() * 6.28 });
const t0 = performance.now();
woodland.plant(placements, () => 0);
console.log(`planted ${N} in ${(performance.now() - t0).toFixed(0)} ms; variants ${VARIANTS.length}`);
const info = (batch) => batch._geometryInfo.map((g) => (g.indexCount ?? g.count) / 3);
const wood = info(woodland.wood), leaves = info(woodland.leaves);
console.log("triangles a variant, wood:", wood.map(Math.round).join(" "));
console.log("triangles a variant, leaves:", leaves.map(Math.round).join(" "));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`mean wood ${Math.round(mean(wood))}, leaves ${Math.round(mean(leaves))}, both ${Math.round(mean(wood) + mean(leaves))}; kinds ${VARIANTS.map(([kind]) => kind).filter((k, i, a) => a.indexOf(k) === i).join(",")}`);
// A camera as the game's: 36 degrees tall, 16:9, sees 160 m, in the middle looking across
const camera = new THREE.PerspectiveCamera(36, 852 / 393, 0.3, 160);
camera.position.set(224, 4, 224);
camera.lookAt(224 + 50, 1, 224 + 30);
camera.updateMatrixWorld();
const sun = new THREE.OrthographicCamera(-24, 24, 24, -24, 1, 120);
sun.position.set(224 + 30, 50, 224 + 20);
sun.lookAt(224, 0, 224);
sun.updateMatrixWorld();
woodland.object.updateMatrixWorld(true);
if (process.argv[3] === "nosort") { woodland.wood.sortObjects = false; woodland.leaves.sortObjects = false; }
const time = (batch, cam, material) => {
    const runs = [];
    for (let r = 0; r < 5; r++) {
        const t = performance.now();
        for (let k = 0; k < 200; k++) batch.onBeforeRender(null, null, cam, batch.geometry, material);
        runs.push((performance.now() - t) / 200);
    }
    return runs.map((v) => v.toFixed(3)).join(" ");
};
console.log("wood, the camera (ms a frame, five runs of 200):", time(woodland.wood, camera, woodland.wood.material), "drawn", woodland.wood._multiDrawCount);
console.log("leaves, the camera:", time(woodland.leaves, camera, woodland.leaves.material), "drawn", woodland.leaves._multiDrawCount);
console.log("wood, the sun's shadows:", time(woodland.wood, sun, woodland.wood.material), "drawn", woodland.wood._multiDrawCount);
// triangles in view by distance band
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
const bands = [20, 40, 80, 120, 160];
const tri = bands.map(() => 0), cnt = bands.map(() => 0);
placements.forEach(({ x, z, variant }) => {
    const sphere = new THREE.Sphere(new THREE.Vector3(x, 4, z), 6);
    if (!frustum.intersectsSphere(sphere)) return;
    const d = Math.hypot(x - camera.position.x, z - camera.position.z);
    const b = bands.findIndex((edge) => d < edge);
    if (b < 0) return;
    cnt[b]++; tri[b] += wood[variant % wood.length] + leaves[variant % leaves.length];
});
console.log("trees in view by distance (m):", bands.map((edge, k) => `<${edge}: ${cnt[k]} trees ${Math.round(tri[k] / 1000)}k tris`).join("; "));
