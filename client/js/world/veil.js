// A portal's veil: the guild's portals' indoors (interiors3d.js guildPortal), a hell's within its
// levels (interiors3d.js riftPortal), and a hell's way in standing in the open, out in the wilds
// (art/kits/neutral.js hellgate: openVeil), its swirl lit only at night. Each a light worked out as
// it's drawn, swirling into a vortex in its colours (VEILS).

import * as THREE from "three";
import { WINDOW_LIGHT } from "./art/engine/atlas.js";
import { WATER_DETAIL } from "./water.js";

// World pixels in a metre (the art's)
const M = 5;

/**
 * A guild's portal's veil: how long its swirl takes to come round to where it began (seconds:
 * the time it's given runs from 0 to this, over and over, so it never grows too big for the
 * graphics card to count finely), and the time in it (set as the room's drawn, interiors3d.js
 * update; and out of doors as the game goes on, game.js, by the same clock).
 */
export const VEIL = Object.freeze({ loop: 120, time: { value: 0 } });

/**
 * The colours of a portal's veil, by whose it is (GLSL vec3s, as they'd be seen): its deeps, its
 * middle and its brightest streaks (`deep`, `middle`, `high`), its eye (`eye`) and the light
 * churning at its rim (`rim`); and, standing in the open, the dark it is by day, unlit (`still`).
 * A guild's the deep blues of its portals; a hell's (core/dungeons themes.js `portals`) the reds
 * and golds of a fire seen through smoke, and by day a smoke that doesn't stir.
 */
export const VEILS = Object.freeze({
    guild: { deep: [0.02, 0.05, 0.2], middle: [0.07, 0.3, 0.85], high: [0.45, 0.88, 1], eye: [0.85, 0.97, 1], rim: [0.35, 0.75, 1], still: [0.03, 0.04, 0.07] },
    hell: { deep: [0.1, 0.0, 0.0], middle: [0.72, 0.1, 0.02], high: [1, 0.6, 0.16], eye: [1, 0.88, 0.55], rim: [1, 0.32, 0.06], still: [0.06, 0.032, 0.03] },
});

const vec3Of = (colour) => `vec3(${colour.map((c) => c.toFixed(3)).join(", ")})`;

// A guild's portal's veil, as fluid swirling into a vortex: worked out for each point of it
// (its shape's texture coordinates, art pixels: five to a metre from the middle of the opening's
// foot), in log-polar coordinates about its eye (as far round as it is out, so its eddies stay
// round), twisted into five arms that wind tighter towards the eye (still, as a galaxy's arms
// are: only what flows along them moves, turning and falling inward, so it never winds up), a
// noise flowing along them warped by another (the folds of a fluid), finer only where there's
// room to draw it (band-limited), in the deep blues of the guild's portals: streaks of light
// along the arms, a bright eye, the light drawn inward to it, a churning rim against the stone,
// and the whole breathing slowly. Every way it moves comes round whole each loop (VEIL), so it
// never jumps; the noise repeats round the eye, so there's no seam. Its finer fold at medium
// quality and up (WATER_DETAIL, as the water's ripples). In its colours (`kind`: VEILS); with
// `night`, standing in the open (openVeil), swirling only as the windows are lit, at night
// (WINDOW_LIGHT, as the shader's `windowLight`), and by day its still dark, unstirred
export function veilShader(shader, kind = "guild", { night = false } = {}) {
    const colours = VEILS[kind] ?? VEILS.guild;

    Object.assign(shader.uniforms, { veilTime: VEIL.time, veilDetail: WATER_DETAIL, ...(night ? { windowLight: WINDOW_LIGHT } : {}) });
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vVeil;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvVeil = uv;");
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            `#include <common>
varying vec2 vVeil;
uniform float veilTime;
uniform float veilDetail;

const float VEIL_LOOP = ${VEIL.loop.toFixed(1)};
const float VEIL_ARMS = 5.0;
const vec2 VEIL_PERIOD = vec2(VEIL_ARMS, 8.0);
const vec2 VEIL_EYE = vec2(0.0, 1.35);

// (A hash without sines, Dave Hoskins's; value noise on a lattice wrapped to its period, so it tiles
// round the eye; and its octaves, each faded out where it would be finer than a pixel)
float veilHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);

    p3 += dot(p3, p3.yzx + 33.33);

    return fract((p3.x + p3.y) * p3.z);
}

float veilNoise(vec2 p, vec2 period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 i0 = mod(i, period);
    vec2 i1 = mod(i + 1.0, period);

    return mix(mix(veilHash(i0), veilHash(vec2(i1.x, i0.y)), u.x), mix(veilHash(vec2(i0.x, i1.y)), veilHash(i1), u.x), u.y);
}

float veilFbm(vec2 p, vec2 period, float footprint, int octaves) {
    float sum = 0.0;
    float amplitude = 0.5;
    float total = 0.0;

    for (int k = 0; k < 4; k++) {
        if (k >= octaves) break;

        sum += amplitude * (veilNoise(p, period) - 0.5) * smoothstep(1.0, 0.5, footprint);
        total += amplitude;
        p = p * 2.0 + 0.37;
        period *= 2.0;
        footprint *= 2.0;
        amplitude *= 0.5;
    }

    return 0.5 + sum / total;
}

// (How far a point is inside the opening, negative within it: a semicircle size.x across, on
// legs size.y long, from the middle of the semicircle's foot; Inigo Quilez's)
float veilEdge(vec2 p, vec2 size) {
    p.x = abs(p.x);
    p.y = -p.y;

    vec2 q = p - size;
    float d1 = dot(vec2(max(q.x, 0.0), q.y), vec2(max(q.x, 0.0), q.y));

    q.x = p.y > 0.0 ? q.x : length(p) - size.x;

    float d2 = dot(vec2(q.x, max(q.y, 0.0)), vec2(q.x, max(q.y, 0.0)));
    float d = sqrt(min(d1, d2));

    return max(q.x, q.y) < 0.0 ? -d : d;
}

vec3 veilAt(vec2 at) {
    vec2 d = at - VEIL_EYE;
    float r = max(length(d), 1e-4);
    vec2 lp = vec2(atan(d.y, d.x) / PI2 * VEIL_ARMS, log(r) * VEIL_ARMS / PI2);
    float footprint = 1.5 * fwidth(lp.y);

    lp.x += 0.5 * lp.y + VEIL_ARMS / PI2 * 1.2 / (r + 0.12);

    vec2 flow = VEIL_PERIOD * vec2(4.0, 2.0) * (veilTime / VEIL_LOOP);
    int octaves = veilDetail > 0.5 ? 3 : 2;
    vec2 drift = lp + flow * 0.5;
    vec2 q = vec2(veilFbm(drift, VEIL_PERIOD, footprint, 2), veilFbm(drift + vec2(2.0, 3.0), VEIL_PERIOD, footprint, 2));
    vec2 swirl = lp + flow + 1.6 * (q - 0.5);
    float f = veilFbm(swirl, VEIL_PERIOD, footprint, octaves);
    float ridge = 1.0 - abs(2.0 * veilNoise(swirl * vec2(1.0, 3.0), VEIL_PERIOD * vec2(1.0, 3.0)) - 1.0);
    vec3 deep = ${vec3Of(colours.deep)};
    vec3 middle = ${vec3Of(colours.middle)};
    vec3 high = ${vec3Of(colours.high)};
    vec3 colour = mix(deep, middle, smoothstep(0.25, 0.8, f));

    colour = mix(colour, high, 0.8 * smoothstep(0.55, 0.95, f));
    colour += high * 0.6 * pow(ridge, 6.0) * smoothstep(1.0, 0.3, footprint * 3.0);
    colour = mix(colour, ${vec3Of(colours.eye)}, exp(-r / 0.09));
    colour *= (0.75 + 0.5 * exp(-r / 0.45)) * (0.93 + 0.07 * sin(PI2 * 15.0 * veilTime / VEIL_LOOP));
    colour += ${vec3Of(colours.rim)} * 0.9 * exp((veilEdge(at - vec2(0.0, 1.75), vec2(0.8, 1.75)) + 0.04 * (f - 0.5)) / 0.07);

    // (Worked out as it's to be seen: into the light it's drawn in, as every colour is)
    return pow(max(colour, 0.0), vec3(2.2));
}
${night ? NIGHT_GLSL(colours) : ""}`,
        )
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec4 diffuseColor = vec4( ${night ? "veilAtNight" : "veilAt"}(vVeil / ${M.toFixed(1)}), opacity );`);
}

// A veil standing in the open (veilShader's `night`): by day its still dark (`colours.still`), a
// smoke that doesn't stir, darker and lighter in broad patches; the swirl coming up through it as
// the evening draws in, as the windows are lit (`windowLight.x`), worked out only then
const NIGHT_GLSL = (colours) => `
uniform vec4 windowLight;

vec3 veilAtNight(vec2 at) {
    vec3 still = pow(${vec3Of(colours.still)} * (0.6 + 0.8 * veilNoise(at * vec2(2.2, 1.3), vec2(64.0))), vec3(2.2));

    return windowLight.x > 0.0 ? mix(still, veilAt(at), windowLight.x) : still;
}`;

const open = new Map();

/**
 * The veil of a portal standing in the open (a hell's way in, out in the wilds: art/kits/neutral.js
 * hellgate), in `kind`'s colours (VEILS): drawn both sides, its light its own whatever's round it,
 * casting no shadow; swirling only at night (veilShader's `night`), by day a still, dark opening.
 * Its texture coordinates are the guild's veil's: art pixels from the middle of its opening's
 * foot, the opening a semicircle 0.8 m round on legs 1.75 m long.
 */
export function openVeil(kind = "hell") {
    if (!open.has(kind)) {
        const result = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });

        result.name = `veil-${kind}-open`;
        result.userData.shadow = false;
        result.onBeforeCompile = (shader) => veilShader(shader, kind, { night: true });
        result.customProgramCacheKey = () => `veil-${kind}-open`;
        open.set(kind, result);
    }

    return open.get(kind);
}
