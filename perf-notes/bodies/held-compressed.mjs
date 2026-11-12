import { REPO, THREE } from "./harness.mjs";
const { heldOnPage } = await import(`${REPO}/client/js/world/release.js`);
// A 1024x1024 ETC2 RGB picture with its mipmaps, as KTX2Loader makes one (4 bits a texel)
const mipmaps = []; let real = 0;
for (let size = 1024; size >= 1; size >>= 1) { const bytes = Math.max(8, (Math.ceil(size / 4) ** 2) * 8); mipmaps.push({ data: new Uint8Array(bytes), width: size, height: size }); real += bytes; }
const texture = new THREE.CompressedTexture(mipmaps, 1024, 1024, THREE.RGB_ETC2_Format);
const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: texture }));
console.log(`heldOnPage counts ${(heldOnPage([mesh]) / 1048576).toFixed(2)} MB; its mipmaps really hold ${(real / 1048576).toFixed(2)} MB on the page; image keys: ${Object.keys(texture.image)}`);
