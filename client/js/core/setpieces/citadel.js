// Hill citadels (the terrain plan's M7i-4, §9 row 7: "hill citadels 2–3× today's scale on stepped
// pads"; the humans' castle, sites.js): three wards one above another up a hill, each walled round,
// a tower at every corner of its walls standing out from them. The outer ward on the hill's top,
// its curtain wall round its edge, a barbican out in front of its gate; the middle ward a terrace
// higher, its wall standing on the battered retaining wall that holds it up; the inner ward
// highest, its close ringed by the great hall and the chapel, and in its back corner the great
// keep, its needle towers over everything. The way in winds round the hill (Krak des Chevaliers,
// Himeji): into the barbican from the side, through the outer gate at the front, round the outer
// ward under the middle ward's walls to its gate a quarter of the way round, up a stair that
// doubles back on itself against its retaining wall, round again to the inner gate and up
// another; so whoever comes in is under the walls all the way, and turns at every gate.
//
// Laid out round its middle in metres, `u` east and `v` south (its front, its outer gate, facing
// south; sites.js turns it to face its road), as a regular polygon of `sides` sides for each ward,
// the first side's middle due south. Pure data, exact maths only (what it blocks is the rules').
// Its measures are the real ones' (research: Beaumaris and Harlech, Krak, Spiš, Stirling and
// Edinburgh, Saumur's cones, Segovia's bartizans; the plan's notes).

import { cos, hypot, PI, sin, TAU } from "../exact.js";
import { createRandom } from "../random.js";
import { heightAt, HEIGHT_STEP } from "../terrain/height.js";
import { WORLD_SIZE } from "../worldplan/plan.js";

/**
 * A citadel's measures (metres): where it may stand; its hill, raised over the land under it and
 * eased out into the land round it; how far each ward stands above the one round it (at least and
 * at most), and how steeply its terrace's edge is eased (under its retaining wall); how far a
 * tower stands out past its walls' outer face (a share of its radius); and each ward, outermost
 * first: how many sides its walls have (at least and at most, by twos), how far its wall's outer
 * face is from the middle (`apothem`: at least and at most), how high its wall stands over its own
 * terrace, how thick, how big round its towers are (radius) and how far they stand over its wall,
 * how they're topped (battlements, or a cone of slate as tall as `spire` times its radius), and
 * whether its walls and towers wear a crown of machicolations. The inner walls higher than the
 * outer, so both can shoot at once (Beaumaris); its towers 30 to 60 m apart, every stretch of wall
 * well within bowshot of the towers at both its ends, fewer the smaller the ward, the inner a
 * square; each ward small enough that its towers stand clear of the wall round it, 2.5 m at the
 * least.
 */
export const CITADEL = Object.freeze({
    /**
     * Where it may stand: how far it may be moved off its plan's spot (metres: far enough to clear
     * the road it's near), and how far its land may rise or fall across it (metres).
     */
    room: Object.freeze({ shift: 192, across: 14 }),
    hill: Object.freeze({ raise: 7, ease: 40 }),
    terrace: Object.freeze({ rise: Object.freeze([8, 11]), ease: 2.5 }),
    project: 0.3,
    wards: Object.freeze([
        Object.freeze({ sides: Object.freeze([12, 14]), apothem: Object.freeze([76, 82]), wall: 8, thick: 3, tower: 4, over: 5, top: "battlements", spire: 0, crown: false }),
        Object.freeze({ sides: Object.freeze([8, 8]), apothem: Object.freeze([53, 57]), wall: 10, thick: 3.2, tower: 5, over: 6, top: "cone", spire: 2.6, crown: true }),
        Object.freeze({ sides: Object.freeze([4, 4]), apothem: Object.freeze([24, 27]), wall: 12, thick: 3.5, tower: 6, over: 8, top: "cone", spire: 3, crown: true }),
    ]),
    /**
     * Its gates (metres): the opening (wide, high to its arch's springing); the outer gate's twin
     * towers either side (radius, how far over its wall); the inner gates' gatehouses over them
     * (wide, how far into their ward, how far over their wall).
     */
    gate: Object.freeze({ wide: 3.6, high: 4.4, tower: 4.5, over: 5, house: 10, inward: 3, rise: 4 }),
    /**
     * The great keep (metres): how wide (square: at least and at most), how high its walls stand
     * over the inner ward; its two needle towers on opposite corners, how big round and how far
     * over its walls, their spires as tall as `spire` times their radius; its bartizans on the
     * other two (radius, how tall), and how far it's kept from the ward's walls.
     */
    keep: Object.freeze({ size: Object.freeze([16, 19]), high: Object.freeze([34, 40]), needle: 2.5, over: 13, spire: 6.5, bartizan: 1.5, turret: 4, clear: 2.5 }),
    /**
     * The barbican out in front of the outer gate (metres): how far out, how wide inside, how high
     * its walls, how thick, its turrets' radius at its far corners; its way in through one side.
     */
    barbican: Object.freeze({ long: 24, wide: 10, wall: 6.5, thick: 2, turret: 2.6 }),
    /** The great hall along one side of the inner close (how deep, how much of the side, how high its eaves). */
    hall: Object.freeze({ deep: 10, share: 0.8, eaves: 9 }),
    /** The chapel along the other, in front of the keep (how deep, how high its eaves, its flèche). */
    chapel: Object.freeze({ deep: 8, eaves: 8, fleche: 9 }),
    /** The lower wards' ranges of buildings against their walls (how deep, how high their eaves; how far clear of the next ward). */
    range: Object.freeze({ deep: 7, eaves: 7, clear: 2 }),
    /** How far round the wards' gates are, each from the last (a share of the way round). */
    round: 0.25,
});

/**
 * A citadel, laid out from its seed: { wards: [{ sides, apothem, rise (over the outer ward),
 * wall, thick, tower, over, top, spire, crown, gate (which side its gate is in: 0 the front,
 * counting round towards the west) }], way (1 or -1: which way round the hill the way in winds),
 * keep: { at: [u, v], size, high, turn (radians: the way its door faces, as `turn` for the wards'
 * sides), needle, over, spire, bartizan, turret }, ranges: [{ kind ("range", "hall" or "chapel"),
 * ward, side, from, to (how far along it, as a share of its length inside the wall, from its east
 * end), deep, eaves, apse (the chapel's: which end, 1 or -1 along the side's run), fleche }] },
 * the same every time for the same seed.
 */
export function layoutCitadel({ seed }) {
    const random = createRandom(seed >>> 0 || 1);
    const between = ([a, b]) => a + (b - a) * random.next();
    const way = random.next() < 0.5 ? 1 : -1;
    let rise = 0;
    const wards = CITADEL.wards.map((ward, k) => {
        const sides = ward.sides[0] + 2 * Math.floor(random.next() * ((ward.sides[1] - ward.sides[0]) / 2 + 1));

        rise += k ? between(CITADEL.terrace.rise) : 0;

        return {
            sides,
            apothem: between(ward.apothem),
            rise,
            wall: ward.wall,
            thick: ward.thick,
            tower: ward.tower,
            over: ward.over,
            top: ward.top,
            spire: ward.spire,
            crown: ward.crown,
            // (Its gate a quarter of the way round from the last ward's, the same way each time)
            gate: sideAt(sides, PI / 2 + k * way * CITADEL.round * TAU),
        };
    });
    // (The keep in the inner close's back corner, away from the inner gate, its door towards it;
    // the great hall along the side away from it, the chapel along the side it's on, in front of
    // it: Stirling's Inner Close, Edinburgh's Crown Square)
    const inner = wards.at(-1);
    const turn = sideTurn(inner.sides, inner.gate);
    const hand = random.next() < 0.5 ? 1 : 3;
    const [hallSide, chapelSide] = [(inner.gate + hand) % inner.sides, (inner.gate + 4 - hand) % inner.sides];
    const size = between(CITADEL.keep.size);
    const within = inner.apothem - inner.thick;
    const back = within - size / 2 - Math.max(CITADEL.keep.needle, CITADEL.keep.bartizan) - CITADEL.keep.clear;
    const hallTurn = sideTurn(inner.sides, hallSide);
    const keep = {
        at: [-(cos(turn) + cos(hallTurn)) * back, -(sin(turn) + sin(hallTurn)) * back],
        size,
        high: between(CITADEL.keep.high),
        turn,
        needle: CITADEL.keep.needle,
        over: CITADEL.keep.over,
        spire: CITADEL.keep.spire,
        bartizan: CITADEL.keep.bartizan,
        turret: CITADEL.keep.turret,
    };
    const { hall, chapel } = CITADEL;
    // (The chapel from in front of the keep to near the gate's wall: along its side, the gate's
    // way one end and the keep's the other, its apse that end)
    const chapelTurn = sideTurn(inner.sides, chapelSide);
    const toward = Math.round(sin(chapelTurn - turn));
    const [near, far] = [size / 2 - back + Math.max(CITADEL.keep.needle, CITADEL.keep.bartizan) + CITADEL.keep.clear, within - 1.5];
    const ranges = [
        { kind: "hall", ward: wards.length - 1, side: hallSide, from: (1 - hall.share) / 2, to: (1 + hall.share) / 2, deep: hall.deep, eaves: hall.eaves },
        {
            kind: "chapel",
            ward: wards.length - 1,
            side: chapelSide,
            from: 0.5 + Math.min(toward * near, toward * far) / (2 * within),
            to: 0.5 + Math.max(toward * near, toward * far) / (2 * within),
            deep: chapel.deep,
            eaves: chapel.eaves,
            apse: -toward,
            fleche: chapel.fleche,
        },
    ];

    // (Lean-to ranges along the inside of the outer and middle wards' walls, on the sides away
    // from their gates and from the stair up to the next ward's, clear of its walls and towers)
    for (const k of [0, 1]) {
        const { sides } = wards[k];
        const next = wards[k + 1];
        const stair = sideAt(sides, sideTurn(next.sides, next.gate));
        const busy = new Set([wards[k].gate, stair].flatMap((side) => [side - 1, side, side + 1].map((s) => (s + sides) % sides)));

        for (let side = 0; side < sides; side++) {
            const range = { kind: "range", ward: k, side, from: 0.12 + random.next() * 0.1, to: 1 - (0.12 + random.next() * 0.1), deep: CITADEL.range.deep, eaves: CITADEL.range.eaves };

            if (!busy.has(side) && random.next() < 0.6 && clearOf({ wards }, range, next)) {
                ranges.push(range);
            }
        }
    }

    return { wards, way, keep, ranges };
}

// Whether a range stands clear of the next ward in (its wall's outer face, and its towers):
// looked at along its front, every metre and a half
function clearOf(citadel, range, next) {
    const ward = citadel.wards[range.ward];
    const turn = sideTurn(ward.sides, range.side);
    const length = 2 * (ward.apothem - ward.thick) * (sin(PI / ward.sides) / cos(PI / ward.sides));
    const front = ward.apothem - ward.thick - range.deep;
    const towers = towersOf(citadel, next);
    const { clear } = CITADEL.range;

    for (let t = range.from; t <= range.to + 1e-9; t += 1.5 / length) {
        const along = (Math.min(t, range.to) - 0.5) * length;
        const at = [cos(turn) * front + sin(turn) * along, sin(turn) * front - cos(turn) * along];

        if (insideWard(citadel, next, at, clear) || towers.some(([u, v]) => hypot(at[0] - u, at[1] - v) < next.tower + clear)) {
            return false;
        }
    }

    return true;
}

// The side of a ward's walls (of `sides`) that faces nearest a way (radians, as sideTurn's)
function sideAt(sides, turn) {
    return ((Math.round(((turn - PI / 2) * sides) / TAU) % sides) + sides) % sides;
}

/** The way a side of a citadel's walls faces out (radians from east towards south, `u` to `v`: 0 the front, due south, then round to the west). */
export function sideTurn(sides, side) {
    return PI / 2 + (side * TAU) / sides;
}

/**
 * A ward's corners ([[u, v], ...], metres), going round, `inset` metres in from its wall's outer
 * face (the middle of its wall: its thickness halved): corner k between side k and side k + 1.
 */
export function cornersOf(citadel, ward, inset = 0) {
    const { sides } = ward;
    const radius = (ward.apothem - inset) / cos(PI / sides);

    return Array.from({ length: sides }, (_, k) => {
        const angle = sideTurn(sides, k) + PI / sides;

        return [cos(angle) * radius, sin(angle) * radius];
    });
}

/** Where a ward's towers stand ([[u, v], ...], metres): at its corners, out past its walls' outer face. */
export function towersOf(citadel, ward) {
    return cornersOf(citadel, ward, -CITADEL.project * ward.tower);
}

/** Whether a point ([u, v], metres) is inside a ward's walls' outer faces (or `out` metres past them). */
export function insideWard(citadel, ward, [u, v], out = 0) {
    for (let side = 0; side < ward.sides; side++) {
        const turn = sideTurn(ward.sides, side);

        if (u * cos(turn) + v * sin(turn) > ward.apothem + out) {
            return false;
        }
    }

    return true;
}

/**
 * The barbican's corners ([[u, v], ...], metres, its walls' outer faces): out in front of the
 * outer gate, from just inside the outer wall's face to its far end.
 */
export function barbicanOf(citadel) {
    const [outer] = citadel.wards;
    const { long, wide, thick } = CITADEL.barbican;
    const half = wide / 2 + thick;

    return [
        [-half, outer.apothem - 0.5],
        [half, outer.apothem - 0.5],
        [half, outer.apothem + long],
        [-half, outer.apothem + long],
    ];
}

/** Where the outer gate's towers stand ([[u, v], ...], metres), either side of it, on the outer wall's face. */
export function gateTowersOf(citadel) {
    const [outer] = citadel.wards;
    const { wide, tower } = CITADEL.gate;

    return [-1, 1].map((side) => [side * (wide / 2 + tower), outer.apothem]);
}

/**
 * Whether a point ([u, v], metres) is a citadel's (or within `out` metres of it): inside its
 * outer ward's walls, under one of its outer towers or the outer gate's, or in its barbican.
 */
export function insideCitadel(citadel, [u, v], out = 0) {
    const [outer] = citadel.wards;
    const [[u0, v0], , [u1, v1]] = barbicanOf(citadel);

    return (
        insideWard(citadel, outer, [u, v], out) ||
        towersOf(citadel, outer).some(([tu, tv]) => hypot(u - tu, v - tv) <= outer.tower + out) ||
        gateTowersOf(citadel).some(([tu, tv]) => hypot(u - tu, v - tv) <= CITADEL.gate.tower + out) ||
        (u >= u0 - out && u <= u1 + out && v >= v0 - out && v <= v1 + out)
    );
}

/**
 * A citadel's outline ([[u, v], ...], metres, going round): round its outer towers `out` metres
 * past them, and out round its barbican; all it stands on inside it.
 */
export function outlineOf(citadel, out = 0) {
    const [outer] = citadel.wards;
    const corners = cornersOf(citadel, outer, -(CITADEL.project * outer.tower + outer.tower + out));
    const [, , [u1, v1]] = barbicanOf(citadel);
    const reach = CITADEL.gate.tower + CITADEL.gate.wide / 2 + CITADEL.gate.tower;

    // (Its first side, the front, between the last corner and the first: round the barbican and
    // the gate's towers)
    return [...corners, [Math.max(u1, reach) + out, outer.apothem], [u1 + out, v1 + out], [-u1 - out, v1 + out], [-Math.max(u1, reach) - out, outer.apothem]];
}

/**
 * What's built of a citadel, laid out (layoutCitadel's), each at `[u, v]` (metres from its middle)
 * and turned `turn` (radians: the way its outside faces, as sideTurn's), standing on its ward's
 * terrace `rise` metres over the outer ward and reaching `drop` metres below it (down the face of
 * the terrace under it, and into the ground): { part ("wall", "tower", "stair", "barbican",
 * "range", "hall", "chapel" or "keep"), ward, ... }.
 *
 * - A wall from tower to tower along each side (`length` between their middles, `high`, `thick`,
 *   `crown`; `gate` if its ward's gate is in it, and the gate's measures: twin towers at the outer
 *   gate, a gatehouse over the others).
 * - A tower at each corner (`radius`, `high` over its terrace, `top`, `spire`, `crown`).
 * - A stair up to each gate but the outer's, against the face of the wall it's in, on the terrace
 *   below (`climb` metres up), doubling back on itself (its first flight away from the gate the
 *   way the way in winds, `way`).
 * - The barbican in front of the outer gate (`long`, `wide`, `high`, `thick`, `turret`; its way in
 *   through its side, `way`).
 * - A range of buildings along the inside of some walls (`length`, `deep`, `eaves`); the great
 *   hall and the chapel (its `apse`, `fleche`) in the inner close.
 * - The great keep in the inner ward.
 */
export function citadelParts(citadel) {
    const { wards } = citadel;
    const parts = [];
    const foot = 1.5;

    for (const [k, ward] of wards.entries()) {
        const { sides } = ward;
        const half = PI / sides;
        const below = k ? wards[k - 1].rise : ward.rise;
        const drop = ward.rise - below + foot;
        const mid = ward.apothem - ward.thick / 2;
        const towers = towersOf(citadel, ward);
        const length = 2 * mid * (sin(half) / cos(half));

        for (let side = 0; side < sides; side++) {
            const turn = sideTurn(sides, side);
            const gate = side === ward.gate ? { ...CITADEL.gate, twin: k === 0 } : null;

            parts.push({ part: "wall", ward: k, side, at: [cos(turn) * mid, sin(turn) * mid], turn, rise: ward.rise, drop, length, high: ward.wall, thick: ward.thick, crown: ward.crown, gate });
            parts.push({ part: "tower", ward: k, side, at: towers[side], turn: turn + half, rise: ward.rise, drop, radius: ward.tower, high: ward.wall + ward.over, top: ward.top, spire: ward.spire, crown: ward.crown });
        }

        // (Up to its gate from the terrace below, against its wall's face)
        if (k) {
            const turn = sideTurn(sides, ward.gate);
            const out = ward.apothem;

            parts.push({ part: "stair", ward: k, side: ward.gate, at: [cos(turn) * out, sin(turn) * out], turn, rise: below, drop: foot, climb: ward.rise - below, way: citadel.way });
        }
    }

    // (The barbican, out in front of the outer gate, down the hill's side)
    const [outer] = wards;
    const { barbican } = CITADEL;

    parts.push({ part: "barbican", ward: 0, at: [0, outer.apothem], turn: PI / 2, rise: 0, drop: CITADEL.hill.raise + foot, long: barbican.long, wide: barbican.wide, high: barbican.wall, thick: barbican.thick, turret: barbican.turret, way: citadel.way });

    for (const range of citadel.ranges) {
        const ward = wards[range.ward];
        const turn = sideTurn(ward.sides, range.side);
        const length = 2 * (ward.apothem - ward.thick) * (sin(PI / ward.sides) / cos(PI / ward.sides));
        const inset = ward.apothem - ward.thick - range.deep / 2;
        // (Along its side from `from` to `to` of its length, east end first)
        const along = (range.from + range.to) / 2 - 0.5;
        const [ax, ay] = [-sin(turn), cos(turn)];

        parts.push({
            part: range.kind,
            ward: range.ward,
            side: range.side,
            at: [cos(turn) * inset - ax * along * length, sin(turn) * inset - ay * along * length],
            turn,
            rise: ward.rise,
            drop: foot,
            length: (range.to - range.from) * length,
            deep: range.deep,
            eaves: range.eaves,
            ...(range.kind === "chapel" ? { apse: range.apse, fleche: range.fleche } : {}),
        });
    }

    const inner = wards.at(-1);

    parts.push({ part: "keep", ward: wards.length - 1, rise: inner.rise, drop: foot, ...citadel.keep });

    return parts;
}

/**
 * How high a citadel's outer ward stands (metres): the land under it on average (on a lattice 12 m
 * apart), raised CITADEL.hill.raise, to the ground's step. Its middle at (x, y), turned to
 * `facing` (as sites.js turns it).
 */
export function citadelLevel(plan, citadel, x, y, facing) {
    const [outer] = citadel.wards;
    const [c, s] = [cos(facing), sin(facing)];
    let [sum, n] = [0, 0];

    for (let v = -outer.apothem; v <= outer.apothem; v += 12) {
        for (let u = -outer.apothem; u <= outer.apothem; u += 12) {
            if (insideWard(citadel, outer, [u, v])) {
                const [px, py] = [x + u * c + v * s, y - u * s + v * c];

                sum += heightAt(plan, Math.min(WORLD_SIZE - 1, Math.max(0, px)), Math.min(WORLD_SIZE - 1, Math.max(0, py)));
                n++;
            }
        }
    }

    return Math.round((sum / n + CITADEL.hill.raise) / HEIGHT_STEP) * HEIGHT_STEP;
}
