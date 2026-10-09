// The peoples' standing armies and defensive reserves (docs/WAR.md *Standing armies*, M18), as
// the war reckons them: how big each is, how they're made up from their people's towns, the camps
// they're staged from, and how they fight. The war (war.js) moves them a turn at a time; near a
// player they come to life (host.js).
//
// Pure numbers, as the war is.

import { hypot } from "../exact.js";
import { DOCTRINES, MIX } from "../formation.js";

/**
 * A people's army and its reserve, each as strong as `size` at the height of the war (the stage's
 * `army` share of it before then: war.js STAGES); a vassal's `vassal` of that. An army marches out
 * once it's `ready` of its full strength, and, beaten back below `regroup` of what it went in with,
 * falls back to its camp to be made up. Beaten in the field, either gets `flee` turns to get away
 * before it can be fallen on again. Each goes `speed` metres a turn.
 */
export const ARMY = Object.freeze({ size: 80, vassal: 0.5, ready: 0.7, regroup: 0.5, flee: 2, speed: { army: 250, reserve: 300 } });

/**
 * A forward camp an army's staged from (built ahead, as a fortification is): it attacks only what's
 * within `reach` metres of one of its people's camps. Building one takes `build` turns and costs
 * `cost` gold; `guard` of the army stay to hold it. Each sends out a scout, seeing `scout` metres
 * round it, and, every `every` turns, a pair of skirmishers (`pair`) against anything of the enemy's
 * within `skirmish` metres: each likely (`hits`) to bring one of them down, or to be lost (`lost`).
 * A people keeps `most` camps at most, its oldest struck for a new one; a camp no army's near for
 * `idle` turns is struck too.
 */
export const CAMP = Object.freeze({ reach: 300, build: 2, cost: 20, guard: 6, scout: 300, every: 3, pair: 2, skirmish: 600, hits: 0.5, lost: 0.25, most: 3, idle: 40 });

/**
 * How far each sees (metres, for the war table's map: docs/WAR.md *The war table*; war.js sight): a
 * camp's scout, an army or reserve, and a town (from its edge) or a depot.
 */
export const SIGHT = Object.freeze({ scout: CAMP.scout, army: 150, holding: 150 });

/**
 * How much each role's share above (or below) the usual mix (formation.js MIX) adds to a people's
 * soldiers' fighting in the war's reckoning (EDGES): its two-handers and casters when it attacks,
 * its shield line and healers when it's attacked, and its archers either way. Each people's lean
 * is as strong as any other's, all told: what it gains one way it gives up the other.
 */
export const EDGE = Object.freeze({ heavy: 1.2, caster: 0.8, front: 1.2, healer: 1.2, archer: 0.4 });

/**
 * How each people's soldiers fight in the war's reckoning (docs/WAR.md *Standing armies*), by its lean
 * (formation.js DOCTRINES, M17): `attack`, how hard they strike attacking, the harder for its shock
 * troops, casters and archers; `defend`, how hard they strike back attacked, the harder for its
 * shield line, healers and archers. 1 each for a people mixed as MIX is (the humans).
 */
export const EDGES = Object.freeze(
    Object.fromEntries(
        Object.entries(DOCTRINES).map(([id, mix]) => [
            id,
            Object.freeze({
                attack: Math.round((1 + EDGE.heavy * (mix.heavy - MIX.heavy) + EDGE.caster * (mix.caster - MIX.caster) + EDGE.archer * (mix.archer - MIX.archer)) * 1000) / 1000,
                defend: Math.round((1 + EDGE.front * (mix.front - MIX.front) + EDGE.healer * (mix.healer - MIX.healer) + EDGE.archer * (mix.archer - MIX.archer)) * 1000) / 1000,
            }),
        ]),
    ),
);

/**
 * Reinforcements on their way from a town to their army or reserve: going `speed` metres a turn,
 * and, two columns of them for the same within `band` metres of each other, banding together. They
 * join it within `join` metres.
 */
export const REINFORCE = Object.freeze({ speed: 250, band: 150, join: 60 });

/**
 * How near (metres): two enemies' armies and reserves to fight; an army to what it attacks; a
 * reserve to an enemy army to fall on it; an enemy army to a town for its people's reserve to come.
 */
export const CLOSE = Object.freeze({ fight: 120, attack: 120, threat: 1000 });

/**
 * A people's rulers' seat (its citadel) is held by its ruler and the captain of its guard as well
 * as its garrison (`LEADERS` of them, fought last): it's taken only once they're down too.
 */
export const LEADERS = 2;

/** How much of a town's full garrison an army leaves to hold a town it's taken (from those it has). */
export const HELD = 0.5;

/** How many turns an army waits before a town (or works) a player's near before what's left of it is reckoned here. */
export const WATCH_TURNS = 3;

/** A people's army's or reserve's strength at its fullest, at a stage's share of the war's height, for a vassal or not. */
export function fullOf(share, { vassal = false } = {}) {
    return Math.round(ARMY.size * share * (vassal ? ARMY.vassal : 1));
}

/** Where a camp before something goes: `out` metres from it towards `from` (a point on the way there). */
export function campSite(from, to, out) {
    const [dx, dy] = [from[0] - to[0], from[1] - to[1]];
    const length = hypot(dx, dy);

    if (length <= out) {
        return [Math.round(from[0]), Math.round(from[1])];
    }

    return [Math.round(to[0] + (dx / length) * out), Math.round(to[1] + (dy / length) * out)];
}
