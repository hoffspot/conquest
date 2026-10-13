// The world server's soak judged (scripts/server-soak.js; generated/world_server_plan.md §15 S9):
// memory flat after the first hour (the world's thread no more than SERVER_SOAK.growth above
// where it stood then, its last ten minutes' least taken, so a collection due doesn't count), and
// every minute's 99th-percentile step under a step's time once the players are all in. The soak
// itself runs for two hours (npm run soak:server); this is how it's judged.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { judge, SERVER_SOAK } from "../scripts/server-soak.js";

const MB = 1048576;

// A soak's samples, a minute each: the world's memory (MB) and its steps' 99th percentile (ms) by minute
const samples = (minutes, { memory = () => 200, p99 = () => 12 } = {}) =>
    Array.from({ length: minutes }, (_, k) => ({ minute: k + 1, world: { heap: memory(k + 1) * MB, external: 0, count: 1200, mean: 5, p99: p99(k + 1), worst: p99(k + 1) }, server: { rss: 600 * MB } }));

describe("the server soak's judgement", () => {
    it("passes memory that's flat after the first hour, and steps under a step's time once everyone's in", () => {
        const judged = judge(samples(120, { memory: (minute) => (minute < 60 ? 100 + minute * 2 : 220 + ((minute - 60) % 7)), p99: (minute) => (minute === 1 ? 90 : 20) }));

        assert.deepEqual(judged.failures, []);
        assert.equal(judged.flat, true);
        assert.equal(judged.settled, 220 * MB);
        assert.equal(judged.worstP99, 20);
        assert.equal(SERVER_SOAK.warm, 2, "the first minute's steps (the players coming in) aren't judged");
    });

    it("fails memory that keeps growing after the first hour, saying how much", () => {
        const judged = judge(samples(120, { memory: (minute) => 100 + minute * 2 }));

        assert.equal(judged.flat, false);
        assert.match(judged.failures[0], /the world's memory grew \d+% after the first 60 minutes \(from 220 MB to \d+ MB\)/);
    });

    it("fails a minute whose 99th-percentile step took a step's time, saying how many", () => {
        const judged = judge(samples(30, { p99: (minute) => (minute === 12 || minute === 20 ? STEP_MS + 3 : 15) }));

        assert.equal(judged.slowMinutes, 2);
        assert.match(judged.failures[0], new RegExp(`reached ${STEP_MS + 3}\\.0 ms in 2 minute\\(s\\) \\(a step's ${STEP_MS} ms\\)`));
    });

    it("can't judge memory before the first hour, and says so by not failing it", () => {
        const judged = judge(samples(10, { memory: (minute) => minute * 50 }));

        assert.equal(judged.settled, null);
        assert.equal(judged.flat, true);
        assert.deepEqual(judged.failures, []);
    });
});
