// Playing together (docs/WAR.md M11): a world opened to others by its host, and joined.
//
// The host's game is the world's one authority (core/host.js). Everything done to its world it
// records as it's done (host.recorder): each step it's moved on, each command a player gives, each
// player come or gone. One who joins is sent the world as it is (a snapshot), then all that's
// recorded after, and plays it again on their own copy of the world, step for step; which comes
// out the same, the engine being made so (core/random.js). Their own commands go to the host, and
// come back among the rest: what came of them is what came of them on their copy.
//
// Now and then the host says how the world should stand (Host.checksum). A copy that doesn't
// (a browser whose sums come out a hair different from the host's) asks for the world again, and
// carries on from it (Host.adopt).
//
// What's said, as text (core/wire.js), whichever way it goes (app/relay.js carries it):
//
//   joiner -> host   { kind: "hello", version, character }   (character: as Host.join takes it)
//                    { kind: "command", seq, command }
//                    { kind: "again" }                         (gone astray: the world again)
//   host -> joiner   { kind: "welcome", version, id, seed, race, snapshot }
//                    { kind: "ops", ops }                      (what's been done, in order)
//                    { kind: "state", snapshot }               (the world again)
//                    { kind: "refused", reason }
//
// Pure: no DOM, no network. Hosting and Joining are given how to send, and told what's heard.

import { HIRES } from "./host.js";
import { STARTING_WEAPONS } from "./weapons.js";
import { decode, encode } from "./wire.js";
import { RACE, startFor } from "./worldplan/plan.js";

/** Bumped whenever what's said changes: a game of another version can't join. */
export const NET_VERSION = 4;

/** How many steps the host plays between telling how the world should stand. */
export const CHECK_EVERY = 100;

/** The most players in a world (its host too). */
export const MOST_PLAYERS = 8;

/**
 * How far behind the host a joined game lets itself get (steps waiting to be played) before it
 * plays faster to catch up, how many more steps it plays in a frame at most, catching up, and
 * for how long (ms of the frame: on a slow phone, fewer steps a frame, so that catching up
 * doesn't make the frame so long it falls further behind).
 */
export const PACE = Object.freeze({ behind: 6, catchUp: 40, catchUpMs: 8 });

/** Why a game can't join: shown to its player. */
export const NET_REFUSALS = Object.freeze({
    version: "That world's being played in another version of the game.",
    full: "That world's full.",
    character: "Your character couldn't be brought into that world.",
});

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * A character as one who's joining brings it (as Host.join takes it: { hero, talks, explored,
 * progress, standing, followers }), made safe to bring in: or null if it isn't one.
 */
export function characterFrom(character) {
    const hero = character?.hero;

    if (!isObject(hero) || typeof hero.name !== "string" || !hero.name.trim() || !isObject(hero.shape) || !isObject(hero.look) || !STARTING_WEAPONS.includes(hero.weapon)) {
        return null;
    }

    const race = RACE[hero.race] ? hero.race : "human";
    const talks = isObject(character.talks) ? character.talks : {};
    const followers = Array.isArray(character.followers) ? character.followers.filter((one) => isObject(one) && typeof one.name === "string" && HIRES[one.calling]).slice(0, 8) : [];

    return {
        hero: { ...structuredClone(hero), name: hero.name.trim().slice(0, 20).trim(), race, parts: Array.isArray(hero.parts) ? hero.parts.filter((part) => typeof part === "string").slice(0, 4) : [] },
        talks: { memory: isObject(talks.memory) ? structuredClone(talks.memory) : {}, knowledge: Array.isArray(talks.knowledge) ? talks.knowledge.filter((each) => typeof each === "string") : [] },
        explored: {},
        progress: isObject(character.progress) ? structuredClone(character.progress) : {},
        standing: isObject(character.standing) ? structuredClone(character.standing) : {},
        followers: structuredClone(followers),
    };
}

/**
 * Where a player of a people comes into a world (as Host.join takes it: { square, map }): by the
 * world's start if it's their people's (the host's), else by the town their people's players
 * start in, out in the world.
 */
export function spawnFor(world, race) {
    if (!world.plan || !RACE[race] || race === world.start?.race) {
        return {};
    }

    const { at } = startFor(world.plan, race);

    return { square: [Math.round(at[0]), Math.round(at[1])], map: "town" };
}

/**
 * A world opened to others, by its host: those who join brought in and kept up with what's done.
 * The game playing it calls `hear` with what's come from each (by their `peer`: the relay's), and
 * `gone` when one's left, and `flush` after it's moved the world on; what's to be sent goes by
 * `send(peer, text)`.
 */
export class Hosting {
    constructor(host, { send }) {
        this.host = host;
        this.send = send;

        /** Those who've joined (by peer): their player's id in the world. */
        this.players = new Map();

        /** What's been done since it was last sent, and whether it's time to say how the world stands. */
        this.ops = [];
        this.steps = 0;
        this.checkDue = false;
        this.seq = null;
        this.nextGuest = 1;

        /** Told when a player comes (id, peer) or goes (id, peer, their character as it's to be kept). */
        this.onJoin = () => {};
        this.onLeave = () => {};

        host.recorder = (op) => this.#record(op);
    }

    #record(op) {
        // (A joined player's command: which of theirs it was, so they hear what came of it)
        if (op[0] === "c" && this.seq !== null) {
            op.push(this.seq);
        }

        const last = this.ops.at(-1);

        if (op[0] === "a" && last?.[0] === "a" && last[1] === op[1]) {
            last[2] = (last[2] ?? 1) + 1;
        } else {
            this.ops.push(op);
        }

        if (op[0] === "a" && ++this.steps % CHECK_EVERY === 0) {
            this.checkDue = true;
        }
    }

    /** Send what's been done to everyone who's joined (and, now and then, how the world should stand). */
    flush() {
        if (this.checkDue) {
            this.ops.push(["k", this.host.checksum()]);
            this.checkDue = false;
        }

        if (!this.ops.length) {
            return;
        }

        const text = encode({ kind: "ops", ops: this.ops });

        this.ops = [];

        for (const peer of this.players.keys()) {
            this.send(peer, text);
        }
    }

    /** What one who's joined (or is joining) said. */
    hear(peer, text) {
        let message;

        try {
            message = decode(text);
        } catch {
            return;
        }

        switch (message?.kind) {
            case "hello":
                this.#hello(peer, message);
                break;
            case "command":
                this.#command(peer, message);
                break;
            case "again":
                this.#again(peer);
                break;
            default:
                break;
        }
    }

    // Someone joining, with their character: into the world (by their people's town, if it isn't
    // the host's people's), and sent it as it is
    #hello(peer, { version, character }) {
        if (this.players.has(peer)) {
            return;
        }

        const refuse = (reason) => this.send(peer, encode({ kind: "refused", reason }));

        if (version !== NET_VERSION) {
            refuse("version");

            return;
        }

        if (this.host.players.size >= MOST_PLAYERS) {
            refuse("full");

            return;
        }

        const brought = characterFrom(character);

        if (!brought) {
            refuse("character");

            return;
        }

        const id = `guest-${this.nextGuest++}`;
        const { world } = this.host;

        // (What's been done so far, to those already in; then their coming)
        this.flush();
        this.host.join({ id, ...brought, ...spawnFor(world, brought.hero.race) });
        this.flush();
        this.players.set(peer, id);
        this.send(peer, encode({ kind: "welcome", version: NET_VERSION, id, seed: world.seed, race: world.start?.race ?? "human", snapshot: this.host.snapshot() }));
        this.onJoin(id, peer);
    }

    // A joined player's command, done as the host's own are
    #command(peer, { seq, command }) {
        const id = this.players.get(peer);

        if (!id || !Number.isInteger(seq)) {
            return;
        }

        this.seq = seq;

        try {
            this.host.command(id, command);
        } finally {
            this.seq = null;
        }
    }

    // One whose world's gone astray: the world again (after all that's been done till now)
    #again(peer) {
        if (!this.players.has(peer)) {
            return;
        }

        this.flush();
        this.send(peer, encode({ kind: "state", snapshot: this.host.snapshot() }));
    }

    /** One who'd joined has gone: out of the world. */
    gone(peer) {
        const id = this.players.get(peer);

        if (!id) {
            return;
        }

        this.players.delete(peer);

        const character = this.host.leave(id);

        this.flush();
        this.onLeave(id, peer, character);
    }

    /** The world closed to others again: everyone who'd joined out of it, and nothing more recorded. */
    stop() {
        for (const peer of [...this.players.keys()]) {
            this.gone(peer);
        }

        this.host.recorder = null;
    }
}

/**
 * A game joining a world someone else hosts: says who's coming (`hello`), hears the world
 * (`onWelcome`, to make its copy and `attach` it), then plays it on as the host did (`step`),
 * its player's commands going to the host (`command`). What's to be sent goes by `send(text)`.
 */
export class Joining {
    constructor({ send }) {
        this.send = send;

        /** Its copy of the world (a Host, as the host's was), once it's made; its player's id in it. */
        this.host = null;
        this.me = null;

        /** What's been done in the host's world, not yet done in this copy. */
        this.queue = [];

        /** Its player's commands sent, waiting to hear what came of them (by seq). */
        this.pending = new Map();
        this.seq = 1;

        /** Whether it's gone astray from the host's, and asked for the world again. */
        this.astray = false;
        this.resyncs = 0;

        /** Told when the world's come (the welcome), come again (the state), or they're turned away (a reason). */
        this.onWelcome = () => {};
        this.onState = () => {};
        this.onRefused = () => {};
    }

    /** Ask to join, as a character (as Host.join takes it). */
    hello(character) {
        this.send(encode({ kind: "hello", version: NET_VERSION, character }));
    }

    /** What the host said. */
    hear(text) {
        let message;

        try {
            message = decode(text);
        } catch {
            return;
        }

        switch (message?.kind) {
            case "welcome":
                this.me = message.id;
                this.queue = [];
                this.onWelcome(message);
                break;
            case "ops":
                if (Array.isArray(message.ops)) {
                    this.queue.push(...message.ops);
                }

                break;
            case "state":
                // (Everything waiting was done before it: in it already)
                this.queue = [];
                this.host?.adopt(message.snapshot);
                this.astray = false;
                this.resyncs++;

                for (const then of this.pending.values()) {
                    then({ ok: true, again: true });
                }

                this.pending.clear();
                this.onState(message);
                break;
            case "refused":
                this.onRefused(message.reason);
                break;
            default:
                break;
        }
    }

    /** Its copy of the world, made from the welcome (Host.restore). */
    attach(host) {
        this.host = host;
    }

    /** How many of the host's steps are waiting to be played. */
    get behind() {
        return this.queue.reduce((sum, op) => sum + (op[0] === "a" ? (op[2] ?? 1) : 0), 0);
    }

    /**
     * Play what the host did, up to and including its next step: the events it made (as
     * Host.advance gives them), or null if there's no step to play yet.
     */
    step() {
        if (!this.host) {
            return null;
        }

        while (this.queue.length) {
            const op = this.queue[0];

            switch (op[0]) {
                case "a": {
                    if ((op[2] ?? 1) > 1) {
                        op[2]--;
                    } else {
                        this.queue.shift();
                    }

                    return this.host.advance(op[1]);
                }
                case "c": {
                    const [, id, command, seq] = this.queue.shift();
                    const result = this.host.command(id, command);

                    if (id === this.me && seq !== undefined && this.pending.has(seq)) {
                        const then = this.pending.get(seq);

                        this.pending.delete(seq);
                        then(result);
                    }

                    break;
                }
                case "j":
                    this.host.join(this.queue.shift()[1]);
                    break;
                case "l":
                    this.host.leave(this.queue.shift()[1]);
                    break;
                case "p":
                    this.queue.shift();
                    this.host.populate();
                    break;
                case "k": {
                    const [, sum] = this.queue.shift();

                    if (!this.astray && this.host.checksum() !== sum) {
                        this.astray = true;
                        this.send(encode({ kind: "again" }));
                    }

                    break;
                }
                default:
                    this.queue.shift();
            }
        }

        return null;
    }

    /**
     * A command of its player's, to the host: `then` hears what came of it, once the host's done it
     * and it's been done here too. Returns at once: { ok: true, pending: true }.
     */
    command(command, then = null) {
        const seq = this.seq++;

        if (then) {
            this.pending.set(seq, then);
        }

        this.send(encode({ kind: "command", seq, command }));

        return { ok: true, pending: true };
    }
}
