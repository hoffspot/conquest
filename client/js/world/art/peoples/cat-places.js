// The cat folk's own places, found only in their lands (core/worldplan/races.js), their castles
// and their towns' walls:
//
// - The sun temple: a great platform up a broad stair, an open court of the sun in front (a squat
//   obelisk tipped with gold, an altar of five slabs, nine round basins) and behind it the prayer
//   hall, buttressed and bristling with toron, three towers crowned with golden suns along its
//   front; after Djenné's mosque and the sun temple of Abu Gurob.
// - Pride rock: a kopje, rounded granite boulders heaped up with one slab jutting out high over
//   the plain, dry-stone terrace walls threading between them with a chevron band, a solid cone
//   tower (after Great Zimbabwe's), the pride's round hall in the saddle, acacias.
// - The watering hole: a basin sunk inside its banks, stepped down on every side to the water,
//   ledges to lounge on, an island shrine, channels feeding it, palms and acacias round the rim.
// - The castle: a kasbah, four battered corner towers round a court in four planted quarters,
//   curtain walls with a walk behind their parapets, a gate with a bent way in, the lord's tower
//   house at the back.
// - Town walls of mud leaning in as they rise, rounded along the top with pinnacles like ears,
//   bristling with toron; gatehouses with two ear towers; round bastions.

import { material } from "../engine/materials.js";
import { add3, inset, Solid } from "../engine/solid.js";
import { ears, finial, granary, hut, jars, MUDS, studded, toron } from "./cat.js";
import { buttress, guardian, tower } from "./cat-landmarks.js";
import { band, CELL, circle, m, oval, pinnacle, pole, randomFor, steps, wallPoint, weathering } from "./kit.js";

const WASHES = ["mud", "mud-pale", "mud-red", "mud-dark"];

function toned(solid, random, eaves = []) {
    solid.tone = weathering({ seed: random.int(0, 1e6), eaves, washes: WASHES, tint: [random.range(0.96, 1.04), random.range(0.95, 1.03), random.range(0.93, 1.02)], mottle: ["thatch", "mud-pale", "granite"] });
}

/**
 * A boulder: a rounded, uneven lump of rock rx by rz across and ry tall standing on y (sunk a
 * little), its surface wandering in and out.
 */
export function boulder(solid, cx, cz, rx, ry, rz, random, { name = "rock", y = 0, segments = 10, flat = 0.25 } = {}) {
    const bumps = Array.from({ length: segments }, () => random.range(0.82, 1.12));
    const rings = [];
    const levels = 6;

    for (let k = 0; k <= levels; k++) {
        const t = k / levels;
        // (Squat, flatter on top: a weathered granite dome)
        const angle = -0.35 + t * (Math.PI / 2 + 0.35);
        const [r, h] = [Math.cos(angle), (Math.sin(angle) + 0.34) / 1.34];

        rings.push(Array.from({ length: segments }, (_, i) => {
            const a = (i * Math.PI * 2) / segments;
            const bump = k === levels ? 1 : bumps[i] * (1 + 0.06 * Math.sin(k * 1.7 + i));

            return [cx + Math.cos(a) * rx * r * bump, y + ry * (h * (1 - flat) + flat * Math.min(1, h * 1.4)), cz + Math.sin(a) * rz * r * bump];
        }));
    }

    rings[levels] = rings[levels].map(() => [cx, y + ry, cz]);
    solid.loft(rings, material(name));
}

/** A flat-topped acacia: a leaning trunk forking into boughs under a spreading, flat crown. */
export function acacia(solid, x, z, height, random, { y = 0 } = {}) {
    const lean = [random.range(-1, 1) * height * 0.08, random.range(-1, 1) * height * 0.08];
    const fork = [x + lean[0], y + height * 0.55, z + lean[1]];

    solid.tube([[x, y, z], [x + lean[0] * 0.4, y + height * 0.3, z + lean[1] * 0.4], fork], [height * 0.05, height * 0.04, height * 0.035], material("bark"), { sides: 6 });

    const crowns = random.int(2, 3);

    for (let k = 0; k < crowns; k++) {
        const angle = (k * Math.PI * 2) / crowns + random.range(-0.4, 0.4);
        const reach = height * random.range(0.22, 0.38);
        const top = [fork[0] + Math.cos(angle) * reach, y + height * random.range(0.82, 0.95), fork[2] + Math.sin(angle) * reach];

        solid.tube([fork, top], [height * 0.03, height * 0.018], material("bark"), { sides: 5 });

        const r = height * random.range(0.28, 0.4);

        solid.lathe(top[0], top[2], [[0, top[1] - height * 0.02], [r * 0.9, top[1] - height * 0.01], [r, top[1] + height * 0.04], [r * 0.7, top[1] + height * 0.1], [0, top[1] + height * 0.12]], material("leaves"), { segments: 9 });
    }
}

/** A palm: a curving ringed trunk and a head of drooping fronds. */
export function palm(solid, x, z, height, random, { y = 0 } = {}) {
    const bend = [random.range(-1, 1) * height * 0.18, random.range(-1, 1) * height * 0.18];
    const trunk = Array.from({ length: 5 }, (_, k) => {
        const t = k / 4;

        return [x + bend[0] * t * t, y + height * t, z + bend[1] * t * t];
    });
    const head = trunk.at(-1);

    solid.tube(trunk, trunk.map((_, k) => height * (0.035 - k * 0.004)), material("bark"), { sides: 6 });

    for (let k = 0; k < 8; k++) {
        const angle = (k * Math.PI * 2) / 8 + random.range(-0.2, 0.2);
        const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
        const long = height * random.range(0.28, 0.38);
        const mid = [head[0] + dx * long * 0.5, head[1] + height * 0.06, head[2] + dz * long * 0.5];
        const tip = [head[0] + dx * long, head[1] - height * 0.08, head[2] + dz * long];
        const side = [-dz * height * 0.06, 0, dx * height * 0.06];

        for (const [a, b] of [[head, mid], [mid, tip]]) {
            const leaf = [a, b, add3(b, side.map((v) => v * (b === tip ? 0.3 : 1))), add3(a, side.map((v) => v * 0.4))];

            solid.face(leaf, material("leaves"));
            solid.face([...leaf].reverse(), material("leaves"));
        }
    }
}

/**
 * The sun temple (a structure w by h plots): its platform and stair, the court of the sun with
 * its obelisk, altar and basins, and the prayer hall behind with its three towers.
 */
function sunTemple(piece) {
    const random = randomFor(piece, 11);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const name = random.pick(["mud", "mud-pale"]);
    const floor = m(2.5);
    const lean = 0.05;

    toned(solid, random, [floor + m(7)]);

    // The platform, battered, and its broad stair up the middle of its front
    const [px0, px1, pz0, pz1] = [m(1), W - m(1), m(1), D - m(5)];

    solid.extrude([[px0, pz0], [px1, pz0], [px1, pz1], [px0, pz1]], 0, floor, material("mud-dark"), { batter: m(0.5), top: material("mud-pale") });
    steps(solid, W / 2, D - m(0.8), 0, floor, [0, -1], m(8), "mud-pale", { tread: m(0.34), riser: floor / 12 });

    for (const side of [-1, 1]) {
        const x = W / 2 + side * m(4.4);

        band(solid, [[x, D - m(0.8)], [x, pz1 - m(0.4)]], 0, floor + m(0.6), m(0.6), name, { closed: false, rounded: true });
        guardian(solid, x, D - m(1.2), 0, "mud-pale");
    }

    // The court of the sun, walled low round the platform's front half
    const hallFront = pz0 + (pz1 - pz0) * 0.46;

    band(solid, [[px0 + m(0.6), hallFront], [px0 + m(0.6), pz1 - m(0.6)], [W / 2 - m(4), pz1 - m(0.6)]], floor, floor + m(1.6), m(0.4), name, { closed: false, rounded: true, lean: 0.03 });
    band(solid, [[W / 2 + m(4), pz1 - m(0.6)], [px1 - m(0.6), pz1 - m(0.6)], [px1 - m(0.6), hallFront]], floor, floor + m(1.6), m(0.4), name, { closed: false, rounded: true, lean: 0.03 });

    const [ox, oz] = [W / 2, (hallFront + pz1) / 2 + m(1)];

    // The obelisk on its base, tipped with gold
    solid.extrude([[ox - m(1.5), oz - m(1.5)], [ox + m(1.5), oz - m(1.5)], [ox + m(1.5), oz + m(1.5)], [ox - m(1.5), oz + m(1.5)]], floor, floor + m(1.2), material("granite"), { batter: m(0.2) });

    const [shaft0, shaft1] = [floor + m(1.2), floor + m(7.2)];
    const square = (half, y) => [[ox - half, y, oz - half], [ox + half, y, oz - half], [ox + half, y, oz + half], [ox - half, y, oz + half]];

    solid.loft([square(m(0.8), shaft0), square(m(0.55), shaft1)], material("stone-lime"));
    pinnacle(solid, ox, shaft1, oz, m(1.1), m(0.9), "sun-gold");

    // The altar of five slabs, and nine basins in threes either side
    const [ax, az] = [ox, oz + m(3.6)];

    solid.box(ax - m(1.2), floor, az - m(0.6), ax + m(1.2), floor + m(0.9), az + m(0.6), material("stone-lime"));

    for (const [dx, dz] of [[-1.7, 0], [1.7, 0], [0, -1.1], [0, 1.1]]) {
        solid.box(ax + m(dx) - m(0.45), floor, az + m(dz) - m(0.45), ax + m(dx) + m(0.45), floor + m(0.5), az + m(dz) + m(0.45), material("stone-lime"));
    }

    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < (side < 0 ? 5 : 4) - i && j < 3; j++) {
                const [bx, bz] = [ox + side * m(5 + i * 2.2), hallFront + m(2.2) + j * m(2.4)];

                if (bx < px0 + m(1.8) || bx > px1 - m(1.8)) {
                    continue;
                }

                band(solid, circle(bx, bz, m(0.8), 10), floor, floor + m(0.5), m(0.2), "stone-lime", { rounded: true });
                solid.facing(circle(bx, bz, m(0.62), 10).map(([x, z]) => [x, floor + m(0.4), z]), [0, 1, 0], material("water"));
            }
        }
    }

    // The prayer hall
    const [hx0, hx1, hz0] = [px0 + m(1), px1 - m(1), pz0 + m(0.8)];
    const outline = [[hx0, hz0], [hx1, hz0], [hx1, hallFront], [hx0, hallFront]];
    const height = m(7);
    const lengths = [hx1 - hx0, hallFront - hz0, hx1 - hx0, hallFront - hz0];
    const openings = {};
    const bays = lengths.map((length) => Math.max(2, Math.round(length / m(2.5))));

    for (const k of [0, 1, 2, 3]) {
        const step = lengths[k] / bays[k];

        openings[k] = Array.from({ length: bays[k] }, (_, b) => ({ u0: (b + 0.5) * step - m(0.16), u1: (b + 0.5) * step + m(0.16), v0: m(4), v1: m(5.2), depth: m(0.45), back: material("shadow"), arch: "lancet" })).filter(({ u0 }) => k !== 2 || Math.abs(u0 - lengths[2] / 2) > m(3));
    }

    const doorway = { u0: lengths[2] / 2 - m(1.1), u1: lengths[2] / 2 + m(1.1), v0: 0, v1: m(3.4), depth: m(0.45), back: material("planks-dark"), arch: "round" };

    openings[2].push(doorway);

    const faces = solid.walls(outline, floor, height, openings, material(name), { lean });

    for (const [k, face] of faces.entries()) {
        const on = wallPoint(face, { lean });

        for (let b = 0; b <= bays[k]; b++) {
            const u = Math.min(Math.max((b * lengths[k]) / bays[k], m(0.4)), lengths[k] - m(0.4));

            if (k === 2 && Math.abs(u - lengths[2] / 2) < m(1.8)) {
                continue;
            }

            buttress(solid, on, face, lean, u, 0, height + m(1.6), m(0.4), m(0.5), name);
        }

        toron(solid, face, lean, [lean, lean], [m(1.4), m(3), height - m(0.6)], m(0.9), random, { clear: openings[k].map(({ u0, u1, v0, v1 }) => [u0, u1, v0, v1]) });
    }

    studded(solid, faces[2], [doorway.u0, doorway.u1, doorway.v1], doorway.depth);

    const top = inset(outline, lean * height);
    const eaves = floor + height;

    solid.extrude(inset(top, m(0.15)), eaves - m(0.3), eaves - m(0.05), material("mud-dark"), { top: material("mud-pale") });
    band(solid, top, eaves, eaves + m(0.9), m(0.3), name, { rounded: true, lean });

    for (let x = hx0 + m(2); x < hx1 - m(1.5); x += m(2.6)) {
        for (let z = hz0 + m(2); z < hallFront - m(1.5); z += m(2.6)) {
            solid.lathe(x, z, [[m(0.3), eaves - m(0.05)], [m(0.3), eaves + m(0.2)], [m(0.36), eaves + m(0.22)], [m(0.2), eaves + m(0.34)], [0, eaves + m(0.36)]], material("clay"), { segments: 6 });
        }
    }

    // Its three towers along the front, the middle one tallest
    const middle = W / 2;

    for (const x of [hx0 + m(1.2), hx1 - m(1.2)]) {
        tower(solid, [x - m(1.6), hallFront - m(2.2), x + m(1.6), hallFront + m(0.6)], floor, m(13), name, random, { lean, top: "sun" });
    }

    // (The middle one stands out over the door, the door let into its foot)
    const door = { u0: m(1.9) - m(1.1), u1: m(1.9) + m(1.1), v0: 0, v1: m(3.4), depth: m(0.45), back: material("planks-dark"), arch: "round" };

    tower(solid, [middle - m(1.9), hallFront - m(0.6), middle + m(1.9), hallFront + m(1.3)], floor, m(15.5), name, random, { lean, top: "sun", openings: { 2: [door] } });

    return solid.toObject();
}

/**
 * Pride rock: boulders heaped into a kopje, one slab jutting out high over the plain, dry-stone
 * terraces threading between them, a solid cone tower, the pride's round hall in the saddle.
 */
function prideRock(piece) {
    const random = randomFor(piece, 12);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, [m(2.4)]);

    const [cx, cz] = [W / 2, D * 0.45];

    // The heap: a great boulder at the back, lesser ones round it
    boulder(solid, cx - m(3), cz - m(3), m(9), m(9), m(7), random);
    boulder(solid, cx + m(6), cz - m(1), m(6), m(6.5), m(6), random);
    boulder(solid, cx - m(9), cz + m(2), m(5), m(4.5), m(5), random);
    boulder(solid, cx + m(1), cz + m(4), m(4), m(3), m(3.5), random);

    for (let k = 0; k < 7; k++) {
        const [x, z] = [cx + random.range(-1, 1) * m(12), cz + random.range(0.3, 1) * m(9)];

        boulder(solid, x, z, m(random.range(0.8, 2)), m(random.range(0.6, 1.6)), m(random.range(0.8, 2)), random);
    }

    // The promontory: a slab jutting out and up over the front from the great boulder, thick
    // at its root and thinning to its tip
    const section = (along, y, half, thick) => [[cx - m(2) - half, y, cz + along], [cx - m(2) + half, y + m(0.2), cz + along], [cx - m(2) + half * 0.8, y + thick, cz + along], [cx - m(2) - half * 0.9, y + thick * 0.9, cz + along]];

    solid.loft([section(-m(3), m(6.2), m(3), m(2.2)), section(m(3), m(7), m(2.4), m(1.6)), section(m(8), m(7.8), m(1.5), m(0.9)), section(m(10.5), m(8.2), m(0.5), m(0.3))], material("rock"));
    solid.facing(section(-m(3), m(6.2), m(3), m(2.2)), [0, 0, -1], material("rock"));
    solid.facing(section(m(10.5), m(8.2), m(0.5), m(0.3)), [0, 0.3, 1], material("rock"));

    // Terrace walls of dry stone, curving between the boulders, a chevron band near the top
    const terrace = Array.from({ length: 9 }, (_, k) => {
        const angle = Math.PI * 0.1 + (k / 8) * Math.PI * 0.8;

        return [cx + Math.cos(angle) * m(13), cz + Math.sin(angle) * m(8)];
    });

    band(solid, terrace, 0, m(2.4), m(0.9), "granite", { closed: false, lean: 0.06 });

    for (let k = 0; k < terrace.length - 1; k++) {
        const [[ax, az], [bx, bz]] = [terrace[k], terrace[k + 1]];
        const long = Math.hypot(bx - ax, bz - az);
        const out = [(bz - az) / long, 0, -(bx - ax) / long];
        const face = { origin: [ax, 0, az], across: [(bx - ax) / long, 0, (bz - az) / long], out: out[2] > 0 ? out : out.map((v) => -v), length: long };
        const on = wallPoint(face, { lean: 0.06 });

        for (let u = m(0.4); u < long - m(0.3); u += m(0.55)) {
            solid.facing([on(u - m(0.25), m(1.8), m(0.04)), on(u, m(2.15), m(0.04)), on(u + m(0.25), m(1.8), m(0.04))], face.out, material("rock-dark"), undefined, null);
        }
    }

    // The cone tower, solid, of dry stone
    const [tx, tz] = [cx + m(11), cz + m(1)];

    solid.lathe(tx, tz, [[m(2.6), 0], [m(2.2), m(4)], [m(1.5), m(8)], [m(1.05), m(10)], [0, m(10)]], material("granite"), { segments: 14 });

    for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI * 2) / 12;

        solid.facing([[tx + Math.cos(a) * m(1.4), m(8.4), tz + Math.sin(a) * m(1.4)], [tx + Math.cos(a + 0.26) * m(1.35), m(8.9), tz + Math.sin(a + 0.26) * m(1.35)], [tx + Math.cos(a + 0.52) * m(1.3), m(8.4), tz + Math.sin(a + 0.52) * m(1.3)]].map(([x, y, z]) => [x + Math.cos(a + 0.26) * m(0.05), y, z + Math.sin(a + 0.26) * m(0.05)]), [Math.cos(a + 0.26), 0, Math.sin(a + 0.26)], material("rock-dark"), undefined, null);
    }

    // The pride's round hall, and huts, in the saddle before the rock
    hut(solid, cx - m(5), cz + m(9), { r: m(3.2), wall: m(2.6), name: "mud", random, paint: ["mud-red", "kaolin", "black"], top: "sun", pitch: 1.1 });
    hut(solid, cx + m(4), cz + m(10), { r: m(2.2), name: random.pick(MUDS), random, top: "pot", facing: -0.4 });
    granary(solid, cx - m(10), cz + m(9.5), { random });
    acacia(solid, cx + m(14), cz + m(9), m(7), random);
    acacia(solid, cx - m(15), cz - m(4), m(8), random);

    return solid.toObject();
}

/**
 * The watering hole: a basin inside its banks, stepped down to the water on every side, ledges
 * of stone to lie on, an island shrine, channels running in, palms and acacias round the rim.
 */
function wateringHole(piece) {
    const random = randomFor(piece, 13);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const [rx, rz] = [W / 2 - m(2), D / 2 - m(2)];

    toned(solid, random, []);

    // The bank: raised round the rim, then stepping down inside to the water
    const count = 28;
    const ring = (sx, sz, y) => oval(cx, cz, sx, sz, count).map(([x, z]) => [x, y, z]);
    const levels = [[1, 0], [1.02, m(0.3)], [0.98, m(1.3)], [0.93, m(1.35)], [0.9, m(0.95)], [0.86, m(0.95)], [0.83, m(0.55)], [0.8, m(0.55)], [0.77, m(0.2)]];
    const outward = (point) => [point[0] - cx, m(4), point[2] - cz];
    const inward = (point) => [cx - point[0], m(4), cz - point[2]];

    // (Outer slope and the rim facing out and up, then steps down inside: each ledge facing up,
    // each riser facing in)
    solid.loft(levels.slice(0, 4).map(([k, y]) => ring(rx * k, rz * k, y)), material("mud-dark"), { out: outward });

    for (let k = 3; k < levels.length - 1; k++) {
        const [[ka, ya], [kb, yb]] = [levels[k], levels[k + 1]];

        solid.loft([ring(rx * ka, rz * ka, ya), ring(rx * kb, rz * kb, yb)], material(ya === yb ? "mud-pale" : "mud-dark"), { out: ya === yb ? [0, 1, 0] : inward });
    }

    solid.facing(ring(rx * 0.77, rz * 0.77, m(0.2)).reverse(), [0, 1, 0], material("water"));
    solid.loft([ring(rx * 0.93, rz * 0.93, m(1.35)), ring(rx * 0.93 + 1, rz * 0.93 + 1, m(1.36))], material("granite"));

    // Stone ledges on the steps, to lie on in the sun
    for (let k = 0; k < 6; k++) {
        const angle = random.next() * Math.PI * 2;
        const [lx, lz] = [cx + Math.cos(angle) * rx * 0.88, cz + Math.sin(angle) * rz * 0.88];

        solid.extrude(oval(lx, lz, m(1.1), m(0.7), 8, angle), m(0.95), m(1.15), material("granite"));
    }

    // The island shrine
    const [ix, iz] = [cx + rx * 0.25, cz - rz * 0.1];

    solid.extrude(circle(ix, iz, m(2.2), 12), 0, m(0.5), material("granite"), { batter: m(0.3) });
    hut(solid, ix, iz, { r: m(1.3), wall: m(1.8), name: "mud-pale", random, top: "sun", door: true, facing: 0.3 });
    pole(solid, [ix + m(1.5), m(0.5), iz + m(1)], [ix + m(1.5), m(3.5), iz + m(1)], m(0.06), "timber");
    finial(solid, ix + m(1.5), m(3.5), iz + m(1), "sun", random);

    // Channels running in from the edge, lined with stone
    for (const angle of [Math.PI * 0.15, Math.PI * 1.2]) {
        const [a, b] = [[cx + Math.cos(angle) * rx * 1.25, cz + Math.sin(angle) * rz * 1.25], [cx + Math.cos(angle) * rx * 0.95, cz + Math.sin(angle) * rz * 0.95]];

        for (const side of [-1, 1]) {
            const [nx, nz] = [-Math.sin(angle) * side * m(0.6), Math.cos(angle) * side * m(0.6)];

            band(solid, [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz]], 0, m(0.5), m(0.3), "granite", { closed: false });
        }

        solid.facing([[a[0] - Math.sin(angle) * m(0.45), m(0.15), a[1] + Math.cos(angle) * m(0.45)], [b[0] - Math.sin(angle) * m(0.45), m(0.15), b[1] + Math.cos(angle) * m(0.45)], [b[0] + Math.sin(angle) * m(0.45), m(0.15), b[1] - Math.cos(angle) * m(0.45)], [a[0] + Math.sin(angle) * m(0.45), m(0.15), a[1] - Math.cos(angle) * m(0.45)]], [0, 1, 0], material("water"));
    }

    // Palms and acacias round the rim
    for (let k = 0; k < 9; k++) {
        const angle = (k / 9) * Math.PI * 2 + random.range(-0.2, 0.2);
        const [x, z] = [cx + Math.cos(angle) * rx * random.range(1.02, 1.12), cz + Math.sin(angle) * rz * random.range(1.02, 1.12)];

        if (x < m(1) || z < m(1) || x > W - m(1) || z > D - m(1)) {
            continue;
        }

        (k % 3 === 0 ? acacia : palm)(solid, x, z, m(random.range(5, 8)), random);
    }

    jars(solid, cx - rx * 0.9, cz + rz * 1.02, random, 4);

    return solid.toObject();
}

/**
 * A castle: a kasbah, battered corner towers with ears on their tops, curtain walls with a walk
 * behind their parapets, its gate in a tower of its own set off the middle (the way in turning
 * inside), a court in four planted quarters round a fountain, the lord's tower house at the back.
 */
function castle(piece) {
    const random = randomFor(piece, 14);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const name = random.pick(["mud", "mud-red"]);
    const lean = 0.06;
    const [x0, x1, z0, z1] = [m(3), W - m(3), m(3), D - m(3)];
    const curtain = m(10);

    toned(solid, random, [curtain, m(14)]);

    // The curtain walls: thick, battered on the outside, a walk behind the parapet
    const ring = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const gateAt = (x0 + x1) / 2 + m(4);

    band(solid, [[gateAt - m(2.2), z1], [x0, z1], [x0, z0], [x1, z0], [x1, z1], [gateAt + m(2.2), z1]], 0, curtain, m(2.4), name, { closed: false, lean });
    band(solid, [[gateAt - m(2.2), z1 - m(0.1)], [x0 + m(0.1), z1 - m(0.1)], [x0 + m(0.1), z0 + m(0.1)], [x1 - m(0.1), z0 + m(0.1)], [x1 - m(0.1), z1 - m(0.1)], [gateAt + m(2.2), z1 - m(0.1)]].map(([x, z]) => [x, z]), curtain, curtain + m(1.1), m(0.4), name, { closed: false, rounded: true });

    // (Toron down its outer faces)
    for (const [k, [ax, az]] of ring.entries()) {
        const [bx, bz] = ring[(k + 1) % 4];
        const long = Math.hypot(bx - ax, bz - az);
        const across = [(bx - ax) / long, 0, (bz - az) / long];
        const [ox, oz] = [across[2], -across[0]];
        const outward = (ox * ((ax + bx) / 2 - W / 2) + oz * ((az + bz) / 2 - D / 2)) > 0 ? [ox, 0, oz] : [-ox, 0, -oz];

        toron(solid, { origin: [ax, 0, az], across, out: outward, length: long }, lean, [lean, lean], [m(2), m(5), m(8)], m(1.2), random, { margin: m(3.5), clear: k === 2 ? [[Math.abs(gateAt - bx) - m(2.5), Math.abs(gateAt - bx) + m(2.5), 0, curtain]] : [] });
    }

    // The corner towers
    for (const [x, z] of ring) {
        tower(solid, [x - m(3), z - m(3), x + m(3), z + m(3)], 0, m(15), name, random, { lean, cap: "ears" });
    }

    // The gate tower, its door studded, and the way in turning behind it
    const gate = { u0: m(1.9), u1: m(4.1), v0: 0, v1: m(3.8), depth: m(0.5), back: null, arch: "round" };

    tower(solid, [gateAt - m(3), z1 - m(2.5), gateAt + m(3), z1 + m(2.5)], 0, m(12.5), name, random, { lean, cap: "ears", openings: { 2: [{ ...gate, back: material("planks-dark") }] } });
    guardian(solid, gateAt - m(3.8), z1 + m(3.2), 0, "mud-pale");
    guardian(solid, gateAt + m(3.8), z1 + m(3.2), 0, "mud-pale");

    // The court: four planted quarters round a fountain
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2 + m(3)];
    const quarter = m(4.5);

    solid.facing([[x0 + m(2.4), m(0.03), z0 + m(2.4)], [x1 - m(2.4), m(0.03), z0 + m(2.4)], [x1 - m(2.4), m(0.03), z1 - m(2.4)], [x0 + m(2.4), m(0.03), z1 - m(2.4)]], [0, 1, 0], material("mud-pale"));

    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const [qx, qz] = [cx + dx * (quarter / 2 + m(1)), cz + dz * (quarter / 2 + m(1))];

        solid.extrude([[qx - quarter / 2, qz - quarter / 2], [qx + quarter / 2, qz - quarter / 2], [qx + quarter / 2, qz + quarter / 2], [qx - quarter / 2, qz + quarter / 2]], 0, m(0.35), material("mud-dark"), { top: material("leaves") });
        palm(solid, qx, qz, m(6), random, { y: m(0.35) });
    }

    band(solid, circle(cx, cz, m(1.3), 12), 0, m(0.6), m(0.3), "stone-lime", { rounded: true });
    solid.facing(circle(cx, cz, m(1), 12).map(([x, z]) => [x, m(0.45), z]), [0, 1, 0], material("water"));

    // The lord's tower house at the back
    const [hx0, hx1, hz0, hz1] = [cx - m(5.5), cx + m(5.5), z0 + m(2.2), z0 + m(9)];

    tower(solid, [hx0, hz0, hx1, hz1], 0, m(16), name, random, { lean: 0.04, cap: "ears", openings: { 2: [{ u0: m(4.6), u1: m(6.4), v0: 0, v1: m(2.6), depth: m(0.4), back: material("planks-dark"), arch: "round" }, ...[m(2), m(9)].flatMap((u) => [m(5), m(8.5), m(12)].map((v) => ({ u0: u - m(0.3), u1: u + m(0.3), v0: v, v1: v + m(1), depth: m(0.4), back: material("shadow"), arch: "keyhole" })))] } });

    return solid.toObject();
}

/** The cat folk's own structures, by name (races.js), and their castle. */
const STRUCTURES = Object.freeze({ "sun temple": sunTemple, "pride rock": prideRock, "watering hole": wateringHole, castle });

/** How big each structure is (plots across and deep). */
export const STRUCTURE_SIZES = Object.freeze({ "sun temple": [8, 9], "pride rock": [9, 7], "watering hole": [10, 7], castle: [10, 10] });

export function structure(piece) {
    return STRUCTURES[piece.name](piece);
}

/**
 * A length of town wall (w plots long, along x, its outside facing south): mud leaning in as it
 * rises, rounded along its top with pairs of ears standing on it, bristling with toron, a walk
 * behind its parapet.
 */
export function wall(piece) {
    const random = randomFor(piece, 15);
    const L = piece.w * CELL;
    const solid = new Solid();
    const name = piece.walls ?? "mud";
    const height = m(5.5);
    const [z0, z1] = [m(0.8), piece.h * CELL - m(0.6)];

    toned(solid, random, [height]);
    band(solid, [[0, z1], [L, z1]].reverse(), 0, height, z1 - z0, name, { closed: false, lean: 0.07 });

    const face = { origin: [0, 0, z1], across: [1, 0, 0], out: [0, 0, 1], length: L };

    toron(solid, face, 0.07, [0, 0], [m(1.6), m(3.4)], m(1), random, { margin: m(0.4) });

    for (let u = m(1.2); u < L - m(0.6); u += m(2.4)) {
        const at = wallPoint(face, { lean: 0.07 });
        const p = at(u, height, -m(0.35));

        ears(solid, p, [1, 0], m(0.35), m(0.6), name);
    }

    return solid.toObject();
}

/** A gatehouse in a town wall: two ear towers either side of an arched way through, studded doors. */
export function gatehouse(piece) {
    const random = randomFor(piece, 16);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const name = piece.walls ?? "mud";
    const lean = 0.06;

    toned(solid, random, [m(7)]);

    for (const [a, b] of [[0, W / 2 - m(2)], [W / 2 + m(2), W]]) {
        tower(solid, [a, m(0.5), b, D - m(0.5)], 0, m(8.5), name, random, { lean, cap: "ears" });
    }

    // The way through between them, under a round arch, its doors swung open against its sides
    const [gx0, gx1, gz0, gz1] = [W / 2 - m(2.1), W / 2 + m(2.1), m(1.2), D - m(1.2)];
    const way = { u0: m(0.6), u1: m(3.6), v0: 0, v1: m(4.4), depth: gz1 - gz0, back: null, arch: "round", sides: material("mud-pale") };
    const faces = solid.walls([[gx0, gz0], [gx1, gz0], [gx1, gz1], [gx0, gz1]], 0, m(6.8), { 0: [way], 2: [way] }, material(name));

    band(solid, [[gx0, gz0], [gx1, gz0], [gx1, gz1], [gx0, gz1]], m(6.8), m(7.5), m(0.3), name, { rounded: true });
    solid.facing([[gx0, m(6.75), gz0], [gx1, m(6.75), gz0], [gx1, m(6.75), gz1], [gx0, m(6.75), gz1]], [0, 1, 0], material("mud-pale"));
    toron(solid, faces[2], 0, [0, 0], [m(5.2), m(6.2)], m(0.8), random, { margin: m(0.3) });

    for (const side of [-1, 1]) {
        const x = W / 2 + side * m(1.45);

        solid.box(x - m(0.08), 0, gz1 - m(0.3) - m(1.5), x + m(0.08), m(4), gz1 - m(0.3), material("planks-dark"));
    }

    return solid.toObject();
}

/** A round bastion on a town wall. */
export function bastion(piece) {
    const random = randomFor(piece, 17);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const name = piece.walls ?? "mud";
    const r = Math.min(W, D) / 2 - m(0.3);

    toned(solid, random, [m(7)]);
    solid.extrude(circle(W / 2, D / 2, r, 14), 0, m(7), material(name), { batter: m(0.6), top: material("mud-pale") });
    band(solid, circle(W / 2, D / 2, r - m(0.6), 14), m(7), m(7.9), m(0.35), name, { rounded: true });

    for (let k = 0; k < 7; k++) {
        const a = (k * Math.PI * 2) / 7;

        ears(solid, [W / 2 + Math.cos(a) * (r - m(0.8)), m(7.9), D / 2 + Math.sin(a) * (r - m(0.8))], [-Math.sin(a), Math.cos(a)], m(0.3), m(0.55), name);
    }

    return solid.toObject();
}

export { MUDS };
