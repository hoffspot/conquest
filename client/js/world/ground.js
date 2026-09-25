// The ground under the world: one flat mesh covering the map, its colour blended from tiling
// textures (grass, road, cobbles, soil, courtyard earth) by a "splat" texture made from the
// world's ground plan, square by square, with soft, ragged edges between them.
//
// Blending tiling textures in the shader keeps the ground sharp close up for one draw call, where
// one painted texture of the whole map would have to be huge (or blurry).

import * as THREE from "three";
import { GROUND } from "../core/setpieces/pieces.js";
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
    const w = width * resolution;
    const h = height * resolution;
    const data = new Uint8Array(w * h * 4);
    const layerOf = new Int8Array(8).fill(-1);
    const kindAt = (i, j) => (i >= 0 && j >= 0 && i < width && j < height ? ground[j][i] : GROUND.grass);
    const amounts = new Float32Array(LAYERS.length);

    LAYERS.forEach(([kind], layer) => (layerOf[kind] = layer));

    for (let j = 0; j < h; j++) {
        // Blend the four squares round each texel by how near their middles are
        const fy = (j + 0.5) / resolution - 0.5;
        const y0 = Math.floor(fy);
        const ty = fy - y0;

        for (let i = 0; i < w; i++) {
            const fx = (i + 0.5) / resolution - 0.5;
            const x0 = Math.floor(fx);
            const tx = fx - x0;
            const corners = [
                [kindAt(x0, y0), (1 - tx) * (1 - ty)],
                [kindAt(x0 + 1, y0), tx * (1 - ty)],
                [kindAt(x0, y0 + 1), (1 - tx) * ty],
                [kindAt(x0 + 1, y0 + 1), tx * ty],
            ];

            amounts.fill(0);

            let any = false;

            for (const [kind, weight] of corners) {
                const layer = layerOf[kind];

                if (layer >= 0) {
                    amounts[layer] += weight;
                    any = true;
                }
            }

            if (!any) {
                continue;
            }

            // Ragged edges: noise moves where each edge falls
            const noise = edgeNoise(i, j, resolution * 1.5) - 0.5;

            for (let layer = 0; layer < LAYERS.length; layer++) {
                if (amounts[layer] > 0) {
                    const t = Math.max(0, Math.min(1, (amounts[layer] + noise * 0.5 - 0.35) / 0.3));

                    data[(j * w + i) * 4 + layer] = Math.round(t * t * (3 - 2 * t) * 255);
                }
            }
        }
    }

    return { data, width: w, height: h };
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

/**
 * The ground mesh for a world (in metres, x east and z south, the map's corner at the origin),
 * carrying on past its edges.
 */
export function buildGround(world) {
    const splat = splatData(world);
    const splatTexture = new THREE.DataTexture(splat.data, splat.width, splat.height, THREE.RGBAFormat);

    splatTexture.magFilter = THREE.LinearFilter;
    splatTexture.minFilter = THREE.LinearFilter;
    splatTexture.flipY = false;
    splatTexture.needsUpdate = true;

    const grass = tileTexture("grass", GRASS_METRES);
    const layers = LAYERS.map(([, name, size]) => tileTexture(name, size));
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });

    material.name = "ground";
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
            splatMap: { value: splatTexture },
            mapSize: { value: new THREE.Vector2(world.width, world.height) },
            grassMap: { value: grass.texture },
            grassSize: { value: grass.size },
            ...Object.fromEntries(layers.flatMap(({ texture, size }, k) => [[`layer${k}Map`, { value: texture }], [`layer${k}Size`, { value: size }]])),
        });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
varying vec2 vGround;
uniform sampler2D splatMap;
uniform vec2 mapSize;
uniform sampler2D grassMap;
uniform float grassSize;
${layers.map((_, k) => `uniform sampler2D layer${k}Map;\nuniform float layer${k}Size;`).join("\n")}`)
            .replace("#include <map_fragment>", `
vec4 splat = texture2D(splatMap, vGround / mapSize);
vec3 ground = texture2D(grassMap, vGround / grassSize).rgb * max(0.0, 1.0 - splat.r - splat.g - splat.b - splat.a);
${layers.map((_, k) => `ground += texture2D(layer${k}Map, vGround / layer${k}Size).rgb * splat.${"rgba"[k]};`).join("\n")}
ground *= 0.82 + 0.45 * texture2D(grassMap, vGround / ${VARIATION_METRES.toFixed(1)}).g;
diffuseColor.rgb *= ground;`);
    };

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
