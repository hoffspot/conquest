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
//   - every shape the sliders blend (MakeHuman's: macro.js, details.js), so every slider, every
//     people's look and every soldier's build work on it at once, and the base set so that the
//     sliders as they start give Vitruvian's own body. The body's sex, muscle, weight and bust
//     are Vitruvian's own shapes (OWN_SHAPES), its bones moving as MakeHuman's do. The rest, and
//     the head, are carried over from the MakeHuman body (client/characters/human.*):
//     MakeHuman's body is posed and sized onto Vitruvian's bone by bone and fitted onto its skin
//     (fitOnto), and each Vitruvian vertex takes the change of the point of it nearest (turned as
//     the bones there are); the face's by the face map.
//   - masks for painting skin: its lips and areolae its own, MakeHuman's others (nails,
//     eyelids...) carried over the same way into this body's texture layout.
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
import { faceFrame } from "../client/js/characters/face.js";
import { allBustTargetNames, allMacroTargetNames, bustTargets, MACRO_DEFAULTS, macroTargets } from "../client/js/characters/macro.js";
import { Packer } from "../client/js/characters/pack.js";
import { Rig, restOf } from "../client/js/characters/rig.js";
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

// How far round a nipple MakeHuman's skin is moved with it, to bring it onto Vitruvian's (metres:
// a breast's size), and how stiffly MakeHuman's skin is fitted onto Vitruvian's, round by round
// (fitOnto: from as a whole to point by point)
const NIPPLE_REACH = 0.07;
const STIFFNESS = [30, 10, 3, 1, 0.3];


// Which of Vitruvian's own shapes (its morphs/L2) make the body's flesh for each slider shape
// (MakeHuman's, by name: macro.js) and how much of each: its sex; its muscle and weight, as a sex
// has them (MakeHuman's "universal" shapes; the average ones are none); its bust. Its heritage and
// height are its bones only (Vitruvian's heritages are its face's, and the head keeps MakeHuman's).
// The amounts are set by eye against MakeHuman's body (the lab's presets, the motion check's
// extremes).
const OWN_SHAPES = {
    sex: { female: { Gender_Female: 1 }, male: { Gender_Male: 1 } },
    muscle: {
        female: { minmuscle: { BodyType_EndoMorph: 0.5 }, maxmuscle: { BodyType_Muscular: 0.6 } },
        male: { minmuscle: { BodyType_EndoMorph: 0.5 }, maxmuscle: { BodyType_Muscular: 1, Shoulders_ShoulderTrapeziusSize: 0.6, Arms_BicepSize: 0.6, Arms_TricepSize: 0.6, Arms_Forearm_Girth: 0.5 } },
    },
    weight: {
        female: { minweight: { BodyType_Emaciated: 0.7 }, maxweight: { BodyType_Fat: 0.25 } },
        male: { minweight: { BodyType_Emaciated: 0.7 }, maxweight: { BodyType_Fat: 0.25 } },
    },
    bust: { mincup: { Chest_FemaleFlatChested: 0.45 }, maxcup: { Chest_Breast_Size: 0.85 } },
};

/** A slider shape's own shapes ({ Vitruvian's shape: how much }), or null for those carried over from MakeHuman's (its details'). */
export function ownShape(name) {
    const sum = (...parts) => {
        const total = {};

        for (const part of parts) {
            for (const [morph, amount] of Object.entries(part ?? {})) {
                total[morph] = (total[morph] ?? 0) + amount;
            }
        }

        return total;
    };
    let match = name.match(/^macrodetails\/(african|asian|caucasian)-(female|male)-young$/);

    if (match) {
        return sum(OWN_SHAPES.sex[match[2]]);
    }

    match = name.match(/^macrodetails\/universal-(female|male)-young-(\w+muscle)-(\w+weight)$/);

    if (match) {
        return sum(OWN_SHAPES.muscle[match[1]][match[2]], OWN_SHAPES.weight[match[1]][match[3]]);
    }

    if (name.startsWith("macrodetails/height/")) {
        return {};
    }

    match = name.match(/^breast\/female-young-\w+-\w+-(mincup|maxcup)-averagefirmness$/);

    return match ? sum(OWN_SHAPES.bust[match[1]]) : null;
}

// The masks for painting skin, as MakeHuman's (build-characters.js), and how big they're made
const MASKS = ["lips", "ears", "eyelids", "aureolae", "fingernails", "toenails", "crotch"];
const MASK_SIZE = 1024;
// How soft the areolae's edges are (metres either side of their rims)
const AREOLA_EDGE = 0.002;

// Blender's z up, facing -y, to ours: y up, facing +z
const toOurs = (x, y, z) => [x, z, -y];

/**
 * Vitruvian as CharMorph keeps it: the mesh, its materials and texture coordinates, its lips (how
 * much each vertex is lip), rig and weights.
 */
export function loadVitruvian(from) {
    const blend = readBlend(path.join(from, "char.blend"));
    const [mesh] = meshes(blend).filter(({ name }) => name === "cm_vitruvian");
    const corners = new Int32Array(meshLayer(blend, mesh, "ldata", ".corner_vert"));
    const uvs = new Float32Array(meshLayer(blend, mesh, "ldata", "VitruvianUV.UDIM"));
    const materials = new Int32Array(meshLayer(blend, mesh, "pdata", "material_index"));
    // (Its lips, a colour on each face's corners: red, 0 to 255)
    const lipColours = new Uint8Array(meshLayer(blend, mesh, "ldata", "ColLipMask"));
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

    // How much each vertex is lip, 0 to 1 (the most of its corners')
    const lips = new Float32Array(count);

    corners.forEach((v, l) => {
        lips[v] = Math.max(lips[v], lipColours[l * 4] / 255);
    });

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

    // Its nipples: the vertices its own shape for them moves
    const nipples = new Set(readNpz(path.join(from, "morphs/L2/Chest_Nipple_Potrusion.npz")).idx.data);
    // And its areolae: how far its own shape for their size moves each vertex (most at their rims)
    const areolaShape = readNpz(path.join(from, "morphs/L2/Chest_Areola_Radius.npz"));
    const areolae = new Map(Array.from(areolaShape.idx.data, (v, k) => [v, Math.hypot(...areolaShape.delta.data.slice(k * 3, k * 3 + 3))]));

    return { count, positions, corners, uvs, materials, lips, nipples, areolae, faceCount: mesh.totpoly, weights: byBone, jointEnds };
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

// --- The face ---

/**
 * Where a head's features are in its face frame (face.js faceFrame's: from between the eyes, in
 * MakeHuman's base mesh's metres by the eyes' spacing), from the skin's points there (`points`:
 * [x, y, z] each) and how much each is lip (`lips`): { lips, nose, chin ([y, z] each: the lips'
 * middle, the nose's tip, the chin's most forward point), top (of the head), back (of the
 * skull), ear (how far out the ears reach) }. MakeHuman's head and Vitruvian's are measured
 * alike, so one can be fitted to the other.
 */
export function faceLandmarks(points, lips) {
    const [sum, weight] = points.reduce(([at, total], p, i) => (lips[i] > 0.25 ? [[at[0] + lips[i] * p[1], at[1] + lips[i] * p[2]], total + lips[i]] : [at, total]), [[0, 0], 0]);
    const lipsAt = [sum[0] / weight, sum[1] / weight];
    const middle = points.filter((p) => Math.abs(p[0]) < 0.006);
    const foremost = (list) => list.reduce((best, p) => (p[2] > best[2] ? p : best));
    const nose = foremost(middle.filter((p) => p[1] < 0 && p[1] > lipsAt[0] + 0.012));
    const chin = foremost(middle.filter((p) => p[1] < lipsAt[0] - 0.025 && p[1] > lipsAt[0] - 0.08));
    const crown = points.filter((p) => Math.abs(p[0]) < 0.03 && p[1] > 0);
    const skull = points.filter((p) => Math.abs(p[0]) < 0.03 && p[1] > -0.03);
    const sides = points.filter((p) => Math.abs(p[1]) < 0.03 && p[2] < -0.03 && p[2] > -0.15);

    return {
        lips: lipsAt,
        nose: [nose[1], nose[2]],
        chin: [chin[1], chin[2]],
        top: Math.max(...crown.map((p) => p[1])),
        back: Math.min(...skull.map((p) => p[2])),
        ear: Math.max(...sides.map((p) => Math.abs(p[0]))),
    };
}

/**
 * A body's face's landmarks (faceLandmarks) in a face frame (face.js faceFrame), from the
 * positions of some of its skin's vertices and how much each vertex is lip.
 */
export function faceOn(frame, positions, vertices, lips) {
    const [points, weights] = [[], []];

    for (const v of vertices) {
        const p = frame.toFace(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);

        if (Math.abs(p[0]) < 0.12 && Math.abs(p[1]) < 0.2 && p[2] > -0.25) {
            points.push(p);
            weights.push(lips[v]);
        }
    }

    return faceLandmarks(points, weights);
}

/**
 * How one head's face coordinates are brought onto another's (face.js faceFrame, from a body's
 * landmarks.face), from their faceLandmarks: { size (the head's size over its eyes' spacing, to
 * the other's: the frame's scale is multiplied by it), y and z ([ours, theirs] pairs, rising, for
 * piecewise-straight maps, after the size: chin, lips, nose, eyes, top; and the skull's back, eyes,
 * nose) }.
 */
export function faceMap(ours, theirs) {
    const size = (ours.top / theirs.top + ours.back / theirs.back + ours.ear / theirs.ear) / 3;
    const at = (value) => Math.round((value / size) * 1e5) / 1e5;
    const map = {
        size: Math.round(size * 1e5) / 1e5,
        y: [[at(ours.chin[0]), theirs.chin[0]], [at(ours.lips[0]), theirs.lips[0]], [at(ours.nose[0]), theirs.nose[0]], [0, 0], [at(ours.top), theirs.top]],
        z: [[at(ours.back), theirs.back], [0, 0], [at(ours.nose[1]), theirs.nose[1]]],
    };

    for (const knots of [map.y, map.z]) {
        knots.forEach((knot, k) => {
            knot[1] = Math.round(knot[1] * 1e5) / 1e5;

            if (k > 0 && !(knot[0] > knots[k - 1][0] && knot[1] > knots[k - 1][1])) {
                throw new Error(`The face's map isn't rising: ${JSON.stringify(knots)}`);
            }
        });
    }

    return map;
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


// Each side's nipple (-1 right, 1 left): the middle of the points (`positions` per vertex) as much
// as they are nipple (`amounts`, 0 to 1; those over a half)
function nippleCentres(positions, amounts) {
    return new Map([-1, 1].map((side) => {
        const sum = [0, 0, 0];
        let total = 0;

        amounts.forEach((amount, v) => {
            if (amount > 0.5 && Math.sign(positions[v * 3]) === side) {
                for (let k = 0; k < 3; k++) {
                    sum[k] += amount * positions[v * 3 + k];
                }

                total += amount;
            }
        });

        return [side, sum.map((value) => value / total)];
    }));
}

/**
 * A body's skin (`points` per vertex, `triangles`) fitted onto another's (`onto`, `ontoTriangles`),
 * so the two lie on each other: first moved so each pin's point (`from`) is on the other's (`to`),
 * the skin within about `radius` of it going with it; then, round by round, each point drawn to
 * the nearest of the other skin facing its way, the draws smoothed over the skin less each round
 * (STIFFNESS: how much a point keeps with its neighbours against its draw), so it fits as a whole
 * before point by point. Gives the fitted points (the others' unmoved).
 */
export function fitOnto(points, triangles, onto, ontoTriangles, pins = []) {
    const fitted = Float64Array.from(points);
    const vertices = [...new Set(triangles)];
    const neighbours = new Map(vertices.map((v) => [v, new Set()]));

    for (let t = 0; t < triangles.length; t += 3) {
        for (let k = 0; k < 3; k++) {
            neighbours.get(triangles[t + k]).add(triangles[t + (k + 1) % 3]).add(triangles[t + (k + 2) % 3]);
        }
    }

    for (const { from, to, radius } of pins) {
        const move = sub(to, from);

        for (const v of vertices) {
            const share = Math.exp(-((length(sub([points[v * 3], points[v * 3 + 1], points[v * 3 + 2]], from)) / radius) ** 2));

            for (let k = 0; k < 3; k++) {
                fitted[v * 3 + k] += share * move[k];
            }
        }
    }

    const ontoNormals = triangleNormals(onto, ontoTriangles);
    const draw = new Float64Array(points.length);
    const drawn = new Uint8Array(points.length / 3);
    const moves = new Float64Array(points.length);

    for (const stiffness of STIFFNESS) {
        const normals = vertexNormals(fitted, triangles);
        const near = nearestPoints(onto, ontoTriangles, ontoNormals, Float64Array.from(vertices.flatMap((v) => [...fitted.subarray(v * 3, v * 3 + 3)])), Float64Array.from(vertices.flatMap((v) => [...normals.subarray(v * 3, v * 3 + 3)])), { reach: 0.05 });

        vertices.forEach((v, i) => {
            drawn[v] = near[i] ? 1 : 0;

            for (let k = 0; k < 3; k++) {
                const to = near[i] ? near[i].weights.reduce((sum, w, c) => sum + w * onto[ontoTriangles[near[i].triangle * 3 + c] * 3 + k], 0) : 0;

                draw[v * 3 + k] = near[i] ? to - fitted[v * 3 + k] : 0;
                moves[v * 3 + k] = draw[v * 3 + k];
            }
        });

        // Smoothed (Gauss-Seidel on (drawn + stiffness L) move = drawn draw)
        for (let pass = 0; pass < 200; pass++) {
            for (const v of vertices) {
                const around = neighbours.get(v);
                const weight = drawn[v] + stiffness * around.size;

                for (let k = 0; k < 3; k++) {
                    let sum = drawn[v] * draw[v * 3 + k];

                    for (const u of around) {
                        sum += stiffness * moves[u * 3 + k];
                    }

                    moves[v * 3 + k] = sum / weight;
                }
            }
        }

        for (const v of vertices) {
            for (let k = 0; k < 3; k++) {
                fitted[v * 3 + k] += moves[v * 3 + k];
            }
        }
    }

    return fitted;
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
    // (Its areolae and nipples kept whole: small and round, they'd be left a few flat facets)
    const locked = Uint8Array.from(render, ({ v }) => (vitruvian.areolae.has(v) || vitruvian.nipples.has(v) ? 1 : 0));
    const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(skin, renderPositions, 3, renderUVs, 2, [0.5, 0.5], locked, SKIN_TRIANGLES * 3, 0.05, ["LockBorder"]);

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
    const vitruvianSkin = Uint32Array.from(faceTriangles.body.flatMap(([f, ...ks]) => ks.map((k) => vitruvian.corners[f * 4 + k])));
    const vitruvianNormals = vertexNormals(vitruvian.positions, vitruvianSkin);
    // MakeHuman's skin laid over Vitruvian's is only near it (half within 5 mm, a tenth further
    // than 16 mm), so the nearest point of it to a Vitruvian point jumps about: the shapes' changes
    // carried from it came out creased, a breast's off its nipple, a thumb's off the thumb. So it's
    // first fitted onto Vitruvian's skin (fitOnto), its nipples onto Vitruvian's.
    const humanNipples = nippleCentres(laid, maskOnVertices(human, path.join(root, "client/characters/masks/aureolae.jpg")));
    const vitruvianNipples = nippleCentres(vitruvian.positions, Float32Array.from({ length: vitruvian.count }, (_, v) => (vitruvian.nipples.has(v) ? 1 : 0)));
    console.log(`nipples: MakeHuman's laid ${[-1, 1].map((side) => (length(sub(humanNipples.get(side), vitruvianNipples.get(side))) * 1000).toFixed(1)).join(" and ")} mm from Vitruvian's`);
    const fitted = fitOnto(laid, humanSkin, vitruvian.positions, vitruvianSkin, [-1, 1].map((side) => ({ from: humanNipples.get(side), to: vitruvianNipples.get(side), radius: NIPPLE_REACH })));
    const jointVertices = [...new Set(jointEnds.flatMap((ends) => (ends.parentTail === undefined ? ends.map(([v]) => v) : [])))];

    // Where MakeHuman's shoulder joints are on Vitruvian's body, by what's before them: each moved
    // as MakeHuman's skin there moves from its own default body onto Vitruvian's, fitted (the
    // bodies stand in the same place, as tall): the chest's front, from a hand's width to a
    // forearm's length below the shoulders, and the face. Every hand's place in a pose is given
    // from MakeHuman's shoulders (Actions: arm lengths from them), and mostly before the chest,
    // the belly or the face; Vitruvian's own sit further back and higher (its chest and face 2 cm
    // further forward of them, its head 3 cm lower): from them, a book held before the belly was
    // in it, a tankard to the lips in the face. The game's poses start from these instead (the
    // manifest's landmarks.shoulder: the left's, the right's mirrored, in arm lengths from
    // Vitruvian's own). (Round the shoulder itself, the bodies' skin lies alike about their joints)
    const humanSkinVertices = [...new Set(humanSkin)];
    const heaviestOf = (v) => {
        const weights = humanWeights(v);

        return humanBones(v)[weights.indexOf(Math.max(...weights))];
    };
    const [chestBones, faceBones] = [["Spine1", "Spine2"], ["Neck", "Head"]].map((names) => new Set(names.map((name) => boneIndex.get(name))));
    const shoulders = ["LeftArm", "RightArm"].map((name) => [0, 1, 2].map((k) => humanJoints[boneIndex.get(name) * 6 + k]));
    const between = [0, 1, 2].map((k) => (shoulders[0][k] + shoulders[1][k]) / 2);
    const before = humanSkinVertices.filter((v) => {
        const [x, y, z] = [0, 1, 2].map((k) => humanDefault[v * 3 + k]);
        const bone = heaviestOf(v);
        const chest = chestBones.has(bone) && z > between[2] && Math.abs(x - between[0]) < 0.12 && y < between[1] - 0.05 && y > between[1] - 0.2;

        return chest || (faceBones.has(bone) && z > between[2] + 0.03);
    });
    const moved = [0, 1, 2].map((k) => before.reduce((sum, v) => sum + fitted[v * 3 + k] - humanDefault[v * 3 + k], 0) / before.length);
    const shoulder = ["LeftArm", "RightArm"].map((name, i) => {
        const b = boneIndex.get(name);

        return [0, 1, 2].map((k) => (k === 0 && i === 1 ? -1 : 1) * (shoulders[i][k] + moved[k] - vitruvianJoints[b * 6 + k]));
    });
    const armLength = (joints) => {
        const at = (name) => [0, 1, 2].map((k) => joints[boneIndex.get(name) * 6 + k]);

        return length(sub(at("LeftForeArm"), at("LeftArm"))) + length(sub(at("LeftHand"), at("LeftForeArm")));
    };
    const shoulderOffset = [0, 1, 2].map((k) => Math.round(((shoulder[0][k] + shoulder[1][k]) / 2 / armLength(vitruvianJoints)) * 1e4) / 1e4);

    console.log(`MakeHuman's shoulders on Vitruvian's body: ${shoulder.map((each) => each.map((value) => (value * 100).toFixed(1)).join(", ")).join(" and ")} cm from its own (${shoulderOffset.join(", ")} arm lengths)`);

    // The face: where Vitruvian's head is on MakeHuman's in face coordinates (face.js), from the
    // same features measured on each (faceLandmarks), so its face takes MakeHuman's face's changes
    // where they fall on it (the lips' on its lips, the chin's on its chin), rather than from a
    // head laid over it by its bones. The more a vertex is the Head bone's, the more it takes them
    // so; the rest, and the masks below the head, from the body laid over it.
    const humanLips = maskOnVertices(human, path.join(root, "client/characters/masks/lips.jpg"));
    const eyeCorners = faceTriangles.eyes.flatMap(([f, ...ks]) => ks.map((k) => vitruvian.corners[f * 4 + k]));
    const asBody = (face) => ({ renderIndices: () => eyeCorners.keys(), renderSource: eyeCorners, landmarks: { face } });
    const skinVertices = [...new Set(faceTriangles.body.flatMap(([f, ...ks]) => ks.map((k) => vitruvian.corners[f * 4 + k])))];
    const humanFrame = faceFrame(human, humanDefault);
    const humanFace = faceOn(humanFrame, humanDefault, [...new Set(humanSkin)], humanLips);
    const earlyFace = faceOn(faceFrame(asBody(undefined), vitruvian.positions), vitruvian.positions, skinVertices, vitruvian.lips);
    const vitruvianFrame = faceFrame(asBody(faceMap(earlyFace, humanFace)), vitruvian.positions);
    // (Turned as the head is, not scaled: a change there is the head's moving with the body, as
    // much as its shape)
    const faceTurn = maps[boneIndex.get("Head")].turn;
    const headShare = new Float64Array(vitruvian.count);
    const totalWeight = new Float64Array(vitruvian.count);

    for (const [name, list] of vitruvian.weights) {
        for (const [v, weight] of list) {
            totalWeight[v] += weight;
            headShare[v] += name === "Head" ? weight : 0;
        }
    }

    headShare.forEach((share, v) => {
        headShare[v] = totalWeight[v] > 0 ? share / totalWeight[v] : 0;
    });

    const toHumanFace = (p) => humanFrame.fromFace(...vitruvianFrame.toFace(...p));
    const onHumanFace = (v) => toHumanFace(vitruvian.positions.subarray(v * 3, v * 3 + 3));
    const placeOnFace = (vertices) => {
        const points = Float64Array.from(vertices.flatMap(onHumanFace));
        const near = nearestPoints(humanDefault, humanSkin, triangleNormals(humanDefault, humanSkin), points, Float64Array.from(vertices.flatMap((v) => [...vitruvianNormals.subarray(v * 3, v * 3 + 3)])));
        const missed = vertices.map((v, i) => (near[i] ? -1 : i)).filter((i) => i >= 0);
        const anyWay = missed.length ? nearestPoints(humanDefault, humanSkin, null, Float64Array.from(missed.flatMap((i) => [...points.subarray(i * 3, i * 3 + 3)])), null, { reach: 0.3 }) : [];

        return new Map(vertices.map((v, i) => [v, near[i] ?? anyWay[missed.indexOf(i)]]));
    };
    const placeOn = (vertices, over, triangles, normals) => {
        const points = Float64Array.from(vertices.flatMap((v) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)]));
        const facings = normals ? Float64Array.from(vertices.flatMap((v) => [...normals.subarray(v * 3, v * 3 + 3)])) : null;
        const near = nearestPoints(over, triangles, normals ? triangleNormals(over, triangles) : null, points, facings);
        const missed = vertices.filter((_, i) => !near[i]);
        const anyWay = missed.length ? nearestPoints(over, triangles, null, Float64Array.from(missed.flatMap((v) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)])), null, { reach: 0.3 }) : [];

        return new Map(vertices.map((v, i) => [v, near[i] ?? anyWay[missed.indexOf(v)]]));
    };
    const onSkin = placeOn([...new Set([...sources.filter(({ kind }) => kind === "vitruvian").map(({ v }) => v).filter((v) => !eyeVertices.includes(v)), ...jointVertices])], fitted, humanSkin, vitruvianNormals);
    const onEyes = placeOn(eyeVertices, laid, humanEyes, null);
    const distances = [...onSkin.values()].map(({ distance }) => distance).sort((x, y) => x - y);
    const within = (share) => (distances[Math.floor(share * (distances.length - 1))] * 1000).toFixed(1);

    console.log(`fitted over each other: half the skin within ${within(0.5)} mm of MakeHuman's, 90% within ${within(0.9)} mm, 99% within ${within(0.99)} mm`);
    const onFace = placeOnFace([...onSkin.keys()].filter((v) => headShare[v] > 0));
    const placement = (triangles, { triangle, weights }) => {
        const corners = [0, 1, 2].map((k) => triangles[triangle * 3 + k]);
        const bonesThere = new Map();

        corners.forEach((h, k) => humanBones(h).forEach((b, i) => bonesThere.set(b, (bonesThere.get(b) ?? 0) + weights[k] * humanWeights(h)[i])));

        return { corners, weights, matrix: blendedTurn(maps, [...bonesThere.keys()], [...bonesThere.values()]) };
    };
    const placed = new Map([
        ...[...onEyes].map(([v, near]) => [v, [{ share: 1, ...placement(humanEyes, near) }]]),
        ...[...onSkin].map(([v, near]) => [v, [
            { share: 1 - headShare[v], ...placement(humanSkin, near) },
            ...(onFace.has(v) ? [{ share: headShare[v], corners: [0, 1, 2].map((k) => humanSkin[onFace.get(v).triangle * 3 + k]), weights: onFace.get(v).weights, matrix: faceTurn }] : []),
        ].filter(({ share }) => share > 0)]),
    ]);

    // A shape's change at a kept vertex, or a Vitruvian vertex
    const changeAt = (deltas, entry) => {
        if (entry.kind === "human") {
            const weights = humanWeights(entry.v);

            return apply(blendedTurn(maps, humanBones(entry.v), weights), [deltas[entry.v * 3], deltas[entry.v * 3 + 1], deltas[entry.v * 3 + 2]]);
        }

        const change = [0, 0, 0];

        for (const { share, corners, weights, matrix } of placed.get(entry.v)) {
            const d = [0, 0, 0];

            corners.forEach((h, k) => {
                d[0] += weights[k] * deltas[h * 3];
                d[1] += weights[k] * deltas[h * 3 + 1];
                d[2] += weights[k] * deltas[h * 3 + 2];
            });

            apply(matrix, d).forEach((value, axis) => {
                change[axis] += share * value;
            });
        }

        return change;
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
    // The eyelashes are set on Vitruvian's eyes: moved from MakeHuman's laid over it by how far its
    // eyes' middles are from MakeHuman's
    const eyeCentre = (list, side) => {
        const on = list.filter((p) => Math.sign(p[0]) === side);

        return [0, 1, 2].map((k) => on.reduce((sum, p) => sum + p[k], 0) / on.length);
    };
    const humanEyeVertices = [...new Set(humanEyes)];
    const eyeOffsets = new Map([-1, 1].map((side) => [side, sub(
        eyeCentre(eyeVertices.map((v) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)]), side),
        eyeCentre(humanEyeVertices.map((h) => [...laid.subarray(h * 3, h * 3 + 3)]), side),
    )]));
    const carried = new Map(shapeNames.map((name) => {
        const { deltas } = shapes.get(name);

        return [name, { deltas: Float64Array.from(sources.flatMap((entry) => changeAt(deltas, entry))), joints: jointChanges(deltas) }];
    }));

    // The hands' joints: where the wrist goes (from the skin, as every joint), and from there as
    // MakeHuman's hand's go, turned as its hand is laid onto Vitruvian's and sized to it. Taken
    // from the skin, the fingers' came out wrong where MakeHuman's hand laid over Vitruvian's
    // isn't its fingers over Vitruvian's: a bigger body's fingers shrank (the tallest man's
    // index finger's middle bone 2.6 to 1.7 cm, as MakeHuman's grows 2.3 to 2.5), its palm
    // didn't grow, and so its grips were wrong.
    for (const side of ["Left", "Right"]) {
        const hand = boneIndex.get(`${side}Hand`);
        const { turn } = maps[hand];
        const size = length(sub(Array.from(vitruvianJoints.subarray(hand * 6 + 3, hand * 6 + 6)), Array.from(vitruvianJoints.subarray(hand * 6, hand * 6 + 3))))
            / length(sub(Array.from(humanJoints.subarray(hand * 6 + 3, hand * 6 + 6)), Array.from(humanJoints.subarray(hand * 6, hand * 6 + 3))));
        const ends = bones.flatMap(({ name }, b) => (name.startsWith(`${side}Hand`) ? [b * 2 + 1, ...(name === `${side}Hand` ? [] : [b * 2])] : []));

        for (const name of shapeNames) {
            const theirs = shapes.get(name).joints;
            const ours = carried.get(name).joints;
            const wrist = [0, 1, 2].map((k) => theirs[hand * 6 + k]);

            for (const end of ends) {
                const within = apply(turn, sub([0, 1, 2].map((k) => theirs[end * 3 + k]), wrist));

                for (let k = 0; k < 3; k++) {
                    ours[end * 3 + k] = ours[hand * 6 + k] + size * within[k];
                }
            }
        }
    }

    // The sliders' own shapes (OWN_SHAPES: sex, muscle, weight, bust, heritage): their flesh is
    // Vitruvian's own shapes', their bones MakeHuman's (each moves the joints as MakeHuman's shape
    // carried over does, and Vitruvian's skin goes with its bones). MakeHuman's carried over,
    // however well fitted, came out creased and lumpy where its flesh isn't laid out as
    // Vitruvian's (a breast, a muscle); Vitruvian's own shapes were made for its mesh. The bones
    // stay MakeHuman's so that heights, limbs' lengths and so every motion are as they were.
    const ownWeights = new Map();

    for (const [name, list] of vitruvian.weights) {
        for (const [v, weight] of list) {
            if (!ownWeights.has(v)) {
                ownWeights.set(v, []);
            }

            ownWeights.get(v).push([boneIndex.get(name), weight]);
        }
    }

    // Each kept Vitruvian vertex's move as the joints move by `joints` (its skin with its bones)
    const skeletal = (joints) => {
        const maps = boneMaps(vitruvianJoints, Float64Array.from(vitruvianJoints, (value, k) => value + joints[k]), bones.length);
        const moves = new Float64Array(count * 3);

        sources.forEach((entry, i) => {
            if (entry.kind !== "vitruvian") {
                return;
            }

            const p = [...vitruvian.positions.subarray(entry.v * 3, entry.v * 3 + 3)];
            const list = ownWeights.get(entry.v) ?? [];
            const total = list.reduce((sum, [, weight]) => sum + weight, 0) || 1;

            for (const [b, weight] of list) {
                const { matrix, from: head, to } = maps[b];
                const local = apply(matrix, sub(p, head));

                for (let k = 0; k < 3; k++) {
                    moves[i * 3 + k] += (weight / total) * (to[k] + local[k] - p[k]);
                }
            }
        });

        return moves;
    };
    // A shape of Vitruvian's own: its flesh at the kept vertices (its move less its bones' part)
    const flesh = new Map();
    const ownFlesh = (name) => {
        if (!flesh.has(name)) {
            const { idx, delta } = readNpz(path.join(from, `morphs/L2/${name}.npz`));
            const moves = new Map();

            idx.data.forEach((v, k) => {
                moves.set(v, toOurs(delta.data[k * 3], delta.data[k * 3 + 1], delta.data[k * 3 + 2]).map((value) => value * scale));
            });

            const joints = new Float64Array(jointEnds.length * 3);

            jointEnds.forEach((ends, k) => {
                if (ends.parentTail === undefined) {
                    for (const [v, w] of ends) {
                        const move = moves.get(v) ?? [0, 0, 0];

                        for (let a = 0; a < 3; a++) {
                            joints[k * 3 + a] += w * move[a];
                        }
                    }
                } else {
                    joints.set(joints.subarray((ends.parentTail * 2 + 1) * 3, (ends.parentTail * 2 + 2) * 3), k * 3);
                }
            });

            const bonesPart = skeletal(joints);

            flesh.set(name, Float64Array.from(sources.flatMap((entry, i) => [0, 1, 2].map((k) => (entry.kind === "vitruvian" ? (moves.get(entry.v)?.[k] ?? 0) - bonesPart[i * 3 + k] : 0)))));
        }

        return flesh.get(name);
    };

    // The hands' skin in MakeHuman's shapes carried over: moved with its bones (as the hands'
    // joints move, above), and only the flesh's own change carried over (MakeHuman's, less what
    // its bones' moves make of it), as Vitruvian's own shapes are. Carried whole, MakeHuman's
    // change was turned as each of its fingers lies on Vitruvian's, so a longer arm, moving the
    // whole hand as one, sent each finger's skin its own way, up to 6 cm off its bones: the
    // bulkiest orcs' fingers bent thin and twisted.
    const handBones = new Set(bones.flatMap(({ name }, b) => (/^(Left|Right)Hand/.test(name) ? [b] : [])));
    const handShare = sources.map((entry) => {
        const list = entry.kind === "vitruvian" ? (ownWeights.get(entry.v) ?? []) : [];
        const total = list.reduce((sum, [, weight]) => sum + weight, 0) || 1;

        return list.reduce((sum, [b, weight]) => sum + (handBones.has(b) ? weight : 0), 0) / total;
    });
    const inHands = sources.flatMap((entry, i) => (handShare[i] > 0 ? [i] : []));

    for (const name of shapeNames.filter((each) => !ownShape(each))) {
        const { deltas: theirs, joints: theirJoints } = shapes.get(name);
        const { deltas, joints } = carried.get(name);
        const theirMaps = boneMaps(humanJoints, Float64Array.from(humanJoints, (value, k) => value + theirJoints[k]), bones.length);
        const theirFlesh = new Float64Array(theirs.length);

        for (let h = 0; h < humanCount; h++) {
            const p = [human.basePositions[h * 3], human.basePositions[h * 3 + 1], human.basePositions[h * 3 + 2]];
            const weights = humanWeights(h);

            theirFlesh.set([0, 1, 2].map((k) => theirs[h * 3 + k]), h * 3);
            humanBones(h).forEach((b, i) => {
                const { matrix, from: head, to } = theirMaps[b];
                const local = apply(matrix, sub(p, head));

                for (let k = 0; k < 3; k++) {
                    theirFlesh[h * 3 + k] -= weights[i] * (to[k] + local[k] - p[k]);
                }
            });
        }

        const body = skeletal(joints);

        for (const i of inHands) {
            const flesh = changeAt(theirFlesh, sources[i]);

            for (let k = 0; k < 3; k++) {
                deltas[i * 3 + k] = handShare[i] * (body[i * 3 + k] + flesh[k]) + (1 - handShare[i]) * deltas[i * 3 + k];
            }
        }
    }

    // (The head keeps MakeHuman's shapes carried over, as its face's are: what's worn on it, hair,
    // helmets, beards, tusks, is fitted to those; the neck goes from one to the other as it's the
    // head's)
    const bodyShare = sources.map((entry) => (entry.kind === "vitruvian" && !eyeVertices.includes(entry.v) ? 1 - headShare[entry.v] : 0));

    for (const name of shapeNames) {
        const own = ownShape(name);

        if (own) {
            const { deltas, joints } = carried.get(name);
            const body = skeletal(joints);

            for (const [morph, amount] of Object.entries(own)) {
                ownFlesh(morph).forEach((value, j) => {
                    body[j] += amount * value;
                });
            }

            deltas.forEach((value, j) => {
                const share = bodyShare[Math.floor(j / 3)];

                deltas[j] = share * body[j] + (1 - share) * value;
            });
        }
    }

    console.log(`own shapes: ${shapeNames.filter(ownShape).length} of the sliders' shapes from ${flesh.size} of Vitruvian's`);

    // The eyelashes (MakeHuman's) move as the eyelids under them do, whatever the shape
    const lashes = sources.map((entry, i) => [entry, i]).filter(([entry]) => entry.kind === "human");
    const lidSources = sources.map((entry, i) => [entry, i]).filter(([entry]) => entry.kind === "vitruvian" && headShare[entry.v] > 0.5 && !eyeVertices.includes(entry.v));

    const lashLids = lashes.map(([entry, i]) => {
        const p = [...laid.subarray(entry.v * 3, entry.v * 3 + 3)];
        const offset = eyeOffsets.get(Math.sign(p[0]) || 1);
        const at = [0, 1, 2].map((k) => p[k] + offset[k]);
        const nearest = lidSources.map(([lid, j]) => [j, length(sub(at, [...vitruvian.positions.subarray(lid.v * 3, lid.v * 3 + 3)]))]).sort((a, b) => a[1] - b[1]).slice(0, 4);
        const total = nearest.reduce((sum, [, d]) => sum + 1 / (d + 1e-4), 0);

        return [i, nearest.map(([j, d]) => [j, 1 / (d + 1e-4) / total])];
    });

    for (const { deltas } of carried.values()) {
        for (const [i, lids] of lashLids) {
            for (let k = 0; k < 3; k++) {
                deltas[i * 3 + k] = lids.reduce((sum, [j, w]) => sum + w * deltas[j * 3 + k], 0);
            }
        }
    }

    // The base: Vitruvian's own body (and the eyelashes set on its eyes), less the default shapes,
    // so the sliders as they start give Vitruvian's body
    const base = new Float64Array(count * 3);

    sources.forEach((entry, i) => {
        const p = entry.kind === "human" ? [...laid.subarray(entry.v * 3, entry.v * 3 + 3)] : [...vitruvian.positions.subarray(entry.v * 3, entry.v * 3 + 3)];

        if (entry.kind === "human") {
            const offset = eyeOffsets.get(Math.sign(p[0]) || 1);

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

    // Where each vertex is on MakeHuman's base body, which garments' designs are drawn on
    // (HumanData's designPositions): at the point of MakeHuman's skin it's placed on, fitted (on
    // the head, where it is on MakeHuman's face, as much as it's the head's); an eye's on its
    // eye; an eyelash's, its own (they're MakeHuman's). Its own base is laid out otherwise
    // (Vitruvian's chest 12 cm lower in it, its crotch 4 cm): a bra drawn there lay on the
    // collarbones
    const onBase = (triangles, { triangle, weights }) => [0, 1, 2].map((k) => weights.reduce((sum, w, c) => sum + w * human.basePositions[triangles[triangle * 3 + c] * 3 + k], 0));
    const designs = new Float64Array(count * 3);

    sources.forEach((entry, i) => {
        let p;

        if (entry.kind === "human") {
            p = [...human.basePositions.subarray(entry.v * 3, entry.v * 3 + 3)];
        } else if (onEyes.has(entry.v)) {
            p = onBase(humanEyes, onEyes.get(entry.v));
        } else if (onSkin.has(entry.v)) {
            const body = onBase(humanSkin, onSkin.get(entry.v));
            const face = onFace.has(entry.v) ? onBase(humanSkin, onFace.get(entry.v)) : body;

            p = body.map((value, k) => value + (face[k] - value) * headShare[entry.v]);
        } else {
            p = [...base.subarray(i * 3, i * 3 + 3)];
        }

        designs.set(p, i * 3);
    });

    const layout = {
        basePositions: packer.add(Float32Array.from(base)),
        designPositions: packer.add(Float32Array.from(designs)),
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
        landmarks: { neck: Math.round(neckFraction * 1e4) / 1e4, shoulder: shoulderOffset },
        masks: MASKS.map((name) => `vitruvian/masks/${name}.png`),
    };
    const bytes = packer.toBytes();

    // The face: Vitruvian's head brought onto MakeHuman's face coordinates, where the skin's
    // features, hair, helmets and tusks are placed (face.js), by the same features measured on
    // each (their lips by each one's own lip mask: MakeHuman's masks/lips.jpg, Vitruvian's
    // ColLipMask)
    const made = new HumanData(manifest, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const measureFace = (data, lips) => {
        const { positions } = data.shape({});

        return faceOn(faceFrame(data, positions), positions, [...Array(data.vertexCount).keys()].filter((v) => data.partOf[v] === 0), lips);
    };
    const ours = measureFace(made, Float32Array.from(sources, ({ kind, v }) => (kind === "vitruvian" ? vitruvian.lips[v] : 0)));
    const theirs = measureFace(human, humanLips);

    manifest.landmarks.face = faceMap(ours, theirs);

    // How its default body rests its thighs, shins and fingers (rig.js REST: its knees rest
    // straighter than MakeHuman's, its fingers and thumbs otherwise), so the rig measures its
    // limbs as MakeHuman's rest (Rig's `rest`)
    const restRig = new Rig(made.bones);

    restRig.fit(made.shape({}).joints);
    manifest.landmarks.rest = restOf(restRig);

    const packed = gzipSync(bytes, { level: 9 });

    writeFileSync(path.join(target, "vitruvian.bin"), packed);
    writeFileSync(path.join(target, "vitruvian.json"), `${JSON.stringify(manifest)}\n`);

    console.log(`${count} vertices (${renderSource.length} to draw), ${indices.length / 3} triangles, ${bones.length} bones`);
    console.log(`${n} macro shapes in ${components.length} components (worst error ${(worst * 1000).toFixed(2)} mm); ${details.length} detail and bust shapes`);
    console.log(`scaled by ${scale.toFixed(4)} to ${heightOf(vitruvian.positions, vitruvian.count).toFixed(3)} m; neck landmark ${neckFraction.toFixed(3)} of the way up the neck bone`);
    console.log(`face: ${JSON.stringify(manifest.landmarks.face)} (MakeHuman's: ${JSON.stringify(theirs)}; Vitruvian's: ${JSON.stringify(ours)})`);
    console.log(`vitruvian.bin: ${(packed.length / 1024).toFixed(0)} KB (${(packer.length / 1024).toFixed(0)} KB unpacked)`);

    // Vitruvian's areolae, for their mask: round its nipples, as far out as its own shape for
    // their size moves them most
    const areolae = [-1, 1].map((side) => {
        const centre = vitruvianNipples.get(side);
        let [sum, total] = [0, 0];

        for (const [v, amount] of vitruvian.areolae) {
            if (Math.sign(vitruvian.positions[v * 3]) === side) {
                sum += amount ** 2 * length(sub([...vitruvian.positions.subarray(v * 3, v * 3 + 3)], centre));
                total += amount ** 2;
            }
        }

        return { centre, radius: sum / total };
    });

    console.log(`areolae: ${areolae.map(({ radius }) => (radius * 1000).toFixed(1)).join(" and ")} mm across from their nipples`);
    writeMasks({ target, human, laid: fitted, areolae, humanDefault, humanSkin, vitruvian, simplified, skin, render, headShare, toHumanFace });
}

// How much each of the MakeHuman body's vertices is in one of its masks (a JPEG in its texture
// layout), 0 to 1: the most of its texture coordinates'
function maskOnVertices(human, file) {
    const { width, height, data } = jpeg.decode(readFileSync(file), { useTArray: true });
    const values = new Float32Array(human.vertexCount);

    for (const r of human.renderIndices("body")) {
        const x = Math.min(width - 1, Math.max(0, Math.round(human.uvs[r * 2] * width - 0.5)));
        const y = Math.min(height - 1, Math.max(0, Math.round((1 - human.uvs[r * 2 + 1]) * height - 0.5)));
        const v = human.renderSource[r];

        values[v] = Math.max(values[v], data[(y * width + x) * 4] / 255);
    }

    return values;
}

// The masks in Vitruvian's texture layout: its lips from its own (ColLipMask), and the rest
// MakeHuman's (client/characters/masks) carried over, each texel of the skin's taking the mask at
// the nearest point of MakeHuman's body: on the head, where it is on MakeHuman's face (by the face
// map: toHumanFace), and elsewhere on MakeHuman's body laid over it
function writeMasks({ target, human, laid, areolae, humanDefault, humanSkin, vitruvian, simplified, skin, render, headShare, toHumanFace }) {
    const size = MASK_SIZE;
    const texels = [];
    const onHead = [];
    const at = new Int32Array(size * size).fill(-1);

    // Rasterise the skin's triangles in texture space: each covered texel's point on the body
    rasterise(simplified, render, size, (i, corners, weights) => {
        if (at[i] < 0) {
            at[i] = texels.length;
            texels.push(corners.reduce((p, { v }, k) => [0, 1, 2].map((axis) => p[axis] + weights[k] * vitruvian.positions[v * 3 + axis]), [0, 0, 0]));
            onHead.push(corners.reduce((sum, { v }, k) => sum + weights[k] * headShare[v], 0) >= 0.5);
        }
    });

    // Its lips: its own mask over all its triangles (not only those kept), so their edge is as
    // fine as it's drawn
    const lips = new Uint8Array(size * size);

    rasterise(skin, render, size, (i, corners, weights) => {
        const lip = corners.reduce((sum, { v }, k) => sum + weights[k] * vitruvian.lips[v], 0);

        lips[i] = Math.max(lips[i], Math.round(255 * Math.min(1, Math.max(0, lip))));
    });

    const headTexels = texels.map((_, t) => t).filter((t) => onHead[t]);
    const bodyTexels = texels.map((_, t) => t).filter((t) => !onHead[t]);
    const near = new Array(texels.length);
    const nearHead = nearestPoints(humanDefault, humanSkin, null, Float64Array.from(headTexels.flatMap((t) => toHumanFace(texels[t]))), null, { reach: 0.3 });
    const nearBody = nearestPoints(laid, humanSkin, null, Float64Array.from(bodyTexels.flatMap((t) => texels[t])), null, { reach: 0.3 });

    headTexels.forEach((t, k) => {
        near[t] = nearHead[k];
    });
    bodyTexels.forEach((t, k) => {
        near[t] = nearBody[k];
    });

    // MakeHuman's texture coordinates at each of its triangles' corners
    const skinRender = human.renderIndices("body");
    const uvAt = (triangle, weights) => [0, 1].map((axis) => weights.reduce((sum, w, k) => sum + w * human.uvs[skinRender[triangle * 3 + k] * 2 + axis], 0));

    mkdirSync(path.join(target, "vitruvian/masks"), { recursive: true });

    for (const name of MASKS) {
        if (name === "lips") {
            writeFileSync(path.join(target, "vitruvian/masks/lips.png"), grayPng(lips, size));
            continue;
        }

        // Its areolae: its own, round its nipples (MakeHuman's would be where its are)
        if (name === "aureolae") {
            const pixels = new Uint8Array(size * size);

            at.forEach((texel, i) => {
                if (texel >= 0) {
                    const inside = Math.max(...areolae.map(({ centre, radius }) => (radius + AREOLA_EDGE - length(sub(texels[texel], centre))) / (2 * AREOLA_EDGE)));
                    const t = Math.min(1, Math.max(0, inside));

                    pixels[i] = Math.round(255 * t * t * (3 - 2 * t));
                }
            });

            writeFileSync(path.join(target, "vitruvian/masks/aureolae.png"), grayPng(pixels, size));
            continue;
        }

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

// Each texel `size` by `size` of texture space that triangles (`triangles`: indices into `render`,
// whose corners have texture coordinates `uv`) cover: `each(texel's index, the triangle's three
// corners, the texel's barycentric weights)`
function rasterise(triangles, render, size, each) {
    for (let t = 0; t < triangles.length / 3; t++) {
        const corners = [0, 1, 2].map((k) => render[triangles[t * 3 + k]]);
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

                if (w1 >= -0.01 && w2 >= -0.01 && w3 >= -0.01) {
                    each(y * size + x, corners, [w1, w2, w3]);
                }
            }
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
