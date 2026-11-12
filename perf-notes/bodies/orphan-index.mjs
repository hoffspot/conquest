// Index buffers replaced after a body's first drawn (their old ones on the card are never deleted by
// three.js, only when the page's garbage is collected): node orphan-index.mjs
import { REPO, THREE, Character, makeKit, MB } from "./harness.mjs";
const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const { folkLook, TOWNSFOLK_PARTS } = await import(`${REPO}/client/js/characters/folk.js`);
const { Lods } = await import(`${REPO}/client/js/characters/lod.js`);
const kit = makeKit(64); kit.atlas = null; kit.lods = new Lods();
let watching = false; const replaced = [];
const setIndex = THREE.BufferGeometry.prototype.setIndex;
THREE.BufferGeometry.prototype.setIndex = function (index) {
    if (watching && this.index?.array && this.userData.drawn) replaced.push({ bytes: this.index.array.byteLength });
    return setIndex.call(this, index);
};
const looks = [];
for (let seed = 1; seed <= 6; seed++) looks.push(soldierLook({ people: "human", weapon: seed % 2 ? "sword" : "bow", seed }));
let n = 0; for (const part of TOWNSFOLK_PARTS) for (const sex of ["m", "f"]) looks.push(folkLook({ role: "townsfolk", look: part, sex, seed: 100 + n++ }));
let total = 0; let count = 0; const per = [];
for (const look of looks) {
    const before = replaced.length;
    const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, merge: true, far: true, hairDetail: 0.2 });
    // (As the game does: asked for its lower detail as it's built, then drawn; a frame goes by before the worker's answer)
    character.lowerDetail(kit.lods);
    watching = true;
    await Promise.resolve(); await Promise.resolve(); // what's kept already (lods.of) comes now, before it's drawn
    character.object.traverse((node) => { if (node.geometry) node.geometry.userData.drawn = true; });
    for (let k = 0; k < 40; k++) await new Promise((r) => setTimeout(r, 10));
    watching = false;
    const mine = replaced.slice(before);
    const bytes = mine.reduce((s, r) => s + r.bytes, 0);
    per.push(`${mine.length}:${(bytes / 1024).toFixed(0)}K`);
    total += bytes; count += mine.length;
}
console.log(`index buffers replaced after first drawn, each body (count:bytes): ${per.join(" ")}`);
console.log(`${looks.length} bodies: ${count} index buffers, ${MB(total)} MB left on the card till the page's garbage is collected, and counted by world/gpumemory.js for good; ${MB(total / looks.length)} MB a body`);
process.exit(0);
