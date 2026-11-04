// Materials kept apart (lib/optimize.js dedupKeeping, config `apart`): the same as another but for
// their names, kept their own through dedup, so simplify can give them shares of their own.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Document } from "@gltf-transform/core";
import { dedupKeeping } from "../lib/optimize.js";

// A scene with its stone, and a part set onto it with a copy of that stone (another name, the same
// in all else), each on a triangle of its own
function scene() {
    const document = new Document();
    const buffer = document.createBuffer();
    const texture = document.createTexture("stone").setImage(new Uint8Array([1, 2, 3])).setMimeType("image/png");
    const node = document.createNode("scene");

    document.createScene().addChild(node);

    for (const name of ["M_Stone", "M_Dress_Stone"]) {
        const material = document.createMaterial(name).setBaseColorTexture(texture).setRoughnessFactor(0.7);
        const position = document.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
        const primitive = document.createPrimitive().setAttribute("POSITION", position).setMaterial(material);

        node.addChild(document.createNode(name).setMesh(document.createMesh(name).addPrimitive(primitive)));
    }

    return document;
}

const materialsOf = (document) =>
    document
        .getRoot()
        .listMeshes()
        .map((mesh) => mesh.listPrimitives()[0].getMaterial().getName());

describe("materials kept apart (dedupKeeping)", () => {
    it("makes the same materials one, as dedup does, when none's kept apart", async () => {
        const document = scene();

        await dedupKeeping(document, []);

        assert.equal(document.getRoot().listMaterials().length, 1);
        assert.equal(new Set(materialsOf(document)).size, 1);
    });

    it("keeps those it's told of their own, their texture still shared, and leaves no mark on them", async () => {
        const document = scene();

        await dedupKeeping(document, ["M_Dress*"]);

        assert.deepEqual(materialsOf(document), ["M_Stone", "M_Dress_Stone"]);
        assert.equal(document.getRoot().listTextures().length, 1);
        assert.deepEqual(
            document
                .getRoot()
                .listMaterials()
                .map((material) => material.getExtras()),
            [{}, {}],
        );
    });
});
