// Castle pieces: walls, towers, gatehouses and keeps, built from simple shapes in the spirit of
// Castle Builder (github.com/JonRubashkin/Castle-Builder): stone masses, battlements (merlons
// spaced along every top edge), cone and pyramid roofs.
//
// Sizes are world pixels (a grid square is 20). Walls stand in the middle of their row of
// squares and reach a little way under the towers at each end, so that they meet round towers
// without a gap; towers and gatehouses are drawn after (in front of) the walls they join.

import { Solid } from "../engine/solid.js";
import { material } from "../engine/materials.js";

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
            solid.box(38, bridge + 10, 50.8, 42, bridge + 16, 51.2, material("gold"));
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
