// The server's own secrets (generated/world_server_plan.md §5, §7.1, §7.3), in its data folder's
// secrets.json (0600, as everything it writes):
//
//   { secretsVersion, writtenBy,
//     admin:    { id, hash, made }                        the admin key, as it's proved (tokens.js)
//     creators: [{ id, hash, label, made, revoked }]      keys that make worlds
//     seal, codeSalt }                                    what world keys are sealed with, and
//                                                         short codes salted with
//
// The admin key's made at the first start and shown then (in Terminal, and on the management page
// at the Mac) but never kept as it is: a forgotten one is replaced, from the Mac, by a new one.
// Creator keys are shown once, as they're made. A newer server's secrets.json is refused, as
// everything it keeps is (storage/versions.js).

import path from "node:path";
import { exists, readJSON, writeJSON } from "../storage/files.js";
import { forward, SERVER_VERSION } from "../storage/versions.js";
import { hashOf, longKeyOf, newLongKey, newSealKey, newToken, sameHash, SCRYPT, seal, slowHashOf, unseal } from "./tokens.js";

/** The file the server's secrets are kept in (in its data folder). */
export const SECRETS_FILE = "secrets.json";

/** secrets.json's version: bump it, with a step in SECRETS_STEPS, when what it holds changes. */
export const SECRETS_VERSION = 1;

/** The steps that bring an older server's secrets.json forward: [n] takes it from version n to n + 1. */
export const SECRETS_STEPS = Object.freeze({});

/** The longest label a key can have (characters). */
export const LABEL_MOST = 40;

/** A key's label as it's kept: trimmed, without control characters, LABEL_MOST at most; or null if there's nothing to it. */
export function labelOf(label) {
    const text = typeof label === "string" ? label.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MOST).trim() : "";

    return text || null;
}

export class ServerSecrets {
    /**
     * @param {string} file - Its secrets.json.
     * @param {object} data - What's in it.
     * @param {object} [cost] - How a short code's hashed (tokens.js SCRYPT: cheaper in tests).
     */
    constructor(file, data, cost = SCRYPT) {
        this.file = file;
        this.data = data;
        this.cost = cost;
    }

    /**
     * The server's secrets, from its data folder (`root`): made, the first time, with a new admin
     * key. Returns { secrets, adminKey } (adminKey: the new key as it's shown, the first time
     * alone; else null).
     */
    static async open(root, { when = new Date(), cost = SCRYPT } = {}) {
        const file = path.join(root, SECRETS_FILE);

        if (await exists(file)) {
            const { secretsVersion, writtenBy = null, ...data } = await readJSON(file);
            const secrets = new ServerSecrets(file, forward("The server's secrets", data, { found: secretsVersion, current: SECRETS_VERSION, steps: SECRETS_STEPS, writtenBy }), cost);

            if (secretsVersion < SECRETS_VERSION) {
                await secrets.#write();
            }

            return { secrets, adminKey: null };
        }

        const secrets = new ServerSecrets(file, { admin: null, creators: [], seal: newSealKey(), codeSalt: newToken() }, cost);
        const adminKey = await secrets.newAdminKey(when);

        return { secrets, adminKey };
    }

    async #write() {
        await writeJSON(this.file, { secretsVersion: SECRETS_VERSION, writtenBy: SERVER_VERSION, ...this.data });
    }

    // A long key whose name no other of the server's own keys has
    #newKey() {
        const taken = new Set([this.data.admin?.id, ...this.data.creators.map((creator) => creator.id)]);

        for (;;) {
            const key = newLongKey();

            if (!taken.has(key.id)) {
                return key;
            }
        }
    }

    /** A new admin key (the old one, if there was one, no longer works). Returns it, as it's shown: the only time it is. */
    async newAdminKey(when = new Date()) {
        const key = this.#newKey();

        this.data.admin = { id: key.id, hash: hashOf(longKeyOf(key.text).plain), made: when.toISOString() };
        await this.#write();

        return key.text;
    }

    /** Whether `text` is the admin key. */
    isAdmin(text) {
        const key = longKeyOf(text);

        return Boolean(key && this.data.admin && key.id === this.data.admin.id && sameHash(hashOf(key.plain), this.data.admin.hash));
    }

    /** A new creator key, labelled (who it's for). Returns { key (as it's shown: the only time it is), creator }. */
    async issueCreator(label, when = new Date()) {
        const key = this.#newKey();
        const creator = { id: key.id, hash: hashOf(longKeyOf(key.text).plain), label: labelOf(label) ?? "A creator", made: when.toISOString(), revoked: null };

        this.data.creators.push(creator);
        await this.#write();

        return { key: key.text, creator: ServerSecrets.#shown(creator) };
    }

    /** A creator key no longer working. Returns whether there was one, not already revoked. */
    async revokeCreator(id, when = new Date()) {
        const creator = this.data.creators.find((each) => each.id === id && !each.revoked);

        if (!creator) {
            return false;
        }

        creator.revoked = when.toISOString();
        await this.#write();

        return true;
    }

    /** The creator whose key `text` is ({ id, label, made }), if it's one that works; else null. */
    creatorOf(text) {
        const key = longKeyOf(text);
        const creator = key && this.data.creators.find((each) => each.id === key.id && !each.revoked);

        return creator && sameHash(hashOf(key.plain), creator.hash) ? ServerSecrets.#shown(creator) : null;
    }

    /** The creator keys, as the management page lists them (nothing that proves them). */
    creators() {
        return this.data.creators.map((creator) => ServerSecrets.#shown(creator));
    }

    static #shown({ id, label, made, revoked = null }) {
        return { id, label, made, revoked };
    }

    /** `text` sealed with the server's own key (tokens.js seal). */
    seal(text) {
        return seal(text, this.data.seal);
    }

    /** What `sealed` holds (tokens.js unseal), or null. */
    unseal(sealed) {
        return unseal(sealed, this.data.seal);
    }

    /** What proves a short code (plain), as it's kept: scrypt, with the server's salt. */
    codeHash(plain) {
        return slowHashOf(plain, this.data.codeSalt, this.cost);
    }
}
