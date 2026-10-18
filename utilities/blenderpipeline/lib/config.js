// An asset's config (examples/*.json, README.md): what's built from what, and how. Paths in it
// are relative to the config file. Anything left out takes its default here; a key that isn't
// known is an error, so a misspelt one isn't silently ignored.

import { readFileSync } from "node:fs";
import path from "node:path";
import { checkInvented } from "./invent.js";

export const DEFAULTS = Object.freeze({
    // What it's called (the files written: <name>.glb, <name>.report.json); the config file's name
    name: null,
    // What to build from: a .blend, or an .fbx, .glb or .gltf (imported into an empty scene)
    source: null,
    // Maya's (and others') "namespace:" taken off the names of objects, bones, materials, images and
    // actions, in the source and in the actions brought in
    stripNamespaces: true,
    // Where to write, relative to the config file
    out: "dist",
    // What to export: these objects, or this collection; by default every mesh shown and
    // rendered in the scene, and the armature deforming them
    objects: null,
    collection: null,
    scene: null,
    // Actions to bring in from other files: [{ from, action?, name?, bonesOnly? }]: a .blend's, by
    // name, or an .fbx's, the one moving its skeleton (the objects it brings are left behind);
    // `bonesOnly`, its bones' keys alone, not the keys of the object it was on (where an importer put
    // the skeleton it came with, at that skeleton's scale)
    actions: [],
    // The exported armature's bone constraints muted: a game skeleton made to copy a control rig
    // (Auto-Rig Pro's, Rigify's) holds still otherwise, whatever its clips say
    muteConstraints: false,
    // Morph targets (shape keys) kept: true, all of them; or a list of their names ([]: none)
    morphs: true,
    // Vertices a bone moves given to another to move: { "bone": "bone" } (a bone that only a
    // control rig moved, left behind in the game as the rest goes on)
    reweight: {},
    // Clips from other skeletons' files, played on this one's bones of the same names
    // (lib/retarget.js): [{ from (a .glb or .gltf), clips: { "its clip": "name here" } or [names],
    // bones?: { "bone here": "its bone" or null }, unaligned?: [bones laid as they rest, * and ?
    // wildcards], fps? (keyframes a second: 30) }]
    retarget: [],
    // Objects joined into one mesh each before they're exported: { "new name": ["object", "Fur*"] }
    // (one draw call for each material in it; a group kept apart can be shown or hidden alone)
    join: {},
    // Materials made from texture files, in place of those in the source by these names:
    // { "material": { baseColor, alpha, alphaMap, normal, occlusion, roughness, metallic,
    // emission, emissionStrength, doubleSided } } (README.md, *Materials from textures*)
    materials: {},
    // Other looks: { "variant": { materials: { "material": { ...as in materials } } } }, each
    // written as <name>.<variant>.glb with only its materials, and in them only the textures it
    // gives (the game puts them on the model in place of the main file's)
    variants: {},
    // Ways to build it, each into a folder of its own (<out>/<profile>/): { "profile": { ...any of
    // these settings, merged over the rest } }, e.g. "full" (as it is) and "phone" (for play)
    profiles: {},
    // Which of the armature's actions are exported (`include`, `exclude`: names, * and ?
    // wildcards), and what they're called (`rename`: { "Blender name": "clip name" }); clips to
    // play in place (`inPlace`: names or true, their travel taken out of `rootBone`, by default
    // the topmost bone that moves); `trimStill`: channels that never move a bone from where it
    // stands at rest left out (a clip only says what moves); `fps`: how many keyframes a second
    // the clips keep (a 60-frame source's at 30, half of them, and always each clip's last; null,
    // every frame); and `invent`: clips made up from those there are (lib/invent.js)
    clips: { include: null, exclude: [], rename: {}, inPlace: [], rootBone: null, trimStill: false, fps: null, invent: [] },
    // Only the bones that deform the mesh: no control bones, IK targets or widgets, and no bones
    // flagged to deform that move no vertex and carry none that do (the tips of chains)...
    deformBonesOnly: true,
    // ...but these (names, * and ? wildcards): points to attach things to, say
    keepBones: [],
    applyModifiers: true,
    textures: {
        // "auto": bake materials glTF can't carry (UDIM tiles, procedural or mixed shaders, more
        // than one on a mesh) onto one atlas; "always"; "never"
        bake: "auto",
        // UDIM tiles: "atlas" (baked onto one texture) or "split" (the exporter's way: a material
        // and textures for each tile)
        udim: "atlas",
        // Several materials on one mesh baked into one (one draw call)
        mergeMaterials: true,
        // The atlas's largest size, and the largest any other texture is kept at (pixels; null: as
        // it is)
        atlasSize: 1024,
        maxSize: 1024,
        // "webp" (EXT_texture_webp), "jpeg", "png" or "ktx2" (KHR_texture_basisu: kept compressed
        // on the GPU, lib/ktx2.js); and the quality of WebP and JPEG (0 to 100)
        format: "webp",
        quality: 90,
        // For "ktx2": each kind of map "etc1s" (small, blockier) or "uastc" (sharper, larger);
        // ETC1S's quality (1 to 255); and the largest a normal map's kept at (pixels; null: as the rest)
        ktx2: { color: "etc1s", data: "etc1s", normal: "uastc", quality: 128, normalSize: null },
        // Bake ambient occlusion into the atlas (Cycles, this many samples)
        ao: false,
        aoSamples: 32,
        // Pixels per UV unit for a procedural texture's share of the atlas
        proceduralSize: 512,
        // Pixels baked round each UV island, so its edges don't bleed when mipmapped
        margin: 4,
    },
    // A clip whose first frame is taken as the rest pose (by its name as exported), for a source
    // whose skeleton rests where its clips never have it: measured, turned and moved as they show it
    restPose: null,
    // Its size in metres: { height | length | width | longest: metres } or { scale: factor }
    size: null,
    // Turned about the vertical (degrees, counterclockwise from above), so it faces +z
    turn: 0,
    // "feet": moved so it stands on the origin (its lowest point at y = 0, centred across);
    // "keep": where it was in Blender
    origin: "keep",
    // "meshopt" (EXT_meshopt_compression: needs MeshoptDecoder in Three.js), "quantize"
    // (KHR_mesh_quantization: Three.js reads it as it is) or "none"
    compress: "meshopt",
    // How far a resampled animation may stray from its keyframes (glTF-Transform's resample)
    resample: 1e-4,
    // Material extensions the game doesn't draw (transmission, sheen, clearcoat...) left out
    stripMaterialExtensions: true,
    // Lower-detail copies: [{ ratio (of vertices kept), error (fraction of its size) }]
    lods: [],
    // The full mesh itself simplified ({ ratio, error }, as a lower-detail copy's), when even it
    // is more than the game wants; the lower-detail copies' ratios stay shares of what Blender gave
    simplify: null,
    // The lower-detail copies in the one GLB, beside the full one, sharing its skeleton,
    // materials, textures and clips (each a mesh of its own: "<mesh>.lod1"..., extras.lod 1...),
    // rather than files of their own each carrying all of it again
    packLods: false,
    // Limits it's checked against: triangles, vertices, joints, drawCalls, textureSize,
    // textureMegabytes (on the GPU, with mipmaps), kilobytes (the GLB), clips (names it must have)
    budgets: {},
});

const TEXTURE_CHOICES = { bake: ["auto", "always", "never"], udim: ["atlas", "split"], format: ["webp", "jpeg", "png", "ktx2"] };
const SOURCES = [".blend", ".fbx", ".glb", ".gltf"];
// A variant's or a profile's name: in file and folder names
const NAME = /^[a-z0-9][a-z0-9-]*$/;
// What a material from texture files is made of, and how a texture's given ({ file, channel,
// scale, invert, flipGreen } or just its file)
const MATERIAL_KEYS = { baseColor: 0, alpha: 0, alphaMap: 0, normal: 0, occlusion: 0, roughness: 0, metallic: 0, emission: 0, emissionStrength: 0, doubleSided: 0 };
const MAPS = { baseColor: "colour", alphaMap: "grey", normal: "normal", occlusion: "grey", roughness: "grey", metallic: "grey", emission: "colour" };
const MAP_KEYS = { file: 0, channel: 0, scale: 0, invert: 0, flipGreen: 0 };
const KTX2_MODES = ["etc1s", "uastc"];
const SIZES = ["height", "length", "width", "longest", "scale"];
const BUDGETS = ["triangles", "vertices", "joints", "drawCalls", "textureSize", "textureMegabytes", "kilobytes", "clips"];

/**
 * Reads an asset's config file and fills in its defaults, its paths made absolute: one with
 * profiles, as `profile` builds it (loadConfigs for all of them).
 */
export function loadConfig(file, { profile = null } = {}) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const configs = profileConfigs(raw, file, { profile });

    if (configs.length > 1) {
        throw new Error(`${path.basename(file)}: it has profiles (${configs.map((config) => config.profile).join(", ")}): choose one, or build them all (loadConfigs)`);
    }

    return configs[0];
}

/** An asset's configs: one for each profile (`profile`: that one only), or the one it is. */
export function loadConfigs(file, { profile = null } = {}) {
    return profileConfigs(JSON.parse(readFileSync(file, "utf8")), file, { profile });
}

/**
 * The configs a raw config makes: each profile's settings merged over the rest, built into
 * <out>/<profile>/; or itself, if it has none.
 */
export function profileConfigs(raw, file, { profile = null } = {}) {
    const fail = (message) => {
        throw new Error(`${path.basename(file)}: ${message}`);
    };
    const { profiles = {}, ...base } = raw ?? {};

    if (profiles === null || typeof profiles !== "object" || Array.isArray(profiles)) {
        fail('profiles is { "profile": { ...settings } }');
    }

    const names = Object.keys(profiles);

    if (!names.length) {
        if (profile) {
            fail(`it has no profiles (asked for ${profile})`);
        }

        return [resolveConfig(base, file)];
    }

    if (profile && !names.includes(profile)) {
        fail(`it has no profile ${profile} (it has ${names.join(", ")})`);
    }

    return names
        .filter((name) => !profile || name === profile)
        .map((name) => {
            if (!NAME.test(name)) {
                fail(`profiles.${name}: a profile's name is lower-case letters, digits and dashes`);
            }

            unknownKeys(profiles[name], DEFAULTS, `profiles.${name}.`, fail);

            for (const key of ["profiles", "name", "source", "out"]) {
                if (key in profiles[name]) {
                    fail(`profiles.${name}.${key}: that's the asset's, not a profile's`);
                }
            }

            const config = resolveConfig(merge(base, profiles[name]), file);

            config.profile = name;
            config.out = path.join(config.out, name);

            return config;
        });
}

// Settings merged: objects key by key, all the way down; anything else (a list, a number) replaced
function merge(base, over) {
    const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

    if (!plain(base) || !plain(over)) {
        return structuredClone(over);
    }

    const merged = structuredClone(base);

    for (const [key, value] of Object.entries(over)) {
        merged[key] = key in merged ? merge(merged[key], value) : structuredClone(value);
    }

    return merged;
}

/** An asset's config with its defaults filled in and its paths made absolute (from `file`). */
export function resolveConfig(raw, file) {
    const where = path.dirname(path.resolve(file));
    const fail = (message) => {
        throw new Error(`${path.basename(file)}: ${message}`);
    };

    unknownKeys(raw, DEFAULTS, "", fail);

    if (typeof raw.source !== "string") {
        fail(`\`source\` (the ${SOURCES.join(", ")} to build from) is needed`);
    }

    if (!SOURCES.includes(path.extname(raw.source).toLowerCase())) {
        fail(`source is a ${SOURCES.join(", ")}, not ${JSON.stringify(path.basename(raw.source))}`);
    }

    if (raw.profiles && Object.keys(raw.profiles).length) {
        fail("it has profiles: each is resolved on its own (profileConfigs)");
    }

    const config = {
        ...structuredClone(DEFAULTS),
        ...raw,
        clips: { ...DEFAULTS.clips, ...raw.clips },
        textures: { ...DEFAULTS.textures, ...raw.textures, ktx2: { ...DEFAULTS.textures.ktx2, ...raw.textures?.ktx2 } },
        budgets: { ...raw.budgets },
    };

    config.file = path.resolve(file);
    config.profile = null;
    config.name ??= path.basename(file, path.extname(file));
    config.source = path.resolve(where, raw.source);
    config.out = path.resolve(where, config.out);
    config.actions = (raw.actions ?? []).map((action, i) => {
        unknownKeys(action, { from: 0, action: 0, name: 0, bonesOnly: 0 }, `actions[${i}].`, fail);

        if (action.bonesOnly !== undefined && typeof action.bonesOnly !== "boolean") {
            fail(`actions[${i}].bonesOnly is true or false`);
        }

        if (typeof action.from !== "string") {
            fail(`actions[${i}].from (the .blend or .fbx it's in) is needed`);
        }

        if (![".blend", ".fbx"].includes(path.extname(action.from).toLowerCase())) {
            fail(`actions[${i}].from is a .blend or an .fbx, not ${JSON.stringify(path.basename(action.from))}`);
        }

        return { ...action, from: path.resolve(where, action.from) };
    });

    if (typeof config.muteConstraints !== "boolean") {
        fail("muteConstraints is true or false");
    }

    if (config.morphs !== true && !(Array.isArray(config.morphs) && config.morphs.every((name) => typeof name === "string" && name))) {
        fail("morphs is true (all kept) or a list of the names of those kept");
    }

    config.reweight = resolveNames(raw.reweight ?? {}, "reweight", 'is { "bone": "the bone to have its vertices" }', fail);
    config.retarget = resolveRetarget(raw.retarget ?? [], where, fail);

    if (typeof config.stripNamespaces !== "boolean") {
        fail("stripNamespaces is true or false");
    }

    config.join = resolveJoin(raw.join ?? {}, fail);
    config.materials = resolveMaterials(raw.materials ?? {}, where, "materials", fail);
    config.variants = Object.fromEntries(
        Object.entries(raw.variants ?? {}).map(([name, variant]) => {
            if (!NAME.test(name) || /^lod\d+$/.test(name)) {
                fail(`variants.${name}: a variant's name is lower-case letters, digits and dashes (and not lod1, lod2...: those are the lower-detail copies')`);
            }

            unknownKeys(variant, { materials: 0 }, `variants.${name}.`, fail);

            if (!variant.materials || !Object.keys(variant.materials).length) {
                fail(`variants.${name}.materials: a variant gives at least one material its own textures`);
            }

            return [name, { materials: resolveMaterials(variant.materials, where, `variants.${name}.materials`, fail) }];
        }),
    );

    for (const key of ["atlasSize", "maxSize"]) {
        const value = config.textures[key];

        if (!((Number.isInteger(value) && value >= 1) || (key === "maxSize" && value === null))) {
            fail(`textures.${key} is a size in pixels${key === "maxSize" ? ", or null (as it is)" : ""}`);
        }
    }

    for (const [key, choices] of Object.entries(TEXTURE_CHOICES)) {
        if (!choices.includes(config.textures[key])) {
            fail(`textures.${key} is one of ${choices.join(", ")}, not ${JSON.stringify(config.textures[key])}`);
        }
    }

    for (const kind of ["color", "data", "normal"]) {
        if (!KTX2_MODES.includes(config.textures.ktx2[kind])) {
            fail(`textures.ktx2.${kind} is etc1s or uastc, not ${JSON.stringify(config.textures.ktx2[kind])}`);
        }
    }

    if (!(Number.isInteger(config.textures.ktx2.quality) && config.textures.ktx2.quality >= 1 && config.textures.ktx2.quality <= 255)) {
        fail("textures.ktx2.quality is a whole number from 1 to 255");
    }

    if (config.textures.ktx2.normalSize !== null && !(config.textures.ktx2.normalSize >= 1)) {
        fail("textures.ktx2.normalSize is a size in pixels, or null");
    }

    if (!["meshopt", "quantize", "none"].includes(config.compress)) {
        fail(`compress is meshopt, quantize or none, not ${JSON.stringify(config.compress)}`);
    }

    if (!["keep", "feet"].includes(config.origin)) {
        fail(`origin is keep or feet, not ${JSON.stringify(config.origin)}`);
    }

    if (config.restPose !== null && !(typeof config.restPose === "string" && config.restPose)) {
        fail("restPose is the name of a clip (or null: the rest pose as Blender has it)");
    }

    if (config.size !== null) {
        const keys = Object.keys(config.size);

        if (keys.length !== 1 || !SIZES.includes(keys[0]) || !(config.size[keys[0]] > 0)) {
            fail(`size is one of { ${SIZES.join(" | ")}: a number above 0 }`);
        }
    }

    for (const key of Object.keys(config.budgets)) {
        if (!BUDGETS.includes(key)) {
            fail(`budgets.${key} isn't a budget (${BUDGETS.join(", ")})`);
        }
    }

    for (const [i, lod] of config.lods.entries()) {
        unknownKeys(lod, { ratio: 0, error: 0 }, `lods[${i}].`, fail);

        if (!(lod.ratio > 0 && lod.ratio < 1)) {
            fail(`lods[${i}].ratio is the share of vertices kept, between 0 and 1`);
        }
    }

    if (!Array.isArray(config.keepBones)) {
        fail("keepBones is a list of bone names");
    }

    if (config.clips.inPlace !== true && !Array.isArray(config.clips.inPlace)) {
        fail("clips.inPlace is true or a list of clip names");
    }

    if (typeof config.clips.trimStill !== "boolean") {
        fail("clips.trimStill is true or false");
    }

    if (config.clips.fps !== null && !(typeof config.clips.fps === "number" && config.clips.fps > 0)) {
        fail("clips.fps is a number of times a second, more than 0 (or null: every frame)");
    }

    checkInvented(config.clips.invent, fail);

    if (config.simplify !== null) {
        unknownKeys(config.simplify, { ratio: 0, error: 0 }, "simplify.", fail);

        if (!(config.simplify.ratio > 0 && config.simplify.ratio < 1)) {
            fail("simplify.ratio is the share of vertices kept, between 0 and 1");
        }
    }

    if (typeof config.packLods !== "boolean") {
        fail("packLods is true or false");
    }

    return config;
}

// A map of names to names ({ "bone": "bone" }); `nulls`: or to null (left out)
function resolveNames(names, prefix, shape, fail, { nulls = false } = {}) {
    if (names === null || typeof names !== "object" || Array.isArray(names)) {
        fail(`${prefix} ${shape}`);
    }

    for (const [name, to] of Object.entries(names)) {
        if (!name || !((typeof to === "string" && to) || (nulls && to === null))) {
            fail(`${prefix} ${shape}`);
        }
    }

    return structuredClone(names);
}

function resolveRetarget(retarget, where, fail) {
    if (!Array.isArray(retarget)) {
        fail("retarget is a list: [{ from, clips }]");
    }

    return retarget.map((spec, i) => {
        const prefix = `retarget[${i}]`;

        unknownKeys(spec, { from: 0, clips: 0, bones: 0, unaligned: 0, fps: 0 }, `${prefix}.`, fail);

        if (typeof spec.from !== "string" || ![".glb", ".gltf"].includes(path.extname(spec.from).toLowerCase())) {
            fail(`${prefix}.from (the .glb or .gltf the clips are in) is needed`);
        }

        const list = Array.isArray(spec.clips) && spec.clips.length && spec.clips.every((name) => typeof name === "string" && name);
        const clips = list ? Object.fromEntries(spec.clips.map((name) => [name, name])) : resolveNames(spec.clips ?? null, `${prefix}.clips`, 'is { "its clip": "the name here" } or a list of its clips', fail);

        if (!Object.keys(clips).length) {
            fail(`${prefix}.clips names at least one clip`);
        }

        if (new Set(Object.values(clips)).size < Object.keys(clips).length) {
            fail(`${prefix}.clips gives two clips one name`);
        }

        const unaligned = spec.unaligned ?? [];

        if (!Array.isArray(unaligned) || !unaligned.every((name) => typeof name === "string" && name)) {
            fail(`${prefix}.unaligned is a list of bones' names (* and ? wildcards)`);
        }

        if (spec.fps !== undefined && !(typeof spec.fps === "number" && spec.fps > 0)) {
            fail(`${prefix}.fps is a number of keyframes a second, more than 0`);
        }

        return {
            from: path.resolve(where, spec.from),
            clips,
            bones: resolveNames(spec.bones ?? {}, `${prefix}.bones`, 'is { "bone here": "its bone" (or null: left out) }', fail, { nulls: true }),
            unaligned,
            fps: spec.fps ?? 30,
        };
    });
}

function resolveJoin(join, fail) {
    if (join === null || typeof join !== "object" || Array.isArray(join)) {
        fail('join is { "new name": ["object", ...] }');
    }

    for (const [name, objects] of Object.entries(join)) {
        if (!name || !Array.isArray(objects) || !objects.length || !objects.every((object) => typeof object === "string" && object)) {
            fail(`join.${name} is a list of objects' names (* and ? wildcards)`);
        }
    }

    return structuredClone(join);
}

function resolveMaterials(materials, where, prefix, fail) {
    if (materials === null || typeof materials !== "object" || Array.isArray(materials)) {
        fail(`${prefix} is { "material": { baseColor, normal, ... } }`);
    }

    return Object.fromEntries(Object.entries(materials).map(([name, spec]) => [name, resolveMaterial(spec, where, `${prefix}.${name}`, fail)]));
}

function resolveMaterial(spec, where, prefix, fail) {
    unknownKeys(spec, MATERIAL_KEYS, `${prefix}.`, fail);

    const resolved = { ...spec };

    for (const [key, kind] of Object.entries(MAPS)) {
        if (spec[key] === undefined) {
            continue;
        }

        // (Roughness and metal may be one number for the whole material)
        if (typeof spec[key] === "number") {
            if (!["roughness", "metallic"].includes(key) || !(spec[key] >= 0 && spec[key] <= 1)) {
                fail(`${prefix}.${key} is a texture${["roughness", "metallic"].includes(key) ? ", or a number from 0 to 1" : ""}`);
            }

            continue;
        }

        const map = typeof spec[key] === "string" ? { file: spec[key] } : spec[key];

        unknownKeys(map, MAP_KEYS, `${prefix}.${key}.`, fail);

        if (typeof map.file !== "string") {
            fail(`${prefix}.${key}.file (the texture) is needed`);
        }

        if (map.channel !== undefined && (kind !== "grey" || !["R", "G", "B", "A"].includes(map.channel))) {
            fail(kind === "grey" ? `${prefix}.${key}.channel is R, G, B or A` : `${prefix}.${key} is a colour: it has no channel to choose`);
        }

        if (map.scale !== undefined && (kind !== "grey" || !(typeof map.scale === "number" && map.scale >= 0 && map.scale <= 1))) {
            fail(kind === "grey" ? `${prefix}.${key}.scale is a number from 0 to 1` : `${prefix}.${key} can't be scaled (only a map of one channel: Unity's smoothness, say)`);
        }

        if (map.invert !== undefined && (kind !== "grey" || typeof map.invert !== "boolean")) {
            fail(kind === "grey" ? `${prefix}.${key}.invert is true or false` : `${prefix}.${key} can't be inverted (only a map of one channel: smoothness into roughness, say)`);
        }

        if (map.flipGreen !== undefined && (kind !== "normal" || typeof map.flipGreen !== "boolean")) {
            fail(kind === "normal" ? `${prefix}.${key}.flipGreen is true or false` : `${prefix}.${key}.flipGreen is for a normal map (DirectX's, as Unreal's are, into OpenGL's, as glTF's are)`);
        }

        resolved[key] = { ...map, file: path.resolve(where, map.file) };
    }

    if (spec.alpha !== undefined && !["opaque", "mask", "blend"].includes(spec.alpha)) {
        fail(`${prefix}.alpha is opaque, mask or blend, not ${JSON.stringify(spec.alpha)}`);
    }

    if (spec.alphaMap !== undefined && !["mask", "blend"].includes(spec.alpha)) {
        fail(`${prefix}.alphaMap needs alpha: mask or blend`);
    }

    if (spec.emissionStrength !== undefined && !(typeof spec.emissionStrength === "number" && spec.emissionStrength >= 0)) {
        fail(`${prefix}.emissionStrength is a number, 0 or more`);
    }

    if (spec.doubleSided !== undefined && typeof spec.doubleSided !== "boolean") {
        fail(`${prefix}.doubleSided is true or false`);
    }

    return resolved;
}

function unknownKeys(value, known, prefix, fail) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        fail(`${prefix || "the config"} must be an object`);
    }

    for (const key of Object.keys(value)) {
        if (!(key in known)) {
            fail(`unknown setting ${prefix}${key}`);
        }

        const inner = known[key];

        // (Into settings made of settings; not into maps of names, such as clips.rename)
        if (inner && typeof inner === "object" && !Array.isArray(inner) && Object.keys(inner).length && value[key] !== null) {
            unknownKeys(value[key], inner, `${prefix}${key}.`, fail);
        }
    }
}

/**
 * The job the Blender stage is given (blender/export.py). `variants`: { variant: the GLB to write
 * its materials into }.
 */
export function blenderJob(config, { out, report, passes = null, variants = {} }) {
    return {
        source: config.source,
        out,
        report,
        passes,
        scene: config.scene,
        objects: config.objects,
        collection: config.collection,
        stripNamespaces: config.stripNamespaces,
        join: config.join,
        materials: config.materials,
        variants: Object.fromEntries(Object.entries(config.variants).map(([name, variant]) => [name, { ...variant, out: variants[name] }])),
        actions: config.actions,
        muteConstraints: config.muteConstraints,
        clips: { include: config.clips.include, exclude: config.clips.exclude, rename: config.clips.rename },
        deformBonesOnly: config.deformBonesOnly,
        keepBones: config.keepBones,
        applyModifiers: config.applyModifiers,
        textures: config.textures,
    };
}
