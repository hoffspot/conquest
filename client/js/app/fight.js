// Whether the player's in a fight, for its music (audio/battle.js, sound.js setBattle): something
// hostile to them after them or striking them, or them striking at something hostile to them.
// Done a while after the last moment of it (FIGHT_LINGERS), so a lull between blows doesn't end
// it; and then what was heard fades back over BATTLE_OUT, about four seconds after the fight's
// last moment in all.

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
