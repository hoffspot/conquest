// The cat folk's buildings: the mud architecture of the savannah, after the Sahel's (Djenné's
// toron and buttresses, Hausa parapets crowned with pinnacles), Kassena painted walls, round
// thatched huts, Dogon granaries and shelters, Great Zimbabwe's dry stone and the kasbah; each
// read through a cat's eyes: pinnacles in pairs like ears (a house without them is a poor one),
// sun discs on the peaks, flat roofs to bask on, and courts shaded by mats on forked poles.
//
// A household is a compound: a curving wall with a gatehouse (the zaure) on the lane, and round
// huts inside it with their doors on a court. Near a town's middle the compounds give way to
// Sahel town houses of two storeys, walls battered (leaning in as they rise), buttresses rising
// into pinnacles past the parapet, and rows of toron (the palm-wood sticks the plasterers climb
// on) bristling from every face. Everything is built as the human houses are (house.js: walls
// with their doors and windows let in, dressed, weathered), only in mud, straw and mats.

import { material } from "../engine/materials.js";
import { add3, inset, Solid, times } from "../engine/solid.js";
import {
    band,
    bandedWalls,
    CELL,
    circle,
    m,
    middleOf,
    pinnacle,
    pole,
    post,
    randomFor,
    roundedRect,
    southSide,
    squircle,
    thatchCone,
    wallPoint,
    weathering,
} from "./kit.js";

/** The mud a house is plastered with: most plain, some sun-bleached, some red laterite. */
const MUDS = ["mud", "mud", "mud", "mud-pale", "mud-red"];

// A dado's ground, and the colours of the triangles, zigzags and arcs painted on it (red
// laterite, white kaolin, black; ochre and indigo on the richest)
const PAINTS = [["mud-red", "kaolin", "black"], ["plaster-white", "laterite", "black"], ["mud-red", "kaolin", "ochre"], ["plaster-white", "indigo", "laterite"], ["mud-dark", "kaolin", "laterite"]];

// Which side of an outline faces most nearly `way` ([dx, dz])
function sideFacing(outline, [wx, wz]) {
    const [mx, mz] = middleOf(outline);
    let best = 0;
    let score = -Infinity;

    for (let k = 0; k < outline.length; k++) {
        const [[ax, az], [bx, bz]] = [outline[k], outline[(k + 1) % outline.length]];
        const [ox, oz] = [(ax + bx) / 2 - mx, (az + bz) / 2 - mz];
        const along = Math.hypot(bx - ax, bz - az);
        const long = Math.hypot(ox, oz) || 1;
        const own = ((ox * wx + oz * wz) / long) * 4 + along / m(4);

        if (own > score) {
            [best, score] = [k, own];
        }
    }

    return best;
}

const lengthOf = (outline, k) => Math.hypot(outline[(k + 1) % outline.length][0] - outline[k][0], outline[(k + 1) % outline.length][1] - outline[k][1]);

/**
 * A pair of pinnacles like a cat's ears, standing on (x, y, z), `across` ([dx, dz]) the way
 * they're side by side, each `width` wide and `height` tall, `thick` through, leaning out a
 * little from each other.
 */
function ears(solid, [x, y, z], [ax, az], width, height, name, { thick = m(0.22), apart = null } = {}) {
    const gap = apart ?? width * 1.15;

    for (const sign of [-1, 1]) {
        const [cx, cz] = [x + ax * sign * gap / 2, z + az * sign * gap / 2];

        ear(solid, [cx, y, cz], [ax, az], width, height, name, { thick, lean: sign * width * 0.18 });
    }
}

/** One ear: a thick triangle standing on (x, y, z), its tip leaning `lean` along `across`. */
function ear(solid, [x, y, z], [ax, az], width, height, name, { thick = m(0.22), lean = 0 } = {}) {
    const [ox, oz] = [-az * (thick / 2), ax * (thick / 2)];
    const stuff = material(name);
    const [l, r, t] = [[x - ax * width / 2, y, z - az * width / 2], [x + ax * width / 2, y, z + az * width / 2], [x + ax * lean, y + height, z + az * lean]];
    const off = (p, s) => [p[0] + ox * s, p[1], p[2] + oz * s];

    solid.facing([off(l, 1), off(r, 1), off(t, 1)], [ox, 0, oz], stuff);
    solid.facing([off(l, -1), off(r, -1), off(t, -1)], [-ox, 0, -oz], stuff);
    solid.facing([off(l, 1), off(l, -1), off(t, -1), off(t, 1)], [-ax, height / width, -az], stuff);
    solid.facing([off(r, 1), off(r, -1), off(t, -1), off(t, 1)], [ax, height / width, az], stuff);
}

/**
 * Toron: palm-wood sticks standing out of a wall's face in rows (`rows`: heights up it), about
 * `every` apart along each row, staggered, a little different in length and droop, kept clear of
 * the openings (`clear`: [u0, u1, v0, v1]) and of `margin` from the wall's ends.
 */
function toron(solid, face, lean, ends, rows, every, random, { clear = [], margin = m(0.4), reach = m(0.6), name = "timber-light" } = {}) {
    const at = wallPoint(face, { lean, ends });

    for (const [r, v] of rows.entries()) {
        const count = Math.max(1, Math.floor((face.length - margin * 2) / every));
        const step = (face.length - margin * 2) / count;

        for (let k = 0; k <= count; k++) {
            const u = margin + (k + (r % 2) * 0.5) * step;

            if (u > face.length - margin + 1e-6 || clear.some(([u0, u1, v0, v1]) => u > u0 - m(0.25) && u < u1 + m(0.25) && v > v0 - m(0.3) && v < v1 + m(0.3))) {
                continue;
            }

            const long = reach * random.range(0.8, 1.2);
            const [from, to] = [at(u, v, -m(0.05)), at(u, v - long * random.range(0.02, 0.1), long)];

            // (Three-sided, and only its outer end capped: there are hundreds of them)
            solid.tube([from, to], m(0.05), material(name), { sides: 3, caps: true });
        }
    }
}

/**
 * Painted on a wall's face between v0 and v1 (a dado), kept clear of openings: a row of
 * triangles (two colours turn about), a zigzag, or calabash half-rounds.
 */
function motifs(solid, face, lean, ends, [v0, v1], colours, kind, clear = []) {
    const at = wallPoint(face, { lean, ends });
    const lift = m(0.035);
    const size = Math.min(m(0.42), (v1 - v0) * 0.7);
    const count = Math.floor((face.length - m(0.1)) / size);
    const start = (face.length - count * size) / 2;
    const draw = (points, name) => solid.facing(points.map(([u, v]) => at(u, v, lift)), face.out, material(name), undefined, null);

    for (let k = 0; k < count; k++) {
        const [u0, u1] = [start + k * size, start + (k + 1) * size];

        if (clear.some(([c0, c1, cv0]) => u1 > c0 - m(0.1) && u0 < c1 + m(0.1) && cv0 < v1)) {
            continue;
        }

        const mid = (v0 + v1) / 2;

        if (kind === "triangles") {
            draw([[u0, v0 + m(0.08)], [u1, v0 + m(0.08)], [(u0 + u1) / 2, v1 - m(0.08)]], colours[k % 2 ? 2 : 1]);
        } else if (kind === "zigzag") {
            const [a, b] = k % 2 ? [v1 - m(0.1), v0 + m(0.1)] : [v0 + m(0.1), v1 - m(0.1)];
            const band = m(0.07);

            draw([[u0, a - band], [u1, b - band], [u1, b + band], [u0, a + band]], colours[1]);
        } else {
            // (A calabash half-round, over a line)
            const r = size * 0.42;
            const points = Array.from({ length: 7 }, (_, i) => [(u0 + u1) / 2 + Math.cos((Math.PI * i) / 6) * r, mid - r * 0.4 + Math.sin((Math.PI * i) / 6) * r]);

            draw([[(u0 + u1) / 2, mid - r * 0.4], ...points], colours[k % 2 ? 1 : 2]);
            draw([[u0, v0 + m(0.06)], [u1, v0 + m(0.06)], [u1, v0 + m(0.12)], [u0, v0 + m(0.12)]], colours[2]);
        }
    }
}

// A doorway's leaves, studded with iron, in its back (a wall's face; the opening's u0..u1, v1 up,
// set `depth` in)
function studded(solid, face, [u0, u1, v1], depth) {
    const at = wallPoint(face);
    const rows = Math.max(3, Math.round(v1 / m(0.35)));

    for (let r = 1; r < rows; r++) {
        for (let c = 1; c <= 3; c++) {
            for (const [a, b] of [[u0, (u0 + u1) / 2], [(u0 + u1) / 2, u1]]) {
                const u = a + ((b - a) * c) / 4;
                const v = (v1 * r) / rows;
                const p = at(u, v, -depth + m(0.02));

                solid.box(p[0] - m(0.03), p[1] - m(0.03), p[2] - m(0.03), p[0] + m(0.03), p[1] + m(0.03), p[2] + m(0.03), material("iron"));
            }
        }
    }

    // (The line between the two leaves)
    solid.member(at((u0 + u1) / 2, 0, -depth + m(0.01)), at((u0 + u1) / 2, v1, -depth + m(0.01)), face.out, m(0.04), m(0.015), material("shadow"), { ends: false });
}

// A clay spout throwing the rain off a flat roof, out through a parapet's foot
function spout(solid, [x, y, z], [ox, oz], reach = m(0.75)) {
    solid.tube([[x - ox * m(0.2), y, z - oz * m(0.2)], [x + ox * reach, y + m(0.05), z + oz * reach]], m(0.1), material("clay"), { sides: 4, caps: true });
}

// A little clay pot turned upside down on a peak, or a sun disc, or an egg on a stick
function finial(solid, x, y, z, kind, random) {
    if (kind === "sun") {
        pole(solid, [x, y - m(0.1), z], [x, y + m(0.45), z], m(0.04), "timber");
        solid.lathe(x, z, [[0, y + m(0.35)], [m(0.16), y + m(0.42)], [m(0.18), y + m(0.55)], [m(0.16), y + m(0.68)], [0, y + m(0.75)]], material("sun-gold"), { segments: 8 });

        return;
    }

    if (kind === "egg") {
        pole(solid, [x, y - m(0.1), z], [x, y + m(0.35), z], m(0.035), "timber");
        solid.lathe(x, z, [[0, y + m(0.3)], [m(0.12), y + m(0.36)], [m(0.13), y + m(0.48)], [m(0.08), y + m(0.6)], [0, y + m(0.64)]], material("egg"), { segments: 8 });

        return;
    }

    const lip = m(random.range(0.16, 0.22));

    solid.lathe(x, z, [[0, y - m(0.05)], [lip, y], [lip * 1.15, y + m(0.16)], [lip * 0.7, y + m(0.3)], [m(0.05), y + m(0.33)], [0, y + m(0.34)]], material("clay-orange"), { segments: 8 });
}

// --- Houses ---

/**
 * A round hut: its mud wall on a low plinth (painted round its foot on a better house), a low
 * door with a round head that a cat stoops through, a little pointed vent at the back, under a
 * cone of thatch laid in courses with a ragged fringe, and a pot or a sun disc on its peak. Its
 * door faces `facing` (as characters face: 0 south). Returns its peak.
 */
export function hut(solid, cx, cz, { r = m(2.4), wall = m(2.2), facing = 0, name = "mud", roof = "thatch", paint = null, random, door = true, top = "pot", pitch = 1 }) {
    const count = 14;
    const phase = southSide(count) - facing;
    const outline = circle(cx, cz, r, count, phase);
    const side = lengthOf(outline, 0);
    const plinth = m(0.2);
    const openings = {};
    const halfDoor = Math.min(side / 2 - m(0.08), m(0.42));

    if (door) {
        openings[0] = [{ u0: side / 2 - halfDoor, u1: side / 2 + halfDoor, v0: 0, v1: m(1.5), depth: m(0.28), back: material(random.chance(0.6) ? "planks-dark" : "matting"), arch: "round" }];
    }

    openings[count / 2] = [{ u0: side / 2 - m(0.17), u1: side / 2 + m(0.17), v0: m(1.5), v1: m(1.9), depth: m(0.28), back: material("shadow"), arch: "lancet" }];
    solid.extrude(circle(cx, cz, r + m(0.16), count, phase), 0, plinth, material("mud-dark"));

    const dado = m(0.95);
    const bands = paint ? [{ height: dado, name: paint[0] }, { height: wall - dado, name }] : [{ height: wall, name }];
    const faces = bandedWalls(solid, outline, plinth, bands, openings, { lean: 0.012 });

    if (paint) {
        const kind = random.pick(["triangles", "zigzag", "arcs"]);

        for (const [k, face] of faces.entries()) {
            // (Not across the door's side, nor its neighbours)
            if (door && (k === 0 || k === 1 || k === count - 1)) {
                continue;
            }

            motifs(solid, face, 0.012, [0.012, 0.012], [m(0.1), dado - m(0.08)], paint, kind);
        }
    }

    // A step up to the door
    if (door) {
        const [dx, dz] = [Math.sin(facing), Math.cos(facing)];
        const [sx, sz] = [cx + dx * (r + m(0.35)), cz + dz * (r + m(0.35))];

        solid.lathe(sx, sz, [[m(0.55), 0], [m(0.5), plinth * 0.7], [0, plinth * 0.7]], material("mud-dark"), { segments: 8, from: Math.atan2(dz, dx) - Math.PI / 2, to: Math.atan2(dz, dx) + Math.PI / 2 });
    }

    const eaves = plinth + wall;
    const reach = r + m(0.55);
    const peak = thatchCone(solid, cx, cz, eaves - m(0.12), reach, reach * pitch * random.range(0.95, 1.12), roof, { segments: count, random, skirts: 2 });

    finial(solid, cx, peak - m(0.08), cz, top, random);

    return peak;
}

/**
 * A figure-eight house (a mother's house): two round rooms run together under one flat roof,
 * behind a parapet with a pair of ears at each end; its door in the bigger room's front.
 */
function twin(solid, cx, cz, { rA, rB, wall, name, random, paint, wealth }) {
    const apart = (rA + rB) * 0.72;
    const [ax, bx] = [cx - apart / 2 + (rB - rA) * 0.2, cx + apart / 2 + (rB - rA) * 0.2];
    const inA = (x, z) => Math.hypot(x - ax, z - cz) < rA - 1e-6;
    const inB = (x, z) => Math.hypot(x - bx, z - cz) < rB - 1e-6;
    const outline = [...circle(ax, cz, rA, 24).filter(([x, z]) => !inB(x, z)), ...circle(bx, cz, rB, 24).filter(([x, z]) => !inA(x, z))].sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
    const plinth = m(0.2);
    // (The door on room A's side facing south)
    const front = outline.reduce((best, [x, z], k) => {
        const [nx, nz] = outline[(k + 1) % outline.length];
        const score = (z + nz) / 2 - Math.abs((x + nx) / 2 - ax) * 0.8;

        return score > best.score ? { k, score } : best;
    }, { k: 0, score: -Infinity }).k;
    const side = lengthOf(outline, front);
    const door = Math.min(side / 2 - m(0.05), m(0.45));
    const openings = { [front]: [{ u0: side / 2 - door, u1: side / 2 + door, v0: 0, v1: m(1.65), depth: m(0.3), back: material("planks-dark"), arch: "round" }] };

    for (const [k] of outline.entries()) {
        if (k !== front && random.chance(0.18) && lengthOf(outline, k) > m(0.6)) {
            const half = Math.min(m(0.15), lengthOf(outline, k) / 2 - m(0.1));

            openings[k] = [{ u0: lengthOf(outline, k) / 2 - half, u1: lengthOf(outline, k) / 2 + half, v0: m(1.4), v1: m(1.9), depth: m(0.3), back: material("shadow") }];
        }
    }

    solid.extrude(inset(outline, -m(0.15)), 0, plinth, material("mud-dark"));

    const dado = m(0.95);
    const faces = bandedWalls(solid, outline, plinth, paint ? [{ height: dado, name: paint[0] }, { height: wall - dado, name }] : [{ height: wall, name }], openings, {});
    const eaves = plinth + wall;

    if (paint) {
        const kind = random.pick(["triangles", "arcs"]);

        faces.forEach((face, k) => Math.abs(k - front) > 1 && motifs(solid, face, 0, [0, 0], [m(0.1), dado - m(0.08)], paint, kind));
    }

    // The roof, and the parapet round it with ears at both ends
    solid.extrude(inset(outline, m(0.2)), eaves - m(0.25), eaves - m(0.05), material("mud-dark"), { top: material("mud-pale") });
    band(solid, outline, eaves, eaves + m(0.5), m(0.22), name, { rounded: true });

    const ends = [[ax - rA, cz], [bx + rB, cz]];

    if (wealth > 0.3) {
        for (const [x, z] of ends) {
            ears(solid, [x + (x < cx ? m(0.1) : -m(0.1)), eaves + m(0.5), z], [0, 1], m(0.32), m(0.55), name);
        }
    }

    for (const sign of [-1, 1]) {
        spout(solid, [cx + sign * m(1.2), eaves + m(0.12), cz + Math.sqrt(Math.max(0, rA * rA - m(1.2) ** 2)) * 0.9], [0, 1]);
    }

    return eaves;
}

/**
 * A four-sided house for a young couple: a box with rounded corners, a flat roof behind a
 * parapet with ears on its front corners (more on a better house), a door and a slit or two.
 */
function block(solid, x0, z0, x1, z1, { wall, name, random, wealth, paint }) {
    const outline = roundedRect(x0, z0, x1, z1, m(0.35), 2);
    const front = sideFacing(outline, [0, 1]);
    const length = lengthOf(outline, front);
    const plinth = m(0.2);
    const doorAt = length * random.pick([0.35, 0.5, 0.65]);
    const openings = { [front]: [{ u0: doorAt - m(0.48), u1: doorAt + m(0.48), v0: 0, v1: m(2.0), depth: m(0.28), back: material("planks-dark") }] };
    const slit = (k, u) => ({ u0: u - m(0.15), u1: u + m(0.15), v0: m(1.5), v1: m(2.05), depth: m(0.28), back: material("shadow") });

    openings[front].push(slit(front, doorAt < length / 2 ? length * 0.8 : length * 0.2));

    for (const way of [[1, 0], [-1, 0], [0, -1]]) {
        const k = sideFacing(outline, way);

        if (random.chance(0.6)) {
            openings[k] = [slit(k, lengthOf(outline, k) / 2)];
        }
    }

    solid.extrude(inset(outline, -m(0.12)), 0, plinth, material("mud-dark"));

    const lean = 0.025;
    const dado = m(0.9);
    const faces = bandedWalls(solid, outline, plinth, paint ? [{ height: dado, name: paint[0] }, { height: wall - dado, name }] : [{ height: wall, name }], openings, { lean });
    const eaves = plinth + wall;
    const top = inset(outline, lean * wall);

    if (paint) {
        const kind = random.pick(["triangles", "zigzag"]);

        faces.forEach((face, k) => face.length > m(1) && motifs(solid, face, lean, [0, 0], [m(0.1), dado - m(0.08)], paint, kind, (openings[k] ?? []).map(({ u0, u1, v0, v1 }) => [u0, u1, v0, v1])));
    }

    // A timber lintel over the door
    const door = openings[front][0];
    const at = wallPoint(faces[front], { lean });

    solid.member(at(door.u0 - m(0.2), door.v1 + m(0.1)), at(door.u1 + m(0.2), door.v1 + m(0.1)), faces[front].out, m(0.16), m(0.1), material("timber"));
    solid.extrude(inset(top, m(0.15)), eaves - m(0.25), eaves - m(0.05), material("mud-dark"), { top: material("mud-pale") });
    band(solid, top, eaves, eaves + m(0.55), m(0.22), name, { rounded: true, lean });

    // Ears on the front corners (and the back ones on a better house)
    const [fx0, fx1] = [x0 + m(0.35), x1 - m(0.35)];
    const earTop = eaves + m(0.55);

    for (const [x, z] of [[fx0, z1 - m(0.25)], [fx1, z1 - m(0.25)], ...(wealth > 0.6 ? [[fx0, z0 + m(0.25)], [fx1, z0 + m(0.25)]] : [])]) {
        ears(solid, [x, earTop - m(0.05), z - lean * wall * Math.sign(z - (z0 + z1) / 2)], [1, 0], m(0.28), m(0.5), name);
    }

    spout(solid, [x0 + (x1 - x0) * 0.3, eaves + m(0.12), z0 + lean * wall], [0, -1]);
    spout(solid, [x1 - lean * wall, eaves + m(0.12), (z0 + z1) / 2], [1, 0]);

    return eaves;
}

/**
 * A Sahel town house of two storeys (x0..x1 by z0..z1): battered walls, buttresses up its front
 * rising into pinnacles past its parapet, rows of toron, a raised door bay with studded leaves,
 * small grilled windows upstairs and slits below, spouts off its flat roof, and on a better house
 * a stair-house on the roof and ears on every pinnacle.
 */
function townHouse(solid, x0, z0, x1, z1, { storeys = [m(3), m(2.8)], name, random, wealth, paint, trim = "mud-pale", doorway = { width: m(1.2), height: m(2.3) }, recess = m(0.35), plinth = m(0.25), parapet = m(0.85), roofHouse = wealth > 0.45 }) {
    const outline = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const lean = 0.045;
    const height = storeys.reduce((a, b) => a + b, 0);
    const [width] = [x1 - x0];
    // (The front is the side from (x1, z1) to (x0, z1): along it runs east to west; an odd
    // number of bays, the door in the middle one)
    const bays = Math.max(3, Math.round(width / m(2.6))) | 1;
    const bay = width / bays;
    const doorBay = Math.floor(bays / 2);
    const openings = { 0: [], 1: [], 2: [], 3: [] };
    const door = { u0: width / 2 - doorway.width / 2, u1: width / 2 + doorway.width / 2, v0: 0, v1: doorway.height, depth: recess, back: material("planks-dark"), arch: wealth > 0.5 ? "round" : null };

    openings[2].push(door);

    for (let b = 0; b < bays; b++) {
        const centre = (b + 0.5) * bay;

        if (b !== doorBay && random.chance(0.7)) {
            openings[2].push({ u0: centre - m(0.14), u1: centre + m(0.14), v0: m(1.7), v1: m(2.35), depth: m(0.3), back: material("shadow") });
        }

        if (storeys.length > 1) {
            openings[2].push({ u0: centre - m(0.3), u1: centre + m(0.3), v0: storeys[0] + m(0.9), v1: storeys[0] + m(1.75), depth: m(0.3), back: material("shadow"), grille: true });
        }
    }

    for (const k of [0, 1, 3]) {
        const length = k % 2 ? z1 - z0 : x1 - x0;

        for (let b = 0; b < Math.round(length / m(3)); b++) {
            if (random.chance(0.45)) {
                const centre = ((b + 0.5) * length) / Math.round(length / m(3));
                const upstairs = storeys.length > 1 && random.chance(0.6);
                const v0 = upstairs ? storeys[0] + m(1.1) : m(1.8);

                openings[k].push({ u0: centre - m(0.14), u1: centre + m(0.14), v0, v1: v0 + m(0.55), depth: m(0.3), back: material("shadow") });
            }
        }
    }

    solid.extrude(inset(outline, -m(0.15)), 0, plinth, material("mud-dark"));

    const dado = m(1.1);
    const bands = paint ? [{ height: dado, name: paint[0] }, { height: height - dado, name }] : [{ height, name }];
    const faces = bandedWalls(solid, outline, plinth, bands, openings, { lean });
    const eaves = plinth + height;
    const top = inset(outline, lean * height);
    const front = faces[2];
    const at = wallPoint(front, { lean });

    // Grilles in the upstairs windows, lintels over them all
    for (const [k, list] of Object.entries(openings)) {
        const face = faces[k];
        const on = wallPoint(face, { lean });

        for (const { u0, u1, v0, v1, grille } of list) {
            solid.member(on(u0 - m(0.12), v1 + m(0.08)), on(u1 + m(0.12), v1 + m(0.08)), face.out, m(0.12), m(0.08), material("timber"));

            if (grille) {
                for (let g = 1; g < 4; g++) {
                    const u = u0 + ((u1 - u0) * g) / 4;

                    solid.member(on(u, v0, -m(0.2)), on(u, v1, -m(0.2)), face.out, m(0.05), m(0.05), material("timber"), { ends: false });
                }

                solid.member(on(u0, (v0 + v1) / 2, -m(0.2)), on(u1, (v0 + v1) / 2, -m(0.2)), face.out, m(0.05), m(0.05), material("timber"), { ends: false });
            }
        }
    }

    if (paint) {
        faces.forEach((face, k) => motifs(solid, face, lean, [lean, lean], [m(0.12), dado - m(0.1)], paint, random.pick(["triangles", "zigzag"]), openings[k].map(({ u0, u1, v0, v1 }) => [u0, u1, v0, v1])));
    }

    // The door bay: a raised frame round the door, rising to a stepped head with ears
    const [du0, du1] = [door.u0 - m(0.45), door.u1 + m(0.45)];
    const bayTop = door.v1 + m(0.85);
    const proud = m(0.28);
    const surround = wealth > 0.55 ? "plaster-white" : trim;

    for (const [u0, u1] of [[du0, door.u0], [door.u1, du1]]) {
        solid.facing([at(u0, 0, proud), at(u1, 0, proud), at(u1, door.v1, proud), at(u0, door.v1, proud)], front.out, material(surround));
        solid.facing([at(u0, 0, 0), at(u0, 0, proud), at(u0, door.v1, proud), at(u0, door.v1, 0)], front.across.map((a) => -a), material(surround));
        solid.facing([at(u1, 0, 0), at(u1, 0, proud), at(u1, door.v1, proud), at(u1, door.v1, 0)], front.across, material(surround));
    }

    solid.facing([at(du0, door.v1, proud), at(du1, door.v1, proud), at(du1, bayTop, proud), at(du0, bayTop, proud)], front.out, material(surround));
    solid.facing([at(du0, bayTop, 0), at(du1, bayTop, 0), at(du1, bayTop, proud), at(du0, bayTop, proud)], [0, 1, 0], material(surround));
    solid.facing([at(du0, door.v1, 0), at(du0, door.v1, proud), at(du0, bayTop, proud), at(du0, bayTop, 0)], front.across.map((a) => -a), material(surround));
    solid.facing([at(du1, door.v1, 0), at(du1, door.v1, proud), at(du1, bayTop, proud), at(du1, bayTop, 0)], front.across, material(surround));
    ears(solid, at((du0 + du1) / 2, bayTop, proud / 2), [-1, 0], m(0.3), m(0.5), surround);
    studded(solid, front, [door.u0, door.u1, door.v1], door.depth);

    // Buttresses between the bays of the front, rising past the parapet into pinnacles
    const rise = parapet + m(random.range(0.6, 1.1));

    for (let b = 0; b <= bays; b++) {
        const u = b * bay;

        if (u > du0 - m(0.2) && u < du1 + m(0.2)) {
            continue;
        }

        const corner = b === 0 || b === bays;
        const [half, deep] = [corner ? m(0.45) : m(0.28), corner ? m(0.45) : m(0.32)];
        const uu = Math.min(Math.max(u, half), width - half);
        const foot = [at(uu - half, 0, 0), at(uu + half, 0, 0), at(uu + half, 0, deep), at(uu - half, 0, deep)];
        const headY = height + rise;
        const shift = times(front.out, -lean * height);
        const head = foot.map((p) => add3(add3(p, shift), [0, headY, 0]));

        solid.loft([foot, head], material(name));
        solid.facing(head, [0, 1, 0], material(name));

        const [hx, hz] = [(head[0][0] + head[2][0]) / 2, (head[0][2] + head[2][2]) / 2];

        if (wealth > 0.35) {
            pinnacle(solid, hx, plinth + headY, hz, half * 2, m(0.7), name);
        }
    }

    // Rows of toron on every face: at each floor and under the parapet
    const rows = [m(1.35), ...(storeys.length > 1 ? [storeys[0] + m(0.3)] : []), height - m(0.35)];

    faces.forEach((face, k) => toron(solid, face, lean, [lean, lean], rows, k === 2 ? m(0.85) : m(1.1), random, { clear: openings[k].map(({ u0, u1, v0, v1 }) => [u0, u1, v0, v1]).concat(k === 2 ? [[du0, du1, 0, bayTop]] : []) }));

    // The roof and its parapet, spouts off it
    solid.extrude(inset(top, m(0.15)), eaves - m(0.3), eaves - m(0.05), material("mud-dark"), { top: material("mud-pale") });
    band(solid, top, eaves, eaves + parapet, m(0.28), name, { rounded: true, lean });

    for (const [x, z, way] of [[x0 + width * 0.25, z0 + lean * height, [0, -1]], [x0 + width * 0.75, z0 + lean * height, [0, -1]], [x1 - lean * height, (z0 + z1) / 2, [1, 0]], [x0 + lean * height, (z0 + z1) / 2, [-1, 0]]]) {
        spout(solid, [x, eaves + m(0.12), z], way);
    }

    // A stair-house on the roof, at the back corner
    if (roofHouse) {
        const [sx0, sz0] = [top[0][0] + m(0.3), top[0][1] + m(0.3)];
        const room = [[sx0, sz0], [sx0 + m(2.2), sz0], [sx0 + m(2.2), sz0 + m(2)], [sx0, sz0 + m(2)]];
        solid.walls(room, eaves - m(0.05), m(2.1), { 2: [{ u0: m(0.6), u1: m(1.4), v0: 0, v1: m(1.8), depth: m(0.25), back: material("shadow"), arch: "round" }] }, material(name));

        solid.extrude(room, eaves + m(2.05), eaves + m(2.2), material("mud-dark"), { top: material("mud-pale") });
        ears(solid, [sx0 + m(1.1), eaves + m(2.2), sz0 + m(1.9)], [1, 0], m(0.25), m(0.4), name);
    }

    return { top: eaves + parapet, eaves, faces, front, door, lean, bayTop, roof: top };
}

/** A beehive hut of grass over a frame: a poor house, or a herder's out in the fields. */
function beehive(solid, cx, cz, { r, height, random }) {
    const profile = Array.from({ length: 7 }, (_, k) => {
        const t = k / 6;

        return [r * Math.sqrt(1 - t) * (k === 6 ? 0 : 1), height * t];
    });

    solid.lathe(cx, cz, profile, material(random.chance(0.5) ? "thatch-grey" : "thatch"), { segments: 12 });

    // (Its low porch, a mud arch the door hangs in)
    const [pz0, pz1] = [cz + r * 0.7, cz + r + m(0.3)];
    const porch = [[cx - m(0.55), pz0], [cx + m(0.55), pz0], [cx + m(0.55), pz1], [cx - m(0.55), pz1]];

    solid.walls(porch, 0, m(1.15), { 2: [{ u0: m(0.25), u1: m(0.85), v0: 0, v1: m(1.05), depth: m(0.2), back: material("shadow"), arch: "round" }] }, material("mud"));
    solid.lathe(cx, (pz0 + pz1) / 2, [[m(0.6), m(1.15)], [m(0.45), m(1.3)], [0, m(1.36)]], material("mud"), { segments: 8 });
}

/** A granary: a round mud bin on stone feet, a small hatch high up, a hat of thatch. */
export function granary(solid, cx, cz, { r = m(0.85), height = m(2.1), random, top = "pot" }) {
    const legs = m(0.4);

    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        solid.lathe(cx + dx * r * 0.55, cz + dz * r * 0.55, [[m(0.2), 0], [m(0.17), legs], [0, legs]], material("granite"), { segments: 5 });
    }

    const outline = circle(cx, cz, r, 10, southSide(10));
    const side = lengthOf(outline, 0);

    solid.extrude(circle(cx, cz, r * 1.08, 10), legs, legs + m(0.15), material("mud-dark"));
    solid.walls(outline, legs + m(0.15), height, { 0: [{ u0: side / 2 - m(0.2), u1: side / 2 + m(0.2), v0: height - m(0.75), v1: height - m(0.3), depth: m(0.15), back: material("planks-dark") }] }, material("mud"), { lean: 0.03 });

    const eaves = legs + m(0.15) + height;
    const peak = thatchCone(solid, cx, cz, eaves - m(0.1), r + m(0.35), (r + m(0.35)) * 1.15, "thatch", { segments: 10, random, skirts: 1 });

    finial(solid, cx, peak - m(0.06), cz, top, random);
}

// A mat awning on forked poles: the poles at the corners of x0..x1 by z0..z1 standing on `y`,
// the mat `rise` up, sagging a little
function awning(solid, x0, z0, x1, z1, rise, random, { cloth = "matting", y = 0 } = {}) {
    const height = y + rise;

    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
        post(solid, x, y, z, rise, m(0.07), "timber-light", { lean: [random.range(-1, 1) * m(0.05), random.range(-1, 1) * m(0.05)], sides: 5 });
    }

    const sag = m(0.12);
    const [mx, mz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const corners = [[x0, height, z0], [x1, height, z0], [x1, height, z1], [x0, height, z1]];
    const middle = [mx, height - sag, mz];

    for (let k = 0; k < 4; k++) {
        const tri = [corners[k], corners[(k + 1) % 4], middle];

        solid.facing(tri, [0, 1, 0], material(cloth));
        solid.facing(tri, [0, -1, 0], material(cloth));
    }

    // (Poles across under it)
    pole(solid, [x0, height - m(0.05), z0], [x0, height - m(0.05), z1], m(0.05), "timber-light", { sides: 4 });
    pole(solid, [x1, height - m(0.05), z0], [x1, height - m(0.05), z1], m(0.05), "timber-light", { sides: 4 });
}

// Things in a court: a hearth of three stones, water jars, calabashes, a mortar and its pestle
function hearth(solid, x, z, random) {
    for (let k = 0; k < 3; k++) {
        const angle = (k * Math.PI * 2) / 3 + random.next();

        solid.lathe(x + Math.cos(angle) * m(0.3), z + Math.sin(angle) * m(0.3), [[m(0.15), 0], [m(0.13), m(0.2)], [0, m(0.24)]], material("rock"), { segments: 5 });
    }

    solid.lathe(x, z, [[m(0.5), 0], [m(0.45), m(0.03)], [0, m(0.03)]], material("shadow"), { segments: 8 });
}

function jar(solid, x, z, size, name = "clay", y = 0) {
    solid.lathe(x, z, [[size * 0.35, y], [size * 0.55, y + size * 0.35], [size * 0.5, y + size * 0.75], [size * 0.28, y + size * 0.95], [size * 0.3, y + size * 1.05], [0, y + size * 1.05]], material(name), { segments: 8 });
}

function jars(solid, x, z, random, count = 3) {
    for (let k = 0; k < count; k++) {
        jar(solid, x + random.range(-1, 1) * m(0.5), z + random.range(-1, 1) * m(0.5), m(random.range(0.45, 0.8)), random.pick(["clay", "clay-orange", "calabash"]));
    }
}

/**
 * A household's compound, filling its lot: a curving wall with a rounded top, its gatehouse
 * (the zaure, a flat-roofed hall with benches the lane comes in through) in the middle of its
 * front, round huts inside against the wall with their doors on the court, a granary, a mat
 * awning, a hearth and water jars.
 */
function compound(solid, W, D, random, { wealth, name }) {
    const [cx, cz] = [W / 2, D / 2 - m(0.4)];
    const [rx, rz] = [W / 2 - m(0.5), D / 2 - m(0.9)];
    const ring = squircle(cx, cz, rx, rz, 3.2, 40, Math.PI / 2);
    // (The wall's run: round from the gatehouse's one side to its other, the court on its left)
    const zaure = m(2.3);
    const run = ring.filter(([x, z]) => !(z > cz && Math.abs(x - cx) < zaure));
    const start = run.findIndex(([x, z], k) => {
        const [px, pz] = run[(k - 1 + run.length) % run.length];

        return Math.hypot(x - px, z - pz) > m(2);
    });
    let wall = [...run.slice(start), ...run.slice(0, start)];

    // (Turned to run with the court on its left)
    const [ax, az] = wall[0];
    const [bx, bz] = wall[1];

    if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0) {
        wall = wall.reverse();
    }

    band(solid, wall, 0, m(1.9), m(0.35), name, { closed: false, rounded: true, lean: 0.03 });

    // (The court's floor of beaten earth)
    const floor = inset(ring, m(0.3));

    solid.facing([[cx, m(0.03), cz], ...floor.map(([x, z]) => [x, m(0.03), z]), [floor[0][0], m(0.03), floor[0][1]]], [0, 1, 0], material("mud-pale"));

    // The zaure, straddling the wall's gap
    const [zx0, zx1, zz0, zz1] = [cx - zaure, cx + zaure, cz + rz - m(2.2), cz + rz + m(1.2)];
    const hall = [[zx0, zz0], [zx1, zz0], [zx1, zz1], [zx0, zz1]];
    const pass = { u0: zaure - m(0.65), u1: zaure + m(0.65), v0: 0, v1: m(2.2), depth: m(0.35), back: null, arch: "round" };
    const faces = solid.walls(hall, 0, m(3), { 0: [pass], 2: [pass] }, material(name), { lean: 0.03 });

    solid.extrude(inset(hall, 0.03 * m(3) + m(0.1)), m(2.7), m(2.95), material("mud-dark"), { top: material("mud-pale") });
    band(solid, inset(hall, 0.03 * m(3)), m(3), m(3.55), m(0.25), name, { rounded: true, lean: 0.03 });

    // (Its floor, benches either side of the way through, and dark inside)
    solid.facing([[zx0 + m(0.3), m(0.02), zz0 + m(0.3)], [zx1 - m(0.3), m(0.02), zz0 + m(0.3)], [zx1 - m(0.3), m(0.02), zz1 - m(0.3)], [zx0 + m(0.3), m(0.02), zz1 - m(0.3)]], [0, 1, 0], material("mud-dark"));
    solid.facing([[zx0 + m(0.1), m(2.7), zz0 + m(0.1)], [zx1 - m(0.1), m(2.7), zz0 + m(0.1)], [zx1 - m(0.1), m(2.7), zz1 - m(0.1)], [zx0 + m(0.1), m(2.7), zz1 - m(0.1)]], [0, -1, 0], material("shadow"));

    for (const x of [zx0 + m(0.3), zx1 - m(1.1)]) {
        solid.box(x, 0, zz0 + m(0.6), x + m(0.8), m(0.45), zz1 - m(0.6), material("mud-pale"));
    }

    const front = faces[2];
    const at = wallPoint(front, { lean: 0.03 });

    if (wealth > 0.25) {
        ears(solid, add3(at(zaure * 2 * 0.06, m(3.55)), [0, 0, -m(0.1)]), [1, 0], m(0.3), m(0.55), name);
        ears(solid, add3(at(zaure * 2 * 0.94, m(3.55)), [0, 0, -m(0.1)]), [1, 0], m(0.3), m(0.55), name);
    }

    toron(solid, front, 0.03, [0.03, 0.03], [m(1.2), m(2.6)], m(0.8), random, { clear: [[pass.u0, pass.u1, 0, pass.v1]] });

    // Huts round the court, their doors on it
    const huts = [];
    const count = Math.max(2, Math.min(5, Math.floor((rx + rz) / m(3.2))));

    for (let k = 0; k < count; k++) {
        const angle = -Math.PI / 2 + ((k - (count - 1) / 2) * (Math.PI * 1.35)) / Math.max(1, count - 1) * (count > 1 ? 1 : 0);
        const r = m(random.range(1.9, 2.5));
        const [hx, hz] = [cx + Math.cos(angle) * (rx - r - m(0.6)), cz + Math.sin(angle) * (rz - r - m(0.6))];

        if (huts.some(([x, z, rr]) => Math.hypot(x - hx, z - hz) < r + rr + m(0.4))) {
            continue;
        }

        huts.push([hx, hz, r]);

        const paint = wealth > 0.5 && random.chance(0.5) ? random.pick(PAINTS) : null;

        hut(solid, hx, hz, { r, facing: Math.atan2(cx - hx, cz - hz), name: random.pick(MUDS), random, paint, top: random.chance(0.3) ? "sun" : "pot" });
    }

    // A granary or two in a corner of the court, an awning, a hearth and jars
    for (const side of random.chance(0.5) ? [-1, 1] : [random.pick([-1, 1])]) {
        const [gx, gz] = [cx + side * (rx - m(1.3)), cz + rz * 0.25];

        if (!huts.some(([x, z, rr]) => Math.hypot(x - gx, z - gz) < rr + m(1.3))) {
            granary(solid, gx, gz, { random });
        }
    }

    const [ox, oz] = [cx + random.range(-1, 1) * m(1), cz + m(0.8)];

    awning(solid, ox - m(1.5), oz - m(1.2), ox + m(1.5), oz + m(1.2), m(2.3), random);
    hearth(solid, cx + random.range(-1, 1) * m(1.2), cz - m(0.6), random);
    jars(solid, zx1 + m(0.8), zz0 - m(0.6), random);
}

/**
 * A cat folk's house on its lot (a piece of a town's layout: w by h plots, facing south): its
 * `type` if asked (hut, twin, block, townhouse, beehive, granary, compound), or one to suit the
 * lot and the household (a building behind the houses is a granary, a beehive hut or a hut).
 */
export function house(piece) {
    const random = randomFor(piece);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const area = piece.w * piece.h;
    const wealth = piece.wealth ?? random.range(0, 1);
    const type = piece.type ?? (piece.back ? random.pick(["granary", "beehive", "hut"]) : area >= 12 ? "compound" : area > 6.5 ? random.pick(["townhouse", "townhouse", "twin"]) : area > 3.5 ? random.pick(["block", "twin", "hut", "townhouse"]) : random.pick(["hut", "hut", "block", "beehive"]));
    const name = piece.walls ?? random.pick(MUDS);
    const paint = wealth > 0.55 && random.chance(0.6) ? random.pick(PAINTS) : null;
    const solid = new Solid();
    const storeys = type === "townhouse" && (area > 5 || wealth > 0.4) ? [m(random.range(2.9, 3.2)), m(random.range(2.6, 2.9))] : [m(3.1)];
    const eaves = { hut: [m(2.4)], twin: [m(2.7)], block: [m(2.9)], townhouse: [m(0.25) + storeys.reduce((a, b) => a + b, 0)], compound: [m(1.9), m(3)] }[type] ?? [];

    solid.tone = weathering({ seed: random.int(0, 1e6), eaves, washes: ["mud", "mud-pale", "mud-red", "plaster-white"], tint: [random.range(0.95, 1.05), random.range(0.94, 1.03), random.range(0.92, 1.02)], mottle: ["thatch", "thatch-grey", "mud-pale"] });

    if (type === "hut") {
        const r = Math.min(W, D) / 2 - m(0.7);

        hut(solid, W / 2, D / 2, { r: Math.min(m(3), r), name, random, paint, top: wealth > 0.6 ? "sun" : "pot" });
    } else if (type === "twin") {
        const r = Math.min(D / 2 - m(0.5), W / 3.4);

        twin(solid, W / 2, D / 2, { rA: r, rB: r * 0.85, wall: m(2.5), name, random, paint, wealth });
    } else if (type === "block") {
        block(solid, m(0.4), m(0.5), W - m(0.4), D - m(0.5), { wall: m(2.7), name, random, wealth, paint });
    } else if (type === "townhouse") {
        townHouse(solid, m(0.3), m(0.4), W - m(0.3), D - m(0.35), { storeys, name, random, wealth, paint });
    } else if (type === "beehive") {
        const r = Math.min(m(2.2), Math.min(W, D) / 2 - m(0.5));

        beehive(solid, W / 2, D / 2 - m(0.3), { r, height: r * 1.15, random });
    } else if (type === "granary") {
        granary(solid, W / 2, D / 2, { random, r: Math.min(m(0.9), Math.min(W, D) / 2 - m(0.4)) });
    } else {
        compound(solid, W, D, random, { wealth, name });
    }

    return solid.toObject();
}

/**
 * What the building lab shows of the cat folk's houses: each type, and the size of lot (plots)
 * it's shown on.
 */
export const GALLERY = Object.freeze({
    houses: [["hut", 1.6, 1.6], ["beehive", 1.3, 1.3], ["granary", 0.8, 0.8], ["twin", 2.4, 1.6], ["block", 1.6, 1.9], ["townhouse", 2.4, 2.6], ["compound", 4.4, 4.4]],
});

export { awning, ears, finial, hearth, jar, jars, MUDS, PAINTS, sideFacing, spout, studded, toron, townHouse, twin, block, compound, beehive, motifs };
