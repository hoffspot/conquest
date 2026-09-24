// Small maths helpers for painting and growing things procedurally: hashing, value noise (from
// 3D positions, so patterns are seamless across texture seams), easing and seeded randomness.

/** A hash of three whole numbers, 0 to 1. */
export function hash3(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 3D, 0 to 1, with features about 1 unit apart. */
export function valueNoise(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fy = y - yi;
    const fz = z - zi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const w = fz * fz * (3 - 2 * fz);
    const lerp = (a, b, t) => a + (b - a) * t;
    const corner = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);

    return lerp(
        lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), u), lerp(corner(0, 1, 0), corner(1, 1, 0), u), v),
        lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), u), lerp(corner(0, 1, 1), corner(1, 1, 1), u), v),
        w,
    );
}

/** Several octaves of value noise, 0 to 1. */
export function fbm(x, y, z, octaves = 4) {
    let sum = 0;
    let amplitude = 0.5;
    let total = 0;

    for (let o = 0; o < octaves; o++) {
        sum += amplitude * valueNoise(x, y, z);
        total += amplitude;
        x *= 2.03;
        y *= 2.03;
        z *= 2.03;
        amplitude *= 0.5;
    }

    return sum / total;
}

export function smoothstep(edge0, edge1, x) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);
}

export const gaussian = (d2, radius) => Math.exp(-d2 / (radius * radius));

/** Linear interpolation in a table of [x, y] pairs, x ascending. */
export function lerpTable(table, x) {
    if (x <= table[0][0]) {
        return table[0][1];
    }

    for (let k = 1; k < table.length; k++) {
        if (x <= table[k][0]) {
            const [x0, y0] = table[k - 1];
            const [x1, y1] = table[k];

            return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        }
    }

    return table[table.length - 1][1];
}

/** A seeded random number generator (mulberry32): returns a function giving 0 to 1. */
export function random(seed = 1) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
