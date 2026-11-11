// Helpers shared by the tests.

import assert from "node:assert/strict";
import { navigatorOf } from "../client/js/core/navigation.js";

// The longest a system's clock tick is (ms: Linux's is 1 to 10, Windows' 15.6). A thread's own
// processor time is told as it stood at the last tick, so over a piece of work it reads short by
// up to one of them
const TICK = 16;

const msOf = ({ user, system }) => (user + system) / 1000;

/**
 * How long `work` took (ms) of the processor's time, not the clock's: no less than the thread
 * doing it spent on it, which is what the clock says on a machine with nothing else to do. The
 * other test files run beside this one, and on a busy machine the clock counts their turns on the
 * cores too: three files failed there for it, a world laid out in 2 seconds of the processor's
 * time over its 8 by the clock. For work done in one go on this thread, with no waiting in it:
 * time spent waiting isn't counted.
 *
 * Node tells two times, each more than the thread's own, and this is the lesser. The whole
 * process's (process.cpuUsage) is told to the microsecond, but counts the engine's own threads
 * beside the work's, tidying up and compiling: up to twice the thread's on work that makes many
 * objects (a chunk of the world took 38 ms of it on a busy machine, 19 of the thread's). The
 * thread's own (process.threadCpuUsage, where this Node has it) is told only to the last tick, so
 * a tick is added: of use for work longer than a few of them, where the first is for the short.
 * Never less than the thread spent, so no limit is looser for being kept by it.
 */
export function cpuMs(work) {
    const [whole, own] = [process.cpuUsage(), process.threadCpuUsage?.()];

    work();

    return own ? Math.min(msOf(process.cpuUsage(whole)), msOf(process.threadCpuUsage(own)) + TICK) : msOf(process.cpuUsage(whole));
}

/**
 * Work that's to take less than `limit` ms: `time` does it, from the start each time, and returns
 * how long it took (ms: of the processor's time, cpuMs). Over the first time, it's timed once
 * more, and fails only if it's over both: a busy or slow machine's cores are slower each for the
 * others' work (their caches shared, their speed turned down), while a real slowdown is slow both
 * times. `say` words a time for the failure.
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
