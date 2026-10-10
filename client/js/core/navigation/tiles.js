// What a navigation tile is made from (navigation.js bakes it): the ground and what stands on it
// in a square of the world, as triangles. A tile is 32 m on a side, aligned to the world's origin,
// and takes in a border round it (where its neighbours' edges are worked out the same way), so it
// depends only on the world (its seed, and what's been built), never on which tiles were made
// before it, or by whom.
//
//  - The ground: the terrain's heights at every metre (terrain/ground.js), two triangles a square.
//    Each triangle's area says how it's walked: open ground, a road, steep ground (over 30°), a
//    ford (water that can be waded: no deeper than FORD, and slow enough, overworld.js wades);
//    none at all for deeper or faster water, or for ground too steep to climb (over 38°, a
//    cliff), which Recast leaves out.
//  - What stands on it: the overworld's solid squares (the town's, the settlements' and the
//    places' buildings and walls, and the wild's features), merged into rectangles, each a box
//    OBSTACLE high, a centimetre in from the squares' edges (on them, Recast would take each box
//    a voxel further on its east and south sides); trees as their trunks. Their faces are areas
//    of none, so nothing can be stood on them (a roof is no floor), and so is the ground under
//    them (nothing's walked inside them).
//  - What stands about the settlements' open ground as it's drawn (overworld.js standingNear: a
//    lamp post its foot, not the squares round it), their props and their yards' fences, and
//    their buildings as they stand (a house's lot, a landmark's but for the way up to its door:
//    setpieces/standing.js buildingOutline, where their squares are only those well inside it):
//    each an outline, half a voxel wider (Recast takes in a voxel whose middle's inside it), whose
//    ground the tile marks walked by no one (bake.js), so walkers are kept their radius from it.
//    (As a box, a prop as wide as a well would be hollow: the ground inside walked, as an island.)
//  - Bridges: their decks, a strip of quads along each, at its height (and a citadel's decks, and
//    an army's camp's walkway and the stairs up to it: overworld.js bridgesNear); and the plank
//    walks over the lizard folk's lagoons, at their planks' (the town's ground round the lagoon,
//    its bed dug down below them), the lagoon's water walked nowhere but on them.

import { hypot } from "../exact.js";
import { RAISED, WET } from "../overworld.js";
import { GROUND } from "../setpieces/pieces.js";
import { CHUNK, CHUNKS, WORLD_SIZE } from "../worldplan/plan.js";
import { AREA, BORDER, CELL, FORD, TILE } from "./settings.js";

export { AGENT, AREA, BORDER, CELL, CELL_HEIGHT, COSTS, FORD, TILE } from "./settings.js";

/** The ground walked as a road: roads, and a town's or a castle's streets, yards and planks. */
const PAVED = new Set([GROUND.road, GROUND.cobbles, GROUND.courtyard, GROUND.planks]);

/** How steep the ground can be: steep from 30°, too steep to climb from 38° (their cosines). */
const STEEP_COS = 0.8660254037844387;
const CLIFF_COS = 0.788010753606722;

/** How high a building, wall or feature is taken to stand over the ground under it (metres). */
const OBSTACLE = 3;

/** How high a plank walk's planks are over the ground under them (metres: world/chunks3d.js DECK.top). */
const WALK_TOP = 0.16;

/** A tree's trunk: half its width (metres), at its size 1; a great lone oak's (lonetrees.js). */
const TRUNK = 0.2;
const LONE_TRUNK = 1.2;

// How far in from the squares' edges a box over solid squares stands (metres)
const INSET = 0.01;

// (The world's edge: no ground beyond it)
const inWorld = (x, y) => x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;

/**
 * The triangles a tile is made from: { positions (Float32Array: x, height, y each, metres),
 * indices (Int32Array, three a triangle), areas (Uint8Array, one a triangle: AREA or 0), bmin, bmax
 * ([x, height, y]: the box round them, the border in), outlines (what's walked round as it's
 * drawn: { corners (Float32Array: x, height, y each), counts (Int32Array: an outline's corners),
 * heights (Float32Array: the lowest and highest of the ground it's marked on, each) }) }.
 * `world` is the Overworld.
 */
export function tileInput(world, tx, ty) {
    const [x0, y0] = [tx * TILE - BORDER, ty * TILE - BORDER];
    const size = TILE + 2 * BORDER;
    const positions = [];
    const indices = [];
    const areas = [];
    const vertex = (x, height, y) => positions.push(x, height, y) / 3 - 1;
    const triangle = (a, b, c, area) => {
        indices.push(a, b, c);
        areas.push(area);
    };

    // The ground: a vertex every metre (the world's edge clamped)
    const across = size + 1;
    const heights = new Float64Array(across * across);

    for (let j = 0; j < across; j++) {
        for (let i = 0; i < across; i++) {
            const [x, y] = [x0 + i, y0 + j];

            heights[j * across + i] = world.ground.heightAt(Math.min(WORLD_SIZE - 0.01, Math.max(0, x)), Math.min(WORLD_SIZE - 0.01, Math.max(0, y)));
            vertex(x, heights[j * across + i], y);
        }
    }

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const [sx, sy] = [x0 + i, y0 + j];

            if (!inWorld(sx, sy)) {
                continue;
            }

            const chunk = world.chunkAt(sx, sy);
            const k = (sy - chunk.y0) * CHUNK + (sx - chunk.x0);
            const [a, b, c, d] = [j * across + i, j * across + i + 1, (j + 1) * across + i, (j + 1) * across + i + 1];
            let kind = PAVED.has(chunk.ground[k]) ? AREA.road : AREA.ground;

            // (Under a citadel's deck well over it, a stair's flight or its landing: the stair's
            // masonry, not walked under; or an army's camp's walkway, or a stair up to it: its
            // posts and boards)
            if ((world.sites?.deckAt?.(sx, sy) || chunk.bridge?.[k] === RAISED) && world.heightAt(sx + 0.5, sy + 0.5) > Math.max(heights[a], heights[b], heights[c], heights[d]) + 1) {
                kind = 0;
            } else if (chunk.solid[k]) {
                // (Under a building, a wall or a feature: inside what stands there, never walked,
                // so none of it's an island of its own)
                kind = 0;
            } else if (chunk.water[k] !== WET.none && chunk.built[k]) {
                // (A lagoon's, in a town: walked on its plank walks over it, never waded)
                kind = 0;
            } else if (chunk.water[k] !== WET.none) {
                const depth = world.surfaceAt(sx + 0.5, sy + 0.5) - Math.min(heights[a], heights[b], heights[c], heights[d]);

                kind = (world.wades ? world.wades(sx + 0.5, sy + 0.5, depth) : depth <= FORD) ? AREA.ford : 0;
            }

            // (Split from its north-west corner to its south-east, as the ground's drawn and
            // stood on: terrain/ground.js between)
            triangle(a, c, d, kind && slopeArea(positions, a, c, d, kind));
            triangle(a, d, b, kind && slopeArea(positions, a, d, b, kind));
        }
    }

    // What stands on the ground: the solid squares, a box over each rectangle of them
    const box = (bx0, by0, bx1, by1, bottom, top) => {
        const corners = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]];
        const low = corners.map(([x, y]) => vertex(x, bottom, y));
        const high = corners.map(([x, y]) => vertex(x, top, y));

        for (let s = 0; s < 4; s++) {
            const t = (s + 1) % 4;

            triangle(low[s], low[t], high[t], 0);
            triangle(low[s], high[t], high[s], 0);
        }

        triangle(high[0], high[2], high[1], 0);
        triangle(high[0], high[3], high[2], 0);
    };
    const groundUnder = (bx0, by0, bx1, by1) => {
        let [low, high] = [Infinity, -Infinity];

        for (let y = Math.max(by0, y0); y <= Math.min(by1, y0 + size); y++) {
            for (let x = Math.max(bx0, x0); x <= Math.min(bx1, x0 + size); x++) {
                const h = heights[(y - y0) * across + (x - x0)];

                low = Math.min(low, h);
                high = Math.max(high, h);
            }
        }

        return [low, high];
    };

    for (const [rx0, ry0, rx1, ry1] of solidRectangles(world, x0, y0, size)) {
        const [low, high] = groundUnder(rx0, ry0, rx1, ry1);

        box(rx0 + INSET, ry0 + INSET, rx1 - INSET, ry1 - INSET, low - 0.5, high + OBSTACLE);
    }

    // (The settlements' props and fences, as they're drawn: their outlines, on the ground under
    // their corners)
    const outlines = { corners: [], counts: [], heights: [] };

    for (const corners of world.standingNear?.(x0 - 1, y0 - 1, x0 + size + 1, y0 + size + 1) ?? []) {
        const under = corners.map(([x, y]) => world.ground.heightAt(x, y));

        outlines.corners.push(...grown(corners, CELL / 2).flatMap(([x, y]) => [x, 0, y]));
        outlines.counts.push(corners.length);
        outlines.heights.push(Math.min(...under) - 0.5, Math.max(...under) + OBSTACLE);
    }

    // Trees: their trunks (those standing in the chunks the tile's in, and a metre round)
    for (const tree of treesNear(world, x0 - 1, y0 - 1, x0 + size + 1, y0 + size + 1)) {
        const half = (tree.lone ? LONE_TRUNK : TRUNK) * (tree.size ?? 1) - INSET;
        const h = world.ground.heightAt(tree.x, tree.y);

        box(tree.x - half, tree.y - half, tree.x + half, tree.y + half, h - 0.5, h + OBSTACLE);
    }

    // A deck from one end to the other (`deck`: its height a way `t` along it), a quad every metre
    const strip = ({ a, b, half }, deck) => {
        const length = hypot(b[0] - a[0], b[1] - a[1]);
        const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const [nx, ny] = [-uy * half, ux * half];
        const steps = Math.max(1, Math.ceil(length));
        let last = null;

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const [px, py] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const h = deck(t, px, py);
            const pair = [vertex(px + nx, h, py + ny), vertex(px - nx, h, py - ny)];

            if (last) {
                // (Faces up, whichever way the deck runs: worked out from the first two)
                triangle(last[0], last[1], pair[0], AREA.deck);
                triangle(last[1], pair[1], pair[0], AREA.deck);
            }

            last = pair;
        }
    };

    // Bridges: their decks
    for (const bridge of bridgesNear(world, x0, y0, x0 + size, y0 + size)) {
        strip(bridge, (t) => world.deckOf(bridge, t));
    }

    // The plank walks over a lagoon (the lizard folk's): their planks, WALK_TOP over their decks
    // (the town's ground round the lagoon; or, if a walk doesn't say, the ground under it)
    for (const walk of world.walksNear?.(x0, y0, x0 + size, y0 + size) ?? []) {
        strip(walk, (t, px, py) => (walk.level ?? world.ground.heightAt(px, py)) + WALK_TOP);
    }

    let [low, high] = [Infinity, -Infinity];

    for (let v = 1; v < positions.length; v += 3) {
        low = Math.min(low, positions[v]);
        high = Math.max(high, positions[v]);
    }

    return {
        positions: Float32Array.from(positions),
        indices: Int32Array.from(indices),
        areas: Uint8Array.from(areas),
        bmin: [x0, low - 1, y0],
        bmax: [x0 + size, high + 1, y0 + size],
        outlines: { corners: Float32Array.from(outlines.corners), counts: Int32Array.from(outlines.counts), heights: Float32Array.from(outlines.heights) },
    };
}

// A convex outline ([[x, y], ...]) grown `grow` metres all round, its corners mitred
function grown(corners, grow) {
    const n = corners.length;
    // (Which way round it goes: outwards is to the right of its edges going one way, the left
    // going the other)
    const turn = corners.reduce((sum, [x, y], k) => sum + x * corners[(k + 1) % n][1] - corners[(k + 1) % n][0] * y, 0) > 0 ? 1 : -1;
    const outward = ([ax, ay], [bx, by]) => {
        const length = hypot(bx - ax, by - ay) || 1;

        return [(turn * (by - ay)) / length, (-turn * (bx - ax)) / length];
    };

    return corners.map((corner, k) => {
        const [p, q] = [outward(corners[(k + n - 1) % n], corner), outward(corner, corners[(k + 1) % n])];
        const mitre = grow / Math.max(0.5, 1 + p[0] * q[0] + p[1] * q[1]);

        return [corner[0] + (p[0] + q[0]) * mitre, corner[1] + (p[1] + q[1]) * mitre];
    });
}

// A ground triangle's area by its slope: as it is, steep, or none if too steep to climb (its
// normal's upward part over its length, the cosine of its slope)
function slopeArea(positions, a, b, c, kind) {
    const [ax, ay, az] = [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]];
    const [ux, uy, uz] = [positions[b * 3] - ax, positions[b * 3 + 1] - ay, positions[b * 3 + 2] - az];
    const [vx, vy, vz] = [positions[c * 3] - ax, positions[c * 3 + 1] - ay, positions[c * 3 + 2] - az];
    const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const up = ny / Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (up <= CLIFF_COS) {
        return 0;
    }

    return up <= STEEP_COS && kind === AREA.ground ? AREA.steep : kind;
}

// The solid squares in a tile's box, merged into rectangles ([x0, y0, x1, y1], metres): runs
// along each row, each joined to the one under it when they're the same
function solidRectangles(world, x0, y0, size) {
    const solid = new Uint8Array(size * size);

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const [sx, sy] = [x0 + i, y0 + j];

            if (inWorld(sx, sy)) {
                const chunk = world.chunkAt(sx, sy);

                solid[j * size + i] = chunk.solid[(sy - chunk.y0) * CHUNK + (sx - chunk.x0)];
            }
        }
    }

    const rectangles = [];
    let open = new Map();

    for (let j = 0; j <= size; j++) {
        const runs = new Map();

        for (let i = 0; j < size && i < size; i++) {
            if (solid[j * size + i]) {
                const start = i;

                while (i + 1 < size && solid[j * size + i + 1]) {
                    i++;
                }

                runs.set(`${start} ${i}`, open.get(`${start} ${i}`) ?? j);
            }
        }

        // (A run that doesn't go on below ends a rectangle)
        for (const [key, from] of open) {
            if (!runs.has(key) || runs.get(key) !== from) {
                const [start, end] = key.split(" ").map(Number);

                rectangles.push([x0 + start, y0 + from, x0 + end + 1, y0 + j]);
            }
        }

        open = runs;
    }

    return rectangles;
}

// The chunks a box is in (those in the world)
function* chunksOf(x0, y0, x1, y1) {
    for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(CHUNKS - 1, Math.floor(y1 / CHUNK)); cy++) {
        for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(CHUNKS - 1, Math.floor(x1 / CHUNK)); cx++) {
            yield [cx, cy];
        }
    }
}

// The trees whose trunks stand in a box: the chunks', and the town's own (its stamp's)
function treesNear(world, x0, y0, x1, y1) {
    const within = ({ x, y }) => x >= x0 && y >= y0 && x < x1 && y < y1;
    const trees = (world.stamp?.trunks ?? []).filter(within);

    for (const [cx, cy] of chunksOf(x0, y0, x1, y1)) {
        trees.push(...world.chunk(cx, cy).trees.filter(within));
    }

    return trees;
}

// The bridges whose decks reach into a box, each once
function bridgesNear(world, x0, y0, x1, y1) {
    const found = new Set();

    for (const [cx, cy] of chunksOf(x0, y0, x1, y1)) {
        for (const bridge of world.bridgesNear(cx, cy)) {
            const { a, b, half } = bridge;

            if (Math.max(a[0], b[0]) + half >= x0 && Math.min(a[0], b[0]) - half <= x1 && Math.max(a[1], b[1]) + half >= y0 && Math.min(a[1], b[1]) - half <= y1) {
                found.add(bridge);
            }
        }
    }

    return [...found];
}
