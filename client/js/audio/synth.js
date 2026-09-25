// The game's sounds, made in code rather than recorded: a few kinds of noise and tones, shaped
// by filters and envelopes. Nothing to download, and every sound has a few variants (different
// random noise) so repeated blows and footsteps don't sound mechanical.
//
//  - Swings: noise through a band-pass filter whose pitch rises and falls, swelling to a peak
//    (PEAKS: when, so the game can time it to land with the blow). Heavier weapons are lower and
//    slower.
//  - Hits: a thump (a sine dropping in pitch) and a burst of filtered noise, with a ring of
//    inharmonic partials for blades, a knock for wood, a zap for magic, a roar for fire.
//  - The bow: a plucked string (Karplus-Strong); spells: rising chimes and a whoosh.
//  - Spells: a rising shimmer casting a heal, a warm swell as it lands; a dizzy warble for a stun.
//  - Footsteps on stone, dirt and grass; a body falling.
//  - Cues: a target chosen, an enemy slain, falling, waking again, out of breath; the action
//    wheel opening, and a slice that can't be used.
//  - Around the town (the environment): a bird's chirp, leaves rustling, the wind (a loop).
//
// Each sound belongs to a bus, which has its own volume: "effects" (the default) or
// "environment" (the music is music.js's). Built from dsp.js; no Web Audio (sound.js plays
// them), so they're tested in Node.

import { createRandom } from "../core/random.js";
import { add, count, filter, finish, hit, noise, pluck, shape, swell, tone } from "./dsp.js";

export { loudness, SAMPLE_RATE } from "./dsp.js";

const TAU = 2 * Math.PI;

// --- The sounds ---

// A whoosh: band-passed noise, pitched from `from` up to `top` (at `peak` of the way) and down to
// `to`, swelling with it; `body` adds the low air of something big
function whoosh(random, { length, from, top, to, peak = 0.55, q = 1.3, body = 0 }) {
    const pitch = (t) => {
        const u = t / length;

        return u < peak ? from * (top / from) ** (u / peak) : top * (to / top) ** ((u - peak) / (1 - peak));
    };
    let out = filter(noise(random, length), "bandpass", pitch, q);

    if (body) {
        out = add(out, filter(noise(random, length), "lowpass", (t) => pitch(t) * 0.35), body);
    }

    return shape(out, swell(length, peak));
}

// A thump: a sine falling from `from` to `to` Hz over `length` seconds
const thump = (from, to, length, decay = length / 4) => shape(tone(length, (t) => to + (from - to) * Math.exp(-t / (length / 3))), hit(0.002, decay));

// A burst of noise through a filter, shaped as a hit
const burst = (random, length, type, frequency, q, attack, decay) => shape(filter(noise(random, length), type, frequency, q), hit(attack, decay));

// Metal ringing: inharmonic partials, each fading at its own rate
function ring(partials, length) {
    let out = new Float32Array(count(length));

    for (const [frequency, level, decay] of partials) {
        out = add(out, shape(tone(length, frequency), hit(0.001, decay)), level);
    }

    return out;
}

/** When each swing is at its loudest (seconds from its start), to time it to the blow. */
export const PEAKS = {};

const swing = (settings) => {
    PEAKS[settings.name] = settings.length * (settings.peak ?? 0.55);

    return (random) => whoosh(random, settings);
};

// A footstep: `kind` "stone", "dirt" or "grass"
function step(random, kind) {
    if (kind === "stone") {
        const heel = add(burst(random, 0.05, "bandpass", 3200, 1.1, 0.0008, 0.012), thump(160, 90, 0.08, 0.018), 0.5);

        return add(heel, burst(random, 0.04, "bandpass", 2600, 1.2, 0.0008, 0.01), 0.35, 0.03);
    }

    if (kind === "dirt") {
        const scuff = burst(random, 0.12, "bandpass", 700, 0.8, 0.003, 0.03);
        const grit = shape(filter(noise(random, 0.1).map((value) => (random.next() < 0.01 ? value * 2 : 0)), "highpass", 2500), hit(0.002, 0.03));

        return add(add(scuff, grit, 0.4), thump(110, 70, 0.08, 0.02), 0.35);
    }

    const rustle = burst(random, 0.16, "bandpass", 2800, 0.6, 0.008, 0.04);

    return add(add(rustle, burst(random, 0.12, "bandpass", 4200, 0.7, 0.006, 0.03), 0.5, 0.04), thump(90, 60, 0.07, 0.02), 0.2);
}

// Notes one after another (a cue): [[frequency, start (s)]...], each ringing for `decay` seconds
function notes(list, { decay = 0.35, harmonics = [[1, 1], [2, 0.25], [3, 0.08]], length = 1 } = {}) {
    let out = new Float32Array(count(length));

    for (const [frequency, start] of list) {
        out = add(out, shape(tone(length - start, frequency, { harmonics }), hit(0.006, decay)), 1, start);
    }

    return out;
}

/**
 * Every sound: how many variants, how loud it plays (0 to 1) and how to make one from a random
 * number generator. Swings are named for the weapons' attack animations, hits for the attacks'
 * reactions (weapons.js), launches for the projectiles.
 */
export const SOUNDS = {
    // Swings
    swingSword: { variants: 3, volume: 0.55, make: swing({ name: "swingSword", length: 0.3, from: 700, top: 2800, to: 1100 }) },
    swingStaff: { variants: 3, volume: 0.55, make: swing({ name: "swingStaff", length: 0.36, from: 380, top: 1500, to: 600, body: 0.4 }) },
    swingHammer: { variants: 3, volume: 0.6, make: swing({ name: "swingHammer", length: 0.5, from: 220, top: 850, to: 300, q: 1, body: 0.7 }) },
    swingPunch: { variants: 3, volume: 0.4, make: swing({ name: "swingPunch", length: 0.15, from: 900, top: 2300, to: 1200, peak: 0.6 }) },
    swingCleaver: { variants: 3, volume: 0.6, make: swing({ name: "swingCleaver", length: 0.34, from: 450, top: 1900, to: 700, body: 0.35 }) },

    // Hits
    slash: {
        variants: 3,
        volume: 0.75,
        make: (random) => add(add(burst(random, 0.2, "highpass", 2500, 0.8, 0.001, 0.035), thump(180, 100, 0.12, 0.03), 0.8), ring([[2150, 0.12, 0.12], [3370, 0.09, 0.09], [4810, 0.06, 0.07], [6030, 0.04, 0.05]], 0.35)),
    },
    hack: {
        variants: 3,
        volume: 0.8,
        make: (random) => add(add(burst(random, 0.2, "bandpass", 1500, 0.7, 0.001, 0.04), thump(140, 70, 0.18, 0.05), 1), ring([[1720, 0.1, 0.1], [2640, 0.07, 0.08]], 0.3)),
    },
    strike: {
        variants: 3,
        volume: 0.75,
        make: (random) => add(add(shape(tone(0.12, 230, { harmonics: [[1, 1], [2.43, 0.6], [3.9, 0.3]] }), hit(0.0005, 0.025)), burst(random, 0.03, "lowpass", 2500, 0.7, 0.0005, 0.006), 0.8), thump(110, 70, 0.14, 0.04), 0.9),
    },
    crush: {
        variants: 3,
        volume: 0.9,
        make: (random) => add(add(thump(75, 38, 0.5, 0.14), burst(random, 0.35, "lowpass", 650, 0.8, 0.002, 0.08), 0.8), burst(random, 0.03, "highpass", 3000, 0.7, 0.0005, 0.006), 0.5),
    },
    pierce: {
        variants: 3,
        volume: 0.7,
        make: (random) => add(burst(random, 0.08, "bandpass", 950, 1.2, 0.0008, 0.018), thump(200, 120, 0.12, 0.03), 0.9),
    },
    punch: {
        variants: 3,
        volume: 0.7,
        make: (random) => add(add(burst(random, 0.12, "lowpass", 1200, 0.8, 0.001, 0.03), thump(130, 80, 0.1, 0.03), 1), burst(random, 0.02, "highpass", 3500, 0.7, 0.0005, 0.004), 0.5),
    },
    arcane: {
        variants: 3,
        volume: 0.6,
        make: (random) => add(shape(tone(0.4, (t) => 250 + 950 * Math.exp(-t / 0.08), { fm: [1.51, 2.2], harmonics: [[1, 1], [2, 0.3]] }), hit(0.003, 0.09)), burst(random, 0.3, "highpass", 5000, 0.7, 0.002, 0.06), 0.3),
    },
    fire: {
        variants: 3,
        volume: 0.9,
        make: (random) => {
            const roar = burst(random, 0.8, "lowpass", (t) => 3200 * Math.exp(-t / 0.18) + 250, 0.8, 0.01, 0.2);
            const crackle = shape(filter(noise(random, 0.7).map((value) => (random.next() < 0.004 ? value * 2.5 : 0)), "highpass", 1800), hit(0.01, 0.2));

            return add(add(roar, crackle, 0.4), thump(80, 45, 0.4, 0.1), 0.7);
        },
    },

    // Launches
    arrow: {
        variants: 3,
        volume: 0.6,
        make: (random) => add(add(shape(pluck(random, 118 + random.next() * 12, 0.45, 0.994), hit(0.001, 0.09)), burst(random, 0.02, "bandpass", 1800, 1, 0.0005, 0.005), 0.8), whoosh(random, { length: 0.14, from: 2000, top: 4200, to: 3000, peak: 0.3 }), 0.25, 0.02),
    },
    bolt: {
        variants: 3,
        volume: 0.5,
        make: (random) => add(shape(tone(0.28, (t) => 520 * 2 ** (t / 0.1), { harmonics: [[1, 1], [1.5, 0.4], [2, 0.3]] }), swell(0.28, 0.4)), burst(random, 0.25, "highpass", 6000, 0.7, 0.02, 0.06), 0.25),
    },
    fireball: {
        variants: 3,
        volume: 0.6,
        make: (random) => add(whoosh(random, { length: 0.45, from: 250, top: 2200, to: 400, peak: 0.35, q: 0.8, body: 0.8 }), thump(90, 55, 0.35, 0.12), 0.4),
    },

    // Footsteps
    stepStone: { variants: 4, volume: 0.3, make: (random) => step(random, "stone") },
    stepDirt: { variants: 4, volume: 0.32, make: (random) => step(random, "dirt") },
    stepGrass: { variants: 4, volume: 0.28, make: (random) => step(random, "grass") },

    // A body hitting the ground, and its gear after it
    fall: {
        variants: 2,
        volume: 0.8,
        make: (random) => add(add(thump(80, 42, 0.4, 0.1), burst(random, 0.3, "lowpass", 500, 0.8, 0.003, 0.07), 0.9), add(thump(95, 60, 0.25, 0.05), burst(random, 0.2, "lowpass", 800, 0.8, 0.002, 0.04), 0.7), 0.5, 0.18),
    },

    // Spells: a rising shimmer as a heal is cast, a warm swell as it lands; a dizzy warble for a stun
    castHeal: {
        variants: 2,
        volume: 0.45,
        make: (random) => {
            let out = shape(filter(noise(random, 0.7), "highpass", 5000), swell(0.7, 0.7));

            [880, 1109, 1319, 1760].forEach((frequency, k) => {
                out = add(out, shape(tone(0.6, frequency, { harmonics: [[1, 1], [2.76, 0.15]] }), hit(0.01, 0.25)), 0.5, k * 0.1);
            });

            return out;
        },
    },
    healed: {
        variants: 1,
        volume: 0.5,
        make: () => {
            let out = new Float32Array(count(1.3));

            for (const frequency of [587, 740, 880, 1175]) {
                out = add(out, shape(tone(1.3, frequency, { harmonics: [[1, 1], [2, 0.2]] }), swell(1.3, 0.25)), 0.5);
            }

            return out;
        },
    },
    stun: {
        variants: 2,
        volume: 0.6,
        make: (random) => {
            const zap = shape(tone(0.25, (t) => 300 + 1200 * Math.exp(-t / 0.05), { fm: [2.01, 1.5] }), hit(0.002, 0.07));
            const warble = shape(tone(0.9, (t) => 520 + 90 * Math.sin(TAU * 7 * t) - 120 * t, { harmonics: [[1, 1], [3, 0.2]] }), swell(0.9, 0.2));

            return add(add(zap, warble, 0.6, 0.08), burst(random, 0.2, "highpass", 4500, 0.7, 0.001, 0.05), 0.4);
        },
    },

    // The action wheel: opening, and a slice that can't be used
    wheel: { variants: 1, volume: 0.3, make: (random) => add(whoosh(random, { length: 0.16, from: 1500, top: 4200, to: 2500, peak: 0.6 }), notes([[1320, 0.06]], { decay: 0.04, length: 0.16 }), 0.4) },
    denied: { variants: 1, volume: 0.35, make: () => notes([[233, 0], [196, 0.09]], { decay: 0.06, harmonics: [[1, 1], [3, 0.3], [5, 0.12]], length: 0.3 }) },

    // Cues
    lock: { variants: 1, volume: 0.35, make: () => notes([[740, 0], [1110, 0.07]], { decay: 0.06, length: 0.3 }) },
    slain: { variants: 1, volume: 0.4, make: () => notes([[523, 0], [659, 0.09], [784, 0.18], [1047, 0.27]], { decay: 0.35, length: 1.2 }) },
    fallen: { variants: 1, volume: 0.4, make: () => notes([[392, 0], [311, 0.24], [262, 0.48]], { decay: 0.6, harmonics: [[1, 1], [2, 0.12]], length: 1.8 }) },
    wake: { variants: 1, volume: 0.35, make: () => notes([[880, 0], [1320, 0.12]], { decay: 0.7, harmonics: [[1, 1], [2.76, 0.2], [5.4, 0.06]], length: 1.6 }) },
    breath: {
        variants: 2,
        volume: 0.35,
        make: (random) => {
            const out = (offset) => shape(add(filter(noise(random, 0.4), "bandpass", 1100, 1.4), filter(noise(random, 0.4), "bandpass", 2400, 2), 0.5), swell(0.4, 0.25 + offset));

            return add(out(0), out(0.05), 0.7, 0.45);
        },
    },

    // Around the town (the environment's bus): birds, and leaves rustling in a tree
    bird: {
        variants: 4,
        volume: 0.4,
        bus: "environment",
        make: (random) => {
            const pitch = 3400 + random.next() * 1800;
            const chirps = 2 + Math.floor(random.next() * 3);
            let out = new Float32Array(1);

            for (let k = 0; k < chirps; k++) {
                const length = 0.05 + random.next() * 0.04;
                const start = pitch * (0.9 + random.next() * 0.2);

                out = add(out, shape(tone(length, (t) => start * (1 - 0.4 * (t / length)), { fm: [0.25, 0.6] }), swell(length, 0.2)), 1, k * (0.09 + random.next() * 0.05));
            }

            return out;
        },
    },
    leaves: {
        variants: 3,
        volume: 0.4,
        bus: "environment",
        make: (random) => {
            const length = 1.6 + random.next() * 0.8;
            const hiss = filter(filter(noise(random, length), "highpass", 1600), "lowpass", 7000);
            const flutter = filter(noise(random, length), "lowpass", 14);
            let most = 0;

            for (const value of flutter) {
                most = Math.max(most, Math.abs(value));
            }

            const whole = swell(length, 0.4);

            return shape(hiss.map((value, n) => value * (0.25 + (0.75 * Math.abs(flutter[n])) / most)), whole);
        },
    },
};

/** The wind: ten seconds of gusting, low noise, which loops without a seam. */
export function wind(seed = 1) {
    const random = createRandom(seed);
    const loop = 10;
    const overlap = 1;
    const raw = add(filter(noise(random, loop + overlap), "lowpass", 380), filter(noise(random, loop + overlap), "bandpass", 700, 0.5), 0.35);
    const gusts = (t) => 0.55 + 0.25 * Math.sin((TAU * t) / 10) + 0.15 * Math.sin((TAU * 2 * t) / 10 + 1.3) + 0.08 * Math.sin((TAU * 3 * t) / 10 + 2.1);
    const out = new Float32Array(count(loop));
    const fade = count(overlap);

    shape(raw, gusts);

    for (let n = 0; n < out.length; n++) {
        out[n] = raw[n];
    }

    // Blend the extra second over the start, so the end runs into it
    for (let n = 0; n < fade; n++) {
        const share = n / fade;

        out[n] = raw[n] * share + raw[out.length + n] * (1 - share);
    }

    let loudest = 0;

    for (const value of out) {
        loudest = Math.max(loudest, Math.abs(value));
    }

    return out.map((value) => (value / loudest) * 0.8);
}

/** Make variant `variant` of a sound. */
export function render(name, variant = 0) {
    const sound = SOUNDS[name];
    let seed = 7;

    for (const letter of name) {
        seed = Math.imul(seed, 31) + letter.charCodeAt(0);
    }

    return finish(sound.make(createRandom((seed ^ Math.imul(variant + 1, 2654435761)) >>> 0)));
}
