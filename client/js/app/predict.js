// A joined game's own hero, drawn going where they're sent at once (docs/WAR.md, playing
// together). Their command goes to the host and comes back done (core/netplay.js), a round trip
// and the steps kept in hand later: a fifth of a second or more of standing still after a tap.
// So the hero's drawn setting off at once, straight for where they were sent; and once the host's
// done it, drawn as far ahead along their way (the copy's: core/battle.js) as that took, the
// copy catching up as they arrive. Whenever what's drawn and where they'd be drawn part (the
// host had them go another way, or not at all), the gap closes over 150 ms.
//
// Only what's drawn: the copy of the world is never touched (the rules never guess).

import { ACCELERATION, SPRINT } from "../core/battle.js";
import { shareOf } from "../core/afflictions.js";

/**
 * How long the gap takes to close (ms); how far ahead the hero's drawn at most (as many ms of
 * their going); how far they can be drawn off (m) and still be closed up to, rather than shown
 * where they are at once (gone through a door, or by magic); and how far where they'd be drawn
 * may move in a frame (m, and m/s) before it's taken for a jump, not their going.
 */
export const PREDICT = Object.freeze({ blend: 150, most: 600, far: 3, jump: 0.3, fastest: 10 });

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

        /** How long the last one took to come back done (ms): how far ahead the hero's drawn. */
        this.lag = 0;
        this.ahead = false;

        // What was drawn last (where, on which map), and the gap being closed (from when)
        this.drawn = null;
        this.target = null;
        this.map = null;
        this.drawnAt = 0;
        this.gap = [0, 0];
        this.gapAt = 0;
        this.rebase = false;
    }

    /** The hero's sent to `to` ([x, y] m, on their map) at `now` (ms), running or not: drawn going at once. */
    ordered(actor, to, run, now) {
        this.pending = { to, run, at: now, map: actor.map };
        this.ahead = false;
        this.rebase = true;
    }

    /** Any other order sent (to fight, to go through a door...): drawn where the copy has them. */
    other() {
        this.pending = null;
        this.ahead = false;
        this.rebase = true;
    }

    /** The order's been done here, at `now` (ms): what came of it (Host.command's result). */
    done(result, now) {
        if (!this.pending) {
            return;
        }

        this.lag = Math.min(PREDICT.most, Math.max(0, now - this.pending.at));
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

        // Sent, not yet heard done: straight for where they're going, as fast as they'll go
        if (pending && pending.map === actor.map) {
            const [dx, dy] = [pending.to[0] - x, pending.to[1] - y];
            const distance = lengthOf(dx, dy);
            const gone = Math.min(distance, this.#gone(actor, pending.run, Math.min(now - pending.at, PREDICT.most)));

            return distance > 0 ? [x + (dx * gone) / distance, y + (dy * gone) / distance] : [x, y];
        }

        // Going their way: as far along it as it took the host to hear
        if (this.ahead && actor.progress !== null && actor.path.length) {
            return along(x, y, actor.path, this.#gone(actor, false, this.lag));
        }

        // (Arrived, or stopped: no longer ahead)
        if (this.ahead && actor.progress === null && !actor.path.length) {
            this.ahead = false;
            this.rebase = true;
        }

        return [x, y];
    }

    /** Where to draw the hero at `now` (ms), the copy having them at [x, y] (as it's drawn them). */
    at(actor, x, y, now) {
        const target = this.#targetOf(actor, x, y, now);

        if (this.drawn && this.map === actor.map) {
            const jumped = lengthOf(target[0] - this.target[0], target[1] - this.target[1]);

            // (Drawn from somewhere else now: closed up to from where it was, unless that's far)
            if (this.rebase || jumped > PREDICT.jump + (PREDICT.fastest * (now - this.drawnAt)) / 1000) {
                const [gx, gy] = [this.drawn[0] - target[0], this.drawn[1] - target[1]];

                this.gap = lengthOf(gx, gy) <= PREDICT.far ? [gx, gy] : [0, 0];
                this.gapAt = now;
            }
        } else {
            this.gap = [0, 0];
        }

        const share = Math.max(0, 1 - (now - this.gapAt) / PREDICT.blend);

        this.drawn = [target[0] + this.gap[0] * share, target[1] + this.gap[1] * share];
        this.target = target;
        this.map = actor.map;
        this.drawnAt = now;
        this.rebase = false;

        return this.drawn;
    }
}
