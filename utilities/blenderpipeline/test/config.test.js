// lib/config.js, lib/report.js's budgets and verdict, and blender/atlas.py (its own Python tests)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { blenderJob, DEFAULTS, profileConfigs, resolveConfig } from "../lib/config.js";
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
        refuses({ source: "a.blend", clips: { fps: 0 } }, /clips.fps is a number of times a second/);
        refuses({ source: "a.blend", clips: { fps: "30" } }, /clips.fps is a number of times a second/);
        refuses({ source: "a.blend", restPose: "" }, /restPose is the name of a clip/);
        refuses({ source: "a.blend", restPose: 0 }, /restPose is the name of a clip/);

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

        // (Sources and actions from other formats, joins, materials from textures, variants)
        refuses({ source: "a.obj" }, /source is a .blend, .fbx, .glb, .gltf, not "a.obj"/);
        refuses({ source: "a.fbx", actions: [{ from: "walk.glb" }] }, /actions\[0\].from is a .blend or an .fbx/);
        refuses({ source: "a.fbx", stripNamespaces: "yes" }, /stripNamespaces is true or false/);
        refuses({ source: "a.fbx", join: { Body: "Body" } }, /join.Body is a list of objects' names/);
        refuses({ source: "a.fbx", join: { Body: [] } }, /join.Body is a list of objects' names/);
        refuses({ source: "a.fbx", textures: { maxSize: 0 } }, /textures.maxSize is a size in pixels, or null/);
        refuses({ source: "a.fbx", textures: { atlasSize: null } }, /textures.atlasSize is a size in pixels/);

        const material = (spec) => ({ source: "a.fbx", materials: { skin: spec } });

        refuses(material({ colour: "a.png" }), /unknown setting materials.skin.colour/);
        refuses(material({ baseColor: { path: "a.png" } }), /unknown setting materials.skin.baseColor.path/);
        refuses(material({ baseColor: { channel: "R" } }), /materials.skin.baseColor.file \(the texture\) is needed/);
        refuses(material({ baseColor: { file: "a.png", channel: "R" } }), /materials.skin.baseColor is a colour: it has no channel to choose/);
        refuses(material({ roughness: { file: "a.png", channel: "X" } }), /materials.skin.roughness.channel is R, G, B or A/);
        refuses(material({ normal: { file: "a.png", invert: true } }), /materials.skin.normal can't be inverted/);
        refuses(material({ emission: { file: "a.png", scale: 0.5 } }), /materials.skin.emission can't be scaled/);
        refuses(material({ roughness: { file: "a.png", scale: 2 } }), /materials.skin.roughness.scale is a number from 0 to 1/);
        refuses(material({ roughness: { file: "a.png", flipGreen: true } }), /flipGreen is for a normal map/);
        refuses(material({ roughness: 2 }), /materials.skin.roughness is a texture, or a number from 0 to 1/);
        refuses(material({ normal: 1 }), /materials.skin.normal is a texture$/);
        refuses(material({ alpha: "cutout" }), /materials.skin.alpha is opaque, mask or blend/);
        refuses(material({ alphaMap: "a.png" }), /materials.skin.alphaMap needs alpha: mask or blend/);
        refuses(material({ emissionStrength: -1 }), /emissionStrength is a number, 0 or more/);
        refuses({ source: "a.fbx", variants: { Blue: { materials: { skin: { baseColor: "b.png" } } } } }, /variants.Blue: a variant's name is lower-case/);
        refuses({ source: "a.fbx", variants: { lod1: { materials: { skin: { baseColor: "b.png" } } } } }, /variants.lod1: .* not lod1/);
        refuses({ source: "a.fbx", variants: { blue: { materials: {} } } }, /variants.blue.materials: a variant gives at least one material/);
        refuses({ source: "a.fbx", variants: { blue: { textures: {} } } }, /unknown setting variants.blue.textures/);
        refuses({ source: "a.fbx", profiles: { phone: {} } }, /it has profiles: each is resolved on its own/);
    });

    it("makes materials' and variants' textures' paths absolute, and keeps how each is taken", () => {
        const config = resolveConfig(
            {
                source: "art/beast.fbx",
                materials: { skin: { baseColor: "tex/skin.png", roughness: { file: "tex/smooth.png", channel: "A", invert: true }, metallic: 0, alpha: "mask" } },
                variants: { pale: { materials: { skin: { baseColor: "tex/pale.png" } } } },
                join: { Body: ["Body", "Teeth*"] },
            },
            file,
        );
        const tex = (name) => path.join(HERE, "examples", "tex", name);

        assert.deepEqual(config.materials.skin, { baseColor: { file: tex("skin.png") }, roughness: { file: tex("smooth.png"), channel: "A", invert: true }, metallic: 0, alpha: "mask" });
        assert.deepEqual(config.variants.pale.materials.skin, { baseColor: { file: tex("pale.png") } });
        assert.deepEqual(config.join, { Body: ["Body", "Teeth*"] });
        assert.equal(config.stripNamespaces, true);
        assert.equal(config.profile, null);
    });

    it("builds each profile with its settings merged over the rest, into a folder of its own", () => {
        const raw = {
            source: "art/beast.fbx",
            textures: { format: "ktx2", ktx2: { quality: 200 } },
            budgets: { joints: 80 },
            profiles: {
                full: { textures: { maxSize: null, format: "png" }, compress: "none" },
                phone: { textures: { maxSize: 1024 }, lods: [{ ratio: 0.3 }], budgets: { triangles: 20000 } },
            },
        };
        const [full, phone] = profileConfigs(raw, file);

        assert.deepEqual([full.profile, phone.profile], ["full", "phone"]);
        assert.equal(full.out, path.join(HERE, "examples", "dist", "full"));
        assert.equal(phone.out, path.join(HERE, "examples", "dist", "phone"));
        assert.deepEqual([full.textures.maxSize, full.textures.format, full.compress, full.textures.ktx2.quality], [null, "png", "none", 200]);
        assert.deepEqual([phone.textures.maxSize, phone.textures.format, phone.compress, phone.textures.ktx2.quality], [1024, "ktx2", "meshopt", 200]);
        assert.deepEqual(phone.budgets, { joints: 80, triangles: 20000 });
        assert.deepEqual(full.lods, []);
        assert.deepEqual(phone.lods, [{ ratio: 0.3 }]);
        assert.deepEqual(
            profileConfigs(raw, file, { profile: "phone" }).map((config) => config.profile),
            ["phone"],
        );

        // (Without profiles: the one config, as it is)
        assert.deepEqual(
            profileConfigs({ source: "a.blend" }, file).map((config) => [config.profile, config.out]),
            [[null, path.join(HERE, "examples", "dist")]],
        );

        const refuses = (profiles, message, profile = null) => assert.throws(() => profileConfigs({ source: "a.fbx", profiles }, file, { profile }), message);

        refuses({ Phone: {} }, /profiles.Phone: a profile's name is lower-case/);
        refuses({ phone: { source: "b.fbx" } }, /profiles.phone.source: that's the asset's, not a profile's/);
        refuses({ phone: { out: "elsewhere" } }, /profiles.phone.out: that's the asset's/);
        refuses({ phone: { textures: { size: 5 } } }, /unknown setting profiles.phone.textures.size/);
        refuses({ phone: {} }, /it has no profile tablet \(it has phone\)/, "tablet");
        assert.throws(() => profileConfigs({ source: "a.blend" }, file, { profile: "phone" }), /it has no profiles \(asked for phone\)/);
    });

    it("gives Blender what it needs", () => {
        const config = resolveConfig({ source: "a.blend", clips: { inPlace: ["Walk"], exclude: ["T-Pose"] } }, file);
        const job = blenderJob(config, { out: "/tmp/a.glb", report: "/tmp/a.json" });

        assert.deepEqual(job.clips, { include: null, exclude: ["T-Pose"], rename: {} });
        assert.equal(job.source, config.source);
        assert.equal(job.passes, null);
        assert.equal(job.stripNamespaces, true);
        assert.deepEqual([job.join, job.materials, job.variants], [{}, {}, {}]);

        // (Each variant with the file its materials are written into)
        const looks = resolveConfig({ source: "a.fbx", variants: { pale: { materials: { skin: { baseColor: "pale.png" } } } } }, file);

        assert.equal(blenderJob(looks, { out: "/tmp/a.glb", report: "/tmp/a.json", variants: { pale: "/tmp/a.pale.glb" } }).variants.pale.out, "/tmp/a.pale.glb");
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
