// Helpers shared by the tests.

import { navigatorOf } from "../client/js/core/navigation.js";

/** Parse a grid from strings: "#" is obstructed, anything else is passable. */
export function parseGrid(rows) {
    return rows.map((row) => [...row].map((cell) => (cell === "#" ? 1 : 0)));
}

/**
 * Whether a map's navigation mesh (core/navigation.js: the way characters walk) has a way from
 * one square to another, ending on it. `map` is a map, its squares, or its rows of blocked squares.
 */
export function reachable(map, [ax, ay], [bx, by]) {
    const end = navigatorOf(map.blocked ?? map).path([ax + 0.5, ay + 0.5], [bx + 0.5, by + 0.5]).at(-1);

    return Boolean(end) && Math.floor(end[0]) === bx && Math.floor(end[1]) === by;
}
