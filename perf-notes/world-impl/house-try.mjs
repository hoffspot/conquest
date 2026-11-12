import { load } from "./harness.mjs";
const { buildHouse, planHouse } = await load("world/art/kits/house.js");
const object = buildHouse(planHouse({ w: 2, h: 2.5, style: "timber", storeys: 2, x: 5, y: 5 })).toObject();
const kinds = {};
object.traverse((node) => {
    if (node.isMesh) {
        const key = `${Array.isArray(node.material) ? "materials" : "material"} ${node.geometry.index ? "indexed" : "plain"} groups:${node.geometry.groups.length} attrs:${Object.keys(node.geometry.attributes).join(",")} near:${Boolean(node.userData.near)}`;
        kinds[key] = (kinds[key] ?? 0) + 1;
    }
});
console.log(kinds);
