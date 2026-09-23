import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeGame, runTicks } from "./helpers.js";

describe("triggers", () => {
    it("timed triggers run once their game time has passed", () => {
        const calls = [];
        const game = makeGame({ triggers: [{ type: "timed", time: 3000, action: (g) => calls.push(g.time) }] });

        runTicks(game, 29);
        assert.deepEqual(calls, []);

        runTicks(game, 100);
        assert.deepEqual(calls, [3000]);
    });

    it("repeating timed triggers run again after the same interval", () => {
        const calls = [];
        const game = makeGame({ triggers: [{ type: "timed", time: 1000, repeat: true, action: (g) => calls.push(g.time) }] });

        runTicks(game, 35);

        assert.deepEqual(calls, [1000, 2000, 3000]);
    });

    it("conditional triggers are checked every second and run once", () => {
        let ready = false;
        let checks = 0;
        const calls = [];
        const game = makeGame({
            triggers: [{
                type: "conditional",
                condition: () => {
                    checks++;

                    return ready;
                },
                action: (g) => calls.push(g.time),
            }],
        });

        runTicks(game, 25);
        assert.equal(checks, 2);

        ready = true;
        runTicks(game, 30);

        assert.deepEqual(calls, [3000]);
        assert.equal(checks, 3);
    });

    it("stop running once the level has ended", () => {
        const calls = [];
        const game = makeGame({
            triggers: [
                { type: "timed", time: 1000, action: (g) => g.endLevel(true) },
                { type: "timed", time: 1000, action: () => calls.push("second") },
            ],
        });

        game.on("levelend", () => game.end());
        runTicks(game, 20);

        assert.deepEqual(calls, []);
    });

    it("pause with the game, since they run on game time", () => {
        const calls = [];
        const game = makeGame({ triggers: [{ type: "timed", time: 1000, action: () => calls.push("ran") }] });

        // No ticks, however much wall clock time passes, means no triggers
        assert.deepEqual(calls, []);
        runTicks(game, 10);
        assert.deepEqual(calls, ["ran"]);
    });

    it("reject unknown trigger types", () => {
        assert.throws(() => makeGame({ triggers: [{ action: () => {} }] }), /Unknown trigger type/);
    });
});
