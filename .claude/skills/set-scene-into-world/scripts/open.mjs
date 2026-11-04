/* global console, process */
// A scene's own terrain as the game reads it (core/terrain/scenes.js sceneOf's `ground`), mapped:
// "." where it's open (the land drawn there, trees grown), "#" where something stands, "x" where
// its terrain's kept, " " where it has nothing. Run from the repository's root:
//   node .claude/skills/set-scene-into-world/scripts/open.mjs [scene id]
import { sceneOf } from "../../../../client/js/core/terrain/scenes.js";

const scene = sceneOf(process.argv[2] ?? "bellhaven");
const g = scene.ground;

const [w, d] = g.size;
const step = 4;
let out = "";
for (let z = 0; z < d; z += step) {
    let line = "";
    for (let x = 0; x < w; x += step) {
        let open = 0, has = 0, over = 0;
        for (let dz = 0; dz < step; dz++) {for (let dx = 0; dx < step; dx++) {
            const k = Math.min(d - 1, z + dz) * w + Math.min(w - 1, x + dx);
            open += g.open[k]; has += g.has[k]; over += Number.isNaN(g.over[k]) ? 0 : 1;
        }}
        line += open > step * step / 2 ? "." : over > step * step / 2 ? "#" : has > step * step / 2 ? "x" : " ";
    }
    out += line + "\n";
}
console.log(g.origin, g.size, g.square, "(each char", step * g.square, "m; z down; near edge at bottom)");
console.log(out);
let open = 0; for (const o of g.open) {open += o;}
console.log("open", open, "of", w * d);
