// The worlds the server keeps (generated/world_server_plan.md §5), each in a folder of its own,
// named by an id that never changes (so links and backups outlive a rename):
//
//   worlds/<id>/
//     world.json                 what it is: name, description, seed, home people, made when and
//                                by whom, heroes kept or brought in, its settings, time played,
//                                the world's time (its battle's, and its days': elapsed), the
//                                versions it was saved at (formatVersion)
//     state/now.json.gz          the latest snapshot of it (core/host.js snapshot, as core/wire.js
//                                writes it, gzipped)
//     state/auto-1..5.json.gz    the five before it, newest first
//     heroes/<player-id>/<n>.json   the heroes it keeps (heroes.js)
//     visitors/<character-id>.json  what it remembers of each who's visited it, a world whose
//                                players bring their own (visitors.js)
//     journal.log                what's happened to it, a line each
//     crashes.json               the last crash reports its players' games sent (crashes.js)
//
// Every save first moves the snapshots kept down the ring (the oldest gone), then writes the new
// one whole (files.js), so there are always five to go back to. If the latest won't read (cut
// short, or spoilt), the newest that does is carried on from, and the journal says so.

import { randomBytes } from "node:crypto";
import { appendFile, cp, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { elapsedOf } from "../../client/js/core/daytime.js";
import { decode, encode } from "../../client/js/core/wire.js";
import { RACE } from "../../client/js/core/worldplan/plan.js";
import { CRASHES_FILE, CrashReports } from "./crashes.js";
import { BACKUPS, ensureFolder, exists, FILE_MODE, readGzip, readJSON, stampOf, writeGzip, writeJSON } from "./files.js";
import { KeptHeroes } from "./heroes.js";
import { Visitors } from "./visitors.js";
import { schemaReason } from "./settings.js";
import { forward, SERVER_VERSION } from "./versions.js";

/** world.json's version: bump it, with a step in FORMAT_STEPS, when what it holds changes. */
export const FORMAT_VERSION = 1;

/** The steps that bring an older server's world.json forward: [n] takes it from version n to n + 1. */
export const FORMAT_STEPS = Object.freeze({});

/** How many snapshots are kept before the latest. */
export const AUTOSAVES = 5;

/** The folders and files of the worlds (in the data folder), and of each. */
export const WORLDS = "worlds";
export const WORLD_FILE = "world.json";
export const STATE = "state";
export const NOW = "now.json.gz";
export const HEROES = "heroes";
export const VISITORS = "visitors";
export const JOURNAL = "journal.log";

/** The autosave `n` (1, the newest, to AUTOSAVES)'s file. */
export const autosaveName = (n) => `auto-${n}.json.gz`;

/**
 * The backups made as it's saved, besides the autosaves (generated/world_server_plan.md §5): one an
 * hour, the last 12 kept, and one a day, the last 7. Those made before something that can't be
 * undone (a restore, a fresh start, a deletion), or by hand, are kept till they're deleted.
 */
export const LADDER = Object.freeze({ hourly: { every: 3600000, keep: 12 }, daily: { every: 86400000, keep: 7 } });

/** A backup's folder's name: when it was made (files.js stampOf), and why. */
export const BACKUP_NAME = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)-([a-z0-9-]+)$/;

/** When a backup was made, from its folder's name (or null if it isn't one's). */
export function backupWhen(name) {
    const stamp = BACKUP_NAME.exec(name)?.[1];

    return stamp ? new Date(stamp.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z")) : null;
}

/** Whose heroes a world keeps: the world's (kept), or the players' own, brought in each time. */
export const HERO_MODES = Object.freeze(["kept", "brought"]);

/** In a world that keeps them, a player's first hero there: made new, or one of theirs brought in. */
export const FIRST_HEROES = Object.freeze(["new", "bring"]);

/**
 * What a world does with its players' characters (docs/SERVER.md *Characters and worlds*), as its
 * players are told it, each as the heroes mode and the first-hero rule it's kept as (RULE_MODES):
 * - `visiting`: they bring a character of their own each time, the one on their device the
 *   master, synced as they play, and gone from the world when they leave;
 * - `copies`: each character of theirs copied in once, the copy the world's own from then on,
 *   never to leave it (nothing done in it goes back to the one on their device);
 * - `own`: characters made in the world, its own; one taken home is moved out of it for good.
 */
export const CHARACTER_RULES = Object.freeze(["visiting", "copies", "own"]);

/** Each character rule (CHARACTER_RULES) as the heroes mode and first-hero rule a world's kept with. */
export const RULE_MODES = Object.freeze({ visiting: Object.freeze({ heroes: "brought", firstHero: "new" }), copies: Object.freeze({ heroes: "kept", firstHero: "bring" }), own: Object.freeze({ heroes: "kept", firstHero: "new" }) });

/** A world's character rule (CHARACTER_RULES), from its heroes mode and first-hero rule. */
export const ruleOf = ({ heroes, firstHero }) => (heroes === "brought" ? "visiting" : firstHero === "bring" ? "copies" : "own");

/**
 * Whether a world's offline (its `state`): taken out of play by its owner or the admin for upkeep
 * (manage.js takeOffline), nobody let in till it's brought back. Its character rule's changed
 * only while nobody's in it: offline, or set aside.
 */
export const isOffline = (meta) => meta?.state === "offline";

/** A world's rules, as its owner sets them (generated/world_server_plan.md §4, §10), as settings.js has a schema. */
export const WORLD_SETTINGS = Object.freeze({
    mostPlayers: { kind: "integer", min: 1, max: 8, default: 8, about: "The most players in it at once" },
    listed: { kind: "boolean", default: false, about: "Shown to anyone who asks the server what worlds it has" },
    open: { kind: "boolean", default: false, about: "Open to anyone: whoever opens the server may come in, no key or link needed (shown to them too)" },
    pauseWhenHidden: { kind: "boolean", default: true, about: "Stopped while its one player's page is hidden (never while anyone else is in it)" },
    trustedMayInvite: { kind: "boolean", default: false, about: "Trusted players may give others keys" },
    debugCommands: { kind: "boolean", default: false, about: "Its owners may use the debug commands (a field battle, say)" },
});

// A world's id: ten letters and digits (made at random); never "server", whose backups are the server's own
const ID = /^[a-z0-9]{10}$/;
const LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A new world's id, at random. */
export function newWorldId() {
    return [...randomBytes(10)].map((byte) => LETTERS[byte % LETTERS.length]).join("");
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// A snapshot as it's kept, read back: gunzipped and decoded, and something like a world's (else
// it's taken to be spoilt)
async function readSnapshot(file) {
    const snapshot = decode(await readGzip(file));

    if (!isObject(snapshot) || !Number.isInteger(snapshot.version) || !isObject(snapshot.battle)) {
        throw new Error("it isn't a snapshot of a world");
    }

    return snapshot;
}

/** One world the server keeps. */
export class StoredWorld {
    #saving = Promise.resolve();

    constructor(folder, meta, writtenBy = SERVER_VERSION) {
        /** Where it's kept, what it is (world.json, as it was last written), and the server that wrote that. */
        this.folder = folder;
        this.meta = meta;
        this.writtenBy = writtenBy;

        /** The heroes it keeps for its players. */
        this.heroes = new KeptHeroes(path.join(folder, HEROES));

        /** What it remembers of those who've visited it, a world whose players bring their own. */
        this.visitors = new Visitors(path.join(folder, VISITORS));

        /** The last crash reports its players' games sent, for the server's admin. */
        this.crashes = new CrashReports(path.join(folder, CRASHES_FILE));
    }

    get id() {
        return this.meta.id;
    }

    #state(name) {
        return path.join(this.folder, STATE, name);
    }

    /** A world's folder opened: its world.json brought forward if an older server wrote it, refused if a newer one did. */
    static async open(folder) {
        const { formatVersion, writtenBy = null, ...meta } = await readJSON(path.join(folder, WORLD_FILE));

        return new StoredWorld(folder, forward(`The world kept in ${folder}`, meta, { found: formatVersion, current: FORMAT_VERSION, steps: FORMAT_STEPS, writtenBy }), writtenBy);
    }

    /**
     * What it is, read again from its world.json: while a world runs, its thread (world-worker.js)
     * keeps it and writes it as it saves, so the supervisor reads it again once the thread's ended.
     */
    async reload() {
        const fresh = await StoredWorld.open(this.folder);

        this.meta = fresh.meta;
        this.writtenBy = fresh.writtenBy;
    }

    /** Its saves' files' names, newest first (now, then the autosaves). */
    static get saves() {
        return [NOW, ...Array.from({ length: AUTOSAVES }, (_, k) => autosaveName(k + 1))];
    }

    /**
     * The newest of its saves that reads and passes `test` (a snapshot: true to take it), as
     * { snapshot, from }, or null if none does.
     */
    async newest(test = () => true) {
        for (const name of StoredWorld.saves) {
            const file = this.#state(name);

            if (!(await exists(file))) {
                continue;
            }

            try {
                const snapshot = await readSnapshot(file);

                if (test(snapshot)) {
                    return { snapshot, from: name };
                }
            } catch {
                // (Spoilt: the next)
            }
        }

        return null;
    }

    /** Where its backups are: the data folder's backups/<id>/. */
    get backupsFolder() {
        return path.join(path.dirname(path.dirname(this.folder)), BACKUPS, this.id);
    }

    /**
     * A copy of everything kept of it, made before something's done to it that can't be undone,
     * by hand, or on the hour and the day (LADDER): in the data folder's backups,
     * backups/<id>/<when>-<why>/ (its journal says so). It waits for the saves asked for before it,
     * so it's never copied while one's written. Returns where.
     */
    backUp(why, when = new Date()) {
        const backing = this.#saving.then(() => this.#copy(why, when));

        this.#saving = backing.catch(() => {});

        return backing;
    }

    async #copy(why, when) {
        const into = path.join(this.backupsFolder, `${stampOf(when)}-${why}`);

        await ensureFolder(this.backupsFolder);
        await cp(this.folder, into, { recursive: true });
        await this.journal(`Backed up (${why}).`, when);

        return into;
    }

    /** Its backups (besides the autosaves), newest first: [{ id (its folder's name), when, why, folder }]. */
    async backups() {
        if (!(await exists(this.backupsFolder))) {
            return [];
        }

        return (await readdir(this.backupsFolder))
            .map((name) => ({ id: name, when: backupWhen(name), why: BACKUP_NAME.exec(name)?.[2], folder: path.join(this.backupsFolder, name) }))
            .filter((backup) => backup.when)
            .sort((a, b) => b.when - a.when);
    }

    // The hourly and daily backups (LADDER): one made if the last is that long ago, the oldest past
    // those kept let go
    async #ladder(when) {
        const backups = await this.backups();

        for (const [why, { every, keep }] of Object.entries(LADDER)) {
            const rung = backups.filter((backup) => backup.why === why);

            if (!rung.length || when - rung[0].when >= every) {
                rung.unshift({ folder: await this.#copy(why, when) });
            }

            for (const old of rung.slice(keep)) {
                await rm(old.folder, { recursive: true, force: true });
            }
        }
    }

    /** world.json written again, as `meta` now is (and changes, if any). */
    async writeMeta(changes = {}) {
        Object.assign(this.meta, changes);
        await writeJSON(path.join(this.folder, WORLD_FILE), { formatVersion: FORMAT_VERSION, writtenBy: SERVER_VERSION, ...this.meta });
    }

    /**
     * The world as it now is kept (`snapshot`: core/host.js snapshot, taken between steps): the
     * latest moved down the ring and this written in its place, then world.json (its world time,
     * the versions it was saved at, when; `played`, the time it's been played in all, if it's
     * said). `why` goes in the journal (not for a war turn's: there's one a minute). Saves go one
     * at a time, in the order they're asked for; it's encoded as it's asked for, so the world
     * can go on at once. Returns when it's on the disk.
     */
    save(snapshot, { why = "saved", played = null, when = () => new Date() } = {}) {
        const text = encode(snapshot);
        const saving = this.#saving.then(() => this.#write(text, snapshot, { why, played, when }));

        this.#saving = saving.catch(() => {});

        return saving;
    }

    async #write(text, snapshot, { why, played, when }) {
        await ensureFolder(path.join(this.folder, STATE));

        for (let n = AUTOSAVES - 1; n >= 1; n--) {
            if (await exists(this.#state(autosaveName(n)))) {
                await rename(this.#state(autosaveName(n)), this.#state(autosaveName(n + 1)));
            }
        }

        if (await exists(this.#state(NOW))) {
            await rename(this.#state(NOW), this.#state(autosaveName(1)));
        }

        await writeGzip(this.#state(NOW), text);

        const at = when();

        await this.writeMeta({
            worldTime: snapshot.battle?.time ?? 0,
            elapsed: elapsedOf(snapshot.war),
            versions: { snapshot: snapshot.version, war: snapshot.war?.version ?? null },
            savedAt: at.toISOString(),
            ...(played === null ? {} : { played }),
        });

        if (why !== "turn") {
            await this.journal(`Saved (${why}).`, at);
        }

        await this.#ladder(at);
    }

    /**
     * The latest snapshot of it that reads: { snapshot, from (its file's name), passed (those
     * newer that didn't read: [{ name, reason }]) }, the journal told if it wasn't the latest;
     * or { snapshot: null } if it's never been saved (a new world, made from its seed). Throws if
     * it's been saved but none reads (generated/world_server_plan.md §5.1: its owner's offered a
     * fresh start from the seed).
     */
    async load({ when = () => new Date() } = {}) {
        const passed = [];

        for (const name of StoredWorld.saves) {
            const file = this.#state(name);

            if (!(await exists(file))) {
                continue;
            }

            try {
                const snapshot = await readSnapshot(file);

                if (passed.length) {
                    await this.journal(`${passed.map(({ name: each, reason }) => `${each} couldn't be read (${reason})`).join("; ")}: carried on from ${name}.`, when());
                }

                return { snapshot, from: name, passed };
            } catch (error) {
                passed.push({ name, reason: error.message });
            }
        }

        if (passed.length) {
            await this.journal(`None of its saves could be read: ${passed.map(({ name, reason }) => `${name} (${reason})`).join("; ")}.`, when());

            throw new Error(`None of world ${this.id}'s saves could be read: ${passed.map(({ name, reason }) => `${name} (${reason})`).join("; ")}.`);
        }

        return { snapshot: null, from: null, passed };
    }

    /** A line in its journal (when it was, then what). */
    async journal(text, when = new Date()) {
        await ensureFolder(this.folder);
        await appendFile(path.join(this.folder, JOURNAL), `${when.toISOString()} ${text}\n`, { mode: FILE_MODE });
    }
}

/** The worlds the server keeps (in its data folder's worlds/). */
export class WorldStore {
    /** @param {string} root - The data folder. */
    constructor(root) {
        this.folder = path.join(root, WORLDS);
    }

    #folderOf(id) {
        if (typeof id !== "string" || !ID.test(id)) {
            throw new Error(`Not a world's id: ${JSON.stringify(id)}`);
        }

        return path.join(this.folder, id);
    }

    /**
     * A new world kept: its name, description, seed and home people (`race`), who made it (a
     * player's id, if one did), whose heroes it keeps (HERO_MODES), a kept world's first heroes
     * (FIRST_HEROES), and its settings (WORLD_SETTINGS: those not given, their defaults). Refused,
     * with the reason, if any of it can't be. Not yet saved: it's made from its seed when it's
     * first played.
     */
    async create({ name, description = "", seed, race, creator = null, heroes = "kept", firstHero = "new", settings = {} }, { id = newWorldId(), when = new Date() } = {}) {
        const reasons = [
            typeof name === "string" && name.trim() && name.trim().length <= 60 ? null : "A world needs a name, of 60 characters at most.",
            typeof description === "string" && description.length <= 500 ? null : "A world's description is 500 characters at most.",
            Number.isSafeInteger(seed) && seed >= 0 ? null : `A world's seed is a whole number, not ${JSON.stringify(seed)}.`,
            RACE[race] ? null : `There's no people called ${JSON.stringify(race)}.`,
            HERO_MODES.includes(heroes) ? null : `Heroes are kept or brought in, not ${JSON.stringify(heroes)}.`,
            FIRST_HEROES.includes(firstHero) ? null : `A first hero is made new or brought in, not ${JSON.stringify(firstHero)}.`,
            ...(isObject(settings) ? Object.entries(settings).map(([key, value]) => schemaReason(WORLD_SETTINGS, key, value)) : ["A world's settings are an object."]),
        ].filter(Boolean);

        if (reasons.length) {
            throw new Error(reasons.join(" "));
        }

        const folder = this.#folderOf(id);

        if (await exists(folder)) {
            throw new Error(`There's a world ${id} already.`);
        }

        const defaults = Object.fromEntries(Object.entries(WORLD_SETTINGS).map(([key, { default: value }]) => [key, value]));
        const world = new StoredWorld(folder, {
            id,
            name: name.trim(),
            description,
            seed,
            race,
            created: when.toISOString(),
            creator,
            heroes,
            firstHero,
            settings: { ...defaults, ...settings },
            played: 0,
            worldTime: 0,
            elapsed: 0,
            versions: null,
            savedAt: null,
        });

        await ensureFolder(folder);
        await world.writeMeta();
        await world.journal(`Made${creator ? ` by ${creator}` : ""}: "${world.meta.name}", seed ${seed}, home people ${RACE[race].name}.`, when);

        return world;
    }

    /** The ids of the worlds kept. */
    async ids() {
        if (!(await exists(this.folder))) {
            return [];
        }

        return (await readdir(this.folder)).filter((name) => ID.test(name)).sort();
    }

    /** A world kept (StoredWorld.open: refused if a newer server wrote it). */
    async open(id) {
        return StoredWorld.open(this.#folderOf(id));
    }
}
