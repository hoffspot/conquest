// A* path finding on a 2D grid.
//
// The book used Andrea Giammarchi's compact A* implementation, which scans the whole open
// list on every step and marks nodes as visited as soon as they are discovered. This version
// uses a binary heap for the open list, keeps proper g-scores (so paths are optimal), and
// breaks ties deterministically so that every multiplayer client computes identical paths.
//
// grid[y][x] is truthy for obstructed tiles and falsy for passable ones.
// Units may move diagonally, but only when both adjacent orthogonal tiles are free,
// so they never cut the corner of an obstacle.

class MinHeap {
    #items = [];

    get size() {
        return this.#items.length;
    }

    static #less(a, b) {
        if (a.f !== b.f) {
            return a.f < b.f;
        }

        // Prefer nodes closer to the goal, then the one that was discovered first
        if (a.h !== b.h) {
            return a.h < b.h;
        }

        return a.seq < b.seq;
    }

    push(node) {
        const items = this.#items;

        items.push(node);

        let index = items.length - 1;

        while (index > 0) {
            const parentIndex = (index - 1) >> 1;

            if (!MinHeap.#less(items[index], items[parentIndex])) {
                break;
            }

            [items[index], items[parentIndex]] = [items[parentIndex], items[index]];
            index = parentIndex;
        }
    }

    pop() {
        const items = this.#items;
        const top = items[0];
        const last = items.pop();

        if (items.length > 0) {
            items[0] = last;

            let index = 0;

            for (;;) {
                const left = index * 2 + 1;
                const right = left + 1;
                let smallest = index;

                if (left < items.length && MinHeap.#less(items[left], items[smallest])) {
                    smallest = left;
                }

                if (right < items.length && MinHeap.#less(items[right], items[smallest])) {
                    smallest = right;
                }

                if (smallest === index) {
                    break;
                }

                [items[index], items[smallest]] = [items[smallest], items[index]];
                index = smallest;
            }
        }

        return top;
    }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Find a path between two grid tiles.
 *
 * @param {ArrayLike<ArrayLike<number>>} grid  2D grid, grid[y][x] truthy when obstructed
 * @param {[number, number]} start  [x, y] of the starting tile
 * @param {[number, number]} end    [x, y] of the destination tile (clamped to the grid)
 * @returns {Array<[number, number]>} tiles from start to end inclusive, or [] if unreachable
 */
export function findPath(grid, start, end) {
    const rows = grid.length;
    const cols = rows > 0 ? grid[0].length : 0;

    if (rows === 0 || cols === 0) {
        return [];
    }

    const [startX, startY] = start;

    if (startX < 0 || startY < 0 || startX >= cols || startY >= rows) {
        return [];
    }

    // A destination outside the map is treated as the nearest tile on the map edge
    const endX = clamp(end[0], 0, cols - 1);
    const endY = clamp(end[1], 0, rows - 1);

    const startIndex = startY * cols + startX;
    const endIndex = endY * cols + endX;

    if (startIndex === endIndex) {
        return [[startX, startY]];
    }

    const heuristic = (x, y) => Math.sqrt((x - endX) * (x - endX) + (y - endY) * (y - endY));

    const size = rows * cols;
    const gScore = new Float64Array(size).fill(Infinity);
    const parent = new Int32Array(size).fill(-1);
    const closed = new Uint8Array(size);
    const open = new MinHeap();

    let sequence = 0;

    const consider = (fromIndex, x, y, cost) => {
        const index = y * cols + x;

        if (closed[index]) {
            return;
        }

        const g = gScore[fromIndex] + cost;

        if (g < gScore[index]) {
            gScore[index] = g;
            parent[index] = fromIndex;

            const h = heuristic(x, y);

            open.push({ index, f: g + h, h, seq: sequence++ });
        }
    };

    gScore[startIndex] = 0;
    open.push({ index: startIndex, f: heuristic(startX, startY), h: heuristic(startX, startY), seq: sequence++ });

    while (open.size > 0) {
        const { index } = open.pop();

        if (closed[index]) {
            // Stale heap entry that was superseded by a cheaper route
            continue;
        }

        if (index === endIndex) {
            const path = [];

            for (let current = index; current !== -1; current = parent[current]) {
                path.push([current % cols, Math.floor(current / cols)]);
            }

            return path.reverse();
        }

        closed[index] = 1;

        const x = index % cols;
        const y = (index - x) / cols;

        const north = y > 0 && !grid[y - 1][x];
        const south = y < rows - 1 && !grid[y + 1][x];
        const east = x < cols - 1 && !grid[y][x + 1];
        const west = x > 0 && !grid[y][x - 1];

        if (north) {
            consider(index, x, y - 1, 1);
        }

        if (east) {
            consider(index, x + 1, y, 1);
        }

        if (south) {
            consider(index, x, y + 1, 1);
        }

        if (west) {
            consider(index, x - 1, y, 1);
        }

        // Diagonal moves are only allowed when they do not cut an obstacle's corner
        if (north && east && !grid[y - 1][x + 1]) {
            consider(index, x + 1, y - 1, Math.SQRT2);
        }

        if (north && west && !grid[y - 1][x - 1]) {
            consider(index, x - 1, y - 1, Math.SQRT2);
        }

        if (south && east && !grid[y + 1][x + 1]) {
            consider(index, x + 1, y + 1, Math.SQRT2);
        }

        if (south && west && !grid[y + 1][x - 1]) {
            consider(index, x - 1, y + 1, Math.SQRT2);
        }
    }

    return [];
}

/**
 * The squares straight ahead of a point ([x, y] metres, on 1-metre squares) the way `facing`
 * points (radians from south, towards east: along (sin, cos) in x and y), one after another, as
 * far as the way is clear: up to the first blocked square or the grid's edge, and never cutting
 * the corner of a blocked square. Doesn't include the square the point is on.
 */
export function lineAhead(grid, [x, y], facing, most = 400) {
    const height = grid.length;
    const width = grid[0].length;
    const dx = Math.sin(facing);
    const dy = Math.cos(facing);
    const squares = [];
    let [sx, sy] = [Math.floor(x), Math.floor(y)];

    // (Stepping a fifth of a metre at a time, noting each square entered)
    for (let travelled = 0.2; squares.length < most; travelled += 0.2) {
        const nx = Math.floor(x + dx * travelled);
        const ny = Math.floor(y + dy * travelled);

        if (nx === sx && ny === sy) {
            continue;
        }

        if (nx < 0 || ny < 0 || nx >= width || ny >= height || grid[ny][nx] || (nx !== sx && ny !== sy && (grid[sy][nx] || grid[ny][sx]))) {
            break;
        }

        squares.push([nx, ny]);
        [sx, sy] = [nx, ny];
    }

    return squares;
}
