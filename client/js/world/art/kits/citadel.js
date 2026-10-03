// Hill citadels (core/setpieces/citadel.js; the terrain plan's M7i-4): each part of one built on its
// own, as a piece (core/sites.js lays them out, each turned the way its outside faces and stood
// on its ward's terrace, `base`). Its walls from tower to tower, standing on the battered
// retaining walls that hold up their terraces (the inner wards') or battered at their feet (the
// outer's), a string course where the terrace is, battlements along their tops (merlons a man's
// height, 2.1 m apart, on a parapet chest high), the inner wards' on a crown of machicolations:
// stone corbels under a parapet standing out over the wall's face, the gaps between them dark;
// arrow slits. The outer gate between twin round towers, its passage deep, its portcullis half
// raised, torches either side, a barbican out in front entered from its side; the inner gates
// under gatehouses rising over their walls, each up a stair that doubles back on itself against
// its terrace's face. Towers at the corners standing out from the walls, round, battered at the
// foot (down the terrace's face, a talus), topped with battlements (the outer ward's) or, over a
// crown of machicolations, a steep cone of slate (the inner wards', taller the higher: Saumur's).
// Lean-to ranges along the inside of the lower wards' walls; the great hall and the chapel round
// the inner close; and the great keep in its corner: machicolated, a bartizan on two corners, a
// needle tower on the other two rising far over everything under a tall spire, a flag at each
// point.
//
// Built in world pixels (five a metre), round the piece's middle: along x, out of its ward along
// +z, up from its terrace's level.

import { flagpole } from "../../cloth.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { torch } from "./torches.js";

const M = 5;
const m = (metres) => metres * M;

/**
 * How a citadel's built (metres): its battlements' merlons (wide, high, how far apart, how thick;
 * the parapet under them, how high); the batter at the foot of a wall or tower that stands on
 * level ground (how high it reaches, how far out at the bottom), and a retaining wall's (how far
 * out for each metre down: 1 in 6); how far a string course stands out, and how deep; its arrow
 * slits (wide, high); a crown of machicolations (each corbel's width, its lower course's height
 * and its upper's, how far out the parapet stands over them); a stair's width, each step's rise
 * and tread; a range's roof's rise (over half its depth), and the hall's and chapel's pitch,
 * steeper (55°).
 */
export const CITADEL_LOOK = Object.freeze({
    merlon: Object.freeze({ wide: 1.4, high: 1.8, pitch: 2.1, thick: 0.7, parapet: 1.1 }),
    batter: Object.freeze({ high: 3.5, out: 1, slope: 1 / 6 }),
    course: Object.freeze({ out: 0.2, deep: 0.35 }),
    slit: Object.freeze({ wide: 0.2, high: 1.6 }),
    crown: Object.freeze({ corbel: 0.5, low: 0.6, high: 0.9, out: 0.7 }),
    stair: Object.freeze({ wide: 3.5, rise: 0.18, tread: 0.36 }),
    lean: 0.9,
    steep: 1.43,
});

/** A citadel's part (a piece: core/sites.js), built round its middle. */
export function citadelPart(piece) {
    const solid = new Solid();
    const build = { wall: wallInto, tower: towerInto, stair: stairInto, barbican: barbicanInto, range: rangeInto, hall: hallInto, chapel: chapelInto, keep: keepInto }[piece.part];

    build?.(solid, piece);

    return solid.toObject();
}

// Battlements along a line (a to b, [x, z] pixels) at height y: merlons standing on a parapet
// `thick` deep, centred on the line
function battlements(solid, [ax, az], [bx, bz], y, stone, thick = CITADEL_LOOK.merlon.thick) {
    const { wide, high, pitch, parapet } = CITADEL_LOOK.merlon;
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.floor(length / m(pitch)));
    const angle = Math.atan2(bz - az, bx - ax);

    solid.turnedBox((ax + bx) / 2, (az + bz) / 2, length / 2, m(thick) / 2, y, y + m(parapet), angle, stone);

    for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;

        solid.turnedBox(ax + (bx - ax) * t, az + (bz - az) * t, m(wide) / 2, m(thick) / 2, y + m(parapet), y + m(parapet + high), angle, stone);
    }
}

// A crown of machicolations along a wall's top (x0 to x1 along x, its face at z = `face`, out
// towards +z; or turned a `quarter` turn round, or two, or three: a keep's other faces): corbels
// at the merlons' pitch in two courses, standing out more the higher, under a parapet standing out
// over them, the gaps between them dark (the holes to drop things through); battlements on it
function crownInto(solid, x0, x1, face, top, stone, quarter = 0) {
    const { corbel, low, high, out } = CITADEL_LOOK.crown;
    const { pitch, thick, parapet } = CITADEL_LOOK.merlon;
    const dark = material("stone-dark");
    const count = Math.max(1, Math.floor((x1 - x0) / m(pitch)));
    const turn = ([x, z]) => [[x, z], [z, -x], [-x, -z], [-z, x]][quarter];
    const box = (ax, y0, az, bx, y1, bz, look, options) => {
        const [[px, pz], [qx, qz]] = [turn([ax, az]), turn([bx, bz])];

        solid.box(Math.min(px, qx), y0, Math.min(pz, qz), Math.max(px, qx), y1, Math.max(pz, qz), look, options);
    };

    for (let k = 0; k < count; k++) {
        const x = x0 + ((k + 0.5) / count) * (x1 - x0);

        box(x - m(corbel / 2), top - m(low + high), face, x + m(corbel / 2), top - m(high), face + m(out / 2), dark);
        box(x - m(corbel / 2), top - m(high), face, x + m(corbel / 2), top, face + m(out), dark);
    }

    box(x0, top, face + m(out - thick), x1, top + m(parapet), face + m(out), stone, { under: material("shadow") });
    battlements(solid, turn([x0, face + m(out - thick / 2)]), turn([x1, face + m(out - thick / 2)]), top, stone);
}

// A ring of machicolations round a round top (radius r at (cx, cz)): corbels round it, a parapet
// standing out over them, its underside dark; battlements on it unless a roof's to go on it
// (`open` false)
function roundCrown(solid, cx, cz, r, top, stone, { open = true, segments = 16 } = {}) {
    const { corbel, low, high, out } = CITADEL_LOOK.crown;
    const dark = material("stone-dark");
    const count = Math.max(8, Math.round((2 * Math.PI * r) / m(CITADEL_LOOK.merlon.pitch)));

    for (let k = 0; k < count; k++) {
        const angle = ((k + 0.5) / count) * Math.PI * 2;
        const [c, s] = [Math.cos(angle), Math.sin(angle)];

        solid.turnedBox(cx + c * (r + m(out / 4)), cz + s * (r + m(out / 4)), m(out / 4), m(corbel / 2), top - m(low + high), top - m(high), angle, dark);
        solid.turnedBox(cx + c * (r + m(out / 2)), cz + s * (r + m(out / 2)), m(out / 2), m(corbel / 2), top - m(high), top, angle, dark);
    }

    solid.lathe(cx, cz, [[r, top], [r + m(out), top]], material("shadow"), { segments, smooth: false });
    solid.cylinder(cx, cz, top, top + m(CITADEL_LOOK.merlon.parapet), r + m(out), r + m(out), stone, { segments, capped: !open });

    if (open) {
        roundBattlements(solid, cx, cz, r + m(out), top + m(CITADEL_LOOK.merlon.parapet), stone);
    }
}

// Merlons round a round top (its parapet's outer edge `radius` round (cx, cz)), standing on it
function roundBattlements(solid, cx, cz, radius, y, stone) {
    const { wide, high, pitch, thick } = CITADEL_LOOK.merlon;
    const count = Math.max(6, Math.round((2 * Math.PI * radius) / m(pitch)));
    const at = radius - m(thick / 2);

    for (let k = 0; k < count; k++) {
        const angle = ((k + 0.5) / count) * Math.PI * 2;

        solid.turnedBox(cx + Math.cos(angle) * at, cz + Math.sin(angle) * at, m(thick) / 2, m(wide) / 2, y, y + m(high), angle, stone);
    }
}

// A battered face along x (x0 to x1): from its foot (y0, standing `out` past the face at z) up to
// y1 at the face
function batterInto(solid, x0, x1, z, y0, y1, out, dark) {
    solid.facing([[x0, y0, z + out], [x1, y0, z + out], [x1, y1, z], [x0, y1, z]], [0, out / (y1 - y0), 1], dark);
}

// A wall from tower to tower (along x, its outside +z): from below the terrace it stands on (down
// the face under it) to its wall-walk. Where it holds up a terrace, the retaining wall's face
// battered all the way down (1 in 6), else battered at its foot; a string course where its
// terrace is, and another under its wall-walk; battlements on its outer edge (on a crown of
// machicolations, the inner wards') and a lower parapet on its inner; slits along its face; a
// gate through it if its ward's gate is in it
function wallInto(solid, piece) {
    const stone = material("stone");
    const dark = material("stone-dark");
    const half = m(piece.length / 2 + 0.6);
    const [inner, outer] = [-m(piece.thick / 2), m(piece.thick / 2)];
    const [foot, top] = [-m(piece.drop), m(piece.high)];
    const gate = piece.gate;
    // (Its gate's house over the gate: as wide as the twin towers' outer edges, or its own)
    const house = gate ? m(gate.twin ? gate.wide / 2 + gate.tower : gate.house / 2) : 0;

    for (const [x0, x1] of gate ? [[-half, -house], [house, half]] : [[-half, half]]) {
        solid.box(x0, foot, inner, x1, top, outer, stone);
    }

    // Battered: a retaining wall all the way down from its terrace (a stair before its gate), or
    // a foot where it stands on level ground
    const retaining = piece.drop > 3;
    const [y1, out] = retaining ? [0, m(piece.drop * CITADEL_LOOK.batter.slope)] : [foot + Math.min(m(CITADEL_LOOK.batter.high), m(piece.drop) + m(CITADEL_LOOK.batter.high * 0.5)), m(CITADEL_LOOK.batter.out)];

    for (const [x0, x1] of gate && !retaining ? [[-half, -house], [house, half]] : [[-half, half]]) {
        batterInto(solid, x0, x1, outer, foot, y1, out, dark);
    }

    // A string course where its terrace is, and another under the wall-walk
    for (const y of [0, top - m(piece.crown ? 2.4 : 1.2)]) {
        if (y > foot + m(0.5)) {
            solid.box(-half, y - m(CITADEL_LOOK.course.deep), outer, half, y, outer + m(CITADEL_LOOK.course.out), dark);
        }
    }

    // Battlements on its outside, on a crown of machicolations or straight up from its face; and
    // a low parapet on its inside
    if (piece.crown) {
        crownInto(solid, -half, half, outer, top, stone);
    } else {
        battlements(solid, [-half, outer - m(CITADEL_LOOK.merlon.thick / 2)], [half, outer - m(CITADEL_LOOK.merlon.thick / 2)], top, stone);
    }

    solid.box(-half, top, inner, half, top + m(0.9), inner + m(0.45), stone);

    // Arrow slits along its face
    const shadow = material("shadow");

    solid.near(() => {
        for (let x = -half + m(2.5); x < half - m(2); x += m(3.2)) {
            if (Math.abs(x) > house + m(1.2)) {
                solid.box(x - m(CITADEL_LOOK.slit.wide / 2), top - m(4.5), outer, x + m(CITADEL_LOOK.slit.wide / 2), top - m(4.5 - CITADEL_LOOK.slit.high), outer + m(0.05), shadow);
            }
        }
    });

    if (gate) {
        gateInto(solid, piece, house, stone);
    }
}

// A gate through a wall (its middle at x = 0): its house over it (between twin round towers
// standing out from the wall, the outer gate's; or a gatehouse rising over the wall), as deep
// into its ward as `inward`; its passage through under a round arch, its portcullis half raised,
// a crown of machicolations along its front, torches either side
function gateInto(solid, piece, house, stone) {
    const { gate } = piece;
    const dark = material("stone-dark");
    const [inner, outer] = [-m(piece.thick / 2), m(piece.thick / 2)];
    const foot = -m(piece.drop);
    const r = m(gate.wide / 2);
    const spring = m(gate.high);
    const top = m(piece.high + (gate.twin ? gate.over - 1 : gate.rise));
    // (Its passage from inside its ward's wall to its front, between the twin towers' fronts)
    const [z0, z1] = [inner - m(gate.inward), gate.twin ? outer + m(2) : outer];

    for (const [x0, x1] of [[-house, -r], [r, house]]) {
        solid.box(x0, foot, z0, x1, top, z1, stone);
    }

    solid.box(-r, spring + r, z0, r, top, z1, stone);
    archInto(solid, r, spring, z0, z1, stone);
    solid.box(-r - m(0.3), foot, z0, r + m(0.3), 0, z1, dark);
    crownInto(solid, -house, house, z1, top, stone);
    battlements(solid, [house - m(0.35), z0], [house - m(0.35), z1], top, stone);
    battlements(solid, [-house + m(0.35), z1], [-house + m(0.35), z0], top, stone);
    battlements(solid, [-house, z0 + m(0.35)], [house, z0 + m(0.35)], top, stone);

    if (gate.twin) {
        const high = m(piece.high + gate.over);
        const tr = m(gate.tower);
        const shadow = material("shadow");

        for (const side of [-1, 1]) {
            const cx = side * m(gate.wide / 2 + gate.tower);

            solid.cylinder(cx, outer, foot, foot + m(4), tr + m(0.9), tr, dark, { segments: 18, capped: false });
            solid.cylinder(cx, outer, foot + m(4), high, tr, tr, stone, { segments: 18 });
            roundCrown(solid, cx, outer, tr, high, stone, { segments: 18 });
            solid.near(() => {
                for (let y = m(3); y < high - m(4); y += m(4)) {
                    solid.box(cx - m(CITADEL_LOOK.slit.wide / 2), y, outer + tr - m(0.05), cx + m(CITADEL_LOOK.slit.wide / 2), y + m(CITADEL_LOOK.slit.high), outer + tr + m(0.02), shadow);
                }
            });
        }
    }

    for (const side of [-1, 1]) {
        torch(solid, [side * (r + m(0.5)), m(2.6), z1 + m(0.05)], [0, 1]);
    }
}

// A round arch's underside through a wall (half-width `r`, springing at `spring`, from z0 to z1),
// its sides up to it, and its ring of dressed stones on the outer face; its portcullis behind it
function archInto(solid, r, spring, z0, z1, stone) {
    const steps = 8;
    const dressed = material("stone-warm");
    const at = (k) => [-Math.cos((k / steps) * Math.PI) * r, spring + Math.sin((k / steps) * Math.PI) * r];

    for (let k = 0; k < steps; k++) {
        const [[ax, ay], [bx, by]] = [at(k), at(k + 1)];

        solid.facing([[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]], [-(ax + bx) / 2, -((ay + by) / 2 - spring), 0], stone);

        // (Its face over the arch, up to where the wall above it starts)
        solid.facing([[ax, ay, z1], [bx, by, z1], [bx, spring + r, z1], [ax, spring + r, z1]], [0, 0, 1], stone);
        solid.facing([[bx, by, z0], [ax, ay, z0], [ax, spring + r, z0], [bx, spring + r, z0]], [0, 0, -1], stone);

        // (Its voussoirs, long and short in turn)
        const depth = m(k % 2 ? 0.55 : 0.75);
        const out = (x, y) => {
            const [dx, dy] = [x, y - spring];
            const length = Math.hypot(dx, dy) || 1;

            return [x + (dx / length) * depth, y + (dy / length) * depth];
        };
        const [[cx, cy], [dx, dy]] = [out(bx, by), out(ax, ay)];

        solid.facing([[ax, ay, z1 + m(0.08)], [bx, by, z1 + m(0.08)], [cx, cy, z1 + m(0.08)], [dx, dy, z1 + m(0.08)]], [0, 0, 1], dressed);
    }

    for (const side of [-1, 1]) {
        solid.facing([[side * r, 0, z0], [side * r, 0, z1], [side * r, spring, z1], [side * r, spring, z0]], [-side, 0, 0], stone);
    }

    // (Its portcullis, half raised, dark iron)
    const iron = material("iron");

    for (let x = -r + m(0.4); x < r; x += m(0.5)) {
        solid.box(x - m(0.05), spring - m(1.2), z1 - m(0.9), x + m(0.05), spring + r * 0.8, z1 - m(0.8), iron);
    }

    solid.box(-r, spring - m(1.2), z1 - m(0.92), r, spring - m(1.05), z1 - m(0.78), iron);
}

// A tower at a corner of a ward's walls: round, battered at its foot (down its terrace's face, a
// talus), slits up it, a string course where its terrace is; topped with battlements, or a crown
// of machicolations under a steep cone of slate, a flag on the tallest
function towerInto(solid, piece) {
    const stone = material("stone");
    const dark = material("stone-dark");
    const r = m(piece.radius);
    const [foot, top] = [-m(piece.drop), m(piece.high)];
    const [batter, out] = piece.drop > 3 ? [m(piece.drop), m(piece.drop * CITADEL_LOOK.batter.slope)] : [Math.min(m(CITADEL_LOOK.batter.high), m(piece.drop) + m(CITADEL_LOOK.batter.high * 0.5)), m(CITADEL_LOOK.batter.out)];

    solid.cylinder(0, 0, foot, foot + batter, r + out, r, dark, { segments: 18, capped: false });
    solid.cylinder(0, 0, foot + batter, top, r, r, stone, { segments: 18, capped: piece.top !== "cone" });
    solid.cylinder(0, 0, -m(CITADEL_LOOK.course.deep), 0, r + m(CITADEL_LOOK.course.out), r + m(CITADEL_LOOK.course.out), dark, { segments: 18, capped: false });

    // (Its slits: on its outside, up it)
    const shadow = material("shadow");

    solid.near(() => {
        for (let y = m(2.5); y < top - m(4); y += m(4)) {
            solid.box(-m(CITADEL_LOOK.slit.wide / 2), y, r - m(0.05), m(CITADEL_LOOK.slit.wide / 2), y + m(CITADEL_LOOK.slit.high), r + m(0.02), shadow);
        }
    });

    if (piece.top === "cone") {
        // (A crown of machicolations, then its cone over the parapet, its eaves out past it)
        const eaves = top + m(CITADEL_LOOK.merlon.parapet);
        const reach = r + m(CITADEL_LOOK.crown.out + 0.3);

        roundCrown(solid, 0, 0, r, top, stone, { open: false, segments: 18 });
        solid.cone(0, 0, eaves, reach * piece.spire, reach, material("slate"), 18);

        if (piece.spire >= 3) {
            flagpole(solid, [0, eaves + reach * piece.spire - m(0.3), 0], m(3), "human", { radius: m(0.08), length: m(2.6), drop: m(1) });
        }
    } else if (piece.crown) {
        roundCrown(solid, 0, 0, r, top, stone, { segments: 18 });
    } else {
        solid.cylinder(0, 0, top - m(0.4), top + m(CITADEL_LOOK.merlon.parapet), r + m(0.25), r + m(0.25), stone, { segments: 18 });
        roundBattlements(solid, 0, 0, r + m(0.25), top + m(CITADEL_LOOK.merlon.parapet), stone);
    }
}

// A stair up from the terrace below to a gate, against its wall's face (out along +z), doubling
// back on itself: its first flight along the outer lane, from beside the gate away from it (the
// way the way in winds, `way`), up half the climb to a landing; its second back along the lane
// against the wall, up to a landing before the gate. Each step built down into the ground, a
// parapet along each flight's open side and round the landings
function stairInto(solid, piece) {
    const stone = material("stone");
    const dark = material("stone-dark");
    const { wide, rise, tread } = CITADEL_LOOK.stair;
    const n = Math.max(2, Math.round(piece.climb / 2 / rise));
    const step = m(piece.climb / 2 / n);
    const [w, lane, run] = [piece.way, m(wide), m(tread)];
    const platform = m(2.6);
    const climb = m(piece.climb);
    const foot = -m(piece.drop);
    const top = m(0.9);
    // (Along x the way it goes, `a` to `b` pixels out from the gate's middle)
    const span = (a, b) => [Math.min(w * a, w * b), Math.max(w * a, w * b)];
    const landing = platform + (n - 1) * run;
    const [l0, l1] = span(landing, landing + lane);

    // (The landing before the gate, and the turn's)
    solid.box(-platform, foot, 0, platform, climb, lane, stone);
    solid.box(l0, foot, 0, l1, climb / 2, lane * 2, stone);

    for (let k = 0; k < n - 1; k++) {
        // (Down from the gate, the lane against the wall; and up from beside the gate, the outer)
        const [x0, x1] = span(platform + k * run, platform + (k + 1) * run);

        solid.box(x0, foot, 0, x1, climb - (k + 1) * step, lane, stone);
        solid.box(x0, foot, lane, x1, (k + 1) * step, lane * 2, stone);
    }

    // (Its parapets: down the upper flight's open side and up the lower's, round the turn's
    // landing, and round the gate's)
    solid.beam([w * platform, climb + top / 2, lane - m(0.25)], [w * landing, climb / 2 + top / 2, lane - m(0.25)], m(0.5), top, dark);
    solid.beam([w * platform, top / 2, lane * 2 - m(0.25)], [w * landing, climb / 2 + top / 2, lane * 2 - m(0.25)], m(0.5), top, dark);
    solid.box(l0, climb / 2, lane * 2 - m(0.5), l1, climb / 2 + top, lane * 2, dark);
    solid.box(w > 0 ? l1 - m(0.5) : l0, climb / 2, 0, w > 0 ? l1 : l0 + m(0.5), climb / 2 + top, lane * 2, dark);
    solid.box(-w * platform - m(0.25), climb, 0, -w * platform + m(0.25), climb + top, lane, dark);
    solid.box(-platform, climb, lane - m(0.5), platform, climb + top, lane, dark);
}

// The barbican out in front of the outer gate (out along +z): a walled passage, its walls going
// down the hill's side into the ground, battlements on them, a turret at each far corner; its
// way in through its side near its far end (the way in's side, `way`), torches either side
function barbicanInto(solid, piece) {
    const stone = material("stone");
    const dark = material("stone-dark");
    const [long, half, thick] = [m(piece.long), m(piece.wide / 2 + piece.thick), m(piece.thick)];
    const [foot, top] = [-m(piece.drop), m(piece.high)];
    const side = piece.way;
    // (Its way in: in its side, about as high as the hill's side is there: eased down from the
    // ward's level towards the land's, as the hill is, sites.js)
    const [d0, d1] = [long - m(2 + 4.6), long - m(2)];
    const t = Math.min(1, (d0 + d1) / 2 / m(40));
    const sill = -m(7) * t * t * (3 - 2 * t) - m(0.5);
    const head = sill + m(4.8);

    // (Its two sides, the way in through one; its far end)
    for (const s of [-1, 1]) {
        const [x0, x1] = s < 0 ? [-half, -half + thick] : [half - thick, half];
        const spans = s === side ? [[-m(0.5), d0], [d1, long]] : [[-m(0.5), long]];

        for (const [z0, z1] of spans) {
            solid.box(x0, foot, z0, x1, top, z1, stone);
        }

        battlements(solid, [s * (half - m(0.35)), -m(0.5)], [s * (half - m(0.35)), long], top, stone);
    }

    solid.box(-half, foot, long - thick, half, top, long, stone);
    battlements(solid, [-half, long - m(0.35)], [half, long - m(0.35)], top, stone);

    // (Over its way in, and under it; its sides)
    const [x0, x1] = side < 0 ? [-half, -half + thick] : [half - thick, half];

    solid.box(x0, head, d0, x1, top, d1, stone, { under: stone });
    solid.box(x0, foot, d0, x1, sill, d1, dark);

    for (const [z, out] of [[d0, 1], [d1, -1]]) {
        solid.facing([[x0, sill, z], [x1, sill, z], [x1, head, z], [x0, head, z]], [0, 0, out], stone);
    }

    torch(solid, [side * (half + m(0.05)), sill + m(2.6), d0 - m(0.5)], [side, 0]);
    torch(solid, [side * (half + m(0.05)), sill + m(2.6), d1 + m(0.5)], [side, 0]);

    // (Its turrets at its far corners, battered at their feet)
    const tr = m(piece.turret);
    const high = top + m(3);

    for (const s of [-1, 1]) {
        solid.cylinder(s * half, long, foot, sill, tr + m(0.8), tr, dark, { segments: 12, capped: false });
        solid.cylinder(s * half, long, sill, high, tr, tr, stone, { segments: 12 });
        solid.cylinder(s * half, long, high - m(0.4), high + m(CITADEL_LOOK.merlon.parapet), tr + m(0.25), tr + m(0.25), stone, { segments: 12 });
        roundBattlements(solid, s * half, long, tr + m(0.25), high + m(CITADEL_LOOK.merlon.parapet), stone);
    }
}

// A lean-to range of buildings along the inside of a wall (along x, the wall behind it at +z):
// stone walls under a slate roof sloping down from the wall, windows down its front, a door,
// chimneys up the wall
function rangeInto(solid, piece) {
    const stone = material("stone");
    const [half, deep] = [m(piece.length / 2), m(piece.deep / 2)];
    const eaves = m(piece.eaves);
    const rise = deep * CITADEL_LOOK.lean;
    const slate = material("slate");

    solid.box(-half, -m(piece.drop), -deep, half, eaves, deep, stone);
    solid.facing([[-half - m(0.3), eaves - m(0.1), -deep - m(0.5)], [half + m(0.3), eaves - m(0.1), -deep - m(0.5)], [half + m(0.3), eaves + rise, deep], [-half - m(0.3), eaves + rise, deep]], [0, deep * 2, -rise], slate);

    for (const s of [-1, 1]) {
        solid.facing([[s * half, eaves, -deep], [s * half, eaves, deep], [s * half, eaves + rise, deep]], [s, 0, 0], stone);
    }

    // (Windows down its front, upstairs and down; a door in the middle)
    const bays = Math.max(2, Math.floor(piece.length / 3.4));
    const leaded = material("leaded");

    for (let k = 0; k < bays; k++) {
        const x = -half + ((k + 0.5) / bays) * half * 2;

        if (Math.abs(x) > m(1.4)) {
            for (const y of [m(1.2), m(4.2)]) {
                solid.box(x - m(0.45), y, -deep - m(0.06), x + m(0.45), y + m(1.5), -deep, leaded);
            }
        }
    }

    solid.box(-m(0.8), 0, -deep - m(0.08), m(0.8), m(2.4), -deep, material("planks-dark"));

    // (Chimneys up the wall behind)
    for (const x of [-half * 0.6, half * 0.55]) {
        solid.box(x - m(0.6), eaves, deep - m(1.2), x + m(0.6), eaves + rise + m(1.4), deep, stone);
    }
}

// Buttresses along a front (x0 to x1, its face at z, facing -z), about `bay` pixels apart, up to
// `high`, their tops sloping back into the wall; where they stand (x)
function buttressesInto(solid, x0, x1, z, high, bay, stone) {
    const count = Math.max(1, Math.round((x1 - x0) / bay));
    const xs = [];

    for (let k = 0; k <= count; k++) {
        const x = x0 + (k / count) * (x1 - x0);

        xs.push(x);
        solid.box(x - m(0.45), 0, z - m(1.1), x + m(0.45), high - m(1.6), z, stone);
        solid.facing([[x - m(0.45), high - m(1.6), z - m(1.1)], [x + m(0.45), high - m(1.6), z - m(1.1)], [x + m(0.45), high, z], [x - m(0.45), high, z]], [0, 1.1, -1.6], stone);
    }

    return xs;
}

// The great hall along one side of the inner close (along x, the ward's wall behind it at +z):
// tall walls, buttresses down its front and tall pointed windows between them, a steep slate
// roof between coped gables; a louvre on its ridge over its hearth, a chimney stack behind, its
// door near one end under a porch
function hallInto(solid, piece) {
    const stone = material("stone");
    const dark = material("stone-dark");
    const slate = material("slate");
    const [half, deep] = [m(piece.length / 2), m(piece.deep / 2)];
    const eaves = m(piece.eaves);
    const pitch = (deep + m(0.5)) * CITADEL_LOOK.steep;

    solid.box(-half, -m(piece.drop), -deep, half, eaves, deep, stone);
    solid.box(-half - m(0.2), eaves - m(0.5), -deep - m(0.2), half + m(0.2), eaves, deep + m(0.2), dark);
    solid.roof(-half - m(0.4), -deep - m(0.5), half + m(0.4), deep + m(0.5), eaves, pitch, { ridge: "x", material: slate, gable: stone });

    for (const s of [-1, 1]) {
        for (const z of [-deep - m(0.5), deep + m(0.5)]) {
            solid.beam([s * (half + m(0.3)), eaves, z], [s * (half + m(0.3)), eaves + pitch, 0], m(0.6), m(0.4), dark);
        }
    }

    // (Buttresses down its front, and between them its tall windows, pointed; its door)
    const xs = buttressesInto(solid, -half + m(0.5), half - m(0.5), -deep, eaves - m(1), m(5), stone);
    const leaded = material("leaded");

    for (let k = 0; k < xs.length - 1; k++) {
        const x = (xs[k] + xs[k + 1]) / 2;

        if (k === 1) {
            solid.box(x - m(1.6), 0, -deep - m(2.4), x + m(1.6), m(4.2), -deep, stone);
            solid.roof(x - m(1.9), -deep - m(2.7), x + m(1.9), -deep, m(4.2), m(1.8), { ridge: "z", material: slate, gable: stone });
            solid.box(x - m(0.8), 0, -deep - m(2.46), x + m(0.8), m(2.8), -deep - m(2.4), material("planks-dark"));
            torch(solid, [x - m(1.2), m(3), -deep - m(2.45)], [0, -1]);
            continue;
        }

        solid.box(x - m(0.6), m(2.5), -deep - m(0.06), x + m(0.6), m(6.8), -deep, leaded);
        solid.facing([[x - m(0.6), m(6.8), -deep - m(0.06)], [x + m(0.6), m(6.8), -deep - m(0.06)], [x, m(7.6), -deep - m(0.06)]], [0, 0, -1], leaded);
    }

    // (A louvre on its ridge, and a chimney stack against the wall behind)
    solid.box(-m(1), eaves + pitch - m(0.4), -m(1), m(1), eaves + pitch + m(1.6), m(1), material("timber"));
    solid.pyramid(-m(1.3), -m(1.3), m(1.3), m(1.3), eaves + pitch + m(1.6), m(1.8), slate);
    solid.box(half * 0.5 - m(0.8), eaves, deep - m(1.4), half * 0.5 + m(0.8), eaves + pitch + m(1.5), deep + m(0.2), stone);
}

// The chapel along the other side of the inner close (along x, the ward's wall behind it at +z):
// its nave under a steep slate roof, buttresses and tall lancets down its front, its apse at one
// end (`apse`: which, along x) round under a half cone; a flèche on its ridge, slender, a cross on
// it; its door in its west gable under a round window, at the other end
function chapelInto(solid, piece) {
    const stone = material("stone");
    const dark = material("stone-dark");
    const slate = material("slate");
    const [half, deep] = [m(piece.length / 2), m(piece.deep / 2)];
    const eaves = m(piece.eaves);
    const pitch = (deep + m(0.4)) * CITADEL_LOOK.steep;
    const { apse } = piece;
    // (Its nave from its west end to where its apse begins, the apse round to its other end)
    const [w, e] = [-apse * half, apse * (half - deep)];
    const [x0, x1] = [Math.min(w, e), Math.max(w, e)];
    const round = { segments: 8, from: apse > 0 ? -Math.PI / 2 : Math.PI / 2, to: apse > 0 ? Math.PI / 2 : Math.PI * 1.5 };

    solid.box(x0, -m(piece.drop), -deep, x1, eaves, deep, stone);
    solid.roof(x0 - (apse > 0 ? m(0.3) : 0), -deep - m(0.4), x1 + (apse < 0 ? m(0.3) : 0), deep + m(0.4), eaves, pitch, { ridge: "x", material: slate, gable: stone });
    solid.lathe(e, 0, [[deep, -m(piece.drop)], [deep, eaves]], stone, round);
    solid.lathe(e, 0, [[deep + m(0.4), eaves], [0, eaves + pitch]], slate, { ...round, smooth: false });

    // (Buttresses and lancets down its front)
    const xs = buttressesInto(solid, x0 + m(0.5), x1 - m(0.5), -deep, eaves - m(0.8), m(4.5), stone);
    const leaded = material("leaded");

    for (let k = 0; k < xs.length - 1; k++) {
        const x = (xs[k] + xs[k + 1]) / 2;

        solid.box(x - m(0.4), m(2.2), -deep - m(0.06), x + m(0.4), m(6), -deep, leaded);
        solid.facing([[x - m(0.4), m(6), -deep - m(0.06)], [x + m(0.4), m(6), -deep - m(0.06)], [x, m(6.8), -deep - m(0.06)]], [0, 0, -1], leaded);
    }

    // (Its west door, a hood over it, and a round window over that)
    const out = -apse;
    const face = w + out * m(0.08);

    solid.facing([[face, 0, -m(1)], [face, 0, m(1)], [face, m(3.2), m(1)], [face, m(3.2), -m(1)]], [out, 0, 0], material("planks-dark"));
    solid.box(Math.min(w, w + out * m(0.4)), m(3.2), -m(1.4), Math.max(w, w + out * m(0.4)), m(3.6), m(1.4), dark);
    solid.facing(Array.from({ length: 8 }, (_, k) => [face, m(6.4) + Math.sin((k * Math.PI) / 4) * m(1.1), Math.cos((k * Math.PI) / 4) * m(1.1)]), [out, 0, 0], leaded);

    // (Its flèche over the middle of its nave: a slender lantern, a needle spire, a cross)
    const mx = (x0 + x1) / 2;
    const ridge = eaves + pitch;
    const tip = ridge + m(1.8 + piece.fleche);
    const iron = material("iron");

    solid.cylinder(mx, 0, ridge - m(1), ridge + m(1.8), m(0.8), m(0.8), material("timber"), { segments: 8 });
    solid.cone(mx, 0, ridge + m(1.8), m(piece.fleche), m(0.9), slate, 8);
    solid.box(mx - m(0.06), tip - m(0.3), -m(0.06), mx + m(0.06), tip + m(1), m(0.06), iron);
    solid.box(mx - m(0.06), tip + m(0.4), -m(0.4), mx + m(0.06), tip + m(0.55), m(0.4), iron);
}

// The great keep: a square tower on a battered plinth, string courses at each floor, tall
// windows up each face, a crown of machicolations round its top and a steep slate roof behind
// its battlements; a needle tower on two opposite corners rising far over it under a tall spire,
// a flag at each point, and a bartizan corbelled out from each of the other two under a cone;
// its door (towards the inner gate, +z) up a few steps, torches either side
function keepInto(solid, piece) {
    const stone = material("stone");
    const dark = material("stone-dark");
    const leaded = material("leaded");
    const slate = material("slate");
    const half = m(piece.size / 2);
    const top = m(piece.high);
    const foot = -m(piece.drop);
    const plinth = half + m(1.4);

    solid.extrude([[-plinth, plinth], [plinth, plinth], [plinth, -plinth], [-plinth, -plinth]], foot, m(4), dark, { batter: m(1.4) });
    solid.box(-half, m(4), -half, half, top, half, stone);

    // (A string course at each floor, and its windows, two to a face a floor)
    for (let y = m(8); y < top - m(4); y += m(6.5)) {
        solid.box(-half - m(0.2), y - m(0.3), -half - m(0.2), half + m(0.2), y, half + m(0.2), dark);

        for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            for (const t of [-0.25, 0.25]) {
                const [cx, cz] = [nx ? nx * half : t * half * 2, nz ? nz * half : t * half * 2];
                const [wx, wz] = [nx ? m(0.06) : m(0.55), nz ? m(0.06) : m(0.55)];

                solid.box(cx - wx, y + m(1.2), cz - wz, cx + wx, y + m(4.2), cz + wz, leaded);
            }
        }
    }

    // (Its crown of machicolations round its four faces, and its roof behind)
    for (let quarter = 0; quarter < 4; quarter++) {
        crownInto(solid, -half - m(0.7), half + m(0.7), half, top, stone, quarter);
    }

    solid.pyramid(-half + m(0.6), -half + m(0.6), half - m(0.6), half - m(0.6), top, half * 1.7, slate);

    // (Its needle towers on two opposite corners: a crown, a spire and a flag on each)
    const r = m(piece.needle);
    const high = top + m(piece.over);
    const eaves = high + m(CITADEL_LOOK.merlon.parapet);
    const reach = r + m(CITADEL_LOOK.crown.out + 0.3);

    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        const [cx, cz] = [sx * half, sz * half];

        solid.cylinder(cx, cz, m(4), high, r, r, stone, { segments: 12 });
        roundCrown(solid, cx, cz, r, high, stone, { open: false, segments: 12 });
        solid.cone(cx, cz, eaves, reach * piece.spire, reach, slate, 12);
        flagpole(solid, [cx, eaves + reach * piece.spire - m(0.3), cz], m(3.5), "human", { radius: m(0.08), length: m(3), drop: m(1.2) });
    }

    // (Its bartizans on the other two, corbelled out on a cone of stone, a little cone on each)
    const b = m(piece.bartizan);

    for (const [sx, sz] of [[1, -1], [-1, 1]]) {
        const [cx, cz] = [sx * (half + b * 0.4), sz * (half + b * 0.4)];

        solid.cylinder(cx, cz, top - m(2.6), top, m(0.2), b, dark, { segments: 10, capped: false });
        solid.cylinder(cx, cz, top, top + m(piece.turret), b, b, stone, { segments: 10 });
        solid.cone(cx, cz, top + m(piece.turret), b * 4, b + m(0.3), slate, 10);
    }

    // (Its door in a forebuilding out past its plinth, up a few steps)
    const front = plinth + m(0.4);

    solid.box(-m(2.4), foot, half, m(2.4), m(5), front, stone);
    solid.box(-m(2.7), m(5), half, m(2.7), m(5.5), front + m(0.3), dark);
    solid.box(-m(1.3), m(0.6), front, m(1.3), m(3.8), front + m(0.06), material("planks-dark"));
    solid.box(-m(2), foot, front, m(2), m(0.6), front + m(2.4), stone);
    torch(solid, [-m(1.9), m(3), front + m(0.06)], [0, 1]);
    torch(solid, [m(1.9), m(3), front + m(0.06)], [0, 1]);
}
