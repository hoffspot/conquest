// The world server's soak judged (scripts/server-soak.js; generated/world_server_plan.md §15 S9):
// memory flat after the first hour (the world's thread no more than SERVER_SOAK.growth above
// where it stood then, its last ten minutes' least taken, so a collection due doesn't count), and
// every minute's 99th-percentile step under a step's time once the players are all in. The soak
// itself runs for two hours (npm run soak:server); this is how it's judged. And its thin players
// (generated/multiplayer_scaling_plan.md 0-3): who's counted as not having stayed in, the limits a
// server's opened with for more players than any real one takes, which are options of that call
// and never settings, and a short soak of nine thin players in one world, one more than a world's
// own setting can allow.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { LIMITS } from "../server/access/limits.js";
import { SETTINGS } from "../server/storage/settings.js";
import { WORLD_SETTINGS } from "../server/storage/worlds.js";
import { judge, limitsFor, SERVER_SOAK, soakServer, stayed } from "../scripts/server-soak.js";

const MB = 1048576;

// A soak's samples, a minute each: the world's memory (MB) and its steps' 99th percentile (ms) by minute
const samples = (minutes, { memory = () => 200, p99 = () => 12, dropped = () => 0 } = {}) =>
    Array.from({ length: minutes }, (_, k) => ({ minute: k + 1, world: { heap: memory(k + 1) * MB, external: 0, count: 1200, mean: 5, p99: p99(k + 1), worst: p99(k + 1), ms: 60000, dropped: dropped(k + 1) }, server: { rss: 600 * MB } }));

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

    it("fails a world that played under 99% of its clock's time once they were all in, and says how much it let go", () => {
        // (Two minutes in ten each letting 4 s go: 8 s of 540)
        const judged = judge(samples(10, { dropped: (minute) => (minute === 1 ? 30000 : minute === 4 || minute === 7 ? 4000 : 0) }));

        assert.equal(SERVER_SOAK.pace, 0.99);
        assert.equal(judged.dropped, 8000, "the first minute's, the players coming in, isn't counted");
        assert.ok(Math.abs(judged.pace - (1 - 8000 / 540000)) < 1e-12);
        assert.deepEqual(judged.failures, ["the world played 98.5% of its clock's time, letting 8.0 s go (it's to keep 99%)"]);
    });

    it("passes one that let go of a little, and one whose samples say nothing of its pace", () => {
        const some = judge(samples(10, { dropped: (minute) => (minute === 5 ? 600 : 0) }));
        const none = judge(samples(10).map(({ world: { ms: _ms, dropped: _dropped, ...world }, ...sample }) => ({ ...sample, world })));

        assert.deepEqual(some.failures, []);
        assert.ok(some.pace > 0.99 && some.pace < 1);
        assert.deepEqual([none.pace, none.dropped, none.failures], [1, 0, []]);
    });

    it("can't judge memory before the first hour, and says so by not failing it", () => {
        const judged = judge(samples(10, { memory: (minute) => minute * 50 }));

        assert.equal(judged.settled, null);
        assert.equal(judged.flat, true);
        assert.deepEqual(judged.failures, []);
    });
});

describe("the server soak's players", () => {
    it("counts as not having stayed in whoever's gone, closed, dropped or sent out, and a thin one refused or never welcomed", () => {
        const reports = [
            { name: "Soak1", me: "a" },
            { name: "Soak2", me: "b", gone: true },
            { name: "Soak3", me: "c", closed: "full" },
            { name: "Soak4", me: "d", dropped: true },
            { name: "Soak5", me: "e", kicked: { reason: "afk", step: 9 } },
            { name: "Thin1", thin: true, me: "f", kicked: null, refused: null },
            { name: "Thin2", thin: true, me: null, refused: "full" },
            { name: "Thin3", thin: true, me: null, refused: null },
        ];

        assert.deepEqual(stayed(reports), [
            "Soak2 didn't stay in (gone)",
            "Soak3 didn't stay in (full)",
            "Soak4 didn't stay in (dropped)",
            "Soak5 didn't stay in (sent out: afk)",
            "Thin2 didn't stay in (refused: full)",
            "Thin3 didn't stay in (never welcomed)",
        ]);
    });

    it("opens its server with limits raised only as far as its players need, and with none for 8 or fewer", () => {
        assert.deepEqual(limitsFor(8), {});
        assert.deepEqual(limitsFor(9), { mostPlayers: 9 });
        assert.deepEqual(limitsFor(29), { mostPlayers: 29 });
        assert.deepEqual(limitsFor(LIMITS.socketsPerAddress + 1), { mostPlayers: 33, socketsPerAddress: 33 });
        assert.deepEqual(limitsFor(LIMITS.players + 36), { mostPlayers: 100, players: 100, socketsPerAddress: 100 });
    });

    it("has no setting that could raise them: a world's own takes 8 at the most, and the server's two settings for them go no higher than what a server takes anyway", () => {
        assert.equal(WORLD_SETTINGS.mostPlayers.max, 8);
        // (The caps as settings, generated/multiplayer_scaling_plan.md 1-13: each only lowers
        // what a server takes, its most and its default being what it always took. test/caps.test.js)
        assert.deepEqual(Object.keys(SETTINGS).filter((key) => /limit|mostPlayers|socketsPer|^players/i.test(key)), ["playersAtOnce", "mostPlayersCeiling"]);
        assert.deepEqual([SETTINGS.mostPlayersCeiling.max, SETTINGS.mostPlayersCeiling.default], [8, 8]);
        assert.deepEqual([SETTINGS.playersAtOnce.max, SETTINGS.playersAtOnce.default], [LIMITS.players, LIMITS.players]);
    });

    it("plays nine thin players in one world for a quarter of a minute: all in, none sent out, none sent the world again", async () => {
        const said = [];
        const report = await soakServer({ seed: 2, minutes: 0.25, players: 0, thin: 9, hold: true, oneTown: true, log: (line) => said.push(line) });
        const steps = report.players.map((one) => one.step);

        assert.deepEqual(report.failures, []);
        assert.deepEqual(report.limits, { mostPlayers: 9 });
        assert.deepEqual(report.options, { players: 0, thin: 9, hold: true, fights: false, layout: "one-town", tunnel: false });
        assert.equal(report.players.length, 9);
        assert.ok(report.players.every((one) => one.thin && one.me && one.race === "human" && one.states === 0 && one.held > 0), "each welcomed, holding its stick");
        assert.equal(new Set(report.players.map((one) => one.me)).size, 9, "nine players of their own");
        assert.ok(Math.min(...steps) > 20 && Math.max(...steps) - Math.min(...steps) <= 40, `each heard the world's steps to the end (${steps})`);
        assert.deepEqual([report.resyncs, report.desyncs, report.skips], [0, 0, 0]);
        assert.ok(report.judged.pace >= 0 && report.judged.pace <= 1 && report.samples.every((sample) => sample.world.ms > 0 && sample.world.dropped >= 0), "its pace is judged from what each sample says it let go");
        assert.ok(said.some((line) => /opened with \{"mostPlayers":9\} in place of its limits/.test(line)));
    });
});
