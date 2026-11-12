// Who's near a point, looked for among those near it only (generated/multiplayer_scaling_plan.md
// Stage 1): points kept by cell, so that a pass of the rules measuring the world against its
// players (core/host.js: is any player within so far of this town, this building, this beast?)
// measures each thing against the players in the cells round it, not against every player.
//
// It only ever leaves out those too far off to matter: whoever asks gives the test it always
// made, a point at a time, and that test is made of every point that might pass it. So an answer
// is the answer going through everyone gave, to the bit, and the world's copies agree whichever
// way it's asked (`Culling.on` off goes through everyone: the tests' check). Two rules keep it
// so. The test must be one no point further than `reach` metres off, either way, can pass (a
// distance less than some reach, say); and it must only answer, changing nothing, since it's made
// of fewer points, and of those in a cell's order.

/**
 * Whether those near are looked for by cell, as they always are, or by going through everyone:
 * only for the tests that check it makes no difference (core/host.js Host.culling).
 */
export const Culling = { on: true };

// A little further than asked (metres): no rounding of a distance leaves out one that passes
const MARGIN = 1;

const cellKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

export class Near {
    /**
     * @param {Array} points - What's looked among, in its own order ([[x, y]], metres; or
     *     anything, with `at`).
     * @param {number} cell - A cell's side (metres): about as far as is asked for, so that an
     *     asking looks in a few cells.
     * @param {function} [at] - A point's place ([x, y]), if it isn't one itself.
     */
    constructor(points, cell, at = (point) => point) {
        this.points = points;
        this.cell = cell;
        this.cells = new Map();

        for (let k = 0; k < points.length; k++) {
            const [x, y] = at(points[k]);
            const key = cellKey(Math.floor(x / cell), Math.floor(y / cell));
            const list = this.cells.get(key);

            if (list) {
                list.push(k);
            } else {
                this.cells.set(key, [k]);
            }
        }
    }

    /**
     * Whether any point passes `test(point, index)`: made of every point within `reach` metres of
     * (x, y) either way, at the least (of everyone, with Culling off), so `test` must fail any
     * point further off than that, and change nothing.
     */
    some(x, y, reach, test) {
        const { points, cell, cells } = this;

        if (!Culling.on || !(reach < Infinity)) {
            for (let k = 0; k < points.length; k++) {
                if (test(points[k], k)) {
                    return true;
                }
            }

            return false;
        }

        const out = reach + MARGIN;
        const x0 = Math.floor((x - out) / cell);
        const y0 = Math.floor((y - out) / cell);
        const x1 = Math.floor((x + out) / cell);
        const y1 = Math.floor((y + out) / cell);

        // (More cells to look in than there are points: through everyone, the same answer)
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > points.length) {
            for (let k = 0; k < points.length; k++) {
                if (test(points[k], k)) {
                    return true;
                }
            }

            return false;
        }

        for (let cy = y0; cy <= y1; cy++) {
            for (let cx = x0; cx <= x1; cx++) {
                const list = cells.get(cellKey(cx, cy));

                for (let i = 0; list && i < list.length; i++) {
                    if (test(points[list[i]], list[i])) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * The places in `points` of those that might be within `reach` metres of (x, y) either way
     * (everyone's, with Culling off), in `points`' order: whoever asks makes its own test of each,
     * and whatever it does to those that pass is done in the order it always was.
     */
    within(x, y, reach) {
        const { points, cell, cells } = this;
        const found = [];

        if (!Culling.on || !(reach < Infinity)) {
            for (let k = 0; k < points.length; k++) {
                found.push(k);
            }

            return found;
        }

        const out = reach + MARGIN;
        const x1 = Math.floor((x + out) / cell);
        const y1 = Math.floor((y + out) / cell);

        for (let cy = Math.floor((y - out) / cell); cy <= y1; cy++) {
            for (let cx = Math.floor((x - out) / cell); cx <= x1; cx++) {
                const list = cells.get(cellKey(cx, cy));

                for (let i = 0; list && i < list.length; i++) {
                    found.push(list[i]);
                }
            }
        }

        return found.sort((a, b) => a - b);
    }
}
