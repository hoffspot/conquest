/* global console, process, URL */
// Where named bones are at rest in a GLB, in the model's own space (metres): node bonepos.mjs <file.glb> <bone>...
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../utilities/blenderpipeline/package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder } = require("meshoptimizer");
const [file, ...names] = process.argv.slice(2);

await MeshoptDecoder.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);

for (const node of doc.getRoot().listNodes()) {
    if (names.includes(node.getName())) {
        const m = node.getWorldMatrix();

        console.log(node.getName().padEnd(14), [m[12], m[13], m[14]].map((v) => v.toFixed(3)).join(", "));
    }
}
