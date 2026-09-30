// Simplex noise in two dimensions, with its slope (the way it rises, east and south), from a seed,
// the same in every browser: Ken Perlin's simplex grid with Stefan Gustavson's arrangement of it
// (his is public domain), worked out with nothing but + - * / and floor. The slope comes out with
// the value, for noise that's smoother where the land's already steep (height.js) and for the
// ground's normals.
//
// Its gradients are sixteen directions round the circle, written out rather than worked out with
// Math.cos (which browsers needn't agree on to the last digit). The three corners are written out
// in turn rather than through a function (nor with arrays taken apart): it's called hundreds of
// thousands of times a chunk, and is twice as fast this way.

// Skewing the grid into and out of triangles: (√3 - 1) / 2 and (3 - √3) / 6
const SKEW = 0.3660254037844386;
const UNSKEW = 0.21132486540518713;

// Sixteen unit directions, 22.5° apart
const GRADIENTS = new Float64Array([
    1, 0, 0.9238795325112867, 0.3826834323650898, 0.7071067811865476, 0.7071067811865476, 0.3826834323650898, 0.9238795325112867,
    0, 1, -0.3826834323650898, 0.9238795325112867, -0.7071067811865476, 0.7071067811865476, -0.9238795325112867, 0.3826834323650898,
    -1, 0, -0.9238795325112867, -0.3826834323650898, -0.7071067811865476, -0.7071067811865476, -0.3826834323650898, -0.9238795325112867,
    0, -1, 0.3826834323650898, -0.9238795325112867, 0.7071067811865476, -0.7071067811865476, 0.9238795325112867, -0.3826834323650898,
]);

// So the noise reaches about -1 and 1 at most (measured over a million points: test/terrain.test.js)
const SCALE = 99.2;

// A corner's gradient (its index into GRADIENTS, times 2), from its lattice point and the seed
function gradient(i, j, seed) {
    let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 1274126177);

    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;

    return (h & 15) << 1;
}

/**
 * Simplex noise at a point (in the noise's own units: it changes over about one), from about -1
 * to 1, with its slope: written into `out` as [value, d/dx, d/dy], and `out` returned.
 */
export function simplex(x, y, seed, out = [0, 0, 0]) {
    // Which triangle of the skewed grid the point's in, and where in it
    const s = (x + y) * SKEW;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * UNSKEW;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + UNSKEW;
    const y1 = y0 - j1 + UNSKEW;
    const x2 = x0 - 1 + 2 * UNSKEW;
    const y2 = y0 - 1 + 2 * UNSKEW;
    let value = 0;
    let dx = 0;
    let dy = 0;

    // Each corner's part: (0.5 - r²)⁴ times its gradient's dot with the way from it to the point
    let r = 0.5 - x0 * x0 - y0 * y0;

    if (r > 0) {
        const g = gradient(i, j, seed);
        const gx = GRADIENTS[g];
        const gy = GRADIENTS[g + 1];
        const dot = gx * x0 + gy * y0;
        const r2 = r * r;
        const lean = -8 * r2 * r * dot;

        value += r2 * r2 * dot;
        dx += lean * x0 + r2 * r2 * gx;
        dy += lean * y0 + r2 * r2 * gy;
    }

    r = 0.5 - x1 * x1 - y1 * y1;

    if (r > 0) {
        const g = gradient(i + i1, j + j1, seed);
        const gx = GRADIENTS[g];
        const gy = GRADIENTS[g + 1];
        const dot = gx * x1 + gy * y1;
        const r2 = r * r;
        const lean = -8 * r2 * r * dot;

        value += r2 * r2 * dot;
        dx += lean * x1 + r2 * r2 * gx;
        dy += lean * y1 + r2 * r2 * gy;
    }

    r = 0.5 - x2 * x2 - y2 * y2;

    if (r > 0) {
        const g = gradient(i + 1, j + 1, seed);
        const gx = GRADIENTS[g];
        const gy = GRADIENTS[g + 1];
        const dot = gx * x2 + gy * y2;
        const r2 = r * r;
        const lean = -8 * r2 * r * dot;

        value += r2 * r2 * dot;
        dx += lean * x2 + r2 * r2 * gx;
        dy += lean * y2 + r2 * r2 * gy;
    }

    out[0] = value * SCALE;
    out[1] = dx * SCALE;
    out[2] = dy * SCALE;

    return out;
}
