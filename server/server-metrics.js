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
// The supervisor's own are here too (6A-3): the play socket's sockets, places, backlog and
// traffic by world, read from where the socket keeps them when the registry's asked (play.js);
// who was let in and what was refused, by why, as the access hooks tell of them; its worlds by
// how they are; its memory; and its own event loop and collections, sampled every SAMPLE_EVERY
// (`start`). All of it is written out at /metrics on the management page's own listener, on the
// computer alone (admin.js).
//
// Times are seconds and sizes bytes, as Prometheus has them. A counter or a histogram carries on
// from where it was when a world's set aside and started again; what's so now of a world (its
// heap, who's in it) is let go of while it's set aside, and all of it when the world's deleted.

import { performance } from "node:perf_hooks";
import { Metrics } from "./metrics.js";
import { LIFE } from "./registry.js";
import { Collections, LoopDelay } from "./world-metrics.js";

/** The labels a series may have. */
export const LABELS = Object.freeze(["world", "thread", "kind", "reason"]);

/** How often the supervisor's own event loop and collections are sampled (ms). */
export const SAMPLE_EVERY = 10000;

// The supervisor's own thread, as its series are labelled
const SUPERVISOR = Object.freeze({ thread: "supervisor", world: "" });

// A reason as a label carries it: one of the server's own short codes ("full", "bad-request"), or "other"
const reasonOf = (why) => (typeof why === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(why) ? why : "other");

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

        /** The supervisor's own: the play socket, who's let in and refused, its worlds, its memory and its event loop. */
        this.server = {
            sockets: metrics.gauge("pellagos_play_sockets", "Play sockets open: players' games linked, in a world or on their way into one."),
            places: metrics.gauge("pellagos_play_places", "Places held in worlds: players in them, linked or kept a while for a link that dropped."),
            backlog: metrics.gauge("pellagos_play_backlog_bytes", "What waits to go to players' games slow to take it: all of it."),
            backlogMax: metrics.gauge("pellagos_play_backlog_max_bytes", "What waits to go to players' games slow to take it: the most for one game."),
            joins: metrics.counter("pellagos_joins_total", "Players let into a world.", ["world"]),
            refusals: metrics.counter("pellagos_refusals_total", "What the server refused, by why (a wrong key, too many tries, a bad request).", ["reason"]),
            closed: metrics.counter("pellagos_play_closed_total", "Players' games sent out of a world or refused at the play socket, by why (afk, kicked, full, server-stopping).", ["reason"]),
            sent: metrics.counter("pellagos_play_sent_bytes_total", "What a world has sent its players' games, as said (before it's compressed).", ["world"]),
            wire: metrics.counter("pellagos_play_sent_wire_bytes_total", "What a world has sent its players' games, as it went on the wire (compressed, where it is).", ["world"]),
            sentMessages: metrics.counter("pellagos_play_sent_messages_total", "The messages a world has sent its players' games.", ["world"]),
            received: metrics.counter("pellagos_play_received_bytes_total", "What a world's players' games have sent it.", ["world"]),
            worlds: metrics.gauge("pellagos_worlds", "The server's worlds, by how they are (stored, waiting, loading, running, empty, stopping).", ["kind"]),
            utilization: metrics.gauge("pellagos_event_loop_utilization", "The share of its time the supervisor's event loop was busy, lately (0 to 1)."),
            rss: metrics.gauge("pellagos_rss_bytes", "The whole server's memory resident, every world's thread with it."),
            started: metrics.gauge("pellagos_start_time_seconds", "When the server started (seconds since 1970)."),
        };

        this.server.started.set(Math.round(Date.now() / 1000));

        // The worlds it has series for; and the supervisor's own sampling, once it's started
        this.known = new Set();
        this.sampling = null;

        /** Told each time the supervisor's own has been sampled (the charts' history takes its points then: history.js). */
        this.onSample = null;
    }

    /**
     * What's read only when the registry's asked, read from `server` then (world-server.js
     * WorldServer: its play socket, its registry, its worlds), and the series of worlds it no
     * longer has let go of.
     */
    watch(server) {
        this.registry.onCollect(() => this.#collect(server));
    }

    #collect(server) {
        const { play, registry, worlds } = server;
        const counted = this.server;
        let backlog = 0;
        let most = 0;

        for (const socket of play?.sockets ?? []) {
            const waiting = socket.socket?.writableLength ?? 0;

            backlog += waiting;
            most = Math.max(most, waiting);
        }

        counted.sockets.set(play?.sockets.size ?? 0);
        counted.places.set(play?.places.size ?? 0);
        counted.backlog.set(backlog);
        counted.backlogMax.set(most);

        for (const [reason, count] of play?.closed ?? []) {
            counted.closed.with({ reason: reasonOf(reason) }).rise(count);
        }

        for (const [world, traffic] of play?.traffic ?? []) {
            if (worlds.has(world)) {
                this.known.add(world);
                counted.sent.with({ world }).rise(traffic.bytes);
                counted.wire.with({ world }).rise(traffic.wire);
                counted.sentMessages.with({ world }).rise(traffic.messages);
                counted.received.with({ world }).rise(traffic.received);
            }
        }

        const lives = Object.fromEntries(LIFE.map((life) => [life, 0]));

        for (const id of worlds.keys()) {
            const { life } = registry.lifeOf(id);

            lives[life] = (lives[life] ?? 0) + 1;
        }

        for (const [kind, count] of Object.entries(lives)) {
            counted.worlds.with({ kind }).set(count);
        }

        for (const id of [...this.known]) {
            if (!worlds.has(id)) {
                this.forget(id);
            }
        }

        const memory = process.memoryUsage();

        counted.rss.set(memory.rss);
        this.threadIs(SUPERVISOR, { memory: { heap: memory.heapUsed, external: memory.external } });
    }

    /** What the access hooks tell of (access/policy.js on): a player let into a world counted, and what's refused, by why. Nothing else of it's kept: no player, key or address. */
    event(event, detail = {}) {
        if (event === "entered" && detail.world) {
            this.known.add(detail.world);
            this.server.joins.with({ world: detail.world }).inc();
        } else if (event === "refused") {
            this.server.refusals.with({ reason: reasonOf(detail.why) }).inc();
        }
    }

    /** The supervisor's own event loop (how late it ran, how busy it was) and collections sampled from now on, every `every` ms. */
    start(every = SAMPLE_EVERY) {
        if (this.sampling) {
            return;
        }

        const sampling = { loop: new LoopDelay(), collections: new Collections(), busy: performance.eventLoopUtilization(), timer: null };

        sampling.timer = setInterval(() => this.sample(), every);
        sampling.timer.unref?.();
        this.sampling = sampling;
    }

    /** The supervisor's own, as it's been since it was last sampled, set (start's timer does it; a test may). */
    sample() {
        const { sampling } = this;

        if (!sampling) {
            return;
        }

        const busy = performance.eventLoopUtilization();

        this.server.utilization.set(performance.eventLoopUtilization(busy, sampling.busy).utilization);
        sampling.busy = busy;
        this.threadIs(SUPERVISOR, { loop: sampling.loop.take(), gc: sampling.collections.take() });
        this.onSample?.();
    }

    /** No longer sampling the supervisor's own. */
    stop() {
        clearInterval(this.sampling?.timer);
        this.sampling?.loop.stop();
        this.sampling?.collections.stop();
        this.sampling = null;
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

        this.known.add(id);
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

    /**
     * A world's histograms as they stand: { step, tick, advance, ahead, save }, each { bounds
     * (seconds), counts (a bucket each, the last over every bound), count, sum (seconds) }. For a
     * report of a run (scripts/server-soak.js), which reads what /metrics would say.
     */
    histogramsOf(id) {
        const { step, tick, part, save } = this.world;
        const plain = (metric, labels) => {
            const { bounds, counts, count, sum } = metric.with(labels);

            return { bounds: [...bounds], counts: [...counts], count, sum };
        };

        return { step: plain(step, { world: id }), tick: plain(tick, { world: id }), advance: plain(part, { world: id, kind: "advance" }), ahead: plain(part, { world: id, kind: "ahead" }), save: plain(save, { world: id }) };
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
        this.known.delete(id);
        this.registry.forget({ world: id });
    }
}
