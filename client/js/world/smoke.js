// Smoke from the peoples' chimneys (the terrain plan's M7c: their villages lived in): from each
// chimney whose hearth is lit (most of them; the smithy's forge always, thicker), a thin column of
// puffs rising and leaning on the breeze, spreading and thinning as it goes. Each puff's a square
// turned to face the camera, where it is in its rise worked out in the vertex shader from the time
// (the breeze's in the trees: kits/trees.js TREE_WIND), so nothing's sent each frame; as the
// volcano's smoke is (far/volcano.js), on a village's scale. One mesh a chunk, one material for
// them all; Visual quality says how many of each column's puffs are drawn (QUALITY.smoke).

import * as THREE from "three";
import { TREE_WIND } from "./art/kits/trees.js";
import { SKY_GLOW } from "./daytime.js";
import { smokeNoise } from "./far/volcano.js";
import { GRADE } from "./fog.js";
import { WINDOW_LIGHT } from "./art/engine/atlas.js";

/**
 * The smoke: how many hearths are lit (of the houses'; a forge's always is), how many puffs a
 * column has, how high they rise (metres) and how long that takes (s), how wide a puff starts and
 * ends (metres), how far the breeze leans the column (metres across a metre up, east and south, at
 * its top), how far each puff wanders from the column's line (metres), its colours (sRGB) in its
 * shade and in the sun, and how thick it is at most.
 */
export const SMOKE = Object.freeze({ lit: 0.7, puffs: 9, rise: 8, period: 10, from: 0.3, to: 1.7, wind: [0.5, 0.22], wander: 0.45, shade: 0x5e5a57, sun: 0xbdb7ae, thick: 0.7 });

/**
 * Smoke of each kind, as SMOKE has it (`lit`: a share of them drawn at all), and how a fire under
 * it lights it from below (sRGB, as strong as it says; `night`: only as the windows are lit, at
 * night, as a torch is): a chimney's (SMOKE); a torch's or a brazier's, a thin dark wisp; a camp
 * fire's, a fuller, paler column.
 */
export const SMOKES = Object.freeze({
    chimney: { ...SMOKE, glow: 0x000000, glowing: 0, night: false },
    torch: { lit: 1, puffs: 5, rise: 1.6, period: 2.6, from: 0.07, to: 0.5, wind: [0.5, 0.22], wander: 0.08, shade: 0x2c2724, sun: 0x6a625c, thick: 0.4, glow: 0xff8a3a, glowing: 0.9, night: true },
    fire: { lit: 1, puffs: 8, rise: 4.2, period: 5, from: 0.3, to: 1.6, wind: [0.5, 0.22], wander: 0.3, shade: 0x45403c, sun: 0x9a938a, thick: 0.45, glow: 0xff8436, glowing: 1.1, night: false },
});

/** How many of each column's puffs are drawn (0 to 1: QUALITY.smoke, set by the game). */
export const SMOKE_SHARE = { value: 1 };

const VERTEX = `
#include <fog_pars_vertex>
uniform float time;
uniform vec4 rising;
uniform vec2 wind;
uniform float wander;
uniform float share;
attribute vec2 corner;
attribute vec4 puff;
varying vec2 vCorner;
varying float vAge;
varying float vSeed;
void main() {
    vCorner = corner;
    vSeed = puff.w;
    // (Puffs past the quality's share not drawn: put out of sight)
    if (puff.w > share) {
        vAge = 1.0;
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }
    // (How far through its rise this puff is (its strength, puff.z, taking it higher and making it
    // a little wider), and where that's taken it: up, leant on the breeze more the higher it is,
    // wandering from the column's line)
    float age = fract(time / rising.y + puff.x);
    float up = age * rising.x * puff.z;
    float turn = puff.y + time * 0.35;
    vec3 centre = position + vec3(wind.x * up * age, up, wind.y * up * age) + vec3(cos(turn), 0.0, sin(turn)) * wander * age;
    float size = mix(rising.z, rising.w, sqrt(age)) * (0.6 + 0.4 * puff.z);
    vec4 mvPosition = modelViewMatrix * vec4(centre, 1.0);
    mvPosition.xy += corner * size;
    gl_Position = projectionMatrix * mvPosition;
    vAge = age;
    #include <fog_vertex>
}`;

const FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
uniform vec3 shadeColour;
uniform vec3 sunColour;
uniform vec3 skyGlow;
uniform float thick;
uniform sampler2D noiseMap;
uniform vec3 fireGlow;
uniform vec4 windowLight;
uniform float glowNight;
varying vec2 vCorner;
varying float vAge;
varying float vSeed;
void main() {
    float r = length(vCorner);
    if (r > 1.0) discard;
    // (Billowing: noise drifting through each puff; thick in the middle, soft at its edge; coming
    // in as it leaves the chimney and thinning away as it rises)
    float billow = texture2D(noiseMap, vCorner * 0.45 + vec2(vSeed * 3.7, vAge * 0.8 + vSeed)).r;
    float body = smoothstep(1.0, 0.2, r) * smoothstep(0.2, 0.6, billow + 0.3 * (1.0 - r));
    float alpha = body * smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.25, 1.0, vAge)) * thick;
    if (alpha < 0.01) discard;
    // (Lit from above, in shade below; greyer as it thins; as the sky's light is, dark at night)
    vec3 colour = mix(shadeColour, sunColour, 0.45 + 0.4 * vCorner.y + 0.15 * vAge) * skyGlow;
    // (A fire under it lighting it from below, most low down and on its underside)
    colour += fireGlow * mix(1.0, windowLight.x, glowNight) * (1.0 - vAge) * (1.0 - vAge) * (0.6 - 0.4 * vCorner.y);
    gl_FragColor = vec4(colour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}`;

const materials = new Map();

/** The smoke's material, one of each kind (SMOKES) for every chunk's. */
export function smokeMaterial(kind = "chimney") {
    if (!materials.has(kind)) {
        const smoke = SMOKES[kind];

        materials.set(
            kind,
            new THREE.ShaderMaterial({
                name: `${kind} smoke`,
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                uniforms: {
                    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
                    time: TREE_WIND.time,
                    share: SMOKE_SHARE,
                    rising: { value: new THREE.Vector4(smoke.rise, smoke.period, smoke.from, smoke.to) },
                    wind: { value: new THREE.Vector2(...smoke.wind) },
                    wander: { value: smoke.wander },
                    shadeColour: { value: new THREE.Color(smoke.shade) },
                    sunColour: { value: new THREE.Color(smoke.sun) },
                    thick: { value: smoke.thick },
                    skyGlow: SKY_GLOW,
                    noiseMap: { value: smokeNoise() },
                    toneGrade: GRADE,
                    fireGlow: { value: new THREE.Color(smoke.glow).multiplyScalar(smoke.glowing) },
                    windowLight: WINDOW_LIGHT,
                    glowNight: { value: smoke.night ? 1 : 0 },
                },
                defines: { NO_NEAR_FADE: "" },
                fog: true,
                transparent: true,
                depthWrite: false,
            }),
        );
    }

    return materials.get(kind);
}

// (A number from 0 to 1 for a point, the same every time)
const hash = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;

    return s - Math.floor(s);
};

/**
 * The smoke rising from chimney tops (`tops`: [[x, y, z, strength]], metres, in the world: a
 * strength over 1 always lit, and as much higher, a little wider), those whose hearths are lit: a
 * mesh (in the world's coordinates), or null if none is.
 */
export function smokeMesh(tops, kind = "chimney") {
    const smoke = SMOKES[kind];
    const lit = tops.filter(([x, y, z, strength = 1]) => strength > 1 || hash(x, y, z) < smoke.lit);

    if (!lit.length) {
        return null;
    }

    const count = lit.length * smoke.puffs;
    const positions = new Float32Array(count * 12);
    const corners = new Float32Array(count * 8);
    const puffs = new Float32Array(count * 16);
    const indices = new Uint32Array(count * 6);
    let n = 0;

    for (const [x, y, z, strength = 1] of lit) {
        const seed = hash(z, x, y);

        for (let k = 0; k < smoke.puffs; k++, n++) {
            // (Evenly through the rise, each column starting its own way; the share drops every
            // other puff first, so a column thins rather than breaking up)
            const puff = [(k + seed) / smoke.puffs, (k * 2.399963 + seed * 6.283) % 6.283, strength * (0.85 + 0.3 * hash(k, seed, x)), ((k * 0.618034) % 1) * 0.98 + 0.01];

            for (let c = 0; c < 4; c++) {
                positions.set([x, y, z], (n * 4 + c) * 3);
                corners.set([c % 2 ? 1 : -1, c < 2 ? -1 : 1], (n * 4 + c) * 2);
                puffs.set(puff, (n * 4 + c) * 4);
            }

            indices.set([n * 4, n * 4 + 1, n * 4 + 2, n * 4 + 2, n * 4 + 1, n * 4 + 3], n * 6);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("corner", new THREE.BufferAttribute(corners, 2));
    geometry.setAttribute("puff", new THREE.BufferAttribute(puffs, 4));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    // (Reaching as high as the strongest smoke rises (strength 1.4, and as much again as a puff's
    // own varies), and as far as it leans and spreads)
    geometry.boundingSphere.radius += smoke.rise * 1.7 * (1 + Math.hypot(...smoke.wind)) + smoke.to * 1.3;

    const mesh = new THREE.Mesh(geometry, smokeMaterial(kind));

    mesh.name = `${kind} smoke`;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 5;

    return mesh;
}

/**
 * The chimney tops of what's been built (a built object, its world matrix up to date: each part
 * whose userData.smoke lists them, [x, y, z, strength] in its own pixels), in the world (metres).
 */
export function chimneysOf(object) {
    const tops = [];
    const point = new THREE.Vector3();

    object.traverse((node) => {
        for (const [x, y, z, strength = 1] of node.userData.smoke ?? []) {
            point.set(x, y, z).applyMatrix4(node.matrixWorld);
            tops.push([point.x, point.y, point.z, strength]);
        }
    });

    return tops;
}
