import { REPO, THREE, Character, makeKit, census } from "./harness.mjs";
const { folkLook } = await import(`${REPO}/client/js/characters/folk.js`);
const { Avatar } = await import(`${REPO}/client/js/world/avatar.js`);
const kit = makeKit(64); kit.atlas = null;
const look = folkLook({ role: "townsfolk", look: "servant", sex: "f", seed: 103 });
const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, merge: true, far: true, hairDetail: 0.2 });
const avatar = new Avatar(character, { walk: look.walk });
avatar.place(0, 0, 0);
let z = 0;
for (let k = 0; k < 200; k++) { z += 1.3 / 60; avatar.update(1 / 60, 0, z, 0, true); }
character.object.updateMatrixWorld(true);
const skeletons = [...census(character.object).skeletons];
const drape = skeletons.find((s) => s.bones.length > 52);
const body = skeletons.find((s) => s.bones.length === 52);
console.log(`equipment ${look.equipment.join(" ")}; skeletons ${skeletons.map((s) => s.bones.length)}`);
for (let run = 0; run < 3; run++) {
    const N = 20000;
    global.gc();
    let h0 = process.memoryUsage().heapUsed; let t = process.cpuUsage();
    for (let k = 0; k < N; k++) drape.update();
    let d = process.cpuUsage(t); const drapeUs = (d.user + d.system) / N; const drapeBytes = (process.memoryUsage().heapUsed - h0) / N;
    global.gc();
    h0 = process.memoryUsage().heapUsed; t = process.cpuUsage();
    for (let k = 0; k < N; k++) body.update();
    d = process.cpuUsage(t);
    console.log(`run ${run + 1}: the skirt's skeleton.update ${drapeUs.toFixed(1)} us and about ${Math.max(0, drapeBytes).toFixed(0)} B of garbage a frame; the body's ${((d.user + d.system) / N).toFixed(1)} us, ${Math.max(0, (process.memoryUsage().heapUsed - h0) / N).toFixed(0)} B`);
}
