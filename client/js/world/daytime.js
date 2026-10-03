// The day as it's seen (the terrain plan's M7e, §9 Day and night): where the sun and the moon are at
// a time of day (core/daytime.js), and how the land's look (look.js: its sky, its sun, its grade)
// goes through the day: the sun rising in the east, high in the south at noon, setting in the west;
// the moon over the other side of the sky, as much of it lit as its phase has; the sky's colours
// through dawn's pinks, the day's own, dusk's golds and reds and the night's deep blue, the stars
// coming out; the sunlight warm and low at either end of the day, the moonlight cold and faint, the
// light from all round falling with them.
//
// Only for the eye: the rules have the day's light from core/daytime.js alone.

import * as THREE from "three";
import { DAY } from "../core/daytime.js";

/**
 * The sun's way across the sky: how high it climbs at noon (radians). The moon's light: its
 * colour (sRGB) and strength full, how much of it there is new (starlight), and how dark its
 * shadows are (the sun's 1: the sky's light filling them more, by night). The eye at night:
 * how much brighter it sees (the picture's exposure, times the day's), grown used to the dark.
 */
export const SUN_PATH = Object.freeze({ high: (56 * Math.PI) / 180 });
export const MOONLIGHT = Object.freeze({ colour: [0.72, 0.8, 1], strength: 1, starlight: 0.3, shadows: 0.55 });
export const NIGHT_EYE = Object.freeze({ exposure: 1.5 });

/**
 * The sky's colours (sRGB, 0 to 1) at night, at dawn and at dusk (towards the sun's side: the
 * horizon's; overhead: the zenith's), and the night's grade (fog.js GRADE: tint and saturation,
 * added to the land's).
 */
export const SKY_TIMES = Object.freeze({
    night: { zenith: [0.03, 0.05, 0.12], horizon: [0.08, 0.11, 0.2] },
    dawn: { zenith: [0.26, 0.36, 0.6], horizon: [0.96, 0.68, 0.6] },
    dusk: { zenith: [0.22, 0.3, 0.55], horizon: [0.98, 0.56, 0.34] },
    grade: [-0.04, -0.01, 0.07, -0.3],
});

// The sun's warmth low in the sky (sRGB); what lights what's lit by the sky alone (smoke, motes,
// the clouds, the far trees: times its own colour) at night and at either end of the day; the glow
// round the sun by day (sky.js SKY_COLOURS.glow, sRGB)
const LOW_SUN = [1, 0.66, 0.42];
const NIGHT_GLOW = [0.14, 0.17, 0.28];
const TWILIGHT_GLOW = [1, 0.8, 0.66];
const SUN_GLOW = [1, 0.91, 0.72];

/**
 * What lights what's lit by the sky alone (smoke, motes, the far trees: times their own colour), a
 * uniform for their shaders, as the time of day has it (skyAt's glow; white without one).
 */
export const SKY_GLOW = { value: new THREE.Color(1, 1, 1) };

const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

/**
 * The way towards the sun at a time of day (into `into`): from the east horizon at sunrise, over the
 * south (SUN_PATH.high up at noon), to the west horizon at sunset, evenly; under the north through
 * the night, quicker (the night being shorter), but as slowly as by day where it's near the
 * horizon, so that the dusk and the dawn come on as slowly as the sun sets and rises.
 */
export function sunTowards(time, into = new THREE.Vector3()) {
    const day = DAY.sets - DAY.rises;
    const night = DAY.length - day;
    const since = (((time - DAY.rises) % DAY.length) + DAY.length) % DAY.length;
    let angle = (Math.PI * since) / day;

    if (since > day) {
        // (How far through the night, eased: as quick as by day at either end, quicker between)
        const u = (since - day) / night;
        const slope = night / day;

        angle = Math.PI + Math.PI * (u * u * u * (2 * slope - 2) + u * u * (3 - 3 * slope) + slope * u);
    }

    return into.set(Math.cos(angle), Math.sin(angle) * Math.sin(SUN_PATH.high), Math.sin(angle) * Math.cos(SUN_PATH.high));
}

/** How much of the moon's face is lit at a phase (0 new, 0.5 full): 0 to 1. */
export function moonLit(phase) {
    return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/**
 * The sky and its light at a time of day, the moon at a phase, over a land whose look is `land`
 * (look.js's: zenith, horizon, sun (sRGB 0 to 1), strength, mist, grade): into `into` (made the first
 * time), { sun, moon (ways towards them), key (the way the shadows' light comes from: the sun's,
 * or the moon's by night), keyColour (sRGB), keyStrength, zenith, horizon (sRGB), stars (0 to 1),
 * phase, moonShine (0 to 1), light (0 to 1: how much of the day's light from all round there is),
 * exposure (times the day's: the eye grown used to the dark), shadows (how dark: 0 to 1),
 * glow (times their own colour: the light on what's lit by nothing but the sky: smoke, motes, the
 * clouds, the far trees), sunGlow (sRGB: round the sun), grade }.
 */
export function skyAt(time, phase, land, into = null) {
    const out = into ?? { sun: new THREE.Vector3(), moon: new THREE.Vector3(), key: new THREE.Vector3(), keyColour: [1, 1, 1], keyStrength: 0, zenith: [0, 0, 0], horizon: [0, 0, 0], stars: 0, phase: 0, moonShine: 0, light: 1, exposure: 1, shadows: 1, glow: [1, 1, 1], sunGlow: [1, 1, 1], grade: [0, 0, 0, 0] };
    const sun = sunTowards(time, out.sun);
    const moon = out.moon.copy(sun).negate();
    const height = sun.y;
    // (The night's share; the twilight's, either side of the horizon; the sun's height for its
    // light, none on the horizon; and the morning's, for dawn's colours or dusk's)
    const night = 1 - smoothstep(-0.32, -0.02, height);
    const twilight = smoothstep(-0.3, -0.02, height) * (1 - smoothstep(0.02, 0.32, height));
    const shining = smoothstep(0, 0.28, height);
    const times = time < (DAY.rises + DAY.sets) / 2 ? SKY_TIMES.dawn : SKY_TIMES.dusk;
    const lit = moonLit(phase);
    const moonShine = MOONLIGHT.starlight + (1 - MOONLIGHT.starlight) * lit;

    for (let c = 0; c < 3; c++) {
        // (The night's colours a little lighter under a full moon)
        const nightZenith = SKY_TIMES.night.zenith[c] * (0.7 + 0.5 * lit);
        const nightHorizon = SKY_TIMES.night.horizon[c] * (0.7 + 0.5 * lit);

        out.zenith[c] = mix(mix(land.zenith[c], nightZenith, night), times.zenith[c], twilight * 0.55);
        out.horizon[c] = mix(mix(land.horizon[c], nightHorizon, night), times.horizon[c], twilight * 0.8);
    }

    // The light the shadows come from: the sun, warm and low at either end of the day; by night
    // the moon (at the horizon both are out, so it's handed over unseen)
    if (height > 0) {
        const low = 1 - smoothstep(0.04, 0.45, height);

        out.key.copy(sun);
        out.keyStrength = land.strength * shining;

        for (let c = 0; c < 3; c++) {
            out.keyColour[c] = mix(land.sun[c], LOW_SUN[c], low * 0.85);
        }
    } else {
        out.key.copy(moon);
        out.keyStrength = MOONLIGHT.strength * moonShine * smoothstep(0, 0.25, moon.y);
        out.keyColour.splice(0, 3, ...MOONLIGHT.colour);
    }

    out.stars = night;
    out.phase = phase;
    out.moonShine = moonShine;
    out.light = mix(1, 0.22 + 0.12 * lit, night) * (1 - 0.25 * twilight);
    out.exposure = mix(1, NIGHT_EYE.exposure, night);
    out.shadows = mix(1, MOONLIGHT.shadows, night);

    for (let c = 0; c < 3; c++) {
        out.glow[c] = mix(mix(1, NIGHT_GLOW[c] * (0.7 + 0.5 * lit), night), TWILIGHT_GLOW[c], twilight * 0.5);
        out.sunGlow[c] = mix(SUN_GLOW[c], times.horizon[c], twilight);
    }

    for (let k = 0; k < 4; k++) {
        out.grade[k] = land.grade[k] + SKY_TIMES.grade[k] * night;
    }

    return out;
}
