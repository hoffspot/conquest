// A replicated world's soak judged (scripts/view-soak.js; the scaling plan's 3-30): how its
// players' views are added up and what fails them, and a short soak of three players who play
// from their views alone in a real world server's replicated world
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { soakView, VIEW_SOAK, viewersOf } from "../scripts/view-soak.js";

// A player's report (core/bot.js ViewBot report), a minute of frames at a few KB a second
const viewer = (name, more = {}) => ({ name, viewer: true, me: `guest-${name}`, frames: 1200, steps: 1200, bytes: 1200 * 300, unread: 0, known: 20, most: 24, now: 20, self: true, faults: 0, lines: [], again: 0, results: { done: 12, refused: 0 }, arrivals: { frames: 1199, p95: 52, p99: 60, worst: 90 }, kicked: null, refused: null, ...more });

describe("a view soak's players, added up (scripts/view-soak.js viewersOf)", () => {
    it("passes players sent a frame a step that their mirrors took whole, and says what they came to", () => {
        const seen = viewersOf([viewer("a"), viewer("b", { bytes: 1200 * 500, arrivals: { frames: 1199, p95: 55, p99: 70, worst: 120 } })]);

        assert.deepEqual(seen.failures, []);
        assert.deepEqual([seen.players, seen.frames, seen.rate, seen.known, seen.faults], [2, 2400, 1, 20, 0]);
        // (20 steps a second: 300 and 500 bytes a frame are 6,000 and 10,000 a second)
        assert.deepEqual([seen.bytesASecond, seen.most], [8000, 10000]);
        assert.deepEqual(seen.arrivals, { p95: 55, p99: 70, worst: 120 });
        assert.deepEqual(seen.commands, { done: 24, refused: 0 });
    });

    it("fails a mirror told what couldn't be so, a player never welcomed or sent nothing, one whose hero's not in their mirror, bytes that weren't a frame, and too few frames", () => {
        const failures = (more) => viewersOf([viewer("a", more)]).failures;

        assert.match(failures({ faults: 2, lines: ["a record for 7, whom it doesn't know of"] })[0], /a's mirror was told 2 thing\(s\) that couldn't be so: a record for 7/);
        assert.match(failures({ me: null, refused: "full" })[0], /a was never welcomed \(refused: full\)/);
        assert.match(failures({ frames: 0, steps: 0, bytes: 0 })[0], /a was sent no frame/);
        assert.match(failures({ self: false })[0], /a's own hero isn't among those its mirror knows of/);
        assert.match(failures({ unread: 3 })[0], /3 lot\(s\) of bytes that weren't a frame/);
        assert.match(failures({ frames: 500 })[0], /a frame for 500 of 1200 steps \(50% at the least\)/);
        // (Held back for a slow link, to half the steps at the worst: not a failure)
        assert.deepEqual(failures({ frames: 600, bytes: 600 * 300 }), []);
    });

    it("fails frames that came to more than the plan's 20 KB a second each on the mean", () => {
        assert.equal(VIEW_SOAK.bytes, 20 * 1024);
        assert.deepEqual(viewersOf([viewer("a", { bytes: 1200 * 1024 })]).failures, []);
        assert.match(viewersOf([viewer("a", { bytes: 1200 * 1100 })]).failures[0], /each player's frames came to 21\.5 KB a second on the mean \(20 KB at the most\)/);
        assert.deepEqual([viewersOf([viewer("a")]).over, viewersOf([viewer("a", { bytes: 1200 * 1100 })]).over], [false, true]);
    });

    it("only says so where it's told to (the nightly's): over the budget is in the report and isn't a failure, and everything else still is", () => {
        const seen = viewersOf([viewer("a", { bytes: 1200 * 1100 })], { told: true });

        assert.deepEqual([seen.failures, seen.over], [[], true]);
        assert.match(viewersOf([viewer("a", { bytes: 1200 * 1100, faults: 1, lines: ["x"] })], { told: true }).failures[0], /couldn't be so/);

        // (And the nightly's runs are told to: both of them)
        const workflow = readFileSync(new URL("../.github/workflows/scale.yml", import.meta.url), "utf8");

        assert.equal(workflow.match(/npm run soak:view -- [^\n]*/g).every((line) => line.includes("--report-bytes")), true);
        assert.equal(workflow.match(/npm run soak:view -- /g).length, 2);
    });
});

describe("a short view soak (scripts/view-soak.js soakView)", () => {
    it("has three players play from their views alone in a world server's replicated world: all stay in, each sent a frame a step into a mirror with no faults", { timeout: 120000 }, async () => {
        const report = await soakView({ minutes: 0.25, players: 3, oneTown: true, log: () => {} });

        assert.deepEqual(report.failures, []);
        assert.equal(report.players.length, 3);
        assert.deepEqual(report.limits, {}, "three in a world: the server as it always is");

        for (const one of report.players) {
            assert.ok(one.me && one.viewer && one.self, `${one.name} in, its hero in its mirror`);
            assert.ok(one.frames >= 100 && one.frames === one.steps, `${one.name}: ${one.frames} frames over ${one.steps} steps`);
            assert.equal(one.faults, 0);
            assert.equal(one.heard.ops, undefined, "no step of the world's sent to it");
        }

        assert.ok(report.viewers.bytesASecond > 0 && report.viewers.bytesASecond < VIEW_SOAK.bytes);
        assert.ok(report.views.frames >= 300, "the world's feed made their frames");
    });
});
