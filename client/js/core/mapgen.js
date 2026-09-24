// Generates maps: new terrain, obstacles and mission sites every game, built from the book's tiles
// (see data/tileset.js), and checked so that everything a mission needs can be reached.
//
// A map is made in steps, all from one seed (so a seed always gives the same map):
//
//   1. Sites. The places a mission needs (the player's base, the enemy base, where a convoy waits,
//      patrol routes...) are placed first, following the level's rules: in a corner, opposite
//      another site, part of the way between two sites, on the map edge beside a site...
//   2. Terrain. Lakes, rivers, lava fields and dirt pits are painted onto the grid of tile corners,
//      keeping clear of the sites. Different kinds of terrain never touch.
//   3. Tiles. Each tile is chosen by the terrain at its four corners, as the book's tiles are drawn
//      that way. Where the book has no tile for a combination (water in two opposite corners, for
//      example), the terrain is trimmed back until it does.
//   4. Routes. Every pair of sites that must be connected is checked for a route at least two
//      tiles wide, so that vehicles don't get stuck. Where there isn't one, a passage three tiles
//      wide is cut through the terrain along the cheapest line.
//   5. Obstacles. Trees, rocks and ruins are dropped onto open grass, but never onto a site and
//      never where they would cut a route.
//   6. Checks. The finished map is checked again, including with the game's own path finding. If
//      anything is wrong, the map is made again with a seed derived from the first.
//
// Everything is deterministic (see random.js), so both players in a multiplayer game get the
// same map from the same seed.

import { TILESET } from "./data/tileset.js";
import { findPath } from "./pathfinding.js";
import { createRandom, noise } from "./random.js";

// Terrain at a tile corner
const GRASS = 0;
const TERRAIN_LETTERS = ["G", "W", "L", "P"];
const WATER = 1;
const LAVA = 2;
const PIT = 3;

// The tiles for each combination of corners (terrain tiles only: obstacles are placed as stamps)
const TILES_BY_CORNERS = new Map([["GGGG", [{ id: TILESET.grass, count: 1 }]]]);

for (const [id, tile] of TILESET.tiles.entries()) {
    if (tile.corners !== "GGGG" && [...tile.corners].every((letter) => TERRAIN_LETTERS.includes(letter))) {
        TILES_BY_CORNERS.set(tile.corners, [...(TILES_BY_CORNERS.get(tile.corners) ?? []), { id, count: tile.count }]);
    }
}

// Obstacles that fit on a small map (the walled enclosure is 10 by 9 tiles)
const STAMPS = TILESET.stamps;

// Sixteen directions, for rivers (unit vectors, written out so that every browser agrees)
const DIRECTIONS = [
    [1, 0], [0.9239, 0.3827], [0.7071, 0.7071], [0.3827, 0.9239], [0, 1], [-0.3827, 0.9239], [-0.7071, 0.7071], [-0.9239, 0.3827],
    [-1, 0], [-0.9239, -0.3827], [-0.7071, -0.7071], [-0.3827, -0.9239], [0, -1], [0.3827, -0.9239], [0.7071, -0.7071], [0.9239, -0.3827],
];

const OPPOSITE_CORNER = { nw: "se", ne: "sw", se: "nw", sw: "ne" };
const NEIGHBOUR_CORNERS = { nw: ["ne", "sw"], ne: ["nw", "se"], se: ["ne", "sw"], sw: ["nw", "se"] };

// How many times to try again (with derived seeds) before giving up
const ATTEMPTS = 40;

/**
 * Generate a map.
 * @param {object} spec  what the map needs (see levels.js):
 *   width, height        size in tiles
 *   terrain              how many of each feature: { lakes, rivers, lava, pits, obstacles }, each [min, max]
 *   sites                named places and the rules for placing them (see placeSite)
 *   connect              pairs of site names that must be connected by land
 * @param {number} seed
 * @returns {{seed: number, width: number, height: number, tiles: number[][], obstructed: number[][], sites: object}}
 */
export function generateMap(spec, seed) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const random = createRandom(((seed >>> 0) + Math.imul(attempt, 0x9e3779b9)) >>> 0);
        const map = attemptMap(spec, random);

        if (map) {
            return { seed: seed >>> 0, attempt, ...map };
        }
    }

    throw new Error(`Could not generate a map from seed ${seed}`);
}

function attemptMap(spec, random) {
    const { width, height } = spec;
    const sites = placeSites(spec, random);

    if (!sites) {
        return undefined;
    }

    const corners = new Corners(width, height);

    // Nothing is painted on or right around the sites
    for (const site of Object.values(sites)) {
        corners.protect(site.x - 2, site.y - 2, site.x + site.width + 2, site.y + site.height + 2);
    }

    paintTerrain(corners, spec.terrain ?? {}, random);
    corners.repair();

    const map = new TileMap(width, height);

    map.chooseTiles(corners, random);

    // Routes between sites, cut through the terrain where needed
    const connections = (spec.connect ?? []).map(([a, b]) => [sites[a], sites[b]]);

    for (let round = 0; round < 6; round++) {
        const missing = connections.filter(([a, b]) => !map.connected(a, b));

        if (!missing.length) {
            break;
        }

        for (const [a, b] of missing) {
            corners.carve(map.cheapestRoute(a, b));
        }

        corners.repair();
        map.chooseTiles(corners, random);
    }

    placeObstacles(map, sites, connections, spec.terrain?.obstacles ?? [0, 0], random);

    if (!check(map, sites, connections)) {
        return undefined;
    }

    return { width, height, tiles: map.rows(map.tiles), obstructed: map.rows(map.blocked), sites };
}

/* Sites */

/**
 * Place every site, in the order given (so a site's rules can refer to sites before it). Each
 * site is a rectangle of tiles, width by height, placed by one of these rules:
 *   corner: "any" | { opposite: site } | { beside: site }   in a corner of the map; inset: [min, max]
 *                                                          tiles from the edges (default [0, 3]);
 *                                                          touch: true puts it right against one
 *                                                          of the two edges (its `side`)
 *   edge: { beside: site, along: [min, max] }              on a map edge next to a site in a corner,
 *                                                          `along` tiles further along that edge
 *   between: [site, site], at: [min, max], offset: [min, max]
 *                                                          part of the way from one site to the other
 *                                                          (0 to 1), moved sideways by `offset` of
 *                                                          the distance between them
 *   anywhere: true                                         anywhere on the map
 * Optionally awayFrom: { site: tiles } keeps it at least that far from other sites (centre to centre).
 * Sites never overlap, and keep at least `gap` tiles (default 2) between them.
 */
function placeSites(spec, random) {
    const sites = {};

    for (const [name, rule] of Object.entries(spec.sites ?? {})) {
        const site = placeSite(name, rule, sites, spec, random);

        if (!site) {
            return undefined;
        }

        sites[name] = site;
    }

    return sites;
}

function placeSite(name, rule, sites, spec, random) {
    const { width: mapWidth, height: mapHeight } = spec;
    const { width, height } = rule;
    const corner = rule.corner && chooseCorner(rule.corner, sites, random);
    const side = rule.edge && random.pick([...sites[rule.edge.beside].corner].map((letter) => ({ n: "north", s: "south", w: "west", e: "east" })[letter]));

    // A site in a corner, against one of its edges
    const touching = corner && rule.touch && random.pick([corner.includes("w") ? "west" : "east", corner.includes("n") ? "north" : "south"]);

    for (let sample = 0; sample < 60; sample++) {
        let x;
        let y;

        if (corner) {
            const [minInset, maxInset] = rule.inset ?? [0, 3];
            const insetX = touching === "west" || touching === "east" ? 0 : random.int(minInset, maxInset);
            const insetY = touching === "north" || touching === "south" ? 0 : random.int(minInset, maxInset);

            x = corner.includes("w") ? insetX : mapWidth - width - insetX;
            y = corner.includes("n") ? insetY : mapHeight - height - insetY;
        } else if (side) {
            const beside = sites[rule.edge.beside];
            const along = random.int(...(rule.edge.along ?? [2, 10]));

            if (side === "north" || side === "south") {
                y = side === "north" ? 0 : mapHeight - height;
                x = beside.corner.includes("w") ? beside.x + beside.width + along : beside.x - along - width;
            } else {
                x = side === "west" ? 0 : mapWidth - width;
                y = beside.corner.includes("n") ? beside.y + beside.height + along : beside.y - along - height;
            }
        } else if (rule.between) {
            const [a, b] = rule.between.map((other) => sites[other]);
            const t = random.range(...(rule.at ?? [0.5, 0.5]));
            const offset = random.range(...(rule.offset ?? [0, 0]));
            const dx = b.cx - a.cx;
            const dy = b.cy - a.cy;

            x = Math.round(a.cx + dx * t - dy * offset - width / 2);
            y = Math.round(a.cy + dy * t + dx * offset - height / 2);
        } else {
            x = random.int(0, mapWidth - width);
            y = random.int(0, mapHeight - height);
        }

        x = Math.max(0, Math.min(mapWidth - width, x));
        y = Math.max(0, Math.min(mapHeight - height, y));

        const site = makeSite(name, x, y, width, height, mapWidth, mapHeight, corner, side ?? touching);

        if (fits(site, rule, sites)) {
            return site;
        }
    }

    return undefined;
}

function chooseCorner(rule, sites, random) {
    if (rule === "any") {
        return random.pick(["nw", "ne", "se", "sw"]);
    }

    if (rule.opposite) {
        return OPPOSITE_CORNER[sites[rule.opposite].corner];
    }

    // A corner along an edge from another site's corner (not taken by any site in a corner)
    const taken = new Set(Object.values(sites).filter((site) => site.inCorner).map((site) => site.corner));
    const options = NEIGHBOUR_CORNERS[sites[rule.beside].corner].filter((corner) => !taken.has(corner));

    return random.pick(options.length ? options : NEIGHBOUR_CORNERS[sites[rule.beside].corner]);
}

/** A site: a rectangle of tiles with its centre, and which corner of the map it is towards. */
export function makeSite(name, x, y, width, height, mapWidth, mapHeight, corner, side) {
    const cx = x + width / 2;
    const cy = y + height / 2;

    return {
        name, x, y, width, height, cx, cy,
        // Placed in this corner, or else the quarter of the map it is in
        corner: corner ?? `${cy < mapHeight / 2 ? "n" : "s"}${cx < mapWidth / 2 ? "w" : "e"}`,
        inCorner: Boolean(corner),
        // The map edge it touches, if it was placed on one
        side,
        mapWidth,
        mapHeight,
    };
}

function fits(site, rule, sites) {
    const gap = rule.gap ?? 2;

    for (const other of Object.values(sites)) {
        const apart = site.x >= other.x + other.width + gap || other.x >= site.x + site.width + gap
            || site.y >= other.y + other.height + gap || other.y >= site.y + site.height + gap;

        if (!apart) {
            return false;
        }
    }

    for (const [name, distance] of Object.entries(rule.awayFrom ?? {})) {
        const other = sites[name];

        if ((site.cx - other.cx) ** 2 + (site.cy - other.cy) ** 2 < distance * distance) {
            return false;
        }
    }

    return true;
}

/* Terrain, on the grid of tile corners */

class Corners {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        // One more corner than tiles in each direction
        this.terrain = new Uint8Array((width + 1) * (height + 1));
        this.protected = new Uint8Array((width + 1) * (height + 1));
    }

    index(x, y) {
        return y * (this.width + 1) + x;
    }

    inside(x, y) {
        return x >= 0 && y >= 0 && x <= this.width && y <= this.height;
    }

    get(x, y) {
        return this.terrain[this.index(x, y)];
    }

    // Keep terrain off the corners of the tiles from (x1, y1) up to (x2, y2)
    protect(x1, y1, x2, y2) {
        for (let y = Math.max(0, y1); y <= Math.min(this.height, y2); y++) {
            for (let x = Math.max(0, x1); x <= Math.min(this.width, x2); x++) {
                this.protected[this.index(x, y)] = 1;
            }
        }
    }

    // Paint terrain at a corner, unless it's protected or next to a different kind of terrain
    paint(x, y, terrain) {
        if (!this.inside(x, y) || this.protected[this.index(x, y)]) {
            return;
        }

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (this.inside(x + dx, y + dy)) {
                    const other = this.get(x + dx, y + dy);

                    if (other !== GRASS && other !== terrain) {
                        return;
                    }
                }
            }
        }

        this.terrain[this.index(x, y)] = terrain;
    }

    // The terrain at the corners of tile (x, y), clockwise from the top left, as letters
    signature(x, y) {
        return TERRAIN_LETTERS[this.get(x, y)] + TERRAIN_LETTERS[this.get(x + 1, y)]
            + TERRAIN_LETTERS[this.get(x + 1, y + 1)] + TERRAIN_LETTERS[this.get(x, y + 1)];
    }

    /**
     * Trim terrain back until every tile has a matching tile in the tileset. Only ever removes
     * terrain, so it can't close a route that is already open.
     */
    repair() {
        for (let changed = true; changed;) {
            changed = false;

            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (!TILES_BY_CORNERS.has(this.signature(x, y))) {
                        this.#trim(x, y);
                        changed = true;
                    }
                }
            }
        }
    }

    // Remove one corner of terrain from tile (x, y): one whose removal leaves a valid tile if
    // possible, preferring the least surrounded (so that thin spikes go first)
    #trim(x, y) {
        const tileCorners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].filter(([cx, cy]) => this.get(cx, cy) !== GRASS);
        const kinds = new Set(tileCorners.map(([cx, cy]) => this.get(cx, cy)));

        let candidates = tileCorners;

        if (kinds.size > 1) {
            // Two kinds of terrain in one tile: remove the rarer one
            const count = (kind) => tileCorners.filter(([cx, cy]) => this.get(cx, cy) === kind).length;
            const rarest = [...kinds].sort((a, b) => count(a) - count(b))[0];

            candidates = tileCorners.filter(([cx, cy]) => this.get(cx, cy) === rarest);
        }

        const surrounded = ([cx, cy]) => {
            let count = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    count += this.inside(cx + dx, cy + dy) && this.get(cx + dx, cy + dy) !== GRASS ? 1 : 0;
                }
            }

            return count;
        };

        candidates.sort((a, b) => surrounded(a) - surrounded(b) || a[1] - b[1] || a[0] - b[0]);

        const fixes = candidates.find(([cx, cy]) => {
            const kind = this.get(cx, cy);

            this.terrain[this.index(cx, cy)] = GRASS;

            const valid = TILES_BY_CORNERS.has(this.signature(x, y));

            this.terrain[this.index(cx, cy)] = kind;

            return valid;
        });
        const [cx, cy] = fixes ?? candidates[0];

        this.terrain[this.index(cx, cy)] = GRASS;
    }

    // Clear terrain from a three tile wide passage along a route of tiles
    carve(route) {
        for (const [x, y] of route) {
            for (let cy = y - 1; cy <= y + 2; cy++) {
                for (let cx = x - 1; cx <= x + 2; cx++) {
                    if (this.inside(cx, cy)) {
                        this.terrain[this.index(cx, cy)] = GRASS;
                    }
                }
            }
        }
    }
}

// A blob of terrain: an ellipse with a ragged edge
function paintBlob(corners, terrain, cx, cy, rx, ry, roughness, seed) {
    for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) {
        for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
            const distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            const edge = 1 + (noise(x, y, seed, 3, 2) - 0.5) * 2 * roughness;

            if (distance < edge * edge) {
                corners.paint(x, y, terrain);
            }
        }
    }
}

// A river: a winding band of water from one edge of the map part of the way across
function paintRiver(corners, random) {
    const { width, height } = corners;
    const side = random.int(0, 3);
    let x = side === 0 ? 0 : side === 1 ? width : random.int(4, width - 4);
    let y = side === 2 ? 0 : side === 3 ? height : random.int(4, height - 4);
    // Heading into the map: east, west, south or north
    let heading = [0, 8, 4, 12][side];
    const length = random.int(Math.floor(Math.min(width, height) * 0.5), Math.floor(Math.max(width, height) * 0.7));
    const radius = random.range(0.8, 1.6);

    for (let step = 0; step < length; step++) {
        const r = radius + random.range(-0.3, 0.5);

        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                if (dx * dx + dy * dy <= r * r) {
                    corners.paint(Math.round(x) + dx, Math.round(y) + dy, WATER);
                }
            }
        }

        // Wander, but keep heading roughly the same way
        if (random.chance(0.35)) {
            heading = (heading + random.pick([-1, 1]) + 16) % 16;
        }

        const start = [0, 8, 4, 12][side];
        const drift = (heading - start + 24) % 16 - 8;

        if (Math.abs(drift) > 3) {
            heading = (heading - Math.sign(drift) + 16) % 16;
        }

        x += DIRECTIONS[heading][0];
        y += DIRECTIONS[heading][1];
    }
}

function paintTerrain(corners, terrain, random) {
    const { width, height } = corners;
    const count = (range) => (range ? random.int(range[0], range[1]) : 0);
    const seed = () => random.int(0, 1 << 30);

    for (let i = count(terrain.lava); i > 0; i--) {
        // Lava fields are large, and often run off the edge of the map
        const rx = random.range(3, 7);
        const ry = random.range(2.5, 5);
        const onEdge = random.chance(0.6);
        const cx = onEdge && random.chance(0.5) ? random.pick([0, width]) : random.range(4, width - 4);
        const cy = onEdge && !(cx === 0 || cx === width) ? random.pick([0, height]) : random.range(4, height - 4);

        paintBlob(corners, LAVA, cx, cy, rx, ry, 0.35, seed());
    }

    for (let i = count(terrain.rivers); i > 0; i--) {
        paintRiver(corners, random);
    }

    for (let i = count(terrain.lakes); i > 0; i--) {
        // Some lakes are tiny ponds
        const pond = random.chance(0.3);
        const rx = pond ? random.range(0.6, 1.2) : random.range(1.8, 5);
        const ry = pond ? rx : random.range(1.8, 4.5);

        paintBlob(corners, WATER, random.range(2, width - 2), random.range(2, height - 2), rx, ry, 0.4, seed());
    }

    for (let i = count(terrain.pits); i > 0; i--) {
        paintBlob(corners, PIT, random.range(3, width - 3), random.range(3, height - 3), random.range(1, 2.6), random.range(0.8, 1.8), 0.3, seed());
    }
}

/* Tiles */

class TileMap {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.tiles = new Int16Array(width * height);
        // 1 where units can't go
        this.blocked = new Uint8Array(width * height);
        // Obstacles, which stay when the terrain tiles are chosen again
        this.obstacles = new Map();
    }

    chooseTiles(corners, random) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const signature = corners.signature(x, y);
                const choice = random.pickWeighted(TILES_BY_CORNERS.get(signature), (tile) => tile.count);

                this.tiles[y * this.width + x] = choice.id;
                this.blocked[y * this.width + x] = signature === "GGGG" ? 0 : 1;
            }
        }

        for (const [index, { tile, blocked }] of this.obstacles) {
            this.tiles[index] = tile;
            this.blocked[index] = blocked;
        }
    }

    isOpen(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height && !this.blocked[y * this.width + x];
    }

    // Groups of places where a two by two tile vehicle fits, numbered; 0 where one doesn't fit
    wideAreas() {
        const labels = new Int32Array(this.width * this.height);
        const fits = (x, y) => this.isOpen(x, y) && this.isOpen(x + 1, y) && this.isOpen(x, y + 1) && this.isOpen(x + 1, y + 1);
        let next = 0;

        for (let y = 0; y < this.height - 1; y++) {
            for (let x = 0; x < this.width - 1; x++) {
                if (labels[y * this.width + x] || !fits(x, y)) {
                    continue;
                }

                next++;
                labels[y * this.width + x] = next;

                const queue = [[x, y]];

                while (queue.length) {
                    const [qx, qy] = queue.pop();

                    for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) {
                        if (nx >= 0 && ny >= 0 && nx < this.width - 1 && ny < this.height - 1 && !labels[ny * this.width + nx] && fits(nx, ny)) {
                            labels[ny * this.width + nx] = next;
                            queue.push([nx, ny]);
                        }
                    }
                }
            }
        }

        return labels;
    }

    // The groups of wide open space inside a site
    #areasIn(site, labels) {
        const areas = new Set();

        for (let y = site.y; y < site.y + site.height - 1; y++) {
            for (let x = site.x; x < site.x + site.width - 1; x++) {
                if (labels[y * this.width + x]) {
                    areas.add(labels[y * this.width + x]);
                }
            }
        }

        return areas;
    }

    /** Can a vehicle drive from one site to the other, through gaps at least two tiles wide? */
    connected(a, b, labels = this.wideAreas()) {
        const areasOfB = this.#areasIn(b, labels);

        return [...this.#areasIn(a, labels)].some((area) => areasOfB.has(area));
    }

    /** The cheapest route of tiles between two sites' centres, where crossing terrain costs more. */
    cheapestRoute(a, b) {
        const start = [Math.floor(a.cx), Math.floor(a.cy)];
        const end = [Math.floor(b.cx), Math.floor(b.cy)];
        const size = this.width * this.height;
        const cost = new Float64Array(size).fill(Infinity);
        const from = new Int32Array(size).fill(-1);
        const heap = new MinHeap();
        const startIndex = start[1] * this.width + start[0];
        const endIndex = end[1] * this.width + end[0];

        cost[startIndex] = 0;
        heap.push(startIndex, 0);

        while (heap.size) {
            const index = heap.pop();

            if (index === endIndex) {
                break;
            }

            const x = index % this.width;
            const y = (index - x) / this.width;

            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
                if (nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) {
                    continue;
                }

                const next = ny * this.width + nx;
                // Obstacles can't be cut through; terrain can, at a price
                const step = this.obstacles.has(next) ? 1000 : this.blocked[next] ? 8 : 1;

                if (cost[index] + step < cost[next]) {
                    cost[next] = cost[index] + step;
                    from[next] = index;
                    heap.push(next, cost[next]);
                }
            }
        }

        const route = [];

        for (let index = endIndex; index !== -1; index = from[index]) {
            route.push([index % this.width, Math.floor(index / this.width)]);
        }

        return route.reverse();
    }

    rows(values) {
        return Array.from({ length: this.height }, (_, y) => Array.from(values.subarray(y * this.width, (y + 1) * this.width)));
    }
}

class MinHeap {
    #items = [];

    get size() {
        return this.#items.length;
    }

    push(value, priority) {
        const items = this.#items;

        items.push([priority, value]);

        for (let i = items.length - 1; i > 0;) {
            const parent = (i - 1) >> 1;

            if (items[parent][0] <= items[i][0]) {
                break;
            }

            [items[parent], items[i]] = [items[i], items[parent]];
            i = parent;
        }
    }

    pop() {
        const items = this.#items;
        const [, top] = items[0];
        const last = items.pop();

        if (items.length) {
            items[0] = last;

            for (let i = 0; ;) {
                const left = i * 2 + 1;
                const right = left + 1;
                let smallest = i;

                if (left < items.length && items[left][0] < items[smallest][0]) {
                    smallest = left;
                }

                if (right < items.length && items[right][0] < items[smallest][0]) {
                    smallest = right;
                }

                if (smallest === i) {
                    break;
                }

                [items[smallest], items[i]] = [items[i], items[smallest]];
                i = smallest;
            }
        }

        return top;
    }
}

/* Obstacles */

function placeObstacles(map, sites, connections, range, random) {
    const count = random.int(range[0], range[1]);
    const keepClear = new Uint8Array(map.width * map.height);

    // Not on the sites or right next to them
    for (const site of Object.values(sites)) {
        for (let y = Math.max(0, site.y - 1); y < Math.min(map.height, site.y + site.height + 1); y++) {
            for (let x = Math.max(0, site.x - 1); x < Math.min(map.width, site.x + site.width + 1); x++) {
                keepClear[y * map.width + x] = 1;
            }
        }
    }

    for (let placed = 0, tries = 0; placed < count && tries < count * 20; tries++) {
        const stamp = random.pickWeighted(STAMPS, (candidate) => candidate.count);
        const left = random.int(0, map.width - stamp.width);
        const top = random.int(0, map.height - stamp.height);
        const cells = [];
        let free = true;

        // Only on open grass, with a tile of grass around it
        for (let y = top - 1; y <= top + stamp.height && free; y++) {
            for (let x = left - 1; x <= left + stamp.width && free; x++) {
                const inside = x >= left && y >= top && x < left + stamp.width && y < top + stamp.height;

                if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
                    free = !inside;
                } else if (!map.isOpen(x, y) || map.obstacles.has(y * map.width + x) || (inside && keepClear[y * map.width + x])) {
                    free = false;
                } else if (inside && stamp.blocked[y - top][x - left]) {
                    cells.push([y * map.width + x, stamp.tiles[y - top][x - left] ?? TILESET.grass]);
                }
            }
        }

        if (!free) {
            continue;
        }

        for (const [index, tile] of cells) {
            map.obstacles.set(index, { tile, blocked: 1 });
            map.tiles[index] = tile;
            map.blocked[index] = 1;
        }

        // Take it away again if it cuts a route between sites
        const labels = map.wideAreas();

        if (connections.every(([a, b]) => map.connected(a, b, labels))) {
            placed++;
        } else {
            for (const [index] of cells) {
                map.obstacles.delete(index);
                map.tiles[index] = TILESET.grass;
                map.blocked[index] = 0;
            }
        }
    }
}

/* Checks */

function check(map, sites, connections) {
    // Every tile is a real tile
    if (map.tiles.some((tile) => tile < 0 || tile >= TILESET.tiles.length)) {
        return false;
    }

    // Every site is open ground
    for (const site of Object.values(sites)) {
        for (let y = site.y; y < site.y + site.height; y++) {
            for (let x = site.x; x < site.x + site.width; x++) {
                if (!map.isOpen(x, y)) {
                    return false;
                }
            }
        }
    }

    // Every route is open and wide enough, and the game's own path finding finds it
    const labels = map.wideAreas();
    const grid = map.rows(map.blocked);

    return connections.every(([a, b]) => map.connected(a, b, labels)
        && findPath(grid, [Math.floor(a.cx), Math.floor(a.cy)], [Math.floor(b.cx), Math.floor(b.cy)]).length > 0);
}
