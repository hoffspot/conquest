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
// A step pays for none of it but two readings of the clock and a few additions a look
// (`npm run step-budget` times it, and fails if it comes to 0.05 ms a step). The event loop's
// delay and the collections are Node's own to measure (perf_hooks), off the step's path.

import { constants, monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
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

export class WorldMetrics {
    /**
     * @param {object} [options]
     * @param {boolean} [options.node] - Whether the thread's event loop and its garbage collections
     *   are measured too (Node's own: not in a test of the counting alone).
     */
    constructor({ node = true } = {}) {
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
     * as they stand now, told as how much more.
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
        };

        this.failures = 0;
        this.messages = 0;
        this.commands = 0;
        this.before = { dropped, cpu: cpu ? { user: cpu.user, system: cpu.system } : before.cpu, made: { chunks: made.chunks, rooms: made.rooms } };

        return taken;
    }

    /** No longer measuring the thread's event loop or its collections. */
    stop() {
        this.loop?.stop();
        this.collections?.stop();
    }
}
