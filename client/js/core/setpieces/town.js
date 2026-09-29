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

import { createRandom, noise } from "../random.js";
import { atan2, cos, length, PI, sin, sqrt, TAU } from "./exact.js";
import { patronOf } from "../lore/gods.js";
import { nameTavern } from "../lore/taverns.js";
import { ENTERED, GROUND, HOUSE_STYLES, HOUSE_VARIANTS, houseKey, LANDMARKS, landmarkKey, OUTBUILDINGS, PLOT, PROPS, propKey, TRADES, treeKey, TREE_VARIANTS } from "./pieces.js";

/**
 * The kinds of settlement, and how each is laid out: how far its houses reach from the middle
 * (metres), the fields left round it, the market place's size, how wide its main streets and lanes
 * are, how far out its rings of lanes run (shares of the radius), how many alleys, its houses'
 * sizes (across and deep, metres) and the gaps between them, how many of the lots along its
 * streets are built on, and its landmarks round the market.
 */
export const SETTLEMENT_KINDS = Object.freeze({
    farmstead: { radius: 13, fields: 12, market: [5, 6], main: 3, lane: 2.6, rings: [], alleys: 0, width: [7, 9], depth: [7, 9.5], gap: [3, 7], built: 0.95, landmarks: [], windmill: 0, stalls: 0, storeys: [[1, 3], [2, 1]], trades: 0, farm: true, small: true },
    hamlet: { radius: 17, fields: 12, market: [5, 6.5], main: 3.2, lane: 2.6, rings: [], alleys: 0, width: [6, 8.5], depth: [6.5, 8.5], gap: [3, 7], built: 0.75, landmarks: ["tavern"], windmill: 0.2, stalls: 0, storeys: [[1, 7], [2, 1]], trades: 0, small: true },
    village: { radius: 30, fields: 16, market: [8, 10], main: 3.8, lane: 2.8, rings: [], alleys: 1, width: [6.5, 9], depth: [6.5, 8.5], gap: [2, 6], built: 0.75, landmarks: ["tavern", "church", "blacksmith", "guild"], windmill: 0.6, stalls: 1, storeys: [[1, 6], [2, 2]], trades: 0.12 },
    town: { radius: 48, seat: "hall", fields: 18, market: [10, 13], main: 4.4, lane: 3, rings: [0.62], alleys: 3, width: [6, 10], depth: [8, 12], gap: [0, 1.2], built: 0.95, landmarks: ["tavern", "church", "blacksmith", "guild"], extra: [["tavern", 0.5]], windmill: 0.8, stalls: 3, storeys: [[1, 4], [2, 5], [3, 1]], trades: 0.3 },
    city: { radius: 84, seat: "hall", fields: 18, market: [14, 17], main: 5, lane: 3.2, rings: [0.4, 0.72, 0.97], alleys: 8, width: [6, 11], depth: [9, 13], gap: [0, 0.8], built: 0.97, landmarks: ["tavern", "church", "blacksmith", "guild", "market", "tavern"], extra: [["tavern", 0.6], ["blacksmith", 0.5]], windmill: 0.9, stalls: 4, storeys: [[1, 2], [2, 6], [3, 3]], trades: 0.4 },
    capital: { radius: 112, seat: "keep", fields: 20, market: [17, 21], main: 5.5, lane: 3.3, rings: [0.3, 0.55, 0.78, 0.97], alleys: 12, width: [6, 11], depth: [9, 13], gap: [0, 0.6], built: 0.98, landmarks: ["tavern", "church", "blacksmith", "guild", "market", "tavern", "tavern", "blacksmith"], extra: [["tavern", 0.7]], windmill: 0.95, stalls: 6, storeys: [[1, 1], [2, 5], [3, 4]], trades: 0.45 },
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
 * place is, and from what size of settlement (its radius, metres) it's walled (`wall`).
 */
export const PEOPLE_TOWNS = Object.freeze({
    human: {},
    cat: { lots: { width: [8, 12], depth: [9, 12] }, far: { width: [16, 19], depth: [16, 19] }, gap: [1.5, 3], windmill: false, wall: 48, near: 0.45 },
    orc: { ways: "cross", bend: 0.06, rings: [0.72], lots: { width: [14, 20], depth: [8, 9.5] }, gap: [1.5, 3.5], windmill: false, wall: 30, market: 1.25 },
    lizard: { bend: 0.08, lots: { width: [8, 11], depth: [8, 10] }, gap: [2, 4], water: [0.46, 0.84], windmill: false, wall: 84 },
    elf: { bend: 0.9, lots: { width: [11, 14], depth: [11, 14] }, gap: [2.5, 5], trees: 45, windmill: false, wall: 48 },
    darkElf: { ways: "web", spokes: 7, bend: 0.1, rings: [0.38, 0.68, 0.96], lots: { width: [8, 11], depth: [9, 11] }, gap: [0, 0.6], windmill: false, wall: 30, market: 1.35 },
});

// How far the streets step as they're laid (metres), and how far a main street bends either way
// from its heading (radians)
const STEP = 6;
const BEND = 0.45;

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
 * ground, blocked, opaque (rows of squares: GROUND kinds, 1 where no one can go, 1 where nothing
 * behind can be seen), water (rows of squares, 1 for water, or null for none), walks (the plank
 * walks over it: [{ a, b ([x, y]: its ends), half (half its width) }]) }.
 */
export function layoutTown({ seed = 1, kind = "town", exits = null, people = "human" } = {}) {
    const spec = SETTLEMENT_KINDS[kind];

    if (!spec) {
        throw new Error(`No such kind of settlement: ${kind}`);
    }

    const random = createRandom(seed);
    const look = PEOPLE_TOWNS[people] ?? PEOPLE_TOWNS.human;

    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const town = designTown(spec, exits, createRandom(random.seed()), seed + attempt * 7919, look, people);

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

function designTown(spec, exits, random, seed, look = PEOPLE_TOWNS.human, people = "human") {
    const other = people !== "human";
    const size = 2 * Math.round(spec.radius + spec.fields);
    const [width, height] = [size, size];
    const centre = [width / 2 + random.range(-3, 3), height / 2 + random.range(-3, 3)];
    const radius = spec.radius;
    const use = new Uint8Array(width * height);
    const ground = Array.from({ length: height }, () => new Uint8Array(width));
    const inside = (i, j) => i >= 0 && j >= 0 && i < width && j < height;
    const pieces = [];

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
    const ways = look.ways === "cross" ? crossWays(exits, random) : look.ways === "web" ? webWays(exits, random, Math.min(look.spokes, 4 + Math.floor(spec.radius / 20))) : wayOut(exits, random);

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

    // The streets' squares, and the market's
    for (const { points, width: across, main } of streets) {
        const half2 = (across / 2) * (across / 2);

        for (let k = 1; k < points.length; k++) {
            const [[ax, ay], [bx, by]] = [points[k - 1], points[k]];

            for (let j = Math.floor(Math.min(ay, by) - across); j <= Math.ceil(Math.max(ay, by) + across); j++) {
                for (let i = Math.floor(Math.min(ax, bx) - across); i <= Math.ceil(Math.max(ax, bx) + across); i++) {
                    if (inside(i, j) && fromSegment2(i + 0.5, j + 0.5, ax, ay, bx, by) <= half2) {
                        const [dx, dy] = [i + 0.5 - centre[0], j + 0.5 - centre[1]];
                        const cobbled = main && !spec.small && dx * dx + dy * dy < (radius * COBBLED) ** 2;

                        use[j * width + i] = USE.street;
                        ground[j][i] = cobbled || ground[j][i] === GROUND.cobbles ? GROUND.cobbles : GROUND.road;
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
                ground[j][i] = spec.farm ? GROUND.courtyard : spec.small ? GROUND.grass : GROUND.cobbles;
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

                    ground[j][i] = use[j * width + i] === USE.street ? GROUND.planks : GROUND.soil;
                }
            }
        }

        // (The walks: each street's straight runs over the water, a metre onto the bank at each
        // end, as wide as the street)
        for (const { points, width: across } of streets) {
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

                        walks.push({ a: at(Math.max(0, run[0] - extra)), b: at(Math.min(1, run[1] + extra)), half: across / 2 });
                        run = null;
                    }
                }
            }
        }
    }

    // Can a rectangle go here: every square under it (grown by `grow`) on the layout, and none of
    // them one of `not`?
    const fits = (rect, grow, not) => eachSquare(rect, grow, (i, j) => inside(i, j) && !not.includes(use[j * width + i]));
    const mark = (rect, grow, what) => eachSquare(rect, grow, (i, j) => {
        use[j * width + i] = what;
    });
    const building = (rect) => fits(rect, NEIGHBOUR, [USE.building, USE.thing]) && fits(rect, CLEAR, [USE.street]) && fits(rect, 0, [USE.yard]);
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
    // tavern's name, sign and storeys, and what's upstairs; a church's patron
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

        return name === "church" ? { ...own, patron: patronOf(kept) } : own;
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

                if (!placed && building(rect)) {
                    placed = rect;
                }
            }
        }

        placed ??= firstAlong(streets.filter(({ main }) => main), random, [w, d], { from: reach, to: radius * (other ? 0.9 : 0.6) }, building);

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

        if (!fits(behind, 0, [USE.street, USE.building, USE.yard, USE.thing])) {
            return;
        }

        mark(behind, 0, USE.yard);

        if (random.chance(YARD_BED)) {
            const bed = frame(behind.x, behind.y, behind.w * random.range(0.4, 0.7), deep * 0.6, rect.facing);

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

        const variant = random.int(0, TREE_VARIANTS - 1);

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

        if (fits(rect, BACK_APART, [USE.building, USE.thing]) && fits(rect, BACK_FROM_STREETS, [USE.street]) && fits(rect, 0, [USE.yard])) {
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
    // tree the four round its trunk)
    const blocked = Array.from({ length: height }, () => new Uint8Array(width));
    const opaque = Array.from({ length: height }, () => new Uint8Array(width));

    for (const piece of pieces) {
        const block = (i, j, hides) => {
            if (inside(i, j)) {
                blocked[j][i] = 1;
                opaque[j][i] = hides ? 1 : 0;
            }
        };

        if (piece.kind === "tree") {
            for (const [i, j] of [[piece.x - 1, piece.y - 1], [piece.x, piece.y - 1], [piece.x - 1, piece.y], [piece.x, piece.y]]) {
                block(i, j, true);
            }
        } else if (piece.kind === "prop") {
            eachSquare(frame(piece.x, piece.y, (piece.w * PLOT) / 2, (piece.h * PLOT) / 2, piece.facing), 0, (i, j) => block(i, j, false));
        } else {
            eachSquare(frame(piece.x, piece.y, piece.w * PLOT, piece.h * PLOT, piece.facing), -INSET, (i, j) => block(i, j, true));
        }
    }

    // (Nothing stands on a street: a street square under a piece's edge is left open; no one
    // walks on water)
    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            if (use[j * width + i] === USE.street) {
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
            .filter(({ back, x, y }) => !back && length(x - centre[0], y - centre[1]) <= near)
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

    return {
        width,
        height,
        centre,
        radius,
        market: { corners: market, centre },
        streets,
        exits: mains.map(({ points }) => points.at(-1)),
        pieces,
        ground,
        blocked,
        opaque,
        water,
        walks,
    };
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
    const out = ([x, y]) => (x - centre[0]) ** 2 + (y - centre[1]) ** 2 >= r * r;

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
    const k = at && points.findIndex(([x, y]) => (x - centre[0]) ** 2 + (y - centre[1]) ** 2 >= r * r);

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
