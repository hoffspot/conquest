// A player who plays by themselves (generated/world_server_plan.md §3.3): joined to a world over a
// link (core/netplay.js Joining), keeping its copy of the world played as the host's steps come,
// sending itself about near where it came in, and now and then starting a fight and joining it;
// and counting how its copy kept to the host's (how often it went astray, and was sent the world
// again), and when it saw anyone marked away or sent out for it (core/host.js AFK). The world
// server's soak (scripts/soak.js) plays them in Node and in each browser: the same code in each,
// so any difference in how the browsers play the rules shows as their copies going astray.
//
// And a thin one (ThinBot; generated/multiplayer_scaling_plan.md 0-3), which holds no copy of the
// world at all: it speaks what a game speaks (core/netplay.js) and reads only what it's told of
// its own hero (`self`), steering from where it came in. It costs its machine next to nothing, so
// many of them load a world server without their own play getting in the way of what's measured;
// it can't tell whether a copy would have kept to the host's, which is what the full ones are for.
//
// Pure JavaScript, the same in Node and the browser: whoever plays it says how much time has gone
// by (tick).

import { STEP_MS } from "./battle.js";
import { atan2 } from "./exact.js";
import { Host } from "./host.js";
import { NET_VERSION } from "./netplay.js";
import { buildWorld } from "./overworld.js";
import { placeOf } from "./selfstate.js";
import { decode, encode } from "./wire.js";

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

        /** The foe it last went for (an id), or null. */
        this.foe = null;

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

        // (The foe it's set on, as its copy of the world has it; or the one it last went for, while
        // that one stands near and isn't running: its copy's order let go of a moment now and then)
        const foe = host.battle.actor(me.order?.type === "engage" ? me.order.target : this.foe ?? null);
        const [dx, dy] = foe ? [foe.x - me.x, foe.y - me.y] : [0, 0];
        const fighting = Boolean(foe && !foe.dead && foe.map === me.map && dx * dx + dy * dy <= timing.foeNear * timing.foeNear && !host.battle.formations[foe.formation?.id]?.broken);

        if (!fighting) {
            const near = this.#foe(me);

            if (near) {
                this.#ask({ type: "engage", target: near.id });
                this.foe = near.id;
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
    // people's guards), alive and on its map, not running from a battle (its body broken:
    // core/engagement.js), or null
    #foe(me) {
        const { battle } = this.host;
        let best = null;
        let nearest = this.timing.foeNear * this.timing.foeNear;

        for (const actor of battle.actors) {
            if (actor === me || actor.dead || actor.map !== me.map || battle.formations[actor.formation?.id]?.broken) {
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
     * fell too far behind to catch up, core/netplay.js PACE.tooFar; checks: how many it made of
     * how the world stood, and motionChecks of where its characters did, of a host that sends
     * that), what it did, what it saw (`seen`), and if it was sent out.
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

/**
 * What a thin bot does besides what BOT says: how often it asks how long a word takes (ms: as a
 * game does, every second; one that didn't would be stopped for being quiet, core/netplay.js
 * QUIET); and, holding a stick, how many commands a second it sends, how far ahead each reaches
 * (m: app/steering.js HELD_REACH) and how near where it was making for it chooses somewhere else (m).
 */
export const THIN = Object.freeze({ ping: 1000, stick: 16, reach: 30, there: 2 });

// The kind of a message, read off its front without reading the rest ({"kind":"ops",...)
const kindOf = (text) => (text.startsWith('{"kind":"') ? text.slice(9, text.indexOf('"', 9)) : "?");

export class ThinBot {
    /**
     * @param {object} options
     * @param {function} options.send - Sends `text` to the host (its link's).
     * @param {number} [options.seed] - Where it sends itself, and which way its fights face.
     * @param {boolean} [options.hold] - Whether it holds a stick (THIN.stick commands a second)
     *     rather than sending itself somewhere every so often.
     * @param {boolean} [options.fights] - Whether it starts fights, as a full one does (if it may).
     * @param {object} [options.timing] - As BOT.
     * @param {function} [options.clock] - The time (ms), to time its words to the host and back
     *     by; none, they're timed to its ticks.
     */
    constructor({ send, seed = 1, hold = false, fights = false, timing = BOT, clock = null }) {
        this.send = send;
        this.clock = clock;
        this.hold = hold;
        this.startsFights = fights;
        this.timing = timing;
        this.random = seed >>> 0 || 1;

        /** Its player's id in the world, once it's welcomed; where it came in ([x, y]), and where it is now ({ x, y, map }), as it's told. */
        this.me = null;
        this.home = null;
        this.at = null;
        this.dead = false;

        /** How long it's played (ms), and the host's step it last heard of. */
        this.time = 0;
        this.step = -1;

        /** What it's done: sent itself somewhere, held its stick a way (commands), started fights. */
        this.moves = 0;
        this.held = 0;
        this.fights = 0;

        /** What it's heard, by kind ({ messages, chars }), and how many characters it's sent. */
        this.heard = {};
        this.sent = 0;

        /** How often it was sent the world again (it never asks: only if the host sends everyone it); how long its last word took (ms, to its tick); if it was sent out or refused. */
        this.states = 0;
        this.rtt = null;
        this.kicked = null;
        this.refused = null;

        this.seq = 0;
        this.to = null;
        this.owed = 0;
        this.nextMove = 0;
        this.nextPing = 0;
        this.nextFight = timing.firstFight;
    }

    #say(message) {
        const text = encode(message);

        this.sent += text.length;
        this.send(text);
    }

    #command(command) {
        this.#say({ kind: "command", seq: ++this.seq, command });
    }

    /** Ask to join, as `character` (as Host.join takes it; `hero`, a kept hero's slot or "new", in a world that keeps them). */
    hello(character, { hero } = {}) {
        this.#say({ kind: "hello", version: NET_VERSION, character, ...(hero !== undefined ? { hero } : {}) });
    }

    /** What the host said: counted, and read only if it's of the bot itself (its welcome, its own hero, an answer to its asking, its being sent out). */
    hear(text) {
        const kind = kindOf(text);
        const sum = (this.heard[kind] ??= { messages: 0, chars: 0 });

        sum.messages++;
        sum.chars += text.length;

        if (kind === "ops") {
            // (The step it's of, off its front: {"kind":"ops","step":1234,...)
            const step = Number.parseInt(text.slice(21, 33), 10);

            this.step = Number.isFinite(step) ? step : this.step;
        } else if (kind === "self") {
            const { hero, step } = decode(text);
            const at = placeOf(hero);

            this.at = at;
            this.dead = hero.dead === true;
            this.step = Math.max(this.step, step);

            if (!this.home && at.map === "town") {
                this.home = [at.x, at.y];
            }
        } else if (kind === "welcome") {
            // (Its id read, and the world it came with let go of: it keeps no copy)
            this.me = decode(text).id;
            this.#say({ kind: "ready" });
        } else if (kind === "pong") {
            const { t } = decode(text);

            this.rtt = Number.isFinite(t) ? (this.clock?.() ?? this.time) - t : this.rtt;
        } else if (kind === "state") {
            this.states++;
        } else if (kind === "kicked") {
            this.kicked = { reason: decode(text).reason, step: this.step };
        } else if (kind === "refused") {
            this.refused = decode(text).reason;
        }
    }

    /** Time gone by (`ms`): it asks how long a word takes, if that's due, and does what it does next. */
    tick(ms) {
        if (!this.me || this.kicked) {
            return;
        }

        const { timing } = this;

        this.time += ms;

        if (this.time >= this.nextPing) {
            this.nextPing = this.time + THIN.ping;
            this.#say({ kind: "ping", t: this.clock?.() ?? this.time, ...(this.rtt === null ? {} : { rtt: Math.round(this.rtt) }) });
        }

        // (Not till it's been told where its hero is; nor while they're down, or indoors)
        if (!this.home || this.dead || this.at.map !== "town") {
            return;
        }

        if (this.startsFights && this.time >= this.nextFight) {
            this.nextFight = this.time + timing.fightEvery;
            this.#command({ type: "fieldBattle", size: timing.fightSize, facing: this.#roll() * Math.PI });
            this.fights++;

            return;
        }

        if (this.hold) {
            // (Towards somewhere near home, another once it's there or every so often)
            const [dx, dy] = this.to ? [this.to[0] - this.at.x, this.to[1] - this.at.y] : [0, 0];

            if (!this.to || this.time >= this.nextMove || dx * dx + dy * dy < THIN.there * THIN.there) {
                this.nextMove = this.time + timing.every;
                this.to = this.#somewhere();
                this.moves++;
            }

            this.owed = Math.min(THIN.stick, this.owed + (ms * THIN.stick) / 1000);

            while (this.owed >= 1) {
                this.owed--;
                this.held++;
                this.#command({ type: "ahead", facing: atan2(this.to[0] - this.at.x, this.to[1] - this.at.y), reach: THIN.reach });
            }
        } else if (this.time >= this.nextMove) {
            this.nextMove = this.time + timing.every;
            this.#command({ type: "move", to: this.#somewhere() });
            this.moves++;
        }
    }

    #somewhere() {
        return [Math.round(this.home[0] + this.#roll() * this.timing.roam), Math.round(this.home[1] + this.#roll() * this.timing.roam)];
    }

    // A number from -1 to 1, the next of its own
    #roll() {
        this.random = (Math.imul(this.random, 1103515245) + 12345) >>> 0;

        return (this.random / 2 ** 32 - 0.5) * 2;
    }

    /** How it's gone, as plain data (`thin`: true; no `resyncs` or `desyncs`, having no copy to go astray). */
    report() {
        return { me: this.me, thin: true, played: this.time, step: this.step, moves: this.moves, held: this.held, fights: this.fights, heard: this.heard, sent: this.sent, states: this.states, rtt: this.rtt, kicked: this.kicked, refused: this.refused };
    }
}
