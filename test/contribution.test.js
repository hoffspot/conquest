// contribution.md, how to set up, test and open a pull request, kept up to date with the
// pipeline: the standing rule (contribution.md, CLAUDE.md), the part of it a machine can check
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const guide = read("contribution.md");
const pkg = JSON.parse(read("package.json"));
const ci = read(".github/workflows/ci.yml");

// CI's jobs as ci.yml has them: their names, each one's part of the file, and the browser tests'
// jobs' numbers (the e2e job's matrix)
const jobsOf = ci.slice(ci.indexOf("\njobs:"));
const jobs = [...jobsOf.matchAll(/^ {2}([\w-]+):/gm)].map(([, name]) => name);
const job = (name) => jobsOf.split(/^(?= {2}[\w-]+:$)/m).find((part) => part.startsWith(`  ${name}:\n`));
const shards = ci
    .match(/shard: \[([\d, ]+)\]/)[1]
    .split(",")
    .map(Number);

describe("contribution.md kept up to date with the pipeline (the standing rule)", () => {
    it("has the standing rule, and so has CLAUDE.md, which Claude Code reads in every session", () => {
        assert.match(guide, /## The standing rule: keep this document current/);
        assert.match(guide, /contribution\.md is part of the development pipeline/);
        assert.match(read("CLAUDE.md"), /## Standing rule: keep contribution\.md current/);
    });

    it("tells of every npm script: add or rename one, and say what it's for there", () => {
        const missing = Object.keys(pkg.scripts).filter((name) => !guide.includes(name === "start" || name === "test" ? `npm ${name}` : `npm run ${name}`));

        assert.deepEqual(missing, [], `not in contribution.md: ${missing.join(", ")}`);
    });

    it("tells of every workflow, and of every job CI runs and how many of the browser tests' jobs", () => {
        const workflows = readdirSync(new URL("../.github/workflows/", import.meta.url)).filter((name) => name.endsWith(".yml"));

        assert.deepEqual(workflows.filter((name) => !guide.includes(`.github/workflows/${name}`)), []);
        assert.deepEqual(jobs.filter((name) => !guide.includes(`\`${name}\``)), []);
        assert.match(guide, new RegExp(`\\b${shards.length} \`e2e\``), `${shards.length} browser test jobs`);
    });

    it("says when CI runs: for pull requests and by hand, not for main again once one's merged, where Pages publishes without testing", () => {
        const on = ci.slice(ci.indexOf("\non:\n"), ci.indexOf("\nconcurrency:"));
        const pages = read(".github/workflows/pages.yml");

        assert.deepEqual(
            [...on.matchAll(/^ {2}(\w+):/gm)].map(([, event]) => event),
            ["pull_request", "workflow_dispatch"],
        );
        assert.match(guide, /\*\*CI doesn't run on `main` when a pull request is merged\.\*\*/);
        assert.match(guide, /`push: branches: \[main\]`\s+goes back into `ci\.yml` first/, "and what it rests on, should the ruleset change");

        assert.match(pages, /^ {2}push:\n {4}branches: \[main\]$/m);
        assert.doesNotMatch(pages, /npm (test|run (lint|check|test))/);
        assert.match(guide, /`\.github\/workflows\/pages\.yml` runs when `main` changes[^]*?It tests nothing/);
    });

    it("has a job, ci, that waits for every other job whatever becomes of them and passes only if each did", () => {
        const one = job("ci");
        const needs = one
            .match(/^ {4}needs: \[([^\]]+)\]$/m)[1]
            .split(",")
            .map((name) => name.trim());

        assert.deepEqual([...needs].sort(), jobs.filter((name) => name !== "ci").sort(), "every job CI runs is among its needs");

        // (Without always() a job whose needs failed is skipped, and a required check that's
        // skipped counts as passed)
        assert.match(one, /^ {4}if: \$\{\{ always\(\) \}\}$/m);
        assert.match(one, /NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
        assert.match(one, /jq -e 'all\(\.\[\]; \.result == "success"\)'/);
    });

    it("gives every share of the browser tests to one job: the e2e jobs' by their numbers, the motion check's and the unit tests' the last two", () => {
        const shares = Number(ci.match(/^ {2}E2E_SHARES: (\d+)$/m)[1]);
        const ahead = ci.match(/^ {2}E2E_AHEAD: "([^"]*)"$/m)[1];
        const numbered = (share) => (share === "last" ? shares : share === "last-1" ? shares - 1 : Number(share));
        const given = jobs.flatMap((name) => {
            const share = job(name).match(/^ {10}share: (.+)$/m)?.[1];

            return share === undefined ? [] : share === "${{ matrix.shard }}" ? shards : [numbered(share)];
        });

        assert.deepEqual(
            given.sort((a, b) => a - b),
            Array.from({ length: shares }, (_, k) => k + 1),
            `shares 1 to ${shares} (E2E_SHARES), each once`,
        );

        // (The work ahead is the two jobs' that take the last two shares; and the action that
        // runs a share knows them by those names)
        assert.deepEqual(
            ahead.split(",").map((part) => numbered(part.split(":")[0])),
            [shares - 1, shares],
        );
        assert.match(read(".github/actions/e2e-share/action.yml"), /s\/last-1\/\$\(\(SHARES - 1\)\)\/g" -e "s\/last\/\$SHARES\/g"/);
        assert.ok(guide.includes(`\`${ahead}\``), `E2E_AHEAD as ci.yml has it, ${ahead}`);
    });

    it("has the required checks in the settings table: ci alone, or, until the owner's made it so, every other job by its name", () => {
        const row = guide.match(/\| Require status checks to pass \|[^\n]*/)?.[0] ?? "";
        const required = [...(row.match(/Required checks, from GitHub Actions: ([^.|]*)/)?.[1] ?? "").matchAll(/`([^`]+)`/g)].map(([, name]) => name);

        assert.match(guide, /### The repository's settings/);
        assert.match(guide, /\*\*One required check\.\*\*/);
        assert.ok(required.length > 0, "the required checks, named");

        if (required.join() !== "ci") {
            // (As it was before ci: each job by its name, each browser test job by its number;
            // and the table says what's been asked of the owner)
            const each = shards.length;

            assert.deepEqual(jobs.filter((name) => name !== "e2e" && name !== "ci" && !required.includes(name)), [], "required checks");
            assert.ok(row.includes(`\`e2e (1 of ${each})\` to \`e2e (${each} of ${each})\``), `the ${each} browser test jobs required by name`);
            assert.match(row, /To become `ci` alone: asked of the owner on \d{4}-\d\d-\d\d/);
        }
    });

    it("has the Node version the game needs and CI uses", () => {
        const needs = pkg.engines.node.match(/>=\s*(\d+)/)[1];
        const uses = [...new Set([...read(".github/workflows/ci.yml").matchAll(/node-version: (\d+)/g), ...read(".github/workflows/pages.yml").matchAll(/node-version: (\d+)/g)].map(([, version]) => version))];

        assert.match(guide, new RegExp(`Node\\.js ${needs} or newer`));
        assert.deepEqual(uses.filter((version) => !guide.includes(`CI uses ${version}`)), []);
    });
});
