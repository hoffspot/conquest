// A small skinned, animated glTF document made in code, to test the Node stage on without Blender:
// an armature (turned and moved as asked) with two bones, root and spine (a metre over it), and a
// mesh of two triangles, one on each; and two clips:
//   Walk: the root carried 2 m forward (+z) in its 1 s with a bounce, the spine wiggling, looping;
//   Wave: the spine turning 90 degrees about z, not looping.

import { Document } from "@gltf-transform/core";
import { Matrix4, Quaternion, Vector3 } from "three";

export function skinnedDocument({ armatureTurn = 0, armatureAt = [0, 0, 0] } = {}) {
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), armatureTurn);

    const root = document.createNode("root");
    const spine = document.createNode("spine").setTranslation([0, 1, 0]);
    const armature = document.createNode("Armature").setTranslation(armatureAt).setRotation(turn.toArray()).addChild(root);

    root.addChild(spine);

    // The bones' places in the world at rest, and so the inverse bind matrices
    const placeOf = (offset) => new Matrix4().compose(new Vector3(...armatureAt), turn, new Vector3(1, 1, 1)).multiply(new Matrix4().makeTranslation(...offset));
    const inverses = [placeOf([0, 0, 0]).invert(), placeOf([0, 1, 0]).invert()];

    // The triangles, where they are in the world at rest
    const local = [
        [-0.5, 0, 0],
        [0.5, 0, 0],
        [0, 0.5, 0],
        [-0.5, 1, 0],
        [0.5, 1, 0],
        [0, 1.5, 0],
    ];
    const world = local.map((point) => new Vector3(...point).applyMatrix4(placeOf([0, 0, 0])).toArray());

    const primitive = document
        .createPrimitive()
        .setAttribute("POSITION", accessor("VEC3", new Float32Array(world.flat())))
        .setAttribute("JOINTS_0", accessor("VEC4", new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])))
        .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])));
    const mesh = document.createMesh("Body").addPrimitive(primitive);
    const skin = document
        .createSkin()
        .addJoint(root)
        .addJoint(spine)
        .setInverseBindMatrices(accessor("MAT4", new Float32Array(inverses.flatMap((matrix) => matrix.toArray()))));
    const body = document.createNode("Body").setMesh(mesh).setSkin(skin);

    document.createScene().addChild(armature).addChild(body);

    const clip = (name, channels) => {
        const animation = document.createAnimation(name);

        for (const [node, path, times, values] of channels) {
            const sampler = document
                .createAnimationSampler()
                .setInput(accessor("SCALAR", new Float32Array(times)))
                .setOutput(accessor(path === "rotation" ? "VEC4" : "VEC3", new Float32Array(values)))
                .setInterpolation("LINEAR");

            animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
        }

        return animation;
    };
    const about = (axis, angle) => new Quaternion().setFromAxisAngle(new Vector3(...axis), angle).toArray();

    clip("Walk", [
        [root, "translation", [0, 0.5, 1], [0, 0, 0, 0, 0.1, 1, 0, 0, 2]],
        [spine, "rotation", [0, 0.5, 1], [...about([0, 1, 0], 0), ...about([0, 1, 0], 0.3), ...about([0, 1, 0], 0)]],
    ]);
    clip("Wave", [[spine, "rotation", [0, 1], [...about([0, 0, 1], 0), ...about([0, 0, 1], Math.PI / 2)]]]);

    return document;
}

/** Where every vertex of a document is at a moment of a clip (lib/animation.js visitVertices). */
export function vertices(document, visitVertices, options) {
    const found = [];

    visitVertices(document, (x, y, z) => found.push([x, y, z]), options);

    return found;
}

export const near = (a, b, tolerance = 1e-4) => (Array.isArray(a) ? a.every((v, i) => Math.abs(v - b[i]) <= tolerance) : Math.abs(a - b) <= tolerance);
