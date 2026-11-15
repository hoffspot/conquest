// The specialists', the crafters' and the masters' shops from outside (docs/WAR.md *Shops*),
// whichever people's town they stand in: each one's name and sign, and what's set out by its door
// to show what's sold within. A swordsmith's rack of blades and a whetstone; an armorer's harness
// on its stand and the shields on a board; an occult scriptorium's open book on a lectern and its
// tomes stacked; an alchemist's shelf of bottles and the herbs drying; a bowyer's rack of bows and
// a straw butt to shoot at; a leatherworker's hide stretched on its frame and hides piled on a
// trestle; a tailor's bolts of cloth and a dummy in a cloak; a jeweller's case of rings and its
// scales; the masters' the same as their trades', finer, under their banners; the Mystic
// Emporium's orb glowing on its pillar between lanterns of coloured glass.
//
// Built facing south (out along +z), as the town's buildings are, in world pixels (five to a
// metre); each kit (landmarks.js, and each people's) builds the shop's house and calls dressShop
// for what stands before it.

import { createRandom } from "../../../core/random.js";
import { SHOP_LANDMARKS } from "../../../core/setpieces/pieces.js";
import { material } from "../engine/materials.js";
import { emblemSignTexture, paintBothFaces, signMaterial } from "./signs.js";

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
    // (The crafters', docs/CRAFTING.md *The crafters*)
    bowyer: { name: "Bowyer", emblem: "longbow", tint: 4, ground: "#26301c", dark: "#10160a", left: "bows", right: "butt" },
    leatherworker: { name: "Leatherworker", emblem: "hide", tint: 0, ground: "#3a2614", dark: "#1a1008", left: "frame", right: "hides" },
    tailor: { name: "Tailor", emblem: "shears", tint: 2, ground: "#3a1428", dark: "#1a0812", left: "bolts", right: "dummy" },
    jeweller: { name: "Jeweller", emblem: "ring", tint: 1, ground: "#142a3a", dark: "#08121a", left: "case", right: "scales" },
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
function herbs(solid, x, z, random, under = null) {
    const iron = material("iron");
    // (Its rail 2.1 m up, or lower under an awning, its stays under it too: `under` metres)
    const rail = Math.min(m(2.1), under === null ? Infinity : m(under) - m(0.44));

    solid.box(x - m(0.75), rail, z - m(0.03), x + m(0.75), rail + m(0.04), z + m(0.03), material("timber"));

    // (Its brackets back to the wall behind it)
    for (const side of [-1, 1]) {
        solid.beam([x + side * m(0.75), rail + m(0.02), z], [x + side * m(0.75), rail + m(0.02), z - m(0.55)], m(0.03), m(0.03), iron);
        solid.beam([x + side * m(0.75), rail + m(0.02), z - m(0.2)], [x + side * m(0.75), rail + m(0.4), z - m(0.55)], m(0.025), m(0.025), iron);
    }

    for (let k = 0; k < 6; k++) {
        const hx = x - m(0.62) + k * m(0.25);
        const drop = m(random.range(0.35, 0.55));

        solid.beam([hx, rail, z], [hx, rail - m(0.08), z], m(0.01), m(0.01), material("rope"));
        solid.lathe(hx, z, [[0, rail - m(0.08) - drop], [m(0.1), rail - m(0.08) - drop * 0.6], [m(0.04), rail - m(0.08)], [0, rail - m(0.08)]], material(random.pick(["greens", "leaves", "flowers", "flowers-gold"])), { segments: 5 });
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

// How high what's set out may stand (world pixels): `most` metres, or under an awning (`under`
// metres up, where there's one over it) a hand lower
const highest = (most, under) => Math.min(m(most), under === null ? Infinity : m(under) - m(0.12));

// A rack of bows: two posts and a rail along their tops, bows hung strung from it by their upper
// nocks, their bellies out to the street, and a stave or two leant at its foot
function bows(solid, x, z, random, under = null) {
    const timber = material("timber");
    const top = highest(1.68, under);

    for (const side of [-1, 1]) {
        solid.box(x + side * m(0.75) - m(0.05), 0, z - m(0.05), x + side * m(0.75) + m(0.05), top, z + m(0.05), timber);
    }

    solid.box(x - m(0.8), top - m(0.08), z - m(0.06), x + m(0.8), top, z + m(0.06), timber);

    for (let k = 0; k < 4; k++) {
        const bx = x - m(0.5) + k * m(0.33);
        const [high, long] = [top - m(0.1), Math.min(top - m(0.2), m(random.range(1.25, 1.4)))];
        const low = high - long;
        const belly = m(random.range(0.12, 0.17));
        const wood = material(random.pick(["timber", "timber-light", "planks-dark"]));

        // (Its limbs, bending out from the grip; the grip bound in leather; the string)
        solid.beam([bx, high, z + m(0.08)], [bx, high - long * 0.3, z + m(0.08) + belly * 0.75], m(0.035), m(0.03), wood);
        solid.beam([bx, high - long * 0.3, z + m(0.08) + belly * 0.75], [bx, high - long * 0.45, z + m(0.08) + belly], m(0.04), m(0.035), wood);
        solid.beam([bx, high - long * 0.55, z + m(0.08) + belly], [bx, high - long * 0.7, z + m(0.08) + belly * 0.75], m(0.04), m(0.035), wood);
        solid.beam([bx, high - long * 0.7, z + m(0.08) + belly * 0.75], [bx, low, z + m(0.08)], m(0.035), m(0.03), wood);
        solid.beam([bx, high - long * 0.45, z + m(0.08) + belly], [bx, high - long * 0.55, z + m(0.08) + belly], m(0.05), m(0.045), material("leather"));
        solid.beam([bx, high, z + m(0.075)], [bx, low, z + m(0.075)], m(0.008), m(0.008), material("linen"));
    }

    // (Staves leant at its foot, still in the rough)
    for (const dx of [-0.6, 0.55]) {
        solid.beam([x + m(dx), 0, z + m(0.3)], [x + m(dx) + m(0.08), m(1.3), z + m(0.08)], m(0.05), m(0.05), material("timber-light"));
    }
}

// A straw butt to shoot at on its three legs, tipped back a little, its rings painted
function butt(solid, x, z) {
    const timber = material("timber");
    const [cy, cz] = [m(1.0), z + m(0.08)];

    solid.beam([x - m(0.45), 0, z + m(0.3)], [x - m(0.1), cy + m(0.2), cz - m(0.05)], m(0.05), m(0.05), timber);
    solid.beam([x + m(0.45), 0, z + m(0.3)], [x + m(0.1), cy + m(0.2), cz - m(0.05)], m(0.05), m(0.05), timber);
    solid.beam([x, 0, z - m(0.35)], [x, cy, cz - m(0.1)], m(0.05), m(0.05), timber);

    // (Its face, tipped back: a disc of straw and its rings, each a little out from the last)
    const disc = (r, out, name) => {
        const points = Array.from({ length: 16 }, (_, k) => {
            const a = (k / 16) * TAU;

            return [x + Math.cos(a) * r, cy + Math.sin(a) * r, cz + out - Math.sin(a) * r * 0.2];
        });

        solid.facing(points, [0, 0.2, 1], material(name));
    };

    disc(m(0.48), 0, "thatch");
    solid.facing(Array.from({ length: 16 }, (_, k) => [x + Math.cos((-k / 16) * TAU) * m(0.48), cy + Math.sin((-k / 16) * TAU) * m(0.48), cz - m(0.1) - Math.sin((-k / 16) * TAU) * m(0.48) * 0.2]), [0, -0.2, -1], material("thatch"));
    disc(m(0.36), m(0.01), "paint-cream");
    disc(m(0.25), m(0.02), "paint-blue");
    disc(m(0.15), m(0.03), "paint-red");
    disc(m(0.06), m(0.04), "paint-gold");

    // (Two arrows in it)
    for (const [dx, dy] of [[0.08, 0.12], [-0.14, -0.05]]) {
        solid.beam([x + m(dx), cy + m(dy), cz + m(0.04)], [x + m(dx) + m(0.05), cy + m(dy) + m(0.06), cz + m(0.6)], m(0.015), m(0.015), material("timber-light"));
        solid.box(x + m(dx) + m(0.035), cy + m(dy) + m(0.04), cz + m(0.5), x + m(dx) + m(0.065), cy + m(dy) + m(0.08), cz + m(0.62), material("paint-red"));
    }
}

// A hide stretched on its frame to dry: two posts and two rails, the hide laced to them
function frame(solid, x, z, random, under = null) {
    const timber = material("timber");
    const top = highest(1.72, under);
    const hide = material(random.pick(["hide", "hide-dark", "leather"]));

    for (const side of [-1, 1]) {
        solid.box(x + side * m(0.65) - m(0.05), 0, z - m(0.05), x + side * m(0.65) + m(0.05), top, z + m(0.05), timber);
    }

    solid.box(x - m(0.7), top - m(0.1), z - m(0.05), x + m(0.7), top, z + m(0.05), timber);
    solid.box(x - m(0.7), m(0.25), z - m(0.05), x + m(0.7), m(0.35), z + m(0.05), timber);

    const [hi, lo] = [top - m(0.22), m(0.47)];
    const middle = (hi + lo) / 2;
    // (Round to its corners where it's laced: no corner of it turned in, so it's one face)
    const outline = [[-0.42, hi], [0, hi + m(0.05)], [0.42, hi], [0.52, middle], [0.42, lo], [0, lo - m(0.05)], [-0.42, lo], [-0.52, middle]].map(([dx, y]) => [x + m(dx), y, z + m(0.07)]);

    solid.facing(outline, [0, 0, 1], hide);
    solid.facing([...outline].reverse().map(([px, py, pz]) => [px, py, pz - m(0.02)]), [0, 0, -1], hide);

    // (Its lacing, from its points out to the frame)
    for (const [dx, y, tx, ty] of [[-0.42, hi, -0.6, top - m(0.1)], [0.42, hi, 0.6, top - m(0.1)], [-0.42, lo, -0.6, m(0.35)], [0.42, lo, 0.6, m(0.35)], [-0.52, middle, -0.6, middle], [0.52, middle, 0.6, middle]]) {
        solid.beam([x + m(dx), y, z + m(0.06)], [x + m(tx), ty, z + m(0.04)], m(0.012), m(0.012), material("rope"));
    }
}

// Hides piled on a trestle, folded, and a pair of boots on the ground by it
function hides(solid, x, z, random) {
    const timber = material("planks-dark");

    for (const side of [-1, 1]) {
        solid.beam([x + side * m(0.5), 0, z - m(0.25)], [x + side * m(0.5), m(0.7), z], m(0.05), m(0.05), timber);
        solid.beam([x + side * m(0.5), 0, z + m(0.25)], [x + side * m(0.5), m(0.7), z], m(0.05), m(0.05), timber);
    }

    solid.box(x - m(0.65), m(0.7), z - m(0.28), x + m(0.65), m(0.76), z + m(0.28), timber);

    let y = m(0.76);

    for (let k = 0; k < 4; k++) {
        const [w, d, h] = [m(random.range(0.9, 1.15)), m(random.range(0.4, 0.5)), m(random.range(0.05, 0.08))];
        const dx = m(random.range(-0.06, 0.06));

        solid.box(x + dx - w / 2, y, z - d / 2, x + dx + w / 2, y + h, z + d / 2, material(random.pick(["hide", "hide-dark", "leather", "fur", "fur-grey"])));
        y += h;
    }

    // (A pair of boots)
    for (const dx of [0.75, 0.95]) {
        solid.box(x + m(dx) - m(0.06), 0, z - m(0.05), x + m(dx) + m(0.06), m(0.32), z + m(0.08), material("leather"));
        solid.box(x + m(dx) - m(0.06), 0, z + m(0.08), x + m(dx) + m(0.06), m(0.09), z + m(0.22), material("leather"));
    }
}

// Bolts of cloth stood on end in a rack, each its own colour, a rail across them
function bolts(solid, x, z, random, under = null) {
    const timber = material("timber");
    const top = highest(1.3, under);

    solid.box(x - m(0.8), 0, z - m(0.2), x + m(0.8), m(0.08), z + m(0.2), timber);

    for (const side of [-1, 1]) {
        solid.box(x + side * m(0.78) - m(0.04), 0, z - m(0.04), x + side * m(0.78) + m(0.04), top, z + m(0.04), timber);
    }

    solid.box(x - m(0.8), top - m(0.3), z - m(0.2), x + m(0.8), top - m(0.25), z - m(0.14), timber);

    const cloths = random.shuffle(["velvet", "velvet-purple", "wool-blue", "wool-green", "wool-ochre", "linen", "war-red", "indigo", "silk", "cloth-gold"]);

    for (let k = 0; k < 7; k++) {
        const bx = x - m(0.6) + k * m(0.2);
        const tall = top - m(random.range(0.02, 0.2));

        solid.cylinder(bx, z, m(0.08), tall, m(0.085), m(0.085), material(cloths[k]), { segments: 8 });
        solid.cylinder(bx, z, tall, tall + m(0.02), m(0.025), m(0.025), material("timber-light"), { segments: 5 });
    }
}

// A tailor's dummy on its three feet, wearing a cloak of a good colour
function dummy(solid, x, z, random, under = null) {
    const timber = material("timber");
    const top = highest(1.66, under);
    const neck = top - m(0.06);

    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;

        solid.beam([x, m(0.25), z], [x + Math.cos(a) * m(0.3), 0, z + Math.sin(a) * m(0.3)], m(0.04), m(0.04), timber);
    }

    solid.cylinder(x, z, 0, neck - m(0.5), m(0.03), m(0.03), timber, { segments: 6 });
    // (Its body, linen over its frame: broad at the shoulders, in at the waist)
    solid.lathe(x, z, [[m(0.13), neck - m(0.62)], [m(0.16), neck - m(0.5)], [m(0.13), neck - m(0.35)], [m(0.17), neck - m(0.18)], [m(0.18), neck - m(0.08)], [m(0.06), neck], [0, neck]], material("linen"), { segments: 10 });
    solid.cylinder(x, z, neck, top, m(0.035), m(0.035), timber, { segments: 6 });
    // (The cloak, from its shoulders to its hem, open at the front)
    solid.lathe(x, z + m(-0.02), [[m(0.34), m(0.42)], [m(0.28), neck - m(0.6)], [m(0.21), neck - m(0.25)], [m(0.19), neck - m(0.08)], [0, neck - m(0.04)]], material(random.pick(["velvet", "wool-blue", "wool-green", "velvet-purple", "war-red"])), { segments: 10 });
    solid.cylinder(x, z + m(0.17), neck - m(0.12), neck - m(0.08), m(0.03), m(0.03), material("brass"), { segments: 6 });
}

// A jeweller's case on four legs: velvet under a sloping lid of glass propped open, rings and
// stones on the velvet
function jewelCase(solid, x, z, random) {
    const wood = material("planks-dark");

    for (const dx of [-0.55, 0.55]) {
        for (const dz of [-0.2, 0.2]) {
            solid.box(x + m(dx) - m(0.03), 0, z + m(dz) - m(0.03), x + m(dx) + m(0.03), m(0.85), z + m(dz) + m(0.03), wood);
        }
    }

    solid.box(x - m(0.62), m(0.85), z - m(0.27), x + m(0.62), m(1.0), z + m(0.27), wood);
    solid.box(x - m(0.56), m(1.0), z - m(0.21), x + m(0.56), m(1.01), z + m(0.21), material("velvet"));

    for (let k = 0; k < 9; k++) {
        const [jx, jz] = [x - m(0.45) + (k % 5) * m(0.22), z - m(0.1) + Math.floor(k / 5) * m(0.2)];

        if (k % 2) {
            solid.box(jx - m(0.03), m(1.01), jz - m(0.03), jx + m(0.03), m(1.05), jz + m(0.03), material(random.pick(["wine", "glass-green", "glass-violet", "jade", "maya-blue"])));
        } else {
            solid.cylinder(jx, jz, m(1.01), m(1.03), m(0.045), m(0.045), material(random.pick(["gold", "silver", "brass"])), { segments: 8 });
        }
    }

    // (Its brass rim, and its lid of glass propped up behind)
    solid.box(x - m(0.62), m(1.0), z + m(0.25), x + m(0.62), m(1.04), z + m(0.27), material("brass"));
    solid.facing([[x - m(0.6), m(1.02), z - m(0.24)], [x + m(0.6), m(1.02), z - m(0.24)], [x + m(0.6), m(1.4), z - m(0.36)], [x - m(0.6), m(1.4), z - m(0.36)]], [0, 0.3, 1], material("glass-lit"));
}

// A jeweller's scales on a little table: a post, a beam across it, two pans hung from its ends,
// a weight in one
function scales(solid, x, z) {
    const wood = material("planks-dark");

    for (const dx of [-0.25, 0.25]) {
        solid.box(x + m(dx) - m(0.03), 0, z - m(0.03), x + m(dx) + m(0.03), m(0.8), z + m(0.03), wood);
    }

    solid.box(x - m(0.35), m(0.8), z - m(0.22), x + m(0.35), m(0.86), z + m(0.22), wood);
    solid.cylinder(x, z, m(0.86), m(1.3), m(0.02), m(0.02), material("brass"), { segments: 6 });
    solid.box(x - m(0.3), m(1.28), z - m(0.012), x + m(0.3), m(1.31), z + m(0.012), material("brass"));

    for (const side of [-1, 1]) {
        solid.beam([x + side * m(0.28), m(1.28), z], [x + side * m(0.28), m(1.02), z], m(0.006), m(0.006), material("iron"));
        solid.lathe(x + side * m(0.28), z, [[0, m(0.98)], [m(0.11), m(1.0)], [m(0.12), m(1.02)]], material("brass"), { segments: 10 });
    }

    solid.cylinder(x + m(0.28), z, m(1.0), m(1.05), m(0.03), m(0.025), material("iron-black"), { segments: 6 });
}

const PIECES = Object.freeze({ blades, whetstone, harness, shields, lectern, tomes, bottles, herbs, orb, bows, butt, frame, hides, bolts, dummy, case: jewelCase, scales });

/**
 * What's set out before a shop's door (a SHOPFRONTS name): its two pieces either side of the
 * door (`x0`: the door's middle; `z`: the house's front; `room`: how far out either side they
 * can go, metres; `aside`: how far out they stand, metres, if not as far as there's room for;
 * `sides`: which sides there's room on, -1 the left as it's faced, 1 the right), a master's
 * banners outside them, the Emporium's lanterns; each a little out from the wall. `seed`: the
 * shop's, for its colours and how its blades stand.
 */
export function dressShop(solid, name, { x0, z, room = 3.2, seed = 1, sides = [-1, 1], aside = null, under = null, banners = null, lanterns = null }) {
    const front = SHOPFRONTS[name];
    const random = createRandom(seed * 13 + 101);
    const out = m(aside ?? Math.min(room - 0.9, 2.4));

    if (!front) {
        return;
    }

    // (What's set out no higher than `under` metres, where there's an awning over it (kitshop.js);
    // a master's banners `banners.aside` metres either side of the middle and `banners.out` out,
    // where a kit's shop has them clear of its awnings (false: none), or just past what's set out,
    // room allowing; the lanterns as `lanterns` has them, or by the door)
    for (const side of sides) {
        PIECES[side < 0 ? front.left : front.right](solid, x0 + side * out, z + m(0.55), random, under);

        if (front.master && banners) {
            banner(solid, x0 + side * m(banners.aside), z + m(banners.out), front.master);
        } else if (front.master && banners === null && out / M + 1.35 <= room) {
            banner(solid, x0 + side * (out + m(1.05)), z + m(0.45), front.master);
        }
    }

    if (front.lanterns) {
        const [beside, before] = lanterns ? [m(lanterns.aside), m(lanterns.out)] : [m(1.2), m(0.5)];

        for (const side of [-1, 1]) {
            lantern(solid, x0 + side * beside, z + before, side < 0 ? "glass-violet" : "glass-green");
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

    paintBothFaces(solid, [[x, top - m(0.9), near], [x, top - m(0.9), far], [x, top, far], [x, top, near]], picture);
}
