// The sums the recorded sounds are made with (scripts/build-sounds.js): filters, resampling,
// fades and levels, done the way the sounds were first made and auditioned (in Python, with
// SciPy), so a sound made here is the one that was listened to. Each matches SciPy's function of
// the same name to rounding:
//
// - butter: a Butterworth filter as second-order sections (scipy.signal.butter(output="sos")),
//   each section by the bilinear transform with the frequency prewarped, as SciPy's are.
// - sosfiltfilt: run forwards and backwards (no shift in time), the ends extended by an odd
//   reflection and the filter started where a steady signal would leave it (scipy.signal's).
// - resamplePoly: resampled by a ratio of whole numbers through a Kaiser-windowed sinc
//   (scipy.signal.resample_poly with its defaults).
// - limitDenominator: the nearest fraction with a denominator no bigger than asked (Python's
//   Fraction(x).limit_denominator).

/** The rate everything's made at (Hz). */
export const RATE = 48000;

/**
 * A Butterworth filter of `order` (even) at `frequency` Hz, "highpass" or "lowpass", as
 * second-order sections [b0, b1, b2, a1, a2] (a0 1).
 */
export function butter(order, frequency, kind, rate = RATE) {
    const w = (2 * Math.PI * frequency) / rate;
    const cos = Math.cos(w);
    const sections = [];

    for (let k = 1; k <= order / 2; k++) {
        const q = 1 / (2 * Math.cos(((2 * k - 1) * Math.PI) / (2 * order)));
        const alpha = Math.sin(w) / (2 * q);
        const a0 = 1 + alpha;
        const [b0, b1] = kind === "highpass" ? [(1 + cos) / 2, -(1 + cos)] : [(1 - cos) / 2, 1 - cos];

        sections.push([b0 / a0, b1 / a0, b0 / a0, (-2 * cos) / a0, (1 - alpha) / a0]);
    }

    return sections;
}

// Where each section's state stands for a steady input of 1 (scipy.signal.sosfilt_zi)
function steadyStates(sections) {
    let scale = 1;

    return sections.map(([b0, b1, b2, a1, a2]) => {
        const [u, v] = [b1 - a1 * b0, b2 - a2 * b0];
        const z0 = (u + v) / (1 + a1 + a2);
        const state = [scale * z0, scale * (v - a2 * z0)];

        scale *= (b0 + b1 + b2) / (1 + a1 + a2);

        return state;
    });
}

// The sections run over `x` in place (transposed direct form II), starting from `states`
function sosfilt(sections, x, states) {
    for (const [s, [b0, b1, b2, a1, a2]] of sections.entries()) {
        let [z0, z1] = states[s];

        for (let n = 0; n < x.length; n++) {
            const input = x[n];
            const y = b0 * input + z0;

            z0 = b1 * input - a1 * y + z1;
            z1 = b2 * input - a2 * y;
            x[n] = y;
        }
    }
}

/** `x` filtered forwards and backwards by `sections`, as scipy.signal.sosfiltfilt. */
export function sosfiltfilt(sections, x) {
    const edge = 3 * (2 * sections.length + 1);

    if (x.length <= edge) {
        throw new Error(`${x.length} samples: too short to filter both ways`);
    }

    const zi = steadyStates(sections);
    const extended = new Float64Array(x.length + 2 * edge);

    for (let n = 0; n < edge; n++) {
        extended[n] = 2 * x[0] - x[edge - n];
        extended[edge + x.length + n] = 2 * x[x.length - 1] - x[x.length - 2 - n];
    }

    extended.set(x, edge);

    const first = extended[0];

    sosfilt(sections, extended, zi.map(([z0, z1]) => [z0 * first, z1 * first]));
    extended.reverse();

    const last = extended[0];

    sosfilt(sections, extended, zi.map(([z0, z1]) => [z0 * last, z1 * last]));
    extended.reverse();

    return extended.slice(edge, edge + x.length);
}

/** `x` less its mean, its rumble under `frequency` Hz taken away (4th-order, both ways). */
export function withoutRumble(x, frequency = 40) {
    let sum = 0;

    for (const value of x) {
        sum += value;
    }

    const mean = sum / x.length;
    const centred = Float64Array.from(x, (value) => value - mean);

    return centred.length < 64 ? centred : sosfiltfilt(butter(4, frequency, "highpass"), centred);
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// The modified Bessel function of the first kind, order 0 (for the Kaiser window)
function bessel0(x) {
    let sum = 1;
    let term = 1;

    for (let k = 1; k < 200; k++) {
        term *= (x / (2 * k)) ** 2;
        sum += term;

        if (term < sum * 1e-17) {
            break;
        }
    }

    return sum;
}

// A low-pass FIR filter of `taps` taps cutting off at `cutoff` (a share of the Nyquist rate),
// Kaiser-windowed (beta 5) and scaled to pass DC whole: scipy.signal.firwin's
function firwin(taps, cutoff, beta = 5) {
    const alpha = (taps - 1) / 2;
    const h = new Float64Array(taps);
    let sum = 0;

    for (let n = 0; n < taps; n++) {
        const m = n - alpha;
        const x = cutoff * m;
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const ratio = (2 * n) / (taps - 1) - 1;

        h[n] = cutoff * sinc * (bessel0(beta * Math.sqrt(Math.max(0, 1 - ratio * ratio))) / bessel0(beta));
        sum += h[n];
    }

    return h.map((value) => value / sum);
}

/** `x` resampled by up / down, as scipy.signal.resample_poly with its Kaiser window. */
export function resamplePoly(x, up, down) {
    const g = gcd(up, down);

    [up, down] = [up / g, down / g];

    if (up === 1 && down === 1) {
        return Float64Array.from(x);
    }

    const outLength = Math.floor((x.length * up) / down) + ((x.length * up) % down ? 1 : 0);
    const most = Math.max(up, down);
    const half = 10 * most;
    const prePad = down - (half % down);
    const preRemove = Math.floor((half + prePad) / down);
    const h = new Float64Array(prePad + 2 * half + 1);

    h.set(
        firwin(2 * half + 1, 1 / most).map((value) => value * up),
        prePad,
    );

    const out = new Float64Array(outLength);

    for (let m = 0; m < outLength; m++) {
        // (The upsampled signal convolved with h, at every down-th sample)
        const j = (m + preRemove) * down;
        const first = Math.max(0, Math.ceil((j - h.length + 1) / up));
        const last = Math.min(x.length - 1, Math.floor(j / up));
        let sum = 0;

        for (let i = first; i <= last; i++) {
            sum += x[i] * h[j - i * up];
        }

        out[m] = sum;
    }

    return out;
}

/** The fraction nearest `value` with a denominator no bigger than `most`: [numerator, denominator]. */
export function limitDenominator(value, most) {
    // (The double exactly, as a fraction of big integers)
    const view = new DataView(new ArrayBuffer(8));

    view.setFloat64(0, value);

    const bits = view.getBigUint64(0);
    const exponent = Number((bits >> 52n) & 0x7ffn);
    let mantissa = bits & ((1n << 52n) - 1n);

    mantissa = exponent ? mantissa | (1n << 52n) : mantissa;

    const shift = (exponent || 1) - 1075;
    let [n, d] = shift >= 0 ? [mantissa << BigInt(shift), 1n] : [mantissa, 1n << BigInt(-shift)];
    const divisor = gcd(n, d);

    [n, d] = [n / divisor, d / divisor];

    const limit = BigInt(most);

    if (d <= limit) {
        return [Number(n), Number(d)];
    }

    const whole = d;
    let [p0, q0, p1, q1] = [0n, 1n, 1n, 0n];

    for (;;) {
        const a = n / d;
        const q2 = q0 + a * q1;

        if (q2 > limit) {
            break;
        }

        [p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2];
        [n, d] = [d, n - a * d];
    }

    const k = (limit - q0) / q1;

    return 2n * d * (q0 + k * q1) <= whole ? [Number(p1), Number(q1)] : [Number(p0 + k * p1), Number(q0 + k * q1)];
}

/** A raised-cosine fade in over the first `n` samples of `x`, and out over the last `m`, in place. */
export function fade(x, n, m) {
    if (n > 0 && x.length > n) {
        for (let k = 0; k < n; k++) {
            x[k] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / n);
        }
    }

    if (m > 0 && x.length > m) {
        for (let k = 1; k <= m; k++) {
            x[x.length - m - 1 + k] *= 0.5 + 0.5 * Math.cos((Math.PI * k) / m);
        }
    }

    return x;
}

/** The RMS of the loudest 30 ms of `x` (a window sliding a sample at a time), in dBFS. */
export function rms30(x, rate = RATE) {
    const width = Math.round(rate * 0.03);
    const db = (value) => 20 * Math.log10(Math.max(Math.abs(value), 1e-12));

    if (x.length <= width) {
        let sum = 0;

        for (const value of x) {
            sum += value * value;
        }

        return db(Math.sqrt(sum / x.length));
    }

    // (Running sums, as cumulative sums are taken)
    const sums = new Float64Array(x.length + 1);

    for (let n = 0; n < x.length; n++) {
        sums[n + 1] = sums[n] + x[n] * x[n];
    }

    let most = 0;

    for (let n = width; n <= x.length; n++) {
        most = Math.max(most, (sums[n] - sums[n - width]) / width);
    }

    return db(Math.sqrt(most));
}

/** The loudest sample of `x`, in dBFS. */
export function peak(x) {
    let most = 0;

    for (const value of x) {
        most = Math.max(most, Math.abs(value));
    }

    return 20 * Math.log10(Math.max(most, 1e-12));
}
