// Farmland's fields (terrain plan M7b; the user: "Plowed ground is organized into fields"): the
// land laid out as it's farmed, not ploughed in patches.
// - In blocks (furlongs) of about FIELDS.block metres, their edges wandering by as much as
//   FIELDS.jitter so no two are the same size, a verge of grass FIELDS.margin wide inside each edge
//   (with the next block's, a hedgerow's or a track's width between them).
// - Some blocks left as pasture, grass all over; the rest in parallel strips, all of a block's
//   running the same way (east to west or north to south, as its hash says), each as wide as
//   its block's (FIELDS.strips), a baulk of grass FIELDS.baulk wide between each and the next.
// - Each strip its own crop (CROP): ploughed, wheat, barley, greens, or fallow (grass); a strip
//   too narrow to plough where a block runs out left as grass (a headland, with the verge).
//
// All of it from the square's own whole metres and the world's seed, by integer hashing alone: the
// same in every browser (the ground's shader works out which way a block's furrows run the same
// way: world/ground.js).

/**
 * The fields' layout: how wide a block is (metres) and how far its edges wander; the grass verge
 * inside its edges; how much of the land's left as pasture; the widths its strips may be and
 * the baulk between them (metres).
 */
export const FIELDS = Object.freeze({ block: 72, jitter: 18, margin: 2, pasture: 0.22, strips: [8, 10, 12, 14, 16, 20], baulk: 1 });

/** What grows in a strip (none: grass, a verge, a baulk or pasture). */
export const CROP = Object.freeze({ none: 0, ploughed: 1, wheat: 2, barley: 3, greens: 4, fallow: 5 });

/** Whether a crop's strip is soil (ploughed or sown), not grass. */
export const sown = (crop) => crop >= CROP.ploughed && crop <= CROP.greens;

/**
 * A square's field as a chunk keeps it (core/overworld.js chunk.crops: a byte a square): its crop,
 * plus ALONG if its strip runs north to south (0 for none).
 */
export const ALONG = 8;

// The narrowest strip worth ploughing (metres): narrower, where its block runs out, it's grass
const NARROWEST = 4;

// How likely each crop is in a strip (in hundredths, in CROP's order from ploughed)
const CROP_ODDS = [
    [CROP.ploughed, 34],
    [CROP.wheat, 26],
    [CROP.barley, 12],
    [CROP.greens, 14],
    [CROP.fallow, 14],
];

/**
 * An integer hash of three whole numbers (0 to 2³² - 1), as world/ground.js's shader works it
 * out too.
 */
export function fieldHash(a, b, c) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;

    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 2246822519);

    return (h ^ (h >>> 15)) >>> 0;
}

// Where the k'th block edge along an axis (0: x, 1: y) lies (whole metres)
function edgeAt(k, axis, seed) {
    return k * FIELDS.block + (fieldHash(k, axis, seed + 71) % (2 * FIELDS.jitter + 1)) - FIELDS.jitter;
}

/** The block a point (whole metres) is in along an axis: [its index, where it starts, where the next starts]. */
export function blockAlong(v, axis, seed) {
    let k = Math.floor(v / FIELDS.block);

    if (v < edgeAt(k, axis, seed)) {
        k -= 1;
    } else if (v >= edgeAt(k + 1, axis, seed)) {
        k += 1;
    }

    return [k, edgeAt(k, axis, seed), edgeAt(k + 1, axis, seed)];
}

/**
 * The field a square (x, y: whole metres) is in, were it farmland: { crop (CROP's), along (0: its
 * strip runs east to west, 1: north to south), block: [bx, by], middle: [x, y] (its block's, whole
 * metres: whether the block's farmed is the land's there) }; its crop CROP.none on a verge, a
 * baulk, a headland or pasture.
 */
export function fieldAt(seed, x, y) {
    const [bx, x0, x1] = blockAlong(x, 0, seed);
    const [by, y0, y1] = blockAlong(y, 1, seed);
    const h = fieldHash(bx, by, seed + 73);
    const along = (h >>> 7) & 1;
    const { margin } = FIELDS;
    const field = { crop: CROP.none, along, block: [bx, by], middle: [Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)] };

    // (The verge round its edges, and a pasture all over)
    if (x - x0 < margin || x1 - 1 - x < margin || y - y0 < margin || y1 - 1 - y < margin || h % 100 < FIELDS.pasture * 100) {
        return field;
    }

    const width = FIELDS.strips[(h >>> 9) % FIELDS.strips.length];
    const span = width + FIELDS.baulk;
    const across = along === 0 ? y - y0 - margin : x - x0 - margin;
    const room = (along === 0 ? y1 - y0 : x1 - x0) - 2 * margin;
    const strip = Math.floor(across / span);

    // (A baulk, or a headland where there's no room for another strip)
    if (across - strip * span >= width || room - strip * span < NARROWEST) {
        return field;
    }

    let odds = fieldHash(bx * 131 + strip, by, seed + 79) % 100;

    for (const [crop, chance] of CROP_ODDS) {
        if (odds < chance) {
            return { ...field, crop };
        }

        odds -= chance;
    }

    return { ...field, crop: CROP.fallow };
}
