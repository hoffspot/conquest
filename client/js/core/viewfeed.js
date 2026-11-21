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
import { ownParts, patchesText, SUMMARY, summaryOf, Told, worldParts } from "./summary.js";
import { encodeFrame, NONE, originFor, VIEW, ViewState, WHO, whoOf } from "./view.js";
import { decode } from "./wire.js";

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
 * are told, and `may` bytes at the least, and what doesn't fit is let go of, as is one that may
 * be told and is longer than `one`. One that must be told is told however long it is, in a
 * frame as long as it takes (an invasion's coming names its place, its way and its raiders: a
 * kilobyte or two, a few times an hour: a shadow's soak found them let go of). Only one past
 * `big`, which a section can't hold, is let go of, and nothing the game tells of is near that.
 */
export const EVENTS = Object.freeze({ must: 900, may: 160, one: 800, big: 60000 });

/**
 * Who's come into a player's known set is told `frame` bytes of them a frame at the most (some
 * nine), those pinned first, then the nearer: beside what the frame's budget holds, not out of
 * it, so those already known of go on being told of while a crowd comes in. No one's told how
 * someone is before they're told who.
 */
export const ENTERS = Object.freeze({ frame: 1000 });

/** How the feed runs: not at all, or dark (frames made and counted, never sent). */
export const VIEW_MODES = Object.freeze(["off", "dark", "on"]);

/** What of one of the wild's creatures a game draws it by (core/wilds.js: its `wild`): the rest is the authority's. */
export const WILD_SEEN = Object.freeze(["creature", "elite", "champion", "colossus", "worldBoss", "regalia", "companion"]);

/**
 * What someone's drawn as, where the host knows more of that than their character says (`as`,
 * told beside who they are when they come into a player's known set): one of the folk as the
 * host has them (but for their rounds, which are its own), a soldier as their town sent them,
 * a player's hero and what they wear and wield, a creature's kind. Null for anyone drawn from
 * their character alone. A game that holds a copy of the world asks its own host; one sent
 * views has only this (core/viewing.js).
 */
export function dressOf(host, actor) {
    if (actor.kind === "folk") {
        const folk = { ...host.folk?.get(actor.id) };

        delete folk.routine;

        return folk.id ? { folk } : null;
    }

    if (actor.kind === "soldier") {
        const soldier = host.soldiers?.get(actor.id);

        return soldier ? { soldier } : null;
    }

    if (actor.kind === "player") {
        const player = host.players?.get(actor.id);

        return player?.hero && player.progress?.worn ? { hero: player.hero, worn: player.progress.worn(), wielded: player.progress.wielded(), role: player.role ?? null, maxStamina: actor.maxStamina ?? null } : null;
    }

    // (A war's works out in the world: a fort's realm and kind, what a wagon carries)
    if (host.fortsOut?.has(actor.id)) {
        return { fort: host.fortsOut.get(actor.id) };
    }

    if (host.wagons?.has(actor.id)) {
        return { wagon: host.wagons.get(actor.id) };
    }

    if (actor.wild) {
        return { wild: Object.fromEntries(WILD_SEEN.filter((key) => actor.wild[key] !== undefined).map((key) => [key, actor.wild[key]])) };
    }

    return null;
}

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

        /**
         * "off" (nothing's made), or "dark" or "on" (VIEW_MODES): frames made for whoever's
         * sent them. Set by whoever runs the world; a world played from views alone is "on".
         */
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

        // The step frames were last made for (flush): one frame a step for each player
        this.flushed = -1;

        /**
         * The players whose games have asked to be sent their frames beside lockstep, to hold
         * them to their own copies (a shadow: core/shadow.js), by id. Each is sent every step's
         * frame, with nothing in it if there's nothing to say, by the hosting's `sendBinary`.
         */
        this.shadowing = new Set();
    }

    /**
     * A player's game asks to be sent its frames (`on`), or to be sent no more. Asked for, what
     * that player's been told begins again from nothing: their game knows of no one yet. Nothing
     * comes of it while the feed's off, or where the hosting can't send bytes.
     */
    shadow(id, on) {
        if (on) {
            // (Asked again while it's being sent them: again from nothing, as its game begins)
            this.shadowing.add(id);

            if (this.viewers.has(id)) {
                this.#forget(id);
            }
        } else {
            this.shadowing.delete(id);
        }
    }

    /**
     * The events of a step just played (what Host.advance gave), for the frames about to be
     * made: each player's are those the table says are theirs (core/eventscope.js). Whoever
     * plays the world's steps tells it (core/runner.js); off, nothing's kept.
     */
    heard(events) {
        if (this.mode !== "off" && events.length) {
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
        if (this.mode === "off") {
            if (this.viewers.size) {
                this.stop();
            }

            return;
        }

        // (Once a step: a hosting sends what's been done as it hears a command too, between
        // steps, and nothing of the world has changed by then that a frame tells of. What's
        // been heard of since is the next step's)
        if (step === this.flushed) {
            return;
        }

        this.flushed = step;

        const { host } = this.hosting;
        const { battle } = host;
        const world = { players: host.players, partyOf: (id) => host.parties?.get(host.partyIds?.get(id))?.members };
        const events = this.pending;
        const session = this.hosting.session ?? null;
        // (Whose link each player's is, for what the session's told them of their own: none, for
        // a player of the host's own game)
        const peers = new Map();

        for (const [peer, id] of this.hosting.session?.players ?? []) {
            peers.set(id, peer);
        }

        let fresh = false;
        let shared = null;

        this.pending = [];

        for (const id of this.viewers.keys()) {
            if (!host.players.has(id)) {
                this.#forget(id);
                this.shadowing.delete(id);
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

            // (Anyone known of who's gone from the battle since the set was last looked at leaves
            // now: nothing more can be said of them that's so)
            if (viewer.list.some((entry) => battle.actor(entry.actor.id) !== entry.actor)) {
                for (const entry of viewer.list) {
                    if (battle.actor(entry.actor.id) !== entry.actor) {
                        this.#leave(viewer, entry);
                    }
                }

                viewer.list = [...viewer.byActor.values()];
                viewer.entering = viewer.list.reduce((sum, entry) => sum + (entry.entered ? 0 : 1), 0);
            }

            // (The world's summary, for a game that's sent its frames: looked at once a second
            // for what's changed since that player was last told, the world's parts made once
            // for all of them: core/summary.js)
            viewer.peer = peers.get(id);

            if (step % SUMMARY.every === 0 && this.shadowing.has(id)) {
                shared ??= worldParts(host);
                this.#summarise(viewer, { ...shared, ...ownParts(host, id) }, step);
            } else if (session?.viewing?.has(viewer.peer) && (events.length || session.done.get(viewer.peer) !== viewer.done)) {
                // (A game played from views alone shows its player's own record as it changes,
                // not a second on: looked at whenever anything's happened, or a command of
                // theirs been done)
                this.#summarise(viewer, ownParts(host, id), null);
            }

            this.#frame(viewer, hero, step, this.#sections(viewer, hero, events, world, viewer.peer));
        }

        this.totals.steps++;
    }

    // What's changed of a player's summary since they were last told, put with what's still
    // waiting to be (the later word of an entry in place of the earlier)
    #summarise(viewer, parts, step) {
        for (const patch of viewer.told.diff(parts)) {
            viewer.patches.set(`${patch[0]}\n${patch[1]}`, patch);
        }

        if (step !== null) {
            viewer.summaryAt = step;
        }
    }

    /**
     * What a game that's to be sent views and no world is welcomed with (core/netplay.js, a
     * hello whose `mode` is "view"; the scaling plan's 3-18): { step, own (its player's record),
     * world ({ part: { key: value } }: the summary's other parts) }. From then it's sent its
     * frames, which tell what changes of either. Null if they've no hero in the battle.
     */
    welcome(id) {
        const { host } = this.hosting;
        const parts = summaryOf(host, id);

        if (!parts || !host.battle.actor(id)) {
            return null;
        }

        const step = this.hosting.step?.() ?? Math.floor(host.battle.time / 50);

        if (this.viewers.has(id)) {
            this.#forget(id);
        }

        const viewer = this.#viewer(id);

        this.shadowing.add(id);
        viewer.told.diff(parts);
        viewer.summaryAt = viewer.atTold = step;

        const { own, ...world } = parts;
        const plain = (entries) => Object.fromEntries([...entries].map(([key, value]) => [key, decode(value)]));

        return { step, own: plain(own), world: Object.fromEntries(Object.entries(world).map(([part, entries]) => [part, plain(entries)])) };
    }

    #viewer(id) {
        const viewer = { id, phase: this.#joined++ % KNOWN.every, list: [], byActor: new Map(), byIndex: new Array(KNOWN.most).fill(null), free: Array.from({ length: KNOWN.most }, (_, k) => KNOWN.most - 1 - k), leaves: [], owed: [], ids: new Set(), done: null, self: null, entering: 0, told: new Told(), patches: new Map(), summaryAt: null, atTold: null, frames: 0, bytes: 0, records: 0, events: 0, dropped: 0, enters: 0 };

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

        // (Those who've come: those pinned first, then the nearer, which is the order they're
        // told of in. `who` is what the player's been told each is, null till they are)
        const came = [...wanted].filter(([actor]) => !viewer.byActor.has(actor)).sort(([, a], [, b]) => a.rank - b.rank || a.apart - b.apart);

        for (const [actor] of came) {
            const entry = { actor, index: viewer.free.pop(), slot: -1, sent: -1, who: null, entered: false };

            viewer.byActor.set(actor, entry);
            viewer.byIndex[entry.index] = entry;
            this.known.set(actor, (this.known.get(actor) ?? 0) + 1);
        }

        viewer.list = [...viewer.byActor.values()];
        viewer.entering = 0;

        // (Anyone who's no longer who the player was told they are, their name or their map
        // changed, say: told again)
        for (const entry of viewer.list) {
            if (entry.entered && WHO.some((field) => (entry.actor[field] ?? null) !== entry.who[field])) {
                entry.entered = false;
            }

            if (!entry.entered) {
                viewer.entering++;
            }
        }
    }

    // Out of a player's known set: its index free for another once the leaving's told (the same
    // frame tells of both, those who've left first), and its slot let go of if no one knows of it
    #leave(viewer, entry, told = true) {
        viewer.byActor.delete(entry.actor);
        viewer.byIndex[entry.index] = null;
        viewer.free.push(entry.index);

        // (By the id the player was told, which is what an event names: one gone from the battle
        // is still known of till its leaving's told)
        if (entry.who) {
            viewer.ids.delete(entry.who.id);
        }

        // (Told only of one the player was ever told of)
        if (told && entry.who) {
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
        const sections = {};
        let any = false;

        if (events.length || viewer.owed.length) {
            const heard = events.length ? sift(events, { id: viewer.id, hero, knows: (id) => viewer.ids.has(id) }, world) : { must: [], may: [] };
            const told = [];
            let [size, k] = [2, 0];

            for (const event of heard.must) {
                viewer.owed.push(JSON.stringify(event));
            }

            for (; k < viewer.owed.length; k++) {
                const one = viewer.owed[k];
                const length = bytesOf(one);

                if (length > EVENTS.big) {
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

            // (Either told: and the world's time they're as of, which a look ahead begins from)
            if (sections.done !== undefined || sections.self !== undefined) {
                sections.asof = own.time;
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
        let [known, budget] = [viewer.list, this.budget];

        // (Who's come into the known set and not been told of yet: as many as a frame takes, in
        // their order, the rest next frame; only those told of have how they are told)
        if (viewer.entering) {
            const texts = [];
            const told = new Set();
            let size = 2;

            for (const entry of viewer.list) {
                if (!entry.entered) {
                    const who = whoOf(entry.actor);
                    // (And what they're drawn as, where the host has more of that than the
                    // battle does: for a game with no copy of the world to ask, dressOf)
                    const as = dressOf(this.hosting.host, entry.actor);
                    const text = JSON.stringify(as ? [entry.index, who, as] : [entry.index, who]);
                    const length = bytesOf(text) + 1;

                    if (size + length > ENTERS.frame && texts.length) {
                        break;
                    }

                    texts.push(text);
                    size += length;
                    Object.assign(entry, { who, entered: true });
                    viewer.ids.add(who.id);
                    told.add(entry.actor);
                    viewer.entering--;
                }
            }

            // (Whoever was aiming at someone the player hadn't been told of, and now has: whom
            // they're aiming at told again, now that it can be said)
            for (const entry of viewer.list) {
                if (entry.sent >= 0 && told.has(this.state.target[entry.slot])) {
                    entry.sent = Math.min(entry.sent, this.state.changed.target[entry.slot] - 1);
                }
            }

            sections.enters = `[${texts.join(",")}]`;
            budget += size + 3;
            known = viewer.entering ? viewer.list.filter((entry) => entry.entered) : viewer.list;
            viewer.enters += texts.length;
            count("views.enters", texts.length);
        }

        // (What's waiting to be told of the summary: a frame's worth, beside its budget; and
        // the step it's all been told as of, once nothing's waiting)
        if (viewer.patches.size || viewer.summaryAt !== viewer.atTold) {
            const [mine, others] = [[], []];
            let size = 0;

            for (const [key, patch] of viewer.patches) {
                const length = bytesOf(patch[2] ?? "null") + patch[0].length + patch[1].length + 8;

                if (size + length > SUMMARY.frame && size) {
                    break;
                }

                size += length;
                viewer.patches.delete(key);
                (patch[0] === "own" ? mine : others).push(patch);
            }

            const all = viewer.patches.size === 0;

            if (mine.length) {
                sections.own = `[${mine.map(([, key, value]) => `[${JSON.stringify(key)},${value ?? "null"}]`).join(",")}]`;
            }

            if (others.length || all) {
                sections.world = `{"p":${patchesText(others)}${all ? `,"at":${viewer.summaryAt}` : ""}}`;
            }

            if (all) {
                viewer.atTold = viewer.summaryAt;
            }

            budget += size + 32;
            count("views.summary", mine.length + others.length);
        }

        const frame = {
            step,
            origin: originFor(hero.x, hero.y),
            leaves: viewer.leaves,
            known,
            indexOf: (actor) => {
                const entry = viewer.byActor.get(actor);

                return entry?.entered ? entry.index : NONE;
            },
            budget,
            // (A shadow's told of every step, so it knows one had nothing for it)
            // (As is a game played from views alone: its world's time goes by its frames)
            always: this.shadowing.has(viewer.id) || Boolean(this.hosting.session?.viewing?.has(viewer.peer)),
        };
        const eventsOf = (texts) => (texts.length ? { events: `[${texts.join(",")}]` } : {});
        let made = encodeFrame(this.state, { ...frame, sections: { ...eventsOf(must), ...sections } });

        // (Those that may be told: in what the budget has left with those known of told, and
        // EVENTS.may at the least; the frame made again with them, the same records in it or,
        // where only that least was left, fewer)
        if (may.length) {
            const texts = [...must];
            let room = Math.max(EVENTS.may, budget - (made.bytes?.length ?? VIEW.header)) - (must.length ? 0 : 5);

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

        // (Dark: made, counted, and let go of; sent only to a game that's asked for its shadow)
        this.onFrame?.(viewer.id, bytes, step);

        if (viewer.peer !== undefined && this.shadowing.has(viewer.id) && this.hosting.sendBinary) {
            // (Counted first: whoever sends them may hand the bytes over, and leave none here)
            count("views.sent", bytes.length);
            this.hosting.sendBinary(viewer.peer, bytes);
        }
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

/** What a hello says its `mode` is, to be sent views and no world (core/netplay.js Session: the scaling plan's 3-18). */
export const VIEW_MODE = "view";

/** The kind a joined game asks for its shadow by: { kind: SHADOW_KIND, shadow: true or false }. */
export const SHADOW_KIND = "views";
