// Each people's tents, where their war camps are pitched (world/camps3d.js): the humans pitch ridge
// tents of canvas (drawn there); the cat folk low domes of matting with an ochre band round them
// and a mat on forked posts over the door; the orcs cones of hide on poles crossed above them, a
// horned skull lashed at the top; the lizard folk palm thatch on a deck of planks on bamboo legs;
// the elves leaves of green cloth, a silver rib along each; the dark elves steep black and violet
// pyramids on black posts, a spike at the top and silk strung over the door.
//
// Each is built round (0, 0), its door towards +z, in the art's units (kit.js m()), and the same
// every time: a camp's tents are copies of their people's one.

import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { m, pole, post, spike, weathering, web } from "./kit.js";
import { apsidal, hipThatch } from "./lizard.js";
import { skull } from "./orc.js";

// A dark doorway on a tent's front (+z): `width` at the ground up to `height`, pointed (a
// triangle) or round-headed, just outside the tent's side, which is `front(y)` out at each height
function doorway(solid, front, width, height, { round = false } = {}) {
    const half = width / 2;
    const outline = round
        ? [[-half, 0], [half, 0], ...Array.from({ length: 5 }, (_, k) => [Math.cos((k / 4) * Math.PI) * half, height - half + Math.sin((k / 4) * Math.PI) * half])]
        : [[-half, 0], [half, 0], [0, height]];

    solid.facing(outline.map(([x, y]) => [x, y, front(y) + m(0.04)]), [0, 0.3, 1], material("shadow"));
}

// How far out a lathed profile ([[r, y], ...], from the ground up) is at a height
function across(profile, y) {
    for (let k = 1; k < profile.length; k++) {
        const [[r0, y0], [r1, y1]] = [profile[k - 1], profile[k]];

        if (y <= y1) {
            return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
        }
    }

    return 0;
}

const TENTS = {
    cat(solid) {
        // A low dome of matting, an ochre band round it, a doorway, and a mat on forked posts over it
        const profile = [[m(1.3), 0], [m(1.27), m(0.5)], [m(1.12), m(1)], [m(0.8), m(1.42)], [m(0.4), m(1.64)], [0, m(1.7)]];

        solid.lathe(0, 0, profile, material("matting"), { segments: 12 });
        solid.lathe(0, 0, [[m(1.32), m(0.3)], [m(1.31), m(0.48)]], material("ochre"), { segments: 12 });
        doorway(solid, (y) => across(profile, y) * 0.97, m(0.8), m(1.2), { round: true });

        for (const side of [-1, 1]) {
            const x = side * m(0.75);

            post(solid, x, 0, m(1.9), m(1.35), m(0.05), "timber-light", { sides: 4 });
            pole(solid, [x, m(1.3), m(1.9)], [x + side * m(0.12), m(1.55), m(1.9)], m(0.035), "timber-light", { sides: 3 });
        }

        solid.facing([[-m(0.95), m(1.35), m(2)], [m(0.95), m(1.35), m(2)], [m(0.95), m(1.5), m(1.05)], [-m(0.95), m(1.5), m(1.05)]], [0, 1, 0], material("matting"));
        solid.facing([[-m(0.95), m(1.35), m(2)], [m(0.95), m(1.35), m(2)], [m(0.95), m(1.5), m(1.05)], [-m(0.95), m(1.5), m(1.05)]], [0, -1, 0], material("matting"));
    },

    orc(solid) {
        // A cone of hides, the poles it's stretched on crossed above it, a horned skull at the top
        const [r, height] = [m(1.35), m(2.5)];
        const profile = [[r, 0], [r * 0.62, height * 0.4], [r * 0.3, height * 0.72], [m(0.12), height]];

        solid.lathe(0, 0, profile, material("hide-dark"), { segments: 9 });
        solid.lathe(0, 0, [[r * 0.97, m(0.25)], [r * 0.9, m(0.45)]], material("war-red"), { segments: 9 });
        doorway(solid, (y) => across(profile, y) * 0.93, m(0.85), m(1.3));

        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + 0.3;

            pole(solid, [Math.cos(a) * r * 1.02, 0, Math.sin(a) * r * 1.02], [-Math.cos(a) * m(0.35), height + m(0.6), -Math.sin(a) * m(0.35)], m(0.05), "deadwood", { sides: 4 });
        }

        skull(solid, [0, height + m(0.35), m(0.08)], 0, m(0.34));
    },

    lizard(solid) {
        // A deck of planks on bamboo legs, under a hipped roof of palm thatch
        const floor = m(0.55);

        for (const [x, z] of [[-1, -1.1], [1, -1.1], [1, 1.1], [-1, 1.1]]) {
            post(solid, m(x), 0, m(z), m(1.9), m(0.06), "bamboo", { sides: 5 });
        }

        solid.box(-m(1.1), floor - m(0.12), -m(1.25), m(1.1), floor, m(1.25), material("planks-pale"));
        solid.box(-m(0.45), m(0.18), m(1.25), m(0.45), m(0.26), m(1.6), material("bamboo"));
        hipThatch(solid, (t) => apsidal(0, 0, m(3.2), m(2.8), t).map(([x, z]) => [z, x]), m(1.8), m(1.25), "thatch-palm", { steps: 4 });
        // (Mats hung round the back and sides)
        solid.facing([[-m(1.05), floor, -m(1.2)], [m(1.05), floor, -m(1.2)], [m(1.05), m(1.6), -m(1.2)], [-m(1.05), m(1.6), -m(1.2)]], [0, 0, 1], material("matting"));
        solid.facing([[-m(1.05), floor, -m(1.2)], [m(1.05), floor, -m(1.2)], [m(1.05), m(1.6), -m(1.2)], [-m(1.05), m(1.6), -m(1.2)]], [0, 0, -1], material("matting"));
    },

    elf(solid) {
        // A leaf of green cloth: lens-shaped seen from above, a tall arch across, a silver rib
        // along its middle curving up past each end
        const [length, width, height] = [m(1.45), m(1.2), m(2)];
        const rings = [];

        for (let k = 0; k <= 8; k++) {
            const z = -length + (k / 8) * length * 2;
            const t = 1 - (z / length) ** 2;
            const [w, h] = [width * Math.max(0.02, t) ** 0.6, height * Math.max(0.02, t) ** 0.45];

            rings.push(Array.from({ length: 9 }, (_, i) => {
                const u = (i / 8) * 2 - 1;

                return [u * w, h * (1 - Math.abs(u) ** 1.5), z];
            }));
        }

        solid.loft(rings, material("cloth-green"), { closed: false });
        doorway(solid, (y) => length * Math.sqrt(Math.max(0, 1 - (y / height) ** (1 / 0.45))) * 0.9, m(0.7), m(1.3), { round: true });

        const rib = Array.from({ length: 9 }, (_, k) => {
            const z = (-1.12 + (k / 8) * 2.24) * length;
            const t = 1 - Math.min(1, (z / length) ** 2);

            return [0, height * t ** 0.45 + m(0.06) + (1 - t) * m(0.5), z];
        });

        solid.tube(rib, rib.map((_, k) => m(k === 0 || k === 8 ? 0.02 : 0.05)), material("silver"), { sides: 4 });
    },

    darkElf(solid) {
        // A steep pyramid of black and violet cloth on black posts, a spike at the top, silk strung
        // over the door
        const [half, peak] = [m(1.2), m(3.3)];
        const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];

        for (let k = 0; k < 4; k++) {
            const [a, b] = [corners[k], corners[(k + 1) % 4]];
            const side = [[a[0], 0, a[1]], [b[0], 0, b[1]], [0, peak, 0]];
            const out = [(a[0] + b[0]) / 2, m(0.5), (a[1] + b[1]) / 2];

            solid.facing(side, out, material(k % 2 ? "black" : "cloth-violet"));
            solid.facing(side, [-out[0], -out[1], -out[2]], material("cloth-violet"));
        }

        doorway(solid, (y) => half * (1 - y / peak), m(0.8), m(1.35));
        spike(solid, [0, peak - m(0.1), 0], [0, 1, 0], m(0.8), m(0.06), "iron-black");
        web(solid, [0, m(1.75), half * 0.5 + 0.8], m(0.45), [0, 0.35, 1], { radials: 7, rings: 3 });
    },
};

/** The peoples who pitch tents of their own (the humans' are camps3d.js's). */
export const CAMP_PEOPLES = Object.freeze(Object.keys(TENTS));

/**
 * A people's tent (TENTS'), in the art's units, round (0, 0), its door towards +z: a Three.js
 * group, or null for a people without their own.
 */
export function campTent(people) {
    const build = TENTS[people];

    if (!build) {
        return null;
    }

    const solid = new Solid();

    solid.tone = weathering({ seed: people.length * 7919, dirt: 0.28 });
    build(solid);

    return solid.toObject();
}
