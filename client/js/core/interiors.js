// The insides of buildings, each floor a map of its own on the same 1-metre squares as the world:
// for now, the tavern ("Wenches and Ale"): the taproom, with its tables and benches, the bar and
// the barrels behind it, a great hearth with a boar roasting on a spit, and stairs up; and the
// floor above, a brothel, with the madam's counter by the stairs and a hallway to four bedrooms.
//
// Each floor is drawn as a plan, a row of characters for each row of squares (north at the top,
// west on the left), and every run of the same character is one thing standing there: a table, a
// bed, a stretch of wall. The plan says which squares are blocked (and which block sight: only
// walls, hearths and stairs, not tables), where the doors and stairs are, and where the art and
// the minimap put things. Pure data, no DOM.

import { GROUND } from "./setpieces/pieces.js";

/**
 * What each character of a plan stands for: its kind, whether it blocks walking (`blocks`) and
 * seeing (`opaque`), and whether several of it side by side are one thing (`joins`: tables and
 * beds are; each bench square is a seat).
 */
export const PLAN_KEY = Object.freeze({
    ".": { kind: "floor" },
    D: { kind: "door" },
    "<": { kind: "stairs-foot" },
    ">": { kind: "stairs-top" },
    S: { kind: "stairs", blocks: true, opaque: true, joins: true },
    W: { kind: "wall", blocks: true, opaque: true, joins: true },
    H: { kind: "hearth", blocks: true, opaque: true, joins: true },
    T: { kind: "table", blocks: true, joins: true },
    b: { kind: "bench", blocks: true },
    C: { kind: "bar", blocks: true, joins: true },
    K: { kind: "barrels", blocks: true, joins: true },
    M: { kind: "counter", blocks: true, joins: true },
    B: { kind: "bed", blocks: true, joins: true },
    w: { kind: "washstand", blocks: true },
    c: { kind: "chest", blocks: true },
    L: { kind: "chaise", blocks: true, joins: true },
    o: { kind: "side-table", blocks: true },
});

// The taproom, 14 by 11 metres. Stairs up along the north wall, rising east from their foot in
// the north-west corner; the hearth on the west wall; four long tables with benches; the bar on
// the east, barrels on the wall behind it; the door in the middle of the south wall.
const TAPROOM = [
    "<SSSS........K",
    ".............K",
    "...bb.bb..C..K",
    "HH.TT.TT..C..K",
    "HH.bb.bb..C..K",
    "HH........C..K",
    "HH.bb.bb..C..K",
    "...TT.TT.....K",
    "...bb.bb......",
    "..............",
    "......DD......",
];

// Upstairs, the same size: the stairwell, railed, with the landing at its top (east) end; the
// madam's counter; a chaise longue and a side table; a hallway east to two bedrooms on each side,
// each with a canopied bed, a washstand and a chest.
const UPSTAIRS = [
    ".SSSS>WBBwWBBw",
    "......WBB.WBB.",
    "......W...W...",
    "......W..cW..c",
    "..MMM.WW.WWW.W",
    "..............",
    "......WW.WWW.W",
    "......W..cW..c",
    "....o.W...W...",
    "......WBB.WBB.",
    ".LL...WBBwWBBw",
];

/**
 * Where each floor is drawn in the 3D world (metres): far from the town and each other, so that
 * nothing of one (shadows, blood, sounds) is ever seen or heard on another.
 */
export const MAP_ORIGINS = Object.freeze({ town: [0, 0], taproom: [2000, 0], upstairs: [2000, 100] });

/** Which way a character faces (radians from south, towards east), by compass point. */
export const FACING = Object.freeze({ s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 });

/**
 * Read a plan into a map: { id, name, width, height, plan, blocked[y][x], opaque[y][x] (what
 * blocks sight), ground[y][x] (GROUND kinds, for footsteps and the minimap), pieces: [{ kind,
 * char, x, y, w, h, squares }] (everything but floor, each run of joined squares one piece),
 * marks: { char: [[x, y]...] } (the squares of each character), origin: [x, z] (MAP_ORIGINS) }.
 */
export function readPlan(id, name, rows, { ground = GROUND.courtyard } = {}) {
    const height = rows.length;
    const width = rows[0].length;
    const blocked = [];
    const opaque = [];
    const floor = [];
    const marks = {};

    rows.forEach((row, y) => {
        if (row.length !== width) {
            throw new Error(`Row ${y} of ${id}'s plan is ${row.length} squares, not ${width}`);
        }

        blocked.push(new Uint8Array(width));
        opaque.push(new Uint8Array(width));
        floor.push(new Uint8Array(width).fill(ground));

        [...row].forEach((char, x) => {
            const key = PLAN_KEY[char];

            if (!key) {
                throw new Error(`Unknown square "${char}" in ${id}'s plan`);
            }

            blocked[y][x] = key.blocks ? 1 : 0;
            opaque[y][x] = key.opaque ? 1 : 0;
            (marks[char] ??= []).push([x, y]);
        });
    });

    // Each run of joined squares of the same thing is one piece (a table, a bed, a wall)
    const pieces = [];
    const seen = rows.map(() => new Uint8Array(width));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const char = rows[y][x];
            const key = PLAN_KEY[char];

            if (key.kind === "floor" || seen[y][x]) {
                continue;
            }

            const squares = [];
            const queue = [[x, y]];

            seen[y][x] = 1;

            while (queue.length) {
                const [sx, sy] = queue.pop();

                squares.push([sx, sy]);

                if (!key.joins) {
                    continue;
                }

                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const [nx, ny] = [sx + dx, sy + dy];

                    if (nx >= 0 && ny >= 0 && nx < width && ny < height && !seen[ny][nx] && rows[ny][nx] === char) {
                        seen[ny][nx] = 1;
                        queue.push([nx, ny]);
                    }
                }
            }

            const xs = squares.map(([sx]) => sx);
            const ys = squares.map(([, sy]) => sy);
            const [x0, y0] = [Math.min(...xs), Math.min(...ys)];

            pieces.push({ kind: key.kind, char, x: x0, y: y0, w: Math.max(...xs) - x0 + 1, h: Math.max(...ys) - y0 + 1, squares });
        }
    }

    return { id, name, width, height, plan: rows, blocked, opaque, ground: floor, pieces, marks, origin: MAP_ORIGINS[id] };
}

/**
 * The tavern's floors: { taproom, upstairs } (readPlan's maps), and the links between them and
 * the town: the front door (its end on the taproom side; the town's end is where the tavern
 * stands, see world.js) and the stairs.
 */
export function tavernFloors() {
    const taproom = readPlan("taproom", "Wenches and Ale", TAPROOM, { ground: GROUND.cobbles });
    const upstairs = readPlan("upstairs", "Upstairs at Wenches and Ale", UPSTAIRS, { ground: GROUND.planks });

    // Inside the front door, looking into the room; at the foot of the stairs and at their top,
    // looking into the room
    const door = { map: "taproom", squares: taproom.marks.D, arrive: taproom.marks.D[0], facing: FACING.n };
    const foot = { map: "taproom", squares: taproom.marks["<"], arrive: taproom.marks["<"][0], facing: FACING.s };
    const top = { map: "upstairs", squares: upstairs.marks[">"], arrive: upstairs.marks[">"][0], facing: FACING.s };

    return { taproom, upstairs, door, stairs: { id: "tavern-stairs", kind: "stairs", ends: [foot, top] } };
}

/** Which link (and which of its ends) a character on `map` standing on `square` is at, or null. */
export function linkAt(links, map, [x, y]) {
    for (const link of links) {
        for (const end of link.ends) {
            if (end.map === map && end.squares.some(([sx, sy]) => sx === x && sy === y)) {
                return { link, end };
            }
        }
    }

    return null;
}

/**
 * The way from one map to another through the links (breadth first): the links to go through, in
 * order ([] already there; null no way).
 */
export function routeBetween(links, from, to) {
    const queue = [[from, []]];
    const visited = new Set([from]);

    while (queue.length) {
        const [map, route] = queue.shift();

        if (map === to) {
            return route;
        }

        for (const link of links) {
            const here = link.ends.find((end) => end.map === map);
            const there = link.ends.find((end) => end !== here);

            if (here && there && !visited.has(there.map)) {
                visited.add(there.map);
                queue.push([there.map, [...route, link]]);
            }
        }
    }

    return null;
}
