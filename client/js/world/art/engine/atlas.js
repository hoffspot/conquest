// The art's one material: everything the kits build (walls, roofs, timbers, doors, glass, iron)
// drawn with a single Three.js material, so a whole block of the town is one draw call however
// many materials it's built of.
//
// Every textured material (materials.js MATERIALS, but the ground's) is a layer of one texture
// array (WebGL2), painted LAYER_SIZE pixels square; plain colours (COLOURS) are a white layer
// tinted by their colour. Each vertex says which layer it's drawn from (a `layer` attribute), its
// texture coordinates are the material's own (world pixels over how many one copy covers), and
// its colour multiplies the layer's: a plain material's colour, times the weathering the kits
// paint on (Solid's `tone`). Each layer's alpha says how high each pixel stands, and the material
// lights that as relief (bump mapping, from how the height changes across the screen), so mortar
// sits back between bricks and the grain of the timbers shows.
//
// Meshes built of other materials (the tavern's painted signs, KayKit's props, the forge's
// glowing coals) keep their own: `toAtlas` says which can be drawn with the atlas.

import * as THREE from "three";
import { COLOURS, MATERIALS, paintLayer } from "./painters.js";

/** How many pixels square each layer is painted. */
export const LAYER_SIZE = 256;

/** How strongly the layers' heights are lit as relief (0: flat). */
export const RELIEF = 0.7;

/** The layers, in order: every textured material built with, then the white of plain colours. */
export const LAYERS = Object.freeze([...Object.keys(MATERIALS).filter((name) => !MATERIALS[name].ground), "plain"]);

const index = new Map(LAYERS.map((name, k) => [name, k]));
const PLAIN = index.get("plain");

let shared = null;

/** Which layer a material's drawn from (-1 if it can't be drawn with the atlas). */
export function layerOf(material) {
    if (!material?.isMeshLambertMaterial || material.emissiveMap || (material.emissiveIntensity > 0 && material.emissive?.getHex())) {
        return -1;
    }

    if (index.has(material.name) && MATERIALS[material.name]) {
        return index.get(material.name);
    }

    return COLOURS[material.name] !== undefined ? PLAIN : -1;
}

const PLAIN_LAYER = (size) => {
    const layer = new Uint8Array(size * size * 4).fill(255);

    for (let i = 3; i < layer.length; i += 4) {
        layer[i] = 128;
    }

    return layer;
};

// The layers put one after the other, each bottom row first (as a canvas texture is flipped)
function stack(painted, size) {
    const data = new Uint8Array(size * size * 4 * LAYERS.length);
    const row = size * 4;

    for (const [k, name] of LAYERS.entries()) {
        const layer = name === "plain" ? PLAIN_LAYER(size) : painted.get(name);
        const start = k * size * row;

        for (let y = 0; y < size; y++) {
            data.set(layer.subarray(y * row, (y + 1) * row), start + (size - 1 - y) * row);
        }
    }

    return data;
}

/**
 * All the layers painted, here and now: RGBA bytes, `size` square, one after the other, bottom
 * row first.
 */
export function paintLayers(size = LAYER_SIZE) {
    return stack(new Map(LAYERS.filter((name) => name !== "plain").map((name) => [name, paintLayer(name, size)])), size);
}

let prepared = null;

/**
 * Start painting the layers in workers (a few at once, off the page's thread), for the material
 * to have when it's first asked for: resolves with them. Painted here and now if workers can't.
 */
export function prepareAtlas(size = LAYER_SIZE) {
    if (prepared) {
        return prepared.promise;
    }

    const names = LAYERS.filter((name) => name !== "plain");
    const promise = (async () => {
        if (typeof Worker === "undefined") {
            return paintLayers(size);
        }

        const count = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
        const groups = Array.from({ length: count }, (_, k) => names.filter((_, i) => i % count === k));
        const painted = new Map();

        try {
            await Promise.all(groups.map((group) => new Promise((resolve, reject) => {
                const worker = new Worker(new URL("./paint-worker.js", import.meta.url), { type: "module" });

                worker.onmessage = ({ data }) => {
                    data.names.forEach((name, k) => painted.set(name, data.layers[k]));
                    worker.terminate();
                    resolve();
                };
                worker.onerror = (error) => {
                    worker.terminate();
                    reject(error);
                };
                worker.postMessage({ names: group, size });
            })));
        } catch {
            return paintLayers(size);
        }

        return stack(painted, size);
    })();

    prepared = { promise, data: null };
    promise.then((data) => {
        prepared.data = data;
    });

    return promise;
}

// The relief: how a surface's normal tilts where the height under it changes (after Three.js's
// bump mapping, reading the height from the atlas)
const RELIEF_GLSL = `
vec3 reliefNormal(vec3 position, vec3 normal, vec2 slope, float faceDirection) {
    vec3 sigmaX = normalize(dFdx(position));
    vec3 sigmaY = normalize(dFdy(position));
    vec3 r1 = cross(sigmaY, normal);
    vec3 r2 = cross(normal, sigmaX);
    float det = dot(sigmaX, r1) * faceDirection;
    vec3 gradient = sign(det) * (slope.x * r1 + slope.y * r2);

    return normalize(abs(det) * normal - gradient);
}`;

/**
 * The shared material (made the first time it's asked for, its layers painted then unless
 * prepareAtlas has painted them already): a Lambert material drawing from the atlas with vertex
 * colours and relief.
 */
export function atlasMaterial() {
    if (shared) {
        return shared;
    }

    const texture = new THREE.DataArrayTexture(prepared?.data ?? paintLayers(), LAYER_SIZE, LAYER_SIZE, LAYERS.length);

    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uniforms = { atlasMap: { value: texture }, atlasRelief: { value: RELIEF } };

    material.name = "atlas";
    material.shadowSide = THREE.DoubleSide;
    material.userData.atlas = texture;
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute float layer;\nflat varying float vLayer;\nvarying vec2 vAtlasUv;")
            .replace("#include <uv_vertex>", "#include <uv_vertex>\nvLayer = layer;\nvAtlasUv = uv;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>\nuniform highp sampler2DArray atlasMap;\nuniform float atlasRelief;\nflat varying float vLayer;\nvarying vec2 vAtlasUv;\n${RELIEF_GLSL}`)
            .replace("#include <map_fragment>", "vec4 atlasTexel = texture(atlasMap, vec3(vAtlasUv, vLayer));\ndiffuseColor.rgb *= atlasTexel.rgb;")
            .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
if (atlasRelief > 0.0) {
    vec2 dx = dFdx(vAtlasUv);
    vec2 dy = dFdy(vAtlasUv);
    float here = texture(atlasMap, vec3(vAtlasUv, vLayer)).a;
    vec2 slope = vec2(texture(atlasMap, vec3(vAtlasUv + dx, vLayer)).a - here, texture(atlasMap, vec3(vAtlasUv + dy, vLayer)).a - here) * atlasRelief;

    normal = reliefNormal(-vViewPosition, normal, slope, faceDirection);
}`);
    };
    material.customProgramCacheKey = () => "atlas";
    shared = material;

    return material;
}

const _colour = new THREE.Color();

/**
 * A (non-indexed) geometry drawn in `material` made ready to be drawn with the atlas instead: its
 * texture coordinates scaled to the material's, a `layer` for each vertex, and its colours (white
 * if it had none) times the material's own if it's a plain colour. Null if it can't be.
 */
export function toAtlas(geometry, material) {
    const layer = layerOf(material);

    if (layer < 0) {
        return null;
    }

    const count = geometry.attributes.position.count;
    const result = geometry.clone();
    const colours = new Float32Array(count * 3).fill(1);
    const uvs = new Float32Array(count * 2);

    if (geometry.attributes.color) {
        colours.set(geometry.attributes.color.array.subarray(0, count * 3));
    }

    if (layer === PLAIN) {
        _colour.setHex(COLOURS[material.name]);

        for (let i = 0; i < count; i++) {
            colours[i * 3] *= _colour.r;
            colours[i * 3 + 1] *= _colour.g;
            colours[i * 3 + 2] *= _colour.b;
        }
    } else if (geometry.attributes.uv) {
        const world = MATERIALS[material.name].world;

        for (let i = 0; i < count * 2; i++) {
            uvs[i] = geometry.attributes.uv.array[i] / world;
        }
    }

    result.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    result.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    result.setAttribute("layer", new THREE.BufferAttribute(new Float32Array(count).fill(layer), 1));

    return result;
}
