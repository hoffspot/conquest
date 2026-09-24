// The pieces that castles and towns are built from, and the names the art for each piece is
// stored under.
//
// Castle and town layouts (castle.js, town.js) only use the pieces listed here. The art generator
// (tools/artgen) draws every one of them, so that any layout can be drawn. Sizes are in grid
// squares: a piece covers `w` squares from west to east and `h` from north to south, starting at
// its top-left square.

/**
 * The longest piece of castle wall, in grid squares. Longer walls are made of several pieces,
 * which join seamlessly (their battlements are evenly spaced along every square).
 */
export const WALL_MAX = 8;

/** Castle towers are 3 x 3 squares, centred on the wall. */
export const TOWER_SIZE = 3;
export const TOWER_SHAPES = Object.freeze(["round", "square"]);
export const TOWER_TOPS = Object.freeze(["battlements", "roof"]);

/**
 * A gatehouse is 4 squares along the wall and 3 across it: a tower on each side of a passage 2
 * squares wide. It faces the way out of the castle.
 */
export const GATE_FACINGS = Object.freeze(["n", "e", "s", "w"]);
export const GATEHOUSE_LENGTH = 4;
export const GATEHOUSE_DEPTH = 3;

/** The sizes a castle keep can be. */
export const KEEP_SIZES = Object.freeze([[4, 4], [5, 4], [4, 5], [5, 5], [6, 5], [5, 6], [6, 6]]);

/** The sizes a house can be (a town's plots are 2 to 4 squares wide and deep). */
export const HOUSE_SIZES = Object.freeze([[2, 2], [3, 2], [2, 3], [3, 3], [4, 2], [2, 4], [4, 3], [3, 4]]);

/**
 * Building styles: whitewashed cottages with thatched roofs, timber-framed houses, brick houses
 * and stone buildings (castles use stone and timber).
 */
export const HOUSE_STYLES = Object.freeze(["cottage", "timber", "brick", "stone"]);

/** How many different-looking houses there are of each size and style. */
export const HOUSE_VARIANTS = 3;

/** A town's special buildings, and their sizes. */
export const LANDMARKS = Object.freeze({
    tavern: [3, 3],
    church: [3, 4],
    blacksmith: [3, 3],
    market: [4, 3],
    windmill: [3, 3],
});

/** Small things standing in courtyards, squares and gardens, and their sizes. */
export const PROPS = Object.freeze({
    well: [2, 2],
    barrels: [1, 1],
    crates: [1, 1],
    sacks: [1, 1],
    cart: [1, 1],
    lumber: [2, 1],
    stones: [1, 1],
    weaponrack: [1, 1],
    target: [1, 1],
    tent: [2, 2],
});

/** How many different trees there are (each fills one square). */
export const TREE_VARIANTS = 6;

/** What the ground is, square by square. */
export const GROUND = Object.freeze({ grass: 0, road: 1, cobbles: 2, soil: 3, courtyard: 4 });

export const wallKey = (axis, length) => `wall-${axis}-${length}`;
export const towerKey = (shape, top) => `tower-${shape}-${top}`;
export const gatehouseKey = (facing) => `gatehouse-${facing}`;
export const keepKey = (w, h, door) => `keep-${w}x${h}-${door ? "door" : "plain"}`;
export const houseKey = (w, h, style, variant) => `house-${w}x${h}-${style}-${variant}`;
export const landmarkKey = (name) => `landmark-${name}`;
export const propKey = (name) => `prop-${name}`;
export const treeKey = (variant) => `tree-${variant}`;

/** Every piece there is art for: { key, kind, w, h, and what the art generator needs to draw it }. */
export function pieceCatalog() {
    const pieces = [];

    for (let length = 1; length <= WALL_MAX; length++) {
        pieces.push({ key: wallKey("h", length), kind: "wall", axis: "h", length, w: length, h: 1 });
        pieces.push({ key: wallKey("v", length), kind: "wall", axis: "v", length, w: 1, h: length });
    }

    for (const shape of TOWER_SHAPES) {
        for (const top of TOWER_TOPS) {
            pieces.push({ key: towerKey(shape, top), kind: "tower", shape, top, w: TOWER_SIZE, h: TOWER_SIZE });
        }
    }

    for (const facing of GATE_FACINGS) {
        const across = facing === "n" || facing === "s";

        pieces.push({
            key: gatehouseKey(facing),
            kind: "gatehouse",
            facing,
            w: across ? GATEHOUSE_LENGTH : GATEHOUSE_DEPTH,
            h: across ? GATEHOUSE_DEPTH : GATEHOUSE_LENGTH,
        });
    }

    for (const [w, h] of KEEP_SIZES) {
        for (const door of [true, false]) {
            pieces.push({ key: keepKey(w, h, door), kind: "keep", door, w, h });
        }
    }

    for (const [w, h] of HOUSE_SIZES) {
        for (const style of HOUSE_STYLES) {
            for (let variant = 0; variant < HOUSE_VARIANTS; variant++) {
                pieces.push({ key: houseKey(w, h, style, variant), kind: "house", style, variant, w, h });
            }
        }
    }

    for (const [name, [w, h]] of Object.entries(LANDMARKS)) {
        pieces.push({ key: landmarkKey(name), kind: "landmark", name, w, h });
    }

    for (const [name, [w, h]] of Object.entries(PROPS)) {
        pieces.push({ key: propKey(name), kind: "prop", name, w, h });
    }

    for (let variant = 0; variant < TREE_VARIANTS; variant++) {
        pieces.push({ key: treeKey(variant), kind: "tree", variant, w: 1, h: 1 });
    }

    return pieces;
}
