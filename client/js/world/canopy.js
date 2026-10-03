// The trees' leaves coloured by the land they grow in (the terrain plan's M7j, §9 row 8: "a canopy
// palette per region"): each land's own few colours, each tree one of them by where it stands, the
// commonest its land's own green and here and there a warmer or a golden one (none on a pine or a
// spruce: needles don't turn), each a little lighter or darker than its neighbours. A colour's a
// multiplier on the light (linear) the leaves' own pictures give, so it keeps each kind's own
// green under it. The near trees (kits/trees.js, Woodland and plantTrees) and those seen from afar
// (far/trees.js) are coloured alike, so one turns into the other unseen. The peoples' own trees
// (HOME_TREES) keep their own colours, a little lighter or darker each.
//
// Pure (no three.js): the far trees are worked out in a worker.

/**
 * Each land's colours: [multiplier (linear r, g, b), weight, broadleaved only]. (A leaf's light
 * green is three times its red, or more: so a golden tree's red is pushed three times as hard.)
 */
export const CANOPY = Object.freeze({
    farmland: [
        [[1.05, 1.02, 0.9], 5],
        [[1.5, 1.15, 0.55], 3],
        [[3, 1.25, 0.3], 1.5, true],
    ],
    meadow: [
        [[1.05, 1.05, 0.92], 5],
        [[1.55, 1.18, 0.55], 3],
        [[3.2, 1.3, 0.28], 2, true],
    ],
    woods: [
        [[0.9, 1, 0.9], 7],
        [[0.75, 0.9, 0.85], 2],
        [[2.6, 1.2, 0.35], 1, true],
    ],
    heath: [
        [[1.25, 1, 0.65], 5],
        [[2.4, 1.05, 0.4], 3, true],
        [[0.9, 0.94, 0.86], 2],
    ],
    marsh: [
        [[0.82, 1, 1.15], 6],
        [[0.95, 1, 1], 3],
        [[1.6, 1.15, 0.6], 1, true],
    ],
    elfwood: [
        [[0.88, 1.08, 1.18], 5],
        [[2.6, 1.5, 0.7], 3, true],
        [[1, 1.05, 1.05], 2],
    ],
    darkwood: [
        [[0.85, 0.7, 1.1], 6],
        [[0.7, 0.72, 0.85], 4],
    ],
    savannah: [
        [[1.5, 1.1, 0.55], 6],
        [[2.2, 1.15, 0.4], 3],
        [[1, 1, 0.9], 1],
    ],
    jungle: [
        [[0.8, 1.15, 0.75], 8],
        [[0.95, 1.05, 0.85], 2],
    ],
    badlands: [[[1.4, 1, 0.65], 1]],
    volcanic: [
        [[0.95, 0.82, 0.7], 7],
        [[1.9, 0.85, 0.45], 3],
    ],
    tundra: [
        [[0.85, 0.95, 1], 7],
        [[3, 1.3, 0.3], 3, true],
    ],
    snow: [[[0.85, 0.95, 1.08], 1]],
    mountain: [
        [[0.88, 0.98, 1.02], 8],
        [[1.15, 1.05, 0.8], 2],
    ],
    beach: [[[1.08, 1.05, 0.92], 1]],
});

// The kinds whose leaves turn (all but the conifers'), and the peoples' own (which keep theirs)
const BROADLEAVED = new Set(["oak", "beech", "birch", "poplar", "apple", "greatoak"]);
const OWN = new Set(["acacia", "ironbark", "willow", "silverbark", "nightspire"]);

// How much lighter or darker a tree may be than its neighbours (a share either way)
const SHADE = 0.08;

// A spot's hash (0 to 1): integer, so the same in every browser and the worker
function hashAt(x, y, salt) {
    let h = Math.imul(Math.round(x) | 0, 374761393) + Math.imul(Math.round(y) | 0, 668265263) + Math.imul(salt, 1274126177);

    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = Math.imul(h ^ (h >>> 16), 2246822519);

    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * The colour a tree of `kind` standing at (x, y) (its trunk, metres) in `land` (a BIOMES id) gives
 * its leaves: [r, g, b], multipliers on their light (linear). Into `out` if given.
 */
export function canopyTint(land, kind, x, y, out = [1, 1, 1]) {
    const shade = 1 + SHADE * (2 * hashAt(x, y, 17) - 1);

    if (OWN.has(kind)) {
        out[0] = shade;
        out[1] = shade;
        out[2] = shade;

        return out;
    }

    const choices = (CANOPY[land] ?? CANOPY.meadow).filter(([, , broad]) => !broad || BROADLEAVED.has(kind));
    const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
    let left = hashAt(x, y, 29) * total;
    let [tint] = choices.at(-1);

    for (const [colour, weight] of choices) {
        if ((left -= weight) < 0) {
            tint = colour;
            break;
        }
    }

    out[0] = tint[0] * shade;
    out[1] = tint[1] * shade;
    out[2] = tint[2] * shade;

    return out;
}
