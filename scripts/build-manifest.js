// Lists every file the game downloads before it starts, with its size, into
// client/js/app/manifest.js, so the loading screen can show exactly how far it has got:
//
//     npm run build:manifest
//
// The game's code is followed from its entry modules through their imports and the workers they
// start (and the import map's "three" and "three/addons/" in index.html), leaving out what
// main.js imports itself (it is already loaded when the loader starts). The character data and masks, and the 3D models
// with the buffers and textures their glTF files name, are listed too. test/manifest.test.js
// checks the list is up to date.

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "client");
const output = path.join(client, "js/app/manifest.js");

// The modules the game imports once everything is downloaded (main.js: import())
const ENTRIES = ["js/app/session.js", "js/app/creator.js"];

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

        // (The manifest itself, which main.js imports, may not have been made yet)
        if (path.join(client, file) === output) {
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

/** The manifest module's source text. */
export async function manifestSource() {
    const map = await importMap();
    const loaded = await closure(["js/main.js"], map, { dynamic: false });
    const modules = [...(await closure(ENTRIES, map))].filter((file) => !loaded.has(file));
    const engine = modules.filter((file) => file.startsWith("vendor/"));
    const code = modules.filter((file) => !file.startsWith("vendor/"));
    const masks = (await readdir(path.join(client, "characters/masks"))).filter((name) => name.endsWith(".jpg")).map((name) => `characters/masks/${name}`);
    const models = [];

    for (const name of (await readdir(path.join(client, "models/kaykit"))).filter((file) => file.endsWith(".gltf"))) {
        const gltf = JSON.parse(await readFile(path.join(client, "models/kaykit", name), "utf8"));

        models.push(`models/kaykit/${name}`);

        for (const { uri } of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
            if (uri && !uri.startsWith("data:")) {
                models.push(`models/kaykit/${uri}`);
            }
        }
    }

    const three = engine.find((file) => /three-r\d+/.test(file))?.match(/three-r(\d+)/)[1];
    const groups = [
        { id: "engine", label: "3D engine", detail: `Three.js r${three}`, files: await sized(engine) },
        { id: "code", label: "Game code", detail: "Pellagos", files: await sized(code) },
        { id: "body", label: "Body and shapes", detail: "MakeHuman base mesh, skeleton and sliders", files: await sized(["characters/human.json", "characters/human.bin"]) },
        { id: "skin", label: "Skin details", detail: "MakeHuman masks", files: await sized(masks) },
        { id: "models", label: "Props and trees", detail: "KayKit Medieval Hexagon models", files: await sized(new Set(models)) },
        { id: "fonts", label: "Lettering", detail: "UnifrakturMaguntia, for the tavern's signs", files: await sized((await readdir(path.join(client, "fonts"))).filter((name) => name.endsWith(".woff2")).map((name) => `fonts/${name}`)) },
    ];
    const lines = groups.map(({ id, label, detail, files }) => [
        `    {`,
        `        id: ${JSON.stringify(id)},`,
        `        label: ${JSON.stringify(label)},`,
        `        detail: ${JSON.stringify(detail)},`,
        `        files: [`,
        ...files.map(([file, bytes]) => `            [${JSON.stringify(file)}, ${bytes}],`),
        `        ],`,
        `    },`,
    ].join("\n"));

    return `// Made by scripts/build-manifest.js (npm run build:manifest), don't edit: every file the game
// downloads before it starts, in groups, with each file's size in bytes (paths from the page), so
// the loading screen can show exactly how far it has got. test/manifest.test.js checks it's up to
// date.

export const MANIFEST = Object.freeze([
${lines.join("\n")}
]);
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await writeFile(output, await manifestSource());
    console.log(`Wrote ${path.relative(root, output)}`);
}
