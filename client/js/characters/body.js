// The human body every character is made from: MakeHuman's base mesh and skeleton (prepared by
// scripts/build-characters.js into client/characters/human.json and human.bin), shaped by the body
// and face sliders.
//
// Shaping blends the sliders' precomputed shapes into new vertex positions, and moves every joint
// the same way, so the skeleton always fits the body. Everything is in metres, y up, facing +z,
// with the soles of the feet at y = 0.
//
// Pure data, no DOM or Three.js: the character engine (character.js) turns the result into meshes.

import { detailTargets } from "./details.js";
import { bustTargets, macroTargets } from "./macro.js";
import { decodeSection } from "./pack.js";

/** Where the prepared body lives, next to the game's pages. */
export const HUMAN_URL = new URL("../../characters/", import.meta.url);

/** Download and unpack the body (human.json and human.bin from `base`, with `fetch`). */
export async function loadHumanData(base = HUMAN_URL, fetch = globalThis.fetch.bind(globalThis)) {
    const [manifest, packed] = await Promise.all([
        fetch(new URL("human.json", base).href).then((response) => checked(response).json()),
        fetch(new URL("human.bin", base).href).then((response) => checked(response).arrayBuffer()),
    ]);

    return new HumanData(manifest, await gunzip(packed));
}

function checked(response) {
    if (!response.ok) {
        throw new Error(`Couldn't load ${response.url} (${response.status})`);
    }

    return response;
}

/** Unpack gzip data (left as it is if it isn't gzip, say because a server already unpacked it). */
async function gunzip(buffer) {
    const bytes = new Uint8Array(buffer);

    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
        return buffer;
    }

    return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

/** The unpacked body: the base mesh, its skeleton and the shapes that change it. */
export class HumanData {
    constructor(manifest, buffer) {
        const section = (name) => decodeSection(buffer, manifest.layout[name]);

        this.manifest = manifest;
        this.vertexCount = manifest.sourceVertices;
        this.parts = manifest.parts;
        this.bones = manifest.bones;
        this.basePositions = section("basePositions");
        this.renderSource = section("renderSource");
        this.indices = section("indices");
        this.skinIndices = section("skinIndices");
        this.skinWeights = section("skinWeights");
        this.jointBase = section("jointBase");
        this.macroJoints = section("macroJoints");
        this.pca = section("pca");
        this.pcaScales = manifest.macro.scales;
        this.macroIndex = new Map(manifest.macro.names.map((name, i) => [name, i]));
        this.coefficients = manifest.macro.coefficients;
        this.deltaUnit = manifest.deltaUnit;
        this.details = new Map(manifest.details.map((detail) => [detail.name, {
            vertices: decodeSection(buffer, detail.vertices),
            deltas: decodeSection(buffer, detail.deltas),
            joints: detail.joints,
        }]));

        // Texture coordinates were stored as 16-bit fractions
        const uvs = section("uvs");

        this.uvs = Float32Array.from(uvs, (value) => value / 65535);

        // Which part each source vertex belongs to, and the body's own vertices
        this.partOf = new Uint8Array(this.vertexCount);
        this.partNames = Object.keys(this.parts);
        this.partNames.forEach((part, p) => {
            for (const r of this.renderIndices(part)) {
                this.partOf[this.renderSource[r]] = p;
            }
        });

        this.boneIndex = new Map(this.bones.map(({ name }, i) => [name, i]));
    }

    /** A part's triangles (render vertex indices). */
    renderIndices(part) {
        const { start, count } = this.parts[part];

        return this.indices.subarray(start, start + count);
    }

    /**
     * The body for these slider settings: { positions (per source vertex), joints (each bone's
     * head then tail) }, with the soles of the feet at y = 0.
     */
    shape({ macro = {}, details = {} } = {}) {
        const count = this.vertexCount * 3;
        const positions = Float32Array.from(this.basePositions);
        const joints = Float32Array.from(this.jointBase);
        const jointLength = joints.length;
        const components = new Float64Array(this.pcaScales.length);

        for (const { name, weight } of macroTargets(macro)) {
            const t = this.macroIndex.get(name);
            const row = this.coefficients[t];

            for (let k = 0; k < components.length; k++) {
                components[k] += weight * row[k];
            }

            for (let j = 0, at = t * jointLength; j < jointLength; j++) {
                joints[j] += weight * this.macroJoints[at + j];
            }
        }

        components.forEach((amount, k) => {
            const factor = amount * this.pcaScales[k];
            const at = k * count;

            if (Math.abs(factor) > 1e-12) {
                for (let j = 0; j < count; j++) {
                    positions[j] += factor * this.pca[at + j];
                }
            }
        });

        // Detail and bust shapes, stored sparsely
        for (const { name, weight } of [...detailTargets(details), ...bustTargets(macro)]) {
            const { vertices, deltas, joints: moves } = this.details.get(name);
            const factor = weight * this.deltaUnit;

            for (let i = 0; i < vertices.length; i++) {
                const v = vertices[i] * 3;

                positions[v] += factor * deltas[i * 3];
                positions[v + 1] += factor * deltas[i * 3 + 1];
                positions[v + 2] += factor * deltas[i * 3 + 2];
            }

            for (let j = 0; j < jointLength; j++) {
                joints[j] += weight * moves[j];
            }
        }

        // Stand on the ground
        let lowest = Infinity;

        for (let v = 0; v < this.vertexCount; v++) {
            if (this.partOf[v] === 0) {
                lowest = Math.min(lowest, positions[v * 3 + 1]);
            }
        }

        for (let j = 1; j < count; j += 3) {
            positions[j] -= lowest;
        }

        for (let j = 1; j < jointLength; j += 3) {
            joints[j] -= lowest;
        }

        return { positions, joints };
    }

    /** Smooth normals per source vertex, from every part's triangles. */
    normals(positions) {
        const normals = new Float32Array(this.vertexCount * 3);
        const source = this.renderSource;
        const indices = this.indices;

        for (let i = 0; i < indices.length; i += 3) {
            const a = source[indices[i]] * 3;
            const b = source[indices[i + 1]] * 3;
            const c = source[indices[i + 2]] * 3;
            const abx = positions[b] - positions[a];
            const aby = positions[b + 1] - positions[a + 1];
            const abz = positions[b + 2] - positions[a + 2];
            const acx = positions[c] - positions[a];
            const acy = positions[c + 1] - positions[a + 1];
            const acz = positions[c + 2] - positions[a + 2];
            const nx = aby * acz - abz * acy;
            const ny = abz * acx - abx * acz;
            const nz = abx * acy - aby * acx;

            for (const v of [a, b, c]) {
                normals[v] += nx;
                normals[v + 1] += ny;
                normals[v + 2] += nz;
            }
        }

        for (let v = 0; v < normals.length; v += 3) {
            const length = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;

            normals[v] /= length;
            normals[v + 1] /= length;
            normals[v + 2] /= length;
        }

        return normals;
    }

    /** A joint's position: `end` 0 for the bone's head, 1 for its tail. */
    static joint(joints, bone, end = 0) {
        const at = bone * 6 + end * 3;

        return [joints[at], joints[at + 1], joints[at + 2]];
    }
}
