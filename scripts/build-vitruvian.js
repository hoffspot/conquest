// Prepares the CharMorph "Vitruvian" body (CC0: github.com/Upliner/CharMorph-Vitruvian) for the
// character engine (npm run build:vitruvian), in the same shape as the MakeHuman body
// (scripts/build-characters.js), so everything made on that is made on this:
//
//     git clone --depth 1 https://github.com/Upliner/CharMorph-Vitruvian ../charmorph-vitruvian
//     # char.blend is kept in Git LFS: without git-lfs, fetch it on its own
//     curl -L -o ../charmorph-vitruvian/char.blend \
//         https://media.githubusercontent.com/media/Upliner/CharMorph-Vitruvian/main/char.blend
//     npm run build:vitruvian -- --from=../charmorph-vitruvian
//
// It writes client/characters/vitruvian.bin and vitruvian.json:
//
//   - Vitruvian's mesh (metres, y up, facing +z, as tall as MakeHuman's), its skin brought down to about 28,000 triangles
//     (from 52,544: the hero character's budget), drawn with Vitruvian's own texture
//     coordinates, its four skin tiles (head, torso, arms, legs) side by side in one square; and
//     its eyes. The eyelashes are MakeHuman's, set on its eyes (Vitruvian has none of its own).
//   - the Mixamo skeleton (Vitruvian's own rig: the same 52 bones), each vertex's four strongest
//     bone weights, and where every joint is (Vitruvian's: averages of vertices)
//   - every shape the sliders blend (MakeHuman's: macro.js, details.js), carried over from the
//     MakeHuman body (client/characters/human.*) onto this one: MakeHuman's body is posed and
//     sized onto Vitruvian's bone by bone, each Vitruvian vertex takes the change of the point
//     of it nearest (turned as the bones there are), and the base is set so that the sliders as
//     they start give Vitruvian's own body. So every slider, every people's look and every soldier's build work on it at once.
//   - MakeHuman's masks for painting skin (lips, nails...), carried over the same way into this
//     body's texture layout.
//   - where garments measure the neck from, as MakeHuman's joints are in different places
//     (landmarks: garments.js measureBody).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, gunzipSync, gzipSync } from "node:zlib";
import jpeg from "jpeg-js";
import { MeshoptSimplifier } from "meshoptimizer";
import { HumanData } from "../client/js/characters/body.js";
import { allDetailTargetNames } from "../client/js/characters/details.js";
import { allBustTargetNames, allMacroTargetNames, bustTargets, MACRO_DEFAULTS, macroTargets } from "../client/js/characters/macro.js";
import { Packer } from "../client/js/characters/pack.js";
import { symmetricEigen } from "./build-characters.js";
import { meshes, meshLayer, readBlend } from "./lib/blend.js";
import { namesOf, readNpy, readNpz } from "./lib/npy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Vitruvian's materials (the order of char.blend's mesh's): which part each face is in, or none
// (the mouth's inside, the irises and pupils behind the cornea, the tear line)
const MATERIALS = ["Iris", "Mouth", "Pupil", "Sclera_Cornea", "UDIM.Skin", "charmorph_censor", "EyeHair", "Tearline"];
const PART_OF = { "UDIM.Skin": "body", "charmorph_censor": "body", "Sclera_Cornea": "eyes" };

// How many triangles the skin is brought down to
const SKIN_TRIANGLES = 28000;

// The same tolerance, steps and units as the MakeHuman body's (build-characters.js)
const PCA_TOLERANCE = 0.0015;
const PCA_STEPS = 2047;
const DELTA_UNIT = 0.0001;

// Detail shapes' moves smaller than this (metres) are left out
const DETAIL_CUTOFF = 0.00005;

// How far (metres) a Vitruvian point looks for the MakeHuman body's nearest point, and how alike
// their surfaces' facings must be (the cosine of the angle between them) for it to count
const REACH = 0.08;
const FACING = 0.2;

// The masks for painting skin, as MakeHuman's (build-characters.js), and how big they're made
const MASKS = ["lips", "ears", "eyelids", "aureolae", "fingernails", "toenails", "crotch"];
const MASK_SIZE = 1024;

// Blender's z up, facing -y, to ours: y up, facing +z
const toOurs = (x, y, z) => [x, z, -y];

/** Vitruvian as CharMorph keeps it: the mesh, its materials and texture coordinates, rig and weights. */
export function loadVitruvian(from) {
    const blend = readBlend(path.join(from, "char.blend"));
    const [mesh] = meshes(blend).filter(({ name }) => name === "cm_vitruvian");
    const corners = new Int32Array(meshLayer(blend, mesh, "ldata", ".corner_vert"));
    const uvs = new Float32Array(meshLayer(blend, mesh, "ldata", "VitruvianUV.UDIM"));
    const materials = new Int32Array(meshLayer(blend, mesh, "pdata", "material_index"));
    const faces = readNpy(path.join(from, "faces.npy"));
    const base = readNpy(path.join(from, "morphs/L1/Default.npy")).data;
    const count = base.length / 3;
    const positions = new Float64Array(count * 3);

    // The .blend's faces are faces.npy's, corner for corner (so its texture coordinates are theirs)
    if (faces.shape[0] !== mesh.totpoly || faces.shape[1] !== 4 || corners.some((v, k) => v !== faces.data[k])) {
        throw new Error("char.blend's faces aren't faces.npy's");
    }

    for (let v = 0; v < count; v++) {
        positions.set(toOurs(base[v * 3], base[v * 3 + 1], base[v * 3 + 2]), v * 3);
    }

    const weights = readNpz(path.join(from, "weights/mixamo.npz"));
    const joints = readNpz(path.join(from, "joints/Mixamo.npz"));
    const strip = (name) => name.replace("mixamorig:", "");
    const byBone = new Map();
    let at = 0;

    namesOf(weights.names).forEach((name, b) => {
        const list = [];

        for (let k = 0; k < weights.cnt.data[b]; k++, at++) {
            list.push([weights.idx.data[at], weights.weights.data[at]]);
        }

        byBone.set(strip(name), list);
    });

    const jointEnds = new Map();

    at = 0;
    namesOf(joints.names).forEach((name, j) => {
        const list = [];
        let total = 0;

        for (let k = 0; k < joints.cnt.data[j]; k++, at++) {
            list.push([joints.idx.data[at], joints.weights.data[at]]);
            total += joints.weights.data[at];
        }

        jointEnds.set(strip(name.replace(/^joint_/, "")), list.map(([v, w]) => [v, w / total]));
    });

    return { count, positions, corners, uvs, materials, faceCount: mesh.totpoly, weights: byBone, jointEnds };
}

/** The MakeHuman body as the engine has it (client/characters/human.*), and every shape's change. */
export function loadMakeHuman() {
    const manifest = JSON.parse(readFileSync(path.join(root, "client/characters/human.json"), "utf8"));
    const bytes = gunzipSync(readFileSync(path.join(root, "client/characters/human.bin")));
    const human = new HumanData(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const count = human.vertexCount;

    // A macro shape's change of every vertex (from its principal components) and of every joint
    const macro = (name) => {
        const t = human.macroIndex.get(name);
        const deltas = new Float64Array(count * 3);

        human.coefficients[t].forEach((c, k) => {
            const factor = c * human.pcaScales[k];
            const at = k * count * 3;

            for (let j = 0; j < count * 3; j++) {
                deltas[j] += factor * human.pca[at + j];
            }
        });

        return { deltas, joints: human.macroJoints.subarray(t * human.jointBase.length, (t + 1) * human.jointBase.length) };
    };

    const detail = (name) => {
        const { vertices, deltas: moves, joints } = human.details.get(name);
        const deltas = new Float64Array(count * 3);

        vertices.forEach((v, i) => {
            deltas[v * 3] = moves[i * 3] * human.deltaUnit;
            deltas[v * 3 + 1] = moves[i * 3 + 1] * human.deltaUnit;
            deltas[v * 3 + 2] = moves[i * 3 + 2] * human.deltaUnit;
        });

        return { deltas, joints };
    };

    return { manifest, human, macro, detail };
}

// --- Small vector helpers ---

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => {
    const l = length(a) || 1;

    return [a[0] / l, a[1] / l, a[2] / l];
};
const apply = (m, a) => [m[0] * a[0] + m[1] * a[1] + m[2] * a[2], m[3] * a[0] + m[4] * a[1] + m[5] * a[2], m[6] * a[0] + m[7] * a[1] + m[8] * a[2]];
const multiply = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));

// The rotation turning unit vector `a` onto unit vector `b` the shortest way (row-major 3x3)
function rotationBetween(a, b) {
    const v = cross(a, b);
    const c = dot(a, b);

    if (c < -0.999999) {
        const axis = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));

        return [0, 1, 2].flatMap((r) => [0, 1, 2].map((k) => 2 * axis[r] * axis[k] - (r === k ? 1 : 0)));
    }

    const k = 1 / (1 + c);
    const skew = [0, -v[2], v[1], v[2], 0, -v[0], -v[1], v[0], 0];
    const square = multiply(skew, skew);

    return [0, 1, 2].flatMap((r) => [0, 1, 2].map((col) => (r === col ? 1 : 0) + skew[r * 3 + col] + square[r * 3 + col] * k));
}

/**
 * Each bone's way from the MakeHuman body onto Vitruvian's: { matrix (3x3), turn (3x3), from (its
 * head on MakeHuman's), to (its head on Vitruvian's) }: `matrix` turns MakeHuman's bone to lie
 * along Vitruvian's, stretched along it to its length; `turn` only turns it.
 */
export function boneMaps(fromJoints, toJoints, boneCount) {
    return Array.from({ length: boneCount }, (_, b) => {
        const from = Array.from(fromJoints.subarray(b * 6, b * 6 + 3));
        const to = Array.from(toJoints.subarray(b * 6, b * 6 + 3));
        const along = sub(Array.from(fromJoints.subarray(b * 6 + 3, b * 6 + 6)), from);
        const onto = sub(Array.from(toJoints.subarray(b * 6 + 3, b * 6 + 6)), to);
        const a = unit(along);
        const stretch = length(onto) / (length(along) || 1);
        const scale = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (r === c ? 1 : 0) + (stretch - 1) * a[r] * a[c]));

        const turn = rotationBetween(a, unit(onto));

        return { matrix: multiply(turn, scale), turn, from, to };
    });
}

// A point's blend of the bones' turns (by its four weights)
function blendedTurn(maps, bones, weights) {
    const m = new Array(9).fill(0);

    bones.forEach((b, k) => {
        for (let i = 0; i < 9; i++) {
            m[i] += weights[k] * maps[b].turn[i];
        }
    });

    return m;
}

/**
 * The nearest point of a set of triangles to each of some points, facing the same way: for each,
 * { triangle, weights ([3]: barycentric), distance } or null. A grid of cells `cell` metres a side
 * holds the triangles.
 */
export function nearestPoints(positions, triangles, normals, points, pointNormals, { reach = REACH, facing = FACING, cell = 0.02 } = {}) {
    const keyOf = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    const grid = new Map();

    for (let t = 0; t < triangles.length / 3; t++) {
        const [a, b, c] = [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]].map((v) => positions.subarray(v * 3, v * 3 + 3));
        const lo = [0, 1, 2].map((k) => Math.floor(Math.min(a[k], b[k], c[k]) / cell));
        const hi = [0, 1, 2].map((k) => Math.floor(Math.max(a[k], b[k], c[k]) / cell));

        for (let x = lo[0]; x <= hi[0]; x++) {
            for (let y = lo[1]; y <= hi[1]; y++) {
                for (let z = lo[2]; z <= hi[2]; z++) {
                    const key = `${x},${y},${z}`;

                    if (!grid.has(key)) {
                        grid.set(key, []);
                    }

                    grid.get(key).push(t);
                }
            }
        }
    }

    const results = [];

    for (let p = 0; p < points.length / 3; p++) {
        const q = [points[p * 3], points[p * 3 + 1], points[p * 3 + 2]];
        const n = pointNormals ? [pointNormals[p * 3], pointNormals[p * 3 + 1], pointNormals[p * 3 + 2]] : null;
        let best = null;

        // Rings of cells outwards, until a ring can't hold anything nearer than what's found
        for (let ring = 0; ring * cell <= reach + cell && !(best && best.distance < (ring - 1) * cell); ring++) {
            const [cx, cy, cz] = keyOf(...q).split(",").map(Number);
            const seen = new Set();

            for (let x = cx - ring; x <= cx + ring; x++) {
                for (let y = cy - ring; y <= cy + ring; y++) {
                    for (let z = cz - ring; z <= cz + ring; z++) {
                        if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== ring) {
                            continue;
                        }

                        for (const t of grid.get(`${x},${y},${z}`) ?? []) {
                            if (seen.has(t) || (n && normals && dot(n, [normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2]]) < facing)) {
                                continue;
                            }

                            seen.add(t);

                            const found = closestOnTriangle(q, positions, triangles, t);

                            if (found.distance <= reach && (!best || found.distance < best.distance)) {
                                best = { triangle: t, ...found };
                            }
                        }
                    }
                }
            }
        }

        results.push(best);
    }

    return results;
}

// The nearest point of a triangle to a point: { weights (barycentric), distance }
function closestOnTriangle(p, positions, triangles, t) {
    const [a, b, c] = [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]].map((v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);
    const ab = sub(b, a);
    const ac = sub(c, a);
    const ap = sub(p, a);
    const d1 = dot(ab, ap);
    const d2 = dot(ac, ap);
    const done = (u, v, w) => {
        const q = [u * a[0] + v * b[0] + w * c[0], u * a[1] + v * b[1] + w * c[1], u * a[2] + v * b[2] + w * c[2]];

        return { weights: [u, v, w], distance: length(sub(p, q)) };
    };

    if (d1 <= 0 && d2 <= 0) {
        return done(1, 0, 0);
    }

    const bp = sub(p, b);
    const d3 = dot(ab, bp);
    const d4 = dot(ac, bp);

    if (d3 >= 0 && d4 <= d3) {
        return done(0, 1, 0);
    }

    const vc = d1 * d4 - d3 * d2;

    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);

        return done(1 - v, v, 0);
    }

    const cp = sub(p, c);
    const d5 = dot(ab, cp);
    const d6 = dot(ac, cp);

    if (d6 >= 0 && d5 <= d6) {
        return done(0, 0, 1);
    }

    const vb = d5 * d2 - d1 * d6;

    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);

        return done(1 - w, 0, w);
    }

    const va = d3 * d6 - d5 * d4;

    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
        const w = (d4 - d3) / (d4 - d3 + (d5 - d6));

        return done(0, 1 - w, w);
    }

    const denominator = 1 / (va + vb + vc);
    const v = vb * denominator;
    const w = vc * denominator;

    return done(1 - v - w, v, w);
}

/** Each triangle's unit normal (positions per vertex, three indices a triangle). */
export function triangleNormals(positions, triangles) {
    const normals = new Float64Array(triangles.length);

    for (let t = 0; t < triangles.length / 3; t++) {
        const [a, b, c] = [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]].map((v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);

        normals.set(unit(cross(sub(b, a), sub(c, a))), t * 3);
    }

    return normals;
}

/** Each vertex's unit normal, the sum of its triangles' (positions per vertex, three indices a triangle). */
export function vertexNormals(positions, triangles) {
    const normals = new Float64Array(positions.length);
    const faces = triangleNormals(positions, triangles);

    for (let t = 0; t < triangles.length / 3; t++) {
        for (let k = 0; k < 3; k++) {
            const v = triangles[t * 3 + k];

            normals[v * 3] += faces[t * 3];
            normals[v * 3 + 1] += faces[t * 3 + 1];
            normals[v * 3 + 2] += faces[t * 3 + 2];
        }
    }

    for (let v = 0; v < normals.length; v += 3) {
        normals.set(unit([normals[v], normals[v + 1], normals[v + 2]]), v);
    }

    return normals;
}


// A PNG of one 8-bit channel (`size` square), for the masks
function grayPng(pixels, size) {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;

        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }

        return c >>> 0;
    });
    const crc = (bytes) => {
        let c = 0xffffffff;

        for (const byte of bytes) {
            c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
        }

        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
        const head = Buffer.alloc(4);
        const tail = Buffer.alloc(4);

        head.writeUInt32BE(data.length);
        tail.writeUInt32BE(crc(body));

        return Buffer.concat([head, body, tail]);
    };
    const header = Buffer.alloc(13);
    const rows = Buffer.alloc(size * (size + 1));

    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 0;

    for (let y = 0; y < size; y++) {
        rows.set(pixels.subarray(y * size, (y + 1) * size), y * (size + 1) + 1);
    }

    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
    const from = path.resolve(process.argv.find((arg) => arg.startsWith("--from="))?.split("=")[1] ?? path.join(root, "../charmorph-vitruvian"));

    if (!existsSync(path.join(from, "char.blend")) || readFileSync(path.join(from, "char.blend")).length < 1e6) {
        console.error(`Vitruvian's char.blend isn't at ${from} (or it's only Git LFS's pointer to it): see the top of scripts/build-vitruvian.js`);
        process.exit(1);
    }

    await MeshoptSimplifier.ready;

    const vitruvian = loadVitruvian(from);
    const { manifest: makeHuman, human, macro, detail } = loadMakeHuman();
    const bones = makeHuman.bones;
    const boneIndex = new Map(bones.map(({ name }, b) => [name, b]));

    // The sliders as they start: MakeHuman's shapes at those weights make its default body, which
    // is what's laid over Vitruvian's
    const defaults = [...macroTargets(MACRO_DEFAULTS), ...bustTargets(MACRO_DEFAULTS)];
    const shapeNames = [...allMacroTargetNames(), ...allDetailTargetNames(), ...allBustTargetNames()];
    const macroNames = new Set(allMacroTargetNames());
    const shapes = new Map(shapeNames.map((name) => [name, macroNames.has(name) ? macro(name) : detail(name)]));
    const humanCount = human.vertexCount;
    const humanDefault = Float64Array.from(human.basePositions);
    const humanJoints = Float64Array.from(human.jointBase);

    for (const { name, weight } of defaults) {
        const { deltas, joints } = shapes.get(name);

        deltas.forEach((value, j) => {
            humanDefault[j] += weight * value;
        });
        joints.forEach((value, j) => {
            humanJoints[j] += weight * value;
        });
    }

    // Vitruvian's joints, in our bones' order: each end the average of its vertices (an end
    // CharMorph doesn't list is the parent bone's tail)
    const jointAt = (ends, positions) => {
        const p = [0, 0, 0];

        for (const [v, w] of ends) {
            p[0] += w * positions[v * 3];
            p[1] += w * positions[v * 3 + 1];
            p[2] += w * positions[v * 3 + 2];
        }

        return p;
    };
    const jointEnds = bones.flatMap(({ name, parent }) => [vitruvian.jointEnds.get(`${name}_head`) ?? { parentTail: parent }, vitruvian.jointEnds.get(`${name}_tail`)]);
    const jointsOf = (positions) => {
        const joints = new Float64Array(jointEnds.length * 3);

        jointEnds.forEach((ends, k) => {
            joints.set(ends.parentTail === undefined ? jointAt(ends, positions) : joints.subarray((ends.parentTail * 2 + 1) * 3, (ends.parentTail * 2 + 2) * 3), k * 3);
        });

        return joints;
    };

    const heightOf = (positions, count) => {
        let [low, high] = [Infinity, -Infinity];

        for (let v = 0; v < count; v++) {
            low = Math.min(low, positions[v * 3 + 1]);
            high = Math.max(high, positions[v * 3 + 1]);
        }

        return high - low;
    };
    const groundOf = (positions, count) => {
        let low = Infinity;

        for (let v = 0; v < count; v++) {
            low = Math.min(low, positions[v * 3 + 1]);
        }

        return low;
    };

    // Vitruvian brought to MakeHuman's default body's height (it's 5% taller), and set where that
    // body stands (its hips' head on MakeHuman's), so measures taken on that body's frame still fit
    const scale = heightOf(humanDefault, humanCount) / heightOf(vitruvian.positions, vitruvian.count);

    for (let j = 0; j < vitruvian.positions.length; j++) {
        vitruvian.positions[j] *= scale;
    }

    const ownJoints = jointsOf(vitruvian.positions);
    const shift = [0, 1, 2].map((k) => humanJoints[k] - ownJoints[k]);

    for (let j = 0; j < vitruvian.positions.length; j++) {
        vitruvian.positions[j] += shift[j % 3];
    }

    const vitruvianJoints = jointsOf(vitruvian.positions);

    // MakeHuman's neck bone starts half way up the neck, Vitruvian's at its foot (and its skull's
    // joint is a centimetre lower). Where MakeHuman's starts, on Vitruvian: as high up it (the
    // bodies are as tall, and their necks run from their shoulders to their chins at the same
    // heights). Garments measure the neck from there (the manifest's landmarks.neck, as a fraction
    // of the way up the neck bone: garments.js measureBody), and MakeHuman's body is laid over
    // Vitruvian's with its neck bone starting there.
    const jointY = (joints, name) => joints[boneIndex.get(name) * 6 + 1];
    const neckY = groundOf(vitruvian.positions, vitruvian.count) + jointY(humanJoints, "Neck") - groundOf(humanDefault, humanCount);
    const neckFraction = (neckY - jointY(vitruvianJoints, "Neck")) / (jointY(vitruvianJoints, "Head") - jointY(vitruvianJoints, "Neck"));
    const layJoints = Float64Array.from(vitruvianJoints);
    const [neck, chest] = [boneIndex.get("Neck") * 6, boneIndex.get("Spine2") * 6 + 3];

    for (let k = 0; k < 3; k++) {
        layJoints[neck + k] += neckFraction * (vitruvianJoints[neck + 3 + k] - vitruvianJoints[neck + k]);
        layJoints[chest + k] = layJoints[neck + k];
    }

    // MakeHuman's default body posed and sized onto Vitruvian's, bone by bone, by its own weights
    const maps = boneMaps(Float32Array.from(humanJoints), Float32Array.from(layJoints), bones.length);
    const humanBones = (v) => [0, 1, 2, 3].map((k) => human.skinIndices[v * 4 + k]);
    const humanWeights = (v) => [0, 1, 2, 3].map((k) => human.skinWeights[v * 4 + k] / 255);
    const laid = new Float64Array(humanCount * 3);

    for (let v = 0; v < humanCount; v++) {
        const p = [0, 0, 0];
        const weights = humanWeights(v);

        humanBones(v).forEach((b, k) => {
            const { matrix, from: head, to } = maps[b];
            const local = apply(matrix, sub([humanDefault[v * 3], humanDefault[v * 3 + 1], humanDefault[v * 3 + 2]], head));

            for (let a = 0; a < 3; a++) {
                p[a] += weights[k] * (to[a] + local[a]);
            }
        });

        laid.set(p, v * 3);
    }

    // Vitruvian's faces, by part, as triangles of its vertices
    const faceTriangles = { body: [], eyes: [] };

    for (let f = 0; f < vitruvian.faceCount; f++) {
        const part = PART_OF[MATERIALS[vitruvian.materials[f]]];

        if (part) {
            faceTriangles[part].push([f, 0, 1, 2], [f, 0, 2, 3]);
        }
    }

    // The skin's render vertices (a vertex at a texture coordinate: Vitruvian's four skin tiles side
    // by side in one square, head bottom left, torso bottom right, arms and legs above), and its
    // triangles brought down to the budget
    const renderOf = new Map();
    const render = [];
    const cornerRender = (f, k) => {
        const l = f * 4 + k;
        const v = vitruvian.corners[l];
        const [u, w] = [vitruvian.uvs[l * 2], vitruvian.uvs[l * 2 + 1]];
        const tile = Math.floor(u) + 2 * Math.floor(w);
        const uv = [((tile % 2) + u - Math.floor(u)) / 2, (Math.floor(tile / 2) + w - Math.floor(w)) / 2];
        const key = `${v} ${uv[0].toFixed(6)} ${uv[1].toFixed(6)}`;

        if (!renderOf.has(key)) {
            renderOf.set(key, render.length);
            render.push({ v, uv });
        }

        return renderOf.get(key);
    };
    const skin = Uint32Array.from(faceTriangles.body.flatMap(([f, ...ks]) => ks.map((k) => cornerRender(f, k))));
    const renderPositions = Float32Array.from(render.flatMap(({ v }) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)]));
    const renderUVs = Float32Array.from(render.flatMap(({ uv }) => uv));
    const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(skin, renderPositions, 3, renderUVs, 2, [0.5, 0.5], null, SKIN_TRIANGLES * 3, 0.05, ["LockBorder"]);

    console.log(`skin: ${skin.length / 3} triangles to ${simplified.length / 3} (error ${(error * 100).toFixed(2)}% of its size)`);

    // The vertices kept ("source" vertices, as the MakeHuman body's): the skin's, then the
    // eyelashes' (MakeHuman's, set on these eyes), then the eyes'
    const sourceOf = new Map();
    const sources = [];
    const keep = (key, entry) => {
        if (!sourceOf.has(key)) {
            sourceOf.set(key, sources.length);
            sources.push(entry);
        }

        return sourceOf.get(key);
    };

    for (const r of simplified) {
        keep(`v${render[r].v}`, { kind: "vitruvian", v: render[r].v });
    }

    const lashRender = human.renderIndices("lashes");
    const lashSource = [...new Set(Array.from(lashRender, (r) => human.renderSource[r]))];

    for (const h of lashSource) {
        keep(`h${h}`, { kind: "human", v: h });
    }

    const eyeVertices = [...new Set(faceTriangles.eyes.flatMap(([f, ...ks]) => ks.map((k) => vitruvian.corners[f * 4 + k])))];

    for (const v of eyeVertices) {
        keep(`v${v}`, { kind: "vitruvian", v });
    }

    const count = sources.length;

    // Where each Vitruvian vertex (kept, or in a joint's average) is on MakeHuman's body laid over
    // it: the nearest point facing the same way (or, failing that, any way), and how the bones
    // there turn a change of shape. (Turned only, not stretched as the bones are to lay the
    // bodies over each other: the bodies are as tall and alike, their joints only put in different
    // places, as the necks' are, so a change is as big on either.)
    const humanSource = (part) => Uint32Array.from(human.renderIndices(part), (r) => human.renderSource[r]);
    const humanSkin = humanSource("body");
    const humanEyes = humanSource("eyes");
    const vitruvianNormals = vertexNormals(vitruvian.positions, faceTriangles.body.flatMap(([f, ...ks]) => ks.map((k) => vitruvian.corners[f * 4 + k])));
    const jointVertices = [...new Set(jointEnds.flatMap((ends) => (ends.parentTail === undefined ? ends.map(([v]) => v) : [])))];
    const placeOn = (vertices, triangles, normals) => {
        const points = Float64Array.from(vertices.flatMap((v) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)]));
        const facings = normals ? Float64Array.from(vertices.flatMap((v) => [...normals.subarray(v * 3, v * 3 + 3)])) : null;
        const near = nearestPoints(laid, triangles, normals ? triangleNormals(laid, triangles) : null, points, facings);
        const missed = vertices.filter((_, i) => !near[i]);
        const anyWay = missed.length ? nearestPoints(laid, triangles, null, Float64Array.from(missed.flatMap((v) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)])), null, { reach: 0.3 }) : [];

        return new Map(vertices.map((v, i) => [v, near[i] ?? anyWay[missed.indexOf(v)]]));
    };
    const onSkin = placeOn([...new Set([...sources.filter(({ kind }) => kind === "vitruvian").map(({ v }) => v).filter((v) => !eyeVertices.includes(v)), ...jointVertices])], humanSkin, vitruvianNormals);
    const onEyes = placeOn(eyeVertices, humanEyes, null);
    const distances = [...onSkin.values()].map(({ distance }) => distance).sort((x, y) => x - y);
    const within = (share) => (distances[Math.floor(share * (distances.length - 1))] * 1000).toFixed(1);

    console.log(`laid over each other: half the skin within ${within(0.5)} mm of MakeHuman's, 90% within ${within(0.9)} mm, 99% within ${within(0.99)} mm`);
    const placed = new Map([...onSkin, ...onEyes].map(([v, { triangle, weights }]) => {
        const triangles = eyeVertices.includes(v) ? humanEyes : humanSkin;
        const corners = [0, 1, 2].map((k) => triangles[triangle * 3 + k]);
        const bonesThere = new Map();

        corners.forEach((h, k) => humanBones(h).forEach((b, i) => bonesThere.set(b, (bonesThere.get(b) ?? 0) + weights[k] * humanWeights(h)[i])));

        return [v, { corners, weights, matrix: blendedTurn(maps, [...bonesThere.keys()], [...bonesThere.values()]) }];
    }));

    // A shape's change at a kept vertex, or a Vitruvian vertex
    const changeAt = (deltas, entry) => {
        if (entry.kind === "human") {
            const weights = humanWeights(entry.v);

            return apply(blendedTurn(maps, humanBones(entry.v), weights), [deltas[entry.v * 3], deltas[entry.v * 3 + 1], deltas[entry.v * 3 + 2]]);
        }

        const { corners, weights, matrix } = placed.get(entry.v);
        const d = [0, 0, 0];

        corners.forEach((h, k) => {
            d[0] += weights[k] * deltas[h * 3];
            d[1] += weights[k] * deltas[h * 3 + 1];
            d[2] += weights[k] * deltas[h * 3 + 2];
        });

        return apply(matrix, d);
    };
    const jointChanges = (deltas) => {
        const at = new Map(jointVertices.map((v) => [v, changeAt(deltas, { kind: "vitruvian", v })]));
        const moves = new Float64Array(jointEnds.length * 3);

        jointEnds.forEach((ends, k) => {
            if (ends.parentTail === undefined) {
                for (const [v, w] of ends) {
                    moves[k * 3] += w * at.get(v)[0];
                    moves[k * 3 + 1] += w * at.get(v)[1];
                    moves[k * 3 + 2] += w * at.get(v)[2];
                }
            } else {
                moves.set(moves.subarray((ends.parentTail * 2 + 1) * 3, (ends.parentTail * 2 + 2) * 3), k * 3);
            }
        });

        return moves;
    };
    const carried = new Map(shapeNames.map((name) => {
        const { deltas } = shapes.get(name);

        return [name, { deltas: Float64Array.from(sources.flatMap((entry) => changeAt(deltas, entry))), joints: jointChanges(deltas) }];
    }));

    // The base: Vitruvian's own body (and the eyelashes set on its eyes), less the default shapes,
    // so the sliders as they start give Vitruvian's body
    const base = new Float64Array(count * 3);
    const eyeCentre = (positions, list, side) => {
        const on = list.filter((p) => Math.sign(p[0]) === side);

        return [0, 1, 2].map((k) => on.reduce((sum, p) => sum + p[k], 0) / on.length);
    };
    const humanEyeVertices = [...new Set(humanEyes)];
    const offsets = new Map([-1, 1].map((side) => [side, sub(
        eyeCentre(vitruvian.positions, eyeVertices.map((v) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)]), side),
        eyeCentre(laid, humanEyeVertices.map((h) => [...laid.subarray(h * 3, h * 3 + 3)]), side),
    )]));

    sources.forEach((entry, i) => {
        const p = entry.kind === "human" ? [...laid.subarray(entry.v * 3, entry.v * 3 + 3)] : [...vitruvian.positions.subarray(entry.v * 3, entry.v * 3 + 3)];

        if (entry.kind === "human") {
            const offset = offsets.get(Math.sign(p[0]) || 1);

            p[0] += offset[0];
            p[1] += offset[1];
            p[2] += offset[2];
        }

        base.set(p, i * 3);
    });

    const jointBase = Float64Array.from(vitruvianJoints);

    for (const { name, weight } of defaults) {
        const { deltas, joints } = carried.get(name);

        deltas.forEach((value, j) => {
            base[j] -= weight * value;
        });
        joints.forEach((value, j) => {
            jointBase[j] -= weight * value;
        });
    }

    // The parts' render vertices and triangles: the skin's as simplified, the eyelashes'
    // (MakeHuman's texture coordinates; they're drawn untextured), and the eyes', whose texture
    // coordinates run across their fronts, centred on their pupils (as the MakeHuman body's)
    const renderSource = [];
    const renderUV = [];
    const indices = [];
    const parts = {};
    const drawn = new Map();
    const drawAt = (key, source, uv) => {
        if (!drawn.has(key)) {
            drawn.set(key, renderSource.length);
            renderSource.push(source);
            renderUV.push(...uv);
        }

        return drawn.get(key);
    };

    parts.body = { start: 0 };

    for (const r of simplified) {
        indices.push(drawAt(`s${r}`, sourceOf.get(`v${render[r].v}`), render[r].uv));
    }

    parts.body.count = indices.length;
    parts.lashes = { start: indices.length };

    for (const r of lashRender) {
        indices.push(drawAt(`l${r}`, sourceOf.get(`h${human.renderSource[r]}`), [human.uvs[r * 2], human.uvs[r * 2 + 1]]));
    }

    parts.lashes.count = indices.length - parts.lashes.start;
    parts.eyes = { start: indices.length };

    const eyeFrame = new Map([-1, 1].map((side) => {
        const on = eyeVertices.filter((v) => Math.sign(vitruvian.positions[v * 3]) === side);
        const centre = [0, 1, 2].map((k) => on.reduce((sum, v) => sum + vitruvian.positions[v * 3 + k], 0) / on.length);
        const radius = Math.max(...on.map((v) => length(sub([...vitruvian.positions.subarray(v * 3, v * 3 + 3)], centre))));

        return [side, { centre, radius }];
    }));

    for (const [f, ...ks] of faceTriangles.eyes) {
        for (const k of ks) {
            const v = vitruvian.corners[f * 4 + k];
            const { centre, radius } = eyeFrame.get(Math.sign(vitruvian.positions[v * 3]));
            const uv = [0.5 + (vitruvian.positions[v * 3] - centre[0]) / (2 * radius), 0.5 + (vitruvian.positions[v * 3 + 1] - centre[1]) / (2 * radius)];

            indices.push(drawAt(`e${v}`, sourceOf.get(`v${v}`), uv));
        }
    }

    parts.eyes.count = indices.length - parts.eyes.start;

    if (renderSource.length > 65535 || count > 65535) {
        throw new Error(`Too many vertices for 16-bit indices: ${count} (${renderSource.length} drawn)`);
    }

    // Each vertex's four strongest bones, in 255ths (the strongest first): Vitruvian's own weights,
    // and the eyelashes' MakeHuman's
    const influences = sources.map(() => []);
    const vitruvianSource = new Map(sources.map((entry, i) => [entry, i]).filter(([entry]) => entry.kind === "vitruvian").map(([entry, i]) => [entry.v, i]));

    for (const [name, list] of vitruvian.weights) {
        for (const [v, weight] of list) {
            if (vitruvianSource.has(v)) {
                influences[vitruvianSource.get(v)].push([boneIndex.get(name), weight]);
            }
        }
    }

    sources.forEach((entry, i) => {
        if (entry.kind === "human") {
            influences[i] = humanBones(entry.v).map((b, k) => [b, humanWeights(entry.v)[k]]).filter(([, w]) => w > 0);
        }
    });

    const skinIndices = new Uint8Array(count * 4);
    const skinWeights = new Uint8Array(count * 4);

    influences.forEach((list, i) => {
        const strongest = list.sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = strongest.reduce((sum, [, weight]) => sum + weight, 0) || 1;
        const shares = strongest.map(([, weight]) => Math.round((weight / total) * 255));

        shares[0] += 255 - shares.reduce((sum, share) => sum + share, 0);
        strongest.forEach(([bone], k) => {
            skinIndices[i * 4 + k] = bone;
            skinWeights[i * 4 + k] = shares[k];
        });
    });

    // The macro shapes in principal components (as build-characters.js)
    const macroShapes = allMacroTargetNames().map((name) => ({ name, ...carried.get(name) }));
    const n = macroShapes.length;
    const gram = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
            let sum = 0;

            for (let k = 0; k < count * 3; k++) {
                sum += macroShapes[i].deltas[k] * macroShapes[j].deltas[k];
            }

            gram[i][j] = sum;
            gram[j][i] = sum;
        }
    }

    const { values, vectors } = symmetricEigen(gram);
    const ranked = values.map((value, k) => ({ value, k })).filter(({ value }) => value > 1e-12).sort((a, b) => b.value - a.value);
    const components = [];
    const coefficients = macroShapes.map(() => []);
    const residuals = macroShapes.map(({ deltas }) => Float64Array.from(deltas));
    let worst = Infinity;

    for (const { value, k } of ranked) {
        const component = new Float64Array(count * 3);
        const norm = Math.sqrt(value);

        macroShapes.forEach(({ deltas }, i) => {
            const factor = vectors[i][k] / norm;

            for (let j = 0; j < component.length; j++) {
                component[j] += factor * deltas[j];
            }
        });

        components.push(component);
        worst = 0;

        macroShapes.forEach((_, i) => {
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

    // The detail and bust shapes, sparse: the vertices they move by more than a twentieth of a
    // millimetre
    const details = [...allDetailTargetNames(), ...allBustTargetNames()].map((name) => {
        const { deltas, joints } = carried.get(name);
        const moved = [];

        for (let i = 0; i < count; i++) {
            if (Math.hypot(deltas[i * 3], deltas[i * 3 + 1], deltas[i * 3 + 2]) > DETAIL_CUTOFF) {
                moved.push(i);
            }
        }

        return {
            name,
            vertices: packer.add(Uint16Array.from(moved), { codec: "delta" }),
            deltas: packer.add(Int16Array.from(moved.flatMap((i) => [0, 1, 2].map((k) => Math.round(deltas[i * 3 + k] / DELTA_UNIT)))), { codec: "delta", channels: 3 }),
            joints: Array.from(joints, (value) => Math.round(value * 1e6) / 1e6),
        };
    });

    const layout = {
        basePositions: packer.add(Float32Array.from(base)),
        uvs: packer.add(new Uint16Array(renderUV.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 65535)))),
        renderSource: packer.add(new Uint16Array(renderSource)),
        indices: packer.add(new Uint16Array(indices)),
        skinIndices: packer.add(skinIndices),
        skinWeights: packer.add(skinWeights),
        jointBase: packer.add(Float32Array.from(jointBase)),
        macroJoints: packer.add(Float32Array.from(macroShapes.flatMap(({ joints }) => Array.from(joints)))),
        pca: packer.add(pcaData, { codec: "delta", channels: 3 }),
    };

    const target = path.join(root, "client/characters");
    const manifest = {
        about: "CharMorph's Vitruvian body (CC0), prepared by scripts/build-vitruvian.js, with MakeHuman's shapes carried over onto it. Metres, y up, facing +z. vitruvian.bin is gzip-compressed; see client/js/characters/pack.js.",
        sourceVertices: count,
        renderVertices: renderSource.length,
        parts,
        bones,
        layout,
        macro: {
            names: allMacroTargetNames(),
            components: components.length,
            scales: pcaScales,
            coefficients: coefficients.map((row) => row.map((value) => Math.round(value * 1e6) / 1e6)),
        },
        details,
        deltaUnit: DELTA_UNIT,
        landmarks: { neck: Math.round(neckFraction * 1e4) / 1e4 },
        masks: MASKS.map((name) => `vitruvian/masks/${name}.png`),
    };
    const packed = gzipSync(packer.toBytes(), { level: 9 });

    writeFileSync(path.join(target, "vitruvian.bin"), packed);
    writeFileSync(path.join(target, "vitruvian.json"), `${JSON.stringify(manifest)}\n`);

    console.log(`${count} vertices (${renderSource.length} to draw), ${indices.length / 3} triangles, ${bones.length} bones`);
    console.log(`${n} macro shapes in ${components.length} components (worst error ${(worst * 1000).toFixed(2)} mm); ${details.length} detail and bust shapes`);
    console.log(`scaled by ${scale.toFixed(4)} to ${heightOf(vitruvian.positions, vitruvian.count).toFixed(3)} m; neck landmark ${neckFraction.toFixed(3)} of the way up the neck bone`);
    console.log(`vitruvian.bin: ${(packed.length / 1024).toFixed(0)} KB (${(packer.length / 1024).toFixed(0)} KB unpacked)`);

    writeMasks({ target, human, laid, humanSkin, vitruvian, simplified, render });
}

// MakeHuman's masks (client/characters/masks) carried over into Vitruvian's texture layout: each
// texel of the skin's takes the mask at the nearest point of MakeHuman's body laid over it
function writeMasks({ target, human, laid, humanSkin, vitruvian, simplified, render }) {
    const size = MASK_SIZE;
    const texels = [];
    const at = new Int32Array(size * size).fill(-1);

    // Rasterise the skin's triangles in texture space: each covered texel's point on the body
    for (let t = 0; t < simplified.length / 3; t++) {
        const corners = [0, 1, 2].map((k) => render[simplified[t * 3 + k]]);
        const [a, b, c] = corners.map(({ uv }) => [uv[0] * size, (1 - uv[1]) * size]);
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);

        if (Math.abs(area) < 1e-12) {
            continue;
        }

        for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))); y <= Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1]))); y++) {
            for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))); x <= Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0]))); x++) {
                const [px, py] = [x + 0.5, y + 0.5];
                const w1 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
                const w2 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
                const w3 = 1 - w1 - w2;

                if (w1 >= -0.01 && w2 >= -0.01 && w3 >= -0.01 && at[y * size + x] < 0) {
                    at[y * size + x] = texels.length;
                    texels.push(corners.reduce((p, { v }, k) => [0, 1, 2].map((axis) => p[axis] + [w1, w2, w3][k] * vitruvian.positions[v * 3 + axis]), [0, 0, 0]));
                }
            }
        }
    }

    const near = nearestPoints(laid, humanSkin, null, Float64Array.from(texels.flat()), null, { reach: 0.3 });

    // MakeHuman's texture coordinates at each of its triangles' corners
    const skinRender = human.renderIndices("body");
    const uvAt = (triangle, weights) => [0, 1].map((axis) => weights.reduce((sum, w, k) => sum + w * human.uvs[skinRender[triangle * 3 + k] * 2 + axis], 0));

    mkdirSync(path.join(target, "vitruvian/masks"), { recursive: true });

    for (const name of MASKS) {
        const { width, height, data } = jpeg.decode(readFileSync(path.join(target, "masks", `${name}.jpg`)), { useTArray: true });
        const sample = ([u, v]) => {
            const x = Math.min(width - 1, Math.max(0, Math.round(u * width - 0.5)));
            const y = Math.min(height - 1, Math.max(0, Math.round((1 - v) * height - 0.5)));

            return data[(y * width + x) * 4];
        };
        const pixels = new Uint8Array(size * size);

        at.forEach((texel, i) => {
            if (texel >= 0 && near[texel]) {
                pixels[i] = sample(uvAt(near[texel].triangle, near[texel].weights));
            }
        });

        writeFileSync(path.join(target, "vitruvian/masks", `${name}.png`), grayPng(pixels, size));
    }

    console.log(`masks: ${MASKS.length} at ${size}x${size}, ${texels.length} texels of skin`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
