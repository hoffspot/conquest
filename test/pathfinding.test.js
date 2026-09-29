import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { squareKey } from "../client/js/core/grid.js";
import { findPath, lineAhead } from "../client/js/core/pathfinding.js";
import { createRandom } from "../client/js/core/random.js";
import { parseGrid } from "./helpers.js";

// Every step in a path must move to a neighbouring tile without cutting obstacle corners
function assertValidPath(grid, path) {
    for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1];
        const [x1, y1] = path[i];
        const dx = x1 - x0;
        const dy = y1 - y0;

        assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy), `step ${i} is not to a neighbour`);
        assert.equal(grid[y1][x1], 0, `step ${i} enters an obstructed tile`);

        if (dx && dy) {
            assert.equal(grid[y0][x1], 0, `step ${i} cuts a corner`);
            assert.equal(grid[y1][x0], 0, `step ${i} cuts a corner`);
        }
    }
}

function pathCost(path) {
    let cost = 0;

    for (let i = 1; i < path.length; i++) {
        const diagonal = path[i][0] !== path[i - 1][0] && path[i][1] !== path[i - 1][1];

        cost += diagonal ? Math.SQRT2 : 1;
    }

    return cost;
}

describe("findPath", () => {
    it("goes in a straight line across open ground", () => {
        const grid = parseGrid([
            ".....",
            ".....",
            ".....",
        ]);

        assert.deepEqual(findPath(grid, [0, 1], [4, 1]), [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]]);
    });

    it("moves diagonally when nothing is in the way", () => {
        const grid = parseGrid([
            "....",
            "....",
            "....",
            "....",
        ]);

        assert.deepEqual(findPath(grid, [0, 0], [3, 3]), [[0, 0], [1, 1], [2, 2], [3, 3]]);
    });

    it("finds the shortest way around a wall", () => {
        const grid = parseGrid([
            ".......",
            ".#####.",
            ".......",
            ".......",
        ]);
        const path = findPath(grid, [3, 0], [3, 3]);

        assertValidPath(grid, path);
        assert.deepEqual(path[0], [3, 0]);
        assert.deepEqual(path.at(-1), [3, 3]);
        // The optimal route: 3 steps along the top, 2 down past the end of the wall,
        // one diagonal step (corners of the wall can't be cut) and 2 steps back
        assert.equal(pathCost(path), 7 + Math.SQRT2);
    });

    it("never cuts the corner of an obstacle", () => {
        const grid = parseGrid([
            "..",
            "#.",
        ]);
        const path = findPath(grid, [1, 1], [0, 0]);

        assertValidPath(grid, path);
        assert.deepEqual(path, [[1, 1], [1, 0], [0, 0]]);
    });

    it("returns an empty path when the destination cannot be reached", () => {
        const grid = parseGrid([
            "..#..",
            "..#..",
            "..#..",
        ]);

        assert.deepEqual(findPath(grid, [0, 0], [4, 2]), []);
    });

    it("returns an empty path when the destination tile is obstructed", () => {
        const grid = parseGrid([
            "...",
            ".#.",
            "...",
        ]);

        assert.deepEqual(findPath(grid, [0, 0], [1, 1]), []);
    });

    it("returns just the start tile when already at the destination", () => {
        assert.deepEqual(findPath(parseGrid(["..."]), [1, 0], [1, 0]), [[1, 0]]);
    });

    it("clamps destinations outside the grid to the nearest edge tile", () => {
        const path = findPath(parseGrid(["....", "...."]), [0, 0], [10, 5]);

        assert.deepEqual(path.at(-1), [3, 1]);
    });

    it("returns an empty path when starting outside the grid", () => {
        assert.deepEqual(findPath(parseGrid(["..."]), [-1, 0], [2, 0]), []);
    });

    it("finds paths through a maze", () => {
        const grid = parseGrid([
            ".#.......",
            ".#.#####.",
            ".#.#...#.",
            ".#.#.#.#.",
            "...#.#...",
            "####.####",
            ".........",
        ]);
        const path = findPath(grid, [0, 0], [0, 6]);

        assertValidPath(grid, path);
        assert.deepEqual(path.at(-1), [0, 6]);
    });

    it("is deterministic", () => {
        const grid = parseGrid([
            "..........",
            "...####...",
            "..........",
            "..........",
        ]);

        assert.deepEqual(findPath(grid, [0, 3], [9, 0]), findPath(grid, [0, 3], [9, 0]));
    });

    it("gives up on a goal others have walled in, a step or two away across open ground", () => {
        const grid = parseGrid(Array.from({ length: 120 }, () => ".".repeat(120)));
        const ring = [];

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx || dy) {
                    ring.push(squareKey(62 + dx, 60 + dy));
                }
            }
        }

        assert.deepEqual(findPath(grid, [59, 60], [62, 60], { taken: new Set(ring) }), []);

        // (One of them stepping aside, the way in's open)
        const open = findPath(grid, [59, 60], [62, 60], { taken: new Set(ring.filter((key) => key !== squareKey(61, 60))) });

        assert.deepEqual(open.at(-1), [62, 60]);
        assertValidPath(grid, open);
    });

    it("finds a way wherever there is one, and none where there isn't, however the ground and others lie", () => {
        const random = createRandom(7);
        const size = 48;
        let found = 0;
        let none = 0;

        for (let trial = 0; trial < 200; trial++) {
            const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => (random.next() < 0.25 ? 1 : 0)));
            const taken = new Set();

            for (let k = 0; k < 120; k++) {
                taken.add(squareKey(Math.floor(random.next() * size), Math.floor(random.next() * size)));
            }

            const start = [Math.floor(random.next() * size), Math.floor(random.next() * size)];
            const goal = [Math.floor(random.next() * size), Math.floor(random.next() * size)];
            const path = findPath(grid, start, goal, { taken });
            const reachable = reaches(grid, taken, start, goal);

            assert.equal(path.length > 0, reachable, `trial ${trial}: from ${start} to ${goal}`);

            if (reachable) {
                found++;
                assertValidPath(grid, path);
                assert.ok(path.slice(1).every(([x, y]) => !taken.has(squareKey(x, y))), `trial ${trial} goes through someone`);
            } else {
                none++;
            }
        }

        assert.ok(found > 20 && none > 20, `both kinds tried (${found} found, ${none} none)`);
    });
});

// Can `goal` be got to from `start` at all (every square it can get to, one after another, moving
// as characters do: never onto a blocked or taken square, never cutting a corner)?
function reaches(grid, taken, [sx, sy], [gx, gy]) {
    const free = (x, y) => y >= 0 && x >= 0 && y < grid.length && x < grid[0].length && !grid[y][x] && !taken.has(squareKey(x, y));
    const seen = new Set([squareKey(sx, sy)]);
    const queue = [[sx, sy]];

    if (sx === gx && sy === gy) {
        return true;
    }

    while (queue.length) {
        const [x, y] = queue.shift();

        for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
            const [nx, ny] = [x + dx, y + dy];

            if (!free(nx, ny) || seen.has(squareKey(nx, ny)) || (dx && dy && !(free(nx, y) && free(x, ny)))) {
                continue;
            }

            if (nx === gx && ny === gy) {
                return true;
            }

            seen.add(squareKey(nx, ny));
            queue.push([nx, ny]);
        }
    }

    return false;
}

describe("lineAhead", () => {
    // Facing (radians from south, towards east): north is π, east π/2
    const NORTH = Math.PI;
    const EAST = Math.PI / 2;

    it("goes straight ahead to the edge of open ground", () => {
        const grid = parseGrid(["......", "......", "......", "......", "......"]);

        assert.deepEqual(lineAhead(grid, [2.5, 4.5], NORTH), [[2, 3], [2, 2], [2, 1], [2, 0]]);
        assert.deepEqual(lineAhead(grid, [0.5, 1.5], EAST), [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
    });

    it("stops before the first blocked square", () => {
        const grid = parseGrid(["..#...", "......", "......", "......"]);

        assert.deepEqual(lineAhead(grid, [2.5, 3.5], NORTH), [[2, 2], [2, 1]]);
        assert.deepEqual(lineAhead(grid, [2.5, 0.5], NORTH), [], "nowhere to go at the edge");
    });

    it("goes diagonally, but never cuts the corner of a blocked square", () => {
        const open = parseGrid([".....", ".....", ".....", ".....", "....."]);
        const northEast = (3 * Math.PI) / 4;

        assert.deepEqual(lineAhead(open, [0.5, 4.5], northEast), [[1, 3], [2, 2], [3, 1], [4, 0]]);

        const corner = parseGrid([".....", ".....", ".#...", ".....", "....."]);

        assert.deepEqual(lineAhead(corner, [0.5, 3.5], northEast), [], "past the corner of the blocked square");
    });

    it("keeps close to the line at any angle, a step at a time", () => {
        const grid = parseGrid(Array.from({ length: 40 }, () => ".".repeat(40)));
        const start = [20.5, 20.5];

        for (let facing = 0; facing < 2 * Math.PI; facing += 0.13) {
            const line = lineAhead(grid, start, facing);

            assertValidPath(grid, [[20, 20], ...line]);
            assert.ok(line.length >= 19, `at ${facing.toFixed(2)}: ${line.length} squares`);

            // Every square's middle within about a square of the line
            for (const [x, y] of line) {
                const across = Math.abs((x + 0.5 - start[0]) * Math.cos(facing) - (y + 0.5 - start[1]) * Math.sin(facing));

                assert.ok(across < 0.8, `at ${facing.toFixed(2)}, [${x}, ${y}] is ${across.toFixed(2)} off the line`);
            }
        }
    });
});
