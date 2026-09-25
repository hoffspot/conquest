// Lays out a town on a rectangle of grid squares, in the manner of Watabou's Medieval Fantasy
// City Generator but at the scale of the game's units: a market square with streets from it to
// each way in, lanes branching off them, and houses on plots along every street, facing it. The
// tavern, church and blacksmith stand on the square; gardens and trees fill the backs of the
// plots, and a windmill may stand at the edge of town.
//
// Streets are two squares wide so that tanks can drive through. Everything uses the seeded random
// numbers of random.js, so the same seed always gives the same town.

import { createRandom } from "../random.js";
import { GROUND, HOUSE_STYLES, HOUSE_VARIANTS, LANDMARKS, houseKey, landmarkKey, propKey, treeKey, TREE_VARIANTS } from "./pieces.js";
import { Plan } from "./plan.js";

/** The smallest town, in squares. */
export const TOWN_MIN = Object.freeze([16, 14]);

const ATTEMPTS = 30;
const SIDES = ["n", "e", "s", "w"];
const YARD_PROPS = ["barrels", "crates", "sacks", "cart"];

/**
 * A town filling width x height squares, with streets leaving it on the given sides ("n", "e",
 * "s", "w"). Returns { kind, width, height, approaches, seed, pieces, obstructed, ground,
 * entrances, square } (see layoutCastle); entrances lists, for each way in, the street's squares
 * at the edge, and square is the market square ({ x, y, w, h }).
 */
export function layoutTown({ width, height, approaches = ["w", "e"], seed = 1 }) {
    if (width < TOWN_MIN[0] || height < TOWN_MIN[1]) {
        throw new Error(`A town needs at least ${TOWN_MIN[0]} x ${TOWN_MIN[1]} squares`);
    }

    if (approaches.length === 0 || approaches.some((side) => !SIDES.includes(side))) {
        throw new Error("A town needs at least one way in, on the n, e, s or w side");
    }

    const random = createRandom(seed);

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const town = designTown(width, height, approaches, createRandom(random.seed()));

        if (town) {
            return { kind: "town", approaches, seed, ...town };
        }
    }

    throw new Error(`Could not lay out a town (${width} x ${height}, seed ${seed})`);
}

function designTown(width, height, approaches, random) {
    const plan = new Plan(width, height);
    const street = Array.from({ length: height }, () => new Array(width).fill(0));
    const isStreet = (x, y) => plan.inside(x, y) && street[y][x] === 1;
    const lay = (x, y, w, h, ground) => {
        plan.paint(x, y, w, h, ground);

        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (plan.inside(i, j)) {
                    street[j][i] = 1;
                }
            }
        }
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    // The square, somewhere near the middle
    const pw = random.int(5, 7);
    const ph = random.int(4, 5);
    const px = clamp((width >> 1) - (pw >> 1) + random.int(-2, 2), 3, width - pw - 3);
    const py = clamp((height >> 1) - (ph >> 1) + random.int(-2, 2), 3, height - ph - 3);

    lay(px, py, pw, ph, GROUND.cobbles);

    // Streets from the square to each way in: rows sy and sy + 1 east-west, columns sx and sx + 1
    // north-south
    const sy = py + random.int(0, ph - 2);
    const sx = px + random.int(0, pw - 2);
    const entrances = {};

    for (const side of approaches) {
        switch (side) {
            case "w": lay(0, sy, px, 2, GROUND.road); entrances.w = [[0, sy], [0, sy + 1]]; break;
            case "e": lay(px + pw, sy, width - px - pw, 2, GROUND.road); entrances.e = [[width - 1, sy], [width - 1, sy + 1]]; break;
            case "n": lay(sx, 0, 2, py, GROUND.road); entrances.n = [[sx, 0], [sx + 1, 0]]; break;
            default: lay(sx, py + ph, 2, height - py - ph, GROUND.road); entrances.s = [[sx, height - 1], [sx + 1, height - 1]];
        }
    }

    // Lanes branching off the streets, at least five squares from any street running the same way
    const eastWest = approaches.includes("w") || approaches.includes("e");
    const northSouth = approaches.includes("n") || approaches.includes("s");
    const columns = northSouth ? [sx] : [];
    const rows = eastWest ? [sy] : [];
    const lanes = random.int(1, 3);

    for (let tries = 0, made = 0; tries < 40 && made < lanes; tries++) {
        const vertical = eastWest && (!northSouth || random.chance(0.5));

        if (vertical) {
            const x = random.int(2, width - 4);

            if (!isStreet(x, sy) || !isStreet(x + 1, sy) || (x + 2 > px - 3 && x < px + pw + 3) || columns.some((c) => Math.abs(c - x) < 5)) {
                continue;
            }

            const north = random.chance(0.5) ? 0 : random.int(0, Math.max(0, sy - 5));
            const south = random.chance(0.5) ? height : random.int(Math.min(height, sy + 6), height);

            lay(x, north, 2, sy - north, GROUND.road);
            lay(x, sy + 2, 2, south - sy - 2, GROUND.road);
            columns.push(x);

            if (north === 0) {
                entrances[`lane${made}n`] = [[x, 0], [x + 1, 0]];
            }

            if (south === height) {
                entrances[`lane${made}s`] = [[x, height - 1], [x + 1, height - 1]];
            }
        } else if (northSouth) {
            const y = random.int(2, height - 4);

            if (!isStreet(sx, y) || !isStreet(sx, y + 1) || (y + 2 > py - 3 && y < py + ph + 3) || rows.some((r) => Math.abs(r - y) < 5)) {
                continue;
            }

            const west = random.chance(0.5) ? 0 : random.int(0, Math.max(0, sx - 5));
            const east = random.chance(0.5) ? width : random.int(Math.min(width, sx + 6), width);

            lay(west, y, sx - west, 2, GROUND.road);
            lay(sx + 2, y, east - sx - 2, 2, GROUND.road);
            rows.push(y);

            if (west === 0) {
                entrances[`lane${made}w`] = [[0, y], [0, y + 1]];
            }

            if (east === width) {
                entrances[`lane${made}e`] = [[width - 1, y], [width - 1, y + 1]];
            }
        } else {
            continue;
        }

        made++;
    }

    const isBuildable = (x, y, w, h) => {
        if (!plan.isFree(x, y, w, h)) {
            return false;
        }

        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (street[j][i]) {
                    return false;
                }
            }
        }

        return true;
    };
    const touchesStreet = (x, y, w, h, test = isStreet) => {
        for (let i = x; i < x + w; i++) {
            if (test(i, y - 1) || test(i, y + h)) {
                return true;
            }
        }

        for (let j = y; j < y + h; j++) {
            if (test(x - 1, j) || test(x + w, j)) {
                return true;
            }
        }

        return false;
    };
    const onSquare = (x, y) => x >= px && x < px + pw && y >= py && y < py + ph;

    // The tavern, church and blacksmith on the square (or on a street near it)
    for (const name of random.shuffle(["tavern", "church", "blacksmith"])) {
        const [w, h] = LANDMARKS[name];
        const spots = [];

        for (let y = 0; y + h <= height; y++) {
            for (let x = 0; x + w <= width; x++) {
                if (isBuildable(x, y, w, h) && touchesStreet(x, y, w, h)) {
                    const distance = Math.abs(2 * x + w - 2 * px - pw) + Math.abs(2 * y + h - 2 * py - ph);

                    spots.push({ x, y, score: (touchesStreet(x, y, w, h, onSquare) ? 0 : 20) + distance + random.int(0, 4) });
                }
            }
        }

        const best = spots.sort((a, b) => a.score - b.score)[0];

        if (best && (name !== "blacksmith" || random.chance(0.8))) {
            plan.place({ key: landmarkKey(name), x: best.x, y: best.y, w, h });
        }
    }

    // A well and market stalls on the square, off the streets crossing it
    const crossing = (x, y) => (eastWest && (y === sy || y === sy + 1)) || (northSouth && (x === sx || x === sx + 1));
    const spare = (x, y, w, h) => {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (!onSquare(i, j) || crossing(i, j) || plan.taken[j][i]) {
                    return false;
                }
            }
        }

        return true;
    };
    const keepsStreetsJoined = (piece) => {
        plan.place(piece);

        const reach = plan.reachable(Object.values(entrances)[0]);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (street[y][x] && !plan.taken[y][x] && !reach[y][x]) {
                    plan.remove(piece);

                    return false;
                }
            }
        }

        return true;
    };

    for (const name of ["well", "tent", "tent"]) {
        const corners = random.shuffle([[px, py], [px + pw - 2, py], [px, py + ph - 2], [px + pw - 2, py + ph - 2]]);

        for (const [x, y] of corners) {
            if (spare(x, y, 2, 2) && keepsStreetsJoined({ key: propKey(name), x, y, w: 2, h: 2 })) {
                break;
            }
        }
    }

    // Houses on plots along the streets, two or three squares deep, facing the street. Each town
    // favours one style of building.
    const favourite = random.pick(HOUSE_STYLES);
    const styleOf = () => (random.chance(0.55) ? favourite : random.pick(HOUSE_STYLES));
    const frontage = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!street[y][x]) {
                for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
                    if (isStreet(x + dx, y + dy)) {
                        frontage.push({ x, y, dx, dy });
                    }
                }
            }
        }
    }

    for (const { x, y, dx, dy } of random.shuffle(frontage)) {
        if (plan.taken[y][x] || random.chance(0.06)) {
            continue;
        }

        const along = random.int(2, 4);
        const deep = random.int(2, 3);

        placing: for (const depth of [deep, 2]) {
            for (const offset of random.shuffle([...Array(along).keys()])) {
                // The plot runs away from the street, `along` squares wide and `depth` deep
                const w = dx === 0 ? along : depth;
                const h = dx === 0 ? depth : along;
                const left = dx === 0 ? x - offset : dx > 0 ? x - depth + 1 : x;
                const top = dx !== 0 ? y - offset : dy > 0 ? y - depth + 1 : y;

                if (isBuildable(left, top, w, h)) {
                    plan.place({ key: houseKey(w, h, styleOf(), random.int(0, HOUSE_VARIANTS - 1)), x: left, y: top, w, h });
                    break placing;
                }
            }
        }
    }

    // A windmill at the edge of town
    if (random.chance(0.6)) {
        const spots = [];

        for (let y = 0; y + 3 <= height; y++) {
            for (let x = 0; x + 3 <= width; x++) {
                const edge = x === 0 || y === 0 || x + 3 === width || y + 3 === height;

                if (edge && isBuildable(x, y, 3, 3)) {
                    spots.push([x, y]);
                }
            }
        }

        if (spots.length) {
            const [x, y] = random.pick(spots);

            keepsStreetsJoined({ key: landmarkKey("windmill"), x, y, w: 3, h: 3 });
        }
    }

    // What's left: things piled in yards, trees, and gardens where no one can get to
    const reach = plan.reachable(Object.values(entrances)[0]);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (plan.taken[y][x] || street[y][x]) {
                continue;
            }

            const byHouse = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([nx, ny]) => plan.taken[y + ny]?.[x + nx]);

            if (!reach[y][x]) {
                if (random.chance(0.45)) {
                    plan.place({ key: treeKey(random.int(0, TREE_VARIANTS - 1)), x, y, w: 1, h: 1 });
                } else {
                    plan.ground[y][x] = GROUND.soil;
                    plan.obstructed[y][x] = 1;
                }
            } else if (byHouse && random.chance(0.15)) {
                keepsStreetsJoined({ key: propKey(random.pick(YARD_PROPS)), x, y, w: 1, h: 1 });
            } else if (!touchesStreet(x, y, 1, 1) && random.chance(0.3)) {
                keepsStreetsJoined({ key: treeKey(random.int(0, TREE_VARIANTS - 1)), x, y, w: 1, h: 1 });
            }
        }
    }

    // Every way in must lead to every other, and to the square
    const joined = plan.reachable(Object.values(entrances)[0]);
    const entrancesJoined = Object.values(entrances).every((cells) => cells.every(([x, y]) => joined[y][x]));
    let squareJoined = false;

    for (let y = py; y < py + ph; y++) {
        for (let x = px; x < px + pw; x++) {
            squareJoined ||= joined[y][x] === 1;
        }
    }

    if (!entrancesJoined || !squareJoined || plan.pieces.filter((piece) => piece.key.startsWith("house")).length < 4) {
        return undefined;
    }

    return {
        width,
        height,
        pieces: plan.pieces,
        obstructed: plan.obstructed,
        ground: plan.ground,
        entrances: approaches.map((side) => entrances[side]),
        square: { x: px, y: py, w: pw, h: ph },
    };
}
