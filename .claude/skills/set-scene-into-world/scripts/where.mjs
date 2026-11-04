/* global console, process */
// Where each world lays out a scene set into the land (its plan's site with a `scenery`), and how
// much the land itself rises and falls round it. Run from the repository's root:
//   node .claude/skills/set-scene-into-world/scripts/where.mjs <first seed> <last seed>
import { layOutWorld } from "../../../../client/js/core/worldplan/plan.js";
import { landHeight } from "../../../../client/js/core/terrain/height.js";

const [from, to] = [Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 12)];

for (let seed = from; seed <= to; seed++) {
    const started = Date.now();
    const plan = layOutWorld(seed);
    const bare = { ...plan, sites: plan.sites.filter(({ scenery }) => !scenery) };

    for (const site of plan.sites.filter(({ scenery }) => scenery)) {
        let [low, high] = [Infinity, -Infinity];

        for (const r of [0, 90, 180, 270]) {
            for (let k = 0; k < (r ? 12 : 1); k++) {
                const h = landHeight(bare, site.at[0] + r * Math.cos((k * Math.PI) / 6), site.at[1] + r * Math.sin((k * Math.PI) / 6));

                [low, high] = [Math.min(low, h), Math.max(high, h)];
            }
        }

        console.log(seed, site.id, "at", site.at, "facing", site.facing.toFixed(3), "height", plan.height[site.cell[1] * 256 + site.cell[0]].toFixed(2), "land rises and falls", (high - low).toFixed(0), "m", `(${Date.now() - started} ms to lay out)`);
    }
}
