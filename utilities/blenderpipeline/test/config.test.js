// lib/config.js, lib/report.js's budgets and verdict, and blender/atlas.py (its own Python tests)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { blenderJob, DEFAULTS, resolveConfig } from "../lib/config.js";
import { wildcard } from "../lib/optimize.js";
import { checkBudgets, judge } from "../lib/report.js";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(HERE, "examples", "test.json");

describe("an asset's config", () => {
    it("fills in the defaults, its name from its file, and its paths from where it is", () => {
        const config = resolveConfig({ source: "art/thing.blend", actions: [{ from: "art/more.blend" }] }, file);

        assert.equal(config.name, "test");
        assert.equal(config.source, path.join(HERE, "examples", "art", "thing.blend"));
        assert.equal(config.out, path.join(HERE, "examples", "dist"));
        assert.equal(config.actions[0].from, path.join(HERE, "examples", "art", "more.blend"));
        assert.deepEqual(config.textures, DEFAULTS.textures);
        assert.equal(config.compress, "meshopt");
    });

    it("keeps what's set, filling in the rest of a group of settings", () => {
        const config = resolveConfig({ source: "a.blend", textures: { atlasSize: 2048 }, clips: { rename: { Walk: "Crawling" } } }, file);

        assert.equal(config.textures.atlasSize, 2048);
        assert.equal(config.textures.format, "webp");
        assert.deepEqual(config.clips.rename, { Walk: "Crawling" });
        assert.deepEqual(config.clips.inPlace, []);
    });

    it("refuses what it doesn't know or can't do", () => {
        const refuses = (raw, message) => assert.throws(() => resolveConfig(raw, file), message);

        refuses({}, /`source`/);
        refuses({ source: "a.blend", sorce: 1 }, /unknown setting sorce/);
        refuses({ source: "a.blend", textures: { atlas: 512 } }, /unknown setting textures.atlas/);
        refuses({ source: "a.blend", textures: { bake: "sometimes" } }, /textures.bake/);
        refuses({ source: "a.blend", compress: "draco" }, /compress/);
        refuses({ source: "a.blend", size: { height: 2, length: 3 } }, /size/);
        refuses({ source: "a.blend", size: { depth: 2 } }, /size/);
        refuses({ source: "a.blend", budgets: { polygons: 5 } }, /budgets.polygons/);
        refuses({ source: "a.blend", lods: [{ ratio: 2 }] }, /lods\[0\].ratio/);
        refuses({ source: "a.blend", actions: [{ action: "Walk" }] }, /actions\[0\].from/);
        refuses({ source: "a.blend", clips: { inPlace: "Walk" } }, /inPlace/);
        refuses({ source: "a.blend", keepBones: "jaw" }, /keepBones/);
    });

    it("gives Blender what it needs", () => {
        const config = resolveConfig({ source: "a.blend", clips: { inPlace: ["Walk"], exclude: ["T-Pose"] } }, file);
        const job = blenderJob(config, { out: "/tmp/a.glb", report: "/tmp/a.json" });

        assert.deepEqual(job.clips, { include: null, exclude: ["T-Pose"], rename: {} });
        assert.equal(job.source, config.source);
        assert.equal(job.passes, null);
    });

    it("matches clip names with wildcards", () => {
        assert.ok(wildcard("Fly*", "Flying Left"));
        assert.ok(wildcard("Walk?", "Walk2"));
        assert.ok(!wildcard("Walk", "Walking"));
        assert.ok(wildcard("Roar (big)", "Roar (big)"));
    });
});

describe("budgets", () => {
    const glb = {
        bytes: 2048,
        triangles: 5000,
        vertices: 3000,
        joints: 60,
        drawCalls: 2,
        textures: [{ width: 2048, height: 1024, gpuBytes: 2048 * 1024 * 4 * (4 / 3) }],
        clips: [{ name: "Walk" }, { name: "Idle" }],
    };

    it("says which are kept and which aren't", () => {
        const checked = checkBudgets(glb, { triangles: 6000, drawCalls: 1, textureSize: 2048, textureMegabytes: 10, kilobytes: 1, clips: ["Walk", "Die"] });
        const ok = Object.fromEntries(checked.map((budget) => [budget.budget, budget.ok]));

        assert.deepEqual(ok, { triangles: true, drawCalls: false, textureSize: true, textureMegabytes: false, kilobytes: false, clips: false });
        assert.equal(checked.find((budget) => budget.budget === "clips").value, "missing Die");
        assert.equal(checked.find((budget) => budget.budget === "textureMegabytes").value, 10.67);
    });

    it("fails an asset over budget only when asked to be strict, and always one the validator fails", () => {
        const report = { validation: { beforeCompression: { errors: 0 }, final: { errors: 0 } }, warnings: [], budgets: [{ budget: "triangles", ok: false }] };

        assert.equal(judge(report).ok, true);
        assert.equal(judge(report, { strict: true }).ok, false);
        assert.equal(judge({ ...report, validation: { beforeCompression: { errors: 2 }, final: { errors: 0 } } }).ok, false);
        assert.equal(judge({ ...report, warnings: ["actions not in the GLB: Walk"] }).ok, false);
    });
});

describe("the atlas packer (blender/atlas.py)", () => {
    it("passes its own tests", () => {
        const python = process.platform === "win32" ? "python" : "python3";
        const run = spawnSync(python, [path.join(HERE, "blender", "test_atlas.py")], { encoding: "utf8" });

        assert.equal(run.status, 0, run.stderr || run.error?.message);
        assert.match(run.stderr, /OK/);
    });
});
