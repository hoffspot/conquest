// The worlds the server runs, and their lives (generated/world_server_plan.md §4):
//
//   stored ──(someone enters)──► loading ──(open)──► running ◄──► empty ──(set-aside delay)──► stopping ──► stored
//      └──(worldsAtOnce already going)──► waiting ──(one set aside)──► loading
//
// A stored world costs nothing: no thread, no memory. Entering one starts its thread
// (world-thread.js), which makes it from its seed and carries it on from its save. It's empty
// once nobody's in it (its clock stopped and saved: world-worker.js), and after the server's
// setAsideMinutes empty its thread's ended (saved again first) and it's stored once more. No more
// than worldsAtOnce are going at once (loading, running, empty or stopping): the next waits, in
// the order they asked, until one's set aside. And while anyone's present in any world, the
// machine's kept awake (platform/ keepAwake), if the server's keepAwake setting says so.

import os from "node:os";
import { keepAwake } from "./platform/index.js";
import { WorldThread } from "./world-thread.js";

/** How long a world's held for someone let into it to arrive (ms): it isn't set aside empty meanwhile. */
export const ARRIVAL = 15000;

/** A world's lives, as the management page names them. */
export const LIFE = Object.freeze(["stored", "waiting", "loading", "running", "empty", "stopping"]);

/**
 * How much memory a running world may take (bytes): the plan's budget (§17). One just opened takes
 * about 110 MB resident (its own heap, Recast's, its two baking threads'), and more as its players
 * go about it (test/registry.test.js checks two stay within it).
 */
export const WORLD_MEMORY = 256 * 1024 * 1024;

/** What's kept back from the worlds for the machine's own system and its owner's apps (bytes): the larger of this and a quarter of its memory. */
export const RESERVED_MEMORY = 4 * 2 ** 30;

/**
 * How many worlds the server may run at once without the machine struggling (generated/
 * world_server_plan.md §10), and why: as many as its memory holds, less what's kept back
 * (RESERVED_MEMORY), at the most a world has used here (`largest`; WORLD_MEMORY until one's run),
 * and one fewer than its cores (a world steps on one; the server and the owner want one too); the
 * smaller of the two, one at the least. Returns { most, memory, cpu }: the last two what each
 * allows.
 */
export function recommendation({ memory = os.totalmem(), cores = os.availableParallelism?.() ?? os.cpus().length, largest = 0 } = {}) {
    const usable = Math.max(0, memory - Math.max(RESERVED_MEMORY, memory / 4));
    const byMemory = Math.floor(usable / Math.max(largest, WORLD_MEMORY));
    const byCpu = Math.max(1, cores - 1);

    return { most: Math.max(1, Math.min(byMemory, byCpu)), memory: byMemory, cpu: byCpu };
}

/** How many worlds the server may run at once without the machine struggling (recommendation's most). */
export function recommendedWorlds(machine = {}) {
    return recommendation(machine).most;
}

export class Registry {
    /**
     * @param {object} options
     * @param {object} options.store - The worlds kept (storage/worlds.js WorldStore).
     * @param {object} options.settings - The server's settings (storage/settings.js Settings): worldsAtOnce, setAsideMinutes, keepAwake.
     * @param {function} [options.spawn] - A running world's thread (stored, hooks): world-thread.js WorldThread, but for the tests.
     * @param {function} [options.awake] - The machine kept awake: returns what stops it (platform/ keepAwake, but for the tests).
     * @param {function} [options.onSend] - What a world sends a player's game (world, peer, text).
     * @param {function} [options.onClose] - A player a world's sent out (world, peer, reason).
     * @param {function} [options.onChange] - Told whenever a world's life, or who's in it, changes (world).
     */
    constructor({ store, settings, spawn = (stored, hooks) => new WorldThread(stored, hooks), awake = keepAwake, onSend = () => {}, onClose = () => {}, onChange = () => {} }) {
        Object.assign(this, { store, settings, spawn, awake, onSend, onClose, onChange });

        /** Each world it's had to do with, by id: { id, stored, life, thread, opening, stopping, timer, waiters }. */
        this.entries = new Map();

        /** The worlds waiting for one going to be set aside (their ids, first first). */
        this.queue = [];

        // What keeps the machine awake, while it's kept
        this.holding = null;
    }

    /** The worlds going (a thread each): loading, running, empty or stopping. */
    get going() {
        return [...this.entries.values()].filter((entry) => entry.thread);
    }

    async #entry(id) {
        if (!this.entries.has(id)) {
            const stored = await this.store.open(id);

            if (!this.entries.has(id)) {
                this.entries.set(id, { id, stored, life: "stored", thread: null, opening: null, stopping: null, timer: null, waiters: [], holdUntil: 0 });
            }
        }

        return this.entries.get(id);
    }

    /**
     * A world to play in, going: its thread (world-thread.js), once its world's open. Started if
     * it's stored, or waits its turn (`onWaiting`: told its place in the queue, 1 first) if
     * worldsAtOnce are going. Refused if it can't be opened (reopen.js: NewerDataError,
     * CantCarryOn).
     */
    async enter(id, { onWaiting = () => {} } = {}) {
        const entry = await this.#entry(id);

        clearTimeout(entry.timer);
        entry.timer = null;

        if (entry.life === "stopping") {
            await entry.stopping;
        }

        // (Held for them until they've arrived, or a while)
        const held = (thread) => {
            entry.holdUntil = Date.now() + ARRIVAL;

            return thread;
        };

        if (entry.thread) {
            return entry.opening.then(held);
        }

        if (entry.life === "waiting" || this.going.length >= this.settings.get("worldsAtOnce")) {
            if (!this.queue.includes(id)) {
                this.queue.push(id);
            }

            entry.life = "waiting";
            onWaiting(this.queue.indexOf(id) + 1);
            this.onChange(id);

            return new Promise((resolve, reject) => entry.waiters.push({ resolve, reject })).then(held);
        }

        return this.#start(entry).then(held);
    }

    /** Where a world is in the queue (1 first), or 0 if it isn't waiting. */
    position(id) {
        return this.queue.indexOf(id) + 1;
    }

    // A world's thread started; once it's open, those waiting for it given it
    #start(entry) {
        const { id } = entry;

        entry.life = "loading";
        entry.thread = this.spawn(entry.stored, {
            onSend: (peer, text) => this.onSend(id, peer, text),
            onClose: (peer, reason) => this.onClose(id, peer, reason),
            onState: (state) => this.#state(entry, state),
            onExit: (code, error) => this.#exited(entry, code, error),
        });

        const thread = entry.thread;

        entry.opening = thread.opened.then(
            () => {
                if (entry.thread === thread && entry.life === "loading") {
                    this.#state(entry, thread.state);
                }

                return thread;
            },
            async (error) => {
                if (entry.thread === thread) {
                    entry.thread = null;
                    entry.life = "stored";
                }

                await thread.terminate();
                this.#next();
                this.onChange(id);

                throw error;
            },
        );

        for (const { resolve, reject } of entry.waiters.splice(0)) {
            entry.opening.then(resolve, reject);
        }

        this.onChange(id);

        return entry.opening;
    }

    // How a world says it is: running while anyone's in it, else empty (and set aside after a while); the machine kept awake while anyone's present anywhere
    #state(entry, state) {
        if (!entry.thread || entry.life === "stopping" || !state) {
            return;
        }

        const players = state.players.length;
        const life = players ? "running" : "empty";

        if (life === "running") {
            clearTimeout(entry.timer);
            entry.timer = null;
            entry.holdUntil = 0;
        } else if (!entry.timer) {
            // (Empty for the set-aside delay, and no one let in on their way: set aside; else looked at again then)
            const delay = Math.max(this.settings.get("setAsideMinutes") * 60000, entry.holdUntil - Date.now());

            entry.timer = setTimeout(() => {
                entry.timer = null;

                if (entry.thread && entry.thread.state?.players.length === 0 && Date.now() >= entry.holdUntil) {
                    this.setAside(entry.id);
                } else {
                    this.#state(entry, entry.thread?.state);
                }
            }, delay);
            entry.timer.unref?.();
        }

        if (life !== entry.life) {
            entry.life = life;
            this.onChange(entry.id);
        }

        this.#awake();
    }

    // Kept awake while anyone's present in any world (and the server's settings say so)
    #awake() {
        const present = this.going.some((entry) => entry.thread.state?.present > 0);

        if (present && this.settings.get("keepAwake") && !this.holding) {
            this.holding = this.awake();
        } else if ((!present || !this.settings.get("keepAwake")) && this.holding) {
            this.holding.stop();
            this.holding = null;
        }
    }

    // A world's thread ended: if it wasn't asked to (it failed), stored again, and the journal told
    #exited(entry, code, error) {
        if (entry.life === "stopping" || !entry.thread || !entry.thread.ended) {
            return;
        }

        entry.thread = null;
        entry.life = "stored";
        clearTimeout(entry.timer);
        entry.timer = null;
        entry.stored.reload?.().catch(() => {});
        entry.stored.journal(`Its thread ended unexpectedly (${error?.message ?? `code ${code}`}): stored, from its last save.`).catch(() => {});
        this.#next();
        this.#awake();
        this.onChange(entry.id);
    }

    /** The worlds waiting started, while there's room (worldsAtOnce raised, say). */
    refill() {
        this.#next();
    }

    /**
     * A world forgotten (deleted): set aside first if it's going, and out of the queue. Returns
     * once it's stored.
     */
    async forget(id) {
        await this.setAside(id, "deleted");

        const entry = this.entries.get(id);

        clearTimeout(entry?.timer);
        this.queue = this.queue.filter((each) => each !== id);

        for (const { reject } of entry?.waiters.splice(0) ?? []) {
            reject(new Error(`World ${id} was deleted.`));
        }

        this.entries.delete(id);
        this.#next();
    }

    // The next waiting started, while there's room
    #next() {
        while (this.queue.length && this.going.length < this.settings.get("worldsAtOnce")) {
            this.#start(this.entries.get(this.queue.shift()));
        }
    }

    /**
     * A world set aside (`why`): everyone in it out, saved, its thread ended and its memory given
     * back, and the next waiting started. Returns { ok } (whether its save reached the disk).
     */
    async setAside(id, why = "set aside") {
        const entry = this.entries.get(id);

        if (!entry?.thread) {
            return { ok: true };
        }

        if (entry.life === "stopping") {
            return entry.stopping;
        }

        await entry.opening.catch(() => {});

        if (!entry.thread) {
            return { ok: true };
        }

        clearTimeout(entry.timer);
        entry.timer = null;
        entry.life = "stopping";
        this.onChange(id);
        entry.stopping = entry.thread.stop(why).then(async (done) => {
            await entry.stored.reload?.().catch(() => {});

            return done;
        }).finally(() => {
            entry.thread = null;
            entry.life = "stored";
            this.#next();
            this.#awake();
            this.onChange(id);
        });

        return entry.stopping;
    }

    /** Every world going set aside (the server stopping): each saved. */
    async shutdown(why = "the server stopped") {
        this.queue = [];
        await Promise.all(this.going.map((entry) => this.setAside(entry.id, why)));
    }

    /** A world's life (LIFE), and how it last said it was (or null). */
    lifeOf(id) {
        const entry = this.entries.get(id);

        return { life: entry?.life ?? "stored", state: entry?.thread?.state ?? null, position: this.position(id) };
    }
}
