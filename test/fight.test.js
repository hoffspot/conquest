// Whether the player's in a fight, for its music (client/js/app/fight.js): something hostile after
// them or striking them, or them striking at something hostile; not the folk about, nor a foe on
// another map, nor one dead; never once they're dead.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIGHT_LINGERS, foeNear, GUARD_EVERY, guardDue, inFight } from "../client/js/app/fight.js";

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

describe("an enemy close by, so they stand on guard (app/fight.js foeNear, guardDue)", () => {
    it("finds the same as asking everyone, with the root and their standing first: alive, on their map, within reach, an enemy, seen", () => {
        // (As app/game.js #fighting asked it every frame, of everyone, for everyone)
        const asWritten = (one, actors, reach, canSee) => actors.some((other) => !other.dead && other.map === one.map && Math.hypot(other.x - one.x, other.y - one.y) <= reach && hostile(other, one) && canSee(one, other));
        const canSee = (a, b) => (a.x + b.x) % 7 > 1;
        let seed = 11;
        const next = (most) => {
            seed = (seed * 48271) % 2147483647;

            return seed % most;
        };
        const actors = Array.from({ length: 120 }, (_, k) => actor({ id: `a${k}`, x: next(40), y: next(40), team: ["hero", "wild", "folk"][next(3)], map: next(9) ? "town" : "cave", dead: next(11) === 0 }));
        let near = 0;

        for (const one of actors) {
            for (const reach of [1.5, 4, 9]) {
                const found = foeNear(one, actors, reach, hostile, canSee);

                assert.equal(found, asWritten(one, actors, reach, canSee), `${one.id} within ${reach}`);
                near += found ? 1 : 0;
            }
        }

        assert.ok(near > 20 && near < 340, `some with an enemy near, some without (${near})`);

        // (Their standing asked only of one near enough, and what's in the way only of an enemy)
        const asked = { hostile: 0, canSee: 0 };
        const me = actor({ id: "me", x: 0, y: 0, team: "hero" });
        const others = [actor({ id: "far", x: 30, y: 0 }), actor({ id: "baker", x: 1, y: 0, team: "folk" }), actor({ id: "wolf", x: 0, y: 2 })];
        const found = foeNear(
            me,
            others,
            3,
            (a, b) => {
                asked.hostile++;

                return hostile(a, b);
            },
            () => {
                asked.canSee++;

                return true;
            },
        );

        assert.equal(found, true);
        assert.deepEqual(asked, { hostile: 2, canSee: 1 });
    });

    it("is worked out again a quarter of a second of the battle's time after the last, each one's first a different while after, and at once if the time's gone back", () => {
        const dues = [];

        for (let turn = 0; turn < 10; turn++) {
            const kept = {};
            const times = [];

            // (Asked every frame, three to a step, for two seconds from 1000)
            for (let time = 1000; time < 3000; time += 50) {
                for (let frame = 0; frame < 3; frame++) {
                    if (guardDue(kept, time, turn)) {
                        times.push(time);
                    }
                }
            }

            assert.equal(times[0], 1000, "the first time it's asked");
            assert.ok(times[1] - times[0] > 0 && times[1] - times[0] <= GUARD_EVERY);
            assert.deepEqual(
                times.slice(2).map((time, k) => time - times[k + 1]),
                times.slice(2).map(() => GUARD_EVERY),
                "then every quarter second",
            );
            dues.push(times[1]);

            // (A world sent again, its time gone back: not waited out)
            assert.equal(guardDue(kept, 500, turn), true);
            assert.equal(guardDue(kept, 500, turn), false);
        }

        assert.equal(new Set(dues).size, 5, `spread over the steps between (${dues})`);
        assert.ok(GUARD_EVERY >= 150 && GUARD_EVERY <= 350, "a few times a second: a guard's taken soon enough");
    });
});
