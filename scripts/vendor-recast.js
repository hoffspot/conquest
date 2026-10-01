// Copies recast-navigation-js (Recast and Detour built to WebAssembly) from node_modules into
// client/vendor/recast-navigation-<version>/: the navigation meshes the world is walked on
// (core/navigation/). The page, a module worker and the tests all import it by its path, with
// nothing in the import map (workers don't see the page's), so the core's import of the
// WebAssembly package is pointed at the copy beside it. Run this after changing the
// "@recast-navigation/*" versions in package.json:
//
//     npm install && npm run vendor:recast
//
// then update the path core/navigation/recast.js imports it from, run npm run build:manifest, and
// delete the old vendor folder.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = path.join(root, "node_modules/@recast-navigation/core");
const wasm = path.join(root, "node_modules/@recast-navigation/wasm");
const { version } = JSON.parse(await readFile(path.join(core, "package.json"), "utf8"));
const target = path.join(root, `client/vendor/recast-navigation-${version}`);
const source = (await readFile(path.join(core, "dist/index.mjs"), "utf8")).replace("import('@recast-navigation/wasm')", "import('./recast-navigation.wasm.js')");

if (source.includes("@recast-navigation/")) {
    throw new Error("The core still imports another package by name");
}

const { code } = await transform(source, { minify: true, format: "esm" });

await mkdir(target, { recursive: true });
await writeFile(path.join(target, "core.min.mjs"), `// @recast-navigation/core ${version}, by Isaac Mason: MIT License (LICENSE); Recast and Detour by Mikko Mononen: zlib License\n${code}`);

// The WebAssembly module and its glue, as they are (the glue finds the module beside it)
for (const file of ["recast-navigation.wasm.js", "recast-navigation.wasm.wasm"]) {
    await copyFile(path.join(wasm, "dist", file), path.join(target, file));
}

await copyFile(path.join(core, "LICENSE"), path.join(target, "LICENSE"));
await writeFile(
    path.join(target, "LICENSE-recastnavigation.txt"),
    `Recast and Detour (https://github.com/recastnavigation/recastnavigation), built into recast-navigation.wasm.*:

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
