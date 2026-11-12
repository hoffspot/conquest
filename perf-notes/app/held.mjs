// world/release.js heldOnPage over bodies shaped like the game's (a stand-in: per body 70 bones,
// a skinned body and 8 skinned garments, each 6 attributes and a material with 2 pictures), as
// game.js memoryNow asks it every 2 s (the memory guard in the frame, the debug log's notes after it).
import * as THREE from "/home/user/conquest/node_modules/three/build/three.module.js";
import { heldOnPage } from "/home/user/conquest/client/js/world/release.js";

const body = () => {
    const root = new THREE.Group();
    const bones = [];
    let parent = root;
    for (let k = 0; k < 70; k++) { const bone = new THREE.Bone(); (k % 5 ? parent : root).add(bone); parent = bone; bones.push(bone); }
    for (let piece = 0; piece < 9; piece++) {
        const geometry = new THREE.BufferGeometry();
        for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2], ["skinIndex", 4], ["skinWeight", 4], ["tangent", 4]]) geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(300 * size), size));
        geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(900), 1));
        const material = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(16), 2, 2), normalMap: new THREE.DataTexture(new Uint8Array(16), 2, 2) });
        root.add(new THREE.Mesh(geometry, material));
    }
    return root;
};
for (const count of [30, 60, 100]) {
    const bodies = Array.from({ length: count }, body);
    let nodes = 0; bodies[0].traverse(() => nodes++);
    heldOnPage(bodies);
    const out = [];
    for (let run = 0; run < 3; run++) { const N = 50; const s = performance.now(); for (let i = 0; i < N; i++) heldOnPage(bodies); out.push(((performance.now() - s) / N).toFixed(2)); }
    console.log(`${count} bodies (${nodes} nodes each): heldOnPage ${out.join(" / ")} ms`);
}
