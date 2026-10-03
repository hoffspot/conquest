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
//   farmland (fields.js: blocks of strips, each its own crop, grass verges and baulks between), road,
//   and planks on bridges.
// - Trees, as many as the land has (woods thick with them, meadows few, beaches none), of the
//   kinds that grow there; clear of roads and water, of the fields' strips (on their verges, as
//   hedgerow trees), and of the settlements, sites and camps still to be built.
//
// Water can't be walked into; trees block their squares and can't be seen through. Nothing here
// uses Three.js, so it runs in Node too.

import { ALONG, CROP, fieldAt, hedgeLine, sown } from "./fields.js";
import { MAP_ORIGINS } from "./interiors.js";
import { hashOf } from "./noise.js";
import { createRandom } from "./random.js";
import { Settlements, squareOf, waysOut } from "./settlements.js";
import { Sites } from "./sites.js";
import { Trails, TRAILS } from "./trails.js";
import { Interiors } from "./insides.js";
import { WENCHES } from "./lore/taverns.js";
import { featuresOf } from "./wilds.js";
import { archesOf, archSquares, roomOf } from "./arches.js";
import { AQUEDUCTS, aqueductsOf, pierSquares } from "./aqueducts.js";
import { CORNERS, GRADE, Ground, PAD_EASE, ROAD } from "./terrain/ground.js";
import { SLOPE_CLASS, stillLevelAt, stillOf, stillWaterAt } from "./terrain/height.js";
import { WADE, wadeable, watersOf } from "./terrain/waters.js";
import { rounded, wayOver } from "./terrain/ways.js";
import { FLATS, flatSpot } from "./terrain/flats.js";
import { metresOf } from "./terrain/curve.js";
import { GROUND, HOME_TREES, TREE_KINDS } from "./setpieces/pieces.js";
import { generateWorld } from "./world.js";
import { BIOME, BIOMES, CELL, CELLS, CHUNK, CHUNKS, planWorld, RACES, startFor, WORLD_SIZE } from "./worldplan/plan.js";
import { hypot } from "./exact.js";

export { CHUNK, CHUNKS, WORLD_SIZE };

// How much room is kept round an aqueduct's pier (metres from its middle: no tree or feature in it)
const PIER_ROOM = 3.5;

// How much room is kept round an arch of rock past its legs (metres: no tree or feature in it)
const ARCH_ROOM = 4;

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
const ROAD_HALF = Object.freeze({ trade: 2.2, road: 1.8, track: 1.1, path: TRAILS.half });

/**
 * Bridges: how far past the road's edge the deck reaches each side (metres), and how far onto
 * each bank; a road's crossings closer together than `join` metres are one bridge. Looked for
 * every `step` metres along the road. Stone bridges (`stone`): the roads that have them (`kinds`),
 * and how many of a track's crossings do (`tracks`, by where it crosses); how far onto each bank
 * they reach (metres: up a ramp from the road there); how high over the river their deck runs
 * level, by the road's kind (metres over its surface: room for the arches under it, a track's
 * packhorse bridge humped over one high arch, a trade road's level over a row of low ones); and
 * how near a capital or a city (metres past its edge) a trade road's has a gate tower on it.
 */
export const BRIDGE = Object.freeze({
    wider: 0.4,
    banks: 1.5,
    join: 3,
    step: 0.5,
    stone: Object.freeze({ kinds: Object.freeze(["trade", "road"]), tracks: 0.5, banks: 8, over: Object.freeze({ track: 4, road: 2.8, trade: 2.6 }), tower: 600 }),
});

// Trees: tried every TREE_GRID metres (and a random way in); how far (squares) they keep from
// roads and water; how far (metres) from the town, and from the edges of the settlements, sites
// and camps still to be built
const TREE_GRID = 4;
const TREE_CLEAR = 2;
const CLEAR_OF_TOWN = 3;
const CLEAR_OF_PLACES = 12;

// How many chunks to keep once made (the rest are made again when they're needed)
const KEEP = 256;

// A camp's pad (metres from its middle), levelled into the ground: pitched on the flattest ground
// within FLATS.reach of its cell's middle (terrain/flats.js)
const CAMP_PAD = 10;

const VARIANTS_OF = Object.fromEntries([...new Set(TREE_KINDS.map(([kind]) => kind))].map((kind) => [kind, TREE_KINDS.flatMap(([k], variant) => (k === kind ? [variant] : []))]));

const cellAt = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor(v / CELL)));
const inside = (x, y) => x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE;

// How far a point is from a line segment
function fromSegment(px, py, [ax, ay, bx, by]) {
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));

    return hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Roads over the land's steepest steps: a road is found its own way over a stretch where the
// plan's cells it runs through rise or fall `steep` times its grade or more from one of its points
// to the next (terrain/ways.js: in hairpins up the slope, from `before` points before it to
// `after` after it, within `room` metres of them)
const CLIMBS = Object.freeze({ steep: 6, before: 3, after: 2, room: 128 });

// A road's line (`points`, through its cells' middles, rounded) with any stretch too steep for its
// kind (GRADE) found its own way over (CLIMBS)
function climbing(plan, points, kind) {
    const grade = GRADE[kind];
    const rise = ([x, y]) => metresOf(plan.height[cellAt(y) * CELLS + cellAt(x)]);
    const stretches = [];

    for (let k = 1; k < points.length; k++) {
        const run = hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]) || 1;

        if (Math.abs(rise(points[k]) - rise(points[k - 1])) / run >= grade * CLIMBS.steep) {
            const [a, b] = [Math.max(0, k - CLIMBS.before), Math.min(points.length - 1, k + CLIMBS.after)];

            if (stretches.length && a <= stretches.at(-1)[1]) {
                stretches.at(-1)[1] = b;
            } else {
                stretches.push([a, b]);
            }
        }
    }

    // (From the last, so the earlier stretches' points stay where they were)
    let line = points;

    for (const [a, b] of stretches.reverse()) {
        const among = line.slice(a, b + 1);
        const box = [
            Math.max(0, Math.min(...among.map(([x]) => x)) - CLIMBS.room),
            Math.max(0, Math.min(...among.map(([, y]) => y)) - CLIMBS.room),
            Math.min(WORLD_SIZE - 1, Math.max(...among.map(([x]) => x)) + CLIMBS.room),
            Math.min(WORLD_SIZE - 1, Math.max(...among.map(([, y]) => y)) + CLIMBS.room),
        ];
        // (Found from its northern end, or western if they're level, whichever way the road runs:
        // roads sharing a stretch, one up it and one down, share its way too)
        const [from, to] = [line[a], line[b]];
        const way = from[1] < to[1] || (from[1] === to[1] && from[0] <= to[0]) ? wayOver(plan, from, to, { grade, box }) : wayOver(plan, to, from, { grade, box })?.reverse();

        if (way) {
            line = [...line.slice(0, a), ...rounded(way), ...line.slice(b + 1)];
        }
    }

    return line;
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

// A road's line ({ points, kind, ... }) listed by the chunks its segments come near, as far as
// its shoulders can reach ([ax, ay, bx, by, kind, line, joined, which of its planned segments it
// is: the ground follows the road along them])
function lay(byChunk, line) {
    const { points, kind } = line;

    for (let k = 0; k < points.length - 1; k++) {
        const segment = [...points[k], ...points[k + 1], kind, line, false, k];
        const pad = ROAD_HALF[kind] + ROAD.most + 1;
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

/**
 * The world outside, on 1-metre squares, made a chunk at a time: a map (as the battle reads maps:
 * grid.js) whose squares are its `squares`.
 */
export class Overworld {
    /**
     * @param {object} options
     * @param {object} options.plan - The world plan (worldplan/plan.js planWorld).
     * @param {object} options.stamp - The town set into it: { at: [x, y] (its north-west square),
     *   width, height, blocked, opaque, ground (its rows), yards (layoutTown's, in the world's
     *   metres) }.
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
        // sites, the camps, the arches of rock (arches.js: their own room round them) and the
        // aqueducts' piers
        // (Each people's castle and special places, set down as the world near them is made:
        // their clearings growing to their size, where they're set)
        // (Those a trail goes up to facing the way it comes: the trails are made below, before any
        // site is set down)
        this.sites = new Sites(plan, { landAt: (x, y) => this.landAt(x, y), clearing: CLEAR_OF_PLACES, facingOf: (site) => this.trails.facingOf(site) });
        this.arches = archesOf(plan);
        this.aqueducts = aqueductsOf(plan);
        this.clearings = [
            ...plan.places.filter((place) => place !== start).map(({ at, radius }) => ({ at, radius: radius + CLEAR_OF_PLACES })),
            ...plan.sites.map(({ id }) => this.sites.clearings.get(id)),
            ...this.arches.map((arch) => ({ at: [arch.x, arch.y], radius: roomOf(arch) + ARCH_ROOM })),
            ...this.aqueducts.flatMap(({ piers }) => piers.map(({ x, y }) => ({ at: [x, y], radius: PIER_ROOM }))),
        ];
        // (The camps' own, where each is pitched: found as the world near it is made, campsNear)
        this.campSpots = new Map();
        // The other settlements, laid out as the world near them is made (their roads then joined
        // to their streets' ends: roads to them wait for that, `waiting`, by place)
        this.waiting = new Map();
        this.settlements = new Settlements(plan, {
            skip: start,
            landAt: (x, y) => this.landAt(x, y),
            onLaid: (settlement) => {
                this.#join(settlement);
                this.#enter(settlement);
            },
        });
        this.roads = this.#layRoads();
        this.bridges = new Map();

        // The trails up into the hills, from the roads as planned, keeping out of the town and
        // the settlements (found as the land near each is first wanted: #roadsIn)
        const lines = new Set([...this.roads.values()].flatMap((segments) => segments.map((segment) => segment[5])));
        const keepOut = [
            [this.stamp.at[0] - 10, this.stamp.at[1] - 10, this.stamp.at[0] + this.stamp.width + 10, this.stamp.at[1] + this.stamp.height + 10],
            ...this.settlements.places.map((place) => {
                const { at: [sx, sy], size } = squareOf(place);

                return [sx - 2, sy - 2, sx + size + 2, sy + size + 2];
            }),
        ];

        this.trails = new Trails(plan, [...lines], keepOut);
        this.trailed = new Set();

        // The ground: the land's height, with the settlements, castles, places and camps on pads
        // and the roads levelled in (as planned: never the bits joined to a settlement's streets,
        // which wait on it being laid out, so it's the same whichever chunks are made first)
        this.ground = new Ground(plan, {
            padsNear: (cx, cy) => this.#padsNear(cx, cy),
            roadsNear: (cx, cy) => this.#roadsIn(cx, cy).filter((segment) => !segment[6]).map((segment) => ({ line: segment[5], k: segment[7], half: ROAD_HALF[segment[4]] })),
            settledNear: (cx, cy) => this.#padsNear(cx, cy, { settled: true }),
        });

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

    /** Whether every chunk a box of squares touches has been made (and is kept). */
    made(x0, y0, x1, y1) {
        for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(CHUNKS - 1, Math.floor(y1 / CHUNK)); cy++) {
            for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(CHUNKS - 1, Math.floor(x1 / CHUNK)); cx++) {
                if (!this.chunks.has(cy * CHUNKS + cx)) {
                    return false;
                }
            }
        }

        return true;
    }

    /** The chunk a square is in (made if need be). */
    chunkAt(x, y) {
        return this.chunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    }

    /**
     * A chunk (cx, cy: chunks from the world's north-west corner): { cx, cy, x0, y0 (its
     * north-west square), blocked, opaque, ground, water (WET), bridge (Uint8Array, a square
     * each: under a bridge's deck), solid (blocked by what's built or stands there: the town's,
     * a settlement's or a place's buildings and walls, a feature; not water, a cliff or a tree,
     * whose trunk stands at its point), trees ([{ x, y (a trunk's point, where four squares meet),
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

    /**
     * How high the ground stands at a point (metres): levelled where it's built on and along the
     * roads; on a bridge, its deck (terrain/ground.js).
     */
    heightAt(x, y) {
        const [px, py] = [Math.floor(x), Math.floor(y)];

        const chunk = inside(px, py) ? this.chunkAt(px, py) : null;

        if (chunk?.bridge[(py - chunk.y0) * CHUNK + (px - chunk.x0)]) {
            const deck = this.#deckAt(x, y);

            if (deck !== null) {
                return deck;
            }
        }

        return this.ground.heightAt(x, y);
    }

    // A bridge's deck's height at a point on it, or null if the point's on none
    #deckAt(x, y) {
        for (const bridge of this.#bridgesNear(Math.floor(x / CHUNK), Math.floor(y / CHUNK))) {
            const { a, b, half } = bridge;
            const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
            const length = hypot(dx, dy);
            const along = ((x - a[0]) * dx + (y - a[1]) * dy) / length;

            if (along >= -0.5 && along <= length + 0.5 && Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / length <= half + 0.5) {
                return this.deckOf(bridge, along / length);
            }
        }

        return null;
    }

    /**
     * A bridge's deck's height (metres) a way `t` along it (0 at its end `a`, 1 at `b`): from the
     * ground at one end to the other's, arched to at least a metre over the river under its
     * middle; a stone bridge's level over the river, high enough for its arches, up a ramp from
     * each end.
     */
    deckOf({ a, b, stone = false, kind = "road", ramps = null }, t) {
        const [ha, hb] = [this.ground.heightAt(...a), this.ground.heightAt(...b)];
        const river = this.waters.river((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 20);
        const along = Math.min(1, Math.max(0, t));

        // A stone bridge: level over the river (high enough for its arches, and no lower than
        // halfway between its ends), up a straight ramp from each end to the river's edge
        if (stone) {
            const length = hypot(b[0] - a[0], b[1] - a[1]);
            const top = Math.max(river ? river.surface + BRIDGE.stone.over[kind] : -Infinity, (ha + hb) / 2);
            const [up, down] = [ramps[0] / length, 1 - ramps[1] / length];

            return along < up ? ha + ((top - ha) * along) / up : along > down ? hb + ((top - hb) * (1 - along)) / (1 - down) : top;
        }

        const least = river ? river.surface + 1 : -Infinity;
        const lift = Math.max(0, least - (ha + hb) / 2) * 4 * along * (1 - along);

        return ha + (hb - ha) * along + lift;
    }

    /**
     * Whether water this deep (metres) at a point (metres) can be waded: shallow enough, and
     * (in a river) slow enough (waters.js wadeable). A river is waded only where it can be waded
     * across (a ford: not its shallows along a deep one's banks); a mountain stream is narrow
     * enough to step across wherever it's shallow enough, however fast it runs.
     */
    wades(x, y, depth) {
        const river = this.waters.river(x, y, 0);

        if (!river || river.gap > 0) {
            return wadeable(depth, 0);
        }

        return river.stream ? depth <= WADE.deepest : wadeable(Math.max(depth, river.depth), river.speed);
    }

    /**
     * The height of the water's surface at a point (metres): a river's in its channel; out of it, a
     * lake's or the sea's wherever it's wet enough for that to stand, else the nearest river's
     * (within 24 m: `river`, if it's been looked for already), else the lake's or the sea's near,
     * else the ground's (where water's drawn, it's drawn at this). So a lake or the sea beside a
     * river higher up is never drawn at the river's height.
     */
    surfaceAt(x, y, river = this.waters.river(x, y, 24)) {
        if (river && river.gap <= 0) {
            return river.surface;
        }

        const stands = stillLevelAt(this.plan, x, y);

        if (stands !== null || river) {
            return stands ?? river.surface;
        }

        return stillOf(this.plan, x, y)?.level ?? this.ground.heightAt(Math.min(WORLD_SIZE - 0.01, Math.max(0, x)), Math.min(WORLD_SIZE - 0.01, Math.max(0, y)));
    }

    /**
     * Where a camp of the plan's is pitched ([x, y], metres): on the flattest ground within
     * FLATS.reach of its cell's middle, clear of the plan's roads (terrain/flats.js), the same
     * whenever it's asked for.
     */
    campAt(camp) {
        if (!this.campSpots.has(camp.id)) {
            const road = (x, y) => this.plan.road[cellAt(y) * CELLS + cellAt(x)] > 0;

            this.campSpots.set(camp.id, flatSpot(this.plan, camp.at, { avoid: road, size: WORLD_SIZE }));
        }

        return this.campSpots.get(camp.id);
    }

    // The camps that could be pitched within `margin` of a box (metres), wherever they're pitched
    #campsNear(x0, y0, x1, y1, margin) {
        const reach = FLATS.reach + margin;

        return this.plan.camps.filter(({ at: [x, y] }) => x > x0 - reach && x < x1 + reach && y > y0 - reach && y < y1 + reach);
    }

    // The places near a chunk that trees and the land's features keep clear of: the settlements
    // still to be built, the sites and the camps, where each is
    #clearingsNear(x0, y0) {
        const near = ({ at, radius }) => at[0] > x0 - radius && at[0] < x0 + CHUNK + radius && at[1] > y0 - radius && at[1] < y0 + CHUNK + radius;
        const camps = this.#campsNear(x0, y0, x0 + CHUNK, y0 + CHUNK, CLEAR_OF_PLACES).map((camp) => ({ at: this.campAt(camp), radius: CLEAR_OF_PLACES }));

        return [...this.clearings, ...camps].filter(near);
    }

    // The pads (terrain/ground.js) reaching into a chunk: the town, the settlements' squares, the
    // sites set down (those near this chunk and its neighbours set down first, so a site's pad is
    // the same whenever it's asked for), and the camps; or (`settled`) only the town's and the
    // settlements', setting nothing down
    #padsNear(cx, cy, { settled = false } = {}) {
        const [x0, y0, x1, y1] = [cx * CHUNK - PAD_EASE, cy * CHUNK - PAD_EASE, (cx + 1) * CHUNK + PAD_EASE, (cy + 1) * CHUNK + PAD_EASE];
        const meets = (ax0, ay0, ax1, ay1) => ax1 > x0 && ax0 < x1 && ay1 > y0 && ay0 < y1;
        const pads = [];
        const { at, width, height } = this.stamp;

        if (meets(at[0], at[1], at[0] + width, at[1] + height)) {
            pads.push({ id: "town", x0: at[0], y0: at[1], x1: at[0] + width, y1: at[1] + height, tilt: this.start?.race !== "lizard" });
        }

        for (const place of this.settlements.places) {
            const { at: [sx, sy], size } = squareOf(place);

            if (meets(sx, sy, sx + size, sy + size)) {
                // (Lying with the land, but for the lizard folk's, round their lagoons' level water)
                pads.push({ id: `place ${place.id}`, x0: sx, y0: sy, x1: sx + size, y1: sy + size, tilt: place.race !== "lizard" });
            }
        }

        // (Only the town's and the settlements', if that's all that's asked: nothing settled)
        if (settled) {
            return pads;
        }

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < CHUNKS && cy + dy < CHUNKS) {
                    this.sites.settle(cx + dx, cy + dy);
                }
            }
        }

        for (const set of this.sites.set.values()) {
            // (Those levelled into the land: not most of those no people keeps, which lie with it;
            // a citadel's terraces one above another, the outermost first: sorted by their ids)
            for (const [k, pad] of (set?.pads ?? (set?.pad ? [set.pad] : [])).entries()) {
                const reach = pad.radius + Math.max(0, (pad.ease ?? PAD_EASE) - PAD_EASE);

                if (meets(pad.at[0] - reach, pad.at[1] - reach, pad.at[0] + reach, pad.at[1] + reach)) {
                    pads.push({ id: set.pads ? `site ${set.site.id}/${k}` : `site ${set.site.id}`, ...pad });
                }
            }
        }

        for (const camp of this.#campsNear(x0, y0, x1, y1, CAMP_PAD)) {
            const at = this.campAt(camp);

            if (meets(at[0] - CAMP_PAD, at[1] - CAMP_PAD, at[0] + CAMP_PAD, at[1] + CAMP_PAD)) {
                pads.push({ id: `camp ${camp.id}`, at, radius: CAMP_PAD });
            }
        }

        return pads;
    }

    // --- Making a chunk ---

    #make(cx, cy) {
        const [x0, y0] = [cx * CHUNK, cy * CHUNK];
        const blocked = new Uint8Array(SQUARES);
        const opaque = new Uint8Array(SQUARES);
        const ground = new Uint8Array(SQUARES);
        const water = new Uint8Array(SQUARES);
        const bridge = new Uint8Array(SQUARES);
        const built = new Uint8Array(SQUARES);
        const solid = new Uint8Array(SQUARES);
        const crops = new Uint8Array(SQUARES);
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
                    built[k] = 1;
                    solid[k] = blocked[k];
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
                    built[k] = 1;
                    solid[k] = blocked[k];
                    continue;
                }

                const land = this.landAt(x, y);

                ground[k] = land.ground;
                water[k] = land.water;
                bridge[k] = land.bridge ? 1 : 0;
                crops[k] = land.crop ?? 0;
                blocked[k] = land.water && !land.bridge ? 1 : 0;

                // (A castle's, or a people's own place's: what's built there stands on it; a
                // citadel's wards are courtyards)
                const site = this.sites.squareAt(x, y);

                if (site) {
                    blocked[k] = 1;
                    opaque[k] = 1;
                    built[k] = 1;
                    solid[k] = 1;

                    if (site.paved) {
                        ground[k] = GROUND.courtyard;
                    }
                }
            }
        }

        // The ground: too steep to climb is blocked, but for roads, bridges and what's built on
        // (levelled into it)
        const { heights, slopes } = this.ground.chunk(cx, cy);

        for (let k = 0; k < SQUARES; k++) {
            if (slopes[k] === SLOPE_CLASS.cliff && !built[k] && !bridge[k] && ground[k] !== GROUND.road) {
                blocked[k] = 1;
            } else if (water[k] && !built[k] && !bridge[k]) {
                // (Water shallow and slow enough to wade: a ford, or a lake's or the sea's
                // shallows, walked through)
                const [i, j] = [k % CHUNK, Math.floor(k / CHUNK)];
                const c = j * CORNERS + i;
                const depth = this.surfaceAt(x0 + i + 0.5, y0 + j + 0.5) - Math.min(heights[c], heights[c + 1], heights[c + CORNERS], heights[c + CORNERS + 1]);

                blocked[k] = this.wades(x0 + i + 0.5, y0 + j + 0.5, depth) ? 0 : 1;
            }
        }

        const inChunk = ({ a, b }) => Math.floor((a[0] + b[0]) / 2 / CHUNK) === cx && Math.floor((a[1] + b[1]) / 2 / CHUNK) === cy;
        const bridges = this.#bridgesNear(cx, cy).filter(inChunk);
        // (And the plank walks over a lagoon, the lizard folk's: the town's, and each settlement's)
        const walks = [...(stamp?.walks ?? []).filter(inChunk), ...this.settlements.walksIn(cx, cy)];
        const chunk = { cx, cy, x0, y0, blocked, opaque, ground, water, bridge, solid, crops, heights, slopes, trees: [], bridges, walks, town };

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
     * bridge (under a bridge's deck), road (its kind, or null), crop (its field's, as chunk.crops
     * keeps it: 0 if it's in none) }.
     */
    landAt(x, y) {
        const { plan } = this;
        const [px, py] = [x + 0.5, y + 0.5];
        const road = this.#roadAt(px, py);
        const river = this.waters.riverAt(px, py);
        const still = !river && stillWaterAt(plan, px, py) !== null;
        const water = river ? WET.river : still ? WET.still : WET.none;

        // Under a bridge (over the river, or its ends on the banks): its planks, or a stone
        // one's cobbles (walked on as they're drawn, with no planks' thickness over its deck)
        const bridge = this.#bridgeAt(px, py);

        if (bridge) {
            return { ground: bridge.stone ? GROUND.cobbles : GROUND.planks, water, bridge: true, road: road ?? "bridge" };
        }

        // (Roads go round lakes, and cross rivers only on bridges)
        if (water) {
            return { ground: GROUND.soil, water, bridge: false, road: null };
        }

        if (road) {
            return { ground: GROUND.road, water, bridge: false, road };
        }

        // Fields in farmland (each block's farmed if the land at its middle is): soil where a strip's
        // ploughed or sown, grass on its verges, baulks and fallow, and pasture
        const field = fieldAt(plan.seed, x, y);
        const [mx, my] = field.middle;
        const farmed = field.crop !== CROP.none && plan.biome[cellAt(my) * CELLS + cellAt(mx)] === BIOME.farmland;

        return { ground: farmed && sown(field.crop) ? GROUND.soil : GROUND.grass, water, bridge: false, road: null, crop: farmed ? field.crop + ALONG * field.along : 0 };
    }

    /**
     * Whether a hedgerow runs along a square: the edge of a farmed block of fields (fields.js), the
     * drawing's alone (in no one's way).
     */
    hedgeAt(x, y) {
        if (!hedgeLine(this.plan.seed, x, y)) {
            return false;
        }

        const [mx, my] = fieldAt(this.plan.seed, x, y).middle;

        return this.plan.biome[cellAt(my) * CELLS + cellAt(mx)] === BIOME.farmland;
    }

    /** The foot paths up into the hills (the trails' lines: { planned, kind }) that reach into a chunk. */
    pathsNear(cx, cy) {
        return [...new Set(this.#roadsIn(cx, cy).filter((segment) => !segment[6] && segment[4] === "path").map((segment) => segment[5]))];
    }

    /** The bridges whose decks reach into a chunk: [{ a, b, half }] (see chunk). */
    bridgesNear(cx, cy) {
        return this.#bridgesNear(cx, cy);
    }

    /**
     * The yards behind the houses whose middles are in a chunk, in the world's metres: the town's
     * and the settlements' (Settlements.yardsIn: those that are there), [{ ...yard, x, y }]
     * (layoutTown's yards).
     */
    yardsIn(cx, cy) {
        const [x0, y0] = [cx * CHUNK, cy * CHUNK];
        const own = (this.stamp?.yards ?? []).filter(({ x, y }) => x >= x0 && y >= y0 && x < x0 + CHUNK && y < y0 + CHUNK);

        return [...own, ...this.settlements.yardsIn(cx, cy)];
    }

    /**
     * The plank walks reaching into a box (metres): the town's and the settlements' near it,
     * [{ a, b, half }] (see chunk).
     */
    walksNear(x0, y0, x1, y1) {
        const meets = ({ a, b, half }) => Math.max(a[0], b[0]) + half >= x0 && Math.min(a[0], b[0]) - half <= x1 && Math.max(a[1], b[1]) + half >= y0 && Math.min(a[1], b[1]) - half <= y1;
        const walks = (this.stamp?.walks ?? []).filter(meets);

        for (let cy = Math.max(0, Math.floor(y0 / CHUNK) - 1); cy <= Math.min(CHUNKS - 1, Math.floor(y1 / CHUNK) + 1); cy++) {
            for (let cx = Math.max(0, Math.floor(x0 / CHUNK) - 1); cx <= Math.min(CHUNKS - 1, Math.floor(x1 / CHUNK) + 1); cx++) {
                // (Those near laid out first, so it's the same whichever chunks were made before)
                this.settlements.settle(cx, cy);
                walks.push(...this.settlements.walksIn(cx, cy).filter(meets));
            }
        }

        return walks;
    }

    // The bridge whose deck a point's under, if any
    #bridgeAt(px, py) {
        return this.#bridgesNear(Math.floor(px / CHUNK), Math.floor(py / CHUNK)).find(({ a, b, half }) => {
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
            const lines = new Set(this.#roadsIn(cx, cy).filter((segment) => !segment[6]).map((segment) => segment[5]));
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

            line.bridges = runs.map(([from, to]) => {
                // (Of stone on the bigger roads, and on some of the tracks' crossings, by where:
                // reaching further onto the banks, up ramps to its level over the river)
                const [mx, my] = along[Math.floor((from + to) / 2)].at;
                const stone = BRIDGE.stone.kinds.includes(line.kind) || (line.kind === "track" && hashOf(Math.floor(mx), Math.floor(my), this.plan.seed * 31 + 1931) < BRIDGE.stone.tracks);
                const banks = Math.round((stone ? BRIDGE.stone.banks : BRIDGE.banks) / BRIDGE.step);
                const [start, end] = [Math.max(0, from - banks), Math.min(along.length - 1, to + banks)];
                const bridge = { a: along[start].at, b: along[end].at, half: ROAD_HALF[line.kind] + BRIDGE.wider };

                // (A stone bridge's ramps: from each end to the river's edge, metres; its road's
                // kind; and a trade road's near a capital or a city, a gate tower on it)
                const tower = line.kind === "trade" && this.plan.places.some(({ kind, at, radius }) => (kind === "capital" || kind === "city") && hypot(at[0] - mx, at[1] - my) < radius + BRIDGE.stone.tower);

                return stone ? { ...bridge, stone: true, kind: line.kind, ramps: [(from - start) * BRIDGE.step, (end - to) * BRIDGE.step], tower } : bridge;
            });
        }

        return line.bridges;
    }

    // The kind of road at a point (the widest, where roads and paths meet: the same whichever
    // were listed first), or null
    #roadAt(px, py) {
        let kind = null;

        for (const segment of this.#roadsIn(Math.floor(px / CHUNK), Math.floor(py / CHUNK))) {
            const half = ROAD_HALF[segment[4]];

            // (Not looked at closer if it's further off than its half-width by its bounds)
            if (px < Math.min(segment[0], segment[2]) - half || px > Math.max(segment[0], segment[2]) + half || py < Math.min(segment[1], segment[3]) - half || py > Math.max(segment[1], segment[3]) + half) {
                continue;
            }

            if ((kind === null || half > ROAD_HALF[kind]) && fromSegment(px, py, segment) <= half) {
                kind = segment[4];
            }
        }

        return kind;
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

        for (const [index, road] of plan.roads.entries()) {
            let points = climbing(plan, smooth(road.cells.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL])), road.kind);
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
                let out = order.findIndex(outside);

                if (out < 0) {
                    points = [];
                    break;
                }

                // (Never out in a river: on to dry land, so the bridge over it is the road's own,
                // not left to the bit joined to the settlement's streets, which has none)
                while (out > 0 && this.waters.riverAt(...order[out])) {
                    out--;
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
            const line = { id: `road ${String(index).padStart(4, "0")}`, points, planned: [...points], kind: road.kind, bridges: null, ends: {} };

            for (const [id, [end]] of Object.entries(ends)) {
                line.ends[id] = end;

                if (!this.waiting.has(id)) {
                    this.waiting.set(id, []);
                }

                this.waiting.get(id).push(line);
            }

            lay(byChunk, line);
        }

        return byChunk;
    }

    // The roads through a chunk (#layRoads' segments), and the trails up into the hills near it,
    // found the first time anything about the chunk's wanted (so before anything's made of it)
    #roadsIn(cx, cy) {
        const key = cy * CHUNKS + cx;

        if (!this.trailed.has(key)) {
            this.trailed.add(key);

            for (const trail of this.trails.near(cx, cy, CHUNK)) {
                if (!trail.laid) {
                    const points = this.trails.find(trail);

                    trail.laid = true;

                    if (points) {
                        lay(this.roads, { id: trail.id, points, planned: [...points], kind: "path", bridges: null, ends: {} });
                    }
                }
            }
        }

        return this.roads.get(key) ?? [];
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
        const clearings = this.#clearingsNear(x0, y0);
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

                // (None in a field's strips: on its verges, as hedgerow trees, but not in its crops)
                if (chunk.crops[(y - 1 - y0) * CHUNK + x - 1 - x0] || chunk.crops[(y - 1 - y0) * CHUNK + x - x0] || chunk.crops[(y - y0) * CHUNK + x - 1 - x0] || chunk.crops[(y - y0) * CHUNK + x - x0]) {
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
        const clearings = this.#clearingsNear(x0, y0);
        const [tx0, ty0] = [stamp.at[0] - CLEAR_OF_TOWN, stamp.at[1] - CLEAR_OF_TOWN];
        const [tx1, ty1] = [stamp.at[0] + stamp.width + CLEAR_OF_TOWN, stamp.at[1] + stamp.height + CLEAR_OF_TOWN];
        const free = (x, y, fields) => {
            const k = (y - y0) * CHUNK + (x - x0);
            const ground = chunk.ground[k];

            // (In a field's strips, only what's of the fields: haystacks, scarecrows)
            if (x < x0 || y < y0 || x >= x0 + CHUNK || y >= y0 + CHUNK || blocked[k] || chunk.water[k] || chunk.bridge[k] || (ground !== GROUND.grass && !(fields && ground === GROUND.soil)) || (chunk.crops[k] && !fields)) {
                return false;
            }

            if (x >= tx0 && y >= ty0 && x < tx1 && y < ty1) {
                return false;
            }

            const settlement = this.settlements.at(x, y);

            return !(settlement && this.settlements.squareAt(settlement, x, y)) && !clearings.some(({ at, radius }) => hypot(at[0] - x, at[1] - y) < radius);
        };
        const features = featuresOf({ x0, y0, size: CHUNK, seed: plan.seed, random, landAt: (x, y) => this.biomeAt(x, y), homeAt: (x, y) => this.homeAt(x, y), free });

        // (An arch of rock standing in it, its legs on its squares: unless any of them is a road's,
        // water, a bridge or built on, when it isn't there at all)
        for (const arch of this.arches) {
            if (Math.floor(arch.x / CHUNK) !== chunk.cx || Math.floor(arch.y / CHUNK) !== chunk.cy) {
                continue;
            }

            const squares = archSquares(arch);
            const stands = squares.every(([x, y]) => {
                const k = (y - y0) * CHUNK + (x - x0);

                return x >= x0 && y >= y0 && x < x0 + CHUNK && y < y0 + CHUNK && !chunk.water[k] && !chunk.bridge[k] && !chunk.solid[k] && chunk.ground[k] !== GROUND.road;
            });

            if (stands) {
                features.push({ kind: "arch", x: arch.x, y: arch.y, size: arch.span / 2, height: arch.rise, turn: arch.turn, variant: arch.variant, squares, opaque: true, arch });
            }
        }

        // (An aqueduct's piers in it (aqueducts.js): each standing on its squares, unless it's
        // fallen or any of its squares is a road's, water, a bridge or built on, when only its
        // rubble's there, on none)
        for (const aqueduct of this.aqueducts) {
            for (const [n, pier] of aqueduct.piers.entries()) {
                if (Math.floor(pier.x / CHUNK) !== chunk.cx || Math.floor(pier.y / CHUNK) !== chunk.cy) {
                    continue;
                }

                const squares = pierSquares(aqueduct, pier);
                const standing =
                    squares.length > 0 &&
                    squares.every(([x, y]) => {
                        const k = (y - y0) * CHUNK + (x - x0);

                        return x >= x0 && y >= y0 && x < x0 + CHUNK && y < y0 + CHUNK && !chunk.water[k] && !chunk.bridge[k] && !chunk.solid[k] && chunk.ground[k] !== GROUND.road;
                    });

                features.push({ kind: "aqueduct", x: pier.x, y: pier.y, size: AQUEDUCTS.pier[1] / 2, height: standing ? pier.height : 0, turn: aqueduct.turn, variant: aqueduct.variant, squares: standing ? squares : [], opaque: true, aqueduct, pier: n, standing });
            }
        }

        for (const { squares, opaque: hides } of features) {
            for (const [x, y] of squares) {
                const k = (y - y0) * CHUNK + (x - x0);

                blocked[k] = 1;
                chunk.solid[k] = 1;
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
    const yards = town.town.yards.map((yard) => ({ ...yard, x: yard.x + town.origin + at[0], y: yard.y + town.origin + at[1] }));
    const stamp = { at, width: town.width, height: town.height, blocked: town.blocked, opaque: town.opaque, ground: town.ground, water: town.town.water, walks, yards, middle: [town.town.centre[0] + town.origin + at[0], town.town.centre[1] + town.origin + at[1]], radius: town.town.radius };
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
