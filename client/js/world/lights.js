// The lights out of doors at night (the terrain plan's M7e, §9 Day and night: torches by doors and
// gates, lanterns, braziers, camp fires, and the fire spells): where the kits put them (a built
// piece's userData.lights, as its chimneys' tops are its userData.smoke), each drawn as its fire
// (fire.js: its flame, its embers) with a soft glow round it and its smoke, all of a chunk's in one
// mesh of each; and each one its own light (the user: "Shouldn't the torches and the spells be
// their own independent light sources?"):
//
// - **Every one of them near the player** lights what's round it on its own (FIRE_LIGHT: up to 16
//   at once, the nearest, each as strong and its own colour as its fire is now), the world's
//   buildings, ground, trees and folk taking them as the insides take their candles
//   (roomlight.js): a point light's sums in their shaders, with no shadows, nothing lit behind the
//   wall a torch hangs on; a list the shaders read, so no shader's made again however many there
//   are, and by day, none lit, almost nothing done.
// - **The two that matter most** are the view's two real lamps instead (as indoors), lighting the
//   folk and everything else fully, the first casting shadows (view.js), and left out of the list
//   so nothing's lit by them twice.
//
// Each light rises and falls with its fire's flame (fire.js fireSignal: the same sums, the same
// seed and clock), far less than the flame does, as firelight does.

import * as THREE from "three";
import { WINDOW_LIGHT } from "./art/engine/atlas.js";
import { FIRE_GLSL, FIRE_WIND, fireSeed, fireSignal, fireStrength, fireTilt, FIRES, firesMesh, flameHeight } from "./fire.js";
import { FIRE_LIGHT, FIRE_LIGHTS, fireLit } from "./firelight.js";
import { smokeMesh } from "./smoke.js";

export { FIRE_LIGHT, FIRE_LIGHTS, fireLit };

/**
 * Each kind of light: the fire it is (fire.js FIRES) and whether its flame's drawn (not a
 * lantern's, behind its glass; not a spell's, drawn by the spell), its colour (sRGB: firelight's,
 * about 2,000 to 2,200 K: a little whiter than a candle's 1,850, so faces aren't all orange), how strong its light is on what's round it (candela, a point light's) and how far
 * it reaches (metres), and how wide its glow is (metres).
 */
export const LIGHTS = Object.freeze({
    candle: { fire: "candle", flame: true, colour: 0xff9a40, strength: 0.8, reach: 4, glow: 0.15 },
    lantern: { fire: "lantern", flame: false, colour: 0xff9a40, strength: 3, reach: 9, glow: 0.9 },
    torch: { fire: "torch", flame: true, colour: 0xff9030, strength: 4.5, reach: 11, glow: 0.7 },
    brazier: { fire: "brazier", flame: true, colour: 0xff8e2c, strength: 6, reach: 12, glow: 1.1 },
    fire: { fire: "fire", flame: true, colour: 0xff8c28, strength: 8, reach: 14, glow: 1.8 },
    spell: { fire: "spell", flame: false, colour: 0xff7a2a, strength: 10, reach: 12, glow: 0 },
});

/**
 * The lights of what's been built (a built object, its world matrix up to date: each part whose
 * userData.lights lists, [x, y, z, kind] in its own pixels, and the way out from the wall it's on
 * if it's on one: [x, y, z, kind, ox, oz]), in the world: [{ x, y, z, kind, out: [x, z] | null }]
 * (metres).
 */
export function lightsOf(object) {
    const lights = [];
    const point = new THREE.Vector3();
    const way = new THREE.Vector3();

    object.traverse((node) => {
        for (const [x, y, z, kind, ox, oz] of node.userData.lights ?? []) {
            point.set(x, y, z).applyMatrix4(node.matrixWorld);

            const out = ox === undefined ? null : way.set(ox, 0, oz).transformDirection(node.matrixWorld);

            lights.push({ x: point.x, y: point.y, z: point.z, kind, out: out && [out.x, out.z] });
        }
    });

    return lights;
}

/** How far out from its wall a torch's flame is (metres: kits/torches.js torch's). */
export const WALL_GAP = 0.3;

/** A light's own seed (0 to 1, from where it is: the same every time, its fire's: fire.js fireSeed). */
export const seedOf = fireSeed;

const _signal = { puff: 0, gust: 0 };
const _embers = new THREE.Color();

/**
 * A light now (`light`: lightsOf's, or a spell's, with its own `colour`, `strength`, `reach`,
 * `seed`, `steady` (fire.js's: 0, not flickering) and `fade` if it has them; `time`: the drawing's, WINDOW_LIGHT.z; `lit`: how lit the
 * evening has it, for those lit only at night): { strength (candela), colour (linear
 * THREE.Color), x, y, z (where it is: risen as its flame stands taller, leant with the breeze),
 * reach } (into `into`).
 */
export function lightNow(light, time, lit, into = { strength: 0, colour: new THREE.Color(), x: 0, y: 0, z: 0, reach: 0, wall: 0 }) {
    const kind = LIGHTS[light.kind] ?? LIGHTS.torch;
    const fire = FIRES[kind.fire];
    const signal = fireSignal(light.seed ?? seedOf(light), fire.rate, time, _signal);
    const tall = fire.height * flameHeight(signal, fire.steady);
    // (Only a flame drawn leans its light: a spell's light is where it is)
    const lean = kind.flame ? Math.tan(fireTilt(light, fire.lean, time)) * tall * 0.25 : 0;

    into.strength = (light.strength ?? kind.strength) * fireStrength(signal, light.steady ?? fire.steady) * (fire.night ? lit : 1) * (light.fade ?? 1);
    // (Only a little redder as it dies down: firelight hardly changes colour)
    into.colour.set(light.colour ?? kind.colour).lerp(_embers.set(0xff6a28), 0.12 * (1 - signal.puff) * (1 - signal.gust));
    // (A torch on a wall lights it as a flame a little way out from it does, not one pressed
    // against it: the way out from the wall, a quarter of a metre more; how far that is from the
    // wall, kept for what's behind it)
    into.wall = light.out ? WALL_GAP + 0.25 : 0;
    into.x = light.x + FIRE_WIND.value.x * lean + (light.out?.[0] ?? 0) * 0.25;
    into.y = light.y + (kind.flame ? tall * (0.35 + 0.08 * (signal.puff - 0.5)) : 0);
    into.z = light.z + FIRE_WIND.value.y * lean + (light.out?.[1] ?? 0) * 0.25;
    into.reach = light.reach ?? kind.reach;

    return into;
}

// Each light's glow: a soft round of its colour, as wide as its kind's, swelling and brightening
// as its fire puffs (as its flame and its light do: fire.js); never bigger on the screen than a
// phone draws a point; lit as the evening has it if it's lit only at night, fading out far off
const GLOW_VERTEX = /* glsl */ `
attribute vec4 glow;
attribute vec3 tint;
uniform vec4 windowLight;
uniform float glowScale;
varying vec3 vTint;
${FIRE_GLSL}

void main() {
    vec4 seen = modelViewMatrix * vec4(position, 1.0);
    vec2 signal = fireSignal(glow.z, glow.w, windowLight.z);
    float swell = flameHeight(signal, 1.0);
    float lit = mix(1.0, windowLight.x, step(0.0, glow.y)) * (1.0 - smoothstep(60.0, 150.0, -seen.z));

    gl_Position = lit > 0.001 ? projectionMatrix * seen : vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = min(256.0, glow.x * (0.75 + 0.3 * swell) * glowScale / max(0.3, -seen.z));
    vTint = tint * lit * (0.6 + 0.5 * swell);
}`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec3 vTint;

void main() {
    vec2 at = gl_PointCoord * 2.0 - 1.0;
    float away = dot(at, at);

    if (away > 1.0) discard;

    gl_FragColor = vec4(vTint * pow(1.0 - away, 3.0) * 0.32, 1.0);
}`;

/**
 * How many pixels a metre is a metre from the camera (the view's: its picture's height over twice
 * the tangent of half its field of view), for the glows' size: set by the game.
 */
export const GLOW_SCALE = { value: 800 };

let glowMaterial = null;

// The glows' material, one for every chunk's
function glowsMaterial() {
    glowMaterial ??= new THREE.ShaderMaterial({
        name: "glows",
        uniforms: { windowLight: WINDOW_LIGHT, glowScale: GLOW_SCALE },
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
    });

    return glowMaterial;
}

/**
 * What's drawn of some lights (`lights`: lightsOf's, world metres): a group of their fires (those
 * whose flames are drawn: fire.js, their flames and embers), their glows and their smoke, in the
 * world's coordinates; or null if there are none.
 */
export function lightsMesh(lights) {
    const shown = lights.filter(({ kind }) => LIGHTS[kind]);

    if (!shown.length) {
        return null;
    }

    const group = new THREE.Group();
    const colour = new THREE.Color();
    const fires = shown.filter(({ kind }) => LIGHTS[kind].flame).map(({ x, y, z, kind }) => ({ x, y, z, kind: LIGHTS[kind].fire }));
    const burning = firesMesh(fires);

    group.name = "lights";

    if (burning) {
        group.add(...burning.children);
    }

    // (Smoke over each that smokes: a torch's thin wisp, a camp fire's fuller column)
    for (const smoke of ["torch", "fire"]) {
        const tops = fires.filter(({ kind }) => FIRES[kind].smoke === smoke).map(({ x, y, z, kind }) => [x, y + FIRES[kind].height * 0.85, z, 1.01]);
        const mesh = tops.length ? smokeMesh(tops, smoke) : null;

        if (mesh) {
            group.add(mesh);
        }
    }

    const glowing = shown.filter(({ kind }) => LIGHTS[kind].glow > 0);

    if (glowing.length) {
        const geometry = new THREE.BufferGeometry();
        const fireOf = ({ kind }) => FIRES[LIGHTS[kind].fire];

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(glowing.flatMap((light) => [light.x, light.y + (LIGHTS[light.kind].flame ? fireOf(light).height * 0.35 : 0), light.z]), 3));
        geometry.setAttribute("glow", new THREE.Float32BufferAttribute(glowing.flatMap((light) => [LIGHTS[light.kind].glow, fireOf(light).night ? 1 : -1, seedOf(light), fireOf(light).rate]), 4));
        geometry.setAttribute("tint", new THREE.Float32BufferAttribute(glowing.flatMap(({ kind }) => colour.set(LIGHTS[kind].colour).toArray()), 3));
        geometry.computeBoundingSphere();
        geometry.boundingSphere.radius += 3;

        const points = new THREE.Points(geometry, glowsMaterial());

        points.name = "glows";
        points.renderOrder = 6;
        group.add(points);
    }

    return group;
}

/**
 * Of some lights (lightsOf's, world metres), the `count` nearest `near` ({ x, y, z }) within their
 * reach (half as far again), nearest first: [{ light, distance }] (into `into`).
 */
export function nearestLights(lights, near, count, into = []) {
    into.length = 0;

    for (const light of lights) {
        const distance = Math.hypot(light.x - near.x, light.y - near.y, light.z - near.z);

        if (distance > (light.reach ?? LIGHTS[light.kind]?.reach ?? 10) * 1.5) {
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
