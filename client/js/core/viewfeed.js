// The view feed (generated/multiplayer_scaling_plan.md 3-14): for each player in a world, who
// their game knows of (their known set) and, each step, a frame of what's changed among those
// (core/view.js). It runs dark: where it's turned on (`mode`: the world server's `replication`
// setting, "dark") the frames are made, counted and let go of, so what they'd cost a world and
// each player is known before any is sent. Turned off, as it is unless it's set, nothing's made.
//
// The authority's alone, and nothing of the battle's: it reads the battle and writes nothing to
// it, so it changes no step, no checksum and no save, and lockstep goes on as it was beside it.
//
// Pure: no DOM, no network, no trigonometry.

import { sift } from "./eventscope.js";
import { interestOf } from "./interest.js";
import { count } from "./probe.js";
import { encodeFrame, NONE, originFor, VIEW, ViewState } from "./view.js";

/**
 * A player's known set: someone comes into it within `enter` metres of their hero, on its map,
 * and leaves it beyond `leave` (so no one flickers at the edge); it's looked at again every
 * `every` steps, each player on a step of their own; and holds `most` at the most. Past that,
 * those pinned stay (the hero, whom it's aiming at, whoever's aiming at it), then those hostile
 * to the hero before anyone else, the nearer first: no one a player's fighting goes unseen for
 * the crowd about them.
 */
export const KNOWN = Object.freeze({ enter: 160, leave: 192, every: 5, most: VIEW.most });

/**
 * A frame's events (core/eventscope.js): those that must be told take `must` bytes of a frame at
 * the most, in order, the rest waiting for the next (a frame is one packet: core/view.js
 * VIEW.frame); those that may be told have what the frame's budget has left once those known of
 * are told, and `may` bytes at the least, and what doesn't fit is let go of. One event's text
 * longer than `one` is let go of whichever it is: nothing the game tells of is.
 */
export const EVENTS = Object.freeze({ must: 900, may: 160, one: 800 });

/** How the feed runs: not at all, or dark (frames made and counted, never sent). */
export const VIEW_MODES = Object.freeze(["off", "dark"]);

const RANK = Object.freeze({ pinned: 0, hostile: 1, other: 2 });

// How many bytes a text takes as it's sent (UTF-8), without making them
function bytesOf(text) {
    let bytes = 0;

    for (let k = 0; k < text.length; k++) {
        const code = text.charCodeAt(k);

        if (code < 0x80) {
            bytes += 1;
        } else if (code < 0x800) {
            bytes += 2;
        } else if (code >= 0xd800 && code < 0xdc00) {
            // (Half of a pair: 4 for the two)
            bytes += 4;
            k++;
        } else {
            bytes += 3;
        }
    }

    return bytes;
}

export class ViewFeed {
    #joined = 0;

    /** @param {object} hosting - The hosting (core/netplay.js Hosting) whose world's players it makes frames for. */
    constructor(hosting) {
        this.hosting = hosting;

        /** "off" (nothing's made) or "dark" (VIEW_MODES). Set by whoever runs the world. */
        this.mode = "off";

        /** How many bytes a frame may take (core/view.js VIEW.budget unless it's set). */
        this.budget = VIEW.budget;

        /** Everyone anyone knows of, as quantised. */
        this.state = new ViewState();

        /** Each player's side of it, by their id: { id, phase, list, byActor, byIndex, free, leaves, frames, bytes, records }. */
        this.viewers = new Map();

        // How many players know of each character: one known to none has its slot let go of
        this.known = new Map();

        /** What it's made since it began: frames, their bytes and records, and the steps it's made any in. */
        this.totals = { frames: 0, bytes: 0, records: 0, steps: 0 };

        /** Told each frame as it's made (id, bytes, step), before it's let go of: for the tests, and whoever compares them later. */
        this.onFrame = null;

        // The events told of since frames were last made (heard), for the next
        this.pending = [];
    }

    /**
     * The events of a step just played (what Host.advance gave), for the frames about to be
     * made: each player's are those the table says are theirs (core/eventscope.js). Whoever
     * plays the world's steps tells it (core/runner.js); off, nothing's kept.
     */
    heard(events) {
        if (this.mode === "dark" && events.length) {
            for (const event of events) {
                this.pending.push(event);
            }
        }
    }

    /** No one's joined, so no frames are made: what's been heard is let go of. */
    idle() {
        this.pending.length = 0;
    }

    /**
     * A step's frames: every player's known set looked at again if it's their step for it, then
     * a frame made for each of what's changed among those they know of, counted, and let go of.
     */
    flush(step) {
        if (this.mode !== "dark") {
            if (this.viewers.size) {
                this.stop();
            }

            return;
        }

        const { host } = this.hosting;
        const { battle } = host;
        const world = { players: host.players, partyOf: (id) => host.parties?.get(host.partyIds?.get(id))?.members };
        const events = this.pending;
        // (Whose link each player's is, for what the session's told them of their own: none, for
        // a player of the host's own game)
        const peers = new Map();

        for (const [peer, id] of this.hosting.session?.players ?? []) {
            peers.set(id, peer);
        }

        let fresh = false;

        this.pending = [];

        for (const id of this.viewers.keys()) {
            if (!host.players.has(id)) {
                this.#forget(id);
            }
        }

        for (const id of host.players.keys()) {
            const hero = battle.actor(id);

            if (!hero) {
                continue;
            }

            const viewer = this.viewers.get(id) ?? this.#viewer(id);

            if (!viewer.list.length || (step + viewer.phase) % KNOWN.every === 0) {
                // (Where everyone stands, brought up to date once for all who look this step)
                if (!fresh) {
                    interestOf(battle).refresh(battle.actors);
                    fresh = true;
                }

                this.#look(viewer, hero);
            }

            this.#frame(viewer, hero, step, this.#sections(viewer, hero, events, world, peers.get(id)));
        }

        this.totals.steps++;
    }

    #viewer(id) {
        const viewer = { id, phase: this.#joined++ % KNOWN.every, list: [], byActor: new Map(), byIndex: new Array(KNOWN.most).fill(null), free: Array.from({ length: KNOWN.most }, (_, k) => KNOWN.most - 1 - k), leaves: [], owed: [], done: null, self: null, frames: 0, bytes: 0, records: 0, events: 0, dropped: 0 };

        this.viewers.set(id, viewer);

        return viewer;
    }

    // A player's known set looked at again: who's in it now, who's left it (told in their next
    // frame), who's come into it (everything of them told, as the budget allows)
    #look(viewer, hero) {
        const { battle } = this.hosting.host;
        const { actors } = battle;
        const wanted = new Map();
        const [enter, target] = [KNOWN.enter * KNOWN.enter, hero.target === null || hero.target === undefined ? null : battle.actor(hero.target)];

        wanted.set(hero, { rank: RANK.pinned, apart: 0 });

        if (target) {
            wanted.set(target, { rank: RANK.pinned, apart: 0 });
        }

        interestOf(battle).near(hero.map, hero.x, hero.y, KNOWN.leave, (index, apart) => {
            const actor = actors[index];

            if (wanted.has(actor)) {
                return;
            }

            if (actor.target === hero.id) {
                wanted.set(actor, { rank: RANK.pinned, apart });
            } else if (apart <= enter || viewer.byActor.has(actor)) {
                wanted.set(actor, { rank: RANK.other, apart });
            }
        });

        // (More than a game may know of: those pinned, then those hostile to the hero, then the
        // rest, the nearer first; whether each is hostile asked only now, when it matters)
        if (wanted.size > KNOWN.most) {
            const ranked = [...wanted].map(([actor, one]) => [actor, one.rank === RANK.other && battle.hostile(actor, hero) ? { ...one, rank: RANK.hostile } : one]);

            ranked.sort(([, a], [, b]) => a.rank - b.rank || a.apart - b.apart);
            wanted.clear();

            for (const [actor, one] of ranked.slice(0, KNOWN.most)) {
                wanted.set(actor, one);
            }
        }

        for (const entry of viewer.list) {
            if (!wanted.has(entry.actor)) {
                this.#leave(viewer, entry);
            }
        }

        const came = new Set();

        for (const actor of wanted.keys()) {
            if (!viewer.byActor.has(actor)) {
                const entry = { actor, index: viewer.free.pop(), slot: -1, sent: -1 };

                viewer.byActor.set(actor, entry);
                viewer.byIndex[entry.index] = entry;
                this.known.set(actor, (this.known.get(actor) ?? 0) + 1);
                came.add(actor);
            }
        }

        viewer.list = [...viewer.byActor.values()];

        // (Whoever was aiming at someone the player didn't know of, and now does: whom they're
        // aiming at told again, now that it can be said)
        if (came.size) {
            for (const entry of viewer.list) {
                if (entry.slot >= 0 && entry.sent >= 0 && came.has(this.state.target[entry.slot])) {
                    entry.sent = Math.min(entry.sent, this.state.changed.target[entry.slot] - 1);
                }
            }
        }
    }

    // Out of a player's known set: its index free for another once the leaving's told (the same
    // frame tells of both, those who've left first), and its slot let go of if no one knows of it
    #leave(viewer, entry, told = true) {
        viewer.byActor.delete(entry.actor);
        viewer.byIndex[entry.index] = null;
        viewer.free.push(entry.index);

        if (told) {
            viewer.leaves.push(entry.index);
        }

        const left = this.known.get(entry.actor) - 1;

        if (left > 0) {
            this.known.set(entry.actor, left);
        } else {
            this.known.delete(entry.actor);
            this.state.release(entry.actor);
        }
    }

    // What else a player's told this step: the events that are theirs to hear (those that must
    // be told first, what was owed from before among them; then those that may, while there's
    // room), the last of their commands done and their hero's own state, as the session last
    // told their game of them, when either's changed. Null with none of it
    #sections(viewer, hero, events, world, peer) {
        const { battle } = this.hosting.host;
        const sections = {};
        let any = false;

        if (events.length || viewer.owed.length) {
            const heard = events.length ? sift(events, { id: viewer.id, hero, knows: (id) => viewer.byActor.has(battle.actor(id)) }, world) : { must: [], may: [] };
            const told = [];
            let [size, k] = [2, 0];

            for (const event of heard.must) {
                viewer.owed.push(JSON.stringify(event));
            }

            for (; k < viewer.owed.length; k++) {
                const one = viewer.owed[k];
                const length = bytesOf(one);

                if (length > EVENTS.one) {
                    viewer.dropped++;
                    count("views.dropped");
                } else if (size + length + 1 <= EVENTS.must || !told.length) {
                    told.push(one);
                    size += length + 1;
                } else {
                    break;
                }
            }

            viewer.owed.splice(0, k);

            // (Those that may be told wait on the frame: how much room it has is known once
            // those known of are told, #frame)
            if (told.length || heard.may.length) {
                sections.must = told;
                sections.may = heard.may;
                any = true;
            }
        }

        const own = peer === undefined ? null : this.hosting.session.toldSelf?.get(peer);

        if (own) {
            if (own.seq !== viewer.done) {
                sections.done = viewer.done = own.seq;
                any = true;
            }

            if (own.hero !== viewer.self) {
                sections.self = viewer.self = own.hero;
                any = true;
            }
        }

        return any ? sections : null;
    }

    #frame(viewer, hero, step, given = null) {
        const { battle } = this.hosting.host;

        for (const entry of viewer.list) {
            entry.slot = this.state.touch(battle, entry.actor, step);
        }

        const { must = [], may = [], ...sections } = given ?? {};
        const frame = {
            step,
            origin: originFor(hero.x, hero.y),
            leaves: viewer.leaves,
            known: viewer.list,
            indexOf: (actor) => viewer.byActor.get(actor)?.index ?? NONE,
            budget: this.budget,
        };
        const eventsOf = (texts) => (texts.length ? { events: `[${texts.join(",")}]` } : {});
        let made = encodeFrame(this.state, { ...frame, sections: { ...eventsOf(must), ...sections } });

        // (Those that may be told: in what the budget has left with those known of told, and
        // EVENTS.may at the least; the frame made again with them, the same records in it or,
        // where only that least was left, fewer)
        if (may.length) {
            const texts = [...must];
            let room = Math.max(EVENTS.may, this.budget - (made.bytes?.length ?? VIEW.header)) - (must.length ? 0 : 5);

            for (const event of may) {
                const one = JSON.stringify(event);
                const length = bytesOf(one) + 1;

                if (length <= room && length <= EVENTS.one) {
                    texts.push(one);
                    room -= length;
                } else {
                    viewer.dropped++;
                    count("views.dropped");
                }
            }

            if (texts.length > must.length) {
                made = encodeFrame(this.state, { ...frame, sections: { ...eventsOf(texts), ...sections } });
            }

            viewer.events += texts.length - must.length;
            count("views.events", texts.length - must.length);
        }

        if (must.length) {
            viewer.events += must.length;
            count("views.events", must.length);
        }

        const { bytes, told } = made;

        count("views.known", viewer.list.length);

        if (!bytes) {
            return;
        }

        for (const index of told) {
            viewer.byIndex[index].sent = step;
        }

        viewer.leaves = [];
        viewer.frames++;
        viewer.bytes += bytes.length;
        viewer.records += told.length;
        this.totals.frames++;
        this.totals.bytes += bytes.length;
        this.totals.records += told.length;
        count("views.frames");
        count("views.bytes", bytes.length);
        count("views.records", told.length);

        // (Dark: made, counted, and let go of; nothing's sent)
        this.onFrame?.(viewer.id, bytes, step);
    }

    // A player gone from the world: everything of theirs let go of
    #forget(id) {
        const viewer = this.viewers.get(id);

        for (const entry of viewer.list) {
            this.#leave(viewer, entry, false);
        }

        this.viewers.delete(id);
    }

    /** Everything let go of: every player's known set, and everyone quantised. */
    stop() {
        for (const id of [...this.viewers.keys()]) {
            this.#forget(id);
        }

        this.state = new ViewState();
        this.pending = [];
    }
}
