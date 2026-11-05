/* global console, process */
// How high a scene stands round a point of it, from its walk's `ground` (the pipeline's walk.ground):
// the highest of all that stands on its terrain (`over`: its walls, roofs, towers, rocks) within
// each of a few distances, and a map of `over` and of its terrain (`heights`) round the point. For
// what a structure's insides can be (how high its top floor can stand, which way the cliff behind
// it is, where a balcony would look into rock). Run from the repository's root:
//   node .claude/skills/import-scene-model/scripts/heights.mjs <scene> <x> <z> [half] [step]
// The point in the scene's metres (Bellhaven's keep's doors: bellhaven 0 -142); the maps `half`
// metres to each side of it (90), a cell every `step` metres (10). "." where nothing is.
import { walkOf } from "../../../../client/js/core/scenery.js";

const [scene = "bellhaven", px = "0", pz = "0", halfArg = "90", stepArg = "10"] = process.argv.slice(2);
const [cx, cz, half, step] = [Number(px), Number(pz), Number(halfArg), Number(stepArg)];
const walk = walkOf(scene);
const ground = walk.ground;

if (!ground) {
    console.error(`${scene}'s walk has no ground: bake it with walk.ground (utilities/blenderpipeline/README.md, *Where it can be walked*)`);
    process.exit(1);
}

const at = (grid, x, z) => {
    const [i, j] = [Math.floor((x - ground.origin[0]) / ground.square), Math.floor((z - ground.origin[1]) / ground.square)];
    const v = i >= 0 && j >= 0 && i < ground.size[0] && j < ground.size[1] ? grid[j * ground.size[0] + i] : -32768;

    return v === -32768 ? null : v / 100;
};

console.log(scene, { origin: walk.origin, square: walk.square, levels: walk.levels.length, ground: { square: ground.square, origin: ground.origin, size: ground.size } });

const within = [];

for (const r of [20, 40, 60, 80, 120]) {
    let [most, where] = [-Infinity, null];

    for (let j = 0; j < ground.size[1]; j++) {
        for (let i = 0; i < ground.size[0]; i++) {
            const [x, z] = [ground.origin[0] + (i + 0.5) * ground.square, ground.origin[1] + (j + 0.5) * ground.square];
            const v = ground.over[j * ground.size[0] + i];

            if (v !== -32768 && Math.hypot(x - cx, z - cz) <= r && v / 100 > most) {
                [most, where] = [v / 100, [x, z]];
            }
        }
    }

    within.push({ within: r, highest: most, at: where });
}

console.log("the highest of what stands on it, within each distance of", [cx, cz]);
console.log(within.map((row) => JSON.stringify(row)).join("\n"));

for (const [label, grid] of [["what stands on it (over)", ground.over], ["its terrain (heights)", ground.heights]]) {
    console.log(`\n${label}, metres; x across, z down`);
    console.log("      " + Array.from({ length: Math.floor((2 * half) / step) + 1 }, (_, k) => String(cx - half + k * step).padStart(5)).join(""));

    for (let z = cz - half; z <= cz + half; z += step) {
        let row = String(z).padStart(5) + " ";

        for (let x = cx - half; x <= cx + half; x += step) {
            const v = at(grid, x, z);

            row += v === null ? "    ." : String(Math.round(v)).padStart(5);
        }

        console.log(row);
    }
}
