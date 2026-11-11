/* global console, process, URL */
// How fast a model's feet carry it in a clip that walks in place: each foot's position through the
// clip (forward pose, metres, by forward kinematics), and the speed a planted foot slides back at
// (the clip's pace). node stride.mjs <file.glb> <clip> <foot bone>...
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../utilities/blenderpipeline/package.json", import.meta.url));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptDecoder } = require("meshoptimizer");
const [file, clipName, ...feet] = process.argv.slice(2);

await MeshoptDecoder.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();
const clip = root.listAnimations().find((one) => one.getName() === clipName);
const channels = new Map();
let end = 0;

for (const channel of clip.listChannels()) {
    const key = `${channel.getTargetNode().getName()}|${channel.getTargetPath()}`;

    channels.set(key, channel.getSampler());
    end = Math.max(end, channel.getSampler().getInput().getArray().at(-1));
}

const lerp = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const slerp = (a, b, u) => {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const c = dot < 0 ? b.map((v) => -v) : b;
    const q = lerp(a, c, u);
    const l = Math.hypot(...q);

    return q.map((v) => v / l);
};
const value = (sampler, t, rotation) => {
    const times = sampler.getInput().getArray();
    const out = sampler.getOutput();
    const k = times.findIndex((time) => time > t);

    if (k <= 0) {
        return out.getElement(k < 0 ? times.length - 1 : 0, []);
    }

    const u = (t - times[k - 1]) / (times[k] - times[k - 1]);
    const a = out.getElement(k - 1, []);
    const b = out.getElement(k, []);

    return rotation ? slerp(a.map((v) => v / Math.hypot(...a)), b.map((v) => v / Math.hypot(...b)), u) : lerp(a, b, u);
};
const compose = (t, r, s) => {
    const [x, y, z, w] = r;
    const m = [
        (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
        2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
        2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
        t[0], t[1], t[2], 1,
    ];

    return m;
};
const multiply = (a, b) => {
    const out = new Array(16).fill(0);

    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            for (let k = 0; k < 4; k++) {
                out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
            }
        }
    }

    return out;
};
const parents = new Map();

for (const node of root.listNodes()) {
    for (const child of node.listChildren()) {
        parents.set(child, node);
    }
}

const local = (node, t) => {
    const name = node.getName();
    const tr = channels.get(`${name}|translation`);
    const ro = channels.get(`${name}|rotation`);
    const sc = channels.get(`${name}|scale`);

    return compose(tr ? value(tr, t, false) : node.getTranslation(), ro ? value(ro, t, true) : node.getRotation(), sc ? value(sc, t, false) : node.getScale());
};
const world = (node, t) => {
    const parent = parents.get(node);

    return parent ? multiply(world(parent, t), local(node, t)) : local(node, t);
};
const nodes = Object.fromEntries(root.listNodes().map((node) => [node.getName(), node]));
const step = 1 / 30;

for (const foot of feet) {
    const track = [];

    for (let t = 0; t <= end + 1e-6; t += step) {
        const m = world(nodes[foot], t);

        track.push({ t, y: m[13], z: m[14] });
    }

    // (Planted: within 4 cm of its lowest; its slide back there, m/s)
    const low = Math.min(...track.map(({ y }) => y));
    const speeds = [];

    for (let k = 1; k < track.length; k++) {
        if (track[k].y < low + 0.04 && track[k - 1].y < low + 0.04) {
            speeds.push(-(track[k].z - track[k - 1].z) / step);
        }
    }

    speeds.sort((a, b) => a - b);
    console.log(`${clipName} ${foot}: z from ${Math.min(...track.map(({ z }) => z)).toFixed(2)} to ${Math.max(...track.map(({ z }) => z)).toFixed(2)}, lowest ${low.toFixed(3)}; planted ${speeds.length} frames, sliding back at median ${(speeds[Math.floor(speeds.length / 2)] ?? 0).toFixed(2)} m/s`);
}
