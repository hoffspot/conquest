// The churches of the Six, built to a grammar (the terrain plan's M7i, §9 row 7: "Romanesque and
// Gothic church grammar"), as big as the place they stand in (core/setpieces/pieces.js
// churchOf): a village's parish church, Romanesque (thick walls, round arches, small round-
// headed windows high up, pilaster strips and a corbel table under the eaves, a round apse, a
// squat tower under a low stone pyramid); a town's church, a nave over aisles lit by a clerestory,
// buttressed, its tower Romanesque or Gothic (pointed windows, a spire of eight faces between four
// pinnacles), as its seed says; and a city's minster, Gothic, its west front between two towers
// and spires, a rose window over a gabled portal, its clerestory held up by flying buttresses on
// pinnacled piers, a many-sided apse and a slender spire on its ridge (the Six's sun on it). All of them on the same lot
// with the door where the temple inside is entered (core/insides.js ENTRANCES.church: its leaf
// 1.2 m in from the lot's front, its floor 0.6 m up), the rest round it as each grade has it.
//
// Five world pixels to a metre; built facing south (+z), the town turning it to face its street.

import { material } from "../engine/materials.js";
import { pinnacle } from "../peoples/kit.js";

const M = 5;
const m = (metres) => metres * M;

/**
 * Each grade's measures (metres): how wide its nave is, how high its walls stand over its floor
 * (and its aisles', where it has them, how wide those are and how high their walls), its tower's
 * (or towers') width and height, how high a Gothic spire rises over it (a Romanesque tower's
 * low pyramid is `cap` of its width), how far its apse reaches, and its roof's pitch (of its
 * nave's width).
 */
export const CHURCH = Object.freeze({
    parish: Object.freeze({ nave: 6, walls: 5.8, aisle: 0, tower: 4.4, top: 13, spire: 8, apse: 2.4, pitch: 0.62 }),
    church: Object.freeze({ nave: 5.2, walls: 8.6, aisle: 2.4, aisleWalls: 4.6, tower: 4.6, top: 16.5, spire: 9.5, apse: 2.4, pitch: 0.7 }),
    minster: Object.freeze({ nave: 4.8, walls: 11, aisle: 2.6, aisleWalls: 5, tower: 3.1, top: 19, spire: 10, apse: 2.4, pitch: 0.85 }),
});

/** How high a Romanesque tower's low pyramid of stone rises (of its tower's width). */
export const CAP = 0.95;

// The church's floor (metres over its foot: core/insides.js ENTRANCES.church's)
const FLOOR = 0.6;

/**
 * A church's body (its patron's sign, its door and the sun on its spire are landmarks.js's): into
 * `solid`, its lot `width` by `depth` (world pixels), its grade and build from the piece (`grade`
 * and `gothic`, as core gives them: pieces.js churchOf). Returns where its door
 * is ({ x, z: its leaf's face, floor }), where its patron's sign hangs ({ u: along the front, top,
 * z: the face it hangs from }),
 * and the top of its spire ([x, y, z]: the Six's sun stands on it).
 */
export function churchBody(solid, piece, width, depth) {
    const grade = CHURCH[piece.grade] ? piece.grade : "church";
    const gothic = grade === "minster" || (grade === "church" && (piece.gothic ?? (piece.seed ?? 0) % 2 === 0));
    const own = CHURCH[grade];
    const front = depth - m(1.2);
    const middle = width / 2;
    const arch = gothic ? "pointed" : "round";

    const apex = grade === "minster" ? minster(solid, own, width, front) : basilica(solid, own, width, front, { gothic, arch });

    portal(solid, middle, front, { gothic, wide: grade === "minster" ? 2.6 : 2.2 });

    // (The sign hangs from the tower's wall beside the portal, a minster's; or, a parish church's
    // or a town's, from the face of the buttress up the tower's corner there, which stands where
    // it would otherwise hang)
    const sign = grade === "minster" ? { u: middle + m(2.6), top: m(3.3), z: front } : { u: middle + m(own.tower / 2 - TOWER_BUTTRESS.inset), top: m(3.3), z: front + m(TOWER_BUTTRESS.depths[0]) };

    return { door: { x: middle, z: front, floor: FLOOR }, sign, apex };
}

// The buttresses up the front corners of a parish church's or a town's tower: how far in from
// the corner, and how far out each stage stands
const TOWER_BUTTRESS = Object.freeze({ inset: 0.4, depths: [0.6, 0.4] });

// A parish church or a town's: a west tower over the door, the nave behind it (over aisles in a
// town), an apse at the east end. Returns its spire's top
function basilica(solid, own, width, front, { gothic, arch }) {
    const middle = width / 2;
    const stone = material("stone");
    const warm = material("stone-warm");
    const floor = m(FLOOR);
    const [tx0, tx1, tz0] = [middle - m(own.tower / 2), middle + m(own.tower / 2), front - m(own.tower)];
    const [nx0, nx1] = [middle - m(own.nave / 2), middle + m(own.nave / 2)];
    const east = m(1) + m(own.apse);
    const naveLength = tz0 - east;
    const eaves = floor + m(own.walls);
    const aisled = own.aisle > 0;

    // The nave: its windows (in a town's, a clerestory over the aisles' roofs), pilaster strips
    // and a corbel table under its eaves in a Romanesque one
    const windowsOf = (v0, v1, count, wide) => Array.from({ length: count }, (_, k) => {
        const u = (naveLength * (k + 0.5)) / count;

        return { u0: u - m(wide / 2), u1: u + m(wide / 2), v0: m(v0), v1: m(v1), depth: m(0.45), back: material("leaded"), arch };
    });
    const high = aisled ? windowsOf(own.aisleWalls + 1.6, own.walls - 0.7, 3, gothic ? 0.7 : 0.6) : windowsOf(2.4, 4.2, 2, 0.6);

    socle(solid, nx0, east, nx1, tz0);
    solid.walls([[nx0, east], [nx1, east], [nx1, tz0], [nx0, tz0]], floor, m(own.walls), { 1: high, 3: high }, stone);
    solid.roof(nx0 - m(0.3), east - m(0.3), nx1 + m(0.3), tz0, eaves, m(own.nave) * own.pitch, { ridge: "z", material: material("slate"), gable: stone });

    if (!gothic) {
        for (const x of [nx0, nx1]) {
            const out = x === nx0 ? -1 : 1;

            corbels(solid, x, east + m(0.4), tz0 - m(0.2), eaves - m(0.35), out);

            if (!aisled) {
                for (const z of [east, east + naveLength / 2, tz0 - m(0.25)]) {
                    solid.box(Math.min(x, x + out * m(0.14)), floor, z - m(0.25), Math.max(x, x + out * m(0.14)), eaves - m(0.4), z + m(0.25), warm);
                }
            }
        }
    }

    // A town's aisles: lower, either side, their roofs leaning on the nave, buttressed between
    // their windows
    if (aisled) {
        for (const side of [-1, 1]) {
            const [ax0, ax1] = side < 0 ? [nx0 - m(own.aisle), nx0] : [nx1, nx1 + m(own.aisle)];
            const outer = side < 0 ? ax0 : ax1;
            const low = windowsOf(1.4, own.aisleWalls - 0.7, 3, gothic ? 0.8 : 0.6);

            socle(solid, ax0, east + m(0.4), ax1, tz0);
            solid.walls([[ax0, east + m(0.4)], [ax1, east + m(0.4)], [ax1, tz0], [ax0, tz0]], floor, m(own.aisleWalls), side < 0 ? { 3: low } : { 1: low }, stone);
            leanTo(solid, outer, side < 0 ? nx0 : nx1, east + m(0.4), tz0, floor + m(own.aisleWalls), floor + m(own.aisleWalls + 2), material("slate"), stone);

            for (let k = 0; k <= 3; k++) {
                const z = east + m(0.4) + ((naveLength - m(0.4)) * k) / 3;

                buttress(solid, [outer, z], [side, 0], { width: 0.7, depths: gothic ? [0.9, 0.6] : [0.5], heights: gothic ? [2.4, own.aisleWalls + 0.3] : [own.aisleWalls], base: 0, cap: gothic });
            }
        }
    } else {
        // (A parish church's: a buttress at each corner of its nave, square to its walls)
        for (const [x, z, way] of [[nx0, east, [-1, 0]], [nx1, east, [1, 0]], [nx0, tz0 - m(0.4), [-1, 0]], [nx1, tz0 - m(0.4), [1, 0]]]) {
            buttress(solid, [x, z], way, { width: 0.8, depths: [0.7, 0.45], heights: [2.2, own.walls - 1.2], base: 0, cap: false });
        }
    }

    // The apse at the east end
    apse(solid, middle, east, own.apse, floor, m(gothic ? own.walls - 1.2 : own.walls - 1.4), { gothic, arch, stone });

    // The tower over the door: string courses between its stages, its bells' openings, and its top
    const top = m(own.top);

    socle(solid, tx0, tz0, tx1, front);
    solid.walls([[tx0, tz0], [tx1, tz0], [tx1, front], [tx0, front]], floor, top - floor, [0, 1, 2, 3].reduce((all, side) => ({ ...all, [side]: belfry(m(own.tower), top - floor, arch) }), {}), stone);

    for (const y of [m(own.walls * 0.55) + floor, top - m(4.2)]) {
        solid.box(tx0 - m(0.12), y, tz0 - m(0.12), tx1 + m(0.12), y + m(0.28), front + m(0.12), warm);
    }

    solid.box(tx0 - m(0.2), top - m(0.4), tz0 - m(0.2), tx1 + m(0.2), top, front + m(0.2), warm);

    // (Square buttresses up the tower's west corners)
    for (const [x, z, way] of [[tx0, front - m(0.4), [-1, 0]], [tx1, front - m(0.4), [1, 0]], [tx0 + m(TOWER_BUTTRESS.inset), front, [0, 1]], [tx1 - m(TOWER_BUTTRESS.inset), front, [0, 1]]]) {
        buttress(solid, [x, z], way, { width: 0.7, depths: TOWER_BUTTRESS.depths, heights: [own.top * 0.35, own.top * 0.62], base: 0, cap: gothic });
    }

    if (gothic) {
        return spire(solid, middle, (tz0 + front) / 2, own.tower, top, own.spire);
    }

    // (A low stone pyramid: Romanesque)
    const cap = m(own.tower * CAP);

    solid.pyramid(tx0 - m(0.25), tz0 - m(0.25), tx1 + m(0.25), front + m(0.25), top, cap, material("slate-grey"));

    return [middle, top + cap, (tz0 + front) / 2];
}

// A city's minster: a west front between two towers and their spires, the nave running up to it
// between them, its aisles behind them, flying buttresses over the aisles to the clerestory, a
// many-sided apse, a slender spire on the ridge. Returns that spire's top
function minster(solid, own, width, front) {
    const middle = width / 2;
    const stone = material("stone");
    const warm = material("stone-warm");
    const floor = m(FLOOR);
    const [nx0, nx1] = [middle - m(own.nave / 2), middle + m(own.nave / 2)];
    const east = m(1) + m(own.apse);
    const towers = front - m(own.tower);
    const eaves = floor + m(own.walls);
    const naveLength = front - east;
    const bays = 3;
    const aisleLength = towers - east - m(0.4);
    const bayAt = (k) => east + m(0.4) + (aisleLength * k) / bays;

    // The nave, running to the west front: its clerestory's tall pointed windows over the aisles
    const clerestory = Array.from({ length: bays }, (_, k) => {
        const u = bayAt(k + 0.5) - east;

        return { u0: u - m(0.45), u1: u + m(0.45), v0: m(own.aisleWalls + 2.4), v1: m(own.walls - 0.6), depth: m(0.45), back: material("leaded"), arch: "pointed" };
    });
    // (Its west front: a rose window over the door)
    const rose = { u0: m(own.nave / 2 - 1.35), u1: m(own.nave / 2 + 1.35), v0: m(6.2), v1: m(8.9), depth: m(0.5), back: material("leaded"), arch: "moon" };

    socle(solid, nx0, east, nx1, front);
    solid.walls([[nx0, east], [nx1, east], [nx1, front], [nx0, front]], floor, m(own.walls), { 1: clerestory, 2: [rose], 3: clerestory }, stone);
    solid.roof(nx0 - m(0.3), east - m(0.3), nx1 + m(0.3), front + m(0.1), eaves, m(own.nave) * own.pitch, { ridge: "z", material: material("slate"), gable: stone });
    rosette(solid, middle, floor + m(7.55), front + m(0.02), m(1.35));

    // The aisles behind the towers, their roofs leaning on the nave; a flying buttress over each
    // bay's end to the clerestory, from a pier crowned with a pinnacle
    for (const side of [-1, 1]) {
        const [ax0, ax1] = side < 0 ? [nx0 - m(own.aisle), nx0] : [nx1, nx1 + m(own.aisle)];
        const outer = side < 0 ? ax0 : ax1;
        const windows = Array.from({ length: bays }, (_, k) => {
            const u = bayAt(k + 0.5) - east - m(0.4);

            return { u0: u - m(0.5), u1: u + m(0.5), v0: m(1.2), v1: m(own.aisleWalls - 0.5), depth: m(0.45), back: material("leaded"), arch: "pointed" };
        });

        socle(solid, ax0, east + m(0.4), ax1, towers);
        solid.walls([[ax0, east + m(0.4)], [ax1, east + m(0.4)], [ax1, towers], [ax0, towers]], floor, m(own.aisleWalls), side < 0 ? { 3: windows } : { 1: windows }, stone);
        leanTo(solid, outer, side < 0 ? nx0 : nx1, east + m(0.4), towers, floor + m(own.aisleWalls), floor + m(own.aisleWalls + 2.4), material("slate"), stone);

        for (let k = 0; k <= bays; k++) {
            const z = bayAt(k);
            const pier = outer + side * m(0.45);
            const pierTop = floor + m(own.aisleWalls + 3.2);

            buttress(solid, [outer, z], [side, 0], { width: 0.8, depths: [0.9, 0.7], heights: [2.6, own.aisleWalls + 3.2], base: 0, cap: false });
            pinnacle(solid, pier, pierTop, z, m(0.7), m(2.2), "stone-warm");

            // (The flyer: a strut leaning from the pier to the clerestory wall, under its eaves)
            if (k > 0 && k < bays) {
                solid.beam([pier, pierTop - m(0.4), z], [side < 0 ? nx0 : nx1, eaves - m(1.2), z], m(0.45), m(0.55), warm);
            }
        }
    }

    // The towers: their stages, belfries and spires, the nave's front between them
    const [westX, eastX] = [[nx0 - m(own.tower), nx0], [nx1, nx1 + m(own.tower)]];
    for (const [x0, x1] of [westX, eastX]) {
        const top = m(own.top);

        socle(solid, x0, towers, x1, front);
        solid.walls([[x0, towers], [x1, towers], [x1, front], [x0, front]], floor, top - floor, [0, 1, 2, 3].reduce((all, side) => ({ ...all, [side]: belfry(m(own.tower), top - floor, "pointed", 1) }), {}), stone);

        for (const y of [eaves - m(4), top - m(4.4)]) {
            solid.box(x0 - m(0.12), y, towers - m(0.12), x1 + m(0.12), y + m(0.28), front + m(0.12), warm);
        }

        solid.box(x0 - m(0.2), top - m(0.4), towers - m(0.2), x1 + m(0.2), top, front + m(0.2), warm);

        const outside = x0 < nx0 ? [-1, 0] : [1, 0];

        for (const [x, z, way, depths] of [[x0 < nx0 ? x0 : x1, front - m(0.35), outside, [0.45, 0.3]], [x0 + m(own.tower / 2), front, [0, 1], [0.8, 0.5]]]) {
            buttress(solid, [x, z], way, { width: 0.7, depths, heights: [own.top * 0.4, own.top * 0.7], base: 0, cap: true });
        }

        spire(solid, (x0 + x1) / 2, (towers + front) / 2, own.tower, top, own.spire);
    }

    // The apse: many-sided, pinnacled buttresses at its corners
    apse(solid, middle, east, own.apse, floor, m(own.walls - 1.6), { gothic: true, arch: "pointed", stone, tall: true });

    // A slender spire on the ridge over the crossing, the Six's sun on it
    const ridge = eaves + m(own.nave) * own.pitch;
    const fz = east + naveLength * 0.3;

    solid.box(middle - m(0.6), ridge - m(1.2), fz - m(0.6), middle + m(0.6), ridge + m(1.2), fz + m(0.6), material("slate-grey"));
    solid.lathe(middle, fz, [[m(0.75), ridge + m(1.2)], [0.4, ridge + m(7.5)]], material("slate-grey"), { segments: 8, from: Math.PI / 8, to: Math.PI / 8 + Math.PI * 2, smooth: false });

    return [middle, ridge + m(7.5), fz];
}

// A socle of dark stone under walls standing on the church's floor (x0, z0 to x1, z1): from the
// ground up to the floor, a little proud of them
function socle(solid, x0, z0, x1, z1) {
    solid.box(x0 - m(0.15), 0, z0 - m(0.15), x1 + m(0.15), m(FLOOR), z1 + m(0.15), material("stone-dark"));
}

// The doorway: a portal of warm stone standing out of the front round the door (the door's leaf
// on the front's face, as the temple inside is entered), its arch round or pointed, a Gothic one
// under a steep gable; two steps up to it
function portal(solid, middle, front, { gothic, wide }) {
    const warm = material("stone-warm");
    const [half, deep, height] = [m(wide / 2), m(0.7), m(gothic ? 4.4 : 4)];
    const face = { origin: [middle - half, 0, front + deep], across: [1, 0, 0], out: [0, 0, 1] };
    const opening = { u0: half - m(0.9), u1: half + m(0.9), v0: m(FLOOR), v1: m(FLOOR + (gothic ? 3.3 : 3.1)), depth: deep, back: null, arch: gothic ? "pointed" : "round" };

    solid.wall(face, half * 2, height, [opening], warm);

    // (Its sides and top, back to the front)
    solid.box(middle - half, 0, front, middle - half + m(0.01), height, front + deep, warm);
    solid.box(middle + half - m(0.01), 0, front, middle + half, height, front + deep, warm);
    solid.box(middle - half, height - m(0.01), front, middle + half, height, front + deep, warm);
    solid.box(middle - half, 0, front, middle + half, m(FLOOR), front + deep, warm);

    if (gothic) {
        // (A wimperg: a steep gable over the arch, standing proud of the portal)
        const tip = height + m(wide * 0.75);

        solid.facing([[middle - half - m(0.1), height, front + deep + m(0.05)], [middle + half + m(0.1), height, front + deep + m(0.05)], [middle, tip, front + deep + m(0.05)]], [0, 0, 1], warm);
        solid.facing([[middle - half - m(0.1), height, front + deep + m(0.05)], [middle, tip, front + deep + m(0.05)], [middle, tip, front], [middle - half - m(0.1), height, front]], [-1, 0.6, 0], material("slate-grey"));
        solid.facing([[middle + half + m(0.1), height, front + deep + m(0.05)], [middle + half + m(0.1), height, front], [middle, tip, front], [middle, tip, front + deep + m(0.05)]], [1, 0.6, 0], material("slate-grey"));

        for (const x of [middle - half, middle + half]) {
            pinnacle(solid, x, height, front + deep / 2, m(0.45), m(1.4), "stone-warm");
        }
    }

    // (Two steps up to it)
    solid.box(middle - half - m(0.2), 0, front + deep, middle + half + m(0.2), m(FLOOR / 2), front + deep + m(0.5), warm);
}

// A tower's bells' openings, each side alike: a pair of tall arches (one for a minster's narrower
// towers) high up its `length` wide side, `height` tall, open into the dark of the belfry
function belfry(length, height, arch, count = 2) {
    const wide = count === 2 ? m(0.55) : m(0.8);
    const gap = m(0.35);
    const total = count * wide + (count - 1) * gap;

    return Array.from({ length: count }, (_, k) => {
        const u0 = (length - total) / 2 + k * (wide + gap);

        return { u0, u1: u0 + wide, v0: height - m(3.6), v1: height - m(1.6), depth: m(0.5), back: material("shadow"), arch };
    });
}

// A roof leaning on a wall: from its outer eaves (`outer`, at `low`) up to where it meets the
// higher wall (`inner`, at `high`), from z0 to z1; its ends' triangles in `wall`
function leanTo(solid, outer, inner, z0, z1, low, high, roof, wall) {
    const over = (outer < inner ? -1 : 1) * m(0.3);

    solid.facing([[outer + over, low - m(0.08), z0], [outer + over, low - m(0.08), z1], [inner, high, z1], [inner, high, z0]], [outer < inner ? -0.5 : 0.5, 1, 0], roof);

    for (const z of [z0, z1]) {
        solid.facing([[outer, low, z], [inner, low, z], [inner, high, z]], [0, 0, z === z0 ? -1 : 1], wall);
    }
}

// A buttress against a wall at [x, z] standing out `way` ([dx, dz]): stages `depths` out (metres,
// each less than the last) to `heights` (metres, each stage's top, from `base` up), `width`
// across; a little gabled cap on its top (`cap`)
function buttress(solid, [x, z], [dx, dz], { width, depths, heights, base, cap }) {
    const warm = material("stone-warm");
    const [sx, sz] = [-dz * m(width / 2), dx * m(width / 2)];
    let y = base;

    depths.forEach((depth, k) => {
        const out = m(depth);
        const outline = [[x - sx, z - sz], [x + dx * out - sx, z + dz * out - sz], [x + dx * out + sx, z + dz * out + sz], [x + sx, z + sz]];
        const top = m(heights[k]) + (k === 0 ? 0 : 0);

        solid.extrude(outline, y, Math.max(y + m(0.2), top), warm);
        y = top;
    });

    if (cap) {
        const out = m(depths.at(-1));

        pinnacle(solid, x + (dx * out) / 2, y, z + (dz * out) / 2, m(width * 0.8), m(1.1), "stone-warm");
    }
}

// The apse: half a circle (Romanesque: round, small round windows) or half a polygon (Gothic: tall
// pointed windows, a pinnacled buttress at each corner) off the nave's east end at (x, z), `radius`
// metres, its walls `height` up from `floor`, under a half cone of a roof
function apse(solid, x, z, radius, floor, height, { gothic, arch, stone, tall = false }) {
    const sides = gothic ? 5 : 8;
    const r = m(radius);
    const points = Array.from({ length: sides + 1 }, (_, k) => {
        const angle = Math.PI + (Math.PI * k) / sides;

        return [x + Math.cos(angle) * r, z + Math.sin(angle) * r];
    });
    const side = (2 * r * Math.sin(Math.PI / sides / 2)) / 1;
    const windows = {};

    for (let k = 1; k < sides - 1; k += gothic ? 1 : 3) {
        const wide = gothic ? m(tall ? 0.7 : 0.6) : m(0.5);

        windows[k] = [{ u0: side / 2 - wide / 2, u1: side / 2 + wide / 2, v0: gothic ? m(1.6) : m(2.2), v1: height - m(gothic ? 0.8 : 1.2), depth: m(0.4), back: material("leaded"), arch }];
    }

    solid.extrude(points.map(([px, pz]) => [x + ((px - x) * (r + m(0.15))) / r, z + ((pz - z) * (r + m(0.15))) / r]), 0, floor, material("stone-dark"));
    solid.walls(points, floor, height, windows, stone);
    solid.lathe(x, z, [[r + m(0.3), floor + height], [0, floor + height + r * (gothic ? 1.1 : 0.85)]], material("slate"), { segments: sides, from: Math.PI, to: Math.PI * 2, smooth: !gothic });

    if (gothic) {
        for (let k = 1; k < sides; k++) {
            const angle = Math.PI + (Math.PI * k) / sides;
            const [dx, dz] = [Math.cos(angle), Math.sin(angle)];

            buttress(solid, [x + dx * r, z + dz * r], [dx, dz], { width: 0.6, depths: [0.9, 0.6], heights: [2.4, (height - floor) / M + 0.6], base: 0, cap: true });
        }
    }
}

// A spire of eight faces over a tower `width` metres square at (x, z), from its top `top` up
// `height` metres; a pinnacle at each of the tower's corners round its foot. Returns its tip
function spire(solid, x, z, width, top, height) {
    const r = m(width / 2) * 0.86;
    const tip = top + m(height);

    solid.lathe(x, z, [[r, top], [0.6, tip]], material("slate-grey"), { segments: 8, from: Math.PI / 8, to: Math.PI / 8 + Math.PI * 2, smooth: false });

    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pinnacle(solid, x + dx * (m(width / 2) - m(0.3)), top, z + dz * (m(width / 2) - m(0.3)), m(0.55), m(2), "stone-warm");
    }

    return [x, tip, z];
}

// A rose window's tracery: spokes of stone from a hub to its rim, over its glass
function rosette(solid, x, y, z, radius) {
    const warm = material("stone-warm");

    for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;

        solid.beam([x, y, z - m(0.45)], [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z - m(0.45)], m(0.1), m(0.1), warm);
    }

    solid.lathe(x, z - m(0.4), [[m(0.22), y - m(0.22)], [m(0.22), y + m(0.22)]], warm, { segments: 8 });
}

// A Romanesque corbel table: a row of small blocks under the eaves along a wall at x (standing out
// `out`), from z0 to z1, at `y`
function corbels(solid, x, z0, z1, y, out) {
    const warm = material("stone-warm");

    for (let z = z0; z < z1; z += m(0.7)) {
        solid.box(Math.min(x, x + out * m(0.22)), y, z, Math.max(x, x + out * m(0.22)), y + m(0.25), z + m(0.3), warm);
    }
}
