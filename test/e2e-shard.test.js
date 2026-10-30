// Splitting the end-to-end tests between CI's jobs by how long each takes (scripts/e2e-shard.js)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { aheadOf, split, testName, testsIn } from "../scripts/e2e-shard.js";

describe("the end-to-end tests split between CI's jobs (scripts/e2e-shard.js)", () => {
    it("gives every test to one job, each job's as long as the others' as it can, the same every time", () => {
        // Two long tests written one after the other, and many short ones: by count, one job
        // would get both long ones
        const names = ["a.spec.js › one", "a.spec.js › two", ...Array.from({ length: 12 }, (_, k) => `b.spec.js › short ${k}`)];
        const durations = { "a.spec.js › one": 300, "a.spec.js › two": 280, ...Object.fromEntries(names.slice(2).map((name, k) => [name, 30 + k])) };
        const shares = split(names, durations, 3);
        const all = shares.flatMap((share) => share.names);
        const total = Object.values(durations).reduce((sum, seconds) => sum + seconds, 0);

        assert.equal(all.length, names.length);
        assert.deepEqual(new Set(all), new Set(names));
        assert.ok(shares.every(({ seconds }) => seconds <= (total / 3) * 1.1), `jobs of ${shares.map(({ seconds }) => seconds)} s`);
        assert.ok(!shares.some((share) => share.names.includes("a.spec.js › one") && share.names.includes("a.spec.js › two")));
        assert.deepEqual(split(names, durations, 3), shares);

        // (Each job's tests in the order they're written)
        for (const share of shares) {
            assert.deepEqual(share.names, names.filter((name) => share.names.includes(name)));
        }
    });

    it("gives a job with other work to do first that much less, so they all end about together", () => {
        // (Twenty-four tests of a minute each, between four jobs: the last with six minutes of
        // unit tests first, the third with two; eight minutes each in all)
        const names = Array.from({ length: 24 }, (_, k) => `c.spec.js › test ${String(k).padStart(2, "0")}`);
        const durations = Object.fromEntries(names.map((name) => [name, 60]));
        const shares = split(names, durations, 4, { ahead: aheadOf("4:6,3:2", 4) });

        assert.deepEqual(
            shares.map(({ names: each }) => each.length),
            [8, 8, 6, 2],
        );
        assert.deepEqual(
            shares.map(({ ahead }) => ahead),
            [0, 0, 120, 360],
        );
        assert.deepEqual(new Set(shares.flatMap(({ names: each }) => each)), new Set(names));
        assert.ok(Math.max(...shares.map(({ seconds, ahead }) => seconds + ahead)) - Math.min(...shares.map(({ seconds, ahead }) => seconds + ahead)) <= 60, "ending together, to a test");

        // (None ahead, as before)
        assert.deepEqual(aheadOf("", 3), [0, 0, 0]);
        assert.throws(() => aheadOf("5:10", 4), /a job from 1 to 4/);
    });

    it("counts a test not timed yet as the median", () => {
        const shares = split(["x › timed 1", "x › timed 2", "x › timed 3", "x › new"], { "x › timed 1": 10, "x › timed 2": 20, "x › timed 3": 90 }, 2);

        assert.deepEqual(
            shares.map(({ seconds }) => seconds),
            [90, 50],
        );
    });

    it("names the tests as --test-list takes them, from a Playwright JSON report, and has a time for each", () => {
        const report = {
            suites: [
                {
                    title: "game.spec.js",
                    file: "game.spec.js",
                    specs: [{ title: "loads" }],
                    suites: [{ title: "on a phone", specs: [{ title: "fits the screen" }] }],
                },
            ],
        };

        assert.deepEqual(
            testsIn(report).map(({ name }) => name),
            ["game.spec.js › loads", "game.spec.js › on a phone › fits the screen"],
        );
        assert.equal(testName("a.spec.js", ["b", "c"]), "a.spec.js › b › c");

        // (The times kept are for tests by those names: every one a number of seconds)
        const durations = JSON.parse(readFileSync(new URL("../e2e/durations.json", import.meta.url), "utf8"));

        assert.ok(Object.keys(durations).length > 0);
        assert.ok(Object.entries(durations).every(([name, seconds]) => /\.spec\.js › /.test(name) && seconds > 0));
    });
});
