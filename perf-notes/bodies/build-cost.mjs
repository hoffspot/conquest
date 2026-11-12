// What building a body costs, by stage (Node, one thread): node build-cost.mjs [skin=512]
import { REPO, THREE, Character, makeKit, allAtOnce, HumanData, SkinAtlas, readHumanFiles } from "./harness.mjs";
const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const { folkLook } = await import(`${REPO}/client/js/characters/folk.js`);
const { paintSkin } = await import(`${REPO}/client/js/characters/skin.js`);
const { GARMENTS, paintGarment, compositeGarments, texelMap } = await import(`${REPO}/client/js/characters/garments.js`);

const skin = Number(process.argv[2] ?? 512);
const ms = (f) => { const t = performance.now(); const r = f(); return [performance.now() - t, r]; };
const files = readHumanFiles();
const [tHuman, human] = ms(() => new HumanData(files.manifest, files.data));
const [tAtlas, atlas] = ms(() => new SkinAtlas(human, {}, skin));
console.log(`HumanData ${tHuman.toFixed(0)} ms; SkinAtlas(${skin}) ${tAtlas.toFixed(0)} ms`);
const kit = { human, atlas };

// Skin painting
for (let k = 0; k < 3; k++) {
    const [t] = ms(() => paintSkin(atlas, { tone: "#d9a47f", scalp: 1.4, stubble: 0.5 }));
    console.log(`paintSkin(${skin}) ${t.toFixed(0)} ms`);
}
const [tMap, map] = ms(() => texelMap(human, 512));
console.log(`texelMap(512) ${tMap.toFixed(0)} ms`);

// A step-by-step build, each step timed: the longest steps and the total
function build(label, look, options = {}) {
    const steps = Character.building(kit, { shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.2, merge: true, far: true, release: true, ...options });
    let total = 0; let longest = 0; let count = 0; let step;
    do {
        const t = performance.now();
        step = steps.next(step?.value && typeof step.value === "symbol" ? undefined : undefined);
        const d = performance.now() - t;
        total += d; longest = Math.max(longest, d); count++;
    } while (!step.done);
    console.log(`${label}: ${total.toFixed(0)} ms in ${count} steps, longest ${longest.toFixed(1)} ms`);
    return step.value;
}
const s1 = soldierLook({ people: "human", weapon: "sword", seed: 1 });
build("soldier #1 (cold: garments painted, outfit composited)", s1);
build("soldier #2 same outfit (warm)", soldierLook({ people: "human", weapon: "sword", seed: 2 }));
build("soldier #3 same outfit (warm)", soldierLook({ people: "human", weapon: "sword", seed: 3 }));
build("folk shopper m (new outfit)", folkLook({ role: "townsfolk", look: "shopper", sex: "m", seed: 100 }));
build("folk shopper m other seed", folkLook({ role: "townsfolk", look: "shopper", sex: "m", seed: 101 }));
build("folk shopper m other seed", folkLook({ role: "townsfolk", look: "shopper", sex: "m", seed: 102 }));
build("folk servant f", folkLook({ role: "townsfolk", look: "servant", sex: "f", seed: 103 }));
build("folk servant f other seed", folkLook({ role: "townsfolk", look: "servant", sex: "f", seed: 104 }));

// One garment's picture, and an outfit's composite
const measures = kit.referenceMeasures;
for (const id of ["tunic", "trousers", "mail", "boots"]) {
    const [t] = ms(() => paintGarment(kit.texelMap, GARMENTS[id], measures));
    console.log(`paintGarment(${id}) ${t.toFixed(0)} ms`);
}
const ids = ["shirt", "trousers", "boots", "belt", "jerkin"];
const layers = ids.map((id) => { const p = paintGarment(kit.texelMap, GARMENTS[id], measures); return { data: p.data, bump: p.bump, tint: null, bumpScale: 1.5, roughness: 0.8, metalness: 0, garment: GARMENTS[id] }; });
for (let k = 0; k < 3; k++) {
    const [t] = ms(() => compositeGarments(kit.texelMap, layers, measures));
    console.log(`compositeGarments(5 layers) ${t.toFixed(0)} ms`);
}
process.exit(0);
