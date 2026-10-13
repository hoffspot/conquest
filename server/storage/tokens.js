// The tokens the server keeps for others' services (generated/world_server_plan.md §13: a DuckDNS
// or DNS host's token), where a system has no keychain of its own (platform/: macOS keeps them in
// its Keychain): tokens.json in the server's certificates folder, 0600 in a folder 0700, never
// shown again once it's in, never logged.
//
//   { "acme:duckdns": "…", … }

import { rm } from "node:fs/promises";
import path from "node:path";
import { ensureFolder, exists, readJSON, writeJSON } from "./files.js";

/** What a token may hold: what every DNS host's tokens are made of (and nothing a command line could misread). */
export const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{8,256}$/;

/** A token's name: a service, and what for (acme:duckdns). */
export const NAME_PATTERN = /^[a-z0-9-]+:[a-z0-9.-]+$/;

export class TokenFile {
    constructor(file) {
        this.file = file;
        this.where = "a file only this computer's account can read";
    }

    async #all() {
        return (await exists(this.file)) ? readJSON(this.file) : {};
    }

    /** A token, or null if there's none by that name. */
    async get(name) {
        return (await this.#all())[name] ?? null;
    }

    /** A token kept under `name`. */
    async set(name, token) {
        if (!NAME_PATTERN.test(name) || !TOKEN_PATTERN.test(token)) {
            throw new Error("That doesn't look like a token.");
        }

        await ensureFolder(path.dirname(this.file));
        await writeJSON(this.file, { ...(await this.#all()), [name]: token });
    }

    /** A token let go. */
    async remove(name) {
        const { [name]: gone, ...rest } = await this.#all();

        if (Object.keys(rest).length) {
            await writeJSON(this.file, rest);
        } else {
            await rm(this.file, { force: true });
        }

        return gone !== undefined;
    }
}
