// Keeping how long each end-to-end test took, from Playwright's reports (scripts/e2e-durations.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retimed } from "../scripts/e2e-durations.js";

/** A Playwright JSON report of one file's tests: each a title and its runs' [status, milliseconds]. */
const report = (file, tests) => ({
    suites: [{ title: file, file, specs: Object.entries(tests).map(([title, runs]) => ({ title, tests: [{ results: runs.map(([status, duration]) => ({ status, duration })) }] })) }],
});

describe("the end-to-end tests' times kept from reports (scripts/e2e-durations.js)", () => {
    it("times a test by its passing run, in seconds to a tenth, and keeps the others' as they were, in order", () => {
        const kept = { "b.spec.js › walks": 40, "a.spec.js › loads": 12.5 };
        const result = retimed(kept, [report("a.spec.js", { loads: [["passed", 20449]] })], ["a.spec.js › loads", "b.spec.js › walks"]);

        assert.deepEqual(result.durations, { "a.spec.js › loads": 20.4, "b.spec.js › walks": 40 });
        assert.deepEqual(Object.keys(result.durations), ["a.spec.js › loads", "b.spec.js › walks"]);
        assert.deepEqual(result.timed, ["a.spec.js › loads"]);
        assert.deepEqual([result.unpassed, result.dropped, result.untimed], [[], [], []]);

        // (What it was given is left as it was)
        assert.deepEqual(kept, { "b.spec.js › walks": 40, "a.spec.js › loads": 12.5 });
    });

    it("keeps the time a test had when it didn't pass: one out of time took its time limit, not how long it takes", () => {
        const names = ["a.spec.js › trades", "a.spec.js › rides", "a.spec.js › new and slow", "a.spec.js › left out", "a.spec.js › second try"];
        const result = retimed(
            { "a.spec.js › trades": 95.3, "a.spec.js › rides": 31, "a.spec.js › left out": 18 },
            [
                report("a.spec.js", {
                    "trades": [["timedOut", 240213]],
                    "rides": [["failed", 4100]],
                    "new and slow": [["timedOut", 180190]],
                    "left out": [["skipped", 0]],
                    "second try": [
                        ["failed", 9000],
                        ["passed", 52040],
                    ],
                }),
            ],
            names,
        );

        assert.deepEqual(result.durations, { "a.spec.js › left out": 18, "a.spec.js › rides": 31, "a.spec.js › second try": 52, "a.spec.js › trades": 95.3 });
        assert.deepEqual(result.timed, ["a.spec.js › second try"]);
        assert.deepEqual(result.unpassed, ["a.spec.js › trades", "a.spec.js › rides", "a.spec.js › new and slow", "a.spec.js › left out"]);
        assert.deepEqual(result.untimed, ["a.spec.js › new and slow"]);
    });

    it("takes a test's passing run from whichever report has one", () => {
        const result = retimed({}, [report("a.spec.js", { loads: [["passed", 30000]] }), report("a.spec.js", { loads: [["failed", 2000]] })], ["a.spec.js › loads"]);

        assert.deepEqual(result.durations, { "a.spec.js › loads": 30 });
        assert.deepEqual([result.timed, result.unpassed], [["a.spec.js › loads"], []]);
    });

    it("drops the time of a test that's no longer among the tests, kept before or in the reports", () => {
        const result = retimed(
            { "a.spec.js › loads": 12, "a.spec.js › renamed since": 60, "gone.spec.js › taken out": 33 },
            [report("a.spec.js", { "loads": [["passed", 14000]], "of another branch": [["passed", 5000]] })],
            ["a.spec.js › loads", "a.spec.js › renamed"],
        );

        assert.deepEqual(result.durations, { "a.spec.js › loads": 14 });
        assert.deepEqual(result.dropped.sort(), ["a.spec.js › of another branch", "a.spec.js › renamed since", "gone.spec.js › taken out"]);
        assert.deepEqual(result.timed, ["a.spec.js › loads"]);
        assert.deepEqual(result.untimed, ["a.spec.js › renamed"]);
    });
});
