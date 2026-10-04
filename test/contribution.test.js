// contribution.md, how to set up, test and open a pull request, kept up to date with the
// pipeline: the standing rule (contribution.md, CLAUDE.md), the part of it a machine can check
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const guide = read("contribution.md");
const pkg = JSON.parse(read("package.json"));
const ci = read(".github/workflows/ci.yml");

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
        const jobs = [...ci.slice(ci.indexOf("\njobs:")).matchAll(/^ {2}([\w-]+):/gm)].map(([, name]) => name);
        const shards = ci.match(/shard: \[([\d, ]+)\]/)[1].split(",").length;

        assert.deepEqual(workflows.filter((name) => !guide.includes(`.github/workflows/${name}`)), []);
        assert.deepEqual(jobs.filter((name) => !guide.includes(`\`${name}\``)), []);
        assert.match(guide, new RegExp(`\\b${shards} \`e2e\``), `${shards} browser test jobs`);
    });

    it("has the Node version the game needs and CI uses", () => {
        const needs = pkg.engines.node.match(/>=\s*(\d+)/)[1];
        const uses = [...new Set([...read(".github/workflows/ci.yml").matchAll(/node-version: (\d+)/g), ...read(".github/workflows/pages.yml").matchAll(/node-version: (\d+)/g)].map(([, version]) => version))];

        assert.match(guide, new RegExp(`Node\\.js ${needs} or newer`));
        assert.deepEqual(uses.filter((version) => !guide.includes(`CI uses ${version}`)), []);
    });
});
