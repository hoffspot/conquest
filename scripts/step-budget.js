// The world server's step budget (generated/world_server_plan.md §15 S0, §17): a world stepped
// on Node as the server will step it (core/runner.js, nothing drawn), four players out in four
// peoples' start towns walking about, what's near them made ahead between its steps (server/
// ahead.js, its navigation baked and settlements laid out on Node's threads: server/workers.js),
// and how long each of its steps took. No step should take longer than a step (50 ms): one that
// does holds up every player in the world.
//
// Each step is timed twice: by the clock, which is what a player would wait (the mean, the 99th
// percentile and the worst said are the clock's), and in the thread's own processor time
// (process.threadCpuUsage), which is what the step cost whatever else the machine was doing. It's
// judged by the second: on a busy machine a step is put off the processor for tens of
// milliseconds now and then, and judged by the clock the script failed one run in three for a
// step that took 14 ms of work. The thread's time is told to the system's tick (4 ms here), so a
// step within a tick of the budget may be counted over it: never under.
//
//     npm run step-budget                    # 60 s of the world's time, seed 2
//     npm run step-budget -- --seconds 600   # longer
//     npm run step-budget -- --seed 7        # another world
//     npm run step-budget -- --field 50      # with a field battle, 50 a side, begun by the first player 10 s in
//     npm run step-budget -- --no-ahead      # without making anything ahead (to compare)
//     npm run step-budget -- --json          # the numbers as JSON
//
// It also times what the world server's thread counts of each step for its metrics (its time
// into buckets, the look it was in and its parts: server/world-metrics.js), by itself, many
// times over: all of it must come to under METRICS_BUDGET a step (generated/
// multiplayer_scaling_plan.md 6A-2).
//
// Exits 1 if any step went over the budget (after the world's opening step and what's round the
// players made ahead: what a player waits for while they load), or if counting a step costs more
// than it may.
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { StepTimes, WorldRunner } from "../client/js/core/runner.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { Ahead } from "../server/ahead.js";
import { installWorkers } from "../server/workers.js";
import { WorldMetrics } from "../server/world-metrics.js";

/** What counting a step for the world server's metrics may cost (ms a step), and how many steps' counting is timed to say. */
export const METRICS_BUDGET = 0.05;
const METRICS_ROUNDS = 200000;

/**
 * What a world's thread does for its metrics each step, as world-worker.js and the runner do it
 * (the clock read before and after the step, its time counted; the look it was in and its two
 * parts counted; and once in twenty steps, a second, all of it taken for the supervisor), done
 * `rounds` times over with no world: how long each took (ms).
 */
export function metricsCost(rounds = METRICS_ROUNDS) {
    const clock = () => performance.now();
    const times = new StepTimes();
    const metrics = new WorldMetrics({ node: false });
    let taken = 0;
    const started = clock();

    for (let k = 0; k < rounds; k++) {
        const before = clock();

        times.add(clock() - before + (k % 7), k * STEP_MS);

        const stepped = clock();

        metrics.tick(stepped - before, clock() - stepped, k * STEP_MS);

        if (k % 20 === 19) {
            taken += metrics.take({ steps: times, dropped: k }).ticks.counts.length;
        }
    }

    return taken ? (clock() - started) / rounds : Infinity;
}

/**
 * The peoples whose start towns the players are in, how often each is sent somewhere (ms), how far
 * (m); and how long (ms of the wall's time) at most what's round them is made ahead before the
 * world's clock starts (as it will be while a player arriving loads).
 */
export const RUN = Object.freeze({ peoples: ["human", "elf", "orc", "cat"], every: 5000, roam: 40, ready: 60000, fieldAt: 10000 });

// The processor time this thread has had (ms: user and system); the whole process's, where a Node
// hasn't the thread's (more than the thread's, never less: the budget's no looser for it)
const cpuNow = () => {
    const { user, system } = process.threadCpuUsage?.() ?? process.cpuUsage();

    return (user + system) / 1000;
};

const hero = (name, race) => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });

/**
 * Run a world for `seconds` of its time, a step at a time (yielding between, so the workers'
 * results come in as they would), its players sent somewhere near every RUN.every. First its
 * opening step (its people put about, its buildings opened: the world loading), and what's round
 * the players made ahead (as while they load). Resolves to { steps (StepTimes.toJSON, the steps
 * after those), over: [{ ms, at }] (those over a step), made (chunks made ahead), ready (ms till
 * all round the players was made), heap (MB), wall (s) }. The steps over one are those over it in
 * the thread's processor time (`over`), each with the clock's time for it (`wall`); `late` counts
 * those over it by the clock; `cpu` is the thread's time for all the steps, a step ({ mean, worst });
 * `metrics` what counting a step for the server's metrics costs ({ step: ms, budget }).
 * With `field`, the first player begins a field battle of that many a side RUN.fieldAt in.
 */
export async function stepBudget({ seed = 2, seconds = 60, ahead: making = true, field = 0 } = {}) {
    installWorkers();

    const world = buildWorld({ seed });
    // (A field battle is the debug overlay's: its first player an owner who may ask for one)
    const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: field ? "owner" : "none" } });
    const homes = RUN.peoples.map((race, k) => {
        const { at } = startFor(world.plan, race);
        const square = [Math.round(at[0]), Math.round(at[1])];

        host.join({ id: `p${k + 1}`, hero: hero(`P${k + 1}`, race), square, map: "town", ...(field && k === 0 ? { role: "owner" } : {}) });

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

    const cpu = { total: 0, worst: 0 };
    let late = 0;
    let fought = null;

    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        if (t % RUN.every === 0) {
            // (The first player stays by their battle, once it's begun)
            homes.forEach(([x, y], k) => (fought && k === 0 ? null : host.command(`p${k + 1}`, { type: "move", to: [Math.round(x + roll() * RUN.roam), Math.round(y + roll() * RUN.roam)] })));
        }

        if (field && t === RUN.fieldAt) {
            fought = host.command("p1", { type: "fieldBattle", size: field, facing: 0 });
        }

        if (ahead) {
            runner.bakeAhead(ahead);
        }

        const before = runner.times.count;
        const cpuBefore = cpuNow();

        runner.advance(STEP_MS);

        if (runner.times.count > before) {
            const spent = cpuNow() - cpuBefore;
            const ms = runner.times.recent.at(-1);

            cpu.total += spent;
            cpu.worst = Math.max(cpu.worst, spent);
            late += ms > STEP_MS ? 1 : 0;

            if (spent > STEP_MS) {
                worst.push({ ms: Math.round(spent), wall: Math.round(ms), at: t });
            }
        }

        // (The workers' results heard, as between a server's ticks)
        await new Promise((resolve) => setImmediate(resolve));
    }

    const result = {
        steps: runner.times.toJSON(),
        cpu: { mean: cpu.total / Math.max(1, runner.times.count), worst: cpu.worst },
        over: worst,
        late,
        ...(field ? { field: { size: field, ok: fought?.ok === true, actors: host.battle.actors.length } } : {}),
        made: ahead?.made ?? 0,
        rooms: ahead?.rooms ?? 0,
        metrics: { step: metricsCost(), budget: METRICS_BUDGET },
        ready,
        heap: Math.round(process.memoryUsage().heapUsed / 2 ** 20),
        wall: Math.round((clock() - started) / 100) / 10,
    };

    ahead?.dispose();

    return result;
}

async function main() {
    const { values } = parseArgs({ options: { seed: { type: "string", default: "2" }, seconds: { type: "string", default: "60" }, field: { type: "string", default: "0" }, "no-ahead": { type: "boolean", default: false }, json: { type: "boolean", default: false } } });
    const result = await stepBudget({ seed: Number(values.seed), seconds: Number(values.seconds), ahead: !values["no-ahead"], field: Number(values.field) || 0 });

    if (values.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        const { steps, cpu, over, late, made, ready, heap, wall } = result;

        console.log(`${steps.count} steps in ${wall} s, by the clock: mean ${steps.mean.toFixed(2)} ms, p99 ${steps.p99.toFixed(1)} ms, worst ${steps.worst.toFixed(1)} ms at ${(steps.worstAt / 1000).toFixed(1)} s${late ? `; ${late} over ${STEP_MS} ms` : ""}`);
        console.log(`In the thread's own processor time: mean ${cpu.mean.toFixed(2)} ms, worst ${cpu.worst.toFixed(1)} ms`);

        if (result.field) {
            console.log(result.field.ok ? `A field battle of ${result.field.size} a side from ${RUN.fieldAt / 1000} s: ${result.field.actors} in the battle at the end` : `No field battle: it was refused`);
        }

        console.log(`${made} chunks and ${result.rooms} buildings' insides' tiles made ahead, all round the players in ${ready} ms; heap ${heap} MB`);
        console.log(`Counting a step for the server's metrics: ${(result.metrics.step * 1000).toFixed(2)} µs (it may cost ${METRICS_BUDGET * 1000})`);
        console.log(over.length ? `${over.length} steps over ${STEP_MS} ms of the thread's time: ${over.map(({ ms, wall: clocked, at }) => `${ms} ms (${clocked} by the clock) at ${(at / 1000).toFixed(1)} s`).join(", ")}` : `No step over ${STEP_MS} ms of the thread's time.`);
    }

    process.exitCode = result.over.length || (result.field && !result.field.ok) || !(result.metrics.step < METRICS_BUDGET) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
