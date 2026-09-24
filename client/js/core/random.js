// Seeded random numbers and noise for generating maps.
//
// Both players in a multiplayer game generate the map from the same seed, so the results must be
// exactly the same in every browser. Everything here uses integer arithmetic and plain + - * /,
// which JavaScript computes identically everywhere, and never Math.random, Math.sin and the like
// (whose results can differ slightly between browsers).

/** A random number generator (mulberry32) that always gives the same sequence for a seed. */
export function createRandom(seed) {
    let state = seed >>> 0;

    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    return {
        /** A number from 0 up to (not including) 1. */
        next,
        /** A number from min up to max. */
        range: (min, max) => min + next() * (max - min),
        /** A whole number from min to max, inclusive. */
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        /** True with the given probability. */
        chance: (probability) => next() < probability,
        /** One of the items in a list. */
        pick: (list) => list[Math.floor(next() * list.length)],
        /** One of the items, chosen in proportion to weight(item). */
        pickWeighted(list, weight) {
            const total = list.reduce((sum, item) => sum + weight(item), 0);
            let target = next() * total;

            for (const item of list) {
                target -= weight(item);

                if (target < 0) {
                    return item;
                }
            }

            return list.at(-1);
        },
        /** A list in random order (a copy). */
        shuffle(list) {
            const result = [...list];

            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));

                [result[i], result[j]] = [result[j], result[i]];
            }

            return result;
        },
        /** A new seed, for a separate generator. */
        seed: () => Math.floor(next() * 4294967296),
    };
}

// A pseudo-random value from 0 to 1 for each grid point and seed
function hash(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);

    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;

    return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Smooth noise from 0 to 1 that varies over roughly `scale` grid squares: several layers of
 * value noise added together, the larger layers counting most.
 */
export function noise(x, y, seed, scale = 8, layers = 3) {
    let total = 0;
    let weight = 0;
    let amplitude = 1;
    let size = scale;

    for (let layer = 0; layer < layers; layer++) {
        const fx = x / size;
        const fy = y / size;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const layerSeed = seed + layer * 1013;
        const top = hash(x0, y0, layerSeed) + (hash(x0 + 1, y0, layerSeed) - hash(x0, y0, layerSeed)) * tx;
        const bottom = hash(x0, y0 + 1, layerSeed) + (hash(x0 + 1, y0 + 1, layerSeed) - hash(x0, y0 + 1, layerSeed)) * tx;

        total += (top + (bottom - top) * ty) * amplitude;
        weight += amplitude;
        amplitude /= 2;
        size /= 2;
    }

    return total / weight;
}
