// The specialists' and the masters' shops from outside (docs/WAR.md *Shops*), whichever people's
// town they stand in: each one's name and sign, and what's set out by its door to show what's sold
// within. A swordsmith's rack of blades and a whetstone; an armorer's harness on its stand and the
// shields on a board; an occult scriptorium's open book on a lectern and its tomes stacked; an
// alchemist's shelf of bottles and the herbs drying; the masters' the same, finer, under their
// banners; the Mystic Emporium's orb glowing on its pillar between lanterns of coloured glass.
//
// Built facing south (out along +z), as the town's buildings are, in world pixels (five to a
// metre); each kit (landmarks.js, and each people's) builds the shop's house and calls dressShop
// for what stands before it.

import { createRandom } from "../../../core/random.js";
import { SHOP_LANDMARKS } from "../../../core/setpieces/pieces.js";
import { material } from "../engine/materials.js";
import { emblemSignTexture, signMaterial } from "./signs.js";

const M = 5;
const m = (metres) => metres * M;
const TAU = Math.PI * 2;

/**
 * Each shop's name (on its board), its sign's emblem (emblems.js) and field (signs.js
 * emblemSignTexture `tint`), its board's colours, and what's set out by its door either side
 * (`left`, `right`: dressShop's pieces), and whether it's a master's (banners either side).
 */
export const SHOPFRONTS = Object.freeze({
    swordsmith: { name: "Swordsmith", emblem: "sword", tint: 3, ground: "#24262c", dark: "#101114", left: "blades", right: "whetstone" },
    armorer: { name: "Armorer", emblem: "helm", tint: 2, ground: "#1f2a3a", dark: "#0c121a", left: "harness", right: "shields" },
    scriptorium: { name: "Occult Scriptorium", emblem: "book", tint: 1, ground: "#3a1414", dark: "#1a0808", left: "lectern", right: "tomes" },
    alchemist: { name: "Alchemist", emblem: "flask", tint: 0, ground: "#1e3320", dark: "#0c180c", left: "bottles", right: "herbs" },
    masterSwordsmith: { name: "Master Swordsmith", emblem: "blades", tint: 3, ground: "#2a1e0a", dark: "#120c02", left: "blades", right: "blades", master: "cloth-gold" },
    masterArmorer: { name: "Master Armorer", emblem: "helm", tint: 5, ground: "#2a1e0a", dark: "#120c02", left: "harness", right: "shields", master: "cloth-gold" },
    emporium: { name: "Mystic Emporium", emblem: "orb", tint: 5, ground: "#2a1438", dark: "#120818", left: "orb", right: "bottles", master: "cloth-violet", lanterns: true },
});

/** The shops built this way: their landmarks' names (setpieces/pieces.js SHOP_LANDMARKS). */
export const SHOP_NAMES = SHOP_LANDMARKS;

// A rack of blades: two posts and two rails, swords standing in it points down, their hilts up
function blades(solid, x, z, random) {
    const timber = material("timber");

    for (const side of [-1, 1]) {
        solid.box(x + side * m(0.75) - m(0.05), 0, z - m(0.05), x + side * m(0.75) + m(0.05), m(1.25), z + m(0.05), timber);
    }

    solid.box(x - m(0.8), m(0.35), z - m(0.08), x + m(0.8), m(0.42), z + m(0.08), timber);
    solid.box(x - m(0.8), m(1.05), z - m(0.08), x + m(0.8), m(1.12), z + m(0.08), timber);

    for (let k = 0; k < 5; k++) {
        const bx = x - m(0.56) + k * m(0.28);
        const tall = m(1.25 + random.range(-0.08, 0.1));

        solid.box(bx - m(0.03), m(0.12), z - m(0.008), bx + m(0.03), tall, z + m(0.008), material("iron"));
        solid.box(bx - m(0.11), tall, z - m(0.025), bx + m(0.11), tall + m(0.04), z + m(0.025), material(random.pick(["brass", "iron", "gold"])));
        solid.box(bx - m(0.018), tall + m(0.04), z - m(0.018), bx + m(0.018), tall + m(0.2), z + m(0.018), material("leather"));
        solid.cylinder(bx, z, tall + m(0.2), tall + m(0.25), m(0.03), m(0.03), material("brass"), { segments: 6 });
    }
}

// A whetstone on its trestle, its crank to one side
function whetstone(solid, x, z) {
    const timber = material("timber");

    for (const side of [-1, 1]) {
        solid.beam([x + side * m(0.35), 0, z - m(0.25)], [x + side * m(0.3), m(0.75), z], m(0.06), m(0.06), timber);
        solid.beam([x + side * m(0.35), 0, z + m(0.25)], [x + side * m(0.3), m(0.75), z], m(0.06), m(0.06), timber);
    }

    solid.lathe(x, z, [[0, m(0.62)], [m(0.06), m(0.62)], [m(0.06), m(0.98)], [0, m(0.98)]], material("stone"), { segments: 10 });
    solid.box(x - m(0.38), m(0.78), z - m(0.03), x + m(0.38), m(0.82), z + m(0.03), material("iron"));
    solid.beam([x + m(0.38), m(0.8), z], [x + m(0.42), m(0.62), z + m(0.12)], m(0.03), m(0.03), material("iron"));
}

// A harness of armour on its stand: a post on a cross foot, a breastplate, its pauldrons, a helm
function harness(solid, x, z, random) {
    const steel = material(random.pick(["iron", "pewter", "silver"]));

    solid.box(x - m(0.35), 0, z - m(0.04), x + m(0.35), m(0.06), z + m(0.04), material("timber"));
    solid.box(x - m(0.04), 0, z - m(0.35), x + m(0.04), m(0.06), z + m(0.35), material("timber"));
    solid.cylinder(x, z, 0, m(1.2), m(0.04), m(0.04), material("timber"), { segments: 6 });
    // (The cuirass: broad at the chest, in at the waist, flaring over the hips)
    solid.lathe(x, z, [[m(0.17), m(0.82)], [m(0.15), m(0.98)], [m(0.21), m(1.22)], [m(0.23), m(1.36)], [m(0.12), m(1.44)], [0, m(1.46)]], steel, { segments: 10 });

    for (const side of [-1, 1]) {
        solid.lathe(x + side * m(0.27), z, [[m(0.11), m(1.3)], [m(0.1), m(1.4)], [0, m(1.45)]], steel, { segments: 8 });
    }

    solid.lathe(x, z, [[m(0.13), m(1.5)], [m(0.14), m(1.62)], [m(0.11), m(1.76)], [0, m(1.8)]], steel, { segments: 10 });
    solid.box(x - m(0.1), m(1.63), z + m(0.12), x + m(0.1), m(1.65), z + m(0.145), material("iron-black"));
}

// Shields hung on a board on two legs: a kite shield and two round ones, painted
function shields(solid, x, z, random) {
    const timber = material("timber");

    for (const side of [-1, 1]) {
        solid.box(x + side * m(0.7) - m(0.05), 0, z - m(0.05), x + side * m(0.7) + m(0.05), m(1.7), z + m(0.05), timber);
    }

    solid.box(x - m(0.8), m(0.5), z - m(0.03), x + m(0.8), m(1.65), z + m(0.03), material("planks-dark"));

    const paints = random.shuffle(["paint-red", "paint-blue", "paint-green", "paint-ochre"]);

    for (const [k, [dx, y, r]] of [[-0.42, 1.18, 0.3], [0.42, 1.18, 0.3]].entries()) {
        const points = Array.from({ length: 12 }, (_, i) => [x + m(dx) + Math.cos((i * TAU) / 12) * m(r), y * M + Math.sin((i * TAU) / 12) * m(r), z + m(0.05)]);

        solid.facing(points, [0, 0, 1], material(paints[k]));
        solid.box(x + m(dx) - m(0.06), y * M - m(0.06), z + m(0.05), x + m(dx) + m(0.06), y * M + m(0.06), z + m(0.1), material("iron"));
    }

    // (A kite shield leaning against the board's foot)
    solid.facing([[x - m(0.22), m(0.62), z + m(0.2)], [x - m(0.22), m(0.2), z + m(0.26)], [x, 0, z + m(0.3)], [x + m(0.22), m(0.2), z + m(0.26)], [x + m(0.22), m(0.62), z + m(0.2)]], [0, 0.2, 1], material(paints[2]));
}

// A lectern, a great book open on it, a candle on a tall stand by it
function lectern(solid, x, z) {
    const oak = material("planks-dark");

    solid.box(x - m(0.3), 0, z - m(0.25), x + m(0.3), m(0.08), z + m(0.25), oak);
    solid.box(x - m(0.08), m(0.08), z - m(0.08), x + m(0.08), m(1.1), z + m(0.08), oak);

    // (Its desk, sloping down towards the street, and the book open on it facing the street: two
    // pages, a ribbon hanging from it)
    const desk = [[x - m(0.42), m(1.06), z + m(0.26)], [x + m(0.42), m(1.06), z + m(0.26)], [x + m(0.42), m(1.3), z - m(0.24)], [x - m(0.42), m(1.3), z - m(0.24)]];

    solid.facing(desk, [0, 1, 0.45], oak);
    solid.facing([...desk].reverse(), [0, -1, -0.45], oak);

    for (const side of [-1, 1]) {
        const page = [[x + side * m(0.02), m(1.1), z + m(0.22)], [x + side * m(0.36), m(1.08), z + m(0.22)], [x + side * m(0.36), m(1.31), z - m(0.2)], [x + side * m(0.02), m(1.33), z - m(0.2)]];

        solid.facing(side < 0 ? [...page].reverse() : page, [0, 1, 0.45], material("parchment"));
    }

    solid.box(x - m(0.02), m(0.9), z + m(0.22), x + m(0.02), m(1.1), z + m(0.25), material("war-red"));
    solid.cylinder(x + m(0.6), z, 0, m(1.3), m(0.03), m(0.03), material("brass"), { segments: 5 });
    solid.cylinder(x + m(0.6), z, m(1.3), m(1.34), m(0.08), m(0.08), material("brass"), { segments: 6 });
    solid.cylinder(x + m(0.6), z, m(1.34), m(1.5), m(0.035), m(0.035), material("candle"), { segments: 5 });
}

// Tomes stacked on a small table, some open, a skull on the top one
function tomes(solid, x, z, random) {
    solid.box(x - m(0.45), m(0.68), z - m(0.3), x + m(0.45), m(0.74), z + m(0.3), material("planks-dark"));

    for (const dx of [-0.38, 0.38]) {
        for (const dz of [-0.22, 0.22]) {
            solid.box(x + m(dx) - m(0.03), 0, z + m(dz) - m(0.03), x + m(dx) + m(0.03), m(0.68), z + m(dz) + m(0.03), material("planks-dark"));
        }
    }

    let y = m(0.74);

    for (let k = 0; k < 4; k++) {
        const [w, d, h] = [m(random.range(0.3, 0.42)), m(random.range(0.22, 0.3)), m(random.range(0.06, 0.1))];
        const dx = m(random.range(-0.08, 0.08));

        solid.box(x - m(0.15) + dx - w / 2, y, z - d / 2, x - m(0.15) + dx + w / 2, y + h, z + d / 2, material(random.pick(["leather", "velvet", "velvet-purple", "war-red", "indigo"])), { top: material("leather") });
        solid.box(x - m(0.15) + dx - w / 2 + m(0.02), y + m(0.01), z - d / 2 - m(0.002), x - m(0.15) + dx + w / 2 - m(0.03), y + h - m(0.01), z - d / 2 + m(0.01), material("parchment"));
        y += h;
    }

    solid.lathe(x + m(0.22), z, [[m(0.07), m(0.74)], [m(0.09), m(0.8)], [m(0.08), m(0.88)], [0, m(0.9)]], material("bone"), { segments: 8 });
    solid.box(x + m(0.18), m(0.82), z + m(0.06), x + m(0.26), m(0.85), z + m(0.08), material("iron-black"));
}

// An open shelf of bottles, three rows of them, each its own colour
function bottles(solid, x, z, random) {
    const wood = material("planks");

    for (const side of [-1, 1]) {
        solid.box(x + side * m(0.55) - m(0.04), 0, z - m(0.16), x + side * m(0.55) + m(0.04), m(1.55), z + m(0.16), wood);
    }

    for (const y of [0.35, 0.8, 1.25]) {
        solid.box(x - m(0.55), m(y) - m(0.04), z - m(0.16), x + m(0.55), m(y), z + m(0.16), wood);

        for (let k = 0; k < 5; k++) {
            const bx = x - m(0.42) + k * m(0.21);
            const glass = material(random.pick(["glass-green", "glass-violet", "wine", "glass", "glass-lit"]));
            const tall = m(random.range(0.16, 0.26));

            solid.lathe(bx, z, [[m(0.06), m(y)], [m(0.07), m(y) + tall * 0.55], [m(0.025), m(y) + tall * 0.8], [m(0.025), m(y) + tall], [0, m(y) + tall]], glass, { segments: 6 });
        }
    }
}

// Herbs hung to dry from a pole on two brackets: bunches, heads down
function herbs(solid, x, z, random) {
    const iron = material("iron");

    solid.box(x - m(0.75), m(2.1), z - m(0.03), x + m(0.75), m(2.14), z + m(0.03), material("timber"));

    // (Its brackets back to the wall behind it)
    for (const side of [-1, 1]) {
        solid.beam([x + side * m(0.75), m(2.12), z], [x + side * m(0.75), m(2.12), z - m(0.55)], m(0.03), m(0.03), iron);
        solid.beam([x + side * m(0.75), m(2.12), z - m(0.2)], [x + side * m(0.75), m(2.5), z - m(0.55)], m(0.025), m(0.025), iron);
    }

    for (let k = 0; k < 6; k++) {
        const hx = x - m(0.62) + k * m(0.25);
        const drop = m(random.range(0.35, 0.55));

        solid.beam([hx, m(2.1), z], [hx, m(2.1) - m(0.08), z], m(0.01), m(0.01), material("rope"));
        solid.lathe(hx, z, [[0, m(2.02) - drop], [m(0.1), m(2.02) - drop * 0.6], [m(0.04), m(2.02)], [0, m(2.02)]], material(random.pick(["greens", "leaves", "flowers", "flowers-gold"])), { segments: 5 });
    }

    // (And a barrel of roots under them)
    solid.cylinder(x, z + m(0.1), 0, m(0.75), m(0.25), m(0.25), material("planks"), { segments: 8 });
    solid.cylinder(x, z + m(0.1), m(0.75), m(0.85), m(0.22), m(0.12), material("soil"), { segments: 8 });
}

// The Mystic Emporium's orb: a crystal on a turned stone pillar, glowing
function orb(solid, x, z) {
    solid.lathe(x, z, [[m(0.3), 0], [m(0.3), m(0.12)], [m(0.14), m(0.2)], [m(0.11), m(0.9)], [m(0.2), m(1)], [m(0.2), m(1.08)], [0, m(1.08)]], material("marble"), { segments: 10 });

    const r = m(0.22);
    const ring = Array.from({ length: 7 }, (_, k) => [Math.sin((k / 6) * Math.PI) * r, m(1.1) + r - Math.cos((k / 6) * Math.PI) * r]);

    solid.lathe(x, z, ring, material("glow-violet"), { segments: 12 });
}

// A lantern of coloured glass on an iron post
function lantern(solid, x, z, glass) {
    solid.cylinder(x, z, 0, m(2), m(0.035), m(0.035), material("iron-black"), { segments: 6 });
    solid.box(x - m(0.13), m(2), z - m(0.13), x + m(0.13), m(2.32), z + m(0.13), material(glass));
    solid.lathe(x, z, [[m(0.17), m(2.32)], [0, m(2.48)]], material("iron-black"), { segments: 4 });
}

// A master's banner: a pole, its cloth hung from a crossbar, fringed with gold
function banner(solid, x, z, cloth) {
    solid.cylinder(x, z, 0, m(3.2), m(0.04), m(0.04), material("timber"), { segments: 6 });
    solid.lathe(x, z, [[m(0.07), m(3.2)], [0, m(3.35)]], material("gold"), { segments: 6 });
    solid.box(x - m(0.4), m(3.02), z - m(0.025), x + m(0.4), m(3.06), z + m(0.025), material("timber"));

    const drop = [[x - m(0.38), m(3.02), z + m(0.04)], [x + m(0.38), m(3.02), z + m(0.04)], [x + m(0.38), m(1.75), z + m(0.04)], [x, m(1.5), z + m(0.04)], [x - m(0.38), m(1.75), z + m(0.04)]];

    solid.facing(drop, [0, 0, 1], material(cloth));
    solid.facing([...drop].reverse().map(([px, py, pz]) => [px, py, pz - m(0.01)]), [0, 0, -1], material(cloth));
    solid.box(x - m(0.38), m(2.86), z + m(0.045), x + m(0.38), m(2.92), z + m(0.06), material("gold"));
}

const PIECES = Object.freeze({ blades, whetstone, harness, shields, lectern, tomes, bottles, herbs, orb });

/**
 * What's set out before a shop's door (a SHOPFRONTS name): its two pieces either side of the
 * door (`x0`: the door's middle; `z`: the house's front; `room`: how far out either side they
 * can go, metres; `aside`: how far out they stand, metres, if not as far as there's room for;
 * `sides`: which sides there's room on, -1 the left as it's faced, 1 the right), a master's
 * banners outside them, the Emporium's lanterns; each a little out from the wall. `seed`: the
 * shop's, for its colours and how its blades stand.
 */
export function dressShop(solid, name, { x0, z, room = 3.2, seed = 1, sides = [-1, 1], aside = null }) {
    const front = SHOPFRONTS[name];
    const random = createRandom(seed * 13 + 101);
    const out = m(aside ?? Math.min(room - 0.9, 2.4));

    if (!front) {
        return;
    }

    for (const side of sides) {
        PIECES[side < 0 ? front.left : front.right](solid, x0 + side * out, z + m(0.55), random);

        if (front.master && out / M + 1.35 <= room) {
            banner(solid, x0 + side * (out + m(1.05)), z + m(0.45), front.master);
        }
    }

    if (front.lanterns) {
        for (const side of [-1, 1]) {
            lantern(solid, x0 + side * m(1.2), z + m(0.5), side < 0 ? "glass-violet" : "glass-green");
        }
    }
}

/**
 * A shop's sign (its emblem's: SHOPFRONTS) hanging from the arm of a post standing at (x, z), out
 * from the wall behind it along +z, painted both sides: for a people whose fronts have no wall to
 * hang it from as a human house's has (landmarks.js hangs it from the wall).
 */
export function standingSign(solid, name, x, z) {
    const front = SHOPFRONTS[name];

    if (!front) {
        return;
    }

    const iron = material("iron-black");
    const picture = signMaterial(emblemSignTexture({ name: front.name, emblem: front.emblem, tint: front.tint }), `sign ${name}`);
    // (Its board a hand's breadth or so out from the post, its stay up to the arm short of it)
    const [top, near, far] = [m(2.7), z + m(0.3), z + m(0.3) + m(0.75)];

    solid.cylinder(x, z, 0, m(2.95), m(0.05), m(0.05), material("timber"), { segments: 6 });
    solid.beam([x, top + m(0.1), z], [x, top + m(0.1), far + m(0.1)], m(0.05), m(0.06), iron);
    solid.beam([x, top - m(0.35), z], [x, top + m(0.08), z + m(0.24)], m(0.03), m(0.03), iron);

    const corners = [[x, top - m(0.9), near], [x, top - m(0.9), far], [x, top, far], [x, top, near]];

    solid.face(corners, picture, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    solid.face([...corners].reverse(), picture, [[0, 1], [1, 1], [1, 0], [0, 0]]);
}
