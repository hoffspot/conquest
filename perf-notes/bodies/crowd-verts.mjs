// How many of a crowd figure's corners its near and far triangles use: node crowd-verts.mjs
import { REPO, THREE, makeKit, MB } from "./harness.mjs";
const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const { WEAPONS } = await import(`${REPO}/client/js/core/weapons.js`);
const { Lods } = await import(`${REPO}/client/js/characters/lod.js`);
const { makingTemplate } = await import(`${REPO}/client/js/world/crowd.js`);
const { WAITING } = await import(`${REPO}/client/js/core/steps.js`);
const kit = makeKit(512);
kit.lods = new Lods();
for (const [key, spec] of [["human sword", { look: soldierLook({ people: "human", weapon: "sword", seed: 3 }), guard: "sword", attack: WEAPONS.sword.attacks?.[0] ?? null }], ["orc cleaver", { look: soldierLook({ people: "orc", weapon: "cleaver", seed: 7 }), guard: "cleaver", attack: WEAPONS.cleaver.attacks?.[0] ?? null }]]) {
    const steps = makingTemplate(kit, key, { size: 256, ...spec });
    let step = steps.next();
    while (!step.done) { if (step.value === WAITING) await new Promise((r) => setTimeout(r, 5)); step = steps.next(); }
    const t = step.value;
    const used = (index) => new Set(index.array).size;
    const all = t.geometry.attributes.position.count;
    const near = used(t.nearIndex); const far = used(t.farIndex);
    const union = new Set([...t.nearIndex.array, ...t.farIndex.array]).size;
    // corners at the same place with everything the same (unindexed items): how many are distinct
    const a = t.geometry.attributes; const seen = new Set();
    for (let v = 0; v < all; v++) { seen.add([a.position.getX(v), a.position.getY(v), a.position.getZ(v), a.normal.getX(v), a.normal.getY(v), a.normal.getZ(v), a.uv.getX(v), a.uv.getY(v), a.color.getX(v), a.color.getY(v), a.color.getZ(v), a.crowdSet.getX(v)].map((n) => n.toFixed(4)).join(",")); }
    console.log(`${key}: ${all} corners held (${MB(all * 92)} MB at 92 B); merged index uses ${used(t.geometry.index)}; near uses ${near}, far ${far}, near+far ${union} (${(100 * union / all).toFixed(0)}%); distinct corners (same place, facing, picture, colour) ${seen.size}`);
    console.log(`   held now: ${MB(all * 92)} MB page + the same on the card; only what near+far use, as bytes (36 B): ${MB(union * 36)} MB`);
}
process.exit(0);
