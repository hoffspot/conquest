// The cat folk's special buildings, in the mud of their houses (cat.js) at a greater scale, each
// with one thing of its own: the tavern a court shaded by mats behind a town house, its name over
// the door; the temple a Djenné-like hall of buttresses and toron on a platform, three towers on
// its front crowned with golden suns; the smithy a workshop and an open shed over a clay furnace;
// the guild's hall a lofty block with a great door bay and shallow domes on its roof; the town
// hall a grand town house guarded by two stone cats; the keep a kasbah's tower house, battered,
// with a tower at each corner; the market stalls roofed with mats. Each is built facing south,
// its door where the town's entrances say (core/insides.js ENTRANCES).

import { GODS } from "../../../core/lore/gods.js";
import { material } from "../engine/materials.js";
import { add3, inset, Solid, times } from "../engine/solid.js";
import { emblemSignTexture, loadSignFont, nameBoardTexture, signMaterial } from "../kits/signs.js";
import { awning, ears, finial, hearth, jar, jars, MUDS, PAINTS, studded, toron, townHouse } from "./cat.js";
import { band, CELL, circle, ENTRY, lamp, m, pinnacle, pole, post, randomFor, steps, wallPoint, weathering } from "./kit.js";

// Each of the Six's emblem, for their temples' plaques
const GOD_EMBLEMS = Object.freeze({ aurelia: "sun", brannoc: "stag", ithriel: "star", morvaine: "lantern", seliane: "rose", dunmar: "anvil" });

const WASHES = ["mud", "mud-pale", "mud-red", "mud-dark", "plaster-white"];

function toned(solid, random, eaves) {
    solid.tone = weathering({ seed: random.int(0, 1e6), eaves, washes: WASHES, tint: [random.range(0.96, 1.04), random.range(0.95, 1.03), random.range(0.93, 1.02)], mottle: ["thatch", "mud-pale"] });
}

/**
 * A buttress against a battered wall's face (`at`: wallPoint's for it), `half` wide either side
 * of `u`, `deep` out, from v0 up `height`, leaning with the wall; capped by a pinnacle.
 */
function buttress(solid, at, face, lean, u, v0, height, half, deep, name, { cap = true } = {}) {
    const foot = [at(u - half, v0, 0), at(u + half, v0, 0), at(u + half, v0, deep), at(u - half, v0, deep)];
    const shift = add3(times(face.out, -lean * height), [0, height, 0]);
    const head = foot.map((p) => add3(p, shift));

    solid.loft([foot, head], material(name));
    solid.facing(head, [0, 1, 0], material(name));

    if (cap) {
        const [hx, hy, hz] = [(head[0][0] + head[2][0]) / 2, head[0][1], (head[0][2] + head[2][2]) / 2];

        pinnacle(solid, hx, hy, hz, half * 2, Math.max(m(0.5), half * 2.2), name);
    }

    return head;
}

/**
 * A battered tower x0..x1 by z0..z1 standing on y0, `height` tall, its faces' openings as
 * Solid.walls takes them (side 2 its front), rows of toron, crowned with a pointed cap (and a sun
 * or an egg on it) or ears on its corners.
 */
function tower(solid, [x0, z0, x1, z1], y0, height, name, random, { lean = 0.05, openings = {}, cap = "cone", top = "sun", rows = null, relief = height > m(9) } = {}) {
    const outline = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const faces = solid.walls(outline, y0, height, openings, material(name), { lean });

    // (Bands of relief chevrons round a tall tower's upper part, as a kasbah's)
    if (relief) {
        for (const face of faces) {
            const on = wallPoint(face, { lean });

            for (const v of [height - m(2.4), height - m(1.2)]) {
                for (let u = m(0.5); u < face.length - m(0.4); u += m(0.55)) {
                    solid.facing([on(u - m(0.22), v, m(0.05)), on(u, v + m(0.32), m(0.05)), on(u + m(0.22), v, m(0.05))], face.out, material("mud-pale"), undefined, null);
                }
            }
        }
    }
    const head = inset(outline, lean * height);
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const peak = y0 + height;

    solid.extrude(head, peak - m(0.02), peak, material(name));

    for (const [k, face] of faces.entries()) {
        toron(solid, face, lean, [lean, lean], rows ?? Array.from({ length: Math.floor(height / m(2.2)) }, (_, r) => m(1.3) + r * m(2.2)), m(0.9), random, { clear: (openings[k] ?? []).map(({ u0, u1, v0, v1 }) => [u0, u1, v0, v1]) });
    }

    if (cap === "cone") {
        const width = Math.min(head[1][0] - head[0][0], head[2][1] - head[1][1]);
        const rise = width * 0.9;

        pinnacle(solid, cx, peak, cz, width * 0.98, rise, name, { tip: m(0.08) });
        finial(solid, cx, peak + rise - m(0.05), cz, top, random);

        return peak + rise;
    }

    for (const [x, z] of head) {
        ears(solid, [x + Math.sign(cx - x) * m(0.3), peak, z + Math.sign(cz - z) * m(0.3)], [1, 0], m(0.3), m(0.6), name, { apart: m(0.4) });
    }

    return peak + m(0.6);
}

// A plaque painted with a picture (a sign's texture), on a wall's face `at`, u0..u1 by v0..v1,
// standing `proud` out in a timber frame
function plaque(solid, at, out, [u0, u1, v0, v1], texture, name, { proud = m(0.4), frame = "timber" } = {}) {
    solid.member(at((u0 + u1) / 2 - (u1 - u0) / 2 - m(0.12), (v0 + v1) / 2, proud - m(0.1)), at((u0 + u1) / 2 + (u1 - u0) / 2 + m(0.12), (v0 + v1) / 2, proud - m(0.1)), out, v1 - v0 + m(0.24), m(0.1), material(frame));

    // (Its picture the right way round to someone facing the wall: left to right is the way
    // that's to their right, whichever way along the wall runs)
    const [a, b] = [at(u0, v0), at(u1, v0)];
    const right = [out[2], 0, -out[0]];
    const [l, r] = (b[0] - a[0]) * right[0] + (b[2] - a[2]) * right[2] >= 0 ? [u0, u1] : [u1, u0];

    solid.facing([at(l, v0, proud + m(0.01)), at(r, v0, proud + m(0.01)), at(r, v1, proud + m(0.01)), at(l, v1, proud + m(0.01))], out, signMaterial(texture, name), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

// A seated stone cat guarding a door: haunches, forelegs, chest, head, ears and tail
function guardian(solid, x, z, facing, name = "granite") {
    const [dx, dz] = [Math.sin(facing), Math.cos(facing)];
    const at = (forward, up) => [x + dx * forward, up, z + dz * forward];

    solid.extrude(circle(x, z, m(0.55), 8), 0, m(0.6), material(name));
    solid.lathe(x - dx * m(0.08), z - dz * m(0.08), [[m(0.42), m(0.6)], [m(0.46), m(0.85)], [m(0.34), m(1.3)], [m(0.22), m(1.55)], [0, m(1.6)]], material(name), { segments: 8 });

    for (const side of [-1, 1]) {
        const [sx, sz] = [dz * side * m(0.14), -dx * side * m(0.14)];
        const foot = at(m(0.3), m(0.6));

        solid.tube([[foot[0] + sx, m(0.6), foot[2] + sz], [foot[0] + sx - dx * m(0.08), m(1.25), foot[2] + sz - dz * m(0.08)]], [m(0.09), m(0.08)], material(name), { sides: 5, caps: true });
    }

    const head = at(m(0.12), m(1.75));

    solid.lathe(head[0], head[2], [[0, head[1] - m(0.22)], [m(0.2), head[1] - m(0.12)], [m(0.22), head[1] + m(0.02)], [m(0.16), head[1] + m(0.16)], [0, head[1] + m(0.2)]], material(name), { segments: 8 });

    for (const side of [-1, 1]) {
        const [ex, ez] = [head[0] + dz * side * m(0.12), head[2] - dx * side * m(0.12)];

        pinnacle(solid, ex, head[1] + m(0.1), ez, m(0.14), m(0.22), name, { sides: 3 });
    }

    solid.tube([at(-m(0.4), m(0.65)), at(-m(0.55), m(0.7)), [x - dx * m(0.5) + dz * m(0.4), m(0.66), z - dz * m(0.5) - dx * m(0.4)], [x + dz * m(0.55), m(0.64), z - dx * m(0.55)]], m(0.06), material(name), { sides: 4 });
}

// Cushions and a low table in a court (the tavern's): each cushion a round, fat pad
function cushions(solid, x, z, random) {
    solid.box(x - m(0.45), 0, z - m(0.45), x + m(0.45), m(0.32), z + m(0.45), material("planks"));

    for (let k = 0; k < 4; k++) {
        const angle = (k * Math.PI) / 2 + random.range(-0.3, 0.3);
        const [cx, cz] = [x + Math.cos(angle) * m(0.95), z + Math.sin(angle) * m(0.95)];

        solid.lathe(cx, cz, [[m(0.35), 0], [m(0.38), m(0.1)], [m(0.3), m(0.2)], [0, m(0.22)]], material(random.pick(["awning", "indigo", "ochre", "laterite", "paint-green"])), { segments: 7 });
    }
}

/**
 * A walled room on its own (a tavern's wing, a smithy's workshop): x0..x1 by z0..z1, `height`
 * tall, a flat roof behind a parapet, a door on the side facing `door` ("north", "south", "east",
 * "west") at `at` along it (a share of its length).
 */
function annex(solid, [x0, z0, x1, z1], height, name, random, { door = "south", at = 0.5, doorway = { width: m(1), height: m(2.1) }, lean = 0.03, plinth = m(0.2), slits = true } = {}) {
    const outline = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const side = { north: 0, east: 1, south: 2, west: 3 }[door];
    const lengths = [x1 - x0, z1 - z0, x1 - x0, z1 - z0];
    const openings = { [side]: [{ u0: lengths[side] * at - doorway.width / 2, u1: lengths[side] * at + doorway.width / 2, v0: 0, v1: doorway.height, depth: m(0.3), back: material("planks-dark") }] };

    if (slits) {
        for (const k of [0, 1, 2, 3]) {
            if (k !== side && lengths[k] > m(2.5) && random.chance(0.6)) {
                openings[k] = [{ u0: lengths[k] / 2 - m(0.14), u1: lengths[k] / 2 + m(0.14), v0: height - m(1.1), v1: height - m(0.5), depth: m(0.28), back: material("shadow") }];
            }
        }
    }

    solid.extrude(inset(outline, -m(0.12)), 0, plinth, material("mud-dark"));

    const faces = solid.walls(outline, plinth, height, openings, material(name), { lean });
    const top = inset(outline, lean * height);
    const eaves = plinth + height;

    solid.extrude(inset(top, m(0.15)), eaves - m(0.25), eaves - m(0.05), material("mud-dark"), { top: material("mud-pale") });
    band(solid, top, eaves, eaves + m(0.5), m(0.22), name, { rounded: true, lean });

    return { faces, eaves, openings, side };
}

// --- The landmarks ---

/**
 * The tavern: a two-storey town house on the street, its name on a board over the door bay, its
 * sign hanging by the door and benches either side of it; behind, a court shaded by a great mat
 * on forked poles, with cushions and low tables round a hearth, rooms along both sides, and a mat
 * awning on the roof for the evenings.
 */
export async function tavern(piece) {
    await loadSignFont();

    const random = randomFor(piece, 1);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const own = piece.tavern ?? { name: "The Basking Lion", emblem: "tankard", count: 1, storeys: 2 };
    const name = random.pick(MUDS);
    const solid = new Solid();
    const storeys = (own.storeys ?? 2) >= 2 ? [m(3.3), m(2.8)] : [m(3.9)];
    const front = D - m(ENTRY) + m(0.35);
    const [x0, x1] = [m(0.4), W - m(0.4)];
    const back = front - m(4.8);

    toned(solid, random, [m(0.3) + storeys.reduce((a, b) => a + b, 0), m(3)]);

    const house = townHouse(solid, x0, back, x1, front, { storeys, name, random, wealth: 0.85, paint: random.chance(0.6) ? random.pick(PAINTS) : null, doorway: { width: m(1.8), height: m(2.3) }, plinth: m(0.3), roofHouse: false });
    const at = wallPoint(house.front, { lean: house.lean });
    const middle = house.front.length / 2;
    const boardWidth = Math.min(m(4.6), house.front.length - m(3.2));
    const boardHeight = (boardWidth * 9) / 56;

    // Its name over the door bay, its sign hanging from a pole of toron by the door
    plaque(solid, at, house.front.out, [middle - boardWidth / 2, middle + boardWidth / 2, house.bayTop + m(0.15), house.bayTop + m(0.15) + boardHeight], nameBoardTexture({ name: own.name, ground: "#6b3a12", dark: "#2e1706" }), `board ${own.name}`, { proud: m(0.45) });

    const signAt = at(middle + m(2.1), m(3.1), 0);
    const reach = [house.front.out[0] * m(1.3), 0, house.front.out[2] * m(1.3)];

    pole(solid, signAt, add3(signAt, reach), m(0.06), "timber-light", { sides: 5 });
    pole(solid, add3(signAt, [0, -m(0.6), 0]), add3(add3(signAt, times(reach, 0.7)), [0, -m(0.02), 0]), m(0.04), "timber-light", { sides: 4 });

    const texture = emblemSignTexture({ name: own.name, emblem: own.emblem ?? "tankard", count: own.count ?? 1, tint: random.int(0, 5) });
    const [s0, s1] = [add3(signAt, times(reach, 0.25)), add3(signAt, times(reach, 0.95))];
    const sign = [add3(s0, [0, -m(1.15), 0]), add3(s1, [0, -m(1.15), 0]), add3(s1, [0, -m(0.08), 0]), add3(s0, [0, -m(0.08), 0])];

    solid.face(sign, signMaterial(texture, `sign ${own.name}`), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    solid.face([...sign].reverse(), signMaterial(texture, `sign ${own.name}`), [[0, 1], [1, 1], [1, 0], [0, 0]]);

    // Benches of mud either side of the door, a lamp over each
    for (const side of [-1, 1]) {
        const [a, b] = [at(middle + side * m(1.5), 0, m(0.1)), at(middle + side * m(3.1), 0, m(0.6))];

        solid.box(Math.min(a[0], b[0]), 0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), m(0.45), Math.max(a[2], b[2]), material("mud-pale"));
        lamp(solid, at(middle + side * m(1.25), m(2.55), m(0.35)), "glow-lamp", { size: m(0.22), frame: "clay-orange" });
    }

    // The court: rooms along both sides, a wall across the back, its floor of beaten earth
    const wing = Math.min(m(3.4), (x1 - x0) * 0.28);
    const [c0, c1] = [x0 + wing, x1 - wing];

    annex(solid, [x0, m(0.5), x0 + wing, back - m(0.1)], m(2.8), name, random, { door: "east", at: 0.4 });
    annex(solid, [x1 - wing, m(0.5), x1, back - m(0.1)], m(2.8), name, random, { door: "west", at: 0.6 });
    band(solid, [[c1, m(0.7)], [c0, m(0.7)]], 0, m(2.2), m(0.35), name, { closed: false, rounded: true, lean: 0.02 });
    solid.facing([[c0, m(0.03), m(0.9)], [c1, m(0.03), m(0.9)], [c1, m(0.03), back], [c0, m(0.03), back]], [0, 1, 0], material("mud-dark"));

    const [ax0, ax1, az0, az1] = [c0 + m(0.6), c1 - m(0.6), m(1.5), back - m(0.8)];

    if (ax1 - ax0 > m(2) && az1 - az0 > m(2)) {
        awning(solid, ax0, az0, ax1, az1, m(2.6), random);
    }

    hearth(solid, (c0 + c1) / 2, (m(1.2) + back) / 2, random);

    for (const [x, z] of [[c0 + m(1.3), m(2)], [c1 - m(1.3), back - m(1.5)], [c0 + m(1.3), back - m(1.5)], [c1 - m(1.3), m(2)]]) {
        if (x > c0 && x < c1 && z < back - m(0.8)) {
            cushions(solid, x, z, random);
        }
    }

    jars(solid, c1 - m(0.7), m(1.3), random, 4);

    // An awning on the roof, for the evenings
    const roof = house.roof;

    awning(solid, roof[0][0] + m(0.8), roof[0][1] + m(0.6), roof[0][0] + m(3.6), roof[0][1] + m(3), m(2.2), random, { cloth: "awning", y: house.eaves - m(0.05) });

    return solid.toObject();
}

/**
 * The temple of the Six: a hall of mud on a platform, buttresses all round rising into
 * pinnacles, toron bristling from every face, three towers along its front (the middle one over
 * the door) crowned with golden suns, clay vent lids across its roof, and its patron's plaque over
 * the door, up the steps.
 */
export async function church(piece) {
    await loadSignFont();

    const random = randomFor(piece, 2);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const patron = GODS[piece.patron] ?? GODS.aurelia;
    const name = random.pick(["mud", "mud", "mud-pale"]);
    const solid = new Solid();
    const floor = m(0.6);
    const lean = 0.05;
    const height = m(6.2);
    const doorFace = D - m(1.2) + m(0.35);
    const hallFront = doorFace - m(1.4);
    const [x0, x1, z0] = [m(1.1), W - m(1.1), m(1)];

    toned(solid, random, [floor + height]);

    // The platform, and steps up to the door
    solid.extrude([[m(0.4), m(0.3)], [W - m(0.4), m(0.3)], [W - m(0.4), doorFace + m(0.15)], [m(0.4), doorFace + m(0.15)]], 0, floor, material("mud-dark"), { batter: m(0.1), top: material("mud-pale") });

    for (let k = 0; k < 3; k++) {
        const [a, b] = [doorFace + m(0.15) + k * m(0.3), doorFace + m(0.15) + (k + 1) * m(0.3)];

        solid.box(W / 2 - m(1.4) + k * m(0.1), 0, a - m(0.05), W / 2 + m(1.4) - k * m(0.1), floor - k * m(0.2), b, material("mud-pale"));
    }

    // The hall: few openings, high slits between the buttresses
    const outline = [[x0, z0], [x1, z0], [x1, hallFront], [x0, hallFront]];
    const lengths = [x1 - x0, hallFront - z0, x1 - x0, hallFront - z0];
    const bays = lengths.map((length) => Math.max(2, Math.round(length / m(2.6))));
    const openings = {};

    for (const k of [0, 1, 3]) {
        const step = lengths[k] / bays[k];

        openings[k] = Array.from({ length: bays[k] }, (_, b) => ({ u0: (b + 0.5) * step - m(0.16), u1: (b + 0.5) * step + m(0.16), v0: m(3.6), v1: m(4.6), depth: m(0.4), back: material("shadow"), arch: "lancet" }));
    }

    const faces = solid.walls(outline, floor, height, openings, material(name), { lean });

    for (const k of [0, 1, 3]) {
        const face = faces[k];
        const on = wallPoint(face, { lean });

        for (let b = 0; b <= bays[k]; b++) {
            const u = Math.min(Math.max((b * lengths[k]) / bays[k], m(0.35)), lengths[k] - m(0.35));

            buttress(solid, on, face, lean, u, 0, height + m(1.4), m(0.35), m(0.45), name);
        }

        toron(solid, face, lean, [lean, lean], [m(1.4), m(3), height - m(0.5)], m(0.9), random, { clear: openings[k].map(({ u0, u1, v0, v1 }) => [u0, u1, v0, v1]) });
    }

    // The roof, its parapet, and the lids of its vents
    const top = inset(outline, lean * height);
    const eaves = floor + height;

    solid.extrude(inset(top, m(0.15)), eaves - m(0.3), eaves - m(0.05), material("mud-dark"), { top: material("mud-pale") });
    band(solid, top, eaves, eaves + m(0.8), m(0.3), name, { rounded: true, lean });

    for (let x = x0 + m(2); x < x1 - m(1.5); x += m(2.5)) {
        for (let z = z0 + m(2); z < hallFront - m(1.5); z += m(2.5)) {
            solid.lathe(x, z, [[m(0.3), eaves - m(0.05)], [m(0.3), eaves + m(0.2)], [m(0.36), eaves + m(0.22)], [m(0.2), eaves + m(0.34)], [0, eaves + m(0.36)]], material("clay"), { segments: 6 });
        }
    }

    // The three towers: the middle one over the door, the others at the front corners
    const middle = W / 2;
    const door = { u0: m(1.8) - m(0.8), u1: m(1.8) + m(0.8), v0: 0, v1: m(2.6), depth: m(0.35), back: material("planks-dark"), arch: "round" };
    const centre = [middle - m(1.8), hallFront - m(0.6), middle + m(1.8), doorFace];
    const centreFaces = solid.walls([[centre[0], centre[1]], [centre[2], centre[1]], [centre[2], centre[3]], [centre[0], centre[3]]], floor, m(8.6), { 2: [door, { u0: m(1.8) - m(0.18), u1: m(1.8) + m(0.18), v0: m(4.4), v1: m(5.6), depth: m(0.4), back: material("shadow"), arch: "lancet" }] }, material(name), { lean });
    const centreTop = floor + m(8.6);
    const centreHead = inset([[centre[0], centre[1]], [centre[2], centre[1]], [centre[2], centre[3]], [centre[0], centre[3]]], lean * m(8.6));

    solid.extrude(centreHead, centreTop - m(0.02), centreTop, material(name));
    pinnacle(solid, middle, centreTop, (centreHead[0][1] + centreHead[2][1]) / 2, centreHead[1][0] - centreHead[0][0], m(2.6), name, { tip: m(0.08) });
    finial(solid, middle, centreTop + m(2.55), (centreHead[0][1] + centreHead[2][1]) / 2, "sun", random);

    for (const [k, face] of centreFaces.entries()) {
        toron(solid, face, lean, [lean, lean], [m(1.2), m(3.4), m(6.6), m(8)], m(0.8), random, { clear: k === 2 ? [[door.u0, door.u1, 0, door.v1], [m(1.6), m(2), m(4.4), m(5.6)]] : [] });
    }

    studded(solid, centreFaces[2], [door.u0, door.u1, door.v1], door.depth);

    for (const [a, b] of [[x0 - m(0.2), x0 + m(2.2)], [x1 - m(2.2), x1 + m(0.2)]]) {
        tower(solid, [a, hallFront - m(2.2), b, hallFront + m(0.2)], floor, m(7.6), name, random, { lean, top: "sun" });
    }

    // Its patron's plaque over the door
    const on = wallPoint(centreFaces[2], { lean });
    const texture = emblemSignTexture({ name: patron.name, emblem: GOD_EMBLEMS[patron.id] ?? "sun", tint: random.int(0, 5) });

    plaque(solid, on, centreFaces[2].out, [m(1.8) - m(0.55), m(1.8) + m(0.55), m(2.95), m(4.05)], texture, `sign ${patron.name}`, { proud: m(0.12) });

    return solid.toObject();
}

/**
 * The smithy: a mud workshop with its door on the street, and beside it an open shed on forked
 * posts under a thick flat roof of mud on thatch, over a beehive furnace of clay glowing at its
 * mouth, an anvil on a stump, a water trough, hide bellows, a heap of charcoal and iron bars.
 */
export async function blacksmith(piece) {
    await loadSignFont();

    const random = randomFor(piece, 3);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const name = random.pick(MUDS);
    const solid = new Solid();

    toned(solid, random, [m(3), m(2.9)]);

    // The workshop: its door where the town's entrance says (1.2 m west of the middle)
    const front = D - m(2.2) + m(0.3);
    const [x0, x1] = [m(0.5), W / 2 + m(0.6)];
    const doorAt = W / 2 - m(1.2);

    const shop = annex(solid, [x0, m(3.5), x1, front], m(3), name, random, { door: "south", at: (x1 - doorAt) / (x1 - x0), doorway: { width: m(1.3), height: m(2.1) }, plinth: m(0.3) });

    toron(solid, shop.faces[2], 0.03, [0.03, 0.03], [m(1.4), m(2.8)], m(0.8), random, { clear: shop.openings[2].map(({ u0, u1, v0, v1 }) => [u0, u1, v0, v1]) });

    // The shed: six forked posts, a thick flat roof
    const [sx0, sx1, sz0, sz1] = [x1 + m(0.3), W - m(0.4), m(2.5), D - m(1)];
    const roofY = m(2.9);

    for (const x of [sx0 + m(0.2), (sx0 + sx1) / 2, sx1 - m(0.2)]) {
        for (const z of [sz0 + m(0.2), sz1 - m(0.2)]) {
            post(solid, x, 0, z, roofY, m(0.12), "timber", { sides: 6, lean: [random.range(-1, 1) * m(0.06), random.range(-1, 1) * m(0.06)] });

            // (The fork its beam rests in)
            for (const side of [-1, 1]) {
                pole(solid, [x, roofY - m(0.25), z], [x + side * m(0.18), roofY + m(0.05), z], m(0.06), "timber", { sides: 4 });
            }
        }
    }

    for (const z of [sz0 + m(0.2), sz1 - m(0.2)]) {
        pole(solid, [sx0, roofY, z], [sx1, roofY, z], m(0.1), "timber", { sides: 5 });
    }

    const slab = [[sx0 - m(0.3), sz0 - m(0.3)], [sx1 + m(0.2), sz0 - m(0.3)], [sx1 + m(0.2), sz1 + m(0.3)], [sx0 - m(0.3), sz1 + m(0.3)]];

    solid.extrude(slab, roofY + m(0.1), roofY + m(0.5), material("thatch"), { top: material("mud-pale"), bottom: true });

    // Under it: the furnace, glowing; the anvil; the trough; bellows; charcoal
    const [fx, fz] = [(sx0 + sx1) / 2 + m(0.4), (sz0 + sz1) / 2 - m(0.6)];

    solid.lathe(fx, fz, [[m(0.95), 0], [m(0.9), m(0.6)], [m(0.7), m(1.25)], [m(0.35), m(1.6)], [m(0.25), m(1.75)], [0, m(1.75)]], material("mud-dark"), { segments: 10 });
    solid.facing([[fx - m(0.3), m(0.15), fz + m(0.92)], [fx + m(0.3), m(0.15), fz + m(0.92)], [fx + m(0.22), m(0.6), fz + m(0.82)], [fx - m(0.22), m(0.6), fz + m(0.82)]], [0, 0.2, 1], material("glow-fire"));
    lamp(solid, [fx, m(1.8), fz], "glow-fire", { size: m(0.3), frame: null, shape: "orb" });

    for (const side of [-1, 1]) {
        const [bx, bz] = [fx + side * m(0.55), fz - m(1.1)];

        solid.lathe(bx, bz, [[m(0.25), 0], [m(0.32), m(0.15)], [m(0.28), m(0.35)], [0, m(0.4)]], material("hide"), { segments: 7 });
        pole(solid, [bx, m(0.2), bz + m(0.25)], [fx + side * m(0.2), m(0.3), fz + m(0.4)], m(0.05), "clay", { sides: 4 });
    }

    const [ax, az] = [fx - m(1.6), fz + m(1.6)];

    solid.lathe(ax, az, [[m(0.32), 0], [m(0.3), m(0.55)], [0, m(0.55)]], material("bark"), { segments: 7 });
    solid.box(ax - m(0.3), m(0.55), az - m(0.12), ax + m(0.3), m(0.78), az + m(0.12), material("iron-black"));
    pinnacle(solid, ax + m(0.42), m(0.66), az, m(0.18), m(0.24), "iron-black", { sides: 4 });
    solid.box(sx1 - m(1.5), 0, sz1 - m(1.2), sx1 - m(0.3), m(0.5), sz1 - m(0.6), material("mud-dark"));
    solid.box(sx1 - m(1.4), m(0.5), sz1 - m(1.1), sx1 - m(0.4), m(0.46), sz1 - m(0.7), material("water"));
    solid.lathe(sx0 + m(0.9), sz0 + m(0.9), [[m(0.7), 0], [0, m(0.55)]], material("black"), { segments: 8 });

    for (let k = 0; k < 4; k++) {
        const z = sz1 - m(0.4) - k * m(0.14);

        pole(solid, [sx0 + m(0.4), m(0.05), z], [sx0 + m(1.6), m(0.05), z], m(0.04), "iron", { sides: 4 });
    }

    // Its sign: an anvil on a plaque by the door
    const at = wallPoint(shop.faces[2], { lean: 0.03 });
    const u = shop.faces[2].length * ((x1 - doorAt) / (x1 - x0));

    plaque(solid, at, shop.faces[2].out, [u + m(1), u + m(1.9), m(1.6), m(2.5)], emblemSignTexture({ name: "Smithy", emblem: "anvil", tint: random.int(0, 5) }), "sign smithy", { proud: m(0.12) });

    return solid.toObject();
}

/**
 * The adventurers' guild: a lofty hall of one tall storey, its great door bay rising past the
 * parapet with ears on its head, a band of relief chevrons along the top of its front, shallow
 * domes over its bays on the roof, banners hanging from the parapet and its crest over the door.
 */
export async function guild(piece) {
    await loadSignFont();

    const random = randomFor(piece, 4);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const name = random.pick(["mud", "mud-pale"]);
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.35);
    const storeys = [m(5.2)];

    toned(solid, random, [m(5.5)]);

    const house = townHouse(solid, m(0.4), m(0.5), W - m(0.4), front, { storeys, name, random, wealth: 0.9, paint: null, doorway: { width: m(2.2), height: m(2.6) }, plinth: m(0.3), roofHouse: false, parapet: m(1) });
    const at = wallPoint(house.front, { lean: house.lean });
    const middle = house.front.length / 2;

    // The chevrons along the top of the front
    for (let u = m(0.6); u < house.front.length - m(0.6); u += m(0.6)) {
        if (Math.abs(u - middle) < m(1.7)) {
            continue;
        }

        const v = m(4.5);

        solid.facing([at(u - m(0.28), v, m(0.06)), at(u, v + m(0.35), m(0.06)), at(u + m(0.28), v, m(0.06))], house.front.out, material("mud-pale"), undefined, null);
    }

    // Domes over its bays
    const roof = house.roof;
    const across = roof[1][0] - roof[0][0];
    const count = Math.max(2, Math.round(across / m(4.5)));

    for (let k = 0; k < count; k++) {
        const x = roof[0][0] + ((k + 0.5) * across) / count;
        const z = (roof[0][1] + roof[2][1]) / 2;
        const r = Math.min(across / count / 2 - m(0.3), m(2));
        const profile = Array.from({ length: 6 }, (_, i) => [r * Math.cos((i * Math.PI) / 10), house.eaves - m(0.05) + r * 0.55 * Math.sin((i * Math.PI) / 10)]);

        solid.lathe(x, z, [...profile, [0, house.eaves - m(0.05) + r * 0.55]], material("mud-pale"), { segments: 12 });
        finial(solid, x, house.eaves + r * 0.55 - m(0.1), z, "egg", random);
    }

    // Banners down from the parapet, its crest over the door
    for (const u of [middle - m(3.2), middle + m(3.2)]) {
        if (u < m(1) || u > house.front.length - m(1)) {
            continue;
        }

        const colour = random.pick(["indigo", "awning", "ochre"]);
        const cloth = [at(u - m(0.45), house.eaves + m(0.6), m(0.2)), at(u + m(0.45), house.eaves + m(0.6), m(0.2)), at(u + m(0.45), m(2.8), m(0.2)), at(u, m(2.5), m(0.2)), at(u - m(0.45), m(2.8), m(0.2))];

        solid.face(cloth, material(colour), undefined, null);
        solid.face([...cloth].reverse(), material(colour), undefined, null);
        solid.facing([at(u - m(0.2), m(3.6), m(0.21)), at(u + m(0.2), m(3.6), m(0.21)), at(u + m(0.2), m(4), m(0.21)), at(u - m(0.2), m(4), m(0.21))], house.front.out, material("sun-gold"), undefined, null);
    }

    plaque(solid, at, house.front.out, [middle - m(0.6), middle + m(0.6), house.bayTop + m(0.1), house.bayTop + m(1.3)], emblemSignTexture({ name: "Adventurers' Guild", emblem: "shield", tint: random.int(0, 5) }), "sign guild", { proud: m(0.45) });

    return solid.toObject();
}

/**
 * The town hall: a grand town house of two storeys, towers at its front corners with ears on
 * them, "Town Hall" over its door bay, and two stone cats seated either side of the door.
 */
export async function hall(piece) {
    await loadSignFont();

    const random = randomFor(piece, 5);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const name = random.pick(["mud", "mud-pale", "mud-red"]);
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.35);
    const storeys = [m(3.4), m(3)];

    toned(solid, random, [m(6.7)]);

    const house = townHouse(solid, m(0.5), m(0.5), W - m(0.5), front, { storeys, name, random, wealth: 1, paint: random.pick(PAINTS), doorway: { width: m(2), height: m(2.5) }, plinth: m(0.3), roofHouse: true });
    const at = wallPoint(house.front, { lean: house.lean });
    const middle = house.front.length / 2;

    for (const [a, b] of [[m(0.1), m(2.3)], [W - m(2.3), W - m(0.1)]]) {
        tower(solid, [a, front - m(2.2), b, front + m(0.2)], 0, house.top + m(0.6), name, random, { lean: house.lean, cap: "ears" });
    }

    const boardWidth = Math.min(m(4.4), house.front.length - m(5.2));

    plaque(solid, at, house.front.out, [middle - boardWidth / 2, middle + boardWidth / 2, house.bayTop + m(0.1), house.bayTop + m(0.1) + (boardWidth * 9) / 56], nameBoardTexture({ name: "Town Hall", ground: "#5a2410", dark: "#2a1006" }), "board hall", { proud: m(0.45) });

    for (const side of [-1, 1]) {
        const [x, , z] = at(middle + side * m(2), 0, m(1));

        guardian(solid, x, z, 0);
    }

    return solid.toObject();
}

/**
 * A capital's keep: a kasbah's tower house, rammed earth below and smooth mud above, battered,
 * a taller tower at each corner with ears on its top, bands of relief chevrons round its upper
 * storeys, its door up a flight of steps between two long banners.
 */
export async function keep(piece) {
    await loadSignFont();

    const random = randomFor(piece, 6);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const name = random.pick(["mud", "mud-red"]);
    const solid = new Solid();
    const floor = m(0.8);
    const lean = 0.06;
    const height = m(11 + Math.min(piece.w, piece.h) * 0.6);
    const doorFace = D - m(1.4) + m(0.35);
    const [x0, x1, z0] = [m(1.6), W - m(1.6), m(1.4)];
    const outline = [[x0, z0], [x1, z0], [x1, doorFace], [x0, doorFace]];

    toned(solid, random, [height]);

    // The rammed earth below (its lifts in bands), the mass, windows in rows up it
    solid.extrude(inset(outline, -m(0.4)), 0, floor, material("mud-dark"), { batter: m(0.1) });

    const lengths = [x1 - x0, doorFace - z0, x1 - x0, doorFace - z0];
    const openings = {};

    for (const k of [0, 1, 2, 3]) {
        const count = Math.max(1, Math.round(lengths[k] / m(3)));

        openings[k] = [];

        for (let b = 0; b < count; b++) {
            for (const v of [m(4.5), m(7.5)]) {
                const u = ((b + 0.5) * lengths[k]) / count;

                if (k === 2 && Math.abs(u - lengths[k] / 2) < m(1.6) && v < m(5)) {
                    continue;
                }

                openings[k].push({ u0: u - m(0.25), u1: u + m(0.25), v0: v, v1: v + m(0.9), depth: m(0.4), back: material("shadow"), arch: random.chance(0.5) ? "keyhole" : "round" });
            }
        }
    }

    const door = { u0: lengths[2] / 2 - m(1.2), u1: lengths[2] / 2 + m(1.2), v0: 0, v1: m(3.2), depth: m(0.35), back: material("planks-dark"), arch: "round" };

    openings[2].push(door);

    const faces = solid.walls(outline, floor, height, openings, material(name), { lean });

    for (const face of faces) {
        const on = wallPoint(face, { lean });

        // (Relief chevrons in bands round its upper storeys)
        for (const v of [m(6.3), height - m(1.4)]) {
            for (let u = m(0.8); u < face.length - m(0.8); u += m(0.7)) {
                solid.facing([on(u - m(0.3), v, m(0.05)), on(u, v + m(0.4), m(0.05)), on(u + m(0.3), v, m(0.05))], face.out, material("mud-pale"), undefined, null);
            }
        }
    }

    studded(solid, faces[2], [door.u0, door.u1, door.v1], door.depth);

    const top = inset(outline, lean * height);
    const eaves = floor + height;

    solid.extrude(inset(top, m(0.15)), eaves - m(0.3), eaves - m(0.05), material("mud-dark"), { top: material("mud-pale") });
    band(solid, top, eaves, eaves + m(1), m(0.35), name, { rounded: true, lean });

    // The corner towers
    for (const [x, z] of outline) {
        const half = m(1.5);

        tower(solid, [x - half, z - half, x + half, z + half], 0, eaves + m(2.4), name, random, { lean, cap: "ears" });
    }

    // Steps up to the door, banners either side
    const at = wallPoint(faces[2], { lean });
    const middle = faces[2].length / 2;

    const foot = at(middle, 0, 0);

    steps(solid, foot[0], foot[2] + m(0.3) * 4 + m(0.05), 0, floor, [0, -1], m(3.2), "mud-pale", { tread: m(0.3), riser: floor / 4 });

    // (Their sun on them, stirring in the breeze: world/cloth.js; hung out from the wall's top
    // as far as it leans in over their length, so they hang clear of it to their feet)
    for (const side of [-1, 1]) {
        (solid.cloth ??= []).push({ at: at(middle + side * m(2.2), m(9.5), m(0.08) + lean * m(6)), out: [...faces[2].out], width: m(1), drop: m(6), kind: "wall", look: "cat" });
    }

    return solid.toObject();
}

/**
 * The market: stalls in a loose grid, each on four poles under a mat, a mud counter along its
 * front heaped with pots, calabashes and bolts of cloth, some under cloth awnings.
 */
export function market(piece) {
    const random = randomFor(piece, 7);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const size = m(2.4);
    const [across, deep] = [Math.floor((W - m(1)) / (size + m(1.2))), Math.floor((D - m(1)) / (size + m(1.4)))];

    toned(solid, random, []);

    for (let i = 0; i < across; i++) {
        for (let j = 0; j < deep; j++) {
            if (random.chance(0.12)) {
                continue;
            }

            const [x, z] = [m(0.8) + i * (size + m(1.2)) + random.range(-1, 1) * m(0.2), m(0.8) + j * (size + m(1.4)) + random.range(-1, 1) * m(0.2)];

            awning(solid, x, z, x + size, z + size * 0.85, m(random.range(2.1, 2.4)), random, { cloth: random.chance(0.35) ? random.pick(["awning", "indigo", "ochre"]) : "matting" });
            solid.box(x + m(0.1), 0, z + size * 0.85 - m(0.55), x + size - m(0.1), m(0.8), z + size * 0.85 - m(0.05), material("mud-pale"));

            for (let k = 0; k < 6; k++) {
                const gx = x + m(0.3) + k * ((size - m(0.6)) / 5);

                if (random.chance(0.5)) {
                    jar(solid, gx, z + size * 0.85 - m(0.3), m(random.range(0.25, 0.4)), random.pick(["clay", "clay-orange", "calabash"]), m(0.8));
                } else {
                    solid.box(gx - m(0.14), m(0.8), z + size * 0.85 - m(0.45), gx + m(0.14), m(0.8) + m(random.range(0.12, 0.3)), z + size * 0.85 - m(0.15), material(random.pick(["indigo", "awning", "ochre", "kaolin", "calabash", "apples"])));
                }
            }
        }
    }

    return solid.toObject();
}

/** A well under a little mat roof, where a human town would have its windmill. */
export function windmill(piece) {
    const random = randomFor(piece, 8);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);
    band(solid, circle(W / 2, D / 2, m(0.9), 12), 0, m(0.8), m(0.3), "mud", { rounded: true });
    solid.facing(circle(W / 2, D / 2, m(0.62), 12).map(([x, z]) => [x, m(0.2), z]), [0, 1, 0], material("water"));
    awning(solid, W / 2 - m(1.4), D / 2 - m(1.4), W / 2 + m(1.4), D / 2 + m(1.4), m(2.4), random);
    jars(solid, W / 2 + m(1.8), D / 2 + m(1.2), random);

    return solid.toObject();
}

/** Every one of the cat folk's special buildings, by name. */
export const LANDMARKS = Object.freeze({ tavern, church, blacksmith, guild, hall, keep, market, windmill });

/** A cat folk town's special building (its layout piece). */
export function landmark(piece) {
    return (LANDMARKS[piece.name] ?? market)(piece);
}

export { buttress, tower, plaque, guardian, annex, cushions, GOD_EMBLEMS };
