// Foot paths up into the hills and mountains: one from the roads to each cave, ruin, shrine, ring of
// standing stones, ruined castle and lair up there (the plan's sites on land TRAILS.height high and
// more, within TRAILS.reach of a road), and to each people's works wherever it is (the way its
// wagons go), found its own way over the land (terrain/ways.js) at a
// walker's grade, so it climbs in hairpins where the land's steep, and keeping out of the town and
// the settlements. The roads through the mountains' feet thus lead on, by narrow paths, up to what
// there is to find in them. Each site's turned to face the way its trail comes (sites.js), and
// its trail ends a step before its front, where its way in is (a cave's mouth, a ruin's door); or
// one cut into a hillside faces down it, its trail ending where the floor dug in front of it meets
// the hill.
//
// Each is found when the land near it is first wanted (anything about a chunk within its room), or
// ahead of then off the page's thread (world/terrains.js) and given: either way the same, so every
// player's world agrees.

import { GRADE, ROAD, STAIRS } from "./terrain/ground.js";
import { wayOver, rounded } from "./terrain/ways.js";
import { wadeable, watersOf } from "./terrain/waters.js";
import { heightAt, stillLevelAt } from "./terrain/height.js";
import { atan2, cos, hypot, sin } from "./exact.js";
import { layoutNeutral, NEUTRAL } from "./setpieces/neutral.js";
import { PLOT } from "./setpieces/pieces.js";
import { CUT_EASE, cutOf, isNeutral, LIE, restingOf } from "./sites.js";
import { CELL, CELLS, WORKS, WORLD_SIZE } from "./worldplan/plan.js";

/**
 * Trails: how high the land must be (the plan's height) for a site there to have one, how far from
 * a road it may be (metres), how much room a trail has round the straight way to it to find its
 * own (metres), its half-width (metres), how far before its site's front it ends (metres), and how
 * far clear of the sites no people keeps it goes round them (metres, past their plots). It climbs
 * no steeper than a path's GRADE, but in stone steps up mountainsides (ground.js STAIRS).
 */
export const TRAILS = Object.freeze({ height: 0.5, reach: 700, room: 160, half: 0.7, front: 2, clear: 2 });

/** The sites a trail goes up to (in the hills); and each people's works, wherever they are (their convoys' way to the road). */
export const TRAIL_SITES = Object.freeze(["cave", "ruins", "shrine", "standing stones", "ruined castle", "dragon's lair"]);
const WORKED = WORKS.map(({ kind }) => kind);

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
            .filter(({ kind, cell: [cx, cy] }) => (TRAIL_SITES.includes(kind) && plan.height[cy * CELLS + cx] >= TRAILS.height) || WORKED.includes(kind))
            .map((site) => ({ site, road: nearestOn(lines, site.at) }))
            .filter(({ road }) => road)
            .map((each) => ({ ...each, gap: hypot(each.road[0] - each.site.at[0], each.road[1] - each.site.at[1]) }))
            .sort((a, b) => a.gap - b.gap || (a.site.id < b.site.id ? -1 : 1));
        const reached = [];

        this.facings = new Map();

        for (const { site, road, gap } of sites) {
            const branch = reached.reduce((best, at) => (hypot(at[0] - site.at[0], at[1] - site.at[1]) < hypot(best[0] - site.at[0], best[1] - site.at[1]) ? at : best), road);
            const from = branch === road ? road : [...branch];
            const length = hypot(from[0] - site.at[0], from[1] - site.at[1]);

            if (gap > TRAILS.reach || length < CELL) {
                continue;
            }

            // (The site, where it rests, facing down the hill it's cut into or else the way its
            // trail comes from, the trail ending before its front, or where it's cut into a hill,
            // past the banks of the floor dug in front of it, where that's level with the hill;
            // trails branching from it start there too)
            const rest = restingOf(plan, site);
            const [sx, sy] = rest.at;
            const facing = rest.facing ?? atan2(from[0] - sx, from[1] - sy);
            const depth = (NEUTRAL[site.kind]?.[1] ?? 0) * PLOT;
            const laid = rest.form === "hillside" ? layoutNeutral({ kind: site.kind, seed: site.seed, form: rest.form }) : null;
            const cut = cutOf(laid, rest.slope);
            const ahead = cut ? Math.max(depth / 2 + TRAILS.front, laid.cut.y + 2 * cut + CUT_EASE - depth / 2) : depth / 2 + TRAILS.front;
            const to = [sx + sin(facing) * ahead, sy + cos(facing) * ahead];

            // (No trail branches from a works': it's only its convoys' way to the road, and no
            // other trail moves for it)
            if (!WORKED.includes(site.kind)) {
                reached.push(to);
            }
            this.facings.set(site.id, facing);

            const box = [
                Math.max(0, Math.min(from[0], to[0]) - TRAILS.room),
                Math.max(0, Math.min(from[1], to[1]) - TRAILS.room),
                Math.min(WORLD_SIZE - 1, Math.max(from[0], to[0]) + TRAILS.room),
                Math.min(WORLD_SIZE - 1, Math.max(from[1], to[1]) + TRAILS.room),
            ];

            this.all.push({ id: `trail ${site.id}`, site: site.id, from, to, box, avoid: [], points: null, given: null });
        }

        // (Each going round the sites no people keeps near it, its own but for its front, so none
        // runs through what stands at one: those it goes up to as they're turned to face it, the
        // rest by how far they reach)
        // (Where each rests worked out only for those that might be near a trail: the watchtowers
        // no one keeps, on the highest ground, are seldom on the way)
        const near = (at, far) => this.all.some(({ box: [x0, y0, x1, y1] }) => at[0] + far > x0 && at[0] - far < x1 && at[1] + far > y0 && at[1] - far < y1);
        const rooms = plan.sites
            .filter((site) => isNeutral(site) && !LIE[site.kind] && near(site.at, 120))
            .map((site) => {
                const [halfW, halfD] = NEUTRAL[site.kind].map((plots) => (plots * PLOT) / 2 + TRAILS.clear);
                const facing = this.facings.get(site.id);
                const [x, y] = restingOf(plan, site).at;

                return facing === undefined ? [x, y, null, hypot(halfW, halfD)] : [x, y, facing, halfW, halfD];
            });

        for (const trail of this.all) {
            const [x0, y0, x1, y1] = trail.box;

            trail.avoid = rooms.filter(([x, y, , a, b = a]) => x + Math.max(a, b) * 1.5 > x0 && x - Math.max(a, b) * 1.5 < x1 && y + Math.max(a, b) * 1.5 > y0 && y - Math.max(a, b) * 1.5 < y1);
        }
    }

    /** Which way a site with a trail faces (radians, sites.js: the way its trail comes), or null. */
    facingOf(site) {
        return this.facings.get(site.id) ?? null;
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
 * A trail's way over the land ({ from, to, box, avoid }: Trails' own), keeping out of `keepOut`'s
 * rectangles and round the sites in `avoid`, over rivers only at their fords: its points, rounded
 * at its turns, or null if there's none. It never climbs faster than its steps if it can help it
 * (so it's never cut deep into the land to keep to them): only if there's no such way in its room
 * does it climb faster where it must, as dearly as ways.js has it.
 */
export function routeTrail(plan, { from, to, box, avoid = [] }, keepOut = []) {
    const waters = watersOf(plan);
    // (Over a river only at a ford, where it can be waded: a little either side of its banks kept
    // clear too, so a step between two points of the lattice doesn't cross it; and out of a lake's
    // shallows, where the ground as it's made dips under it though the land's lie doesn't)
    const deep = (x, y) => {
        const river = waters.river(x, y, TRAILS.clear);
        const level = stillLevelAt(plan, x, y);

        return (river !== null && !river.stream && river.ford < 0.5 && !wadeable(river.depth, river.speed)) || (level !== null && heightAt(plan, x, y) < level + 0.5);
    };
    const ways = {
        grade: GRADE.path,
        box,
        avoid: (x, y) => keepOut.some(([x0, y0, x1, y1]) => x >= x0 && y >= y0 && x < x1 && y < y1) || avoid.some((room) => inRoom(room, x, y)) || deep(x, y),
        steps: { grade: GRADE.steps, steep: STAIRS.rising, cost: STAIRS.cost },
    };
    const way = wayOver(plan, from, to, { ...ways, hard: GRADE.steps }) ?? wayOver(plan, from, to, ways);

    return way ? rounded(way) : null;
}

// Whether (x, y) is in a site's room ([x, y, facing, half across, half deep]: a rectangle turned to
// face `facing`; or [x, y, null, radius]: a disc)
function inRoom([cx, cy, facing, a, b], x, y) {
    const [dx, dy] = [x - cx, y - cy];

    if (facing === null) {
        return dx * dx + dy * dy < a * a;
    }

    const [s, c] = [sin(facing), cos(facing)];

    return Math.abs(dx * c - dy * s) < a && Math.abs(dx * s + dy * c) < b;
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
