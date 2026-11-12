// The host's field battle (core/host.js FIELD_BATTLE: the debug overlay's) out in the real world
// (seed 2), as test/field-battle.test.js musters it: each step's time, the host's whole step and
// the battle's own part of it (Battle.advance, wrapped).
//
//   node field.mjs [--sizes 12,25,50,100] [--runs 3] [--seconds 60]
import { parseArgs } from "node:util";
const { Battle, STEP_MS } = await import(process.env.BATTLE ?? "/home/user/conquest/client/js/core/battle.js");
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { squaresOf } from "/home/user/conquest/client/js/core/grid.js";
import { navigatorOf } from "/home/user/conquest/client/js/core/navigation.js";

const { values } = parseArgs({ options: { sizes: { type: "string", default: "12,25,50,100" }, runs: { type: "string", default: "3" }, seconds: { type: "string", default: "60" }, quiet: { type: "boolean", default: false } } });
const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false });
const world = buildWorld({ seed: 2 });

function outOfTown() {
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });

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

    for (let r = 60; r < 1500; r += 20) {
        for (let a = 0; a < 24; a++) {
            const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

            if (open(x, y)) {
                host.battle.place(HOST_PLAYER, "town", [x, y], { facing: Math.PI });

                return { host, me };
            }
        }
    }

    throw new Error("no open ground");
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
const stats = (times) => {
    const sorted = [...times].sort((a, b) => a - b);

    return `mean ${(times.reduce((sum, ms) => sum + ms, 0) / times.length).toFixed(3)} ms, p50 ${quantile(sorted, 0.5).toFixed(3)}, p95 ${quantile(sorted, 0.95).toFixed(3)}, p99 ${quantile(sorted, 0.99).toFixed(3)}, worst ${sorted.at(-1).toFixed(2)} (step ${times.indexOf(sorted.at(-1))})`;
};

// (The battle's own part of the host's step)
let inBattle = 0;
const advance = Battle.prototype.advance;

Battle.prototype.advance = function (ms) {
    const start = performance.now();
    const events = advance.call(this, ms);

    inBattle += performance.now() - start;

    return events;
};

function run(size, seconds) {
    const { host } = outOfTown();
    const navigation = navigatorOf(host.battle.maps.town);
    const result = host.command(HOST_PLAYER, { type: "fieldBattle", size, facing: Math.PI });

    if (!result.ok) {
        throw new Error(`refused: ${JSON.stringify(result)}`);
    }

    const [whole, battle, bakes] = [[], [], []];
    let paths = 0;
    const onPath = host.battle.onPath;
    const perStep = [];
    let thisStep = 0;

    host.battle.onPath = (...args) => {
        paths++;
        thisStep++;
        onPath?.(...args);
    };

    let firstHit = null;
    let deaths = 0;

    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        const baked = navigation.baked;

        inBattle = 0;

        const start = performance.now();
        const events = host.advance(STEP_MS);

        whole.push(performance.now() - start);
        battle.push(inBattle);
        perStep.push(thisStep);
        thisStep = 0;
        bakes.push(navigation.baked - baked);

        for (const event of events) {
            if (event.type === "hit" && firstHit === null) {
                firstHit = whole.length - 1;
            }

            deaths += event.type === "death" ? 1 : 0;
        }
    }

    return { whole, battle, bakes, paths, perStep, firstHit, deaths, actors: host.battle.actors.length, alive: host.battle.actors.filter(({ dead }) => !dead).length };
}

// (Warm)
run(10, 30);

for (const key of Object.keys(globalThis.__c ?? {})) {
    delete globalThis.__c[key];
}

for (const size of values.sizes.split(",").map(Number)) {
    const all = [];

    for (let k = 0; k < Number(values.runs); k++) {
        all.push(run(size, Number(values.seconds)));
    }

    const from = all[0].firstHit ?? 0;
    const least = (key) => all[0][key].map((_, k) => Math.min(...all.map((each) => each[key][k])));
    const baked = all[0].bakes.reduce((sum, count) => sum + count, 0);

    console.log(`${size} a side (${all[0].actors} in the battle, ${all[0].alive} alive at the end, ${all[0].deaths} deaths; ${all[0].paths} ways found; ${baked} navigation tiles baked in the first run's steps, ${all.at(-1).bakes.reduce((sum, count) => sum + count, 0)} in the last's); first blow at step ${from}`);
    console.log(`  host's whole step, fighting (least of ${all.length} runs): ${stats(least("whole").slice(from))}`);
    console.log(`  battle's part of it,  fighting (least of ${all.length} runs): ${stats(least("battle").slice(from))}`);
    console.log(`  host's whole step, marching (before the first blow): ${stats(least("whole").slice(0, from))}`);
    console.log(`  first run alone, whole step, every step: ${stats(all[0].whole)}`);

    const ways = all[0].perStep;
    const busiest = ways.map((count, k) => [count, k]).sort((a, b) => b[0] - a[0]).slice(0, 8);
    const none = ways.filter((count) => count === 0).length;

    console.log(`  ways found a step: ${(all[0].paths / ways.length).toFixed(2)} on average, none in ${none} of ${ways.length} steps; the most: ${busiest.map(([count, k]) => `${count} at step ${k} (${least("battle")[k].toFixed(2)} ms)`).join(", ")}`);

    if (globalThis.__c) {
        const steps = all.length * all[0].whole.length;

        console.log("  calls a step (all steps, all runs): " + Object.entries(globalThis.__c).map(([key, count]) => `${key} ${(count / steps).toFixed(count / steps < 10 ? 2 : 0)}`).join(", "));

        for (const key of Object.keys(globalThis.__c)) {
            delete globalThis.__c[key];
        }
    }
}
