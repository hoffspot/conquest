// A player's own identity (docs/SERVER.md, "Players and their codes"), the same on every server: a
// secret key the game makes for them and keeps on their device (Ed25519: the vendored
// noble-ed25519, as core/identity.js checks a server's with, since a game opened from a server on
// the Wi-Fi is a plain-http page and has no WebCrypto); its public half, which servers know them
// by; and their id, worked out from that: a UUID (RFC 9562, version 8: the first sixteen bytes of
// the public key's SHA-256, its version and variant set), lowercase, the same wherever they go, a
// database's own uuid type to keep and index. Nobody can claim an id without its key: coming into a
// world, the game signs the server's id, the moment and the name it gives (PLAYER_CONTEXT), and
// the server checks the signature, and that it's fresh and not used before (server/access).
//
// Their code is the secret key written out, to carry to another device: its 52 Crockford
// characters and two more that catch a mistyped one, in nine groups of six.

import { getPublicKey, randomSecretKey, sha256, sign, verify } from "../../vendor/noble-ed25519-3.2.0/ed25519.min.js";
import { bytesOf, crockfordOf, textOf } from "./identity.js";

/** What comes before what a player signs, coming into a world. */
export const PLAYER_CONTEXT = "pellagos.player.1";

/** How long a player's proof is good for (minutes either side of the server's clock). */
export const PROOF_MINUTES = 10;

/** A player's name: how long it may be. */
export const NAME_LENGTH = Object.freeze({ least: 2, most: 24 });

/** A player's id: a lowercase version 8 UUID. */
export const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const encoder = new TextEncoder();

/** Is this a player's id? */
export const isPlayerId = (id) => typeof id === "string" && PLAYER_ID.test(id);

/** A new secret key, for a player who hasn't one (32 random bytes). */
export const newPlayerSecret = () => randomSecretKey();

/** A player's public key (base64url) from their secret key. */
export const publicKeyOf = (secret) => textOf(getPublicKey(secret));

/** A player's id, from their public key (base64url): or null, for what isn't one. */
export function playerIdOf(publicKey) {
    const key = bytesOf(publicKey);

    if (key?.length !== 32) {
        return null;
    }

    const bytes = sha256(key).slice(0, 16);

    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A name as a player may go by: its spaces tidied, 2 to 24 letters, digits, spaces, ' . - _; or null. */
export function cleanPlayerName(name) {
    const tidy = typeof name === "string" ? name.normalize("NFC").replace(/\s+/g, " ").trim() : "";

    return tidy.length >= NAME_LENGTH.least && tidy.length <= NAME_LENGTH.most && /^[\p{L}\p{M}\p{N}' ._-]+$/u.test(tidy) ? tidy : null;
}

// The two characters that catch a mistyped one: ten bits of the key's SHA-256
const checkOf = (secret) => crockfordOf(sha256(secret), 2);

/** A secret key as a player's code: nine groups of six Crockford characters. */
export function codeOf(secret) {
    return `${crockfordOf(secret, 52)}${checkOf(secret)}`.match(/.{6}/g).join("-");
}

/**
 * The secret key a player's code is (as codeOf writes it: its case, spaces and dashes as they
 * come, O for 0 and I or L for 1), or null if it isn't one, or a character's been mistyped.
 */
export function secretOfCode(code) {
    const text = typeof code === "string" ? code.toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1") : "";

    if (text.length !== 54 || [...text].some((character) => !CROCKFORD.includes(character))) {
        return null;
    }

    const secret = new Uint8Array(32);
    let bits = 0;
    let value = 0;
    let at = 0;

    for (const character of text.slice(0, 52)) {
        value = (value << 5) | CROCKFORD.indexOf(character);
        bits += 5;

        if (bits >= 8 && at < 32) {
            secret[at++] = (value >>> (bits - 8)) & 0xff;
            bits -= 8;
        }

        value &= (1 << bits) - 1;
    }

    // (Its check characters right, and written as codeOf writes it: the last key character's spare
    // bits none, so no other code reads as the same key)
    return codeOf(secret).replace(/-/g, "") === text ? secret : null;
}

const message = ({ server, at, name }) => encoder.encode(`${PLAYER_CONTEXT} ${server} ${at} ${name}`);

/**
 * What a player shows coming into a world on the server whose id is `server`, proving they hold
 * their key: { key (public, base64url), name, at (now, ISO), signature (base64url) }.
 */
export function proofOf(secret, { server, name, at = new Date().toISOString() }) {
    return { key: publicKeyOf(secret), name, at, signature: textOf(sign(message({ server, at, name }), secret)) };
}

/**
 * Who a proof says a player is, if it proves it (signed by their key, for the server whose id is
 * `server`, within PROOF_MINUTES of `now`, with a name a player may go by): { id, key, name }; or
 * null. Whether it's been shown before is for the server to know.
 */
export function playerOfProof(proof, { server, now = Date.now() }) {
    try {
        const key = bytesOf(proof?.key);
        const signature = bytesOf(proof?.signature);
        const at = typeof proof?.at === "string" ? Date.parse(proof.at) : NaN;
        const name = cleanPlayerName(proof?.name);

        if (key?.length !== 32 || signature?.length !== 64 || !Number.isFinite(at) || Math.abs(now - at) > PROOF_MINUTES * 60000 || !name || name !== proof.name || typeof server !== "string") {
            return null;
        }

        return verify(signature, message({ server, at: proof.at, name }), key) ? { id: playerIdOf(proof.key), key: proof.key, name } : null;
    } catch {
        return null;
    }
}
