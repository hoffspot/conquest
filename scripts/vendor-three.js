// Copies Three.js from node_modules into client/vendor/three-r<revision>/, minified.
//
// The game has no build step: the browser loads these files directly (see the import map in
// client/index.html). Three.js stopped publishing minified builds in r186, so they are minified
// here with esbuild. Run this after changing the "three" version in package.json:
//
//     npm install && npm run vendor:three
//
// then update the import map in client/index.html and CACHE_NAME in client/sw.js, and delete the
// old vendor folder. Add-ons (the glTF loader, and meshoptimizer's decoder for the models it reads
// compressed) are copied to addons/ and imported as three/addons/. Run it too after changing which
// add-ons are copied (ADDONS), then npm run build:manifest.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const three = path.join(root, "node_modules/three");
const { version } = JSON.parse(await readFile(path.join(three, "package.json"), "utf8"));
const revision = version.split(".")[1];
const target = path.join(root, `client/vendor/three-r${revision}`);

await mkdir(target, { recursive: true });

// three.module.js (the WebGL renderer) imports everything else from three.core.js
for (const name of ["three.core", "three.module"]) {
    const source = await readFile(path.join(three, "build", `${name}.js`), "utf8");
    const { code } = await transform(source, { minify: true, format: "esm", legalComments: "inline" });

    await writeFile(path.join(target, `${name}.min.js`), code.replaceAll("./three.core.js", "./three.core.min.js"));
}

// Add-ons the game and the character lab use (loading glTF models, and decoding those compressed
// with meshoptimizer, as utilities/blenderpipeline makes them; orbiting the camera, lighting with a
// studio environment), keeping their paths so their relative imports work
const ADDONS = ["loaders/GLTFLoader.js", "libs/meshopt_decoder.module.js", "utils/BufferGeometryUtils.js", "utils/SkeletonUtils.js", "controls/OrbitControls.js", "environments/RoomEnvironment.js"];

for (const addon of ADDONS) {
    const source = await readFile(path.join(three, "examples/jsm", addon), "utf8");
    const { code } = await transform(source, { minify: true, format: "esm", legalComments: "inline" });
    const file = path.join(target, "addons", addon);

    // (An add-on that isn't Three.js's own keeps its licence's notice, which minifying would drop:
    // meshoptimizer's decoder)
    const notice = source.match(/^(\/\/[^\n]*\n)+/)?.[0] ?? "";

    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, /licen[cs]e/i.test(notice) ? notice + code : code);
}

// (meshoptimizer's licence, beside its decoder)
await copyFile(path.join(root, "node_modules/meshoptimizer/LICENSE.md"), path.join(target, "addons/libs/meshopt_decoder.LICENSE.md"));
await copyFile(path.join(three, "LICENSE"), path.join(target, "LICENSE"));

console.log(`Three.js ${version} copied to ${path.relative(root, target)}`);
