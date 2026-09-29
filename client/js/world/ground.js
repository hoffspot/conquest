// The ground under the world: one flat mesh covering the map, its colour blended from tiling
// textures (grass, road, cobbles, soil, courtyard earth) by a "splat" texture made from the
// world's ground plan, square by square, with soft, ragged edges between them. The grass isn't the
// same everywhere: patches of it are drier and straw-coloured, others lusher and darker, and here
// and there it's worn to bare earth (from a small texture of noise, read at large scales).
//
// Blending tiling textures in the shader keeps the ground sharp close up for one draw call, where
// one painted texture of the whole map would have to be huge (or blurry).

import * as THREE from "three";
import { tiling } from "../core/noise.js";
import { CHUNK } from "../core/overworld.js";
import { GROUND } from "../core/setpieces/pieces.js";
import { BIOMES, CELLS, WORLD_SIZE } from "../core/worldplan/plan.js";
import { textureCanvas } from "./art/engine/materials.js";

// Splat texels per metre (edges are shaped at this resolution)
const SPLAT_RESOLUTION = 4;

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

// How far the ground carries on past the map's edges (metres): into the fog
const BEYOND = 110;

// A much larger copy of the grass texture shades everything a little lighter or darker, so the
// repeats don't show from afar
const VARIATION_METRES = 37;

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
export function splatOf(kindAt, [x0, y0, width, height], resolution = SPLAT_RESOLUTION) {
    const w = width * resolution;
    const h = height * resolution;
    const data = new Uint8Array(w * h * 4);
    const layerOf = new Int8Array(16).fill(-1);
    const amounts = new Float32Array(LAYERS.length);

    LAYERS.forEach(([kind], layer) => (layerOf[kind] = layer));

    // Each square's layer (-1 for none), one square further round, for the blend at the edges
    const kinds = new Int8Array((width + 2) * (height + 2));
    let any = false;

    for (let j = 0; j < height + 2; j++) {
        for (let i = 0; i < width + 2; i++) {
            const layer = layerOf[kindAt(x0 + i - 1, y0 + j - 1) ?? GROUND.grass];

            kinds[j * (width + 2) + i] = layer;
            any ||= layer >= 0;
        }
    }

    if (!any) {
        return { data, width: w, height: h, any };
    }

    const layerAt = (i, j) => kinds[(j + 1) * (width + 2) + i + 1];

    for (let j = 0; j < h; j++) {
        // Blend the four squares round each texel by how near their middles are
        const fy = (j + 0.5) / resolution - 0.5;
        const y = Math.floor(fy);
        const ty = fy - y;

        for (let i = 0; i < w; i++) {
            const fx = (i + 0.5) / resolution - 0.5;
            const x = Math.floor(fx);
            const tx = fx - x;
            const corners = [layerAt(x, y), layerAt(x + 1, y), layerAt(x, y + 1), layerAt(x + 1, y + 1)];

            if (corners[0] < 0 && corners[1] < 0 && corners[2] < 0 && corners[3] < 0) {
                continue;
            }

            const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];

            amounts.fill(0);
            corners.forEach((layer, k) => layer >= 0 && (amounts[layer] += weights[k]));

            // Ragged edges: noise moves where each edge falls (the same wherever the map's cut)
            const noise = edgeNoise(i + x0 * resolution, j + y0 * resolution, resolution * 1.5) - 0.5;

            for (let layer = 0; layer < LAYERS.length; layer++) {
                if (amounts[layer] > 0) {
                    const t = Math.max(0, Math.min(1, (amounts[layer] + noise * 0.5 - 0.35) / 0.3));

                    data[(j * w + i) * 4 + layer] = Math.round(t * t * (3 - 2 * t) * 255);
                }
            }
        }
    }

    return { data, width: w, height: h, any };
}

// A tiling ground texture, and how many metres one copy covers
function tileTexture(name, size) {
    const { canvas } = textureCanvas(name);
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;

    return { texture, size };
}

// The ground's tiling textures, made once (and the grass's average brightness, in linear light)
let tiles = null;

function groundTiles() {
    if (!tiles) {
        const grass = tileTexture("grass", GRASS_METRES);
        const pixels = grass.texture.image.getContext("2d").getImageData(0, 0, grass.texture.image.width, grass.texture.image.height).data;
        const linear = (value) => ((value / 255 + 0.055) / 1.055) ** 2.4;
        let sum = 0;

        for (let k = 0; k < pixels.length; k += 4) {
            sum += 0.2126 * linear(pixels[k]) + 0.7152 * linear(pixels[k + 1]) + 0.0722 * linear(pixels[k + 2]);
        }

        tiles = { grass, brightness: sum / (pixels.length / 4), layers: LAYERS.map(([, name, size]) => tileTexture(name, size)) };
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

// A splat texture (splatOf's) for the GPU
function splatTexture({ data, width, height }) {
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);

    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.flipY = false;
    texture.needsUpdate = true;

    return texture;
}

// No land's colour: the grass as it is
let noLand = null;

/**
 * The colours of the lands (the world plan's biomes) over the grass, a texel for each of the
 * plan's cells: in red, green and blue the colour (sRGB), in alpha how much of it (0: the grass
 * as it is). One texture for the whole world, blended between cells.
 */
export function landColours(plan) {
    const cells = CELLS;
    const data = new Uint8Array(cells * cells * 4);
    const colours = BIOMES.map(({ id }) => {
        const [colour, amount] = LAND_COLOURS[id] ?? ["#000000", 0];

        return [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)).concat(Math.round(amount * 255));
    });

    for (let k = 0; k < cells * cells; k++) {
        data.set(colours[plan.biome[k]], k * 4);
    }

    const texture = new THREE.DataTexture(data, cells, cells, THREE.RGBAFormat);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.flipY = false;
    texture.needsUpdate = true;
    texture.userData.size = WORLD_SIZE;

    return texture;
}

/**
 * A material for the ground: the grass, tinted by `land` (landColours', or none), blended with the
 * other kinds of ground by `splat` (a texture: splatOf's), which covers `area` [x, z, width, depth]
 * (metres). Every ground material shares one shader.
 */
export function groundMaterial({ splat = null, area = [0, 0, 1, 1], land = null } = {}) {
    const { grass, brightness, layers } = groundTiles();
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

    if (!land) {
        noLand ??= new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
        noLand.needsUpdate = true;
    }

    const landMap = land ?? noLand;

    material.name = "ground";
    material.userData.splat = splat;
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            splatMap: { value: splat ?? noSplat() },
            splatArea: { value: new THREE.Vector4(...area) },
            landMap: { value: landMap },
            landSize: { value: landMap.userData.size ?? 1 },
            grassMap: { value: grass.texture },
            grassSize: { value: grass.size },
            patchMap: { value: patchTexture() },
            ...Object.fromEntries(layers.flatMap(({ texture, size }, k) => [[`layer${k}Map`, { value: texture }], [`layer${k}Size`, { value: size }]])),
        });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
varying vec2 vGround;
uniform sampler2D splatMap;
uniform vec4 splatArea;
uniform sampler2D landMap;
uniform float landSize;
uniform sampler2D grassMap;
uniform float grassSize;
uniform sampler2D patchMap;
${layers.map((_, k) => `uniform sampler2D layer${k}Map;\nuniform float layer${k}Size;`).join("\n")}`)
            .replace("#include <map_fragment>", `
vec4 splat = texture2D(splatMap, (vGround - splatArea.xy) / splatArea.zw);
float variation = texture2D(grassMap, vGround / ${VARIATION_METRES.toFixed(1)}).g;
vec3 grass = texture2D(grassMap, vGround / grassSize).rgb;

// The land's colour, its edges wandering (the cells it's read from are ${LAND_WANDER} metres or so)
vec4 land = texture2D(landMap, (vGround + (vec2(variation, texture2D(grassMap, vGround / 53.0).r) - 0.5) * ${LAND_WANDER.toFixed(1)}) / landSize);
grass = mix(grass, land.rgb * dot(grass, vec3(0.2126, 0.7152, 0.0722)) / ${brightness.toFixed(4)}, land.a);

// Patches: drier and straw-coloured, lusher and darker, and worn to bare earth here and there
// (less where the land's own colour is strong: sand, snow, ash)
vec4 coarse = texture2D(patchMap, vGround / ${PATCHES.coarse.toFixed(1)});
vec4 fine = texture2D(patchMap, vGround / ${PATCHES.fine.toFixed(1)} + vec2(0.37, 0.71));
float strength = 1.0 - 0.6 * land.a;
float dry = smoothstep(${PATCHES.dry[0].toFixed(3)}, ${PATCHES.dry[1].toFixed(3)}, coarse.r * 0.75 + fine.a * 0.25);
float lush = smoothstep(${PATCHES.lush[0].toFixed(3)}, ${PATCHES.lush[1].toFixed(3)}, coarse.g * 0.75 + fine.r * 0.25) * (1.0 - dry);
float bare = smoothstep(${PATCHES.bare[0].toFixed(3)}, ${PATCHES.bare[1].toFixed(3)}, fine.b * 0.75 + coarse.b * 0.25);
grass = mix(grass, grass * vec3(1.3, 1.12, 0.6), dry * ${PATCHES.dry[2].toFixed(2)} * strength);
grass = mix(grass, grass * vec3(0.72, 0.9, 0.68), lush * ${PATCHES.lush[2].toFixed(2)} * strength);
vec3 earth = mix(texture2D(layer0Map, vGround / layer0Size).rgb * 0.92, grass * 0.8, land.a * 0.75);
grass = mix(grass, earth, bare * ${PATCHES.bare[2].toFixed(2)} * strength);

vec3 ground = grass * max(0.0, 1.0 - splat.r - splat.g - splat.b - splat.a);
${layers.map((_, k) => `ground += texture2D(layer${k}Map, vGround / layer${k}Size).rgb * splat.${"rgba"[k]};`).join("\n")}
ground *= 0.82 + 0.45 * variation;
diffuseColor.rgb *= ground;`);
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

/**
 * One land's colour over all the ground (a land's id, LAND_COLOURS'), as landColours' texture is
 * for the whole world: for a settlement shown on its own in its people's land.
 */
export function landColour(id) {
    const [colour, amount] = LAND_COLOURS[id] ?? ["#000000", 0];
    const texture = new THREE.DataTexture(Uint8Array.from([1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16)).concat(Math.round(amount * 255))), 1, 1, THREE.RGBAFormat);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    texture.userData.size = WORLD_SIZE;

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

// A square of ground CHUNK metres across, its corner at the origin, for every chunk
let chunkPlane = null;

/**
 * The ground of one chunk of the world outside (overworld.js's), tinted by `land` (landColours'):
 * a mesh at its place. Chunks of grass alone share a material; the rest have their own splat.
 */
export function chunkGround(overworld, chunk, land) {
    const { x0, y0 } = chunk;
    const size = CHUNK;

    chunkPlane ??= new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(size / 2, 0, size / 2);

    // (One square further round than the chunk, so the kinds of ground blend across its edges
    // as they would were there no edge)
    const splat = splatOf((x, y) => overworld.squares.ground(x, y), [x0 - 1, y0 - 1, size + 2, size + 2]);
    let material;

    if (splat.any) {
        material = groundMaterial({ splat: splatTexture(splat), area: [x0 - 1, y0 - 1, size + 2, size + 2], land });
    } else {
        grassOnly.set(land, grassOnly.get(land) ?? groundMaterial({ land }));
        material = grassOnly.get(land);
    }

    const mesh = new THREE.Mesh(chunkPlane, material);

    mesh.name = "ground";
    mesh.position.set(x0, 0, y0);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
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

    if (material.userData.splat) {
        material.userData.splat.dispose();
        material.dispose();
    }

    mesh.removeFromParent();
}
