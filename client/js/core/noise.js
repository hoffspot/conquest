// Smooth noise for laying things out the way nature does: value noise (random values on a lattice,
// blended smoothly between) and fractal sums of it at finer and finer scales, from a seed, the
// same everywhere. `noise` goes on for ever (for fields across the world: where it's rocky, where
// flowers grow in drifts); `tiling` repeats every `period` lattice cells (for textures that tile).
// Pure arithmetic, no DOM.

// A pseudo-random value from 0 to 1 for a lattice point and a seed
export function hashOf(x, y, seed = 0) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177);

    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 2246822519);

    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Value noise at a point (lattice units), each lattice point's value from `at`
function blend(x, y, at) {
    const [x0, y0] = [Math.floor(x), Math.floor(y)];
    const [fx, fy] = [smooth(x - x0), smooth(y - y0)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;

    return top + (bottom - top) * fy;
}

/** Value noise from 0 to 1 at a point, varying over about `scale` units. */
export function noise(x, y, scale, seed = 0) {
    return blend(x / scale, y / scale, (i, j) => hashOf(i, j, seed));
}

/**
 * Fractal noise from 0 to 1: `octaves` of value noise, each half the scale and half as strong as
 * the last, the coarsest varying over about `scale` units.
 */
export function fractal(x, y, scale, seed = 0, octaves = 3) {
    let [sum, weight, total, size] = [0, 1, 0, scale];

    for (let k = 0; k < octaves; k++) {
        sum += noise(x, y, size, seed + k * 7919) * weight;
        total += weight;
        weight /= 2;
        size /= 2;
    }

    return sum / total;
}

/**
 * Fractal noise that repeats every `period` lattice cells of its coarsest octave (x and y in those
 * cells): for textures that tile.
 */
export function tiling(x, y, period, seed = 0, octaves = 3) {
    let [sum, weight, total, cells, at] = [0, 1, 0, period, 1];

    for (let k = 0; k < octaves; k++) {
        const wrap = cells;

        sum += blend(x * at, y * at, (i, j) => hashOf(((i % wrap) + wrap) % wrap, ((j % wrap) + wrap) % wrap, seed + k * 7919)) * weight;
        total += weight;
        weight /= 2;
        cells *= 2;
        at *= 2;
    }

    return sum / total;
}
