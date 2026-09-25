// The music's instruments, made in code like the sounds (dsp.js): a lute and a harp (plucked
// strings), a recorder, a fiddle and a cello (blown and bowed, with vibrato), a soft string
// pad, bells, a pulse wave (the sound of 1985's home computers, as a nod to the old games), a
// frame drum and a tambourine.
//
// Each pitched instrument is made at a few pitches, a fifth apart across its range: music.js
// plays whichever is nearest a note, a little faster or slower. Sustained instruments (blown
// and bowed) are made long enough for the longest note, and faded out when a note ends; plucked
// and struck ones ring on.

import { createRandom } from "../core/random.js";
import { add, atRate, count, filter, finish, hit, noise, oscillate, pluck, shape, tone, wavetable } from "./dsp.js";

/** Samples a second the instruments are made at: less than the sounds, as they're long. */
export const MUSIC_RATE = 32000;

const TAU = 2 * Math.PI;

/** A MIDI note's frequency (A4, note 69, is 440 Hz). */
export const frequencyOf = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Vibrato: a slow waver in pitch (`depth` of it), coming in after `delay` seconds
const vibrato = (frequency, rate, depth, delay) => (t) => frequency * (1 + depth * Math.min(1, Math.max(0, (t - delay) / 0.4)) * Math.sin(TAU * rate * t));

// A sustained note's envelope: rises over `attack` seconds, then holds (easing down a little)
const held = (attack, fall = 0.1) => (t) => (t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2 : 1 - fall * Math.min(1, (t - attack) / 3));

// A bowed string: a sawtooth, shaped by the body's resonances (`formants`: [[Hz, width, level]])
function bowed(random, frequency, length, { formants, vibratoRate, vibratoDepth, attack, bow = 0.02 }) {
    const body = (hz) => 0.25 + formants.reduce((sum, [centre, width, level]) => sum + level * Math.exp(-(((hz - centre) / width) ** 2)), 0);
    const highest = Math.floor((MUSIC_RATE * 0.45) / frequency);
    const table = wavetable((k) => (body(k * frequency) / k) * (k % 2 ? 1 : 0.8), highest);
    const string = oscillate(table, length, vibrato(frequency, vibratoRate, vibratoDepth, 0.25), random.next());
    const scrape = filter(noise(random, length), "bandpass", Math.min(6000, frequency * 6), 0.8);

    return shape(add(string, scrape, bow), held(attack));
}

/**
 * Every instrument: its range (MIDI notes), whether it's held (faded out when the note ends,
 * after `release` seconds) or rings on, how long each sample is, how loud it plays in the mix
 * (`mix`) and where (`pan`, -1 left to 1 right), and how to make one at a frequency. Unpitched
 * ones (drums) have `kinds` instead: one sample each.
 */
export const INSTRUMENTS = {
    lute: {
        range: [38, 76],
        length: 2.6,
        mix: 0.42,
        pan: 0.3,
        make: (random, frequency) => {
            // Two strings to a course, a hair apart, in a wooden body
            const damping = 0.9975 - Math.min(0.0025, frequency / 400000);
            const strings = add(pluck(random, frequency * 1.0015, 2.6, damping, 2400), pluck(random, frequency * 0.9985, 2.6, damping, 2400), 0.8);

            return shape(add(strings, filter(strings, "bandpass", 420, 1.2), 0.4), hit(0.002, 1.1));
        },
    },
    harp: {
        range: [43, 91],
        length: 3,
        mix: 0.36,
        pan: -0.3,
        make: (random, frequency) => {
            const string = pluck(random, frequency, 3, 0.9985, 5000);

            return add(string, shape(tone(3, frequency), hit(0.004, 1.2)), 0.25);
        },
    },
    recorder: {
        range: [60, 88],
        length: 2.8,
        held: true,
        release: 0.12,
        mix: 0.5,
        pan: -0.15,
        make: (random, frequency) => {
            const pipe = tone(2.8, vibrato(frequency, 5.2, 0.0045, 0.3), { harmonics: [[1, 1], [2, 0.08], [3, 0.12], [4, 0.03]] });
            const breath = filter(noise(random, 2.8), "bandpass", frequency * 2, 1.5);
            const chiff = shape(filter(noise(random, 0.05), "bandpass", frequency * 3, 1), hit(0.002, 0.012));

            return add(add(shape(pipe, held(0.05, 0.08)), breath, 0.035), chiff, 0.25);
        },
    },
    fiddle: {
        range: [55, 91],
        length: 2.8,
        held: true,
        release: 0.18,
        mix: 0.46,
        pan: 0.2,
        make: (random, frequency) => bowed(random, frequency, 2.8, { formants: [[290, 90, 1], [1100, 300, 0.7], [2800, 800, 0.5]], vibratoRate: 5.6, vibratoDepth: 0.0055, attack: 0.08 }),
    },
    cello: {
        range: [36, 64],
        length: 3.2,
        held: true,
        release: 0.3,
        mix: 0.34,
        pan: 0,
        make: (random, frequency) => filter(bowed(random, frequency, 3.2, { formants: [[220, 80, 1], [700, 250, 0.6]], vibratoRate: 4.8, vibratoDepth: 0.0035, attack: 0.14, bow: 0.012 }), "lowpass", 2500),
    },
    pad: {
        range: [48, 79],
        length: 3.5,
        held: true,
        release: 0.6,
        mix: 0.2,
        pan: 0,
        make: (random, frequency) => {
            const highest = Math.floor((MUSIC_RATE * 0.45) / frequency);
            const saw = wavetable((k) => 1 / k, highest);
            let voices = new Float32Array(1);

            for (const detune of [-0.004, 0, 0.004]) {
                voices = add(voices, oscillate(saw, 3.5, frequency * (1 + detune), random.next()), 0.33);
            }

            return shape(filter(voices, "lowpass", 1700), held(0.5, 0.05));
        },
    },
    bells: {
        range: [72, 98],
        length: 2.5,
        mix: 0.18,
        pan: 0.1,
        make: (random, frequency) => {
            let out = new Float32Array(count(2.5));

            for (const [ratio, level, decay] of [[1, 1, 1.6], [2.76, 0.4, 0.6], [5.4, 0.2, 0.3], [8.93, 0.1, 0.15]]) {
                out = add(out, shape(tone(2.5, frequency * ratio, { phase: random.next() * TAU }), hit(0.002, decay)), level);
            }

            return out;
        },
    },
    chip: {
        range: [60, 96],
        length: 0.5,
        mix: 0.2,
        pan: 0,
        make: (random, frequency) => {
            // A pulse wave, a quarter of the time high, softened
            const highest = Math.floor((MUSIC_RATE * 0.45) / frequency);
            const pulse = wavetable((k) => Math.sin(Math.PI * k * 0.25) / k, highest);

            return shape(filter(oscillate(pulse, 0.5, frequency), "lowpass", 3800), hit(0.002, 0.16));
        },
    },
    drum: {
        kinds: ["low", "high"],
        length: 0.6,
        mix: 0.42,
        pan: 0,
        make: (random, kind) => {
            const [from, to, decay, skin] = kind === "low" ? [95, 58, 0.18, 900] : [190, 150, 0.08, 1700];
            const body = shape(tone(0.6, (t) => to + (from - to) * Math.exp(-t / 0.04)), hit(0.002, decay));

            return add(body, shape(filter(noise(random, 0.2), kind === "low" ? "lowpass" : "bandpass", skin, 0.9), hit(0.001, 0.035)), kind === "low" ? 0.5 : 0.8);
        },
    },
    tambourine: {
        kinds: ["hit"],
        length: 0.4,
        mix: 0.18,
        pan: 0.25,
        make: (random) => {
            let out = shape(filter(noise(random, 0.4), "highpass", 6500), hit(0.001, 0.05));

            for (const jingle of [5200, 6700, 8100, 9400]) {
                out = add(out, shape(tone(0.4, jingle * (0.98 + random.next() * 0.04)), hit(0.001, 0.12)), 0.15);
            }

            return out;
        },
    },
};

/** The pitches an instrument is made at: from the bottom of its range, a fifth apart. */
export function basesOf(instrument) {
    const [low, high] = instrument.range;
    const bases = [];

    for (let pitch = low; pitch <= high; pitch += 7) {
        bases.push(pitch);
    }

    return bases;
}

/** Of an instrument's bases, the one to play a note from (the nearest). */
export function baseFor(instrument, pitch) {
    return basesOf(instrument).reduce((best, base) => (Math.abs(base - pitch) < Math.abs(best - pitch) ? base : best));
}

/**
 * Make an instrument's sample at a base pitch (or of a kind, for drums), at MUSIC_RATE: made the
 * same every time, and as loud as the others.
 */
export function renderInstrument(name, key) {
    const instrument = INSTRUMENTS[name];
    let seed = 1985;

    for (const letter of `${name}${key}`) {
        seed = Math.imul(seed, 31) + letter.charCodeAt(0);
    }

    return atRate(MUSIC_RATE, () => {
        const random = createRandom(seed >>> 0);
        const samples = instrument.kinds ? instrument.make(random, key) : instrument.make(random, frequencyOf(key));

        return finish(samples, { fadeIn: 0.001, fadeOut: 0.02 });
    });
}

/** Every sample the music needs: [name, key (base pitch or kind)]. */
export function instrumentSamples() {
    return Object.entries(INSTRUMENTS).flatMap(([name, instrument]) => (instrument.kinds ?? basesOf(instrument)).map((key) => [name, key]));
}
