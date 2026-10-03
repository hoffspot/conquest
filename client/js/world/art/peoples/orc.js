// The orcs' buildings: hide and timber heaped on battered basalt behind stakes, after the Viking
// longhouses of Trelleborg (bow-sided, their roofs like upturned boats), the steppe's felt tents
// and the Mongol ger, Scotland's brochs and the basalt town of Umm el-Jimal; everything built a
// quarter bigger than a human's (orcs stand a head taller), coarse, leaning, lashed together,
// and every outline broken by spikes, tusks and trophies.
//
// A clan's longhouse stands on a basalt plinth leaning in as it rises, its walls of upright
// planks bowing out along its length, under a hide roof on ribs sweeping up from both ends to a
// ridge crowned with iron spikes, tusks crossed at its ends and buttress posts leaning against
// its sides. Round huts have a ring of basalt under a drum of hide and a cone with a crown ring;
// the volcanic hills' houses are basalt blocks with flat slab roofs entered from above; the poor
// live in hide tents. The richer the clan, the more iron: riveted plates on roofs, iron spikes.

import { material } from "../engine/materials.js";
import { COLOURS } from "../engine/painters.js";
import { add3, inset, Solid, times } from "../engine/solid.js";
import { band, bandedWalls, CELL, circle, lens, m, pole, post, randomFor, southSide, spike, stake, wallPoint, weathering } from "./kit.js";

const ORC = 1.25;

const WASHES = ["hide", "hide-dark", "mud-red"];

export function toned(solid, random, eaves = [], facing = 0) {
    solid.tone = weathering({ seed: random.int(0, 1e6), eaves, facing, washes: WASHES, tint: [random.range(0.94, 1.05), random.range(0.93, 1.03), random.range(0.92, 1.02)], dirt: 0.42, mottle: ["hide", "hide-dark", "thatch-grey", "plates"] });
}

/**
 * A skull: a beast's (a bull's, a boar's) with horns or tusks, or a great one's, at `at` ([x, y,
 * z]) facing `facing` (radians as characters face: 0 south), `size` across.
 */
export function skull(solid, [x, y, z], facing, size, { horns = true, name = "bone" } = {}) {
    const [dx, dz] = [Math.sin(facing), Math.cos(facing)];
    const bone = material(name);

    solid.lathe(x, z, [[0, y - size * 0.4], [size * 0.42, y - size * 0.25], [size * 0.5, y], [size * 0.4, y + size * 0.3], [0, y + size * 0.42]], bone, { segments: 7 });

    // (The snout, forward and down; the eyes' holes)
    const snout = [x + dx * size * 0.55, y - size * 0.2, z + dz * size * 0.55];

    solid.tube([[x + dx * size * 0.2, y - size * 0.05, z + dz * size * 0.2], snout], [size * 0.28, size * 0.17], bone, { sides: 5, caps: true });

    for (const side of [-1, 1]) {
        const [ex, ez] = [x + dx * size * 0.42 + dz * side * size * 0.2, z + dz * size * 0.42 - dx * side * size * 0.2];

        solid.box(ex - size * 0.07, y + size * 0.02, ez - size * 0.07, ex + size * 0.07, y + size * 0.14, ez + size * 0.07, material("black"));

        if (horns) {
            const root = [x + dz * side * size * 0.35, y + size * 0.15, z - dx * side * size * 0.35];

            spike(solid, root, [dz * side, 0.5, -dx * side], size * 1.1, size * 0.12, name, { sides: 5, bend: [dx * 0.3, 1.2, dz * 0.3] });
        }
    }
}

/** A tusk: a curving spike of bone from `at` along `way`, bending up. */
export function tusk(solid, at, way, length, { up = [0, 1, 0], r = null } = {}) {
    spike(solid, at, way, length, r ?? length * 0.1, "bone", { sides: 5, bend: up });
}

/**
 * A horse-tail pole (a war standard): a pole standing on (x, y, z), `height` tall, a ring and a
 * spray of black (or red) hair hanging from its head.
 */
export function standard(solid, x, y, z, height, { hair = "black", random = null } = {}) {
    post(solid, x, y, z, height, m(0.07), "timber", { sides: 5 });

    const head = y + height;

    solid.lathe(x, z, [[m(0.3), head - m(0.1)], [m(0.34), head], [m(0.3), head + m(0.08)], [0, head + m(0.12)]], material("iron"), { segments: 8 });
    spike(solid, [x, head + m(0.1), z], [0, 1, 0], m(0.6), m(0.06), "iron");

    for (let k = 0; k < 9; k++) {
        const a = (k * Math.PI * 2) / 9 + (random ? random.range(-0.2, 0.2) : 0);
        const [cx, cz] = [x + Math.cos(a) * m(0.28), z + Math.sin(a) * m(0.28)];

        solid.tube([[cx, head - m(0.05), cz], [cx + Math.cos(a) * m(0.15), head - m(0.9), cz + Math.sin(a) * m(0.15)], [cx + Math.cos(a) * m(0.2), head - m(1.7), cz + Math.sin(a) * m(0.2)]], [m(0.07), m(0.06), 0], material(hair), { sides: 3 });
    }
}

/**
 * A war banner: a pole standing on (x, y, z) with a crossbar, a long ragged cloth of red (or
 * black) hanging from it, a skull on its head.
 */
export function warBanner(solid, x, y, z, height, { cloth = "war-red", facing = 0, width = m(0.9), drop = m(2.4) } = {}) {
    const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
    const head = y + height;

    post(solid, x, y, z, height + m(0.2), m(0.08), "timber", { sides: 5 });
    pole(solid, [x - ax * width * 0.6, head, z - az * width * 0.6], [x + ax * width * 0.6, head, z + az * width * 0.6], m(0.05), "timber", { sides: 4 });

    // (Its cloth, its foot torn in teeth, a black hand painted on it, swinging in the breeze:
    // world/cloth.js)
    const out = [Math.sin(facing), 0, Math.cos(facing)];

    (solid.cloth ??= []).push({ at: [x + out[0] * m(0.06), head, z + out[2] * m(0.06)], out, width, drop, kind: "hang", look: "ragged", colour: COLOURS[cloth] });
    skull(solid, [x, head + m(0.45), z], facing, m(0.35), { horns: true });
}

// --- Houses ---

/**
 * A clan's longhouse along x, x0..x1, its plan a lens `middle` wide in the middle and `ends` at
 * its ends round z = cz: a battered basalt plinth, bowed walls of upright planks, a hide roof on
 * ribs like an upturned boat, iron spikes along its ridge and tusks crossed at its ends,
 * buttress posts leaning against its sides, a porch over its door in the middle of its south
 * side (or its door in its east end, `door: "end"`). Returns its ridge.
 */
export function longhouse(solid, x0, x1, cz, { middle, ends = middle * 0.72, wall = m(2.2 * ORC), ridge = m(8), plinth = m(0.8), random, wealth = 0.5, walls = "planks-dark", roof = "hide", door = "side", doorway = { width: m(1.6), height: m(2.6) } }) {
    const length = x1 - x0;
    const cx = (x0 + x1) / 2;
    const count = Math.max(6, Math.round(length / m(2.2)));
    const plan = lens(cx, cz, length, middle, ends, count);
    const outer = inset(plan, -m(0.35));

    // The plinth, basalt, leaning in
    solid.extrude(outer, 0, plinth, material("basalt"), { batter: m(0.2), top: material("basalt") });

    // The walls: the side facing south gets the door (in its middle), the east end perhaps
    const sides = plan.length;
    const south = Math.floor(count / 2);
    const openings = {};
    const lengthOf = (k) => Math.hypot(plan[(k + 1) % sides][0] - plan[k][0], plan[(k + 1) % sides][1] - plan[k][1]);

    if (door === "side") {
        openings[south] = [{ u0: lengthOf(south) / 2 - doorway.width / 2, u1: lengthOf(south) / 2 + doorway.width / 2, v0: 0, v1: doorway.height, depth: m(0.3), back: material(random.pick(["war-red", "rust", "black"])), sides: material("timber") }];
    }

    // (Few openings: a shuttered hole or two in the sides)
    for (const k of [1, count - 2, count + 2, 2 * count - 1]) {
        if (k !== south && k < sides && random.chance(0.5) && lengthOf(k) > m(1)) {
            openings[k] = [{ u0: lengthOf(k) / 2 - m(0.25), u1: lengthOf(k) / 2 + m(0.25), v0: wall - m(1.1), v1: wall - m(0.5), depth: m(0.2), back: material("shadow") }];
        }
    }

    const faces = solid.walls(plan, plinth, wall, openings, material(walls));

    // Posts along the walls (the frame), and buttress posts leaning against them outside
    for (const [k, face] of faces.entries()) {
        const at = wallPoint(face);

        if (face.length > m(1.2) && !(openings[k] && k === south)) {
            solid.member(at(face.length / 2, 0), at(face.length / 2, wall), face.out, m(0.28), m(0.12), material("timber"));
        }

        if (k % 2 === 0 && k !== south && face.length > m(1)) {
            const foot = at(face.length / 2, -plinth, m(1.4));
            const head = at(face.length / 2, wall - m(0.2), m(0.1));

            pole(solid, [foot[0], 0, foot[2]], head, m(0.13), "timber", { sides: 5 });
        }
    }

    // The roof: cross-sections along its length, each a pointed arch from its eaves (past the
    // walls) up to its ridge, its ends hipped down to the eaves
    const eaves = plinth + wall - m(0.15);
    const overhang = m(0.7);
    const sections = 14;
    const hip = 0.2;
    const width = (s) => (ends + (middle - ends) * Math.sin(Math.PI * s)) / 2 + overhang;
    const rise = (s) => eaves + (ridge - eaves) * Math.min(1, Math.min(s, 1 - s) / hip) ** 0.55 - m(0.25) * Math.sin(Math.PI * s);
    const arch = (s) => {
        const [x, half, top] = [x0 - overhang * 0.6 + s * (length + overhang * 1.2), width(s), rise(s)];

        return Array.from({ length: 7 }, (_, i) => {
            const t = i / 6;
            const across = Math.cos(Math.PI * t);
            // (Nearly straight up from its eaves to the ridge, swelling a little)
            const up = 1 - Math.abs(across) ** 1.15;

            return [x, eaves - m(0.35) * Math.abs(across) + (top - eaves) * up, cz + across * half];
        });
    };
    const rings = Array.from({ length: sections + 1 }, (_, k) => arch(k / sections));

    solid.loft(rings, material(roof), { closed: false });
    // (The underside, seen past the eaves)
    solid.loft(rings.map((ring) => ring.map(([x, y, z]) => [x, y - m(0.12), z])), material("hide-dark"), { closed: false, out: (p) => [0, -1, (cz - p[2]) * 0.2] });

    // Its ribs over the hide, and lacing between them
    for (let k = 1; k < sections; k++) {
        solid.tube(rings[k].map(([x, y, z]) => [x, y + m(0.08), z]), m(0.09), material("timber"), { sides: 4 });
    }

    // The ridge: a pole along it, spikes along it (iron on a richer clan's), a smoke hood
    const ridgeLine = rings.map((ring) => ring[3]);

    solid.tube(ridgeLine.map(([x, y, z]) => [x, y + m(0.12), z]), m(0.14), material(wealth > 0.6 ? "iron" : "timber"), { sides: 5 });

    for (let k = 2; k < sections - 1; k += wealth > 0.6 ? 1 : 2) {
        const [x, y, z] = ridgeLine[k];

        spike(solid, [x, y + m(0.2), z], [0, 1, 0], m(0.7), m(0.09), wealth > 0.6 ? "iron" : "bone");
    }

    const [hx, hy, hz] = ridgeLine[Math.round(sections * 0.35)];

    solid.box(hx - m(0.6), hy, hz - m(0.5), hx + m(0.6), hy + m(0.6), hz + m(0.5), material("hide-dark"));
    // (The hearth's smoke rising from under its hood: world/smoke.js)
    (solid.smoke ??= []).push([hx, hy + m(0.65), hz, 1]);

    // Tusks crossed at both ends, and a skull
    for (const [s, sign] of [[0, -1], [1, 1]]) {
        const [x, y, z] = rise(s) > 0 ? arch(s)[3] : [0, 0, 0];

        for (const side of [-1, 1]) {
            tusk(solid, [x, y - m(0.3), z + side * m(0.4)], [sign * 0.6, 0.7, -side * 0.5], m(2.4), { up: [sign * 0.4, 0.6, side * 0.8] });
        }

        skull(solid, [x + sign * m(0.3), y - m(1.1), z], sign > 0 ? Math.PI / 2 : -Math.PI / 2, m(0.55));
    }

    // Iron plates on a rich clan's roof
    if (wealth > 0.75) {
        for (let k = 3; k < sections - 3; k += 3) {
            const ring = rings[k];
            const next = rings[k + 1];

            for (const i of [1, 4]) {
                solid.facing([ring[i], ring[i + 1], next[i + 1], next[i]].map(([x, y, z]) => [x, y + m(0.05), z]), [0, 1, (i < 3 ? 1 : -1) * 0.5], material("plates"));
            }
        }
    }

    // The porch before the door, out past the eaves: two posts and a gabled hide roof rising
    // into the main one, a skull on its gable
    if (door === "side") {
        const face = faces[south];
        const at = wallPoint(face);
        const mid = face.length / 2;
        const reach = m(2.4);
        const [a, b] = [at(mid - m(1.4), 0, reach), at(mid + m(1.4), 0, reach)];
        const [low, high] = [wall + m(0.2), wall + m(1.5)];

        for (const p of [a, b]) {
            post(solid, p[0], plinth, p[2], low, m(0.13), "timber", { sides: 5 });
        }

        const lift = ([x, y, z]) => [x, y + plinth, z];
        const [l0, l1, r0, r1, ridge0, ridge1] = [at(mid - m(1.7), low, reach + m(0.3)), at(mid - m(1.7), low, -m(0.5)), at(mid + m(1.7), low, reach + m(0.3)), at(mid + m(1.7), low, -m(0.5)), at(mid, high, reach + m(0.3)), at(mid, high + m(0.3), -m(0.5))].map(lift);

        for (const [slope, way] of [[[l0, l1, ridge1, ridge0], -1], [[r0, r1, ridge1, ridge0], 1]]) {
            solid.facing(slope, [way * face.across[0], 1, way * face.across[2]], material(roof));
            solid.facing(slope, [0, -1, 0], material("hide-dark"));
        }

        solid.facing([l0, r0, ridge0], face.out, material("planks-dark"));
        pole(solid, ridge0, ridge1, m(0.1), "timber", { sides: 4 });
        skull(solid, add3(ridge0, [face.out[0] * m(0.3), -m(0.45), face.out[2] * m(0.3)]), 0, m(0.5));

        // (Steps down off the plinth)
        solid.box(a[0] - m(0.2), 0, a[2] - m(0.8), b[0] + m(0.2), plinth * 0.5, a[2] + m(0.4), material("basalt"));
    }

    return ridge;
}

/**
 * A round hut: a ring of basalt, a drum of hide over it, a cone of hide on rafters to a crown
 * ring (a smoke hole), tusks or ribs pointing down round its eaves, a painted door.
 */
export function roundHut(solid, cx, cz, { r = m(3.5), random, wealth = 0.5, facing = 0 }) {
    const count = 14;
    const phase = southSide(count) - facing;
    const outline = circle(cx, cz, r, count, phase);
    const side = Math.hypot(outline[1][0] - outline[0][0], outline[1][1] - outline[0][1]);
    const stone = m(1.2);
    const drum = m(1.5);

    // A ring of basalt under a drum of hide, the door through both
    solid.extrude(inset(outline, -m(0.3)), 0, m(0.2), material("basalt"));
    bandedWalls(solid, outline, m(0.2), [{ height: stone - m(0.2), name: "basalt" }, { height: drum, name: "hide" }], { 0: [{ u0: side / 2 - m(0.65), u1: side / 2 + m(0.65), v0: 0, v1: m(2.2), depth: m(0.35), back: material(random.pick(["war-red", "rust"])), sides: material("timber") }] }, { lean: 0.02 });

    const [dx, dz] = [Math.sin(facing), Math.cos(facing)];

    const eaves = stone + drum;
    const reach = r + m(0.45);
    const peak = eaves + reach * 0.95;
    const crown = m(0.55);

    solid.lathe(cx, cz, [[reach, eaves - m(0.25)], [reach * 0.6, eaves + (peak - eaves) * 0.42], [crown, peak - m(0.2)], [crown, peak]], material("hide"), { segments: count });
    solid.lathe(cx, cz, [[crown, peak], [crown * 0.8, peak + m(0.3)], [0, peak + m(0.3)]], material("hide-dark"), { segments: 8 });

    // Rafter ends poking through at the crown, and ribs or tusks round the eaves
    for (let k = 0; k < 7; k++) {
        const a = (k * Math.PI * 2) / 7 + 0.2;
        const [ox, oz] = [Math.cos(a), Math.sin(a)];

        pole(solid, [cx + ox * crown * 0.8, peak - m(0.3), cz + oz * crown * 0.8], [cx + ox * crown * 1.6, peak + m(0.9), cz + oz * crown * 1.6], m(0.06), "timber", { sides: 4 });
    }

    for (let k = 0; k < (wealth > 0.5 ? 10 : 6); k++) {
        const a = (k * Math.PI * 2) / (wealth > 0.5 ? 10 : 6) + 0.1;
        const [ox, oz] = [Math.cos(a), Math.sin(a)];

        tusk(solid, [cx + ox * reach * 0.92, eaves - m(0.05), cz + oz * reach * 0.92], [ox, -0.25, oz], m(0.9), { up: [ox * 0.2, -0.6, oz * 0.2] });
    }

    skull(solid, [cx + dx * (r + m(0.3)), m(2.5), cz + dz * (r + m(0.3))], facing, m(0.45));

    return peak;
}

/**
 * A basalt block house of the volcanic hills: rough-cut walls, a flat roof of slabs on corbel
 * courses stepping out, a hatch and a ladder on the roof (the way in is from above), a low door,
 * a skull over its lintel.
 */
export function blockHouse(solid, x0, z0, x1, z1, { random, wall = m(2.9), wealth = 0.5 }) {
    const outline = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const width = x1 - x0;
    const door = { u0: width / 2 - m(0.7), u1: width / 2 + m(0.7), v0: 0, v1: m(2.3), depth: m(0.35), back: material("planks-dark") };

    const faces = solid.walls(outline, 0, wall, { 2: [door], 0: random.chance(0.5) ? [{ u0: width / 2 - m(0.25), u1: width / 2 + m(0.25), v0: m(1.8), v1: m(2.3), depth: m(0.35), back: material("shadow") }] : [] }, material("basalt"), { lean: 0.04 });
    const top = inset(outline, 0.04 * wall);

    // (Corbels stepping out under the slabs)
    solid.extrude(inset(top, -m(0.15)), wall, wall + m(0.25), material("basalt"));
    solid.extrude(inset(top, -m(0.35)), wall + m(0.25), wall + m(0.5), material("rock-dark"));

    // The hatch, and a ladder up to it
    const [hx, hz] = [x0 + width * 0.3, (z0 + z1) / 2];

    solid.box(hx - m(0.5), wall + m(0.5), hz - m(0.5), hx + m(0.5), wall + m(0.62), hz + m(0.5), material("planks-dark"));
    pole(solid, [x1 + m(0.3), 0, z1 - m(0.8)], [x1 - m(0.1), wall + m(1.2), z1 - m(0.8)], m(0.06), "timber", { sides: 4 });
    pole(solid, [x1 + m(0.3), 0, z1 - m(1.4)], [x1 - m(0.1), wall + m(1.2), z1 - m(1.4)], m(0.06), "timber", { sides: 4 });

    for (let k = 1; k < 8; k++) {
        const y = (k * (wall + m(1))) / 8;
        const x = x1 + m(0.3) - (m(0.4) * y) / (wall + m(1.2));

        pole(solid, [x, y, z1 - m(0.8)], [x, y, z1 - m(1.4)], m(0.04), "timber", { sides: 4 });
    }

    const at = wallPoint(faces[2], { lean: 0.04 });

    solid.member(at(door.u0 - m(0.3), door.v1 + m(0.15)), at(door.u1 + m(0.3), door.v1 + m(0.15)), faces[2].out, m(0.35), m(0.25), material("rock-dark"));
    skull(solid, at(width / 2, door.v1 + m(0.7), m(0.3)), 0, m(0.45), { horns: wealth > 0.3 });

    // Spikes along the roof's edge on a warrior's house
    if (wealth > 0.4) {
        for (let x = x0 + m(0.5); x < x1 - m(0.3); x += m(1.1)) {
            spike(solid, [x, wall + m(0.5), z1 + m(0.2)], [0, 0.6, 0.8], m(0.8), m(0.08), wealth > 0.7 ? "iron" : "timber");
        }
    }

    return wall + m(0.5);
}

/** A hide tent: a cone of hides over poles poking out of its top, its door flap open. */
export function tent(solid, cx, cz, { r = m(2.2), height = m(3.6), random, facing = 0 }) {
    const door = Math.PI / 2 - facing;
    const gap = 0.45;

    solid.lathe(cx, cz, [[r, 0], [r * 0.55, height * 0.5], [m(0.15), height]], material(random.chance(0.5) ? "hide" : "hide-dark"), { segments: 11, from: door + gap / 2, to: door + Math.PI * 2 - gap / 2 });
    solid.lathe(cx, cz, [[r * 0.98, 0], [r * 0.5, height * 0.5], [m(0.1), height - m(0.1)]], material("shadow"), { segments: 3, from: door - gap / 2, to: door + gap / 2 });

    for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI * 2) / 6 + 0.3;

        pole(solid, [cx + Math.cos(a) * r * 0.98, 0, cz + Math.sin(a) * r * 0.98], [cx - Math.cos(a) * m(0.4), height + m(0.9), cz - Math.sin(a) * m(0.4)], m(0.05), "timber", { sides: 4 });
    }
}

/** A rack of hides drying, or of weapons: two posts and a bar, things hanging from it. */
export function rack(solid, x, z, { length = m(2.4), random, kind = "hides" }) {
    for (const dx of [-length / 2, length / 2]) {
        post(solid, x + dx, 0, z, m(2), m(0.07), "timber", { sides: 4 });
    }

    pole(solid, [x - length / 2, m(1.9), z], [x + length / 2, m(1.9), z], m(0.06), "timber", { sides: 4 });

    for (let k = 0; k < 3; k++) {
        const u = x - length / 2 + ((k + 0.5) * length) / 3;

        if (kind === "hides") {
            const hide = [[u - m(0.35), m(1.9), z], [u + m(0.35), m(1.9), z], [u + m(0.3), m(0.7), z + m(0.05)], [u - m(0.3), m(0.8), z + m(0.05)]];

            solid.face(hide, material(random.pick(["hide", "hide-dark", "fur"])), undefined, null);
            solid.face([...hide].reverse(), material("hide-dark"), undefined, null);
        } else {
            pole(solid, [u, 0, z + m(0.3)], [u, m(2.2), z + m(0.05)], m(0.04), "timber", { sides: 4 });
            spike(solid, [u, m(2.2), z + m(0.05)], [0, 1, -0.1], m(0.5), m(0.12), "iron", { sides: 4 });
        }
    }
}

/**
 * An orc's house on its lot: its `type` if asked (longhouse, roundhut, block, tent), or one to
 * suit the lot and the household (a building behind the houses is a tent or a rack of hides).
 */
export function house(piece) {
    const random = randomFor(piece);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const wealth = piece.wealth ?? random.range(0, 1);
    const long = Math.max(W, D) / Math.min(W, D);
    const type = piece.type ?? (piece.back ? random.pick(["tent", "tent", "roundhut"]) : long > 1.7 ? "longhouse" : Math.min(W, D) > m(8) ? random.pick(["roundhut", "longhouse", "block"]) : random.pick(["roundhut", "block", "tent"]));
    const solid = new Solid();

    toned(solid, random, [m(3.3)], piece.facing ?? 0);

    if (type === "longhouse") {
        // (Along the lot's longer side; turned if it's deeper than wide)
        const along = W >= D;
        const [length, across] = along ? [W, D] : [D, W];
        const inner = new Solid();

        inner.tone = solid.tone;
        longhouse(inner, m(1), length - m(1), across / 2 - m(0.3), { middle: Math.min(m(8), across - m(2.6)), random, wealth });

        const object = inner.toObject();

        if (!along) {
            // (Turned to run north to south, its door facing west... then its front round to
            // the south: the lot faces its street)
            object.rotation.y = -Math.PI / 2;
            object.position.set(W, 0, 0);
        }

        const group = solid.toObject();

        group.add(object);

        return group;
    }

    if (type === "roundhut") {
        roundHut(solid, W / 2, D / 2, { r: Math.min(m(4), Math.min(W, D) / 2 - m(1)), random, wealth });

        if (W > m(10)) {
            rack(solid, m(1.8), D - m(1), { random, length: m(2) });
        }
    } else if (type === "block") {
        blockHouse(solid, m(0.6), m(0.6), W - m(0.6), D - m(0.8), { random, wealth });
    } else {
        tent(solid, W / 2, D / 2, { r: Math.min(m(2.4), Math.min(W, D) / 2 - m(0.5)), random });

        if (random.chance(0.5)) {
            rack(solid, W / 2, D - m(0.5), { random, length: Math.min(m(2.4), W - m(1)), kind: random.pick(["hides", "weapons"]) });
        }
    }

    return solid.toObject();
}

/** What the building lab shows of the orcs' houses: each type, and its lot (plots). */
export const GALLERY = Object.freeze({
    houses: [["tent", 1.5, 1.5], ["roundhut", 2.2, 2.2], ["block", 2, 1.7], ["longhouse", 5.5, 2.4]],
});

export { band, stake, times, add3 };
