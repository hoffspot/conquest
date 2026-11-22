// A session in a replicated world, recorded and played again (generated/
// multiplayer_scaling_plan.md 3-32): everything a game's link to such a world took (the words
// it heard, the frames that came, as their bytes), everything its game did to it (its hello, its
// commands, its page hidden and shown, each step it played), and the time by its clock that each
// happened at. Played again in the same order with the same clock, a link (core/viewing.js) and
// its mirror come to the same world: with no server and no world played, so a change to how a
// view's bytes are read, or to what a game makes of them, shows as a difference from what the
// recording came to.
//
// A recording is plain data ({ version, net, view, events, end }): `events` in their order, each
// [time (ms), kind, what], the kinds as EVENT; `end`, what the link had come to when it was taken
// (endOf). Bytes are written as base64url text.
//
// Pure: no DOM, no network, no clock of its own.

import { STEP_MS } from "./battle.js";
import { bytesOf, textOf } from "./identity.js";
import { NET_VERSION } from "./netplay.js";
import { VIEW_VERSION } from "./view.js";
import { Viewing } from "./viewing.js";
import { decode } from "./wire.js";

/** The recording's own format. */
export const RECORDING_VERSION = 1;

/**
 * An event's kind: what came (`heard`, a word of the world's; `frame`, a frame's bytes) and
 * what its game did (`hello`, with what it came as; `ready`; `command`; `away`, its page hidden
 * or shown; `resync`, its view asked for again; `ping`; `step`, a step played, or tried).
 */
export const EVENT = Object.freeze({ heard: "h", frame: "f", hello: "o", ready: "y", command: "c", away: "a", resync: "r", ping: "p", step: "s" });

/**
 * What a link has come to, as plain data to hold another to: the step it's played to and how
 * many frames; its player; everyone its mirror knows of, by id, with their map and where they
 * are (to the centimetre) and whether they're down; the mirror's faults; how often its view
 * was told again; and how many of each kind of event its game was given to hear.
 */
export function endOf(link, heard = {}) {
    const round = (value) => Math.round(value * 100) / 100;
    const known = (link.mirror?.known ?? [])
        .filter(Boolean)
        .map(({ actor }) => ({ id: actor.id, kind: actor.kind, map: actor.map, x: round(actor.x), y: round(actor.y), dead: Boolean(actor.dead) }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return {
        me: link.me ?? null,
        played: link.played,
        frames: link.frames,
        dropped: link.dropped,
        resyncs: link.resyncs,
        faults: [...(link.mirror?.faults ?? [])],
        known,
        open: [...(link.host?.open.keys() ?? [])].sort(),
        gold: link.host?.players.get(link.me)?.progress.gold ?? null,
        heard: Object.fromEntries(Object.entries(heard).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    };
}

/**
 * A link recorded as it's used: made over it before its hello, it notes all that comes to it
 * and all its game does to it from then on (the link's own methods wrapped, each doing as it
 * did). `take()` gives the recording so far.
 */
export class Recorder {
    /**
     * @param {object} link - A replicated world's link (core/viewing.js Viewing), not yet used.
     * @param {object} options
     * @param {function} options.clock - The time (ms): the link's own clock.
     */
    constructor(link, { clock }) {
        this.link = link;
        this.clock = clock;

        /** The events so far: [time, kind, what]. */
        this.events = [];

        /** How many of each kind of event the link's game was given to hear (its steps' events). */
        this.heard = {};

        const note = (kind, what) => this.events.push(what === undefined ? [this.clock(), kind] : [this.clock(), kind, what]);
        const wrap = (name, noted) => {
            const was = link[name].bind(link);

            link[name] = (...given) => {
                noted(...given);

                return was(...given);
            };
        };

        wrap("hear", (text) => note(EVENT.heard, text));
        wrap("frame", (bytes) => note(EVENT.frame, textOf(bytes)));
        wrap("hello", (character, options = {}) => note(EVENT.hello, { character, ...(options.hero !== undefined ? { hero: options.hero } : {}) }));
        wrap("ready", () => note(EVENT.ready));
        wrap("command", (command) => note(EVENT.command, command));
        wrap("away", (hidden) => note(EVENT.away, Boolean(hidden)));
        wrap("resync", () => note(EVENT.resync));
        wrap("ping", () => note(EVENT.ping));

        const step = link.step.bind(link);

        link.step = () => {
            note(EVENT.step);

            const events = step();

            for (const event of events ?? []) {
                this.heard[event.type] = (this.heard[event.type] ?? 0) + 1;
            }

            return events;
        };
    }

    /** The recording so far, as plain data. */
    take() {
        return { version: RECORDING_VERSION, net: NET_VERSION, view: VIEW_VERSION, events: this.events.map((event) => [...event]), end: endOf(this.link, this.heard) };
    }
}

/**
 * A recording played again: a new link given everything the recorded one was, in its order, its
 * clock at each event's time. Resolves nothing and needs no world played: returns { link, heard
 * (how many of each kind of event its game was given), sent (what it said to its world, each as
 * read), results (what came of its commands, in their order), end (endOf) }.
 *
 * @param {object} recording - As Recorder.take gave it.
 * @param {object} options
 * @param {function} options.attach - Gives the link its world as it's welcomed: (link, welcome),
 *     as whoever makes a game does (link.attach(a Host of the welcome's seed, never stepped,
 *     welcome)).
 */
export function replay(recording, { attach }) {
    if (recording?.version !== RECORDING_VERSION) {
        throw new Error(`A recording of version ${recording?.version}, where ${RECORDING_VERSION} is read`);
    }

    let now = 0;
    const sent = [];
    const results = [];
    const heard = {};
    const link = new Viewing({ send: (text) => sent.push(decode(text)), clock: () => now });

    link.onWelcome = (welcome) => attach(link, welcome);

    for (const [time, kind, what] of recording.events) {
        now = time;

        switch (kind) {
            case EVENT.heard:
                link.hear(what);
                break;
            case EVENT.frame:
                link.frame(bytesOf(what));
                break;
            case EVENT.hello:
                link.hello(what.character, what.hero !== undefined ? { hero: what.hero } : {});
                break;
            case EVENT.ready:
                link.ready();
                break;
            case EVENT.command:
                link.command(what, (result) => results.push(result));
                break;
            case EVENT.away:
                link.away(what);
                break;
            case EVENT.resync:
                link.resync();
                break;
            case EVENT.ping:
                link.ping();
                break;
            case EVENT.step:
                for (const event of link.step() ?? []) {
                    heard[event.type] = (heard[event.type] ?? 0) + 1;
                }

                break;
            default:
                throw new Error(`A recording's event of a kind that isn't read: ${kind}`);
        }
    }

    return { link, heard, sent, results, end: endOf(link, heard) };
}

/** How long a recording runs (ms, by its clock), and how many of its events are frames. */
export function spanOf(recording) {
    const { events } = recording;

    return { ms: events.length ? events.at(-1)[0] - events[0][0] : 0, frames: events.filter(([, kind]) => kind === EVENT.frame).length, steps: Math.round((events.length ? events.at(-1)[0] - events[0][0] : 0) / STEP_MS) };
}
