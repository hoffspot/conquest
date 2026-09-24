// How people walk, from gait-lab measurements: the angles of the pelvis, hips, knees, ankles,
// shoulders and elbows through one stride of normal walking, as Fourier series fitted to
// published normal-adult averages (Winter's biomechanics data and the Plug-in Gait conventions:
// flexion, adduction and internal rotation positive; pelvic obliquity positive when that side is
// up, pelvic rotation positive when that side is forward). See docs/CHARACTERS.md.
//
// A stride runs from one heel strike to the next heel strike of the same foot: phase 0 to 1,
// with that foot on the ground ("stance") for the first 62% and swinging for the rest. Curves are
// for the left side; the right side is half a stride later.
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
    let angle = curve.mean;

    curve.harmonics.forEach(([a, b], i) => {
        const x = 2 * Math.PI * (i + 1) * phase;

        angle += a * Math.cos(x) + b * Math.sin(x);
    });

    return angle;
}

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

/** Which of PHASES a foot is in. */
export function phaseName(phase) {
    const p = ((phase % 1) + 1) % 1;

    return PHASES.findLast(({ from }) => p >= from).name;
}
