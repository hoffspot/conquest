// The building blocks the game's sounds and music are made from: noise, tones, wavetables,
// filters, envelopes, a plucked string, mixing and levels. Pure maths on arrays of samples, no
// Web Audio (sound.js plays the results), so they run in a worker and in Node.
//
// Everything is made at the current sample rate, SAMPLE_RATE unless atRate() says otherwise
// (the music's instruments are made at a lower rate, to take less memory).

/** Samples a second sounds are made at (the browser plays them at its own rate). */
export const SAMPLE_RATE = 48000;

const TAU = 2 * Math.PI;
let rate = SAMPLE_RATE;

/** Make something at another sample rate: `make()` runs with it, and its result is returned. */
export function atRate(sampleRate, make) {
    const before = rate;

    rate = sampleRate;

    try {
        return make();
    } finally {
        rate = before;
    }
}

/** The sample rate things are being made at. */
export const currentRate = () => rate;

/** How many samples `seconds` is (at least one). */
export const count = (seconds) => Math.max(1, Math.round(seconds * rate));

/** White noise, `seconds` long. */
export function noise(random, seconds) {
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
export function filter(input, type, frequency, q = Math.SQRT1_2) {
    const out = new Float32Array(input.length);
    const at = typeof frequency === "function" ? frequency : () => frequency;
    let [x1, x2, y1, y2] = [0, 0, 0, 0];
    let [b0, b1, b2, a1, a2] = [0, 0, 0, 0, 0];

    for (let n = 0; n < input.length; n++) {
        // New coefficients every 32 samples, for filters that sweep
        if (n % 32 === 0) {
            const f = Math.min(rate * 0.45, Math.max(10, at(n / rate)));
            const w = (TAU * f) / rate;
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
export function shape(samples, envelope) {
    for (let n = 0; n < samples.length; n++) {
        samples[n] *= envelope(n / rate);
    }

    return samples;
}

/** A quick rise over `attack` seconds, then a fall by e every `decay` seconds. */
export const hit = (attack, decay) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** A swell to a peak `peak` of the way through `length` seconds, and away again. */
export const swell = (length, peak) => (t) => {
    const u = t / length;

    return u < peak ? Math.sin((Math.PI / 2) * (u / peak)) ** 2 : Math.cos((Math.PI / 2) * Math.min(1, (u - peak) / (1 - peak))) ** 2;
};

/**
 * A tone `seconds` long at `frequency` Hz (or a function of time), with `harmonics` [[multiple,
 * level]...] over it, and optional frequency modulation ([ratio, depth]).
 */
export function tone(seconds, frequency, { harmonics = [[1, 1]], fm = null, phase = 0 } = {}) {
    const out = new Float32Array(count(seconds));
    const at = typeof frequency === "function" ? frequency : () => frequency;
    const multiples = harmonics.map(([multiple]) => multiple);
    const levels = harmonics.map(([, level]) => level);
    const [ratio, depth] = fm ?? [0, 0];
    let angle = phase;
    let modulator = 0;

    for (let n = 0; n < out.length; n++) {
        const f = at(n / rate);
        const bend = depth ? depth * Math.sin(modulator) : 0;
        let value = 0;

        for (let k = 0; k < multiples.length; k++) {
            value += levels[k] * Math.sin(multiples[k] * angle + bend);
        }

        out[n] = value;
        angle += (TAU * f) / rate;
        modulator += (TAU * f * ratio) / rate;
    }

    return out;
}

/**
 * One cycle of a waveform, `size` samples long: the sum of harmonics, `level(k)` of the k-th,
 * up to `highest`.
 */
export function wavetable(level, highest, size = 2048) {
    const table = new Float32Array(size + 1);

    for (let k = 1; k <= highest; k++) {
        const amount = level(k);

        if (amount) {
            for (let n = 0; n <= size; n++) {
                table[n] += amount * Math.sin((TAU * k * n) / size);
            }
        }
    }

    return table;
}

/** Play a wavetable round and round at `frequency` Hz (or a function of time), `seconds` long. */
export function oscillate(table, seconds, frequency, phase = 0) {
    const out = new Float32Array(count(seconds));
    const at = typeof frequency === "function" ? frequency : () => frequency;
    const size = table.length - 1;
    let position = phase * size;

    for (let n = 0; n < out.length; n++) {
        const index = Math.floor(position);
        const share = position - index;

        out[n] = table[index] + (table[index + 1] - table[index]) * share;
        position += (at(n / rate) * size) / rate;

        if (position >= size) {
            position -= size * Math.floor(position / size);
        }
    }

    return out;
}

/**
 * A plucked string (Karplus-Strong) at `frequency` Hz, `seconds` long, losing `damping` a cycle;
 * `brightness` (Hz) is how bright the pluck is.
 */
export function pluck(random, frequency, seconds, damping = 0.996, brightness = 3000) {
    const out = new Float32Array(count(seconds));

    // The loop is the delay line, less half a sample for averaging each sample with the next
    // (newer) one, and an all-pass filter's fraction of one (kept between 0.1 and 1.1, where it's
    // steady), tuning it between samples
    const exact = rate / frequency + 0.5;
    let period = Math.max(2, Math.floor(exact));
    let fraction = exact - period;

    if (fraction < 0.1 && period > 2) {
        period -= 1;
        fraction += 1;
    }

    const coefficient = (1 - fraction) / (1 + fraction);
    const line = filter(noise(random, period / rate + 0.001), "lowpass", brightness).subarray(0, period);
    let before = 0;
    let after = 0;

    for (let n = 0; n < out.length; n++) {
        const k = n % period;
        const value = line[k];
        const averaged = damping * 0.5 * (value + line[(k + 1) % period]);
        const tuned = coefficient * averaged + before - coefficient * after;

        before = averaged;
        after = tuned;
        out[n] = value;
        line[k] = tuned;
    }

    return out;
}

/** Add `layer` into `mix` (which grows to fit) at `offset` seconds, times `gain`. */
export function add(mix, layer, gain = 1, offset = 0) {
    const start = Math.round(offset * rate);
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
 * Tidy a sound: no DC, a short fade at each end (no clicks), and `level` loud (by its loudest
 * 30 ms), as far as its loudest sample allows (`peak`).
 */
export function finish(samples, { level = 0.3, peak = 0.95, fadeIn = 0.004, fadeOut = 0.004 } = {}) {
    const out = filter(samples, "highpass", 25);
    const [start, end] = [count(fadeIn), count(fadeOut)];
    let loudest = 0;

    for (let n = 0; n < out.length; n++) {
        out[n] *= Math.min(1, n / start, (out.length - 1 - n) / end);
        loudest = Math.max(loudest, Math.abs(out[n]));
    }

    const current = loudness(out);
    const scale = current > 0 ? Math.min(peak / loudest, level / current) : 0;

    for (let n = 0; n < out.length; n++) {
        out[n] *= scale;
    }

    return out;
}
