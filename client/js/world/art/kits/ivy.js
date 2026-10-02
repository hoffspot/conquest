// Ivy on the old walls (terrain plan M7b-3c; the research report behind M7b: "Moss, streaks and
// ivy cost arithmetic, not draws"; the user's reference shot of a ruined castle): hanging in
// curtains from their broken tops, as it grows over a ruin left alone. Each curtain is draped over
// the top's edge and hangs down the face in a mass of dark leaves standing a little proud of it,
// shorter at its sides, its foot ragged where its strands hang on down.
// - Cards of leaves cut out of their picture (engine/leafcards.js: the same program as the
//   hedges' sprigs), so all the ivy in a chunk is one draw; casting no shadow, as the sprigs
//   don't (a card's shadow would be its whole rectangle).
// - Laid on a face as a function of where along it and how far proud (wallFace's, ringFace's), so
//   straight walls and round towers take it alike. In the kits' world pixels, five to a metre.

import { leafCards } from "../engine/leafcards.js";
import { topAt } from "./decay.js";

// World pixels in a metre
const M = 5;

/**
 * How ivy grows on old walls (metres): a curtain `width` across, a strand every `strand` along it,
 * hanging `reach` of the wall below its top (at most `longest`) and shorter towards its sides,
 * standing `proud` of the face at its thickest, draped `over` the top's edge; about one curtain
 * every `every` along a face, `chance` of them, none within `clear` of an opening or a buttress,
 * none where the wall stands less than `least`; its picture `copy` across.
 */
export const IVY = Object.freeze({ width: [1.5, 4.5], strand: 0.45, reach: [0.35, 0.85], longest: 7, proud: 0.16, over: 0.35, every: 5, chance: 0.7, clear: 0.3, least: 1.2, copy: 1.6 });

// Ivy's greens, darkest first, and the bronze of its old leaves
const GREENS = ["#1b3013", "#233d17", "#2d4c1d", "#385b22", "#46692a"];
const BRONZE = "#4d4822";

let material = null;

/** Ivy's material (its picture painted once; none in Node). */
export function ivyMaterial() {
    if (!material) {
        material = leafCards("ivy", typeof document !== "undefined" ? ivyPicture() : null, 0x2c4a1e, { repeat: true });
        material.userData.shadow = false;
    }

    return material;
}

/**
 * A crumbled wall's face to hang ivy on (crumbledWall's `at`, `top`, `from`; its face at `v`,
 * facing `side`), down to `base`: { place(u, y, proud) (a point `u` along it, `y` up, `proud` out
 * of the face: inwards over its top if less than nothing), out(u) (the way it faces), heightAt(u)
 * (its top), base }.
 */
export function wallFace(at, top, from, v, side, base) {
    const o = at(0, 0, 0);
    const outward = at(0, 0, side).map((value, k) => value - o[k]);

    return { place: (u, y, proud) => at(from + u, y, v + side * proud), out: () => outward, heightAt: (u) => topAt(top, u), base };
}

/**
 * A crumbled ring's outer face (crumbledRing's: round (cx, cz), `outer` its radius, its rim's
 * `heights` evenly round from angle 0), down to `base`, as wallFace's; `u` round it from angle 0.
 */
export function ringFace(cx, cz, outer, base, heights) {
    const n = heights.length;
    const angleOf = (u) => u / outer;

    return {
        place: (u, y, proud) => [cx + Math.cos(angleOf(u)) * (outer + proud), y, cz + Math.sin(angleOf(u)) * (outer + proud)],
        out: (u) => [Math.cos(angleOf(u)), 0, Math.sin(angleOf(u))],
        heightAt: (u) => {
            const k = ((angleOf(u) / (Math.PI * 2)) * n + n * 8) % n;
            const i = Math.floor(k);

            return heights[i] + (heights[(i + 1) % n] - heights[i]) * (k - i);
        },
        base,
    };
}

/**
 * A curtain of ivy hanging from a face's top (wallFace's, ringFace's) from u0 to u1 along it:
 * over the top's edge, down the face, standing `proud` of it (world pixels); its strands each as
 * long as the slow sway along it and its own say. Its corners are coloured: darkest just under
 * the top, where it's thickest, lighter down to its new growth at the foot.
 */
export function ivyCurtain(solid, random, face, [u0, u1], { proud = IVY.proud * M } = {}) {
    const { place, out, heightAt, base } = face;
    const ivy = ivyMaterial();
    const columns = Math.max(1, Math.round((u1 - u0) / (IVY.strand * M)));
    const reach = random.range(...IVY.reach);
    const [phase, tint] = [random.next() * 10, [random.range(0.86, 1.08), random.range(0.94, 1.06), random.range(0.84, 1)]];
    const colours = new Map();
    const corner = (u, y, d, shade) => {
        const point = place(u, y, d);

        colours.set(point, tint.map((t) => t * shade));

        return point;
    };
    const tone = (point) => colours.get(point) ?? [1, 1, 1];
    const strands = [];

    for (let k = 0; k <= columns; k++) {
        const u = u0 + ((u1 - u0) * k) / columns;
        const top = heightAt(u);
        // (Shorter towards its sides; swaying slowly along it, and each strand its own)
        const side = Math.min(1, 0.3 + (Math.min(k, columns - k) / columns) * 3.5);
        const sway = 0.7 + 0.3 * Math.sin(phase + k * 0.83) * Math.sin(phase * 1.7 + k * 0.29) + random.range(-0.12, 0.12);
        const hang = Math.max(M * 0.3, Math.min(IVY.longest * M, (top - base) * reach * sway * side));

        strands.push({ u, top, hang, s: (u - u0) / (IVY.copy * M) });
    }

    for (let k = 0; k < columns; k++) {
        const [a, b] = [strands[k], strands[k + 1]];
        const mid = out((a.u + b.u) / 2);
        // (Each strand from over the top, to its edge, a little way down, to its foot)
        const rows = [a, b].map(({ u, top, hang }) => [
            corner(u, top + M * 0.06, -IVY.over * M, 0.8),
            corner(u, top + M * 0.1, proud * 0.5, 0.66),
            corner(u, top - hang * 0.45, proud, 0.82),
            corner(u, top - hang, proud * 0.8, 1),
        ]);
        const v = [0, 0.06, 0.06 + 0.94 * 0.45, 1];

        for (let r = 0; r < 3; r++) {
            const facing = r === 0 ? [0, 1, 0] : mid;

            solid.facing([rows[0][r], rows[1][r], rows[1][r + 1], rows[0][r + 1]], facing, ivy, [[a.s, v[r]], [b.s, v[r]], [b.s, v[r + 1]], [a.s, v[r + 1]]], tone);
        }
    }
}

/**
 * Ivy along a face (wallFace's, ringFace's) `length` long: a curtain about every IVY.every, now
 * and then, none over its openings or what stands out of it (`clear`: [[u0, u1]], kept IVY.clear
 * from) and none where it stands too low; `proud` as ivyCurtain's. What it hung: [[u0, u1]].
 */
export function ivyAlong(solid, random, face, length, { clear = [], proud, every = IVY.every, chance = IVY.chance } = {}) {
    const hung = [];

    for (let u = random.range(0, every * M * 0.6); u < length; u += every * M * random.range(0.6, 1.4)) {
        const width = random.range(...IVY.width) * M;
        const [a, b] = [Math.max(0, u - width / 2), Math.min(length, u + width / 2)];

        if (!random.chance(chance) || b - a < IVY.width[0] * M * 0.6) {
            continue;
        }

        const lowest = Math.min(...Array.from({ length: 9 }, (_, k) => face.heightAt(a + ((b - a) * k) / 8)));

        if (lowest - face.base < IVY.least * M || clear.some(([c0, c1]) => b > c0 - IVY.clear * M && a < c1 + IVY.clear * M)) {
            continue;
        }

        ivyCurtain(solid, random, face, [a, b], { proud });
        hung.push([a, b]);
    }

    return hung;
}

// Ivy's leaves hanging from its stems, 256 pixels square, tiling across: a dense mat of leaves
// over most of it, dark inside where the light doesn't reach, its lower edge ragged; below that,
// strands with their leaves thinning out to their tips
function ivyPicture() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const size = 256;
    let k = 0;
    const random = () => {
        // (The same picture every time)
        const x = Math.sin(++k * 12.9898 + 78.233) * 43758.5453;

        return x - Math.floor(x);
    };
    const across = (x, reach, draw) => {
        for (const dx of [-size, 0, size]) {
            if (x + dx > -reach && x + dx < size + reach) {
                context.save();
                context.translate(dx, 0);
                draw();
                context.restore();
            }
        }
    };
    // (Where the mat ends, across it: slow waves, tiling, between about half and four fifths down)
    const phases = [random() * 6.28, random() * 6.28, random() * 6.28];
    const edge = (x) => size * (0.66 + 0.09 * Math.sin((x / size) * 6.28 + phases[0]) + 0.06 * Math.sin((x / size) * 12.57 + phases[1]) + 0.04 * Math.sin((x / size) * 31.4 + phases[2]));

    canvas.width = canvas.height = size;
    context.lineCap = "round";

    // (The dark inside of the mat, under its leaves)
    context.fillStyle = "#132310";
    context.beginPath();
    context.moveTo(0, 0);

    for (let x = 0; x <= size; x += 4) {
        context.lineTo(x, edge(x) - 14);
    }

    context.lineTo(size, 0);
    context.closePath();
    context.fill();

    // (Its strands: from inside the mat down past its edge, wandering, each to its own length)
    const stems = Array.from({ length: 26 }, () => {
        const x0 = random() * size;
        const points = [[x0, edge(x0) - 30]];
        const end = Math.min(size - 4, edge(x0) + 20 + random() * 70);

        while (points.at(-1)[1] < end) {
            const [x, y] = points.at(-1);

            points.push([x + (random() - 0.5) * 12, y + 9 + random() * 7]);
        }

        return points;
    });

    context.strokeStyle = "#3a3322";
    context.lineWidth = 2;

    for (const points of stems) {
        across(points[0][0], 40, () => {
            context.beginPath();
            points.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
            context.stroke();
        });
    }

    const leafAt = (x, y, length, shade) =>
        across(x, length, () => {
            context.save();
            context.translate(x, y);
            context.rotate(Math.PI + (random() - 0.5) * 1.6);
            ivyLeaf(context, length, random() < 0.015 ? BRONZE : GREENS[shade], "rgba(170, 190, 130, 0.4)");
            context.restore();
        });

    // (The mat's leaves, the darker ones first, deeper in; hanging, their tips down)
    for (let layer = 0; layer < GREENS.length; layer++) {
        for (let n = 0; n < 150; n++) {
            const x = random() * size;
            const y = random() * (edge(x) - 6);

            leafAt(x, y, 17 + random() * 9, layer);
        }
    }

    // (Along the strands below it, fewer the further down)
    for (const points of stems) {
        for (const [i, [x, y]] of points.entries()) {
            const below = Math.max(0, (y - edge(x)) / 90);

            for (let n = 0; n < 2; n++) {
                if (random() > below * 0.7 || i === points.length - 1) {
                    leafAt(x + (random() - 0.5) * 14, y + (random() - 0.5) * 8, 13 + random() * 8 * (1 - below * 0.5), 1 + Math.floor(random() * (GREENS.length - 1)));
                }
            }
        }
    }

    return canvas;
}

// An ivy leaf, its stalk at (0, 0), pointing up the y axis (negative), `length` long: broad, with
// five rounded lobes, the middle one longest, the lowest two short and swept back
function ivyLeaf(context, length, fill, vein) {
    const lobes = [
        [-1.95, 0.42],
        [-1.0, 0.7],
        [0, 1],
        [1.0, 0.7],
        [1.95, 0.42],
    ];
    const point = (angle, r) => [Math.sin(angle) * r * length, -0.22 * length - Math.cos(angle) * r * length];

    context.beginPath();
    context.moveTo(0, 0);

    for (const [k, [angle, reach]] of lobes.entries()) {
        const tip = point(angle * 0.7, reach * 0.78);
        const next = lobes[k + 1];
        const [sx, sy] = next ? point(((angle + next[0]) / 2) * 0.7, 0.42) : [0, 0];
        // (Each lobe's rounded shoulders, to its tip and back in to the notch)
        const [lx, ly] = point(angle * 0.7 - 0.28, reach * 0.74);
        const [rx, ry] = point(angle * 0.7 + 0.28, reach * 0.74);

        context.quadraticCurveTo(lx, ly, tip[0], tip[1]);
        context.quadraticCurveTo(rx, ry, sx, sy);
    }

    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = vein;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -length * 0.9);
    context.stroke();
}
