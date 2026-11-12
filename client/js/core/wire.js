// What goes between a game's host and its players, and into a saved world (docs/WAR.md), as
// text: JSON, but for numbers JSON can't carry (Infinity, -Infinity, NaN: "never yet", "not
// till then" in the battle), which go as { "$": "Infinity" } and come back as they were.
//
// Bytes (the motion stream's: core/motion.js; the chunks a player's been to: core/explored.js) go
// as base64, by hand: the relay carries text only.
//
// Pure JavaScript, the same in Node and the browser.

const KEEP = "$";

// Base64's digits, and each one's worth (by its character code)
const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const WORTH = new Uint8Array(128);

for (let k = 0; k < DIGITS.length; k++) {
    WORTH[DIGITS.charCodeAt(k)] = k;
}

// A number JSON can't carry, as it goes
const marked = (value) => ({ [KEEP]: String(value) });

// The slow way: every value handed to a function as it's written (which takes the writer off its
// quick way for all of them). For what isn't plain data, or can't be changed
const slowly = (value) => JSON.stringify(value, (key, each) => (typeof each === "number" && !Number.isFinite(each) ? marked(each) : each));

// What isn't plain data (carried's answer)
const NOT_PLAIN = Symbol("not plain");

// `value` (an array or an object) as JSON's own writer can write it, if it's plain data all
// through (arrays and plain objects of numbers, strings, true, false, null and undefined, however
// deep, with nothing that writes itself its own way, a toJSON): itself, where it holds no number
// JSON can't carry, which is nearly always; else a copy of it with each such number as its mark,
// only what holds one copied, and the rest shared. Nothing of `value` is changed (it may be a
// world's own: core/host.js snapshotText). NOT_PLAIN if it isn't plain data
function carried(value) {
    let out = value;

    if (Array.isArray(value)) {
        for (let k = 0; k < value.length; k++) {
            const each = value[k];
            let as = each;

            if (typeof each === "number") {
                if (each - each === 0) {
                    continue;
                }

                as = marked(each);
            } else if (typeof each === "object" && each !== null) {
                as = carried(each);

                if (as === NOT_PLAIN) {
                    return NOT_PLAIN;
                }
            } else if (typeof each !== "string" && typeof each !== "boolean" && each !== undefined && each !== null) {
                return NOT_PLAIN;
            }

            if (as !== each) {
                if (out === value) {
                    out = value.slice();
                }

                out[k] = as;
            }
        }

        return out;
    }

    const proto = Object.getPrototypeOf(value);

    if (proto !== Object.prototype && proto !== null) {
        return NOT_PLAIN;
    }

    for (const key in value) {
        const each = value[key];
        let as = each;

        if (typeof each === "number") {
            if (each - each === 0) {
                continue;
            }

            as = marked(each);
        } else if (typeof each === "object" && each !== null) {
            as = carried(each);

            if (as === NOT_PLAIN) {
                return NOT_PLAIN;
            }
        } else if (typeof each !== "string" && typeof each !== "boolean" && each !== undefined && each !== null) {
            return NOT_PLAIN;
        }

        if (as !== each) {
            // (A key that would set what kind of thing the copy is, not a part of it: the slow way)
            if (key === "__proto__") {
                return NOT_PLAIN;
            }

            if (out === value) {
                out = { ...value };
            }

            out[key] = as;
        }
    }

    return out;
}

/**
 * `value` (plain data) as text, or null if it holds anything that isn't plain data (numbers,
 * strings, true, false, null, undefined, arrays and plain objects of them): for writing out what's
 * shared with whoever made it, where a copy would have made plain data of the rest
 * (core/host.js snapshotText). The same text as encode's.
 */
export function encodePlain(value) {
    if (value === null || typeof value !== "object") {
        return typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" ? null : slowly(value);
    }

    const as = carried(value);

    return as === NOT_PLAIN ? null : JSON.stringify(as);
}

/**
 * `value` (plain data) as text. Written by JSON's own writer with nothing handed back to this
 * for each value (a replacer: half as slow again over a world, and off the writer's quickest way
 * altogether): it's gone through once first for the numbers JSON can't carry, which are few.
 * Anything that isn't plain data is written the slow way, as it always was.
 */
export function encode(value) {
    if (value === null || typeof value !== "object") {
        return slowly(value);
    }

    const as = carried(value);

    return as === NOT_PLAIN ? slowly(value) : JSON.stringify(as);
}

// `value` (an array or an object, as JSON.parse made it) with every mark in it ({ "$": "Infinity" },
// and nothing else beside it) put back as the number it was, in place; or that number, if it's
// a mark itself
function revived(value) {
    if (Array.isArray(value)) {
        for (let k = 0; k < value.length; k++) {
            const each = value[k];

            if (each !== null && typeof each === "object") {
                value[k] = revived(each);
            }
        }

        return value;
    }

    let count = 0;

    for (const key in value) {
        const each = value[key];

        count++;

        if (each !== null && typeof each === "object") {
            value[key] = revived(each);
        }
    }

    return count === 1 && typeof value[KEEP] === "string" ? Number(value[KEEP]) : value;
}

/**
 * Text from encode, as the plain data it was. Read as plain JSON, and gone through for the marks
 * only if the text could hold one (a "$", or the same written as JSON's escape): a reviver takes
 * the parser off its quick way for everything (a world of 600 KB: 34 to 41 ms with one, 3 to 9
 * read plainly and gone through).
 */
export function decode(text) {
    const value = JSON.parse(text);

    return value !== null && typeof value === "object" && (text.includes(KEEP) || text.includes("\\u0024")) ? revived(value) : value;
}

/** Bytes (a Uint8Array) as base64 text. */
export function toBase64(bytes) {
    let text = "";

    for (let k = 0; k < bytes.length; k += 3) {
        const [a, b = 0, c = 0] = [bytes[k], bytes[k + 1], bytes[k + 2]];
        const n = (a << 16) | (b << 8) | c;

        text += DIGITS[(n >> 18) & 63] + DIGITS[(n >> 12) & 63] + (k + 1 < bytes.length ? DIGITS[(n >> 6) & 63] : "=") + (k + 2 < bytes.length ? DIGITS[n & 63] : "=");
    }

    return text;
}

/**
 * Base64 text as the bytes it was (a Uint8Array): `length` of them if that's given (any more
 * left off, any fewer made up with zeros), else as many as it holds. Anything not base64 counts
 * as zero.
 */
export function fromBase64(text, length = null) {
    const digits = text.replace(/=+$/, "");
    const bytes = new Uint8Array(length ?? Math.floor((digits.length * 3) / 4));
    let at = 0;

    for (let k = 0; k < digits.length && at < bytes.length; k += 4) {
        let n = 0;

        for (let j = 0; j < 4; j++) {
            const code = digits.charCodeAt(k + j);

            n = (n << 6) | (code < 128 ? WORTH[code] : 0);
        }

        for (const byte of [(n >> 16) & 255, (n >> 8) & 255, n & 255]) {
            if (at < bytes.length) {
                bytes[at++] = byte;
            }
        }
    }

    return bytes;
}
