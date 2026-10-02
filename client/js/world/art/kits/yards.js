// The yards behind the peoples' houses (the terrain plan's M7c: their villages lived in; the
// chosen village pictures' "wattle and post-and-rail fences", "gardens", washing out to dry):
// each laid out with its town (core/setpieces/town.js yards: where its fences run, and its bed),
// built here the way its people would.
// - Its fences, along its sides and back where nothing stands (the house is at its front): the
//   humans' wattle hurdles or posts and rails, the elves' clipped hedges, the dark elves' black
//   stone kerbs with iron railings, the cat folk's mud walls, the lizard folk's reed screens, the
//   orcs' sharpened stakes; a gateway in a long back, and now and then a yard left open.
// - Its bed, if it has one: raised in its people's edging (boards, stone, mud, cane; the orcs'
//   just heaped), in rows of what they grow (cabbages, leeks, beans up their canes, squashes,
//   herbs, flowers pink, white and gold).
// - A washing line across its back now and then, the washing on it hanging in the breeze
//   (world/cloth.js); the orcs' a rack of hides drying.
// Built in the art's world pixels (five to a metre), x across the yard from its left side, z in
// from its back; standing on the ground as the yard's lies (`lie`: lieOf). Everything about it
// not laid out with its town (which fence, the crops, the washing) is from where it is, so it's
// the same every time. The drawing's alone: in no one's way.

import { hashOf } from "../../../core/noise.js";
import { YARD_LINE } from "../../../core/setpieces/town.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";

const M = 5;
const m = (metres) => metres * M;

/**
 * How each people's yards look: their fences (one of FENCES, picked a yard at a time), what edges
 * their beds (a material, or null for a heaped bed), what they grow (CROPS), and the colours of
 * their washing (sRGB: the orcs' hides).
 */
export const YARD_LOOKS = Object.freeze({
    human: { fences: ["wattle", "wattle", "rails"], edging: "planks-dark", crops: ["cabbage", "leek", "bean", "cabbage", "flower", "herb"], washing: ["#ece5d2", "#e2dac4", "#d4c7a4", "#a9b6c2", "#b9705a", "#8a9466"] },
    elf: { fences: ["hedge"], edging: "stone-moon", crops: ["flower", "herb", "flower-white", "bean", "leek"], washing: ["#eceee2", "#cdd9c4", "#bccbdb", "#dccfae"] },
    darkElf: { fences: ["railing"], edging: "stone-black", crops: ["leek", "herb", "cabbage", "flower-white"], washing: ["#5d4c70", "#403b4a", "#7d6d8c", "#c9c1cd"] },
    cat: { fences: ["mud"], edging: "mud", crops: ["squash", "leek", "flower-gold", "herb"], washing: ["#e8c47c", "#c9733c", "#ebdfbb", "#4d5f8c"] },
    lizard: { fences: ["reeds"], edging: "bamboo", crops: ["squash", "cabbage", "herb", "leek"], washing: ["#cbc28c", "#8caa6c", "#dbd3b3"] },
    orc: { fences: ["stakes"], edging: null, crops: ["cabbage", "leek", "cabbage"], washing: ["#8a6446", "#6e4e36", "#a37c54", "#5a4030"] },
});

/**
 * The yards (metres): how many are left unfenced, how wide a gateway in a back is and how long a
 * back must be to have one, how many of those with room for a washing line have one (or, the
 * orcs', a rack of hides; where it's strung: YARD_LINE), how high it's strung, how far it sags,
 * how far into the ground posts go, and how high a bed's raised.
 */
export const YARDS = Object.freeze({ open: 0.12, gate: 1, gated: 3, line: 0.45, strung: 1.9, sag: 0.12, sink: 0.3, bed: 0.14 });

/**
 * The fences (metres): how high, how thick, how far apart their posts are (and how thick those),
 * and what they're made of.
 */
export const FENCES = Object.freeze({
    wattle: { height: 0.95, thick: 0.07, every: 1.8, post: 0.05, panel: "wattle", weave: [0.5, 3.5], wood: "timber-grey" },
    rails: { height: 1.1, every: 2.2, post: 0.12, rails: [0.42, 0.9], rail: 0.08, wood: "timber-grey" },
    hedge: { height: 0.8, thick: 0.5, leaves: "leafscale-sage" },
    railing: { height: 1.05, thick: 0.34, kerb: 0.42, bars: 0.38, bar: 0.03, stone: "stone-black", iron: "iron-black" },
    mud: { height: 0.9, thick: 0.3, mud: "mud" },
    reeds: { height: 1.15, thick: 0.08, every: 1.6, post: 0.05, panel: "reeds", wood: "bamboo" },
    stakes: { height: [1.05, 1.45], every: 0.45, post: 0.06, wood: "bark" },
});

/**
 * What's grown in the beds: how far apart the plants stand along a row (metres), and a flower's
 * colour.
 */
export const CROPS = Object.freeze({
    cabbage: { every: 0.45 },
    leek: { every: 0.25 },
    bean: { every: 0.4 },
    squash: { every: 0.7 },
    herb: { every: 0.35 },
    flower: { every: 0.35, bloom: "flowers" },
    "flower-white": { every: 0.35, bloom: "linen" },
    "flower-gold": { every: 0.35, bloom: "flowers-gold" },
});

// How far apart a bed's rows are, how far in from its edges they start (metres), and how many of
// its rows are bare (dug, or just sown)
const ROWS = 0.5;
const MARGIN = 0.2;
const BARE = 0.25;

// The washing on a line: each piece's width and drop (metres): a shirt, a sheet, a cloth, a smock;
// and the most on one line
const WASHING = [[0.55, 0.7], [1.1, 1.15], [0.38, 0.45], [0.55, 0.95], [0.9, 0.9]];
const PEGGED = 7;

/**
 * How the ground lies under a yard (a layout's, as chunks and towns draw it: x, y its middle
 * from `origin`, metres): its heights (metres) at its back left, back right, front left and front
 * right corners, over the ground under its middle (where it's stood: town3d.js grounded), for
 * `lie`.
 */
export function lieOf(piece, groundAt, [ox, oz] = [0, 0]) {
    const at = (u, v) => groundAt(...pointOf(piece, u, v, [ox, oz]));
    const [w, d] = [piece.w * 4, piece.h * 4];
    const middle = groundAt(ox + piece.x, oz + piece.y);

    return [at(0, 0), at(w, 0), at(0, d), at(w, d)].map((height) => height - middle);
}

/**
 * Points over a yard (a layout's, as lieOf takes it: [x, y] metres), a little in from its edges:
 * to look at what the world has under it.
 */
export function pointsOf(piece, [ox, oz] = [0, 0]) {
    const [w, d] = [piece.w * 4, piece.h * 4];

    return [0.4, w / 2, w - 0.4].flatMap((u) => [0.4, d / 2, d - 0.4].map((v) => pointOf(piece, u, v, [ox, oz])));
}

// Where a point of a yard is (metres across it from its left side, `u`, and in from its back, `v`)
function pointOf(piece, u, v, [ox, oz]) {
    const [w, d] = [piece.w * 4, piece.h * 4];
    const [c, s] = [Math.cos(piece.facing), Math.sin(piece.facing)];

    return [ox + piece.x + (u - w / 2) * c + (v - d / 2) * s, oz + piece.y - (u - w / 2) * s + (v - d / 2) * c];
}

/**
 * A yard (layoutTown's yards, with `lie`: lieOf, or level without it), built facing south as the
 * kits build, in world pixels.
 */
export function yard(piece) {
    const solid = new Solid();
    const look = YARD_LOOKS[piece.people] ?? YARD_LOOKS.human;
    const [W, D] = [piece.w * 20, piece.h * 20];
    const [l00, l10, l01, l11] = (piece.lie ?? [0, 0, 0, 0]).map(m);
    // (The ground's height at a point of the yard, in pixels, over where it's stood)
    const lift = (x, z) => {
        const [u, v] = [Math.min(Math.max(x / W, 0), 1), Math.min(Math.max(z / D, 0), 1)];

        return l00 * (1 - u) * (1 - v) + l10 * u * (1 - v) + l01 * (1 - u) * v + l11 * u * v;
    };
    // (A number from 0 to 1 for this yard and what's asked of it, the same every time)
    const [hx, hy] = [Math.floor(piece.x * 8), Math.floor(piece.y * 8)];
    const roll = (salt, k = 0) => hashOf(hx + k * 7919, hy, salt);

    // (A little darker at the foot, as everything standing on the ground is: the props')
    solid.tone = (point, normal) => {
        const k = normal[1] < -0.45 ? 0.5 : 0.72 + 0.28 * Math.min(1, Math.max(0, point[1] - lift(point[0], point[2])) / m(0.6));

        return [k, k, k];
    };

    if (roll(1) >= YARDS.open) {
        fences(solid, piece, look, { W, lift, roll });
    }

    if (piece.bed) {
        bed(solid, piece.bed.map(m), look, { lift, roll });
    }

    if (piece.line && roll(2) < YARDS.line) {
        washing(solid, look, piece.people === "orc", { W, lift, roll });
    }

    return solid.toObject();
}

// A yard's fences: along each run of its sides the layout fenced (left, back, right), in its
// people's way, a gateway let into a long back
function fences(solid, piece, look, { W, lift, roll }) {
    const kind = look.fences[Math.floor(roll(3) * look.fences.length)];
    const fence = FENCES[kind];
    const inset = m(fence.thick ?? fence.post) / 2;
    // (Each side's line, as metres along it: in from the yard's edge by half the fence's thickness)
    const sides = [
        { at: (t) => [inset, m(t)], out: [-1, 0, 0] },
        { at: (t) => [m(t), inset], out: [0, 0, -1] },
        { at: (t) => [W - inset, m(t)], out: [1, 0, 0] },
    ];

    piece.fence.forEach((runs, k) => {
        for (const [from, to] of runs) {
            // (A gateway in the back, if it's long enough, somewhere along its middle)
            const gate = k === 1 && to - from >= YARDS.gated ? from + 1 + roll(4) * (to - from - 2 - YARDS.gate) : null;
            const pieces = gate === null ? [[from, to]] : [[from, gate], [gate + YARDS.gate, to]];

            for (const [a, b] of pieces) {
                if (b - a > 0.2) {
                    run(solid, kind, fence, sides[k], [a, b], lift, roll);
                }
            }
        }
    });
}

// A run of fence from `a` to `b` metres along a side (`side`: at, out)
function run(solid, kind, fence, { at, out }, [a, b], lift, roll) {
    const point = (t, y = 0) => {
        const [x, z] = at(t);

        return [x, lift(x, z) + m(y), z];
    };
    const posts = (every) => {
        const count = Math.max(1, Math.round((b - a) / every));

        return Array.from({ length: count + 1 }, (_, k) => a + ((b - a) * k) / count);
    };
    const sink = m(YARDS.sink);

    if (kind === "wattle" || kind === "reeds") {
        // (Hurdles, or screens of reeds, between round posts)
        const stops = posts(fence.every);

        for (let k = 1; k < stops.length; k++) {
            slab(solid, point(stops[k - 1]), point(stops[k]), out, m(fence.height), m(fence.thick), material(fence.panel), { below: m(0.08), weave: fence.weave });
        }

        for (const t of stops) {
            const [x, y, z] = point(t);

            solid.lathe(x, z, [[m(fence.post), y - sink], [m(fence.post), y + m(fence.height + 0.1)], [0, y + m(fence.height + 0.16)]], material(fence.wood), { segments: 5 });
        }
    } else if (kind === "rails") {
        // (Squared posts, and rails pegged across them)
        const stops = posts(fence.every);

        for (const t of stops) {
            const [x, y, z] = point(t);

            solid.beam([x, y - sink, z], [x, y + m(fence.height), z], m(fence.post), m(fence.post), material(fence.wood), { up: [0, 0, 1] });
        }

        for (let k = 1; k < stops.length; k++) {
            for (const height of fence.rails) {
                const [p, q] = [point(stops[k - 1], height), point(stops[k], height)];

                solid.beam(p, q, m(fence.rail), m(fence.rail * 1.3), material(fence.wood), { ends: false });
            }
        }
    } else if (kind === "hedge" || kind === "mud") {
        // (A clipped hedge, or a mud wall, its top rounded)
        const [p, q] = [point(a), point(b)];
        const stuff = material(fence.leaves ?? fence.mud);

        slab(solid, p, q, out, m(fence.height), m(fence.thick), stuff, { below: m(0.1), ends: true });
        solid.prism([p[0], p[1] + m(fence.height), p[2]], [q[0], q[1] + m(fence.height), q[2]], m(fence.thick) / 2, m(kind === "hedge" ? 0.12 : 0.08), stuff);
    } else if (kind === "railing") {
        // (A kerb of black stone, iron bars standing in it and a rail along their tops)
        const [p, q] = [point(a), point(b)];
        const iron = material(fence.iron);

        slab(solid, p, q, out, m(fence.kerb), m(fence.thick), material(fence.stone), { below: m(0.1), ends: true });

        // (Its bars only worth drawing near: the kerb's seen from further off)
        solid.near(() => {
            for (const t of posts(fence.bars)) {
                const [x, y, z] = point(t);

                solid.beam([x, y + m(fence.kerb), z], [x, y + m(fence.height), z], m(fence.bar), m(fence.bar), iron, { up: [0, 0, 1], ends: false });
            }

            solid.beam(point(a, fence.height - 0.05), point(b, fence.height - 0.05), m(0.05), m(0.04), iron, { ends: false });
        });
    } else if (kind === "stakes") {
        // (Stakes sharpened to points, each its own height, close set: only worth drawing near)
        solid.near(() => {
            for (const [k, t] of posts(fence.every).entries()) {
                const [x, y, z] = point(t);
                const height = m(fence.height[0] + (fence.height[1] - fence.height[0]) * roll(5, k));

                solid.lathe(x, z, [[m(fence.post), y - sink], [m(fence.post) * 0.9, y + height - m(0.18)], [0, y + height]], material(fence.wood), { segments: 4, smooth: false });
            }
        });
    }
}

// A slab standing on the ground along a line (from `p` to `q`, [x, y, z] at the ground), `height`
// high and `thick` thick, facing `out` either side: its faces, its top, and its ends if asked
// for; going `below` into the ground. Its faces' picture stretched along it and up it as `weave`
// says (a hurdle's: the rods woven along it fine), or laid on as the solid lays it
function slab(solid, p, q, out, height, thick, stuff, { below = 0, ends = false, weave = null } = {}) {
    const half = [out[0] * thick / 2, 0, out[2] * thick / 2];
    const corner = (point, side, up) => [point[0] + half[0] * side, point[1] + up, point[2] + half[2] * side];
    const [front, back] = [1, -1].map((side) => [corner(p, side, -below), corner(q, side, -below), corner(q, side, height), corner(p, side, height)]);
    const along = [q[0] - p[0], 0, q[2] - p[2]];
    const long = Math.sqrt(along[0] * along[0] + along[2] * along[2]);
    const uvs = weave && [[0, -below], [long, -below], [long, height], [0, height]].map(([u, v]) => [u * weave[0], v * weave[1]]);

    solid.facing(front, out, stuff, uvs);
    solid.facing(back, out.map((x) => -x), stuff, uvs);
    solid.facing([front[3], front[2], back[2], back[3]], [0, 1, 0], stuff);

    if (ends) {
        solid.facing([front[0], back[0], back[3], front[3]], along.map((x) => -x), stuff);
        solid.facing([front[1], back[1], back[2], front[2]], along, stuff);
    }
}

// A yard's bed ([x0, z0, x1, z1], pixels): raised in its people's edging (or heaped, the orcs'),
// its soil a little over the ground, in rows of what they grow
function bed(solid, [x0, z0, x1, z1], look, { lift, roll }) {
    const raise = m(YARDS.bed);
    const top = (x, z) => lift(x, z) + raise;
    const soil = material("soil");
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

    solid.facing(corners.map(([x, z]) => [x, top(x, z), z]), [0, 1, 0], soil);

    if (look.edging) {
        // (Boards, or a kerb, round it: a little over its soil)
        corners.forEach(([x, z], k) => {
            const [nx, nz] = corners[(k + 1) % 4];
            const out = [Math.sign(nz - z), 0, -Math.sign(nx - x)];

            slab(solid, [x, lift(x, z), z], [nx, lift(nx, nz), nz], out, raise + m(0.05), m(0.05), material(look.edging), { below: m(0.06), ends: true });
        });
    } else {
        // (Heaped: its soil sloping down to the ground all round)
        const grow = m(0.25);

        corners.forEach(([x, z], k) => {
            const [nx, nz] = corners[(k + 1) % 4];
            const out = [Math.sign(nz - z), 0, -Math.sign(nx - x)];
            const [ox, oz] = [out[0] * grow, out[2] * grow];

            solid.facing([[x, top(x, z), z], [nx, top(nx, nz), nz], [nx + ox, lift(nx + ox, nz + oz) - m(0.04), nz + oz], [x + ox, lift(x + ox, z + oz) - m(0.04), z + oz]], [out[0], 1, out[2]], soil);
        });
    }

    // (Its rows along its longer side, each of one crop)
    const across = x1 - x0 >= z1 - z0;
    const [length, breadth] = across ? [x1 - x0, z1 - z0] : [z1 - z0, x1 - x0];
    const rows = Math.max(1, Math.floor((breadth - m(MARGIN) * 2) / m(ROWS)) + 1);
    const spread = rows > 1 ? (breadth - m(MARGIN) * 2) / (rows - 1) : 0;

    for (let r = 0; r < rows; r++) {
        if (roll(12, r) < BARE) {
            continue;
        }

        const crop = look.crops[Math.floor(roll(10, r) * look.crops.length)];
        const along = m(CROPS[crop].every);
        const count = Math.max(1, Math.floor((length - m(MARGIN) * 2) / along) + 1);
        const off = rows > 1 ? m(MARGIN) + r * spread : breadth / 2;
        const start = (length - (count - 1) * along) / 2;

        for (let k = 0; k < count; k++) {
            const t = start + k * along;
            const [x, z] = across ? [x0 + t, z0 + off] : [x0 + off, z0 + t];

            solid.near(() => plant(solid, crop, x, top(x, z) - m(0.02), z, roll(11, r * 97 + k)));
        }
    }
}

// A plant of a crop standing at (x, y, z), `seed` (0 to 1) making it a little its own
function plant(solid, crop, x, y, z, seed) {
    const size = 0.85 + 0.3 * seed;
    const leaves = material("leaves");
    const lathe = (profile, stuff, segments = 5) => solid.lathe(x, z, profile.map(([r, h]) => [m(r * size), y + m(h * size)]), stuff, { segments });

    if (crop === "cabbage") {
        lathe([[0.12, 0], [0.21, 0.09], [0.14, 0.2], [0, 0.23]], material("cabbage"), 6);
    } else if (crop === "leek") {
        lathe([[0.05, 0], [0, 0.42]], leaves, 3);
    } else if (crop === "bean") {
        // (A cane, the beans grown up it, leafy, thinning towards its top)
        solid.beam([x, y - m(0.2), z], [x, y + m(1.6), z], m(0.025), m(0.025), material("timber-light"), { up: [0, 0, 1], ends: false });
        lathe([[0.07, 0.05], [0.15, 0.4], [0.13, 1.15], [0, 1.38]], material("greens"));
    } else if (crop === "squash") {
        // (Its leaves sprawling, a squash lying among them)
        lathe([[0.3, 0], [0.33, 0.07], [0, 0.14]], material("greens"), 6);
        solid.lathe(x + m(0.12), z + m(0.1), [[m(0.11), y + m(0.04)], [m(0.13), y + m(0.12)], [0, y + m(0.2)]], material("squash"), { segments: 5 });
    } else if (crop === "herb") {
        lathe([[0.12, 0], [0.16, 0.12], [0, 0.22]], material("jade-dark"));
    } else {
        // (A clump of flowers: its leaves, and three heads of flowers over them)
        const bloom = material(CROPS[crop].bloom);

        lathe([[0.12, 0], [0.17, 0.16], [0, 0.26]], leaves);

        for (const [dx, dz, up] of [[0.06, 0, 0.3], [-0.05, 0.05, 0.27], [-0.02, -0.07, 0.33]]) {
            solid.lathe(x + m(dx * size), z + m(dz * size), [[m(0.07 * size), y + m((up - 0.05) * size)], [0, y + m(up * size)]], bloom, { segments: 4 });
        }
    }
}

// A washing line across the back of a yard, the washing hanging on it in the breeze (or, the
// orcs', a rack with hides drying)
function washing(solid, look, rack, { W, lift, roll }) {
    const z = m(YARD_LINE.back);
    const [xa, xb] = [m(YARD_LINE.side), W - m(YARD_LINE.side)];
    const high = m(rack ? 1.75 : YARDS.strung);
    const wood = material(rack ? "bark" : "timber-grey");
    const [ya, yb] = [lift(xa, z), lift(xb, z)];

    for (const [x, y] of [[xa, ya], [xb, yb]]) {
        solid.lathe(x, z, [[m(0.05), y - m(YARDS.sink)], [m(0.045), y + high + m(0.1)], [0, y + high + m(0.14)]], wood, { segments: 5 });
    }

    // (The line, sagging between them: or the rack's pole, straight)
    const sag = rack ? 0 : m(YARDS.sag) * Math.min(1, (xb - xa) / m(4));
    const lineAt = (x) => {
        const t = (x - xa) / (xb - xa);

        return ya + (yb - ya) * t + high - sag * 4 * t * (1 - t);
    };
    const steps = rack ? 1 : 4;

    // (The rope only worth drawing near: too fine to see from further off)
    solid.near(() => {
        for (let k = 0; k < steps; k++) {
            const [p, q] = [xa + ((xb - xa) * k) / steps, xa + ((xb - xa) * (k + 1)) / steps];

            solid.beam([p, lineAt(p), z], [q, lineAt(q), z], m(rack ? 0.07 : 0.018), m(rack ? 0.07 : 0.018), rack ? wood : material("rope"), { ends: rack });
        }
    });

    // (The washing, pegged out along it: as much as fits, a gap between each)
    const washing = rack ? [[0.85, 1.15], [0.95, 1.25], [0.8, 1.05]] : WASHING;
    const cloth = (solid.cloth ??= []);

    for (let x = xa + m(0.3), k = 0; k < PEGGED; k++) {
        const [width, drop] = washing[Math.floor(roll(20, k) * washing.length)];
        const middle = x + m(width) / 2;

        if (x + m(width) > xb - m(0.3)) {
            break;
        }

        // (Now and then a gap where nothing's pegged out)
        if (roll(21, k) > 0.15) {
            cloth.push({ at: [middle, lineAt(middle) - m(0.02), z], out: [0, 0, 1], width: m(width), drop: m(drop), kind: "wash", look: "square", colour: look.washing[Math.floor(roll(22, k) * look.washing.length)] });
        }

        x += m(width) + m(0.12 + 0.2 * roll(23, k));
    }
}
