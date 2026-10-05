// Where things are on the head: the hairline, the beard, measured from the eyes.
//
// Face coordinates are metres from the point between the eyes: x to the character's left, y up,
// z forward. On MakeHuman's base mesh the nose tip is at y -0.038, the mouth at -0.068, the chin
// at -0.11, the ears at x 0.088 and z -0.087, the top of the head at y 0.121 and the back of the
// head at z -0.164. Heads of other shapes are scaled to match.

import { lerpTable, smoothstep } from "./noise.js";

// The hairline's height, by the angle round the head from straight ahead (degrees)
const HAIRLINE = [[0, 0.072], [25, 0.068], [45, 0.052], [62, 0.04], [74, 0.005], [80, -0.02], [92, 0.0], [115, -0.045], [150, -0.07], [180, -0.078]];

// The top of the beard, by the distance to the side from the middle of the face
const BEARD_LINE = [[0, -0.049], [0.016, -0.05], [0.03, -0.046], [0.045, -0.038], [0.058, -0.026], [0.07, -0.006], [0.082, -0.01]];

/** The base mesh's eye separation (between the eyes' centres), for scaling other heads. */
const BASE_EYE_SEPARATION = 0.0616;

/** The depth of the head's middle, behind the eyes (where the hairline's angle is measured from). */
export const HEAD_CENTRE_Z = -0.068;

/** Where the ear is (the left one; mirror x for the right). */
export const EAR = [0.085, 0, -0.087];

/**
 * A body's face frame from its vertex positions: { middle (between the eyes), eyeX (half the eye
 * separation), scale (to the base mesh) }. `toFace(point)` gives face coordinates.
 *
 * A body whose head isn't proportioned as MakeHuman's (Vitruvian's: its eyes wider apart, its
 * mouth lower) has a map in its manifest's landmarks.face (scripts/build-vitruvian.js faceMap):
 * its head's size over its eyes' spacing, to MakeHuman's (the scale is multiplied by it), and
 * where its chin, lips, nose and crown, and the back of its skull, are in MakeHuman's face
 * coordinates (heights and depths brought onto MakeHuman's piece by piece, straight between them).
 */
export function faceFrame(human, positions) {
    const eyes = [[0, 0, 0, 0], [0, 0, 0, 0]];

    for (const r of human.renderIndices("eyes")) {
        const v = human.renderSource[r];
        const side = positions[v * 3] > 0 ? 0 : 1;

        for (let k = 0; k < 3; k++) {
            eyes[side][k] += positions[v * 3 + k];
        }

        eyes[side][3]++;
    }

    const [left, right] = eyes.map(([x, y, z, n]) => [x / n, y / n, z / n]);
    const middle = [0, 1, 2].map((k) => (left[k] + right[k]) / 2);
    const eyeX = Math.abs(left[0] - right[0]) / 2;
    const map = human.landmarks?.face;
    const scale = ((2 * eyeX) / BASE_EYE_SEPARATION) * (map?.size ?? 1);
    const [up, down] = map ? [(y) => along(map.y, y, 0, 1), (y) => along(map.y, y, 1, 0)] : [(y) => y, (y) => y];
    const [ahead, back] = map ? [(z) => along(map.z, z, 0, 1), (z) => along(map.z, z, 1, 0)] : [(z) => z, (z) => z];

    return {
        middle,
        eyeX,
        scale,
        eyes: [left, right],
        /** A point in face coordinates, scaled to the base mesh's head. */
        toFace: (x, y, z) => [(x - middle[0]) / scale, up((y - middle[1]) / scale), ahead((z - middle[2]) / scale)],
        /** Face coordinates (of the base mesh's head) back to a point. */
        fromFace: (x, y, z) => [middle[0] + x * scale, middle[1] + down(y) * scale, middle[2] + back(z) * scale],
    };
}

// A value through a piecewise-straight map (`knots`: rising [from, to] pairs, read from column
// `from` to column `to`), carried on straight past its ends
function along(knots, value, from, to) {
    const last = knots.length - 1;
    let k = 1;

    while (k < last && value > knots[k][from]) {
        k++;
    }

    const [a, b] = [knots[k - 1], knots[k]];

    return a[to] + ((value - a[from]) * (b[to] - a[to])) / (b[from] - a[from]);
}

/** How far above the hairline a point is (face coordinates), in metres: positive on the scalp. */
export function aboveHairline(x, y, z, raise = 0) {
    const angle = Math.abs(Math.atan2(x, z - HEAD_CENTRE_Z)) * (180 / Math.PI);

    return y - (lerpTable(HAIRLINE, angle) + raise);
}

/** How much a point (face coordinates) is in the beard, 0 to 1 (not allowing for the lips). */
export function beardAmount(x, y, z) {
    const top = lerpTable(BEARD_LINE, Math.abs(x));

    return smoothstep(top + 0.006, top - 0.006, y) * smoothstep(-0.16, -0.13, y) * smoothstep(-0.1, -0.06, z);
}

/** How near a point (face coordinates) is to an ear, 0 far to 1 at its middle. */
export function nearEar(x, y, z) {
    return Math.exp(-((Math.abs(x) - EAR[0]) ** 2 + (y - EAR[1]) ** 2 * 0.6 + (z - EAR[2]) ** 2) / 0.03 ** 2);
}
