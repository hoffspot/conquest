// The whole pipeline, Blender and all, on every example (examples/*.json), each of its profiles
// too: each builds, fit to use (no validator errors, every action there), into what dist/ has
// (byte for byte, built with the same Blender), and does what its config asks. And it says
// clearly what's wrong when it can't. Needs Blender: npm run setup (or BLENDER, BLENDER_PYTHON).
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { buildAsset } from "../build.js";
import { findBlender, HERE } from "../lib/blender.js";
import { loadConfig, loadConfigs } from "../lib/config.js";
import { createIO } from "../lib/gltf.js";
import { decodeImage } from "../lib/ktx2.js";

const blender = findBlender();
const work = mkdtempSync(path.join(os.tmpdir(), "blenderpipeline-test-"));
const dist = path.join(HERE, "dist");
const examples = readdirSync(path.join(HERE, "examples"))
    .filter((file) => file.endsWith(".json"))
    .sort();
const built = new Map();

after(() => rmSync(work, { recursive: true, force: true }));

// (Each example's configs: one, or one for each of its profiles)
const configs = examples.flatMap((file) => loadConfigs(path.join(HERE, "examples", file)));

async function build(name, profile = null) {
    const key = `${name}/${profile ?? ""}`;

    if (!built.has(key)) {
        const config = loadConfig(path.join(HERE, "examples", `${name}.json`), { profile });
        const out = path.join(work, name, profile ?? "");

        built.set(key, buildAsset(config, { blender, out, log: () => {} }).then((result) => ({ ...result, out })));
    }

    return built.get(key);
}

// The files a built example has: its GLB, its report, its lower-detail files and its variants
const filesOf = (report) => [`${report.name}.glb`, `${report.name}.report.json`, ...report.lods.filter((lod) => !lod.packed).map((lod) => path.basename(lod.file)), ...(report.variants ?? []).map((variant) => path.basename(variant.glb))];

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
    for (const config of configs) {
        const { name, profile } = config;
        // (dist/, or dist/<profile>/)
        const committedIn = path.join(dist, profile ?? "");
        const where = path.join("dist", profile ?? "", `${name}.report.json`);

        it(profile ? `${name} (${profile})` : name, async () => {
            const { report, ok, problems, out } = await build(name, profile);
            const committed = JSON.parse(readFileSync(path.join(committedIn, `${name}.report.json`), "utf8"));

            assert.ok(ok, problems.join("; "));
            assert.equal(report.validation.beforeCompression.errors, 0);
            assert.equal(report.validation.final.errors, 0);

            // What it is: as committed
            for (const key of ["meshes", "materials", "textures", "clips", "bounds", "scale", "extensionsRequired", "budgets"]) {
                assert.deepEqual(report[key], committed[key], `${name}: its ${key} differ from ${where} (npm run build, and commit dist/)`);
            }

            // (Its variants as committed, but for where they were written)
            const looks = (variants) => (variants ?? []).map(({ glb, ...look }) => ({ ...look, glb: path.basename(glb) }));

            assert.deepEqual(looks(report.variants), looks(committed.variants), `${name}: its variants differ from ${where} (npm run build, and commit dist/)`);

            // And, built with the Blender that built dist/, the very same files
            if (report.built.blender === committed.built.blender) {
                for (const glb of filesOf(report).filter((file) => file.endsWith(".glb"))) {
                    assert.ok(readFileSync(path.join(out, glb)).equals(readFileSync(path.join(committedIn, glb))), `${glb} differs from ${path.join("dist", profile ?? "", glb)} (npm run build, and commit dist/)`);
                }
            }
        });
    }

    it("has a report and a GLB in dist/ for every example (and each of its profiles, in a folder of its own), and nothing else", () => {
        const folders = [...new Set(configs.map((config) => config.profile ?? ""))];

        for (const folder of folders) {
            const expected = configs.filter((config) => (config.profile ?? "") === folder).flatMap((config) => filesOf(JSON.parse(readFileSync(path.join(dist, folder, `${config.name}.report.json`), "utf8"))));
            const there = readdirSync(path.join(dist, folder), { withFileTypes: true })
                .filter((entry) => !entry.name.startsWith(".") && !(folder === "" && entry.isDirectory() && folders.includes(entry.name)))
                .map((entry) => entry.name);

            assert.deepEqual(there.sort(), expected.sort(), `dist/${folder}`);
        }
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

describe("an asset from FBX files, as a bought one comes (fbx-creature), built for keeping and for play", () => {
    const pixel = (image, x, y) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
    const close = (a, b) => a.every((value, i) => Math.abs(value - b[i]) <= 1);

    async function material(file, name) {
        const io = await createIO();
        const document = await io.read(file);

        return { root: document.getRoot(), material: document.getRoot().listMaterials().find((one) => one.getName() === name) };
    }

    it("full: its namespaces off, the rig's control object and its clip left out, a clip from another FBX, objects joined", async () => {
        const { report, out } = await build("fbx-creature", "full");
        const nodes = await nodeNames(path.join(out, "fbx-creature.glb"));

        assert.equal(report.built.sourceFormat, "fbx");
        assert.deepEqual(nodes.sort(), ["Body", "Fur", "Mane", "head", "hips", "rig", "spine"]);
        assert.deepEqual(
            report.clips.map((clip) => [clip.name, clip.from]),
            [
                ["Idle", null],
                ["Wave", "creature@wave.fbx"],
            ],
        );
        assert.ok(report.notes.includes("actions not exported: Ctrl_Hips|Scene (animates no bone)"));
        assert.deepEqual(report.exported.joined, [
            { name: "Body", objects: ["Body", "Teeth"] },
            { name: "Fur", objects: ["FurBack"] },
            { name: "Mane", objects: ["FurMane"] },
        ]);
        assert.equal(report.meshes.drawCalls, 3);
    });

    it("full: its materials made from its texture files, kept at their own size, lossless and uncompressed", async () => {
        const { report, out } = await build("fbx-creature", "full");
        const { material: skin } = await material(path.join(out, "fbx-creature.glb"), "skin");
        const { material: fur } = await material(path.join(out, "fbx-creature.glb"), "fur");

        assert.deepEqual(
            report.materials.map(({ name, alphaMode, doubleSided, textures }) => [name, alphaMode, doubleSided, textures]),
            [
                ["skin", "OPAQUE", false, ["baseColor", "metallicRoughness", "normal", "occlusion", "emissive"]],
                ["fur", "MASK", true, ["baseColor"]],
            ],
        );
        assert.deepEqual(
            report.textures.map((texture) => [texture.mimeType, texture.width, texture.height]),
            [...Array(4).fill(["image/png", 128, 128]), ["image/png", 128, 64]],
        );
        assert.equal(report.compression, "none");
        assert.deepEqual(report.extensionsRequired, []);
        assert.ok(report.extensionsUsed.includes("KHR_materials_emissive_strength"));

        // Occlusion in red, roughness in green (the smoothness in the alpha of its file, scaled and
        // inverted, as Unity's is: 1 - smoothness x 0.8), no metal in blue: one texture for the
        // three, as glTF has them
        assert.equal(skin.getMetallicRoughnessTexture(), skin.getOcclusionTexture());
        const orm = decodeImage(skin.getMetallicRoughnessTexture().getImage(), "image/png");

        assert.ok(close(pixel(orm, 0, 0).slice(0, 3), [255, 131, 0]), JSON.stringify(pixel(orm, 0, 0)));
        assert.ok(close(pixel(orm, 127, 127).slice(0, 3), [255 - 63, 233, 0]), JSON.stringify(pixel(orm, 127, 127)));

        // The fur's strands, and the gaps between them
        const strands = decodeImage(fur.getBaseColorTexture().getImage(), "image/png");

        assert.equal(pixel(strands, 0, 0)[3], 255);
        assert.equal(pixel(strands, 4, 0)[3], 0);
    });

    it("full: a variant, with its own colour for the skin and nothing else: no meshes, skeleton or clips", async () => {
        const { report, out } = await build("fbx-creature", "full");
        const { root, material: skin } = await material(path.join(out, "fbx-creature.blue.glb"), "skin");

        assert.deepEqual([root.listMeshes().length, root.listNodes().length, root.listSkins().length, root.listAnimations().length], [0, 0, 0, 0]);
        // (Nor the model's geometry or keyframes: nothing in the file but its texture)
        assert.equal(root.listAccessors().length, 0);
        assert.ok(report.variants[0].kilobytes < report.variants[0].textures[0].kilobytes + 4, `${report.variants[0].kilobytes} KB, its texture ${report.variants[0].textures[0].kilobytes} KB`);
        assert.deepEqual(
            root.listMaterials().map((one) => one.getName()),
            ["skin"],
        );
        assert.deepEqual(
            report.variants.map(({ name, materials }) => [name, materials]),
            [["blue", [{ name: "skin", textures: ["baseColor"] }]]],
        );
        assert.deepEqual(pixel(decodeImage(skin.getBaseColorTexture().getImage(), "image/png"), 0, 0).slice(0, 3), [60, 70, 150]);
    });

    it("phone: the same, made for play on a phone: 64-pixel KTX2 textures, compressed, a lower detail packed in, within its budgets; its variant's texture as small", async () => {
        const { report } = await build("fbx-creature", "phone");

        assert.equal(report.profile, "phone");
        assert.ok(report.textures.every((texture) => texture.mimeType === "image/ktx2" && Math.max(texture.width, texture.height) === 64));
        assert.deepEqual(report.extensionsRequired, ["EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_texture_basisu"]);
        assert.equal(report.lods[0].packed, true);
        assert.ok(report.budgets.length && report.budgets.every((budget) => budget.ok));
        assert.deepEqual(
            report.variants[0].textures.map((texture) => [texture.mimeType, texture.width]),
            [["image/ktx2", 64]],
        );
        assert.ok(report.variants[0].kilobytes < report.variants[0].textures[0].kilobytes + 4, `its variant: ${report.variants[0].kilobytes} KB, its texture ${report.variants[0].textures[0].kilobytes} KB`);
        assert.deepEqual(
            report.clips.map((clip) => clip.name),
            ["Idle", "Wave"],
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

    const creature = path.join(HERE, "fixtures", "fbx-creature", "creature.fbx");
    const colour = path.join(HERE, "fixtures", "fbx-creature", "textures", "skin_colour.png");

    it("a material to make that isn't there", () => fails({ source: creature, materials: { leather: { baseColor: colour } } }, /materials.leather: there's no material called leather \(there are: fur, skin\)/));

    it("a texture that isn't there", () => fails({ source: creature, materials: { skin: { baseColor: path.join(HERE, "nothing.png") } } }, /no such texture: .*nothing\.png/));

    it("objects to join that aren't there", () => fails({ source: creature, join: { Body: ["Body", "Tail"] } }, /join.Body: no mesh exported is called Tail/));

    it("a variant for a material no mesh has", () => fails({ source: creature, materials: { skin: { baseColor: colour }, fur: { baseColor: colour } }, variants: { red: { materials: { leather: { baseColor: colour } } } } }, /variants.red: no mesh exported has the material leather/));
});
