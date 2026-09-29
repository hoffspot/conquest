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
import { COLOURS, GLOWS, MATERIALS, paintLayer, TINTS } from "./painters.js";

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

    if (TINTS[material.name]) {
        return index.get(TINTS[material.name].from);
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

    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const uniforms = { atlasMap: { value: atlasTexture() }, atlasRelief: { value: RELIEF } };

    material.name = "atlas";
    material.shadowSide = THREE.DoubleSide;
    material.userData.atlas = uniforms.atlasMap.value;
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (shader) => fromAtlas(shader, uniforms);
    material.customProgramCacheKey = () => "atlas";
    shared = material;

    return material;
}

/**
 * The undergrowth's: where the player is (x, z metres, for `focus`), how far from them it starts to
 * sink into the ground and where it's all gone (metres: `fade`), and how far the tips of grass
 * and flowers stir in the breeze (metres: `sway`).
 */
export const WILDS = Object.freeze({ focus: { value: new THREE.Vector2() }, fade: { value: new THREE.Vector2(40, 56) }, sway: { value: 0.07 } });

let wilds = null;

/**
 * The atlas's material for the undergrowth (grass, flowers, pebbles, sticks: kits/wilds.js): both
 * sides of each blade and petal drawn, lit as the ground is whichever side is seen; the higher up a
 * blade each vertex is (a `sway` attribute, 0 at its foot to 1 at its tip), the more it stirs in
 * the breeze (`time`: seconds, a uniform the game keeps going); and further from the player than
 * WILDS.fade, sunk into the ground, so none of it pops in or out of sight.
 */
export function wildsMaterial(time) {
    if (wilds) {
        return wilds;
    }

    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const uniforms = { atlasMap: { value: atlasTexture() }, atlasRelief: { value: 0 }, wildsTime: time, wildsFocus: WILDS.focus, wildsFade: WILDS.fade, wildsSway: WILDS.sway };

    material.name = "wilds";
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        fromAtlas(shader, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute float sway;\nuniform float wildsTime;\nuniform vec2 wildsFocus;\nuniform vec2 wildsFade;\nuniform float wildsSway;")
            .replace("#include <begin_vertex>", `#include <begin_vertex>
vec3 wildAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
float wildPhase = wildAt.x * 0.61 + wildAt.z * 0.47;
float wildHow = wildsSway * sway;
transformed.x += wildHow * (sin(wildsTime * 2.3 + wildPhase) + 0.35 * sin(wildsTime * 5.1 + wildPhase * 1.7));
transformed.z += wildHow * 0.6 * cos(wildsTime * 1.9 + wildPhase * 1.3);
transformed.y = mix(transformed.y, -0.06, smoothstep(wildsFade.x, wildsFade.y, distance(wildAt.xz, wildsFocus)));`);
        // (Both sides lit alike: a blade's back as its front)
        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal *= faceDirection;");
    };
    material.customProgramCacheKey = () => "wilds";
    wilds = material;

    return material;
}

// The atlas's texture array, made once: its layers as painted (prepareAtlas's, or here and now)
let texture = null;

function atlasTexture() {
    if (!texture) {
        texture = new THREE.DataArrayTexture(prepared?.data ?? paintLayers(), LAYER_SIZE, LAYER_SIZE, LAYERS.length);
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
    }

    return texture;
}

// A material's shader drawn from the atlas: each vertex's layer, its texture coordinates, and the
// layer's heights lit as relief
function fromAtlas(shader, uniforms) {
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
}

const _colour = new THREE.Color();

let glowing = null;

/**
 * The one material every light is drawn with (GLOWS: lamps, faerie fire, lava): unlit, each
 * vertex its own colour.
 */
export function glowMaterial() {
    if (!glowing) {
        glowing = new THREE.MeshBasicMaterial({ vertexColors: true });
        glowing.name = "glow";
        glowing.shadowSide = THREE.DoubleSide;
    }

    return glowing;
}

/**
 * A (non-indexed) geometry drawn in one of the GLOWS made ready to be drawn with glowMaterial:
 * its colours (white if it had none) times the light's. Null if it isn't one.
 */
export function toGlow(geometry, material) {
    const light = material?.userData?.glow ?? (material && GLOWS[material.name]);

    if (light === undefined) {
        return null;
    }

    const count = geometry.attributes.position.count;
    const result = geometry.clone();
    const colours = new Float32Array(count * 3).fill(1);

    if (geometry.attributes.color) {
        colours.set(geometry.attributes.color.array.subarray(0, count * 3));
    }

    _colour.setHex(light);

    for (let i = 0; i < count; i++) {
        colours[i * 3] *= _colour.r;
        colours[i * 3 + 1] *= _colour.g;
        colours[i * 3 + 2] *= _colour.b;
    }

    result.setAttribute("color", new THREE.BufferAttribute(colours, 3));

    return result;
}

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
    } else {
        const tint = TINTS[material.name];
        const world = MATERIALS[tint?.from ?? material.name].world;

        if (geometry.attributes.uv) {
            for (let i = 0; i < count * 2; i++) {
                uvs[i] = geometry.attributes.uv.array[i] / world;
            }
        }

        if (tint) {
            for (let i = 0; i < count * 3; i++) {
                colours[i] *= tint.tint[i % 3];
            }
        }
    }

    result.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    result.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    result.setAttribute("layer", new THREE.BufferAttribute(new Float32Array(count).fill(layer), 1));

    return result;
}
