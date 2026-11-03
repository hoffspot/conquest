// A small skinned, animated glTF document made in code, to test the Node stage on without Blender:
// an armature (turned and moved as asked) with two bones, root and spine (a metre over it), and a
// mesh of two triangles, one on each; and two clips:
//   Walk: the root carried 2 m forward (+z) in its 1 s with a bounce, the spine wiggling, looping;
//   Wave: the spine turning 90 degrees about z, not looping.

import { Document } from "@gltf-transform/core";
import { encode } from "fast-png";
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

/**
 * A stick figure's skeleton, to take clips from or play them on (lib/retarget.js): hips `size`
 * metres up, a spine half that over them, a left arm and hand out from its top and a left thigh
 * and foot down to the ground (a 0.5 m arm a fifth of the way across, at `size` 1). "T" holds its
 * arm out level; "A" lowers it 45 degrees. `tail`: a bone of its own behind the hips. Its clips
 * (`clips`): Raise, the arm turned 90 degrees up (about +z) over 1 s while the armature itself
 * is carried a metre left (an object's keys left in); Bob, the hips 0.5 down and 0.25 forward
 * over 1 s.
 */
export function figureDocument({ pose = "T", size = 1, tail = false, clips = false, names = {} } = {}) {
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const about = (axis, angle) => new Quaternion().setFromAxisAngle(new Vector3(...axis), angle).toArray();
    const bone = (name, at, parent) => {
        const node = document.createNode(names[name] ?? name).setTranslation(at.map((v) => v * size));

        parent?.addChild(node);

        return node;
    };
    const armature = document.createNode("Armature");
    const hips = bone("hips", [0, 1, 0], armature);
    const spine = bone("spine", [0, 0.5, 0], hips);
    const arm = bone("arm", [0.2, 0, 0], spine).setRotation(pose === "A" ? about([0, 0, 1], -Math.PI / 4) : [0, 0, 0, 1]);
    const hand = bone("hand", [0.5, 0, 0], arm);
    const thigh = bone("thigh", [0.1, 0, 0], hips);
    const foot = bone("foot", [0, -1, 0], thigh);
    const joints = [hips, spine, arm, hand, thigh, foot, ...(tail ? [bone("tail", [0, 0, -0.5], hips)] : [])];

    // A triangle on the hips, so the skeleton's a skin's
    const restOf = (node) => (node ? restOf(node.getParentNode()).multiply(new Matrix4().compose(new Vector3(...node.getTranslation()), new Quaternion(...node.getRotation()), new Vector3(1, 1, 1))) : new Matrix4());
    const primitive = document
        .createPrimitive()
        .setAttribute("POSITION", accessor("VEC3", new Float32Array([0, size, 0, 0.1, size, 0, 0, size, 0.1])))
        .setAttribute("JOINTS_0", accessor("VEC4", new Uint16Array(12)))
        .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])));
    const skin = document.createSkin().setInverseBindMatrices(accessor("MAT4", new Float32Array(joints.flatMap((joint) => restOf(joint).invert().toArray()))));

    joints.forEach((joint) => skin.addJoint(joint));
    document.createScene().addChild(armature).addChild(document.createNode("Body").setMesh(document.createMesh("Body").addPrimitive(primitive)).setSkin(skin));

    if (clips) {
        const clip = (name, channels) => {
            const animation = document.createAnimation(name);

            for (const [node, path, values] of channels) {
                const sampler = document.createAnimationSampler().setInput(accessor("SCALAR", new Float32Array([0, 1]))).setOutput(accessor(path === "rotation" ? "VEC4" : "VEC3", new Float32Array(values)));

                animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
            }
        };

        clip("Raise", [
            [arm, "rotation", [...arm.getRotation(), ...new Quaternion(...about([0, 0, 1], Math.PI / 2)).multiply(new Quaternion(...arm.getRotation())).toArray()]],
            [armature, "translation", [0, 0, 0, 1, 0, 0]],
        ]);
        clip("Bob", [[hips, "translation", [0, size, 0, 0, size - 0.5, 0.25]]]);
    }

    return document;
}

/** Where every vertex of a document is at a moment of a clip (lib/animation.js visitVertices). */
export function vertices(document, visitVertices, options) {
    const found = [];

    visitVertices(document, (x, y, z) => found.push([x, y, z]), options);

    return found;
}

export const near = (a, b, tolerance = 1e-4) => (Array.isArray(a) ? a.every((v, i) => Math.abs(v - b[i]) <= tolerance) : Math.abs(a - b) <= tolerance);

// Scenery made in code, as a castle's comes (one mesh for a whole stretch of it), to cut into
// cells: a wall 100 m long (x) and 4 m deep (z), of 1 m squares gently uneven, Stone but for its
// far row (z 3 to 4), Rock; and a tower 4 m square and 10 m tall, Stone, its node at (60, 0, 50).
// Stone's texture is tiled along the wall, a tile every 4 m: its coordinates run from 0 to 25.
// Smooth: its corners are shared by the faces round them, as a model's are (flat, every face its
// own, nothing could be simplified).
export function sceneryDocument() {
    const document = new Document();
    const buffer = document.createBuffer();
    const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const material = (name, colour) => document.createMaterial(name).setBaseColorFactor([...colour, 1]);
    const tile = document
        .createTexture("stone")
        .setMimeType("image/png")
        .setImage(encode({ width: 4, height: 4, channels: 4, data: new Uint8Array(64).map((_, i) => (i % 4 === 3 ? 255 : 120 + (i % 7) * 10)) }));
    const stone = material("Stone", [0.8, 0.8, 0.75]).setBaseColorTexture(tile);
    const rock = material("Rock", [0.4, 0.35, 0.3]);
    const height = (x, z) => 0.3 * Math.sin(x * 0.7) * Math.cos(z * 1.3);
    // (Square to the slope: across the gradient of the height)
    const normal = (x, z) => {
        const [dx, dz] = [0.21 * Math.cos(x * 0.7) * Math.cos(z * 1.3), -0.39 * Math.sin(x * 0.7) * Math.sin(z * 1.3)];
        const length = Math.hypot(dx, 1, dz);

        return [-dx / length, 1 / length, -dz / length];
    };

    // Squares from z0 to z1, every x from 0 to 100, as one primitive
    const strip = (z0, z1, made) => {
        const points = [];
        const normals = [];
        const uvs = [];
        const index = [];
        const across = z1 - z0 + 1;

        for (let x = 0; x <= 100; x++) {
            for (let z = z0; z <= z1; z++) {
                points.push(x, height(x, z), z);
                normals.push(...normal(x, z));
                uvs.push(x / 4, z / 4);
            }
        }

        for (let x = 0; x < 100; x++) {
            for (let z = 0; z < z1 - z0; z++) {
                const a = x * across + z;
                const b = (x + 1) * across + z;

                index.push(a, a + 1, b, b, a + 1, b + 1);
            }
        }

        return document
            .createPrimitive()
            .setAttribute("POSITION", accessor("VEC3", new Float32Array(points)))
            .setAttribute("NORMAL", accessor("VEC3", new Float32Array(normals)))
            .setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array(uvs)))
            .setIndices(accessor("SCALAR", new Uint32Array(index)))
            .setMaterial(made);
    };

    const wall = document.createMesh("Wall").addPrimitive(strip(0, 3, stone)).addPrimitive(strip(3, 4, rock));

    // The tower: a box on the ground about its node
    const corners = [];

    for (const y of [0, 10]) {
        for (const [x, z] of [
            [-2, -2],
            [2, -2],
            [2, 2],
            [-2, 2],
        ]) {
            corners.push(x, y, z);
        }
    }

    // (Its sides facing out, its top up and its bottom down)
    const sides = [0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4, 4, 6, 5, 4, 7, 6, 0, 1, 2, 0, 2, 3];
    const box = document
        .createPrimitive()
        .setAttribute("POSITION", accessor("VEC3", new Float32Array(corners)))
        .setAttribute("NORMAL", accessor("VEC3", new Float32Array(corners.map((value, i) => (i % 3 === 1 ? value - 5 : value) / Math.hypot(2, 5, 2)))))
        .setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1])))
        .setIndices(accessor("SCALAR", new Uint32Array(sides)))
        .setMaterial(stone);
    const tower = document.createMesh("Tower").addPrimitive(box);

    document
        .createScene()
        .addChild(document.createNode("Wall").setMesh(wall))
        .addChild(document.createNode("Tower").setMesh(tower).setTranslation([60, 0, 50]));

    return document;
}
