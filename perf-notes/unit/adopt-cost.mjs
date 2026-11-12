// What a world costs to build from a plan read back: the plan taken, the world built, 49 chunks round the
// start made, the waters' surfaces asked. node adopt-cost.mjs <folder> <seed>   (from the checkout or a copy)
import path from "node:path";
import { pathToFileURL } from "node:url";

const at = (file) => pathToFileURL(path.resolve(file)).href;
const { keyOf, PLANNER, plansIn } = await import(at("test/plan-cache.js"));
const { keepPlans, planWorld, CHUNK } = await import(at("client/js/core/worldplan/plan.js"));
const { buildWorld } = await import(at("client/js/core/overworld.js"));
const { watersOf } = await import(at("client/js/core/terrain/waters.js"));

const [folder, seed] = [process.argv[2], Number(process.argv[3])];
const store = plansIn(folder, keyOf(PLANNER));
let how = "laid out";

keepPlans({ get: (s) => (store.get(s) ? ((how = "read back"), store.get(s)) : null), put: (s, made) => store.put(s, made) });

const cpu = (work) => {
    const start = process.cpuUsage();

    work();

    const used = process.cpuUsage(start);

    return ((used.user + used.system) / 1000).toFixed(0);
};
let plan;
let world;
const took = [
    cpu(() => (plan = planWorld(seed))),
    cpu(() => (world = buildWorld({ seed, plan }))),
    cpu(() => {
        const [cx, cy] = world.stamp.middle.map((v) => Math.floor(v / CHUNK));

        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                world.maps.town.chunk(cx + dx, cy + dy);
            }
        }
    }),
    cpu(() => watersOf(plan).surfaces),
];

console.log(`seed ${seed}, plan ${how}: plan ${took[0]} ms, world ${took[1]} ms, 49 chunks ${took[2]} ms, surfaces ${took[3]} ms; all ${took.reduce((sum, ms) => sum + Number(ms), 0)} ms of the processor`);
