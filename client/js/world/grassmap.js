// Where the tall grass grows, how tall and how dry (terrain plan M7b; drawn by grass.js): a map of
// each chunk, a texel to its square metre, worked out from what the world already says of it, so
// the grass is the same every time and in every browser.
// - Only on grass (not road, cobbles, soil or a yard), and not where anything stands, on water or
//   on a bridge; thinner on steep ground, up towards the rock and snow, and in a settlement (kept
//   short there: it's lived in).
// - Gathered round what stands (GRASS_RINGS: thicker and taller in a ring round a rock's, a tree's
//   or a wall's foot, where the scythe and the sheep don't reach); trodden short and yellowed beside
//   a road or a path, thicker and taller a little further off (GRASS_PATHS); drier and golden on
//   the side of a hill that faces the sun, lusher on the shaded side (sun.js).
// - As thick and as tall as its land grows it (GRASS_LANDS): a meadow's thick and knee to waist
//   high, a savannah's tall and golden, the woods' thin and short, none on snow; its lands blended
//   across their cells' edges so no line shows where one meets another.
// - In clumps and stretches (slow noise), lusher, drier or worn to bare earth where the ground's
//   own patches are (ground.js PATCHES: the same noise, read the same way), drier golden where it's
//   dry, greener where it's lush.
//
// - And in the fields (core/fields.js), the crops standing in their strips (CROP_STANDS): wheat
//   and barley waist high and golden, greens low and leafy, as thick as they're sown, all of a
//   height and upright.
//
// Each chunk's: `heights` (its corners' heights, metres, 64 a side: the 65th is the next chunk's
// first), `map` (RGBA bytes, 64 a side: red how thick, green how tall, blue how dry, alpha whether
// it's sown: a crop's) and `tint` (RGB bytes: the colour of the grass's tips there, sRGB).

import { ALONG, CROP } from "../core/fields.js";
import { fractal } from "../core/noise.js";
import { CHUNK, CHUNKS, WET } from "../core/overworld.js";
import { GROUND } from "../core/setpieces/pieces.js";
import { SLOPE_CLASS } from "../core/terrain/height.js";
import { CELL } from "../core/worldplan/plan.js";
import { LOOKS } from "./art/kits/wilds.js";
import { ALPINE, CROP_COLOURS, PATCHES, patchNoise } from "./ground.js";
import { facingSun } from "./sun.js";

/**
 * How each land grows its tall grass: how thick at its thickest (0 to 1), how tall (metres: its
 * shortest stretches and its tallest), and how dry (0 green to 1 golden straw, where its patches
 * don't say otherwise). Lands not here grow none.
 */
export const GRASS_LANDS = Object.freeze({
    meadow: { density: 0.9, height: [0.4, 1.05], dry: 0.3 },
    farmland: { density: 0.65, height: [0.35, 0.9], dry: 0.35 },
    woods: { density: 0.35, height: [0.3, 0.7], dry: 0.12 },
    heath: { density: 0.75, height: [0.3, 0.75], dry: 0.6 },
    marsh: { density: 0.8, height: [0.55, 1.3], dry: 0.18 },
    elfwood: { density: 0.45, height: [0.35, 0.85], dry: 0.05 },
    darkwood: { density: 0.25, height: [0.3, 0.6], dry: 0.2 },
    savannah: { density: 0.95, height: [0.6, 1.4], dry: 0.85 },
    jungle: { density: 0.6, height: [0.5, 1.1], dry: 0 },
    badlands: { density: 0.25, height: [0.25, 0.6], dry: 0.9 },
    volcanic: { density: 0.08, height: [0.2, 0.45], dry: 0.8 },
    tundra: { density: 0.35, height: [0.2, 0.45], dry: 0.5 },
    mountain: { density: 0.4, height: [0.25, 0.6], dry: 0.45 },
    beach: { density: 0.2, height: [0.35, 0.8], dry: 0.6 },
});

// Dry grass's colour at its tips (sRGB): golden straw
const STRAW = [0xd6, 0xb2, 0x58];

/**
 * The crops standing in the fields (core/fields.js CROP's; ploughed strips none): how tall
 * (metres: its shortest stretches and its tallest) and how dry (as the grass's, 0 to 1); their
 * colour the ground's under them (ground.js CROP_COLOURS).
 */
export const CROP_STANDS = Object.freeze({
    [CROP.wheat]: { height: [0.85, 1.05], dry: 0.95 },
    [CROP.barley]: { height: [0.65, 0.8], dry: 0.8 },
    [CROP.greens]: { height: [0.3, 0.42], dry: 0 },
});

/**
 * How the grass thins: on steep ground (this much of it left; none on a cliff), in a settlement
 * (this much of it, and this much as tall); and how slow its clumps' and its tall and short
 * stretches' noise is (metres).
 */
export const GRASS_THINS = Object.freeze({ steep: 0.35, settled: [0.25, 0.45], clumps: 13, stretches: 70 });

/**
 * Round what stands on the land (a rock, a tree, a wall: what can't be seen through, or is built),
 * out to `reach` metres from its squares (full to `full`): as much thicker and taller.
 */
export const GRASS_RINGS = Object.freeze({ full: 0.9, reach: 2.2, thicker: 0.8, taller: 0.3 });

/**
 * Beside a road or a path (metres from its squares): trodden (to `trodden[1]`, all of it to
 * `trodden[0]`) as much shorter, thinner and drier; then up to `edge` metres off, as much thicker
 * and taller (the verge nobody walks or mows).
 */
export const GRASS_PATHS = Object.freeze({ trodden: [0.9, 2.1], shorter: 0.65, thinner: 0.35, drier: 0.35, edge: [1.6, 2.6, 4, 5.5], thicker: 0.45, taller: 0.25 });

/** How much drier (and thinner) on the sunny side of a slope, and lusher on the shaded side, for its fall towards the sun (sun.js). */
export const GRASS_SUN = Object.freeze({ by: 3, most: 0.35 });

// How far round a chunk distances are worked out (squares): further than any rule reaches
const MARGIN = 6;
const DIAGONAL = Math.SQRT2;

// The distance (metres) from each square of a window to the nearest of those marked in `from`
// (bytes), up to MARGIN (two passes of an eight-way chamfer: near enough a true distance at this
// reach)
function distances(side, from) {
    const far = MARGIN + 1;
    const d = new Float32Array(side * side).map((_, k) => (from[k] ? 0 : far));
    const at = (i, j) => (i < 0 || j < 0 || i >= side || j >= side ? far : d[j * side + i]);

    for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
            d[j * side + i] = Math.min(d[j * side + i], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + DIAGONAL, at(i + 1, j - 1) + DIAGONAL);
        }
    }

    for (let j = side - 1; j >= 0; j--) {
        for (let i = side - 1; i >= 0; i--) {
            d[j * side + i] = Math.min(d[j * side + i], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + DIAGONAL, at(i - 1, j + 1) + DIAGONAL);
        }
    }

    return d;
}

// The ground a road or a path is (a street's cobbles, a bridge's planks)
const WAYS = new Set([GROUND.road, GROUND.cobbles, GROUND.planks]);

const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

// (The ground's patches' noise as ground.js draws it: read bilinearly, tiling)
let patches = null;
const PATCH_TEXELS = 128;

function patchAt(x, y, metres, offset = [0, 0]) {
    patches ??= patchNoise(PATCH_TEXELS);

    const [u, v] = [(x / metres + offset[0]) * PATCH_TEXELS - 0.5, (y / metres + offset[1]) * PATCH_TEXELS - 0.5];
    const [i, j] = [Math.floor(u), Math.floor(v)];
    const [s, t] = [u - i, v - j];
    const at = (a, b, channel) => patches[((((b % PATCH_TEXELS) + PATCH_TEXELS) % PATCH_TEXELS) * PATCH_TEXELS + (((a % PATCH_TEXELS) + PATCH_TEXELS) % PATCH_TEXELS)) * 4 + channel] / 255;

    return [0, 1, 2, 3].map((c) => {
        const top = at(i, j, c) + (at(i + 1, j, c) - at(i, j, c)) * s;
        const bottom = at(i, j + 1, c) + (at(i + 1, j + 1, c) - at(i, j + 1, c)) * s;

        return top + (bottom - top) * t;
    });
}

// A land's grass where it's at its own (density, height, dryness, its tips' colour: sRGB 0 to 255)
function landGrass(land) {
    const grass = GRASS_LANDS[land];
    const tip = (LOOKS[land] ?? LOOKS.meadow).grass[1];

    return grass ? [grass.density, grass.height[0], grass.height[1], grass.dry, (tip >> 16) & 255, (tip >> 8) & 255, tip & 255] : [0, 0, 0, 0, 0, 0, 0];
}

/**
 * A chunk's grass map (as above), from the overworld (core/overworld.js) and its chunk there
 * (chunk.x0, chunk.y0 its corner).
 */
export function grassMap(overworld, chunk) {
    const steps = grassMapping(overworld, chunk);
    let step = steps.next();

    while (!step.done) {
        step = steps.next();
    }

    return step.value;
}

/** grassMap's, a step at a time: `rows` rows a step (each a yield), returning the map. */
export function* grassMapping(overworld, chunk, rows = CHUNK) {
    const { x0, y0 } = chunk;
    const seed = overworld.plan.seed;
    const heights = new Float32Array(CHUNK * CHUNK);
    const map = new Uint8Array(CHUNK * CHUNK * 4);
    const tint = new Uint8Array(CHUNK * CHUNK * 4);
    // (Each land's grass at the cells' middles round the chunk, blended between them)
    const lands = new Map();
    const cellGrass = (i, j) => {
        const key = j * 4096 + i;

        if (!lands.has(key)) {
            lands.set(key, landGrass(overworld.biomeAt(Math.min(8191, Math.max(0, i * CELL + CELL / 2)), Math.min(8191, Math.max(0, j * CELL + CELL / 2)))));
        }

        return lands.get(key);
    };
    const blended = (x, y) => {
        const [u, v] = [x / CELL - 0.5, y / CELL - 0.5];
        const [i, j] = [Math.floor(u), Math.floor(v)];
        const [s, t] = [u - i, v - j];
        const [a, b, c, d] = [cellGrass(i, j), cellGrass(i + 1, j), cellGrass(i, j + 1), cellGrass(i + 1, j + 1)];

        return a.map((value, k) => value * (1 - s) * (1 - t) + b[k] * s * (1 - t) + c[k] * (1 - s) * t + d[k] * s * t);
    };
    // (How far each square is from a road or a path, and from what stands: worked out over the
    // chunk and MARGIN round it, from its neighbours as they've been made, so the rings and bands
    // carry on across its edges)
    const side = CHUNK + 2 * MARGIN;
    const way = new Uint8Array(side * side);
    const standing = new Uint8Array(side * side);

    for (let wj = 0; wj < side; wj++) {
        const y = y0 + wj - MARGIN;
        let there = null;
        let [cx, cy] = [NaN, NaN];

        for (let wi = 0; wi < side; wi++) {
            const x = x0 + wi - MARGIN;

            if (Math.floor(x / CHUNK) !== cx || Math.floor(y / CHUNK) !== cy) {
                [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
                there = cx === chunk.cx && cy === chunk.cy ? chunk : (overworld.chunks?.get(cy * CHUNKS + cx) ?? null);
            }

            if (there) {
                const at = (y - there.y0) * CHUNK + (x - there.x0);

                way[wj * side + wi] = WAYS.has(there.ground[at]) ? 1 : 0;
                standing[wj * side + wi] = there.opaque[at] || there.solid?.[at] ? 1 : 0;
            }
        }
    }

    const toWay = distances(side, way);
    const toStanding = distances(side, standing);

    yield;

    for (let j = 0; j < CHUNK; j++) {
        if (j > 0 && j % rows === 0) {
            yield;
        }

        for (let i = 0; i < CHUNK; i++) {
            const k = j * CHUNK + i;
            const [x, y] = [x0 + i, y0 + j];
            const height = chunk.heights[j * (CHUNK + 1) + i];

            heights[k] = height;

            if (chunk.blocked[k] || chunk.water[k] !== WET.none || chunk.bridge[k]) {
                continue;
            }

            // (A crop, standing in its strip, as thick as it's sown and all of a height)
            const stand = chunk.ground[k] === GROUND.soil ? CROP_STANDS[(chunk.crops?.[k] ?? 0) % ALONG] : null;

            if (stand) {
                const colour = CROP_COLOURS[chunk.crops[k] % ALONG];
                const tall = stand.height[0] + (stand.height[1] - stand.height[0]) * fractal(x, y, GRASS_THINS.clumps, seed * 37 + 13, 2);

                map[k * 4] = 255;
                map[k * 4 + 1] = Math.round((tall / 2) * 255);
                map[k * 4 + 2] = Math.round(stand.dry * 255);
                map[k * 4 + 3] = 255;
                tint.set([(colour >> 16) & 255, (colour >> 8) & 255, colour & 255, 255], k * 4);
                continue;
            }

            // (None through a hedgerow: kits/hedges.js)
            if (chunk.ground[k] !== GROUND.grass || overworld.hedgeAt?.(x, y)) {
                continue;
            }

            const [thick, short, tall, dryness, r, g, b] = blended(x + 0.5, y + 0.5);

            if (thick <= 0) {
                continue;
            }

            // (The ground's own patches, read as ground.js reads them)
            const coarse = patchAt(x + 0.5, y + 0.5, PATCHES.coarse);
            const fine = patchAt(x + 0.5, y + 0.5, PATCHES.fine, [0.37, 0.71]);
            const dry = smoothstep(PATCHES.dry[0], PATCHES.dry[1], coarse[0] * 0.75 + fine[3] * 0.25);
            const lush = smoothstep(PATCHES.lush[0], PATCHES.lush[1], coarse[1] * 0.75 + fine[0] * 0.25) * (1 - dry);
            const bare = smoothstep(PATCHES.bare[0], PATCHES.bare[1], fine[2] * 0.75 + coarse[2] * 0.25);
            // (Its clumps, and its tall and short stretches)
            const clumps = smoothstep(0.3, 0.62, fractal(x, y, GRASS_THINS.clumps, seed * 37 + 11, 2));
            const stretch = fractal(x, y, GRASS_THINS.stretches, seed * 37 + 12, 2);
            // (Thinner on steep ground and up towards the rock and snow)
            const slope = chunk.slopes[k];
            const alpine = smoothstep(ALPINE.rock[0], ALPINE.rock[1], height + (coarse[2] - 0.5) * 2 * ALPINE.wander);
            const settled = overworld.settled(x, y);
            let density = thick * (0.35 + 0.65 * clumps) * (1 - 0.95 * bare) * (1 + 0.25 * lush) * (1 - alpine);

            density *= slope === SLOPE_CLASS.cliff ? 0 : slope === SLOPE_CLASS.steep ? GRASS_THINS.steep : 1;
            density *= settled ? GRASS_THINS.settled[0] : 1;

            // (Gathered round what stands; trodden beside a way, thick at its verge; drier facing the sun)
            const w = (j + MARGIN) * side + i + MARGIN;
            const ring = 1 - smoothstep(GRASS_RINGS.full, GRASS_RINGS.reach, toStanding[w]);
            const trodden = 1 - smoothstep(GRASS_PATHS.trodden[0], GRASS_PATHS.trodden[1], toWay[w]);
            const edge = smoothstep(GRASS_PATHS.edge[0], GRASS_PATHS.edge[1], toWay[w]) * (1 - smoothstep(GRASS_PATHS.edge[2], GRASS_PATHS.edge[3], toWay[w]));
            const sunny = Math.min(1, Math.max(-1, facingSun(chunk.heights, i, j) * GRASS_SUN.by)) * GRASS_SUN.most;

            density *= (1 + GRASS_RINGS.thicker * ring) * (1 - GRASS_PATHS.thinner * trodden) * (1 + GRASS_PATHS.thicker * edge) * (1 - 0.5 * Math.max(0, sunny));

            const tallness = Math.min(1, Math.max(0, stretch * 1.25 - 0.1 + 0.2 * lush - 0.15 * dry));
            const metres = (short + (tall - short) * tallness) * (settled ? GRASS_THINS.settled[1] : 1) * (1 + GRASS_RINGS.taller * ring) * (1 - GRASS_PATHS.shorter * trodden) * (1 + GRASS_PATHS.taller * edge);
            const dried = Math.min(1, Math.max(0, dryness + 0.65 * dry - 0.35 * lush + GRASS_PATHS.drier * trodden + sunny));

            map[k * 4] = Math.round(Math.min(1, density) * 255);
            // (Up to 2 m tall)
            map[k * 4 + 1] = Math.round(Math.min(1, metres / 2) * 255);
            map[k * 4 + 2] = Math.round(dried * 255);
            tint[k * 4] = Math.round(r + (STRAW[0] - r) * dried);
            tint[k * 4 + 1] = Math.round(g + (STRAW[1] - g) * dried);
            tint[k * 4 + 2] = Math.round(b + (STRAW[2] - b) * dried);
            tint[k * 4 + 3] = 255;
        }
    }

    return { heights, map, tint };
}
