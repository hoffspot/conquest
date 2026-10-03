// The sky over the world outside: deep blue overhead paling to the haze at the horizon (the fog's
// colour, so the world's far edge melts into it), the sun (a bright disc in a glow, none once it's
// set), the moon (its disc as much lit as its phase has, a faint glow round it) and, at night, the
// stars, about a thousand, twinkling; and clouds drifting slowly across on the wind, soft-edged, lit
// as the sky is (white by day, gold at dusk, grey-blue at night), thinning out towards the
// horizon. Its colours and where the sun and moon are come from the time of day (daytime.js).
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

/**
 * The stars: how many cells of the sky's grid go round it, and the share of them with a star (so
 * about a thousand over the sky). The moon: its radius (radians: a little bigger than
 * the real one's).
 */
export const STARS = Object.freeze({ cells: 220, share: 0.1 });
export const MOON = Object.freeze({ radius: 0.017 });

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

// (The glow round the sun on a fair day)
const FAIR_GLOW = srgb(SKY_COLOURS.glow);

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
uniform vec3 moonDirection;
uniform float moonPhase;
uniform float moonShine;
uniform float stars;
uniform vec3 cloudLight;
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

    // The sun: a glow round it (fading once it's set), and its disc (none under the horizon)
    float toSun = max(dot(direction, sunDirection), 0.0);
    float above = smoothstep(-0.02, 0.01, up);
    colour += glowColour * (pow(toSun, 9.0) * 0.12 + pow(toSun, 120.0) * 0.35) * smoothstep(-0.2, 0.0, sunDirection.y);

    // The stars: one in some of the cells of a grid over the sky (its longitude and height),
    // somewhere in its cell, as bright as it is, twinkling; a point a pixel or so across (none
    // where the grid's cells are smaller than a pixel: where the longitude turns over)
    if (stars > 0.0 && up > 0.0) {
        vec2 grid = vec2(atan(direction.z, direction.x), asin(up)) * ${(STARS.cells / (2 * Math.PI)).toFixed(3)};
        float across = max(fwidth(grid.x), fwidth(grid.y));

        if (across < 0.5) {
            vec2 cell = floor(grid);
            float seed = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
            vec2 at = vec2(fract(seed * 7.13), fract(seed * 3.71)) * 0.8 + 0.1;
            float bright = step(${(1 - STARS.share).toFixed(3)}, seed) * (0.35 + 0.65 * fract(seed * 13.7));
            float twinkle = 0.7 + 0.3 * sin(time * (1.3 + 2.6 * fract(seed * 5.3)) + seed * 40.0);
            float star = bright * twinkle * smoothstep(1.4, 0.2, length(fract(grid) - at) / across);

            colour += vec3(0.92, 0.95, 1.0) * star * stars * smoothstep(0.0, 0.12, up);
        }
    }

    // The moon: its disc, lit on the side towards the sun as much as its phase has (the rest
    // faintly), its seas darker; a glow round it as bright as it is
    float toMoon = dot(direction, moonDirection);

    colour += vec3(0.6, 0.66, 0.8) * pow(max(toMoon, 0.0), 300.0) * 0.08 * moonShine * above;

    if (toMoon > ${Math.cos(MOON.radius * 1.2).toFixed(7)}) {
        vec3 right = normalize(cross(moonDirection, vec3(0.0, 1.0, 0.0)));
        vec3 upward = cross(right, moonDirection);
        vec2 on = vec2(dot(direction, right), dot(direction, upward)) / ${MOON.radius.toFixed(5)};
        float edge = sqrt(max(0.0, 1.0 - on.y * on.y));
        float terminator = cos(moonPhase * 6.2831853) * edge;
        float lit = moonPhase < 0.5 ? smoothstep(terminator - 0.12, terminator + 0.12, on.x) : smoothstep(-terminator - 0.12, -terminator + 0.12, -on.x);
        float seas = 0.78 + 0.22 * texture2D(clouds, on * 0.35 + 0.5).r;
        float disc = smoothstep(1.0, 0.9, length(on)) * above;

        colour = mix(colour, mix(colour + vec3(0.03, 0.035, 0.05), vec3(0.96, 0.95, 0.88) * seas, lit), disc);
    }

    // The clouds, on a plane over the camera: two reads of the noise, drifting at their own
    // speeds, soft-edged; thinning out towards the horizon
    if (up > 0.0) {
        vec2 plane = direction.xz / (up + 0.18) / cover.z;
        float near = texture2D(clouds, plane + wind * time).r;
        float far = texture2D(clouds, plane * 2.6 + vec2(0.31, 0.77) - wind * time * 0.7).r;
        float thick = near * 0.68 + far * 0.32;
        float amount = smoothstep(cover.x, cover.y, thick) * smoothstep(0.02, 0.28, up);
        // (Lit on top, darker where thickest; brighter towards the sun; as the sky's lit)
        vec3 cloud = mix(vec3(0.97, 0.97, 0.98), vec3(0.66, 0.71, 0.79), smoothstep(cover.y - 0.1, cover.y + 0.2, thick) * 0.8);
        cloud += glowColour * pow(toSun, 6.0) * 0.18;
        colour = mix(colour, cloud * cloudLight, amount * 0.92);
    }

    colour = mix(colour, sunColour, smoothstep(0.99955, 0.99975, toSun) * above);

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
            moonDirection: { value: sunDirection.clone().normalize().negate() },
            moonPhase: { value: 0.5 },
            moonShine: { value: 1 },
            stars: { value: 0 },
            cloudLight: { value: new THREE.Vector3(1, 1, 1) },
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

    /**
     * The sky at a time of day (daytime.js skyAt's): its colours, where the sun and the moon are,
     * the moon's phase and light, the stars, the light on the clouds and the glow round the sun.
     * None (null): the fair day's (no stars, the moon under the horizon; the colours and the sun
     * left as they're set).
     */
    setTime(sky) {
        const { uniforms } = this;

        if (!sky) {
            uniforms.moonDirection.value.set(0, -0.6, -0.8);
            uniforms.stars.value = 0;
            uniforms.cloudLight.value.set(1, 1, 1);
            uniforms.glowColour.value.copy(FAIR_GLOW);

            return;
        }

        uniforms.zenith.value.set(...sky.zenith);
        uniforms.horizon.value.set(...sky.horizon);
        uniforms.sunDirection.value.copy(sky.sun);
        uniforms.moonDirection.value.copy(sky.moon);
        uniforms.moonPhase.value = sky.phase;
        uniforms.moonShine.value = sky.moonShine;
        uniforms.stars.value = sky.stars;
        uniforms.cloudLight.value.set(...sky.glow);
        uniforms.glowColour.value.set(...sky.sunGlow);
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
