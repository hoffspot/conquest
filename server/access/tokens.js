// The secrets the world server hands out (generated/world_server_plan.md §7.1), what they look
// like, and how they're kept: never as they are, only as what proves them.
//
//   a long key     30 Crockford base-32 characters, shown in six groups of five
//                  (KQ2M9-XD4RT-AH3PW-C8NVB-7J2KQ-M9XDA). The first four name it, so the server
//                  can find it without trying every one; the other 26 (130 bits) are its secret.
//                  An admin key, a creator key or a world's key.
//   a short code   8 Crockford characters (40 bits: KQ2M-9XD4), to be read out at a table or over
//                  voice chat; short-lived, so it's kept slowly hashed (scrypt) as well.
//   a token        128 random bits, base64url: a player's return ticket, or a session.
//
// Typing them is forgiving: case doesn't matter, dashes and spaces are optional, O reads as 0 and
// I or L as 1 (Crockford's own rule). Long keys and tokens are kept as SHA-256 and compared in
// constant time: guessing 130 bits is hopeless however fast the hash, so a slow one buys nothing.
// A short code's 40 bits could be tried in full against a stolen file, so it's kept by scrypt
// (OWASP's least: N = 2^17, r = 8, p = 1), salted with the server's own salt (secrets.js): one
// hash for a guess, looked up, not one for every code there is.
//
// A world's keys are also kept sealed (AES-256-GCM, with the server's own key in secrets.json),
// so its owner can be shown one again (as a link or a QR code) without its ever being written
// down as it is.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/** Crockford's base 32: digits and letters, with no I, L, O or U. */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A long key: its length, the groups it's shown in, and how many of its first characters name it. */
export const LONG_KEY = Object.freeze({ length: 30, group: 5, named: 4 });

/** A short code: its length, and the groups it's shown in. */
export const SHORT_CODE = Object.freeze({ length: 8, group: 4 });

/** A token's random bytes (128 bits). */
export const TOKEN_BYTES = 16;

/** How a short code's slowly hashed (OWASP's least for scrypt), and the memory that takes (bytes). */
export const SCRYPT = Object.freeze({ N: 2 ** 17, r: 8, p: 1, length: 32, maxmem: 256 * 1024 * 1024 });

const hashSlowly = promisify(scrypt);

/** `length` Crockford characters at random (each of 32, all as likely: a byte's low five bits). */
export function randomCrockford(length) {
    return [...randomBytes(length)].map((byte) => CROCKFORD[byte & 31]).join("");
}

/**
 * Bytes as Crockford characters, five bits each (the last padded with zeros): the first `length`
 * of them.
 */
export function crockfordOf(bytes, length = Math.ceil((bytes.length * 8) / 5)) {
    let bits = 0;
    let value = 0;
    let text = "";

    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;

        while (bits >= 5 && text.length < length) {
            text += CROCKFORD[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }

        value &= (1 << bits) - 1;
    }

    if (bits > 0 && text.length < length) {
        text += CROCKFORD[(value << (5 - bits)) & 31];
    }

    return text.slice(0, length);
}

/**
 * What someone typed, as the key or code it means: capitals, without dashes or spaces, O as 0 and
 * I or L as 1. Null if it isn't text, or has anything else in it.
 */
export function readable(text) {
    if (typeof text !== "string" || text.length > 200) {
        return null;
    }

    const plain = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

    return [...plain].every((letter) => CROCKFORD.includes(letter)) ? plain : null;
}

// Characters in groups of `size`, between dashes
function grouped(text, size) {
    return text.match(new RegExp(`.{1,${size}}`, "g")).join("-");
}

/** A new long key: { text (as it's shown and given), id (what names it) }. */
export function newLongKey() {
    const plain = randomCrockford(LONG_KEY.length);

    return { text: grouped(plain, LONG_KEY.group), id: plain.slice(0, LONG_KEY.named) };
}

/** A long key as typed, read: { id, plain } (plain: the whole key, as it's hashed), or null if it can't be one. */
export function longKeyOf(text) {
    const plain = readable(text);

    return plain?.length === LONG_KEY.length ? { id: plain.slice(0, LONG_KEY.named), plain } : null;
}

/** A long key (plain) as it's shown: in groups. */
export function showKey(plain) {
    return grouped(plain, LONG_KEY.group);
}

/** A new short code, as it's shown and read out ("KQ2M-9XD4"). */
export function newShortCode() {
    return grouped(randomCrockford(SHORT_CODE.length), SHORT_CODE.group);
}

/** A short code as typed, read (plain), or null if it can't be one. */
export function shortCodeOf(text) {
    const plain = readable(text);

    return plain?.length === SHORT_CODE.length ? plain : null;
}

/** A new token (a return ticket or a session): 128 random bits, base64url. */
export function newToken() {
    return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Whether `text` could be a token (base64url, of TOKEN_BYTES). */
export function isToken(text) {
    return typeof text === "string" && /^[A-Za-z0-9_-]{22}$/.test(text);
}

/** What proves a long key or a token, as it's kept: its SHA-256 (hex). */
export function hashOf(text) {
    return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Whether two kept hashes (hex) are the same, in a time that doesn't tell how much of them is. */
export function sameHash(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
        return false;
    }

    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** What proves a short code (plain), as it's kept: scrypt, with the server's salt (base64url). */
export async function slowHashOf(plain, salt, cost = SCRYPT) {
    const { N, r, p, length, maxmem } = cost;

    return (await hashSlowly(plain, Buffer.from(salt, "base64url"), length, { N, r, p, maxmem })).toString("hex");
}

/** A new key to seal with (32 random bytes, base64url). */
export function newSealKey() {
    return randomBytes(32).toString("base64url");
}

/** `text` sealed with `key` (AES-256-GCM): "iv.tag.sealed", base64url each. */
export function seal(text, key) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64url"), iv);
    const sealed = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);

    return [iv, cipher.getAuthTag(), sealed].map((part) => part.toString("base64url")).join(".");
}

/** What `sealed` (seal's) holds, opened with `key`; null if it won't open (not sealed with that key, or tampered with). */
export function unseal(sealed, key) {
    try {
        const [iv, tag, text] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
        const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64url"), iv);

        decipher.setAuthTag(tag);

        return Buffer.concat([decipher.update(text), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
}
