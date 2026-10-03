// The lights out of doors at night (the terrain plan's M7e, §9 Day and night: torches by doors and
// gates, lanterns, camp fires): where the kits put them (a built piece's userData.lights, as its
// chimneys' tops are its userData.smoke), each drawn as its flame (torches) and a soft glow round
// it, all of a chunk's in one mesh of each, lit as the evening comes (atlas.js WINDOW_LIGHT, as the
// windows are) and flickering; and the two that matter most where the player is lighting what's
// round them (the view's two lamps, outdoors at night: View.lightNear), the rest only glowing.
//
// Only for the eye: the rules know nothing of them (night sight comes in M7e-3).

import * as THREE from "three";
import { WINDOW_LIGHT } from "./art/engine/atlas.js";

/**
 * Each kind of light: its colour when it flares and when it dies down (its embers': sRGB), how
 * strong its light is on what's round it (candela, a point light's) and how far it reaches
 * (metres), how wide its glow is (metres), its flame (metres wide, high; none for a lantern's,
 * which is behind its glass, or a camp's fire, which draws its own), and its flicker: how quick
 * (times a torch's) and how deep (its strength from 1 - depth / 2 to 1 + depth / 2; fireFlicker
 * wanders by about 0.15 either side of a half, so a torch's light by about 14% either side of
 * its strength, a camp fire's 12%, a lantern's behind its glass 4%).
 */
export const LIGHTS = Object.freeze({
    lantern: { colour: 0xffbe78, embers: 0xff8a3c, strength: 3, reach: 9, glow: 0.9, flame: null, flicker: { rate: 0.6, depth: 0.3 } },
    torch: { colour: 0xffa04a, embers: 0xff5a18, strength: 4, reach: 11, glow: 1.3, flame: [0.18, 0.4], flicker: { rate: 1, depth: 0.9 } },
    fire: { colour: 0xff9440, embers: 0xff4c12, strength: 8, reach: 14, glow: 2.6, flame: null, flicker: { rate: 0.8, depth: 0.8 } },
});

/**
 * The lights of what's been built (a built object, its world matrix up to date: each part whose
 * userData.lights lists, [x, y, z, kind] in its own pixels), in the world: [{ x, y, z, kind }]
 * (metres).
 */
export function lightsOf(object) {
    const lights = [];
    const point = new THREE.Vector3();

    object.traverse((node) => {
        for (const [x, y, z, kind] of node.userData.lights ?? []) {
            point.set(x, y, z).applyMatrix4(node.matrixWorld);
            lights.push({ x: point.x, y: point.y, z: point.z, kind });
        }
    });

    return lights;
}

/** A light's own seed (0 to 1, from where it is: the same every time), for its flicker. */
export function seedOf({ x, y, z }) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;

    return s - Math.floor(s);
}

// Fire's flicker, the same sums here and on the GPU (FLICKER_GLSL), so the light a flame casts
// rises and falls with the flame drawn: smooth noise at three rates (a slow swell, a quicker
// guttering and a fast flutter), each light its own way. (The hash is of a whole number taken
// round 289, so the GPU's 32-bit floats give what JavaScript's do, however long the game's run.)
const fract = (x) => x - Math.floor(x);

function fireHash(n) {
    let h = fract((n - Math.floor(n / 289) * 289) * 0.1031);

    h *= h + 33.33;
    h *= h + h;

    return fract(h);
}

function fireNoise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);

    return fireHash(i) + (fireHash(i + 1) - fireHash(i)) * u;
}

/**
 * How a fire flickers (`seed`: its own, 0 to 1; `time` in seconds, times its kind's rate): 0 (died
 * down) to 1 (flared up), a half on the whole.
 */
export function fireFlicker(seed, time) {
    const t = time + seed * 61;

    return fireNoise(t * 1.9) * 0.45 + fireNoise(t * 5.3 + 17) * 0.35 + fireNoise(t * 11.7 + 41) * 0.2;
}

const FLICKER_GLSL = /* glsl */ `
float fireHash(float n) {
    float h = fract(mod(n, 289.0) * 0.1031);

    h *= h + 33.33;
    h *= h + h;

    return fract(h);
}

float fireNoise(float x) {
    float i = floor(x);
    float f = x - i;
    float u = f * f * (3.0 - 2.0 * f);

    return fireHash(i) + (fireHash(i + 1.0) - fireHash(i)) * u;
}

float fireFlicker(float seed, float time) {
    float t = time + seed * 61.0;

    return fireNoise(t * 1.9) * 0.45 + fireNoise(t * 5.3 + 17.0) * 0.35 + fireNoise(t * 11.7 + 41.0) * 0.2;
}`;

/**
 * A light of a kind now (`seed`: seedOf's; `time`: the drawing's, WINDOW_LIGHT.z; `lit`: how lit
 * the evening has it, 0 by day): { flicker (fireFlicker's), strength (times its kind's) }, as its
 * flame and glow are drawn.
 */
export function fireOf(kind, seed, time, lit, into = { flicker: 0, strength: 0 }) {
    const { rate, depth } = LIGHTS[kind].flicker;

    into.flicker = fireFlicker(seed, time * rate);
    into.strength = lit * (1 - depth / 2 + depth * into.flicker);

    return into;
}

const _embers = new THREE.Color();

/**
 * The colour a light gives at a flicker (fireFlicker's): towards its embers' as it dies down, its
 * own as it flares (linear, into `into`).
 */
export function fireColour(kind, flicker, into = new THREE.Color()) {
    return into.set(LIGHTS[kind].embers).lerp(_embers.set(LIGHTS[kind].colour), Math.min(1, Math.max(0, 0.2 + flicker)));
}

// The flames: each a square turned to face the camera (upright), its flame worked out in the
// fragment shader from noise rising through it (as the insides' flames are: interiors3d.js),
// taller and brighter and yellower as it flares, lower and redder as it dies down (its flicker,
// the light it casts's: fireFlicker); lit as the evening has it, fading out far off
const FLAME_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec3 flame;
attribute vec2 flicker;
uniform vec4 windowLight;
varying vec2 vUv;
varying float vSeed;
varying float vLit;
varying float vFlicker;
${FLICKER_GLSL}

void main() {
    float flick = fireFlicker(flame.z, windowLight.z * flicker.x);
    vec4 seen = modelViewMatrix * vec4(position + vec3(0.0, corner.y * flame.y * (0.6 + 0.8 * flick), 0.0), 1.0);

    seen.x += corner.x * flame.x * 0.5 * (0.85 + 0.3 * flick);
    vUv = vec2(corner.x * 0.5 + 0.5, corner.y);
    vSeed = flame.z;
    vFlicker = 1.0 - flicker.y * 0.5 + flicker.y * flick;
    vLit = windowLight.x * (1.0 - smoothstep(60.0, 140.0, -seen.z));
    gl_Position = vLit > 0.001 ? projectionMatrix * seen : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FLAME_FRAGMENT = /* glsl */ `
uniform vec4 windowLight;
varying vec2 vUv;
varying float vSeed;
varying float vLit;
varying float vFlicker;

float flameHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float flameNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    return mix(mix(flameHash(i), flameHash(i + vec2(1.0, 0.0)), f.x), mix(flameHash(i + vec2(0.0, 1.0)), flameHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
    vec2 uv = vUv;
    float t = windowLight.z;
    float n = flameNoise(vec2(uv.x * 3.2 + vSeed * 17.0, uv.y * 2.4 - t * 2.6)) * 0.65 + flameNoise(vec2(uv.x * 6.4, uv.y * 4.8 - t * 4.1 + vSeed * 9.0)) * 0.35;
    float sway = (n - 0.5) * 0.45 * uv.y;
    float width = 0.44 * (1.0 - uv.y) + 0.04;
    float body = smoothstep(width, width * 0.25, abs(uv.x - 0.5 + sway));
    float top = smoothstep(1.0, 0.2, uv.y + (n - 0.5) * 0.55);
    float a = clamp(body * top * 1.3, 0.0, 1.0) * vLit;

    if (a < 0.02) discard;

    // (Its heart yellow-white, its tips red; yellower as it flares)
    float heat = smoothstep(0.25, 0.95, a) * (1.0 - uv.y * 0.6) * (0.6 + 0.5 * vFlicker);
    vec3 colour = mix(vec3(0.95, 0.22, 0.02), vec3(1.0, 0.86, 0.42), clamp(heat, 0.0, 1.0));

    gl_FragColor = vec4(colour * 1.35 * a * vFlicker, 1.0);
}`;

// Each light's glow: a soft round of its colour, as wide as its kind's, swelling and brightening
// with its flicker (as its flame and the light it casts do), redder as it dies down; never bigger
// on the screen than a phone draws a point; lit as the evening has it, fading out far off
const GLOW_VERTEX = /* glsl */ `
attribute vec4 glow;
attribute vec3 tint;
attribute vec3 embers;
uniform vec4 windowLight;
uniform float glowScale;
varying vec3 vTint;
${FLICKER_GLSL}

void main() {
    vec4 seen = modelViewMatrix * vec4(position, 1.0);
    float flick = fireFlicker(glow.z, windowLight.z * glow.w);
    float strength = 1.0 - glow.y * 0.5 + glow.y * flick;
    float lit = windowLight.x * (1.0 - smoothstep(60.0, 150.0, -seen.z));

    gl_Position = lit > 0.001 ? projectionMatrix * seen : vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = min(256.0, glow.x * (0.85 + 0.3 * flick) * glowScale / max(0.3, -seen.z));
    vTint = mix(embers, tint, clamp(0.2 + flick, 0.0, 1.0)) * lit * strength;
}`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec3 vTint;

void main() {
    vec2 at = gl_PointCoord * 2.0 - 1.0;
    float away = dot(at, at);

    if (away > 1.0) discard;

    gl_FragColor = vec4(vTint * pow(1.0 - away, 3.0) * 0.5, 1.0);
}`;

/**
 * How many pixels a metre is a metre from the camera (the view's: its picture's height over twice
 * the tangent of half its field of view), for the glows' size: set by the game.
 */
export const GLOW_SCALE = { value: 800 };

let materials = null;

// The flames' and the glows' materials, one each for every chunk's
function materialsOf() {
    materials ??= {
        flames: new THREE.ShaderMaterial({
            name: "flames",
            uniforms: { windowLight: WINDOW_LIGHT },
            vertexShader: FLAME_VERTEX,
            fragmentShader: FLAME_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            toneMapped: false,
        }),
        glows: new THREE.ShaderMaterial({
            name: "glows",
            uniforms: { windowLight: WINDOW_LIGHT, glowScale: GLOW_SCALE },
            vertexShader: GLOW_VERTEX,
            fragmentShader: GLOW_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        }),
    };

    return materials;
}

/**
 * What's drawn of some lights (`lights`: lightsOf's, world metres): a group of their flames (those
 * that have them) and their glows, in the world's coordinates; or null if there are none.
 */
export function lightsMesh(lights) {
    if (!lights.length) {
        return null;
    }

    const group = new THREE.Group();
    const { flames: flameMaterial, glows: glowMaterial } = materialsOf();
    const flaming = lights.filter(({ kind }) => LIGHTS[kind]?.flame);
    const colour = new THREE.Color();

    group.name = "lights";

    if (flaming.length) {
        const positions = new Float32Array(flaming.length * 12);
        const corners = new Float32Array(flaming.length * 8);
        const flames = new Float32Array(flaming.length * 12);
        const flickers = new Float32Array(flaming.length * 8);
        const indices = new Uint32Array(flaming.length * 6);

        flaming.forEach((light, n) => {
            const { x, y, z, kind } = light;
            const [width, height] = LIGHTS[kind].flame;
            const { rate, depth } = LIGHTS[kind].flicker;

            for (let c = 0; c < 4; c++) {
                positions.set([x, y, z], (n * 4 + c) * 3);
                corners.set([c % 2 ? 1 : -1, c < 2 ? 0 : 1], (n * 4 + c) * 2);
                flames.set([width, height, seedOf(light)], (n * 4 + c) * 3);
                flickers.set([rate, depth], (n * 4 + c) * 2);
            }

            indices.set([n * 4, n * 4 + 1, n * 4 + 2, n * 4 + 2, n * 4 + 1, n * 4 + 3], n * 6);
        });

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("corner", new THREE.BufferAttribute(corners, 2));
        geometry.setAttribute("flame", new THREE.BufferAttribute(flames, 3));
        geometry.setAttribute("flicker", new THREE.BufferAttribute(flickers, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeBoundingSphere();
        geometry.boundingSphere.radius += 1;

        const mesh = new THREE.Mesh(geometry, flameMaterial);

        mesh.name = "flames";
        mesh.renderOrder = 6;
        group.add(mesh);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(lights.flatMap(({ x, y, z, kind }) => [x, y + (LIGHTS[kind].flame?.[1] ?? 0) * 0.4, z]), 3));
    geometry.setAttribute("glow", new THREE.Float32BufferAttribute(lights.flatMap((light) => [LIGHTS[light.kind].glow, LIGHTS[light.kind].flicker.depth, seedOf(light), LIGHTS[light.kind].flicker.rate]), 4));
    geometry.setAttribute("tint", new THREE.Float32BufferAttribute(lights.flatMap(({ kind }) => colour.set(LIGHTS[kind].colour).toArray()), 3));
    geometry.setAttribute("embers", new THREE.Float32BufferAttribute(lights.flatMap(({ kind }) => colour.set(LIGHTS[kind].embers).toArray()), 3));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += 3;

    const points = new THREE.Points(geometry, glowMaterial);

    points.name = "glows";
    points.renderOrder = 6;
    group.add(points);

    return group;
}

/**
 * Of some lights (lightsOf's, world metres), the `count` nearest `near` ({ x, y, z }) within their
 * reach, nearest first: [{ light, distance }] (into `into`).
 */
export function nearestLights(lights, near, count, into = []) {
    into.length = 0;

    for (const light of lights) {
        const distance = Math.hypot(light.x - near.x, light.y - near.y, light.z - near.z);

        if (distance > LIGHTS[light.kind].reach * 1.5) {
            continue;
        }

        let at = into.length;

        while (at > 0 && into[at - 1].distance > distance) {
            at--;
        }

        if (at < count) {
            into.splice(at, 0, { light, distance });
            into.length = Math.min(into.length, count);
        }
    }

    return into;
}
