// Where a dungeon's numbers come from (core/dungeons: docs/DUNGEONS.md): one seed for the whole
// dungeon, and from it a stream of its own for each stage of each level (its layout, what's put in
// it, how it's dressed), so that a change to one stage (a new prop, say) never moves a room of
// another. And choosing from a list by seed in a way that adding to the list later only changes
// the choices the new entry wins (rendezvous hashing), so the dungeons already found stay as they
// were. Whole-number hashing and exact.js only: the same on every machine.

import { log } from "../exact.js";
import { createRandom } from "../random.js";

/** A whole number for a name (a stage's, a slot's): FNV-1a over its characters. */
export function nameHash(name) {
    let h = 0x811c9dc5;

    for (let k = 0; k < name.length; k++) {
        h ^= name.charCodeAt(k);
        h = Math.imul(h, 0x01000193);
    }

    return h >>> 0;
}

/** One whole number from several (numbers, or names), well mixed: a seed for them together. */
export function mix(...parts) {
    let h = 0x9e3779b9;

    for (const part of parts) {
        const value = typeof part === "string" ? nameHash(part) : part >>> 0;

        h = Math.imul(h ^ value, 0x85ebca6b);
        h ^= h >>> 13;
        h = Math.imul(h, 0xc2b2ae35);
        h ^= h >>> 16;
    }

    return h >>> 0;
}

/** A random stream of its own (random.js createRandom's) for a stage of a dungeon: (seed, stage name, level, attempt...). */
export const streamOf = (...parts) => createRandom(mix(...parts));

/** A number from just over 0 to 1 for several parts, the same every time. */
export const unitOf = (...parts) => (mix(...parts) + 1) / 4294967297;

/**
 * One of `list` chosen by (seed, slot): each scored by its own hash of (seed, slot, its id),
 * weighted by `weight(item)` (rendezvous hashing: the one with the highest log(u) / weight), so a
 * new entry changes a slot's choice only where it scores best. `id(item)` names each (`item.id`
 * by default). Null for an empty list (or every weight 0).
 */
export function pickStable(seed, slot, list, weight = (item) => item.weight ?? 1, id = (item) => item.id) {
    let best = null;
    let top = -Infinity;

    for (const item of list) {
        const w = weight(item);

        if (!(w > 0)) {
            continue;
        }

        const score = log(unitOf(seed, slot, id(item))) / w;

        if (score > top) {
            [best, top] = [item, score];
        }
    }

    return best;
}

/**
 * `count` of `list`, all different, chosen by (seed, slot) as pickStable chooses one (the best
 * `count` scores), in the list's order.
 */
export function pickSome(seed, slot, list, count, weight = (item) => item.weight ?? 1, id = (item) => item.id) {
    return list
        .map((item, k) => ({ item, k, w: weight(item) }))
        .filter(({ w }) => w > 0)
        .map((one) => ({ ...one, score: log(unitOf(seed, slot, id(one.item))) / one.w }))
        .sort((a, b) => b.score - a.score || a.k - b.k)
        .slice(0, count)
        .sort((a, b) => a.k - b.k)
        .map(({ item }) => item);
}
