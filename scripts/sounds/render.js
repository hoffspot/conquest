// Making a recorded sound from its recipe (scripts/build-sounds.js): cuts of recordings, each
// shaped and placed, summed into one, and levelled. Each step is as the sounds were first made
// and auditioned, so what's made here is what was listened to:
//
// 1. Each recording mono (its channels' mean, or the one `channel` asked for), at 48 kHz, its
//    mean taken away and its rumble under `highpass` Hz (40 unless said) too, over the whole of
//    it, both ways (dsp.js withoutRumble).
// 2. Each layer cut from it (`cut`: from and to, in samples at 48 kHz); filtered both ways by
//    `hp` and `lp` (Hz: 2nd-order Butterworths, run over the cut and 50 ms either side of it);
//    played backwards (`reverse`); sped up or slowed down, pitch and all (`rate`); swelled or
//    faded (`ramp`: from and to dB, the curve's power); faded in and out (`fadeIn`, `fadeOut`:
//    ms, raised cosines); made `gain` dB louder; and placed `at` seconds in. Or, played as a tape
//    is (`after`), sped up or slowed first and filtered after, the cut alone, by Butterworths of
//    `order` (as the creatures' were made).
// 3. The layers summed; `trim` seconds taken off the front, cut to `cap` seconds; faded in
//    (`fadeIn`: 2 ms unless said, 0 for a sound of one layer already faded) and out (`fadeOut`);
//    and made `level` dBFS loud by its loudest 30 ms (−20 unless said), less if its peak would
//    pass −1 dBFS (or the recipe's own `ceiling`, its peak then just that); or, `level` null, left
//    as its layers' gains make it.

import { butter, fade, limitDenominator, peak, RATE, resamplePoly, rms30, sosfiltfilt, withoutRumble } from "./dsp.js";

const PAD = 0.05;
const CEILING = -1;

/** The loudness sounds are made to by default (dBFS, by their loudest 30 ms). */
export const LEVEL = -20;

const ms = (value) => Math.round((value * RATE) / 1000);

/**
 * A recording's samples ({ channels, rate }) mono at 48 kHz, its rumble taken away (under
 * `highpass` Hz; or under each of a list in turn, a hum's taken away too).
 */
export function prepare({ channels, rate }, { channel = null, highpass = 40 } = {}) {
    const length = channels[0].length;
    const mono = new Float64Array(length);

    for (let n = 0; n < length; n++) {
        if (channel === null) {
            let sum = 0;

            for (const samples of channels) {
                sum += samples[n];
            }

            mono[n] = sum / channels.length;
        } else {
            mono[n] = channels[channel][n];
        }
    }

    const [first, ...more] = [highpass].flat();
    let y = withoutRumble(rate === RATE ? mono : resamplePoly(mono, ...limitDenominator(RATE / rate, 2000)), first);

    for (const frequency of more) {
        y = sosfiltfilt(butter(4, frequency, "highpass"), y);
    }

    return y;
}

// One layer, shaped
function layer(samples, { cut: [from, to], hp = null, lp = null, order = 2, after = false, reverse = false, rate = 1, ramp = null, fadeIn = 2, fadeOut = 15, gain = 0 }) {
    to = Math.min(to, samples.length);

    let y;

    if (after) {
        // (Played as a tape: sped up or slowed first, its rate as a fraction of small numbers;
        // then filtered, the cut alone)
        y = samples.slice(from, to);

        if (rate !== 1) {
            const [num, den] = limitDenominator(rate, 200);

            y = resamplePoly(y, den, num);
        }

        for (const [kind, frequency] of [
            ["highpass", hp],
            ["lowpass", lp],
        ]) {
            if (frequency) {
                y = sosfiltfilt(butter(order, frequency, kind), y);
            }
        }
    } else if (hp || lp) {
        const [start, end] = [Math.max(0, from - PAD * RATE), Math.min(samples.length, to + PAD * RATE)];
        let around = samples.slice(start, end);

        for (const [kind, frequency] of [
            ["highpass", hp],
            ["lowpass", lp],
        ]) {
            if (frequency) {
                around = sosfiltfilt(butter(order, frequency, kind), around);
            }
        }

        y = around.slice(from - start, from - start + (to - from));
    } else {
        y = samples.slice(from, to);
    }

    if (reverse) {
        y.reverse();
    }

    if (rate !== 1 && !after) {
        y = resamplePoly(y, ...limitDenominator(1 / rate, 1000));
    }

    if (ramp) {
        const [start, end, shape] = ramp;

        for (let n = 0; n < y.length; n++) {
            y[n] *= 10 ** ((start + (end - start) * (n / Math.max(1, y.length - 1)) ** shape) / 20);
        }
    }

    fade(y, ms(fadeIn), ms(fadeOut));

    return y.map((value) => value * 10 ** (gain / 20));
}

/**
 * A sound made from its recipe ({ layers, trim, cap, fadeIn, fadeOut, level, ceiling }), each
 * layer's recording from `recording(layer)` (prepared), as numbers from -1 to 1 at 48 kHz.
 */
export function render({ layers, trim = 0, cap = null, fadeIn = 2, fadeOut = 15, level = LEVEL, ceiling = null }, recording) {
    const parts = layers.map((spec) => [Math.round((spec.at ?? 0) * RATE), layer(recording(spec), spec)]);
    const length = Math.max(...parts.map(([at, y]) => at + y.length));
    let mix = new Float64Array(length);

    for (const [at, y] of parts) {
        for (let n = 0; n < y.length; n++) {
            mix[at + n] += y[n];
        }
    }

    mix = mix.slice(Math.round(trim * RATE));

    if (cap) {
        mix = mix.slice(0, Math.round(cap * RATE));
    }

    fade(mix, 0, ms(fadeOut));

    // (Faded in whatever its length)
    for (let k = 0; k < ms(fadeIn); k++) {
        mix[k] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / ms(fadeIn));
    }

    // (Its layers' gains as they are, if it's not to be levelled: `level` null)
    let gain = level === null ? 0 : level - rms30(mix);

    if (level !== null && peak(mix) + gain > (ceiling ?? CEILING)) {
        gain = (ceiling ?? CEILING - 0.02) - peak(mix);
    }

    return mix.map((value) => value * 10 ** (gain / 20));
}
