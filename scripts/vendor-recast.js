// Copies recast-navigation-js (Recast and Detour built to WebAssembly) from node_modules into
// client/vendor/recast-navigation-<version>/: the navigation meshes the world is walked on
// (core/navigation/). The page, a module worker and the tests all import it by its path, with
// nothing in the import map (workers don't see the page's), so the core's import of the
// WebAssembly package is pointed at the copy beside it, and one module beside them both
// (recast.mjs, written here) hands the game the core, the WebAssembly's glue and where the
// WebAssembly is: the folder's name is spelled once in the game, where core/navigation/recast.js
// imports that module, and this writes it there. Run this after changing the
// "@recast-navigation/*" versions in package.json (both the same, each an exact version: every
// device bakes its own tiles, so every device must have the same Recast):
//
//     npm install && npm run vendor:recast && npm run build:manifest
//
// It leaves no other version's folder in client/vendor. test/bake.test.js fails while
// package.json, the folder and recast.js don't name the same version, and if the new version
// bakes a tile or finds a way differently (contribution.md, section 2, *Every npm script*).

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { startingMemory, withStartingMemory } from "./wasm-memory.js";

// How much memory Recast's WebAssembly starts with (MB): its build starts it with 64, which it
// doesn't need (it grows as it wants more), in the page and the navigation worker both
const STARTING_MEMORY = 16;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = path.join(root, "node_modules/@recast-navigation/core");
const wasm = path.join(root, "node_modules/@recast-navigation/wasm");
const { version } = JSON.parse(await readFile(path.join(core, "package.json"), "utf8"));
const wasmVersion = JSON.parse(await readFile(path.join(wasm, "package.json"), "utf8")).version;
const vendor = path.join(root, "client/vendor");
const target = path.join(vendor, `recast-navigation-${version}`);
const loader = path.join(root, "client/js/core/navigation/recast.js");

if (wasmVersion !== version) {
    throw new Error(`@recast-navigation/core is ${version} but @recast-navigation/wasm is ${wasmVersion}: they're built together, so install the same version of both`);
}

const source = (await readFile(path.join(core, "dist/index.mjs"), "utf8")).replace("import('@recast-navigation/wasm')", "import('./recast-navigation.wasm.js')");

if (source.includes("@recast-navigation/")) {
    throw new Error("The core still imports another package by name");
}

const { code } = await transform(source, { minify: true, format: "esm" });

await mkdir(target, { recursive: true });
await writeFile(path.join(target, "core.min.mjs"), `// @recast-navigation/core ${version}, by Isaac Mason: MIT License (LICENSE); Recast and Detour by Mikko Mononen: zlib License\n${code}`);

// The WebAssembly module's glue as it is (it finds the module beside it), and the module made to
// start with less memory (wasm-memory.js: marked as altered in LICENSE-recastnavigation.txt)
await copyFile(path.join(wasm, "dist", "recast-navigation.wasm.js"), path.join(target, "recast-navigation.wasm.js"));

const module = await readFile(path.join(wasm, "dist", "recast-navigation.wasm.wasm"));

await writeFile(path.join(target, "recast-navigation.wasm.wasm"), withStartingMemory(module, STARTING_MEMORY));
console.log(`Recast's memory starts with ${STARTING_MEMORY} MB (built with ${startingMemory(module) / 1048576})`);

// The one module the game imports (core/navigation/recast.js): the core, the glue, and where the
// WebAssembly is (read from its file under Node; the glue fetches it itself in a page or a worker)
await writeFile(
    path.join(target, "recast.mjs"),
    `// recast-navigation ${version} as the game loads it (written by scripts/vendor-recast.js): its core,
// its WebAssembly's glue, and where the WebAssembly itself is.
export * as core from "./core.min.mjs";
export { default as factory } from "./recast-navigation.wasm.js";
export const VERSION = "${version}";
export const wasm = new URL("./recast-navigation.wasm.wasm", import.meta.url);
`,
);

await copyFile(path.join(core, "LICENSE"), path.join(target, "LICENSE"));
await writeFile(
    path.join(target, "LICENSE-recastnavigation.txt"),
    `Recast and Detour (https://github.com/recastnavigation/recastnavigation), built into recast-navigation.wasm.*:

Altered: recast-navigation.wasm.wasm's memory starts with ${STARTING_MEMORY} MB, not the 64 MB it was
built with (scripts/vendor-recast.js, scripts/wasm-memory.js); nothing else in it is changed.

Copyright (c) 2009 Mikko Mononen memon@inside.org

This software is provided 'as-is', without any express or implied
warranty.  In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not
   claim that you wrote the original software. If you use this software
   in a product, an acknowledgment in the product documentation would be
   appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.
`,
);

console.log(`recast-navigation ${version} copied to ${path.relative(root, target)}`);

// The game's one import of it pointed at this version's folder, and any other version's removed
const IMPORTED = /vendor\/recast-navigation-[\d.]+\/recast\.mjs/g;
const loading = await readFile(loader, "utf8");

if (loading.match(IMPORTED)?.length !== 1) {
    throw new Error(`${path.relative(root, loader)} should import vendor/recast-navigation-<version>/recast.mjs, once`);
}

await writeFile(loader, loading.replace(IMPORTED, `vendor/recast-navigation-${version}/recast.mjs`));

for (const name of await readdir(vendor)) {
    if (name.startsWith("recast-navigation-") && name !== path.basename(target)) {
        await rm(path.join(vendor, name), { recursive: true });
        console.log(`${path.join("client/vendor", name)} removed`);
    }
}

console.log("Now: npm run build:manifest, then node --test test/bake.test.js (the tiles' bytes and the ways must be as recorded)");
