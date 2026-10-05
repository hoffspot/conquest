// An asset's config (examples/*.json, README.md): what's built from what, and how. Paths in it
// are relative to the config file. Anything left out takes its default here; a key that isn't
// known is an error, so a misspelt one isn't silently ignored.

import { readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULTS = Object.freeze({
    // What it's called (the files written: <name>.glb, <name>.report.json); the config file's name
    name: null,
    // The .blend to build from
    source: null,
    // Where to write, relative to the config file
    out: "dist",
    // What to export: these objects, or this collection; by default every mesh shown and
    // rendered in the scene, and the armature deforming them
    objects: null,
    collection: null,
    scene: null,
    // Actions to bring in from other .blend files: [{ from, action?, name? }]
    actions: [],
    // Which of the armature's actions are exported (`include`, `exclude`: names, * and ?
    // wildcards), and what they're called (`rename`: { "Blender name": "clip name" }); clips to
    // play in place (`inPlace`: names or true, their travel taken out of `rootBone`, by default
    // the topmost bone that moves)
    clips: { include: null, exclude: [], rename: {}, inPlace: [], rootBone: null },
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
        // The atlas's largest size, and the largest any other texture is kept at (pixels)
        atlasSize: 1024,
        maxSize: 1024,
        // "webp" (EXT_texture_webp), "jpeg" or "png"; and the quality of WebP and JPEG (0 to 100)
        format: "webp",
        quality: 90,
        // Bake ambient occlusion into the atlas (Cycles, this many samples)
        ao: false,
        aoSamples: 32,
        // Pixels per UV unit for a procedural texture's share of the atlas
        proceduralSize: 512,
        // Pixels baked round each UV island, so its edges don't bleed when mipmapped
        margin: 4,
    },
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
    // Limits it's checked against: triangles, vertices, joints, drawCalls, textureSize,
    // textureMegabytes (on the GPU, with mipmaps), kilobytes (the GLB), clips (names it must have)
    budgets: {},
});

const TEXTURE_CHOICES = { bake: ["auto", "always", "never"], udim: ["atlas", "split"], format: ["webp", "jpeg", "png"] };
const SIZES = ["height", "length", "width", "longest", "scale"];
const BUDGETS = ["triangles", "vertices", "joints", "drawCalls", "textureSize", "textureMegabytes", "kilobytes", "clips"];

/** Reads an asset's config file and fills in its defaults, its paths made absolute. */
export function loadConfig(file) {
    const raw = JSON.parse(readFileSync(file, "utf8"));

    return resolveConfig(raw, file);
}

/** An asset's config with its defaults filled in and its paths made absolute (from `file`). */
export function resolveConfig(raw, file) {
    const where = path.dirname(path.resolve(file));
    const fail = (message) => {
        throw new Error(`${path.basename(file)}: ${message}`);
    };

    unknownKeys(raw, DEFAULTS, "", fail);

    if (typeof raw.source !== "string") {
        fail("`source` (the .blend to build from) is needed");
    }

    const config = {
        ...structuredClone(DEFAULTS),
        ...raw,
        clips: { ...DEFAULTS.clips, ...raw.clips },
        textures: { ...DEFAULTS.textures, ...raw.textures },
        budgets: { ...raw.budgets },
    };

    config.file = path.resolve(file);
    config.name ??= path.basename(file, path.extname(file));
    config.source = path.resolve(where, raw.source);
    config.out = path.resolve(where, config.out);
    config.actions = (raw.actions ?? []).map((action, i) => {
        unknownKeys(action, { from: 0, action: 0, name: 0 }, `actions[${i}].`, fail);

        if (typeof action.from !== "string") {
            fail(`actions[${i}].from (the .blend it's in) is needed`);
        }

        return { ...action, from: path.resolve(where, action.from) };
    });

    for (const [key, choices] of Object.entries(TEXTURE_CHOICES)) {
        if (!choices.includes(config.textures[key])) {
            fail(`textures.${key} is one of ${choices.join(", ")}, not ${JSON.stringify(config.textures[key])}`);
        }
    }

    if (!["meshopt", "quantize", "none"].includes(config.compress)) {
        fail(`compress is meshopt, quantize or none, not ${JSON.stringify(config.compress)}`);
    }

    if (!["keep", "feet"].includes(config.origin)) {
        fail(`origin is keep or feet, not ${JSON.stringify(config.origin)}`);
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

    return config;
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

/** The job the Blender stage is given (blender/export.py). */
export function blenderJob(config, { out, report, passes = null }) {
    return {
        source: config.source,
        out,
        report,
        passes,
        scene: config.scene,
        objects: config.objects,
        collection: config.collection,
        actions: config.actions,
        clips: { include: config.clips.include, exclude: config.clips.exclude, rename: config.clips.rename },
        deformBonesOnly: config.deformBonesOnly,
        keepBones: config.keepBones,
        applyModifiers: config.applyModifiers,
        textures: config.textures,
    };
}
