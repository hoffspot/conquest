// Hair and beards, grown from the head: many thin strips ("hair cards", as most games use) with
// a strand texture, each following a strand from a root on the skin.
//
// Roots are spread over the outside of the head above the style's hairline (and, for beards,
// over the jaw); parted hair also has roots all along its parting. Each strand leaves the skin in
// the style's direction (combed back, away from a parting, to a tie or knot, standing up), neighbouring
// strands turned the same way as a comb leaves them, and is grown in fine steps: over the upper
// half of the head it lies on it (hair is soft: gravity presses it to the scalp), in its own
// layer just off it, going round the face rather than over it; below the head's widest point, it
// hangs straight down, draping over the neck, shoulders, chest and back (the skin, as a smooth
// surface) forward or back as it grew. Cut hair ends at its hem, and the rest at its length.
// Then each strand is smoothed where it hangs and resampled to a few segments, more where it
// bends. The head's shape is measured as its radius in every direction from its middle, so the
// same style fits any head. A ponytail is a full, round bundle from its tie.
//
// Hair is skinned to the head, handing over to the neck and upper back lower down, so long hair
// follows the body. Under the cards, the scalp is painted in the hair's colour (skin.js).

import * as THREE from "three";
import { aboveHairline, beardAmount, EAR, faceFrame, HEAD_CENTRE_Z, nearEar } from "./face.js";
import { random, smoothstep, valueNoise } from "./noise.js";
import { allAtOnce } from "../core/steps.js";

/**
 * Hairstyles: how many strands, how long (metres, at most), how they leave the scalp (`flow`, and
 * `lift` away from it), how much they fall (`gravity`: how far a strand bends down, per metre),
 * how thick the hair is (`volume`, metres), and how many segments each strand has. Cut hair ends
 * at a hem (`hem`: the height its ends are cut to, face coordinates, at the back and the front,
 * give or take `ragged`) rather than a length. Hair lies on the head (combed over it, down to its
 * widest point) unless it stands up (`stands`). `scalp` is how much hair to paint on the scalp;
 * `raise` moves the hairline up.
 */
export const HAIRSTYLES = Object.freeze({
    bald: { label: "Bald", strands: 0, scalp: 0 },
    buzz: { label: "Buzz cut", strands: 0, scalp: 1 },
    short: { label: "Short", strands: 1800, length: 0.05, lift: 0.1, gravity: 6, flow: "crown", width: 0.016, segments: 4, volume: 0.008, fringe: 0.02 },
    swept: { label: "Swept back", strands: 1500, length: 0.13, lift: 0.04, gravity: 30, flow: "back", width: 0.018, segments: 7, volume: 0.008 },
    bob: { label: "Bob", strands: 1600, length: 0.4, lift: 0.03, gravity: 40, flow: "part", width: 0.018, segments: 9, volume: 0.01, hem: [-0.105, -0.115], ragged: 0.004 },
    long: { label: "Long", strands: 1700, length: 0.8, lift: 0.03, gravity: 40, flow: "part", width: 0.02, segments: 14, volume: 0.01, hem: [-0.4, -0.34], ragged: 0.012 },
    ponytail: { label: "Ponytail", strands: 1300, length: 0.3, lift: 0.02, gravity: 1, flow: "tail", width: 0.016, segments: 6, volume: 0.004, tail: { strands: 220, length: 0.34, width: 0.02, radius: 0.03 } },
    mohawk: { label: "Mohawk", strands: 520, length: 0.11, lift: 1.2, gravity: 0, flow: "up", width: 0.02, segments: 5, volume: 0.004, strip: 0.02, scalp: 0.3, stands: true },
    // (Twin tails: the hair drawn back either side to a tie high on each side of the back of the
    // head, a tail from each, and a short fringe of bangs over the forehead)
    twintails: { label: "Twin tails", strands: 1400, length: 0.3, lift: 0.02, gravity: 1, flow: "twin", width: 0.016, segments: 6, volume: 0.004, fringe: 0.035, bangs: 0.085, tails: { strands: 170, length: 0.4, width: 0.02, radius: 0.026 } },
    topknot: { label: "Topknot", strands: 900, length: 0.3, lift: 0.02, gravity: 0, flow: "knot", width: 0.016, segments: 6, volume: 0.004, raise: 0.03, scalp: 0.4, knot: true },
});

/** Beards: `stubble` is painted on the skin under them (or is all there is). */
export const BEARDS = Object.freeze({
    none: { label: "None", strands: 0, stubble: 0 },
    stubble: { label: "Stubble", strands: 0, stubble: 0.35 },
    short: { label: "Short beard", strands: 2600, length: 0.016, lift: 0.08, gravity: 27, width: 0.007, segments: 3, stubble: 1, volume: 0.003 },
    full: { label: "Full beard", strands: 1300, length: 0.075, lift: 0.12, gravity: 23, width: 0.014, segments: 6, stubble: 1, volume: 0.006 },
    goatee: { label: "Goatee", strands: 450, length: 0.045, lift: 0.1, gravity: 25, width: 0.012, segments: 4, stubble: 0.9, volume: 0.004, goatee: true },
});

let strandTexture = null;

/**
 * A texture of hair strands, white so a material's colour tints it, shared by all hair: combed
 * strands, lying nearly side by side in loose locks, solid right from the root (where a card
 * starts at the scalp: a parting stays a thin line) and fading out over their last few
 * millimetres (so a tip is soft, not pointed). The left and right halves are two variants; the
 * tips are at the bottom.
 */
export function hairTexture() {
    if (strandTexture) {
        return strandTexture;
    }

    const width = 128;
    const height = 256;
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    const next = random(7);

    context.lineCap = "round";

    for (const half of [0, 1]) {
        const left = half * (width / 2) + 4;
        const span = width / 2 - 8;

        // Locks of strands across the card, each gathering only a little towards its end
        for (let lock = 0; lock < 7; lock++) {
            const centre = left + ((lock + 0.5) / 7) * span + (next() - 0.5) * 2;
            const spread = span / 7;
            const end = height * (0.95 + 0.04 * next());

            for (let s = 0; s < 16; s++) {
                const start = centre + (next() - 0.5) * spread * 1.1;
                const tip = centre + (start - centre) * 0.75 + (next() - 0.5) * 1.5;
                const shade = Math.round(175 + next() * 80);
                const top = next() * 2;
                const bottom = end * (0.97 + 0.03 * next());
                const gradient = context.createLinearGradient(0, top, 0, bottom);

                gradient.addColorStop(0, `rgba(${shade},${shade},${shade},0.9)`);
                gradient.addColorStop(0.01, `rgba(${shade},${shade},${shade},0.95)`);
                gradient.addColorStop(0.88, `rgba(${shade},${shade},${shade},0.9)`);
                gradient.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
                context.strokeStyle = gradient;
                context.lineWidth = 0.9 + next() * 0.9;
                context.beginPath();
                context.moveTo(start, top);
                context.bezierCurveTo(start, top + (bottom - top) * 0.4, tip + (next() - 0.5), top + (bottom - top) * 0.7, tip, bottom);
                context.stroke();
            }
        }
    }

    strandTexture = new THREE.CanvasTexture(canvas);
    strandTexture.colorSpace = THREE.SRGBColorSpace;
    strandTexture.anisotropy = 4;

    return strandTexture;
}

/**
 * The head's shape as its radius in every direction from a point inside it, for keeping hair on
 * the outside.
 */
class HeadShape {
    static AROUND = 48;
    static UPDOWN = 24;

    constructor(centre, points) {
        const { AROUND, UPDOWN } = HeadShape;

        this.centre = centre;
        this.radii = new Float32Array(AROUND * UPDOWN);

        /** Its lowest point's height (nothing below it can be in the head). */
        this.bottom = Math.min(...points.map((p) => p.y)) - 0.02;

        const d = new THREE.Vector3();

        for (const point of points) {
            d.copy(point).sub(centre);

            const [a, e] = this.#bin(d);
            const i = Math.round(e) * AROUND + (Math.round(a) % AROUND);

            this.radii[i] = Math.max(this.radii[i], d.length());
        }

        // Fill directions no vertex fell in from their neighbours
        for (let pass = 0; pass < 8; pass++) {
            for (let e = 0; e < UPDOWN; e++) {
                for (let a = 0; a < AROUND; a++) {
                    const i = e * AROUND + a;

                    if (!this.radii[i]) {
                        const around = [[a - 1, e], [a + 1, e], [a, e - 1], [a, e + 1]]
                            .filter(([, ee]) => ee >= 0 && ee < UPDOWN)
                            .map(([aa, ee]) => this.radii[ee * AROUND + ((aa + AROUND) % AROUND)])
                            .filter(Boolean);

                        if (around.length) {
                            this.radii[i] = around.reduce((sum, r) => sum + r, 0) / around.length;
                        }
                    }
                }
            }
        }
    }

    /** A direction's position in the table (fractional): [around, up/down]. */
    #bin(direction) {
        const { AROUND, UPDOWN } = HeadShape;
        const length = direction.length() || 1;
        const around = ((Math.atan2(direction.x, direction.z) / (2 * Math.PI) + 1) % 1) * AROUND;
        const updown = ((Math.asin(Math.max(-1, Math.min(1, direction.y / length))) / Math.PI) + 0.5) * (UPDOWN - 1);

        return [around, updown];
    }

    /** The head's radius in a direction. */
    radius(direction) {
        const { AROUND } = HeadShape;
        const [a, e] = this.#bin(direction);
        const a0 = Math.floor(a);
        const e0 = Math.floor(e);
        const fa = a - a0;
        const fe = e - e0;
        const at = (aa, ee) => this.radii[Math.min(HeadShape.UPDOWN - 1, ee) * AROUND + (aa % AROUND)];

        return (at(a0, e0) * (1 - fa) + at(a0 + 1, e0) * fa) * (1 - fe) + (at(a0, e0 + 1) * (1 - fa) + at(a0 + 1, e0 + 1) * fa) * fe;
    }

    /** Push a point out to `margin` above the head's surface. */
    pushOut(point, margin) {
        const d = point.clone().sub(this.centre);
        const length = d.length();
        const needed = this.radius(d) + margin;

        if (length < needed && length > 1e-6) {
            point.copy(this.centre).addScaledVector(d, needed / length);
        }
    }
}

/** An ellipsoid (centre, radii) fitted to the vertices mostly moved by some bones. */
function fitEllipsoid(human, positions, bones, grow = 1) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && bones.has(human.skinIndices[v * 4])) {
            for (let k = 0; k < 3; k++) {
                min[k] = Math.min(min[k], positions[v * 3 + k]);
                max[k] = Math.max(max[k], positions[v * 3 + k]);
            }
        }
    }

    return {
        centre: new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2),
        radii: new THREE.Vector3(((max[0] - min[0]) / 2) * grow, ((max[1] - min[1]) / 2) * grow, ((max[2] - min[2]) / 2) * grow),
    };
}

/** Push a point out of an ellipsoid (with a margin). */
function pushOutOfEllipsoid(point, { centre, radii }, margin) {
    const x = (point.x - centre.x) / (radii.x + margin);
    const y = (point.y - centre.y) / (radii.y + margin);
    const z = (point.z - centre.z) / (radii.z + margin);
    const d = Math.hypot(x, y, z);

    if (d < 1 && d > 1e-6) {
        point.set(centre.x + (x / d) * (radii.x + margin), centre.y + (y / d) * (radii.y + margin), centre.z + (z / d) * (radii.z + margin));
    }
}

// The body hair hangs over: the neck, shoulders (and the tops of the arms), chest and back
const BODY_BONES = new Set(["Neck", "Spine2", "Spine1", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm"]);

/**
 * The body under long hair, as its skin's points and normals (`include(v, bone)`: which), in a
 * grid, for hanging hair to lie over: pushed out along the nearest point's normal.
 */
class BodyShape {
    static CELL = 0.025;

    constructor(human, positions, normals, include) {
        const C = BodyShape.CELL;
        const chosen = [];
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] === 0 && include(v, human.skinIndices[v * 4])) {
                chosen.push(v);

                for (let k = 0; k < 3; k++) {
                    min[k] = Math.min(min[k], positions[v * 3 + k]);
                    max[k] = Math.max(max[k], positions[v * 3 + k]);
                }
            }
        }

        this.normal = new THREE.Vector3();

        /** Its highest point's height (nothing above it can touch it), with room to spare. */
        this.top = max[1] + C * 2;

        // A grid over it (a cell's points and normals packed together, cell by cell)
        this.origin = min.map((m) => m - C * 2);
        this.size = min.map((m, k) => Math.ceil((max[k] - m) / C) + 5);

        const cellOf = (v) => this.#cell(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        const counts = new Uint32Array(this.size[0] * this.size[1] * this.size[2] + 1);

        for (const v of chosen) {
            counts[cellOf(v) + 1]++;
        }

        for (let c = 1; c < counts.length; c++) {
            counts[c] += counts[c - 1];
        }

        this.starts = counts.slice();
        this.points = new Float32Array(chosen.length * 6);

        const fill = counts.slice();

        for (const v of chosen) {
            const at = fill[cellOf(v)]++ * 6;

            for (let k = 0; k < 3; k++) {
                this.points[at + k] = positions[v * 3 + k];
                this.points[at + 3 + k] = normals[v * 3 + k];
            }
        }
    }

    // A point's cell's number (-1 outside the grid)
    #cell(x, y, z) {
        const C = BodyShape.CELL;
        const [sx, sy, sz] = this.size;
        const i = Math.floor((x - this.origin[0]) / C);
        const j = Math.floor((y - this.origin[1]) / C);
        const k = Math.floor((z - this.origin[2]) / C);

        return i < 0 || j < 0 || k < 0 || i >= sx || j >= sy || k >= sz ? -1 : (i * sy + j) * sz + k;
    }

    /**
     * Push a point out to `margin` above the body's skin: a smooth surface through the skin's
     * points within a few centimetres (their average, weighted to the nearest, and its normal).
     * Returns that normal if it was pushed (touching the body), else null.
     */
    pushOut(point, margin) {
        const C = BodyShape.CELL;
        const reach2 = (C * 1.4) ** 2;
        const [sx, sy, sz] = this.size;
        const { points, starts } = this;
        const i0 = Math.floor((point.x - this.origin[0]) / C);
        const j0 = Math.floor((point.y - this.origin[1]) / C);
        const k0 = Math.floor((point.z - this.origin[2]) / C);
        let weights = 0;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        let nx = 0;
        let ny = 0;
        let nz = 0;

        if (i0 < 1 || j0 < 1 || k0 < 1 || i0 >= sx - 1 || j0 >= sy - 1 || k0 >= sz - 1) {
            return null;
        }

        for (let i = i0 - 1; i <= i0 + 1; i++) {
            for (let j = j0 - 1; j <= j0 + 1; j++) {
                const row = (i * sy + j) * sz;

                for (let a = starts[row + k0 - 1] * 6, end = starts[row + k0 + 2] * 6; a < end; a += 6) {
                    const d2 = (points[a] - point.x) ** 2 + (points[a + 1] - point.y) ** 2 + (points[a + 2] - point.z) ** 2;

                    if (d2 < reach2) {
                        const w = (1 - d2 / reach2) ** 2;

                        weights += w;
                        cx += points[a] * w;
                        cy += points[a + 1] * w;
                        cz += points[a + 2] * w;
                        nx += points[a + 3] * w;
                        ny += points[a + 4] * w;
                        nz += points[a + 5] * w;
                    }
                }
            }
        }

        if (weights < 1e-6) {
            return null;
        }

        const n = this.normal.set(nx, ny, nz).normalize();
        const above = (point.x - cx / weights) * n.x + (point.y - cy / weights) * n.y + (point.z - cz / weights) * n.z;

        if (above >= margin) {
            return null;
        }

        point.addScaledVector(n, margin - above);

        return n;
    }
}

/**
 * Keep hair clear of the face (a point, moved if it's in front of it): out to the side of it,
 * past the cheeks, from the brows to below the chin.
 */
function clearOfFace(face, point) {
    const [x, y, z] = face.toFace(point.x, point.y, point.z);
    const half = 0.068 - 0.02 * smoothstep(-0.05, -0.13, y);

    if (z > -0.035 && y < 0.035 && y > -0.17 && Math.abs(x) < half) {
        const [nx] = face.fromFace((Math.sign(x) || 1) * half, y, z);

        point.x = nx;
    }
}

/** Random points on triangles (area-weighted), with the triangles' normals. */
function sampleSurface(positions, triangles, count, next) {
    const areas = [];
    let total = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let t = 0; t < triangles.length; t += 3) {
        a.fromArray(positions, triangles[t] * 3);
        b.fromArray(positions, triangles[t + 1] * 3);
        c.fromArray(positions, triangles[t + 2] * 3);
        total += b.sub(a).cross(c.sub(a)).length() / 2;
        areas.push(total);
    }

    const points = [];

    for (let s = 0; s < count && total > 0; s++) {
        const pick = next() * total;
        let low = 0;
        let high = areas.length - 1;

        while (low < high) {
            const mid = (low + high) >> 1;

            if (areas[mid] < pick) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        const t = low * 3;
        let u = next();
        let v = next();

        if (u + v > 1) {
            u = 1 - u;
            v = 1 - v;
        }

        a.fromArray(positions, triangles[t] * 3);
        b.fromArray(positions, triangles[t + 1] * 3);
        c.fromArray(positions, triangles[t + 2] * 3);

        const point = a.clone().multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();

        points.push({ point, normal });
    }

    return points;
}

/**
 * A style with fewer, wider strands of fewer segments, `detail` (0 to 1) of the full count: seen
 * from further away, it looks the same for a fraction of the triangles.
 */
function thinned(style, detail) {
    if (detail >= 1 || !style.strands) {
        return style;
    }

    // (Short hair keeps more of its strands: they're only a few triangles each)
    detail = Math.min(1, Math.max(detail, style.length < 0.1 ? 0.4 : 0));

    const fewer = (count) => Math.max(24, Math.round(count * detail));
    const wider = (width) => width / Math.sqrt(Math.max(detail, 0.15));

    return {
        ...style,
        strands: fewer(style.strands),
        width: wider(style.width),
        segments: Math.max(Math.min(style.segments, 5), Math.round(style.segments * (0.5 + 0.5 * detail))),
        tail: style.tail && { ...style.tail, strands: fewer(style.tail.strands), width: wider(style.tail.width) },
        tails: style.tails && { ...style.tails, strands: fewer(style.tails.strands), width: wider(style.tails.width) },
    };
}

/**
 * Build a character's hair and beard as one geometry, to skin to its rig (or null for none).
 * `character` is a Character; `style` and `beard` are keys of HAIRSTYLES and BEARDS. Under a
 * hat or helmet, `below` keeps only the hair growing below that height (face coordinates).
 * `detail` (0 to 1) thins the hair out for characters seen from afar.
 */
export function buildHair(character, style, beard, options) {
    return allAtOnce(growingHair(character, style, beard, options));
}

// How many strands growingHair grows a step
const STRANDS_A_STEP = 24;

/** The same (buildHair), grown a step at a time (each a yield: a few dozen strands), returning it. */
export function* growingHair(character, style = "short", beard = "none", { seed = 1, below = Infinity, detail = 1 } = {}) {
    const human = character.human;
    const positions = character.positions;
    const rig = character.rig;
    const hair = thinned(HAIRSTYLES[style] ?? HAIRSTYLES.short, detail);
    const whiskers = thinned(BEARDS[beard] ?? BEARDS.none, detail);

    if (!hair.strands && !whiskers.strands) {
        return null;
    }

    const next = random(seed);
    const face = faceFrame(human, positions);
    const at = (x, y, z) => new THREE.Vector3(...face.fromFace(x, y, z));
    const headBones = new Set([rig.index.get("Head")]);
    const headTriangles = character.sourceTriangles("body", headBones);
    const headPoints = [];

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && headBones.has(human.skinIndices[v * 4])) {
            headPoints.push(new THREE.Vector3().fromArray(positions, v * 3));
        }
    }

    const head = new HeadShape(at(0, 0.01, HEAD_CENTRE_Z), headPoints);
    const neck = fitEllipsoid(human, positions, new Set([rig.index.get("Neck")]), 0.92);
    const shoulders = rig.heads[rig.index.get("LeftArm")].y;
    const body = new BodyShape(human, positions, character.normals ?? human.normals(positions), (v, bone) => BODY_BONES.has(human.bones[bone].name) && (!/Arm$/.test(human.bones[bone].name) || positions[v * 3 + 1] > shoulders - 0.06));

    // Hair is kept off the head, the body under it (the neck, shoulders, chest and back: it lies
    // over them) and the face (framing it, never across it)
    const keepOut = (point, margin) => {
        if (point.y > head.bottom) {
            head.pushOut(point, margin);
        }

        const touching = point.y < body.top ? body.pushOut(point, margin + 0.002) : null;

        clearOfFace(face, point);

        return touching;
    };
    const builder = new CardBuilder(rig, next);

    // Hanging hair faces out from the head, turning to face out from the body (round the neck)
    // as it falls past the jaw, and out of the body a little where it lies on it
    const neckAxis = at(0, 0, HEAD_CENTRE_Z);
    const jaw = at(0, -0.12, 0).y;
    const hangingFacing = (point, touching) => {
        const fromHead = point.clone().sub(head.centre).normalize();
        const fromNeck = new THREE.Vector3(point.x - neckAxis.x, 0, point.z - neckAxis.z).normalize();
        const facing = fromHead.lerp(fromNeck, smoothstep(jaw + 0.04, jaw - 0.08, point.y));

        return (touching ? facing.addScaledVector(touching, 0.5) : facing).normalize();
    };

    // Where the hair's crown whorl, topknot and ponytail tie are
    const crown = at(0, 0.1, -0.11);
    const knot = at(0, 0.145, -0.085);
    const tie = at(0, 0.035, -0.17);
    const ties = { [-1]: at(-0.085, 0.07, -0.11), 1: at(0.085, 0.07, -0.11) };

    // A ponytail, twin tails or a topknot can't come out of a helmet
    const gathered = below < Infinity && (hair.tail || hair.tails || hair.knot);

    if (hair.strands && !gathered) {
        const candidates = sampleSurface(positions, headTriangles, hair.strands * 8, next).filter(({ point, normal }) => {
            const [x, y, z] = face.toFace(point.x, point.y, point.z);
            const outward = point.clone().sub(head.centre);

            // Only on the outside of the head (not inside the mouth), facing out
            if (outward.length() < head.radius(outward) * 0.9 || normal.dot(outward.normalize()) < 0.2) {
                return false;
            }

            if (hair.strip && Math.abs(x) > hair.strip * (1 + 0.5 * smoothstep(0.08, -0.05, z))) {
                return false;
            }

            return y < below && aboveHairline(x, y, z, hair.raise ?? 0) > 0.002 && nearEar(x, y, z) < 0.5;
        });
        const roots = candidates.slice(0, hair.strands);

        // Parted hair starts right at the parting, and falls away from it either side: roots all
        // along it, a hair's breadth either side, so it's a thin line, not a bald strip
        if (hair.flow === "part") {
            const count = Math.max(30, Math.round(hair.strands * 0.12));

            for (let n = 0; n < count; n++) {
                const z = PARTING_ENDS + (0.08 - PARTING_ENDS) * ((n + next()) / count);
                const out = at((n % 2 ? 1 : -1) * PARTING, 0.12, z).sub(head.centre).normalize();
                const point = head.centre.clone().addScaledVector(out, head.radius(out));
                const [x, y, fz] = face.toFace(point.x, point.y, point.z);

                if (aboveHairline(x, y, fz) > 0.002) {
                    roots.push({ point, normal: out });
                }
            }
        }

        for (const [n, { point, normal }] of roots.entries()) {
            if (n % STRANDS_A_STEP === 0) {
                yield;
            }

            const outward = point.clone().sub(head.centre).normalize();
            const along = (direction) => direction.addScaledVector(outward, -direction.dot(outward)).normalize();
            const [x, y, z] = face.toFace(point.x, point.y, point.z);

            // Which side it's on (at the parting, either); and whether it's one of the bangs (twin
            // tails' fringe: the front of the hairline, over the forehead)
            const side = Math.abs(x) > 0.0005 ? Math.sign(x) : next() < 0.5 ? -1 : 1;
            const bang = Boolean(hair.bangs) && aboveHairline(x, y, z) < 0.03 && Math.abs(Math.atan2(x, z - HEAD_CENTRE_Z)) < 0.65;
            let direction;

            switch (hair.flow) {
                case "crown":
                    // Radiating from the whorl, forward over the forehead
                    direction = along(point.clone().sub(crown).add(new THREE.Vector3(0, -0.02, 0)));
                    break;
                case "back":
                    direction = along(new THREE.Vector3(Math.sign(x) * 0.15, -0.1 + 0.4 * smoothstep(0.05, 0.08, y), -1));
                    break;
                case "part":
                    // Straight off a parting down the middle of the top of the head, to either
                    // side, then down; behind the crown, where there's no parting, straight down
                    // the back of the head
                    direction = along(new THREE.Vector3(side * smoothstep(PARTING_ENDS - 0.03, PARTING_ENDS + 0.02, z), -0.5, -0.35 + 0.2 * smoothstep(0.03, 0.07, y)));
                    break;
                case "tail":
                    direction = along(tie.clone().sub(point));
                    break;
                case "twin":
                    // Drawn back to the tie on its side; or, at the front of the hairline, a bang
                    // falling over the forehead
                    direction = bang ? along(new THREE.Vector3(side * 0.12, -1, 0.3)) : along(ties[side].clone().sub(point));
                    break;
                case "knot":
                    direction = along(knot.clone().sub(point));
                    break;
                default:
                    // Standing up off the scalp, leaning up and back (a crest)
                    direction = outward.clone().add(new THREE.Vector3(0, 0.6, -0.3)).normalize();
            }

            // Below the head's widest point, where it hangs from the start, downhill
            if (!hair.stands && !hair.tail && !hair.knot && !(hair.tails && !bang)) {
                direction.lerp(along(new THREE.Vector3(0, -1, 0)), smoothstep(-0.02, -0.3, outward.y)).normalize();
            }

            // Combed: neighbouring strands turn the same way (a little, as a comb leaves them),
            // each only a touch its own
            const swirl = (valueNoise(point.x * 40 + 11, point.y * 40, point.z * 40) - 0.5) * 0.6 + (next() - 0.5) * 0.08;

            direction.applyAxisAngle(outward, swirl).addScaledVector(outward, hair.lift).normalize();

            // Each strand lies in its own layer, the outer ones further off the scalp
            const layer = next();
            const lie = (k) => 0.002 + hair.volume * layer * Math.min(1, k * 4);
            const stop = hair.flow === "knot" ? knot : hair.flow === "tail" ? tie : hair.flow === "twin" && !bang ? ties[side] : null;
            const start = point.clone().addScaledVector(normal.dot(outward) > 0 ? normal : outward, 0.001);
            // (Cut hair ends at its hem; a bang at the brows, however low the forehead runs under
            // the hairline)
            const hem = hair.hem ? at(0, hemAt(hair.hem, z) + (next() - 0.5) * 2 * hair.ragged, 0).y : bang ? at(0, BROWS, 0).y : null;
            const points = grow(start, direction, {
                // (Uncut hair growing low on the head, round the ears and at the nape, is shorter)
                length: bang ? hair.bangs * (0.85 + 0.3 * next()) : hair.length * (hem === null && !stop ? (0.9 + 0.2 * next()) * (0.4 + 0.6 * smoothstep(-0.3, 0, outward.y)) : 1),
                segments: hair.segments,
                bend: hair.gravity,
                head: hair.stands ? null : head,
                lie,
                keepOut: (p, k) => keepOut(p, lie(k)),
                drape: new THREE.Vector3(0, -1, z > EAR[2] + 0.02 ? 0.7 : -0.7),
                around: hangingFacing,
                onFace: (p) => {
                    const [fx, fy, fz] = face.toFace(p.x, p.y, p.z);

                    // (A bang falls over the forehead, to the brows)
                    return aboveHairline(fx, fy, fz) < -((bang ? hair.bangs : hair.fringe) ?? 0) && Math.abs(Math.atan2(fx, fz - HEAD_CENTRE_Z)) < 1.2;
                },
                aside: () => at(side, 0, -0.4).sub(at(0, 0, 0)),
                stop,
                hem,
            });

            builder.strand(points, hair.width, (p) => p.clone().sub(head.centre).normalize(), layer);
        }

        if (hair.tail) {
            addTail(builder, hair.tail, tie, keepOut, next, detail);
        }

        for (const side of hair.tails ? [-1, 1] : []) {
            addTail(builder, hair.tails, ties[side], keepOut, next, detail, new THREE.Vector3(side * 0.55, -0.6, -0.55).normalize());
        }

        if (hair.knot) {
            addKnot(builder, knot, next, face.scale, detail);
        }
    }

    if (whiskers.strands) {
        const roots = sampleSurface(positions, headTriangles, whiskers.strands * 6, next).filter(({ point }) => {
            const [x, y, z] = face.toFace(point.x, point.y, point.z);

            if (whiskers.goatee && (Math.abs(x) > 0.024 || y > -0.045)) {
                return false;
            }

            // Not on the lips
            const onLips = Math.abs(x) < 0.027 && y < -0.056 && y > -0.081 && z > 0.015;

            return !onLips && beardAmount(x, y, z) > 0.6;
        }).slice(0, whiskers.strands);

        for (const [n, { point, normal }] of roots.entries()) {
            if (n % STRANDS_A_STEP === 0) {
                yield;
            }

            const down = new THREE.Vector3(0, -1, 0.1);
            const direction = down.addScaledVector(normal, -down.dot(normal)).normalize().addScaledVector(normal, whiskers.lift);

            direction.add(new THREE.Vector3((next() - 0.5) * 0.3, 0, (next() - 0.5) * 0.3)).normalize();

            const layer = next();
            const surface = normal.clone();
            const points = grow(point.clone().addScaledVector(normal, 0.001), direction, {
                length: whiskers.length * (0.8 + 0.4 * next()),
                segments: whiskers.segments,
                bend: whiskers.gravity,
                keepOut: (p, k) => {
                    // Keep off the face: no nearer the face than the root, along its normal
                    const above = p.clone().sub(point).dot(surface);
                    const wanted = 0.001 + whiskers.volume * layer * Math.min(1, k * 2);

                    if (above < wanted) {
                        p.addScaledVector(surface, wanted - above);
                    }

                    pushOutOfEllipsoid(p, neck, 0.004);
                },
            });

            builder.strand(points, whiskers.width, () => surface, layer);
        }
    }

    yield;

    return builder.build();
}

/**
 * Grow a strand from `root`, setting off in `direction`: in fine steps (a few millimetres), so it
 * follows the curve of the head, then resampled to `segments` (keeping more points where it
 * bends). While it's over the upper half of the head (where the scalp faces up), it lies on it,
 * `lie(k)` above the scalp (k: 0 at the root, 1 at the tip), combed along it, and turned
 * `aside()` (to the side and back) rather than down over the face (`onFace(point)`); below the
 * head's widest point, it hangs, bending down under gravity (`bend`, per metre) and kept off the
 * head and body (`keepOut`, which returns the body's normal where it touches it), draping over
 * the body the way `drape` says. It ends after `length`, or at the height `hem` (cut hair), or at
 * `stop` (a tie or knot), drawn towards it. Without a `head` (hair standing up), it never lies.
 */
function grow(root, direction, { length, segments, bend = 0, head = null, lie = () => 0.002, keepOut = () => null, drape = null, around = null, onFace = () => false, aside = null, stop = null, hem = null }) {
    const heading = direction.clone();
    const point = root.clone();
    const out = new THREE.Vector3();
    let lying = Boolean(head);

    // Which way the card faces at each point: off the scalp where it lies on the head, off the
    // body where it touches it, and as it last did where it hangs free
    let facing = head ? root.clone().sub(head.centre).normalize() : null;
    const points = [Object.assign(root.clone(), { facing })];
    let grown = 0;

    while (grown < length) {
        // Down to the head's widest point, it lies on the head; below it, it hangs. Hair drawn
        // to a tie or knot lies on the head all the way, pulled taut, until it's nearly there
        if (lying) {
            out.copy(point).sub(head.centre).normalize();
            lying = stop ? point.distanceTo(stop) > 0.035 : out.y > -0.05;
        }

        // (Finer steps over the head, where it curves)
        const step = Math.min(lying ? FINE_STEP : FINE_STEP * 1.6, length - grown + 1e-6);
        const k = Math.min(1, (grown += step) / length);

        heading.y -= bend * step;

        if (stop) {
            const distance = point.distanceTo(stop);

            if (distance < step * 1.5) {
                points.push(Object.assign(stop.clone(), { facing }));
                break;
            }

            // Drawn to it, and straight to it once near
            heading.lerp(stop.clone().sub(point).normalize(), distance < 0.04 ? 1 : 0.25);
        }

        if (lying) {
            heading.addScaledVector(out, -heading.dot(out));
        }

        heading.normalize();

        const previous = point.clone();

        point.addScaledVector(heading, step);

        if (lying) {
            out.copy(point).sub(head.centre);
            point.copy(head.centre).addScaledVector(out.normalize(), head.radius(out) + lie(k));

            // Not down over the face: along the hairline instead, to the side and back (or, if
            // that's still over it, straight back)
            if (aside && onFace(point)) {
                out.copy(previous).sub(head.centre).normalize();

                for (const away of [aside(), aside().setX(0)]) {
                    heading.copy(away).addScaledVector(out, -away.dot(out)).normalize();
                    point.copy(previous).addScaledVector(heading, step);

                    const lift = point.clone().sub(head.centre);

                    point.copy(head.centre).addScaledVector(lift.normalize(), head.radius(lift) + lie(k));

                    if (!onFace(point)) {
                        break;
                    }
                }
            }

            facing = point.clone().sub(head.centre).normalize();
        }

        // Touching the body, it drapes over it (down it, and straight forward or back over a
        // shoulder), not carried on out the way it was pushed
        const touching = keepOut(point, k);

        if (!lying && around) {
            facing = around(point, touching);
        }

        if (touching && drape) {
            heading.copy(drape).addScaledVector(touching, -drape.dot(touching));
            heading.x *= 0.25;
            heading.normalize();
        } else {
            heading.copy(point).sub(previous).normalize();
        }

        points.push(Object.assign(point.clone(), { hanging: !lying, facing }));

        if (hem !== null && point.y < hem) {
            break;
        }
    }

    // Smoothed where it hangs (no kinks where it meets the body), still kept off it
    for (let pass = 0; pass < 3; pass++) {
        for (let k = 1; k < points.length - 1; k++) {
            if (points[k].hanging) {
                const { hanging } = points[k];
                let { facing: faces } = points[k];

                points[k].lerp(points[k - 1].clone().add(points[k + 1]).multiplyScalar(0.5), 0.5);
                const touching = keepOut(points[k], k / (points.length - 1));

                faces = around ? around(points[k], touching) : faces;
                Object.assign(points[k], { hanging, facing: faces });
            }
        }
    }

    return resample(points, segments);
}

// Strands are grown in steps this long (metres), then resampled
const FINE_STEP = 0.005;

// How low a bang falls at most (face coordinates' height: the brows)
const BROWS = 0.03;

// A parting: how near the middle (face coordinates) its roots are, and where it ends behind (at
// the crown)
const PARTING = 0.0015;
const PARTING_ENDS = -0.105;

/** Where cut hair ends (face coordinates' height), from its hem at the back and the front, by how far forward its root is. */
const hemAt = ([back, front], z) => back + (front - back) * smoothstep(-0.14, -0.02, z);

/**
 * A polyline resampled to `count` segments, spaced evenly by length and by how much it turns, so
 * bends keep more of the points.
 */
function resample(points, count) {
    if (points.length <= count + 1) {
        return points;
    }

    const measure = [0];
    const length = points.reduce((sum, p, k) => sum + (k ? p.distanceTo(points[k - 1]) : 0), 0) || 1;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    for (let k = 1; k < points.length; k++) {
        const turn = k > 1 ? a.subVectors(points[k], points[k - 1]).angleTo(b.subVectors(points[k - 1], points[k - 2])) : 0;

        measure.push(measure[k - 1] + points[k].distanceTo(points[k - 1]) / length + turn / Math.PI);
    }

    const total = measure.at(-1);
    const out = [points[0].clone()];
    let k = 1;


    for (let n = 1; n < count; n++) {
        const target = (n / count) * total;

        while (measure[k] < target) {
            k++;
        }

        const t = (target - measure[k - 1]) / (measure[k] - measure[k - 1] || 1);
        const [a, b] = [points[k - 1].facing, points[k].facing];

        out.push(Object.assign(points[k - 1].clone().lerp(points[k], t), { facing: a && b ? a.clone().lerp(b, t).normalize() : a ?? b }));
    }

    out.push(Object.assign(points.at(-1).clone(), { facing: points.at(-1).facing }));
    out[0].facing = points[0].facing;

    return out;
}

/**
 * A ponytail: a round bundle of strands from a tie at the back of the head, hanging down the
 * back. It's gathered tight at the tie, full a third of the way down (`radius`), tapering to its
 * ends; its middle falls back and down under gravity, clear of the head and back by its own
 * thickness, and the strands lie round it, each facing out from it, turning a little down it.
 */
function addTail(builder, tail, tie, keepOut, next, detail = 1, start = new THREE.Vector3(0, -0.6, -0.8).normalize()) {
    const segments = Math.max(6, Math.round(12 * (0.4 + 0.6 * Math.min(1, detail))));
    const radius = (t) => tail.radius * (0.3 + 0.7 * smoothstep(0, 0.3, t) - 0.45 * smoothstep(0.35, 1, t));

    // Its middle, from the tie
    const axis = grow(tie.clone(), start, {
        length: tail.length,
        segments: 24,
        bend: 16,
        keepOut: (p, k) => keepOut(p, radius(k) + 0.004),
    });
    const lengths = [0];

    for (let k = 1; k < axis.length; k++) {
        lengths.push(lengths[k - 1] + axis[k].distanceTo(axis[k - 1]));
    }

    // Where along it a point is (t, 0 at the tie to 1 at the end): its middle there, which way it
    // runs, and two directions across it
    const along = (t) => {
        const target = t * lengths.at(-1);
        let k = 1;

        while (k < axis.length - 1 && lengths[k] < target) {
            k++;
        }

        const u = (target - lengths[k - 1]) / (lengths[k] - lengths[k - 1] || 1);
        const middle = axis[k - 1].clone().lerp(axis[k], u);
        const tangent = axis[k].clone().sub(axis[k - 1]).normalize();
        const across = new THREE.Vector3(1, 0, 0).addScaledVector(tangent, -tangent.x).normalize();

        return { middle, across, up: new THREE.Vector3().crossVectors(tangent, across) };
    };

    const strands = Math.max(80, Math.round(tail.strands * Math.min(1, detail)));
    const width = tail.width / Math.sqrt(Math.max(Math.min(1, detail), 0.3));

    for (let s = 0; s < strands; s++) {
        // Round it (mostly near its outside, where it's seen), each ending a little short of the
        // longest
        const angle = next() * Math.PI * 2;
        const out = 0.45 + 0.55 * Math.sqrt(next());
        const end = 0.82 + 0.18 * next();
        const twist = (next() - 0.5) * 0.5;
        const points = [];

        for (let k = 0; k <= segments; k++) {
            const t = (k / segments) * end;
            const { middle, across, up } = along(t);
            const turn = angle + twist * t;
            const facing = across.clone().multiplyScalar(Math.cos(turn)).addScaledVector(up, Math.sin(turn));

            points.push(Object.assign(middle.addScaledVector(facing, radius(t) * out), { facing }));
        }

        builder.strand(points, width, (p) => p.facing, 0.35 + 0.65 * out);
    }
}

/** A topknot: a bun of short curled strands on top of the head. */
function addKnot(builder, centre, next, scale, detail = 1) {
    const radius = 0.026 * scale;
    const strands = Math.max(30, Math.round(140 * Math.min(1, detail)));
    const width = (0.018 * scale) / Math.sqrt(Math.max(Math.min(1, detail), 0.15));

    for (let s = 0; s < strands; s++) {
        const angle = next() * Math.PI * 2;
        const height = (next() - 0.35) * radius * 1.2;
        const points = [];

        for (let k = 0; k <= 6; k++) {
            const a = angle + (k / 6) * 2.4;
            const r = radius * Math.sqrt(Math.max(0.15, 1 - (height / radius) ** 2));

            points.push(new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + radius * 0.7 + height, centre.z + Math.sin(a) * r));
        }

        builder.strand(points, width, (p) => p.clone().sub(centre).normalize(), next());
    }
}

/** Collects strands as cards and builds the skinned geometry. */
class CardBuilder {
    constructor(rig, next) {
        this.next = next;
        this.positions = [];
        this.normals = [];
        this.colours = [];
        this.uvs = [];
        this.skinIndices = [];
        this.skinWeights = [];
        this.indices = [];
        this.head = rig.index.get("Head");
        this.neck = rig.index.get("Neck");
        this.chest = rig.index.get("Spine2");
        this.headY = rig.heads[this.head].y;
        this.neckY = rig.heads[this.neck].y;
    }

    /**
     * Add a strand (points from root to tip) as a card `width` wide, lying on the surface whose
     * normal at a point is `normalAt(point)`. `layer` (0 to 1): inner layers are darker.
     */
    strand(points, width, normalAt, layer = 0.5) {
        const first = this.positions.length / 3;
        const count = points.length;
        const u = this.next() < 0.5 ? 0 : 0.5;
        const shade = (0.8 + 0.35 * this.next()) * (0.8 + 0.2 * layer);
        const side = new THREE.Vector3();
        const along = new THREE.Vector3();

        if (count < 2) {
            return;
        }

        // How far along the strand each point is (0 at the root, 1 at the tip), by length
        const along0 = [0];

        for (let k = 1; k < count; k++) {
            along0.push(along0[k - 1] + points[k].distanceTo(points[k - 1]));
        }

        points.forEach((point, k) => {
            const t = along0[k] / (along0.at(-1) || 1);
            const normal = (point.facing ?? normalAt(point)).clone();

            // The card faces out at right angles to the strand (or, for a strand standing
            // straight out, to the side, so it's seen edge on from the front, like a crest)
            along.copy(points[Math.min(count - 1, k + 1)]).sub(points[Math.max(0, k - 1)]).normalize();
            normal.addScaledVector(along, -normal.dot(along));

            if (normal.lengthSq() < 0.09) {
                normal.set(1, 0, 0).addScaledVector(along, -along.x);
            }

            normal.normalize();
            side.crossVectors(along, normal).normalize();

            const half = (width / 2) * (1 - 0.45 * t);

            // Darker at the roots, where less light gets in
            const light = shade * (0.65 + 0.35 * smoothstep(0, 0.35, t));

            for (const s of [-1, 1]) {
                this.positions.push(point.x + side.x * half * s, point.y + side.y * half * s, point.z + side.z * half * s);
                this.normals.push(normal.x, normal.y, normal.z);
                this.colours.push(light, light, light);
                this.uvs.push(u + (s > 0 ? 0.5 : 0), 1 - t);

                // Skinned to the head, handing over to the neck and chest lower down
                const toHead = smoothstep(this.neckY - 0.02, this.headY + 0.02, point.y);
                const toNeck = (1 - toHead) * smoothstep(this.neckY - 0.12, this.neckY, point.y);
                const weights = [[this.head, toHead], [this.neck, toNeck], [this.chest, Math.max(0, 1 - toHead - toNeck)]].sort((a, b) => b[1] - a[1]);
                const bytes = weights.map(([, w]) => Math.round(w * 255));

                bytes[0] += 255 - bytes[0] - bytes[1] - bytes[2];
                this.skinIndices.push(weights[0][0], weights[1][0], weights[2][0], 0);
                this.skinWeights.push(bytes[0], bytes[1], bytes[2], 0);
            }

            if (k > 0) {
                const a = first + (k - 1) * 2;

                this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            }
        });
    }

    build() {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colours, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
        geometry.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint8Array(this.skinIndices), 4));
        geometry.setAttribute("skinWeight", new THREE.BufferAttribute(new Uint8Array(this.skinWeights), 4, true));
        geometry.setIndex(this.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));

        return geometry;
    }
}
