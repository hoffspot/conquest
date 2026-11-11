// Lays a world out from its seed away from the page (app/plans.js), so the page isn't held still
// for the second or two it takes. Asked { seed }, it answers { seed, plan, land }: the plan as
// core/worldplan/plan.js layOutWorld makes it, and the land its waters are worked out from (plan.js
// landOf: the plan's own arrays, so they go as one), the typed arrays handed over, not copied
// (they're nearly all of it: 1.5 MB of 1.6); or { seed, error } if it can't be laid out.

import { landOf, layOutWorld } from "../core/worldplan/plan.js";

// Every typed array's memory in `value` (plain objects, arrays and typed arrays), once each
function buffersOf(value, found = new Set()) {
    if (ArrayBuffer.isView(value)) {
        found.add(value.buffer);
    } else if (value && typeof value === "object") {
        for (const each of Object.values(value)) {
            buffersOf(each, found);
        }
    }

    return found;
}

/**
 * The answer for a seed: [message, what's handed over with it (the plan's typed arrays' memory,
 * which this side no longer has once it's posted)].
 */
export function answer(seed) {
    try {
        const plan = layOutWorld(seed);
        const message = { seed, plan, land: landOf(plan) };

        return [message, [...buffersOf(message)]];
    } catch (error) {
        return [{ seed, error: String(error?.message ?? error) }, []];
    }
}

// (Only in a worker: on a page, or in Node, there's no one to hear)
if (typeof globalThis.WorkerGlobalScope === "function" && globalThis.self instanceof globalThis.WorkerGlobalScope) {
    self.addEventListener("message", ({ data }) => self.postMessage(...answer(data?.seed)));
}
