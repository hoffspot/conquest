// A first look at the plan cache: node try-cache.mjs (run from the checkout)
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const cpu = (work) => {
    const start = process.cpuUsage();
    const result = work();
    const used = process.cpuUsage(start);

    return [(used.user + used.system) / 1000, result];
};
const at = (file) => pathToFileURL(path.resolve(file)).href;
const { keyOf, sourcesOf, PLANNER, plansIn } = await import(at("test/plan-cache.js"));
const { layOutWorld, planWorld, keepPlans } = await import(at("client/js/core/worldplan/plan.js"));
const { watersOf } = await import(at("client/js/core/terrain/waters.js"));

const [keyMs, key] = cpu(() => keyOf(PLANNER));

console.log("key", key, keyMs.toFixed(1), "ms;", sourcesOf(PLANNER).length, "files");

const folder = process.argv[2];
const store = plansIn(folder, key);
const seed = Number(process.argv[3] ?? 2);
const [getMs, had] = cpu(() => store.get(seed));

console.log("get", getMs.toFixed(1), "ms", had ? "hit" : "miss");

const [layMs, fresh] = cpu(() => layOutWorld(seed));

console.log("layOutWorld", layMs.toFixed(0), "ms");

if (!had) {
    const [putMs] = cpu(() => store.put(seed, fresh));

    console.log("put", putMs.toFixed(1), "ms");
}

const [againMs, again] = cpu(() => store.get(seed));

console.log("get again", againMs.toFixed(1), "ms");
assert.deepStrictEqual(again, fresh);
console.log("equal; keys", Object.keys(fresh).join(","));

const [w1, a] = cpu(() => watersOf(fresh).surfaces);
const [w2, b] = cpu(() => watersOf(again).surfaces);

console.log("surfaces: fresh", w1.toFixed(1), "ms; read back", w2.toFixed(1), "ms");
assert.deepStrictEqual(b, a);

const [f1, fa] = cpu(() => watersOf(fresh).fords());
const [f2, fb] = cpu(() => watersOf(again).fords());

console.log("fords: fresh", f1.toFixed(1), "ms; read back", f2.toFixed(1), "ms;", fa.length);
assert.deepStrictEqual(fb, fa);

keepPlans(store);
const [planMs] = cpu(() => planWorld(seed));

console.log("planWorld through the store", planMs.toFixed(1), "ms");
