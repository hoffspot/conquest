// Battles fought as battles were (docs/WAR.md *Battles*). Not each side one block on the road, its
// fighting all in a ring twenty metres across where the two met, but each side's line in three
// bodies across a wide front, a left, a centre and a right (as a medieval army's three battles),
// each closing with the body opposite it, so a fight's three clashes along a front of sixty to
// ninety metres. Behind the centre, a reserve held back, and the side's commander with their
// household troops (their vanguard), held back too: each sent in where one of its bodies is giving
// way, or through a gap where one of the enemy's has broken. Each body's morale its own, so one can
// break and run alone, leaving the centre's flank bare; the wings wheeling in on a flank once
// what's before them is gone, the two-handers swinging wide round the end of the enemy's line to
// fall on it from behind; the archers out ahead of the line before it closes, shooting, and a few
// sent at the enemy's weakest body to try it. And each band its own way of fighting (TACTICS):
// the northmen's wedge at one point of the line, the bandits' swarm round both its flanks, the
// cult standing off and burning, the corsairs hitting its ends and falling back, the sellswords'
// steady line and deep reserve. Its commander fallen, a side has no tactics left (its bodies hold
// and fight what's before them), and its morale takes a heavy blow.
//
// For a band's invasion of a town (core/invasions.js; core/host.js #invade), the armies met near
// a player (host.js #meetArmy, #watchArmies), an army's assault on a place, a seat's last stand
// and the debug overlay's field battle. The rules and the layout are here, pure data and
// arithmetic; the host keeps each engagement (plain data, kept in its snapshot) and steps it
// (host.js #engagements), its choices made from the battle as it stands, as deterministic as it.

import { atan2, cos, hypot, sin } from "./exact.js";
import { FORMATION, placeAt, placesOf, rolesOf } from "./formation.js";

/**
 * How a side stands (metres, and shares of it):
 * - `line`: its line's three bodies, the centre `centre` of it and each wing `wing`; none smaller
 *   than `least` (fewer: one body, the centre);
 * - `reserve`: `share` of what's left past its vanguard held back behind the centre (more or less
 *   by its tactics' `reserve`), for a side at least `from` strong;
 * - `vanguard`: its commander and their household troops, `share` of it (`least` to `most`), for a
 *   side at least `from` strong, each `hp` times as hard to bring down, striking `power` times as
 *   hard, their armour taking `armor` more off each blow;
 * - `gap`: between the bodies of its line; `deep`: a body's shield line in one rank up to so many
 *   files (shallow and wide, as a line's front was); `behind`: how far behind the line's rearmost
 *   rank its reserve stands, its vanguard as far again.
 */
export const BODIES = Object.freeze({
    line: Object.freeze({ centre: 0.4, wing: 0.3 }),
    least: 8,
    reserve: Object.freeze({ share: 0.15, from: 40 }),
    vanguard: Object.freeze({ share: 0.06, least: 3, most: 10, from: 24, hp: 1.8, power: 1.2, armor: 0.15 }),
    gap: 4,
    deep: 16,
    behind: 8,
});

/**
 * A side's commander (the first of its vanguard): `hp` times as hard to bring down as a soldier,
 * striking `power` times as hard, their armour taking `armor` more off each blow; and those of
 * their side within `aura` metres of them striking `auraPower` times as hard (and holding the
 * longer: MORALE `aura`).
 */
export const COMMANDER = Object.freeze({ hp: 6, power: 1.3, armor: 0.2, aura: 14, auraPower: 1.1 });

/**
 * What a side's commander is called, by who they lead (a band's, BANDS keys; a town's own; an
 * army's), and the names they go by (one picked for each): "Jarl Ulfgar"; what their household
 * troops are called (`guard`: "Northern huscarl"), the first of them their standard-bearer.
 */
export const COMMANDERS = Object.freeze({
    bandits: Object.freeze({ title: "Bandit King", guard: "king's man", names: Object.freeze(["Mord", "Garrick", "Black Tam", "Vosk", "Red Hale", "Crake"]) }),
    northmen: Object.freeze({ title: "Jarl", guard: "huscarl", names: Object.freeze(["Ulfgar", "Hrothmar", "Sigvald", "Eirik", "Thorbrand", "Ragnvald"]) }),
    cult: Object.freeze({ title: "Ash Prophet", guard: "flame-sworn", names: Object.freeze(["Vael", "Morrow", "Isca", "Cinder", "Oseth", "Harrow"]) }),
    sellswords: Object.freeze({ title: "Captain", guard: "veteran", names: Object.freeze(["Varro", "Dunstan", "Ilse", "Marek", "Corvin", "Brenna"]) }),
    corsairs: Object.freeze({ title: "Corsair Captain", guard: "old salt", names: Object.freeze(["Saltjaw", "Ness", "Quill", "Barra", "Doyle", "Mags"]) }),
    town: Object.freeze({ title: "Captain of the Guard", guard: "household guard", names: Object.freeze(["Aldric", "Maren", "Tobin", "Elsbeth", "Rowan", "Hale"]) }),
    army: Object.freeze({ title: "General", guard: "household guard", names: Object.freeze(["Aldous", "Severa", "Kendrick", "Ysolde", "Bram", "Corwen"]) }),
});

/** What a standard-bearer's called ("Northern standard-bearer"). */
export const STANDARD = "standard-bearer";

/**
 * What felling an enemy side's commander is worth to whoever felled them (core/host.js #trophy):
 * a bounty of `bounty` gold, the guilds' `merit`, and the like of the weapon they fought with for
 * a trophy, `quality` (core/progress.js QUALITIES).
 */
export const TROPHY = Object.freeze({ bounty: 150, merit: 6, quality: "veryRare" });

/**
 * A player's job in a battle, given them by the commander of the side they fight for as its lines
 * charge, if they're within `near` metres of its line (core/host.js #jobs): to hold the body of its
 * line nearest them (`hold`: that body still standing as the battle's won, and they within
 * `within` metres of it), or to bring down the enemy's standard-bearer (`banner`: they or theirs
 * fell them); done, `gold`, the guilds' `merit` and `thanks` (standing with that side's people,
 * their own; else a favour of theirs to the player's people).
 */
export const JOB = Object.freeze({ near: 80, within: 40, gold: 40, merit: 4, thanks: 6 });

/**
 * Each way of fighting: whether its archers go out ahead of the line before it closes (`volley`);
 * whether it sends a few to try the enemy's weakest body (`probe`); whether its bodies wheel in on
 * a flank once what's before them is gone (`flank`), and its wings' two-handers swing wide round
 * the end of the enemy's line (`flankers`); how deep its reserve (`reserve`, times BODIES'); and its
 * own: `wedge`, its centre charging first in a wedge at the enemy's centre, its wings after
 * (FIELD `wedge`); `envelop`, its wings swinging wide round both the enemy's flanks as they charge;
 * `stand`, its line standing where it is and letting them come; `raid`, its wings hitting the ends
 * of the enemy's line, falling back and coming again (FIELD `raid`). And how it goes through a
 * break in the enemy's line (`breach`, FIELD breach): "pour", the bold bands', the two-handers and
 * rear ranks of its body nearest it through at once; "commit", a steady line's, its reserve, then
 * its household, the body beside the break holding (and wheeling on a bared flank, as `flank`);
 * none, the cult's, standing.
 */
export const TACTICS = Object.freeze({
    line: Object.freeze({ volley: true, probe: true, flank: true, flankers: true, reserve: 1, breach: "commit" }),
    steady: Object.freeze({ volley: true, probe: true, flank: true, flankers: true, reserve: 1.6, breach: "commit" }),
    wedge: Object.freeze({ volley: true, probe: false, flank: true, flankers: false, reserve: 0.6, wedge: true, breach: "pour" }),
    swarm: Object.freeze({ volley: false, probe: false, flank: true, flankers: false, reserve: 0, envelop: true, breach: "pour" }),
    standoff: Object.freeze({ volley: false, probe: false, flank: false, flankers: false, reserve: 1, stand: true, breach: null }),
    skirmish: Object.freeze({ volley: true, probe: true, flank: true, flankers: false, reserve: 0.6, raid: true, breach: "pour" }),
});

/** Each band's way of fighting (TACTICS); a town's and an army's, a line's. */
export const BAND_TACTICS = Object.freeze({ bandits: "swarm", northmen: "wedge", cult: "standoff", sellswords: "steady", corsairs: "skirmish" });

/**
 * How far from their place in their body one who fights up close goes after an enemy once the
 * lines have charged (FIELD charge `hold`), by the host's record of them (`role`, `chief`,
 * `commander`): the shield line's, the two-handers', a chief's or one of a household's; null for
 * one who doesn't fight up close (an archer, a caster, a healer: as their role has it).
 */
export function holdOf(record) {
    return record?.chief || record?.commander ? FIELD.charge.hold.chief : (FIELD.charge.hold[record?.role] ?? null);
}

/** A band's (BANDS key), or anyone else's, way of fighting (TACTICS key). */
export const tacticsOf = (band) => BAND_TACTICS[band] ?? "line";

/**
 * How a fight goes (ms and metres): its state looked at every `every`; the lines halting `at`
 * apart, the archers out `ahead` of them, for `ms` (`volley`) before they charge (`charge`: at a
 * run, `speed`, on till they're `gap` apart; then holding the line, those who fight up close
 * going after an enemy no further from their place than their role's `hold` (the shield line
 * just across the gap between the fronts, at the foes before it and its neighbours'; the
 * two-handers behind its ends, the chiefs and the household a little further: holdOf), looking
 * as far as `sight`, so a line fights as a line, none leaving it to chase a foe unless they're
 * sent: flankers, a reserve, a breakthrough; one with no foe that near going to the help of one
 * of its own fighting a foe within `lap` of its place, so the ends of the longer line lap round
 * the shorter's, battle.js formation `hold`); `probe`: `size` of a wing's shield
 * line and two-handers sent at the enemy's weakest body, back after `ms` or once half of them
 * have fallen; `flank`: a body's two-handers sent round the end of the enemy's line `after` it's
 * been fighting a while, going `wide` of it, then in on it from `rear` behind; a body beset on its
 * flank by a body of the enemy's fighting within `near` of its end, not facing it head on; the
 * northmen's `wedge`, its wings charging `lead` after its centre; the corsairs' `raid`, hitting for
 * `hit`, falling back `back`, resting `rest`; a reserve or vanguard sent in at `commit` speed, the
 * next of them no sooner than `wait` after.
 *
 * A break in the enemy's line (`breach`): a body of it broken and run, or a hole torn in it, the
 * open ground between two of its bodies' fronts `hole` wider than it was formed (BODIES `gap`), as
 * a body whose shield line has no rank behind it left to step up narrows about its middle with
 * each it loses (battle.js #closeRanks); seen by a side with a body of its line within `near` of
 * it, its way of fighting going through as TACTICS `breach` has it. Those sent through run at
 * `speed`, out `beyond` past the enemy's front, then at the archers, casters and healers of theirs
 * within `reach` (only at them on their way, battle.js formation `seek`, or at any who strike them)
 * and, once there are none there (or after `ms`), round on the back of the nearest of their line,
 * `rear` behind it; each going after an enemy as far as `leash` from their place, looking `sight`.
 *
 * A side's archers, casters and healers with an enemy among them (`archers`), one who fights up
 * close within `near` of one of them: they give ground, back behind the nearest body of their own
 * that isn't beset (its reserve or household first), `back` behind its rearmost rank, and shoot
 * from there, back in their places once no such enemy's within `clear` of them; each keeping
 * `keep` from a foe come at it while it can (battle.js #backOff), and fighting with its knife once
 * it can't (weapons.js KNIFE). Their body's beset from behind meanwhile (MORALE `flanked`); told
 * once in `told` at most.
 *
 * A body most of whose shield line and two-handers stand idle (`idle`: fewer than `share` of them
 * fighting) for `ms`: with an enemy who fights up close within `close` of it, it closes up with
 * them, so its whole front's at them, not one end of it; with none, the enemy massing elsewhere, a
 * body of its line wheels on the flank of the nearest body of theirs (a way that wheels: TACTICS
 * `flank`), or comes up beside the nearest of its own that's fighting (one that doesn't), so no
 * stretch of a line stands idle while the battle's fought beside it; else (a reserve or household
 * sent in, done with what it was sent to), it goes at the nearest body of theirs still standing.
 * Its commander fallen, it only closes up or goes at them, and only after `leaderless` times as
 * long: so no battle's left with two sides standing apart. Any body standing, not held back, faces
 * the nearest body of the enemy's within `close` of its front, once it's an eighth of a turn off
 * it.
 */
export const FIELD = Object.freeze({
    every: 500,
    volley: Object.freeze({ at: 32, ahead: 17, ms: 6000 }),
    charge: Object.freeze({ speed: 2.2, gap: 2, hold: Object.freeze({ front: 5, heavy: 7, chief: 7 }), lap: 10, sight: 12 }),
    probe: Object.freeze({ size: 5, ms: 7000 }),
    flank: Object.freeze({ after: 4000, wide: 10, rear: 6, near: 8 }),
    wedge: Object.freeze({ lead: 3000 }),
    raid: Object.freeze({ hit: 6000, back: 12, rest: 4000 }),
    commit: Object.freeze({ speed: 2.4, wait: 10000 }),
    breach: Object.freeze({ hole: 3 * FORMATION.apart, near: 25, speed: 2.6, beyond: 6, reach: 30, ms: 15000, rear: 6, leash: 8, sight: 14 }),
    archers: Object.freeze({ near: 6, back: 4, clear: 10, keep: 3, told: 20000 }),
    idle: Object.freeze({ share: 0.5, ms: 3000, close: 12, leaderless: 3 }),
});

/**
 * Each body's morale (1 to start; a vanguard's `vanguard`), looked at every FIELD `every`: down by
 * `loss` times the share of it that's fallen since (the less for one that outnumbers the enemy
 * before it: `odds`), up `fresh` times the share come up to it (an invasion's reinforcements);
 * down `flanked` a second while it's beset on its flank or from behind (FIELD flank `near`), else
 * up `steady` a second to as high as its odds hold it (moraleAfter); up `aura` a second while its
 * commander's near it (COMMANDER `aura`), its losses then counting half; up `gain` a second while
 * it's giving more than it gets; up `gap` once, as the body before it breaks; down `banner` for
 * those near as its side's banner falls. Under `waver` it's giving way (the reserve's or the
 * vanguard's to send); at `break`, it breaks and runs, or (a band that never breaks: the bandits)
 * falters, falling back `falter.back` for `falter.ms` and coming again at `falter.to`. Its
 * commander fallen, every body of a side is down `commander.blow`, those within `commander.near`
 * of where they fell afraid for `commander.fear` ms. While a side's held (an invasion's, its
 * fallen made good: core/host.js #reinforceInvasion), none of it falls below `hold`.
 */
export const MORALE = Object.freeze({
    start: 1,
    vanguard: 1.2,
    loss: 1.3,
    fresh: 1,
    steady: 0.01,
    flanked: 0.03,
    aura: 0.012,
    gain: 0.004,
    gap: 0.1,
    banner: 0.15,
    waver: 0.45,
    break: 0.2,
    falter: Object.freeze({ back: 15, ms: 8000, to: 0.55 }),
    commander: Object.freeze({ blow: 0.35, near: 14, fear: 3000 }),
    hold: 0.3,
});

// The bodies of a line, and whose each faces (theirs facing ours: our left against their right)
const LINE = Object.freeze(["left", "centre", "right"]);
const FACING = Object.freeze({ left: "right", centre: "centre", right: "left" });

/**
 * How a side of `size` soldiers stands, mixed as `mix` (core/formation.js MIX's), by its way of
 * fighting (`tactic`, TACTICS key): its bodies, [{ part, roles }], its line's three (or for one too
 * few, one: the centre), then its reserve and its vanguard if it has them (BODIES). The vanguard's
 * first is its commander, in front, then their household: shields and two-handers.
 */
export function bodiesOf(size, mix, { tactic = "line", vanguard = true } = {}) {
    const bodies = [];
    const guard = vanguard && size >= BODIES.vanguard.from ? Math.min(BODIES.vanguard.most, Math.max(BODIES.vanguard.least, Math.round(size * BODIES.vanguard.share))) : 0;
    const deep = TACTICS[tactic]?.reserve ?? 1;
    const reserve = deep > 0 && size >= BODIES.reserve.from ? Math.round((size - guard) * BODIES.reserve.share * deep) : 0;
    const line = size - guard - reserve;

    if (line >= BODIES.least * 3) {
        const wing = Math.round(line * BODIES.line.wing);

        bodies.push({ part: "left", roles: rolesOf(wing, mix) }, { part: "centre", roles: rolesOf(line - wing * 2, mix) }, { part: "right", roles: rolesOf(wing, mix) });
    } else {
        bodies.push({ part: "centre", roles: rolesOf(line, mix) });
    }

    if (reserve) {
        bodies.push({ part: "reserve", roles: rolesOf(reserve, mix) });
    }

    if (guard) {
        bodies.push({ part: "vanguard", roles: ["front", ...rolesOf(guard - 1, { front: 0.5, heavy: 0.5 })] });
    }

    return bodies;
}

/** How a body's laid out (core/formation.js placesOf's `layout`): a wedge, the northmen's centre; else shallow and wide. */
export function layoutOf(part, tactic = "line") {
    return part === "centre" && TACTICS[tactic]?.wedge ? { wedge: true } : { deep: BODIES.deep };
}

/**
 * Where each of a side's bodies stands from its own anchor ([right, back], metres, as core/
 * formation.js places are, from the middle of the front of its line): the line's abreast, `gap`
 * apart, the centre in the middle; its reserve `behind` its rearmost rank, its vanguard as far
 * behind that. `bodies`: [{ part, places }] (each one's placesOf). By part.
 */
export function offsetsOf(bodies) {
    const width = (places) => (places.length ? Math.max(...places.map(([right]) => right)) - Math.min(...places.map(([right]) => right)) + FORMATION.apart : 0);
    const depth = (places) => (places.length ? Math.max(...places.map(([, back]) => back)) : 0);
    const by = Object.fromEntries(bodies.map((body) => [body.part, body]));
    const offsets = {};
    const centre = width(by.centre?.places ?? []);

    offsets.centre = [0, 0];

    for (const [part, side] of [
        ["left", -1],
        ["right", 1],
    ]) {
        if (by[part]) {
            offsets[part] = [side * (centre / 2 + BODIES.gap + width(by[part].places) / 2), 0];
        }
    }

    const rear = Math.max(0, ...LINE.filter((part) => by[part]).map((part) => depth(by[part].places)));

    if (by.reserve) {
        offsets.reserve = [0, rear + BODIES.behind];
    }

    if (by.vanguard) {
        offsets.vanguard = [0, rear + BODIES.behind * 2 + depth(by.reserve?.places ?? [])];
    }

    return offsets;
}

/** The body of the enemy's (its parts: `theirs`) that one of ours (`part`) faces: the one opposite, else the nearest of theirs to it there is. */
export function pairOf(part, theirs) {
    const opposite = FACING[part] ?? "centre";

    if (theirs.includes(opposite)) {
        return opposite;
    }

    const order = { left: ["centre", "left", "right"], centre: ["centre", "left", "right"], right: ["centre", "right", "left"] }[opposite];

    return order.find((each) => theirs.includes(each)) ?? null;
}

/**
 * A body's morale after `seconds` more of a fight (MORALE): `morale` as it was; `fallen` its share
 * that's fallen since, and `fresh` that's come up to it; `odds`, how many of it there are to each
 * of the enemy's before it; `flanked` whether it's beset on its flank or from behind; `aura`
 * whether its commander's near; `winning` whether it's giving more than it gets. Steadying, not
 * flanked, to as high as its odds hold it: 0.8 at even odds, 1 at three to two, 0.6 at one to two.
 */
export function moraleAfter(morale, { seconds, fallen = 0, fresh = 0, odds = 1, flanked = false, aura = false, winning = false }) {
    const held = Math.min(MORALE.start, 0.4 + 0.4 * Math.min(1.5, Math.max(0, odds)));
    let next = morale - MORALE.loss * fallen * Math.sqrt(Math.min(2, Math.max(0.5, 1 / Math.max(odds, 1e-3)))) * (aura ? 0.5 : 1) + MORALE.fresh * fresh;

    next -= flanked ? MORALE.flanked * seconds : 0;
    next = !flanked && next < held ? Math.min(held, next + MORALE.steady * seconds) : next;
    next += aura ? MORALE.aura * seconds : 0;
    next += winning ? MORALE.gain * seconds : 0;

    return Math.max(0, Math.min(MORALE.vanguard, next));
}

/** Where a point is from a body standing at `anchor` facing `facing`: [right, back] (as places are). */
export function relativeTo({ anchor, facing }, [x, y]) {
    const [dx, dy] = [x - anchor[0], y - anchor[1]];
    const [ax, ay] = [sin(facing), cos(facing)];

    return [-ay * dx + ax * dy, -(ax * dx + ay * dy)];
}

/** The way one point is from another (radians, as a formation's facing: from south, towards east). */
export const towards = (from, to) => atan2(to[0] - from[0], to[1] - from[1]);

/** How far apart two points are. */
export const apart = (a, b) => hypot(a[0] - b[0], a[1] - b[1]);

/** A point `[right, back]` from a body standing at `anchor` facing `facing` (core/formation.js placeAt). */
export const at = (formation, place) => placeAt(formation, place);

/** Each soldier's place in their body (core/formation.js placesOf, by its layout). */
export const placesIn = (roles, layout) => placesOf(roles, layout);

/**
 * An engagement between two sides (plain data, kept in the host's snapshot): `id`; `sides`, two of
 * { key, name, band (BANDS key, or null), tactic (TACTICS key), tactics (whether it has them still:
 * its commander's alive), falters (a band that never breaks: its beaten bodies fall back and come
 * again), exit ([x, y]: where a broken body of it runs to), run (how fast, m/s), commander and
 * banner (ids, or null), bodies: [{ part, formation (its battle formation's id), size, alive,
 * morale, state, pair, until, at }] }; `phase` ("march", "volley" or "melee": one already at it,
 * as a seat's last stand) since `at`; when it's next to be stepped (`next`: the host's); the sides
 * beaten (`beaten`). Each body's soldiers are those in its formation (battle.js `formation`), and
 * in its `probe` or `flank` (those sent out of it a while).
 */
export function engagementOf({ id, sides, now, phase = "march" }) {
    return {
        id,
        phase,
        at: now,
        lookAt: now,
        next: now,
        beaten: [],
        sides: sides.map((side) => ({
            tactics: true,
            falters: false,
            exit: null,
            run: 2.6,
            commander: null,
            banner: null,
            fell: null,
            bannerFell: null,
            ...side,
            bodies: side.bodies.map((body) => ({ alive: null, morale: body.part === "vanguard" ? MORALE.vanguard : MORALE.start, state: body.part === "reserve" || body.part === "vanguard" ? "held" : "line", pair: null, until: 0, at: now, flanked: false, ...body })),
        })),
    };
}

// The formations a body's soldiers can be in: its own, its probe's, its two-handers' sent wide and
// those it sent through a break in the enemy's line
const probeOf = (body) => `${body.formation}:probe`;
const flankOf = (body) => `${body.formation}:flank`;
const throughOf = (body) => `${body.formation}:through`;

// How far apart two ways are (radians, 0 to π)
const across = (a, b) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);

/** The formations a body's soldiers can be in, by its own (`formation`): its own, its probe's, its flankers' and those it sent through a break. */
export const formationsOfBody = (formation) => [formation, `${formation}:probe`, `${formation}:flank`, `${formation}:through`];

// Those who shoot from behind a line, or heal from it (core/formation.js ROLES)
const SHOOTERS = Object.freeze(["archer", "caster", "healer"]);

// Whether one of `close` (enemies who fight up close) is among a body's archers, casters and
// healers: within FIELD archers `near` of `point` (one of them), and behind the first rank of their
// body (`formation`): come through or round it, not fighting at its front
const among = (formation, close, point) => close.some((them) => apart([them.x, them.y], point) <= FIELD.archers.near && relativeTo(formation, [them.x, them.y])[1] > FORMATION.rank);

/**
 * An engagement stepped, every FIELD `every` of the battle's time (host.js #fight). `ctx`:
 * { battle, now (ms), hold (whether its bodies hold whatever: none breaking, MORALE `hold`),
 * record(id) (the host's record of a soldier: its `role`, `chief`, `commander`, `power`),
 * event(change, data) (told what happens: "volley", "probe", "charge", "flank", "flankers",
 * "commit", "breach", "rear", "reinforce", "fallBack", "waver", "break", "falter", "rally",
 * "commanderFell", "bannerFell"), afflict(id, kind,
 * ms) }. Returns the sides (their indexes) that have no body left that isn't broken, run or down
 * (and keeps them: `beaten`).
 */
export function stepEngagement(engagement, ctx) {
    const { battle, now } = ctx;
    const seconds = Math.max(0, now - engagement.lookAt) / 1000;

    engagement.lookAt = now;

    // Who's in each body now, standing (its own formation, its probe's and its flankers')
    const byFormation = new Map();

    for (const actor of battle.actors) {
        if (!actor.dead && actor.formation) {
            (byFormation.get(actor.formation.id) ?? byFormation.set(actor.formation.id, []).get(actor.formation.id)).push(actor);
        }
    }

    const membersOf = (body) => formationsOfBody(body.formation).flatMap((id) => byFormation.get(id) ?? []);
    const formationOf = (body) => battle.formations[body.formation] ?? null;
    const live = (body) => body.alive > 0 && body.state !== "broken" && body.state !== "gone";
    const line = (side) => side.bodies.filter((body) => LINE.includes(body.part) && live(body));
    const members = new Map();

    for (const side of engagement.sides) {
        for (const body of side.bodies) {
            const here = membersOf(body);
            const joined = body.joined ?? 0;

            body.fallen = body.alive === null ? 0 : Math.max(0, body.alive + joined - here.length);
            body.fresh = joined;
            body.joined = 0;
            body.alive = here.length;
            members.set(body, here);

            if (!here.length && body.state !== "gone") {
                body.brokeAt ??= LINE.includes(body.part) && formationOf(body) ? [...formationOf(body).anchor] : null;
                body.state = "gone";
            }
        }
    }

    // Who of each side fights up close, standing (its bodies' and those sent out of them)
    const close = engagement.sides.map((side) => side.bodies.flatMap((body) => members.get(body)).filter((actor) => actor.formation.role === "front" || actor.formation.role === "heavy" || holdOf(ctx.record(actor.id)) !== null));

    engagement.sides.forEach((side, k) => {
        const foe = engagement.sides[1 - k];
        const commander = side.commander === null ? null : battle.actor(side.commander);

        // Its commander fallen: no tactics left, every body of it shaken, those near them afraid
        if (side.commander !== null && side.fell === null && (!commander || commander.dead)) {
            side.fell = now;
            side.tactics = false;

            const where = commander ? [commander.x, commander.y] : null;

            for (const body of side.bodies.filter(live)) {
                body.morale = Math.max(0, body.morale - MORALE.commander.blow);

                for (const actor of where ? members.get(body) : []) {
                    if (apart([actor.x, actor.y], where) <= MORALE.commander.near) {
                        ctx.afflict(actor.id, "fear", MORALE.commander.fear);
                    }
                }
            }

            ctx.event("commanderFell", { side: side.key, fallen: side.commander, name: commander?.name ?? "", at: where });
        }

        // Its banner fallen: those near shaken
        const banner = side.banner === null ? null : battle.actor(side.banner);

        if (side.banner !== null && side.bannerFell === null && (!banner || banner.dead)) {
            side.bannerFell = now;

            for (const body of side.bodies.filter(live)) {
                const formation = formationOf(body);

                if (banner && formation && apart(formation.anchor, [banner.x, banner.y]) <= MORALE.commander.near * 1.5) {
                    body.morale = Math.max(0, body.morale - MORALE.banner);
                }
            }

            ctx.event("bannerFell", { side: side.key, fallen: side.banner, at: banner ? [banner.x, banner.y] : null });
        }

        // Each body's morale: what it's lost, whether it's beset on a flank or from behind, its
        // commander near, how the fight goes for it
        for (const body of side.bodies.filter(live)) {
            const formation = formationOf(body);
            const here = members.get(body);

            if (!formation || engagement.phase === "march") {
                continue;
            }

            const half = Math.max(FORMATION.apart, ...here.map(({ formation: { slot } }) => Math.abs(slot[0])));
            const pair = foe.bodies.find(({ part }) => part === body.pair);
            // (The enemy's before it: the body it faces, else the nearest of their line's)
            const before = pair && live(pair) ? pair : line(foe).sort((p, q) => apart(formationOf(p)?.anchor ?? [Infinity, 0], formation.anchor) - apart(formationOf(q)?.anchor ?? [Infinity, 0], formation.anchor))[0];
            const aura = Boolean(commander && !commander.dead && apart(formation.anchor, [commander.x, commander.y]) <= COMMANDER.aura + half);

            // (Beset on its flank or from behind: a body of the enemy's fighting near its end, off
            // its front's end or behind it, facing it, its own way not head on at it, as a body
            // wheeled in on its flank or two-handers round behind it come; not one this one's
            // wheeled onto the flank of, facing away. How far its way's turned from the way back at
            // this one's, 0 behind it; and from the way to this one, 0 straight at it)
            body.flanked = foe.bodies.some((theirs) =>
                formationsOfBody(theirs.formation).some((id) => {
                    const them = battle.formations[id];
                    const [right, back] = them ? relativeTo(formation, them.anchor) : [0, 0];

                    return (
                        Boolean(them) &&
                        !them.broken &&
                        now - them.engagedAt < 1500 &&
                        apart(them.anchor, formation.anchor) <= half + FIELD.flank.near &&
                        (Math.abs(right) > half || back > 0) &&
                        across(them.facing, formation.facing) < (Math.PI * 3) / 4 &&
                        across(them.facing, towards(them.anchor, formation.anchor)) < Math.PI / 3
                    );
                }),
            );
            // (Beset from behind, too: an enemy who fights up close among its archers, casters and
            // healers, come through or round its front)
            body.rear = here.some((one) => SHOOTERS.includes(one.formation.role) && among(formation, close[1 - k], [one.x, one.y]));
            body.morale = moraleAfter(body.morale, { seconds, fallen: body.fallen / Math.max(1, body.size), fresh: body.fresh / Math.max(1, body.size), odds: before ? here.length / Math.max(1, before.alive) : 1, flanked: body.flanked || body.rear, aura, winning: Boolean(pair && pair.fallen > body.fallen) });

            if (ctx.hold) {
                body.morale = Math.max(body.morale, MORALE.hold);
            }
        }

        // (Those near its commander striking the harder: COMMANDER `aura`)
        for (const body of side.bodies) {
            for (const actor of members.get(body)) {
                const base = ctx.record(actor.id)?.power ?? 1;
                const near = commander && !commander.dead && actor !== commander && apart([actor.x, actor.y], [commander.x, commander.y]) <= COMMANDER.aura;

                actor.power.melee = near ? base * COMMANDER.auraPower : base;
            }
        }
    });

    // The phase the fight's in: marching on each other, the archers out ahead, or at it
    const [a, b] = engagement.sides;
    const nearest = Math.min(Infinity, ...line(a).flatMap((mine) => line(b).map((theirs) => (formationOf(mine) && formationOf(theirs) ? apart(formationOf(mine).anchor, formationOf(theirs).anchor) : Infinity))));

    if (engagement.phase === "march") {
        for (const [k, side] of engagement.sides.entries()) {
            march(side, engagement.sides[1 - k], { formationOf, line });
        }

        if (nearest <= FIELD.volley.at) {
            // (Only a side standing in a line of three bodies: a few skirmishing go straight in)
            const volleying = engagement.sides.filter((side) => side.tactics && TACTICS[side.tactic]?.volley && line(side).length >= LINE.length);

            if (volleying.length) {
                engagement.phase = "volley";
                engagement.at = now;

                for (const side of engagement.sides) {
                    for (const body of line(side)) {
                        battle.formation(body.formation, { to: null, advance: false });
                    }
                }

                for (const side of volleying) {
                    for (const body of line(side)) {
                        const formation = formationOf(body);

                        for (const actor of formation ? members.get(body) : []) {
                            if (actor.formation.role === "archer" || actor.formation.role === "caster") {
                                actor.formation.post = placeAt(formation, [actor.formation.slot[0], -FIELD.volley.ahead]);
                            }
                        }
                    }
                }

                engagement.sides.forEach((side, k) => side.tactics && TACTICS[side.tactic]?.probe && probe(side, engagement.sides[1 - k], { battle, now, ctx, members, formationOf, line }));
                ctx.event("volley", { sides: volleying.map(({ key }) => key) });
            } else {
                charge(engagement, ctx, { members, formationOf, line });
            }
        }
    } else if (engagement.phase === "volley" && now - engagement.at >= FIELD.volley.ms) {
        charge(engagement, ctx, { members, formationOf, line });
    }

    // At it: each body as its side's tactics have it, breaking, faltering, wheeling, sent in, going
    // through a break; its archers giving ground from an enemy come among them
    if (engagement.phase === "melee") {
        engagement.sides.forEach((side, k) => melee(side, engagement.sides[1 - k], { battle, now, ctx, members, formationOf, line, foes: close[1 - k] }));
        engagement.sides.forEach((side, k) => fallBack(side, close[1 - k], { now, ctx, members, formationOf }));
    }

    // (The probes back to their bodies once their time's up or half of them are down)
    for (const side of engagement.sides) {
        for (const body of side.bodies) {
            const sent = byFormation.get(probeOf(body)) ?? [];

            if (body.probe && (now >= body.probe.until || sent.length <= body.probe.size / 2)) {
                for (const actor of sent) {
                    actor.formation.id = body.formation;
                }

                battle.formation(probeOf(body), null);
                body.probe = null;
            }
        }
    }

    // Beaten: a side none of whose bodies stand
    engagement.beaten = engagement.sides.flatMap((side, k) => (side.bodies.some(live) ? [] : [k]));

    return engagement.beaten;
}

// A side marching on the other: its line's bodies abreast towards the enemy's centre, each keeping
// its place in the line (offsetsOf, as it was formed: `offset`), its reserve and vanguard behind,
// halting short of where the archers would go out (FIELD volley `at`); a side that stands, standing
function march(side, foe, { formationOf, line }) {
    const centre = side.bodies.find(({ part }) => part === "centre") ?? line(side)[0];
    const theirs = foe.bodies.find(({ part }) => part === "centre") ?? line(foe)[0];
    const [mine, them] = [centre && formationOf(centre), theirs && formationOf(theirs)];

    if (!mine || !them || TACTICS[side.tactic]?.stand) {
        return;
    }

    const facing = towards(mine.anchor, them.anchor);
    const distance = apart(mine.anchor, them.anchor);
    const goal = placeAt({ anchor: mine.anchor, facing }, [0, -Math.max(0, distance - FIELD.volley.at + 1)]);

    for (const body of side.bodies.filter((one) => one.state === "line" || one.state === "held")) {
        const formation = formationOf(body);

        if (formation && body.offset) {
            formation.to = placeAt({ anchor: goal, facing }, body.offset);
            formation.advance = false;
        }
    }
}

// A side's probe (FIELD probe): a few of the shield line and two-handers of the wing nearest the
// enemy's weakest body sent at it, at a run, in a body of their own (`probeOf`) till they're
// called back
function probe(side, foe, { battle, now, ctx, members, formationOf, line }) {
    const theirs = line(foe).sort((p, q) => p.alive * p.morale - q.alive * q.morale)[0];
    const target = theirs && formationOf(theirs);
    const wings = line(side).filter(({ part }) => part !== "centre");
    const from = wings.sort((p, q) => apart(formationOf(p)?.anchor ?? [Infinity, 0], target?.anchor ?? [0, 0]) - apart(formationOf(q)?.anchor ?? [Infinity, 0], target?.anchor ?? [0, 0]))[0];

    if (!target || !from || !formationOf(from)) {
        return;
    }

    const sent = members
        .get(from)
        .filter((actor) => actor.formation.id === from.formation && (actor.formation.role === "front" || actor.formation.role === "heavy") && !ctx.record(actor.id)?.chief)
        .slice(0, FIELD.probe.size);

    if (sent.length < 3) {
        return;
    }

    const { anchor, facing } = formationOf(from);

    battle.formation(probeOf(from), { anchor: [...anchor], facing, to: [...target.anchor], speed: FIELD.charge.speed, charge: true, advance: true });

    sent.forEach((actor, k) => {
        actor.formation.id = probeOf(from);
        actor.formation.slot = [(k - (sent.length - 1) / 2) * FORMATION.apart, 0];
        delete actor.formation.post;
    });

    from.probe = { until: now + FIELD.probe.ms, size: sent.length };
    ctx.event("probe", { side: side.key, part: from.part, at: theirs.part, to: [...target.anchor] });
}

// Both sides' lines charging: the archers back in their places, each body at the one facing it (a
// side that stands, standing), on till they're FIELD charge `gap` apart; the northmen's centre
// first, its wings after (FIELD wedge); the bandits' wings round the enemy's flanks; and everyone
// who fights up close holding the line from then on (holdOf)
function charge(engagement, ctx, { members, formationOf, line }) {
    const { battle, now } = ctx;

    engagement.phase = "melee";
    engagement.at = now;

    engagement.sides.forEach((side, k) => {
        const foe = engagement.sides[1 - k];
        const tactic = side.tactics ? TACTICS[side.tactic] : TACTICS.line;

        for (const body of side.bodies) {
            // (Holding the line from now: none of it chasing one who shot it from afar, and those
            // with no foe before them helping their own, battle.js formation `hold`; its archers,
            // casters and healers keeping off a foe come at them)
            battle.formation(body.formation, { hold: FIELD.charge.lap });

            for (const actor of members.get(body) ?? []) {
                delete actor.formation.post;

                const hold = holdOf(ctx.record(actor.id));

                if (hold !== null) {
                    actor.leash = hold;
                    actor.sight = FIELD.charge.sight;
                } else if (SHOOTERS.includes(actor.formation.role)) {
                    actor.keep = FIELD.archers.keep;
                }
            }
        }

        if (TACTICS[side.tactic]?.stand) {
            return;
        }

        for (const body of line(side)) {
            const waits = side.tactics && tactic.wedge && body.part !== "centre";

            body.pair = pairOf(body.part, line(foe).map(({ part }) => part));
            body.state = waits ? "waiting" : "charging";
            body.until = waits ? now + FIELD.wedge.lead : 0;

            if (!waits) {
                charging(body, side, foe, { formationOf, envelop: side.tactics && tactic.envelop, raid: side.tactics && tactic.raid, now });
            }
        }
    });

    ctx.event("charge", { anchors: engagement.sides.map((side) => formationOf(side.bodies.find(({ part }) => part === "centre") ?? side.bodies[0])?.anchor ?? null) });
}

// One body charging the body it faces (its `pair`): to just short of where the two meet; the
// bandits' (`envelop`) and the corsairs' (`raid`) wings at its outer end, round its flank
function charging(body, side, foe, { formationOf, envelop = false, raid = false, now }) {
    const formation = formationOf(body);
    const theirs = foe.bodies.find(({ part }) => part === body.pair);
    const them = theirs && formationOf(theirs);

    if (!formation || !them) {
        return;
    }

    const stands = TACTICS[foe.tactic]?.stand;
    const [mx, my] = stands ? them.anchor : [(formation.anchor[0] + them.anchor[0]) / 2, (formation.anchor[1] + them.anchor[1]) / 2];
    const facing = towards(formation.anchor, them.anchor);
    let to = placeAt({ anchor: [mx, my], facing }, [0, FIELD.charge.gap / (stands ? 1 : 2)]);

    if ((envelop || raid) && body.part !== "centre") {
        // (Round its outer end: its flank the side away from their centre)
        const half = FORMATION.apart * 6;
        const out = relativeTo(them, formation.anchor)[0] >= 0 ? 1 : -1;

        to = placeAt(them, [out * (half + FIELD.flank.wide / 2), FIELD.charge.gap]);
        body.state = raid ? "raiding" : "charging";
        body.until = raid ? now + FIELD.raid.hit : 0;
    }

    formation.to = to;
    formation.speed = FIELD.charge.speed;
    formation.charge = true;
    formation.advance = true;
}

// A side's bodies at it (once the lines have charged): the northmen's wings after their wedge;
// each body breaking when its morale's gone (a band that never breaks, faltering: falling back,
// and coming again); the corsairs' wings hitting, falling back and coming again; a body whose
// enemy's broken wheeling in on the nearest flank there is; the wings' two-handers swinging wide
// round the enemy's line to fall on it from behind; and its reserve, then its vanguard, sent in
// where one of its bodies is giving way, or through a gap in the enemy's line
function melee(side, foe, { battle, now, ctx, members, formationOf, line, foes = [] }) {
    const tactic = side.tactics ? TACTICS[side.tactic] : null;
    const live = (body) => body.alive > 0 && body.state !== "broken" && body.state !== "gone";

    for (const body of side.bodies.filter(live)) {
        const formation = formationOf(body);

        if (!formation) {
            continue;
        }

        const engaged = now - formation.engagedAt < 1500;
        const pair = foe.bodies.find(({ part }) => part === body.pair);

        // Beaten: breaking, or a band that never breaks, faltering
        if (body.morale <= MORALE.break && body.state !== "faltering") {
            if (side.falters) {
                body.state = "faltering";
                body.until = now + MORALE.falter.ms;
                formation.to = placeAt(formation, [0, MORALE.falter.back]);
                formation.charge = false;
                formation.advance = false;
                ctx.event("falter", { side: side.key, part: body.part, at: [...formation.anchor] });
            } else {
                body.state = "broken";
                body.brokeAt = [...formation.anchor];
                battle.formation(body.formation, { broken: true, to: side.exit ? [...side.exit] : placeAt(formation, [0, 60]), speed: side.run, advance: false, charge: false });

                for (const sent of [probeOf(body), flankOf(body), throughOf(body)]) {
                    if (battle.formations[sent]) {
                        battle.formation(sent, { broken: true, to: side.exit ? [...side.exit] : placeAt(formation, [0, 60]), speed: side.run, advance: false, charge: false });
                    }
                }

                // (The body that beat it, heartened)
                for (const theirs of foe.bodies.filter((one) => one.pair === body.part && live(one))) {
                    theirs.morale = Math.min(MORALE.vanguard, theirs.morale + MORALE.gap);
                }

                ctx.event("break", { side: side.key, part: body.part, at: [...formation.anchor] });
            }

            continue;
        }

        if (body.state === "faltering") {
            if (now >= body.until) {
                body.morale = Math.max(body.morale, MORALE.falter.to);
                body.state = "charging";
                body.pair = pairOf(body.part === "reserve" || body.part === "vanguard" ? "centre" : body.part, foe.bodies.filter((one) => LINE.includes(one.part) && live(one)).map(({ part }) => part)) ?? body.pair;
                formation.advance = true;
                charging(body, side, foe, { formationOf, now });
                ctx.event("rally", { side: side.key, part: body.part, at: [...formation.anchor] });
            }

            continue;
        }

        if (body.morale < MORALE.waver && !body.wavered) {
            body.wavered = true;
            ctx.event("waver", { side: side.key, part: body.part, at: [...formation.anchor] });
        } else if (body.morale >= MORALE.waver + 0.1) {
            body.wavered = false;
        }

        // (Its tactics gone with its commander: whatever it was about, at the enemy before it now)
        if (!tactic && (body.state === "waiting" || body.state === "raiding" || body.state === "resting")) {
            body.state = "charging";
            formation.advance = true;
            charging(body, side, foe, { formationOf, now });
        }

        // (The northmen's wings, after their wedge)
        if (body.state === "waiting" && now >= body.until) {
            body.state = "charging";
            charging(body, side, foe, { formationOf, now });
        }

        // (The corsairs' wings: hit, fall back, come again)
        if (tactic?.raid && (body.state === "raiding" || body.state === "resting") && now >= body.until) {
            if (body.state === "raiding") {
                body.state = "resting";
                body.until = now + FIELD.raid.rest;
                formation.to = placeAt(formation, [0, FIELD.raid.back]);
                formation.charge = false;
                formation.advance = false;
            } else {
                charging(body, side, foe, { formationOf, raid: true, now });
            }
        }

        // (Standing, not held back: facing the nearest body of the enemy's within FIELD idle
        // `close` of its front, as one turns that's wheeled onto a flank or come up beside its
        // own, once it's there; not for less than an eighth of a turn)
        if (!formation.to && body.state !== "held") {
            const half = Math.max(FORMATION.apart * 3, ...(members.get(body) ?? []).filter(({ formation: { id } }) => id === body.formation).map(({ formation: { slot } }) => Math.abs(slot[0])));
            const them = foe.bodies
                .filter((one) => live(one) && formationOf(one) && !formationOf(one).broken)
                .map(formationOf)
                .filter(({ anchor }) => apart(anchor, formation.anchor) <= half + FIELD.idle.close)
                .sort((p, q) => apart(p.anchor, formation.anchor) - apart(q.anchor, formation.anchor))[0];
            const way = them ? towards(formation.anchor, them.anchor) : formation.facing;

            if (across(way, formation.facing) > Math.PI / 4) {
                formation.facing = way;
            }
        }

        // (Most of it idle a while: closing up, wheeling on the enemy's flank, coming up beside its
        // own or going at them, FIELD idle; leaderless, only closing up or going at them, later)
        if (["line", "charging", "flanking", "closing", "reinforcing", "committed"].includes(body.state) && !formation.to) {
            const own = (members.get(body) ?? []).filter(({ formation: { id, role } }) => id === body.formation && (role === "front" || role === "heavy"));

            if (own.length && own.filter(({ target }) => target !== null).length < own.length * FIELD.idle.share) {
                body.idleSince ??= now;

                if (now - body.idleSince >= FIELD.idle.ms * (tactic ? 1 : FIELD.idle.leaderless)) {
                    body.idleSince = now;
                    idle(body, side, foe, { now, ctx, members, formationOf, line, foes, live, leaderless: !tactic });
                }
            } else {
                body.idleSince = null;
            }
        }

        // (Nothing before it now: wheeling in on the nearest flank of theirs there is)
        if (tactic?.flank && LINE.includes(body.part) && (!pair || !live(pair)) && body.state !== "flanking") {
            const target = foe.bodies.filter((one) => LINE.includes(one.part) && live(one) && formationOf(one)).sort((p, q) => apart(formationOf(p).anchor, formation.anchor) - apart(formationOf(q).anchor, formation.anchor))[0];

            if (target) {
                const them = formationOf(target);
                const side_ = relativeTo(them, formation.anchor)[0] >= 0 ? 1 : -1;
                const half = Math.max(FORMATION.apart * 3, ...(members.get(target) ?? []).map(({ formation: { slot } }) => Math.abs(slot[0])));

                body.state = "flanking";
                body.pair = target.part;
                Object.assign(formation, { to: placeAt(them, [side_ * (half + 3), 1]), speed: FIELD.charge.speed, charge: true, advance: true });
                ctx.event("flank", { side: side.key, part: body.part, at: target.part, to: [...formation.to] });
            }
        }

        // (Its two-handers, once it's been at it a while, sent wide round the end of the line
        // before it, then in on it from behind)
        if (engaged && body.engagedSince === undefined) {
            body.engagedSince = now;
        }

        if (tactic?.flankers && (body.part === "left" || body.part === "right") && engaged && !body.flankers && now - body.engagedSince >= FIELD.flank.after && pair && live(pair) && formationOf(pair)) {
            const them = formationOf(pair);
            const heavy = members.get(body).filter((actor) => actor.formation.id === body.formation && actor.formation.role === "heavy");

            if (heavy.length >= 2) {
                const out = relativeTo(them, formation.anchor)[0] >= 0 ? 1 : -1;
                const half = Math.max(FORMATION.apart * 3, ...(members.get(pair) ?? []).map(({ formation: { slot } }) => Math.abs(slot[0])));
                const wide = placeAt(them, [out * (half + FIELD.flank.wide), -2]);

                battle.formation(flankOf(body), { anchor: [...formation.anchor], facing: formation.facing, to: wide, speed: FIELD.charge.speed, charge: true, advance: false });
                heavy.forEach((actor, k) => {
                    actor.formation.id = flankOf(body);
                    actor.formation.slot = [(k - (heavy.length - 1) / 2) * FORMATION.apart, 0];
                });
                body.flankers = { stage: "wide", at: pair.part };
                ctx.event("flankers", { side: side.key, part: body.part, at: pair.part, to: [...wide] });
            }
        }

        if (body.flankers?.stage === "wide") {
            const sent = battle.formations[flankOf(body)];
            const target = foe.bodies.find(({ part }) => part === body.flankers.at);
            const them = target && formationOf(target);

            if (sent && !sent.to && them) {
                body.flankers.stage = "rear";
                Object.assign(sent, { to: placeAt(them, [0, FIELD.flank.rear + Math.max(FORMATION.rank, ...(members.get(target) ?? []).map(({ formation: { slot } }) => slot[1]))]), charge: true, advance: true });
            }
        }
    }

    // Its line all broken or down: its reserve and vanguard, as they stand, thrown at the nearest
    // of the enemy's, the last throw (its commander fallen or not)
    if (!line(side).length) {
        for (const body of side.bodies.filter((one) => one.state === "held" && live(one) && formationOf(one))) {
            const formation = formationOf(body);
            const them = foe.bodies
                .filter((one) => live(one) && formationOf(one))
                .map(formationOf)
                .sort((p, q) => apart(p.anchor, formation.anchor) - apart(q.anchor, formation.anchor))[0];

            if (them) {
                body.state = "committed";
                Object.assign(formation, { to: placeAt(them, [0, -2]), speed: FIELD.commit.speed, charge: true, advance: true });
                ctx.event("commit", { side: side.key, part: body.part, to: [...formation.to], at: "last", commander: body.part === "vanguard" ? side.commander : null });
            }
        }
    }

    // Those it's sent through a break in the enemy's line, on their way (whatever's become of its
    // commander since)
    for (const body of side.bodies.filter((one) => one.through)) {
        goThrough(body, side, foe, { battle, now, ctx, members, formationOf, line });
    }

    // Its reserve, then its vanguard, sent in where one of its line is giving way; or through a
    // break in the enemy's line, as its way of fighting goes (none of it, its commander fallen)
    if (!tactic) {
        return;
    }

    const held = side.bodies.filter((body) => (body.part === "reserve" || body.part === "vanguard") && body.state === "held" && live(body));
    const giving = line(side).filter((body) => body.morale < MORALE.waver && body.state !== "faltering" && formationOf(body) && now - formationOf(body).engagedAt < 1500);
    const sent = held.find(({ part }) => part === "reserve") ?? held.find(({ part }) => part === "vanguard");
    const ready = now - (side.committedAt ?? -Infinity) >= FIELD.commit.wait;

    if (sent && giving.length && ready && formationOf(sent)) {
        const target = formationOf(giving.sort((p, q) => p.morale - q.morale)[0]);
        const to = placeAt(target, [0, -2]);

        sent.state = "committed";
        side.committedAt = now;
        Object.assign(formationOf(sent), { to, speed: FIELD.commit.speed, charge: true, advance: true });
        ctx.event("commit", { side: side.key, part: sent.part, to, at: giving[0].part, commander: sent.part === "vanguard" ? side.commander : null });
    }

    breakThrough(side, foe, { battle, now, ctx, members, formationOf, line, live, sent: ready && sent?.state === "held" ? sent : null });
}

// A body standing idle (FIELD idle): an enemy who fights up close (`foes`) within `close` of it,
// closing up with them ("closing"); else, one of its line, its commander standing, wheeling on the
// flank of the nearest body of the enemy's line (as when what was before it is gone: a way that
// wheels, TACTICS `flank`), or up beside the nearest of its own line that's fighting
// ("reinforcing"); else (or `leaderless`) going at the nearest body of theirs still standing
function idle(body, side, foe, { now, ctx, members, formationOf, line, foes, live, leaderless = false }) {
    const formation = formationOf(body);
    const tactic = leaderless ? null : TACTICS[side.tactic];
    const nearest = foes.reduce((best, one) => (!best || apart([one.x, one.y], formation.anchor) < apart([best.x, best.y], formation.anchor) ? one : best), null);
    const half = (one) => Math.max(FORMATION.apart * 3, ...(members.get(one) ?? []).filter(({ formation: { id } }) => id === one.formation).map(({ formation: { slot } }) => Math.abs(slot[0])));

    if (nearest && apart([nearest.x, nearest.y], formation.anchor) <= FIELD.idle.close) {
        body.state = LINE.includes(body.part) ? "closing" : body.state;
        Object.assign(formation, { to: placeAt({ anchor: [nearest.x, nearest.y], facing: towards(formation.anchor, [nearest.x, nearest.y]) }, [0, FIELD.charge.gap]), speed: FIELD.charge.speed, charge: true, advance: true });

        return;
    }

    if (tactic && LINE.includes(body.part) && idleTurn(body, side, foe, { now, ctx, formationOf, line, live, tactic, half })) {
        return;
    }

    // (Else at the nearest body of theirs still standing, wherever it is)
    const them = foe.bodies
        .filter((one) => live(one) && formationOf(one))
        .sort((p, q) => apart(formationOf(p).anchor, formation.anchor) - apart(formationOf(q).anchor, formation.anchor))[0];

    if (them) {
        body.state = LINE.includes(body.part) ? "closing" : body.state;
        Object.assign(formation, { to: placeAt(formationOf(them), [0, -FIELD.charge.gap]), speed: FIELD.charge.speed, charge: true, advance: true });
    }
}

// One of a line standing idle, its commander standing (`idle`), the enemy massing elsewhere:
// wheeling on the flank of the nearest body of the enemy's line (a way that wheels), or up beside
// the nearest of its own line that's fighting. Whether it does
function idleTurn(body, side, foe, { now, ctx, formationOf, line, live, tactic, half }) {
    const formation = formationOf(body);

    if (tactic.flank) {
        const target = line(foe)
            .filter((one) => formationOf(one))
            .sort((p, q) => apart(formationOf(p).anchor, formation.anchor) - apart(formationOf(q).anchor, formation.anchor))[0];

        if (target) {
            const them = formationOf(target);
            const anew = body.state !== "flanking" || body.pair !== target.part;

            body.state = "flanking";
            body.pair = target.part;
            Object.assign(formation, { to: placeAt(them, [(relativeTo(them, formation.anchor)[0] >= 0 ? 1 : -1) * (half(target) + 3), 1]), speed: FIELD.charge.speed, charge: true, advance: true });

            if (anew) {
                ctx.event("flank", { side: side.key, part: body.part, at: target.part, to: [...formation.to] });
            }

            return true;
        }

        return false;
    }

    const beside = line(side)
        .filter((one) => one !== body && live(one) && formationOf(one) && now - formationOf(one).engagedAt < 1500)
        .sort((p, q) => apart(formationOf(p).anchor, formation.anchor) - apart(formationOf(q).anchor, formation.anchor))[0];

    if (beside) {
        const them = formationOf(beside);
        const anew = body.state !== "reinforcing";

        body.state = "reinforcing";
        Object.assign(formation, { to: placeAt(them, [(relativeTo(them, formation.anchor)[0] >= 0 ? 1 : -1) * (half(beside) + BODIES.gap + half(body)), 0]), facing: them.facing, speed: FIELD.charge.speed, charge: true, advance: true });

        if (anew) {
            ctx.event("reinforce", { side: side.key, part: body.part, beside: beside.part, to: [...formation.to] });
        }

        return true;
    }

    return false;
}

// The breaks in a side's line (FIELD breach): each body of its line broken and run or gone, where
// it stood; and each hole torn between two of its line's bodies standing side by side, the open
// ground between their fronts FIELD breach `hole` wider than it was formed (BODIES gap). Each
// { key (the body's part, or the two's: "left|centre"), kind ("broken" or "hole"), at ([x, y]: its
// middle) }
export function breachesOf(side, { members, formationOf }) {
    const live = (body) => body.alive > 0 && body.state !== "broken" && body.state !== "gone";
    const breaches = [];

    for (const body of side.bodies) {
        if (LINE.includes(body.part) && !live(body) && body.brokeAt) {
            breaches.push({ key: body.part, kind: "broken", at: [...body.brokeAt] });
        }
    }

    const standing = LINE.map((part) => side.bodies.find((body) => body.part === part)).filter((body) => body && live(body) && formationOf(body));

    for (let k = 1; k < standing.length; k++) {
        const [a, b] = [standing[k - 1], standing[k]];

        // (Side by side: not the wings with the centre gone between them, a break of its own)
        if (LINE.indexOf(b.part) - LINE.indexOf(a.part) !== 1) {
            continue;
        }

        // (Each one's front's end nearer the other)
        const [ea, eb] = [
            [a, b],
            [b, a],
        ].map(([one, other]) => {
            const formation = formationOf(one);
            const own = (members.get(one) ?? []).filter(({ formation: { id } }) => id === one.formation);
            const half = Math.max(FORMATION.apart / 2, ...own.map(({ formation: { slot } }) => Math.abs(slot[0]) + FORMATION.apart / 2));

            return placeAt(formation, [(relativeTo(formation, formationOf(other).anchor)[0] >= 0 ? 1 : -1) * half, 0]);
        });

        if (apart(ea, eb) >= BODIES.gap + FIELD.breach.hole) {
            breaches.push({ key: `${a.part}|${b.part}`, kind: "hole", at: [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2] });
        }
    }

    return breaches;
}

// A side going through a break in the enemy's line (FIELD breach), each break once, the first it's
// near (its line's nearest body within FIELD breach `near`), as its way of fighting goes (TACTICS
// `breach`): the two-handers and rear ranks of that body ("pour"); or its reserve, then its
// household (`sent`, its next to send, if it's time: "commit")
function breakThrough(side, foe, { battle, now, ctx, members, formationOf, line, live, sent }) {
    const way = TACTICS[side.tactic]?.breach ?? null;

    if (!way) {
        return;
    }

    side.breached ??= {};

    for (const breach of breachesOf(foe, { members, formationOf })) {
        if (side.breached[breach.key] !== undefined) {
            continue;
        }

        const nearest = line(side)
            .filter((body) => formationOf(body) && body.state !== "faltering")
            .sort((p, q) => apart(formationOf(p).anchor, breach.at) - apart(formationOf(q).anchor, breach.at))[0];

        if (!nearest || apart(formationOf(nearest).anchor, breach.at) > FIELD.breach.near) {
            continue;
        }

        const going = way === "pour" ? pour(nearest, breach, { battle, ctx, members, formationOf }) : sent && live(sent) && formationOf(sent) ? commitThrough(sent, side, breach, { members, formationOf, now }) : null;

        if (going) {
            side.breached[breach.key] = now;
            going.body.through = { stage: "through", at: breach.key, since: now, formation: going.formation };
            ctx.event("breach", { side: side.key, part: going.body.part, by: way, gap: breach.key, kind: breach.kind, at: [...breach.at], to: [...battle.formations[going.formation].to], commander: going.body.part === "vanguard" ? side.commander : null });
        }

        return;
    }
}

// Where those sent through a break go first: out FIELD breach `beyond` past it, the way from `from`
const beyond = (from, at) => placeAt({ anchor: at, facing: towards(from, at) }, [0, -FIELD.breach.beyond]);

// A bold band's body's two-handers and rear ranks (not its chief) poured through a break, three
// abreast, in a formation of their own (`throughOf`); none, with fewer than two of them, or some
// of it through already. { body, formation }, or null
function pour(body, breach, { battle, ctx, members, formationOf }) {
    const formation = formationOf(body);
    const sent = (body.through ? [] : (members.get(body) ?? [])).filter((actor) => {
        const { id, role, slot } = actor.formation;
        const record = ctx.record(actor.id);

        return id === body.formation && (role === "heavy" || (role === "front" && slot[1] > 0)) && !record?.chief && !record?.commander;
    });

    if (sent.length < 2) {
        return null;
    }

    battle.formation(throughOf(body), { anchor: [...formation.anchor], facing: towards(formation.anchor, breach.at), to: beyond(formation.anchor, breach.at), speed: FIELD.breach.speed, charge: true, advance: false, seek: SHOOTERS });
    sent.forEach((actor, k) => {
        actor.formation.id = throughOf(body);
        actor.formation.slot = [((k % 3) - 1) * FORMATION.apart, Math.floor(k / 3) * FORMATION.rank];
        Object.assign(actor, { leash: FIELD.breach.leash, sight: FIELD.breach.sight });
    });

    return { body, formation: throughOf(body) };
}

// A steady line's reserve or household (`sent`) through a break, as a body. { body, formation }
function commitThrough(sent, side, breach, { members, formationOf, now }) {
    const formation = formationOf(sent);

    sent.state = "committed";
    side.committedAt = now;
    Object.assign(formation, { to: beyond(formation.anchor, breach.at), speed: FIELD.breach.speed, charge: true, advance: false, seek: SHOOTERS });

    for (const actor of members.get(sent) ?? []) {
        if (actor.formation.id === sent.formation && !SHOOTERS.includes(actor.formation.role)) {
            Object.assign(actor, { leash: FIELD.breach.leash, sight: FIELD.breach.sight });
        }
    }

    return { body: sent, formation: sent.formation };
}

// Those a body sent through a break, on their way (FIELD breach): through it, then at the archers,
// casters and healers of the enemy's within `reach` (the nearest, wherever they give ground to),
// then, with none there (or after `ms`), round on the back of the nearest body of the enemy's line,
// at whoever's nearest. Gone, they're done
function goThrough(body, side, foe, { battle, now, ctx, members, formationOf, line }) {
    const { through } = body;
    const formation = battle.formations[through.formation];
    const going = (members.get(body) ?? []).filter(({ formation: { id } }) => id === through.formation);

    if (!formation || !going.length) {
        if (through.formation === throughOf(body) && formation) {
            battle.formation(through.formation, null);
        }

        body.through = null;

        return;
    }

    if (through.stage === "through" && !formation.to) {
        through.stage = "archers";
    }

    if (through.stage !== "archers") {
        return;
    }

    const shooters = foe.bodies.flatMap((one) => members.get(one) ?? []).filter((actor) => SHOOTERS.includes(actor.formation.role) && apart([actor.x, actor.y], formation.anchor) <= FIELD.breach.reach);
    const nearest = shooters.sort((p, q) => apart([p.x, p.y], formation.anchor) - apart([q.x, q.y], formation.anchor))[0];

    if (nearest && now - through.since < FIELD.breach.ms) {
        Object.assign(formation, { to: [nearest.x, nearest.y], speed: FIELD.breach.speed, charge: true });

        return;
    }

    // (Round on the back of the nearest of their line, whoever's nearest)
    const them = line(foe)
        .filter((one) => formationOf(one))
        .sort((p, q) => apart(formationOf(p).anchor, formation.anchor) - apart(formationOf(q).anchor, formation.anchor))[0];

    through.stage = "rear";
    Object.assign(formation, { seek: null, advance: true });

    if (them) {
        const rear = Math.max(FORMATION.rank, ...(members.get(them) ?? []).filter(({ formation: { id } }) => id === them.formation).map(({ formation: { slot } }) => slot[1]));

        Object.assign(formation, { to: placeAt(formationOf(them), [0, rear + FIELD.breach.rear]), charge: true });
        ctx.event("rear", { side: side.key, part: body.part, on: them.part, to: [...formation.to] });
    }
}

// A side's archers, casters and healers with an enemy who fights up close among them (`close`,
// within FIELD archers `near`): giving ground, back behind the nearest body of their own that isn't
// beset (its reserve or household, held, first; else its own), FIELD archers `back` behind its
// rearmost rank (a `post`, their `refuge` that body's formation), shooting from there; back in
// their places once no such enemy's within `clear` of them. Told once a body's first give ground
// ("fallBack")
function fallBack(side, close, { ctx, members, formationOf }) {
    const live = (body) => body.alive > 0 && body.state !== "broken" && body.state !== "gone";
    const near = (point, within) => close.some((them) => apart([them.x, them.y], point) <= within);
    const bodies = side.bodies.filter((body) => live(body) && formationOf(body));

    for (const body of bodies) {
        const formation = formationOf(body);
        const shooters = (members.get(body) ?? []).filter(({ formation: { id, role } }) => id === body.formation && SHOOTERS.includes(role));
        let gave = false;

        for (const actor of shooters) {
            const beset = among(formation, close, [actor.x, actor.y]);

            if (!beset && !actor.formation.refuge) {
                continue;
            }

            if (!beset && !near(placeAt(formation, actor.formation.slot), FIELD.archers.clear) && !near([actor.x, actor.y], FIELD.archers.clear)) {
                delete actor.formation.refuge;
                delete actor.formation.post;
                continue;
            }

            // (Behind the nearest of its own not beset, an enemy at it: a held reserve or household
            // first; else its own)
            const refuge =
                bodies.find((one) => one.formation === actor.formation.refuge && one !== body && !near(formationOf(one).anchor, FIELD.archers.near)) ??
                bodies
                    .filter((one) => one !== body && !near(formationOf(one).anchor, FIELD.archers.near))
                    .sort((p, q) => Number(q.state === "held") - Number(p.state === "held") || apart(formationOf(p).anchor, [actor.x, actor.y]) - apart(formationOf(q).anchor, [actor.x, actor.y]))[0] ??
                body;
            const own = (members.get(refuge) ?? []).filter(({ formation: { id } }) => id === refuge.formation);
            const half = Math.max(FORMATION.apart, ...own.map(({ formation: { slot } }) => Math.abs(slot[0])));
            const rear = Math.max(0, ...own.map(({ formation: { slot } }) => slot[1]));

            actor.formation.refuge = refuge.formation;
            actor.formation.post = placeAt(formationOf(refuge), [Math.max(-half, Math.min(half, actor.formation.slot[0])), rear + FIELD.archers.back]);
            gave = true;
        }

        if (gave && !body.fellBack && ctx.now - (body.fellBackAt ?? -Infinity) >= FIELD.archers.told) {
            body.fellBackAt = ctx.now;
            ctx.event("fallBack", { side: side.key, part: body.part, at: [...formation.anchor] });
        }

        body.fellBack = gave;
    }
}
