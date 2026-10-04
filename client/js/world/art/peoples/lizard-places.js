// The lizard folk's special buildings and their own places, each borrowing a different real
// silhouette:
//
// - The reed hall (tavern): a Marsh Arab guest hall, arches of bundled reeds under mats on a reed
//   platform, a lattice front with two great bundles either side of its door.
// - The temple: a stepped pyramid of five terraces, white plaster and red, its stair between
//   serpent balustrades up to a shrine under a pierced roof comb; its door at the stair's foot
//   into the sanctum within.
// - The smithy: an open shed of thatch on a stone platform, a raised clay forge, a trough, and a
//   workshop on stilts.
// - The guild's house: a Sepik spirit house, its painted front gable towering over the street, a
//   lizard's mask at its peak, its ridge sloping down to the back.
// - The town hall: a palace on its terrace, a gallery of corbelled rooms and a lookout tower.
// - The keep: a stepped platform carrying a palace block, a door at its foot.
// - The market: a plank deck of stalls roofed with palm, canoes tied up round it.
// - The ziggurat, the hatchery and the serpent pool (races.js); a castle (a temple-fortress on a
//   raised square in its moat, a summit pyramid, causeways and stepped gate towers); walls: a
//   serpent wall and a stockade leaning out, gates of two stepped towers.

import { PEOPLE_PLACES } from "../../../core/setpieces/pieces.js";
import { flagpole } from "../../cloth.js";
import { material } from "../engine/materials.js";
import { inset, Solid } from "../engine/solid.js";
import { emblemSignTexture, loadSignFont, nameBoardTexture, signMaterial } from "../kits/signs.js";
import { fireLight } from "../kits/torches.js";
import { band, CELL, circle, ENTRY, lamp, m, pole, post, randomFor, stake, steps, wallPoint } from "./kit.js";
import { apsidal, deckHouse, egg, hipThatch, marshHut, rail, reedHouse, serpent, stilts, toned } from "./lizard.js";

// A picture on a board (a sign's texture) in a face `at` (wallPoint's), the right way round
function board(solid, at, out, [u0, u1, v0, v1], texture, name, proud = m(0.2)) {
    const [a, b] = [at(u0, v0), at(u1, v0)];
    const right = [out[2], 0, -out[0]];
    const [l, r] = (b[0] - a[0]) * right[0] + (b[2] - a[2]) * right[2] >= 0 ? [u0, u1] : [u1, u0];

    solid.member(at((u0 + u1) / 2 - (u1 - u0) / 2 - m(0.12), (v0 + v1) / 2, proud - m(0.1)), at((u0 + u1) / 2 + (u1 - u0) / 2 + m(0.12), (v0 + v1) / 2, proud - m(0.1)), out, v1 - v0 + m(0.24), m(0.1), material("bamboo"));
    // (A little in front of the frame's face, not in it: two faces in one place flicker)
    solid.facing([at(l, v0, proud + m(0.02)), at(r, v0, proud + m(0.02)), at(r, v1, proud + m(0.02)), at(l, v1, proud + m(0.02))], out, signMaterial(texture, name), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/**
 * A stepped pyramid: `tiers` terraces from a base `base` across (x) by `deep` (z) round (cx,
 * cz), each `rise` tall and set back `setback`, battered, white plaster (or limestone) with red
 * bands along each terrace's lip; its stair up the middle of its front (south) between serpent
 * balustrades, their heads rearing at the foot. Returns its top: { y, half, deep }.
 */
export function pyramid(solid, cx, cz, base, deep, tiers, rise, setback, random, { face = "stone-lime", band: lip = "plaster-red", stair = m(3.6), stairs = [0], y = 0, frieze = false } = {}) {
    let [half, halfDeep, top] = [base / 2, deep / 2, y];

    for (let k = 0; k < tiers; k++) {
        const outline = [[cx - half, cz - halfDeep], [cx + half, cz - halfDeep], [cx + half, cz + halfDeep], [cx - half, cz + halfDeep]];

        solid.extrude(outline, top, top + rise, material(face), { batter: setback * 0.35, top: material("stone-lime") });
        solid.extrude(inset(outline, setback * 0.35 - m(0.08)), top + rise - m(0.35), top + rise, material(k % 2 && frieze ? "glyphs" : lip), { top: material("stone-lime") });

        top += rise;
        half -= setback;
        halfDeep -= setback;
    }

    // The stairs: each from outside the foot of its side (`stairs`: the ways they face, as
    // characters face) straight up to the top, between balustrades sloping down to serpents' heads
    for (const turn of stairs) {
        const [dx, dz] = [Math.round(Math.sin(turn)), Math.round(Math.cos(turn))];
        const [sx, sz] = [cx + dx * (base / 2 + m(0.6)), cz + dz * (deep / 2 + m(0.6))];
        const reach = Math.abs(dx) * (base / 2 - half) + Math.abs(dz) * (deep / 2 - halfDeep) + m(0.6);
        const count = Math.max(1, Math.round((top - y) / m(0.28)));

        steps(solid, sx, sz, y, top, [-dx, -dz], stair, "stone-lime", { tread: reach / count, riser: (top - y) / count });

        for (const side of [-1, 1]) {
            const [ox, oz] = [dz * side * (stair / 2 + m(0.25)), -dx * side * (stair / 2 + m(0.25))];
            const foot = [sx + ox, y + m(0.5), sz + oz];
            const head = [foot[0] - dx * reach, top + m(0.4), foot[2] - dz * reach];

            solid.tube([foot, head], m(0.35), material(face), { sides: 4 });
            serpent(solid, [foot[0] + dx * m(0.3), y + m(0.6), foot[2] + dz * m(0.3)], turn, m(1.3), { name: "stone-lime", jaws: "plaster-red" });
        }
    }

    return { y: top, half, deep: halfDeep };
}

/**
 * A shrine on a pyramid's top (or a platform): a narrow room of stone (x0..x1 by z0..z1 on y),
 * its door in its front, a roof stepping in as a corbel vault does, and a roof comb over it:
 * two walls pierced with holes, painted.
 */
export function shrine(solid, [x0, z0, x1, z1], y, { height = m(2.8), comb = m(3), paint = "plaster-red" } = {}) {
    const outline = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const width = x1 - x0;
    const faces = solid.walls(outline, y, height, { 2: [{ u0: width / 2 - m(0.6), u1: width / 2 + m(0.6), v0: 0, v1: m(2), depth: m(0.5), back: material("shadow") }] }, material(paint));

    // (The frieze round its top: carved stone)
    for (const face of faces) {
        const at = wallPoint(face);

        solid.facing([at(0, height - m(0.7), m(0.06)), at(face.length, height - m(0.7), m(0.06)), at(face.length, height, m(0.06)), at(0, height, m(0.06))], face.out, material("glyphs"));
    }

    // The roof, stepping in; the comb along its middle
    let top = y + height;

    for (let k = 0; k < 3; k++) {
        solid.extrude(inset(outline, -m(0.25) + k * m(0.45)), top, top + m(0.3), material("stone-lime"));
        top += m(0.3);
    }

    const [cz] = [(z0 + z1) / 2];
    const combWidth = width * 0.8;
    const cx = (x0 + x1) / 2;
    const holes = Math.max(2, Math.round(combWidth / m(0.9)));
    const openings = Array.from({ length: holes }, (_, k) => {
        const u = ((k + 0.5) * combWidth) / holes;

        return { u0: u - m(0.2), u1: u + m(0.2), v0: comb * 0.25, v1: comb * 0.7, depth: m(0.35), back: null, arch: k % 2 ? "round" : null };
    });

    solid.walls([[cx - combWidth / 2, cz - m(0.2)], [cx + combWidth / 2, cz - m(0.2)], [cx + combWidth / 2, cz + m(0.2)], [cx - combWidth / 2, cz + m(0.2)]], top, comb, { 2: openings, 0: openings.map((o) => ({ ...o, u0: combWidth - o.u1, u1: combWidth - o.u0 })) }, material(paint), { lean: 0.06 });
    egg(solid, cx, top + comb * 0.94, cz, m(0.6), "jade");

    return top + comb;
}

// --- Landmarks ---

/** The reed hall: a great reed-arch hall on its platform, its name on a board by the door. */
export async function tavern(piece) {
    await loadSignFont();

    const random = randomFor(piece, 41);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const own = piece.tavern ?? { name: "The Warm Stone", emblem: "tankard", count: 1 };
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.4);

    toned(solid, random, []);
    reedHouse(solid, m(0.8), m(0.6), W - m(0.8), front, { arches: 7, platform: m(0.3) });

    // (Its door wide enough for the town's entrance, a board beside it)
    const at = (u, v, w = 0) => [W / 2 - m(3) + u, v, front + m(0.2) + w];

    board(solid, at, [0, 0, 1], [0, m(1.4), m(2.6), m(2.6) + m(1.4) * (9 / 56) * 3], nameBoardTexture({ name: own.name, ground: "#264a3a", dark: "#10241a" }), `board ${own.name}`);

    for (const side of [-1, 1]) {
        lamp(solid, [W / 2 + side * m(1.3), m(2.4), front + m(0.4)], "glow-hearth", { size: m(0.24), frame: "bamboo", hang: m(0.5) });
    }

    return solid.toObject();
}

/**
 * The temple: a stepped pyramid of five terraces, a shrine and its comb on top, its door at the
 * foot of its front in a portal of carved stone, the stair splitting round it.
 */
export async function church(piece) {
    await loadSignFont();

    const random = randomFor(piece, 42);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(1.2) + m(0.4);
    const base = Math.min(W - m(1), doorFace - m(0.6));
    const [cx, cz] = [W / 2, doorFace - base / 2];

    toned(solid, random, []);

    const top = pyramid(solid, cx, cz, base, base, 5, m(1.7), base * 0.085, random, { stairs: [], frieze: true });

    // Stairs up either side of the front, meeting at the second terrace
    for (const side of [-1, 1]) {
        steps(solid, cx + side * m(3.2), doorFace + m(0.3), 0, m(3.4), [0, -1], m(2), "stone-lime", { tread: m(0.35), riser: m(0.28) });
        serpent(solid, [cx + side * m(4.4), m(0.6), doorFace + m(0.8)], 0, m(1.2), { name: "stone-lime" });
    }

    // The portal: its door into the sanctum, a carved lintel, painted jambs
    const portal = [[cx - m(1.6), doorFace - m(1.4)], [cx + m(1.6), doorFace - m(1.4)], [cx + m(1.6), doorFace], [cx - m(1.6), doorFace]];

    solid.extrude(inset(portal, -m(0.1)), 0, m(0.6), material("stone-lime"));

    const faces = solid.walls(portal, m(0.6), m(3.2), { 2: [{ u0: m(0.8), u1: m(2.4), v0: 0, v1: m(2.6), depth: m(0.4), back: material("planks-dark") }] }, material("plaster-red"));
    const at = wallPoint(faces[2]);

    solid.facing([at(0, m(2.7), m(0.05)), at(m(3.2), m(2.7), m(0.05)), at(m(3.2), m(3.2), m(0.05)), at(0, m(3.2), m(0.05))], [0, 0, 1], material("glyphs"));
    solid.extrude(inset(portal, -m(0.3)), m(3.8), m(4.1), material("stone-lime"));

    const w = top.half * 1.6;

    shrine(solid, [cx - w / 2, cz - top.deep * 0.8, cx + w / 2, cz + top.deep * 0.5], top.y, { height: m(2.4), comb: m(2.8) });

    return solid.toObject();
}

/** The smithy: a workshop on stilts where the town's entrance says, an open forge shed by it. */
export async function blacksmith(piece) {
    await loadSignFont();

    const random = randomFor(piece, 43);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    // The workshop: on a stone platform (its door at the town's entrance, 1.2 m west of the middle)
    const front = D - m(2.2) + m(0.3);
    const doorAt = W / 2 - m(1.2);
    const [x0, x1] = [doorAt - m(2.5), doorAt + m(2.5)];
    const shop = [[x0, m(4.5)], [x1, m(4.5)], [x1, front], [x0, front]];

    solid.extrude(inset(shop, -m(0.3)), 0, m(0.3), material("stone-lime"));

    const faces = solid.walls(shop, m(0.3), m(2.4), { 2: [{ u0: m(2.5) - m(0.65), u1: m(2.5) + m(0.65), v0: 0, v1: m(2.1), depth: m(0.3), back: material("planks-dark") }] }, material("plaster-white"));

    hipThatch(solid, (t) => inset(shop, -m(0.7) + t * m(2.2)), m(2.7), m(2.8), "palm", { steps: 4 });

    // The forge shed: four posts, a hip of palm over a raised clay hearth glowing, a trough
    const [sx0, sx1, sz0, sz1] = [x1 + m(0.8), W - m(0.5), m(2.5), D - m(1)];

    for (const [x, z] of [[sx0, sz0], [sx1, sz0], [sx1, sz1], [sx0, sz1]]) {
        post(solid, x, 0, z, m(2.6), m(0.12), "timber", { sides: 5 });
    }

    hipThatch(solid, (t) => inset([[sx0, sz0], [sx1, sz0], [sx1, sz1], [sx0, sz1]], -m(0.6) + t * Math.min(sx1 - sx0, sz1 - sz0) * 0.45), m(2.6), m(2.2), "palm", { steps: 3 });

    const [fx, fz] = [(sx0 + sx1) / 2, (sz0 + sz1) / 2];

    solid.extrude([[fx - m(0.8), fz - m(0.6)], [fx + m(0.8), fz - m(0.6)], [fx + m(0.8), fz + m(0.6)], [fx - m(0.8), fz + m(0.6)]], 0, m(0.9), material("mud-red"));
    solid.facing([[fx - m(0.5), m(0.91), fz - m(0.35)], [fx + m(0.5), m(0.91), fz - m(0.35)], [fx + m(0.5), m(0.91), fz + m(0.35)], [fx - m(0.5), m(0.91), fz + m(0.35)]], [0, 1, 0], material("glow-fire"));
    fireLight(solid, [fx, m(0.91), fz], "brazier");
    solid.box(fx - m(0.3), 0, fz + m(1.2), fx + m(0.3), m(0.7), fz + m(1.5), material("iron-black"));
    solid.box(sx0 + m(0.3), 0, sz1 - m(1), sx0 + m(1.7), m(0.5), sz1 - m(0.4), material("stone-lime"));
    solid.box(sx0 + m(0.4), m(0.5), sz1 - m(0.9), sx0 + m(1.6), m(0.45), sz1 - m(0.5), material("water-green"));

    board(solid, wallPoint(faces[2]), faces[2].out, [m(3.5), m(4.4), m(1.2), m(2.1)], emblemSignTexture({ name: "Smithy", emblem: "anvil", tint: random.int(0, 5) }), "sign smithy", m(0.1));

    return solid.toObject();
}

/**
 * The guild's spirit house: its front gable towering over the street, painted in red, white and
 * jade, a lizard's mask at its peak; its ridge sloping down to the back; on stilts behind a
 * porch, steps up to its door.
 */
export async function guild(piece) {
    await loadSignFont();

    const random = randomFor(piece, 44);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.3);
    const [x0, x1, z0] = [m(1.5), W - m(1.5), m(0.8)];
    const floor = m(0.3);

    toned(solid, random, []);

    // The body: walls of planks, a platform
    const body = [[x0, z0], [x1, z0], [x1, front], [x0, front]];

    solid.extrude(inset(body, -m(0.3)), 0, floor, material("stone-lime"));

    solid.walls(body, floor, m(2.6), { 2: [{ u0: (x1 - x0) / 2 - m(1.1), u1: (x1 - x0) / 2 + m(1.1), v0: 0, v1: m(2.6), depth: m(0.3), back: material("planks-dark") }] }, material("planks-pale"));

    // The roof: a loft along z, its ridge high at the front and sloping down to the back, the
    // front gable leaning out over the street
    const sections = 8;
    const rings = Array.from({ length: sections + 1 }, (_, k) => {
        const s = k / sections;
        const z = z0 - m(0.6) + s * (front - z0 + m(2.2));
        const ridge = floor + m(4) + s ** 1.6 * m(8);
        const half = (x1 - x0) / 2 + m(0.7) + s * m(0.6);

        return Array.from({ length: 7 }, (_, i) => {
            const across = Math.cos((Math.PI * i) / 6);

            return [(x0 + x1) / 2 + across * half, floor + m(2.4) + (ridge - floor - m(2.4)) * (1 - Math.abs(across) ** 1.2), z];
        });
    });

    solid.loft(rings, material("thatch-palm"), { closed: false });
    solid.loft(rings.map((ring) => ring.map(([x, y, z]) => [x, y - m(0.2), z])), material("thatch-grey"), { closed: false, out: [0, -1, 0] });

    // The painted gable filling the front under the roof's edge
    const gable = rings.at(-1).map(([x, y, z]) => [x, y - m(0.25), z - m(0.3)]);
    const [gx, gz] = [(x0 + x1) / 2, gable[0][2]];

    solid.facing(gable, [0, 0, 1], material("plaster-red"));

    // (Bands of white and jade across it, and the mask at its peak)
    for (let k = 1; k < 5; k++) {
        const y = gable[0][1] + ((gable[3][1] - gable[0][1]) * k) / 5;
        const halfAt = ((gable[0][0] - gx) * (gable[3][1] - y)) / (gable[3][1] - gable[0][1]);

        solid.facing([[gx - Math.abs(halfAt) + m(0.4), y, gz + m(0.03)], [gx + Math.abs(halfAt) - m(0.4), y, gz + m(0.03)], [gx + Math.abs(halfAt) - m(0.4), y + m(0.3), gz + m(0.03)], [gx - Math.abs(halfAt) + m(0.4), y + m(0.3), gz + m(0.03)]], [0, 0, 1], material(k % 2 ? "plaster-white" : "jade"), undefined, null);
    }

    const peak = gable[3];

    serpent(solid, [peak[0], peak[1] - m(2), peak[2] + m(0.2)], 0, m(1.6), { name: "planks-pale", jaws: "plaster-red", eyes: "sun-gold" });
    post(solid, gx, 0, gz + m(1.6), peak[1] - m(0.8), m(0.2), "timber", { sides: 6 });

    // The name on the gable, low and to one side of the post (the door's wall is deep in the
    // gable's shade, behind it)
    board(solid, (u, v, w = 0) => [gx - m(2.9) + u, v, gz + w], [0, 0, 1], [0, m(2.4), gable[0][1] + m(0.45), gable[0][1] + m(0.45) + m(2.4) * (9 / 56)], nameBoardTexture({ name: "Adventurers' Guild", ground: "#264a3a", dark: "#10241a" }), "board guild", m(0.15));

    return solid.toObject();
}

/** The town hall: a palace on a terrace, a gallery of corbel-roofed rooms, a lookout tower. */
export async function hall(piece) {
    await loadSignFont();

    const random = randomFor(piece, 45);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.4);
    const floor = m(0.3);
    const [x0, x1, z0] = [m(0.6), W - m(0.6), m(0.6)];

    toned(solid, random, []);
    solid.extrude([[x0 - m(0.3), z0 - m(0.3)], [x1 + m(0.3), z0 - m(0.3)], [x1 + m(0.3), front + m(0.3)], [x0 - m(0.3), front + m(0.3)]], 0, floor, material("stone-lime"));

    const outline = [[x0, z0], [x1, z0], [x1, front], [x0, front]];
    const width = x1 - x0;
    const bays = Math.max(3, Math.round(width / m(2.2))) | 1;
    const openings = Array.from({ length: bays }, (_, k) => {
        const u = ((k + 0.5) * width) / bays;
        const middle = k === Math.floor(bays / 2);

        return { u0: u - (middle ? m(1) : m(0.6)), u1: u + (middle ? m(1) : m(0.6)), v0: 0, v1: middle ? m(2.5) : m(2.2), depth: m(0.5), back: material(middle ? "planks-dark" : "shadow") };
    });
    const faces = solid.walls(outline, floor, m(3.4), { 2: openings }, material("plaster-white"));
    const at = wallPoint(faces[2]);

    solid.facing([at(0, m(2.7), m(0.05)), at(width, m(2.7), m(0.05)), at(width, m(3.4), m(0.05)), at(0, m(3.4), m(0.05))], [0, 0, 1], material("glyphs"));

    let top = floor + m(3.4);

    for (let k = 0; k < 3; k++) {
        solid.extrude(inset(outline, -m(0.25) + k * m(0.5)), top, top + m(0.35), material(k === 0 ? "plaster-red" : "stone-lime"));
        top += m(0.35);
    }

    // The tower at the back corner, three storeys
    const [tx0, tz0] = [x1 - m(4), z0 + m(0.3)];
    const tower = [[tx0, tz0], [tx0 + m(3.5), tz0], [tx0 + m(3.5), tz0 + m(3.5)], [tx0, tz0 + m(3.5)]];

    solid.walls(tower, top, m(6), { 2: [m(1), m(3.6)].map((v) => ({ u0: m(1.3), u1: m(2.2), v0: v, v1: v + m(1.2), depth: m(0.4), back: material("shadow") })) }, material("plaster-white"));
    solid.extrude(inset(tower, -m(0.3)), top + m(6), top + m(6.4), material("plaster-red"));
    shrine(solid, [tx0 + m(0.4), tz0 + m(0.4), tx0 + m(3.1), tz0 + m(3.1)], top + m(6.4), { height: m(1.4), comb: m(1.6) });

    board(solid, at, faces[2].out, [width / 2 - m(1.8), width / 2 + m(1.8), m(2.75), m(2.75) + m(3.6) * (9 / 56)], nameBoardTexture({ name: "Town Hall", ground: "#264a3a", dark: "#10241a" }), "board hall", m(0.12));

    return solid.toObject();
}

/** A capital's keep: a stepped platform with a palace block on it, its door at the foot. */
export async function keep(piece) {
    await loadSignFont();

    const random = randomFor(piece, 46);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(1.4) + m(0.4);
    const base = Math.min(W - m(0.8), doorFace - m(0.4));
    const [cx, cz] = [W / 2, doorFace - base / 2];

    toned(solid, random, []);

    // (As many tiers, up to three, as leave room on top for the palace and its shrine: a small
    // keep's platform steps up fewer times rather than closing to a point)
    const tiers = Math.max(1, Math.min(3, Math.floor((base / 2 - m(2.6)) / m(1.3))));
    const top = pyramid(solid, cx, cz, base, base, tiers, m(2.2), m(1.3), random, { stairs: [], frieze: true });
    const portal = [[cx - m(1.8), doorFace - m(1.4)], [cx + m(1.8), doorFace - m(1.4)], [cx + m(1.8), doorFace], [cx - m(1.8), doorFace]];

    solid.extrude(inset(portal, -m(0.2)), 0, m(0.8), material("stone-lime"));
    solid.walls(portal, m(0.8), m(4), { 2: [{ u0: m(0.6), u1: m(3), v0: 0, v1: m(3.2), depth: m(0.4), back: material("planks-dark") }] }, material("plaster-red"));
    steps(solid, cx, doorFace + m(1.4), 0, m(0.8), [0, -1], m(3), "stone-lime", { tread: m(0.35), riser: m(0.2) });

    const palace = [[cx - top.half + m(0.4), cz - top.deep + m(0.4)], [cx + top.half - m(0.4), cz - top.deep + m(0.4)], [cx + top.half - m(0.4), cz + top.deep - m(0.4)], [cx - top.half + m(0.4), cz + top.deep - m(0.4)]];

    solid.walls(palace, top.y, m(3.2), { 2: [0.25, 0.5, 0.75].map((t) => ({ u0: (palace[1][0] - palace[0][0]) * t - m(0.5), u1: (palace[1][0] - palace[0][0]) * t + m(0.5), v0: 0, v1: m(2.2), depth: m(0.4), back: material("shadow") })) }, material("plaster-white"));

    let roof = top.y + m(3.2);

    for (let k = 0; k < 3; k++) {
        solid.extrude(inset(palace, -m(0.25) + k * m(0.5)), roof, roof + m(0.35), material(k === 0 ? "glyphs" : "stone-lime"));
        roof += m(0.35);
    }

    // (The shrine no wider than the palace's roof)
    const [across, deep] = [Math.min(m(2), top.half - m(0.6)), Math.min(m(1.5), top.deep - m(0.6))];

    shrine(solid, [cx - across, cz - deep, cx + across, cz + deep], roof, { height: m(1.8), comb: m(2.4) });

    // (Their flags flying from the palace roof's front corners: world/cloth.js)
    for (const side of [-1, 1]) {
        flagpole(solid, [cx + side * (top.half - m(0.7)), roof, cz + top.deep - m(0.7)], m(3), "lizard", { radius: m(0.05), length: m(2.6), drop: m(0.9), pole: "timber" });
    }

    for (const side of [-1, 1]) {
        serpent(solid, [cx + side * m(2.6), m(0.9), doorFace + m(0.4)], 0, m(1.4), { name: "stone-lime" });
    }

    return solid.toObject();
}

/** The market: a plank deck on stilts over the water, stalls roofed with palm, canoes by it. */
export function market(piece) {
    const random = randomFor(piece, 47);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const floor = m(1.2);

    toned(solid, random, []);
    solid.facing([[0, m(0.06), 0], [0, m(0.06), D], [W, m(0.06), D], [W, m(0.06), 0]], [0, 1, 0], material("water-green"));

    const deck = [[m(1.5), m(1.2)], [W - m(1.5), m(1.2)], [W - m(1.5), D - m(1.2)], [m(1.5), D - m(1.2)]];

    stilts(solid, deck, floor, random, { every: m(2.2) });
    rail(solid, [[m(1.6), m(1.3)], [W - m(1.6), m(1.3)], [W - m(1.6), D - m(3)]], floor + m(0.2));

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
            const [x, z] = [m(3.4) + i * (W - m(6.8)) / 2, m(3.4) + j * (D - m(7)) ];
            const square = [[x - m(1.1), z - m(1.1)], [x + m(1.1), z - m(1.1)], [x + m(1.1), z + m(1.1)], [x - m(1.1), z + m(1.1)]];

            for (const [px, pz] of square) {
                post(solid, px, floor + m(0.2), pz, m(2), m(0.06), "bamboo", { sides: 4 });
            }

            hipThatch(solid, (t) => inset(square, -m(0.35) + t * m(1.4)), floor + m(2.2), m(1.3), "palm", { steps: 2 });
            solid.box(x - m(1), floor + m(0.2), z + m(0.5), x + m(1), floor + m(0.95), z + m(0.9), material("planks-pale"));

            for (let k = 0; k < 4; k++) {
                const gx = x - m(0.75) + k * m(0.5);

                if (random.chance(0.5)) {
                    egg(solid, gx, floor + m(0.95), z + m(0.7), m(0.28), random.pick(["egg", "jade", "calabash"]));
                } else {
                    solid.box(gx - m(0.15), floor + m(0.95), z + m(0.55), gx + m(0.15), floor + m(1.15), z + m(0.85), material(random.pick(["cabbages", "squash", "apples", "matting", "maya-blue"])));
                }
            }
        }
    }

    // Canoes tied up along its front
    for (let k = 0; k < 3; k++) {
        const [x, z] = [m(3) + k * m(4.5), D - m(0.6)];

        canoe(solid, x, z, m(4), random);
    }

    return solid.toObject();
}

// A dugout canoe lying on the water along x at (x, z), `length` long
function canoe(solid, x, z, length, random) {
    const rings = Array.from({ length: 7 }, (_, k) => {
        const s = k / 6;
        const half = m(0.4) * Math.sin(Math.PI * s) ** 0.6 + m(0.02);
        const lift = m(0.25) * (2 * s - 1) ** 4;

        return [[x - length / 2 + s * length, m(0.3) + lift, z - half], [x - length / 2 + s * length, m(0.05) + lift * 0.5, z], [x - length / 2 + s * length, m(0.3) + lift, z + half]];
    });

    solid.loft(rings, material(random.pick(["timber", "timber-light"])), { closed: false, out: (p) => [0, -1, (p[2] - z) * 2] });
    solid.loft(rings, material("planks-dark"), { closed: false, out: (p) => [0, 1, (z - p[2]) * 2] });
}

export function windmill(piece) {
    return market(piece);
}

export const LANDMARKS = Object.freeze({ tavern, church, blacksmith, guild, hall, keep, market, windmill });

export function landmark(piece) {
    return (LANDMARKS[piece.name] ?? market)(piece);
}

// --- Their own places ---

/**
 * A great tree of the jungle (the sacred tree): a pale trunk flaring into buttress roots, a crown
 * of broad clouds of leaves.
 */
export function greatTree(solid, x, z, height, random) {
    solid.tube([[x, 0, z], [x, height * 0.45, z], [x + random.range(-1, 1) * height * 0.05, height * 0.72, z]], [height * 0.07, height * 0.05, height * 0.035], material("bark-silver"), { sides: 8 });

    for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI * 2) / 6 + random.range(-0.2, 0.2);
        const [dx, dz] = [Math.cos(a), Math.sin(a)];
        const reach = height * random.range(0.14, 0.2);
        const fin = [[x, height * 0.2, z], [x + dx * reach, 0, z + dz * reach], [x, 0, z]];

        solid.face(fin, material("bark-silver"));
        solid.face([...fin].reverse(), material("bark-silver"));
    }

    for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5 + random.range(-0.3, 0.3);
        const r = height * random.range(0.18, 0.3);
        const [cx, cy, cz] = [x + Math.cos(a) * height * 0.2, height * random.range(0.72, 0.9), z + Math.sin(a) * height * 0.2];

        solid.tube([[x, height * 0.65, z], [cx, cy - r * 0.3, cz]], [height * 0.025, height * 0.012], material("bark-silver"), { sides: 5 });
        solid.lathe(cx, cz, [[0, cy - r * 0.35], [r, cy - r * 0.15], [r * 0.9, cy + r * 0.15], [r * 0.5, cy + r * 0.35], [0, cy + r * 0.4]], material("leaves"), { segments: 9 });
    }
}

/**
 * The ziggurat: the tallest pyramid, seven terraces, a stair on every side, a frieze of carved
 * stone, a shrine and its comb on top; a lesser pyramid beside it joined by a raised walk.
 */
function ziggurat(piece) {
    const random = randomFor(piece, 51);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const base = Math.min(W * 0.62, D - m(6));
    const [cx, cz] = [W * 0.36, D / 2 + m(1)];

    toned(solid, random, []);

    const top = pyramid(solid, cx, cz, base, base, 7, m(2.6), base * 0.058, random, { stairs: [0, Math.PI / 2, -Math.PI / 2, Math.PI], stair: m(4), frieze: true });

    shrine(solid, [cx - top.half * 0.8, cz - top.deep * 0.8, cx + top.half * 0.8, cz + top.deep * 0.6], top.y, { height: m(3), comb: m(4.5) });

    // The lesser pyramid, and the raised walk joining them
    const small = base * 0.45;
    const [sx, sz] = [W - small / 2 - m(2), cz];
    const low = pyramid(solid, sx, sz, small, small, 4, m(2), small * 0.08, random, { stairs: [0], stair: m(2.6) });

    shrine(solid, [sx - low.half * 0.7, sz - low.deep * 0.7, sx + low.half * 0.7, sz + low.deep * 0.5], low.y, { height: m(2.2), comb: m(2) });

    const walkY = m(5.2);
    const [wx0, wx1] = [cx + base / 2 - m(4), sx - small / 2 + m(2)];

    solid.extrude([[wx0, cz - m(2)], [wx1, cz - m(2)], [wx1, cz + m(2)], [wx0, cz + m(2)]], 0, walkY, material("stone-lime"), { batter: m(0.4) });

    for (let x = wx0 + m(2); x < wx1 - m(1); x += m(3)) {
        for (const side of [-1, 1]) {
            serpent(solid, [x, walkY + m(0.4), cz + side * m(1.9)], side > 0 ? 0 : Math.PI, m(0.6), { name: "stone-lime" });
        }
    }

    greatTree(solid, W - m(4), m(4), m(16), random);

    return solid.toObject();
}

/**
 * The hatchery: stepped pools under an open canopy of thatch, clutches of eggs on mats of reeds,
 * a low serpent wall round it all with one gate, the sacred tree over it.
 */
function hatchery(piece) {
    const random = randomFor(piece, 52);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    // The pools, each a step lower than the last
    const pools = 4;

    for (let k = 0; k < pools; k++) {
        const [px, pz] = [m(5) + k * (W - m(10)) / (pools - 1), D / 2 + (k % 2 ? m(1.5) : -m(1.5))];
        const r = m(3);
        const y = m(0.9) - k * m(0.2);

        band(solid, circle(px, pz, r, 14), 0, y, m(0.4), "stone-lime", { rounded: true });
        solid.facing(circle(px, pz, r - m(0.35), 14).map(([x, z]) => [x, y - m(0.15), z]).reverse(), [0, 1, 0], material("water-green"));

        // (A mat of reeds floating in it, a clutch of eggs on it)
        solid.extrude(circle(px, pz, m(1.1), 8), y - m(0.15), y - m(0.05), material("reeds"));

        for (let e = 0; e < 5; e++) {
            const a = (e * Math.PI * 2) / 5 + k;

            egg(solid, px + Math.cos(a) * m(0.45), y - m(0.05), pz + Math.sin(a) * m(0.45), m(0.4), e % 2 ? "egg" : "jade");
        }
    }

    // The canopy: posts and a flat hip of palm over the pools
    const [cx0, cx1, cz0, cz1] = [m(1.5), W - m(1.5), D / 2 - m(4.5), D / 2 + m(4.5)];

    for (let x = cx0; x <= cx1 + 1; x += (cx1 - cx0) / 4) {
        for (const z of [cz0, cz1]) {
            post(solid, x, 0, z, m(3.2), m(0.13), "timber", { sides: 5 });
        }
    }

    hipThatch(solid, (t) => inset([[cx0, cz0], [cx1, cz0], [cx1, cz1], [cx0, cz1]], -m(0.6) + t * m(4.2)), m(3.2), m(2.2), "palm", { steps: 3 });

    // The serpent wall round it, its gate to the south
    const ring = [[m(0.5), m(0.5)], [W - m(0.5), m(0.5)], [W - m(0.5), D - m(0.5)], [W / 2 + m(1.5), D - m(0.5)]];

    band(solid, ring, 0, m(1.3), m(0.45), "stone-lime", { closed: false, rounded: true });
    band(solid, [[W / 2 - m(1.5), D - m(0.5)], [m(0.5), D - m(0.5)], [m(0.5), m(0.5)]], 0, m(1.3), m(0.45), "stone-lime", { closed: false, rounded: true });

    for (const side of [-1, 1]) {
        serpent(solid, [W / 2 + side * m(1.5), m(1.4), D - m(0.4)], 0, m(1), { name: "stone-lime" });
    }

    greatTree(solid, m(3), m(3), m(14), random);

    return solid.toObject();
}

/**
 * The serpent pool: a square basin three steps deep, serpents rearing at its corners with many
 * heads, an island shrine in its middle.
 */
function serpentPool(piece) {
    const random = randomFor(piece, 53);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const half = Math.min(W, D) / 2 - m(1.5);

    toned(solid, random, []);

    // The basin: a raised kerb, then steps down inside, each ledge facing up, each riser in
    const square = (h, y) => [[cx - h, y, cz - h], [cx + h, y, cz - h], [cx + h, y, cz + h], [cx - h, y, cz + h]];
    const tiers = [[half + m(0.6), 0], [half + m(0.3), m(0.9)], [half, m(0.9)], [half, m(0.6)], [half - m(0.4), m(0.6)], [half - m(0.4), m(0.35)], [half - m(0.8), m(0.35)], [half - m(0.8), m(0.1)]];

    for (let k = 0; k < tiers.length - 1; k++) {
        const [[ha, ya], [hb, yb]] = [tiers[k], tiers[k + 1]];
        const outside = k === 0;

        solid.loft([square(ha, ya), square(hb, yb)], material(ya === yb ? "stone-lime" : outside ? "stone-lime" : "plaster-red"), { out: ya === yb ? [0, 1, 0] : outside ? (p) => [p[0] - cx, m(3), p[2] - cz] : (p) => [cx - p[0], 0, cz - p[2]] });
    }

    solid.facing(square(half - m(0.8), m(0.3)).reverse(), [0, 1, 0], material("water-green"));

    // Many-headed serpents at its corners, rearing over the water
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const [x, z] = [cx + dx * (half + m(0.2)), cz + dz * (half + m(0.2))];

        solid.tube([[x + dx * m(0.6), 0, z + dz * m(0.6)], [x, m(1.2), z], [x - dx * m(0.2), m(2.8), z - dz * m(0.2)]], [m(0.4), m(0.35), m(0.3)], material("stone-lime"), { sides: 6 });

        for (let h = 0; h < 3; h++) {
            const a = Math.atan2(-dx, -dz) + (h - 1) * 0.55;
            const [hx, hz] = [x - dx * m(0.2) + Math.sin(a) * m(0.6), z - dz * m(0.2) + Math.cos(a) * m(0.6)];

            serpent(solid, [hx, m(3.1) + (h === 1 ? m(0.3) : 0), hz], a, m(0.8), { name: "stone-lime", neck: [[x - dx * m(0.2), m(2.7), z - dz * m(0.2)]] });
        }
    }

    // The island shrine
    solid.extrude(circle(cx, cz, m(2), 12), 0, m(0.8), material("stone-lime"), { batter: m(0.2) });
    shrine(solid, [cx - m(1.2), cz - m(1), cx + m(1.2), cz + m(1)], m(0.8), { height: m(1.8), comb: m(1.6) });

    return solid.toObject();
}

/**
 * A castle: a temple-fortress, a raised square with sloping sides in its moat, reached by a
 * causeway to a gate between two stepped towers; on it a palace block and a summit pyramid, a
 * serpent wall round its edge.
 */
function castle(piece) {
    const random = randomFor(piece, 54);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2 - m(2)];
    const half = Math.min(W, D) / 2 - m(8);
    const platform = m(4);

    toned(solid, random, []);

    // The moat
    solid.facing([[m(1), m(0.06), m(1)], [m(1), m(0.06), D - m(1)], [W - m(1), m(0.06), D - m(1)], [W - m(1), m(0.06), m(1)]], [0, 1, 0], material("water-green"));

    // The raised square, its serpent wall
    const square = [[cx - half, cz - half], [cx + half, cz - half], [cx + half, cz + half], [cx - half, cz + half]];

    solid.extrude(inset(square, -m(2)), 0, platform, material("stone-lime"), { batter: m(2), top: material("stone-lime") });
    band(solid, square, platform, platform + m(1.4), m(0.5), "stone-lime", { rounded: true });

    for (let k = 0; k < 4; k++) {
        const [[ax, az], [bx, bz]] = [square[k], square[(k + 1) % 4]];

        for (let t = 0.08; t < 0.95; t += 0.12) {
            const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];

            // (Each facing out from its side)
            const [ox, oz] = [Math.abs(bz - az) > 1 ? Math.sign(ax - cx) : 0, Math.abs(bx - ax) > 1 ? Math.sign(az - cz) : 0];

            serpent(solid, [x + ox * m(0.35), platform + m(1.5), z + oz * m(0.35)], Math.atan2(ox, oz), m(0.55), { name: "stone-lime" });
        }
    }

    // The causeway from the south and the gate's two stepped towers
    solid.extrude([[cx - m(3), cz + half + m(1.5)], [cx + m(3), cz + half + m(1.5)], [cx + m(3), D], [cx - m(3), D]], 0, m(1.2), material("stone-lime"));
    steps(solid, cx, cz + half + m(2) + m(0.36) * 8, m(1.2), platform, [0, -1], m(5), "stone-lime", { tread: m(0.36), riser: (platform - m(1.2)) / 8 });

    for (const side of [-1, 1]) {
        pyramid(solid, cx + side * m(5.2), cz + half + m(2.2), m(5), m(5), 4, m(2.2), m(0.6), random, { stairs: [] });
    }

    // The palace block and the summit pyramid on the square
    const top = pyramid(solid, cx - half * 0.35, cz - half * 0.35, half * 0.95, half * 0.95, 5, m(2.4), half * 0.07, random, { y: platform, stairs: [0], frieze: true });

    shrine(solid, [cx - half * 0.35 - top.half * 0.8, cz - half * 0.35 - top.deep * 0.7, cx - half * 0.35 + top.half * 0.8, cz - half * 0.35 + top.deep * 0.5], top.y, { height: m(2.6), comb: m(3.2) });

    const palace = [[cx + m(1), cz + m(1)], [cx + half - m(1.5), cz + m(1)], [cx + half - m(1.5), cz + half - m(1.5)], [cx + m(1), cz + half - m(1.5)]];

    solid.walls(palace, platform, m(3.2), { 2: [0.2, 0.5, 0.8].map((t) => ({ u0: (palace[1][0] - palace[0][0]) * t - m(0.5), u1: (palace[1][0] - palace[0][0]) * t + m(0.5), v0: 0, v1: m(2.2), depth: m(0.5), back: material("shadow") })) }, material("plaster-red"));

    let roof = platform + m(3.2);

    for (let k = 0; k < 3; k++) {
        solid.extrude(inset(palace, -m(0.25) + k * m(0.5)), roof, roof + m(0.35), material(k === 0 ? "glyphs" : "stone-lime"));
        roof += m(0.35);
    }

    greatTree(solid, cx - half * 0.1, cz + half * 0.7, m(12), random);

    return solid.toObject();
}

export const STRUCTURE_SIZES = PEOPLE_PLACES.lizard;

const STRUCTURES = Object.freeze({ ziggurat, hatchery, "serpent pool": serpentPool, castle });

export function structure(piece) {
    return STRUCTURES[piece.name](piece);
}

/** A length of serpent wall (w plots along x, facing south): stone, heads rearing along its top. */
export function wall(piece) {
    const random = randomFor(piece, 55);
    const L = piece.w * CELL;
    const z = piece.h * CELL * 0.5;
    const solid = new Solid();

    toned(solid, random, []);
    band(solid, [[L, z], [0, z]], 0, m(1.8), m(0.8), "stone-lime", { closed: false, rounded: true, lean: 0.05 });

    for (let x = m(0.7); x < L; x += m(1.4)) {
        serpent(solid, [x, m(1.9), z + m(0.1)], 0, m(0.55), { name: "stone-lime" });
    }

    // (A stockade of stakes leaning out before it)
    for (let x = m(0.3); x < L; x += m(0.45)) {
        stake(solid, x + random.range(-1, 1) * m(0.05), 0, z + m(1.6), m(random.range(2, 2.6)), m(0.1), "bamboo", { lean: [0, m(0.5)], sides: 4 });
    }

    return solid.toObject();
}

/** A gate: two short stepped towers either side of the way, serpents at their feet. */
export function gatehouse(piece) {
    const random = randomFor(piece, 56);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    for (const side of [-1, 1]) {
        const top = pyramid(solid, W / 2 + side * m(3.2), D / 2, m(3.8), D - m(1.6), 3, m(2), m(0.4), random, { stairs: [] });

        shrine(solid, [W / 2 + side * m(3.2) - top.half * 0.8, D / 2 - top.deep * 0.8, W / 2 + side * m(3.2) + top.half * 0.8, D / 2 + top.deep * 0.8], top.y, { height: m(1.4), comb: m(1.2) });
        serpent(solid, [W / 2 + side * m(1.6), m(0.4), D - m(0.6)], 0, m(1.1), { name: "stone-lime" });
    }

    // (A span of timber across the top, the way beneath it)
    solid.box(W / 2 - m(1.4), m(4.6), D / 2 - m(1.2), W / 2 + m(1.4), m(5.1), D / 2 + m(1.2), material("timber"));

    return solid.toObject();
}

/** A lookout: a stepped stone platform with a thatched shelter on it. */
export function lookout(piece) {
    const random = randomFor(piece, 57);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    const top = pyramid(solid, W / 2, D / 2, Math.min(W, D) - m(0.6), Math.min(W, D) - m(0.6), 3, m(1.8), m(0.5), random, { stairs: [] });
    const square = [[W / 2 - top.half + m(0.2), D / 2 - top.deep + m(0.2)], [W / 2 + top.half - m(0.2), D / 2 - top.deep + m(0.2)], [W / 2 + top.half - m(0.2), D / 2 + top.deep - m(0.2)], [W / 2 - top.half + m(0.2), D / 2 + top.deep - m(0.2)]];

    for (const [x, z] of square) {
        post(solid, x, top.y, z, m(2.2), m(0.08), "timber", { sides: 4 });
    }

    hipThatch(solid, (t) => inset(square, -m(0.4) + t * top.half), top.y + m(2.2), m(1.8), "palm", { steps: 3 });

    // (A watchtower's door: a portal at the foot of its front, painted red, a lintel of lime
    // stone over it, as their temples' are)
    if (piece.door) {
        const face = D / 2 + (Math.min(W, D) - m(0.6)) / 2 + m(0.3);
        const portal = [[W / 2 - m(1.3), face - m(1.2)], [W / 2 + m(1.3), face - m(1.2)], [W / 2 + m(1.3), face], [W / 2 - m(1.3), face]];

        solid.walls(portal, 0, m(2.6), { 2: [{ u0: m(0.7), u1: m(1.9), v0: 0, v1: m(2.1), depth: m(0.4), back: material("planks-dark") }] }, material("plaster-red"));
        solid.extrude(inset(portal, -m(0.2)), m(2.6), m(2.9), material("stone-lime"));
    }

    return solid.toObject();
}

export { apsidal, deckHouse, marshHut, pole };
