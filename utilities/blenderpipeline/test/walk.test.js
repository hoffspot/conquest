// lib/walk.js: where scenery can be walked, on scenery made in code (no Blender): ground, a wall
// with a doorway, a bridge over a chasm, a gallery over an arcade reached up a stair, and a roof
// too low to stand under.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { floorAt, NONE, readWalk, walkJson, walkOf } from "../lib/walk.js";

// Two triangles facing up, from (x0, z0) to (x1, z1) at height y
const quad = (x0, z0, x1, z1, y) => [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0];

// A box's twelve triangles, its top facing up, its bottom down and its sides out
function box(x0, y0, z0, x1, y1, z1) {
    const corner = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
    const face = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];

    return [
        ...face(corner(0, 1, 0), corner(0, 1, 1), corner(1, 1, 1), corner(1, 1, 0)),
        ...face(corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)),
        ...face(corner(0, 0, 0), corner(0, 0, 1), corner(0, 1, 1), corner(0, 1, 0)),
        ...face(corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1), corner(1, 0, 1)),
        ...face(corner(0, 0, 0), corner(0, 1, 0), corner(1, 1, 0), corner(1, 0, 0)),
        ...face(corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)),
    ];
}

const walk = (parts, options) => walkOf(new Float32Array(parts.flat()), options);
const heightsOf = (result, level) => Array.from(result.levels[level].heights).filter((value) => value !== NONE);

describe("where scenery can be walked", () => {
    it("ground: one level, every square of it, at its height", () => {
        const result = walk([quad(0, 0, 10, 10, 2)], { from: [5, 2, 5] });

        assert.deepEqual([result.origin, result.size], [[0, 0], [10, 10]]);
        assert.equal(result.levels.length, 1);
        assert.deepEqual(result.levels[0].box, [0, 0, 9, 9]);
        assert.equal(result.levels[0].squares, 100);
        assert.ok(heightsOf(result, 0).every((value) => value === 200));
        assert.equal(floorAt(result, 0, 3, 7), 2);
        assert.deepEqual(result.links, []);
    });

    it("a wall: its squares not stood on, and the doorway in it walked through", () => {
        // (A wall along z at x 5.2 to 5.5, 3 m tall, with a doorway from z 3.9 to 6.1)
        const result = walk([quad(0, 0, 10, 10, 0), box(5.2, 0, 0, 5.5, 3, 3.9), box(5.2, 0, 6.1, 5.5, 3, 10)], { from: [1, 0, 1] });

        assert.equal(result.levels.length, 1);
        assert.equal(floorAt(result, 0, 5, 2), null);
        assert.equal(floorAt(result, 0, 5, 4), 0);
        assert.equal(floorAt(result, 0, 5, 5), 0);
        // (Beyond it, reached through the doorway)
        assert.equal(floorAt(result, 0, 8, 1), 0);
        assert.equal(result.levels[0].squares, 92);
        // (The wall's top is a floor, but none walks to it)
        assert.equal(result.left.unreached, 8);
    });

    it("a bridge over a chasm: walked across, the chasm's floor far under it never reached", () => {
        const result = walk([quad(0, 0, 10, 10, 0), quad(20, 0, 30, 10, 0), quad(10, 4, 20, 6, 0), quad(10, 0, 20, 10, -30)], { from: [1, 0, 1] });

        assert.equal(result.levels.length, 1);
        assert.equal(result.levels[0].squares, 220);
        assert.equal(floorAt(result, 0, 15, 5), 0);
        assert.equal(floorAt(result, 0, 25, 5), 0);
        assert.equal(result.left.unreached, 100);
    });

    it("a gallery over an arcade, up a stair: a level of its own over the ground's, joined to it where the stair comes up", () => {
        // (Ground 30 by 10; a gallery 4 m up over z 0 to 4, its floor 0.3 m thick on pillars; a
        // stair along x from 20 to 28 at z 5 to 7, rising half a metre a metre, to a landing at the
        // gallery's end, solid to the ground)
        const stair = Array.from({ length: 8 }, (_, i) => box(20 + i, 0, 5, 21 + i, 0.5 * (i + 1), 7));
        const parts = [quad(0, 0, 30, 10, 0), box(0, 4, 0, 28, 4.3, 4), box(28, 0, 0, 30, 4.3, 7), ...stair];

        for (const x of [2, 8, 14, 20, 26]) {
            parts.push(box(x, 0, 1, x + 0.4, 4, 1.4));
        }

        const result = walk(parts, { from: [1, 0, 8] });

        assert.equal(result.levels.length, 2);

        // The ground's level under the gallery, and the gallery's over it
        assert.equal(floorAt(result, 0, 5, 2), 0);
        assert.equal(floorAt(result, 1, 5, 2), 4.3);
        assert.ok(result.levels[1].low > 4 && result.levels[1].high < 4.5, JSON.stringify(result.levels[1]));
        assert.equal(floorAt(result, 1, 5, 7), null);

        // Joined where the stair comes up
        assert.equal(result.links.length, 1);
        assert.deepEqual([result.links[0].from, result.links[0].to], [0, 1]);
        assert.ok(result.links[0].crossings.length >= 1);
        assert.ok(result.links[0].crossings.every(([x, z, ox, oz]) => Math.abs(x - ox) + Math.abs(z - oz) === 1));
    });

    it("a step within a square: a bridge's end 0.4 m over the court it comes to, part of a square, still walked off", () => {
        // (The deck ends at z 10.2, a fifth of the way into the square from z 10 to 11)
        const result = walk([quad(0, 0, 4, 10.2, 0.4), box(0, -5, 0, 4, 0.4, 10.2), quad(-10, 10.2, 14, 20, 0)], { from: [2, 0.4, 2] });

        // (Squares counted from the grid's corner, at x -10)
        assert.deepEqual(result.origin, [-10, 0]);
        assert.equal(result.levels.length, 1);
        assert.equal(floorAt(result, 0, 12, 10), 0.4);
        assert.equal(floorAt(result, 0, 12, 15), 0);
        assert.equal(floorAt(result, 0, 2, 18), 0);
    });

    it("no room to stand: under a roof lower than a body, and where it's too steep", () => {
        // (A roof 1.5 m up over x 0 to 4; a slope of 60 degrees from x 6 to 8)
        const steep = [6, 0, 0, 6, 0, 10, 8, 3.46, 10, 6, 0, 0, 8, 3.46, 10, 8, 3.46, 0];
        const result = walk([quad(0, 0, 10, 10, 0), box(0, 1.5, 0, 4, 1.7, 10), steep], { from: [5, 0, 5] });

        assert.equal(floorAt(result, 0, 2, 5), null);
        assert.equal(floorAt(result, 0, 5, 5), 0);
        assert.equal(floorAt(result, 0, 7, 5), null);
        assert.equal(floorAt(result, 0, 9, 5), null);
    });

    it("leaves out a level too small to keep (a sill), and carries a walk through JSON as it was", () => {
        // (A sill 2.6 m up, up three steps, two of its squares over the ground: a level too small
        // to keep)
        const steps = [2, 1.4, 0.8].map((top, i) => box(5.9 + i, 0, 4.1, 6.9 + i, top, 5.9));
        const result = walk([quad(0, 0, 12, 10, 0), box(4.1, 2.5, 4.1, 5.9, 2.6, 5.9), ...steps], { from: [1, 0, 1] });
        const json = JSON.parse(JSON.stringify(walkJson(result)));

        assert.equal(result.levels.length, 1);
        assert.equal(result.left.small, 2);
        assert.equal(floorAt(result, 0, 5, 4), 2.6);
        assert.equal(floorAt(result, 0, 4, 4), 0);
        assert.equal(typeof json.levels[0].heights, "string");
        assert.deepEqual(readWalk(json), { ...result, levels: result.levels.map((level) => ({ ...level, heights: new Int16Array(level.heights) })) });
    });

    it("says what's wrong: nowhere to walk from; nothing to walk on", () => {
        assert.throws(() => walk([quad(0, 0, 10, 10, 0)], { from: [50, 0, 50] }), /walk.from \(50, 0, 50\): there's no floor there/);
        assert.throws(() => walk([quad(0, 0, 10, 10, 0)], {}), /walk.from is where it's walked from/);
        assert.throws(() => walk([], { from: [0, 0, 0] }), /there's nothing to walk on/);
    });
});
