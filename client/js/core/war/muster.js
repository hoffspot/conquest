// The war come to life near a player (docs/WAR.md M2, M6): where a town's soldiers stand guard,
// and the rounds its patrols walk, worked out from the plan (the same every time for a place);
// how a camp's laid out round its fire; and where a camp's sortie against its town sets out from
// and makes for.
//
// Guards stand in pairs either side of each road out of the town, just past its edge, facing out
// (then round the edge, if it has fewer roads than guards); each patrol walks a round of the town
// just outside its edge, through its ways out. Everything is in the world's metres: the host
// finds the free squares nearest them.

import { waysOut } from "../settlements.js";
import { SETTLEMENT_KINDS } from "../setpieces/town.js";
import { HOLDINGS } from "./war.js";
import { atan2, cos, hypot, sin } from "../exact.js";

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
const facingAlong = (dx, dy) => atan2(dx, dy);

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
        const [ox, oy] = [cos(angle), sin(angle)];
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

            return [middle[0] + cos(angle) * radius, middle[1] + sin(angle) * radius];
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
        const [out, side] = [[sin(a.facing), cos(a.facing)], [a.at[0] - b.at[0], a.at[1] - b.at[1]]];
        const across = hypot(side[0], side[1]) || 1;

        banners.push({ at: [a.at[0] + out[0] * BANNER_OUT + (side[0] / across) * 0.8, a.at[1] + out[1] * BANNER_OUT + (side[1] / across) * 0.8], facing: a.facing });
    }

    return banners;
}

/**
 * Where a town's braziers burn: one by each pair of guards at a road out, on the other side of the
 * road from their banner, a step out past them: [{ at: [x, y] metres }].
 */
export function braziersOf(plan, place, { middle = place.at } = {}) {
    const posts = postsOf(plan, place, { middle });
    const braziers = [];

    for (let k = 0; k + 1 < posts.length; k += 2) {
        const [a, b] = [posts[k], posts[k + 1]];
        const [out, side] = [[sin(a.facing), cos(a.facing)], [a.at[0] - b.at[0], a.at[1] - b.at[1]]];
        const across = hypot(side[0], side[1]) || 1;

        braziers.push({ at: [b.at[0] + out[0] * 1.5 - (side[0] / across) * 0.9, b.at[1] + out[1] * 1.5 - (side[1] / across) * 0.9] });
    }

    return braziers;
}

/**
 * A camp (docs/WAR.md M6): how many sentries it posts at most, and how far from its fire (metres);
 * how many tents it pitches round it, and how far out.
 */
export const CAMP = Object.freeze({ sentries: 6, ring: 8, tents: 5, pitch: 4.5 });

/** How far past its town's edge a camp's sortie sets out from (metres). */
export const SORTIE_OUT = 40;

// A number from an id, the same every time (to turn each camp a little its own way)
const hashOf = (id) => [...String(id)].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 7) >>> 0;

/**
 * A camp (one of the war's forces) laid out round its fire, in the world's metres: { fire ([x,
 * y]), tents ([{ at, facing }]: each facing the fire), posts ([{ at, facing }]: its sentries',
 * facing out) }, turned a little its own way, the same every time for a camp.
 */
export function campOf(camp, { sentries = CAMP.sentries } = {}) {
    const turn = ((hashOf(camp.id) % 360) * Math.PI) / 180;
    const [cx, cy] = camp.at;
    const round = (count, radius, offset, inward) =>
        Array.from({ length: count }, (_, k) => {
            const angle = turn + ((k + offset) / count) * Math.PI * 2;
            const [dx, dy] = [cos(angle), sin(angle)];

            return { at: [cx + dx * radius, cy + dy * radius], facing: inward ? facingAlong(-dx, -dy) : facingAlong(dx, dy) };
        });

    return { fire: [cx, cy], tents: round(CAMP.tents, CAMP.pitch, 0, true), posts: round(sentries, CAMP.ring, 0.5, false) };
}

/**
 * Where a camp's sortie against its town sets out from, and makes for (the world's metres): from
 * `SORTIE_OUT` past the town's edge on the camp's side, to its fields just outside its edge (a
 * raid: "raid") or into it (an assault): { from, to, facing (the way they go) }.
 */
export function sortieOf(place, camp, kind, { middle = place.at } = {}) {
    const radius = SETTLEMENT_KINDS[place.kind].radius;
    const [dx, dy] = [camp.at[0] - middle[0], camp.at[1] - middle[1]];
    const length = hypot(dx, dy);
    const [ux, uy] = length > 1e-6 ? [dx / length, dy / length] : [1, 0];
    const at = (distance) => [middle[0] + ux * distance, middle[1] + uy * distance];

    return { from: at(radius + SORTIE_OUT), to: kind === "raid" ? at(radius + GUARD_OUT + 2) : at(radius * 0.3), facing: facingAlong(-ux, -uy) };
}

