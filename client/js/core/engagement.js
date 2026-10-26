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
 * Each way of fighting: whether its archers go out ahead of the line before it closes (`volley`);
 * whether it sends a few to try the enemy's weakest body (`probe`); whether its bodies wheel in on
 * a flank once what's before them is gone (`flank`), and its wings' two-handers swing wide round
 * the end of the enemy's line (`flankers`); how deep its reserve (`reserve`, times BODIES'); and its
 * own: `wedge`, its centre charging first in a wedge at the enemy's centre, its wings after
 * (FIELD `wedge`); `envelop`, its wings swinging wide round both the enemy's flanks as they charge;
 * `stand`, its line standing where it is and letting them come; `raid`, its wings hitting the ends
 * of the enemy's line, falling back and coming again (FIELD `raid`).
 */
export const TACTICS = Object.freeze({
    line: Object.freeze({ volley: true, probe: true, flank: true, flankers: true, reserve: 1 }),
    steady: Object.freeze({ volley: true, probe: true, flank: true, flankers: true, reserve: 1.6 }),
    wedge: Object.freeze({ volley: true, probe: false, flank: true, flankers: false, reserve: 0.6, wedge: true }),
    swarm: Object.freeze({ volley: false, probe: false, flank: true, flankers: false, reserve: 0, envelop: true }),
    standoff: Object.freeze({ volley: false, probe: false, flank: false, flankers: false, reserve: 1, stand: true }),
    skirmish: Object.freeze({ volley: true, probe: true, flank: true, flankers: false, reserve: 0.6, raid: true }),
});

/** Each band's way of fighting (TACTICS); a town's and an army's, a line's. */
export const BAND_TACTICS = Object.freeze({ bandits: "swarm", northmen: "wedge", cult: "standoff", sellswords: "steady", corsairs: "skirmish" });

/** A band's (BANDS key), or anyone else's, way of fighting (TACTICS key). */
export const tacticsOf = (band) => BAND_TACTICS[band] ?? "line";

/**
 * How a fight goes (ms and metres): its state looked at every `every`; the lines halting `at`
 * apart, the archers out `ahead` of them, for `ms` (`volley`) before they charge (`charge`: at a
 * run, `speed`, on till they're `gap` apart, those who fight up close going after an enemy as far
 * as `leash` from their place and looking as far as `sight`); `probe`: `size` of a wing's shield
 * line and two-handers sent at the enemy's weakest body, back after `ms` or once half of them
 * have fallen; `flank`: a body's two-handers sent round the end of the enemy's line `after` it's
 * been fighting a while, going `wide` of it, then in on it from `rear` behind; a body beset on its
 * flank by a body of the enemy's fighting within `near` of its end, not facing it head on; the
 * northmen's `wedge`, its wings charging `lead` after its centre; the corsairs' `raid`, hitting for
 * `hit`, falling back `back`, resting `rest`; a reserve or vanguard sent in at `commit` speed, the
 * next of them no sooner than `wait` after.
 */
export const FIELD = Object.freeze({
    every: 500,
    volley: Object.freeze({ at: 32, ahead: 17, ms: 6000 }),
    charge: Object.freeze({ speed: 2.2, gap: 2, leash: 30, sight: 30 }),
    probe: Object.freeze({ size: 5, ms: 7000 }),
    flank: Object.freeze({ after: 4000, wide: 10, rear: 6, near: 8 }),
    wedge: Object.freeze({ lead: 3000 }),
    raid: Object.freeze({ hit: 6000, back: 12, rest: 4000 }),
    commit: Object.freeze({ speed: 2.4, wait: 10000 }),
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

// The formations a body's soldiers can be in: its own, its probe's and its two-handers' sent wide
const probeOf = (body) => `${body.formation}:probe`;
const flankOf = (body) => `${body.formation}:flank`;

/**
 * An engagement stepped, every FIELD `every` of the battle's time (host.js #fight). `ctx`:
 * { battle, now (ms), hold (whether its bodies hold whatever: none breaking, MORALE `hold`),
 * record(id) (the host's record of a soldier: its `role`, `chief`, `commander`, `power`),
 * event(change, data) (told what happens: "volley", "probe", "charge", "flank", "flankers",
 * "commit", "waver", "break", "falter", "rally", "commanderFell", "bannerFell"), afflict(id, kind,
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

    const membersOf = (body) => [...(byFormation.get(body.formation) ?? []), ...(byFormation.get(probeOf(body)) ?? []), ...(byFormation.get(flankOf(body)) ?? [])];
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
                body.state = "gone";
                battle.formation(body.formation, null);
            }
        }
    }

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

            ctx.event("commanderFell", { side: side.key, id: side.commander, name: commander?.name ?? "" });
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

            ctx.event("bannerFell", { side: side.key, id: side.banner });
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

            // (Beset on its flank or from behind: a body of the enemy's fighting near its end, its
            // own way not head on at it, as a body wheeled in on its flank or two-handers round
            // behind it come; how far its way's turned from the way back at this one's, 0 behind it)
            body.flanked = foe.bodies.some((theirs) =>
                [theirs.formation, probeOf(theirs), flankOf(theirs)].some((id) => {
                    const them = battle.formations[id];
                    const turned = them ? Math.abs((((them.facing - formation.facing) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) : 0;

                    return Boolean(them) && !them.broken && now - them.engagedAt < 1500 && apart(them.anchor, formation.anchor) <= half + FIELD.flank.near && turned < (Math.PI * 3) / 4;
                }),
            );
            body.morale = moraleAfter(body.morale, { seconds, fallen: body.fallen / Math.max(1, body.size), fresh: body.fresh / Math.max(1, body.size), odds: before ? here.length / Math.max(1, before.alive) : 1, flanked: body.flanked, aura, winning: Boolean(pair && pair.fallen > body.fallen) });

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
            const volleying = engagement.sides.filter((side) => side.tactics && TACTICS[side.tactic]?.volley);

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

    // At it: each body as its side's tactics have it, breaking, faltering, wheeling, sent in
    if (engagement.phase === "melee") {
        engagement.sides.forEach((side, k) => melee(side, engagement.sides[1 - k], { battle, now, ctx, members, formationOf, line }));
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
// who fights up close going after an enemy as far as the charge's `leash`
function charge(engagement, ctx, { members, formationOf, line }) {
    const { now } = ctx;

    engagement.phase = "melee";
    engagement.at = now;

    engagement.sides.forEach((side, k) => {
        const foe = engagement.sides[1 - k];
        const tactic = side.tactics ? TACTICS[side.tactic] : TACTICS.line;

        for (const body of side.bodies) {
            for (const actor of members.get(body) ?? []) {
                delete actor.formation.post;

                const record = ctx.record(actor.id);

                if (record?.role === "front" || record?.role === "heavy" || record?.chief || record?.commander) {
                    actor.leash = Math.max(actor.leash ?? 0, FIELD.charge.leash);
                    actor.sight = FIELD.charge.sight;
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
function melee(side, foe, { battle, now, ctx, members, formationOf, line }) {
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
                ctx.event("falter", { side: side.key, part: body.part });
            } else {
                body.state = "broken";
                battle.formation(body.formation, { broken: true, to: side.exit ? [...side.exit] : placeAt(formation, [0, 60]), speed: side.run, advance: false, charge: false });

                for (const sent of [probeOf(body), flankOf(body)]) {
                    if (battle.formations[sent]) {
                        battle.formation(sent, { broken: true, to: side.exit ? [...side.exit] : placeAt(formation, [0, 60]), speed: side.run, advance: false, charge: false });
                    }
                }

                // (The body that beat it, heartened)
                for (const theirs of foe.bodies.filter((one) => one.pair === body.part && live(one))) {
                    theirs.morale = Math.min(MORALE.vanguard, theirs.morale + MORALE.gap);
                }

                ctx.event("break", { side: side.key, part: body.part });
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
                ctx.event("rally", { side: side.key, part: body.part });
            }

            continue;
        }

        if (body.morale < MORALE.waver && !body.wavered) {
            body.wavered = true;
            ctx.event("waver", { side: side.key, part: body.part });
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

    // Its reserve, then its vanguard, sent in: where one of its line is giving way, or through a
    // gap where one of the enemy's has broken (none of it, its commander fallen)
    if (!tactic) {
        return;
    }

    const held = side.bodies.filter((body) => (body.part === "reserve" || body.part === "vanguard") && body.state === "held" && live(body));
    const giving = line(side).filter((body) => body.morale < MORALE.waver && body.state !== "faltering" && formationOf(body) && now - formationOf(body).engagedAt < 1500);
    const gap = foe.bodies.find((body) => LINE.includes(body.part) && (body.state === "broken" || body.state === "gone") && !body.exploited);
    const sent = held.find(({ part }) => part === "reserve") ?? held.find(({ part }) => part === "vanguard");

    if (sent && (giving.length || gap) && now - (side.committedAt ?? -Infinity) >= FIELD.commit.wait) {
        const formation = formationOf(sent);
        const target = giving.length ? formationOf(giving.sort((p, q) => p.morale - q.morale)[0]) : null;
        const centre = foe.bodies.find((one) => one.part === "centre" && live(one));
        const them = !target && gap && centre ? formationOf(centre) : null;

        if (formation && (target || them)) {
            const to = target ? placeAt(target, [0, -2]) : placeAt(them, [(relativeTo(them, formation.anchor)[0] >= 0 ? 1 : -1) * FORMATION.apart * 8, 1]);

            if (gap && !target) {
                gap.exploited = true;
            }

            sent.state = "committed";
            side.committedAt = now;
            Object.assign(formation, { to, speed: FIELD.commit.speed, charge: true, advance: true });
            ctx.event("commit", { side: side.key, part: sent.part, to, at: target ? giving[0].part : "gap", commander: sent.part === "vanguard" ? side.commander : null });
        }
    }
}
