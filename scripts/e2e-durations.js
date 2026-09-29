// Keep how long each end-to-end test took, so CI's jobs can split them evenly
// (scripts/e2e-shard.js), from Playwright JSON reports:
//
//     npm run e2e:durations -- report-1.json report-2.json ...
//
// Each of CI's e2e jobs leaves its report (the e2e-report-<job> artifacts); give it all of one
// run's. Or run the tests here with `--reporter=json` (PLAYWRIGHT_JSON_OUTPUT_NAME=report.json),
// one at a time (--workers=1) as CI runs them. A test in the reports gets its time from them (its
// passing run, or its last); the others keep theirs; e2e/durations.json is written in seconds.

import { readFileSync, writeFileSync } from "node:fs";
import { DURATIONS, testsIn } from "./e2e-shard.js";

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

let timed = 0;

for (const file of reports) {
    for (const { name, spec } of testsIn(JSON.parse(readFileSync(file, "utf8")))) {
        const results = spec.tests.flatMap((test) => test.results ?? []);
        const result = results.find(({ status }) => status === "passed") ?? results.at(-1);

        if (result) {
            durations[name] = Math.round(result.duration / 100) / 10;
            timed++;
        }
    }
}

const sorted = Object.fromEntries(Object.entries(durations).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

writeFileSync(DURATIONS, `${JSON.stringify(sorted, null, 4)}\n`);
console.log(`${timed} tests timed; ${Object.keys(sorted).length} kept in e2e/durations.json`);
