// Web Workers for the world server (generated/world_server_plan.md §3.1). Node has none, but the
// game's own workers are written for them: world/navworker.js baking the navigation's tiles and
// world/layout-worker.js laying settlements out, each made by `new Worker(url, { type:
// "module" })` (world/navbaker.js, world/layouts.js) and talked to by postMessage and onmessage.
// So the server gives Node a Worker that does the same on its own threads (node:worker_threads):
// each runs worker-boot.js, which gives the worker's module the `self` it expects, then loads it.
// The same code then bakes ahead off the world's thread on the server as in the browser.

import { Worker as Thread } from "node:worker_threads";

/** A Web Worker (as far as the game's use them) on one of Node's threads. */
export class ThreadWorker {
    /** @param {URL|string} url - The worker's module (an ES module: `type: "module"`, as all the game's are). */
    constructor(url) {
        /** Told what the worker sends ({ data }), and if it fails (the error). */
        this.onmessage = null;
        this.onerror = null;

        this.thread = new Thread(new URL("./worker-boot.js", import.meta.url), { workerData: { url: String(url) } });
        this.thread.on("message", (data) => this.onmessage?.({ data }));
        this.thread.on("error", (error) => this.onerror?.(error));

        // (One left running never keeps the server from stopping)
        this.thread.unref();
    }

    /** Send it something (what's in `transfer` handed over, not copied). */
    postMessage(data, transfer = []) {
        this.thread.postMessage(data, transfer);
    }

    /** Stop it. */
    terminate() {
        this.thread.terminate();
    }
}

/** Give Node the Worker the game's code makes, if it hasn't one. */
export function installWorkers() {
    globalThis.Worker ??= ThreadWorker;
}
