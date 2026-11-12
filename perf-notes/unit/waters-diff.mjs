// Where a plan's own waters (the land's as it was settled) differ from waters made from the whole plan:
// node waters-diff.mjs <seed ...>   (run from the checkout)
import path from "node:path";
import { pathToFileURL } from "node:url";

const at = (file) => pathToFileURL(path.resolve(file)).href;
const { layOutWorld, CELL, CELLS } = await import(at("client/js/core/worldplan/plan.js"));
const { watersOf, Waters } = await import(at("client/js/core/terrain/waters.js"));

for (const seed of process.argv.slice(2).map(Number)) {
    const plan = layOutWorld(seed);
    const own = watersOf(plan).surfaces;
    const anew = new Waters(plan).surfaces;
    const scenes = plan.sites.filter((site) => site.scenery);
    const cells = [];

    for (let k = 0; k < CELLS * CELLS; k++) {
        if (own[k] !== anew[k]) {
            cells.push(k);
        }
    }

    const far = cells.map((k) => Math.min(...scenes.map(({ at: [x, y] }) => Math.hypot(((k % CELLS) + 0.5) * CELL - x, (Math.floor(k / CELLS) + 0.5) * CELL - y))));

    console.log(`seed ${seed}: ${cells.length} cells' surfaces differ; scenes: ${scenes.map(({ id, kind }) => `${id} (${kind})`).join(", ")}; the nearest of those cells to a scene ${far.length ? Math.min(...far).toFixed(0) : "-"} m, the furthest ${far.length ? Math.max(...far).toFixed(0) : "-"} m`);
}
