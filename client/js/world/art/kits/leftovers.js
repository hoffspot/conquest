// What's left where people lived once and no longer do (the ruined castles: kits/neutral.js and
// kits/castle.js RUINED): grey, weathered and charred timber, beams snapped off or fallen, posts
// standing where halls stood; barrels whole, tipped over or burst, their staves splayed and a hoop
// lying in the grass; crates, some broken open; a cart left on one wheel. Each made from its own
// random numbers, so no two heaps of leavings are alike.
//
// In world pixels as the kits are (5 to a metre).

import { material } from "../engine/materials.js";

const M = 5;
const m = (metres) => metres * M;

// Old wood: grey with weather, or charred where it burned
const WOOD = Object.freeze(["timber-grey", "timber-grey", "planks-char", "timber-char"]);
const woodOf = (random) => material(random.pick(WOOD));

const along3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * A beam from `a` to `b` (world pixels), `size` square, snapped off at its far end if `broken`:
 * shorter, its end ragged (a splinter or two standing out past it).
 */
export function oldBeam(solid, random, a, b, size, { broken = false, wood = woodOf(random) } = {}) {
    const end = broken ? along3(a, b, random.range(0.35, 0.8)) : b;

    solid.beam(a, end, size, size * random.range(0.85, 1), wood, { up: [random.range(-0.2, 0.2), 1, random.range(-0.2, 0.2)] });

    if (broken) {
        // (Its ragged end: splinters standing out past the break)
        const d = [end[0] - a[0], end[1] - a[1], end[2] - a[2]];
        const length = Math.hypot(...d) || 1;

        for (let k = random.int(1, 2); k > 0; k--) {
            const reach = random.range(0.15, 0.5) * size * 2.2;
            const off = [random.range(-0.3, 0.3) * size, random.range(-0.3, 0.3) * size, random.range(-0.3, 0.3) * size];
            const from = [end[0] + off[0], end[1] + off[1], end[2] + off[2]];

            solid.beam(from, [from[0] + (d[0] / length) * reach, from[1] + (d[1] / length) * reach, from[2] + (d[2] / length) * reach], size * 0.28, size * 0.22, wood, { ends: false });
        }
    }
}

// A barrel's body from end `a` to end `b` (world pixels), `r` round at its ends and bellying out
// in its middle: staves, two hoops
function cask(solid, a, b, r, staves, hoops) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(...d) || 1;
    const axis = d.map((v) => v / length);
    const side = Math.abs(axis[1]) < 0.9 ? [axis[2], 0, -axis[0]] : [1, 0, 0];
    const sideLength = Math.hypot(...side) || 1;
    const u = side.map((v) => v / sideLength);
    const w = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
    const ring = (t, radius) =>
        Array.from({ length: 10 }, (_, k) => {
            const angle = (k / 10) * Math.PI * 2;
            const [c, s] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
            const p = along3(a, b, t);

            return [p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s];
        });
    const rings = [ring(0, r), ring(0.5, r * 1.16), ring(1, r)];

    solid.loft(rings, staves, { smooth: true });
    solid.facing(rings[0], axis.map((v) => -v), staves);
    solid.facing(rings[2], axis, staves);

    for (const t of [0.18, 0.82]) {
        solid.loft([ring(t - 0.03, r * (1.07 + 0.02)), ring(t + 0.03, r * (1.09 + 0.02))], hoops, { smooth: true });
    }
}

/**
 * An old barrel at (x, y, z), standing (`whole`), tipped over on its side (`tipped`) or burst
 * (`burst`): its staves splayed out round where it stood, a hoop lying in the grass.
 */
export function oldBarrel(solid, random, [x, y, z], state = random.pick(["whole", "tipped", "burst", "burst"])) {
    const [height, r] = [m(0.9) * random.range(0.9, 1.1), m(0.27)];
    const staves = material(random.pick(["timber-grey", "planks-dark", "planks-char"]));
    const hoops = material("iron-black");

    if (state === "whole") {
        cask(solid, [x, y, z], [x, y + height, z], r, staves, hoops);
    } else if (state === "tipped") {
        const a = random.next() * Math.PI * 2;
        const [dx, dz] = [Math.cos(a) * height * 0.5, Math.sin(a) * height * 0.5];

        cask(solid, [x - dx, y + r * 1.05, z - dz], [x + dx, y + r * 1.05, z + dz], r, staves, hoops);
    } else {
        // (Its staves, where they fell: some leaning out from where it stood, some lying flat)
        const count = random.int(6, 9);

        for (let k = 0; k < count; k++) {
            const a = (k / count) * Math.PI * 2 + random.range(-0.2, 0.2);
            const [c, s] = [Math.cos(a), Math.sin(a)];
            const lean = random.range(0.4, 1.3);
            const foot = [x + c * r, y, z + s * r];
            const top = [x + c * (r + height * Math.sin(lean)), y + height * Math.cos(lean) * random.range(0.2, 1), z + s * (r + height * Math.sin(lean))];

            solid.beam(foot, top, m(0.12), m(0.025), staves, { up: [c, 0.4, s] });
        }

        solid.cylinder(x + random.range(-1, 1), z + random.range(-1, 1), y, y + m(0.04), r * 1.1, r * 1.1, hoops, { segments: 10, capped: false });
    }
}

/** An old crate at (x, y, z), `size` across, turned `turn`: whole, or broken open, boards gone. */
export function oldCrate(solid, random, [x, y, z], size, turn, broken = random.chance(0.5)) {
    const wood = material(random.pick(["timber-grey", "planks-dark"]));
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const at = (u, h, w) => [x + u * c - w * s, y + h, z + u * s + w * c];
    const half = size / 2;

    if (!broken) {
        solid.turnedBox(x, z, half, half, y, y + size, turn, wood);

        return;
    }

    // (Its frame, and a board or two left of each side)
    for (const [u, w] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
        solid.beam(at(u, 0, w), at(u, size * random.range(0.6, 1), w), m(0.07), m(0.07), wood);
    }

    for (const [u0, w0, u1, w1] of [[-half, -half, half, -half], [half, -half, half, half], [half, half, -half, half], [-half, half, -half, -half]]) {
        for (let k = random.int(0, 2); k > 0; k--) {
            const h = random.range(0.1, 0.8) * size;

            solid.beam(at(u0, h, w0), at(u1, h + random.range(-0.1, 0.1) * size, w1), m(0.1), m(0.025), wood, { up: [0, 0, 1] });
        }
    }

    solid.turnedBox(x, z, half, half, y, y + m(0.04), turn, wood);
}

/** A cart left on one wheel at (x, y, z), turned `turn`: its bed tipped, the other wheel lying by it. */
export function brokenCart(solid, random, [x, y, z], turn) {
    const wood = material("timber-grey");
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const at = (u, h, w) => [x + u * c - w * s, y + h, z + u * s + w * c];
    const wheel = (centre, flat) => {
        const r = m(0.55);
        const points = 10;

        for (let k = 0; k < points; k++) {
            const [a, b] = [(k / points) * Math.PI * 2, ((k + 1) / points) * Math.PI * 2];
            // (Upright, in the plane of the cart's length; or lying flat)
            const p = (angle) => (flat ? [centre[0] + Math.cos(angle) * r, centre[1], centre[2] + Math.sin(angle) * r] : [centre[0] + Math.cos(angle) * r * c, centre[1] + Math.sin(angle) * r, centre[2] + Math.cos(angle) * r * s]);

            solid.beam(p(a), p(b), m(0.1), m(0.08), wood);

            if (k % 2 === 0) {
                solid.beam(centre, p(a), m(0.05), m(0.05), wood);
            }
        }
    };

    // (The bed: tipped down at its broken side, its far end up on the wheel that held)
    const [low, high] = [m(0.1), m(0.75)];

    for (let k = 0; k < 5; k++) {
        const w = m(-0.5 + k * 0.25);

        solid.beam(at(-m(1), low, w), at(m(1), high, w), m(0.24), m(0.05), wood, { up: [-s * 0.3, 1, c * 0.3] });
    }

    wheel(at(m(0.7), m(0.55), m(0.7)), false);
    wheel(at(random.range(-m(1.5), -m(0.5)), m(0.05), m(-1.4)), true);

    // (Its shafts, one snapped)
    oldBeam(solid, random, at(m(1), high, -m(0.4)), at(m(2.6), m(0.1), -m(0.5)), m(0.1), { wood });
    oldBeam(solid, random, at(m(1), high, m(0.4)), at(m(2.6), m(0.1), m(0.5)), m(0.1), { broken: true, wood });
}

/**
 * The timbers of a building fallen in, round (x, y, z) `r` across: charred posts standing at
 * different heights where its walls were, and its beams fallen across the heap every which way.
 */
export function fallenTimbers(solid, random, [x, y, z], r) {
    for (let k = random.int(2, 4); k > 0; k--) {
        const a = random.next() * Math.PI * 2;
        const out = r * random.range(0.6, 1);
        const foot = [x + Math.cos(a) * out, y - m(0.3), z + Math.sin(a) * out];

        oldBeam(solid, random, foot, [foot[0] + random.range(-1, 1), y + m(random.range(0.8, 2.6)), foot[2] + random.range(-1, 1)], m(0.22), { broken: random.chance(0.6), wood: material("timber-char") });
    }

    for (let k = random.int(3, 5); k > 0; k--) {
        const a = random.next() * Math.PI * 2;
        const half = r * random.range(0.5, 1.1);
        const lift = random.range(0, 1);
        const [dx, dz] = [Math.cos(a) * half, Math.sin(a) * half];

        oldBeam(solid, random, [x - dx, y + m(0.1), z - dz], [x + dx, y + m(0.1) + m(lift), z + dz], m(0.2), { broken: random.chance(0.5) });
    }
}
