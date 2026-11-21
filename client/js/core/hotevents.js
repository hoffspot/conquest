// The events a fight is mostly made of, as bytes (the scaling plan's 3-28).
//
// A view's frame tells a player's game what's happened as JSON (core/view.js SECTION.events),
// which is most of what a big fight sends: a blow struck is some 130 bytes of it, nearly all of
// that the names of its fields and the ids of two characters the game already knows by a byte
// each. The eight kinds a fight makes most of (HOT) are told here as bytes instead:
//
//   kind     uint8    which of HOT_KINDS
//   gap      varint   how many of the frame's other events (its JSON ones, in their order) come
//                     before this one: so the two lists are one again, in the order told
//   has      varint   which of the kind's fields it has, a bit each, in the order of HOT
//   ...               each field it has, by its type:
//     time   the world's time it's of, as how long before the frame's (a number, below)
//     who    varint   0: null; 1: their id follows, a text by reference (someone the player's
//                     not been told of: a fight's edge is full of them); else a character's
//                     index among those the player knows of, and 2
//     word   a text by reference (below): a weapon, an attack, a spell
//     num    varint   h: even, a whole number (h / 2, zigzag); 1, eight bytes follow (float64);
//                     5, four (float32); 3, null
//     any    uint8    0: a number follows; 1: a text by reference, which is its JSON
//
// A text by reference is a varint: 0, null; 1, the text follows (its length in bytes, a varint,
// then its UTF-8), to be kept and known from now on by the next number; 2, the text follows,
// not kept; 3 and up, one kept before (3 the first). Each side keeps its own list, begun again
// whenever a player's view is (a welcome, a view told again): frames come in order, each once.
//
// Nothing's lost by it: an event with a field the table hasn't, or a value its type can't hold,
// goes as JSON as it did. What's read back is
// the event as it was (test/hotevents.test.js).

/** The kinds told as bytes, by their number. */
export const HOT_KINDS = Object.freeze(["attack", "hit", "miss", "death", "cast", "projectile", "healed", "afflicted"]);

/** Each kind's fields and their types, in the order of their bits (`time` every event has). */
export const HOT = Object.freeze({
    attack: [["time", "time"], ["id", "who"], ["target", "who"], ["weapon", "word"], ["attack", "word"], ["animation", "word"], ["duration", "num"], ["hitAt", "num"]],
    hit: [["time", "time"], ["id", "who"], ["by", "who"], ["weapon", "word"], ["attack", "word"], ["reaction", "word"], ["damage", "num"], ["hp", "num"], ["maxHp", "num"], ["projectile", "any"], ["spell", "word"], ["mount", "any"]],
    miss: [["time", "time"], ["id", "who"], ["target", "who"], ["attack", "word"]],
    death: [["time", "time"], ["id", "who"], ["by", "who"], ["respawnAt", "num"], ["downed", "any"]],
    cast: [["time", "time"], ["id", "who"], ["spell", "word"], ["target", "who"], ["castTime", "num"]],
    projectile: [["time", "time"], ["projectile", "any"], ["kind", "word"], ["id", "who"], ["target", "who"], ["x", "num"], ["y", "num"], ["speed", "num"]],
    healed: [["time", "time"], ["id", "who"], ["by", "who"], ["spell", "word"], ["attack", "word"], ["amount", "num"], ["hp", "num"], ["maxHp", "num"], ["cured", "any"], ["from", "who"], ["regrown", "any"]],
    afflicted: [["time", "time"], ["id", "who"], ["kind", "word"], ["change", "word"], ["until", "num"], ["by", "who"], ["look", "any"]],
});

/**
 * The texts kept by each side: `most` of them, none longer than `long` characters (a field
 * that's any value's, its JSON, none longer than `short`: what's said over and over is short).
 */
export const WORDS = Object.freeze({ most: 4096, long: 32, short: 12 });

const CODES = new Map(HOT_KINDS.map((kind, code) => [kind, code]));
const BITS = new Map(HOT_KINDS.map((kind) => [kind, new Map(HOT[kind].map(([name], bit) => [name, bit]))]));
// (Whole numbers told as such: to where doubling them twice is still exact)
const WHOLE = 281474976710656;
const utf8 = new TextEncoder();
const text = new TextDecoder("utf-8", { fatal: true });
const scratch = new DataView(new ArrayBuffer(8));

function varint(out, value) {
    let left = value;

    while (left >= 128) {
        out.push((left % 128) + 128);
        left = Math.floor(left / 128);
    }

    out.push(left);
}

function number(out, value) {
    if (value === null) {
        out.push(3);
    } else if (typeof value !== "number" || !Number.isFinite(value)) {
        return false;
    } else if (Number.isInteger(value) && value > -WHOLE && value < WHOLE) {
        // (-0 as nought, as JSON has it)
        varint(out, (value >= 0 ? value * 2 + 0 : -value * 2 - 1) * 2);
    } else if (Math.fround(value) === value) {
        scratch.setFloat32(0, value, true);
        out.push(5, scratch.getUint8(0), scratch.getUint8(1), scratch.getUint8(2), scratch.getUint8(3));
    } else {
        scratch.setFloat64(0, value, true);
        out.push(1);

        for (let k = 0; k < 8; k++) {
            out.push(scratch.getUint8(k));
        }
    }

    return true;
}

/**
 * One player's events put into bytes, a frame at a time (core/viewfeed.js): begun for a frame,
 * each event added (as bytes if it can be, else as JSON), and what's been added taken, or
 * taken back (mark, back) where it turned out not to fit.
 */
export class EventPacker {
    constructor() {
        /** The texts kept, each by its number. */
        this.words = new Map();
        /** How many events it's put into bytes, and how many it's left as JSON. */
        this.packed = 0;
        this.plain = 0;
        this.begin(0, () => undefined);
    }

    /** A frame begun: the world's time it's of (ms) and how a character's index is had from their id (undefined: not one the player's been told of). */
    begin(time, indexOf) {
        this.time = time;
        this.indexOf = indexOf;
        this.bytes = [];
        this.cold = [];
        this.gap = 0;
    }

    /** Where it stands, to go back to. */
    mark() {
        return { bytes: this.bytes.length, cold: this.cold.length, gap: this.gap, words: this.words.size, packed: this.packed, plain: this.plain };
    }

    /** Back to where it stood (`mark`): what's been added since taken out, the texts kept since forgotten. */
    back(mark) {
        this.bytes.length = mark.bytes;
        this.cold.length = mark.cold;
        this.gap = mark.gap;
        this.packed = mark.packed;
        this.plain = mark.plain;
        this.#forget(mark.words);
    }

    #forget(words) {
        if (this.words.size > words) {
            let k = 0;

            for (const word of [...this.words.keys()]) {
                if (k++ >= words) {
                    this.words.delete(word);
                }
            }
        }
    }

    /** An event added. Returns how many bytes of the frame it takes. */
    add(event) {
        const code = CODES.get(event.type);

        if (code !== undefined) {
            const [from, words] = [this.bytes.length, this.words.size];

            if (this.#pack(code, event)) {
                this.gap = 0;
                this.packed++;

                return this.bytes.length - from;
            }

            this.bytes.length = from;
            this.#forget(words);
        }

        const told = JSON.stringify(event);

        this.cold.push(told);
        this.gap++;
        this.plain++;

        return utf8.encode(told).length + 1;
    }

    /** What's been added, as a frame's sections: { events (JSON, of those left as it), hot (bytes) }, each only if there's any. */
    get sections() {
        return { ...(this.cold.length ? { events: `[${this.cold.join(",")}]` } : {}), ...(this.bytes.length ? { hot: Uint8Array.from(this.bytes) } : {}) };
    }

    #pack(code, event) {
        const fields = HOT[HOT_KINDS[code]];
        const bits = BITS.get(HOT_KINDS[code]);
        const out = this.bytes;
        let has = 0;

        // (Every field it has one the table knows: `type` aside, and any that's undefined,
        // which JSON would leave out)
        for (const name of Object.keys(event)) {
            if (name === "type" || event[name] === undefined) {
                continue;
            }

            const bit = bits.get(name);

            if (bit === undefined) {
                return false;
            }

            has |= 1 << bit;
        }

        out.push(code);
        varint(out, this.gap);
        varint(out, has);

        for (let bit = 0; bit < fields.length; bit++) {
            if (((has >> bit) & 1) === 0) {
                continue;
            }

            const [name, type] = fields[bit];
            const value = event[name];

            if (type === "time") {
                if (typeof value !== "number" || !number(out, this.time - value)) {
                    return false;
                }
            } else if (type === "who") {
                if (value !== null && typeof value !== "string") {
                    return false;
                }

                const index = value === null ? undefined : this.indexOf(value);

                if (value === null) {
                    out.push(0);
                } else if (index === undefined) {
                    out.push(1);
                    this.#word(value, WORDS.long);
                } else {
                    varint(out, index + 2);
                }
            } else if (type === "word") {
                if (value !== null && typeof value !== "string") {
                    return false;
                }

                this.#word(value, WORDS.long);
            } else if (type === "num") {
                if (!number(out, value)) {
                    return false;
                }
            } else if (typeof value === "number") {
                out.push(0);

                if (!number(out, value)) {
                    return false;
                }
            } else {
                out.push(1);
                this.#word(JSON.stringify(value), WORDS.short);
            }
        }

        return true;
    }

    #word(word, long) {
        const out = this.bytes;

        if (word === null) {
            out.push(0);

            return;
        }

        const kept = this.words.get(word);

        if (kept !== undefined) {
            varint(out, kept + 3);

            return;
        }

        const bytes = utf8.encode(word);

        if (this.words.size < WORDS.most && word.length <= long) {
            this.words.set(word, this.words.size);
            out.push(1);
        } else {
            out.push(2);
        }

        varint(out, bytes.length);

        for (const byte of bytes) {
            out.push(byte);
        }
    }
}

/** A player's game's side of it (core/mirror.js): a frame's bytes read back into its events. */
export class EventUnpacker {
    constructor() {
        /** The texts kept, by their numbers. */
        this.words = [];
    }

    /**
     * A frame's events, in the order told: those in bytes (`bytes`) among those that came as
     * JSON (`cold`, read already). `time`: the world's time the frame's of (ms); `idOf`: a
     * character's id from their index (undefined: none known by it). Returns { events,
     * unknown: how many told of someone not known, and left out }, or null for bytes that
     * aren't to be read (nothing kept of them but the texts met on the way).
     */
    unpack(bytes, cold, time, idOf) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const events = [];
        let [at, next, unknown] = [0, 0, 0];
        let bad = false;
        const byte = () => {
            if (at >= bytes.length) {
                bad = true;

                return 0;
            }

            return bytes[at++];
        };
        const varint = () => {
            let [value, scale] = [0, 1];

            for (let k = 0; k < 8; k++) {
                const one = byte();

                value += (one % 128) * scale;

                if (one < 128) {
                    return value;
                }

                scale *= 128;
            }

            bad = true;

            return 0;
        };
        const number = () => {
            const h = varint();

            if (h % 2 === 0) {
                const zigzag = h / 2;

                return zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2;
            }

            if (h === 3) {
                return null;
            }

            const length = h === 5 ? 4 : h === 1 ? 8 : -1;

            if (length < 0 || at + length > bytes.length) {
                bad = true;

                return 0;
            }

            at += length;

            return length === 4 ? view.getFloat32(at - 4, true) : view.getFloat64(at - 8, true);
        };
        const word = () => {
            const ref = varint();

            if (ref === 0) {
                return null;
            }

            if (ref >= 3) {
                if (ref - 3 >= this.words.length) {
                    bad = true;

                    return null;
                }

                return this.words[ref - 3];
            }

            const length = varint();

            if (bad || at + length > bytes.length) {
                bad = true;

                return null;
            }

            let read;

            try {
                read = text.decode(bytes.subarray(at, at + length));
            } catch {
                bad = true;

                return null;
            }

            at += length;

            if (ref === 1) {
                this.words.push(read);
            }

            return read;
        };

        while (at < bytes.length && !bad) {
            const kind = HOT_KINDS[byte()];
            const gap = varint();
            const has = varint();

            if (!kind || bad || next + gap > cold.length) {
                return null;
            }

            for (let k = 0; k < gap; k++) {
                events.push(cold[next++]);
            }

            const fields = HOT[kind];
            const event = { type: kind };
            let whole = true;

            if (has >= 1 << fields.length) {
                return null;
            }

            for (let bit = 0; bit < fields.length && !bad; bit++) {
                if (((has >> bit) & 1) === 0) {
                    continue;
                }

                const [name, type] = fields[bit];

                if (type === "time") {
                    event[name] = time - number();
                } else if (type === "who") {
                    const said = varint();
                    const id = said === 0 ? null : said === 1 ? (word() ?? undefined) : idOf(said - 2);

                    whole &&= id !== undefined;
                    event[name] = id;
                } else if (type === "word") {
                    event[name] = word();
                } else if (type === "num") {
                    event[name] = number();
                } else if (byte() === 0) {
                    event[name] = number();
                } else {
                    const told = word();

                    try {
                        event[name] = told === null ? null : JSON.parse(told);
                    } catch {
                        bad = true;
                    }
                }
            }

            if (bad) {
                return null;
            }

            if (whole) {
                events.push(event);
            } else {
                unknown++;
            }
        }

        if (bad) {
            return null;
        }

        while (next < cold.length) {
            events.push(cold[next++]);
        }

        return { events, unknown };
    }
}
