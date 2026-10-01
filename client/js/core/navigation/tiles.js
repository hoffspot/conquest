// What a navigation tile is made from (navigation.js bakes it): the ground and what stands on it
// in a square of the world, as triangles. A tile is 32 m on a side, aligned to the world's origin,
// and takes in a border round it (where its neighbours' edges are worked out the same way), so it
// depends only on the world (its seed, and what's been built), never on which tiles were made
// before it, or by whom.
//
//  - The ground: the terrain's heights at every metre (terrain/ground.js), two triangles a square.
//    Each triangle's area says how it's walked: open ground, a road, steep ground (over 30°), a
//    ford (water no deeper than FORD); none at all for deeper water, or for ground too steep to
//    climb (over 38°, a cliff), which Recast leaves out.
//  - What stands on it: the overworld's solid squares (the town's, the settlements' and the
//    places' buildings and walls, and the wild's features), merged into rectangles, each a box
//    OBSTACLE high; trees as their trunks. Their faces are areas of none, so nothing can be stood
//    on them (a roof is no floor).
//  - Bridges: their decks, a strip of quads along each, at its height.

import { hypot } from "../exact.js";
import { WET } from "../overworld.js";
import { GROUND } from "../setpieces/pieces.js";
import { CHUNK, CHUNKS, WORLD_SIZE } from "../worldplan/plan.js";
import { AREA, BORDER, FORD, TILE } from "./settings.js";

export { AGENT, AREA, BORDER, CELL, CELL_HEIGHT, COSTS, FORD, TILE } from "./settings.js";

/** The ground walked as a road: roads, and a town's or a castle's streets, yards and planks. */
const PAVED = new Set([GROUND.road, GROUND.cobbles, GROUND.courtyard, GROUND.planks]);

/** How steep the ground can be: steep from 30°, too steep to climb from 38° (their cosines). */
const STEEP_COS = 0.8660254037844387;
const CLIFF_COS = 0.788010753606722;

/** How high a building, wall or feature is taken to stand over the ground under it (metres). */
const OBSTACLE = 3;

/** A tree's trunk: half its width (metres), at its size 1. */
const TRUNK = 0.2;

// (The world's edge: no ground beyond it)
const inWorld = (x, y) => x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;

/**
 * The triangles a tile is made from: { positions (Float32Array: x, height, y each, metres),
 * indices (Int32Array, three a triangle), areas (Uint8Array, one a triangle: AREA or 0), bmin, bmax
 * ([x, height, y]: the box round them, the border in) }. `world` is the Overworld.
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

            // (Water the land has, not a settlement's lagoon: what's built there is solid, below)
            if (chunk.water[k] !== WET.none && !chunk.solid[k]) {
                const depth = world.surfaceAt(sx + 0.5, sy + 0.5) - Math.min(heights[a], heights[b], heights[c], heights[d]);

                kind = depth > FORD ? 0 : AREA.ford;
            }

            triangle(a, c, b, kind && slopeArea(positions, a, c, b, kind));
            triangle(b, c, d, kind && slopeArea(positions, b, c, d, kind));
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

        box(rx0, ry0, rx1, ry1, low - 0.5, high + OBSTACLE);
    }

    // Trees: their trunks (those standing in the chunks the tile's in, and a metre round)
    for (const tree of treesNear(world, x0 - 1, y0 - 1, x0 + size + 1, y0 + size + 1)) {
        const half = TRUNK * tree.size;
        const h = world.ground.heightAt(tree.x, tree.y);

        box(tree.x - half, tree.y - half, tree.x + half, tree.y + half, h - 0.5, h + OBSTACLE);
    }

    // Bridges: their decks, a quad every metre along
    for (const bridge of bridgesNear(world, x0, y0, x0 + size, y0 + size)) {
        const { a, b, half } = bridge;
        const length = hypot(b[0] - a[0], b[1] - a[1]);
        const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const [nx, ny] = [-uy * half, ux * half];
        const steps = Math.max(1, Math.ceil(length));
        let last = null;

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const [px, py] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const h = world.deckOf(bridge, t);
            const pair = [vertex(px + nx, h, py + ny), vertex(px - nx, h, py - ny)];

            if (last) {
                // (Faces up, whichever way the bridge runs: worked out from the first two)
                triangle(last[0], last[1], pair[0], AREA.deck);
                triangle(last[1], pair[1], pair[0], AREA.deck);
            }

            last = pair;
        }
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
    };
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

// The trees whose trunks stand in a box
function treesNear(world, x0, y0, x1, y1) {
    const trees = [];

    for (const [cx, cy] of chunksOf(x0, y0, x1, y1)) {
        trees.push(...world.chunk(cx, cy).trees.filter(({ x, y }) => x >= x0 && y >= y0 && x < x1 && y < y1));
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
