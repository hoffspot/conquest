/* global console, process, URL */
// A bone's rotation keys (quaternions) in a clip, the first few: node rootkeys.mjs <file.glb> <clip> <bone> [count]
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../utilities/blenderpipeline/package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder } = require("meshoptimizer");
const [file, clipName, bone, count = "6"] = process.argv.slice(2);

await MeshoptDecoder.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const clip = doc.getRoot().listAnimations().find((one) => one.getName() === clipName);
const node = doc.getRoot().listNodes().find((one) => one.getName() === bone);

console.log(`${bone} rest`, node.getRotation().map((v) => v.toFixed(3)).join(", "));

for (const channel of clip.listChannels().filter((each) => each.getTargetNode() === node)) {
    const sampler = channel.getSampler();
    const times = sampler.getInput().getArray();
    const rows = [];

    for (let k = 0; k < Math.min(times.length, Number(count)); k++) {
        const v = sampler.getOutput().getElement(k, []);
        const l = channel.getTargetPath() === "rotation" ? Math.hypot(...v) : 1;

        rows.push(`${times[k].toFixed(3)}: [${v.map((x) => (x / l).toFixed(3)).join(", ")}]`);
    }

    console.log(`${clipName} ${channel.getTargetPath()} (${times.length} keys)`, rows.join("  "));
}
