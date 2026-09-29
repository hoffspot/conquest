// Which end-to-end tests one of CI's jobs runs, as a list for `playwright test --test-list`:
//
//     node scripts/e2e-shard.js <job> <jobs> > share.txt
//
// The jobs run side by side, so the whole run takes as long as its slowest job. Playwright's own
// --shard gives each job as many tests, one after another as they're written, however long they
// take, so a job that gets the slow ones can take twice as long as another. Here each test counts
// for as long as it last took (e2e/durations.json, seconds: npm run e2e:durations), and the
// longest go first, each to the job with least to do so far; a test not timed yet counts for the
// median. Every job works out the same split, and between them they run every test once.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the tests' times are kept, by test (as `testName` gives it). */
export const DURATIONS = path.join(root, "e2e/durations.json");

/** A test as `--test-list` takes it: its file (in e2e/) and titles, `›` between. */
export function testName(file, titles) {
    return [file, ...titles].join(" › ");
}

/** Every test in a Playwright JSON report (`--list --reporter=json`, or a run's), with its suite's. */
export function testsIn(report) {
    const names = [];
    const walk = (suite, file, titles) => {
        for (const spec of suite.specs ?? []) {
            names.push({ name: testName(file, [...titles, spec.title]), spec });
        }

        for (const inner of suite.suites ?? []) {
            walk(inner, file, [...titles, inner.title]);
        }
    };

    for (const suite of report.suites ?? []) {
        walk(suite, suite.file, []);
    }

    return names;
}

/**
 * Split tests (names) between `jobs` jobs by how long each takes (`durations`, seconds by name):
 * longest first, each to the job with least to do so far (fewest seconds, then the first). No job
 * then takes over a third longer than the best possible split would. Returns each job's names,
 * in the order they're written, and how long each job's should take.
 */
export function split(names, durations, jobs) {
    const known = names.map((name) => durations[name]).filter((seconds) => Number.isFinite(seconds)).sort((a, b) => a - b);
    const median = known.length ? known[Math.floor(known.length / 2)] : 1;
    const cost = (name) => (Number.isFinite(durations[name]) ? durations[name] : median);
    const shares = Array.from({ length: jobs }, () => ({ names: new Set(), seconds: 0 }));
    const longestFirst = [...names].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : a > b ? 1 : 0));

    for (const name of longestFirst) {
        const least = shares.reduce((best, share) => (share.seconds < best.seconds ? share : best));

        least.names.add(name);
        least.seconds += cost(name);
    }

    return shares.map((share) => ({ names: names.filter((name) => share.names.has(name)), seconds: share.seconds }));
}

// Run from the command line: this job's share, a test to a line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [job, jobs] = process.argv.slice(2).map(Number);

    if (!(jobs >= 1 && job >= 1 && job <= jobs)) {
        console.error("Usage: node scripts/e2e-shard.js <job> <jobs> (job counts from 1)");
        process.exit(1);
    }

    const listed = JSON.parse(execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    const durations = existsSync(DURATIONS) ? JSON.parse(readFileSync(DURATIONS, "utf8")) : {};
    const shares = split(testsIn(listed).map(({ name }) => name), durations, jobs);

    console.error(`Job ${job} of ${jobs}: ${shares[job - 1].names.length} tests, about ${Math.round(shares[job - 1].seconds / 60)} min (the jobs: ${shares.map(({ seconds }) => Math.round(seconds / 60)).join(", ")} min)`);
    console.log(shares[job - 1].names.join("\n"));
}
