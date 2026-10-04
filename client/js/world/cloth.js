// Cloth in the wind (the terrain plan's M7c: the peoples' towns lived in): the banners hung on
// their walls and from their poles, the pennants flying from their towers, the washing on their
// lines, and the striped awnings over their market stalls and shop counters, their scalloped
// valances flapping. A kit records each
// cloth as it builds (Solid's `cloth`: where its top is, which way it faces, how wide and long it
// is, and its look); here they're drawn, all of a chunk's in one mesh. Where each corner of a cloth
// is, as it swings and ripples (or, a flag, flaps out on the breeze), is worked out in the vertex
// shader from the trees' breeze's time (kits/trees.js TREE_WIND), so nothing's sent each frame,
// with the breeze blowing the way the chimneys' smoke leans (smoke.js). Each people's cloth (its
// colour, a trim, its emblem) is painted once, beside the plain, ragged and pennant cloths the
// others are tinted from, in one picture they're all drawn from.

import * as THREE from "three";
import { COLOURS as PEOPLES } from "../core/war/peoples.js";
import { material } from "./art/engine/materials.js";
import { TREE_WIND } from "./art/kits/trees.js";
import { WIND_WAY } from "./wind.js";

// Each cloth's picture (pixels)
const PICTURE = Object.freeze({ width: 128, height: 224 });

const shade = (hex, by) => {
    const colour = new THREE.Color(hex);

    return `#${colour.multiplyScalar(by).getHexString()}`;
};

// Each people's emblem, drawn in the middle of a cloth `size` pixels across
const EMBLEMS = {
    human(paint, size) {
        // A crown
        paint.beginPath();
        paint.moveTo(-0.34 * size, 0.18 * size);
        paint.lineTo(-0.34 * size, -0.16 * size);
        paint.lineTo(-0.17 * size, 0.02 * size);
        paint.lineTo(0, -0.24 * size);
        paint.lineTo(0.17 * size, 0.02 * size);
        paint.lineTo(0.34 * size, -0.16 * size);
        paint.lineTo(0.34 * size, 0.18 * size);
        paint.closePath();
        paint.fill();
    },
    elf(paint, size) {
        // A leaf, and its stem
        paint.beginPath();
        paint.moveTo(0, -0.34 * size);
        paint.quadraticCurveTo(0.32 * size, -0.05 * size, 0, 0.3 * size);
        paint.quadraticCurveTo(-0.32 * size, -0.05 * size, 0, -0.34 * size);
        paint.fill();
        paint.lineWidth = size * 0.04;
        paint.beginPath();
        paint.moveTo(0, -0.2 * size);
        paint.lineTo(0, 0.4 * size);
        paint.stroke();
    },
    darkElf(paint, size) {
        // A spider: a body, a head and eight legs
        paint.beginPath();
        paint.ellipse(0, 0.06 * size, 0.12 * size, 0.16 * size, 0, 0, Math.PI * 2);
        paint.fill();
        paint.beginPath();
        paint.arc(0, -0.16 * size, 0.08 * size, 0, Math.PI * 2);
        paint.fill();
        paint.lineWidth = size * 0.035;

        for (const side of [-1, 1]) {
            for (let k = 0; k < 4; k++) {
                const y = (-0.08 + k * 0.08) * size;

                paint.beginPath();
                paint.moveTo(0, y);
                paint.lineTo(side * 0.24 * size, y - 0.1 * size + k * 0.03 * size);
                paint.lineTo(side * 0.36 * size, y + 0.04 * size + k * 0.04 * size);
                paint.stroke();
            }
        }
    },
    cat(paint, size) {
        // A sun
        paint.beginPath();
        paint.arc(0, 0, 0.16 * size, 0, Math.PI * 2);
        paint.fill();
        paint.lineWidth = size * 0.045;

        for (let k = 0; k < 12; k++) {
            const angle = (k * Math.PI) / 6;

            paint.beginPath();
            paint.moveTo(Math.cos(angle) * 0.22 * size, Math.sin(angle) * 0.22 * size);
            paint.lineTo(Math.cos(angle) * (k % 2 ? 0.3 : 0.36) * size, Math.sin(angle) * (k % 2 ? 0.3 : 0.36) * size);
            paint.stroke();
        }
    },
    lizard(paint, size) {
        // A serpent, coiled in an S, and its head
        paint.lineWidth = size * 0.09;
        paint.lineCap = "round";
        paint.beginPath();
        paint.moveTo(0.2 * size, 0.32 * size);
        paint.bezierCurveTo(-0.4 * size, 0.2 * size, 0.4 * size, -0.1 * size, -0.12 * size, -0.22 * size);
        paint.stroke();
        paint.beginPath();
        paint.ellipse(-0.16 * size, -0.28 * size, 0.1 * size, 0.07 * size, -0.4, 0, Math.PI * 2);
        paint.fill();
    },
    orc(paint, size, background) {
        // A skull, its eyes and teeth cut from it
        paint.beginPath();
        paint.arc(0, -0.06 * size, 0.24 * size, Math.PI * 0.9, Math.PI * 2.1);
        paint.lineTo(0.16 * size, 0.2 * size);
        paint.lineTo(-0.16 * size, 0.2 * size);
        paint.closePath();
        paint.fill();
        paint.fillStyle = background;

        for (const side of [-1, 1]) {
            paint.beginPath();
            paint.ellipse(side * 0.1 * size, -0.02 * size, 0.06 * size, 0.07 * size, 0, 0, Math.PI * 2);
            paint.fill();
        }

        for (let k = -2; k <= 2; k++) {
            paint.fillRect(k * 0.05 * size - 0.012 * size, 0.12 * size, 0.024 * size, 0.08 * size);
        }
    },
};

// Each people's cloth's field, where it isn't their colour darkened: the crown's gold on red, the
// cat folk's sun on indigo (their own colour's lost on their mud walls)
const FIELDS = Object.freeze({ human: "#6a1a1c", cat: "#26305e" });

/** Paint a people's cloth on a canvas (their colour, a trim, their emblem): the canvas. */
export function paintCloth(people, canvas = document.createElement("canvas")) {
    const { width, height } = PICTURE;
    const colour = PEOPLES[people] ?? "#888888";
    const background = FIELDS[people] ?? shade(colour, 0.4);
    const paint = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    // The cloth, its lower edge cut in a swallowtail, trimmed in the people's colour
    const tail = height * 0.84;

    paint.beginPath();
    paint.moveTo(0, 0);
    paint.lineTo(width, 0);
    paint.lineTo(width, height);
    paint.lineTo(width / 2, tail);
    paint.lineTo(0, height);
    paint.closePath();
    paint.fillStyle = background;
    paint.fill();
    paint.lineWidth = width * 0.08;
    paint.strokeStyle = colour;
    paint.stroke();

    // The emblem
    paint.save();
    paint.translate(width / 2, height * 0.4);
    paint.fillStyle = paint.strokeStyle = shade(colour, 1.25);
    EMBLEMS[people]?.(paint, width, background);
    paint.restore();

    return canvas;
}

/**
 * How cloth moves (metres, and radians a second): how far a hanging cloth's foot swings to and
 * fro, and its ripples; how far the breeze carries its foot (a metre of drop's worth, at most);
 * how far a flag's fly flaps; how fast each goes (the swing, the ripples, the flapping); how much
 * of that a cloth hung against a wall has (standing out from it, never into it); how far an
 * awning's middle lifts in the breeze (pinned at its corners), and how much of a hanging cloth's
 * swing a valance has (short, sewn along an awning's front); and how many squares each kind is
 * drawn with (across, down).
 */
export const CLOTH = Object.freeze({
    swing: 0.12,
    ripple: 0.045,
    lean: 0.16,
    flap: 0.14,
    speed: [1.3, 3.1, 6.2],
    wall: 0.4,
    billow: 0.07,
    valance: 0.35,
    grid: { hang: [6, 8], wash: [4, 4], fly: [8, 3], awning: [8, 4], valance: [8, 2] },
});

/** The way the breeze blows (east and south, a unit: the wind's, wind.js, as the chimneys' smoke leans). */
export const BREEZE = WIND_WAY;

/**
 * The awnings' stripes: each look's two colours (sRGB), the canvas sun-faded a little; and the
 * share of its picture's height its valance takes, at the foot.
 */
export const AWNINGS = Object.freeze({
    "awning-red": ["#a8342a", "#e6dcc4"],
    "awning-blue": ["#2f4d78", "#e2dccb"],
    "awning-green": ["#3d6a3c", "#e4ddc6"],
    "awning-gold": ["#c4892c", "#5a3a24"],
});

/** The share of an awning's picture its valance takes, at its foot. */
export const VALANCE = 0.2;

/** The cloths drawn from the one picture, in order: each people's, then the plain ones, then the awnings. */
export const LOOKS = Object.freeze(["human", "elf", "darkElf", "cat", "lizard", "orc", "plain", "square", "ragged", "pennant", ...Object.keys(AWNINGS)]);

// (Washing on a line hangs as a banner from a bar does, drawn in fewer squares: it's small; a
// valance too, swinging less, its kind a quarter so the shader tells it from a banner)
const KINDS = { hang: 0, wash: 0, valance: 0.25, wall: 1, fly: 2, awning: 3 };

// One of the plain cloths, white to be tinted, on a canvas `paint` in a cell PICTURE wide at x0:
// a swallowtail, a square, a ragged war banner with a black hand on it, or a pennant tapering to
// two points
function paintPlain(look, paint, x0) {
    const { width, height } = PICTURE;
    const at = ([u, v]) => [x0 + u * width, v * height];
    const outline = {
        plain: [[0, 0], [1, 0], [1, 1], [0.5, 0.84], [0, 1]],
        square: [[0, 0], [1, 0], [1, 1], [0, 1]],
        ragged: [[0, 0], [1, 0], [1, 0.88], [0.85, 1], [0.68, 0.9], [0.5, 1], [0.32, 0.9], [0.15, 1], [0, 0.86]],
        pennant: [[0, 0], [1, 0.42], [0.84, 0.5], [1, 0.58], [0, 1]],
    }[look];

    paint.save();
    paint.beginPath();
    outline.map(at).forEach(([x, y], k) => (k ? paint.lineTo(x, y) : paint.moveTo(x, y)));
    paint.closePath();
    paint.fillStyle = "#e9e4da";
    paint.fill();
    paint.clip();
    // (A darker trim round its edge, and, a pennant, a sleeve round its pole)
    paint.lineWidth = width * 0.08;
    paint.strokeStyle = "#b9b2a6";
    paint.stroke();

    if (look === "pennant") {
        paint.fillStyle = "#b9b2a6";
        paint.fillRect(x0, 0, width * 0.1, height);
    }

    if (look === "ragged") {
        // (A black hand on it, and a few holes worn through)
        paint.fillStyle = "#151515";
        paint.beginPath();
        [[0.35, 0.3], [0.65, 0.3], [0.62, 0.55], [0.5, 0.62], [0.38, 0.55]].map(at).forEach(([x, y], k) => (k ? paint.lineTo(x, y) : paint.moveTo(x, y)));
        paint.fill();
        paint.globalCompositeOperation = "destination-out";

        for (const [u, v, r] of [[0.22, 0.68, 0.05], [0.74, 0.76, 0.04], [0.6, 0.18, 0.03]]) {
            paint.beginPath();
            paint.arc(x0 + u * width, v * height, r * width, 0, Math.PI * 2);
            paint.fill();
        }
    }

    paint.restore();
}

// An awning's canvas, on a canvas `paint` in a cell PICTURE wide at x0: stripes of its two
// colours running from its back to its front, paler towards the back where the sun's faded it,
// a hem where the valance is sewn on, and the valance below it (VALANCE of the height), its foot
// cut in scallops, one to a stripe
function paintAwning(look, paint, x0) {
    const { width, height } = PICTURE;
    const [colour, ground] = AWNINGS[look];
    const stripes = 8;
    const hem = height * (1 - VALANCE);
    const scallop = width / stripes / 2;

    paint.save();
    paint.beginPath();
    paint.moveTo(x0, 0);
    paint.lineTo(x0 + width, 0);
    paint.lineTo(x0 + width, height - scallop);

    for (let k = stripes; k > 0; k--) {
        const middle = x0 + (k - 0.5) * (width / stripes);

        paint.arc(middle, height - scallop, scallop, 0, Math.PI, false);
    }

    paint.closePath();
    paint.clip();

    for (let k = 0; k < stripes; k++) {
        paint.fillStyle = k % 2 ? ground : colour;
        paint.fillRect(x0 + (k * width) / stripes, 0, width / stripes + 1, height);
    }

    // (Faded towards the back, where it's had the most sun; a shadow where it's sewn)
    const fade = paint.createLinearGradient(0, 0, 0, hem);

    fade.addColorStop(0, "rgba(255, 250, 235, 0.22)");
    fade.addColorStop(1, "rgba(255, 250, 235, 0)");
    paint.fillStyle = fade;
    paint.fillRect(x0, 0, width, hem);
    paint.fillStyle = "rgba(0, 0, 0, 0.28)";
    paint.fillRect(x0, hem - height * 0.012, width, height * 0.024);

    // (The weave, a little uneven)
    for (let y = 0; y < height; y += 3) {
        paint.fillStyle = `rgba(0, 0, 0, ${(0.02 + 0.03 * ((y * 7919) % 13) / 13).toFixed(3)})`;
        paint.fillRect(x0, y, width, 1);
    }

    paint.restore();
}

let picture = null;

/** The cloths' picture: each of LOOKS in a cell of its own, side by side. */
export function clothPicture() {
    if (!picture) {
        const canvas = document.createElement("canvas");
        const paint = canvas.getContext("2d");

        canvas.width = PICTURE.width * LOOKS.length;
        canvas.height = PICTURE.height;

        LOOKS.forEach((look, k) => {
            if (EMBLEMS[look]) {
                paint.drawImage(paintCloth(look), k * PICTURE.width, 0);
            } else if (AWNINGS[look]) {
                paintAwning(look, paint, k * PICTURE.width);
            } else {
                paintPlain(look, paint, k * PICTURE.width);
            }
        });

        picture = new THREE.CanvasTexture(canvas);
        picture.colorSpace = THREE.SRGBColorSpace;
    }

    return picture;
}

const VERTEX = `
uniform float clothTime;
uniform vec2 clothBreeze;
uniform vec4 clothSway;
uniform vec3 clothSpeed;
uniform float clothWall;
uniform vec2 clothShort;
attribute vec4 sheet;
attribute vec4 hang;
attribute float clothFall;

// How far a point of a cloth (u across it or out along it, a flag; v down it, or out over an
// awning) stands out from where it hangs at rest (metres)
float clothOut(float u, float v, float kind, float phase, float width, float drop) {
    if (kind > 2.5) {
        // (An awning, pinned at its corners: its middle lifted on the breeze and let fall, the
        // canvas shivering a little)
        float belly = sin(3.14159 * u) * sin(3.14159 * v);
        float gust = 0.55 + 0.45 * sin(clothTime * clothSpeed.x * 1.3 + phase);
        float shiver = sin(clothTime * clothSpeed.y + phase * 2.3 + u * width * 3.0 + v * drop * 2.0);

        return belly * (clothShort.x * gust + clothSway.y * 0.35 * shiver);
    }

    if (kind > 1.5) {
        // (A flag: waves running out from its pole, bigger the further out)
        float s = u * width;

        return u * clothSway.w * (sin(clothTime * clothSpeed.z - s * 2.4 + phase) + 0.3 * sin(clothTime * clothSpeed.z * 1.9 - s * 5.3 + phase * 1.7 + v * 3.0));
    }

    // (A hanging cloth: swinging to and fro, more towards its foot, and rippling; in standing folds
    // down its length, gathered less tightly at its top)
    float free = pow(v, 1.4);
    float swing = sin(clothTime * clothSpeed.x + phase + v * 1.1);
    float ripple = sin(clothTime * clothSpeed.y + phase * 2.3 + u * width * 4.5 - v * drop * 2.2);
    float fold = sin(u * 9.42 + phase * 3.0 + 0.4 * sin(clothTime * 0.7 + phase)) * (0.35 + 0.65 * v);

    if (kind > 0.5) {
        // (Against a wall: only standing out from it, and less)
        return clothWall * free * (clothSway.x * (0.6 + 0.4 * swing) + clothSway.y * (0.5 + 0.5 * ripple)) + clothSway.y * (0.5 + 0.5 * fold);
    }

    // (A valance, short: swinging less)
    float reach = kind > 0.1 ? clothShort.y : 1.0;

    return reach * (free * (clothSway.x * swing + clothSway.y * ripple) + clothSway.y * fold);
}`;

const PLACE = `
// Where this corner is, and which way it faces (the world's coordinates: the mesh isn't moved)
float clothU = sheet.x;
float clothV = sheet.y;
float clothKind = hang.z;
float clothPhase = hang.w;
bool clothFlies = clothKind > 1.5 && clothKind < 2.5;
vec3 clothAlong = clothFlies ? vec3(clothBreeze.x, 0.0, clothBreeze.y) : vec3(hang.x, 0.0, hang.y);
vec3 clothFront = vec3(-clothAlong.z, 0.0, clothAlong.x);
// (Down it: straight down, or an awning's way out over its slope, sheet.w out and clothFall down;
// and the way it stands out from where it lies: its front, or above an awning)
float clothLength = clothKind > 2.5 ? length(vec2(sheet.w, clothFall)) : sheet.w;
vec3 clothDownway = clothKind > 2.5 ? (clothFront * sheet.w - vec3(0.0, clothFall, 0.0)) / clothLength : vec3(0.0, -1.0, 0.0);
vec3 clothFace = clothKind > 2.5 ? cross(clothDownway, clothAlong) : clothFront;
vec3 clothRest = position + clothAlong * (clothFlies ? clothU : clothU - 0.5) * sheet.z + clothDownway * clothV * clothLength;

if (clothFlies) {
    // (A flag droops a little towards its fly)
    clothRest.y -= clothU * clothU * 0.1 * sheet.z;
} else if (clothKind < 0.5) {
    // (A hanging cloth's foot carried on the breeze, and lifted as much as that takes)
    float clothLean = clothSway.z * sheet.w * pow(clothV, 1.4) * (0.7 + 0.3 * sin(clothTime * 0.5 + clothPhase));

    clothRest += vec3(clothBreeze.x, clothLean / max(sheet.w, 0.1) * 0.5, clothBreeze.y) * clothLean;
}

float clothNow = clothOut(clothU, clothV, clothKind, clothPhase, sheet.z, sheet.w);
float clothAcross = (clothOut(clothU + 0.02, clothV, clothKind, clothPhase, sheet.z, sheet.w) - clothNow) / (0.02 * sheet.z);
float clothDown = (clothOut(clothU, clothV + 0.02, clothKind, clothPhase, sheet.z, sheet.w) - clothNow) / (0.02 * clothLength);
vec3 clothAt = clothRest + clothFace * clothNow;
vec3 objectNormal = normalize(cross(clothDownway + clothFace * clothDown, clothAlong + clothFace * clothAcross));
#ifdef USE_TANGENT
vec3 objectTangent = clothAlong;
#endif`;

let shared = null;
let depth = null;

// The cloths' uniforms, shared by how they're drawn and how their shadows are
const uniforms = () => ({
    clothTime: TREE_WIND.time,
    clothBreeze: { value: new THREE.Vector2(...BREEZE) },
    clothSway: { value: new THREE.Vector4(CLOTH.swing, CLOTH.ripple, CLOTH.lean, CLOTH.flap) },
    clothSpeed: { value: new THREE.Vector3(...CLOTH.speed) },
    clothWall: { value: CLOTH.wall },
    clothShort: { value: new THREE.Vector2(CLOTH.billow, CLOTH.valance) },
});

/** The cloths' material, one for them all: lit as the buildings are, both sides of it. */
export function clothMaterial() {
    if (!shared) {
        shared = new THREE.MeshLambertMaterial({ map: clothPicture(), vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
        shared.name = "cloth";
        shared.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms());
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", `#include <common>\n${VERTEX}`)
                .replace("#include <beginnormal_vertex>", PLACE)
                .replace("#include <begin_vertex>", "vec3 transformed = clothAt;");
        };
        shared.customProgramCacheKey = () => "cloth";
    }

    return shared;
}

/**
 * The cloths' shadows: each cloth where it is as it moves (the corners all lie at their cloth's
 * top until the vertex shader puts them in place, so the usual shadow would be nothing), cut out
 * where the cloth's picture is (a valance's scallops).
 */
export function clothDepthMaterial() {
    if (!depth) {
        depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: clothPicture(), alphaTest: 0.5, side: THREE.DoubleSide });
        depth.name = "cloth-depth";
        depth.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms());
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", `#include <common>\n${VERTEX}`)
                .replace("#include <begin_vertex>", `${PLACE}\nvec3 transformed = clothAt;`);
        };
        depth.customProgramCacheKey = () => "cloth-depth";
    }

    return depth;
}

// (A number from 0 to 1 for a point, the same every time)
const hash = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;

    return s - Math.floor(s);
};

/**
 * The cloths (`pieces`: [{ at: [x, y, z] (metres, in the world: the middle of a hanging cloth's
 * top, the top of a flag's pole, or the middle of an awning's back edge), out: [x, y, z] (the way
 * its front faces: away from the wall it's hung on, or out over an awning), width, drop (metres:
 * how far it hangs, or how far out an awning reaches), fall (metres: how far an awning falls from
 * its back to its front), kind ("hang" from a bar, against a "wall", "wash" on a line, a "fly"ing
 * flag, an "awning" or the "valance" along its front), look (one of LOOKS), rows ([v0, v1]: the
 * share of its look's picture, top to foot, it's drawn from: an awning's and its valance's),
 * colour (sRGB, to tint a plain one; none for a people's own) }]) drawn: a mesh in the world's
 * coordinates, or null if there are none.
 */
export function clothMesh(pieces) {
    if (!pieces.length) {
        return null;
    }

    const counts = pieces.map(({ kind }) => CLOTH.grid[kind] ?? CLOTH.grid.hang);
    const corners = counts.reduce((sum, [a, d]) => sum + (a + 1) * (d + 1), 0);
    const squares = counts.reduce((sum, [a, d]) => sum + a * d, 0);
    const positions = new Float32Array(corners * 3);
    const sheets = new Float32Array(corners * 4);
    const hangs = new Float32Array(corners * 4);
    const falls = new Float32Array(corners);
    const uvs = new Float32Array(corners * 2);
    const colours = new Float32Array(corners * 3);
    const indices = new Uint32Array(squares * 6);
    const colour = new THREE.Color();
    let [n, i, reach] = [0, 0, 0];

    pieces.forEach(({ at, out = [0, 0, 1], width, drop, fall = 0, kind = "hang", look = "plain", rows: [v0, v1] = [0, 1], colour: tint = null }, k) => {
        const [across, down] = counts[k];
        const length = Math.sqrt(out[0] * out[0] + out[2] * out[2]) || 1;
        // (Left to right as its front's seen: the front's to the right of the way across)
        const along = [out[2] / length, -out[0] / length];
        const phase = hash(...at) * 6.283;
        const column = Math.max(0, LOOKS.indexOf(look));
        const first = n;

        colour.set(tint ?? 0xffffff);

        // (Each people's own a little lighter or darker, as cloth dyed in different lots is)
        if (tint === null) {
            colour.multiplyScalar(0.92 + 0.14 * hash(at[2], at[0], at[1]));
        }

        for (let b = 0; b <= down; b++) {
            for (let a = 0; a <= across; a++, n++) {
                const [u, v] = [a / across, b / down];

                positions.set(at, n * 3);
                sheets.set([u, v, width, drop], n * 4);
                hangs.set([along[0], along[1], KINDS[kind] ?? 0, phase], n * 4);
                falls[n] = fall;
                uvs.set([(column + u) / LOOKS.length, 1 - (v0 + v * (v1 - v0))], n * 2);
                colours.set([colour.r, colour.g, colour.b], n * 3);
            }
        }

        for (let b = 0; b < down; b++) {
            for (let a = 0; a < across; a++, i++) {
                const corner = first + b * (across + 1) + a;

                indices.set([corner, corner + across + 1, corner + 1, corner + 1, corner + across + 1, corner + across + 2], i * 6);
            }
        }

        reach = Math.max(reach, width + drop + fall);
    });

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("sheet", new THREE.BufferAttribute(sheets, 4));
    geometry.setAttribute("hang", new THREE.BufferAttribute(hangs, 4));
    geometry.setAttribute("clothFall", new THREE.BufferAttribute(falls, 1));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    // (Reaching as far as the furthest cloth hangs or flies, and swings or billows)
    geometry.boundingSphere.radius += reach + CLOTH.swing + CLOTH.flap + CLOTH.billow;

    const mesh = new THREE.Mesh(geometry, clothMaterial());

    mesh.name = "cloth";
    mesh.matrixAutoUpdate = false;
    // (Its shadow where it is as it moves: an awning shading the stall under it)
    mesh.castShadow = true;
    mesh.customDepthMaterial = clothDepthMaterial();
    mesh.receiveShadow = true;

    return mesh;
}

/**
 * The cloths of what's been built (a built object, its world matrix up to date: each part whose
 * userData.cloth lists them, as clothMesh takes them, in its own pixels), in the world (metres).
 */
export function clothOf(object) {
    const pieces = [];
    const point = new THREE.Vector3();
    const way = new THREE.Vector3();

    object.traverse((node) => {
        const scale = node.userData.cloth ? node.matrixWorld.getMaxScaleOnAxis() : 1;

        for (const { at, out = [0, 0, 1], width, drop, fall = 0, ...rest } of node.userData.cloth ?? []) {
            point.set(...at).applyMatrix4(node.matrixWorld);
            way.set(...out).transformDirection(node.matrixWorld);
            pieces.push({ ...rest, at: point.toArray(), out: [way.x, 0, way.z], width: width * scale, drop: drop * scale, fall: fall * scale });
        }
    });

    return pieces;
}

/**
 * A striped awning on a kit's `solid` (in its pixels), and its valance: its back edge's middle at
 * `back` ([x, y, z]), reaching `depth` out the way `out` faces ([x, y, z], level) and falling
 * `fall` as it goes, `width` across, a valance `skirt` deep hanging from its front edge; in the
 * colours of `look` (one of AWNINGS). Pinned at its corners, it lifts and settles on the breeze,
 * its valance flapping.
 */
export function awning(solid, back, out, { width, depth, fall, skirt, look }) {
    const length = Math.hypot(out[0], out[2]) || 1;
    const [ox, oz] = [out[0] / length, out[2] / length];
    const front = [back[0] + ox * depth, back[1] - fall, back[2] + oz * depth];
    const cloth = (solid.cloth ??= []);

    cloth.push({ at: [...back], out: [ox, 0, oz], width, drop: depth, fall, kind: "awning", look, rows: [0, 1 - VALANCE] });
    cloth.push({ at: front, out: [ox, 0, oz], width, drop: skirt, kind: "valance", look, rows: [1 - VALANCE, 1] });

    return solid;
}

/**
 * A flag on a pole, on a kit's `solid` (in its pixels): an iron pole (or of `pole`, a material's
 * name) standing on `foot` ([x, y, z]), `height` tall and `radius` thick, a pennant `length` long
 * and `drop` deep flying from its head on the breeze, of `colour` (a people's: core/war/peoples.js
 * COLOURS; or sRGB).
 */
export function flagpole(solid, [x, y, z], height, colour, { radius, length, drop, pole = "iron" }) {
    solid.cylinder(x, z, y, y + height, radius, radius * 0.75, material(pole), { segments: 6 });
    (solid.cloth ??= []).push({ at: [x, y + height - radius, z], width: length, drop, kind: "fly", look: "pennant", colour: PEOPLES[colour] ?? colour });

    return solid;
}
