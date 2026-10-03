// The arches of rock drawn (core/arches.js places them: the terrain plan's M7h-2): a band of rock
// swept along a curve from one foot up over the open ground and down to the other, its legs
// steep, its top round; thick at its feet, thinner over the top, the band broken by noise so it's
// worn rock, not a pipe. Coloured as the cliffs are (kits/cliffs.js: the bedding's layers running
// across it, each a shade of its own, moss and snow on what faces up) and drawn with their
// material (the rock's picture laid on from three sides by where it is), scree at its feet. Its
// legs stand on the squares core keeps for them (ARCHES.leg); nothing stands under its span.

import * as THREE from "three";
import { feetOf } from "../../../core/arches.js";
import { hashOf } from "../../../core/noise.js";
import { cliffMaterial, LAYERS } from "../engine/atlas.js";
import { MATERIALS } from "../engine/painters.js";
import { ALPINE } from "../../ground.js";
import { chip, CLIFFS, noise3, rockColour, standsOut } from "./cliffs.js";
import { LOOKS, Mesher } from "./wilds.js";

/**
 * How an arch is drawn: how many rings along it and how many sides round each; how far its feet
 * go down into the ground (metres); how far through the band is (across the arch, its depth) and
 * how deep it is (in the arch's plane), at its feet and at its top (half of each, metres, from
 * each arch's own numbers a little more or less); how square its sections are (a section's
 * corners' power: 1 round, under it squarer, a slab's); how much wider it flares at the very foot
 * (of its width there); how far its surface is broken (metres, in knobs `knobs` metres across and
 * smaller ones half that), and how far its bedding's ledges stand out (of the cliffs'); how steep
 * its legs are (the curve's power: under 1, steeper legs and a flatter top) and how lopsided it
 * may be (its top that much of its span off its middle, at most); and how many chips of rock lie
 * round each foot at most.
 */
export const ARCH_LOOK = Object.freeze({
    rings: 34,
    sides: 14,
    sunk: 0.8,
    through: Object.freeze([2.1, 1.5]),
    deep: Object.freeze([1.9, 1.3]),
    square: 0.6,
    flare: 0.1,
    rough: 0.5,
    knobs: 4.5,
    ledges: 0.6,
    legs: 0.45,
    lopsided: 0.12,
    scree: 7,
});

const LAYER = Object.fromEntries(LAYERS.map((name, k) => [name, k]));
const METRES = Object.fromEntries(Object.entries(MATERIALS).map(([name, { world }]) => [name, world / 5]));

/**
 * Draw an arch (core/arches.js's: { x, y, turn, span, rise, land, variant }) into a mesher, about
 * the corner [x0, y0] (metres), standing on the ground (`groundAt(x, y)`, metres): how many
 * triangles it took.
 */
export function archInto(mesher, arch, groundAt, [x0, y0]) {
    const before = mesher.count;
    const look = LOOKS[arch.land] ?? LOOKS.mountain;
    const layer = LAYER[look.stone] ?? LAYER.rock;
    const copies = 1 / ((METRES[look.stone] ?? 1) * CLIFFS.picture);
    const uvs = [[copies, 0], [copies, 0], [copies, 0]];
    const snowLine = ALPINE.snow[0] - ALPINE.wander;
    const { rings, sides } = ARCH_LOOK;
    const grid = surfaceOf(arch, groundAt);

    // (Each point of it as the cliffs colour theirs: its layer of the bedding, moss and snow)
    const points = grid.map(({ at, normal }) => {
        const { layer: bed, up } = standsOut(at[0], at[2], at[1], 1);

        return { at: [at[0] - x0, at[1], at[2] - y0], normal, colour: rockColour(look, { layer: bed, up, height: at[1], normal, x: at[0], y: at[2], cliff: 1 }, snowLine) };
    });

    for (let k = 0; k < rings; k++) {
        for (let n = 0; n < sides; n++) {
            const [a, b, c, d] = [k * sides + n, k * sides + ((n + 1) % sides), (k + 1) * sides + ((n + 1) % sides), (k + 1) * sides + n].map((i) => points[i]);

            mesher.tri(a.at, b.at, c.at, { layer, colours: [a.colour, b.colour, c.colour], normals: [a.normal, b.normal, c.normal], uvs });
            mesher.tri(a.at, c.at, d.at, { layer, colours: [a.colour, c.colour, d.colour], normals: [a.normal, c.normal, d.normal], uvs });
        }
    }

    // (Chips of the rock fallen round its feet)
    feetOf(arch).forEach(([fx, fy], side) => {
        const count = 2 + Math.floor(hashOf(Math.floor(fx * 4), Math.floor(fy * 4), 991) * (ARCH_LOOK.scree - 1));

        for (let n = 0; n < count; n++) {
            const angle = hashOf(side, n, Math.floor(arch.variant * 1e6)) * Math.PI * 2;
            const far = ARCH_LOOK.through[0] + 0.4 + 1.6 * hashOf(n, side, 997);
            const [x, y] = [fx + Math.cos(angle) * far, fy + Math.sin(angle) * far];
            const r = CLIFFS.scree.size[0] + (CLIFFS.scree.size[1] - CLIFFS.scree.size[0]) * hashOf(n, side, 1009) ** 2;

            chip(mesher, [x - x0, groundAt(x, y) - r * 0.35, y - y0], r, hashOf(n, side, 1013 + Math.floor(arch.variant * 1e5)), { layer, uvs, look });
        }
    });

    return (mesher.count - before) / 3;
}

/** An arch drawn on its own: a mesh at its chunk's corner ([x0, y0], metres), casting shadows and taking them. */
export function archMesh(arches, groundAt, [x0, y0]) {
    const mesher = new Mesher(4096);

    for (const arch of arches) {
        archInto(mesher, arch, groundAt, [x0, y0]);
    }

    const mesh = new THREE.Mesh(mesher.geometry(), cliffMaterial());

    mesh.name = "arches";
    mesh.position.set(x0, 0, y0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    return mesh;
}

/**
 * An arch's surface: its rings' points from one foot to the other ({ at: [x, up, y] in the
 * world, normal }, ARCH_LOOK.rings + 1 rings of ARCH_LOOK.sides), spaced evenly along its curve.
 */
export function surfaceOf(arch, groundAt) {
    const { rings, sides, sunk, through, deep, square, flare, rough, knobs, ledges, legs, lopsided } = ARCH_LOOK;
    const [[ax, ay], [bx, by]] = feetOf(arch);
    const [ha, hb] = [groundAt(ax, ay), groundAt(bx, by)];
    const own = (n) => 0.85 + 0.3 * hashOf(n, 5, Math.floor(arch.variant * 1e6));
    const [wide, deepen] = [own(1), own(2)];
    const top = (ha + hb) / 2 + arch.rise + deep[1] * deepen;
    // (Its top a little off its middle, its own way: t's bent so the top's at `peak`)
    const peak = 0.5 + (own(3) - 1) / 0.3 * 2 * lopsided;
    const bend = Math.log(0.5) / Math.log(peak);

    // (The curve: along the way from one foot to the other, and up: steep legs, a flattish top)
    const along = (t) => {
        const s = Math.sin(Math.PI * t ** bend) ** legs;

        return [ax + (bx - ax) * t, ha + (hb - ha) * t - sunk + (top - (ha + (hb - ha) * t) + sunk) * s, ay + (by - ay) * t];
    };

    // (Even along its length: a leg's steep, so even in t would leave the legs coarse)
    const fine = 240;
    const lengths = [0];

    for (let n = 1; n <= fine; n++) {
        const [p, q] = [along((n - 1) / fine), along(n / fine)];

        lengths.push(lengths[n - 1] + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
    }

    const ts = Array.from({ length: rings + 1 }, (_, k) => {
        const want = (k / rings) * lengths[fine];
        let n = 1;

        while (n < fine && lengths[n] < want) {
            n++;
        }

        return (n - 1 + (want - lengths[n - 1]) / Math.max(1e-9, lengths[n] - lengths[n - 1])) / fine;
    });

    // (Across the arch, level: the band's depth one way, its width through the other)
    const across = [-Math.sin(arch.turn), 0, Math.cos(arch.turn)];
    const at = [];

    for (const t of ts) {
        const centre = along(t);
        const [p, q] = [along(Math.max(0, t - 0.002)), along(Math.min(1, t + 0.002))];
        const tangent = normalised([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
        // (In the arch's plane, square to its curve: out from under it, or up off its top)
        const out = normalised(cross(tangent, across));
        const high = Math.sin(Math.PI * t);
        const foot = 1 + flare * Math.max(0, 1 - Math.min(t, 1 - t) / 0.03);
        const [r1, r2] = [(through[0] + (through[1] - through[0]) * high ** 0.7) * wide * foot, (deep[0] + (deep[1] - deep[0]) * high ** 0.7) * deepen * foot];

        for (let n = 0; n < ARCH_LOOK.sides; n++) {
            const angle = (n / sides) * Math.PI * 2;
            // (Squarer than round: a slab of rock, its corners worn)
            const [c, s] = [Math.cos(angle), Math.sin(angle)].map((v) => Math.sign(v) * Math.abs(v) ** square);
            const way = [across[0] * c + out[0] * s, across[1] * c + out[1] * s, across[2] * c + out[2] * s];
            const plain = [centre[0] + across[0] * c * r1 + out[0] * s * r2, centre[1] + across[1] * c * r1 + out[1] * s * r2, centre[2] + across[2] * c * r1 + out[2] * s * r2];
            // (Broken: pushed in and out along the way it faces, by knobs of rock and smaller ones,
            // and its bedding's ledges standing out across it, as the cliffs' do)
            const broken = rough * ((noise3(plain[0] / knobs, plain[1] / knobs, plain[2] / knobs, 41) - 0.5) * 2 + (noise3((plain[0] * 2) / knobs, (plain[1] * 2) / knobs, (plain[2] * 2) / knobs, 43) - 0.5)) + ledges * ledgeOf(plain);

            at.push([plain[0] + way[0] * broken, plain[1] + way[1] * broken, plain[2] + way[2] * broken]);
        }
    }

    // (Each point's normal from its neighbours round its ring and along the arch)
    return at.map((point, i) => {
        const [k, n] = [Math.floor(i / sides), i % sides];
        const ring = (kk, nn) => at[Math.min(rings, Math.max(0, kk)) * sides + ((nn + sides) % sides)];
        const [next, last, ahead, behind] = [ring(k, n + 1), ring(k, n - 1), ring(k + 1, n), ring(k - 1, n)];
        // (Round the ring, then along the arch: out of the rock)
        const normal = normalised(cross([next[0] - last[0], next[1] - last[1], next[2] - last[2]], [ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]]));

        return { at: point, normal };
    });
}

// How far the bedding's ledge stands out at a point of the rock (metres: the cliffs', kits/cliffs.js)
function ledgeOf([x, height, y]) {
    const { up } = standsOut(x, y, height, 1);

    return CLIFFS.ledge * 0.5 * (1 + Math.cos(2 * Math.PI * (up - 0.2))) - CLIFFS.ledge * 0.5;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function normalised(v) {
    const length = Math.hypot(...v) || 1;

    return v.map((x) => x / length);
}
