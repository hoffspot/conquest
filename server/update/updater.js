// Updating the server, as its owner asks on the management page (generated/world_server_plan.md
// §11, "Updating"; §5.1). Once a day (its checkUpdates setting) it asks the project's releases
// whether there's a newer version (releases.js), and the page says so, with its notes. Nothing
// updates itself: the owner clicks Update. Then, never while players are in: the release's
// archive is downloaded and checked (releases.js): against its signature, with the project's
// Ed25519 key, if the server has the key's public half; otherwise against the SHA-256 GitHub keeps
// for it, as the Mac installer checks its zip. Every world and the server's own files are backed
// up; the archive's unpacked beside the version running (installed.js), and the server saves
// every world, stops, and is started again by its launcher (launch.js) as the new version, which
// brings every world forward before it says it's running. If it can't, the launcher goes back to
// the version before and puts everything back from those backups, and the page says why.
//
// A server run from a copy of the repository, or Homebrew's, isn't updated this way: the page
// shows the commands that update it instead.

import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Refused } from "../manage.js";
import { BACKUPS, ensureFolder, stampOf } from "../storage/files.js";
import { SERVER_VERSION } from "../storage/versions.js";
import { CODE, installOf, readCurrent, readLast, unpackRelease, updatesItself, VERSIONS, writeCurrent } from "./installed.js";
import { compareVersions, fetchBytes, fetchLatest, readReleaseKey, RELEASES, sha256Of, verifySignature } from "./releases.js";

/** How often it asks whether there's a new version (ms), and how long after it starts it first asks. */
export const CHECK_EVERY = 24 * 3600000;
export const FIRST_CHECK = 60000;

/** What doesn't go in the backup of the server's own files: the worlds (each backed up on its own), the backups, the versions. */
const NOT_SERVERS = new Set([BACKUPS, "worlds", VERSIONS]);

// Why `release` can't be checked by a server with the project's key (`key`) or without
function uncheckable(release, key) {
    return key
        ? `Version ${release.version} isn't signed with the project's key, which this server checks new versions with: install it by hand.`
        : `GitHub doesn't say what version ${release.version}'s archive should be (its SHA-256), so it can't be checked: install it by hand.`;
}

export class Updater {
    /**
     * The server's updates (`server`: world-server.js's). `releases` is where releases are listed,
     * `key` the project's public key (PEM; null if there's none), `code` where the server running
     * is (installed.js installOf says how it was installed); `fetch` and `clock` are for the tests.
     */
    constructor(server, { releases = RELEASES, key = readReleaseKey(), code = CODE, fetch = globalThis.fetch, clock = () => new Date() } = {}) {
        Object.assign(this, { server, releases, key, code, fetch, clock });
        this.root = server.root;

        /** What the last check found: { at, latest (releases.js latestRelease's, or null), error }, or null if it's never asked. */
        this.checked = null;

        /** An update under way: { version, stage, by }, or null. */
        this.busy = null;

        /** Why the last update asked for failed before the server stopped for it: { version, why, at }, or null. */
        this.failed = null;
        this.timer = null;
    }

    /** It asks once a day (after a minute), while its setting's on. */
    start() {
        const ask = () => {
            if (this.server.settings.get("checkUpdates")) {
                this.check().catch(() => {});
            }
        };

        this.timer = setTimeout(() => {
            ask();
            this.timer = setInterval(ask, CHECK_EVERY);
            this.timer.unref?.();
        }, FIRST_CHECK);
        this.timer.unref?.();
    }

    close() {
        clearTimeout(this.timer);
        clearInterval(this.timer);
    }

    /** Asks whether there's a new version now. Returns state(). */
    async check() {
        try {
            this.checked = { at: this.clock().toISOString(), latest: await fetchLatest({ url: this.releases, fetch: this.fetch }), error: null };
        } catch (error) {
            this.checked = { at: this.clock().toISOString(), latest: this.checked?.latest ?? null, error: error.message };
        }

        return this.state();
    }

    /** The newer version found, if there is one: releases.js latestRelease's. */
    get newer() {
        const latest = this.checked?.latest;

        return latest && compareVersions(latest.version, SERVER_VERSION) > 0 ? latest : null;
    }

    // How `release`'s archive is checked: "signature" (the project's key, if this server has it,
    // and the release is signed), "sha256" (no key: the SHA-256 GitHub keeps for it), or null if
    // it can't be
    #checkedBy(release) {
        if (this.key) {
            return release.signature ? "signature" : null;
        }

        return release.sha256 ? "sha256" : null;
    }

    // Players in any world now
    #playersIn() {
        return [...this.server.registry.entries.values()].reduce((sum, entry) => sum + (entry.thread?.state?.present ?? 0), 0);
    }

    /**
     * How updating stands, for the page: { version (running), install: { kind, commands },
     * checks (its setting), checked, newer, key (whether it has the project's key), checkedBy (how
     * the newer version would be checked: #checkedBy, null if it can't be), busy, failed, last
     * (installed.js last.json: how the last update went), current }.
     */
    async state() {
        const install = await installOf(this.code);

        return {
            version: SERVER_VERSION,
            install,
            checks: Boolean(this.server.settings.get("checkUpdates")),
            checked: this.checked,
            newer: this.newer,
            key: Boolean(this.key),
            checkedBy: this.newer ? this.#checkedBy(this.newer) : null,
            playersIn: this.#playersIn(),
            busy: this.busy,
            failed: this.failed,
            last: await readLast(this.root),
            current: await readCurrent(this.root),
        };
    }

    /**
     * The update to `version` (the newer one found) begun, if it can be: refused if this server
     * isn't updated this way (with the commands that do), if it isn't the newer version found, if
     * it can't be checked (#checkedBy), if players are in, or if one's already under way. It
     * carries on after this returns: { updating: version }. `onRestart` is called once it's ready
     * (the server then saves every world and stops, for its launcher to start the new version).
     */
    async update({ version, by = null }) {
        const install = await installOf(this.code);

        if (!updatesItself(install.kind)) {
            throw new Refused(409, "not-here", `This server is run from ${install.kind === "homebrew" ? "Homebrew" : "a copy of the repository"}: update it with ${install.commands.join(", then ")}.`);
        }

        const newer = this.newer;

        if (!newer || newer.version !== version) {
            throw new Refused(409, "not-newer", newer ? `The newer version is ${newer.version}, not ${version}.` : "There's no newer version to update to: check again.");
        }

        if (!this.#checkedBy(newer)) {
            throw new Refused(409, "unchecked", uncheckable(newer, this.key));
        }

        const playing = this.#playersIn();

        if (playing) {
            throw new Refused(409, "players-in", `${playing === 1 ? "A player is" : `${playing} players are`} in: update when nobody's in, or set their worlds aside (they're sent out).`);
        }

        if (this.busy) {
            throw new Refused(409, "busy", `It's already updating to ${this.busy.version}.`);
        }

        this.busy = { version, stage: "downloading", by };
        this.failed = null;
        this.#install(newer, by).catch((error) => {
            this.failed = { version, why: error.message, at: this.clock().toISOString() };
            this.busy = null;
            this.server.manage.journal(`The update to ${version} stopped: ${error.message}`).catch(() => {});
        });

        return { updating: version };
    }

    async #install(release, by) {
        const { version } = release;
        const work = await mkdtemp(path.join(os.tmpdir(), "pellagos-update-"));

        try {
            const archive = await fetchBytes(release.archive, { fetch: this.fetch });

            if (this.key) {
                const signature = (await fetchBytes(release.signature, { fetch: this.fetch, limit: 4096 })).toString("utf8");

                this.busy.stage = "checking";

                if (!verifySignature(archive, signature, this.key)) {
                    throw new Error(`Version ${version}'s archive isn't signed by the project's key: it wasn't installed.`);
                }
            } else {
                this.busy.stage = "checking";

                if (sha256Of(archive) !== release.sha256) {
                    throw new Error(`Version ${version}'s archive isn't the one GitHub has (its SHA-256 isn't the one GitHub keeps for it): it wasn't installed.`);
                }
            }

            // (Nobody's come in while it downloaded: if they have, it waits for another click)
            if (this.#playersIn()) {
                throw new Error("Players came in while it downloaded: update when nobody's in.");
            }

            this.busy.stage = "backing-up";

            const when = this.clock();
            const backups = { server: await this.#backUpServer(`${stampOf(when)}-before-update-${version}`), worlds: {} };

            for (const [id, stored] of this.server.worlds) {
                if (this.server.registry.lifeOf(id).life !== "stored") {
                    await this.server.manage.setAside(id, `set aside for the update to ${version}`);
                }

                backups.worlds[id] = path.basename(await stored.backUp("before-update", when));
            }

            this.busy.stage = "unpacking";

            const file = path.join(work, "release.tar.gz");

            await writeFile(file, archive);
            await unpackRelease(this.root, file, version);
            await writeCurrent(this.root, { version, previous: SERVER_VERSION, state: "trying", since: when.toISOString(), by, backups });
            await this.server.manage.journal(`Updating from ${SERVER_VERSION} to ${version}${by ? `, as ${by} asked` : ""}: every world and the server's settings backed up first. The server starts again as the new version.`);

            this.busy.stage = "restarting";
            setTimeout(() => this.server.onRestart?.(), 100);
        } finally {
            await rm(work, { recursive: true, force: true });
        }
    }

    // The server's own files (not the worlds, the backups or the versions) copied into backups/server/<name>/. Returns its name
    async #backUpServer(name) {
        const into = path.join(this.root, BACKUPS, "server", name);

        await ensureFolder(into);

        for (const entry of await readdir(this.root)) {
            if (!NOT_SERVERS.has(entry)) {
                await cp(path.join(this.root, entry), path.join(into, entry), { recursive: true });
            }
        }

        return name;
    }
}
