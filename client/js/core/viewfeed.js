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

/** How the feed runs: not at all, or dark (frames made and counted, never sent). */
export const VIEW_MODES = Object.freeze(["off", "dark"]);

const RANK = Object.freeze({ pinned: 0, hostile: 1, other: 2 });

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
        let fresh = false;

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

            this.#frame(viewer, hero, step);
        }

        this.totals.steps++;
    }

    #viewer(id) {
        const viewer = { id, phase: this.#joined++ % KNOWN.every, list: [], byActor: new Map(), byIndex: new Array(KNOWN.most).fill(null), free: Array.from({ length: KNOWN.most }, (_, k) => KNOWN.most - 1 - k), leaves: [], frames: 0, bytes: 0, records: 0 };

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

    #frame(viewer, hero, step) {
        const { battle } = this.hosting.host;

        for (const entry of viewer.list) {
            entry.slot = this.state.touch(battle, entry.actor, step);
        }

        const { bytes, told } = encodeFrame(this.state, {
            step,
            origin: originFor(hero.x, hero.y),
            leaves: viewer.leaves,
            known: viewer.list,
            indexOf: (actor) => viewer.byActor.get(actor)?.index ?? NONE,
            budget: this.budget,
        });

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
    }
}
