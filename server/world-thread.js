// The supervisor's side of a running world (generated/world_server_plan.md §2): its thread
// (world-worker.js, one per world, so a crash or a stall in one doesn't touch the others, and
// ending it gives back all its memory), what's said to it and what it says back.

import { Worker } from "node:worker_threads";

export class WorldThread {
    #asked = new Map();
    #asks = 0;
    #opening;

    /**
     * @param {object} stored - The world (storage/worlds.js StoredWorld).
     * @param {object} [hooks]
     * @param {function} [hooks.onSend] - What it sends a player's game (peer, text).
     * @param {function} [hooks.onClose] - A player it's sent out (peer, reason).
     * @param {function} [hooks.onState] - How it is, as it reports it (state).
     * @param {function} [hooks.onExit] - Its thread ended (code, error: if it failed).
     */
    constructor(stored, { onSend = () => {}, onClose = () => {}, onState = () => {}, onExit = () => {} } = {}) {
        this.stored = stored;
        this.id = stored.id;
        Object.assign(this, { onSend, onClose, onState, onExit });

        /** How it last said it was (world-worker.js report), and whether its thread's ended. */
        this.state = null;
        this.ended = false;
        this.error = null;

        /** Once it's open: { from, forwarded, ms, worldTime }; refused (failed) if it can't be. */
        this.opened = new Promise((resolve, reject) => {
            this.#opening = { resolve, reject };
        });
        this.opened.catch(() => {});

        this.thread = new Worker(new URL("./world-worker.js", import.meta.url), { workerData: { folder: stored.folder } });
        this.thread.on("message", (message) => this.#heard(message));
        this.thread.on("error", (error) => {
            this.error = error;
        });
        this.thread.on("exit", (code) => {
            this.ended = true;
            this.#opening.reject(this.error ?? new Error(`World ${this.id}'s thread ended (${code}) before it opened.`));

            for (const resolve of this.#asked.values()) {
                resolve({ ok: false });
            }

            this.#asked.clear();
            this.onExit(code, this.error);
        });
    }

    #heard(message) {
        switch (message.type) {
            case "opened":
                this.#opening.resolve(message);
                break;
            case "failed": {
                const error = new Error(message.message);

                error.name = message.name;
                this.error = error;
                this.#opening.reject(error);
                break;
            }
            case "send":
                this.onSend(message.peer, message.text);
                break;
            case "close":
                this.onClose(message.peer, message.reason);
                break;
            case "state":
                this.state = message;
                this.onState(message);
                break;
            case "saved":
            case "stopped":
                this.#asked.get(message.id)?.({ ok: message.ok });
                this.#asked.delete(message.id);
                break;
            default:
                break;
        }
    }

    #post(message) {
        if (!this.ended) {
            this.thread.postMessage(message);
        }
    }

    // Something asked of it, answered once it's done: { ok }
    #ask(type, details) {
        if (this.ended) {
            return Promise.resolve({ ok: false });
        }

        const id = ++this.#asks;

        return new Promise((resolve) => {
            this.#asked.set(id, resolve);
            this.#post({ type, id, ...details });
        });
    }

    /** Someone come in by a key (their player's id, and their part). */
    enter(peer, { player, role }) {
        this.#post({ type: "enter", peer, player, role });
    }

    /** What their game said. */
    data(peer, text) {
        this.#post({ type: "data", peer, text });
    }

    /** Their link dropped (their place kept), or came back. */
    drop(peer) {
        this.#post({ type: "drop", peer });
    }

    back(peer) {
        this.#post({ type: "back", peer });
    }

    /** They've gone. */
    leave(peer) {
        this.#post({ type: "leave", peer });
    }

    /**
     * What the world is changed (its name, description and settings: storage/worlds.js
     * WORLD_SETTINGS), so its thread's copy of world.json, which it writes as it saves, has them
     * too, and its settings are followed at once.
     */
    meta(changes) {
        this.#post({ type: "meta", changes });
    }

    /** The world saved, now (`why`). Returns { ok } once it's on the disk. */
    save(why) {
        return this.#ask("save", { why });
    }

    /** The world saved, then backed up (`why`: storage/worlds.js StoredWorld.backUp). Returns { ok } once both are on the disk. */
    backUp(why) {
        return this.#ask("backup", { why });
    }

    /** Everyone out, the world saved, and its thread ended. Returns { ok } (whether the save reached the disk). */
    async stop(why = "set aside") {
        const done = await this.#ask("stop", { why });

        await this.thread.terminate();

        return done;
    }

    /** Its thread ended at once, saved or not (a world that wouldn't open, or the server going down hard). */
    async terminate() {
        await this.thread.terminate();
    }
}
