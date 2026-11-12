// The host's field battle (FIELD a side): how often V8 collects over its steps, and for how long,
// with Node's default heap.
import { PerformanceObserver } from "node:perf_hooks";
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { squaresOf } from "/home/user/conquest/client/js/core/grid.js";

const host = new Host(buildWorld({ seed: 2 }), { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false } });

const me = host.battle.actor(HOST_PLAYER);
const squares = squaresOf(host.battle.maps.town);
const open = (x0, y0) => {
    for (let y = y0 - 70; y < y0 + 10; y++) {
        for (let x = x0 - 25; x < x0 + 25; x++) {
            if (squares.blocked(x, y) || squares.opaque(x, y)) {
                return false;
            }
        }
    }

    return true;
};

out: for (let r = 60; r < 1500; r += 20) {
    for (let a = 0; a < 24; a++) {
        const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

        if (open(x, y)) {
            host.battle.place(HOST_PLAYER, "town", [x, y], { facing: Math.PI });
            break out;
        }
    }
}

host.command(HOST_PLAYER, { type: "fieldBattle", size: Number(process.env.FIELD ?? 50), facing: Math.PI });

for (let k = 0; k < 250; k++) {
    host.advance(50);
}

let collections = [];

new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        collections.push({ kind: entry.detail.kind, ms: entry.duration });
    }
}).observe({ entryTypes: ["gc"] });

await new Promise((resolve) => setTimeout(resolve, 50));
collections = [];

const steps = 800;
const start = performance.now();

for (let k = 0; k < steps; k++) {
    host.advance(50);
}

const ms = performance.now() - start;

await new Promise((resolve) => setTimeout(resolve, 50));

const sorted = collections.map((each) => each.ms).sort((a, b) => a - b);

console.log(`${process.env.FIELD ?? 50} a side: ${steps} steps in ${ms.toFixed(0)} ms; ${collections.length} collections (${collections.filter(({ kind }) => kind === 1).length} young), ${sorted.reduce((sum, each) => sum + each, 0).toFixed(1)} ms in them: ${((sorted.reduce((sum, each) => sum + each, 0) / ms) * 100).toFixed(1)}% of the steps' time; median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(2)} ms, longest ${sorted.at(-1)?.toFixed(2)} ms`);
