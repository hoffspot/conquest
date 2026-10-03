// How high the ground stands at any point of the world (metres), from the world plan alone: the
// same wherever and whenever it's asked, in every browser (nothing but + - * /, floor and square
// roots), so that the rules, the drawn ground and the navigation mesh all stand on the same land,
// and every player's does too.
//
// It's built up in layers:
//
// - The lie of the land: the plan's heights (a 32-metre cell each), read between cells with a
//   cubic B-spline (smooth, never overshooting), then into metres along a curve (curve.js): the
//   plains nearly flat, the hills rolling, the mountains steep and the peaks high.
// - Its roughness, as each kind of land has it: gentle swells on the plains, more in the hills;
//   in the mountains, ridges (ridged multifractal noise, its lines bent by a warp) steep enough
//   that only the valleys and passes can be walked; mesas stepped in terraces in the badlands;
//   the volcano's crater. Each kind of land's roughness is itself read between cells with the same
//   B-spline, so one blends into the next over a hundred metres or so.
// - The water: the land carved down under lakes and the sea (to meet the shore as the overworld
//   has it: waters.js), and a channel for each river, its surface only ever running down, with
//   banks just above it.
//
// Heights are rounded to 1/1024 m, so a Float32Array holds them exactly: the rules, the mesh and
// the navigation mesh then see the same numbers.

import { cos, sin, TAU } from "../exact.js";
import { metresOf } from "./curve.js";
import { simplex } from "./simplex.js";
import { setLandOf, watersOf } from "./waters.js";
import { BIOME, BIOMES } from "../worldplan/races.js";
import { CELL, CELLS, MOUNTAIN, WATER, WORLD_SIZE } from "../worldplan/terrain.js";

/** Bumped whenever the ground a seed makes changes (players playing together must agree on it). */
export const TERRAIN_VERSION = 11;

/** Heights are whole multiples of this (metres). */
export const HEIGHT_STEP = 1 / 1024;

/**
 * How steep a square can be (the tangent of its slope): walked on freely below `steep` (30°),
 * slowly below `cliff` (38°), not at all above.
 */
export const SLOPE = Object.freeze({ steep: 0.5773502691896258, cliff: 0.7812856265067174 });

/** A square's kind by its slope. */
export const SLOPE_CLASS = Object.freeze({ open: 0, steep: 1, cliff: 2 });

/**
 * Each kind of land's roughness: `rough` (metres: rolling swells, either way), `ridge` (metres:
 * ridges, on top of the mountains the plan has), `mesa` (0 to 1: stepped into terraces).
 */
export const ROUGHNESS = Object.freeze({
    sea: { rough: 1 },
    lake: { rough: 0.5 },
    farmland: { rough: 1.2 },
    meadow: { rough: 1.8 },
    woods: { rough: 2.5 },
    heath: { rough: 3 },
    marsh: { rough: 0.5 },
    elfwood: { rough: 3 },
    darkwood: { rough: 4 },
    savannah: { rough: 1.6 },
    jungle: { rough: 3 },
    badlands: { rough: 3, mesa: 1 },
    volcanic: { rough: 5, mesa: 0.3 },
    tundra: { rough: 2.5 },
    snow: { rough: 10 },
    mountain: { rough: 9 },
    beach: { rough: 0.4 },
});

// How much rougher the hills are (metres, more the higher up to the mountains), and how high the
// ridges stand in the mountains (metres, from where they start to where they're highest)
const HILLS = { rough: 10, from: 0.45, to: MOUNTAIN };
const RIDGES = { height: 110, from: 0.66, to: 0.9 };

// The swells: wavelength (metres), octaves, and how much steeper ground smooths them (the steeper
// the octaves below, the less each above adds: Iñigo Quílez's "eroded" fBm)
const SWELLS = { wavelength: 220, octaves: 4, smoothing: 0.35 };

// The ridges: wavelength (metres), octaves, and the warp that bends their lines (wavelength and
// how far, metres)
const RIDGE = { wavelength: 520, octaves: 4, warp: 900, bend: 90 };

// Terraces on mesas: each step this high (metres)
const TERRACE = 7;

/**
 * The volcano's crater: how wide (its radius, metres) and how deep under its rim (metres). It's
 * cut down from the rim, the cone's height round it on average (sampled at `round` points), so
 * however steep the cone, its top is a bowl; flat across its middle (`flat` of its radius), where
 * the lava lies.
 */
export const CRATER = Object.freeze({ radius: 60, depth: 45, round: 16, flat: 0.35 });

// The sea and lakes: how deep the bottom goes below the surface (metres, at most, and in the
// shallows)
const DEEP = { sea: 12, lake: 4 };

// How ragged shores are: the wavelength of their wiggles (metres), and how much they move them
// (in wetness)
const RAGGED = { wavelength: 40, by: 0.12 };

// Still water stands only where the plan's this wet (and the ground's below its surface)
const WET_FROM = 0.2;

// Rivers: how far their banks reach (metres: at least, and more for each metre of half-width) from
// the water, easing from just above the water to the land round them (how deep their beds are is
// the river's own: waters.js)
const BANKS = { least: 5, perHalf: 2.5 };
const BANK_TOP = 0.35;

// How far (metres) a river's bank takes to rise from its bed's edge to its top: never a step
const BANK_RISE = 1.5;

// Lakes and the sea sink the land under them from where water can stand (WET_FROM) to this
// wet, a little more the wetter, so shores slope down into the water rather than dropping
const SUNK_BY = 0.55;

// Detail seeds, apart from each other
const SEEDS = { swells: 1301, ridges: 1709, warpX: 2203, warpY: 2207, ragged: 2503 };

// Each plan's layers, made once for it
const MADE = new WeakMap();

// The plan's layers: its heights in metres, and each cell's roughness (a Float32Array a cell each)
function layersOf(plan) {
    if (!MADE.has(plan)) {
        const count = CELLS * CELLS;
        const [ground, rough, ridge, mesa, calm, wet] = [0, 0, 0, 0, 0, 0].map(() => new Float32Array(count));

        for (let k = 0; k < count; k++) {
            const h = plan.height[k];
            const biome = BIOMES[plan.biome[k]].id;
            const own = ROUGHNESS[biome] ?? { rough: 2 };

            ground[k] = metresOf(h);
            rough[k] = own.rough + HILLS.rough * smoothstep(HILLS.from, HILLS.to, h);
            ridge[k] = RIDGES.height * smoothstep(RIDGES.from, RIDGES.to, h) * (plan.biome[k] === BIOME.volcanic ? 0.5 : 1);
            mesa[k] = own.mesa ?? 0;
            calm[k] = plan.water[k] === WATER.none ? (biome === "marsh" || biome === "beach" ? 0.7 : 0) : 1;
            wet[k] = plan.water[k] === WATER.sea || plan.water[k] === WATER.lake ? 1 : 0;
        }

        const [vx, vy] = plan.volcano ?? [-1, -1];

        MADE.set(plan, { ground, rough, ridge, mesa, calm, wet, volcano: [(vx + 0.5) * CELL, (vy + 0.5) * CELL], waters: watersOf(plan), seed: plan.seed | 0 });
    }

    return MADE.get(plan);
}

function smoothstep(from, to, value) {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));

    return t * t * (3 - 2 * t);
}

// The B-spline's weights for a point, and which cells they're for (reused: nothing else runs
// between filling and reading them)
const TAPS = new Int32Array(16);
const WEIGHTS = new Float64Array(16);

const [BU, BV] = [new Float64Array(4), new Float64Array(4)];

function weigh(x, y) {
    const u = x / CELL - 0.5;
    const v = y / CELL - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);

    basis(u - i, BU);
    basis(v - j, BV);

    for (let b = 0; b < 4; b++) {
        const row = Math.min(CELLS - 1, Math.max(0, j - 1 + b)) * CELLS;

        for (let a = 0; a < 4; a++) {
            TAPS[b * 4 + a] = row + Math.min(CELLS - 1, Math.max(0, i - 1 + a));
            WEIGHTS[b * 4 + a] = BU[a] * BV[b];
        }
    }
}

// The uniform cubic B-spline's four weights at t (0 to 1), into `out`
function basis(t, out) {
    const t2 = t * t;
    const t3 = t2 * t;
    const u = 1 - t;

    out[0] = (u * u * u) / 6;
    out[1] = (3 * t3 - 6 * t2 + 4) / 6;
    out[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
    out[3] = t3 / 6;
}

function spline(layer) {
    let sum = 0;

    for (let k = 0; k < 16; k++) {
        sum += layer[TAPS[k]] * WEIGHTS[k];
    }

    return sum;
}

const NOISE = [0, 0, 0];

// Rolling swells (about -1 to 1), smoother where the ground's already steep
function swells(x, y, seed) {
    let [sum, amplitude, total, frequency, gx, gy] = [0, 1, 0, 1 / SWELLS.wavelength, 0, 0];

    for (let octave = 0; octave < SWELLS.octaves; octave++) {
        simplex(x * frequency, y * frequency, seed + octave * 31, NOISE);
        gx += NOISE[1] * amplitude;
        gy += NOISE[2] * amplitude;
        sum += (amplitude * NOISE[0]) / (1 + SWELLS.smoothing * (gx * gx + gy * gy));
        total += amplitude;
        amplitude /= 2;
        frequency *= 2;
    }

    return sum / total;
}

// Ridges (0 to about 1, a third on average: only ever up, so they never sink the land round a
// mountain lake below its water): sharp crests, each octave strongest where the ones
// below stand highest (Musgrave's ridged multifractal), along lines bent by a warp
function ridges(x, y, seed) {
    const bx = simplex(x / RIDGE.warp, y / RIDGE.warp, seed + SEEDS.warpX, NOISE)[0] * RIDGE.bend;
    const by = simplex(x / RIDGE.warp, y / RIDGE.warp, seed + SEEDS.warpY, NOISE)[0] * RIDGE.bend;
    let [sum, amplitude, total, frequency, weight] = [0, 1, 0, 1 / RIDGE.wavelength, 1];

    for (let octave = 0; octave < RIDGE.octaves; octave++) {
        const n = simplex((x + bx) * frequency, (y + by) * frequency, seed + SEEDS.ridges + octave * 37, NOISE)[0];
        let signal = 1 - Math.abs(n);

        signal *= signal * weight;
        weight = Math.min(1, Math.max(0, signal * 2));
        sum += signal * amplitude;
        total += amplitude;
        amplitude /= 2;
        frequency *= 2;
    }

    return sum / total;
}

/**
 * The still water (a lake or the sea) at a point (metres), as the ground's carved for it, or null
 * where there's none near: { wetness (0 to 1: the plan's wet cells, read smoothly between them
 * and a little ragged; water deepens past a half), level (its surface's height, metres), deep
 * (how deep it gets, metres) }. Water stands wherever the ground's below its level here.
 */
export function stillOf(plan, x, y) {
    const layers = layersOf(plan);

    weigh(x, y);

    let wetness = spline(layers.wet);

    if (wetness <= 0.001) {
        return null;
    }

    // The level of the wet cell weighing most here
    let [best, most] = [-1, 0];

    for (let k = 0; k < 16; k++) {
        if (layers.wet[TAPS[k]] && WEIGHTS[k] > most) {
            [best, most] = [TAPS[k], WEIGHTS[k]];
        }
    }

    wetness += simplex(x / RAGGED.wavelength, y / RAGGED.wavelength, layers.seed + SEEDS.ragged, NOISE)[0] * RAGGED.by * Math.min(1, wetness * 4);

    const sea = plan.water[best] === WATER.sea;

    return { wetness, level: sea ? 0 : layers.waters.surfaces[best], deep: sea ? DEEP.sea : DEEP.lake };
}

/**
 * The lie of the land and its roughness at a point (metres), before any water's carved into it
 * (metres, not rounded); the volcano's crater cut into it.
 */
export function landHeight(plan, x, y) {
    const layers = layersOf(plan);
    const [dx, dy] = [x - layers.volcano[0], y - layers.volcano[1]];
    const d2 = (dx * dx + dy * dy) / (CRATER.radius * CRATER.radius);

    if (d2 < 1) {
        // (A bowl under the rim, wherever the cone stands higher: at its edge the cone's own
        // height, so the rim rises and falls as the cone round it does)
        layers.rim ??= rimOf(plan, layers);

        const cone = lieOf(plan, x, y, layers);
        const bowl = layers.rim + (cone - layers.rim) * d2 * d2 - CRATER.depth * (1 - smoothstep(CRATER.flat, 1, Math.sqrt(d2)));

        return Math.min(cone, bowl);
    }

    return lieOf(plan, x, y, layers);
}

/** The volcano's crater: its middle ([x, y] metres; none: null) and its rim's height (metres). */
export function craterOf(plan) {
    const layers = layersOf(plan);

    if (!plan.volcano) {
        return null;
    }

    layers.rim ??= rimOf(plan, layers);

    return { at: layers.volcano, rim: layers.rim, floor: layers.rim - CRATER.depth, radius: CRATER.radius };
}

// The volcano's rim: the cone's height round the crater, on average
function rimOf(plan, layers) {
    let sum = 0;

    for (let k = 0; k < CRATER.round; k++) {
        const angle = (TAU * k) / CRATER.round;

        sum += lieOf(plan, layers.volcano[0] + cos(angle) * CRATER.radius, layers.volcano[1] + sin(angle) * CRATER.radius, layers);
    }

    return sum / CRATER.round;
}

// The lie of the land and its roughness at a point (metres), as the plan has it, with no crater
function lieOf(plan, x, y, layers) {
    weigh(x, y);

    const base = spline(layers.ground);
    const calm = 1 - Math.min(1, spline(layers.calm));
    const rough = spline(layers.rough) * calm;
    const ridge = spline(layers.ridge) * calm;
    const mesa = spline(layers.mesa);
    let height = base;

    if (rough > 0.01) {
        height += rough * swells(x, y, layers.seed + SEEDS.swells);
    }

    if (ridge > 0.5) {
        height += ridge * ridges(x, y, layers.seed);
    }

    if (mesa > 0.01) {
        const f = height / TERRACE;
        const step = Math.floor(f);
        const stepped = (step + smoothstep(0.3, 0.7, f - step)) * TERRACE;

        height += (stepped - height) * mesa;
    }

    return height;
}

// The land's height at a point (metres, not rounded) with lakes and the sea carved into it, but
// not rivers: the land sinks under the water where the plan has it wet, and meets its surface
// wherever its own lie brings it there, so shores follow the land's contours
function stillHeight(plan, x, y, still = stillOf(plan, x, y)) {
    let height = landHeight(plan, x, y);

    if (still) {
        const { wetness, level, deep } = still;

        if (wetness > WET_FROM) {
            const sunk = Math.min(height, level - 0.3 - Math.min(1, Math.max(0, wetness - 0.5) * 2.5) * deep);

            height += (sunk - height) * smoothstep(WET_FROM, SUNK_BY, wetness);
        } else if (wetness > 0.05 && wetness < WET_FROM && height < level + 0.3) {
            // (Out past where water can stand, land low enough to flood is held up to its surface)
            height = Math.max(height, level + 0.3 * ((WET_FROM - wetness) / (WET_FROM - 0.05)));
        }
    }

    return height;
}

/**
 * The ground's height at a point (metres, from the world's north-west corner: x east, y south),
 * with lakes, the sea and rivers carved into it: rounded to HEIGHT_STEP.
 */
export function heightAt(plan, x, y) {
    const { waters } = layersOf(plan);
    const still = stillOf(plan, x, y);
    let height = stillHeight(plan, x, y, still);

    // Rivers: the bed below the surface, deepest in the middle (as deep as the river is there),
    // rising across to 0.15 m under it at its edges, levelling out as it meets them (so the bank
    // at the water's edge is gentle, not a step); the banks just above it, easing out to the land
    const river = waters.river(x, y, BANKS.least + BANKS.perHalf * 5);

    if (river) {
        const { gap, half, surface, depth } = river;

        if (gap <= 0) {
            const out = Math.min(1, (half + gap) / half);
            const across = 1 - out * out;
            const bed = surface - 0.15 - (depth - 0.15) * across * across * across;

            // (But never raised up off the floor of a lake or the sea it runs out into)
            height = still && still.wetness > WET_FROM ? Math.min(height, bed) : bed;
        } else {
            const banks = BANKS.least + BANKS.perHalf * half;

            if (gap < banks) {
                // (Rising from the bed's edge, just under the water, to the bank's top, then
                // easing out to the land; but never up out of a lake or the sea it runs into)
                const bank = surface - 0.15 + (BANK_TOP + 0.15) * smoothstep(0, BANK_RISE, gap);
                const eased = bank + (height - bank) * smoothstep(0, banks, gap);

                height = still && still.wetness > WET_FROM ? Math.min(height, eased) : eased;
            }
        }
    }

    return Math.round(height / HEIGHT_STEP) * HEIGHT_STEP;
}

/**
 * The water's surface at a point (metres), given the ground's height there (heightAt), or null
 * where it's dry: a river's in its channel, a lake's or the sea's where the plan has it wet enough
 * and the ground's below it.
 */
export function waterAt(plan, x, y, height) {
    const { waters } = layersOf(plan);
    const river = waters.river(x, y, 0);

    if (river && river.gap <= 0) {
        return river.surface;
    }

    return stillWaterAt(plan, x, y, height);
}

/**
 * A lake's or the sea's surface at a point (metres), given the ground's height there (heightAt;
 * worked out if not given, and only where there's still water near), or null where there's none.
 */
export function stillWaterAt(plan, x, y, height) {
    const level = stillLevelAt(plan, x, y);

    if (level === null) {
        return null;
    }

    return (height ?? heightAt(plan, x, y)) < level ? level : null;
}

/**
 * A lake's or the sea's level at a point (metres) where it's wet enough for it to stand, whatever
 * the ground there, or null where it isn't.
 */
export function stillLevelAt(plan, x, y) {
    const still = stillOf(plan, x, y);

    return still && still.wetness > WET_FROM ? still.level : null;
}

/**
 * How deep the still water's shown at most, or how high dry land over it, from afar (metres:
 * distantHeights' depth)
 */
const SHORE_DEPTH = 4;

/**
 * The land as it's seen from afar (world/far.js), on a grid as heightsOf's: the lie of the land
 * with lakes and the sea carved into it, but not rivers (too narrow to be seen far off), or the
 * still water's surface where it stands over it; into `heights` (metres, not rounded), `water`
 * (1 where it's water, else 0) and `depth` (metres: how deep the water is over the land, up to
 * SHORE_DEPTH; on land, less than 0, as far below it as the nearest still water's surface, down
 * to -SHORE_DEPTH: so that between two points, it's 0 where the shore is).
 */
export function distantHeights(plan, x0, y0, count, step, heights = new Float32Array(count * count), water = new Uint8Array(count * count), depth = new Float32Array(count * count)) {
    for (let j = 0; j < count; j++) {
        for (let i = 0; i < count; i++) {
            const [x, y] = [x0 + i * step, y0 + j * step];
            const still = stillOf(plan, x, y);
            const ground = stillHeight(plan, x, y, still);
            const level = still && still.wetness > WET_FROM ? still.level : -Infinity;
            const k = j * count + i;

            heights[k] = Math.max(ground, level);
            water[k] = level > ground ? 1 : 0;
            depth[k] = water[k] ? Math.min(SHORE_DEPTH, level - ground) : Math.max(-SHORE_DEPTH, Math.min(-0.01, (still ? still.level : -Infinity) - ground));
        }
    }

    return { heights, water, depth };
}

/**
 * The heights on a grid (metres, rounded): `count` × `count` points, `step` metres apart, from
 * (x0, y0), row by row (north to south, each west to east), into `out` (a Float32Array; made if
 * not given).
 */
export function heightsOf(plan, x0, y0, count, step, out = new Float32Array(count * count)) {
    for (let j = 0; j < count; j++) {
        for (let i = 0; i < count; i++) {
            out[j * count + i] = heightAt(plan, x0 + i * step, y0 + j * step);
        }
    }

    return out;
}

/**
 * A square's slope class (SLOPE_CLASS), from the heights at its four corners (metres, a metre
 * apart): north-west, north-east, south-west, south-east.
 */
export function slopeClass(nw, ne, sw, se) {
    const gx = (ne - nw + se - sw) / 2;
    const gy = (sw - nw + se - ne) / 2;
    const tan2 = gx * gx + gy * gy;

    return tan2 >= SLOPE.cliff * SLOPE.cliff ? SLOPE_CLASS.cliff : tan2 >= SLOPE.steep * SLOPE.steep ? SLOPE_CLASS.steep : SLOPE_CLASS.open;
}

/** How big the world is (metres a side). */
export { WORLD_SIZE };

// (Rivers' surfaces keep under the land's own height, and come down to a lake's or the sea's where
// it stands, as it stands before any river's carved: waters.js)
setLandOf(landHeight, (plan, x, y) => stillWaterAt(plan, x, y, stillHeight(plan, x, y)) !== null);
