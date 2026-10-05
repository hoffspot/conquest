// What the props and the yards' fences stand on, measured from how they're drawn (the art kits,
// each people's own): a prop's outline in plan, of all of it lower than a body's height, in its
// own metres (across, `u`, and forward, `v`, from its middle, as the layout turns it: core/
// setpieces/town.js frame); and how far in from a yard's edge its fences reach, and how far past
// the ends of their runs. scripts/build-footprints.js keeps them in core/setpieces/footprints.js,
// where the navigation mesh walks round them (core/navigation/tiles.js), and test/footprints.test.js
// checks they're still the art's.

import * as THREE from "three";
import { PROPS } from "../../core/setpieces/pieces.js";
import { builderOf } from "../town3d.js";
import { yard } from "./kits/yards.js";

/** The peoples whose props and yards are measured: the humans', anyone's. */
export const PEOPLES = Object.freeze(["human", "cat", "orc", "lizard", "elf", "darkElf"]);

/** What walking past something meets (metres): all of it lower than this, a body's height (eaves
 * as low as 1.8 m, a market stall's, walked under). */
export const HEAD = 1.75;

// The art's world pixels: five to a metre
const PIXELS = 5;

// How many of each are built, each where it stands making its own (its random numbers are from
// its place), so the outline's all of theirs
const SAMPLES = 16;

// How near two parts of a prop are taken to be one thing (metres: with a point in the same square
// this wide); no one gets between them
const TOUCHING = 0.1;

/**
 * Every prop's outlines, for every people (`PEOPLES`): { [people]: { [name]: [[[u, v], ...],
 * ...] } }, one for each thing it's made of that stands apart from the rest (a well, and the
 * reeds and jars round it), each a convex polygon (u across, v forward: as the layout's x and y,
 * facing south), in metres from the prop's middle, to the centimetre: where it stands in any of
 * them, as each is built a little differently (its random numbers are from its place).
 */
export async function propOutlines() {
    const outlines = {};

    for (const people of PEOPLES) {
        outlines[people] = {};

        for (const [name, [w, h]] of Object.entries(PROPS)) {
            const parts = [];

            for (let k = 0; k < SAMPLES; k++) {
                const piece = { kind: "prop", key: `prop-${name}`, name, w, h, x: 10.5 + k * 7.25, y: 20.25 + k * 3.5, facing: 0, ...(people === "human" ? {} : { people }) };
                const built = await builderOf(piece)(piece);

                for (const part of below(built, HEAD * PIXELS)) {
                    parts.push(part.map(([x, , z]) => [x / PIXELS - w * 2, z / PIXELS - h * 2]));
                }
            }

            outlines[people][name] = apart(parts).map(outline);
        }
    }

    return outlines;
}

/**
 * How each people's yard fences stand (metres): { [people]: { from, to (how far in from the
 * yard's edge they reach, from and to: from below 0 where they stand proud of it), past (how far
 * past each end of a run) } }, of every kind of fence a people's yards have (kits/yards.js: one
 * picked a yard at a time, so every yard of several is measured).
 */
export function fenceBands() {
    const bands = {};
    const W = 8;

    for (const people of PEOPLES) {
        let [from, to, past] = [Infinity, -Infinity, 0];

        for (let k = 0; k < SAMPLES; k++) {
            // (A yard 8 m square fenced along its back, nothing else in it)
            const piece = { kind: "yard", x: 10.5 + k * 7.25, y: 20.25 + k * 3.5, w: W / 4, h: W / 4, facing: 0, people, fence: [[], [[0, W]], []], gate: null, squares: [], bed: null, line: false };

            // (Only what stands up off the ground, under a body's height)
            for (const [x, y, z] of below(yard(piece), HEAD * PIXELS).flat()) {
                if (y > 0.02 * PIXELS) {
                    from = Math.min(from, z / PIXELS);
                    to = Math.max(to, z / PIXELS);
                    past = Math.max(past, -x / PIXELS, x / PIXELS - W);
                }
            }
        }

        bands[people] = { from: floorTo(from), to: ceilTo(to), past: ceilTo(past) };
    }

    return bands;
}

// Every triangle of what's built (a Three.js object, in world pixels) that's lower than `top`, as
// its points that are: its corners below it, and where its edges cross it
function below(object, top) {
    const triangles = [];
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

    object.updateMatrixWorld(true);
    object.traverse((mesh) => {
        const position = mesh.isMesh && mesh.geometry?.attributes.position;

        if (!position) {
            return;
        }

        const index = mesh.geometry.index;
        const count = index ? index.count : position.count;
        const at = (i, v) => v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);

        for (let i = 0; i + 2 < count; i += 3) {
            const corners = [at(i, a), at(i + 1, b), at(i + 2, c)];
            const points = [];

            for (let k = 0; k < 3; k++) {
                const [p, q] = [corners[k], corners[(k + 1) % 3]];

                if (p.y <= top) {
                    points.push([p.x, p.y, p.z]);
                }

                if ((p.y < top) !== (q.y < top)) {
                    const t = (top - p.y) / (q.y - p.y);

                    points.push([p.x + (q.x - p.x) * t, top, p.z + (q.z - p.z) * t]);
                }
            }

            if (points.length) {
                triangles.push(points);
            }
        }
    });

    return triangles;
}

// Parts (each points, [[u, v], ...]) gathered into the things they make: those with a point in the
// same TOUCHING square as another's (as a part's faces share their corners), every point of a part
// with it
function apart(parts) {
    const owner = parts.map((_, k) => k);
    const root = (k) => (owner[k] === k ? k : (owner[k] = root(owner[k])));
    const cells = new Map();

    parts.forEach((points, k) => {
        for (const [u, v] of points) {
            const cell = `${Math.floor(u / TOUCHING)} ${Math.floor(v / TOUCHING)}`;
            const other = cells.get(cell);

            if (other !== undefined) {
                owner[root(other)] = root(k);
            }

            cells.set(cell, k);
        }
    });

    const things = new Map();

    parts.forEach((points, k) => {
        const key = root(k);

        things.set(key, [...(things.get(key) ?? []), ...points]);
    });

    // (Biggest first, the same order every time)
    return [...things.values()].sort((p, q) => q.length - p.length || p[0][0] - q[0][0] || p[0][1] - q[0][1]);
}

// The convex hull of points ([u, v]), its corners to the centimetre (rounded outwards, from its
// middle), those barely a corner dropped
function outline(points) {
    const sorted = points.toSorted((p, q) => p[0] - q[0] || p[1] - q[1]);
    const turn = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const half = (list) => {
        const hull = [];

        for (const point of list) {
            while (hull.length >= 2 && turn(hull.at(-2), hull.at(-1), point) <= 0) {
                hull.pop();
            }

            hull.push(point);
        }

        return hull.slice(0, -1);
    };
    const hull = [...half(sorted), ...half(sorted.toReversed())];
    const [mu, mv] = [hull.reduce((sum, [u]) => sum + u, 0) / hull.length, hull.reduce((sum, [, v]) => sum + v, 0) / hull.length];
    const rounded = hull.map(([u, v]) => [u >= mu ? ceilTo(u) : floorTo(u), v >= mv ? ceilTo(v) : floorTo(v)]);
    const kept = [];

    // (A corner less than a centimetre off the line between its neighbours isn't one)
    for (let k = 0; k < rounded.length; k++) {
        const [p, q, r] = [kept.at(-1) ?? rounded.at(-1), rounded[k], rounded[(k + 1) % rounded.length]];
        const across = Math.abs(turn(p, q, r)) / (Math.hypot(r[0] - p[0], r[1] - p[1]) || 1);

        if (across >= 0.01 && !(q[0] === p[0] && q[1] === p[1])) {
            kept.push(q);
        }
    }

    return kept;
}

const ceilTo = (metres) => Math.ceil(metres * 100 - 1e-6) / 100;
const floorTo = (metres) => Math.floor(metres * 100 + 1e-6) / 100;

/**
 * core/setpieces/outlines.js as it should be: every prop's outline and every people's fences,
 * measured now (propOutlines, fenceBands).
 */
export async function outlinesSource() {
    const outlines = await propOutlines();
    const bands = fenceBands();
    const lines = [
        "// What the props and the yards' fences stand on, as they're drawn: measured from the art kits",
        "// (world/art/footprints.js), by `npm run build:footprints`. Don't change it by hand; make it again",
        "// when a prop's or a fence's looks change (test/footprints.test.js fails until it is).",
        "",
        "/**",
        " * Each people's props' outlines in plan, of all of them lower than a body's height (" + `${HEAD} m` + "), one for",
        " * each thing a prop's made of that stands apart from the rest: convex polygons [[u, v], ...] in",
        " * metres from its middle (u across, v forward: as the layout turns it, setpieces/town.js frame),",
        " * by people and then by prop.",
        " */",
        "export const PROP_OUTLINES = Object.freeze({",
        ...PEOPLES.flatMap((people) => [
            `    ${people}: Object.freeze({`,
            ...Object.entries(outlines[people]).flatMap(([name, things]) => [`        ${name}: [`, ...things.map((points) => `            [${points.map(([u, v]) => `[${u}, ${v}]`).join(", ")}],`), "        ],"]),
            "    }),",
        ]),
        "});",
        "",
        "/**",
        " * How far in from a yard's edge each people's fences reach (metres: `from`, below 0 where they",
        " * stand proud of it, `to`), and how far past each end of a run (`past`), of every kind they build.",
        " */",
        "export const FENCE_BANDS = Object.freeze({",
        ...PEOPLES.map((people) => `    ${people}: Object.freeze({ ${Object.entries(bands[people]).map(([key, value]) => `${key}: ${value}`).join(", ")} }),`),
        "});",
        "",
    ];

    return lines.join("\n");
}
