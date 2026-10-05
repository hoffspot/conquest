// Every settlement in the world but the start town (which is set in when the world's built:
// overworld.js buildWorld): the plan's capitals, cities, towns, villages, hamlets and
// farmsteads, each laid out (setpieces/town.js, its main streets heading out the ways the plan's
// roads leave it) the first time the world within a chunk of it is made, and the same every time
// after. The world takes each settlement's squares where it has something there (streets, the
// market or green, buildings, yards, trees), and its own land everywhere else; the plan's roads
// carry on from the settlement's streets' ends. Nothing here uses Three.js, so it runs in Node too.

import { CELL, CHUNK, CHUNKS } from "./worldplan/plan.js";
import { GROUND, PLOT } from "./setpieces/pieces.js";
import { openEntrances } from "./insides.js";
import { layoutTown, SETTLEMENT_KINDS } from "./setpieces/town.js";
import { atan2, cos, hypot, sin } from "./exact.js";

/** How far past its own square the world round a settlement has to be for it to be laid out (metres). */
export const NEAR = CHUNK;

// The ways the plan's roads leave a settlement (angles: 0 east, π/2 south): towards where each
// of its roads is ROAD_SIGHT metres out
const ROAD_SIGHT = 100;

/** The ways out of a place: the angles its roads leave it at. */
export function waysOut(plan, place) {
    return plan.roads.filter(({ from, to }) => from === place.id || to === place.id).flatMap((road) => {
        const cells = road.to === place.id ? [...road.cells].reverse() : road.cells;
        const far = cells.map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL]).find(([x, y]) => hypot(x - place.at[0], y - place.at[1]) >= ROAD_SIGHT);

        return far ? [atan2(far[1] - place.at[1], far[0] - place.at[0])] : [];
    });
}

/** How many metres a side a place's layout is (its town and the fields round it). */
export function sizeOf(place) {
    const spec = SETTLEMENT_KINDS[place.kind];

    return 2 * Math.round(spec.radius + spec.fields);
}

/**
 * The square a place's layout covers in the world: [x0, y0] (its north-west corner, metres, a
 * whole square), and its size.
 */
export function squareOf(place) {
    const size = sizeOf(place);

    return { at: [Math.round(place.at[0] - size / 2), Math.round(place.at[1] - size / 2)], size };
}

export class Settlements {
    /**
     * @param {object} plan - The world plan.
     * @param {object} [options]
     * @param {object} [options.skip] - A place not to lay out (the start town, set in already).
     * @param {Function} [options.onLaid] - Hears each settlement as it's laid out (to join its
     *     roads to its streets).
     * @param {Function} [options.landAt] - The land at a square of the world (the overworld's
     *     landAt: its water, bridge and road), where a settlement's yards reach past its edge.
     */
    constructor(plan, { skip = null, onLaid = () => {}, landAt = null } = {}) {
        this.plan = plan;
        this.places = plan.places.filter((place) => place !== skip && SETTLEMENT_KINDS[place.kind]);
        this.onLaid = onLaid;
        this.landAt = landAt;

        /**
         * Each place laid out so far, by id: { place, town (its layout), at, size, yards (its
         * town's yards that are there: astray's aren't) }.
         */
        this.laid = new Map();

        // Places laid out elsewhere ahead of being wanted (give), by id: { spec, town }
        this.given = new Map();

        // The places whose squares (grown by NEAR) reach into each chunk
        this.byChunk = new Map();

        for (const place of this.places) {
            const { at, size } = squareOf(place);
            const [cx0, cy0] = [Math.floor((at[0] - NEAR) / CHUNK), Math.floor((at[1] - NEAR) / CHUNK)];
            const [cx1, cy1] = [Math.floor((at[0] + size + NEAR) / CHUNK), Math.floor((at[1] + size + NEAR) / CHUNK)];

            for (let cy = Math.max(0, cy0); cy <= Math.min(CHUNKS - 1, cy1); cy++) {
                for (let cx = Math.max(0, cx0); cx <= Math.min(CHUNKS - 1, cx1); cx++) {
                    const key = cy * CHUNKS + cx;

                    if (!this.byChunk.has(key)) {
                        this.byChunk.set(key, []);
                    }

                    this.byChunk.get(key).push(place);
                }
            }
        }
    }

    /** The places near a chunk (within NEAR of its squares). */
    near(cx, cy) {
        return this.byChunk.get(cy * CHUNKS + cx) ?? [];
    }

    /**
     * A place laid out (now, if it wasn't: or as it was laid out elsewhere, if it was given): {
     * place, town, at, size }.
     */
    of(place) {
        let settlement = this.laid.get(place.id);

        if (!settlement) {
            const spec = this.specOf(place);
            const given = this.given.get(place.id);
            // (Laid out elsewhere from what it is here, or here: the same either way)
            const town = given && JSON.stringify(given.spec) === JSON.stringify(spec) ? given.town : layoutTown(spec);
            const { at, size } = squareOf(place);

            this.given.delete(place.id);

            // (The way up to the doors of its buildings that can be gone into, cleared)
            openEntrances(town.pieces, town.blocked, town.opaque, 0, town);

            // (Its yards, but for any reaching out past its edge over the world's water, a bridge
            // or a road: not there, their fences not standing in anyone's way)
            const yards = [];

            for (const yard of town.yards) {
                if (this.landAt && astray(yard, town, at, this.landAt)) {
                    for (const [i, j] of yard.squares) {
                        town.blocked[j][i] = 0;
                    }
                } else {
                    yards.push(yard);
                }
            }

            settlement = { place, town, at, size, yards };
            this.laid.set(place.id, settlement);
            this.onLaid(settlement);
        }

        return settlement;
    }

    /** What laying a place out takes (layoutTown's options), for laying it out elsewhere. */
    specOf(place) {
        return { seed: place.seed, kind: place.kind, exits: waysOut(this.plan, place), people: place.race ?? "human" };
    }

    /**
     * A place laid out elsewhere (off the page's thread: world/layouts.js) from its specOf, to be
     * taken as it is when it's first wanted rather than laid out then.
     */
    give(place, spec, town) {
        if (!this.laid.has(place.id)) {
            this.given.set(place.id, { spec, town });
        }
    }

    /** Lay out every place near a chunk (before making it). */
    settle(cx, cy) {
        return this.near(cx, cy).map((place) => this.of(place));
    }

    /**
     * What a laid-out settlement has on a square of the world: { blocked, opaque, ground, water (1
     * over its lagoon, the lizard folk's) }, or null where it has nothing (its fields: the land's
     * own).
     */
    squareAt(settlement, x, y) {
        const { at, size, town } = settlement;
        const [i, j] = [x - at[0], y - at[1]];

        if (i < 0 || j < 0 || i >= size || j >= size) {
            return null;
        }

        const [blocked, opaque, ground, water] = [town.blocked[j][i], town.opaque[j][i], town.ground[j][i], town.water?.[j][i] ?? 0];

        return blocked || opaque || water || ground !== GROUND.grass || inside(town, i + 0.5, j + 0.5) ? { blocked, opaque, ground, water } : null;
    }

    /**
     * The plank walks over the lagoons of the settlements laid out near a chunk whose middles are
     * in it, in the world's metres: [{ a, b, half, layer, place }] (layoutTown's walks, and whose they are).
     */
    walksIn(cx, cy) {
        const found = [];

        for (const place of this.near(cx, cy)) {
            const settlement = this.laid.get(place.id);

            for (const { a, b, half, layer } of settlement?.town.walks ?? []) {
                const [ax, ay, bx, by] = [a[0] + settlement.at[0], a[1] + settlement.at[1], b[0] + settlement.at[0], b[1] + settlement.at[1]];

                if (Math.floor((ax + bx) / 2 / CHUNK) === cx && Math.floor((ay + by) / 2 / CHUNK) === cy) {
                    found.push({ a: [ax, ay], b: [bx, by], half, layer, place });
                }
            }
        }

        return found;
    }

    /**
     * The pieces of the settlements laid out near a chunk whose middles are in it, in the world's
     * metres: [{ ...piece, x, y (its middle, metres, in the world), place (its settlement's id) }].
     */
    piecesIn(cx, cy) {
        const [x0, y0] = [cx * CHUNK, cy * CHUNK];
        const found = [];

        for (const place of this.near(cx, cy)) {
            const settlement = this.laid.get(place.id);

            if (!settlement) {
                continue;
            }

            for (const piece of settlement.town.pieces) {
                const [x, y] = [piece.x + settlement.at[0], piece.y + settlement.at[1]];

                if (x >= x0 && y >= y0 && x < x0 + CHUNK && y < y0 + CHUNK) {
                    found.push({ ...piece, x, y, place: place.id });
                }
            }
        }

        return found;
    }

    /**
     * The yards behind the houses of the settlements laid out near a chunk whose middles are in
     * it, in the world's metres: [{ ...yard, x, y (its middle, metres, in the world), place }]
     * (layoutTown's yards, those that are there).
     */
    yardsIn(cx, cy) {
        const [x0, y0] = [cx * CHUNK, cy * CHUNK];
        const found = [];

        for (const place of this.near(cx, cy)) {
            const settlement = this.laid.get(place.id);

            for (const yard of settlement?.yards ?? []) {
                const [x, y] = [yard.x + settlement.at[0], yard.y + settlement.at[1]];

                if (x >= x0 && y >= y0 && x < x0 + CHUNK && y < y0 + CHUNK) {
                    found.push({ ...yard, x, y, place: place.id });
                }
            }
        }

        return found;
    }

    /** The settlement (laid out) whose square a point (metres) is in, or null. */
    at(x, y) {
        for (const place of this.near(Math.floor(x / CHUNK), Math.floor(y / CHUNK))) {
            const settlement = this.laid.get(place.id);

            if (settlement && x >= settlement.at[0] && y >= settlement.at[1] && x < settlement.at[0] + settlement.size && y < settlement.at[1] + settlement.size) {
                return settlement;
            }
        }

        return null;
    }
}

// Whether a yard (layoutTown's, its settlement's layout `town` at `at` in the world) reaches out
// past its settlement's edge over the land's water, a bridge or a road (`landAt`): points over it
// a little in from its edges, and the squares its fences stand on
function astray(yard, town, at, landAt) {
    const [w, d] = [yard.w * PLOT, yard.h * PLOT];
    const [s, c] = [sin(yard.facing), cos(yard.facing)];
    const points = [0.4, w / 2, w - 0.4].flatMap((u) => [0.4, d / 2, d - 0.4].map((v) => [yard.x + (u - w / 2) * c + (v - d / 2) * s, yard.y - (u - w / 2) * s + (v - d / 2) * c]));

    return [...points, ...yard.squares.map(([i, j]) => [i + 0.5, j + 0.5])].some(([x, y]) => {
        if (inside(town, x, y)) {
            return false;
        }

        const land = landAt(Math.floor(x) + at[0], Math.floor(y) + at[1]);

        return Boolean(land.water || land.bridge || land.road);
    });
}

// Is a point (in a layout's own metres) inside its settlement's edge (its radius: the town, not
// its fields)?
function inside(town, x, y) {
    return hypot(x - town.centre[0], y - town.centre[1]) < town.radius;
}
