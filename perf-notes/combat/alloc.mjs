// Where a step's garbage is made: V8's sampling heap profiler, counting what's collected too
// (includeObjectsCollectedByMinorGC/MajorGC), by the function that allocated it.
//   node alloc.mjs [--n 100] [--mode lasting] [--steps 1200]      (the open field: bench.mjs)
//   FIELD=50 node --import ./swap.mjs alloc.mjs                    (the host's field battle)
import inspector from "node:inspector";
import { parseArgs } from "node:util";
import { muster } from "./bench.mjs";

const { values } = parseArgs({ allowPositionals: true, options: { n: { type: "string", default: "100" }, mode: { type: "string", default: "lasting" }, steps: { type: "string", default: "1200" }, top: { type: "string", default: "32" }, runs: { type: "string" }, seconds: { type: "string" }, quiet: { type: "boolean" }, battle: { type: "string" }, json: { type: "boolean" }, size: { type: "string" } } });
const { navigatorOf } = await import("/home/user/conquest/client/js/core/navigation.js");
let advance;
let label;

if (process.env.FIELD) {
    const { Host, HOST_PLAYER } = await import("/home/user/conquest/client/js/core/host.js");
    const { buildWorld } = await import("/home/user/conquest/client/js/core/overworld.js");
    const { squaresOf } = await import("/home/user/conquest/client/js/core/grid.js");
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

    host.command(HOST_PLAYER, { type: "fieldBattle", size: Number(process.env.FIELD), facing: Math.PI });
    advance = () => host.advance(50);
    label = `the host's field battle, ${process.env.FIELD} a side`;

    // (Marched up to each other, and the code warm)
    for (let k = 0; k < 250; k++) {
        advance();
    }
} else {
    const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
    const navigation = navigatorOf(world);

    for (let y = 16; y < 160; y += 32) {
        for (let x = 16; x < 160; x += 32) {
            navigation.path([x, y], [x + 1, y + 1]);
        }
    }

    const { battle } = muster(Number(values.n), values.mode, world);

    advance = () => battle.advance(50);
    label = `open field, n=${values.n} (${values.mode})`;

    for (let k = 0; k < 200; k++) {
        advance();
    }
}

const session = new inspector.Session();

session.connect();

const post = (method, params) => new Promise((resolve, reject) => session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))));

await post("HeapProfiler.enable");
await post("HeapProfiler.startSampling", { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });

const steps = Number(values.steps);

for (let k = 0; k < steps; k++) {
    advance();
}

const { profile } = await post("HeapProfiler.stopSampling");
const by = new Map();
let total = 0;

const natives = new Map();

(function walk(node, parent) {
    const name = `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url.split("/").slice(-2).join("/")}:${node.callFrame.lineNumber + 1}`;

    by.set(name, (by.get(name) ?? 0) + node.selfSize);
    total += node.selfSize;

    // (What the engine's own functions allocate, by who called them: an iterator's `next`, `set`...)
    if (!node.callFrame.url && node.selfSize) {
        const key = `${node.callFrame.functionName} < ${parent}`;

        natives.set(key, (natives.get(key) ?? 0) + node.selfSize);
    }

    for (const child of node.children ?? []) {
        walk(child, name);
    }
})(profile.head, "");

console.log(`${label}: ${(total / steps / 1024).toFixed(0)} KB allocated a step over ${steps} steps (sampled)`);

for (const [name, size] of [...by].sort((a, b) => b[1] - a[1]).slice(0, Number(values.top))) {
    console.log(`${((size / total) * 100).toFixed(1).padStart(5)}%  ${(size / steps / 1024).toFixed(1).padStart(7)} KB/step  ${name}`);
}

console.log("the engine's own, by caller:");

for (const [name, size] of [...natives].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    console.log(`${((size / total) * 100).toFixed(1).padStart(5)}%  ${(size / steps / 1024).toFixed(1).padStart(7)} KB/step  ${name}`);
}
