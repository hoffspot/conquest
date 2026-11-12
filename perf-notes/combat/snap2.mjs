import { muster } from "./bench.mjs";

const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
const { battle } = muster(100, "lasting", world);

for (let k = 0; k < 300; k++) {
    battle.advance(50);
}

const json = (value) => JSON.stringify(value, (key, each) => (typeof each === "number" && !Number.isFinite(each) ? 0 : each)).length;
const snapshot = battle.snapshot();
const by = {};

for (const actor of snapshot.actors) {
    for (const [key, value] of Object.entries(actor)) {
        by[key] = (by[key] ?? 0) + json(value ?? null) + key.length + 4;
    }
}

const total = Object.values(by).reduce((sum, each) => sum + each, 0);

console.log(`100 actors: ${(total / 1024).toFixed(0)} KB of actors as JSON; the biggest fields: ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, size]) => `${key} ${(size / 1024).toFixed(0)} KB (${((size / total) * 100).toFixed(0)}%)`).join(", ")}`);
