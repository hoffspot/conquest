// A shadow (generated/multiplayer_scaling_plan.md 3-17): a lockstep game also sent its player's
// frames (core/viewfeed.js), and holding each to its own copy of the world. The copy plays every
// step the world does, so it's the truth to hand: whatever a frame says of a step, the copy says
// too, once it's played that step. Where they differ, what a game drawn from frames alone would
// be shown is wrong, and here it's counted while nothing depends on it yet.
//
// Each frame's taken by a mirror (core/mirror.js) and held to the copy as it stood after the
// frame's step:
//
//   values      of everyone a record tells of: where they are (to the centimetre), their
//               heading, how they're going, their health (to a 255th), whom they aim at
//   membership  everyone near the hero is known of before long, and no one far off stays known
//               (the known set's looked at every few steps and filled a few a frame, so each has
//               SHADOW.patience steps and SHADOW.slack metres of grace)
//   events      the copy's events of the step, through the table of who hears what
//               (core/eventscope.js), against the frame's: those that must be told all there, in
//               order (or within SHADOW.patience steps, when a frame was full); none there that
//               the copy didn't have
//   faults      what the mirror was told that couldn't be so; and a frame that isn't one
//   over        a frame longer than SHADOW.most bytes
//
// A frame may come before or after the copy plays its step: the copy's side of each step is kept
// (a capture) till its frame comes, and a frame till its step's played.
//
// Pure: no DOM, no network, no trigonometry.

import { Battle, STEP_MS } from "./battle.js";
import { sift } from "./eventscope.js";
import { Mirror } from "./mirror.js";
import { decodeFrame, NONE, quantised } from "./view.js";
import { KNOWN } from "./viewfeed.js";

/**
 * A shadow's allowances: `slack` metres either side of the known set's edges and `patience`
 * steps before someone missing or lingering is counted; how many steps' captures and frames are
 * `kept` waiting for the other; the longest a frame may be (`most` bytes: its budget, a frame's
 * worth of those who've come, and of events that must be told); how many differences are kept in
 * words (`lines`).
 */
export const SHADOW = Object.freeze({ slack: 16, patience: 40, kept: 60, most: 2900, lines: 20 });

/** What a shadow counts: frames taken and held to the copy, and how they differed. */
export const SHADOW_COUNTS = Object.freeze(["frames", "compared", "late", "skipped", "stale", "values", "membership", "events", "faults", "over"]);

/** Which of them are differences: a shadow that's sound has none. */
export const SHADOW_FAULTS = Object.freeze(["values", "membership", "events", "faults", "over"]);

export class Shadow {
    // The copy's side of steps whose frames haven't come (step -> capture), and frames whose
    // steps haven't been played (step -> { frame, bytes })
    #captures = new Map();

    #frames = new Map();

    // The must-events the copy's had that no frame's told yet: [{ step, text }], the oldest first
    #owed = [];

    // Since which step each has been near and not known of, or known of and far off
    #missing = new Map();

    #lingering = new Map();

    #world = null;

    #faults = 0;

    constructor() {
        /** Its mirror (null till its first frame's taken). */
        this.mirror = null;

        /** Whether its frames have begun: from the first that tells of its own hero. */
        this.live = false;

        /** What it's counted (SHADOW_COUNTS). */
        this.counts = Object.fromEntries(SHADOW_COUNTS.map((name) => [name, 0]));

        /** The first differences it found, in words (SHADOW.lines of them at the most). */
        this.lines = [];

        /** The last step its copy played. */
        this.played = -1;

        /**
         * Whether its copy's next step is its first, the copy just made of the world as it was
         * sent: what the world tells of that step may be of before the copy began (its own
         * player's joining, say), so that step's events are held to nothing.
         */
        this.fresh = false;
    }

    /** How many differences it's found, in all. */
    get differences() {
        return SHADOW_FAULTS.reduce((sum, name) => sum + this.counts[name], 0);
    }

    #say(kind, step, line) {
        this.counts[kind]++;

        if (this.lines.length < SHADOW.lines) {
            this.lines.push(`step ${step}, ${kind}: ${line}`);
        }
    }

    /** A frame come for its player (bytes): held to the copy now, if its step's been played; else kept till it is. */
    take(bytes) {
        const frame = decodeFrame(bytes);

        if (!frame) {
            this.#say("faults", this.played, `${bytes.length} bytes that aren't a frame`);

            return;
        }

        this.counts.frames++;

        // (Its frames begin with the one that tells of its own hero: anything before is from
        // before it asked, or asked again)
        if (!this.live) {
            let first;

            try {
                first = JSON.parse(frame.sections.enters ?? "[]").some(([index]) => index === 0);
            } catch {
                first = false;
            }

            if (!first) {
                this.counts.stale++;

                return;
            }

            this.live = true;
            this.mirror = null;
        }

        const capture = this.#captures.get(frame.step);

        if (capture) {
            this.#captures.delete(frame.step);
            this.#hold(capture, frame, bytes);
        } else if (frame.step <= this.played) {
            // (Its step's capture let go of already: taken, and held to nothing)
            this.counts.late++;
            this.#mirror()?.apply(bytes);
        } else {
            this.#frames.set(frame.step, { frame, bytes });

            if (this.#frames.size > SHADOW.kept) {
                const [oldest, kept] = this.#frames.entries().next().value;

                this.#frames.delete(oldest);
                this.counts.late++;
                this.#mirror()?.apply(kept.bytes);
            }
        }
    }

    #mirror() {
        if (!this.mirror && this.#world) {
            this.mirror = new Mirror(new Battle(this.#world, { seed: 1 }));
            this.#faults = 0;
        }

        return this.mirror;
    }

    /**
     * The copy's played a step: what it says of that step kept, and held to the step's frame if
     * that's come. `astray`: the copy's known to have gone astray from the world (lockstep's own
     * finding, the world on its way again), so it's the truth of nothing: its frames are taken
     * and held to nothing.
     *
     * @param {object} host - The copy (core/host.js Host), just advanced a step.
     * @param {string} me - The player's id.
     * @param {object[]} events - What that step's advance gave.
     */
    stepped(host, me, events, { astray = false } = {}) {
        const { battle } = host;
        const step = Math.floor(battle.time / STEP_MS);
        const hero = battle.actor(me);

        this.#world = battle.world;
        this.played = step;

        const kept = this.#frames.get(step);

        if (!hero || astray) {
            if (kept) {
                this.#frames.delete(step);
                this.counts.skipped++;
                this.#mirror().apply(kept.bytes);
            }

            return;
        }

        const capture = Object.assign(this.#capture(host, hero, step, events), { fresh: this.fresh });

        this.fresh = false;

        if (kept) {
            this.#frames.delete(step);
            this.#hold(capture, kept.frame, kept.bytes);
        } else {
            this.#captures.set(step, capture);

            if (this.#captures.size > SHADOW.kept) {
                this.#captures.delete(this.#captures.keys().next().value);
            }
        }
    }

    // What the copy says of a step: how everyone about the hero is (and anyone the mirror knows
    // of, wherever they are), who's near, where the hero is, the step's events, and who's a
    // player and in whose party, as they stood
    #capture(host, hero, step, events) {
        const { battle } = host;
        const values = new Map();
        const near = new Set();
        const [inner, outer] = [(KNOWN.enter - SHADOW.slack) ** 2, (KNOWN.leave + SHADOW.slack) ** 2];
        const keep = (actor) => {
            if (!values.has(actor.id)) {
                const { target, ...told } = quantised(battle, actor);

                values.set(actor.id, { ...told, target: target?.id ?? null, map: actor.map, apart: actor.map === hero.map ? (actor.x - hero.x) ** 2 + (actor.y - hero.y) ** 2 : Infinity, aims: actor.target === hero.id });
            }
        };

        for (const actor of battle.actors) {
            if (actor.map === hero.map) {
                const apart = (actor.x - hero.x) ** 2 + (actor.y - hero.y) ** 2;

                if (apart <= outer || actor.target === hero.id) {
                    keep(actor);

                    if (apart <= inner) {
                        near.add(actor.id);
                    }
                }
            } else if (actor.target === hero.id) {
                keep(actor);
            }
        }

        for (const entry of this.mirror?.known ?? []) {
            const actor = entry && battle.actor(entry.actor.id);

            if (actor) {
                keep(actor);
            }
        }

        const aimed = hero.target === null || hero.target === undefined ? null : battle.actor(hero.target);

        if (aimed) {
            keep(aimed);
        }

        const parties = new Map();

        for (const id of host.players.keys()) {
            const members = host.parties?.get(host.partyIds?.get(id))?.members;

            if (members) {
                parties.set(id, [...members]);
            }
        }

        return { step, me: hero.id, hero: { map: hero.map, x: hero.x, y: hero.y }, target: aimed?.id ?? null, values, near, outer, events, players: new Set(host.players.keys()), parties };
    }

    // A frame held to the copy's side of its step
    #hold(capture, frame, bytes) {
        const mirror = this.#mirror();
        const { step } = capture;

        // (Whom the player knew of as the step's events were sifted: before this frame's
        // newcomers, after its leavers)
        const knew = new Set();
        const left = new Set(frame.leaves);

        mirror.known.forEach((entry, index) => {
            if (entry && !left.has(index)) {
                knew.add(entry.actor.id);
            }
        });

        const heard = sift(capture.events, { id: capture.me, hero: capture.hero, knows: (id) => knew.has(id) }, { players: capture.players, partyOf: (id) => capture.parties.get(id) });

        if (!mirror.apply(bytes)) {
            this.#say("faults", step, "a frame the mirror couldn't take");

            return;
        }

        this.counts.compared++;

        for (const fault of mirror.faults.slice(this.#faults)) {
            this.#say("faults", step, fault);
        }

        this.#faults = mirror.faults.length;

        if (bytes.length > SHADOW.most) {
            this.#say("over", step, `a frame of ${bytes.length} bytes`);
        }

        this.#values(capture, frame, mirror);

        if (!capture.fresh) {
            this.#events(step, heard, mirror.events);
        }

        this.#membership(capture, mirror);
    }

    #values({ step, values }, frame, mirror) {
        for (const record of frame.records) {
            const entry = mirror.known[record.index];

            if (!entry) {
                continue;
            }

            const { id } = entry.actor;
            const truth = values.get(id);

            if (!truth) {
                this.#say("values", step, `${id} told of, whom the copy has nowhere about`);
                continue;
            }

            if (record.x !== undefined && (Math.abs(record.x - truth.x) > 1 || Math.abs(record.y - truth.y) > 1)) {
                this.#say("values", step, `${id} at ${record.x / 100}, ${record.y / 100}, and the copy has ${truth.x / 100}, ${truth.y / 100}`);
            }

            if (record.heading !== undefined && ((record.heading - truth.heading + 256) % 256) % 255 > 1) {
                this.#say("values", step, `${id} facing ${record.heading}, and the copy has ${truth.heading}`);
            }

            if (record.going !== undefined && (record.going !== truth.going || record.speed !== truth.speed)) {
                this.#say("values", step, `${id} going ${record.going} at ${record.speed}, and the copy has ${truth.going} at ${truth.speed}`);
            }

            if (record.health !== undefined && Math.abs(record.health - truth.health) > 1) {
                this.#say("values", step, `${id} with ${record.health} of its health, and the copy has ${truth.health}`);
            }

            if (record.target !== undefined) {
                const aimed = record.target === NONE ? null : (mirror.known[record.target]?.actor.id ?? null);
                const known = truth.target !== null && mirror.known.some((other) => other?.actor.id === truth.target);

                if (aimed !== (known ? truth.target : null)) {
                    this.#say("values", step, `${id} aiming at ${aimed}, and the copy has ${truth.target}${known ? "" : " (whom the player doesn't know of)"}`);
                }
            }
        }
    }

    // The frame's events against the copy's: what must be told, in order, what's owed from
    // earlier steps first; then what may be, any of the step's, in order
    #events(step, heard, told) {
        for (const event of heard.must) {
            this.#owed.push({ step, text: JSON.stringify(event) });
        }

        const may = heard.may.map((event) => JSON.stringify(event));
        let k = 0;

        for (const event of told) {
            const text = JSON.stringify(event);

            // (What's owed comes in order; one that's missing is counted when its time's up, and
            // doesn't hold up the telling of those after it)
            const owed = this.#owed.findIndex((one) => one.text === text);

            if (owed >= 0) {
                this.#owed.splice(owed, 1);
                continue;
            }

            const at = may.indexOf(text, k);

            if (at >= 0) {
                k = at + 1;
            } else {
                this.#say("events", step, `told of ${event?.type}, which the copy didn't have for this player then: ${text.slice(0, 160)}`);
            }
        }

        while (this.#owed.length && step - this.#owed[0].step > SHADOW.patience) {
            const { step: since, text } = this.#owed.shift();

            this.#say("events", step, `never told of what it must be, from step ${since}: ${text.slice(0, 160)}`);
        }
    }

    #membership({ step, values, near, outer, me, target }, mirror) {
        const known = new Set();

        for (const entry of mirror.known) {
            if (entry) {
                known.add(entry.actor.id);
            }
        }

        // (Near, and not known of for too long)
        for (const id of near) {
            if (known.has(id)) {
                this.#missing.delete(id);
            } else if (!this.#missing.has(id)) {
                this.#missing.set(id, step);
            } else if (step - this.#missing.get(id) > SHADOW.patience) {
                this.#missing.set(id, step);
                this.#say("membership", step, `${id} has been near for ${SHADOW.patience} steps and isn't known of`);
            }
        }

        for (const id of this.#missing.keys()) {
            if (!near.has(id)) {
                this.#missing.delete(id);
            }
        }

        // (Known of, far off and not pinned, for too long)
        for (const id of known) {
            const truth = values.get(id);
            const pinned = id === me || id === target || truth?.aims;

            if (pinned || (truth && truth.apart <= outer)) {
                this.#lingering.delete(id);
            } else if (!this.#lingering.has(id)) {
                this.#lingering.set(id, step);
            } else if (step - this.#lingering.get(id) > SHADOW.patience) {
                this.#lingering.set(id, step);
                this.#say("membership", step, `${id} is known of, and has been far off or gone for ${SHADOW.patience} steps`);
            }
        }

        for (const id of this.#lingering.keys()) {
            if (!known.has(id)) {
                this.#lingering.delete(id);
            }
        }
    }
}
