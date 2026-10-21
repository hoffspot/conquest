// A place's crier calling out (client/js/core/crying.js callOf; docs/GAME.md *The crier*): his
// "Oyez!" or another of his openings, each in turn, and the latest news the player's yet to hear,
// never the same again too soon; else the town's own cries, each once before any again; never
// calling oftener than his wait
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bubbleSeconds, CALLING, callOf, CRIES, OPENINGS } from "../client/js/core/crying.js";
import { createRandom } from "../client/js/core/random.js";

describe("a crier calling out (crying.js)", () => {
    it("cries one of his openings and the latest news the player's yet to hear, not the same again within a while, and waits between his calls", () => {
        const random = createRandom(5);
        const state = {};
        const headline = "The Orcs have declared war on the Elves.";
        const first = callOf({ now: 0, state, headline, random });

        assert.ok(OPENINGS.includes(first.lines[0]));
        assert.deepEqual(first, { lines: [first.lines[0], headline], news: true });
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

    it("opens each call with one of his openings, as cried of old, each in turn: every one once before any again, never the same twice running", () => {
        assert.ok(OPENINGS.includes("Oyez! Oyez! Oyez!") && OPENINGS.length >= 10);
        assert.equal(new Set(OPENINGS).size, OPENINGS.length);

        // (Twenty criers' calls to a player, twenty times round each)
        for (let seed = 1; seed <= 20; seed++) {
            const random = createRandom(seed);
            const state = {};
            const opened = [];

            for (let k = 0; k < OPENINGS.length * 20; k++) {
                state.next = 0;
                opened.push(callOf({ now: 1, state, headline: k % 2 ? `News ${k}` : null, random }).lines[0]);
            }

            for (let round = 0; round < 20; round++) {
                const these = opened.slice(round * OPENINGS.length, (round + 1) * OPENINGS.length);

                assert.deepEqual([...these].sort(), [...OPENINGS].sort(), "each once a round");
            }

            assert.ok(opened.every((words, k) => k === 0 || words !== opened[k - 1]), "never the same twice running");
        }
    });

    it("shows his words long enough to be read: from 2.5 to 6 seconds, longer the more there is", () => {
        assert.equal(bubbleSeconds("Hear ye!"), 2.5);
        assert.ok(bubbleSeconds("a".repeat(50)) > bubbleSeconds("a".repeat(30)));
        assert.equal(bubbleSeconds("a".repeat(400)), 6);
        assert.ok([...CRIES.day, ...CRIES.night].every((words) => words.length <= 90), "two short lines at most");
        assert.ok(OPENINGS.every((words) => words.length <= 24), "his opening on a line of its own");
    });
});
