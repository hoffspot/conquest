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

/**
 * Lay a roof over the rectangle x0 to x1 (along the ridge) by z0 to z1 (across it), its eaves
 * at `eaves` (the top of the walls): `pitch` (rise over half the span), `overhang` (past the
 * walls at the eaves), `verge` (past the gables), `thickness`, `kind` ("gable", "hip" or
 * "half-hip"), `sag` (how far the ridge dips in the middle), `cover` (the roof's material name),
 * `under` (the soffit's), `cap` (the ridge and hips' tiles, or null), `barge` (bargeboards'
 * material, or null), `thatch` (thick and rounded), `swap` (the ridge runs along z instead: x0 to
 * x1 are then along z and z0 to z1 along x). Returns the roof's shape: { top (the ridge's
 * height), rise, slopeAt(across) (the roof's height over a point across it, at its surface), and
 * the gables' outlines: gable (the height of the gable wall's top at each end: the eaves up to
 * the ridge, or up to where the hip starts) }.
 */
export function pitchedRoof(solid, { x0, x1, z0, z1, eaves, pitch, overhang, verge, thickness, kind = "gable", sag = 0, cover, under, cap = null, barge = null, thatch = false, swap = false, clip = 0.65 }) {
    const put = swap ? ([x, y, z]) => [z, y, x] : (point) => point;
    const dir = swap ? ([x, y, z]) => [z, y, x] : (vector) => vector;
    const face = (points, out, name, tone) => solid.facing(points.map(put), dir(out), material(name), undefined, tone);
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

            face([at(xa, 0), at(xb, 0), at(xb, 0.5), at(xa, 0.5)], out, cover);
            face([at(xa, 0.5), at(xb, 0.5), at(xb, 1), at(xa, 1)], out, cover);
        }

        if (hipped) {
            face([[ex0, ye, ze], [rx0, ye, ze], [rx0, top, mid]], out, cover);
            face([[rx1, ye, ze], [ex1, ye, ze], [rx1, top, mid]], out, cover);
        } else if (clipped) {
            const zc = mid + side * clipAcross;

            face([[ex0, ye, ze], [rx0, ye, ze], [rx0, top, mid], [ex0, clipHeight, zc]], out, cover);
            face([[rx1, ye, ze], [ex1, ye, ze], [ex1, clipHeight, zc], [rx1, top, mid]], out, cover);
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

        face([[ex0, ye - thickness, ze], [ex1, ye - thickness, ze], [hipped ? x1 : ex1, eaves - thickness, zw], [hipped ? x0 : ex0, eaves - thickness, zw]], [0, -1, 0], under);
    }

    // The ends: a hip's slope (with its own eaves and soffit), or the verge of a gable (the roof's
    // cut edge along the rake, the soffit under the overhang, bargeboards), and a half-hip's
    // little hip over it
    for (const end of [-1, 1]) {
        const ex = end < 0 ? ex0 : ex1;
        const rx = end < 0 ? rx0 : rx1;
        const xw = end < 0 ? x0 : x1;

        if (hipped) {
            face([[ex, ye, zn], [ex, ye, zs], [rx, top, mid]], [end, 1, 0], cover);

            if (thatch) {
                const round = thickness * 0.45;

                face([[ex, ye, zn], [ex, ye, zs], [ex + end * round * 0.6, ye - round, zs], [ex + end * round * 0.6, ye - round, zn]], [end, 0.5, 0], cover);
                face([[ex + end * round * 0.6, ye - round, zn], [ex + end * round * 0.6, ye - round, zs], [ex, ye - thickness, zs], [ex, ye - thickness, zn]], [end, -0.3, 0], cover);
            } else {
                face([[ex, ye, zn], [ex, ye, zs], [ex, ye - thickness, zs], [ex, ye - thickness, zn]], [end, 0, 0], barge ?? under);
            }

            face([[ex, ye - thickness, zn], [ex, ye - thickness, zs], [xw, eaves - thickness, z1], [xw, eaves - thickness, z0]], [0, -1, 0], under);
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
            face([[ex, ye - thickness, ze], [ex, peakY - thickness, peakZ(side)], [xw, peakY - thickness, peakZ(side)], [xw, eaves - thickness, zw]], [0, -1, 0], under);

            if (barge && !thatch) {
                solid.member(put([ex + end * 0.1, ye - thickness * 0.4, ze]), put([ex + end * 0.1, peakY - thickness * 0.4, peakZ(side)]), dir([end, 0, 0]), thickness * 1.8, 0.35, material(barge), { ends: false });
            }
        }

        if (clipped) {
            face([[ex, clipHeight, mid - clipAcross], [ex, clipHeight, mid + clipAcross], [rx, top, mid]], [end, 1, 0], cover);
            face([[ex, clipHeight, mid - clipAcross], [ex, clipHeight, mid + clipAcross], [ex, clipHeight - thickness, mid + clipAcross], [ex, clipHeight - thickness, mid - clipAcross]], [end, 0, 0], thatch ? cover : barge ?? under);
        }
    }

    // Along the ridge: a raised block of thatch with a scalloped edge each side, or ridge tiles;
    // and tiles down the hips
    if (thatch) {
        const band = m(0.55);

        for (let i = 0; i < segments; i++) {
            const [xa, xb] = [xs[i], xs[i + 1]];
            const [ya, yb] = [ridgeY(xa), ridgeY(xb)];

            for (const side of [1, -1]) {
                const lower = (x, y) => [x, y - band * pitch * 0.98 + m(0.12), mid + side * band];

                face([[xa, ya + m(0.2), mid], [xb, yb + m(0.2), mid], lower(xb, yb), lower(xa, ya)], [0, 1, side * pitch], "thatch-grey");

                // Scallops: points of the band hanging down the slope
                const scallops = Math.max(1, Math.round((xb - xa) / m(0.6)));

                for (let k = 0; k < scallops; k++) {
                    const [sa, sb] = [xa + ((xb - xa) * k) / scallops, xa + ((xb - xa) * (k + 1)) / scallops];
                    const sy = ya + ((yb - ya) * (k + 0.5)) / scallops;
                    const [pa, pb] = [lower(sa, ya + ((yb - ya) * k) / scallops), lower(sb, ya + ((yb - ya) * (k + 1)) / scallops)];
                    const point = [(sa + sb) / 2, sy - (band + m(0.25)) * pitch + m(0.1), mid + side * (band + m(0.25))];

                    face([pa, pb, point], [0, 1, side * pitch], "thatch-grey");
                }
            }
        }

        if (length <= 0) {
            solid.prism(put([rx0 - m(0.3), top, mid]), put([rx0 + m(0.3), top, mid]), m(0.3), m(0.2), material("thatch-grey"));
        }
    } else if (cap) {
        for (let i = 0; i < segments; i++) {
            solid.prism(put([xs[i], ridgeY(xs[i]) - m(0.02), mid]), put([xs[i + 1], ridgeY(xs[i + 1]) - m(0.02), mid]), m(0.16), m(0.14), material(cap));
        }

        if (hipped) {
            for (const [ex, rx] of [[ex0, rx0], [ex1, rx1]]) {
                for (const ze of [zn, zs]) {
                    solid.member(put([ex, ye + m(0.02), ze]), put([rx, top + m(0.02), mid]), dir([0, 1, 0]), m(0.32), m(0.1), material(cap), { ends: false });
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
export function chimney(solid, { x, z, w, d, base, height, name, pots = 0 }) {
    const stack = material(name);

    solid.box(x - w / 2, base, z - d / 2, x + w / 2, height, z + d / 2, stack);
    solid.box(x - w / 2 - m(0.06), height - m(0.2), z - d / 2 - m(0.06), x + w / 2 + m(0.06), height, z + d / 2 + m(0.06), material("stone-dark"));

    for (let k = 0; k < pots; k++) {
        const px = x + (pots === 1 ? 0 : (k - (pots - 1) / 2) * m(0.3));

        solid.cylinder(px, z, height, height + m(0.4), m(0.11), m(0.09), material("clay"), { segments: 6 });
    }

    // (Its top, where its smoke rises from: smoke.js)
    (solid.smoke ??= []).push([x, height + (pots ? m(0.4) : m(0.05)), z, 1]);
}
