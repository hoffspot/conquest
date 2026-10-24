// The rings of standing stones out in the land (the world plan's sites of kind "standing stones";
// docs/WILDS.md *Moon roads*), Lunara's roads (core/lore/gods.js): each bound to one of the moon's
// eight phases (PHASES), one a world day as it turns (daytime.js MOON_DAYS). By night, one who
// steps into a ring's middle is carried, with all their party standing in the ring and their
// company, to the ring tonight's moon is bound to (host.js #moonRoads); under a full moon to any
// ring they've stood in, as they choose; under a new moon the rings sleep. Once they've stood in a
// ring, its phase is theirs to know (core/explored.js `rings`), in their journal.
//
// Pure and exact: the same on every machine, from the world plan alone.

import { DAY, dayOf, moonPhase, MOON_DAYS, timeOfDay } from "./daytime.js";
import { hypot } from "./exact.js";
import { createRandom } from "./random.js";
import { restingOf } from "./sites.js";

/** The moon's phases, a world day each, from the new moon: what each night's is called. */
export const PHASES = Object.freeze(["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"]);

/** The new moon's phase (the rings sleep) and the full moon's (any ring stood in). */
export const NEW_MOON = 0;
export const FULL_MOON = 4;

/**
 * How near its heart (sites.js heartOf: by its flat stone) one must be to be in a ring's middle
 * (`middle`, metres); how far round it its stones stand (`round`: those of the party within it go
 * too); how near one must come for its heart to be looked for (`near`).
 */
export const RING = Object.freeze({ middle: 2.6, round: 9.5, near: 40 });

// Laid out, by plan (once each)
const LAID = new WeakMap();

/**
 * The rings of a world (the plan's sites of kind "standing stones", by their ids in order), each
 * bound to a phase: dealt round them in an order of the world's own, so each phase has one or
 * two. [{ site, phase (a PHASES index), at (where it rests: sites.js restingOf) }].
 */
export function ringsOf(plan) {
    if (!LAID.has(plan)) {
        const sites = (plan.sites ?? []).filter(({ kind }) => kind === "standing stones").sort((a, b) => (a.id < b.id ? -1 : 1));
        const order = createRandom(((plan.seed ?? 0) * 0x27d4eb2d + 0x165667b1) >>> 0).shuffle(PHASES.map((_, k) => k));

        LAID.set(plan, Object.freeze(sites.map((site, k) => Object.freeze({ site, phase: order[k % order.length], at: restingOf(plan, site).at }))));
    }

    return LAID.get(plan);
}

/** A ring by its site's id: { site, phase, at }, or null. */
export const ringOf = (plan, id) => ringsOf(plan).find(({ site }) => site.id === id) ?? null;

/** The ring whose stones a point's near ([x, y] metres: within RING.near of where it rests), or null. */
export function ringNear(plan, [x, y]) {
    return ringsOf(plan).find(({ at }) => hypot(x - at[0], y - at[1]) <= RING.near) ?? null;
}

/** Which night it is (or will be) when the world's been going `elapsed` ms: the day of its sunset (a night after midnight is the one before's). */
export const nightOf = (elapsed) => dayOf(elapsed) - (timeOfDay(elapsed) < DAY.rises ? 1 : 0);

/**
 * The moon's phase for the night it is (or will be) when the world's been going `elapsed` ms: as
 * it was at that night's sunset, so it holds till sunrise. A PHASES index.
 */
export function phaseOfNight(elapsed) {
    const day = nightOf(elapsed);
    const sunset = day * DAY.length - DAY.start + DAY.sets;

    // (The phase it's in then, whole: sunset falls half a day in, as the turning moon does)
    return Math.floor(moonPhase(sunset) * MOON_DAYS) % MOON_DAYS;
}

/**
 * Where a ring carries one who steps into it (`from`: a ring) on a night of a phase: to the ring
 * bound to it (of two, the one it isn't, or the nearer), or null if none (a new moon's, the full
 * moon's, or it's the only one and they're in it).
 */
export function moonRoad(plan, from, phase) {
    if (phase === NEW_MOON || phase === FULL_MOON) {
        return null;
    }

    const far = ({ at }) => hypot(at[0] - from.at[0], at[1] - from.at[1]);

    return ringsOf(plan).filter((ring) => ring.phase === phase && ring !== from).sort((a, b) => far(a) - far(b))[0] ?? null;
}

/** What a ring's called, by the settlement nearest it: "the stones near Oakford". */
export function ringName(plan, ring) {
    const far = ({ at }) => hypot(at[0] - ring.at[0], at[1] - ring.at[1]);
    const town = [...(plan.places ?? [])].sort((a, b) => far(a) - far(b))[0];

    return town?.name ? `the stones near ${town.name}` : "a ring of stones";
}

/**
 * The full moon's trial: on each full-moon night, one ring holds a guardian of Lunara's, moon-touched
 * (a champion of its kind's, "moon": dungeons/play.js CHAMPIONS, beasts/champions.js), keeping a
 * relic of moonsilver on its flat stone (progress.js rollMoonsilver) till it's slain or the night's
 * over. Which ring by the night; which guardian (`guardians`: a pale stag or a silver wolf, in
 * turn); how near a player comes for it to wake (`near`, metres) and how far they all go for it to
 * be let go (`far`); how many tiers above the land's there it is (`up`).
 */
export const TRIAL = Object.freeze({ near: 60, far: 140, up: 2, guardians: Object.freeze([Object.freeze({ creature: "hart", title: "the Pale Stag" }), Object.freeze({ creature: "direWolf", title: "the Silver Wolf" })]) });

/** The full moon's trial on a night (nightOf's): { id, ring, guardian ({ creature, title }) }, the same every time. */
export function trialOf(plan, night) {
    const rings = ringsOf(plan);
    const pick = createRandom(((plan.seed ?? 0) * 0x9e3779b1 + night * 0x85ebca6b) >>> 0);

    return { id: `moon-trial-${night}`, ring: rings[pick.int(0, rings.length - 1)], guardian: TRIAL.guardians[Math.floor(night / MOON_DAYS) % TRIAL.guardians.length] };
}
