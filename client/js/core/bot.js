// A player who plays by themselves (generated/world_server_plan.md §3.3): joined to a world over a
// link (core/netplay.js Joining), keeping its copy of the world played as the host's steps come,
// sending itself about near where it came in, and now and then starting a fight and joining it;
// and counting how its copy kept to the host's (how often it went astray, and was sent the world
// again), and when it saw anyone marked away or sent out for it (core/host.js AFK). The world
// server's soak (scripts/soak.js) plays them in Node and in each browser: the same code in each,
// so any difference in how the browsers play the rules shows as their copies going astray.
//
// Pure JavaScript, the same in Node and the browser: whoever plays it says how much time has gone
// by (tick).

import { STEP_MS } from "./battle.js";
import { Host } from "./host.js";
import { buildWorld } from "./overworld.js";

export const BOT = Object.freeze({
    // How often (ms) it sends itself somewhere, and how far from where it came in (m) at most
    every: 5000,
    roam: 40,
    // How often (ms) it starts a fight, if it may (core/host.js debugs: an owner, in a world whose
    // debug commands are its owners'), its first after `firstFight`; and how many a side
    fightEvery: 240000,
    firstFight: 30000,
    fightSize: 6,
    // How near (m) a foe has to be for it to go for them (a fight it starts meets some 30 m off)
    foeNear: 60,
});

export class Bot {
    /**
     * @param {object} joining - Its link to the world (core/netplay.js Joining): its copy made as
     *     it's welcomed, and played by `tick`.
     * @param {object} [options]
     * @param {boolean} [options.idle] - Whether it does nothing at all (to be marked away, and then
     *     sent out: core/host.js AFK).
     * @param {number} [options.seed] - Where it sends itself, and which way its fights face.
     * @param {object} [options.timing] - As BOT.
     */
    constructor(joining, { idle = false, seed = 1, timing = BOT } = {}) {
        this.joining = joining;
        this.idle = idle;
        this.timing = timing;
        this.random = seed >>> 0 || 1;

        /** Where it came into the world (its square), once it has. */
        this.home = null;

        /** How long it's played (ms), and how many of the host's steps. */
        this.time = 0;
        this.steps = 0;

        /** What it's done: sent itself somewhere, started fights, gone for foes (each time one was asked for). */
        this.moves = 0;
        this.fights = 0;
        this.engaged = 0;

        /** Anyone marked away, back, or sent out for it, as its copy saw it: { type, id, away, step }. */
        this.seen = [];

        /** If it was sent out of the world: { reason, step }. */
        this.kicked = null;

        this.nextMove = 0;
        this.nextFight = timing.firstFight;

        // (Whether what it last asked the host for is still to be done)
        this.asking = false;

        joining.onWelcome = ({ seed: worldSeed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed: worldSeed, race }), snapshot));
        joining.onKicked = (reason) => (this.kicked = { reason, step: this.#step() });
    }

    /** Its copy of the world (a Host), once it's been welcomed into it. */
    get host() {
        return this.joining.host;
    }

    // The step its copy's at
    #step() {
        return this.host ? Math.floor(this.host.battle.time / STEP_MS) : -1;
    }

    /**
     * Time gone by (`ms`): every step of the host's that's come played, and, if it's due, what it
     * does next. Returns how many steps it played.
     */
    tick(ms) {
        if (!this.host) {
            return 0;
        }

        let steps = 0;

        for (let events = this.joining.step(); events !== null; events = this.joining.step()) {
            steps++;

            for (const event of events) {
                if (event.type === "away" || event.type === "afk") {
                    this.seen.push({ type: event.type, id: event.id, away: event.type === "afk" || event.away, step: this.#step() });
                }
            }
        }

        this.steps += steps;
        this.time += ms;

        if (!this.idle && !this.kicked && !this.joining.astray) {
            this.#play();
        }

        return steps;
    }

    // What it does next, if it's due (once what it last asked for has been done): goes for a foe
    // near, if it isn't fighting one; starts a fight; or sends itself somewhere
    #play() {
        const { host, timing } = this;
        const me = host.battle.actor(this.joining.me);

        if (this.asking || !me || me.dead) {
            return;
        }

        this.home ??= [...me.square];

        const foe = me.order?.type === "engage" ? host.battle.actor(me.order.target) : null;
        const fighting = Boolean(foe && !foe.dead);

        if (!fighting) {
            const near = this.#foe(me);

            if (near) {
                this.#ask({ type: "engage", target: near.id });
                this.engaged++;

                return;
            }
        }

        if (this.time >= this.nextFight && me.map === "town" && host.debugs(this.joining.me)) {
            this.nextFight = this.time + timing.fightEvery;
            this.#ask({ type: "fieldBattle", size: timing.fightSize, facing: this.#roll() * Math.PI });
            this.fights++;

            return;
        }

        if (this.time >= this.nextMove && !fighting) {
            const [x, y] = this.home;

            this.nextMove = this.time + timing.every;
            this.#ask({ type: "move", to: [Math.round(x + this.#roll() * timing.roam), Math.round(y + this.#roll() * timing.roam)] });
            this.moves++;
        }
    }

    // Ask the host to do something, and nothing more till it's been done (in its copy too)
    #ask(command) {
        this.asking = true;
        this.joining.command(command, () => (this.asking = false));
    }

    // The nearest foe within BOT.foeNear (one who'd fight it: not the townsfolk, nor its own
    // people's guards), alive and on its map, or null
    #foe(me) {
        const { battle } = this.host;
        let best = null;
        let nearest = this.timing.foeNear * this.timing.foeNear;

        for (const actor of battle.actors) {
            if (actor === me || actor.dead || actor.map !== me.map) {
                continue;
            }

            const [dx, dy] = [actor.x - me.x, actor.y - me.y];
            const far = dx * dx + dy * dy;

            if (far < nearest && battle.hostile(me, actor) && this.host.canFight(me, actor)) {
                best = actor;
                nearest = far;
            }
        }

        return best;
    }

    // A number from -1 to 1, the next of its own
    #roll() {
        this.random = (Math.imul(this.random, 1103515245) + 12345) >>> 0;

        return (this.random / 2 ** 32 - 0.5) * 2;
    }

    /**
     * How it's gone, as plain data: who it is, how long it's played, how its copy kept to the
     * host's (resyncs: the world sent again; desyncs: its copy found astray by a check; skips: it
     * fell too far behind to catch up, core/netplay.js PACE.tooFar; checks and motionChecks: how
     * many it made), what it did, what it saw (`seen`), and if it was sent out.
     */
    report() {
        const { joining } = this;

        return {
            me: joining.me,
            played: this.time,
            steps: this.steps,
            step: this.#step(),
            behind: joining.behind,
            resyncs: joining.resyncs,
            desyncs: joining.desyncs,
            skips: joining.skips,
            checks: joining.checks,
            motionChecks: joining.motionChecks,
            moves: this.moves,
            fights: this.fights,
            engaged: this.engaged,
            seen: this.seen,
            kicked: this.kicked,
        };
    }
}
