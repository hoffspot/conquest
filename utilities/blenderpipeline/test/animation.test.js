// lib/animation.js, lib/transform.js, lib/optimize.js's tangent mending, still channels and packed
// lower details, and lib/ktx2.js, on a document made in code (test/helpers.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Quaternion, Vector3 } from "three";
import { bounds, channelsByNode, duration, loops, playInPlace, rootMotion, sampleChannel, visitVertices, worldMatrix } from "../lib/animation.js";
import { eased, inventClip } from "../lib/invent.js";
import { decodeImage, encodeImage, shrinkImage, textureUses } from "../lib/ktx2.js";
import { mendTangents, packLod, trimStill } from "../lib/optimize.js";
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

    it("grafts another clip's motion onto some of its bones", () => {
        const document = skinnedDocument();
        const wave = clip(document, "Wave");
        const made = inventClip(document, { name: "Walk and wave", from: "Walk", layers: [{ graft: "Wave", bones: ["spine"] }] });

        assert.ok(near(turnOf(document, made, "spine", 0.75).toArray(), turnOf(document, wave, "spine", 0.75).toArray()));
        assert.ok(near(sampleChannel(channelsByNode(made).get(bone(document, "root")).translation, 1), [0, 0, 2]));
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
