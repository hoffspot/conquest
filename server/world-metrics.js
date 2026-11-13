// What a world's thread counts of itself (generated/multiplayer_scaling_plan.md 6A-2), beside its
// steps' times (core/runner.js StepTimes, the runner's own): the whole of each look at the world
// and its two parts (the steps with what's sent of them, and what's made ahead), its saves, how
// late its thread's event loop ran, its garbage collections by kind, and what it's heard from its
// players' games. All of it is counted where it happens, into fixed buckets or plain sums, and
// told to the supervisor a second's worth at a time in the `state` message the thread sends
// already (world-worker.js report): `take()` is what's been counted since it was last asked. The
// supervisor adds it up (server-metrics.js), so a world set aside and started again carries on
// counting from where it was.
//
// The step's own parts are counted too: each pass of the host's step and of what's sent after it,
// by name (client/js/core/probe.js HOST_PASSES, FLUSH_PASSES), its time summed and how often it
// was begun, with the work the probes count (COUNTERS). The world's thread installs this
// recorder's probes (`probes`: world-worker.js), which read the clock once a pass and are read
// by nothing in the rules, so the world steps the same with them (test/probe.test.js).
//
// And a late step is kept with its parts (generated/multiplayer_scaling_plan.md 0-13; LateSteps):
// a step whose passes, what's sent after it among them, came to more than a step of the world's
// time (LATE.over), with each pass's time in it, the longest first, what each counter went up by
// and what ground it made for itself. The thread keeps its last LATE.kept and tells the
// supervisor of each once (`late` in what `take()` gives), which counts them by their longest
// pass and shows them on Health. Nothing new is timed for it: a step's time here is its passes'
// together, as the probes timed them already, read before the step and after it.
//
// A step pays for none of it but a reading of the clock a pass and a few additions
// (`npm run step-budget` times it, every pass of every step, and fails if it comes to 0.05 ms a
// step). The event loop's delay and the collections are Node's own to measure (perf_hooks), off
// the step's path.

import { constants, monitorEventLoopDelay, performance, PerformanceObserver } from "node:perf_hooks";
import { Probes } from "../client/js/core/probe.js";
import { StepTimes, TimeBuckets } from "../client/js/core/runner.js";

/** A garbage collection's kinds, as they're named in what's counted (perf_hooks' `detail.kind`). */
export const GC_KINDS = Object.freeze({
    [constants.NODE_PERFORMANCE_GC_MINOR]: "minor",
    [constants.NODE_PERFORMANCE_GC_MAJOR]: "major",
    [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental",
    [constants.NODE_PERFORMANCE_GC_WEAKCB]: "weak",
});

/** How finely the event loop's delay is sampled (ms). */
export const LOOP_RESOLUTION = 10;

/**
 * A thread's garbage collections counted by kind, as Node tells of them (after each, off the
 * path of whatever it interrupted): `take()` gives { kind: { count, ms } } since it was last
 * asked, with only the kinds there were. `stop()` ends it.
 */
export class Collections {
    #counted = {};
    #observer = null;

    constructor() {
        try {
            this.#observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.add(GC_KINDS[entry.detail?.kind] ?? "other", entry.duration);
                }
            });
            this.#observer.observe({ entryTypes: ["gc"] });
        } catch {
            // (A Node that doesn't tell of them: none are counted)
            this.#observer = null;
        }
    }

    /** One collection of `kind`, which took `ms`. */
    add(kind, ms) {
        const counted = (this.#counted[kind] ??= { count: 0, ms: 0 });

        counted.count++;
        counted.ms += ms;
    }

    take() {
        const counted = this.#counted;

        this.#counted = {};

        return counted;
    }

    stop() {
        this.#observer?.disconnect();
        this.#observer = null;
    }
}

/**
 * How late a thread's event loop ran (Node's own sampling of it, every LOOP_RESOLUTION): `take()`
 * gives { mean, p99, max } (ms) since it was last asked, or null with nothing sampled. `stop()`
 * ends it.
 */
export class LoopDelay {
    #monitor;

    constructor(resolution = LOOP_RESOLUTION) {
        this.#monitor = monitorEventLoopDelay({ resolution });
        this.#monitor.enable();
    }

    take() {
        const monitor = this.#monitor;

        if (!monitor || !(monitor.count > 0)) {
            return null;
        }

        // (Its times are nanoseconds, each the sampling interval and how late it came: the
        // lateness is what's told)
        const late = (ns) => Math.max(0, ns / 1e6 - LOOP_RESOLUTION);
        const taken = { mean: late(monitor.mean), p99: late(monitor.percentile(99)), max: late(monitor.max) };

        monitor.reset();

        return taken;
    }

    stop() {
        this.#monitor?.disable();
        this.#monitor = null;
    }
}

/**
 * A step is late whose passes came to more than `over` ms (a step of the world's time: the
 * plan's gate counts those, "no tick over 50 ms"), and the last `kept` of them are kept.
 */
export const LATE = Object.freeze({ over: 50, kept: 32 });

/**
 * A world's late steps kept with their parts, read off its probes (core/probe.js Probes): `begin`
 * before a step and `end` after it and what's sent of it (or `begin` again, a step played straight
 * after another) say what each pass's time and each counter went up by in between, and a step
 * whose passes came to more than `over` ms is kept: { when (ms since 1970), at (the battle's time
 * it ended at, ms), ms (its passes' together), pass (the longest's name), passes ({ name: ms },
 * the longest first), counts ({ name: how many more }), made ({ chunks, tiles, floors }: the
 * ground, the navigation's tiles and the floors' tiles it made for itself) }. `kept` is the last
 * `most` of them, the oldest first; `count`, how many there have been; and `take()` those since it
 * was last asked. A step that isn't late costs two goings through the probes' passes and counters,
 * and keeps nothing.
 */
export class LateSteps {
    // The probes' passes (their entries, in the order they were first begun) and counters (by
    // name) as they stood when the step began, and what it had made
    #passes = [];
    #passed = [];
    #names = [];
    #counted = [];
    #made = [0, 0, 0];
    #open = false;
    #untold = [];

    constructor(probes, { over = LATE.over, kept = LATE.kept, now = () => Date.now() } = {}) {
        this.probes = probes;
        this.over = over;
        this.most = kept;
        this.now = now;
        this.count = 0;
        this.kept = [];
    }

    // Every pass and counter the probes have now among those read: one new since has 0 before
    #sync() {
        const { passes, counts } = this.probes;

        if (passes.size < this.#passes.length || counts.size < this.#names.length) {
            // (The probes begun afresh, Probes.reset: nothing of before is theirs)
            this.#passes.length = this.#passed.length = this.#names.length = this.#counted.length = 0;
        }

        if (passes.size > this.#passes.length) {
            let k = 0;

            for (const pass of passes.values()) {
                if (k++ >= this.#passes.length) {
                    this.#passes.push(pass);
                    this.#passed.push(0);
                }
            }
        }

        if (counts.size > this.#names.length) {
            let k = 0;

            for (const name of counts.keys()) {
                if (k++ >= this.#names.length) {
                    this.#names.push(name);
                    this.#counted.push(0);
                }
            }
        }
    }

    /**
     * A step about to be played, the battle's time `at` (ms): what the probes have and what's
     * been made (chunks of ground, navigation tiles baked, floors' tiles baked: all there have
     * been) read. A step still open, played straight before this one, is ended first.
     */
    begin(at, chunks = 0, tiles = 0, floors = 0) {
        if (this.#open) {
            this.end(at, chunks, tiles, floors);
        }

        this.#sync();

        const [passes, passed, names, counted, { counts }] = [this.#passes, this.#passed, this.#names, this.#counted, this.probes];

        for (let k = 0; k < passes.length; k++) {
            passed[k] = passes[k].ms;
        }

        for (let k = 0; k < names.length; k++) {
            counted[k] = counts.get(names[k]);
        }

        this.#made[0] = chunks;
        this.#made[1] = tiles;
        this.#made[2] = floors;
        this.#open = true;
    }

    /**
     * The probes are about to be set back to nothing (WorldMetrics take, within a step: one sent
     * out of the world in it has the thread say how it is there and then): what the open step
     * has had so far is kept, so its parts are whole all the same.
     */
    rebase() {
        if (!this.#open) {
            return;
        }

        this.#sync();

        for (let k = 0; k < this.#passes.length; k++) {
            this.#passed[k] -= this.#passes[k].ms;
        }

        for (let k = 0; k < this.#names.length; k++) {
            this.#counted[k] -= this.probes.counts.get(this.#names[k]);
        }
    }

    /**
     * The step begun is played and sent, the battle's time now `at`: returns it with its parts if
     * its passes came to more than `over` ms, having kept it; or null, as nearly every time.
     */
    end(at, chunks = 0, tiles = 0, floors = 0) {
        if (!this.#open) {
            return null;
        }

        this.#open = false;
        this.#sync();

        const [passes, passed] = [this.#passes, this.#passed];
        let ms = 0;

        for (let k = 0; k < passes.length; k++) {
            ms += passes[k].ms - passed[k];
        }

        if (!(ms > this.over)) {
            return null;
        }

        const names = [...this.probes.passes.keys()];
        const spent = passes.map((pass, k) => [names[k], pass.ms - passed[k]]).filter(([, each]) => each > 0).sort(([, a], [, b]) => b - a);
        const more = this.#names.map((name, k) => [name, this.probes.counts.get(name) - this.#counted[k]]).filter(([, n]) => n !== 0);
        const late = {
            when: this.now(),
            at,
            ms,
            pass: spent[0][0],
            passes: Object.fromEntries(spent),
            counts: Object.fromEntries(more),
            made: { chunks: chunks - this.#made[0], tiles: tiles - this.#made[1], floors: floors - this.#made[2] },
        };

        this.count++;
        this.kept.push(late);
        this.#untold.push(late);

        if (this.kept.length > this.most) {
            this.kept.shift();
        }

        // (Never more waiting to be told than are kept: a thread that's told no one for a while)
        if (this.#untold.length > this.most) {
            this.#untold.shift();
        }

        return late;
    }

    /** Those kept since it was last asked, the oldest first. */
    take() {
        const untold = this.#untold;

        this.#untold = [];

        return untold;
    }
}

export class WorldMetrics {
    /**
     * @param {object} [options]
     * @param {boolean} [options.node] - Whether the thread's event loop and its garbage collections
     *   are measured too (Node's own: not in a test of the counting alone).
     * @param {function} [options.clock] - The time the step's passes are timed by (ms).
     */
    constructor({ node = true, clock = () => performance.now() } = {}) {
        /** The whole of each look at the world (ms: world-worker.js tick), as its steps are timed. */
        this.ticks = new StepTimes();

        /** A look's parts: its steps with what's sent of them, and what's made ahead. */
        this.advance = new TimeBuckets();
        this.ahead = new TimeBuckets();

        /** Its saves (ms, from asked to on the disk), and how many failed. */
        this.saves = new TimeBuckets();
        this.failures = 0;

        /** What its players' games have said to it, and how many of those were commands. */
        this.messages = 0;
        this.commands = 0;

        /**
         * The step's own parts (core/probe.js Probes): each pass's time and the work counted,
         * once whoever runs the world has installed them (world-worker.js).
         */
        this.probes = new Probes({ clock });

        /** Its late steps, kept with their parts off those probes (LateSteps): whoever plays the world says when a step begins and ends. */
        this.late = new LateSteps(this.probes);

        this.loop = node ? new LoopDelay() : null;
        this.collections = node ? new Collections() : null;

        // What had been counted elsewhere when last asked (take): time let go, the thread's CPU, what's made ahead
        this.before = { dropped: 0, cpu: { user: 0, system: 0 }, made: { chunks: 0, rooms: 0 } };
    }

    /** A look at the world while its clock runs: how long its steps and what's sent of them took, then what's made ahead, and the battle's time it ended at. */
    tick(advance, ahead, at) {
        this.advance.add(advance);
        this.ahead.add(ahead);
        this.ticks.add(advance + ahead, at);
    }

    /** A save that reached the disk, or didn't (`ok`), `ms` after it was asked for. */
    saved(ms, ok) {
        this.saves.add(ms);
        this.failures += ok ? 0 : 1;
    }

    /** Something a player's game said (`kind`: core/netplay.js). */
    heard(kind) {
        this.messages++;
        this.commands += kind === "command" ? 1 : 0;
    }

    /**
     * What's been counted since it was last asked, for the `state` message: its steps' times
     * (`steps`: the runner's), `dropped` (all the time it's let go, ms), `cpu` (the thread's own,
     * µs: process.threadCpuUsage, or null) and `made` (what's been made ahead: { chunks, rooms })
     * as they stand now, told as how much more. `passes` is each pass of the step that was
     * played since ({ name: [ms, times begun] }) and `work` what was counted of its work
     * ({ name: how many }): both empty unless the probes are installed. `late` is the late steps
     * kept since (LateSteps), each with its parts: none, nearly every time.
     */
    take({ steps = null, dropped = 0, cpu = null, made = { chunks: 0, rooms: 0 } } = {}) {
        const { before } = this;
        const taken = {
            steps: steps?.buckets.take() ?? null,
            ticks: this.ticks.buckets.take(),
            advance: this.advance.take(),
            ahead: this.ahead.take(),
            saves: this.saves.take(),
            failures: this.failures,
            messages: this.messages,
            commands: this.commands,
            dropped: dropped - before.dropped,
            cpu: cpu ? { user: cpu.user - before.cpu.user, system: cpu.system - before.cpu.system } : null,
            made: { chunks: made.chunks - before.made.chunks, rooms: made.rooms - before.made.rooms },
            loop: this.loop?.take() ?? null,
            gc: this.collections?.take() ?? {},
            late: this.late.take(),
            ...this.#parts(),
        };

        this.failures = 0;
        this.messages = 0;
        this.commands = 0;
        this.before = { dropped, cpu: cpu ? { user: cpu.user, system: cpu.system } : before.cpu, made: { chunks: made.chunks, rooms: made.rooms } };

        return taken;
    }

    // The step's parts since they were last asked for, and the probes begun afresh (a pass being
    // timed now is timed on: its time so far is told now, the rest the next time)
    #parts() {
        const { probes } = this;
        const passes = {};
        const work = {};

        if (probes.current !== null) {
            const now = probes.clock();

            probes.current.ms += now - probes.since;
            probes.since = now;
        }

        // (A step open now keeps what it's had of them so far: LateSteps rebase)
        this.late.rebase();

        for (const [name, pass] of probes.passes) {
            if (pass.calls > 0 || pass.ms > 0) {
                passes[name] = [pass.ms, pass.calls];
                pass.ms = 0;
                pass.calls = 0;
            }
        }

        for (const [name, counted] of probes.counts) {
            if (counted > 0) {
                work[name] = counted;
                probes.counts.set(name, 0);
            }
        }

        return { passes, work };
    }

    /** No longer measuring the thread's event loop or its collections. */
    stop() {
        this.loop?.stop();
        this.collections?.stop();
    }
}
