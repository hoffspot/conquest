// lib/animation.js, lib/transform.js, lib/optimize.js's tangent mending, still channels, thinned
// keyframes and packed lower details, and lib/ktx2.js, on a document made in code (test/helpers.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Quaternion, Vector3 } from "three";
import { bounds, channelsByNode, duration, loops, playInPlace, rootMotion, sampleChannel, visitVertices, worldMatrix } from "../lib/animation.js";
import { eased, inventClip } from "../lib/invent.js";
import { decodeImage, encodeImage, shrinkImage, textureUses } from "../lib/ktx2.js";
import { inventClips, mendTangents, packLod, restFromClip, thinKeys, trimStill } from "../lib/optimize.js";
import { moveDocument, scaleDocument } from "../lib/transform.js";
import { near, skinnedDocument, vertices } from "./helpers.js";

const clip = (document, name) => document.getRoot().listAnimations().find((animation) => animation.getName() === name);

describe("sampling a clip", () => {
    it("interpolates translations in a straight line and rotations along the sphere", () => {
        const document = skinnedDocument();
        const walk = channelsByNode(clip(document, "Walk"));
        const root = document.getRoot().listNodes().find((node) => node.getName() === "root");
        const spine = document.getRoot().listNodes().find((node) => node.getName() === "spine");

        assert.ok(near(sampleChannel(walk.get(root).translation, 0.25), [0, 0.05, 0.5]));
        assert.ok(near(sampleChannel(walk.get(root).translation, 9), [0, 0, 2]));

        const halfway = sampleChannel(walk.get(spine).rotation, 0.25);

        assert.ok(near(Math.hypot(...halfway), 1));
        assert.ok(near(halfway, [0, Math.sin(0.075), 0, Math.cos(0.075)], 1e-3));
    });

    it("holds a STEP channel's value till its next keyframe", () => {
        const document = skinnedDocument();
        const channel = clip(document, "Walk").listChannels()[0];

        channel.getSampler().setInterpolation("STEP");
        assert.ok(near(sampleChannel(channel, 0.4), [0, 0, 0]));
        assert.ok(near(sampleChannel(channel, 0.6), [0, 0.1, 1]));
    });

    it("measures a clip by its last keyframe", () => {
        assert.equal(duration(clip(skinnedDocument(), "Walk")), 1);
    });
});

describe("skinning as Three.js skins", () => {
    it("puts the mesh where it is at rest, and moves it with its bones", () => {
        const document = skinnedDocument();
        const box = bounds(document);

        assert.ok(near(box.min, [-0.5, 0, 0]));
        assert.ok(near(box.max, [0.5, 1.5, 0]));

        // (Waving: the spine's triangle turned a quarter about z, round the spine)
        const waved = vertices(document, visitVertices, { animation: clip(document, "Wave"), time: 1 });

        assert.ok(near(waved[5], [-0.5, 1, 0]));
        assert.ok(near(waved[0], [-0.5, 0, 0]));
    });
});

describe("root motion", () => {
    it("finds the bone carried across the ground, how far and how fast", () => {
        const document = skinnedDocument();
        const motion = rootMotion(document, clip(document, "Walk"));

        assert.equal(motion.bone, "root");
        assert.ok(near(motion.distance, 2));
        assert.ok(near(motion.speed, 2));
        assert.ok(near(motion.direction, [0, 1]));
        assert.equal(rootMotion(document, clip(document, "Wave")).distance, 0);
    });

    it("measures it in the world, whatever the armature's turned to", () => {
        const document = skinnedDocument({ armatureTurn: Math.PI / 2 });
        const motion = rootMotion(document, clip(document, "Walk"));

        assert.ok(near(motion.distance, 2));
        assert.ok(near(motion.direction, [1, 0]));
    });

    it("takes the travel out to play in place, keeping the bounce", () => {
        for (const armatureTurn of [0, Math.PI / 3]) {
            const document = skinnedDocument({ armatureTurn, armatureAt: [3, 0, -1] });
            const walk = clip(document, "Walk");
            const taken = playInPlace(document, walk);
            const root = document.getRoot().listNodes().find((node) => node.getName() === "root");
            const channel = channelsByNode(walk).get(root).translation;

            assert.ok(near(taken.distance, 2));
            assert.ok(near(sampleChannel(channel, 1), [0, 0, 0], 1e-5));
            assert.ok(near(sampleChannel(channel, 0.5)[1], 0.1));
            assert.ok(near(rootMotion(document, walk).distance, 0, 1e-5));
        }
    });

    it("can be told which bone carries it", () => {
        const document = skinnedDocument();

        assert.equal(rootMotion(document, clip(document, "Walk"), { rootBone: "spine" }).bone, "spine");
        assert.throws(() => rootMotion(document, clip(document, "Walk"), { rootBone: "tail" }), /no bone tail/);
    });
});

describe("looping", () => {
    it("knows a clip that ends as it starts (its travel aside) from one that doesn't", () => {
        const document = skinnedDocument();

        assert.equal(loops(document, clip(document, "Walk")), true);
        assert.equal(loops(document, clip(document, "Wave")), false);
    });
});

describe("resizing and turning a whole document", () => {
    it("scales the skinned mesh, its bones and its clips alike", () => {
        const document = skinnedDocument({ armatureAt: [1, 0, 0] });
        const walk = clip(document, "Walk");
        const before = vertices(document, visitVertices, { animation: walk, time: 0.5 });

        scaleDocument(document, 2);

        const after = vertices(document, visitVertices, { animation: walk, time: 0.5 });

        after.forEach((point, i) => assert.ok(near(point, before[i].map((v) => v * 2)), `vertex ${i}`));
        assert.ok(near(rootMotion(document, walk).distance, 4));
    });

    it("turns it counterclockwise from above and moves it, clips and all", () => {
        const document = skinnedDocument();
        const walk = clip(document, "Walk");

        moveDocument(document, { turn: Math.PI / 2, offset: [0, 1, 0] });

        const box = bounds(document);

        assert.ok(near(box.min, [0, 1, -0.5]));
        assert.ok(near(box.max, [0, 2.5, 0.5]));

        // (Walking +z, turned a quarter: walking +x)
        assert.ok(near(rootMotion(document, walk).direction, [1, 0]));
    });

    it("leaves a skinned mesh's own node alone (its bones move it)", () => {
        const document = skinnedDocument();
        const body = document.getRoot().listNodes().find((node) => node.getName() === "Body");

        moveDocument(document, { turn: 1, offset: [5, 0, 0] });
        assert.deepEqual(body.getTranslation(), [0, 0, 0]);
        assert.deepEqual(body.getRotation(), [0, 0, 0, 1]);
    });
});

describe("mending tangents", () => {
    it("gives a tangent of no length one along the surface, and scales one too long, leaving the rest", () => {
        const document = skinnedDocument();
        const body = document.getRoot().listMeshes()[0].listPrimitives()[0];
        const accessor = (array) => document.createAccessor().setType(array.length === 24 ? "VEC4" : "VEC3").setArray(array).setBuffer(document.getRoot().listBuffers()[0]);
        const up = Math.SQRT1_2;

        body.setAttribute("NORMAL", accessor(new Float32Array([0, 0, 1, 0, 0, 1, 0, up, up, 0, 0, 1, 0, 0, 1, 0, 0, 1])));
        body.setAttribute("TANGENT", accessor(new Float32Array([1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 0, 0, 0, 2, 0, 1, 1, 0, 0, -1, 1, 0, 0, 1])));

        assert.equal(mendTangents(document), 3);

        const tangents = Array.from({ length: 6 }, (_, i) => body.getAttribute("TANGENT").getElement(i, []));
        const normals = Array.from({ length: 6 }, (_, i) => body.getAttribute("NORMAL").getElement(i, []));

        for (const [i, tangent] of tangents.entries()) {
            assert.ok(near(Math.hypot(tangent[0], tangent[1], tangent[2]), 1), `tangent ${i} a unit long`);
            assert.ok(near(tangent[0] * normals[i][0] + tangent[1] * normals[i][1] + tangent[2] * normals[i][2], 0), `tangent ${i} along the surface`);
        }

        // (Its handedness kept; one with none made right-handed)
        assert.equal(tangents[1][3], -1);
        assert.equal(tangents[2][3], 1);
        assert.ok(near(tangents[3], [0, 1, 0, 1]));
        assert.ok(near(tangents[0], [1, 0, 0, 1]));
        assert.equal(mendTangents(document), 0);
    });
});

describe("leaving out what doesn't move", () => {
    it("drops a channel that holds a bone where it stands at rest, and keeps those that move it", () => {
        const document = skinnedDocument();
        const walk = clip(document, "Walk");
        const spine = document.getRoot().listNodes().find((node) => node.getName() === "spine");
        const still = document.createAnimationSampler().setInput(walk.listSamplers()[0].getInput()).setInterpolation("LINEAR");

        // (The spine's scale, 1 throughout, as it is at rest)
        still.setOutput(document.createAccessor().setType("VEC3").setArray(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1])).setBuffer(document.getRoot().listBuffers()[0]));
        walk.addSampler(still).addChannel(document.createAnimationChannel().setTargetNode(spine).setTargetPath("scale").setSampler(still));

        assert.equal(trimStill(document), 1);
        assert.deepEqual(
            walk.listChannels().map((channel) => `${channel.getTargetNode().getName()} ${channel.getTargetPath()}`),
            ["root translation", "spine rotation"],
        );
        assert.equal(trimStill(document), 0);
    });
});

describe("clips made up from others", () => {
    const bone = (document, name) => document.getRoot().listNodes().find((node) => node.getName() === name);
    const tip = (document, animation, time) => new Vector3(0, 1, 0).transformDirection(worldMatrix(bone(document, "spine"), channelsByNode(animation), time));
    const turnOf = (document, animation, name, time) => new Quaternion().fromArray(sampleChannel(channelsByNode(animation).get(bone(document, name)).rotation, time));

    it("eases from key to key, holding each", () => {
        const keys = [[0, 0], [1, 10], [2, 10]];

        assert.equal(eased(keys, -1), 0);
        assert.equal(eased(keys, 0.5), 5);
        assert.ok(eased(keys, 0.25) < 2.5);
        assert.equal(eased(keys, 1.5), 10);
        assert.deepEqual(eased([[0, [0, 0, 0]], [1, [2, 4, 6]]], 0.5), [1, 2, 3]);
    });

    it("is a stretch of the clip it's made from, with bones turned about the creature's axes", () => {
        const document = skinnedDocument();
        const walk = clip(document, "Walk");
        const made = inventClip(document, { name: "Rear", from: "Walk", start: 0.5, seconds: 0.5, hold: 0, layers: [{ bones: ["spine"], turn: "pitch", keys: [[0, 0], [0.25, 90], [0.5, 90]] }] });

        assert.equal(made.getName(), "Rear");
        assert.ok(near(duration(made), 0.5));

        // (Where it starts, as the walk is there; then its spine, standing up, pitched back a quarter turn)
        assert.ok(near(tip(document, made, 0).toArray(), tip(document, walk, 0.5).toArray()));
        assert.ok(near(tip(document, made, 0.5).toArray(), [0, 0, -1]));
    });

    it("holds each bone back on the one before by its lag, and turns each by its weight", () => {
        const document = skinnedDocument();
        const made = inventClip(document, { name: "Whip", from: "Walk", hold: 0, seconds: 1, layers: [{ bones: ["root", "spine"], turn: "yaw", lag: 0.5, weights: [1, 2], keys: [[0, 0], [0.5, 10], [1, 10]] }] });
        const turned = (name, time) => (turnOf(document, made, name, time).angleTo(turnOf(document, made, name, 0)) * 180) / Math.PI;

        assert.ok(near(turned("root", 0.5), 10, 1e-3));
        assert.ok(near(turned("spine", 0.5), 0, 1e-3));
        assert.ok(near(turned("spine", 1), 20, 1e-3));
    });

    it("moves a bone along the creature's axes, in its parent's frame, however that's turned", () => {
        const document = skinnedDocument({ armatureTurn: Math.PI / 2 });
        const walk = clip(document, "Walk");
        const made = inventClip(document, { name: "Sink", from: "Walk", seconds: 1, layers: [{ bone: "root", move: [[0, [0, 0, 0]], [1, [0.5, -0.25, 2]]] }] });
        const at = (animation, time) => new Vector3().setFromMatrixPosition(worldMatrix(bone(document, "root"), channelsByNode(animation), time));

        assert.ok(near(at(made, 1).sub(at(walk, 1)).toArray(), [0.5, -0.25, 2]));
    });

    it("keys as often as the clip it's made from does, though its first bone is still", () => {
        const document = skinnedDocument();
        const buffer = document.getRoot().listBuffers()[0];
        const stand = document.createAnimation("Stand");
        const times = Array.from({ length: 21 }, (_, i) => i / 10);

        // (A baked rig's: the root held still, its first and last keys only; the spine swaying)
        for (const [name, path, at, values] of [
            ["root", "translation", [0, 2], [0, 0, 0, 0, 0, 0]],
            ["spine", "rotation", times, times.flatMap((t) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.1 * Math.sin(t * Math.PI)).toArray())],
        ]) {
            const sampler = document
                .createAnimationSampler()
                .setInput(document.createAccessor().setType("SCALAR").setArray(new Float32Array(at)).setBuffer(buffer))
                .setOutput(document.createAccessor().setType(path === "rotation" ? "VEC4" : "VEC3").setArray(new Float32Array(values)).setBuffer(buffer));

            stand.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(bone(document, name)).setTargetPath(path).setSampler(sampler));
        }

        const made = inventClip(document, { name: "Look", from: "Stand", layers: [{ bones: ["spine"], turn: "yaw", keys: [[0, 0], [1, 30], [2, 0]] }] });
        const turned = (turnOf(document, made, "spine", 1).angleTo(turnOf(document, stand, "spine", 1)) * 180) / Math.PI;

        assert.equal(channelsByNode(made).get(bone(document, "spine")).rotation.getSampler().getInput().getCount(), 21);
        assert.ok(near(turned, 30, 1e-2));
    });

    it("grafts another clip's motion onto some of its bones", () => {
        const document = skinnedDocument();
        const wave = clip(document, "Wave");
        const made = inventClip(document, { name: "Walk and wave", from: "Walk", layers: [{ graft: "Wave", bones: ["spine"] }] });

        assert.ok(near(turnOf(document, made, "spine", 0.75).toArray(), turnOf(document, wave, "spine", 0.75).toArray()));
        assert.ok(near(sampleChannel(channelsByNode(made).get(bone(document, "root")).translation, 1), [0, 0, 2]));

        // (A bone the other clip doesn't move, it has at rest: grafted, so it's held)
        const held = inventClip(document, { name: "Wave standing", from: "Walk", layers: [{ graft: "Wave", bones: ["root", "spine"] }] });

        assert.ok(near(sampleChannel(channelsByNode(held).get(bone(document, "root")).translation, 1), [0, 0, 0]));
    });

    it("grafts only a share of the other clip's motion, eased from key to key", () => {
        const document = skinnedDocument();
        const walk = clip(document, "Walk");
        const wave = clip(document, "Wave");
        const made = inventClip(document, { name: "Wave in", from: "Walk", hold: 0, layers: [{ graft: "Wave", bones: ["spine"], start: 1, keys: [[0, 0], [1, 1]] }] });
        const turned = (time) => turnOf(document, made, "spine", time);

        // (None of it at first, as the walk has it; all of it at the end; halfway between, eased)
        assert.ok(near(turned(0).toArray(), turnOf(document, walk, "spine", 0).toArray()));
        assert.ok(near(turned(1).toArray(), turnOf(document, wave, "spine", 1).toArray()));
        assert.ok(near((turned(0.5).angleTo(turned(0)) * 180) / Math.PI, 45, 0.5));
    });

    it("turns a bone about its axes as it lies at a moment of the clip made, after the layers before it (axes)", () => {
        const document = skinnedDocument();
        const graft = { graft: "Wave", bones: ["spine"], start: 1 };
        const lift = { bones: ["spine"], turn: "lift", keys: [[0, 30]] };
        const laid = inventClip(document, { name: "Laid", from: "Walk", hold: 0, seconds: 1, layers: [graft, { ...lift, axes: 1 }] });
        const turned = inventClip(document, { name: "Turned", from: "Walk", hold: 0, seconds: 1, layers: [graft, lift] });

        // (Laid on its side by the graft, pointing to the creature's right: lifted, its tip rises a
        // half; turned about its axes where the stretch starts, standing up, it swings round level)
        assert.ok(near(tip(document, laid, 1).y, 0.5, 1e-3));
        assert.ok(near(tip(document, turned, 1).y, 0, 1e-3));
    });

    it("makes one in the place of the clip of its name it's made from, and no other of a name there is", () => {
        const document = skinnedDocument();
        const made = inventClips(document, [{ name: "Wave", from: "Wave", layers: [{ bone: "root", move: [[0, [0, 0, 0]], [1, [0, 0, 1]]] }] }]);
        const waves = document
            .getRoot()
            .listAnimations()
            .filter((animation) => animation.getName() === "Wave");

        assert.deepEqual(made, [{ name: "Wave", from: "Wave" }]);
        assert.equal(waves.length, 1);
        assert.ok(near(sampleChannel(channelsByNode(waves[0]).get(document.getRoot().listNodes().find((node) => node.getName() === "root")).translation, 1), [0, 0, 1]));
        assert.throws(() => inventClips(document, [{ name: "Walk", from: "Wave", layers: [] }]), /clips.invent Walk: there's a clip Walk already/);
    });

    it("says which clip or bone isn't there", () => {
        const document = skinnedDocument();

        assert.throws(() => inventClip(document, { name: "Odd", from: "Swim", layers: [] }), /Odd: there's no clip Swim/);
        assert.throws(() => inventClip(document, { name: "Odd", from: "Walk", layers: [{ bones: ["tail"], turn: "yaw", keys: [[0, 0]] }] }), /there's no bone tail/);
    });
});

describe("lower detail packed in", () => {
    it("gives each mesh a simpler copy on the same skeleton and material, marked with its level", async () => {
        const document = skinnedDocument();
        const body = document.getRoot().listMeshes()[0];
        const [lower] = await packLod(document, 1, { ratio: 0.5 });
        const node = document.getRoot().listNodes().find((one) => one.getMesh() === lower);
        const full = document.getRoot().listNodes().find((one) => one.getMesh() === body);

        assert.equal(lower.getName(), "Body.lod1");
        assert.equal(node.getName(), "Body.lod1");
        assert.deepEqual(node.getExtras(), { lod: 1 });
        assert.equal(node.getSkin(), full.getSkin());
        assert.equal(lower.listPrimitives()[0].getMaterial(), body.listPrimitives()[0].getMaterial());
        assert.notEqual(lower.listPrimitives()[0].getAttribute("POSITION"), body.listPrimitives()[0].getAttribute("POSITION"));
        assert.ok(document.getRoot().listScenes()[0].listChildren().includes(node));

        // (A level's own copies aren't copied again)
        assert.equal((await packLod(document, 2, { ratio: 0.5 })).length, 1);
    });
});

describe("textures the GPU keeps compressed (KTX2)", () => {
    it("knows a normal map, a colour map and a data map by what they're used as", () => {
        const document = skinnedDocument();
        const [normal, colour, data] = ["n", "c", "d"].map((name) => document.createTexture(name));

        document.createMaterial().setNormalTexture(normal).setBaseColorTexture(colour).setOcclusionTexture(data).setMetallicRoughnessTexture(data);

        const uses = textureUses(document);

        assert.deepEqual([uses.get(normal), uses.get(colour), uses.get(data)], ["normal", "color", "data"]);
    });

    it("halves an image (each pixel the mean of four) down to a size", () => {
        const image = { data: new Uint8Array(4 * 4 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 2) % 2 ? 200 : 100)), width: 4, height: 4 };
        const small = shrinkImage(image, 1);

        assert.deepEqual([small.width, small.height], [1, 1]);
        assert.deepEqual([...small.data], [150, 150, 150, 255]);
    });

    it("encodes an image as KTX2, in ETC1S or UASTC, with mipmaps", async () => {
        const image = { data: new Uint8Array(8 * 8 * 4).map((_, i) => (i % 4 === 3 ? 255 : i % 251)), width: 8, height: 8 };

        for (const mode of ["etc1s", "uastc"]) {
            const bytes = await encodeImage(image, { mode, kind: "color" });

            // (KTX2's identifier, then its width and height, and its levels: 8, 4, 2 and 1 across)
            assert.deepEqual([...bytes.slice(0, 12)], [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
            assert.deepEqual([20, 24, 40].map((at) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true)), [8, 8, 4]);
        }
    });

    it("reads a PNG's pixels as RGBA", () => {
        // (A 1x1 red PNG, made by hand)
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
        const { data, width, height } = decodeImage(new Uint8Array(png), "image/png");

        assert.deepEqual([width, height, ...data], [1, 1, 255, 0, 0, 255]);
    });
});

describe("thinning keyframes", () => {
    it("keeps the nearest keyframe at each 1/fps, and always the last, so a clip keeps its length", () => {
        const document = skinnedDocument();
        const buffer = document.getRoot().listBuffers()[0];
        const [root, spine] = ["root", "spine"].map((name) => document.getRoot().listNodes().find((node) => node.getName() === name));
        const scalars = (array) => document.createAccessor().setType("SCALAR").setArray(new Float32Array(array)).setBuffer(buffer);

        // (A 0.75-second run keyed 60 times a second, 46 keyframes: two channels sharing them,
        // each key's value its own number; a slower and a cubic channel in a clip of their own)
        const frames = Array.from({ length: 46 }, (_, i) => i / 60);
        const input = scalars(frames);
        const run = document.createAnimation("Run");

        for (const [node, path, type, size] of [
            [root, "translation", "VEC3", 3],
            [spine, "rotation", "VEC4", 4],
        ]) {
            const values = new Float32Array(frames.flatMap((_, i) => Array(size).fill(i)));
            const sampler = document.createAnimationSampler().setInput(input).setOutput(document.createAccessor().setType(type).setArray(values).setBuffer(buffer));

            run.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
        }

        const slow = document.createAnimation("Slow");

        for (const interpolation of ["LINEAR", "CUBICSPLINE"]) {
            const times = [0, 1 / 24, 2 / 24, 3 / 24];
            const sampler = document
                .createAnimationSampler()
                .setInput(scalars(times))
                .setOutput(document.createAccessor().setType("VEC3").setArray(new Float32Array(times.length * 3 * (interpolation === "CUBICSPLINE" ? 3 : 1))).setBuffer(buffer))
                .setInterpolation(interpolation);

            slow.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(root).setTargetPath(interpolation === "LINEAR" ? "translation" : "scale").setSampler(sampler));
        }

        const walkKeys = clip(document, "Walk").listSamplers().map((sampler) => sampler.getInput().getCount());

        // (Walk's keyed less often than 30 a second; Run loses every other key but its last)
        assert.equal(thinKeys(document, 30), 2 * (46 - 24));

        const [first, second] = run.listSamplers();
        const times = Array.from(first.getInput().getArray());

        assert.equal(first.getInput(), second.getInput());
        assert.equal(times.length, 24);
        assert.ok(near(times.at(-2), 44 / 60));
        assert.ok(near(times.at(-1), 0.75));
        assert.ok(near(duration(run), 0.75));
        assert.deepEqual(Array.from({ length: 24 }, (_, i) => first.getOutput().getElement(i, [])[0]), [...Array.from({ length: 23 }, (_, i) => 2 * i), 45]);
        assert.deepEqual(second.getOutput().getElement(23, []), [45, 45, 45, 45]);
        assert.deepEqual(clip(document, "Walk").listSamplers().map((sampler) => sampler.getInput().getCount()), walkKeys);
        assert.deepEqual(slow.listSamplers().map((sampler) => sampler.getInput().getCount()), [4, 4]);
    });
});

describe("the rest pose taken from a clip (restPose)", () => {
    it("stands each bone the clip moves as it is at the clip's start, and changes no clip", () => {
        const document = skinnedDocument();
        const nodes = document.getRoot().listNodes();
        const root = nodes.find((node) => node.getName() === "root");
        const walk = clip(document, "Walk");
        const keys = walk.listSamplers().map((sampler) => Array.from(sampler.getOutput().getArray()));
        const start = bounds(document, { animation: walk, time: 0 });

        // (Its root resting 50 metres off, where the clip never has it)
        root.setTranslation([50, 0, 0]);
        assert.ok(near(bounds(document).min[0], start.min[0] + 50));

        assert.equal(restFromClip(document, "Walk"), channelsByNode(walk).size);
        assert.ok(near(root.getTranslation(), sampleChannel(channelsByNode(walk).get(root).translation, 0)));
        assert.ok(near(bounds(document).min, start.min));
        assert.ok(near(bounds(document).max, start.max));
        assert.deepEqual(walk.listSamplers().map((sampler) => Array.from(sampler.getOutput().getArray())), keys);
        assert.throws(() => restFromClip(document, "Fly"), /restPose: there's no clip Fly/);
    });
});
