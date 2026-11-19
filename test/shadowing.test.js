// A game's shadow, watched (app/shadowing.js; the scaling plan's 3-17): what it finds kept in the
// debug log and told the world once, by the way a crash report goes; the `?shadow` switch and its
// expiry; and the world's side of keeping it (server/storage/crashes.js)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { SHADOWING, shadowEvent, watchShadow } from "../client/js/app/shadowing.js";
import { SHADOW_COUNTS } from "../client/js/core/shadow.js";
import { CRASHES, reportOf } from "../server/storage/crashes.js";
import { unexpired } from "./helpers.js";

// A shadow as far as it's watched: its counts, its differences and its lines
const shadowOf = (differences, lines = []) => ({ counts: { ...Object.fromEntries(SHADOW_COUNTS.map((name) => [name, 0])), compared: 900, values: differences }, differences, lines });

// Timers that go when told to
function timersOf() {
    const set = new Map();
    let next = 1;

    return { setInterval: (work, every) => (set.set(next, { work, every }), next++), clearInterval: (id) => set.delete(id), tick: () => [...set.values()].forEach(({ work }) => work()), set };
}

describe("a game's shadow, watched (app/shadowing.js)", () => {
    it("keeps nothing while the shadow's sound; keeps an event when it's found a difference, tells the world of the first, and keeps another only when there are more", async () => {
        const timers = timersOf();
        const kept = [];
        const sent = [];
        let shadow = null;
        let room = true;
        const watch = watchShadow({
            shadow: () => shadow,
            keep: (kind, detail) => {
                if (!room) {
                    return null;
                }

                kept.push({ kind, ...detail, at: "2026-11-19T12:00:00.000Z", build: "b1", code: "c1", built: null });

                return kept.at(-1);
            },
            send: async (report) => sent.push(report),
            still: () => true,
            timers,
        });

        assert.equal([...timers.set.values()][0].every, SHADOWING.every);

        // (No shadow yet; then one that's sound)
        timers.tick();
        shadow = shadowOf(0);
        timers.tick();
        assert.deepEqual([kept, sent], [[], []]);

        // (Two differences: kept, and sent as a report of one event the world will take)
        shadow = shadowOf(2, ["step 40, values: wolf at 1, 2, and the copy has 1, 3", "step 41, events: told of hit"]);
        timers.tick();
        await Promise.resolve();
        assert.equal(kept.length, 1);
        assert.deepEqual([kept[0].kind, kept[0].differences, kept[0].counts.compared, kept[0].lines.length], ["shadow", 2, 900, 2]);
        assert.match(kept[0].summary, /^Views differed from this game's copy 2 times in 900 frames: step 40, values: wolf/);
        assert.deepEqual(sent, [{ build: "b1", code: "c1", built: null, events: [kept[0]] }]);
        assert.ok(reportOf(sent[0]), "as the world's crash reports take one");

        // (No more than before: nothing kept. More: kept, and not sent again)
        timers.tick();
        assert.equal(kept.length, 1);
        shadow = shadowOf(5, ["step 40, values: wolf"]);
        timers.tick();
        await Promise.resolve();
        assert.deepEqual([kept.length, kept[1].differences, sent.length], [2, 5, 1]);

        // (Too soon for the log to keep another: looked at again later, and kept then)
        shadow = shadowOf(9, ["step 40, values: wolf"]);
        room = false;
        timers.tick();
        assert.equal(kept.length, 2);
        room = true;
        watch.look();
        assert.deepEqual([kept.length, kept[2].differences], [3, 9]);
        assert.equal(shadowEvent(shadowOf(1, ["x"])).summary, "Views differed from this game's copy 1 time in 900 frames: x");
    });

    it("stops watching once the game's left the world, and when it's told to; and a sending that fails is no one's trouble", async () => {
        const timers = timersOf();
        let there = true;
        let kept = 0;
        const watch = watchShadow({ shadow: () => shadowOf(3, ["a"]), keep: (kind, detail) => (kept++, { kind, ...detail }), send: () => Promise.reject(new Error("unreachable")), still: () => there, timers });

        timers.tick();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(kept, 1);

        there = false;
        timers.tick();
        assert.equal(timers.set.size, 0, "left: no longer looked at");

        const other = watchShadow({ shadow: () => null, keep: () => null, send: () => null, still: () => true, timers });

        assert.equal(timers.set.size, 1);
        other.stop();
        other.stop();
        assert.equal(timers.set.size, 0);
        watch.stop();
    });

    it("is asked for by `?shadow` alone, a switch with its day to be gone by; and the world keeps what it's sent as a report whose event is a shadow's", async () => {
        const main = await readFile(new URL("../client/js/main.js", import.meta.url), "utf8");

        assert.equal(main.match(/params\.has\("shadow"\)/g)?.length, 1, "asked for in one place, by the page's address");
        assert.match(main, /if \(params\.has\("shadow"\)\) \{\s+joined\.joining\.shadowing\(true\);/);
        assert.equal(main.match(/\.shadowing\(/g).length, 1, "and nowhere without it");

        // (Off unless it's asked for, as every switch of the two netcodes is; gone, or argued for, by)
        unexpired("the game's ?shadow", "2027-11-12");

        // (The world's side: a shadow's event in place of a crash; a crash as ever; neither, nothing)
        const event = { kind: "shadow", at: "2026-11-19T12:00:00.000Z", summary: "Views differed", differences: 2 };

        assert.deepEqual(reportOf({ build: "b1", code: "c1", built: null, events: [event] }), { crashed: "2026-11-19T12:00:00.000Z", build: "b1", code: "c1", built: null, events: [event] });
        assert.equal(reportOf({ events: [{ kind: "crash", at: "2026-11-19T12:00:00.000Z" }, event] }).crashed, "2026-11-19T12:00:00.000Z");
        assert.equal(reportOf({ events: [{ kind: "slow", at: "2026-11-19T12:00:00.000Z" }] }), null);
        assert.equal(reportOf({ events: Array.from({ length: CRASHES.events + 1 }, () => event) }), null);
    });
});
