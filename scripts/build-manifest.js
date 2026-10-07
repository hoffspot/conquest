// Lists every file the game downloads before it starts, with its size, into
// client/js/app/manifest.js, so the loading screen can show exactly how far it has got; and the
// models it downloads only as they're wanted, from client/models/assets.json, into
// client/js/app/assets.js (the catalog):
//
//     npm run build:manifest
//
// The game's code is followed from its entry modules through their imports and the workers they
// start (and the import map's "three" and "three/addons/" in index.html), leaving out what
// main.js imports itself (it is already loaded when the loader starts). The character data, masks
// and pictures, the fonts, and the navigation meshes' WebAssembly (Recast's glue fetches it
// itself), are listed too. test/manifest.test.js checks both lists are up to date.
//
// Data files (the body, its skin, the models) are listed with a hash of their bytes too, as is
// every file in the catalog: they're fetched as path?h=hash, so each version is a different
// address to every cache, and the service worker (client/sw.js) keeps them by it, never checking
// them again (generated/asset_streaming_plan.md, sections 2 and 5).

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_BODY } from "../client/js/characters/body.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "client");
const output = path.join(client, "js/app/manifest.js");
const catalogOutput = path.join(client, "js/app/assets.js");
const catalogInput = path.join(client, "models/assets.json");

// What the loading screen says each body is (body.js BODIES)
const BODY_DETAILS = {
    human: { body: "MakeHuman base mesh, skeleton and sliders", skin: "MakeHuman masks" },
    vitruvian: { body: "CharMorph's Vitruvian, with MakeHuman's sliders", skin: "Its own skin's pictures, MakeHuman masks carried over, and the mouth's inside" },
};

// The modules the game imports once everything is downloaded (main.js: import()), and those it
// imports only when they're first wanted (the action wheels' set-up, playing together), so that
// they're there offline too
const ENTRIES = ["js/app/session.js", "js/app/creator.js", "js/app/worldmap.js", "js/app/wheelsetup.js", "js/app/together.js"];

// A module's static imports and re-exports, and its import()s (minified code may have no spaces)
const STATIC = /(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']/g;
const DYNAMIC = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

// The scripts it starts workers with: new Worker(new URL("...", import.meta.url))
const WORKER = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*["']([^"']+)["']/g;

async function importMap() {
    const html = await readFile(path.join(client, "index.html"), "utf8");
    const json = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];

    return JSON.parse(json).imports;
}

// Where an import leads, as a path in the client folder (or null for anywhere else)
function resolve(specifier, from, map) {
    for (const [name, target] of Object.entries(map)) {
        if (name.endsWith("/") ? specifier.startsWith(name) : specifier === name) {
            return path.posix.normalize(path.posix.join(target, specifier.slice(name.length)));
        }
    }

    if (specifier.startsWith(".")) {
        return path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    }

    return null;
}

// Every module reachable from `entries` (client paths), following import()s too if `dynamic`
async function closure(entries, map, { dynamic = true } = {}) {
    const seen = new Set();
    const queue = [...entries];

    while (queue.length) {
        const file = queue.shift().replace(/^\.\//, "");

        if (seen.has(file)) {
            continue;
        }

        seen.add(file);

        // (The manifest and the catalog themselves, which main.js imports, may not have been made
        // yet)
        if (path.join(client, file) === output || path.join(client, file) === catalogOutput) {
            continue;
        }

        const source = await readFile(path.join(client, file), "utf8");
        const specifiers = [...source.matchAll(STATIC), ...(dynamic ? [...source.matchAll(DYNAMIC), ...source.matchAll(WORKER)] : [])].map(([, specifier]) => specifier);

        for (const specifier of specifiers) {
            const next = resolve(specifier, file, map);

            if (next && !seen.has(next)) {
                queue.push(next);
            }
        }
    }

    return seen;
}

const size = async (file) => (await stat(path.join(client, file))).size;
const sized = async (files) => Promise.all([...files].sort().map(async (file) => [file, await size(file)]));

/** A file's hash: the first 10 hex digits of the SHA-256 of its bytes (path from the page). */
export async function hashOf(file) {
    return createHash("sha256").update(await readFile(path.join(client, file))).digest("hex").slice(0, 10);
}

const hashedFiles = async (files) => Promise.all((await sized(files)).map(async ([file, bytes]) => [file, bytes, await hashOf(file)]));

// (Groups of data, which the loader keeps and the service worker keeps by hash; the rest is code
// and fonts, which the page asks for by their names)
const HASHED = new Set(["body", "skin", "models"]);

/** The manifest's groups: [{ id, label, detail, files: [[path, bytes, hash?]] }]. */
export async function manifestGroups() {
    const map = await importMap();
    const loaded = await closure(["js/main.js"], map, { dynamic: false });
    const modules = [...(await closure(ENTRIES, map))].filter((file) => !loaded.has(file));
    const navigation = modules.filter((file) => file.startsWith("vendor/recast-navigation-"));
    const engine = modules.filter((file) => file.startsWith("vendor/") && !navigation.includes(file));
    const code = modules.filter((file) => !file.startsWith("vendor/"));
    const recast = navigation[0]?.match(/recast-navigation-([\d.]+)\//)?.[1];

    // (And the WebAssembly the glue fetches itself)
    if (recast) {
        const folder = `vendor/recast-navigation-${recast}`;

        navigation.push(...(await readdir(path.join(client, folder))).filter((name) => name.endsWith(".wasm")).map((name) => `${folder}/${name}`));
    }

    // (The game's body, body.js GAME_BODY, and the masks, pictures and skin pictures its manifest names)
    const body = JSON.parse(await readFile(path.join(client, `characters/${GAME_BODY}.json`), "utf8"));
    const masks = [...body.masks, ...Object.values(body.pictures ?? {}), ...Object.values(body.skin ?? {})].map((file) => `characters/${file}`).toSorted();
    const three = engine.find((file) => /three-r\d+/.test(file))?.match(/three-r(\d+)/)[1];
    const groups = [
        { id: "engine", label: "3D engine", detail: `Three.js r${three}`, files: await sized(engine) },
        { id: "navigation", label: "Ways over the world", detail: `Recast and Detour (recast-navigation-js ${recast})`, files: await sized(navigation) },
        { id: "code", label: "Game code", detail: "Pellagos", files: await sized(code) },
        { id: "body", label: "Body and shapes", detail: BODY_DETAILS[GAME_BODY].body, files: await sized([`characters/${GAME_BODY}.json`, `characters/${GAME_BODY}.bin`]) },
        { id: "skin", label: "Skin details", detail: BODY_DETAILS[GAME_BODY].skin, files: await sized(masks) },
        { id: "fonts", label: "Lettering", detail: "UnifrakturMaguntia, for the tavern's signs", files: await sized((await readdir(path.join(client, "fonts"))).filter((name) => name.endsWith(".woff2")).map((name) => `fonts/${name}`)) },
        { id: "models", label: "Things in the world", detail: "A treasure chest (JMI 3D Toolkit)", files: await sized(["models/jmi/chest.glb"]) },
    ];

    for (const group of groups) {
        if (HASHED.has(group.id)) {
            group.files = await hashedFiles(group.files.map(([file]) => file));
        }
    }

    return groups;
}

/** The manifest module's source text. */
export async function manifestSource(groups) {
    groups ??= await manifestGroups();

    const lines = groups.map(({ id, label, detail, files }) => [
        `    {`,
        `        id: ${JSON.stringify(id)},`,
        `        label: ${JSON.stringify(label)},`,
        `        detail: ${JSON.stringify(detail)},`,
        `        files: [`,
        ...files.map((file) => `            [${file.map((each) => JSON.stringify(each)).join(", ")}],`),
        `        ],`,
        `    },`,
    ].join("\n"));

    return `// Made by scripts/build-manifest.js (npm run build:manifest), don't edit: every file the game
// downloads before it starts, in groups, with each file's size in bytes (paths from the page), so
// the loading screen can show exactly how far it has got. Data files have a hash of their bytes
// too, and are fetched as path?h=hash. test/manifest.test.js checks it's up to date.

export const MANIFEST = Object.freeze([
${lines.join("\n")}
]);
`;
}

// What a model in the catalog may be: wanted soon, as predicted (near), or only once it's needed
// (demand)
const TIERS = new Set(["near", "demand"]);

/**
 * The catalog: client/models/assets.json (or `catalog`, as it would be read from there), each
 * file with its size and hash. Throws if a model has no files, an unknown tier, or a file that
 * isn't there.
 */
export async function catalog(source) {
    source ??= JSON.parse(await readFile(catalogInput, "utf8"));

    const models = {};

    for (const [name, model] of Object.entries(source.models ?? {})) {
        if (!TIERS.has(model.tier)) {
            throw new Error(`${name}: its tier is "near" or "demand", not ${JSON.stringify(model.tier)}`);
        }

        if (!Array.isArray(model.files) || !model.files.length) {
            throw new Error(`${name}: lists no files`);
        }

        const files = [];

        for (const file of model.files) {
            const bytes = await size(file.path).catch(() => {
                throw new Error(`${name}: client/${file.path} isn't there`);
            });

            files.push({ ...file, hash: await hashOf(file.path), bytes });
        }

        models[name] = { ...model, files };
    }

    return { models };
}

/**
 * What names a release's set of kept files: a hash of their addresses (path?h=hash), the
 * manifest's data and the catalog's, so it changes exactly when one of them does.
 */
export function releaseOf(groups, { models }) {
    const addresses = [
        ...groups.flatMap(({ files }) => files.filter(([, , hash]) => hash).map(([file, , hash]) => `${file}?h=${hash}`)),
        ...Object.values(models).flatMap(({ files }) => files.map(({ path: file, hash }) => `${file}?h=${hash}`)),
    ];

    return createHash("sha256").update(addresses.sort().join("\n")).digest("hex").slice(0, 10);
}

/** The catalog module's source text. */
export async function catalogSource(groups, models) {
    groups ??= await manifestGroups();
    models ??= await catalog();

    const listed = JSON.stringify(models.models, null, 4).replaceAll("\n", "\n    ");

    return `// Made by scripts/build-manifest.js (npm run build:manifest) from client/models/assets.json,
// don't edit: the models the game downloads only as they're wanted (not before it starts: that's
// manifest.js), each file with its size in bytes and a hash of its bytes, fetched as path?h=hash.
// \`release\` names this release's set of kept files (these and the manifest's data), which the
// page tells the service worker (client/sw.js), so it can let go of what no release in use lists.
// test/manifest.test.js checks it's up to date; generated/asset_streaming_plan.md, section 2,
// says what each field is for.

export const ASSETS = Object.freeze({
    release: ${JSON.stringify(releaseOf(groups, models))},
    models: ${listed},
});
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const groups = await manifestGroups();

    await writeFile(output, await manifestSource(groups));
    await writeFile(catalogOutput, await catalogSource(groups));
    console.log(`Wrote ${path.relative(root, output)} and ${path.relative(root, catalogOutput)}`);
}
