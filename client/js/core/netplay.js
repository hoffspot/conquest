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
// carries on from it (Host.adopt). So does one whose link to the host dropped a moment and came
// back (what was sent meanwhile lost): the host's own link back, it sends everyone the world again.
//
// When the host can't move its world on (its page hidden: a phone's gone to another app), it says
// so, and those who've joined are shown why nothing's happening.
//
// Every few steps the host also sends where its characters near the players stand (core/motion.js):
// a copy plays the same steps and compares, and one that's gone astray knows it at once. Each of
// the host's sendings carries its step: a joined game keeps a few steps in hand behind it (more,
// the less evenly they come), playing a little slower or faster to keep them, so that it doesn't
// stop and start (Joining.pace). And it times how long a word takes to go to the host and back
// (ping, pong), for the debug overlay.
//
// The ways its characters find over the navigation meshes (core/battle.js) are recorded too, as
// the host found them, and taken by a joined copy rather than found again: what each copy has of
// the meshes (made as each has needed them) doesn't matter.
//
// What's said in a party (party chat) isn't done to the world, and isn't for everyone in it: a
// line goes to the host, which sends it on to those in the sayer's party alone (Hosting.chat),
// so no one else's game ever has it.
//
// What's said, as text (core/wire.js), whichever way it goes (app/relay.js carries it):
//
//   joiner -> host   { kind: "hello", version, character }   (character: as Host.join takes it)
//                    { kind: "command", seq, command }
//                    { kind: "again" }                         (gone astray: the world again)
//                    { kind: "ping", t }                       (t: the joiner's clock, ms)
//                    { kind: "chat", text }                    (a line to their party)
//   host -> joiner   { kind: "welcome", version, id, seed, race, snapshot }
//                    { kind: "ops", step, ops }                (what's been done, in order, up to step)
//                    { kind: "motion", step, units }           (base64: core/motion.js)
//                    { kind: "pong", t, step }
//                    { kind: "state", snapshot }               (the world again)
//                    { kind: "paused", paused }                (the host's world stopped, or going again)
//                    { kind: "refused", reason }
//                    { kind: "chat", from, name, text }        (a line said in their party)
//                    { kind: "unsaid", reason }                (one of theirs not said: CHAT_REFUSED)
//
// Pure: no DOM, no network. Hosting and Joining are given how to send, and told what's heard.

import { STEP_MS } from "./battle.js";
import { HIRES, HOST_PLAYER } from "./host.js";
import { compareMotion, MOTION, packMotion, unpackMotion } from "./motion.js";
import { STARTING_WEAPONS } from "./weapons.js";
import { decode, encode, fromBase64, toBase64 } from "./wire.js";
import { RACE, startFor } from "./worldplan/plan.js";

/** Bumped whenever what's said changes: a game of another version can't join. */
export const NET_VERSION = 106;

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

/**
 * How many of the host's steps a joined game keeps in hand (the delay): at least `least` (the host
 * sends every other step or so), more as the host's sendings come less evenly, `most` at most,
 * twice their unevenness (ms, as RFC 3550 reckons it, over the last `jitter` or so; any one late
 * by `late` ms at most: the link dropped a moment) over. And how it keeps them: playing up to
 * `rate` slower or faster, `gain` for each step too few or too many, as it's had them in hand
 * over the last `settle` ms.
 */
export const PLAYOUT = Object.freeze({ least: 2, most: 6, jitter: 16, late: 1000, rate: 0.1, gain: 0.05, settle: 1000 });

/** Why a game can't join: shown to its player. */
export const NET_REFUSALS = Object.freeze({
    version: "That world's being played in another version of the game.",
    full: "That world's full.",
    character: "Your character couldn't be brought into that world.",
});

/**
 * Party chat: the longest line (characters), how many lines one player can say in a while (`burst`
 * in `burstMs` of the world's time: more is held back), and how many lines a game keeps to show.
 */
export const CHAT = Object.freeze({ most: 200, burst: 5, burstMs: 10000, kept: 50 });

/** Why a line wasn't said (as host.js REFUSALS names them). */
export const CHAT_REFUSED = Object.freeze(["empty", "unpartied", "chatty"]);

/**
 * A line as it's said: whatever's not to be seen (control characters) and runs of spaces made one
 * space, trimmed, and CHAT.most characters at most (whole characters: an emoji's never halved).
 * Nothing to say: "".
 */
export function chatLine(text) {
    if (typeof text !== "string") {
        return "";
    }

    return [...text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim()].slice(0, CHAT.most).join("").trim();
}

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
        this.motionDue = false;
        this.seq = null;
        this.nextGuest = 1;

        /** What's been sent (characters of text, to everyone together), by kind. */
        this.sent = {};

        /** Whether the host's world is stopped (its page hidden), as those who've joined have been told. */
        this.paused = false;

        /** Told when a player comes (id, peer) or goes (id, peer, their character as it's to be kept). */
        this.onJoin = () => {};
        this.onLeave = () => {};

        /** Told each line said in the host's own player's party: { from, name, text }. */
        this.onChat = () => {};

        // When each player's lines were said lately (the world's time), to hold back one who says too much
        this.said = new Map();

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

        if (op[0] === "a") {
            this.steps++;
            this.checkDue ||= this.steps % CHECK_EVERY === 0;
            this.motionDue ||= this.steps % MOTION.every === 0;
        }
    }

    // The host's step, as its sendings carry it
    #step() {
        return Math.floor(this.host.battle.time / STEP_MS);
    }

    #send(peer, kind, text) {
        this.sent[kind] = (this.sent[kind] ?? 0) + text.length;
        this.send(peer, text);
    }

    #sendAll(kind, text) {
        for (const peer of this.players.keys()) {
            this.#send(peer, kind, text);
        }
    }

    /**
     * Send what's been done to everyone who's joined; and, now and then, how the world should
     * stand, and where those near the players are (after what's been done: compared there).
     */
    flush() {
        if (this.checkDue) {
            this.ops.push(["k", this.host.checksum()]);
            this.checkDue = false;
        }

        const step = this.#step();

        if (this.ops.length) {
            const text = encode({ kind: "ops", step, ops: this.ops });

            this.ops = [];
            this.#sendAll("ops", text);
        }

        if (this.motionDue) {
            this.motionDue = false;

            if (this.players.size) {
                this.#sendAll("motion", encode({ kind: "motion", step, units: toBase64(packMotion(this.host)) }));
            }
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
            case "ping":
                // (At once: how long a word takes to come and go, not how long till the next flush)
                if (this.players.has(peer) && Number.isFinite(message.t)) {
                    this.#send(peer, "pong", encode({ kind: "pong", t: message.t, step: this.#step() }));
                }

                break;
            case "chat": {
                const id = this.players.get(peer);
                const said = id ? this.#say(id, message.text) : null;

                if (said && !said.ok) {
                    this.#send(peer, "unsaid", encode({ kind: "unsaid", reason: said.reason }));
                }

                break;
            }
            default:
                break;
        }
    }

    /**
     * A line the host's own player says to their party, sent to those in it alone. Returns
     * { ok: true }, or { ok: false, reason } (CHAT_REFUSED: nothing to say, in no party, or too
     * many lines too quickly).
     */
    chat(text) {
        return this.#say(HOST_PLAYER, text);
    }

    // A line said by a player to their party: to each in it (the host's own player told here, the
    // others sent it, the sayer too), and to no one else
    #say(id, said) {
        const text = chatLine(said);
        const party = this.host.partyFor(id);

        if (!text) {
            return { ok: false, reason: "empty" };
        }

        if (!party) {
            return { ok: false, reason: "unpartied" };
        }

        const now = this.host.battle.time;
        const lately = (this.said.get(id) ?? []).filter((at) => at > now - CHAT.burstMs);

        if (lately.length >= CHAT.burst) {
            this.said.set(id, lately);

            return { ok: false, reason: "chatty" };
        }

        this.said.set(id, [...lately, now]);

        const line = { from: id, name: this.host.players.get(id)?.hero.name ?? "", text };
        const sent = encode({ kind: "chat", ...line });

        for (const member of party.members) {
            if (member === HOST_PLAYER) {
                this.onChat(line);
            } else {
                const peer = [...this.players].find(([, player]) => player === member)?.[0];

                if (peer !== undefined) {
                    this.#send(peer, "chat", sent);
                }
            }
        }

        return { ok: true };
    }

    // Someone joining, with their character: into the world (by their people's town, if it isn't
    // the host's people's), and sent it as it is
    #hello(peer, { version, character }) {
        if (this.players.has(peer)) {
            return;
        }

        const refuse = (reason) => this.#send(peer, "refused", encode({ kind: "refused", reason }));

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
        this.#send(peer, "welcome", encode({ kind: "welcome", version: NET_VERSION, id, seed: world.seed, race: world.start?.race ?? "human", snapshot: this.host.snapshot() }));

        if (this.paused) {
            this.#send(peer, "paused", encode({ kind: "paused", paused: true }));
        }

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
        this.#send(peer, "state", encode({ kind: "state", snapshot: this.host.snapshot() }));
    }

    /**
     * The host's world stopped (`paused`: its page hidden, so it can't move on) or going again:
     * everyone who's joined told, and anyone who joins meanwhile.
     */
    pause(paused) {
        if (paused === this.paused) {
            return;
        }

        this.paused = paused;
        this.#sendAll("paused", encode({ kind: "paused", paused }));
    }

    /**
     * The host's link back after it dropped (what was sent meanwhile lost): everyone who's joined
     * sent the world as it now is (one snapshot for them all).
     */
    resync() {
        this.flush();

        if (!this.players.size) {
            return;
        }

        const text = encode({ kind: "state", snapshot: this.host.snapshot() });

        for (const peer of this.players.keys()) {
            this.#send(peer, "state", text);

            if (this.paused) {
                this.#send(peer, "paused", encode({ kind: "paused", paused: true }));
            }
        }
    }

    /** Who's still here (the relay's word, the host's link back): anyone else who'd joined, gone. */
    still(peers) {
        const here = new Set(peers);

        for (const peer of [...this.players.keys()]) {
            if (!here.has(peer)) {
                this.gone(peer);
            }
        }
    }

    /** One who'd joined has gone: out of the world. */
    gone(peer) {
        const id = this.players.get(peer);

        if (!id) {
            return;
        }

        this.players.delete(peer);
        this.said.delete(id);

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
 * its player's commands going to the host (`command`). What's to be sent goes by `send(text)`;
 * `clock` tells the time (ms: only to time the link, never in the world).
 */
export class Joining {
    #last = null;

    constructor({ send, clock = () => 0 }) {
        this.send = send;
        this.clock = clock;

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

        /**
         * How often it's compared where the host's characters stood with its own (the motion
         * stream), and the world with how the host said it should stand (the checksum); and how
         * often it found it had gone astray, either way.
         */
        this.motionChecks = 0;
        this.checks = 0;
        this.desyncs = 0;

        /**
         * The host's latest step heard; how unevenly its sendings come (ms); how many of its
         * steps to keep in hand (PLAYOUT), and how many it's had in hand lately; and how long a
         * word takes to the host and back (ms: null till it's known).
         */
        this.hostStep = null;
        this.jitter = 0;
        this.delay = PLAYOUT.least;
        this.held = 0;
        this.rtt = null;

        /** What's been heard (characters of text), by kind. */
        this.received = {};

        /** Whether the host's world is stopped (its page hidden), as the host's said. */
        this.paused = false;

        /** Told when the world's come (the welcome), come again (the state), or they're turned away (a reason). */
        this.onWelcome = () => {};
        this.onState = () => {};
        this.onRefused = () => {};

        /** Told each round trip to the host as it's heard (ms, as it was: not smoothed as rtt is). */
        this.onPong = () => {};

        /** Told each line said in its player's party ({ from, name, text }), and why one of theirs wasn't said (CHAT_REFUSED). */
        this.onChat = () => {};
        this.onUnsaid = () => {};
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

        if (typeof message?.kind === "string") {
            this.received[message.kind] = (this.received[message.kind] ?? 0) + text.length;
        }

        switch (message?.kind) {
            case "welcome":
                this.me = message.id;
                this.queue = [];
                this.#last = null;
                this.onWelcome(message);
                break;
            case "ops":
                if (Array.isArray(message.ops)) {
                    this.queue.push(...message.ops);
                    this.#arrived(message.step);
                }

                break;
            case "motion":
                // (Compared once what came before it's been played: just where the host packed it)
                if (typeof message.units === "string" && Number.isInteger(message.step)) {
                    this.queue.push(["m", message.step, message.units]);
                }

                break;
            case "pong":
                if (Number.isFinite(message.t)) {
                    const took = Math.max(0, this.clock() - message.t);

                    this.rtt = this.rtt === null ? took : this.rtt + (took - this.rtt) / 8;
                    this.onPong(took);
                }

                break;
            case "state":
                // (Everything waiting was done before it: in it already)
                this.queue = [];
                this.#last = null;
                this.host?.adopt(message.snapshot);
                this.astray = false;
                this.resyncs++;

                for (const then of this.pending.values()) {
                    then({ ok: true, again: true });
                }

                this.pending.clear();
                this.onState(message);
                break;
            case "paused":
                // (Its steps stopped coming for a reason: no measure of how evenly they come)
                this.paused = message.paused === true;
                this.#last = null;
                break;
            case "refused":
                this.onRefused(message.reason);
                break;
            case "chat": {
                const text = chatLine(message.text);

                if (text && typeof message.from === "string") {
                    this.onChat({ from: message.from, name: typeof message.name === "string" ? message.name : "", text });
                }

                break;
            }
            case "unsaid":
                if (CHAT_REFUSED.includes(message.reason)) {
                    this.onUnsaid(message.reason);
                }

                break;
            default:
                break;
        }
    }

    /**
     * A line its player says to their party: to the host, which sends it on to those in it (this
     * game too, so it's heard back as everyone hears it). Returns { ok: true, pending: true }, or,
     * with nothing to say, { ok: false, reason: "empty" }.
     */
    chat(text) {
        const line = chatLine(text);

        if (!line) {
            return { ok: false, reason: "empty" };
        }

        this.send(encode({ kind: "chat", text: line }));

        return { ok: true, pending: true };
    }

    /**
     * Ask for the world again: its link to the host dropped a moment, and what was sent meanwhile
     * was lost. (Asked even if it's asked already: that ask may have been lost too.)
     */
    resync() {
        this.astray = true;
        this.send(encode({ kind: "again" }));
    }

    /** Its copy of the world, made from the welcome (Host.restore): taking the host's ways. */
    attach(host) {
        this.host = host;
        host.replaying();
    }

    /** How many of the host's steps are waiting to be played. */
    get behind() {
        return this.queue.reduce((sum, op) => sum + (op[0] === "a" ? (op[2] ?? 1) : 0), 0);
    }

    /** Ask the host how long a word takes to it and back (rtt, once its pong comes). */
    ping() {
        this.send(encode({ kind: "ping", t: this.clock() }));
    }

    // The host's sending of what's been done up to `step` heard: how unevenly they come, as RFC
    // 3550 reckons it (each one's lateness against the last, by the steps between them), and so
    // how many steps to keep in hand
    #arrived(step) {
        if (!Number.isInteger(step)) {
            return;
        }

        const at = this.clock();

        if (this.#last && step > this.#last.step) {
            const late = Math.min(PLAYOUT.late, Math.abs(at - this.#last.at - (step - this.#last.step) * STEP_MS));

            this.jitter += (late - this.jitter) / PLAYOUT.jitter;
            this.delay = Math.max(PLAYOUT.least, Math.min(PLAYOUT.most, PLAYOUT.least + Math.round((2 * this.jitter) / STEP_MS)));
        }

        this.#last = { step, at };
        this.hostStep = step;
    }

    /**
     * How fast to play the host's steps for the next `ms` of the game's time (1: as they were
     * played): a little slower while there are fewer than `delay` in hand (lately), so that
     * there are; a little faster while there are more, so that they're played sooner.
     */
    pace(ms) {
        this.held += (this.behind - this.held) * Math.min(1, ms / PLAYOUT.settle);

        return 1 + Math.max(-PLAYOUT.rate, Math.min(PLAYOUT.rate, (this.held - this.delay) * PLAYOUT.gain));
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

            // (The ways the host found doing it come just after: ready for the battle first)
            for (let k = 1; k < this.queue.length && this.queue[k][0] === "v"; ) {
                this.host.replay?.push(this.queue.splice(k, 1)[0].slice(1));
            }

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
                case "v":
                    this.host.replay?.push(this.queue.shift().slice(1));
                    break;
                case "k": {
                    const [, sum] = this.queue.shift();

                    if (!this.astray) {
                        this.checks++;

                        if (this.host.checksum() !== sum) {
                            this.#astray();
                        }
                    }

                    break;
                }
                case "m": {
                    const [, step, units] = this.queue.shift();

                    // (At another step than the host packed it at: its world's not the host's)
                    if (!this.astray) {
                        this.motionChecks++;

                        if (Math.floor(this.host.battle.time / STEP_MS) !== step || compareMotion(this.host.battle, unpackMotion(fromBase64(units))).length) {
                            this.#astray();
                        }
                    }

                    break;
                }
                default:
                    this.queue.shift();
            }
        }

        return null;
    }

    // Gone astray from the host's world: the world again
    #astray() {
        this.astray = true;
        this.desyncs++;
        this.send(encode({ kind: "again" }));
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
