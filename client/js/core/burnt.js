// Houses burnt by the Behemoth of the Rift (docs/WAR.md *The Behemoth of the Rift*, *Burnt
// houses*). A town it turns back from, its soldiers all but fallen, is left with houses burning:
// those nearest where it stood, more the less it was wounded. Its folk build them again over three
// days. Which they are and how far on each is are worked out from when the town fell, by the
// world's clock (core/daytime.js: a day is an hour of play), so nothing else is kept (host.js
// `burnt`), and every player's game has the same.
//
// - **Burning** till the sun's up (BURNT.burns at least): its roof gone and its walls broken off
//   and blackened, great fires in it and their smoke rising.
// - **Burnt** the next day: a blackened shell, smouldering.
// - **Framed** the day after: its walls mended, new timbers up for its roof, scaffolding round it.
// - **Roofed** the third day, till sunset: roofed again, the scaffolding still up.
//
// Then it's whole, and let go of.
//
// Only houses burn (a layout's `house` pieces: those along the streets and the back buildings
// behind them), never what can be gone into (a shop, the tavern, the guild, the church, the
// smithy, the hall, the barracks: landmarks), so nothing a player goes to is lost. Pure: no DOM.

import { DAY, untilTime } from "./daytime.js";
import { hypot } from "./exact.js";

/**
 * How many houses burn (`least` with the Behemoth all but slain, `most` with it unhurt), how far
 * from where it stood one can be (metres), how long they burn at least (ms of play: the night
 * may be nearly over), and the stages of their burning and building again, in order.
 */
export const BURNT = Object.freeze({ least: 2, most: 6, within: 60, burns: 4 * 60000, stages: Object.freeze(["burning", "burnt", "framed", "roofed"]) });

/** How many houses burn when the Behemoth's turned back with `left` of its hit points (0 to 1). */
export function burntCount(left) {
    const share = Number.isFinite(left) ? Math.max(0, Math.min(1, left)) : 1;

    return BURNT.least + Math.round((BURNT.most - BURNT.least) * share);
}

/**
 * The houses that burn: the indices of a layout's `pieces` (set down with its corner at
 * `origin`, [x, y] metres in the world), the `count` of its houses nearest `stand` (where the
 * Behemoth stood) within BURNT.within of it, nearest first; none of `spare` (indices burnt
 * already).
 */
export function housesToBurn(pieces, [ox, oy], [sx, sy], count, spare = new Set()) {
    const near = [];

    pieces.forEach((piece, index) => {
        if (piece.kind !== "house" || spare.has(index)) {
            return;
        }

        const far = hypot(ox + piece.x - sx, oy + piece.y - sy);

        if (far <= BURNT.within) {
            near.push({ index, far });
        }
    });

    near.sort((a, b) => a.far - b.far || a.index - b.index);

    return near.slice(0, Math.max(0, count)).map(({ index }) => index);
}

/**
 * When each stage of a house burnt `at` (ms of play) ends: burning, at sunrise (BURNT.burns after
 * it fell at least); burnt, at the next sunrise; framed, at the one after; roofed, at sunset that
 * day.
 */
export function stagesOf(at) {
    const dawn = at + untilTime(at, DAY.rises);

    return { burning: Math.max(dawn, at + BURNT.burns), burnt: dawn + DAY.length, framed: dawn + 2 * DAY.length, roofed: dawn + 2 * DAY.length + (DAY.sets - DAY.rises) };
}

/** When a house burnt `at` stands whole again (ms of play). */
export const wholeAt = (at) => stagesOf(at).roofed;

/** How far on a house burnt `at` is `now` (ms of play): its stage (BURNT.stages), or null once it's whole again (or before it burnt). */
export function stageOf(at, now) {
    if (!(now >= at)) {
        return null;
    }

    const ends = stagesOf(at);

    return BURNT.stages.find((stage) => now < ends[stage]) ?? null;
}

/**
 * The houses burnt in a place (by its id) `now`, and how far on each is: Map(index, stage), from
 * the host's `burnt` ([{ place, pieces, at }]).
 */
export function burntIn(burnt, place, now) {
    const houses = new Map();

    for (const { place: where, pieces, at } of burnt ?? []) {
        const stage = where === place ? stageOf(at, now) : null;

        if (stage) {
            for (const index of pieces) {
                houses.set(index, stage);
            }
        }
    }

    return houses;
}

const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// A count in words ("four houses", "a house"), up to ten; in figures past it
const houses = (count) => (count === 1 ? "a house" : `${NUMBERS[count] ?? count} houses`);

/** What a player near is told as the town falls: the Behemoth's breath setting `count` houses alight as it goes. */
export const burntWords = (count) => `Its breath sets ${houses(count)} alight as it goes.`;

/** The crier's cry as they burn (at most 90 characters: core/crying.js), the way the Behemoth came (`way`: "north", "south-east"...). */
export const burntCry = (count, way) => `Fire by the ${way} road! ${houses(count).replace(/^./, (first) => first.toUpperCase())} burning! Every hand to the buckets!`;

/** What a player in the town is told once its burnt houses stand whole again. */
export const rebuiltWords = (name) => `The houses the Behemoth burnt in ${name} stand whole again.`;
