// The ways the war's forces go (docs/WAR.md): the plan's roads between its places, and across
// country where there's none (slower going), as a graph of the places, for finding the quickest
// way from one to another.
//
// Worked out from the plan (the same every time for a seed): nothing here is kept.

import { CELL } from "../worldplan/plan.js";
import { hypot } from "../exact.js";

/** How much longer going across country takes than by road (a metre of it counts as this many). */
export const ACROSS_COUNTRY = 1.8;

// Each place can be reached across country from its nearest few others (as well as by its roads)
const ACROSS_TO = 4;

// Road cells kept as waypoints (every so many: the roads wind gently enough between them)
const WAYPOINT_EVERY = 3;

const centre = ([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL];
const apart = ([ax, ay], [bx, by]) => hypot(ax - bx, ay - by);

export class Roads {
    /** @param {object} plan - The world plan (worldplan/plan.js planWorld). */
    constructor(plan) {
        this.plan = plan;
        this.places = new Map(plan.places.map((place) => [place.id, place]));

        /** From each place: [{ to, length (as it counts), points (the way, in metres) }]. */
        this.edges = new Map(plan.places.map(({ id }) => [id, []]));

        for (const road of plan.roads) {
            if (!this.places.has(road.from) || !this.places.has(road.to)) {
                continue;
            }

            const points = road.cells.filter((cell, k) => k % WAYPOINT_EVERY === 0 || k === road.cells.length - 1).map(centre);
            const length = points.reduce((sum, point, k) => sum + (k ? apart(points[k - 1], point) : 0), 0);

            this.#join(road.from, road.to, length, points, road.kind);
        }

        // Across country, to the nearest few others
        for (const place of plan.places) {
            const nearest = plan.places
                .filter((other) => other !== place)
                .map((other) => ({ other, distance: apart(place.at, other.at) }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, ACROSS_TO);

            for (const { other, distance } of nearest) {
                if (!this.edges.get(place.id).some(({ to }) => to === other.id)) {
                    this.#join(place.id, other.id, distance * ACROSS_COUNTRY, [place.at, other.at], "across");
                }
            }
        }
    }

    #join(from, to, length, points, kind) {
        this.edges.get(from).push({ to, length, points, kind });
        this.edges.get(to).push({ to: from, length, points: [...points].reverse(), kind });
    }

    /** The place nearest a point ([x, y] metres), of those `which` allows (all, if not given). */
    nearest(at, which = () => true) {
        let best = null;
        let bestDistance = Infinity;

        for (const place of this.plan.places) {
            const distance = apart(at, place.at);

            if (distance < bestDistance && which(place)) {
                best = place;
                bestDistance = distance;
            }
        }

        return best;
    }

    /**
     * The quickest way from one place to another (their ids): the points to go through (metres,
     * from the first's middle to the last's), and how long it counts as; null if there's none.
     */
    route(fromId, toId) {
        if (!this.places.has(fromId) || !this.places.has(toId)) {
            return null;
        }

        // Dijkstra over the places (a couple of hundred: a plain search for the nearest is quick)
        const best = new Map([[fromId, 0]]);
        const via = new Map();
        const done = new Set();

        while (true) {
            let here = null;
            let hereLength = Infinity;

            for (const [id, length] of best) {
                if (!done.has(id) && length < hereLength) {
                    here = id;
                    hereLength = length;
                }
            }

            if (here === null) {
                return null;
            }

            if (here === toId) {
                break;
            }

            done.add(here);

            for (const edge of this.edges.get(here)) {
                const length = hereLength + edge.length;

                if (length < (best.get(edge.to) ?? Infinity)) {
                    best.set(edge.to, length);
                    via.set(edge.to, { from: here, edge });
                }
            }
        }

        const legs = [];

        for (let id = toId; id !== fromId; id = via.get(id).from) {
            legs.unshift(via.get(id).edge);
        }

        const points = [this.places.get(fromId).at];

        for (const { points: way } of legs) {
            points.push(...way.slice(1));
        }

        if (points.length === 1) {
            points.push(this.places.get(toId).at);
        }

        return { points: points.map(([x, y]) => [Math.round(x), Math.round(y)]), length: best.get(toId) };
    }
}
