// Two bodies in the same outfit built a step at a time, turn and turn about (as app/game.js
// #nextEnlistee puts one by for a nearer one): is the outfit's picture made once?
import { REPO, Character, makeKit } from "./harness.mjs";
const { soldierLook } = await import(`${REPO}/client/js/characters/soldiers.js`);
const kit = makeKit(64);
kit.atlas = null;
const build = (seed) => { const look = soldierLook({ people: "human", weapon: "sword", seed }); return Character.building(kit, { shape: look.shape, look: look.look, equipment: look.equipment, merge: true, far: true, hairDetail: 0.2 }); };
const [a, b] = [build(1), build(2)];
let [ra, rb] = [a.next(), b.next()];
let steps = 0;
// (The first taken 40 steps, then the second put before it, as a nearer one is; then turn about)
for (let k = 0; k < 40 && !ra.done; k++) ra = a.next();
while (!ra.done || !rb.done) { if (!rb.done) rb = b.next(); if (!ra.done) ra = a.next(); steps++; }
const [first, second] = [ra.value, rb.value];
const material = (c) => c.garments.find((m) => m.name === "garments").material;
console.log(`outfits kept by the kit: ${kit.composites.size}; users counted ${[...kit.composites.values()].map((e) => e.users)}`);
console.log(`the two wear the same picture: ${material(first).map === material(second).map}; the first's is the kit's: ${[...kit.composites.values()].some((e) => e.value === material(first))}, the second's: ${[...kit.composites.values()].some((e) => e.value === material(second))}`);
// Let the first go: is the second's still counted as worn?
first.dispose();
console.log(`after the first's let go: users ${[...kit.composites.values()].map((e) => e.users)} (the second still wears its picture)`);
let disposed = 0;
material(first).map.addEventListener("dispose", () => disposed++);
console.log(`the first's own picture was disposed: ${disposed > 0} (it's no longer in the kit: nothing will)`);
