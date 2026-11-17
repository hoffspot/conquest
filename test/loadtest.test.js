// The server's own load test (server/loadtest.js; generated/multiplayer_scaling_plan.md 0-11,
// 1-14): the load's runs played one after another from the admin page, and what they said kept
// as one report in plain text to download.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { LOADTEST, LoadTest } from "../server/loadtest.js";

// A load test whose runs are played here: each says its own arguments, after `each` (told the run)
function pretend(each = async () => {}) {
    const played = [];
    const test = new LoadTest({
        busy: () => ({ worlds: 1, players: 2 }),
        play: async (script, args, onChild) => {
            let killed = false;

            onChild({ kill: () => (killed = true) });
            played.push(args.map(String));
            await each(played.length);

            return { out: `played ${args.slice(0, 2).join(" ")}\n`, said: "", code: 0, killed };
        },
    });

    return { test, played };
}

describe("the server's own load test (server/loadtest.js)", () => {
    it("plays the load the repository has, with the plan's runs: the table's four, the gate, both, and a quick look", () => {
        const { test } = pretend();

        assert.ok(existsSync(test.script), test.script);
        assert.deepEqual(Object.keys(LOADTEST.kinds), ["quick", "table", "gate", "both"]);
        assert.deepEqual(LOADTEST.kinds.table.runs.map(({ args }) => args[1]), [8, 25, 50, 100]);
        assert.deepEqual(LOADTEST.kinds.gate.runs.map(({ args }) => args), [["--gate"]]);
        assert.equal(LOADTEST.kinds.both.runs.length, 5);
        assert.deepEqual(test.status(), { kinds: test.status().kinds, going: false, test: null, report: null });
        assert.deepEqual(test.status().kinds.map(({ id, runs }) => [id, runs]), [["quick", 1], ["table", 4], ["gate", 1], ["both", 5]]);
    });

    it("plays its runs one after another, each written to a file of its own, and reports them all with what the computer is", async () => {
        const { test, played } = pretend();
        const begun = test.start("table");

        assert.equal(begun.going, true);
        assert.equal(begun.test.runs, 4);
        assert.throws(() => test.start("quick"), /going already/);
        await test.done;

        const { going, report, test: last } = test.status();

        assert.equal(going, false);
        assert.deepEqual([last.run, last.runs, last.stopped, last.error], [4, 4, false, null]);
        assert.deepEqual(played.map((args) => args[1]), ["8", "25", "50", "100"]);
        assert.equal(new Set(played.map((args) => args.at(-1))).size, 4);
        assert.ok(played.every((args) => args.at(-2) === "--out"));
        assert.match(report.name, /^pellagos-load-\d{4}-\d\d-\d\d-\d\d-\d\d\.txt$/);

        for (const said of ["Pellagos load test report", "Test: The baseline table (table), 4 of 4 runs", "NET_VERSION", "cores", "Node v", "Worlds going on this server meanwhile: 1 with 2 players", "=== 1 of 4: 8 players spread, walking, 120 s, seed 2", "=== 4 of 4: 100 players spread", "played --players 100"]) {
            assert.ok(test.report.includes(said), said);
        }

        assert.equal(report.bytes, Buffer.byteLength(test.report));
    });

    it("stopped, ends the run going and plays no more, and reports what it had", async () => {
        let stop = null;
        const { test, played } = pretend((run) => (run === 2 ? stop() : null));

        stop = () => test.stop();
        test.start("both");
        await test.done;
        assert.equal(played.length, 2);
        assert.equal(test.status().test.stopped, true);
        assert.ok(test.report.includes("2 of 5 runs, stopped early"));
        assert.ok(test.report.includes("(Stopped before it ended.)"));
    });

    it("refuses a kind it hasn't, and says a run that went wrong", async () => {
        const test = new LoadTest({ play: async () => ({ out: "", said: "no world\n", code: 1, killed: false }) });

        assert.throws(() => test.start("everything"), /no load test called/);
        test.start("quick");
        await test.done;
        assert.ok(test.report.includes("(It said nothing.)"));
        assert.ok(test.report.includes("(It ended with 1: no world)"));
    });
});
