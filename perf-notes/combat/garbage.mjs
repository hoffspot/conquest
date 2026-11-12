// How much a step allocates (bytes of JavaScript heap a step, between collections): run with a
// young generation big enough that none's collected over the steps measured.
//   node --expose-gc --max-semi-space-size=128 garbage.mjs [--n 25,50,100,200] [--mode lasting]
import { parseArgs } from "node:util";
import { muster } from "./bench.mjs";

const { values } = parseArgs({ allowPositionals: true, options: { n: { type: "string", default: "25,50,100,200" }, mode: { type: "string", default: "lasting" }, runs: { type: "string" }, seconds: { type: "string" }, quiet: { type: "boolean" }, battle: { type: "string" }, json: { type: "boolean" }, size: { type: "string" } } });
const { navigatorOf } = await import("/home/user/conquest/client/js/core/navigation.js");
const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
const navigation = navigatorOf(world);

for (let y = 16; y < 160; y += 32) {
    for (let x = 16; x < 160; x += 32) {
        navigation.path([x, y], [x + 1, y + 1]);
    }
}

for (const n of values.n.split(",").map(Number)) {
    const { battle } = muster(n, values.mode, world);

    // (Up to the fight: 10 s; then 200 steps of it, 20 at a time)
    for (let k = 0; k < 200; k++) {
        battle.advance(50);
    }

    const each = [];

    for (let batch = 0; batch < 10; batch++) {
        globalThis.gc();

        const before = process.memoryUsage().heapUsed;

        for (let k = 0; k < 20; k++) {
            battle.advance(50);
        }

        each.push((process.memoryUsage().heapUsed - before) / 20);
    }

    each.sort((a, b) => a - b);
    console.log(`n=${n} (${values.mode}): ${(each[5] / 1024).toFixed(0)} KB a step (median of 10 batches of 20 steps; ${(each[0] / 1024).toFixed(0)} to ${(each[9] / 1024).toFixed(0)}): ${((each[5] * 20) / 2 ** 20).toFixed(1)} MB a second`);
}
