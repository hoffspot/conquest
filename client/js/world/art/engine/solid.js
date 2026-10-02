// Builds low-poly 3D shapes out of flat faces, for the pieces the art generator draws.
//
// Coordinates are in world pixels, as on the game's map: x points east, y up and z south, with
// the origin at the north-west corner of the piece's first grid square. Faces are grouped by
// material. Texture coordinates are world pixels too (each material's texture says how many
// pixels one copy of it covers), so brick courses and roof tiles are the same size on every
// piece and line up across neighbouring faces.
//
// Every corner has a colour too, multiplying its material's (white unless `tone` says otherwise):
// the weathering the kits paint on (dirt at the foot of a wall, shade under the eaves and in a
// window's reveal), drawn when the pieces are merged into the art's one material (atlas.js).

import * as THREE from "three";

// For each face, which two coordinates run across its texture: faces that face mostly up use x
// and z, faces facing north or south use x and y, faces facing east or west use z and y. Each
// corner's, for a face's corners
function boxUVs(points, normal) {
    const nx = Math.abs(normal[0]);
    const ny = Math.abs(normal[1]);
    const nz = Math.abs(normal[2]);

    if (ny >= nx && ny >= nz) {
        return points.map((point) => [point[0], -point[2]]);
    }

    return nz >= nx ? points.map((point) => [point[0], point[1]]) : points.map((point) => [-point[2], point[1]]);
}

// Numbers kept as they'll be drawn, 32-bit floats (the same as a list of them turned into a
// Float32Array), in room that grows as they're added: `array` holds `length` of them
class Floats {
    array = new Float32Array(192);
    length = 0;

    add(a, b, c) {
        const size = c === undefined ? 2 : 3;

        if (this.length + size > this.array.length) {
            const bigger = new Float32Array(this.array.length * 2);

            bigger.set(this.array);
            this.array = bigger;
        }

        this.array[this.length++] = a;
        this.array[this.length++] = b;

        if (size === 3) {
            this.array[this.length++] = c;
        }
    }

    /** Those added, in an array of their own. */
    get numbers() {
        return this.array.slice(0, this.length);
    }
}

// One corner of a triangle, onto a material's lists (Solid #group's)
function lay(group, point, normal, uv, colour) {
    group.positions.add(point[0], point[1], point[2]);
    group.normals.add(normal[0], normal[1], normal[2]);
    group.uvs.add(uv[0], uv[1]);
    group.colours.add(colour[0], colour[1], colour[2]);
}

const WHITE = Object.freeze([1, 1, 1]);

// The heights a tone's colour turns at (its `bands`, where it gives them: where the dirt splashed
// up a wall fades out, where the shade under the eaves begins) across a face (its corners'),
// lowest first, or null for none. An upright face is cut level there (Solid.face): its colour
// is worked out only at its corners and blended between them, so a face from the foot of a wall
// to its eaves would blend the dirt and the shade into one grey
function turnsAcross(tone, points) {
    const bands = typeof tone === "function" ? tone.bands : null;

    if (!bands) {
        return null;
    }

    let low = Infinity;
    let high = -Infinity;

    for (const point of points) {
        low = point[1] < low ? point[1] : low;
        high = point[1] > high ? point[1] : high;
    }

    // (Most faces have none: nothing made for them unless they do)
    let turns = null;

    for (const y of bands) {
        if (y > low + 1e-6 && y < high - 1e-6) {
            (turns ??= []).push(y);
        }
    }

    return turns && turns.sort((a, b) => a - b);
}

// A convex face (its corners in order, each { point, uv, normal }) cut by the level plane at
// height y: the part below and the part above, each in order (a corner on the plane in both)
function cutAt(corners, y) {
    const [below, above] = [[], []];

    corners.forEach((a, k) => {
        const b = corners[(k + 1) % corners.length];
        const ya = a.point[1];
        const yb = b.point[1];

        if (Math.abs(ya - y) < 1e-6) {
            below.push(a);
            above.push(a);
        } else {
            (ya < y ? below : above).push(a);
        }

        if ((ya < y - 1e-6 && yb > y + 1e-6) || (ya > y + 1e-6 && yb < y - 1e-6)) {
            const t = (y - ya) / (yb - ya);
            const between = (p, q) => p.map((value, i) => value + (q[i] - value) * t);
            const crossing = { point: between(a.point, b.point), uv: between(a.uv, b.uv), normal: a.normal && unit(between(a.normal, b.normal)) };

            below.push(crossing);
            above.push(crossing);
        }
    });

    return [below, above];
}

// How wide an upright face (facing `normal`) is, level across it
function widthOf(points, normal) {
    const long = Math.hypot(normal[0], normal[2]) || 1;
    let low = Infinity;
    let high = -Infinity;

    for (const point of points) {
        const span = (point[0] * normal[2] - point[2] * normal[0]) / long;

        low = span < low ? span : low;
        high = span > high ? span : high;
    }

    return high - low;
}

// Upright faces narrower than this (world pixels: half a metre) aren't cut where their tone's
// colour turns: a timber, a quoin, a sill. They're narrow and mostly dark, so the blend of their
// colour hardly shows, and there are many of them
const CUT_WIDER = 2.5;

// How far proud of its surface a timber, a band or a strap may stand (world pixels: 10 cm) and its
// sides and ends still be drawn only near (Solid.member)
const NEAR_DEPTH = 0.5;

// Where something round is shaded smoothly across its faces (Solid's lathe, tube and loft), how
// sharply two faces may meet and still be shaded as one surface (40°): sharper is an edge (a
// hut's eaves, a dome's foot on its drum)
const CREASE = Math.cos((40 * Math.PI) / 180);

// The way between two directions that meet at less than the crease, or `own` if they don't
function softened(own, other) {
    return other && dot(own, other) > CREASE ? unit(add3(own, other)) : own;
}

// Whether a face's corners (in order, facing `normal`) turn the same way at every corner
function convex(points, normal) {
    return points.every((point, k) => {
        const next = points[(k + 1) % points.length];
        const after = points[(k + 2) % points.length];

        return dot(cross(sub(next, point), sub(after, next)), normal) > -1e-6;
    });
}

// The height of an outline ([[u, v]...], along a wall) over a point along it
function outlineAt(line, u) {
    for (let k = 0; k < line.length - 1; k++) {
        const [[ua, va], [ub, vb]] = [line[k], line[k + 1]];

        if (u >= ua - 1e-6 && u <= ub + 1e-6) {
            return ub - ua < 1e-6 ? Math.max(va, vb) : va + ((vb - va) * (u - ua)) / (ub - ua);
        }
    }

    return 0;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const times = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => times(a, 1 / (Math.hypot(...a) || 1));

export { add3, cross, dot, sub, times, unit };

const TAU = Math.PI * 2;

/**
 * The shapes an opening's back can take (Solid.wall's `arch`): "round" and "pointed" arches (a
 * pointed one's two arcs centred on the other side's springing), a steeper "lancet", an "ogee"
 * (curving out, then in to a point), a "keyhole" (a round top over a narrow slot) and a round
 * "moon" window. Its outline in the opening (u0 to u1 along the wall, v0 to v1 up it) from the
 * bottom left anticlockwise, as [[u, v]...].
 */
export const ARCHES = Object.freeze(["round", "pointed", "lancet", "ogee", "keyhole", "moon"]);

export function openingOutline(arch, u0, u1, v0, v1, steps = 6) {
    const width = u1 - u0;
    const middle = (u0 + u1) / 2;
    const arc = (cu, cv, r, from, to, count) => Array.from({ length: count + 1 }, (_, i) => {
        const angle = from + ((to - from) * i) / count;

        return [cu + Math.cos(angle) * r, cv + Math.sin(angle) * r];
    });

    if (arch === "moon") {
        const r = Math.min(width, v1 - v0) / 2;

        return arc(middle, (v0 + v1) / 2, r, -Math.PI / 2, (Math.PI * 3) / 2, steps * 2).slice(0, -1);
    }

    if (arch === "keyhole") {
        const r = Math.min(width / 2, (v1 - v0) / 3);
        const slot = r * 0.9;
        const cv = v1 - r;
        const below = Math.asin(slot / r);
        const drop = Math.sqrt(r * r - slot * slot);

        return [[middle - slot, v0], [middle + slot, v0], [middle + slot, cv - drop], ...arc(middle, cv, r, below - Math.PI / 2, (Math.PI * 3) / 2 - below, steps * 2).slice(1, -1), [middle - slot, cv - drop]];
    }

    if (arch === "round") {
        const rise = Math.min(v1 - v0, width / 2);
        const spring = v1 - rise;
        const top = Array.from({ length: steps + 1 }, (_, i) => {
            const angle = (Math.PI * i) / steps;

            return [middle + (Math.cos(angle) * width) / 2, spring + Math.sin(angle) * rise];
        });

        return [[u0, v0], [u1, v0], ...top];
    }

    if (arch === "ogee") {
        // (Up from each springing, swelling in, and turning up to meet at a point)
        const rise = Math.min(v1 - v0, width * 0.95);
        const spring = v1 - rise;
        const half = Array.from({ length: steps + 1 }, (_, i) => {
            const t = i / steps;

            return [u0 + (width / 2) * (0.5 - 0.5 * Math.cos(Math.PI * t)), spring + rise * t];
        });

        return [[u0, v0], [u1, v0], ...half.map(([u, v]) => [u0 + u1 - u, v]), ...half.slice(0, -1).reverse()];
    }

    // Pointed and lancet: two arcs of radius `k` times the width, each centred out from the
    // other side's springing, meeting at the point
    const k = arch === "lancet" ? 1.6 : 1;
    const r = k * width;
    const peak = Math.acos((r - width / 2) / r);
    const rise0 = Math.sin(peak) * r;
    const rise = Math.min(v1 - v0, rise0);
    const spring = v1 - rise;
    const scale = rise / rise0;
    const right = Array.from({ length: steps + 1 }, (_, i) => {
        // (The right side: centred on the left side's springing, from the springing up to the point)
        const angle = (peak * i) / steps;

        return [u1 - r + Math.cos(angle) * r, spring + Math.sin(angle) * r * scale];
    });

    return [[u0, v0], [u1, v0], ...right, ...right.slice(0, -1).reverse().map(([u, v]) => [u0 + u1 - u, v])];
}

/**
 * An outline ([x, z] corners in order, either way round) with every side moved `distance` in
 * towards its middle (out, if negative), the corners mitred.
 */
export function inset(outline, distance) {
    const n = outline.length;
    const [mx, mz] = outline.reduce(([sx, sz], [x, z]) => [sx + x / n, sz + z / n], [0, 0]);
    // (Each side's way in: towards the middle)
    const inward = outline.map(([x, z], k) => {
        const [nx, nz] = outline[(k + 1) % n];
        const long = Math.hypot(nx - x, nz - z) || 1;
        const normal = [-(nz - z) / long, (nx - x) / long];
        const toMiddle = (mx - (x + nx) / 2) * normal[0] + (mz - (z + nz) / 2) * normal[1];

        return toMiddle < 0 ? [-normal[0], -normal[1]] : normal;
    });

    return outline.map(([x, z], k) => {
        const [a, b] = [inward[(k - 1 + n) % n], inward[k]];
        const along = 1 + a[0] * b[0] + a[1] * b[1];
        const [ox, oz] = along < 1e-6 ? b : [(a[0] + b[0]) / along, (a[1] + b[1]) / along];

        return [x + ox * distance, z + oz * distance];
    });
}

// (Worked out with numbers, not arrays: it's done for every face)
function normalOf(a, b, c) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;

    return [nx / length, ny / length, nz / length];
}

export class Solid {
    // Triangles for each material: { positions, normals, uvs, colours }; and those only worth
    // drawing near (a timber's sides, a few centimetres deep: toObject's meshes marked `near`)
    #groups = new Map();
    #nearGroups = new Map();
    #nearOnly = false;
    // Ready-made meshes added whole (cylinders and cones)
    #meshes = [];

    /**
     * The colour each corner multiplies its material's by (linear [r, g, b]), from where it is
     * and which way its face faces, or null for white: tone(point, normal, material).
     */
    tone = null;

    #group(material) {
        const groups = this.#nearOnly ? this.#nearGroups : this.#groups;

        if (!groups.has(material)) {
            groups.set(material, { positions: new Floats(), normals: new Floats(), uvs: new Floats(), colours: new Floats() });
        }

        return groups.get(material);
    }

    // The faces `build` lays kept apart as only worth drawing near, if `when`
    #near(when, build) {
        const was = this.#nearOnly;

        this.#nearOnly = this.#nearOnly || when;
        build();
        this.#nearOnly = was;
    }

    /**
     * Lay the faces `build` lays as only worth drawing near (small things: a gate, a
     * fence's stakes), kept apart and left undrawn from further off (town3d.js joined).
     */
    near(build) {
        this.#near(true, build);

        return this;
    }

    /** How many triangles there are so far. */
    get triangles() {
        let count = 0;

        for (const { positions } of [...this.#groups.values(), ...this.#nearGroups.values()]) {
            count += positions.length / 9;
        }

        for (const { geometry, object } of this.#meshes) {
            if (geometry) {
                count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
            } else {
                object.traverse((node) => {
                    if (node.isMesh) {
                        const g = node.geometry;

                        count += (g.index ? g.index.count : g.attributes.position.count) / 3;
                    }
                });
            }
        }

        return count;
    }

    /**
     * A flat face with 3 or more corners, listed anticlockwise as seen from outside. `uvs` gives
     * each corner's texture position (in world pixels) instead of the default mapping; `tone` a
     * colour for all its corners (or a function, as the solid's), instead of the solid's;
     * `normals` each corner's own normal (a part of something round, shaded smoothly across its
     * faces), instead of the face's.
     */
    face(points, material, uvs, tone = this.tone, normals = null) {
        const normal = normalOf(points[0], points[1], points[2]);
        const across = uvs ?? boxUVs(points, normal);
        const turns = Math.abs(normal[1]) < 0.45 ? turnsAcross(tone, points) : null;

        if (!turns || widthOf(points, normal) < CUT_WIDER) {
            this.#lay(points, across, normal, material, tone, normals);

            return this;
        }

        // An upright face its tone's colour turns across: cut level at each turn, each piece
        // coloured at its own corners (a face that isn't convex cut a triangle at a time)
        const corners = points.map((point, k) => ({ point, uv: across[k], normal: normals?.[k] }));
        const pieces = convex(points, normal) ? [corners] : corners.slice(1, -1).map((corner, k) => [corners[0], corner, corners[k + 2]]);
        const lay = (piece) => this.#lay(piece.map(({ point }) => point), piece.map(({ uv }) => uv), normal, material, tone, normals && piece.map(({ normal: own }) => own));

        for (let rest of pieces) {
            for (const y of turns) {
                const [below, above] = cutAt(rest, y);

                if (below.length >= 3) {
                    lay(below);
                }

                rest = above;
            }

            if (rest.length >= 3) {
                lay(rest);
            }
        }

        return this;
    }

    // A flat face's triangles onto its material's lists: a fan from its first corner, each corner
    // with its own normal (if given: the face's otherwise) and coloured by the tone there
    #lay(points, across, normal, material, tone, normals) {
        const group = this.#group(material);
        const normalAt = (index) => normals?.[index] ?? normal;
        // (Each corner's colour worked out once, for all its triangles)
        const colours = typeof tone === "function" ? points.map((point, k) => tone(point, normalAt(k), material) ?? WHITE) : null;
        const colour = (index) => colours?.[index] ?? tone ?? WHITE;

        for (let i = 1; i < points.length - 1; i++) {
            lay(group, points[0], normalAt(0), across[0], colour(0));
            lay(group, points[i], normalAt(i), across[i], colour(i));
            lay(group, points[i + 1], normalAt(i + 1), across[i + 1], colour(i + 1));
        }
    }

    /**
     * A flat face whose corners may be listed either way round: turned to face `out` (a
     * direction). For faces worked out from directions rather than laid out by hand. (`normals`,
     * if given, as the face's corners are listed.)
     */
    facing(points, out, material, uvs, tone = this.tone, normals = null) {
        const normal = normalOf(points[0], points[1], points[2]);

        if (dot(normal, out) < 0) {
            return this.face([...points].reverse(), material, uvs && [...uvs].reverse(), tone, normals && [...normals].reverse());
        }

        return this.face(points, material, uvs, tone, normals);
    }

    /**
     * A squared timber (or a stone band, an iron strap) lying on a surface: from `a` to `b` (its
     * middle line on the surface), `width` across and standing `depth` proud of the surface
     * facing `out`. Its faces are the front and sides (and its ends, unless `ends` is false);
     * nothing behind it, which is against the surface. Its texture runs along it.
     */
    member(a, b, out, width, depth, material, { ends = true, tone = this.tone } = {}) {
        const along = sub(b, a);
        const length = Math.hypot(...along);

        if (length < 1e-6) {
            return this;
        }

        const d = times(along, 1 / length);
        const side = times(unit(cross(out, d)), width / 2);
        const lift = times(unit(out), depth);
        const [a0, a1, b0, b1] = [sub(a, side), add3(a, side), sub(b, side), add3(b, side)];
        const [a0o, a1o, b0o, b1o] = [a0, a1, b0, b1].map((p) => add3(p, lift));
        const uvs = (w) => [[0, 0], [length, 0], [length, w], [0, w]];

        this.facing([a0o, b0o, b1o, a1o], out, material, uvs(width), tone);

        // (Its sides and ends only worth drawing near, if it stands only a little proud: from
        // further off they're too thin to see, and the surface is behind them)
        this.#near(depth <= NEAR_DEPTH, () => {
            this.facing([a0, b0, b0o, a0o], times(side, -1), material, uvs(depth), tone);
            this.facing([a1, b1, b1o, a1o], side, material, uvs(depth), tone);

            if (ends) {
                this.facing([a0, a1, a1o, a0o], times(d, -1), material, [[0, 0], [width, 0], [width, depth], [0, depth]], tone);
                this.facing([b0, b1, b1o, b0o], d, material, [[0, 0], [width, 0], [width, depth], [0, depth]], tone);
            }
        });

        return this;
    }

    /**
     * A squared beam standing free (a strut, a bracket, a post) from `a` to `b`: `width` across
     * and `height` up (as it would be lying level; `up` says which way that is), all four sides
     * and its ends.
     */
    beam(a, b, width, height, material, { up = [0, 1, 0], ends = true, tone = this.tone } = {}) {
        const d = unit(sub(b, a));
        const side = unit(cross(d, up));
        const lift = unit(cross(side, d));
        const [s, l] = [times(side, width / 2), times(lift, height / 2)];
        const corners = (p) => [add3(add3(p, s), l), add3(sub(p, s), l), sub(sub(p, s), l), sub(add3(p, s), l)];
        const [ca, cb] = [corners(a), corners(b)];
        const outs = [l, times(s, -1), times(l, -1), s];

        // (Between corners k and k + 1: the top, the left side, the bottom, the right side)
        for (let k = 0; k < 4; k++) {
            const j = (k + 1) % 4;

            this.facing([ca[k], ca[j], cb[j], cb[k]], outs[k], material, undefined, tone);
        }

        if (ends) {
            this.facing(ca, times(d, -1), material, undefined, tone);
            this.facing(cb, d, material, undefined, tone);
        }

        return this;
    }

    /**
     * A ridge of triangular section (a roof's ridge tiles, a thatch's ridge) from `a` to `b`,
     * `half` wide either side and rising `height` in the middle, with its ends closed.
     */
    prism(a, b, half, height, material, tone = this.tone) {
        const d = unit(sub(b, a));
        const side = times(unit(cross([0, 1, 0], d)), half);
        const up = [0, height, 0];
        const [a0, a1, at] = [sub(a, side), add3(a, side), add3(a, up)];
        const [b0, b1, bt] = [sub(b, side), add3(b, side), add3(b, up)];

        this.facing([a0, b0, bt, at], add3(times(side, -1), up), material, undefined, tone);
        this.facing([a1, b1, bt, at], add3(side, up), material, undefined, tone);
        this.facing([a0, a1, at], times(d, -1), material, undefined, tone);
        this.facing([b0, b1, bt], d, material, undefined, tone);

        return this;
    }

    /**
     * A wall's face with openings let into it: the face (a plane: `origin`, a corner at its
     * foot; `across`, along it; `out`, the way it faces; up is up), `length` along and `height`
     * up, in `material`, with a hole for each opening ({ u0, u1, v0, v1 (along it and up it,
     * from the origin), depth (how far in its back is), back (what fills it at the back: a
     * material, or null for nothing), sides (the reveals' material: the wall's unless given),
     * arch (one of ARCHES: the back shaped so, the rest of the opening filled with the wall) }).
     * The reveals are shaded (`reveal`: a colour) as they're out of the light. A gable's face has
     * an outline (`line`: [[u, v]...] from one end to the other) instead of a level top. A
     * battered wall leans in as it rises (`lean`: how far in for each pixel up), its ends drawn
     * in with it (`ends`: how far along for each pixel up at its start and its end, where it
     * meets the next wall leaning in too: `lean` each at a square corner).
     */
    wall({ origin, across, out }, length, height, openings, material, { reveal = [0.72, 0.7, 0.68], line = null, lean = 0, ends = [lean, lean] } = {}) {
        const up = [-out[0] * lean, 1, -out[2] * lean];
        // (Along a battered wall, its ends drawn in as it rises)
        const along = lean ? (u, v) => ends[0] * v + (u * (length - (ends[0] + ends[1]) * v)) / length : (u) => u;
        const at = (u, v, w = 0) => add3(add3(add3(origin, times(across, along(u, v))), times(up, v)), times(out, -w));
        const cuts = openings.filter(({ u0, u1, v0, v1 }) => u1 > u0 && v1 > v0);
        const topAt = (u) => (line ? outlineAt(line, u) : height);

        // The face: in columns between the openings' sides (and a gable's corners), each column
        // in pieces between the openings in it, up to the top (level, or a gable's slope)
        const us = [...new Set([0, length, ...cuts.flatMap(({ u0, u1 }) => [u0, u1]), ...(line ?? []).map(([u]) => u)])].filter((u) => u >= 0 && u <= length).sort((p, q) => p - q);

        for (let k = 0; k < us.length - 1; k++) {
            const [ua, ub] = [us[k], us[k + 1]];

            if (ub - ua < 1e-6) {
                continue;
            }

            const within = cuts.filter(({ u0, u1 }) => u0 <= ua + 1e-6 && u1 >= ub - 1e-6).sort((p, q) => p.v0 - q.v0);
            let v = 0;

            for (const { v0, v1 } of within) {
                if (v0 > v + 1e-6) {
                    this.facing([at(ua, v), at(ub, v), at(ub, v0), at(ua, v0)], out, material);
                }

                v = Math.max(v, v1);
            }

            const [ta, tb] = [topAt(ua), topAt(ub)];
            const corners = [at(ua, v), at(ub, v), at(ub, Math.max(v, tb)), at(ua, Math.max(v, ta))].filter((point, i, all) => i === 0 || Math.hypot(...sub(point, all[i - 1])) > 1e-6);

            if (corners.length >= 3 && Math.max(ta, tb) > v + 1e-6) {
                this.facing(corners, out, material);
            }
        }

        // Each opening's reveals, and what fills its back
        for (const { u0, u1, v0, v1, depth, back = null, sides = material, arch = null } of cuts) {
            const shade = (point, normal) => {
                const own = typeof this.tone === "function" ? this.tone(point, normal, sides) ?? WHITE : WHITE;

                return own.map((channel, i) => channel * reveal[i]);
            };

            this.facing([at(u0, v0), at(u0, v1), at(u0, v1, depth), at(u0, v0, depth)], across, sides, undefined, shade);
            this.facing([at(u1, v0), at(u1, v1), at(u1, v1, depth), at(u1, v0, depth)], times(across, -1), sides, undefined, shade);
            this.facing([at(u0, v1), at(u1, v1), at(u1, v1, depth), at(u0, v1, depth)], [0, -1, 0], sides, undefined, shade);
            this.facing([at(u0, v0), at(u1, v0), at(u1, v0, depth), at(u0, v0, depth)], [0, 1, 0], sides, undefined, shade);

            if (!back) {
                continue;
            }

            if (!arch) {
                this.facing([at(u0, v0, depth), at(u1, v0, depth), at(u1, v1, depth), at(u0, v1, depth)], out, back);
                continue;
            }

            // A shaped back (an arch, a round or keyhole opening: its outline round from the
            // bottom left, anticlockwise, and every point of it seen from its middle), in a fan
            // from the middle; and the wall filling the rest of the opening round it, between
            // each side of the outline and where the lines out from the middle through its ends
            // meet the opening's edge (with any corner of the opening between them)
            const outline = openingOutline(arch, u0, u1, v0, v1);
            const [mu, mv] = [(u0 + u1) / 2, (v0 + v1) / 2];
            const angleOf = ([u, v]) => Math.atan2(v - mv, u - mu);
            const toEdge = ([u, v]) => {
                const [du, dv] = [u - mu, v - mv];
                const t = Math.min(Math.abs(du) > 1e-9 ? (u1 - mu) / Math.abs(du) : Infinity, Math.abs(dv) > 1e-9 ? (v1 - mv) / Math.abs(dv) : Infinity);

                return [mu + du * t, mv + dv * t];
            };
            const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map((corner) => ({ corner, angle: angleOf(corner) }));
            const turn = (from, to) => (((to - from) % TAU) + TAU) % TAU;

            this.facing([[mu, mv], ...outline, outline[0]].map(([u, v]) => at(u, v, depth)), out, back);

            outline.forEach((a, i) => {
                const b = outline[(i + 1) % outline.length];
                const [from, span] = [angleOf(a), turn(angleOf(a), angleOf(b))];
                const between = corners.filter(({ angle }) => turn(from, angle) > 1e-9 && turn(from, angle) < span - 1e-9).sort((p, q) => turn(from, q.angle) - turn(from, p.angle));
                const piece = [a, b, toEdge(b), ...between.map(({ corner }) => corner), toEdge(a)];

                for (let k = 1; k < piece.length - 1; k++) {
                    const [p, q, r] = [piece[0], piece[k], piece[k + 1]];

                    // (Nothing to fill where the outline runs along the opening's own edge)
                    if (Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) > 1e-6) {
                        this.facing([p, q, r].map(([u, v]) => at(u, v, depth)), out, material);
                    }
                }
            });
        }

        return this;
    }

    /**
     * A box from (x0, y0, z0) to (x1, y1, z1), without a bottom (it stands on something), unless
     * it's given one (`under`: its material) to be seen from below.
     */
    box(x0, y0, z0, x1, y1, z1, material, { top = material, under = null } = {}) {
        this.face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], top);

        // (Its underside too, if it's to be seen from below: a ceiling's, a beam's overhead)
        if (under) {
            this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], under);
        }

        this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], material);
        this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], material);
        this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], material);
        this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], material);

        return this;
    }

    /** A box standing on the ground at (cx, cz), turned `angle` radians about the vertical. */
    turnedBox(cx, cz, halfX, halfZ, y0, y1, angle, material) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const at = (x, z, y) => [cx + x * cos - z * sin, y, cz + x * sin + z * cos];
        const corners = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
        const bottom = corners.map(([x, z]) => at(x, z, y0));
        const top = corners.map(([x, z]) => at(x, z, y1));

        this.face([top[0], top[3], top[2], top[1]], material);

        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;

            this.face([bottom[j], bottom[i], top[i], top[j]], material);
        }

        return this;
    }

    /**
     * A pitched roof over the rectangle (x0, z0) to (x1, z1), its eaves at height `eaves`, rising
     * `pitch` pixels to the ridge. `ridge` is "x" (running east to west) or "z" (north to south);
     * a hipped roof slopes at the ends too, a gabled one has upright gable ends in `gable`.
     */
    roof(x0, z0, x1, z1, eaves, pitch, { ridge = "x", hipped = false, material, gable }) {
        const top = eaves + pitch;

        if (ridge === "x") {
            const mid = (z0 + z1) / 2;
            const inset = hipped ? Math.min((z1 - z0) / 2, (x1 - x0) / 2) : 0;
            const slope = Math.hypot(pitch, (z1 - z0) / 2);
            const a = x0 + inset;
            const b = x1 - inset;

            // South and north slopes: texture rows run along the eaves
            this.face([[x0, eaves, z1], [x1, eaves, z1], [b, top, mid], [a, top, mid]], material, [[x0, 0], [x1, 0], [b, slope], [a, slope]]);
            this.face([[x1, eaves, z0], [x0, eaves, z0], [a, top, mid], [b, top, mid]], material, [[x1, 0], [x0, 0], [a, slope], [b, slope]]);

            if (hipped) {
                this.face([[x1, eaves, z1], [x1, eaves, z0], [b, top, mid]], material, [[z1, 0], [z0, 0], [mid, slope]]);
                this.face([[x0, eaves, z0], [x0, eaves, z1], [a, top, mid]], material, [[z0, 0], [z1, 0], [mid, slope]]);
            } else {
                this.face([[x1, eaves, z1], [x1, eaves, z0], [x1, top, mid]], gable);
                this.face([[x0, eaves, z0], [x0, eaves, z1], [x0, top, mid]], gable);
            }
        } else {
            const mid = (x0 + x1) / 2;
            const inset = hipped ? Math.min((z1 - z0) / 2, (x1 - x0) / 2) : 0;
            const slope = Math.hypot(pitch, (x1 - x0) / 2);
            const a = z0 + inset;
            const b = z1 - inset;

            this.face([[x1, eaves, z1], [x1, eaves, z0], [mid, top, a], [mid, top, b]], material, [[z1, 0], [z0, 0], [a, slope], [b, slope]]);
            this.face([[x0, eaves, z0], [x0, eaves, z1], [mid, top, b], [mid, top, a]], material, [[z0, 0], [z1, 0], [b, slope], [a, slope]]);

            if (hipped) {
                this.face([[x0, eaves, z1], [x1, eaves, z1], [mid, top, b]], material, [[x0, 0], [x1, 0], [mid, slope]]);
                this.face([[x1, eaves, z0], [x0, eaves, z0], [mid, top, a]], material, [[x1, 0], [x0, 0], [mid, slope]]);
            } else {
                this.face([[x0, eaves, z1], [x1, eaves, z1], [mid, top, z1]], gable);
                this.face([[x1, eaves, z0], [x0, eaves, z0], [mid, top, z0]], gable);
            }
        }

        return this;
    }

    /** A pyramid roof over a rectangle, rising `pitch` pixels from `eaves`. */
    pyramid(x0, z0, x1, z1, eaves, pitch, material) {
        const apex = [(x0 + x1) / 2, eaves + pitch, (z0 + z1) / 2];
        const corners = [[x0, eaves, z0], [x0, eaves, z1], [x1, eaves, z1], [x1, eaves, z0]];

        for (let i = 0; i < 4; i++) {
            const a = corners[i];
            const b = corners[(i + 1) % 4];
            const along = Math.hypot(b[0] - a[0], b[2] - a[2]);
            // The west and east faces run halfway across the width to the apex, the others halfway
            // across the depth
            const slope = Math.hypot(pitch, (i % 2 === 0 ? x1 - x0 : z1 - z0) / 2);

            this.face([a, b, apex], material, [[0, 0], [along, 0], [along / 2, slope]]);
        }

        return this;
    }

    /**
     * An upright cylinder (or a cone, or a tapering tower) around (cx, cz): radius r0 at height y0
     * to r1 at y1. Its texture wraps around it in world pixels.
     */
    cylinder(cx, cz, y0, y1, r0, r1, material, { segments = 20, capped = true } = {}) {
        const geometry = new THREE.CylinderGeometry(r1, r0, y1 - y0, segments, 1, !capped);
        const uv = geometry.attributes.uv;
        const around = Math.PI * (r0 + r1);
        const slope = Math.hypot(y1 - y0, r0 - r1);

        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, uv.getX(i) * around, uv.getY(i) * slope);
        }

        geometry.translate(cx, (y0 + y1) / 2, cz);
        this.#meshes.push({ geometry, material });

        return this;
    }

    /** A cone roof: a cylinder that narrows to a point. */
    cone(cx, cz, y0, height, radius, material, segments = 20) {
        return this.cylinder(cx, cz, y0, y0 + height, radius, 0, material, { segments, capped: false });
    }

    /**
     * A shape turned about an upright axis at (cx, cz): its outline (`profile`: [[radius, height]...]
     * from the bottom up) swept round from `from` to `to` (radians from east, towards the south)
     * in `segments` steps. Domes, beehive huts, thatch that swells and curls in at its crown,
     * granaries, onion and pointed domes, a leaf's curve; a radius of 0 closes it to a point.
     * Its texture runs round it (world pixels, at each ring's own radius) and up the outline.
     * It's shaded smoothly round and up it (where its outline doesn't turn sharply), as the round
     * thing it is, unless `smooth` is false: a pyramid, a spire of so many sides.
     */
    lathe(cx, cz, profile, material, { segments = 16, from = 0, to = Math.PI * 2, tone = this.tone, smooth = true } = {}) {
        const step = (to - from) / segments;
        // (Each step round's way out, [cos, sin], and each halfway between; each point of the
        // outline's ring of corners, worked out once for all the faces they're corners of)
        const round = Array.from({ length: segments + 1 }, (_, i) => [Math.cos(from + i * step), Math.sin(from + i * step)]);
        const halfway = Array.from({ length: segments }, (_, i) => [Math.cos(from + (i + 0.5) * step), Math.sin(from + (i + 0.5) * step)]);
        const rings = profile.map(([r, y]) => round.map(([c, s]) => [cx + r * c, y, cz + r * s]));
        // (Each line of the outline's own way out, [across from the axis, up, 0]; and at each end
        // of it, unless the outline turns sharply there, the way between it and the next line's)
        const lines = profile.slice(0, -1).map(([r, y], k) => {
            const [dr, dy] = [profile[k + 1][0] - r, profile[k + 1][1] - y];

            return Math.hypot(dr, dy) < 1e-6 ? null : unit([dy, -dr, 0]);
        });
        const beside = (k, way) => lines.slice(way < 0 ? 0 : k + 1, way < 0 ? k : undefined).filter(Boolean).at(way < 0 ? -1 : 0);
        const around = ([across, up], [c, s]) => [c * across, up, s * across];
        // (Smooth: each line's corners' normals round its lower end and its upper, and at each
        // halfway for a ring closed to a point, shaded as the middle of each face that comes to it)
        const shading = smooth && lines.map((own, k) => {
            if (!own) {
                return null;
            }

            const [lower, upper] = [softened(own, beside(k, -1)), softened(own, beside(k, 1))];
            const [low, high] = [profile[k][0] < 1e-6 ? halfway : round, profile[k + 1][0] < 1e-6 ? halfway : round];

            return [low.map((way) => around(lower, way)), high.map((way) => around(upper, way))];
        });
        let up = 0;

        for (let k = 0; k < profile.length - 1; k++) {
            const [lower, upper] = [profile[k], profile[k + 1]];
            const [dr, dy] = [upper[0] - lower[0], upper[1] - lower[1]];
            const slope = Math.hypot(dr, dy);

            if (slope < 1e-6) {
                continue;
            }

            // (A ring closed to a point, at the foot or the top, makes each face a triangle)
            const keep = lower[0] < 1e-6 ? [0, 2, 3] : upper[0] < 1e-6 ? [0, 1, 2] : [0, 1, 2, 3];

            for (let i = 0; i < segments; i++) {
                const [a0, a1] = [from + i * step, from + (i + 1) * step];
                // (Outwards from the axis as far as the outline leans out, up as far as it leans in)
                const out = [halfway[i][0] * dy, -dr, halfway[i][1] * dy];
                const corners = [rings[k][i], rings[k][i + 1], rings[k + 1][i + 1], rings[k + 1][i]];
                const uvs = [[lower[0] * a0, up], [lower[0] * a1, up], [upper[0] * a1, up + slope], [upper[0] * a0, up + slope]];
                // (Each corner's normal; where a ring closes to a point, the one corner kept there
                // shaded as the middle of the face)
                const [below, above] = shading ? shading[k] : [];
                const normals = shading && [below[i], below[i + 1], above[upper[0] < 1e-6 ? i : i + 1], above[i]];

                this.facing(keep.map((j) => corners[j]), out, material, keep.map((j) => uvs[j]), tone, normals && keep.map((j) => normals[j]));
            }

            up += slope;
        }

        return this;
    }

    /**
     * Walls round a plan of any shape (`points`: its corners [x, z] in order, either way round),
     * standing on `y`, `height` tall: each side a wall's face (as `wall`, facing out from the
     * middle) with that side's openings let into it (`openings[k]`: the side from corner k to
     * k + 1). A round or oval house is a plan of many short sides. Returns each side's face. (A
     * side with no length, two corners at one point, is left out, and its openings with it.)
     */
    walls(points, y, height, openings, material, options = {}) {
        const [mx, mz] = points.reduce(([sx, sz], [x, z]) => [sx + x / points.length, sz + z / points.length], [0, 0]);
        const n = points.length;
        const sides = points.map(([x, z], k) => {
            const [nx, nz] = points[(k + 1) % n];
            const length = Math.hypot(nx - x, nz - z);

            if (!(length > 1e-6)) {
                return { origin: [x, y, z], across: [1, 0, 0], out: [0, 0, 1], length: 0 };
            }

            const across = [(nx - x) / length, 0, (nz - z) / length];
            const normal = [across[2], 0, -across[0]];
            const out = dot(normal, [(x + nx) / 2 - mx, 0, (z + nz) / 2 - mz]) < 0 ? times(normal, -1) : normal;

            return { origin: [x, y, z], across, out, length };
        });
        // (A battered plan's walls drawn in at each corner as far as the corner's angle makes
        // the two leaning walls meet)
        const lean = options.lean ?? 0;
        const endAt = (a, b) => lean * Math.tan(Math.acos(Math.max(-1, Math.min(1, dot(sides[a].across, sides[b].across)))) / 2);

        return sides.map((face, k) => {
            if (!face.length) {
                return face;
            }

            const ends = lean ? [endAt((k - 1 + n) % n, k), endAt(k, (k + 1) % n)] : undefined;

            this.wall(face, face.length, height, openings?.[k] ?? [], material, { ...options, ...(ends ? { ends } : {}) });

            return face;
        });
    }

    /**
     * A surface through a run of cross-sections (`rings`: each a list of [x, y, z], all the same
     * length), each point joined to the same point of the next: roofs shaped like a boat, a leaf
     * or a saddle, a hide hall's hull, a petal, a spire that twists. `closed` joins each ring's
     * last point to its first; each face faces away from the middle of the two rings it joins
     * (or `out`: a direction, or a function of a face's middle giving one). Its texture runs
     * round the rings and from each ring to the next. It's shaded smoothly where its faces meet
     * at less than a sharp angle, unless `smooth` is false.
     */
    loft(rings, material, { closed = true, out = null, tone = this.tone, smooth = true } = {}) {
        const count = rings[0].length;
        const middleOf = (points) => times(points.reduce(add3, [0, 0, 0]), 1 / points.length);
        const around = rings.map((ring) => ring.map((_, i) => (i === 0 ? 0 : null)));

        // (How far round each ring each point is, and how far up from the first ring)
        for (const [k, ring] of rings.entries()) {
            for (let i = 1; i < count; i++) {
                around[k][i] = around[k][i - 1] + Math.hypot(...sub(ring[i], ring[i - 1]));
            }
        }

        const up = rings.map(() => new Array(count).fill(0));

        for (let k = 1; k < rings.length; k++) {
            for (let i = 0; i < count; i++) {
                up[k][i] = up[k - 1][i] + Math.hypot(...sub(rings[k][i], rings[k - 1][i]));
            }
        }

        // Each face: its corners (a triangle where a ring closes to a point), their texture
        // positions, the way it faces, and its normal that way; null where there's none
        const faces = rings.slice(0, -1).map((a, k) => {
            const b = rings[k + 1];
            const centre = middleOf([...a, ...b]);

            return Array.from({ length: closed ? count : count - 1 }, (_, i) => {
                const j = (i + 1) % count;
                const [aj, bj] = [j === 0 ? around[k][count - 1] + Math.hypot(...sub(a[0], a[count - 1])) : around[k][j], j === 0 ? around[k + 1][count - 1] + Math.hypot(...sub(b[0], b[count - 1])) : around[k + 1][j]];
                const corners = [a[i], a[j], b[j], b[i]];
                const uvs = [[around[k][i], up[k][i]], [aj, up[k][j]], [bj, up[k + 1][j]], [around[k + 1][i], up[k + 1][i]]];
                // (A corner shared with the next, where a ring closes to a point: a triangle)
                const keep = [0, 1, 2, 3].filter((n, m, all) => Math.hypot(...sub(corners[n], corners[all[(m + 1) % 4]])) > 1e-6);

                if (keep.length < 3) {
                    return null;
                }

                const middle = middleOf(keep.map((n) => corners[n]));
                const way = typeof out === "function" ? out(middle) : out ?? sub(middle, centre);
                const normal = normalOf(...keep.slice(0, 3).map((n) => corners[n]));

                return { keep, corners, uvs, way, normal: dot(normal, way) < 0 ? times(normal, -1) : normal };
            });
        });
        // (Shaded smoothly: at the corner where ring k meets point i, the way between the faces
        // round it that meet `own` at less than the crease)
        const faceAt = (k, i) => faces[k]?.[closed ? (i + count) % count : i] ?? null;
        const cornerNormal = (k, i, own) => unit([faceAt(k - 1, i - 1), faceAt(k - 1, i), faceAt(k, i - 1), faceAt(k, i)].reduce((sum, face) => (face && dot(face.normal, own) > CREASE ? add3(sum, face.normal) : sum), [0, 0, 0]));

        for (const [k, row] of faces.entries()) {
            for (const [i, face] of row.entries()) {
                if (!face) {
                    continue;
                }

                const { keep, corners, uvs, way, normal } = face;
                const at = [[k, i], [k, i + 1], [k + 1, i + 1], [k + 1, i]];
                const normals = smooth ? keep.map((n) => cornerNormal(at[n][0], at[n][1], normal)) : null;

                this.facing(keep.map((n) => corners[n]), way, material, keep.map((n) => uvs[n]), tone, normals);
            }
        }

        return this;
    }

    /**
     * A round rod along a path (`points`: [x, y, z]...), `radius` thick (a number, or one for
     * each point: 0 for a point), `sides` sided: a curving rib, a root, a tusk or a horn, a
     * spike, a rope, a reed bundle bent into an arch. Its rings turn as little as they can as it
     * bends. Its ends are left open unless `caps` (true, or "end" for its last end only: its first
     * let into something). It's shaded smoothly round, as the round thing it is, unless `smooth`
     * is false: a shard, a crystal, a prism.
     */
    tube(points, radius, material, { sides = 6, caps = false, tone = this.tone, smooth = true } = {}) {
        const radii = points.map((_, i) => (Array.isArray(radius) ? radius[i] : radius));
        const last = points.length - 1;
        const tangents = points.map((p, i) => unit(sub(points[Math.min(last, i + 1)], points[Math.max(0, i - 1)])));
        let normal = unit(cross(tangents[0], Math.abs(tangents[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
        // (Each step round's [cos, sin], and each halfway to the next)
        const round = Array.from({ length: 2 * sides }, (_, h) => [Math.cos((h * Math.PI) / sides), Math.sin((h * Math.PI) / sides)]);
        // (Each ring's way out from the path at no angle round it, and at a quarter turn round)
        const frames = [];
        const rings = points.map((p, i) => {
            // (Carried along the path: turned only as far as the path turns)
            if (i > 0) {
                normal = unit(sub(normal, times(tangents[i], dot(normal, tangents[i]))));
            }

            const binormal = cross(tangents[i], normal);
            const r = radii[i];

            frames.push([normal, binormal]);

            return Array.from({ length: sides }, (_, k) => {
                const way = round[2 * k];

                return [p[0] + (normal[0] * way[0] + binormal[0] * way[1]) * r, p[1] + (normal[1] * way[0] + binormal[1] * way[1]) * r, p[2] + (normal[2] * way[0] + binormal[2] * way[1]) * r];
            });
        });
        // (Shaded smoothly: straight out from the path at each corner of each ring, tipped along
        // the path as far as the rod narrows there; half a side further round, too, for a ring
        // closed to a point, shaded as the middle of each face that comes to it)
        const outs = smooth && rings.map((_, i) => {
            const [before, after] = [Math.max(0, i - 1), Math.min(last, i + 1)];
            const along = Math.hypot(...sub(points[after], points[before]));
            const narrowing = along > 1e-9 ? (radii[after] - radii[before]) / along : 0;
            const [ahead, aside] = frames[i];
            const back = times(tangents[i], narrowing);
            const shift = radii[i] > 1e-6 ? 0 : 1;

            return Array.from({ length: sides + 1 }, (__, k) => {
                const way = round[(2 * k + shift) % (2 * sides)];
                const x = ahead[0] * way[0] + aside[0] * way[1] - back[0];
                const y = ahead[1] * way[0] + aside[1] * way[1] - back[1];
                const z = ahead[2] * way[0] + aside[2] * way[1] - back[2];
                const length = Math.hypot(x, y, z) || 1;

                return [x / length, y / length, z / length];
            });
        });

        for (let k = 0; k < rings.length - 1; k++) {
            const axis = [points[k], points[k + 1]];

            for (let i = 0; i < sides; i++) {
                const j = (i + 1) % sides;
                const corners = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]];
                const keep = [0, 1, 2, 3].filter((n, m, all) => Math.hypot(...sub(corners[n], corners[all[(m + 1) % 4]])) > 1e-6);

                if (keep.length >= 3) {
                    const middle = times(keep.map((n) => corners[n]).reduce(add3, [0, 0, 0]), 1 / keep.length);
                    const centre = times(add3(...axis), 0.5);
                    // (A ring closed to a point: the corner kept there shaded as this face's middle)
                    const at = (ring, own) => outs[ring][radii[ring] > 1e-6 ? own : i];
                    const normals = smooth && [at(k, i), at(k, i + 1), at(k + 1, i + 1), at(k + 1, i)];

                    this.facing(keep.map((n) => corners[n]), sub(middle, centre), material, undefined, tone, normals && keep.map((n) => normals[n]));
                }
            }
        }

        if (caps) {
            for (const [k, sign] of caps === "end" ? [[rings.length - 1, 1]] : [[0, -1], [rings.length - 1, 1]]) {
                if (radii[k] > 1e-6) {
                    this.facing(rings[k], times(tangents[k], sign), material, undefined, tone);
                }
            }
        }

        return this;
    }

    /**
     * A plan of any shape (`outline`: [x, z] corners in order, every one seen from its middle)
     * stood up from y0 to y1: a plinth, a platform, a terrace, a slab of a roof. Its sides lean
     * in by `batter` (world pixels over its height: every side's foot that far further out than
     * its top, as mud and dry stone walls are built), and its top is `top` (the sides' material
     * unless given; null for none). Returns the top's outline.
     */
    extrude(outline, y0, y1, material, { top = material, batter = 0, bottom = false, tone = this.tone } = {}) {
        const upper = batter ? inset(outline, batter) : outline;
        const [mx, mz] = outline.reduce(([sx, sz], [x, z]) => [sx + x / outline.length, sz + z / outline.length], [0, 0]);
        const n = outline.length;

        for (let k = 0; k < n; k++) {
            const j = (k + 1) % n;
            const [a, b, c, d] = [[outline[k][0], y0, outline[k][1]], [outline[j][0], y0, outline[j][1]], [upper[j][0], y1, upper[j][1]], [upper[k][0], y1, upper[k][1]]];
            const along = Math.hypot(b[0] - a[0], b[2] - a[2]);
            const slope = Math.hypot(y1 - y0, batter);
            const way = [(a[0] + b[0]) / 2 - mx, 0, (a[2] + b[2]) / 2 - mz];

            this.facing([a, b, c, d], way, material, [[0, 0], [along, 0], [along, slope], [0, slope]], tone);
        }

        if (top) {
            const [ux, uz] = upper.reduce(([sx, sz], [x, z]) => [sx + x / n, sz + z / n], [0, 0]);

            this.facing([[ux, y1, uz], ...upper.map(([x, z]) => [x, y1, z]), [upper[0][0], y1, upper[0][1]]], [0, 1, 0], top, undefined, tone);
        }

        if (bottom) {
            this.facing([[mx, y0, mz], ...outline.map(([x, z]) => [x, y0, z]), [outline[0][0], y0, outline[0][1]]], [0, -1, 0], material, undefined, tone);
        }

        return upper;
    }

    /** Add another solid's faces, moved by (dx, dy, dz). */
    add(other, dx = 0, dy = 0, dz = 0) {
        const object = other.toObject();

        object.position.set(dx, dy, dz);
        this.#meshes.push({ object });

        return this;
    }

    /**
     * The shape as a Three.js group of meshes (materials are Three.js materials), those only
     * worth drawing near marked so (userData.near: merged last, town3d.js joined); with its
     * chimneys' tops (`smoke`: kits/roofs.js chimney) in its userData.smoke, and its banners and
     * flags (`cloth`: world/cloth.js clothMesh's, in world pixels) in its userData.cloth.
     */
    toObject() {
        const group = new THREE.Group();

        for (const [groups, near] of [[this.#groups, false], [this.#nearGroups, true]]) {
            for (const [material, { positions, normals, uvs, colours }] of groups) {
                const geometry = new THREE.BufferGeometry();
                const mesh = new THREE.Mesh(geometry, material);

                geometry.setAttribute("position", new THREE.BufferAttribute(positions.numbers, 3));
                geometry.setAttribute("normal", new THREE.BufferAttribute(normals.numbers, 3));
                geometry.setAttribute("uv", new THREE.BufferAttribute(uvs.numbers, 2));
                geometry.setAttribute("color", new THREE.BufferAttribute(colours.numbers, 3));
                mesh.userData.near = near;
                group.add(mesh);
            }
        }

        for (const { geometry, material, object } of this.#meshes) {
            if (geometry && !geometry.attributes.color) {
                // (Coloured as the solid's faces are, corner by corner)
                const { position, normal } = geometry.attributes;
                const colours = new Float32Array(position.count * 3);

                for (let i = 0; i < position.count; i++) {
                    const point = [position.getX(i), position.getY(i), position.getZ(i)];
                    const colour = (typeof this.tone === "function" ? this.tone(point, [normal.getX(i), normal.getY(i), normal.getZ(i)], material) : this.tone) ?? WHITE;

                    colours.set(colour, i * 3);
                }

                geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
            }

            group.add(object ?? new THREE.Mesh(geometry, material));
        }

        group.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        // (Its chimneys' tops, where smoke rises from: [x, y, z, strength], world pixels)
        if (this.smoke?.length) {
            group.userData.smoke = this.smoke.map((top) => [...top]);
        }

        // (Its banners and flags, as world/cloth.js draws them, in world pixels)
        if (this.cloth?.length) {
            group.userData.cloth = this.cloth.map((piece) => ({ ...piece, at: [...piece.at], out: [...(piece.out ?? [0, 0, 1])] }));
        }

        return group;
    }
}
