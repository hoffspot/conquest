import { REPO } from "./harness.mjs";
const { GARMENTS } = await import(`${REPO}/client/js/characters/garments.js`);
const { EQUIPMENT } = await import(`${REPO}/client/js/characters/equipment.js`);
const { DRAPES } = await import(`${REPO}/client/js/characters/drapes.js`);
const ids = Object.keys(GARMENTS);
const base = ids.filter((id) => GARMENTS[id].base);
const design = ids.filter((id) => GARMENTS[id].design);
const own = ids.filter((id) => !GARMENTS[id].base && !GARMENTS[id].design);
console.log(`GARMENTS ${ids.length}: own picture ${own.length}, tinted from a base ${base.length} (bases used: ${new Set(base.map((id) => GARMENTS[id].base)).size}), lace designs ${design.length} (distinct designs ${new Set(design.map((id) => GARMENTS[id].design)).size})`);
console.log(`EQUIPMENT ${Object.keys(EQUIPMENT).length}; garments ${Object.values(EQUIPMENT).filter((e) => e.kind === "garment").length}, drapes ${Object.values(EQUIPMENT).filter((e) => e.kind === "drape").length}, items ${Object.values(EQUIPMENT).filter((e) => e.kind !== "garment" && e.kind !== "drape").length}`);
console.log(`DRAPES ${Object.keys(DRAPES).length}`);
console.log(`if every own-picture garment were painted once: ${(own.length * 1.25).toFixed(0)} MB on the page (512x512 RGBA + 512x512 R8 each)`);
// by suffix
const bySuffix = {};
for (const id of own) { const s = id.includes(".") ? id.split(".")[1] : "(plain)"; bySuffix[s] = (bySuffix[s] ?? 0) + 1; }
console.log(bySuffix);
