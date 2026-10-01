// Where the sun shines from outdoors, and how much a square of the land faces it: the sunny side
// of a hill drier and golden, its flowers carpeting it; the shaded side lusher and greener (the
// research report behind M7b: Far Cry 5's and The Witcher 3's aspect rule).

/** Where the sun shines from, outdoors (x, up, z: towards it; view.js lights the world from it). */
export const SUN_FROM = Object.freeze([-0.55, 1, 0.65]);

// Its way across the land (x, z), a metre long
const ACROSS = Math.hypot(SUN_FROM[0], SUN_FROM[2]);
const [SX, SZ] = [SUN_FROM[0] / ACROSS, SUN_FROM[2] / ACROSS];

/**
 * How much a chunk's square (i, j) faces the sun: how far its ground falls towards it for each
 * metre (its corners' heights, `heights`: a square's corners a side), so about 0.1 on a gentle
 * sunny slope, less than 0 on a shaded one, 0 on the flat.
 */
export function facingSun(heights, i, j) {
    if (!heights) {
        return 0;
    }

    const side = Math.round(Math.sqrt(heights.length));
    const [nw, ne, sw, se] = [heights[j * side + i], heights[j * side + i + 1], heights[(j + 1) * side + i], heights[(j + 1) * side + i + 1]];
    const [gx, gz] = [(ne + se - nw - sw) / 2, (sw + se - nw - ne) / 2];

    return -(gx * SX + gz * SZ);
}
