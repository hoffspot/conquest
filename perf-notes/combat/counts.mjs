// How often a step asks what (calls a step, from the counting copy of battle.js: instrument.py).
import { muster } from "./bench.mjs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ allowPositionals: true, options: { n: { type: "string", default: "25,50,100,200" }, mode: { type: "string", default: "lasting" }, seconds: { type: "string", default: "40" }, battle: { type: "string" }, json: { type: "boolean", default: false }, size: { type: "string" }, runs: { type: "string" }, quiet: { type: "boolean" } } });
const { navigatorOf } = await import("/home/user/conquest/client/js/core/navigation.js");
const SIZE = 160;
const world = { blocked: Array.from({ length: SIZE }, () => new Uint8Array(SIZE)) };
const rows = [];
const navigation = navigatorOf(world);

for (let y = 16; y < SIZE; y += 32) {
    for (let x = 16; x < SIZE; x += 32) {
        navigation.path([x, y], [x + 1, y + 1]);
    }
}


for (const n of values.n.split(",").map(Number)) {
    const { battle, paths } = muster(n, values.mode, world);
    const steps = (Number(values.seconds) * 1000) / 50;
    let fightingFrom = null;
    let before = null;
    const perStep = [];

    for (let k = 0; k < steps; k++) {
        const c0 = { ...globalThis.__c };
        const p0 = paths.count;
        const t0 = performance.now();
        const events = battle.advance(50);
        const ms = performance.now() - t0;

        if (fightingFrom === null && events.some(({ type }) => type === "hit")) {
            fightingFrom = k;
            before = { ...globalThis.__c };
        }

        perStep.push({ k, ms, paths: paths.count - p0, sees: (globalThis.__c.sees ?? 0) - (c0.sees ?? 0), within: (globalThis.__c.withinFound ?? 0) - (c0.withinFound ?? 0) });
    }

    const fought = steps - fightingFrom;
    const each = Object.fromEntries(Object.entries(globalThis.__c).map(([key, count]) => [key, (count - (before[key] ?? 0)) / fought]));

    rows.push({ n, ...each });

    // (The busiest steps for ways found)
    const busiest = [...perStep].sort((a, b) => b.paths - a.paths).slice(0, 5);

    console.log(`n=${n} (${values.mode}): a step, fighting (${fought} steps from ${fightingFrom})`);
    console.log("  " + Object.entries(each).map(([key, count]) => `${key} ${count.toFixed(count < 10 ? 2 : 0)}`).join(", "));
    console.log("  most ways found in a step: " + busiest.map(({ k, paths: found, ms }) => `${found} at step ${k} (${ms.toFixed(2)} ms)`).join(", "));
    for (const key of Object.keys(globalThis.__c)) {
        delete globalThis.__c[key];
    }
}
