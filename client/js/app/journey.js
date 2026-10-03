// Running somewhere far, set off from the world map (a double tap on it: the terrain plan's M7g,
// §9 Pins on the world map, "the same as setting a destination for the player and the player
// initiating a run to that destination"). The way across the world (core/journey.js wayAcross)
// is taken a leg at a time: each leg an order to run (the battle's: walking on once they're out of
// breath) to a point on the way up to LEGS.reach ahead, over the navigation mesh, which the
// battle finds its own way over round what's in the way; the next sent as they near the end of
// one, so they keep going. If they stop getting nearer, the way's found again from where they are;
// if that doesn't get them on either, they stop, and they're told. Anything else the player does
// ends it.

import { lengthOf, nearestAlong, pointAlong, wayAcross } from "../core/journey.js";

/**
 * How it's run: how far ahead each leg goes (metres), how near its end the next is sent (metres),
 * how far off the way they can stray before it's found again from where they are (metres), how
 * long without getting a couple of metres nearer before it's found again (seconds), how many
 * times, how near the end is arriving (metres), and how soon after one order another may be sent
 * (seconds: one that wasn't taken isn't sent again every frame; joined, the host has to hear it).
 */
export const LEGS = Object.freeze({ reach: 72, next: 10, astray: 48, stuck: 5, tries: 2, arrived: 3, again: 0.8 });

export class Journey {
    /**
     * @param {object} plan - The world plan the way's across.
     * @param {Array} way - The way there (wayAcross's points, [x, y] metres).
     */
    constructor(plan, way) {
        this.plan = plan;
        this.way = way;
        this.to = [...way.at(-1)];
        this.leg = null;
        this.best = Infinity;
        this.since = 0;
        this.tries = 0;
        this.sentAt = -Infinity;

        /** Why it's over (null while it's not): "arrived", "blocked", "left" (they went indoors, or fell). */
        this.ended = null;
    }

    /**
     * On, `time` seconds into the game, with the player as the battle has them (`player`: its
     * actor): the order to send them now ({ type: "move", to, run }), or null.
     */
    step(player, time) {
        if (this.ended) {
            return null;
        }

        if (!player || player.dead || player.map !== "town") {
            this.ended = "left";

            return null;
        }

        const [x, y] = [player.x, player.y];

        if (Math.hypot(this.to[0] - x, this.to[1] - y) <= LEGS.arrived) {
            this.ended = "arrived";

            return null;
        }

        let near = nearestAlong(this.way, [x, y]);
        const left = lengthOf(this.way) - near.along;

        // (Getting no nearer: the way found again from here, a few times)
        if (left < this.best - 2) {
            this.best = left;
            this.since = time;
        } else if (time - this.since > LEGS.stuck || near.off > LEGS.astray) {
            const again = this.tries < LEGS.tries ? wayAcross(this.plan, [x, y], this.to) : null;

            this.tries++;

            if (!again) {
                this.ended = "blocked";

                return null;
            }

            this.way = again;
            this.best = Infinity;
            this.since = time;
            this.leg = null;
            near = nearestAlong(this.way, [x, y]);
        }

        // (The next leg: at the start, once one's done with, or as they near its end)
        const going = player.order?.type === "move";
        const nearEnd = this.leg && Math.hypot(this.leg[0] - x, this.leg[1] - y) <= LEGS.next && !this.#last(this.leg);

        if ((this.leg && going && !nearEnd) || time - this.sentAt < LEGS.again) {
            return null;
        }

        const [tx, ty] = pointAlong(this.way, near.along + LEGS.reach);

        this.leg = [tx, ty];
        this.sentAt = time;

        return { type: "move", to: [Math.floor(tx), Math.floor(ty)], run: true };
    }

    // Whether a leg ends where the way does
    #last([x, y]) {
        return Math.hypot(this.to[0] - x, this.to[1] - y) < 0.5;
    }
}
