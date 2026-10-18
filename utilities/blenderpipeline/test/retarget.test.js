// lib/retarget.js (clips from another skeleton's file), and lib/optimize.js's other help for a
// bought model: vertices given from one bone to another, morph targets left out; on documents made
// in code (test/helpers.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Document } from "@gltf-transform/core";
import { Quaternion, Vector3 } from "three";
import { channelsByNode, sampleChannel, visitVertices, worldMatrix } from "../lib/animation.js";
import { keepMorphs, moveWeights } from "../lib/optimize.js";
import { retargetClips } from "../lib/retarget.js";
import { figureDocument, near, skinnedDocument, vertices } from "./helpers.js";

const nodeOf = (document, name) => document.getRoot().listNodes().find((node) => node.getName() === name);
const clipOf = (document, name) => document.getRoot().listAnimations().find((animation) => animation.getName() === name);
const placeAt = (document, bone, clip, time) => new Vector3().setFromMatrixPosition(worldMatrix(nodeOf(document, bone), channelsByNode(clipOf(document, clip)), time)).toArray();
const about = (axis, angle) => new Quaternion().setFromAxisAngle(new Vector3(...axis), angle).toArray();

// The source: a T-posed figure 1 m to the hips; here: an A-posed one twice its size, with a tail
const source = () => figureDocument({ clips: true });
const target = (options = {}) => figureDocument({ pose: "A", size: 2, tail: true, ...options });

describe("clips from another skeleton's file", () => {
    it("lays each bone as its pair rests, then turns it as that one turns", () => {
        const document = target();
        const made = retargetClips(document, source(), { clips: { Raise: "Wave" } });

        assert.deepEqual(made.bones, ["hips", "spine", "arm", "hand", "thigh", "foot"]);
        assert.equal(made.hips, "hips");
        assert.ok(near(made.scale, 2));
        assert.deepEqual(made.clips, [{ from: "Raise", name: "Wave", seconds: 1 }]);

        // (The arm, lowered 45 degrees at rest, held out level as the source's is; then raised)
        assert.ok(near(placeAt(document, "hand", "Wave", 0), [1.4, 3, 0]));
        assert.ok(near(placeAt(document, "hand", "Wave", 0.5), [0.4 + Math.SQRT1_2, 3 + Math.SQRT1_2, 0]));
        assert.ok(near(placeAt(document, "hand", "Wave", 1), [0.4, 4, 0]));
        assert.ok(near(sampleChannel(channelsByNode(clipOf(document, "Wave")).get(nodeOf(document, "arm")).rotation, 1), about([0, 0, 1], Math.PI / 2)));
    });

    it("plays the clip without the armature's own keys, and keyframes it as often as asked", () => {
        const document = target();

        retargetClips(document, source(), { clips: { Raise: "Wave" }, fps: 10 });

        const wave = clipOf(document, "Wave");

        assert.ok(near(placeAt(document, "hips", "Wave", 1), [0, 2, 0]));
        assert.ok(wave.listChannels().every((channel) => channel.getTargetNode().getName() !== "Armature"));
        assert.equal(wave.listSamplers()[0].getInput().getCount(), 11);
    });

    it("carries the hips as the other's go, scaled by how high each stands at them", () => {
        const document = target();

        retargetClips(document, source(), { clips: { Bob: "Bob" } });

        assert.ok(near(placeAt(document, "hips", "Bob", 0), [0, 2, 0]));
        assert.ok(near(placeAt(document, "hips", "Bob", 1), [0, 1, 0.5]));
        assert.ok(near(placeAt(document, "foot", "Bob", 0), [0.2, 0, 0]));
    });

    it("scales a crawler's by how far its bones reach from the hips, its lowest", () => {
        const document = target();
        const made = retargetClips(document, source(), { clips: { Bob: "Bob" }, bones: { thigh: null, foot: null } });

        assert.ok(near(made.scale, 2));
        assert.ok(near(placeAt(document, "hips", "Bob", 1), [0, 1, 0.5]));
    });

    it("leaves a bone the other hasn't got as it rests on its parent", () => {
        const document = target();

        retargetClips(document, source(), { clips: { Bob: "Bob" } });

        assert.ok(clipOf(document, "Bob").listChannels().every((channel) => channel.getTargetNode().getName() !== "tail"));
        assert.ok(near(placeAt(document, "tail", "Bob", 1), [0, 1, -0.5]));
    });

    it("pairs bones of other names as asked, and leaves out those it's told to", () => {
        const document = target({ names: { arm: "upperarm" } });
        const made = retargetClips(document, source(), { clips: { Raise: "Wave" }, bones: { upperarm: "arm", spine: null } });

        assert.deepEqual(made.bones, ["hips", "upperarm", "hand", "thigh", "foot"]);
        assert.ok(near(placeAt(document, "hand", "Wave", 1), [0.4, 4, 0]));
    });

    it("only turns a bone left unaligned, from where it rests", () => {
        const document = target();

        retargetClips(document, source(), { clips: { Raise: "Wave" }, unaligned: (name) => name === "arm" });

        assert.ok(near(placeAt(document, "hand", "Wave", 0), [0.4 + Math.SQRT1_2, 3 - Math.SQRT1_2, 0]));
        assert.ok(near(placeAt(document, "hand", "Wave", 1), [0.4 + Math.SQRT1_2, 3 + Math.SQRT1_2, 0]));
    });

    it("says what it can't do", () => {
        assert.throws(() => retargetClips(target(), source(), { clips: { Run: "Run" } }), /its file has no clip Run \(it has Raise, Bob\)/);
        assert.throws(() => retargetClips(figureDocument({ clips: true }), source(), { clips: { Bob: "Bob" } }), /there's a clip Bob already/);
        assert.throws(() => retargetClips(target({ names: { hips: "a", spine: "b", arm: "c", hand: "d", thigh: "e", foot: "f" } }), source(), { clips: { Bob: "Bob" } }), /no bones here have the names of its \(hips, spine, arm, hand, thigh, foot\.\.\.\)/);
        assert.throws(() => retargetClips(target(), new Document(), { clips: { Bob: "Bob" } }), /its file has no skeleton \(no skin\) to take clips from/);
    });
});

describe("vertices given from one bone to another", () => {
    it("moves them with the other bone, adding to what it moved of them", () => {
        const document = skinnedDocument();

        // (The spine's triangle given to the root: it no longer turns as the spine waves)
        assert.equal(moveWeights(document, { spine: "root" }), 3);

        const waved = vertices(document, visitVertices, { animation: clipOf(document, "Wave"), time: 1 });

        assert.ok(near(waved[5], [0, 1.5, 0]));

        const weights = document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("WEIGHTS_0");

        assert.deepEqual(weights.getElement(4, []), [1, 0, 0, 0]);
        assert.throws(() => moveWeights(skinnedDocument(), { neck: "root" }), /reweight: there's no bone neck/);
    });
});

describe("morph targets kept by name", () => {
    // (A triangle with three shapes, weighed by a clip in two keyframes)
    const shaped = () => {
        const document = new Document();
        const buffer = document.createBuffer();
        const accessor = (type, values) => document.createAccessor().setType(type).setArray(new Float32Array(values)).setBuffer(buffer);
        const primitive = document.createPrimitive().setAttribute("POSITION", accessor("VEC3", [0, 0, 0, 1, 0, 0, 0, 1, 0]));

        for (let i = 0; i < 3; i++) {
            primitive.addTarget(document.createPrimitiveTarget().setAttribute("POSITION", accessor("VEC3", [0, 0, i, 0, 0, i, 0, 0, i])));
        }

        const mesh = document.createMesh("Head").addPrimitive(primitive).setWeights([0.1, 0.2, 0.3]).setExtras({ targetNames: ["blink", "jawOpen", "smile"], kept: true });
        const node = document.createNode("Head").setMesh(mesh);
        const sampler = document.createAnimationSampler().setInput(accessor("SCALAR", [0, 1])).setOutput(accessor("SCALAR", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]));

        document.createScene().addChild(node);
        document.createAnimation("Talk").addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath("weights").setSampler(sampler));

        return document;
    };

    it("leaves out the rest, and their weights in each keyframe", () => {
        const document = shaped();
        const mesh = document.getRoot().listMeshes()[0];

        assert.equal(keepMorphs(document, ["jawOpen"]), 2);
        assert.equal(mesh.listPrimitives()[0].listTargets().length, 1);
        assert.deepEqual(mesh.listPrimitives()[0].listTargets()[0].getAttribute("POSITION").getElement(0, []), [0, 0, 1]);
        assert.deepEqual(mesh.getExtras(), { kept: true, targetNames: ["jawOpen"] });
        assert.ok(near(mesh.getWeights(), [0.2]));
        assert.ok(near(Array.from(document.getRoot().listAnimations()[0].listChannels()[0].getSampler().getOutput().getArray()), [0.2, 0.5]));
    });

    it("leaves out the clips' channels for a mesh left with none", () => {
        const document = shaped();

        assert.equal(keepMorphs(document, []), 3);
        assert.deepEqual(document.getRoot().listMeshes()[0].getExtras(), { kept: true });
        assert.equal(document.getRoot().listAnimations()[0].listChannels().length, 0);
        assert.equal(keepMorphs(document, []), 0);
    });
});
