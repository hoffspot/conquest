// What Battle.snapshot, Battle.restore and Battle.fork cost with N in the battle (mid-fight).
import { muster } from "./bench.mjs";
import { Battle } from "/home/user/conquest/client/js/core/battle.js";

const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
const time = (work, times = 30) => {
    const each = [];

    for (let k = 0; k < times; k++) {
        const start = performance.now();

        work();
        each.push(performance.now() - start);
    }

    each.sort((a, b) => a - b);

    return `${each[0].toFixed(2)} ms at the least, ${each[Math.floor(times / 2)].toFixed(2)} the median`;
};

for (const n of [25, 100, 200]) {
    const { battle } = muster(n, "lasting", world);

    for (let k = 0; k < 300; k++) {
        battle.advance(50);
    }

    const snapshot = battle.snapshot();

    console.log(`n=${n}: snapshot ${time(() => battle.snapshot())}; restore ${time(() => Battle.restore(world, snapshot))}; fork of one ${time(() => battle.fork(["a-0"]))}; as JSON ${(JSON.stringify(snapshot, (key, value) => (typeof value === "number" && !Number.isFinite(value) ? 0 : value)).length / 1024).toFixed(0)} KB`);
}
