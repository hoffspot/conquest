// A fingerprint of the world built from a seed's plan, the plan taken through the unit tests' plan cache in
// <folder>: run it twice (the first process lays the plan out and keeps it, the second reads it back) and the two
// prints must be the same. Looks hardest where the fault would show: the chunks over every cell whose river
// would stand elsewhere if its waters were made from the plan alone.
// node world-print2.mjs <folder> <seed>   (run from the checkout, or a copy of it)
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const at = (file) => pathToFileURL(path.resolve(file)).href;
const { keyOf, PLANNER, plansIn } = await import(at("test/plan-cache.js"));
const { keepPlans, planWorld, CELL, CELLS, CHUNK } = await import(at("client/js/core/worldplan/plan.js"));
const { buildWorld } = await import(at("client/js/core/overworld.js"));
const { Waters, watersOf } = await import(at("client/js/core/terrain/waters.js"));
const { STEP_MS } = await import(at("client/js/core/battle.js"));
const { HOST_PLAYER, Host } = await import(at("client/js/core/host.js"));

const [folder, seed] = [process.argv[2], Number(process.argv[3])];
const store = plansIn(folder, keyOf(PLANNER));
let how = "?";

keepPlans({
    get(s) {
        const made = store.get(s);

        how = made ? "read back" : "laid out";

        return made;
    },
    put: (s, made) => store.put(s, made),
});

const plan = planWorld(seed);
const world = buildWorld({ seed, plan });
const overworld = world.maps.town;
const hashOf = () => createHash("sha256");
const short = (hash) => hash.digest("hex").slice(0, 12);

// Everything a chunk holds: its arrays' bytes, and its plain values (whatever isn't one named by its kind)
function take(hash, value, seen = new Set()) {
    if (ArrayBuffer.isView(value)) {
        hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    } else if (value && typeof value === "object") {
        if (seen.has(value)) {
            return;
        }

        seen.add(value);

        const entries = value instanceof Map ? [...value.entries()] : value instanceof Set ? [...value].entries() : Object.entries(value);

        for (const [name, each] of entries) {
            hash.update(String(name));
            take(hash, each, seen);
        }
    } else {
        hash.update(typeof value === "function" ? "function" : `${typeof value}:${String(value)}`);
    }
}

// The waters: where they stand, what runs where, the fords
const waters = watersOf(plan);
const water = hashOf();

take(water, waters.surfaces);
take(water, waters.running);
take(water, waters.fords());

// The cells whose rivers would stand elsewhere, made from the plan alone
const alone = new Waters(plan).surfaces;
const cells = [...waters.surfaces.keys()].filter((k) => waters.surfaces[k] !== alone[k]);

// The chunks: over each of those cells, round the start town, round the scene, round three settlements
const wanted = new Set();
const round = ([x, y], far) => {
    const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

    for (let dy = -far; dy <= far; dy++) {
        for (let dx = -far; dx <= far; dx++) {
            wanted.add(`${cx + dx},${cy + dy}`);
        }
    }
};

for (const k of cells) {
    round([((k % CELLS) + 0.5) * CELL, (Math.floor(k / CELLS) + 0.5) * CELL], 1);
}

const scene = plan.sites.find((site) => site.scenery);

round(world.stamp.middle, 3);
round(scene.at, 3);
plan.places.slice(0, 3).forEach((place) => round(place.at, 2));

const [squares, heights] = [hashOf(), hashOf()];

for (const key of [...wanted].sort()) {
    const [cx, cy] = key.split(",").map(Number);

    take(squares, overworld.chunk(cx, cy));
    take(heights, overworld.ground.chunk(cx, cy).heights);
}

// (And a line of the ground's heights through the scene and the cells beside it)
for (let d = -900; d <= 900; d += 2) {
    heights.update(String(overworld.heightAt(scene.at[0] + d, scene.at[1] + d * 0.37)));
}

// A host on it, its player in, its people put in, played ten seconds: its checksum, and what it would keep
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false } });
host.populate();

for (let t = 0; t < 10000; t += STEP_MS) {
    host.advance(STEP_MS);
}

const snapshot = hashOf();

take(snapshot, host.snapshot());
console.log(`seed ${seed}, plan ${how}: waters ${short(water)}; ${cells.length} cells at risk; ${wanted.size} chunks: squares ${short(squares)}, heights ${short(heights)}; host after 10 s: checksum ${host.checksum()}, snapshot ${short(snapshot)}`);
