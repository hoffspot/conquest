// A dungeon level's rock as one surface (core/dungeons: docs/DUNGEONS.md), its walls and its roof
// together, as a cave's are: walls standing up from the floor along the edge of its open ground
// (never into it, below head height, so nothing walks into them), bulging and hollowed as rock is,
// leaning in as they rise, and rounding over into a roof that's highest over the middle of a
// cavern and lowest over a narrow tunnel. It's worked out on a lattice of points (CAVERNS.step
// apart) as how far each is into the open (positive) or the rock (negative), and the surface
// drawn where that's nought, as a naive surface net (a point in each lattice cell the surface
// passes through, joined into a quad across each lattice edge it crosses: smooth, and no tables).
// Each point's shade, too: darker where the rock closes round it, and in its strata.
//
// Pure (no three.js), a step at a time (core/steps.js), so it's spread over frames.

/**
 * How a level's rock is worked out: the lattice's spacing (`step`, metres), how far the walls
 * stand back into the rock from the open ground's edge (`back`), how much further they're
 * hollowed in places (`hollow`), from what height they're let lean in and bulge out (`lean`), and
 * how far below the floor they go (`below`, under the floor drawn over them); and how big the
 * square tiles it's drawn in are (`tile`, metres: tiles).
 */
export const CAVERNS = Object.freeze({ step: 0.45, back: 0.2, hollow: 0.55, lean: 2.3, below: 0.8, tile: 16 });

/**
 * Each kind of rock's way (by a look's `shell`): how much it bulges and hollows (`rough`, metres),
 * how far its walls lean in towards its roof (`lean`), how high its roof is over a tunnel (`low`)
 * and over a cavern's middle (`high`), how rough its roof is (`roof`), and how far across the open
 * ground has to be before its roof's at its highest (`span`).
 */
export const SHELLS = Object.freeze({
    caves: { rough: 0.55, lean: 0.35, low: 3.4, high: 6.2, roof: 0.7, span: 7 },
    dug: { rough: 0.2, lean: 0.12, low: 2.9, high: 3.5, roof: 0.18, span: 4 },
});

// How finely the open ground's edge is found (samples a metre), and how far it's smoothed
// (metres): corners rounded as water and picks round them
const FIELD = Object.freeze({ fine: 4, smooth: 0.6 });

// --- noise ---

function hash3(x, y, z, seed) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Value noise in three dimensions, from 0 to 1, each lattice point its own
function noise3(x, y, z, seed) {
    const [xi, yi, zi] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [u, v, w] = [fade(x - xi), fade(y - yi), fade(z - zi)];
    const at = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
    const lerp = (a, b, t) => a + (b - a) * t;
    const x00 = lerp(at(0, 0, 0), at(1, 0, 0), u);
    const x10 = lerp(at(0, 1, 0), at(1, 1, 0), u);
    const x01 = lerp(at(0, 0, 1), at(1, 0, 1), u);
    const x11 = lerp(at(0, 1, 1), at(1, 1, 1), u);

    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

// Rough as rock is: two octaves of noise3, from -1 to 1, a metre and a half across at the coarsest
function rough3(x, y, z, seed) {
    return (noise3(x / 1.5, y / 1.5, z / 1.5, seed) * 0.65 + noise3(x / 0.7, y / 0.7, z / 0.7, seed + 1) * 0.35) * 2 - 1;
}

// The same over the ground (one plane of it)
const rough2 = (x, z, seed) => rough3(x, 0.5, z, seed);

// --- how far into the open ---

// The squared distance transform of a row (Felzenszwalb and Huttenlocher), in place: each entry
// becomes the least of (its distance to another)^2 plus that other's entry
function transform1(f, n, d, v, z) {
    let k = 0;

    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;

    for (let q = 1; q < n; q++) {
        let s;

        do {
            const p = v[k];

            s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        } while (s <= z[k] && --k >= 0);

        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = Infinity;
    }

    k = 0;

    for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) {
            k++;
        }

        d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
}

// How far each sample of a grid (w by h, `inside` 1 where it's what's measured from) is from the
// nearest that's inside (in samples)
function distances(inside, w, h) {
    const big = (w + h) * (w + h);
    const grid = new Float32Array(w * h);
    const n = Math.max(w, h);
    const [f, d, v, z] = [new Float64Array(n), new Float64Array(n), new Int32Array(n), new Float64Array(n + 1)];

    for (let i = 0; i < w * h; i++) {
        grid[i] = inside[i] ? 0 : big;
    }

    for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
            f[y] = grid[y * w + x];
        }

        transform1(f, h, d, v, z);

        for (let y = 0; y < h; y++) {
            grid[y * w + x] = d[y];
        }
    }

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            f[x] = grid[y * w + x];
        }

        transform1(f, w, d, v, z);

        for (let x = 0; x < w; x++) {
            grid[y * w + x] = Math.sqrt(d[x]);
        }
    }

    return grid;
}

// A box blur of a grid, across and then down, `r` samples either side
function blurred(grid, w, h, r) {
    const out = new Float32Array(w * h);
    const row = new Float32Array(Math.max(w, h));

    for (const across of [true, false]) {
        const [n, m] = across ? [w, h] : [h, w];
        const from = across ? grid : out;

        for (let j = 0; j < m; j++) {
            const at = (i) => (across ? j * w + i : i * w + j);
            let sum = 0;

            for (let i = -r; i <= r; i++) {
                sum += from[at(Math.min(n - 1, Math.max(0, i)))];
            }

            for (let i = 0; i < n; i++) {
                row[i] = sum / (2 * r + 1);
                sum += from[at(Math.min(n - 1, i + r + 1))] - from[at(Math.max(0, i - r))];
            }

            for (let i = 0; i < n; i++) {
                out[at(i)] = row[i];
            }
        }
    }

    return out;
}

/**
 * How far into the open ground each point of a level is (metres; negative in the rock), smoothed
 * round its corners: { at(x, z) (level metres), margin (metres of rock round the level) }.
 * `rock(x, y)` says whether a square is rock (the level's own beyond its edge).
 */
export function openness(width, height, rock, { margin = 2 } = {}) {
    const fine = FIELD.fine;
    const [w, h] = [Math.ceil((width + margin * 2) * fine), Math.ceil((height + margin * 2) * fine)];
    const open = new Uint8Array(w * h);
    const closed = new Uint8Array(w * h);

    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const [x, y] = [Math.floor((i + 0.5) / fine - margin), Math.floor((j + 0.5) / fine - margin)];
            const solid = x < 0 || y < 0 || x >= width || y >= height || rock(x, y);

            open[j * w + i] = solid ? 0 : 1;
            closed[j * w + i] = solid ? 1 : 0;
        }
    }

    const [toRock, toOpen] = [distances(closed, w, h), distances(open, w, h)];
    const signed = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
        signed[i] = (open[i] ? toRock[i] - 0.5 : 0.5 - toOpen[i]) / fine;
    }

    const field = blurred(signed, w, h, Math.round(FIELD.smooth * fine));

    const at = (x, z) => {
        const [u, v] = [(x + margin) * fine - 0.5, (z + margin) * fine - 0.5];
        const [i, j] = [Math.max(0, Math.min(w - 2, Math.floor(u))), Math.max(0, Math.min(h - 2, Math.floor(v)))];
        const [s, t] = [Math.max(0, Math.min(1, u - i)), Math.max(0, Math.min(1, v - j))];
        const k = j * w + i;

        return (field[k] * (1 - s) + field[k + 1] * s) * (1 - t) + (field[k + w] * (1 - s) + field[k + w + 1] * s) * t;
    };

    return { at, margin };
}

// --- the surface ---

const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

// The smaller of two, rounded where they meet (`k` across)
function smoothMin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;

    return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * How far into the open each point of a column of a level is (metres, roughly; negative in the
 * rock), for its rock's `shell` (SHELLS): its walls back from the open ground's edge and hollowed
 * (never into it below CAVERNS.lean), leaning in and bulging above that, rounding over into its
 * roof; the roof kept up to `least(x, z)` metres where it's asked to be higher (over stairs going
 * up). `column(x, z)` sets the column it's in (its openness and its roof's height: those are the
 * same all the way up it); `at(y)` is then the point `y` metres up it.
 */
export function cavernAt(open, shell, seed, least = null) {
    const rough = Math.max(shell.rough, CAVERNS.hollow);
    let [cx, cz, d, top] = [0, 0, 0, 0];

    return {
        column(x, z) {
            [cx, cz, d] = [x, z, open.at(x, z)];
            top = shell.low + (shell.high - shell.low) * smoothstep(0.5, shell.span, d) + rough2(x * 0.6, z * 0.6, seed + 5) * shell.roof;

            if (least) {
                top = Math.max(top, least(x, z));
            }

            return d;
        },
        at(y) {
            const wall = Math.max(0, y - CAVERNS.lean);
            const side = d + CAVERNS.back - wall * wall * shell.lean * 0.25;
            const over = top - y;

            // (Clear of the rock by more than it's ever made rough, there's no need of the noise)
            if (side > rough + 1.2 && over > 1.2) {
                return Math.min(side - 0.3, over - 0.3);
            }

            if (side < -rough - 0.3) {
                return side;
            }

            const bump = rough3(cx, y, cz, seed);
            // (Below head height only ever further into the rock; above, either way)
            const shaped = side + (wall > 0 ? bump * shell.rough : (bump * 0.5 + 0.5) * CAVERNS.hollow);

            return smoothMin(shaped, over, 1.2);
        },
    };
}

/**
 * Each point's normal (unit length), from the triangles round it, each as much as its area: so
 * the surface is smooth across where it's cut into tiles (tiles).
 */
export function normalsOf(positions, indices) {
    const normals = new Float32Array(positions.length);

    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
        const [ux, uy, uz] = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
        const [vx, vy, vz] = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
        const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];

        for (const p of [a, b, c]) {
            normals[p] += nx;
            normals[p + 1] += ny;
            normals[p + 2] += nz;
        }
    }

    for (let p = 0; p < normals.length; p += 3) {
        const length = Math.hypot(normals[p], normals[p + 1], normals[p + 2]) || 1;

        normals[p] /= length;
        normals[p + 1] /= length;
        normals[p + 2] /= length;
    }

    return normals;
}

/**
 * A surface ({ positions, normals, indices, shade }) cut into square tiles `size` metres across
 * (each triangle in the tile its middle's in), each a surface of its own with only its own points:
 * so what's out of sight, or out of a light's reach, is left undrawn a tile at a time.
 */
export function tiles({ positions, normals, indices, shade }, size = CAVERNS.tile) {
    const byTile = new Map();

    for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const x = (positions[a * 3] + positions[b * 3] + positions[c * 3]) / 3;
        const z = (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) / 3;
        const key = `${Math.floor(x / size)},${Math.floor(z / size)}`;

        if (!byTile.has(key)) {
            byTile.set(key, []);
        }

        byTile.get(key).push(a, b, c);
    }

    return [...byTile.values()].map((own) => {
        const index = new Map();
        const kept = [];

        for (const p of own) {
            if (!index.has(p)) {
                index.set(p, kept.length);
                kept.push(p);
            }
        }

        const tile = { positions: new Float32Array(kept.length * 3), normals: new Float32Array(kept.length * 3), shade: new Float32Array(kept.length), indices: new Uint16Array(own.length) };

        kept.forEach((p, k) => {
            tile.positions.set(positions.subarray(p * 3, p * 3 + 3), k * 3);
            tile.normals.set(normals.subarray(p * 3, p * 3 + 3), k * 3);
            tile.shade[k] = shade[p];
        });
        own.forEach((p, k) => {
            tile.indices[k] = index.get(p);
        });

        return tile;
    });
}

/**
 * A level's floor under its rock (`open`: openness's), as a lattice of squares a `step` across
 * (metres): all of it that's within reach of the open ground (on under the walls, so they stand
 * on it), but not where a hole (`hole`: { x, y, w, h } squares, or null) goes down through it; its
 * points shaded darker towards the walls, as the light that reaches them is: { positions,
 * indices, shade } as cavern's.
 */
export function cavernFloor(width, height, open, { hole = null, step = 1 } = {}) {
    const [nx, nz] = [Math.ceil((width + 2) / step) + 1, Math.ceil((height + 2) / step) + 1];
    const positions = new Float32Array(nx * nz * 3);
    const shade = new Float32Array(nx * nz);
    const indices = [];
    const reach = -CAVERNS.back - CAVERNS.hollow - 0.6;
    const near = new Float32Array(nx * nz);

    for (let k = 0; k < nz; k++) {
        for (let i = 0; i < nx; i++) {
            const [x, z] = [-1 + i * step, -1 + k * step];
            const d = open.at(x, z);
            const p = k * nx + i;

            positions.set([x, 0, z], p * 3);
            near[p] = d;
            shade[p] = 0.45 + 0.55 * smoothstep(-0.3, 2.2, d);
        }
    }

    const holed = (x, z) => hole && x >= hole.x && x < hole.x + hole.w && z >= hole.y && z < hole.y + hole.h;

    for (let k = 0; k < nz - 1; k++) {
        for (let i = 0; i < nx - 1; i++) {
            const [a, b, c, d] = [k * nx + i, k * nx + i + 1, (k + 1) * nx + i + 1, (k + 1) * nx + i];

            if (Math.max(near[a], near[b], near[c], near[d]) < reach || holed(-1 + (i + 0.5) * step, -1 + (k + 0.5) * step)) {
                continue;
            }

            indices.push(a, c, b, a, d, c);
        }
    }

    return { positions, indices: nx * nz > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), shade };
}

/**
 * A level's rock (`width` by `height` squares, `rock(x, y)` whether a square's rock), drawn as
 * one surface for its `shell` (SHELLS), a step at a time: { positions (level metres, y up),
 * indices (each three a triangle, facing the open), shade (0 to 1 at each point: darker where the
 * rock closes round it), floor (cavernFloor's, under it: `hole` where stairs go down through it) }.
 */
export function* cavern(width, height, rock, shell, { seed = 1, least = null, hole = null } = {}) {
    const open = openness(width, height, rock);

    yield;

    const step = CAVERNS.step;
    const field = cavernAt(open, shell, seed, least);
    const deepest = -CAVERNS.back - Math.max(shell.rough, CAVERNS.hollow) - step * 2;
    const [x0, z0] = [-1, -1];
    const y0 = -CAVERNS.below;
    const [nx, nz] = [Math.ceil((width + 2) / step) + 1, Math.ceil((height + 2) / step) + 1];
    const ny = Math.ceil((shell.high + shell.roof + 2 - y0) / step) + 1;
    const values = new Float32Array(nx * ny * nz);
    const index = (i, j, k) => (k * ny + j) * nx + i;

    // (Each lattice point how far into the open; a column far into the rock all rock)
    for (let k = 0; k < nz; k++) {
        for (let i = 0; i < nx; i++) {
            const deep = field.column(x0 + i * step, z0 + k * step) < deepest;

            for (let j = 0; j < ny; j++) {
                values[index(i, j, k)] = deep ? -1 : field.at(y0 + j * step);
            }
        }

        if (k % 8 === 7) {
            yield;
        }
    }

    // A point in each cell the surface goes through: where it crosses the cell's edges, on average
    const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    const cell = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
    const positions = [];
    const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const sample = new Float32Array(8);

    for (let k = 0; k < nz - 1; k++) {
        for (let j = 0; j < ny - 1; j++) {
            for (let i = 0; i < nx - 1; i++) {
                let air = 0;

                for (let c = 0; c < 8; c++) {
                    const [a, b, e] = corners[c];

                    sample[c] = values[index(i + a, j + b, k + e)];
                    air += sample[c] > 0 ? 1 : 0;
                }

                if (air === 0 || air === 8) {
                    continue;
                }

                let [sx, sy, sz, count] = [0, 0, 0, 0];

                for (const [p, q] of edges) {
                    if (sample[p] > 0 === sample[q] > 0) {
                        continue;
                    }

                    const t = sample[p] / (sample[p] - sample[q]);
                    const [a, b, e] = corners[p];
                    const [c, d, f] = corners[q];

                    sx += a + (c - a) * t;
                    sy += b + (d - b) * t;
                    sz += e + (f - e) * t;
                    count++;
                }

                cells[cell(i, j, k)] = positions.length / 3;
                positions.push(x0 + (i + sx / count) * step, y0 + (j + sy / count) * step, z0 + (k + sz / count) * step);
            }
        }

        if (k % 16 === 15) {
            yield;
        }
    }

    // A quad across each lattice edge the surface crosses, joining the four cells round it, facing
    // the open (the way the field rises)
    const indices = [];
    const quad = (a, b, c, d, flip) => {
        if (a < 0 || b < 0 || c < 0 || d < 0) {
            return;
        }

        if (flip) {
            indices.push(a, c, b, a, d, c);
        } else {
            indices.push(a, b, c, a, c, d);
        }
    };

    for (let k = 1; k < nz - 1; k++) {
        for (let j = 1; j < ny - 1; j++) {
            for (let i = 1; i < nx - 1; i++) {
                const here = values[index(i, j, k)] > 0;

                // (Along x: the cells round it across y and z; along y: across z and x; along z:
                // across x and y)
                if (here !== values[index(i + 1, j, k)] > 0) {
                    quad(cells[cell(i, j - 1, k - 1)], cells[cell(i, j, k - 1)], cells[cell(i, j, k)], cells[cell(i, j - 1, k)], here);
                }

                if (here !== values[index(i, j + 1, k)] > 0) {
                    quad(cells[cell(i - 1, j, k - 1)], cells[cell(i - 1, j, k)], cells[cell(i, j, k)], cells[cell(i, j, k - 1)], here);
                }

                if (here !== values[index(i, j, k + 1)] > 0) {
                    quad(cells[cell(i - 1, j - 1, k)], cells[cell(i, j - 1, k)], cells[cell(i, j, k)], cells[cell(i - 1, j, k)], here);
                }
            }
        }

        if (k % 16 === 15) {
            yield;
        }
    }

    // Each point's shade: how open it is a little way out from it (the lattice's, between its
    // points), darker deep in hollows and where the walls meet the floor
    const valueAt = (x, y, z) => {
        const [u, v, w] = [(x - x0) / step, (y - y0) / step, (z - z0) / step];
        const [i, j, k] = [Math.max(0, Math.min(nx - 2, Math.floor(u))), Math.max(0, Math.min(ny - 2, Math.floor(v))), Math.max(0, Math.min(nz - 2, Math.floor(w)))];
        const [s, t, r] = [u - i, v - j, w - k];
        const lerp = (a, b, f) => a + (b - a) * f;
        const plane = (kk) => lerp(lerp(values[index(i, j, kk)], values[index(i + 1, j, kk)], s), lerp(values[index(i, j + 1, kk)], values[index(i + 1, j + 1, kk)], s), t);

        return lerp(plane(k), plane(k + 1), r);
    };
    const shade = new Float32Array(positions.length / 3);

    for (let p = 0; p < shade.length; p++) {
        const [x, y, z] = [positions[p * 3], positions[p * 3 + 1], positions[p * 3 + 2]];
        // (Out along the way the field rises: its gradient)
        const e = step * 0.5;
        const [gx, gy, gz] = [valueAt(x + e, y, z) - valueAt(x - e, y, z), valueAt(x, y + e, z) - valueAt(x, y - e, z), valueAt(x, y, z + e) - valueAt(x, y, z - e)];
        const g = Math.hypot(gx, gy, gz) || 1;
        const reach = 0.9;
        const out = valueAt(x + (gx / g) * reach, y + (gy / g) * reach, z + (gz / g) * reach);

        shade[p] = (0.35 + 0.65 * smoothstep(0, reach * 0.8, out)) * (0.6 + 0.4 * smoothstep(-0.2, 0.9, y));
    }

    yield;

    const surface = { positions: new Float32Array(positions), indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), shade };

    surface.normals = normalsOf(surface.positions, surface.indices);

    yield;

    const floor = cavernFloor(width, height, open, { hole });

    floor.normals = normalsOf(floor.positions, floor.indices);

    return { ...surface, floor };
}
