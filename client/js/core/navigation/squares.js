// What a navigation tile of a map of squares on its own is made from (navigation.js bakes it,
// with settings.js ROOMS): a building's floor (interiors.js, insides.js), a town laid out on its
// own (world.js), or a test's rows. Its floor is flat, at height 0: each square that isn't blocked
// is two triangles of it, open ground; a blocked one (a wall, a table, a barrel) is left out, so
// Recast keeps walkers clear of it by their radius. The squares off the map's edge are blocked.

import { AREA } from "./settings.js";

/**
 * The triangles a tile of `squares` (grid.js squaresOf) is made from, as tiles.js tileInput's
 * (`measures`: the mesh's, settings.js ROOMS): its square of `measures.tile` and the border round
 * it, as far as the map goes.
 */
export function squaresInput(squares, tx, ty, measures) {
    const { tile, border } = measures;
    const [x0, y0] = [tx * tile - border, ty * tile - border];
    const [x1, y1] = [x0 + tile + 2 * border, y0 + tile + 2 * border];
    const [sx0, sy0] = [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0))];
    const [sx1, sy1] = [Math.min(squares.width, Math.ceil(x1)), Math.min(squares.height, Math.ceil(y1))];
    const positions = [];
    const indices = [];
    const areas = [];
    const across = sx1 - sx0 + 1;

    // A vertex at each square's corners, where it's in the tile; two triangles each square that
    // can be walked on
    for (let y = sy0; y <= sy1; y++) {
        for (let x = sx0; x <= sx1; x++) {
            positions.push(Math.min(x1, Math.max(x0, x)), 0, Math.min(y1, Math.max(y0, y)));
        }
    }

    for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
            if (squares.blocked(x, y)) {
                continue;
            }

            const a = (y - sy0) * across + (x - sx0);
            const [b, c, d] = [a + 1, a + across, a + across + 1];

            // (Wound as the ground's: tiles.js)
            indices.push(a, c, b, b, c, d);
            areas.push(AREA.ground, AREA.ground);
        }
    }

    return {
        positions: Float32Array.from(positions),
        indices: Int32Array.from(indices),
        areas: Uint8Array.from(areas),
        bmin: [x0, -1, y0],
        bmax: [x1, 1 + measures.height, y1],
    };
}
