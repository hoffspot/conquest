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
//     eyelids...) carried over the same way into this body's texture layout; and its own skin's
//     pictures (light and dark skin's colours, its fine relief, its roughness: skinPictures),
//     from its 4K EXRs, in that layout.
//   - where garments measure the neck from, as MakeHuman's joints are in different places
//     (landmarks: garments.js measureBody).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, gunzipSync, gzipSync } from "node:zlib";
import jpeg from "jpeg-js";
import { MeshoptSimplifier } from "meshoptimizer";
import { FloatType } from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
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
// (the irises and pupils behind the cornea, the tear line)
const MATERIALS = ["Iris", "Mouth", "Pupil", "Sclera_Cornea", "UDIM.Skin", "charmorph_censor", "EyeHair", "Tearline"];
const PART_OF = { "UDIM.Skin": "body", "charmorph_censor": "body", "Sclera_Cornea": "eyes", "Mouth": "mouth" };

// How many triangles the skin is brought down to, and the mouth's inside (its teeth, gums and
// tongue: 17,548 of them; at 2,500 they're within about a third of a millimetre of it)
const SKIN_TRIANGLES = 28000;
const MOUTH_TRIANGLES = 2500;

// The mouth's inside's texture: its tile (UDIM 1008: u 7 to 8), and how big its picture is
const MOUTH_TILE = 7;
const MOUTH_PICTURE = 512;

// Its own skin pictures (skinPictures): which of its EXRs, how big, how well kept; the range of
// heights the height picture's bytes span
const SKIN_PICTURES = {
    light: { name: "Light_Skin_Color", channels: 3 },
    dark: { name: "Dark_Skin_Color", channels: 3 },
    height: { name: "Skin_Height", channels: 1 },
    roughness: { name: "Skin_Roughness", channels: 1 },
};
const SKIN_PICTURE = 1024;
const SKIN_QUALITY = 85;
// (Its height picture only its fine relief: the height less its average within SKIN_RELIEF
// texels, which takes out the broad rises a bump map would only shade as a smudge; those
// heights' range over the bytes, 128 none)
const SKIN_RELIEF = 4;
const SKIN_HEIGHT = 0.03;

// The same tolerance, steps and units as the MakeHuman body's (build-characters.js)
const PCA_TOLERANCE = 0.0015;
const PCA_STEPS = 2047;
const DELTA_UNIT = 0.0001;

// Detail shapes' moves smaller than this (metres) are left out
const DETAIL_CUTOFF = 0.00005;

// The face's expressions (Vitruvian's own, its morphs/L3: FACS shapes), each the sum of these,
// a left and a right half as one (expressions.js plays them): the face's; the mouth opened wide,
// and its lips drawn back from the teeth (with it, a shout); and five of its visemes (the mouth's
// shapes as a sound's made, by Microsoft's numbering), enough for talking: "ah", "eh", "ee",
// "oo", and "f" (the lower lip under the upper teeth)
const EXPRESSIONS = {
    blink: ["Eyes_Closed_Left", "Eyes_Closed_Right"],
    squint: ["Eyes_Squint"],
    smile: ["Smile_Lips_Closed"],
    angry: ["Angry"],
    sad: ["Sad"],
    frown: ["Frown_Left", "Frown_Right"],
    browsUp: ["Eyebrows_InnerBrow_Raised_Left", "Eyebrows_InnerBrow_Raised_Right"],
    browsKnit: ["Eyebrows_Frown_Left", "Eyebrows_Frown_Right"],
    open: ["Mouth_Large_Opened"],
    snarl: ["Lips_Up_Raised_Left", "Lips_Up_Raised_Right", "Lips_Dn_Lower_Left", "Lips_Dn_Lower_Right"],
    ah: ["ae_ax_ah_01"],
    eh: ["ey_eh_uh_04"],
    ee: ["y_iy_ih_ix_06"],
    oo: ["w_uw_07"],
    f: ["f_v_18"],
};

// How near the middle of the face (CharMorph's metres) a vertex is on it, where a shape's left and right halves
// meet; and how little (of its move there) a half moves the far side of it, split hard there
// (Vitruvian's frown, brows and lower lip: a seventh at most; its upper lip's halves fade across
// it, three quarters and more)
const SEAM = 0.0002;
const HARD_SPLIT = 0.5;

// How far round the eye (radians) a lash's vertices are from those of its column, which is
// seated on its lid and swings with it in one piece (about its root, the column's nearest the
// eye); and how far out from the lid's edge (metres) its root's set
const LASH_COLUMN = 0.1;
const LASH_SEAT = 0.0004;

// Where the edges of an eye's lids are looked for: between these distances (metres) from its
// middle, and a step at a time round it (radians), the nearest the eye's opening within so far
// round of each step (the skin's simplified: wider than between its vertices along a lid's edge)
const LID_SHELL = [0.009, 0.016];
const LID_STEP = 0.05;
const LID_WINDOW = 0.2;

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

/**
 * Vitruvian's own skin pictures (SKIN_PICTURES: its linear 4096-texel EXRs, four tiles each), as
 * JPEGs in the game's texture layout: SKIN_PICTURE texels a side, each tile a quarter of it
 * (brought down by averaging) where the skin's texture coordinates put it, the first row the
 * top. Colours in sRGB; height and roughness one channel (as grey): roughness as it is, 0 to 1;
 * height its fine relief (`relief`), 128 none and SKIN_HEIGHT either way to 1 or 255. Outside the
 * skin (`covered`: rasterised at SKIN_PICTURE), each picture's own edge carried a few texels out
 * and then its average, so a JPEG's blocks spend nothing on the tiles' streaked borders.
 */
export function skinPictures(from, covered) {
    const size = SKIN_PICTURE;
    const half = size / 2;
    const read = (name, tile) => {
        const file = readFileSync(path.join(from, `textures/4K/${name}.${1001 + tile}.exr`));

        return new EXRLoader().setDataType(FloatType).parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    };
    const pictures = {};

    for (const [key, { name, channels }] of Object.entries(SKIN_PICTURES)) {
        const linear = new Float32Array(size * size * channels);

        for (let tile = 0; tile < 4; tile++) {
            const { width, data } = read(name, tile);
            const step = width / half;
            const stride = data.length / (width * width);

            for (let y = 0; y < half; y++) {
                for (let x = 0; x < half; x++) {
                    // (The loader's first row is the bottom's, the tile's v of 0; the tile's
                    // place in the square, (tile % 2, tile / 2) quarters across and up)
                    const to = ((size - 1 - (Math.floor(tile / 2) * half + y)) * size + (tile % 2) * half + x) * channels;

                    for (let j = 0; j < step; j++) {
                        for (let i = 0; i < step; i++) {
                            const at = ((y * step + j) * width + x * step + i) * stride;

                            for (let k = 0; k < channels; k++) {
                                linear[to + k] += data[at + k] / (step * step);
                            }
                        }
                    }
                }
            }
        }

        pictures[key] = carriedOut(key === "height" ? relief(linear, covered, size) : linear, channels, covered, size);
    }

    const encode = (linear) => Math.round(255 * Math.min(1, Math.max(0, linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055)));
    const byte = { light: encode, dark: encode, roughness: (value) => Math.round(255 * Math.min(1, Math.max(0, value))), height: (value) => Math.round(Math.min(255, Math.max(0, 128 + (127 * value) / SKIN_HEIGHT))) };

    return Object.fromEntries(Object.entries(pictures).map(([key, linear]) => {
        const channels = SKIN_PICTURES[key].channels;
        const pixels = new Uint8Array(size * size * 4);

        for (let i = 0; i < size * size; i++) {
            for (let k = 0; k < 3; k++) {
                pixels[i * 4 + k] = byte[key](linear[i * channels + Math.min(k, channels - 1)]);
            }

            pixels[i * 4 + 3] = 255;
        }

        return [key, jpeg.encode({ data: pixels, width: size, height: size }, SKIN_QUALITY).data];
    }));
}

// A height picture's fine relief: each texel of the skin's less the skin's average round it
// (three box blurs, as good as a Gaussian, of the heights and of the skin's coverage, so texels
// outside it count for nothing)
function relief(heights, covered, size) {
    const blur = (values) => {
        let out = values;

        for (let pass = 0; pass < 3; pass++) {
            for (const [step, across] of [[1, size], [size, 1]]) {
                const next = new Float32Array(size * size);

                for (let line = 0; line < size; line++) {
                    let sum = 0;
                    const at = (k) => out[line * across + Math.min(size - 1, Math.max(0, k)) * step];

                    for (let k = -SKIN_RELIEF; k <= SKIN_RELIEF; k++) {
                        sum += at(k);
                    }

                    for (let k = 0; k < size; k++) {
                        next[line * across + k * step] = sum / (2 * SKIN_RELIEF + 1);
                        sum += at(k + SKIN_RELIEF + 1) - at(k - SKIN_RELIEF);
                    }
                }

                out = next;
            }
        }

        return out;
    };
    const weight = blur(Float32Array.from(covered));
    const average = blur(heights.map((h, i) => h * covered[i]));

    return heights.map((h, i) => (covered[i] ? h - average[i] / weight[i] : 0));
}

// A picture's texels outside the skin (`covered`): those next to it, from it, a few times over
// (each pass reaching a texel further out), and the rest its average over the skin
function carriedOut(values, channels, covered, size) {
    const out = values.slice();
    let done = Uint8Array.from(covered);
    const mean = new Array(channels).fill(0);
    let count = 0;

    for (let i = 0; i < size * size; i++) {
        if (covered[i]) {
            count++;

            for (let k = 0; k < channels; k++) {
                mean[k] += values[i * channels + k];
            }
        }
    }

    for (let pass = 0; pass < 6; pass++) {
        const next = done.slice();

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = y * size + x;

                if (done[i]) {
                    continue;
                }

                const around = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1, y < size - 1 ? i + size : -1].filter((j) => j >= 0 && done[j]);

                if (around.length) {
                    for (let k = 0; k < channels; k++) {
                        out[i * channels + k] = around.reduce((sum, j) => sum + out[j * channels + k], 0) / around.length;
                    }

                    next[i] = 1;
                }
            }
        }

        done = next;
    }

    for (let i = 0; i < size * size; i++) {
        if (!done[i]) {
            for (let k = 0; k < channels; k++) {
                out[i * channels + k] = mean[k] / count;
            }
        }
    }

    return out;
}

// A PNG of one 8-bit channel (`size` square), for the masks
/**
 * The mouth's inside's picture: its colour (Vitruvian's Mouth_Color, a linear 4096-texel EXR)
 * brought down to MOUTH_PICTURE texels a side by averaging, in sRGB, as a JPEG (its first row the
 * picture's top: its texture coordinates' v of 1).
 */
function mouthPicture(from) {
    const file = readFileSync(path.join(from, "textures/4K/Mouth_Color.1008.exr"));
    const loader = new EXRLoader().setDataType(FloatType);
    const { width, height, data } = loader.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    const channels = data.length / (width * height);
    const step = width / MOUTH_PICTURE;
    const pixels = new Uint8Array(MOUTH_PICTURE * MOUTH_PICTURE * 4);
    const encode = (linear) => Math.round(255 * Math.min(1, Math.max(0, linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055)));

    for (let y = 0; y < MOUTH_PICTURE; y++) {
        for (let x = 0; x < MOUTH_PICTURE; x++) {
            const sum = [0, 0, 0];

            for (let j = 0; j < step; j++) {
                for (let i = 0; i < step; i++) {
                    const at = ((y * step + j) * width + x * step + i) * channels;

                    for (let k = 0; k < 3; k++) {
                        sum[k] += data[at + k];
                    }
                }
            }

            // (The loader's first row is the bottom's)
            const to = ((MOUTH_PICTURE - 1 - y) * MOUTH_PICTURE + x) * 4;

            for (let k = 0; k < 3; k++) {
                pixels[to + k] = encode(sum[k] / (step * step));
            }

            pixels[to + 3] = 255;
        }
    }

    return jpeg.encode({ data: pixels, width: MOUTH_PICTURE, height: MOUTH_PICTURE }, 85).data;
}

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
    const faceTriangles = { body: [], eyes: [], mouth: [] };

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

    // The mouth's inside, brought down as the skin is, its texture coordinates its own tile's.
    // Kept last: every vertex before it is as it was, and the shapes' principal components are
    // worked out without it (below), so every body the sliders make is as it was, to the bit
    const mouthRenderOf = new Map();
    const mouthRender = [];
    const mouthCorner = (f, k) => {
        const l = f * 4 + k;
        const v = vitruvian.corners[l];
        const uv = [vitruvian.uvs[l * 2] - MOUTH_TILE, vitruvian.uvs[l * 2 + 1]];
        const key = `${v} ${uv[0].toFixed(6)} ${uv[1].toFixed(6)}`;

        if (!mouthRenderOf.has(key)) {
            mouthRenderOf.set(key, mouthRender.length);
            mouthRender.push({ v, uv });
        }

        return mouthRenderOf.get(key);
    };
    const mouthWhole = Uint32Array.from(faceTriangles.mouth.flatMap(([f, ...ks]) => ks.map((k) => mouthCorner(f, k))));
    const mouthPositions = Float32Array.from(mouthRender.flatMap(({ v }) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)]));
    const mouthUVs = Float32Array.from(mouthRender.flatMap(({ uv }) => uv));
    const [mouth, mouthError] = MeshoptSimplifier.simplifyWithAttributes(mouthWhole, mouthPositions, 3, mouthUVs, 2, [0.5, 0.5], new Uint8Array(mouthRender.length), MOUTH_TRIANGLES * 3, 0.05, ["LockBorder"]);
    const shaped = sources.length;

    console.log(`the mouth's inside: ${mouthWhole.length / 3} triangles to ${mouth.length / 3} (error ${(mouthError * 100).toFixed(2)}% of its size)`);

    // (Its own vertices, those where it meets the lips too: copies of the skin's there, moved
    // alike, so the skin's are the body's alone, their facing and neighbours as they were)
    for (const r of mouth) {
        keep(`m${mouthRender[r].v}`, { kind: "vitruvian", v: mouthRender[r].v });
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
    // (The skin's: not the mouth's inside, kept after it)
    const mouthOnly = new Set(sources.slice(shaped).map(({ v }) => v));
    const distances = [...onSkin].filter(([v]) => !mouthOnly.has(v)).map(([, { distance }]) => distance).sort((x, y) => x - y);
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

    // Where each kept vertex is on Vitruvian's body as it is: the eyelashes (MakeHuman's) set on
    // its eyes, by how far their middles are from MakeHuman's, then each column of a card (the
    // lashes' connected pieces) seated on its lid's edge (below). Set on its eyes alone, the cards
    // stood 4 to 10 mm out in front of its lids, which are set further back round its eyes than
    // MakeHuman's
    const restAt = (entry) => {
        const p = entry.kind === "human" ? [...laid.subarray(entry.v * 3, entry.v * 3 + 3)] : [...vitruvian.positions.subarray(entry.v * 3, entry.v * 3 + 3)];

        if (entry.kind === "human") {
            const offset = eyeOffsets.get(Math.sign(p[0]) || 1);

            p[0] += offset[0];
            p[1] += offset[1];
            p[2] += offset[2];
        }

        return p;
    };
    const unseated = sources.map(restAt);

    // A lid's edge is its skin nearest the eye's opening (the skin is closed round the eye: past
    // the edge it lines the lid, inwards), the way round the eye; a card is on the upper lid or the
    // lower, as it lies above or below the eye's middle. An eyelash swings with the edge of the lid
    // it grows from, about the middle of the eye (as a lid closes over it), rather than moving as
    // the lid's skin nearest it does (the skin nearest a card's tip is the lid's fold, which hardly
    // moves: a card crumpled)
    const eyeMiddles = new Map([-1, 1].map((side) => [side, eyeCentre(eyeVertices.map((v) => [...vitruvian.positions.subarray(v * 3, v * 3 + 3)]), side)]));
    const sideOf = (i) => Math.sign(unseated[i][0]) || 1;
    const fromMiddle = (i) => sub(unseated[i], eyeMiddles.get(sideOf(i)));
    const round = (i) => Math.atan2(fromMiddle(i)[0], fromMiddle(i)[2]);
    const elevation = (i) => Math.atan2(fromMiddle(i)[1], Math.hypot(fromMiddle(i)[0], fromMiddle(i)[2]));
    const eyeSet = new Set(eyeVertices);
    const lidSkin = sources.map((entry, i) => i).filter((i) => sources[i].kind === "vitruvian" && !eyeSet.has(sources[i].v) && length(fromMiddle(i)) > LID_SHELL[0] && length(fromMiddle(i)) < LID_SHELL[1]);
    const lids = new Map([-1, 1].map((side) => {
        const rounds = lashes.map(([, i]) => i).filter((i) => sideOf(i) === side).map(round);
        const edge = (upper) => {
            const found = new Set();

            for (let r = Math.min(...rounds) - LID_STEP; r <= Math.max(...rounds) + LID_STEP; r += LID_STEP) {
                const near = lidSkin.filter((i) => sideOf(i) === side && Math.abs(round(i) - r) < LID_WINDOW && (elevation(i) > 0) === upper);

                if (near.length) {
                    found.add(near.reduce((best, i) => (Math.abs(elevation(i)) < Math.abs(elevation(best)) ? i : best)));
                }
            }

            return [...found].sort((i, j) => round(i) - round(j));
        };

        return [side, { upper: edge(true), lower: edge(false) }];
    }));

    console.log(`the lids' edges: ${[...lids.values()].map(({ upper, lower }) => `${upper.length} and ${lower.length} vertices`).join("; ")}`);

    const cardOf = new Map(lashes.map(([, i]) => [i, i]));
    const cardRoot = (i) => (cardOf.get(i) === i ? i : cardRoot(cardOf.get(i)));

    for (let t = 0; t < lashRender.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => cardRoot(sourceOf.get(`h${human.renderSource[lashRender[t + k]]}`)));

        cardOf.set(b, a);
        cardOf.set(c, a);
    }

    const cards = new Map();

    for (const [, i] of lashes) {
        cards.set(cardRoot(i), [...(cards.get(cardRoot(i)) ?? []), i]);
    }

    // Each lash vertex: its root, its lid's edge's two vertices either side of that (round the
    // eye), how far it is between them, and the eye's middle
    const lashSwings = [...cards.values()].flatMap((card) => {
        const lid = lids.get(sideOf(card[0]));
        const edge = card.filter((i) => elevation(i) > 0).length > card.length / 2 ? lid.upper : lid.lower;

        return card.map((i) => {
            // (Its root: its column's nearest the eye, so the column swings in one piece)
            const root = card.filter((j) => Math.abs(round(j) - round(i)) < LASH_COLUMN)
                .reduce((best, j) => (length(fromMiddle(j)) < length(fromMiddle(best)) ? j : best), i);
            const k = Math.max(0, Math.min(edge.length - 2, edge.findIndex((j) => round(j) > round(root)) - 1));
            const [a, b] = [edge[k], edge[k + 1]];
            const along = Math.max(0, Math.min(1, (round(root) - round(a)) / (round(b) - round(a))));

            return [i, root, a, b, along, eyeMiddles.get(sideOf(i))];
        });
    });

    // Each column seated on its lid's edge where it is round the eye (its root a hair out from it)
    const seats = new Map(lashSwings.map(([i, root, a, b, along]) => {
        const edge = [0, 1, 2].map((k) => (1 - along) * unseated[a][k] + along * unseated[b][k]);
        const out = fromMiddle(root).map((value) => (value / length(fromMiddle(root))) * LASH_SEAT);

        return [i, [0, 1, 2].map((k) => edge[k] + out[k] - unseated[root][k])];
    }));
    const rest = unseated.map((p, i) => (seats.has(i) ? p.map((value, k) => value + seats.get(i)[k]) : p));

    console.log(`the lashes seated on the lids' edges: moved ${(Math.max(...[...seats.values()].map(length)) * 1000).toFixed(1)} mm at most`);

    // (Each shape moves a lash as the lid's skin nearest where it was set on the eyes, before it was
    // seated: the lids' skin round it moves alike, and so every shape, and the principal components
    // made of them, are as they were; the bodies the sliders make with them, to the bit)
    const lashLids = lashes.map(([, i]) => {
        const at = unseated[i];
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
        base.set(rest[i], i * 3);
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
    parts.mouth = { start: indices.length };

    for (const r of mouth) {
        indices.push(drawAt(`m${r}`, sourceOf.get(`m${mouthRender[r].v}`), mouthRender[r].uv));
    }

    parts.mouth.count = indices.length - parts.mouth.start;

    if (renderSource.length > 65535 || count > 65535) {
        throw new Error(`Too many vertices for 16-bit indices: ${count} (${renderSource.length} drawn)`);
    }

    // Each vertex's four strongest bones, in 255ths (the strongest first): Vitruvian's own weights,
    // and the eyelashes' MakeHuman's
    const influences = sources.map(() => []);
    // (Each Vitruvian vertex's kept ones: two where the mouth's inside meets the lips, the skin's
    // and its own)
    const vitruvianSources = new Map();

    sources.forEach((entry, i) => {
        if (entry.kind === "vitruvian") {
            vitruvianSources.set(entry.v, [...(vitruvianSources.get(entry.v) ?? []), i]);
        }
    });

    for (const [name, list] of vitruvian.weights) {
        for (const [v, weight] of list) {
            for (const i of vitruvianSources.get(v) ?? []) {
                influences[i].push([boneIndex.get(name), weight]);
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

    // The macro shapes in principal components (as build-characters.js), worked out on the
    // vertices before the mouth's inside (`shaped`): the components there are as they were without
    // it, and its own are the same sums of the shapes' changes there
    const macroShapes = allMacroTargetNames().map((name) => ({ name, ...carried.get(name) }));
    const n = macroShapes.length;
    const gram = Array.from({ length: n }, () => new Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
            let sum = 0;

            for (let k = 0; k < shaped * 3; k++) {
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

            for (let j = 0; j < shaped * 3; j += 3) {
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
    const pcaScales = components.map((component) => component.subarray(0, shaped * 3).reduce((max, value) => Math.max(max, Math.abs(value)), 0) / PCA_STEPS);
    const pcaData = new Int16Array(components.length * count * 3);
    let pcaClamped = 0;

    components.forEach((component, k) => {
        for (let j = 0; j < component.length; j++) {
            const step = Math.round(component[j] / pcaScales[k]);

            pcaClamped += Math.abs(step) > 32767 ? 1 : 0;
            pcaData[k * count * 3 + j] = Math.max(-32767, Math.min(32767, step));
        }
    });

    if (pcaClamped) {
        throw new Error(`${pcaClamped} of the mouth's inside's principal components' changes too big for their steps`);
    }

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

    // The face's expressions, sparse as the detail shapes are: Vitruvian's own moves at the kept
    // vertices, and the eyelashes swung with the lids' edges (packed after the rest, so the rest
    // lies where it did)
    let widestSwing = 0;
    // (Where each vertex is across the face, as CharMorph keeps it: its middle at 0)
    const faceX = readNpy(path.join(from, "morphs/L1/Default.npy")).data.filter((_, j) => j % 3 === 0);
    const expressions = Object.entries(EXPRESSIONS).map(([name, parts]) => {
        const deltas = new Float64Array(count * 3);
        const partMoves = new Map(parts.map((part) => {
            const { idx, delta } = readNpz(path.join(from, `morphs/L3/${part}.npz`));
            const moves = new Map();

            idx.data.forEach((v, k) => {
                moves.set(v, toOurs(delta.data[k * 3], delta.data[k * 3 + 1], delta.data[k * 3 + 2]).map((value) => value * scale));
            });

            return [part, moves];
        }));
        const once = seamMovedOnce(partMoves, faceX);

        for (const [part, moves] of partMoves) {
            sources.forEach((entry, i) => {
                const move = entry.kind === "vitruvian" && !once.get(part)?.has(entry.v) ? moves.get(entry.v) : undefined;

                if (move) {
                    for (let k = 0; k < 3; k++) {
                        deltas[i * 3 + k] += move[k];
                    }
                }
            });
        }

        // (Carried as the lid's edge is, and turned about its root, in the eye's up-and-down
        // plane, by as much as the edge turns about the eye's middle there: turned about the edge
        // itself, a lash's root, which sits a little out from it, swung down off the lid)
        for (const [i, root, a, b, along, middle] of lashSwings) {
            const mix = (by) => [0, 1, 2].map((k) => (1 - along) * (rest[a][k] + by * deltas[a * 3 + k]) + along * (rest[b][k] + by * deltas[b * 3 + k]));
            const [from, to] = [mix(0), mix(1)];
            const turn = Math.atan2(to[1] - middle[1], to[2] - middle[2]) - Math.atan2(from[1] - middle[1], from[2] - middle[2]);
            const [x, y, z] = sub(rest[i], rest[root]);
            const swung = [x, y * Math.cos(turn) + z * Math.sin(turn), z * Math.cos(turn) - y * Math.sin(turn)];

            widestSwing = Math.max(widestSwing, Math.abs(turn));

            for (let k = 0; k < 3; k++) {
                deltas[i * 3 + k] = to[k] - from[k] + swung[k] - [x, y, z][k];
            }
        }

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
        };
    });

    console.log(`expressions: ${expressions.map(({ name, vertices }) => `${name} ${vertices.length}`).join(", ")}; lashes swung up to ${(widestSwing * 180 / Math.PI).toFixed(0)}°`);

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
        expressions,
        deltaUnit: DELTA_UNIT,
        landmarks: { neck: Math.round(neckFraction * 1e4) / 1e4, shoulder: shoulderOffset },
        masks: MASKS.map((name) => `vitruvian/masks/${name}.png`),
        pictures: { mouth: "vitruvian/mouth.jpg" },
        skin: Object.fromEntries(Object.keys(SKIN_PICTURES).map((key) => [key, `vitruvian/skin/${key}.jpg`])),
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
    writeFileSync(path.join(target, "vitruvian/mouth.jpg"), mouthPicture(from));

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

    // Its own skin pictures, where the skin's drawn
    const covered = new Uint8Array(SKIN_PICTURE * SKIN_PICTURE);

    rasterise(simplified, render, SKIN_PICTURE, (i) => (covered[i] = 1));
    mkdirSync(path.join(target, "vitruvian/skin"), { recursive: true });

    for (const [key, bytes] of Object.entries(skinPictures(from, covered))) {
        writeFileSync(path.join(target, `vitruvian/skin/${key}.jpg`), bytes);
        console.log(`skin picture ${key}: ${(bytes.length / 1024).toFixed(0)} KB`);
    }
}

// The vertices down the middle of the face that a shape's left and right halves split hard there
// both move, each in full (each half moves only its own side, and the middle as the whole shape
// does): added up, the middle moved twice as far as either side of it (a ridge down the brow
// raised, a notch in the lower lip). Those the right half leaves to the left, by part. (Halves
// that fade across the middle instead, each moving it part of the way, are added up there: the
// upper lip's raised)
function seamMovedOnce(partMoves, x) {
    const once = new Map();
    const onSeam = (v) => Math.abs(x[v]) <= SEAM;

    for (const [left, a] of partMoves) {
        const right = left.endsWith("_Left") ? `${left.slice(0, -"_Left".length)}_Right` : null;
        const b = partMoves.get(right);

        if (!b) {
            continue;
        }

        // (Its largest move on the middle, and on the far side of it: a hard split's next to none)
        const seam = [...a.keys()].filter((v) => onSeam(v) && b.has(v));
        const middle = Math.max(0, ...seam.flatMap((v) => [length(a.get(v)), length(b.get(v))]));
        const across = (moves, side) => Math.max(0, ...[...moves].filter(([v]) => !onSeam(v) && Math.sign(x[v]) !== side).map(([, move]) => length(move)));
        const sideOf = (moves) => Math.sign([...moves].reduce((sum, [v, move]) => sum + x[v] * length(move), 0));

        if (across(a, sideOf(a)) < middle * HARD_SPLIT && across(b, sideOf(b)) < middle * HARD_SPLIT) {
            once.set(right, new Set(seam));
        }
    }

    return once;
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
