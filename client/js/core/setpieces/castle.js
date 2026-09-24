// Lays out a castle on a rectangle of grid squares: an outer wall (a rectangle, or an L with one
// back corner cut away) with towers at its corners and along it, a gatehouse on the side facing
// the way in, a keep towards the back, buildings against the walls, and props in the courtyard.
//
// Castles are designed with the gate facing south and then turned to face the way asked for.
// Everything uses the seeded random numbers and whole-number arithmetic of random.js, so the same
// seed always gives the same castle.

import { createRandom } from "../random.js";
import { GATEHOUSE_LENGTH, GROUND, HOUSE_VARIANTS, KEEP_SIZES, TOWER_SHAPES, TOWER_TOPS, WALL_MAX, gatehouseKey, houseKey, keepKey, propKey, towerKey, wallKey } from "./pieces.js";
import { Plan } from "./plan.js";

/** The smallest castle: squares along the gate side, and away from it. */
export const CASTLE_MIN = Object.freeze([16, 14]);

const ATTEMPTS = 30;

// The furthest apart towers stand along a wall
const TOWER_SPACING = 7;

const BUILDING_SIZES = [[3, 2], [4, 2], [2, 3], [2, 4], [3, 3], [4, 3]];
const SMALL_PROPS = ["barrels", "crates", "sacks", "cart", "weaponrack", "target", "stones"];

/**
 * A castle filling width x height squares, its gate facing `gate` ("n", "e", "s" or "w").
 * Returns { kind, width, height, gate, seed, pieces, obstructed, ground, entrance }:
 *   pieces      [{ key, x, y, w, h }]: which art to draw where (see pieces.js)
 *   obstructed  [y][x] 1 where units can't go
 *   ground      [y][x] what the ground is (GROUND)
 *   entrance    the squares where the road into the castle leaves the rectangle
 */
export function layoutCastle({ width, height, gate = "s", seed = 1 }) {
    const across = gate === "n" || gate === "s";
    const [frameWidth, frameHeight] = across ? [width, height] : [height, width];

    if (frameWidth < CASTLE_MIN[0] || frameHeight < CASTLE_MIN[1]) {
        throw new Error(`A castle needs at least ${CASTLE_MIN[0]} x ${CASTLE_MIN[1]} squares (along its gate side x away from it)`);
    }

    const random = createRandom(seed);

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const design = designCastle(frameWidth, frameHeight, createRandom(random.seed()));

        if (design) {
            return { kind: "castle", gate, seed, ...orient(design, gate) };
        }
    }

    throw new Error(`Could not lay out a castle (${width} x ${height}, seed ${seed})`);
}

// Design a castle with its gate facing south, on a width x height plan. Returns the plan, the
// squares of the road out, and where the keep's door is, or undefined if this try didn't work.
function designCastle(width, height, random) {
    const plan = new Plan(width, height);

    // The wall runs along these rows and columns, one square in from the towers' outer edges
    const X0 = 2 + random.int(0, 1);
    const X1 = width - 3 - random.int(0, 1);
    const Y0 = 2 + random.int(0, 1);
    const Y1 = height - 3 - random.int(0, 1);

    let outline = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
    // The corner cut away, including (notch) or not including (beyond) the walls around it
    let notch = () => false;
    let beyond = () => false;

    // Sometimes an L shape: a back corner left outside the walls
    if (X1 - X0 >= 13 && Y1 - Y0 >= 11 && random.chance(0.45)) {
        const nw = random.int(4, Math.floor((X1 - X0) / 2) - 1);
        const nh = random.int(4, Math.floor((Y1 - Y0) / 2) - 1);

        if (random.chance(0.5)) {
            outline = [[X0, Y0], [X1 - nw, Y0], [X1 - nw, Y0 + nh], [X1, Y0 + nh], [X1, Y1], [X0, Y1]];
            notch = (x, y) => x >= X1 - nw && y <= Y0 + nh;
            beyond = (x, y) => x > X1 - nw && y < Y0 + nh;
        } else {
            outline = [[X0 + nw, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0 + nh], [X0 + nw, Y0 + nh]];
            notch = (x, y) => x <= X0 + nw && y <= Y0 + nh;
            beyond = (x, y) => x < X0 + nw && y < Y0 + nh;
        }
    }

    // Inside the walls
    const inside = (x, y) => x > X0 && x < X1 && y > Y0 && y < Y1 && !notch(x, y);

    // The gatehouse, in the middle part of the south wall: its passage is its two middle columns
    const middle = (X0 + X1) >> 1;
    const g0 = Math.max(X0 + 2, Math.min(X1 - 5, middle - 2 + random.int(-2, 2)));
    const cornerStyle = { shape: random.pick(TOWER_SHAPES), top: random.pick(TOWER_TOPS) };
    const wallStyle = random.chance(0.5) ? cornerStyle : { shape: random.pick(TOWER_SHAPES), top: random.pick(TOWER_TOPS) };

    // Towers at every corner and along each wall, except where the gatehouse stands
    const towers = [];

    for (let i = 0; i < outline.length; i++) {
        const [ax, ay] = outline[i];
        const [bx, by] = outline[(i + 1) % outline.length];
        const length = Math.abs(bx - ax) + Math.abs(by - ay);
        const parts = Math.ceil(length / TOWER_SPACING);

        for (let k = 0; k < parts; k++) {
            const along = Math.round((k * length) / parts);
            const x = ax + Math.sign(bx - ax) * along;
            const y = ay + Math.sign(by - ay) * along;
            const corner = k === 0;

            if (!corner && y === Y1 && x + 1 >= g0 - 1 && x - 1 <= g0 + GATEHOUSE_LENGTH) {
                continue;
            }

            towers.push({ x, y, ...(corner ? cornerStyle : wallStyle) });
        }
    }

    for (const tower of towers) {
        plan.place({ kind: "tower", shape: tower.shape, top: tower.top, x: tower.x - 1, y: tower.y - 1, w: 3, h: 3 });
    }

    plan.place({ kind: "gatehouse", x: g0, y: Y1 - 1, w: GATEHOUSE_LENGTH, h: 3 }, { passable: [[1, 0], [2, 0], [1, 1], [2, 1], [1, 2], [2, 2]] });

    // Walls along each side, between the towers and the gatehouse
    for (let i = 0; i < outline.length; i++) {
        const [ax, ay] = outline[i];
        const [bx, by] = outline[(i + 1) % outline.length];
        const horizontal = ay === by;
        const from = horizontal ? Math.min(ax, bx) : Math.min(ay, by);
        const to = horizontal ? Math.max(ax, bx) : Math.max(ay, by);
        let run = [];

        const finish = () => {
            // In pieces of up to WALL_MAX squares, as even in length as they can be
            const pieces = Math.ceil(run.length / WALL_MAX);

            for (let k = 0, start = run[0]; k < pieces; k++) {
                const length = Math.floor((run.length * (k + 1)) / pieces) - Math.floor((run.length * k) / pieces);

                plan.place(horizontal
                    ? { kind: "wall", axis: "h", length, x: start, y: ay, w: length, h: 1 }
                    : { kind: "wall", axis: "v", length, x: ax, y: start, w: 1, h: length });
                start += length;
            }

            run = [];
        };

        for (let at = from; at <= to; at++) {
            const [x, y] = horizontal ? [at, ay] : [ax, at];

            if (plan.taken[y][x]) {
                finish();
            } else {
                run.push(at);
            }
        }

        finish();
    }

    // The keep: as big as fits, towards the back, clear of the walls all round
    const keepSizes = random.shuffle(KEEP_SIZES).sort((a, b) => b[0] * b[1] - a[0] * a[1]);
    let keep;

    for (const [w, h] of keepSizes) {
        let best;

        for (let y = Y0 + 2; y + h <= Y1 - 2; y++) {
            for (let x = X0 + 2; x + w <= X1 - 1; x++) {
                if (!clearAround(plan, inside, x, y, w, h)) {
                    continue;
                }

                const score = y * 4 + Math.abs(2 * x + w - X0 - X1) + random.int(0, 3);

                if (!best || score < best.score) {
                    best = { x, y, score };
                }
            }
        }

        if (best) {
            keep = plan.place({ kind: "keep", x: best.x, y: best.y, w, h });
            break;
        }
    }

    if (!keep) {
        return undefined;
    }

    // The way from the gate to the keep's door, two squares wide, paved
    const gateInside = [g0 + 1, Y1 - 2];
    const door = [keep.x + (keep.w >> 1), keep.y + keep.h];

    if (!inside(...door) || plan.taken[door[1]][door[0]]) {
        return undefined;
    }

    const path = plan.route(gateInside, door, inside);

    if (!path) {
        return undefined;
    }

    const reserved = new Set();
    const reserve = (x, y) => {
        if (inside(x, y) && !plan.taken[y][x]) {
            reserved.add(y * width + x);
        }
    };

    for (const [x, y] of path) {
        reserve(x, y);
        reserve(x + 1, y);
    }

    const isSpare = (x, y, w, h) => {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (!inside(i, j) || plan.taken[j][i] || reserved.has(j * width + i)) {
                    return false;
                }
            }
        }

        return true;
    };

    // Everyone inside must still be able to get out
    const connected = () => {
        const reach = plan.reachable([gateInside]);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (inside(x, y) && plan.isOpen(x, y) && !reach[y][x]) {
                    return false;
                }
            }
        }

        return reach[door[1]][door[0]] === 1;
    };

    const tryPlace = (piece) => {
        plan.place(piece);

        if (connected()) {
            return true;
        }

        plan.remove(piece);

        return false;
    };

    // Buildings against the inside of the walls (halls, barracks, stables), clear of the keep
    const touchesWall = (x, y, w, h) => {
        for (let j = y - 1; j <= y + h; j++) {
            for (let i = x - 1; i <= x + w; i++) {
                const edge = (i === x - 1 || i === x + w) !== (j === y - 1 || j === y + h);

                if (edge && !inside(i, j)) {
                    return true;
                }
            }
        }

        return false;
    };
    const nearKeep = (x, y, w, h) => x <= keep.x + keep.w && x + w >= keep.x && y <= keep.y + keep.h && y + h >= keep.y;
    const buildings = random.int(2, 5);

    for (let tries = 0, placed = 0; tries < 80 && placed < buildings; tries++) {
        const [w, h] = random.pick(BUILDING_SIZES);
        const x = random.int(X0 + 1, X1 - w);
        const y = random.int(Y0 + 1, Y1 - h);

        if (isSpare(x, y, w, h) && touchesWall(x, y, w, h) && !nearKeep(x, y, w, h)) {
            const style = random.chance(0.7) ? "stone" : "timber";

            if (tryPlace({ kind: "building", style, variant: random.int(0, HOUSE_VARIANTS - 1), x, y, w, h })) {
                placed++;
            }
        }
    }

    // A well standing in the open, perhaps a tent or two, and things piled against the buildings
    const inTheOpen = (x, y, w, h) => isSpare(x - 1, y - 1, w + 2, h + 2);

    for (const [name, chance] of [["well", 0.6], ["tent", 0.3], ["tent", 0.2]]) {
        for (let tries = 0; tries < 30 && random.chance(chance); tries++) {
            const x = random.int(X0 + 2, X1 - 3);
            const y = random.int(Y0 + 2, Y1 - 3);

            if (inTheOpen(x, y, 2, 2) && tryPlace({ kind: "prop", name, x, y, w: 2, h: 2 })) {
                break;
            }
        }
    }

    const props = random.int(3, 7);

    for (let tries = 0, placed = 0; tries < 60 && placed < props; tries++) {
        const x = random.int(X0 + 1, X1 - 1);
        const y = random.int(Y0 + 1, Y1 - 1);
        const againstSomething = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => plan.taken[y + dy]?.[x + dx]);

        if (isSpare(x, y, 1, 1) && againstSomething && tryPlace({ kind: "prop", name: random.pick(SMALL_PROPS), x, y, w: 1, h: 1 })) {
            placed++;
        }
    }

    // The ground: a beaten-earth courtyard, a paved way from the gate to the keep, and a road out
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (inside(x, y)) {
                plan.ground[y][x] = reserved.has(y * width + x) ? GROUND.cobbles : GROUND.courtyard;
            }
        }
    }

    // Beaten earth under the walls too, so the courtyard reaches right up to them
    for (let y = Y0; y <= Y1; y++) {
        for (let x = X0; x <= X1; x++) {
            if (!beyond(x, y) && plan.ground[y][x] === GROUND.grass) {
                plan.ground[y][x] = GROUND.courtyard;
            }
        }
    }

    plan.paint(g0 + 1, Y1 - 1, 2, 3, GROUND.cobbles);
    plan.paint(g0 + 1, Y1 + 2, 2, height - Y1 - 2, GROUND.road);

    const entrance = [[g0 + 1, height - 1], [g0 + 2, height - 1]];
    const reach = plan.reachable(entrance);

    if (!reach[door[1]][door[0]] || !connected()) {
        return undefined;
    }

    return { plan, entrance };
}

// Is the rectangle, and a square all round it, inside the walls and free?
function clearAround(plan, inside, x, y, w, h) {
    for (let j = y - 1; j <= y + h; j++) {
        for (let i = x - 1; i <= x + w; i++) {
            if (!inside(i, j) || plan.taken[j][i]) {
                return false;
            }
        }
    }

    return true;
}

// Turn a castle designed with its gate to the south to face `gate`, and name each piece's art
function orient({ plan, entrance }, gate) {
    const { width: fw, height: fh } = plan;
    const across = gate === "n" || gate === "s";
    const width = across ? fw : fh;
    const height = across ? fh : fw;

    // Where a rectangle in the design goes
    const rect = ({ x, y, w, h }) => {
        switch (gate) {
            case "n": return { x, y: fh - y - h, w, h };
            case "e": return { x: y, y: fw - x - w, w: h, h: w };
            case "w": return { x: fh - y - h, y: x, w: h, h: w };
            default: return { x, y, w, h };
        }
    };
    const point = ([x, y]) => {
        const { x: px, y: py } = rect({ x, y, w: 1, h: 1 });

        return [px, py];
    };

    const pieces = plan.pieces.map((piece) => {
        const at = rect(piece);
        let key;

        switch (piece.kind) {
            case "wall": key = wallKey(across ? piece.axis : piece.axis === "h" ? "v" : "h", piece.length); break;
            case "tower": key = towerKey(piece.shape, piece.top); break;
            case "gatehouse": key = gatehouseKey(gate); break;
            case "keep": key = keepKey(at.w, at.h, gate === "s"); break;
            case "building": key = houseKey(at.w, at.h, piece.style, piece.variant); break;
            default: key = propKey(piece.name);
        }

        return { key, ...at };
    });

    const obstructed = Array.from({ length: height }, () => new Array(width).fill(0));
    const ground = Array.from({ length: height }, () => new Array(width).fill(GROUND.grass));

    for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
            const [px, py] = point([x, y]);

            obstructed[py][px] = plan.obstructed[y][x];
            ground[py][px] = plan.ground[y][x];
        }
    }

    return { width, height, pieces, obstructed, ground, entrance: entrance.map(point) };
}
