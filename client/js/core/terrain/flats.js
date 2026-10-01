// Level ground near a point, for what must stand on it: a camp is pitched on the flattest ground
// within reach of where the plan puts it, not wherever the middle of its cell falls (a mountain's
// side, as often as not, where its pad would stand tens of metres out of the land or into it).
//
// Only the land's own height is looked at (height.js heightAt, worked out from the plan), never
// the ground as it's levelled, so a spot's the same whenever it's asked for, in every browser.

import { heightAt, waterAt } from "./height.js";

/**
 * Flats: the lattice spots are tried on (metres apart), how far from the point they may be
 * (metres), and how far round each the land's looked at (lattice steps each way).
 */
export const FLATS = Object.freeze({ step: 8, reach: 96, spread: 2 });

/**
 * The flattest spot within `reach` of `at` ([x, y], metres): of the points of a lattice FLATS.step
 * apart through it, the one where the land's height varies least (highest less lowest) over the
 * lattice's points FLATS.spread steps round it, with none of the nearest eight under water, and
 * not one `avoid` ((x, y) => boolean) keeps off; of those as flat, the nearest `at` (then the
 * first, north to south, west to east). `at` itself if there's none.
 */
export function flatSpot(plan, at, { reach = FLATS.reach, avoid = null, size } = {}) {
    const { step, spread } = FLATS;
    const n = Math.floor(reach / step);
    const span = n + spread;
    const side = span * 2 + 1;
    const heights = new Float64Array(side * side).fill(NaN);
    const wet = new Int8Array(side * side).fill(-1);
    const point = (i, j) => [at[0] + i * step, at[1] + j * step];
    const outside = ([x, y]) => x < 0 || y < 0 || x >= size || y >= size;
    const height = (i, j) => {
        const k = (j + span) * side + (i + span);

        if (Number.isNaN(heights[k])) {
            const [x, y] = point(i, j);

            heights[k] = outside([x, y]) ? NaN : heightAt(plan, x, y);
        }

        return heights[k];
    };
    const watery = (i, j) => {
        const k = (j + span) * side + (i + span);

        if (wet[k] < 0) {
            const [x, y] = point(i, j);

            wet[k] = outside([x, y]) || waterAt(plan, x, y, height(i, j)) !== null ? 1 : 0;
        }

        return wet[k] === 1;
    };
    let best = null;

    for (let j = -n; j <= n; j++) {
        for (let i = -n; i <= n; i++) {
            const far = i * i + j * j;

            if (far > n * n || (avoid && avoid(...point(i, j)))) {
                continue;
            }

            let [low, high, dry] = [Infinity, -Infinity, true];

            for (let dj = -spread; dj <= spread && dry; dj++) {
                for (let di = -spread; di <= spread; di++) {
                    const h = height(i + di, j + dj);

                    if (Number.isNaN(h) || (Math.abs(di) <= 1 && Math.abs(dj) <= 1 && watery(i + di, j + dj))) {
                        dry = false;
                        break;
                    }

                    [low, high] = [Math.min(low, h), Math.max(high, h)];
                }
            }

            if (dry && (!best || high - low < best.range || (high - low === best.range && far < best.far))) {
                best = { range: high - low, far, at: point(i, j) };
            }
        }
    }

    return best ? best.at : [...at];
}
