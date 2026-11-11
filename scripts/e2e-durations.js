// Keep how long each end-to-end test took, so CI's jobs can split them evenly
// (scripts/e2e-shard.js), from Playwright JSON reports:
//
//     npm run e2e:durations -- report-1.json report-2.json ...
//
// Each share of the tests CI runs leaves its report (the e2e-report-<share> artifacts: gh run
// download <run> -p 'e2e-report-*'); give it all of one run's. CI runs for pull requests alone, so
// the run is a pull request's, and it needn't be a green one. Or run the tests here with
// `--reporter=json` (PLAYWRIGHT_JSON_OUTPUT_NAME=report.json), one at a time (--workers=1) as CI
// runs them.
//
// A test that passed in the reports gets its time from them. One that didn't (failed, left out,
// or not in them) keeps the time it had: a test that ran out of time took its time limit, which
// says nothing of how long it takes. A time kept for a test that's no longer among the tests
// (taken out or renamed: `playwright test --list`) is dropped. e2e/durations.json is written in
// seconds.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DURATIONS, testsIn } from "./e2e-shard.js";

/**
 * The times kept (`durations`, seconds by test, as `testName` names them) brought up to date from
 * Playwright JSON reports (`reports`, each parsed) for the tests there are now (`names`):
 *
 * - a test that passed in a report is timed by its passing run there, to a tenth of a second;
 * - one that didn't pass (failed, out of time, left out) keeps the time it had, or still has none;
 * - a time for a test not among `names` is dropped, whether kept before or in the reports.
 *
 * Returns { durations: by name, in order; timed, unpassed, dropped, untimed: the names of those
 * given a time, in the reports without passing, dropped, and still with none }.
 */
export function retimed(durations, reports, names) {
    const there = new Set(names);
    const times = { ...durations };
    const timed = new Set();
    const unpassed = new Set();

    for (const report of reports) {
        for (const { name, spec } of testsIn(report)) {
            const passed = (spec.tests ?? []).flatMap((test) => test.results ?? []).find(({ status }) => status === "passed");

            if (passed) {
                times[name] = Math.round(passed.duration / 100) / 10;
                timed.add(name);
            } else {
                unpassed.add(name);
            }
        }
    }

    const kept = Object.entries(times)
        .filter(([name]) => there.has(name))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return {
        durations: Object.fromEntries(kept),
        timed: [...timed].filter((name) => there.has(name)),
        unpassed: [...unpassed].filter((name) => there.has(name) && !timed.has(name)),
        dropped: Object.keys(times).filter((name) => !there.has(name)),
        untimed: names.filter((name) => !(name in times)),
    };
}

/** The tests there are now, as Playwright lists them (no browser needed), by name. */
function listed() {
    // (Its list to standard output, even where a run's report is sent to a file, as CI's is)
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("PLAYWRIGHT_JSON_OUTPUT_")));
    const list = execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], { cwd: path.resolve(path.dirname(DURATIONS), ".."), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env });

    return testsIn(JSON.parse(list)).map(({ name }) => name);
}

// Run from the command line: the reports named, kept in e2e/durations.json
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const reports = process.argv.slice(2);

    if (!reports.length) {
        console.error("Usage: npm run e2e:durations -- <report.json>...");
        process.exit(1);
    }

    let durations = {};

    try {
        durations = JSON.parse(readFileSync(DURATIONS, "utf8"));
    } catch {
        // (None kept yet)
    }

    const result = retimed(
        durations,
        reports.map((file) => JSON.parse(readFileSync(file, "utf8"))),
        listed(),
    );

    writeFileSync(DURATIONS, `${JSON.stringify(result.durations, null, 4)}\n`);
    console.log(`${result.timed.length} tests timed; ${Object.keys(result.durations).length} kept in e2e/durations.json`);

    if (result.unpassed.length) {
        console.log(`${result.unpassed.length} didn't pass in the reports, and keep the time they had:\n${result.unpassed.map((name) => `    ${name}`).join("\n")}`);
    }

    if (result.dropped.length) {
        console.log(`${result.dropped.length} not among the tests any more (taken out or renamed), their times dropped:\n${result.dropped.map((name) => `    ${name}`).join("\n")}`);
    }

    if (result.untimed.length) {
        console.log(`${result.untimed.length} not timed yet (each counts for the median until it is):\n${result.untimed.map((name) => `    ${name}`).join("\n")}`);
    }
}
