// The memory guard (client/js/app/memoryguard.js, app/game.js #memoryGuarding): on a phone, what
// the game holds looked at, and past a mark it holds less (fewer bodies in full, less sound
// decoded), up at once, down only once it's well under for a while
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardLevel, MEMORY_GUARD } from "../client/js/app/memoryguard.js";
import { DECODED_BUDGET } from "../client/js/audio/sound.js";
import { QUALITY } from "../client/js/world/view.js";

describe("the memory guard (app/memoryguard.js)", () => {
    it("holds less the more it holds: well under where an iPhone's let the game's tab go (537 to 575 MB), fewer bodies and less sound at each level", () => {
        const [first, second] = MEMORY_GUARD.marks;

        assert.ok(first < second && second <= 480, "both marks well under 537 MB");
        assert.equal(MEMORY_GUARD.bodies[0], Infinity);
        assert.ok(MEMORY_GUARD.bodies[1] < QUALITY.low.bodies && MEMORY_GUARD.bodies[2] < MEMORY_GUARD.bodies[1]);
        assert.ok(MEMORY_GUARD.bodies[2] >= QUALITY.low.soldiers.full, "never fewer in full than a battle's nearest soldiers");
        assert.equal(MEMORY_GUARD.sound[0], null);
        assert.ok(MEMORY_GUARD.sound[1] < DECODED_BUDGET.touch && MEMORY_GUARD.sound[2] < MEMORY_GUARD.sound[1]);
        assert.ok(MEMORY_GUARD.ease > 0 && MEMORY_GUARD.hold >= 10 && MEMORY_GUARD.every > 0);
    });

    it("goes up at once to the highest level whose mark it's past, from any level", () => {
        const [first, second] = MEMORY_GUARD.marks;

        assert.deepEqual(guardLevel(first - 1, { now: 5 }), { level: 0, since: 0 });
        assert.deepEqual(guardLevel(first, { now: 5 }), { level: 1, since: 5 });
        assert.deepEqual(guardLevel(second + 30, { now: 7 }), { level: 2, since: 7 }, "straight to the second");
        assert.deepEqual(guardLevel(second, { level: 1, since: 5, now: 9 }), { level: 2, since: 9 });
        assert.deepEqual(guardLevel(second, { level: 2, since: 9, now: 11 }), { level: 2, since: 9 }, "staying, since when it came to it");
    });

    it("comes down a level only once it's well under that level's mark and has been at it a while: not let go and taken up again and again", () => {
        const [first, second] = MEMORY_GUARD.marks;
        const { ease, hold } = MEMORY_GUARD;

        // (Just under its mark: held)
        assert.deepEqual(guardLevel(second - 1, { level: 2, since: 0, now: hold * 10 }), { level: 2, since: 0 });
        // (Well under, but not long at it: held)
        assert.deepEqual(guardLevel(second - ease - 1, { level: 2, since: 0, now: hold - 1 }), { level: 2, since: 0 });
        // (Well under, long enough: a level down, and not two at once)
        assert.deepEqual(guardLevel(first - ease - 1, { level: 2, since: 0, now: hold }), { level: 1, since: hold });
        assert.deepEqual(guardLevel(first - ease - 1, { level: 1, since: hold, now: hold * 2 }), { level: 0, since: hold * 2 });
        assert.deepEqual(guardLevel(0, { level: 0, since: 3, now: 100 }), { level: 0, since: 3 });
    });
});
