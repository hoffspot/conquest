// Whether the player's in a fight, for its music (client/js/app/fight.js): something hostile after
// them or striking them, or them striking at something hostile; not the folk about, nor a foe on
// another map, nor one dead; never once they're dead.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIGHT_LINGERS, inFight } from "../client/js/app/fight.js";

const ME = Object.freeze({ id: "player", map: "town", dead: false, target: null, attack: null });
const hostile = (a, b) => a.team !== b.team && a.team !== "folk" && b.team !== "folk";
const actor = (fields) => ({ map: "town", dead: false, target: null, attack: null, team: "wild", ...fields });

describe("a fight (app/fight.js)", () => {
    it("is one while something hostile is after the player or striking them", () => {
        const me = { ...ME, team: "hero" };

        assert.equal(inFight(me, [me, actor({ id: "wolf" })], hostile), false, "a wolf about, not after them");
        assert.equal(inFight(me, [me, actor({ id: "wolf", target: "player" })], hostile), true, "after them");
        assert.equal(inFight(me, [me, actor({ id: "wolf", attack: { target: "player" } })], hostile), true, "striking them");
        assert.equal(inFight(me, [me, actor({ id: "baker", team: "folk", target: "player" })], hostile), false, "the folk aren't");
        assert.equal(inFight(me, [me, actor({ id: "wolf", target: "player", map: "cave" })], hostile), false, "on another map");
        assert.equal(inFight(me, [me, actor({ id: "wolf", target: "player", dead: true })], hostile), false, "dead");
    });

    it("is one while the player's striking at something hostile, or swung at what they're set on lately", () => {
        const wolf = actor({ id: "wolf" });

        assert.equal(inFight({ ...ME, team: "hero", attack: { target: "wolf" } }, [wolf], hostile), true, "striking at it");
        assert.equal(inFight({ ...ME, team: "hero", target: "wolf" }, [wolf], hostile, 1000), true, "swung a moment ago");
        assert.equal(inFight({ ...ME, team: "hero", target: "wolf" }, [wolf], hostile, 10000), false, "set on it, not swinging");
        assert.equal(inFight({ ...ME, team: "hero", attack: { target: "baker" } }, [actor({ id: "baker", team: "folk" })], hostile), false, "not at the folk");
    });

    it("is never one once the player's dead, or there's no player; and lingers a moment after it's over", () => {
        assert.equal(inFight({ ...ME, team: "hero", dead: true }, [actor({ id: "wolf", target: "player" })], hostile), false);
        assert.equal(inFight(null, [actor({ id: "wolf", target: "player" })], hostile), false);
        assert.ok(FIGHT_LINGERS >= 1500 && FIGHT_LINGERS <= 3000);
    });
});
