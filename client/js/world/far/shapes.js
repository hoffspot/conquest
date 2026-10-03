// The shapes what's built is seen as from afar (the terrain plan's §9 row 2): a box or two for
// each building, its roof as its people roof theirs (gabled, pointed, spired, flat, thatched
// steep, or low), towers as columns and cones, walls as long low boxes, and each people's great
// places (castles, spires, ziggurats, temples, totems) as the few masses that make their outline.
// Each piece in its people's colours; flat-shaded; a few dozen triangles. Pure: worked out in a
// worker (silhouette-worker.js), into arrays a mesh is made from (silhouettes.js).

import { AQUEDUCTS } from "../../core/aqueducts.js";
import { CITADEL, citadelLevel, citadelParts, layoutCitadel, moatReach } from "../../core/setpieces/citadel.js";
import { ARCHES, feetOf, legsOf } from "../../core/arches.js";
import { createRandom } from "../../core/random.js";
import { layoutNeutral } from "../../core/setpieces/neutral.js";
import { PLOT } from "../../core/setpieces/pieces.js";

/**
 * Each people's colours (sRGB) and how they build: `walls`, `roof`, `stone` (towers, castles,
 * walls), `wood`; `storey` (metres); `roof`: gable (rise as a share of the narrower side), pointed
 * (a pyramid), spire (a tall pyramid), flat; and how much higher their walls and towers stand.
 */
export const BUILDERS = Object.freeze({
    human: { walls: 0xcdbb9c, roof: 0x6e4c3c, stone: 0x9a9286, wood: 0x6a5240, storey: 3, roofs: "gable", rise: 0.55, wall: 6.4, tower: 12 },
    elf: { walls: 0xe4e0d2, roof: 0x6e8e74, stone: 0xd8d4c6, wood: 0x8a7a5a, storey: 3.2, roofs: "pointed", rise: 0.9, wall: 7, tower: 18 },
    darkElf: { walls: 0x3a3540, roof: 0x4c3c60, stone: 0x2c2832, wood: 0x2e2a2c, storey: 3.4, roofs: "spire", rise: 1.5, wall: 9, tower: 24 },
    cat: { walls: 0xbd8c5c, roof: 0xbd8c5c, stone: 0xb08050, wood: 0x7a5a3a, storey: 3, roofs: "flat", rise: 0, wall: 8, tower: 13 },
    lizard: { walls: 0x8c7c58, roof: 0x9c8c50, stone: 0xa49c84, wood: 0x6a5a3c, storey: 2.8, roofs: "gable", rise: 0.85, wall: 5, tower: 10, stilts: 1.6 },
    orc: { walls: 0x5c4838, roof: 0x4a3c30, stone: 0x3e3a38, wood: 0x4a3a2c, storey: 2.8, roofs: "gable", rise: 0.42, wall: 5, tower: 10 },
});

/**
 * The arches of rock's colours from afar (sRGB: the rock of their lands, engine/painters.js
 * MATERIALS' rock, rock-red, rock-dark and rock-pale), the grey's for any land not listed.
 */
export const ARCH_ROCK = Object.freeze({ savannah: 0x9c6448, badlands: 0x9c6448, volcanic: 0x3f3d3c, heath: 0xb3ad9c, beach: 0xb3ad9c, rock: 0x86827b });

/**
 * An arch of rock (core/arches.js's) as seen from afar: its two legs and the band over them, three
 * boxes in its land's rock. `heightOf(x, z)` is the ground's height.
 */
export function archShapes(shapes, arch, heightOf) {
    const colour = ARCH_ROCK[arch.land] ?? ARCH_ROCK.rock;
    const [[ax, ay], [bx, by]] = feetOf(arch);
    const [ha, hb] = [heightOf(ax, ay), heightOf(bx, by)];
    // (Its legs and the rock over its opening about as thick as they're drawn near: kits/arches.js
    // ARCH_LOOK; each leg as long as its squares, out to where its foot reaches, a little lower
    // than the top, its rock sloping down there)
    const [thick, band] = [3.6, 2.6];
    const top = (ha + hb) / 2 + arch.rise;
    // (A box's width runs along (cos f, -sin f): along the way from foot to foot)
    const facing = -arch.turn;

    for (const [[fx, fy], [tx, ty]] of legsOf(arch)) {
        const ground = heightOf(fx, fy);
        const long = Math.hypot(tx - fx, ty - fy) + 2 * (ARCHES.leg - 0.3);

        shapes.box((fx + tx) / 2, (fy + ty) / 2, ground - SUNK, long, thick, (top + band - ground) * 0.92 + SUNK, facing, colour);
    }

    shapes.box(arch.x, arch.y, top, arch.span + thick, thick, band, facing, colour);
}

/** A citadel's stone and roofs from afar, the shadow under its crowns, and its moat's water (sRGB: its stone and slate as they look near, darker: a far shape's flat faces catch more light than the near walls' coursed stone). */
export const CITADEL_FAR = Object.freeze({ stone: 0x6a6761, roof: 0x434d68, shade: 0x4a4844, water: 0x2e4852 });

/**
 * The humans' hill citadel (core/setpieces/citadel.js) as seen from afar, set down at (x, z) and
 * turned to `facing` (sites.js): each ward's walls a box along each side, from its foot (the land,
 * for the outer ward: the far land has no hill; the terrace below, for the others) to its top;
 * its towers columns, coned as theirs are; round each machicolated wall's and tower's top its
 * parapet standing out, dark with its corbels' shadow; its moat's water a side at a time, the
 * bridge over it and the gate tower on its far bank; the hall, the chapel and the ranges boxes, the hall's and chapel's roofed; the
 * keep a box under its roof, its needle towers columns under tall cones, its bartizans little
 * cones. About 1,500 triangles. `heightOf(x, z)` is the land's height.
 */
export function citadelShapes(shapes, { plan, seed, x, z, facing, heightOf }) {
    const citadel = layoutCitadel({ seed });
    const base = citadelLevel(plan, citadel, x, z, facing);
    const [c, s] = [Math.cos(facing), Math.sin(facing)];
    const place = ([u, v]) => [x + u * c + v * s, z - u * s + v * c];
    const { stone, roof, shade, water } = CITADEL_FAR;
    // (A crown's parapet over a tower's top, and its cone's eaves out past it: kits/citadel.js)
    const [parapet, eaves] = [1.1, 1];

    for (const part of citadelParts(citadel)) {
        const [px, pz] = place(part.at);
        const level = base + part.rise;
        const foot = part.ward ? level - part.drop : Math.min(level, heightOf(px, pz)) - SUNK;
        const turned = facing - part.turn - Math.PI / 2;

        if (part.part === "wall") {
            const top = level + part.high;

            shapes.box(px, pz, foot, part.length, part.thick, top + (part.crown ? 0 : parapet + 0.9) - foot, turned, stone);

            // (Its parapet standing out over its crown's shadow)
            if (part.crown) {
                shapes.box(px, pz, top - 1.5, part.length, part.thick + 1.4, parapet + 2.4, turned, shade);
            }
        } else if (part.part === "tower") {
            const top = level + part.high;

            shapes.column(px, pz, foot, part.radius, top + (part.crown ? 0 : parapet + 0.9) - foot, stone, 8);

            if (part.crown) {
                shapes.column(px, pz, top - 1.5, part.radius + 0.7, parapet + 1.5, shade, 8);
            }

            if (part.top === "cone") {
                shapes.cone(px, pz, top + parapet, part.radius + eaves, (part.radius + eaves) * part.spire, roof, 8);
            }
        } else if (part.part === "counterscarp") {
            // (Its side of the moat's water, from the outer wall's face to the far bank)
            const [near, far] = [moatReach(citadel, "wall"), moatReach(citadel, "water")];
            const mid = (near + far) / 2;
            const [wx, wz] = place([Math.cos(part.turn) * mid, Math.sin(part.turn) * mid]);

            shapes.box(wx, wz, base - CITADEL.moat.water - 0.05, (part.length * mid) / part.reach, far - near, 0.05, turned, water);
        } else if (part.part === "bridge") {
            const [bx, bz] = place([part.at[0] + Math.cos(part.turn) * (part.long / 2), part.at[1] + Math.sin(part.turn) * (part.long / 2)]);

            shapes.box(bx, bz, level - CITADEL.moat.water, part.wide + 1, part.long, CITADEL.moat.water + 1, turned, stone);
        } else if (part.part === "gatetower") {
            shapes.box(px, pz, level - part.drop, part.wide, part.deep, part.high + parapet + part.drop, turned, stone, false);
            shapes.roof(px, pz, level + part.high + parapet, part.wide - 1, part.deep - 1, 5.5, turned, roof, true);
        } else if (part.part === "range" || part.part === "hall" || part.part === "chapel") {
            const roofed = part.part !== "range";

            shapes.box(px, pz, level - part.drop, part.length, part.deep, part.eaves + part.drop, turned, stone, !roofed);

            if (roofed) {
                shapes.roof(px, pz, level + part.eaves, part.length, part.deep, (part.deep / 2) * 1.43, turned, roof);
            }
        } else if (part.part === "keep") {
            const top = level + part.high;
            const half = part.size / 2;
            // (Its corners, as the kit builds it: across its door's way, and out along it)
            const corner = (sx, sz) => place([part.at[0] + (sx * Math.sin(part.turn) + sz * Math.cos(part.turn)) * half, part.at[1] + (-sx * Math.cos(part.turn) + sz * Math.sin(part.turn)) * half]);

            shapes.box(px, pz, level - part.drop, part.size, part.size, top + parapet - level + part.drop, turned, stone, false);
            shapes.roof(px, pz, top + parapet, part.size, part.size, half * 1.7, turned, roof, true);

            for (const [sx, sz] of [[-1, -1], [1, 1]]) {
                const [nx, nz] = corner(sx, sz);
                const high = top + part.over + parapet;

                shapes.column(nx, nz, level, part.needle, high - level, stone, 6);
                shapes.cone(nx, nz, high, part.needle + eaves, (part.needle + eaves) * part.spire, roof, 6);
            }

            for (const [sx, sz] of [[1, -1], [-1, 1]]) {
                const [nx, nz] = corner(sx, sz);

                shapes.cone(nx, nz, top + part.turret, part.bartizan + 0.3, part.bartizan * 4, roof, 6);
            }
        }
    }
}

/** An aqueduct's stone from afar (sRGB: engine/painters.js MATERIALS' stone-lime-old, a little lighter for the haze). */
export const AQUEDUCT_STONE = 0xb0ab8e;

/**
 * An aqueduct (core/aqueducts.js's) as seen from afar: a box for each pier that stands (to its
 * height), and for each arch that does, the masonry and channel over it (to its channel's walls'
 * tops). `heightOf(x, z)` is the ground's height.
 */
export function aqueductShapes(shapes, aqueduct, heightOf) {
    const [ux, uy] = [Math.cos(aqueduct.turn), Math.sin(aqueduct.turn)];
    const facing = -aqueduct.turn;
    const [along, across] = AQUEDUCTS.pier;

    for (const [n, pier] of aqueduct.piers.entries()) {
        if (pier.state !== "fallen") {
            const ground = heightOf(pier.x, pier.y);

            shapes.box(pier.x, pier.y, ground - SUNK, along, across, pier.ground + pier.height - ground + SUNK, facing, AQUEDUCT_STONE);
        }

        if (aqueduct.spans[n]) {
            const [mx, my] = [pier.x + (ux * aqueduct.spacing) / 2, pier.y + (uy * aqueduct.spacing) / 2];

            shapes.box(mx, my, aqueduct.top - 1.6, aqueduct.spacing - along, across, 2.5, facing, AQUEDUCT_STONE);
        }
    }
}

// (A people's builders, the humans' for any not listed: the plan writes the dark elves both ways)
export const buildersOf = (people) => BUILDERS[people] ?? BUILDERS[people === "darkelf" ? "darkElf" : "human"];

// A hex colour's light (linear) components
function lightOf(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => {
        const c = byte / 255;

        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
}

const LIGHT = new Map();

const light = (hex) => {
    if (!LIGHT.has(hex)) {
        LIGHT.set(hex, lightOf(hex));
    }

    return LIGHT.get(hex);
};

/**
 * Shapes gathered into arrays (positions, normals, colours: three a vertex each; a triangle
 * every three vertices), in world metres (x east, y up, z south).
 */
export class Shapes {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.colours = [];
    }

    /** How many triangles there are. */
    get triangles() {
        return this.positions.length / 9;
    }

    // A flat triangle, its colour
    #triangle(a, b, c, colour) {
        const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

        [nx, ny, nz] = [nx / length, ny / length, nz / length];

        for (const point of [a, b, c]) {
            this.positions.push(point[0], point[1], point[2]);
            this.normals.push(nx, ny, nz);
            this.colours.push(colour[0], colour[1], colour[2]);
        }
    }

    // A flat four-sided face (its corners round it, anticlockwise seen from outside)
    #quad(a, b, c, d, colour) {
        this.#triangle(a, b, c, colour);
        this.#triangle(a, c, d, colour);
    }

    /**
     * A box standing at (x, z) from `y` up `height` metres, `width` across and `depth` deep
     * (metres), turned to `facing` (radians: 0 its front to the south, π/2 to the east); its top
     * left open where a roof's put on it (`top` false).
     */
    box(x, z, y, width, depth, height, facing, hex, top = true) {
        const corners = this.#corners(x, z, width, depth, facing);
        const colour = light(hex);
        const [low, high] = [y, y + height];

        for (let k = 0; k < 4; k++) {
            const [a, b] = [corners[k], corners[(k + 1) % 4]];

            this.#quad([a[0], low, a[1]], [b[0], low, b[1]], [b[0], high, b[1]], [a[0], high, a[1]], colour);
        }

        if (top) {
            this.#quad(...corners.map(([cx, cz]) => [cx, high, cz]), colour);
        }
    }

    /**
     * A roof over a box's top (as box's): gabled (`rise` metres, its ridge along the longer side),
     * or a pyramid (`point`).
     */
    roof(x, z, y, width, depth, rise, facing, hex, point = false) {
        const corners = this.#corners(x, z, width, depth, facing).map(([cx, cz]) => [cx, y, cz]);
        const colour = light(hex);

        if (point) {
            const top = [x, y + rise, z];

            for (let k = 0; k < 4; k++) {
                this.#triangle(corners[k], corners[(k + 1) % 4], top, colour);
            }

            return;
        }

        // (The ridge along the longer side: between the middles of the shorter ends, a to b and
        // c to d; the slopes up from the longer sides, b to c and d to a)
        const along = width >= depth ? [0, 1, 2, 3] : [1, 2, 3, 0];
        const [a, b, c, d] = along.map((k) => corners[k]);
        const middle = (p, q) => [(p[0] + q[0]) / 2, y + rise, (p[2] + q[2]) / 2];
        const [ridgeA, ridgeB] = [middle(a, b), middle(c, d)];

        this.#quad(b, c, ridgeB, ridgeA, colour);
        this.#quad(d, a, ridgeA, ridgeB, colour);
        this.#triangle(a, b, ridgeA, colour);
        this.#triangle(c, d, ridgeB, colour);
    }

    /** A column (`sides` round) at (x, z) from `y` up `height`, `radius` round; its top closed. */
    column(x, z, y, radius, height, hex, sides = 8) {
        const colour = light(hex);
        const ring = this.#ring(x, z, radius, sides);

        for (let k = 0; k < sides; k++) {
            const [a, b] = [ring[k], ring[(k + 1) % sides]];

            this.#quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + height, b[1]], [a[0], y + height, a[1]], colour);
            this.#triangle([x, y + height, z], [a[0], y + height, a[1]], [b[0], y + height, b[1]], colour);
        }
    }

    /** A cone (`sides` round) at (x, z) from `y` up `height`, `radius` round at its foot. */
    cone(x, z, y, radius, height, hex, sides = 8) {
        const colour = light(hex);
        const ring = this.#ring(x, z, radius, sides);

        for (let k = 0; k < sides; k++) {
            const [a, b] = [ring[k], ring[(k + 1) % sides]];

            this.#triangle([a[0], y, a[1]], [b[0], y, b[1]], [x, y + height, z], colour);
        }
    }

    // The corners of a rectangle turned to `facing` (anticlockwise from above: [x, z] each)
    #corners(x, z, width, depth, facing) {
        const [s, c] = [Math.sin(facing), Math.cos(facing)];
        const [ax, az] = [c * (width / 2), -s * (width / 2)];
        const [bx, bz] = [s * (depth / 2), c * (depth / 2)];

        return [
            [x - ax - bx, z - az - bz],
            [x - ax + bx, z - az + bz],
            [x + ax + bx, z + az + bz],
            [x + ax - bx, z + az - bz],
        ];
    }

    // Points round a circle (anticlockwise from above: [x, z] each)
    #ring(x, z, radius, sides) {
        return Array.from({ length: sides }, (_, k) => {
            const angle = (-k / sides) * Math.PI * 2;

            return [x + Math.cos(angle) * radius, z + Math.sin(angle) * radius];
        });
    }
}

// How far into the ground what's built is sunk (metres), so it never floats where the ground
// under it isn't quite as the far land has it
const SUNK = 2;

/**
 * A building of a people's: walls `storeys` high on a footprint (metres), and their roof. Lizard
 * folk's on stilts; round huts as columns and cones.
 */
export function building(shapes, { x, z, ground, width, depth, facing, storeys = 1, people, round = false }) {
    const builders = buildersOf(people);
    const y = ground - SUNK + (builders.stilts ?? 0);
    const height = SUNK + storeys * builders.storey;
    const narrow = Math.min(width, depth);

    if (round) {
        shapes.column(x, z, y, narrow / 2, height, builders.walls, 6);
        shapes.cone(x, z, y + height, narrow / 2 + 0.6, narrow * 0.7, builders.roof, 6);

        return;
    }

    shapes.box(x, z, y, width, depth, height, facing, builders.walls, builders.roofs === "flat");

    if (builders.roofs === "gable") {
        shapes.roof(x, z, y + height, width + 0.6, depth + 0.6, narrow * builders.rise, facing, builders.roof);
    } else if (builders.roofs !== "flat") {
        shapes.roof(x, z, y + height, width + 0.6, depth + 0.6, narrow * builders.rise, facing, builders.roof, true);
    }
}

/** A tower of a people's: a column of their stone, `height` metres, roofed as they roof theirs. */
export function tower(shapes, { x, z, ground, radius, height, people, spire = 0 }) {
    const builders = buildersOf(people);
    const y = ground - SUNK;

    shapes.column(x, z, y, radius, height + SUNK, builders.stone);

    if (builders.roofs === "flat") {
        return;
    }

    shapes.cone(x, z, y + height + SUNK, radius * 1.15, spire || radius * (builders.roofs === "spire" ? 4 : builders.roofs === "pointed" ? 2.4 : 1.6), builders.roof);
}

/**
 * The humans' churches seen from afar, by grade and build (world/art/kits/church.js CHURCH's
 * measures): how high the body stands (storeys), its tower's side and top (metres), what's on it
 * (a low pyramid, or a spire, metres high), and whether there are two (a minster's west front).
 */
export const FAR_CHURCHES = Object.freeze({
    parish: Object.freeze({ storeys: 2.2, side: 4.4, top: 13, cap: 4.2, towers: 1 }),
    romanesque: Object.freeze({ storeys: 3, side: 4.6, top: 16.5, cap: 4.4, towers: 1 }),
    gothic: Object.freeze({ storeys: 3, side: 4.6, top: 16.5, cap: 9.5, towers: 1 }),
    minster: Object.freeze({ storeys: 3.8, side: 3.1, top: 19, cap: 10, towers: 2 }),
});

// Which of FAR_CHURCHES a church piece is (core/setpieces/pieces.js churchOf's grade and build)
function churchLook({ grade, gothic }) {
    return grade === "minster" ? "minster" : grade === "parish" ? "parish" : gothic ? "gothic" : "romanesque";
}

// A church's tower over its door (a minster's two, either side of its nave), at the front of its
// lot (`depth` metres deep, its middle at x, z, facing `facing`), seen from afar
function churchTowers(shapes, { x, z, depth, facing, heightOf, look }) {
    const [s, c] = [Math.sin(facing), Math.cos(facing)];
    const forward = depth / 2 - 1.2 - look.side / 2;
    const across = look.towers === 2 ? [-(2.4 + look.side / 2), 2.4 + look.side / 2] : [0];

    for (const u of across) {
        const [tx, tz] = [x + c * u + s * forward, z - s * u + c * forward];

        tower(shapes, { x: tx, z: tz, ground: heightOf(tx, tz), radius: look.side / 2, height: look.top, people: "human", spire: look.cap });
    }
}

/**
 * The pieces of a settlement laid out (setpieces/town.js layoutTown's), at `origin` in the world
 * ([x, z] metres), as seen from afar: houses, landmarks, towers, walls and gatehouses (not props
 * or trees); and with `big` only, just the larger buildings (two storeys or more, or wider than
 * eight metres either way), its towers and walls. `heightOf(x, z)` is the ground's height.
 */
export function settlementShapes(shapes, { pieces, people, origin, heightOf, big = false }) {
    for (const piece of pieces) {
        const [x, z] = [piece.x + origin[0], piece.y + origin[1]];
        const [width, depth] = [piece.w * PLOT, piece.h * PLOT];
        const builders = buildersOf(piece.people ?? people);

        if (piece.kind === "house" || piece.kind === "landmark") {
            const storeys = piece.name === "hall" || piece.name === "keep" ? 3 : piece.name === "church" && (piece.people ?? people) === "human" ? FAR_CHURCHES[churchLook(piece)].storeys : piece.kind === "landmark" ? 2 : (piece.storeys ?? 1);

            if (big && storeys < 2 && Math.max(width, depth) < 8) {
                continue;
            }

            const ground = heightOf(x, z);

            building(shapes, { x, z, ground, width, depth, facing: piece.facing ?? 0, storeys, people: piece.people ?? people, round: piece.type === "roundhut" });

            // (A church's tower or towers, as big as its place; a keep's tower)
            if (piece.name === "church" && (piece.people ?? people) === "human") {
                churchTowers(shapes, { x, z, depth, facing: piece.facing ?? 0, heightOf, look: FAR_CHURCHES[churchLook(piece)] });
            } else if (piece.name === "church" || piece.name === "keep") {
                const side = Math.min(width, depth) * 0.4;
                const [s, c] = [Math.sin(piece.facing ?? 0), Math.cos(piece.facing ?? 0)];
                const [tx, tz] = [x + s * (depth / 2 - side / 2), z + c * (depth / 2 - side / 2)];

                tower(shapes, { x: tx, z: tz, ground: heightOf(tx, tz), radius: side / 2, height: piece.name === "church" ? 14.5 : 16, people: piece.people ?? people, spire: piece.name === "church" ? 7.5 : 0 });
            }
        } else if (piece.kind === "tower") {
            tower(shapes, { x, z, ground: heightOf(x, z), radius: Math.min(width, depth) / 2, height: builders.tower * 0.8, people: piece.people ?? people });
        } else if (piece.kind === "wall" || piece.kind === "gatehouse") {
            const height = piece.kind === "wall" ? builders.wall : builders.wall * 1.4;
            const ground = Math.min(heightOf(x, z), heightOf(x + width / 3, z + depth / 3), heightOf(x - width / 3, z - depth / 3));

            shapes.box(x, z, ground - SUNK, Math.max(width, 1.5), Math.max(depth, 1.5), height + SUNK, piece.facing ?? 0, builders.stone);
        }
    }
}

// The sites no people keeps that are seen from afar (the rest too low to be: a cave's in its
// hillside, or down in the ground)
const NEUTRAL_KINDS = new Set(["ruins", "ruined castle", "dragon's lair", "watchtower"]);

// The rock crags are of (art/kits/neutral.js: rock, and the dragon's dark rock)
const ROCK = Object.freeze({ light: 0x86827b, dark: 0x3f3d3c });

/**
 * A site no people keeps (core/setpieces/neutral.js lays it out, as near to), as seen from afar:
 * what of it stands high enough: an old hall's broken walls, crags, a broken watchtower, a ruined
 * castle's walls broken down and its towers and keep stumps. `place` turns a spot in its layout
 * (metres from its north-west corner, facing south) into the world's.
 */
function neutralShapes(shapes, { kind, people, seed, form, facing, place, heightOf, builders }) {
    const laid = layoutNeutral({ kind, seed: seed ?? 1, form });
    const random = createRandom(((seed ?? 1) ^ 0xfa2) >>> 0);
    const stone = builders.stone;
    const groundAt = (u, v) => {
        const [x, z] = place(u, v);

        return [x, z, heightOf(x, z) - SUNK];
    };

    for (const part of laid?.parts ?? []) {
        if (part.part === "wall") {
            const [x, z, y] = groundAt((part.x0 + part.x1) / 2, (part.y0 + part.y1) / 2);

            shapes.box(x, z, y, part.x1 - part.x0, part.y1 - part.y0, part.h * 0.8 + SUNK, facing, stone);
        } else if (part.part === "spur") {
            // (Not a face cut into the hill: that's only seen near to)
            const [x, z, y] = groundAt((part.x0 + part.x1) / 2, (part.y0 + part.y1) / 2);

            shapes.cone(x, z, y, Math.max(part.x1 - part.x0, part.y1 - part.y0) * 0.5, part.h * 1.25 + SUNK, kind === "dragon's lair" || people === "orc" ? ROCK.dark : ROCK.light, 6);
        } else if (part.part === "brokenTower") {
            const [x, z, y] = groundAt(part.x, part.y);

            shapes.column(x, z, y, part.r, part.h * 0.8 + SUNK, stone, 8);
        }
    }

    // (A ruined castle's pieces: each as it's left, a little lower or higher than the next)
    for (const piece of laid?.castle ?? []) {
        const [kindOf, form] = piece.key.split("-");
        const [pw, pd] = [piece.w * PLOT, piece.h * PLOT];
        const [x, z, y] = groundAt(piece.x * PLOT + pw / 2, piece.y * PLOT + pd / 2);
        const left = random.range(0.45, 0.8);

        if (kindOf === "wall") {
            // (In two lengths broken off at their own heights)
            const along = form === "h";

            for (const side of [-1, 1]) {
                const [u, v] = along ? [piece.x * PLOT + pw * (0.5 + side * 0.25), piece.y * PLOT + pd / 2] : [piece.x * PLOT + pw / 2, piece.y * PLOT + pd * (0.5 + side * 0.25)];
                const [wx, wz, wy] = groundAt(u, v);

                shapes.box(wx, wz, wy, along ? pw / 2 : 2.8, along ? 2.8 : pd / 2, 6.4 * random.range(0.4, 0.9) + SUNK, facing, stone);
            }
        } else if (kindOf === "tower") {
            if (form === "round") {
                shapes.column(x, z, y, 5, 12 * left + SUNK, stone, 8);
            } else {
                shapes.box(x, z, y, 9.6, 9.6, 12 * left + SUNK, facing, stone);
            }
        } else if (kindOf === "gatehouse") {
            // (Its two blocks, the way through between)
            const across = form === "n" || form === "s";

            for (const side of [-1, 1]) {
                const [u, v] = across ? [piece.x * PLOT + pw / 2 + side * pw * 0.36, piece.y * PLOT + pd / 2] : [piece.x * PLOT + pw / 2, piece.y * PLOT + pd / 2 + side * pd * 0.36];
                const [gx, gz, gy] = groundAt(u, v);

                shapes.box(gx, gz, gy, across ? pw * 0.28 : pw, across ? pd : pd * 0.28, 12.8 * random.range(0.45, 0.85) + SUNK, facing, stone);
            }
        } else if (kindOf === "keep") {
            shapes.box(x, z, y, pw - 2.8, pd - 2.8, (14 + Math.min(piece.w, piece.h) * 0.8) * left + SUNK, facing, stone);
        }
    }
}

/**
 * A people's great place (a plan's site: its kind, its people) at (x, z), `facing`, its size
 * (w, h: plots), as seen from afar; or nothing for what's too low to be seen far off (wells,
 * pools, pits, shrines, stones, caves). The sites no people keeps (ruins, ruined castles, the
 * dragon's lair, broken watchtowers) as they're laid out near to, by their `seed` and `form`.
 */
export function siteShapes(shapes, { kind, people, seed, form = null, x, z, facing = 0, w, h, heightOf }) {
    const builders = buildersOf(people ?? "human");
    const [width, depth] = [w * PLOT, h * PLOT];
    const ground = heightOf(x, z);

    // (Where a spot in its layout is: metres from its north-west corner, facing south, turned)
    const place = (u, v) => {
        const [s, c] = [Math.sin(facing), Math.cos(facing)];
        const [du, dv] = [u - width / 2, v - depth / 2];

        return [x + c * du + s * dv, z - s * du + c * dv];
    };

    if (NEUTRAL_KINDS.has(kind) && !(kind === "watchtower" && people)) {
        neutralShapes(shapes, { kind, people, seed, form, facing, place, heightOf, builders });

        return;
    }
    const corners = (inset) => [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
    ].map(([i, j]) => {
        const [s, c] = [Math.sin(facing), Math.cos(facing)];
        const [ax, az] = [i * (width / 2 - inset), j * (depth / 2 - inset)];

        return [x + c * ax + s * az, z - s * ax + c * az];
    });
    // (A ring of walls round the footprint, a tower at each corner)
    const ringed = (wall, towerHeight, radius) => {
        const points = corners(radius);

        for (let k = 0; k < 4; k++) {
            const [a, b] = [points[k], points[(k + 1) % 4]];
            const [mx, mz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const along = Math.atan2(b[0] - a[0], b[1] - a[1]);

            shapes.box(mx, mz, Math.min(heightOf(a[0], a[1]), heightOf(b[0], b[1])) - SUNK, 2, length, wall + SUNK, along, builders.stone);
        }

        for (const [tx, tz] of points) {
            tower(shapes, { x: tx, z: tz, ground: heightOf(tx, tz), radius, height: towerHeight, people: people ?? "human" });
        }
    };

    switch (kind) {
        case "castle":
            if (people === "lizard") {
                // A stepped platform, a shrine on top
                for (let step = 0; step < 6; step++) {
                    const share = 1 - step * 0.13;

                    shapes.box(x, z, ground - SUNK + step * 3.6, width * share, depth * share, 3.6 + (step ? 0 : SUNK), facing, builders.stone);
                }

                shapes.box(x, z, ground + 21.6 - SUNK, width * 0.18, depth * 0.18, 4, facing, builders.walls);
            } else if (people === "orc") {
                ringed(builders.wall, builders.tower, 2.5);
                shapes.column(x, z, ground - SUNK, Math.min(width, depth) * 0.22, 15.5 + SUNK, builders.stone, 10);
            } else {
                ringed(builders.wall, builders.tower, people === "darkElf" ? 3 : 2.6);

                // The keep, or the black tower
                if (people === "darkElf") {
                    tower(shapes, { x, z, ground, radius: 4, height: 20, people, spire: 30 });
                } else if (people === "elf") {
                    tower(shapes, { x, z, ground, radius: 3.5, height: 26, people });
                    shapes.column(x + width * 0.2, z - depth * 0.15, ground - SUNK, 2.2, 14, builders.wood, 6);
                    shapes.cone(x + width * 0.2, z - depth * 0.15, ground + 8, 13, 24, 0x5e7e4a, 8);
                } else {
                    building(shapes, { x, z, ground, width: Math.min(width, depth) * 0.3, depth: Math.min(width, depth) * 0.3, facing, storeys: people === "cat" ? 5 : 5.5, people: people ?? "human" });
                }
            }

            return;
        case "watchtower":
            tower(shapes, { x, z, ground, radius: Math.min(width, depth) / 2.4, height: 12, people: people ?? "human" });

            return;
        case "obsidian spire":
            shapes.box(x, z, ground - SUNK, width * 0.6, depth * 0.6, 6 + SUNK, facing, builders.stone);

            for (const [dx, dz, top] of [
                [0, 0, 38],
                [3, 2, 24],
                [-2.5, 3, 19],
                [-2, -3, 15],
            ]) {
                shapes.cone(x + dx, z + dz, ground + 5, 3.2, top, 0x1e1a24, 5);
            }

            return;
        case "starwatch":
            for (let tier = 0; tier < 5; tier++) {
                shapes.column(x, z, ground - SUNK + tier * 5, Math.min(width, depth) * (0.32 - tier * 0.04), 5 + (tier ? 0 : SUNK), builders.stone, 10);
            }

            shapes.cone(x, z, ground + 25 - SUNK, Math.min(width, depth) * 0.18, 7, 0xb8c8e0, 10);

            return;
        case "ziggurat":
            for (let step = 0; step < 7; step++) {
                const share = 1 - step * 0.12;

                shapes.box(x, z, ground - SUNK + step * 3.2, width * share, depth * share, 3.2 + (step ? 0 : SUNK), facing, builders.stone);
            }

            shapes.box(x, z, ground + 22.4 - SUNK, width * 0.16, depth * 0.16, 4, facing, builders.walls);

            return;
        case "sun temple":
            shapes.box(x, z, ground - SUNK, width * 0.8, depth * 0.6, 8 + SUNK, facing, builders.walls);

            for (const side of [-1, 1]) {
                const [s, c] = [Math.sin(facing), Math.cos(facing)];
                const [tx, tz] = [x + c * side * width * 0.3, z - s * side * width * 0.3];

                shapes.box(tx, tz, ground - SUNK, 4, 4, 20 + SUNK, facing, builders.walls);
            }

            return;
        case "war totem":
            shapes.box(x, z, ground - SUNK, 1.4, 1.4, 11 + SUNK, facing, builders.wood);
            shapes.box(x, z, ground + 7, 4, 1, 1, facing, builders.wood);

            return;
        case "tree hall":
            shapes.column(x, z, ground - SUNK, 3, 16 + SUNK, builders.wood, 7);
            shapes.cone(x, z, ground + 8, 15, 26, 0x5a7a46, 8);

            return;
        case "abbey":
            // (Its church a minster: core/sites.js)
            building(shapes, { x, z, ground, width: width * 0.8, depth: depth * 0.85, facing, storeys: FAR_CHURCHES.minster.storeys, people: "human" });
            churchTowers(shapes, { x, z, depth, facing, heightOf, look: FAR_CHURCHES.minster });

            return;
        case "windmill":
            shapes.column(x, z, ground - SUNK, 2.8, 9 + SUNK, builders.walls, 8);
            shapes.cone(x, z, ground + 9, 3.2, 3.5, builders.roof, 8);

            return;
        case "manor":
            building(shapes, { x, z, ground, width: width * 0.6, depth: depth * 0.45, facing, storeys: 2, people: "human" });

            return;
        case "pride rock":
            shapes.cone(x, z, ground - SUNK, Math.min(width, depth) * 0.45, 14 + SUNK, 0x9a8466, 5);

            return;
        default:
    }
}
