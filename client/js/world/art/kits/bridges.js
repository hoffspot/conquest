// Stone arch bridges (the terrain plan's M7i-2, §9 row 7: "stone arch bridges"): the bigger
// roads' crossings, and some of the tracks' (core/overworld.js BRIDGE.stone), built of stone over
// the river, as grand as their road (the user's photos: a packhorse bridge of rubble with upright
// coping stones, a road's bridge of rubble with a ring of dressed stones round its arch, a row of
// arches of coursed stone, and Tower Bridge):
//  - a track's packhorse bridge: narrow, humped over one high arch (or two), of rubble, its
//    parapets low and topped with stones set on edge;
//  - a road's: one to three arches of rubble, each ringed with dressed stones, rounded cutwaters
//    on its piers, its parapets coped with slabs;
//  - a trade road's: a row of lower arches of coursed stone, pointed cutwaters carried up to a
//    string course at the road's level, coped with slabs; near a capital or a city, a gate tower
//    over its middle (core's `tower`), the road through it under an arch, a slate roof over it and
//    a turret at each corner.
// Each is a deck of cobbles between parapets, level over the water and up a ramp onto each bank
// (core's deckOf), its arches segments of circles springing a little over the water, each of its
// own stones (voussoirs), long and short in turn, with a deeper keystone at its crown. It's dark
// and damp along the waterline, darker under its arches, and the stone's old (moss in its joints
// and on what faces up, streaks down its faces: engine/atlas.js AGED); what grows by the river
// grows at its ends.
//
// Built in the art's measure (five world pixels to a metre) along x from the bridge's end `a`,
// across z, then turned and set in the world (`stoneBridges`), its pieces drawn with the
// buildings' atlas: a draw or two for all of a chunk's.

import * as THREE from "three";
import { hashOf } from "../../../core/noise.js";
import { allAtOnce } from "../../../core/steps.js";
import { merge } from "../../town3d.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";

const M = 5;
const m = (metres) => metres * M;

/**
 * A stone bridge's measures (metres): its side walls' thickness (standing outside the deck's edge);
 * the deck's thickness over the arches' crowns; a pier's width between two arches; how far onto
 * each bank the arches spring from, how far over the water they spring, and how deep under the
 * river's bed and the banks its faces go; how wet its stone looks up from the water (fully at
 * `damp[0]` over it, not at all by `damp[1]`); and each grade's own:
 *  - `walls`, `dressed`: what its faces are built of, and its arches' stones and coping;
 *  - `ring`: how deep its arches' stones are, `stone` how wide each, `proud` how far they stand out;
 *  - `ratio`: the widest an arch spans, for how high it rises;
 *  - `parapet`: how high its parapets stand over the deck; `coping` how they're topped ("upright":
 *    stones set on edge, `upright` [how thick each, its height and its neighbour's]; "slabs":
 *    slabs `slab` [shortest, longest, thickness] long);
 *  - `cutwater`: its piers' cutwaters' shape ("pointed" or "round"), how far out from its faces,
 *    and `buttress`: carried up to the road's level (else to `breaks` over the water);
 *  - `string`: a string course along its faces at the road's level;
 *  - `moss`: how green what faces up.
 * And a gate tower's: how long along the road, how far out past the faces, how high over the deck,
 * how high its passage, how high its roof rises, and its turrets' size, how high they stand over
 * its walls and how high their spires rise.
 */
export const STONE_BRIDGE = Object.freeze({
    wall: 0.45,
    paving: 0.3,
    pier: 1.4,
    springs: 0.6,
    spring: 0.3,
    footing: 0.6,
    damp: Object.freeze([0.3, 0.9]),
    grades: Object.freeze({
        packhorse: Object.freeze({ walls: "rubble-bridge-old", dressed: "dressed-old", ring: 0.5, stone: 0.24, proud: 0.08, ratio: 3, parapet: 0.6, coping: "upright", upright: Object.freeze([0.26, 0.24, 0.36]), cutwater: "pointed", out: 0.9, buttress: false, breaks: 0.7, string: false, moss: 0.55 }),
        road: Object.freeze({ walls: "rubble-bridge-old", dressed: "dressed-old", ring: 0.5, stone: 0.44, proud: 0.07, ratio: 2.8, parapet: 0.9, coping: "slabs", slab: Object.freeze([0.8, 1.3, 0.2]), cutwater: "round", out: 0.9, buttress: false, breaks: 0.7, string: false, moss: 0.4 }),
        great: Object.freeze({ walls: "stone-bridge-old", dressed: "dressed-old", ring: 0.6, stone: 0.5, proud: 0.06, ratio: 2.6, parapet: 1.0, coping: "slabs", slab: Object.freeze([1, 1.5, 0.22]), cutwater: "pointed", out: 1.3, buttress: true, breaks: 1.2, string: true, moss: 0.3 }),
    }),
    tower: Object.freeze({ long: 3.8, beyond: 0.5, high: 7.5, passage: 4.4, roof: 3.2, turret: 0.9, over: 1.3, spire: 1.9 }),
});

/** Each road's kind's bridge's grade. */
export const GRADE_OF = Object.freeze({ track: "packhorse", road: "road", trade: "great" });

/**
 * A stone bridge's arches, from its length and ramps (core's: { a, b, ramps }, metres), its deck's
 * height over the river (`top`), the water's surface and its grade: [{ middle (along it), half (its
 * span's half), radius, centre (the height of its circle's middle, under its springing), springs
 * (the height it springs from) }]. As many as the widest its grade's arches span for how high they
 * rise needs; each a segment of a circle, or, narrower than twice that, a half circle springing
 * higher.
 */
export function archesOf(length, ramps, top, surface, grade = "road") {
    const { pier, springs, paving, spring } = STONE_BRIDGE;
    const { ring, ratio } = STONE_BRIDGE.grades[grade];
    const [from, to] = [ramps[0] - springs, length - ramps[1] + springs];
    const width = Math.max(2, to - from);
    const crown = top - paving - ring;
    const rise = Math.max(0.8, crown - (surface + spring));
    const count = Math.max(1, Math.ceil((width + pier) / (ratio * rise + pier)));
    const each = (width - (count - 1) * pier) / count;
    const half = each / 2;
    const up = Math.min(rise, half);
    const radius = (half * half + up * up) / (2 * up);

    return Array.from({ length: count }, (_, k) => ({ middle: from + half + k * (each + pier), half, radius, centre: crown - radius, springs: crown - up }));
}

/**
 * Build a stone bridge into `solid` (along x from 0, across z; art pixels): `length` and `half`
 * (its deck's half-width) in metres, `deck(t)` its deck's height a way along it (metres),
 * `ground(u)` the ground's under its middle line `u` metres along, `surface` the river's, its
 * `grade` (GRADE_OF's), whether it has a gate tower, and a seed for its stones. Returns its arches
 * (archesOf's) and where its tower stands along it (or null).
 */
export function stoneBridgeInto(solid, bridge) {
    return allAtOnce(stoneBridgeBuilding(solid, bridge));
}

/** stoneBridgeInto, a part at a time (each a yield: its faces, its coping, its arches' stones, the rest). */
export function* stoneBridgeBuilding(solid, { length, half, ramps, deck, ground, surface, grade = "road", tower = false, seed = 1 }) {
    const { wall, paving, pier, footing, damp } = STONE_BRIDGE;
    const own = STONE_BRIDGE.grades[grade];
    const walls = material(own.walls);
    const dressed = material(own.dressed);
    const cobbles = material("cobbles");
    const outer = half + wall;
    const deckAt = (u) => deck(Math.min(1, Math.max(0, u / length)));
    const top = deckAt(length / 2);
    const arches = archesOf(length, ramps, top, surface, grade);
    const lows = Array.from({ length: Math.ceil(length) + 1 }, (_, k) => ground(Math.min(length, k)));
    const foot = Math.min(surface - 0.5, ...lows, ...arches.map(({ springs }) => springs)) - footing;
    const hash = (n, k) => hashOf(n, k, seed);
    const P = (u, y, z) => [m(u), m(y), m(z)];

    // Its stone's tone: dark and green-brown where the river wets it, darker under its arches, and
    // greener on what faces up
    const mossy = [0.72, 0.84, 0.52];

    solid.tone = Object.assign(
        (point, normal) => {
            const above = point[1] / M - surface;
            const wet = 1 - Math.min(1, Math.max(0, (above - damp[0]) / (damp[1] - damp[0])));
            const under = normal[1] < -0.3 ? 0.6 : 1;
            const green = Math.min(1, Math.max(0, normal[1] - 0.5) * 2 * own.moss);

            return [
                under * (1 - 0.5 * wet) * (1 - green + green * mossy[0]),
                under * (1 - 0.42 * wet) * (1 - green + green * mossy[1]),
                under * (1 - 0.56 * wet) * (1 - green + green * mossy[2]),
            ];
        },
        { bands: [m(surface + damp[0]), m(surface + damp[1])] },
    );

    // (Its tone at a point, shaded by `by`: for a stone of its own shade)
    const shaded = (point, normal, by) => solid.tone(point, normal).map((v) => v * by);

    // Where its gate tower stands along it: over its middle pier, or (with one arch) on the bank at
    // its first end
    const piers = arches.slice(1).map((arch, k) => (arches[k].middle + arches[k].half + arch.middle - arch.half) / 2);
    const keep = STONE_BRIDGE.tower;
    const towerAt = !tower ? null : piers.length ? piers[Math.floor((piers.length - 1) / 2)] : Math.max(keep.long / 2, ramps[0] - STONE_BRIDGE.springs - keep.long / 2 - 0.3);
    const inTower = (u) => towerAt !== null && Math.abs(u - towerAt) < keep.long / 2 - 1e-6;

    // (Where along it to cut its faces: every half metre, closer round each arch, and at each
    // arch's springing, each ramp's foot and head, and its tower's ends)
    const marks = new Set([0, length, ramps[0], length - ramps[1]]);

    for (let u = 0; u < length; u += 0.5) {
        marks.add(u);
    }

    for (const { middle, half: span } of arches) {
        for (let k = 0; k <= 16; k++) {
            marks.add(middle - span * Math.cos((k / 16) * Math.PI));
        }
    }

    if (towerAt !== null) {
        marks.add(towerAt - keep.long / 2);
        marks.add(towerAt + keep.long / 2);
    }

    const us = [...marks].filter((u) => u >= 0 && u <= length).sort((p, q) => p - q);
    // (The face's foot at a way along: under an arch its curve, else the footing)
    const archAt = (u) => arches.find(({ middle, half: span }) => Math.abs(u - middle) < span - 1e-9);
    const lowAt = (u, ua, ub) => {
        const arch = archAt((ua + ub) / 2);

        return arch ? arch.centre + Math.sqrt(Math.max(0, arch.radius ** 2 - (u - arch.middle) ** 2)) : foot;
    };
    const copingHigh = own.coping === "slabs" ? own.slab[2] : 0;

    for (let k = 0; k < us.length - 1; k++) {
        const [ua, ub] = [us[k], us[k + 1]];
        const [da, db] = [deckAt(ua), deckAt(ub)];
        const [la, lb] = [lowAt(ua, ua, ub), lowAt(ub, ua, ub)];
        const towered = inTower((ua + ub) / 2);
        // (Its walls' tops: under the coping, or under the tower's floor)
        const [ta, tb] = towered ? [da - paving, db - paving] : [da + own.parapet - copingHigh, db + own.parapet - copingHigh];

        for (const side of [1, -1]) {
            const z = side * outer;

            // Its face, from the footing (or the arch over the river) up to its parapet's top
            solid.facing([P(ua, la, z), P(ub, lb, z), P(ub, tb, z), P(ua, ta, z)], [0, 0, side], walls);

            if (towered) {
                continue;
            }

            // The parapet's inside and its top (under any coping)
            solid.facing([P(ua, da, side * half), P(ub, db, side * half), P(ub, tb, side * half), P(ua, ta, side * half)], [0, 0, -side], walls);
            solid.facing([P(ua, ta, side * half), P(ub, tb, side * half), P(ub, tb, z), P(ua, ta, z)], [0, 1, 0], walls);

            // A string course along it at the road's level, standing a little proud
            if (own.string) {
                const [sa, sb] = [da - paving, db - paving];
                const zz = z + side * 0.08;

                solid.facing([P(ua, sa, zz), P(ub, sb, zz), P(ub, sb + 0.18, zz), P(ua, sa + 0.18, zz)], [0, 0, side], dressed);
                solid.facing([P(ua, sa + 0.18, z), P(ub, sb + 0.18, z), P(ub, sb + 0.18, zz), P(ua, sa + 0.18, zz)], [0, 1, 0], dressed);
                solid.facing([P(ua, sa, z), P(ub, sb, z), P(ub, sb, zz), P(ua, sa, zz)], [0, -1, 0], dressed);
            }
        }

        // The deck's cobbles
        solid.facing([P(ua, da, -half), P(ub, db, -half), P(ub, db, half), P(ua, da, half)], [0, 1, 0], cobbles);

        // Under an arch, its vault from face to face (facing in, to the arch's middle)
        const arch = archAt((ua + ub) / 2);

        if (arch) {
            solid.facing([P(ua, la, -outer), P(ub, lb, -outer), P(ub, lb, outer), P(ua, la, outer)], [arch.middle - (ua + ub) / 2, arch.centre - (la + lb) / 2, 0], walls);
        }
    }

    yield;

    // Its parapets' coping, along each side (but through its tower)
    coping(solid, { length, half, outer, deckAt, own, dressed, inTower, hash, P, shaded });

    yield;

    for (const [n, { middle, half: span, radius, centre, springs }] of arches.entries()) {
        // Its sides down from where it springs (a pier's, or a bank's), into the ground
        for (const [u, way] of [[middle - span, 1], [middle + span, -1]]) {
            solid.facing([P(u, foot, -outer), P(u, springs, -outer), P(u, springs, outer), P(u, foot, outer)], [way, 0, 0], walls);
        }

        // Its stones round it on each face, long and short in turn, standing a little proud, a
        // deeper keystone at its crown; each its own shade
        const from = Math.acos(-span / radius);
        const to = Math.acos(span / radius);
        let count = Math.max(5, Math.round((radius * (from - to)) / own.stone));

        count += count % 2 ? 0 : 1;

        const gap = 0.035 / radius;

        for (const side of [1, -1]) {
            const z = side * (outer + own.proud);

            for (let k = 0; k < count; k++) {
                const [a, b] = [from - ((from - to) * k) / count - gap / 2, from - ((from - to) * (k + 1)) / count + gap / 2];
                const key = k === (count - 1) / 2;
                const depth = own.ring * (key ? 1.3 : k % 2 ? 0.82 : 1.08) * (0.94 + 0.12 * hash(n * 97 + k, 1));
                const at = (angle, r) => P(middle + r * Math.cos(angle), centre + r * Math.sin(angle), z);
                const back = (angle, r) => P(middle + r * Math.cos(angle), centre + r * Math.sin(angle), side * outer);
                const by = 0.84 + 0.3 * hash(n * 97 + k, side + 3);
                const face = [at(a, radius), at(b, radius), at(b, radius + depth), at(a, radius + depth)];

                solid.facing(face, [0, 0, side], dressed, undefined, shaded(face[0], [0, 0, side], by));

                // (Its back edge, catching the light)
                const edge = [back(a, radius + depth), back(b, radius + depth), at(b, radius + depth), at(a, radius + depth)];
                const mid = (a + b) / 2;

                solid.facing(edge, [Math.cos(mid), Math.sin(mid), 0], dressed, undefined, shaded(edge[0], [Math.cos(mid), Math.sin(mid), 0], by));
            }
        }
    }

    yield;

    // The piers' cutwaters, either side: pointed or rounded, up out of the water (or carried up
    // to the road's level, buttressing it), capped
    for (const u of piers) {
        // (Under a gate tower, carried up to its corbels)
        const high = inTower(u) ? deckAt(u) - paving - 0.85 : own.buttress ? deckAt(u) - paving - 0.05 : Math.min(surface + own.breaks, Math.min(...arches.map(({ centre, radius }) => centre + radius)) - 0.6);

        for (const side of [1, -1]) {
            cutwater(solid, { u, side, outer, foot, high, own, walls, dressed, P });
        }
    }

    // Its ends: the walls' ends, and (but on a packhorse bridge) a pillar at each end of each parapet
    for (const u of [0, length]) {
        const way = u === 0 ? -1 : 1;
        const d = deckAt(u);

        for (const side of [1, -1]) {
            solid.facing([P(u, foot, side * half), P(u, foot, side * outer), P(u, d + own.parapet - copingHigh, side * outer), P(u, d + own.parapet - copingHigh, side * half)], [way, 0, 0], walls);

            if (grade !== "packhorse") {
                const [x0, x1] = way < 0 ? [m(u - 0.15), m(u + 0.55)] : [m(u - 0.55), m(u + 0.15)];
                const [z0, z1] = side > 0 ? [m(half - 0.05), m(outer + 0.12)] : [m(-outer - 0.12), m(-half + 0.05)];

                solid.box(x0, m(foot), z0, x1, m(d + own.parapet + 0.3), z1, dressed);
            }
        }
    }

    if (towerAt !== null) {
        gateTower(solid, { at: towerAt, d: deckAt(towerAt), half, outer, paving, foot, piered: piers.length > 0, pier, P });
    }

    return { arches, tower: towerAt };
}

// A bridge's parapets' coping: stones set on edge, a tall one and a short one in turn (a
// packhorse bridge's), or slabs a little wider than the wall, with joints between them
function coping(solid, { length, half, outer, deckAt, own, dressed, inTower, hash, P, shaded }) {
    const [over, inner] = [outer + 0.05, half - 0.05];

    for (const side of [1, -1]) {
        const [z0, z1] = side > 0 ? [inner, over] : [-over, -inner];
        let u = 0;
        let n = 0;

        while (u < length - 0.05) {
            const long = own.coping === "upright" ? own.upright[0] : own.slab[0] + (own.slab[1] - own.slab[0]) * hash(n, side + 7);
            const end = Math.min(length, u + long);

            if (!inTower((u + end) / 2)) {
                const [da, db] = [deckAt(u), deckAt(end)];
                const base = own.coping === "upright" ? [da + own.parapet, db + own.parapet] : [da + own.parapet - own.slab[2], db + own.parapet - own.slab[2]];
                const high = own.coping === "upright" ? own.upright[1 + (n % 2)] * (0.9 + 0.2 * hash(n, side + 9)) : own.slab[2];
                const by = 0.86 + 0.26 * hash(n, side + 11);
                const gap = own.coping === "upright" ? 0.035 : 0.02;

                block(solid, [u + gap, end - gap], [base[0] + ((base[1] - base[0]) * gap) / long, base[1] - ((base[1] - base[0]) * gap) / long], high, [z0, z1], dressed, P, (point, normal) => shaded(point, normal, by));
            }

            u = end;
            n++;
        }
    }
}

// A block along the bridge from `us[0]` to `us[1]`, its foot at `ys` there (following the deck's
// slope), `high` tall, across `zs` (metres): its top, sides and ends, toned by `tone`
function block(solid, us, ys, high, zs, stuff, P, tone) {
    const [u0, u1] = us;
    const [y0, y1] = ys;
    const [z0, z1] = zs;
    const faces = [
        [[P(u0, y0 + high, z0), P(u1, y1 + high, z0), P(u1, y1 + high, z1), P(u0, y0 + high, z1)], [0, 1, 0]],
        [[P(u0, y0, z1), P(u1, y1, z1), P(u1, y1 + high, z1), P(u0, y0 + high, z1)], [0, 0, 1]],
        [[P(u0, y0, z0), P(u1, y1, z0), P(u1, y1 + high, z0), P(u0, y0 + high, z0)], [0, 0, -1]],
        [[P(u0, y0, z0), P(u0, y0, z1), P(u0, y0 + high, z1), P(u0, y0 + high, z0)], [-1, 0, 0]],
        [[P(u1, y1, z0), P(u1, y1, z1), P(u1, y1 + high, z1), P(u1, y1 + high, z0)], [1, 0, 0]],
    ];

    for (const [points, out] of faces) {
        solid.facing(points, out, stuff, undefined, tone(points[0], out));
    }
}

// A pier's cutwater on one side of the bridge (`side`), at `u` along it: pointed (a wedge) or
// rounded (half an octagon), from the footing up to `high`, capped with a slope up to the face
function cutwater(solid, { u, side, outer, foot, high, own, walls, dressed, P }) {
    const width = STONE_BRIDGE.pier;
    const z0 = side * outer;
    const outline = own.cutwater === "round"
        ? Array.from({ length: 9 }, (_, k) => {
              const angle = (k / 8) * Math.PI;

              return [u - (width / 2) * Math.cos(angle), z0 + side * (width / 2) * Math.sin(angle) * ((own.out * 2) / width)];
          })
        : [[u - width / 2, z0], [u, z0 + side * own.out], [u + width / 2, z0]];

    // (A rounded one of dressed stone, as its curve's cut: the walls' rubble only on a pointed one)
    solid.extrude(outline.map(([x, z]) => [m(x), m(z)]), m(foot), m(high), own.cutwater === "round" ? dressed : walls, { top: null });

    // (Its cap: a slope up from its outline to the face, over its middle)
    const apex = P(u, high + (own.buttress ? 0.35 : own.cutwater === "round" ? 0.45 : 0.6), z0);

    for (let k = 0; k < outline.length - 1; k++) {
        const [p, q] = [outline[k], outline[k + 1]];
        const out = [(p[0] + q[0]) / 2 - u, 1, (p[1] + q[1]) / 2 - z0];

        solid.facing([P(p[0], high, p[1]), P(q[0], high, q[1]), apex], out, dressed);
    }
}

// A gate tower over a bridge's deck at `at` along it (the deck there `d` high): its walls standing
// out a little past the bridge's faces (corbelled out at the road's level over its pier, or down
// to the ground on the bank), the road through it under a round arch ringed with dressed stone,
// small pointed windows up its faces, a slate roof and a turret at each corner under its own spire
function gateTower(solid, { at, d, half, outer, paving, foot, piered, P }) {
    const { long, beyond, high, passage, roof, turret, over, spire } = STONE_BRIDGE.tower;
    const stone = material("stone-bridge-old");
    const trim = material("dressed-old");
    const dark = material("leaded");
    const slate = material("slate");
    const [u0, u1] = [at - long / 2, at + long / 2];
    const zOut = outer + beyond;
    const floor = d - paving;
    const roofAt = d + high;
    const base = piered ? floor - 0.35 : foot;

    for (const side of [1, -1]) {
        // Its sides, facing out across the river, and their undersides where it stands out
        solid.facing([P(u0, base, side * zOut), P(u1, base, side * zOut), P(u1, roofAt, side * zOut), P(u0, roofAt, side * zOut)], [0, 0, side], stone);
        solid.facing([P(u0, base, side * outer), P(u1, base, side * outer), P(u1, base, side * zOut), P(u0, base, side * zOut)], [0, -1, 0], stone);

        // Its ends beside the road
        const [za, zb] = side > 0 ? [half, zOut] : [-zOut, -half];

        for (const [u, way] of [[u0, -1], [u1, 1]]) {
            solid.facing([P(u, base, za), P(u, base, zb), P(u, roofAt, zb), P(u, roofAt, za)], [way, 0, 0], stone);
        }

        // Corbels under it where it stands out over the arches
        if (piered) {
            for (let k = 0; k < 6; k++) {
                const u = u0 + 0.35 + (k * (long - 0.7)) / 5;
                const zs = side > 0 ? [m(outer), m(zOut)] : [m(-zOut), m(-outer)];

                solid.box(m(u - 0.16), m(base - 0.45), zs[0], m(u + 0.16), m(base), zs[1], trim);
            }
        }

        // The passage's walls beside the road
        solid.facing([P(u0, floor, side * half), P(u1, floor, side * half), P(u1, floor + passage - half, side * half), P(u0, floor + passage - half, side * half)], [0, 0, -side], stone);
    }

    // The road through it: over the passage's round arch its ends' walls, a ring of dressed stone
    // round it; inside, its vault
    const spring = floor + passage - half;
    const steps = 8;
    const arc = (k, r) => [spring + r * Math.sin((k / steps) * Math.PI), r * Math.cos((k / steps) * Math.PI)];

    for (const [u, way] of [[u0, -1], [u1, 1]]) {
        solid.facing([P(u, floor + passage, -half), P(u, floor + passage, half), P(u, roofAt, half), P(u, roofAt, -half)], [way, 0, 0], stone);

        for (let k = 0; k < steps; k++) {
            const [[ya, za], [yb, zb]] = [arc(k, half), arc(k + 1, half)];
            const [[yc, zc], [yd, zd]] = [arc(k, half + 0.45), arc(k + 1, half + 0.45)];
            const proud = u + way * 0.06;

            solid.facing([P(u, ya, za), P(u, yb, zb), P(u, floor + passage, zb), P(u, floor + passage, za)], [way, 0, 0], stone);
            solid.facing([P(proud, ya, za), P(proud, yb, zb), P(proud, yd, zd), P(proud, yc, zc)], [way, 0, 0], trim);

            if (way < 0) {
                const mid = ((k + 0.5) / steps) * Math.PI;

                solid.facing([P(u0, ya, za), P(u1, ya, za), P(u1, yb, zb), P(u0, yb, zb)], [0, -Math.sin(mid), -Math.cos(mid)], stone);
            }
        }
    }

    // Small pointed windows up its faces: three on each side, two over the passage at each end
    const pointed = (wide) => [[-wide / 2, 0], [wide / 2, 0], [wide / 2, 1.1], [0, 1.45], [-wide / 2, 1.1]];
    const y = floor + passage + 1.3;

    for (const side of [1, -1]) {
        for (const k of [-1, 0, 1]) {
            solid.facing(pointed(0.5).map(([a, b]) => P(at + k * 1.3 + a, y + b, side * (zOut + 0.02))), [0, 0, side], dark);
        }
    }

    for (const [u, way] of [[u0 - 0.02, -1], [u1 + 0.02, 1]]) {
        for (const z of [-1.2, 1.2]) {
            solid.facing(pointed(0.5).map(([a, b]) => P(u, y + b, z + a)), [way, 0, 0], dark);
        }
    }

    // Its roof, and a turret at each corner rising over it under its own spire
    solid.pyramid(m(u0 - 0.25), m(-zOut - 0.25), m(u1 + 0.25), m(zOut + 0.25), m(roofAt), m(roof), slate);

    for (const u of [u0, u1]) {
        for (const z of [-zOut, zOut]) {
            const [x0, x1, z0, z1] = [m(u - turret / 2), m(u + turret / 2), m(z - turret / 2), m(z + turret / 2)];

            solid.box(x0, m(roofAt - 2.5), z0, x1, m(roofAt + over), z1, stone);
            solid.box(x0 - 1, m(roofAt + over - 0.25), z0 - 1, x1 + 1, m(roofAt + over), z1 + 1, trim);
            solid.pyramid(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, m(roofAt + over), m(spire), slate);
        }
    }
}

// What grows by a bridge, of its land's undergrowth: plants, not pebbles, bones or sticks
const GROWS = new Set(["tuft", "tall", "heather", "bracken", "dry", "fern", "cotton", "marram", "thistle", "yarrow", "campion", "daisy", "reeds", "bluebell", "foxglove", "buttercup", "poppy", "parsley", "dandelion"]);

/**
 * What grows about a stone bridge, as its land has it (an UNDERGROWTH key; kits/wilds.js
 * Growth's items): along the foot of its walls on each bank, thicker by the water, and a few
 * tufts on a packhorse bridge's coping; `density` as thick as the undergrowth's drawn (none at 0).
 * `groundAt(x, y)` the ground's height, `deckOf(bridge, t)` its deck's, `surface` the river's.
 */
export function bridgeGrowth(bridge, { land, undergrowth, groundAt, deckOf, surface, density = 1 }) {
    const kinds = Object.entries(undergrowth[land]?.kinds ?? {}).filter(([kind]) => GROWS.has(kind));
    const total = kinds.reduce((sum, [, weight]) => sum + weight, 0);
    const items = [];

    if (!total || density <= 0 || land === "snow") {
        return items;
    }

    const { a, b, half, ramps, kind } = bridge;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const outer = half + STONE_BRIDGE.wall;
    const own = (n, k) => hashOf(n, k, Math.floor(a[0]) * 7 + Math.floor(a[1]) + 4127);
    const kindOf = (pick) => {
        let left = pick * total;

        return (kinds.find(([, weight]) => (left -= weight) < 0) ?? kinds.at(-1))[0];
    };
    const at = (u, w) => [a[0] + ux * u - uy * w, a[1] + uy * u + ux * w];
    let n = 0;

    // Along the foot of its walls on each bank: every half metre or so, more often near the water
    for (const [from, to] of [[0.4, ramps[0] + 0.6], [length - ramps[1] - 0.6, length - 0.4]]) {
        for (let u = from; u < to; u += 0.45) {
            for (const side of [1, -1]) {
                n++;

                const near = 1 - Math.min(1, Math.min(Math.abs(u - ramps[0]), Math.abs(u - (length - ramps[1]))) / 4);

                if (own(n, 1) > (0.35 + 0.5 * near) * density) {
                    continue;
                }

                const [x, y] = at(u + (own(n, 2) - 0.5) * 0.4, side * (outer + 0.15 + own(n, 3) * 0.9));
                const ground = groundAt(x, y);

                if (ground > surface + 0.05) {
                    items.push({ kind: kindOf(own(n, 4)), land, look: Math.floor(own(n, 5) * 8), x, y, ground, turn: own(n, 6) * Math.PI * 2, size: 0.8 + 0.6 * own(n, 7), tint: [1, 1, 1] });
                }
            }
        }
    }

    // A few tufts in a packhorse bridge's coping, out of the joints between its stones
    if (kind === "track") {
        for (let k = 0; k < 6; k++) {
            if (own(k, 8) > 0.6 * density) {
                continue;
            }

            const u = 1 + own(k, 9) * (length - 2);
            const side = own(k, 10) < 0.5 ? 1 : -1;
            const [x, y] = at(u, side * (half + STONE_BRIDGE.wall / 2));

            items.push({ kind: kinds.some(([name]) => name === "tuft") ? "tuft" : kindOf(own(k, 11)), land, look: Math.floor(own(k, 12) * 8), x, y, ground: deckOf(bridge, u / length) + STONE_BRIDGE.grades.packhorse.parapet + 0.2, turn: own(k, 13) * Math.PI * 2, size: 0.6 + 0.3 * own(k, 14), tint: [1, 1, 1] });
        }
    }

    return items;
}

/**
 * A chunk's stone bridges (core's: { a, b, half, stone, kind, ramps, tower }), drawn: their parts in
 * the buildings' atlas, in the world, casting shadows and taking them; or null. `deckOf(bridge, t)`
 * their decks' heights, `groundAt(x, z)` the ground's, `surfaceOf(bridge)` the river's under each.
 */
export function stoneBridges(bridges, env) {
    return allAtOnce(stoneBridgeMaking(bridges, env));
}

/** stoneBridges, a part of a bridge at a time (each a yield: chunks3d.js makes them so). */
export function* stoneBridgeMaking(bridges, { deckOf, groundAt, surfaceOf }) {
    if (!bridges.length) {
        return null;
    }

    const root = new THREE.Group();

    for (const bridge of bridges) {
        const { a, b, half, ramps } = bridge;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const solid = new Solid();

        yield* stoneBridgeBuilding(solid, {
            length,
            half,
            ramps,
            deck: (t) => deckOf(bridge, t),
            ground: (u) => groundAt(a[0] + ux * u, a[1] + uy * u),
            surface: surfaceOf(bridge),
            grade: GRADE_OF[bridge.kind] ?? "road",
            tower: Boolean(bridge.tower),
            seed: hashOf(Math.floor(a[0]), Math.floor(a[1]), 4111) * 1e9,
        });

        const holder = new THREE.Group();

        holder.position.set(a[0], 0, a[1]);
        holder.rotation.y = -Math.atan2(uy, ux);
        holder.scale.setScalar(1 / M);
        holder.add(solid.toObject());
        root.add(holder);
    }

    yield;
    root.updateMatrixWorld(true);

    const drawn = merge(root, { atlas: true });

    drawn.name = "stone bridges";

    for (const mesh of drawn.children) {
        mesh.updateMatrix();
    }

    return drawn;
}
