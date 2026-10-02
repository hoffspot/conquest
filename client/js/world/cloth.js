// Cloth in the wind (the terrain plan's M7c: the peoples' towns lived in): the banners hung on
// their walls and from their poles, and the pennants flying from their towers. A kit records each
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
import { SMOKE } from "./smoke.js";

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
 * of that a cloth hung against a wall has (standing out from it, never into it); and how many
 * squares each kind is drawn with (across, down).
 */
export const CLOTH = Object.freeze({ swing: 0.12, ripple: 0.045, lean: 0.16, flap: 0.14, speed: [1.3, 3.1, 6.2], wall: 0.4, grid: { hang: [6, 8], fly: [8, 3] } });

/** The way the breeze blows (east and south, a unit: the way the chimneys' smoke leans). */
export const BREEZE = Object.freeze(((x, z) => [x / Math.sqrt(x * x + z * z), z / Math.sqrt(x * x + z * z)])(...SMOKE.wind));

/** The cloths drawn from the one picture, in order: each people's, then the plain ones. */
export const LOOKS = Object.freeze(["human", "elf", "darkElf", "cat", "lizard", "orc", "plain", "square", "ragged", "pennant"]);

const KINDS = { hang: 0, wall: 1, fly: 2 };

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
attribute vec4 sheet;
attribute vec4 hang;

// How far a point of a cloth (u across it or out along it, a flag; v down it) stands out from
// where it hangs at rest (metres)
float clothOut(float u, float v, float kind, float phase, float width, float drop) {
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

    return free * (clothSway.x * swing + clothSway.y * ripple) + clothSway.y * fold;
}`;

const PLACE = `
// Where this corner is, and which way it faces (the world's coordinates: the mesh isn't moved)
float clothU = sheet.x;
float clothV = sheet.y;
float clothKind = hang.z;
float clothPhase = hang.w;
vec3 clothAlong = clothKind > 1.5 ? vec3(clothBreeze.x, 0.0, clothBreeze.y) : vec3(hang.x, 0.0, hang.y);
vec3 clothFront = vec3(-clothAlong.z, 0.0, clothAlong.x);
vec3 clothRest = position + clothAlong * (clothKind > 1.5 ? clothU : clothU - 0.5) * sheet.z - vec3(0.0, clothV * sheet.w, 0.0);

if (clothKind > 1.5) {
    // (A flag droops a little towards its fly)
    clothRest.y -= clothU * clothU * 0.1 * sheet.z;
} else if (clothKind < 0.5) {
    // (A hanging cloth's foot carried on the breeze, and lifted as much as that takes)
    float clothLean = clothSway.z * sheet.w * pow(clothV, 1.4) * (0.7 + 0.3 * sin(clothTime * 0.5 + clothPhase));

    clothRest += vec3(clothBreeze.x, clothLean / max(sheet.w, 0.1) * 0.5, clothBreeze.y) * clothLean;
}

float clothNow = clothOut(clothU, clothV, clothKind, clothPhase, sheet.z, sheet.w);
float clothAcross = (clothOut(clothU + 0.02, clothV, clothKind, clothPhase, sheet.z, sheet.w) - clothNow) / (0.02 * sheet.z);
float clothDown = (clothOut(clothU, clothV + 0.02, clothKind, clothPhase, sheet.z, sheet.w) - clothNow) / (0.02 * sheet.w);
vec3 clothAt = clothRest + clothFront * clothNow;
vec3 objectNormal = normalize(cross(vec3(0.0, -1.0, 0.0) + clothFront * clothDown, clothAlong + clothFront * clothAcross));
#ifdef USE_TANGENT
vec3 objectTangent = clothAlong;
#endif`;

let shared = null;

/** The cloths' material, one for them all: lit as the buildings are, both sides of it. */
export function clothMaterial() {
    if (!shared) {
        shared = new THREE.MeshLambertMaterial({ map: clothPicture(), vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
        shared.name = "cloth";
        shared.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, {
                clothTime: TREE_WIND.time,
                clothBreeze: { value: new THREE.Vector2(...BREEZE) },
                clothSway: { value: new THREE.Vector4(CLOTH.swing, CLOTH.ripple, CLOTH.lean, CLOTH.flap) },
                clothSpeed: { value: new THREE.Vector3(...CLOTH.speed) },
                clothWall: { value: CLOTH.wall },
            });
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", `#include <common>\n${VERTEX}`)
                .replace("#include <beginnormal_vertex>", PLACE)
                .replace("#include <begin_vertex>", "vec3 transformed = clothAt;");
        };
        shared.customProgramCacheKey = () => "cloth";
    }

    return shared;
}

// (A number from 0 to 1 for a point, the same every time)
const hash = (x, y, z) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;

    return s - Math.floor(s);
};

/**
 * The cloths (`pieces`: [{ at: [x, y, z] (metres, in the world: the middle of a hanging cloth's
 * top, or the top of a flag's pole), out: [x, y, z] (the way its front faces: away from the wall
 * it's hung on), width, drop (metres), kind ("hang" from a bar, against a "wall", or a "fly"ing
 * flag), look (one of LOOKS), colour (sRGB, to tint a plain one; none for a people's own) }]) drawn:
 * a mesh in the world's coordinates, or null if there are none.
 */
export function clothMesh(pieces) {
    if (!pieces.length) {
        return null;
    }

    const counts = pieces.map(({ kind }) => CLOTH.grid[kind === "fly" ? "fly" : "hang"]);
    const corners = counts.reduce((sum, [a, d]) => sum + (a + 1) * (d + 1), 0);
    const squares = counts.reduce((sum, [a, d]) => sum + a * d, 0);
    const positions = new Float32Array(corners * 3);
    const sheets = new Float32Array(corners * 4);
    const hangs = new Float32Array(corners * 4);
    const uvs = new Float32Array(corners * 2);
    const colours = new Float32Array(corners * 3);
    const indices = new Uint32Array(squares * 6);
    const colour = new THREE.Color();
    let [n, i, reach] = [0, 0, 0];

    pieces.forEach(({ at, out = [0, 0, 1], width, drop, kind = "hang", look = "plain", colour: tint = null }, k) => {
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
                uvs.set([(column + u) / LOOKS.length, 1 - v], n * 2);
                colours.set([colour.r, colour.g, colour.b], n * 3);
            }
        }

        for (let b = 0; b < down; b++) {
            for (let a = 0; a < across; a++, i++) {
                const corner = first + b * (across + 1) + a;

                indices.set([corner, corner + across + 1, corner + 1, corner + 1, corner + across + 1, corner + across + 2], i * 6);
            }
        }

        reach = Math.max(reach, width + drop);
    });

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("sheet", new THREE.BufferAttribute(sheets, 4));
    geometry.setAttribute("hang", new THREE.BufferAttribute(hangs, 4));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();
    // (Reaching as far as the furthest cloth hangs or flies, and swings)
    geometry.boundingSphere.radius += reach + CLOTH.swing + CLOTH.flap;

    const mesh = new THREE.Mesh(geometry, clothMaterial());

    mesh.name = "cloth";
    mesh.matrixAutoUpdate = false;
    // (Its shadow would be where it hangs at rest, not where it's blown: none)
    mesh.castShadow = false;
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

        for (const { at, out = [0, 0, 1], width, drop, ...rest } of node.userData.cloth ?? []) {
            point.set(...at).applyMatrix4(node.matrixWorld);
            way.set(...out).transformDirection(node.matrixWorld);
            pieces.push({ ...rest, at: point.toArray(), out: [way.x, 0, way.z], width: width * scale, drop: drop * scale });
        }
    });

    return pieces;
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
