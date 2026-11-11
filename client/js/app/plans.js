// A world's plan got ready for the page without the page laying it out (app/session.js).
//
// Laying a world out from its seed (core/worldplan/plan.js) is the same every time and takes a
// second and a half or more of the page's thread, the loading screen standing still meanwhile: 60%
// of building the world, on every load, for every player who joins. So:
//
// - it's laid out in a worker (plan-worker.js), the page left free, and handed over, its typed
//   arrays moved, not copied. The page takes it as its own (plan.js adoptPlan: frozen, and
//   planWorld's for that seed from then on);
// - it's kept between visits (IndexedDB, which keeps it exactly as it is: typed arrays, plain
//   objects), by the code's version and the seed. A load after the first reads it back in a few
//   milliseconds. The version is the commit the code was built from (version.js, stamped as the
//   site's put together): another release's plan is never given, as the same seed may lay out
//   differently there, and its plans are let go of. A copy run from the repository ("dev") has no
//   version to tell its code by, so it keeps none.
//
// The plan handed over is what layOutWorld makes on the page, byte for byte (test/plans.test.js).
// With it goes the land its waters are worked out from (plan.js landOf: the land alone, as it
// was while the world was settled), in the same message and the same record, so that it's still
// the plan's own arrays on the page. The waters themselves stay behind in the worker: the page
// works them out again from that land as they're first asked for, the same, in about a tenth of a
// second. (From the plan itself they'd come out different near a scene set into the land, for
// some seeds: a world unlike everyone else's.)
//
// Where there's no worker to be had (no module workers, one that fails or never answers) or
// nowhere to keep it (private browsing), the page lays it out itself, as before.
//
// No Three.js here.

import { adoptPlan, CELLS, planWorld } from "../core/worldplan/plan.js";
import { COMMIT } from "./version.js";

/**
 * How many plans are kept between visits (the most lately used: 1.6 MB each); and how long a
 * worker's given to lay one out before the page does it itself (ms: a phone takes a few seconds).
 */
export const PLANS = Object.freeze({ kept: 6, wait: 30000 });

// Where they're kept (IndexedDB): the database, and its one object store. Each plan under
// "plan/<version>/<seed>", and when it was last used (ms) under "used/<version>/<seed>"
const DATABASE = "pellagos-plans";
const STORE = "plans";

/** What a plan's kept under: the code's version and its seed, so neither's ever given the other's. */
export function planKey(version, seed) {
    return `${version}/${seed}`;
}

/** Whether `commit` (version.js COMMIT) names the code: stamped, not the repository's noughts. */
export function stamped(commit) {
    return /^[0-9a-f]{40}$/.test(commit) && !/^0+$/.test(commit);
}

// Whether what was kept, or handed over ({ plan, land }), is a plan for `seed`: its seed, its land
// the size this code lays out, and with it the land its waters are worked out from, the plan's own
// arrays still (kept or handed over in one piece)
function sound(made, seed) {
    const { plan, land } = made ?? {};

    return Boolean(plan && land) && plan.seed === seed && plan.cells === CELLS && plan.height instanceof Float32Array && plan.height.length === CELLS * CELLS && land.height === plan.height && land.water === plan.water;
}

/**
 * Where plans are kept between visits: { get(key), put(key, made, version) }, each a promise
 * (get's of what was kept, { plan, land }, or null). Or null, where the browser has no IndexedDB.
 *
 * @param {IDBFactory} [indexedDB]
 * @param {Function} [now] - The time (ms).
 */
export function planStore(indexedDB = globalThis.indexedDB, now = () => Date.now()) {
    if (!indexedDB) {
        return null;
    }

    let opening = null;

    // A request's result, once it's come
    const done = (request) => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    const open = () => {
        opening ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE, 1);

            request.onupgradeneeded = () => request.result.createObjectStore(STORE);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error("blocked"));
        });

        // (Not opened: tried again the next time it's wanted)
        opening.catch(() => (opening = null));

        return opening;
    };

    // What's kept, read or written in one go: `work(store)` gives what to wait for
    const within = async (mode, work) => {
        const transaction = (await open()).transaction([STORE], mode);
        const finished = new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error ?? new Error("aborted"));
        });

        // (Both waited for together, so that neither fails with no one to hear it)
        const [result] = await Promise.all([work(transaction.objectStore(STORE)), finished]);

        return result;
    };

    return {
        /** What's kept under `key`, or null; used now, so among the last let go of. */
        async get(key) {
            const made = (await within("readonly", (store) => done(store.get(`plan/${key}`)))) ?? null;

            // (Noted meanwhile: the plan's not kept waiting for it)
            if (made) {
                within("readwrite", (store) => done(store.put(now(), `used/${key}`))).catch(() => {});
            }

            return made;
        },

        /**
         * Keep `made` (a plan and its land, as one) under `key`, and let go of every other
         * version's (those not under `version`), and of this version's least lately used past
         * PLANS.kept.
         */
        async put(key, made, version) {
            await within("readwrite", (store) => Promise.all([done(store.put(made, `plan/${key}`)), done(store.put(now(), `used/${key}`))]));

            const keys = await within("readonly", (store) => done(store.getAllKeys()));
            const ours = keys.filter((each) => each.startsWith(`plan/${version}/`)).map((each) => each.slice(5));
            const used = await within("readonly", (store) => Promise.all(ours.map((each) => done(store.get(`used/${each}`)))));
            const kept = new Set(ours.map((each, k) => [each, used[k] ?? 0]).sort((a, b) => b[1] - a[1]).slice(0, PLANS.kept).map(([each]) => each));
            const doomed = keys.filter((each) => !kept.has(each.slice(5)));

            if (doomed.length) {
                await within("readwrite", (store) => Promise.all(doomed.map((each) => done(store.delete(each)))));
            }
        },
    };
}

export class Plans {
    /**
     * Every option is the browser's own, or the game's, by default (they're given in the tests).
     *
     * @param {object} [options]
     * @param {string} [options.version] - The commit the code was built from (version.js COMMIT).
     * @param {Function} [options.worker] - Makes the worker that lays plans out (plan-worker.js).
     * @param {object} [options.store] - Where plans are kept between visits (planStore), or null.
     * @param {Function} [options.layOut] - Lays a plan out here, on the page (planWorld).
     * @param {Function} [options.adopt] - Takes a plan laid out elsewhere as the page's (adoptPlan).
     * @param {Function} [options.later] - Does something once the page has a moment (the plan kept).
     * @param {number} [options.wait] - How long the worker's given (ms).
     */
    constructor({
        version = COMMIT,
        worker = () => new Worker(new URL("./plan-worker.js", import.meta.url), { type: "module" }),
        store = planStore(),
        layOut = planWorld,
        adopt = adoptPlan,
        later = (work) => setTimeout(work, 2000),
        wait = PLANS.wait,
    } = {}) {
        Object.assign(this, { version, worker, layOut, adopt, later, wait });

        // (Nowhere to keep them for a copy with no version: its code changes without it changing)
        this.store = stamped(version) ? store : null;

        /** The plans asked for, by seed (each a promise of it: the few most lately asked for). */
        this.asked = new Map();

        /** How each plan asked for was come by, by seed: "kept", "worker" or "page" (the debug log's, and the tests'). */
        this.how = new Map();
    }

    /**
     * The plan of the world of `seed`: resolves with it, the page's own (planWorld's for that seed
     * from then on). Asked for again, the same one. Call it as soon as the seed's known: it's laid
     * out meanwhile.
     */
    of(seed) {
        const asked = this.asked.get(seed) ?? this.#get(seed);

        // (The most lately asked for kept last; the longest unasked for forgotten, as planWorld's)
        this.asked.delete(seed);
        this.asked.set(seed, asked);

        if (this.asked.size > 4) {
            this.asked.delete(this.asked.keys().next().value);
        }

        // (One that couldn't be had at all isn't kept: asked for again, it's tried again)
        asked.catch(() => this.asked.get(seed) === asked && this.asked.delete(seed));

        return asked;
    }

    async #get(seed) {
        const key = planKey(this.version, seed);
        const kept = await this.store?.get(key).catch(() => null);

        if (sound(kept, seed)) {
            this.how.set(seed, "kept");

            return this.adopt(kept.plan, kept.land);
        }

        let made;

        try {
            made = await this.#elsewhere(seed);
        } catch {
            // (No worker, or it failed: laid out here, as it always was)
            this.how.set(seed, "page");

            return this.layOut(seed);
        }

        const { plan, land } = made;
        const own = this.adopt(plan, land);

        this.how.set(seed, "worker");

        // (Kept for the next visit, once the game's had what it's waiting for; unless the page
        // had one of its own for the seed already, when that's the one it goes by)
        if (this.store && own === plan) {
            this.later(() => this.store.put(key, { plan, land }, this.version).catch(() => {}));
        }

        return own;
    }

    // The plan laid out in a worker, and its land: resolves with them ({ plan, land }), as they're
    // handed over; rejects if there's no worker to be had, it fails, what it answers isn't the
    // plan, or it's not answered in `wait`
    #elsewhere(seed) {
        return new Promise((resolve, reject) => {
            const worker = this.worker();
            const timer = setTimeout(() => over(reject, new Error("no answer")), this.wait);
            const over = (settle, value) => {
                clearTimeout(timer);
                worker.terminate();
                settle(value);
            };

            worker.addEventListener("message", ({ data }) => (sound(data, seed) ? over(resolve, data) : over(reject, new Error(data?.error ?? "not a plan"))));
            worker.addEventListener("error", (event) => {
                event.preventDefault?.();
                over(reject, new Error(event.message ?? "the worker failed"));
            });
            worker.addEventListener("messageerror", () => over(reject, new Error("unreadable")));
            worker.postMessage({ seed });
        });
    }
}
