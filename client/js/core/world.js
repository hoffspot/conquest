// The world the game is played in: a town (setpieces/town.js) in the middle of fields, on a grid of
// 1-metre squares that characters stand on and move across. A character fills one square, so the
// eight squares round it are within arm's reach.
//
// The town is laid out on a coarser plan: each of its squares ("plots") is PLOT metres across,
// which gives houses of 8 to 16 metres, streets 8 metres wide and a market square of 20 to 28
// metres, the right size for 1.7-metre people. The town's art (world/town3d.js) is built to the
// same measure: one plot is 20 of the art's world pixels, a fifth of a metre each.
//
// Fields surround the town, with trees dotted about and the town's streets carrying on as roads to
// the edge of the map. The player starts in the market square. An orc starts in the north-west
// corner and patrols south along the west side, halfway down the map and back.
//
// Everything comes from one seed, so a saved character always comes back to the same town.

import { createRandom } from "./random.js";
import { GROUND, TREE_VARIANTS } from "./setpieces/pieces.js";
import { layoutTown } from "./setpieces/town.js";

/** Metres per square of the town's plan. */
export const PLOT = 4;

/** The town's size, in plots, and the fields round it (plots on every side). */
export const TOWN_PLOTS = Object.freeze([18, 16]);
export const BORDER_PLOTS = 5;

// Trees in the fields: about one for every this many square metres
const TREE_SPACING = 70;

// No trees this close (in metres) to a road, to the orc's patrol or to where characters start
const CLEAR_OF_ROADS = 2;
const CLEAR_OF_PATROL = 4;
const CLEAR_OF_SPAWNS = 5;

// The orc starts this far (metres) in from the map's north-west corner
const CORNER = 3;

const rows = (width, height, value = 0) => Array.from({ length: height }, () => new Uint8Array(width).fill(value));

/**
 * Generate the world for a seed: { seed, width, height (squares, 1 m each), plot, origin (where
 * the town's north-west corner is, in metres), town (its layout, in plots), blocked[y][x] (1 where
 * characters can't go), ground[y][x] (GROUND kinds), trees ([{ x, y, variant }], trunks at square
 * corners, in metres), spawns: { player, orc } ([x, y] squares), patrol ([[x, y], [x, y]]
 * squares) }.
 */
export function generateWorld({ seed = 1, town: [townWidth, townHeight] = TOWN_PLOTS, border = BORDER_PLOTS } = {}) {
    const random = createRandom(seed);
    const town = layoutTown({ width: townWidth, height: townHeight, approaches: ["n", "e", "s", "w"], seed: random.seed() });
    const width = (townWidth + 2 * border) * PLOT;
    const height = (townHeight + 2 * border) * PLOT;
    const origin = border * PLOT;
    const blocked = rows(width, height);
    const ground = rows(width, height, GROUND.grass);
    const inTown = (x, y) => x >= origin && y >= origin && x < origin + townWidth * PLOT && y < origin + townHeight * PLOT;

    // The town, each plot filling PLOT x PLOT squares
    for (let j = 0; j < townHeight; j++) {
        for (let i = 0; i < townWidth; i++) {
            for (let y = 0; y < PLOT; y++) {
                for (let x = 0; x < PLOT; x++) {
                    ground[origin + j * PLOT + y][origin + i * PLOT + x] = town.ground[j][i];
                    blocked[origin + j * PLOT + y][origin + i * PLOT + x] = town.obstructed[j][i];
                }
            }
        }
    }

    // Props and trees are smaller than houses: they fill only the middle half of their plots
    // (a well or tent 4 metres across, barrels or a tree trunk 2), and characters can walk round
    // them
    for (const piece of town.pieces.filter(({ key }) => /^(prop|tree)-/.test(key))) {
        const [x0, y0] = [origin + piece.x * PLOT, origin + piece.y * PLOT];
        const [w, h] = [piece.w * PLOT, piece.h * PLOT];

        for (let y = y0; y < y0 + h; y++) {
            for (let x = x0; x < x0 + w; x++) {
                blocked[y][x] = x >= x0 + w / 4 && x < x0 + (3 * w) / 4 && y >= y0 + h / 4 && y < y0 + (3 * h) / 4 ? 1 : 0;
            }
        }
    }

    // Its streets carry on as roads to the edge of the map
    const road = rows(width, height);

    for (const squares of town.entrances) {
        const xs = squares.map(([x]) => x);
        const ys = squares.map(([, y]) => y);
        const [x0, x1] = [Math.min(...xs) * PLOT + origin, (Math.max(...xs) + 1) * PLOT + origin];
        const [y0, y1] = [Math.min(...ys) * PLOT + origin, (Math.max(...ys) + 1) * PLOT + origin];
        const lay = (left, top, right, bottom) => {
            for (let y = top; y < bottom; y++) {
                for (let x = left; x < right; x++) {
                    ground[y][x] = GROUND.road;
                    road[y][x] = 1;
                }
            }
        };

        if (xs[0] === 0 && xs[1] === 0) {
            lay(0, y0, origin, y1);
        } else if (xs[0] === townWidth - 1 && xs[1] === townWidth - 1) {
            lay(origin + townWidth * PLOT, y0, width, y1);
        } else if (ys[0] === 0) {
            lay(x0, 0, x1, origin);
        } else {
            lay(x0, origin + townHeight * PLOT, x1, height);
        }
    }

    // Where characters start: the middle of the market square, and the north-west corner
    const { square } = town;
    const player = nearestFree(blocked, [origin + Math.floor((square.x + square.w / 2) * PLOT), origin + Math.floor((square.y + square.h / 2) * PLOT)]);
    const orcStart = [CORNER, CORNER];
    const patrol = [orcStart, [CORNER, Math.floor(height / 2)]];

    // Trees in the fields, clear of the roads, the orc's patrol and where characters start
    const trees = [];
    const fields = width * height - townWidth * townHeight * PLOT * PLOT;
    const clear = (x, y) => {
        for (let dy = -CLEAR_OF_ROADS; dy <= CLEAR_OF_ROADS; dy++) {
            for (let dx = -CLEAR_OF_ROADS; dx <= CLEAR_OF_ROADS; dx++) {
                const [cx, cy] = [x + dx, y + dy];

                if (cx < 0 || cy < 0 || cx >= width || cy >= height || road[cy][cx] || blocked[cy][cx]) {
                    return false;
                }
            }
        }

        const nearPatrol = x <= patrol[0][0] + CLEAR_OF_PATROL && y <= patrol[1][1] + CLEAR_OF_PATROL;
        const nearSpawn = [player, orcStart].some(([sx, sy]) => Math.abs(sx - x) <= CLEAR_OF_SPAWNS && Math.abs(sy - y) <= CLEAR_OF_SPAWNS);

        return !nearPatrol && !nearSpawn && !inTown(x, y) && !inTown(x - 1, y - 1);
    };

    for (let placed = 0, tries = 0; placed < fields / TREE_SPACING && tries < fields; tries++) {
        const x = random.int(1, width - 2);
        const y = random.int(1, height - 2);

        if (clear(x, y) && clear(x - 1, y - 1)) {
            // The trunk stands where four squares meet, and fills them
            for (const [bx, by] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
                blocked[by][bx] = 1;
            }

            trees.push({ x, y, variant: random.int(0, TREE_VARIANTS - 1) });
            placed++;
        }
    }

    return {
        seed,
        width,
        height,
        plot: PLOT,
        origin,
        town,
        blocked,
        ground,
        trees,
        spawns: { player, orc: nearestFree(blocked, orcStart) },
        patrol: patrol.map((point) => nearestFree(blocked, point)),
    };
}

/** The free square nearest a square (searching outward ring by ring). */
export function nearestFree(blocked, [x, y]) {
    const height = blocked.length;
    const width = blocked[0].length;

    for (let ring = 0; ring < Math.max(width, height); ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
            for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
                    continue;
                }

                const [cx, cy] = [x + dx, y + dy];

                if (cx >= 0 && cy >= 0 && cx < width && cy < height && !blocked[cy][cx]) {
                    return [cx, cy];
                }
            }
        }
    }

    throw new Error("No free square in the world");
}
