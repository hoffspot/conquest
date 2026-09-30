// The sky over the world outside, a fair day: deep blue overhead paling to the haze at the
// horizon (the fog's colour, so the world's far edge melts into it), the sun where the shadows
// come from (a bright disc in a glow), and clouds drifting slowly across on the wind, soft-edged,
// white where the sun's on them and grey-blue underneath, thinning out towards the horizon.
//
// One dome round the camera, drawn first and behind everything (it writes no depth): a
// gradient, the sun and two reads of a small tiling texture of noise for the clouds, so it costs
// little even when the sky fills the screen. Its colours are worked in the picture's own
// (sRGB) colours, untouched by the tone mapping, as the fog's and the background's are; drawn
// into a texture, it's put out in light's (linear), as everything drawn into one is. The world's
// light from all round is drawn from it (environment.js).

import * as THREE from "three";
import { tiling } from "../core/noise.js";

/** The sky's colours (as the fog's, sRGB): overhead, at the horizon, the sun's and its glow's. */
export const SKY_COLOURS = Object.freeze({ zenith: 0x4f86c2, horizon: 0xa9c8de, sun: 0xfffbe8, glow: 0xffe8b8 });

/**
 * The clouds: how much of the sky they cover (0 to 1: the noise's value where they start and
 * where they're thick), how big (a copy of the noise across this many units of the sky's plane,
 * which is a unit over the camera), and how fast the wind blows them (units a second).
 */
export const CLOUDS = Object.freeze({ from: 0.5, thick: 0.74, size: 1.6, wind: [0.006, 0.0025] });

// The dome's radius (metres: inside the camera's far plane), and the clouds' noise
const RADIUS = 120;
const TEXELS = 128;
const CELLS = 6;

let noise = null;

// The clouds' noise, tiling: a small texture made once
function cloudTexture() {
    if (!noise) {
        const data = new Uint8Array(TEXELS * TEXELS * 4);

        for (let y = 0; y < TEXELS; y++) {
            for (let x = 0; x < TEXELS; x++) {
                const value = Math.round(tiling((x / TEXELS) * CELLS, (y / TEXELS) * CELLS, CELLS, 911, 5) * 255);

                data.set([value, value, value, 255], (y * TEXELS + x) * 4);
            }
        }

        noise = new THREE.DataTexture(data, TEXELS, TEXELS, THREE.RGBAFormat);
        noise.wrapS = THREE.RepeatWrapping;
        noise.wrapT = THREE.RepeatWrapping;
        noise.magFilter = THREE.LinearFilter;
        noise.minFilter = THREE.LinearMipmapLinearFilter;
        noise.generateMipmaps = true;
        noise.needsUpdate = true;
    }

    return noise;
}

// A colour's sRGB components, as the shader works in them
function srgb(hex) {
    const { r, g, b } = new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);

    return new THREE.Vector3(r, g, b);
}

const VERTEX = `
varying vec3 vDirection;

void main() {
    vDirection = position;
    vec4 at = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * at;
    gl_Position.z = gl_Position.w * 0.99999;
}`;

const FRAGMENT = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunColour;
uniform vec3 glowColour;
uniform vec3 sunDirection;
uniform sampler2D clouds;
uniform float time;
uniform vec2 wind;
uniform vec3 cover;
varying vec3 vDirection;

void main() {
    vec3 direction = normalize(vDirection);
    float up = direction.y;

    // Deep overhead, paling to the haze at the horizon (and the haze below it)
    vec3 colour = mix(horizon, zenith, pow(clamp(up, 0.0, 1.0), 0.55));

    // The sun: a glow round it, and its disc
    float toSun = max(dot(direction, sunDirection), 0.0);
    colour += glowColour * (pow(toSun, 9.0) * 0.12 + pow(toSun, 120.0) * 0.35);

    // The clouds, on a plane over the camera: two reads of the noise, drifting at their own
    // speeds, soft-edged; thinning out towards the horizon
    if (up > 0.0) {
        vec2 plane = direction.xz / (up + 0.18) / cover.z;
        float near = texture2D(clouds, plane + wind * time).r;
        float far = texture2D(clouds, plane * 2.6 + vec2(0.31, 0.77) - wind * time * 0.7).r;
        float thick = near * 0.68 + far * 0.32;
        float amount = smoothstep(cover.x, cover.y, thick) * smoothstep(0.02, 0.28, up);
        // (Lit on top, darker where thickest; brighter towards the sun)
        vec3 cloud = mix(vec3(0.97, 0.97, 0.98), vec3(0.66, 0.71, 0.79), smoothstep(cover.y - 0.1, cover.y + 0.2, thick) * 0.8);
        cloud += glowColour * pow(toSun, 6.0) * 0.18;
        colour = mix(colour, cloud, amount * 0.92);
    }

    colour = mix(colour, sunColour, smoothstep(0.99955, 0.99975, toSun));

    // (Taken back to light's colours, which three.js puts out in the picture's again on the
    // screen and leaves so in a texture: the light from all round, the world behind the pack)
    gl_FragColor = sRGBTransferEOTF(vec4(colour, 1.0));
    #include <colorspace_fragment>
}`;

/**
 * The sky, round the camera (`sky.object`, added to the scene): `update(camera, time)` each frame
 * before drawing (it follows the camera; `time` in seconds, for the clouds' drift), `setSun`
 * where the sun is (a direction towards it).
 */
export class Sky {
    constructor(sunDirection = new THREE.Vector3(-0.55, 1, 0.65).normalize()) {
        const uniforms = {
            zenith: { value: srgb(SKY_COLOURS.zenith) },
            horizon: { value: srgb(SKY_COLOURS.horizon) },
            sunColour: { value: srgb(SKY_COLOURS.sun) },
            glowColour: { value: srgb(SKY_COLOURS.glow) },
            sunDirection: { value: sunDirection.clone().normalize() },
            clouds: { value: cloudTexture() },
            time: { value: 0 },
            wind: { value: new THREE.Vector2(...CLOUDS.wind) },
            cover: { value: new THREE.Vector3(CLOUDS.from, CLOUDS.thick, CLOUDS.size) },
        };
        const material = new THREE.ShaderMaterial({ name: "sky", uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });

        this.uniforms = uniforms;
        this.object = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 32, 16), material);
        this.object.name = "sky";
        this.object.renderOrder = -1000;
        this.object.frustumCulled = false;
        this.object.matrixAutoUpdate = false;
    }

    /** Where the sun is: a direction towards it (it's shown where the shadows come from). */
    setSun(direction) {
        this.uniforms.sunDirection.value.copy(direction).normalize();
    }

    /** Follow the camera, and drift the clouds on (`time`: seconds). */
    update(camera, time) {
        this.object.position.copy(camera.position);
        this.object.updateMatrix();
        this.uniforms.time.value = time;
    }

    dispose() {
        this.object.geometry.dispose();
        this.object.material.dispose();
    }
}
