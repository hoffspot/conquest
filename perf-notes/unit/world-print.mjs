// A fingerprint of the world built from a seed's plan, the plan taken through the plan cache in <folder>:
// run it twice (the first lays the plan out, the second reads it back) and the two prints must be the same.
// node world-print.mjs <folder> <seed>   (run from the checkout)
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const at = (file) => pathToFileURL(path.resolve(file)).href;
const { keyOf, PLANNER, plansIn } = await import(at("test/plan-cache.js"));
const { keepPlans, planWorld, CHUNK } = await import(at("client/js/core/worldplan/plan.js"));
const { buildWorld } = await import(at("client/js/core/overworld.js"));
const { watersOf } = await import(at("client/js/core/terrain/waters.js"));

const [folder, seed] = [process.argv[2], Number(process.argv[3])];
const store = plansIn(folder, keyOf(PLANNER));
let how = "?";

keepPlans({
    get(s) {
        const laid = store.get(s);

        how = laid ? "read back" : "laid out";

        return laid;
    },
    put: (s, laid) => store.put(s, laid),
});

const plan = planWorld(seed);
const world = buildWorld({ seed, plan });
const overworld = world.maps.town;
const hash = createHash("sha256");
let [chunks, arrays, values] = [0, 0, 0];

// Everything a chunk holds: its arrays' bytes, and its plain values as JSON (whatever can't be written that way named by its kind)
function take(value, seen = new Set()) {
    if (ArrayBuffer.isView(value)) {
        hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        arrays++;
    } else if (value && typeof value === "object") {
        if (seen.has(value)) {
            return;
        }

        seen.add(value);

        const entries = value instanceof Map ? [...value.entries()] : value instanceof Set ? [...value].entries() : Object.entries(value);

        for (const [name, each] of entries) {
            hash.update(String(name));
            take(each, seen);
        }
    } else {
        hash.update(typeof value === "function" ? "function" : `${typeof value}:${String(value)}`);
        values++;
    }
}

const scene = plan.sites.find((site) => site.scenery);
const middles = [world.stamp.middle, scene.at, ...plan.places.slice(0, 3).map((place) => place.at)];

for (const [mx, my] of middles) {
    const [cx, cy] = [Math.floor(mx / CHUNK), Math.floor(my / CHUNK)];

    for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
            take(overworld.chunk(cx + dx, cy + dy));
            chunks++;
        }
    }
}

// (And the land's waters' surfaces, and a line of heights through the scene)
take(watersOf(plan).surfaces);

for (let d = -800; d <= 800; d += 3) {
    hash.update(String(overworld.heightAt(scene.at[0] + d, scene.at[1] + d * 0.37)));
}

console.log(`seed ${seed}, plan ${how}: ${chunks} chunks, ${arrays} arrays, ${values} values: ${hash.digest("hex").slice(0, 32)}`);
