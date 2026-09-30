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
// Glass, metal and slate shine (SHINES): a highlight where the sun or a lamp catches them, and
// the sky (or, indoors, the room) reflected in them, more at a glancing look (Fresnel). Which
// shine a vertex has rides on its layer (SHINE_STEP times it, added), so nothing more is kept for
// it; the Lambert light is otherwise as it was, and what doesn't shine costs nothing more.
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

/**
 * What shines, and how (by material name; a tinted material shines as the one it's tinted
 * from): 1 glass (leaded windows too, and water, obsidian): a sharp highlight, the sky mirrored
 * at a glancing look; 2 iron (its black scale, magnetite, reflecting a sixth straight on): a
 * broad dull sheen; 3 bright metal (gold, silver, brass, pewter): its own colour's reflection, its
 * paint half as bright; 4 slate: a soft sheen, mostly at a glancing look.
 */
export const SHINES = Object.freeze({
    glass: 1,
    "glass-lit": 1,
    "glass-green": 1,
    "glass-violet": 1,
    leaded: 1,
    water: 1,
    "water-green": 1,
    obsidian: 1,
    iron: 2,
    "iron-black": 2,
    gold: 3,
    silver: 3,
    "sun-gold": 3,
    brass: 3,
    pewter: 3,
    slate: 4,
    "slate-grey": 4,
});

/** How far apart the shines are in a vertex's `layer` (its layer, plus this times its shine). */
export const SHINE_STEP = 256;

/** How a material shines (SHINES: 0 for not at all). */
export function shineOf(material) {
    return SHINES[material.name] ?? SHINES[TINTS[material.name]?.from] ?? 0;
}

let shared = null;

/**
 * Which layer a material's drawn from (-1 if it can't be drawn with the atlas): a plain colour's
 * the plain layer, whether it's one of COLOURS or (`userData.plain`) one worked out as it's built,
 * such as a god's.
 */
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

    return COLOURS[material.name] !== undefined || (material.userData.plain && !material.map) ? PLAIN : -1;
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
 * (which, asked for before they're done, takes them once they are): resolves with them. Painted
 * here and now if workers can't.
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

    prepared = { promise, data: null, size };
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
 * prepareAtlas is painting them or has): a Lambert material drawing from the atlas with vertex
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
    material.onBeforeCompile = (shader) => fromAtlas(shader, uniforms, { shine: true });
    material.customProgramCacheKey = () => "atlas";
    shared = material;

    return material;
}

/**
 * A material of its own drawn as the shared one is (atlasMaterial: from its layers, lit as relief,
 * what shines shining), its shader then changed by `extend` (as onBeforeCompile is given it), its
 * programs known by `name`: the insides', cut away in front of the player (interiors3d.js).
 */
export function atlasVariant(name, extend) {
    const { uniforms } = atlasMaterial().userData;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });

    material.name = name;
    material.shadowSide = THREE.DoubleSide;
    material.userData.atlas = uniforms.atlasMap.value;
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        fromAtlas(shader, uniforms, { shine: true });
        extend(shader);
    };
    material.customProgramCacheKey = () => name;

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
            .replace("#include <common>", "#include <common>\nattribute float sway;\nattribute float foot;\nuniform float wildsTime;\nuniform vec2 wildsFocus;\nuniform vec2 wildsFade;\nuniform float wildsSway;")
            .replace("#include <begin_vertex>", `#include <begin_vertex>
vec3 wildAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
float wildPhase = wildAt.x * 0.61 + wildAt.z * 0.47;
float wildHow = wildsSway * sway;
transformed.x += wildHow * (sin(wildsTime * 2.3 + wildPhase) + 0.35 * sin(wildsTime * 5.1 + wildPhase * 1.7));
transformed.z += wildHow * 0.6 * cos(wildsTime * 1.9 + wildPhase * 1.3);
transformed.y = mix(transformed.y, foot - 0.06, smoothstep(wildsFade.x, wildsFade.y, distance(wildAt.xz, wildsFocus)));`);
        // (Both sides lit alike: a blade's back as its front)
        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\nnormal *= faceDirection;");
    };
    material.customProgramCacheKey = () => "wilds";
    wilds = material;

    return material;
}

// The atlas's texture array, made once: its layers as painted (prepareAtlas's, or here and now).
// Asked for while prepareAtlas's are still being painted (as the game gets the land ready), it
// takes theirs once they are, rather than painting them all again here: until then it has none,
// and isn't drawn (the game waits for them before it draws anything)
let texture = null;

function atlasTexture() {
    if (!texture) {
        const waiting = Boolean(prepared && !prepared.data);
        const size = prepared?.size ?? LAYER_SIZE;

        texture = new THREE.DataArrayTexture(waiting ? null : (prepared?.data ?? paintLayers()), size, size, LAYERS.length);
        texture.format = THREE.RGBAFormat;
        texture.type = THREE.UnsignedByteType;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 4;

        if (waiting) {
            prepared.promise.then((data) => {
                texture.image.data = data;
                texture.needsUpdate = true;
            });
        } else {
            texture.needsUpdate = true;
        }
    }

    return texture;
}

// How each shine (SHINES) shines: its reflectance straight on (a bright metal's its own colour),
// how rough (the sky's reflection blurred as much), and the sun's highlight as sharp as that
// (Blinn-Phong: 2 / roughness^4 - 2), but for glass's, which is spread as wide as the sun looks and
// old glass is uneven
const SHINE_GLSL = `
flat varying float vShine;
vec3 atlasF0;
float atlasRoughness;
float atlasGloss;

void atlasShine(inout vec4 diffuseColor) {
    atlasGloss = 0.0;

    if (vShine < 0.5) return;

    int shine = int(vShine + 0.5);

    if (shine == 1) {
        atlasF0 = vec3(0.04); atlasRoughness = 0.08; atlasGloss = 600.0;
    } else if (shine == 2) {
        atlasF0 = vec3(0.17); atlasRoughness = 0.6; atlasGloss = 13.0;
    } else if (shine == 3) {
        atlasF0 = diffuseColor.rgb; atlasRoughness = 0.3; atlasGloss = 240.0;
        diffuseColor.rgb *= 0.5;
    } else {
        atlasF0 = vec3(0.04); atlasRoughness = 0.65; atlasGloss = 9.0;
    }
}

// How much of the sky (or the room) is reflected, looking at it from this way: Fresnel, less of
// it at a glancing look the rougher the surface (Karis's fit for phones, as three.js's
// MeshStandardMaterial had before it took the table it has now)
vec3 atlasReflectance(const in vec3 normal, const in vec3 viewDir) {
    float dotNV = saturate(dot(normal, viewDir));
    vec4 r = atlasRoughness * vec4(-1.0, -0.0275, -0.572, 0.022) + vec4(1.0, 0.0425, 1.04, -0.04);
    float a004 = min(r.x * r.x, exp2(-9.28 * dotNV)) * r.x + r.y;
    vec2 fab = vec2(-1.04, 1.04) * a004 + r.zw;

    return atlasF0 * fab.x + fab.y;
}`;

// (Each light, the sun's with its shadow, as Lambert has it, and a highlight where it shines)
const SHINE_DIRECT_GLSL = `
void RE_Direct_Atlas(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight) {
    RE_Direct_Lambert(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);

    if (atlasGloss > 0.0) {
        float dotNL = saturate(dot(geometryNormal, directLight.direction));

        reflectedLight.directSpecular += dotNL * directLight.color * BRDF_BlinnPhong(directLight.direction, geometryViewDir, geometryNormal, atlasF0, atlasGloss);
    }
}

#undef RE_Direct
#define RE_Direct RE_Direct_Atlas`;

// (The sky, or the room, reflected, and that much less of their light taken in and given back
// from under the surface)
const SHINE_REFLECTED_GLSL = `
#if defined(USE_ENVMAP) && defined(ENVMAP_TYPE_CUBE_UV)
if (atlasGloss > 0.0) {
    vec3 atlasReflected = atlasReflectance(geometryNormal, geometryViewDir);

    reflectedLight.indirectDiffuse *= 1.0 - atlasReflected;
    reflectedLight.indirectSpecular += atlasReflected * getIBLRadiance(geometryViewDir, geometryNormal, atlasRoughness);
}
#endif`;

// A material's shader drawn from the atlas: each vertex's layer, its texture coordinates, and the
// layer's heights lit as relief; and, with `shine`, glass, metal and slate shining (SHINES)
function fromAtlas(shader, uniforms, { shine = false } = {}) {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float layer;\nflat varying float vLayer;\nflat varying float vShine;\nvarying vec2 vAtlasUv;")
        .replace("#include <uv_vertex>", `#include <uv_vertex>\nvLayer = mod(layer, ${SHINE_STEP.toFixed(1)});\nvShine = floor(layer / ${SHINE_STEP.toFixed(1)});\nvAtlasUv = uv;`);
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform highp sampler2DArray atlasMap;\nuniform float atlasRelief;\nflat varying float vLayer;\nvarying vec2 vAtlasUv;\n${RELIEF_GLSL}`)
        .replace("#include <map_fragment>", "vec4 atlasTexel = texture(atlasMap, vec3(vAtlasUv, vLayer));\ndiffuseColor.rgb *= atlasTexel.rgb;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
if (atlasRelief > 0.0) {
    // (How the height changes to the next pixel across and up, from the one read of it: as much as
    // reading the heights there again would say, for nothing more read)
    vec2 slope = vec2(dFdx(atlasTexel.a), dFdy(atlasTexel.a)) * atlasRelief;

    normal = reliefNormal(-vViewPosition, normal, slope, faceDirection);
}`);

    if (shine) {
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>\n${SHINE_GLSL}`)
            .replace("#include <lights_lambert_pars_fragment>", `#include <lights_lambert_pars_fragment>\n${SHINE_DIRECT_GLSL}`)
            .replace("#include <lights_lambert_fragment>", "atlasShine(diffuseColor);\n#include <lights_lambert_fragment>")
            .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${SHINE_REFLECTED_GLSL}`)
            .replace("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;", "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;");
    }
}

const _colour = new THREE.Color();

let glowing = null;

/**
 * The one material every light is drawn with (GLOWS: lamps, faerie fire, lava): unlit, each
 * vertex its own colour, shown as it is (untouched by the tone mapping, which would dull and
 * pale a light to a lit surface's colours, as the flames indoors are: interiors3d.js).
 */
export function glowMaterial() {
    if (!glowing) {
        glowing = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
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
 * texture coordinates scaled to the material's, a `layer` for each vertex (and its shine), and
 * its colours (white if it had none) times the material's own if it's a plain colour (or its tint's
 * if it's tinted). Null if it can't be.
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
        _colour.copy(material.color);

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
    result.setAttribute("layer", new THREE.BufferAttribute(new Float32Array(count).fill(layer + SHINE_STEP * shineOf(material)), 1));

    return result;
}
