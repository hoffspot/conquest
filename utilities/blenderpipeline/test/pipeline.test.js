// The whole pipeline, Blender and all, on every example (examples/*.json): each builds, fit to use
// (no validator errors, every action there), into what dist/ has (byte for byte, built with the
// same Blender), and does what its config asks. And it says clearly what's wrong when it can't.
// Needs Blender: npm run setup (or BLENDER, BLENDER_PYTHON).
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { buildAsset } from "../build.js";
import { findBlender, HERE } from "../lib/blender.js";
import { loadConfig } from "../lib/config.js";
import { createIO } from "../lib/gltf.js";

const blender = findBlender();
const work = mkdtempSync(path.join(os.tmpdir(), "blenderpipeline-test-"));
const dist = path.join(HERE, "dist");
const examples = readdirSync(path.join(HERE, "examples"))
    .filter((file) => file.endsWith(".json"))
    .sort();
const built = new Map();

after(() => rmSync(work, { recursive: true, force: true }));

async function build(name) {
    if (!built.has(name)) {
        const config = loadConfig(path.join(HERE, "examples", `${name}.json`));

        built.set(name, buildAsset(config, { blender, out: path.join(work, name), log: () => {} }).then((result) => ({ ...result, out: path.join(work, name) })));
    }

    return built.get(name);
}

async function nodeNames(file) {
    const io = await createIO();
    const document = await io.read(file);

    return document
        .getRoot()
        .listNodes()
        .map((node) => node.getName());
}

const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

describe("every example builds into what dist/ has", () => {
    for (const file of examples) {
        const name = path.basename(file, ".json");

        it(name, async () => {
            const { report, ok, problems, out } = await build(name);
            const committed = JSON.parse(readFileSync(path.join(dist, `${name}.report.json`), "utf8"));

            assert.ok(ok, problems.join("; "));
            assert.equal(report.validation.beforeCompression.errors, 0);
            assert.equal(report.validation.final.errors, 0);

            // What it is: as committed
            for (const key of ["meshes", "materials", "textures", "clips", "bounds", "scale", "extensionsRequired", "budgets"]) {
                assert.deepEqual(report[key], committed[key], `${name}: its ${key} differ from dist/${name}.report.json (npm run build, and commit dist/)`);
            }

            // And, built with the Blender that built dist/, the very same files
            if (report.built.blender === committed.built.blender) {
                for (const glb of [`${name}.glb`, ...report.lods.map((lod) => path.basename(lod.file))]) {
                    assert.ok(readFileSync(path.join(out, glb)).equals(readFileSync(path.join(dist, glb))), `${glb} differs from dist/${glb} (npm run build, and commit dist/)`);
                }
            }
        });
    }

    it("has a report and a GLB in dist/ for every example, and nothing else", () => {
        const names = examples.map((file) => path.basename(file, ".json"));
        const expected = names.flatMap((name) => [`${name}.glb`, `${name}.report.json`, ...JSON.parse(readFileSync(path.join(dist, `${name}.report.json`), "utf8")).lods.map((lod) => path.basename(lod.file))]);

        assert.deepEqual(readdirSync(dist).filter((file) => !file.startsWith(".")).sort(), expected.sort());
    });
});

describe("what each example's config asks for", () => {
    it("dragon: four clips from four files, renamed; its control bones, their widgets and bones that move nothing left out; 9 m long; a lower-detail copy", async () => {
        const { report, out } = await build("dragon");
        const nodes = await nodeNames(path.join(out, "dragon.glb"));

        assert.deepEqual(report.clips.map((clip) => [clip.name, clip.from]), [
            ["Crawling", "animation-dragon-walk.blend"],
            ["Flying", "animation-dragon-fly-flap.blend"],
            ["Gliding", "animation-dragon-fly-glide.blend"],
            ["Idling", "animation-dragon-idle.blend"],
        ]);
        // (111 bones: 11 that don't deform; and DRV_root and 9 tips that are flagged to, but move nothing)
        assert.equal(report.exported.armature.bones, 111);
        const idle = ["DRV_root", "front_toes_tip_l", "front_toes_tip_r", "stomach_tip", ...[1, 2, 3].flatMap((i) => [`wing_feather_${i}_tip_l`, `wing_feather_${i}_tip_r`])];

        assert.equal(report.meshes.joints, 90);
        assert.deepEqual(nodes.filter((node) => /^(DRV_|shape_)/.test(node) || idle.includes(node)), []);
        assert.ok(report.notes.includes(`bones flagged to deform that move nothing, left out: ${idle.sort().join(", ")}`));

        // (A tip that moves vertices stays: the mouth's)
        assert.ok(nodes.includes("mouth_upper_tip"));
        assert.ok(near(report.bounds.rest.size[2], 9, 1e-3));
        assert.deepEqual(report.extensionsRequired, ["EXT_meshopt_compression", "EXT_texture_webp", "KHR_mesh_quantization"]);
        assert.equal(report.lods.length, 1);
        assert.ok(report.lods[0].triangles < report.meshes.triangles * 0.5);
    });

    it("horse: all thirteen clips, each from its own file, two renamed; a tip bone kept to attach things to", async () => {
        const { report, out } = await build("horse");
        const nodes = await nodeNames(path.join(out, "horse.glb"));

        assert.equal(report.clips.length, 13);
        assert.equal(new Set(report.clips.map((clip) => clip.from)).size, 13);
        assert.ok(report.clips.every((clip) => clip.seconds > 0));
        assert.equal(report.clips.find((clip) => clip.name === "Headbutt").from, "animation-horse-headbut.blend");
        assert.equal(report.clips.find((clip) => clip.name === "Get Up").from, "animation-horse-lay-to-idle.blend");
        assert.ok(nodes.includes("head_leaf"));
        assert.ok(!nodes.includes("tail_leaf"));
        assert.equal(report.meshes.joints, 53);
    });

    it("dragon-statue: no skeleton; stood on the ground, 3 m at its longest; quantized, not meshopt; a small JPEG", async () => {
        const { report } = await build("dragon-statue");

        assert.equal(report.meshes.skinned, false);
        assert.ok(near(Math.max(...report.bounds.rest.size), 3, 1e-3));
        assert.ok(near(report.bounds.rest.min[1], 0, 1e-3));
        assert.deepEqual(report.extensionsRequired, ["KHR_mesh_quantization"]);
        assert.deepEqual(
            report.textures.map((texture) => [texture.mimeType, texture.width]),
            [["image/jpeg", 256]],
        );
    });

    it("palette-crate: faces on points of a palette, which baking can't sample: its materials kept, not merged; one draw call all the same", async () => {
        const { report } = await build("palette-crate");

        assert.equal(report.exported.baking[0].baked, false);
        assert.ok(report.notes.includes("Crate's materials aren't merged: Wood, Iron map faces to points on their textures (a palette), which baking can't sample"));

        // (Wood and Iron are the same material once made glTF, and its two parts are joined)
        assert.equal(report.meshes.drawCalls, 1);
        assert.deepEqual(
            report.textures.map((texture) => [texture.width, texture.height]),
            [[2, 1]],
        );
    });

    it("udim-creature: UDIM tiles, a procedural horn and glowing eyes baked onto one atlas, one draw call", async () => {
        const { report } = await build("udim-creature");
        const baking = report.exported.baking[0];

        assert.equal(report.meshes.drawCalls, 1);
        assert.equal(report.materials.length, 1);
        assert.deepEqual(report.materials[0].textures, ["baseColor", "metallicRoughness", "normal", "occlusion", "emissive"]);
        assert.ok(report.textures.every((texture) => texture.width === 512 && texture.mimeType === "image/webp"));
        assert.ok(baking.baked);
        assert.ok(baking.reasons.some((reason) => /UDIM/.test(reason)));
        assert.ok(baking.reasons.some((reason) => /Horn.*VALTORGB|Horn.*TEX_NOISE|Horn.*BUMP/.test(reason)));
        assert.ok(baking.reasons.some((reason) => /3 materials/.test(reason)));
        assert.deepEqual(
            baking.groups.map((group) => group.tile),
            [1001, 1002, 1003, 1004, null, null],
        );
    });

    it("udim-creature: actions brought in, renamed and left out; travel taken out; nothing but the creature exported", async () => {
        const { report, out } = await build("udim-creature");
        const nodes = await nodeNames(path.join(out, "udim-creature.glb"));
        const crawl = report.clips.find((clip) => clip.name === "Crawl");

        assert.deepEqual(
            report.clips.map((clip) => clip.name),
            ["Crawl", "Idle", "Rearing", "Roaring"],
        );
        assert.equal(report.clips.find((clip) => clip.name === "Roaring").from, "udim-creature-extra.blend");

        // (1.5 m/s as made, scaled from 1.95 m long to 3)
        assert.equal(crawl.inPlace, true);
        assert.ok(near(crawl.rootMotion.speed, (1.5 * 3) / 1.95, 1e-3));
        assert.equal(crawl.loops, true);
        assert.equal(report.clips.find((clip) => clip.name === "Rearing").loops, false);

        for (const left of ["CTRL_look", "WGT_root", "Camera", "Light", "Collider"]) {
            assert.ok(!nodes.includes(left), `${left} exported`);
        }

        assert.deepEqual(nodes.sort(), ["Body", "Rig", "body", "chest", "head", "root", "tail"]);
        assert.ok(near(report.bounds.rest.size[2], 3, 1e-3));
        assert.ok(near(report.bounds.rest.min[1], 0, 1e-3));
    });

    it("udim-creature-split: the exporter's own UDIM split, a material a tile; a warning for the horn it can't carry", async () => {
        const { report } = await build("udim-creature-split");

        assert.equal(report.meshes.drawCalls, 6);
        assert.deepEqual(
            report.materials.map((material) => material.name),
            ["Skin.1001", "Skin.1002", "Skin.1003", "Skin.1004", "Horn", "Eye"],
        );
        assert.equal(report.exported.texturesOfOneColourMadeFactors, 4);
        assert.deepEqual(report.extensionsRequired, ["KHR_mesh_quantization"]);
        assert.ok(report.warnings.some((warning) => /Horn.*isn't baked/.test(warning)));
        assert.deepEqual(
            report.clips.map((clip) => clip.name),
            ["Idle"],
        );
    });
});

describe("saying what's wrong", () => {
    const fails = async (raw, message) => {
        const file = path.join(work, "broken.json");

        writeFileSync(file, JSON.stringify(raw));
        await assert.rejects(buildAsset(loadConfig(file), { blender, out: path.join(work, "broken"), log: () => {} }), message);
    };
    const fixture = path.join(HERE, "fixtures", "udim-creature", "udim-creature.blend");

    it("a .blend that isn't there", () => fails({ source: path.join(HERE, "nothing.blend") }, /no such file/));

    it("an action a file doesn't have", () => fails({ source: fixture, actions: [{ from: fixture.replace("creature.blend", "creature-extra.blend"), action: "Fly" }] }, /has no action Fly \(it has: Crawl, Idle, Look, Rear, Roar\)/));

    it("an action named in the file that's open", () => fails({ source: fixture, actions: [{ from: fixture, action: "Fly" }] }, /has no action Fly \(it has: Crawl, Idle, Look, Rear\)/));

    it("a clip renamed that isn't exported", () => fails({ source: fixture, clips: { rename: { Swim: "Swimming" } } }, /clips.rename names actions not exported: Swim/));

    it("two clips given one name", () => fails({ source: fixture, clips: { rename: { Rear: "Idle" } } }, /two clips would be called Idle/));

    it("a clip to play in place that isn't there", () => fails({ source: fixture, clips: { inPlace: ["Swim"] } }, /clips.inPlace names clips there aren't: Swim/));

    it("an object that isn't there", () => fails({ source: fixture, objects: ["Tail"] }, /no objects named Tail/));

    it("UDIM tiles neither baked nor split", () => fails({ source: fixture, textures: { bake: "never" } }, /has UDIM tiles: bake them/));
});
