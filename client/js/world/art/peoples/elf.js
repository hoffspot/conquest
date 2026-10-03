// The elves' buildings: round and tall, grown into living trees, after Art Nouveau (Horta's
// whiplash line and Guimard's bud lamps), Gaudí's branching columns, the deep eaves and verandas
// of Japan, the stacked roofs of Norway's stave churches and the living-root bridges of the
// Khasi. No long straight ridge and no square corner: plans are circles and ovals, roofs open like
// petals over deep verandas, doors are ogee-headed, windows are paired lancets and round moon
// windows, and lamps hang in buds from curling crooks. Pale moonstone and marble, silver-grey
// bark and honey heartwood, roofs of leaf shingles in greens and old silver.
//
// Three kinds of house: the ground house among the roots, a pagoda of one or two storeys on a
// pale plinth; the trunk house, wrapped round a great tree on a ring of decking, its roof a
// collar round the trunk, a spiral stair up to it; and the canopy house, a cabin on a platform
// high in a great tree, reached by a ladder. The great trees are grown by the game's tree kit.

import { PEOPLE_PLACES } from "../../../core/setpieces/pieces.js";
import { material } from "../engine/materials.js";
import { inset, Solid } from "../engine/solid.js";
import { emblemSignTexture, loadSignFont, nameBoardTexture, signMaterial } from "../kits/signs.js";
import { fireLight } from "../kits/torches.js";
import { band, CELL, circle, ENTRY, ladder, lamp, m, oval, pole, post, randomFor, southSide, steps, wallPoint, weathering } from "./kit.js";
import { budLamp, crescent, greatTree, petalRoof, ringDeck, spiralStair, treeColumn, whiplash } from "./sylvan.js";

const ROOFS = ["leafscale", "leafscale", "leafscale-sage", "leafscale-silver"];

function toned(solid, random, eaves = []) {
    solid.tone = weathering({ seed: random.int(0, 1e6), eaves, washes: ["marble", "stone-moon"], tint: [random.range(0.97, 1.03), random.range(0.97, 1.03), random.range(0.97, 1.04)], dirt: 0.25, mottle: ["leafscale", "leafscale-sage", "leafscale-silver"] });
}

// A picture on a board (a sign's texture) in a face `at` (wallPoint's), the right way round
function board(solid, at, out, [u0, u1, v0, v1], texture, name, proud = m(0.2)) {
    const [a, b] = [at(u0, v0), at(u1, v0)];
    const right = [out[2], 0, -out[0]];
    const [l, r] = (b[0] - a[0]) * right[0] + (b[2] - a[2]) * right[2] >= 0 ? [u0, u1] : [u1, u0];

    solid.member(at((u0 + u1) / 2 - (u1 - u0) / 2 - m(0.12), (v0 + v1) / 2, proud - m(0.1)), at((u0 + u1) / 2 + (u1 - u0) / 2 + m(0.12), (v0 + v1) / 2, proud - m(0.1)), out, v1 - v0 + m(0.24), m(0.1), material("silver"));
    // (A little in front of the frame's face, not in it: two faces in one place flicker)
    solid.facing([at(l, v0, proud + m(0.02)), at(r, v0, proud + m(0.02)), at(r, v1, proud + m(0.02)), at(l, v1, proud + m(0.02))], out, signMaterial(texture, name), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

// The sides of a plan and how long each is, and which faces most nearly a way
const lengthOf = (outline, k) => Math.hypot(outline[(k + 1) % outline.length][0] - outline[k][0], outline[(k + 1) % outline.length][1] - outline[k][1]);

/**
 * Openings round an elven plan: an ogee door on its side 0 (it faces the way the plan was turned
 * to), and round it moon windows and paired lancets on some other sides, clear of `skip`.
 */
function elvenOpenings(outline, random, { door = { width: m(1.2), height: m(2.6) }, doorSide = 0, windows = 0.5, sill = m(1.1), tall = m(1.8), skip = [] } = {}) {
    const openings = {};

    for (let k = 0; k < outline.length; k++) {
        const length = lengthOf(outline, k);

        if (k === doorSide && door) {
            openings[k] = [{ u0: length / 2 - door.width / 2, u1: length / 2 + door.width / 2, v0: 0, v1: door.height, depth: m(0.3), back: material("heartwood"), arch: "ogee", sides: material("stone-moon") }];
            continue;
        }

        if (skip.includes(k) || length < m(1.1) || !random.chance(windows)) {
            continue;
        }

        const moon = random.chance(0.45);

        openings[k] = moon ? [{ u0: length / 2 - m(0.5), u1: length / 2 + m(0.5), v0: sill + m(0.1), v1: sill + m(1.1), depth: m(0.3), back: material("glass-green"), arch: "moon", sides: material("stone-moon") }] : [{ u0: length / 2 - m(0.26), u1: length / 2 + m(0.26), v0: sill, v1: sill + tall, depth: m(0.3), back: material("glass-green"), arch: "lancet", sides: material("stone-moon") }];
    }

    return openings;
}

/**
 * A ground house: an oval (rx by rz round (cx, cz)) on a pale plinth, its walls marble, its door
 * an ogee facing south, under a petal roof reaching out over a veranda; a smaller upper storey
 * rising through that roof under its own (a pagoda), a crescent on its crown, bud lamps by the
 * door, a young tree grown against its back.
 */
export function groundHouse(solid, cx, cz, { rx, rz, storeys = 1, random, wealth = 0.5, trees = null }) {
    const count = 16;
    const plinth = m(0.55);
    const outline = oval(cx, cz, rx, rz, count, southSide(count));
    const height = m(3.4);

    solid.extrude(inset(outline, -m(0.35)), 0, plinth, material("stone-moon"), { top: material("marble") });

    const openings = elvenOpenings(outline, random, { windows: 0.6 });
    const faces = solid.walls(outline, plinth, height, openings, material("marble"));

    heartwoodRibs(solid, faces, height, openings);

    // A veranda round its front on slender posts, whiplash brackets under the roof
    const deck = m(1.8);

    ringDeckOval(solid, cx, cz, rx, rz, deck, plinth);

    for (let k = 2; k < count - 1; k += 2) {
        if (k > count / 2 - 1 && k < count / 2 + 2) {
            continue;
        }

        const face = faces[k];
        const at = wallPoint(face);
        const [x, , z] = at(face.length / 2, 0, deck - m(0.2));

        post(solid, x, plinth, z, height - m(0.1), m(0.08), "heartwood", { sides: 6 });
        whiplash(solid, [x, plinth + height * 0.62, z], at(face.length / 2, height - m(0.1), m(0.1)), [0, 1, 0], "silver", { bow: 0.25, curl: 0.2, r: m(0.04) });
    }

    const roofName = random.pick(ROOFS);
    const eaves = plinth + height;
    const reach = Math.max(rx, rz) + deck + m(0.3);

    if (storeys > 1) {
        // (The lower roof a skirt up to the upper storey's walls)
        const [ux, uz] = [rx * 0.66, rz * 0.66];
        const upper = oval(cx, cz, ux, uz, count, southSide(count));

        petalRoof(solid, cx, cz, eaves, reach, m(1.6), roofName, { petals: 7, lift: m(0.6), crown: Math.max(ux, uz) * 0.95 });

        const upperY = eaves + m(1.2);

        solid.walls(upper, upperY, m(3), elvenOpenings(upper, random, { door: null, windows: 0.7, sill: m(0.9), tall: m(1.6) }), material("marble"));

        const top = petalRoof(solid, cx, cz, upperY + m(3), Math.max(ux, uz) + m(1.4), Math.max(ux, uz) * 1.1, roofName, { petals: 5, lift: m(0.5) });

        crescent(solid, cx, top, cz, m(1.1), "silver");
    } else {
        const top = petalRoof(solid, cx, cz, eaves, reach, Math.max(rx, rz) * 0.95, roofName, { petals: 6, lift: m(0.6) });

        crescent(solid, cx, top, cz, m(0.9), "silver");
    }

    // Lamps by the door, steps up to it
    const door = faces[0];
    const at = wallPoint(door);

    for (const side of [-1, 1]) {
        budLamp(solid, at(door.length / 2 + side * m(1), m(2.8), m(0.1)), [door.out[0] + side * 0.3 * door.across[0], door.out[2] + side * 0.3 * door.across[2]], { reach: m(0.6) });
    }

    const foot = at(door.length / 2, 0, m(0.4));

    steps(solid, foot[0] + door.out[0] * m(1.5), foot[2] + door.out[2] * m(1.5), 0, plinth, [-door.out[0], -door.out[2]], m(1.8), "stone-moon", { tread: m(0.35), riser: plinth / 3 });

    // A young tree grown against its back, its roots running round the plinth
    if (trees && wealth > 0.3) {
        greatTree(trees, cx + rx * 0.3, cz - rz - m(1.2), { kind: random.pick(["beech", "birch"]), n: random.int(0, 3), size: 1.3 });

        for (let k = 0; k < 3; k++) {
            const a = -Math.PI / 2 + (k - 1) * 0.5;

            solid.tube([[cx + rx * 0.3, m(0.3), cz - rz - m(1.2)], [cx + Math.cos(a) * rx * 1.05, m(0.35), cz + Math.sin(a) * rz * 1.05], [cx + Math.cos(a + (k - 1) * 0.3) * rx * 1.1, 0, cz + Math.sin(a + (k - 1) * 0.3) * rz * 1.12]], [m(0.25), m(0.18), m(0.06)], material("bark-silver"), { sides: 5 });
        }
    }

    return eaves;
}

// Ribs of heartwood up a curving wall at every other corner, curling in at their heads (the
// whiplash line), and a band of it along the wall's head
function heartwoodRibs(solid, faces, height, openings = {}) {
    for (const [k, face] of faces.entries()) {
        const at = wallPoint(face);

        solid.member(at(0, height - m(0.25)), at(face.length, height - m(0.25)), face.out, m(0.22), m(0.06), material("heartwood"));

        if (k % 2 === 0 && !(openings[k] ?? []).some(({ u0 }) => u0 < m(0.3))) {
            solid.member(at(0, 0), at(0, height - m(0.5)), face.out, m(0.16), m(0.07), material("heartwood"), { ends: false });
            whiplash(solid, at(0, height - m(0.55), m(0.05)), at(Math.min(face.length * 0.6, m(0.9)), height - m(0.3), m(0.05)), [0, -1, 0], "heartwood", { bow: 0.35, curl: 0.25, r: m(0.05) });
        }
    }
}

// A veranda's deck round an oval house's front half, on its plinth, `deck` deep, a rail round it
function ringDeckOval(solid, cx, cz, rx, rz, deck, y) {
    const count = 20;
    const angles = Array.from({ length: count + 1 }, (_, k) => Math.PI * 0.05 + (k / count) * Math.PI * 0.9);
    const at = (a, grow, h) => [cx + Math.cos(a) * (rx + grow), h, cz + Math.sin(a) * (rz + grow)];

    for (let k = 0; k < count; k++) {
        const [a, b] = [angles[k], angles[k + 1]];

        solid.facing([at(a, 0, y), at(a, deck, y), at(b, deck, y), at(b, 0, y)], [0, 1, 0], material("heartwood"));
        solid.facing([at(a, deck, y - m(0.3)), at(b, deck, y - m(0.3)), at(b, deck, y), at(a, deck, y)], [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)], material("stone-moon"));
    }

    const rail = angles.filter((a) => Math.abs(a - Math.PI / 2) > 0.3).map((a) => at(a, deck - m(0.1), y + m(0.95)));
    const [left, right] = [rail.filter(([x]) => x > cx), rail.filter(([x]) => x < cx)];

    for (const run of [left, right]) {
        if (run.length > 1) {
            solid.tube(run, m(0.035), material("silver"), { sides: 3 });

            for (const [x, py, z] of run) {
                pole(solid, [x, y, z], [x, py, z], m(0.025), "silver", { sides: 3 });
            }
        }
    }
}

/**
 * A trunk house: a great tree in the middle of its lot, a ring of decking round its trunk on
 * braces, the house a curve of walls on it wrapping part way round, a petal roof like a collar
 * round the trunk over them, a spiral stair up the trunk to it; on a richer house a second ring
 * higher up.
 */
export function trunkHouse(solid, cx, cz, { floor = m(5), random, wealth = 0.5, trees }) {
    const trunk = greatTree(trees, cx, cz, { kind: "beech", n: random.int(0, 3), size: 2.5, height: floor });
    const [r0, r1] = [trunk + m(0.35), trunk + m(4.2)];
    const stairEnd = Math.PI / 2 + ((floor / m(3.2)) * Math.PI * 2) % (Math.PI * 2);

    spiralStair(solid, cx, cz, trunk + m(0.8), 0, floor - m(0.2), { from: Math.PI / 2 });
    ringDeck(solid, cx, cz, r0, r1, floor, { from: stairEnd + 0.45, to: stairEnd + Math.PI * 2 - 0.1 });

    // The house: walls round an arc of the ring, facing out, its door and windows in them
    const [a0, a1] = [stairEnd + 1.2, stairEnd + 1.2 + Math.PI * 1.25];
    const wallR = r1 - m(1.2);
    const segments = 9;
    const arc = Array.from({ length: segments + 1 }, (_, k) => {
        const a = a0 + ((a1 - a0) * k) / segments;

        return [cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR];
    });

    for (let k = 0; k < segments; k++) {
        const [[ax, az], [bx, bz]] = [arc[k], arc[k + 1]];
        const length = Math.hypot(bx - ax, bz - az);
        const across = [(bx - ax) / length, 0, (bz - az) / length];
        const mid = [(ax + bx) / 2 - cx, (az + bz) / 2 - cz];
        const out = [across[2], 0, -across[0]];
        const outward = out[0] * mid[0] + out[2] * mid[1] > 0 ? out : [-out[0], 0, -out[2]];
        const face = { origin: [ax, floor, az], across, out: outward, length };
        const openings = k === Math.floor(segments / 2) ? [{ u0: length / 2 - m(0.55), u1: length / 2 + m(0.55), v0: 0, v1: m(2.4), depth: m(0.2), back: material("heartwood"), arch: "ogee" }] : k % 2 ? [{ u0: length / 2 - m(0.4), u1: length / 2 + m(0.4), v0: m(1.1), v1: m(1.9), depth: m(0.2), back: material("glass-green"), arch: "moon" }] : [];

        solid.wall(face, length, m(3), openings, material("heartwood"));
    }

    // (Its ends closed back to the trunk)
    for (const a of [a0, a1]) {
        const [p, q] = [[cx + Math.cos(a) * r0, cz + Math.sin(a) * r0], [cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR]];

        solid.facing([[p[0], floor, p[1]], [q[0], floor, q[1]], [q[0], floor + m(3), q[1]], [p[0], floor + m(3), p[1]]], [-Math.sin(a) * (a === a0 ? 1 : -1), 0, Math.cos(a) * (a === a0 ? 1 : -1)], material("heartwood"));
    }

    const roofName = random.pick(ROOFS);

    petalRoof(solid, cx, cz, floor + m(3), r1 + m(0.6), m(2.2), roofName, { petals: 7, lift: m(0.7), crown: trunk * 0.95 });
    budLamp(solid, [cx + Math.cos(a0 + (a1 - a0) / 2) * (wallR + m(0.2)), floor + m(2.6), cz + Math.sin(a0 + (a1 - a0) / 2) * (wallR + m(0.2))], [Math.cos(a0 + (a1 - a0) / 2), Math.sin(a0 + (a1 - a0) / 2)]);

    // A second, smaller ring higher up on a richer house
    if (wealth > 0.55) {
        const high = floor + m(4.6);
        const t2 = trunk * 0.9;

        ringDeck(solid, cx, cz, t2 + m(0.3), t2 + m(2.8), high, { braces: 5 });
        solid.walls(circle(cx + m(0.01), cz, t2 + m(2), 12), high, m(2.6), { 3: [{ u0: m(0.2), u1: m(0.8), v0: m(0.9), v1: m(1.8), depth: m(0.2), back: material("glass-green"), arch: "lancet" }] }, material("heartwood"));
        petalRoof(solid, cx, cz, high + m(2.6), t2 + m(3.2), m(1.8), roofName, { petals: 5, lift: m(0.5), crown: t2 * 0.9 });
        spiralStair(solid, cx, cz, t2 + m(0.6), floor, high, { from: a1 });
    }

    return floor;
}

/** A canopy house: a round cabin on a platform high in a great tree, a ladder up to it. */
export function canopyHouse(solid, cx, cz, { floor = m(11), random, trees }) {
    const trunk = greatTree(trees, cx, cz, { kind: random.pick(["beech", "oak"]), n: random.int(0, 3), size: 2.8, height: floor });
    const r1 = trunk + m(3.6);

    ringDeck(solid, cx, cz, trunk + m(0.3), r1, floor, { braces: 7 });

    // The cabin to one side of the trunk
    const [kx, kz] = [cx + trunk + m(1.9), cz + m(0.4)];
    const cabin = circle(kx, kz, m(1.7), 10, southSide(10));

    solid.walls(cabin, floor, m(2.5), elvenOpenings(cabin, random, { door: { width: m(0.9), height: m(2.1) }, windows: 0.5, sill: m(0.9), tall: m(1.2) }), material("heartwood"));
    petalRoof(solid, kx, kz, floor + m(2.5), m(2.6), m(2.1), random.pick(ROOFS), { petals: 5, lift: m(0.4) });
    crescent(solid, kx, floor + m(4.6), kz, m(0.7), "silver");

    // (A ladder of rope and rungs from the ground)
    ladder(solid, [cx - r1 - m(0.3), 0, cz + m(0.4)], [cx - r1 + m(0.2), floor, cz + m(0.4)], m(0.5), "heartwood", { rungs: 0.4 });
    lamp(solid, [cx - r1 + m(0.2), floor - m(0.9), cz + m(0.4)], "glow-lamp", { size: m(0.25), frame: null, shape: "bud", hang: m(0.6) });
}

/**
 * An elf's house on its lot: its `type` if asked (ground, pagoda, trunk, canopy), or one to suit
 * it. The great trees it's built into go on its object's userData.trees, to be grown with the town's.
 */
export function house(piece) {
    const random = randomFor(piece);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const wealth = piece.wealth ?? random.range(0, 1);
    const type = piece.type ?? (piece.back ? "ground" : Math.min(W, D) >= m(11) ? random.pick(["trunk", "trunk", "canopy", "pagoda"]) : random.pick(["ground", "ground", "pagoda"]));
    const solid = new Solid();
    const trees = [];

    toned(solid, random, [m(4)]);

    if (type === "trunk") {
        trunkHouse(solid, W / 2, D / 2, { random, wealth, trees });
    } else if (type === "canopy") {
        canopyHouse(solid, W / 2, D / 2, { random, trees });
    } else {
        const [rx, rz] = [Math.min(m(4.2), W / 2 - m(2.3)), Math.min(m(3.4), D / 2 - m(2.4))];

        groundHouse(solid, W / 2, D / 2 + m(0.3), { rx, rz, storeys: type === "pagoda" ? 2 : 1, random, wealth, trees });
    }

    const object = solid.toObject();

    object.userData.trees = trees;

    return object;
}

export const GALLERY = Object.freeze({
    houses: [["canopy", 3, 3], ["trunk", 3.4, 3.4], ["pagoda", 3.2, 3], ["ground", 3, 2.8]],
});

// --- Landmarks ---

/**
 * The tavern: a hall of leaves, a great oval of two storeys against a great tree rising through
 * its back, a gallery round its upper storey on whiplash brackets, a glowing lantern at its
 * crown, its name on a silver-framed board by the door.
 */
export async function tavern(piece) {
    await loadSignFont();

    const random = randomFor(piece, 61);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const own = piece.tavern ?? { name: "The Silver Leaf", emblem: "tankard", count: 1 };
    const solid = new Solid();
    const trees = [];
    const doorFace = D - m(ENTRY) + m(0.3);
    const rz = Math.min(m(4.2), (doorFace - m(1.5)) / 2);
    const rx = Math.min(W / 2 - m(0.8), m(5.5));
    const [cx, cz] = [W / 2, doorFace - rz];

    toned(solid, random, [m(4)]);

    const count = 18;
    const outline = oval(cx, cz, rx, rz, count, southSide(count));
    const plinth = m(0.3);

    solid.extrude(inset(outline, -m(0.3)), 0, plinth, material("stone-moon"), { top: material("marble") });

    const openings = elvenOpenings(outline, random, { door: { width: m(1.8), height: m(2.4) }, windows: 0.7 });
    const faces = solid.walls(outline, plinth, m(3.6), openings, material("marble"));
    const upper = oval(cx, cz, rx * 0.8, rz * 0.8, count, southSide(count));

    petalRoof(solid, cx, cz, plinth + m(3.6), Math.max(rx, rz) + m(1), m(1.4), "leafscale", { petals: 7, lift: m(0.5), crown: Math.max(rx, rz) * 0.8 });
    solid.walls(upper, plinth + m(4.6), m(2.8), elvenOpenings(upper, random, { door: null, windows: 0.8, sill: m(0.8), tall: m(1.5) }), material("marble"));

    const top = petalRoof(solid, cx, cz, plinth + m(7.4), Math.max(rx, rz) * 0.8 + m(1.2), m(3.4), "leafscale-sage", { petals: 6, lift: m(0.5), crown: m(0.6) });

    // (The lantern at its crown: a glowing bud)
    lamp(solid, [cx, top + m(0.5), cz], "glow-lamp", { size: m(0.8), frame: null, shape: "bud" });
    crescent(solid, cx, top + m(1), cz, m(1), "silver");

    // The great tree rising through its back
    greatTree(trees, cx + rx * 0.35, cz - rz * 0.55, { kind: "oak", n: random.int(0, 4), size: 2.2 });

    const at = wallPoint(faces[0]);

    // Its name over the door, and a lamp either side of the door below the board's ends, clear of it
    board(solid, at, faces[0].out, [faces[0].length / 2 - m(1), faces[0].length / 2 + m(1), m(2.65), m(2.65) + m(2) * (9 / 56) * 2], nameBoardTexture({ name: own.name, ground: "#1f3a30", dark: "#0c1a14" }), `board ${own.name}`);

    for (const side of [-1, 1]) {
        budLamp(solid, at(faces[0].length / 2 + side * m(1.35), m(2.05), m(0.1)), [faces[0].out[0], faces[0].out[2]], { reach: m(0.7) });
    }

    const object = solid.toObject();

    object.userData.trees = trees;

    return object;
}

/**
 * The temple: a round cella of pale stone under a petal roof borne on a ring of branching
 * columns, a veranda between them, an oculus in the roof over a moonwell within; its ogee door
 * in the cella's front.
 */
export async function church(piece) {
    await loadSignFont();

    const random = randomFor(piece, 62);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(1.2) + m(0.3);
    const r = Math.min(W / 2 - m(2.6), (doorFace - m(3)) / 2);
    const [cx, cz] = [W / 2, doorFace - r];
    const floor = m(0.6);
    const count = 16;
    const cella = circle(cx, cz, r, count, southSide(count));

    toned(solid, random, [m(5)]);
    solid.extrude(circle(cx, cz, r + m(2.4), 20), 0, floor, material("stone-moon"), { top: material("marble") });
    solid.walls(cella, floor, m(4.4), elvenOpenings(cella, random, { door: { width: m(1.6), height: m(2.6) }, windows: 0.8, sill: m(1.4), tall: m(2.2) }), material("marble"));

    for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI * 2) / 10 + Math.PI / 10;

        treeColumn(solid, cx + Math.cos(a) * (r + m(1.9)), floor, cz + Math.sin(a) * (r + m(1.9)), m(5.2), m(0.22), "marble", { boughs: 2, spread: m(0.9), phase: a + Math.PI / 2 });
    }

    const top = petalRoof(solid, cx, cz, floor + m(5.2), r + m(3), m(3.2), "leafscale-silver", { petals: 8, lift: m(0.8), crown: m(1.4) });

    // (The oculus's ring of silver, and the moon's light through it)
    band(solid, circle(cx, cz, m(1.5), 12), top - m(0.1), top + m(0.3), m(0.15), "silver");
    solid.facing(circle(cx, cz, m(1.3), 12).map(([x, z]) => [x, top, z]).reverse(), [0, 1, 0], material("glow-moon"));

    for (const side of [-1, 1]) {
        budLamp(solid, [cx + side * m(1.3), floor + m(2.9), doorFace + m(0.1)], [side * 0.3, 1], { light: "glow-moon" });
    }

    steps(solid, cx, doorFace + m(1.4), 0, floor, [0, -1], m(2.4), "stone-moon", { tread: m(0.35), riser: floor / 3 });

    return solid.toObject();
}

/**
 * The smithy: a workshop (its door where the town's entrance says), and beside it a half-open
 * oval pavilion on a stone base keeping fire from the living wood, a twisted stone chimney over
 * its forge, a quenching basin fed by a runnel.
 */
export async function blacksmith(piece) {
    await loadSignFont();

    const random = randomFor(piece, 63);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, [m(3.5)]);

    const front = D - m(2.2) + m(0.3);
    const doorAt = W / 2 - m(1.2);
    const [rx, rz] = [m(2.8), m(2.4)];
    const [sx, sz] = [doorAt, front - rz];
    const shop = oval(sx, sz, rx, rz, 14, southSide(14));
    const faces = solid.walls(shop, m(0.3), m(3), elvenOpenings(shop, random, { door: { width: m(1.3), height: m(2.1) }, windows: 0.5 }), material("stone-moon"));

    solid.extrude(inset(shop, -m(0.25)), 0, m(0.3), material("stone-moon"));
    petalRoof(solid, sx, sz, m(3.3), m(3.8), m(2.6), "leafscale-sage", { petals: 5, lift: m(0.4) });

    // The pavilion: a stone base, columns, a roof open at its sides
    const [px, pz] = [W - m(3.6), m(4.2)];

    solid.extrude(oval(px, pz, m(3), m(3.6), 14), 0, m(1.2), material("stone-moon"), { top: material("marble") });

    for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI * 2) / 6;

        treeColumn(solid, px + Math.cos(a) * m(2.5), m(1.2), pz + Math.sin(a) * m(3), m(3), m(0.14), "stone-moon", { boughs: 2, spread: m(0.5), phase: a + Math.PI / 2 });
    }

    petalRoof(solid, px, pz, m(4.2), m(4), m(2), "leafscale-silver", { petals: 6, lift: m(0.5), crown: m(0.5) });

    // (The forge and its twisted chimney up through the roof's crown)
    solid.extrude(circle(px, pz, m(0.9), 8), m(1.2), m(2), material("stone-moon"));
    solid.facing(circle(px, pz, m(0.6), 8).map(([x, z]) => [x, m(2.01), z]).reverse(), [0, 1, 0], material("embers"));
    // (Its fire, burning day and night: world/fire.js)
    fireLight(solid, [px, m(2.01), pz], "brazier");

    const twist = Array.from({ length: 10 }, (_, k) => [px + Math.cos(k * 0.7) * m(0.25), m(2) + k * m(0.75), pz + Math.sin(k * 0.7) * m(0.25)]);

    solid.tube(twist, twist.map((_, k) => m(0.55) - k * m(0.025)), material("marble"), { sides: 7, caps: true });

    // (The quenching basin, and its runnel)
    band(solid, circle(px - m(3.3), pz + m(3.4), m(0.9), 10), 0, m(0.6), m(0.2), "stone-moon", { rounded: true });
    solid.facing(circle(px - m(3.3), pz + m(3.4), m(0.72), 10).map(([x, z]) => [x, m(0.5), z]).reverse(), [0, 1, 0], material("water"));
    board(solid, wallPoint(faces[0]), faces[0].out, [faces[0].length / 2 + m(0.8), faces[0].length / 2 + m(1.6), m(1.3), m(2.1)], emblemSignTexture({ name: "Smithy", emblem: "anvil", tint: random.int(0, 5) }), "sign smithy", m(0.08));

    return solid.toObject();
}

/**
 * The guild's hall: a long oval of pale stone, moon windows high in it, under two stave-church
 * roofs, one over the other, with crossed leaf-blade finials; branching columns carrying a porch
 * before its door.
 */
export async function guild(piece) {
    await loadSignFont();

    const random = randomFor(piece, 64);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(ENTRY) + m(0.3);
    const rz = Math.min(m(4.5), (doorFace - m(1)) / 2);
    const rx = W / 2 - m(1.4);
    const [cx, cz] = [W / 2, doorFace - rz];
    const outline = oval(cx, cz, rx, rz, 20, southSide(20));

    toned(solid, random, [m(5)]);
    solid.extrude(inset(outline, -m(0.3)), 0, m(0.3), material("stone-moon"));

    const faces = solid.walls(outline, m(0.3), m(4.6), elvenOpenings(outline, random, { door: { width: m(2.2), height: m(2.6) }, windows: 0.75, sill: m(2.8), tall: m(1.2) }), material("marble"));

    // Two roofs, the lower a skirt, the upper over a clerestory
    petalRoof(solid, cx, cz, m(4.9), Math.max(rx, rz) + m(1), m(1.6), "leafscale", { petals: 8, lift: m(0.5), crown: Math.max(rx, rz) * 0.7 });

    const upper = oval(cx, cz, rx * 0.72, rz * 0.72, 20, southSide(20));

    solid.walls(upper, m(6.2), m(1.8), Object.fromEntries(upper.map((_, k) => [k, k % 2 ? [] : [{ u0: lengthOf(upper, k) / 2 - m(0.4), u1: lengthOf(upper, k) / 2 + m(0.4), v0: m(0.4), v1: m(1.3), depth: m(0.2), back: material("glass-green"), arch: "moon" }]])), material("marble"));

    const top = petalRoof(solid, cx, cz, m(8), Math.max(rx, rz) * 0.72 + m(1.1), m(3), "leafscale-silver", { petals: 6, lift: m(0.5) });

    for (const side of [-1, 1]) {
        whiplash(solid, [cx, top - m(0.2), cz], [cx + side * m(0.9), top + m(1.6), cz], [0, 0, 1], "silver", { bow: 0.3, curl: 0.3, r: m(0.07) });
        treeColumn(solid, cx + side * m(1.8), m(0.3), doorFace + m(1.2), m(3.4), m(0.14), "marble", { boughs: 2, spread: m(0.8), phase: 0 });
    }

    // (Its name over the door, between the boughs of the columns before it)
    board(solid, wallPoint(faces[0]), faces[0].out, [faces[0].length / 2 - m(1.15), faces[0].length / 2 + m(1.15), m(2.8), m(2.8) + m(2.3) * (9 / 56)], nameBoardTexture({ name: "Adventurers' Guild", ground: "#1f3a30", dark: "#0c1a14" }), "board guild", m(0.15));

    return solid.toObject();
}

/**
 * The town hall: the council tree, a great tree rising through the middle of a round hall at its
 * roots, a collar of petal roof round its trunk, a gallery higher up it; its door facing south.
 */
export async function hall(piece) {
    await loadSignFont();

    const random = randomFor(piece, 65);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const trees = [];
    const doorFace = D - m(ENTRY) + m(0.3);
    const r = Math.min(W / 2 - m(1), (doorFace - m(0.8)) / 2);
    const [cx, cz] = [W / 2, doorFace - r];

    toned(solid, random, [m(4)]);

    const trunk = greatTree(trees, cx, cz, { kind: "oak", n: random.int(0, 4), size: 2.6, height: m(4) });
    const count = 18;
    const outline = circle(cx, cz, r, count, southSide(count));

    solid.extrude(inset(outline, -m(0.3)), 0, m(0.3), material("stone-moon"));

    const faces = solid.walls(outline, m(0.3), m(3.8), elvenOpenings(outline, random, { door: { width: m(2), height: m(2.5) }, windows: 0.8 }), material("marble"));

    petalRoof(solid, cx, cz, m(4.1), r + m(1.2), m(3), "leafscale-gold", { petals: 9, lift: m(0.6), crown: trunk * 0.95 });
    ringDeck(solid, cx, cz, trunk * 0.85 + m(0.3), trunk * 0.85 + m(3.2), m(10), { braces: 6 });
    board(solid, wallPoint(faces[0]), faces[0].out, [faces[0].length / 2 - m(1.6), faces[0].length / 2 + m(1.6), m(2.7), m(2.7) + m(3.2) * (9 / 56)], nameBoardTexture({ name: "Town Hall", ground: "#1f3a30", dark: "#0c1a14" }), "board hall", m(0.15));

    const object = solid.toObject();

    object.userData.trees = trees;

    return object;
}

/**
 * A capital's keep: a slender tower of pale stone in tiers, each under its own petal roof, moon
 * windows up it, its door up steps between two branching columns.
 */
export async function keep(piece) {
    await loadSignFont();

    const random = randomFor(piece, 66);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(1.4) + m(0.3);
    const r = Math.min(W / 2 - m(1.2), (doorFace - m(1)) / 2);
    const [cx, cz] = [W / 2, doorFace - r];

    toned(solid, random, []);

    let y = m(0.8);
    let radius = r;

    solid.extrude(circle(cx, cz, r + m(0.5), 18), 0, y, material("stone-moon"), { top: material("marble") });

    for (let tier = 0; tier < 4; tier++) {
        const count = 16;
        const outline = circle(cx, cz, radius, count, southSide(count));
        const height = tier === 0 ? m(4.2) : m(3.4);

        solid.walls(outline, y, height, elvenOpenings(outline, random, { door: tier === 0 ? { width: m(2.4), height: m(3.2) } : null, windows: 0.6, sill: m(1), tall: m(1.6) }), material("marble"));
        y += height;
        radius *= 0.78;
        petalRoof(solid, cx, cz, y, radius / 0.78 + m(1), m(1.2), random.pick(ROOFS), { petals: 7, lift: m(0.5), crown: radius });
        y += m(1);
    }

    const top = petalRoof(solid, cx, cz, y, radius + m(1), radius * 1.8, "leafscale-silver", { petals: 6, lift: m(0.4) });

    crescent(solid, cx, top, cz, m(1.4), "silver");
    steps(solid, cx, doorFace + m(1.5), 0, m(0.8), [0, -1], m(3), "stone-moon", { tread: m(0.35), riser: m(0.2) });

    // (Their leaf on long banners hung either side of the door, stirring in the breeze:
    // world/cloth.js)
    for (const side of [-1, 1]) {
        const a = side * Math.min(0.5, m(2.4) / r);
        const out = [Math.sin(a), 0, Math.cos(a)];

        (solid.cloth ??= []).push({ at: [cx + out[0] * (r + m(0.06)), m(4.6), cz + out[2] * (r + m(0.06))], out, width: m(0.9), drop: m(3.2), kind: "wall", look: "elf" });
    }

    for (const side of [-1, 1]) {
        treeColumn(solid, cx + side * m(2.2), 0, doorFace + m(1), m(4.5), m(0.18), "marble", { boughs: 2, spread: m(0.9) });
        budLamp(solid, [cx + side * m(2.2), m(4.5), doorFace + m(1)], [side, 0.4]);
    }

    return solid.toObject();
}

/** The market: stalls under leaf-shaped cloths each on one curving post, round a clearing. */
export function market(piece) {
    const random = randomFor(piece, 67);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const count = 6;

    toned(solid, random, []);

    for (let k = 0; k < count; k++) {
        const a = Math.PI * 0.15 + (k / (count - 1)) * Math.PI * 0.7 + Math.PI;
        const [x, z] = [cx + Math.cos(a) * (W / 2 - m(2)), cz + Math.sin(a) * (D / 2 - m(1.5)) + m(3)];
        const [ox, oz] = [Math.cos(a), Math.sin(a)];

        // (The post curving up and over, the leaf of cloth hanging from its crook)
        whiplash(solid, [x + ox * m(0.9), 0, z + oz * m(0.9)], [x - ox * m(0.5), m(3), z - oz * m(0.5)], [ox, 0.4, oz], "verdigris", { bow: 0.2, curl: 0.15, r: m(0.08) });

        const leaf = Array.from({ length: 9 }, (_, i) => {
            const t = i / 8;
            const half = m(1.4) * Math.sin(Math.PI * t) ** 0.8;

            return [[x - ox * m(1.5) + ox * m(3) * t - oz * half, m(2.9) - m(0.3) * Math.sin(Math.PI * t), z - oz * m(1.5) + oz * m(3) * t + ox * half], [x - ox * m(1.5) + ox * m(3) * t + oz * half, m(2.9) - m(0.3) * Math.sin(Math.PI * t), z - oz * m(1.5) + oz * m(3) * t - ox * half]];
        });

        solid.loft(leaf, material(random.pick(["cloth-green", "silk", "cloth-saffron"])), { closed: false, out: [0, 1, 0] });
        solid.loft(leaf, material("cloth-green"), { closed: false, out: [0, -1, 0] });

        // (A curved counter of stone, goods on it)
        solid.extrude(oval(x, z, m(1.2), m(0.5), 10, a), 0, m(0.9), material("stone-moon"), { top: material("marble") });

        for (let g = 0; g < 3; g++) {
            solid.lathe(x + (g - 1) * m(0.5) * -oz, z + (g - 1) * m(0.5) * ox, [[0, m(0.9)], [m(0.18), m(1)], [m(0.14), m(1.2)], [0, m(1.25)]], material(random.pick(["apples", "sun-gold", "glass-green", "silk"])), { segments: 7 });
        }
    }

    return solid.toObject();
}

export function windmill(piece) {
    return market(piece);
}

export const LANDMARKS = Object.freeze({ tavern, church, blacksmith, guild, hall, keep, market, windmill });

export function landmark(piece) {
    return (LANDMARKS[piece.name] ?? market)(piece);
}

// --- Their own places ---

/** The moonwell: a pale stone basin of glowing water under crescent ribs leaning in, paving round it. */
function moonwell(piece) {
    const random = randomFor(piece, 71);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const r = m(3);

    toned(solid, random, []);
    solid.facing(circle(cx, cz, Math.min(W, D) / 2 - m(0.5), 24).map(([x, z]) => [x, m(0.04), z]).reverse(), [0, 1, 0], material("marble"));
    band(solid, circle(cx, cz, r, 20), 0, m(0.65), m(0.5), "stone-moon", { rounded: true });
    solid.facing(circle(cx, cz, r - m(0.5), 20).map(([x, z]) => [x, m(0.45), z]).reverse(), [0, 1, 0], material("glow-moon"));

    for (let k = 0; k < 7; k++) {
        const a = (k * Math.PI * 2) / 7;
        const [ox, oz] = [Math.cos(a), Math.sin(a)];
        const rib = Array.from({ length: 8 }, (_, i) => {
            const t = i / 7;

            return [cx + ox * (r + m(0.6) - t * m(2.4)), t * m(4.2) + Math.sin(Math.PI * t) * m(0.4), cz + oz * (r + m(0.6) - t * m(2.4))];
        });

        solid.tube(rib, rib.map((_, i) => m(0.18) * (1 - i / 9)), material("marble"), { sides: 5 });
        lamp(solid, [rib.at(-1)[0], rib.at(-1)[1] - m(0.5), rib.at(-1)[2]], "glow-moon", { size: m(0.3), frame: null, shape: "bud", hang: m(0.3) });
    }

    return solid.toObject();
}

/**
 * The tree hall: a colossal tree, a round hall at its roots whose walls stand between its
 * buttresses, galleries round it higher up, a spiral stair between them.
 */
function treeHall(piece) {
    const random = randomFor(piece, 72);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const trees = [];
    const [cx, cz] = [W / 2, D / 2];

    toned(solid, random, [m(5)]);

    const trunk = greatTree(trees, cx, cz, { kind: "oak", n: random.int(0, 4), size: 3.6, height: m(5) });
    const r = trunk + m(5);
    const outline = circle(cx, cz, r, 20, southSide(20));

    solid.extrude(inset(outline, -m(0.4)), 0, m(0.5), material("stone-moon"));
    solid.walls(outline, m(0.5), m(5), elvenOpenings(outline, random, { door: { width: m(2), height: m(3.2) }, windows: 0.8, sill: m(1.5), tall: m(2.6) }), material("heartwood"));

    // (The roots flaring out between the walls' panels)
    for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI * 2) / 8 + 0.2;
        const [ox, oz] = [Math.cos(a), Math.sin(a)];

        solid.tube([[cx + ox * trunk, m(5.5), cz + oz * trunk], [cx + ox * (r - m(0.4)), m(3), cz + oz * (r - m(0.4))], [cx + ox * (r + m(0.6)), 0, cz + oz * (r + m(0.6))]], [m(0.7), m(0.55), m(0.3)], material("bark-silver"), { sides: 6 });
    }

    petalRoof(solid, cx, cz, m(5.5), r + m(1.4), m(4.5), "leafscale", { petals: 9, lift: m(0.8), crown: trunk * 0.9 });
    ringDeck(solid, cx, cz, trunk * 0.8 + m(0.3), trunk * 0.8 + m(3.5), m(13), { braces: 8 });
    ringDeck(solid, cx, cz, trunk * 0.7 + m(0.3), trunk * 0.7 + m(2.8), m(19), { braces: 6 });
    spiralStair(solid, cx, cz, trunk * 0.8 + m(0.9), m(10), m(19), { from: 0 });

    const object = solid.toObject();

    object.userData.trees = trees;

    return object;
}

/**
 * The starwatch: the tallest thing in an elven town, a tower of tiers each under a petal roof,
 * moon windows up it, a stair winding round its outside, and at its top an open dome pierced
 * with stars over an armillary sphere of silver rings.
 */
function starwatch(piece) {
    const random = randomFor(piece, 73);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    let r = Math.min(W, D) / 2 - m(3);
    let y = m(0.6);

    toned(solid, random, []);
    solid.extrude(circle(cx, cz, r + m(1.2), 20), 0, y, material("stone-moon"), { top: material("marble") });

    for (let tier = 0; tier < 5; tier++) {
        const outline = circle(cx, cz, r, 14, southSide(14));
        const height = m(5);

        solid.walls(outline, y, height, elvenOpenings(outline, random, { door: tier === 0 ? { width: m(1.4), height: m(2.8) } : null, windows: 0.5, sill: m(1.4), tall: m(2) }), material("marble"));

        if (tier < 4) {
            petalRoof(solid, cx, cz, y + height, r + m(1), m(1), "leafscale-silver", { petals: 7, lift: m(0.4), crown: r * 0.82 });
        }

        y += height;
        r *= 0.84;
    }

    // The open top: columns, a dome pierced with stars (glowing), an armillary sphere within
    for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI * 2) / 8;

        pole(solid, [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], [cx + Math.cos(a) * r, y + m(3), cz + Math.sin(a) * r], m(0.15), "marble", { sides: 6 });
    }

    solid.extrude(circle(cx, cz, r + m(0.4), 16), y + m(3), y + m(3.3), material("stone-moon"));
    solid.lathe(cx, cz, Array.from({ length: 6 }, (_, k) => [(r + m(0.3)) * Math.cos((k * Math.PI) / 10), y + m(3.3) + (r + m(0.3)) * Math.sin((k * Math.PI) / 10)]).concat([[0, y + m(3.3) + r + m(0.3)]]), material("vert-wagon"), { segments: 16 });

    for (let k = 0; k < 18; k++) {
        const a = random.next() * Math.PI * 2;
        const e = random.range(0.2, 1.2);
        const [sx, sy, sz] = [cx + Math.cos(a) * Math.cos(e) * (r + m(0.35)), y + m(3.3) + Math.sin(e) * (r + m(0.35)), cz + Math.sin(a) * Math.cos(e) * (r + m(0.35))];

        solid.box(sx - m(0.1), sy - m(0.1), sz - m(0.1), sx + m(0.1), sy + m(0.1), sz + m(0.1), material("glow-moon"));
    }

    for (let k = 0; k < 3; k++) {
        const tilt = (k * Math.PI) / 3;
        const ring = Array.from({ length: 17 }, (_, i) => {
            const a = (i * Math.PI * 2) / 16;

            return [cx + Math.cos(a) * m(1.1), y + m(1.6) + Math.sin(a) * m(1.1) * Math.cos(tilt), cz + Math.sin(a) * m(1.1) * Math.sin(tilt)];
        });

        solid.tube(ring, m(0.05), material("sun-gold"), { sides: 3 });
    }

    crescent(solid, cx, y + m(3.3) + r + m(0.3), cz, m(1.4), "silver");

    // The stair winding round the outside of the lowest tiers
    spiralStair(solid, cx, cz, Math.min(W, D) / 2 - m(3) + m(0.9), 0, m(10), { from: Math.PI / 2, turnRise: m(8) });

    return solid.toObject();
}

/**
 * A castle: slender towers of different heights round a colossal tree, pale curtain walls with a
 * wave along their tops between them, a gate of two branching pillars under an ogee arch.
 */
function castle(piece) {
    const random = randomFor(piece, 74);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const trees = [];
    const [cx, cz] = [W / 2, D / 2];
    const R = Math.min(W, D) / 2 - m(4);

    toned(solid, random, []);
    greatTree(trees, cx, cz - m(2), { kind: "oak", n: random.int(0, 4), size: 3.8 });

    const count = 7;
    const towers = Array.from({ length: count }, (_, k) => {
        const a = Math.PI / 2 + (k * Math.PI * 2) / count + Math.PI / count;

        return [cx + Math.cos(a) * R, cz + Math.sin(a) * R, m(random.range(16, 28))];
    });

    // Curtain walls between the towers, a wave along their tops (the gate's gap to the south)
    for (let k = 0; k < count; k++) {
        const [[ax, az], [bx, bz]] = [towers[k], towers[(k + 1) % count]];

        if (k === count - 1) {
            continue;
        }

        band(solid, [[ax, az], [bx, bz]], 0, m(6.5), m(1.6), "stone-moon", { closed: false });

        const long = Math.hypot(bx - ax, bz - az);
        const waves = Math.max(2, Math.round(long / m(3)));

        for (let w = 0; w < waves; w++) {
            const t = (w + 0.5) / waves;
            const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];

            solid.lathe(x, z, [[m(1.3), m(6.5)], [m(0.9), m(7.2)], [0, m(7.5)]], material("marble"), { segments: 8 });
        }
    }

    for (const [x, z, height] of towers) {
        const r = m(2.1);

        solid.walls(circle(x, z, r, 12), 0, height, Object.fromEntries([3, 7, 11].map((k) => [k, [{ u0: m(0.3), u1: m(0.8), v0: height * 0.55, v1: height * 0.55 + m(1.6), depth: m(0.3), back: material("glass-green"), arch: "lancet" }]])), material("marble"));
        petalRoof(solid, x, z, height, r + m(0.9), r * 2.4, random.pick(ROOFS), { petals: 5, lift: m(0.4) });
        crescent(solid, x, height + r * 2.4, z, m(0.9), "silver");
    }

    // The gate between the last two towers
    const [[gx0, gz0], [gx1, gz1]] = [towers[count - 1], towers[0]];
    const [gx, gz] = [(gx0 + gx1) / 2, (gz0 + gz1) / 2];

    for (const side of [-1, 1]) {
        const [px, pz] = [gx + side * m(3), gz];

        treeColumn(solid, px, 0, pz, m(9), m(0.45), "marble", { boughs: 3, spread: m(1.4) });
        budLamp(solid, [px, m(6), pz + m(0.3)], [0, 1]);
    }

    const arch = Array.from({ length: 11 }, (_, k) => {
        const t = k / 10;
        const u = -1 + 2 * t;

        // (An ogee: curving out, then in to its point)
        return [gx + u * m(3), m(8.5) + (1 - Math.abs(u)) ** 0.7 * m(2.5) + Math.sin(Math.PI * Math.abs(u)) * m(0.4), gz];
    });

    solid.tube(arch, m(0.3), material("verdigris"), { sides: 6 });
    band(solid, [[gx - m(4.6), gz], [gx - m(3.6), gz]], 0, m(6.5), m(1.6), "stone-moon", { closed: false });
    band(solid, [[gx + m(3.6), gz], [gx + m(4.6), gz]], 0, m(6.5), m(1.6), "stone-moon", { closed: false });

    const object = solid.toObject();

    object.userData.trees = trees;

    return object;
}

export const STRUCTURE_SIZES = PEOPLE_PLACES.elf;

const STRUCTURES = Object.freeze({ moonwell, "tree hall": treeHall, starwatch, castle });

export function structure(piece) {
    return STRUCTURES[piece.name](piece);
}

/** A length of wall (w plots along x, facing south): pale stone, a wave along its top. */
export function wall(piece) {
    const random = randomFor(piece, 75);
    const L = piece.w * CELL;
    const z = piece.h * CELL * 0.55;
    const solid = new Solid();

    toned(solid, random, []);
    band(solid, [[L, z], [0, z]], 0, m(5.5), m(1.4), "stone-moon", { closed: false });

    for (let x = m(1.2); x < L; x += m(2.4)) {
        solid.lathe(x, z - m(0.7), [[m(1.2), m(5.5)], [m(0.8), m(6.2)], [0, m(6.5)]], material("marble"), { segments: 8 });
    }

    return solid.toObject();
}

/** A gate: two branching pillars under an ogee arch of verdigris, leaf-shaped doors, lamps hanging. */
export function gatehouse(piece) {
    const random = randomFor(piece, 76);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [gx, gz] = [W / 2, D / 2];

    toned(solid, random, []);

    for (const side of [-1, 1]) {
        treeColumn(solid, gx + side * m(3), 0, gz, m(9), m(0.45), "marble", { boughs: 3, spread: m(1.4), phase: side > 0 ? 0 : Math.PI });

        for (let k = 0; k < 3; k++) {
            budLamp(solid, [gx + side * m(3), m(4) + k * m(1.4), gz + m(0.35)], [side * 0.3, 1], { reach: m(0.5) });
        }

        // (A leaf-shaped door leaf swung open)
        const leaf = Array.from({ length: 7 }, (_, i) => {
            const t = i / 6;

            return [gx + side * (m(0.4) + m(2.2) * Math.sin(Math.PI * t) ** 0.8 * 0.5), m(4.2) * t, gz + m(0.6) + m(1.4) * t * 0.2];
        });

        solid.facing([[gx + side * m(0.4), 0, gz + m(0.6)], ...leaf.slice(1, -1), [gx + side * m(0.4), m(4.2), gz + m(0.8)]], [0, 0, 1], material("verdigris"));
    }

    const arch = Array.from({ length: 11 }, (_, k) => {
        const u = -1 + (2 * k) / 10;

        return [gx + u * m(3), m(8.5) + (1 - Math.abs(u)) ** 0.7 * m(2.5) + Math.sin(Math.PI * Math.abs(u)) * m(0.4), gz];
    });

    solid.tube(arch, m(0.3), material("verdigris"), { sides: 6 });
    crescent(solid, gx, m(11), gz, m(1.3), "silver");

    return solid.toObject();
}

/** A slender round tower of pale stone under a petal cap. */
export function tower(piece) {
    const random = randomFor(piece, 77);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const r = Math.min(W, D) / 2 - m(1);

    toned(solid, random, []);
    solid.walls(circle(W / 2, D / 2, r, 12), 0, m(12), { 3: [{ u0: m(0.3), u1: m(0.8), v0: m(7), v1: m(8.6), depth: m(0.3), back: material("glass-green"), arch: "lancet" }] }, material("marble"));
    petalRoof(solid, W / 2, D / 2, m(12), r + m(0.9), r * 2.4, "leafscale", { petals: 5, lift: m(0.4) });
    crescent(solid, W / 2, m(12) + r * 2.4, D / 2, m(0.8), "silver");

    return solid.toObject();
}
