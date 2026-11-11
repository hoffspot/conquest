// Hell rifts (docs/WILDS.md *Hell rifts*): once a day of the world (DAY), at a time the day has, a
// hells' cult tears a rift open out in the wilds, within reach of the players (HELL_RIFT `from`,
// `to`), for half an hour. About it, as far as HELL_RIFT.radius, the land's thick with demons: a
// few lesser rifts (tears) scattered through it each pour out a pack while anyone's near (sealed
// with a few blows, a small cache for those who sealed it), and the wild about the players there is
// the rift's demons. At its heart an altar, warded by its guards (a Rift Warden, the cult's high
// priest, and fiends): with them fallen, smashed, the rift closes, and each hero who fought there
// has a chest of their own (a great hoard, and one more for each HELL_RIFT.brimstone.per brimstone
// the rift's demons left them), and on the altar a cultist's letter telling the way to the nearest
// hell. Time up, it seals itself, nothing gained. Everyone in the world hears of it as it opens
// (app/game.js), as strong as the mightiest hero about it, a tier over (might.js calledTier).
//
// Pure, and the same on every machine: the host (core/host.js #hellRifts) keeps one, the clients
// draw it (world/hellrift3d.js) and tell of it.

import { landmarkBy } from "./cultword.js";
import { clearOfSettlements, TIERS } from "./creatures.js";
import { DAY, dayOf } from "./daytime.js";
import { cos, hypot, sin, TAU } from "./exact.js";
import { calledTier } from "./might.js";
import { createRandom } from "./random.js";
import { compass } from "./ways.js";
import { landAt, WORLD_SIZE } from "./worldplan/plan.js";

const MINUTE = 60000;

/**
 * A hell rift, how it keeps:
 *  - `first`: none before the world's played this long (ms: its war's clock);
 *  - `opens`: when in its day it's due (ms from midnight, between these: the day's own, `dueOf`),
 *    and `late`: how long after that it can still open, if it couldn't then (no one about in the
 *    open); past that, none that day;
 *  - `lasts`: how long it's open (ms), then sealed of itself;
 *  - `from`, `to`: how far from a player (metres) its heart is torn open; `edge`: how far within
 *    the world's edge its area is; `clear`: how far its heart is beyond a settlement's edge;
 *  - `radius`: how far about its heart (metres) the land's its (the map's red circle);
 *  - `tears`: how many lesser rifts in it (least, most), no nearer its heart than `tearsFrom` nor
 *    each other than `apart`, and no further out than `radius` less `inside`;
 *  - `wakes`: a tear pours out a pack every `every` ms while a player's this near it (metres), no
 *    more than `most` of its packs out at once;
 *  - `guards`: its guards woken once a player's this near its heart (metres); let go (to come again
 *    as they were) once every player's `far` from it; `fiends`: how many fiends with the Warden;
 *  - `up`: how many tiers over the mightiest hero about it its demons are (might.js calledTier);
 *  - `tear`, `altar`: their hit points at the first tier (as much more each tier as a creature's:
 *    creatures.js tierPower);
 *  - `ambient`: how likely each pack put out about a player in it (host.js #putOut) is one of the
 *    cult's (cultists) rather than a demon pack.
 */
export const HELL_RIFT = Object.freeze({
    first: 40 * MINUTE,
    opens: Object.freeze([4 * MINUTE, 26 * MINUTE]),
    late: 6 * MINUTE,
    lasts: 30 * MINUTE,
    from: 800,
    to: 2000,
    edge: 450,
    clear: 250,
    radius: 400,
    tears: Object.freeze([6, 8]),
    tearsFrom: 110,
    apart: 110,
    inside: 40,
    wakes: 70,
    every: 40000,
    most: 2,
    guards: 60,
    far: 200,
    fiends: 3,
    up: 1,
    tear: 150,
    altar: 500,
    ambient: 0.25,
});

/**
 * Brimstone, what the rift's demons leave the heroes about them as they fall (within `reach`
 * metres of where it fell): `each` for one of its demons, `elite` for one of its guards, and
 * `warden` for its Warden; spent at its chest once it's closed, one more hoard for each `per` of
 * it, no more than `most` more.
 */
export const BRIMSTONE = Object.freeze({ each: 1, guard: 3, warden: 15, reach: 40, per: 10, most: 5 });

/**
 * What pours out of a tear (and is about the players in the rift's land: host.js #putOut), and how
 * often each, among the rest: the Breach's own, most of all.
 */
export const RIFT_DEMONS = Object.freeze([
    Object.freeze({ creature: "fiend", weight: 3 }),
    Object.freeze({ creature: "brimstoneWalker", weight: 3 }),
    Object.freeze({ creature: "flayling", weight: 2 }),
    Object.freeze({ creature: "cinderHusk", weight: 1 }),
    Object.freeze({ creature: "slagGorger", weight: 1 }),
    Object.freeze({ creature: "pyreAcolyte", weight: 1 }),
]);

/** Its guards: the Rift Warden (a Demon of the Breach, a boss's strength), the cult's high priest, and fiends. */
export const RIFT_GUARDS = Object.freeze({ warden: "demonBoss", title: "Rift Warden", priest: "cultLeader", fiend: "fiend" });

/** When in a world's day (`day`: which day it is, from 0) its rift is due (ms from midnight), the same on every machine. */
export function dueOf(seed, day) {
    const random = createRandom((seed ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0);
    const [least, most] = HELL_RIFT.opens;

    return least + Math.floor(random.next() * (most - least));
}

/**
 * Whether a rift's due to open now (`elapsed`: ms the world's played, its war's clock), and which
 * day's it is: { day } if it's due and that day's hasn't been (`last`: the last day one opened or
 * was given up), else null.
 */
export function riftDue(seed, elapsed, last = -1) {
    if (elapsed < HELL_RIFT.first) {
        return null;
    }

    // (Its day the world's own, from midnight: daytime.js dayOf; when it's due, the elapsed time
    // at that time of that day)
    const day = dayOf(elapsed);
    const due = day * DAY.length - DAY.start + dueOf(seed, day);

    return day > last && elapsed >= due && elapsed < due + HELL_RIFT.late ? { day } : null;
}

/**
 * Where a rift's heart is torn open ([x, y] metres): out in the wilds `from` to `to` metres from one
 * of the players (`about`: where each is, [[x, y]]), on dry land clear of the settlements, its land
 * within the world, and wherever else `ok(at)` has it (the host's: off the roads, out of shrines'
 * sanctuary); null if no such place was found.
 */
export function riftSite(plan, about, random, ok = () => true) {
    if (!about.length) {
        return null;
    }

    const size = plan.size ?? WORLD_SIZE;

    for (let tries = 0; tries < 40; tries++) {
        const [x, y] = random.pick(about);
        const angle = random.next() * TAU;
        const reach = HELL_RIFT.from + random.next() * (HELL_RIFT.to - HELL_RIFT.from);
        const at = [x + cos(angle) * reach, y + sin(angle) * reach];
        const within = at.every((each) => each >= HELL_RIFT.edge && each <= size - HELL_RIFT.edge);

        if (within && !landAt(plan, ...at).water && clearOfSettlements(plan, at, HELL_RIFT.clear) && ok(at)) {
            return at;
        }
    }

    return null;
}

/**
 * Where a rift's tears are ([[x, y]], as many as HELL_RIFT.tears has it): scattered about its heart
 * (`at`), one in each of so many slices of the circle round it, `tearsFrom` to `radius` less
 * `inside` metres out, no two within `apart`, on dry land where `ok(at)` has it; any that can't be
 * placed left out.
 */
export function tearsOf(plan, at, random, ok = () => true) {
    const [least, most] = HELL_RIFT.tears;
    const count = random.int(least, most);
    const tears = [];

    for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 12; tries++) {
            const angle = ((k + random.next()) / count) * TAU;
            const reach = HELL_RIFT.tearsFrom + random.next() * (HELL_RIFT.radius - HELL_RIFT.inside - HELL_RIFT.tearsFrom);
            const tear = [at[0] + cos(angle) * reach, at[1] + sin(angle) * reach];

            if (!landAt(plan, ...tear).water && clearOfSettlements(plan, tear, 30) && ok(tear) && tears.every(([x, y]) => hypot(x - tear[0], y - tear[1]) >= HELL_RIFT.apart)) {
                tears.push(tear);
                break;
            }
        }
    }

    return tears;
}

/** Whether a point ([x, y] metres) is in a rift's land (its heart `at`, as far as HELL_RIFT.radius). */
export const inRift = (rift, [x, y]) => Boolean(rift) && hypot(x - rift.at[0], y - rift.at[1]) <= HELL_RIFT.radius;

/**
 * How strong a rift's demons are, from the might (0 to 100) of the heroes about it (`mights`): a
 * tier (HELL_RIFT.up) over the mightiest's own (might.js calledTier), up to TIERS; the first's
 * over with none about.
 */
export const riftTier = (mights) => Math.min(TIERS, calledTier(Math.max(0, ...mights)) + HELL_RIFT.up);

/** One of the rift's demon packs (RIFT_DEMONS): { creature }. */
export const riftDemon = (random) => ({ creature: random.pickWeighted(RIFT_DEMONS, ({ weight }) => weight).creature });

/**
 * Which hell (one of the plan's sites with theme "hell") a cultist's letter found at `at` points
 * to: the nearest that `found(site)` hasn't (one the hero's not found yet), else the nearest of
 * them all; null with no hell in the world.
 */
export function hellFor(plan, at, found = () => false) {
    const hells = plan.sites.filter((site) => site.theme === "hell");
    const far = (site) => hypot(site.at[0] - at[0], site.at[1] - at[1]);
    const nearest = (list) => list.reduce((best, one) => (best === null || far(one) < far(best) || (far(one) === far(best) && one.id < best.id) ? one : best), null);

    return nearest(hells.filter((site) => !found(site))) ?? nearest(hells);
}

// How far a walk it is, said (metres)
const walkOf = (metres) => (metres < 700 ? "not half an hour's walk" : metres < 1600 ? "an hour's walk" : metres < 3200 ? "two hours' walk or more" : "the best part of a day's walk");

// What the letter says, each way of saying it: {dir} which way from the altar, {dist} how far,
// {landmark} what stands by the camp (with a comma before it, or nothing)
const LETTERS = Object.freeze([
    Object.freeze({
        text: Object.freeze([
            "Brother, the rite is begun. The Warden stands at the altar and the gate will hold till the hour is out. Feed it what you can.",
            "When it is done, come home to the camp, {dir} of here, {dist}{landmark}. Come by night: the portal sleeps by day, and they burn their lamps against us till dark.",
        ]),
        signed: "Your brother in the Choir",
    }),
    Object.freeze({
        text: Object.freeze([
            "To whoever keeps this altar. The Choir sings the gate open again tonight, at the camp {dir} of here, {dist}{landmark}. Bring the brimstone you gather, and the blood if you can.",
            "Mind the ones who come with swords. If they break the altar, the rift closes, and we start again.",
        ]),
        signed: "Hierophant of the Hollow Choir",
    }),
    Object.freeze({
        text: Object.freeze([
            "The thin place here will not hold long. The true door is {dir}, {dist}{landmark}: a ring burnt in the grass, a portal of black stone, the braziers lit at dusk.",
            "Kill the priests and the door opens till sunrise. That is the bargain. Do not let the outsiders learn it.",
        ]),
        signed: "A cantor of the Choir",
    }),
]);

/**
 * The cultist's letter found on a rift's altar once it's smashed (as core/writings.js WRITINGS
 * has them: title, whose, where found, its pages), telling the way from where it was found (`at`)
 * to a hell (`site`: hellFor's): which way, how far a walk, what stands by its camp. One of the
 * ways of saying it (`which`: any whole number, kept within them).
 */
export function letterOf(plan, at, site, which = 0) {
    const letter = LETTERS[((which % LETTERS.length) + LETTERS.length) % LETTERS.length];
    const landmark = landmarkBy(plan, site);
    const fill = (line) =>
        line
            .replaceAll("{dir}", compass(at, site.at))
            .replaceAll("{dist}", walkOf(hypot(site.at[0] - at[0], site.at[1] - at[1])))
            .replaceAll("{landmark}", landmark ? `, ${landmark}` : "");

    return {
        title: "A cultist's letter",
        by: "One of the Hollow Choir",
        found: "On the altar of a hell rift, smashed",
        entries: [{ heading: "Undated", hand: "In a cramped hand, in ink the colour of rust", text: letter.text.map(fill), signed: letter.signed }],
    };
}
