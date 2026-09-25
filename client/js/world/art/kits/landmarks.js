// A town's special buildings, built to the same measure as its houses and people (five world
// pixels to a metre): a two-storey tavern, a stone church with a spired tower, a blacksmith's
// smithy with an open forge, a market hall on columns with stalls beneath, and a windmill.
// Like the houses, each faces south, the side the camera sees.

import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";

const M = 5;
const m = (metres) => metres * M;

// A window in a south face at z: frame, glass, glazing bar and sill (sizes in metres)
function window(solid, x, y, z, width = 1, height = 1.1, frame = "timber") {
    const [w, h] = [m(width), m(height)];

    solid.box(x - w / 2 - 1, m(y) - 1, z, x + w / 2 + 1, m(y) + h + 1, z + 0.5, material(frame));
    solid.box(x - w / 2, m(y), z + 0.5, x + w / 2, m(y) + h, z + 0.8, material("glass"));
    solid.box(x - 0.4, m(y), z + 0.8, x + 0.4, m(y) + h, z + 1, material(frame));
    solid.box(x - w / 2 - 1.5, m(y) - 2, z, x + w / 2 + 1.5, m(y) - 1, z + 1.5, material(frame));
}

// A door in a south face at z, standing on `floor` (metres)
function door(solid, x, z, { width = 1.2, height = 2.1, floor = 0, frame = "timber", planks = "planks-dark" } = {}) {
    const [w, h, y] = [m(width), m(height), m(floor)];

    solid.box(x - w / 2 - 1, y, z, x + w / 2 + 1, y + h + 1, z + 0.5, material(frame));
    solid.box(x - w / 2, y, z + 0.5, x + w / 2, y + h, z + 1, material(planks));
}

// A barrel standing at (x, z): oak staves and two iron hoops
function barrel(solid, x, z) {
    solid.cylinder(x, z, 0, m(0.9), m(0.28), m(0.28), material("planks"), { segments: 10 });

    for (const y of [0.18, 0.7]) {
        solid.cylinder(x, z, m(y), m(y + 0.06), m(0.29), m(0.29), material("iron"), { segments: 10, capped: false });
    }
}

// A flat board in the x-y plane at z (seen from the south, and from behind), from `from` along
// `angle` (radians from east, anticlockwise) `start` to `end` metres out, `width` metres wide
function board(solid, [cx, cy], z, angle, start, end, width, name, offset = 0) {
    const d = [Math.cos(angle), Math.sin(angle)];
    const n = [-d[1], d[0]];
    const at = (along, across) => [cx + m(along * d[0] + (across + offset) * n[0]), cy + m(along * d[1] + (across + offset) * n[1]), z];
    const corners = [at(start, 0), at(end, 0), at(end, width), at(start, width)];

    solid.face(corners, material(name));
    solid.face([...corners].reverse(), material(name));
}

/** The tavern: stone below, a jettied, timber-framed floor above, a sign over the door. */
export function tavern({ w, h }) {
    const solid = new Solid();
    const [width, depth] = [w * 20, h * 20];
    const [x0, x1, z0, z1] = [m(1), width - m(1), m(2), depth - m(1.8)];
    const jetty = m(0.45);
    const plaster = material("plaster");
    const beam = material("timber");

    // Ground floor of stone, upper floor jutting out over the street
    solid.box(x0 - 0.8, 0, z0 - 0.8, x1 + 0.8, m(0.3), z1 + 0.8, material("stone-dark"));
    solid.box(x0, m(0.3), z0, x1, m(3.2), z1, material("stone-warm"));
    solid.box(x0 - jetty, m(3.2), z0, x1 + jetty, m(6.1), z1 + jetty, plaster);
    solid.box(x0 - jetty - 0.5, m(3.05), z1, x1 + jetty + 0.5, m(3.35), z1 + jetty + 0.6, beam);

    // Timber framing on the upper floor
    for (let i = 0; i <= 6; i++) {
        const x = x0 - jetty + ((x1 - x0 + 2 * jetty) * i) / 6;

        solid.box(x - 0.8, m(3.3), z1 + jetty, x + 0.8, m(6.1), z1 + jetty + 0.7, beam);
    }

    solid.box(x0 - jetty, m(5.9), z1 + jetty, x1 + jetty, m(6.1), z1 + jetty + 0.7, beam);

    // A steep clay roof, and two chimneys
    const span = z1 + jetty - z0;

    solid.roof(x0 - jetty - m(0.5), z0 - m(0.5), x1 + jetty + m(0.5), z1 + jetty + m(0.5), m(6.1), span * 0.62, { ridge: "x", material: material("clay"), gable: plaster });

    for (const x of [x0 + m(1.4), x1 - m(1.4)]) {
        solid.box(x - m(0.45), m(6), (z0 + z1) / 2 - m(1.8), x + m(0.45), m(6.1) + span * 0.62 + m(1.2), (z0 + z1) / 2 - m(0.9), material("brick"));
    }

    // A wide double door, windows either side and above
    const middle = (x0 + x1) / 2;

    door(solid, middle, z1, { width: 1.8, height: 2.3, floor: 0.3 });
    solid.box(middle - 0.3, m(0.3), z1 + 1, middle + 0.3, m(2.6), z1 + 1.3, beam);

    for (const x of [x0 + m(1.4), x0 + m(3), x1 - m(3), x1 - m(1.4)]) {
        window(solid, x, 1.2, z1, 1, 1.1, "timber");
    }

    for (let i = 0; i < 4; i++) {
        window(solid, x0 + m(1.3) + ((x1 - x0 - m(2.6)) * i) / 3, 4, z1 + jetty + 0.7, 0.9, 1.1, "timber");
    }

    // The sign, hanging from an iron bracket by the door
    const signX = middle + m(1.9);

    solid.box(signX - 0.3, m(3.45), z1, signX + 0.3, m(3.6), z1 + m(1.2), material("iron"));
    solid.box(signX - 0.15, m(2.7), z1 + m(1.05), signX + 0.15, m(3.45), z1 + m(1.1), material("iron"));
    solid.box(signX - m(0.05), m(2.1), z1 + m(0.6), signX + m(0.05), m(2.9), z1 + m(1.2), material("banner"));
    solid.box(signX - m(0.07), m(2.25), z1 + m(0.72), signX + m(0.07), m(2.75), z1 + m(1.08), material("gold"));

    // Barrels and a bench out front
    barrel(solid, x0 + m(0.6), z1 + m(0.9));
    barrel(solid, x0 + m(1.3), z1 + m(1.1));
    solid.box(x1 - m(3.2), m(0.42), z1 + m(0.3), x1 - m(1.4), m(0.48), z1 + m(0.75), material("planks"));

    for (const x of [x1 - m(3), x1 - m(1.6)]) {
        solid.box(x - 0.4, 0, z1 + m(0.35), x + 0.4, m(0.42), z1 + m(0.7), beam);
    }

    return solid.toObject();
}

/** The church: a stone nave, buttressed, with tall windows, and a tower with a spire at the front. */
export function church({ w, h }) {
    const solid = new Solid();
    const [width, depth] = [w * 20, h * 20];
    const stone = material("stone");
    const [x0, x1, z0, z1] = [m(3), width - m(3), m(1.5), depth - m(4.2)];
    const eaves = m(6.5);

    // The nave, its roof running north to south
    solid.box(x0 - 0.8, 0, z0 - 0.8, x1 + 0.8, m(0.4), z1 + 0.8, material("stone-dark"));
    solid.box(x0, m(0.4), z0, x1, eaves, z1, stone);
    solid.roof(x0 - m(0.4), z0 - m(0.4), x1 + m(0.4), z1, eaves, (x1 - x0) * 0.75, { ridge: "z", material: material("slate"), gable: stone });

    // Buttresses between tall windows along both sides
    for (let z = z0 + m(1); z < z1 - m(1); z += m(2.8)) {
        for (const [x, out] of [[x0, -1], [x1, 1]]) {
            const [a, b] = out < 0 ? [x - m(0.7), x] : [x, x + m(0.7)];

            solid.box(a, 0, z - m(0.3), b, m(4.5), z + m(0.3), material("stone-warm"));
        }

        if (z + m(1.4) < z1 - m(1)) {
            for (const [x, out] of [[x0, -1], [x1, 1]]) {
                const face = x + out * 0.2;
                const [a, b] = out < 0 ? [face - 0.6, face] : [face, face + 0.6];

                solid.box(a, m(2.2), z + m(1.1), b, m(5), z + m(1.7), material("glass"));
            }
        }
    }

    // The tower, square, rising over the front, with belfry openings and a spire
    const [tx0, tx1] = [width / 2 - m(2.1), width / 2 + m(2.1)];
    const [tz0, tz1] = [z1 - m(2.4), depth - m(1.2)];
    const top = m(14.5);

    solid.box(tx0 - 1, 0, tz0 - 1, tx1 + 1, m(0.6), tz1 + 1, material("stone-dark"));
    solid.box(tx0, m(0.6), tz0, tx1, top, tz1, stone);
    solid.box(tx0 - 0.8, m(7), tz0 - 0.8, tx1 + 0.8, m(7.3), tz1 + 0.8, material("stone-warm"));
    solid.box(tx0 - 0.8, top - m(0.3), tz0 - 0.8, tx1 + 0.8, top, tz1 + 0.8, material("stone-warm"));

    for (const x of [width / 2 - m(0.9), width / 2 + m(0.9)]) {
        solid.box(x - m(0.35), m(11.2), tz1, x + m(0.35), m(13.2), tz1 + 0.6, material("shadow"));
        solid.box(tx1, m(11.2), (tz0 + tz1) / 2 + (x - width / 2) - m(0.35), tx1 + 0.6, m(13.2), (tz0 + tz1) / 2 + (x - width / 2) + m(0.35), material("shadow"));
        solid.box(tx0 - 0.6, m(11.2), (tz0 + tz1) / 2 + (x - width / 2) - m(0.35), tx0, m(13.2), (tz0 + tz1) / 2 + (x - width / 2) + m(0.35), material("shadow"));
    }

    solid.pyramid(tx0 - m(0.2), tz0 - m(0.2), tx1 + m(0.2), tz1 + m(0.2), top, m(7.5), material("slate-grey"));

    // A gold cross on the spire
    const apex = top + m(7.5);

    solid.box(width / 2 - 0.3, apex - 1, (tz0 + tz1) / 2 - 0.3, width / 2 + 0.3, apex + m(1.1), (tz0 + tz1) / 2 + 0.3, material("gold"));
    solid.box(width / 2 - m(0.35), apex + m(0.55), (tz0 + tz1) / 2 - 0.3, width / 2 + m(0.35), apex + m(0.7), (tz0 + tz1) / 2 + 0.3, material("gold"));

    // The door under a pointed arch, a round window over it, and steps up to it
    const middle = width / 2;

    solid.face([[middle - m(1), m(3.2), tz1 + 0.4], [middle + m(1), m(3.2), tz1 + 0.4], [middle, m(4.1), tz1 + 0.4]], material("stone-warm"));
    solid.box(middle - m(1), m(0.6), tz1, middle + m(1), m(3.2), tz1 + 0.4, material("stone-warm"));
    door(solid, middle, tz1 + 0.4, { width: 1.6, height: 2.6, floor: 0.6, frame: "iron" });

    const rose = [];

    for (let k = 0; k < 10; k++) {
        const angle = (k / 10) * Math.PI * 2;

        rose.push([middle + Math.cos(angle) * m(0.7), m(5.4) + Math.sin(angle) * m(0.7), tz1 + 0.5]);
    }

    solid.face(rose, material("glass"));
    solid.box(middle - m(1.3), 0, tz1, middle + m(1.3), m(0.3), tz1 + m(1.1), material("stone-warm"));
    solid.box(middle - m(1.3), m(0.3), tz1, middle + m(1.3), m(0.6), tz1 + m(0.6), material("stone-warm"));

    return solid.toObject();
}

/** The smithy: a stone workshop, and beside it an open shed over the forge, anvil and trough. */
export function blacksmith({ w, h }) {
    const solid = new Solid();
    const [, depth] = [w * 20, h * 20];
    const [x0, x1, z0, z1] = [m(1), m(6.8), m(2), depth - m(2.2)];
    const stone = material("stone");
    const beam = material("timber");

    // The workshop
    solid.box(x0 - 0.8, 0, z0 - 0.8, x1 + 0.8, m(0.3), z1 + 0.8, material("stone-dark"));
    solid.box(x0, m(0.3), z0, x1, m(3.4), z1, stone);
    solid.roof(x0 - m(0.4), z0 - m(0.4), x1 + m(0.4), z1 + m(0.4), m(3.4), (z1 - z0) * 0.5, { ridge: "x", material: material("slate-grey"), gable: stone });
    door(solid, x0 + m(3.8), z1, { width: 1.3, height: 2.1, floor: 0.3 });
    window(solid, x0 + m(1.6), 1.2, z1, 1, 1, "timber");

    // The open shed: a lean-to roof on posts, against the workshop's east wall
    const [sx1, sz0, sz1] = [m(11.3), z0 + m(0.4), z1 + m(0.6)];

    for (const [x, z] of [[sx1 - 0.8, sz0 + 0.8], [sx1 - 0.8, sz1 - 0.8], [(x1 + sx1) / 2, sz1 - 0.8]]) {
        solid.box(x - 0.8, 0, z - 0.8, x + 0.8, m(2.6), z + 0.8, beam);
    }

    solid.box(x1, m(2.5), sz1 - 1.6, sx1, m(2.75), sz1, beam);
    solid.box(sx1 - 1.6, m(2.5), sz0, sx1, m(2.75), sz1, beam);

    const roof = [[x1, m(3.3), sz0 - m(0.3)], [x1, m(3.3), sz1 + m(0.3)], [sx1 + m(0.3), m(2.7), sz1 + m(0.3)], [sx1 + m(0.3), m(2.7), sz0 - m(0.3)]];

    solid.face(roof, material("shingles"));
    solid.face([...roof].reverse().map(([x, y, z]) => [x, y - 0.6, z]), material("planks-dark"));

    // The forge against the wall, its chimney rising through the shed roof
    const [fz0, fz1] = [(z0 + z1) / 2 - m(0.8), (z0 + z1) / 2 + m(0.7)];

    solid.box(x1, 0, fz0, x1 + m(1.5), m(0.95), fz1, material("stone-dark"));
    solid.box(x1 + 1, m(0.95), fz0 + 1, x1 + m(1.5) - 1, m(1.02), fz1 - 1, material("embers"));
    solid.box(x1, m(0.95), fz0, x1 + m(1.2), m(7.2), fz0 + m(1.1), material("stone-dark"));

    // The anvil on its stump, the quenching trough, and a heap of charcoal
    const [ax, az] = [x1 + m(2.8), (z0 + z1) / 2 + m(0.3)];

    solid.cylinder(ax, az, 0, m(0.5), m(0.3), m(0.3), material("planks-dark"), { segments: 10 });
    solid.box(ax - m(0.12), m(0.5), az - m(0.1), ax + m(0.12), m(0.62), az + m(0.1), material("iron"));
    solid.box(ax - m(0.35), m(0.62), az - m(0.12), ax + m(0.3), m(0.8), az + m(0.12), material("iron"));
    solid.box(ax + m(0.3), m(0.68), az - m(0.07), ax + m(0.48), m(0.78), az + m(0.07), material("iron"));
    solid.box(sx1 - m(1.6), 0, sz0 + m(0.4), sx1 - m(0.4), m(0.6), sz0 + m(1), material("planks"));
    solid.box(sx1 - m(1.5), m(0.6), sz0 + m(0.5), sx1 - m(0.5), m(0.62), sz0 + m(0.9), material("water"));
    solid.pyramid(x1 + m(1.7), fz0 - m(1.1), x1 + m(2.6), fz0 - m(0.2), 0, m(0.5), material("shadow"));
    barrel(solid, sx1 - m(0.8), sz1 - m(1.2));

    return solid.toObject();
}

/** The market hall: an upper floor on stone columns, and stalls of produce in the open beneath. */
export function market({ w, h }) {
    const solid = new Solid();
    const [width, depth] = [w * 20, h * 20];
    const [x0, x1, z0, z1] = [m(1.5), width - m(1.5), m(2), depth - m(2)];
    const beam = material("timber");
    const plaster = material("plaster-ochre");

    // Columns round the open ground floor
    const across = 5;
    const deep = 3;

    for (let i = 0; i < across; i++) {
        for (let j = 0; j < deep; j++) {
            if (i > 0 && i < across - 1 && j > 0 && j < deep - 1) {
                continue;
            }

            const x = x0 + m(0.3) + ((x1 - x0 - m(0.6)) * i) / (across - 1);
            const z = z0 + m(0.3) + ((z1 - z0 - m(0.6)) * j) / (deep - 1);

            solid.box(x - m(0.28), 0, z - m(0.28), x + m(0.28), m(3), z + m(0.28), material("stone-warm"));
        }
    }

    // The hall above, timber-framed, under a hipped roof
    solid.box(x0 - 0.5, m(3), z0 - 0.5, x1 + 0.5, m(3.3), z1 + 0.5, beam);
    solid.box(x0, m(3.3), z0, x1, m(5.8), z1, plaster);

    for (let i = 0; i <= 8; i++) {
        const x = x0 + ((x1 - x0) * i) / 8;

        solid.box(x - 0.7, m(3.3), z1, x + 0.7, m(5.8), z1 + 0.6, beam);
    }

    solid.box(x0, m(5.6), z1, x1, m(5.8), z1 + 0.6, beam);

    for (let i = 0; i < 4; i++) {
        window(solid, x0 + m(2) + ((x1 - x0 - m(4)) * i) / 3, 4, z1 + 0.6, 1, 1.1, "timber");
    }

    solid.roof(x0 - m(0.5), z0 - m(0.5), x1 + m(0.5), z1 + m(0.5), m(5.8), (z1 - z0) * 0.45, { ridge: "x", hipped: true, material: material("clay-orange"), gable: plaster });

    // Stalls under the hall: trestle tables heaped with produce
    const goods = ["apples", "cabbages", "squash", "bread"];

    for (let k = 0; k < 3; k++) {
        const cx = x0 + m(2.6) + ((x1 - x0 - m(5.2)) * k) / 2;
        const cz = (z0 + z1) / 2 + m(0.8);

        solid.box(cx - m(1), m(0.78), cz - m(0.45), cx + m(1), m(0.84), cz + m(0.45), material("planks"));

        for (const dx of [-0.85, 0.85]) {
            solid.box(cx + m(dx) - 0.4, 0, cz - m(0.4), cx + m(dx) + 0.4, m(0.78), cz + m(0.4), beam);
        }

        for (let g = 0; g < 4; g++) {
            const gx = cx - m(0.72) + m(0.48) * g;

            solid.box(gx - m(0.2), m(0.84), cz - m(0.3), gx + m(0.2), m(1.02), cz + m(0.3), material("planks-dark"));
            solid.box(gx - m(0.17), m(1.02), cz - m(0.26), gx + m(0.17), m(1.1), cz + m(0.26), material(goods[(g + k) % goods.length]));
        }
    }

    return solid.toObject();
}

/** The windmill: a tapering stone tower, a thatched cap and four sails turned to the south. */
export function windmill({ w, h }) {
    const solid = new Solid();
    const [width, depth] = [w * 20, h * 20];
    const [cx, cz] = [width / 2, depth / 2 - m(0.5)];
    const [base, neck, height] = [m(3), m(2.3), m(9)];

    solid.cylinder(cx, cz, 0, height, base, neck, material("stone-warm"), { segments: 10 });
    solid.cylinder(cx, cz, m(3.2), m(3.45), base * 0.92 + 1, base * 0.9 + 1, material("timber"), { segments: 10, capped: false });
    solid.cone(cx, cz, height - 0.5, m(3.4), neck + m(0.5), material("thatch"), 10);

    // The door and a window, on the south face (the tower leans in, so they stand a little out)
    door(solid, cx, cz + base - m(0.05), { width: 1.2, height: 2.1, frame: "timber" });
    window(solid, cx, 5, cz + base - m(0.55), 0.8, 1, "timber");

    // The sails, in an X, on a hub in front of the cap
    const hub = [cx, height + m(0.4)];
    const face = cz + neck + m(0.9);

    solid.box(cx - m(0.3), height + m(0.1), cz + neck - m(0.2), cx + m(0.3), height + m(0.7), face, material("timber"));

    for (let k = 0; k < 4; k++) {
        const angle = Math.PI / 4 + (k * Math.PI) / 2;

        board(solid, hub, face + 0.6, angle, -0.2, 6.2, 0.2, "timber", -0.1);
        board(solid, hub, face + 0.3, angle, 1.2, 6, 1.3, "sail", 0.1);
    }

    // Sacks of grain by the door
    solid.box(cx + m(1.1), 0, cz + base, cx + m(1.7), m(0.45), cz + base + m(0.5), material("canvas-sack"));
    solid.box(cx + m(1.25), m(0.45), cz + base + m(0.05), cx + m(1.65), m(0.8), cz + base + m(0.45), material("canvas-sack"));

    return solid.toObject();
}

/** Every special building, by name (setpieces/pieces.js LANDMARKS). */
export const LANDMARK_BUILDERS = Object.freeze({ tavern, church, blacksmith, market, windmill });

/** A town's special building, filling its footprint. */
export function landmark({ name, w, h }) {
    return LANDMARK_BUILDERS[name]({ w, h });
}
