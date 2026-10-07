// A map's squares, however they're kept: as rows of numbers (the tavern's floors, a town laid out
// on its own, the tests' little maps), or in chunks made from the world plan as they're needed
// (overworld.js). Everything that walks, looks or finds a way reads a map through squaresOf:
// blocked(x, y) and opaque(x, y), true off the map's edge, and its size; and, where the map says
// (overworld.js), roomy(x, y): whether someone can be put to stand there, clear of walls.

const read = new WeakMap();

/**
 * A map's squares: { width, height, blocked(x, y), opaque(x, y) (what can't be seen through: the
 * blocked squares, if the map doesn't say), ground(x, y) }. `map` is a map with its own squares
 * (a `squares` object: overworld.js), or with `blocked` (and maybe `opaque` and `ground`) rows, or
 * those rows themselves, or squares already.
 */
export function squaresOf(map) {
    if (map.squares) {
        return map.squares;
    }

    // (Squares already)
    if (typeof map.blocked === "function") {
        return map;
    }

    if (!read.has(map)) {
        const rows = Array.isArray(map) ? { blocked: map } : map;
        const { blocked, opaque = blocked, ground = null } = rows;
        const height = blocked.length;
        const width = height ? blocked[0].length : 0;
        const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height;

        read.set(map, {
            width,
            height,
            blocked: (x, y) => !inside(x, y) || Boolean(blocked[y][x]),
            opaque: (x, y) => !inside(x, y) || Boolean(opaque[y][x]),
            ground: (x, y) => (inside(x, y) && ground ? ground[y][x] : 0),
        });
    }

    return read.get(map);
}

/** A square's key, for sets of squares (as `taken`): squares must be less than 65,536 across. */
export const squareKey = (x, y) => y * 65536 + x;

/**
 * The free square nearest a square (searching outward ring by ring, as far as `within` squares):
 * not blocked, with room to stand on (a map's squares that say: `roomy`, overworld.js, clear of
 * buildings' walls), and not in `taken` (a Set of squareKey). Throws if there's none.
 */
export function nearestFree(map, [x, y], { taken = null, within = 128 } = {}) {
    const squares = squaresOf(map);
    const free = (cx, cy) => !squares.blocked(cx, cy) && (!squares.roomy || squares.roomy(cx, cy)) && !taken?.has(squareKey(cx, cy));

    for (let ring = 0; ring <= within; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
            // (Only the ring's edge: its top and bottom rows whole, its sides' ends)
            const step = Math.abs(dy) === ring ? 1 : 2 * ring;

            for (let dx = -ring; dx <= ring; dx += Math.max(1, step)) {
                if (free(x + dx, y + dy)) {
                    return [x + dx, y + dy];
                }
            }
        }
    }

    throw new Error("No free square in the world");
}
