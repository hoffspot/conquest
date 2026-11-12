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
    // How often (ms of the world's time) what's been done is sent to those who've joined: each
    // step, as it's done (sooner there, and more evenly: core/netplay.js PLAYOUT)
    flushEvery: 50,
    // How many steps' times are kept, for the worst and the slow ones (StepTimes)
    kept: 1200,
    // The navigation round each player in the world outside baked ahead (metres): as far as this,
    // again once they've gone `again` from where it was last asked for (world/navbaker.js around)
    bakeReach: 96,
    bakeAgain: 16,
    // A world driven by a clock (the world server's) that's fallen behind it: how many steps it
    // plays at once catching up (`catchUp`: then whoever drives it hears what's been said to it
    // before the next), and how far behind it may stay (`behind`, ms: more is let go of, letGo, so
    // its time runs slow for a while and it's never further behind than this. A world whose steps
    // take longer than a step would else fall further behind for ever, playing them back to back
    // and answering no one: generated/multiplayer_scaling_plan.md 1-1). A browser's game is given
    // a tenth of a second a frame at most (app/game.js), and needs neither
    catchUp: 2,
    behind: 250,
});

/**
 * The bounds of the buckets times are counted into (ms): half a millisecond to a second, a step
 * (50 ms) among them. The world server's histograms are these, in seconds (server/server-metrics.js).
 */
export const TIME_BUCKETS = Object.freeze([0.5, 1, 2, 5, 10, 20, 35, 50, 75, 100, 150, 250, 500, 1000]);

/**
 * Times counted into fixed buckets (a histogram: how many were no longer than each bound, and how
 * many longer than them all), every one since it was made: what a recent window's percentile
 * forgets. Counting one is a few comparisons and two additions, and keeps nothing of it.
 */
export class TimeBuckets {
    constructor(bounds = TIME_BUCKETS) {
        this.bounds = bounds;

        /** How many fell in each bucket (the last: over every bound), and what they came to (ms). */
        this.counts = new Array(bounds.length + 1).fill(0);
        this.sum = 0;

        // As they were when last taken (take)
        this.taken = { counts: new Array(bounds.length + 1).fill(0), sum: 0 };
    }

    /** One more time (ms). */
    add(ms) {
        const { bounds } = this;
        let k = 0;

        while (k < bounds.length && ms > bounds[k]) {
            k++;
        }

        this.counts[k]++;
        this.sum += ms;
    }

    /**
     * What's been counted since this was last asked: { counts (a bucket each), sum (ms) }. For
     * whoever adds them up elsewhere (a world's thread tells the server's own, a second's worth
     * at a time: server/world-worker.js).
     */
    take() {
        const counts = this.counts.map((count, k) => count - this.taken.counts[k]);
        const sum = this.sum - this.taken.sum;

        this.taken = { counts: [...this.counts], sum: this.sum };

        return { counts, sum };
    }

    /** As plain data: { bounds, counts, sum }. */
    toJSON() {
        return { bounds: [...this.bounds], counts: [...this.counts], sum: this.sum };
    }
}

/**
 * How long the steps have taken (ms): how many, the mean, the worst (and the step it was), the
 * 99th percentile of the last RUNNER.kept, and all of them counted into buckets (`buckets`).
 */
export class StepTimes {
    constructor(kept = RUNNER.kept) {
        this.kept = kept;
        this.recent = [];
        this.count = 0;
        this.total = 0;
        this.worst = 0;
        this.worstAt = -1;
        this.buckets = new TimeBuckets();
    }

    /** One step's time (ms), and the battle's time it ended at. */
    add(ms, at) {
        this.count++;
        this.total += ms;
        this.buckets.add(ms);

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
     * @param {function} [options.onStep] - Told after each step (with what happened in it), before
     *   it's sent: for what's to be done a few steps after something (a turn's save).
     */
    constructor(host, { hosting = null, clock = null, onTurn = null, onStep = null } = {}) {
        this.host = host;
        this.hosting = hosting;
        this.clock = clock;
        this.onTurn = onTurn;
        this.onStep = onStep;

        /** Time gone by not yet stepped (ms: under a step, between advances). */
        this.lag = 0;

        /** All the time it's been given (ms), and when it last sent what's been done. */
        this.time = 0;
        this.flushedAt = 0;

        /** How long the steps have taken, if they're timed (clock). */
        this.times = clock ? new StepTimes() : null;

        /** Time it was given and never played (ms): let go of, fallen too far behind (letGo). */
        this.dropped = 0;

        // Where each player last had the navigation round them asked for (bakeAhead)
        this.bakedAround = new Map();
    }

    /**
     * Time gone by (`ms`): the whole steps it makes played (`most` of them at most: the rest wait
     * for the next call), what's left over kept for the next. Before each, `before()` (where
     * everyone was, for whoever draws them in between); after it, `after(events)` (what happened in
     * it), and what's been done sent to those who've joined: each step as it's done, so steps
     * played together after a hold-up still go out one by one. (And sent, if it's due, with no
     * step played: a command done between steps.) Returns how many steps were played.
     */
    advance(ms, { before = null, after = null, most = Infinity } = {}) {
        this.lag += ms;
        this.time += ms;

        let steps = 0;

        while (this.lag >= STEP_MS && steps < most) {
            before?.();

            const events = this.#step();

            after?.(events);
            this.lag -= STEP_MS;
            steps++;

            if (this.hosting) {
                this.flushedAt = this.time;
                this.hosting.flush();
            }
        }

        if (this.hosting && this.time - this.flushedAt >= RUNNER.flushEvery) {
            this.flushedAt = this.time;
            this.hosting.flush();
        }

        return steps;
    }

    /**
     * Whatever it's behind by beyond `behind` ms let go of, never to be played: its world's time
     * runs that much slow, rather than it falling further behind. Returns how much was let go of
     * (ms: 0, mostly), which `dropped` counts.
     */
    letGo(behind = RUNNER.behind) {
        const over = Math.max(0, this.lag - behind);

        this.lag -= over;
        this.dropped += over;

        return over;
    }

    /** How much of the time it's been given it's played, or still has to play (1: all of it; under 1, its world's run slow). */
    get dilation() {
        return this.time > 0 ? 1 - this.dropped / this.time : 1;
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
                // (And whoever sends the world told: none taken for anyone in this step's sending,
                // where that's held back: core/netplay.js Hosting `sparing`)
                this.hosting?.turned?.();
            } else if (event.type === "afk") {
                this.hosting?.kick(event.id, "afk");
            }
        }

        this.onStep?.(events);

        return events;
    }

    /**
     * Have the navigation tiles round each player in the world outside baked ahead (by `baker`:
     * world/navbaker.js NavBaker, or anything with its around and pump), so the ways found near
     * them don't wait on one: round each, again once they've gone far enough from where it was
     * last asked for; then the next tile waiting sent off.
     */
    bakeAhead(baker) {
        let players = 0;

        for (const actor of this.host.battle.actors) {
            if (actor.kind !== "player") {
                continue;
            }

            players++;

            if (actor.map !== "town" || actor.dead) {
                continue;
            }

            const at = this.bakedAround.get(actor.id);

            if (!at || Math.abs(actor.x - at[0]) > RUNNER.bakeAgain || Math.abs(actor.y - at[1]) > RUNNER.bakeAgain) {
                this.bakedAround.set(actor.id, [actor.x, actor.y]);
                baker.around(actor.x, actor.y, RUNNER.bakeReach);
            }
        }

        // (Nothing kept of players gone from the world: more remembered than there are players)
        if (this.bakedAround.size > players) {
            const here = new Set(this.host.battle.actors.filter(({ kind }) => kind === "player").map(({ id }) => id));

            for (const id of [...this.bakedAround.keys()]) {
                if (!here.has(id)) {
                    this.bakedAround.delete(id);
                }
            }
        }

        baker.pump();
    }
}
