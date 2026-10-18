// Which way somewhere is, in words: by the compass ("north-east"), and how far from a town ("0.8 km
// north-east of Oakford"). The one way of saying it for everything that does: the requests
// (core/standing.js), the cults' word (core/cultword.js), the rumours of places (core/rumours.js).
//
// Pure and exact (core/exact.js), the same on every machine.

import { hypot } from "./exact.js";

/** Which way one place is from another ([x, y] metres), by the compass (north up the map, as y falls): "north", "south-east"... */
export function compass([fx, fy], [tx, ty]) {
    const [dx, dy] = [tx - fx, ty - fy];
    const ns = dy < 0 ? "north" : "south";
    const ew = dx > 0 ? "east" : "west";

    if (Math.abs(dx) > 2.414 * Math.abs(dy)) {
        return ew;
    }

    return Math.abs(dy) > 2.414 * Math.abs(dx) ? ns : `${ns}-${ew}`;
}

/** Which way a place ([x, y] metres) is from a town ({ name, at }), in words: "0.8 km north-east of Oakford". */
export const wayOf = (town, at) => `${Math.round(hypot(at[0] - town.at[0], at[1] - town.at[1]) / 100) / 10} km ${compass(town.at, at)} of ${town.name}`;
