// Places seen from high ground (docs/WILDS.md *Seen from high ground*; the Alexandrian's "visible"
// locations, spotted from a distance): a player standing on a rise well above the land round them
// finds the places worth finding the land between doesn't hide, the further the higher they stand
// over them, without going near. Kept as spotted (core/explored.js), and found wherever being near
// would count (Explored knows): the maps' icons, the rumours done with, a guild's survey ready.
//
// Pure arithmetic over the lie of the land (terrain/height.js landHeight: the same on every copy of
// the world); the world's host looks for them each time it looks round (host.js #sightings).

import { hypot } from "./exact.js";
import { landHeight } from "./terrain/height.js";

/**
 * How far a player sees from high ground: on a rise when the land stands `rise` metres or more
 * over the average of eight points `around` metres round; seeing `reach` metres ([least, most]),
 * the least and `per` metres more for each metre they stand over a place's ground, up to the most;
 * a place in sight when no land along the way (sampled every `step` metres, but for the last
 * `clear` metres at either end: the rise's own top, and the place's own ground) stands over the
 * line from their eyes (`eye` metres up) to `over` metres above the place's ground.
 */
export const SIGHTING = Object.freeze({ around: 80, rise: 10, eye: 1.7, over: 4, reach: [200, 1000], per: 15, step: 16, clear: 24 });

/**
 * Is a spot ([x, y] metres) high ground (SIGHTING): the land's height there (metres) if it stands
 * SIGHTING.rise over the average of the eight points SIGHTING.around round it, else null.
 * (`height(plan, x, y)`: the land's height, landHeight's.)
 */
export function highGround(plan, [x, y], height = landHeight) {
    const here = height(plan, x, y);
    const diagonal = SIGHTING.around * Math.SQRT1_2;
    const round = [[SIGHTING.around, 0], [-SIGHTING.around, 0], [0, SIGHTING.around], [0, -SIGHTING.around], [diagonal, diagonal], [diagonal, -diagonal], [-diagonal, diagonal], [-diagonal, -diagonal]];
    const about = round.reduce((sum, [dx, dy]) => sum + height(plan, x + dx, y + dy), 0) / round.length;

    return here - about >= SIGHTING.rise ? here : null;
}

/** How far (metres) a player standing at a height (`stand`, metres) sees a place whose ground's at `ground`: SIGHTING.reach. */
export function reachOver(stand, ground) {
    const [least, most] = SIGHTING.reach;

    return Math.min(most, least + SIGHTING.per * Math.max(0, stand - ground));
}

/**
 * Is a place ([px, py] metres) in sight of a player at [x, y] standing at `stand` metres (their
 * ground's height): within reach (reachOver), and no land along the way over the line from their
 * eyes to a little over its ground (SIGHTING)?
 */
export function inSight(plan, [x, y], stand, [px, py], height = landHeight) {
    const far = hypot(px - x, py - y);
    const ground = height(plan, px, py);

    if (far > reachOver(stand, ground)) {
        return false;
    }

    const [from, to] = [stand + SIGHTING.eye, ground + SIGHTING.over];

    for (let along = SIGHTING.clear; along <= far - SIGHTING.clear; along += SIGHTING.step) {
        const t = along / far;

        if (height(plan, x + (px - x) * t, y + (py - y) * t) > from + (to - from) * t) {
            return false;
        }
    }

    return true;
}

/**
 * Which of some places (`places`: [{ id, at: [x, y] }]) a player at a spot ([x, y] metres) sees
 * from high ground there: their ids, the nearest first; none off high ground (highGround).
 */
export function sightedFrom(plan, at, places, height = landHeight) {
    const stand = highGround(plan, at, height);

    if (stand === null) {
        return [];
    }

    const far = ({ at: [px, py] }) => hypot(px - at[0], py - at[1]);

    return places
        .filter((place) => far(place) <= SIGHTING.reach[1] && inSight(plan, at, stand, place.at, height))
        .sort((a, b) => far(a) - far(b) || (a.id < b.id ? -1 : 1))
        .map(({ id }) => id);
}
