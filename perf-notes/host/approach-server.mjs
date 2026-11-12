// A player on a world server walking up to a city from the wilds, everything server/ahead.js makes
// ahead given all the time it wants between steps (pumped till it's settled before every step: the
// best it can do). What's left in a step is what making ahead doesn't reach.
//
//     node approach-server.mjs [--place human-city-1] [--from 420] [--seconds 260] [--dump file]
import { parseArgs } from "node:util";

const ROOT = "/home/user/conquest";
const { STEP_MS } = await import(`${ROOT}/client/js/core/battle.js`);
const { Host } = await import(`${ROOT}/client/js/core/host.js`);
const { buildWorld } = await import(`${ROOT}/client/js/core/overworld.js`);
const { WorldRunner } = await import(`${ROOT}/client/js/core/runner.js`);
const { nearestFree, squaresOf } = await import(`${ROOT}/client/js/core/grid.js`);
const { Ahead } = await import(`${ROOT}/server/ahead.js`);
const { installWorkers } = await import(`${ROOT}/server/workers.js`);

const { values } = parseArgs({ options: { place: { type: "string", default: "human-city-1" }, from: { type: "string", default: "420" }, seconds: { type: "string", default: "260" }, dump: { type: "string" } } });

installWorkers();

const world = buildWorld({ seed: 2 });
const overworld = world.maps.town;
const place = world.plan.places.find(({ id }) => id === values.place);
const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "none" } });
const start = nearestFree(squaresOf(overworld), [Math.round(place.at[0] - Number(values.from)), Math.round(place.at[1])], { within: 40 });

host.join({ id: "p1", hero: { name: "P1", race: "human", shape: {}, look: {}, weapon: "sword", boots: false }, square: start, map: "town" });
host.populate();

const runner = new WorldRunner(host, { clock: () => performance.now() });
const ahead = new Ahead(world, { host });
let inStep = false;
let chunksInSteps = 0;
const groundChunk = overworld.ground.chunk.bind(overworld.ground);

overworld.ground.chunk = (cx, cy) => {
    if (inStep && !overworld.ground.peek(cx, cy)) {
        chunksInSteps++;
    }

    return groundChunk(cx, cy);
};

async function settle() {
    for (let k = 0; k < 4000; k++) {
        runner.bakeAhead(ahead);

        if (ahead.settled) {
            return;
        }

        await new Promise((resolve) => setImmediate(resolve));
    }
}

const times = [];
const notes = [];

for (let t = 0; t < Number(values.seconds) * 1000; t += STEP_MS) {
    const me = host.battle.actor("p1");

    await settle();

    if (t % 2000 === 0) {
        host.command("p1", { type: "move", to: [Math.round(Math.min(place.at[0], me.x + 40)), Math.round(place.at[1])] });
    }

    const before = chunksInSteps;
    const t0 = performance.now();

    inStep = true;

    const events = host.advance(STEP_MS);

    inStep = false;

    const ms = performance.now() - t0;

    times.push(+ms.toFixed(2));

    if (ms > 8) {
        notes.push(`${Math.round(ms)} ms at ${t / 1000} s (${Math.round(Math.hypot(me.x - place.at[0], me.y - place.at[1]))} m off; ${chunksInSteps - before} chunks made in it; ${[...new Set(events.map(({ type }) => type))].slice(0, 6).join("/")})`);
    }
}

if (values.dump) {
    (await import("node:fs")).writeFileSync(values.dump, JSON.stringify(times));
}

console.log(`${values.place} (${place.kind}) from ${values.from} m, a world server making ahead: chunks made inside steps ${chunksInSteps}; chunks made ahead ${ahead.made}`);
console.log(notes.join("\n"));
ahead.dispose();
process.exit(0);
