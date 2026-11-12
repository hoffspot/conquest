// What a chunk of the world costs to make on the thread that asks for it (core/overworld.js
// Overworld.chunk), with and without its land's heights worked out beforehand (as the browser's
// terrain worker gives them: Ground.give), and what a settlement's layout costs.
//
//     node chunks.mjs [--seed 2] [--count 120]
import { parseArgs } from "node:util";

const ROOT = "/home/user/conquest/client/js/core";
const { buildWorld, CHUNK, CHUNKS } = await import(`${ROOT}/overworld.js`);
const { heightsOf } = await import(`${ROOT}/terrain/height.js`);
const { CORNERS } = await import(`${ROOT}/terrain/ground.js`);
const { startFor } = await import(`${ROOT}/worldplan/plan.js`);

const { values } = parseArgs({ options: { seed: { type: "string", default: "2" }, count: { type: "string", default: "120" } } });
const seed = Number(values.seed);
const count = Number(values.count);
// (This thread's own CPU time, ms: the machine is shared, so the wall clock is no measure)
const now = () => { const { user, system } = process.threadCpuUsage(); return (user + system) / 1000; };
const stats = (list) => {
    const sorted = [...list].sort((a, b) => a - b);
    const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];

    return { n: sorted.length, mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2), p50: +at(0.5).toFixed(2), p90: +at(0.9).toFixed(2), max: +sorted.at(-1).toFixed(2) };
};

let t = now();
const world = buildWorld({ seed });

console.log(`buildWorld ${Math.round(now() - t)} ms`);

const overworld = world.maps.town;

// (Settlements laid out as chunks near them are made: timed apart, by wrapping settle)
const settlements = overworld.settlements;
const settle = settlements.settle.bind(settlements);
let settling = 0;
const laid = [];

settlements.settle = (cx, cy) => {
    const before = now();
    const result = settle(cx, cy);
    const took = now() - before;

    settling += took;

    if (took > 5) {
        laid.push(+took.toFixed(1));
    }

    return result;
};

// A square spiral of chunks out from a people's start town, as a player walking would want them
function* spiral(cx, cy) {
    yield [cx, cy];

    for (let ring = 1; ; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
            yield [cx + dx, cy - ring];
            yield [cx + dx, cy + ring];
        }

        for (let dy = -ring + 1; dy < ring; dy++) {
            yield [cx - ring, cy + dy];
            yield [cx + ring, cy + dy];
        }
    }
}

for (const [race, given] of [["human", false], ["elf", true], ["orc", false], ["cat", true]]) {
    const { at } = startFor(world.plan, race);
    const [hx, hy] = [Math.floor(at[0] / CHUNK), Math.floor(at[1] / CHUNK)];
    const times = [];
    const heights = [];
    let made = 0;

    for (const [cx, cy] of spiral(hx, hy)) {
        if (made >= count) {
            break;
        }

        if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS || overworld.made(cx * CHUNK, cy * CHUNK, cx * CHUNK, cy * CHUNK)) {
            continue;
        }

        if (given && !overworld.ground.has(cx, cy)) {
            const before = now();

            overworld.ground.give(cx, cy, heightsOf(world.plan, cx * CHUNK, cy * CHUNK, CORNERS, 1));
            heights.push(now() - before);
        }

        settling = 0;

        const before = now();

        overworld.chunk(cx, cy);
        times.push(now() - before - settling);
        made++;
    }

    console.log(`${race.padEnd(6)} heights ${given ? "given (worker)" : "worked out here"}: chunk ${JSON.stringify(stats(times))}${heights.length ? `; heightsOf alone ${JSON.stringify(stats(heights))}` : ""}`);
}

console.log(`settlements laid out while making chunks (ms each, over 5): ${JSON.stringify(laid)}`);
console.log(`heap ${Math.round(process.memoryUsage().heapUsed / 2 ** 20)} MB, arrayBuffers ${Math.round(process.memoryUsage().arrayBuffers / 2 ** 20)} MB, chunks kept ${overworld.chunks.size}`);
