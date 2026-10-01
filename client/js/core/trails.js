// Foot paths up into the hills and mountains: one from the roads to each cave, ruin, shrine, ring of
// standing stones, ruined castle and lair up there (the plan's sites on land TRAILS.height high and
// more, within TRAILS.reach of a road), found its own way over the land (terrain/ways.js) at a
// walker's grade, so it climbs in hairpins where the land's steep, and keeping out of the town and
// the settlements. The roads through the mountains' feet thus lead on, by narrow paths, up to what
// there is to find in them.
//
// Each is found when the land near it is first wanted (anything about a chunk within its room), or
// ahead of then off the page's thread (world/terrains.js) and given: either way the same, so every
// player's world agrees.

import { GRADE, ROAD } from "./terrain/ground.js";
import { wayOver, rounded } from "./terrain/ways.js";
import { hypot } from "./exact.js";
import { CELL, CELLS, WORLD_SIZE } from "./worldplan/plan.js";

/**
 * Trails: how high the land must be (the plan's height) for a site there to have one, how far from
 * a road it may be (metres), how much room a trail has round the straight way to it to find its
 * own (metres), and its half-width (metres). It climbs no steeper than a path's GRADE.
 */
export const TRAILS = Object.freeze({ height: 0.5, reach: 700, room: 96, half: 0.7 });

/** The sites a trail goes up to. */
export const TRAIL_SITES = Object.freeze(["cave", "ruins", "shrine", "standing stones", "ruined castle", "dragon's lair"]);

// How far past a trail's room its land must be wanted for it to be found first (metres: as far as
// its shoulders reach, so every chunk whose ground it levels has it from the first)
const MARGIN = TRAILS.half + ROAD.most + 2;

export class Trails {
    /**
     * @param {object} plan - The world plan.
     * @param {Array} lines - The roads' lines ({ planned: [[x, y], ...] }) trails start from.
     * @param {Array} keepOut - Rectangles ([x0, y0, x1, y1], metres) trails keep out of: the town and
     *     the settlements.
     */
    constructor(plan, lines, keepOut = []) {
        this.plan = plan;
        this.keepOut = keepOut;
        this.all = [];

        // The sites up in the hills, nearest a road first; each reached from its road, or from a
        // site reached already if that's nearer (so trails branch from each other, rather than
        // two running side by side from one road to sites near each other)
        const sites = plan.sites
            .filter(({ kind, cell: [cx, cy] }) => TRAIL_SITES.includes(kind) && plan.height[cy * CELLS + cx] >= TRAILS.height)
            .map((site) => ({ site, road: nearestOn(lines, site.at) }))
            .filter(({ road }) => road)
            .map((each) => ({ ...each, gap: hypot(each.road[0] - each.site.at[0], each.road[1] - each.site.at[1]) }))
            .sort((a, b) => a.gap - b.gap || (a.site.id < b.site.id ? -1 : 1));
        const reached = [];

        for (const { site, road, gap } of sites) {
            const branch = reached.reduce((best, at) => (hypot(at[0] - site.at[0], at[1] - site.at[1]) < hypot(best[0] - site.at[0], best[1] - site.at[1]) ? at : best), road);
            const from = branch === road ? road : [...branch];
            const length = hypot(from[0] - site.at[0], from[1] - site.at[1]);

            if (gap > TRAILS.reach || length < CELL) {
                continue;
            }

            reached.push(site.at);

            const box = [
                Math.max(0, Math.min(from[0], site.at[0]) - TRAILS.room),
                Math.max(0, Math.min(from[1], site.at[1]) - TRAILS.room),
                Math.min(WORLD_SIZE - 1, Math.max(from[0], site.at[0]) + TRAILS.room),
                Math.min(WORLD_SIZE - 1, Math.max(from[1], site.at[1]) + TRAILS.room),
            ];

            this.all.push({ id: `trail ${site.id}`, site: site.id, from, to: [...site.at], box, points: null, given: null });
        }
    }

    /** The trails whose room comes near a chunk (cx, cy: CHUNK metres a side), found or not. */
    near(cx, cy, chunk) {
        const [x0, y0, x1, y1] = [cx * chunk - MARGIN, cy * chunk - MARGIN, (cx + 1) * chunk + MARGIN, (cy + 1) * chunk + MARGIN];

        return this.all.filter(({ box }) => box[2] > x0 && box[0] < x1 && box[3] > y0 && box[1] < y1);
    }

    /**
     * A trail's way (found now, if it isn't yet, or as it was found elsewhere and given): its
     * points ([x, y], metres, from the road to the site), or null if it has none.
     */
    find(trail) {
        if (trail.points === null) {
            trail.points = trail.given ?? routeTrail(this.plan, trail, this.keepOut) ?? false;
            trail.given = null;
        }

        return trail.points || null;
    }

    /** A trail's way, found elsewhere (routeTrail's, on the same plan): kept for when it's wanted. */
    give(id, points) {
        const trail = this.all.find((each) => each.id === id);

        if (trail && trail.points === null) {
            trail.given = points ?? false;
        }
    }
}

/**
 * A trail's way over the land ({ from, to, box }: Trails' own), keeping out of `keepOut`'s
 * rectangles: its points, rounded at its turns, or null if there's none.
 */
export function routeTrail(plan, { from, to, box }, keepOut = []) {
    const way = wayOver(plan, from, to, { grade: GRADE.path, box, avoid: (x, y) => keepOut.some(([x0, y0, x1, y1]) => x >= x0 && y >= y0 && x < x1 && y < y1) });

    return way ? rounded(way) : null;
}

// The nearest point to `at` on any of the lines ([x, y], metres), or null if there are none
// (compared by the square of the distance: no segment further off than the nearest yet, by its
// bounds, is looked at closer)
function nearestOn(lines, [px, py]) {
    let [best, gap] = [null, Infinity];

    for (const { planned } of lines) {
        for (let k = 0; k < planned.length - 1; k++) {
            const [[ax, ay], [bx, by]] = [planned[k], planned[k + 1]];
            const [ox, oy] = [Math.max(0, Math.min(ax, bx) - px, px - Math.max(ax, bx)), Math.max(0, Math.min(ay, by) - py, py - Math.max(ay, by))];

            if (ox * ox + oy * oy >= gap) {
                continue;
            }

            const [dx, dy] = [bx - ax, by - ay];
            const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
            const [x, y] = [ax + dx * t, ay + dy * t];
            const off = (px - x) * (px - x) + (py - y) * (py - y);

            if (off < gap) {
                [best, gap] = [[x, y], off];
            }
        }
    }

    return best;
}
