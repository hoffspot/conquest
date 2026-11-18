// Blinkers (generated/multiplayer_scaling_plan.md 3-9): a battle as a game would know it were it
// told only of what's near its own hero, as a replicated world's will be (the plan's Stage 3):
// everyone on another map, or further off than BLINKERS.radius, isn't there to ask after. For
// the tests: a lockstep game given its battle through these must do all it does without anyone
// it can't see, so every handler that took an actor for granted is found before a server stops
// sending them. Nothing in the world changes: the battle behind is whole, and steps as ever.

/**
 * How far off the hero others are still known (metres, as the crow flies, on the hero's own map):
 * past what's drawn (app/game.js DRAW_REACH, 160) by a cell of the interest grid (32 m).
 */
export const BLINKERS = Object.freeze({ radius: 192 });

/**
 * A battle seen through blinkers: `actors` are only the hero (`me`: () => their id) and those on
 * their map within `radius` of them, `actor(id)` is null for anyone else; all the rest is the
 * battle's own, asked of it. With no hero in it (not come in yet), no one's hidden.
 */
export function blinkered(battle, me, { radius = BLINKERS.radius } = {}) {
    const bound = new Map();
    let seenAt = null;
    let seen = null;

    const seeing = (actor, hero) => actor === hero || (actor.map === hero.map && Math.hypot(actor.x - hero.x, actor.y - hero.y) <= radius);
    const hero = () => battle.actor(me());

    return new Proxy(battle, {
        get(target, name) {
            if (name === "actors") {
                const mine = hero();

                if (!mine) {
                    return target.actors;
                }

                // (Asked many times a step: looked over once for each, and whenever anyone's come or gone)
                const key = `${target.time} ${target.actors.length} ${mine.map} ${mine.x} ${mine.y}`;

                if (seenAt !== key) {
                    seenAt = key;
                    seen = target.actors.filter((actor) => seeing(actor, mine));
                }

                return seen;
            }

            if (name === "actor") {
                return (id) => {
                    const actor = target.actor(id);
                    const mine = hero();

                    return actor && mine && !seeing(actor, mine) ? null : actor;
                };
            }

            if (name === "blinkers") {
                return radius;
            }

            const value = target[name];

            // (Its own, asked of it: its methods reach what's private to it)
            if (typeof value === "function") {
                if (!bound.has(name)) {
                    bound.set(name, value.bind(target));
                }

                return bound.get(name);
            }

            return value;
        },
        set(target, name, value) {
            target[name] = value;

            return true;
        },
    });
}
