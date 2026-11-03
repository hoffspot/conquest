/* global console, process, URL */
// How far each named bone turns from its rest (degrees) through each clip of a GLB, sampled every
// `step` seconds; and its root's travel. node jaws.mjs <file.glb> <step> <bone>[,<bone>...] [clip...]
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../utilities/blenderpipeline/package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder } = require("meshoptimizer");
const [file, stepArg, bonesArg, ...only] = process.argv.slice(2);
const step = Number(stepArg);
const bones = bonesArg.split(",");

await MeshoptDecoder.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();
const angle = (q, r) => {
    const dot = Math.abs(q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3]);

    return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
};
const sample = (sampler, t) => {
    const times = sampler.getInput().getArray();
    let k = times.findIndex((time) => time > t);

    k = k < 0 ? times.length - 1 : Math.max(0, k - 1);

    // (Its values as they are, normalized integers made fractions)
    const q = sampler.getOutput().getElement(k, []);
    const length = Math.hypot(...q) || 1;

    return q.map((v) => v / length);
};

for (const animation of root.listAnimations()) {
    const name = animation.getName();

    if (only.length && !only.includes(name)) {
        continue;
    }

    const rows = {};
    let end = 0;

    for (const channel of animation.listChannels()) {
        const node = channel.getTargetNode();
        const times = channel.getSampler().getInput().getArray();

        end = Math.max(end, times[times.length - 1]);

        if (channel.getTargetPath() === "rotation" && bones.includes(node.getName())) {
            const rest = node.getRotation();

            rows[node.getName()] = (t) => angle(sample(channel.getSampler(), t), rest);
        }
    }

    console.log(`\n${name} (${end.toFixed(2)} s)`);

    for (const bone of bones) {
        if (!rows[bone]) {
            console.log(`  ${bone.padEnd(12)} (still)`);
            continue;
        }

        const line = [];

        for (let t = 0; t <= end + 1e-6; t += step) {
            line.push(rows[bone](t).toFixed(0).padStart(3));
        }

        console.log(`  ${bone.padEnd(12)} ${line.join(" ")}`);
    }
}
