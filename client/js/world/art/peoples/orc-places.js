// The orcs' special buildings and their own places:
//
// - The grog hall (tavern): a great round hall on a basalt ring under a hide cone with a smoke
//   crown, a giant tankard hanging over its door, barrels in a yard beside it.
// - The temple: a broch, a battered tower of basalt with a spiked timber crown and banners, an
//   altar before it heaped with offered weapons and shields.
// - The great forge (smithy): a workshop, and an open post hall over a basalt hearth whose
//   chimney is capped with iron, heaps of glassy slag, an anvil, a quenching trough.
// - The war council's hall (guild): a longhouse fronted by carved posts and a wall of shields.
// - The chieftain's hall (town hall): a longhouse scaled up on a high plinth, its door in its end
//   under an arch of two great tusks, braziers and horse-tail standards before it.
// - The keep: a broch keep, taller, crowned with a spiked timber gallery.
// - The market: hide awnings on two poles, loot heaped under them, meat racks and cages.
// - The war totem, the skull pit and the fighting pit (races.js), a castle (a ring fort with a
//   motte and a broch keep, a stone gate with a great lintel), a palisade of leaning stakes on a
//   bank, its gate and lookout towers.

import { PEOPLE_PLACES } from "../../../core/setpieces/pieces.js";
import { material } from "../engine/materials.js";
import { add3, inset, Solid } from "../engine/solid.js";
import { emblemSignTexture, loadSignFont, nameBoardTexture, signMaterial } from "../kits/signs.js";
import { fireLight } from "../kits/torches.js";
import { band, CELL, circle, ENTRY, lamp, m, pole, post, randomFor, southSide, spike, stake, steps, wallPoint } from "./kit.js";
import { blockHouse, longhouse, rack, roundHut, skull, standard, tent, toned, tusk, warBanner } from "./orc.js";

// A picture on a board (a sign's texture) in a face `at` (wallPoint's), the right way round, in
// front of its upright frame from top to bottom however far the wall leans back
function board(solid, at, out, [u0, u1, v0, v1], texture, name, proud = m(0.3)) {
    const [a, b] = [at(u0, v0), at(u1, v0)];
    const right = [out[2], 0, -out[0]];
    const [l, r] = (b[0] - a[0]) * right[0] + (b[2] - a[2]) * right[2] >= 0 ? [u0, u1] : [u1, u0];
    const head = at(u0, v1);
    // (As far out again as the wall leans back over half its height, and a little more: in front
    // of the frame's face, not in it, where two faces in one place flicker)
    const ahead = Math.max(0, -((head[0] - a[0]) * out[0] + (head[2] - a[2]) * out[2])) / 2 + m(0.02);

    solid.member(at((u0 + u1) / 2 - (u1 - u0) / 2 - m(0.15), (v0 + v1) / 2, proud - m(0.12)), at((u0 + u1) / 2 + (u1 - u0) / 2 + m(0.15), (v0 + v1) / 2, proud - m(0.12)), out, v1 - v0 + m(0.3), m(0.12), material("timber"));
    solid.facing([at(l, v0, proud + ahead), at(r, v0, proud + ahead), at(r, v1, proud + ahead), at(l, v1, proud + ahead)], out, signMaterial(texture, name), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

// A brazier: an iron bowl on three legs, coals glowing in it
function brazier(solid, x, z, { y = 0 } = {}) {
    for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3;

        pole(solid, [x + Math.cos(a) * m(0.4), y, z + Math.sin(a) * m(0.4)], [x + Math.cos(a) * m(0.2), y + m(1), z + Math.sin(a) * m(0.2)], m(0.04), "iron", { sides: 4 });
    }

    solid.lathe(x, z, [[m(0.15), y + m(0.95)], [m(0.45), y + m(1.15)], [m(0.5), y + m(1.3)], [0, y + m(1.3)]], material("iron-black"), { segments: 8 });
    solid.lathe(x, z, [[m(0.42), y + m(1.28)], [0, y + m(1.32)]], material("embers"), { segments: 6 });
    // (Its fire, burning day and night: world/fire.js)
    fireLight(solid, [x, y + m(1.3), z], "brazier");
}

// A heap of offered or looted things: shields, blades, helmets, bones
function heap(solid, x, z, random, { size = m(1.2), y = 0 } = {}) {
    solid.lathe(x, z, [[size, y], [size * 0.6, y + size * 0.35], [0, y + size * 0.5]], material(random.pick(["rock-dark", "hide-dark"])), { segments: 7 });

    for (let k = 0; k < 7; k++) {
        const a = random.next() * Math.PI * 2;
        const r = size * random.range(0.2, 0.8);
        const [px, pz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
        const py = y + size * 0.5 * (1 - r / size) + m(0.05);

        if (k % 3 === 0) {
            solid.lathe(px, pz, [[m(0.35), py], [m(0.33), py + m(0.06)], [0, py + m(0.08)]], material(random.pick(["war-red", "planks", "iron"])), { segments: 8 });
        } else if (k % 3 === 1) {
            spike(solid, [px, py, pz], [Math.cos(a), random.range(0.2, 0.9), Math.sin(a)], m(0.9), m(0.06), "iron", { sides: 3 });
        } else {
            skull(solid, [px, py + m(0.1), pz], a, m(0.25), { horns: random.chance(0.4) });
        }
    }
}

// A broch: a round tower of basalt leaning in as it rises (x, z its middle), `r` across at its
// foot and `height` tall, a few slits, its door, a spiked timber gallery round its top. Returns
// its faces
function broch(solid, cx, cz, r, height, random, { door = { width: m(1.6), height: m(2.6) }, floor = 0, lean = 0.12, gallery = true } = {}) {
    const count = 18;
    const outline = circle(cx, cz, r, count, southSide(count));
    const side = Math.hypot(outline[1][0] - outline[0][0], outline[1][1] - outline[0][1]);
    const openings = { 0: [{ u0: side / 2 - door.width / 2, u1: side / 2 + door.width / 2, v0: 0, v1: door.height, depth: m(0.6), back: material("planks-dark"), arch: null }] };

    for (let k = 2; k < count; k += 3) {
        openings[k] = [{ u0: side / 2 - m(0.15), u1: side / 2 + m(0.15), v0: height * random.range(0.35, 0.7), v1: 0, depth: m(0.5), back: material("shadow") }];
        openings[k][0].v1 = openings[k][0].v0 + m(1);
    }

    if (floor > 0) {
        solid.extrude(inset(outline, -m(0.6)), 0, floor, material("basalt"), { batter: m(0.3) });
    }

    const faces = solid.walls(outline, floor, height, openings, material("basalt"), { lean });
    const top = inset(outline, lean * height);
    const peak = floor + height;

    // (A lintel of one great stone over its door)
    const at = wallPoint(faces[0], { lean });

    solid.member(at(side / 2 - door.width / 2 - m(0.4), door.height + m(0.25)), at(side / 2 + door.width / 2 + m(0.4), door.height + m(0.25)), faces[0].out, m(0.5), m(0.3), material("rock-dark"));
    solid.extrude(inset(top, m(0.2)), peak - m(0.3), peak, material("rock-dark"));

    if (gallery) {
        // The gallery: timber hoarding out over the top, a spiked parapet, a hide roof in the
        // middle
        const outward = inset(top, -m(0.8));

        solid.extrude(outward, peak, peak + m(0.25), material("planks-dark"), { bottom: true });

        for (const [x, z] of outward) {
            pole(solid, [x, peak - m(1.4), z], [x - (x - cx) * 0.08, peak, z - (z - cz) * 0.08], m(0.09), "timber", { sides: 4 });
            stake(solid, x, peak + m(0.25), z, m(1.6), m(0.1), "timber", { lean: [(x - cx) * 0.06, (z - cz) * 0.06] });
        }

        band(solid, inset(outward, m(0.1)), peak + m(0.25), peak + m(1.1), m(0.15), "planks-dark");
        solid.lathe(cx, cz, [[r * 0.75, peak + m(0.2)], [r * 0.2, peak + r * 0.7], [0, peak + r * 0.75]], material("hide"), { segments: 12 });
        spike(solid, [cx, peak + r * 0.74, cz], [0, 1, 0], m(1.4), m(0.12), "iron");
    }

    return { faces, peak, outline };
}

// --- Landmarks ---

/** The grog hall: a great round hall, a smoke crown on its cone, a giant tankard over its door. */
export async function tavern(piece) {
    await loadSignFont();

    const random = randomFor(piece, 21);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const own = piece.tavern ?? { name: "The Broken Tusk", emblem: "tankard", count: 1 };
    const solid = new Solid();
    const doorFace = D - m(ENTRY) + m(0.3);
    const r = Math.min(W / 2 - m(0.6), (doorFace - m(0.6)) / 2);
    const [cx, cz] = [W / 2, doorFace - r];

    toned(solid, random, [m(3.4)]);

    const count = 18;
    const outline = circle(cx, cz, r, count, southSide(count));
    const side = Math.hypot(outline[1][0] - outline[0][0], outline[1][1] - outline[0][1]);
    const stone = m(1.2);

    solid.extrude(inset(outline, -m(0.3)), 0, m(0.3), material("basalt"));

    const faces = solid.walls(outline, m(0.3), m(3.1), { 0: [{ u0: side / 2 - m(0.9), u1: side / 2 + m(0.9), v0: 0, v1: m(2.3), depth: m(0.3), back: material("planks-dark") }] }, material("planks-dark"));

    solid.extrude(inset(outline, -m(0.2)), m(0.3), m(0.3) + stone, material("basalt"), { batter: m(0.1), top: null });

    for (const face of faces) {
        const at = wallPoint(face);

        solid.member(at(0, 0), at(0, m(3.1)), face.out, m(0.25), m(0.12), material("timber"));
    }

    // The cone, its smoke crown on posts over the hole at its top
    const eaves = m(3.4);
    const reach = r + m(0.9);
    const peak = eaves + reach * 0.9;

    solid.lathe(cx, cz, [[reach, eaves - m(0.3)], [reach * 0.55, eaves + (peak - eaves) * 0.48], [m(1.2), peak - m(0.3)], [m(1.2), peak]], material("hide"), { segments: count });

    for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;

        post(solid, cx + Math.cos(a) * m(1.1), peak - m(0.1), cz + Math.sin(a) * m(1.1), m(0.9), m(0.07), "timber", { sides: 4 });
    }

    // (The great hearth's smoke rising through its crown: world/smoke.js)
    (solid.smoke ??= []).push([cx, peak + m(0.9), cz, 1.4]);

    solid.lathe(cx, cz, [[m(1.7), peak + m(0.75)], [m(0.4), peak + m(1.6)], [0, peak + m(1.7)]], material("hide-dark"), { segments: 10 });

    for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI * 2) / 12;

        tusk(solid, [cx + Math.cos(a) * reach * 0.94, eaves - m(0.1), cz + Math.sin(a) * reach * 0.94], [Math.cos(a), -0.2, Math.sin(a)], m(1), { up: [0, -0.5, 0] });
    }

    // The tankard over the door: a barrel of a mug with a handle, hanging from a beam; the name
    // on a board by it
    const at = wallPoint(faces[0]);
    const [tx, , tz] = at(side / 2, 0, m(1.2));
    const beam = [at(side / 2, m(3.7), -m(0.2)), at(side / 2, m(3.7), m(1.7))];

    pole(solid, beam[0], beam[1], m(0.1), "timber", { sides: 5 });
    solid.lathe(tx, tz, [[m(0.45), m(2.55)], [m(0.5), m(2.8)], [m(0.5), m(3.2)], [m(0.46), m(3.35)], [0, m(3.35)]], material("planks"), { segments: 10 });
    solid.lathe(tx, tz, [[m(0.46), m(3.33)], [0, m(3.4)]], material("bread"), { segments: 10 });

    for (const y of [m(2.7), m(3.15)]) {
        solid.lathe(tx, tz, [[m(0.52), y], [m(0.52), y + m(0.06)]], material("iron"), { segments: 10 });
    }

    solid.tube([[tx + m(0.5), m(3.1), tz], [tx + m(0.85), m(3), tz], [tx + m(0.85), m(2.75), tz], [tx + m(0.5), m(2.65), tz]], m(0.07), material("iron"), { sides: 4 });
    board(solid, at, faces[0].out, [side / 2 - m(2.6), side / 2 - m(1.1), m(1.1), m(1.1) + m(1.5) * (9 / 56) * 3], nameBoardTexture({ name: own.name, ground: "#3a1a14", dark: "#1a0a08" }), `board ${own.name}`);

    // The yard: a fence of stakes round barrels, a trestle
    for (let k = 0; k < 5; k++) {
        const [bx, bz] = [W - m(1.5) - (k % 2) * m(0.8), m(1.5) + k * m(0.9)];

        solid.lathe(bx, bz, [[m(0.35), 0], [m(0.4), m(0.5)], [m(0.35), m(1)], [0, m(1)]], material("planks"), { segments: 8 });
    }

    // (Braziers either side, beyond the name board's end: never before it)
    brazier(solid, cx - m(4), D - m(1.1));
    brazier(solid, cx + m(4), D - m(1.1));

    return solid.toObject();
}

/** The temple: a broch of basalt, banners on its gallery, an altar of offered arms before it. */
export async function church(piece) {
    await loadSignFont();

    const random = randomFor(piece, 22);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(1.2) + m(0.6);
    const r = Math.min(W / 2 - m(1.2), m(5.2));
    const [cx, cz] = [W / 2, doorFace - r];

    toned(solid, random, []);

    const { peak } = broch(solid, cx, cz, r, m(12), random, { door: { width: m(1.6), height: m(2.6) }, floor: m(0.6) });

    for (const side of [-1, 1]) {
        warBanner(solid, cx + side * m(2.4), 0, cz + r + m(0.6), m(4.5), { cloth: side < 0 ? "war-red" : "black" });
    }

    heap(solid, cx - m(3.5), cz - r * 0.2, random, { size: m(1.3) });
    heap(solid, cx + m(3.8), cz - r * 0.4, random, { size: m(1.1) });

    // Banners hanging down from its gallery
    for (let k = 0; k < 4; k++) {
        const a = Math.PI / 2 + (k - 1.5) * 0.55;
        const [bx, bz] = [cx + Math.cos(a) * (r * 0.9), cz + Math.sin(a) * (r * 0.9)];
        const cloth = [[bx - m(0.5), peak + m(0.2), bz + m(0.8)], [bx + m(0.5), peak + m(0.2), bz + m(0.8)], [bx + m(0.45), peak - m(3.5), bz + m(1.1)], [bx, peak - m(3.1), bz + m(1.1)], [bx - m(0.45), peak - m(3.5), bz + m(1.1)]];

        solid.face(cloth, material(k % 2 ? "war-red" : "black"), undefined, null);
        solid.face([...cloth].reverse(), material(k % 2 ? "war-red" : "black"), undefined, null);
    }

    return solid.toObject();
}

/** The great forge: a workshop, and an open post hall over a basalt hearth with an iron-capped chimney. */
export async function blacksmith(piece) {
    await loadSignFont();

    const random = randomFor(piece, 23);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, [m(3.2)]);

    // The workshop: a basalt block house whose door is where the town's entrance says
    const front = D - m(2.2) + m(0.35);
    const doorAt = W / 2 - m(1.2);
    const [x0, x1] = [doorAt - m(3), doorAt + m(2.6)];

    blockHouse(solid, x0, m(4), x1, front, { random, wealth: 0.8 });

    // The hall: posts, a hide roof sloping one way, the hearth under it
    const [hx0, hx1, hz0, hz1] = [x1 + m(0.5), W - m(0.4), m(1.5), D - m(1)];

    for (const x of [hx0, (hx0 + hx1) / 2, hx1]) {
        for (const [z, h] of [[hz0, m(4.2)], [hz1, m(3.2)]]) {
            post(solid, x, 0, z, h, m(0.15), "timber", { sides: 6 });
        }
    }

    const roof = [[hx0 - m(0.5), m(4.3), hz0 - m(0.5)], [hx1 + m(0.5), m(4.3), hz0 - m(0.5)], [hx1 + m(0.5), m(3.1), hz1 + m(0.6)], [hx0 - m(0.5), m(3.1), hz1 + m(0.6)]];

    solid.facing(roof, [0, 1, 0.3], material("hide"));
    solid.facing(roof, [0, -1, 0], material("hide-dark"));

    const [fx, fz] = [(hx0 + hx1) / 2, hz0 + m(1.6)];

    solid.extrude([[fx - m(1.3), fz - m(1)], [fx + m(1.3), fz - m(1)], [fx + m(1.3), fz + m(1)], [fx - m(1.3), fz + m(1)]], 0, m(1), material("basalt"));
    solid.facing([[fx - m(0.9), m(1.01), fz - m(0.6)], [fx + m(0.9), m(1.01), fz - m(0.6)], [fx + m(0.9), m(1.01), fz + m(0.6)], [fx - m(0.9), m(1.01), fz + m(0.6)]], [0, 1, 0], material("glow-fire"));
    fireLight(solid, [fx, m(1.01), fz], "brazier");
    solid.extrude([[fx - m(0.8), fz - m(1)], [fx + m(0.8), fz - m(1)], [fx + m(0.6), fz - m(0.2)], [fx - m(0.6), fz - m(0.2)]], m(1), m(8), material("basalt"), { batter: m(0.3) });
    solid.lathe(fx, fz - m(0.6), [[m(0.7), m(8)], [m(0.9), m(8.3)], [m(0.5), m(8.9)], [0, m(9)]], material("plates"), { segments: 6 });
    solid.lathe(fx, fz - m(0.6), [[m(0.45), m(8.9)], [0, m(8.95)]], material("embers"), { segments: 6 });
    // (Its chimney's top burning, a beacon: world/fire.js)
    fireLight(solid, [fx, m(8.95), fz - m(0.6)], "brazier");

    const [ax, az] = [fx - m(1.5), fz + m(2.4)];

    solid.lathe(ax, az, [[m(0.38), 0], [m(0.35), m(0.6)], [0, m(0.6)]], material("bark"), { segments: 7 });
    solid.box(ax - m(0.35), m(0.6), az - m(0.15), ax + m(0.35), m(0.85), az + m(0.15), material("iron-black"));
    solid.box(fx + m(1.2), 0, fz + m(2), fx + m(2.6), m(0.6), fz + m(2.8), material("basalt"));
    solid.box(fx + m(1.3), m(0.6), fz + m(2.1), fx + m(2.5), m(0.55), fz + m(2.7), material("water"));

    // Heaps of glassy slag, and a rack of blades
    for (const [sx, sz, size] of [[hx1 - m(1), hz1 - m(1.2), m(1.1)], [hx1 - m(2.4), hz1 - m(0.8), m(0.7)]]) {
        solid.lathe(sx, sz, [[size, 0], [size * 0.55, size * 0.4], [0, size * 0.55]], material("obsidian"), { segments: 7 });
    }

    rack(solid, hx0 + m(1.8), hz1 - m(0.3), { random, kind: "weapons", length: m(2.2) });

    const shopFace = { origin: [x1, 0, front], across: [-1, 0, 0], out: [0, 0, 1], length: x1 - x0 };

    board(solid, wallPoint(shopFace, { lean: 0.04 }), [0, 0, 1], [m(0.4), m(1.3), m(1.3), m(2.2)], emblemSignTexture({ name: "Forge", emblem: "anvil", tint: random.int(0, 5) }), "sign forge", m(0.15));

    return solid.toObject();
}

/** The war council's hall: a longhouse fronted by carved posts and a wall of captured shields. */
export async function guild(piece) {
    await loadSignFont();

    const random = randomFor(piece, 24);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(ENTRY) + m(0.25);
    const middle = Math.min(m(8.5), (doorFace - m(0.8)) * 0.85);
    // (The lens's south side at its middle is its door's wall: middle / 2 from its line)
    const cz = doorFace - middle / 2 - m(0.05);

    toned(solid, random, [m(3.6)]);
    longhouse(solid, m(0.6), W - m(0.6), cz, { middle, random, wealth: 0.9, doorway: { width: m(2.2), height: m(2.6) }, plinth: m(0.3), ridge: m(8) });

    // Carved posts before it (faces stacked up them), shields hung between
    for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
            const x = W / 2 + side * m(3.2 + k * 2.6);
            const z = doorFace + m(0.6);

            post(solid, x, 0, z, m(4.2), m(0.2), "timber", { sides: 6 });

            for (const y of [m(1.6), m(2.8), m(3.9)]) {
                skull(solid, [x, y, z + m(0.2)], 0, m(0.32), { horns: false, name: "timber-light" });
            }

            const [sx, sz] = [x + side * m(1.3), z];

            solid.lathe(sx, sz, [[0, m(2.4)], [m(0.5), m(2.4)]], material(random.pick(["war-red", "black", "planks"])), { segments: 10 });
        }
    }

    // The name on a board hung from a beam between the nearest posts, before the door (the wall
    // over the door is in the deep shade of the eaves, behind them)
    const line = doorFace + m(0.6);

    pole(solid, [W / 2 - m(3.2), m(3.55), line], [W / 2 + m(3.2), m(3.55), line], m(0.11), "timber", { sides: 5 });

    for (const side of [-1, 1]) {
        pole(solid, [W / 2 + side * m(1.1), m(3.5), line + m(0.08)], [W / 2 + side * m(1.1), m(3.3), line + m(0.08)], m(0.015), "rope", { sides: 3 });
    }

    board(solid, (u, v, w = 0) => [W / 2 - m(1.3) + u, v, line + w], [0, 0, 1], [0, m(2.6), m(2.88), m(2.88) + m(2.6) * (9 / 56)], nameBoardTexture({ name: "Adventurers' Guild", ground: "#3a1a14", dark: "#1a0a08" }), "board guild", m(0.15));

    return solid.toObject();
}

/**
 * The chieftain's hall: a longhouse on a high plinth, up steps to its door under an arch of two
 * great tusks, braziers and horse-tail standards before it.
 */
export async function hall(piece) {
    await loadSignFont();

    const random = randomFor(piece, 25);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(ENTRY) + m(0.25);
    const middle = Math.min(m(9), (doorFace - m(0.8)) * 0.85);
    const cz = doorFace - middle / 2 - m(0.05);

    toned(solid, random, [m(3.6)]);
    longhouse(solid, m(0.5), W - m(0.5), cz, { middle, random, wealth: 1, doorway: { width: m(2), height: m(2.5) }, plinth: m(0.3), ridge: m(8.5) });

    for (const side of [-1, 1]) {
        const x = W / 2 + side * m(1.5);

        tusk(solid, [x, 0, doorFace + m(0.8)], [side * 0.15, 1, 0.1], m(5), { up: [-side * 1.2, 0.2, 0], r: m(0.3) });
        brazier(solid, W / 2 + side * m(3.2), doorFace + m(1));
        standard(solid, W / 2 + side * m(4.6), 0, doorFace + m(0.9), m(5), { random });
    }

    return solid.toObject();
}

/** A capital's keep: a tall broch on a mound, a spiked gallery, banners, steps to its door. */
export async function keep(piece) {
    await loadSignFont();

    const random = randomFor(piece, 26);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const floor = m(0.8);
    const doorFace = D - m(1.4) + m(0.6);
    const r = Math.min(W / 2 - m(0.8), (doorFace - m(0.8)) / 2);
    const [cx, cz] = [W / 2, doorFace - r];

    toned(solid, random, []);
    broch(solid, cx, cz, r, m(16), random, { door: { width: m(2.4), height: m(3.2) }, floor, lean: 0.1 });
    steps(solid, cx, doorFace + m(1.4), 0, floor, [0, -1], m(3), "basalt", { tread: m(0.35), riser: floor / 4 });

    for (const side of [-1, 1]) {
        warBanner(solid, cx + side * m(2.4), 0, doorFace + m(1.4), m(5), { cloth: side < 0 ? "war-red" : "black", width: m(1.1), drop: m(3) });
    }

    return solid.toObject();
}

/** The market: hide awnings on two poles, loot heaped under them, meat racks, a cage. */
export function market(piece) {
    const random = randomFor(piece, 27);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
            const [x, z] = [m(2) + i * (W - m(4)) / 2.2, m(2.5) + j * (D - m(4))];

            for (const dx of [-m(1.4), m(1.4)]) {
                post(solid, x + dx, 0, z + m(1.2), m(2.6), m(0.08), "timber", { sides: 4 });
            }

            const cloth = [[x - m(1.7), m(2.6), z + m(1.2)], [x + m(1.7), m(2.6), z + m(1.2)], [x + m(1.7), m(1.6), z - m(1.2)], [x - m(1.7), m(1.6), z - m(1.2)]];

            solid.facing(cloth, [0, 1, 0.3], material(random.pick(["hide", "hide-dark"])));
            solid.facing(cloth, [0, -1, 0], material("hide-dark"));
            heap(solid, x, z, random, { size: m(0.9) });
        }
    }

    rack(solid, W / 2, D / 2, { random, length: m(3), kind: "hides" });

    // A cage of poles
    const [cx, cz] = [W - m(2), D / 2];

    for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI * 2) / 10;

        pole(solid, [cx + Math.cos(a) * m(0.9), 0, cz + Math.sin(a) * m(0.9)], [cx + Math.cos(a) * m(0.8), m(2), cz + Math.sin(a) * m(0.8)], m(0.05), "timber", { sides: 4 });
    }

    solid.lathe(cx, cz, [[m(1), m(2)], [0, m(2.3)]], material("hide-dark"), { segments: 10 });

    return solid.toObject();
}

/** A tar pit smoking where a human town would have its windmill: a lookout platform instead. */
export function windmill(piece) {
    return lookout(piece);
}

export const LANDMARKS = Object.freeze({ tavern, church, blacksmith, guild, hall, keep, market, windmill });

export function landmark(piece) {
    return (LANDMARKS[piece.name] ?? market)(piece);
}

// --- Their own places ---

/**
 * The war totem: a carved pole of tusked faces stacked up it, a crossbar of shields, a black
 * horse-tail crown, lesser poles round it, on a cairn, in a trampled plaza.
 */
function warTotem(piece) {
    const random = randomFor(piece, 31);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];

    toned(solid, random, []);
    solid.facing(circle(cx, cz, Math.min(W, D) / 2 - m(0.5), 20).map(([x, z]) => [x, m(0.03), z]).reverse(), [0, 1, 0], material("mud-dark"));
    solid.extrude(circle(cx, cz, m(2.4), 10), 0, m(0.9), material("basalt"), { batter: m(0.6) });

    const height = m(9);

    post(solid, cx, m(0.9), cz, height, m(0.35), "timber", { sides: 8, top: m(0.28) });

    // (Faces stacked up it: a brow, eyes, a snarl with tusks)
    for (let k = 0; k < 4; k++) {
        const y = m(2.2) + k * m(1.9);
        const facing = (k * Math.PI) / 2;
        const [dx, dz] = [Math.sin(facing), Math.cos(facing)];

        solid.lathe(cx, cz, [[m(0.42), y - m(0.7)], [m(0.48), y - m(0.3)], [m(0.46), y + m(0.5)], [m(0.4), y + m(0.7)]], material(k % 2 ? "timber-light" : "timber"), { segments: 8 });

        for (const side of [-1, 1]) {
            const [ex, ez] = [cx + dx * m(0.44) + dz * side * m(0.18), cz + dz * m(0.44) - dx * side * m(0.18)];

            solid.box(ex - m(0.08), y + m(0.1), ez - m(0.08), ex + m(0.08), y + m(0.26), ez + m(0.08), material(k % 2 ? "war-red" : "black"));
            tusk(solid, [cx + dx * m(0.45) + dz * side * m(0.2), y - m(0.35), cz + dz * m(0.45) - dx * side * m(0.2)], [dx, 0.8, dz], m(0.7), { up: [0, 1, 0] });
        }
    }

    // The crossbar of shields, and the crown of horse-tail
    const bar = m(7.4);

    pole(solid, [cx - m(2.2), bar, cz], [cx + m(2.2), bar, cz], m(0.14), "timber", { sides: 5 });

    for (const x of [-m(1.8), -m(0.9), m(0.9), m(1.8)]) {
        solid.lathe(cx + x, cz + m(0.2), [[0, bar - m(0.2)], [m(0.45), bar - m(0.2)]], material(random.pick(["war-red", "black", "planks", "iron"])), { segments: 10 });
    }

    standard(solid, cx, m(0.9) + height - m(0.3), cz, m(1.4), { random });

    for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI * 2) / 6 + 0.3;
        const [px, pz] = [cx + Math.cos(a) * m(5.5), cz + Math.sin(a) * m(5.5)];

        if (k % 2) {
            standard(solid, px, 0, pz, m(4), { random });
        } else {
            warBanner(solid, px, 0, pz, m(3.8), { cloth: random.pick(["war-red", "black"]), facing: -a + Math.PI / 2 });
        }
    }

    brazier(solid, cx - m(3), cz + m(3));
    brazier(solid, cx + m(3), cz + m(3));

    return solid.toObject();
}

/**
 * The skull pit: a sunken ring with a basalt kerb and a fence of spikes, bones heaped at its
 * bottom, racks of skulls along the way up to it, and a round tower of skulls.
 */
function skullPit(piece) {
    const random = randomFor(piece, 32);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D * 0.42];
    const r = Math.min(W, D) * 0.28;

    toned(solid, random, []);

    // The pit: a raised kerb ringing it and sides stepping down inside to a dark floor
    const ring = (radius, y, n = 20) => circle(cx, cz, radius, n).map(([x, z]) => [x, y, z]);

    solid.loft([ring(r + m(1.2), 0), ring(r + m(0.6), m(0.8)), ring(r, m(0.8))], material("basalt"), { out: (p) => [p[0] - cx, m(3), p[2] - cz] });
    solid.loft([ring(r, m(0.8)), ring(r * 0.92, m(0.05))], material("rock-dark"), { out: (p) => [cx - p[0], m(2), cz - p[2]] });
    solid.facing(ring(r * 0.92, m(0.05)).reverse(), [0, 1, 0], material("rock-dark"));

    for (let k = 0; k < 7; k++) {
        const a = random.next() * Math.PI * 2;
        const d = random.range(0, r * 0.6);

        skull(solid, [cx + Math.cos(a) * d, m(0.25), cz + Math.sin(a) * d], random.next() * 6, m(random.range(0.3, 0.5)), { horns: random.chance(0.4) });
    }

    for (let k = 0; k < 18; k++) {
        const a = (k * Math.PI * 2) / 18;

        stake(solid, cx + Math.cos(a) * (r + m(0.9)), m(0.4), cz + Math.sin(a) * (r + m(0.9)), m(1.6), m(0.08), k % 3 ? "timber" : "iron", { lean: [Math.cos(a) * m(0.4), Math.sin(a) * m(0.4)] });
    }

    // Racks of skulls either side of the way up to it
    for (const side of [-1, 1]) {
        const x = cx + side * m(3.4);

        for (let row = 0; row < 3; row++) {
            const z = cz + r + m(2.5) + row * m(1.6);

            for (const dx of [-m(1.4), m(1.4)]) {
                post(solid, x + dx, 0, z, m(2.3), m(0.1), "timber", { sides: 4 });
            }

            for (const y of [m(1.3), m(2.1)]) {
                pole(solid, [x - m(1.5), y, z], [x + m(1.5), y, z], m(0.05), "timber", { sides: 4 });

                for (let k = 0; k < 5; k++) {
                    skull(solid, [x - m(1.1) + k * m(0.55), y + m(0.05), z + m(0.05)], 0, m(0.26), { horns: false });
                }
            }
        }
    }

    // The tower of skulls
    const [tx, tz] = [cx + r + m(3.5), cz - r * 0.3];

    solid.extrude(circle(tx, tz, m(1.9), 10), 0, m(3.2), material("mud-dark"), { batter: m(0.4) });

    for (let level = 0; level < 5; level++) {
        const y = m(0.5) + level * m(0.6);
        const radius = m(1.9) - level * m(0.08);

        for (let k = 0; k < 9; k++) {
            const a = (k * Math.PI * 2) / 9 + level * 0.35;

            skull(solid, [tx + Math.cos(a) * radius, y, tz + Math.sin(a) * radius], Math.PI / 2 - a, m(0.28), { horns: false });
        }
    }

    return solid.toObject();
}

/**
 * The fighting pit: a sunken floor of sand ringed by tiered earth banks, poles at its corners
 * hung with chains and banners, the chief's seat on the bank.
 */
function fightingPit(piece) {
    const random = randomFor(piece, 33);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const half = Math.min(W, D) / 2 - m(4.5);

    toned(solid, random, []);

    // The banks: tiers stepping up outward from the sand, each riser faced with stakes
    const square = (h, y) => [[cx - h, y, cz - h], [cx + h, y, cz - h], [cx + h, y, cz + h], [cx - h, y, cz + h]];
    const tiers = [[half, m(0.1)], [half, m(0.9)], [half + m(1.2), m(0.9)], [half + m(1.2), m(1.7)], [half + m(2.4), m(1.7)], [half + m(2.4), m(2.3)], [half + m(3.8), 0]];

    solid.facing(square(half, m(0.1)).reverse(), [0, 1, 0], material("mud-pale"));

    for (let k = 0; k < tiers.length - 1; k++) {
        const [[ha, ya], [hb, yb]] = [tiers[k], tiers[k + 1]];
        const flat = ya === yb;
        const outside = k === tiers.length - 2;

        solid.loft([square(ha, ya), square(hb, yb)], material(flat ? "thatch-grey" : "mud-dark"), { out: flat ? [0, 1, 0] : outside ? (p) => [p[0] - cx, m(4), p[2] - cz] : (p) => [cx - p[0], m(1), cz - p[2]] });
    }

    // Corner poles with chains and banners, a stake fence round the sand
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const [x, z] = [cx + dx * half, cz + dz * half];

        standard(solid, x, m(0.1), z, m(4.2), { random, hair: dx * dz > 0 ? "war-red" : "black" });
    }

    for (let k = 0; k < 4; k++) {
        const [a, b] = [square(half, m(0.1))[k], square(half, m(0.1))[(k + 1) % 4]];

        for (let t = 0.1; t < 0.95; t += 0.12) {
            stake(solid, a[0] + (b[0] - a[0]) * t, m(0.1), a[2] + (b[2] - a[2]) * t, m(1.3), m(0.07), "timber", { lean: [(cx - a[0]) * 0.01, (cz - a[2]) * 0.01] });
        }

        // (A chain swinging between the corner poles, low)
        const sag = [(a[0] + b[0]) / 2, m(2.2), (a[2] + b[2]) / 2];

        solid.tube([[a[0], m(3.6), a[2]], sag, [b[0], m(3.6), b[2]]], m(0.04), material("iron"), { sides: 3 });
    }

    // The chief's seat on the north bank: a throne of bone and iron under a banner
    const [sx, sz] = [cx, cz - half - m(1.8)];

    solid.box(sx - m(0.8), m(1.7), sz - m(0.5), sx + m(0.8), m(2.2), sz + m(0.5), material("basalt"));
    solid.box(sx - m(0.8), m(2.2), sz - m(0.6), sx + m(0.8), m(4), sz - m(0.3), material("iron-black"));

    for (const side of [-1, 1]) {
        tusk(solid, [sx + side * m(0.8), m(2.4), sz - m(0.45)], [side * 0.3, 1, 0.2], m(2), { up: [-side, 0.3, 0] });
    }

    skull(solid, [sx, m(4.3), sz - m(0.45)], 0, m(0.6));

    return solid.toObject();
}

/**
 * A castle: a ring fort, its bank topped with a palisade and a ditch before it; inside, a motte
 * raised in one quarter carrying a broch keep with a spiked gallery, longhouses and a round hut
 * round a yard; its gate of stone, two bastions of rough basalt and one great lintel, tusks and a
 * skull on it.
 */
function castle(piece) {
    const random = randomFor(piece, 34);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const R = Math.min(W, D) / 2 - m(3.5);
    const count = 36;

    toned(solid, random, [m(3.5)]);

    // The bank and the palisade along its top, leaving the gate's gap to the south
    const gap = 0.16;
    const arc = Array.from({ length: count + 1 }, (_, k) => Math.PI / 2 + gap + (k / count) * (Math.PI * 2 - gap * 2));
    const bank = (radius, y) => arc.map((a) => [cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius]);

    // (Its outer slope and top facing out and up, its inner slope facing in)
    const away = (p) => {
        const outside = Math.hypot(p[0] - cx, p[2] - cz) > R ? 1 : -1;

        return [(p[0] - cx) * outside, m(4), (p[2] - cz) * outside];
    };

    solid.loft([bank(R + m(3), 0), bank(R + m(1), m(2.2)), bank(R - m(0.5), m(2.2)), bank(R - m(2.5), 0)], material("mud-dark"), { closed: false, out: away });

    for (let k = 0; k < count * 3; k++) {
        const a = arc[0] + (k / (count * 3)) * (arc.at(-1) - arc[0]);
        const lean = [Math.cos(a) * m(0.25), Math.sin(a) * m(0.25)];

        stake(solid, cx + Math.cos(a) * R, m(2.1), cz + Math.sin(a) * R, m(random.range(4, 5)), m(0.18), "timber", { lean, sides: 5 });
    }

    // The gate: two bastions of basalt, a great lintel, tusks and a skull
    const gz = cz + R;

    for (const side of [-1, 1]) {
        const x = cx + side * m(3.4);

        solid.extrude([[x - m(1.8), gz - m(2.5)], [x + m(1.8), gz - m(2.5)], [x + m(1.8), gz + m(2)], [x - m(1.8), gz + m(2)]], 0, m(6.5), material("basalt"), { batter: m(0.5) });
        spike(solid, [x, m(6.5), gz], [0, 1, 0], m(1.2), m(0.2), "iron");
    }

    solid.box(cx - m(2.2), m(4.6), gz - m(1.2), cx + m(2.2), m(6), gz + m(1.2), material("rock-dark"));

    for (const side of [-1, 1]) {
        tusk(solid, [cx + side * m(0.8), m(6), gz + m(0.4)], [side * 0.3, 1, 0.2], m(3), { up: [-side, 0.4, 0], r: m(0.25) });
    }

    skull(solid, [cx, m(6.5), gz + m(0.9)], 0, m(0.9));

    // The motte in the north-west quarter, the broch keep on it
    const [mx, mz] = [cx - R * 0.35, cz - R * 0.3];

    solid.lathe(mx, mz, [[m(9), 0], [m(6.5), m(3.2)], [m(5), m(3.5)], [0, m(3.5)]], material("mud-dark"), { segments: 16 });
    broch(solid, mx, mz, m(4.2), m(12), random, { floor: m(3.5), lean: 0.1 });

    // Longhouses and a hut round the yard (the longhouse clear of the bank at its east end, a way
    // round it to the yard behind: core/setpieces/castles.js)
    longhouse(solid, cx - m(2), cx + R * 0.65, cz + m(2.5), { middle: m(7), random, wealth: 0.9, ridge: m(6.5), plinth: m(0.7) });
    roundHut(solid, cx + R * 0.45, cz - R * 0.45, { r: m(3.2), random, wealth: 1 });
    warBanner(solid, cx - m(4), 0, cz + R * 0.55, m(4.5), { cloth: "war-red" });
    brazier(solid, cx - m(1.5), cz + R * 0.5);

    return solid.toObject();
}

export const STRUCTURE_SIZES = PEOPLE_PLACES.orc;

const STRUCTURES = Object.freeze({ "war totem": warTotem, "skull pit": skullPit, "fighting pit": fightingPit, castle });

export function structure(piece) {
    return STRUCTURES[piece.name](piece);
}

/**
 * A length of palisade (w plots long along x, its outside facing south): stakes leaning out on
 * an earth bank, a walk behind them on posts, a spike here and there.
 */
export function wall(piece) {
    const random = randomFor(piece, 35);
    const L = piece.w * CELL;
    const D = piece.h * CELL;
    const solid = new Solid();
    const z = D * 0.55;

    toned(solid, random, []);

    const ramp = (y, dz) => [[0, y, z + dz], [L, y, z + dz]];

    solid.loft([ramp(0, m(1.6)), ramp(m(1.3), m(0.3)), ramp(m(1.3), -m(0.6)), ramp(0, -m(1.8))], material("mud-dark"), { closed: false, out: [0, 1, 0] });

    for (let x = m(0.15); x < L; x += m(0.33)) {
        stake(solid, x + random.range(-1, 1) * m(0.03), m(1.2), z, m(random.range(3.6, 4.4)), m(0.16), "timber", { lean: [random.range(-1, 1) * m(0.08), m(0.35)], sides: 5 });
    }

    // The walk behind: planks on posts
    solid.box(0, m(2.6), z - m(1.6), L, m(2.7), z - m(0.4), material("planks-dark"));

    for (let x = m(1); x < L; x += m(2.5)) {
        post(solid, x, m(0.6), z - m(1.4), m(2), m(0.1), "timber", { sides: 4 });
    }

    return solid.toObject();
}

/** A gate in the palisade: two lookout towers on posts, a lintel with tusks and a skull, a gate of logs. */
export function gatehouse(piece) {
    const random = randomFor(piece, 36);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    for (const side of [-1, 1]) {
        const x = W / 2 + side * m(3);

        solid.extrude([[x - m(1.8), m(0.8)], [x + m(1.8), m(0.8)], [x + m(1.8), D - m(0.8)], [x - m(1.8), D - m(0.8)]], 0, m(3.5), material("basalt"), { batter: m(0.4) });

        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            post(solid, x + dx * m(1.4), m(3.5), D / 2 + dz * m(1.4), m(4), m(0.14), "timber", { sides: 5 });
        }

        solid.box(x - m(1.7), m(6.2), D / 2 - m(1.7), x + m(1.7), m(6.4), D / 2 + m(1.7), material("planks-dark"));
        solid.lathe(x, D / 2, [[m(2.3), m(7.4)], [0, m(9.2)]], material("hide"), { segments: 4, from: Math.PI / 4, to: Math.PI / 4 + Math.PI * 2, smooth: false });
        spike(solid, [x, m(9.1), D / 2], [0, 1, 0], m(1), m(0.1), "iron");
    }

    solid.box(W / 2 - m(1.4), m(4.4), D / 2 - m(0.6), W / 2 + m(1.4), m(5.2), D / 2 + m(0.6), material("rock-dark"));
    skull(solid, [W / 2, m(5.6), D / 2 + m(0.4)], 0, m(0.7));

    for (const side of [-1, 1]) {
        tusk(solid, [W / 2 + side * m(1.2), m(5.2), D / 2 + m(0.3)], [side * 0.2, 1, 0.3], m(2), { up: [-side, 0.3, 0] });

        // (The gate's leaves of logs, open)
        for (let k = 0; k < 4; k++) {
            const x = W / 2 + side * (m(1.1) - k * m(0.1));

            stake(solid, x, 0, D / 2 + m(0.7) + k * m(0.3), m(4.3), m(0.14), "timber", { sides: 5 });
        }
    }

    return solid.toObject();
}

/** A lookout: a platform on four leaning posts, a hide roof, a ladder up to it. */
export function lookout(piece) {
    const random = randomFor(piece, 37);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const deck = m(5.5);

    toned(solid, random, []);

    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pole(solid, [cx + dx * m(2), 0, cz + dz * m(2)], [cx + dx * m(1.3), deck + m(2.2), cz + dz * m(1.3)], m(0.15), "timber", { sides: 5 });
    }

    solid.box(cx - m(1.6), deck, cz - m(1.6), cx + m(1.6), deck + m(0.2), cz + m(1.6), material("planks-dark"));
    band(solid, [[cx - m(1.6), cz - m(1.6)], [cx + m(1.6), cz - m(1.6)], [cx + m(1.6), cz + m(1.6)], [cx - m(1.6), cz + m(1.6)]], deck + m(0.2), deck + m(1.1), m(0.12), "planks-dark");
    solid.lathe(cx, cz, [[m(2.2), deck + m(2.2)], [0, deck + m(3.6)]], material("hide"), { segments: 4, from: Math.PI / 4, to: Math.PI / 4 + Math.PI * 2, smooth: false });

    for (let k = 1; k < 16; k++) {
        const y = (k * deck) / 16;

        pole(solid, [cx - m(0.3), y, cz + m(2.2) - (y / deck) * m(0.6)], [cx + m(0.3), y, cz + m(2.2) - (y / deck) * m(0.6)], m(0.04), "timber", { sides: 3 });
    }

    for (const side of [-1, 1]) {
        pole(solid, [cx + side * m(0.3), 0, cz + m(2.2)], [cx + side * m(0.3), deck, cz + m(1.6)], m(0.05), "timber", { sides: 4 });
    }

    warBanner(solid, cx + m(1.5), deck + m(0.2), cz + m(1.5), m(2.5), { cloth: "war-red", width: m(0.6), drop: m(1.4) });

    return solid.toObject();
}

export { add3, heap, brazier, broch, lamp, tent };
