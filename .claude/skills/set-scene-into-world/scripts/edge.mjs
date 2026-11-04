/* global console, process */
// A scene's land across its edges and along its road (its own metres): the land with it set in,
// the land without, and its terrain's top (or its lowest and top floor, without a terrain). Run
// from the repository's root:
//   node .claude/skills/set-scene-into-world/scripts/edge.mjs <seed> [scene x] [scene z]
import { layOutWorld } from "../../../../client/js/core/worldplan/plan.js";
import { landHeight, scenesIn } from "../../../../client/js/core/terrain/height.js";
import { toWorld } from "../../../../client/js/core/terrain/scenes.js";

const plan = layOutWorld(Number(process.argv[2] ?? 1));
const bare = { ...plan, sites: plan.sites.filter(({ scenery }) => !scenery) };
const [placed] = scenesIn(plan);
const { scene } = placed;
const over = (x, y) => (landHeight(plan, x, y) - placed.base).toFixed(1);
const own = (x, y) => (landHeight(bare, x, y) - placed.base).toFixed(1);

console.log("base", placed.base.toFixed(1), "box", scene.box, "middle", scene.middle);

// (Out along its road, from its ridge)
const road = [];

for (let z = scene.box[3] - 20; z <= scene.box[3] + 120; z += 10) {
    road.push(`${z}: ${over(...toWorld(placed, 0, z))}`);
}

console.log("along its road (scene z: land over its 0):", road.join("  "));

// (Across its edges: a row at a scene z, from inside out past its east edge)
const sz = Number(process.argv[4] ?? scene.middle[1]);
const row = [];

for (let x = scene.box[2] - 60; x <= scene.box[2] + 100; x += 10) {
    const [wx, wy] = toWorld(placed, x, sz);

    row.push(`${x}: ${over(wx, wy)} (own ${own(wx, wy)})`);
}

console.log(`across its east edge at z ${sz}:`, row.join("  "));
