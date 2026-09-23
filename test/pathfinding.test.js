import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPath } from "../client/js/core/pathfinding.js";
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
});
