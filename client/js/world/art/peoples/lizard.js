// The lizard folk's buildings: thatch on stilts for the many, stepped limestone for the gods;
// after the Maya (the commoner's apsidal house laid out with a cord, its steep hipped thatch; the
// stepped temples red on white, their roof combs and carved friezes), the stilted villages of
// the Bajau and Brunei's water town, the Toraja's saddle roofs sweeping up at the gables, the
// Batak's carved beam ends, and the Marsh Arabs' reed halls. Everything stands up out of the wet:
// houses on stilts over the water or the marsh, reached by ladders and plank walks; the grand
// buildings on stone platforms. Serpent heads rear from stair ends and beam ends, eggs crown the
// peaks, jade and red paint the gables.

import { material } from "../engine/materials.js";
import { inset, Solid } from "../engine/solid.js";
import { CELL, circle, ladder, m, pole, post, randomFor, wallPoint, weathering } from "./kit.js";

const WASHES = ["plaster-red", "plaster-white", "reeds", "palm", "stone-lime"];

export function toned(solid, random, eaves = [], facing = 0) {
    solid.tone = weathering({ seed: random.int(0, 1e6), eaves, facing, washes: WASHES, tint: [random.range(0.95, 1.04), random.range(0.95, 1.04), random.range(0.93, 1.02)], dirt: 0.4, mottle: ["palm", "thatch-palm", "stone-lime", "glyphs"] });
}

/**
 * An apsidal plan (the Maya house's: a rectangle with rounded ends), `length` along x and
 * `width` across, round (cx, cz), `t` of the way from its outline in to its ridge (a line along
 * its middle): the rings a hipped roof is lofted through.
 */
export function apsidal(cx, cz, length, width, t = 0, steps = 5) {
    const r = (width / 2) * (1 - t);
    const reach = length / 2 - width / 2;
    const points = [];

    for (const [ex, from] of [[reach, -Math.PI / 2], [-reach, Math.PI / 2]]) {
        for (let k = 0; k <= steps; k++) {
            const a = from + (k * Math.PI) / steps;

            points.push([cx + ex + Math.cos(a) * r, cz + Math.sin(a) * r]);
        }
    }

    return points;
}

/**
 * A serpent's head (carved, or of stone) at `at` ([x, y, z]) facing `facing` (radians as
 * characters face), `size` long: a blunt snout, its jaws a little open, a ridge over its eyes,
 * a crest; its neck running back `neck` along the way it came from.
 */
export function serpent(solid, [x, y, z], facing, size, { name = "stone-lime", neck = null, jaws = "plaster-red", eyes = "jade" } = {}) {
    const [dx, dz] = [Math.sin(facing), Math.cos(facing)];
    const at = (forward, up, side = 0) => [x + dx * forward + dz * side, y + up, z + dz * forward - dx * side];
    const stuff = material(name);

    // (The head: a tube tapering to the snout, the lower jaw below it)
    solid.tube([at(-size * 0.2, size * 0.05), at(size * 0.25, size * 0.08), at(size * 0.7, size * 0.02), at(size, -size * 0.02)], [size * 0.3, size * 0.3, size * 0.22, size * 0.1], stuff, { sides: 6, caps: true });
    solid.tube([at(0, -size * 0.18), at(size * 0.6, -size * 0.2), at(size * 0.9, -size * 0.28)], [size * 0.2, size * 0.14, size * 0.05], stuff, { sides: 5, caps: true });
    solid.tube([at(size * 0.25, -size * 0.06), at(size * 0.85, -size * 0.12)], [size * 0.12, size * 0.04], material(jaws), { sides: 4 });

    for (const side of [-1, 1]) {
        const eye = at(size * 0.3, size * 0.28, side * size * 0.2);

        solid.box(eye[0] - size * 0.07, eye[1] - size * 0.05, eye[2] - size * 0.07, eye[0] + size * 0.07, eye[1] + size * 0.05, eye[2] + size * 0.07, material(eyes));
    }

    // (A crest of spines back along its head)
    for (let k = 0; k < 4; k++) {
        const base = at(size * (0.2 - k * 0.2), size * 0.3);

        solid.tube([base, [base[0] - dx * size * 0.1, base[1] + size * 0.3, base[2] - dz * size * 0.1]], [size * 0.08, 0], material(jaws), { sides: 3 });
    }

    if (neck) {
        solid.tube([at(-size * 0.15, 0), ...neck], [size * 0.28, ...neck.map(() => size * 0.28)], stuff, { sides: 6 });
    }
}

/** An egg standing on (x, y, z), `size` tall, pale (or speckled green, `name`). */
export function egg(solid, x, y, z, size, name = "egg") {
    solid.lathe(x, z, [[0, y], [size * 0.3, y + size * 0.12], [size * 0.38, y + size * 0.42], [size * 0.3, y + size * 0.78], [0, y + size]], material(name), { segments: 8 });
}

/**
 * Stilts under a deck (its outline's corners, [x, z]): posts about `every` apart round its edge
 * and through its middle, each from the ground (or the water) up to the deck at `floor`, a
 * little out of true, braced crosswise on its long sides; and the deck itself, planked.
 */
export function stilts(solid, outline, floor, random, { every = m(1.8), name = "timber", deck = "planks-pale", thick = m(0.18) } = {}) {
    const xs = outline.map(([x]) => x);
    const zs = outline.map(([, z]) => z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const across = Math.max(1, Math.round((x1 - x0) / every));
    const down = Math.max(1, Math.round((z1 - z0) / every));
    const inside = (px, pz) => {
        let hit = false;

        for (let k = 0, last = outline.length - 1; k < outline.length; last = k++) {
            const [[ax, az], [bx, bz]] = [outline[k], outline[last]];

            if (az > pz !== bz > pz && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) {
                hit = !hit;
            }
        }

        return hit;
    };

    for (let i = 0; i <= across; i++) {
        for (let j = 0; j <= down; j++) {
            const [x, z] = [x0 + m(0.2) + ((x1 - x0 - m(0.4)) * i) / across, z0 + m(0.2) + ((z1 - z0 - m(0.4)) * j) / down];

            if (!inside(x, z)) {
                continue;
            }

            post(solid, x + random.range(-1, 1) * m(0.08), 0, z + random.range(-1, 1) * m(0.08), floor + m(0.05), thick / 2, name, { sides: 5, lean: [random.range(-1, 1) * m(0.06), random.range(-1, 1) * m(0.06)] });
        }
    }

    // Braces crosswise under the long sides
    for (const z of [z0 + m(0.2), z1 - m(0.2)]) {
        for (let i = 0; i < across; i++) {
            const [a, b] = [x0 + m(0.2) + ((x1 - x0 - m(0.4)) * i) / across, x0 + m(0.2) + ((x1 - x0 - m(0.4)) * (i + 1)) / across];

            if (inside((a + b) / 2, z + (z < (z0 + z1) / 2 ? m(0.1) : -m(0.1)))) {
                pole(solid, [a, floor * 0.15, z], [b, floor * 0.85, z], m(0.05), name, { sides: 4 });
            }
        }
    }

    solid.extrude(outline, floor, floor + m(0.2), material(deck), { bottom: true });
}

/** A rail round (part of) a deck: posts and a rail along a run of points ([x, z]). */
export function rail(solid, points, floor, { name = "bamboo", height = m(0.9) } = {}) {
    for (let k = 0; k < points.length - 1; k++) {
        const [[ax, az], [bx, bz]] = [points[k], points[k + 1]];

        pole(solid, [ax, floor + height, az], [bx, floor + height, bz], m(0.045), name, { sides: 4 });
        pole(solid, [ax, floor + height * 0.5, az], [bx, floor + height * 0.5, bz], m(0.03), name, { sides: 3 });
        post(solid, ax, floor, az, height, m(0.05), name, { sides: 4 });
    }

    const [lx, lz] = points.at(-1);

    post(solid, lx, floor, lz, height, m(0.05), name, { sides: 4 });
}

/**
 * A hipped roof of palm thatch over an apsidal (or any) plan: rings lofted from its eaves in to
 * its ridge (`rings(t)`: the plan at t of the way in), rising `height`, thick at its eaves.
 */
export function hipThatch(solid, rings, eaves, height, name, { steps = 5, curve = 1.1 } = {}) {
    const loft = Array.from({ length: steps + 1 }, (_, k) => {
        const t = k / steps;

        return rings(t).map(([x, z]) => [x, eaves + height * (1 - (1 - t) ** curve), z]);
    });

    solid.loft(loft, material(name));
    // (Its thick eaves, and the underside)
    solid.loft([rings(0).map(([x, z]) => [x, eaves - m(0.35), z]), loft[0]], material(name));
    solid.loft([rings(0.25).map(([x, z]) => [x, eaves + height * 0.2, z]), rings(0).map(([x, z]) => [x, eaves - m(0.35), z])], material("thatch-grey"), { out: [0, -1, 0] });

    return eaves + height;
}

// A woven wall (reeds or a lattice of bamboo) round a plan on a deck, with a door and a window
function screenWalls(solid, outline, floor, height, random, { name = "reeds", door = 0, doorWidth = m(0.9) } = {}) {
    const lengthOf = (k) => Math.hypot(outline[(k + 1) % outline.length][0] - outline[k][0], outline[(k + 1) % outline.length][1] - outline[k][1]);
    const openings = { [door]: [{ u0: lengthOf(door) / 2 - doorWidth / 2, u1: lengthOf(door) / 2 + doorWidth / 2, v0: 0, v1: m(1.85), depth: m(0.15), back: material(random.chance(0.5) ? "shadow" : "matting") }] };

    for (let k = 0; k < outline.length; k++) {
        if (k !== door && lengthOf(k) > m(1.4) && random.chance(0.35)) {
            openings[k] = [{ u0: lengthOf(k) / 2 - m(0.4), u1: lengthOf(k) / 2 + m(0.4), v0: m(0.8), v1: m(1.5), depth: m(0.15), back: material("shadow") }];
        }
    }

    const faces = solid.walls(outline, floor + m(0.2), height, openings, material(name));

    // (Posts at its corners and a rail along its head)
    for (const face of faces) {
        const at = wallPoint(face);

        solid.member(at(0, 0), at(0, height), face.out, m(0.14), m(0.06), material("timber"));
        solid.member(at(0, height - m(0.08)), at(face.length, height - m(0.08)), face.out, m(0.12), m(0.05), material("bamboo"));
    }

    return faces;
}

// --- Houses ---

/**
 * A marsh hut: the Maya's apsidal house on stilts over the wet, woven walls, a steep hipped roof
 * of palm thatch, a ladder up to its door, an egg on its ridge.
 */
export function marshHut(solid, cx, cz, { length = m(6), width = m(3.6), floor = m(1.8), random, wealth = 0.5 }) {
    const deck = apsidal(cx, cz, length + m(1.4), width + m(1.4), 0, 4);

    stilts(solid, deck, floor, random);

    const plan = apsidal(cx, cz, length, width, 0, 4);
    const front = plan.findIndex(([x, z], k) => {
        const [nx, nz] = plan[(k + 1) % plan.length];

        return Math.abs((z + nz) / 2 - (cz + width / 2)) < m(0.05) && Math.abs((x + nx) / 2 - cx) < length / 2;
    });

    screenWalls(solid, plan, floor, m(1.9), random, { name: random.pick(["reeds", "reeds", "bamboo"]), door: Math.max(0, front) });

    const eaves = floor + m(0.2) + m(1.9);
    const peak = hipThatch(solid, (t) => apsidal(cx, cz, length + m(1.6) * (1 - t), (width + m(1.6)) * (1 - t * 0.98), 0, 4), eaves, (width / 2 + m(0.8)) * 1.3, random.pick(["palm", "thatch-palm"]));

    solid.tube([[cx - length / 2 + width / 2, peak + m(0.05), cz], [cx + length / 2 - width / 2, peak + m(0.05), cz]], m(0.12), material("thatch-grey"), { sides: 4, caps: true });
    egg(solid, cx, peak, cz, m(0.45), wealth > 0.6 ? "jade" : "egg");
    ladder(solid, [cx, 0, cz + width / 2 + m(1.8)], [cx, floor + m(0.2), cz + width / 2 + m(0.6)], m(0.5), "bamboo");

    return peak;
}

/**
 * A deck house: a box of woven walls under a steep gabled roof of palm, on stilts, an open deck
 * before it with a rail, serpent heads on its gable beams.
 */
export function deckHouse(solid, x0, z0, x1, z1, { floor = m(2), random, wealth = 0.5 }) {
    const deckDepth = m(2.4);
    const deck = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

    stilts(solid, deck, floor, random);

    const house = [[x0 + m(0.3), z0 + m(0.3)], [x1 - m(0.3), z0 + m(0.3)], [x1 - m(0.3), z1 - deckDepth], [x0 + m(0.3), z1 - deckDepth]];

    screenWalls(solid, house, floor, m(2), random, { name: random.pick(["reeds", "bamboo"]), door: 2 });

    // The roof: gabled along x, steep, its gables' beams crossing into serpents' heads
    const eaves = floor + m(2.2);
    const [hz0, hz1] = [z0 + m(0.3), z1 - deckDepth];
    const mid = (hz0 + hz1) / 2;
    const rise = (hz1 - hz0) * 0.75;
    const over = m(0.7);
    const top = eaves + rise;
    const thatch = material(random.pick(["palm", "thatch-palm"]));

    for (const [a, b] of [[hz1 + over, mid], [hz0 - over, mid]]) {
        const slope = [[x0 - m(0.2), eaves - m(0.3), a], [x1 + m(0.2), eaves - m(0.3), a], [x1 + m(0.5), top, b], [x0 - m(0.5), top, b]];

        solid.facing(slope, [0, 1, a > mid ? 1 : -1], thatch);
        solid.facing(slope, [0, -1, 0], material("thatch-grey"));
    }

    for (const [x, sign] of [[x0 + m(0.3), -1], [x1 - m(0.3), 1]]) {
        solid.facing([[x, eaves, hz0], [x, eaves, hz1], [x, top - m(0.2), mid]], [sign, 0, 0], material(wealth > 0.5 ? "plaster-red" : "reeds"));

        // (Its crossed gable beams, carved)
        for (const side of [-1, 1]) {
            const from = [x + sign * m(0.5), eaves - m(0.1), mid + side * ((hz1 - hz0) / 2 + over)];
            const to = [x + sign * m(0.5), top + m(0.8), mid - side * m(0.5)];

            pole(solid, from, to, m(0.08), "timber", { sides: 4 });
        }

        if (wealth > 0.4) {
            serpent(solid, [x + sign * m(0.6), top + m(0.8), mid], sign > 0 ? Math.PI / 2 : -Math.PI / 2, m(0.7), { name: "timber" });
        }
    }

    rail(solid, [[x0 + m(0.1), z1 - deckDepth], [x0 + m(0.1), z1 - m(0.1)], [x1 - m(0.1), z1 - m(0.1)], [x1 - m(0.1), z1 - deckDepth]], floor + m(0.2));
    ladder(solid, [(x0 + x1) / 2 + m(1.2), 0, z1 + m(0.9)], [(x0 + x1) / 2 + m(1.2), floor + m(0.2), z1 - m(0.2)], m(0.5), "bamboo");

    return top;
}

/**
 * A clan house: a saddle roof sagging in the middle and sweeping up and out into long gables
 * at both ends, each propped on a pole, a painted gable, carved heads at the ridge's ends; on
 * stilts, a ladder up to its door in its long side.
 */
export function saddleHouse(solid, x0, z0, x1, z1, { floor = m(1.8), random, wealth = 0.5 }) {
    const deck = [[x0 + m(1.2), z0], [x1 - m(1.2), z0], [x1 - m(1.2), z1], [x0 + m(1.2), z1]];

    stilts(solid, deck, floor, random, { name: "timber" });

    const house = [[x0 + m(1.5), z0 + m(0.4)], [x1 - m(1.5), z0 + m(0.4)], [x1 - m(1.5), z1 - m(0.8)], [x0 + m(1.5), z1 - m(0.8)]];

    screenWalls(solid, house, floor, m(2.1), random, { name: wealth > 0.5 ? "plaster-red" : "planks-pale", door: 2, doorWidth: m(1) });

    // The roof, lofted along x: each section a steep arch, the ridge sagging mid-way and rising
    // to the ends, the eaves swept up with it
    const eaves = floor + m(2.3);
    const [cz, half] = [(z0 + z1) / 2 - m(0.2), (z1 - z0) / 2 + m(0.5)];
    const sections = 12;
    const rings = Array.from({ length: sections + 1 }, (_, k) => {
        const s = k / sections;
        const x = x0 + s * (x1 - x0);
        const sweep = (2 * s - 1) ** 2;
        const ridge = eaves + m(3.2) + sweep * m(2.2);
        const low = eaves - m(0.2) + sweep * m(1.1);
        const width = half * (1 - sweep * 0.25);

        return Array.from({ length: 7 }, (_, i) => {
            const across = Math.cos((Math.PI * i) / 6);

            return [x, low + (ridge - low) * (1 - Math.abs(across) ** 1.3), cz + across * width];
        });
    });

    solid.loft(rings, material(random.pick(["palm", "thatch-palm"])), { closed: false });
    solid.loft(rings.map((ring) => ring.map(([x, y, z]) => [x, y - m(0.2), z])), material("thatch-grey"), { closed: false, out: [0, -1, 0] });

    // The gables: painted triangles under the swept ends, poles propping them, heads on the ridge
    for (const [ring, sign] of [[rings[1], -1], [rings[sections - 1], 1]]) {
        const [x] = ring[0];
        const tri = [ring[1], ring[5], ring[3]].map(([px, py, pz]) => [px, py - m(0.3), pz]);

        solid.facing(tri, [sign, 0, 0], material(wealth > 0.3 ? "plaster-red" : "planks-pale"));

        // (A smaller triangle painted within it, jade or white)
        const middle = [0, 1, 2].map((i) => (tri[0][i] + tri[1][i] + tri[2][i]) / 3);
        const inner = tri.map((p) => [p[0] + sign * m(0.03), p[1] + (middle[1] - p[1]) * 0.45, p[2] + (middle[2] - p[2]) * 0.45]);

        solid.facing(inner, [sign, 0, 0], material(wealth > 0.6 ? "jade" : "plaster-white"), undefined, null);
        post(solid, x + sign * m(0.2), 0, cz, ring[3][1] - m(0.5), m(0.14), "timber", { sides: 6 });
        serpent(solid, ring[3], sign > 0 ? Math.PI / 2 : -Math.PI / 2, m(0.9), { name: "timber", jaws: "plaster-red" });
    }

    ladder(solid, [(x0 + x1) / 2, 0, z1 + m(0.9)], [(x0 + x1) / 2, floor + m(0.2), z1 - m(0.3)], m(0.55), "bamboo");

    return eaves + m(5.4);
}

/**
 * A reed-arch house: arches of bundled reeds bent over a reed platform, covered in mats (a
 * little of the Marsh Arabs' guest halls), its front a lattice with a door.
 */
export function reedHouse(solid, x0, z0, x1, z1, { arches = 4, platform = m(0.45) } = {}) {
    const [cx, span] = [(x0 + x1) / 2, (x1 - x0) / 2];
    const height = span * 1.6;

    solid.extrude([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0, platform, material("reeds"), { top: material("matting") });

    // (Each arch a parabola, y = height · (1 - across²), running north to south along the hall)
    const ringAt = (z) => Array.from({ length: 9 }, (_, i) => {
        const across = Math.cos((Math.PI * i) / 8);

        return [cx + across * span, platform + height * (1 - across * across), z];
    });
    const [az0, az1] = [z0 + m(0.4), z1 - m(0.4)];
    const rings = Array.from({ length: arches }, (_, k) => ringAt(az0 + ((az1 - az0) * k) / (arches - 1)));

    solid.loft(rings, material("matting"), { closed: false });

    for (const ring of rings) {
        solid.tube(ring.map(([x, y, z]) => [x, y + m(0.05), z]), m(0.2), material("reeds"), { sides: 5 });
    }

    // (The back closed with mats, the front a lattice round its door, two bundles of reeds
    // standing either side of it)
    solid.facing(rings[0], [0, 0, -1], material("matting"));
    solid.facing(rings.at(-1), [0, 0, 1], material("bamboo"));

    const front = az1 + m(0.03);

    solid.facing([[cx - m(0.5), platform, front], [cx + m(0.5), platform, front], [cx + m(0.5), platform + m(1.8), front], [cx - m(0.5), platform + m(1.8), front]], [0, 0, 1], material("shadow"));

    for (const side of [-1, 1]) {
        solid.tube([[cx + side * m(0.75), 0, front + m(0.12)], [cx + side * m(0.75), platform + m(2.6), front + m(0.12)]], m(0.22), material("reeds"), { sides: 6, caps: true });
    }

    return platform + height;
}

/**
 * A lizard folk's house on its lot: its `type` if asked (marsh, deck, saddle, reed), or one to
 * suit the lot; standing higher over water if its piece says so (the settlement's lagoon, drawn
 * with its water).
 */
export function house(piece) {
    const random = randomFor(piece);
    const [W, D] = [piece.w * CELL, piece.h * CELL];
    const wealth = piece.wealth ?? random.range(0, 1);
    const type = piece.type ?? (piece.back ? random.pick(["reed", "marsh"]) : W * D > m(10) * m(10) ? "saddle" : random.pick(["marsh", "deck", "marsh", "reed"]));
    const solid = new Solid();
    const wet = piece.water ?? false;
    const floor = wet ? m(2.8) : m(random.range(1.4, 2));

    toned(solid, random, [floor + m(2.2)], piece.facing ?? 0);

    if (type === "marsh") {
        const width = Math.min(m(4), D - m(2.6));

        marshHut(solid, W / 2, D / 2 - m(0.4), { length: Math.max(width + m(1), Math.min(m(7), W - m(2))), width, floor, random, wealth });
    } else if (type === "deck") {
        deckHouse(solid, m(0.4), m(0.4), W - m(0.4), D - m(0.8), { floor, random, wealth });
    } else if (type === "saddle") {
        saddleHouse(solid, m(0.2), m(0.6), W - m(0.2), D - m(1), { floor, random, wealth });
    } else {
        reedHouse(solid, m(0.8), m(0.8), W - m(0.8), D - m(0.8), { arches: Math.max(3, Math.round((D - m(1.6)) / m(2))) });
    }

    return solid.toObject();
}

/** What the building lab shows of the lizard folk's houses: each type, and its lot (plots). */
export const GALLERY = Object.freeze({
    houses: [["marsh", 2.2, 2], ["deck", 1.8, 2.3], ["saddle", 3.2, 2.2], ["reed", 1.6, 2.4]],
});

export { circle, inset };
