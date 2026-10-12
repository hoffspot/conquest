// A world played on (generated/world_server_plan.md §3): its host (core/host.js) moved on in the
// battle's fixed steps as time goes by, what's done sent to those who've joined it every so often
// (core/netplay.js Hosting), and the navigation round each player baked ahead, so the ways found
// near them don't wait on a tile being made. One for the browser game playing its own world
// (app/game.js: its frames give the time) and for the world server's (a timer gives it): the same
// code, so they can't drift apart.
//
// Pure JavaScript, the same in Node and the browser. It reads no clock of its own: whoever drives
// it says how much time has gone by, and (if the steps are to be timed) gives it a clock to time
// them by.

import { STEP_MS } from "./battle.js";

export const RUNNER = Object.freeze({
    // How often (ms of the world's time) what's been done is sent to those who've joined
    flushEvery: 100,
    // How many steps' times are kept, for the worst and the slow ones (StepTimes)
    kept: 1200,
    // The navigation round each player in the world outside baked ahead (metres): as far as this,
    // again once they've gone `again` from where it was last asked for (world/navbaker.js around)
    bakeReach: 96,
    bakeAgain: 16,
});

/**
 * How long the steps have taken (ms): how many, the mean, the worst (and the step it was), and the
 * 99th percentile of the last RUNNER.kept.
 */
export class StepTimes {
    constructor(kept = RUNNER.kept) {
        this.kept = kept;
        this.recent = [];
        this.count = 0;
        this.total = 0;
        this.worst = 0;
        this.worstAt = -1;
    }

    /** One step's time (ms), and the battle's time it ended at. */
    add(ms, at) {
        this.count++;
        this.total += ms;

        if (ms > this.worst) {
            this.worst = ms;
            this.worstAt = at;
        }

        this.recent.push(ms);

        if (this.recent.length > this.kept) {
            this.recent.shift();
        }
    }

    get mean() {
        return this.count ? this.total / this.count : 0;
    }

    /** The `share` (0-1) percentile of the steps kept (0, with none). */
    percentile(share = 0.99) {
        if (!this.recent.length) {
            return 0;
        }

        const sorted = [...this.recent].sort((a, b) => a - b);

        return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
    }

    /** As plain data (for the debug overlay, the world server's health page and tests). */
    toJSON() {
        return { count: this.count, mean: this.mean, p99: this.percentile(0.99), worst: this.worst, worstAt: this.worstAt };
    }
}

export class WorldRunner {
    /**
     * @param {object} host - The world (core/host.js Host).
     * @param {object} [options]
     * @param {object} [options.hosting] - What sends what's done to those who've joined (core/netplay.js
     *   Hosting), if the world's open to others; set later as it's opened (`hosting`).
     * @param {function} [options.clock] - Times each step (ms: performance.now, say), if they're to
     *   be timed (`times`); none, they aren't.
     * @param {function} [options.onTurn] - Told of each turn of the war (with the war), as it comes:
     *   when a world that's kept is saved.
     */
    constructor(host, { hosting = null, clock = null, onTurn = null } = {}) {
        this.host = host;
        this.hosting = hosting;
        this.clock = clock;
        this.onTurn = onTurn;

        /** Time gone by not yet stepped (ms: under a step, between advances). */
        this.lag = 0;

        /** All the time it's been given (ms), and when it last sent what's been done. */
        this.time = 0;
        this.flushedAt = 0;

        /** How long the steps have taken, if they're timed (clock). */
        this.times = clock ? new StepTimes() : null;

        // Where each player last had the navigation round them asked for (bakeAhead)
        this.bakedAround = new Map();
    }

    /**
     * Time gone by (`ms`): the whole steps it makes played, what's left over kept for the next.
     * Before each, `before()` (where everyone was, for whoever draws them in between); after it,
     * `after(events)` (what happened in it). Then, if it's due, what's been done sent to those
     * who've joined. Returns how many steps were played.
     */
    advance(ms, { before = null, after = null } = {}) {
        this.lag += ms;
        this.time += ms;

        let steps = 0;

        while (this.lag >= STEP_MS) {
            before?.();

            const events = this.#step();

            after?.(events);
            this.lag -= STEP_MS;
            steps++;
        }

        if (this.hosting && this.time - this.flushedAt >= RUNNER.flushEvery) {
            this.flushedAt = this.time;
            this.hosting.flush();
        }

        return steps;
    }

    // One step of the world (timed, if they're to be), the war's turns told of, and anyone away
    // too long sent out of it (core/host.js AFK: every copy knows it at this step; the world's
    // own sends them, and their going's recorded as any going is)
    #step() {
        const started = this.clock?.();
        const events = this.host.advance(STEP_MS);

        if (this.times) {
            this.times.add(this.clock() - started, this.host.battle.time);
        }

        for (const event of events) {
            if (event.type === "turn") {
                this.onTurn?.(this.host.war);
            } else if (event.type === "afk") {
                this.hosting?.kick(event.id, "afk");
            }
        }

        return events;
    }

    /**
     * Have the navigation tiles round each player in the world outside baked ahead (by `baker`:
     * world/navbaker.js NavBaker, or anything with its around and pump), so the ways found near
     * them don't wait on one: round each, again once they've gone far enough from where it was
     * last asked for; then the next tile waiting sent off.
     */
    bakeAhead(baker) {
        for (const actor of this.host.battle.actors) {
            if (actor.kind !== "player" || actor.map !== "town" || actor.dead) {
                continue;
            }

            const at = this.bakedAround.get(actor.id);

            if (!at || Math.abs(actor.x - at[0]) > RUNNER.bakeAgain || Math.abs(actor.y - at[1]) > RUNNER.bakeAgain) {
                this.bakedAround.set(actor.id, [actor.x, actor.y]);
                baker.around(actor.x, actor.y, RUNNER.bakeReach);
            }
        }

        baker.pump();
    }
}
