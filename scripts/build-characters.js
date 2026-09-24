// Prepares the human body the character engine is built on (npm run build:characters), from
// MakeHuman's MPFB2 data (github.com/makehumancommunity/mpfb2, assets CC0):
//
//     git clone --depth 1 https://github.com/makehumancommunity/mpfb2 ../mpfb2
//     npm run build:characters -- --mpfb2=../mpfb2
//
// It writes client/characters/human.bin and human.json:
//
//   - the base body mesh (in metres, y up, facing +z), with MakeHuman's eyes and eyelashes (which
//     it keeps as "helper" meshes)
//   - the Mixamo-compatible skeleton (bone names without the "mixamorig:" prefix) and each
//     vertex's four strongest bone weights
//   - the body shapes behind the gender, muscle, weight, height and heritage
//     sliders (client/js/characters/macro.js): 60 dense shapes stored as their principal
//     components (the fewest that reproduce every one of them)
//   - the detail shapes behind the face and physique sliders (client/js/characters/details.js),
//     stored sparsely
//   - where every joint moves with each shape, so the skeleton always fits the body
//
// Also copies MakeHuman's texture masks for the lips, ears, nails and so on, which the engine uses
// to paint skin.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { allDetailTargetNames } from "../client/js/characters/details.js";
import { allMacroTargetNames } from "../client/js/characters/macro.js";
import { Packer } from "../client/js/characters/pack.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// MakeHuman works in decimetres
const SCALE = 0.1;

// The parts of the base mesh the engine uses, by MakeHuman vertex group (clothing and hair are
// grown from the body itself, so MakeHuman's tights and scalp helpers aren't needed)
export const PARTS = {
    body: ["body"],
    lashes: ["helper-l-eyelashes-1", "helper-l-eyelashes-2", "helper-r-eyelashes-1", "helper-r-eyelashes-2"],
    eyes: ["helper-l-eye", "helper-r-eye"],
};

// How much of the macro shapes' detail the principal components must keep: the largest error
// any one shape may have, in metres
const PCA_TOLERANCE = 0.0015;

// Detail shapes are stored as whole tenths of a millimetre
const DELTA_UNIT = 0.0001;

// Principal components are stored as 12-bit whole numbers (precise to well under 0.1 mm)
const PCA_STEPS = 2047;

// The masks for painting skin, from MPFB2's textures
const MASKS = ["lips", "ears", "eyelids", "aureolae", "fingernails", "toenails", "crotch"];

/** Parse a Wavefront OBJ: vertices, texture coordinates and faces ({ group, v: [...], vt: [...] }). */
export function parseObj(text) {
    const positions = [];
    const uvs = [];
    const faces = [];
    let group = "";

    for (const line of text.split("\n")) {
        const parts = line.trim().split(/\s+/);

        if (parts[0] === "v") {
            positions.push(parts.slice(1, 4).map(Number));
        } else if (parts[0] === "vt") {
            uvs.push(parts.slice(1, 3).map(Number));
        } else if (parts[0] === "g") {
            group = parts[1];
        } else if (parts[0] === "f") {
            const corners = parts.slice(1).map((corner) => corner.split("/").map((index) => Number(index) - 1));

            faces.push({ group, v: corners.map(([v]) => v), vt: corners.map(([, vt]) => vt) });
        }
    }

    return { positions, uvs, faces };
}

/** A MakeHuman target: { vertex index: [dx, dy, dz] } (in decimetres). */
export function parseTarget(text) {
    const deltas = new Map();

    for (const line of text.split("\n")) {
        const parts = line.trim().split(/\s+/);

        if (parts.length === 4 && !line.startsWith("#")) {
            deltas.set(Number(parts[0]), parts.slice(1).map(Number));
        }
    }

    return deltas;
}

/**
 * Eigenvalues and eigenvectors of a symmetric matrix (arrays of rows), by Jacobi rotations.
 * Returns { values, vectors } with vectors[i][k] the i-th element of the k-th eigenvector.
 */
export function symmetricEigen(matrix) {
    const n = matrix.length;
    const a = matrix.map((row) => [...row]);
    const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

    for (let sweep = 0; sweep < 100; sweep++) {
        let off = 0;

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                off += a[i][j] * a[i][j];
            }
        }

        if (off < 1e-22) {
            break;
        }

        for (let p = 0; p < n; p++) {
            for (let q = p + 1; q < n; q++) {
                if (Math.abs(a[p][q]) < 1e-30) {
                    continue;
                }

                const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;

                for (let k = 0; k < n; k++) {
                    const akp = a[k][p];
                    const akq = a[k][q];

                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }

                for (let k = 0; k < n; k++) {
                    const apk = a[p][k];
                    const aqk = a[q][k];

                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }

                for (let k = 0; k < n; k++) {
                    const vkp = v[k][p];
                    const vkq = v[k][q];

                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }

    return { values: a.map((row, i) => row[i]), vectors: v };
}

function main() {
    const mpfb2 = path.resolve(process.argv.find((arg) => arg.startsWith("--mpfb2="))?.split("=")[1] ?? path.join(root, "../mpfb2"));
    const data = path.join(mpfb2, "src/mpfb/data");

    if (!existsSync(data)) {
        console.error(`MPFB2's data isn't at ${data}. Clone it first:\n  git clone --depth 1 https://github.com/makehumancommunity/mpfb2 ../mpfb2`);
        process.exit(1);
    }

    const target = path.join(root, "client/characters");

    mkdirSync(path.join(target, "masks"), { recursive: true });

    const obj = parseObj(readFileSync(path.join(data, "3dobjs/base.obj"), "utf8"));
    const groups = JSON.parse(readFileSync(path.join(data, "mesh_metadata/basemesh_vertex_groups.json"), "utf8"));
    const rig = JSON.parse(readFileSync(path.join(data, "rigs/standard/rig.mixamo.json"), "utf8")).bones;
    const weights = JSON.parse(readFileSync(path.join(data, "rigs/standard/weights.mixamo.json"), "utf8")).weights;
    const readTarget = (name) => parseTarget(gunzipSync(readFileSync(path.join(data, "targets", `${name}.target.gz`))).toString("utf8"));

    // Which vertices the engine keeps (the "source" vertices), part by part
    const partOfGroup = new Map(Object.entries(PARTS).flatMap(([part, names]) => names.map((name) => [name, part])));
    const sourceOf = new Map();
    const sourceVertices = [];
    const partFaces = Object.fromEntries(Object.keys(PARTS).map((part) => [part, []]));

    for (const face of obj.faces) {
        const part = partOfGroup.get(face.group);

        if (part) {
            partFaces[part].push(face);

            for (const v of face.v) {
                if (!sourceOf.has(v)) {
                    sourceOf.set(v, sourceVertices.length);
                    sourceVertices.push(v);
                }
            }
        }
    }

    const count = sourceVertices.length;
    const base = new Float32Array(count * 3);

    sourceVertices.forEach((v, i) => base.set(obj.positions[v].map((value) => value * SCALE), i * 3));

    // Render vertices: one per distinct (vertex, texture coordinate) pair, part by part
    const renderSource = [];
    const renderUV = [];
    const indices = [];
    const parts = {};

    for (const part of Object.keys(PARTS)) {
        const renderOf = new Map();
        const start = indices.length;
        const corner = (v, vt) => {
            const key = `${v}/${vt}`;

            if (!renderOf.has(key)) {
                renderOf.set(key, renderSource.length);
                renderSource.push(sourceOf.get(v));
                renderUV.push(...(obj.uvs[vt] ?? [0, 0]));
            }

            return renderOf.get(key);
        };

        for (const { v, vt } of partFaces[part]) {
            const corners = v.map((vertex, k) => corner(vertex, vt[k]));

            for (let k = 1; k < corners.length - 1; k++) {
                indices.push(corners[0], corners[k], corners[k + 1]);
            }
        }

        parts[part] = { start, count: indices.length - start };
    }

    // The eyes get their own texture coordinates: looking straight at an eye, u and v run across
    // its front, centred on the pupil
    for (const eye of ["helper-l-eye", "helper-r-eye"]) {
        const [[first, last]] = groups[eye];
        const members = [];

        for (let v = first; v <= last; v++) {
            members.push(obj.positions[v]);
        }

        const centre = [0, 1, 2].map((axis) => members.reduce((sum, p) => sum + p[axis], 0) / members.length);
        const radius = Math.max(...members.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2])));

        renderSource.forEach((source, r) => {
            const v = sourceVertices[source];

            if (v >= first && v <= last) {
                const p = obj.positions[v];

                renderUV[r * 2] = 0.5 + (p[0] - centre[0]) / (2 * radius);
                renderUV[r * 2 + 1] = 0.5 + (p[1] - centre[1]) / (2 * radius);
            }
        });
    }

    // Bones, parents first, without Mixamo's prefix
    const strip = (name) => name.replace("mixamorig:", "");
    const order = [];
    const visit = (name) => {
        order.push(name);

        for (const [child, bone] of Object.entries(rig)) {
            if (bone.parent === name) {
                visit(child);
            }
        }
    };

    visit(Object.keys(rig).find((name) => !rig[name].parent));

    const boneIndex = new Map(order.map((name, i) => [name, i]));
    const bones = order.map((name) => ({ name: strip(name), parent: rig[name].parent ? boneIndex.get(rig[name].parent) : -1 }));

    // Each vertex's four strongest bone weights, in 255ths
    const influences = Array.from({ length: count }, () => []);

    for (const [bone, list] of Object.entries(weights)) {
        for (const [v, weight] of list) {
            if (sourceOf.has(v)) {
                influences[sourceOf.get(v)].push([boneIndex.get(bone), weight]);
            }
        }
    }

    const skinIndices = new Uint8Array(count * 4);
    const skinWeights = new Uint8Array(count * 4);

    influences.forEach((list, i) => {
        const strongest = list.sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = strongest.reduce((sum, [, weight]) => sum + weight, 0) || 1;
        const shares = strongest.map(([, weight]) => Math.round((weight / total) * 255));

        // Rounding can leave the shares a little off 255: the strongest bone makes up the difference
        shares[0] += 255 - shares.reduce((sum, share) => sum + share, 0);

        strongest.forEach(([bone], k) => {
            skinIndices[i * 4 + k] = bone;
            skinWeights[i * 4 + k] = shares[k];
        });
    });

    // Joints: each bone's head and tail are the average of some vertices (a list, or a "joint
    // cube" group), so they follow every change of shape
    const jointVertices = (end) => {
        if (end.strategy === "CUBE") {
            const [[first, last]] = groups[end.cube_name];

            return Array.from({ length: last - first + 1 }, (_, k) => first + k);
        }

        return end.vertex_indices;
    };
    const ends = order.flatMap((name) => [jointVertices(rig[name].head), jointVertices(rig[name].tail)]);
    const averageAt = (vertices, positionOf) => [0, 1, 2].map((axis) => vertices.reduce((sum, v) => sum + (positionOf(v)?.[axis] ?? 0), 0) / vertices.length * SCALE);
    const jointBase = new Float32Array(ends.flatMap((vertices) => averageAt(vertices, (v) => obj.positions[v])));
    const jointDeltas = (deltas) => ends.flatMap((vertices) => averageAt(vertices, (v) => deltas.get(v)));

    // The macro shapes, compressed into principal components
    const macroNames = allMacroTargetNames();
    const macroShapes = macroNames.map((name) => {
        const deltas = readTarget(name);
        const dense = new Float64Array(count * 3);

        for (const [v, delta] of deltas) {
            if (sourceOf.has(v)) {
                dense.set(delta.map((value) => value * SCALE), sourceOf.get(v) * 3);
            }
        }

        return { name, dense, joints: jointDeltas(deltas) };
    });
    const n = macroShapes.length;
    const gram = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
            let dot = 0;
            const a = macroShapes[i].dense;
            const b = macroShapes[j].dense;

            for (let k = 0; k < a.length; k++) {
                dot += a[k] * b[k];
            }

            gram[i][j] = dot;
            gram[j][i] = dot;
        }
    }

    const { values, vectors } = symmetricEigen(gram);
    const ranked = values.map((value, k) => ({ value, k })).filter(({ value }) => value > 1e-12).sort((a, b) => b.value - a.value);

    // Keep the fewest components that reproduce every macro shape within the tolerance
    const components = [];
    const coefficients = macroShapes.map(() => []);
    const residuals = macroShapes.map(({ dense }) => Float64Array.from(dense));
    let worst = Infinity;

    for (const { value, k } of ranked) {
        const component = new Float64Array(count * 3);
        const norm = Math.sqrt(value);

        macroShapes.forEach(({ dense }, i) => {
            const factor = vectors[i][k] / norm;

            for (let j = 0; j < component.length; j++) {
                component[j] += factor * dense[j];
            }
        });

        components.push(component);
        worst = 0;

        macroShapes.forEach((shape, i) => {
            const c = norm * vectors[i][k];
            const residual = residuals[i];

            coefficients[i].push(c);

            for (let j = 0; j < residual.length; j += 3) {
                residual[j] -= c * component[j];
                residual[j + 1] -= c * component[j + 1];
                residual[j + 2] -= c * component[j + 2];
                worst = Math.max(worst, Math.hypot(residual[j], residual[j + 1], residual[j + 2]));
            }
        });

        if (worst <= PCA_TOLERANCE) {
            break;
        }
    }

    const packer = new Packer();
    const pcaScales = components.map((component) => component.reduce((max, value) => Math.max(max, Math.abs(value)), 0) / PCA_STEPS);
    const pcaData = new Int16Array(components.length * count * 3);

    components.forEach((component, k) => {
        for (let j = 0; j < component.length; j++) {
            pcaData[k * count * 3 + j] = Math.round(component[j] / pcaScales[k]);
        }
    });

    // The detail shapes, sparse
    const details = allDetailTargetNames().map((name) => {
        const deltas = readTarget(name);
        const kept = [...deltas].filter(([v]) => sourceOf.has(v));
        const at = new Uint16Array(kept.map(([v]) => sourceOf.get(v)));
        const moves = new Int16Array(kept.flatMap(([, delta]) => delta.map((value) => Math.round((value * SCALE) / DELTA_UNIT))));

        return {
            name,
            vertices: packer.add(at, { codec: "delta" }),
            deltas: packer.add(moves, { codec: "delta", channels: 3 }),
            joints: jointDeltas(deltas).map((value) => Math.round(value * 1e6) / 1e6),
        };
    });

    const layout = {
        basePositions: packer.add(base),
        uvs: packer.add(new Uint16Array(renderUV.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 65535)))),
        renderSource: packer.add(new Uint16Array(renderSource)),
        indices: packer.add(new Uint16Array(indices)),
        skinIndices: packer.add(skinIndices),
        skinWeights: packer.add(skinWeights),
        jointBase: packer.add(jointBase),
        macroJoints: packer.add(new Float32Array(macroShapes.flatMap(({ joints }) => joints))),
        pca: packer.add(pcaData, { codec: "delta", channels: 3 }),
    };

    const manifest = {
        about: "The MakeHuman base body (CC0), prepared by scripts/build-characters.js. Metres, y up, facing +z. human.bin is gzip-compressed; see client/js/characters/pack.js.",
        sourceVertices: count,
        renderVertices: renderSource.length,
        parts,
        bones,
        layout,
        macro: {
            names: macroNames,
            components: components.length,
            scales: pcaScales,
            coefficients: coefficients.map((row) => row.map((value) => Math.round(value * 1e6) / 1e6)),
        },
        details,
        deltaUnit: DELTA_UNIT,
        masks: MASKS.map((name) => `masks/${name}.jpg`),
    };

    const packed = gzipSync(packer.toBytes(), { level: 9 });

    writeFileSync(path.join(target, "human.bin"), packed);
    writeFileSync(path.join(target, "human.json"), `${JSON.stringify(manifest)}\n`);

    for (const name of MASKS) {
        copyFileSync(path.join(data, "textures", `mpfb_${name}.jpg`), path.join(target, "masks", `${name}.jpg`));
    }

    console.log(`${count} vertices (${renderSource.length} to draw), ${indices.length / 3} triangles, ${bones.length} bones`);
    console.log(`${n} macro shapes in ${components.length} components (worst error ${(worst * 1000).toFixed(2)} mm); ${details.length} detail shapes`);
    console.log(`human.bin: ${(packed.length / 1024).toFixed(0)} KB (${(packer.length / 1024).toFixed(0)} KB unpacked)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
