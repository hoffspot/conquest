// A view's frames (generated/multiplayer_scaling_plan.md 3-13): how a world tells one player's
// game where those near its hero are and how they're doing, in bytes, a little each step. This
// is the wire and nothing more: the quantisers (a place to the centimetre, a facing to a 256th of
// a turn, health to a 255th), what's kept of each character as it's quantised (ViewState), and a
// frame's encoder and decoder. Nothing uses it yet: who a player knows of, and when a frame's
// made and sent, come with the feed (3-14 onward).
//
// A frame, little-endian:
//
//   version  uint8    VIEW_VERSION: what the rest holds (never 0: server/play.js BINARY.echo)
//   step     uint32   the world's step it was made in
//   ox, oy   int16    the frame's origin, in squares of VIEW.origin metres
//   leaves   uint16   how many have left the player's known set, then each one's index (uint8)
//   records  uint16   how many records follow
//   ...               then the records; then any sections, to the frame's end (below)
//
// A record tells of one character the player knows of, by its index among them (0-255: the
// player's known set, never the battle's list), and only what's changed since that player was
// last told of it:
//
//   index    uint8
//   mask     uint8    which of these follow, in this order (FIELD)
//   place    uint16 x, y: centimetres from the frame's origin; or, with FIELD.far, int32 x, y:
//            centimetres from the map's own nought (someone too far off for the first)
//   heading  uint8    a 256th of a turn
//   going    uint8 flags (GOING), uint8 speed (5 cm/s each)
//   health   uint8    a 255th of its most; 0 only when it has none
//   target   uint8    its target's index among those the player knows of (NONE: none, or unknown)
//
// FIELD.placed adds nothing after it: it says the place in this record is one the character was
// set at (carried to a town, come through a door), not one it walked to.
//
// A section is what else a player's told in a step, each at most once a frame, in this order:
//
//   tag      uint8    SECTION: events, done, self, enters, own, world or asof
//   length   uint16   how many bytes follow
//   ...               events: the step's events that are this player's to hear, as JSON text
//                     (an array; core/eventscope.js says whose each is). done: uint32, the last
//                     of the player's commands the world has done. self: what the player alone
//                     knows of their hero (core/selfstate.js selfOf), as JSON text. enters:
//                     who's come into the player's known set, as JSON text: [[index, who], ...]
//                     (whoOf: who each is, where a record says only how they are).
//                     Whoever reads a frame takes its leaves first, then its enters, then its
//                     records, wherever each lies in it. own, world: what's changed of the
//                     player's own record, and of the world's summary (core/summary.js), as JSON
//                     text: own [[field, value or null]], world { p: [[part, key, value or
//                     null]], at: the step everything was told as of (where it's all been) }
//
// A place is where it is, never how far it's moved: a record means the same whatever was sent
// before it, so one that's dropped, or never sent to a player who came late, is made up for by
// the next and by nothing else. A walker's record is 6 bytes, 7 as it turns.
//
// Pure: no DOM, no network, no trigonometry.

import { shareOf } from "./afflictions.js";
import { TAU } from "./exact.js";

/**
 * What a frame holds: its first byte. It moves only when a frame's bytes do, never with
 * NET_VERSION (contribution.md, section 3, the version numbers).
 */
export const VIEW_VERSION = 4;

/**
 * A frame's origin is a corner of a square of `origin` metres, `lead` metres south-west of the
 * player's hero (originFor), so everyone within 192 m of the hero is within a uint16 of
 * centimetres of it (655 m). A frame is `frame` bytes at the most, whatever it's asked to hold
 * (one packet); `budget` is what one's given when nothing else is said (20 a second: 12.8 KB/s);
 * a player knows of `most` at the most (a record's index is a byte); `header` is what a frame
 * takes before its leaves and records.
 */
export const VIEW = Object.freeze({ origin: 64, lead: 320, frame: 1500, budget: 640, most: 256, header: 13 });

/** A record's mask: which fields follow. */
export const FIELD = Object.freeze({ place: 1, heading: 2, going: 4, health: 8, target: 16, far: 32, placed: 64 });

/**
 * How far a character goes in a step before it's been placed, not walked (cm, along either axis:
 * none is so fast): a record of where it is then says so (FIELD.placed), so no one draws it
 * sliding there (core/mirror.js).
 */
export const PLACED = 300;

/** How a character's going, as flags. */
export const GOING = Object.freeze({ moving: 1, running: 2, fighting: 4, dead: 8 });

/** A frame's sections, by tag: what else a player's told beside those they know of. */
export const SECTION = Object.freeze({ events: 1, done: 2, self: 3, enters: 4, own: 5, world: 6, asof: 7 });

const TEXTS = Object.freeze({ [SECTION.events]: "events", [SECTION.self]: "self", [SECTION.enters]: "enters", [SECTION.own]: "own", [SECTION.world]: "world", [SECTION.asof]: "asof" });

const TAGS = new Set(Object.values(SECTION));
const utf8 = new TextEncoder();
const text = new TextDecoder("utf-8", { fatal: true });

/**
 * Who a character is, as a player's told when it comes into their known set: what of it a
 * record never says and seldom changes. Told again, for the same index, if any of it does.
 */
export const WHO = Object.freeze(["id", "kind", "name", "team", "map", "weapon", "boots", "neutral", "role", "side", "maxHp"]);

/** A character's WHO, as it's told: { id, kind, ... }. */
export function whoOf(actor) {
    const who = {};

    for (const field of WHO) {
        who[field] = actor[field] ?? null;
    }

    return who;
}

/** A target that's no one, or no one the player knows of. */
export const NONE = 255;

/** Metres as whole centimetres. */
export const cmOf = (metres) => Math.round(metres * 100);

/** A facing (radians) as a 256th of a turn, 0-255. */
export const turnOf = (facing) => Math.round((facing * 256) / TAU) & 255;

/** A speed (m/s) in steps of 5 cm/s, 0-255 (12.75 m/s at the most). */
export const speedOf = (speed) => Math.max(0, Math.min(255, Math.round(speed * 20)));

/** Health as a 255th of its most: 0 only with none left (or no most), 255 only when whole or over. */
export function healthOf(hp, most) {
    if (!(hp > 0) || !(most > 0)) {
        return 0;
    }

    return hp >= most ? 255 : Math.max(1, Math.min(254, Math.round((hp / most) * 255)));
}

/** The origin of a frame for a hero standing at a spot (m): [ox, oy], squares of VIEW.origin metres. */
export const originFor = (x, y) => [Math.floor((x - VIEW.lead) / VIEW.origin), Math.floor((y - VIEW.lead) / VIEW.origin)];

const CHANGES = ["place", "heading", "going", "health", "target", "placed"];

/**
 * How a character is, as a record says it: { x, y (cm), heading, going, speed, health, target
 * (the character it's aiming at, or null) }. What the authority tells and what a copy of the
 * same world at the same step would tell, so the one can be held to the other (core/shadow.js).
 */
export function quantised(battle, actor) {
    const moving = actor.progress !== null && !actor.dead;
    const fighting = Boolean(actor.attack) || actor.target !== null || actor.order?.type === "engage";

    return {
        x: cmOf(actor.x),
        y: cmOf(actor.y),
        heading: turnOf(actor.facing),
        going: (moving ? GOING.moving : 0) | (actor.running ? GOING.running : 0) | (fighting ? GOING.fighting : 0) | (actor.dead ? GOING.dead : 0),
        speed: moving ? speedOf(actor.pace * shareOf(actor, "speed")) : 0,
        health: actor.dead ? 0 : healthOf(actor.hp, actor.maxHp),
        target: actor.target === null || actor.target === undefined ? null : (battle.actor(actor.target) ?? null),
    };
}

/**
 * What's kept of each character as it's quantised, in typed arrays by slot: a character's slot
 * is its own for as long as it's kept (slotOf), and each field's `changed` says the step it last
 * came out different. A character's quantised once a step however many players know of it
 * (touch), and only those someone knows of are: no one goes through everyone.
 */
export class ViewState {
    #slots = new WeakMap();

    #free = [];

    #next = 0;

    constructor(room = 256) {
        this.#make(room);
    }

    #make(room) {
        const grown = (Kind, old) => {
            const made = new Kind(room);

            if (old) {
                made.set(old);
            }

            return made;
        };

        /** Where each is (cm, from its map's nought), which way it faces, how it's going, how fast, its health. */
        this.x = grown(Int32Array, this.x);
        this.y = grown(Int32Array, this.y);
        this.heading = grown(Uint8Array, this.heading);
        this.going = grown(Uint8Array, this.going);
        this.speed = grown(Uint8Array, this.speed);
        this.health = grown(Uint8Array, this.health);

        /**
         * Whom each is aiming at (the character itself, or null), by slot: who that is among
         * those a player knows of is for whoever makes that player's frame (encodeFrame indexOf).
         * Kept as it is, not as a slot: no one's given a slot for being aimed at.
         */
        this.target ??= [];

        // (The step each was last quantised in, and 1 more: 0 is never)
        this.seen = grown(Uint32Array, this.seen);

        /** The step each field last changed in, by slot: { place, heading, going, health, target }. */
        this.changed = Object.fromEntries(CHANGES.map((field) => [field, grown(Uint32Array, this.changed?.[field])]));
        this.room = room;
    }

    /** How many slots are taken. */
    get size() {
        return this.#next - this.#free.length;
    }

    /** A character's slot, or -1 if it has none. */
    slotOf(actor) {
        return this.#slots.get(actor) ?? -1;
    }

    // A character's slot, given one if it had none: everything of it changed as of this step,
    // so whoever comes to know of it is told all of it
    #slot(actor, step) {
        let slot = this.#slots.get(actor);

        if (slot === undefined) {
            slot = this.#free.length ? this.#free.pop() : this.#next++;

            if (slot >= this.room) {
                this.#make(this.room * 2);
            }

            this.#slots.set(actor, slot);
            this.seen[slot] = 0;
            this.target[slot] = null;

            for (const field of CHANGES) {
                this.changed[field][slot] = step;
            }
        }

        return slot;
    }

    /**
     * A character as it stands in this step, quantised: once a step (asked again in the same
     * step, nothing's read), each field that's come out different marked changed as of it.
     * Returns its slot. `battle` is asked who its target is (battle.actor(id)).
     */
    touch(battle, actor, step) {
        const slot = this.#slot(actor, step);

        if (this.seen[slot] === step + 1) {
            return slot;
        }

        const first = this.seen[slot] === 0;
        const { x, y, heading, going, speed, health, target } = quantised(battle, actor);

        if (first || this.x[slot] !== x || this.y[slot] !== y) {
            // (Further than anyone goes in the steps since it was last looked at: set there)
            const reach = PLACED * Math.max(1, step + 1 - this.seen[slot]);

            if (!first && (Math.abs(x - this.x[slot]) > reach || Math.abs(y - this.y[slot]) > reach)) {
                this.changed.placed[slot] = step;
            }

            this.x[slot] = x;
            this.y[slot] = y;
            this.changed.place[slot] = step;
        }

        if (first || this.heading[slot] !== heading) {
            this.heading[slot] = heading;
            this.changed.heading[slot] = step;
        }

        if (first || this.going[slot] !== going || this.speed[slot] !== speed) {
            this.going[slot] = going;
            this.speed[slot] = speed;
            this.changed.going[slot] = step;
        }

        if (first || this.health[slot] !== health) {
            this.health[slot] = health;
            this.changed.health[slot] = step;
        }

        if (first || this.target[slot] !== target) {
            this.target[slot] = target;
            this.changed.target[slot] = step;
        }

        this.seen[slot] = step + 1;

        return slot;
    }

    /** A character let go of (gone from the battle, or known to no one): its slot's free for another. */
    release(actor) {
        const slot = this.#slots.get(actor);

        if (slot !== undefined) {
            this.#slots.delete(actor);
            this.#free.push(slot);
            this.target[slot] = null;
        }
    }
}

// How many bytes a record with this mask takes
function sizeOf(mask) {
    return 2 + (mask & FIELD.place ? (mask & FIELD.far ? 8 : 4) : 0) + (mask & FIELD.heading ? 1 : 0) + (mask & FIELD.going ? 2 : 0) + (mask & FIELD.health ? 1 : 0) + (mask & FIELD.target ? 1 : 0);
}

/**
 * A frame for one player: the bytes, and which of those asked for it tells of.
 *
 * @param {ViewState} state - Everyone as quantised (each one asked for touched this step).
 * @param {object} frame
 * @param {number} frame.step - The world's step.
 * @param {number[]} frame.origin - [ox, oy] (originFor the player's hero).
 * @param {number[]} [frame.leaves] - The indexes of those who've left the player's known set.
 *     Always told, whatever the budget.
 * @param {{ index: number, slot: number, sent: number }[]} [frame.known] - Those the player
 *     knows of: each one's index among them, its slot, and the step it was last told of in (-1:
 *     never). Only what's changed since then is told.
 * @param {(actor: object) => number} [frame.indexOf] - A character's index among those the
 *     player knows of (NONE if it isn't one): for targets.
 * @param {number} [frame.budget] - How many bytes it may take (no more than VIEW.frame). With
 *     more to tell than fits, those longest untold go first (then by index), and the rest wait:
 *     no one who's changing is left out for good.
 * @param {{ events?: string, done?: number, self?: string, enters?: string }} [frame.sections] -
 *     What else to tell: the events' JSON text, the last command done, the hero's own state's
 *     JSON text, who's come into the known set (JSON text).
 *     Always told, whatever the budget (whoever gives them keeps them within a frame); the
 *     records have what room they leave.
 * @param {boolean} [frame.always] - A frame even with nothing to tell (its 13 bytes: the step
 *     alone), for a game that's to know a step had nothing for it (a shadow: core/shadow.js).
 * @returns {{ bytes: Uint8Array | null, told: number[] }} `bytes` is null with nothing to tell
 *     (no frame's sent: a town standing still costs nothing); `told` is the indexes it tells of,
 *     whose `sent` is now this step.
 */
export function encodeFrame(state, { step, origin, leaves = [], known = [], indexOf = () => NONE, budget = VIEW.budget, sections = null, always = false }) {
    // (The sections, as bytes, in their order: each its tag, its length and what it holds)
    const extra = [];

    if (sections?.events !== undefined) {
        extra.push([SECTION.events, utf8.encode(sections.events)]);
    }

    if (sections?.done !== undefined) {
        const done = new Uint8Array(4);

        new DataView(done.buffer).setUint32(0, sections.done, true);
        extra.push([SECTION.done, done]);
    }

    if (sections?.self !== undefined) {
        extra.push([SECTION.self, utf8.encode(sections.self)]);
    }

    if (sections?.enters !== undefined) {
        extra.push([SECTION.enters, utf8.encode(sections.enters)]);
    }

    if (sections?.own !== undefined) {
        extra.push([SECTION.own, utf8.encode(sections.own)]);
    }

    if (sections?.world !== undefined) {
        extra.push([SECTION.world, utf8.encode(sections.world)]);
    }

    // (The world's time `done` and `self` are as of, ms, as text: a frame says them a flush
    // after the player's game was told, so it's not the frame's own)
    if (sections?.asof !== undefined) {
        extra.push([SECTION.asof, utf8.encode(String(sections.asof))]);
    }

    const more = extra.reduce((sum, [, bytes]) => sum + 3 + bytes.length, 0);
    const room = Math.min(budget, VIEW.frame) - more;
    const [ox, oy] = origin;
    const [baseX, baseY] = [ox * VIEW.origin * 100, oy * VIEW.origin * 100];
    const due = [];

    for (const { index, slot, sent } of known) {
        let mask = 0;

        for (const field of CHANGES) {
            if (state.changed[field][slot] > sent) {
                mask |= FIELD[field];
            }
        }

        // (Placed is said of a place, and only with one)
        if (!(mask & FIELD.place)) {
            mask &= ~FIELD.placed;
        }

        if (mask & FIELD.place) {
            const [dx, dy] = [state.x[slot] - baseX, state.y[slot] - baseY];

            if (dx < 0 || dx > 65535 || dy < 0 || dy > 65535) {
                mask |= FIELD.far;
            }
        }

        if (mask) {
            due.push({ index, slot, sent, mask, size: sizeOf(mask) });
        }
    }

    if (!due.length && !leaves.length && !extra.length && !always) {
        return { bytes: null, told: [] };
    }

    // (Those longest untold first; the same order wherever it's made)
    due.sort((a, b) => a.sent - b.sent || a.index - b.index);

    let length = VIEW.header + leaves.length;
    const chosen = [];

    for (const one of due) {
        if (length + one.size <= room) {
            chosen.push(one);
            length += one.size;
        }
    }

    // (Nothing fits, and no one's left: nothing to say this step)
    if (!chosen.length && !leaves.length && !extra.length && !always) {
        return { bytes: null, told: [] };
    }

    const bytes = new Uint8Array(length + more);
    const view = new DataView(bytes.buffer);
    let at = 0;

    view.setUint8(at, VIEW_VERSION);
    view.setUint32(at + 1, step, true);
    view.setInt16(at + 5, ox, true);
    view.setInt16(at + 7, oy, true);
    view.setUint16(at + 9, leaves.length, true);
    at += 11;

    for (const index of leaves) {
        view.setUint8(at++, index);
    }

    view.setUint16(at, chosen.length, true);
    at += 2;

    for (const { index, slot, mask } of chosen) {
        view.setUint8(at++, index);
        view.setUint8(at++, mask);

        if (mask & FIELD.far) {
            view.setInt32(at, state.x[slot], true);
            view.setInt32(at + 4, state.y[slot], true);
            at += 8;
        } else if (mask & FIELD.place) {
            view.setUint16(at, state.x[slot] - baseX, true);
            view.setUint16(at + 2, state.y[slot] - baseY, true);
            at += 4;
        }

        if (mask & FIELD.heading) {
            view.setUint8(at++, state.heading[slot]);
        }

        if (mask & FIELD.going) {
            view.setUint8(at++, state.going[slot]);
            view.setUint8(at++, state.speed[slot]);
        }

        if (mask & FIELD.health) {
            view.setUint8(at++, state.health[slot]);
        }

        if (mask & FIELD.target) {
            const aimed = state.target[slot];

            view.setUint8(at++, aimed ? indexOf(aimed) : NONE);
        }
    }

    for (const [tag, held] of extra) {
        view.setUint8(at, tag);
        view.setUint16(at + 1, held.length, true);
        bytes.set(held, at + 3);
        at += 3 + held.length;
    }

    return { bytes, told: chosen.map(({ index }) => index) };
}

/**
 * A frame read back: { version, step, origin: [ox, oy], leaves: [index], records: [{ index,
 * x, y (cm, from the map's nought), heading, going, speed, health, target }], sections: { events
 * (JSON text), done (a number), self (JSON text), enters (JSON text) } }, each record with only the fields it was
 * sent and only the sections there were. Null for bytes that aren't a frame of this version, are cut short,
 * or run on past their end: never thrown on, whatever they are.
 */
export function decodeFrame(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < VIEW.header || bytes[0] !== VIEW_VERSION) {
        return null;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const step = view.getUint32(1, true);
    const origin = [view.getInt16(5, true), view.getInt16(7, true)];
    const [baseX, baseY] = [origin[0] * VIEW.origin * 100, origin[1] * VIEW.origin * 100];
    const left = view.getUint16(9, true);
    let at = 11;

    if (at + left + 2 > bytes.length) {
        return null;
    }

    const leaves = Array.from(bytes.subarray(at, at + left));

    at += left;

    const count = view.getUint16(at, true);
    const records = [];

    at += 2;

    for (let k = 0; k < count; k++) {
        if (at + 2 > bytes.length) {
            return null;
        }

        const index = view.getUint8(at);
        const mask = view.getUint8(at + 1);

        // (A mask that says nothing, far with no place, or what this version doesn't know)
        if (mask === 0 || (mask & ~127) !== 0 || (mask & (FIELD.far | FIELD.placed) && !(mask & FIELD.place)) || at + sizeOf(mask) > bytes.length) {
            return null;
        }

        const record = { index };

        at += 2;

        if (mask & FIELD.far) {
            record.x = view.getInt32(at, true);
            record.y = view.getInt32(at + 4, true);
            at += 8;
        } else if (mask & FIELD.place) {
            record.x = baseX + view.getUint16(at, true);
            record.y = baseY + view.getUint16(at + 2, true);
            at += 4;
        }

        if (mask & FIELD.placed) {
            record.placed = true;
        }

        if (mask & FIELD.heading) {
            record.heading = view.getUint8(at++);
        }

        if (mask & FIELD.going) {
            record.going = view.getUint8(at++);
            record.speed = view.getUint8(at++);
        }

        if (mask & FIELD.health) {
            record.health = view.getUint8(at++);
        }

        if (mask & FIELD.target) {
            record.target = view.getUint8(at++);
        }

        records.push(record);
    }

    // (Then its sections, to its end: each known, each once, in their order)
    const sections = {};
    let last = 0;

    while (at < bytes.length) {
        if (at + 3 > bytes.length) {
            return null;
        }

        const tag = view.getUint8(at);
        const length = view.getUint16(at + 1, true);

        if (!TAGS.has(tag) || tag <= last || at + 3 + length > bytes.length || (tag === SECTION.done && length !== 4)) {
            return null;
        }

        const held = bytes.subarray(at + 3, at + 3 + length);

        try {
            if (tag === SECTION.done) {
                sections.done = view.getUint32(at + 3, true);
            } else {
                sections[TEXTS[tag]] = text.decode(held);
            }
        } catch {
            return null;
        }

        last = tag;
        at += 3 + length;
    }

    return { version: VIEW_VERSION, step, origin, leaves, records, sections };
}
