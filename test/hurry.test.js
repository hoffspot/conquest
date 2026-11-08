// How soon a player could be somewhere (client/js/core/hurry.js; docs/WAR.md *A fair chance*): the
// way there in turns, with time first to finish what they were at, and the turn they'd have had
// their chance by; something on the road met
// before its end or not (coming their way, going by, going away faster than they go, at its end
// already), and when it's at its end; whether they could catch it hurrying, and from when they're
// held to it; and whether they've had their chance.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KINDS } from "../client/js/core/battle.js";
import { dueAt, endAt, GRACE, hadChance, HURRY, LEAVE, MEET, meetAt, ON_THE_ROAD, onTheRoad, PACE, turnsTo, untilOf } from "../client/js/core/hurry.js";
import { CONVOY, SPEEDS } from "../client/js/core/war/war.js";

const convoy = (at, to, more = {}) => ({ kind: "convoy", at, path: [at, to], leg: 0, ...more });

describe("how soon a player could be somewhere (hurry.js)", () => {
    it("takes them a turn for each PACE metres of the way, less than they walk, with LEAVE turns first to finish what they were at, and holds them to it GRACE turns after", () => {
        assert.ok(PACE < KINDS.player.speed * 60, "less than a walk");
        assert.ok(HURRY > PACE && HURRY > CONVOY.speed, "hurrying, a convoy's caught up with");
        assert.ok(ON_THE_ROAD.envoy === SPEEDS.envoy && ON_THE_ROAD.envoy > HURRY, "not an envoy");
        assert.equal(turnsTo([0, 0], [0, 0]), 0);
        assert.equal(turnsTo([0, 0], [PACE * 10, 0]), 10);
        assert.equal(turnsTo([0, 0], [PACE * 10 + 1, 0]), 11);
        assert.equal(turnsTo([0, 0], [PACE * 10, 0], PACE * 4), 6);
        assert.equal(dueAt([0, 0], [PACE * 10, 0], 7), 7 + LEAVE + 10 + GRACE);
        assert.ok(LEAVE >= 10, "time to finish a fight, or get out of a dungeon");
        assert.equal(untilOf(7, 40), 7 + 40 + LEAVE);
        assert.equal(untilOf(7, 40, [0, 0], [PACE * 10, 0]), 7 + 40 + LEAVE + 10);
    });

    it("meets what's on the road by them at once, coming their way where they'd get to before it, and never what's going away faster than they go", () => {
        // (By them: at once)
        assert.equal(meetAt([0, 0], convoy([100, 0], [3000, 0]), 5), 5);

        // (Coming their way from 2 km off: met on the way out to it, sooner than it'd take it to
        // come all the way)
        const meet = meetAt([0, 0], convoy([2000, 0], [-2000, 0]), 5);

        assert.ok(meet > 5 && meet < 5 + Math.ceil((2000 - MEET) / CONVOY.speed), `${meet}`);

        // (Going away from them out of reach: never at a steady pace. Hurrying, a convoy's caught
        // up with in the end, 1 km on; an envoy, going faster than they ever do, never)
        assert.equal(meetAt([0, 0], convoy([400, 0], [5000, 0]), 5), null);
        assert.equal(meetAt([0, 0], convoy([400, 0], [5000, 0]), 5, { pace: HURRY }), 5 + 1000 / CONVOY.speed);
        assert.equal(meetAt([0, 0], { kind: "envoy", at: [300, 0], path: [[300, 0], [5000, 0]], leg: 0 }, 5, { pace: HURRY }), null);

        // (Going by them, its road's end the far side: met as it passes; its road ending before it
        // gets near: never)
        assert.notEqual(meetAt([0, 0], { kind: "envoy", at: [-3000, 200], path: [[-3000, 200], [3000, 200]], leg: 0 }, 5), null);
        assert.equal(meetAt([0, 0], { kind: "envoy", at: [-3000, 200], path: [[-3000, 200], [-1500, 200]], leg: 0 }, 5), null);

        // (Not on a road at all, or not anything that goes on one: nothing)
        assert.equal(meetAt([0, 0], { kind: "army", at: [0, 0], path: [] }, 5), null);
        assert.equal(meetAt(null, convoy([100, 0], [3000, 0]), 5), null);
    });

    it("goes on along a road from where it's got to, past the legs it's done, short of its end where it stops", () => {
        // (Its road: done to the second corner; 1000 m more to go)
        const going = { kind: "convoy", at: [1000, 0], path: [[0, 0], [1000, 0], [1000, 600], [1000, 1000]], leg: 1 };

        assert.equal(endAt(going, 4), 4 + Math.ceil(1000 / CONVOY.speed));
        assert.equal(endAt(going, 4, { short: 400 }), 4 + Math.ceil(600 / CONVOY.speed));
        assert.equal(endAt({ kind: "army", at: [0, 0] }, 4), null);

        // (Met at the end it comes to, its road's last corner by the player: not at the first,
        // which it's past)
        assert.notEqual(meetAt([1000, 1000], going, 4), null);
        assert.equal(meetAt([0, 0], { ...going, at: [1000, 600], leg: 2 }, 4), null);
    });

    it("counts them met with what's on the road if they'd catch it hurrying, and holds them to it from when they'd get there at a steady pace, or it's at its end, with time to finish what they were at", () => {
        // (A convoy going away from them, 250 m off: caught hurrying, not at a walk. They're held
        // to it only once it's at its end, LEAVE and GRACE turns after)
        const away = convoy([250, 0], [2250, 0]);
        const chance = onTheRoad([0, 0], away, 10);

        assert.equal(meetAt([0, 0], away, 10), null);
        assert.notEqual(meetAt([0, 0], away, 10, { pace: HURRY }), null);
        assert.equal(chance.met, true);
        assert.equal(chance.due, endAt(away, 10) + LEAVE + GRACE);

        // (Coming their way: held to it from when they'd meet it, LEAVE and GRACE turns after)
        const coming = convoy([1500, 0], [-1500, 0]);

        assert.deepEqual(onTheRoad([0, 0], coming, 10), { met: true, due: meetAt([0, 0], coming, 10) + LEAVE + GRACE });

        // (Out of reach, going away: not met at all)
        assert.equal(onTheRoad([0, 0], convoy([1000, 0], [3000, 0]), 10).met, false);
    });

    it("has a player had their chance once they've been there, or once the turn they'd have been there by has gone; one from before there were any, has", () => {
        assert.equal(hadChance({ due: 20 }, 20), false);
        assert.equal(hadChance({ due: 20 }, 21), true);
        assert.equal(hadChance({ due: 20, there: true }, 12), true);
        assert.equal(hadChance({}, 12), true);
        assert.equal(hadChance({ due: null }, 12), true);
    });
});
