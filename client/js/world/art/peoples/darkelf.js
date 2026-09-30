// The dark elves' buildings: the elves' flowing forms sharpened and blackened, after Gothic
// lancets and spires, broach spires and tented octagons (Kolomenskoye), the Sagrada Família's
// hierarchy of towers, Casa Batlló's finned ridge, basalt columns and obsidian, and Japanese
// charred timber. Black stone below and charred planks above, steep faceted roofs of violet
// slate swept up at their corners, fang finials, needle spires over octagonal towers; faerie fire
// (violet light, a little blue and green) along their edges and in their lancets, and silk webs
// strung under their eaves and between their spires.
//
// The common thorn house has two storeys under a steep hip; the rich add an octagonal tower with
// a needle spire; the poor live in hexagonal pods clustered against them.

import { PEOPLE_PLACES } from "../../../core/setpieces/pieces.js";
import { material } from "../engine/materials.js";
import { inset, Solid } from "../engine/solid.js";
import { emblemSignTexture, loadSignFont, nameBoardTexture, signMaterial } from "../kits/signs.js";
import { band, CELL, circle, ENTRY, m, pinnacle, pole, post, randomFor, southSide, spike, stake, steps, wallPoint, weathering, web } from "./kit.js";
import { budLamp, needleSpire, spider, whiplash } from "./sylvan.js";

const LIGHTS = ["glow-violet", "glow-violet", "glow-violet", "glow-violet", "glow-deep", "glow-blue", "glow-green"];

function toned(solid, random, eaves = []) {
    solid.tone = weathering({ seed: random.int(0, 1e6), eaves, washes: [], dirt: 0.2, mottle: ["slate-violet"] });
}

// A picture on a board (a sign's texture) in a face `at` (wallPoint's), the right way round
function board(solid, at, out, [u0, u1, v0, v1], texture, name, proud = m(0.2)) {
    const [a, b] = [at(u0, v0), at(u1, v0)];
    const right = [out[2], 0, -out[0]];
    const [l, r] = (b[0] - a[0]) * right[0] + (b[2] - a[2]) * right[2] >= 0 ? [u0, u1] : [u1, u0];

    solid.member(at((u0 + u1) / 2 - (u1 - u0) / 2 - m(0.12), (v0 + v1) / 2, proud - m(0.1)), at((u0 + u1) / 2 + (u1 - u0) / 2 + m(0.12), (v0 + v1) / 2, proud - m(0.1)), out, v1 - v0 + m(0.24), m(0.1), material("iron-black"));
    solid.facing([at(l, v0, proud), at(r, v0, proud), at(r, v1, proud), at(l, v1, proud)], out, signMaterial(texture, name), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/** A shard of obsidian (or a crystal): a faceted needle from `base` along `way`, `length` long. */
export function shard(solid, base, way, length, r, { sides = 5, name = "obsidian", seam = null } = {}) {
    const d = way.map((v) => v / Math.hypot(...way));
    const points = [base, base.map((v, i) => v + d[i] * length * 0.7), base.map((v, i) => v + d[i] * length)];

    solid.tube(points, [r, r * 0.8, 0], material(name), { sides, caps: true, smooth: false });

    if (seam) {
        solid.tube([base.map((v, i) => v + d[i] * length * 0.05), base.map((v, i) => v + d[i] * length * 0.72)].map((p) => [p[0] + r * 0.85, p[1], p[2]]), m(0.03), material(seam), { sides: 3 });
    }
}

/** A cluster of basalt columns: hexagonal prisms of stepped heights round (x, z). */
export function columns(solid, x, z, count, reach, [low, high], random, { name = "stone-black", y = 0 } = {}) {
    // (Packed tight on a hexagonal lattice, tallest in the middle, as basalt cools)
    const r = m(0.45);
    const spots = [];

    for (let ring = 0; spots.length < count && ring < 20; ring++) {
        for (let k = 0; k < Math.max(1, ring * 6); k++) {
            const a = (k * Math.PI * 2) / Math.max(1, ring * 6);

            spots.push([x + Math.cos(a) * ring * r * 1.75, z + Math.sin(a) * ring * r * 1.75]);
        }
    }

    for (const [px, pz] of spots.slice(0, count)) {
        const d = Math.hypot(px - x, pz - z);
        const t = Math.min(1, d / Math.max(reach, r));

        solid.extrude(circle(px, pz, r * random.range(0.9, 1.02), 6, 0), y, y + (low + (high - low) * (1 - t)) * random.range(0.8, 1.1), material(name));
    }
}

/**
 * A steep hipped roof over x0..x1 by z0..z1 from `eaves`, rising `rise` to a ridge along its
 * longer side, its four corners swept up and out into points, fins along its ridge, fangs at its
 * ends, faerie fire along its eaves on a richer house. Returns its ridge's height.
 */
export function sweptHip(solid, [x0, z0, x1, z1], eaves, rise, random, { name = "slate-violet", sweep = m(0.6), over = m(0.5), fins = true, glow = null } = {}) {
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const along = x1 - x0 >= z1 - z0;
    const [hw, hd] = along ? [(x1 - x0) / 2 + over, (z1 - z0) / 2 + over] : [(z1 - z0) / 2 + over, (x1 - x0) / 2 + over];
    const ringAt = (t) => {
        const half = hd * (1 - t);
        const long = hw - hd * t;
        const lift = sweep * (1 - t) ** 3;
        const y = eaves + rise * t;
        // (Corners, and the middles of the sides between them: the corners swept up and out)
        const local = [[long * (1 + (sweep / hw) * (1 - t) ** 3), y + lift, half * (1 + (sweep / hd) * (1 - t) ** 3)], [0, y, half], [-long * (1 + (sweep / hw) * (1 - t) ** 3), y + lift, half * (1 + (sweep / hd) * (1 - t) ** 3)], [-long, y, 0], [-long * (1 + (sweep / hw) * (1 - t) ** 3), y + lift, -half * (1 + (sweep / hd) * (1 - t) ** 3)], [0, y, -half], [long * (1 + (sweep / hw) * (1 - t) ** 3), y + lift, -half * (1 + (sweep / hd) * (1 - t) ** 3)], [long, y, 0]];

        return local.map(([u, py, v]) => (along ? [cx + u, py, cz + v] : [cx + v, py, cz + u]));
    };
    const rings = Array.from({ length: 5 }, (_, k) => ringAt(k / 4));

    solid.loft(rings, material(name));
    solid.loft([rings[0], ringAt(0).map(([x, y, z]) => [cx + (x - cx) * 0.75, y - m(0.2), cz + (z - cz) * 0.75])], material("timber-char"), { out: [0, -1, 0] });

    const ridge = eaves + rise;
    const [ra, rb] = along ? [[cx - (hw - hd), ridge, cz], [cx + (hw - hd), ridge, cz]] : [[cx, ridge, cz - (hw - hd)], [cx, ridge, cz + (hw - hd)]];

    if (fins) {
        const count = Math.max(2, Math.round(Math.hypot(rb[0] - ra[0], rb[2] - ra[2]) / m(0.8)));

        for (let k = 0; k <= count; k++) {
            const t = k / count;
            const [x, y, z] = [ra[0] + (rb[0] - ra[0]) * t, ridge, ra[2] + (rb[2] - ra[2]) * t];
            const size = m(0.5) + m(0.4) * Math.sin(Math.PI * t);
            const [ux, uz] = along ? [1, 0] : [0, 1];
            const fin = [[x - ux * size * 0.4, y, z - uz * size * 0.4], [x + ux * size * 0.4, y, z + uz * size * 0.4], [x - ux * size * 0.3, y + size, z - uz * size * 0.3]];

            solid.face(fin, material(k % 2 ? "iron-black" : name));
            solid.face([...fin].reverse(), material(k % 2 ? "iron-black" : name));
        }
    }

    // Fangs at the ridge's ends
    for (const [end, sign] of [[ra, -1], [rb, 1]]) {
        const out = along ? [sign, 0.9, 0] : [0, 0.9, sign];

        spike(solid, end, out, m(1.1), m(0.12), "iron-black", { sides: 4, bend: along ? [sign * 0.5, 0.6, 0] : [0, 0.6, sign * 0.5] });
    }

    // Faerie fire along its eaves, a thread of silk from each swept corner
    if (glow) {
        solid.tube([...rings[0], rings[0][0]].map(([x, y, z]) => [x, y - m(0.05), z]), m(0.04), material(glow), { sides: 3 });
    }

    for (const k of [0, 2, 4, 6]) {
        const [x, y, z] = rings[0][k];

        if (random.chance(0.4)) {
            web(solid, [x - (x - cx) * 0.12, y - m(0.9), z - (z - cz) * 0.12], m(0.9), [x - cx, 0, z - cz], { radials: 8, rings: 3, random });
        }
    }

    return ridge;
}

/**
 * An octagonal tower of black stone (r across its sides, round (x, z)), standing on y, `height`
 * tall, lancets up it lit violet, a needle spire over it ringed by gablets, faerie fire up its ribs.
 */
export function octTower(solid, x, z, r, y, height, random, { spire = 2.8, name = "stone-black", light = "glow-violet", door = null } = {}) {
    const outline = circle(x, z, r / Math.cos(Math.PI / 8), 8, southSide(8));
    const side = Math.hypot(outline[1][0] - outline[0][0], outline[1][1] - outline[0][1]);
    const openings = {};

    for (let k = 0; k < 8; k++) {
        const list = [];

        if (k === 0 && door) {
            list.push({ u0: side / 2 - door.width / 2, u1: side / 2 + door.width / 2, v0: 0, v1: door.height, depth: m(0.4), back: material("planks-char"), arch: "lancet" });
        }

        for (let v = m(door && k === 0 ? 4.5 : 2.5); v < height - m(2); v += m(4)) {
            if (random.chance(0.6)) {
                list.push({ u0: side / 2 - m(0.2), u1: side / 2 + m(0.2), v0: v, v1: v + m(1.6), depth: m(0.35), back: material(random.pick(LIGHTS)), arch: "lancet" });
            }
        }

        openings[k] = list;
    }

    solid.walls(outline, y, height, openings, material(name));

    const top = inset(outline, -m(0.25));

    solid.extrude(top, y + height, y + height + m(0.4), material("stone-black"));

    // (Little fangs round its cornice)
    for (const [px, pz] of top) {
        spike(solid, [px, y + height + m(0.4), pz], [px - x, m(2), pz - z], m(0.8), m(0.1), "iron-black", { sides: 4 });
    }

    return needleSpire(solid, x, z, y + height + m(0.4), r * 1.08, r * 2 * spire, "slate-violet", { glow: light });
}

/**
 * Openings round a dark elf's walls: a lancet door (its head drawn into an ogee point) on side
 * `door`, slits in the stone below, violet-lit lancets above.
 */
function darkOpenings(lengths, random, { door = null, doorWidth = m(1.1), doorHeight = m(2.4), level = "ground", sill = m(1) } = {}) {
    const openings = {};

    for (const [k, length] of lengths.entries()) {
        const list = [];
        const bays = Math.max(1, Math.round(length / m(2.2)));

        for (let b = 0; b < bays; b++) {
            const u = ((b + 0.5) * length) / bays;

            if (k === door && b === Math.floor(bays / 2)) {
                list.push({ u0: u - doorWidth / 2, u1: u + doorWidth / 2, v0: 0, v1: doorHeight, depth: m(0.4), back: material("planks-char"), arch: "lancet", sides: material("stone-black") });
                continue;
            }

            if (level === "ground") {
                if (random.chance(0.6)) {
                    list.push({ u0: u - m(0.1), u1: u + m(0.1), v0: m(1.4), v1: m(2.6), depth: m(0.35), back: material("shadow") });
                }
            } else if (random.chance(0.75)) {
                list.push({ u0: u - m(0.3), u1: u + m(0.3), v0: sill, v1: sill + m(1.9), depth: m(0.3), back: material(random.pick(LIGHTS)), arch: "lancet", sides: material("timber-char") });
            }
        }

        openings[k] = list;
    }

    return openings;
}

// Spider-leg straps of iron radiating over a door's leaf from its lock
function spiderStraps(solid, face, { u0, u1, v1, depth }) {
    const at = wallPoint(face);
    const [cu, cv] = [(u0 + u1) / 2, v1 * 0.45];
    const lock = at(cu, cv, -depth + m(0.04));

    for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI * 2) / 8 + Math.PI / 8;
        const reach = Math.min((u1 - u0) * 0.45, v1 * 0.4);
        const knee = at(cu + Math.cos(a) * reach * 0.5, cv + Math.sin(a) * reach * 0.7 + reach * 0.15, -depth + m(0.05));
        const foot = at(cu + Math.cos(a) * reach, cv + Math.sin(a) * reach * 1.1, -depth + m(0.04));

        solid.tube([lock, knee, foot], [m(0.035), m(0.03), m(0.015)], material("iron-black"), { sides: 3 });
    }

    solid.lathe(lock[0], lock[2], [[0, lock[1] - m(0.1)], [m(0.1), lock[1]], [0, lock[1] + m(0.1)]], material("iron-black"), { segments: 6 });
}

// --- Houses ---

/**
 * A thorn house: black stone below with slits in it, charred planks above lit by violet lancets,
 * a steep hip swept up at its corners over them, fins and fangs; x0..x1 by z0..z1.
 */
export function thornHouse(solid, x0, z0, x1, z1, { random, wealth = 0.5, storeys = 2, door = { width: m(1.1), height: m(2.4) } }) {
    const plinth = m(0.7);
    const outline = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const lengths = [x1 - x0, z1 - z0, x1 - x0, z1 - z0];

    solid.extrude(inset(outline, -m(0.25)), 0, plinth, material("stone-black"), { batter: m(0.1) });

    const groundOpenings = darkOpenings(lengths, random, { door: 2, doorWidth: door.width, doorHeight: door.height });
    const faces = solid.walls(outline, plinth, m(3.4), groundOpenings, material("stone-black"));
    let eaves = plinth + m(3.4);

    if (storeys > 1) {
        const upper = solid.walls(outline, eaves, m(3.2), darkOpenings(lengths, random, { level: "upper" }), material("planks-char"));

        // (Its frame: charred posts at its corners and between its bays, a rail at its floor)
        for (const face of upper) {
            const at = wallPoint(face);

            solid.member(at(0, 0), at(face.length, 0), face.out, m(0.28), m(0.1), material("timber-char"));

            for (let u = 0; u <= face.length + 1; u += face.length / Math.max(1, Math.round(face.length / m(2.2)))) {
                solid.member(at(Math.min(u, face.length), 0), at(Math.min(u, face.length), m(3.2)), face.out, m(0.18), m(0.08), material("timber-char"), { ends: false });
            }
        }

        eaves += m(3.2);
    }

    const door0 = groundOpenings[2].find(({ back }) => back.name === "planks-char");

    if (door0) {
        spiderStraps(solid, faces[2], door0);

        const at = wallPoint(faces[2]);

        for (const side of [-1, 1]) {
            budLamp(solid, at((door0.u0 + door0.u1) / 2 + side * m(1), door0.v1 + m(0.3), m(0.1)), [faces[2].out[0], faces[2].out[2]], { light: "glow-violet", crook: "iron-black", sharp: true, reach: m(0.55) });
        }

        steps(solid, at((door0.u0 + door0.u1) / 2, 0, 0)[0], faces[2].origin[2] + m(1.4), 0, plinth, [0, -1], m(1.6), "stone-black", { tread: m(0.4), riser: plinth / 3 });
    }

    const width = Math.min(x1 - x0, z1 - z0);

    return sweptHip(solid, [x0, z0, x1, z1], eaves, width * random.range(1.1, 1.4), random, { glow: wealth > 0.5 ? "glow-violet" : null });
}

/** A pod: a hexagonal cell of black stone under one steep pyramid, a violet lamp at its door. */
export function pod(solid, cx, cz, { r = m(2.3), random }) {
    const outline = circle(cx, cz, r, 6, southSide(6));
    const side = Math.hypot(outline[1][0] - outline[0][0], outline[1][1] - outline[0][1]);
    const faces = solid.walls(outline, m(0.3), m(2.8), { 0: [{ u0: side / 2 - m(0.45), u1: side / 2 + m(0.45), v0: 0, v1: m(2.1), depth: m(0.35), back: material("planks-char"), arch: "lancet" }], 3: [{ u0: side / 2 - m(0.1), u1: side / 2 + m(0.1), v0: m(1.4), v1: m(2.3), depth: m(0.3), back: material("glow-violet") }] }, material("stone-black"));

    solid.extrude(inset(outline, -m(0.2)), 0, m(0.3), material("stone-black"));
    solid.lathe(cx, cz, [[r + m(0.45), m(3.1)], [r * 0.4, m(3.1) + r * 2.2], [0, m(3.1) + r * 3.2]], material("slate-violet"), { segments: 6, from: southSide(6), to: southSide(6) + Math.PI * 2, smooth: false });
    spike(solid, [cx, m(3.1) + r * 3.15, cz], [0, 1, 0], m(0.8), m(0.06), "iron-black");
    budLamp(solid, wallPoint(faces[0])(side / 2 + m(0.7), m(2.3), m(0.05)), [faces[0].out[0], faces[0].out[2]], { light: random.pick(LIGHTS), crook: "iron-black", sharp: true, reach: m(0.4) });
}

/** A dark elf's house on its lot: its `type` if asked (thorn, spire, pod), or one to suit it. */
export function house(piece) {
    const random = randomFor(piece);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const wealth = piece.wealth ?? random.range(0, 1);
    const type = piece.type ?? (piece.back ? "pod" : W * D > m(9) * m(10) && wealth > 0.55 ? "spire" : random.pick(["thorn", "thorn", "pod"]));
    const solid = new Solid();

    toned(solid, random, [m(7)]);

    if (type === "pod") {
        pod(solid, W / 2, D / 2, { r: Math.min(m(2.6), Math.min(W, D) / 2 - m(0.8)), random });

        if (W > m(9)) {
            pod(solid, W / 2 + m(3.6), D / 2 - m(1.4), { r: m(1.8), random });
        }
    } else {
        const tower = type === "spire";
        const [x0, x1] = [m(0.6), W - m(0.6) - (tower ? m(2.4) : 0)];

        thornHouse(solid, x0, m(0.8), x1, D - m(1.6), { random, wealth, storeys: 2 });

        if (tower) {
            octTower(solid, W - m(2.4), D - m(3.2), m(1.8), 0, m(9.5), random, { spire: 3 });
        }
    }

    return solid.toObject();
}

export const GALLERY = Object.freeze({
    houses: [["pod", 2.6, 1.6], ["thorn", 2, 2.4], ["spire", 2.8, 2.6]],
});

// --- Landmarks ---

/**
 * The tavern: a long hall under two stacked hips, a covered gallery along its front on black
 * posts, an iron spider hanging on a silk thread for its sign, its name over the door.
 */
export async function tavern(piece) {
    await loadSignFont();

    const random = randomFor(piece, 81);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const own = piece.tavern ?? { name: "The Spinner's Rest", emblem: "tankard", count: 1 };
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.4);
    const [x0, x1, z0] = [m(0.6), W - m(0.6), m(0.6)];

    toned(solid, random, [m(7)]);

    const ridge = thornHouse(solid, x0, z0, x1, front, { random, wealth: 1, storeys: 2, door: { width: m(1.8), height: m(2.3) } });

    // (A second, smaller hip standing on the first's ridge)
    const [cx, cz] = [(x0 + x1) / 2, (z0 + front) / 2];

    sweptHip(solid, [cx - m(2.2), cz - m(1.4), cx + m(2.2), cz + m(1.4)], ridge - m(1.2), m(3.5), random, { glow: "glow-violet" });

    // The spider sign hanging on its thread by the door, the name over the door
    const face = { origin: [x1, 0, front], across: [-1, 0, 0], out: [0, 0, 1], length: x1 - x0 };
    const at = wallPoint(face);
    const arm = [at(face.length / 2 - m(2.2), m(3.6), 0), at(face.length / 2 - m(2.2), m(3.6), m(1.6))];

    whiplash(solid, arm[0], arm[1], [0, 1, 0], "iron-black", { bow: 0.2, curl: 0.15, r: m(0.06), sharp: true });
    pole(solid, arm[1], [arm[1][0], m(2.8), arm[1][2]], m(0.01), "silk", { sides: 3 });
    spider(solid, arm[1][0], m(2.2), arm[1][2], m(1.1), "iron-black", { facing: 0 });
    board(solid, at, face.out, [face.length / 2 - m(1.9), face.length / 2 + m(1.9), m(2.9), m(2.9) + m(3.8) * (9 / 56)], nameBoardTexture({ name: own.name, ground: "#241a30", dark: "#100a16" }), `board ${own.name}`, m(0.15));

    return solid.toObject();
}

/**
 * The temple: a short nave of black stone with an orb-web rose window glowing over its door,
 * ending in an octagon gripped by eight spider-leg flying buttresses, a needle spire over it.
 */
export async function church(piece) {
    await loadSignFont();

    const random = randomFor(piece, 82);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(1.2) + m(0.4);
    const floor = m(0.6);
    const [nx0, nx1] = [W / 2 - m(3.2), W / 2 + m(3.2)];
    const r = Math.min(W / 2 - m(3.2), m(4.2));
    const [ox, oz] = [W / 2, m(1) + r];
    const nz0 = oz;

    toned(solid, random, [m(8)]);
    solid.extrude([[m(0.6), m(0.4)], [W - m(0.6), m(0.4)], [W - m(0.6), doorFace + m(0.2)], [m(0.6), doorFace + m(0.2)]], 0, floor, material("stone-black"));

    // The nave, its front gable with the rose window
    const nave = [[nx0, nz0], [nx1, nz0], [nx1, doorFace], [nx0, doorFace]];
    const width = nx1 - nx0;
    const faces = solid.walls(nave, floor, m(7), { 2: [{ u0: width / 2 - m(0.8), u1: width / 2 + m(0.8), v0: 0, v1: m(2.6), depth: m(0.45), back: material("planks-char"), arch: "lancet" }, { u0: width / 2 - m(1.4), u1: width / 2 + m(1.4), v0: m(3.6), v1: m(6.4), depth: m(0.4), back: material("glow-violet"), arch: "moon" }], 1: [0.3, 0.7].map((t) => ({ u0: (doorFace - nz0) * t - m(0.3), u1: (doorFace - nz0) * t + m(0.3), v0: m(2.5), v1: m(6), depth: m(0.4), back: material("glow-violet"), arch: "lancet" })), 3: [0.3, 0.7].map((t) => ({ u0: (doorFace - nz0) * t - m(0.3), u1: (doorFace - nz0) * t + m(0.3), v0: m(2.5), v1: m(6), depth: m(0.4), back: material("glow-violet"), arch: "lancet" })) }, material("stone-black"));
    const at = wallPoint(faces[2]);

    web(solid, at(width / 2, m(5), m(0.05)), m(1.35), [0, 0, 1], { radials: 12, rings: 5, name: "silver" });
    solid.wall({ origin: [nx0, floor + m(7), doorFace], across: [1, 0, 0], out: [0, 0, 1] }, width, width * 0.9, [], material("stone-black"), { line: [[0, 0], [width / 2, width * 0.9], [width, 0]] });
    sweptHip(solid, [nx0, nz0, nx1, doorFace], floor + m(7), width * 0.9, random, { sweep: m(0.3), over: m(0.3), glow: "glow-violet" });
    spiderStraps(solid, faces[2], { u0: width / 2 - m(0.8), u1: width / 2 + m(0.8), v1: m(2.6), depth: m(0.45) });
    steps(solid, W / 2, doorFace + m(1.2), 0, floor, [0, -1], m(2.4), "stone-black", { tread: m(0.4), riser: floor / 3 });

    // The octagon, and its spider legs
    octTower(solid, ox, oz, r, floor, m(9.5), random, { spire: 3.2 });

    for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI * 2) / 8 + Math.PI / 8;
        const [dx, dz] = [Math.cos(a), Math.sin(a)];

        if (dz > 0.5) {
            continue;
        }

        const foot = [ox + dx * (r + m(4)), 0, oz + dz * (r + m(4))];
        const knee = [ox + dx * (r + m(3)), m(7.5), oz + dz * (r + m(3))];
        const grip = [ox + dx * r, m(9), oz + dz * r];

        solid.tube([foot, [foot[0] - dx * m(0.3), m(3.5), foot[2] - dz * m(0.3)], knee, grip], [m(0.3), m(0.34), m(0.3), m(0.18)], material("stone-black"), { sides: 5 });
        spike(solid, knee, [dx, 1, dz], m(1.2), m(0.15), "iron-black", { sides: 4 });
    }

    return solid.toObject();
}

/**
 * The smithy: a workshop of black stone (its door where the town's entrance says), and a lean-to
 * forge beside it whose chimney is a cluster of basalt columns of stepped heights, the town's one
 * warm light glowing in its hearth.
 */
export async function blacksmith(piece) {
    await loadSignFont();

    const random = randomFor(piece, 83);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const front = D - m(2.2) + m(0.35);
    const doorAt = W / 2 - m(1.2);
    const [x0, x1] = [doorAt - m(2.8), doorAt + m(2.8)];

    toned(solid, random, [m(4)]);

    const outline = [[x0, m(3.5)], [x1, m(3.5)], [x1, front], [x0, front]];
    const faces = solid.walls(outline, m(0.3), m(3.4), { 2: [{ u0: m(2.8) - m(0.65), u1: m(2.8) + m(0.65), v0: 0, v1: m(2.1), depth: m(0.4), back: material("planks-char"), arch: "lancet" }] }, material("stone-black"));

    solid.extrude(inset(outline, -m(0.2)), 0, m(0.3), material("stone-black"));
    sweptHip(solid, [x0, m(3.5), x1, front], m(3.7), m(3.5), random, { fins: false });

    // The lean-to: its roof sloping off the workshop's side on black posts
    const [lx0, lx1, lz0, lz1] = [x1, W - m(0.4), m(2), D - m(1)];

    for (const z of [lz0, (lz0 + lz1) / 2, lz1]) {
        post(solid, lx1, 0, z, m(2.8), m(0.12), "timber-char", { sides: 5 });
    }

    const roof = [[lx0, m(3.9), lz0 - m(0.4)], [lx0, m(3.9), lz1 + m(0.4)], [lx1 + m(0.4), m(2.8), lz1 + m(0.4)], [lx1 + m(0.4), m(2.8), lz0 - m(0.4)]];

    solid.facing(roof, [0.4, 1, 0], material("slate-violet"));
    solid.facing(roof, [0, -1, 0], material("timber-char"));

    const [fx, fz] = [(lx0 + lx1) / 2 + m(0.3), lz0 + m(1.8)];

    solid.extrude([[fx - m(1), fz - m(0.8)], [fx + m(1), fz - m(0.8)], [fx + m(1), fz + m(0.8)], [fx - m(1), fz + m(0.8)]], 0, m(0.9), material("stone-black"));
    solid.facing([[fx - m(0.7), m(0.91), fz - m(0.5)], [fx + m(0.7), m(0.91), fz - m(0.5)], [fx + m(0.7), m(0.91), fz + m(0.5)], [fx - m(0.7), m(0.91), fz + m(0.5)]], [0, 1, 0], material("glow-fire"));
    columns(solid, fx, fz - m(1.1), 6, m(0.9), [m(5), m(8)], random, { name: "basalt" });
    solid.box(fx - m(0.35), 0, fz + m(1.6), fx + m(0.35), m(0.8), fz + m(1.9), material("iron-black"));
    board(solid, wallPoint(faces[2]), faces[2].out, [m(3.8), m(4.7), m(1.3), m(2.2)], emblemSignTexture({ name: "Smithy", emblem: "anvil", tint: random.int(0, 5) }), "sign smithy", m(0.1));

    return solid.toObject();
}

/**
 * The guild's hall: black stone of three storeys under a stepped gable (each step a pinnacle),
 * blind lancets let into it in rows, a hoist beam at its peak.
 */
export async function guild(piece) {
    await loadSignFont();

    const random = randomFor(piece, 84);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.4);
    const [x0, x1, z0] = [m(1.2), W - m(1.2), m(0.6)];
    const width = x1 - x0;
    const height = m(8);

    toned(solid, random, [height]);
    solid.extrude([[x0 - m(0.3), z0 - m(0.3)], [x1 + m(0.3), z0 - m(0.3)], [x1 + m(0.3), front + m(0.3)], [x0 - m(0.3), front + m(0.3)]], 0, m(0.3), material("stone-black"));

    const bays = Math.max(3, Math.round(width / m(1.8))) | 1;
    const front2 = [];

    for (let b = 0; b < bays; b++) {
        const u = ((b + 0.5) * width) / bays;
        const middle = b === Math.floor(bays / 2);

        front2.push(middle ? { u0: u - m(1.1), u1: u + m(1.1), v0: 0, v1: m(2.6), depth: m(0.45), back: material("planks-char"), arch: "lancet" } : { u0: u - m(0.35), u1: u + m(0.35), v0: m(1.2), v1: m(3.6), depth: m(0.25), back: material("stone-black"), arch: "lancet" });
        front2.push({ u0: u - m(0.3), u1: u + m(0.3), v0: m(4.6), v1: m(7), depth: m(0.25), back: material(middle ? "glow-violet" : "stone-black"), arch: "lancet" });
    }

    const faces = solid.walls([[x0, z0], [x1, z0], [x1, front], [x0, front]], m(0.3), height, { 2: front2 }, material("stone-black"));

    // The stepped gable over the front, a pinnacle on every step
    const steps2 = 6;
    const line = [[0, 0]];

    for (let k = 0; k < steps2; k++) {
        const [ua, ub] = [(k * width) / (2 * steps2), ((k + 1) * width) / (2 * steps2)];
        const v = ((k + 1) / steps2) * width * 0.9;

        line.push([ua, v], [ub, v]);
    }

    const full = [...line, ...line.slice(1).reverse().map(([u, v]) => [width - u, v])].sort((a, b) => a[0] - b[0]);

    solid.wall({ origin: [x0, m(0.3) + height, front], across: [1, 0, 0], out: [0, 0, 1] }, width, width * 0.9, [{ u0: width / 2 - m(0.4), u1: width / 2 + m(0.4), v0: width * 0.35, v1: width * 0.35 + m(1.8), depth: m(0.3), back: material("glow-violet"), arch: "lancet" }], material("stone-black"), { line: full });

    for (let k = 1; k < steps2; k++) {
        for (const side of [-1, 1]) {
            const u = width / 2 + side * (width / 2 - (k * width) / (2 * steps2));

            pinnacle(solid, x0 + u, m(0.3) + height + (k / steps2) * width * 0.9, front - m(0.15), m(0.35), m(1.1), "stone-black");
        }
    }

    sweptHip(solid, [x0, z0, x1, front - m(0.3)], m(0.3) + height, width * 0.85, random, { sweep: 0, over: m(0.3), fins: false });
    pole(solid, [x0 + width / 2, m(0.3) + height + width * 0.8, front], [x0 + width / 2, m(0.3) + height + width * 0.8, front + m(1.6)], m(0.12), "timber-char", { sides: 4 });
    board(solid, wallPoint(faces[2]), faces[2].out, [width / 2 - m(1.5), width / 2 + m(1.5), m(2.8), m(2.8) + m(3) * (9 / 56)], nameBoardTexture({ name: "Adventurers' Guild", ground: "#241a30", dark: "#100a16" }), "board guild", m(0.15));

    return solid.toObject();
}

/**
 * The Archon's hall: basalt columns clustered against its foot, a lancet arcade along its front,
 * a finned ridge, an octagonal corner tower under a needle spire.
 */
export async function hall(piece) {
    await loadSignFont();

    const random = randomFor(piece, 85);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const front = D - m(ENTRY) + m(0.4);

    toned(solid, random, [m(7)]);
    thornHouse(solid, m(0.6), m(0.6), W - m(3.4), front, { random, wealth: 1, storeys: 2, door: { width: m(2), height: m(2.5) } });
    octTower(solid, W - m(2), front - m(2.2), m(1.9), 0, m(12), random, { spire: 3.4 });
    columns(solid, m(1.4), front + m(0.5), 5, m(1), [m(1), m(2.4)], random, { name: "basalt" });
    columns(solid, W - m(4.4), front + m(0.5), 4, m(0.8), [m(0.8), m(2)], random, { name: "basalt" });
    board(solid, (u, v, w = 0) => [W / 2 - m(1.4) - m(1.4) + u, v, front + w], [0, 0, 1], [0, m(3.6), m(2.8), m(2.8) + m(3.6) * (9 / 56)], nameBoardTexture({ name: "Town Hall", ground: "#241a30", dark: "#100a16" }), "board hall", m(0.15));

    return solid.toObject();
}

/**
 * A capital's keep: the Black Tower, a great octagon crowned by a quincunx of needle spires (four
 * round a tall one), corbelled turrets, its door up steps between two stone spiders.
 */
export async function keep(piece) {
    await loadSignFont();

    const random = randomFor(piece, 86);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const doorFace = D - m(1.4) + m(0.4);
    const r = Math.min(W / 2 - m(0.8), (doorFace - m(0.8)) / 2) * 0.92;
    const [cx, cz] = [W / 2, doorFace - r];

    toned(solid, random, []);
    solid.extrude(circle(cx, cz, r / Math.cos(Math.PI / 8) + m(0.5), 8, southSide(8)), 0, m(0.8), material("stone-black"), { batter: m(0.2) });
    octTower(solid, cx, cz, r, m(0.8), m(18), random, { spire: 2.4, door: { width: m(2.4), height: m(3.2) } });

    for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const [tx, tz] = [cx + Math.cos(a) * r * 0.78, cz + Math.sin(a) * r * 0.78];

        octTower(solid, tx, tz, r * 0.28, m(18.8), m(3), random, { spire: 3 });
    }

    steps(solid, cx, doorFace + m(1.6), 0, m(0.8), [0, -1], m(3.2), "stone-black", { tread: m(0.4), riser: m(0.2) });

    for (const side of [-1, 1]) {
        spider(solid, cx + side * m(2.6), 0, doorFace + m(1), m(2.2), "jade-dark", { facing: side * 0.3 });
    }

    return solid.toObject();
}

/**
 * The market: stalls on black iron frames curling into violet bud lamps, under awnings of silk,
 * one great web strung over them all.
 */
export function market(piece) {
    const random = randomFor(piece, 87);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
            const [x, z] = [m(2.8) + i * (W - m(5.6)) / 2, m(2.6) + j * (D - m(5.2))];

            for (const dx of [-m(1.2), m(1.2)]) {
                whiplash(solid, [x + dx, 0, z - m(0.8)], [x + dx * 0.7, m(2.7), z], [dx, 0, 0], "iron-black", { bow: 0.15, curl: 0.2, r: m(0.06), sharp: true });
                budLamp(solid, [x + dx * 0.7, m(2.7), z], [Math.sign(dx), 0], { light: random.pick(LIGHTS), crook: "iron-black", sharp: true, reach: m(0.4) });
            }

            const cloth = [[x - m(1.4), m(2.6), z - m(1)], [x + m(1.4), m(2.6), z - m(1)], [x + m(1.4), m(2.2), z + m(1)], [x - m(1.4), m(2.2), z + m(1)]];

            solid.face(cloth, material(random.pick(["silk", "cloth-violet"])), undefined, null);
            solid.face([...cloth].reverse(), material("cloth-violet"), undefined, null);
            solid.box(x - m(1.1), 0, z + m(0.4), x + m(1.1), m(0.9), z + m(0.8), material("stone-black"));

            for (let k = 0; k < 4; k++) {
                const gx = x - m(0.8) + k * m(0.55);

                solid.lathe(gx, z + m(0.6), [[0, m(0.9)], [m(0.14), m(1)], [m(0.1), m(1.15)], [0, m(1.2)]], material(random.pick(["glass-violet", "silk", "jade", "obsidian", "silver"])), { segments: 6 });
            }
        }
    }

    // (The great web over the square, strung from its corners)
    web(solid, [W / 2, m(8), D / 2], Math.min(W, D) / 2, [0, 1, 0.15], { radials: 12, rings: 6, random });

    for (const [x, z] of [[m(0.5), m(0.5)], [W - m(0.5), m(0.5)], [W - m(0.5), D - m(0.5)], [m(0.5), D - m(0.5)]]) {
        stake(solid, x, 0, z, m(8.5), m(0.14), "timber-char", { lean: [(W / 2 - x) * 0.05, (D / 2 - z) * 0.05] });
    }

    return solid.toObject();
}

export function windmill(piece) {
    return market(piece);
}

export const LANDMARKS = Object.freeze({ tavern, church, blacksmith, guild, hall, keep, market, windmill });

export function landmark(piece) {
    return (LANDMARKS[piece.name] ?? market)(piece);
}

// --- Their own places ---

/**
 * The spider shrine: eight legs of black stone rising from an octagonal platform to their knees
 * and meeting in a crown over an egg of obsidian glowing violet, an orb web strung between the
 * knees.
 */
function spiderShrine(piece) {
    const random = randomFor(piece, 91);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const R = Math.min(W, D) / 2 - m(1);

    toned(solid, random, []);
    solid.extrude(circle(cx, cz, R, 8, Math.PI / 8), 0, m(0.9), material("stone-black"), { batter: m(0.3) });
    solid.extrude(circle(cx, cz, R * 0.55, 8, Math.PI / 8), m(0.9), m(1.4), material("obsidian"));

    const crown = [cx, m(11), cz];
    const knees = [];

    for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI * 2) / 8;
        const [dx, dz] = [Math.cos(a), Math.sin(a)];
        const foot = [cx + dx * R * 0.92, m(0.9), cz + dz * R * 0.92];
        const knee = [cx + dx * R * 0.8, m(8), cz + dz * R * 0.8];

        knees.push(knee);
        solid.tube([foot, [cx + dx * R * 0.95, m(4), cz + dz * R * 0.95], knee, crown], [m(0.4), m(0.45), m(0.4), m(0.25)], material("stone-black"), { sides: 5 });
        spike(solid, knee, [dx, 1.4, dz], m(1.3), m(0.18), "iron-black", { sides: 4 });
    }

    // (The egg, glowing, and the violet light about it)
    solid.lathe(cx, cz, [[0, m(1.4)], [m(0.9), m(1.9)], [m(1.1), m(3)], [m(0.8), m(4.2)], [0, m(4.8)]], material("obsidian"), { segments: 7 });
    solid.lathe(cx, cz, [[0, m(1.5)], [m(0.6), m(2)], [m(0.75), m(3)], [0, m(3.8)]], material("glow-violet"), { segments: 7 });
    web(solid, [cx, m(8), cz + R * 0.8], R * 0.85, [0, 0, 1], { radials: 12, rings: 5, random });
    web(solid, [cx, m(8.3), cz], R * 0.78, [0, 1, 0], { radials: 8, rings: 4, random });

    return solid.toObject();
}

/**
 * The obsidian spire: needles of black glass bursting from a mound of basalt columns, their
 * heights stepping down round the tallest, violet seams up them.
 */
function obsidianSpire(piece) {
    const random = randomFor(piece, 92);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];

    toned(solid, random, []);
    columns(solid, cx, cz, 61, m(6), [m(0.8), m(6)], random, { name: "basalt" });

    const heights = [1, 0.8, 0.78, 0.6, 0.45];
    const tallest = m(36);

    for (const [k, h] of heights.entries()) {
        const a = k === 0 ? 0 : (k * Math.PI * 2) / 4 + 0.4;
        const d = k === 0 ? 0 : m(2.4);
        const tilt = k === 0 ? 0 : 0.12;

        shard(solid, [cx + Math.cos(a) * d, m(2), cz + Math.sin(a) * d], [Math.cos(a) * tilt, 1, Math.sin(a) * tilt], tallest * h, m(k === 0 ? 2 : 1.3), { sides: 5, seam: "glow-violet" });
    }

    return solid.toObject();
}

/**
 * The shadow gate: two horn-shaped leaves of black stone curving up to meet in a thorn over a
 * void, black at its heart and violet at its rim, stone spiders either side.
 */
function shadowGate(piece) {
    const random = randomFor(piece, 93);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];

    toned(solid, random, []);
    solid.extrude([[cx - m(4), cz - m(1.5)], [cx + m(4), cz - m(1.5)], [cx + m(4), cz + m(1.5)], [cx - m(4), cz + m(1.5)]], 0, m(0.5), material("stone-black"));

    for (const side of [-1, 1]) {
        const horn = Array.from({ length: 9 }, (_, k) => {
            const t = k / 8;

            return [cx + side * m(2.4) * Math.cos((Math.PI / 2) * t) ** 0.8, m(0.5) + m(8) * Math.sin((Math.PI / 2) * t), cz];
        });

        solid.tube(horn, horn.map((_, k) => m(0.7) * (1 - k / 9) + m(0.08)), material("stone-black"), { sides: 6 });
        spider(solid, cx + side * m(4.2), m(0.5), cz + m(1.5), m(2), "jade-dark", { facing: 0 });
    }

    spike(solid, [cx, m(8.3), cz], [0, 1, 0], m(1.8), m(0.2), "iron-black");

    // The void: rings from a black heart out to a violet rim
    const ringAt = (s) => Array.from({ length: 16 }, (_, k) => {
        const a = (k * Math.PI * 2) / 16;

        return [cx + Math.cos(a) * m(2) * s, m(4) + Math.sin(a) * m(3.6) * s, cz];
    });

    for (const [s0, s1, name] of [[0, 0.55, "black"], [0.55, 0.85, "glow-deep"], [0.85, 1, "glow-violet"]]) {
        const [a, b] = [ringAt(s0), ringAt(s1)];

        for (let k = 0; k < 16; k++) {
            const quad = [a[k], a[(k + 1) % 16], b[(k + 1) % 16], b[k]];

            solid.face(quad, material(name), undefined, null);
            solid.face([...quad].reverse(), material(name), undefined, null);
        }
    }

    return solid.toObject();
}

/**
 * A castle: a ring wall of black stone with octagonal towers, a terrace raised on basalt columns
 * inside, the Black Tower on it crowned with spires, silk strung from it to the towers.
 */
function castle(piece) {
    const random = randomFor(piece, 94);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();
    const [cx, cz] = [W / 2, D / 2];
    const R = Math.min(W, D) / 2 - m(3);
    const count = 8;

    toned(solid, random, []);

    const towers = Array.from({ length: count }, (_, k) => {
        const a = (k * Math.PI * 2) / count + Math.PI / count;

        return [cx + Math.cos(a) * R, cz + Math.sin(a) * R];
    });

    band(solid, towers, 0, m(9), m(2.4), "stone-black", { lean: 0.04 });

    // (Thorn merlons leaning out along its top)
    for (let k = 0; k < count; k++) {
        const [[ax, az], [bx, bz]] = [towers[k], towers[(k + 1) % count]];

        for (let t = 0.1; t < 0.95; t += 0.1) {
            const [x, z] = [ax + (bx - ax) * t, az + (bz - az) * t];

            spike(solid, [x, m(9), z], [x - cx, m(20), z - cz], m(1.4), m(0.25), "stone-black", { sides: 4 });
        }
    }

    for (const [x, z] of towers) {
        octTower(solid, x, z, m(2.4), 0, m(15), random, { spire: 2.6 });
    }

    // The terrace and the Black Tower on it
    columns(solid, cx, cz, 30, R * 0.45, [m(3), m(4)], random, { name: "basalt" });
    solid.extrude(circle(cx, cz, R * 0.4, 8, Math.PI / 8), 0, m(3.6), material("stone-black"), { top: material("stone-black") });

    octTower(solid, cx, cz, R * 0.22, m(3.6), m(20), random, { spire: 2.6, door: { width: m(2), height: m(3) } });

    for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;

        octTower(solid, cx + Math.cos(a) * R * 0.18, cz + Math.sin(a) * R * 0.18, R * 0.06, m(23.6), m(2.5), random, { spire: 3 });
    }

    // (Silk from the Black Tower to its towers)
    for (const [x, z] of towers.filter((_, k) => k % 2 === 0)) {
        const mid = [(x + cx) / 2, m(14), (z + cz) / 2];

        solid.tube([[cx, m(19), cz], mid, [x, m(13), z]], m(0.06), material("silk"), { sides: 3 });
    }

    // The gate between two towers on the south
    const [[gx0, gz0], [gx1, gz1]] = [towers[1], towers[2]];

    for (const side of [-1, 1]) {
        spider(solid, (gx0 + gx1) / 2 + side * m(3.5), 0, (gz0 + gz1) / 2 + m(3), m(2.2), "jade-dark", { facing: 0 });
    }

    return solid.toObject();
}

export const STRUCTURE_SIZES = PEOPLE_PLACES.darkElf;

const STRUCTURES = Object.freeze({ "spider shrine": spiderShrine, "obsidian spire": obsidianSpire, "shadow gate": shadowGate, castle });

export function structure(piece) {
    return STRUCTURES[piece.name](piece);
}

/** A length of wall (w plots along x, facing south): black stone, thorn merlons leaning out. */
export function wall(piece) {
    const random = randomFor(piece, 95);
    const L = piece.w * CELL;
    const z = piece.h * CELL * 0.55;
    const solid = new Solid();

    toned(solid, random, []);
    band(solid, [[L, z], [0, z]], 0, m(7), m(2), "stone-black", { closed: false, lean: 0.05 });

    for (let x = m(0.6); x < L; x += m(1.3)) {
        spike(solid, [x, m(7), z - m(0.4)], [0, 1, 0.25], m(1.4), m(0.28), "stone-black", { sides: 4 });
    }

    for (let x = m(2); x < L; x += m(4)) {
        solid.tube([[x, m(5.5), z + m(0.05)], [x + m(0.3), m(6.8), z + m(0.05)]], m(0.03), material("glow-violet"), { sides: 3 });
    }

    return solid.toObject();
}

/** A gate: an ogee-pointed lancet between two octagonal towers, jade spiders guarding it, silk between them. */
export function gatehouse(piece) {
    const random = randomFor(piece, 96);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);

    for (const side of [-1, 1]) {
        octTower(solid, W / 2 + side * m(3.6), D / 2, m(2), 0, m(10), random, { spire: 2.6 });
        spider(solid, W / 2 + side * m(2), 0, D - m(0.6), m(1.8), "jade-dark", { facing: 0 });
    }

    const way = { u0: m(0.5), u1: m(3.9), v0: 0, v1: m(6.5), depth: m(1.6), back: null, arch: "lancet", sides: material("stone-black") };

    solid.walls([[W / 2 - m(2.2), D / 2 - m(0.8)], [W / 2 + m(2.2), D / 2 - m(0.8)], [W / 2 + m(2.2), D / 2 + m(0.8)], [W / 2 - m(2.2), D / 2 + m(0.8)]], 0, m(8.5), { 0: [way], 2: [way] }, material("stone-black"));
    web(solid, [W / 2, m(9.5), D / 2 + m(0.9)], m(2.4), [0, 0, 1], { radials: 10, rings: 4, random });

    return solid.toObject();
}

/** An octagonal tower of black stone under a needle spire. */
export function tower(piece) {
    const random = randomFor(piece, 97);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const solid = new Solid();

    toned(solid, random, []);
    octTower(solid, W / 2, D / 2, Math.min(W, D) / 2 - m(1.2), 0, m(12), random, { spire: 2.6 });

    return solid.toObject();
}
