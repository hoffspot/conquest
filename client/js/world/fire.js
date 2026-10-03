// Fire (the terrain plan's M7e, §9 Day and night: the user, "Real fire is kind of wavy"; the
// research report, "Realistic fire and firelight on phones"): every fire in the game drawn one way,
// the torches, braziers, camp fires, hearths and forges, candles and chandeliers, and the fire
// spells, each its own size and temper.
//
// - **Its flame:** a few tongues of fire (strips turned to the camera, bent in the vertex shader),
//   each growing, licking and falling back on its own, twisting round the fire's middle as it
//   rises, leaning with the breeze (more at its tip, as a flame bends); in the fragment shader the
//   fire in each, noise rising through it and warping it (so it licks), eaten away more the
//   higher it goes (so its tips pinch off as separate tongues), white-yellow where it's hottest,
//   orange, then red at its edges, bright enough for the tone mapping to roll its heart to white.
// - **Its embers:** rising from it as a plume carries them (fast, then slower), drifting and
//   carried on the breeze, cooling from yellow to red to nothing.
// - **Its flicker:** a puff at the rate a fire its size puffs (about 1.6 / √(its width) a second:
//   a torch about 5.6, a camp fire about 1.8), each puff growing slowly and collapsing quickly,
//   the rate wandering, and a slow gust (well under a second's swing) setting how hard it puffs;
//   the same sums here and on the GPU (FIRE_GLSL), so the light it casts (lights.js, view.js)
//   rises and falls with the flame drawn. The light swings far less than the flame does, as real
//   firelight does.
//
// Phones: a torch's flame is a few hundred vertices and, close to, a few thousand pixels, three
// texture reads each (a little tiling noise texture made here, so nothing's downloaded); its
// tongues are fewer the farther off it is, and none past 140 metres (its glow's left); embers are
// points, a handful a fire, gone past 30 metres.

import * as THREE from "three";
import { tiling } from "../core/noise.js";
import { WINDOW_LIGHT } from "./art/engine/atlas.js";
import { BREEZE } from "./cloth.js";

/**
 * Each kind of fire: its flame (metres wide and high), how many tongues it's made of and how far
 * out from its middle they rise, how fast it puffs (a second: about 1.6 / √width), how steadily
 * (1 a torch's; less, a candle's in still air), how readily it leans in the breeze (the breeze's
 * speed at which it starts to: metres a second; a fire indoors none), how hot it burns (its
 * heart's brightness, times a torch's), how many embers rise from it, the smoke over it (smoke.js
 * SMOKES: none, or which), and whether it's lit only at night (as the windows are) or always.
 */
export const FIRES = Object.freeze({
    candle: { width: 0.022, height: 0.06, tongues: 1, spread: 0, rate: 9, steady: 0.25, lean: 0.15, heat: 0.85, embers: 0, smoke: null, night: false, twist: 0 },
    lantern: { width: 0.03, height: 0.07, tongues: 1, spread: 0, rate: 7, steady: 0.35, lean: 1e3, heat: 0.85, embers: 0, smoke: null, night: true, twist: 0 },
    torch: { width: 0.24, height: 0.46, tongues: 3, spread: 0.035, rate: 5.6, steady: 1, lean: 0.28, heat: 0.9, embers: 8, smoke: "torch", night: true, twist: 1 },
    brazier: { width: 0.5, height: 0.66, tongues: 6, spread: 0.13, rate: 2.9, steady: 1, lean: 0.4, heat: 1, embers: 18, smoke: "torch", night: false, twist: 1 },
    fire: { width: 0.85, height: 1.05, tongues: 8, spread: 0.24, rate: 1.8, steady: 1, lean: 0.52, heat: 0.92, embers: 36, smoke: "fire", night: false, twist: 1 },
    hearth: { width: 0.8, height: 0.62, tongues: 7, spread: 0.26, rate: 2.1, steady: 0.9, lean: 1e3, heat: 1, embers: 0, smoke: null, night: false, twist: 0.8 },
    forge: { width: 0.7, height: 0.5, tongues: 6, spread: 0.2, rate: 2.6, steady: 1, lean: 1e3, heat: 1.15, embers: 0, smoke: null, night: false, twist: 0.6 },
    spell: { width: 0.6, height: 1, tongues: 6, spread: 0.2, rate: 3, steady: 1.2, lean: 0.6, heat: 1.25, embers: 20, smoke: null, night: false, twist: 3 },
});

/** The breeze fires lean in: the way it blows (east, south: a unit, as the smoke and flags lean) and how hard (metres a second, before its gusts). */
export const FIRE_WIND = { value: new THREE.Vector4(BREEZE[0], BREEZE[1], 0.6, 0) };

// --- The flicker (the same here and in FIRE_GLSL) ---

const fract = (x) => x - Math.floor(x);

// (The hash of a whole number taken round 289, so the GPU's 32-bit floats give what
// JavaScript's do however long the game's run)
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

const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

/**
 * How a fire is burning now (`seed`: its own, 0 to 1; `rate`: how fast it puffs, a second;
 * `time`: seconds, the drawing's: WINDOW_LIGHT.z): { puff (0 low to 1 at the top of a puff:
 * growing slowly, collapsing quickly, each puff its own size), gust (0 to 1: a slow swell, setting
 * how hard it puffs; squared, so the air's mostly calm and now and then gusty) } (into `into`).
 */
export function fireSignal(seed, rate, time, into = { puff: 0, gust: 0 }) {
    const phase = rate * time + 0.9 * fireNoise(time * 0.37 + seed * 29);
    const p = fract(phase);
    const wave = p < 0.72 ? smooth(0, 0.72, p) : 1 - smooth(0.72, 1, p);

    const gust = fireNoise(time * 0.23 + seed * 13);

    into.gust = gust * gust;
    // (Each puff's size hashed from whole numbers only: the hash makes much of any difference in
    // its last places, so a fraction there would have the GPU's 32 bits puff differently)
    into.puff = (wave * (0.55 + 0.9 * fireHash(Math.floor(phase) + Math.floor(seed * 97)))) / 1.45;

    return into;
}

/**
 * How tall a fire's flame stands now, times its kind's (`steady`: its kind's): as it puffs, as
 * hard as the gust has it, and with the gust.
 */
export function flameHeight({ puff, gust }, steady = 1) {
    return 0.78 + 0.34 * steady * puff * (0.6 + 0.8 * gust) + 0.22 * steady * (gust - 0.5);
}

/**
 * How strong a fire's light is now, times its kind's (`steady`: its kind's): far steadier than
 * its flame (each puff at most 5% either way, the gusts about 11%), as firelight is.
 */
export function fireStrength({ puff, gust }, steady = 1) {
    return 1 + 0.07 * steady * (puff - 0.5) * (0.6 + 0.8 * gust) + 0.22 * Math.min(1, steady) * (gust - 0.5);
}

/** The flicker's sums for the GPU (fireSignal's, flameHeight's: the same as here). */
export const FIRE_GLSL = /* glsl */ `
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

vec2 fireSignal(float seed, float rate, float time) {
    float phase = rate * time + 0.9 * fireNoise(time * 0.37 + seed * 29.0);
    float p = fract(phase);
    float wave = p < 0.72 ? smoothstep(0.0, 0.72, p) : 1.0 - smoothstep(0.72, 1.0, p);

    float gust = fireNoise(time * 0.23 + seed * 13.0);

    return vec2(wave * (0.55 + 0.9 * fireHash(floor(phase) + floor(seed * 97.0))) / 1.45, gust * gust);
}

float flameHeight(vec2 signal, float steady) {
    return 0.78 + 0.34 * steady * signal.x * (0.6 + 0.8 * signal.y) + 0.22 * steady * (signal.y - 0.5);
}

// (How far a fire leans from upright in the breeze (radians): none below the speed it starts to
// at, then as fires in a cross wind lean (cos = 1 / sqrt(speed / that)), four fifths of it, at
// most 70 degrees; the breeze gusting, a gust sweeping along a row of torches)
float fireTilt(vec3 at, float lean, float time, vec4 wind) {
    float speed = wind.z * (0.55 + 0.9 * fireNoise(time * 0.21 + at.x * 0.05 + at.z * 0.031));
    float over = speed / lean;

    return over < 1.0 ? 0.0 : min(acos(inversesqrt(over)) * 0.8, 1.22);
}`;

/** How far a fire leans in the breeze now (radians: fireTilt's, as FIRE_GLSL has it), at `at`. */
export function fireTilt(at, lean, time, wind = FIRE_WIND.value) {
    const speed = wind.z * (0.55 + 0.9 * fireNoise(time * 0.21 + at.x * 0.05 + at.z * 0.031));
    const over = speed / lean;

    return over < 1 ? 0 : Math.min(Math.acos(1 / Math.sqrt(over)) * 0.8, 1.22);
}

// --- The noise the flames burn with: made once, tiling, 128 pixels square ---

let noise = null;

/**
 * The fire's noise (red: broad swells, four across; green: finer, eight across, two octaves; blue:
 * finer still): a DataTexture, made the first time it's wanted.
 */
export function fireNoiseTexture() {
    if (!noise) {
        const size = 128;
        const data = new Uint8Array(size * size * 4);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const [u, v] = [x / size, y / size];

                data.set([tiling(u * 4, v * 4, 4, 911, 2), tiling(u * 8, v * 8, 8, 2711, 2), tiling(u * 16, v * 16, 16, 4133, 1), 1].map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255)), (y * size + x) * 4);
            }
        }

        noise = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        noise.wrapS = THREE.RepeatWrapping;
        noise.wrapT = THREE.RepeatWrapping;
        noise.magFilter = THREE.LinearFilter;
        noise.minFilter = THREE.LinearMipmapLinearFilter;
        noise.generateMipmaps = true;
        noise.needsUpdate = true;
    }

    return noise;
}

// --- The flames ---

// How many segments up each tongue is bent in (twice as many for a fire taller than a man: a
// spell's column, so it bends smoothly)
const SEGMENTS = 6;
const segmentsOf = ({ height }) => (height > 1.6 ? SEGMENTS * 2 : SEGMENTS);

// Each tongue: a strip up from its fire's foot (where it is: `position`, in the mesh's own
// coordinates), turned to face the camera about the upright, its size in metres whatever the
// mesh is scaled to; growing and falling back on its own, licking (a wave running up it),
// twisting round the fire's middle as it rises (how far: its kind's twist), leaning with the
// breeze more the higher up it is; fewer tongues drawn the farther off it is (the first always),
// none past 140 metres
const FLAME_VERTEX = /* glsl */ `
attribute vec2 strip;
attribute vec4 tongue;
attribute vec4 fire;
attribute vec4 temper;
uniform vec4 windowLight;
uniform vec4 fireWind;
uniform float fireSize;
varying vec2 vStrip;
varying float vSeed;
varying float vLit;
varying float vHeat;
varying float vPuff;
varying float vDepth;
${FIRE_GLSL}

void main() {
    float time = windowLight.z;
    vec3 foot = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 signal = fireSignal(fire.x, fire.y, time);
    float away = distance(cameraPosition, foot);
    // (temper: x its share among its fire's tongues (0 the first), y its kind's steadiness, z how
    // far it twists, w its heat)
    float kept = 1.0 - 0.85 * smoothstep(8.0, 40.0, away);
    float shown = smoothstep(temper.x - 0.15, temper.x, kept);
    float lit = mix(1.0, windowLight.x, fire.w) * (1.0 - smoothstep(60.0, 140.0, away)) * shown * smoothstep(0.0, 0.25, fireSize);
    // (Its own life: growing and falling back out of step with the others, as the whole fire
    // puffs; its height, as it is now)
    float own = fireNoise(time * fire.y * 0.33 + temper.x * 17.0 + fire.x * 31.0);
    float tall = tongue.w * (0.55 + 0.6 * own) * flameHeight(signal, temper.y) * fireSize;
    float up = strip.y;
    // (Twisting round the middle as it rises, drawing in towards it: about 0.6 turns a second,
    // its twist rising up it, as a vortex reads; a spell's whirling faster, but never more than
    // a turn or so from its foot to its tip, so its tongues stay tongues)
    float coil = min(temper.z, 1.3) * 5.5;
    float turn = tongue.x + up * coil - time * temper.z * (4.0 + 1.5 * temper.x) * (0.6 + 0.4 / max(temper.z, 1.0));
    float round = tongue.y * (1.0 - 0.6 * up) * mix(0.5, 1.0, fireSize);
    vec3 centre = foot + vec3(cos(turn) * round, up * tall, sin(turn) * round);
    // (Leaning with the breeze, its foot held and its tip bent the most, and a little shorter)
    float tilt = fireTilt(foot, fire.z, time, fireWind);
    float bend = tan(tilt) * tall;
    centre.xz += fireWind.xy * bend * pow(up, 1.5);
    centre.y -= (1.0 - pow(cos(tilt), 0.3)) * up * tall;
    // (Turned to the camera across the way it runs (bent as it is); licking: a wave running up
    // it, more at its tip)
    vec3 along = vec3(-coil * round * sin(turn), tall, coil * round * cos(turn)) + vec3(fireWind.x, 0.0, fireWind.y) * 1.5 * bend * sqrt(up);
    vec3 toCamera = cameraPosition - centre;
    vec3 across = cross(along, toCamera);
    across = dot(across, across) > 1e-8 ? normalize(across) : vec3(1.0, 0.0, 0.0);
    float lick = sin(up * 6.5 - time * fire.y * 1.4 + tongue.x * 3.0 + fire.x * 11.0) * 0.6 + (fireNoise(up * 2.7 - time * fire.y * 0.8 + temper.x * 7.0 + fire.x * 5.0) - 0.5) * 1.4;
    float wide = tongue.z * (1.0 - 0.55 * up) * (0.85 + 0.3 * signal.x) * mix(0.4, 1.0, fireSize);
    vec3 corner = centre + across * (strip.x * wide * 0.5 + lick * 0.28 * tongue.z * up);

    vStrip = strip;
    vSeed = fract(fire.x * 7.13 + temper.x * 3.71);
    // (The back of the twist a little dimmer: tongues in front of and behind each other)
    vDepth = dot(vec3(cos(turn), 0.0, sin(turn)), normalize(vec3(toCamera.x, 0.0, toCamera.z) + vec3(1e-4, 0.0, 0.0)));
    vLit = lit;
    vHeat = temper.w;
    vPuff = signal.x;
    gl_Position = lit > 0.001 && tall > 0.001 ? projectionMatrix * viewMatrix * vec4(corner, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

// The fire in each tongue: noise rising through it, warping it from side to side (more the higher
// up: so it licks) and eating it away (more the higher up: so its tip pinches off, a tongue of its
// own); hottest low in its middle (white-yellow, the tone mapping rolling its brightest to white),
// orange, then red at its edges and tip; brighter as it puffs
const FLAME_FRAGMENT = /* glsl */ `
uniform vec4 windowLight;
uniform sampler2D fireNoise;
uniform float fireBody;
varying vec2 vStrip;
varying float vSeed;
varying float vLit;
varying float vHeat;
varying float vPuff;
varying float vDepth;

void main() {
    float time = windowLight.z;
    float up = vStrip.y;
    float side = vStrip.x;
    vec4 swell = texture2D(fireNoise, vec2(side * 0.14 + vSeed, up * 0.42 - time * 0.55));
    float warp = (swell.r - 0.5) * (0.35 + 1.25 * up);
    float off = abs(side + warp);
    vec4 grain = texture2D(fireNoise, vec2(side * 0.26 + vSeed * 2.3 + warp * 0.15, up * 0.75 - time * 1.15));
    // (A teardrop, round at its foot, tapering up; eaten away the higher it goes)
    float body = (1.0 - up) * 0.92 + 0.08;
    body *= 0.45 + 0.55 * smoothstep(0.0, 0.16, up);
    float shape = body - off * (0.85 + 0.3 * up) + (grain.g - 0.5) * (0.3 + 1.05 * up) + (grain.b - 0.5) * 0.18 - up * up * 0.25;
    float edge = fwidth(shape) * 1.5 + 0.04;
    float a = smoothstep(-edge, edge, shape);
    float heat = clamp(shape * 2.0, 0.0, 1.0) * (1.0 - 0.5 * up) * (0.82 + 0.3 * vPuff) * vHeat;
    // (Heat to colour as a glowing body's: red at about 1,000 K, orange, white-yellow at its
    // hottest; its brightness rising far faster than its colour changes)
    vec3 colour = vec3(1.0, 0.11 + 0.42 * heat + 0.4 * heat * heat, 0.02 + 0.5 * pow(heat, 3.5)) * (0.2 + 4.2 * heat * heat * heat);
    // (A spell's fire (fireBody) is a body of flame, the more so by day: it hides more of what's
    // behind it, so it keeps its colour against bright ground and sky rather than washing out to
    // white, its heart a deep orange-yellow rather than white, its edges a sooty red)
    float day = 1.0 - windowLight.x;
    float solid = fireBody * (0.4 + 0.6 * day);
    colour *= (0.82 + 0.18 * vDepth) * vLit * (1.0 - 0.45 * solid * day);
    // (Its own soft shoulder, not the scene's tone mapping (the overworld's grades and fogs too):
    // its heart rolls to white instead of clipping; then as the screen shows colour)
    colour = linearToOutputTexel(vec4(1.0 - exp(-colour), 1.0)).rgb;
    // (Premultiplied: its heart adds light; its cooler, sooty edges hide a little of what's behind)
    float hide = mix(0.12 * (1.0 - heat), 0.8 - 0.35 * heat, solid);
    gl_FragColor = vec4(colour * a, a * hide * vLit);
}`;

// Each ember: rising from its fire as a plume carries it (quickly, then slower), drifting on its
// own and carried on the breeze, cooling as it goes (yellow, red, gone), twinkling; a point never
// more than a few pixels across; none past 30 metres
const EMBER_VERTEX = /* glsl */ `
attribute vec4 ember;
attribute vec2 emberFire;
uniform vec4 windowLight;
uniform vec4 fireWind;
uniform float emberScale;
varying vec3 vColour;
${FIRE_GLSL}

void main() {
    float time = windowLight.z;
    float life = time / ember.y + ember.x * 7.31;
    float age = fract(life);
    float own = fireHash(floor(life) + ember.x * 113.0);
    float up = ember.z * ember.y * pow(age, 0.75) * (0.6 + 0.8 * own);
    float way = ember.x * 40.0 + own * 6.283;
    vec3 at = (modelMatrix * vec4(position, 1.0)).xyz;
    at += vec3(cos(way), 0.0, sin(way)) * ember.w * sqrt(age);
    at += vec3(sin(time * 1.7 + way * 3.0), 0.0, cos(time * 1.3 + way)) * 0.07 * age;
    at.xz += fireWind.xy * fireWind.z * age * ember.y * 0.55;
    at.y += up;
    vec4 seen = viewMatrix * vec4(at, 1.0);
    float lit = mix(1.0, windowLight.x, emberFire.x) * (1.0 - smoothstep(18.0, 30.0, -seen.z));
    float heat = (1.0 - age) * (0.7 + 0.3 * own);

    vColour = vec3(1.0, 0.22 + 0.45 * heat, 0.04 + 0.16 * heat * heat) * heat * heat * 3.2 * (0.7 + 0.3 * sin(time * 23.0 + way * 5.0)) * lit;
    gl_PointSize = clamp(emberFire.y * emberScale / max(0.3, -seen.z), 1.0, 4.0);
    gl_Position = lit > 0.001 ? projectionMatrix * seen : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const EMBER_FRAGMENT = /* glsl */ `
varying vec3 vColour;

void main() {
    vec2 at = gl_PointCoord * 2.0 - 1.0;
    float away = dot(at, at);

    gl_FragColor = vec4(linearToOutputTexel(vec4(1.0 - exp(-vColour * max(0.0, 1.0 - away)), 1.0)).rgb, 0.0);
}`;

/**
 * How many pixels a metre is a metre from the camera (the view's: lights.js GLOW_SCALE's), for
 * the embers' size: set by the game.
 */
export const EMBER_SCALE = { value: 800 };

let materials = null;

/**
 * The flames' and the embers' materials, one each for every fire (a fire that grows and dies
 * away, a spell's, has its own copy of the flames', its `fireSize` its own: fireFlames).
 */
export function fireMaterials() {
    materials ??= {
        flames: new THREE.ShaderMaterial({
            name: "flames",
            uniforms: { windowLight: WINDOW_LIGHT, fireWind: FIRE_WIND, fireNoise: { value: fireNoiseTexture() }, fireSize: { value: 1 }, fireBody: { value: 0 } },
            vertexShader: FLAME_VERTEX,
            fragmentShader: FLAME_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            side: THREE.DoubleSide,
            toneMapped: false,
        }),
        embers: new THREE.ShaderMaterial({
            name: "embers",
            uniforms: { windowLight: WINDOW_LIGHT, fireWind: FIRE_WIND, emberScale: EMBER_SCALE },
            vertexShader: EMBER_VERTEX,
            fragmentShader: EMBER_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            toneMapped: false,
        }),
    };

    return materials;
}

/**
 * A copy of the flames' material for a fire of its own size (`fireSize` uniform: 0, none, to 1,
 * all of it; a spell's, growing and dying away) and body (`fireBody`: 0, a fire's, adding its
 * light to what's behind it, to 1, a spell's, hiding much of it, more so by day), the rest of its
 * uniforms the shared ones: the same shader, so nothing's compiled again.
 */
export function fireFlames(size = 1, body = 0) {
    const { flames } = fireMaterials();
    const own = flames.clone();

    own.uniforms = { ...flames.uniforms, fireSize: { value: size }, fireBody: { value: body } };

    return own;
}

/** A fire's own seed (0 to 1, from where it is: the same every time). */
export function fireSeed({ x, y, z }) {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;

    return s - Math.floor(s);
}

/**
 * A fire as drawn: its kind's (FIRES), with its own `width`, `height` or tongues (`tongues`) if it
 * has them, its seed (fireSeed's, unless it has its own), and `scale` times as big.
 */
export function fireOf(fire) {
    const kind = FIRES[fire.kind] ?? FIRES.torch;
    const scale = fire.scale ?? 1;

    return { ...kind, ...fire, width: (fire.width ?? kind.width) * scale, height: (fire.height ?? kind.height) * scale, tongues: fire.tongues ?? kind.tongues, spread: (fire.spread ?? kind.spread) * scale, seed: fire.seed ?? fireSeed(fire) };
}

/**
 * The flames of some fires (`fires`: [{ x, y, z, kind, ... }], their feet in the mesh's own
 * coordinates; fireOf's), one mesh of every tongue of them; or null if there are none.
 */
export function flamesMesh(fires) {
    const drawn = fires.map(fireOf).filter(({ tongues }) => tongues > 0);

    if (!drawn.length) {
        return null;
    }

    const corners = drawn.reduce((sum, fire) => sum + fire.tongues * (segmentsOf(fire) + 1) * 2, 0);
    const positions = new Float32Array(corners * 3);
    const strips = new Float32Array(corners * 2);
    const shapes = new Float32Array(corners * 4);
    const fireData = new Float32Array(corners * 4);
    const tempers = new Float32Array(corners * 4);
    const indices = new Uint32Array(drawn.reduce((sum, fire) => sum + fire.tongues * segmentsOf(fire) * 6, 0));
    let [at, index] = [0, 0];

    for (const fire of drawn) {
        const segments = segmentsOf(fire);

        for (let k = 0; k < fire.tongues; k++) {
            // (The first tongue in the middle, the biggest; the rest round it, each a little
            // smaller, at angles that never line up)
            const angle = fire.seed * 6.283 + k * 2.399963;
            const round = k === 0 ? 0 : fire.spread * (0.6 + 0.4 * fireHash(k * 7 + fire.seed * 50));
            const size = k === 0 ? 1 : 0.62 + 0.3 * fireHash(k * 13 + fire.seed * 70);
            const shape = [angle, round, fire.width * (k === 0 ? 0.72 : 0.48) * size, fire.height * size];
            const own = [fire.seed, fire.rate, fire.lean, fire.night ? 1 : 0];
            const temper = [k / fire.tongues, fire.steady, fire.twist, fire.heat * (k === 0 ? 1 : 0.9)];

            const base = at;

            for (let s = 0; s <= segments; s++) {
                for (const side of [-1, 1]) {
                    positions.set([fire.x, fire.y, fire.z], at * 3);
                    strips.set([side, s / segments], at * 2);
                    shapes.set(shape, at * 4);
                    fireData.set(own, at * 4);
                    tempers.set(temper, at * 4);
                    at++;
                }
            }

            for (let s = 0; s < segments; s++) {
                const [a, b] = [base + s * 2, base + s * 2 + 2];

                indices.set([a, a + 1, b, b, a + 1, b + 1], index);
                index += 6;
            }
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("strip", new THREE.BufferAttribute(strips, 2));
    geometry.setAttribute("tongue", new THREE.BufferAttribute(shapes, 4));
    geometry.setAttribute("fire", new THREE.BufferAttribute(fireData, 4));
    geometry.setAttribute("temper", new THREE.BufferAttribute(tempers, 4));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += Math.max(...drawn.map(({ height }) => height)) * 2.5 + 1;

    const mesh = new THREE.Mesh(geometry, fireMaterials().flames);

    mesh.name = "flames";
    mesh.renderOrder = 6;

    return mesh;
}

/**
 * The embers rising from some fires (flamesMesh's `fires`: as many a fire as its kind has, unless
 * it says its own, `embers`), one mesh of points; or null if none have any.
 */
export function embersMesh(fires) {
    const drawn = fires.map(fireOf).filter(({ embers }) => embers > 0);

    if (!drawn.length) {
        return null;
    }

    const count = drawn.reduce((sum, { embers }) => sum + embers, 0);
    const positions = new Float32Array(count * 3);
    const embers = new Float32Array(count * 4);
    const own = new Float32Array(count * 2);
    let n = 0;

    for (const fire of drawn) {
        // (Rising as fast as a plume its size carries them: a torch's about 2.8 metres a second,
        // a camp fire's 5, slowing as they go; living a second or two)
        const speed = 1.2 + 2.2 * Math.sqrt(fire.width);

        for (let k = 0; k < fire.embers; k++, n++) {
            positions.set([fire.x, fire.y + fire.height * 0.3, fire.z], n * 3);
            embers.set([fireHash(k * 3.7 + fire.seed * 211), 1.1 + 1.4 * fireHash(k * 5.3 + fire.seed * 97), speed * 0.45, fire.width * 0.35], n * 4);
            own.set([fire.night ? 1 : 0, 0.035 * (0.8 + 0.4 * fireHash(k * 1.9 + fire.seed * 13))], n * 2);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("ember", new THREE.BufferAttribute(embers, 4));
    geometry.setAttribute("emberFire", new THREE.BufferAttribute(own, 2));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += 6;

    const points = new THREE.Points(geometry, fireMaterials().embers);

    points.name = "embers";
    points.renderOrder = 6;

    return points;
}

/**
 * Some fires drawn (flamesMesh's `fires`): a group of their flames and their embers, in the
 * group's own coordinates (so it can be put anywhere, scaled as it likes: the tongues are their
 * size in metres whatever); or null if there's nothing to draw.
 */
export function firesMesh(fires) {
    const parts = [flamesMesh(fires), embersMesh(fires)].filter(Boolean);

    if (!parts.length) {
        return null;
    }

    const group = new THREE.Group();

    group.name = "fires";
    group.add(...parts);

    return group;
}
