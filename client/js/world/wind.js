// The wind across the land (the terrain plan's M7j, §9 row 9: "wind gusts"): one way it blows for
// everything that moves in it (the smoke leans, the flags fly, the fires lean, the grass and the
// trees bend that way), and gusts: broad patches of stronger wind travelling downwind over the land,
// changing shape as they go. Where one passes the tall grass and the crops are pressed down and
// lean further, paler as they bend (a wave running through a field), the undergrowth tosses and
// the trees' leaves stir harder and lean with it.
//
// A gust's worked out in the vertex shaders (WIND_GLSL's windGust, from where it is and the
// breeze's time, kits/trees.js TREE_WIND), so nothing's sent each frame; `windGust` here is the
// same, for the tests.
//
// Pure (no three.js).

const unit = (x, z) => Object.freeze([x / Math.sqrt(x * x + z * z), z / Math.sqrt(x * x + z * z)]);

/** The way the wind blows (east and south, a unit). */
export const WIND_WAY = unit(0.5, 0.22);

/**
 * The gusts: patches of stronger wind about `along` metres long downwind and `across` metres wide,
 * travelling downwind at `speed` metres a second and changing shape as they go (by `evolve` of a
 * patch's width a second); a gust's strength (0 to 1) none where the wind's noise is below `from`,
 * full above `to`.
 */
export const GUSTS = Object.freeze({ along: 9, across: 16, speed: 5, evolve: 0.06, from: 0.5, to: 0.8 });

const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

// (A cell's hash, 0 to 1: worked out in whole numbers, 32 bits, so the GPU gives just what this
// does, wherever it is and however long the game's run)
function windHash(x, y) {
    let h = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841)) >>> 0;

    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;

    return (h >>> 8) / 16777216;
}

// (Smooth noise, 0 to 1: the hashes of the four cells round a point, eased between)
function windNoise(x, y) {
    const [ix, iy] = [Math.floor(x), Math.floor(y)];
    const [fx, fy] = [x - ix, y - iy];
    const [ux, uy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
    const a = windHash(ix, iy) + (windHash(ix + 1, iy) - windHash(ix, iy)) * ux;
    const b = windHash(ix, iy + 1) + (windHash(ix + 1, iy + 1) - windHash(ix, iy + 1)) * ux;

    return a + (b - a) * uy;
}

/** How strong the gust is at (x, z) (metres) at `time` (seconds): 0 (none) to 1. */
export function windGust(x, z, time) {
    const along = (x * WIND_WAY[0] + z * WIND_WAY[1] - time * GUSTS.speed) / GUSTS.along;
    const across = (z * WIND_WAY[0] - x * WIND_WAY[1]) / GUSTS.across + time * GUSTS.evolve;
    const noise = 0.7 * windNoise(along, across) + 0.3 * windNoise(along * 2.3 + 17, across * 2.3 + 5);

    return smoothstep(GUSTS.from, GUSTS.to, noise);
}

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** The same in GLSL: `windWay` (vec2) and `windGust(p, time)`, for a shader's vertex functions. */
export const WIND_GLSL = `
const vec2 windWay = vec2(${f(WIND_WAY[0])}, ${f(WIND_WAY[1])});

float windHash(vec2 cell) {
    uvec2 c = uvec2(ivec2(cell));
    uint h = c.x * 0x8da6b343u ^ c.y * 0xd8163841u;
    h = (h ^ (h >> 13u)) * 0x5bd1e995u;
    h ^= h >> 15u;
    return float(h >> 8u) / 16777216.0;
}

float windNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(windHash(i), windHash(i + vec2(1.0, 0.0)), u.x), mix(windHash(i + vec2(0.0, 1.0)), windHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// How strong the gust is at p (metres, x and z) at time (seconds): 0 (none) to 1
float windGust(vec2 p, float time) {
    vec2 q = vec2((dot(p, windWay) - time * ${f(GUSTS.speed)}) / ${f(GUSTS.along)}, dot(p, vec2(-windWay.y, windWay.x)) / ${f(GUSTS.across)} + time * ${f(GUSTS.evolve)});
    float noise = 0.7 * windNoise(q) + 0.3 * windNoise(q * 2.3 + vec2(17.0, 5.0));
    return smoothstep(${f(GUSTS.from)}, ${f(GUSTS.to)}, noise);
}
`;
