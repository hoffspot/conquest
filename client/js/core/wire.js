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

/** `value` (plain data) as text. */
export function encode(value) {
    return JSON.stringify(value, (key, each) => (typeof each === "number" && !Number.isFinite(each) ? { [KEEP]: String(each) } : each));
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
