// Each people's own things on its market: its well and its stalls, where a people's settlement
// sets them out as the humans' are (core/setpieces/town.js). Whatever else is piled in its yards
// (barrels, crates, sacks, carts...) is anyone's (kits/props.js).
//
// The cat folk draw water from a round parapet of whitewashed mud under a forked-post frame, and
// sell under mats on forked poles from low mud counters; the orcs from a spring in a ring of
// boulders under a tripod of logs with a skull on it, and under hides stretched on spears; the
// lizard folk from a stepped cistern with a serpent's head spouting into it, and under palm
// thatch on bamboo; the elves from a marble basin opening like a flower, a bud lamp hanging over
// it, and under leaf canopies on stone trees; the dark elves from a black basin glowing violet,
// spiders' legs arched over it, and under steep violet tents strung with silk.

import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { prop as anyones } from "../kits/props.js";
import { awning, jar, jars } from "./cat.js";
import { circle, lamp, m, pole, post, randomFor, spike, stake, weathering, web } from "./kit.js";
import { apsidal, hipThatch, serpent } from "./lizard.js";
import { rack, skull } from "./orc.js";
import { budLamp, petalRoof, treeColumn } from "./sylvan.js";

// A cloth (or a hide, a mat) stretched flat between four corners ([x, y, z]), seen from both sides
function sheet(solid, corners, name) {
    solid.facing(corners, [0, 1, 0], material(name));
    solid.facing(corners, [0, -1, 0], material(name));
}

// A bolt of cloth lying along x on (x, y, z), `length` long
function bolt(solid, x, y, z, length, name) {
    pole(solid, [x - length / 2, y + m(0.09), z], [x + length / 2, y + m(0.09), z], m(0.09), name, { sides: 6 });
}

// A frame of four walls round (cx, cz), `outer` and `inner` half across, from y0 up to y1
function rim(solid, cx, cz, outer, inner, y0, y1, name) {
    solid.box(cx - outer, y0, cz - outer, cx + outer, y1, cz - inner, material(name));
    solid.box(cx - outer, y0, cz + inner, cx + outer, y1, cz + outer, material(name));
    solid.box(cx - outer, y0, cz - inner, cx - inner, y1, cz + inner, material(name));
    solid.box(cx + inner, y0, cz - inner, cx + outer, y1, cz + inner, material(name));
}

const CAT = {
    well(solid, { cx, cz, random }) {
        // A round parapet of mud, a whitewashed band round it, the water down inside
        solid.lathe(cx, cz, [[m(1.08), 0], [m(1.02), m(0.72)], [m(0.96), m(0.84)], [m(0.74), m(0.84)], [m(0.72), m(0.3)]], material(random.pick(["mud", "mud-red"])), { segments: 14 });
        solid.lathe(cx, cz, [[m(1.07), m(0.42)], [m(1.05), m(0.56)]], material("kaolin"), { segments: 14 });
        solid.cylinder(cx, cz, m(0.2), m(0.32), m(0.72), m(0.72), material("water"), { segments: 14 });

        // Two forked posts and a bar across, a calabash on its rope
        for (const side of [-1, 1]) {
            const x = cx + side * m(1.25);

            post(solid, x, 0, cz, m(2), m(0.08), "timber-light", { sides: 5 });
            pole(solid, [x, m(1.95), cz], [x + side * m(0.16), m(2.35), cz], m(0.05), "timber-light", { sides: 4 });
            pole(solid, [x, m(1.95), cz], [x - side * m(0.12), m(2.32), cz], m(0.05), "timber-light", { sides: 4 });
        }

        pole(solid, [cx - m(1.4), m(2.12), cz], [cx + m(1.4), m(2.12), cz], m(0.06), "timber", { sides: 5 });
        pole(solid, [cx, m(2.1), cz], [cx, m(1.05), cz], m(0.015), "rope", { sides: 3 });
        jar(solid, cx, cz, m(0.32), "calabash", m(0.75));

        // A trough of mud for the beasts, and water jars
        solid.box(cx + m(1.35), 0, cz + m(0.8), cx + m(2.4), m(0.38), cz + m(1.35), material("mud-red"), { top: material("water") });
        jars(solid, cx - m(1.7), cz + m(1.2), random, 3);
    },

    tent(solid, { cx, cz, random }) {
        // A mat on forked poles over a low counter of mud, the goods laid out on it and on a mat
        // in front: calabashes and pots, or bolts of indigo and ochre cloth, or grain in bowls
        awning(solid, cx - m(1.5), cz - m(1), cx + m(1.5), cz + m(1.1), m(2.2), random, { cloth: random.pick(["matting", "matting", "thatch"]) });
        solid.box(cx - m(1.3), 0, cz + m(0.15), cx + m(1.3), m(0.6), cz + m(0.85), material(random.pick(["mud-pale", "mud"])));
        solid.facing([[cx - m(1.2), m(0.02), cz + m(1.2)], [cx + m(1.2), m(0.02), cz + m(1.2)], [cx + m(1.2), m(0.02), cz + m(2)], [cx - m(1.2), m(0.02), cz + m(2)]], [0, 1, 0], material("matting"));

        const kind = random.pick(["pots", "cloth", "grain"]);

        for (let k = 0; k < 5; k++) {
            const x = cx - m(1.05) + k * m(0.52);

            if (kind === "cloth") {
                bolt(solid, x, m(0.6), cz + m(0.5), m(0.45), random.pick(["indigo", "ochre", "kaolin", "laterite"]));
            } else if (kind === "grain") {
                solid.lathe(x, cz + m(0.5), [[m(0.08), m(0.6)], [m(0.2), m(0.7)], [m(0.18), m(0.72)], [0, m(0.72)]], material("calabash"), { segments: 7 });
                solid.lathe(x, cz + m(0.5), [[m(0.17), m(0.71)], [0, m(0.78)]], material(random.pick(["bread", "squash", "ochre"])), { segments: 7 });
            } else {
                jar(solid, x, cz + m(0.5), m(0.34), random.pick(["calabash", "clay", "clay-orange"]), m(0.6));
            }
        }

        jars(solid, cx, cz + m(1.6), random, 3);
    },
};

const ORC = {
    well(solid, { cx, cz, random }) {
        // A spring in a ring of boulders
        solid.cylinder(cx, cz, 0, m(0.06), m(0.95), m(0.95), material("water"), { segments: 12 });

        for (let k = 0; k < 9; k++) {
            const angle = (k * Math.PI * 2) / 9 + random.range(-0.15, 0.15);
            const [r, h] = [m(random.range(0.35, 0.5)), m(random.range(0.5, 0.85))];

            solid.lathe(cx + Math.cos(angle) * m(1.25), cz + Math.sin(angle) * m(1.25), [[r, 0], [r * 0.95, h * 0.55], [r * 0.5, h], [0, h * 1.04]], material(random.pick(["rock-dark", "basalt"])), { segments: 5 });
        }

        // A tripod of logs over it, a hide bucket on a rope, a horned skull lashed at its head
        const apex = [cx, m(3), cz];

        for (let k = 0; k < 3; k++) {
            const angle = (k * Math.PI * 2) / 3 + 0.5;

            pole(solid, [cx + Math.cos(angle) * m(1.6), 0, cz + Math.sin(angle) * m(1.6)], [apex[0] + Math.cos(angle) * m(0.15), apex[1] + m(0.3), apex[2] + Math.sin(angle) * m(0.15)], m(0.1), "deadwood", { sides: 5 });
        }

        pole(solid, apex, [cx, m(1.2), cz], m(0.02), "rope", { sides: 3 });
        solid.lathe(cx, cz, [[m(0.2), m(0.8)], [m(0.24), m(1.15)], [m(0.26), m(1.2)], [0, m(1.2)]], material("hide-dark"), { segments: 6 });
        skull(solid, [cx, m(3.25), cz + m(0.1)], 0, m(0.4));

        // Spears stuck in the ground by it
        for (const [x, z] of [[1.9, -0.9], [2.1, -0.5]]) {
            stake(solid, cx + m(x), 0, cz + m(z), m(2.2), m(0.04), "timber", { lean: [m(0.2), 0] });
            spike(solid, [cx + m(x) + m(0.2), m(2.2), cz + m(z)], [0.1, 1, 0], m(0.35), m(0.07), "iron");
        }
    },

    tent(solid, { cx, cz, random }) {
        // A hide stretched on four spears, higher at the back
        const [hw, back, front] = [m(1.5), cz - m(1.1), cz + m(0.9)];

        for (const [x, z, height] of [[cx - hw, back, m(2.4)], [cx + hw, back, m(2.4)], [cx + hw, front, m(2)], [cx - hw, front, m(2)]]) {
            stake(solid, x, 0, z, height, m(0.06), "timber", { point: 0.08 });
            spike(solid, [x, height - m(0.05), z], [0, 1, 0], m(0.45), m(0.08), "iron");
        }

        sheet(solid, [[cx - hw, m(2.35), back], [cx + hw, m(2.35), back], [cx + hw, m(1.95), front], [cx - hw, m(1.95), front]], random.pick(["hide", "hide-dark"]));

        // A split log for a counter, on stones, and what's for trade on it: meat, bones, blades
        for (const side of [-1, 1]) {
            solid.lathe(cx + side * m(1.1), cz + m(0.5), [[m(0.25), 0], [m(0.22), m(0.35)], [0, m(0.4)]], material("rock-dark"), { segments: 5 });
        }

        solid.tube([[cx - m(1.45), m(0.55), cz + m(0.5)], [cx + m(1.45), m(0.55), cz + m(0.5)]], m(0.24), material("deadwood"), { sides: 6, caps: true });

        const kind = random.pick(["meat", "bones", "blades"]);

        for (let k = 0; k < 4; k++) {
            const x = cx - m(0.9) + k * m(0.6);

            if (kind === "meat") {
                solid.lathe(x, cz + m(0.5), [[m(0.18), m(0.76)], [m(0.2), m(0.88)], [0, m(0.96)]], material("war-red"), { segments: 6 });
            } else if (kind === "bones") {
                pole(solid, [x - m(0.2), m(0.8), cz + m(0.45)], [x + m(0.2), m(0.8), cz + m(0.55)], m(0.05), "bone", { sides: 4 });
            } else {
                solid.box(x - m(0.04), m(0.78), cz + m(0.3), x + m(0.04), m(0.82), cz + m(0.8), material("iron"));
            }
        }

        rack(solid, cx, cz - m(1.5), { length: m(2.2), random, kind: random.pick(["hides", "weapons"]) });
        skull(solid, [cx - hw, m(2.2), front + m(0.1)], 0, m(0.3), { horns: random.chance(0.5) });
    },
};

const LIZARD = {
    well(solid, { cx, cz, random }) {
        // A cistern of lime-washed stone, stepped down to its water, a serpent's head spouting
        // into it from its back
        rim(solid, cx, cz, m(1.3), m(1), 0, m(0.55), "stone-lime");
        rim(solid, cx, cz, m(1.34), m(1.26), m(0.55), m(0.62), "jade");
        rim(solid, cx, cz, m(1), m(0.75), 0, m(0.3), "stone-lime");
        solid.box(cx - m(0.75), 0, cz - m(0.75), cx + m(0.75), m(0.18), cz + m(0.75), material("water-green"));
        serpent(solid, [cx, m(0.75), cz - m(1.25)], 0, m(0.55), { neck: [[cx, m(0.5), cz - m(1.5)]] });

        // Reeds in clumps round it, and gourds
        for (const [x, z] of [[-1.7, 1.1], [1.8, 0.6], [1.6, -1.5]]) {
            for (let k = 0; k < 7; k++) {
                const [lx, lz] = [random.range(-1, 1) * m(0.25), random.range(-1, 1) * m(0.25)];

                pole(solid, [cx + m(x) + lx, 0, cz + m(z) + lz], [cx + m(x) + lx * 2.5, m(random.range(0.9, 1.6)), cz + m(z) + lz * 2.5], m(0.025), "reeds", { sides: 3, top: m(0.01) });
            }
        }

        jar(solid, cx - m(1.7), cz - m(0.4), m(0.4), "calabash");
        jar(solid, cx - m(1.9), cz - m(0.9), m(0.3), "calabash");
    },

    tent(solid, { cx, cz, random }) {
        // Palm thatch on four bamboo poles, a counter of bamboo, fish hung along its front
        const [hw, hd, eaves] = [m(1.35), m(0.85), m(2.1)];

        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            post(solid, cx + sx * hw, 0, cz + sz * hd, eaves + m(0.3), m(0.06), "bamboo", { sides: 5 });
        }

        hipThatch(solid, (t) => apsidal(cx, cz, m(3.6), m(2.5), t), eaves, m(1.2), "thatch-palm");
        solid.box(cx - m(1.2), m(0.75), cz + m(0.2), cx + m(1.2), m(0.82), cz + m(0.8), material("bamboo"));

        for (const x of [cx - m(1.1), cx + m(1.1)]) {
            solid.box(x - m(0.05), 0, cz + m(0.25), x + m(0.05), m(0.75), cz + m(0.75), material("bamboo"));
        }

        // (On the counter: fruit, or eggs in a basket, or more fish)
        const kind = random.pick(["fruit", "eggs", "fish"]);

        for (let k = 0; k < 5; k++) {
            const x = cx - m(0.9) + k * m(0.45);

            if (kind === "fish") {
                solid.tube([[x - m(0.18), m(0.87), cz + m(0.5)], [x, m(0.88), cz + m(0.5)], [x + m(0.14), m(0.87), cz + m(0.5)], [x + m(0.22), m(0.88), cz + m(0.5)]], [m(0.02), m(0.07), m(0.03), m(0.06)], material("silver"), { sides: 5, caps: true });
            } else {
                solid.lathe(x, cz + m(0.5), [[m(0.1), m(0.82)], [m(0.16), m(0.95)], [0, m(0.95)]], material("reeds"), { segments: 7 });

                for (let n = 0; n < 3; n++) {
                    const [ex, ez] = [x + random.range(-1, 1) * m(0.06), cz + m(0.5) + random.range(-1, 1) * m(0.06)];

                    solid.lathe(ex, ez, [[m(0.07), m(0.92)], [m(0.06), m(1)], [0, m(1.04)]], material(kind === "eggs" ? "egg" : random.pick(["apples", "squash", "quinces"])), { segments: 5 });
                }
            }
        }

        // Fish on a line under the eaves
        for (let k = 0; k < 6; k++) {
            const x = cx - m(1.1) + k * m(0.44);

            pole(solid, [x, eaves - m(0.05), cz + hd], [x, eaves - m(0.3), cz + hd], m(0.01), "rope", { sides: 3 });
            solid.tube([[x, eaves - m(0.3), cz + hd], [x, eaves - m(0.5), cz + hd], [x, eaves - m(0.75), cz + hd]], [m(0.03), m(0.07), m(0.01)], material("silver"), { sides: 5, caps: true });
        }
    },
};

const ELF = {
    well(solid, { cx, cz, random }) {
        // A marble basin opening like a flower on its stem, clear water in it, flagstones round
        solid.lathe(cx, cz, [[m(0.5), 0], [m(0.38), m(0.3)], [m(0.46), m(0.52)], [m(0.95), m(0.76)], [m(1.22), m(0.92)], [m(1.14), m(0.98)], [m(0.96), m(0.9)]], material("marble"), { segments: 18 });
        solid.cylinder(cx, cz, m(0.8), m(0.88), m(0.9), m(0.96), material("water"), { segments: 18 });
        solid.facing(circle(cx, cz, m(1.95), 18).map(([x, z]) => [x, m(0.02), z]), [0, 1, 0], material(random.pick(["stone-moon", "marble"])));

        // A slender post curling over it, a bud lamp hanging from its crook
        post(solid, cx + m(1.5), 0, cz - m(0.2), m(2.5), m(0.07), "verdigris", { top: m(0.045), sides: 6 });
        budLamp(solid, [cx + m(1.5), m(2.45), cz - m(0.2)], [-1, 0], { light: "glow-moon", reach: m(1.3) });

        // Flowers in the flagstones' edge
        for (let k = 0; k < 8; k++) {
            const angle = (k * Math.PI * 2) / 8 + random.range(-0.2, 0.2);
            const [x, z] = [cx + Math.cos(angle) * m(1.75), cz + Math.sin(angle) * m(1.75)];

            solid.lathe(x, z, [[m(0.12), m(0.02)], [m(0.18), m(0.22)], [0, m(0.3)]], material("leaves"), { segments: 5 });
            solid.lathe(x, z, [[m(0.08), m(0.26)], [0, m(0.34)]], material(random.pick(["flowers", "flowers-gold", "paint-cream"])), { segments: 5 });
        }
    },

    tent(solid, { cx, cz, random }) {
        // A leaf canopy on a tree of stone, a curving counter round its front
        treeColumn(solid, cx, 0, cz - m(0.3), m(2.4), m(0.12), random.pick(["heartwood", "marble"]), { boughs: 4, spread: m(1.1), phase: Math.PI / 4 });
        petalRoof(solid, cx, cz - m(0.3), m(2.35), m(1.7), m(0.9), random.pick(["leafscale-silver", "leafscale-sage", "leafscale"]), { petals: 5, lift: m(0.35), under: "heartwood" });

        // (The counter: a crescent of marble, heartwood on top)
        const arc = (r) => Array.from({ length: 9 }, (_, k) => {
            const angle = 0.35 + (k * (Math.PI - 0.7)) / 8;

            return [cx + Math.cos(angle) * r, cz - m(0.3) + Math.sin(angle) * r];
        });
        const outline = [...arc(m(1.45)), ...arc(m(1.1)).reverse()];

        solid.extrude(outline, 0, m(0.82), material("marble"), { top: material("heartwood") });

        const kind = random.pick(["bottles", "flowers", "cloth"]);

        for (let k = 0; k < 5; k++) {
            const angle = 0.55 + (k * (Math.PI - 1.1)) / 4;
            const [x, z] = [cx + Math.cos(angle) * m(1.27), cz - m(0.3) + Math.sin(angle) * m(1.27)];

            if (kind === "bottles") {
                solid.lathe(x, z, [[m(0.08), m(0.82)], [m(0.09), m(0.98)], [m(0.03), m(1.06)], [m(0.03), m(1.12)], [0, m(1.12)]], material(random.pick(["glass-green", "glass-violet", "glass"])), { segments: 6 });
            } else if (kind === "flowers") {
                solid.lathe(x, z, [[m(0.1), m(0.82)], [m(0.12), m(0.98)], [0, m(0.98)]], material("clay"), { segments: 6 });
                solid.lathe(x, z, [[m(0.14), m(0.98)], [m(0.1), m(1.12)], [0, m(1.16)]], material(random.pick(["flowers", "flowers-gold", "leaves"])), { segments: 6 });
            } else {
                bolt(solid, x, m(0.82), z, m(0.35), random.pick(["cloth-green", "cloth-silver", "paint-cream"]));
            }
        }

        budLamp(solid, [cx, m(2.1), cz - m(0.3)], [0, 1], { light: "glow-lamp", reach: m(0.9) });
    },
};

const DARK_ELF = {
    well(solid, { cx, cz, random }) {
        // An eight-sided basin of black stone, its pool glowing violet
        const octagon = (r) => circle(cx, cz, r, 8, Math.PI / 8);

        solid.extrude(octagon(m(1.25)), 0, m(0.6), material("stone-black"), { top: material("obsidian") });
        solid.facing(octagon(m(1)).map(([x, z]) => [x, m(0.62), z]), [0, 1, 0], material("glow-deep"));

        // Obsidian thorns at every other corner, and a spider's legs arched over it to a lamp
        const apex = [cx, m(2.8), cz];

        octagon(m(1.2)).forEach(([x, z], k) => {
            if (k % 2 === 0) {
                spike(solid, [x, m(0.6), z], [(x - cx) * 0.2, 1, (z - cz) * 0.2], m(0.8), m(0.12), "obsidian", { sides: 4 });
            } else {
                const knee = [cx + (x - cx) * 1.25, m(2.3), cz + (z - cz) * 1.25];

                solid.tube([[x, m(0.6), z], knee, apex], [m(0.07), m(0.06), m(0.04)], material("iron-black"), { sides: 4 });
            }
        });

        lamp(solid, [cx, m(2.3), cz], "glow-violet", { size: m(0.3), frame: null, shape: "orb", hang: m(0.35) });
        web(solid, [cx, m(1.6), cz - m(1.25)], m(0.75), [0, 0, 1], { radials: 8, rings: 4, random });
    },

    tent(solid, { cx, cz, random }) {
        // A steep tent of violet cloth on black posts, silk strung under its eaves, a lamp in it
        const [hw, hd, eaves, peak] = [m(1.4), m(1), m(2.1), m(3.6)];
        const corners = [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]];
        const cloth = random.pick(["cloth-violet", "cloth-violet", "black", "silk"]);

        for (const [x, z] of corners) {
            post(solid, x, 0, z, eaves + m(0.1), m(0.06), "timber-char", { sides: 4 });
        }

        for (let k = 0; k < 4; k++) {
            const [a, b] = [corners[k], corners[(k + 1) % 4]];
            const side = [[a[0], eaves, a[1]], [b[0], eaves, b[1]], [cx, peak, cz]];
            const out = [(a[0] + b[0]) / 2 - cx, 0.6, (a[1] + b[1]) / 2 - cz];

            solid.facing(side, out, material(cloth));
            solid.facing(side, [-out[0], -0.6, -out[2]], material("cloth-violet"));
        }

        spike(solid, [cx, peak - m(0.1), cz], [0, 1, 0], m(0.7), m(0.06), "iron-black");
        web(solid, [cx, eaves - m(0.5), cz + hd], m(0.55), [0, 0, 1], { radials: 8, rings: 3, random });
        lamp(solid, [cx, eaves - m(0.1), cz], "glow-violet", { size: m(0.22), frame: null, shape: "orb", hang: m(0.4) });

        // A counter of charred planks, its goods: vials, silk, bones
        solid.box(cx - m(1.2), m(0.8), cz + m(0.25), cx + m(1.2), m(0.86), cz + m(0.85), material("planks-char"));
        solid.box(cx - m(1.15), 0, cz + m(0.3), cx + m(1.15), m(0.8), cz + m(0.35), material("stone-black"));

        const kind = random.pick(["vials", "silk", "bones"]);

        for (let k = 0; k < 5; k++) {
            const x = cx - m(0.9) + k * m(0.45);

            if (kind === "vials") {
                solid.lathe(x, cz + m(0.55), [[m(0.07), m(0.86)], [m(0.08), m(1)], [m(0.02), m(1.08)], [0, m(1.1)]], material(random.pick(["glass-violet", "glow-violet", "glass-green"])), { segments: 6 });
            } else if (kind === "silk") {
                bolt(solid, x, m(0.86), cz + m(0.55), m(0.35), random.pick(["silk", "cloth-violet", "black"]));
            } else {
                pole(solid, [x - m(0.18), m(0.9), cz + m(0.5)], [x + m(0.18), m(0.9), cz + m(0.6)], m(0.045), "bone", { sides: 4 });
            }
        }
    },
};

const OWN = { cat: CAT, orc: ORC, lizard: LIZARD, elf: ELF, darkElf: DARK_ELF };

/** A people's prop (by its name: core/setpieces/pieces.js PROPS): its own if it has one, anyone's otherwise. */
export function peopleProp(people, piece) {
    const build = OWN[people]?.[piece.name];

    if (!build) {
        return anyones(piece);
    }

    const solid = new Solid();
    const random = randomFor(piece, 61);

    solid.tone = weathering({ seed: random.int(0, 1e6), dirt: 0.3 });
    build(solid, { cx: piece.w * 10, cz: piece.h * 10, random });

    return solid.toObject();
}

/** The props each people has its own of. */
export const PEOPLE_PROPS = Object.freeze(Object.fromEntries(Object.entries(OWN).map(([people, props]) => [people, Object.keys(props)])));
