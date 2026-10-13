// A world server's identity, as the game checks it (generated/world_server_plan.md §7.6): before a
// key or ticket goes to an address, the server proves it's the one the player meant. The game's
// first word on the play socket carries a random nonce (`hi NONCE`); the server answers with its
// id, its public key and the nonce signed (`hi ID PUBLIC-KEY SIGNATURE`). The answer's good if the
// key's fingerprint is the id and the signature's the server's; and the id must be the one the
// game pinned for that server the first time (or took from an invite link).
//
// The game checks with a small vendored verifier (noble-ed25519), not WebCrypto: a game opened from
// a server on the Wi-Fi is a plain-http page, which has no WebCrypto. server/access/identity.js
// makes the same fingerprints (test/servers.test.js holds them to it).

import { sha256, verify } from "../../vendor/noble-ed25519-3.2.0/ed25519.min.js";

/** What comes before the nonce in what the server signs. */
export const IDENTITY_CONTEXT = "pellagos.hi.1";

/** How many Crockford characters a server's id has, shown in groups of five. */
export const FINGERPRINT_LENGTH = 25;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Bytes as Crockford characters, five bits each: the first `length` of them. */
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

    if (text.length < length && bits > 0) {
        text += CROCKFORD[(value << (5 - bits)) & 31];
    }

    return text;
}

/** base64url text as bytes (null if it isn't). */
export function bytesOf(text) {
    if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text)) {
        return null;
    }

    const plain = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));

    return Uint8Array.from(plain, (character) => character.charCodeAt(0));
}

/** Bytes as base64url text. */
export function textOf(bytes) {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/** A public key's (raw, base64url) fingerprint: the server's id, in groups of five. */
export function fingerprintOf(publicKey) {
    const bytes = bytesOf(publicKey);

    return bytes?.length === 32 ? crockfordOf(sha256(bytes), FINGERPRINT_LENGTH).match(/.{5}/g).join("-") : null;
}

/** A new nonce for `hi`: 24 random bytes, base64url. */
export function newNonce() {
    return textOf(crypto.getRandomValues(new Uint8Array(24)));
}

/**
 * Whether a server's answer to `nonce` proves it's the server whose id is `id`: its public key's
 * fingerprint is `id`, and the signature's of the nonce by that key.
 */
export function verifyIdentity({ id, publicKey, nonce, signature }) {
    try {
        const key = bytesOf(publicKey);
        const signed = bytesOf(signature);

        if (!id || fingerprintOf(publicKey) !== id || key?.length !== 32 || signed?.length !== 64) {
            return false;
        }

        return verify(signed, new TextEncoder().encode(`${IDENTITY_CONTEXT} ${nonce}`), key);
    } catch {
        return false;
    }
}
