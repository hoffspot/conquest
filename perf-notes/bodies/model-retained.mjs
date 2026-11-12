// What a bought model as read keeps on the page (without its pictures), and what's left once the
// glTF parser it came with is let go of: node --expose-gc model-retained.mjs <file.bin>...
import { readFileSync } from "node:fs";
import "./harness.mjs";
const REPO = "/home/user/conquest";
const { GLTFLoader } = await import(`${REPO}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`);
const { MeshoptDecoder } = await import(`${REPO}/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js`);
const { unscramble, isScrambled } = await import(`${REPO}/client/js/app/scramble.js`);
const MB = (b) => (b / 1048576).toFixed(1);
const used = async () => { for (let k = 0; k < 4; k++) { await new Promise((r) => setTimeout(r, 30)); global.gc(); } const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers; };
function stripped(name) {
    const bytes = new Uint8Array(readFileSync(`${REPO}/client/models/beasts/${name}`));
    if (isScrambled(bytes)) unscramble(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    const imageBytes = (json.images ?? []).reduce((s, i) => s + json.bufferViews[i.bufferView].byteLength, 0);
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
    return { glb: glb.buffer, file: bytes.length, json: jsonLength, imageBytes };
}
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
{ const warm = await loader.parseAsync(stripped("flayling.bin").glb, ""); warm.parser = null; } // (warm: the decoder's code)
for (const name of process.argv.slice(2)) {
    const before = await used();
    let { glb, file, json, imageBytes } = stripped(name);
    let gltf = await loader.parseAsync(glb, "");
    glb = null;
    const kept = (await used()) - before;
    let geometry = 0; const seen = new Set();
    gltf.scene.traverse((n) => { if (n.geometry && !seen.has(n.geometry)) { seen.add(n.geometry); for (const a of [...Object.values(n.geometry.attributes), n.geometry.index]) geometry += a?.array.byteLength ?? 0; } });
    const keys = gltf.animations.reduce((s, c) => s + c.tracks.reduce((t, k) => t + k.times.byteLength + k.values.byteLength, 0), 0);
    gltf.parser = null; gltf.userData = null;
    const without = (await used()) - before;
    console.log(`${name}: file ${MB(file)} MB (its map ${MB(json)}, its pictures ${MB(imageBytes)}); as read it keeps ${MB(kept)} MB on the page (shapes ${MB(geometry)}, clips' keys ${MB(keys)}); its parser let go of: ${MB(without)} MB (${MB(kept - without)} MB less)`);
    gltf = null;
}
