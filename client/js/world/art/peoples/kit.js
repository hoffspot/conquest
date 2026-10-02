// What every people's builders share: the measure (five world pixels to a metre, a plot of four
// metres twenty pixels), a piece's own random, the shapes of plans (circles, ovals, rounded
// squares, lenses, clusters), points spaced along an outline for the little things repeated along
// it (toron, spikes, stakes, fins, merlons), and the parts every people makes its own way: posts
// and poles, spikes and horns, ladders and stairs, banners, lamps, conical thatch with its fringe,
// orb webs, pinnacles. And the weathering painted on their corners: dirt splashed up the foot of
// the walls, shade under the eaves, each house's wash its own colour, lights left as they are.
//
// Everything is built facing south in the art's world pixels (x east, y up, z south), within the
// piece's lot: 0 to w * CELL across, 0 to h * CELL deep, its front at z = h * CELL.

import { createRandom, noise } from "../../../core/random.js";
import { LOOKS } from "../../cloth.js";
import { material } from "../engine/materials.js";
import { COLOURS } from "../engine/painters.js";
import { add3, cross, inset, sub, times, unit } from "../engine/solid.js";

/** World pixels to a metre, and to a plot (four metres). */
export const M = 5;
export const CELL = 20;
export const m = (metres) => metres * M;

/** A piece's own random (the same every time for the same piece), with `salt` for another. */
export function randomFor(piece, salt = 0) {
    const place = `${(piece.x ?? 0).toFixed?.(2) ?? piece.x},${(piece.y ?? 0).toFixed?.(2) ?? piece.y}-${piece.w}x${piece.h}-${piece.variant ?? 0}-${piece.name ?? piece.type ?? ""}`;
    const seed = piece.seed ?? [...place].reduce((total, character) => (Math.imul(total, 31) + character.charCodeAt(0)) >>> 0, 17);

    return createRandom((seed + salt * 7919) >>> 0);
}

// --- Plans: outlines of [x, z] corners, in order ---

/** A circle of `count` corners round (cx, cz), the first at `phase` radians (0 east, π/2 south). */
export function circle(cx, cz, r, count = 16, phase = 0) {
    return Array.from({ length: count }, (_, k) => {
        const angle = phase + (k * Math.PI * 2) / count;

        return [cx + Math.cos(angle) * r, cz + Math.sin(angle) * r];
    });
}

/** An oval, rx across and rz deep. */
export function oval(cx, cz, rx, rz, count = 16, phase = 0) {
    return circle(0, 0, 1, count, phase).map(([x, z]) => [cx + x * rx, cz + z * rz]);
}

/**
 * The phase that puts the middle of one side of a `count`-sided circle facing south (a door's
 * side: side 0).
 */
export const southSide = (count) => Math.PI / 2 - Math.PI / count;

/** A squarish oval (a superellipse: `power` 2 is an oval, 4 nearly a rounded box). */
export function squircle(cx, cz, rx, rz, power = 3, count = 20, phase = 0) {
    return Array.from({ length: count }, (_, k) => {
        const angle = phase + (k * Math.PI * 2) / count;
        const [c, s] = [Math.cos(angle), Math.sin(angle)];

        return [cx + Math.sign(c) * Math.abs(c) ** (2 / power) * rx, cz + Math.sign(s) * Math.abs(s) ** (2 / power) * rz];
    });
}

/** A rectangle with its corners rounded (`r` world pixels, `steps` a corner). */
export function roundedRect(x0, z0, x1, z1, r, steps = 3) {
    const points = [];
    const corners = [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, Math.PI / 2], [x0 + r, z0 + r, Math.PI], [x1 - r, z0 + r, (Math.PI * 3) / 2]];

    for (const [cx, cz, from] of corners) {
        for (let k = 0; k <= steps; k++) {
            const angle = from + (k * Math.PI) / 2 / steps;

            points.push([cx + Math.cos(angle) * r, cz + Math.sin(angle) * r]);
        }
    }

    return points;
}

/**
 * A lens: a long plan with bowed sides (a boat-shaped hall), `length` along x, `middle` wide in
 * the middle and `ends` wide at its ends, round (cx, cz); `count` corners down each side.
 */
export function lens(cx, cz, length, middle, ends, count = 8) {
    const half = (t) => (ends + (middle - ends) * Math.sin(Math.PI * t)) / 2;
    const side = Array.from({ length: count + 1 }, (_, k) => k / count);

    return [...side.map((t) => [cx - length / 2 + t * length, cz + half(t)]), ...side.reverse().map((t) => [cx - length / 2 + t * length, cz - half(t)])];
}

/** The middle of an outline (the mean of its corners). */
export const middleOf = (outline) => outline.reduce(([sx, sz], [x, z]) => [sx + x / outline.length, sz + z / outline.length], [0, 0]);

/** An outline moved and turned (radians, from x towards z) about (cx, cz). */
export function turned(outline, angle, cx = 0, cz = 0, dx = 0, dz = 0) {
    const [c, s] = [Math.cos(angle), Math.sin(angle)];

    return outline.map(([x, z]) => [cx + dx + (x - cx) * c - (z - cz) * s, cz + dz + (x - cx) * s + (z - cz) * c]);
}

/**
 * Points spaced along an outline (closed unless `open`), about `every` world pixels apart, none
 * within `margin` of a corner: [{ at: [x, z], along: [dx, dz] (unit), out: [nx, nz] (unit, away
 * from the outline's middle; to the left of the way along for an open line), side (which side of
 * the outline), u (how far along that side) }].
 */
export function spaced(outline, every, { open = false, margin = 0, offset = 0.5 } = {}) {
    const [mx, mz] = middleOf(outline);
    const sides = open ? outline.length - 1 : outline.length;
    const found = [];

    for (let k = 0; k < sides; k++) {
        const [[ax, az], [bx, bz]] = [outline[k], outline[(k + 1) % outline.length]];
        const length = Math.hypot(bx - ax, bz - az);
        const along = [(bx - ax) / length, (bz - az) / length];
        let out = [along[1], -along[0]];

        if (!open && (mx - (ax + bx) / 2) * out[0] + (mz - (az + bz) / 2) * out[1] > 0) {
            out = [-out[0], -out[1]];
        }

        const usable = length - margin * 2;
        const count = Math.floor(usable / every + 1e-9);

        for (let i = 0; i < count || (usable > every * 0.5 && i === 0 && count === 0); i++) {
            const u = margin + (count ? ((i + offset) * usable) / count : usable / 2);

            found.push({ at: [ax + along[0] * u, az + along[1] * u], along, out, side: k, u });
        }
    }

    return found;
}

// --- Parts ---

/**
 * A pole or a log from `from` to `to` ([x, y, z]), `r` thick at its foot (and `top` at its
 * head), `sides` sided: posts, stilts, poles, rafters, stakes. Capped at both ends, or as
 * `caps` says (Solid.tube's).
 */
export function pole(solid, from, to, r, name, { top = r, sides = 6, caps = true } = {}) {
    solid.tube([from, to], [r, top], material(name), { sides, caps });

    return solid;
}

/**
 * An upright post standing on (x, y, z), `height` tall, leaning `lean` ([dx, dz] at its top). (Its
 * top capped, not its foot: that's on what it stands on.)
 */
export function post(solid, x, y, z, height, r, name, { lean = [0, 0], sides = 6, top = r } = {}) {
    return pole(solid, [x, y, z], [x + lean[0], y + height, z + lean[1]], r, name, { sides, top, caps: "end" });
}

/** A spike (or a tusk, a horn, a thorn) from `at` pointing `way` ([x, y, z]), `length` long. */
export function spike(solid, at, way, length, r, name, { sides = 4, bend = null } = {}) {
    const d = unit(way);

    if (!bend) {
        solid.tube([at, add3(at, times(d, length))], [r, 0], material(name), { sides });

        return solid;
    }

    // (Curving towards `bend` as it goes: a tusk, a horn)
    const points = Array.from({ length: 5 }, (_, k) => {
        const t = k / 4;

        return add3(add3(at, times(d, length * t)), times(bend, length * t * t * 0.5));
    });

    solid.tube(points, points.map((_, k) => r * (1 - k / 4) ** 0.8), material(name), { sides });

    return solid;
}

/** A stake: a pole sharpened to a point, standing on (x, y, z). */
export function stake(solid, x, y, z, height, r, name, { lean = [0, 0], point = 0.25, sides = 6 } = {}) {
    const [top, tip] = [[x + lean[0] * (1 - point), y + height * (1 - point), z + lean[1] * (1 - point)], [x + lean[0], y + height, z + lean[1]]];

    solid.tube([[x, y, z], top, tip], [r, r, 0], material(name), { sides });

    return solid;
}

/** A ladder from `from` to `to` ([x, y, z], its feet and its top), `width` across. */
export function ladder(solid, from, to, width, name, { rungs = 0.35 } = {}) {
    const along = sub(to, from);
    const side = times(unit(cross(along, [0, 1, 0])), width / 2);

    for (const sign of [-1, 1]) {
        pole(solid, add3(from, times(side, sign)), add3(to, times(side, sign)), m(0.05), name, { sides: 4 });
    }

    const count = Math.floor(Math.hypot(...along) / m(rungs));

    for (let k = 1; k < count; k++) {
        const at = add3(from, times(along, k / count));

        pole(solid, add3(at, times(side, -1)), add3(at, side), m(0.03), name, { sides: 4 });
    }

    return solid;
}

/**
 * A flight of steps from (x, y0, z) rising to y1 along `way` ([dx, dz], unit), `width` across,
 * each tread `tread` deep: solid under them to the ground (or to `under`).
 */
export function steps(solid, x, z, y0, y1, way, width, name, { tread = m(0.3), riser = m(0.18), under = y0 } = {}) {
    const count = Math.max(1, Math.round((y1 - y0) / riser));
    const [dx, dz] = way;
    const [sx, sz] = [-dz * (width / 2), dx * (width / 2)];

    for (let k = 0; k < count; k++) {
        const top = y0 + ((k + 1) * (y1 - y0)) / count;
        const [a, b] = [k * tread, (k + 1) * tread];
        const corners = [[x + dx * a + sx, z + dz * a + sz], [x + dx * b + sx, z + dz * b + sz], [x + dx * b - sx, z + dz * b - sz], [x + dx * a - sx, z + dz * a - sz]];

        solid.extrude(corners, under, top, material(name));
    }

    return count * tread;
}

/**
 * A banner hanging from a pole: the pole standing on (x, y, z), `height` tall, a cloth `width`
 * wide and `drop` long of `cloth` (a plain colour's name, or a people's own: world/cloth.js LOOKS)
 * hanging from a crossbar at its head, swinging in the breeze, facing `facing` (radians, 0 south),
 * its foot cut in a swallowtail if `tail`.
 */
export function banner(solid, x, y, z, height, cloth, { width = m(0.7), drop = m(1.6), facing = 0, poleName = "timber", tail = true, top = null } = {}) {
    const [ax, az] = [Math.cos(facing), -Math.sin(facing)];
    const head = y + height;

    post(solid, x, y, z, height + m(0.15), m(0.06), poleName, { sides: 5 });
    pole(solid, [x - ax * width * 0.6, head, z - az * width * 0.6], [x + ax * width * 0.6, head, z + az * width * 0.6], m(0.035), poleName, { sides: 4 });

    const out = [Math.sin(facing), 0, Math.cos(facing)];
    const own = LOOKS.includes(cloth);

    (solid.cloth ??= []).push({ at: [x + out[0] * m(0.04), head, z + out[2] * m(0.04)], out, width, drop, kind: "hang", look: own ? cloth : tail ? "plain" : "square", colour: own ? null : COLOURS[cloth] });

    if (top) {
        top(solid, [x, head + m(0.15), z]);
    }

    return solid;
}

/**
 * A lamp: a glowing body `size` across at `at` ([x, y, z]), in a cage of `frame` (or none),
 * hanging on a chain from `hang` pixels above if asked.
 */
export function lamp(solid, at, light, { size = m(0.28), frame = "iron", hang = 0, shape = "lantern" } = {}) {
    const [x, y, z] = at;

    if (shape === "bud") {
        // (A drooping glass bud, after the Paris Métro's lamps)
        solid.lathe(x, z, [[0, y - size * 0.6], [size * 0.45, y - size * 0.35], [size * 0.5, y], [size * 0.3, y + size * 0.4], [0, y + size * 0.55]], material(light), { segments: 6, tone: null });
    } else if (shape === "orb") {
        solid.lathe(x, z, [[0, y - size / 2], [size * 0.45, y - size * 0.25], [size * 0.5, y], [size * 0.45, y + size * 0.25], [0, y + size / 2]], material(light), { segments: 6, tone: null });
    } else {
        solid.box(x - size / 2, y - size / 2, z - size / 2, x + size / 2, y + size / 2, z + size / 2, material(light));
    }

    if (frame && shape === "lantern") {
        solid.box(x - size * 0.6, y + size / 2, z - size * 0.6, x + size * 0.6, y + size * 0.62, z + size * 0.6, material(frame));
        solid.box(x - size * 0.6, y - size * 0.62, z - size * 0.6, x + size * 0.6, y - size / 2, z + size * 0.6, material(frame));
    }

    if (hang > 0) {
        pole(solid, [x, y + size * 0.55, z], [x, y + size * 0.55 + hang, z], m(0.015), frame ?? "iron", { sides: 3 });
    }

    return solid;
}

/**
 * Conical thatch over a round wall: from its eaves (radius `r` at height `y`) up to its peak
 * `height` above, a little hollow as it rises, laid in `skirts` courses each stepping out over
 * the next, its lower edge ragged. `segments` round.
 */
export function thatchCone(solid, cx, cz, y, r, height, name, { segments = 14, skirts = 2, hollow = 1.15, ragged = m(0.1), random = null, top = 0 } = {}) {
    const straw = material(name);
    const around = (radius, level, jag = 0) => Array.from({ length: segments }, (_, k) => {
        const angle = (k * Math.PI * 2) / segments;
        const drop = jag ? (k % 2 ? jag : jag * 0.3) * (random ? random.range(0.6, 1.2) : 1) : 0;

        return [cx + Math.cos(angle) * radius, level - drop, cz + Math.sin(angle) * radius];
    });

    // (The cone itself, hollowed: y = height·(1 − r/R)^hollow, from the eaves up to its crown)
    const rings = [around(r, y, ragged)];

    for (let k = 1; k <= 5; k++) {
        const t = k / 5;
        const radius = r * (1 - t) + top * t;

        rings.push(around(radius, y + height * (1 - (1 - t) ** hollow)));
    }

    solid.loft(rings, straw);

    // (The underside of its overhang, seen from below)
    solid.loft([around(r * 0.82, y + height * 0.2), rings[0]], straw, { out: [0, -1, 0] });

    // Its courses: each a band a little outside the cone, lower down
    for (let s = 1; s <= skirts; s++) {
        const t = s / (skirts + 1);
        const radius = r * (1 - t);
        const level = y + height * (1 - (1 - t) ** hollow);

        solid.loft([around(radius + m(0.12), level - m(0.22), ragged * 0.7), around(radius - m(0.02), level + m(0.1))], straw);
    }

    return y + height;
}

/**
 * An orb web: `radials` threads from its middle to its frame and `rings` spiralling round,
 * spanning `radius`, in the plane through `centre` facing `normal`, drawn as thin strips (seen
 * from both sides).
 */
export function web(solid, centre, radius, normal, { radials = 10, rings = 5, name = "silk", width = m(0.035), random = null } = {}) {
    const n = unit(normal);
    const u = unit(cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const v = cross(n, u);
    const silk = material(name);
    const point = (angle, r) => add3(centre, add3(times(u, Math.cos(angle) * r), times(v, Math.sin(angle) * r)));
    const strip = (a, b) => {
        const side = times(unit(cross(sub(b, a), n)), width / 2);
        const quad = [sub(a, side), sub(b, side), add3(b, side), add3(a, side)];

        solid.face(quad, silk, undefined, null);
        solid.face([...quad].reverse(), silk, undefined, null);
    };
    const reach = Array.from({ length: radials }, () => radius * (random ? random.range(0.8, 1.05) : 1));

    for (let k = 0; k < radials; k++) {
        strip(centre, point((k * Math.PI * 2) / radials, reach[k]));
    }

    for (let ring = 1; ring <= rings; ring++) {
        const t = ring / (rings + 0.5);

        for (let k = 0; k < radials; k++) {
            const [a, b] = [(k * Math.PI * 2) / radials, ((k + 1) * Math.PI * 2) / radials];

            // (Sagging in a little between the threads)
            strip(point(a, reach[k] * t), point(b, reach[(k + 1) % radials] * t));
        }
    }

    return solid;
}

/**
 * A thick wall along a line of corners (`points`: [x, z], closed round unless `closed` is false,
 * when it's a run with two ends): `thickness` through, from y0 up to y1, its outer face leaning
 * in by `lean` for each pixel up, its top flat or `rounded` (a ridge along it, as mud walls are
 * finished). A parapet round a roof, a compound's wall, a town's. Its inner face is the side
 * towards the middle of a closed wall, or the left of a run (as it goes).
 */
export function band(solid, points, y0, y1, thickness, name, { closed = true, lean = 0, rounded = false, top = name } = {}) {
    const stuff = material(name);
    const n = points.length;
    const [mx, mz] = middleOf(points);
    const height = y1 - y0;
    // (Each corner's way in: mitred, towards the middle of a closed wall, or to the left of a run)
    const inwardAt = (k) => {
        const normalOf = (a, b) => {
            const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
            const long = Math.hypot(dx, dz) || 1;

            return [-dz / long, dx / long];
        };
        const before = k > 0 || closed ? normalOf(points[(k - 1 + n) % n], points[k]) : null;
        const after = k < n - 1 || closed ? normalOf(points[k], points[(k + 1) % n]) : null;
        const [a, b] = [before ?? after, after ?? before];
        const along = 1 + a[0] * b[0] + a[1] * b[1];

        return along < 1e-6 ? b : [(a[0] + b[0]) / along, (a[1] + b[1]) / along];
    };
    let inner;

    if (closed) {
        inner = inset(points, thickness);
    } else {
        inner = points.map(([x, z], k) => {
            const [ix, iz] = inwardAt(k);

            return [x + ix * thickness, z + iz * thickness];
        });
    }

    const outerTop = closed ? inset(points, lean * height) : points.map(([x, z], k) => {
        const [ix, iz] = inwardAt(k);

        return [x + ix * lean * height, z + iz * lean * height];
    });
    const middleAt = (k) => [(outerTop[k][0] + inner[k][0]) / 2, (outerTop[k][1] + inner[k][1]) / 2];
    const ridge = rounded ? Math.min(thickness * 0.45, m(0.25)) : 0;
    const sides = closed ? n : n - 1;

    for (let k = 0; k < sides; k++) {
        const j = (k + 1) % n;
        const [a, b] = [points[k], points[j]];
        const way = closed ? [(a[0] + b[0]) / 2 - mx, 0, (a[1] + b[1]) / 2 - mz] : [-(b[1] - a[1]), 0, b[0] - a[0]];
        const outward = closed ? way : times(way, -1);
        const along = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const slope = Math.hypot(height, lean * height);

        // (Its outer face, leaning; its inner face, upright; its top)
        solid.facing([[a[0], y0, a[1]], [b[0], y0, b[1]], [outerTop[j][0], y1, outerTop[j][1]], [outerTop[k][0], y1, outerTop[k][1]]], outward, stuff, [[0, 0], [along, 0], [along, slope], [0, slope]]);
        solid.facing([[inner[k][0], y0, inner[k][1]], [inner[j][0], y0, inner[j][1]], [inner[j][0], y1, inner[j][1]], [inner[k][0], y1, inner[k][1]]], times(outward, -1), stuff);

        if (rounded) {
            const [ma, mb] = [middleAt(k), middleAt(j)];

            solid.facing([[outerTop[k][0], y1, outerTop[k][1]], [outerTop[j][0], y1, outerTop[j][1]], [mb[0], y1 + ridge, mb[1]], [ma[0], y1 + ridge, ma[1]]], add3(outward, [0, 2, 0]), material(top));
            solid.facing([[inner[k][0], y1, inner[k][1]], [inner[j][0], y1, inner[j][1]], [mb[0], y1 + ridge, mb[1]], [ma[0], y1 + ridge, ma[1]]], add3(times(outward, -1), [0, 2, 0]), material(top));
        } else {
            solid.facing([[outerTop[k][0], y1, outerTop[k][1]], [outerTop[j][0], y1, outerTop[j][1]], [inner[j][0], y1, inner[j][1]], [inner[k][0], y1, inner[k][1]]], [0, 1, 0], material(top));
        }
    }

    // (A run's two ends)
    if (!closed) {
        for (const k of [0, n - 1]) {
            const [o, i, t] = [points[k], inner[k], outerTop[k]];
            const along = k === 0 ? sub([points[0][0], 0, points[0][1]], [points[1][0], 0, points[1][1]]) : sub([points[n - 1][0], 0, points[n - 1][1]], [points[n - 2][0], 0, points[n - 2][1]]);
            const face = [[o[0], y0, o[1]], [i[0], y0, i[1]], [i[0], y1, i[1]], [t[0], y1, t[1]]];

            solid.facing(face, along, stuff);

            if (rounded) {
                const middle = middleAt(k);

                solid.facing([[t[0], y1, t[1]], [i[0], y1, i[1]], [middle[0], y1 + ridge, middle[1]]], along, material(top));
            }
        }
    }

    return { inner, outerTop };
}

/** A pinnacle: a little tapering cone or pyramid (`sides` 4) standing on (x, y, z). */
export function pinnacle(solid, x, y, z, width, height, name, { sides = 4, phase = Math.PI / 4, tip = 0 } = {}) {
    const r = width / 2 / (sides === 4 ? Math.SQRT1_2 : 1);

    solid.lathe(x, z, [[r, y], [tip, y + height]], material(name), { segments: sides, from: phase, to: phase + Math.PI * 2, smooth: false });

    return solid;
}

/**
 * The weathering painted on a people's building (Solid's tone): dirt splashed up the foot of its
 * walls (`dirt`, how dark), shade under its eaves (`eaves`: heights), its washes (`washes`: the
 * names of materials painted or plastered) a little their own colour (`tint`), roofs mottled,
 * and lights (the GLOWS) left their own colour.
 */
export function weathering({ seed, eaves = [], washes = [], tint = [1, 1, 1], dirt = 0.36, mottle = [] }) {
    const washed = new Set(washes);
    const mottled = new Set(mottle);
    const smooth = (a, b, x) => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));

        return t * t * (3 - 2 * t);
    };
    // (Where it turns up a wall, for walls to be cut there: Solid's tone bands. The shade under
    // the eaves stops just over them, so a gable's foot isn't shaded all the way up the gable)
    const bands = [m(1.2), ...eaves.flatMap((level) => [level - m(0.9), level + m(0.02)])];

    return Object.assign((point, normal, own) => {
        if (own.userData?.glow !== undefined) {
            return null;
        }

        // (Worked out for every corner of everything built: numbers, not lists taken apart)
        const x = point[0];
        const y = point[1];
        const z = point[2];
        const upward = normal[1];
        const washes = washed.has(own.name);
        let r = washes ? tint[0] : 1;
        let g = washes ? tint[1] : 1;
        let b = washes ? tint[2] : 1;
        let k = 1;

        if (Math.abs(upward) < 0.45) {
            k *= 1 - dirt + dirt * smooth(m(0.02), m(1.2), y);

            for (const level of eaves) {
                if (y <= level + m(0.01)) {
                    k *= 1 - 0.22 * smooth(level - m(0.9), level, y);
                }
            }

            k *= 0.93 + 0.07 * noise(x + z, y * 0.3, seed, m(1.5), 2);
        } else if (upward < -0.45) {
            k *= 0.55;
        } else if (mottled.has(own.name)) {
            const spots = noise(x, z, seed + 7, m(2), 2);

            r *= 1 - spots * 0.12;
            g *= 1 - spots * 0.06;
            b *= 1 - spots * 0.16;
            k *= 0.9 + 0.12 * noise(x, z, seed + 3, m(1.2), 2);
        }

        return [r * k, g * k, b * k];
    }, { bands });
}

/** A wall's face as Solid.wall takes it, for a side of a box x0..x1 by z0..z1 standing on y. */
export function facesOf([x0, x1, z0, z1], y) {
    return {
        front: { origin: [x0, y, z1], across: [1, 0, 0], out: [0, 0, 1], length: x1 - x0 },
        back: { origin: [x1, y, z0], across: [-1, 0, 0], out: [0, 0, -1], length: x1 - x0 },
        left: { origin: [x0, y, z0], across: [0, 0, 1], out: [-1, 0, 0], length: z1 - z0 },
        right: { origin: [x1, y, z1], across: [0, 0, -1], out: [1, 0, 0], length: z1 - z0 },
    };
}

/** A point on a wall's face: `u` along it, `v` up it, `w` out from it. */
export const onFace = ({ origin, across, out }, u, v, w = 0) => [origin[0] + across[0] * u + out[0] * w, origin[1] + v, origin[2] + across[2] * u + out[2] * w];

/**
 * A point on a battered wall's face as Solid.wall builds it (`lean` in for each pixel up, its ends
 * drawn in by `ends`): `u` along it (as at its foot), `v` up it, `w` out from it.
 */
export function wallPoint({ origin, across, out, length }, { lean = 0, ends = [lean, lean] } = {}) {
    return (u, v, w = 0) => {
        const along = lean ? ends[0] * v + (u * (length - (ends[0] + ends[1]) * v)) / length : u;
        const off = w - lean * v;

        return [origin[0] + across[0] * along + out[0] * off, origin[1] + v, origin[2] + across[2] * along + out[2] * off];
    };
}

/**
 * Walls round a plan (as Solid.walls) built in bands one over another (`bands`: [{ height,
 * name }] from the foot up: a painted dado under plain mud, a stone storey under a timber one),
 * each side's openings (`openings[k]`: heights from the foot of the lowest band) let through
 * every band they cross, their arches in the band their tops are in. Returns each side's face.
 */
export function bandedWalls(solid, points, y, bands, openings, options = {}) {
    let faces = null;
    let v = 0;

    for (const { height, name } of bands) {
        const [b0, b1] = [v, v + height];
        const clipped = {};

        for (const [k, list] of Object.entries(openings ?? {})) {
            clipped[k] = list.filter(({ v0, v1 }) => v1 > b0 + 1e-6 && v0 < b1 - 1e-6).map((opening) => ({
                ...opening,
                v0: Math.max(opening.v0, b0) - b0,
                v1: Math.min(opening.v1, b1) - b0,
                arch: opening.v1 <= b1 + 1e-6 ? opening.arch : null,
            }));
        }

        const lean = options.lean ?? 0;
        // (A battered wall's upper bands start where the lower leaned in to)
        const shrunk = lean ? inset(points, lean * b0) : points;
        const own = solid.walls(shrunk, y + b0, height, clipped, material(name), options);

        faces ??= own;
        v = b1;
    }

    return faces;
}

/** Where the leaf of a public building's front door stands: this far in from the front of its lot (metres). */
export const ENTRY = 1.8;
