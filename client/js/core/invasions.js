// Invasions (docs/WAR.md *Invasions*): a big band of raiders come down one of a town's roads to
// attack it, and a big force of the town's own people march out to meet them at its edge, the
// town's crier crying the way they come and calling every able hand to its defence.
//
// The first comes to a character five minutes after they land in a town (their time in towns, as
// they've spent it: `clockOf`), wherever they are; and others every half hour to an hour of their
// time in towns after (never in their first few minutes in one). Only towns and cities are
// invaded, and only those whose people aren't the character's enemies. In a character's first,
// the raiders leave them be till they strike one: that one's theirs to fight for the rest of it,
// its fellows not; in every one after, the raiders fight them as they'd fight anyone.
//
// The town's people have the better of it: more of them, a whole line of battle (core/
// formation.js), and two squads of bomb throwers whose goblin bombs toss the raiders off their
// feet. Once only a share of the raiders are left standing they break and run (`rout`). Whoever
// felled raiders has a bounty for each, the guilds' merit and the town's thanks; and one who
// brought down a good share of them (`big`), its lord's own purse and a rare piece from its
// armoury besides.
//
// Pure data and arithmetic: the host (core/host.js #invasions) brings them to life.

/**
 * How invasions come and go (ms of a character's time in towns, and metres):
 *  - `first`: the time before a character's first; `every`: between one and the next after (from
 *    and to); `settle`: how long they're to have been in the town before one after the first (and
 *    `settleFirst`, before the first) comes;
 *  - `kinds`: the kinds of settlement invaded (setpieces/town.js SETTLEMENT_KINDS); `within`: how
 *    far beyond its edge someone's still in it;
 *  - `tick`: how often each player's time in a town is counted;
 *  - `size`: how many of both sides together, `defenders` the share of them the town's;
 *    `bombers`: its bomb throwers, in `squads` of a share of its force each (`share`), at least
 *    `least`;
 *  - `out`: how far beyond the edge the raiders come out into the world, along the road;
 *    `inside`: how far inside it the town's soldiers form their line; `meet`: where the two lines
 *    meet, beyond it; `march`: how fast the town's line marches (m/s; the raiders', their band's);
 *  - `rout`: the share of the raiders left standing when they break and run; `run`: how fast
 *    they run, back the way they came, `away` metres beyond where they came out;
 *  - `linger`: how long those left stand once it's over before they go, as soon as they're not
 *    fighting; `lasts`: when it's gone on this long, everyone left in it goes (ms of the battle's
 *    time).
 */
export const INVASION = Object.freeze({
    first: 300000,
    every: Object.freeze([1800000, 3600000]),
    settle: 180000,
    settleFirst: 30000,
    kinds: Object.freeze(["town", "city", "capital"]),
    within: 12,
    tick: 1000,
    size: 120,
    defenders: 0.58,
    bombers: Object.freeze({ squads: 2, share: 0.025, least: 2 }),
    out: 70,
    inside: 6,
    meet: 14,
    march: 1.1,
    rout: 0.25,
    run: 2.6,
    away: 40,
    linger: 20000,
    lasts: 600000,
});

/**
 * The bands that invade, each: its name (`label`), what one of it is called (`adjective`: "Bandit
 * cutthroat") and many of it (`many`); its mix of roles in a line (core/formation.js MIX's) and
 * what each role fights with (the first of several the most; WEAPONS keys); each role's name, and
 * its chiefs' (one leading every `chiefs` of it, the first among them; each `chiefHp` times as hard
 * to bring down); how hard the rest are to bring down (`hp`: of a soldier's); how fast its line
 * marches (`march`, m/s); what's found on its fallen (core/progress.js LOOT); and how each is
 * dressed by what they fight with (characters/folk.js adventurers' callings: soldiers.js
 * soldierLook).
 *
 * Bandits: cutthroats with swords and cleavers behind round shields, brutes with hammers and axes,
 * archers, and their chiefs; no casters or healers. Rough men, less hardy than a soldier, eager
 * to close.
 */
export const BANDS = Object.freeze({
    bandits: Object.freeze({
        label: "Bandits",
        adjective: "Bandit",
        many: "bandits",
        mix: Object.freeze({ front: 0.5, heavy: 0.2, archer: 0.3, caster: 0, healer: 0 }),
        arms: Object.freeze({ front: Object.freeze(["cleaver", "sword"]), heavy: Object.freeze(["hammer", "axe"]), archer: Object.freeze(["bow"]) }),
        names: Object.freeze({ front: "cutthroat", heavy: "brute", archer: "archer", chief: "chief" }),
        chiefs: 25,
        chiefHp: 2.5,
        hp: 0.85,
        march: 1.3,
        loot: "raider",
        looks: Object.freeze({ sword: "rogue", cleaver: "rogue", hammer: "warrior", axe: "warrior", bow: "ranger", chief: "warrior" }),
    }),
});

/** The town's bomb throwers' weapon (core/weapons.js NATURAL): a sword up close, goblin bombs further off. */
export const BOMBER = "bombardier";

/**
 * A character's time in towns, as kept (Progress `invasion`), made safe: { seen (how many
 * invasions they've been in), clock (their time in towns since the last, or since they began:
 * ms), due (the time in towns the next comes at), place (the town they're in now, or null), here
 * (how long they've been in it) }.
 */
export function clockOf(kept = null) {
    const whole = (value, least = 0) => (Number.isFinite(value) ? Math.max(least, Math.floor(value)) : least);
    const seen = whole(kept?.seen);

    return {
        seen,
        clock: whole(kept?.clock),
        due: Number.isFinite(kept?.due) && kept.due > 0 ? Math.floor(kept.due) : seen ? INVASION.every[0] : INVASION.first,
        place: typeof kept?.place === "string" ? kept.place : null,
        here: whole(kept?.here),
    };
}

/** When the next invasion comes to someone who's been in `seen` of them (time in towns, ms): `random` (core/random.js) for when, after the first. */
export function dueAfter(seen, random) {
    const [from, to] = INVASION.every;

    return seen ? Math.floor(from + random.next() * (to - from)) : INVASION.first;
}

/** Whether an invasion comes now to someone whose time in towns is `clock` (clockOf). */
export const isDue = (clock) => clock.place !== null && clock.clock >= clock.due && clock.here >= (clock.seen ? INVASION.settle : INVASION.settleFirst);

/**
 * How many of each side an invasion of `size` in all has: { invaders, defenders (the town's, its
 * bomb throwers among them), bombers (in each of its squads: `squads` of them) }.
 */
export function sidesOf(size = INVASION.size) {
    const defenders = Math.round(size * INVASION.defenders);
    const { squads, share, least } = INVASION.bombers;

    return { invaders: size - defenders, defenders, bombers: Math.max(least, Math.round(defenders * share)), squads };
}

/** What one of a band in a role fights with (the `k`th of its role, for which of its role's weapons). */
export function raiderArms(band, role, k = 0) {
    const arms = BANDS[band].arms[role] ?? BANDS[band].arms.front;

    return arms[k % arms.length];
}

/**
 * What an invasion's raiders felled are worth to whoever felled them: `bounty` gold each; the
 * guilds' merit and the town's thanks, each so much for taking part, one more for every so many
 * felled, at most so much ([for any, per so many, most]); and once they've felled `big` of all
 * the raiders, the town held, its lord's `purse`, `bigMerit` and `bigThanks` more, and a piece of
 * `quality` from its armoury. Their thanks a favour (`favour`) of the town's people's to the
 * player's, where theirs is another's.
 */
export const REWARD = Object.freeze({ bounty: 3, merit: Object.freeze([2, 4, 8]), thanks: Object.freeze([3, 3, 12]), big: 0.15, purse: 150, bigMerit: 4, bigThanks: 8, favour: 3, quality: "rare" });

/**
 * How someone is thanked for an invasion, for the raiders they felled (`felled`, of `of`), the
 * town held or not (`held`): { gold (a bounty for each, and the lord's purse), merit (the guilds'),
 * thanks (standing with the town's people, their own; else as a favour between peoples), big
 * (whether they brought down a share of them: the lord's own reward, a rare piece from the
 * armoury too) }. Nothing, for none felled.
 */
export function rewardOf({ felled, of, held = true }) {
    if (!(felled > 0)) {
        return { gold: 0, merit: 0, thanks: 0, big: false };
    }

    const big = held && of > 0 && felled / of >= REWARD.big;
    const [merit, meritPer, meritMost] = REWARD.merit;
    const [thanks, thanksPer, thanksMost] = REWARD.thanks;

    return {
        gold: felled * REWARD.bounty + (big ? REWARD.purse : 0),
        merit: Math.min(meritMost, merit + Math.floor(felled / meritPer)) + (big ? REWARD.bigMerit : 0),
        thanks: Math.min(thanksMost, thanks + Math.floor(felled / thanksPer)) + (big ? REWARD.bigThanks : 0),
        big,
    };
}

/** How the crier opens his calls while an invasion's on (core/crying.js OPENINGS, his others). */
export const ALARM = "To arms! To arms!";

/**
 * The crier's cries as an invasion comes (each at most 90 characters, as every cry: core/
 * crying.js), the way it's coming from (`way`: "north", "south-east"...): the raiders and their
 * road, then his plea to every able hand, the adventurers first, to defend the town.
 */
export function criesOf(band, way) {
    const { label } = BANDS[band];

    return [`${label} on the ${way} road! Every able hand, defend the town!`, `Adventurers! Able hands! To the ${way} road, and drive them off!`];
}

/** The crier's thanks once they're beaten off (at most 90 characters). */
export const thanksOf = (band) => `The ${BANDS[band].many} are beaten! The town thanks every brave soul who stood for it!`;
