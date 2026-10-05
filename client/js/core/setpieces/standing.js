// What stands about a settlement's open ground that's walked round as it's drawn, rather than by
// the squares it blocks (core/navigation/tiles.js: a lamp post's foot, not the two metres square
// round it): its props, each its outline (outlines.js, measured from the art), and its yards'
// fences, along their runs, as thick as its people's are.

import { cos, sin } from "../exact.js";
import { FENCE_BANDS, PROP_OUTLINES } from "./outlines.js";
import { PLOT } from "./pieces.js";

// A point of something turned to face `facing` about its middle (x, y): `u` across it, `v` forward
// (as town.js frame turns a piece, and the art's drawn turned: world/town3d.js)
function turned(x, y, facing, u, v) {
    const [c, s] = [cos(facing), sin(facing)];

    return [x + u * c + v * s, y - u * s + v * c];
}

/**
 * Where a prop stands (a layout's piece: x, y its middle, metres, from `origin` [x, y]): the
 * outlines there of the things it's made of, [[[x, y], ...], ...] (its people's, or anyone's;
 * none for a prop with none).
 */
export function propOutlines(piece, [ox, oy] = [0, 0]) {
    const things = (PROP_OUTLINES[piece.people] ?? PROP_OUTLINES.human)[piece.name] ?? [];

    return things.map((outline) => outline.map(([u, v]) => turned(ox + piece.x, oy + piece.y, piece.facing ?? 0, u, v)));
}

/**
 * How far into its house a yard's closed off along its front (metres): past the house's back
 * wall, however far in from its plot's edge its people draw it.
 */
export const HOUSE_REACH = 1;

/**
 * Where a yard's fences stand (a layout's yard: x, y its middle, metres, from `origin`): each run
 * of them as the four corners of the ground it stands on, [[[x, y] x 4], ...], as far in from the
 * yard's side as its people's fences reach (FENCE_BANDS), and a little past its ends; and, along
 * its front, the back of the house it's behind (town.js lays it a few centimetres off it, as wide),
 * from its yard's edge HOUSE_REACH into it: the house's own squares step round it where it's
 * turned, and would leave a way in by a fence's end.
 */
export function fenceOutlines(yard, [ox, oy] = [0, 0]) {
    const { from, to, past } = FENCE_BANDS[yard.people] ?? FENCE_BANDS.human;
    const [w, d] = [yard.w * PLOT, yard.h * PLOT];
    // (A rectangle of the yard's, metres across from its left side and in from its back)
    const rectangle = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => turned(ox + yard.x, oy + yard.y, yard.facing ?? 0, u - w / 2, v - d / 2));
    const sides = [
        (a, b) => rectangle(from, a, to, b),
        (a, b) => rectangle(a, from, b, to),
        (a, b) => rectangle(w - to, a, w - from, b),
    ];

    // (A run's drawn only if it's longer than a fifth of a metre: kits/yards.js)
    const runs = (yard.fence ?? []).flatMap((runs, k) => runs.filter(([a, b]) => b - a > 0.2).map(([a, b]) => sides[k](a - past, b + past)));

    return [...runs, rectangle(from, d, w - from, d + HOUSE_REACH)];
}
