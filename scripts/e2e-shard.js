// Which end-to-end tests one of CI's jobs runs, as a list for `playwright test --test-list`:
//
//     node scripts/e2e-shard.js <job> <jobs> [--ahead <job>:<minutes>,...] > share.txt
//
// The jobs run side by side, so the whole run takes as long as its slowest job. Playwright's own
// --shard gives each job as many tests, one after another as they're written, however long they
// take, so a job that gets the slow ones can take twice as long as another. Here each test counts
// for as long as it last took (e2e/durations.json, seconds: npm run e2e:durations), and the
// longest go first, each to the job with least to do so far; a test not timed yet counts for the
// median. Every job works out the same split, and between them they run every test once.
//
// A job with other work to do first (`--ahead`: CI's unit tests' and motion check's, so many
// minutes) counts as having done that much already, so it's given that much less of the tests,
// and all of them end about together.

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
 * longest first, each to the job with least to do so far (fewest seconds, then the first), a job
 * with other work first counting it (`ahead`: seconds, by job from 0). No job then takes over a
 * third longer than the best possible split would. Returns each job's names, in the order they're
 * written, how long they should take (`seconds`), and the job's work ahead of them (`ahead`).
 */
export function split(names, durations, jobs, { ahead = [] } = {}) {
    const known = names.map((name) => durations[name]).filter((seconds) => Number.isFinite(seconds)).sort((a, b) => a - b);
    const median = known.length ? known[Math.floor(known.length / 2)] : 1;
    const cost = (name) => (Number.isFinite(durations[name]) ? durations[name] : median);
    const shares = Array.from({ length: jobs }, (_, k) => ({ names: new Set(), seconds: 0, ahead: ahead[k] ?? 0 }));
    const longestFirst = [...names].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : a > b ? 1 : 0));

    for (const name of longestFirst) {
        const least = shares.reduce((best, share) => (share.ahead + share.seconds < best.ahead + best.seconds ? share : best));

        least.names.add(name);
        least.seconds += cost(name);
    }

    return shares.map((share) => ({ names: names.filter((name) => share.names.has(name)), seconds: share.seconds, ahead: share.ahead }));
}

/** The work ahead of each of `jobs` jobs, from `--ahead`'s `<job>:<minutes>,...` (jobs from 1): seconds, by job from 0. */
export function aheadOf(text, jobs) {
    const ahead = Array.from({ length: jobs }, () => 0);

    for (const part of (text ?? "").split(",").filter(Boolean)) {
        const [job, minutes] = part.split(":").map(Number);

        if (!(job >= 1 && job <= jobs && minutes >= 0)) {
            throw new Error(`--ahead ${part}: a job from 1 to ${jobs}, and how many minutes it has to do first`);
        }

        ahead[job - 1] = minutes * 60;
    }

    return ahead;
}

// Run from the command line: this job's share, a test to a line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const [job, jobs] = args.slice(0, 2).map(Number);
    const at = args.indexOf("--ahead");

    if (!(jobs >= 1 && job >= 1 && job <= jobs)) {
        console.error("Usage: node scripts/e2e-shard.js <job> <jobs> [--ahead <job>:<minutes>,...] (job counts from 1)");
        process.exit(1);
    }

    const ahead = aheadOf(at >= 0 ? args[at + 1] : "", jobs);
    const listed = JSON.parse(execFileSync("npx", ["playwright", "test", "--list", "--reporter=json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    const durations = existsSync(DURATIONS) ? JSON.parse(readFileSync(DURATIONS, "utf8")) : {};
    const shares = split(testsIn(listed).map(({ name }) => name), durations, jobs, { ahead });
    const minutes = (seconds) => Math.round(seconds / 60);

    console.error(`Job ${job} of ${jobs}: ${shares[job - 1].names.length} tests, about ${minutes(shares[job - 1].seconds)} min (the jobs: ${shares.map(({ seconds, ahead: first }) => (first ? `${minutes(first)} + ${minutes(seconds)}` : minutes(seconds))).join(", ")} min)`);
    console.log(shares[job - 1].names.join("\n"));
}
