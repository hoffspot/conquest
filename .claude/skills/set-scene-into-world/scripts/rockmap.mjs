/* global console, process */
// Where the land round a scene set into the world (the first with a `scenery`) shows rock, as the
// far land draws it (world/ground.js ROCK_FROM, FAR_GROUND rock, ALPINE), though trees grow there:
// "R" rock with trees on it (what shouldn't be), "r" rock with none, "w" its woods (height.js
// woodsAt: a forest's floor there), "." the land's own, "#" its own ground where nothing grows, "="
// its edges. Rows run from behind it to in front, its own metres. Run from the repository's root:
//   node .claude/skills/set-scene-into-world/scripts/rockmap.mjs [seed] [step]
import { planWorld } from "../../../../client/js/core/worldplan/plan.js";
import { landHeight, scenesIn, woodsAt } from "../../../../client/js/core/terrain/height.js";
import { growsAt, toWorld, within } from "../../../../client/js/core/terrain/scenes.js";

const plan = planWorld(Number(process.argv[2] ?? 1));
const [placed] = scenesIn(plan);
const step = Number(process.argv[3] ?? 10);
const smoothstep = (from, to, value) => {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));

    return t * t * (3 - 2 * t);
};
const counts = {};
const [x0, z0, x1, z1] = placed.scene.box;

console.log("box", placed.scene.box, "base", placed.base.toFixed(1));

for (let sz = z0 - 300; sz <= z1 + 120; sz += step) {
    let row = "";

    for (let sx = x0 - 260; sx <= x1 + 260; sx += step) {
        const [x, y] = toWorld(placed, sx, sz);
        const height = landHeight(plan, x, y);
        const slope = Math.hypot(landHeight(plan, x + 4, y) - landHeight(plan, x - 4, y), landHeight(plan, x, y + 4) - landHeight(plan, x, y - 4)) / 8;
        const up = 1 / Math.sqrt(1 + slope * slope);
        const alpine = smoothstep(130, 220, height);
        const steep = 1 - smoothstep(0.76 + 0.12 * alpine, 0.9 + 0.12 * alpine, up);
        const woods = woodsAt(plan, x, y);
        const rock = steep * (1 - Math.min(1, woods / (1.5 * 0.4)));
        const grows = growsAt(placed, x, y);
        const trees = grows && (slope < 0.78 || woods > 0);
        const mark = !grows ? (within(placed.scene, sx, sz) ? "#" : "=") : rock > 0.3 ? (trees ? "R" : "r") : woods > 0 ? "w" : ".";

        counts[mark] = (counts[mark] ?? 0) + 1;
        row += mark;
    }

    console.log(String(sz).padStart(5) + " " + row);
}

console.log(JSON.stringify(counts));
