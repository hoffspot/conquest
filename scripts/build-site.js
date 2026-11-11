// Makes the site's copy of the game smaller to download, as the Pages deploy puts it together
// (.github/workflows/pages.yml): the comments and indentation taken out of the game's own code,
// every file still a module of its own, at its own address.
//
//     cp -R client _site
//     node scripts/build-site.js _site
//
// Only ever a copy: the repository, npm start, the tests and the Mac app keep the code as it's
// written (it refuses the repository's own client folder). In the copy:
//
// - every module under js/ is written again without its comments and whitespace (esbuild's
//   minifyWhitespace alone: no name's changed and no code's rewritten, so it's the code the tests
//   ran, and a stack trace still names its functions). Measured on the game's 450 modules: 12.86 MB
//   to 6.93 MB, 3.69 MB to 2.14 MB as a host sends them gzipped;
// - a source map beside each (game.js.map), which names the file as the repository has it and
//   carries its text, for reading a stack trace or stepping through the code as written;
// - the manifest, the catalog and the page's import map are made again for the copy
//   (scripts/build-manifest.js rootAt), so every hash is of the file as the site serves it: the
//   service worker keeps a file only if its bytes match its hash (client/sw.js keep), and gives a
//   worker its modules, asked for by name, from the same copies.
//
// version.js is left as it's written: the deploy stamps the commit into it afterwards
// (scripts/stamp-version.js), which looks for its lines as they are.
//
// A bundle was measured too, and isn't made: it saves little more (48% against 42%) and an update
// would no longer download only the files that changed (generated/game_delivery_plan.md).

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { transform } from "esbuild";
import { build, MADE, manifestGroups, rootAt, startFiles, UNHASHED } from "./build-manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// How many files are stripped at once
const AT_ONCE = 16;

/**
 * A module's source without its comments and whitespace, and its source map (JSON).
 *
 * @param {string} source - The module as it's written.
 * @param {string} file - Its path from the page ("js/app/game.js").
 * @returns {Promise<{ code: string, map: string }>} `code` ends by naming the map, beside it.
 */
export async function stripped(source, file) {
    const name = path.posix.basename(file);

    // (Named in the map as the repository has it, client/js/app/game.js, from where the map is:
    // not the site's own address for the file, which is the stripped one)
    const sourcefile = path.posix.relative(path.posix.dirname(file), path.posix.join("client", file));

    // (Whitespace alone; the newest syntax left as it is; legal comments kept where they are;
    // letters outside ASCII as they're written, not escaped)
    const { code, map } = await transform(source, { minifyWhitespace: true, legalComments: "inline", charset: "utf8", sourcemap: "external", sourcefile, sourcesContent: true });

    return { code: `${code}//# sourceMappingURL=${encodeURIComponent(name)}.map\n`, map };
}

// Every .js file under `folder` (paths from `base`, forward slashes), sorted
async function modulesIn(folder, base = folder) {
    const found = [];

    for (const entry of await readdir(folder, { withFileTypes: true })) {
        const each = path.join(folder, entry.name);

        if (entry.isDirectory()) {
            found.push(...(await modulesIn(each, base)));
        } else if (entry.name.endsWith(".js")) {
            found.push(path.relative(base, each).split(path.sep).join("/"));
        }
    }

    return found.sort();
}

// What the game downloads to start (the manifest's files and those main.js loads itself), by path
const listed = async () => [...(await manifestGroups()).flatMap(({ files }) => files.map(([file]) => file)), ...(await startFiles()).map(([file]) => file)].sort();

/**
 * Strip the code of the site in `folder` (a copy of client/), and make its manifest, catalog and
 * import map again for the files as they then are.
 *
 * @returns {Promise<object>} { files, before, after, gzipBefore, gzipAfter }: how many modules
 *     were stripped, and their bytes before and after, as they are and gzipped.
 */
export async function buildSite(folder) {
    const site = path.resolve(folder);

    if (site === path.join(root, "client")) {
        throw new Error("Not the repository's own client folder: its code stays as it's written. Copy it first (cp -R client _site)");
    }

    rootAt(site);

    try {
        const before = await listed();

        // (Not version.js, stamped as it's written; the manifest and the catalog are made again
        // below, and stripped then)
        const files = (await modulesIn(path.join(site, "js"), site)).filter((file) => !UNHASHED.has(file) && !MADE.includes(file));
        const sizes = { files: 0, before: 0, after: 0, gzipBefore: 0, gzipAfter: 0 };

        const strip = async (source, file) => {
            const { code, map } = await stripped(source, file);

            await writeFile(path.join(site, `${file}.map`), map);
            sizes.files++;
            sizes.before += Buffer.byteLength(source);
            sizes.after += Buffer.byteLength(code);
            sizes.gzipBefore += gzipSync(source, { level: 6 }).length;
            sizes.gzipAfter += gzipSync(code, { level: 6 }).length;

            return code;
        };

        const queue = [...files];
        const next = async () => {
            while (queue.length) {
                const file = queue.shift();

                await writeFile(path.join(site, file), await strip(await readFile(path.join(site, file), "utf8"), file));
            }
        };

        await Promise.all(Array.from({ length: AT_ONCE }, next));
        await build({ made: strip });

        // (The same files as before: what the game downloads is found by reading its code for
        // imports and workers, scripts/build-manifest.js closure, so code that no longer read the
        // same would leave a file out of the manifest and the import map)
        const after = await listed();
        const lost = before.filter((file) => !after.includes(file));
        const gained = after.filter((file) => !before.includes(file));

        if (lost.length || gained.length) {
            throw new Error(`Stripped, the site downloads other files than the code as written: ${[...lost.map((file) => `no longer ${file}`), ...gained.map((file) => `now ${file}`)].join(", ")}`);
        }

        return sizes;
    } finally {
        rootAt();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const folder = process.argv[2];

    if (!folder) {
        throw new Error("node scripts/build-site.js <the site's folder, a copy of client/>");
    }

    const MB = (bytes) => `${(bytes / 1024 ** 2).toFixed(2)} MB`;
    const { files, before, after, gzipBefore, gzipAfter } = await buildSite(folder);

    console.log(`${folder}: ${files} modules stripped, ${MB(before)} to ${MB(after)} (gzipped, ${MB(gzipBefore)} to ${MB(gzipAfter)}), a source map beside each; its manifest, catalog and import map made again`);
}
