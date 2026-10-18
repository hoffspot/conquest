// Colonies of glowing fungus on an ants' nest's walls (themes.js `lit: "glow"`; place.js puts them
// on the walls: docs/DUNGEONS.md), what lights the nest, no ant lighting a torch. Each is a cluster
// of little bell-capped mushrooms (as Mycena grow) and a few brackets (as Panellus) on the earth of
// the wall and at its foot, glowing their own cold green, brightest under their caps where the
// gills are; its light (roomlight.js: a room's light of its colour, steady but for a slow breath);
// and its threads in the earth round it, glowing faintly in patches on the rock (threadsOn: the
// rock's `glow`, dungeons3d.js rockMaterial). Fungi glow green, about 520 to 530 nm: here
// desaturated, cold against the warm earth.
//
// Each colony is grown on the rock as it's drawn (caverns.js: how far into the open each point
// is), so its caps stand on the wall wherever the wall is. Pure maths on plain numbers, so it's
// tested in Node.

import { noise3 } from "./caverns.js";

/**
 * The colonies: their colours (sRGB: most green, some yellower, some bluer); their light (how
 * bright, how far it reaches, metres; how high, metres; how much it breathes, a share, and how
 * fast, radians a second); how many caps and brackets each has, how far along the wall from its
 * middle they grow (metres), and how high its middle is on the wall (metres: least and most); and
 * its threads in the earth round it (how far they reach, metres, and how bright they glow at most).
 */
export const FUNGUS = Object.freeze({
    colours: Object.freeze([0x5cf08c, 0x5cf08c, 0x9cf05a, 0x50e0c8]),
    light: Object.freeze({ intensity: 2.4, distance: 6, y: 0.8, out: 0.2, breathe: 0.12, rate: 1.4 }),
    caps: Object.freeze([7, 12]),
    brackets: Object.freeze([2, 4]),
    spread: 0.4,
    high: Object.freeze([0.35, 1.1]),
    threads: Object.freeze({ reach: 1.4, bright: 0.55 }),
});

// A number from 0 to 1 for a square of the level and a slot (the same every time)
function hashOf(x, y, slot) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(slot, 2246822519) ^ 0x2c1b3c6d;

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A colour (sRGB, 0xrrggbb) as linear r, g, b
const linear = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => {
    const c = byte / 255;

    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

const unit = ([x, y, z]) => {
    const length = Math.hypot(x, y, z) || 1;

    return [x / length, y / length, z / length];
};
const cross = ([ax, ay, az], [bx, by, bz]) => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
const along = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];

/** A colony's colour (sRGB, 0xrrggbb), by the square it grows by. */
export function colourOf([x, y]) {
    return FUNGUS.colours[Math.floor(hashOf(x, y, 1) * FUNGUS.colours.length)];
}

/**
 * A colony's light, by the square it grows by (`at`, place.js's) and the way to the wall it's on
 * (`wall`: [dx, dy]): a room's light (roomlight.js), out from the wall a little at its middle's
 * height, in level metres.
 */
export function glowOf(at, wall) {
    const [x, y] = at;
    const { intensity, distance, y: high, out, breathe, rate } = FUNGUS.light;

    return { kind: "glow", x: x + 0.5 + wall[0] * out, y: high, z: y + 0.5 + wall[1] * out, colour: colourOf(at), intensity, distance, flicker: 0, breathe, rate: 0, pace: rate, seed: hashOf(x, y, 2) * 50 };
}

// Where a line from `from` along `way` first meets the rock (how far into the open `open` says each
// point is: caverns.js), within `most` metres; or null
function meet(open, from, way, most) {
    for (let s = 0; s <= most; s += 0.03) {
        const p = along(from, way, s);

        if (open(p[0], p[1], p[2]) <= 0) {
            return p;
        }
    }

    return null;
}

// The way out of the rock at a point on it (where the open rises: the field's gradient), or `or`
function outAt(open, [x, y, z], or) {
    const e = 0.08;
    const g = [open(x + e, y, z) - open(x - e, y, z), open(x, y + e, z) - open(x, y - e, z), open(x, y, z + e) - open(x, y, z - e)];

    return Math.hypot(...g) > 1e-6 ? unit(g) : or;
}

// A mesh being built: its points, their colours (linear) and its triangles
function mesh() {
    const positions = [];
    const colours = [];
    const indices = [];

    return {
        positions,
        colours,
        indices,
        point(p, colour, bright) {
            positions.push(...p);
            colours.push(colour[0] * bright, colour[1] * bright, colour[2] * bright);

            return positions.length / 3 - 1;
        },
    };
}

// Two ways square to `axis` (unit), and each other
function squareTo(axis) {
    const side = unit(cross(Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], axis));

    return [side, cross(axis, side)];
}

// A little bell-capped mushroom: its stem from `base` along `way` (unit) `stem` metres, its cap
// `r` across at the top, rounded, drooping round its rim; dim at its foot and its crown, glowing
// brightest under its cap, where its gills are
function bell(built, base, way, stem, r, colour) {
    const [u, v] = squareTo(way);
    const top = along(base, way, stem);
    const ring = (centre, radius, bright, sides = 8) => Array.from({ length: sides }, (_, k) => {
        const a = (k / sides) * Math.PI * 2;

        return built.point([centre[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * radius, centre[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * radius, centre[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * radius], colour, bright);
    });
    const band = (lower, upper) => {
        for (let k = 0; k < lower.length; k++) {
            const j = (k + 1) % lower.length;

            built.indices.push(lower[k], lower[j], upper[j], lower[k], upper[j], upper[k]);
        }
    };

    // (Its stem: three sides, dim at its foot)
    band(ring(base, r * 0.18, 0.2, 3), ring(top, r * 0.14, 0.45, 3));

    // (Its cap: from its rim up round its shoulder to its crown, and in under it to its gills)
    const rim = ring(along(top, way, -r * 0.4), r, 0.6);
    const shoulder = ring(along(top, way, r * 0.3), r * 0.72, 0.75);
    const crown = built.point(along(top, way, r * 0.8), colour, 0.62);
    const gills = built.point(along(top, way, -r * 0.08), colour, 1.25);

    band(rim, shoulder);

    for (let k = 0; k < 8; k++) {
        const j = (k + 1) % 8;

        built.indices.push(crown, shoulder[k], shoulder[j], gills, rim[j], rim[k]);
    }
}

// A bracket, growing out of the wall at `base`: a half round shelf `r` out along `out`, `side` the
// way along the wall, thick at the wall and thinning to its edge, which droops a little; dim on
// top, glowing brightest underneath
function bracket(built, base, out, side, r, colour) {
    const rim = Array.from({ length: 9 }, (_, k) => {
        const a = (k / 8 - 0.5) * Math.PI;
        const reach = Math.cos(a);

        return [base[0] + (side[0] * Math.sin(a) + out[0] * reach) * r, base[1] - r * 0.22 * reach, base[2] + (side[2] * Math.sin(a) + out[2] * reach) * r];
    });
    const top = built.point([base[0], base[1] + r * 0.35, base[2]], colour, 0.35);
    const under = built.point([base[0], base[1] - r * 0.12, base[2]], colour, 1);
    const upper = rim.map((p) => built.point(p, colour, 0.6));
    const lower = rim.map((p) => built.point([p[0], p[1] - 0.006, p[2]], colour, 0.85));

    for (let k = 0; k < 8; k++) {
        built.indices.push(top, upper[k + 1], upper[k], under, lower[k], lower[k + 1], upper[k], upper[k + 1], lower[k + 1], upper[k], lower[k + 1], lower[k]);
    }
}

/**
 * A colony as it grows on a level's rock, by the square it's by (`at`) and the way to the wall
 * (`wall`: [dx, dy]): `open(x, y, z)`, how far into the open a point is (metres: caverns.js
 * cavern's). { anchor (its middle, on the rock), out (the way out of the rock there), colour
 * (sRGB), positions, colours (linear), indices: its caps and brackets }, in level metres.
 */
export function colonyAt(open, at, wall) {
    const [x, y] = at;
    const r = (slot) => hashOf(x, y, slot + 10);
    const colour = linear(colourOf(at));
    const high = FUNGUS.high[0] + (FUNGUS.high[1] - FUNGUS.high[0]) * r(0);
    const into = unit([wall[0], 0, wall[1]]);
    const centre = [x + 0.5, high, y + 0.5];
    const anchor = meet(open, centre, into, 1.6) ?? along(centre, into, 0.45);
    const out = outAt(open, anchor, [-into[0], 0, -into[2]]);
    // (Along the wall, level, and up it)
    const side = unit(cross([0, 1, 0], out));
    const up = cross(out, side);
    const built = mesh();
    // (A point on the wall `s` along it and `t` up it from the anchor: from a little way out, back
    // to the rock)
    const onWall = (s, t) => {
        const near = along(along(along(anchor, side, s), up, t), out, 0.35);

        return meet(open, near, [-out[0], -out[1], -out[2]], 0.9);
    };
    const caps = FUNGUS.caps[0] + Math.floor(r(1) * (FUNGUS.caps[1] - FUNGUS.caps[0] + 1));
    const brackets = FUNGUS.brackets[0] + Math.floor(r(2) * (FUNGUS.brackets[1] - FUNGUS.brackets[0] + 1));

    // (The brackets on the wall, one over another round the middle)
    for (let k = 0; k < brackets; k++) {
        const base = onWall((r(20 + k) - 0.5) * FUNGUS.spread * 1.2, (k - brackets / 2) * 0.12 + r(30 + k) * 0.08);

        if (base) {
            const there = outAt(open, base, out);

            bracket(built, along(base, there, -0.01), unit([there[0], 0, there[2]]), unit(cross([0, 1, 0], there)), 0.07 + r(40 + k) * 0.08, colour);
        }
    }

    // (The caps: most on the wall round the middle, leaning out and up; a few on the floor at its
    // foot, standing up, where the floor's open)
    const level = unit([out[0], 0, out[2]]);
    const onFloor = (k) => {
        const at = along(along([anchor[0], 0, anchor[2]], level, 0.1 + r(50 + k) * 0.4), side, (r(55 + k) - 0.5) * FUNGUS.spread * 1.5);

        return open(at[0], 0.15, at[2]) > 0.03 ? at : null;
    };

    for (let k = 0; k < caps; k++) {
        const floor = k >= caps - 3;
        const base = floor ? onFloor(k) : onWall((r(60 + k) - 0.5) * 2 * FUNGUS.spread, (r(70 + k) - 0.45) * 0.55);

        if (!base) {
            continue;
        }

        const there = floor ? [0, 1, 0] : outAt(open, base, out);
        const lean = unit([there[0] * 0.55 + (r(80 + k) - 0.5) * 0.3, 0.85 + there[1] * 0.3, there[2] * 0.55 + (r(90 + k) - 0.5) * 0.3]);

        bell(built, along(base, there, -0.01), lean, 0.06 + r(100 + k) * 0.1, 0.035 + r(110 + k) * 0.045, colour);
    }

    return { anchor, out, colour: colourOf(at), positions: built.positions, colours: built.colours, indices: built.indices };
}

/**
 * The colonies' threads in the earth round them, glowing faintly in patches on the rock: for each
 * point (`positions`: x, y, z, level metres), its glow (linear r, g, b, 0 to 255 each: a Uint8Array,
 * 3 a point), the more the nearer a colony (`colonies`: colonyAt's), out to FUNGUS.threads.reach,
 * mottled as threads run (`seed`: the level's).
 */
export function threadsOn(positions, colonies, seed) {
    const glow = new Uint8Array(positions.length);
    const { reach, bright } = FUNGUS.threads;
    const lit = colonies.map(({ anchor, colour }) => ({ anchor, colour: linear(colour) }));

    for (let p = 0; p < positions.length; p += 3) {
        const [x, y, z] = [positions[p], positions[p + 1], positions[p + 2]];
        let [r, g, b] = [0, 0, 0];

        for (const { anchor, colour } of lit) {
            const [dx, dy, dz] = [x - anchor[0], y - anchor[1], z - anchor[2]];

            if (Math.abs(dx) > reach || Math.abs(dz) > reach || Math.abs(dy) > reach) {
                continue;
            }

            const away = Math.hypot(dx, dy * 1.4, dz) / reach;

            if (away >= 1) {
                continue;
            }

            // (Patchy, as threads run through earth: none in some places, bright in others)
            const patch = Math.min(1, Math.max(0, (noise3(x * 2.3, y * 2.3, z * 2.3, seed + 53) - 0.38) * 3));
            const share = (1 - away) * (1 - away) * patch * bright;

            [r, g, b] = [r + colour[0] * share, g + colour[1] * share, b + colour[2] * share];
        }

        glow[p] = Math.min(255, Math.round(r * 255));
        glow[p + 1] = Math.min(255, Math.round(g * 255));
        glow[p + 2] = Math.min(255, Math.round(b * 255));
    }

    return glow;
}
