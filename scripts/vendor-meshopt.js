// Copies meshoptimizer's simplifier from node_modules into client/vendor/meshoptimizer-<version>/,
// minified: it works out the lower-detail meshes of characters seen from afar (characters/lod.js).
// It's a module with its WebAssembly inside, so the page, a worker and the tests all import it by
// its path, with nothing in the import map. Run this after changing the "meshoptimizer" version in
// package.json:
//
//     npm install && npm run vendor:meshopt
//
// then update the path lod.js imports it from, run npm run build:manifest, and delete the old
// vendor folder.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const meshopt = path.join(root, "node_modules/meshoptimizer");
const { version } = JSON.parse(await readFile(path.join(meshopt, "package.json"), "utf8"));
const target = path.join(root, `client/vendor/meshoptimizer-${version}`);
const source = await readFile(path.join(meshopt, "meshopt_simplifier.js"), "utf8");
const { code } = await transform(source, { minify: true, format: "esm" });

await mkdir(target, { recursive: true });
await writeFile(path.join(target, "meshopt_simplifier.min.js"), `// meshoptimizer ${version}, by Arseny Kapoulkine: MIT License (LICENSE.md)\n${code}`);
await copyFile(path.join(meshopt, "LICENSE.md"), path.join(target, "LICENSE.md"));

console.log(`meshoptimizer ${version}'s simplifier copied to ${path.relative(root, target)}`);
