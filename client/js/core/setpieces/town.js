// Lays out a settlement the way old towns grew: after Watabou's Medieval Fantasy City Generator,
// but written afresh, at the game's scale (1-metre squares; people 1.7 metres tall, houses 7 to
// 12 metres across):
//
// - A market place near the middle, an irregular polygon of cobbles.
// - Main streets from it to where the roads leave (`exits`: the ways the world's roads go),
//   bending as they go, cobbled in the middle of town and earth further out.
// - Lanes curving round between the main streets, a ring or two of them, and alleys off those.
// - Houses along both sides of every street and round the market, each turned to face its street
//   (so they stand at every angle, as the streets bend), set a little back from it, with a yard
//   behind: a vegetable bed, a tree, barrels and a cart. Fewer and further apart towards the edge.
// - The tavern, church and smithy facing the market; a well and stalls on it; a windmill out at
//   the edge, by a main street.
// - Trees dotted about the open ground left.
//
// Everything is measured in metres, x east and y south, over the whole layout (the fields round
// the town too), and every piece is a rectangle turned to face some way. The squares under each
// are blocked (and hide what's behind them, but for props: world.js SEE_OVER), and each square's
// ground is road, cobbles, soil or grass. All the arithmetic is exact (exact.js), so the same seed
// gives the same town in every browser.

import { hashOf } from "../noise.js";
import { createRandom, noise } from "../random.js";
import { atan2, cos, length, PI, sin, sqrt, TAU } from "../exact.js";
import { patronOf } from "../lore/gods.js";
import { nameTavern } from "../lore/taverns.js";
import { churchOf, ENTERED, GROUND, homeTree, HOUSE_STYLES, HOUSE_VARIANTS, houseKey, LANDMARKS, landmarkKey, OUTBUILDINGS, PEOPLE_PLACES, PLOT, PROPS, propKey, SPECIALISTS, TRADES, treeKey, TREE_VARIANTS } from "./pieces.js";

/**
 * The kinds of settlement, and how each is laid out: how far its houses reach from the middle
 * (metres), the fields left round it, the market place's size, how wide its main streets and lanes
 * are, how far out its rings of lanes run (shares of the radius), how many alleys, its houses'
 * sizes (across and deep, metres) and the gaps between them, how many of the lots along its
 * streets are built on, and its landmarks round the market; and, for those the war's fought over
 * (core/war/war.js HOLDINGS), where its garrison's quartered (`barracks`: a village's guardhouse,
 * or a barracks).
 */
export const SETTLEMENT_KINDS = Object.freeze({
    farmstead: { radius: 13, fields: 12, market: [5, 6], main: 3, lane: 2.6, rings: [], alleys: 0, width: [7, 9], depth: [7, 9.5], gap: [3, 7], built: 0.95, landmarks: [], windmill: 0, stalls: 0, storeys: [[1, 3], [2, 1]], trades: 0, farm: true, small: true },
    hamlet: { radius: 17, fields: 12, market: [5, 6.5], main: 3.2, lane: 2.6, rings: [], alleys: 0, width: [6, 8.5], depth: [6.5, 8.5], gap: [3, 7], built: 0.75, landmarks: ["tavern"], windmill: 0.2, stalls: 0, storeys: [[1, 7], [2, 1]], trades: 0, small: true },
    village: { radius: 30, fields: 16, market: [8, 10], main: 3.8, lane: 2.8, rings: [], alleys: 1, width: [6.5, 9], depth: [6.5, 8.5], gap: [2, 6], built: 0.75, landmarks: ["tavern", "church", "blacksmith", "guild"], windmill: 0.6, stalls: 1, storeys: [[1, 6], [2, 2]], trades: 0.12, barracks: "guardhouse" },
    town: { radius: 48, seat: "hall", fields: 18, market: [10, 13], main: 4.4, lane: 3, rings: [0.62], alleys: 3, width: [6, 10], depth: [8, 12], gap: [0, 1.2], built: 0.95, landmarks: ["tavern", "church", "blacksmith", "guild"], extra: [["tavern", 0.5]], windmill: 0.8, stalls: 3, storeys: [[1, 4], [2, 5], [3, 1]], trades: 0.3, barracks: "barracks" },
    city: { radius: 84, seat: "hall", fields: 18, market: [14, 17], main: 5, lane: 3.2, rings: [0.4, 0.72, 0.97], alleys: 8, width: [6, 11], depth: [9, 13], gap: [0, 0.8], built: 0.97, landmarks: ["tavern", "church", "blacksmith", "guild", "market", "tavern"], extra: [["tavern", 0.6], ["blacksmith", 0.5]], windmill: 0.9, stalls: 4, storeys: [[1, 2], [2, 6], [3, 3]], trades: 0.4, barracks: "barracks" },
    capital: { radius: 112, seat: "keep", fields: 20, market: [17, 21], main: 5.5, lane: 3.3, rings: [0.3, 0.55, 0.78, 0.97], alleys: 12, width: [6, 11], depth: [9, 13], gap: [0, 0.6], built: 0.98, landmarks: ["tavern", "church", "blacksmith", "guild", "market", "tavern", "tavern", "blacksmith"], extra: [["tavern", 0.7]], windmill: 0.95, stalls: 6, storeys: [[1, 1], [2, 5], [3, 4]], trades: 0.45, barracks: "barracks" },
});

/**
 * How each people lays its settlements out, where it differs from the humans' (the kinds' own
 * sizes stay): how far its main streets bend (`bend`: radians either way), how its ways out are
 * chosen (`ways`: "cross", four at right angles, as the orcs' ring forts; "web", a spoke every so
 * often, `spokes` of them, the dark elves' orb web), its rings of lanes (`rings`: shares of the
 * radius, always laid), its lots (`lots`: across and deep, metres; `far` for the lanes, the cat
 * folk's compounds), the gaps between them, how often a tree is tried on open ground (`trees`:
 * square metres), whether its houses stand over a band of water (`water`: from and to, shares of
 * the radius: the lizard folk's lagoon), whether it has a windmill, how much bigger its market
 * place is, from what size of settlement (its radius, metres) it's walled (`wall`), and whether
 * its market and main streets are cobbled (`paved`: or trodden earth, as the roads are).
 */
export const PEOPLE_TOWNS = Object.freeze({
    human: {},
    cat: { lots: { width: [8, 12], depth: [9, 12] }, far: { width: [16, 19], depth: [16, 19] }, gap: [1.5, 3], windmill: false, wall: 48, near: 0.45, paved: false },
    orc: { ways: "cross", bend: 0.06, rings: [0.72], lots: { width: [14, 20], depth: [8, 9.5] }, gap: [1.5, 3.5], windmill: false, wall: 30, market: 1.25, paved: false },
    lizard: { bend: 0.08, lots: { width: [8, 11], depth: [8, 10] }, gap: [2, 4], water: [0.46, 0.84], windmill: false, wall: 84, paved: false },
    elf: { bend: 0.9, lots: { width: [11, 14], depth: [11, 14] }, gap: [2.5, 5], trees: 45, windmill: false, wall: 48 },
    darkElf: { ways: "web", spokes: 7, bend: 0.1, rings: [0.38, 0.68, 0.96], lots: { width: [8, 11], depth: [9, 11] }, gap: [0, 0.6], windmill: false, wall: 30, market: 1.35 },
});

/**
 * Whether a kind of settlement (SETTLEMENT_KINDS) keeps the specialists' shops (pieces.js
 * SPECIALISTS): one with a church, an adventurers' guild, a blacksmith and a seat (a town hall,
 * or greater: a town, a city or a capital).
 */
export const keepsShops = (spec) => Boolean(spec?.seat) && ["church", "guild", "blacksmith"].every((name) => spec.landmarks.includes(name));

// How far out a settlement's barracks stands (shares of its radius: from, to), where it can
const BARRACKS_OUT = Object.freeze([0.35, 0.8]);

// How far the streets step as they're laid (metres), and how far a main street bends either way
// from its heading (radians)
const STEP = 6;
const BEND = 0.45;

// How many ways out a town over a lagoon has at least (main streets, each crossing it on a walk),
// and how far a street over it turns (radians) before a square of deck fills the bend's outside
const WATER_WAYS = 3;
const WALK_TURN = 0.26;

/** How many layers a lagoon's plank walks are laid at (walks' `layer`: 0 the topmost, its last the squares across their bends). */
export const WALK_LAYERS = 7;

// How much of the middle is cobbled (a share of the radius)
const COBBLED = 0.55;

// Buildings keep this far from streets, and from each other (metres, at least: the squares under
// them are those whose middles are inside, and houses may stand wall to wall); their squares are
// those this far inside their edges
const CLEAR = 0.4;
const NEIGHBOUR = 0.1;
const INSET = 0.3;

// How much further back from its street a house may stand, where the street bends (metres)
const SET_BACK = 2;

// Yards behind houses: how deep (metres), and how likely a vegetable bed, a tree and something
// piled by the back wall are in one
const YARD = [2.5, 5];
const YARD_CHANCE = 0.6;
const YARD_BED = 0.4;
const YARD_TREE = 0.45;
const YARD_PROP = 0.35;
const YARD_PROPS = ["barrels", "crates", "sacks", "cart"];

/**
 * A yard's fences (metres), which no one walks through: looked along a step at a time, how far in
 * from its edge to look for something standing there, and how far out for another yard against
 * it; how many yards are left open (no fences at all); how wide a gateway is, how long a run of
 * fence must be to have one, and how far along its side from its middle the way through is kept
 * clear (its squares there left open: at least two, so the navigation meshes keep a way through);
 * and how far in from a fenced side the squares it stands on are.
 */
export const YARD_FENCE = Object.freeze({ step: 0.5, inside: 0.2, apart: 0.6, open: 0.12, gate: 1.6, gated: 2.6, clearing: 1, band: 1 });

// How deep a yard's bed must be (metres), once cut back clear of what's stood in it, to be dug
const YARD_BED_LEAST = 0.9;

/**
 * Where a washing line's strung across a yard (metres): its posts this far in from the yard's
 * sides, this far in from its back; and how wide and deep a yard must be to have one.
 */
export const YARD_LINE = Object.freeze({ side: 0.35, back: 0.55, least: [3, 1.6] });

// Trees on the open ground in town: one tried every this many square metres
const TREE_EVERY = 110;

// Back buildings (outhouses, workshops, barns, cottages behind the street), filling the blocks
// behind the houses along the streets: one tried every this many square metres, their sizes
// (across and deep, metres), and how far they keep from the buildings round them (the narrow
// ways between them) and from the streets
const BACK_EVERY = 8;
const BACK_SIZE = Object.freeze([[4.5, 7.5], [4.5, 7]]);
const BACK_APART = 0.8;
const BACK_FROM_STREETS = 2;

// What's on each square, while laying out
const USE = Object.freeze({ free: 0, street: 1, building: 2, yard: 3, thing: 4 });

const ATTEMPTS = 20;

/**
 * A settlement of a kind (SETTLEMENT_KINDS) from a seed, its main streets leaving the ways given
 * (`exits`: angles in radians, 0 east and π/2 south; or, if none are given, three or four ways
 * round), laid out as `people` lays out its settlements (PEOPLE_TOWNS; its pieces then carry
 * `people`, and its houses their `type`). Returns { kind, seed, people, width, height (metres:
 * the town and the fields round it), centre ([x, y]), radius, market ({ corners, centre }),
 * streets ([{ points, width, main }]),
 * exits ([x, y]: where the main streets reach the edge), pieces ([{ key, kind, name, style,
 * variant, x, y (its middle, metres), w, h (its size across and deep, in plots, as the art kits
 * build it), facing (the way its front faces: radians, 0 south, π/2 east, as characters face) }]),
 * yards (behind the houses: [{ kind: "yard", x, y, w, h, facing (as a piece's), people (another
 * people's), fence ([its left side, its back, its right side]: each the runs of it fenced,
 * [[from, to]] metres along it, from its back or its left, its gateway left out), gate ({ side
 * (0, 1, 2: as fence's), at (its middle, metres along that side) }, or null), squares ([[x, y]]:
 * those its fences stand on, blocked), bed ([u0, v0, u1, v1]: its bed, metres across from its left
 * side and in from its back, or null), line (whether a washing line could be strung across its
 * back: YARD_LINE) }]),
 * ground, blocked, opaque, standing (rows of squares: GROUND kinds, 1 where no one can go, 1 where
 * nothing behind can be seen, 1 where a building stands: blocked squares that aren't are a prop's,
 * a tree's, a fence's or the lagoon's), water (rows of squares, 1 for water, or null for none),
 * walks (the plank walks over it: [{ a, b ([x, y]: its ends), half (half its width), layer (which
 * is drawn over which where they overlap: WALK_LAYERS, the last a square of deck across a bend,
 * filling its outside) }]) }.
 */
export function layoutTown({ seed = 1, kind = "town", exits = null, people = "human", master = null } = {}) {
    const spec = SETTLEMENT_KINDS[kind];

    if (!spec) {
        throw new Error(`No such kind of settlement: ${kind}`);
    }

    const random = createRandom(seed);
    const look = PEOPLE_TOWNS[people] ?? PEOPLE_TOWNS.human;

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const town = designTown(spec, exits, createRandom(random.seed()), seed + attempt * 7919, look, people, master);

        if (town) {
            return { kind, seed, people, ...town };
        }
    }

    throw new Error(`Could not lay out a ${kind} (seed ${seed})`);
}

// --- Geometry (metres) ---

// A rectangle turned to face some way: its middle, its size across (w) and deep (d) in metres,
// and its axes: across (x, to its right as it faces) and forward (z, the way it faces)
function frame(x, y, w, d, facing) {
    const [s, c] = [sin(facing), cos(facing)];

    return { x, y, w, d, facing, ax: [c, -s], az: [s, c] };
}

/** A piece's corners ([x, y] metres, in the layout), shrunk or grown by `grow` metres. */
export function footprint(piece, grow = 0) {
    const { x, y, w, d, ax, az } = frame(piece.x, piece.y, piece.w * PLOT, piece.h * PLOT, piece.facing);
    const [hw, hd] = [w / 2 + grow, d / 2 + grow];

    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [x + u * ax[0] + v * az[0], y + u * ax[1] + v * az[1]]);
}

// Each square whose middle is in a rectangle (grown by `grow` metres), as visit(i, j); stops, and
// returns false, as soon as a visit does
function eachSquare({ x, y, w, d, ax, az }, grow, visit) {
    const [hw, hd] = [w / 2 + grow, d / 2 + grow];
    const reach = hw + hd;

    for (let j = Math.floor(y - reach); j <= Math.ceil(y + reach); j++) {
        for (let i = Math.floor(x - reach); i <= Math.ceil(x + reach); i++) {
            const [px, py] = [i + 0.5 - x, j + 0.5 - y];
            const u = px * ax[0] + py * ax[1];
            const v = px * az[0] + py * az[1];

            if (u >= -hw && u <= hw && v >= -hd && v <= hd && visit(i, j) === false) {
                return false;
            }
        }
    }

    return true;
}

// How far a point is from a segment, squared
function fromSegment2(px, py, ax, ay, bx, by) {
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const [ex, ey] = [px - ax - dx * t, py - ay - dy * t];

    return ex * ex + ey * ey;
}

// Is a point inside a polygon?
function within(corners, px, py) {
    let inside = false;

    for (let k = 0, last = corners.length - 1; k < corners.length; last = k++) {
        const [[ax, ay], [bx, by]] = [corners[k], corners[last]];

        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
            inside = !inside;
        }
    }

    return inside;
}

// A line's length, and the point `along` metres along it with the way it's going there:
// { at: [x, y], heading (radians, 0 east, π/2 south) }, or null past its end
function lengthOf(points) {
    let total = 0;

    for (let k = 1; k < points.length; k++) {
        total += length(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    }

    return total;
}

function pointAlong(points, along) {
    let left = along;

    for (let k = 1; k < points.length; k++) {
        const [[ax, ay], [bx, by]] = [points[k - 1], points[k]];
        const piece = length(bx - ax, by - ay);

        if (left <= piece && piece > 0) {
            const t = left / piece;

            return { at: [ax + (bx - ax) * t, ay + (by - ay) * t], heading: atan2(by - ay, bx - ax) };
        }

        left -= piece;
    }

    return null;
}

// The way a building faces (radians, as characters face) to face along a vector
const facingOf = (vx, vy) => atan2(vx, vy);

// --- Laying it out ---

function designTown(spec, exits, random, seed, look = PEOPLE_TOWNS.human, people = "human", master = null) {
    const other = people !== "human";
    const size = 2 * Math.round(spec.radius + spec.fields);
    const [width, height] = [size, size];
    const centre = [width / 2 + random.range(-3, 3), height / 2 + random.range(-3, 3)];
    const radius = spec.radius;
    const use = new Uint8Array(width * height);
    const ground = Array.from({ length: height }, () => new Uint8Array(width));
    const inside = (i, j) => i >= 0 && j >= 0 && i < width && j < height;
    const pieces = [];
    // (The yards behind the houses as they're laid: each { rect, bed }; and which yard each square
    // is in, one more than its index, 0 for none)
    const laidYards = [];
    const owners = new Uint16Array(width * height);

    // The market place: a polygon of five to seven corners round the middle, each a little
    // nearer or further
    const sides = random.int(5, 7);
    const turn = random.next() * TAU;
    const reach = random.range(...spec.market) * (look.market ?? 1);
    const market = Array.from({ length: sides }, (_, k) => {
        const angle = turn + (TAU * (k + random.range(-0.2, 0.2))) / sides;
        const r = reach * random.range(0.8, 1.15);

        return [centre[0] + cos(angle) * r, centre[1] + sin(angle) * r];
    });

    // The ways out: those asked for (those closer together than 50 degrees made one), or three or
    // four round
    // (Over a lagoon, at least WATER_WAYS of them, so it's crossed on plank walks that many ways
    // and the lanes ring it: more where the roads in are fewer, in the widest gaps between them)
    const asked = look.ways === "cross" ? crossWays(exits, random) : look.ways === "web" ? webWays(exits, random, Math.min(look.spokes, 4 + Math.floor(spec.radius / 20))) : wayOut(exits, random);
    const ways = look.water ? atLeast(asked, WATER_WAYS) : asked;

    // Main streets from the middle to the edge, each bending as it goes
    const streets = ways.map((angle) => ({ points: mainStreet(centre, angle, width, height, random, seed, look.bend ?? BEND), width: spec.main, main: true }));

    // Rings of lanes between neighbouring main streets, and alleys off them
    if (streets.length >= 2) {
        const order = ways.map((angle, k) => ({ angle, k })).sort((a, b) => a.angle - b.angle);

        for (const share of look.rings ? (spec.small ? [] : look.rings.filter((r) => r * spec.radius > reach * 1.15 + 14)) : spec.rings) {
            for (let n = 0; n < order.length; n++) {
                if (random.chance(look.rings ? 1 : 0.8)) {
                    const lane = ring(streets[order[n].k].points, streets[order[(n + 1) % order.length].k].points, centre, radius * share, random, seed);

                    if (lane) {
                        streets.push({ points: lane, width: spec.lane, main: false });
                    }
                }
            }
        }
    }

    const lanes = streets.filter(({ main }) => !main);

    for (let n = 0; n < spec.alleys && lanes.length; n++) {
        const alley = alleyOff(random.pick(lanes).points, centre, random);

        if (alley) {
            streets.push({ points: alley, width: spec.lane * 0.9, main: false });
        }
    }

    // The streets' squares, and the market's: cobbled, or (the cat folk, the orcs and the lizard
    // folk) trodden earth, as the roads are
    const paving = look.paved === false ? GROUND.road : GROUND.cobbles;

    for (const { points, width: across, main } of streets) {
        const half2 = (across / 2) * (across / 2);

        for (let k = 1; k < points.length; k++) {
            const [[ax, ay], [bx, by]] = [points[k - 1], points[k]];

            for (let j = Math.floor(Math.min(ay, by) - across); j <= Math.ceil(Math.max(ay, by) + across); j++) {
                for (let i = Math.floor(Math.min(ax, bx) - across); i <= Math.ceil(Math.max(ax, bx) + across); i++) {
                    if (inside(i, j) && fromSegment2(i + 0.5, j + 0.5, ax, ay, bx, by) <= half2) {
                        const [dx, dy] = [i + 0.5 - centre[0], j + 0.5 - centre[1]];
                        const cobbled = main && !spec.small && dx * dx + dy * dy < radius * COBBLED * (radius * COBBLED);

                        use[j * width + i] = USE.street;
                        ground[j][i] = cobbled || ground[j][i] === paving ? paving : GROUND.road;
                    }
                }
            }
        }
    }

    for (let j = Math.floor(centre[1] - reach * 1.3); j <= Math.ceil(centre[1] + reach * 1.3); j++) {
        for (let i = Math.floor(centre[0] - reach * 1.3); i <= Math.ceil(centre[0] + reach * 1.3); i++) {
            if (inside(i, j) && within(market, i + 0.5, j + 0.5)) {
                // (A hamlet's middle is a green, a farmstead's its yard)
                use[j * width + i] = USE.street;
                ground[j][i] = spec.farm ? GROUND.courtyard : spec.small ? GROUND.grass : paving;
            }
        }
    }

    // The lizard folk's lagoon: a band of water round the middle, ragged, over a bed of mud (as
    // the world's lakes lie), the streets crossing it on plank walks
    const water = look.water ? Array.from({ length: height }, () => new Uint8Array(width)) : null;
    const walks = [];

    if (water) {
        const [from, to] = look.water;

        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const [dx, dy] = [i + 0.5 - centre[0], j + 0.5 - centre[1]];
                const r = length(dx, dy) / radius;
                const wobble = (noise(i, j, seed + 31, 9, 2) - 0.5) * 0.18;

                if (r > from + wobble && r < to + wobble) {
                    water[j][i] = 1;
                }
            }
        }

        // (Only where it's two squares across at least, every way: a square of it on its own, or a
        // strip a square wide, would lie as high as the banks round it, its bed dug nowhere:
        // lagoons.js)
        const wide = (i, j) => water[j]?.[i] && water[j]?.[i + 1] && water[j + 1]?.[i] && water[j + 1]?.[i + 1];
        const kept = water.map((row, j) => row.map((wet, i) => (wet && (wide(i - 1, j - 1) || wide(i, j - 1) || wide(i - 1, j) || wide(i, j)) ? 1 : 0)));

        for (let j = 0; j < height; j++) {
            water[j].set(kept[j]);

            for (let i = 0; i < width; i++) {
                if (water[j][i]) {
                    ground[j][i] = use[j * width + i] === USE.street ? GROUND.planks : GROUND.soil;
                }
            }
        }

        // (The walks: each street's straight runs over the water, a metre onto the bank at each
        // end, as wide as the street; and where a street turns over the water by more than
        // WALK_TURN, a square of deck across the bend, along the way between, so its outside's
        // filled. Each laid at a `layer` of its own where they overlap: a main street's over a
        // lane's over an alley's, every other run of a street's over the next, and every one over
        // the squares across its bends)
        for (const { points, width: across, main } of streets) {
            const rank = main ? 0 : across < spec.lane ? 2 : 1;

            for (let k = 1; k < points.length - 1; k++) {
                const [[px, py], [x, y], [nx, ny]] = [points[k - 1], points[k], points[k + 1]];
                const [into, out] = [length(x - px, y - py), length(nx - x, ny - y)];
                const [inx, iny, outx, outy] = [(x - px) / into, (y - py) / into, (nx - x) / out, (ny - y) / out];
                const [bx, by] = [inx + outx, iny + outy];
                const half = across / 2;

                if (water[Math.floor(y)]?.[Math.floor(x)] === 1 && inx * outx + iny * outy < cos(WALK_TURN) && length(bx, by) > 1e-6) {
                    const [ux, uy] = [bx / length(bx, by), by / length(bx, by)];

                    walks.push({ a: [x - ux * half, y - uy * half], b: [x + ux * half, y + uy * half], half, layer: WALK_LAYERS - 1 });
                }
            }

            for (let k = 1; k < points.length; k++) {
                const [a, b] = [points[k - 1], points[k]];
                const steps = Math.max(1, Math.ceil(length(b[0] - a[0], b[1] - a[1])));
                const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
                let run = null;

                for (let s = 0; s <= steps; s++) {
                    const [x, y] = at(s / steps);
                    const wet = water[Math.floor(y)]?.[Math.floor(x)] === 1;

                    if (wet) {
                        run = [run?.[0] ?? s / steps, s / steps];
                    }

                    if (run && (!wet || s === steps)) {
                        const extra = 1 / steps;

                        walks.push({ a: at(Math.max(0, run[0] - extra)), b: at(Math.min(1, run[1] + extra)), half: across / 2, layer: rank * 2 + (k % 2) });
                        run = null;
                    }
                }
            }
        }
    }

    // Can a rectangle go here: every square under it (grown by `grow`) on the layout, and none of
    // them one of `not`?
    const fits = (rect, grow, not) => eachSquare(rect, grow, (i, j) => inside(i, j) && !not.includes(use[j * width + i]));
    // (Is a rectangle clear of the lagoon: none of the squares under it water? A back building or
    // a yard is never over it, where no walk comes)
    const dry = (rect) => !water || eachSquare(rect, 0, (i, j) => !water[j]?.[i]);
    const mark = (rect, grow, what) => eachSquare(rect, grow, (i, j) => {
        use[j * width + i] = what;
    });
    const building = (rect) => fits(rect, NEIGHBOUR, [USE.building, USE.thing]) && fits(rect, CLEAR, [USE.street]) && fits(rect, 0, [USE.yard]);
    // (What's gone into, or a people's own place, opens onto dry land or a walk: the squares before
    // the middle of its front, where its door is, never the lagoon's but under a walk)
    const opens = (rect) =>
        !water ||
        [0.6, 1.5].every((out) =>
            [-0.8, 0, 0.8].every((across) => {
                const [i, j] = [rect.x + rect.az[0] * (rect.d / 2 + out) + rect.ax[0] * across, rect.y + rect.az[1] * (rect.d / 2 + out) + rect.ax[1] * across].map(Math.floor);

                return !water[j]?.[i] || onWalk(walks, i + 0.5, j + 0.5);
            }),
        );
    const landmark = (rect) => building(rect) && opens(rect);
    const fitsOn = (rect, grow, on) => eachSquare(rect, grow, (i, j) => inside(i, j) && on.includes(use[j * width + i]));

    // What's placed, as a piece: its size in plots, as the art kits build it
    const place = (rect, fields) => {
        const piece = { ...fields, ...(other && fields.kind !== "tree" ? { people } : {}), x: rect.x, y: rect.y, w: rect.w / PLOT, h: rect.d / PLOT, facing: rect.facing };

        pieces.push(piece);

        return piece;
    };

    // Each edge of the market: its middle, the way along it, how long it is, and the way into the
    // market from it
    const edges = market.map((a, k) => {
        const b = market[(k + 1) % market.length];
        const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
        const long = length(ex, ey);
        const along = [ex / long, ey / long];
        const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let inward = [-along[1], along[0]];

        if ((centre[0] - middle[0]) * inward[0] + (centre[1] - middle[1]) * inward[1] < 0) {
            inward = [-inward[0], -inward[1]];
        }

        // (Whether a main street leaves the market across it)
        const crossed = streets.some(({ points, main }) => main && points.some((p, k) => k > 0 && crosses(points[k - 1], p, a, b)));

        return { middle, along, long, inward, crossed };
    });

    // The landmarks, facing the market (or, failing that, a main street near it)
    const frontOn = (edge, w, d, shift) => {
        const back = CLEAR + 0.3 + d / 2;

        return frame(edge.middle[0] - edge.inward[0] * back + edge.along[0] * shift, edge.middle[1] - edge.inward[1] * back + edge.along[1] * shift, w, d, facingOf(...edge.inward));
    };

    // Each landmark's own (from a random of its own: the layout the same with or without them): a
    // tavern's name, sign and storeys, and what's upstairs; a church's patron, and its grade (as big
    // as the place) and build
    const kept = createRandom(seed * 17 + 5);
    const counts = {};
    const taken = new Set();
    const identity = (name) => {
        counts[name] = (counts[name] ?? 0) + 1;

        const own = { id: `${name}-${counts[name]}`, seed: kept.int(0, 2 ** 30) };

        if (name === "tavern") {
            const storeys = spec.radius < 20 ? kept.pick([1, 2]) : spec.radius < 40 ? kept.pick([1, 2, 2]) : 2;
            const named = nameTavern(kept, { storeys, taken });

            taken.add(named.name);

            return { ...own, tavern: named };
        }

        return name === "church" ? { ...own, patron: patronOf(kept), ...churchOf(spec.radius, own.seed) } : own;
    };
    const wanted = [...spec.landmarks, ...(spec.extra ?? []).filter(([, chance]) => kept.chance(chance)).map(([name]) => name)];

    for (const [index, name] of wanted.entries()) {
        const [w, d] = LANDMARKS[name].map((plots) => plots * PLOT);
        let placed = null;

        for (const edge of random.shuffle([...edges])) {
            // (Slid along the edge, if it doesn't fit in the middle, but never so far its front
            // isn't on the market)
            const slide = Math.max(0, (edge.long - w) / 2) + 1.5;

            for (const shift of [0, 2, -2, 4, -4, 6, -6].filter((shift) => Math.abs(shift) <= slide)) {
                const rect = frontOn(edge, w, d, shift);

                if (!placed && landmark(rect)) {
                    placed = rect;
                }
            }
        }

        placed ??= firstAlong(streets.filter(({ main }) => main), random, [w, d], { from: reach, to: radius * (other ? 0.9 : 0.6) }, landmark);

        if (placed) {
            mark(placed, 0, USE.building);
            place(placed, { key: landmarkKey(name), kind: "landmark", name, ...identity(name) });
        } else if (index < spec.landmarks.length && ENTERED.includes(name)) {
            // (Every place has its tavern, and a village or bigger its church, smithy and guild)
            return null;
        }
    }

    // A well and stalls on the market, clear of the middle (where people meet), of each other and
    // of where the main streets leave it; things piled in yards. A prop stands in the middle half
    // of its plots (world.js), on squares that are among `on`
    const thing = (x, y, name, facing, on) => {
        const [w, d] = PROPS[name].map((plots) => plots * PLOT);
        const core = frame(x, y, w / 2, d / 2, facing);

        if (!fitsOn(core, 0.5, on)) {
            return false;
        }

        mark(core, 0.5, USE.thing);
        place(frame(x, y, w, d, facing), { key: propKey(name), kind: "prop", name });

        return true;
    };
    const onMarket = (rect) => eachSquare(rect, 1.5, (i, j) => inside(i, j) && within(market, i + 0.5, j + 0.5));

    for (let tries = 0; tries < 12; tries++) {
        const angle = random.next() * TAU;
        const r = reach * random.range(0.25, 0.45);

        const [x, y, facing] = [centre[0] + cos(angle) * r, centre[1] + sin(angle) * r, random.next() * TAU];

        if (onMarket(frame(x, y, 4, 4, facing)) && thing(x, y, "well", facing, [USE.street])) {
            break;
        }
    }

    for (const edge of random.shuffle(edges.filter(({ crossed }) => !crossed)).slice(0, spec.stalls)) {
        const [x, y, facing] = [edge.middle[0] + edge.inward[0] * 3.5, edge.middle[1] + edge.inward[1] * 3.5, facingOf(...edge.inward)];

        if (onMarket(frame(x, y, 4, 4, facing))) {
            thing(x, y, "tent", facing, [USE.street]);
        }
    }

    // In a town or bigger, lamps on posts round the market, lit at night (kits/props.js
    // lamppost): either side of each main street where it comes in, and in its corners
    if (!spec.small && spec.radius >= 48) {
        const lamp = (x, y, facing) => onMarket(frame(x, y, 2, 2, 0)) && thing(x, y, "lamppost", facing, [USE.street]);

        for (const edge of edges.filter(({ crossed }) => crossed)) {
            for (const side of [-1, 1]) {
                const out = spec.main / 2 + 1.8;

                lamp(edge.middle[0] + edge.along[0] * side * out + edge.inward[0] * 2, edge.middle[1] + edge.along[1] * side * out + edge.inward[1] * 2, facingOf(...edge.inward));
            }
        }

        for (const corner of market) {
            const [x, y] = [corner[0] + (centre[0] - corner[0]) * 0.35, corner[1] + (centre[1] - corner[1]) * 0.35];

            lamp(x, y, facingOf(centre[0] - corner[0], centre[1] - corner[1]));
        }
    }

    // A people's wall round its town (the cat folk's mud, the orcs' stakes, the dark elves'
    // black stone...): lengths of wall round a circle past its houses, a gatehouse where each
    // main street goes through, a tower every few lengths
    if (other && look.wall && spec.radius >= look.wall) {
        const around = spec.radius + Math.min(spec.fields - 4, spec.radius * 0.18);
        const crossings = streets.filter(({ main }) => main).map(({ points }) => crossingAt(points, centre, around)).filter(Boolean);
        const gates = crossings.map(([x, y]) => atan2(y - centre[1], x - centre[0]));
        const span = 4 * PLOT;
        const count = Math.max(8, Math.round((TAU * around) / span));
        const clearOf = (angle, reach) => gates.every((gate) => {
            const off = Math.abs(((angle - gate + PI * 3) % TAU) - PI);

            return off * around > reach;
        });

        for (let k = 0; k < count; k++) {
            const angle = (k * TAU) / count;
            const [x, y] = [centre[0] + cos(angle) * around, centre[1] + sin(angle) * around];
            const outward = facingOf(cos(angle), sin(angle));

            if (!clearOf(angle, span / 2 + 7)) {
                continue;
            }

            const tower = k % 4 === 0;
            const rect = tower ? frame(x, y, 2 * PLOT, 2 * PLOT, outward) : frame(x, y, (TAU * around) / count + 0.6, PLOT, outward);

            if (fits(rect, 0, [USE.street, USE.building])) {
                mark(rect, 0.4, USE.building);
                place(rect, { key: `${tower ? "tower" : "wall"}-${people}`, kind: tower ? "tower" : "wall" });
            }
        }

        // (Each gatehouse across its street, which runs on through its gate)
        for (const [x, y, heading] of crossings) {
            const rect = frame(x, y, 3 * PLOT, 2 * PLOT, heading);

            eachSquare(rect, 0.2, (i, j) => {
                if (inside(i, j) && use[j * width + i] !== USE.street) {
                    use[j * width + i] = USE.building;
                }
            });
            place(rect, { key: `gatehouse-${people}`, kind: "gatehouse" });
        }
    }

    // A people's own places in its bigger settlements, where the humans would have a windmill
    // (the cat folk's sun temple, the orcs' fighting pit, the elves' moonwell...): along the main
    // streets, out past the market, as many as fit of one for a town, two for a city, three for a
    // capital
    if (other && PEOPLE_PLACES[people] && !spec.small) {
        const wanted = spec.radius >= 112 ? 3 : spec.radius >= 84 ? 2 : spec.radius >= 48 ? 1 : 0;
        const names = random.shuffle(Object.keys(PEOPLE_PLACES[people]).filter((name) => name !== "castle"));
        let placed = 0;

        for (const name of names) {
            const [w, d] = PEOPLE_PLACES[people][name].map((plots) => plots * PLOT);
            const rect = placed < wanted ? firstAlong(random.shuffle(streets.filter(({ main }) => main)), random, [w, d], { from: reach * 1.2, to: radius * 0.9 }, landmark) : null;

            if (rect) {
                mark(rect, 0, USE.building);
                place(rect, { key: `structure-${people}-${name}`, kind: "structure", name, seed: random.int(0, 2 ** 30) });
                placed++;
            }
        }
    }

    // Houses: round the market first, then along the main streets from the middle out, then the
    // lanes; each town favouring one style
    const favourite = random.pick(HOUSE_STYLES);
    const styleOf = () => (random.chance(0.55) ? favourite : random.pick(HOUSE_STYLES));
    const lots = look.lots && !spec.small ? look.lots : { width: spec.width, depth: spec.depth };
    const houseSize = () => [random.range(...lots.width), random.range(...lots.depth)].map((metres) => Math.round(metres * 2) / 2);
    const farSize = look.far && !spec.small ? () => [random.range(...look.far.width), random.range(...look.far.depth)].map((metres) => Math.round(metres * 2) / 2) : houseSize;
    const gap = look.gap ?? spec.gap;

    // Each house's own (from a random of their own, so the layout's the same with or without
    // them): how many storeys it has, a trade for a shop on the market or a main street, what a
    // building behind the houses is, and a seed for its art
    const own = createRandom(seed * 31 + 11);
    const details = (street) => ({
        storeys: own.pickWeighted(spec.storeys, ([, weight]) => weight)[0],
        use: street !== "lane" && own.chance(spec.trades) ? own.pick(TRADES) : null,
        seed: own.int(0, 2 ** 30),
    });
    let street = "market";
    const edgeAt = (x, y) => {
        const angle = atan2(y - centre[1], x - centre[0]);

        return radius * (0.9 + 0.25 * noise(10 + cos(angle) * 2.5, 10 + sin(angle) * 2.5, seed + 17, 1.5, 2));
    };

    // A house on a lot, if the lot's to be built on (fewer towards the edge, none past it) and
    // it fits: "built", "left" (not built on) or "blocked"
    const house = (rect) => {
        const [dx, dy] = [rect.x - centre[0], rect.y - centre[1]];
        const out = length(dx, dy) / edgeAt(rect.x, rect.y);

        if (out > 1 || !building(rect)) {
            return "blocked";
        }

        if (!random.chance(spec.built * (out < 0.6 ? 1 : 1.35 - 0.6 * out))) {
            return "left";
        }

        const style = styleOf();
        const variant = random.int(0, HOUSE_VARIANTS - 1);

        // (A farmstead is its farmhouse, and its barns and sheds round the yard)
        const farm = spec.farm && pieces.some(({ kind }) => kind === "house") ? { back: true, storeys: 1, use: own.pick(OUTBUILDINGS), seed: own.int(0, 2 ** 30) } : details(street);
        // (Another people's house: what kind of house it is, and whether it stands over water)
        const wet = water?.[Math.floor(rect.y)]?.[Math.floor(rect.x)] === 1;
        const kind = other && !farm.back ? typeFor(people, rect, length(dx, dy) / radius, street, wet, own, look) : null;

        mark(rect, 0, USE.building);
        place(rect, { key: houseKey(rect.w / PLOT, rect.d / PLOT, style, variant), kind: "house", style, variant, ...farm, ...(kind ? { type: kind } : {}), ...(wet ? { water: true } : {}) });
        yard(rect);

        return "built";
    };

    // A yard behind a house: the same width, a few metres deep, with a bed, a tree or something
    // piled by the back wall, maybe
    const yard = (rect) => {
        if (!random.chance(YARD_CHANCE)) {
            return;
        }

        const deep = random.range(...YARD);
        const back = rect.d / 2 + NEIGHBOUR + deep / 2;
        const behind = frame(rect.x - rect.az[0] * back, rect.y - rect.az[1] * back, rect.w, deep, rect.facing);

        if (!fits(behind, 0, [USE.street, USE.building, USE.yard, USE.thing]) || !dry(behind)) {
            return;
        }

        mark(behind, 0, USE.yard);

        const laid = { rect: behind, bed: null };

        laidYards.push(laid);
        eachSquare(behind, 0, (i, j) => {
            owners[j * width + i] = laidYards.length;
        });

        if (random.chance(YARD_BED)) {
            const bed = frame(behind.x, behind.y, behind.w * random.range(0.4, 0.7), deep * 0.6, rect.facing);

            laid.bed = bed;
            eachSquare(bed, 0, (i, j) => {
                ground[j][i] = GROUND.soil;
            });
        } else if (random.chance(YARD_TREE)) {
            const [tx, ty] = [Math.round(behind.x + rect.ax[0] * random.range(-1, 1) * (rect.w / 4)), Math.round(behind.y + rect.ax[1] * random.range(-1, 1) * (rect.w / 4))];

            tree(tx, ty, [USE.yard]);
        }

        if (random.chance(YARD_PROP)) {
            const side = random.range(-0.3, 0.3) * rect.w;
            const at = [rect.x - rect.az[0] * (rect.d / 2 + 1.2) + rect.ax[0] * side, rect.y - rect.az[1] * (rect.d / 2 + 1.2) + rect.ax[1] * side];

            thing(at[0], at[1], random.pick(YARD_PROPS), rect.facing + random.range(-0.4, 0.4), [USE.yard]);
        }
    };

    // A tree, its trunk where four squares meet (x, y), filling them, on squares that are free
    // (or are among `on`)
    const tree = (x, y, on = []) => {
        for (const [i, j] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
            if (!inside(i, j) || ![USE.free, ...on].includes(use[j * width + i]) || ground[j][i] !== GROUND.grass) {
                return false;
            }
        }

        for (const [i, j] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
            use[j * width + i] = USE.thing;
        }

        // (Another people's own trees among them)
        const variant = homeTree(people, random.int(0, TREE_VARIANTS - 1));

        pieces.push({ key: treeKey(variant), kind: "tree", variant, x, y, w: 0.5, h: 0.5, facing: 0 });

        return true;
    };

    for (const edge of edges) {
        frontage(edge, random, houseSize, spec, house);
    }

    const mains = streets.filter(({ main }) => main);

    street = "main";

    if (look.far) {
        alongStreets(mains, random, houseSize, { from: reach * 0.6, to: radius * look.near, gap }, house);
        alongStreets(mains, random, farSize, { from: radius * look.near, gap }, house);
    } else {
        alongStreets(mains, random, houseSize, { from: reach * 0.6, gap }, house);
    }

    street = "lane";
    alongStreets(streets.filter(({ main }) => !main), random, farSize, { gap }, house);

    // Back buildings in the blocks behind the houses, each lined up with the street nearest it
    // and facing it
    const heading = (x, y) => {
        let best = null;

        for (const { points } of streets) {
            for (let k = 1; k < points.length; k++) {
                const [[ax, ay], [bx, by]] = [points[k - 1], points[k]];
                const far = fromSegment2(x, y, ax, ay, bx, by);

                if (!best || far < best.far) {
                    best = { far, along: [bx - ax, by - ay], from: [x - ax, y - ay] };
                }
            }
        }

        // (Facing the street: across the way it goes, towards it)
        const [ux, uy] = best.along;
        const side = ux * best.from[1] - uy * best.from[0] > 0 ? 1 : -1;

        return facingOf(uy * side, -ux * side);
    };

    for (let tries = 0; tries < (PI * radius * radius) / BACK_EVERY; tries++) {
        const angle = random.next() * TAU;
        const r = radius * 0.95 * sqrt(random.next());
        const [x, y] = [centre[0] + cos(angle) * r, centre[1] + sin(angle) * r];

        if (use[Math.floor(y) * width + Math.floor(x)] !== USE.free || r > edgeAt(x, y) * 0.95) {
            continue;
        }

        const rect = frame(x, y, random.range(...BACK_SIZE[0]), random.range(...BACK_SIZE[1]), heading(x, y));

        if (fits(rect, BACK_APART, [USE.building, USE.thing]) && fits(rect, BACK_FROM_STREETS, [USE.street]) && fits(rect, 0, [USE.yard]) && dry(rect)) {
            const style = styleOf();
            const variant = random.int(0, HOUSE_VARIANTS - 1);

            mark(rect, 0, USE.building);
            place(rect, { key: houseKey(rect.w / PLOT, rect.d / PLOT, style, variant), kind: "house", style, variant, back: true, storeys: 1, use: own.pick(OUTBUILDINGS), seed: own.int(0, 2 ** 30) });
        }
    }

    // A windmill out at the edge of town, beside a main street
    if (look.windmill !== false && random.chance(spec.windmill)) {
        const [w, d] = LANDMARKS.windmill.map((plots) => plots * PLOT);

        for (const street of random.shuffle([...mains])) {
            const rect = firstAlong([street], random, [w, d], { from: radius * 0.95, to: radius * 1.25 }, building);

            if (rect) {
                mark(rect, 0, USE.building);
                place(rect, { key: landmarkKey("windmill"), kind: "landmark", name: "windmill" });
                break;
            }
        }
    }

    // Trees on the open ground in town, clear of the streets and houses
    for (let tries = 0; tries < (PI * radius * radius) / (look.trees ?? TREE_EVERY); tries++) {
        const angle = random.next() * TAU;
        const r = radius * sqrt(random.next());
        const [x, y] = [Math.round(centre[0] + cos(angle) * r), Math.round(centre[1] + sin(angle) * r)];
        let clear = true;

        for (let j = y - 3; j <= y + 2 && clear; j++) {
            for (let i = x - 3; i <= x + 2 && clear; i++) {
                clear = inside(i, j) && (use[j * width + i] === USE.free || use[j * width + i] === USE.yard);
            }
        }

        if (clear) {
            tree(x, y);
        }
    }

    // Every square's walls: the squares inside each piece (a prop the middle half of its plots, a
    // tree the four round its trunk); and those a building stands on (a house's, a landmark's, a
    // wall's: `standing`), where the navigation mesh has a box, rather than walking round what's
    // drawn there (a prop's or a tree's: core/navigation/tiles.js)
    const blocked = Array.from({ length: height }, () => new Uint8Array(width));
    const opaque = Array.from({ length: height }, () => new Uint8Array(width));
    const standing = Array.from({ length: height }, () => new Uint8Array(width));

    for (const piece of pieces) {
        const block = (i, j, hides, stands = false) => {
            if (inside(i, j)) {
                blocked[j][i] = 1;
                opaque[j][i] = hides ? 1 : 0;
                standing[j][i] = stands ? 1 : standing[j][i];
            }
        };

        if (piece.kind === "tree") {
            for (const [i, j] of [[piece.x - 1, piece.y - 1], [piece.x, piece.y - 1], [piece.x - 1, piece.y], [piece.x, piece.y]]) {
                block(i, j, true);
            }
        } else if (piece.kind === "prop") {
            eachSquare(frame(piece.x, piece.y, (piece.w * PLOT) / 2, (piece.h * PLOT) / 2, piece.facing), 0, (i, j) => block(i, j, false));
        } else {
            eachSquare(frame(piece.x, piece.y, piece.w * PLOT, piece.h * PLOT, piece.facing), -INSET, (i, j) => block(i, j, true, true));
        }
    }

    // (Nothing stands on a street: a street square under a piece's edge is left open; no one
    // walks on water, but on the walks over it: a street's square over it that no walk's over, at
    // the outside of a bend, isn't walked on either)
    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            if (use[j * width + i] === USE.street && (!water?.[j][i] || onWalk(walks, i + 0.5, j + 0.5))) {
                blocked[j][i] = 0;
                opaque[j][i] = 0;
            } else if (water?.[j][i]) {
                blocked[j][i] = 1;
            }
        }
    }

    const houses = pieces.filter(({ kind }) => kind === "house");

    if (houses.length < (spec.radius > 30 ? (other ? 8 : 12) : other ? 3 : 4)) {
        return null;
    }

    // Where the town's ruled from (a town hall; a capital's keep): its biggest house near the
    // market, made over, and nothing else moved
    if (spec.seat) {
        const near = radius * 0.6;
        const seat = houses
            .filter(({ back, x, y, w, h, facing }) => !back && length(x - centre[0], y - centre[1]) <= near && opens(frame(x, y, w * PLOT, h * PLOT, facing)))
            .reduce((best, house) => {
                const [size, bestSize] = [house.w * house.h, best ? best.w * best.h : -1];

                return size > bestSize + 1e-9 || (Math.abs(size - bestSize) <= 1e-9 && length(house.x - centre[0], house.y - centre[1]) < length(best.x - centre[0], best.y - centre[1])) ? house : best;
            }, null);

        if (seat) {
            const { style, storeys } = seat;

            for (const key of Object.keys(seat)) {
                if (!["x", "y", "w", "h", "facing", "people", "water"].includes(key)) {
                    delete seat[key];
                }
            }

            Object.assign(seat, { key: landmarkKey(spec.seat), kind: "landmark", name: spec.seat, ...identity(spec.seat), style, storeys: Math.max(2, storeys ?? 2) });
        }
    }

    // Where its garrison's quartered (docs/WAR.md M16): the biggest house on a street out towards
    // its edge (BARRACKS_OUT: inside its walls, where it has them), on dry land, its door opening
    // onto the street, made over as its seat is, and nothing else moved; failing one there, the
    // biggest on dry land anywhere; failing that, the biggest over a lagoon, its door on a walk;
    // and failing that (a village of nothing but the buildings behind its houses), the biggest of
    // those whose door opens onto dry land
    if (spec.barracks) {
        const opening = pieces.filter(({ kind, x, y, w, h, facing }) => kind === "house" && opens(frame(x, y, w * PLOT, h * PLOT, facing)));
        const fronts = opening.filter(({ back }) => !back);
        const dry = fronts.filter(({ water: wet }) => !wet);
        const out = (house) => length(house.x - centre[0], house.y - centre[1]) / radius;
        const band = dry.filter((house) => out(house) >= BARRACKS_OUT[0] && out(house) <= BARRACKS_OUT[1]);
        const quarters = [band, dry, fronts, opening].find((each) => each.length)?.reduce((best, house) => {
            const [size, bestSize] = [house.w * house.h, best ? best.w * best.h : -1];

            return size > bestSize + 1e-9 || (Math.abs(size - bestSize) <= 1e-9 && out(house) < out(best)) ? house : best;
        }, null);

        if (quarters) {
            const { style, storeys } = quarters;

            for (const key of Object.keys(quarters)) {
                if (!["x", "y", "w", "h", "facing", "people", "water"].includes(key)) {
                    delete quarters[key];
                }
            }

            Object.assign(quarters, { key: landmarkKey("barracks"), kind: "landmark", name: "barracks", ...identity("barracks"), grade: spec.barracks, style, storeys: Math.max(1, storeys ?? 1) });
        }
    }

    // Its shops (docs/WAR.md *Shops*): a town's, a city's or a capital's specialists
    // (pieces.js SPECIALISTS), and the master's shop of its people kept here, if one is (`master`:
    // the world plan's, worldplan/settle.js: pieces.js MASTER_SHOPS); each the house nearest the market whose door
    // opens onto a street (on dry land and on the street if one can be), made over as its seat is,
    // and nothing else moved
    for (const name of [...(keepsShops(spec) ? SPECIALISTS : []), ...(master ? [master] : [])]) {
        const opening = pieces.filter(({ kind, x, y, w, h, facing }) => kind === "house" && opens(frame(x, y, w * PLOT, h * PLOT, facing)));
        const fronts = opening.filter(({ back }) => !back);
        const near = (house) => length(house.x - centre[0], house.y - centre[1]);
        const shop = [fronts.filter(({ water: wet }) => !wet), fronts, opening].find((each) => each.length)?.reduce((best, house) => (near(house) < near(best) - 1e-9 ? house : best));

        // (No house left to make over: laid out again)
        if (!shop) {
            return null;
        }

        const { style, storeys } = shop;

        for (const key of Object.keys(shop)) {
            if (!["x", "y", "w", "h", "facing", "people", "water"].includes(key)) {
                delete shop[key];
            }
        }

        Object.assign(shop, { key: landmarkKey(name), kind: "landmark", name, ...identity(name), style, storeys: Math.max(1, storeys ?? 1) });
    }

    // The yards as they're drawn; their fences stand on the squares along their sides
    const yards = yardsOf(laidYards, { use, owners, water, width, height, seed, people: other ? people : null });

    for (const { squares } of yards) {
        for (const [i, j] of squares) {
            blocked[j][i] = 1;
        }
    }

    return {
        width,
        height,
        centre,
        radius,
        market: { corners: market, centre },
        streets,
        exits: mains.map(({ points }) => points.at(-1)),
        pieces,
        yards,
        ground,
        blocked,
        opaque,
        standing,
        water,
        walks,
    };
}

/** Is a point ([x, y], metres) on one of a layout's walks ({ a, b, half }): along it and within its half-width? */
export function onWalk(walks, x, y) {
    return walks.some(({ a, b, half }) => {
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const long = length(dx, dy);
        const along = ((x - a[0]) * dx + (y - a[1]) * dy) / long;

        return along >= 0 && along <= long && Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / long <= half;
    });
}

// Is a point in a rectangle (frame's)?
function inRect({ x, y, w, d, ax, az }, px, py) {
    const [dx, dy] = [px - x, py - y];

    return Math.abs(dx * ax[0] + dy * ax[1]) <= w / 2 && Math.abs(dx * az[0] + dy * az[1]) <= d / 2;
}

// Each yard as it's drawn (layoutTown's yards), from the yards as they were laid (`laid`: { rect,
// bed }) and what's on each square once the town's laid out: where its fences run along its sides,
// its gateway, the squares they stand on, and the part of its bed clear of anything stood in it. A
// yard over water has none. Nothing here is drawn from the town's random numbers (whether a yard's
// left open, and where its gateway is, are from where it is: `seed`), so the rest of the town is
// laid out the same whatever's decided.
function yardsOf(laid, { use, owners, water, width, height, seed, people }) {
    const yards = [];

    laid.forEach(({ rect, bed }, index) => {
        const { x, y, w, d, facing, ax, az } = rect;
        // (What's on the square under a point of the yard: `u` metres across it from its left side,
        // `v` from its back)
        const squareAt = (u, v) => {
            const [px, py] = [x + (u - w / 2) * ax[0] + (v - d / 2) * az[0], y + (u - w / 2) * ax[1] + (v - d / 2) * az[1]];
            const [i, j] = [Math.floor(px), Math.floor(py)];

            return i >= 0 && j >= 0 && i < width && j < height ? j * width + i : -1;
        };
        const standing = (u, v) => {
            const at = squareAt(u, v);

            return at < 0 || use[at] === USE.thing || use[at] === USE.building;
        };
        // (Whether a point of the yard's is in a yard laid before it: any of those on the squares
        // round it whose rectangle it's in)
        const earlier = (u, v) => {
            const [px, py] = [x + (u - w / 2) * ax[0] + (v - d / 2) * az[0], y + (u - w / 2) * ax[1] + (v - d / 2) * az[1]];

            for (let j = Math.floor(py) - 1; j <= Math.floor(py) + 1; j++) {
                for (let i = Math.floor(px) - 1; i <= Math.floor(px) + 1; i++) {
                    const other = i >= 0 && j >= 0 && i < width && j < height ? owners[j * width + i] - 1 : -1;

                    if (other >= 0 && other < index && inRect(laid[other].rect, px, py)) {
                        return true;
                    }
                }
            }

            return false;
        };

        const wet = (u, v) => {
            const at = squareAt(u, v);

            return at >= 0 && water[Math.floor(at / width)][at % width] === 1;
        };

        if (water && [[0, 0], [w, 0], [0, d], [w, d], [w / 2, d / 2]].some(([u, v]) => wet(u, v))) {
            return;
        }

        // (Its fences: its left side, its back and its right side (the house is at its front), a
        // step at a time, each step where nothing stands, and, where it's against another yard,
        // only the one of them laid first)
        const sides = [
            [d, (t) => [0, t], (t) => [-YARD_FENCE.apart, t]],
            [w, (t) => [t, 0], (t) => [t, -YARD_FENCE.apart]],
            [d, (t) => [w, t], (t) => [w + YARD_FENCE.apart, t]],
        ];
        const fence = sides.map(([long, on, beyond]) => {
            const runs = [];
            const steps = Math.max(1, Math.round(long / YARD_FENCE.step));

            for (let k = 0; k < steps; k++) {
                const t = ((k + 0.5) * long) / steps;
                const [u, v] = on(t);
                const inward = [Math.min(Math.max(u, YARD_FENCE.inside), w - YARD_FENCE.inside), Math.min(Math.max(v, YARD_FENCE.inside), d - YARD_FENCE.inside)];
                const clear = !standing(...inward) && !earlier(...beyond(t));

                if (clear) {
                    const [from, to] = [(k * long) / steps, ((k + 1) * long) / steps];

                    if (runs.length && runs.at(-1)[1] === from) {
                        runs.at(-1)[1] = to;
                    } else {
                        runs.push([from, to]);
                    }
                }
            }

            return runs;
        });

        // (Left open now and then; the rest with a gateway, in its back if a run of it's long
        // enough, or else in its left or right side, somewhere along that run, the run cut there)
        const [hx, hy] = [Math.floor(x * 8), Math.floor(y * 8)];
        let gate = null;

        if (hashOf(hx, hy, seed + 41) < YARD_FENCE.open) {
            fence.forEach((runs) => runs.splice(0));
        } else {
            const longest = (k) => fence[k].reduce((best, run) => (!best || run[1] - run[0] > best[1] - best[0] + 1e-9 ? run : best), null);
            const side = [1, 0, 2].find((k) => longest(k) && longest(k)[1] - longest(k)[0] >= YARD_FENCE.gated);

            if (side !== undefined) {
                const run = longest(side);
                const room = run[1] - run[0] - YARD_FENCE.gate - 0.6;
                const at = run[0] + 0.3 + YARD_FENCE.gate / 2 + room * hashOf(hx, hy, seed + 42);

                gate = { side, at };
                fence[side].splice(fence[side].indexOf(run), 1, [run[0], at - YARD_FENCE.gate / 2], [at + YARD_FENCE.gate / 2, run[1]]);
                fence[side] = fence[side].filter(([from, to]) => to - from >= 0.25);
            }
        }

        // (The squares its fences stand on: those of its own along its fenced sides, a square or
        // so in, but for the way through its gateway; none already blocked)
        const squares = [];
        const own = (i, j) => i >= 0 && j >= 0 && i < width && j < height && owners[j * width + i] === index + 1;
        const reach = Math.ceil(w + d);

        for (let j = Math.floor(y) - reach; j <= Math.floor(y) + reach; j++) {
            for (let i = Math.floor(x) - reach; i <= Math.floor(x) + reach; i++) {
                if (!own(i, j) || use[j * width + i] !== USE.yard || (own(i - 1, j) && own(i + 1, j) && own(i, j - 1) && own(i, j + 1))) {
                    continue;
                }

                const [px, py] = [i + 0.5 - x, j + 0.5 - y];
                const [u, v] = [px * ax[0] + py * ax[1] + w / 2, px * az[0] + py * az[1] + d / 2];
                const along = [[u, v], [v, u], [w - u, v]];
                const fenced = along.some(([off, t], k) => off < YARD_FENCE.band && fence[k].some(([from, to]) => t >= from - 0.3 && t <= to + 0.3));
                const through = gate && along[gate.side][0] < YARD_FENCE.band && Math.abs(along[gate.side][1] - gate.at) <= YARD_FENCE.clearing;

                if (fenced && !through) {
                    squares.push([i, j]);
                }
            }
        }

        // (Its bed, if it has one, cut back from its back or its front to where nothing stands in
        // it: [u0, v0, u1, v1])
        let cleared = null;

        if (bed) {
            const [u0, u1, v0] = [(w - bed.w) / 2, (w + bed.w) / 2, (d - bed.d) / 2];
            const rows = Math.max(1, Math.round(bed.d / YARD_FENCE.step));
            const clearRow = (k) => {
                for (let u = u0; u <= u1 + 1e-9; u += Math.min(YARD_FENCE.step, bed.w)) {
                    for (const v of [v0 + (k * bed.d) / rows, v0 + ((k + 1) * bed.d) / rows]) {
                        if (standing(u, v)) {
                            return false;
                        }
                    }
                }

                return true;
            };
            const clear = Array.from({ length: rows }, (_, k) => clearRow(k));
            const back = clear.indexOf(false) < 0 ? rows : clear.indexOf(false);
            const front = clear.lastIndexOf(false) < 0 ? rows : rows - 1 - clear.lastIndexOf(false);
            const [from, to] = back >= front ? [0, back] : [rows - front, rows];

            if (((to - from) * bed.d) / rows >= YARD_BED_LEAST) {
                cleared = [u0, v0 + (from * bed.d) / rows, u1, v0 + (to * bed.d) / rows];
            }
        }

        // (Whether a washing line could be strung across its back, clear of anything stood there)
        let line = w >= YARD_LINE.least[0] && d >= YARD_LINE.least[1];

        for (let u = YARD_LINE.side; line && u <= w - YARD_LINE.side + 1e-9; u += YARD_FENCE.step) {
            line = !standing(u, YARD_LINE.back) && !standing(Math.min(u + YARD_FENCE.step, w - YARD_LINE.side), YARD_LINE.back);
        }

        yards.push({ kind: "yard", x, y, w: w / PLOT, h: d / PLOT, facing, ...(people ? { people } : {}), fence, gate, squares, bed: cleared, line });
    });

    return yards;
}

// What kind of house another people builds on a lot (their kits' types): by how far out it is
// (a share of the radius), how big, which street it's on, whether it stands over water
function typeFor(people, rect, out, street, wet, own, look) {
    const area = rect.w * rect.d;

    if (people === "cat") {
        return out < look.near && street !== "lane" ? (area > 100 ? "townhouse" : own.pick(["townhouse", "twin", "block"])) : rect.w >= 15 && rect.d >= 15 ? "compound" : own.pick(["hut", "twin", "block"]);
    }

    if (people === "orc") {
        return rect.w / rect.d > 1.6 ? "longhouse" : own.pick(["roundhut", "roundhut", "block"]);
    }

    if (people === "lizard") {
        return wet ? own.pick(["marsh", "deck", "saddle"]) : area > 90 ? "saddle" : own.pick(["marsh", "deck", "reed"]);
    }

    if (people === "elf") {
        return out < 0.45 ? own.pick(["ground", "pagoda"]) : own.pick(["trunk", "canopy", "trunk", "ground"]);
    }

    if (people === "darkElf") {
        return area > 95 && own.chance(0.4) ? "spire" : own.pick(["thorn", "thorn", "pod"]);
    }

    return null;
}

// The orcs' ways out: four, at right angles, the first towards the first road
function crossWays(exits, random) {
    const base = exits?.length ? exits[0] : random.next() * TAU;

    return [0, 1, 2, 3].map((k) => base + (k * PI) / 2);
}

// The dark elves' ways out: `spokes` of them evenly round (an orb web's), one along each road
function webWays(exits, random, spokes) {
    const base = exits?.length ? exits[0] : random.next() * TAU;
    const ways = Array.from({ length: spokes }, (_, k) => base + (k * TAU) / spokes + (k ? random.range(-0.08, 0.08) : 0));

    // (Each road's nearest spoke turned onto it)
    for (const exit of exits ?? []) {
        let best = 0;

        for (let k = 1; k < ways.length; k++) {
            const off = (angle) => Math.abs(((angle - exit + PI * 3) % TAU) - PI);

            best = off(ways[k]) < off(ways[best]) ? k : best;
        }

        ways[best] = exit;
    }

    return ways;
}

// The ways out ([angles]): those asked for, those within 50 degrees of each other made one; or
// three or four evenly round, give or take
function wayOut(exits, random) {
    const merge = (50 * PI) / 180;

    if (exits?.length) {
        const sorted = exits.map((angle) => angle - TAU * Math.floor(angle / TAU)).sort((a, b) => a - b);
        const kept = [];

        for (const angle of sorted) {
            const last = kept.at(-1);

            if (last === undefined || angle - last >= merge) {
                kept.push(angle);
            }
        }

        // (The last and the first are neighbours too, round the circle)
        if (kept.length > 1 && kept[0] + TAU - kept.at(-1) < merge) {
            kept.pop();
        }

        return kept;
    }

    const count = random.int(3, 4);
    const start = random.next() * TAU;

    return Array.from({ length: count }, (_, k) => start + (TAU * k) / count + random.range(-0.25, 0.25));
}

// The ways out (angles) and more, `count` in all: each more in the widest gap left between them,
// those in a gap spread evenly across it
function atLeast(ways, count) {
    if (ways.length >= count || !ways.length) {
        return ways;
    }

    const sorted = ways.map((angle) => angle - TAU * Math.floor(angle / TAU)).sort((a, b) => a - b);
    const gaps = sorted.map((angle, k) => ({ from: angle, span: (k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + TAU) - angle, more: 0 }));

    for (let n = ways.length; n < count; n++) {
        const widest = gaps.reduce((best, gap) => (gap.span / (gap.more + 1) > best.span / (best.more + 1) ? gap : best));

        widest.more++;
    }

    return [...ways, ...gaps.flatMap(({ from, span, more }) => Array.from({ length: more }, (_, k) => from + (span * (k + 1)) / (more + 1)))];
}

// A main street from the middle, heading out at an angle and bending as it goes, to the layout's
// edge (its last point on the edge)
function mainStreet(centre, angle, width, height, random, seed, bend = BEND) {
    const points = [centre];
    const phase = random.next() * 1000;
    let [x, y] = centre;

    for (let k = 1; k < 200; k++) {
        const heading = angle + (noise(k, phase, seed + 5, 3, 2) - 0.5) * 2 * bend;
        const [nx, ny] = [x + cos(heading) * STEP, y + sin(heading) * STEP];

        if (nx <= 0 || ny <= 0 || nx >= width || ny >= height) {
            // To the edge, exactly (a whisker inside it)
            const t = Math.min(...[nx <= 0 ? x / (x - nx) : 1, ny <= 0 ? y / (y - ny) : 1, nx >= width ? (width - x) / (nx - x) : 1, ny >= height ? (height - y) / (ny - y) : 1]);
            const edge = [x + (nx - x) * t, y + (ny - y) * t].map((value, axis) => Math.min((axis ? height : width) - 0.01, Math.max(0.01, value)));

            points.push(edge);
            break;
        }

        [x, y] = [nx, ny];
        points.push([x, y]);
    }

    return points;
}

// Where a street first reaches a distance from the middle ([x, y]), or null if it never does
function atDistance(points, centre, r) {
    const out = ([x, y]) => (x - centre[0]) * (x - centre[0]) + (y - centre[1]) * (y - centre[1]) >= r * r;

    for (let k = 1; k < points.length; k++) {
        const [a, b] = [points[k - 1], points[k]];

        if (!out(a) && out(b)) {
            let [lo, hi] = [0, 1];

            for (let step = 0; step < 24; step++) {
                const mid = (lo + hi) / 2;

                if (out([a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid])) {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }

            return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
        }
    }

    return null;
}

// Where a street goes through a circle round the middle: [x, y, the way it heads there, as a
// facing], or null if it never does
function crossingAt(points, centre, r) {
    const at = atDistance(points, centre, r);
    const k = at && points.findIndex(([x, y]) => (x - centre[0]) * (x - centre[0]) + (y - centre[1]) * (y - centre[1]) >= r * r);

    return at ? [...at, facingOf(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1])] : null;
}

// A lane curving round from one main street to the next (the way the angles go), about `r` from
// the middle, wandering in and out a little
function ring(from, to, centre, r, random, seed) {
    const [a, b] = [atDistance(from, centre, r), atDistance(to, centre, r)];

    if (!a || !b) {
        return null;
    }

    const start = atan2(a[1] - centre[1], a[0] - centre[0]);
    let sweep = atan2(b[1] - centre[1], b[0] - centre[0]) - start;

    sweep -= TAU * Math.floor(sweep / TAU);

    if (sweep < 0.2 || sweep > PI * 1.5) {
        return null;
    }

    const steps = Math.max(2, Math.ceil((sweep * r) / STEP));
    const phase = random.next() * 1000;
    const points = [a];

    for (let k = 1; k < steps; k++) {
        const angle = start + (sweep * k) / steps;
        const rr = r * (1 + (noise(k, phase, seed + 11, 2, 2) - 0.5) * 0.22);

        points.push([centre[0] + cos(angle) * rr, centre[1] + sin(angle) * rr]);
    }

    points.push(b);

    return points;
}

// A short alley off a lane, heading out or in from somewhere along it, or null
function alleyOff(lane, centre, random) {
    const total = lengthOf(lane);
    const from = pointAlong(lane, total * random.range(0.25, 0.75));

    if (!from) {
        return null;
    }

    const [x, y] = from.at;
    const outward = atan2(y - centre[1], x - centre[0]) + (random.chance(0.5) ? 0 : PI) + random.range(-0.35, 0.35);
    const long = random.range(10, 20);

    return [from.at, [x + cos(outward) * long * 0.5, y + sin(outward) * long * 0.5], [x + cos(outward + random.range(-0.3, 0.3)) * long, y + sin(outward + random.range(-0.3, 0.3)) * long]];
}

// Do two segments (a to b, c to d) cross?
function crosses(a, b, c, d) {
    const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);

    return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

// Lots along one of the market's edges, on its outer side, facing it, one after another as they
// come, each offered to `build` ("built", "left" or "blocked": if blocked, the next is tried a
// little further along)
function frontage({ middle, along, long, inward }, random, sizeOf, spec, build) {
    let s = -long / 2 + random.range(0, 1.5);

    while (s < long / 2 - 3) {
        const [w, d] = sizeOf();

        // (Its front on the edge, not round its corner)
        if (s + w > long / 2 + 1) {
            break;
        }

        const back = CLEAR + 0.3 + d / 2;
        const at = s + w / 2;
        const done = build(frame(middle[0] + along[0] * at - inward[0] * back, middle[1] + along[1] * at - inward[1] * back, w, d, facingOf(...inward)));

        s += done === "blocked" ? 1.5 : w + random.range(...spec.gap) * 0.5;
    }
}

// Lots along both sides of streets, from `from` metres along each to `to`, each facing its street,
// offered to `build` as frontage's are; stopping if it says "stop"
function alongStreets(streets, random, sizeOf, { from = 0, to = Infinity, gap = [0.5, 2] }, build) {
    for (const { points, width } of streets) {
        const total = Math.min(to, lengthOf(points));

        for (const side of [1, -1]) {
            let s = from + random.range(0, 2);

            while (s < total - 3) {
                const [w, d] = sizeOf();
                const middle = pointAlong(points, s + w / 2);

                if (!middle) {
                    break;
                }

                // Out to the side (to the right of the way the street goes, or the left), set back
                // (a little further, where the street bends towards its corners)
                const [tx, ty] = [cos(middle.heading), sin(middle.heading)];
                const [nx, ny] = [-ty * side, tx * side];
                let done = "blocked";

                for (let extra = 0; extra <= SET_BACK && done === "blocked"; extra += 0.5) {
                    const back = width / 2 + CLEAR + 0.3 + extra + d / 2;

                    done = build(frame(middle.at[0] + nx * back, middle.at[1] + ny * back, w, d, facingOf(-nx, -ny)));
                }

                if (done === "stop") {
                    return;
                }

                s += done === "blocked" ? 1.5 : w + random.range(...gap);
            }
        }
    }
}

// The first lot along some streets that `ok` says will do, or null
function firstAlong(streets, random, size, range, ok) {
    let found = null;

    alongStreets(streets, random, () => size, range, (rect) => {
        if (ok(rect)) {
            found = rect;

            return "stop";
        }

        return "blocked";
    });

    return found;
}
