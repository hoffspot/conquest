// The memory guard (client/js/app/memoryguard.js, app/game.js #memoryGuarding): on a phone, what
// the game holds looked at, and past a mark it holds less (fewer bodies in full, less sound
// decoded), up at once, down only once it's well under for a while; a while that doubles each
// time coming down takes it straight back up, so it doesn't undo its own work every half minute
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardLevel, MEMORY_GUARD, MemoryGuard } from "../client/js/app/memoryguard.js";
import { DECODED_BUDGET } from "../client/js/audio/sound.js";
import { QUALITY } from "../client/js/world/view.js";

// (The level and since when, of what guardLevel says)
const at = ({ level, since }) => ({ level, since });

// The guard over `minutes` in a place, looked at every MEMORY_GUARD.every seconds, against a model
// of what its own levels do to what's held (the reviewer's: bodies in full capped by the level, let
// go at once and built again one every 1.5 s; the sound cut at once and growing back 1 MB a
// second): its changes of level ([s, level]) and how many bodies were built again
function live({ rest, perBody, about, minutes = 10, soundFull = 82 }) {
    const guard = new MemoryGuard();
    const changes = [];
    let bodies = Math.min(about, 32);
    let sound = soundFull;
    let built = 0;

    for (let now = 0; now <= minutes * 60; now += MEMORY_GUARD.every) {
        const want = Math.min(about, 32, MEMORY_GUARD.bodies[guard.level]);
        const soundMost = Math.min(soundFull, (MEMORY_GUARD.sound[guard.level] ?? Infinity) / 1048576);

        if (bodies > want) {
            bodies = want;
        } else if (bodies < want) {
            const more = Math.min(want - bodies, MEMORY_GUARD.every / 1.5);

            bodies += more;
            built += more;
        }

        sound = sound > soundMost ? soundMost : Math.min(soundMost, sound + MEMORY_GUARD.every);

        const was = guard.level;

        if (guard.look(rest + bodies * perBody + sound, now) !== was) {
            changes.push([now, guard.level]);
        }
    }

    return { changes, built: Math.round(built), level: guard.level };
}

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
        assert.ok(MEMORY_GUARD.again >= 60 && MEMORY_GUARD.forget >= MEMORY_GUARD.again * 2);
    });

    it("goes up at once to the highest level whose mark it's past, from any level", () => {
        const [first, second] = MEMORY_GUARD.marks;

        assert.deepEqual(at(guardLevel(first - 1, { now: 5 })), { level: 0, since: 0 });
        assert.deepEqual(at(guardLevel(first, { now: 5 })), { level: 1, since: 5 });
        assert.deepEqual(at(guardLevel(second + 30, { now: 7 })), { level: 2, since: 7 }, "straight to the second");
        assert.deepEqual(at(guardLevel(second, { level: 1, since: 5, now: 9 })), { level: 2, since: 9 });
        assert.deepEqual(at(guardLevel(second, { level: 2, since: 9, now: 11 })), { level: 2, since: 9 }, "staying, since when it came to it");
    });

    it("comes down a level only once it's well under that level's mark and has been at it a while: not let go and taken up again and again", () => {
        const [first, second] = MEMORY_GUARD.marks;
        const { ease, hold } = MEMORY_GUARD;

        // (Just under its mark: held)
        assert.deepEqual(at(guardLevel(second - 1, { level: 2, since: 0, now: hold * 10 })), { level: 2, since: 0 });
        // (Well under, but not long at it: held)
        assert.deepEqual(at(guardLevel(second - ease - 1, { level: 2, since: 0, now: hold - 1 })), { level: 2, since: 0 });
        // (Well under, long enough: a level down, and not two at once)
        assert.deepEqual(at(guardLevel(first - ease - 1, { level: 2, since: 0, now: hold })), { level: 1, since: hold });
        assert.deepEqual(at(guardLevel(first - ease - 1, { level: 1, since: hold, now: hold * 2 })), { level: 0, since: hold * 2 });
        assert.deepEqual(at(guardLevel(0, { level: 0, since: 3, now: 100 })), { level: 0, since: 3 });
    });

    it("waits twice as long to come down each time coming down took it straight back up, and forgets that once it's held as much as ever a good while", () => {
        const [first] = MEMORY_GUARD.marks;
        const { ease, hold, again, forget } = MEMORY_GUARD;
        const low = first - ease - 1;

        // (Up, down after the wait, and back up within a couple of minutes: the wait doubled)
        let state = guardLevel(first, { now: 0 });

        assert.deepEqual(state, { level: 1, since: 0, wait: hold, left: null });
        state = guardLevel(low, { ...state, now: hold });
        assert.deepEqual(state, { level: 0, since: hold, wait: hold, left: hold });
        state = guardLevel(first, { ...state, now: hold + again - 1 });
        assert.deepEqual(state, { level: 1, since: hold + again - 1, wait: hold * 2, left: hold });
        assert.equal(guardLevel(low, { ...state, now: state.since + hold * 2 - 1 }).level, 1, "not after the first wait");
        assert.equal(guardLevel(low, { ...state, now: state.since + hold * 2 }).level, 0);

        // (Back up long after coming down: the place has changed, not its own doing; the wait as it was)
        const later = guardLevel(first, { level: 0, since: 100, wait: hold * 2, left: 100, now: 100 + again });

        assert.equal(later.wait, hold * 2);

        // (Doubling no further than ten minutes; and as it began once it's been at no level that long)
        assert.equal(guardLevel(first, { level: 0, since: 0, wait: forget * 0.75, left: 0, now: 10 }).wait, forget);
        assert.deepEqual(guardLevel(low, { level: 0, since: 50, wait: hold * 8, left: 50, now: 50 + forget - 1 }), { level: 0, since: 50, wait: hold * 8, left: 50 });
        assert.deepEqual(guardLevel(low, { level: 0, since: 50, wait: hold * 8, left: 50, now: 50 + forget }), { level: 0, since: 50, wait: hold, left: null });
    });

    it("no longer undoes its own work every half minute where holding less takes it well under the mark", () => {
        // (The city of the 2026-11-11 crash report at 15 MB a body, 541 MB held unguarded: it
        // changed level 32 times in ten minutes, building 88 bodies again. And a town just over
        // the mark, 16 times; a village where the sound's saving alone does it, 15.)
        const city = live({ rest: 541 - 82 - 30 * 15, perBody: 15, about: 30 });
        const town = live({ rest: 410 - 82 - 22 * 10, perBody: 10, about: 22 });
        const village = live({ rest: 405 - 82 - 18 * 12, perBody: 12, about: 18 });

        assert.ok(city.changes.length <= 12 && city.built <= 40, `the city: ${city.changes.length} changes, ${city.built} bodies built again`);
        assert.ok(town.changes.length <= 8, `the town: ${town.changes.length} changes`);
        assert.ok(village.changes.length <= 8, `the village: ${village.changes.length} changes`);

        // (Each time longer at the level than the last; and over an hour, a change every ten minutes or so)
        const downs = city.changes.filter(([, level], k) => level === 0 && k > 0).map(([when], k, all) => when - (all[k - 1]?.[0] ?? 0));

        assert.ok(downs.length >= 3 && downs.every((gap, k) => k === 0 || gap > downs[k - 1]), `longer each time (${downs})`);

        const hour = live({ rest: 541 - 82 - 30 * 15, perBody: 15, about: 30, minutes: 60 });

        assert.ok(hour.changes.length <= 24, `the city over an hour: ${hour.changes.length} changes`);

        // (A place it settles in is left as it was: the same city at 10 MB a body, two changes)
        assert.deepEqual(live({ rest: 541 - 82 - 30 * 10, perBody: 10, about: 30 }).changes.map(([, level]) => level), [2, 1]);
    });

    it("tells whoever acts on it as its level changes, and to let go of everything idle as it goes up", () => {
        const [first, second] = MEMORY_GUARD.marks;
        const told = [];
        const guard = new MemoryGuard({ onLevel: (level, was) => told.push(`level ${was} to ${level}`), letGo: (level) => told.push(`let go at ${level}`) });

        assert.equal(guard.look(first - 1, 0), 0);
        assert.deepEqual(told, []);
        assert.equal(guard.look(first, 2), 1);
        assert.deepEqual(told, ["level 0 to 1", "let go at 1"]);
        assert.equal(guard.look(first, 4), 1);
        assert.equal(guard.look(second, 6), 2);
        assert.deepEqual(told.slice(2), ["level 1 to 2", "let go at 2"]);

        // (Coming down, nothing's let go of: only the level told)
        assert.equal(guard.look(0, 6 + MEMORY_GUARD.hold), 1);
        assert.deepEqual(told.slice(4), ["level 2 to 1"]);
        assert.deepEqual([guard.level, guard.since, guard.left], [1, 6 + MEMORY_GUARD.hold, 6 + MEMORY_GUARD.hold]);

        // (With no one told, it keeps its level all the same)
        assert.equal(new MemoryGuard().look(second, 0), 2);
    });
});
