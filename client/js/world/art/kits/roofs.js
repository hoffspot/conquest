// Roofs for the houses (house.js), in the art's world pixels (five to a metre): gabled, hipped or
// half-hipped (a gable with its top clipped back as a little hip), with real thickness, so their
// edges read from the street: the eaves' fascia and the soffit under the overhang, the verges at
// the gables (with bargeboards on timber houses), tiles along the ridge and down the hips. An old
// roof's ridge can sag in the middle. Thatch is thick, its eaves rounded and its ridge a raised
// block with a scalloped edge.
//
// A roof is worked out with its ridge along x ("across" is z), and turned (x and z swapped) for a
// ridge running the other way; every face is laid facing the way it should, so the swap (a mirror)
// doesn't turn any inside out.

import { material } from "../engine/materials.js";

const M = 5;
const m = (metres) => metres * M;

// The tiles along a ridge and down a hip (metres): how far out over each slope they reach from
// where the slopes meet, and how high over that line they rise; how far they're sunk into the
// slopes, so the slopes meet them with no hairline of light; and how far a gable's ridge tiles
// run on past its verges
const CAP = Object.freeze({ ridge: Object.freeze({ width: 0.15, rise: 0.08 }), hip: Object.freeze({ width: 0.13, rise: 0.07 }), sink: 0.01, past: 0.04 });

const plus = (p, q, k = 1) => p.map((v, i) => v + q[i] * k);
const minus = (p, q) => p.map((v, i) => v - q[i]);
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const crossOf = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const unit = (v) => v.map((x) => x / Math.hypot(...v));

/**
 * Lay a roof over the rectangle x0 to x1 (along the ridge) by z0 to z1 (across it), its eaves
 * at `eaves` (the top of the walls): `pitch` (rise over half the span), `overhang` (past the
 * walls at the eaves), `verge` (past the gables), `thickness`, `kind` ("gable", "hip" or
 * "half-hip"), `sag` (how far the ridge dips in the middle), `cover` (the roof's material name),
 * `under` (the soffit's), `cap` (the ridge and hips' tiles, or null), `barge` (bargeboards'
 * material, or null), `thatch` (thick and rounded), `swap` (the ridge runs along z instead: x0 to
 * x1 are then along z and z0 to z1 along x), `open` (nothing under it, no walls nor loft: a well's,
 * a shelter's on posts: the underside of each slope, the soffit's material, laid all the way up
 * to the ridge, seen from below, in place of the soffits under the overhangs only; without it, its
 * slopes are seen from above alone, and from under one with no walls the sky shows through).
 * Returns the roof's shape: { top (the ridge's height), rise, slopeAt(across) (the roof's height
 * over a point across it, at its surface), and the gables' outlines: gable (the height of the
 * gable wall's top at each end: the eaves up to the ridge, or up to where the hip starts) }.
 */
export function pitchedRoof(solid, { x0, x1, z0, z1, eaves, pitch, overhang, verge, thickness, kind = "gable", sag = 0, cover, under, cap = null, barge = null, thatch = false, swap = false, clip = 0.65, open = false }) {
    const put = swap ? ([x, y, z]) => [z, y, x] : (point) => point;
    const dir = swap ? ([x, y, z]) => [z, y, x] : (vector) => vector;
    const face = (points, out, name, tone) => solid.facing(points.map(put), dir(out), material(name), undefined, tone);
    // (A slope's face, and, open, its underside: as far under it as the roof is thick, facing down
    // and in; a soffit, only where there's no underside of the slope over it)
    const slope = (points, out) => {
        face(points, out, cover);

        if (open) {
            face(points.map(([x, y, z]) => [x, y - thickness, z]), out.map((v) => -v), under);
        }
    };
    const soffit = (points, out) => !open && face(points, out, under);
    // Tiles where two slopes meet, along the line they meet on (`stations` along it: each `at` a
    // point on it, `feet` a point on each slope out from it, `normals` each slope's, up out of
    // it), rising `rise` over it the way `up` says: each side from its foot up over the line, and
    // under each side a face lying back down its slope to the line, so it's closed all round and
    // shows no light under it however low it's seen from; its ends closed. All of it sunk a little
    // into the slopes, so they meet it with no hairline.
    const capOver = (stations, up, rise) => {
        const sunk = (p) => plus(p, up, -m(CAP.sink));
        const sections = stations.map(({ at, feet, normals }) => ({ at: sunk(at), top: sunk(plus(at, up, rise)), feet: feet.map(sunk), normals }));

        for (let i = 0; i < sections.length - 1; i++) {
            const [a, b] = [sections[i], sections[i + 1]];

            for (const k of [0, 1]) {
                face([a.feet[k], b.feet[k], b.top, a.top], a.normals[k], cap);
                face([a.feet[k], b.feet[k], b.at, a.at], a.normals[k].map((v) => -v), cap);
            }
        }

        for (const [{ at, top: over, feet }, out] of [[sections[0], minus(sections[0].at, sections[1].at)], [sections.at(-1), minus(sections.at(-1).at, sections.at(-2).at)]]) {
            face([feet[0], over, at], out, cap);
            face([at, over, feet[1]], out, cap);
        }
    };
    const half = (z1 - z0) / 2;
    const mid = (z0 + z1) / 2;
    const rise = half * pitch;
    const top = eaves + rise;
    const drop = overhang * pitch;
    const [ye, zn, zs] = [eaves - drop, z0 - overhang, z1 + overhang];

    // Along the ridge: where the eaves and ridge run from and to at each end
    const hipped = kind === "hip";
    const clipped = kind === "half-hip";
    const endReach = hipped ? overhang : verge;
    const [ex0, ex1] = [x0 - endReach, x1 + endReach];
    const hipIn = hipped ? Math.min(half + overhang, (ex1 - ex0) / 2) : clipped ? (1 - clip) * half : 0;
    const [rx0, rx1] = [ex0 + hipIn, ex1 - hipIn];
    const clipHeight = eaves + clip * rise;
    const clipAcross = half * (1 - clip);
    const length = rx1 - rx0;
    const segments = Math.max(1, Math.round(length / m(2.5)));
    const ridgeY = (x) => (length > 0 ? top - sag * (1 - ((x - (rx0 + rx1) / 2) / (length / 2)) ** 2) : top);
    const xs = Array.from({ length: segments + 1 }, (_, i) => rx0 + (length * i) / segments);

    // Each slope: strips between the ridge's points, two rows up the slope (for the weathering to
    // vary over), and the ends past the ridge (a hip's triangle, a half-hip's corner)
    for (const side of [1, -1]) {
        const ze = side > 0 ? zs : zn;
        const out = [0, 1, side * pitch];
        const at = (x, t) => {
            const [y0, y1] = [ye, ridgeY(x)];

            return [x, y0 + (y1 - y0) * t, ze + (mid - ze) * t];
        };

        for (let i = 0; i < segments; i++) {
            const [xa, xb] = [xs[i], xs[i + 1]];

            slope([at(xa, 0), at(xb, 0), at(xb, 0.5), at(xa, 0.5)], out);
            slope([at(xa, 0.5), at(xb, 0.5), at(xb, 1), at(xa, 1)], out);
        }

        if (hipped) {
            slope([[ex0, ye, ze], [rx0, ye, ze], [rx0, top, mid]], out);
            slope([[rx1, ye, ze], [ex1, ye, ze], [rx1, top, mid]], out);
        } else if (clipped) {
            const zc = mid + side * clipAcross;

            slope([[ex0, ye, ze], [rx0, ye, ze], [rx0, top, mid], [ex0, clipHeight, zc]], out);
            slope([[rx1, ye, ze], [ex1, ye, ze], [ex1, clipHeight, zc], [rx1, top, mid]], out);
        }

        // The eaves' edge (rounded, on thatch), and the soffit back to the wall
        const zw = side > 0 ? z1 : z0;

        if (thatch) {
            const round = thickness * 0.45;

            face([[ex0, ye, ze], [ex1, ye, ze], [ex1, ye - round, ze + side * round * 0.6], [ex0, ye - round, ze + side * round * 0.6]], [0, 0.5, side], cover);
            face([[ex0, ye - round, ze + side * round * 0.6], [ex1, ye - round, ze + side * round * 0.6], [ex1, ye - thickness, ze], [ex0, ye - thickness, ze]], [0, -0.3, side], cover);
        } else {
            face([[ex0, ye, ze], [ex1, ye, ze], [ex1, ye - thickness, ze], [ex0, ye - thickness, ze]], [0, 0, side], barge ?? under);
        }

        soffit([[ex0, ye - thickness, ze], [ex1, ye - thickness, ze], [hipped ? x1 : ex1, eaves - thickness, zw], [hipped ? x0 : ex0, eaves - thickness, zw]], [0, -1, 0]);
    }

    // The ends: a hip's slope (with its own eaves and soffit), or the verge of a gable (the roof's
    // cut edge along the rake, the soffit under the overhang, bargeboards), and a half-hip's
    // little hip over it
    for (const end of [-1, 1]) {
        const ex = end < 0 ? ex0 : ex1;
        const rx = end < 0 ? rx0 : rx1;
        const xw = end < 0 ? x0 : x1;

        if (hipped) {
            slope([[ex, ye, zn], [ex, ye, zs], [rx, top, mid]], [end, 1, 0]);

            if (thatch) {
                const round = thickness * 0.45;

                face([[ex, ye, zn], [ex, ye, zs], [ex + end * round * 0.6, ye - round, zs], [ex + end * round * 0.6, ye - round, zn]], [end, 0.5, 0], cover);
                face([[ex + end * round * 0.6, ye - round, zn], [ex + end * round * 0.6, ye - round, zs], [ex, ye - thickness, zs], [ex, ye - thickness, zn]], [end, -0.3, 0], cover);
            } else {
                face([[ex, ye, zn], [ex, ye, zs], [ex, ye - thickness, zs], [ex, ye - thickness, zn]], [end, 0, 0], barge ?? under);
            }

            soffit([[ex, ye - thickness, zn], [ex, ye - thickness, zs], [xw, eaves - thickness, z1], [xw, eaves - thickness, z0]], [0, -1, 0]);
            continue;
        }

        const peakY = clipped ? clipHeight : top;
        const peakZ = (side) => (clipped ? mid + side * clipAcross : mid);

        for (const side of [1, -1]) {
            const ze = side > 0 ? zs : zn;
            const zw = side > 0 ? z1 : z0;
            const edge = [[ex, ye, ze], [ex, peakY, peakZ(side)]];

            // The roof's edge along the rake
            face([edge[0], edge[1], [ex, peakY - thickness, peakZ(side)], [ex, ye - thickness, ze]], [end, 0, 0], thatch ? cover : barge ?? under);
            // Under the overhang, from the verge back to the gable wall
            soffit([[ex, ye - thickness, ze], [ex, peakY - thickness, peakZ(side)], [xw, peakY - thickness, peakZ(side)], [xw, eaves - thickness, zw]], [0, -1, 0]);

            // (A board closed all round: where it stands up past the roof's edge it's seen from behind)
            if (barge && !thatch) {
                const board = ex + end * (0.1 + 0.35 / 2);

                solid.beam(put([board, ye - thickness * 0.4, ze]), put([board, peakY - thickness * 0.4, peakZ(side)]), thickness * 1.8, 0.35, material(barge), { up: dir([end, 0, 0]) });
            }
        }

        if (clipped) {
            slope([[ex, clipHeight, mid - clipAcross], [ex, clipHeight, mid + clipAcross], [rx, top, mid]], [end, 1, 0]);
            face([[ex, clipHeight, mid - clipAcross], [ex, clipHeight, mid + clipAcross], [ex, clipHeight - thickness, mid + clipAcross], [ex, clipHeight - thickness, mid - clipAcross]], [end, 0, 0], thatch ? cover : barge ?? under);
        }
    }

    // Along the ridge: a raised block of thatch with a scalloped edge each side, or ridge tiles;
    // and tiles down the hips
    if (thatch) {
        const [band, tip] = [m(0.55), m(0.8)];
        const sunk = -m(CAP.sink);
        // (A point on `side`, `out` from the ridge at x, `up` over the thatch there)
        const on = (x, side, out, up) => [x, ridgeY(x) - (out * (ridgeY(x) - ye)) / (half + overhang) + up, mid + side * out];
        const run = kind === "gable" ? [rx0 - m(CAP.past), ...xs.slice(1, -1), rx1 + m(CAP.past)] : xs;

        for (let i = 0; i < run.length - 1; i++) {
            const [xa, xb] = [run[i], run[i + 1]];

            for (const side of [1, -1]) {
                const out = [0, 1, side * pitch];

                face([[xa, ridgeY(xa) + m(0.2), mid], [xb, ridgeY(xb) + m(0.2), mid], on(xb, side, band, m(0.12)), on(xa, side, band, m(0.12))], out, "thatch-grey");

                // Scallops: points of the band hanging down the slope; and the band's edge cut
                // down into the thatch all round them, so no light shows under it
                const scallops = Math.max(1, Math.round((xb - xa) / m(0.6)));

                for (let k = 0; k < scallops; k++) {
                    const [sa, sb] = [xa + ((xb - xa) * k) / scallops, xa + ((xb - xa) * (k + 1)) / scallops];
                    const edge = [on(sa, side, band, m(0.12)), on((sa + sb) / 2, side, tip, m(0.1)), on(sb, side, band, m(0.12))];
                    const foot = [on(sa, side, band, sunk), on((sa + sb) / 2, side, tip, sunk), on(sb, side, band, sunk)];

                    face(edge, out, "thatch-grey");
                    face([edge[0], edge[1], foot[1], foot[0]], [0, 0, side], "thatch-grey");
                    face([edge[1], edge[2], foot[2], foot[1]], [0, 0, side], "thatch-grey");
                }
            }
        }

        // Its ends closed, down into the thatch
        if (run.at(-1) - run[0] > 1e-6) {
            for (const [x, end] of [[run[0], -1], [run.at(-1), 1]]) {
                const [over, ridge] = [[x, ridgeY(x) + m(0.2), mid], [x, ridgeY(x) + sunk, mid]];
                const [edges, feet] = [[-1, 1].map((side) => on(x, side, band, m(0.12))), [-1, 1].map((side) => on(x, side, band, sunk))];

                face([feet[0], edges[0], over], [end, 0, 0], "thatch-grey");
                face([feet[0], over, ridge], [end, 0, 0], "thatch-grey");
                face([ridge, over, feet[1]], [end, 0, 0], "thatch-grey");
                face([feet[1], over, edges[1]], [end, 0, 0], "thatch-grey");
            }
        }

        if (length <= 0) {
            solid.prism(put([rx0 - m(0.3), top, mid]), put([rx0 + m(0.3), top, mid]), m(0.3), m(0.2), material("thatch-grey"));
        }
    } else if (cap) {
        // The ridge's, from end to end (on past a gable's verges), across it at each of its
        // points: its feet on the two slopes there, as the ridge sags
        if (length > 1e-6) {
            const { width, rise } = CAP.ridge;
            const run = kind === "gable" ? [rx0 - m(CAP.past), ...xs.slice(1, -1), rx1 + m(CAP.past)] : xs;
            const across = run.map((x) => {
                const y = ridgeY(x);
                const pitchHere = (y - ye) / (half + overhang);

                return { at: [x, y, mid], feet: [1, -1].map((side) => [x, y - pitchHere * m(width), mid + side * m(width)]), normals: [1, -1].map((side) => unit([0, 1, side * pitchHere])) };
            });

            capOver(across, [0, 1, 0], m(rise));
        }

        // Each hip's, from the eaves' corner up to the ridge's end: its feet on the side's slope
        // and the end's, each straight out from the hip across its own slope
        if (hipped) {
            const { width, rise } = CAP.hip;

            for (const [ex, rx] of [[ex0, rx0], [ex1, rx1]]) {
                const end = ex < rx ? -1 : 1;

                for (const ze of [zn, zs]) {
                    const side = ze > mid ? 1 : -1;
                    const [low, high] = [[ex, ye, ze], [rx, top, mid]];
                    const along = unit(minus(high, low));
                    const normals = [unit([0, 1, (side * (top - ye)) / (half + overhang)]), unit([(end * (top - ye)) / Math.abs(rx - ex), 1, 0])];
                    // (Out across each slope from the hip: into the side's along the ridge, into the end's towards its middle)
                    const outs = normals.map((normal, k) => {
                        const out = unit(crossOf(normal, along));

                        return dot(out, k ? [0, 0, -side] : [-end, 0, 0]) < 0 ? out.map((v) => -v) : out;
                    });

                    capOver([low, high].map((at) => ({ at, feet: outs.map((out) => plus(at, out, m(width))), normals })), unit(plus(normals[0], normals[1])), m(rise));
                }
            }
        }
    }

    return {
        top,
        rise,
        slopeAt: (across) => eaves + (half - Math.abs(across - mid)) * pitch,
        gableTop: clipped ? clipHeight : top,
        clipAcross: clipped ? clipAcross : 0,
    };
}

/**
 * A chimney stack standing from `base` to `height` (world pixels) at (x, z) in plan, `w` by `d`,
 * of `name` (brick or stone), with a corbelled cap and, sometimes, pots; its top listed in the
 * solid's `smoke` (Solid.toObject).
 */
export function chimney(solid, { x, z, w, d, base, height, name, pots = 0, smoke = 1, tint = null }) {
    const stack = material(name);

    solid.box(x - w / 2, base, z - d / 2, x + w / 2, height, z + d / 2, stack);
    solid.box(x - w / 2 - m(0.06), height - m(0.2), z - d / 2 - m(0.06), x + w / 2 + m(0.06), height, z + d / 2 + m(0.06), material("stone-dark"));

    for (let k = 0; k < pots; k++) {
        const px = x + (pots === 1 ? 0 : (k - (pots - 1) / 2) * m(0.3));

        solid.cylinder(px, z, height, height + m(0.4), m(0.11), m(0.09), material("clay"), { segments: 6 });
    }

    // (Its top, where its smoke rises from, as strong as `smoke`, its own colour `tint` if it has
    // one: smoke.js)
    (solid.smoke ??= []).push([x, height + (pots ? m(0.4) : m(0.05)), z, smoke, ...(tint === null ? [] : [tint])]);
}
