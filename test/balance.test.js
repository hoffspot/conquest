// The balance runner (scripts/balance.js; docs/WILDS.md *Tuning it*): a side set against the wild
// at a tier of land, the rules alone, what each fight cost it
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { balance, SIDES, summary } from "../scripts/balance.js";

describe("the balance runner (scripts/balance.js)", () => {
    it("sets a side against the wild at a tier, fight after fight, and says what each cost it", () => {
        const report = balance("pair", 2, { fights: 1 });
        const [fight] = report.fights;

        assert.equal(report.side, "pair");
        assert.equal(report.tier, 2);
        assert.ok(Math.abs(report.strength - 2) < 1e-9, `${report.strength}`);
        assert.ok(report.opposition > 1.7 && report.opposition < 1.8);
        assert.equal(report.fights.length, 1);
        assert.ok(fight.foes > 0, "the wild came");
        assert.ok(fight.seconds > 0 && fight.taken >= 0 && fight.falls >= 0);
        assert.deepEqual(Object.keys(summary(report)).sort(), ["falls", "foes", "seconds", "taken"]);
        assert.deepEqual(Object.keys(SIDES), ["solo", "pair", "four", "hirelings", "summoner"]);
    });
});
