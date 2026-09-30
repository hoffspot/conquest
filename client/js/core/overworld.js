// The world outside: all 8 kilometres of it (worldplan/plan.js lays it out), on 1-metre squares
// like the town's, made a chunk (CHUNK metres square) at a time as it's needed, and the same
// every time it's made again. The town (world.js) is set into it where a player of their people
// starts (a town near their capital), its streets carrying on along the plan's roads; every other
// settlement (settlements.js) is laid out as the world near it is first made, and set in the same
// way, the plan's roads carried on from its streets' ends.
//
// Each square of a chunk comes from the plan's cell under it (CELL metres square):
//
// - Lakes and the sea, their shores blended from cell to cell and a little ragged.
// - Rivers: a line from each river cell to the one it runs into, wandering, wider the more water
//   runs in them; where a road crosses one, a bridge: a straight deck along the road from bank to
//   bank, a little onto each.
// - Roads: along the plan's roads (smoothed from cell to cell), a trade road widest, a track
//   narrowest.
// - The ground: grass (drawn in each land's colours: world/chunks3d.js), soil in the fields of
//   farmland, road, and planks on bridges.
// - Trees, as many as the land has (woods thick with them, meadows few, beaches none), of the
//   kinds that grow there; clear of roads and water, and of the settlements, sites and camps
//   still to be built.
//
// Water can't be walked into; trees block their squares and can't be seen through. Nothing here
// uses Three.js, so it runs in Node too.

import { MAP_ORIGINS } from "./interiors.js";
import { createRandom, noise } from "./random.js";
import { Settlements, squareOf, waysOut } from "./settlements.js";
import { Sites } from "./sites.js";
import { Interiors } from "./insides.js";
import { WENCHES } from "./lore/taverns.js";
import { featuresOf } from "./wilds.js";
import { watersOf } from "./terrain/waters.js";
import { GROUND, HOME_TREES, TREE_KINDS } from "./setpieces/pieces.js";
import { generateWorld } from "./world.js";
import { BIOME, BIOMES, CELL, CELLS, CHUNK, CHUNKS, planWorld, RACES, startFor, WORLD_SIZE } from "./worldplan/plan.js";
import { hypot } from "./exact.js";

export { CHUNK, CHUNKS, WORLD_SIZE };

/** A chunk's squares, and each square's index in them: (y - y0) * CHUNK + (x - x0). */
export const SQUARES = CHUNK * CHUNK;

/** What's in a chunk's `water`: none, still water (a lake or the sea), a river. */
export const WET = Object.freeze({ none: 0, still: 1, river: 2 });

/**
 * The trees of each kind of land: how many to 100 square metres, and of which kinds (as likely as
 * each other: listed twice, twice as likely).
 */
export const FLORA = Object.freeze({
    sea: { density: 0, kinds: [] },
    lake: { density: 0, kinds: [] },
    beach: { density: 0, kinds: [] },
    farmland: { density: 0.12, kinds: ["oak", "apple", "poplar", "beech"] },
    meadow: { density: 0.25, kinds: ["oak", "beech", "birch", "apple"] },
    woods: { density: 0.9, kinds: ["oak", "beech", "birch", "oak"] },
    heath: { density: 0.35, kinds: ["birch", "pine", "birch"] },
    marsh: { density: 0.6, kinds: ["birch", "poplar", "birch"] },
    elfwood: { density: 1, kinds: ["beech", "birch", "beech", "oak"] },
    darkwood: { density: 1.1, kinds: ["spruce", "pine", "spruce"] },
    savannah: { density: 0.18, kinds: ["apple", "oak"] },
    jungle: { density: 1.2, kinds: ["beech", "oak", "poplar"] },
    badlands: { density: 0.04, kinds: ["pine"] },
    volcanic: { density: 0.02, kinds: ["pine"] },
    tundra: { density: 0.4, kinds: ["spruce", "birch", "pine"] },
    snow: { density: 0.08, kinds: ["spruce"] },
    mountain: { density: 0.3, kinds: ["pine", "spruce"] },
});

// How many of the trees in a people's homeland are their own kind (HOME_TREES)
const HOME_TREE_SHARE = 0.7;

// Roads' half-widths (metres), by kind
const ROAD_HALF = Object.freeze({ trade: 2.2, road: 1.8, track: 1.1 });

/**
 * Bridges: how far past the road's edge the deck reaches each side (metres), and how far onto
 * each bank; a road's crossings closer together than `join` metres are one bridge. Looked for
 * every `step` metres along the road.
 */
export const BRIDGE = Object.freeze({ wider: 0.4, banks: 1.5, join: 3, step: 0.5 });

// Trees: tried every TREE_GRID metres (and a random way in); how far (squares) they keep from
// roads and water; how far (metres) from the town, and from the edges of the settlements, sites
// and camps still to be built
const TREE_GRID = 4;
const TREE_CLEAR = 2;
const CLEAR_OF_TOWN = 3;
const CLEAR_OF_PLACES = 12;

// How many chunks to keep once made (the rest are made again when they're needed)
const KEEP = 256;

const VARIANTS_OF = Object.fromEntries([...new Set(TREE_KINDS.map(([kind]) => kind))].map((kind) => [kind, TREE_KINDS.flatMap(([k], variant) => (k === kind ? [variant] : []))]));

const cellAt = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor(v / CELL)));
const inside = (x, y) => x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;

// How far a point is from a line segment
function fromSegment(px, py, [ax, ay, bx, by]) {
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));

    return hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// A line through cells' middles, rounded at its corners (twice cut in, keeping its ends)
function smooth(points) {
    let line = points;

    for (let pass = 0; pass < 2 && line.length > 2; pass++) {
        const next = [line[0]];

        for (let k = 0; k < line.length - 1; k++) {
            const [[ax, ay], [bx, by]] = [line[k], line[k + 1]];

            next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
        }

        next.push(line.at(-1));
        line = next;
    }

    return line;
}

/**
 * The world outside, on 1-metre squares, made a chunk at a time: a map (as the battle reads maps:
 * grid.js) whose squares are its `squares`.
 */
export class Overworld {
    /**
     * @param {object} options
     * @param {object} options.plan - The world plan (worldplan/plan.js planWorld).
     * @param {object} options.stamp - The town set into it: { at: [x, y] (its north-west square),
     *   width, height, blocked, opaque, ground (its rows) }.
     * @param {object} options.start - The plan's settlement the town stands for.
     */
    constructor({ plan, stamp, start }) {
        this.id = "town";
        this.name = "The world";
        this.width = WORLD_SIZE;
        this.height = WORLD_SIZE;
        this.origin = MAP_ORIGINS.town;
        this.plan = plan;
        this.stamp = stamp;
        this.start = start;
        this.chunks = new Map();
        this.waters = watersOf(plan);
        this.last = null;

        // The places trees keep clear of: the settlements (but the town, which is set in), the
        // sites and the camps
        // (Each people's castle and special places, set down as the world near them is made:
        // their clearings growing to their size, where they're set)
        this.sites = new Sites(plan, { landAt: (x, y) => this.landAt(x, y), clearing: CLEAR_OF_PLACES });
        this.clearings = [
            ...plan.places.filter((place) => place !== start).map(({ at, radius }) => ({ at, radius: radius + CLEAR_OF_PLACES })),
            ...plan.sites.map(({ id }) => this.sites.clearings.get(id)),
            ...plan.camps.map(({ at }) => ({ at, radius: CLEAR_OF_PLACES })),
        ];
        // The other settlements, laid out as the world near them is made (their roads then joined
        // to their streets' ends: roads to them wait for that, `waiting`, by place)
        this.waiting = new Map();
        this.settlements = new Settlements(plan, {
            skip: start,
            onLaid: (settlement) => {
                this.#join(settlement);
                this.#enter(settlement);
            },
        });
        this.roads = this.#layRoads();
        this.bridges = new Map();

        const read = (layer, off) => (x, y) => {
            if (!inside(x, y)) {
                return off;
            }

            const chunk = this.chunkAt(x, y);

            return chunk[layer][(y - chunk.y0) * CHUNK + (x - chunk.x0)];
        };
        const blocked = read("blocked", 1);
        const opaque = read("opaque", 1);

        /** Its squares, as grid.js reads them. */
        this.squares = {
            width: WORLD_SIZE,
            height: WORLD_SIZE,
            blocked: (x, y) => blocked(x, y) === 1,
            opaque: (x, y) => opaque(x, y) === 1,
            ground: read("ground", GROUND.grass),
        };
    }

    /** The chunk a square is in (made if need be). */
    chunkAt(x, y) {
        return this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    }

    /**
     * A chunk (cx, cy: chunks from the world's north-west corner): { cx, cy, x0, y0 (its
     * north-west square), blocked, opaque, ground, water (WET), bridge (Uint8Array, a square
     * each: under a bridge's deck), trees ([{ x, y (a trunk's point, where four squares meet),
     * variant, size, turn }]), bridges (those whose middles are in it: [{ a, b ([x, y] metres:
     * its deck's ends, along the road), half (its deck's half-width) }]), walks (the plank walks
     * over a settlement's lagoon whose middles are in it, the same way), town (whether the town's
     * in it) }.
     */
    chunk(cx, cy) {
        const last = this.last;

        if (last && last.cx === cx && last.cy === cy) {
            return last;
        }

        const key = cy * CHUNKS + cx;
        let chunk = this.chunks.get(key);

        if (chunk) {
            // (Most recently used last, for letting go of the oldest)
            this.chunks.delete(key);
        } else {
            chunk = this.#make(cx, cy);

            if (this.chunks.size >= KEEP) {
                this.chunks.delete(this.chunks.keys().next().value);
            }
        }

        this.chunks.set(key, chunk);
        this.last = chunk;

        return chunk;
    }

    /** The land (BIOMES id) at a point (metres). */
    biomeAt(x, y) {
        return BIOMES[this.plan.biome[cellAt(y) * CELLS + cellAt(x)]].id;
    }

    /**
     * Whose homeland a square is (a people's id: the plan's territory, as it was first claimed,
     * whoever holds it now), or null in the wild between them.
     */
    homeAt(x, y) {
        const owner = this.plan.territory[cellAt(y) * CELLS + cellAt(x)];

        return owner ? RACES[owner - 1].id : null;
    }

    /**
     * Keep the buildings that can be gone into (insides.js Interiors) told of each settlement's as
     * it's laid out (and of those laid out already).
     */
    attach(interiors) {
        this.interiors = interiors;

        for (const settlement of this.settlements.laid.values()) {
            this.#enter(settlement);
        }
    }

    // A settlement's buildings that can be gone into, added to the interiors
    #enter(settlement) {
        for (const piece of settlement.town.pieces) {
            if (piece.kind === "landmark") {
                this.interiors?.add(piece, { origin: settlement.at, place: settlement.place.id, people: settlement.place.race });
            }
        }
    }

    /**
     * Whether a square is in a town or settlement (inside its edge, or on its streets, buildings
     * or yards), not out in its fields or the land.
     */
    settled(x, y) {
        const { middle, radius } = this.stamp;

        if (middle && this.inTown(x, y) && hypot(x + 0.5 - middle[0], y + 0.5 - middle[1]) < radius) {
            return true;
        }

        const settlement = this.settlements.at(x, y);

        return Boolean(settlement && this.settlements.squareAt(settlement, x, y));
    }

    /** Whether a square is in the town. */
    inTown(x, y) {
        const { at, width, height } = this.stamp;

        return x >= at[0] && y >= at[1] && x < at[0] + width && y < at[1] + height;
    }

    // --- Making a chunk ---

    #make(cx, cy) {
        const [x0, y0] = [cx * CHUNK, cy * CHUNK];
        const blocked = new Uint8Array(SQUARES);
        const opaque = new Uint8Array(SQUARES);
        const ground = new Uint8Array(SQUARES);
        const water = new Uint8Array(SQUARES);
        const bridge = new Uint8Array(SQUARES);
        const { stamp } = this;
        const settled = this.settlements.settle(cx, cy);
        let town = false;

        this.sites.settle(cx, cy);

        for (let j = 0; j < CHUNK; j++) {
            for (let i = 0; i < CHUNK; i++) {
                const [x, y] = [x0 + i, y0 + j];
                const k = j * CHUNK + i;

                if (this.inTown(x, y)) {
                    const [tx, ty] = [x - stamp.at[0], y - stamp.at[1]];

                    blocked[k] = stamp.blocked[ty][tx];
                    opaque[k] = stamp.opaque[ty][tx];
                    ground[k] = stamp.ground[ty][tx];
                    water[k] = stamp.water?.[ty]?.[tx] ? WET.still : WET.none;
                    town = true;
                    continue;
                }

                // (A settlement's streets, buildings and yards, where it has them)
                const own = settled.length ? this.#settledAt(settled, x, y) : null;

                if (own) {
                    blocked[k] = own.blocked;
                    opaque[k] = own.opaque;
                    ground[k] = own.ground;
                    water[k] = own.water ? WET.still : WET.none;
                    continue;
                }

                const land = this.landAt(x, y);

                ground[k] = land.ground;
                water[k] = land.water;
                bridge[k] = land.bridge ? 1 : 0;
                blocked[k] = land.water && !land.bridge ? 1 : 0;

                // (A castle's, or a people's own place's: what's built there stands on it)
                if (this.sites.squareAt(x, y)) {
                    blocked[k] = 1;
                    opaque[k] = 1;
                }
            }
        }

        const inChunk = ({ a, b }) => Math.floor((a[0] + b[0]) / 2 / CHUNK) === cx && Math.floor((a[1] + b[1]) / 2 / CHUNK) === cy;
        const bridges = this.#bridgesNear(cx, cy).filter(inChunk);
        // (And the plank walks over a lagoon, the lizard folk's: the town's, and each settlement's)
        const walks = [...(stamp?.walks ?? []).filter(inChunk), ...this.settlements.walksIn(cx, cy)];
        const chunk = { cx, cy, x0, y0, blocked, opaque, ground, water, bridge, trees: [], bridges, walks, town };

        this.#plant(chunk);
        chunk.features = this.#features(chunk);

        // The settlements' own trees (their squares are blocked already)
        for (const piece of this.settlements.piecesIn(cx, cy).filter(({ kind }) => kind === "tree")) {
            const random = createRandom(Math.round(piece.x * 73 + piece.y * 37));

            chunk.trees.push({ x: Math.round(piece.x), y: Math.round(piece.y), variant: piece.variant, size: random.range(0.85, 1.05), turn: random.next() * Math.PI * 2 });
        }

        return chunk;
    }

    // What a laid-out settlement near has on a square (settlements.js squareAt), or null
    #settledAt(settled, x, y) {
        for (const settlement of settled) {
            const own = this.settlements.squareAt(settlement, x, y);

            if (own) {
                return own;
            }
        }

        return null;
    }

    // Join the roads waiting on a settlement just laid out to its streets' ends: each from the end
    // nearest where it comes in (those chunks aren't made yet: they're within a chunk of it)
    #join(settlement) {
        const exits = settlement.town.exits.map(([x, y]) => [x + settlement.at[0], y + settlement.at[1]]);

        for (const line of this.waiting.get(settlement.place.id) ?? []) {
            const end = line.ends[settlement.place.id];
            const from = end === "start" ? line.points[0] : line.points.at(-1);

            if (!exits.length) {
                continue;
            }

            const exit = exits.reduce((best, e) => (hypot(e[0] - from[0], e[1] - from[1]) < hypot(best[0] - from[0], best[1] - from[1]) ? e : best));

            if (end === "start") {
                line.points.unshift(exit);
            } else {
                line.points.push(exit);
            }

            this.#index(line, end === "start" ? [exit, from] : [from, exit]);
        }

        this.waiting.delete(settlement.place.id);
    }

    // List a road's segment [a, b] by the chunks it passes through (one joined to a settlement's
    // street: marked so, for #bridgesNear)
    #index(line, [a, b]) {
        const segment = [...a, ...b, line.kind, line, true];
        const pad = ROAD_HALF[line.kind] + 1;
        const [cx0, cx1] = [Math.floor((Math.min(segment[0], segment[2]) - pad) / CHUNK), Math.floor((Math.max(segment[0], segment[2]) + pad) / CHUNK)];
        const [cy0, cy1] = [Math.floor((Math.min(segment[1], segment[3]) - pad) / CHUNK), Math.floor((Math.max(segment[1], segment[3]) + pad) / CHUNK)];

        for (let cy = cy0; cy <= cy1; cy++) {
            for (let cx = cx0; cx <= cx1; cx++) {
                const key = cy * CHUNKS + cx;

                if (!this.roads.has(key)) {
                    this.roads.set(key, []);
                }

                this.roads.get(key).push(segment);
            }
        }
    }

    /**
     * What a square outside the town is, from the plan alone: { ground (GROUND), water (WET),
     * bridge (under a bridge's deck), road (its kind, or null) }.
     */
    landAt(x, y) {
        const { plan } = this;
        const [px, py] = [x + 0.5, y + 0.5];
        const cell = cellAt(py) * CELLS + cellAt(px);
        const road = this.#roadAt(px, py);
        const river = this.waters.riverAt(px, py);
        const still = !river && this.waters.stillAt(px, py);
        const water = river ? WET.river : still ? WET.still : WET.none;

        // Under a bridge (over the river, or its ends on the banks)
        if (this.#bridgeAt(px, py)) {
            return { ground: GROUND.planks, water, bridge: true, road: road ?? "bridge" };
        }

        // (Roads go round lakes, and cross rivers only on bridges)
        if (water) {
            return { ground: GROUND.soil, water, bridge: false, road: null };
        }

        if (road) {
            return { ground: GROUND.road, water, bridge: false, road };
        }

        // Fields in farmland: soil, with strips of grass between
        const fields = plan.biome[cell] === BIOME.farmland && noise(x, y, plan.seed + 31, 14, 2) > 0.46;

        return { ground: fields ? GROUND.soil : GROUND.grass, water, bridge: false, road: null };
    }

    // Is a point under a bridge's deck?
    #bridgeAt(px, py) {
        return this.#bridgesNear(Math.floor(px / CHUNK), Math.floor(py / CHUNK)).some(({ a, b, half }) => {
            const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
            const length = hypot(dx, dy);
            const along = ((px - a[0]) * dx + (py - a[1]) * dy) / length;

            return along >= 0 && along <= length && Math.abs((px - a[0]) * dy - (py - a[1]) * dx) / length <= half;
        });
    }

    // The bridges that reach into a chunk (the roads' through it)
    #bridgesNear(cx, cy) {
        const key = cy * CHUNKS + cx;

        if (!this.bridges.has(key)) {
            const [x0, y0] = [cx * CHUNK, cy * CHUNK];
            // (The roads through it as planned: not those only joined in since, which depends on
            // which settlements have been laid out)
            const lines = new Set((this.roads.get(key) ?? []).filter((segment) => !segment[6]).map((segment) => segment[5]));
            const near = [...lines].flatMap((line) => this.#bridgesOf(line)).filter(({ a, b, half }) => Math.max(a[0], b[0]) + half >= x0 && Math.min(a[0], b[0]) - half < x0 + CHUNK && Math.max(a[1], b[1]) + half >= y0 && Math.min(a[1], b[1]) - half < y0 + CHUNK);
            const middle = ({ a, b }) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const kept = [];

            // (Where roads share their way over a river, one bridge: the widest; of those as
            // wide, the westernmost, then the northernmost, whatever order they were listed in)
            const order = (p, q) => q.half - p.half || middle(p)[0] - middle(q)[0] || middle(p)[1] - middle(q)[1];

            for (const bridge of near.sort(order)) {
                const [mx, my] = middle(bridge);

                if (!kept.some((other) => hypot(middle(other)[0] - mx, middle(other)[1] - my) < 2 * other.half)) {
                    kept.push(bridge);
                }
            }

            this.bridges.set(key, kept);
        }

        return this.bridges.get(key);
    }

    // A road's bridges: where it crosses rivers (looked for every BRIDGE.step metres along it),
    // each a straight deck from a little way onto one bank to a little way onto the other
    #bridgesOf(line) {
        if (!line.bridges) {
            const along = [];
            const points = line.planned;

            for (let k = 0; k < points.length - 1; k++) {
                const [[ax, ay], [bx, by]] = [points[k], points[k + 1]];
                const steps = Math.max(1, Math.ceil(hypot(bx - ax, by - ay) / BRIDGE.step));

                for (let j = k ? 1 : 0; j <= steps; j++) {
                    const [x, y] = [ax + ((bx - ax) * j) / steps, ay + ((by - ay) * j) / steps];

                    along.push({ at: [x, y], wet: this.waters.riverAt(x, y) });
                }
            }

            // Each run over a river (those nearly touching joined), and a little onto its banks
            const runs = [];

            along.forEach(({ wet }, k) => {
                if (!wet) {
                    return;
                }

                const last = runs.at(-1);

                if (last && (k - last[1]) * BRIDGE.step <= BRIDGE.join) {
                    last[1] = k;
                } else {
                    runs.push([k, k]);
                }
            });

            const banks = Math.round(BRIDGE.banks / BRIDGE.step);

            line.bridges = runs.map(([from, to]) => ({
                a: along[Math.max(0, from - banks)].at,
                b: along[Math.min(along.length - 1, to + banks)].at,
                half: ROAD_HALF[line.kind] + BRIDGE.wider,
            }));
        }

        return line.bridges;
    }

    // The kind of road at a point, or null
    #roadAt(px, py) {
        const near = this.roads.get(Math.floor(py / CHUNK) * CHUNKS + Math.floor(px / CHUNK));

        return near?.find((segment) => fromSegment(px, py, segment) <= ROAD_HALF[segment[4]])?.[4] ?? null;
    }

    // The roads, as lines ([ax, ay, bx, by, kind, the road they're part of]) listed by the chunks
    // they pass through; those from the town start at its streets' ends rather than its middle
    #layRoads() {
        const { plan, start } = this;
        const byChunk = new Map();
        const exits = this.#exits();
        const [sx, sy, sw, sh] = [this.stamp.at[0] - 10, this.stamp.at[1] - 10, this.stamp.width + 20, this.stamp.height + 20];
        const near = ([x, y]) => x >= sx && y >= sy && x < sx + sw && y < sy + sh;

        const places = new Map(plan.places.map((place) => [place.id, place]));

        for (const road of plan.roads) {
            let points = smooth(road.cells.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL]));
            const ends = {};

            // At another settlement, the road stops where it comes to the settlement's square,
            // and waits to be joined to its streets once it's laid out
            for (const [id, end] of [[road.from, "start"], [road.to, "end"]]) {
                const place = places.get(id);

                if (!place || place === start || !this.settlements.places.includes(place)) {
                    continue;
                }

                const { at, size } = squareOf(place);
                const outside = ([x, y]) => x < at[0] - 2 || y < at[1] - 2 || x >= at[0] + size + 2 || y >= at[1] + size + 2;
                const order = end === "start" ? points : [...points].reverse();
                const out = order.findIndex(outside);

                if (out < 0) {
                    points = [];
                    break;
                }

                const kept = order.slice(out);

                points = end === "start" ? kept : kept.reverse();
                ends[id] = [end, 0];
            }

            if (points.length < 2) {
                continue;
            }

            if (road.from === start.id || road.to === start.id) {
                // From the town's end: from where its nearest street leaves it, once clear of it
                // (turned round to start there, so the settlement at its other end is at its end)
                if (road.to === start.id) {
                    points = [...points].reverse();

                    for (const end of Object.values(ends)) {
                        end[0] = end[0] === "start" ? "end" : "start";
                    }
                }

                const out = points.findIndex((point) => !near(point));

                if (out < 0 || !exits.length) {
                    continue;
                }

                const exit = exits.reduce((best, e) => (hypot(e[0] - points[out][0], e[1] - points[out][1]) < hypot(best[0] - points[out][0], best[1] - points[out][1]) ? e : best));

                points = [exit, ...points.slice(out)];
            }

            // (Its bridges are found when a chunk it goes through is first made, on the road as
            // planned: `planned`, never the bit joined to a settlement's street when it's laid
            // out, so that they're the same whichever chunks are made first)
            const line = { points, planned: [...points], kind: road.kind, bridges: null, ends: {} };

            for (const [id, [end]] of Object.entries(ends)) {
                line.ends[id] = end;

                if (!this.waiting.has(id)) {
                    this.waiting.set(id, []);
                }

                this.waiting.get(id).push(line);
            }

            for (let k = 0; k < points.length - 1; k++) {
                const segment = [...points[k], ...points[k + 1], road.kind, line];
                const pad = ROAD_HALF[road.kind] + 1;
                const [cx0, cx1] = [Math.floor((Math.min(segment[0], segment[2]) - pad) / CHUNK), Math.floor((Math.max(segment[0], segment[2]) + pad) / CHUNK)];
                const [cy0, cy1] = [Math.floor((Math.min(segment[1], segment[3]) - pad) / CHUNK), Math.floor((Math.max(segment[1], segment[3]) + pad) / CHUNK)];

                for (let cy = cy0; cy <= cy1; cy++) {
                    for (let cx = cx0; cx <= cx1; cx++) {
                        const key = cy * CHUNKS + cx;

                        if (!byChunk.has(key)) {
                            byChunk.set(key, []);
                        }

                        byChunk.get(key).push(segment);
                    }
                }
            }
        }

        return byChunk;
    }

    // Where the town's streets leave it (metres: the middle of each at its edge)
    #exits() {
        const { at, width, height, ground } = this.stamp;
        const exits = [];
        const runs = (length, isRoad, place) => {
            let from = -1;

            for (let k = 0; k <= length; k++) {
                if (k < length && isRoad(k)) {
                    from = from < 0 ? k : from;
                } else if (from >= 0) {
                    exits.push(place((from + k) / 2));
                    from = -1;
                }
            }
        };

        runs(height, (k) => ground[k][0] === GROUND.road, (m) => [at[0], at[1] + m]);
        runs(height, (k) => ground[k][width - 1] === GROUND.road, (m) => [at[0] + width, at[1] + m]);
        runs(width, (k) => ground[0][k] === GROUND.road, (m) => [at[0] + m, at[1]]);
        runs(width, (k) => ground[height - 1][k] === GROUND.road, (m) => [at[0] + m, at[1] + height]);

        return exits;
    }

    // Trees in a chunk: tried every TREE_GRID metres, as many as its land has, clear of roads,
    // water, the town and the places still to be built; each trunk where four squares meet, the
    // four in the chunk, and filling them
    #plant(chunk) {
        const { plan, stamp } = this;
        const { x0, y0, blocked, opaque } = chunk;
        const random = createRandom((Math.imul(chunk.cx + 1, 73856093) ^ Math.imul(chunk.cy + 1, 19349663) ^ Math.imul(plan.seed, 83492791)) >>> 0);
        const clearings = this.clearings.filter(({ at, radius }) => at[0] > x0 - radius && at[0] < x0 + CHUNK + radius && at[1] > y0 - radius && at[1] < y0 + CHUNK + radius);
        const [tx0, ty0] = [stamp.at[0] - CLEAR_OF_TOWN, stamp.at[1] - CLEAR_OF_TOWN];
        const [tx1, ty1] = [stamp.at[0] + stamp.width + CLEAR_OF_TOWN, stamp.at[1] + stamp.height + CLEAR_OF_TOWN];
        const clear = (x, y) => {
            for (let dy = -TREE_CLEAR - 1; dy <= TREE_CLEAR; dy++) {
                for (let dx = -TREE_CLEAR - 1; dx <= TREE_CLEAR; dx++) {
                    const [sx, sy] = [x + dx, y + dy];
                    const within = sx >= x0 && sy >= y0 && sx < x0 + CHUNK && sy < y0 + CHUNK;
                    const k = (sy - y0) * CHUNK + (sx - x0);

                    if (!inside(sx, sy) || (within ? blocked[k] || chunk.water[k] || chunk.ground[k] === GROUND.road || chunk.bridge[k] : this.#busy(sx, sy))) {
                        return false;
                    }
                }
            }

            return true;
        };
        const steps = CHUNK / TREE_GRID;

        for (let gy = 0; gy < steps; gy++) {
            for (let gx = 0; gx < steps; gx++) {
                // (The same random numbers for every try, planted or not, so a chunk's trees stay
                // the same whatever's round them)
                const x = Math.min(x0 + CHUNK - 1, Math.max(x0 + 1, Math.round(x0 + (gx + random.next()) * TREE_GRID)));
                const y = Math.min(y0 + CHUNK - 1, Math.max(y0 + 1, Math.round(y0 + (gy + random.next()) * TREE_GRID)));
                const [chance, pick, size, turn] = [random.next(), random.next(), random.range(0.85, 1.3), random.next() * Math.PI * 2];
                const flora = FLORA[this.biomeAt(x, y)];

                if (chance >= (flora.density * TREE_GRID * TREE_GRID) / 100) {
                    continue;
                }

                if ((x >= tx0 && y >= ty0 && x < tx1 && y < ty1) || clearings.some(({ at, radius }) => hypot(at[0] - x, at[1] - y) < radius) || !clear(x, y)) {
                    continue;
                }

                // (In a people's homeland, most of the trees are their own)
                const own = HOME_TREES[this.homeAt(x, y)];
                const kinds = own && (pick * 7.31) % 1 < HOME_TREE_SHARE ? [own] : flora.kinds;
                const kind = kinds[Math.floor(pick * kinds.length)];
                const variants = VARIANTS_OF[kind];
                const variant = variants[Math.floor(((pick * kinds.length) % 1) * variants.length)];

                for (const [bx, by] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
                    blocked[(by - y0) * CHUNK + (bx - x0)] = 1;
                    opaque[(by - y0) * CHUNK + (bx - x0)] = 1;
                }

                chunk.trees.push({ x, y, variant, size, turn });
            }
        }
    }

    // A chunk's own features (wilds.js: boulders, fallen trees, bushes...), clear of the trees,
    // roads, water, the town, the settlements and the places still to come, each taking its squares
    #features(chunk) {
        const { plan, stamp } = this;
        const { x0, y0, blocked, opaque } = chunk;
        const random = createRandom((Math.imul(chunk.cx + 7, 2654435761) ^ Math.imul(chunk.cy + 11, 40503) ^ Math.imul(plan.seed + 3, 97531)) >>> 0);
        const clearings = this.clearings.filter(({ at, radius }) => at[0] > x0 - radius && at[0] < x0 + CHUNK + radius && at[1] > y0 - radius && at[1] < y0 + CHUNK + radius);
        const [tx0, ty0] = [stamp.at[0] - CLEAR_OF_TOWN, stamp.at[1] - CLEAR_OF_TOWN];
        const [tx1, ty1] = [stamp.at[0] + stamp.width + CLEAR_OF_TOWN, stamp.at[1] + stamp.height + CLEAR_OF_TOWN];
        const free = (x, y, fields) => {
            const k = (y - y0) * CHUNK + (x - x0);
            const ground = chunk.ground[k];

            if (x < x0 || y < y0 || x >= x0 + CHUNK || y >= y0 + CHUNK || blocked[k] || chunk.water[k] || chunk.bridge[k] || (ground !== GROUND.grass && !(fields && ground === GROUND.soil))) {
                return false;
            }

            if (x >= tx0 && y >= ty0 && x < tx1 && y < ty1) {
                return false;
            }

            const settlement = this.settlements.at(x, y);

            return !(settlement && this.settlements.squareAt(settlement, x, y)) && !clearings.some(({ at, radius }) => hypot(at[0] - x, at[1] - y) < radius);
        };
        const features = featuresOf({ x0, y0, size: CHUNK, seed: plan.seed, random, landAt: (x, y) => this.biomeAt(x, y), homeAt: (x, y) => this.homeAt(x, y), free });

        for (const { squares, opaque: hides } of features) {
            for (const [x, y] of squares) {
                const k = (y - y0) * CHUNK + (x - x0);

                blocked[k] = 1;
                opaque[k] = hides ? 1 : opaque[k];
            }
        }

        return features;
    }

    // Whether a square outside a chunk being made is road or water (or the town)
    #busy(x, y) {
        const settlement = this.settlements.at(x, y);

        if (this.inTown(x, y) || (settlement && this.settlements.squareAt(settlement, x, y)) || this.sites.squareAt(x, y)) {
            return true;
        }

        const land = this.landAt(x, y);

        return land.water !== WET.none || land.road !== null;
    }
}

/**
 * The world for a seed: the plan, the town set into it where a player of `race` starts, and the
 * world outside round it, in the shape generateWorld's (world.js) is, but in the world's metres
 * and squares (the town's north-west corner at `origin` [x, y]): { seed, plan, start (the plan's
 * settlement the town stands for), width, height (the world's, metres), plot, origin, town, trees
 * (the town's own), spawns, patrol, tavern, maps ({ town: the Overworld, taproom, upstairs }),
 * links, folk, stamp (the town's own squares and where they are), home (the town as generateWorld
 * made it, in its own metres) }.
 */
export function buildWorld({ seed = 1, race = "human", plan = planWorld(seed) } = {}) {
    const start = startFor(plan, race);
    const town = generateWorld({ seed, exits: waysOut(plan, start), people: start.race });
    const at = [Math.round(start.at[0] - town.width / 2), Math.round(start.at[1] - town.height / 2)];
    const walks = town.town.walks.map(({ a, b, half }) => ({ a: [a[0] + at[0], a[1] + at[1]], b: [b[0] + at[0], b[1] + at[1]], half }));
    const stamp = { at, width: town.width, height: town.height, blocked: town.blocked, opaque: town.opaque, ground: town.ground, water: town.town.water, walks, middle: [town.town.centre[0] + town.origin + at[0], town.town.centre[1] + town.origin + at[1]], radius: town.town.radius };
    const overworld = new Overworld({ plan, stamp, start });
    const move = ([x, y]) => [x + at[0], y + at[1]];
    const tavern = town.tavern && {
        ...town.tavern,
        x: town.tavern.x + at[0],
        y: town.tavern.y + at[1],
        door: { ...town.tavern.door, x: town.tavern.door.x + at[0], z: town.tavern.door.z + at[1] },
        front: town.tavern.front.map(move),
        outside: move(town.tavern.outside),
        clear: town.tavern.clear.map(move),
    };
    const links = town.links.map((link) => ({
        ...link,
        ends: link.ends.map((end) => (end.map === "town" ? { ...end, squares: end.squares.map(move), arrive: move(end.arrive), door: link.id === "tavern-door" ? tavern.door : end.door } : end)),
    }));
    const world = {
        seed,
        plan,
        start,
        width: WORLD_SIZE,
        height: WORLD_SIZE,
        plot: town.plot,
        origin: [town.origin + at[0], town.origin + at[1]],
        town: town.town,
        trees: town.trees.map(({ x, y, variant }) => ({ x: x + at[0], y: y + at[1], variant })),
        spawns: { player: move(town.spawns.player), orc: move(town.spawns.orc) },
        patrol: town.patrol.map(move),
        tavern,
        maps: { ...town.maps, town: overworld },
        links,
        folk: town.folk,
        stamp,
        home: town,
    };

    // Every building that can be gone into: the town's own tavern, made with it; the town's other
    // buildings; and each settlement's as it's laid out (insides.js)
    const interiors = new Interiors(world);

    if (tavern) {
        const piece = town.town.pieces.find((one) => one.tavern === WENCHES);
        const [ox, oy] = Array.isArray(world.origin) ? world.origin : [world.origin, world.origin];

        interiors.adopt({ key: "home:tavern", kind: "tavern", name: WENCHES.name, tavern: WENCHES, maps: ["taproom", "upstairs"], folk: town.folk, piece, at: piece ? [ox + piece.x, oy + piece.y] : null, people: start.race });
    }

    for (const piece of town.town.pieces) {
        if (piece.kind === "landmark" && piece.tavern !== WENCHES) {
            interiors.add(piece, { origin: world.origin, place: "home", people: start.race });
        }
    }

    world.interiors = interiors;
    overworld.attach(interiors);

    return world;
}
