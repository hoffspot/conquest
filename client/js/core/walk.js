// Where a fixed scene (a castle) can be walked, as the model pipeline bakes it
// (utilities/blenderpipeline/lib/walk.js, its README's *Where it can be walked*): a grid of 1 m
// squares from `origin`, in levels where one floor is over another, each square a level has a
// floor on at its height. Plain data, the same for everyone, with the art or without it.

// A square no floor of a level is on, in its heights
export const NONE = -32768;

// Heights (base64, little-endian Int16, centimetres) as an Int16Array
function int16(base64) {
    const text = atob(base64);
    const bytes = new Uint8Array(text.length);

    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i);
    }

    return new Int16Array(bytes.buffer);
}

/**
 * A walk read from its JSON: each level's heights (base64, little-endian Int16, centimetres) as an
 * Int16Array; and what's under it (`under`, where it was baked: the lowest of the scene over each
 * patch of a coarser grid, { square, origin, size, heights, top }, NONE where nothing's over one)
 * and its own terrain (`ground`: the top of its terrain's own triangles over each patch of a grid
 * of its own, `heights`, and the highest of all else, `over`) the same.
 */
export function readWalk(json) {
    return {
        ...json,
        levels: json.levels.map(({ heights, ...level }) => ({ ...level, heights: int16(heights) })),
        ...(json.under ? { under: { ...json.under, heights: int16(json.under.heights), ...(json.under.top ? { top: int16(json.under.top) } : {}) } } : {}),
        ...(json.ground ? { ground: { ...json.ground, heights: int16(json.ground.heights), over: int16(json.ground.over) } } : {}),
    };
}

/** A level's floor at a square of the grid (counted from its origin), in metres, or null where it has none. */
export function floorAt(walk, level, x, z) {
    const { box, heights } = walk.levels[level];

    if (x < box[0] || z < box[1] || x > box[2] || z > box[3]) {
        return null;
    }

    const value = heights[(z - box[1]) * (box[2] - box[0] + 1) + (x - box[0])];

    return value === NONE ? null : value / 100;
}

/** The square of the grid a point in the scene ([x, z], metres) is on. */
export function squareOf(walk, [x, z]) {
    return [Math.floor((x - walk.origin[0]) / walk.square), Math.floor((z - walk.origin[1]) / walk.square)];
}

/** Where a square's middle is in the scene: [x, y (its floor), z], metres; null where the level has no floor there. */
export function placeOf(walk, level, [x, z]) {
    const y = floorAt(walk, level, x, z);

    return y === null ? null : [walk.origin[0] + (x + 0.5) * walk.square, y, walk.origin[1] + (z + 0.5) * walk.square];
}

/**
 * The squares of a level a body walks from one square to another, the fewest (each beside the
 * last, its floor no more than `climb` from it), or null if none joins them.
 */
export function walkBetween(walk, level, from, to, { climb = 0.8 } = {}) {
    const { box } = walk.levels[level];
    const across = box[2] - box[0] + 1;
    const key = ([x, z]) => (z - box[1]) * across + (x - box[0]);
    const came = new Map([[key(from), null]]);
    const queue = [from];

    if (floorAt(walk, level, ...from) === null || floorAt(walk, level, ...to) === null) {
        return null;
    }

    for (let i = 0; i < queue.length; i++) {
        const square = queue[i];

        if (square[0] === to[0] && square[1] === to[1]) {
            const path = [];

            for (let at = square; at; at = came.get(key(at))) {
                path.push(at);
            }

            return path.reverse();
        }

        const height = floorAt(walk, level, ...square);

        for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            const next = [square[0] + dx, square[1] + dz];
            const there = floorAt(walk, level, ...next);

            if (there !== null && Math.abs(there - height) <= climb + 1e-4 && !came.has(key(next))) {
                came.set(key(next), square);
                queue.push(next);
            }
        }
    }

    return null;
}
