// Motes drifting in the air round the player (terrain plan M7b; the research report's step 8): each
// land's own (MOTES_OF): pollen over the meadows and fields, dust over the dry lands and in the
// woods, fireflies over the marsh and in the jungle, pale wisps in the elves' woods and the
// darkwood, embers rising over the volcano's ash, snow falling on the snowfields.
// - One draw: a few hundred points, each a soft dot, where in a box round the player a hash of its
//   own says, drifting with the land's breeze (worked out here, so the breeze can change without
//   the motes jumping) and wandering about that, wrapping round the box as the player goes.
//   Faded out towards the box's edges, so none pops in or out; fireflies and embers flicker.
// - Glowing: added to what's behind them, never hiding it, and not written to the depth.
// - Crossing from one land into another, one kind fades out and the other in.
// - Each quality's (world/view.js QUALITY.motes): how many; none on low.

import * as THREE from "three";
import { SKY_GLOW } from "./daytime.js";

/**
 * Each kind of mote: its colour (sRGB), how big (metres across), the breeze it drifts on (metres a
 * second: east, up, south), how far it wanders about that (metres), how brightly it glows (0 to 1),
 * how fast it flickers (0: not), how many of the motes there are it uses (0 to 1), and whether
 * it's lit by the sky (as its light is through the day: dark at night) or by its own light.
 */
export const MOTES = Object.freeze({
    pollen: { colour: 0xffeab0, size: 0.09, breeze: [0.22, 0.03, 0.12], wander: 0.6, glow: 0.65, flicker: 0, amount: 0.4, lit: true },
    dust: { colour: 0xf0d8a8, size: 0.07, breeze: [0.12, 0.02, 0.08], wander: 0.4, glow: 0.45, flicker: 0, amount: 0.4, lit: true },
    fireflies: { colour: 0xd6ff78, size: 0.13, breeze: [0.04, 0.01, 0.03], wander: 1.2, glow: 1, flicker: 1.7, amount: 0.45, lit: false },
    wisps: { colour: 0xa9d6ff, size: 0.15, breeze: [0.03, 0.04, 0.02], wander: 1, glow: 0.9, flicker: 0.6, amount: 0.4, lit: false },
    embers: { colour: 0xff8a33, size: 0.08, breeze: [0.3, 0.8, 0.2], wander: 0.5, glow: 1, flicker: 3, amount: 0.7, lit: false },
    snow: { colour: 0xffffff, size: 0.07, breeze: [0.3, -0.6, 0.12], wander: 0.4, glow: 0.7, flicker: 0, amount: 0.9, lit: true },
});

/** Each land's motes (a MOTES kind); lands not here have none. */
export const MOTES_OF = Object.freeze({
    meadow: "pollen",
    farmland: "pollen",
    heath: "pollen",
    savannah: "dust",
    badlands: "dust",
    woods: "dust",
    mountain: "dust",
    marsh: "fireflies",
    jungle: "fireflies",
    elfwood: "wisps",
    darkwood: "wisps",
    volcanic: "embers",
    tundra: "snow",
    snow: "snow",
});

// The box round the player they drift in (metres: across, up, along), and how high its middle is
// over the player's feet
const BOX = [28, 6, 28];
const RISE = 2;

// How long one kind takes to fade out, or in (seconds)
const FADE = 1.5;

const VERTEX = `
#include <common>
#include <fog_pars_vertex>
attribute vec4 seed;
uniform float moteTime;
uniform vec3 moteCentre;
uniform vec3 moteBox;
uniform vec3 moteDrift;
uniform float moteWander;
uniform float moteSize;
uniform float moteScale;
uniform float moteFlicker;
uniform float moteAmount;
varying float vMote;

void main() {
    // (Those of the motes the land's kind doesn't use, out of sight)
    if (seed.w >= moteAmount) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vMote = 0.0;
        return;
    }

    vec3 at = seed.xyz * moteBox + moteDrift + moteWander * vec3(sin(moteTime * 0.41 + seed.w * 40.0), 0.5 * sin(moteTime * 0.33 + seed.x * 37.0), cos(moteTime * 0.37 + seed.y * 29.0));
    vec3 round = mod(at - moteCentre, moteBox) - 0.5 * moteBox;
    vec4 mvPosition = modelViewMatrix * vec4(moteCentre + round, 1.0);

    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(moteSize * moteScale / max(0.1, -mvPosition.z), 1.0, 28.0);

    vec3 edge = abs(round) / moteBox * 2.0;
    float flicker = moteFlicker > 0.0 ? pow(0.5 + 0.5 * sin(moteTime * moteFlicker + seed.w * 60.0), 3.0) : 1.0;

    vMote = (1.0 - smoothstep(0.6, 1.0, max(edge.x, max(edge.y, edge.z)))) * flicker;

    #include <fog_vertex>
}`;

const FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
uniform vec3 moteColour;
uniform float moteGlow;
uniform float moteLit;
uniform vec3 skyGlow;
varying float vMote;

void main() {
    float alpha = (1.0 - smoothstep(0.15, 1.0, length(gl_PointCoord - 0.5) * 2.0)) * vMote * moteGlow;

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(moteColour * mix(vec3(1.0), skyGlow, moteLit), alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
}`;

/**
 * The motes: `object` to add to the scene; `setQuality(count)` (QUALITY's `motes`: how many, 0 for
 * none); `update(x, y, z, dt, land, scale)` each frame (where the player's feet are, metres; the
 * land there, a BIOMES id or null indoors; how many pixels a metre is at a metre off: the
 * drawing's height over twice the tangent of half the camera's view).
 */
export class Motes {
    constructor() {
        this.uniforms = {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
            moteTime: { value: 0 },
            moteCentre: { value: new THREE.Vector3() },
            moteBox: { value: new THREE.Vector3(...BOX) },
            moteDrift: { value: new THREE.Vector3() },
            moteWander: { value: 0 },
            moteSize: { value: 0 },
            moteScale: { value: 600 },
            moteFlicker: { value: 0 },
            moteAmount: { value: 0 },
            moteColour: { value: new THREE.Color() },
            moteGlow: { value: 0 },
            moteLit: { value: 0 },
            skyGlow: SKY_GLOW,
        };
        this.material = new THREE.ShaderMaterial({
            name: "motes",
            uniforms: this.uniforms,
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: true,
        });
        this.object = new THREE.Points(new THREE.BufferGeometry(), this.material);
        this.object.name = "motes";
        this.object.frustumCulled = false;
        this.object.visible = false;
        this.count = 0;
        // (The kind shown, and how far faded in it is)
        this.kind = null;
        this.level = 0;
    }

    /** As many motes as a quality has (0: none). */
    setQuality(count) {
        if (count === this.count) {
            return;
        }

        this.count = count;
        this.object.geometry.dispose();

        const geometry = new THREE.BufferGeometry();

        if (count > 0) {
            // (Each its own place in the box and its own share of the land's kind's amount: the
            // same every time, so changing the quality doesn't move those still drawn)
            const seeds = new Float32Array(count * 4);
            let h = 0x9e3779b9;
            const next = () => {
                h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
                h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
                h ^= h >>> 15;

                return (h >>> 0) / 4294967296;
            };

            for (let k = 0; k < count * 4; k++) {
                seeds[k] = next();
            }

            geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
            geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }

        this.object.geometry = geometry;
    }

    update(x, y, z, dt, land, scale) {
        const wanted = land ? (MOTES_OF[land] ?? null) : null;
        const { uniforms } = this;

        // (Fading the kind shown out, if it's not the land's, then the land's in)
        if (this.kind !== wanted) {
            this.level = Math.max(0, this.level - dt / FADE);

            if (this.level === 0) {
                this.kind = wanted;
            }
        } else if (this.kind) {
            this.level = Math.min(1, this.level + dt / FADE);
        }

        const spec = this.kind ? MOTES[this.kind] : null;

        this.object.visible = Boolean(spec) && this.count > 0 && this.level > 0;

        if (!this.object.visible) {
            return;
        }

        uniforms.moteTime.value += dt;
        uniforms.moteCentre.value.set(x, y + RISE, z);
        // (Drifting on the breeze: kept within the box, which it wraps round anyway)
        const drift = uniforms.moteDrift.value;

        drift.set((drift.x + spec.breeze[0] * dt) % BOX[0], (drift.y + spec.breeze[1] * dt) % BOX[1], (drift.z + spec.breeze[2] * dt) % BOX[2]);
        uniforms.moteWander.value = spec.wander;
        uniforms.moteSize.value = spec.size;
        uniforms.moteScale.value = scale;
        uniforms.moteFlicker.value = spec.flicker;
        uniforms.moteAmount.value = spec.amount * this.level;
        uniforms.moteColour.value.set(spec.colour);
        uniforms.moteGlow.value = spec.glow;
        uniforms.moteLit.value = spec.lit ? 1 : 0;
    }

    dispose() {
        this.object.geometry.dispose();
        this.material.dispose();
    }
}
