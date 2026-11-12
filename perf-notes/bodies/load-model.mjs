// A bought model read in Node without its pictures (their bytes left out of the JSON, in memory
// only), then copies made as the game makes them (beasts/model.js modelBody): what a copy holds.
// node --expose-gc load-model.mjs <kind> [copies=10]
import { readFileSync } from "node:fs";
import "./harness.mjs";
const REPO = "/home/user/conquest";
const THREE = await import(`${REPO}/node_modules/three/build/three.module.js`);
const { GLTFLoader } = await import(`${REPO}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`);
const { MeshoptDecoder } = await import(`${REPO}/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js`);
const { unscramble, isScrambled } = await import(`${REPO}/client/js/app/scramble.js`);
const { MODELS, modelBody, useModel } = await import(`${REPO}/client/js/beasts/model.js`);
const { ASSETS } = await import(`${REPO}/client/js/app/assets.js`);

const kind = process.argv[2] ?? "bellBrother";
const copies = Number(process.argv[3] ?? 10);
const model = MODELS[kind];
const path = `${REPO}/client/${ASSETS.models[model.asset].files[0].path}`;
const bytes = new Uint8Array(readFileSync(path));
if (isScrambled(bytes)) unscramble(bytes);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const jsonLength = view.getUint32(12, true);
const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
// (No pictures: the materials as they are without them)
delete json.images; delete json.textures; delete json.samplers;
for (const material of json.materials ?? []) {
    for (const key of ["normalTexture", "occlusionTexture", "emissiveTexture"]) delete material[key];
    for (const key of ["baseColorTexture", "metallicRoughnessTexture"]) delete material.pbrMetallicRoughness?.[key];
    for (const ext of Object.values(material.extensions ?? {})) for (const key of Object.keys(ext)) if (key.endsWith("Texture")) delete ext[key];
}
json.extensionsUsed = (json.extensionsUsed ?? []).filter((e) => e !== "KHR_texture_basisu");
json.extensionsRequired = (json.extensionsRequired ?? []).filter((e) => e !== "KHR_texture_basisu");
const text = new TextEncoder().encode(JSON.stringify(json));
const padded = Math.ceil(text.length / 4) * 4;
const bin = bytes.subarray(20 + jsonLength);
const glb = new Uint8Array(12 + 8 + padded + bin.length);
const out = new DataView(glb.buffer);
out.setUint32(0, 0x46546c67, true); out.setUint32(4, 2, true); out.setUint32(8, glb.length, true);
out.setUint32(12, padded, true); out.setUint32(16, 0x4e4f534a, true);
glb.fill(0x20, 20, 20 + padded); glb.set(text, 20); glb.set(bin, 20 + padded);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const c0 = process.cpuUsage();
const gltf = await loader.parseAsync(glb.buffer, "");
const parse = process.cpuUsage(c0);
console.log(`${kind} (${model.asset}): parsed without pictures in ${((parse.user + parse.system) / 1000).toFixed(0)} ms cpu`);
let nodes = 0, bones = 0, skinned = 0; const sourceSkeletons = new Set(); const geometries = new Set(); let geomBytes = 0;
gltf.scene.traverse((n) => { nodes++; bones += n.isBone ? 1 : 0; if (n.isSkinnedMesh) { skinned++; sourceSkeletons.add(n.skeleton); if (!geometries.has(n.geometry)) { geometries.add(n.geometry); for (const a of [...Object.values(n.geometry.attributes), n.geometry.index]) geomBytes += a?.array.byteLength ?? 0; } } });
const tracks = gltf.animations.reduce((s, c) => s + c.tracks.length, 0);
const keyBytes = gltf.animations.reduce((s, c) => s + c.tracks.reduce((t, k) => t + k.times.byteLength + k.values.byteLength, 0), 0);
console.log(`   as read: ${nodes} nodes (${bones} bones), ${skinned} skinned meshes on ${sourceSkeletons.size} skeletons; shapes ${(geomBytes / 1048576).toFixed(2)} MB on the page (and the card); ${gltf.animations.length} clips, ${tracks} tracks, keys ${(keyBytes / 1048576).toFixed(2)} MB`);
useModel(kind, gltf);

const { partsOf } = await import(`${REPO}/client/js/beasts/beast.js`).catch(() => ({}));
const parts = model.parts ? (partsOf ? partsOf(kind, 1) : model.parts) : null;
global.gc(); global.gc();
const before = process.memoryUsage();
const c1 = process.cpuUsage();
const made = [];
for (let k = 0; k < copies; k++) made.push(modelBody(kind, gltf, { parts }));
const cost = process.cpuUsage(c1);
global.gc(); global.gc();
const after = process.memoryUsage();
const body = made.at(-1);
let n2 = 0, shown = 0, all = 0; const skeletons = new Set(); const shownSkeletons = new Set();
body.object.traverse((n) => { n2++; if (n.isSkinnedMesh) { all++; skeletons.add(n.skeleton); let visible = true; for (let at = n; at; at = at.parent) visible &&= at.visible; if (visible) { shown++; shownSkeletons.add(n.skeleton); } } });
const boneCount = [...shownSkeletons][0]?.bones.length ?? 0;
const size = Math.max(4, Math.ceil(Math.sqrt(boneCount * 4) / 4) * 4);
console.log(`   a copy (parts ${parts ? parts.join(",") : "all"}): ${n2} nodes, ${all} skinned meshes kept (${skeletons.size} skeletons of ${boneCount} bones), ${shown} drawn at its nearest level on ${shownSkeletons.size} skeletons`);
console.log(`   a frame: ${shownSkeletons.size} x ${boneCount} bone matrices worked out, ${shownSkeletons.size} bone textures of ${size}x${size} RGBA32F (${(size * size * 16 / 1024).toFixed(1)} KB) sent = ${(shownSkeletons.size * size * size * 16 / 1024).toFixed(0)} KB`);
console.log(`   ${copies} copies: ${((cost.user + cost.system) / 1000 / copies).toFixed(1)} ms cpu each; heap +${((after.heapUsed - before.heapUsed) / 1048576 / copies).toFixed(2)} MB each, typed arrays +${((after.arrayBuffers - before.arrayBuffers) / 1048576 / copies).toFixed(2)} MB each (the first makes the joined shapes: shared)`);
// The mixer alone: every clip's action made and played at no weight (model.js:2262)
global.gc(); const m0 = process.memoryUsage();
const { clone } = await import(`${REPO}/node_modules/three/examples/jsm/utils/SkeletonUtils.js`);
const scenes = Array.from({ length: copies }, () => clone(gltf.scene));
global.gc(); const m1 = process.memoryUsage();
const mixers = scenes.map((scene) => { const mixer = new THREE.AnimationMixer(scene); for (const clip of gltf.animations) { const action = mixer.clipAction(clip); action.play(); action.setEffectiveWeight(0); } return mixer; });
global.gc(); const m2 = process.memoryUsage();
console.log(`   of that: the copy of its nodes and skeletons ${((m1.heapUsed + m1.arrayBuffers - m0.heapUsed - m0.arrayBuffers) / 1048576 / copies).toFixed(2)} MB; its mixer with all ${gltf.animations.length} clips' actions ${((m2.heapUsed + m2.arrayBuffers - m1.heapUsed - m1.arrayBuffers) / 1048576 / copies).toFixed(2)} MB`);
// With only the clips it's likely to play made (idle, walk, run, a flinch, a fall, three blows)
global.gc(); const m3 = process.memoryUsage();
const scenes2 = Array.from({ length: copies }, () => clone(gltf.scene));
global.gc(); const m4 = process.memoryUsage();
const few = scenes2.map((scene) => { const mixer = new THREE.AnimationMixer(scene); for (const clip of gltf.animations.slice(0, 8)) { const action = mixer.clipAction(clip); action.play(); action.setEffectiveWeight(0); } return mixer; });
global.gc(); const m5 = process.memoryUsage();
console.log(`   a mixer with 8 clips' actions: ${((m5.heapUsed + m5.arrayBuffers - m4.heapUsed - m4.arrayBuffers) / 1048576 / copies).toFixed(2)} MB`);
// A frame's posing: two clips mixed
const cpu = (f, n) => { const t = process.cpuUsage(); for (let k = 0; k < n; k++) f(k); const d = process.cpuUsage(t); return (d.user + d.system) / n; };
for (let run = 0; run < 3; run++) {
    const pose = cpu((k) => body.pose({ dt: 1 / 60, speed: 1, t: k / 60 }), 500);
    const world = cpu(() => { body.object.position.x += 1e-6; body.object.updateMatrixWorld(); }, 500);
    const skel = cpu(() => { for (const s of shownSkeletons) s.update(); }, 500);
    console.log(`   run ${run + 1}: pose (walking) ${pose.toFixed(0)} us, world matrices ${world.toFixed(0)} us, skeletons ${skel.toFixed(0)} us a frame`);
}
process.exit(0);
