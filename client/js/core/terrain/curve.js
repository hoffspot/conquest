// How high the land stands in metres, from the world plan's height (0 to 1): a smooth curve through
// a few points, flat across the plains and the low hills, steepening into the mountains and up to
// the peaks. The curve rises all the way (a monotone cubic through the points: Fritsch and
// Carlson's), so land that's higher in the plan is higher on the ground, and water still runs the
// way the plan has it.

import { MOUNTAIN, PEAK, SEA_LEVEL } from "../worldplan/terrain.js";

// [plan height, metres]: the sea floor, the coast, the plains (a rise of 1 to 3 in 100), the
// hills, the mountains and the peaks
const POINTS = [
    [0, -30],
    [SEA_LEVEL, 0],
    [0.3, 8],
    [0.45, 25],
    [0.6, 50],
    [MOUNTAIN, 95],
    [PEAK, 220],
    [1, 320],
];

// Each point's slope along the curve, eased where the curve would overshoot (Fritsch–Carlson)
const SLOPES = (() => {
    const count = POINTS.length;
    const secants = [];

    for (let k = 0; k < count - 1; k++) {
        secants.push((POINTS[k + 1][1] - POINTS[k][1]) / (POINTS[k + 1][0] - POINTS[k][0]));
    }

    const slopes = [secants[0]];

    for (let k = 1; k < count - 1; k++) {
        slopes.push(secants[k - 1] * secants[k] <= 0 ? 0 : (secants[k - 1] + secants[k]) / 2);
    }

    slopes.push(secants[count - 2]);

    for (let k = 0; k < count - 1; k++) {
        const a = slopes[k] / secants[k];
        const b = slopes[k + 1] / secants[k];
        const sum = a * a + b * b;

        if (sum > 9) {
            const scale = 3 / Math.sqrt(sum);

            slopes[k] = scale * a * secants[k];
            slopes[k + 1] = scale * b * secants[k];
        }
    }

    return slopes;
})();

/** The land's height in metres (0 at the sea), from the plan's height. */
export function metresOf(planHeight) {
    const h = Math.min(1, Math.max(0, planHeight));
    let k = 0;

    while (k < POINTS.length - 2 && h > POINTS[k + 1][0]) {
        k++;
    }

    const [[x0, y0], [x1, y1]] = [POINTS[k], POINTS[k + 1]];
    const span = x1 - x0;
    const t = (h - x0) / span;
    const t2 = t * t;
    const t3 = t2 * t;

    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * span * SLOPES[k] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * span * SLOPES[k + 1];
}
