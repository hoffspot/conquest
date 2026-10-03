// Broken aqueducts (core/aqueducts.js; the terrain plan's M7i-3): a row of piers of old pale stone
// striding across a dip in the human lands, round arches between them ringed with their own
// stones, and over them the channel that carried the water: two low walls, a floor between, some of
// its cover slabs still on. Where it's tall, a lower row of arches under the upper, a string course
// between them. Broken: piers standing to a jagged stump, arches fallen from between their piers
// leaving only a stub springing from each, and their stone lying in rubble below; ivy hanging from
// the broken tops.
//
// Each chunk draws its own piers (its features: core/overworld.js) and the arches from them to the
// next; built in the art's measure (five world pixels to a metre) along x from each pier, across z,
// then turned and set in the world, merged with the buildings' atlas into a draw or two, its ivy one
// more.

import * as THREE from "three";
import { AQUEDUCTS } from "../../../core/aqueducts.js";
import { hashOf } from "../../../core/noise.js";
import { createRandom } from "../../../core/random.js";
import { allAtOnce } from "../../../core/steps.js";
import { merge } from "../../town3d.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { ivyCurtain } from "./ivy.js";

const M = 5;
const m = (metres) => metres * M;

/**
 * An aqueduct's measures (metres): how thick its masonry is over its arches' crowns (to the
 * channel's floor); its channel's walls' height and thickness, and how wide its water ran; how
 * deep its arches' stones are, and how wide each; how far its imposts and string course stand out;
 * how tall a pier has to be for a lower row of arches; how deep its foot goes into the ground; how
 * likely a span's cover slabs are each to be there; and how much ivy (each broken top's chance of
 * a curtain).
 */
export const AQUEDUCT_LOOK = Object.freeze({
    crown: 0.9,
    walls: Object.freeze([0.9, 0.45]),
    channel: 0.8,
    ring: 0.55,
    stone: 0.5,
    proud: 0.07,
    tiers: 14,
    foot: 0.6,
    slabs: 0.55,
    ivy: 0.6,
});

/**
 * An aqueduct's arches between two of its piers (core's: the span from pier `n` to the next):
 * [{ crown, springs, radius }] from the upper to the lower: one, or two where its piers are tall
 * enough (the lower row's crown at the string course halfway up).
 */
export function archesOf(aqueduct, n) {
    const [a, b] = [aqueduct.piers[n], aqueduct.piers[n + 1]];
    const radius = (aqueduct.spacing - AQUEDUCTS.pier[0]) / 2;
    const crown = aqueduct.top - AQUEDUCT_LOOK.crown;
    const arches = [{ crown, springs: crown - radius, radius }];
    const low = Math.min(a.ground, b.ground);

    if (aqueduct.top - low > AQUEDUCT_LOOK.tiers) {
        const string = low + (aqueduct.top - low) * 0.5;

        arches.push({ crown: string - 0.6, springs: string - 0.6 - radius, radius, string });
    }

    return arches;
}

/** A chunk's aqueduct piers (its features: core/overworld.js, each `standing` or its rubble) and the arches from each to the next, drawn (null if none); `standing(aqueduct, n)` whether a pier stands (its chunk's feature has it so). */
export function aqueductMesh(piers, options) {
    return allAtOnce(aqueductMaking(piers, options));
}

/** aqueductMesh, a pier and its arches at a time (each a yield: chunks3d.js makes it so). */
export function* aqueductMaking(piers, { groundAt, standing }) {
    if (!piers.length) {
        return null;
    }

    const root = new THREE.Group();
    const ivy = new Solid();

    for (const { aqueduct, pier: n, standing: up } of piers) {
        const solid = new Solid();
        const pier = aqueduct.piers[n];
        const whole = up && pier.state === "whole";

        if (up) {
            pierInto(solid, ivy, aqueduct, n, groundAt);
        }

        // The arches on to the next pier: standing if core has them so and both piers stand; else,
        // a stub of each springing from this pier, and from the last towards this one
        const next = aqueduct.piers[n + 1];
        const onward = next && whole && aqueduct.spans[n] && standing(aqueduct, n + 1);

        if (onward) {
            spanInto(solid, aqueduct, n);
        } else if (next && whole) {
            stubInto(solid, aqueduct, n, 1);
        }

        if (n > 0 && whole && !(aqueduct.spans[n - 1] && standing(aqueduct, n - 1))) {
            stubInto(solid, aqueduct, n, -1);
        }

        // What's fallen: its stone in a heap where the pier stood, if it's down or broken, and
        // under the arch on to the next, if that's down
        rubbleInto(solid, aqueduct, n, groundAt, { pier: !up ? "fallen" : pier.state, span: next && !onward });

        const holder = new THREE.Group();

        holder.position.set(pier.x, 0, pier.y);
        holder.rotation.y = -aqueduct.turn;
        holder.scale.setScalar(1 / M);
        holder.add(solid.toObject());
        root.add(holder);
        yield;
    }

    root.updateMatrixWorld(true);

    const drawn = merge(root, { atlas: true });

    drawn.name = "aqueducts";

    for (const mesh of drawn.children) {
        mesh.updateMatrix();
    }

    // (Its ivy: leaf cards, in the world as they're laid, one more draw)
    if (ivy.triangles) {
        const leaves = ivy.toObject();

        leaves.name = "aqueduct ivy";
        drawn.add(leaves);
    }

    return drawn;
}

// An aqueduct's stone's tone: darker towards the ground and under its arches, greener on what
// faces up
function toneOf(seed) {
    const mossy = [0.74, 0.86, 0.56];

    return (base) =>
        Object.assign(
            (point, normal) => {
                const up = (point[1] / M - base) / 1.6;
                const grime = 1 - 0.28 * (1 - Math.min(1, Math.max(0, up)));
                const under = normal[1] < -0.3 ? 0.62 : 1;
                const green = Math.min(1, Math.max(0, normal[1] - 0.5) * 2 * (0.4 + 0.3 * seed));

                return [grime * under * (1 - green + green * mossy[0]), grime * under * (1 - green + green * mossy[1]), grime * under * (1 - green + green * mossy[2])];
            },
            { bands: [m(base + 1.6)] },
        );
}

// A pier, at the origin (along x, across z): its four faces from its foot to its top (to the
// channel's floor and walls if it's whole; to a jagged stump if it's broken, ivy hanging from it),
// an impost round it where its arches spring, a string course where a lower row's do
function pierInto(solid, ivy, aqueduct, n, groundAt) {
    const pier = aqueduct.piers[n];
    const [along, across] = [AQUEDUCTS.pier[0] / 2, AQUEDUCTS.pier[1] / 2];
    const walls = material("stone-lime-old");
    const dressed = material("dressed-old");
    const random = createRandom(Math.floor(hashOf(n, 7, Math.floor(aqueduct.variant * 1e6)) * 2147483647));
    const foot = Math.min(...[-1, 1].flatMap((su) => [-1, 1].map((sz) => groundOf(aqueduct, pier, su * along, sz * across, groundAt)))) - AQUEDUCT_LOOK.foot;
    const whole = pier.state === "whole";
    const top = whole ? aqueduct.top : pier.ground + pier.height;
    const P = (u, y, z) => [m(u), m(y), m(z)];

    solid.tone = toneOf(aqueduct.variant)(pier.ground);

    // Its faces up to its top (a broken one's a little below its jagged stump)
    const flat = whole ? top : top - 0.6;

    for (const [corners, out] of [
        [[[-along, -across], [along, -across]], [0, 0, -1]],
        [[[along, across], [-along, across]], [0, 0, 1]],
        [[[along, -across], [along, across]], [1, 0, 0]],
        [[[-along, across], [-along, -across]], [-1, 0, 0]],
    ]) {
        const [[u0, z0], [u1, z1]] = corners;

        solid.facing([P(u0, foot, z0), P(u1, foot, z1), P(u1, flat, z1), P(u0, flat, z0)], out, walls);
    }

    if (whole) {
        channelInto(solid, aqueduct, -along, along, random);
    } else {
        // A broken top: blocks standing to their own heights, the highest in its middle
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                const [u0, u1] = [-along + (i * along * 2) / 3, -along + ((i + 1) * along * 2) / 3];
                const [z0, z1] = [-across + j * across, -across + (j + 1) * across];
                const high = flat + random.range(0.05, 0.95) * (i === 1 ? 1 : 0.7);

                solid.box(m(u0), m(flat - 0.05), m(z0), m(u1), m(high), m(z1), walls);
            }
        }

        // Ivy hanging from it, down a side or two
        for (const side of [-1, 1]) {
            if (random.next() < AQUEDUCT_LOOK.ivy) {
                ivyCurtain(ivy, random, faceOf(aqueduct, pier, side, flat + 0.3, pier.ground), [m(-along), m(along)]);
            }
        }
    }

    // Its impost where its upper arches spring, and the string course of a lower row
    const [arches] = [aqueduct.piers[n + 1] ? archesOf(aqueduct, n) : n > 0 ? archesOf(aqueduct, n - 1) : []];

    for (const { springs, string } of arches ?? []) {
        for (const y of string ? [springs, string - 0.12] : [springs]) {
            if (y < top - 0.3) {
                solid.box(m(-along - 0.12), m(y - 0.12), m(-across - 0.12), m(along + 0.12), m(y + 0.14), m(across + 0.12), dressed);
            }
        }
    }
}

// The ground under a point near a pier (`u` along its aqueduct from it, `w` across), metres
function groundOf(aqueduct, pier, u, w, groundAt) {
    const [ux, uy] = [Math.cos(aqueduct.turn), Math.sin(aqueduct.turn)];

    return groundAt(pier.x + ux * u - uy * w, pier.y + uy * u + ux * w);
}

// One of a pier's long faces (`side` across: -1 or 1) for ivy to hang on (kits/ivy.js), in the
// pier's own measure: down from `top` to `base`
function faceOf(aqueduct, pier, side, top, base) {
    const across = AQUEDUCTS.pier[1] / 2;

    return {
        place: (u, y, proud) => [u, y, side * (m(across) + proud)],
        out: () => [0, 0, side],
        heightAt: () => m(top),
        base: m(base),
    };
}

// The channel over a stretch of an aqueduct (from u0 to u1 along it, at its own pier's origin): its
// floor, its two walls, and what's left of its cover slabs
function channelInto(solid, aqueduct, u0, u1, random) {
    const [high, thick] = AQUEDUCT_LOOK.walls;
    const across = AQUEDUCTS.pier[1] / 2;
    const inner = AQUEDUCT_LOOK.channel / 2;
    const walls = material("stone-lime-old");
    const dressed = material("dressed-old");
    const top = aqueduct.top;
    const P = (u, y, z) => [m(u), m(y), m(z)];

    // (Its floor between the walls, and the walls' tops and sides)
    solid.facing([P(u0, top, -inner), P(u1, top, -inner), P(u1, top, inner), P(u0, top, inner)], [0, 1, 0], walls);

    for (const side of [-1, 1]) {
        const [zi, zo] = [side * inner, side * across];

        solid.facing([P(u0, top, zo), P(u1, top, zo), P(u1, top + high, zo), P(u0, top + high, zo)], [0, 0, side], walls);
        solid.facing([P(u0, top, zi), P(u1, top, zi), P(u1, top + high, zi), P(u0, top + high, zi)], [0, 0, -side], walls);
        solid.facing([P(u0, top + high, zi), P(u1, top + high, zi), P(u1, top + high, zo), P(u0, top + high, zo)], [0, 1, 0], dressed);
    }

    // (Its cover slabs, a metre or so each, lying across the channel on its walls' inner edges,
    // flush with their tops; some gone)
    for (let u = u0; u < u1 - 0.3; u += 1.05) {
        if (random.next() < AQUEDUCT_LOOK.slabs) {
            solid.box(m(u + 0.03), m(top + high - 0.16), m(-inner - thick * 0.35), m(Math.min(u1, u + 1) - 0.03), m(top + high + 0.02), m(inner + thick * 0.35), dressed);
        }
    }

    return thick;
}

// The arches from pier `n` to the next (at pier n's origin, along x): for each row, its faces from
// its arch up (to the channel's floor, or the string course), its vault, its ring of stones; the
// channel over them
function spanInto(solid, aqueduct, n) {
    const along = AQUEDUCTS.pier[0] / 2;
    const across = AQUEDUCTS.pier[1] / 2;
    const [from, to] = [along, aqueduct.spacing - along];
    const middle = aqueduct.spacing / 2;
    const walls = material("stone-lime-old");
    const dressed = material("dressed-old");
    const random = createRandom(Math.floor(hashOf(n, 11, Math.floor(aqueduct.variant * 1e6)) * 2147483647));
    const P = (u, y, z) => [m(u), m(y), m(z)];
    const rows = archesOf(aqueduct, n);
    const steps = 12;

    solid.tone = toneOf(aqueduct.variant)(Math.min(aqueduct.piers[n].ground, aqueduct.piers[n + 1].ground));

    for (const [row, { crown, springs, radius, string }] of rows.entries()) {
        // (Up to the channel's floor over the upper row; up to the string course over a lower)
        const roof = row === 0 ? aqueduct.top : string;
        const curve = (k) => {
            const angle = Math.PI - (k / steps) * Math.PI;

            return [middle + radius * Math.cos(angle), springs + radius * Math.sin(angle)];
        };

        for (let k = 0; k < steps; k++) {
            const [[ua, ya], [ub, yb]] = [curve(k), curve(k + 1)];

            for (const side of [-1, 1]) {
                solid.facing([P(ua, ya, side * across), P(ub, yb, side * across), P(ub, roof, side * across), P(ua, roof, side * across)], [0, 0, side], walls);
            }

            // (Its vault, facing in)
            const mid = (k + 0.5) / steps;
            const angle = Math.PI - mid * Math.PI;

            solid.facing([P(ua, ya, -across), P(ub, yb, -across), P(ub, yb, across), P(ua, ya, across)], [-Math.cos(angle), -Math.sin(angle), 0], walls);
        }

        // (Its sides from the piers up to where it springs: the piers' faces are theirs)
        // Its ring of stones on each face, long and short in turn, a keystone at its crown
        const count = Math.max(7, Math.round((Math.PI * radius) / AQUEDUCT_LOOK.stone) | 1);

        for (const side of [-1, 1]) {
            const z = side * (across + AQUEDUCT_LOOK.proud);

            for (let k = 0; k < count; k++) {
                const gap = 0.03 / radius;
                const [a, b] = [Math.PI - (k / count) * Math.PI - gap / 2, Math.PI - ((k + 1) / count) * Math.PI + gap / 2];
                const key = k === (count - 1) / 2;
                const depth = AQUEDUCT_LOOK.ring * (key ? 1.3 : k % 2 ? 0.82 : 1.06);
                const at = (angle, r) => P(middle + r * Math.cos(angle), springs + r * Math.sin(angle), z);
                const shade = 0.86 + 0.26 * random.next();

                solid.facing([at(a, radius), at(b, radius), at(b, radius + depth), at(a, radius + depth)], [0, 0, side], dressed, undefined, solid.tone(at(a, radius), [0, 0, side]).map((v) => v * shade));
            }
        }

        // A string course along its faces over a lower row, and the lower row's top between them:
        // a deck of the same stone as its piers, the upper row standing on it
        if (string !== undefined) {
            for (const side of [-1, 1]) {
                solid.box(m(from), m(string - 0.12), m(side < 0 ? -across - 0.1 : across - 0.3), m(to), m(string + 0.14), m(side < 0 ? -across + 0.3 : across + 0.1), dressed);
            }

            solid.facing([P(from, string + 0.04, -across + 0.3), P(to, string + 0.04, -across + 0.3), P(to, string + 0.04, across - 0.3), P(from, string + 0.04, across - 0.3)], [0, 1, 0], walls);
        }

        if (crown > roof) {
            break;
        }
    }

    channelInto(solid, aqueduct, from, to, random);
}

// A stub of an arch fallen from between two piers, springing from pier `n` towards the next
// (`way` 1) or the last (-1): its first stones, broken off, the wall over them broken lower
function stubInto(solid, aqueduct, n, way) {
    const along = AQUEDUCTS.pier[0] / 2;
    const across = AQUEDUCTS.pier[1] / 2;
    const walls = material("stone-lime-old");
    const dressed = material("dressed-old");
    const [{ springs, radius }] = archesOf(aqueduct, way > 0 ? n : n - 1);
    const random = createRandom(Math.floor(hashOf(n, way > 0 ? 13 : 17, Math.floor(aqueduct.variant * 1e6)) * 2147483647));
    const reach = 0.6 + random.next() * 0.9;
    const P = (u, y, z) => [m(way * u), m(y), m(z)];
    const steps = 4;

    for (let k = 0; k < steps; k++) {
        const [ua, ub] = [along + (reach * k) / steps, along + (reach * (k + 1)) / steps];
        const curve = (u) => springs + Math.sqrt(Math.max(0, radius * radius - (radius - (u - along)) ** 2));
        const [ya, yb] = [curve(ua), curve(ub)];
        const roof = aqueduct.top - 0.4 - (k / steps) * random.range(1, 2.5);

        for (const side of [-1, 1]) {
            const out = [0, 0, side];

            solid.facing([P(ua, ya, side * across), P(ub, yb, side * across), P(ub, roof, side * across), P(ua, roof, side * across)], out, walls);
        }

        solid.facing([P(ua, ya, -across), P(ub, yb, -across), P(ub, yb, across), P(ua, ya, across)], [0, -1, 0], walls);
        solid.facing([P(ua, roof, -across), P(ub, roof, -across), P(ub, roof, across), P(ua, roof, across)], [0, 1, 0], walls);
    }

    // (Its broken end)
    const end = along + reach;
    const low = springs + Math.sqrt(Math.max(0, radius * radius - (radius - reach) ** 2));

    solid.facing([P(end, low, -across), P(end, low, across), P(end, aqueduct.top - 2.2, across), P(end, aqueduct.top - 2.2, -across)], [way, 0, 0], walls);
    solid.box(m(Math.min(way * along, way * end)), m(low - 0.05), m(-across - 0.06), m(Math.max(way * along, way * end)), m(low + AQUEDUCT_LOOK.ring * 0.5), m(across + 0.06), dressed);
}

// Rubble below a fallen pier or span from pier `n`: its stone in a heap on the ground, blocks of
// every size, some half sunk; a heap where a pier's fallen bigger than under a broken one
function rubbleInto(solid, aqueduct, n, groundAt, { pier: state, span }) {
    const pier = aqueduct.piers[n];
    const dressed = material("dressed-old");
    const walls = material("stone-lime-old");
    const random = createRandom(Math.floor(hashOf(n, 19, Math.floor(aqueduct.variant * 1e6)) * 2147483647));
    const heaps = [];

    if (span) {
        heaps.push([aqueduct.spacing / 2, aqueduct.spacing * 0.4, 18]);
    }

    if (state !== "whole") {
        heaps.push(state === "fallen" ? [0, 2.2, 16] : [0, 1.8, 8]);
    }

    for (const [middle, spread, count] of heaps) {
        for (let k = 0; k < count; k++) {
            const u = middle + random.range(-spread, spread);
            const w = random.range(-2.4, 2.4) * (0.5 + random.next() * 0.5);
            const size = random.range(0.25, 0.8) * (state === "fallen" && middle === 0 ? 1.25 : 1);
            const ground = groundOf(aqueduct, pier, u, w, groundAt);

            solid.turnedBox(m(u), m(w), m(size / 2), m(size * random.range(0.5, 0.8)), m(ground - size * 0.3), m(ground + size * random.range(0.35, 0.7)), random.next() * Math.PI, random.next() < 0.5 ? dressed : walls);
        }
    }
}
