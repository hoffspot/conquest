// Models compressed with meshoptimizer (EXT_meshopt_compression, as utilities/blenderpipeline
// makes them): the game's loader (world/art/engine/models.js) reads them, and the decoder the
// browser loads (client/vendor/three-r186/addons/libs, from npm run vendor:three) decodes them
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeshoptEncoder } from "meshoptimizer";
import { loadGltf } from "../client/js/world/art/engine/models.js";

// (Three.js's file loader tells of its progress as a browser does)
globalThis.ProgressEvent ??= class ProgressEvent extends Event {
    constructor(type, init = {}) {
        super(type);
        Object.assign(this, init);
    }
};

// A triangle, its corners in order, and a clip turning it a quarter about y in a second
const POSITIONS = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const INDICES = new Uint32Array([0, 1, 2]);
const TIMES = new Float32Array([0, 1]);
const TURNS = new Float32Array([0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2]);

const bytes = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const padded = (length) => Math.ceil(length / 4) * 4;

/** A GLB of the triangle and its clip, its vertices and indices compressed with meshoptimizer. */
async function compressedGlb() {
    await MeshoptEncoder.ready;

    const vertices = MeshoptEncoder.encodeGltfBuffer(bytes(POSITIONS), 3, 12, "ATTRIBUTES");
    const indices = MeshoptEncoder.encodeGltfBuffer(bytes(INDICES), 3, 4, "TRIANGLES");

    // The binary chunk: the compressed vertices, then the compressed indices, then the clip's
    // keyframes as they are, each four-byte aligned
    const parts = [vertices, indices, bytes(TIMES), bytes(TURNS)];
    const offsets = [];
    let length = 0;

    for (const part of parts) {
        offsets.push(length);
        length += padded(part.byteLength);
    }

    const binary = new Uint8Array(length);

    parts.forEach((part, i) => binary.set(part, offsets[i]));

    // (The fallback buffer, where the decoded vertices and indices go, has no bytes of its own)
    const compressed = (byteLength, stride, count, mode, part) => ({
        buffer: 1,
        byteLength,
        byteStride: mode === "ATTRIBUTES" ? stride : undefined,
        extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: offsets[part], byteLength: parts[part].byteLength, byteStride: stride, count, mode } },
    });
    const json = {
        asset: { version: "2.0" },
        extensionsUsed: ["EXT_meshopt_compression"],
        extensionsRequired: ["EXT_meshopt_compression"],
        buffers: [{ byteLength: length }, { byteLength: padded(POSITIONS.byteLength) + INDICES.byteLength, extensions: { EXT_meshopt_compression: { fallback: true } } }],
        bufferViews: [
            { ...compressed(POSITIONS.byteLength, 12, 3, "ATTRIBUTES", 0), byteOffset: 0 },
            { ...compressed(INDICES.byteLength, 4, 3, "TRIANGLES", 1), byteOffset: padded(POSITIONS.byteLength) },
            { buffer: 0, byteOffset: offsets[2], byteLength: TIMES.byteLength },
            { buffer: 0, byteOffset: offsets[3], byteLength: TURNS.byteLength },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5125, count: 3, type: "SCALAR" },
            { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
            { bufferView: 3, componentType: 5126, count: 2, type: "VEC4" },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        nodes: [{ name: "Triangle", mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0,
        animations: [{ name: "Turn", samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }] }],
    };

    // The GLB: its header, its JSON (padded with spaces) and its binary chunk
    const text = new TextEncoder().encode(JSON.stringify(json));
    const jsonChunk = new Uint8Array(padded(text.byteLength)).fill(0x20);

    jsonChunk.set(text);

    const glb = new Uint8Array(12 + 8 + jsonChunk.byteLength + 8 + binary.byteLength);
    const view = new DataView(glb.buffer);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.byteLength, true);
    view.setUint32(12, jsonChunk.byteLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    glb.set(jsonChunk, 20);
    view.setUint32(20 + jsonChunk.byteLength, binary.byteLength, true);
    view.setUint32(24 + jsonChunk.byteLength, 0x004e4942, true);
    glb.set(binary, 28 + jsonChunk.byteLength);

    return { glb, vertices, indices };
}

describe("models compressed with meshoptimizer", () => {
    it("are read by the game's loader, every vertex, index and clip as they were", async () => {
        const { glb } = await compressedGlb();
        const { scene, animations } = await loadGltf(`data:model/gltf-binary;base64,${Buffer.from(glb).toString("base64")}`);
        const triangle = scene.getObjectByName("Triangle");

        assert.deepEqual([...triangle.geometry.getAttribute("position").array], [...POSITIONS]);
        assert.deepEqual([...triangle.geometry.getIndex().array], [...INDICES]);
        assert.deepEqual(
            animations.map((clip) => [clip.name, clip.duration]),
            [["Turn", 1]],
        );
        assert.deepEqual([...animations[0].tracks[0].values], [...TURNS]);
    });

    it("are decoded by the copy of meshoptimizer's decoder the game loads in the browser", async () => {
        const { MeshoptDecoder } = await import("../client/vendor/three-r186/addons/libs/meshopt_decoder.module.js");
        const { vertices, indices } = await compressedGlb();
        const positions = new Uint8Array(POSITIONS.byteLength);
        const corners = new Uint8Array(INDICES.byteLength);

        await MeshoptDecoder.ready;
        assert.equal(MeshoptDecoder.supported, true);
        MeshoptDecoder.decodeGltfBuffer(positions, 3, 12, vertices, "ATTRIBUTES");
        MeshoptDecoder.decodeGltfBuffer(corners, 3, 4, indices, "TRIANGLES");
        assert.deepEqual(new Float32Array(positions.buffer), POSITIONS);
        assert.deepEqual(new Uint32Array(corners.buffer), INDICES);
    });
});
