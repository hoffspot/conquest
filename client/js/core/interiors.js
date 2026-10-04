// The insides of buildings, each floor a map of its own on the same 1-metre squares as the world
// (and bigger inside than the building looks from outside, to move about in easily): for now,
// the tavern ("Wenches and Ale"): the taproom, with its tables and benches, the bar and
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
    // A smithy's: the forge (a hearth of stone waist high, a hood over it), its bellows, the
    // anvil, the quenching trough, the grindstone, racks of tools and finished work, the
    // workbench, and a heap of charcoal
    F: { kind: "forge", blocks: true, opaque: true, joins: true },
    P: { kind: "bellows", blocks: true },
    A: { kind: "anvil", blocks: true },
    Q: { kind: "trough", blocks: true, joins: true },
    G: { kind: "grindstone", blocks: true },
    R: { kind: "rack", blocks: true, joins: true },
    X: { kind: "workbench", blocks: true, joins: true },
    O: { kind: "coal", blocks: true, joins: true },
    // A temple's: the patron's statue and altar, the other gods' shrines along the walls, a stand
    // of votive candles, pews (each square a seat) and basins of water by the door
    Z: { kind: "statue", blocks: true, opaque: true, joins: true },
    a: { kind: "altar", blocks: true, joins: true },
    s: { kind: "shrine", blocks: true },
    v: { kind: "votive", blocks: true },
    p: { kind: "pew", blocks: true },
    f: { kind: "basin", blocks: true },
    // An adventurers' guild's: the quest board on the wall, and shelves of ledgers and scrolls
    // behind the counter
    q: { kind: "board", blocks: true, joins: true },
    e: { kind: "shelves", blocks: true, joins: true },
    // A keep's: the thrones (each square a seat), the pillars holding up the roof, and a carpet
    // laid from the door to the thrones
    Y: { kind: "throne", blocks: true },
    I: { kind: "pillar", blocks: true },
    r: { kind: "carpet", joins: true },
    // The places worth finding gone into (a cave, the dragon's lair, a broken watchtower): their
    // rock; where the chest's put (its hoard), where those who hold the place stand (their
    // leader, and their guards), outlaws' bedrolls and their fire, and bones
    "#": { kind: "rock", blocks: true, opaque: true, joins: true },
    h: { kind: "hoard" },
    l: { kind: "leader" },
    g: { kind: "guard" },
    u: { kind: "bedroll", blocks: true },
    x: { kind: "campfire", blocks: true },
    j: { kind: "bones" },
    // A crypt's (under an old hall's ruins): its tombs (each run of squares one, lidded), and
    // candles burning on the floor in a stand
    t: { kind: "tomb", blocks: true, joins: true },
    k: { kind: "candles", blocks: true },
    // A ruined keep's (its great hall open to the sky): heaps of what fell from its floors and roof
    m: { kind: "rubble", blocks: true },
    // A castle keep's undercroft (its armoury): a stand wearing a suit of its armour
    n: { kind: "stand", blocks: true },
});

// The taproom, 18 by 15 metres (roomier than the tavern looks from outside, to walk about in
// easily: two metres and more between the tables, round the hearth and behind the bar). Stairs
// two metres wide up along the north wall, rising east from their foot in the north-west corner;
// the hearth on the west wall; four long tables with benches; the bar on the east, the barrels on
// the wall behind it; the door in the middle of the south wall.
const TAPROOM = [
    "<SSSSS............",
    "<SSSSS...........K",
    ".................K",
    "..............C..K",
    "....bb...bb...C..K",
    "....TT...TT...C..K",
    "HH..bb...bb...C..K",
    "HH............C..K",
    "HH............C..K",
    "HH..bb...bb...C..K",
    "....TT...TT...C..K",
    "....bb...bb......K",
    ".................K",
    "..................",
    "........DD........",
];

// Upstairs, the same size: the stairwell, railed, with the landing at its top (east) end; a
// lounge with the madam's counter, a chaise longue and a side table; a hallway three metres wide
// east to two bedrooms on each side, through doorways two metres wide, each room four metres by
// five with a canopied bed, a washstand and a chest.
const UPSTAIRS = [
    ".SSSSS>.W.BBwW.BBw",
    ".SSSSS>.W.BB.W.BB.",
    "........W....W....",
    "........Wc...Wc...",
    "........W....W....",
    "..MMM...WW..WWW..W",
    "..................",
    "..................",
    "..................",
    "........WW..WWW..W",
    "........W....W....",
    "....o...Wc...Wc...",
    "........W....W....",
    "........W.BB.W.BB.",
    ".LL.....W.BBwW.BBw",
];

/** Upstairs at a tavern: its lounge and counter, and four bedrooms off a hallway (insides.js uses it too). */
export const UPSTAIRS_PLAN = UPSTAIRS;

/**
 * Where each floor is drawn in the 3D world (metres): far from the town and each other, so that
 * nothing of one (shadows, blood, sounds) is ever seen or heard on another.
 */
export const MAP_ORIGINS = Object.freeze({ town: [0, 0], taproom: [10000, 0], upstairs: [10000, 100] });

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

    // Coming through, a couple of steps clear of the door or stairs, turned back to face them (so
    // they're in view to tap, and a tap round the player isn't on them): inside the front door;
    // before the foot of the stairs, and before their top
    const [doorX, doorY] = taproom.marks.D[0];
    const door = { map: "taproom", squares: taproom.marks.D, arrive: [doorX, doorY - 2], facing: FACING.s };
    const foot = { map: "taproom", squares: taproom.marks["<"], arrive: [1, 3], facing: FACING.n };
    const top = { map: "upstairs", squares: upstairs.marks[">"], arrive: [6, 3], facing: FACING.n };

    return { taproom, upstairs, door, stairs: { id: "tavern-stairs", kind: "stairs", ends: [foot, top] } };
}

/**
 * The tavern's folk: [{ id, title (what they are), role (roles.js ROLES: how they pass the time),
 * sex ("f" or "m"), preset (characters/presets.js FOLK), map, square, facing, routine }], each to
 * add to the battle as one of the neutral folk (battle.js #routine). The barkeep goes between the
 * bar and the barrels behind it, drawing ale; two serving wenches go between the bar and the
 * tables, putting tankards down; patrons sit on the benches (raising their tankards, drinking,
 * laughing: their rests); upstairs, the madam keeps her counter, and a courtesan waits in each
 * bedroom, beckoning the player in when they come into sight at its door. (Their names are the
 * world's: world.js.)
 */
export function tavernFolk() {
    const { s, e, n, w } = FACING;
    const seated = (id, title, sex, preset, square, facing) => ({ id, title, role: "patron", sex, preset, map: "taproom", square, facing, routine: { seated: true } });
    const serving = [
        { square: [13, 5], facing: e, group: "bar" },
        { square: [13, 8], facing: e, group: "bar" },
        { square: [6, 5], facing: w, act: "serve", group: "tables" },
        { square: [11, 5], facing: w, act: "serve", group: "tables" },
        { square: [3, 5], facing: e, act: "serve", group: "tables" },
        { square: [8, 10], facing: e, act: "serve", group: "tables" },
        { square: [3, 10], facing: e, act: "serve", group: "tables" },
        { square: [11, 10], facing: w, act: "serve", group: "tables" },
    ];

    return [
        {
            id: "barkeep",
            title: "Barkeep",
            role: "barkeep",
            sex: "m",
            preset: "barkeep",
            map: "taproom",
            square: [15, 6],
            facing: w,
            routine: {
                order: "alternate",
                wait: [2500, 6000],
                stops: [
                    { square: [15, 4], facing: w, group: "bar" },
                    { square: [15, 8], facing: w, group: "bar" },
                    { square: [16, 3], facing: e, act: "pour", group: "barrels" },
                    { square: [16, 6], facing: e, act: "pour", group: "barrels" },
                    { square: [16, 9], facing: e, act: "pour", group: "barrels" },
                ],
            },
        },
        { id: "wench", title: "Serving wench", role: "barmaid", sex: "f", preset: "wench", map: "taproom", square: [13, 6], facing: e, routine: { order: "alternate", wait: [1500, 3500], stops: serving } },
        { id: "wench2", title: "Serving wench", role: "barmaid", sex: "f", preset: "wench2", map: "taproom", square: [7, 7], facing: s, routine: { order: "alternate", wait: [1500, 3500], stops: [...serving.slice(2), ...serving.slice(0, 2)] } },
        seated("drinker", "Drinker", "m", "drinker", [4, 4], s),
        seated("alewife", "Alewife", "f", "alewife", [5, 6], n),
        seated("farmer", "Farmer", "m", "farmer", [9, 9], s),
        seated("greybeard", "Greybeard", "m", "greybeard", [10, 11], n),
        {
            id: "madam",
            title: "Madam",
            role: "madam",
            sex: "f",
            preset: "madam",
            map: "upstairs",
            square: [3, 4],
            facing: s,
            routine: {
                wait: [4000, 9000],
                stops: [
                    { square: [3, 4], facing: s },
                    { square: [2, 4], facing: s },
                    { square: [4, 4], facing: s },
                    { square: [3, 4], facing: e },
                ],
            },
        },
        // A courtesan in each bedroom: just inside its doorway, looking out into the hallway, or
        // at the foot of the bed (listed after everyone else, so everyone else keeps the name
        // they had before)
        ...[
            ["courtesan", [10, 4], [11, 2], s],
            ["courtesan2", [15, 4], [16, 2], s],
            ["courtesan3", [10, 10], [11, 12], n],
            ["courtesan4", [15, 10], [16, 12], n],
        ].map(([id, door, bed, facing]) => ({
            id,
            title: "Courtesan",
            role: "courtesan",
            sex: "f",
            preset: id,
            map: "upstairs",
            square: door,
            facing,
            routine: { wait: [9000, 18000], stops: [{ square: door, facing }, { square: bed, facing }] },
        })),
    ];
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

// Each list of links' links by the maps they join (in the list's order), made again when links
// have been added to it (they're only ever added: a building's doors as its settlement's laid out),
// so that a way between maps is found by looking at the links of each map on the way, not all
const indexes = new WeakMap();

function linksByMap(links) {
    let index = indexes.get(links);

    if (index?.count !== links.length) {
        const byMap = new Map();

        for (const link of links) {
            for (const map of new Set(link.ends.map((end) => end.map))) {
                if (!byMap.has(map)) {
                    byMap.set(map, []);
                }

                byMap.get(map).push(link);
            }
        }

        index = { count: links.length, byMap };
        indexes.set(links, index);
    }

    return index.byMap;
}

/**
 * The way from one map to another through the links (breadth first): the links to go through, in
 * order ([] already there; null no way).
 */
export function routeBetween(links, from, to) {
    const byMap = linksByMap(links);
    const queue = [[from, []]];
    const visited = new Set([from]);

    while (queue.length) {
        const [map, route] = queue.shift();

        if (map === to) {
            return route;
        }

        for (const link of byMap.get(map) ?? []) {
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
