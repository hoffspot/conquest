// Head-wear fitted to the head it's on: the head measured all round from where head-wear sits (the
// skull without its ears, and with them), the line each kind of head-wear's rim follows round it
// (low at the back, over the ears, just above the brows), and plates grown over the head between
// lines like it, a lining's room off it (items.js builds helms, caps, coifs and hats of them).
//
// Directions are measured from the head's middle (equipment.js: where head-wear sits): `around`
// (radians) from straight ahead towards the character's left, `up` (radians) from level.

import * as THREE from "three";
import { HEAD_CENTRE_Z } from "./face.js";
import { lerpTable, smoothstep } from "./noise.js";

// The table of the head's reach: how many directions round it and up and down, and the lowest
// (radians below level: down past the jaw and the nape, for cheek guards and neck guards)
const AROUND = 48;
const UPDOWN = 34;
const LOW = -1.35;

// How far a body's ear is from where its ear-moving shape puts it to count as ear (that shape
// lifts the whole ear 2 cm; the skin round its root, less)
const EAR_MOVED = 0.012;
// How far below the top of where an ear joins the head its join counts as near the top (metres)
const EAR_TOP = 0.02;
const ears = new WeakMap();

// The vertices of a body's ears (its "ears set high" shapes move them all together)
function earVertices(human) {
    if (!ears.has(human)) {
        const set = new Set();

        for (const name of ["ears/l-ear-trans-up", "ears/r-ear-trans-up"]) {
            const target = human.details?.get(name);

            for (let i = 0; target && i < target.vertices.length; i++) {
                const moved = Math.hypot(target.deltas[i * 3], target.deltas[i * 3 + 1], target.deltas[i * 3 + 2]) * human.deltaUnit;

                if (moved > EAR_MOVED) {
                    set.add(target.vertices[i]);
                }
            }
        }

        ears.set(human, set);
    }

    return ears.get(human);
}

/**
 * A character's head as head-wear fits it, from the head's middle (`middle`, metres, where
 * head-wear sits) and its face's frame (`face`: face.js faceFrame): how far its skin reaches in
 * each direction, without its ears (`skull`) and with them (`whole`); heights in face coordinates
 * to heights from the middle (`heights`: [[face, local]...]); and where its ears meet it (`ears`:
 * the top of where they join it, a height from the middle, and the angles round the head they
 * join it between, radians), or null. Plain data, for buildItem's `fit` (HeadMap reads it).
 */
export function measureHead(character, middle, face) {
    const { human, positions, rig } = character;
    const earSet = earVertices(human);
    const bones = new Set([rig.index.get("Head"), rig.index.get("Neck")]);
    const skull = new Float32Array(AROUND * UPDOWN);
    const whole = new Float32Array(AROUND * UPDOWN);
    const ear = [];
    const d = new THREE.Vector3();

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] !== 0 || !bones.has(human.skinIndices[v * 4])) {
            continue;
        }

        d.set(positions[v * 3] - middle.x, positions[v * 3 + 1] - middle.y, positions[v * 3 + 2] - middle.z);

        const length = d.length();
        const up = Math.asin(Math.max(-1, Math.min(1, d.y / (length || 1))));

        if (up < LOW || length > 0.3) {
            continue;
        }

        const i = binOf(Math.atan2(d.x, d.z), up);

        whole[i] = Math.max(whole[i], length);

        if (earSet.has(v)) {
            ear.push([d.x, d.y, d.z, length]);
        } else {
            skull[i] = Math.max(skull[i], length);
        }
    }

    const smoothed = (radii) => smooth(filled(radii));
    const map = { skull: [...smoothed(skull)], whole: [...smoothed(whole)] };
    const heights = [];

    for (let y = -0.16; y <= 0.161; y += 0.02) {
        heights.push([Math.round(y * 1000) / 1000, face.fromFace(0, y, HEAD_CENTRE_Z)[1] - middle.y]);
    }

    // Where the ears join the head: their skin within a centimetre and a half of the skull's, and
    // round the head as far as they join it near its top (where a rim comes over them; lower down,
    // the lobe and the skin before it reach further forward)
    const reader = new HeadMap({ ...map, heights, ears: null });
    const roots = ear.filter(([x, y, z, length]) => length < reader.radius(Math.atan2(x, z), Math.asin(y / length)) + 0.015);
    const top = Math.max(...roots.map(([, y]) => y));
    const sideways = roots.filter(([, y]) => y > top - EAR_TOP).map(([x, , z]) => Math.abs(Math.atan2(x, z)));

    return { ...map, heights, ears: roots.length ? { top, from: Math.min(...sideways), to: Math.max(...sideways) } : null };
}

// A direction's place in the table
function binOf(around, up) {
    const a = Math.round((((around / (2 * Math.PI)) % 1) + 1) % 1 * AROUND) % AROUND;
    const e = Math.max(0, Math.min(UPDOWN - 1, Math.round(((up - LOW) / (Math.PI / 2 - LOW)) * (UPDOWN - 1))));

    return e * AROUND + a;
}

// Directions no skin fell in, from their neighbours'; and the top, one direction, the same all round
function filled(radii) {
    for (let pass = 0; pass < 12; pass++) {
        for (let e = 0; e < UPDOWN; e++) {
            for (let a = 0; a < AROUND; a++) {
                const i = e * AROUND + a;

                if (!radii[i]) {
                    const near = [[a - 1, e], [a + 1, e], [a, e - 1], [a, e + 1]]
                        .filter(([, ee]) => ee >= 0 && ee < UPDOWN)
                        .map(([aa, ee]) => radii[ee * AROUND + ((aa + AROUND) % AROUND)])
                        .filter(Boolean);

                    if (near.length) {
                        radii[i] = near.reduce((sum, r) => sum + r, 0) / near.length;
                    }
                }
            }
        }
    }

    const top = (UPDOWN - 1) * AROUND;
    const most = Math.max(...radii.subarray(top, top + AROUND));

    radii.fill(most, top, top + AROUND);

    return radii;
}

// The most each direction and those round it reach (so nothing between the skin's vertices pokes
// through what's fitted over them), evened out a little
function smooth(radii) {
    const most = new Float32Array(radii.length);
    const even = new Float32Array(radii.length);
    const at = (a, e) => radii[Math.max(0, Math.min(UPDOWN - 1, e)) * AROUND + ((a + AROUND) % AROUND)];

    for (let e = 0; e < UPDOWN; e++) {
        for (let a = 0; a < AROUND; a++) {
            most[e * AROUND + a] = Math.max(at(a, e), at(a - 1, e), at(a + 1, e), at(a, e - 1), at(a, e + 1));
        }
    }

    for (let e = 0; e < UPDOWN; e++) {
        for (let a = 0; a < AROUND; a++) {
            const near = (aa, ee) => most[Math.max(0, Math.min(UPDOWN - 1, ee)) * AROUND + ((aa + AROUND) % AROUND)];

            even[e * AROUND + a] = Math.max(radii[e * AROUND + a], (2 * near(a, e) + near(a - 1, e) + near(a + 1, e) + near(a, e - 1) + near(a, e + 1)) / 6);
        }
    }

    return even;
}

/** A head as measureHead measured it: how far it reaches each way, and where things are on it. */
export class HeadMap {
    constructor({ skull, whole, heights, ears }, { overEars = false } = {}) {
        this.radii = overEars ? whole : skull;
        this.heights = heights;
        this.ears = ears;
    }

    /** How far the head reaches in a direction (metres from its middle). */
    radius(around, up) {
        const a = ((((around / (2 * Math.PI)) % 1) + 1) % 1) * AROUND;
        const e = Math.max(0, Math.min(UPDOWN - 1, ((up - LOW) / (Math.PI / 2 - LOW)) * (UPDOWN - 1)));
        const [a0, e0] = [Math.floor(a), Math.min(UPDOWN - 2, Math.floor(e))];
        const [fa, fe] = [a - a0, e - e0];
        const at = (aa, ee) => this.radii[ee * AROUND + (aa % AROUND)];

        return (at(a0, e0) * (1 - fa) + at(a0 + 1, e0) * fa) * (1 - fe) + (at(a0, e0 + 1) * (1 - fa) + at(a0 + 1, e0 + 1) * fa) * fe;
    }

    /** A point `out` metres off the head in a direction (from its middle). */
    point(around, up, out = 0) {
        const r = this.radius(around, up) + out;

        return new THREE.Vector3(Math.sin(around) * Math.cos(up) * r, Math.sin(up) * r, Math.cos(around) * Math.cos(up) * r);
    }

    /** How far up (radians) the head's skin is at a height (metres from the middle), round at `around`. */
    upAt(around, height) {
        let [low, high] = [LOW, Math.PI / 2];

        for (let k = 0; k < 24; k++) {
            const up = (low + high) / 2;

            [low, high] = this.radius(around, up) * Math.sin(up) < height ? [up, high] : [low, up];
        }

        return (low + high) / 2;
    }

    /** A height in face coordinates (face.js), as a height from the middle. */
    local(faceY) {
        return lerpTable(this.heights, faceY);
    }
}

// The lines head-wear's rims follow round the head: heights in face coordinates (metres above the
// eyes, face.js) by the angle round it from straight ahead (degrees) - just above the brows, then
// level round the temples and over the ears, and down past the back of the skull. A helm's rim
// rises over the ears (rimLine: to clear where they join the head), a coif's goes down under them
// and round the jaw to the nape (a hood's a little lower), a hat's sits round the head where it's
// widest, tipped back a little.
export const RIMS = Object.freeze({
    helm: [[0, 0.024], [30, 0.026], [60, 0.029], [85, 0.028], [105, 0.014], [130, -0.012], [155, -0.03], [180, -0.036]],
    cap: [[0, 0.038], [40, 0.038], [80, 0.034], [110, 0.018], [140, -0.006], [180, -0.02]],
    coif: [[0, 0.036], [35, 0.03], [55, 0.012], [68, -0.03], [80, -0.075], [110, -0.085], [150, -0.085], [180, -0.082]],
    hood: [[0, 0.046], [35, 0.038], [55, 0.016], [68, -0.03], [80, -0.09], [110, -0.1], [150, -0.09], [180, -0.088]],
    hat: [[0, 0.05], [60, 0.048], [110, 0.042], [180, 0.034]],
});

// How far under a rim the hair's cut (metres: so none grows out through it)
const UNDER = 0.004;

/** The line hair under head-wear is cut to (face coordinates, as RIMS): only hair rooted below it grows. */
export function hairCut(rim) {
    return (RIMS[rim] ?? RIMS.helm).map(([angle, height]) => [angle, height - UNDER]);
}

/** Whether a point (face coordinates) is above a cut (hairCut: under head-wear). */
export function underCut(cut, x, y, z) {
    return y > lerpTable(cut, Math.abs(Math.atan2(x, z - HEAD_CENTRE_Z)) * (180 / Math.PI));
}

/**
 * The height of a rim (RIMS' `rim`) round a head (`head`: HeadMap), from its middle (metres), by
 * the angle round it (radians): a helm's lifted in an arch over each ear, clear of where it joins
 * the head (`overEars`: a coif's and hood's go over them instead, and ears too long for that
 * through it, as a helm's).
 */
export function rimLine(head, rim, { overEars = false } = {}) {
    const table = RIMS[rim] ?? RIMS.helm;
    const arch = rim === "helm" || rim === "cap" || !overEars ? head.ears : null;
    const ARCH = 0.007;
    const SHOULDER = 0.25;

    return (around) => {
        const angle = Math.abs(((around + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        const height = head.local(lerpTable(table, angle * (180 / Math.PI)));

        if (!arch) {
            return height;
        }

        const over = smoothstep(arch.from - SHOULDER, arch.from, angle) * (1 - smoothstep(arch.to, arch.to + SHOULDER, angle));

        return Math.max(height, height + (arch.top + ARCH - height) * over);
    };
}

/**
 * A curved plate over the head (or a band, or the whole of a helm's dome): round it from `from` to
 * `to` (radians round from straight ahead, `to` > `from`), up from `bottom(around)` to
 * `top(around)` (radians up), `out(around, up)` metres off the head (`head`: HeadMap) and
 * `thickness` thick, its edges closed. `steps`: [round, up].
 */
export function headPlate(head, { from = -Math.PI, to = Math.PI, bottom, top, out, thickness = 0.0025, steps = [48, 12] }) {
    const [across, along] = steps;
    const closed = to - from >= 2 * Math.PI - 1e-6;
    const ring = closed ? across : across + 1;
    const positions = [];
    const indices = [];
    const grid = (outer) => {
        const first = positions.length / 3;

        for (let j = 0; j <= along; j++) {
            for (let i = 0; i < ring; i++) {
                const around = from + ((to - from) * i) / across;
                const [low, high] = [bottom(around), top(around)];
                const up = low + ((high - low) * j) / along;
                const p = head.point(around, up, out(around, up) + (outer ? thickness : 0));

                positions.push(p.x, p.y, p.z);
            }
        }

        return first;
    };
    const [inner, outer] = [grid(false), grid(true)];
    const index = (first, i, j) => first + j * ring + (i % ring);
    const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);

    for (let j = 0; j < along; j++) {
        for (let i = 0; i < across; i++) {
            quad(index(outer, i, j), index(outer, i + 1, j), index(outer, i + 1, j + 1), index(outer, i, j + 1));
            quad(index(inner, i, j), index(inner, i, j + 1), index(inner, i + 1, j + 1), index(inner, i + 1, j));
        }
    }

    // Its edges: the bottom and top all round, and its ends if it doesn't go all the way round
    for (let i = 0; i < across; i++) {
        quad(index(inner, i, 0), index(inner, i + 1, 0), index(outer, i + 1, 0), index(outer, i, 0));
        quad(index(outer, i, along), index(outer, i + 1, along), index(inner, i + 1, along), index(inner, i, along));
    }

    for (const [i, flip] of closed ? [] : [[0, false], [across, true]]) {
        for (let j = 0; j < along; j++) {
            const [a, b, c, d] = [index(inner, i, j), index(outer, i, j), index(outer, i, j + 1), index(inner, i, j + 1)];

            if (flip) {
                quad(a, d, c, b);
            } else {
                quad(a, b, c, d);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}
