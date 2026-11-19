// The mirror (generated/multiplayer_scaling_plan.md 3-16): what a game holds of a world it's
// sent views of. It plays no steps: it's told, a frame at a time (core/view.js), who's come into
// its player's sight and gone out of it, how each of them is, the events that are its player's to
// hear and its own hero's state, and keeps just that.
//
// Those it knows of are characters of a real Battle that's never stepped, added as they're told
// of and taken out as they leave, so whatever reads a battle's characters reads these. Each has
// a ring of where it's lately been told it was, to be drawn from a little behind the world
// (RING.delay), between two tellings and not at the latest, so it moves evenly however the
// frames come.
//
// A character here has only what the wire's said of it (WIRED): its own state as the authority
// alone keeps it (whom it's angry at, its way, when it may strike again) is never sent, and is
// here as a character just made has it. `strict` has reading any of that throw, for the tests:
// what a game drawn from frames reads of others must be something they're told.
//
// Not loaded by the game yet. Pure: no DOM, no network, no trigonometry.

import { TAU } from "./exact.js";
import { readPatches, Summary } from "./summary.js";
import { decodeFrame, GOING, NONE, VIEW, WHO } from "./view.js";

/**
 * A character's ring: how many tellings of where it was are kept, and how far behind the world
 * it's drawn (ms, the world's time). Past the latest telling it stands where that was: carrying
 * it on the way it was going is for the slice that draws from this (3-19).
 */
export const RING = Object.freeze({ kept: 8, delay: 100 });

/** What of a character the wire says: who it is (core/view.js WHO), and how it is, from its records. */
export const WIRED = Object.freeze([...WHO, "x", "y", "facing", "running", "dead", "hp", "target"]);

const wired = new Set(WIRED);

// A character as the tests are let read it: only what the wire's said
const STRICT = {
    get(actor, key) {
        if (typeof key === "symbol" || wired.has(key)) {
            return actor[key];
        }

        throw new Error(`A mirror's character was read for "${key}", which the wire never says (core/mirror.js WIRED).`);
    },
};

/** Where a character's been told it was, lately: at(time) is where to draw it. */
export class Ring {
    // [{ time, x, y, heading }], the oldest first
    #told = [];

    /** Told where it is as of `time` (ms, the world's): x, y (m), heading (a 256th of a turn). */
    push(time, x, y, heading) {
        const last = this.#told.at(-1);

        // (Told again for the same time, or an earlier: the later telling stands)
        if (last && time <= last.time) {
            Object.assign(last, { x, y, heading });

            return;
        }

        this.#told.push({ time, x, y, heading });

        if (this.#told.length > RING.kept) {
            this.#told.shift();
        }
    }

    /** How many tellings it holds. */
    get length() {
        return this.#told.length;
    }

    /**
     * Where it's drawn at `time`: between the two tellings either side of it; before the first,
     * there; past the last, where it was last told. Null if it's never been told where it is.
     * The heading turns the short way round.
     */
    at(time) {
        const told = this.#told;

        if (!told.length) {
            return null;
        }

        if (time <= told[0].time) {
            return { x: told[0].x, y: told[0].y, heading: told[0].heading };
        }

        for (let k = 1; k < told.length; k++) {
            const [a, b] = [told[k - 1], told[k]];

            if (time <= b.time) {
                const share = (time - a.time) / (b.time - a.time);
                const turn = ((b.heading - a.heading + 384) % 256) - 128;

                return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, heading: (((a.heading + turn * share) % 256) + 256) % 256 };
            }
        }

        const last = told.at(-1);

        return { x: last.x, y: last.y, heading: last.heading };
    }
}

export class Mirror {
    /**
     * @param {object} battle - A battle of its world with no one in it (core/battle.js Battle),
     *     never stepped: those it's told of are added to it.
     * @param {object} [options]
     * @param {boolean} [options.strict] - Whether `actor(index)` gives a character that throws
     *     when read for what the wire never says (the tests').
     * @param {number} [options.stepMs] - How long a step of the world is (ms).
     */
    constructor(battle, { strict = false, stepMs = 50 } = {}) {
        this.battle = battle;
        this.strict = strict;
        this.stepMs = stepMs;

        /** Those it knows of, by their index: { actor, who, ring, heading, going, speed, health, target (an index, or NONE) }, or null. */
        this.known = new Array(VIEW.most).fill(null);

        /** The step of the last frame it took, and that frame's origin. */
        this.step = -1;
        this.origin = null;

        /** The last of its player's commands done, and their hero's own state, as last told (null till they are). */
        this.done = null;
        this.self = null;

        /**
         * What it's been told of the world beside those it knows of (core/summary.js): its own
         * player's record (the part "own") and the world's summary, each patch taken as it
         * comes; `summary.at` is the step the world last said it had told everything as of.
         */
        this.summary = new Summary();

        /** The events of the last frame it took, and how many it's been told in all. */
        this.events = [];
        this.heard = 0;

        /** What it was told that couldn't be so (a record for no one it knows of, say): each a line. None, if the feed and it agree. */
        this.faults = [];

        /** How many frames it's taken. */
        this.frames = 0;
    }

    /**
     * A frame taken: those who've left taken out, those who've come added, how each is set on
     * them, and what else it says kept. Returns the frame as read, or null for bytes that aren't
     * one (nothing's changed by those).
     */
    apply(bytes) {
        const frame = decodeFrame(bytes);

        if (!frame) {
            return null;
        }

        const time = frame.step * this.stepMs;
        let enters;
        let events;
        let own;
        let world;

        try {
            enters = frame.sections.enters === undefined ? [] : JSON.parse(frame.sections.enters);
            events = frame.sections.events === undefined ? [] : JSON.parse(frame.sections.events);
            own = frame.sections.own === undefined ? [] : readPatches(frame.sections.own);
            world = frame.sections.world === undefined ? null : readPatches(frame.sections.world);
        } catch {
            return null;
        }

        for (const index of frame.leaves) {
            this.#leave(index);
        }

        for (const [index, who] of enters) {
            this.#enter(index, who);
        }

        for (const record of frame.records) {
            this.#record(record, time);
        }

        if (frame.sections.done !== undefined) {
            this.done = frame.sections.done;
        }

        if (frame.sections.self !== undefined) {
            try {
                this.self = JSON.parse(frame.sections.self);
            } catch {
                this.faults.push(`step ${frame.step}: its own state wasn't to be read`);
            }
        }

        this.summary.take(own.map(([key, value]) => ["own", key, value]));

        if (world) {
            this.summary.take(world.p ?? []);

            if (Number.isInteger(world.at)) {
                this.summary.at = world.at;
            }
        }

        this.events = events;
        this.heard += events.length;
        this.step = frame.step;
        this.origin = frame.origin;
        this.frames++;

        return frame;
    }

    #leave(index) {
        const entry = this.known[index];

        if (!entry) {
            this.faults.push(`${index} left, and wasn't known of`);

            return;
        }

        this.battle.remove(entry.actor.id);
        this.known[index] = null;

        // (Whoever was aiming at them aims at no one it knows of)
        for (const other of this.known) {
            if (other?.target === index) {
                other.target = NONE;
                other.actor.target = null;
            }
        }
    }

    #enter(index, who) {
        const entry = this.known[index];

        // (Told again who someone it knows of is: what's changed of them set)
        if (entry) {
            if (entry.who.id !== who.id) {
                this.faults.push(`${index} is ${who.id}, and was ${entry.who.id} who never left`);
            }

            Object.assign(entry.actor, who);
            entry.who = who;

            return;
        }

        const actor = this.battle.add({ id: who.id, kind: who.kind, name: who.name, weapon: who.weapon ?? undefined, boots: who.boots ?? undefined, team: who.team, map: who.map, square: [0, 0], neutral: who.neutral ?? undefined, role: who.role ?? undefined, side: who.side ?? undefined });

        Object.assign(actor, who);
        this.known[index] = { actor, who, ring: new Ring(), heading: 0, going: 0, speed: 0, health: 0, target: NONE };
    }

    #record({ index, ...told }, time) {
        const entry = this.known[index];

        if (!entry) {
            this.faults.push(`a record for ${index}, who isn't known of`);

            return;
        }

        const { actor } = entry;

        if (told.heading !== undefined) {
            entry.heading = told.heading;
            actor.facing = (told.heading * TAU) / 256;
        }

        if (told.x !== undefined) {
            actor.x = told.x / 100;
            actor.y = told.y / 100;
        }

        if (told.x !== undefined || told.heading !== undefined) {
            entry.ring.push(time, actor.x, actor.y, entry.heading);
        }

        if (told.going !== undefined) {
            entry.going = told.going;
            entry.speed = told.speed;
            actor.running = Boolean(told.going & GOING.running);
            actor.dead = Boolean(told.going & GOING.dead);
        }

        if (told.health !== undefined) {
            entry.health = told.health;
            actor.hp = told.health === 255 ? actor.maxHp : (told.health / 255) * actor.maxHp;
        }

        if (told.target !== undefined) {
            entry.target = told.target;
            actor.target = told.target === NONE ? null : (this.known[told.target]?.actor.id ?? null);

            if (told.target !== NONE && !this.known[told.target]) {
                this.faults.push(`${index} aims at ${told.target}, who isn't known of`);
            }
        }
    }

    /**
     * Begun from a welcome with no world in it (core/viewfeed.js welcome: { own, world }): its
     * summary as it stood then, to be kept up by its frames.
     */
    welcome({ step, own = {}, world = {} }) {
        this.summary = new Summary();
        this.summary.take(Object.entries(own).map(([key, value]) => ["own", key, value]));

        for (const [part, entries] of Object.entries(world)) {
            this.summary.take(Object.entries(entries).map(([key, value]) => [part, key, value]));
        }

        this.summary.at = step ?? null;
    }

    /** How many it knows of. */
    get size() {
        return this.known.reduce((sum, entry) => sum + (entry ? 1 : 0), 0);
    }

    /** The character at an index (null if there's none): as it is, or, strict, readable only for what the wire says. */
    actor(index) {
        const entry = this.known[index];

        return !entry ? null : this.strict ? new Proxy(entry.actor, STRICT) : entry.actor;
    }

    /**
     * Where to draw the character at an index at `time` (ms, the world's): RING.delay behind it,
     * between the tellings either side. { x, y, heading }, or null if it's not known of or has
     * never been told where it is.
     */
    where(index, time) {
        return this.known[index]?.ring.at(time - RING.delay) ?? null;
    }
}
