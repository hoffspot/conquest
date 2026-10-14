// Helpers shared by the tests.

import assert from "node:assert/strict";
import { navigatorOf } from "../client/js/core/navigation.js";

/**
 * Work that's to take less than `limit` ms: `time` does it, from the start each time, and returns
 * how long it took (ms). Over the first time, it's timed once more, and fails only if it's over
 * both: the other test files run beside this one, and a busy or slow machine can take the cores
 * for a while, while a real slowdown is slow both times. `say` words a time for the failure.
 */
export function quickEnough(limit, time, say = (ms) => `${ms.toFixed(1)} ms`) {
    const first = time();

    if (first < limit) {
        return first;
    }

    const again = time();

    assert.ok(again < limit, `${say(again)} (${say(first)} the first time)`);

    return again;
}

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
