// The peoples' castles as they stand (the terrain plan's M7.5b-3): what of each is solid, so its
// courtyard can be walked through its gate, and where its keep's door is. Each is laid out as its
// people's kit builds it (world/art/peoples: elf.js, orc-places.js, cat-places.js `castle`), on a
// lot of metres facing south (u east from its west edge, v south from its north edge), the same
// for the same lot: only their heights are left to chance there, and nothing here depends on them.
//
// Pure data, no DOM; exact maths (sites.js turns the lot into the world's squares).

import { atan2, cos, hypot, PI, sin } from "../exact.js";

/**
 * How far round what's solid the squares are kept clear of (metres: a square whose middle's
 * nearer than this to a wall is the wall's).
 */
export const CASTLE_MARGIN = 0.4;

// The elves': seven towers round the great tree, curtain walls between them, the gate between
// the last and the first, under its ogee arch between two branching pillars; their keep the
// tower at the back
function elf([W, D]) {
    const [cx, cz] = [W / 2, D / 2];
    const R = Math.min(W, D) / 2 - 4;
    const count = 7;
    const towers = Array.from({ length: count }, (_, k) => {
        const a = PI / 2 + (k * PI * 2) / count + PI / count;

        return [cx + cos(a) * R, cz + sin(a) * R];
    });
    const [gx, gz] = [(towers[count - 1][0] + towers[0][0]) / 2, (towers[count - 1][1] + towers[0][1]) / 2];
    // (The tower at the back, due north, their keep: its door in its south face, a side of its
    // twelve, facing the great tree and the gate)
    const [kx, kz] = towers[(count - 1) / 2];

    return {
        solid: [
            ...towers.map(([x, z]) => ({ disc: [x, z, 2.1] })),
            ...towers.slice(0, -1).map((at, k) => ({ wall: [at, towers[k + 1], 0.8] })),
            // (Either side of the gate, its wall up to its pillars)
            { wall: [towers[0], [gx - 3.6, gz], 0.8] },
            { wall: [[gx + 3.6, gz], towers[count - 1], 0.8] },
            { disc: [gx - 3, gz, 0.5] },
            { disc: [gx + 3, gz, 0.5] },
            // (The great tree, its roots round it)
            { disc: [cx, cz - 2, 2.6] },
        ],
        // (Within its walls, out to the lines between its towers; and its gateway between its
        // pillars)
        court: [{ polygon: towers }, { rect: [gx - 3.6, gz - 1.2, gx + 3.6, gz + 1.2] }],
        ground: "courtyard",
        gate: [gx, gz],
        entry: { x: kx, y: kz + 2.1 * cos(PI / 12), width: 1.2, height: 2.6, inside: "keep" },
    };
}

// The orcs': a bank with a palisade along its top round the yard, its gap to the south between
// two bastions of basalt; the motte with the broch on it, the longhouse (their keep), a round hut,
// a banner and a brazier
function orc([W, D]) {
    const [cx, cz] = [W / 2, D / 2];
    const R = Math.min(W, D) / 2 - 3.5;
    const gz = cz + R;
    const bastions = [-1, 1].map((side) => ({ rect: [cx + side * 3.8 - 1.8, gz - 2.5, cx + side * 3.8 + 1.8, gz + 2] }));
    // (The longhouse, the clan's hall, their keep: its door where its kit puts it, in the middle
    // of the middle side of its south wall, a lens of sides 2.2 m long, 7 m across its middle
    // and 0.72 of that at its ends, on a plinth 0.7 m high, a porch before it on two posts:
    // world/art/peoples/orc.js longhouse)
    const [lx0, lx1, lz] = [cx - 2, cx + R * 0.65, cz + 2.5];
    const sides = Math.max(6, Math.round((lx1 - lx0) / 2.2));
    const across = (t) => [lx0 + t * (lx1 - lx0), lz + (7 * 0.72 + 7 * 0.28 * sin(PI * t)) / 2];
    const [a, b] = [across(Math.floor(sides / 2) / sides), across((Math.floor(sides / 2) + 1) / sides)];
    const along = [(b[0] - a[0]) / hypot(b[0] - a[0], b[1] - a[1]), (b[1] - a[1]) / hypot(b[0] - a[0], b[1] - a[1])];
    const door = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const posts = [-1, 1].map((side) => ({ disc: [door[0] + along[0] * side * 1.4 - along[1] * 2.4, door[1] + along[1] * side * 1.4 + along[0] * 2.4, 0.2] }));

    return {
        solid: [
            // (The bank, from the foot of its inner slope to its outer, but for the gate's gap)
            { ring: [cx, cz, R - 2.5, R + 3, PI / 2 + 0.16, PI / 2 - 0.16 + PI * 2] },
            ...bastions,
            { disc: [cx - R * 0.35, cz - R * 0.3, 9] },
            { rect: [lx0, cz - 1, lx1, cz + 6] },
            ...posts,
            { disc: [cx + R * 0.45, cz - R * 0.45, 3.2] },
            { disc: [cx - 4, cz + R * 0.55, 0.3] },
            { disc: [cx - 1.5, cz + R * 0.5, 0.5] },
        ],
        // (Within its bank; and its gateway between its bastions)
        court: [{ disc: [cx, cz, R - 2.5] }, { rect: [cx - 2, gz - 2.5, cx + 2, gz + 2] }],
        ground: "road",
        gate: [cx, gz],
        entry: { x: door[0], y: door[1], width: 1.6, height: 2.6, floor: 0.7, inside: "keep" },
    };
}

// The cat folk's: a kasbah, its curtain walls round a square court, a tower at each corner, its
// gate in a tower of its own off the middle of the south wall (a way through it), four planted
// beds round a fountain, the lord's tower house at the back, its door into the great hall
function cat([W, D]) {
    const [x0, x1, z0, z1] = [3, W - 3, 3, D - 3];
    const gateAt = (x0 + x1) / 2 + 4;
    const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2 + 3];
    const quarter = 4.5;
    const [hx0, hx1, hz0, hz1] = [cx - 5.5, cx + 5.5, z0 + 2.2, z0 + 9];
    const square = (x, z, half) => ({ rect: [x - half, z - half, x + half, z + half] });

    return {
        solid: [
            // (The curtain walls, 2.4 m thick within their lines; ending within the gate tower,
            // clear of its way through)
            { wall: [[gateAt - 3.5, z1 - 1.2], [x0 + 1.2, z1 - 1.2], 1.2] },
            { wall: [[x0 + 1.2, z1 - 1.2], [x0 + 1.2, z0 + 1.2], 1.2] },
            { wall: [[x0 + 1.2, z0 + 1.2], [x1 - 1.2, z0 + 1.2], 1.2] },
            { wall: [[x1 - 1.2, z0 + 1.2], [x1 - 1.2, z1 - 1.2], 1.2] },
            { wall: [[x1 - 1.2, z1 - 1.2], [gateAt + 3.5, z1 - 1.2], 1.2] },
            ...[[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => square(x, z, 3)),
            // (The gate tower either side of its way through)
            { rect: [gateAt - 3.5, z1 - 2.5, gateAt - 2, z1 + 2.5] },
            { rect: [gateAt + 2, z1 - 2.5, gateAt + 3.5, z1 + 2.5] },
            ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dz]) => square(cx + dx * (quarter / 2 + 1), cz + dz * (quarter / 2 + 1), quarter / 2)),
            { disc: [cx, cz, 1.45] },
            { rect: [hx0, hz0, hx1, hz1] },
        ],
        // (Within its walls; and the way through its gate tower)
        court: [{ rect: [x0, z0, x1, z1] }, { rect: [gateAt - 2, z1, gateAt + 2, z1 + 2.5] }],
        ground: "courtyard",
        gate: [gateAt, z1],
        // (The tower house's door, in the middle of its south face)
        entry: { x: cx, y: hz1, width: 1.8, height: 2.6, inside: "keep" },
    };
}

// The dark elves': eight towers round a ring of black wall built 2.4 m within the lines between
// them, its gate between the two to the south between two slender gate towers, spiders either
// side of the way to it; in the middle a terrace 3.6 m high, the Black Tower on it (their keep),
// stairs up the terrace's south face to its door
function darkElf([W, D]) {
    const [cx, cz] = [W / 2, D / 2];
    const R = Math.min(W, D) / 2 - 3;
    const count = 8;
    const towers = Array.from({ length: count }, (_, k) => {
        const a = (k * PI * 2) / count + PI / count;

        return [cx + cos(a) * R, cz + sin(a) * R];
    });
    const [gx, gz] = [(towers[1][0] + towers[2][0]) / 2, (towers[1][1] + towers[2][1]) / 2];
    // (A run of the wall, from one point to another on the lines between the towers, as thick as
    // it's built within them)
    const within = (a, b) => {
        const [mx, mz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const [nx, nz] = [((cx - mx) / hypot(cx - mx, cz - mz)) * 1.2, ((cz - mz) / hypot(cx - mx, cz - mz)) * 1.2];

        return { wall: [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], 1.2] };
    };
    const terrace = Array.from({ length: 8 }, (_, k) => [cx + cos(PI / 8 + (k * PI) / 4) * R * 0.4, cz + sin(PI / 8 + (k * PI) / 4) * R * 0.4]);
    // (Its south face, flat: the stairs from it, 20 risers of 0.18 m on treads 0.3 m deep)
    const face = cz + R * 0.4 * cos(PI / 8);
    const door = cz + R * 0.22;

    return {
        solid: [
            ...towers.map(([x, z]) => ({ disc: [x, z, 2.6] })),
            ...towers.flatMap((at, k) => (k === 1 ? [] : [within(at, towers[(k + 1) % count])])),
            within(towers[1], [gx + 3.8, gz]),
            within([gx - 3.8, gz], towers[2]),
            { disc: [gx - 3.8, gz, 1.3] },
            { disc: [gx + 3.8, gz, 1.3] },
            { disc: [gx - 5, gz + 3, 1.4] },
            { disc: [gx + 5, gz + 3, 1.4] },
            { polygon: terrace },
            { rect: [cx - 1.2, face, cx + 1.2, face + 6] },
        ],
        // (Within its towers; and its gateway, the gate towers either side)
        court: [{ polygon: towers }, { rect: [gx - 2.5, gz - 2.4, gx + 2.5, gz + 0.6] }],
        ground: "cobbles",
        gate: [gx, gz],
        // (The Black Tower's door, up on the terrace: gone into from the stairs' foot)
        entry: { x: cx, y: door, width: 2, height: 3, floor: 3.6, foot: [cx, face + 6], inside: "keep" },
    };
}

// The lizard folk's temple-fortress: a square platform 4 m high in its moat, all of it solid
// (the courtyard's up on the platform, and the walking mesh is the land's: it isn't walked onto),
// its causeway from the south up to the platform's stairs; on the platform the summit pyramid and
// the palace (their keep), its door the middle of three in its south face, gone into from the
// causeway's end
function lizard([W, D]) {
    const [cx, cz] = [W / 2, D / 2 - 2];
    const half = Math.min(W, D) / 2 - 8;

    return {
        solid: [{ rect: [0, 0, W, D] }],
        court: [],
        ground: "courtyard",
        gate: null,
        entry: { x: (cx + 1 + cx + half - 1.5) / 2, y: cz + half - 1.5, width: 1.6, height: 2.4, floor: 4, foot: [cx, D], inside: "keep" },
    };
}

// Each people's whose castle can be walked into (or its keep gone into), so far
const LAYOUTS = Object.freeze({ elf, orc, cat, darkElf, lizard });

/**
 * A people's castle laid out on its lot ([W, D] metres): { solid (shapes: `rect` [u0, v0, u1,
 * v1], `disc` [u, v, r], `wall` [[u, v], [u, v], half its thickness], `ring` [u, v, r0, r1, from,
 * to: its arc, radians, from east towards south], `polygon` [[u, v]...: its corners round from
 * east towards south, a convex one]), court (shapes: within its walls and its gateway,
 * its courtyard), ground (what its courtyard's ground is: a GROUND kind's name, setpieces/pieces.js:
 * flagstones, or the orcs' trodden earth), gate ([u, v]: the middle of its way in, 3 m clear at
 * the least; null for one with no courtyard walked into), entry (its keep's door, as a neutral site's: { x, y, width, height, floor (its sill
 * above the ground), foot ([u, v]: where its way in begins, if not at it: the foot of a stair or
 * causeway up to it), inside }, sites.js entranceAt) }; or null for a people's not
 * laid out yet (theirs stays solid all through).
 */
export function castleLayout(race, size) {
    return LAYOUTS[race]?.(size) ?? null;
}

/** Whether a point on a castle's lot ([u, v] metres) is solid (within CASTLE_MARGIN of it). */
export function solidAt(layout, at, margin = CASTLE_MARGIN) {
    return layout.solid.some((shape) => within(shape, at, margin));
}

/** Whether a point on a castle's lot ([u, v] metres) is in its courtyard. */
export function inCourt(layout, at) {
    return layout.court.some((shape) => within(shape, at, 0));
}

// Whether a point's within a shape, or `margin` metres of it
function within(shape, [u, v], margin) {
    if (shape.rect) {
        const [u0, v0, u1, v1] = shape.rect;

        return u >= u0 - margin && u <= u1 + margin && v >= v0 - margin && v <= v1 + margin;
    }

    if (shape.disc) {
        const [x, z, r] = shape.disc;

        return hypot(u - x, v - z) <= r + margin;
    }

    if (shape.polygon) {
        // (Within each of its sides, in turn: its corners go round from east towards south)
        const corners = shape.polygon;

        return corners.every(([ax, az], k) => {
            const [bx, bz] = corners[(k + 1) % corners.length];

            return (bx - ax) * (v - az) - (bz - az) * (u - ax) >= -margin * hypot(bx - ax, bz - az);
        });
    }

    if (shape.wall) {
        const [[ax, az], [bx, bz], half] = shape.wall;
        const [dx, dz] = [bx - ax, bz - az];
        const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - az) * dz) / (dx * dx + dz * dz || 1)));

        return hypot(u - (ax + dx * t), v - (az + dz * t)) <= half + margin;
    }

    const [x, z, r0, r1, from, to] = shape.ring;
    const r = hypot(u - x, v - z);

    if (r < r0 - margin || r > r1 + margin) {
        return false;
    }

    // (Within its arc: its angle from east towards south, as far round from `from` as `to`
    // is, or its margin's worth more, at that radius)
    const round = (((atan2(v - z, u - x) - from) % (PI * 2)) + PI * 2) % (PI * 2);
    const slack = margin / Math.max(r, 1);

    return round <= to - from + slack || round >= PI * 2 - slack;
}
