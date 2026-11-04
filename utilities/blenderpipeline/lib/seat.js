// Rocks that touch nothing set down on what's under them, or left out (config `seat`): a scene's
// pieces of some materials (its rocks, its boulders), each its triangles joined by the points they
// share (or have at one place: a piece cut into cells is one piece still). A rock's grounded if
// something not a rock (its terrain, its castle) comes within `gap` metres of it, or a grounded rock
// does. Those that aren't, in clusters of those that touch, are moved straight down together onto
// what's under them where that's within `drop` metres, a little into it, and left out where it isn't. A
// game shows no rock hanging in the air. The full meshes and each lower detail packed beside them
// (extras.lod) are seated each among their own, as drawn: after they're simplified, which parts a
// rock from the crag it was set into as often as the artist did.

import { compactPrimitive } from "@gltf-transform/functions";
import { Matrix3, Matrix4, Vector3 } from "three";

/**
 * How far a rock set down is set into what's under it (metres), and how many times a group's
 * looked over (a rock that sat on one moved or left out may then touch nothing itself).
 */
export const SEAT = Object.freeze({ into: 0.1, passes: 4 });

// How near a point comes to a triangle (9 numbers at `t` in `triangles`; metres: to its nearest
// point on it, Ericson's way)
export function distanceTo(triangles, t, px, py, pz) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(t * 9, t * 9 + 9);
    const [abx, aby, abz, acx, acy, acz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
    const to = (x, y, z) => Math.hypot(px - x, py - y, pz - z);
    const d1 = abx * (px - ax) + aby * (py - ay) + abz * (pz - az);
    const d2 = acx * (px - ax) + acy * (py - ay) + acz * (pz - az);

    if (d1 <= 0 && d2 <= 0) {
        return to(ax, ay, az);
    }

    const d3 = abx * (px - bx) + aby * (py - by) + abz * (pz - bz);
    const d4 = acx * (px - bx) + acy * (py - by) + acz * (pz - bz);

    if (d3 >= 0 && d4 <= d3) {
        return to(bx, by, bz);
    }

    const vc = d1 * d4 - d3 * d2;

    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);

        return to(ax + abx * v, ay + aby * v, az + abz * v);
    }

    const d5 = abx * (px - cx) + aby * (py - cy) + abz * (pz - cz);
    const d6 = acx * (px - cx) + acy * (py - cy) + acz * (pz - cz);

    if (d6 >= 0 && d5 <= d6) {
        return to(cx, cy, cz);
    }

    const vb = d5 * d2 - d1 * d6;

    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);

        return to(ax + acx * w, ay + acy * w, az + acz * w);
    }

    const va = d3 * d6 - d5 * d4;

    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
        const w = (d4 - d3) / (d4 - d3 + (d5 - d6));

        return to(bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w);
    }

    const scale = 1 / (va + vb + vc);
    const [v, w] = [vb * scale, vc * scale];

    return to(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

// The height of a triangle (9 numbers at `t`) straight over or under (x, z), or NaN if it isn't
function heightOver(triangles, t, x, z) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(t * 9, t * 9 + 9);
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);

    if (Math.abs(den) < 1e-12) {
        return NaN;
    }

    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
    const l3 = 1 - l1 - l2;

    return l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6 ? NaN : l1 * ay + l2 * by + l3 * cy;
}

// One group of meshes seated among themselves (their nodes): what it did. `rock(primitive)`: whether
// a primitive's one of the rocks'; one whose mesh more than one node draws is only stood on
function seatGroup(nodes, { gap, drop, rock: isRock }) {
    // Every triangle where it is in the scene, whose piece it is (-1: not a rock's), and each
    // rock material's primitive's points' pieces
    const points = [];
    const owners = [];
    const prims = [];
    let next = 0;
    const parent = [];
    const find = (i) => {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }

        return i;
    };
    const join = (a, b) => {
        [a, b] = [find(a), find(b)];

        if (a !== b) {
            parent[a] = b;
        }
    };
    const same = new Map();
    const point = new Vector3();

    for (const node of nodes) {
        const matrix = new Matrix4().fromArray(node.getWorldMatrix());
        const shared = node.getMesh().listParents().filter((parent) => parent.propertyType === "Node").length > 1;

        for (const primitive of node.getMesh().listPrimitives()) {
            if (primitive.getMode() !== 4) {
                continue;
            }

            const rock = !shared && Boolean(primitive.getIndices()) && isRock(primitive);
            const position = primitive.getAttribute("POSITION");
            const indices = primitive.getIndices();
            const count = position.getCount();
            const at = new Float32Array(count * 3);
            const read = [];
            // (A rock's points numbered among all the group's rocks', joined where they share a place)
            const first = next;

            for (let i = 0; i < count; i++) {
                position.getElement(i, read);
                point.set(read[0], read[1], read[2]).applyMatrix4(matrix);
                at.set([point.x, point.y, point.z], i * 3);

                if (rock) {
                    parent.push(next);

                    const key = `${Math.round(point.x * 100)},${Math.round(point.y * 100)},${Math.round(point.z * 100)}`;

                    if (same.has(key)) {
                        join(next, same.get(key));
                    } else {
                        same.set(key, next);
                    }

                    next++;
                }
            }

            const corners = indices ? indices.getCount() : count;
            const corner = (k) => (indices ? indices.getScalar(k) : k);

            for (let k = 0; k + 2 < corners; k += 3) {
                const [a, b, c] = [corner(k), corner(k + 1), corner(k + 2)];

                if (rock) {
                    join(first + a, first + b);
                    join(first + b, first + c);
                }

                points.push(at[a * 3], at[a * 3 + 1], at[a * 3 + 2], at[b * 3], at[b * 3 + 1], at[b * 3 + 2], at[c * 3], at[c * 3 + 1], at[c * 3 + 2]);
                owners.push(rock ? first + a : -1);
            }

            if (rock) {
                prims.push({ node, matrix, primitive, first, count, at });
            }
        }
    }

    const triangles = Float32Array.from(points);
    const owner = Int32Array.from(owners, (o) => (o < 0 ? -1 : find(o)));

    // (Each rock's points, by its piece: where they are in the scene)
    const pieces = new Map();

    for (const { first, count, at } of prims) {
        for (let i = 0; i < count; i++) {
            const piece = find(first + i);

            if (!pieces.has(piece)) {
                pieces.set(piece, []);
            }

            pieces.get(piece).push(at[i * 3], at[i * 3 + 1], at[i * 3 + 2]);
        }
    }

    // (The triangles by the 2 m columns they're over, to look round and down through)
    const CELL = 2;
    const cells = new Map();
    const cellOf = (cx, cz) => cx * 100003 + cz;

    for (let t = 0; t < owner.length; t++) {
        const xs = [triangles[t * 9], triangles[t * 9 + 3], triangles[t * 9 + 6]];
        const zs = [triangles[t * 9 + 2], triangles[t * 9 + 5], triangles[t * 9 + 8]];

        for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
            for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++) {
                const key = cellOf(cx, cz);

                if (!cells.has(key)) {
                    cells.set(key, []);
                }

                cells.get(key).push(t);
            }
        }
    }

    // What comes within `gap` of a point but the piece: whether something not a rock does (the
    // ground, the castle: it's grounded), and the rocks that do, into `near`
    const touching = (x, y, z, self, near) => {
        const [gx, gz] = [Math.floor(x / CELL), Math.floor(z / CELL)];

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                for (const t of cells.get(cellOf(gx + dx, gz + dz)) ?? []) {
                    const other = owner[t];

                    if (other === self || near.has(other)) {
                        continue;
                    }

                    const ys = [triangles[t * 9 + 1], triangles[t * 9 + 4], triangles[t * 9 + 7]];

                    if (y >= Math.min(...ys) - gap && y <= Math.max(...ys) + gap && distanceTo(triangles, t, x, y, z) <= gap) {
                        if (other < 0) {
                            return true;
                        }

                        near.add(other);
                    }
                }
            }
        }

        return false;
    };

    // How far down the nearest thing straight under a point is but those of a cluster of rocks
    const fall = (x, y, z, cluster) => {
        let best = Infinity;

        for (const t of cells.get(cellOf(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
            const h = cluster.has(owner[t]) ? NaN : heightOver(triangles, t, x, z);

            if (h <= y) {
                best = Math.min(best, y - h);
            }
        }

        return best;
    };

    // Each rock grounded if it touches what isn't a rock, or a rock that's grounded; the rest in
    // clusters of those that touch, each set down together, or left out
    const grounded = new Set();
    const neighbours = new Map();

    for (const [piece, at] of pieces) {
        const near = new Set();

        for (let i = 0; i < at.length; i += 3) {
            if (touching(at[i], at[i + 1], at[i + 2], piece, near)) {
                grounded.add(piece);
                break;
            }
        }

        neighbours.set(piece, near);
    }

    // (Touching runs both ways)
    for (const [piece, near] of neighbours) {
        for (const other of near) {
            neighbours.get(other)?.add(piece);
        }
    }

    for (const queue = [...grounded]; queue.length; ) {
        for (const other of neighbours.get(queue.pop())) {
            if (!grounded.has(other)) {
                grounded.add(other);
                queue.push(other);
            }
        }
    }

    const moved = new Map();
    const dropped = new Set();
    const seen = new Set();
    let most = 0;
    let [set, left] = [0, 0];

    for (const piece of pieces.keys()) {
        if (grounded.has(piece) || seen.has(piece)) {
            continue;
        }

        const cluster = new Set([piece]);

        for (const queue = [piece]; queue.length; ) {
            for (const other of neighbours.get(queue.pop())) {
                if (!cluster.has(other)) {
                    cluster.add(other);
                    queue.push(other);
                }
            }
        }

        let down = Infinity;

        for (const member of cluster) {
            const at = pieces.get(member);

            seen.add(member);

            for (let i = 0; i < at.length; i += 3) {
                down = Math.min(down, fall(at[i], at[i + 1], at[i + 2], cluster));
            }
        }

        for (const member of cluster) {
            if (down <= drop) {
                moved.set(member, down + SEAT.into);
            } else {
                dropped.add(member);
            }
        }

        if (down <= drop) {
            set += cluster.size;
            most = Math.max(most, down);
        } else {
            left += cluster.size;
        }
    }

    // Moved down in each of its primitives (in the primitive's own space, as its node's turned),
    // or its triangles left out
    for (const { matrix, primitive, first, count } of prims) {
        const pieceOf = (i) => find(first + i);

        if ([...Array(count).keys()].some((i) => moved.has(pieceOf(i)))) {
            const position = primitive.getAttribute("POSITION");
            const inward = new Matrix3().setFromMatrix4(matrix).invert();
            const read = [];

            for (let i = 0; i < count; i++) {
                const down = moved.get(pieceOf(i));

                if (down) {
                    const step = new Vector3(0, -down, 0).applyMatrix3(inward);

                    position.getElement(i, read);
                    position.setElement(i, [read[0] + step.x, read[1] + step.y, read[2] + step.z]);
                }
            }
        }

        if (dropped.size && [...Array(count).keys()].some((i) => dropped.has(pieceOf(i)))) {
            const indices = primitive.getIndices();
            const kept = [];

            for (let k = 0; k + 2 < indices.getCount(); k += 3) {
                const corner = [indices.getScalar(k), indices.getScalar(k + 1), indices.getScalar(k + 2)];

                if (!corner.some((i) => dropped.has(pieceOf(i)))) {
                    kept.push(...corner);
                }
            }

            indices.setArray(count > 65535 ? Uint32Array.from(kept) : Uint16Array.from(kept));
            compactPrimitive(primitive);
        }
    }

    return { pieces: pieces.size, set, left, most };
}

/**
 * A document's rocks seated (`gap`, `drop`: metres; `rock(primitive)`, whether a primitive's one of
 * the rocks', by its material: config `seat.materials`): the full meshes, and each packed lower
 * detail, among their own. What it did: { pieces, set (moved down), left (left out), most (the
 * farthest one fell, metres) }, of the full meshes, and of each lower detail (`lods`).
 */
export function seat(document, { gap = 1, drop = 3, rock }) {
    const groups = new Map();

    for (const node of document.getRoot().listNodes()) {
        if (node.getMesh()) {
            const level = node.getExtras().lod ?? 0;

            if (!groups.has(level)) {
                groups.set(level, []);
            }

            groups.get(level).push(node);
        }
    }

    // (Looked over again while any's moved or left out: what sat on it may now touch nothing)
    const done = new Map(
        [...groups].map(([level, nodes]) => {
            const sum = { pieces: 0, set: 0, left: 0, most: 0 };

            for (let pass = 0; pass < SEAT.passes; pass++) {
                const { pieces, set, left, most } = seatGroup(nodes, { gap, drop, rock });

                Object.assign(sum, { pieces: pass ? sum.pieces : pieces, set: sum.set + set, left: sum.left + left, most: Math.max(sum.most, most) });

                if (!set && !left) {
                    break;
                }
            }

            return [level, sum];
        }),
    );
    const lods = [...done].filter(([level]) => level > 0).map(([level, result]) => ({ level, ...result }));

    return { ...(done.get(0) ?? { pieces: 0, set: 0, left: 0, most: 0 }), ...(lods.length ? { lods } : {}) };
}
