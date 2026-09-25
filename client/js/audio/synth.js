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
//  - Footsteps on stone, dirt and grass; a body falling; a bird's chirp; the wind (a loop).
//  - Cues: a target chosen, an enemy slain, falling, waking again, out of breath.
//
// Pure maths on arrays of samples, no Web Audio: sound.js plays them. So they're tested in Node.

import { createRandom } from "../core/random.js";

/** Samples a second the sounds are made at (the browser plays them at its own rate). */
export const SAMPLE_RATE = 48000;

const TAU = 2 * Math.PI;
const count = (seconds) => Math.max(1, Math.round(seconds * SAMPLE_RATE));

/** White noise, `seconds` long. */
function noise(random, seconds) {
    const out = new Float32Array(count(seconds));

    for (let n = 0; n < out.length; n++) {
        out[n] = random.next() * 2 - 1;
    }

    return out;
}

/**
 * A biquad filter (Robert Bristow-Johnson's cookbook): "lowpass", "highpass" or "bandpass",
 * at `frequency` Hz (a number, or a function of the time in seconds), with resonance `q`.
 */
function filter(input, type, frequency, q = Math.SQRT1_2) {
    const out = new Float32Array(input.length);
    const at = typeof frequency === "function" ? frequency : () => frequency;
    let [x1, x2, y1, y2] = [0, 0, 0, 0];
    let [b0, b1, b2, a1, a2] = [0, 0, 0, 0, 0];

    for (let n = 0; n < input.length; n++) {
        // New coefficients every 32 samples, for filters that sweep
        if (n % 32 === 0) {
            const f = Math.min(SAMPLE_RATE * 0.45, Math.max(10, at(n / SAMPLE_RATE)));
            const w = (TAU * f) / SAMPLE_RATE;
            const cos = Math.cos(w);
            const alpha = Math.sin(w) / (2 * q);
            const a0 = 1 + alpha;

            if (type === "lowpass") {
                [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
            } else if (type === "highpass") {
                [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
            } else {
                [b0, b1, b2] = [alpha, 0, -alpha];
            }

            [b0, b1, b2, a1, a2] = [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
        }

        const x = input[n];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        out[n] = y;
    }

    return out;
}

/** Multiply by an envelope: a function of the time in seconds. */
function shape(samples, envelope) {
    for (let n = 0; n < samples.length; n++) {
        samples[n] *= envelope(n / SAMPLE_RATE);
    }

    return samples;
}

/** A quick rise over `attack` seconds, then a fall by e every `decay` seconds. */
const hit = (attack, decay) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** A swell to a peak `peak` of the way through `length` seconds, and away again. */
const swell = (length, peak) => (t) => {
    const u = t / length;

    return u < peak ? Math.sin((Math.PI / 2) * (u / peak)) ** 2 : Math.cos((Math.PI / 2) * Math.min(1, (u - peak) / (1 - peak))) ** 2;
};

/**
 * A tone `seconds` long at `frequency` Hz (or a function of time), with `harmonics` [[multiple,
 * level]...] over it, and optional frequency modulation ([ratio, depth]).
 */
function tone(seconds, frequency, { harmonics = [[1, 1]], fm = null, phase = 0 } = {}) {
    const out = new Float32Array(count(seconds));
    const at = typeof frequency === "function" ? frequency : () => frequency;
    const multiples = harmonics.map(([multiple]) => multiple);
    const levels = harmonics.map(([, level]) => level);
    const [ratio, depth] = fm ?? [0, 0];
    let angle = phase;
    let modulator = 0;

    for (let n = 0; n < out.length; n++) {
        const f = at(n / SAMPLE_RATE);
        const bend = depth ? depth * Math.sin(modulator) : 0;
        let value = 0;

        for (let k = 0; k < multiples.length; k++) {
            value += levels[k] * Math.sin(multiples[k] * angle + bend);
        }

        out[n] = value;
        angle += (TAU * f) / SAMPLE_RATE;
        modulator += (TAU * f * ratio) / SAMPLE_RATE;
    }

    return out;
}

/** A plucked string (Karplus-Strong) at `frequency` Hz, `seconds` long, losing `damping` a cycle. */
function pluck(random, frequency, seconds, damping = 0.996) {
    const out = new Float32Array(count(seconds));
    const period = Math.max(2, Math.round(SAMPLE_RATE / frequency));
    const line = filter(noise(random, period / SAMPLE_RATE + 0.001), "lowpass", 3000).subarray(0, period);

    for (let n = 0; n < out.length; n++) {
        const k = n % period;
        const next = line[(k + 1) % period];
        const value = line[k];

        out[n] = value;
        line[k] = damping * 0.5 * (value + next);
    }

    return out;
}

/** Add `layer` into `mix` (which grows to fit) at `offset` seconds, times `gain`. */
function add(mix, layer, gain = 1, offset = 0) {
    const start = Math.round(offset * SAMPLE_RATE);
    const length = Math.max(mix.length, start + layer.length);
    let out = mix;

    if (length > mix.length) {
        out = new Float32Array(length);
        out.set(mix);
    }

    for (let n = 0; n < layer.length; n++) {
        out[start + n] += layer[n] * gain;
    }

    return out;
}

// How loud every sound is made (the loudest 30 ms of it, root mean square), before its own volume
// (SOUNDS) scales it: so a roar of noise and a pure tone sound about as loud as each other
const LOUDNESS = 0.3;
const PEAK = 0.95;

/** How loud a sound is: the root mean square of its loudest 30 ms. */
export function loudness(samples) {
    const window = count(0.03);
    let sum = 0;
    let loudest = 0;

    for (let n = 0; n < samples.length; n++) {
        sum += samples[n] * samples[n];

        if (n >= window) {
            sum -= samples[n - window] * samples[n - window];
        }

        loudest = Math.max(loudest, sum);
    }

    return Math.sqrt(Math.max(0, loudest) / Math.min(window, samples.length));
}

/**
 * Tidy a sound: no DC, a short fade at each end (no clicks), and as loud as the others (LOUDNESS),
 * as far as its loudest sample allows (PEAK).
 */
function finish(samples) {
    const out = filter(samples, "highpass", 25);
    const fade = count(0.004);
    let peak = 0;

    for (let n = 0; n < out.length; n++) {
        out[n] *= Math.min(1, n / fade, (out.length - 1 - n) / fade);
        peak = Math.max(peak, Math.abs(out[n]));
    }

    const level = loudness(out);
    const scale = level > 0 ? Math.min(PEAK / peak, LOUDNESS / level) : 0;

    for (let n = 0; n < out.length; n++) {
        out[n] *= scale;
    }

    return out;
}

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

    // Out in the fields
    bird: {
        variants: 4,
        volume: 0.18,
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
