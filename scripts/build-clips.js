// Takes the motion-capture clips the lab tries out from Mesh2Motion's human animations
// (github.com/Mesh2Motion/mesh2motion-app, static/animations: "3d models, rigs, and animations
// are all licensed under CC0"; the clips are Quaternius's Universal Animation Library):
//
//     git clone --depth 1 https://github.com/Mesh2Motion/mesh2motion-app ../mesh2motion-app
//     npm run build:clips -- --from=../mesh2motion-app/static/animations
//
// It writes client/characters/animations/mesh2motion.glb: the skeleton (its 66 joints, without
// the mannequin's mesh) and the clips chosen below, each named for what it is. Only what moves is
// kept: each joint's rotation, and the pelvis's position (the joints' lengths never change), and
// none that only holds the rest pose. bvh.js retargets them to our skeleton (the character lab
// plays them). And it bakes the clips the game plays (bake-clips.js BAKES) into key poses:
// client/js/characters/clip-keys.js.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { bakeAll, keysModule, referenceBody } from "./bake-clips.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The clips: what each is called here, and where it's taken from. */
export const CLIPS = [
    { name: "idle", file: "human-base-animations.glb", source: "Idle_A" },
    { name: "walk", file: "human-base-animations.glb", source: "Walk" },
    { name: "run", file: "human-base-animations.glb", source: "Jog" },
    { name: "sword", file: "human-base-animations.glb", source: "Sword_Attack" },
    { name: "death", file: "human-addon-animations.glb", source: "Death_A" },
];

// A channel that never strays further than this from the rest pose is left out
const STILL = 1e-5;

const same = (a, b, tolerance = STILL) => a.length === b.length && a.every((value, i) => Math.abs(value - b[i]) <= tolerance);

/** Build the GLB from Mesh2Motion's files in `from`. */
export async function buildClips(from, clips = CLIPS) {
    const io = new NodeIO();
    const sources = new Map();
    const read = async (file) => {
        if (!sources.has(file)) {
            sources.set(file, await io.readBinary(readFileSync(path.join(from, file))));
        }

        return sources.get(file);
    };

    // The skeleton, from the first file's scene, without the mannequin
    const document = new Document();
    const buffer = document.createBuffer();
    const scene = document.createScene("skeleton");
    const nodes = new Map();
    const copy = (node, parent) => {
        if (node.getMesh()) {
            return;
        }

        const ours = document.createNode(node.getName()).setTranslation(node.getTranslation()).setRotation(node.getRotation()).setScale(node.getScale());

        nodes.set(node.getName(), ours);
        (parent ?? scene).addChild(ours);
        node.listChildren().forEach((child) => copy(child, ours));
    };

    (await read(clips[0].file)).getRoot().getDefaultScene().listChildren().forEach((node) => copy(node, null));
    document.getRoot().getAsset().copyright = "Mesh2Motion (mesh2motion.org), CC0 1.0; clips from Quaternius's Universal Animation Library";

    for (const { name, file, source } of clips) {
        const animation = (await read(file)).getRoot().listAnimations().find((each) => each.getName() === source);

        if (!animation) {
            throw new Error(`No clip "${source}" in ${file}`);
        }

        const clip = document.createAnimation(name).setExtras({ source, file });
        const times = [];

        for (const channel of animation.listChannels()) {
            const node = channel.getTargetNode();
            const property = channel.getTargetPath();
            const ours = nodes.get(node.getName());
            const sampler = channel.getSampler();
            const input = sampler.getInput().getArray();
            const output = sampler.getOutput().getArray();
            const size = sampler.getOutput().getElementSize();

            // Rotations, and where the pelvis is: whatever else moves isn't kept
            if (!ours || !(property === "rotation" || (property === "translation" && node.getName() === "pelvis"))) {
                continue;
            }

            const rest = property === "rotation" ? ours.getRotation() : ours.getTranslation();
            const keys = Array.from({ length: input.length }, (_, k) => Array.from(output.slice(k * size, (k + 1) * size)));

            if (keys.every((key) => same(key, rest))) {
                continue;
            }

            // Held the whole clip: one key
            const held = keys.every((key) => same(key, keys[0]));
            const keyTimes = held ? Float32Array.of(input[0]) : Float32Array.from(input);
            const values = held ? Float32Array.from(keys[0]) : Float32Array.from(output);
            let accessor = times.find((each) => same(each.getArray(), keyTimes, 0));

            if (!accessor) {
                accessor = document.createAccessor().setType("SCALAR").setArray(keyTimes).setBuffer(buffer);
                times.push(accessor);
            }

            const valueAccessor = document.createAccessor().setType(size === 4 ? "VEC4" : "VEC3").setArray(values).setBuffer(buffer);
            const ourSampler = document.createAnimationSampler().setInput(accessor).setOutput(valueAccessor).setInterpolation(held ? "STEP" : sampler.getInterpolation());

            clip.addSampler(ourSampler).addChannel(document.createAnimationChannel().setTargetNode(ours).setTargetPath(property).setSampler(ourSampler));
        }
    }

    return io.writeBinary(document);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const from = process.argv.find((arg) => arg.startsWith("--from="))?.slice("--from=".length);

    if (!from) {
        console.error("Usage: npm run build:clips -- --from=<mesh2motion-app/static/animations>");
        process.exit(1);
    }

    const glb = await buildClips(from);
    const out = path.join(root, "client/characters/animations/mesh2motion.glb");

    writeFileSync(out, glb);
    console.log(`${path.relative(root, out)}: ${CLIPS.length} clips, ${(glb.byteLength / 1024).toFixed(0)} KB`);

    const baked = await bakeAll(from);
    const keys = path.join(root, "client/js/characters/clip-keys.js");

    writeFileSync(keys, keysModule(baked, { height: referenceBody().character.height }));
    console.log(`${path.relative(root, keys)}: ${Object.keys(baked).length} clips baked into ${Object.values(baked).reduce((sum, { keys: each }) => sum + each.length, 0)} keys`);
}
