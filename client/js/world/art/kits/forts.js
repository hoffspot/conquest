// Each people's fortifications, drawn (core/war/forts.js: built by its rulers from their stores;
// world/forts3d.js sets them down, its people's banner by each): a guard tower, four metres square
// and eleven high, its stone battered at its foot, arrow loops in each face at two heights, and on
// top battlements, a roof, or a timber hoarding, as its people build; its door at the back, away
// from the enemy, a torch by it. And a forward garrison, ten metres square: a curtain of stone (or
// a palisade of stakes, as some build), loops along it, a turret at each corner and the gate in
// its back wall, the roof of its barracks showing over the wall. In each people's own stone,
// timber and roofing (kits/works.js WORKS_STUFF).
//
// In world pixels as the kits are (a metre is five), round the fortification's point, its front
// (its door, its gate) towards +z.

import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { torch } from "./torches.js";
import { WORKS_STUFF } from "./works.js";

const M = 5;
const m = (metres) => metres * M;

/**
 * How each people tops a guard tower (`tower`: "battlements", "roof" a pointed roof over a ring of
 * corbels, or "hoarding" a timber gallery under a roof) and walls a forward garrison (`wall`:
 * "stone", or "stakes" a palisade), and the roofing their roofs are of (their works').
 */
export const FORT_LOOKS = Object.freeze({
    human: { tower: "battlements", wall: "stone" },
    elf: { tower: "roof", wall: "stone" },
    darkElf: { tower: "battlements", wall: "stone" },
    cat: { tower: "roof", wall: "stone" },
    lizard: { tower: "hoarding", wall: "stakes" },
    orc: { tower: "hoarding", wall: "stakes" },
});

/** A tower's measures (metres): `half` its width, `foot` its plinth's height, `high` its walls'. */
export const TOWER = Object.freeze({ half: 1.8, foot: 0.9, high: 9.5, loops: [3.6, 6.8] });

/** A forward garrison's (metres): `half` its walls' reach, `high` their height, `thick` theirs, `gate` its width. */
export const GARRISON = Object.freeze({ half: 5, high: 3.2, thick: 0.6, gate: 2.4, turret: 0.9 });

/** A fortification of `kind` ("tower", "garrison") of `people`'s, as a Three.js group (world pixels). */
export function fortObject(kind, people) {
    const solid = new Solid();
    const stuff = WORKS_STUFF[people] ?? WORKS_STUFF.human;
    const look = FORT_LOOKS[people] ?? FORT_LOOKS.human;

    if (kind === "garrison") {
        garrison(solid, stuff, look, people);
    } else {
        tower(solid, stuff, look);
    }

    return solid.toObject();
}

// A dark slit in a wall facing `out` ([x, z]: a unit along x or z), its middle at (x, y, z)
function loop(solid, [x, y, z], [ox, oz]) {
    const [hw, hd] = ox ? [m(0.08), m(0.22)] : [m(0.22), m(0.08)];

    solid.box(x - hw + ox * m(0.04), y, z - hd + oz * m(0.04), x + hw + ox * m(0.04), y + m(1.1), z + hd + oz * m(0.04), material("shadow"));
}

// Merlons round a square top, `half` from its middle, standing on `y`
function battlements(solid, half, y, stone) {
    const count = 4;

    for (const side of [-1, 1]) {
        for (let k = 0; k < count; k++) {
            const u = -half + ((k + 0.5) * 2 * half) / count;

            solid.box(u - m(0.28), y, side * half - m(0.2), u + m(0.28), y + m(0.8), side * half + m(0.2), stone);
            solid.box(side * half - m(0.2), y, u - m(0.28), side * half + m(0.2), y + m(0.8), u + m(0.28), stone);
        }
    }
}

// A guard tower: battered foot, its shaft, a band of corbels, its top as its people build it
function tower(solid, stuff, look) {
    const stone = material(stuff.dressed);
    const timber = material(stuff.timber);
    const half = m(TOWER.half);
    const top = m(TOWER.high);

    solid.box(-half - m(0.25), -m(1), -half - m(0.25), half + m(0.25), m(TOWER.foot), half + m(0.25), stone);
    solid.box(-half, m(TOWER.foot), -half, half, top, half, stone);
    solid.box(-half - m(0.18), top, -half - m(0.18), half + m(0.18), top + m(0.35), half + m(0.18), stone);

    // (Its loops, in each face, at two heights)
    for (const y of TOWER.loops) {
        for (const [ox, oz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            loop(solid, [ox * half, m(y), oz * half], [ox, oz]);
        }
    }

    const head = top + m(0.35);

    if (look.tower === "roof") {
        // A pointed roof over its top, steep
        solid.pyramid(-half - m(0.5), -half - m(0.5), half + m(0.5), half + m(0.5), head, m(4.2), material(stuff.roof));
    } else if (look.tower === "hoarding") {
        // A timber gallery jutting out over the top of its walls, posts at its corners, a roof
        // low over it
        const out = half + m(0.5);

        solid.box(-out, head, -out, out, head + m(0.2), out, timber);

        for (const side of [-1, 1]) {
            solid.box(-out, head + m(0.2), side * out - m(0.08), out, head + m(1), side * out + m(0.08), material(stuff.boards));
            solid.box(side * out - m(0.08), head + m(0.2), -out, side * out + m(0.08), head + m(1), out, material(stuff.boards));
        }

        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            solid.box(x * out - m(0.12), head, z * out - m(0.12), x * out + m(0.12), head + m(2), z * out + m(0.12), timber);
        }

        solid.pyramid(-out - m(0.4), -out - m(0.4), out + m(0.4), out + m(0.4), head + m(2), m(1.8), material(stuff.roof));
    } else {
        battlements(solid, half - m(0.05), head, stone);
    }

    // Its door at the back, in a frame of stone, a step before it, a torch beside it
    solid.box(-m(0.75), 0, half - m(0.1), m(0.75), m(2.4), half + m(0.25), stone);
    solid.box(-m(0.55), m(0.2), half + m(0.25), m(0.55), m(2.1), half + m(0.32), material(stuff.boards));
    solid.box(-m(0.9), -m(0.2), half + m(0.25), m(0.9), m(0.2), half + m(0.8), stone);
    torch(solid, [m(1.05), m(2.2), half], [0, 1]);
}

// A forward garrison: its curtain (or palisade) round it, a turret at each corner, its gate at the
// back; its barracks inside, the roof showing over the wall
function garrison(solid, stuff, look, people) {
    const stone = material(stuff.dressed);
    const timber = material(stuff.timber);
    const half = m(GARRISON.half);
    const high = m(GARRISON.high);
    const thick = m(GARRISON.thick);
    const gate = m(GARRISON.gate) / 2;
    const stakes = look.wall === "stakes";
    const wall = (x0, z0, x1, z1) => {
        if (!stakes) {
            solid.box(x0, -m(0.6), z0, x1, high, z1, stone);

            return;
        }

        // (A palisade: stakes side by side, sharpened, a walkway of planks behind them)
        const alongX = x1 - x0 > z1 - z0;
        const length = alongX ? x1 - x0 : z1 - z0;
        const count = Math.round(length / m(0.32));

        for (let k = 0; k < count; k++) {
            const u = (alongX ? x0 : z0) + ((k + 0.5) * length) / count;
            const tall = high + m(0.25) * (k % 2);
            const [cx, cz] = alongX ? [u, (z0 + z1) / 2] : [(x0 + x1) / 2, u];

            solid.cylinder(cx, cz, -m(0.6), tall, m(0.15), m(0.15), timber, { segments: 5 });
            solid.cone(cx, cz, tall, m(0.35), m(0.15), timber, 5);
        }
    };

    // The curtain: back and front (its gate in the front), and the sides
    wall(-half, -half, half, -half + thick);
    wall(-half, half - thick, -gate, half);
    wall(gate, half - thick, half, half);
    wall(-half, -half, -half + thick, half);
    wall(half - thick, -half, half, half);

    if (!stakes) {
        // Merlons along its top, and loops along its outer faces
        for (const [x, z, alongX] of [[0, -half + thick / 2, true], [0, half - thick / 2, true], [-half + thick / 2, 0, false], [half - thick / 2, 0, false]]) {
            for (let k = -3; k <= 3; k++) {
                const u = k * m(1.25);

                if (z > 0 && alongX && Math.abs(u) < gate + m(0.4)) {
                    continue;
                }

                const [cx, cz] = alongX ? [u, z] : [x, u];

                solid.box(cx - m(0.25), high, cz - m(0.25), cx + m(0.25), high + m(0.6), cz + m(0.25), stone);
            }
        }

        for (const [ox, oz] of [[0, -1], [1, 0], [-1, 0]]) {
            for (const u of [-m(2.5), m(2.5)]) {
                loop(solid, [ox ? ox * half : u, m(1.4), oz ? oz * half : u], [ox, oz]);
            }
        }
    }

    // A turret at each corner, a little higher, battlemented or roofed as its towers are
    const turret = m(GARRISON.turret);

    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const [cx, cz] = [x * (half - turret / 2), z * (half - turret / 2)];

        solid.box(cx - turret, -m(0.6), cz - turret, cx + turret, high + m(1.2), cz + turret, stakes ? timber : stone);

        if (stakes || FORT_LOOKS[people]?.tower === "roof") {
            solid.pyramid(cx - turret - m(0.2), cz - turret - m(0.2), cx + turret + m(0.2), cz + turret + m(0.2), high + m(1.2), m(1.4), material(stuff.roof));
        } else {
            solid.box(cx - turret - m(0.1), high + m(1.2), cz - turret - m(0.1), cx + turret + m(0.1), high + m(1.7), cz + turret + m(0.1), stone);
        }
    }

    // Its gate: posts, a lintel over it, its two leaves open inwards
    for (const side of [-1, 1]) {
        solid.box(side * gate - m(0.2), -m(0.6), half - thick - m(0.1), side * gate + m(0.2), high + m(0.6), half + m(0.1), stakes ? timber : stone);
        solid.beam([side * gate, m(0.1), half - thick], [side * (gate - m(0.9)), m(0.1), half - thick - m(0.9)], m(0.08), m(2.6), material(stuff.boards), { up: [0, 0, 1] });
    }

    solid.box(-gate - m(0.2), high, half - thick - m(0.1), gate + m(0.2), high + m(0.6), half + m(0.1), stakes ? timber : stone);
    torch(solid, [gate + m(0.5), m(2.2), half + m(0.1)], [0, 1]);

    // Its barracks inside, against the back wall: walls of its timber, a roof low over them
    const [bx0, bx1, bz0, bz1] = [-half + thick + m(0.6), half - thick - m(0.6), -half + thick + m(0.2), -half + thick + m(3.6)];

    solid.box(bx0, 0, bz0, bx1, m(2.6), bz1, material(stuff.boards));
    solid.roof(bx0 - m(0.3), bz0 - m(0.3), bx1 + m(0.3), bz1 + m(0.3), m(2.6), m(1.6), { ridge: "x", hipped: true, material: material(stuff.roof) });
    solid.box(-m(0.5), 0, bz1, m(0.5), m(2), bz1 + m(0.08), timber);

}
