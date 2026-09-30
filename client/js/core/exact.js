// Sines, cosines, arctangents, logarithms, powers and square roots worked out with nothing but
// + - * /, which every browser does the same way to the last digit, so that what the rules make
// is the same wherever it's made: a world laid out from a seed, and a world played on in two
// browsers at once (docs/WAR.md M11). JavaScript leaves how near Math.sin, Math.atan2, Math.pow,
// Math.hypot and the like come to the truth to each browser, and they needn't agree in the last
// digit (V8's own Math.hypot differs from √(x² + y²) there for about 2 in 5 of all pairs).
//
// Lengths (`hypot`) are worked out as Chrome's Math.hypot works them out (V8's, step for step), so
// worlds made in Chrome are made the same as ever, now in every browser; with Math.sqrt, which
// every browser has the processor work out, and IEEE 754 has give the nearest number to the truth.
// (The town layout keeps its own square root, `sqrt`, and `length` with it, as its towns were made
// with them.)

const PI = 3.141592653589793;
const HALF_PI = PI / 2;
const TAU = 2 * PI;
const LN2 = 0.6931471805599453;
const SQRT2 = 1.4142135623730951;

/** The sine of an angle (radians), to within about 1e-12. */
export function sin(angle) {
    // Into -π to π, then -π/2 to π/2 (sin(π - a) = sin(a))
    let a = angle - TAU * Math.floor((angle + PI) / TAU);

    if (a > HALF_PI) {
        a = PI - a;
    } else if (a < -HALF_PI) {
        a = -PI - a;
    }

    const a2 = a * a;

    return a * (1 - (a2 / 6) * (1 - (a2 / 20) * (1 - (a2 / 42) * (1 - (a2 / 72) * (1 - (a2 / 110) * (1 - (a2 / 156) * (1 - a2 / 210)))))));
}

/** The cosine of an angle (radians). */
export const cos = (angle) => sin(angle + HALF_PI);

/** The square root of a number (0 for none), to the last digit. */
export function sqrt(value) {
    if (!(value > 0)) {
        return 0;
    }

    // A first guess within a factor of two (halving or doubling), then Newton's method until it
    // settles
    let guess = 1;

    while (guess * guess > value) {
        guess /= 2;
    }

    while (guess * guess * 4 < value) {
        guess *= 2;
    }

    for (let step = 0; step < 60; step++) {
        const next = (guess + value / guess) / 2;

        if (next === guess) {
            break;
        }

        guess = next;
    }

    return guess;
}

/** How long a vector is (the town layout's: with `sqrt`). */
export const length = (x, y) => sqrt(x * x + y * y);

/**
 * How long a vector is, as the rules measure it: as V8 works out Math.hypot (src/builtins/math.tq:
 * each over the larger, their squares summed, the root of it times the larger), to the last digit,
 * but the same in every browser.
 */
export function hypot(x, y) {
    const a = Math.abs(x);
    const b = Math.abs(y);
    const most = a > b || b !== b ? a : b;

    if (most === Infinity) {
        return Infinity;
    }

    if (a !== a || b !== b) {
        return NaN;
    }

    if (most === 0) {
        return 0;
    }

    const [p, q] = [a / most, b / most];

    return Math.sqrt(p * p + q * q) * most;
}

/** The natural logarithm of a positive number, to within about 1e-15 of it (-Infinity for none). */
export function log(value) {
    if (!(value > 0)) {
        return value === 0 ? -Infinity : NaN;
    }

    // Into 1/√2 to √2 by halving or doubling (counted: each a ln 2), then a series in
    // z = (m - 1) / (m + 1), under 0.18: ln m = 2 (z + z³/3 + z⁵/5 + ...)
    let m = value;
    let twos = 0;

    while (m > SQRT2) {
        m /= 2;
        twos++;
    }

    while (m < SQRT2 / 2) {
        m *= 2;
        twos--;
    }

    const z = (m - 1) / (m + 1);
    const z2 = z * z;
    let term = z;
    let total = 0;

    for (let k = 0; k < 14; k++) {
        total += term / (2 * k + 1);
        term *= z2;
    }

    return twos * LN2 + 2 * total;
}

/** e to a power, to within about 1e-15 of it. */
export function exp(power) {
    // e^p = 2^k e^r, with r under half a ln 2 either way: a series
    const k = Math.round(power / LN2);
    const r = power - k * LN2;
    let term = 1;
    let total = 1;

    for (let n = 1; n < 18; n++) {
        term *= r / n;
        total += term;
    }

    const two = k > 0 ? 2 : 0.5;

    for (let n = Math.abs(k); n > 0; n--) {
        total *= two;
    }

    return total;
}

/** A number (not below 0) to a power, as Math.pow gives it, to within about 1e-14 of it. */
export function pow(value, power) {
    if (value === 0) {
        return power > 0 ? 0 : power === 0 ? 1 : Infinity;
    }

    return exp(power * log(value));
}

// The arctangent of a number from -1 to 1: halved twice (atan z = 2 atan(z / (1 + √(1 + z²))))
// to under 0.2, then a series
function atanSmall(z) {
    const once = z / (1 + sqrt(1 + z * z));
    const twice = once / (1 + sqrt(1 + once * once));
    const t2 = twice * twice;
    let term = twice;
    let total = 0;

    for (let k = 0; k < 12; k++) {
        total += term / (2 * k + 1);
        term *= -t2;
    }

    return 4 * total;
}

/** The angle of a vector (y, x) from the x axis, as Math.atan2 gives it (radians, -π to π). */
export function atan2(y, x) {
    if (x === 0 && y === 0) {
        return 0;
    }

    if (Math.abs(x) >= Math.abs(y)) {
        const a = atanSmall(y / x);

        return x > 0 ? a : y >= 0 ? a + PI : a - PI;
    }

    const a = atanSmall(x / y);

    return y > 0 ? HALF_PI - a : -HALF_PI - a;
}

export { PI, TAU };
