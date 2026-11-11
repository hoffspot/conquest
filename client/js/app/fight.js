// Whether the player's in a fight, for its music (audio/battle.js, sound.js setBattle): something
// hostile to them after them or striking them, or them striking at something hostile to them.
// Done a while after the last moment of it (FIGHT_LINGERS), so a lull between blows doesn't end
// it; and then the fight's music fades out and what was heard back over BATTLE_OUT, back about
// eight seconds after the fight's last moment in all.

/** How long after the last moment of a fight it's still one (ms). */
export const FIGHT_LINGERS = 2500;

// How lately the player's swung at whoever they're set on for that to be fighting (ms)
const SWUNG = 2500;

/**
 * Whether `me` (the player's actor) is in a fight among `actors` now: anything alive on their map
 * and hostile to them (`hostile(a, b)`: battle.js) set on them or swinging at them; or them
 * swinging at one, or set on one and having swung `sinceSwing` ms ago (less than SWUNG). Never
 * once they're dead.
 */
export function inFight(me, actors, hostile, sinceSwing = Infinity) {
    if (!me || me.dead) {
        return false;
    }

    const theirs = me.attack?.target ?? (sinceSwing < SWUNG ? me.target : null);

    for (const other of actors) {
        if (other === me || other.dead || other.map !== me.map) {
            continue;
        }

        if ((other.target === me.id || other.attack?.target === me.id) && hostile(other, me)) {
            return true;
        }

        if (theirs !== null && theirs !== undefined && other.id === theirs && hostile(me, other)) {
            return true;
        }
    }

    return false;
}

/**
 * How often whether an enemy's close by someone (so they stand on guard) is worked out again, in
 * the battle's time (ms): everyone was asked of everyone every frame, which in an invasion on a
 * phone took 0.5 to 1.2 ms of each (and 3.6 to 5.7 ms with 360 about), though the answer can only
 * change as the battle steps. A guard taken up to a quarter second late: it eases in anyway.
 */
export const GUARD_EVERY = 250;

// (Each one's first answer is due a different fifth of that later, so they aren't all worked out
// again in the same frame from then on)
const GUARD_SPREAD = 5;

/**
 * Whether anyone alive among `actors`, on `actor`'s map and within `reach` metres of them, is
 * their enemy and seen by them (`hostile(a, b)` and `canSee(a, b)`: battle.js). The map and how
 * far off first (squared, no root), their peoples' standing and what's in the way only for one near.
 */
export function foeNear(actor, actors, reach, hostile, canSee) {
    const { x, y, map } = actor;
    const within = reach * reach;

    for (let k = 0; k < actors.length; k++) {
        const other = actors[k];

        if (other.dead || other.map !== map) {
            continue;
        }

        const dx = other.x - x;
        const dy = other.y - y;

        if (dx * dx + dy * dy <= within && hostile(other, actor) && canSee(actor, other)) {
            return true;
        }
    }

    return false;
}

/**
 * Whether someone's answer kept (`kept`: { on, due }, their own, begun as {}; `on` the answer, the
 * caller's to set) is to be worked out again at the battle's `time` (ms): GUARD_EVERY after the
 * last time (the first a share of that later, by `turn`, a count of those begun so far), or when
 * the battle's time has gone back (a world sent again). When it is, when it's next due is kept.
 */
export function guardDue(kept, time, turn = 0) {
    if (time < kept.due && time >= kept.due - GUARD_EVERY * 2) {
        return false;
    }

    kept.due = time + (kept.due === undefined ? (GUARD_EVERY * ((turn % GUARD_SPREAD) + 1)) / GUARD_SPREAD : GUARD_EVERY);

    return true;
}
