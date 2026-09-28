// A town's special buildings, built to the same measure as its houses and people (five world
// pixels to a metre): taverns (each its own, from its name down: house.js builds them as it does
// the houses, with their names and signs), the adventurers' guild's hall, a stone church with a
// spired tower, a blacksmith's smithy with an open forge, a market hall on columns with stalls
// beneath, a windmill, a town hall, and a capital's keep. Each is built facing south; the town
// turns it to face its street.

import { GODS } from "../../../core/lore/gods.js";
import { createRandom } from "../../../core/random.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { buildHouse, planHouse, STYLES as HOUSE_STYLES } from "./house.js";
import { emblemSignTexture, hangingSignTexture, loadSignFont, nameBoardTexture, signMaterial, TAVERN_NAME } from "./signs.js";

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

// Where the leaf of a public building's front door stands: this far in from the front of its lot
// (metres), in the middle of it (core/world.js tavernOf goes through it there)
const ENTRY = 1.8;

// The seed a landmark's look comes from: its own, or where it stands
const seedOf = (piece) => piece.seed ?? Math.round((piece.x ?? 0) * 31 + (piece.y ?? 0) * 17 + 7);

// A sign painted on both sides, hanging from an iron bracket out from a wall's face (a face as
// Solid.wall's), `u` along it, its top `top` up it: the bracket and its stay, two rings, the board
function hangingSign(solid, face, u, top, texture, name, { width = 0.8, height = 0.96, reach = 1.35 } = {}) {
    const { out } = face;
    const along = (d, v) => [face.origin[0] + face.across[0] * u + out[0] * d, face.origin[1] + v, face.origin[2] + face.across[2] * u + out[2] * d];
    const iron = material("iron");
    const picture = signMaterial(texture, name);

    solid.beam(along(0, top + m(0.1)), along(m(reach), top + m(0.1)), m(0.06), m(0.08), iron);
    solid.beam(along(0, top - m(0.55)), along(m(reach * 0.7), top + m(0.08)), m(0.04), m(0.04), iron);

    const [near, far] = [m(reach) * 0.22, m(reach) * 0.22 + m(width)];

    for (const d of [near + m(0.08), far - m(0.08)]) {
        solid.beam(along(d, top + m(0.08)), along(d, top - m(0.06)), m(0.03), m(0.03), iron);
    }

    const [bottom, upper] = [top - m(0.06) - m(height), top - m(0.06)];
    const corners = [along(near, bottom), along(far, bottom), along(far, upper), along(near, upper)];

    // (Painted on both faces, each the right way round)
    solid.face(corners, picture, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    solid.face([...corners].reverse(), picture, [[0, 1], [1, 1], [1, 0], [0, 0]]);
}

// A name board on a wall's face: `u0` to `u1` along it, `v0` to `v1` up it, in a timber frame
function nameBoard(solid, face, [u0, u1, v0, v1], texture, name, frame) {
    const { out } = face;
    const at = (u, v, d = 0) => [face.origin[0] + face.across[0] * u + out[0] * d, face.origin[1] + v, face.origin[2] + face.across[2] * u + out[2] * d];

    solid.member(at(u0 - 0.6, (v0 + v1) / 2), at(u1 + 0.6, (v0 + v1) / 2), out, v1 - v0 + 1.2, 0.45, material(frame));
    solid.facing([at(u0, v0, 0.5), at(u1, v0, 0.5), at(u1, v1, 0.5), at(u0, v1, 0.5)], out, signMaterial(texture, name), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

// The front of a house's storey (as house.js lays it out), as a face
const frontOf = (level) => ({ origin: [level.box[0], level.y, level.box[3]], across: [1, 0, 0], out: [0, 0, 1], length: level.box[1] - level.box[0] });

/**
 * A tavern (its layout piece says which: its name, the picture on its sign, how many storeys),
 * built as a house of its town is (house.js), stone, brick or timber-framed, with a wide door in
 * the middle of its front, its name on a board along the front (over the door, on one storey)
 * and its sign hanging from a bracket by the door; a lantern, and barrels and a bench outside.
 * The town's first, "Wenches and Ale", is stone below and a jettied timber-framed floor above,
 * its sign a barmaid raising two tankards.
 */
export async function tavern(piece) {
    await loadSignFont();

    const { w, h } = piece;
    const own = piece.tavern ?? { name: TAVERN_NAME, emblem: "tankard", count: 1, storeys: 2 };
    const wenches = own.name === TAVERN_NAME;
    const random = createRandom(seedOf(piece));
    const style = wenches ? "timber" : random.pick(["timber", "timber", "stone", "brick"]);
    const reveal = HOUSE_STYLES[style].reveal + 0.04;
    const [width, depth] = [w * 20, h * 20];
    const board = Math.min(m(5.6), width - m(3.2));
    const plan = planHouse({
        w,
        h,
        style,
        storeys: own.storeys,
        seed: seedOf(piece),
        x: piece.x,
        y: piece.y,
        facing: piece.facing,
        front: depth - m(ENTRY) + m(reveal),
        entrance: { width: m(1.8), height: m(2.3) },
        board,
        ground: wenches ? "stone-warm" : null,
        jettied: wenches ? true : null,
        lofty: m(own.storeys < 2 ? 4 : 3.2),
    });
    const solid = buildHouse(plan);
    const oak = plan.frame ?? "timber";
    const ground = plan.levels[0];
    const face = frontOf(ground);
    const middle = face.length / 2;
    const boardHeight = (board * 9) / 56;

    // The name: along the upper floor's front, or over the door
    if (plan.levels.length > 1) {
        const level = plan.levels[1];
        const v0 = Math.min(level.height - boardHeight - m(0.35), m(1.05));

        nameBoard(solid, frontOf(level), [middle - board / 2, middle + board / 2, v0, v0 + boardHeight], nameBoardTexture({ name: own.name }), `board ${own.name}`, oak);
    } else {
        const small = Math.min(board, m(4.4));
        const v0 = m(2.55);

        nameBoard(solid, face, [middle - small / 2, middle + small / 2, v0, v0 + Math.min((small * 9) / 56, ground.height - v0 - m(0.2))], nameBoardTexture({ name: own.name }), `board ${own.name}`, oak);
    }

    // The sign, hanging by the door out over the street, and a lantern on the other side (on one
    // storey, past the ends of the name board)
    const aside = plan.levels.length > 1 ? m(1.9) : Math.min(board, m(4.4)) / 2 + m(0.55);
    const texture = wenches ? hangingSignTexture() : emblemSignTexture({ name: own.name, emblem: own.emblem, count: own.count, tint: seedOf(piece) % 6 });

    hangingSign(solid, face, middle + aside, Math.min(m(3.2), ground.height - m(0.1)), texture, `sign ${own.name}`, { width: 1, height: 1.2 });

    const lantern = [face.origin[0] + middle - aside + m(0.45), m(2.2), face.origin[2] + m(0.22)];

    solid.beam([lantern[0], lantern[1] + m(0.35), face.origin[2]], [lantern[0], lantern[1] + m(0.35), lantern[2]], m(0.04), m(0.04), material("iron"));
    solid.box(lantern[0] - m(0.12), lantern[1] - m(0.18), lantern[2] - m(0.12), lantern[0] + m(0.12), lantern[1] + m(0.18), lantern[2] + m(0.12), material("glass-lit"));
    solid.box(lantern[0] - m(0.15), lantern[1] + m(0.18), lantern[2] - m(0.15), lantern[0] + m(0.15), lantern[1] + m(0.26), lantern[2] + m(0.15), material("iron"));

    // Barrels at one side of the door, a bench at the other
    const street = face.origin[2] + m(0.45);

    barrel(solid, face.origin[0] + middle + m(1.2), street);
    barrel(solid, face.origin[0] + middle + m(1.2) + m(0.62), street + m(0.05));
    solid.box(face.origin[0] + middle - m(2.9), m(0.42), face.origin[2] + m(0.15), face.origin[0] + middle - m(1.5), m(0.48), face.origin[2] + m(0.5), material("planks"));

    for (const x of [middle - m(2.75), middle - m(1.65)]) {
        solid.box(face.origin[0] + x - m(0.05), 0, face.origin[2] + m(0.2), face.origin[0] + x + m(0.05), m(0.42), face.origin[2] + m(0.45), material("timber"));
    }

    return solid.toObject();
}

/**
 * The adventurers' guild: a big hall of stone, brick or timber, two storeys, its wide door in the
 * middle of its front under its name on a board, its crest (a shield over crossed swords) hanging
 * by the door, banners either side, and a board of notices outside.
 */
export async function guild(piece) {
    await loadSignFont();

    const { w, h } = piece;
    const random = createRandom(seedOf(piece));
    const style = random.pick(["stone", "timber", "brick"]);
    const reveal = HOUSE_STYLES[style].reveal + 0.04;
    const [width, depth] = [w * 20, h * 20];
    const board = Math.min(m(7), width - m(4));
    const plan = planHouse({
        w,
        h,
        style,
        storeys: 2,
        seed: seedOf(piece),
        x: piece.x,
        y: piece.y,
        facing: piece.facing,
        front: depth - m(ENTRY) + m(reveal),
        entrance: { width: m(2.2), height: m(2.6) },
        board,
        jettied: false,
    });
    const solid = buildHouse(plan);
    const ground = plan.levels[0];
    const face = frontOf(ground);
    const middle = face.length / 2;
    const level = plan.levels[1];
    const boardHeight = (board * 9) / 56;
    const v0 = Math.min(level.height - boardHeight - m(0.3), m(0.9));

    nameBoard(solid, frontOf(level), [middle - board / 2, middle + board / 2, v0, v0 + boardHeight], nameBoardTexture({ name: "Adventurers' Guild", ground: "#1f3552", dark: "#0e1a2a" }), "board guild", plan.frame ?? "timber");
    hangingSign(solid, face, middle + m(2.2), m(3.1), emblemSignTexture({ name: "Adventurers' Guild", emblem: "shield", tint: 2 }), "sign guild");

    // Banners in the guild's blue and gold, hanging from poles either side of the door
    for (const side of [-1, 1]) {
        const u = middle + side * m(1.9);
        const at = (d, v) => [face.origin[0] + u + d, v, face.origin[2] + m(0.25)];

        solid.beam([face.origin[0] + u - m(0.45), m(3.6), face.origin[2]], [face.origin[0] + u - m(0.45), m(3.6), face.origin[2] + m(0.3)], m(0.05), m(0.05), material("iron"));
        solid.beam(at(-m(0.45), m(3.6)), at(m(0.45), m(3.6)), m(0.06), m(0.06), material("timber"));

        const cloth = [at(-m(0.4), m(3.55)), at(m(0.4), m(3.55)), at(m(0.4), m(1.9)), at(0, m(1.65)), at(-m(0.4), m(1.9))];

        solid.facing(cloth, [0, 0, 1], material("paint-blue"));
        solid.facing(cloth, [0, 0, -1], material("paint-blue"));
        solid.facing([at(-m(0.1), m(3.1)), at(m(0.1), m(3.1)), at(m(0.1), m(2.3)), at(-m(0.1), m(2.3))].map(([x, y, z]) => [x, y, z + 0.1]), [0, 0, 1], material("gold"));
    }

    // A board of notices on two posts beside the door, papers pinned to it
    const nx = face.origin[0] + middle - m(4.1);
    const nz = face.origin[2] + m(0.9);

    for (const dx of [-m(0.7), m(0.7)]) {
        solid.beam([nx + dx, 0, nz], [nx + dx, m(2), nz], m(0.1), m(0.1), material("timber"), { up: [0, 0, 1] });
    }

    solid.box(nx - m(0.8), m(1), nz - m(0.03), nx + m(0.8), m(1.9), nz + m(0.03), material("planks"));
    solid.box(nx - m(0.9), m(1.9), nz - m(0.12), nx + m(0.9), m(1.98), nz + m(0.12), material("shingles"));

    for (let k = 0; k < 6; k++) {
        const [px, py] = [nx - m(0.6) + (k % 3) * m(0.55) + random.range(-1, 1), m(1.12) + Math.floor(k / 3) * m(0.38) + random.range(-0.5, 0.5)];

        solid.face([[px, py, nz + m(0.04)], [px + m(0.3), py, nz + m(0.04)], [px + m(0.3), py + m(0.3), nz + m(0.04)], [px, py + m(0.3), nz + m(0.04)]], material("paint-cream"));
    }

    return solid.toObject();
}

// Each of the Six's emblem (emblems.js), for their churches' signs
const GOD_EMBLEMS = Object.freeze({ aurelia: "sun", brannoc: "stag", ithriel: "star", morvaine: "lantern", seliane: "rose", dunmar: "anvil" });

/**
 * The church: a stone nave, buttressed, with tall windows, and a tower with a spire at the front,
 * the Six's sun of six rays on its top; its patron's (core/lore/gods.js) sign by the door.
 */
export async function church(piece) {
    await loadSignFont();

    const { w, h } = piece;
    const patron = GODS[piece.patron] ?? GODS.aurelia;
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

    // The Six's gilded sun on the spire: six rays round a disc, on a rod
    const apex = top + m(7.5);
    const [sx, sy, sz] = [width / 2, apex + m(0.95), (tz0 + tz1) / 2];
    const gilt = material("gold");

    solid.beam([sx, apex - 1, sz], [sx, sy, sz], m(0.08), m(0.08), gilt);

    for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2 + Math.PI / 2;

        solid.beam([sx, sy, sz], [sx + Math.cos(angle) * m(0.6), sy + Math.sin(angle) * m(0.6), sz], m(0.07), m(0.05), gilt);
    }

    const disc = Array.from({ length: 12 }, (_, k) => [sx + Math.cos((k / 12) * Math.PI * 2) * m(0.26), sy + Math.sin((k / 12) * Math.PI * 2) * m(0.26), sz + m(0.04)]);

    solid.face(disc, gilt);
    solid.face([...disc].reverse().map(([x, y, z]) => [x, y, z - m(0.08)]), gilt);

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

    // The patron's sign by the door
    const front = { origin: [0, 0, tz1 + 0.4], across: [1, 0, 0], out: [0, 0, 1], length: width };

    hangingSign(solid, front, middle + m(1.9), m(3.3), emblemSignTexture({ name: `${patron.name} ${patron.title}`, emblem: GOD_EMBLEMS[piece.patron] ?? "sun", tint: 2 + Object.keys(GODS).indexOf(piece.patron) }), `sign ${patron.name}`);

    return solid.toObject();
}

/**
 * The smithy: a stone workshop, its sign (an anvil and hammer) hanging by the door, and beside
 * it an open shed over the forge, anvil and trough.
 */
export async function blacksmith(piece) {
    await loadSignFont();

    const { w, h } = piece;
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
    hangingSign(solid, { origin: [x0, 0, z1], across: [1, 0, 0], out: [0, 0, 1], length: x1 - x0 }, m(5), m(3), emblemSignTexture({ name: "Blacksmith", emblem: "anvil", tint: seedOf(piece) % 6 }), "sign blacksmith");

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

/**
 * A town hall: the town's biggest house near the market, made over (setpieces/town.js), in its
 * street's look: a wide door in the middle of its front up a step, "Town Hall" on a board over
 * it, a sign of the keys of the town, and lanterns either side of the door.
 */
export async function hall(piece) {
    await loadSignFont();

    const { w, h } = piece;
    // (In its street's look, but never a cottage's: a hall has a storey above for its board)
    const style = HOUSE_STYLES[piece.style] && HOUSE_STYLES[piece.style].storeys > 1 ? piece.style : piece.style === "cottage" ? "timber" : "stone";
    const reveal = HOUSE_STYLES[style].reveal + 0.04;
    const [width, depth] = [w * 20, h * 20];
    const board = Math.min(m(5.5), width - m(3));
    const plan = planHouse({
        w,
        h,
        style,
        storeys: Math.max(2, piece.storeys ?? 2),
        seed: seedOf(piece),
        x: piece.x,
        y: piece.y,
        facing: piece.facing,
        front: depth - m(ENTRY) + m(reveal),
        entrance: { width: m(2), height: m(2.5) },
        board,
        jettied: false,
    });
    const solid = buildHouse(plan);
    const ground = plan.levels[0];
    const face = frontOf(ground);
    const middle = face.length / 2;
    const level = plan.levels[1];
    const boardHeight = (board * 9) / 56;
    const v0 = Math.min(level.height - boardHeight - m(0.3), m(0.9));

    nameBoard(solid, frontOf(level), [middle - board / 2, middle + board / 2, v0, v0 + boardHeight], nameBoardTexture({ name: "Town Hall", ground: "#4a1c1c", dark: "#260c0c" }), "board hall", plan.frame ?? "timber");
    hangingSign(solid, face, middle + m(1.9), m(3), emblemSignTexture({ name: "Town Hall", emblem: "keys", tint: seedOf(piece) % 6 }), "sign hall");

    // A stone step before the door, and a lantern on an iron arm either side of it
    const [x0, z] = [face.origin[0] + middle, face.origin[2]];

    solid.box(x0 - m(1.5), 0, z, x0 + m(1.5), m(0.3), z + m(0.8), material("stone"));

    for (const side of [-1, 1]) {
        const x = x0 + side * m(1.5);

        solid.beam([x, m(2.6), z], [x, m(2.6), z + m(0.45)], m(0.05), m(0.05), material("iron"));
        solid.box(x - m(0.14), m(2.15), z + m(0.3), x + m(0.14), m(2.55), z + m(0.58), material("iron"));
        solid.box(x - m(0.1), m(2.2), z + m(0.34), x + m(0.1), m(2.5), z + m(0.54), material("glass-lit"));
    }

    return solid.toObject();
}

/**
 * A capital's keep: its biggest house near the market made over (setpieces/town.js) into a
 * great stone tower, battlemented, with a turret at each corner under a cone of slate, a hipped
 * roof within the battlements, windows in rows, and a door in the middle of its front up two
 * steps, under the crown's sign, between two long banners.
 */
export async function keep(piece) {
    await loadSignFont();

    const solid = new Solid();
    const random = createRandom(seedOf(piece));
    const stone = random.pick(["stone", "stone-warm", "stone-dark"]);
    const roof = random.pick(["slate", "slate-grey"]);
    const s = material(stone);
    const [width, depth] = [piece.w * 20, piece.h * 20];
    const [x0, x1, z0, z1] = [m(0.7), width - m(0.7), m(0.7), depth - m(KEEP_ENTRY)];
    const height = m(11 + Math.min(piece.w, piece.h) * 0.8);
    const turret = m(1.4);
    const merlon = m(0.5);
    const mid = (x0 + x1) / 2;

    // The mass: a battered plinth, the tower, the battlements round its top
    solid.box(x0 - m(0.3), 0, z0 - m(0.3), x1 + m(0.3), m(1), z1 + m(0.3), s);
    solid.box(x0, m(1), z0, x1, height, z1, s);
    solid.box(x0 - m(0.2), height, z0 - m(0.2), x1 + m(0.2), height + m(0.35), z1 + m(0.2), s);

    const teeth = (ax, az, bx, bz) => {
        const length = Math.hypot(bx - ax, bz - az);
        const count = Math.max(2, Math.round(length / (merlon * 2.2)));

        for (let k = 0; k < count; k++) {
            const t = (k + 0.5) / count;
            const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];

            solid.box(x - merlon / 2, height + m(0.35), z - merlon / 2, x + merlon / 2, height + m(1.2), z + merlon / 2, s);
        }
    };

    teeth(x0, z0, x1, z0);
    teeth(x0, z1, x1, z1);
    teeth(x0, z0, x0, z1);
    teeth(x1, z0, x1, z1);
    solid.roof(x0 + m(1.2), z0 + m(1.2), x1 - m(1.2), z1 - m(1.2), height + m(0.35), Math.min(x1 - x0, z1 - z0) * 0.4, { ridge: x1 - x0 >= z1 - z0 ? "x" : "z", hipped: true, material: material(roof) });

    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        solid.cylinder(x, z, m(1), height + m(2.2), turret, turret, s, { segments: 14 });
        solid.cone(x, z, height + m(2.2), m(3.2), turret + m(0.35), material(roof), 14);
    }

    // Windows: arrow slits low down, taller lights above, on every face
    const slitsAlong = (face, from, to, fixed) => {
        for (let u = from + m(2); u < to - m(1.6); u += m(2.4)) {
            for (const [y, tall] of [[m(4.2), m(1.2)], [height * 0.62, m(1.8)], [height * 0.82, m(1.4)]]) {
                if (face === "front" && Math.abs(u - mid) < m(2.6) && y < m(6.5)) {
                    continue;
                }

                if (face === "front") {
                    solid.box(u - m(0.25), y, fixed, u + m(0.25), y + tall, fixed + 0.6, material("shadow"));
                } else if (face === "back") {
                    solid.box(u - m(0.25), y, fixed - 0.6, u + m(0.25), y + tall, fixed, material("shadow"));
                } else {
                    solid.box(fixed - 0.3, y, u - m(0.25), fixed + 0.3, y + tall, u + m(0.25), material("shadow"));
                }
            }
        }
    };

    slitsAlong("front", x0, x1, z1);
    slitsAlong("back", x0, x1, z0);
    slitsAlong("left", z0, z1, x0);
    slitsAlong("right", z0, z1, x1);

    // The door: an arch of dressed stone, the leaf, and two steps up to it
    const [dw, dh, floor] = [m(KEEP_DOOR.width), m(KEEP_DOOR.height), m(KEEP_DOOR.floor)];

    solid.box(mid - dw / 2 - m(0.4), floor - m(0.1), z1, mid + dw / 2 + m(0.4), floor + dh + m(0.5), z1 + m(0.25), material("stone-warm"));
    solid.box(mid - dw / 2, floor, z1 + m(0.25), mid + dw / 2, floor + dh, z1 + m(0.35), material("planks-dark"));
    solid.box(mid - m(0.06), floor, z1 + m(0.35), mid + m(0.06), floor + dh, z1 + m(0.4), material("iron"));
    solid.box(mid - dw / 2 - m(0.6), 0, z1, mid + dw / 2 + m(0.6), m(0.4), z1 + m(1.2), material(stone));
    solid.box(mid - dw / 2 - m(0.4), m(0.4), z1, mid + dw / 2 + m(0.4), floor, z1 + m(0.6), material(stone));

    // Long banners either side of the door, and the crown's sign over it
    for (const side of [-1, 1]) {
        const x = mid + side * m(3.2);

        solid.box(x - m(0.55), m(3.4), z1, x + m(0.55), height * 0.72, z1 + m(0.12), material("banner"));
        solid.box(x - m(0.2), height * 0.6, z1 + m(0.12), x + m(0.2), height * 0.66, z1 + m(0.16), material("gold"));
    }

    const face = { origin: [x0, 0, z1 + m(0.25)], across: [1, 0, 0], out: [0, 0, 1], length: x1 - x0 };

    hangingSign(solid, face, mid - x0 + m(1.9), m(4.6), emblemSignTexture({ name: "The Keep", emblem: "crown", tint: seedOf(piece) % 6 }), "sign keep");

    return solid.toObject();
}

// Where a keep's door stands: this far in from the front of its lot (metres), and its size and sill
const KEEP_ENTRY = 1.4;
const KEEP_DOOR = Object.freeze({ width: 2.4, height: 3.2, floor: 0.8 });

/** Every special building, by name (setpieces/pieces.js LANDMARKS). */
export const LANDMARK_BUILDERS = Object.freeze({ tavern, church, blacksmith, guild, market, windmill, hall, keep });

/** A town's special building (its layout piece), filling its footprint. */
export function landmark(piece) {
    return LANDMARK_BUILDERS[piece.name](piece);
}
