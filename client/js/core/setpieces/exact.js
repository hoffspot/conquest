// Sines, cosines, arctangents and square roots worked out with nothing but + - * /, which every
// browser does the same way to the last digit (Math.sin and the like needn't), so that a layout
// made from a seed is the same wherever it's made.

const PI = 3.141592653589793;
const HALF_PI = PI / 2;
const TAU = 2 * PI;

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

/** How long a vector is. */
export const length = (x, y) => sqrt(x * x + y * y);

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
