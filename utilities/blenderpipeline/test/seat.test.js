// lib/seat.js: rocks that touch nothing, set down on what's under them or left out, on a scene made
// in code (no Blender): a ground, a rock on it, a rock 2 m over it, one cut in two across meshes (a
// cell's edge) 2 m over it, one 9 m over it, one on another rock, and one turned and moved by its
// node; and a lower detail packed beside them, seated among its own.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Document } from "@gltf-transform/core";
import { distanceTo, SEAT, seat } from "../lib/seat.js";

// A box's eight corners and twelve triangles, from (x0, y0, z0) to (x1, y1, z1)
function box(x0, y0, z0, x1, y1, z1) {
    const points = [];

    for (const y of [y0, y1]) {
        for (const z of [z0, z1]) {
            for (const x of [x0, x1]) {
                points.push(x, y, z);
            }
        }
    }

    const faces = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];

    return { points, faces };
}

// A scene: [name, material, [boxes], node's place ({ translation, rotation }), extras]
function scene(parts) {
    const document = new Document();
    const buffer = document.createBuffer();
    const root = document.createScene();
    const materials = new Map();

    for (const [name, material, boxes, place = {}, extras = {}] of parts) {
        const points = [];
        const faces = [];

        for (const each of boxes) {
            faces.push(...each.faces.map((i) => i + points.length / 3));
            points.push(...each.points);
        }

        if (!materials.has(material)) {
            materials.set(material, document.createMaterial(material));
        }

        const primitive = document
            .createPrimitive()
            .setMaterial(materials.get(material))
            .setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(new Float32Array(points)).setBuffer(buffer))
            .setIndices(document.createAccessor().setType("SCALAR").setArray(new Uint16Array(faces)).setBuffer(buffer));
        const node = document.createNode(name).setMesh(document.createMesh(name).addPrimitive(primitive)).setExtras(extras);

        if (place.translation) {
            node.setTranslation(place.translation);
        }

        if (place.rotation) {
            node.setRotation(place.rotation);
        }

        root.addChild(node);
    }

    return document;
}

// A node's points' lowest and highest, where they are in the scene (y)
function heightOf(document, name) {
    const node = document.getRoot().listNodes().find((each) => each.getName() === name);
    const position = node.getMesh().listPrimitives()[0].getAttribute("POSITION");
    const matrix = node.getWorldMatrix();
    const ys = [];

    for (let i = 0; i < position.getCount(); i++) {
        const [x, y, z] = position.getElement(i, []);

        ys.push(matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]);
    }

    return [Math.min(...ys), Math.max(...ys)];
}

const trianglesOf = (document, name) => document.getRoot().listNodes().find((each) => each.getName() === name).getMesh().listPrimitives()[0].getIndices().getCount() / 3;
const rock = (primitive) => primitive.getMaterial()?.getName() === "Rock";

describe("rocks seated (lib/seat.js)", () => {
    it("knows how near a point comes to a triangle: over it, past an edge, past a corner", () => {
        const triangle = new Float32Array([0, 0, 0, 2, 0, 0, 0, 0, 2]);

        assert.equal(distanceTo(triangle, 0, 0.5, 3, 0.5), 3);
        assert.ok(Math.abs(distanceTo(triangle, 0, 1, 0, -1) - 1) < 1e-9);
        assert.ok(Math.abs(distanceTo(triangle, 0, -3, 4, 0) - 5) < 1e-9);
    });

    it("leaves a rock on the ground, sets one 2 m over it down (both halves of one cut across meshes), leaves out one 9 m up, and keeps one on another", () => {
        const document = scene([
            ["ground", "Ground", [box(-50, -1, -50, 50, 0, 50)]],
            ["on", "Rock", [box(-20, 0, -20, -18, 3, -18)]],
            ["over", "Rock", [box(-10, 2, -10, -8, 4, -8)]],
            // (One rock cut in two at x = 0, its halves in meshes of their own, meeting there)
            ["west", "Rock", [box(-1, 2, 10, 0, 5, 12)]],
            ["east", "Rock", [box(0, 2, 10, 1, 5, 12)]],
            ["high", "Rock", [box(20, 9, 20, 22, 11, 22)]],
            ["base", "Rock", [box(30, 0, 30, 34, 2, 34)]],
            ["stacked", "Rock", [box(31, 2, 31, 33, 4, 33)]],
        ]);
        const done = seat(document, { gap: 1, drop: 3, rock });

        // (The pieces: on, over, the cut one, high, base and stacked: six)
        assert.equal(done.pieces, 6);
        assert.equal(done.set, 2);
        assert.equal(done.left, 1);
        assert.ok(Math.abs(done.most - 2) < 1e-6, `${done.most}`);

        assert.deepEqual(heightOf(document, "on"), [0, 3]);
        assert.ok(Math.abs(heightOf(document, "over")[0] + SEAT.into) < 1e-5, `${heightOf(document, "over")}`);
        // (Both halves moved alike: where they meet, they still do)
        assert.deepEqual(heightOf(document, "west"), heightOf(document, "east"));
        assert.ok(Math.abs(heightOf(document, "west")[0] + SEAT.into) < 1e-5);
        assert.equal(trianglesOf(document, "high"), 0);
        assert.deepEqual(heightOf(document, "stacked"), [2, 4]);
        assert.equal(trianglesOf(document, "ground"), 12);
    });

    it("sets down a rock its node turns and moves, in its own space; and leaves out two touching only each other in the air", () => {
        // (Turned a quarter about x: its own z is the scene's up; moved 2.5 m up from there)
        const quarter = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
        const document = scene([
            ["ground", "Ground", [box(-50, -1, -50, 50, 0, 50)]],
            ["turned", "Rock", [box(0, 0, -2, 2, 2, 0)], { translation: [0, 2.5, 0], rotation: quarter }],
            // (A rock 9 m up, and one sitting on it: they touch only each other, so neither's
            // grounded; nothing's under them within 3 m, and both are left out together)
            ["sky", "Rock", [box(10, 9, 10, 12, 10, 12)]],
            ["perched", "Rock", [box(10.5, 10, 10.5, 11.5, 11, 11.5)]],
        ]);
        const done = seat(document, { gap: 1, drop: 3, rock });
        const [low] = heightOf(document, "turned");

        assert.ok(Math.abs(low + SEAT.into) < 1e-5, `${low}`);
        assert.equal(trianglesOf(document, "sky"), 0);
        assert.equal(trianglesOf(document, "perched"), 0);
        assert.equal(done.left, 2);
    });

    it("seats each lower detail packed beside the full meshes among its own", () => {
        const document = scene([
            ["ground", "Ground", [box(-50, -1, -50, 50, 0, 50)]],
            ["rock", "Rock", [box(0, 0, 0, 2, 2, 2)]],
            ["ground.lod1", "Ground", [box(-50, -1, -50, 50, 0, 50)], {}, { lod: 1 }],
            // (Its lower detail 1.5 m over the ground: set down, though the full rock's on it)
            ["rock.lod1", "Rock", [box(0, 1.5, 0, 2, 3, 2)], {}, { lod: 1 }],
        ]);
        const done = seat(document, { gap: 1, drop: 3, rock });

        assert.equal(done.set, 0);
        assert.deepEqual(done.lods, [{ level: 1, pieces: 1, set: 1, left: 0, most: 1.5 }]);
        assert.ok(Math.abs(heightOf(document, "rock.lod1")[0] + SEAT.into) < 1e-5);
        assert.deepEqual(heightOf(document, "rock"), [0, 2]);
    });
});
