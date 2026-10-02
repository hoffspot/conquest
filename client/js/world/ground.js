// The ground under the world: one flat mesh covering the map, its colour blended from tiling
// textures (grass, road, cobbles, soil, courtyard earth) by a "splat" texture made from the
// world's ground plan, square by square, with soft, ragged edges between them. The grass isn't the
// same everywhere: patches of it are drier and straw-coloured, others lusher and darker, and here
// and there it's worn to bare earth (from a small texture of noise, read at large scales). In the
// fields (core/fields.js), each strip's furrows run along it, and its crop colours it.
//
// Blending tiling textures in the shader keeps the ground sharp close up for one draw call, where
// one painted texture of the whole map would have to be huge (or blurry).

import * as THREE from "three";
import { ALONG, CROP, CROP_ODDS, FIELDS, NARROWEST, sown } from "../core/fields.js";
import { tiling } from "../core/noise.js";
import { CHUNK } from "../core/overworld.js";
import { GROUND } from "../core/setpieces/pieces.js";
import { allAtOnce } from "../core/steps.js";
import { BIOMES, CELL, CELLS, WORLD_SIZE } from "../core/worldplan/plan.js";
import { RACES } from "../core/worldplan/races.js";
import { paintLayer, SIZE } from "./art/engine/painters.js";
import { textureCanvas } from "./art/engine/materials.js";
import { blurred } from "./fields.js";
import { splitAlong } from "./far/levels.js";
import { FAR_FOG } from "./fog.js";
import { causticTexture, FIELD, SHORE, WATER_DETAIL } from "./water.js";
import { TREE_WIND } from "./art/kits/trees.js";

// Splat texels per metre (edges are shaped at this resolution)
const SPLAT_RESOLUTION = 4;

// How many rows of texels splatting makes a step
const SPLAT_ROWS = 32;

// The grass beside a road worn to the road's dirt: up to this much of it in the eight squares
// round it, half as much a square further off (raggedly: as the edges' noise has it)
const WORN = 0.55;

// The kinds of ground blended over the grass, in the splat's red, green, blue and alpha, and
// how many metres one copy of each texture covers (cobbles about 16 cm across, a road's pebbles a
// few centimetres, furrows half a metre apart)
const LAYERS = [
    [GROUND.road, "road", 4],
    [GROUND.cobbles, "cobbles", 1.6],
    [GROUND.soil, "soil", 4],
    [GROUND.courtyard, "courtyard", 4],
];

const GRASS_METRES = 5;

// Rock, where the ground's too steep for grass to hold: how many metres one copy of its texture
// covers, and how steep (the up of the ground's slope: 1 flat, 0 sheer) it starts and is all rock
// (and, at the water, where it's rock all the same: steeper than a bank)
const ROCK_METRES = 7;
const ROCK_FROM = Object.freeze({ start: 0.84, all: 0.7, sheer: 0.45 });

/**
 * Rock close by: its picture again, `metres` a copy (four times finer than ROCK_METRES) and
 * turned, its light and shade laid over the coarser copies (by as much as `strength`) where they'd
 * blur, fully within `near` metres of the camera and fading out by `far`.
 */
export const ROCK_DETAIL = Object.freeze({ metres: 1.7, near: 8, far: 28, strength: 0.65 });

/**
 * Up high, the grass gives way to rock, then snow: rock reaching onto gentler slopes from `rock[0]`
 * to `rock[1]` metres up (its slopes `by` gentler, at the top), and snow lying on what isn't too
 * steep (the up of its slope: `flat[0]` none, `flat[1]` all) from `snow[0]` to `snow[1]` metres
 * up; both lines wandering up and down by as much as `wander` metres. Never snow on ash (the
 * volcano's dark lands: their colour darker than `ash`, in light's terms). The snow's colour
 * (sRGB, lit as the grass's picture is).
 */
export const ALPINE = Object.freeze({ rock: [130, 220], by: 0.12, snow: [205, 245], wander: 30, flat: [0.62, 0.8], ash: 0.1, colour: "#c8ccd2" });

/**
 * The tall grass round the player (grass.js), for the ground under it: its map and its tips'
 * colours (textures 256 texels a side, a texel a metre, wrapping), where the player is (x, z
 * metres), and how far from them it's drawn (metres: 0 while there's none). Under thick grass the
 * ground's darker and the grass's own colour, so it's a field, not blades on a lawn.
 */
export const TALL_GRASS_TEXELS = 256;

export const GRASS_UNDER = Object.freeze({ map: { value: null }, tint: { value: null }, focus: { value: new THREE.Vector2() }, reach: { value: 0 } });

/**
 * The crops' colours in the fields (core/fields.js CROP's; sRGB): the ground under a sown strip is
 * its crop's colour, its furrows showing through (the crop standing in it is the tall grass's:
 * grassmap.js; this is what's seen of it far off, and on low, where that isn't drawn).
 */
export const CROP_COLOURS = Object.freeze({ [CROP.wheat]: 0xc9a046, [CROP.barley]: 0xc8b882, [CROP.greens]: 0x4c7a32 });

/** Dry grass's colour at its tips (sRGB): golden straw (the tall grass's: grassmap.js). */
export const STRAW = Object.freeze([0xd6, 0xb2, 0x58]);

/**
 * The tall grass as it's seen past where it's drawn, and on low quality where it isn't (terrain
 * plan M7b): the ground takes its land's grass (landColours' `grass`: its tips' colour, dried as
 * the land is, and how thick it grows), in clumps, none where it's worn bare or up in the rock; as
 * much as `amount` where it's thick (`thick` times its thickness, at most 1), as bright as
 * `bright` of its tips' colour (blades' bases and the shadows among them darken it: about as dark
 * as the tall grass drawn is, so where one gives way to the other no edge shows), lighter and
 * darker as the grass's picture is, `detail` times more so (a power), so it isn't a flat colour.
 */
export const GRASS_AFAR = Object.freeze({ amount: 0.95, bright: 0.3, thick: 2.2, detail: 1.6 });

/**
 * The fields as they're seen from afar (FIELDS_GLSL): where the chunks' ground turns to the
 * ground as it's seen from afar, and in the far land, each strip its crop's colour, past
 * `hedges` metres the hedges and verges along the blocks' edges a dark band (nearer, the hedges
 * themselves are drawn: kits/hedges.js), the baulks between strips left out past `baulks` (a
 * metre of grass there is less than a pixel). FAR_FIELDS: 1 to draw them (the quality's `fields`).
 */
export const FIELDS_AFAR = Object.freeze({ hedges: 300, baulks: 250, hedge: "#28401c" });
export const FAR_FIELDS = { value: 1 };

/**
 * The fields worked out on the GPU just as core/fields.js fieldAt works them out (its integer
 * hashing the same in 32-bit unsigned maths; its numbers, FIELDS and CROP_ODDS, written in):
 * `int cropAt(vec2 at, bool baulks, bool hedges)`, a point's crop (CROP's; 0 none, -1 a hedge's
 * band where `hedges`), from `fieldSeed` (the world's seed) and the farmland (whether each of the
 * plan's cells is: a block's farmed if its middle's cell is), read by the shader it's in through
 * `ivec2 farmSize()` (how many cells across and down) and `float farmAt(ivec2 cell)` (over 0.5 for
 * farmland).
 */
export const FIELDS_GLSL = (() => {
    const odds = [];
    let total = 0;

    for (const [crop, chance] of CROP_ODDS) {
        total += chance;
        odds.push(`if (odds < ${total}) return ${crop};`);
    }

    return `uint fieldHash(int a, int b, int c) {
    uint h = uint(a) * 374761393u + uint(b) * 668265263u + uint(c) * 1274126177u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = (h ^ (h >> 16u)) * 2246822519u;
    return h ^ (h >> 15u);
}
int fieldEdge(int k, int axis) {
    return k * ${FIELDS.block} + int(fieldHash(k, axis, fieldSeed + 71) % ${2 * FIELDS.jitter + 1}u) - ${FIELDS.jitter};
}
ivec3 fieldBlock(int v, int axis) {
    int k = int(floor(float(v) / ${FIELDS.block.toFixed(1)}));
    if (v < fieldEdge(k, axis)) { k -= 1; } else if (v >= fieldEdge(k + 1, axis)) { k += 1; }
    return ivec3(k, fieldEdge(k, axis), fieldEdge(k + 1, axis));
}
const int FIELD_STRIPS[${FIELDS.strips.length}] = int[${FIELDS.strips.length}](${FIELDS.strips.join(", ")});
int cropAt(vec2 at, bool baulks, bool hedges) {
    ivec2 p = ivec2(floor(at));
    ivec3 bx = fieldBlock(p.x, 0);
    ivec3 by = fieldBlock(p.y, 1);
    ivec2 middle = ivec2(floor(vec2(bx.y + bx.z, by.y + by.z) * 0.5));
    ivec2 cell = clamp(ivec2(floor(vec2(middle) / ${CELL.toFixed(1)})), ivec2(0), farmSize() - 1);
    if (farmAt(cell) < 0.5) return 0;
    uint h = fieldHash(bx.x, by.x, fieldSeed + 73);
    int along = int((h >> 7u) & 1u);
    bool verge = p.x - bx.y < ${FIELDS.margin} || bx.z - 1 - p.x < ${FIELDS.margin} || p.y - by.y < ${FIELDS.margin} || by.z - 1 - p.y < ${FIELDS.margin};
    if (verge) return hedges ? -1 : 0;
    if (int(h % 100u) < ${Math.ceil(FIELDS.pasture * 100)}) return 0;
    int width = FIELD_STRIPS[int((h >> 9u) % ${FIELDS.strips.length}u)];
    int span = width + ${FIELDS.baulk};
    int across = along == 0 ? p.y - by.y - ${FIELDS.margin} : p.x - bx.y - ${FIELDS.margin};
    int room = (along == 0 ? by.z - by.y : bx.z - bx.y) - ${2 * FIELDS.margin};
    int strip = across / span;
    if ((baulks && across - strip * span >= width) || room - strip * span < ${NARROWEST}) return 0;
    int odds = int(fieldHash(bx.x * 131 + strip, by.x, fieldSeed + 79) % 100u);
    ${odds.join("\n    ")}
    return ${CROP.fallow};
}`;
})();

// How far the ground carries on past the map's edges (metres): into the fog
const BEYOND = 110;

// A much larger copy of the grass texture shades everything a little lighter or darker, so the
// repeats don't show from afar
const VARIATION_METRES = 37;

// Near what stands on the ground (a house, a wall, a rock, a trunk: the squares that can't be
// seen through), less of the sky reaches it, so the ground's darker there, the more so the more
// stands round: at a wall's foot about half the sky's hidden, and still a third a couple of
// metres out, where a lone trunk hides next to none. So everything standing sits on the ground,
// in the shade and past the sun's shadows (view.js). How far round what stands is felt (squares:
// a blur's reach across and along, twice over), and how much of the sky's light is lost where
// it's all round; and the squares round a chunk looked at with it
const CONTACT = Object.freeze({ reach: 3, loss: 0.9 });
const CONTACT_MARGIN = 7;

/**
 * Each land's colour over the grass (sRGB, lit as the grass's picture is), and how much of it (0
 * the grass as it is, 1 all of it): pale gold savannah, grey stony mountains, white snow.
 */
export const LAND_COLOURS = Object.freeze({
    sea: ["#8a7a5c", 0.8],
    lake: ["#7a7052", 0.8],
    beach: ["#d2c08a", 0.9],
    farmland: ["#7d8a3e", 0.2],
    meadow: ["#6a8a3c", 0],
    woods: ["#4f6a2e", 0.35],
    heath: ["#7a6a44", 0.55],
    marsh: ["#56613a", 0.5],
    elfwood: ["#4c8a44", 0.4],
    darkwood: ["#343d2c", 0.6],
    savannah: ["#b09a52", 0.75],
    jungle: ["#3d6e2a", 0.45],
    badlands: ["#9a6440", 0.85],
    volcanic: ["#3e3632", 0.9],
    tundra: ["#8a9280", 0.6],
    snow: ["#e4e8ec", 0.92],
    mountain: ["#807a72", 0.8],
});

// How far the edges between lands wander (metres), so the plan's cells don't show
const LAND_WANDER = 26;

// Ground by water: how much darker wet ground is, and how far up from the water's edge it's wet
// (metres)
const WET = { darker: 0.38, up: 1.2 };

// Caustics on a riverbed or a lake's: how big their cells are (a picture to 1/scale metres), how
// bright, and how fast they fade with depth (a metre)
const CAUSTICS = { scale: 0.4, bright: 0.85, fade: 0.8 };

/**
 * The ground as it's seen from afar (the far land, world/far/far.js): its textures, which tile every
 * few metres, each its average colour (a pattern, not a texture, from afar), and only what's large
 * (the lands, the homelands, the patches, rock) on them. The chunks' ground turns to it from
 * `from` to `to` metres in front of the camera (under the far haze: fog.js), so where it meets the
 * far land no seam shows. Still water afar (`water`: sRGB), deep under the haze; and how much less
 * steep the far land's ground has to be to show rock (its corners metres apart smooth its slopes).
 */
export const FAR_GROUND = Object.freeze({ from: 100, to: 150, water: "#30505c", rock: 0.06 });

/**
 * The peoples whose homelands (the world plan's territories) have ground of their own, painted
 * as materials "home-<people>" (painters.js): the cat folk's gold grass and red earth, the orcs'
 * cracked red clay, the lizard folk's black mire, the elves' moss and clover, the dark elves'
 * leaf litter. In this order in the home maps' channels (the first four in one, the rest in
 * another) and the home layers.
 */
export const HOMES = Object.freeze(["cat", "orc", "lizard", "elf", "darkElf"]);

// How many metres one copy of a homeland's ground covers, and how much of it shows over the
// grass (where the homeland's all round)
const HOME_METRES = 6;
const HOME_AMOUNT = 0.9;

// The lands no homeland's ground is laid under (the water's own bed shows)
const UNDER_WATER = new Set(["sea", "lake"]);

/**
 * The grass's patches: how many metres one copy of the noise covers, read coarse (the patches) and
 * fine (their ragged edges, and bare earth); how much of each there is (the noise's value where it
 * starts to show and where it's all there); and how strongly each shows.
 */
export const PATCHES = Object.freeze({
    coarse: 170,
    fine: 43,
    dry: [0.5, 0.66, 0.7],
    lush: [0.54, 0.7, 0.55],
    bare: [0.645, 0.715, 0.8],
});

// The patches' noise: texels a side, and lattice cells a side of its coarsest octave
const PATCH_TEXELS = 128;
const PATCH_CELLS = 8;

// A pseudo-random value from 0 to 1 for a point (for the edges' raggedness)
function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth noise from 0 to 1, varying over about `scale` texels
function edgeNoise(x, y, scale) {
    const gx = x / scale;
    const gy = y / scale;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * sx;
    const bottom = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * sx;

    return top + (bottom - top) * sy;
}

/** The splat texture: for each texel, how much of each layer's ground is there (0 to 255). */
export function splatData(world, resolution = SPLAT_RESOLUTION) {
    const { width, height, ground } = world;

    return splatOf((x, y) => ground[y]?.[x], [0, 0, width, height], resolution);
}

/**
 * The splat texture for part of a map, `area` [x0, y0, width, height] (squares), each square's
 * ground `kindAt(x, y)` (grass off the map): { data, width, height (texels), any (whether any
 * layer's ground is in it at all) }. Its edges' raggedness is the same wherever it's cut, so
 * the parts of a map that meet match.
 */
export function splatOf(kindAt, area, resolution) {
    return allAtOnce(splatting(kindAt, area, resolution));
}

/** The same (splatOf), made a step at a time (each a yield: the squares' kinds, then a few rows of texels), returning it. */
export function* splatting(kindAt, [x0, y0, width, height], resolution = SPLAT_RESOLUTION) {
    const w = width * resolution;
    const h = height * resolution;
    const data = new Uint8Array(w * h * 4);
    const layerOf = new Int8Array(16).fill(-1);
    const amounts = new Float32Array(LAYERS.length);

    LAYERS.forEach(([kind], layer) => (layerOf[kind] = layer));

    // Each square's layer (-1 for none), three squares further round, for the blend at the edges
    // (and how worn the squares one further round are)
    const across = width + 6;
    const kinds = new Int8Array(across * (height + 6));
    let any = false;

    for (let j = 0; j < height + 6; j++) {
        for (let i = 0; i < across; i++) {
            const layer = layerOf[kindAt(x0 + i - 3, y0 + j - 3) ?? GROUND.grass];

            kinds[j * across + i] = layer;
            any ||= layer >= 0;
        }
    }

    if (!any) {
        return { data, width: w, height: h, any };
    }

    const layerAt = (i, j) => kinds[(j + 3) * across + i + 3];
    // (How worn each square of grass is: 2 right beside a road, 1 a square further off, else 0;
    // the same wherever the map's cut)
    const worn = new Uint8Array(across * (height + 6));

    for (let j = 2; j < height + 4; j++) {
        for (let i = 2; i < across - 2; i++) {
            const k = j * across + i;

            if (kinds[k] >= 0) {
                continue;
            }

            for (let dy = -2; dy <= 2 && worn[k] < 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    if (kinds[k + dy * across + dx] === 0) {
                        worn[k] = Math.max(worn[k], Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? 2 : 1);
                    }
                }
            }
        }
    }

    const wornAt = (i, j) => worn[(j + 3) * across + i + 3] / 2;

    for (let j = 0; j < h; j++) {
        if (j % SPLAT_ROWS === 0) {
            yield;
        }

        // Blend the four squares round each texel by how near their middles are
        const fy = (j + 0.5) / resolution - 0.5;
        const y = Math.floor(fy);
        const ty = fy - y;

        for (let i = 0; i < w; i++) {
            const fx = (i + 0.5) / resolution - 0.5;
            const x = Math.floor(fx);
            const tx = fx - x;
            // (Its four corners' layers, and each weighed in: in locals, not arrays, as this is
            // done for every texel of every chunk)
            const c0 = layerAt(x, y);
            const c1 = layerAt(x + 1, y);
            const c2 = layerAt(x, y + 1);
            const c3 = layerAt(x + 1, y + 1);

            // (Worn to dirt beside a road)
            const wear = WORN * ((1 - tx) * (1 - ty) * wornAt(x, y) + tx * (1 - ty) * wornAt(x + 1, y) + (1 - tx) * ty * wornAt(x, y + 1) + tx * ty * wornAt(x + 1, y + 1));

            if (c0 < 0 && c1 < 0 && c2 < 0 && c3 < 0 && wear === 0) {
                continue;
            }

            amounts.fill(0);

            if (c0 >= 0) {
                amounts[c0] += (1 - tx) * (1 - ty);
            }

            if (c1 >= 0) {
                amounts[c1] += tx * (1 - ty);
            }

            if (c2 >= 0) {
                amounts[c2] += (1 - tx) * ty;
            }

            if (c3 >= 0) {
                amounts[c3] += tx * ty;
            }

            // Ragged edges: noise moves where each edge falls (the same wherever the map's cut)
            const noise = edgeNoise(i + x0 * resolution, j + y0 * resolution, resolution * 1.5) - 0.5;

            for (let layer = 0; layer < LAYERS.length; layer++) {
                if (amounts[layer] > 0) {
                    const t = Math.max(0, Math.min(1, (amounts[layer] + noise * 0.5 - 0.35) / 0.3));

                    data[(j * w + i) * 4 + layer] = Math.round(t * t * (3 - 2 * t) * 255);
                }
            }

            if (wear > 0) {
                data[(j * w + i) * 4] = Math.max(data[(j * w + i) * 4], Math.round(Math.max(0, Math.min(1, wear * (0.6 + noise * 1.2))) * 255));
            }
        }
    }

    return { data, width: w, height: h, any };
}

/**
 * Where each of the ground's tiling textures is in the one texture array they're read from: the
 * grass, the kinds of ground blended over it (LAYERS, in order), and the rock. One array, so the
 * ground's shader reads them all through one sampler: a phone's GPU lets a shader read only so many
 * textures (an iPhone's 16), and the ground reads many.
 */
export const TILE = Object.freeze({ grass: 0, layers: 1, rock: 1 + LAYERS.length });

// A tiling ground texture's picture, and how many metres one copy covers
function tileOf(name, size) {
    return { canvas: textureCanvas(name).canvas, size };
}

// Pictures of a size as one texture array, tiling, mipmapped (each picture upside down, as a
// canvas's is when it's sent to the GPU on its own: the ground as it was when each was a texture)
function tileArray(canvases) {
    const [width, height] = [canvases[0].width, canvases[0].height];
    const data = new Uint8Array(width * height * 4 * canvases.length);

    canvases.forEach((canvas, k) => {
        const pixels = canvas.getContext("2d").getImageData(0, 0, width, height).data;

        for (let j = 0; j < height; j++) {
            data.set(pixels.subarray((height - 1 - j) * width * 4, (height - j) * width * 4), (k * height + j) * width * 4);
        }
    });

    const texture = new THREE.DataArrayTexture(data, width, height, canvases.length);

    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;

    return texture;
}

// The ground's tiling textures, made once (and the grass's average brightness, in linear light)
let tiles = null;

function groundTiles() {
    if (!tiles) {
        const grass = tileOf("grass", GRASS_METRES);
        const pixels = grass.canvas.getContext("2d").getImageData(0, 0, grass.canvas.width, grass.canvas.height).data;
        const linear = (value) => ((value / 255 + 0.055) / 1.055) ** 2.4;
        let [sum, green] = [0, 0];

        for (let k = 0; k < pixels.length; k += 4) {
            sum += 0.2126 * linear(pixels[k]) + 0.7152 * linear(pixels[k + 1]) + 0.0722 * linear(pixels[k + 2]);
            green += linear(pixels[k + 1]);
        }

        // (And its green on average: how its larger copy shades the ground, on average)
        const layers = LAYERS.map(([, name, size]) => tileOf(name, size));
        const rock = tileOf("rock", ROCK_METRES);

        tiles = { grass, brightness: sum / (pixels.length / 4), variation: green / (pixels.length / 4), layers, rock, array: tileArray([grass, ...layers, rock].map(({ canvas }) => canvas)) };
    }

    return tiles;
}

/**
 * The grass's patches' noise, tiling: RGBA bytes PATCH_TEXELS square, each channel noise of its
 * own (red: dry grass, green: lush, blue: bare earth, alpha: the patches' ragged edges).
 */
export function patchNoise(texels = PATCH_TEXELS) {
    const data = new Uint8Array(texels * texels * 4);

    for (let y = 0; y < texels; y++) {
        for (let x = 0; x < texels; x++) {
            const [u, v] = [(x / texels) * PATCH_CELLS, (y / texels) * PATCH_CELLS];

            for (let channel = 0; channel < 4; channel++) {
                data[(y * texels + x) * 4 + channel] = Math.round(tiling(u, v, PATCH_CELLS, 101 + channel * 31, 4) * 255);
            }
        }
    }

    return data;
}

let patches = null;

function patchTexture() {
    if (!patches) {
        patches = new THREE.DataTexture(patchNoise(), PATCH_TEXELS, PATCH_TEXELS, THREE.RGBAFormat);
        patches.wrapS = THREE.RepeatWrapping;
        patches.wrapT = THREE.RepeatWrapping;
        patches.magFilter = THREE.LinearFilter;
        patches.minFilter = THREE.LinearMipmapLinearFilter;
        patches.generateMipmaps = true;
        patches.needsUpdate = true;
    }

    return patches;
}

// A splat texture (splatOf's) for the GPU, mipmapped (a road's or a field's ragged edge, far off,
// is many texels to a pixel: read from the full-size texture alone, it crawls as the camera moves)
function splatTexture({ data, width, height }) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.flipY = false;
    texture.needsUpdate = true;

    return texture;
}

// No land's colour: the grass as it is
let noLand = null;

/**
 * The colours of the lands (the world plan's biomes) over the grass, a texel for each of the
 * plan's cells: in red, green and blue the colour (sRGB), in alpha how much of it (0: the grass
 * as it is). One texture for the whole world, blended between cells. With it (userData): each
 * people's homeland (`home`); each land's grass as it's seen from afar (`grass`: from `grass`,
 * grassmap.js grassLooks', in BIOMES' order: its tips' colour, sRGB, and how thick it grows);
 * which cells are farmland (`farm`: 255 in red) and the world's `seed`, for the fields afar.
 */
export function landColours(plan, grass = null) {
    const cells = CELLS;
    const data = new Uint8Array(cells * cells * 4);
    const colours = BIOMES.map(({ id }) => {
        const [colour, amount] = LAND_COLOURS[id] ?? ["#000000", 0];

        return [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)).concat(Math.round(amount * 255));
    });

    const homes = [new Uint8Array(cells * cells * 4), new Uint8Array(cells * cells * 4)];
    const wet = BIOMES.map(({ id }) => UNDER_WATER.has(id));
    const owners = RACES.map(({ id }) => HOMES.indexOf(id));

    for (let k = 0; k < cells * cells; k++) {
        data.set(colours[plan.biome[k]], k * 4);

        const home = plan.territory?.[k] ? owners[plan.territory[k] - 1] : -1;

        if (home >= 0 && !wet[plan.biome[k]]) {
            homes[home >> 2][k * 4 + (home & 3)] = 255;
        }
    }

    const texture = cellTexture(data, cells, THREE.SRGBColorSpace);
    const looks = new Uint8Array(cells * cells * 4);
    const farm = new Uint8Array(cells * cells * 4);
    const farmland = BIOMES.findIndex(({ id }) => id === "farmland");

    for (let k = 0; k < cells * cells; k++) {
        if (grass) {
            looks.set(grass[plan.biome[k]], k * 4);
        }

        farm[k * 4] = plan.biome[k] === farmland ? 255 : 0;
    }

    texture.userData.size = WORLD_SIZE;
    texture.userData.home = homes.map((home) => cellTexture(home, cells));
    texture.userData.grass = cellTexture(looks, cells, THREE.SRGBColorSpace);
    texture.userData.farm = cellTexture(farm, cells);
    texture.userData.seed = plan.seed ?? 0;

    return texture;
}

/**
 * A land's maps (landColours' or landColour's texture, its userData's) as two texture arrays, read
 * through two samplers rather than five (see TILE): `colours`, its colours and its grass afar
 * (sRGB); `marks`, its homelands (two layers) and its farmland. Made once a land.
 */
export function landLayers(land) {
    if (!land.userData.layers) {
        const cells = land.image.width;
        const of = (texture) => (texture?.image.width === cells ? texture.image.data : null);
        const [home, home2] = land.userData.home ?? [];

        land.userData.layers = {
            colours: cellArray([land.image.data, of(land.userData.grass)], cells, THREE.SRGBColorSpace),
            marks: cellArray([of(home), of(home2), of(land.userData.farm)], cells),
        };
    }

    return land.userData.layers;
}

// Maps of the plan's cells (or one: RGBA bytes, null for none) as a texture array, blended between
// cells
function cellArray(maps, cells, colorSpace = THREE.NoColorSpace) {
    const data = new Uint8Array(cells * cells * 4 * maps.length);

    maps.forEach((map, k) => map && data.set(map, k * cells * cells * 4));

    const texture = new THREE.DataArrayTexture(data, cells, cells, maps.length);

    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.colorSpace = colorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    return texture;
}

// A texture of the plan's cells (or one), blended between them
function cellTexture(data, cells, colorSpace = THREE.NoColorSpace) {
    const texture = new THREE.DataTexture(data, cells, cells, THREE.RGBAFormat);

    texture.colorSpace = colorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.flipY = false;
    texture.needsUpdate = true;

    return texture;
}

// The homelands' grounds, one layer each (HOMES' order), painted the first time a homeland's seen
let homeLayers = null;

function homeTexture() {
    if (!homeLayers) {
        const data = new Uint8Array(SIZE * SIZE * 4 * HOMES.length);

        HOMES.forEach((people, k) => {
            const layer = paintLayer(`home-${people}`, SIZE);

            for (let i = 3; i < layer.length; i += 4) {
                layer[i] = 255;
            }

            data.set(layer, k * layer.length);
        });

        homeLayers = new THREE.DataArrayTexture(data, SIZE, SIZE, HOMES.length);
        homeLayers.format = THREE.RGBAFormat;
        homeLayers.type = THREE.UnsignedByteType;
        homeLayers.colorSpace = THREE.SRGBColorSpace;
        homeLayers.wrapS = THREE.RepeatWrapping;
        homeLayers.wrapT = THREE.RepeatWrapping;
        homeLayers.magFilter = THREE.LinearFilter;
        homeLayers.minFilter = THREE.LinearMipmapLinearFilter;
        homeLayers.generateMipmaps = true;
        homeLayers.anisotropy = 8;
        homeLayers.needsUpdate = true;
    }

    return homeLayers;
}

/**
 * A material for the ground: the grass, tinted by `land` (landColours', or none), blended with the
 * other kinds of ground by `splat` (a texture: splatOf's), which covers `area` [x, z, width, depth]
 * (metres). Every ground material shares one shader. Or, `far`, for the far land's (world/far/
 * far.js): the ground as it's seen from afar (FAR_GROUND), and still water; not drawn within
 * `far.hole` (uniform: x, z, radius, metres) or `far.inner` (uniform: x0, z0, x1, z1: the level
 * inside it), where the ground nearer is (lifted out of the way).
 */
export function groundMaterial({ splat = null, area = [0, 0, 1, 1], land = null, contact = null, water = null, far = null, fields = null } = {}) {
    const { grass, brightness, variation: meanVariation, layers, array: tileMap } = groundTiles();
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

    // (The ground goes on into the far land past where nearer things fade: fog.js; with water on
    // it, wet up its banks, and light gathering on its bed under the water)
    material.defines = { NO_NEAR_FADE: "", ...(water ? { GROUND_WATER: "" } : {}), ...(far ? { FAR_LAND: "" } : {}) };

    if (!land) {
        noLand ??= new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
        noLand.needsUpdate = true;
    }

    const landMap = land ?? noLand;
    const home = landMap.userData.home ?? null;
    const { colours: landMaps, marks: markMaps } = landLayers(landMap);

    material.name = "ground";
    material.userData.splat = splat;
    material.userData.contact = contact?.texture ?? null;
    material.userData.fields = fields?.texture ?? null;
    // The ground as it's seen from afar (and, up high, its rock and snow): in the fragment shader for
    // the chunks' ground (past FAR_GROUND.from), and in the vertex shader for the far land's (its
    // corners metres apart: worked out at each and blended between, as cheap as can be over the
    // half of the picture it covers), the patches' noise read by `patch`
    // (Reading the ground's tiles (TILE) and the land's maps (landLayers): each a texture array, so
    // the ground's shader reads few enough textures for a phone)
    const tile = (k) => `${k.toFixed(1)}`;
    const reads = `vec4 tileAt(float tile, vec2 at) {
    return texture(groundTiles, vec3(at, tile));
}
vec3 tileMean(float tile) {
    return textureLod(groundTiles, vec3(0.5, 0.5, tile), 12.0).rgb;
}
vec4 landColourAt(vec2 at) {
    return texture(landMaps, vec3(at, 0.0));
}
vec4 grassLookAt(vec2 at) {
    return texture(landMaps, vec3(at, 1.0));
}
vec4 homesAt(vec2 at) {
    return texture(markMaps, vec3(at, 0.0));
}
float homes2At(vec2 at) {
    return texture(markMaps, vec3(at, 1.0)).r;
}
ivec2 farmSize() {
    return textureSize(markMaps, 0).xy;
}
float farmAt(ivec2 cell) {
    return texelFetch(markMaps, ivec3(cell, 2), 0).r;
}`;
    const farFunctions = (patch) => `// Up high (ALPINE): how far up into the rock a point so many metres up is (0 to 1), and how much
// snow lies on it (the up of its slope, the land there), the lines wandering with a patch's noise
// (0 to 1)
float alpineAt(float height, float wander) {
    return smoothstep(${ALPINE.rock[0].toFixed(1)}, ${ALPINE.rock[1].toFixed(1)}, height + (wander - 0.5) * ${(2 * ALPINE.wander).toFixed(1)});
}
float snowAt(float height, float wander, float up, vec4 land) {
    float ash = land.a * (1.0 - smoothstep(${(ALPINE.ash * 0.6).toFixed(3)}, ${ALPINE.ash.toFixed(3)}, dot(land.rgb, vec3(0.2126, 0.7152, 0.0722))));
    return smoothstep(${ALPINE.snow[0].toFixed(1)}, ${ALPINE.snow[1].toFixed(1)}, height + (wander - 0.5) * ${(2 * ALPINE.wander).toFixed(1)}) * smoothstep(${ALPINE.flat[0].toFixed(2)}, ${ALPINE.flat[1].toFixed(2)}, up) * (1.0 - ash);
}

// Its land's grass as it's seen where the tall grass isn't drawn (GRASS_AFAR), over the ground at
// a point (where it is on the lands' map): as thick as the land grows it, in clumps (0 to 1),
// thinner where it's worn bare and up towards the rock, drier and more golden in the dry patches,
// lighter and darker as the grass's picture is there (\`detail\`: 1 its average), more so
vec3 grassAfar(vec3 grass, vec2 landAt, float clumps, float dry, float lush, float bare, float alpine, float detail) {
    vec4 look = grassLookAt(landAt);
    float thick = look.a * (0.35 + 0.65 * smoothstep(0.3, 0.62, clumps)) * (1.0 - 0.95 * bare) * (1.0 + 0.25 * lush) * (1.0 - alpine);
    vec3 tint = mix(look.rgb, vec3(${new THREE.Color().setRGB(...STRAW.map((v) => v / 255), THREE.SRGBColorSpace).toArray().map((v) => v.toFixed(4)).join(", ")}), min(1.0, 0.65 * dry)) * mix(vec3(1.0), vec3(0.85, 1.0, 0.85), lush);

    return mix(grass, tint * ${GRASS_AFAR.bright.toFixed(2)} * pow(detail, ${GRASS_AFAR.detail.toFixed(2)}), min(1.0, thick * ${GRASS_AFAR.thick.toFixed(2)}) * ${GRASS_AFAR.amount.toFixed(2)});
}

// The ground as it's seen from afar at a point (its up: up; rock that much less steep, as the far
// land's corners smooth its slopes): each texture's average colour, and only what's large on them
vec3 farGround(vec2 at, vec3 up, float height, float rockShift) {
    vec2 landAt = at / landSize;
    vec2 blur = vec2(12.0, -12.0) / landSize;
    vec4 land = 0.25 * (landColourAt(landAt + blur.xx) + landColourAt(landAt + blur.xy) + landColourAt(landAt + blur.yx) + landColourAt(landAt + blur.yy));
    vec3 grass = tileMean(${tile(TILE.grass)});
    grass = mix(grass, land.rgb * dot(grass, vec3(0.2126, 0.7152, 0.0722)) / ${brightness.toFixed(4)}, land.a);
    vec4 homes = homesAt(landAt);
    float homeWeight = homes.r;
    float homeLayer = 0.0;
    if (homes.g > homeWeight) { homeWeight = homes.g; homeLayer = 1.0; }
    if (homes.b > homeWeight) { homeWeight = homes.b; homeLayer = 2.0; }
    if (homes.a > homeWeight) { homeWeight = homes.a; homeLayer = 3.0; }
    float homes2 = homes2At(landAt);
    if (homes2 > homeWeight) { homeWeight = homes2; homeLayer = 4.0; }
    float home = smoothstep(0.2, 0.75, homeWeight) * ${HOME_AMOUNT.toFixed(2)};
    if (home > 0.0) {
        grass = mix(grass, textureLod(homeLayers, vec3(0.5, 0.5, homeLayer), 12.0).rgb, home);
    }
    vec4 coarse = ${patch(`at / ${PATCHES.coarse.toFixed(1)}`)};
    float strength = (1.0 - 0.6 * land.a) * (1.0 - 0.6 * home);
    float dry = smoothstep(${PATCHES.dry[0].toFixed(3)}, ${PATCHES.dry[1].toFixed(3)}, coarse.r);
    float lush = smoothstep(${PATCHES.lush[0].toFixed(3)}, ${PATCHES.lush[1].toFixed(3)}, coarse.g) * (1.0 - dry);
    float bare = smoothstep(${PATCHES.bare[0].toFixed(3)}, ${PATCHES.bare[1].toFixed(3)}, coarse.b);
    grass = mix(grass, grass * vec3(1.3, 1.12, 0.6), dry * ${PATCHES.dry[2].toFixed(2)} * strength);
    grass = mix(grass, grass * vec3(0.72, 0.9, 0.68), lush * ${PATCHES.lush[2].toFixed(2)} * strength);
    vec3 earth = mix(tileMean(${tile(TILE.layers)}) * 0.92, grass * 0.8, land.a * 0.75);
    grass = mix(grass, earth, bare * ${PATCHES.bare[2].toFixed(2)} * strength);
    float alpine = alpineAt(height, coarse.b);
    grass = grassAfar(grass, landAt, 0.47, dry, lush, bare, alpine, 1.0);
    grass *= ${(0.82 + 0.45 * meanVariation).toFixed(4)};
    float steep = 1.0 - smoothstep(${ROCK_FROM.all.toFixed(2)} + rockShift + ${ALPINE.by.toFixed(2)} * alpine, ${ROCK_FROM.start.toFixed(2)} + rockShift + ${ALPINE.by.toFixed(2)} * alpine, up.y);
    vec3 rock = tileMean(${tile(TILE.rock)});
    rock = mix(rock, rock * land.rgb / max(0.2, dot(land.rgb, vec3(0.3333))), land.a * 0.35);
    vec3 ground = mix(grass, rock * ${(0.85 + 0.3 * meanVariation).toFixed(4)}, steep);
    return mix(ground, snowColour * ${(0.9 + 0.2 * meanVariation).toFixed(4)}, snowAt(height, coarse.b, up.y - rockShift, land));
}`;

    // The soil (layer k): in the fields, its furrows along each strip, and its crop's colour
    // (fieldMap: a texel a square, red its crop, green whether its strip runs north to south)
    const cropColour = (crop) => new THREE.Color(CROP_COLOURS[crop]).toArray().map((v) => v.toFixed(4)).join(", ");
    const soilOf = (k) => `if (splat.${"rgba"[k]} > 0.0) {
    vec4 field = texture2D(fieldMap, (vGround - fieldArea.xy) / fieldArea.zw);
    vec3 soil = tileAt(${tile(TILE.layers + k)}, (field.g > 0.5 ? vGround.yx : vGround) / layer${k}Size).rgb;
    float crop = floor(field.r * 255.0 + 0.5);
    if (crop > ${(CROP.ploughed + 0.5).toFixed(1)} && crop < ${(CROP.greens + 0.5).toFixed(1)}) {
        float ridge = smoothstep(0.015, 0.09, dot(soil, vec3(0.2126, 0.7152, 0.0722)));
        vec3 sown = crop < ${(CROP.wheat + 0.5).toFixed(1)} ? vec3(${cropColour(CROP.wheat)}) : crop < ${(CROP.barley + 0.5).toFixed(1)} ? vec3(${cropColour(CROP.barley)}) : vec3(${cropColour(CROP.greens)});
        soil = mix(soil, sown * (0.65 + 0.5 * ridge), crop > ${(CROP.barley + 0.5).toFixed(1)} ? 0.35 + 0.5 * ridge : 0.85);
    }
    ground += soil * splat.${"rgba"[k]};
}`;

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            splatMap: { value: splat ?? noSplat() },
            splatArea: { value: new THREE.Vector4(...area) },
            contactMap: { value: contact?.texture ?? noContact() },
            contactArea: { value: new THREE.Vector4(...(contact?.area ?? [0, 0, 1, 1])) },
            fieldMap: { value: fields?.texture ?? noFields() },
            fieldArea: { value: new THREE.Vector4(...(fields?.area ?? [0, 0, 1, 1])) },
            landMaps: { value: landMaps },
            markMaps: { value: markMaps },
            landSize: { value: landMap.userData.size ?? 1 },
            homeLayers: { value: home ? homeTexture() : null },
            groundTiles: { value: tileMap },
            grassSize: { value: grass.size },
            patchMap: { value: patchTexture() },
            grassUnderMap: GRASS_UNDER.map,
            grassUnderTint: GRASS_UNDER.tint,
            grassUnderFocus: GRASS_UNDER.focus,
            grassUnderReach: GRASS_UNDER.reach,
            fieldSeed: { value: landMap.userData.seed ?? 0 },
            farFieldsOn: FAR_FIELDS,
            snowColour: { value: new THREE.Color(ALPINE.colour) },
            ...(water ? { groundWater: { value: water.texture }, groundWaterArea: { value: new THREE.Vector4(...water.area) }, causticMap: { value: causticTexture() }, groundTime: TREE_WIND.time, groundDetail: WATER_DETAIL } : {}),
            ...(far ? { farHole: far.hole, farInner: far.inner, farWaterColour: { value: new THREE.Color(FAR_GROUND.water) } } : {}),
            ...Object.fromEntries(layers.map(({ size }, k) => [`layer${k}Size`, { value: size }])),
        });
        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                `#include <common>
varying vec2 vGround;
varying vec3 vUp;
varying float vHeight;
#ifdef FAR_LAND
attribute float farWater;
varying float vFarWater;
varying vec3 vFarColour;
uniform vec3 farHole;
uniform vec4 farInner;
uniform highp sampler2DArray groundTiles;
uniform vec3 snowColour;
uniform highp sampler2DArray landMaps;
uniform highp sampler2DArray markMaps;
uniform float landSize;
uniform highp sampler2DArray homeLayers;
uniform sampler2D patchMap;
${reads}

${farFunctions((at) => `textureLod(patchMap, ${at}, 0.0)`)}
#endif`,
            )
            .replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
#ifdef FAR_LAND
// (Lifted out of sight where the ground nearer's drawn: round the player, and inside the next level
// in. Lifted, not sunk: the ground lifted and the walls left round it all face away from a camera
// inside, so they're never drawn, where sunk they'd face it and cover half the picture, unseen)
vFarWater = farWater;
vec2 farAt = (modelMatrix * vec4(transformed, 1.0)).xz;
if (distance(farAt, farHole.xy) < farHole.z || (farAt.x > farInner.x && farAt.x < farInner.z && farAt.y > farInner.y && farAt.y < farInner.w)) transformed.y += 1000.0;
#endif`,
            )
            .replace(
                "#include <worldpos_vertex>",
                `#include <worldpos_vertex>
vGround = (modelMatrix * vec4(transformed, 1.0)).xz;
vHeight = (modelMatrix * vec4(transformed, 1.0)).y;
vUp = normalize(mat3(modelMatrix) * objectNormal);
#ifdef FAR_LAND
vFarColour = farGround(vGround, vUp, vHeight, ${FAR_GROUND.rock.toFixed(2)});
#endif`,
            );
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
varying vec2 vGround;
varying vec3 vUp;
varying float vHeight;
uniform highp sampler2DArray groundTiles;
uniform vec3 snowColour;
uniform sampler2D splatMap;
#ifdef GROUND_WATER
uniform sampler2D groundWater;
uniform vec4 groundWaterArea;
uniform sampler2D causticMap;
uniform float groundTime;
uniform float groundDetail;
#endif
uniform vec4 splatArea;
uniform sampler2D contactMap;
uniform vec4 contactArea;
float groundContact;
uniform sampler2D fieldMap;
uniform vec4 fieldArea;
uniform highp sampler2DArray landMaps;
uniform highp sampler2DArray markMaps;
uniform float landSize;
uniform highp sampler2DArray homeLayers;
uniform float grassSize;
uniform sampler2D patchMap;
uniform sampler2D grassUnderMap;
uniform sampler2D grassUnderTint;
uniform vec2 grassUnderFocus;
uniform float grassUnderReach;
uniform int fieldSeed;
uniform float farFieldsOn;
#ifdef FAR_LAND
varying float vFarWater;
varying vec3 vFarColour;
uniform vec3 farWaterColour;
#endif
${layers.map((_, k) => `uniform float layer${k}Size;`).join("\n")}
${reads}

${farFunctions((at) => `texture2D(patchMap, ${at})`)}

${FIELDS_GLSL}

// The fields as they're seen from afar (FIELDS_AFAR), over the ground as it's seen from afar, at a
// point so many metres away: each strip its crop's colour, the hedges' bands dark past where
// they're drawn
vec3 farFields(vec3 ground, vec2 at, float away) {
    if (farFieldsOn < 0.5) {
        return ground;
    }

    int crop = cropAt(at, away < ${FIELDS_AFAR.baulks.toFixed(1)}, away > ${FIELDS_AFAR.hedges.toFixed(1)});

    if (crop == -1) {
        return mix(ground, vec3(${new THREE.Color(FIELDS_AFAR.hedge).toArray().map((v) => v.toFixed(4)).join(", ")}), 0.85);
    }

    if (crop == 0 || crop == ${CROP.fallow}) {
        return ground;
    }

    vec3 soil = tileMean(${tile(TILE.layers + LAYERS.findIndex(([kind]) => kind === GROUND.soil))}) * ${(0.82 + 0.45 * meanVariation).toFixed(4)};

    return crop == ${CROP.ploughed} ? soil : crop == ${CROP.wheat} ? mix(soil, vec3(${cropColour(CROP.wheat)}), 0.85) : crop == ${CROP.barley} ? mix(soil, vec3(${cropColour(CROP.barley)}), 0.85) : mix(soil, vec3(${cropColour(CROP.greens)}), 0.75);
}`)
            .replace("#include <map_fragment>", `
#ifdef FAR_LAND
groundContact = 0.0;
vec3 ground = mix(farFields(vFarColour, vGround, distance(cameraPosition.xz, vGround)), farWaterColour, vFarWater);
#else
vec4 splat = texture2D(splatMap, (vGround - splatArea.xy) / splatArea.zw);
groundContact = texture2D(contactMap, (vGround - contactArea.xy) / contactArea.zw).r;
float variation = tileAt(${tile(TILE.grass)}, vGround / ${VARIATION_METRES.toFixed(1)}).g;
vec3 grass = tileAt(${tile(TILE.grass)}, vGround / grassSize).rgb;
float grassDetail = dot(grass, vec3(0.2126, 0.7152, 0.0722)) / ${brightness.toFixed(4)};

// The land's colour, its edges wandering (the cells it's read from are ${LAND_WANDER} metres or so)
vec2 landAt = (vGround + (vec2(variation, tileAt(${tile(TILE.grass)}, vGround / 53.0).r) - 0.5) * ${LAND_WANDER.toFixed(1)}) / landSize;
vec4 land = landColourAt(landAt);
grass = mix(grass, land.rgb * dot(grass, vec3(0.2126, 0.7152, 0.0722)) / ${brightness.toFixed(4)}, land.a);

// A people's homeland its own ground, the most of whichever's there (its edges wandering as the
// land's do)
vec4 homes = homesAt(landAt);
float homeWeight = homes.r;
float homeLayer = 0.0;
if (homes.g > homeWeight) { homeWeight = homes.g; homeLayer = 1.0; }
if (homes.b > homeWeight) { homeWeight = homes.b; homeLayer = 2.0; }
if (homes.a > homeWeight) { homeWeight = homes.a; homeLayer = 3.0; }
float homes2 = homes2At(landAt);
if (homes2 > homeWeight) { homeWeight = homes2; homeLayer = 4.0; }
float home = smoothstep(0.2, 0.75, homeWeight) * ${HOME_AMOUNT.toFixed(2)};
if (home > 0.0) {
    // (Read at two scales, one turned, so its repeats don't show)
    vec3 homeNear = texture(homeLayers, vec3(vGround / ${HOME_METRES.toFixed(1)}, homeLayer)).rgb;
    vec3 homeFar = texture(homeLayers, vec3(mat2(0.8, -0.6, 0.6, 0.8) * vGround / ${(HOME_METRES * 2.9).toFixed(1)}, homeLayer)).rgb;
    grass = mix(grass, mix(homeNear, homeFar, 0.4), home);
}

// Patches: drier and straw-coloured, lusher and darker, and worn to bare earth here and there
// (less where the land's own colour is strong: sand, snow, ash)
vec4 coarse = texture2D(patchMap, vGround / ${PATCHES.coarse.toFixed(1)});
vec4 fine = texture2D(patchMap, vGround / ${PATCHES.fine.toFixed(1)} + vec2(0.37, 0.71));
float strength = (1.0 - 0.6 * land.a) * (1.0 - 0.6 * home);
float dry = smoothstep(${PATCHES.dry[0].toFixed(3)}, ${PATCHES.dry[1].toFixed(3)}, coarse.r * 0.75 + fine.a * 0.25);
float lush = smoothstep(${PATCHES.lush[0].toFixed(3)}, ${PATCHES.lush[1].toFixed(3)}, coarse.g * 0.75 + fine.r * 0.25) * (1.0 - dry);
float bare = smoothstep(${PATCHES.bare[0].toFixed(3)}, ${PATCHES.bare[1].toFixed(3)}, fine.b * 0.75 + coarse.b * 0.25);
grass = mix(grass, grass * vec3(1.3, 1.12, 0.6), dry * ${PATCHES.dry[2].toFixed(2)} * strength);
grass = mix(grass, grass * vec3(0.72, 0.9, 0.68), lush * ${PATCHES.lush[2].toFixed(2)} * strength);
vec3 earth = mix(tileAt(${tile(TILE.layers)}, vGround / layer0Size).rgb * 0.92, grass * 0.8, land.a * 0.75);
grass = mix(grass, earth, bare * ${PATCHES.bare[2].toFixed(2)} * strength);

// Under the tall grass (grass.js), as thick as it grows, the ground darker and the grass's own
// colour: a field, not blades on a lawn (fading out where it's no longer drawn)
float grassUnderAway = distance(vGround, grassUnderFocus);
if (grassUnderReach > 0.0 && grassUnderAway < grassUnderReach) {
    vec2 grassUnderAt = (vGround + 0.5) / ${TALL_GRASS_TEXELS.toFixed(1)};
    float grassThick = smoothstep(0.04, 0.5, texture2D(grassUnderMap, grassUnderAt).r) * (1.0 - smoothstep(grassUnderReach * 0.7, grassUnderReach, grassUnderAway));
    vec3 grassOwn = pow(texture2D(grassUnderTint, grassUnderAt).rgb, vec3(2.2)) * 0.3;
    grass = mix(grass, grassOwn, grassThick * 0.85);
}

// Past where the tall grass is drawn (and everywhere on low quality, where none is), the ground
// takes its look (GRASS_AFAR), fading in as it fades out
float grassAfarIn = grassUnderReach > 0.0 ? smoothstep(grassUnderReach * 0.7, grassUnderReach, grassUnderAway) : 1.0;
if (grassAfarIn > 0.0) {
    grass = mix(grass, grassAfar(grass, landAt, fine.g, dry, lush, bare, alpineAt(vHeight, coarse.b), grassDetail), grassAfarIn);
}

vec3 ground = grass * max(0.0, 1.0 - splat.r - splat.g - splat.b - splat.a);
${layers.map((_, k) => (LAYERS[k][0] === GROUND.soil ? soilOf(k) : `ground += tileAt(${tile(TILE.layers + k)}, vGround / layer${k}Size).rgb * splat.${"rgba"[k]};`)).join("\n")}
ground *= 0.82 + 0.45 * variation;

// Rock where it's too steep for grass (and, up high, where it's gentler: ALPINE): read from above
// on gentler slopes, from the side (whichever way it faces most) on cliffs, tinted a little by the
// land's own colour
float alpine = alpineAt(vHeight, coarse.b);
float steep = 1.0 - smoothstep(${ROCK_FROM.all.toFixed(2)} + ${ALPINE.by.toFixed(2)} * alpine, ${ROCK_FROM.start.toFixed(2)} + ${ALPINE.by.toFixed(2)} * alpine, vUp.y);
#ifdef GROUND_WATER
// The water here (water.js's field): how far into it (metres, less than 0 on land) and how deep;
// no rock at the water's edge or under it (the bed's own ground there, not a channel's cut edge
// drawn as cliffs), but where it's all but sheer (the rock a fall drops down)
vec4 waterHere = texture2D(groundWater, (vGround - groundWaterArea.xy) / groundWaterArea.zw);
float waterIn = (waterHere.r * 255.0 - 128.0) / ${SHORE.steps.toFixed(1)};
float waterDepth = waterHere.a * 255.0 / ${FIELD.depth.toFixed(1)};

steep *= max(smoothstep(-0.3, 0.6, -waterIn), smoothstep(${ROCK_FROM.sheer.toFixed(2)}, ${(ROCK_FROM.sheer - 0.15).toFixed(2)}, vUp.y));
#endif
if (steep > 0.0) {
    vec2 across = abs(vUp.x) > abs(vUp.z) ? vec2(vGround.y, vHeight) : vec2(vGround.x, vHeight);
    // (Each read at two scales, the larger turned, so the texture's repeats don't show)
    mat2 turned = mat2(0.8, -0.6, 0.6, 0.8);
    vec3 fromAbove = mix(tileAt(${tile(TILE.rock)}, vGround / ${ROCK_METRES.toFixed(1)}).rgb, tileAt(${tile(TILE.rock)}, turned * vGround / ${(ROCK_METRES * 3.1).toFixed(1)}).rgb, 0.45);
    vec3 fromSide = mix(tileAt(${tile(TILE.rock)}, across / ${ROCK_METRES.toFixed(1)}).rgb, tileAt(${tile(TILE.rock)}, turned * across / ${(ROCK_METRES * 3.1).toFixed(1)}).rgb, 0.45);
    vec3 rock = mix(fromAbove, fromSide, smoothstep(0.75, 0.5, vUp.y));
#ifdef USE_FOG
    // (Close by, a finer copy's light and shade over them: ROCK_DETAIL)
    float closeBy = 1.0 - smoothstep(${ROCK_DETAIL.near.toFixed(1)}, ${ROCK_DETAIL.far.toFixed(1)}, vFogDepth);

    if (closeBy > 0.0) {
        mat2 twisted = mat2(0.6, 0.8, -0.8, 0.6);
        vec3 fine = mix(tileAt(${tile(TILE.rock)}, twisted * vGround / ${ROCK_DETAIL.metres.toFixed(2)}).rgb, tileAt(${tile(TILE.rock)}, twisted * across / ${ROCK_DETAIL.metres.toFixed(2)}).rgb, smoothstep(0.75, 0.5, vUp.y));
        float shade = dot(fine, vec3(0.3333)) / max(0.05, dot(tileMean(${tile(TILE.rock)}), vec3(0.3333)));

        rock *= mix(1.0, clamp(shade, 0.55, 1.45), closeBy * ${ROCK_DETAIL.strength.toFixed(2)});
    }
#endif
    rock = mix(rock, rock * land.rgb / max(0.2, dot(land.rgb, vec3(0.3333))), land.a * 0.35);
    ground = mix(ground, rock * (0.85 + 0.3 * variation), steep);
}

// Snow, up high, on what isn't too steep
ground = mix(ground, snowColour * (0.9 + 0.2 * variation), snowAt(vHeight, coarse.b, vUp.y, land));
#ifdef USE_FOG
// (Under the far haze, turning to the ground as it's seen from afar where the far land takes over)
if (fogFar > ${FAR_FOG.toFixed(1)} && vFogDepth > ${FAR_GROUND.from.toFixed(1)}) {
    ground = mix(ground, farFields(farGround(vGround, vUp, vHeight, 0.0), vGround, vFogDepth), smoothstep(${FAR_GROUND.from.toFixed(1)}, ${FAR_GROUND.to.toFixed(1)}, vFogDepth));
}
#endif
#ifdef GROUND_WATER
{
    // Wet, so darker, under the water and a metre and more up its banks; and under it, light
    // gathering where the ripples bend it (caustics: two reads drifting their own ways, the
    // dimmer of them, fading with depth; on medium quality and up)
    ground *= 1.0 - ${WET.darker.toFixed(2)} * (1.0 - smoothstep(0.0, ${WET.up.toFixed(1)}, -waterIn));

    if (groundDetail > 0.5 && waterDepth > 0.02) {
        vec2 causticAt = vGround * ${CAUSTICS.scale.toFixed(3)};
        // (Each read wobbled by the other's drift, so the lines bend and shimmer, not slide)
        vec2 wobble = vec2(sin(vGround.y * 1.7 + groundTime * 1.3), cos(vGround.x * 1.9 + groundTime * 1.1)) * 0.04;
        float caustic = min(texture2D(causticMap, causticAt + wobble + vec2(0.021, 0.013) * groundTime).r, texture2D(causticMap, causticAt * 1.37 - wobble + vec2(-0.016, 0.022) * groundTime).r);

        ground *= 1.0 + ${CAUSTICS.bright.toFixed(2)} * caustic * smoothstep(0.02, 0.25, waterDepth) * exp(-waterDepth * ${CAUSTICS.fade.toFixed(2)});
    }
}
#endif
#endif
diffuseColor.rgb *= ground;`)
            .replace("#include <aomap_fragment>", `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= 1.0 - ${CONTACT.loss.toFixed(2)} * groundContact;`);
    };
    material.customProgramCacheKey = () => "ground";

    return material;
}

// A splat with nothing on it
let empty = null;

function noSplat() {
    empty ??= splatTexture({ data: new Uint8Array(4), width: 1, height: 1 });

    return empty;
}

// No fields
let fallow = null;

function noFields() {
    fallow ??= Object.assign(new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat), { needsUpdate: true });

    return fallow;
}

/**
 * A chunk's fields (core/overworld.js chunk.crops) as the ground reads them: a texel a square, red
 * its crop, green 255 if its strip runs north to south; or null if none of its strips are sown.
 */
export function fieldsOf(chunk) {
    const { crops } = chunk;

    if (!crops?.some((crop) => sown(crop % ALONG))) {
        return null;
    }

    const data = new Uint8Array(CHUNK * CHUNK * 4);

    for (let k = 0; k < CHUNK * CHUNK; k++) {
        data[k * 4] = crops[k] % ALONG;
        data[k * 4 + 1] = crops[k] >= ALONG ? 255 : 0;
    }

    const texture = new THREE.DataTexture(data, CHUNK, CHUNK, THREE.RGBAFormat);

    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.flipY = false;
    texture.needsUpdate = true;

    return { texture, area: [chunk.x0, chunk.y0, CHUNK, CHUNK] };
}

// Nothing standing anywhere near
let nowhere = null;

function noContact() {
    nowhere ??= Object.assign(new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat), { needsUpdate: true });

    return nowhere;
}

/**
 * How much of the sky's hidden near what stands on the ground (the squares `opaque(x, y)` says
 * can't be seen through), round the squares from (x0, y0), `size` a side: a blur of where it
 * stands, a byte a square, as a texture, and the squares it covers ({ texture, area }); or null
 * if nothing stands there.
 */
export function contactOf(opaque, [x0, y0, size]) {
    const across = size + 2 * CONTACT_MARGIN;
    const standing = new Uint8Array(across * across);
    let any = false;

    for (let j = 0; j < across; j++) {
        for (let i = 0; i < across; i++) {
            if (opaque(x0 - CONTACT_MARGIN + i, y0 - CONTACT_MARGIN + j)) {
                standing[j * across + i] = 1;
                any = true;
            }
        }
    }

    if (!any) {
        return null;
    }

    const round = blurred(standing, across, across, CONTACT.reach);
    const data = new Uint8Array(across * across);

    for (let k = 0; k < data.length; k++) {
        data[k] = Math.round(Math.min(1, round[k]) * 255);
    }

    const texture = new THREE.DataTexture(data, across, across, THREE.RedFormat);

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    return { texture, area: [x0 - CONTACT_MARGIN, y0 - CONTACT_MARGIN, across, across] };
}

/**
 * One land's colour over all the ground (a land's id, LAND_COLOURS'), as landColours' texture is
 * for the whole world, and a people's homeland's ground if `people` has one (HOMES): for a
 * settlement shown on its own in its people's land.
 */
export function landColour(id, people = null) {
    const [colour, amount] = LAND_COLOURS[id] ?? ["#000000", 0];
    const texture = cellTexture(Uint8Array.from([1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)).concat(Math.round(amount * 255))), 1, THREE.SRGBColorSpace);
    const home = HOMES.indexOf(people);

    texture.userData.size = WORLD_SIZE;

    if (home >= 0) {
        const homes = [new Uint8Array(4), new Uint8Array(4)];

        homes[home >> 2][home & 3] = 255;
        texture.userData.home = homes.map((data) => cellTexture(data, 1));
    }

    return texture;
}

/**
 * The ground mesh for a world on its own (generateWorld's: in metres, x east and z south, the
 * map's corner at the origin), carrying on past its edges; tinted by `land` (landColour's, or
 * none).
 */
export function buildGround(world, { land = null } = {}) {
    const splat = splatTexture(splatData(world));
    const material = groundMaterial({ splat, area: [0, 0, world.width, world.height], land });

    // The ground carries on past the map's edge into the distance (the splat's edge, and so the
    // roads leaving the map, carrying on with it)
    const geometry = new THREE.PlaneGeometry(world.width + 2 * BEYOND, world.height + 2 * BEYOND);

    geometry.rotateX(-Math.PI / 2);
    geometry.translate(world.width / 2, 0, world.height / 2);

    const mesh = new THREE.Mesh(geometry, material);

    mesh.name = "ground";
    mesh.receiveShadow = true;

    return mesh;
}

/**
 * The ground of one chunk of the world outside (overworld.js's), tinted by `land` (landColours'):
 * a mesh at its place. Chunks of grass alone share a material; the rest have their own splat.
 */
export function chunkGround(overworld, chunk, land, step = 1) {
    return allAtOnce(layingGround(overworld, chunk, land, step));
}

// A square's ground as it's drawn: under a lake or a river, packed earth (the land sets soil
// there, which is drawn ploughed, in furrows, and shows through the shallows)
function bedOf(overworld, x, y) {
    const kind = overworld.squares.ground(x, y);

    if (kind !== GROUND.soil) {
        return kind;
    }

    const chunk = overworld.chunkAt(x, y);

    return chunk.water[(y - chunk.y0) * CHUNK + (x - chunk.x0)] ? GROUND.courtyard : kind;
}

// How far each chunk's ground hangs down round its edges (metres): where it meets a chunk drawn
// with its corners further apart, the gap between them is hidden behind it
const SKIRT = 2;

// The triangles of the chunks' ground drawn a metre apart, shared by them all: each square's two
// split from its north-west corner to its south-east (as core/terrain/ground.js reads heights
// between corners, so the ground's drawn just where everything stands on it), and the skirt round
// its edges. Drawn coarser, each chunk's own: each square split along its more level diagonal
// (far/levels.js splitAlong), so ridges seen from further off don't run in steps
const INDICES = new Map();

// The corners round a chunk's edge, in order (clockwise from its north-west corner, as seen from
// above), for `count` squares a side
function rim(count) {
    const corners = [];

    for (let i = 0; i < count; i++) {
        corners.push([i, 0]);
    }

    for (let j = 0; j < count; j++) {
        corners.push([count, j]);
    }

    for (let i = count; i > 0; i--) {
        corners.push([i, count]);
    }

    for (let j = count; j > 0; j--) {
        corners.push([0, j]);
    }

    return corners;
}

function indicesOf(count) {
    if (!INDICES.has(count)) {
        const side = count + 1;
        const indices = new Uint32Array((count * count + rim(count).length) * 6);

        for (let j = 0; j < count; j++) {
            for (let i = 0; i < count; i++) {
                const [nw, ne, sw, se] = [j * side + i, j * side + i + 1, (j + 1) * side + i, (j + 1) * side + i + 1];

                indices.set([nw, sw, se, nw, se, ne], (j * count + i) * 6);
            }
        }

        INDICES.set(count, new THREE.BufferAttribute(skirted(count, indices), 1));
    }

    return INDICES.get(count);
}

// A coarser chunk's triangles, its corners' heights (`levels`, row by row) given
function splitIndices(count, levels) {
    return new THREE.BufferAttribute(skirted(count, splitAlong(levels, count, rim(count).length * 6)), 1);
}

// The skirt's triangles, after the ground's in `indices`: each edge's corner joined to its copy
// hanging below it, facing out
function skirted(count, indices) {
    const side = count + 1;
    const around = rim(count);
    const from = count * count * 6;

    around.forEach(([i, j], k) => {
        const [i2, j2] = around[(k + 1) % around.length];
        const [a, b] = [j * side + i, j2 * side + i2];
        const [a2, b2] = [side * side + k, side * side + ((k + 1) % around.length)];

        indices.set([a, b, b2, a, b2, a2], from + k * 6);
    });

    return indices;
}

/**
 * A chunk's ground as a mesh's geometry (its corner at the origin): its heights
 * (core/terrain/ground.js: CHUNK + 1 corners a side, a metre apart) every `step` metres, lit by
 * the slope round each corner (read into the chunks beside it where their heights are to hand:
 * `heightOf(x, y)`, metres into this chunk, or null), with a skirt round its edges.
 */
export function groundGeometry(heights, step = 1, heightOf = () => null) {
    const count = CHUNK / step;
    const side = count + 1;
    const around = rim(count);
    const positions = new Float32Array((side * side + around.length) * 3);
    const normals = new Float32Array(positions.length);
    const corners = CHUNK + 1;
    const at = (i, j) => (i >= 0 && j >= 0 && i <= CHUNK && j <= CHUNK ? heights[j * corners + i] : heightOf(i, j));
    const levels = step > 1 ? new Float32Array(side * side) : null;

    for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
            const [u, v] = [i * step, j * step];
            const k = (j * side + i) * 3;
            const here = heights[v * corners + u];
            // (The slope from the corners a spacing each way: where there's none to hand, this one)
            const [west, east] = [at(u - step, v) ?? here, at(u + step, v) ?? here];
            const [north, south] = [at(u, v - step) ?? here, at(u, v + step) ?? here];
            const [dx, dz] = [(east - west) / ((at(u + step, v) === null ? 0 : step) + (at(u - step, v) === null ? 0 : step) || 1), (south - north) / ((at(u, v + step) === null ? 0 : step) + (at(u, v - step) === null ? 0 : step) || 1)];
            const length = Math.hypot(dx, 1, dz);

            positions[k] = u;
            positions[k + 1] = here;
            positions[k + 2] = v;
            normals[k] = -dx / length;
            normals[k + 1] = 1 / length;
            normals[k + 2] = -dz / length;

            if (levels) {
                levels[j * side + i] = here;
            }
        }
    }

    // (The skirt's corners: copies of the edge's, SKIRT below them, lit as they are)
    around.forEach(([i, j], n) => {
        const [from, to] = [(j * side + i) * 3, (side * side + n) * 3];

        positions[to] = positions[from];
        positions[to + 1] = positions[from + 1] - SKIRT;
        positions[to + 2] = positions[from + 2];
        normals.copyWithin(to, from, from + 3);
    });

    const geometry = new THREE.BufferGeometry();

    geometry.setIndex(levels ? splitIndices(count, levels) : indicesOf(count));
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    return geometry;
}

// A chunk's ground's geometry, lit into its neighbours where their heights are kept
function chunkGeometry(overworld, chunk, step) {
    const { cx, cy } = chunk;
    const heightOf = (i, j) => {
        const [nx, ny] = [cx + Math.floor(i / CHUNK), cy + Math.floor(j / CHUNK)];
        const other = overworld.ground?.peek?.(nx, ny);

        return other ? other.heights[(j - (ny - cy) * CHUNK) * (CHUNK + 1) + (i - (nx - cx) * CHUNK)] : null;
    };

    return groundGeometry(chunk.heights, step, heightOf);
}

/**
 * The same (chunkGround), made a step at a time (each a yield: its splat's), returning it; with
 * the chunk's water's field (`water`: { texture, area }, water.js waterSheet's), wet by it.
 */
export function* layingGround(overworld, chunk, land, step = 1, water = null) {
    const { x0, y0 } = chunk;
    const size = CHUNK;

    // (One square further round than the chunk, so the kinds of ground blend across its edges
    // as they would were there no edge)
    const splat = yield* splatting((x, y) => bedOf(overworld, x, y), [x0 - 1, y0 - 1, size + 2, size + 2]);
    const contact = contactOf(overworld.squares.opaque, [x0, y0, size]);
    let material;

    yield;

    if (splat.any || contact || water) {
        material = groundMaterial({ splat: splat.any ? splatTexture(splat) : null, area: [x0 - 1, y0 - 1, size + 2, size + 2], land, contact, water, fields: splat.any ? fieldsOf(chunk) : null });
        material.userData.own = true;
    } else {
        grassOnly.set(land, grassOnly.get(land) ?? groundMaterial({ land }));
        material = grassOnly.get(land);
    }

    const mesh = new THREE.Mesh(chunkGeometry(overworld, chunk, step), material);

    mesh.name = "ground";
    mesh.userData.step = step;
    mesh.position.set(x0, 0, y0);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
}

/** Draw a chunk's ground (layingGround's) with its corners `step` metres apart instead. */
export function respaceGround(overworld, chunk, mesh, step) {
    if (mesh.userData.step !== step) {
        mesh.geometry.dispose();
        mesh.geometry = chunkGeometry(overworld, chunk, step);
        mesh.userData.step = step;
    }
}

// The material for chunks of grass alone, for each land's colours
const grassOnly = new WeakMap();

/** Throw away the material chunks of grass alone share, for a land's colours (landColours'). */
export function disposeGrass(land) {
    grassOnly.get(land)?.dispose();
    grassOnly.delete(land);
}

/** Throw away a chunk's ground (chunkGround's): its own splat and material, if it has them. */
export function disposeChunkGround(mesh) {
    const { material } = mesh;

    mesh.geometry.dispose();

    if (material.userData.own) {
        material.userData.splat?.dispose();
        material.userData.contact?.dispose();
        material.userData.fields?.dispose();
        material.dispose();
    }

    mesh.removeFromParent();
}
