// The downloader: fetches the catalog's models (assets.js) in the background, while the game's
// played, without making it play worse (generated/asset_streaming_plan.md, section 3).
//
// One file at a time, the most wanted first (now: wanted on screen; soon: predicted; later: worth
// having), a part at a time (Range requests), the parts spaced out to keep to a rate. A file more
// wanted than the one being fetched takes over at the next part; the one stopped carries on later
// from where it got to. A server that doesn't serve parts sends the whole file, which is read
// slowly instead (a reader paused between reads holds the sender back).
//
// The rate is a controller's (Controller): playing together, a download queueing in front of the
// game's messages at the player's link shows as the round trip to the host (or the relay) growing
// over the least it's been lately. It halves the rate as soon as it does, before anything's lost
// (as LEDBAT does, RFC 6817), and adds to it while the round trip stays low; never over a share of
// what the link has carried. Nothing's fetched at all at quiet times (hold): while the game starts,
// while a player joins, while the link to the others comes back.
//
// A file's checked against its hash once it's all here, then kept where the service worker keeps
// the catalog's (sw.js), and handed over (a Blob). A file already kept isn't fetched.
//
// No Three.js here.

import { hashed } from "./catalog.js";

/** How wanted a file is: now (its stand-in's showing), soon (predicted), later (worth having). */
export const PRIORITY = Object.freeze({ now: 0, soon: 1, later: 2 });

/**
 * The controller's numbers (generated/asset_streaming_plan.md, 3.3), first guesses to be tuned by
 * measurement:
 * - `target`: the queueing delay (ms: the round trip over the least lately) to keep under;
 * - `recent`: how many of the last round trips the round trip now is the least of (one late
 *   answer is as likely the page busy as the link queueing: LEDBAT's filter);
 * - `window`: how far back the least round trip's taken from (ms);
 * - `step`: what's added to the rate while queueing's under half the target (bytes/s, a round
 *   trip heard);
 * - `least`: the slowest it goes (bytes/s);
 * - `start`: the rate to start at, playing together and alone (bytes/s);
 * - `share`: the most of what the link's carried that it takes, together and alone;
 * - `part`: how big each part is: what the link carries in `time` ms, within `least` and `most`
 *   bytes (playing alone, `most`);
 * - `probe`: how often to ask for a round trip to be measured while downloading together (ms).
 */
export const PACING = Object.freeze({
    target: 30,
    recent: 3,
    window: 60000,
    step: 32 * 1024,
    least: 16 * 1024,
    start: Object.freeze({ together: 128 * 1024, alone: 1024 * 1024 }),
    share: Object.freeze({ together: 0.5, alone: 0.8 }),
    part: Object.freeze({ least: 32 * 1024, most: 256 * 1024, time: 60 }),
    probe: 2000,
});

// How often a quiet time, or a wait, is looked at again (ms); how long a file dropped half
// downloaded keeps its parts, in case it's wanted again (ms); how many times a file's tried before
// it's given up on, and how long to wait after the first try fails (ms, doubling each time)
const LOOK_EVERY = 250;
const PARKED = 60000;
const TRIES = 3;
const RETRY = 2000;

// Where the service worker keeps files by hash (sw.js): the catalog's, and the manifest's
const ASSETS_CACHE = "pellagos-assets-v2";
const BOOT_CACHE = "pellagos-boot-v2";

const TYPES = { glb: "model/gltf-binary", gltf: "model/gltf+json", bin: "application/octet-stream", png: "image/png", jpg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2" };

/**
 * The rate to download at (bytes/s), and when each part may go. Given the time (ms) with every
 * call, so it's the same for the same calls.
 */
export class Controller {
    constructor({ together = false } = {}) {
        this.together = together;
        this.rate = PACING.start[together ? "together" : "alone"];

        /** The round trips heard over the last `window` ([at, ms]); the least of them; and the last over it (ms). */
        this.trips = [];
        this.base = null;
        this.queueing = null;

        /** How fast the parts have come (bytes/s, smoothed; null till one has). */
        this.throughput = null;

        /** When the next part may go (ms). */
        this.next = -Infinity;
    }

    /** Playing together, or alone again. Starting to play together, no faster than together's start. */
    setTogether(together) {
        if (together === this.together) {
            return;
        }

        this.together = together;
        this.rate = together ? Math.min(this.rate, PACING.start.together) : Math.max(this.rate, PACING.start.alone);
        this.#cap();
    }

    /**
     * A round trip heard: `rtt` ms, at `at`. `strained`: the joined game's playout says the host's
     * messages are coming unevenly (it's keeping more steps in hand than it was), which counts as
     * queueing over the target.
     */
    sample({ at, rtt, strained = false }) {
        this.trips.push([at, rtt]);

        while (at - this.trips[0][0] > PACING.window) {
            this.trips.shift();
        }

        this.base = Math.min(...this.trips.map(([, each]) => each));
        this.queueing = Math.min(...this.trips.slice(-PACING.recent).map(([, each]) => each)) - this.base;

        if (this.queueing > PACING.target || strained) {
            // (Halved, and nothing more sent till what's queued has had a round trip to drain)
            this.rate /= 2;
            this.next = Math.max(this.next, at + rtt);
        } else if (this.queueing < PACING.target / 2) {
            this.rate += PACING.step;
        }

        this.#cap();
    }

    /** A part came: `bytes` in `ms`, from asking to its last byte (nothing for one from a cache, at once). */
    delivered({ bytes, ms }) {
        if (!(ms > 0) || !(bytes > 0)) {
            return;
        }

        const speed = bytes / (ms / 1000);

        this.throughput = this.throughput === null ? speed : this.throughput + (speed - this.throughput) / 4;
        this.#cap();
    }

    // Never over its share of what the link's carried, nor under the least
    #cap() {
        if (this.throughput !== null) {
            this.rate = Math.min(this.rate, this.throughput * PACING.share[this.together ? "together" : "alone"]);
        }

        this.rate = Math.max(PACING.least, this.rate);
    }

    /** How big the next part is (bytes). */
    get partSize() {
        const { least, most, time } = PACING.part;

        if (!this.together) {
            return most;
        }

        return this.throughput === null ? least : Math.round(Math.max(least, Math.min(most, (this.throughput * time) / 1000)));
    }

    /** How long until the next part may go, at `at` (ms; 0 if it may now). */
    wait(at) {
        return Math.max(0, this.next - at);
    }

    /** A part of `bytes` gone at `at`: the next spaced after it, to keep to the rate. */
    sent(at, bytes) {
        this.next = Math.max(this.next, at) + (bytes / this.rate) * 1000;
    }
}

/**
 * The downloader. Every option is the browser's own by default (they're given in the tests).
 *
 * @param {object} [options]
 * @param {string} [options.base] - What the catalog's paths are relative to (the page).
 * @param {Function} [options.fetch]
 * @param {CacheStorage} [options.caches] - Where files are kept (none: nothing's kept).
 * @param {Function} [options.now] - The time (ms).
 * @param {Function} [options.sleep] - Waits so many ms.
 * @param {Function} [options.digest] - SHA-256 of bytes (an ArrayBuffer); null where the browser
 *     can't (a page not on https or localhost), when files are handed over unchecked, and not kept.
 * @param {object} [options.connection] - navigator.connection, where the browser has it.
 */
export class Fetcher {
    constructor({
        base = document.baseURI,
        fetch = (...args) => globalThis.fetch(...args),
        caches = globalThis.caches,
        now = () => performance.now(),
        sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        digest = globalThis.crypto?.subtle ? (bytes) => crypto.subtle.digest("SHA-256", bytes) : null,
        connection = globalThis.navigator?.connection,
    } = {}) {
        Object.assign(this, { base, fetch, caches, now, sleep, digest, connection });
        this.controller = new Controller();

        /** Asks for a round trip to be measured, now and then while downloading together (heard back by measure). */
        this.probe = () => {};

        /** What's been fetched and given up on (files), and the bytes fetched. */
        this.done = 0;
        this.failed = 0;
        this.fetched = 0;

        /** The file being fetched (its entry in the queue), or null. */
        this.current = null;

        this.entries = new Map();
        this.queue = [];
        this.parked = new Map();
        this.holds = new Map();
        this.running = false;
        this.order = 0;
        this.probedAt = -Infinity;
    }

    /** Playing together (the controller's rates for it), or alone. */
    get together() {
        return this.controller.together;
    }

    set together(together) {
        this.controller.setTogether(Boolean(together));
    }

    /** Whether to fetch only what's wanted now: the player's asked to save data, or the link's slow (2G). */
    get thrifty() {
        return Boolean(this.connection?.saveData) || /(^|-)2g$/.test(this.connection?.effectiveType ?? "");
    }

    /**
     * Fetch a file in the catalog ({ path, hash, bytes }), as wanted as `priority` (PRIORITY's
     * names). Resolves with it (a Blob), from what's kept if it is; or with null if it's not to be
     * fetched (thrifty, and not wanted now) or no longer wanted (dropped). Rejects if it can't be
     * had: missing, or not the file its hash says.
     */
    want({ path, hash, bytes }, priority = "soon") {
        const rank = PRIORITY[priority] ?? PRIORITY.soon;
        const url = new URL(hashed(path, hash), this.base).href;
        const known = this.entries.get(url);

        if (known) {
            known.priority = Math.min(known.priority, rank);

            return known.promise;
        }

        if (this.thrifty && rank > PRIORITY.now) {
            return Promise.resolve(null);
        }

        this.#unpark();

        const entry = this.parked.get(url) ?? { url, path, hash, bytes, parts: [], received: 0, tries: 0, retryAt: -Infinity };

        this.parked.delete(url);
        Object.assign(entry, { priority: rank, order: this.order++ });
        entry.promise = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
        this.entries.set(url, entry);
        this.#start(entry);

        return entry.promise;
    }

    /** No longer wanted: out of the queue (what's come of it kept a while, in case it's wanted again), heard of as null. */
    drop({ path, hash }) {
        const entry = this.entries.get(new URL(hashed(path, hash), this.base).href);

        if (!entry) {
            return;
        }

        this.#settle(entry, null);

        if (entry.received > 0) {
            entry.parkedAt = this.now();
            this.parked.set(entry.url, entry);
        }
    }

    /**
     * Fetch nothing for a while (`reason` names it, to be released): for `for` ms, and then until
     * `until()` says (if given), but no longer than `most` ms whatever it says; with neither `for`
     * nor `until`, until released.
     */
    hold(reason, { for: ms, until = null, most = Infinity } = {}) {
        this.holds.set(reason, { till: this.now() + (ms ?? (until ? 0 : Infinity)), until, cap: this.now() + most });
    }

    release(reason) {
        this.holds.delete(reason);
    }

    /** Why nothing's being fetched just now (the holds in force). */
    get quiet() {
        const now = this.now();
        const quiet = [];

        for (const [reason, { till, until, cap }] of this.holds) {
            if (now < till || (until && now < cap && !until())) {
                quiet.push(reason);
            } else {
                this.holds.delete(reason);
            }
        }

        return quiet;
    }

    /** A round trip heard (ms), and whether the joined game's playout's strained (Controller.sample). */
    measure(rtt, { strained = false } = {}) {
        if (Number.isFinite(rtt)) {
            this.controller.sample({ at: this.now(), rtt, strained });
        }
    }

    /** How it's going, for the debug overlay. */
    get status() {
        const { rate, throughput, base, queueing, together } = this.controller;

        const current = this.current && { path: this.current.path, received: this.current.received, bytes: this.current.bytes };

        return { rate, throughput, base, queueing, together, current, queued: this.queue.length, quiet: this.quiet, thrifty: this.thrifty, done: this.done, failed: this.failed, fetched: this.fetched };
    }

    // From what's kept, if it is; else into the queue
    async #start(entry) {
        const kept = await this.#kept(entry.url);

        if (this.entries.get(entry.url) !== entry) {
            return;
        }

        if (kept) {
            this.done++;
            this.#settle(entry, kept);

            return;
        }

        this.queue.push(entry);
        this.#run();
    }

    async #kept(url) {
        try {
            for (const name of [ASSETS_CACHE, BOOT_CACHE]) {
                const response = await (await this.caches?.open(name))?.match(url);

                if (response) {
                    return await response.blob();
                }
            }
        } catch {
            // (Nowhere to keep things: private browsing, say)
        }

        return null;
    }

    // Heard of: resolved (with a Blob or null) or rejected (an Error), and out of the queue
    #settle(entry, result) {
        if (this.entries.get(entry.url) === entry) {
            this.entries.delete(entry.url);
        }

        this.queue = this.queue.filter((each) => each !== entry);

        if (result instanceof Error) {
            entry.reject(result);
        } else {
            entry.resolve(result);
        }
    }

    #unpark() {
        for (const [url, entry] of this.parked) {
            if (this.now() - entry.parkedAt > PARKED) {
                this.parked.delete(url);
            }
        }
    }

    // The most wanted that may be tried now (then the longest queued)
    #pick() {
        const now = this.now();

        return this.queue.filter((entry) => entry.retryAt <= now).sort((a, b) => a.priority - b.priority || a.order - b.order)[0] ?? null;
    }

    async #run() {
        if (this.running) {
            return;
        }

        this.running = true;

        try {
            while (this.queue.length) {
                if (this.together && this.now() - this.probedAt >= PACING.probe) {
                    this.probedAt = this.now();

                    try {
                        this.probe();
                    } catch {
                        // (No round trip to be had: the controller goes by what it has)
                    }
                }

                const entry = this.#pick();
                const wait = this.controller.wait(this.now());

                if (!entry || this.quiet.length || wait > 0) {
                    await this.sleep(entry && !this.quiet.length ? Math.min(wait, LOOK_EVERY) : LOOK_EVERY);
                    continue;
                }

                this.current = entry;

                try {
                    await this.#part(entry);

                    if (this.entries.get(entry.url) === entry && entry.received >= entry.bytes) {
                        await this.#finish(entry);
                    }
                } catch (error) {
                    this.failed++;
                    this.#settle(entry, error instanceof Error ? error : new Error(String(error)));
                }
            }
        } finally {
            this.running = false;
            this.current = null;
        }
    }

    // The next part of a file (or, from a server that doesn't serve parts, the whole of it)
    async #part(entry) {
        const size = Math.min(this.controller.partSize, entry.bytes - entry.received);
        const from = entry.received;
        const asked = this.now();
        let response;

        this.controller.sent(asked, size);

        try {
            response = await this.fetch(entry.url, { headers: { Range: `bytes=${from}-${from + size - 1}` }, priority: "low" });

            if (response.status === 206) {
                const range = /^bytes (\d+)-\d+\/\d+$/.exec(response.headers.get("Content-Range") ?? "");
                const bytes = new Uint8Array(await response.arrayBuffer());

                if (!range || Number(range[1]) !== from || !bytes.length) {
                    throw new Error(`${entry.path}: not the part asked for`);
                }

                entry.parts.push(bytes);
                entry.received += bytes.length;
                this.fetched += bytes.length;
                this.controller.delivered({ bytes: bytes.length, ms: this.now() - asked });
            } else if (response.ok) {
                await this.#whole(entry, response);
            } else {
                this.failed++;
                this.#settle(entry, new Error(`Couldn't download ${entry.path} (${response.status})`));
            }
        } catch (error) {
            // (Offline, or cut off: tried again a little later, a few times)
            entry.tries++;

            if (entry.tries >= TRIES) {
                this.failed++;
                this.#settle(entry, error instanceof Error ? error : new Error(String(error)));
            } else {
                entry.retryAt = this.now() + RETRY * 2 ** (entry.tries - 1);
            }
        }
    }

    // The whole file at once: read slowly, keeping to the rate, and not at all at quiet times
    async #whole(entry, response) {
        const reader = response.body.getReader();

        entry.parts = [];
        entry.received = 0;

        for (;;) {
            while (this.quiet.length || this.controller.wait(this.now()) > 0) {
                await this.sleep(this.quiet.length ? LOOK_EVERY : Math.min(this.controller.wait(this.now()), LOOK_EVERY));
            }

            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            entry.parts.push(value);
            entry.received += value.length;
            this.fetched += value.length;
            this.controller.sent(this.now(), value.length);
        }
    }

    // All here: checked against its hash, kept, handed over
    async #finish(entry) {
        const bytes = new Uint8Array(entry.received);
        let at = 0;

        for (const part of entry.parts) {
            bytes.set(part, at);
            at += part.length;
        }

        const digest = this.digest && new Uint8Array(await this.digest(bytes.buffer));
        const hash = digest && [...digest.subarray(0, 5)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

        if (bytes.length !== entry.bytes || (digest && hash !== entry.hash)) {
            this.failed++;
            this.#settle(entry, new Error(`${entry.path} isn't the file its hash says: changed on the server`));

            return;
        }

        const type = TYPES[entry.path.split(".").pop()] ?? "application/octet-stream";

        try {
            await (digest && (await this.caches?.open(ASSETS_CACHE)))?.put(entry.url, new Response(bytes, { headers: { "Content-Type": type, "Content-Length": String(bytes.length) } }));
        } catch {
            // (Not kept: no room, or nowhere to keep it. Handed over all the same)
        }

        this.done++;
        this.#settle(entry, new Blob([bytes], { type }));
    }
}
