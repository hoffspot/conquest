// The arches of rock drawn (core/arches.js places them: the terrain plan's M7h-2, reworked as the
// user asked, "closer to real stone arches with the idiosyncrasies, rubble, and where appropriate,
// vegetation"): not a band bent over the ground but a fin of rock with a hole worn through it, as
// real ones are. The fin stands out of the ground over its legs' squares, sloping (or dropping)
// away down into the ground beyond them; thick at its foot, thinner up top, wandering a little
// from straight and leaning. The hole's round or flattened at its crown, its sides upright below
// where it springs from, each side its own, its edge worn uneven; the rock over it a cap as thick
// as the arch's own.
//
// What makes it rock and not a lump: its beds (layers a metre or so thick, dipping a little along
// it, each standing out or set back from the next: ledges, overhangs, a hard cap); the joints
// across them, each block between two of them standing out or in a little of its own; and its
// surface knobbed and pocked. Worked out as a field of how far each point is from the rock (out
// positive, in negative), met where it's nought on a lattice (surface nets: a point in each cell
// the surface crosses, joined to its neighbours'), each point's normal the field's slope there and
// its colour the cliffs' (kits/cliffs.js rockColour: its bed's own shade, moss and snow on what
// faces up), darker where the rock closes round it. Drawn with the cliffs' material.
//
// At its feet the rock that's fallen from it: a few big blocks against its legs, scree about it,
// some under its span. And growing on it as its land has them: grass, heather, bracken and the like
// on its ledges and top and round its feet, a green land's thick, a dry one's sparse; none in the
// snow.
//
// Its rock stays inside its legs' squares where it meets the ground (core keeps them: nothing
// walks into it), leaning out over them only above a person's head.

import * as THREE from "three";
import { ARCHES, feetOf, legsOf } from "../../../core/arches.js";
import { hashOf } from "../../../core/noise.js";
import { cliffMaterial, LAYERS } from "../engine/atlas.js";
import { MATERIALS } from "../engine/painters.js";
import { ALPINE } from "../../ground.js";
import { chip, CLIFFS, noise3, rockColour } from "./cliffs.js";
import { LOOKS, Mesher, UNDERGROWTH, undergrowthMesh } from "./wilds.js";

/**
 * How an arch is drawn: the lattice its rock's worked out on (metres a cell), and how far its foot
 * goes down into the ground; the rock over its opening, how thick (metres, from its own numbers, and
 * at least `capSpan` of its span), how far its top may follow its opening's curve (a band over it,
 * as some are, rather than running level), and how often a small window's worn through it beyond a
 * leg;
 * the fin, half its thickness at its foot (metres) and at its top (of that), how much thicker at
 * the very foot, and how far it wanders from straight and leans (metres); where its opening's sides
 * spring from (of its height); its beds, how thick (metres), how far one stands out or in from the
 * next, and how much they dip along it; its joints, how far apart (metres) and how far a block
 * between two stands out or in; its surface's knobs (metres out or in, and across); how far inside
 * its legs' squares the rock stays at the ground (metres), and how high a person stands (under
 * that, nothing leans out over them); how far round each point the closing in of the rock is
 * looked for (metres); and what's fallen and grown about it (how many of each, at most).
 */
export const ARCH_LOOK = Object.freeze({
    cell: 0.6,
    bury: 2,
    cap: Object.freeze([1.8, 3.4]),
    capSpan: 0.17,
    bowed: 0.85,
    windows: 0.4,
    thick: Object.freeze([1.6, 2.4]),
    taper: 0.72,
    flare: 0.35,
    wander: 0.6,
    lean: 0.06,
    springs: Object.freeze([0.25, 0.55]),
    beds: Object.freeze([0.9, 1.6]),
    ledges: 0.46,
    dip: 0.1,
    joints: 2.8,
    blocks: 0.34,
    knobs: Object.freeze([0.3, 4.5]),
    pocks: Object.freeze([0.14, 1.6]),
    room: 0.3,
    head: 2.3,
    closing: 1.3,
    fallen: Object.freeze({ blocks: 11, scree: 44 }),
    grown: Object.freeze({ ledges: 26, feet: 40 }),
});

const LAYER = Object.fromEntries(LAYERS.map((name, k) => [name, k]));
const METRES = Object.fromEntries(Object.entries(MATERIALS).map(([name, { world }]) => [name, world / 5]));

// What grows on and round an arch, of each land's undergrowth (the rest of which, pebbles, bones and
// the like, the rubble stands for)
const PLANTS = new Set(["tuft", "tall", "heather", "bracken", "dry", "fern", "cotton", "marram", "thistle", "yarrow", "cactus", "campion", "daisy"]);

// The lands green enough for plenty to grow on it; those with a little, dry
const GREEN = new Set(["heath", "mountain", "tundra", "beach"]);
const SPARSE = new Set(["savannah", "badlands"]);

/**
 * An arch's own shape (from its numbers and its look's): { span, rise, cap, top (how high its rock
 * stands over its feet), thick, middle (its opening's, along it), wide ([its sides' half-widths]),
 * springs ([where each side springs from]), round, ends ([how far along it its rock reaches each
 * way]), steep (how its ends drop), beds, ha, hb (its feet's ground) }.
 */
export function shapeOf(arch, groundAt) {
    const own = (n) => hashOf(n, 23, Math.floor(arch.variant * 1e6));
    const { span, rise } = arch;
    const [[ax, ay], [bx, by]] = feetOf(arch);
    const reach = arch.reach ?? [0, 0];
    const cap = Math.max(ARCH_LOOK.cap[0] + (ARCH_LOOK.cap[1] - ARCH_LOOK.cap[0]) * own(1), ARCH_LOOK.capSpan * span);
    const thick = ARCH_LOOK.thick[0] + (ARCH_LOOK.thick[1] - ARCH_LOOK.thick[0]) * own(2);
    // (Its opening as wide as the ground between its legs' squares, less a little: a side each)
    const inner = span / 2 - (ARCHES.leg - ARCH_LOOK.room);
    const middle = (own(3) - 0.5) * 0.4;
    const springs = [own(4), own(5)].map((k) => ARCH_LOOK.springs[0] + (ARCH_LOOK.springs[1] - ARCH_LOOK.springs[0]) * k);

    return {
        span,
        rise,
        cap,
        top: rise + cap,
        thick,
        middle,
        wide: [inner + middle, inner - middle],
        springs,
        round: 1.6 + 1.6 * own(6),
        ends: [-(span / 2 + reach[0] + ARCHES.leg - ARCH_LOOK.room), span / 2 + reach[1] + ARCHES.leg - ARCH_LOOK.room],
        steep: 0.6 + 2.4 * own(7),
        beds: ARCH_LOOK.beds[0] + (ARCH_LOOK.beds[1] - ARCH_LOOK.beds[0]) * own(8),
        hard: own(9),
        // (How far its top follows its opening's curve, a band over it, rather than running level)
        bowed: own(10) * ARCH_LOOK.bowed,
        // (A small window of its own worn through it beyond one leg, or none)
        window: own(11) < ARCH_LOOK.windows && Math.max(...reach) > 3.2 ? { u: (reach[0] > reach[1] ? -1 : 1) * (span / 2 + ARCHES.leg * 0.4 + Math.max(...reach) * 0.45), v: rise * (0.3 + 0.2 * own(12)), r: 0.7 + 0.7 * own(13) } : null,
        ha: groundAt(ax, ay),
        hb: groundAt(bx, by),
        seed: Math.floor(arch.variant * 1e5),
    };
}

/**
 * How far points are from an arch's rock (metres, out positive, in negative: near enough, not
 * exactly), worked out a stage at a time so that what a whole row of points shares is worked out
 * once for it: `column(u)` what's the same all the way up and across at `u` along it from its middle
 * (towards its second foot); `row(column, v)` what's the same all across it at `v` up from the line
 * between its feet's ground; `at(column, row, w, bed)` the field at `w` across it (and its bed there,
 * `bed` an object to fill: { layer, up }). `point(u, v, w, bed)` all three at once.
 */
export function rockField(shape, legs) {
    const { span, rise, top, thick, middle, wide, springs, round, ends, steep, beds, hard, seed } = shape;
    const [knob, pock] = [ARCH_LOOK.knobs, ARCH_LOOK.pocks];
    // (Its small window, if it has one: a hole through it, worn round, a little uneven)
    const windowOf = (u, v) => (shape.window ? shape.window.r - Math.hypot(u - shape.window.u, (v - shape.window.v) * 1.3) + (noise3(u / 1.5, v / 1.5, 5.3, 101) - 0.5) * 0.5 : -Infinity);

    // The fin's outline along it: up to its top over the opening and its legs, then sloping (or
    // dropping, `steep`) down to the ground at each end, a little uneven
    const column = (u) => {
        const side = u < middle ? 0 : 1;
        const out = side === 0 ? Math.max(0, (-span / 2 - u) / Math.max(0.1, -span / 2 - ends[0])) : Math.max(0, (u - span / 2) / Math.max(0.1, ends[1] - span / 2));
        const crest = top * (1 - Math.min(1, out) ** (1 + steep)) + (noise3(u / 5, 0.5, seed % 97, 61) - 0.5) * 1.2;
        const line = (noise3(u / 9, 0.3, 1.9, 73) - 0.5) * 2 * ARCH_LOOK.wander;

        return { u, side, crest, line, beyond: side === 0 ? ends[0] - u : u - ends[1], across: Math.abs(u - middle) };
    };

    // The hole worn through it (upright sides up to where each springs, then curving over to its
    // crown at the arch's rise, each side as wide as its own, its edge uneven), and its thickness
    // across (thinner up top, thicker at the very foot)
    const row = ({ u, side, crest: level, beyond, across }, v) => {
        const half = wide[side];
        const from = rise * springs[side];
        const fall = v <= from ? 1 : Math.max(0, 1 - ((v - from) / (rise - from)) ** 2) ** (1 / round);
        const crown = across >= half ? -Infinity : from + (rise - from) * Math.sqrt(Math.max(0, 1 - (across / half) ** round));
        // (Its top over the opening: level, or bowed to follow the opening's curve, a band of its
        // cap's thickness over it, sloping down over the legs as the crown's curve would go on)
        const curve = from + (rise - from) * Math.sqrt(Math.max(0, 1 - Math.min(1, across / (half + shape.cap)) ** round)) + shape.cap;
        const crest = level + (Math.min(level, curve) - level) * shape.bowed;
        const hole = across >= half + 1 ? -Infinity : Math.min(half * fall - across, crown - v) + (noise3(u / 2.2, v / 2.2, 3.1, 67) - 0.5) * 0.9;
        const high = Math.min(1, Math.max(0, v / top));
        const halfThick = thick * (1 - (1 - ARCH_LOOK.taper) * high) * (1 + ARCH_LOOK.flare * Math.max(0, 1 - v / 2)) + (noise3(u / 4, v / 4, 7.7, 71) - 0.5) * 0.8;

        return { v, crown, outline: Math.max(v - crest, beyond, -v - ARCH_LOOK.bury, hole), halfThick, lean: ARCH_LOOK.lean * v };
    };

    const at = ({ u, line }, { v, crown, outline, halfThick, lean }, w, bed = null) => {
        let field = Math.max(outline, Math.abs(w - line - lean) - halfThick);

        // Inside its legs' squares where it meets the ground, leaning out over them only above a
        // person's head
        let near = Infinity;

        for (const [[fu, fw], [tu, tw]] of legs) {
            const [du, dw] = [tu - fu, tw - fw];
            const long = du * du + dw * dw;
            const t = long > 0 ? Math.min(1, Math.max(0, ((u - fu) * du + (w - fw) * dw) / long)) : 0;

            near = Math.min(near, Math.hypot(u - fu - du * t, w - fw - dw * t));
        }

        const kept = near - (ARCHES.leg - ARCH_LOOK.room) - Math.max(0, v - ARCH_LOOK.head) * 0.8;

        // (Well away from its surface, out or in, what's below can't bring it there: as it is)
        if (!bed && Math.abs(field) > FAR) {
            return Math.max(field, kept, windowOf(u, v));
        }

        // Its beds: each standing out or set back from the next (its cap, the top bed or two,
        // harder: standing out over the rest), dipping along it; the joints across them, each
        // block its own; knobs and pocks
        const level = v + ARCH_LOOK.dip * u + (noise3(u / 6, w / 6, 2.3, 79) - 0.5) * 0.5;
        const layer = Math.floor(level / beds);
        const capped = level > top - beds * 1.5 && hard > 0.4 ? -0.25 : 0;
        const joint = Math.floor((u + (noise3(v / 3, w / 3, 4.1, 83) - 0.5) * 1.4) / ARCH_LOOK.joints);

        field += (hashOf(layer, 5, seed) - 0.5) * 2 * ARCH_LOOK.ledges + capped;
        field += (hashOf(layer, joint, seed + 7) - 0.5) * 2 * ARCH_LOOK.blocks;
        field += (noise3(u / knob[1], v / knob[1], w / knob[1], 89) - 0.5) * 2 * knob[0] + (noise3(u / pock[1], v / pock[1], w / pock[1], 97) - 0.5) * 2 * pock[0];

        if (bed) {
            bed.layer = layer;
            bed.up = level / beds - layer;
        }

        // (The rock just over its opening always whole, however its beds and knobs fall: the arch
        // never broken through)
        if (crown > -Infinity) {
            field = Math.min(field, Math.max(v - crown - shape.cap * 0.6, crown - v + 0.05, Math.abs(w - line - lean) - halfThick * 0.75));
        }

        return Math.max(field, kept, windowOf(u, v));
    };

    return { column, row, at, point: (u, v, w, bed = null) => {
        const col = column(u);

        return at(col, row(col, v), w, bed);
    } };
}

// How far the beds, joints and knobs can move the rock's surface, at most (metres: ARCH_LOOK's
// ledges, its cap's, blocks, knobs and pocks, and a little over)
const FAR = ARCH_LOOK.ledges + 0.25 + ARCH_LOOK.blocks + ARCH_LOOK.knobs[0] + ARCH_LOOK.pocks[0] + 0.3;

/**
 * An arch's rock, worked out: { points: [{ at: [x, height, y] in the world, normal, bed, open (how
 * open round it: 0 to 1), local ([u, v, w]) }], faces: [[a, b, c] (indices)], shape }, its surface
 * where its field (rockField) is nought, on ARCH_LOOK.cell's lattice; worked out a slice at a time
 * (each a yield, `rockMaking`'s), or all at once (rockOf).
 */
export function rockOf(arch, groundAt) {
    const making = rockMaking(arch, groundAt);

    for (;;) {
        const made = making.next();

        if (made.done) {
            return made.value;
        }
    }
}

/** rockOf, a slice of its lattice at a time (each a yield). */
export function* rockMaking(arch, groundAt) {
    const shape = shapeOf(arch, groundAt);
    const { cell } = ARCH_LOOK;
    const [ux, uy] = [Math.cos(arch.turn), Math.sin(arch.turn)];
    // (Its legs' lines along it and across it: core's legsOf, about its middle)
    const legs = legsOf(arch).map((leg) => leg.map(([x, y]) => [(x - arch.x) * ux + (y - arch.y) * uy, -(x - arch.x) * uy + (y - arch.y) * ux]));
    const base = (u) => (shape.ha + shape.hb) / 2 + ((shape.hb - shape.ha) * u) / shape.span;
    const field = rockField(shape, legs);
    const [u0, u1] = [shape.ends[0] - 1, shape.ends[1] + 1];
    const [v0, v1] = [-ARCH_LOOK.bury - 0.5, shape.top + 2];
    const reachW = shape.thick * (1 + ARCH_LOOK.flare) + ARCH_LOOK.wander + ARCH_LOOK.lean * shape.top + 1.5;
    const [nu, nv, nw] = [Math.ceil((u1 - u0) / cell), Math.ceil((v1 - v0) / cell), Math.ceil((2 * reachW) / cell)];
    const at = (i, j, k) => [u0 + i * cell, v0 + j * cell, -reachW + k * cell];
    const index = (i, j, k) => (k * (nv + 1) + j) * (nu + 1) + i;
    const values = new Float32Array((nu + 1) * (nv + 1) * (nw + 1));

    // The field over the lattice, a column along it at a time (a row up it, then across)
    for (let i = 0; i <= nu; i++) {
        const col = field.column(u0 + i * cell);

        for (let j = 0; j <= nv; j++) {
            const row = field.row(col, v0 + j * cell);

            // (Well out of its outline, nothing across it brings it in)
            for (let k = 0; k <= nw; k++) {
                values[index(i, j, k)] = row.outline > FAR ? row.outline : field.at(col, row, -reachW + k * cell);
            }
        }

        if (i % 8 === 7) {
            yield;
        }
    }

    // A point in each cell the surface crosses: the middle of where it crosses the cell's edges
    const cells = new Int32Array(nu * nv * nw).fill(-1);
    const local = [];
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];

    for (let k = 0; k < nw; k++) {
        for (let j = 0; j < nv; j++) {
            for (let i = 0; i < nu; i++) {
                const corner = CORNERS.map(([a, b, c]) => values[index(i + a, j + b, k + c)]);

                if (corner.every((f) => f > 0) || corner.every((f) => f <= 0)) {
                    continue;
                }

                const sum = [0, 0, 0];
                let crossings = 0;

                for (const [p, q] of EDGES) {
                    if (corner[p] > 0 === corner[q] > 0) {
                        continue;
                    }

                    const t = corner[p] / (corner[p] - corner[q]);
                    const [pa, pb] = [CORNERS[p], CORNERS[q]];

                    sum[0] += pa[0] + (pb[0] - pa[0]) * t;
                    sum[1] += pa[1] + (pb[1] - pa[1]) * t;
                    sum[2] += pa[2] + (pb[2] - pa[2]) * t;
                    crossings++;
                }

                cells[(k * nv + j) * nu + i] = local.length;
                local.push([i + sum[0] / crossings, j + sum[1] / crossings, k + sum[2] / crossings]);
            }
        }
    }

    yield;

    // Each edge of the lattice the surface crosses: a face of the four points round it
    const faces = [];
    const cellAt = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nu || j >= nv || k >= nw ? -1 : cells[(k * nv + j) * nu + i]);
    const quad = (around) => {
        if (around.some((n) => n < 0)) {
            return;
        }

        faces.push([around[0], around[1], around[2]], [around[0], around[2], around[3]]);
    };

    for (let k = 0; k <= nw; k++) {
        for (let j = 0; j <= nv; j++) {
            for (let i = 0; i <= nu; i++) {
                const here = values[index(i, j, k)] > 0;

                if (i < nu && here !== values[index(i + 1, j, k)] > 0) {
                    quad([cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k)]);
                }

                if (j < nv && here !== values[index(i, j + 1, k)] > 0) {
                    quad([cellAt(i - 1, j, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i - 1, j, k)]);
                }

                if (k < nw && here !== values[index(i, j, k + 1)] > 0) {
                    quad([cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k)]);
                }
            }
        }
    }

    // The field anywhere in the lattice (lattice units), as it is at the corners round it
    const sample = (fi, fj, fk) => {
        const [i, j, k] = [Math.min(nu - 1, Math.max(0, Math.floor(fi))), Math.min(nv - 1, Math.max(0, Math.floor(fj))), Math.min(nw - 1, Math.max(0, Math.floor(fk)))];
        const [a, b, c] = [Math.min(1, Math.max(0, fi - i)), Math.min(1, Math.max(0, fj - j)), Math.min(1, Math.max(0, fk - k))];
        const corner = (di, dj, dk) => values[index(i + di, j + dj, k + dk)];
        const x00 = corner(0, 0, 0) + (corner(1, 0, 0) - corner(0, 0, 0)) * a;
        const x10 = corner(0, 1, 0) + (corner(1, 1, 0) - corner(0, 1, 0)) * a;
        const x01 = corner(0, 0, 1) + (corner(1, 0, 1) - corner(0, 0, 1)) * a;
        const x11 = corner(0, 1, 1) + (corner(1, 1, 1) - corner(0, 1, 1)) * a;

        return x00 + (x10 - x00) * b + (x01 + (x11 - x01) * b - x00 - (x10 - x00) * b) * c;
    };

    // Each point in the world: its normal the field's slope there (out of the rock), its bed, and
    // how open it is round it (the field a way out along its normal: low where the rock closes
    // round it)
    const out = ARCH_LOOK.closing / cell;
    const points = local.map(([fi, fj, fk]) => {
        const g = [sample(fi + 0.5, fj, fk) - sample(fi - 0.5, fj, fk), sample(fi, fj + 0.5, fk) - sample(fi, fj - 0.5, fk), sample(fi, fj, fk + 0.5) - sample(fi, fj, fk - 0.5)];
        const length = Math.hypot(...g) || 1;
        const [gu, gv, gw] = g.map((x) => x / length);
        const [u, v, w] = at(fi, fj, fk);
        const bed = {};

        field.point(u, v, w, bed);

        return {
            at: [arch.x + u * ux - w * uy, base(u) + v, arch.y + u * uy + w * ux],
            normal: [gu * ux - gw * uy, gv, gu * uy + gw * ux],
            bed,
            open: Math.min(1, Math.max(0, sample(fi + gu * out, fj + gv * out, fk + gw * out) / ARCH_LOOK.closing)),
            local: [u, v, w],
        };
    });

    // (Each face turned to look out of the rock, as its corners' normals say)
    for (const face of faces) {
        const [a, b, c] = face.map((n) => points[n].at);
        const n = cross(sub(b, a), sub(c, a));
        const normal = face.reduce((sum, i) => sum.map((x, k) => x + points[i].normal[k]), [0, 0, 0]);

        if (n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2] < 0) {
            [face[1], face[2]] = [face[2], face[1]];
        }
    }

    return { points, faces, shape };
}

/**
 * Draw an arch's rock (`rock`: rockOf's, worked out here if not given) and what's fallen from it
 * into a mesher, about the corner [x0, y0] (metres), standing on the ground (`groundAt(x, y)`,
 * metres): { triangles, rock }.
 */
export function archInto(mesher, arch, groundAt, [x0, y0], rock = rockOf(arch, groundAt)) {
    const before = mesher.count;
    const look = LOOKS[arch.land] ?? LOOKS.mountain;
    const layer = LAYER[look.stone] ?? LAYER.rock;
    const copies = 1 / ((METRES[look.stone] ?? 1) * CLIFFS.picture);
    const uvs = [[copies, 0], [copies, 0], [copies, 0]];
    const snowLine = ALPINE.snow[0] - ALPINE.wander;
    const drawn = rock.points.map(({ at, normal, bed, open }) => {
        const colour = rockColour(look, { layer: bed.layer, up: bed.up, height: at[1], normal, x: at[0], y: at[2], cliff: 1 }, snowLine);
        const shade = 0.5 + 0.5 * open;

        return { at: [at[0] - x0, at[1], at[2] - y0], normal, colour: colour.map((c) => c * shade) };
    });

    for (const [a, b, c] of rock.faces) {
        const [p, q, r] = [drawn[a], drawn[b], drawn[c]];

        mesher.tri(p.at, q.at, r.at, { layer, colours: [p.colour, q.colour, r.colour], normals: [p.normal, q.normal, r.normal], uvs });
    }

    fallen(mesher, arch, rock.shape, groundAt, [x0, y0], { layer, uvs, look });

    return { triangles: (mesher.count - before) / 3, rock };
}

// What's fallen from an arch: big blocks against its legs, scree about it (some under its span),
// each half in the ground
function fallen(mesher, arch, shape, groundAt, [x0, y0], kit) {
    const { blocks, scree } = ARCH_LOOK.fallen;
    const own = (n, k) => hashOf(n, k, shape.seed + 1201);
    const [ux, uy] = [Math.cos(arch.turn), Math.sin(arch.turn)];
    // (A chip's half as high as it's long, half that sunk: most of it showing)
    const lay = (u, w, r, seed) => {
        const [x, y] = [arch.x + u * ux - w * uy, arch.y + u * uy + w * ux];

        chip(mesher, [x - x0, groundAt(x, y) + r * 0.22, y - y0], r, seed, kit);
    };

    // (Big blocks fallen against its legs, round the edges of their squares, half out from under
    // the rock: none out in the open under its span)
    const big = 5 + Math.floor(own(0, 1) * (blocks - 4));

    for (let n = 0; n < big; n++) {
        const side = n % 2 ? 1 : -1;
        const turn = (own(n, 2) - 0.5) * Math.PI * 1.4 + (side < 0 ? Math.PI : 0) + (own(n, 3) < 0.5 ? Math.PI / 2 : -Math.PI / 2) * 0.6;
        const from = ARCHES.leg - ARCH_LOOK.room + 0.25;
        const [u, w] = [side * (shape.span / 2 + Math.max(0, own(n, 4)) * 1.5) + Math.cos(turn) * from, Math.sin(turn) * from];

        lay(u, w, 0.45 + 0.85 * own(n, 5) ** 1.2, own(n, 6));
    }

    // (Scree: about it, thicker by its legs, some under its span)
    const count = 10 + Math.floor(own(0, 6) * (scree - 10));

    for (let n = 0; n < count; n++) {
        const along = (own(n, 7) - 0.5) * 2 * (shape.span / 2 + 3);
        const across = (own(n, 8) - 0.5) * 2 * (shape.thick + 3.5) * (0.4 + 0.6 * own(n, 9));

        lay(along, across, 0.12 + 0.4 * own(n, 10) ** 2, own(n, 11));
    }
}

/**
 * What grows on and round an arch, as its land has it: { plants (undergrowth items: kits/wilds.js
 * Growth's) }: on its ledges and top, and round its feet.
 */
export function growthOf(arch, rock, groundAt) {
    const land = arch.land;
    const own = (n, k) => hashOf(n, k, rock.shape.seed + 1301);
    const weights = Object.entries(UNDERGROWTH[land]?.kinds ?? {}).filter(([kind]) => PLANTS.has(kind));
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    const kindOf = (pick) => {
        let left = pick * total;

        return (weights.find(([, w]) => (left -= w) < 0) ?? weights.at(-1))[0];
    };
    const plants = [];
    const { ledges, feet } = ARCH_LOOK.grown;

    if (!total || land === "snow") {
        return { plants };
    }

    // On its ledges and top: where the rock faces up, over a person's height up it
    const up = rock.points.filter(({ normal, local }) => normal[1] > 0.82 && local[1] > 1.6).sort((a, b) => hashOf(Math.floor(a.at[0] * 7), Math.floor(a.at[2] * 7), 1307) - hashOf(Math.floor(b.at[0] * 7), Math.floor(b.at[2] * 7), 1307));
    const lush = GREEN.has(land) ? 1 : SPARSE.has(land) ? 0.5 : 0.25;

    up.slice(0, Math.round(ledges * lush)).forEach(({ at }, n) => {
        plants.push({ kind: kindOf(own(n, 1)), land, look: Math.floor(own(n, 2) * 8), x: at[0], y: at[2], ground: at[1] - 0.05, turn: own(n, 3) * Math.PI * 2, size: 0.7 + 0.5 * own(n, 4), tint: [1, 1, 1] });
    });

    // Round its feet, thicker by its legs
    const [ux, uy] = [Math.cos(arch.turn), Math.sin(arch.turn)];

    for (let n = 0; n < Math.round(feet * (0.5 + 0.5 * lush)); n++) {
        const side = own(n, 5) < 0.5 ? -1 : 1;
        const u = side * (rock.shape.span / 2 + (own(n, 6) - 0.3) * 6);
        const w = (own(n, 7) < 0.5 ? -1 : 1) * (ARCHES.leg + 0.2 + own(n, 8) * 3.5);
        const [x, y] = [arch.x + u * ux - w * uy, arch.y + u * uy + w * ux];

        plants.push({ kind: kindOf(own(n, 9)), land, look: Math.floor(own(n, 10) * 8), x, y, ground: groundAt(x, y), turn: own(n, 11) * Math.PI * 2, size: 0.8 + 0.6 * own(n, 12), tint: [1, 1, 1] });
    }

    return { plants };
}

/**
 * A chunk's arches drawn ([core/arches.js's], about its corner [x0, y0], metres): a group named
 * "arches" of the rock (a mesh at the chunk's corner named "arch rock", the cliffs' material,
 * casting shadows and taking them) and, with `plants`, what grows on and round them (the
 * undergrowth's).
 */
export function archMesh(arches, groundAt, corner, options) {
    const making = archMaking(arches, groundAt, corner, options);

    for (;;) {
        const made = making.next();

        if (made.done) {
            return made.value;
        }
    }
}

/** archMesh, a slice of each arch's rock at a time (each a yield: chunks3d.js makes it so). */
export function* archMaking(arches, groundAt, [x0, y0], { plants = true } = {}) {
    const mesher = new Mesher(16384);
    const group = new THREE.Group();
    const items = [];

    for (const arch of arches) {
        const { rock } = archInto(mesher, arch, groundAt, [x0, y0], yield* rockMaking(arch, groundAt));

        items.push(...growthOf(arch, rock, groundAt).plants);
    }

    const mesh = new THREE.Mesh(mesher.geometry(), cliffMaterial());

    mesh.name = "arch rock";
    mesh.position.set(x0, 0, y0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.name = "arches";
    group.add(mesh);

    if (plants && items.length) {
        group.add(undergrowthMesh(items, [x0, y0]));
    }

    return group;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
