// The fingerposts by the towns' roads (docs/WORLD.md, *Fingerposts*): one beside the main road
// out of each town, city and capital, a little way out past the edge of its ground (past its
// fields, and its walls and gates if it has them), with a board for each of the nearest three
// other towns, cities and capitals, each pointing straight at it and saying its name and how far
// it is as the crow flies. The overworld stands each one as the road out of its town is laid
// (overworld.js), the same every time; it's drawn as a prop (pieces.js PROPS signpost:
// world/art/kits/props.js). Nothing here uses Three.js, so it runs in Node too.

import { atan2, hypot } from "./exact.js";
import { propKey } from "./setpieces/pieces.js";

/** The places with a fingerpost, and those its boards point to: the towns, cities and capitals. */
export const SIGNED = Object.freeze(["town", "city", "capital"]);

/** How many boards a fingerpost has at most: one for each of the nearest towns. */
export const BOARDS = 3;

/**
 * Where a fingerpost stands (metres): how far along its road past the edge of its town's ground,
 * and how far off the road's side (each tried in turn, till there's room).
 */
export const SIGNPOST = Object.freeze({ past: [6, 9, 12, 4, 15, 18, 22, 26, 30, 35, 40], aside: [1, 3, 5] });

/** Which roads are a town's main road out (plan.roads' kinds): the biggest. */
export const ROAD_RANK = Object.freeze({ trade: 3, road: 2, track: 1 });

/**
 * A place's roads out ([{ kind, points: from its edge out }]), its main road first: the biggest
 * (trade roads, then roads, then tracks), each as big in the order they're given.
 */
export function byRank(roads) {
    return [...roads].sort((a, b) => (ROAD_RANK[b.kind] ?? 0) - (ROAD_RANK[a.kind] ?? 0));
}

/**
 * Where a fingerpost stands beside a road (`points`: [x, y] metres from the edge of its town's
 * ground out, its side `half` metres from its middle), on four squares round a corner of them
 * that are all `free(i, j)`: to the road's right going out, or else its left, as near the town
 * as there's room. { at: [x, y] (the corner: the post's middle), squares }, or null.
 */
export function signpostBeside(points, half, free) {
    for (const past of SIGNPOST.past) {
        const along = alongBy(points, past);

        if (!along) {
            continue;
        }

        const [[px, py], [hx, hy]] = [along.at, along.heading];

        for (const aside of SIGNPOST.aside) {
            // (Its middle a square's corner, the squares it stands on that far off the road)
            const side = half + aside + 1;

            for (const hand of [1, -1]) {
                const [x, y] = [Math.round(px - hy * side * hand), Math.round(py + hx * side * hand)];
                const squares = [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]];

                if (squares.every(([i, j]) => free(i, j))) {
                    return { at: [x, y], squares };
                }
            }
        }
    }

    return null;
}

/**
 * The boards on a place's fingerpost, standing at [x, y]: one for each of the nearest BOARDS
 * towns, cities and capitals but itself, the nearest first: [{ name, km (from the post, to a
 * tenth), angle (which way it points: 0 east, π/2 south) }].
 */
export function boardsFor(plan, place, [x, y]) {
    const far = (other) => hypot(other.at[0] - x, other.at[1] - y);

    return plan.places
        .filter((other) => other.id !== place.id && SIGNED.includes(other.kind))
        .sort((a, b) => far(a) - far(b))
        .slice(0, BOARDS)
        .map((other) => ({ name: other.name, km: Math.round(far(other) / 100) / 10, angle: atan2(other.at[1] - y, other.at[0] - x) }));
}

/**
 * A place's fingerpost, standing at [x, y] in the world, as a piece of a layout whose north-west
 * corner is at `origin` (as a prop: { key, kind, name, x, y (its middle), w, h, facing, boards }).
 */
export function signpostPiece(plan, place, [x, y], origin) {
    return { key: propKey("signpost"), kind: "prop", name: "signpost", x: x - origin[0], y: y - origin[1], w: 1, h: 1, facing: 0, boards: boardsFor(plan, place, [x, y]) };
}

// Where a line ([x, y] points) is `distance` along it, and which way it's heading there: { at,
// heading (a unit vector) }, or null if it's shorter
function alongBy(points, distance) {
    let left = distance;

    for (let k = 1; k < points.length; k++) {
        const [[ax, ay], [bx, by]] = [points[k - 1], points[k]];
        const long = hypot(bx - ax, by - ay);

        if (long > 0 && left <= long) {
            const t = left / long;

            return { at: [ax + (bx - ax) * t, ay + (by - ay) * t], heading: [(bx - ax) / long, (by - ay) / long] };
        }

        left -= long;
    }

    return null;
}
