// Who comes first, when not everyone can be had as they'd best be: held in full (app/game.js
// #marshal, #rationing, #folkRoom: a phone's memory holds only so many bodies), drawn in full
// (#thronging: a crowded fight that comes too slowly), or their bar shown over their head where
// bars overlap (the frame's plates: app/hud.js Covering). One order for them all: the "full-tier
// order" of the scaling plan's Stage 5 (generated/multiplayer_scaling_plan.md: "the party, the
// target, attackers, whoever is fighting the party, whoever the player is trading or talking
// with, then the biggest on screen"),
// as the games that draw crowds of players have it (generated/crowd_rendering_plan.md):
//
//   the player themself; their party; whoever they're set on; whoever's attacking them; whoever's
//   fighting their party; whoever they're trading or talking with; then the biggest on the screen
//   (the nearer first, of two as big); and those on another map after everyone on the player's.
//
// Whoever's fighting the party comes after the player's own attackers and before whoever they're
// talking with: the plan's first wording left them out, and the owner kept them (2026-11-11), so
// an enemy on the party's healer isn't ranked with the bystanders. The plan's slices that let the
// other players into the bodies' budget and the crowds (5-2), choose how many of them are in full
// (5-4) and queue a crowd arriving at once (5-6) are to rank by this, not by an order of their own.
//
// Each place that ranks had its own before: three copies of "fighting the player" (each way
// round, no more), the folk's "kept" for whoever the player talked to, and four sorts, by how far
// from the camera with the fighters a fixed way nearer, or by how tall on the screen. This says
// only who's before whom. How many have room, and what's done with the rest, is each place's own.
// Nothing here knows the game: plain actors and numbers, so it runs under Node (test/
// precedence.test.js).

/**
 * How someone stands with the viewer, the first that's true of them (the lower the sooner):
 * `self`; `party`, one of the players in the viewer's party; `target`, whoever the viewer's set
 * on, or their blow under way is at; `attacker`, whoever's set on the viewer, or whose blow is at
 * them; `partyFoe`, whoever's set on one of the party, or one of the party's set on; `engaged`,
 * whoever the viewer's talking or trading with; `kept`, one the place that ranks has its own
 * reason to put before the rest (Order.rank's `measure` says: #thronging's nearest allies, and
 * one thrown by a blast); `rest`, everyone else.
 */
export const STANDING = Object.freeze({ self: 0, party: 1, target: 2, attacker: 3, partyFoe: 4, engaged: 5, kept: 6, rest: 7 });

/**
 * A viewer, as the order needs them: whose eyes it's for (`id`), the map they're on (`map`), who
 * they're set on (`target`: the battle's; `locked`: the one they've chosen to fight, whose bar is
 * lit) and who their blow under way is at (`striking`), ids or null; the
 * other players in their party (`party`), whoever those are set on or striking (`partyFoes`) and
 * whoever the viewer's talking or trading with (`engaged`), Sets of ids. Made once, and filled
 * again each time it's wanted (app/game.js #viewer): nothing's made anew to rank by it.
 */
export function viewerOf() {
    return { id: null, map: null, target: null, locked: null, striking: null, party: new Set(), partyFoes: new Set(), engaged: new Set() };
}

/**
 * How an actor ({ id, target, attack: { target } }: core/battle.js's) stands with a viewer
 * (viewerOf's): one of STANDING, never `kept` (that's for whoever ranks to say).
 */
export function standingOf(viewer, actor) {
    const { id } = actor;

    if (id === viewer.id) {
        return STANDING.self;
    }

    if (viewer.party.has(id)) {
        return STANDING.party;
    }

    if (viewer.target === id || viewer.locked === id || viewer.striking === id) {
        return STANDING.target;
    }

    const on = actor.target ?? null;
    const at = actor.attack?.target ?? null;

    if (on === viewer.id || at === viewer.id) {
        return STANDING.attacker;
    }

    if (viewer.partyFoes.has(id) || (on !== null && viewer.party.has(on)) || (at !== null && viewer.party.has(at))) {
        return STANDING.partyFoe;
    }

    return viewer.engaged.has(id) ? STANDING.engaged : STANDING.rest;
}

/**
 * Which of two ranked (Order.rank's entries) comes first, as a sort takes it: those on the
 * viewer's map before those on another; then as they stand with the viewer; then the taller on
 * the screen; then the nearer. Two alike in all of those stay as they were given (a sort keeps
 * them so).
 */
export function inOrder(a, b) {
    if (a.elsewhere !== b.elsewhere) {
        return a.elsewhere ? 1 : -1;
    }

    if (a.standing !== b.standing) {
        return a.standing - b.standing;
    }

    if (a.tall !== b.tall) {
        return a.tall > b.tall ? -1 : 1;
    }

    return a.away === b.away ? 0 : a.away < b.away ? -1 : 1;
}

/** Whether one ranked comes before everyone who merely stands about: someone to the viewer, or kept. */
export const first = (entry) => entry.standing < STANDING.rest;

/**
 * Who of those sharing one room has a place in it now: the bodies' budget, shared by the soldiers
 * about, the wild's people-shaped creatures and the folk out in the world (app/game.js #seats),
 * each of them rationed by a look of its own, at its own time. Each look asks this of everyone,
 * in the one order, and acts only on its own, so who's given a place doesn't go by who looked
 * first: each had the room the others had left, and neither gave way once it held a place, so a
 * soldier 14 metres from the camera stayed in its crowd for good while a townsperson further off
 * was held in full.
 *
 * `ranked` is everyone who'd have a place, first to last (Order.rank's entries, or anything
 * else); `room`, how many places there are; `held(entry)`, whether one has a place already or is
 * being given one; `pinned(entry)`, whether one has a place whatever the room (its kind's own
 * floor: a battle's few soldiers), counted in the room all the same; `margin`, how many places
 * further one held must be than one who isn't, to give its place up to it.
 *
 * Those pinned are in. Of the rest, those held keep their places, the nearest of them as many as
 * there's room for; whatever room's left goes to the first of those not held; and with none left,
 * one not held who'd be in by the order alone has the place of the last one held, if that one's
 * more than `margin` places after it: only once that one's let go, though (`next`, not `now`), so
 * there are never more held than the room. Two near each other in the order, changing places as
 * they walk, change nothing: to be let go for one it was preferred to, a body must fall more than
 * twice the margin behind it.
 *
 * Returns { now, next }, Sets of `ranked`'s own: `now`, those with a place (to be kept, or given
 * one at once); `next`, those given one as soon as someone further's let go. Anyone held in
 * neither is to be let go.
 */
export function seated(ranked, room, { held, pinned = () => false, margin = 0 }) {
    const now = new Set();
    const next = new Set();
    // (Those held and those to come, of those not pinned, each with its place among them)
    const keep = [];
    const come = [];
    let place = 0;

    for (const entry of ranked) {
        if (pinned(entry)) {
            now.add(entry);
        } else {
            (held(entry) ? keep : come).push({ entry, place: place++ });
        }
    }

    const places = Math.max(0, room - now.size);

    keep.length = Math.min(keep.length, places);

    let free = places - keep.length;

    for (const one of come) {
        // (Not in by the order alone: nor is anyone after it)
        if (one.place >= places) {
            break;
        }

        if (free > 0) {
            now.add(one.entry);
            free--;

            continue;
        }

        if (!keep.length || keep[keep.length - 1].place - one.place <= margin) {
            break;
        }

        keep.pop();
        next.add(one.entry);
    }

    for (const { entry } of keep) {
        now.add(entry);
    }

    return { now, next };
}

/**
 * An order of precedence, worked out again and again with what it made the time before: its
 * entries are kept from one ranking to the next and filled in again, so ranking makes nothing
 * new once it's ranked as many (a couple of times a second for who's held, every frame for the
 * bars over heads).
 */
export class Order {
    // (Every entry it's ever made, the ranked ones first as they were given)
    #made = [];

    /** Those ranked last, first to last: { actor, standing, elsewhere, tall, away, ... }. */
    ranked = [];

    /**
     * Rank `actors` (any iterable of the battle's) for a viewer (viewerOf's). `measure(entry)` is
     * given each one's entry in turn, its `actor`, its `standing` (standingOf) and whether it's on
     * another map than the viewer's (`elsewhere`) already said, to say the rest: how tall it is
     * on the screen (`entry.tall`, pixels) and how far off (`entry.away`, metres), both 0 and
     * Infinity till said; it may put it before the rest for a reason of its own (`entry.standing
     * = STANDING.kept`, where it's `rest`), keep whatever else it likes on it (reset by none but
     * itself), and leaves one out by returning false. Returns `ranked`, first to last: its own
     * array, the same one every time, good till it next ranks.
     */
    rank(viewer, actors, measure = null) {
        const made = this.#made;
        const ranked = this.ranked;
        let count = 0;

        for (const actor of actors) {
            const entry = (made[count] ??= { actor: null, standing: STANDING.rest, elsewhere: false, tall: 0, away: Infinity });

            entry.actor = actor;
            entry.standing = standingOf(viewer, actor);
            entry.elsewhere = entry.standing !== STANDING.self && actor.map !== viewer.map;
            entry.tall = 0;
            entry.away = Infinity;

            if (measure?.(entry) !== false) {
                count++;
            }
        }

        // (Sorted apart from those it's made, which are taken up again in the order they were
        // made in: an entry one's left out of is the next one's)
        ranked.length = count;

        for (let k = 0; k < count; k++) {
            ranked[k] = made[k];
        }

        ranked.sort(inOrder);

        // (And those it made, in the order ranked, the rest after: none lost, none there twice)
        for (let k = 0; k < count; k++) {
            made[k] = ranked[k];
        }

        return ranked;
    }
}
