// The server's versions as they're installed (generated/world_server_plan.md §11, "Updating"). An
// update is unpacked into the data folder, beside the version that came with the app (or the
// archive, or Homebrew), never over it: the app stays as it was signed. The launcher (launch.js)
// runs whichever is newer. In the data folder:
//
//   versions/<version>/          a version installed by an update: server/, client/, package.json
//   versions/current.json        the one to run, and how it stands: { version, previous, state
//                                ("trying" until it's started, then "kept"), since, by, backups }
//   versions/last.json           how the last update went: { from, to, outcome ("updated" or
//                                "rolled-back"), why, when, worlds (brought forward) }
//
// If a version fails to start (or to bring a world forward) while it's being tried, everything is
// put back as it was before the update: the server's own files and every world from the backups
// made just before it (backups/server/<when>-before-update-<version>/, and each world's
// backups/<id>/<when>-before-update/), and the version before it run again. The version before
// stays until the next update.

import { execFile } from "node:child_process";
import { appendFile, cp, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BACKUPS, ensureFolder, exists, FILE_MODE, readJSON, SERVER_JOURNAL, writeJSON } from "../storage/files.js";
import { compareVersions } from "./releases.js";

const run = promisify(execFile);

/** Where the versions installed by updates are, in the data folder, and the files that say how they stand. */
export const VERSIONS = "versions";
export const CURRENT = "current.json";
export const LAST = "last.json";

/** What isn't put back from the server's own backup on a rollback: the backups, the worlds (each put back from its own), the versions, and its journal (which says what happened). */
const NOT_PUT_BACK = new Set([BACKUPS, "worlds", VERSIONS, SERVER_JOURNAL]);

/** Where the server's own code is (the folder holding server/, client/ and package.json), as it runs. */
export const CODE = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

/** A version installed by an update: its folder (in the data folder at `root`). */
export const versionFolder = (root, version) => path.join(root, VERSIONS, version);

/** The entry every version keeps, for a launcher older than it (launch.js): its server, run. */
export const ENTRY = "server/serve.js";

/**
 * How the server running from `code` was installed, so how it's updated: { kind, commands }.
 * "checkout" (a copy of the repository: git pull, then start it again), "homebrew" (brew upgrade),
 * or one it updates itself: "app" (inside the Mac app), "installed" (an update in the data
 * folder), "archive" (a release's archive, unpacked by hand). Commands are what its owner types
 * for the kinds it doesn't update itself.
 */
export async function installOf(code = CODE) {
    if (await exists(path.join(code, ".git"))) {
        return { kind: "checkout", commands: [`cd ${code}`, "git pull", "npm run world-server"] };
    }

    if (/[\\/]Cellar[\\/]pellagos-server[\\/]/.test(code)) {
        return { kind: "homebrew", commands: ["brew update", "brew upgrade pellagos-server", "brew services restart pellagos-server"] };
    }

    if (/\.app[\\/]Contents[\\/]Resources[\\/]app$/.test(code)) {
        return { kind: "app", commands: null };
    }

    if (path.basename(path.dirname(code)) === VERSIONS) {
        return { kind: "installed", commands: null };
    }

    return { kind: "archive", commands: null };
}

/** Whether a kind of install updates itself. */
export const updatesItself = (kind) => kind === "app" || kind === "installed" || kind === "archive";

/** versions/current.json (the version to run, and how it stands), or null. */
export async function readCurrent(root) {
    return readJSON(path.join(root, VERSIONS, CURRENT)).catch(() => null);
}

export async function writeCurrent(root, current) {
    await ensureFolder(path.join(root, VERSIONS));

    if (current) {
        await writeJSON(path.join(root, VERSIONS, CURRENT), current);
    } else {
        await rm(path.join(root, VERSIONS, CURRENT), { force: true });
    }
}

/** versions/last.json (how the last update went), or null. */
export async function readLast(root) {
    return readJSON(path.join(root, VERSIONS, LAST)).catch(() => null);
}

export async function writeLast(root, last) {
    await ensureFolder(path.join(root, VERSIONS));
    await writeJSON(path.join(root, VERSIONS, LAST), last);
}

/**
 * Which server to run, of the one the launcher came with (`own`: { version, code }) and the one
 * installed by an update (versions/current.json): the newer, if it's there whole. { version,
 * code, trying (the update's being tried), current }.
 */
export async function chooseVersion(root, own) {
    const current = await readCurrent(root);

    if (current?.version && compareVersions(current.version, own.version) > 0) {
        const code = versionFolder(root, current.version);

        if (await exists(path.join(code, ENTRY))) {
            return { version: current.version, code, trying: current.state === "trying", current };
        }
    }

    return { version: own.version, code: own.code, trying: false, current };
}

/**
 * A release's archive (its bytes in `file`) unpacked into versions/<version>/: its one folder
 * (pellagos-server-<version>/) checked to hold that version's server, then moved in whole.
 * Returns the folder.
 */
export async function unpackRelease(root, file, version) {
    const into = versionFolder(root, version);
    const unpacking = path.join(root, VERSIONS, `.unpacking-${version}`);

    await rm(unpacking, { recursive: true, force: true });
    await ensureFolder(unpacking);

    try {
        await run("tar", ["-xzf", file, "-C", unpacking]);

        const inside = await readdir(unpacking);

        if (inside.length !== 1) {
            throw new Error(`The archive holds ${inside.length} things, not one folder.`);
        }

        const folder = path.join(unpacking, inside[0]);
        const named = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8")).version;

        if (named !== version) {
            throw new Error(`The archive is version ${named}, not ${version}.`);
        }

        if (!(await exists(path.join(folder, ENTRY)))) {
            throw new Error(`The archive has no ${ENTRY}.`);
        }

        await rm(into, { recursive: true, force: true });
        await rename(folder, into);

        return into;
    } finally {
        await rm(unpacking, { recursive: true, force: true });
    }
}

/**
 * The versions installed but no longer wanted let go: all but `keep` (the one run, and the one
 * before it).
 */
export async function tidyVersions(root, keep) {
    const folder = path.join(root, VERSIONS);

    for (const name of await readdir(folder).catch(() => [])) {
        if (name !== CURRENT && name !== LAST && !keep.includes(name)) {
            await rm(path.join(folder, name), { recursive: true, force: true });
        }
    }
}

/**
 * An update that failed (`current`: versions/current.json, being tried; `why`: what went wrong)
 * undone: the server's own files and every world put back from the backups made before it, the
 * version before it run again (versions/current.json naming it, or gone if it's the launcher's
 * own), the failed version let go, and versions/last.json saying so. Returns the last.json written.
 */
export async function rollBack(root, current, why, { own, when = new Date() } = {}) {
    const backups = current.backups ?? {};

    if (backups.server) {
        const from = path.join(root, BACKUPS, "server", backups.server);

        for (const name of await readdir(root)) {
            if (!NOT_PUT_BACK.has(name)) {
                await rm(path.join(root, name), { recursive: true, force: true });
            }
        }

        for (const name of await readdir(from)) {
            if (!NOT_PUT_BACK.has(name)) {
                await cp(path.join(from, name), path.join(root, name), { recursive: true });
            }
        }
    }

    for (const [id, backup] of Object.entries(backups.worlds ?? {})) {
        const world = path.join(root, "worlds", id);
        const from = path.join(root, BACKUPS, id, backup);

        if (await exists(from)) {
            await rm(world, { recursive: true, force: true });
            await cp(from, world, { recursive: true });
        }
    }

    const previous = current.previous && own && compareVersions(current.previous, own.version) > 0 && (await exists(path.join(versionFolder(root, current.previous), ENTRY)));

    await writeCurrent(root, previous ? { version: current.previous, previous: null, state: "kept", since: when.toISOString(), by: null, backups: null } : null);
    await rm(versionFolder(root, current.version), { recursive: true, force: true });

    const last = { from: current.previous, to: current.version, outcome: "rolled-back", why, when: when.toISOString(), worlds: null };

    await writeLast(root, last);
    await journalLine(root, `The update to ${current.version} didn't start (${why}): it was rolled back to ${current.previous}, the server's settings and every world put back as they were before it.`, when);

    return last;
}

/** A line in the server's own journal (as manage.js writes it), from the launcher. */
export async function journalLine(root, text, when = new Date()) {
    await appendFile(path.join(root, SERVER_JOURNAL), `${when.toISOString()} ${text}\n`, { mode: FILE_MODE });
}
