// lib/animation.js and lib/transform.js on a document made in code (test/helpers.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bounds, channelsByNode, duration, loops, playInPlace, rootMotion, sampleChannel, visitVertices } from "../lib/animation.js";
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
