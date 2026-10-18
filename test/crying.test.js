// A place's crier calling out (client/js/core/crying.js callOf; docs/GAME.md *The crier*): his
// "Oyez!" and the latest news the player's yet to hear, never the same again too soon; else the
// town's own cries, each once before any again; never calling oftener than his wait
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bubbleSeconds, CALLING, callOf, CRIES } from "../client/js/core/crying.js";
import { createRandom } from "../client/js/core/random.js";

describe("a crier calling out (crying.js)", () => {
    it("cries his oyez and the latest news the player's yet to hear, not the same again within a while, and waits between his calls", () => {
        const random = createRandom(5);
        const state = {};
        const headline = "The Orcs have declared war on the Elves.";
        const first = callOf({ now: 0, state, headline, random });

        assert.deepEqual(first, { lines: [CALLING.oyez, headline], news: true });
        assert.equal(callOf({ now: 1000, state, headline, random }), null, "not again so soon");
        assert.ok(state.next >= CALLING.every[0] && state.next <= CALLING.every[1]);

        // (His wait over, but the same news cried them lately: one of the town's cries instead)
        const second = callOf({ now: state.next, state, headline, random });

        assert.equal(second.news, false);
        assert.ok(CRIES.day.includes(second.lines[1]));

        // (Long enough on: the same news again; new news at once)
        assert.equal(callOf({ now: CALLING.again + 1, state: { said: { [headline]: 0 } }, headline, random }).news, true);
        assert.equal(callOf({ now: state.next, state, headline: "Kellford has fallen.", random }).lines[1], "Kellford has fallen.");
    });

    it("cries the town's own each once before any again, by day and by night, with no news to tell", () => {
        const random = createRandom(9);
        const state = {};
        const cried = (night) => {
            state.next = 0;

            return callOf({ now: 1, state, night, random }).lines[1];
        };
        const days = CRIES.day.map(() => cried(false));

        assert.deepEqual([...days].sort(), [...CRIES.day].sort(), "each once");
        assert.ok(CRIES.day.includes(cried(false)), "and round again");
        assert.ok(CRIES.night.map(() => cried(true)).every((words) => CRIES.night.includes(words)));
    });

    it("shows his words long enough to be read: from 2.5 to 6 seconds, longer the more there is", () => {
        assert.equal(bubbleSeconds("Hear ye!"), 2.5);
        assert.ok(bubbleSeconds("a".repeat(50)) > bubbleSeconds("a".repeat(30)));
        assert.equal(bubbleSeconds("a".repeat(400)), 6);
        assert.ok([...CRIES.day, ...CRIES.night].every((words) => words.length <= 90), "two short lines at most");
    });
});
