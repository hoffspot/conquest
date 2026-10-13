// The server's identity (generated/world_server_plan.md §7.6): an Ed25519 key pair made at its
// first start (identity.key, 0600, in its data folder), whose public half's fingerprint is its
// id, shown on the management page and carried in invite links.
//
// An address can change hands (a home's provider gives its IP to someone else tomorrow), so the
// game never sends a key or ticket until the server has proved it's the one the player meant, as
// SSH does with host keys: the game's first word carries a random nonce, and the server answers
// with its public key and the nonce signed (`hi SERVER-ID PUBLIC-KEY SIGNATURE`). The game checks
// the signature, and that the key's fingerprint is the id it pinned the first time (or took from
// the invite link); a different one stops everything.
//
// What's signed is IDENTITY_CONTEXT and the nonce, so a signature made for this can't be passed
// off as one for anything else.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exists, writeAtomic } from "../storage/files.js";
import { crockfordOf } from "./tokens.js";

/** The file the server's identity is kept in (in its data folder). */
export const IDENTITY_FILE = "identity.key";

/** What comes before the nonce in what's signed. */
export const IDENTITY_CONTEXT = "pellagos.hi.1";

/** A nonce, as the game sends it: 16 to 48 random bytes, base64url. */
export const NONCE = /^[A-Za-z0-9_-]{22,64}$/;

/** How many Crockford characters a fingerprint has (125 bits), shown in groups of five. */
export const FINGERPRINT_LENGTH = 25;

/** A public key's fingerprint (its raw 32 bytes, base64url): the first FINGERPRINT_LENGTH characters of its SHA-256, in groups of five. */
export function fingerprintOf(publicKey) {
    const digest = createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest();

    return crockfordOf(digest, FINGERPRINT_LENGTH).match(/.{5}/g).join("-");
}

const signed = (nonce) => Buffer.from(`${IDENTITY_CONTEXT} ${nonce}`, "utf8");

/**
 * Whether an answer proves a server is the one whose id is `id`: its public key's fingerprint is
 * the id, and the signature's of the nonce by it. (What the game checks, with WebCrypto or a small
 * verifier; Node's own here.)
 */
export function verifyIdentity({ id, publicKey, nonce, signature }) {
    try {
        if (fingerprintOf(publicKey) !== id) {
            return false;
        }

        const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey }, format: "jwk" });

        return verify(null, signed(nonce), key, Buffer.from(signature, "base64url"));
    } catch {
        return false;
    }
}

export class ServerIdentity {
    /** @param {object} privateKey - Its key pair's private half (a KeyObject). */
    constructor(privateKey) {
        this.privateKey = privateKey;

        /** Its public key (raw, base64url), and that's fingerprint: its id. */
        this.publicKey = createPublicKey(privateKey).export({ format: "jwk" }).x;
        this.id = fingerprintOf(this.publicKey);
    }

    /** The server's identity, from its data folder (`root`): made, and kept, the first time. Returns { identity, made }. */
    static async open(root) {
        const file = path.join(root, IDENTITY_FILE);

        if (await exists(file)) {
            return { identity: new ServerIdentity(createPrivateKey(await readFile(file, "utf8"))), made: false };
        }

        const { privateKey } = generateKeyPairSync("ed25519");

        await writeAtomic(file, privateKey.export({ format: "pem", type: "pkcs8" }));

        return { identity: new ServerIdentity(privateKey), made: true };
    }

    /** The answer to a game's nonce: { id, publicKey, signature }, or null if the nonce isn't one. */
    answer(nonce) {
        if (typeof nonce !== "string" || !NONCE.test(nonce)) {
            return null;
        }

        return { id: this.id, publicKey: this.publicKey, signature: sign(null, signed(nonce), this.privateKey).toString("base64url") };
    }
}
