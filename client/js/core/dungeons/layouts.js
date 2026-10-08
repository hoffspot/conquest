// How a dungeon level's rooms are dug (core/dungeons: docs/DUNGEONS.md), one way for each kind of
// place, each a function from a level's size and a random stream to its squares (grid.js) and its
// rooms. Every level is come into at the middle of its south edge, up a straight way in (a front
// door, or the foot of stairs from the level above: build.js puts them there), and grows north and
// out from it:
//
// - caves: a few caverns scattered about, joined along the shortest tree through them (a Gabriel
//   graph's) and one to three more joins where they save a long way round, each cavern a blob of
//   rock-edged ground and each join a wandering tunnel three to five metres wide, the whole
//   smoothed so nothing's square;
// - accretion (an outlaws' hideout): rooms dug one by one, each off one already dug down a short
//   tunnel, then a few walls broken through where that saves a long way round (Brogue's way);
// - axial (an ancient temple or tomb): halls one after another up a straight middle way, rooms off
//   them either side, mirrored, then a breach or two where it's fallen in.
//
// More can be added (registerLayout) and named by a theme (themes.js). Whole numbers and seeded
// streams only: the same on every machine.

import { noise } from "../random.js";
import { gabriel, loopsFor, spanningTree } from "./graph.js";
import { EIGHT, FOUR, Grid } from "./grid.js";

/**
 * How long the straight way in at the bottom of every level is (squares, from its south edge):
 * room for a front door or a stair's foot and its landing, and for coming in a few steps
 * (interiors.js comeIn).
 */
export const WAY_IN = 7;

/** How much shorter a join has to make the way round for a loop to be dug (metres). */
export const LOOP_SAVES = 25;

// The way in: two squares wide, up from the middle of the south edge to `top` (a passage)
function digWayIn(grid, top) {
    const cx = Math.floor(grid.width / 2);

    for (let y = grid.height - 2; y >= top; y--) {
        grid.dig(cx - 1, y, -1);
        grid.dig(cx, y, -1);
    }

    return [cx - 1, grid.height - 1];
}

/**
 * A wandering tunnel from one square to another (a drunkard's walk, leaning towards where it's
 * going `lean` of the time), dug `brush` squares round as it goes (digRound), never nearer the
 * level's edge than `margin`.
 */
export function tunnel(grid, [x, y], [tx, ty], random, { brush = 1.5, lean = 0.7, margin = 3, room = -1 } = {}) {
    for (let steps = 0; steps < 4000 && (x !== tx || y !== ty); steps++) {
        grid.digRound(x, y, brush, room);

        if (random.next() < lean) {
            const [ax, ay] = [Math.abs(tx - x), Math.abs(ty - y)];

            if (random.next() * (ax + ay) < ax) {
                x += Math.sign(tx - x);
            } else {
                y += Math.sign(ty - y);
            }
        } else {
            const [dx, dy] = FOUR[random.int(0, 3)];

            if (grid.inside(x + dx, y + dy, margin)) {
                [x, y] = [x + dx, y + dy];
            }
        }
    }

    grid.digRound(tx, ty, brush, room);
}

/**
 * Smooth a level's rock (cellular automaton rounds): ground with `fill` or more rock round it
 * filled in, rock with `open` or less dug out (into the room most of its open neighbours are in).
 */
export function smooth(grid, rounds = 2, { fill = 6, open = 2 } = {}) {
    for (let round = 0; round < rounds; round++) {
        const was = grid.clone();

        for (let y = 1; y < grid.height - 1; y++) {
            for (let x = 1; x < grid.width - 1; x++) {
                const rock = was.rockAround(x, y);

                if (was.open(x, y) && rock >= fill) {
                    grid.fill(x, y);
                } else if (!was.open(x, y) && rock <= open && grid.inside(x, y, 2)) {
                    const ids = EIGHT.filter(([dx, dy]) => was.open(x + dx, y + dy)).map(([dx, dy]) => was.room[(y + dy) * was.width + x + dx]);
                    const counts = new Map();

                    for (const id of ids) {
                        counts.set(id, (counts.get(id) ?? 0) + 1);
                    }

                    const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

                    grid.dig(x, y, best ? best[0] : -1);
                }
            }
        }
    }
}

/**
 * Break through walls where that saves a long way round: straight gaps of rock one to `gap`
 * squares across between two open squares (two side by side, so the way's two wide), each that
 * saves `saves` steps or more and touches none of the rooms in `avoid`, the best of a few looked
 * at, `count` at most. How many were.
 */
export function breakThrough(grid, random, { count, saves = LOOP_SAVES, gap = 4, avoid = [], below = Infinity, look = 60 }) {
    const { width } = grid;
    const avoided = new Set(avoid);
    let made = 0;

    for (let round = 0; round < count; round++) {
        const found = [];

        for (let y = 3; y < grid.height - 3 && y < below; y++) {
            for (let x = 3; x < grid.width - 3; x++) {
                if (!grid.open(x, y)) {
                    continue;
                }

                // (East and south only, so each gap's found once)
                for (const [dx, dy] of [[1, 0], [0, 1]]) {
                    const [sx, sy] = [dy, dx];
                    let length = 0;

                    while (length <= gap && !grid.open(x + dx * (length + 1), y + dy * (length + 1)) && grid.inside(x + dx * (length + 1), y + dy * (length + 1), 3)) {
                        length++;
                    }

                    const [ex, ey] = [x + dx * (length + 1), y + dy * (length + 1)];

                    if (length < 1 || length > gap || !grid.open(ex, ey) || !grid.open(x + sx, y + sy) || !grid.open(ex + sx, ey + sy)) {
                        continue;
                    }

                    // (Two wide: the row beside it a gap of rock as long)
                    let beside = true;

                    for (let k = 1; k <= length; k++) {
                        beside &&= !grid.open(x + sx + dx * k, y + sy + dy * k);
                    }

                    const ends = [grid.room[y * width + x], grid.room[ey * width + ex]];

                    if (beside && ey < below && !ends.some((id) => avoided.has(id))) {
                        found.push({ from: [x, y], to: [ex, ey], step: [dx, dy], side: [sx, sy], length });
                    }
                }
            }
        }

        let best = null;

        for (const one of random.shuffle(found).slice(0, look)) {
            const steps = walkBetween(grid, one.from, one.to);
            const saved = steps - one.length - 1;

            if (saved >= saves && (!best || saved > best.saved)) {
                best = { ...one, saved };
            }
        }

        if (!best) {
            break;
        }

        for (let k = 1; k <= best.length; k++) {
            grid.dig(best.from[0] + best.step[0] * k, best.from[1] + best.step[1] * k, -1);
            grid.dig(best.from[0] + best.side[0] + best.step[0] * k, best.from[1] + best.side[1] + best.step[1] * k, -1);
        }

        made++;
    }

    return made;
}

// How many steps it is from one open square to another (four ways), Infinity if there's no way
function walkBetween(grid, [x, y], [tx, ty]) {
    const { width } = grid;
    const far = new Int32Array(grid.cells.length).fill(-1);
    const queue = new Int32Array(grid.cells.length);
    let [head, tail] = [0, 0];
    const goal = ty * width + tx;

    far[y * width + x] = 0;
    queue[tail++] = y * width + x;

    while (head < tail) {
        const k = queue[head++];

        if (k === goal) {
            return far[k];
        }

        const [ax, ay] = [k % width, Math.floor(k / width)];

        for (const [dx, dy] of FOUR) {
            const n = (ay + dy) * width + ax + dx;

            if (grid.open(ax + dx, ay + dy) && far[n] < 0) {
                far[n] = far[k] + 1;
                queue[tail++] = n;
            }
        }
    }

    return Infinity;
}

// --- Caves ---

// How far apart two squares are, squared
const apartSquared = ([ax, ay], [bx, by]) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/**
 * Caves: caverns scattered about and tunnels between them. `rooms` caverns at most (the mouth by
 * the way in, and on the bottom level, `arena`, a great one far from it, a dead end).
 */
export function caves({ width, height, rooms, arena, random }) {
    const grid = new Grid(width, height);
    const cx = Math.floor(width / 2);
    const bottom = height - 1 - WAY_IN;
    const nodes = [];
    const mouth = random.int(4, 5);

    nodes.push({ at: [cx, bottom - mouth + 1], r: mouth, kind: "mouth" });

    if (arena) {
        const r = width >= 80 ? random.int(9, 10) : random.int(8, 9);

        nodes.push({ at: [random.int(r + 4, width - r - 5), random.int(r + 3, r + 3 + Math.floor(height / 8))], r, kind: "arena" });
    }

    // The rest, biggest first: two or three great caverns, four to six middling, the rest small
    const others = Math.max(0, rooms - nodes.length);
    const great = Math.min(others, random.int(2, 3));
    const middling = Math.min(others - great, random.int(4, 6));
    const radii = [
        ...Array.from({ length: great }, () => ({ r: random.int(6, 7), kind: "cavern" })),
        ...Array.from({ length: middling }, () => ({ r: random.int(4, 5), kind: "grotto" })),
        ...Array.from({ length: others - great - middling }, () => ({ r: 3, kind: "nook" })),
    ];

    for (const { r, kind } of radii) {
        for (let tries = 0; tries < 160; tries++) {
            const at = [random.int(r + 3, width - r - 4), random.int(r + 3, bottom - 2)];
            const apart = nodes.every((node) => apartSquared(node.at, at) >= (node.r + r + 4) * (node.r + r + 4));
            const offWay = Math.abs(at[0] - cx) > r + 3 || at[1] + r + 2 < bottom;

            if (apart && offWay) {
                nodes.push({ at, r, kind });
                break;
            }
        }
    }

    // How they join: the shortest tree through them (the arena left out, then joined to its
    // nearest, so it's a dead end), and loops
    const points = nodes.map(({ at }) => at);
    const edges = gabriel(points);
    const skip = arena ? 1 : -1;
    let tree = spanningTree(points, edges, skip);

    if (arena && tree.length < nodes.length - 2) {
        tree = spanningTree(points, edges);
    } else if (arena) {
        const [nearest] = edges.filter(([a, b]) => a === skip || b === skip).sort((e, f) => {
            const d = ([a, b]) => apartSquared(points[a], points[b]);

            return d(e) - d(f) || e[0] - f[0] || e[1] - f[1];
        });

        if (nearest) {
            tree.push(nearest);
        }
    }

    const loops = loopsFor(points, tree, edges, { count: random.int(1, 3), detour: LOOP_SAVES, skip });

    // Each cavern a blob: a squashed round, its edge wobbling with noise; dug before the tunnels,
    // so their squares are its
    for (const [id, { at, r, kind }] of nodes.entries()) {
        const [rx, ry] = kind === "arena" ? [r * random.range(1, 1.15), r * random.range(0.9, 1.05)] : [r * random.range(0.85, 1.25), r * random.range(0.8, 1.15)];
        const wobble = random.seed() % 100000;
        const reach = Math.ceil(Math.max(rx, ry) * 1.5);

        for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
                const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
                const edge = 1 + (noise(at[0] + dx, at[1] + dy, wobble, 5, 2) - 0.5) * 1.1;

                if (d <= 0.45 || d <= edge) {
                    grid.dig(at[0] + dx, at[1] + dy, id);
                }
            }
        }
    }

    for (const [a, b] of [...tree, ...loops]) {
        tunnel(grid, points[a], points[b], random, { brush: random.chance(0.4) ? 2.2 : 1.5 });
    }

    smooth(grid, 2);

    const entrance = digWayIn(grid, bottom - 1);

    grid.keepReachable([[cx - 1, height - 2]]);

    return { grid, count: nodes.length, entryRoom: 0, goalRoom: arena ? 1 : -1, kinds: nodes.map(({ kind }) => kind), entrance, loops: loops.length };
}

// --- Rooms dug one off another (an outlaws' hideout) ---

// A rectangle's squares, dug, in a room
const digBox = (grid, { x, y, w, h }, room) => grid.digRect(x, y, w, h, room);

/**
 * Where a room `w` by `h` would go off the room `from`, down a tunnel `length` long and `wide`
 * across, out of its side `side` (0 north, 1 east, 2 south, 3 west), the tunnel leaving it at
 * `along` (0 to 1) of that side and coming into the new room at `into` (0 to 1) of its facing side:
 * { room, way } (each { x, y, w, h }).
 */
function offRoom(from, { w, h }, side, length, wide, along, into) {
    if (side === 0 || side === 2) {
        const out = from.x + 1 + Math.floor(along * Math.max(0, from.w - 2 - wide));
        const way = side === 0 ? { x: out, y: from.y - length, w: wide, h: length } : { x: out, y: from.y + from.h, w: wide, h: length };
        const rx = out - 1 - Math.floor(into * Math.max(0, w - 2 - wide));

        return { way, room: { x: rx, y: side === 0 ? way.y - h : way.y + length, w, h } };
    }

    const out = from.y + 1 + Math.floor(along * Math.max(0, from.h - 2 - wide));
    const way = side === 1 ? { x: from.x + from.w, y: out, w: length, h: wide } : { x: from.x - length, y: out, w: length, h: wide };
    const ry = out - 1 - Math.floor(into * Math.max(0, h - 2 - wide));

    return { way, room: { x: side === 1 ? way.x + length : way.x - w, y: ry, w, h } };
}

// Can a tunnel go there: rock, and rock either side of it along its length
function tunnelFits(grid, { x, y, w, h }) {
    return w > h ? grid.solid(x, y - 1, w, h + 2) : grid.solid(x - 1, y, w + 2, h);
}

// Dig a room off one already dug (`from`), if it fits somewhere: tries a few sides, lengths and
// places along them. The room ({ x, y, w, h }), or null
function digOff(grid, from, size, id, random, { tries = 12, length = [2, 6], wide = [2, 2] } = {}) {
    for (let k = 0; k < tries; k++) {
        const side = random.int(0, 3);
        const { way, room } = offRoom(from, size, side, random.int(...length), random.int(...wide), random.next(), random.next());

        if (grid.solid(room.x, room.y, room.w, room.h, 1) && grid.inside(room.x, room.y, 2) && grid.inside(room.x + room.w - 1, room.y + room.h - 1, 2) && tunnelFits(grid, way)) {
            digBox(grid, way, -1);
            digBox(grid, room, id);

            return room;
        }
    }

    return null;
}

/**
 * An outlaws' hideout: a gatehouse room at the way in, then rooms dug off those already dug down
 * short tunnels (quarters, stores, a mess hall), and on the bottom level, `arena`, the chief's
 * great hall off the room furthest in; then one to three walls broken through for loops.
 */
export function accretion({ width, height, rooms, arena, random }) {
    const grid = new Grid(width, height);
    const cx = Math.floor(width / 2);
    const bottom = height - 1 - WAY_IN;
    const placed = [];
    const kinds = [];
    const [w0, h0] = [random.int(7, 9), random.int(5, 6)];
    const gate = { x: cx - Math.floor(w0 / 2), y: bottom - h0 + 1, w: w0, h: h0 };

    digBox(grid, gate, 0);
    placed.push(gate);
    kinds.push("gate");

    const entrance = digWayIn(grid, bottom + 1);

    // What else: a mess hall or two, quarters, stores and dens, in a stable order of sizes
    const SIZES = {
        hall: () => ({ w: random.int(12, 15), h: random.int(9, 12) }),
        quarters: () => ({ w: random.int(9, 11), h: random.int(7, 9) }),
        store: () => ({ w: random.int(6, 7), h: random.int(5, 6) }),
        den: () => ({ w: random.int(7, 9), h: random.int(6, 8) }),
    };
    const want = Math.max(0, rooms - 1 - (arena ? 1 : 0));
    const order = random.shuffle(["hall", "hall", "quarters", "quarters", "quarters", "store", "store", "den", "store", "quarters", "den", "store", "quarters"]).slice(0, want);

    for (const kind of order) {
        for (let tries = 0; tries < 60; tries++) {
            // (Off any room, the later ones a little likelier, so it reaches out)
            const from = placed[Math.min(placed.length - 1, Math.floor(placed.length * Math.sqrt(random.next())))];
            const room = digOff(grid, from, SIZES[kind](), placed.length, random, { tries: 4, length: [2, 7], wide: random.chance(0.3) ? [3, 3] : [2, 2] });

            if (room) {
                placed.push(room);
                kinds.push(kind);
                break;
            }
        }
    }

    let goalRoom = -1;

    if (arena) {
        // (The chief's hall off the rooms furthest in, the furthest it'll fit off)
        const far = grid.distances([[cx - 1, height - 2]]);
        const byFar = placed.map((room, id) => ({ room, id, d: far[(room.y + Math.floor(room.h / 2)) * width + room.x + Math.floor(room.w / 2)] })).sort((a, b) => b.d - a.d || a.id - b.id);

        for (const { room: from } of byFar) {
            const size = { w: random.int(15, 18), h: random.int(13, 16) };
            const hall = digOff(grid, from, size, placed.length, random, { tries: 24, length: [3, 6], wide: [3, 3] }) ?? digOff(grid, from, { w: size.w - 3, h: size.h - 3 }, placed.length, random, { tries: 16, length: [3, 6], wide: [3, 3] });

            if (hall) {
                goalRoom = placed.length;
                placed.push(hall);
                kinds.push("arena");
                break;
            }
        }
    }

    const loops = breakThrough(grid, random, { count: random.int(1, 3), avoid: goalRoom >= 0 ? [goalRoom, 0] : [0], below: bottom });

    return { grid, count: placed.length, entryRoom: 0, goalRoom, kinds, entrance, loops };
}

// --- Halls up a middle way (an ancient temple or tomb) ---

// The shapes a hall can be dug in: a rectangle, a cross (two rectangles across each other), round
function digShape(grid, { x, y, w, h, shape }, room) {
    if (shape === "round") {
        const r = Math.min(w, h) / 2 - 0.01;

        grid.digRound(x + Math.floor(w / 2), y + Math.floor(h / 2), r, room);
        // (Its middle two wide, so the middle way runs straight through it)
        grid.digRect(x + Math.floor(w / 2) - 1, y, 2, h, room);

        return;
    }

    if (shape === "cross") {
        const arm = Math.max(4, Math.floor(w / 3) + (Math.floor(w / 3) % 2));

        grid.digRect(x + Math.floor((w - arm) / 2), y, arm, h, room);
        grid.digRect(x, y + Math.floor((h - arm) / 2), w, arm, room);

        return;
    }

    grid.digRect(x, y, w, h, room);
}

// What halls an ancient place's middle way has, and their sizes (even widths, so each is mirrored
// across the middle way)
const HALLS = Object.freeze({
    vestibule: () => ({ w: 10, h: 7, shape: "rect" }),
    hypostyle: (random) => ({ w: 2 * random.int(7, 9), h: random.int(11, 13), shape: "rect" }),
    gallery: (random) => ({ w: 2 * random.int(4, 5), h: random.int(13, 16), shape: "rect" }),
    rotunda: (random) => ({ w: 2 * random.int(6, 7), h: 0, shape: "round" }),
    chapel: (random) => ({ w: 2 * random.int(6, 7), h: 0, shape: "cross" }),
    stairhall: (random) => ({ w: 2 * random.int(5, 6), h: random.int(8, 9), shape: "rect" }),
    arena: (random) => ({ w: 2 * random.int(9, 11), h: random.int(15, 17), shape: "rect" }),
});

// The rooms off the halls either side
const WINGS = Object.freeze({
    shrine: (random) => ({ w: random.int(6, 8), h: random.int(6, 7) }),
    ossuary: (random) => ({ w: random.int(7, 10), h: random.int(6, 8) }),
    cell: (random) => ({ w: random.int(5, 6), h: random.int(5, 6) }),
});

/**
 * An ancient temple or tomb: halls up a straight middle way from the way in (a vestibule, then
 * pillared halls, galleries of tombs, rotundas and crossed chapels), to a stair hall at the top
 * (or on the bottom level, `arena`, the sanctum), rooms off them either side, mirrored; then a
 * breach or two where the rock's broken in, for loops.
 */
export function axial({ width, height, rooms, arena, random }) {
    const grid = new Grid(width, height);
    const cx = Math.floor(width / 2);
    const bottom = height - 1 - WAY_IN;
    const room = (spec) => ({ ...spec, h: spec.h || spec.w });

    // The middle way's halls, bottom to top, as many as fit (the top: the sanctum or the stairs)
    const top = room(HALLS[arena ? "arena" : "stairhall"](random));
    const middles = random.shuffle(["hypostyle", "gallery", "rotunda", "chapel", "hypostyle", "gallery"]);
    const spine = [{ kind: "vestibule", ...room(HALLS.vestibule(random)) }];
    const ways = [];
    const room0 = Math.max(2, Math.min(5, Math.round(rooms / 2.6)));
    const tall = () => spine.reduce((sum, { h }) => sum + h, 0) + top.h + ways.reduce((sum, d) => sum + d, 0);

    for (const kind of middles) {
        const hall = { kind, ...room(HALLS[kind](random)) };
        const way = random.int(3, 5);

        if (spine.length - 1 >= room0 - 1 || tall() + hall.h + way + random.int(3, 5) > bottom - 3) {
            continue;
        }

        spine.push(hall);
        ways.push(way);
    }

    ways.push(random.int(3, 5));
    spine.push({ kind: arena ? "arena" : "stairhall", ...top });

    // Dug from the bottom up, each centred on the middle way, a way three or four wide between
    let y = bottom;
    const placed = [];
    const kinds = [];

    for (const [k, hall] of spine.entries()) {
        const box = { x: cx - hall.w / 2, y: y - hall.h + 1, w: hall.w, h: hall.h, shape: hall.shape };

        digShape(grid, box, placed.length);
        placed.push(box);
        kinds.push(hall.kind);

        if (k < spine.length - 1) {
            const wide = random.chance(0.5) ? 4 : 2;

            grid.digRect(cx - wide / 2, box.y - ways[k], wide, ways[k], -1);
            y = box.y - ways[k] - 1;
        }
    }

    const entrance = digWayIn(grid, bottom + 1);
    const goalRoom = placed.length - 1;

    // Rooms off the halls (not the top one) either side, mirrored, a way two wide straight out
    // from each hall's middle; a further room up from some
    const mirror = (box) => ({ ...box, x: 2 * cx - box.x - box.w });
    const wingsWanted = Math.max(0, rooms - placed.length);
    const halls = random.shuffle(placed.slice(0, -1).map((box, id) => ({ box, id })));

    for (const { box } of halls) {
        if (placed.length - spine.length >= wingsWanted) {
            break;
        }

        const kind = random.pick(Object.keys(WINGS));
        const size = WINGS[kind](random);
        const way = random.int(3, 6);
        const wy = box.y + Math.floor(box.h / 2) - 1;
        const left = { x: box.x - way - size.w, y: wy - Math.floor(size.h / 2) + 1, w: size.w, h: size.h };
        const path = { x: box.x - way, y: wy, w: way, h: 2 };
        const fits = (one, along) => grid.solid(one.x, one.y, one.w, one.h, 1) && grid.inside(one.x, one.y, 2) && grid.inside(one.x + one.w - 1, one.y + one.h - 1, 2) && tunnelFits(grid, along);

        if (!fits(left, path) || !fits(mirror(left), mirror(path))) {
            continue;
        }

        for (const [one, along] of [[left, path], [mirror(left), mirror(path)]]) {
            grid.digRect(along.x, along.y, along.w, along.h, -1);
            grid.digRect(one.x, one.y, one.w, one.h, placed.length);
            placed.push(one);
            kinds.push(kind);
        }

        // (A further room up from them, sometimes)
        if (placed.length - spine.length < wingsWanted && random.chance(0.5)) {
            const more = WINGS.cell(random);
            const up = random.int(3, 4);
            const high = { x: left.x + Math.floor((left.w - more.w) / 2), y: left.y - up - more.h, w: more.w, h: more.h };
            const stair = { x: left.x + Math.floor(left.w / 2) - 1, y: left.y - up, w: 2, h: up };

            if (fits(high, stair) && fits(mirror(high), mirror(stair))) {
                for (const [one, along] of [[high, stair], [mirror(high), mirror(stair)]]) {
                    grid.digRect(along.x, along.y, along.w, along.h, -1);
                    grid.digRect(one.x, one.y, one.w, one.h, placed.length);
                    placed.push(one);
                    kinds.push("cell");
                }
            }
        }
    }

    // Where it's fallen in: a rough breach between two rooms off the halls on the same side, a
    // loop round the middle way; or a wall broken through
    let loops = 0;
    const lefts = placed
        .map((box, id) => ({ box, id }))
        .filter(({ box, id }) => id >= spine.length && box.x + box.w <= cx - 2)
        .sort((a, b) => b.box.y - a.box.y || a.id - b.id);

    for (const [a, b] of lefts.slice(0, -1).map((one, k) => [one, lefts[k + 1]])) {
        if (loops >= 2 || !random.chance(0.6)) {
            continue;
        }

        const centre = ({ box }) => [box.x + Math.floor(box.w / 2), box.y + Math.floor(box.h / 2)];

        if (walkBetween(grid, centre(a), centre(b)) - Math.abs(centre(a)[1] - centre(b)[1]) >= LOOP_SAVES) {
            tunnel(grid, centre(a), centre(b), random, { brush: 1.5, lean: 0.8 });
            loops++;
        }
    }

    if (!loops) {
        loops += breakThrough(grid, random, { count: 1, avoid: [goalRoom, 0], below: bottom });
    }

    grid.keepReachable([[cx - 1, height - 2]]);

    return { grid, count: placed.length, entryRoom: 0, goalRoom: arena || placed.length > 1 ? goalRoom : -1, kinds, entrance, loops, shapes: placed.map(({ shape }) => shape ?? "rect"), boxes: placed };
}

/** The ways a level can be dug, by name (a theme's `layout`): add more with registerLayout. */
export const LAYOUTS = { caves, accretion, axial };

/** Add a way to dig a level (`dig({ width, height, rooms, arena, random })`, as `caves`'s). */
export function registerLayout(name, dig) {
    LAYOUTS[name] = dig;
}
