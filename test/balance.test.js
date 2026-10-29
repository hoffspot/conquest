// The balance runner (scripts/balance.js; docs/WILDS.md *Tuning it*): a side set against the wild
// at a tier of land, the rules alone, what each fight cost it
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { OPPOSITION } from "../client/js/core/strength.js";
import { balance, boosting, RUN, SIDES, summary } from "../scripts/balance.js";

describe("the balance runner (scripts/balance.js)", () => {
    it("sets a side against the wild at a tier, fight after fight, and says what each cost it", () => {
        const report = balance("pair", 2, { fights: 1 });
        const [fight] = report.fights;

        assert.equal(report.side, "pair");
        assert.equal(report.tier, 2);
        assert.ok(Math.abs(report.strength - 2) < 1e-9, `${report.strength}`);
        assert.ok(Math.abs(report.opposition - Math.pow(2, OPPOSITION.answer)) < 1e-9, `${report.opposition}`);
        assert.equal(report.fights.length, 1);
        assert.ok(fight.foes > 0, "the wild came, and they fought");
        assert.ok(fight.seconds > 0 && fight.taken >= 0 && fight.falls >= 0 && fight.knocked === 0);
        assert.equal(fight.rested, true, "camp made first");
        assert.deepEqual(Object.keys(summary(report)).sort(), ["borne", "cleared", "drawn", "falls", "foes", "knocked", "rate", "seconds", "taken"]);
        assert.equal(summary(report).drawn, 0, "none drawn off them, with no allies");
    });

    it("has each side's aim: a share of what one alone loses, less the stronger the side", () => {
        assert.deepEqual(Object.keys(SIDES), ["solo", "pair", "four", "hirelings", "company", "summoner"]);
        assert.deepEqual(SIDES.company.hired, ["warrior", "cleric", "mage", "ranger"]);
        assert.equal(SIDES.solo.aim, 1);
        assert.ok(SIDES.four.aim < SIDES.pair.aim && SIDES.pair.aim < SIDES.solo.aim);
        assert.ok(Object.values(SIDES).every(({ aim }) => aim > 0 && aim <= 1));
    });

    it("keeps its players as strong as their tier's creatures, outfitted again or not, as hurt as they were", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false }, progress: { gear: { mainHand: { id: "sword" }, chest: { id: "mail" } } } });

        const me = host.battle.actor(HOST_PLAYER);
        const keep = boosting(host, [HOST_PLAYER], 2);
        const hp = me.maxHp;
        const melee = me.power.melee;

        keep();
        assert.equal(me.maxHp, Math.round(hp * 2 * RUN.hardy));
        assert.equal(me.power.melee, melee * 2);

        // (Outfitted again, half hurt: host.js #outfit lets go of it, the runner makes it so again)
        me.hp = Math.round(me.maxHp / 2);
        assert.equal(host.command(HOST_PLAYER, { type: "unequip", slot: "chest" }).ok, true);
        assert.equal(me.maxHp, hp);

        keep();
        assert.equal(me.maxHp, Math.round(hp * 2 * RUN.hardy));
        assert.equal(me.power.melee, melee * 2);
        assert.ok(Math.abs(me.hp / me.maxHp - 0.5) < 0.02, `${me.hp} of ${me.maxHp}`);

        // (Not made so twice)
        keep();
        assert.equal(me.maxHp, Math.round(hp * 2 * RUN.hardy));
    });
});
