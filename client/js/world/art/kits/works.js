// Each people's works, drawn (core/setpieces/works.js lays them out): a lumber mill's saw shed,
// its logs on their skids, its planks stacked to dry, the woodcutters' lodge and its firewood,
// the stumps of the trees felled, a chopping block and a charcoal clamp smoking; a mine's pit
// shored with timber, the windlass over its shaft, its spoil heaps, its ore, the bloomery's clay
// furnace glowing under its roof, its charcoal and its tool shed; a quarry's faces cut back in
// benches, the crane over them, its blocks rough and dressed, the masons' lodge, its chippings,
// a sledge and boulders. Worked, not ruined: fresh timber and fresh-cut stone, the dirt of work
// at their feet, a little moss on what's stood longest. In each people's own timber, roofing and
// stone. Each part is a piece of its own (core/sites.js), stood on the ground where it is; each
// reaches down into the ground a little.
//
// In world pixels as the kits are (a plot, 4 m, is 20), the part in the middle of its piece's
// plots, facing south.

import { material } from "../engine/materials.js";
import { pitchedRoof } from "./roofs.js";
import { prism as log } from "./props.js";
import { fireLight } from "./torches.js";
import { tumbled } from "./decay.js";

// World pixels in a metre
const M = 5;
const m = (metres) => metres * M;

// How far each part reaches into the ground below where it stands (metres)
const FOOTING = 0.6;

/**
 * Each people's timber, boards, roofing and stone, as their works are built of: the rock of their
 * lands, as it's cut and as it's dressed, the clay of their furnaces, and the rock their mines'
 * spoil is of.
 */
export const WORKS_STUFF = Object.freeze({
    human: { timber: "timber", boards: "planks", roof: "shingles", rock: "rock", cut: "rock", dressed: "stone", clay: "clay", spoil: "granite" },
    elf: { timber: "timber-light", boards: "planks-pale", roof: "leafscale", rock: "granite", cut: "rock-pale", dressed: "stone-moon", clay: "clay", spoil: "granite" },
    darkElf: { timber: "timber-grey", boards: "planks-dark", roof: "slate-violet", rock: "rock-dark", cut: "basalt", dressed: "stone-black", clay: "mud-dark", spoil: "basalt" },
    cat: { timber: "timber-light", boards: "planks-pale", roof: "thatch-palm", rock: "rock-red", cut: "rock-red", dressed: "stone-warm", clay: "mud-red", spoil: "rock-red" },
    lizard: { timber: "bamboo", boards: "planks-pale", roof: "thatch-palm", rock: "rock", cut: "rock-pale", dressed: "stone-lime", clay: "mud-pale", spoil: "granite" },
    orc: { timber: "timber-char", boards: "planks-char", roof: "hide", rock: "basalt", cut: "rock-dark", dressed: "basalt", clay: "mud-red", spoil: "basalt" },
});

const stuffOf = (people) => WORKS_STUFF[people] ?? WORKS_STUFF.human;

// The middle of a piece of `w` by `h` plots (world pixels)
const middleOf = (piece) => [piece.w * 10, piece.h * 10];

// A part's size laid out (a rectangle's: world pixels across and deep)
const sizeOf = (part) => [m(part.x1 - part.x0), m(part.y1 - part.y0)];

/**
 * The tone of what's worked: darker at the foot, where the dirt of the work's trodden into it, and
 * a little moss where it faces up (lights left their own colour).
 */
function worked(random) {
    const mossy = [0.7 + random.next() * 0.08, 0.82, 0.6];

    return Object.assign(
        (point, normal, own) => {
            if (own.userData?.glow !== undefined) {
                return null;
            }

            const foot = Math.max(0, Math.min(1, point[1] / m(0.8)));
            const shade = 1 - 0.32 * (1 - foot);
            const green = Math.min(1, 0.18 * Math.max(0, normal[1] - 0.5) * 2);

            return [shade * (1 - green + green * mossy[0]), shade * (1 - green + green * mossy[1]), shade * (1 - green + green * mossy[2])];
        },
        { bands: [m(0.8)] },
    );
}

// A heap (spoil, ore, sawdust, chippings, charcoal) at (cx, cz): `r` round at its foot, `h` high,
// uneven all round (its radius and height varying as it was tipped), its faces laid flat so what
// it's of shows as it lies, sunk a little into the ground; lumps of what it's of (`lump`) lying
// on it and tumbled about its foot
function heap(solid, random, [cx, cz], r, h, stuff, { lumps = 0, lump = stuff, round = 0.25 } = {}) {
    const sides = 10;
    const turn = random.range(0, Math.PI * 2);
    const rings = [
        [1.08, -m(0.3)],
        [1, 0],
        [0.74, 0.42],
        [0.46, 0.78],
        [round, 1],
    ].map(([out, up], k) =>
        Array.from({ length: sides }, (_, i) => {
            const a = turn + (i / sides) * Math.PI * 2;
            const wobble = k ? random.range(0.86, 1.14) : 1.06;
            const y = up > 0 ? h * up * random.range(0.9, 1.08) : up;

            return [cx + Math.cos(a) * r * out * wobble, y, cz + Math.sin(a) * r * out * wobble];
        }),
    );

    for (let k = 0; k < rings.length - 1; k++) {
        for (let i = 0; i < sides; i++) {
            const j = (i + 1) % sides;

            solid.face([rings[k][j], rings[k][i], rings[k + 1][i], rings[k + 1][j]], material(stuff));
        }
    }

    const top = rings.at(-1);
    const middle = [cx, h * 1.02, cz];

    for (let i = 0; i < sides; i++) {
        solid.face([top[(i + 1) % sides], top[i], middle], material(stuff));
    }

    for (let k = lumps; k > 0; k--) {
        const a = random.range(0, Math.PI * 2);
        const out = r * random.range(0.2, 1.15);
        const on = h * Math.max(0, 1 - (out / r) ** 1.4);

        tumbled(solid, random, [cx + Math.cos(a) * out, on + m(0.08), cz + Math.sin(a) * out], m(random.range(0.22, 0.5)), material(lump));
    }
}

// A post from the ground (and below it) up to `top`
function post(solid, [x, z], top, size, stuff) {
    solid.beam([x, -m(FOOTING), z], [x, top, z], size, size, material(stuff), { up: [0, 0, 1] });
}

// A roof sloping one way (a lean-to's): over x0 to x1, from `high` at z0 (its back) down to `low`
// at z1 (its front), `thick`, of `cover`, its underside of `under`
function leanRoof(solid, [x0, z0, x1, z1], [high, low], thick, cover, under) {
    const [o, v] = [m(0.35), m(0.25)];
    const slope = (high - low) / (z1 - z0);
    const [ya, yb] = [high + slope * o, low - slope * o];
    const top = [
        [x0 - v, ya + thick, z0 - o],
        [x0 - v, yb + thick, z1 + o],
        [x1 + v, yb + thick, z1 + o],
        [x1 + v, ya + thick, z0 - o],
    ];
    const under_ = top.map(([x, y, z]) => [x, y - thick, z]);

    solid.face(top, material(cover));
    solid.face([...under_].reverse(), material(under));

    for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
    ]) {
        solid.face([under_[a], under_[b], top[b], top[a]], material(under));
    }
}

// Walls of boards round a rectangle (x0..x1, z0..z1), `high`, with a door `door` wide in its east
// or west side if it says, its doorway dark; the sides `open` says ("south") left open
function boarded(solid, [x0, z0, x1, z1], high, boards, { door = null, doorWide = m(1), open = [] } = {}) {
    const t = m(0.12);
    const across = (z, a0, a1) => solid.box(a0, -m(0.2), z - t / 2, a1, high, z + t / 2, material(boards));
    const along = (x, a0, a1) => solid.box(x - t / 2, -m(0.2), a0, x + t / 2, high, a1, material(boards));

    for (const [side, z] of [
        ["north", z0],
        ["south", z1],
    ]) {
        if (!open.includes(side)) {
            across(z, x0, x1);
        }
    }

    for (const [side, x, out] of [
        ["west", x0, -1],
        ["east", x1, 1],
    ]) {
        if (open.includes(side)) {
            continue;
        }

        if (door !== side) {
            along(x, z0, z1);
            continue;
        }

        // (Its door in the middle of the side: the wall either side of it and over it, the dark
        // of the doorway)
        const mid = (z0 + z1) / 2;
        const [d0, d1] = [mid - doorWide / 2, mid + doorWide / 2];
        const fx = x + out * (t / 2 + 0.4);
        const dark = [
            [fx, 0, d1],
            [fx, 0, d0],
            [fx, m(2), d0],
            [fx, m(2), d1],
        ];

        along(x, z0, d0);
        along(x, d1, z1);
        solid.box(x - t / 2, m(2), d0, x + t / 2, high, d1, material(boards));
        solid.face(out > 0 ? dark : [...dark].reverse(), material("door"));
    }
}

const BUILD = {
    // --- A lumber mill ---

    // A stump, sawn level, its bark on, its roots flaring into the ground
    stump(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [r, high] = [m(part.r), m(random.range(0.25, 0.55))];

        solid.cylinder(cx, cz, -m(FOOTING), high, r * 1.08, r, material("bark"), { segments: 9, capped: false });
        solid.cylinder(cx, cz, high - 0.3, high, r * 0.97, r * 0.97, material(stuff.timber === "bamboo" ? "timber-light" : "planks-pale"), { segments: 9 });

        for (let k = random.int(3, 4); k > 0; k--) {
            const a = random.range(0, Math.PI * 2);

            solid.beam([cx + Math.cos(a) * r * 0.6, high * 0.4, cz + Math.sin(a) * r * 0.6], [cx + Math.cos(a) * r * 2, -m(0.2), cz + Math.sin(a) * r * 2], r * 0.5, r * 0.4, material("bark"));
        }
    },

    // The saw shed: an open roof on posts over the trestles, a log laid along them, the long
    // two-man saw standing in its cut, a plank sawn from it leaning by; sawdust under it
    sawshed(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = sizeOf(part);
        const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
        const eaves = m(2.7);
        const size = m(0.22);

        for (const z of [z0 + m(0.3), z1 - m(0.3)]) {
            for (const x of [x0 + m(0.3), cx, x1 - m(0.3)]) {
                post(solid, [x, z], eaves, size, stuff.timber);
            }

            // (Its wall plate along the posts' tops)
            solid.beam([x0, eaves - m(0.1), z], [x1, eaves - m(0.1), z], m(0.2), m(0.2), material(stuff.timber));
        }

        for (const x of [x0 + m(0.3), cx, x1 - m(0.3)]) {
            solid.beam([x, eaves, z0], [x, eaves, z1], m(0.18), m(0.2), material(stuff.timber));
        }

        pitchedRoof(solid, { x0, x1, z0: z0 + m(0.3), z1: z1 - m(0.3), eaves: eaves + m(0.05), pitch: 0.6, overhang: m(0.45), verge: m(0.35), thickness: m(0.12), cover: stuff.roof, under: stuff.boards, barge: stuff.timber, thatch: stuff.roof === "thatch-palm" });

        // The trestles, each two crossed pairs of legs and a bearer on them
        const bed = m(1.65);

        for (const x of [cx - m(3), cx + m(3)]) {
            for (const side of [-1, 1]) {
                solid.beam([x + side * m(0.7), -m(0.1), cz - m(0.45)], [x - side * m(0.15), bed, cz], m(0.13), m(0.13), material(stuff.timber));
                solid.beam([x + side * m(0.7), -m(0.1), cz + m(0.45)], [x - side * m(0.15), bed, cz], m(0.13), m(0.13), material(stuff.timber));
            }

            solid.beam([x, bed, cz - m(0.55)], [x, bed, cz + m(0.55)], m(0.2), m(0.16), material(stuff.timber));
        }

        // The log on them, and the saw in its cut: its blade up and down through it, a handle
        // across each end
        const r = m(random.range(0.28, 0.36));
        const y = bed + m(0.08) + r;

        log(solid, [cx - m(4.6), y, cz], [cx + m(4.6), y, cz], r, "bark", "planks-pale", 9);

        const sx = cx + m(random.range(0.4, 1.8));

        solid.box(sx - m(0.01), y - r - m(1.1), cz + m(0.04) - m(0.09), sx + m(0.01), y + r + m(0.9), cz + m(0.04) + m(0.09), material("iron"));
        solid.beam([sx, y + r + m(0.95), cz - m(0.3)], [sx, y + r + m(0.95), cz + m(0.4)], m(0.06), m(0.06), material("timber-light"));
        solid.beam([sx, y - r - m(1.15), cz - m(0.3)], [sx, y - r - m(1.15), cz + m(0.4)], m(0.06), m(0.06), material("timber-light"));
        // (The kerf the saw's come down: the log sawn through from its end to the saw)
        solid.face([[cx + m(4.61), y - r, cz + m(0.04)], [cx + m(4.61), y + r, cz + m(0.04)], [sx, y + r, cz + m(0.04)], [sx, y - r, cz + m(0.04)]].reverse(), material("shadow"));

        // A plank sawn off, leaning on a trestle; and sawdust heaped under the cut
        solid.beam([cx - m(1), -m(0.05), cz + m(1.3)], [cx - m(1.4), m(1.5), cz + m(0.7)], m(0.32), m(0.06), material(stuff.boards));
        heap(solid, random, [sx, cz], m(0.9), m(0.16), "planks-pale", { round: 0.5 });
    },

    // Logs dragged in, piled across two skids, the ends sawn square
    logdeck(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = sizeOf(part);
        const timber = "bark";

        for (const side of [-1, 1]) {
            log(solid, [cx + side * (w / 2 - m(0.9)), m(0.12), cz - d / 2 + m(0.2)], [cx + side * (w / 2 - m(0.9)), m(0.12), cz + d / 2 - m(0.2)], m(0.16), timber, "planks", 7);
        }

        const rows = [Math.max(3, Math.floor(d / m(0.66))), 0, 0];

        rows[1] = rows[0] - 1;
        rows[2] = random.chance(0.7) ? rows[0] - 2 : 0;

        rows.forEach((count, row) => {
            for (let k = 0; k < count; k++) {
                const r = m(random.range(0.26, 0.33));
                const z = cz + (k - (count - 1) / 2) * m(0.66);
                const y = m(0.28) + r + row * m(0.56);
                const [a, b] = [cx - w / 2 + m(random.range(0.1, 0.6)), cx + w / 2 - m(random.range(0.1, 0.6))];

                log(solid, [a, y, z], [b, y, z], r, timber, "planks-pale", 8);
            }
        });

        // (A stake either end of the bottom row, to keep the pile from rolling)
        for (const side of [-1, 1]) {
            for (const end of [-1, 1]) {
                post(solid, [cx + side * (w / 2 - m(0.6)), cz + end * (d / 2 - m(0.05))], m(0.9), m(0.12), stuff.timber);
            }
        }
    },

    // Planks stacked to dry: each course of boards on sticks laid across the one under it, on
    // two sleepers
    planks(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = [m(part.w), m(part.d)];
        const courses = Math.max(4, Math.round(part.h / 0.13));

        for (const x of [cx - w * 0.35, cx + w * 0.35]) {
            solid.box(x - m(0.12), -m(0.2), cz - d / 2 - m(0.1), x + m(0.12), m(0.15), cz + d / 2 + m(0.1), material(stuff.timber));
        }

        for (let k = 0; k < courses; k++) {
            const y = m(0.15) + k * m(0.13);
            const short = k === courses - 1 ? random.range(0.4, 1) : 1;

            solid.box(cx - w / 2 + m(random.range(0, 0.15)), y, cz - (d / 2) * short, cx + w / 2 - m(random.range(0, 0.15)), y + m(0.06), cz + (d / 2) * short, material(stuff.boards));

            if (k < courses - 1) {
                for (const t of [-0.42, -0.14, 0.14, 0.42]) {
                    solid.box(cx + w * t - m(0.03), y + m(0.06), cz - d / 2, cx + w * t + m(0.03), y + m(0.13), cz + d / 2, material("timber-light"));
                }
            }
        }
    },

    // A lodge: the woodcutters', of boards under its roof, its door to the yard and a chimney
    // smoking; or the masons' (`lean`), a lean-to open to the front over their banker, a block
    // on it being dressed
    lodge(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = sizeOf(part);
        const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];

        if (part.lean) {
            const [high, low] = [m(2.9), m(2.1)];

            boarded(solid, [x0, z0, x1, z1], low, stuff.boards, { open: ["south"] });
            solid.box(x0 - m(0.06), low, z0 - m(0.06), x1 + m(0.06), high, z0 + m(0.06), material(stuff.boards));

            for (const x of [x0 + m(0.15), cx, x1 - m(0.15)]) {
                post(solid, [x, z1 - m(0.1)], low, m(0.2), stuff.timber);
            }

            leanRoof(solid, [x0, z0, x1, z1], [high, low], m(0.12), stuff.roof, stuff.boards);

            // The banker (a bench of stone) and the block on it, a mallet by; templates leaning
            // on the back wall
            solid.box(cx - m(0.9), -m(0.2), cz - m(0.2), cx + m(0.9), m(0.75), cz + m(0.5), material(stuff.dressed));
            solid.turnedBox(cx + m(0.1), cz + m(0.15), m(0.45), m(0.3), m(0.75), m(1.2), random.range(-0.2, 0.2), material(stuff.cut));
            solid.beam([cx - m(0.6), m(0.82), cz + m(0.3)], [cx - m(0.3), m(0.82), cz + m(0.36)], m(0.1), m(0.1), material("timber-light"));

            for (let k = random.int(2, 3); k > 0; k--) {
                const x = x0 + m(random.range(0.6, 2));

                solid.beam([x, 0, z0 + m(0.4)], [x + m(0.05), m(random.range(0.9, 1.5)), z0 + m(0.15)], m(random.range(0.3, 0.5)), m(0.02), material("planks-pale"));
            }

            return;
        }

        const eaves = m(2.3);

        boarded(solid, [x0, z0, x1, z1], eaves, stuff.boards, { door: "east" });

        for (const x of [x0, x1]) {
            for (const z of [z0, z1]) {
                post(solid, [x, z], eaves, m(0.24), stuff.timber);
            }
        }

        pitchedRoof(solid, { x0, x1, z0, z1, eaves, pitch: 0.75, overhang: m(0.4), verge: m(0.3), thickness: m(0.12), cover: stuff.roof, under: stuff.boards, barge: stuff.timber, thatch: stuff.roof === "thatch-palm" });

        // Its chimney of stone at its west end, smoking
        const [hx, hz] = [x0 + m(0.1), cz];
        const top = eaves + d * 0.375 + m(0.9);

        solid.box(hx - m(0.45), -m(0.2), hz - m(0.45), hx + m(0.35), top, hz + m(0.45), material(stuff.dressed));
        (solid.smoke ??= []).push([hx - m(0.05), top + m(0.05), hz, 0.8]);

        // A bench by its door
        solid.box(x1 + m(0.3), m(0.4), cz + m(0.7), x1 + m(0.65), m(0.48), cz + m(1.9), material(stuff.boards));
        post(solid, [x1 + m(0.47), cz + m(0.8)], m(0.42), m(0.1), stuff.timber);
        post(solid, [x1 + m(0.47), cz + m(1.8)], m(0.42), m(0.1), stuff.timber);
    },

    // Firewood: split logs stacked between posts, their ends out
    cordwood(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = sizeOf(part);
        const across = Math.floor(w / m(0.2));

        for (let row = 0; row < 5; row++) {
            for (let k = 0; k < across; k++) {
                const x = cx - w / 2 + m(0.1) + k * m(0.2) + m(random.range(-0.02, 0.02));
                const y = m(0.1) + row * m(0.19);

                log(solid, [x, y, cz - d / 2], [x + m(random.range(-0.03, 0.03)), y + m(random.range(-0.02, 0.02)), cz + d / 2], m(0.095), "bark", "planks-pale", 5);
            }
        }

        for (const side of [-1, 1]) {
            post(solid, [cx + side * (w / 2 + m(0.08)), cz], m(1.1), m(0.12), stuff.timber);
        }
    },

    // A chopping block, an axe in it
    block(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);

        solid.cylinder(cx, cz, -m(0.2), m(0.55), m(0.32), m(0.3), material("bark"), { segments: 9 });
        solid.cylinder(cx, cz, m(0.55), m(0.56), m(0.29), m(0.29), material("planks-pale"), { segments: 9 });
        solid.box(cx - m(0.02), m(0.48), cz - m(0.12), cx + m(0.02), m(0.62), cz + m(0.06), material("iron"));
        solid.beam([cx, m(0.6), cz + m(0.02)], [cx + m(0.15), m(1.25), cz + m(0.25)], m(0.05), m(0.05), material(stuff.timber === "bamboo" ? "timber-light" : stuff.timber));
    },

    // Sawdust heaped
    sawdust(solid, piece, random, part) {
        heap(solid, random, middleOf(piece), m(part.r), m(part.r * 0.26), "planks-pale", { round: 0.45 });
    },

    // A charcoal clamp: the wood stacked in a dome and covered with earth and turf, burning
    // slowly under it, sooty at its crown, smoke seeping out at its top and its vents; billets
    // waiting by it
    clamp(solid, piece, random, part) {
        const [cx, cz] = middleOf(piece);
        const r = m(part.r);
        const h = r * 0.5;

        heap(solid, random, [cx, cz], r, h * 0.7, "soil", { round: 0.62 });
        heap(solid, random, [cx, cz], r * 0.66, h, "earth-sooty", { round: 0.3 });

        // (Turves laid on it, here and there)
        for (let k = random.int(4, 6); k > 0; k--) {
            const a = random.range(0, Math.PI * 2);
            const out = r * random.range(0.45, 0.8);

            solid.turnedBox(cx + Math.cos(a) * out, cz + Math.sin(a) * out, m(0.25), m(0.18), h * 0.4 * (1 - out / r) + m(0.1), h * 0.4 * (1 - out / r) + m(0.22), a, material("grass"));
        }

        (solid.smoke ??= []).push([cx, h + m(0.05), cz, 0.9]);

        for (let k = 3; k > 0; k--) {
            const a = random.range(0, Math.PI * 2);

            (solid.smoke ??= []).push([cx + Math.cos(a) * r * 0.6, h * 0.45, cz + Math.sin(a) * r * 0.6, 0.35]);
        }

        for (let k = random.int(4, 6); k > 0; k--) {
            const z = cz + r + m(0.5) + k * m(0.08);

            log(solid, [cx - m(0.7) + m(random.range(-0.1, 0.1)), m(0.1) + (k % 2) * m(0.18), z], [cx + m(0.7), m(0.1) + (k % 2) * m(0.18), z + m(random.range(-0.1, 0.1))], m(0.09), "bark", "planks-pale", 5);
        }
    },

    // --- A mine ---

    // The mine's pit: its floor dug out and trodden, a crib of logs holding back the foot of its
    // bank at the back, steps of timber down its front, a ladder down its back; loose stone on
    // its floor
    minepit(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [r, ease, drop] = [m(part.radius), m(part.ease), m(part.drop)];
        const timber = stuff.timber === "bamboo" ? "timber-light" : stuff.timber;

        solid.cylinder(cx, cz, -m(0.2), m(0.03), r + m(0.3), r + m(0.3), material("mud-dark"), { segments: 16 });

        // (The crib: logs laid along the bank's foot, three high, round its back)
        const count = 7;

        for (let k = 0; k < count; k++) {
            const [a0, a1] = [Math.PI * 1.08 + (k / count) * Math.PI * 0.84, Math.PI * 1.08 + ((k + 1) / count) * Math.PI * 0.84];
            const at = (a, y) => [cx + Math.cos(a) * (r + m(0.25)), y, cz + Math.sin(a) * (r + m(0.25))];

            for (let row = 0; row < 3; row++) {
                const y = m(0.16) + row * m(0.3);

                log(solid, at(a0 - 0.04, y), at(a1 + 0.04, y), m(0.15), "bark", "planks-pale", 6);
            }
        }

        // (Steps down its front: each as high as the dug land is there)
        const steps = 8;

        for (let k = 0; k < steps; k++) {
            const [d0, d1] = [(k / steps) * ease, ((k + 1) / steps) * ease];
            const t = d1 / ease;
            const tread = drop * t * t * (3 - 2 * t);

            solid.box(cx - m(0.8), tread - m(0.5), cz + r + d0, cx + m(0.8), tread + m(0.04), cz + r + d1, material(timber));
        }

        // A ladder up its back
        const [lz0, lz1] = [cz - r + m(0.35), cz - r - ease * 0.55];

        for (const side of [-1, 1]) {
            solid.beam([cx + m(1.6) + side * m(0.25), 0, lz0], [cx + m(1.6) + side * m(0.25), drop + m(0.6), lz1], m(0.08), m(0.08), material(timber));
        }

        for (let k = 1; k < 9; k++) {
            const t = k / 9;

            solid.beam([cx + m(1.35), t * (drop + m(0.6)), lz0 + (lz1 - lz0) * t], [cx + m(1.85), t * (drop + m(0.6)), lz0 + (lz1 - lz0) * t], m(0.05), m(0.05), material(timber));
        }

        for (let k = random.int(5, 8); k > 0; k--) {
            const a = random.range(0, Math.PI * 2);
            const out = r * random.range(0.6, 0.95);

            tumbled(solid, random, [cx + Math.cos(a) * out, m(0.15), cz + Math.sin(a) * out], m(random.range(0.25, 0.55)), material(stuff.rock));
        }
    },

    // The shaft at the pit's floor: a square collar of timbers round its black mouth; over it a
    // headframe (two trestles and a beam across them, the wheel on it), the rope from the
    // windlass at its front up over the wheel and down the shaft; the bucket set down by it
    shaft(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const half = m(0.85);
        const timber = stuff.timber === "bamboo" ? "timber-light" : stuff.timber;

        solid.face([[cx - half, m(0.02), cz - half], [cx - half, m(0.02), cz + half], [cx + half, m(0.02), cz + half], [cx + half, m(0.02), cz - half]], material("shadow"));

        for (const [a, b] of [
            [[cx - half - m(0.15), cz - half - m(0.15)], [cx + half + m(0.15), cz - half - m(0.15)]],
            [[cx - half - m(0.15), cz + half + m(0.15)], [cx + half + m(0.15), cz + half + m(0.15)]],
            [[cx - half - m(0.15), cz - half], [cx - half - m(0.15), cz + half]],
            [[cx + half + m(0.15), cz - half], [cx + half + m(0.15), cz + half]],
        ]) {
            solid.beam([a[0], m(0.15), a[1]], [b[0], m(0.15), b[1]], m(0.3), m(0.3), material(timber));
        }

        // The headframe: a trestle either side of the shaft, the beam across their tops, the
        // wheel in the middle of it
        const top = m(3.6);

        for (const side of [-1, 1]) {
            const x = cx + side * (half + m(0.35));

            for (const end of [-1, 1]) {
                solid.beam([x, -m(0.3), cz + end * m(1.1)], [x, top, cz], m(0.2), m(0.2), material(timber));
            }

            solid.beam([x, m(1.2), cz - m(0.75)], [x, m(1.2), cz + m(0.75)], m(0.12), m(0.12), material(timber));
        }

        solid.beam([cx - half - m(0.55), top, cz], [cx + half + m(0.55), top, cz], m(0.24), m(0.24), material(timber));
        log(solid, [cx - m(0.07), top - m(0.4), cz], [cx + m(0.07), top - m(0.4), cz], m(0.42), "timber-light", "iron", 14);

        // The windlass at its front: an upright either side, the drum between them, its crank
        const [wz, y] = [cz + half + m(1.1), m(0.95)];

        for (const side of [-1, 1]) {
            solid.beam([cx + side * m(0.75), -m(0.2), wz], [cx + side * m(0.75), y + m(0.2), wz], m(0.18), m(0.18), material(timber), { up: [0, 0, 1] });
        }

        log(solid, [cx - m(0.7), y, wz], [cx + m(0.7), y, wz], m(0.16), timber, "planks", 10);

        for (const side of [-1, 1]) {
            solid.beam([cx + side * m(0.9), y, wz - m(0.4)], [cx + side * m(0.9), y, wz + m(0.4)], m(0.06), m(0.06), material("timber-light"));
        }

        // Its rope up over the wheel and down into the shaft; the bucket by the collar
        solid.beam([cx, y + m(0.14), wz], [cx, top - m(0.02), cz + m(0.42)], m(0.04), m(0.04), material("rope"));
        solid.beam([cx, top - m(0.4), cz - m(0.42)], [cx, -m(1.5), cz - m(0.42)], m(0.04), m(0.04), material("rope"), { up: [0, 0, 1] });
        solid.cylinder(cx - half - m(0.75), cz + m(0.6), m(0), m(0.48), m(0.24), m(0.28), material(stuff.boards), { segments: 10 });
        solid.cylinder(cx - half - m(0.75), cz + m(0.6), m(0.2), m(0.26), m(0.265), m(0.265), material("iron"), { segments: 10, capped: false });
    },

    // A spoil heap: the rock and earth brought up, tipped round the pit
    spoil(solid, piece, random, part, stuff) {
        heap(solid, random, middleOf(piece), m(part.r), m(part.h), stuff.spoil, { lumps: random.int(7, 11), lump: stuff.rock, round: 0.3 });
    },

    // The ore, heaped: red-brown with the iron in it
    ore(solid, piece, random, part) {
        heap(solid, random, middleOf(piece), m(part.r), m(part.r * 0.45), "rock-red", { lumps: random.int(7, 10), lump: "rust", round: 0.35 });
    },

    // The bloomery: a clay furnace narrowing as it rises, glowing at its mouth at the foot, smoke
    // from its top; its bellows beside it, worked by hand; a roof on posts over it; slag tipped
    // by it
    bloomery(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [fx, fz] = [cx - m(0.4), cz];
        const high = m(1.7);

        solid.lathe(fx, fz, [
            [m(0.62), -m(0.3)],
            [m(0.6), 0],
            [m(0.55), high * 0.5],
            [m(0.36), high],
            [m(0.24), high],
        ], material(stuff.clay), { segments: 12 });
        solid.face([[fx - m(0.22), m(0.02), fz + m(0.6)], [fx + m(0.22), m(0.02), fz + m(0.6)], [fx + m(0.18), m(0.42), fz + m(0.58)], [fx - m(0.18), m(0.42), fz + m(0.58)]], material("glow-fire"));
        fireLight(solid, [fx, m(0.25), fz + m(0.75)], "brazier");
        (solid.smoke ??= []).push([fx, high + m(0.1), fz, 1.2]);

        // The bellows: two leather bags on boards, a pipe from them into the furnace's side
        for (const side of [-1, 1]) {
            const z = fz + side * m(0.32);

            solid.box(fx + m(0.9), m(0.15), z - m(0.22), fx + m(1.9), m(0.2), z + m(0.22), material(stuff.boards));
            solid.beam([fx + m(1.85), m(0.25), z], [fx + m(0.95), m(0.25), z], m(0.4), m(0.18), material("leather"));
        }

        solid.beam([fx + m(0.95), m(0.28), fz], [fx + m(0.5), m(0.3), fz], m(0.1), m(0.1), material(stuff.clay));

        // Its roof on four posts
        const [x0, x1, z0, z1] = [cx - m(part.w / 2), cx + m(part.w / 2), cz - m(part.d / 2), cz + m(part.d / 2)];

        for (const x of [x0 + m(0.2), x1 - m(0.2)]) {
            for (const z of [z0 + m(0.2), z1 - m(0.2)]) {
                post(solid, [x, z], z === z0 + m(0.2) ? m(3) : m(2.4), m(0.18), stuff.timber);
            }
        }

        leanRoof(solid, [x0, z0, x1, z1], [m(3), m(2.4)], m(0.1), stuff.roof, stuff.boards);

        // Slag tipped by it, dark and glassy
        heap(solid, random, [cx + m(1.2), cz + m(1.4)], m(0.6), m(0.3), "obsidian", { lumps: 2, lump: "basalt" });
    },

    // Charcoal for the bloomery, heaped black
    charcoal(solid, piece, random, part) {
        heap(solid, random, middleOf(piece), m(part.r), m(part.r * 0.4), "timber-char", { lumps: 5, lump: "soot", round: 0.4 });
    },

    // The tool shed: boards round three sides and a roof sloping back, open to the front, the
    // picks, shovels and hammers leaning in it
    toolshed(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = sizeOf(part);
        const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];

        boarded(solid, [x0, z0, x1, z1], m(2.1), stuff.boards, { open: ["south"] });
        solid.box(x0 - m(0.06), m(2.1), z0 - m(0.06), x1 + m(0.06), m(2.6), z0 + m(0.06), material(stuff.boards));

        for (const x of [x0 + m(0.1), x1 - m(0.1)]) {
            post(solid, [x, z1 - m(0.1)], m(2.1), m(0.18), stuff.timber);
        }

        leanRoof(solid, [x0, z0, x1, z1], [m(2.6), m(2.1)], m(0.1), stuff.roof, stuff.boards);

        for (let k = 0; k < 5; k++) {
            const x = x0 + m(0.5) + k * m(0.45);

            solid.beam([x, 0, z0 + m(0.5)], [x + m(0.04), m(1.3), z0 + m(0.15)], m(0.05), m(0.05), material("timber-light"));
            solid.box(x - m(0.12), m(1.25), z0 + m(0.08), x + m(0.16), m(1.33), z0 + m(0.22), material("iron"));
        }
    },

    // A wheelbarrow: a box of boards on one wheel, two handles and two legs
    barrow(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const turn = part.turn ?? 0;
        const at = (x, y, z) => [cx + x * Math.cos(turn) - z * Math.sin(turn), y, cz + x * Math.sin(turn) + z * Math.cos(turn)];

        solid.turnedBox(cx, cz, m(0.4), m(0.3), m(0.35), m(0.65), turn, material(stuff.boards));
        log(solid, at(-m(0.08), m(0.22), m(0.55)), at(m(0.08), m(0.22), m(0.55)), m(0.22), "timber-light", "planks", 10);

        for (const side of [-1, 1]) {
            solid.beam(at(side * m(0.25), m(0.4), m(0.5)), at(side * m(0.3), m(0.55), -m(0.9)), m(0.06), m(0.06), material("timber-light"));
            solid.beam(at(side * m(0.25), m(0.38), -m(0.25)), at(side * m(0.25), -m(0.05), -m(0.3)), m(0.06), m(0.06), material("timber-light"));
        }

        heap(solid, random, [cx, cz], m(0.3), m(0.15), "rock-red");
    },

    // --- A quarry ---

    // A face of the quarry: the rock cut back into the hill in two benches, square as the blocks
    // were taken from it a course at a time, so its skyline steps along it; the rock behind it
    // weathered, falling away to the land outside; a block half split from the lower bench, the
    // iron wedges in a row along its split
    face(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = sizeOf(part);
        // (Along the face (u) and out of it, into the quarry (v): its way in turned to its side)
        const along = part.side === "back";
        const [length, thick] = along ? [w, d] : [d, w];
        const out = part.side === "east" ? -1 : 1;
        const at = along ? (u, y, v) => [cx + u, y, cz + v] : (u, y, v) => [cx + out * v, y, cz + u];
        const box = (u0, u1, v0, v1, y0, y1, stuff_, top = stuff.rock) => {
            const [a, b] = [at(u0, y0, v0), at(u1, y1, v1)];

            solid.box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), material(stuff_), { top: material(top) });
        };
        const high = m(part.h);
        const lower = high * random.range(0.48, 0.58);
        const step = m(1.3);
        const course = m(1.6);
        // (Its ends low where the rock runs out: a side's front end, both ends of the back)
        const taper = (u) => {
            const fromEnd = Math.min(u + length / 2, along ? length / 2 - u : Infinity);

            return Math.min(1, 0.45 + (fromEnd / m(4)) * 0.55);
        };

        for (let u0 = -length / 2; u0 < length / 2 - 1; u0 += course) {
            const u1 = Math.min(length / 2, u0 + course);
            const k = taper((u0 + u1) / 2);
            const [y1, y2] = [lower * k + m(random.range(-0.2, 0.2)), high * k + m(random.range(-0.35, 0.3))];

            // The lower bench, its face square at the quarry's edge, as far out as the courses
            // taken from it left it; the upper set back from it, the land's turf over its top
            const [v1, v2] = [thick / 2 - m(random.range(0, 0.45)), thick / 2 - step - m(random.range(0, 0.5))];

            box(u0, u1, -thick / 2, v1, -m(FOOTING), y1, stuff.cut);
            box(u0, u1, -thick / 2, v2, y1 - m(0.02), Math.max(y1 + m(0.6), y2), stuff.cut, "grass");
        }

        // The rock behind it, falling away outside: a slope from its top's back edge to the land
        const run = thick * 0.7;

        for (let u0 = -length / 2; u0 < length / 2 - 1; u0 += course) {
            const u1 = Math.min(length / 2, u0 + course);
            const k = taper((u0 + u1) / 2);
            const top = high * k * 0.8;
            const points = [at(u0, -m(0.2), -thick / 2 - run), at(u1, -m(0.2), -thick / 2 - run), at(u1, top, -thick / 2 + m(0.1)), at(u0, top, -thick / 2 + m(0.1))];

            // (Both ways round: which way it faces turns with the side it's on)
            solid.face(points, material(stuff.rock));
            solid.face([...points].reverse(), material(stuff.rock));
        }

        // Boulders on its top and at its outer foot
        for (let k = random.int(2, 4); k > 0; k--) {
            const u = random.range(-length / 2 + m(1), length / 2 - m(1));

            tumbled(solid, random, at(u, high * taper(u) * 0.75, -thick / 2 + m(random.range(0.3, 1.2))), m(random.range(0.5, 0.9)), material(stuff.rock));
        }

        // The block half split from the lower bench, the wedges along its split
        if (along) {
            const u = random.range(-length / 4, length / 4);
            const [bw, bh, bd] = [m(1.8), m(0.9), m(1)];

            box(u - bw / 2, u + bw / 2, thick / 2, thick / 2 + bd, -m(0.1), bh, stuff.cut);

            for (let k = 0; k < 5; k++) {
                const [x, y, z] = at(u - bw / 2 + m(0.2) + k * (bw - m(0.4)) / 4, bh + m(0.06), thick / 2 + m(0.05));

                solid.box(x - m(0.04), y - m(0.12), z - m(0.05), x + m(0.04), y, z + m(0.05), material("iron"));
            }
        }
    },

    // The crane: two legs of timber leaning out over the face, lashed at their top where the
    // pulley hangs, stayed back to a stake on the face; a windlass between their feet winding
    // the rope up over the pulley and down to a block hanging from it
    derrick(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const timber = stuff.timber === "bamboo" ? "timber-light" : stuff.timber;
        const apex = [cx, m(6.4), cz - m(1.9)];

        for (const side of [-1, 1]) {
            solid.beam([cx + side * m(1.6), -m(0.3), cz + m(1)], apex, m(0.24), m(0.24), material(timber));
        }

        solid.beam(apex, [cx + m(random.range(-0.5, 0.5)), m(4.2), cz - m(6.5)], m(0.05), m(0.05), material("rope"));
        solid.beam([cx - m(0.3), m(6.2), cz - m(1.9)], [cx + m(0.3), m(6.2), cz - m(1.9)], m(0.18), m(0.3), material("iron"));

        // Its windlass at the legs' feet
        for (const side of [-1, 1]) {
            solid.beam([cx + side * m(1.1), -m(0.2), cz + m(0.85)], [cx + side * m(1.1), m(1.1), cz + m(0.85)], m(0.16), m(0.16), material(timber), { up: [0, 0, 1] });
        }

        log(solid, [cx - m(1.05), m(0.95), cz + m(0.85)], [cx + m(1.05), m(0.95), cz + m(0.85)], m(0.16), timber, "planks", 10);

        for (const side of [-1, 1]) {
            solid.beam([cx + side * m(1.25), m(0.95), cz + m(0.85) - m(0.45)], [cx + side * m(1.25), m(0.95), cz + m(0.85) + m(0.45)], m(0.07), m(0.07), material("timber-light"));
        }

        // The rope up to the pulley and down to the block, hanging a little over the floor
        const hang = m(random.range(1.6, 2.6));

        solid.beam([cx, m(1.1), cz + m(0.85)], [cx, m(6.15), cz - m(1.9)], m(0.04), m(0.04), material("rope"));
        solid.beam([cx, m(6.15), cz - m(1.95)], [cx, hang + m(0.75), cz - m(1.95)], m(0.04), m(0.04), material("rope"), { up: [0, 0, 1] });
        solid.turnedBox(cx, cz - m(1.95), m(0.6), m(0.35), hang, hang + m(0.65), random.range(-0.4, 0.4), material(stuff.cut));
    },

    // Rough blocks stacked on the quarry's floor
    blocks(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const turn = random.range(-0.2, 0.2);

        for (const [x, z, y, s] of [
            [-0.7, 0, 0, 1],
            [0.7, 0.05, 0, 0.95],
            [0, 0, 1, 0.9],
        ]) {
            const [hx, hz, hy] = [m(0.68 * s), m(0.5 * s), m(0.5 * s)];

            if (y && random.chance(0.25)) {
                continue;
            }

            solid.turnedBox(cx + m(x) * Math.cos(turn), cz + m(x) * Math.sin(turn) + m(z), hx, hz, y * m(0.5) - (y ? 0 : m(0.15)), y * m(0.5) + hy * 2 - (y ? 0 : m(0.15)), turn + random.range(-0.08, 0.08), material(stuff.cut));
        }
    },

    // Dressed stone, squared and stacked neatly by the masons' lodge
    ashlar(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const [w, d] = [m(part.w), m(part.d)];

        for (let row = 0; row < 3; row++) {
            const count = 3 - (row === 2 && random.chance(0.5) ? 1 : 0);

            for (let k = 0; k < count; k++) {
                const x0 = cx - w / 2 + (k * w) / 3 + m(0.02);

                solid.box(x0, row * m(0.42), cz - d / 2, x0 + w / 3 - m(0.04), row * m(0.42) + m(0.4), cz + d / 2, material(stuff.dressed));
            }
        }
    },

    // The masons' chippings, heaped
    chippings(solid, piece, random, part, stuff) {
        heap(solid, random, middleOf(piece), m(part.r), m(part.h), stuff.cut, { lumps: random.int(4, 7), lump: stuff.cut, round: 0.35 });
    },

    // A sledge, a block on it, rollers laid before it
    sledge(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);
        const turn = part.turn ?? 0;
        const at = (x, y, z) => [cx + x * Math.cos(turn) - z * Math.sin(turn), y, cz + x * Math.sin(turn) + z * Math.cos(turn)];

        for (const side of [-1, 1]) {
            solid.beam(at(side * m(0.45), m(0.1), -m(0.9)), at(side * m(0.45), m(0.1), m(0.8)), m(0.14), m(0.18), material(stuff.timber === "bamboo" ? "timber-light" : stuff.timber));
            solid.beam(at(side * m(0.45), m(0.1), m(0.8)), at(side * m(0.45), m(0.35), m(1.1)), m(0.14), m(0.16), material(stuff.timber === "bamboo" ? "timber-light" : stuff.timber));
        }

        for (const z of [-0.6, 0, 0.6]) {
            solid.beam(at(-m(0.55), m(0.24), m(z)), at(m(0.55), m(0.24), m(z)), m(0.14), m(0.1), material(stuff.boards));
        }

        solid.turnedBox(cx, cz, m(0.5), m(0.6), m(0.3), m(1), turn, material(stuff.cut));

        for (const z of [1.5, 2.1]) {
            log(solid, at(-m(0.6), m(0.1), m(z)), at(m(0.6), m(0.1), m(z)), m(0.1), "timber-light", "planks", 7);
        }
    },

    // A boulder
    boulder(solid, piece, random, part, stuff) {
        const [cx, cz] = middleOf(piece);

        tumbled(solid, random, [cx, m(part.r * 0.4), cz], m(part.r * 1.8), material(stuff.rock), { lean: 0.3 });

        if (random.chance(0.5)) {
            tumbled(solid, random, [cx + m(part.r * 0.8), m(part.r * 0.25), cz + m(part.r * 0.5)], m(part.r), material(stuff.rock));
        }
    },
};

/** The parts of a works there's art for (setpieces/works.js lays them out). */
export const WORK_PARTS = Object.freeze(Object.keys(BUILD));

/**
 * Build a works' part (a piece of it: sites.js), in its people's stuff: its `random` (the part's
 * own), and the solid to build it in. Returns whether it was one.
 */
export function buildWorksPart(solid, piece, random) {
    const build = BUILD[piece.part.part];

    if (!build) {
        return false;
    }

    solid.tone = worked(random);
    build(solid, piece, random, piece.part, stuffOf(piece.people));

    return true;
}
