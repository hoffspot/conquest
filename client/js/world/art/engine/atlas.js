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
// Windows are lit at night (WINDOWS): a warm glow from within each window's glass, each window
// its own (its seed rides on its layer too, WINDOW_STEP times it), coming on through the dusk one
// after another, a few going out late in the night; a tavern's, a church's, a guild's, a keep's
// and the lanterns lit all night (WINDOW_LIGHT says how far the evening's got: daytime.js).
//
// Meshes built of other materials (the tavern's painted signs, KayKit's props, the forge's
// glowing coals) keep their own: `toAtlas` says which can be drawn with the atlas.

import * as THREE from "three";
import { COLOURS, GLOWS, MATERIALS, paintLayer, TINTS } from "./painters.js";
import { fireLit } from "../../firelight.js";

/** How many pixels square each layer is painted. */
export const LAYER_SIZE = 256;

/** How strongly the layers' heights are lit as relief (0: flat). */
export const RELIEF = 0.7;

/**
 * The layers, in order: every textured material built with, the old stone among them last (AGED),
 * then the white of plain colours.
 */
export const LAYERS = Object.freeze([
    ...Object.keys(MATERIALS).filter((name) => !MATERIALS[name].ground && !MATERIALS[name].old),
    ...Object.keys(MATERIALS).filter((name) => MATERIALS[name].old),
    "plain",
]);

const index = new Map(LAYERS.map((name, k) => [name, k]));
const PLAIN = index.get("plain");

/**
 * Old stone (MATERIALS' `old`: the ruins', never the peoples' kept-up towns) weathered where it's
 * drawn (the research report behind M7b: "Moss, streaks and ivy cost arithmetic, not draws"): the
 * layers from `from` to `to`; moss on what faces up, in the joints between its blocks near to
 * (out to `near`, metres, fading over the last half) and a little on what faces north, in patches
 * (`patch`: their size, metres) and towards `moss` (sRGB), as much as `amount`; dark streaks
 * down its faces (`runs` metres apart or so), as dark as `streak`.
 */
export const AGED = Object.freeze({
    from: LAYERS.findIndex((name) => MATERIALS[name]?.old),
    to: PLAIN,
    moss: 0x3f4a2a,
    amount: 0.85,
    north: 0.3,
    patch: 1.6,
    near: 70,
    runs: 0.45,
    streak: 0.35,
});

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

/**
 * Windows, lit at night: their glass (by material name; a tinted one as the one it's tinted from).
 * Each window's seed (1 to WINDOW_SEEDS: when it comes on and goes out; ALL_NIGHT: lit all night)
 * rides on its layer, WINDOW_STEP times it (0: not a window).
 */
export const WINDOWS = Object.freeze(["glass", "glass-lit", "glass-green", "glass-violet", "leaded"]);
export const WINDOW_STEP = SHINE_STEP * 8;
export const WINDOW_SEEDS = 15;
export const ALL_NIGHT = WINDOW_SEEDS + 1;

/** The buildings (landmarks, by name) lit all night, and the lanterns (by material). */
export const LIT_ALL_NIGHT = Object.freeze({ landmarks: ["tavern", "church", "guild", "keep"], materials: ["glass-lit"] });

/**
 * How a lit window glows: its light's colour (sRGB) and strength, and how much it flickers (a
 * hearth's or a candle's light within).
 */
export const WINDOW_GLOW = Object.freeze({ colour: 0xff8c38, strength: 0.95, flicker: 0.12 });

/**
 * The windows' light, shared by every building's material: x how far the evening's lit them (0 by
 * day, 1 all night: daytime.js windowsAt), y how late in the night it is (0 to 1), z the time
 * (seconds) for their flicker.
 */
export const WINDOW_LIGHT = { value: new THREE.Vector4() };

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
    const uniforms = { atlasMap: { value: atlasTexture() }, atlasRelief: { value: RELIEF }, windowLight: WINDOW_LIGHT };

    material.name = "atlas";
    material.shadowSide = THREE.DoubleSide;
    material.userData.atlas = uniforms.atlasMap.value;
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        fromAtlas(shader, uniforms, { shine: true, windows: true });
        fireLit(shader);
    };
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
        fireLit(shader);
    };
    material.customProgramCacheKey = () => "wilds";
    wilds = material;

    return material;
}

let rock = null;

/**
 * How the cliffs' picture is laid on (cliffMaterial): how big the patches of rock are that each
 * read it from a place of their own (metres, about), so its copies don't line up in rows; and how
 * big the patches it's lighter and darker in are (metres: broad ones and smaller), and how much
 * lighter or darker (of its colour).
 */
export const ROCK = Object.freeze({ shifts: 9, patches: [23, 7], mottle: 0.2 });

/**
 * The cliffs' material (kits/cliffs.js): drawn from the atlas as the shared one is, but its picture
 * laid on from three sides by where each pixel is in the world, each side's as much as the rock
 * faces that way, not by texture coordinates: a skin of rock bent every way can't have a picture
 * laid flat on it without seams or smears. Each vertex's first texture coordinate is how many
 * copies of the picture there are to a metre.
 */
export function cliffMaterial() {
    if (rock) {
        return rock;
    }

    const { uniforms } = atlasMaterial().userData;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });

    material.name = "cliffs";
    material.shadowSide = THREE.DoubleSide;
    material.userData.atlas = uniforms.atlasMap.value;
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = (shader) => {
        fromAtlas(shader, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vRockAt;\nvarying vec3 vRockFacing;\nvarying float vRockScale;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvRockAt = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRockFacing = objectNormal;\nvRockScale = uv.x;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vRockAt;\nvarying vec3 vRockFacing;\nvarying float vRockScale;")
            .replace("void main() {", `${ROCK_READ_GLSL}\nvoid main() {`)
            .replace("vec4 atlasTexel = texture(atlasMap, vec3(vAtlasUv, vLayer));", ROCK_GLSL);
        fireLit(shader);
    };
    material.customProgramCacheKey = () => "cliffs";
    rock = material;

    return material;
}

// The rock's picture read at a place on it (cliffMaterial), as its patch of rock reads it: from
// one of eight places (`which`: its whole part, and how far to the next, its fraction), the two
// it's between blended where one patch gives way to the next (Inigo Quilez's "texture
// repetition", technique 3), how fast it changes across the screen given (it's read in a branch)
const ROCK_READ_GLSL = `
vec4 rockRead(vec2 at, vec2 across, vec2 down, float which) {
    float first = floor(which);
    vec4 a = textureGrad(atlasMap, vec3(at + sin(vec2(3.0, 7.0) * first), vLayer), across, down);
    vec4 b = textureGrad(atlasMap, vec3(at + sin(vec2(3.0, 7.0) * (first + 1.0)), vLayer), across, down);

    return mix(a, b, smoothstep(0.2, 0.8, fract(which) - 0.1 * dot(a.rgb - b.rgb, vec3(1.0))));
}`;

// The rock's picture from three sides (cliffMaterial): seen from east and west, from above and
// below, from north and south, the way the rock faces most counting most (its facing to the
// fourth: little of a side's picture where the rock's turned from it, so they don't blur
// together, and none read where there's next to none of it); each patch of the rock reading it
// from a place of its own (rockRead); and the rock lighter and darker in broad patches
// (ROCK.patches metres across, as much as ROCK.mottle), so no copy's like the next
const ROCK_GLSL = `
vec3 rockSides = abs(normalize(vRockFacing));
rockSides *= rockSides;
rockSides *= rockSides;
rockSides /= rockSides.x + rockSides.y + rockSides.z;
vec3 rockAt = vRockAt * vRockScale;
vec3 rockAcross = dFdx(rockAt);
vec3 rockDown = dFdy(rockAt);
float rockWhich = agedNoise(vRockAt.xz / ${ROCK.shifts.toFixed(1)} + vRockAt.y / ${(ROCK.shifts * 1.3).toFixed(1)}) * 8.0;
vec4 atlasTexel = vec4(0.0);
if (rockSides.x > 0.01) atlasTexel += rockRead(rockAt.zy, rockAcross.zy, rockDown.zy, rockWhich) * rockSides.x;
if (rockSides.y > 0.01) atlasTexel += rockRead(rockAt.xz, rockAcross.xz, rockDown.xz, rockWhich + 3.0) * rockSides.y;
if (rockSides.z > 0.01) atlasTexel += rockRead(rockAt.xy, rockAcross.xy, rockDown.xy, rockWhich + 5.0) * rockSides.z;
atlasTexel /= max(0.01, dot(rockSides, step(0.01, rockSides)));
float rockPatch = agedNoise(vRockAt.xz / ${ROCK.patches[0].toFixed(1)} + vRockAt.y / ${(ROCK.patches[0] * 1.3).toFixed(1)}) * 0.6 + agedNoise(vRockAt.zx / ${ROCK.patches[1].toFixed(1)} + vRockAt.yy / ${(ROCK.patches[1] * 1.3).toFixed(1)} + 3.1) * 0.4;
atlasTexel.rgb *= ${(1 - ROCK.mottle).toFixed(2)} + ${(ROCK.mottle * 2).toFixed(2)} * rockPatch;`;

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

// Smooth noise in the shader (0 to 1, a lattice a unit apart), for old stone's moss and streaks
const AGED_NOISE_GLSL = `
float agedHash(vec2 p) {
    p = fract(p * vec2(0.1031, 0.1030));
    p += dot(p, p.yx + 33.33);
    return fract((p.x + p.y) * p.x);
}
float agedNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(agedHash(i), agedHash(i + vec2(1.0, 0.0)), f.x), mix(agedHash(i + vec2(0.0, 1.0)), agedHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

// Old stone weathered (AGED), once its normal's known: where it is in the world and which way it
// faces from the view's (its relief left out), the moss and the streaks over its colour
const AGED_GLSL = `
if (vLayer > ${(AGED.from - 0.5).toFixed(1)} && vLayer < ${(AGED.to - 0.5).toFixed(1)}) {
    vec3 agedAt = (vec4(-vViewPosition, 0.0) * viewMatrix).xyz + cameraPosition;
    float agedUp = smoothstep(0.35, 0.85, dot(nonPerturbedNormal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    float agedNorth = max(0.0, dot(nonPerturbedNormal, (viewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz));
    float agedNear = 1.0 - smoothstep(${(AGED.near / 2).toFixed(1)}, ${AGED.near.toFixed(1)}, length(vViewPosition));
    float agedPatch = agedNoise((agedAt.xz + agedAt.y * 0.6) / ${AGED.patch.toFixed(2)});
    float agedFine = agedNoise((agedAt.xz + agedAt.yy) * 3.1);
    float agedJoint = smoothstep(0.75, 0.95, 1.0 - atlasTexel.a);
    float agedMoss = clamp(agedUp * (0.5 + 0.7 * agedPatch) + agedJoint * (0.25 + 0.6 * agedPatch) * agedNear + agedNorth * ${AGED.north.toFixed(2)} * agedPatch, 0.0, 1.0)
        * smoothstep(0.2, 0.55, agedPatch + 0.3 * (agedFine - 0.5));
    float agedStreak = smoothstep(0.55, 0.85, agedNoise(vec2((agedAt.x + agedAt.z) / ${AGED.runs.toFixed(2)}, agedAt.y * 0.2))) * (1.0 - agedUp) * agedNear;

    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${new THREE.Color(AGED.moss).toArray().map((v) => v.toFixed(4)).join(", ")}) * (0.75 + 0.5 * agedFine), agedMoss * ${AGED.amount.toFixed(2)});
    diffuseColor.rgb *= 1.0 - ${AGED.streak.toFixed(2)} * agedStreak;
}`;

// A window's glow at night (WINDOWS): when it's lit (its seed against how far the evening's got,
// and how late it is), flickering a little, where its glass is (not its leading); none by day
const WINDOW_GLSL = `
uniform vec4 windowLight;
flat varying float vWindow;

vec3 atlasWindowGlow(const in vec3 texel) {
    if (vWindow < 0.5 || windowLight.x <= 0.0) return vec3(0.0);

    float allNight = step(${(ALL_NIGHT - 0.5).toFixed(1)}, vWindow);
    float seed = fract(vWindow * 0.618034);
    float on = mix(smoothstep(0.1 + 0.75 * seed, 0.16 + 0.75 * seed, windowLight.x)
        * (1.0 - step(0.65, fract(seed * 3.1)) * step(0.55 + 0.4 * fract(seed * 7.3), windowLight.y)), smoothstep(0.0, 0.1, windowLight.x), allNight);
    float flicker = 1.0 - ${WINDOW_GLOW.flicker.toFixed(2)} * (0.5 + 0.5 * sin(windowLight.z * (1.7 + 2.3 * seed) + seed * 40.0) * sin(windowLight.z * (3.1 + 1.9 * seed)));
    float glass = smoothstep(0.08, 0.3, dot(texel, vec3(0.3, 0.59, 0.11)));

    return vec3(${new THREE.Color(WINDOW_GLOW.colour).toArray().map((v) => v.toFixed(4)).join(", ")}) * ${WINDOW_GLOW.strength.toFixed(2)} * on * flicker * glass;
}`;

// A material's shader drawn from the atlas: each vertex's layer, its texture coordinates, and the
// layer's heights lit as relief, old stone weathered (AGED); with `shine`, glass, metal and slate
// shining (SHINES); with `windows`, windows lit at night (WINDOWS)
function fromAtlas(shader, uniforms, { shine = false, windows = false } = {}) {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float layer;\nflat varying float vLayer;\nflat varying float vShine;\nflat varying float vWindow;\nvarying vec2 vAtlasUv;")
        .replace("#include <uv_vertex>", `#include <uv_vertex>\nvLayer = mod(layer, ${SHINE_STEP.toFixed(1)});\nvShine = mod(floor(layer / ${SHINE_STEP.toFixed(1)}), 8.0);\nvWindow = floor(layer / ${WINDOW_STEP.toFixed(1)});\nvAtlasUv = uv;`);
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform highp sampler2DArray atlasMap;\nuniform float atlasRelief;\nflat varying float vLayer;\nvarying vec2 vAtlasUv;\n${RELIEF_GLSL}\n${AGED_NOISE_GLSL}`)
        .replace("#include <map_fragment>", "vec4 atlasTexel = texture(atlasMap, vec3(vAtlasUv, vLayer));\ndiffuseColor.rgb *= atlasTexel.rgb;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
if (atlasRelief > 0.0) {
    // (How the height changes to the next pixel across and up, from the one read of it: as much as
    // reading the heights there again would say, for nothing more read)
    vec2 slope = vec2(dFdx(atlasTexel.a), dFdy(atlasTexel.a)) * atlasRelief;

    normal = reliefNormal(-vViewPosition, normal, slope, faceDirection);
}
${AGED_GLSL}`);

    if (shine) {
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>\n${SHINE_GLSL}`)
            .replace("#include <lights_lambert_pars_fragment>", `#include <lights_lambert_pars_fragment>\n${SHINE_DIRECT_GLSL}`)
            .replace("#include <lights_lambert_fragment>", "atlasShine(diffuseColor);\n#include <lights_lambert_fragment>")
            .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${SHINE_REFLECTED_GLSL}`)
            .replace("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;", "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;");
    }

    if (windows) {
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>\n${WINDOW_GLSL}`)
            .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += atlasWindowGlow(atlasTexel.rgb);");
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

// Each window's seed, for each corner of a (non-indexed) geometry of windows' glass: its windows
// told apart as the triangles that touch (a pane, or the panes of a leaded window, or a lantern's
// glass), each its own seed from where it is (1 to WINDOW_SEEDS); or all lit all night
function windowSeeds(geometry, allNight) {
    const count = geometry.attributes.position.count;
    const seeds = new Float32Array(count);

    if (allNight) {
        return seeds.fill(ALL_NIGHT);
    }

    const at = geometry.attributes.position.array;
    const triangles = Math.floor(count / 3);
    const parent = Int32Array.from({ length: triangles }, (_, t) => t);
    const root = (t) => {
        while (parent[t] !== t) {
            parent[t] = parent[parent[t]];
            t = parent[t];
        }

        return t;
    };
    const corners = new Map();

    for (let i = 0; i < triangles * 3; i++) {
        const key = `${Math.round(at[i * 3] * 1000)},${Math.round(at[i * 3 + 1] * 1000)},${Math.round(at[i * 3 + 2] * 1000)}`;
        const t = Math.floor(i / 3);
        const other = corners.get(key);

        if (other === undefined) {
            corners.set(key, t);
        } else {
            parent[root(t)] = root(other);
        }
    }

    // (Each window's middle, in centimetres, hashed)
    const sums = new Map();

    for (let i = 0; i < triangles * 3; i++) {
        const pane = root(Math.floor(i / 3));
        const sum = sums.get(pane) ?? [0, 0, 0, 0];

        sum[0] += at[i * 3];
        sum[1] += at[i * 3 + 1];
        sum[2] += at[i * 3 + 2];
        sum[3]++;
        sums.set(pane, sum);
    }

    const seedOf = new Map();

    for (const [pane, [x, y, z, n]] of sums) {
        let hash = Math.imul(Math.round((x / n) * 100), 73856093) ^ Math.imul(Math.round((y / n) * 100), 19349663) ^ Math.imul(Math.round((z / n) * 100), 83492791);

        hash = Math.imul(hash ^ (hash >>> 15), 2246822519) >>> 0;
        seedOf.set(pane, 1 + (hash % WINDOW_SEEDS));
    }

    for (let i = 0; i < triangles * 3; i++) {
        seeds[i] = seedOf.get(root(Math.floor(i / 3)));
    }

    return seeds;
}

/**
 * A (non-indexed) geometry drawn in `material` made ready to be drawn with the atlas instead: its
 * texture coordinates scaled to the material's, a `layer` for each vertex (and its shine, and if
 * it's a window's glass, its seed: lit all night if `allNight`), and its colours (white if it had
 * none) times the material's own if it's a plain colour (or its tint's if it's tinted). Null if it
 * can't be.
 */
export function toAtlas(geometry, material, { allNight = false } = {}) {
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
    const layers = new Float32Array(count).fill(layer + SHINE_STEP * shineOf(material));
    if (WINDOWS.includes(TINTS[material.name]?.from ?? material.name)) {
        const seeds = windowSeeds(geometry, allNight || LIT_ALL_NIGHT.materials.includes(material.name));

        for (let i = 0; i < count; i++) {
            layers[i] += WINDOW_STEP * seeds[i];
        }
    }

    result.setAttribute("layer", new THREE.BufferAttribute(layers, 1));

    return result;
}
