// A hell's Halls of Bone, flesh and bone (docs/DUNGEONS.md *Hells*): the second realm, where the
// lava gives way to blood (the research, "Levels of hell dungeon design": Diablo's Hell, "walls made
// from bone, threaded glowing veins of blood along the walls"). Its walls are flesh (caverns.js
// SHELLS.flesh), veins of blood glowing in them, beating as a heart does (veinsOn: dungeons3d.js
// SEAMS.veins); bone ribs rising out of them and arching over its halls, as if it were the inside
// of some great body (ribsOn); blood pooled on its floor; and in its last room, by the portal
// down, the heart it all beats to, the sacs where its demons are born round it.

import * as THREE from "three";
import { noise3 } from "./caverns.js";
import { roomLit } from "./roomlight.js";
import { VEIL } from "./veil.js";

const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

/**
 * The veins in the walls (`veins`): how far apart the great veins run, across and up (metres), and
 * how much of the flesh is in them (a share of noise's range at a vein's middle and its edge);
 * the lesser veins branching off them (`lesser`: as the great ones, and how near a great one they
 * stay, a share of the great ones' range); and the blood dried on the flesh and the sinew in it
 * (`dried`, `sinew`: fleshTone).
 */
export const FLESH = Object.freeze({
    veins: Object.freeze({ across: 2.6, up: 1.9, band: [0.9, 0.975] }),
    lesser: Object.freeze({ across: 1, up: 1, band: [0.92, 0.985], near: [0.55, 0.8], bright: 0.6 }),
    dried: Object.freeze({ size: 1.4, cover: [0.5, 0.72], dark: 0.4 }),
    sinew: Object.freeze({ across: 0.8, up: 2.2, band: [0.86, 0.96], colour: Object.freeze([0.42, 0.24, 0.17]) }),
});

/**
 * How the flesh of the Halls of Bone's walls is coloured at a point (level metres): patches of it
 * darkened where blood's dried on it (`dried`: how big, how much of it, a share of noise's range,
 * and how dark); and pale sinew running up it in streaks (`sinew`): a multiplier for its colour
 * (linear r, g, b), which is `tint` (linear r, g, b) where neither is.
 */
export function fleshTone(x, y, z, seed, tint) {
    const { dried, sinew } = FLESH;
    const dark = 1 - dried.dark * smoothstep(dried.cover[0], dried.cover[1], noise3(x / dried.size, y / dried.size, z / dried.size, seed + 107));
    const streak = smoothstep(sinew.band[0], sinew.band[1], 1 - Math.abs(2 * noise3(x / sinew.across, y / sinew.up, z / sinew.across, seed + 109) - 1));

    return sinew.colour.map((c, k) => (1 + (c / Math.max(1e-4, tint[k]) - 1) * streak * 0.7) * dark);
}

/**
 * The veins of blood in the Halls of Bone's walls at each of their points (`positions`: x, y, z
 * level metres, three a point): how much each glows, a byte (0 to 255: dungeons3d.js
 * rockMaterial's `seam`): the great veins where a noise is near its middle, up the walls and over
 * the roof, and lesser ones branching off them nearby, fainter.
 */
export function veinsOn(positions, seed) {
    const { veins, lesser } = FLESH;
    const glow = new Uint8Array(positions.length / 3);

    for (let p = 0, k = 0; p < positions.length; p += 3, k++) {
        const [x, y, z] = [positions[p], positions[p + 1], positions[p + 2]];
        const great = 1 - Math.abs(2 * noise3(x / veins.across, y / veins.up, z / veins.across, seed + 101) - 1);
        const small = 1 - Math.abs(2 * noise3(x / lesser.across, y / lesser.up, z / lesser.across, seed + 103) - 1);
        const lit = Math.max(smoothstep(veins.band[0], veins.band[1], great), lesser.bright * smoothstep(lesser.band[0], lesser.band[1], small) * smoothstep(lesser.near[0], lesser.near[1], great));

        glow[k] = Math.round(lit * 255);
    }

    return glow;
}

/**
 * The ribs rising out of the Halls of Bone's walls and arching over them (`RIBS`): every so many
 * squares along a wall (`apart`), at most of the places they could (`share`), standing a little out
 * of the flesh (`out`, metres), thick at their foot and thinning to their tip (`radius`, metres),
 * reaching out over the hall from the wall under the roof (`over`: metres, at most), each drawn as
 * a tube of so many rings and sides (`rings`, `sides`), the colour of old bone (`colour`, linear),
 * stained with blood towards their foot (`stain`, linear: up to `stained`, a share of the way up).
 */
export const RIBS = Object.freeze({ apart: 2, share: 0.8, out: 0.07, radius: Object.freeze([0.15, 0.055]), over: 1.6, rings: 18, sides: 7, colour: Object.freeze([0.6, 0.52, 0.38]), stain: Object.freeze([0.16, 0.035, 0.03]), stained: 0.3 });

// A number from 0 to 1 for a square of the level and a slot (the same every time)
function hashOf(x, y, slot) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(slot, 2246822519) ^ 0x68e31da4;

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const FOUR = Object.freeze([[0, -1], [-1, 0], [1, 0], [0, 1]]);

/**
 * Where the ribs run in a level (`width` by `height` squares; `bare(x, y)` whether a square's open
 * floor with nothing on it, `rock(x, y)` whether it's rock; `open(x, y, z)` how far into the open a
 * point is, and `roof(x, z)` how high the rock closes over a point: caverns.js cavern's): from each
 * square by a wall, every RIBS.apart along it, the open floor before it, a rib up the wall from its
 * foot, a little out of the flesh, and on out over the hall under the roof. Each [{ points: [[x,
 * y, z] level metres...], along: [dx, 0, dz] (the way along the wall), seed }].
 */
export function ribPaths(width, height, bare, rock, open, roof) {
    const { apart, share, out, over } = RIBS;
    const ribs = [];
    // (How far from a point along a way before it's in the rock, within `most` metres; or null)
    const meet = (x, y, z, [ux, uz], most) => {
        for (let s = 0; s <= most; s += 0.04) {
            if (open(x + ux * s, y, z + uz * s) <= 0) {
                return s;
            }
        }

        return null;
    };

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            if (!bare(x, y)) {
                continue;
            }

            for (const [dx, dy] of FOUR) {
                if (!rock(x + dx, y + dy) || !bare(x - dx, y - dy) || (dy !== 0 ? x : y) % apart !== 0 || hashOf(x, y, 3) >= share) {
                    continue;
                }

                const [cx, cz] = [x + 0.5, y + 0.5];
                const top = roof(cx, cz);
                const points = [];

                // (Up the wall from its foot, a little out of it, to under the roof)
                for (let h = 0.02; h < top - 0.35; h += 0.45) {
                    const s = meet(cx, h, cz, [dx, dy], 2.4);

                    if (s === null) {
                        break;
                    }

                    points.push([cx + dx * Math.max(0, s - out), h, cz + dy * Math.max(0, s - out)]);
                }

                // (And on out over the hall, under the roof)
                const last = points.at(-1);

                for (let t = 0.4; last && t <= over; t += 0.4) {
                    const [px, pz] = [last[0] - dx * t, last[2] - dy * t];
                    const high = roof(px, pz);

                    if (!high || high - out - 0.08 < last[1]) {
                        break;
                    }

                    points.push([px, high - out - 0.08, pz]);
                }

                if (points.length >= 5) {
                    ribs.push({ points, along: [-dy, 0, dx], seed: hashOf(x, y, 5) });
                }
            }
        }
    }

    return ribs;
}

// A point along a path through `points` (a uniform Catmull-Rom spline through them), `t` from 0
// (the first) to 1 (the last), and which way it runs there
function along(points, t) {
    const n = points.length - 1;
    const f = Math.min(n - 1e-6, Math.max(0, t * n));
    const k = Math.floor(f);
    const u = f - k;
    const [p0, p1, p2, p3] = [points[Math.max(0, k - 1)], points[k], points[k + 1], points[Math.min(n, k + 2)]];
    const at = (i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * u + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u * u + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u * u * u);
    const way = (i) => 0.5 * (-p0[i] + p2[i] + 2 * (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * u + 3 * (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * u * u);

    return { at: [at(0), at(1), at(2)], way: [way(0), way(1), way(2)] };
}

const unit = ([x, y, z]) => {
    const length = Math.hypot(x, y, z) || 1;

    return [x / length, y / length, z / length];
};
const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];

/**
 * The ribs (ribPaths') drawn: each a tube along its path, swelling at its foot where it comes out
 * of the flesh and thinning to its tip, old bone stained with blood towards its foot: { positions,
 * normals, colours (linear), indices } (level metres), all of them together.
 */
export function ribGeometry(ribs) {
    const { radius, rings, sides, colour, stain, stained } = RIBS;
    const [positions, normals, colours, indices] = [[], [], [], []];

    for (const { points, along: side, seed } of ribs) {
        const base = positions.length / 3;
        const shade = 0.82 + 0.18 * seed;

        for (let i = 0; i <= rings; i++) {
            const t = i / rings;
            const { at, way } = along(points, t);
            const tangent = unit(way);
            const across = unit(cross(tangent, side));
            const r = (radius[0] + (radius[1] - radius[0]) * t) * (1 + 0.45 * Math.exp(-t * 14));
            const blood = Math.max(0, 1 - t / stained);
            const tone = colour.map((c, k) => (c + (stain[k] - c) * blood) * shade);

            for (let j = 0; j < sides; j++) {
                const a = (j / sides) * Math.PI * 2;
                const normal = [across[0] * Math.cos(a) + side[0] * Math.sin(a), across[1] * Math.cos(a) + side[1] * Math.sin(a), across[2] * Math.cos(a) + side[2] * Math.sin(a)];

                positions.push(at[0] + normal[0] * r, at[1] + normal[1] * r, at[2] + normal[2] * r);
                normals.push(...normal);
                colours.push(...tone);
            }
        }

        for (let i = 0; i < rings; i++) {
            for (let j = 0; j < sides; j++) {
                const [a, b] = [base + i * sides, base + (i + 1) * sides];
                const k = (j + 1) % sides;

                indices.push(a + j, b + j, b + k, a + j, b + k, a + k);
            }
        }
    }

    return { positions, normals, colours, indices };
}

/**
 * Blood pooled on the Halls' floor (a plan's "&", walked through, its squares one pool): how far in
 * from its squares' edges it lies (`inset`, metres), how many points round its rim (`sides`) and
 * how much it wanders in and out (`wobble`, a share); how many drops are splashed round it
 * (`drops`) and how big (`drop`, metres across), how high it lies (`y`, metres) and its colours
 * (linear: dark in the middle, `deep`, thinner at its edge, `edge`).
 */
export const BLOOD = Object.freeze({ inset: 0.2, sides: 22, wobble: 0.22, drops: Object.freeze([3, 6]), drop: Object.freeze([0.08, 0.22]), y: 0.012, deep: Object.freeze([0.05, 0.002, 0.004]), edge: Object.freeze([0.16, 0.01, 0.012]) });

/**
 * The blood pooled on the Halls' floor drawn (its plan's pieces: x, y, w, h squares), each pool a
 * shape wandering round its squares' middle, darker in its middle, and drops splashed round it:
 * { positions, normals, colours (linear), indices } (level metres), every pool together, lying
 * flat on the floor.
 */
export function bloodGeometry(pieces) {
    const { inset, sides, wobble, drops, drop, y, deep, edge } = BLOOD;
    const [positions, normals, colours, indices] = [[], [], [], []];
    // (A blot round (x, z), `rx` by `rz` metres, its rim wandering as `slot`'s numbers say)
    const blot = (x, z, rx, rz, slot, points, rough) => {
        const base = positions.length / 3;
        const [p1, p2, p3] = [0, 1, 2].map((k) => hashOf(slot, k, 21) * Math.PI * 2);

        positions.push(x, y, z);
        colours.push(...deep);

        for (let k = 0; k < points; k++) {
            const a = (k / points) * Math.PI * 2;
            const out = 1 + rough * (0.5 * Math.sin(2 * a + p1) + 0.3 * Math.sin(3 * a + p2) + 0.2 * Math.sin(5 * a + p3));

            positions.push(x + Math.cos(a) * rx * out, y, z + Math.sin(a) * rz * out);
            colours.push(...edge);
        }

        for (let k = 0; k < points; k++) {
            indices.push(base, base + 1 + ((k + 1) % points), base + 1 + k);
        }
    };

    for (const piece of pieces) {
        const [cx, cz] = [piece.x + piece.w / 2, piece.y + piece.h / 2];
        const [rx, rz] = [piece.w / 2 - inset, piece.h / 2 - inset];
        const slot = piece.x * 131 + piece.y;
        const count = drops[0] + Math.floor(hashOf(piece.x, piece.y, 22) * (drops[1] - drops[0] + 1));

        blot(cx, cz, rx, rz, slot, sides, wobble);

        // (Drops splashed round it)
        for (let k = 0; k < count; k++) {
            const a = hashOf(slot, k, 23) * Math.PI * 2;
            const out = 1.05 + hashOf(slot, k, 24) * 0.45;
            const size = drop[0] + (drop[1] - drop[0]) * hashOf(slot, k, 25);

            blot(cx + Math.cos(a) * rx * out, cz + Math.sin(a) * rz * out, size / 2, size / 2, slot * 7 + k, 8, 0.25);
        }
    }

    for (let k = 0; k < positions.length / 3; k++) {
        normals.push(0, 1, 0);
    }

    return { positions, normals, colours, indices };
}

/**
 * The heart the Halls beat to, in their last room (a plan's "@", two squares by two), where their
 * master waits by the portal down: its body (`body`: how wide and how tall, metres, how many rings
 * and points round each it's drawn with, and how lumpy, a share); how much it swells as it beats
 * (`swell`, metres); its arteries rising from its top into the roof (`arteries`: how many, how
 * thick at the heart and at the roof, metres) and the veins running from its foot across the floor
 * to the walls and into them (`veins`: how many, how thick); the sacs round it where its demons
 * are born (`sacs`: how many, how far out from its middle, metres, and how big, metres long); its
 * colours (linear: its flesh, `flesh`, darker where it's bruised, `bruise`, the fat over its top,
 * `fat`, its vessels', `vessel`, its sacs' membrane, `membrane`, and the glow in them and its veins,
 * `glow`); and its light (a room's: roomlight.js, beating with it).
 */
export const HEART = Object.freeze({
    body: Object.freeze({ wide: 0.95, tall: 1.9, rings: 16, points: 22, lumps: 0.09 }),
    swell: 0.07,
    arteries: Object.freeze({ count: 3, thick: Object.freeze([0.17, 0.11]) }),
    veins: Object.freeze({ count: 5, thick: Object.freeze([0.06, 0.035]) }),
    sacs: Object.freeze({ count: 5, out: Object.freeze([1.7, 2.3]), long: Object.freeze([0.75, 1.05]) }),
    flesh: Object.freeze([0.2, 0.018, 0.022]),
    bruise: Object.freeze([0.07, 0.008, 0.03]),
    fat: Object.freeze([0.42, 0.3, 0.16]),
    vessel: Object.freeze([0.12, 0.012, 0.035]),
    membrane: Object.freeze([0.2, 0.085, 0.075]),
    glow: Object.freeze([0.85, 0.06, 0.03]),
    light: Object.freeze({ colour: 0xff2a18, intensity: 2.8, distance: 9, y: 1.3, breathe: 0.35 }),
});

// A mesh being built: its points, which way each faces, their colours and glows (linear) and how
// much each swells as the heart beats, and its triangles
function built() {
    const parts = { positions: [], normals: [], colours: [], glow: [], beat: [], indices: [] };

    parts.point = (at, normal, colour, glow, beat) => {
        parts.positions.push(...at);
        parts.normals.push(...normal);
        parts.colours.push(...colour);
        parts.glow.push(...glow);
        parts.beat.push(beat);

        return parts.positions.length / 3 - 1;
    };

    return parts;
}

// A tube along a path (`points`), as thick as `thick` says along it ([at its start, at its end]),
// each ring square to its way; its colour, glow and how much it swells along it (functions of how
// far along it a ring is, 0 to 1), into `parts`
function tube(parts, points, thick, { colour, glow = () => [0, 0, 0], beat = () => 0, sides = 7, rings = 14 }) {
    const base = parts.positions.length / 3;
    let side = null;

    for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        const { at, way } = along(points, t);
        const tangent = unit(way);

        // (Its sides turned as little as can be from one ring to the next)
        side = unit(cross(cross(tangent, side ?? (Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), tangent));

        const across = unit(cross(tangent, side));
        const r = thick[0] + (thick[1] - thick[0]) * t;

        for (let j = 0; j < sides; j++) {
            const a = (j / sides) * Math.PI * 2;
            const normal = [across[0] * Math.cos(a) + side[0] * Math.sin(a), across[1] * Math.cos(a) + side[1] * Math.sin(a), across[2] * Math.cos(a) + side[2] * Math.sin(a)];

            parts.point([at[0] + normal[0] * r, at[1] + normal[1] * r, at[2] + normal[2] * r], normal, colour(t), glow(t), beat(t));
        }
    }

    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < sides; j++) {
            const [a, b] = [base + i * sides, base + (i + 1) * sides];
            const k = (j + 1) % sides;

            parts.indices.push(a + j, b + j, b + k, a + j, b + k, a + k);
        }
    }
}

// A lumpy round body about `centre` ([x, y, z] metres), `rx`, `ry`, `rz` metres each way (`shape`,
// if given, reshaping each point on it: its way out from the middle, [x, y, z], to how far out
// that way, a share, or [across, up] a share each), coloured, glowing and swelling as `paint` says of each point (its way out
// and how far down it is, 0 at its top to 1 at its foot: [colour, glow, beat]), into `parts`
function lump(parts, centre, [rx, ry, rz], { rings, points, paint, shape = () => 1, turn = 0 }) {
    const base = parts.positions.length / 3;
    const [c, s] = [Math.cos(turn), Math.sin(turn)];

    for (let i = 0; i <= rings; i++) {
        const theta = (i / rings) * Math.PI;

        for (let j = 0; j < points; j++) {
            const phi = (j / points) * Math.PI * 2;
            const way = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
            const out = shape(way, i / rings);
            const [across, up] = Array.isArray(out) ? out : [out, out];
            const local = [way[0] * rx * across, way[1] * ry * up, way[2] * rz * across];
            const at = [centre[0] + local[0] * c - local[2] * s, centre[1] + local[1], centre[2] + local[0] * s + local[2] * c];
            const normal = unit([(way[0] / rx) * c - (way[2] / rz) * s, way[1] / ry, (way[0] / rx) * s + (way[2] / rz) * c]);
            const [colour, glow, beat] = paint(way, i / rings);

            parts.point(at, normal, colour, glow, beat);
        }
    }

    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < points; j++) {
            const [a, b] = [base + i * points, base + (i + 1) * points];
            const k = (j + 1) % points;

            parts.indices.push(a + j, a + k, b + k, a + j, b + k, b + j);
        }
    }
}

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/**
 * The heart (its plan's piece: x, y, w, h squares) and what grows from it, in the Halls' rock
 * (`open(x, y, z)`, how far into the open a point is, `roof(x, z)`, how high the rock closes over a
 * point: caverns.js cavern's; `bare(x, y)`, whether a square's open floor with nothing on it):
 * its body, lumpy, its apex on the floor, two chambers swelling at its top under a cap of fat,
 * bruised in patches, veins glowing on it; its arteries rising from its top and into the roof;
 * veins from its foot across the floor and into the walls, glowing; and the sacs round it, on the
 * floor, their membranes pale, glowing from within. { positions, normals, colours, glow (linear),
 * beat (how much each point swells as it beats, 0 to 1), indices } (level metres), all together.
 */
export function heartParts(piece, open, roof, bare) {
    const { body, arteries, veins, sacs } = HEART;
    const parts = built();
    const [cx, cz] = [piece.x + piece.w / 2, piece.y + piece.h / 2];
    const seed = Math.floor(hashOf(piece.x, piece.y, 31) * 1e6);
    const turn = hashOf(piece.x, piece.y, 32) * Math.PI * 2;
    const middle = body.tall / 2;

    // (Its body: narrowing to an apex at its foot, on the floor, its two chambers swelling at its
    // top)
    lump(parts, [cx, middle, cz], [body.wide, middle, body.wide * 0.85], {
        rings: body.rings,
        points: body.points,
        turn,
        shape: (way, down) => {
            const apex = 1 - 0.42 * smoothstep(0.55, 1, down);
            const chambers = 0.16 * Math.exp(-(((Math.atan2(way[2], way[0]) - 0.9) / 0.6) ** 2)) * Math.exp(-(((down - 0.22) / 0.14) ** 2)) + 0.14 * Math.exp(-(((Math.atan2(way[2], way[0]) + 1.1) / 0.6) ** 2)) * Math.exp(-(((down - 0.25) / 0.14) ** 2));
            const lumpy = 1 + body.lumps * (2 * noise3(way[0] * 2.2 + 7, way[1] * 2.2, way[2] * 2.2, seed) - 1);

            return [apex * lumpy + chambers, lumpy + chambers];
        },
        paint: (way, down) => {
            const bruise = smoothstep(0.55, 0.72, noise3(way[0] * 1.8, way[1] * 1.8 + 3, way[2] * 1.8, seed + 1));
            const fat = smoothstep(0.32, 0.12, down) * smoothstep(0.35, 0.6, noise3(way[0] * 3, way[1] * 3, way[2] * 3, seed + 2));
            const vein = smoothstep(0.88, 0.97, 1 - Math.abs(2 * noise3(way[0] * 2.4, way[1] * 1.4, way[2] * 2.4, seed + 3) - 1));

            return [mix(mix(HEART.flesh, HEART.bruise, bruise), HEART.fat, fat), HEART.glow.map((g) => g * vein * 0.9), 1];
        },
    });

    // (Its arteries, from its top up into the roof)
    for (let k = 0; k < arteries.count; k++) {
        const a = turn + (k / arteries.count) * Math.PI * 2 + hashOf(seed, k, 33) * 0.8;
        const [ux, uz] = [Math.cos(a), Math.sin(a)];
        const out = 1 + hashOf(seed, k, 34) * 0.8;
        const [tx, tz] = [cx + ux * out, cz + uz * out];
        const top = roof(tx, tz) || body.tall + 1.5;
        const points = [
            [cx + ux * 0.25, body.tall - 0.12, cz + uz * 0.25],
            [cx + ux * 0.45, body.tall + 0.35, cz + uz * 0.45],
            [cx + ux * (out * 0.75), (body.tall + top) / 2 + 0.3, cz + uz * (out * 0.75)],
            [tx, top - 0.25, tz],
            [tx + ux * 0.15, top + 0.4, tz + uz * 0.15],
        ];

        tube(parts, points, arteries.thick, { colour: () => HEART.vessel, beat: (t) => Math.max(0, 1 - t * 2.5) * 0.6, sides: 8, rings: 16 });
    }

    // (Its veins, from its foot across the floor, and up into the walls where they meet them)
    for (let k = 0; k < veins.count; k++) {
        const a = turn + 0.4 + (k / veins.count) * Math.PI * 2 + hashOf(seed, k, 35) * 0.6;
        const [ux, uz] = [Math.cos(a), Math.sin(a)];
        const points = [[cx + ux * 0.55, 0.1, cz + uz * 0.55]];

        for (let d = 1.1; d < 12; d += 0.55) {
            const wiggle = 0.25 * Math.sin(d * 1.7 + k);
            const [x, z] = [cx + ux * d - uz * wiggle, cz + uz * d + ux * wiggle];

            if (open(x, 0.15, z) <= 0.05) {
                points.push([x - ux * 0.1, 0.4, z - uz * 0.1], [x + ux * 0.25, 0.8, z + uz * 0.25]);
                break;
            }

            points.push([x, 0.04, z]);
        }

        if (points.length >= 4) {
            tube(parts, points, veins.thick, { colour: () => HEART.vessel, glow: () => HEART.glow.map((g) => g * 0.18), sides: 6, rings: Math.min(40, points.length * 3) });
        }
    }

    // (The sacs round it, where its demons are born: on bare floor, lying)
    for (let k = 0; k < sacs.count; k++) {
        const a = turn + 0.2 + (k / sacs.count) * Math.PI * 2;
        const out = sacs.out[0] + (sacs.out[1] - sacs.out[0]) * hashOf(seed, k, 36);
        const [x, z] = [cx + Math.cos(a) * out, cz + Math.sin(a) * out];

        if (!bare(Math.floor(x), Math.floor(z))) {
            continue;
        }

        const long = sacs.long[0] + (sacs.long[1] - sacs.long[0]) * hashOf(seed, k, 37);

        lump(parts, [x, long * 0.36, z], [long / 2, long * 0.4, long * 0.4], {
            rings: 9,
            points: 12,
            turn: a + hashOf(seed, k, 38),
            shape: (way) => 1 + 0.06 * (2 * noise3(way[0] * 3 + k, way[1] * 3, way[2] * 3, seed + 4) - 1),
            paint: (way, down) => [HEART.membrane, HEART.glow.map((g) => g * 0.7 * Math.sin(Math.PI * down) ** 2), 0.25],
        });
    }

    return parts;
}

/** The heart's light (a room's: roomlight.js), over its middle, beating as it does. */
export function heartLight(piece) {
    const { colour, intensity, distance, y, breathe } = HEART.light;

    return { kind: "heart", x: piece.x + piece.w / 2, y, z: piece.y + piece.h / 2, colour, intensity, distance, flicker: 0, breathe, rate: 0, pace: (Math.PI * 2) / 1.2, seed: 0 };
}

let heart = null;

/**
 * The material the heart and what grows from it are drawn with: lit by the room (roomlight.js),
 * wet; each point swelling out as the heart beats (its `beat`: as much as it says), twice and then
 * a rest, a beat every 1.2 seconds by the veils' clock (VEIL), as the veins in the walls beat
 * (dungeons3d.js SEAMS.veins); and glowing (its `glow`), brighter as it beats.
 */
export function heartMaterial() {
    if (!heart) {
        heart = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 });
        heart.name = "heart";
        heart.onBeforeCompile = (shader) => {
            shader.uniforms.veilTime = VEIL.time;

            const beating = "float heartPhase = fract(veilTime / 1.2);\nfloat heartBeat = exp(-pow(heartPhase / 0.07, 2.0)) + 0.6 * exp(-pow((heartPhase - 0.24) / 0.08, 2.0));";

            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nattribute vec3 glow;\nattribute float beat;\nuniform float veilTime;\nvarying vec3 vHeartGlow;\nvarying vec3 vCutWorld;")
                .replace("#include <begin_vertex>", `#include <begin_vertex>\n${beating}\ntransformed += objectNormal * beat * heartBeat * ${HEART.swell.toFixed(3)};\nvHeartGlow = glow * (0.45 + 0.55 * heartBeat);`)
                .replace("#include <project_vertex>", "#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", "#include <common>\nvarying vec3 vHeartGlow;\nvarying vec3 vCutWorld;")
                .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vHeartGlow;");
            roomLit(shader);
        };
        heart.customProgramCacheKey = () => "dungeon-heart";
    }

    return heart;
}
