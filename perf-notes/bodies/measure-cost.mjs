import { REPO, Character, makeKit } from "./harness.mjs";
const { measureBody } = await import(`${REPO}/client/js/characters/garments.js`);
const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const kit = makeKit(64); kit.atlas = null;
const look = soldierLook({ people: "human", weapon: "sword", seed: 3 });
const character = new Character(kit, { shape: look.shape, look: look.look, equipment: [], merge: true });
for (let run = 0; run < 3; run++) {
    global.gc?.();
    const h0 = process.memoryUsage().heapUsed;
    const t = process.cpuUsage();
    let kept;
    for (let k = 0; k < 20; k++) kept = measureBody(character);
    const d = process.cpuUsage(t);
    global.gc?.();
    console.log(`measureBody: ${((d.user + d.system) / 20000).toFixed(1)} ms cpu each; one kept: ${((process.memoryUsage().heapUsed - h0) / 1048576).toFixed(1)} MB (${kept.vertices.length} vertices as objects)`);
}
