// Going inside: every building that can be gone into (setpieces/pieces.js ENTERED: taverns,
// smithies, temples and adventurers' guilds) in every settlement, its front door one of the
// world's links, its floors made the first time they're wanted (the player's walking up to the
// door, or through it) and kept, each at a place of its own far off in the 3D world, with its
// folk.
//
// A building's door is where the art puts it (ENTRANCES: kits/landmarks.js builds it there): so
// far in from the front of its lot, so far along it, so wide; the squares in front of it are
// cleared to walk up to it (openEntrances). Its floors are plans (interiors.js readPlan), laid out
// for its kind: a tavern's taproom (its tables set out one of several ways, its hearth, bar and
// barrels, and stairs if it has a floor above) and upstairs, as its name has it (tavern lore:
// rooms to let with an innkeeper at the counter; rooms with a courtesan or two; or a madam's
// house); a smithy's workshop; a temple's nave; a guild's hall. Its folk are worked out from its
// plan: a barkeep behind the bar and at the barrels, serving wenches between the bar and the
// tables, patrons on the benches, whoever keeps upstairs, and the courtesans in their rooms; the
// smith and the apprentice at their work; the priest, an acolyte and worshippers in the pews;
// the guild's receptionist behind her counter and adventurers at the quest board and the tables.
//
// The town's own tavern, Wenches and Ale, is made with the town (world.js) and keeps its ids
// (taproom, upstairs, tavern-door, tavern-stairs) and its folk; it's registered here as made.
// Pure data, no DOM.

import { FACING, readPlan, tavernFolk, UPSTAIRS_PLAN } from "./interiors.js";
import { GOD_IDS, GODS } from "./lore/gods.js";
import { namePeople } from "./names.js";
import { createRandom } from "./random.js";
import { ENTERED, GROUND, PLOT } from "./setpieces/pieces.js";
import { cos, hypot, sin } from "./exact.js";

/**
 * Where each kind of building's front door is, as the art builds it: how far in from the front of
 * its lot the door stands (metres), how far along the front from its middle (+ east as it would
 * face south), how wide and tall it is, and how high its sill (the plinth, or steps).
 */
export const ENTRANCES = Object.freeze({
    tavern: { depth: 1.8, offset: 0, width: 1.8, height: 2.3, floor: 0.3 },
    guild: { depth: 1.8, offset: 0, width: 2.2, height: 2.6, floor: 0.3 },
    church: { depth: 1.2, offset: 0, width: 1.6, height: 2.6, floor: 0.6 },
    blacksmith: { depth: 2.2, offset: -1.2, width: 1.3, height: 2.1, floor: 0.3 },
    hall: { depth: 1.8, offset: 0, width: 2, height: 2.5, floor: 0.3 },
    keep: { depth: 1.4, offset: 0, width: 2.4, height: 3.2, floor: 0.8 },
});

/** The kinds that can be gone into. */
export const ENTERABLE = Object.freeze(["tavern", "blacksmith", "church", "guild", "hall", "keep"]);

// The way to a door, cleared: at least this far either side of its middle, and from this far in
// behind it to this far out past the lot's front (metres)
const WAY_IN = Object.freeze({ across: 1.2, behind: 0.4, out: 1 });

/**
 * Where a building's front door is, and the way to it: { door: { x, z (metres, the middle of its
 * threshold), facing (as characters face: 0 south), width, height, floor }, front (the two squares
 * at the door), outside (the square to come out onto), clear (every square to clear to walk up to
 * it), facing, corner ([x, y]: its lot's north-west corner as it would stand facing south), size
 * ([width, depth] metres) }. Its piece is placed from `origin` (metres: [x, y], or a number for
 * both).
 */
export function entranceOf(piece, origin = 0) {
    const spec = ENTRANCES[piece.name];
    const [ox, oy] = Array.isArray(origin) ? origin : [origin, origin];
    const [width, depth] = [piece.w * PLOT, piece.h * PLOT];
    const { facing } = piece;
    const [cx, cy] = [ox + piece.x, oy + piece.y];
    const [c, s] = [cos(facing), sin(facing)];

    // A point in the lot's own frame (facing south, metres from its north-west corner) turned to
    // face the way it does, about its middle, in the world
    const turn = (u, v) => {
        const [du, dv] = [u - width / 2, v - depth / 2];

        return [cx + du * c + dv * s, cy - du * s + dv * c];
    };
    const squareAt = (u, v) => turn(u, v).map(Math.floor);
    const [u, v] = [width / 2 + spec.offset, depth - spec.depth];
    const [dx, dz] = turn(u, v);
    const front = [squareAt(u - 0.5, v + 0.3), squareAt(u + 0.5, v + 0.3)];
    const outside = squareAt(u, depth + 0.6);
    const across = Math.max(WAY_IN.across, spec.width / 2 + 0.3);
    const clear = [];
    const reach = hypot(width, depth) / 2 + 2;

    for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++) {
        for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
            const [px, py] = [x + 0.5 - cx, y + 0.5 - cy];
            const pu = width / 2 + px * c - py * s;
            const pv = depth / 2 + px * s + py * c;

            if (Math.abs(pu - u) <= across && pv >= v - WAY_IN.behind && pv <= depth + WAY_IN.out) {
                clear.push([x, y]);
            }
        }
    }

    return {
        door: { x: dx, z: dz, facing, width: spec.width, height: spec.height, floor: spec.floor },
        front,
        outside,
        clear: [...front, outside, ...clear],
        facing,
        corner: [cx - width / 2, cy - depth / 2],
        size: [width, depth],
    };
}

/**
 * Clear the way up to the door of every building of a layout's that can be gone into (its
 * squares not blocked, nor hiding what's behind them), in `blocked` and `opaque` ([y][x]: the
 * layout's own, or copies), its pieces placed from `origin`.
 */
export function openEntrances(pieces, blocked, opaque, origin = 0) {
    for (const piece of pieces) {
        if (piece.kind !== "landmark" || !ENTERED.includes(piece.name) || !ENTRANCES[piece.name]) {
            continue;
        }

        const [ox, oy] = Array.isArray(origin) ? origin : [origin, origin];

        for (const [x, y] of entranceOf(piece, origin).clear) {
            const [i, j] = [x - ox, y - oy];

            if (blocked[j]?.[i] !== undefined) {
                blocked[j][i] = 0;
                opaque[j][i] = 0;
            }
        }
    }
}

// --- Taverns ---

// A taproom, 18 by 15 metres as Wenches and Ale's: the hearth on the west wall, the bar along the
// east with the barrels behind it, the door in the middle of the south wall, and stairs along the
// north wall if there's a floor above; its tables set out one of these ways ([x, y, length]: each
// a table a metre deep with a bench along each side)
const TABLES = Object.freeze({
    four: [[4, 5, 2], [9, 5, 2], [4, 10, 2], [9, 10, 2]],
    long: [[4, 5, 7], [4, 10, 3]],
    six: [[4, 4, 2], [8, 4, 2], [4, 8, 2], [9, 8, 2], [4, 12, 2], [11, 12, 2]],
    hall: [[4, 5, 3], [9, 5, 3], [4, 9, 3], [9, 9, 3]],
    few: [[5, 5, 3], [4, 10, 2], [9, 10, 2]],
});

/** The ways a taproom's tables can be set out. */
export const LAYOUTS = Object.freeze(Object.keys(TABLES));

/** What a taproom's walls can be: plastered and limewashed, or planked, or bare stone. */
export const FINISHES = Object.freeze(["plaster", "plaster-white", "plaster-ochre", "planks", "stone-warm"]);

/** A taproom's plan (interiors.js's characters): its tables set out `layout`'s way, stairs up if `stairs`. */
export function taproomPlan(layout, stairs) {
    const rows = Array.from({ length: 15 }, () => [..."..................".slice(0, 18)]);
    const put = (x, y, char) => {
        rows[y][x] = char;
    };

    if (stairs) {
        for (const y of [0, 1]) {
            put(0, y, "<");

            for (let x = 1; x <= 5; x++) {
                put(x, y, "S");
            }
        }
    }

    for (let y = 6; y <= 9; y++) {
        put(0, y, "H");
        put(1, y, "H");
    }

    for (let y = 3; y <= 10; y++) {
        put(14, y, "C");
    }

    for (let y = 1; y <= 12; y++) {
        put(17, y, "K");
    }

    for (const [x0, y, length] of TABLES[layout]) {
        for (let x = x0; x < x0 + length; x++) {
            put(x, y - 1, "b");
            put(x, y, "T");
            put(x, y + 1, "b");
        }
    }

    put(8, 14, "D");
    put(9, 14, "D");

    return rows.map((row) => row.join(""));
}

// What's upstairs, by the tavern's upstairs (taverns.js UPSTAIRS): who keeps it, and how many of
// its rooms have a courtesan
const KEEPERS = Object.freeze({ bordello: { keeper: "madam", courtesans: 4 }, mixed: { keeper: "innkeeper", courtesans: [1, 2] }, inn: { keeper: "innkeeper", courtesans: 0 } });

/**
 * A tavern's floors: [{ suffix, style (the art's: taproom, upstairs), look (upstairs: a madam's
 * house, "bordello", or an "inn"), finish (the taproom's walls), name, rows, ground, sound,
 * layout }], the taproom first. From its own seed: the taproom's layout and walls, and upstairs
 * as its name has it.
 */
export function tavernRooms(building) {
    const random = createRandom(building.seed);
    const upstairs = building.tavern?.storeys > 1 && building.tavern?.upstairs;
    const layout = random.pick(LAYOUTS);
    const finish = random.pick(FINISHES);
    const floors = [{ suffix: "taproom", style: "taproom", name: building.name, rows: taproomPlan(layout, Boolean(upstairs)), ground: GROUND.cobbles, sound: "taproom", layout, finish }];

    if (upstairs) {
        floors.push({ suffix: "upstairs", style: "upstairs", look: upstairs === "bordello" ? "bordello" : "inn", name: `Upstairs at ${building.name}`, rows: UPSTAIRS_PLAN, ground: GROUND.planks, sound: "upstairs" });
    }

    return floors;
}

/**
 * A tavern's folk, worked out from its floors (readPlan's maps: the taproom, and upstairs if it
 * has one): [{ local (their part: barkeep, wench, drinker...), title, role, sex, map, square,
 * facing, routine }], as interiors.js tavernFolk's (without their looks: the game makes those from
 * their `seed`).
 */
export function tavernFolkOf(building, taproom, upstairs = null) {
    const random = createRandom(building.seed * 7 + 13);
    const { s, e, n, w } = FACING;
    const folk = [];
    const bar = taproom.pieces.find(({ kind }) => kind === "bar");
    const barrels = taproom.pieces.find(({ kind }) => kind === "barrels");
    const free = (x, y) => x >= 0 && y >= 0 && x < taproom.width && y < taproom.height && !taproom.blocked[y][x];
    const sex = () => (random.chance(0.5) ? "f" : "m");

    // The barkeep, behind the bar and at the barrels
    const rows = Array.from({ length: bar.h }, (_, k) => bar.y + k);
    const behind = rows.filter((_, k) => k % 3 === 1).map((y) => ({ square: [bar.x + 1, y], facing: w, group: "bar" }));
    const casks = [barrels.y + 2, barrels.y + Math.floor(barrels.h / 2), barrels.y + barrels.h - 3].map((y) => ({ square: [barrels.x - 1, y], facing: e, act: "pour", group: "barrels" }));

    folk.push({ local: "barkeep", title: "Barkeep", role: "barkeep", sex: "m", map: taproom.id, square: behind[0].square, facing: w, routine: { order: "alternate", wait: [2500, 6000], stops: [...behind, ...casks] } });

    // Serving wenches, between the bar and the tables' ends
    const atBar = [rows[2], rows.at(-3)].map((y) => ({ square: [bar.x - 1, y], facing: e, group: "bar" }));
    const atTables = taproom.pieces.filter(({ kind }) => kind === "table").flatMap((table) => [
        free(table.x - 1, table.y) ? { square: [table.x - 1, table.y], facing: e, act: "serve", group: "tables" } : null,
        free(table.x + table.w, table.y) ? { square: [table.x + table.w, table.y], facing: w, act: "serve", group: "tables" } : null,
    ]).filter(Boolean);
    const stops = [...atBar, ...atTables];
    const wenches = random.int(1, 2);

    for (let k = 0; k < wenches; k++) {
        const order = k === 0 ? stops : [...atTables, ...atBar];

        folk.push({ local: k === 0 ? "wench" : "wench2", title: "Serving wench", role: "barmaid", sex: "f", map: taproom.id, square: order[k === 0 ? 0 : 1].square, facing: s, routine: { order: "alternate", wait: [1500, 3500], stops: order } });
    }

    // Patrons on the benches, facing their tables (the first few with the parts the barkeep's
    // gossip names)
    const seats = random.shuffle([...(taproom.marks.b ?? [])]).slice(0, random.int(4, 6));
    const parts = [["drinker", "Drinker"], ["alewife", "Alewife"], ["farmer", "Farmer"], ["greybeard", "Greybeard"], ["tinker", "Tinker"], ["drover", "Drover"]];

    seats.forEach(([x, y], k) => {
        const facing = taproom.plan[y + 1]?.[x] === "T" ? s : n;
        const [local, title] = parts[k];
        const who = local === "alewife" ? "f" : local === "greybeard" || local === "farmer" ? "m" : sex();

        folk.push({ local, title, role: "patron", sex: who, map: taproom.id, square: [x, y], facing, routine: { seated: true } });
    });

    // Upstairs: whoever keeps it at the counter, and courtesans in their rooms (the same rooms as
    // Wenches and Ale's: interiors.js tavernFolk)
    if (upstairs) {
        const keep = KEEPERS[building.tavern.upstairs] ?? KEEPERS.inn;
        const theirs = tavernFolk().filter(({ map }) => map === "upstairs");
        const madam = theirs.find(({ id }) => id === "madam");
        const rooms = theirs.filter(({ role }) => role === "courtesan");
        const count = Array.isArray(keep.courtesans) ? random.int(...keep.courtesans) : keep.courtesans;

        folk.push({ ...madam, id: undefined, preset: undefined, local: keep.keeper, title: keep.keeper === "madam" ? "Madam" : "Innkeeper", role: keep.keeper, sex: keep.keeper === "madam" ? "f" : sex(), map: upstairs.id });

        for (const [k, room] of random.shuffle([...rooms]).slice(0, count).entries()) {
            folk.push({ ...room, id: undefined, preset: undefined, local: k === 0 ? "courtesan" : `courtesan${k + 1}`, map: upstairs.id });
        }
    }

    return folk;
}

// --- Smithies ---

// A smithy, 16 by 12 metres: the forge against the north wall, its bellows beside it, a heap of
// charcoal and a rack of tools; the anvil before the forge; the quenching trough to the west; a
// grindstone; the workbench along the west wall and a rack of finished work along the east; the
// door in the middle of the south wall
const SMITHY = [
    "RRRRR..FFFF..OOO",
    ".......FFFF..OOO",
    "......PFFFF.....",
    "................",
    ".QQ.............",
    ".QQ.....A.......",
    "................",
    "...........G....",
    "X...............",
    "X..............R",
    "X..............R",
    "X......DD......R",
];

/** A smithy's floors: its workshop. */
export function smithyRooms(building) {
    return [{ suffix: "forge", style: "smithy", name: building.name, rows: SMITHY, ground: GROUND.soil, sound: "smithy" }];
}

/**
 * A smithy's folk, worked out from its plan: the smith going between the forge (heating the
 * work), the anvil (hammering it) and the trough (quenching it); and the apprentice, at the
 * bellows and the grindstone.
 */
export function smithyFolkOf(building, forge) {
    const random = createRandom(building.seed * 7 + 29);
    const { n, w } = FACING;
    const at = (kind) => forge.pieces.find((piece) => piece.kind === kind);
    const [fire, anvil, trough, bellows, stone] = ["forge", "anvil", "trough", "bellows", "grindstone"].map(at);
    const heat = { square: [fire.x + 1, fire.y + fire.h], facing: n, act: "heat", wait: [2500, 4000] };
    const hammer = { square: [anvil.x, anvil.y + 1], facing: n, act: "forge", wait: [4500, 7000] };
    const quench = { square: [trough.x + trough.w, trough.y], facing: w, act: "quench", wait: [2000, 3500] };
    const pump = { square: [bellows.x, bellows.y + 1], facing: n, act: "pump" };
    const crank = { square: [stone.x, stone.y + 1], facing: n, act: "crank" };

    return [
        { local: "smith", title: "Blacksmith", role: "smith", sex: random.chance(0.85) ? "m" : "f", map: forge.id, square: hammer.square, facing: n, routine: { order: "cycle", wait: [3000, 5000], stops: [heat, hammer, quench, hammer] } },
        { local: "apprentice", title: "Apprentice", role: "apprentice", sex: random.chance(0.7) ? "m" : "f", map: forge.id, square: pump.square, facing: n, routine: { order: "cycle", wait: [4000, 7000], stops: [pump, crank] } },
    ];
}

// --- Temples ---

// A temple of the Six, 16 by 18 metres: its patron's altar on a dais at the north end, their
// statue behind it; the other five's shrines along the walls (three west, two east) and a stand of
// votive candles; pews either side of the aisle, facing the altar; a basin of water either side of
// the door, in the middle of the south wall
const TEMPLE = [
    "................",
    "......ZZZZ......",
    "......aaaa......",
    "................",
    "s..............s",
    "................",
    "..pppp....pppp..",
    "................",
    "s.pppp....pppp.s",
    "................",
    "..pppp....pppp..",
    "................",
    "s.pppp....pppp.v",
    "................",
    "..pppp....pppp..",
    "................",
    "f..............f",
    ".......DD.......",
];

/** A temple's floors: its nave, under its patron. */
export function templeRooms(building) {
    return [{ suffix: "nave", style: "temple", name: building.name, rows: TEMPLE, ground: GROUND.cobbles, sound: "temple", patron: building.patron }];
}

/**
 * Which of the Six each of a temple's shrines is to, in the order they stand (north to south,
 * west then east): the five that aren't its patron, in the order they woke.
 */
export function shrinesOf(patron) {
    return GOD_IDS.filter((id) => id !== patron);
}

/**
 * A temple's folk, worked out from its plan: the priest, going between the altar (blessing the
 * pews) and the shrines (lighting their candles); an acolyte at the votive candles and the
 * basins; and two to four worshippers in the pews, facing the altar.
 */
export function templeFolkOf(building, nave) {
    const random = createRandom(building.seed * 7 + 41);
    const { n, s, e, w } = FACING;
    const altar = nave.pieces.find(({ kind }) => kind === "altar");
    const shrines = nave.pieces.filter(({ kind }) => kind === "shrine");
    const votive = nave.pieces.find(({ kind }) => kind === "votive");
    const basins = nave.pieces.filter(({ kind }) => kind === "basin");
    const before = (piece) => (piece.x === 0 ? { square: [1, piece.y], facing: w } : { square: [nave.width - 2, piece.y], facing: e });
    const bless = { square: [altar.x + Math.floor(altar.w / 2), altar.y + altar.h], facing: s, act: "bless", group: "altar", wait: [4000, 7000] };
    const folk = [
        {
            local: "priest",
            title: "Priest",
            role: "priest",
            sex: random.chance(0.5) ? "f" : "m",
            map: nave.id,
            square: bless.square,
            facing: s,
            routine: { order: "alternate", wait: [3000, 5000], stops: [bless, ...shrines.map((shrine) => ({ ...before(shrine), act: "light", group: "shrines" }))] },
        },
        {
            local: "acolyte",
            title: "Acolyte",
            role: "acolyte",
            sex: random.chance(0.5) ? "f" : "m",
            map: nave.id,
            square: before(votive).square,
            facing: e,
            routine: { order: "cycle", wait: [4000, 8000], stops: [{ ...before(votive), act: "light" }, ...basins.map((basin) => ({ ...before(basin), act: "light" }))] },
        },
    ];

    // Worshippers in the pews, each on a seat of their own, facing the altar
    const seats = random.shuffle([...(nave.marks.p ?? [])]).slice(0, random.int(2, 4));

    seats.forEach(([x, y], k) => {
        folk.push({ local: `worshipper${k + 1}`, title: "Worshipper", role: "worshipper", sex: random.chance(0.5) ? "f" : "m", map: nave.id, square: [x, y], facing: n, routine: { seated: true } });
    });

    return folk;
}

// --- Adventurers' guilds ---

// A guild's hall, 20 by 16 metres: the counter across the north, the receptionist behind it and
// shelves of ledgers and scrolls on the wall behind her; the quest board along the west wall;
// tables with benches for the adventurers; a hearth on the east wall; barrels either side of the
// door, in the middle of the south wall
const GUILD = [
    "eeeeeeee............",
    "....................",
    "..MMMMMMMM..........",
    "....................",
    "q...................",
    "q.....bbb.....bbb...",
    "q.....TTT.....TTT..H",
    "q.....bbb.....bbb..H",
    "q..................H",
    "......bbb.....bbb...",
    "......TTT.....TTT...",
    "......bbb.....bbb...",
    "....................",
    "....................",
    "KK................KK",
    ".........DD.........",
];

/** A guild's floors: its hall. */
export function guildRooms(building) {
    return [{ suffix: "hall", style: "guild", name: building.name, rows: GUILD, ground: GROUND.planks, sound: "guild" }];
}

// What an adventurer can be (their look: characters/folk.js)
const CALLINGS = Object.freeze(["warrior", "ranger", "mage", "rogue", "cleric"]);

/**
 * A guild's folk, worked out from its plan: the receptionist behind the counter (stamping
 * notices, and at the shelves); adventurers reading the quest board, and one at the counter;
 * and more at the tables, drinking.
 */
export function guildFolkOf(building, hall) {
    const random = createRandom(building.seed * 7 + 53);
    const { n, s, w } = FACING;
    const counter = hall.pieces.find(({ kind }) => kind === "counter");
    const shelves = hall.pieces.find(({ kind }) => kind === "shelves");
    const board = hall.pieces.find(({ kind }) => kind === "board");
    const behind = [counter.x + 2, counter.x + counter.w - 3].map((x) => ({ square: [x, counter.y - 1], facing: s, act: "stamp", group: "counter" }));
    const filing = { square: [shelves.x + 2, shelves.y + 1], facing: n, act: "file", group: "shelves" };
    const reading = [1, 3].map((dy) => ({ square: [board.x + 1, board.y + dy], facing: w, act: "read", group: "board", wait: [5000, 9000] }));
    const asking = { square: [counter.x + 3, counter.y + 1], facing: n, group: "counter", wait: [6000, 10000] };
    const callings = random.shuffle([...CALLINGS]);
    const sex = () => (random.chance(0.5) ? "f" : "m");
    const folk = [
        { local: "receptionist", title: "Guild receptionist", role: "receptionist", sex: "f", map: hall.id, square: behind[0].square, facing: s, routine: { order: "alternate", wait: [3000, 6000], stops: [...behind, filing] } },
        { local: "adventurer", title: "Adventurer", role: "adventurer", look: callings[0], sex: sex(), map: hall.id, square: reading[0].square, facing: w, routine: { order: "alternate", wait: [4000, 8000], stops: [reading[0], asking] } },
        { local: "adventurer2", title: "Adventurer", role: "adventurer", look: callings[1], sex: sex(), map: hall.id, square: reading[1].square, facing: w, routine: { order: "cycle", wait: [6000, 12000], stops: [reading[1]] } },
    ];

    // More at the tables, drinking to their last job (patrons, as in a tavern, talking as
    // adventurers do)
    const seats = random.shuffle([...(hall.marks.b ?? [])]).slice(0, random.int(2, 4));

    seats.forEach(([x, y], k) => {
        const facing = hall.plan[y + 1]?.[x] === "T" ? s : n;

        folk.push({ local: `adventurer${k + 3}`, title: "Adventurer", role: "patron", talk: "adventurer", look: callings[(k + 2) % callings.length], sex: sex(), map: hall.id, square: [x, y], facing, routine: { seated: true, act: "toast", every: [9000, 18000] } });
    });

    return folk;
}

// --- Town halls ---

// A town hall's chamber, 18 by 14 metres: shelves of the town's rolls along the north wall, the
// reeve's long desk before them; the council table in the middle with benches either side; the
// notices on the west wall; a hearth on the east; the strongboxes by the walls; benches for
// petitioners along the south wall either side of the door
const HALL = [
    "eeeee.......eeeee.",
    "..................",
    "...MMMMMMMMMM.....",
    ".................H",
    "q................H",
    "q...bbbbbbbb.....H",
    "q...TTTTTTTT......",
    "q...bbbbbbbb......",
    "..................",
    "c................c",
    "..................",
    "bbbb..........bbbb",
    "..................",
    "........DD........",
];

/** A town hall's floors: its chamber. */
export function hallRooms(building) {
    return [{ suffix: "chamber", style: "hall", name: building.name, rows: HALL, ground: GROUND.planks, sound: "hall" }];
}

/**
 * A town hall's folk, worked out from its plan: the reeve behind the desk (stamping, and at the
 * rolls); the clerk at the rolls and the notices; and petitioners on the benches, waiting.
 */
export function hallFolkOf(building, chamber) {
    const random = createRandom(building.seed * 11 + 17);
    const { n, s, w } = FACING;
    const desk = chamber.pieces.find(({ kind }) => kind === "counter");
    const shelves = chamber.pieces.filter(({ kind }) => kind === "shelves");
    const board = chamber.pieces.find(({ kind }) => kind === "board");
    const behind = [desk.x + 2, desk.x + desk.w - 3].map((x) => ({ square: [x, desk.y - 1], facing: s, act: "stamp", group: "desk" }));
    const rolls = shelves.map((each) => ({ square: [each.x + 2, each.y + 1], facing: n, act: "file", group: "rolls" }));
    const notices = [1, 2].map((dy) => ({ square: [board.x + 1, board.y + dy], facing: w, act: "read", group: "notices", wait: [4000, 8000] }));
    const sex = () => (random.chance(0.5) ? "f" : "m");
    const folk = [
        { local: "reeve", title: "Reeve", role: "reeve", sex: sex(), map: chamber.id, square: behind[0].square, facing: s, routine: { order: "alternate", wait: [4000, 7000], stops: [...behind, rolls[0]] } },
        { local: "clerk", title: "Clerk", role: "clerk", sex: sex(), map: chamber.id, square: rolls[1].square, facing: n, routine: { order: "cycle", wait: [4000, 8000], stops: [rolls[1], notices[0], rolls[0], notices[1]] } },
    ];

    // Petitioners on the benches by the door, waiting their turn
    const southern = (chamber.marks.b ?? []).filter(([, y]) => y > desk.y + 6);
    const seats = random.shuffle([...southern]).slice(0, random.int(1, 3));

    seats.forEach(([x, y], k) => {
        folk.push({ local: `petitioner${k + 1}`, title: "Petitioner", role: "petitioner", sex: sex(), map: chamber.id, square: [x, y], facing: n, routine: { seated: true } });
    });

    return folk;
}

// --- Keeps ---

// A keep's great hall, 22 by 16 metres: two thrones against the north wall, the carpet laid from
// them to the door in the middle of the south wall; the steward's desk to the west of the thrones
// and the armoury's racks in the north-west corner, shelves in the north-east and strongboxes
// by them; the council's two tables with their benches either side of the carpet; a hearth in
// each side wall; pillars down the hall
const KEEP = [
    "RRR.......YY.......eee",
    "..........rr..........",
    "..MMM.....rr.....c..c.",
    "..........rr..........",
    "...I......rr......I...",
    "H.........rr.........H",
    "H..bbbbb..rr..bbbbb..H",
    "H..TTTTT..rr..TTTTT..H",
    "...bbbbb..rr..bbbbb...",
    "...I......rr......I...",
    "..........rr..........",
    "..........rr..........",
    "...I......rr......I...",
    "..........rr..........",
    "..........rr..........",
    "..........DD..........",
];

/** A keep's floors: its great hall. */
export function keepRooms(building) {
    return [{ suffix: "great-hall", style: "keep", name: building.name, rows: KEEP, ground: GROUND.cobbles, sound: "keep" }];
}

/**
 * A keep's folk, worked out from its plan: the ruler on their throne (named for their people's
 * ruler by the host, as the war has them: core/host.js); the steward between the desk, the
 * shelves and the throne; councillors at the tables; and sentries either side of the thrones and
 * of the door.
 */
export function keepFolkOf(building, hall) {
    const random = createRandom(building.seed * 13 + 29);
    const { n, s, e } = FACING;
    const [throne] = hall.marks.Y;
    const desk = hall.pieces.find(({ kind }) => kind === "counter");
    const shelves = hall.pieces.find(({ kind }) => kind === "shelves");
    const [door] = hall.marks.D;
    const sex = () => (random.chance(0.5) ? "f" : "m");
    const stops = [
        { square: [desk.x + 1, desk.y - 1], facing: s, act: "stamp", group: "desk" },
        { square: [shelves.x + 1, shelves.y + 1], facing: n, act: "file", group: "shelves" },
        { square: [throne[0] - 1, throne[1] + 1], facing: e, group: "throne", wait: [5000, 9000] },
    ];
    const folk = [
        { local: "ruler", title: "Ruler", role: "ruler", sex: sex(), map: hall.id, square: [...throne], facing: s, routine: { seated: true } },
        { local: "steward", title: "Steward", role: "steward", sex: sex(), map: hall.id, square: stops[0].square, facing: s, routine: { order: "alternate", wait: [4000, 8000], stops } },
    ];

    // Councillors at the tables, a seat each
    const seats = random.shuffle([...(hall.marks.b ?? [])]).slice(0, random.int(2, 3));

    seats.forEach(([x, y], k) => {
        const facing = hall.plan[y + 1]?.[x] === "T" ? s : n;

        folk.push({ local: `councillor${k + 1}`, title: "Councillor", role: "councillor", sex: sex(), map: hall.id, square: [x, y], facing, routine: { seated: true } });
    });

    // Sentries: either side of the thrones, and inside the door
    const posts = [
        [[throne[0] - 2, throne[1] + 1], s],
        [[throne[0] + 3, throne[1] + 1], s],
        [[door[0] - 2, door[1] - 1], n],
        [[door[0] + 3, door[1] - 1], n],
    ];

    posts.forEach(([square, facing], k) => {
        folk.push({ local: `sentry${k + 1}`, title: "Sentry", role: "sentry", sex: random.chance(0.25) ? "f" : "m", map: hall.id, square, facing, routine: { order: "cycle", wait: [8000, 14000], stops: [{ square, facing }] } });
    });

    return folk;
}

// --- The places worth finding gone into (core/places.js; sites.js entranceAt) ---

// An outlaws' cave, 16 by 16 metres: a passage in from its mouth (the door, south) to a chamber,
// their bedrolls and their fire in it, their chief by the chest at the back
const CAVE = [
    "################",
    "#####......#####",
    "###..........###",
    "##....l..h....##",
    "##............##",
    "#..g........g..#",
    "#..............#",
    "#..uu....x.....#",
    "#..............#",
    "##..g.......u.##",
    "###..........###",
    "#####......#####",
    "######....######",
    "#######..#######",
    "#######..#######",
    "#######DD#######",
];

// The dragon's lair, 22 by 18: a great cavern in from its mouth, bones about it, its hoard heaped
// at the back
const LAIR = [
    "######################",
    "#######........#######",
    "#####............#####",
    "####......hh......####",
    "###.....j.l..j.....###",
    "##..................##",
    "##..j...........j...##",
    "#....................#",
    "#.........j..........#",
    "#....................#",
    "##..g............g..##",
    "###................###",
    "####..j.......j...####",
    "######..........######",
    "########......########",
    "#########....#########",
    "#########....#########",
    "##########DD##########",
];

// A broken watchtower's two floors, 9 by 9: below, stairs up along the north wall (as a tavern's,
// rising east from their foot) and its door in the south wall; above, open to the sky where its
// top's fallen in, rubble about, its holders' chief by their chest
const TOWER = [
    "<SSSSS...",
    "<SSSSS...",
    ".........",
    "..g......",
    ".........",
    "......g..",
    ".........",
    ".........",
    "....DD...",
];
const TOWER_TOP = [
    ".SSSSS>..",
    ".SSSSS>..",
    ".........",
    ".........",
    "..l....#.",
    ".........",
    ".h.......",
    "....#....",
    ".........",
];

/** A cave's floor: (insides.js `rooms`) */
export function caveRooms(building) {
    return [{ suffix: "cave", style: "cave", name: building.name, rows: CAVE, ground: GROUND.soil, sound: "cave" }];
}

/** The dragon's lair's floor. */
export function lairRooms(building) {
    return [{ suffix: "lair", style: "lair", name: building.name, rows: LAIR, ground: GROUND.soil, sound: "lair" }];
}

/** A broken watchtower's two floors. */
export function towerRooms(building) {
    return [
        { suffix: "ground", style: "tower", name: building.name, rows: TOWER, ground: GROUND.courtyard, sound: "tower" },
        { suffix: "top", style: "tower-top", name: `The top of ${building.name}`, rows: TOWER_TOP, ground: GROUND.courtyard, sound: "tower" },
    ];
}

// Each kind's floors (the first is the one its front door opens into) and its folk
const KINDS = Object.freeze({
    tavern: { first: "taproom", rooms: tavernRooms, folk: (building, [taproom, upstairs]) => tavernFolkOf(building, taproom, upstairs) },
    blacksmith: { first: "forge", rooms: smithyRooms, folk: (building, [forge]) => smithyFolkOf(building, forge) },
    church: { first: "nave", rooms: templeRooms, folk: (building, [nave]) => templeFolkOf(building, nave) },
    guild: { first: "hall", rooms: guildRooms, folk: (building, [hall]) => guildFolkOf(building, hall) },
    hall: { first: "chamber", rooms: hallRooms, folk: (building, [chamber]) => hallFolkOf(building, chamber) },
    keep: { first: "great-hall", rooms: keepRooms, folk: (building, [hall]) => keepFolkOf(building, hall) },
    // (The places worth finding: no folk of their own, those who hold them the wild's: host.js)
    cave: { first: "cave", rooms: caveRooms, folk: () => [] },
    lair: { first: "lair", rooms: lairRooms, folk: () => [] },
    tower: { first: "ground", rooms: towerRooms, folk: () => [] },
});

/** The kinds of the places worth finding that can be gone into (a site's entrance's `inside`). */
export const SITE_INSIDES = Object.freeze(["cave", "lair", "tower"]);

// --- The buildings ---

// What a building's called that has no name of its own
const NAMES = Object.freeze({ blacksmith: "the smithy", guild: "the Adventurers' Guild", hall: "the town hall", keep: "the keep", cave: "the cave", lair: "the dragon's lair", tower: "the watchtower" });

// Where the buildings' floors are drawn in the 3D world: past the world's edge (and Wenches and
// Ale's), a hundred metres apart, each building's floors in a column
const ORIGINS = Object.freeze({ x: 10200, step: 100, across: 60 });

/**
 * Every building that can be gone into, by key (`${place}:${piece id}`): its front door among the
 * world's links from the moment it's known (`add`), its floors and folk made the first time
 * they're wanted (`make`, `ensure`). Changes the world's `maps` and `links` in place, so the battle
 * and whatever else holds them sees what's added.
 */
export class Interiors {
    /** @param {object} world - The world (overworld.js buildWorld's): its maps and links. */
    constructor(world) {
        this.world = world;

        /** Each building: { key, kind, name, piece, place, people, seed, entrance, made, maps (ids), folk }. */
        this.buildings = new Map();

        // Which building each map is in, and how many have been given a place to be drawn
        this.byMap = new Map();
        this.placed = 0;

        /**
         * The buildings made (their keys), in the order they were: where each is drawn follows
         * from it, so a world made again (a saved one, or a joining player's: core/host.js) makes
         * them in the same order.
         */
        this.order = [];

        /** Bumped whenever a building is added or made (for the doors to catch up). */
        this.version = 0;
    }

    /**
     * Add a building that's been made already, with its maps and folk (Wenches and Ale, made with
     * the town), and where its middle is (`at`: [x, y] metres, in the world).
     */
    adopt({ key, kind, name, maps, folk, piece = null, tavern = null, at = null, people = "human" }) {
        const building = { key, kind, name, piece, tavern, place: null, people, seed: 0, at, entrance: null, made: true, maps, folk };

        this.buildings.set(key, building);

        for (const id of maps) {
            this.byMap.set(id, building);
        }

        this.version++;

        return building;
    }

    /**
     * Add a settlement's building (a layout piece of a kind that can be gone into), placed from
     * `origin` (metres: its layout's corner in the world), in the place `place` (an id): its
     * front door joins the world's links; its folk of the people `people` (a RACES id: whose
     * the place is). Returns it (null if it can't be gone into).
     */
    add(piece, { origin = 0, place = "home", name = null, people = "human" } = {}) {
        if (!ENTERABLE.includes(piece.name)) {
            return null;
        }

        const key = `${place}:${piece.id}`;

        if (this.buildings.has(key)) {
            return this.buildings.get(key);
        }

        const entrance = entranceOf(piece, origin);
        const inside = `${key}/${KINDS[piece.name].first}`;
        const [ox, oy] = Array.isArray(origin) ? origin : [origin, origin];
        const building = {
            key,
            kind: piece.name,
            name: name ?? piece.tavern?.name ?? (piece.patron ? `the Temple of ${GODS[piece.patron].name}` : null) ?? NAMES[piece.name] ?? piece.name,
            piece,
            tavern: piece.tavern ?? null,
            patron: piece.patron ?? null,
            place,
            people: people ?? "human",
            seed: piece.seed ?? 1,
            // (Its middle, in the world: metres)
            at: [ox + piece.x, oy + piece.y],
            entrance,
            made: false,
            maps: [],
            folk: [],
        };
        const back = entrance.facing > 0 ? entrance.facing - Math.PI : entrance.facing + Math.PI;

        // (Its inside end is where it'll be once its floors are made)
        building.door = {
            id: `${key}/door`,
            kind: "door",
            building: key,
            ends: [
                { map: "town", squares: entrance.front, arrive: entrance.outside, facing: back, door: entrance.door },
                { map: inside, squares: [], arrive: null, facing: FACING.s, pending: true },
            ],
        };
        this.buildings.set(key, building);
        this.byMap.set(inside, building);
        this.world.links.push(building.door);
        this.version++;

        return building;
    }

    /**
     * Add a place worth finding that can be gone into (sites.js: a site set down with an
     * `entrance`: a cave, the dragon's lair, a broken watchtower), by the key `site:${its id}`:
     * its way in among the world's links, its floors made the first time they're wanted, as a
     * building's. Returns it (null if it has no way in).
     */
    addSite({ site, entrance }) {
        if (!entrance || !KINDS[entrance.inside]) {
            return null;
        }

        const key = `site:${site.id}`;

        if (this.buildings.has(key)) {
            return this.buildings.get(key);
        }

        const inside = `${key}/${KINDS[entrance.inside].first}`;
        const [ox, oy] = entrance.outside;
        const building = {
            key,
            kind: entrance.inside,
            name: site.name ?? NAMES[entrance.inside],
            piece: { id: site.id, name: entrance.inside },
            tavern: null,
            patron: null,
            place: "site",
            site: site.id,
            people: "human",
            seed: site.seed ?? 1,
            // (Where it stands in the world, for its way in: the ground before it)
            at: [ox + 0.5, oy + 0.5],
            entrance,
            made: false,
            maps: [],
            folk: [],
        };
        const back = entrance.facing > 0 ? entrance.facing - Math.PI : entrance.facing + Math.PI;

        building.door = {
            id: `${key}/door`,
            kind: "door",
            building: key,
            ends: [
                { map: "town", squares: entrance.front, arrive: entrance.outside, facing: back, door: entrance.door },
                { map: inside, squares: [], arrive: null, facing: FACING.s, pending: true },
            ],
        };
        this.buildings.set(key, building);
        this.byMap.set(inside, building);
        this.world.links.push(building.door);
        this.version++;

        return building;
    }

    /** The building a map's in (or null for the world outside). */
    of(mapId) {
        return this.byMap.get(mapId) ?? null;
    }

    /** Make a map's building's floors and folk, if they're not made yet; whether the map's there now. */
    ensure(mapId) {
        if (this.world.maps[mapId]) {
            return true;
        }

        const building = this.of(mapId);

        if (!building || building.made) {
            return Boolean(this.world.maps[mapId]);
        }

        this.make(building.key);

        return Boolean(this.world.maps[mapId]);
    }

    /** Make a building's floors and folk (once): its maps among the world's, its door's inside end, its stairs. */
    make(key) {
        const building = this.buildings.get(key);

        if (!building || building.made) {
            return building;
        }

        const kind = KINDS[building.kind];
        const floors = kind.rooms(building);
        const column = this.placed++;
        const origin = [ORIGINS.x + (column % ORIGINS.across) * ORIGINS.step, Math.floor(column / ORIGINS.across) * ORIGINS.step * 2];
        const maps = floors.map((floor, k) => {
            const map = readPlan(`${key}/${floor.suffix}`, floor.name, floor.rows, { ground: floor.ground });

            Object.assign(map, { origin: [origin[0], origin[1] + k * ORIGINS.step], style: floor.style, look: floor.look ?? null, finish: floor.finish ?? null, patron: floor.patron ?? null, sound: floor.sound, building: key, layout: floor.layout ?? null, people: building.people ?? "human" });

            return map;
        });

        for (const map of maps) {
            this.world.maps[map.id] = map;
            this.byMap.set(map.id, building);
            building.maps.push(map.id);
        }

        // Its door's inside end: a couple of steps in, turned back to face it (as Wenches and Ale's)
        const [ground, upstairs] = maps;
        const [doorX, doorY] = ground.marks.D[0];

        Object.assign(building.door.ends[1], { squares: ground.marks.D, arrive: [doorX, doorY - 2], facing: FACING.s, pending: false });

        if (upstairs) {
            building.stairs = {
                id: `${key}/stairs`,
                kind: "stairs",
                building: key,
                ends: [
                    { map: ground.id, squares: ground.marks["<"], arrive: [1, 3], facing: FACING.n },
                    { map: upstairs.id, squares: upstairs.marks[">"], arrive: [6, 3], facing: FACING.n },
                ],
            };
            this.world.links.push(building.stairs);
        }

        // Its folk, named from its seed, each with an id of their own in the world
        building.folk = namePeople(kind.folk(building, maps), building.seed, building.people).map((one) => ({ ...one, id: `${key}/${one.local}`, people: building.people, seed: building.seed * 31 + one.local.length * 7 + one.square[0] * 131 + one.square[1] }));

        // (A smithy's known by its smith: "Hayward's Forge")
        const smith = building.kind === "blacksmith" ? building.folk.find(({ local }) => local === "smith") : null;

        if (smith) {
            building.name = `${smith.name.split(" ")[1]}'s Forge`;

            for (const map of maps) {
                map.name = building.name;
            }
        }
        building.made = true;
        this.order.push(key);
        this.version++;

        return building;
    }
}
