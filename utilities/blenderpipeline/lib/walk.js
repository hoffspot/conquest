// Where scenery can be walked (README.md, *Where it can be walked*): its triangles laid on a grid
// of squares (a metre each, as the game's), each square's solid stretches stacked as Recast's
// heightfield stacks its spans; the tops a body can stand on (no steeper than `slope`, with
// `headroom` over them) its floors; floors side by side no more than `climb` apart, walked from
// one to the other. What's reached from `from` is kept, split into levels where one floor is
// over another: the lowest the ground level, and each stacked over it a level of its own, joined
// to the one it's reached from where a walk crosses between them (its stairs). Plain data: the
// heights of the squares a body can stand on, no mesh or texture.

import { Matrix4, Vector3 } from "three";

export const WALK = Object.freeze({
    // How big a square is (metres), as the game's
    square: 1,
    // The steepest a floor may be (degrees), and the room over it (metres)
    slope: 38,
    headroom: 2,
    // How far up or down a body steps from a square to the next (metres)
    climb: 0.8,
    // Solid stretches nearer than this (metres) are one
    merge: 0.1,
    // A level of fewer squares than this is left out (a ledge, a sill)
    least: 20,
    // How much of a square (its share) what may be stood on within a step (climb) of its top
    // covers, for it to be a floor: not a sliver at its edge, nor a pillar's top
    cover: 0.25,
});

// A square no floor of a level is on, in its heights
export const NONE = -32768;

/** Every triangle of a document's meshes (not their lower details), where it is in the scene: 9 numbers each. */
export function trianglesOf(document, { materials = null, except = null } = {}) {
    const out = [];
    const point = new Vector3();

    for (const node of document.getRoot().listNodes()) {
        const mesh = node.getMesh();

        if (!mesh || node.getExtras().lod !== undefined) {
            continue;
        }

        const matrix = new Matrix4().fromArray(node.getWorldMatrix());

        for (const primitive of mesh.listPrimitives()) {
            // (Triangles only: lines and points are walked through; and only those of the
            // materials asked for, if any are, or but those left out)
            const material = primitive.getMaterial()?.getName();

            if (primitive.getMode() !== 4 || (materials && !materials.includes(material)) || (except && except.includes(material))) {
                continue;
            }

            const position = primitive.getAttribute("POSITION");
            const indices = primitive.getIndices();
            const count = indices ? indices.getCount() : position.getCount();
            const at = [];

            for (let i = 0; i < count; i++) {
                position.getElement(indices ? indices.getScalar(i) : i, at);
                point.set(at[0], at[1], at[2]).applyMatrix4(matrix);
                out.push(point.x, point.y, point.z);
            }
        }
    }

    return new Float32Array(out);
}

// A growing list of numbers in a typed array
class Column {
    constructor(Type, size = 1 << 16) {
        this.Type = Type;
        this.data = new Type(size);
        this.length = 0;
    }

    push(value) {
        if (this.length === this.data.length) {
            const grown = new this.Type(this.data.length * 2);

            grown.set(this.data);
            this.data = grown;
        }

        this.data[this.length++] = value;
    }
}

// A polygon (x, y, z, ...) cut to the side of an axis-aligned line it's kept on: `axis` 0 is x,
// 2 is z; `keep` 1, at or over `at`; -1, at or under it
function clip(points, axis, at, keep) {
    const out = [];
    const count = points.length / 3;

    for (let i = 0; i < count; i++) {
        const a = i * 3;
        const b = ((i + 1) % count) * 3;
        const da = (points[a + axis] - at) * keep;
        const db = (points[b + axis] - at) * keep;

        if (da >= 0) {
            out.push(points[a], points[a + 1], points[a + 2]);
        }

        if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);

            out.push(points[a] + (points[b] - points[a]) * t, points[a + 1] + (points[b + 1] - points[a + 1]) * t, points[a + 2] + (points[b + 2] - points[a + 2]) * t);
        }
    }

    return out;
}

/**
 * Where scenery's triangles (9 numbers each, metres, y up) can be walked from `from` ([x, y, z]):
 * { square, origin: [x, z] of the grid's corner, size: [squares along x, along z], from, levels:
 * [{ squares, low, high, box: [x0, z0, x1, z1] (squares, inclusive), heights: Int16Array (cm,
 * NONE where it has no floor; row by row along z, each along x, within its box) }], links: [{
 * from, to (levels), crossings: [[x, z, x, z], ...] (a square of one, beside a square of the
 * other) }], left: { unreached, small } (floors no walk from `from` reaches; levels too small to
 * keep) }.
 */
export function walkOf(triangles, { from, under = null, ground: _ground = null, ...options } = {}) {
    const { square, climb, least } = { ...WALK, ...options };

    if (!Array.isArray(from) || from.length !== 3 || !from.every(Number.isFinite)) {
        throw new Error("walk.from is where it's walked from: [x, y, z]");
    }

    const { origin, width, depth, floorStarts, heightOf, columnOf, nodes } = floorsOf(triangles, options);

    // The floors beside a floor that a body steps to
    const besideOf = (node, visit) => {
        const c = columnOf[node];
        const [x, z] = [c % width, Math.floor(c / width)];

        for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            const [nx, nz] = [x + dx, z + dz];

            if (nx < 0 || nz < 0 || nx >= width || nz >= depth) {
                continue;
            }

            const n = nz * width + nx;

            for (let other = floorStarts[n]; other < floorStarts[n + 1]; other++) {
                // (A hair over: heights are kept to single precision)
                if (Math.abs(heightOf[other] - heightOf[node]) <= climb + 1e-4) {
                    visit(other);
                }
            }
        }
    };

    const walk = walkFrom({ from, square, least, origin, width, depth, floorStarts, heightOf, columnOf, nodes, besideOf });

    if (!under) {
        return walk;
    }

    // (And the highest floor over each of its patches, reached or not: the top of its ground)
    const below = underOf(triangles, under);
    const [across, along] = below.size;
    const top = new Int16Array(across * along).fill(NONE);

    for (let c = 0; c < width * depth; c++) {
        if (floorStarts[c + 1] > floorStarts[c]) {
            const highest = heightOf[floorStarts[c + 1] - 1];
            const px = Math.floor((origin[0] + ((c % width) + 0.5) * square - below.origin[0]) / below.square);
            const pz = Math.floor((origin[1] + (Math.floor(c / width) + 0.5) * square - below.origin[1]) / below.square);
            const k = pz * across + px;

            if (px >= 0 && pz >= 0 && px < across && pz < along) {
                top[k] = Math.max(top[k], Math.max(-32767, Math.min(32767, Math.round(highest * 100))));
            }
        }
    }

    return { ...walk, under: { ...below, top } };
}

/**
 * The lowest of scenery's surfaces over each patch of a coarser grid (`square` metres a side,
 * from the same corner as the walk's, as far as the triangles go): { square, origin: [x, z],
 * size: [along x, along z], heights: Int16Array (cm, NONE over a patch no triangle's over; row by
 * row along z, each along x) }. Under a castle on its crag that's the crag's own ground, the chasm's
 * floor, the land round it, whatever stands on them: what a world's own land can be laid just under,
 * where the scene's set into it, so the land is hidden and the scene stands on it (the game's
 * core/scenery.js).
 */
export function underOf(triangles, square) {
    return surfaceOf(triangles, square, "lowest");
}

/**
 * The lowest or highest (`which`) of scenery's surfaces over each patch of a grid (`square` metres
 * a side, from a corner on the grid, as far as the triangles go; or `grid`'s origin and size):
 * { square, origin, size, heights (cm, NONE over a patch no triangle's over) }. underOf's lowest;
 * the top of a scene's ground, its terrain's triangles alone, highest.
 */
export function surfaceOf(triangles, square, which = "lowest", grid = null) {
    const highest = which === "highest";
    const low = [Infinity, Infinity];
    const high = [-Infinity, -Infinity];

    for (let i = 0; i < triangles.length; i += 3) {
        low[0] = Math.min(low[0], triangles[i]);
        high[0] = Math.max(high[0], triangles[i]);
        low[1] = Math.min(low[1], triangles[i + 2]);
        high[1] = Math.max(high[1], triangles[i + 2]);
    }

    // (On a grid of its own, as far as the triangles go; or on one given, { origin, size })
    const origin = grid ? grid.origin : [Math.floor(low[0] / square) * square, Math.floor(low[1] / square) * square];
    const width = grid ? grid.size[0] : Math.max(1, Math.ceil((high[0] - origin[0]) / square));
    const depth = grid ? grid.size[1] : Math.max(1, Math.ceil((high[1] - origin[1]) / square));
    const lowest = new Float32Array(width * depth).fill(highest ? -Infinity : Infinity);

    for (let t = 0; t < triangles.length; t += 9) {
        const points = Array.from(triangles.subarray(t, t + 9));
        // (The patches it's over: one it only touches at an edge isn't one)
        const span = (at, axis, count) => {
            const first = Math.floor((Math.min(points[axis], points[axis + 3], points[axis + 6]) - at) / square);
            const last = Math.ceil((Math.max(points[axis], points[axis + 3], points[axis + 6]) - at) / square) - 1;

            return [Math.max(0, first), Math.min(count - 1, Math.max(first, last))];
        };
        const [x0, x1] = span(origin[0], 0, width);
        const [z0, z1] = span(origin[1], 2, depth);

        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                const [left, near] = [origin[0] + x * square, origin[1] + z * square];
                let piece = clip(points, 0, left, 1);

                piece = piece.length ? clip(piece, 0, left + square, -1) : piece;
                piece = piece.length ? clip(piece, 2, near, 1) : piece;
                piece = piece.length ? clip(piece, 2, near + square, -1) : piece;

                for (let i = 1; i < piece.length; i += 3) {
                    lowest[z * width + x] = highest ? Math.max(lowest[z * width + x], piece[i]) : Math.min(lowest[z * width + x], piece[i]);
                }
            }
        }
    }

    return { square, origin, size: [width, depth], heights: Int16Array.from(lowest, (y) => (Number.isFinite(y) ? Math.max(-32767, Math.min(32767, Math.round(y * 100))) : NONE)) };
}

/**
 * Every floor of scenery's triangles, on the grid (walkOf's first part): { origin, width, depth,
 * nodes (how many floors), heightOf (each floor's height), columnOf (each floor's square, z *
 * width + x), floorStarts (each square's first floor; its floors are those up to the next's,
 * lowest first) }.
 */
export function floorsOf(triangles, options = {}) {
    const { square, slope, headroom, merge, cover, climb } = { ...WALK, ...options };

    // The grid: every square any triangle is over
    const low = [Infinity, Infinity];
    const high = [-Infinity, -Infinity];

    for (let i = 0; i < triangles.length; i += 3) {
        low[0] = Math.min(low[0], triangles[i]);
        high[0] = Math.max(high[0], triangles[i]);
        low[1] = Math.min(low[1], triangles[i + 2]);
        high[1] = Math.max(high[1], triangles[i + 2]);
    }

    if (!triangles.length) {
        throw new Error("walk: there's nothing to walk on (no triangles)");
    }

    const origin = [Math.floor(low[0] / square) * square, Math.floor(low[1] / square) * square];
    const width = Math.max(1, Math.ceil((high[0] - origin[0]) / square));
    const depth = Math.max(1, Math.ceil((high[1] - origin[1]) / square));
    const walkable = Math.cos((slope * Math.PI) / 180);

    // Each triangle's stretch over each square it's over: from its lowest there to its highest
    const spanColumn = new Column(Int32Array);
    const spanLow = new Column(Float32Array);
    const spanHigh = new Column(Float32Array);
    const spanWalk = new Column(Uint8Array);
    // (How much of the square a flat one covers, seen from above)
    const spanArea = new Column(Float32Array);

    for (let t = 0; t < triangles.length; t += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.subarray(t, t + 9);
        const ux = bx - ax;
        const uy = by - ay;
        const uz = bz - az;
        const vx = cx - ax;
        const vy = cy - ay;
        const vz = cz - az;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz);

        if (!(length > 0)) {
            continue;
        }

        const flat = ny / length >= walkable ? 1 : 0;
        const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - origin[0]) / square));
        const x1 = Math.min(width - 1, Math.floor((Math.max(ax, bx, cx) - origin[0]) / square));
        const z0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - origin[1]) / square));
        const z1 = Math.min(depth - 1, Math.floor((Math.max(az, bz, cz) - origin[1]) / square));

        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                let bottom;
                let top;
                let area = 0;

                // (Within one square: as it is)
                if (x0 === x1 && z0 === z1) {
                    bottom = Math.min(ay, by, cy);
                    top = Math.max(ay, by, cy);
                    area = Math.abs(ny) / 2;
                } else {
                    const left = origin[0] + x * square;
                    const near = origin[1] + z * square;
                    let points = [ax, ay, az, bx, by, bz, cx, cy, cz];

                    points = clip(points, 0, left, 1);
                    points = points.length ? clip(points, 0, left + square, -1) : points;
                    points = points.length ? clip(points, 2, near, 1) : points;
                    points = points.length ? clip(points, 2, near + square, -1) : points;

                    if (!points.length) {
                        continue;
                    }

                    bottom = Infinity;
                    top = -Infinity;

                    for (let i = 1; i < points.length; i += 3) {
                        bottom = Math.min(bottom, points[i]);
                        top = Math.max(top, points[i]);
                    }

                    for (let i = 0; i < points.length; i += 3) {
                        const j = (i + 3) % points.length;

                        area += points[i] * points[j + 2] - points[j] * points[i + 2];
                    }

                    area = Math.abs(area) / 2;
                }

                // (A floor's piece along a square's edge, and nothing of it within: not on it)
                if (flat && area <= 1e-9) {
                    continue;
                }

                spanColumn.push(z * width + x);
                spanLow.push(bottom);
                spanHigh.push(top);
                spanWalk.push(flat);
                spanArea.push(flat ? area : 0);
            }
        }
    }

    // Each square's stretches in order, from the lowest up
    const columns = width * depth;
    const starts = new Int32Array(columns + 1);

    for (let i = 0; i < spanColumn.length; i++) {
        starts[spanColumn.data[i] + 1]++;
    }

    for (let c = 0; c < columns; c++) {
        starts[c + 1] += starts[c];
    }

    const order = new Int32Array(spanColumn.length);
    const filled = starts.slice(0, columns);

    for (let i = 0; i < spanColumn.length; i++) {
        order[filled[spanColumn.data[i]]++] = i;
    }

    // Each square's floors: the tops of its solid stretches (each overlapping one taken as one),
    // with room over them, where what may be stood on within a step of the top covers enough of
    // the square (a bridge's end and the court a step under it, in one square, are one floor)
    const floorStarts = new Int32Array(columns + 1);
    const floorHeights = new Column(Float32Array);
    const least = cover * square * square;

    for (let c = 0; c < columns; c++) {
        const ones = Array.from(order.subarray(starts[c], starts[c + 1])).sort((a, b) => spanLow.data[a] - spanLow.data[b]);
        const merged = [];

        for (const i of ones) {
            const [bottom, top, flat, area] = [spanLow.data[i], spanHigh.data[i], spanWalk.data[i], spanArea.data[i]];
            const last = merged.at(-1);
            const span = last && bottom <= last.top + merge ? last : null;

            if (span) {
                span.top = Math.max(span.top, top);
            } else {
                merged.push({ bottom, top, pieces: [] });
            }

            if (flat) {
                (span ?? merged.at(-1)).pieces.push(top, area);
            }
        }

        for (const [i, span] of merged.entries()) {
            const over = merged[i + 1];
            let standing = 0;

            for (let k = 0; k < span.pieces.length; k += 2) {
                if (span.pieces[k] >= span.top - climb) {
                    standing += span.pieces[k + 1];
                }
            }

            if (standing >= least && (!over || over.bottom - span.top >= headroom)) {
                floorHeights.push(span.top);
            }
        }

        floorStarts[c + 1] = floorHeights.length;
    }

    const nodes = floorHeights.length;
    const heightOf = floorHeights.data.slice(0, nodes);
    const columnOf = new Int32Array(nodes);

    for (let c = 0; c < columns; c++) {
        columnOf.fill(c, floorStarts[c], floorStarts[c + 1]);
    }

    return { origin, width, depth, nodes, heightOf, columnOf, floorStarts };
}

// What's reached from `from`, in levels (walkOf's second part)
function walkFrom({ from, square, least, origin, width, depth, floorStarts, heightOf, columnOf, nodes, besideOf }) {
    // Where it's walked from: the floor of its square nearest it
    const [fx, fy, fz] = from;
    const [sx, sz] = [Math.floor((fx - origin[0]) / square), Math.floor((fz - origin[1]) / square)];
    const startColumn = sx >= 0 && sz >= 0 && sx < width && sz < depth ? sz * width + sx : -1;
    let start = -1;

    for (let node = startColumn >= 0 ? floorStarts[startColumn] : 0; startColumn >= 0 && node < floorStarts[startColumn + 1]; node++) {
        if (start < 0 || Math.abs(heightOf[node] - fy) < Math.abs(heightOf[start] - fy)) {
            start = node;
        }
    }

    if (start < 0) {
        throw new Error(`walk.from (${from.join(", ")}): there's no floor there to walk from`);
    }

    // What's reached from there
    const reached = new Uint8Array(nodes);
    const queue = [start];

    reached[start] = 1;

    while (queue.length) {
        besideOf(queue.pop(), (other) => {
            if (!reached[other]) {
                reached[other] = 1;
                queue.push(other);
            }
        });
    }

    // Levels: each grown from its lowest floor not yet in one, lowest first, taking no square
    // it already has a floor on (the floor over it waits for a level of its own)
    const levelOf = new Int32Array(nodes).fill(-1);
    const levels = [];
    const heap = new Heap((a, b) => heightOf[a] - heightOf[b] || a - b);
    const byHeight = Array.from({ length: nodes }, (_, i) => i)
        .filter((node) => reached[node])
        .sort((a, b) => heightOf[a] - heightOf[b] || a - b);
    let small = 0;

    for (const seed of [start, ...byHeight]) {
        if (levelOf[seed] !== -1) {
            continue;
        }

        const id = levels.length;
        const taken = new Map();
        const members = [];

        heap.push(seed);

        while (heap.size) {
            const node = heap.pop();

            if (levelOf[node] !== -1 || taken.has(columnOf[node])) {
                continue;
            }

            levelOf[node] = id;
            taken.set(columnOf[node], node);
            members.push(node);
            besideOf(node, (other) => {
                if (reached[other] && levelOf[other] === -1 && !taken.has(columnOf[other])) {
                    heap.push(other);
                }
            });
        }

        // (Too small to be a level, and not the ground: left out, its floors marked so no level takes them)
        if (id > 0 && members.length < least) {
            small += members.length;

            for (const node of members) {
                levelOf[node] = -2;
            }

            continue;
        }

        levels.push({ id, members });
    }

    // (Numbered in order, now the small ones are out)
    const number = new Map(levels.map((level, i) => [level.id, i]));

    for (let node = 0; node < nodes; node++) {
        levelOf[node] = levelOf[node] >= 0 ? number.get(levelOf[node]) : -1;
    }

    const links = new Map();

    for (let node = 0; node < nodes; node++) {
        if (levelOf[node] < 0) {
            continue;
        }

        besideOf(node, (other) => {
            if (levelOf[other] >= 0 && levelOf[other] > levelOf[node]) {
                const key = `${levelOf[node]} ${levelOf[other]}`;
                const [a, b] = [columnOf[node], columnOf[other]];

                if (!links.has(key)) {
                    links.set(key, { from: levelOf[node], to: levelOf[other], crossings: [] });
                }

                links.get(key).crossings.push([a % width, Math.floor(a / width), b % width, Math.floor(b / width)]);
            }
        });
    }

    return {
        square,
        origin,
        size: [width, depth],
        from,
        levels: levels.map(({ members }) => {
            const xs = members.map((node) => columnOf[node] % width);
            const zs = members.map((node) => Math.floor(columnOf[node] / width));
            // (Not Math.min(...xs): a level may be more squares than a call takes arguments)
            const box = [xs.reduce((a, b) => Math.min(a, b)), zs.reduce((a, b) => Math.min(a, b)), xs.reduce((a, b) => Math.max(a, b)), zs.reduce((a, b) => Math.max(a, b))];
            const across = box[2] - box[0] + 1;
            const heights = new Int16Array(across * (box[3] - box[1] + 1)).fill(NONE);
            let [lowest, highest] = [Infinity, -Infinity];

            for (const [i, node] of members.entries()) {
                heights[(zs[i] - box[1]) * across + (xs[i] - box[0])] = Math.round(heightOf[node] * 100);
                lowest = Math.min(lowest, heightOf[node]);
                highest = Math.max(highest, heightOf[node]);
            }

            return { squares: members.length, low: Math.round(lowest * 100) / 100, high: Math.round(highest * 100) / 100, box, heights };
        }),
        links: [...links.values()].sort((a, b) => a.from - b.from || a.to - b.to),
        left: { unreached: Array.from(reached).filter((one) => !one).length, small },
    };
}

// Int16 heights as JSON carries them: base64, little-endian
const base64 = (heights) => Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength).toString("base64");

/** A walk as JSON can carry it: each level's heights in base64 (little-endian Int16), and what's under it's. */
export function walkJson(walk) {
    return {
        ...walk,
        levels: walk.levels.map(({ heights, ...level }) => ({ ...level, heights: base64(heights) })),
        ...(walk.under ? { under: { ...walk.under, heights: base64(walk.under.heights), ...(walk.under.top ? { top: base64(walk.under.top) } : {}) } } : {}),
        ...(walk.ground ? { ground: { ...walk.ground, heights: base64(walk.ground.heights), over: base64(walk.ground.over) } } : {}),
    };
}

// Int16 heights read back from their base64
const int16 = (text) => {
    const bytes = Buffer.from(text, "base64");

    return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
};

/** A walk read back from its JSON. */
export function readWalk(json) {
    return {
        ...json,
        levels: json.levels.map(({ heights, ...level }) => ({ ...level, heights: int16(heights) })),
        ...(json.under ? { under: { ...json.under, heights: int16(json.under.heights), ...(json.under.top ? { top: int16(json.under.top) } : {}) } } : {}),
        ...(json.ground ? { ground: { ...json.ground, heights: int16(json.ground.heights), over: int16(json.ground.over) } } : {}),
    };
}

/** A level's floor height at a square of the grid (metres), or null where it has none. */
export function floorAt(walk, level, x, z) {
    const { box, heights } = walk.levels[level];

    if (x < box[0] || z < box[1] || x > box[2] || z > box[3]) {
        return null;
    }

    const value = heights[(z - box[1]) * (box[2] - box[0] + 1) + (x - box[0])];

    return value === NONE ? null : value / 100;
}

// A binary heap, least first by `before`
class Heap {
    constructor(before) {
        this.before = before;
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(item) {
        const items = this.items;

        items.push(item);

        for (let i = items.length - 1; i > 0; ) {
            const parent = (i - 1) >> 1;

            if (this.before(items[i], items[parent]) >= 0) {
                break;
            }

            [items[i], items[parent]] = [items[parent], items[i]];
            i = parent;
        }
    }

    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();

        if (items.length) {
            items[0] = last;

            for (let i = 0; ; ) {
                const [l, r] = [2 * i + 1, 2 * i + 2];
                let least = i;

                if (l < items.length && this.before(items[l], items[least]) < 0) {
                    least = l;
                }

                if (r < items.length && this.before(items[r], items[least]) < 0) {
                    least = r;
                }

                if (least === i) {
                    break;
                }

                [items[i], items[least]] = [items[least], items[i]];
                i = least;
            }
        }

        return top;
    }
}
