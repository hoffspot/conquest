// How people walk and run, from gait-lab measurements: the angles of the pelvis, hips, knees,
// ankles, shoulders and elbows through one stride of normal walking, as Fourier series fitted to
// published normal-adult averages (Winter's biomechanics data and the Plug-in Gait conventions:
// flexion, adduction and internal rotation positive; pelvic obliquity positive when that side is
// up, pelvic rotation positive when that side is forward), and through one stride of sprinting,
// as key angles from running studies (Novacheck's review of running biomechanics). See
// docs/CHARACTERS.md.
//
// A stride runs from one foot strike to the next strike of the same foot: phase 0 to 1. Walking,
// that foot is on the ground ("stance") for the first 62% and swinging for the rest; sprinting,
// for only the first quarter, with both feet off the ground between steps. Curves are for the
// left side; the right side is half a stride later.
//
// Pure maths, no Three.js: the walker (locomotion.js) turns these into poses.

/** Fraction of a stride each foot spends on the ground. */
export const STANCE = 0.62;

/**
 * The gait phases of one foot: loading response, mid-stance, terminal stance, pre-swing, swing
 * (Perry's gait phases), each starting at `from`.
 */
export const PHASES = Object.freeze([
    { name: "Loading response", from: 0 },
    { name: "Mid-stance", from: 0.12 },
    { name: "Terminal stance", from: 0.31 },
    { name: "Pre-swing", from: 0.5 },
    { name: "Swing", from: STANCE },
]);

/** The pelvis tips forward about this much, so hip flexion is this much more than the thigh's angle from vertical. */
export const PELVIC_TILT = 11.5;

/** Joint angles through a stride, in degrees: mean + sum of a cos(2 pi k p) + b sin(2 pi k p). */
export const CURVES = Object.freeze({
    hipFlexion: { label: "Hip flexion", mean: 20.33, harmonics: [[19.24, -5.16], [-3.14, -0.11], [-0.37, 2.08], [-0.18, -0.08]] },
    kneeFlexion: { label: "Knee flexion", mean: 26.18, harmonics: [[-4.73, -19.97], [-13.61, 9.09], [-0.73, 5.43], [-0.79, 1.06], [-0.13, 1.33], [0.43, 0.35]] },
    ankleDorsiflexion: { label: "Ankle dorsiflexion", mean: 3.34, harmonics: [[-1.58, 5.92], [0.67, -6.76], [-3.98, 1.18], [2.07, -0.51], [-0.76, -1.09], [0.75, 0.58]] },
    hipAdduction: { label: "Hip adduction", mean: -0.52, harmonics: [[0.1, 8.69], [-0.35, -0.67], [-2.15, 1.18]] },
    pelvicObliquity: { label: "Pelvic obliquity", mean: 0, harmonics: [[0.74, 4.89], [0, 0], [-1.88, 0.94]] },
    pelvicRotation: { label: "Pelvic rotation", mean: 0, harmonics: [[5.95, 1.66], [0, 0], [0.14, -0.48]] },
    shoulderFlexion: { label: "Shoulder flexion", mean: -9.69, harmonics: [[-14.52, -0.05], [0.13, -1.37]] },
    elbowFlexion: { label: "Elbow flexion", mean: 36.74, harmonics: [[-12.41, -1.63], [2.52, 0.23]] },
});

/** A curve's angle (degrees) at a phase (any number: whole strides wrap around). */
export function curveAt(curve, phase) {
    if (curve.keys) {
        return keyedAt(curve.keys, phase);
    }

    let angle = curve.mean;

    curve.harmonics.forEach(([a, b], i) => {
        const x = 2 * Math.PI * (i + 1) * phase;

        angle += a * Math.cos(x) + b * Math.sin(x);
    });

    return angle;
}

// A value on the smooth, looping curve through [phase, value] keys (Catmull-Rom, the last key
// leading back round to the first)
function keyedAt(keys, phase) {
    const p = ((phase % 1) + 1) % 1;
    const count = keys.length;
    let k = count - 1;

    while (k > 0 && keys[k][0] > p) {
        k--;
    }

    const key = (i) => {
        const [time, value] = keys[((i % count) + count) % count];

        return [time + Math.floor(i / count), value];
    };
    const [t0, v0] = key(k);
    const [t1, v1] = key(k + 1);
    const [tb, vb] = key(k - 1);
    const [ta, va] = key(k + 2);
    const m0 = ((v1 - vb) / (t1 - tb)) * (t1 - t0);
    const m1 = ((va - v0) / (ta - t0)) * (t1 - t0);
    const u = ((p < t0 ? p + 1 : p) - t0) / (t1 - t0);
    const u2 = u * u;
    const u3 = u2 * u;

    return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
}

/** Fraction of a sprinting stride each foot spends on the ground. */
export const RUN_STANCE = 0.24;

/**
 * Sprinting, through a stride: the thigh's angle from upright (forward positive), knee flexion,
 * ankle dorsiflexion, and the arms' swing (shoulder flexion) and elbow flexion, in degrees. The
 * foot lands under the knee (0), the leg folds under the load, extends to push off behind (0.24),
 * then the heel kicks up towards the buttock and the knee drives high (about 0.75) before
 * reaching forward to land again. The arms pump against the legs, elbows bent about a right angle.
 */
export const RUN_CURVES = Object.freeze({
    thigh: { label: "Thigh angle", keys: [[0, 34], [0.08, 16], [0.16, -8], [0.24, -26], [0.34, -20], [0.46, 8], [0.6, 42], [0.75, 60], [0.88, 48]] },
    kneeFlexion: { label: "Knee flexion", keys: [[0, 24], [0.09, 44], [0.24, 20], [0.34, 62], [0.46, 108], [0.58, 122], [0.72, 100], [0.84, 52], [0.93, 22]] },
    ankleDorsiflexion: { label: "Ankle dorsiflexion", keys: [[0, -6], [0.11, 16], [0.24, -26], [0.36, -18], [0.56, 4], [0.78, 10], [0.92, 2]] },
    shoulderFlexion: { label: "Shoulder flexion", keys: [[0, 2], [0.25, 50], [0.5, 4], [0.75, -40]] },
    elbowFlexion: { label: "Elbow flexion", keys: [[0, 88], [0.25, 108], [0.5, 90], [0.75, 70]] },
});

/** Walking speed people choose on their own, in metres a second (for a leg of `legLength`). */
export const NATURAL_SPEED = 1.35;

// Leg length (hip joint to the ground) of the average adult the walk ratio was measured on
const REFERENCE_LEG = 0.9;

// Walk ratio: step length (metres) over cadence (steps a minute), about constant for a person
// over normal walking speeds (Sekiya and Nagasaki), and in proportion to their size
const WALK_RATIO = 0.0065;

/** Steps a minute at a speed, for a leg of this length (metres). */
export function cadence(speed, legLength = REFERENCE_LEG) {
    return Math.sqrt((60 * speed) / (WALK_RATIO * (legLength / REFERENCE_LEG)));
}

/** Stride length (two steps) at a speed, in metres, for a leg of this length. */
export function strideLength(speed, legLength = REFERENCE_LEG) {
    return 2 * WALK_RATIO * (legLength / REFERENCE_LEG) * cadence(speed, legLength);
}

/**
 * How far to swing the joints at a speed: 1 at the natural speed the curves were measured at,
 * less when slower (0 standing still), a little more when faster.
 */
export function amplitude(speed, legLength = REFERENCE_LEG) {
    return strideLength(speed, legLength) / strideLength(NATURAL_SPEED, legLength);
}

/** The fastest walk before people break into a run (Froude number 0.5), in metres a second. */
export function walkToRunSpeed(legLength = REFERENCE_LEG) {
    return Math.sqrt(0.5 * 9.81 * legLength);
}

/**
 * Steps a second running at a speed: about 2.7 at a jog of 3 metres a second, rising to about 4
 * at a sprint of 8 (people run faster mostly by taking longer steps at first, then by taking them
 * more often), for a leg of this length.
 */
export function runCadence(speed, legLength = REFERENCE_LEG) {
    return Math.min(4.6, 2.7 + 0.25 * Math.max(0, speed - 3)) * Math.sqrt(REFERENCE_LEG / legLength);
}

/** Stride length (two steps) running at a speed, in metres, for a leg of this length. */
export function runStrideLength(speed, legLength = REFERENCE_LEG) {
    return (2 * speed) / runCadence(speed, legLength);
}

/** Which of PHASES a foot is in. */
export function phaseName(phase) {
    const p = ((phase % 1) + 1) % 1;

    return PHASES.findLast(({ from }) => p >= from).name;
}
