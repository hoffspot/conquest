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

    it("fills in KTX2's settings as it does the others'", () => {
        const config = resolveConfig({ source: "a.blend", textures: { format: "ktx2", ktx2: { normal: "etc1s" } } }, file);

        assert.deepEqual(config.textures.ktx2, { ...DEFAULTS.textures.ktx2, normal: "etc1s" });
        assert.equal(config.packLods, false);
        assert.equal(config.simplify, null);
        assert.equal(config.clips.trimStill, false);
        assert.deepEqual(config.clips.invent, []);
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
        refuses({ source: "a.blend", textures: { format: "avif" } }, /textures.format/);
        refuses({ source: "a.blend", textures: { ktx2: { normal: "bc7" } } }, /textures.ktx2.normal/);
        refuses({ source: "a.blend", textures: { ktx2: { quality: 300 } } }, /textures.ktx2.quality/);
        refuses({ source: "a.blend", textures: { ktx2: { size: 512 } } }, /unknown setting textures.ktx2.size/);
        refuses({ source: "a.blend", packLods: "yes" }, /packLods/);
        refuses({ source: "a.blend", simplify: { ratio: 0 } }, /simplify.ratio/);
        refuses({ source: "a.blend", simplify: { share: 0.5 } }, /unknown setting simplify.share/);
        refuses({ source: "a.blend", clips: { trimStill: 1 } }, /trimStill/);

        // (Clips made up from others: lib/invent.js)
        const invent = (...layers) => ({ source: "a.blend", clips: { invent: [{ name: "Bite", from: "Idle", layers }] } });

        refuses({ source: "a.blend", clips: { invent: { name: "Bite" } } }, /clips.invent is a list/);
        refuses({ source: "a.blend", clips: { invent: [{ name: "Bite", layers: [] }] } }, /names the clip it makes \(name\) and the clip it's made from/);
        refuses({ source: "a.blend", clips: { invent: [{ name: "Bite", from: "Idle", layers: [], speed: 2 }] } }, /unknown setting clips.invent\[0\].speed/);
        refuses(invent({ bones: ["Neck"], turn: "nod", keys: [[0, 1]] }), /turn is pitch, yaw, roll, lift, not "nod"/);
        refuses(invent({ bones: ["Neck"], turn: "pitch", keys: [[1, 0], [0, 1]] }), /keys are in order of time/);
        refuses(invent({ bones: ["Neck", "Head"], turn: "pitch", keys: [[0, 1]], weights: [1] }), /weights has a weight for each bone/);
        refuses(invent({ bones: ["Neck"], turn: "pitch", move: [[0, [0, 0, 0]]] }), /turns bones \(turn\), moves one \(move\) or grafts/);
        refuses(invent({ bone: "Hip", move: [[0, [0, 1]]] }), /move is a list of \[seconds, value\] keys/);
        refuses(invent({ graft: "Glide", bones: ["Wing"], keys: [[0, 0], [1, 1.5]] }), /keys is a list of \[seconds, value\] keys/);
        refuses(invent({ bones: ["Wing"], turn: "lift", keys: [[0, 10]], axes: -1 }), /axes is a number of seconds/);
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
