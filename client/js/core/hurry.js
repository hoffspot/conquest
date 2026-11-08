// How soon a player could be somewhere (docs/WAR.md *A fair chance*), for what's asked of them
// that won't wait: the requests their people's officials give (core/standing.js) and the war
// missions messengers bring (core/missions.js). Nothing's offered that a player setting out at
// once, hurrying, couldn't get to in time: an envoy, a convoy, wagons or reinforcements they'd
// never meet on its road before it ends (onTheRoad: `met`, at HURRY). A request with a time to do
// it in has the way there in it too (turnsTo). And nothing's failed by what happened before they
// could have got there, going at a steady PACE, only by what happened once they could have: each
// has the turn they'd have had their chance by (`due`: dueAt, or onTheRoad's), and until then, or
// till they're there, what goes wrong comes to nothing (hadChance).
//
// Pure: no world, no host, so it's tested on its own (test/hurry.test.js).

import { hypot } from "./exact.js";
import { REINFORCE } from "./war/armies.js";
import { SUPPLY } from "./war/supply.js";
import { CONVOY, SPEEDS } from "./war/war.js";

/**
 * How far (metres) a player's counted on to get in a war turn (a minute) on their way somewhere,
 * before they're held to it: less than a walk (1.7 m/s, about 100 m a minute: core/battle.js
 * KINDS.player), for the way round what's in it.
 */
export const PACE = 80;

/**
 * How far (metres) a player can get in a war turn hurrying, running while their breath lasts and
 * walking while it comes back (core/battle.js SPRINT, STAMINA_DRAIN, STAMINA_RECOVERY: about 250
 * at first, more as it grows), for whether something on the road could be caught at all.
 */
export const HURRY = 250;

/** War turns more than the way takes them, before a player's counted as having had their chance. */
export const GRACE = 3;

/**
 * How near (metres) something on the road must come to a player to be met: the world plays it
 * out round them from there (core/host.js ENVOY, CONVOY_NEAR and WAGON_NEAR: `near`).
 */
export const MEET = 150;

/** How far each kind of thing on the road goes in a war turn while no one's near it (metres: core/war/war.js #march). */
export const ON_THE_ROAD = Object.freeze({ envoy: SPEEDS.envoy, convoy: CONVOY.speed, supply: SUPPLY.speed, reinforcement: REINFORCE.speed });

const apart = ([ax, ay], [bx, by]) => hypot(ax - bx, ay - by);

/** War turns a player at `from` ([x, y] metres) takes, hurrying, to get within `reach` metres of `to`. */
export function turnsTo(from, to, reach = 0) {
    return from && to ? Math.ceil(Math.max(0, apart(from, to) - reach) / PACE) : 0;
}

/** The war turn by which a player setting out from `from` on `turn` has had their chance at `to` (within `reach`). */
export function dueAt(from, to, turn, reach = 0) {
    return turn + turnsTo(from, to, reach) + GRACE;
}

/**
 * What a player at `from`, setting out on `turn`, has of something on the road (`force`, as for
 * meetAt): whether they could meet it before its end, hurrying (`met`), and the turn they'd have
 * had their chance at it by (`due`: the turn they'd meet it going at PACE, or, as they wouldn't,
 * the turn it's at its end; and GRACE besides).
 */
export function onTheRoad(from, force, turn, { short = 0 } = {}) {
    const meet = meetAt(from, force, turn, { short });

    return { met: meetAt(from, force, turn, { short, pace: HURRY }) !== null, due: (meet ?? endAt(force, turn, { short }) ?? turn) + GRACE };
}

/**
 * The soonest war turn a player at `from`, setting out on `turn` and going `pace` metres a turn,
 * could meet `force` on its road, within MEET of it, before it's at the end: it going
 * ON_THE_ROAD[force.kind] metres a turn along what's left of its `path` (from where it is, `at`,
 * past its `leg`), and stopping `short` metres before the end (where reinforcements join their
 * army). Null: it'd be at the end first.
 */
export function meetAt(from, force, turn, { short = 0, pace = PACE } = {}) {
    const speed = ON_THE_ROAD[force?.kind];

    if (!from || !speed || !force.at) {
        return null;
    }

    const points = [force.at, ...(force.path ?? []).slice((force.leg ?? 0) + 1)];
    const legs = points.slice(1).map((point, i) => apart(points[i], point));
    const end = Math.max(0, legs.reduce((sum, each) => sum + each, 0) - short);

    // (Along the road a quarter of a turn's going at a time, the first spot they could be at by
    // the time it's there)
    for (let along = 0; ; along = Math.min(end, along + speed / 4)) {
        const theirs = along / speed;

        if (Math.max(0, apart(from, spotAlong(points, legs, along)) - MEET) / pace <= theirs) {
            return turn + Math.ceil(theirs);
        }

        if (along >= end) {
            return null;
        }
    }
}

/**
 * The war turn something on the road (`force`, as for meetAt) would be at the end of it, going on
 * from `turn` as it is; or null: it's not on a road.
 */
export function endAt(force, turn, { short = 0 } = {}) {
    const speed = ON_THE_ROAD[force?.kind];

    if (!speed || !force.at) {
        return null;
    }

    const points = [force.at, ...(force.path ?? []).slice((force.leg ?? 0) + 1)];
    const length = points.slice(1).reduce((sum, point, i) => sum + apart(points[i], point), 0);

    return turn + Math.ceil(Math.max(0, length - short) / speed);
}

// Where a road (`points`, its `legs` as long as they are) is `along` metres from its start
function spotAlong(points, legs, along) {
    let left = along;

    for (let i = 0; i < legs.length; i++) {
        if (left <= legs[i]) {
            const [ax, ay] = points[i];
            const [bx, by] = points[i + 1];
            const t = legs[i] > 0 ? left / legs[i] : 0;

            return [ax + (bx - ax) * t, ay + (by - ay) * t];
        }

        left -= legs[i];
    }

    return points[points.length - 1];
}

/**
 * Whether a player's had their chance at what's asked of them (`asked`: a request or a war
 * mission) on the war's `turn`: they've been there, or the turn they'd have been by (`due`) has
 * gone. One with no `due` (kept from before there were any) has.
 */
export function hadChance(asked, turn) {
    return Boolean(asked.there) || !Number.isFinite(asked.due) || turn > asked.due;
}
