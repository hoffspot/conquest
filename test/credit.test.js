// Who's credited with a foe brought down, and how well (client/js/core/credit.js; the scaling
// plan's 2-12): pure, from its tag ledger (core/battle.js TAGS). Read by no rule yet
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREDIT, creditOf, eligible, MEDALS, tierOf } from "../client/js/core/credit.js";

const tag = (player, weight) => ({ player, done: weight, taken: 0, healed: 0, weight });

describe("credit for a foe brought down (core/credit.js)", () => {
    it("has gold at 5% of its hit points or half a fair share, silver at half of that, bronze for any tag; paying 100, 85 and 75%", () => {
        assert.deepEqual(MEDALS, ["gold", "silver", "bronze"]);
        assert.deepEqual(CREDIT, { gold: { hp: 0.05, share: 0.5, pay: 1 }, silver: { hp: 0.025, share: 0.25, pay: 0.85 }, bronze: { hp: 0, share: 0, pay: 0.75 } });
    });

    it("credits everyone with some weight in the ledger who isn't away, in its order", () => {
        const tags = [tag("a", 10), tag("b", 0), tag("c", 0.5), tag("d", 40)];

        assert.deepEqual(eligible(tags).map(({ player }) => player), ["a", "c", "d"]);
        assert.deepEqual(eligible(tags, { away: (id) => id === "d" }).map(({ player }) => player), ["a", "c"]);
        assert.deepEqual(eligible([]), []);
        assert.equal(eligible(tags)[0], tags[0], "(the ledger's own entries, none made)");
    });

    it("gives a weight its medal on a leader: a table", () => {
        // [weight, hit points, among how many, the medal]
        const table = [
            [0, 1000, 1, null],
            [-3, 1000, 1, null],
            [1, 1000, 1, "bronze"],
            [24.9, 1000, 4, "bronze"],
            [25, 1000, 4, "silver"],
            [49.9, 1000, 4, "silver"],
            [50, 1000, 4, "gold"],
            [1000, 1000, 1, "gold"],
            // (Among ten, half a fair share is the 5% of its hit points: the same line)
            [50, 1000, 10, "gold"],
            // (Among twenty, half a fair share is less: 2.5%, and silver's a quarter of one, 1.25%)
            [25, 1000, 20, "gold"],
            [24.9, 1000, 20, "silver"],
            [12.5, 1000, 20, "silver"],
            [12.4, 1000, 20, "bronze"],
            // (Mending and harm taken can make a weight more than its hit points: gold still)
            [5000, 1000, 8, "gold"],
        ];

        for (const [weight, hp, among, medal] of table) {
            assert.equal(tierOf(weight, { hp, among }), medal, `${weight} of ${hp} among ${among}`);
        }

        assert.equal(tierOf(50, { hp: 1000 }), "gold", "(among one, unless told)");
        assert.equal(tierOf(50, { hp: 1000, among: 0 }), "gold", "(among no one: as among one)");
    });

    it("pays an ordinary foe's tags in full, and a leader's by their medals; those away, and those with no weight, nothing", () => {
        const tags = [tag("tank", 30), tag("striker", 600), tag("passer", 4), tag("idle", 200), tag("none", 0)];
        const away = (id) => id === "idle";

        assert.deepEqual(creditOf(tags, { hp: 1000, away }), [
            { player: "tank", medal: null, pay: 1 },
            { player: "striker", medal: null, pay: 1 },
            { player: "passer", medal: null, pay: 1 },
        ]);
        assert.deepEqual(creditOf(tags, { hp: 1000, leader: true, away }), [
            { player: "tank", medal: "silver", pay: 0.85 },
            { player: "striker", medal: "gold", pay: 1 },
            { player: "passer", medal: "bronze", pay: 0.75 },
        ]);
        assert.deepEqual(creditOf([], { hp: 1000, leader: true }), []);
    });

    it("changes nothing it's given", () => {
        const tags = Object.freeze([Object.freeze(tag("a", 10)), Object.freeze(tag("b", 60))]);

        assert.deepEqual(creditOf(tags, { hp: 100, leader: true }).map(({ medal }) => medal), ["gold", "gold"]);
    });
});
