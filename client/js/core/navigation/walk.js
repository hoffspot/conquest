// What a navigation tile of a fixed scene's map is made from (navigation.js bakes it, with
// settings.js SCENES): its walk's floors (core/scenery.js, core/walk.js), each square that has one
// two triangles at its height, open ground. Squares side by side whose floors are a step apart or
// less are walked from one to the other, as Recast joins them (SCENES `climb`); further apart (a
// ledge, a stair's side) they aren't. A square with no floor (a wall, the chasm) is left out, so
// Recast keeps walkers clear of it by their radius.

import { floorAt } from "../walk.js";
import { AREA } from "./settings.js";

/**
 * The triangles a tile of a scene's map is made from, as tiles.js tileInput's (`walk`: its walk,
 * read; `measures`: the mesh's, settings.js SCENES): its square of `measures.tile` and the border
 * round it, as far as the map goes.
 */
export function walkInput(walk, tx, ty, measures) {
    const { tile, border } = measures;
    const [width, height] = walk.size;
    const [x0, y0] = [tx * tile - border, ty * tile - border];
    const [x1, y1] = [x0 + tile + 2 * border, y0 + tile + 2 * border];
    const [sx0, sy0] = [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0))];
    const [sx1, sy1] = [Math.min(width, Math.ceil(x1)), Math.min(height, Math.ceil(y1))];
    const positions = [];
    const indices = [];
    const areas = [];
    let [low, high] = [Infinity, -Infinity];

    // Each square with a floor: its own four corners at its floor's height (cut to the tile and
    // its border), two triangles
    for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
            const floor = floorAt(walk, 0, x, y);

            if (floor === null) {
                continue;
            }

            const [ax, ay, bx, by] = [Math.max(x0, x), Math.max(y0, y), Math.min(x1, x + 1), Math.min(y1, y + 1)];
            const a = positions.length / 3;

            positions.push(ax, floor, ay, bx, floor, ay, ax, floor, by, bx, floor, by);
            // (Wound as the ground's: tiles.js)
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
            areas.push(AREA.ground, AREA.ground);
            low = Math.min(low, floor);
            high = Math.max(high, floor);
        }
    }

    // (A tile with no floor in it: an empty box, at the walk's lowest)
    if (!areas.length) {
        [low, high] = [walk.levels[0].low, walk.levels[0].low];
    }

    return {
        positions: Float32Array.from(positions),
        indices: Int32Array.from(indices),
        areas: Uint8Array.from(areas),
        bmin: [x0, low - 1, y0],
        bmax: [x1, high + 1 + measures.height, y1],
    };
}
