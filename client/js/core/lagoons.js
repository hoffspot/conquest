// The lizard folk's lagoons as they lie in the world: the band of water a settlement of theirs
// stands round (setpieces/town.js lays it out, square by square), its bed dug down below the
// town's ground, deeper the further it is from the banks, and its water a little below the banks,
// so the plank walks over it and the houses on stilts in it stand clear of the water. Worked out
// from the layout alone, the same whenever and wherever it's asked for. Nothing here uses Three.js.

/**
 * A lagoon: how far its water's surface is below the town's ground (metres), how deep its bed is
 * dug at most (metres below the town's ground), how steeply its banks go down to that (metres
 * down a metre out from the nearest dry square: never so steep they'd be drawn as a cliff, at its
 * corners either), and how far round its water (squares) its surface is taken to lie, so that it's
 * drawn level out under its banks.
 */
export const LAGOON = Object.freeze({ below: 0.25, deep: 1.1, bank: 0.5, reach: 3 });

/**
 * How far below the town's ground a lagoon's bed is at each corner of a layout's squares
 * (metres): a Float32Array of (width + 1) × (height + 1), row by row from the north-west corner,
 * `water` the layout's rows (1 for water). None at a corner of any square that isn't water (or of
 * the layout's edge); away from them, LAGOON.bank a metre further out from the nearest (as the
 * crow flies, near enough: by steps across and diagonally), no deeper than LAGOON.deep. Null if
 * there's no water.
 */
export function lagoonDepths(water) {
    if (!water?.length) {
        return null;
    }

    const [height, width] = [water.length, water[0].length];
    const across = width + 1;
    const far = new Float32Array(across * (height + 1)).fill(Infinity);
    const wet = (i, j) => i >= 0 && j >= 0 && i < width && j < height && water[j][i] === 1;

    // (A corner's on the bank if any of the four squares round it is dry)
    for (let j = 0; j <= height; j++) {
        for (let i = 0; i <= across - 1; i++) {
            if (!(wet(i - 1, j - 1) && wet(i, j - 1) && wet(i - 1, j) && wet(i, j))) {
                far[j * across + i] = 0;
            }
        }
    }

    // (Then out from the banks, forwards and back: a step across or down a metre, diagonally √2)
    const steps = [[-1, 0, 1], [0, -1, 1], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2]];
    const pass = (j, i, sign) => {
        const k = j * across + i;

        for (const [di, dj, cost] of steps) {
            const [ni, nj] = [i + di * sign, j + dj * sign];

            if (ni >= 0 && nj >= 0 && ni < across && nj <= height) {
                far[k] = Math.min(far[k], far[nj * across + ni] + cost);
            }
        }
    };

    for (let j = 0; j <= height; j++) {
        for (let i = 0; i < across; i++) {
            pass(j, i, 1);
        }
    }

    for (let j = height; j >= 0; j--) {
        for (let i = across - 1; i >= 0; i--) {
            pass(j, i, -1);
        }
    }

    return far.map((d) => Math.min(LAGOON.deep, d * LAGOON.bank));
}

/**
 * The squares of a layout within LAGOON.reach of its lagoon's water (a Uint8Array, width × height,
 * row by row: 1 for those), where its surface is the lagoon's; null if there's no water.
 */
export function lagoonReach(water) {
    if (!water?.length) {
        return null;
    }

    const [height, width] = [water.length, water[0].length];
    const near = new Uint8Array(width * height);
    const { reach } = LAGOON;

    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            if (water[j][i] !== 1) {
                continue;
            }

            for (let dj = -reach; dj <= reach; dj++) {
                for (let di = -reach; di <= reach; di++) {
                    const [ni, nj] = [i + di, j + dj];

                    if (ni >= 0 && nj >= 0 && ni < width && nj < height) {
                        near[nj * width + ni] = 1;
                    }
                }
            }
        }
    }

    return near;
}
