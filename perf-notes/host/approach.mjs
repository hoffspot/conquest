// One player's own world, as the browser game hosts it, walking up to a city from the wilds: what
// its steps still cost on the page's thread when everything the browser makes off it, or between
// its steps, is made between the steps here and not counted (the 25 chunks drawn round the player:
// world/chunks3d.js; the settlements within five chunks laid out: world/layouts.js; the
// navigation's tiles within 96 m and those ways wait for: world/navbaker.js). What's left in a
// step is what the simulation makes for itself there and then.
//
//     node approach.mjs [--place human-city-1] [--from 520] [--seconds 150] [--dump file]
import { parseArgs } from "node:util";

const ROOT = "/home/user/conquest/client/js/core";
const { STEP_MS } = await import(`${ROOT}/battle.js`);
const { Host } = await import(`${ROOT}/host.js`);
const { buildWorld, CHUNK, CHUNKS } = await import(`${ROOT}/overworld.js`);
const { navigatorOf } = await import(`${ROOT}/navigation.js`);
const { nearestFree, squaresOf } = await import(`${ROOT}/grid.js`);

const { values } = parseArgs({ options: { place: { type: "string", default: "human-city-1" }, from: { type: "string", default: "520" }, seconds: { type: "string", default: "150" }, seed: { type: "string", default: "2" }, dump: { type: "string" } } });
const world = buildWorld({ seed: Number(values.seed) });
const overworld = world.maps.town;
const place = world.plan.places.find(({ id }) => id === values.place);
const host = new Host(world, { populate: false });
const navigation = navigatorOf(overworld);
const waiting = [];

navigation.later = (tx, ty) => waiting.push([tx, ty]);

// (Chunks made by the simulation's own asking, inside a step: counted by wrapping the ground's)
let inStep = false;
let chunksInSteps = 0;
const groundChunk = overworld.ground.chunk.bind(overworld.ground);
const seen = new Set();

overworld.ground.chunk = (cx, cy) => {
    const key = cy * 1024 + cx;

    if (inStep && !seen.has(key) && !overworld.ground.peek(cx, cy)) {
        chunksInSteps++;
    }

    seen.add(key);

    return groundChunk(cx, cy);
};

// What the browser makes round the player off the step: all of it, now
function between(x, y) {
    const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

    for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
            if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < CHUNKS && cy + dy < CHUNKS) {
                overworld.settlements.settle(cx + dx, cy + dy);
            }
        }
    }

    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < CHUNKS && cy + dy < CHUNKS) {
                overworld.chunk(cx + dx, cy + dy);
            }
        }
    }

    const { tile, border } = navigation.measures;
    const [tx0, ty0] = navigation.tileOf(x - 96, y - 96);
    const [tx1, ty1] = navigation.tileOf(x + 96, y + 96);

    for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
            if (overworld.made(tx * tile - border, ty * tile - border, (tx + 1) * tile + border, (ty + 1) * tile + border)) {
                navigation.ensure(tx, ty);
            }
        }
    }

    // (Those ways are waiting for: baked in the worker whatever their ground costs to make there)
    for (const [tx, ty] of waiting.splice(0)) {
        navigation.ensure(tx, ty);
    }
}

const start = nearestFree(squaresOf(overworld), [Math.round(place.at[0] - Number(values.from)), Math.round(place.at[1])], { within: 40 });

between(start[0], start[1]);
host.join({ id: "player", hero: { name: "Solo", race: "human", shape: {}, look: {}, weapon: "sword", boots: false }, square: start, map: "town" });
host.populate();

const times = [];
const notes = [];
let at = 0;

for (let t = 0; t < Number(values.seconds) * 1000; t += STEP_MS) {
    const me = host.battle.actor("player");

    between(me.x, me.y);

    if (t % 2000 === 0) {
        host.command("player", { type: "move", to: [Math.round(Math.min(place.at[0], me.x + 40)), Math.round(place.at[1])] });
    }

    const before = chunksInSteps;
    const t0 = performance.now();

    inStep = true;

    const events = host.advance(STEP_MS);

    inStep = false;

    const ms = performance.now() - t0;

    times.push(+ms.toFixed(2));

    if (ms > 8) {
        notes.push({ at: t / 1000, ms: Math.round(ms), from: Math.round(Math.hypot(me.x - place.at[0], me.y - place.at[1])), chunks: chunksInSteps - before, actors: host.battle.actors.length, events: [...new Set(events.map(({ type }) => type))].slice(0, 6).join("/") });
    }

    at = Math.round(Math.hypot(me.x - place.at[0], me.y - place.at[1]));
}

if (values.dump) {
    (await import("node:fs")).writeFileSync(values.dump, JSON.stringify(times));
}

const sorted = [...times].sort((a, b) => a - b);

console.log(`${values.place} (${place.kind}) from ${values.from} m: ended ${at} m from its middle; ${times.length} steps, mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)} ms, p99 ${sorted[Math.floor(sorted.length * 0.99)].toFixed(1)}, worst ${sorted.at(-1).toFixed(1)}; chunks made inside steps ${chunksInSteps}; actors at the end ${host.battle.actors.length}`);
console.log(notes.map(({ at, ms, from, chunks, actors, events }) => `${ms} ms at ${at} s (${from} m off; ${chunks} chunks made in it; ${actors} in the world${events ? `; ${events}` : ""})`).join("\n"));
