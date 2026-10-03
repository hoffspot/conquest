// The time of day in the world (the terrain plan's M7e, §9 Day and night). A day is 60 minutes of
// play, kept by the war's own clock (war/war.js: a turn a minute, and the time into the next), so
// it needs nothing kept of its own: whoever holds the world keeps it, it's saved with the war, it's
// sent to whoever joins in the war's state and checked with it, so every player has the same hour;
// it stops when the world's paused, as the war does. Exact maths only (it's the rules').
//
// The day, in minutes of play from midnight: the night to 7, the dawn to 11 (the sun rising at 9),
// the day to 47, the dusk to 53 (the sun setting at 50), the night again. A new world starts at
// mid-morning (minute 18). The moon turns through its phases over eight days.

const MINUTE = 60000;

// A war's turn (ms: war/war.js TURN_MS, a minute; not imported, so that whatever the war needs can
// ask the time of day)
const TURN = MINUTE;

/**
 * The day (ms of play): how long it is; when, from midnight, the dawn starts, the day, the dusk
 * and the night; when the sun rises and sets (halfway through the dawn and the dusk); and when in
 * it a new world starts.
 */
export const DAY = Object.freeze({
    length: 60 * MINUTE,
    dawn: 7 * MINUTE,
    day: 11 * MINUTE,
    dusk: 47 * MINUTE,
    night: 53 * MINUTE,
    rises: 9 * MINUTE,
    sets: 50 * MINUTE,
    start: 18 * MINUTE,
});

/** How many days the moon takes to turn through its phases. */
export const MOON_DAYS = 8;

/** How long the world's been going (ms of play): its war's turns and the time into the next. */
export function elapsedOf(war) {
    return war ? war.turn * TURN + war.clock : 0;
}

/**
 * How long (ms of play) a sleep lasts when the world's been going `elapsed` ms: to the next
 * sunrise or sunset at least `least` ms off (a night's sleep to the morning, a day's to the
 * evening).
 */
export function untilWaking(elapsed, least = 0) {
    const time = timeOfDay(elapsed);

    return [DAY.rises, DAY.sets, DAY.rises + DAY.length, DAY.sets + DAY.length].map((wake) => wake - time).find((wait) => wait >= least);
}

/** The time of day (ms from midnight) when the world's been going `elapsed` ms. */
export function timeOfDay(elapsed) {
    return (((elapsed + DAY.start) % DAY.length) + DAY.length) % DAY.length;
}

/** Which day it is (0 the first) when the world's been going `elapsed` ms. */
export function dayOf(elapsed) {
    return Math.floor((elapsed + DAY.start) / DAY.length);
}

/**
 * How much daylight there is at a time of day: 1 by day, 0 by night, rising evenly through the
 * dawn and falling through the dusk.
 */
export function daylight(time) {
    if (time >= DAY.day && time < DAY.dusk) {
        return 1;
    }

    if (time >= DAY.dawn && time < DAY.day) {
        return (time - DAY.dawn) / (DAY.day - DAY.dawn);
    }

    if (time >= DAY.dusk && time < DAY.night) {
        return 1 - (time - DAY.dusk) / (DAY.night - DAY.dusk);
    }

    return 0;
}

/**
 * The moon's phase when the world's been going `elapsed` ms: 0 new, 0.5 full, turning evenly; a
 * new world starts with it a quarter full and waxing.
 */
export function moonPhase(elapsed) {
    const turn = (elapsed + DAY.start) / (DAY.length * MOON_DAYS) + 0.25;

    return turn - Math.floor(turn);
}
