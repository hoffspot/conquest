// The volcano, the world's landmark (the terrain plan's §9: one landmark seen from nearly
// everywhere): a lake of lava in its crater, its walls lit from below, a glow over it, and a
// column of smoke rising hundreds of metres and leaning on the wind, lit orange at its foot by
// the fire and grey above. Seen kilometres off over the haze, and close to as well.
//
// Drawn twice (view.js setHorizon): with the far land (its own camera reaching to the horizon),
// all but what's nearer than the near camera reaches; and with the near world, what is. The two
// copies share their geometry; each draws one call for the fire (the lake and the walls) and one
// for the smoke (and the glow). Only for the eye: the lava does nothing in the rules.

import * as THREE from "three";
import { craterOf, heightAt } from "../../core/terrain/height.js";
import { tiling } from "../../core/noise.js";
import { GRADE } from "../fog.js";
import { FAR } from "./levels.js";

/**
 * The fire and the smoke:
 * - `lake`: the lava's radius (metres) and how far over the crater's floor it lies; its colour
 *   (light's, brighter than white: it glows);
 * - `walls`: how far up the crater's walls the fire's light reaches (0 to 1 of the way to the rim),
 *   and its colour;
 * - `glow`: the glow over the crater (turned to face the camera), how high over the rim and how
 *   wide (its radius, metres), how strong;
 * - `smoke`: how many puffs, how high they rise (metres) and how long that takes (s), how wide a
 *   puff starts and ends (metres), how far the wind leans the column (metres across a metre up,
 *   east and south), and its colours (sRGB) in the shade, in the sun, and lit by the fire.
 */
export const VOLCANO = Object.freeze({
    lake: { radius: 19, over: 0.3, colour: [3.2, 0.75, 0.12] },
    walls: { up: 0.75, colour: [1.6, 0.45, 0.08] },
    glow: { over: 40, radius: 150, strength: 0.32 },
    smoke: { puffs: 28, rise: 650, period: 110, from: 30, to: 230, wind: [0.32, 0.12], shade: 0x4a4442, sun: 0x9a9490, fire: 0xd06a30 },
});

// (Where the far copy stops and the near one takes over: a little short of the near camera's end)
const NEAR_CUT = FAR.nearFar - 2;

// How finely the crater's drawn: points round it, and rings from the lake to the rim
const ROUND = 48;
const RINGS = 6;

// (The smoke's noise, tiling: a small texture made once)
let noise = null;

function smokeTexture() {
    if (!noise) {
        const size = 64;
        const data = new Uint8Array(size * size * 4);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const value = Math.round(tiling((x / size) * 4, (y / size) * 4, 4, 1733, 4) * 255);

                data.set([value, value, value, 255], (y * size + x) * 4);
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

// (Fog as everything else has it, the near world's fade left out; the copy drawn with the far land
// leaving out what's nearer than `nearCut`)
const FOG_VERTEX = `
#include <fog_pars_vertex>
uniform float time;
`;

const FIRE_VERTEX = `${FOG_VERTEX}
attribute float fire;
varying float vFire;
void main() {
    vFire = fire;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // (Drawn a little towards the eye, the more the further off: the far land's coarser than the
    // crater it stands for, and would hide its floor)
    mvPosition.xyz *= 1.0 - min(0.03, 0.006 + 0.6 / max(1.0, - mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}`;

// The fire: the lake (fire 2: its own colour, flickering) and the walls (fire 1 at their foot, 0
// up them: their light fading)
const FIRE_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
uniform float time;
uniform float nearCut;
uniform vec3 lakeColour;
uniform vec3 wallColour;
varying float vFire;
void main() {
    #ifdef USE_FOG
    if (vFogDepth < nearCut) discard;
    #endif
    vec4 colour;
    if (vFire > 1.5) {
        float flicker = 0.85 + 0.15 * sin(time * 1.7 + vFire * 40.0);
        colour = vec4(lakeColour * flicker, 1.0);
    } else {
        colour = vec4(wallColour * vFire * vFire, vFire * vFire * 0.9);
    }
    gl_FragColor = colour;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}`;

const SMOKE_VERTEX = `${FOG_VERTEX}
attribute vec2 corner;
attribute vec4 puff;
uniform vec3 origin;
uniform vec4 rising;
uniform vec2 wind;
uniform vec2 glow;
varying vec2 vCorner;
varying float vAge;
varying float vSeed;
void main() {
    // (How far through its rise this puff is, and where that's taken it: up, leant on the wind,
    // spreading from the middle; the glow (a puff with no place in the rise: -1) over the crater)
    float age = fract(time / rising.y + puff.x);
    float up = age * rising.x;
    vec3 centre = origin + vec3(wind.x * up, up, wind.y * up) + vec3(cos(puff.y), 0.0, sin(puff.y)) * (6.0 + 40.0 * age);
    float size = mix(rising.z, rising.w, sqrt(age)) * puff.z;
    if (puff.x < 0.0) {
        age = -1.0;
        centre = origin + vec3(0.0, glow.x, 0.0);
        size = glow.y;
    }
    vec4 mvPosition = viewMatrix * vec4(centre, 1.0);
    mvPosition.xy += corner * size;
    gl_Position = projectionMatrix * mvPosition;
    vCorner = corner;
    vAge = age;
    vSeed = puff.w;
    #include <fog_vertex>
}`;

const SMOKE_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
uniform float time;
uniform float nearCut;
uniform vec3 shadeColour;
uniform vec3 sunColour;
uniform vec3 fireColour;
uniform vec3 glowColour;
uniform float glowStrength;
uniform sampler2D noiseMap;
varying vec2 vCorner;
varying float vAge;
varying float vSeed;
void main() {
    #ifdef USE_FOG
    if (vFogDepth < nearCut) discard;
    #endif
    float r = length(vCorner);
    if (r > 1.0) discard;
    if (vAge < 0.0) {
        // The glow: strongest in its middle; through the haze, fading rather than greying
        gl_FragColor = vec4(glowColour, glowStrength * (1.0 - r) * (1.0 - r));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
        float hazed = 1.0 - exp(- 3.0 * max(0.0, vFogDepth - fogNear) / (fogFar - fogNear));
        gl_FragColor.a *= 1.0 - 0.6 * hazed;
        #endif
        return;
    }
    // (Billowing: noise drifting slowly through each puff; thick in the middle, soft at its edge;
    // coming in as it leaves the crater and thinning away as it rises)
    float billow = texture2D(noiseMap, vCorner * 0.45 + vec2(vSeed, vAge * 0.6 + vSeed * 0.37)).r;
    float thick = smoothstep(1.0, 0.25, r) * smoothstep(0.2, 0.6, billow + 0.3 * (1.0 - r));
    float alpha = thick * smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
    // (Lit from above by the sun, from below by the fire, the lower down the more)
    vec3 colour = mix(shadeColour, sunColour, 0.5 + 0.5 * vCorner.y);
    colour = mix(colour, fireColour, (1.0 - smoothstep(0.0, 0.3, vAge)) * (0.65 - 0.35 * vCorner.y));
    gl_FragColor = vec4(colour, alpha * 0.9);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}`;

// (A colour's light, from sRGB)
const light = (hex) => new THREE.Color(hex);

export class Volcano {
    /**
     * @param {object} plan - The world plan (its volcano; none: nothing's drawn).
     */
    constructor(plan) {
        this.crater = craterOf(plan);
        this.far = new THREE.Group();
        this.near = new THREE.Group();
        this.far.name = "volcano";
        this.near.name = "volcano (near)";
        this.materials = [];

        if (!this.crater) {
            return;
        }

        const fire = this.#fireGeometry(plan);
        const smoke = this.#smokeGeometry();

        for (const [group, cut] of [
            [this.far, NEAR_CUT],
            [this.near, 0],
        ]) {
            const fireMaterial = this.#material(FIRE_VERTEX, FIRE_FRAGMENT, cut, {
                lakeColour: { value: new THREE.Vector3(...VOLCANO.lake.colour) },
                wallColour: { value: new THREE.Vector3(...VOLCANO.walls.colour) },
            });
            const smokeMaterial = this.#material(SMOKE_VERTEX, SMOKE_FRAGMENT, cut, {
                origin: { value: new THREE.Vector3(this.crater.at[0], this.crater.rim, this.crater.at[1]) },
                rising: { value: new THREE.Vector4(VOLCANO.smoke.rise, VOLCANO.smoke.period, VOLCANO.smoke.from, VOLCANO.smoke.to) },
                wind: { value: new THREE.Vector2(...VOLCANO.smoke.wind) },
                shadeColour: { value: light(VOLCANO.smoke.shade) },
                sunColour: { value: light(VOLCANO.smoke.sun) },
                fireColour: { value: light(VOLCANO.smoke.fire) },
                glow: { value: new THREE.Vector2(VOLCANO.glow.over, VOLCANO.glow.radius) },
                glowColour: { value: new THREE.Vector3(...VOLCANO.lake.colour).multiplyScalar(0.5) },
                glowStrength: { value: VOLCANO.glow.strength },
            });

            fireMaterial.polygonOffset = true;
            fireMaterial.polygonOffsetFactor = -2;
            fireMaterial.polygonOffsetUnits = -8;

            for (const [geometry, material, name, order] of [
                [fire, fireMaterial, "volcano fire", 10],
                [smoke, smokeMaterial, "volcano smoke", 11],
            ]) {
                const mesh = new THREE.Mesh(geometry, material);

                mesh.name = name;
                mesh.frustumCulled = false;
                mesh.matrixAutoUpdate = false;
                mesh.renderOrder = order;
                group.add(mesh);
            }
        }
    }

    /** How many triangles it draws (each copy, at most). */
    get triangles() {
        return this.far.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    }

    /** The fire flickering and the smoke rising: `time` in seconds. */
    update(time) {
        for (const material of this.materials) {
            material.uniforms.time.value = time;
        }
    }

    // A material for the fire or the smoke: lit by nothing but itself, in the haze, transparent
    #material(vertexShader, fragmentShader, nearCut, uniforms) {
        const material = new THREE.ShaderMaterial({
            name: "volcano",
            vertexShader,
            fragmentShader,
            uniforms: {
                ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
                ...uniforms,
                time: { value: 0 },
                nearCut: { value: nearCut },
                noiseMap: { value: smokeTexture() },
                toneGrade: GRADE,
            },
            defines: { NO_NEAR_FADE: "" },
            fog: true,
            transparent: true,
            depthWrite: false,
        });

        this.materials.push(material);

        return material;
    }

    // The lake and the walls (rings from the lake's edge to the rim, on the ground a little over
    // it): one geometry
    #fireGeometry(plan) {
        const { at, floor } = this.crater;
        const [x0, z0] = at;
        const positions = [];
        const fires = [];
        const indices = [];
        const lake = floor + VOLCANO.lake.over;

        // The lake: a fan
        positions.push(x0, lake, z0);
        fires.push(2);

        for (let k = 0; k < ROUND; k++) {
            const angle = (k / ROUND) * Math.PI * 2;

            positions.push(x0 + Math.cos(angle) * VOLCANO.lake.radius, lake, z0 + Math.sin(angle) * VOLCANO.lake.radius);
            fires.push(2);
            indices.push(0, 1 + ((k + 1) % ROUND), 1 + k);
        }

        // The walls: from the lake's edge out to the rim (where the ground's highest along each
        // way out), lit less the further up
        const walls = positions.length / 3;

        for (let k = 0; k < ROUND; k++) {
            const angle = (k / ROUND) * Math.PI * 2;
            const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
            let [rim, top] = [this.crater.radius, -Infinity];

            for (let r = VOLCANO.lake.radius; r <= this.crater.radius * 1.15; r += 2) {
                const height = heightAt(plan, x0 + dx * r, z0 + dz * r);

                if (height > top) {
                    [rim, top] = [r, height];
                }
            }

            for (let ring = 0; ring <= RINGS; ring++) {
                const share = ring / RINGS;
                const r = VOLCANO.lake.radius + (rim - VOLCANO.lake.radius) * share;
                const [x, z] = [x0 + dx * r, z0 + dz * r];

                positions.push(x, heightAt(plan, x, z) + 0.6, z);
                fires.push(Math.max(0, 1 - share / VOLCANO.walls.up));
            }
        }

        for (let k = 0; k < ROUND; k++) {
            const next = (k + 1) % ROUND;

            for (let ring = 0; ring < RINGS; ring++) {
                const [a, b, c, d] = [walls + k * (RINGS + 1) + ring, walls + k * (RINGS + 1) + ring + 1, walls + next * (RINGS + 1) + ring, walls + next * (RINGS + 1) + ring + 1];

                indices.push(a, c, b, b, c, d);
            }
        }

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("fire", new THREE.Float32BufferAttribute(fires, 1));
        geometry.setIndex(indices);

        return geometry;
    }

    // The smoke: a square for each puff, turned to face the camera as it's drawn; each puff its own
    // place in the rise, way round the column, size and noise
    #smokeGeometry() {
        const puffs = VOLCANO.smoke.puffs + 1;
        const corners = [];
        const each = [];
        const indices = [];

        for (let k = 0; k < puffs; k++) {
            // (The first, the glow: drawn first, under the smoke)
            const puff = k === 0 ? [-1, 0, 1, 0] : [k / (puffs - 1), (k * 2.399963) % (Math.PI * 2), 0.75 + ((k * 0.618034) % 1) * 0.5, (k * 0.414214) % 1];

            for (const corner of [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
            ]) {
                corners.push(...corner);
                each.push(...puff);
            }

            const base = k * 4;

            indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }

        const geometry = new THREE.BufferGeometry();

        // (No positions: each corner's worked out in the shader; three.js wants a position all the same)
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Array(puffs * 12).fill(0), 3));
        geometry.setAttribute("corner", new THREE.Float32BufferAttribute(corners, 2));
        geometry.setAttribute("puff", new THREE.Float32BufferAttribute(each, 4));
        geometry.setIndex(indices);

        return geometry;
    }

    dispose() {
        const geometries = new Set(this.far.children.map((mesh) => mesh.geometry));

        geometries.forEach((geometry) => geometry.dispose());
        this.materials.forEach((material) => material.dispose());
    }
}
