// What the elves and the dark elves build with alike: one library of curves (petal roofs, the
// whiplash line of their brackets and rails, ogee and lancet openings, bud lamps and crescent
// finials, rings of decking round a trunk, spiral stairs) that the elves round off into buds and
// leaves and the dark elves sharpen into thorns, fangs and needles (`sharp`). And the great trees
// the elves build into, grown by the game's own tree kit (trees.js) and planted with the town's.

import { material } from "../engine/materials.js";
import { add3, cross, sub, times, unit } from "../engine/solid.js";
import { TREE_KINDS } from "../../../core/setpieces/pieces.js";
import { circle, lamp, m, pole, post, spike } from "./kit.js";

/** The index of a kind of tree among the game's (TREE_KINDS), the nth grown that way. */
export function variantOf(kind, n = 0) {
    const all = TREE_KINDS.map(([own], k) => (own === kind ? k : -1)).filter((k) => k >= 0);

    return all[n % all.length];
}

/**
 * A great tree grown by the game's tree kit, planted with the piece that asks for it (x, z in
 * the piece's world pixels): kept on `trees` (the list the piece's object carries as its
 * userData.trees). Returns roughly how thick its trunk is (world pixels, its radius) at `height`.
 */
export function greatTree(trees, x, z, { kind = "beech", n = 0, size = 2.4, height = 0 } = {}) {
    trees.push({ x, z, variant: variantOf(kind, n), size });

    const radius = { beech: 0.27, oak: 0.34, spruce: 0.24, pine: 0.26, birch: 0.17 }[kind] ?? 0.3;
    const reach = { beech: 0.9, oak: 0.62, spruce: 1, pine: 1, birch: 0.96 }[kind] ?? 0.8;
    const taper = { beech: 0.3, oak: 0.45, spruce: 0.08, pine: 0.2, birch: 0.22 }[kind] ?? 0.3;
    const tall = { beech: 9, oak: 8, spruce: 8.5, pine: 9.5, birch: 8.5 }[kind] ?? 8.5;
    const t = Math.min(1, height / m(tall * size * reach));

    return m(radius * size * 1.1 * (1 - taper * t));
}

/**
 * A petal roof: from its eaves (radius `r` round (cx, cz) at height y) swooping up to its crown
 * `rise` above, its edge in `petals` petals whose tips reach out and lift (`lift`); sharpened, the
 * petals narrow into points and the crown runs up into a needle. Its underside is seen from below.
 * Returns its crown's height.
 */
export function petalRoof(solid, cx, cz, y, r, rise, name, { petals = 6, lift = m(0.5), swell = 0.24, segments = null, rings = 6, sharp = false, under = null, phase = Math.PI / 2, crown = 0, trim = sharp ? "iron-black" : "verdigris" } = {}) {
    const count = segments ?? petals * 4;
    const tip = (a) => ((1 + Math.cos(petals * (a - phase))) / 2) ** (sharp ? 5 : 1.6);
    const ring = (t) => Array.from({ length: count }, (_, i) => {
        const a = (i * Math.PI * 2) / count;
        const bump = tip(a);
        const radius = r * (1 + swell * bump) * (1 - t) ** (sharp ? 1 : 1.25) + crown * t;
        const up = y + lift * bump * (1 - t) ** 2 + rise * (1 - (1 - t) ** (sharp ? 1.1 : 1.8));

        return [cx + Math.cos(a) * radius, up, cz + Math.sin(a) * radius];
    });
    const loft = Array.from({ length: rings + 1 }, (_, k) => ring(k / rings));

    solid.loft(loft, material(name));
    solid.loft([loft[0], loft[1].map(([x, py, z]) => [cx + (x - cx) * 0.7, py - m(0.3), cz + (z - cz) * 0.7])], material(under ?? name), { out: [0, -1, 0] });

    // (A metal edge along its scalloped eaves, drawing the petals)
    if (trim) {
        solid.tube([...loft[0], loft[0][0]], m(0.07), material(trim), { sides: 3 });
    }

    return y + rise;
}

/**
 * The whiplash: a curve from `from` to `to` ([x, y, z]) bowing out `bow` to one side (`side`, a
 * direction) and curling tight at its end (`curl`), swept as a slender rod: brackets, rails,
 * tendrils, a lamp's crook. Sharpened, it ends in a thorn.
 */
export function whiplash(solid, from, to, side, name, { bow = 0.3, curl = 0.25, r = m(0.06), steps = 8, sharp = false } = {}) {
    const d = sub(to, from);
    const length = Math.hypot(...d);
    const s = times(unit(side), length * bow);
    const points = Array.from({ length: steps + 1 }, (_, k) => {
        const t = k / steps;

        // (A cubic: off to the side in the middle, swinging back in at its end)
        return add3(add3(from, times(d, t)), times(s, 4 * t * (1 - t) * (1 - t * 0.6)));
    });
    const end = points.at(-1);
    const back = unit(sub(points.at(-2), end));
    const turn = unit(cross(back, unit(side)));

    // (The curl: a small loop back round at its end)
    for (let k = 1; k <= 4; k++) {
        const a = (k / 4) * Math.PI * 1.3;

        points.push(add3(end, add3(times(back, Math.sin(a) * length * curl * 0.35), times(turn, (1 - Math.cos(a)) * length * curl * 0.35))));
    }

    solid.tube(points, points.map((_, k) => (sharp && k > points.length - 4 ? r * 0.3 * (points.length - k) / 3 : r * (1 - (k / points.length) * 0.5))), material(name), { sides: 4 });
}

/** A crescent (a moon's, or a horn's) standing on (x, y, z) facing `facing`, `size` across. */
export function crescent(solid, x, y, z, size, name, { facing = 0, sharp = false } = {}) {
    const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
    const points = Array.from({ length: 9 }, (_, k) => {
        const a = Math.PI * (0.1 + (k / 8) * 0.8);

        return [x - Math.cos(a) * ax * size * 0.5, y + size * 0.15 + Math.sin(a) * size * 0.5 - size * 0.35, z - Math.cos(a) * az * size * 0.5];
    });

    pole(solid, [x, y - m(0.1), z], [x, y + size * 0.3, z], size * 0.05, name, { sides: 4 });
    solid.tube(points, points.map((_, k) => size * 0.07 * Math.sin((Math.PI * (k + 0.5)) / 9) ** (sharp ? 2 : 0.6) + (sharp ? 0 : size * 0.01)), material(name), { sides: 4 });
}

/**
 * A ring of decking round a trunk at (cx, cz), r0 to r1 across, standing on `y`, from `from` to
 * `to` radians round (a sector, or all the way), borne on knee braces running down to the trunk
 * (whiplash-curved, or thorny); a rail round its edge.
 */
export function ringDeck(solid, cx, cz, r0, r1, y, { from = 0, to = Math.PI * 2, name = "heartwood", rail = "silver", braces = 6, sharp = false, railHeight = m(1) } = {}) {
    const full = to - from >= Math.PI * 2 - 1e-6;
    const count = Math.max(6, Math.round(((to - from) / (Math.PI * 2)) * 24));
    const at = (r, a, h) => [cx + Math.cos(a) * r, h, cz + Math.sin(a) * r];
    const angles = Array.from({ length: count + 1 }, (_, k) => from + ((to - from) * k) / count);
    const stuff = material(name);

    for (let k = 0; k < count; k++) {
        const [a, b] = [angles[k], angles[k + 1]];

        solid.facing([at(r0, a, y), at(r1, a, y), at(r1, b, y), at(r0, b, y)], [0, 1, 0], stuff);
        solid.facing([at(r0, a, y - m(0.25)), at(r1, a, y - m(0.25)), at(r1, b, y - m(0.25)), at(r0, b, y - m(0.25))], [0, -1, 0], stuff);
        solid.facing([at(r1, a, y - m(0.25)), at(r1, b, y - m(0.25)), at(r1, b, y), at(r1, a, y)], [Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2)], stuff);
    }

    if (!full) {
        for (const a of [from, to]) {
            solid.facing([at(r0, a, y - m(0.25)), at(r1, a, y - m(0.25)), at(r1, a, y), at(r0, a, y)], [-Math.sin(a), 0, Math.cos(a)], stuff);
        }
    }

    // The braces under it, and the rail round its edge
    for (let k = 0; k < braces; k++) {
        const a = from + ((to - from) * (k + 0.5)) / braces;
        const [foot, head] = [at(r0 * 0.9, a, y - (r1 - r0) * 1.1), at(r1 - m(0.3), a, y - m(0.25))];

        whiplash(solid, foot, head, [Math.cos(a), -0.4, Math.sin(a)], name, { bow: 0.25, curl: 0.12, r: m(0.08), sharp });
    }

    if (rail) {
        const top = angles.map((a) => at(r1 - m(0.1), a, y + railHeight));

        solid.tube(full ? [...top, top[0]] : top, m(0.04), material(rail), { sides: 4 });

        for (let k = 0; k <= count; k += 2) {
            const a = angles[k];

            if (sharp) {
                spike(solid, at(r1 - m(0.1), a, y), [0, 1, 0], railHeight + m(0.35), m(0.035), rail, { sides: 3 });
            } else {
                pole(solid, at(r1 - m(0.1), a, y), at(r1 - m(0.1), a, y + railHeight), m(0.03), rail, { sides: 4 });
            }
        }
    }
}

/**
 * A spiral stair round a trunk at (cx, cz), `r` out from it, from y0 up to y1, `width` wide:
 * treads on brackets from the trunk, a rail on the outside. Starts facing `from` radians round.
 */
export function spiralStair(solid, cx, cz, r, y0, y1, { from = Math.PI / 2, width = m(1), name = "heartwood", rail = "silver", turnRise = m(3.2) } = {}) {
    const count = Math.max(4, Math.round((y1 - y0) / m(0.2)));
    const turn = ((y1 - y0) / turnRise) * Math.PI * 2;
    const stuff = material(name);
    const railPoints = [];

    for (let k = 0; k < count; k++) {
        const [a, b] = [from + (turn * k) / count, from + (turn * (k + 1.3)) / count];
        const y = y0 + ((y1 - y0) * (k + 1)) / count;
        const [ri, ro] = [r - width / 2, r + width / 2];
        const at = (rr, aa, h) => [cx + Math.cos(aa) * rr, h, cz + Math.sin(aa) * rr];

        solid.facing([at(ri, a, y), at(ro, a, y), at(ro, b, y), at(ri, b, y)], [0, 1, 0], stuff);
        solid.facing([at(ri, a, y - m(0.08)), at(ro, a, y - m(0.08)), at(ro, b, y - m(0.08)), at(ri, b, y - m(0.08))], [0, -1, 0], stuff);
        solid.facing([at(ro, a, y - m(0.08)), at(ro, b, y - m(0.08)), at(ro, b, y), at(ro, a, y)], [Math.cos(a), 0, Math.sin(a)], stuff);
        railPoints.push(at(ro - m(0.05), (a + b) / 2, y + m(0.9)));

        if (k % 4 === 0) {
            pole(solid, at(ro - m(0.05), (a + b) / 2, y), at(ro - m(0.05), (a + b) / 2, y + m(0.9)), m(0.03), rail, { sides: 3 });
        }
    }

    solid.tube(railPoints, m(0.035), material(rail), { sides: 3 });
}

/**
 * A needle spire over an octagon (radius `r` at y), `height` tall, ringed at its foot by little
 * gablets (the dark elves' tent roofs), a finial (a thorn, or a crescent) at its tip.
 */
export function needleSpire(solid, cx, cz, y, r, height, name, { sides = 8, gablets = true, trim = "iron-black", tip = "spike", glow = null } = {}) {
    solid.lathe(cx, cz, [[r, y], [r * 0.55, y + height * 0.35], [r * 0.18, y + height * 0.8], [0, y + height]], material(name), { segments: sides, from: Math.PI / sides, to: Math.PI / sides + Math.PI * 2, smooth: false });

    if (gablets) {
        for (let k = 0; k < sides; k++) {
            const a = ((k + 0.5) * Math.PI * 2) / sides;
            const [ox, oz] = [Math.cos(a), Math.sin(a)];
            const half = r * Math.sin(Math.PI / sides) * 0.9;
            const [px, pz] = [-oz, ox];
            const base = [cx + ox * r * Math.cos(Math.PI / sides), y, cz + oz * r * Math.cos(Math.PI / sides)];
            const tri = [[base[0] - px * half, y, base[2] - pz * half], [base[0] + px * half, y, base[2] + pz * half], [base[0], y + half * 2.4, base[2]]];

            solid.facing(tri, [ox, 0, oz], material(name));
        }
    }

    if (glow) {
        // (Faerie fire along its ribs)
        for (let k = 0; k < sides; k += 2) {
            const a = (k * Math.PI * 2) / sides + Math.PI / sides;

            solid.tube([[cx + Math.cos(a) * r * 1.01, y, cz + Math.sin(a) * r * 1.01], [cx + Math.cos(a) * r * 0.56, y + height * 0.35, cz + Math.sin(a) * r * 0.56], [cx + Math.cos(a) * r * 0.19, y + height * 0.8, cz + Math.sin(a) * r * 0.19]], m(0.03), material(glow), { sides: 3 });
        }
    }

    if (tip === "spike") {
        spike(solid, [cx, y + height - m(0.1), cz], [0, 1, 0], m(1.2), m(0.06), trim, { sides: 4 });
    } else if (tip === "crescent") {
        crescent(solid, cx, y + height, cz, m(0.9), trim);
    }

    return y + height;
}

/** A hanging bud lamp on a whiplash crook from a post or a wall at `at` ([x, y, z]), out along `out`. */
export function budLamp(solid, [x, y, z], [ox, oz], { light = "glow-lamp", crook = "verdigris", reach = m(0.7), sharp = false } = {}) {
    const end = [x + ox * reach, y + m(0.25), z + oz * reach];

    whiplash(solid, [x, y, z], end, [0, 1, 0], crook, { bow: 0.35, curl: 0.05, r: m(0.035), sharp });
    lamp(solid, [end[0], end[1] - m(0.45), end[2]], light, { size: m(0.3), frame: null, shape: sharp ? "orb" : "bud", hang: m(0.3) });
}

/**
 * A spider (a statue, a guardian, a shrine's crown): its body and head, eight legs arched out and
 * down round it, standing on (x, y, z), `size` across its legs, facing `facing`.
 */
export function spider(solid, x, y, z, size, name, { facing = 0, eyes = "glow-violet" } = {}) {
    const [dx, dz] = [Math.sin(facing), Math.cos(facing)];
    const body = y + size * 0.3;

    solid.lathe(x - dx * size * 0.18, z - dz * size * 0.18, [[0, body - size * 0.14], [size * 0.2, body - size * 0.06], [size * 0.22, body + size * 0.06], [size * 0.12, body + size * 0.16], [0, body + size * 0.18]], material(name), { segments: 8 });
    solid.lathe(x + dx * size * 0.1, z + dz * size * 0.1, [[0, body - size * 0.08], [size * 0.1, body - size * 0.02], [size * 0.1, body + size * 0.06], [0, body + size * 0.1]], material(name), { segments: 6 });

    for (const side of [-1, 1]) {
        const [ex, ez] = [x + dx * size * 0.19 + dz * side * size * 0.04, z + dz * size * 0.19 - dx * side * size * 0.04];

        solid.box(ex - size * 0.02, body + size * 0.02, ez - size * 0.02, ex + size * 0.02, body + size * 0.06, ez + size * 0.02, material(eyes));

        for (let k = 0; k < 4; k++) {
            const a = Math.atan2(dz, dx) + side * (0.6 + k * 0.55);
            const [lx, lz] = [Math.cos(a), Math.sin(a)];
            const hip = [x + lx * size * 0.08, body, z + lz * size * 0.08];
            const knee = [x + lx * size * 0.3, body + size * 0.22, z + lz * size * 0.3];
            const foot = [x + lx * size * 0.5, y, z + lz * size * 0.5];

            solid.tube([hip, knee, foot], [size * 0.03, size * 0.025, size * 0.01], material(name), { sides: 4 });
        }
    }
}

/**
 * A branching column (Gaudí's, a stone tree): a shaft from (x, y0, z) rising `height`, forking at
 * two thirds up into `boughs` limbs spreading `spread` out to carry what's above.
 */
export function treeColumn(solid, x, y0, z, height, r, name, { boughs = 3, spread = m(1.2), phase = 0 } = {}) {
    const fork = y0 + height * 0.66;

    solid.tube([[x, y0, z], [x, y0 + height * 0.3, z], [x, fork, z]], [r * 1.25, r, r * 0.85], material(name), { sides: 8, caps: true });

    for (let k = 0; k < boughs; k++) {
        const a = phase + (k * Math.PI * 2) / boughs;
        const [bx, bz] = [Math.cos(a) * spread, Math.sin(a) * spread];

        solid.tube([[x, fork, z], [x + bx * 0.45, fork + height * 0.17, z + bz * 0.45], [x + bx, y0 + height, z + bz]], [r * 0.7, r * 0.55, r * 0.45], material(name), { sides: 6, caps: true });
    }
}

export { circle, post };
