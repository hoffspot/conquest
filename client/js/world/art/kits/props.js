// The things standing about a town (a well, barrels, crates, sacks, a handcart, a pile of logs or
// of stone, a rack of weapons, an archery butt, market stalls), built for the game in the same
// hand as its houses: timber, stone and canvas from the art's materials, weathered the same way,
// so they're drawn with everything else built (atlas.js), and look as if they belong. Sizes are
// in world pixels, five to a metre, in the prop's footprint (w by h plots, 20 pixels each); they
// stand in the middle half of it, all characters can't walk through (core/world.js).

import { createRandom } from "../../../core/random.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { pitchedRoof } from "./roofs.js";

const M = 5;
const m = (metres) => metres * M;

// A little darker at the foot, as everything standing on the ground is
const ground = (point, normal) => {
    const k = normal[1] < -0.45 ? 0.5 : 0.72 + 0.28 * Math.min(1, point[1] / m(0.6));

    return [k, k, k];
};

// A log (or a wheel, a butt of straw): an n-sided prism from `a` to `b`, `r` round, its sides in
// `side` and its ends in `end`
function prism(solid, a, b, r, side, end, sides = 8) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(...d);
    const axis = d.map((v) => v / length);
    const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = normalise(cross(axis, helper));
    const v = cross(axis, u);
    const ring = (centre) => Array.from({ length: sides }, (_, k) => {
        const angle = (k / sides) * Math.PI * 2;

        return centre.map((c, i) => c + (u[i] * Math.cos(angle) + v[i] * Math.sin(angle)) * r);
    });
    const [ra, rb] = [ring(a), ring(b)];

    for (let k = 0; k < sides; k++) {
        const j = (k + 1) % sides;
        const out = ra[k].map((p, i) => p + ra[j][i] - a[i] * 2);

        solid.facing([ra[k], ra[j], rb[j], rb[k]], out, material(side));
    }

    solid.facing(ra, axis.map((x) => -x), material(end));
    solid.facing(rb, axis, material(end));
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalise = (a) => a.map((x) => x / (Math.hypot(...a) || 1));

// A barrel standing at (x, z): staves bellying out, two iron hoops and a lid
function barrel(solid, x, z, height = m(0.9), radius = m(0.28)) {
    const staves = material("planks");

    solid.cylinder(x, z, 0, height * 0.5, radius * 0.86, radius, staves, { segments: 10, capped: false });
    solid.cylinder(x, z, height * 0.5, height, radius, radius * 0.86, staves, { segments: 10, capped: false });
    solid.cylinder(x, z, height - m(0.01), height, radius * 0.86, radius * 0.84, material("planks-dark"), { segments: 10 });

    for (const y of [0.16, 0.8]) {
        const r = radius * (0.86 + 0.14 * (1 - Math.abs(y - 0.5) * 2)) + m(0.012);

        solid.cylinder(x, z, height * y, height * y + m(0.05), r, r, material("iron"), { segments: 10, capped: false });
    }
}

// A crate at (x, z), `size` across, turned `turn`: boards, and battens round its edges
function crate(solid, x, z, size, turn) {
    solid.turnedBox(x, z, size / 2, size / 2, 0, size, turn, material("planks"));

    const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
    const at = (u, y, w) => [x + u * cos - w * sin, y, z + u * sin + w * cos];
    const half = size / 2 + m(0.01);
    const batten = material("timber-light");

    for (const [u, w] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
        solid.beam(at(u, 0, w), at(u, size, w), m(0.06), m(0.06), batten, { ends: false });
    }

    for (const y of [m(0.04), size - m(0.04)]) {
        solid.beam(at(-half, y, half), at(half, y, half), m(0.07), m(0.06), batten, { ends: false });
        solid.beam(at(-half, y, -half), at(half, y, -half), m(0.07), m(0.06), batten, { ends: false });
    }
}

// A sack of grain slumped at (x, z), tied at the neck
function sack(solid, x, z, height, lean) {
    const cloth = material("canvas-sack");

    solid.cylinder(x, z, 0, height * 0.7, m(0.25), m(0.27), cloth, { segments: 8, capped: false });
    solid.cylinder(x + lean, z, height * 0.7, height * 0.9, m(0.27), m(0.1), cloth, { segments: 8, capped: false });
    solid.cylinder(x + lean, z, height * 0.9, height, m(0.07), m(0.1), material("rope"), { segments: 6 });
}

const PROPS = {
    well(solid, { cx, cz }) {
        // A ring of stone, water below, two posts and a windlass with its bucket, under a little
        // roof of shingles
        solid.cylinder(cx, cz, 0, m(0.85), m(0.95), m(0.9), material("stone"), { segments: 12, capped: false });
        solid.cylinder(cx, cz, m(0.85), m(0.95), m(1), m(1), material("stone-dark"), { segments: 12, capped: false });
        solid.cylinder(cx, cz, m(0.2), m(0.9), m(0.72), m(0.72), material("stone-dark"), { segments: 12, capped: false });
        solid.cylinder(cx, cz, m(0.2), m(0.55), m(0.72), m(0.72), material("water"), { segments: 12 });

        const oak = material("timber");

        for (const side of [-1, 1]) {
            solid.beam([cx + side * m(0.95), 0, cz], [cx + side * m(0.95), m(2.35), cz], m(0.16), m(0.16), oak, { up: [0, 0, 1] });
        }

        solid.beam([cx - m(1.05), m(1.65), cz], [cx + m(1.05), m(1.65), cz], m(0.12), m(0.12), material("timber-light"));
        solid.cylinder(cx - m(0.2), cz, m(0.8), m(1.62), m(0.015), m(0.015), material("rope"), { segments: 4, capped: false });
        barrel(solid, cx - m(0.2), cz, m(0.35), m(0.17));
        solid.beam([cx + m(1.05), m(1.65), cz], [cx + m(1.05), m(1.3), cz + m(0.3)], m(0.05), m(0.05), material("iron"));
        pitchedRoof(solid, { x0: cx - m(1.1), x1: cx + m(1.1), z0: cz - m(0.7), z1: cz + m(0.7), eaves: m(2.3), pitch: 0.8, overhang: m(0.25), verge: m(0.15), thickness: m(0.1), cover: "shingles", under: "planks-dark", cap: "ridge", barge: "timber" });
    },

    barrels(solid, { random }) {
        barrel(solid, m(1.5), m(1.6));
        barrel(solid, m(2.5), m(1.7));
        barrel(solid, m(2), m(2.5), m(0.8), m(0.26));

        if (random.chance(0.4)) {
            barrel(solid, m(2.7), m(2.6), m(0.6), m(0.22));
        }
    },

    crates(solid, { random }) {
        crate(solid, m(1.7), m(1.8), m(0.85), random.range(0, 0.5));
        crate(solid, m(2.5), m(2.4), m(0.57), random.range(0, 1.5));
    },

    sacks(solid, { random }) {
        for (const [x, z] of [[1.6, 1.8], [2.4, 1.7], [2, 2.45]]) {
            sack(solid, m(x), m(z), m(random.range(0.65, 0.8)), m(random.range(-0.05, 0.05)));
        }
    },

    cart(solid, { cx, cz, random }) {
        // A handcart: a bed of boards on two wheels, its shafts resting on the ground
        const planks = material("planks");
        const [y0, y1] = [m(0.55), m(0.85)];

        solid.box(cx - m(0.55), y0, cz - m(0.4), cx + m(0.55), y0 + m(0.06), cz + m(0.4), planks);

        for (const [z0, z1] of [[cz - m(0.4), cz - m(0.36)], [cz + m(0.36), cz + m(0.4)]]) {
            solid.box(cx - m(0.55), y0, z0, cx + m(0.55), y1, z1, planks);
        }

        solid.box(cx + m(0.51), y0, cz - m(0.4), cx + m(0.55), y1, cz + m(0.4), planks);

        for (const side of [-1, 1]) {
            const z = cz + side * m(0.47);

            prism(solid, [cx, m(0.45), z - m(0.04)], [cx, m(0.45), z + m(0.04)], m(0.45), "timber-light", "planks-dark", 10);
            solid.beam([cx - m(0.5), y0 + m(0.02), cz + side * m(0.32)], [cx - m(1.35), m(0.05), cz + side * m(0.28)], m(0.07), m(0.07), material("timber"));
        }

        if (random.chance(0.6)) {
            sack(solid, cx + m(0.2), cz, m(0.55) + y0, 0);
        }
    },

    lumber(solid, { cx, cz, random }) {
        // Logs stacked: four below, three over them
        for (const [row, count] of [[0, 4], [1, 3]]) {
            for (let k = 0; k < count; k++) {
                const z = cz + (k - (count - 1) / 2) * m(0.36);
                const y = m(0.17) + row * m(0.3);
                const [a, b] = [cx - m(1.4) + random.range(-1, 1), cx + m(1.4) + random.range(-1, 1)];

                prism(solid, [a, y, z], [b, y, z], m(0.17), "timber", "planks", 7);
            }
        }
    },

    stones(solid, { cx, cz, random }) {
        for (let k = 0; k < 6; k++) {
            const size = m(random.range(0.25, 0.45));

            solid.turnedBox(cx + random.range(-1, 1) * m(0.4), cz + random.range(-1, 1) * m(0.4), size / 2, size * 0.4, k < 3 ? 0 : m(0.25), (k < 3 ? 0 : m(0.25)) + size * 0.7, random.next() * Math.PI, material(k % 2 ? "stone" : "stone-warm"));
        }
    },

    weaponrack(solid, { cx, cz }) {
        const oak = material("timber");

        for (const side of [-1, 1]) {
            solid.beam([cx + side * m(0.7), 0, cz], [cx + side * m(0.7), m(1.6), cz], m(0.1), m(0.1), oak, { up: [0, 0, 1] });
        }

        for (const y of [m(0.3), m(1.4)]) {
            solid.beam([cx - m(0.75), y, cz], [cx + m(0.75), y, cz], m(0.08), m(0.08), oak);
        }

        for (let k = 0; k < 4; k++) {
            const x = cx - m(0.45) + k * m(0.3);

            solid.beam([x, m(0.05), cz + m(0.08)], [x + m(0.05), m(1.75), cz + m(0.05)], m(0.035), m(0.035), material(k % 2 ? "iron" : "timber-light"));
        }
    },

    target(solid, { cx, cz }) {
        // A butt of straw on a three-legged stand, painted in rings
        const front = cz + m(0.14);

        prism(solid, [cx, m(1.1), cz - m(0.14)], [cx, m(1.1), front], m(0.55), "thatch", "thatch", 12);

        for (const [r, colour] of [[0.45, "paint-cream"], [0.32, "paint-red"], [0.19, "paint-cream"], [0.09, "paint-gold"]]) {
            const ring = Array.from({ length: 12 }, (_, k) => [cx + Math.cos((k / 12) * Math.PI * 2) * m(r), m(1.1) + Math.sin((k / 12) * Math.PI * 2) * m(r), front + m(0.01) + m(0.005) * (0.45 - r)]);

            solid.facing(ring, [0, 0, 1], material(colour));
        }

        for (const [x, z] of [[-0.45, 0.3], [0.45, 0.3], [0, -0.5]]) {
            solid.beam([cx + m(x), 0, cz + m(z)], [cx, m(1.3), cz], m(0.06), m(0.06), material("timber"));
        }
    },

    tent(solid, { cx, cz, random }) {
        // A market stall: four posts, a counter of boards with its goods, a striped awning
        const oak = material("timber");
        const [hw, hd] = [m(1.2), m(0.8)];

        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            solid.beam([cx + sx * hw, 0, cz + sz * hd], [cx + sx * hw, m(sz > 0 ? 2.1 : 2.4), cz + sz * hd], m(0.09), m(0.09), oak, { up: [0, 0, 1] });
        }

        solid.box(cx - hw, m(0.8), cz + hd - m(0.45), cx + hw, m(0.86), cz + hd + m(0.05), material("planks"));
        solid.box(cx - hw + m(0.05), 0, cz + hd - m(0.4), cx + hw - m(0.05), m(0.8), cz + hd - m(0.35), material("planks-dark"));

        const goods = random.pick([["apples", "cabbages", "squash"], ["bread", "bread", "canvas-sack"], ["paint-blue", "paint-red", "paint-cream"], ["clay", "clay-orange", "paint-cream"]]);

        for (let k = 0; k < 6; k++) {
            const x = cx - hw + m(0.25) + k * ((2 * hw - m(0.5)) / 5);
            const size = m(random.range(0.15, 0.25));

            solid.box(x - size / 2, m(0.86), cz + hd - m(0.3), x + size / 2, m(0.86) + size * 0.8, cz + hd - m(0.3) + size, material(goods[k % goods.length]));
        }

        // The awning: strips of two colours, sloping to the front
        const strips = 6;
        const [back, front] = [[m(2.45), cz - hd - m(0.15)], [m(2.05), cz + hd + m(0.35)]];

        for (let k = 0; k < strips; k++) {
            const [x0, x1] = [cx - hw - m(0.15) + (k * (2 * hw + m(0.3))) / strips, cx - hw - m(0.15) + ((k + 1) * (2 * hw + m(0.3))) / strips];
            const quad = [[x0, back[0], back[1]], [x1, back[0], back[1]], [x1, front[0], front[1]], [x0, front[0], front[1]]];
            const cloth = material(k % 2 ? "paint-cream" : random.pick(["awning", "paint-blue", "paint-green"]));

            solid.facing(quad, [0, 1, 0.2], cloth);
            solid.facing(quad, [0, -1, -0.2], cloth);
        }
    },
};

/** A prop (by its name: core/setpieces/pieces.js PROPS) filling a w x h footprint (plots). */
export function prop({ name, w, h, x = 0, y = 0 }) {
    const solid = new Solid();
    const random = createRandom(Math.round(x * 31 + y * 17) + name.length * 131);

    solid.tone = ground;
    PROPS[name](solid, { cx: w * 10, cz: h * 10, random });

    return solid.toObject();
}

/** The props there's a builder for. */
export const PROP_NAMES = Object.freeze(Object.keys(PROPS));
