// Castle pieces: walls, towers, gatehouses and keeps, built from simple shapes in the spirit of
// Castle Builder (github.com/JonRubashkin/Castle-Builder): stone masses, battlements (merlons
// spaced along every top edge), cone and pyramid roofs. And the same left to ruin (RUINED):
// crumbled as kits/decay.js crumbles masonry, their battlements and roofs gone, their fallen stone
// lying against their feet.
//
// Sizes are world pixels (a grid square is 20). Walls stand in the middle of their row of
// squares and reach a little way under the towers at each end, so that they meet round towers
// without a gap; towers and gatehouses are drawn after (in front of) the walls they join.

import { createRandom } from "../../../core/random.js";
import { Solid } from "../engine/solid.js";
import { material } from "../engine/materials.js";
import { MATERIALS } from "../engine/painters.js";
import { brokenRim, brokenTop, crumbledRing, crumbledWall, perched, talus, tumbled } from "./decay.js";
import { oldBeam } from "./leftovers.js";
import { rubbleOf, weathered } from "./neutral.js";

const CELL = 20;
const WALL_HEIGHT = 32;
const WALL_THICKNESS = 14;
const WALL_OVERLAP = 12;
const MERLON = 5;
const TOWER_HEIGHT = 60;

// Merlons (the teeth of the battlements) evenly along an edge from a to b
function merlonsAlong(solid, from, to, place) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const count = Math.max(1, Math.round(length / (MERLON * 2)));

    for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;

        place(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t);
    }
}

/** Battlements around the rectangle (x0, z0)-(x1, z1) standing on height y. */
function rectBattlements(solid, x0, z0, x1, z1, y, stone) {
    const tooth = (x, z) => solid.box(x - MERLON / 2, y, z - 1.5, x + MERLON / 2, y + MERLON, z + 1.5, stone);
    const side = (x, z) => solid.box(x - 1.5, y, z - MERLON / 2, x + 1.5, y + MERLON, z + MERLON / 2, stone);

    merlonsAlong(solid, [x0, z0 + 1.5], [x1, z0 + 1.5], tooth);
    merlonsAlong(solid, [x0, z1 - 1.5], [x1, z1 - 1.5], tooth);
    merlonsAlong(solid, [x0 + 1.5, z0 + MERLON], [x0 + 1.5, z1 - MERLON], side);
    merlonsAlong(solid, [x1 - 1.5, z0 + MERLON], [x1 - 1.5, z1 - MERLON], side);
}

/** Battlements around the rim of a round tower. */
function roundBattlements(solid, cx, cz, radius, y, stone) {
    const count = Math.max(6, Math.round((2 * Math.PI * radius) / (MERLON * 2)));

    for (let i = 0; i < count; i++) {
        const angle = ((i + 0.5) / count) * Math.PI * 2;

        solid.turnedBox(cx + Math.cos(angle) * (radius - 1.5), cz + Math.sin(angle) * (radius - 1.5), 1.5, MERLON / 2, y, y + MERLON, angle, stone);
    }
}

// A dark arrow slit on a south-facing wall at (x, z)
function slit(solid, x, y, z) {
    solid.box(x - 1, y, z, x + 1, y + 7, z + 0.6, material("shadow"));
}

/** A straight wall, `length` squares long, running east-west ("h") or north-south ("v"). */
export function wall({ axis, length }, { stone = "stone" } = {}) {
    const solid = new Solid();
    const s = material(stone);
    const inner = (CELL - WALL_THICKNESS) / 2;
    const span = length * CELL;

    if (axis === "h") {
        solid.box(-WALL_OVERLAP, 0, inner - 1, span + WALL_OVERLAP, 5, CELL - inner + 1, s);
        solid.box(-WALL_OVERLAP, 5, inner, span + WALL_OVERLAP, WALL_HEIGHT, CELL - inner, s);
        merlonsAlong(solid, [0, inner + 1.5], [span, inner + 1.5], (x, z) => solid.box(x - MERLON / 2, WALL_HEIGHT, z - 1.5, x + MERLON / 2, WALL_HEIGHT + MERLON, z + 1.5, s));
        merlonsAlong(solid, [0, CELL - inner - 1.5], [span, CELL - inner - 1.5], (x, z) => solid.box(x - MERLON / 2, WALL_HEIGHT, z - 1.5, x + MERLON / 2, WALL_HEIGHT + MERLON, z + 1.5, s));

        for (let x = CELL / 2; x < span; x += CELL) {
            slit(solid, x, 14, CELL - inner);
        }
    } else {
        solid.box(inner - 1, 0, -WALL_OVERLAP, CELL - inner + 1, 5, span + WALL_OVERLAP, s);
        solid.box(inner, 5, -WALL_OVERLAP, CELL - inner, WALL_HEIGHT, span + WALL_OVERLAP, s);
        merlonsAlong(solid, [inner + 1.5, 0], [inner + 1.5, span], (x, z) => solid.box(x - 1.5, WALL_HEIGHT, z - MERLON / 2, x + 1.5, WALL_HEIGHT + MERLON, z + MERLON / 2, s));
        merlonsAlong(solid, [CELL - inner - 1.5, 0], [CELL - inner - 1.5, span], (x, z) => solid.box(x - 1.5, WALL_HEIGHT, z - MERLON / 2, x + 1.5, WALL_HEIGHT + MERLON, z + MERLON / 2, s));
    }

    return solid.toObject();
}

/** A tower, 3 x 3 squares: round or square, with battlements or a roof. */
export function tower({ shape, top }, { stone = "stone", roof = "slate" } = {}) {
    const solid = new Solid();
    const s = material(stone);
    const c = CELL * 1.5;

    if (shape === "round") {
        const radius = 25;

        solid.cylinder(c, c, 0, 10, radius + 2.5, radius, s, { segments: 24 });
        solid.cylinder(c, c, 10, TOWER_HEIGHT, radius, radius, s, { segments: 24 });

        if (top === "roof") {
            // A band of corbels under the eaves, then a cone roof
            solid.cylinder(c, c, TOWER_HEIGHT, TOWER_HEIGHT + 4, radius, radius + 2, s, { segments: 24 });
            solid.cone(c, c, TOWER_HEIGHT + 4, 58, radius + 4, material(roof), 24);
            solid.cylinder(c, c, TOWER_HEIGHT + 60, TOWER_HEIGHT + 68, 0.8, 0.8, material("iron"), { segments: 6 });
        } else {
            roundBattlements(solid, c, c, radius, TOWER_HEIGHT, s);
        }

        slit(solid, c, 24, c + radius - 0.4);
        slit(solid, c, 42, c + radius - 0.4);
    } else {
        solid.box(4, 0, 4, 56, 8, 56, s);
        solid.box(6, 8, 6, 54, TOWER_HEIGHT, 54, s);

        if (top === "roof") {
            solid.box(5, TOWER_HEIGHT, 5, 55, TOWER_HEIGHT + 3, 55, s);
            solid.pyramid(3, 3, 57, 57, TOWER_HEIGHT + 3, 52, material(roof));
        } else {
            rectBattlements(solid, 6, 6, 54, 54, TOWER_HEIGHT, s);
        }

        slit(solid, c, 24, 54);
        slit(solid, c, 42, 54);
    }

    return solid.toObject();
}

/**
 * A gatehouse: two tall blocks either side of a passage two squares wide, joined by a bridge
 * over the passage with its portcullis raised. It faces `facing` (the way out of the castle).
 */
export function gatehouse({ facing }, { stone = "stone" } = {}) {
    const solid = new Solid();
    const s = material(stone);
    const height = TOWER_HEIGHT + 4;
    const bridge = 36;
    const iron = material("iron");

    if (facing === "n" || facing === "s") {
        // 80 x 60: blocks at the west and east ends, the passage between x = 20 and 60
        for (const [x0, x1] of [[0, 22], [58, 80]]) {
            solid.box(x0 - 1, 0, 0, x1 + 1, 8, 60, s);
            solid.box(x0, 8, 1, x1, height, 59, s);
            rectBattlements(solid, x0, 1, x1, 59, height, s);
            slit(solid, (x0 + x1) / 2, 30, 59);
        }

        solid.box(22, bridge, 10, 58, height - 6, 50, s);
        rectBattlements(solid, 22, 10, 58, 50, height - 6, s);

        // The raised portcullis, just showing under the arch
        for (let x = 24; x < 57; x += 4) {
            solid.box(x, bridge - 6, 29, x + 1.2, bridge, 31, iron);
        }

        solid.box(22, bridge - 6, 29.4, 58, bridge - 4.8, 30.6, iron);

        // A banner over the way in, on the outside (only seen when the outside faces south)
        if (facing === "s") {
            solid.box(34, bridge + 2, 50, 46, height - 8, 50.8, material("banner"));
            solid.box(38, bridge + 10, 50.8, 42, bridge + 16, 51.2, material("cloth-gold"));
        }
    } else {
        // 60 x 80: blocks at the north and south ends, the passage between z = 20 and 60
        for (const [z0, z1] of [[0, 22], [58, 80]]) {
            solid.box(0, 0, z0 - 1, 60, 8, z1 + 1, s);
            solid.box(1, 8, z0, 59, height, z1, s);
            rectBattlements(solid, 1, z0, 59, z1, height, s);
            slit(solid, 30, 30, z1);
        }

        solid.box(10, bridge, 22, 50, height - 6, 58, s);
        rectBattlements(solid, 10, 22, 50, 58, height - 6, s);

        for (let z = 24; z < 57; z += 4) {
            solid.box(29, bridge - 6, z, 31, bridge, z + 1.2, iron);
        }
    }

    return solid.toObject();
}

/**
 * A keep: the castle's great tower, filling a w x h footprint, with round turrets at its corners,
 * battlements, and a hipped roof. With `door`, its door faces south (towards the viewer).
 */
export function keep({ w, h, door }, { stone = "stone", roof = "slate" } = {}) {
    const solid = new Solid();
    const s = material(stone);
    const x0 = 7;
    const z0 = 7;
    const x1 = w * CELL - 7;
    const z1 = h * CELL - 7;
    const height = 70 + Math.min(w, h) * 4;
    const turret = 8;

    solid.box(x0 - 3, 0, z0 - 3, x1 + 3, 10, z1 + 3, s);
    solid.box(x0, 10, z0, x1, height, z1, s);
    rectBattlements(solid, x0, z0, x1, z1, height, s);
    solid.roof(x0 + 8, z0 + 8, x1 - 8, z1 - 8, height + 1, Math.min(x1 - x0, z1 - z0) * 0.45, { ridge: x1 - x0 >= z1 - z0 ? "x" : "z", hipped: true, material: material(roof) });

    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        solid.cylinder(x, z, 10, height + 14, turret, turret, s, { segments: 16 });
        solid.cone(x, z, height + 14, 30, turret + 2.5, material(roof), 16);
    }

    // Windows in rows on the south face
    for (let x = x0 + 18; x < x1 - 14; x += 16) {
        for (const y of [height * 0.45, height * 0.72]) {
            if (!(door && Math.abs(x - (x0 + x1) / 2) < 10 && y < 40)) {
                solid.box(x - 2, y, z1, x + 2, y + 8, z1 + 0.6, material("shadow"));
            }
        }
    }

    if (door) {
        const mid = (x0 + x1) / 2;

        solid.box(mid - 9, 10, z1, mid + 9, 34, z1 + 1.5, s);
        solid.box(mid - 6, 10, z1 + 1.5, mid + 6, 28, z1 + 2, material("planks-dark"));
        solid.box(mid - 10, 0, z1, mid + 10, 4, z1 + 6, s);
        solid.box(mid - 10, 4, z1, mid + 10, 8, z1 + 3, s);

        for (const x of [mid - 20, mid + 20]) {
            solid.box(x - 4, 30, z1, x + 4, 56, z1 + 0.8, material("banner"));
        }
    }

    return solid.toObject();
}

// --- Ruins ---------------------------------------------------------------------------------------

// World pixels in a metre
const m = (metres) => metres * 5;

// What's needed to build a ruined piece: a solid weathered as old stone is, the piece's own random
// numbers (by its site and where it stands in it), its stone gone old (painters.js MATERIALS'
// `old`: a "-old" of it if there is one)
function ruin(piece, stone) {
    const random = createRandom(((piece.seed ?? 1) ^ Math.round((piece.x ?? 0) * 977 + (piece.y ?? 0) * 131)) >>> 0);
    const solid = new Solid();

    solid.tone = weathered(random.int(1, 1e6), { moss: 0.6 });

    return { solid, random, s: material(MATERIALS[`${stone}-old`]?.old ? `${stone}-old` : stone) };
}

// What a ruined piece's breaks and broken tops show: the rubble core its faces were filled with
const core = () => material("rubble-old");

// Where a point of a wall laid along x (u along x, v along z) or along z (u along z, v along x) is
const along = (axis) => (axis === "x" ? (u, y, v) => [u, y, v] : (u, y, v) => [v, y, u]);

// How high a broken top stands `u` along it
function topAt(top, u) {
    const k = Math.max(0, top.findIndex((_, i) => i < top.length - 1 && top[i + 1][0] >= u));
    const [[ua, ha], [ub, hb]] = [top[k], top[k + 1] ?? top[k]];

    return ub > ua ? ha + ((hb - ha) * (Math.min(ub, Math.max(ua, u)) - ua)) / (ub - ua) : hb;
}

/**
 * A crumbled stretch of wall along `axis` from u0 to u1, v0 to v1 across, on `base`, its top
 * broken between `low` and `high`: its fallen stone against its foot on the sides asked for
 * (`sides`: +1, -1), a loose stone or two on top. Its broken top (brokenTop's).
 */
function crumbledRun(solid, random, axis, [u0, u1], [v0, v1], base, [low, high], s, { sides = [-1, 1], ground = 0, full = high, ends } = {}) {
    const at = along(axis);
    const top = brokenTop(random, u1 - u0, low, high);

    crumbledWall(solid, at, top, u0, [v0, v1], base, s, { ends, core: core() });

    for (const side of sides) {
        talus(solid, random, at, top, u0, side > 0 ? v1 : v0, side, full, ground, rubbleOf("human"));
    }

    perched(solid, random, at, top, u0, [v0, v1], high - 3, s);

    return top;
}

/** A stretch of castle wall left to ruin: crumbled down, its merlons gone. */
function ruinedWall(piece, { stone = "stone" } = {}) {
    const { solid, random, s } = ruin(piece, stone);
    const axis = piece.axis === "h" ? "x" : "z";
    const inner = (CELL - WALL_THICKNESS) / 2;
    const ends = [-WALL_OVERLAP, piece.length * CELL + WALL_OVERLAP];
    const at = along(axis);

    // (Its plinth, then the wall on it)
    crumbledWall(solid, at, [[0, 5], [ends[1] - ends[0], 5]], ends[0], [inner - 1, CELL - inner + 1], 0, s, { core: core() });
    crumbledRun(solid, random, axis, ends, [inner, CELL - inner], 5, [WALL_HEIGHT * 0.3, WALL_HEIGHT * 0.95], s, { full: WALL_HEIGHT });

    return solid.toObject();
}

/** A tower left to ruin: its roof or battlements gone, its walls crumbled round its top. */
function ruinedTower(piece, { stone = "stone" } = {}) {
    const { solid, random, s } = ruin(piece, stone);
    const c = CELL * 1.5;
    const range = [TOWER_HEIGHT * 0.35, TOWER_HEIGHT * 0.85];

    if (piece.shape === "round") {
        const radius = 25;

        solid.cylinder(c, c, 0, 10, radius + 2.5, radius, s, { segments: 24 });
        solid.cylinder(c, c, 9, 10.5, radius - 4, radius - 4, material("cobbles"), { segments: 12 });
        const rim = brokenRim(random, 28, 2 * Math.PI * radius, ...range);

        crumbledRing(solid, c, c, [radius - 4, radius], 10, rim, s, { core: core() });
        slit(solid, c, 24, c + radius - 0.4);

        // (What's left of its floors: joists snapped off where they came out of the wall, one
        // fallen across the heap inside)
        for (const level of [26, 42]) {
            for (let k = random.int(1, 3); k > 0; k--) {
                const a = random.next() * Math.PI * 2;

                if (rim[Math.floor((a / (Math.PI * 2)) * rim.length) % rim.length] > level + 4) {
                    oldBeam(solid, random, [c + Math.cos(a) * (radius - 3), level, c + Math.sin(a) * (radius - 3)], [c - Math.cos(a) * (radius - 3), level, c - Math.sin(a) * (radius - 3)], m(0.3), { broken: true });
                }
            }
        }

        oldBeam(solid, random, [c - 14, 11, c + random.range(-6, 6)], [c + 12, 11 + random.range(4, 14), c + random.range(-6, 6)], m(0.3));

        // (What fell in, and out round its foot)
        for (let k = random.int(3, 5); k > 0; k--) {
            tumbled(solid, random, [c + random.range(-12, 12), 12, c + random.range(-12, 12)], random.range(3, 5), s);
        }

        for (let k = random.int(3, 6); k > 0; k--) {
            const a = random.next() * Math.PI * 2;
            const r = radius + random.range(3, 9);

            tumbled(solid, random, [c + Math.cos(a) * r, 1, c + Math.sin(a) * r], random.range(2.5, 4.5), s);
        }
    } else {
        solid.box(4, 0, 4, 56, 8, 56, s);
        solid.box(10, 8, 10, 50, 9, 50, material("cobbles"));

        for (const [axis, u, v, side] of [["x", [6, 54], [6, 10], -1], ["x", [6, 54], [50, 54], 1], ["z", [10, 50], [6, 10], -1], ["z", [10, 50], [50, 54], 1]]) {
            crumbledRun(solid, random, axis, u, v, 8, range, s, { sides: [side], ground: 0, full: TOWER_HEIGHT });
        }

        slit(solid, c, 24, 54);
    }

    return solid.toObject();
}

/**
 * A gatehouse left to ruin: its two blocks crumbled to shells, the bridge over the way through
 * fallen (just where it sprang from left), its portcullis gone; the way through clear.
 */
function ruinedGatehouse(piece, { stone = "stone" } = {}) {
    const { solid, random, s } = ruin(piece, stone);
    const height = TOWER_HEIGHT + 4;
    const bridge = 36;
    // (Built in (u, v): u across the way through, v along it; u is x when it faces north or south)
    const axis = piece.facing === "n" || piece.facing === "s" ? "x" : "z";
    const at = along(axis);
    const other = axis === "x" ? "z" : "x";
    const range = [height * 0.35, height * 0.85];

    for (const [u0, u1, inside] of [[0, 22, 22], [58, 80, 58]]) {
        const box = (a0, y0, b0, a1, y1, b1) => {
            const [p, q] = [at(a0, y0, b0), at(a1, y1, b1)];

            solid.box(Math.min(p[0], q[0]), y0, Math.min(p[2], q[2]), Math.max(p[0], q[0]), y1, Math.max(p[2], q[2]), s);
        };

        box(u0 - 1, 0, 0, u1 + 1, 8, 60);
        box(u0 + 4, 8, 5, u1 - 4, 9, 55);

        // (Its four walls, a shell, crumbled each its own way: the one on the way through
        // standing higher, holding what's left of the arch)
        crumbledRun(solid, random, axis, [u0, u1], [1, 5], 8, range, s, { sides: [-1], full: height });
        crumbledRun(solid, random, axis, [u0, u1], [55, 59], 8, range, s, { sides: [1], full: height });

        const toPassage = inside === 22 ? 1 : -1;
        const passage = inside === 22 ? [u1 - 4, u1] : [u0, u0 + 4];
        const outside = inside === 22 ? [u0, u0 + 4] : [u1 - 4, u1];

        // (The side walls run along v: laid along the other axis)
        crumbledRun(solid, random, other, [5, 55], passage, 8, [bridge + 4, height * 0.9], s, { sides: [toPassage], full: height });
        crumbledRun(solid, random, other, [5, 55], outside, 8, range, s, { sides: [-toPassage], full: height });

        // (Where the bridge sprang from)
        box(Math.min(inside, inside + toPassage * 4), bridge - 2, 12, Math.max(inside, inside + toPassage * 4), bridge + 5, 48);

        // (And the timbers of the floor over the way through, snapped off where they came out of
        // the wall)
        for (let v = 16; v < 46; v += 9) {
            if (random.chance(0.6)) {
                oldBeam(solid, random, at(inside, bridge + 6, v), at(inside + toPassage * 36, bridge + 6, v), m(0.3), { broken: true });
            }
        }

        // (Fallen arch stones in the way's edges)
        for (let k = random.int(2, 3); k > 0; k--) {
            tumbled(solid, random, at(inside + toPassage * random.range(1, 4), 1, random.range(10, 50)), random.range(2.5, 4), s);
        }
    }

    return solid.toObject();
}

/**
 * A keep left to ruin: open to the sky, its roof and floors fallen in and lying inside its
 * crumbled walls, its corner turrets broken stumps; where its door was, a breach.
 */
function ruinedKeep(piece, { stone = "stone" } = {}) {
    const { solid, random, s } = ruin(piece, stone);
    const [x0, z0, x1, z1] = [7, 7, piece.w * CELL - 7, piece.h * CELL - 7];
    const height = 70 + Math.min(piece.w, piece.h) * 4;
    const range = [height * 0.3, height * 0.85];
    const thick = 6;
    const mid = (x0 + x1) / 2;

    solid.box(x0 - 3, 0, z0 - 3, x1 + 3, 10, z1 + 3, s);
    solid.box(x0 + thick, 10, z0 + thick, x1 - thick, 11, z1 - thick, material("cobbles"));

    crumbledRun(solid, random, "x", [x0, x1], [z0, z0 + thick], 10, range, s, { ground: 0, full: height });

    const west = crumbledRun(solid, random, "z", [z0 + thick, z1 - thick], [x0, x0 + thick], 10, range, s, { ground: 0, full: height, ends: [false, false] });
    const east = crumbledRun(solid, random, "z", [z0 + thick, z1 - thick], [x1 - thick, x1], 10, range, s, { ground: 0, full: height, ends: [false, false] });

    // (The joists of its hall's floor, across it from wall to wall: whole where both walls still
    // stand high enough to hold them, snapped off where one side fell, fallen in where both did)
    const floor = height * 0.42;
    const joist = m(0.3);

    for (let z = z0 + thick + 8; z < z1 - thick - 4; z += 10 + random.range(-2, 2)) {
        const [w, e] = [topAt(west, z - z0 - thick) > floor + 4, topAt(east, z - z0 - thick) > floor + 4];
        const [a, b] = [[x0 + thick - 2, floor, z], [x1 - thick + 2, floor, z]];

        if (w && e && random.chance(0.75)) {
            oldBeam(solid, random, a, b, joist);
        } else if (w || e) {
            oldBeam(solid, random, w ? a : b, w ? b : a, joist, { broken: true });
        } else if (random.chance(0.6)) {
            const lean = random.range(0.2, 0.6);

            oldBeam(solid, random, [a[0] + random.range(0, 10), 11, z + random.range(-6, 6)], [b[0] - random.range(0, 10), 11 + floor * lean, z + random.range(-6, 6)], joist);
        }
    }

    // (The south wall in two, its door a breach between them)
    const door = piece.door ? [mid - 8, mid + 8] : null;
    const south = door ? [[x0, door[0]], [door[1], x1]] : [[x0, x1]];
    const tops = south.map((run) => ({ run, top: crumbledRun(solid, random, "x", run, [z1 - thick, z1], 10, range, s, { ground: 0, full: height }) }));

    // (Its windows, where enough of the south wall's left round them)
    for (let x = x0 + 18; x < x1 - 14; x += 16) {
        for (const y of [height * 0.45, height * 0.72]) {
            const own = tops.find(({ run }) => x > run[0] + 4 && x < run[1] - 4);
            const left = own && own.top.filter(([u]) => Math.abs(own.run[0] + u - x) < 6).every(([, h]) => h > y + 12);

            if (left) {
                solid.box(x - 2, y, z1, x + 2, y + 8, z1 + 0.6, material("shadow"));
            }
        }
    }

    // (Its corner turrets: broken stumps, open)
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        crumbledRing(solid, x, z, [5, 8], 10, brokenRim(random, 12, 2 * Math.PI * 8, height * 0.3, height * 0.95), s, { core: core() });
    }

    // (Its floors and roof, fallen in)
    for (let k = random.int(6, 10); k > 0; k--) {
        tumbled(solid, random, [random.range(x0 + 10, x1 - 10), 13, random.range(z0 + 10, z1 - 10)], random.range(3, 6), s);
    }

    if (piece.door) {
        solid.box(mid - 10, 0, z1, mid + 10, 4, z1 + 6, s);
    }

    return solid.toObject();
}

/** The castle's pieces left to ruin (a ruined castle's, sites.js: piece.ruined), by kind. */
export const RUINED = Object.freeze({ wall: ruinedWall, tower: ruinedTower, gatehouse: ruinedGatehouse, keep: ruinedKeep });
