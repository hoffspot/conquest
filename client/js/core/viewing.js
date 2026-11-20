// A game's link to a replicated world (generated/multiplayer_scaling_plan.md 3-21): one it's
// sent views of and holds no copy of. Where a lockstep link (core/netplay.js Joining) is sent
// the whole world and every command anyone gives, and plays the host's steps itself, this is
// welcomed with its player's own record and a summary, and then sent a frame a step
// (core/view.js) of what's near its hero. It plays nothing.
//
// It's the link seam's second implementation (core/remote.js), so the game doesn't know which
// it has. What the game reads as its world is a Host that's never stepped (`world`: given by
// whoever makes the game), kept as the server says:
//
//   - its battle is the mirror's (core/mirror.js): those the frames tell of, where they tell;
//   - its player's own record is the welcome's, and what the frames say has changed of it;
//   - who those in sight are drawn as (the folk, soldiers, other players' heroes, a creature's
//     kind) is what the frames say as each comes into sight (core/viewfeed.js dressOf);
//   - a trade the player's in is kept from the events that tell of it.
//
// `step()` plays one frame, a step of the world's, into that: a few are kept in hand so they
// go by evenly however they come (the same pacing a lockstep link has), and the game draws
// everyone between one step's places and the next's, as it does a copy's. Its own hero is where
// the server last said, with nothing looked ahead: that's the plan's next slice (3-22).
//
// Not yet (each a later slice's): the rest of the world's summary put where the game reads it
// (the war, parties, props: 3-24, 3-25), insides and dungeons (3-23), and being hidden and
// shown again (3-26). Pure: no DOM, no network of its own.

import { STEP_MS } from "./battle.js";
import { Host } from "./host.js";
import { Mirror } from "./mirror.js";
import { Joining, NET_VERSION, PACE } from "./netplay.js";
import { decodeFrame } from "./view.js";
import { VIEW_MODE } from "./viewfeed.js";
import { decode, encode } from "./wire.js";

/**
 * How many of the latest frames' comings the steps kept in hand are reckoned from; the share of
 * them that came no later than that allows for; and the fewest and most steps kept in hand.
 */
export const VIEWING = Object.freeze({ kept: 60, late: 0.95, least: 2, most: 8 });

export class Viewing extends Joining {
    // Frames come and not yet played: [{ step, bytes }], in their order
    #frames = [];

    // How long after its step's time each of the latest frames came (ms)
    #took = [];

    #started = null;

    constructor({ send, clock = () => 0 }) {
        super({ send, clock });

        /** Its mirror (null till it's given its world: attach). */
        this.mirror = null;

        /** The world's step last played, and the last heard of. */
        this.played = -1;
        this.heard = -1;

        /** How many frames it's played, and how many it let go by unplayed to catch up. */
        this.frames = 0;
        this.dropped = 0;

        /** Resolves once its hero's in its world (the first frames played): a game can be made. */
        this.started = new Promise((resolve) => {
            this.#started = resolve;
        });
    }

    // (Nothing's looked ahead from yet: the game draws its hero where the server last said)
    get self() {
        return null;
    }

    set self(_self) {}

    /** Ask to come into the world, to be sent views of it and no copy. */
    hello(character, { hero } = {}) {
        this.send(encode({ kind: "hello", version: NET_VERSION, mode: VIEW_MODE, character, ...(hero !== undefined ? { hero } : {}), speaks: ["replicated"] }));
    }

    /** What the world said: what came of a command of its player's, or anything a lockstep link's told too. */
    hear(text) {
        if (text.startsWith('{"kind":"result"')) {
            let message;

            try {
                message = decode(text);
            } catch {
                return;
            }

            this.received.result = (this.received.result ?? 0) + text.length;

            const then = this.pending.get(message.seq);

            this.pending.delete(message.seq);
            then?.(message.result ?? null);

            return;
        }

        super.hear(text);
    }

    /**
     * Given the world it's kept in (`host`: a Host of the welcome's seed that's never stepped
     * and has no one in it) and its welcome ({ id, step, own, world }): its mirror made over
     * that host's battle, its player's record put in it, and the frames that have come played
     * till its hero's there.
     */
    attach(host, welcome) {
        this.host = host;
        this.mirror = new Mirror(host.battle, { stepMs: STEP_MS });
        this.mirror.welcome(welcome);
        this.mirror.onDress = (actor, as) => this.#dress(actor, as);
        this.played = welcome.step ?? -1;
        host.battle.time = Math.max(0, this.played) * STEP_MS;
        this.#own();
        this.#begin();
    }

    // Its player's record, as the mirror's summary now has it (core/summary.js: the part "own",
    // each field as the world keeps it), made what the game reads: Host.livePlayer
    #own() {
        const fields = this.mirror.summary.parts.get("own");

        if (!fields?.size) {
            return;
        }

        const kept = structuredClone(Object.fromEntries(fields));

        if (kept.id === undefined || !kept.hero || !kept.progress) {
            return;
        }

        this.host.players.set(this.me, Host.livePlayer(kept));
    }

    // Someone come into sight with what they're drawn as: put where the game asks
    #dress(actor, as) {
        const { host } = this;

        if (as.folk) {
            host.folk.set(actor.id, as.folk);
        } else if (as.soldier) {
            host.soldiers.set(actor.id, as.soldier);
        } else if (as.hero && actor.id !== this.me) {
            const [worn, wielded] = [as.worn ?? [], as.wielded ?? null];

            host.players.set(actor.id, { id: actor.id, hero: as.hero, role: as.role ?? "player", progress: { worn: () => worn, wielded: () => wielded } });
        }
    }

    // The frames that have come played at once till its hero's in its world (who everyone is
    // comes over the first few), and whoever waits for that told
    #begin() {
        while (this.#started && this.#frames.length) {
            this.step();
        }
    }

    /** A frame come from the world (bytes). */
    frame(bytes) {
        const frame = decodeFrame(bytes);

        if (!frame || frame.step <= this.heard) {
            return;
        }

        const took = this.clock() - frame.step * STEP_MS;

        this.#took.push(took);

        if (this.#took.length > VIEWING.kept) {
            this.#took.shift();
        }

        // (As many steps in hand as cover how late nearly all of them come)
        const sorted = [...this.#took].sort((a, b) => a - b);
        const late = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * VIEWING.late))] - sorted[0];

        this.delay = Math.max(VIEWING.least, Math.min(VIEWING.most, Math.ceil(late / STEP_MS) + 1));
        this.heard = frame.step;
        this.hostStep = frame.step;
        this.#frames.push({ step: frame.step, bytes });

        if (this.mirror) {
            this.#begin();
        }
    }

    /** How many of the world's steps have come and aren't played. */
    get behind() {
        return this.#frames.length;
    }

    /**
     * Play the next of the world's steps that's come: its frame taken by the mirror, the
     * world's time moved on to it, the player's own record and trade kept up, and the events
     * that are the player's to hear given back (as Host.advance gives a copy's). Null if none's
     * come. Too far behind to catch up at the pace it may (PACE.tooFar), all but the latest few
     * are played at once, their events let go of.
     */
    step() {
        if (!this.mirror || !this.#frames.length) {
            return null;
        }

        while (this.#frames.length > PACE.tooFar) {
            this.#play(this.#frames.shift());
            this.dropped++;
        }

        return this.#play(this.#frames.shift());
    }

    #play({ bytes }) {
        const { mirror, host } = this;
        const frame = mirror.apply(bytes);

        if (!frame) {
            return [];
        }

        this.played = frame.step;
        this.frames++;
        host.battle.time = frame.step * STEP_MS;

        if (frame.sections.own !== undefined) {
            this.#own();
        }

        for (const event of mirror.events) {
            if (event.type === "trade") {
                this.#trade(event);
            }
        }

        if (this.#started && host.battle.actor(this.me) && host.players.has(this.me)) {
            this.#started();
            this.#started = null;
        }

        return mirror.events;
    }

    // A trade the player's in, as the events that tell of it say it stands: kept where the game
    // reads it (Host.trades), let go of when it's done or off
    #trade(event) {
        if (event.change === "done" || event.change === "off" || !event.state) {
            this.host.trades.delete(event.trade);
        } else {
            this.host.trades.set(event.trade, event.state);
        }
    }

    // (A lockstep link's: there's no copy to have gone astray, nor a world to be sent again)
    resync() {}

    shadowing() {}

    drawing() {}
}
