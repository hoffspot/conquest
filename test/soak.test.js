// The cross-engine soak's verdict (scripts/soak.js judge) in each netcode, and the sum of a
// world's ground every engine is held to (core/overworld.js groundSum): the scaling plan's 3-36
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorld, groundSum } from "../client/js/core/overworld.js";
import { judge, SOAK } from "../scripts/soak.js";

const lockstep = { name: "Node", steps: 1000, idle: false, rate: 0, resyncs: 0, desyncs: 0, hours: 0.1, errors: [], ground: 7, netcode: "lockstep" };
const viewer = { name: "Node", steps: 1000, frames: 1000, faults: 0, self: true, viewer: true, errors: [], ground: 7, netcode: "replicated" };

describe("the cross-engine soak's verdict", () => {
    it("passes a world in lockstep whose copies kept to it, and fails one sent the world again too often, as ever", () => {
        const host = { saw: [], ground: 7, netcode: "lockstep" };

        assert.deepEqual(judge({ rows: [lockstep], host }), []);
        assert.match(judge({ rows: [{ ...lockstep, rate: SOAK.rate, resyncs: 3 }], host })[0], /was sent the world again 3 times/);
        assert.match(judge({ rows: [{ ...lockstep, steps: 0 }], host })[0], /never played the world/);
        assert.deepEqual(judge({ rows: [{ ...lockstep, errors: ["boom"] }], host }), ["Node: boom"]);
    });

    it("judges a world played by views by its frames, its mirror and its hero, not by resyncs", () => {
        const host = { saw: [], ground: 7, netcode: "replicated" };

        assert.deepEqual(judge({ rows: [viewer], host }), []);
        assert.deepEqual(judge({ rows: [{ ...viewer, frames: 1000 * SOAK.frames }], host }), [], "just enough frames");
        assert.match(judge({ rows: [{ ...viewer, frames: 400 }], host })[0], /played 400 frames of 1000 steps: fewer than 50%/);
        assert.match(judge({ rows: [{ ...viewer, faults: 2, lines: ["a record of no kind"] }], host })[0], /couldn't read 2 of what it was sent: a record of no kind/);
        assert.match(judge({ rows: [{ ...viewer, self: false }], host })[0], /hero isn't in what it's shown/);
        assert.match(judge({ rows: [{ ...lockstep }], host })[0], /wasn't sent views/, "a copy of the world isn't a view of it");
        assert.match(judge({ rows: [{ ...viewer, steps: 0 }], host })[0], /never played the world/);
        // (No resync is counted against a game that holds no copy)
        assert.deepEqual(judge({ rows: [{ ...viewer, rate: 99 }], host }), []);
    });

    it("holds every engine's ground to the host's, in either netcode", () => {
        for (const [row, netcode] of [[lockstep, "lockstep"], [viewer, "replicated"]]) {
            const failures = judge({ rows: [{ ...row, name: "WebKit", ground: 8 }], host: { saw: [], ground: 7, netcode } });

            assert.equal(failures.length, 1);
            assert.match(failures[0], /WebKit made other ground of the world's seed than the host \(8, the host 7\)/);
        }

        // (A report from before the sum was taken says nothing of it)
        assert.deepEqual(judge({ rows: [{ ...lockstep, ground: undefined }], host: { saw: [], netcode: "lockstep" } }), []);
    });
});

describe("the sum of a world's ground", () => {
    it("is the same for the same seed made twice, another for another seed, and a whole number", () => {
        const options = { cells: 2, within: 3 };
        const [a, again, other] = [groundSum(buildWorld({ seed: 2 }), options), groundSum(buildWorld({ seed: 2 }), options), groundSum(buildWorld({ seed: 3 }), options)];

        assert.ok(Number.isInteger(a) && a >= 0 && a < 2 ** 32);
        assert.equal(again, a);
        assert.notEqual(other, a);
        assert.notEqual(groundSum(buildWorld({ seed: 2 }), { cells: 2, within: 2 }), a, "more points, another sum");
    });
});
