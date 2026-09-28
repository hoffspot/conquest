// The war come to life near a player (docs/WAR.md M2): where a town's soldiers stand guard, and
// the rounds its patrols walk, worked out from the plan (the same every time for a place).
//
// Guards stand in pairs either side of each road out of the town, just past its edge, facing out
// (then round the edge, if it has fewer roads than guards); each patrol walks a round of the town
// just outside its edge, through its ways out. Everything is in the world's metres: the host
// finds the free squares nearest them.

import { waysOut } from "../settlements.js";
import { SETTLEMENT_KINDS } from "../setpieces/town.js";
import { HOLDINGS } from "./war.js";

/** How many guards each kind of place posts at most (the war's garrison, as far as it goes). */
export const POSTED = Object.freeze({ capital: 8, city: 6, town: 4, village: 2 });

/** How many soldiers walk each patrol. */
export const PATROL_SIZE = 2;

/** How far past the town's edge its guards stand, and its patrols walk (metres). */
const GUARD_OUT = 4;
const ROUND_OUT = 10;

/** How far either side of the road a pair of guards stand (metres). */
const BESIDE = 2.5;

/** How many points each patrol's round goes through. */
const ROUND_POINTS = 6;

/** The way something faces (battle.js: radians from south, +y, turning towards east, +x), looking along (dx, dy). */
const facingAlong = (dx, dy) => Math.atan2(dx, dy);

/**
 * Where a town's guards stand: [{ at: [x, y] metres, facing }], at most POSTED of its kind.
 * `middle` is where its layout's middle is (the town the player starts in is set in a little off
 * its plan's place).
 */
export function postsOf(plan, place, { middle = place.at } = {}) {
    const radius = SETTLEMENT_KINDS[place.kind].radius + GUARD_OUT;
    const most = POSTED[place.kind] ?? 0;
    const roads = waysOut(plan, place);
    const gates = roads.length ? [...roads] : [0];

    // (Fewer roads than pairs of guards: the rest round the edge, between them)
    while (gates.length * 2 < most) {
        const sorted = [...gates].sort((a, b) => a - b);
        const gaps = sorted.map((angle, k) => ({ angle, gap: (k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + Math.PI * 2) - angle }));
        const widest = gaps.reduce((best, each) => (each.gap > best.gap ? each : best));

        gates.push(widest.angle + widest.gap / 2);
    }

    const posts = [];

    for (const angle of gates) {
        const [ox, oy] = [Math.cos(angle), Math.sin(angle)];
        const [cx, cy] = [middle[0] + ox * radius, middle[1] + oy * radius];

        for (const side of [-1, 1]) {
            posts.push({ at: [cx - oy * BESIDE * side, cy + ox * BESIDE * side], facing: facingAlong(ox, oy) });
        }
    }

    return posts.slice(0, most);
}

/**
 * How many patrols a town sends out, and the round each walks: [[x, y]...] metres, just outside
 * its edge, the `k`th starting a way round from the first.
 */
export function roundsOf(plan, place, { middle = place.at } = {}) {
    const radius = SETTLEMENT_KINDS[place.kind].radius + ROUND_OUT;
    const count = HOLDINGS[place.kind]?.patrols ?? 0;
    const start = waysOut(plan, place)[0] ?? 0;

    return Array.from({ length: count }, (unused, k) =>
        Array.from({ length: ROUND_POINTS }, (each, j) => {
            // (Each round the other way from the last)
            const angle = start + ((k % 2 ? -1 : 1) * j * Math.PI * 2) / ROUND_POINTS + (k * Math.PI) / ROUND_POINTS;

            return [middle[0] + Math.cos(angle) * radius, middle[1] + Math.sin(angle) * radius];
        }),
    );
}

/** How far out past its guards a town's banner stands (metres), beside the road. */
const BANNER_OUT = 3;

/**
 * Where a town's banners stand: one beside each road out that has guards at it, a little further
 * out than them (clear of the town's houses), at the road's side: [{ at: [x, y] metres, facing }].
 */
export function bannersOf(plan, place, { middle = place.at } = {}) {
    const posts = postsOf(plan, place, { middle });
    const banners = [];

    for (let k = 0; k + 1 < posts.length; k += 2) {
        const [a, b] = [posts[k], posts[k + 1]];
        const [out, side] = [[Math.sin(a.facing), Math.cos(a.facing)], [a.at[0] - b.at[0], a.at[1] - b.at[1]]];
        const across = Math.hypot(...side) || 1;

        banners.push({ at: [a.at[0] + out[0] * BANNER_OUT + (side[0] / across) * 0.8, a.at[1] + out[1] * BANNER_OUT + (side[1] / across) * 0.8], facing: a.facing });
    }

    return banners;
}
