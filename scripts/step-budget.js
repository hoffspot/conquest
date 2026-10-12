// The world server's step budget (generated/world_server_plan.md §15 S0, §17): a world stepped
// on Node as the server will step it (core/runner.js, nothing drawn), four players out in four
// peoples' start towns walking about, what's near them made ahead between its steps (server/
// ahead.js, its navigation baked and settlements laid out on Node's threads: server/workers.js),
// and how long each of its steps took. No step should take longer than a step (50 ms): one that
// does holds up every player in the world.
//
//     npm run step-budget                    # 60 s of the world's time, seed 2
//     npm run step-budget -- --seconds 600   # longer
//     npm run step-budget -- --seed 7        # another world
//     npm run step-budget -- --no-ahead      # without making anything ahead (to compare)
//     npm run step-budget -- --json          # the numbers as JSON
//
// Exits 1 if any step went over the budget (after the world's opening step and what's round the
// players made ahead: what a player waits for while they load).
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { StepTimes, WorldRunner } from "../client/js/core/runner.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { Ahead } from "../server/ahead.js";
import { installWorkers } from "../server/workers.js";

/**
 * The peoples whose start towns the players are in, how often each is sent somewhere (ms), how far
 * (m); and how long (ms of the wall's time) at most what's round them is made ahead before the
 * world's clock starts (as it will be while a player arriving loads).
 */
export const RUN = Object.freeze({ peoples: ["human", "elf", "orc", "cat"], every: 5000, roam: 40, ready: 60000 });

const hero = (name, race) => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });

/**
 * Run a world for `seconds` of its time, a step at a time (yielding between, so the workers'
 * results come in as they would), its players sent somewhere near every RUN.every. First its
 * opening step (its people put about, its buildings opened: the world loading), and what's round
 * the players made ahead (as while they load). Resolves to { steps (StepTimes.toJSON, the steps
 * after those), over: [{ ms, at }] (those over a step), made (chunks made ahead), ready (ms till
 * all round the players was made), heap (MB), wall (s) }.
 */
export async function stepBudget({ seed = 2, seconds = 60, ahead: making = true } = {}) {
    installWorkers();

    const world = buildWorld({ seed });
    const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "none" } });
    const homes = RUN.peoples.map((race, k) => {
        const { at } = startFor(world.plan, race);
        const square = [Math.round(at[0]), Math.round(at[1])];

        host.join({ id: `p${k + 1}`, hero: hero(`P${k + 1}`, race), square, map: "town" });

        return square;
    });

    host.populate();

    const clock = () => performance.now();
    const runner = new WorldRunner(host, { clock });
    const ahead = making ? new Ahead(world, { host, clock }) : null;
    const worst = [];
    let random = seed;
    const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;

    // (Loading: the world's opening step, then what's round the players made ahead)
    runner.advance(STEP_MS);

    const loading = clock();

    while (ahead && clock() - loading < RUN.ready) {
        runner.bakeAhead(ahead);

        if (ahead.settled) {
            break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const ready = Math.round(clock() - loading);
    const started = clock();

    runner.times = new StepTimes();

    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        if (t % RUN.every === 0) {
            homes.forEach(([x, y], k) => host.command(`p${k + 1}`, { type: "move", to: [Math.round(x + roll() * RUN.roam), Math.round(y + roll() * RUN.roam)] }));
        }

        if (ahead) {
            runner.bakeAhead(ahead);
        }

        const before = runner.times.count;

        runner.advance(STEP_MS);

        if (runner.times.count > before) {
            const ms = runner.times.recent.at(-1);

            if (ms > STEP_MS) {
                worst.push({ ms: Math.round(ms), at: t });
            }
        }

        // (The workers' results heard, as between a server's ticks)
        await new Promise((resolve) => setImmediate(resolve));
    }

    const result = { steps: runner.times.toJSON(), over: worst, made: ahead?.made ?? 0, rooms: ahead?.rooms ?? 0, ready, heap: Math.round(process.memoryUsage().heapUsed / 2 ** 20), wall: Math.round((clock() - started) / 100) / 10 };

    ahead?.dispose();

    return result;
}

async function main() {
    const { values } = parseArgs({ options: { seed: { type: "string", default: "2" }, seconds: { type: "string", default: "60" }, "no-ahead": { type: "boolean", default: false }, json: { type: "boolean", default: false } } });
    const result = await stepBudget({ seed: Number(values.seed), seconds: Number(values.seconds), ahead: !values["no-ahead"] });

    if (values.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        const { steps, over, made, ready, heap, wall } = result;

        console.log(`${steps.count} steps in ${wall} s: mean ${steps.mean.toFixed(2)} ms, p99 ${steps.p99.toFixed(1)} ms, worst ${steps.worst.toFixed(1)} ms at ${(steps.worstAt / 1000).toFixed(1)} s`);
        console.log(`${made} chunks and ${result.rooms} buildings' insides' tiles made ahead, all round the players in ${ready} ms; heap ${heap} MB`);
        console.log(over.length ? `${over.length} steps over ${STEP_MS} ms: ${over.map(({ ms, at }) => `${ms} ms at ${(at / 1000).toFixed(1)} s`).join(", ")}` : `No step over ${STEP_MS} ms.`);
    }

    process.exitCode = result.over.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
