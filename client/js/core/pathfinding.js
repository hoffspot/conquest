// A* path finding on a 2D grid.
//
// The book used Andrea Giammarchi's compact A* implementation, which scans the whole open
// list on every step and marks nodes as visited as soon as they are discovered. This version
// uses a binary heap for the open list, keeps proper g-scores (so paths are optimal), and
// breaks ties deterministically so that every multiplayer client computes identical paths.
//
// The grid is read through grid.js (squaresOf): rows, grid[y][x] truthy for obstructed tiles and
// falsy for passable ones, or a map with its own squares (the world, in chunks: overworld.js),
// searched only round the start and end. Units may move diagonally, but only when both adjacent
// orthogonal tiles are free, so they never cut the corner of an obstacle.

import { squareKey, squaresOf } from "./grid.js";

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

// The eight squares round one
const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// A map bigger than this many squares (the world, in chunks) is searched only round the start and
// the end: this far beyond them (squares), and no more than MOST squares in all before giving up
const WHOLE = 1 << 16;
const MARGIN = 64;
const MOST = 120000;

// With others in the way (`taken`), a search gives up sooner, after this many squares and this
// many more for each square across between the start and the end, squared: a goal they've shut
// in isn't searched for over the whole window, again and again, while they stand there
const CROWDED = Object.freeze({ least: 4000, per: 100 });

// Kept from one search to the next (big enough for the biggest window yet)
let buffers = { size: 0, gScore: null, parent: null, closed: null };

function buffersFor(size) {
    if (buffers.size < size) {
        buffers = { size, gScore: new Float64Array(size), parent: new Int32Array(size), closed: new Uint8Array(size) };
    }

    buffers.gScore.fill(Infinity, 0, size);
    buffers.parent.fill(-1, 0, size);
    buffers.closed.fill(0, 0, size);

    return buffers;
}

/**
 * Find a path between two grid tiles.
 *
 * @param {object} grid  The map (grid.js squaresOf: rows, grid[y][x] truthy when obstructed, or
 *   a map with its own squares)
 * @param {[number, number]} start  [x, y] of the starting tile
 * @param {[number, number]} end    [x, y] of the destination tile (clamped to the grid)
 * @param {object} [options]
 * @param {Set<number>} [options.taken]  Squares to go round as well (grid.js squareKey)
 * @returns {Array<[number, number]>} tiles from start to end inclusive, or [] if unreachable
 */
export function findPath(grid, start, end, { taken = null } = {}) {
    const squares = squaresOf(grid);
    const { width, height } = squares;

    if (width === 0 || height === 0) {
        return [];
    }

    const [startX, startY] = start;

    if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
        return [];
    }

    // A destination outside the map is treated as the nearest tile on the map edge
    const endX = clamp(end[0], 0, width - 1);
    const endY = clamp(end[1], 0, height - 1);

    if (startX === endX && startY === endY) {
        return [[startX, startY]];
    }

    // The part of the map searched: all of it, or round the start and the end
    const whole = width * height <= WHOLE;
    const x0 = whole ? 0 : Math.max(0, Math.min(startX, endX) - MARGIN);
    const y0 = whole ? 0 : Math.max(0, Math.min(startY, endY) - MARGIN);
    const x1 = whole ? width : Math.min(width, Math.max(startX, endX) + MARGIN + 1);
    const y1 = whole ? height : Math.min(height, Math.max(startY, endY) + MARGIN + 1);
    const cols = x1 - x0;
    const size = cols * (y1 - y0);
    const free = (x, y) => x >= x0 && y >= y0 && x < x1 && y < y1 && !squares.blocked(x, y) && !taken?.has(squareKey(x, y));

    // (A goal that can't be stood on, or that's shut in on every side (unless the start's beside
    // it), can't be reached: said at once, rather than after searching the whole window)
    const across = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));

    if (!free(endX, endY) || (across > 1 && !NEIGHBOURS.some(([dx, dy]) => free(endX + dx, endY + dy)))) {
        return [];
    }

    const startIndex = (startY - y0) * cols + (startX - x0);
    const endIndex = (endY - y0) * cols + (endX - x0);
    // (How far it is at the least, moving as characters do: straight, or diagonally at √2 a square)
    const heuristic = (x, y) => {
        const dx = Math.abs(x - endX);
        const dy = Math.abs(y - endY);

        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    const most = taken ? Math.min(MOST, CROWDED.least + CROWDED.per * across * across) : MOST;
    const { gScore, parent, closed } = buffersFor(size);
    const open = new MinHeap();

    let sequence = 0;
    let explored = 0;

    const consider = (fromIndex, x, y, cost) => {
        const index = (y - y0) * cols + (x - x0);

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

    while (open.size > 0 && explored < most) {
        const { index } = open.pop();

        if (closed[index]) {
            // Stale heap entry that was superseded by a cheaper route
            continue;
        }

        if (index === endIndex) {
            const path = [];

            for (let current = index; current !== -1; current = parent[current]) {
                path.push([(current % cols) + x0, Math.floor(current / cols) + y0]);
            }

            return path.reverse();
        }

        closed[index] = 1;
        explored++;

        const x = (index % cols) + x0;
        const y = Math.floor(index / cols) + y0;

        const north = free(x, y - 1);
        const south = free(x, y + 1);
        const east = free(x + 1, y);
        const west = free(x - 1, y);

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
        if (north && east && free(x + 1, y - 1)) {
            consider(index, x + 1, y - 1, Math.SQRT2);
        }

        if (north && west && free(x - 1, y - 1)) {
            consider(index, x - 1, y - 1, Math.SQRT2);
        }

        if (south && east && free(x + 1, y + 1)) {
            consider(index, x + 1, y + 1, Math.SQRT2);
        }

        if (south && west && free(x - 1, y + 1)) {
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
    const squares = squaresOf(grid);
    const dx = Math.sin(facing);
    const dy = Math.cos(facing);
    const line = [];
    let [sx, sy] = [Math.floor(x), Math.floor(y)];

    // (Stepping a fifth of a metre at a time, noting each square entered)
    for (let travelled = 0.2; line.length < most; travelled += 0.2) {
        const nx = Math.floor(x + dx * travelled);
        const ny = Math.floor(y + dy * travelled);

        if (nx === sx && ny === sy) {
            continue;
        }

        if (squares.blocked(nx, ny) || (nx !== sx && ny !== sy && (squares.blocked(nx, sy) || squares.blocked(sx, ny)))) {
            break;
        }

        line.push([nx, ny]);
        [sx, sy] = [nx, ny];
    }

    return line;
}
