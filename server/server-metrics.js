// What the world server knows of how it's running, as numbers (generated/
// multiplayer_scaling_plan.md 6A-2): the one registry (metrics.js) every series is in, with what
// each world's thread counts of itself added up as it tells of it (world-metrics.js, a second's
// worth at a time in its `state` message).
//
// A series is labelled by its world (`world`: the world's id), by which thread it's of where a
// thing is measured in both (`thread`: "world", or "supervisor" with no world), by a `kind`
// (which part of a look, which kind of collection) or a `reason`: never by a player, an address
// or a key, which the registry refuses (LABELS).
//
// Times are seconds and sizes bytes, as Prometheus has them. A counter or a histogram carries on
// from where it was when a world's set aside and started again; what's so now of a world (its
// heap, who's in it) is let go of while it's set aside, and all of it when the world's deleted.

import { Metrics } from "./metrics.js";

/** The labels a series may have. */
export const LABELS = Object.freeze(["world", "thread", "kind", "reason"]);

// A time as the series have them (seconds), from ms; and from µs
const seconds = (ms) => ms / 1000;
const micro = (us) => us / 1e6;

export class ServerMetrics {
    constructor() {
        const metrics = new Metrics({ labels: LABELS });

        /** The registry (metrics.js): written out for whoever scrapes it. */
        this.registry = metrics;

        /** A world's own series, labelled by its world. */
        this.world = {
            step: metrics.histogram("pellagos_world_step_seconds", "How long each of a world's steps took (a step is 50 ms of its time: one over that is late).", ["world"]),
            tick: metrics.histogram("pellagos_world_tick_seconds", "How long each look at a world took, all of it: its steps, what's sent of them, a save begun, what's made ahead.", ["world"]),
            part: metrics.histogram("pellagos_world_tick_part_seconds", "How long each part of a look at a world took: its steps with what's sent of them (advance), and what's made ahead (ahead).", ["world", "kind"]),
            save: metrics.histogram("pellagos_world_save_seconds", "How long each of a world's saves took, from asked to on the disk.", ["world"]),
            saveFailures: metrics.counter("pellagos_world_save_failures_total", "A world's saves that didn't reach the disk.", ["world"]),
            messages: metrics.counter("pellagos_world_messages_total", "What a world's players' games have said to it.", ["world"]),
            commands: metrics.counter("pellagos_world_commands_total", "The commands a world's players' games have given it.", ["world"]),
            dropped: metrics.counter("pellagos_world_dropped_seconds_total", "The time a world was given and let go, fallen too far behind its clock.", ["world"]),
            cpu: metrics.counter("pellagos_world_cpu_seconds_total", "The processor time a world's thread has had, user and system.", ["world", "kind"]),
            made: metrics.counter("pellagos_world_made_ahead_total", "What a world has made ahead between its steps: chunks of ground, and tiles of buildings' insides (rooms).", ["world", "kind"]),
            actors: metrics.gauge("pellagos_world_actors", "How many are in a world's battle.", ["world"]),
            players: metrics.gauge("pellagos_world_players", "How many players are in a world.", ["world"]),
            present: metrics.gauge("pellagos_world_present", "How many of a world's players are present: linked and loaded.", ["world"]),
            running: metrics.gauge("pellagos_world_running", "Whether a world's clock runs (1) or is stopped (0).", ["world"]),
        };

        /** What's measured of a thread, a world's or the supervisor's. */
        this.thread = {
            heap: metrics.gauge("pellagos_heap_bytes", "A thread's JavaScript heap in use.", ["thread", "world"]),
            external: metrics.gauge("pellagos_external_bytes", "A thread's memory outside its heap that JavaScript holds (buffers, WebAssembly's).", ["thread", "world"]),
            loopMean: metrics.gauge("pellagos_event_loop_delay_mean_seconds", "How late a thread's event loop ran, lately: the mean.", ["thread", "world"]),
            loopP99: metrics.gauge("pellagos_event_loop_delay_p99_seconds", "How late a thread's event loop ran, lately: the 99th percentile.", ["thread", "world"]),
            loopMax: metrics.gauge("pellagos_event_loop_delay_max_seconds", "How late a thread's event loop ran, lately: the worst.", ["thread", "world"]),
            gc: metrics.counter("pellagos_gc_total", "A thread's garbage collections, by kind (minor, major, incremental, weak).", ["thread", "world", "kind"]),
            gcTime: metrics.counter("pellagos_gc_seconds_total", "The time a thread's garbage collections took, by kind.", ["thread", "world", "kind"]),
        };
    }

    // What's measured of a thread now, set: its memory ({ heap, external }, bytes) and how late its loop ran ({ mean, p99, max }, ms), where there's either
    threadIs(labels, { memory = null, loop = null, gc = {} } = {}) {
        const { thread } = this;

        if (memory) {
            thread.heap.with(labels).set(memory.heap);
            thread.external.with(labels).set(memory.external);
        }

        if (loop) {
            thread.loopMean.with(labels).set(seconds(loop.mean));
            thread.loopP99.with(labels).set(seconds(loop.p99));
            thread.loopMax.with(labels).set(seconds(loop.max));
        }

        for (const [kind, { count, ms }] of Object.entries(gc)) {
            thread.gc.with({ ...labels, kind }).inc(count);
            thread.gcTime.with({ ...labels, kind }).inc(seconds(ms));
        }
    }

    /** How a world says it is (world-worker.js report): what's so now set, and what it's counted since it last said added up. */
    heard(id, state) {
        const { world } = this;
        const labels = { world: id };
        const counted = state?.metrics;

        if (!state) {
            return;
        }

        world.actors.with(labels).set(state.actors ?? 0);
        world.players.with(labels).set(state.players?.filter((one) => one.id).length ?? 0);
        world.present.with(labels).set(state.present ?? 0);
        world.running.with(labels).set(state.running ? 1 : 0);
        this.threadIs({ thread: "world", world: id }, { memory: state.memory, loop: counted?.loop, gc: counted?.gc });

        if (!counted) {
            return;
        }

        const times = (histogram, more, taken) => (taken ? histogram.with({ ...labels, ...more }).merge({ counts: taken.counts, sum: seconds(taken.sum) }) : null);

        times(world.step, {}, counted.steps);
        times(world.tick, {}, counted.ticks);
        times(world.part, { kind: "advance" }, counted.advance);
        times(world.part, { kind: "ahead" }, counted.ahead);
        times(world.save, {}, counted.saves);
        world.saveFailures.with(labels).inc(counted.failures);
        world.messages.with(labels).inc(counted.messages);
        world.commands.with(labels).inc(counted.commands);
        world.dropped.with(labels).inc(seconds(Math.max(0, counted.dropped)));
        world.made.with({ ...labels, kind: "chunks" }).inc(Math.max(0, counted.made.chunks));
        world.made.with({ ...labels, kind: "rooms" }).inc(Math.max(0, counted.made.rooms));

        if (counted.cpu) {
            world.cpu.with({ ...labels, kind: "user" }).inc(micro(Math.max(0, counted.cpu.user)));
            world.cpu.with({ ...labels, kind: "system" }).inc(micro(Math.max(0, counted.cpu.system)));
        }
    }

    /** A world set aside (its thread ended): what was so of it while it ran let go of; what it counted kept. */
    setAside(id) {
        for (const gauge of [this.world.actors, this.world.players, this.world.present, this.world.running]) {
            gauge.forget({ world: id });
        }

        for (const gauge of [this.thread.heap, this.thread.external, this.thread.loopMean, this.thread.loopP99, this.thread.loopMax]) {
            gauge.forget({ thread: "world", world: id });
        }
    }

    /** A world deleted: every series of it let go of. */
    forget(id) {
        this.registry.forget({ world: id });
    }
}
