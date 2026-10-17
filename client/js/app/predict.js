// A joined game's own hero, drawn going where they're sent at once (docs/WAR.md, playing
// together). Their command goes to the host and comes back done (core/netplay.js), a round trip
// and the steps kept in hand later: a fifth of a second or more of standing still after a tap,
// half a second and more over a phone's mobile network. So the hero's drawn where the copy
// (core/battle.js) will have them once it's heard: as far ahead along their way as their orders
// take to come back done (the lead: how long they've taken lately, changing a little at a time).
// Sent somewhere new, they're drawn going there at once: setting off, if they stood; or, already
// going (the stick held, its order sent again and again, or turned), from where the copy will
// have them when it hears, so that they go on at the same pace, never falling back to the copy
// and catching up again. The copy catches up as they arrive. Whenever what's drawn and where
// they'd be drawn part (the host had them go another way, or not at all), the gap closes over
// 150 ms.
//
// Only what's drawn: the copy of the world is never touched (the rules never guess).

import { ACCELERATION, SPRINT } from "../core/battle.js";
import { shareOf } from "../core/afflictions.js";

/**
 * How long the gap takes to close (ms); how far ahead the hero's drawn at most (as many ms of
 * their going); how far they can be drawn off (m) and still be closed up to, rather than shown
 * where they are at once (gone through a door, or by magic); and how far where they'd be drawn
 * may move in a frame (m, and m/s) before it's taken for a jump, not their going. And how the
 * lead follows how long orders take to come back done: `settle` of the way to each one's time,
 * and by `slew` ms a ms at most (so they're drawn going a little faster or slower a while, never
 * lurching).
 */
export const PREDICT = Object.freeze({ blend: 150, most: 600, far: 3, jump: 0.3, fastest: 10, settle: 0.25, slew: 0.1 });

const lengthOf = (x, y) => Math.sqrt(x * x + y * y);

// A point `distance` metres on from [x, y] along a way's corners (as far as it goes)
function along(x, y, corners, distance) {
    let [px, py, left] = [x, y, distance];

    for (const [cx, cy] of corners) {
        const step = lengthOf(cx - px, cy - py);

        if (step >= left) {
            return step > 0 ? [px + ((cx - px) * left) / step, py + ((cy - py) * left) / step] : [px, py];
        }

        [px, py, left] = [cx, cy, left - step];
    }

    return [px, py];
}

export class Prediction {
    constructor() {
        /** The order sent, not yet done here: { to: [x, y], run, at (ms), map } */
        this.pending = null;

        /**
         * How long orders have taken to come back done lately (ms: null till one has); and how
         * far ahead the hero's drawn (ms of their going), following it.
         */
        this.lag = null;
        this.lead = 0;
        this.ahead = false;

        // What was drawn last (where, on which map), and the gap being closed (from when)
        this.drawn = null;
        this.target = null;
        this.map = null;
        this.drawnAt = 0;
        this.gap = [0, 0];
        this.gapAt = 0;
        this.rebase = false;

        // How they're drawn going (m/ms)
        this.going = [0, 0];
    }

    /**
     * The hero's sent to `to` ([x, y] m, on their map) at `now` (ms), running or not; or, `way`
     * given ([x, y], of length 1), sent straight on that way (as far as `to`), from wherever the
     * host has them when it hears: drawn going at once. Returns the order (for `done`).
     */
    ordered(actor, to, run, now, way = null) {
        this.pending = { to, run, at: now, map: actor.map, way, reach: way ? lengthOf(to[0] - actor.x, to[1] - actor.y) : 0 };
        this.ahead = false;
        this.rebase = true;

        return this.pending;
    }

    /** Any other order sent (to fight, to go through a door...): drawn where the copy has them. */
    other() {
        this.pending = null;
        this.ahead = false;
        this.rebase = true;
    }

    /**
     * The `order` (as `ordered` gave it; the latest, unless it's said) has been done here, at
     * `now` (ms): what came of it (Host.command's result). How long it took is heard whichever it
     * was; one sent before the latest has been overtaken by it, still to come.
     */
    done(result, now, order = this.pending) {
        if (!order) {
            return;
        }

        const took = Math.min(PREDICT.most, Math.max(0, now - order.at));

        this.lag = this.lag === null ? took : this.lag + (took - this.lag) * PREDICT.settle;

        if (this.lead === 0) {
            this.lead = this.lag;
        }

        if (order !== this.pending) {
            return;
        }

        this.ahead = result?.ok !== false;
        this.pending = null;
        this.rebase = true;
    }

    // How far the hero goes in `ms` from now (m): at the pace they're going, or setting off at a
    // walk, speeding up to a sprint if they're to run (as core/battle.js has them)
    #gone(actor, run, ms) {
        const seconds = ms / 1000;
        const share = shareOf(actor, "speed");

        if (actor.progress !== null || !run) {
            return (actor.progress !== null ? actor.pace : actor.walkPace) * share * seconds;
        }

        const [from, to] = [actor.walkPace, Math.max(actor.walkPace, actor.speed * SPRINT)];
        const speeding = Math.min(seconds, (to - from) / ACCELERATION);

        return (from * speeding + (ACCELERATION * speeding * speeding) / 2 + to * (seconds - speeding)) * share;
    }

    // Where they'd be drawn, the copy having them at [x, y] at `now`
    #targetOf(actor, x, y, now) {
        if (actor.dead) {
            return [x, y];
        }

        const pending = this.pending;
        const going = actor.progress !== null && actor.path.length > 0;

        // Sent, not yet heard done: straight for where they're going, as fast as they'll go; from
        // where they stand, or, going already, from where the copy will have them when it hears
        // (and no further ahead than ever, the copy still going as it was, should it hear late)
        if (pending && pending.map === actor.map) {
            const since = Math.min(now - pending.at, PREDICT.most);
            const [fx, fy] = going ? along(x, y, actor.path, this.#gone(actor, false, Math.max(0, this.lead - since))) : [x, y];
            const [dx, dy] = pending.way ? [pending.way[0] * pending.reach, pending.way[1] * pending.reach] : [pending.to[0] - fx, pending.to[1] - fy];
            const distance = lengthOf(dx, dy);
            const gone = Math.min(distance, this.#gone(actor, pending.run, going ? Math.min(since, this.lead) : since));

            return distance > 0 ? [fx + (dx * gone) / distance, fy + (dy * gone) / distance] : [fx, fy];
        }

        // Going their way: as far along it as their orders take to come back done
        if (this.ahead && going) {
            return along(x, y, actor.path, this.#gone(actor, false, this.lead));
        }

        return [x, y];
    }

    // How much of the gap's still to close at `now`
    #closing(now) {
        return Math.max(0, 1 - (now - this.gapAt) / PREDICT.blend);
    }

    /** Where to draw the hero at `now` (ms), the copy having them at [x, y] (as it's drawn them). */
    at(actor, x, y, now) {
        // (The lead following how long orders take, a little at a time)
        if (this.lag !== null && this.drawn) {
            const most = PREDICT.slew * Math.max(0, now - this.drawnAt);

            this.lead += Math.max(-most, Math.min(most, this.lag - this.lead));
        }

        // (Arrived, or stopped: no longer ahead)
        if (this.ahead && actor.progress === null && !actor.path.length) {
            this.ahead = false;
            this.rebase = true;
        }

        const target = this.#targetOf(actor, x, y, now);
        const since = now - this.drawnAt;

        if (this.drawn && this.map === actor.map) {
            const jumped = lengthOf(target[0] - this.target[0], target[1] - this.target[1]);

            // (Drawn from somewhere else now: sent somewhere, or heard, closed up to from where
            // they'd have been drawn going on as they were, so that they go on as smoothly (and
            // where the copy's heard sooner or later than it's lately taken, they're drawn coming
            // round to it); the copy jumped, from where they were drawn last. Unless that's far)
            if (this.rebase || jumped > PREDICT.jump + (PREDICT.fastest * since) / 1000) {
                const [vx, vy] = this.rebase ? this.going : [0, 0];
                const [gx, gy] = [this.drawn[0] + vx * since - target[0], this.drawn[1] + vy * since - target[1]];

                this.gap = lengthOf(gx, gy) <= PREDICT.far ? [gx, gy] : [0, 0];
                this.gapAt = now;
            }
        } else {
            this.gap = [0, 0];
        }

        const closing = this.#closing(now);
        const drawn = [target[0] + this.gap[0] * closing, target[1] + this.gap[1] * closing];

        // (How they're drawn going, m/ms: none, if that's faster than they go)
        if (this.drawn && this.map === actor.map && since > 0) {
            const going = [(drawn[0] - this.drawn[0]) / since, (drawn[1] - this.drawn[1]) / since];

            this.going = lengthOf(...going) * 1000 <= PREDICT.fastest ? going : [0, 0];
        } else {
            this.going = [0, 0];
        }

        this.drawn = drawn;
        this.target = target;
        this.map = actor.map;
        this.drawnAt = now;
        this.rebase = false;

        return this.drawn;
    }
}
