// Houses of any size in four styles, each one its own: whitewashed cottages under thick thatch,
// timber-framed houses with jettied upper floors, brick houses with stone dressings, and stone
// houses with deep-set windows. Every side is dressed (the layout turns houses every way to face
// their streets, and the camera goes round them): the front with its door (and a shop's open
// front, for a house with a trade), windows on every floor lined up bay over bay, fewer down the
// sides and round the back, and a gable window up in the roof.
//
// A house is laid out the way a builder would (a facade grammar, after Wonka and Müller's split
// grammars): its storeys, then each wall split into bays, each bay given a door, a window or
// nothing, then each opening let into the wall (a real hole, its reveal going back to the glass
// or the door) and dressed (lintels, sills, shutters, window boxes, strap hinges, a step), then
// the timber frame fitted round them (framing.js), then the roof (roofs.js), its gables, the
// chimney and dormers. Its weathering is painted on its corners (Solid's tone): dirt splashed up
// the foot of the walls, shade under the eaves and jetties and in the reveals, moss on roofs
// facing north, and each house's limewash a little its own colour.
//
// Sizes are in the art's world pixels, five to a metre: a door is 2 metres tall, a storey about 3,
// so people 1.7 metres tall look right beside them. Houses face south (the layout turns them),
// their lot w by h plots of 4 metres. The numbers are the old builders' (and BlendBuildingCreator's):
// jetties of 30 to 55 cm on a bressummer with brackets under it, windows about 85 by 120 cm with
// their glass set back 12 cm, thatch pitched over 50 degrees, plain tiles 40 to 50.

import { createRandom, noise } from "../../../core/random.js";
import { TRADES } from "../../../core/setpieces/pieces.js";
import { awning as awningCloth, AWNINGS } from "../../cloth.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { frameWall } from "./framing.js";
import { chimney, pitchedRoof } from "./roofs.js";

const CELL = 20;
const M = 5;
const m = (metres) => metres * M;

// The stone plinth the walls stand on (metres)
const PLINTH = 0.35;

/**
 * The four styles: what they're built of (materials' names), how tall their storeys are
 * (metres), how steep their roofs (rise over half the span) and what kind, how far they
 * overhang, their windows' sizes (metres), and how likely shutters, dormers and a chimney are.
 */
export const STYLES = Object.freeze({
    cottage: {
        walls: ["plaster-white", "plaster-white", "plaster", "plaster-ochre", "plaster-rose"],
        roofs: ["thatch", "thatch", "thatch-grey"],
        plinth: "stone-warm",
        storey: [2.5, 2.8],
        upper: [2.3, 2.5],
        pitch: [1.2, 1.45],
        kinds: [["gable", 3], ["hip", 4], ["half-hip", 3]],
        thatch: true,
        overhang: [0.42, 0.52],
        verge: [0.3, 0.4],
        thickness: 0.32,
        reveal: 0.13,
        window: [0.6, 0.8],
        windowHeight: [0.75, 0.95],
        shutters: 0.7,
        dormers: 0.45,
        chimney: 0.85,
        stack: "stone-warm",
        wealth: [0, 0.5],
        storeys: 1,
    },
    timber: {
        walls: ["plaster-ochre", "plaster", "plaster-white", "plaster-rose", "plaster-ochre"],
        roofs: ["clay", "clay-orange", "slate", "shingles", "clay"],
        plinth: "stone",
        storey: [2.9, 3.2],
        upper: [2.6, 2.9],
        pitch: [0.95, 1.2],
        kinds: [["gable", 6], ["hip", 1], ["half-hip", 3]],
        frame: ["timber", "timber", "timber-grey", "timber-light"],
        jetty: [0.3, 0.55],
        overhang: [0.35, 0.5],
        verge: [0.25, 0.35],
        thickness: 0.2,
        reveal: 0.12,
        window: [0.75, 1],
        windowHeight: [0.9, 1.2],
        shutters: 0.4,
        dormers: 0.3,
        chimney: 0.6,
        stack: "brick",
        wealth: [0.2, 1],
        stoneGround: 0.35,
        storeys: 3,
    },
    brick: {
        walls: ["brick", "brick-brown"],
        roofs: ["clay", "slate", "slate-grey", "clay-orange"],
        plinth: "stone",
        storey: [3, 3.3],
        upper: [2.8, 3],
        pitch: [0.85, 1.05],
        kinds: [["gable", 6], ["hip", 3], ["half-hip", 1]],
        quoins: "stone-warm",
        course: "stone-warm",
        dressing: "stone-warm",
        overhang: [0.3, 0.4],
        verge: [0.15, 0.25],
        thickness: 0.2,
        reveal: 0.17,
        window: [0.8, 1],
        windowHeight: [1, 1.3],
        shutters: 0.25,
        dormers: 0.25,
        chimney: 0.9,
        stack: "brick",
        wealth: [0.4, 1],
        arch: "round",
        storeys: 3,
    },
    stone: {
        walls: ["stone", "stone-warm"],
        roofs: ["slate-grey", "slate", "shingles", "clay"],
        plinth: "stone-dark",
        storey: [3, 3.3],
        upper: [2.7, 3],
        pitch: [0.8, 1],
        kinds: [["gable", 7], ["hip", 2], ["half-hip", 1]],
        course: "stone-dark",
        dressing: "stone-warm",
        overhang: [0.25, 0.35],
        verge: [0.1, 0.2],
        thickness: 0.22,
        reveal: 0.24,
        window: [0.7, 0.95],
        windowHeight: [1, 1.3],
        shutters: 0.35,
        dormers: 0.2,
        chimney: 0.7,
        stack: "stone",
        wealth: [0.3, 0.9],
        arch: "pointed",
        mullions: true,
        storeys: 2,
    },
});

/**
 * Barns and stables behind the houses: boarded walls on a stone footing, wide doors, a few small
 * shuttered openings, under thatch or shingles.
 */
const BARN = Object.freeze({
    walls: ["planks", "planks-dark", "planks"],
    roofs: ["thatch", "shingles", "thatch-grey"],
    plinth: "stone-dark",
    storey: [2.8, 3.3],
    upper: [2.5, 2.7],
    pitch: [0.95, 1.2],
    kinds: [["gable", 7], ["half-hip", 3]],
    overhang: [0.35, 0.45],
    verge: [0.25, 0.35],
    thickness: 0.25,
    reveal: 0.08,
    window: [0.5, 0.6],
    windowHeight: [0.5, 0.6],
    shutters: 1,
    dormers: 0,
    chimney: 0,
    stack: "stone",
    wealth: [0, 0.2],
    storeys: 1,
    barn: true,
});

/** How many square plots a house has to stand on for a chance of more storeys (64 m², 96 m²). */
export const UPSTAIRS = 4;
const THIRD_STOREY = 6;

const PAINTS = ["paint-green", "paint-red", "paint-blue", "paint-ochre", "paint-cream"];

const seedOf = (text) => [...text].reduce((total, character) => (Math.imul(total, 31) + character.charCodeAt(0)) >>> 0, 17);
const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

// The walls of a storey, as faces a wall is built on (Solid.wall's), for a box x0..x1 by z0..z1
// standing on y
function facesOf([x0, x1, z0, z1], y) {
    return {
        front: { origin: [x0, y, z1], across: [1, 0, 0], out: [0, 0, 1], length: x1 - x0 },
        back: { origin: [x1, y, z0], across: [-1, 0, 0], out: [0, 0, -1], length: x1 - x0 },
        left: { origin: [x0, y, z0], across: [0, 0, 1], out: [-1, 0, 0], length: z1 - z0 },
        right: { origin: [x1, y, z1], across: [0, 0, -1], out: [1, 0, 0], length: z1 - z0 },
    };
}

const at = ({ origin, across }, u, v, w = 0, out = [0, 0, 0]) => [origin[0] + across[0] * u - out[0] * w, origin[1] + v, origin[2] + across[2] * u - out[2] * w];

/**
 * How a house will be built, worked out from its piece of the layout (the same every time for
 * the same piece): { style, seed, wealth, storeys ([{ y, height, box: [x0, x1, z0, z1] }], world
 * pixels), eaves, ridge ("x" or "z"), roof, walls (material names), frame, openings ({ front,
 * back, left, right }: each a list per storey of { kind: "door", "window", "shop" or "hatch", u0,
 * u1, v0, v1 }), chimney, dormers, use }.
 *
 * A special building built as a house (a tavern, the guild) may ask for more: `front` (where its
 * front wall stands, world pixels from the back of its lot), `entrance` ({ width, height }: a
 * wide door in the middle of the front), `board` (a width kept clear over the door for a name
 * board upstairs), `ground` (its ground floor's walls), `jettied` (true or false, not by chance)
 * and `lofty` (the least height of its ground floor: room for a name over the door).
 */
export function planHouse({ w, h, style = "timber", variant = 0, back = false, storeys: asked = null, use = null, seed = null, x = 0, y = 0, facing = 0, front: frontAt = null, entrance = null, board = null, ground = null, jettied: forceJetty = null, lofty = null }) {
    const barn = back && (use === "barn" || use === "stable");
    const look = barn ? BARN : STYLES[style] ?? STYLES.timber;
    const random = createRandom(seed ?? seedOf(`${x.toFixed?.(2) ?? x},${y.toFixed?.(2) ?? y}-${w}x${h}-${style}-${variant}`));
    const wealth = random.range(...look.wealth);
    const [width, depth] = [w * CELL, h * CELL];
    const area = w * h;

    // Storeys: asked for, or more on a bigger plot
    let count = asked ?? (back ? 1 : area >= UPSTAIRS && random.chance(0.5) ? (area >= THIRD_STOREY && random.chance(0.3) ? 3 : 2) : 1);

    count = Math.max(1, Math.min(back ? 1 : look.storeys, count));

    // A cottage asked for more than it has gets rooms in its roof, lit by dormers
    const attic = style === "cottage" && (asked ?? 1) > 1;
    const jettied = forceJetty ?? (Boolean(look.jetty) && count > 1 && random.chance(0.8));
    const jetty = jettied ? m(random.range(...look.jetty)) : 0;
    const [x0, x1, z0] = [m(0.25), width - m(0.25), m(0.35)];
    const front = frontAt ?? depth - m(0.25) - jetty * (count - 1);
    const levels = [];
    let floor = m(PLINTH);

    for (let s = 0; s < count; s++) {
        const own = m(random.range(...(s === 0 ? look.storey : look.upper)));
        const height = s === 0 && lofty ? Math.max(own, lofty) : own;

        levels.push({ y: floor, height, box: [x0, x1, z0, front + jetty * s] });
        floor += height;
    }

    const top = levels.at(-1);
    const [tx0, tx1, tz0, tz1] = top.box;
    const ridge = tz1 - tz0 > tx1 - tx0 + m(0.4) ? "z" : tx1 - tx0 > tz1 - tz0 + m(0.4) ? "x" : variant % 2 ? "z" : "x";
    const kind = back ? random.pick(["gable", "gable", "hip"]) : random.pickWeighted(look.kinds, ([, weight]) => weight)[0];
    const roofName = barn && look.roofs.includes(STYLES[style]?.roofs[0]) ? STYLES[style].roofs[0] : random.pick(look.roofs);
    const wallName = random.pick(look.walls);
    const frame = look.frame ? random.pick(look.frame) : null;
    const stoneGround = ground ?? (frame && random.chance(look.stoneGround ?? 0) ? random.pick(["stone-warm", "stone"]) : null);

    // Doors and windows, bay by bay, wall by wall, storey by storey: lined up bay over bay
    const windowWidth = m(random.range(...look.window));
    const windowHeight = m(random.range(...look.windowHeight));
    const shopWidth = m(random.range(2.1, 2.7));
    const sides = { front: [], back: [], left: [], right: [] };
    const doorBay = {};

    for (const [s, level] of levels.entries()) {
        const faces = facesOf(level.box, level.y);

        for (const side of Object.keys(sides)) {
            const { length } = faces[side];
            const street = side === "front";
            const bays = Math.max(1, Math.round((length - m(0.6)) / m(street ? 2.3 : 2.7)));
            const bay = length / bays;
            const list = [];
            const sill = s === 0 ? m(random.range(0.9, 1.05)) : m(random.range(0.75, 0.9));
            const [ww, wh] = [Math.min(windowWidth, bay - m(0.5)), Math.min(windowHeight * (s === 0 ? 1 : 0.92), level.height - sill - m(0.4))];
            const place = (kind, centre, halfWidth, v0, v1) => {
                const [u0, u1] = [Math.max(m(0.35), centre - halfWidth), Math.min(length - m(0.35), centre + halfWidth)];

                if (u1 - u0 > m(0.3) && v1 - v0 > m(0.3)) {
                    list.push({ kind, u0, u1, v0, v1 });
                }
            };

            // Which bays the door and a shop take (at the front, or round the back)
            if (s === 0 && (street || (side === "back" && random.chance(0.45)))) {
                doorBay[side] = bays === 1 ? 0 : street && bays >= 3 && random.chance(0.6) ? random.int(1, bays - 2) : random.int(0, bays - 1);
            }

            const shopBay = s === 0 && street && TRADES.includes(use) && bays > 1 ? (doorBay.front + 1 < bays ? doorBay.front + 1 : doorBay.front - 1) : -1;

            for (let b = 0; b < bays; b++) {
                const centre = (b + 0.5) * bay + (bays > 1 ? m(random.range(-0.08, 0.08)) : 0);

                if (s === 0 && doorBay[side] === b) {
                    const doorWidth = m(look.barn && street ? random.range(2, 2.4) : street ? random.range(1, 1.15) : 0.95);
                    const doorHeight = look.barn && street ? random.range(2.3, 2.5) : style === "cottage" ? random.range(1.9, 2) : random.range(2, 2.15);

                    place("door", centre, Math.min(doorWidth, bay - m(0.3)) / 2, 0, m(Math.min(doorHeight, level.height / M - 0.35)));
                    continue;
                }

                if (b === shopBay) {
                    place("shop", centre, Math.min(shopWidth, bay - m(0.4)) / 2, m(0.75), m(2.15));
                    continue;
                }

                // Windows: on most bays at the front, fewer round the sides and back (a barn's few
                // and small)
                const chance = look.barn ? 0.3 : street ? (s === 0 ? 0.85 : 0.9) : side === "back" ? 0.5 : 0.4;

                if (random.chance(chance)) {
                    place("window", centre, ww / 2, sill, sill + wh);
                }
            }

            // Every floor of the front has a window, and a long wall at least one
            if (!list.some(({ kind }) => kind === "window") && (street || length > m(7)) && random.chance(street ? 1 : 0.7)) {
                const free = Array.from({ length: bays }, (_, b) => b).filter((b) => !(s === 0 && (doorBay[side] === b || b === shopBay)));

                if (free.length) {
                    place("window", (random.pick(free) + 0.5) * bay, ww / 2, sill, sill + wh);
                }
            }

            // A public building's wide door in the middle of its front (and its windows clear of
            // it), and its name board's place upstairs (or over the door) kept clear of windows
            if (street && entrance) {
                const middle = length / 2;
                const clearOf = (half) => list.filter(({ u0, u1 }) => u1 < middle - half || u0 > middle + half);

                if (s === 0) {
                    list.splice(0, list.length, ...clearOf(entrance.width / 2 + m(0.5)).filter(({ kind }) => kind !== "door"), { kind: "door", u0: middle - entrance.width / 2, u1: middle + entrance.width / 2, v0: 0, v1: entrance.height });
                }

                if (board && s === Math.min(1, levels.length - 1) && levels.length > 1) {
                    list.splice(0, list.length, ...clearOf(board / 2 + m(0.2)));
                }
            }

            sides[side][s] = list;
        }
    }

    return {
        style: barn ? "barn" : style,
        look,
        seed: random.int(0, 2 ** 30),
        wealth,
        levels,
        eaves: top.y + top.height,
        ridge,
        kind,
        pitch: random.range(...look.pitch) * (back ? 0.9 : 1),
        overhang: m(random.range(...look.overhang)),
        verge: m(random.range(...look.verge)),
        sag: back || style !== "timber" ? 0 : random.chance(0.35) ? m(random.range(0.08, 0.2)) : 0,
        walls: wallName,
        roof: roofName,
        frame,
        stoneGround,
        jetty,
        openings: sides,
        attic,
        dormers: attic || (!back && random.chance(look.dormers)),
        chimney: !back && random.chance(look.chimney),
        glazing: wealth > 0.65 ? "leaded" : wealth > 0.3 ? "glass" : "shutters",
        paint: random.pick(PAINTS),
        use,
        back,
        facing,
        figure: frame ? (wealth > 0.75 ? "close" : random.chance(0.55) ? "braced" : "square") : null,
        tint: [random.range(0.94, 1.04), random.range(0.94, 1.03), random.range(0.92, 1.02)],
    };
}

/** A house filling a w x h footprint (plots, maybe fractions of them): a Three.js group. */
export function house(piece) {
    const plan = planHouse(piece);

    return buildHouse(plan).toObject();
}

/**
 * Build a planned house (planHouse's) as a Solid, weathered: the plinth, each storey's walls with
 * their openings and frame, the jetties, the roof and its gables, the chimney and dormers.
 */
export function buildHouse(plan) {
    const { look, levels } = plan;
    const random = createRandom(plan.seed);
    const solid = new Solid();
    const wallsOf = (s) => (s === 0 && plan.stoneGround ? plan.stoneGround : plan.walls);

    solid.tone = weathering(plan);

    // The plinth, a little proud of the walls
    const [bx0, bx1, bz0, bz1] = levels[0].box;

    solid.box(bx0 - m(0.05), 0, bz0 - m(0.05), bx1 + m(0.05), m(PLINTH), bz1 + m(0.05), material(look.plinth));

    for (const [s, level] of levels.entries()) {
        const faces = facesOf(level.box, level.y);
        const framed = plan.frame && !(s === 0 && plan.stoneGround);

        for (const side of ["front", "back", "left", "right"]) {
            const face = faces[side];
            const openings = plan.openings[side][s] ?? [];
            const name = wallsOf(s);

            solid.wall(face, face.length, level.height, openings.map((opening) => cutFor(plan, opening, name)), material(name));

            if (framed) {
                const sills = openings.filter(({ kind }) => kind === "window").map(({ v0 }) => v0);
                const heads = openings.filter(({ kind }) => kind === "window").map(({ v1 }) => v1);
                const bays = baysOf(face.length, side === "front");

                frameWall(solid, face, {
                    length: face.length,
                    height: level.height,
                    openings,
                    bays,
                    figure: side === "front" || s > 0 ? plan.figure : plan.figure === "close" ? "square" : plan.figure,
                    sill: sills.length ? Math.min(...sills) : level.height * 0.42,
                    head: heads.length ? Math.max(...heads) : null,
                    plates: !(s > 0 && plan.jetty && side !== "back"),
                    timber: plan.frame,
                });
            }

            for (const opening of openings) {
                dress(solid, plan, face, opening, name, random);
            }
        }

        // A band of stone at each floor, and quoins up the front corners
        if (s > 0 && look.course && !plan.jetty) {
            for (const face of Object.values(faces)) {
                solid.member(at(face, -m(0.02), m(0.02)), at(face, face.length + m(0.02), m(0.02)), face.out, m(0.2), m(0.05), material(look.course));
            }
        }

        if (look.quoins) {
            quoins(solid, faces, level, look.quoins);
        }

        if (s > 0 && plan.jetty) {
            jettyUnder(solid, plan, levels[s - 1], level);
        }
    }

    roofOver(solid, plan, random);

    if (TRADES.includes(plan.use)) {
        goods(solid, plan, faces0(plan), random);
    }

    return solid;
}

const faces0 = (plan) => facesOf(plan.levels[0].box, plan.levels[0].y);

// Where the posts stand between a wall's bays (as the plan split it)
function baysOf(length, street) {
    const bays = Math.max(1, Math.round((length - m(0.6)) / m(street ? 2.3 : 2.7)));

    return Array.from({ length: bays - 1 }, (_, b) => (length * (b + 1)) / bays);
}

// The hole an opening makes in its wall: how deep its reveal goes, and what fills its back
function cutFor(plan, { kind, u0, u1, v0, v1 }, wallName) {
    const { look } = plan;
    const depth = m(kind === "door" ? look.reveal + 0.04 : kind === "shop" ? 0.35 : look.reveal);
    const stoneWall = /stone|brick/.test(wallName);
    const sides = stoneWall && look.dressing && kind !== "shop" ? look.dressing : wallName;
    const arch = kind === "door" && look.arch && plan.wealth > 0.45 ? look.arch : null;
    const back = kind === "door" ? (plan.wealth > 0.55 ? plan.paint : "planks-dark") : kind === "shop" ? "shadow" : plan.glazing === "leaded" ? "leaded" : plan.glazing === "glass" ? "glass" : "shadow";

    return { u0, u1, v0, v1, depth, back: material(back), sides: material(sides), arch };
}

// What goes round and in an opening: its lintel and sill, shutters, a window box, a door's
// hinges and step, a shop's counter and awning
function dress(solid, plan, face, opening, wallName, random) {
    const { look } = plan;
    const { kind, u0, u1, v0, v1 } = opening;
    const { out } = face;
    const width = u1 - u0;
    const depth = m(kind === "door" ? look.reveal + 0.04 : look.reveal);
    const stoneWall = /stone|brick/.test(wallName);
    const trim = material(stoneWall && look.dressing ? look.dressing : plan.frame ?? "timber");
    const oak = material(plan.frame ?? "timber");

    if (kind === "window" || kind === "hatch") {
        // A sill standing out under it, and a lintel over it (a plaster or stone wall's; the
        // frame's rails do it on a timber-framed wall)
        solid.member(at(face, u0 - m(0.08), v0 - m(0.05)), at(face, u1 + m(0.08), v0 - m(0.05)), out, m(0.1), m(stoneWall ? 0.08 : 0.1), trim);

        if (!plan.frame || stoneWall) {
            solid.member(at(face, u0 - m(0.12), v1 + m(0.1)), at(face, u1 + m(0.12), v1 + m(0.1)), out, m(0.2), m(0.04), trim);
        }

        // In the opening: a mullion down the middle of a wide one (stone, or a timber post), and
        // glazing bars across plain glass
        const back = (u, v) => at(face, u, v, depth, out);

        if (width > m(0.8)) {
            solid.member(back((u0 + u1) / 2, v0), back((u0 + u1) / 2, v1), out, m(look.mullions ? 0.1 : 0.07), m(0.05), look.mullions ? trim : oak, { ends: false });
        }

        if (plan.glazing === "glass") {
            for (const t of [0.5]) {
                solid.member(back(u0, v0 + (v1 - v0) * t), back(u1, v0 + (v1 - v0) * t), out, m(0.04), m(0.03), oak, { ends: false });
            }
        }

        // Shutters, open against the wall at a slant (painted, on a better-off house)
        if (plan.glazing === "shutters" || random.chance(look.shutters)) {
            const board = material(plan.wealth > 0.35 ? plan.paint : "planks");
            const leaf = Math.min(width / 2, m(0.5));
            const angle = random.range(0.8, 1.2);

            for (const [hinge, sign] of [[u0, -1], [u1, 1]]) {
                const reach = [Math.cos(angle) * leaf * sign, Math.sin(angle) * leaf];
                const corner = (v, far) => {
                    const base = at(face, hinge + (far ? reach[0] : 0), v);

                    return far ? [base[0] + out[0] * reach[1], base[1], base[2] + out[2] * reach[1]] : base;
                };
                const quad = [corner(v0 + m(0.02), false), corner(v0 + m(0.02), true), corner(v1 - m(0.02), true), corner(v1 - m(0.02), false)];

                solid.face(quad, board);
                solid.face([...quad].reverse(), board);
            }
        }

        // A box of flowers under an upstairs window
        if (v0 > m(3) && plan.wealth > 0.3 && random.chance(0.3)) {
            const [a, b] = [at(face, u0 - m(0.05), v0 - m(0.28)), at(face, u1 + m(0.05), v0 - m(0.28))];

            solid.member(a, b, out, m(0.22), m(0.22), material("planks"));
            solid.member(at(face, u0, v0 - m(0.12)), at(face, u1, v0 - m(0.12)), out, m(0.12), m(0.2), material("leaves"));

            for (let k = 0; k < 4; k++) {
                const u = u0 + ((k + 0.5) * width) / 4;

                solid.member(at(face, u - m(0.06), v0 - m(0.02)), at(face, u + m(0.06), v0 - m(0.02)), out, m(0.1), m(0.16), material(k % 2 ? "flowers" : "flowers-gold"));
            }
        }

        return;
    }

    if (kind === "door") {
        const back = (u, v) => at(face, u, v, depth, out);

        // Strap hinges across the leaf, a surround, and a step up to it
        for (const v of [m(0.35), v1 - m(0.45)]) {
            solid.member(back(u0 + m(0.05), v), back(u1 - m(0.25), v), out, m(0.06), m(0.02), material("iron"), { ends: false });
        }

        if (!plan.frame || stoneWall) {
            for (const u of [u0 - m(0.08), u1 + m(0.08)]) {
                solid.member(at(face, u, 0), at(face, u, v1 + m(0.12)), out, m(0.16), m(0.04), trim, { ends: false });
            }

            solid.member(at(face, u0 - m(0.16), v1 + m(0.12)), at(face, u1 + m(0.16), v1 + m(0.12)), out, m(0.22), m(0.05), trim);
        }

        const [a, b] = [at(face, u0 - m(0.15), 0), at(face, u1 + m(0.15), 0)];
        const lip = m(0.35);

        solid.facing([[a[0], face.origin[1], a[2]], [b[0], face.origin[1], b[2]], [b[0] + out[0] * lip, face.origin[1], b[2] + out[2] * lip], [a[0] + out[0] * lip, face.origin[1], a[2] + out[2] * lip]], [0, 1, 0], material(look.plinth));
        solid.facing([[a[0] + out[0] * lip, 0, a[2] + out[2] * lip], [b[0] + out[0] * lip, 0, b[2] + out[2] * lip], [b[0] + out[0] * lip, face.origin[1], b[2] + out[2] * lip], [a[0] + out[0] * lip, face.origin[1], a[2] + out[2] * lip]], out, material(look.plinth));

        return;
    }

    if (kind === "shop") {
        // The lower shutter let down as a counter on brackets, the upper propped up as an awning
        const counter = material("planks");
        const reach = m(0.55);
        const lift = (point, d, dy = 0) => [point[0] + out[0] * d, point[1] + dy, point[2] + out[2] * d];

        solid.box(...boxAlong(face, u0, u1, v0 - m(0.06), v0, 0, reach), counter);

        for (const u of [u0 + m(0.15), u1 - m(0.15)]) {
            solid.beam(lift(at(face, u, v0 - m(0.45)), 0), lift(at(face, u, v0 - m(0.06)), reach * 0.8), m(0.07), m(0.07), oak, { up: out });
        }

        // A better-off shop's: striped canvas from a rail over the opening, sloping out over the
        // counter on two iron rods, its valance flapping (world/cloth.js); a poorer one's upper
        // shutter propped up on two sticks
        if (plan.wealth > 0.4) {
            const [rise, out2, fall] = [m(0.3), m(0.95), m(0.35)];
            const [left, right] = [at(face, u0 - m(0.12), v1 + rise), at(face, u1 + m(0.12), v1 + rise)];

            solid.member(left, right, out, m(0.07), m(0.07), oak);
            awningCloth(solid, lift(at(face, (u0 + u1) / 2, v1 + rise), m(0.04)), out, { width: width + m(0.24), depth: out2, fall, skirt: m(0.2), look: random.pick(Object.keys(AWNINGS)) });

            for (const u of [u0 - m(0.08), u1 + m(0.08)]) {
                solid.beam(at(face, u, v1 + rise - fall * 0.6), lift(at(face, u, v1 + rise - fall), out2), m(0.025), m(0.025), material("iron"));
            }

            return;
        }

        const angle = random.range(0.45, 0.7);
        const [dy, dz] = [Math.sin(angle) * m(0.75), Math.cos(angle) * m(0.75)];
        const shutter = [at(face, u0 - m(0.05), v1), at(face, u1 + m(0.05), v1), lift(at(face, u1 + m(0.05), v1), dz, dy), lift(at(face, u0 - m(0.05), v1), dz, dy)];
        const boards = material("planks");

        solid.face(shutter, boards);
        solid.face([...shutter].reverse(), boards);

        for (const u of [u0 + m(0.1), u1 - m(0.1)]) {
            solid.beam(lift(at(face, u, v0), reach * 0.95), lift(at(face, u, v1), dz * 0.95, dy * 0.95), m(0.04), m(0.04), oak);
        }
    }
}

// A box lying along a wall's face between u0 and u1, v0 to v1 up, standing w0 to w1 out from it
function boxAlong(face, u0, u1, v0, v1, w0, w1) {
    const corners = [at(face, u0, v0), at(face, u1, v1)];
    const { out } = face;
    const xs = [corners[0][0] + out[0] * w0, corners[1][0] + out[0] * w1, corners[0][0] + out[0] * w1, corners[1][0] + out[0] * w0];
    const zs = [corners[0][2] + out[2] * w0, corners[1][2] + out[2] * w1, corners[0][2] + out[2] * w1, corners[1][2] + out[2] * w0];

    return [Math.min(...xs), v0 + face.origin[1], Math.min(...zs), Math.max(...xs), v1 + face.origin[1], Math.max(...zs)];
}

// Long and short stones up a brick house's front corners
function quoins(solid, faces, level, name) {
    const stone = material(name);
    const face = faces.front;

    for (let v = m(0.05), k = 0; v < level.height - m(0.3); v += m(0.62), k++) {
        const long = k % 2 ? m(0.55) : m(0.32);

        for (const [u0, u1] of [[0, long], [face.length - long, face.length]]) {
            solid.member(at(face, u0, v + m(0.28)), at(face, u1, v + m(0.28)), face.out, m(0.5), m(0.03), stone, { ends: false });
        }
    }
}

// Under a jetty: the floor's underside, the bressummer along its edge, the joists' ends and the
// brackets under it at each post
function jettyUnder(solid, plan, below, level) {
    const [x0, x1, , zBelow] = below.box;
    const zFront = level.box[3];
    const y = level.y;
    const oak = material(plan.frame ?? "timber");
    const face = { origin: [x0, y, zFront], across: [1, 0, 0], out: [0, 0, 1], length: x1 - x0 };

    solid.face([[x0, y, zBelow], [x1, y, zBelow], [x1, y, zFront], [x0, y, zFront]].reverse(), material("planks-dark"));
    solid.member([x0 - m(0.03), y + m(0.12), zFront], [x1 + m(0.03), y + m(0.12), zFront], [0, 0, 1], m(0.26), m(0.09), oak);

    const joists = Math.max(2, Math.round((x1 - x0) / m(0.6)));

    for (let k = 0; k <= joists; k++) {
        const x = x0 + m(0.12) + ((x1 - x0 - m(0.24)) * k) / joists;

        solid.box(x - m(0.06), y - m(0.13), zFront - m(0.3), x + m(0.06), y, zFront + m(0.02), oak, { top: oak });
    }

    // Brackets at the corners and between the bays, clear of the door
    const door = plan.openings.front[0]?.find(({ kind }) => kind === "door");

    for (const u of [m(0.15), ...baysOf(face.length, true), face.length - m(0.15)]) {
        if (door && u > door.u0 - m(0.35) && u < door.u1 + m(0.35)) {
            continue;
        }

        const x = x0 + u;

        solid.beam([x, y - m(0.6), zBelow + m(0.02)], [x, y - m(0.05), zFront - m(0.05)], m(0.16), m(0.14), oak, { up: [1, 0, 0] });
    }
}

// The roof, its gables, chimney and dormers
function roofOver(solid, plan, random) {
    const { look, levels, eaves } = plan;
    const [x0, x1, z0, z1] = levels.at(-1).box;
    const thatched = /thatch/.test(plan.roof);
    const swap = plan.ridge === "z";
    const cap = thatched ? null : /clay/.test(plan.roof) ? plan.roof : "ridge";
    const barge = plan.frame ?? (thatched ? null : plan.style === "brick" ? null : "timber");
    const roof = pitchedRoof(solid, {
        x0: swap ? z0 : x0,
        x1: swap ? z1 : x1,
        z0: swap ? x0 : z0,
        z1: swap ? x1 : z1,
        eaves,
        pitch: plan.pitch,
        overhang: plan.overhang,
        verge: plan.verge,
        thickness: m(thatched ? Math.max(0.3, look.thickness) : look.thickness),
        kind: plan.kind,
        sag: plan.sag,
        cover: plan.roof,
        under: thatched ? plan.roof : "planks-dark",
        cap,
        barge,
        thatch: thatched,
        swap,
    });

    // The gables: the top storey's end walls carried up under the roof (none on a hipped roof),
    // framed on a timber house, with a little window in them
    if (plan.kind !== "hip") {
        const faces = facesOf(levels.at(-1).box, eaves);
        const ends = swap ? ["front", "back"] : ["left", "right"];
        const rise = roof.gableTop - eaves;

        for (const side of ends) {
            const face = faces[side];
            const L = face.length;
            const clipAt = roof.clipAcross;
            const line = clipAt > 0 ? [[0, 0], [L / 2 - clipAt, rise], [L / 2 + clipAt, rise], [L, 0]] : [[0, 0], [L / 2, rise], [L, 0]];
            const hatchSize = Math.min(m(0.7), rise * 0.35);
            const openings = rise > m(1.6) && (side === "front" || random.chance(0.6)) ? [{ kind: "hatch", u0: L / 2 - hatchSize / 2, u1: L / 2 + hatchSize / 2, v0: rise * 0.28, v1: rise * 0.28 + hatchSize }] : [];
            const name = plan.walls;

            solid.wall(face, L, rise, openings.map((opening) => cutFor(plan, opening, name)), material(name), { line });

            if (plan.frame) {
                frameWall(solid, face, { length: L, line, openings, timber: plan.frame });
            }

            for (const opening of openings) {
                dress(solid, plan, face, opening, name, random);
            }
        }
    }

    // The chimney: a stack up a gable end outside (brick, stone and cottages) or through the
    // roof by the ridge, standing clear of it
    if (plan.chimney) {
        const outside = plan.style !== "timber" && plan.kind !== "hip" && random.chance(0.6);
        const end = random.chance(0.5) ? -1 : 1;
        const [w, d] = [m(random.range(0.7, 0.9)), m(random.range(0.55, 0.7))];
        const height = roof.top + m(random.range(0.7, 1));
        const along = swap ? [z0, z1] : [x0, x1];
        const mid = swap ? (x0 + x1) / 2 : (z0 + z1) / 2;
        const inset = outside ? -d / 2 - m(0.02) : m(1.2);
        const a = end < 0 ? along[0] + inset : along[1] - inset;
        const across = mid + (outside ? 0 : m(random.range(-0.5, 0.5)));
        const [cx, cz] = swap ? [across, a] : [a, across];

        chimney(solid, { x: cx, z: cz, w: swap ? w : d, d: swap ? d : w, base: outside ? 0 : eaves, height, name: look.stack, pots: plan.wealth > 0.6 ? random.int(1, 2) : 0 });
    }

    // Dormers on the slope facing the street (a ridge along the front), lighting the roof rooms
    if (plan.dormers && !swap && plan.kind !== "hip") {
        const count = x1 - x0 > m(7) ? 2 : 1;
        const width = m(random.range(1, 1.3));
        const halfSpan = (z1 - z0) / 2;

        for (let k = 0; k < count; k++) {
            const cx = x0 + ((x1 - x0) * (k + 1)) / (count + 1);
            const zFront = z1 - halfSpan * 0.42;
            const base = roof.slopeAt(zFront) - m(0.1);
            const height = m(1.35);
            const box = [cx - width / 2, base, zFront - m(1.6), cx + width / 2, base + height, zFront];
            const walls = material(plan.walls);

            solid.box(...box, walls);

            const face = { origin: [box[0], base, zFront], across: [1, 0, 0], out: [0, 0, 1], length: width };
            const opening = { kind: "window", u0: m(0.2), u1: width - m(0.2), v0: m(0.3), v1: height - m(0.2) };

            solid.wall(face, width, height, [cutFor(plan, opening, plan.walls)], walls);
            dress(solid, plan, face, opening, plan.walls, random);
            pitchedRoof(solid, {
                x0: box[2],
                x1: zFront,
                z0: box[0],
                z1: box[3],
                eaves: base + height,
                pitch: plan.pitch,
                overhang: m(0.15),
                verge: m(0.12),
                thickness: m(thatched ? 0.22 : 0.12),
                kind: thatched ? "hip" : "gable",
                cover: plan.roof,
                under: thatched ? plan.roof : "planks-dark",
                cap: null,
                barge,
                thatch: thatched,
                swap: true,
            });
        }
    }
}

// A shop's goods laid out on its counter, and a barrel or two by its door
function goods(solid, plan, faces, random) {
    const shop = plan.openings.front[0]?.find(({ kind }) => kind === "shop");

    if (!shop) {
        return;
    }

    const face = faces.front;
    const colours = GOODS[plan.use] ?? GOODS.market;
    const count = Math.max(3, Math.round((shop.u1 - shop.u0) / m(0.35)));

    for (let k = 0; k < count; k++) {
        const u = shop.u0 + ((k + 0.5) * (shop.u1 - shop.u0)) / count;
        const [a] = [at(face, u, shop.v0)];
        const size = m(random.range(0.14, 0.24));
        const reach = m(random.range(0.12, 0.4));
        const [x, z] = [a[0] + face.out[0] * reach, a[2] + face.out[2] * reach];

        solid.box(x - size / 2, a[1], z - size / 2, x + size / 2, a[1] + size * random.range(0.6, 1.2), z + size / 2, material(random.pick(colours)));
    }
}

// What each trade sets out on its counter (colours of the art's plain materials)
const GOODS = {
    baker: ["bread", "bread", "canvas-sack"],
    butcher: ["apples", "awning", "canvas-sack"],
    greengrocer: ["apples", "cabbages", "squash"],
    potter: ["clay", "clay-orange", "paint-cream"],
    weaver: ["paint-blue", "paint-red", "paint-ochre", "paint-cream"],
    chandler: ["paint-cream", "bread"],
    cooper: ["planks", "planks-dark"],
    cobbler: ["planks-dark", "canvas-sack"],
    apothecary: ["glass", "paint-green", "flowers"],
    market: ["apples", "cabbages", "bread", "canvas-sack"],
};

export { TRADES };

// The weathering painted on a house's corners (Solid's tone): dirt splashed up the foot of its
// walls, shade under its eaves and jetties and on the soffits, streaks, moss on the roof where it
// faces north (the house turned as it will stand), and its limewash its own colour
function weathering(plan) {
    const underEaves = [plan.eaves, ...(plan.jetty ? plan.levels.slice(1).map(({ y }) => y) : [])];
    const limewash = new Set(["plaster", "plaster-white", "plaster-ochre", "plaster-rose"]);
    const roofs = new Set([plan.roof, "thatch-grey"]);
    const [cos, sin] = [Math.cos(plan.facing), Math.sin(plan.facing)];
    const seed = plan.seed;
    // (Where it turns up a wall, for walls to be cut there: Solid's tone bands. The shade under
    // the eaves stops just over them, so a gable's foot isn't shaded all the way up the gable)
    const bands = [m(1.25), ...underEaves.flatMap((level) => [level - m(0.9), level + m(0.02)])];

    return Object.assign((point, normal, material) => {
        // (Worked out for every corner of every house: numbers, not lists taken apart)
        const x = point[0];
        const y = point[1];
        const z = point[2];
        const upward = normal[1];
        const washed = limewash.has(material.name);
        let r = washed ? plan.tint[0] : 1;
        let g = washed ? plan.tint[1] : 1;
        let b = washed ? plan.tint[2] : 1;
        let k = 1;

        if (Math.abs(upward) < 0.45) {
            // A wall (or the side of anything on it)
            k *= 0.64 + 0.36 * smooth(m(0.02), m(1.25), y);

            for (const level of underEaves) {
                if (y <= level + m(0.01)) {
                    k *= 1 - 0.24 * smooth(level - m(0.9), level, y);
                }
            }

            k *= 0.93 + 0.07 * noise(x + z, y * 0.3, seed, m(1.5), 2);
        } else if (upward < -0.45) {
            k *= 0.5;
        } else if (roofs.has(material.name)) {
            // (Its normal as it will face in the world: north is -z)
            const north = -(normal[2] * cos - normal[0] * sin);
            const moss = noise(x, z, seed + 7, m(2.5), 2);
            const amount = Math.max(0, north) * 0.55 * moss + 0.1 * moss;

            r *= 1 - amount * 0.35;
            g *= 1 - amount * 0.12;
            b *= 1 - amount * 0.5;
            k *= 0.9 + 0.12 * noise(x, z, seed + 3, m(1.2), 2);
        }

        return [r * k, g * k, b * k];
    }, { bands });
}
