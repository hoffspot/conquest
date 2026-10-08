// How a dungeon level's rooms join up (core/dungeons: docs/DUNGEONS.md): before it's dug, which
// points to join (a Gabriel graph, the shortest tree through it, and a few more of its edges for
// loops, where one saves a long way round); and once it's dug, read back from its squares: each
// room, which rooms each passage joins, the way from one room to another, and the rooms with only
// one way in (dead ends). Whole numbers and exact.js only.

import { hypot } from "../exact.js";
import { FOUR } from "./grid.js";

const square = ([ax, ay], [bx, by]) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/**
 * The Gabriel graph of some points ([[x, y], ...]): an edge [i, j] (i < j) wherever no other point
 * is inside the circle across i and j. Edges in order of i, then j.
 */
export function gabriel(points) {
    const edges = [];

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const across = square(points[i], points[j]);
            const blocked = points.some((p, k) => k !== i && k !== j && square(p, points[i]) + square(p, points[j]) < across);

            if (!blocked) {
                edges.push([i, j]);
            }
        }
    }

    return edges;
}

/**
 * The shortest tree through some points along some of their edges (Kruskal's: shortest first, ties
 * by the edges' order): the edges in it, in the order taken. `skip` (a point's index, or -1) is left
 * out of it.
 */
export function spanningTree(points, edges, skip = -1) {
    const parent = points.map((each, k) => k);
    const root = (k) => {
        while (parent[k] !== k) {
            parent[k] = parent[parent[k]];
            k = parent[k];
        }

        return k;
    };
    const tree = [];
    const sorted = edges
        .map((edge, k) => ({ edge, k, d: square(points[edge[0]], points[edge[1]]) }))
        .filter(({ edge }) => edge[0] !== skip && edge[1] !== skip)
        .sort((a, b) => a.d - b.d || a.k - b.k);

    for (const { edge } of sorted) {
        const [a, b] = [root(edge[0]), root(edge[1])];

        if (a !== b) {
            parent[a] = b;
            tree.push(edge);
        }
    }

    return tree;
}

/**
 * How far it is from point `from` to every other point going along `edges` only (metres between
 * points, exact.js hypot): a list, Infinity where there's no way.
 */
export function alongEdges(points, edges, from) {
    const far = points.map(() => Infinity);
    const done = points.map(() => false);

    far[from] = 0;

    for (let round = 0; round < points.length; round++) {
        let at = -1;

        for (let k = 0; k < points.length; k++) {
            if (!done[k] && far[k] < Infinity && (at < 0 || far[k] < far[at])) {
                at = k;
            }
        }

        if (at < 0) {
            break;
        }

        done[at] = true;

        for (const [a, b] of edges) {
            const other = a === at ? b : b === at ? a : -1;

            if (other >= 0) {
                const [dx, dy] = [points[a][0] - points[b][0], points[a][1] - points[b][1]];

                far[other] = Math.min(far[other], far[at] + hypot(dx, dy));
            }
        }
    }

    return far;
}

/**
 * Which of `spare` edges to add to a tree for loops: those that save the most going round (the way
 * along the tree less the edge's own length), `detour` metres at the least, `count` at most, none
 * touching `skip` (a point's index, or -1). The edges, best first.
 */
export function loopsFor(points, tree, spare, { count, detour, skip = -1 }) {
    const taken = [...tree];
    const loops = [];

    for (let round = 0; round < count; round++) {
        let best = null;

        for (const [k, edge] of spare.entries()) {
            const [a, b] = edge;

            if (a === skip || b === skip || taken.some(([i, j]) => (i === a && j === b) || (i === b && j === a))) {
                continue;
            }

            const around = alongEdges(points, taken, a)[b];
            const saves = around - hypot(points[a][0] - points[b][0], points[a][1] - points[b][1]);

            if (saves >= detour && (!best || saves > best.saves || (saves === best.saves && k < best.k))) {
                best = { edge, saves, k };
            }
        }

        if (!best) {
            break;
        }

        taken.push(best.edge);
        loops.push(best.edge);
    }

    return loops;
}

/**
 * The rooms dug in a grid (grid.js), from its squares' room ids (0 to `count` - 1): [{ id, area
 * (squares), x, y, w, h (its bounds), centre: [x, y] (its square nearest its middle), cells:
 * [square index...] }], a room with no squares left out.
 */
export function roomsOf(grid, count) {
    const cells = Array.from({ length: count }, () => []);

    for (let k = 0; k < grid.cells.length; k++) {
        const id = grid.room[k];

        if (grid.cells[k] && id >= 0 && id < count) {
            cells[id].push(k);
        }
    }

    return cells.flatMap((list, id) => {
        if (!list.length) {
            return [];
        }

        const xs = list.map((k) => k % grid.width);
        const ys = list.map((k) => Math.floor(k / grid.width));
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        // (Its middle: the mean of its squares, twice over, as whole numbers; then its square nearest that)
        const [sx, sy] = [xs.reduce((a, b) => a + b, 0), ys.reduce((a, b) => a + b, 0)];
        const n = list.length;
        let centre = list[0];
        let best = Infinity;

        for (const k of list) {
            const [x, y] = [k % grid.width, Math.floor(k / grid.width)];
            const d = (x * n - sx) * (x * n - sx) + (y * n - sy) * (y * n - sy);

            if (d < best) {
                [best, centre] = [d, k];
            }
        }

        return [{ id, area: n, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, centre: [centre % grid.width, Math.floor(centre / grid.width)], cells: list }];
    });
}

/**
 * Which rooms join which, read from a grid: rooms side by side, and rooms a passage (its squares'
 * room -1) runs between, every room a passage touches joined to every other. [[a, b], ...] (a <
 * b), each once, in order.
 */
export function linksOf(grid) {
    const { width, height } = grid;
    const pairs = new Set();
    const join = (a, b) => {
        if (a !== b && a >= 0 && b >= 0) {
            pairs.add(a < b ? a * 65536 + b : b * 65536 + a);
        }
    };
    const seen = new Uint8Array(width * height);

    for (let k = 0; k < grid.cells.length; k++) {
        if (!grid.cells[k]) {
            continue;
        }

        const [x, y] = [k % width, Math.floor(k / width)];

        // (Rooms side by side)
        if (grid.room[k] >= 0) {
            for (const [dx, dy] of FOUR) {
                if (grid.open(x + dx, y + dy)) {
                    join(grid.room[k], grid.room[(y + dy) * width + x + dx]);
                }
            }

            continue;
        }

        // (A passage: all its squares, and the rooms they touch)
        if (seen[k]) {
            continue;
        }

        const touched = new Set();
        const queue = [k];

        seen[k] = 1;

        while (queue.length) {
            const at = queue.pop();
            const [ax, ay] = [at % width, Math.floor(at / width)];

            for (const [dx, dy] of FOUR) {
                const [nx, ny] = [ax + dx, ay + dy];

                if (!grid.open(nx, ny)) {
                    continue;
                }

                const n = ny * width + nx;

                if (grid.room[n] >= 0) {
                    touched.add(grid.room[n]);
                } else if (!seen[n]) {
                    seen[n] = 1;
                    queue.push(n);
                }
            }
        }

        const list = [...touched].sort((a, b) => a - b);

        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                join(list[i], list[j]);
            }
        }
    }

    return [...pairs].sort((a, b) => a - b).map((key) => [Math.floor(key / 65536), key % 65536]);
}

/** Each room's neighbours (ids, in order), from its links: a Map. */
export function neighbours(rooms, links) {
    const byRoom = new Map(rooms.map(({ id }) => [id, []]));

    for (const [a, b] of links) {
        byRoom.get(a)?.push(b);
        byRoom.get(b)?.push(a);
    }

    for (const list of byRoom.values()) {
        list.sort((a, b) => a - b);
    }

    return byRoom;
}

/** The fewest rooms from one room to another through their links ([from, ..., to]), or null. */
export function roomPath(byRoom, from, to) {
    const back = new Map([[from, -1]]);
    const queue = [from];

    while (queue.length) {
        const at = queue.shift();

        if (at === to) {
            const path = [];

            for (let k = to; k !== -1; k = back.get(k)) {
                path.unshift(k);
            }

            return path;
        }

        for (const next of byRoom.get(at) ?? []) {
            if (!back.has(next)) {
                back.set(next, at);
                queue.push(next);
            }
        }
    }

    return null;
}
