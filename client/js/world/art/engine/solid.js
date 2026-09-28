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
// and z, faces facing north or south use x and y, faces facing east or west use z and y
function boxUV(point, normal) {
    const [nx, ny, nz] = normal.map(Math.abs);

    if (ny >= nx && ny >= nz) {
        return [point[0], -point[2]];
    }

    return nz >= nx ? [point[0], point[1]] : [-point[2], point[1]];
}

const WHITE = Object.freeze([1, 1, 1]);

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

function normalOf(a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n) || 1;

    return n.map((value) => value / length);
}

export class Solid {
    // Triangles for each material: { positions, normals, uvs, colours }
    #groups = new Map();
    // Ready-made meshes added whole (cylinders and cones)
    #meshes = [];

    /**
     * The colour each corner multiplies its material's by (linear [r, g, b]), from where it is
     * and which way its face faces, or null for white: tone(point, normal, material).
     */
    tone = null;

    #group(material) {
        if (!this.#groups.has(material)) {
            this.#groups.set(material, { positions: [], normals: [], uvs: [], colours: [] });
        }

        return this.#groups.get(material);
    }

    /** How many triangles there are so far. */
    get triangles() {
        let count = 0;

        for (const { positions } of this.#groups.values()) {
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
     * colour for all its corners (or a function, as the solid's), instead of the solid's.
     */
    face(points, material, uvs, tone = this.tone) {
        const normal = normalOf(points[0], points[1], points[2]);
        const group = this.#group(material);
        const colourOf = typeof tone === "function" ? (point) => tone(point, normal, material) ?? WHITE : () => tone ?? WHITE;
        const colours = points.map(colourOf);
        const corner = (index) => {
            group.positions.push(...points[index]);
            group.normals.push(...normal);
            group.uvs.push(...(uvs ? uvs[index] : boxUV(points[index], normal)));
            group.colours.push(...colours[index]);
        };

        for (let i = 1; i < points.length - 1; i++) {
            corner(0);
            corner(i);
            corner(i + 1);
        }

        return this;
    }

    /**
     * A flat face whose corners may be listed either way round: turned to face `out` (a
     * direction). For faces worked out from directions rather than laid out by hand.
     */
    facing(points, out, material, uvs, tone = this.tone) {
        const normal = normalOf(points[0], points[1], points[2]);

        if (dot(normal, out) < 0) {
            return this.face([...points].reverse(), material, uvs && [...uvs].reverse(), tone);
        }

        return this.face(points, material, uvs, tone);
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
        this.facing([a0, b0, b0o, a0o], times(side, -1), material, uvs(depth), tone);
        this.facing([a1, b1, b1o, a1o], side, material, uvs(depth), tone);

        if (ends) {
            this.facing([a0, a1, a1o, a0o], times(d, -1), material, [[0, 0], [width, 0], [width, depth], [0, depth]], tone);
            this.facing([b0, b1, b1o, b0o], d, material, [[0, 0], [width, 0], [width, depth], [0, depth]], tone);
        }

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
     * arch ("pointed" or "round": the back's top shaped so, the corners above filled with the
     * wall) }). The reveals are shaded (`reveal`: a colour) as they're out of the light. A gable's
     * face has an outline (`line`: [[u, v]...] from one end to the other) instead of a level top.
     */
    wall({ origin, across, out }, length, height, openings, material, { reveal = [0.72, 0.7, 0.68], line = null } = {}) {
        const up = [0, 1, 0];
        const at = (u, v, w = 0) => add3(add3(add3(origin, times(across, u)), times(up, v)), times(out, -w));
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

    /** A box from (x0, y0, z0) to (x1, y1, z1), without a bottom (it stands on something). */
    box(x0, y0, z0, x1, y1, z1, material, { top = material } = {}) {
        this.face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], top);
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
     */
    lathe(cx, cz, profile, material, { segments = 16, from = 0, to = Math.PI * 2, tone = this.tone } = {}) {
        const step = (to - from) / segments;
        const point = ([r, y], a) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
        let up = 0;

        for (let k = 0; k < profile.length - 1; k++) {
            const [lower, upper] = [profile[k], profile[k + 1]];
            const [dr, dy] = [upper[0] - lower[0], upper[1] - lower[1]];
            const slope = Math.hypot(dr, dy);

            if (slope < 1e-6) {
                continue;
            }

            for (let i = 0; i < segments; i++) {
                const [a0, a1] = [from + i * step, from + (i + 1) * step];
                const middle = (a0 + a1) / 2;
                // (Outwards from the axis as far as the outline leans out, up as far as it leans in)
                const out = [Math.cos(middle) * dy, -dr, Math.sin(middle) * dy];
                const corners = [point(lower, a0), point(lower, a1), point(upper, a1), point(upper, a0)];
                const uvs = [[lower[0] * a0, up], [lower[0] * a1, up], [upper[0] * a1, up + slope], [upper[0] * a0, up + slope]];
                // (A ring closed to a point, at the foot or the top, is a triangle)
                const keep = lower[0] < 1e-6 ? [0, 2, 3] : upper[0] < 1e-6 ? [0, 1, 2] : [0, 1, 2, 3];

                this.facing(keep.map((j) => corners[j]), out, material, keep.map((j) => uvs[j]), tone);
            }

            up += slope;
        }

        return this;
    }

    /**
     * Walls round a plan of any shape (`points`: its corners [x, z] in order, either way round),
     * standing on `y`, `height` tall: each side a wall's face (as `wall`, facing out from the
     * middle) with that side's openings let into it (`openings[k]`: the side from corner k to
     * k + 1). A round or oval house is a plan of many short sides. Returns each side's face.
     */
    walls(points, y, height, openings, material, options = {}) {
        const [mx, mz] = points.reduce(([sx, sz], [x, z]) => [sx + x / points.length, sz + z / points.length], [0, 0]);

        return points.map(([x, z], k) => {
            const [nx, nz] = points[(k + 1) % points.length];
            const length = Math.hypot(nx - x, nz - z);
            const across = [(nx - x) / length, 0, (nz - z) / length];
            const normal = [across[2], 0, -across[0]];
            const out = dot(normal, [(x + nx) / 2 - mx, 0, (z + nz) / 2 - mz]) < 0 ? times(normal, -1) : normal;
            const face = { origin: [x, y, z], across, out, length };

            this.wall(face, length, height, openings?.[k] ?? [], material, options);

            return face;
        });
    }

    /** Add another solid's faces, moved by (dx, dy, dz). */
    add(other, dx = 0, dy = 0, dz = 0) {
        const object = other.toObject();

        object.position.set(dx, dy, dz);
        this.#meshes.push({ object });

        return this;
    }

    /** The shape as a Three.js group of meshes (materials are Three.js materials). */
    toObject() {
        const group = new THREE.Group();

        for (const [material, { positions, normals, uvs, colours }] of this.#groups) {
            const geometry = new THREE.BufferGeometry();

            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
            group.add(new THREE.Mesh(geometry, material));
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

        return group;
    }
}
