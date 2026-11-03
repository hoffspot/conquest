// core/walk.js: a fixed scene's walk, as the model pipeline bakes it (a castle's), read back:
// its squares' floors, where a point is, and the way between two squares.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { floorAt, NONE, placeOf, readWalk, squareOf, walkBetween } from "../client/js/core/walk.js";

// A walk as the pipeline writes it: a level 6 by 4 from (-3, 10), a wall down x 2 with a gap at z
// 3, and a step of 0.5 m up from x 3
function written() {
    const heights = new Int16Array(24).fill(0);

    for (let z = 0; z < 4; z++) {
        heights[z * 6 + 2] = z === 3 ? 0 : NONE;

        for (let x = 3; x < 6; x++) {
            heights[z * 6 + x] = 50;
        }
    }

    return {
        square: 1,
        origin: [-3, 10],
        size: [6, 4],
        from: [-2.5, 0, 10.5],
        levels: [{ squares: 20, low: 0, high: 0.5, box: [0, 0, 5, 3], heights: Buffer.from(heights.buffer).toString("base64") }],
        links: [],
        left: { unreached: 0, small: 0 },
    };
}

describe("a fixed scene's walk", () => {
    const walk = readWalk(written());

    it("reads each square's floor, and where there's none", () => {
        assert.equal(floorAt(walk, 0, 0, 0), 0);
        assert.equal(floorAt(walk, 0, 4, 1), 0.5);
        assert.equal(floorAt(walk, 0, 2, 1), null);
        assert.equal(floorAt(walk, 0, 9, 9), null);
    });

    it("finds the square a point's on, and a square's middle", () => {
        assert.deepEqual(squareOf(walk, [-2.5, 10.5]), [0, 0]);
        assert.deepEqual(squareOf(walk, [1.2, 13.9]), [4, 3]);
        assert.deepEqual(placeOf(walk, 0, [4, 3]), [1.5, 0.5, 13.5]);
        assert.equal(placeOf(walk, 0, [2, 0]), null);
    });

    it("walks round the wall through its gap, and up the step", () => {
        const way = walkBetween(walk, 0, [0, 0], [5, 0]);

        assert.deepEqual(way.at(0), [0, 0]);
        assert.deepEqual(way.at(-1), [5, 0]);
        assert.ok(way.some(([x, z]) => x === 2 && z === 3), "through the gap");
        assert.ok(way.every(([x, z], i) => i === 0 || Math.abs(x - way[i - 1][0]) + Math.abs(z - way[i - 1][1]) === 1));
        assert.equal(way.length, 12);
    });

    it("Bellhaven's (client/models/scenery/bellhaven.walk.json): one level, its bridge's near end joined to the keep's doors, the deck at 79.2 m", () => {
        const castle = readWalk(JSON.parse(readFileSync(new URL("../client/models/scenery/bellhaven.walk.json", import.meta.url), "utf8")));
        const way = walkBetween(castle, 0, squareOf(castle, [0, 40]), squareOf(castle, [-0.5, -140]));

        assert.deepEqual(
            castle.levels.map((level) => level.squares),
            [30027],
        );
        assert.ok(way && way.length > 150, `${way?.length} squares`);
        assert.equal(floorAt(castle, 0, ...squareOf(castle, [0, -50])), 79.2);
    });

    it("finds no way where the step's too high, or to a square with no floor", () => {
        assert.equal(walkBetween(walk, 0, [0, 0], [5, 0], { climb: 0.3 }), null);
        assert.equal(walkBetween(walk, 0, [0, 0], [2, 0]), null);
    });
});
