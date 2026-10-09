// A town's special buildings, built to the same measure as its houses and people (five world
// pixels to a metre): taverns (each its own, from its name down: house.js builds them as it does
// the houses, with their names and signs), the adventurers' guild's hall, a stone church as big as
// its place (church.js), a blacksmith's smithy with an open forge, a market hall on columns with stalls
// beneath, a windmill, a town hall, a capital's keep, a barracks, and the specialists' and masters'
// shops (shopfront.js). Each is built facing south;
// the town turns it to face its street.

import { GODS } from "../../../core/lore/gods.js";
import { createRandom } from "../../../core/random.js";
import { flagpole } from "../../cloth.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { churchBody } from "./church.js";
import { buildHouse, planHouse, STYLES as HOUSE_STYLES } from "./house.js";
import { emblemSignTexture, hangingSignTexture, loadSignFont, nameBoardTexture, signMaterial, TAVERN_NAME } from "./signs.js";
import { dressShop, SHOP_NAMES, SHOPFRONTS } from "./shopfront.js";
import { fireLight, lanternLight, torch } from "./torches.js";

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
// Solid.wall's), `u` along it, its top `top` up it: the bracket and its stay, two rings, the board.
// The stay ties the bracket up to the wall above it (`above` metres, where there's that much wall),
// or else props it from below short of the board, never across the board
function hangingSign(solid, face, u, top, texture, name, { width = 0.8, height = 0.96, reach = 1.35, above = 0.5 } = {}) {
    const { out } = face;
    const along = (d, v) => [face.origin[0] + face.across[0] * u + out[0] * d, face.origin[1] + v, face.origin[2] + face.across[2] * u + out[2] * d];
    const iron = material("iron");
    const picture = signMaterial(texture, name);
    const [near, far] = [m(reach) * 0.22, m(reach) * 0.22 + m(width)];

    solid.beam(along(0, top + m(0.1)), along(m(reach), top + m(0.1)), m(0.06), m(0.08), iron);

    if (above >= 0.3) {
        solid.beam(along(0, top + m(above)), along(m(reach * 0.7), top + m(0.14)), m(0.04), m(0.04), iron);
    } else {
        solid.beam(along(0, top - m(0.45)), along(near - m(0.06), top + m(0.06)), m(0.04), m(0.04), iron);
    }

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

    const top = Math.min(m(3.2), ground.height - m(0.1));

    hangingSign(solid, face, middle + aside, top, texture, `sign ${own.name}`, { width: 1, height: 1.2, above: plan.levels.length > 1 ? 0.5 : (ground.height - top) / m(1) - 0.05 });

    const lantern = [face.origin[0] + middle - aside + m(0.45), m(2.2), face.origin[2] + m(0.22)];

    solid.beam([lantern[0], lantern[1] + m(0.35), face.origin[2]], [lantern[0], lantern[1] + m(0.35), lantern[2]], m(0.04), m(0.04), material("iron"));
    solid.box(lantern[0] - m(0.12), lantern[1] - m(0.18), lantern[2] - m(0.12), lantern[0] + m(0.12), lantern[1] + m(0.18), lantern[2] + m(0.12), material("glass-lit"));
    solid.box(lantern[0] - m(0.15), lantern[1] + m(0.18), lantern[2] - m(0.15), lantern[0] + m(0.15), lantern[1] + m(0.26), lantern[2] + m(0.15), material("iron"));
    lanternLight(solid, lantern);

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
    // (Its sign beyond the banner on that side, not through it)
    hangingSign(solid, face, middle + m(2.9), m(3.1), emblemSignTexture({ name: "Adventurers' Guild", emblem: "shield", tint: 2 }), "sign guild");

    // Banners in the guild's blue and gold, hanging from poles either side of the door
    for (const side of [-1, 1]) {
        const u = middle + side * m(1.9);
        const at = (d, v) => [face.origin[0] + u + d, v, face.origin[2] + m(0.25)];

        solid.beam([face.origin[0] + u - m(0.45), m(3.6), face.origin[2]], [face.origin[0] + u - m(0.45), m(3.6), face.origin[2] + m(0.3)], m(0.05), m(0.05), material("iron"));
        solid.beam(at(-m(0.45), m(3.6)), at(m(0.45), m(3.6)), m(0.06), m(0.06), material("timber"));

        const cloth = [at(-m(0.4), m(3.55)), at(m(0.4), m(3.55)), at(m(0.4), m(1.9)), at(0, m(1.65)), at(-m(0.4), m(1.9))];

        solid.facing(cloth, [0, 0, 1], material("paint-blue"));
        solid.facing(cloth, [0, 0, -1], material("paint-blue"));
        solid.facing([at(-m(0.1), m(3.1)), at(m(0.1), m(3.1)), at(m(0.1), m(2.3)), at(-m(0.1), m(2.3))].map(([x, y, z]) => [x, y, z + 0.1]), [0, 0, 1], material("cloth-gold"));
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
 * The church: built to its grade's grammar (church.js: a village's Romanesque parish church, a
 * town's aisled church, Romanesque or Gothic, a city's Gothic minster), the Six's gilded sun of
 * six rays on its spire; its door in its portal, and its patron's (core/lore/gods.js) sign by it.
 */
export async function church(piece) {
    await loadSignFont();

    const { w, h } = piece;
    const patron = GODS[piece.patron] ?? GODS.aurelia;
    const solid = new Solid();
    const [width, depth] = [w * 20, h * 20];
    const { door: way, sign, apex } = churchBody(solid, piece, width, depth);

    // The Six's gilded sun on the spire: six rays round a disc, on a rod
    const [sx, sy, sz] = [apex[0], apex[1] + m(0.95), apex[2]];
    const gilt = material("gold");

    solid.beam([sx, apex[1] - 1, sz], [sx, sy, sz], m(0.08), m(0.08), gilt);

    for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2 + Math.PI / 2;

        solid.beam([sx, sy, sz], [sx + Math.cos(angle) * m(0.6), sy + Math.sin(angle) * m(0.6), sz], m(0.07), m(0.05), gilt);
    }

    const disc = Array.from({ length: 12 }, (_, k) => [sx + Math.cos((k / 12) * Math.PI * 2) * m(0.26), sy + Math.sin((k / 12) * Math.PI * 2) * m(0.26), sz + m(0.04)]);

    solid.face(disc, gilt);
    solid.face([...disc].reverse().map(([x, y, z]) => [x, y, z - m(0.08)]), gilt);

    // The door in its portal, and the patron's sign by it
    door(solid, way.x, way.z + 0.4, { width: 1.6, height: 2.6, floor: way.floor, frame: "iron" });

    const front = { origin: [0, 0, sign.z], across: [1, 0, 0], out: [0, 0, 1], length: width };

    // (On a shorter bracket than most, out from a buttress's face over the street)
    hangingSign(solid, front, sign.u, sign.top, emblemSignTexture({ name: `${patron.name} ${patron.title}`, emblem: GOD_EMBLEMS[piece.patron] ?? "sun", tint: 2 + Object.keys(GODS).indexOf(piece.patron) }), `sign ${patron.name}`, { reach: 1 });

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
    hangingSign(solid, { origin: [x0, 0, z1], across: [1, 0, 0], out: [0, 0, 1], length: x1 - x0 }, m(5), m(3), emblemSignTexture({ name: "Blacksmith", emblem: "anvil", tint: seedOf(piece) % 6 }), "sign blacksmith", { above: 0.35 });

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
    fireLight(solid, [x1 + m(0.75), m(1.02), (fz0 + fz1) / 2], "brazier");
    solid.box(x1, m(0.95), fz0, x1 + m(1.2), m(7.2), fz0 + m(1.1), material("stone-dark"));
    // (Its fire's always lit: its smoke thicker than a hearth's, smoke.js)
    (solid.smoke ??= []).push([x1 + m(0.6), m(7.25), fz0 + m(0.55), 1.4]);

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
        lanternLight(solid, [x, m(2.35), z + m(0.44)]);
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

    // (The crown's flags flying from its two front turrets: world/cloth.js)
    for (const x of [x0, x1]) {
        flagpole(solid, [x, height + m(5), z1], m(2.8), "human", { radius: m(0.05), length: m(3), drop: m(1) });
    }

    // Windows: arrow slits low down, taller lights above, on every face
    const slitsAlong = (face, from, to, fixed) => {
        for (let u = from + m(2); u < to - m(1.6); u += m(2.4)) {
            for (const [y, tall] of [[m(4.2), m(1.2)], [height * 0.62, m(1.8)], [height * 0.82, m(1.4)]]) {
                // (Clear of the door, and of the banners either side of it)
                if (face === "front" && ((Math.abs(u - mid) < m(2.6) && y < m(6.5)) || (Math.abs(Math.abs(u - mid) - m(3.2)) < m(0.9) && y + tall > m(3.4) && y < height * 0.72))) {
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

    // A torch either side of it, lit at night (kits/torches.js)
    for (const side of [-1, 1]) {
        torch(solid, [mid + side * (dw / 2 + m(1.1)), floor + m(2.1), z1], [0, 1]);
    }

    // Long banners either side of the door (the crown's, stirring in the breeze: world/cloth.js),
    // and the crown's sign over it
    for (const side of [-1, 1]) {
        (solid.cloth ??= []).push({ at: [mid + side * m(3.2), height * 0.72, z1 + m(0.06)], out: [0, 0, 1], width: m(1.1), drop: height * 0.72 - m(3.4), kind: "wall", look: "human" });
    }

    // (Its sign by the door, from the wall beside the doorway's surround)
    const face = { origin: [x0, 0, z1], across: [1, 0, 0], out: [0, 0, 1], length: x1 - x0 };

    hangingSign(solid, face, mid - x0 + m(1.9), m(4.6), emblemSignTexture({ name: "The Keep", emblem: "crown", tint: seedOf(piece) % 6 }), "sign keep");

    return solid.toObject();
}

/**
 * A barracks (a village's guardhouse): the biggest house out towards its town's edge, made over
 * (setpieces/town.js), in its street's look (but stone where it was a cottage): a door in the
 * middle of its front up a step, "Barracks" (or "Guardhouse") on a board over it, or along the
 * floor above, a sign of a shield by it, a torch either side of it, and outside a rack of the
 * garrison's spears against the wall and a straw man on a post to practise on.
 */
export async function barracks(piece) {
    await loadSignFont();

    const { w, h } = piece;
    const name = piece.grade === "guardhouse" ? "Guardhouse" : "Barracks";
    const style = HOUSE_STYLES[piece.style] && piece.style !== "cottage" ? piece.style : "stone";
    const reveal = HOUSE_STYLES[style].reveal + 0.04;
    const [width, depth] = [w * 20, h * 20];
    const board = Math.min(m(4.6), width - m(3.2));
    const storeys = piece.storeys ?? 1;
    const plan = planHouse({
        w,
        h,
        style,
        storeys,
        seed: seedOf(piece),
        x: piece.x,
        y: piece.y,
        facing: piece.facing,
        front: depth - m(ENTRY) + m(reveal),
        entrance: { width: m(1.8), height: m(2.4) },
        board,
        jettied: false,
        lofty: m(storeys < 2 ? 4 : 3.2),
    });
    const solid = buildHouse(plan);
    const oak = plan.frame ?? "timber";
    const ground = plan.levels[0];
    const face = frontOf(ground);
    const middle = face.length / 2;
    const boardHeight = (board * 9) / 56;
    const texture = nameBoardTexture({ name, ground: "#3a2a1a", dark: "#1c120a" });

    // Its name: along the floor above, or over the door
    if (plan.levels.length > 1) {
        const level = plan.levels[1];
        const v0 = Math.min(level.height - boardHeight - m(0.35), m(1.05));

        nameBoard(solid, frontOf(level), [middle - board / 2, middle + board / 2, v0, v0 + boardHeight], texture, `board ${name}`, oak);
    } else {
        const small = Math.min(board, m(4));
        const v0 = m(2.6);

        nameBoard(solid, face, [middle - small / 2, middle + small / 2, v0, v0 + Math.min((small * 9) / 56, ground.height - v0 - m(0.2))], texture, `board ${name}`, oak);
    }

    // Its sign by the door (past the board's end, on one storey), and a torch either side of it
    const aside = plan.levels.length > 1 ? m(1.9) : Math.min(board, m(4)) / 2 + m(0.55);
    const top = Math.min(m(3.2), ground.height - m(0.1));

    hangingSign(solid, face, middle + aside, top, emblemSignTexture({ name, emblem: "shield", tint: seedOf(piece) % 6 }), `sign ${name}`, { width: 1, height: 1.2, above: plan.levels.length > 1 ? 0.5 : (ground.height - top) / m(1) - 0.05 });

    // Shields hung along its front between the windows, clear of the door's torches and its sign:
    // painted, a band across each, a boss in its middle
    const openings = (plan.openings.front[0] ?? []).map(({ u0, u1 }) => [u0 - m(0.1), u1 + m(0.1)]);
    const colours = ["paint-red", "paint-blue", "paint-green"];
    const at = (u, v, out = m(0.08)) => [face.origin[0] + u, v, face.origin[2] + out];
    let hung = 0;

    for (let u = m(0.9); u < face.length - m(0.9) && hung < 4; u += m(0.3)) {
        const clear = Math.abs(u - middle) > m(1.75) && Math.abs(u - middle - aside) > m(0.95) && openings.every(([a, b]) => u + m(0.36) < a || u - m(0.36) > b);

        if (!clear) {
            continue;
        }

        const v = Math.min(m(2.2), ground.height - m(0.6));
        const paint = material(colours[(hung + seedOf(piece)) % colours.length]);

        solid.facing([at(u - m(0.32), v + m(0.35)), at(u - m(0.32), v), at(u - m(0.18), v - m(0.3)), at(u, v - m(0.45)), at(u + m(0.18), v - m(0.3)), at(u + m(0.32), v), at(u + m(0.32), v + m(0.35))], [0, 0, 1], paint);
        solid.box(face.origin[0] + u - m(0.32), v + m(0.02), face.origin[2] + m(0.08), face.origin[0] + u + m(0.32), v + m(0.14), face.origin[2] + m(0.1), material("paint-cream"));
        solid.box(face.origin[0] + u - m(0.08), v - m(0.22), face.origin[2] + m(0.08), face.origin[0] + u + m(0.08), v - m(0.06), face.origin[2] + m(0.16), material("iron"));
        hung++;
        u += m(1);
    }

    const [x0, z] = [face.origin[0] + middle, face.origin[2]];

    for (const side of [-1, 1]) {
        torch(solid, [x0 + side * m(1.3), m(2.3), z], [0, 1]);
    }

    solid.box(x0 - m(1.2), 0, z, x0 + m(1.2), m(0.3), z + m(0.6), material("stone"));

    // The spears racked against the wall on one side, a butt to shoot at on the other
    const rack = x0 - m(2.6);

    solid.box(rack - m(0.8), m(0.3), z + m(0.05), rack + m(0.8), m(0.4), z + m(0.35), material("timber"));
    solid.box(rack - m(0.8), m(1.35), z + m(0.05), rack + m(0.8), m(1.45), z + m(0.25), material("timber"));

    for (let k = 0; k < 6; k++) {
        const x = rack - m(0.65) + k * m(0.26);

        solid.cylinder(x, z + m(0.2), m(0.3), m(2.3), m(0.025), m(0.025), material("timber-light"), { segments: 5 });
        solid.cylinder(x, z + m(0.2), m(2.3), m(2.55), m(0.045), 0, material("iron"), { segments: 5 });
    }

    // (The butt: a round of straw on three legs, facing the street, its rings painted on it)
    const [bx, bz] = [x0 + m(2.8), z + m(0.75)];
    const ring = (r, out, name) => solid.facing(Array.from({ length: 14 }, (_, k) => [bx + Math.cos((k * Math.PI * 2) / 14) * r, m(1.15) + Math.sin((k * Math.PI * 2) / 14) * r, bz + out]), [0, 0, 1], material(name));

    for (const [dx, dz] of [[-0.35, -0.1], [0.35, -0.1], [0, -0.55]]) {
        solid.beam([bx + m(dx), 0, bz + m(dz)], [bx + m(dx) * 0.2, m(1.2), bz - m(0.08)], m(0.04), m(0.04), material("timber"));
    }

    solid.cylinder(bx, bz - m(0.12), m(0.7), m(1.6), m(0.06), m(0.06), material("thatch"), { segments: 6 });
    ring(m(0.48), 0, "thatch");
    ring(m(0.38), m(0.01), "paint-cream");
    ring(m(0.28), m(0.02), "paint-red");
    ring(m(0.17), m(0.03), "paint-cream");
    ring(m(0.08), m(0.04), "paint-gold");

    return solid.toObject();
}

/**
 * A specialist's or a master's shop (shopfront.js SHOPFRONTS: a swordsmith's, an armorer's, an
 * occult scriptorium, an alchemist's; the Master Swordsmith's, the Master Armorer's, the Mystic
 * Emporium): the house it was, made over, its name along the floor above (or over the door), its
 * sign by the door, a striped awning over the window either side, and what it sells set out
 * before it (dressShop).
 */
export async function shop(piece) {
    await loadSignFont();

    const front = SHOPFRONTS[piece.name];
    const { w, h } = piece;
    const style = HOUSE_STYLES[piece.style] ? piece.style : "timber";
    const reveal = HOUSE_STYLES[style].reveal + 0.04;
    const [width, depth] = [w * 20, h * 20];
    const board = Math.min(m(front.name.length > 12 ? 5.4 : 4.4), width - m(3.2));
    const storeys = piece.storeys ?? 1;
    const plan = planHouse({
        w,
        h,
        style,
        storeys,
        seed: seedOf(piece),
        x: piece.x,
        y: piece.y,
        facing: piece.facing,
        front: depth - m(ENTRY) + m(reveal),
        entrance: { width: m(1.6), height: m(2.3) },
        board,
        jettied: false,
        lofty: m(storeys < 2 ? 4 : 3.2),
    });
    const solid = buildHouse(plan);
    const oak = plan.frame ?? "timber";
    const ground = plan.levels[0];
    const face = frontOf(ground);
    const middle = face.length / 2;
    const boardHeight = (board * 9) / 56;
    const texture = nameBoardTexture({ name: front.name, ground: front.ground, dark: front.dark });

    // Its name: along the floor above, or over the door
    if (plan.levels.length > 1) {
        const level = plan.levels[1];
        const v0 = Math.min(level.height - boardHeight - m(0.35), m(1.05));

        nameBoard(solid, frontOf(level), [middle - board / 2, middle + board / 2, v0, v0 + boardHeight], texture, `board ${piece.name}`, oak);
    } else {
        const small = Math.min(board, m(4));
        const v0 = m(2.6);

        nameBoard(solid, face, [middle - small / 2, middle + small / 2, v0, v0 + Math.min((small * 9) / 56, ground.height - v0 - m(0.2))], texture, `board ${piece.name}`, oak);
    }

    const aside = plan.levels.length > 1 ? m(1.6) : Math.min(board, m(4)) / 2 + m(0.55);
    const top = Math.min(m(3.2), ground.height - m(0.1));

    hangingSign(solid, face, middle + aside, top, emblemSignTexture({ name: front.name, emblem: front.emblem, tint: front.tint }), `sign ${piece.name}`, { width: 0.9, height: 1.08, above: plan.levels.length > 1 ? 0.5 : (ground.height - top) / m(1) - 0.05 });

    // A striped awning over each window of the ground floor, clear of the door (a master's shop
    // has banners instead)
    const [x0, z] = [face.origin[0] + middle, face.origin[2]];
    const stripes = ["awning", "paint-cream"];

    for (const { u0, u1 } of front.master ? [] : (plan.openings.front[0] ?? [])) {
        if (Math.abs((u0 + u1) / 2 - middle) < m(1.2) || u1 - u0 > m(2)) {
            continue;
        }

        const [a, b] = [face.origin[0] + u0 - m(0.15), face.origin[0] + u1 + m(0.15)];
        const [high, low, out] = [Math.min(ground.height - m(0.2), m(2.55)), Math.min(ground.height - m(0.2), m(2.55)) - m(0.45), m(0.8)];
        const count = Math.max(2, Math.round((b - a) / m(0.3)));

        for (let k = 0; k < count; k++) {
            const [s0, s1] = [a + ((b - a) * k) / count, a + ((b - a) * (k + 1)) / count];
            const strip = [[s0, high, z + m(0.02)], [s1, high, z + m(0.02)], [s1, low, z + out], [s0, low, z + out]];

            solid.facing(strip, [0, 0.85, 0.5], material(stripes[k % 2]));
            solid.facing([...strip].reverse(), [0, -0.85, -0.5], material(stripes[k % 2]));
        }
    }

    solid.box(x0 - m(1), 0, z, x0 + m(1), m(0.25), z + m(0.55), material("stone"));
    dressShop(solid, piece.name, { x0, z, room: width / M / 2, seed: seedOf(piece) });

    return solid.toObject();
}

// Where a keep's door stands: this far in from the front of its lot (metres), and its size and sill
const KEEP_ENTRY = 1.4;
const KEEP_DOOR = Object.freeze({ width: 2.4, height: 3.2, floor: 0.8 });

/** Every special building, by name (setpieces/pieces.js LANDMARKS). */
export const LANDMARK_BUILDERS = Object.freeze({ tavern, church, blacksmith, guild, market, windmill, hall, keep, barracks, ...Object.fromEntries(SHOP_NAMES.map((name) => [name, shop])) });

/** A town's special building (its layout piece), filling its footprint. */
export function landmark(piece) {
    return LANDMARK_BUILDERS[piece.name](piece);
}
