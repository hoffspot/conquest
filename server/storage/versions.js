// What every version the world server keeps carries (generated/world_server_plan.md §5.1): the
// server's own version (semver, package.json's), which it writes beside what it keeps; and how
// what was kept by an older server is brought forward, a step for each version, and what was kept
// by a newer one is refused, saying which server it needs, so that going back to an older server
// can never misread anything (rolling back is restoring the backup made before the upgrade).

import { readFileSync } from "node:fs";

/** The server's version: package.json's. */
export const SERVER_VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

/**
 * Refused: `what` was kept at a newer version (`found`) than this server reads (`reads`), by the
 * server `needs` (its version: null if it didn't say), which is the one needed to open it.
 */
export class NewerDataError extends Error {
    constructor(what, { found, reads, needs = null }) {
        const by = needs ? `, written by Pellagos server ${needs}` : "";
        const use = needs ? `Pellagos server ${needs} or later` : "a newer Pellagos server";

        super(`${what} is at version ${found}${by}; this server (${SERVER_VERSION}) reads up to version ${reads}. Use ${use}, or restore the backup made before the upgrade.`);
        this.name = "NewerDataError";
        Object.assign(this, { what, found, reads, needs });
    }
}

/**
 * Refused before it's newer than what this server reads (a newer server's, NewerDataError), or
 * with no version it knows. Returns whether it's older (to be brought forward).
 */
export function checkVersion(what, { found, current, writtenBy = null }) {
    if (!Number.isInteger(found) || found < 1) {
        throw new Error(`${what} has no version this server knows (${JSON.stringify(found)}).`);
    }

    if (found > current) {
        throw new NewerDataError(what, { found, reads: current, needs: writtenBy });
    }

    return found < current;
}

/**
 * `data`, kept at version `found`, brought forward to `current` by `steps` (steps[n] takes it from
 * version n to n + 1, and returns it), or refused if it's newer (checkVersion). A step missing is
 * a mistake in the server, not in what was kept: it's refused, saying which. Returns the data.
 */
export function forward(what, data, { found, current, steps, writtenBy = null }) {
    checkVersion(what, { found, current, writtenBy });

    let moved = data;

    for (let version = found; version < current; version++) {
        if (typeof steps[version] !== "function") {
            throw new Error(`${what}: there's no way forward from version ${version} (a step's missing).`);
        }

        moved = steps[version](moved);
    }

    return moved;
}
