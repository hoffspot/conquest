// What a world's owners, and the server's admin, can do besides letting people in (generated/
// world_server_plan.md §10, §12.1): what the management page shows and the API it calls does.
//
// - A world: what it is and how it is, in words; its settings changed (its heroes mode too, while
//   nobody's in it); started, set aside, saved; its players sent out, banned, given another part or
//   a new ticket; its backups listed, made, restored; exported; deleted (its name typed).
// - The server: where it can be reached (the Wi-Fi, and the internet with its certificate: one of
//   the owner's own, or a free one it gets and renews itself, certify.js), its settings, how many worlds it may run, creator keys, what's happened (the server's journal, and
//   each world's), and how it's keeping up.
//
// - The whole server as one archive (storage/archive.js): made (every world going saved first);
//   read, to say what's in it; restored, in place of everything here (on a server with no worlds
//   of its own), or its worlds brought in one by one as new worlds.
//
// Everything that changes a world it can't change while it runs (its heroes mode, a restore) sets
// it aside first, or is refused; whatever can't be undone is backed up before it's done.

import { randomBytes } from "node:crypto";
import { appendFile, cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync, gzip } from "node:zlib";
import { exportOfKept, fileOf } from "../client/js/app/character-file.js";
import { addressOf, inviteLink } from "../client/js/app/invites.js";
import { dayOf, elapsedOf, HOUR, timeOfDay } from "../client/js/core/daytime.js";
import { decode } from "../client/js/core/wire.js";
import { SNAPSHOT_STEPS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { RACE } from "../client/js/core/worldplan/plan.js";
import { isRole } from "./access/world.js";
import { ROUTES, routeWords } from "./certify.js";
import { DNS_HOSTS } from "./net/dns-hosts.js";
import { recommendation, WORLD_MEMORY } from "./registry.js";
import { bringForward, freshStart, importSolo } from "./reopen.js";
import { ARCHIVE_LIMIT, archiveFolder, ArchiveError, readArchive, stageRestore, worldBundle, worldIds, worldsIn } from "./storage/archive.js";
import { ensureFolder, exists, FILE_MODE, readGzip, readJSON, SERVER_JOURNAL, stampOf, writeGzip } from "./storage/files.js";
import { LAYOUT_VERSION } from "./storage/folder.js";
import { schemaReason } from "./storage/settings.js";
import { NewerDataError, SERVER_VERSION } from "./storage/versions.js";
import { BACKUP_NAME, FIRST_HEROES, HERO_MODES, HEROES, JOURNAL, NOW, STATE, StoredWorld, WORLD_FILE, WORLD_SETTINGS } from "./storage/worlds.js";

/** The server's own journal (in its data folder): what's done to the server, not to one world. */
export { SERVER_JOURNAL };

/** An export's (and a downloaded backup's) format: a world, its latest snapshot and its kept heroes, as one gzipped JSON file. */
export const EXPORT_FORMAT = "pellagos.world.1";

/** How big a world's file may be to be brought in (bytes: as sent, gzipped; and once unpacked). */
export const IMPORT_LIMIT = 64 * 1024 * 1024;
export const IMPORT_UNPACKED = 512 * 1024 * 1024;

/**
 * A character and their world sent to be brought to the server ("Bring my world to the
 * server": bringSolo): its format, and how big it may be (bytes, as sent, gzipped or not).
 */
export const BRING_FORMAT = "pellagos.bring.1";
export const BRING_LIMIT = 16 * 1024 * 1024;

/** How long an archive read to be restored or brought in from is kept for it (ms), and how many at once. */
export const ARCHIVE_KEPT = 30 * 60000;
const ARCHIVES_AT_ONCE = 2;

export { ARCHIVE_LIMIT };

/** How much of the journals the Activity section's shown (lines). */
export const ACTIVITY_LINES = 300;

/** A step slower than this (ms, at the 99th percentile) makes a world "slow" (§10 Health). */
export const SLOW_STEP = 50;

const gzipped = promisify(gzip);

/** A refusal of something asked of the management API: its HTTP status, a code, and what to say. */
export class Refused extends Error {
    constructor(status, error, message) {
        super(message);
        Object.assign(this, { status, error });
    }
}

// Refused: not a world's file (why, if it can be said)
const notAWorld = (why) => new Refused(400, "not-a-world", `That isn't a world exported from a Pellagos server${why ? `: ${why}` : ""}.`);

// How much a folder holds (bytes), everything in it
async function sizeOf(folder) {
    let size = 0;

    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
        const file = path.join(folder, entry.name);

        size += entry.isDirectory() ? await sizeOf(file) : ((await stat(file).catch(() => null))?.size ?? 0);
    }

    return size;
}

/** The world's day (1 the first) and the time of day ("14:05"), when it's been going `elapsed` ms. */
export function clockOf(elapsed = 0) {
    const time = timeOfDay(elapsed);
    const hours = Math.floor(time / HOUR);
    const minutes = Math.floor(((time % HOUR) / HOUR) * 60);

    return { day: dayOf(elapsed) + 1, hour: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` };
}

// "3 players", "1 player", "nobody"
const count = (n, one, many = `${one}s`) => (n ? `${n} ${n === 1 ? one : many}` : `no ${many}`);

export class Management {
    /** @param {object} server - The world server (world-server.js WorldServer). */
    constructor(server) {
        this.server = server;

        /** When it started (ms), and the most memory any world's used here (bytes: for the recommendation). */
        this.started = Date.now();
        this.largest = 0;

        /** Archives read, to be restored or brought in from: id → { archive, at }. */
        this.archives = new Map();
    }

    #world(id) {
        const stored = this.server.worlds.get(id);

        if (!stored) {
            throw new Refused(404, "no-world", "There's no world here by that name.");
        }

        return stored;
    }

    #going(id) {
        return Boolean(this.server.registry.entries.get(id)?.thread);
    }

    /** A line in the server's own journal. */
    async journal(text, when = new Date()) {
        await ensureFolder(this.server.root);
        await appendFile(path.join(this.server.root, SERVER_JOURNAL), `${when.toISOString()} ${text}\n`, { mode: FILE_MODE });
    }

    // ---- A world

    /** How a world is, in words (§10): "Running: 3 players, day 4, 14:00", "Set aside: saved, using nothing"... */
    wordsOf(id) {
        const { life, state, position } = this.server.registry.lifeOf(id);
        const meta = this.server.metaOf(id);
        const { day, hour } = clockOf(state?.elapsed ?? meta.elapsed ?? 0);
        const players = state?.players.filter((one) => one.id).length ?? 0;

        switch (life) {
            case "waiting":
                return `Waiting its turn to open (${position === 1 ? "next" : `number ${position}`}): as many worlds are running as the server's set to run.`;
            case "loading":
                return "Opening.";
            case "running":
                return state?.running ? `Running: ${count(players, "player")}, day ${day}, ${hour}.` : `Stopped while its ${count(players, "player")} ${players === 1 ? "is" : "are"} away or loading: day ${day}, ${hour}.`;
            case "empty":
                return `Empty: its clock stopped at day ${day}, ${hour}. It's set aside if nobody comes in within ${count(this.server.settings.get("setAsideMinutes"), "minute")}.`;
            case "stopping":
                return "Saving, then set aside.";
            default:
                return meta.savedAt ? `Set aside: saved at day ${day}, ${hour}, using nothing till someone comes in.` : "Never played: made from its seed when someone first comes in.";
        }
    }

    /** All a world's owner is shown of it (the Worlds section's card). */
    async details(id) {
        const stored = this.#world(id);
        const { meta } = stored;
        const { life, state, position } = this.server.registry.lifeOf(id);
        const elapsed = state?.elapsed ?? meta.elapsed ?? 0;

        return {
            id,
            name: meta.name,
            description: meta.description,
            race: meta.race,
            people: RACE[meta.race]?.name ?? meta.race,
            seed: meta.seed,
            created: meta.created,
            creator: meta.creator,
            heroes: meta.heroes,
            firstHero: meta.firstHero,
            settings: meta.settings,
            played: state?.played ?? meta.played ?? 0,
            elapsed,
            ...clockOf(elapsed),
            savedAt: meta.savedAt,
            life,
            position,
            words: this.wordsOf(id),
            players: (state?.players ?? []).filter((one) => one.id).map(({ player, name, away, linked, ready, hidden }) => ({ player, name, away, linked, ready, hidden })),
            size: await sizeOf(stored.folder),
        };
    }

    /** Every world, most recently played first. */
    async worlds() {
        const all = await Promise.all([...this.server.worlds.keys()].map((id) => this.details(id)));

        return all.sort((a, b) => String(b.savedAt ?? b.created).localeCompare(String(a.savedAt ?? a.created)));
    }

    /**
     * A world's name, description, heroes mode, first-hero rule or settings changed (`changes`:
     * those to change). Each's checked first: refused, with the reasons, and nothing changed if any
     * can't be. Its heroes mode and first-hero rule change only while it's set aside (nobody's in
     * it, and its thread isn't holding the old). A running world's thread is told the rest at once.
     */
    async change(id, changes, { by = null } = {}) {
        const stored = this.#world(id);
        const { name, description, heroes, firstHero, settings } = changes;
        const reasons = [
            name === undefined || (typeof name === "string" && name.trim() && name.trim().length <= 60) ? null : "A world needs a name, of 60 characters at most.",
            description === undefined || (typeof description === "string" && description.length <= 500) ? null : "A world's description is 500 characters at most.",
            heroes === undefined || HERO_MODES.includes(heroes) ? null : `Heroes are kept or brought in, not ${JSON.stringify(heroes)}.`,
            firstHero === undefined || FIRST_HEROES.includes(firstHero) ? null : `A first hero is made new or brought in, not ${JSON.stringify(firstHero)}.`,
            ...(settings === undefined ? [] : settings !== null && typeof settings === "object" && !Array.isArray(settings) ? Object.entries(settings).map(([key, value]) => schemaReason(WORLD_SETTINGS, key, value)) : ["A world's settings are an object."]),
            ...Object.keys(changes)
                .filter((key) => !["name", "description", "heroes", "firstHero", "settings"].includes(key))
                .map((key) => `A world has nothing called "${key}" to change.`),
        ].filter(Boolean);

        if (reasons.length) {
            throw new Refused(400, "bad-request", reasons.join(" "));
        }

        const modes = (heroes !== undefined && heroes !== stored.meta.heroes) || (firstHero !== undefined && firstHero !== stored.meta.firstHero);

        if (modes && this.#going(id)) {
            throw new Refused(409, "running", "Set the world aside first: whose heroes it keeps changes only while nobody's in it.");
        }

        const meta = {
            ...(name === undefined ? {} : { name: name.trim() }),
            ...(description === undefined ? {} : { description }),
            ...(heroes === undefined ? {} : { heroes }),
            ...(firstHero === undefined ? {} : { firstHero }),
            ...(settings === undefined ? {} : { settings: { ...stored.meta.settings, ...settings } }),
        };

        await stored.writeMeta(meta);
        this.server.registry.entries.get(id)?.thread?.meta(meta);

        // (Opened to anyone: its door made now, so it's among its keys at once)
        if (settings?.open === true) {
            await this.server.access.openDoor(id, { by });
        }

        const what = [name !== undefined && `named "${meta.name}"`, description !== undefined && "described anew", heroes !== undefined && `its heroes ${heroes === "kept" ? "kept by the world" : "brought in by their players"}`, firstHero !== undefined && `first heroes ${firstHero === "bring" ? "may be brought in" : "made new"}`, settings && `its settings (${Object.entries(settings).map(([key, value]) => `${key} ${value}`).join(", ")})`].filter(Boolean);

        await stored.journal(`Changed${by ? ` by ${by}` : ""}: ${what.join("; ")}.`);

        return this.details(id);
    }

    /**
     * A world's invite link (app/invites.js): its players' key (made if it hasn't one that works),
     * on the game's page at the server's own address: its internet address if it has one, so it
     * works anywhere; else its Wi-Fi's (WorldServer invitePage). Or `replace`d: a new players' key,
     * the old links letting nobody else in, those who came by them kept (access/index.js
     * replaceInvite). Returns { link, key, page, everywhere (whether it works beyond the Wi-Fi),
     * open (whether anyone may come in without it, too) }.
     */
    async invite(id, { replace = false, by = null } = {}) {
        const { meta } = this.#world(id);
        const { access } = this.server;
        const made = replace ? await access.replaceInvite(id, { by }) : await access.inviteKey(id, { by });

        if (made.reason) {
            throw new Refused(409, "keys", `${made.reason} (under its Keys)`);
        }

        const { page, everywhere } = this.server.invitePage();
        const link = inviteLink(page, { address: addressOf(page), id: this.server.identity.id, world: id, key: made.key });

        if (replace) {
            await this.#world(id).journal(`Its invite link replaced${by ? ` by ${by}` : ""}: the old one lets nobody else in.`);
        }

        return { link, key: made.key, page, everywhere, open: meta.settings.open === true };
    }

    /** A world started (opened, as if someone were coming in): it's set aside again if nobody comes. Returns its details once it's open, or waiting. */
    async start(id) {
        this.#world(id);

        const opening = this.server.registry.enter(id);

        if (this.server.registry.lifeOf(id).life !== "waiting") {
            await opening.catch((error) => {
                throw new Refused(409, "broken", `It couldn't be opened: ${error.message}`);
            });
        } else {
            opening.catch(() => {});
        }

        return this.details(id);
    }

    /** A world set aside now: everyone in it sent out ("set-aside"), saved, its thread ended. */
    async setAside(id, why = "set aside") {
        this.#world(id);
        this.server.closePlaces((place) => place.world === id, "set-aside");

        const { ok } = await this.server.registry.setAside(id, why);

        if (!ok) {
            throw new Refused(500, "unsaved", "It was set aside, but its last save didn't reach the disk: its journal says why.");
        }

        return this.details(id);
    }

    /** A world saved now, if it's going. */
    async save(id) {
        this.#world(id);

        const thread = this.server.registry.entries.get(id)?.thread;
        const { ok } = thread ? await thread.save("saved by hand") : { ok: true };

        if (!ok) {
            throw new Refused(500, "unsaved", "Its save didn't reach the disk: its journal says why.");
        }

        return this.details(id);
    }

    /**
     * A world deleted, its name typed to say so (`confirm`): everyone in it sent out
     * ("world-deleted"), set aside, backed up once more (its backups are kept, in the data
     * folder's backups/<id>/), and gone.
     */
    async delete(id, confirm, { by = null } = {}) {
        const stored = this.#world(id);

        if (typeof confirm !== "string" || confirm.trim() !== stored.meta.name) {
            throw new Refused(400, "confirm", `Type the world's name, "${stored.meta.name}", to delete it.`);
        }

        this.server.closePlaces((place) => place.world === id, "world-deleted");
        await this.server.registry.forget(id);
        await stored.backUp("before-delete");
        this.server.access.removeWorld(id);
        this.server.worlds.delete(id);
        await rm(stored.folder, { recursive: true, force: true });
        await this.journal(`The world "${stored.meta.name}" (${id}) was deleted${by ? ` by ${by}` : ""}: its backups are kept in backups/${id}/.`);

        return { deleted: id };
    }

    // ---- Its players

    /** A world's players (§10 Players): everyone who's been, with their heroes there, who's in now and who's away. */
    async players(id) {
        const stored = this.#world(id);
        const access = this.server.access.world(id);
        const { state } = this.server.registry.lifeOf(id);
        const here = new Map((state?.players ?? []).filter((one) => one.id).map((one) => [one.player, one]));
        const kept = stored.meta.heroes === "kept";
        const players = [];

        for (const player of access.players()) {
            const now = here.get(player.id);

            players.push({
                ...player,
                via: player.via === "admin" ? "the admin key" : (access.key(player.via)?.label ?? player.via),
                heroes: kept ? (await stored.heroes.list(player.id)).map(({ slot, name, race }) => ({ slot, name, race })) : [],
                name: now?.name ?? null,
                here: Boolean(now),
                away: Boolean(now?.away),
            });
        }

        return players.sort((a, b) => Number(b.here) - Number(a.here) || String(b.seen).localeCompare(String(a.seen)));
    }

    /**
     * A player's heroes kept in a world (all of them, or the one in `slot`) as a character file
     * (client/js/app/character-file.js), as the game keeps one of its own: each in the world's land,
     * with its war as it was last saved, to be played on a device, or brought into another world.
     * { name, text, count }; refused where the world doesn't keep heroes, or they have none there.
     */
    async heroesFile(id, player, { slot = null } = {}) {
        const stored = this.#world(id);

        if (stored.meta.heroes !== "kept") {
            throw new Refused(409, "not-kept", "That world doesn't keep its heroes: its players' are on their own devices.");
        }

        const kept = (await stored.heroes.list(player)).filter((hero) => slot === null || hero.slot === slot);
        let war = null;

        try {
            war = decode(await readGzip(path.join(stored.folder, STATE, NOW))).war ?? null;
        } catch {
            war = null;
        }

        const characters = [];

        for (const { slot: each, savedAt } of kept) {
            const character = await stored.heroes.get(player, each);

            if (character) {
                characters.push(exportOfKept(character, { seed: stored.meta.seed, created: savedAt ?? new Date().toISOString(), war }));
            }
        }

        if (!characters.length) {
            throw new Refused(404, "no-hero", slot === null ? "They have no heroes kept in that world." : "There's no hero of theirs kept there.");
        }

        return fileOf(characters);
    }

    #player(id, player) {
        this.#world(id);

        if (typeof player !== "string" || !this.server.access.world(id).player(player)) {
            throw new Refused(404, "no-player", "There's no such player in that world.");
        }
    }

    /** A player sent out (they can come back). Returns how many of their links were closed. */
    async kick(id, player, { by = null } = {}) {
        this.#player(id, player);

        const sent = this.server.closePlaces((place) => place.world === id && place.player === player, "kicked");

        await this.#world(id).journal(`A player (${player}) was sent out${by ? ` by ${by}` : ""}.`);

        return { kicked: sent };
    }

    /** A player banned: their ticket for good, their address for a day; sent out. */
    async ban(id, player, { by = null } = {}) {
        this.#player(id, player);
        await this.server.access.ban(id, player, { by });
        this.server.closePlaces((place) => place.world === id && place.player === player, "banned");

        return { banned: player };
    }

    /** A player's ban lifted. */
    async unban(id, player, { by = null } = {}) {
        this.#player(id, player);

        return { unbanned: await this.server.access.unban(id, player, { by }) };
    }

    /** A player given another part (access/world.js ROLES). */
    async role(id, player, role, { by = null } = {}) {
        this.#player(id, player);

        if (!isRole(role)) {
            throw new Refused(400, "bad-request", `There's no part called ${JSON.stringify(role)}.`);
        }

        if (this.server.access.world(id).player(player).role === "banned") {
            throw new Refused(409, "banned", "Lift their ban first.");
        }

        await this.server.access.world(id).setRole(player, role);
        await this.#world(id).journal(`A player (${player}) was made ${role === "owner" ? "an owner" : `a ${role}`}${by ? ` by ${by}` : ""}.`);

        return { player, role };
    }

    /** A new return ticket for a player who's lost theirs (their old one no longer works). Returns it: shown this once. */
    async ticket(id, player, { by = null } = {}) {
        this.#player(id, player);

        const ticket = await this.server.access.world(id).reissueTicket(player);

        await this.#world(id).journal(`A player (${player}) was given a new ticket${by ? ` by ${by}` : ""}.`);

        return { player, ticket };
    }

    // ---- Its backups

    /**
     * A world's backups (§10 Backups), newest first: its autosaves (now and the five before it:
     * `kind` "autosave"), and the copies of it in the data folder's backups (kind "backup": hourly,
     * daily, by hand, before a restore...). Each { id, kind, why, when, size }.
     */
    async backups(id) {
        const stored = this.#world(id);
        const saves = [];

        for (const name of StoredWorld.saves) {
            const file = path.join(stored.folder, STATE, name);
            const found = await stat(file).catch(() => null);

            if (found) {
                saves.push({ id: name.replace(/\.json\.gz$/, ""), kind: "autosave", why: name === NOW ? "the latest save" : "an autosave", when: found.mtime.toISOString(), size: found.size });
            }
        }

        const copies = await Promise.all((await stored.backups()).map(async ({ id: name, when, why, folder }) => ({ id: name, kind: "backup", why, when: when.toISOString(), size: await sizeOf(folder) })));

        return [...saves, ...copies].sort((a, b) => b.when.localeCompare(a.when));
    }

    /** A world backed up now (saved first, if it's going). Returns its backups. */
    async backUp(id) {
        const stored = this.#world(id);
        const thread = this.server.registry.entries.get(id)?.thread;

        if (thread) {
            const { ok } = await thread.backUp("by-hand");

            if (!ok) {
                throw new Refused(500, "unsaved", "It couldn't be backed up: its journal says why.");
            }
        } else {
            await stored.backUp("by-hand");
        }

        return this.backups(id);
    }

    // A backup, by its id: an autosave's file, or a backup's folder
    async #backup(stored, backup) {
        const save = StoredWorld.saves.find((name) => name.replace(/\.json\.gz$/, "") === backup);

        if (save && (await exists(path.join(stored.folder, STATE, save)))) {
            return { save: path.join(stored.folder, STATE, save) };
        }

        const copy = BACKUP_NAME.test(backup ?? "") ? path.join(stored.backupsFolder, backup) : null;

        if (copy && (await exists(path.join(copy, WORLD_FILE)))) {
            return { folder: copy };
        }

        throw new Refused(404, "no-backup", "There's no such backup of that world.");
    }

    /**
     * A world restored from one of its backups (`backup`: an id backups() gave): set aside first
     * (everyone in it sent out), backed up as it is ("before-restore"), then its state, its
     * world.json and its kept heroes put back as the backup has them. Who may come in (its keys,
     * its players, their bans) and its journal stay as they are now.
     */
    async restore(id, backup, { by = null } = {}) {
        const stored = this.#world(id);
        const from = await this.#backup(stored, backup);

        if (this.#going(id)) {
            await this.setAside(id, "set aside for a restore");
        }

        await stored.backUp("before-restore");

        if (from.save) {
            const text = await readGzip(from.save);

            await writeGzip(path.join(stored.folder, STATE, NOW), text);
        } else {
            for (const part of [STATE, HEROES]) {
                await rm(path.join(stored.folder, part), { recursive: true, force: true });

                if (await exists(path.join(from.folder, part))) {
                    await cp(path.join(from.folder, part), path.join(stored.folder, part), { recursive: true });
                }
            }

            // (Its world.json brought forward, if an older server wrote it)
            const { meta } = await StoredWorld.open(from.folder);

            await stored.writeMeta({ ...meta, id });
        }

        await stored.reload();

        // (What the world's time was when it was saved, as world.json says it, from the save put back)
        const loaded = await stored.load().catch(() => null);

        if (loaded?.snapshot) {
            await stored.writeMeta({ worldTime: loaded.snapshot.battle?.time ?? 0, elapsed: elapsedOf(loaded.snapshot.war) });
        }

        await stored.journal(`Restored from ${backup}${by ? ` by ${by}` : ""}: what it was before is in the backup made just now (before-restore).`);

        return this.details(id);
    }

    // ---- Moving it

    /**
     * A world as one file (EXPORT_FORMAT, gzipped JSON): what it is (world.json), its latest
     * snapshot (as storage/worlds.js keeps it, encoded), and the heroes it keeps; from a backup
     * (`backup`: an id backups() gave) if one's named, else as it is now. Nothing of who may come in.
     * Returns { name (a file name for it), body (bytes) }.
     */
    async export(id, backup = null) {
        const stored = this.#world(id);
        const from = backup ? await this.#backup(stored, backup) : { folder: stored.folder };
        const folder = from.folder ?? stored.folder;
        const meta = from.folder ? await readJSON(path.join(folder, WORLD_FILE)) : { ...stored.meta };
        const snapshotFile = from.save ?? path.join(folder, STATE, NOW);
        const snapshot = (await exists(snapshotFile)) ? await readGzip(snapshotFile) : null;
        const heroes = {};

        for (const player of await readdir(path.join(folder, HEROES)).catch(() => [])) {
            for (const file of await readdir(path.join(folder, HEROES, player)).catch(() => [])) {
                heroes[player] ??= {};
                heroes[player][file] = JSON.parse(await readFile(path.join(folder, HEROES, player, file), "utf8"));
            }
        }

        const body = await gzipped(Buffer.from(JSON.stringify({ format: EXPORT_FORMAT, exportedBy: SERVER_VERSION, exported: new Date().toISOString(), world: { ...meta, id }, snapshot, heroes })));
        const safe = String(meta.name ?? id).replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || id;

        return { name: `${safe}-${backup ?? stampOf(new Date())}.pellagos.json.gz`, body };
    }

    /**
     * A world brought in from a file another server (or this one) exported (EXPORT_FORMAT, as
     * export() makes it, gzipped or not): a new world here, with an id of its own, its name,
     * seed, home people, heroes mode and settings (those this server knows), its latest snapshot
     * (read, brought forward and checked before it's kept) and the heroes it kept (for the players
     * they were kept for where it came from). Nothing of who may come in comes with it: it gets an
     * owner's key and a player's key, as a world made here does. Refused, with the reason, if it
     * isn't such a file, or a newer server wrote it. `by` and `creator` as createWorld's. Returns
     * { world, name, ownerKey, playerKey }.
     */
    async importWorld(bytes, { by = null, creator = null } = {}) {
        let bundle;

        try {
            const packed = bytes[0] === 0x1f && bytes[1] === 0x8b;

            bundle = JSON.parse((packed ? gunzipSync(bytes, { maxOutputLength: IMPORT_UNPACKED }) : bytes).toString("utf8"));
        } catch {
            throw notAWorld(null);
        }

        return this.importBundle(bundle, { by, creator });
    }

    /**
     * A world brought in from what a world's file holds (importWorld's, or archive.js worldBundle's
     * from an archive), as importWorld says. One whose save was kept by a version of the game older
     * than any this one can bring forward isn't refused: its land is started afresh from its seed,
     * its war carried on as far as it reads, its kept heroes kept (reopen.js freshStart), and
     * `salvaged` says so. Returns { world, name, ownerKey, playerKey, salvaged (or null) }.
     */
    async importBundle(bundle, { by = null, creator = null, from = null } = {}) {
        if (bundle?.format !== EXPORT_FORMAT || !bundle.world || typeof bundle.world !== "object") {
            throw notAWorld(typeof bundle?.format === "string" && bundle.format.startsWith("pellagos.world.") ? `it's in a newer format (${bundle.format}): it needs the server that made it, or a newer one` : null);
        }

        const { world } = bundle;
        const settings = Object.fromEntries(Object.entries(world.settings ?? {}).filter(([key]) => key in WORLD_SETTINGS));
        let stored;
        let salvaged = null;

        try {
            stored = await this.server.store.create({ name: world.name, description: world.description ?? "", seed: world.seed, race: world.race, creator, heroes: world.heroes ?? "kept", firstHero: world.firstHero ?? "new", settings });
        } catch (error) {
            throw notAWorld(error.message);
        }

        try {
            if (bundle.snapshot !== null && bundle.snapshot !== undefined) {
                await ensureFolder(path.join(stored.folder, STATE));
                await writeGzip(path.join(stored.folder, STATE, NOW), typeof bundle.snapshot === "string" ? bundle.snapshot : JSON.stringify(bundle.snapshot));
            }

            let heroes = 0;

            for (const [player, slots] of Object.entries(bundle.heroes ?? {})) {
                for (const [file, kept] of Object.entries(slots ?? {})) {
                    if (/^[A-Za-z0-9_-]{1,64}$/.test(player) && /^[1-9]\d*\.json$/.test(file) && kept && typeof kept === "object") {
                        await ensureFolder(path.join(stored.folder, HEROES, player));
                        await writeFile(path.join(stored.folder, HEROES, player, file), JSON.stringify(kept), { mode: FILE_MODE });
                        heroes++;
                    }
                }
            }

            // (Its snapshot read as the server will read it, and its version one this server can
            // carry on from: not newer; one older than any step goes back to, its land started
            // afresh from its seed, its war and heroes kept: reopen.js openWorld, freshStart)
            let { snapshot } = await stored.load();
            const oldest = Math.min(SNAPSHOT_VERSION, ...Object.keys(SNAPSHOT_STEPS).map(Number));

            if (snapshot && snapshot.version > SNAPSHOT_VERSION) {
                throw new NewerDataError("Its save", { found: snapshot.version, reads: SNAPSHOT_VERSION, needs: bundle.exportedBy ?? null });
            }

            if (snapshot && snapshot.version < oldest) {
                const kept = snapshot.version;
                const host = await freshStart(stored, { why: `it was brought in from a save kept by version ${kept} of the game, older than any this server can bring forward (${oldest})` });

                snapshot = host.snapshot();
                salvaged = `Its save was kept by version ${kept} of the game, older than this server can bring forward (${oldest}): its land was started afresh from its seed, ${host.war ? `its war carried on (turn ${host.war.turn ?? 0})` : "with a new war"}, and its kept heroes kept.`;
            }

            await stored.writeMeta({
                played: Number.isFinite(world.played) ? world.played : 0,
                worldTime: snapshot?.battle?.time ?? 0,
                elapsed: snapshot ? elapsedOf(snapshot.war) : 0,
                versions: snapshot ? { snapshot: snapshot.version, war: snapshot.war?.version ?? null } : null,
                savedAt: snapshot ? (world.savedAt ?? null) : null,
            });
            await stored.journal(`Brought in${by ? ` by ${by}` : ""} from ${from ?? "a file"} Pellagos server ${bundle.exportedBy ?? "(unknown)"} ${from ? "made" : "exported"}${bundle.exported ? ` on ${bundle.exported}` : ""} (world ${world.id ?? "(unknown)"} there)${heroes ? `, with ${heroes} kept hero${heroes === 1 ? "" : "es"} for the players they were kept for there` : ""}.`);
        } catch (error) {
            await rm(stored.folder, { recursive: true, force: true });

            if (error instanceof NewerDataError) {
                throw new Refused(409, "newer", `That world was saved by a newer Pellagos server. ${error.message}`);
            }

            throw notAWorld(`its save couldn't be read (${error.message})`);
        }

        const adopted = await this.server.adopt(stored, { creator });

        await this.journal(`The world "${stored.meta.name}" (${stored.id}) was brought in${by ? ` by ${by}` : ""}, from ${from ?? "a file exported by"} Pellagos server ${bundle.exportedBy ?? "(unknown)"}${from ? " made" : ""}${salvaged ? `: ${salvaged}` : "."}`);

        return { ...adopted, salvaged };
    }

    /**
     * What a game sent to bring a world to the server (BRING_FORMAT, gzipped or not, as the game's
     * ServerClient bringWorld sends it): { net (its NET_VERSION), name, firstHero, character (a
     * character and their world, as app/save.js exportCharacter gives them) }. Refused, saying
     * so, if it isn't that.
     */
    readBrought(bytes) {
        let brought;

        try {
            const packed = bytes[0] === 0x1f && bytes[1] === 0x8b;

            brought = JSON.parse((packed ? gunzipSync(bytes, { maxOutputLength: IMPORT_UNPACKED }) : bytes).toString("utf8"));
        } catch {
            brought = null;
        }

        if (brought?.format !== BRING_FORMAT || !brought.character || typeof brought.character !== "object") {
            throw new Refused(400, "not-a-world", "That isn't a character and their world, as the game sends them to be brought to a server.");
        }

        return brought;
    }

    /**
     * A player's solo world brought to the server (generated/world_server_plan.md §5, "Bring my
     * world to the server"; reopen.js importSolo), by whoever may make worlds here (`by` and
     * `creator` as createWorld's), from what readBrought read: a new world with the solo world's
     * seed, its home people and its war, named `name` (or after its hero), its heroes kept by the
     * world and its first heroes as `firstHero` has them; an owner's key and a player's key, as
     * any world made here has; and whoever brought it its first player, by the owner's key, their
     * hero its first kept hero. Returns { world, name, ownerKey, playerKey, ticket (theirs, to come
     * back in by), player (their id in it), hero (its name), turn (its war's, or null for a new
     * war), left (what was left out of the hero or put right, as the game says it) }. Refused,
     * saying why, if it can't be brought; nothing's left of it then.
     */
    async bringSolo({ character, name = null, firstHero = "new" } = {}, { by = null, creator = null } = {}) {
        let brought;

        try {
            brought = await importSolo(this.server.store, character, { name, creator, firstHero: FIRST_HEROES.includes(firstHero) ? firstHero : "new" });
        } catch (error) {
            throw error.newer ? new Refused(409, "newer", `That character and world were kept by a newer version of the game than this server plays: ${error.message}`) : new Refused(400, "not-a-world", `That world can't be brought to the server: ${error.message}`);
        }

        const { stored, kept, left, turn } = brought;
        const who = creator ?? by;
        const adopted = await this.server.adopt(stored, { creator });
        const access = this.server.access.world(stored.id);
        const owners = access.keys().find((key) => key.role === "owner");
        const { id: player, ticket } = await access.newPlayer({ role: "owner", via: owners.id });

        await stored.heroes.keep(player, kept, { slot: 1 });
        await stored.journal(`Brought from a solo game${who ? ` by ${who}` : ""}, its owner now, as player ${player}: ${kept.hero.name}, its first kept hero; ${turn === null ? "a new war" : `its war carried on, at turn ${turn}`}.${left.length ? ` Of ${kept.hero.name}, as this version of the game plays them: ${left.join(" ")}` : ""}`);
        await this.journal(`The world "${stored.meta.name}" (${stored.id}) was brought from a solo game${who ? ` by ${who}` : ""}, with ${kept.hero.name}.`);

        return { ...adopted, ticket, player, hero: kept.hero.name, turn, left };
    }

    // ---- The whole server, as an archive (storage/archive.js)

    /** The server as an archive, every world going saved first: { name, body, worlds }. */
    async archive({ by = null } = {}) {
        for (const [id, entry] of this.server.registry.entries) {
            if (entry.thread) {
                const { ok } = await entry.thread.save("saved for an archive");

                if (!ok) {
                    throw new Refused(500, "unsaved", `The world ${id} couldn't be saved for the archive: its journal says why.`);
                }
            }
        }

        const made = await archiveFolder(this.server.root, { name: this.server.name ?? "Pellagos server" });

        await this.journal(`An archive of the server was made${by ? ` by ${by}` : ""}: ${made.worlds} world${made.worlds === 1 ? "" : "s"}.`);

        return made;
    }

    /**
     * An archive read, and kept a while (ARCHIVE_KEPT) to be restored or brought in from: { id,
     * archivedBy, archived, worlds (archive.js worldsIn, each with whether this server can carry
     * it on: "yes", "afresh" or "newer"), restorable (whether it can be restored here: a server
     * with no worlds of its own, not laid out by a newer server), why (if it can't) }.
     */
    readArchive(bytes) {
        let archive;

        try {
            archive = readArchive(bytes);
        } catch (error) {
            if (error instanceof ArchiveError) {
                throw new Refused(error.newer ? 409 : 400, error.newer ? "newer" : "not-an-archive", error.message);
            }

            throw error;
        }

        const now = Date.now();

        for (const [id, kept] of this.archives) {
            if (now - kept.at > ARCHIVE_KEPT) {
                this.archives.delete(id);
            }
        }

        while (this.archives.size >= ARCHIVES_AT_ONCE) {
            this.archives.delete(this.archives.keys().next().value);
        }

        const id = randomBytes(9).toString("base64url");
        const oldest = Math.min(SNAPSHOT_VERSION, ...Object.keys(SNAPSHOT_STEPS).map(Number));
        const worlds = worldsIn(archive).map((world) => ({ ...world, carries: world.version === null ? "yes" : world.version > SNAPSHOT_VERSION ? "newer" : world.version < oldest ? "afresh" : "yes" }));
        const why = this.server.worlds.size ? "This server has worlds of its own: restoring puts the archive in place of everything here. Bring its worlds in as new ones instead, or delete those here first." : archive.layout !== null && archive.layout > LAYOUT_VERSION ? `A newer server made it (Pellagos server ${archive.archivedBy ?? "(unknown)"}): update this one first.` : null;

        this.archives.set(id, { archive, at: now });

        return { id, archivedBy: archive.archivedBy, archived: archive.archived, worlds, restorable: !why, why };
    }

    // An archive read (readArchive), by its id
    #archive(id) {
        const kept = this.archives.get(id);

        if (!kept || Date.now() - kept.at > ARCHIVE_KEPT) {
            this.archives.delete(id);
            throw new Refused(404, "no-archive", "That archive's no longer here: choose it again.");
        }

        return kept.archive;
    }

    /**
     * Worlds in an archive read (readArchive's `id`; `worlds`, their ids there) brought in as new
     * worlds here, each with keys of its own (importBundle): [{ from (its id there), world, name,
     * ownerKey, playerKey, salvaged } or { from, error }], one that can't be saying why.
     */
    async bringInFromArchive(id, worlds, { by = null, creator = null } = {}) {
        const archive = this.#archive(id);
        const there = new Set(worldIds(archive));
        const results = [];

        for (const from of Array.isArray(worlds) ? worlds : []) {
            const bundle = there.has(from) ? worldBundle(archive, from, EXPORT_FORMAT) : null;

            if (!bundle) {
                results.push({ from, error: "That world isn't in the archive, or it doesn't read." });
                continue;
            }

            try {
                results.push({ from, ...(await this.importBundle(bundle, { by, creator, from: "an archive" })) });
            } catch (error) {
                results.push({ from, error: error.message });
            }
        }

        return { results };
    }

    /**
     * An archive read (readArchive's `id`) restored: put in place of everything here when the
     * server starts again, which it does at once (onRestart), every world here saved first.
     * Refused unless it can be (readArchive's restorable).
     */
    async restoreArchive(id, { by = null } = {}) {
        const archive = this.#archive(id);

        if (this.server.worlds.size) {
            throw new Refused(409, "not-empty", "This server has worlds of its own: restoring puts the archive in place of everything here. Bring its worlds in as new ones instead, or delete those here first.");
        }

        if (archive.layout !== null && archive.layout > LAYOUT_VERSION) {
            throw new Refused(409, "newer", `A newer server made that archive (Pellagos server ${archive.archivedBy ?? "(unknown)"}): update this one first.`);
        }

        await stageRestore(this.server.root, archive, { by });
        this.archives.delete(id);
        await this.journal(`The server's being restored from an archive Pellagos server ${archive.archivedBy ?? "(unknown)"} made${archive.archived ? ` on ${archive.archived}` : ""}${by ? `, as ${by} asked` : ""}: it starts again to put it in place.`);
        setTimeout(() => this.server.onRestart?.(), 100);

        return { restoring: true, worlds: worldIds(archive).length };
    }

    /**
     * A world that can't be carried on (reopen.js CantCarryOn: none of its saves reads, or one's
     * older than any step goes back to) started afresh from its seed, its war and its heroes kept
     * (reopen.js freshStart), its owner having said so. Refused while it's going.
     */
    async startAfresh(id, { by = null } = {}) {
        const stored = this.#world(id);

        if (this.server.registry.entries.get(id)?.thread) {
            throw new Refused(409, "going", "It's going: it can be carried on. Set it aside first if it's to start afresh all the same.");
        }

        await freshStart(stored, { why: by ? `${by} asked` : "its owner asked" });

        return this.details(id);
    }

    /**
     * Every world's latest save brought forward to this version of the game (reopen.js
     * bringForward), as a new version of the server does when it's first started: [{ id, name,
     * from, forwarded, stuck }]. Throws, naming the world, if one can't be.
     */
    async bringForward() {
        const done = [];

        for (const [id, stored] of this.server.worlds) {
            try {
                done.push({ id, name: stored.meta.name, ...(await bringForward(stored)) });
            } catch (error) {
                throw new Error(`world ${id} ("${stored.meta.name}"): ${error.message}`);
            }
        }

        return done;
    }

    // ---- The server

    /** The server's overview (§10 Overview): who it is, where it's reached, how long it's been up, the machine and how many worlds it may run. */
    overview() {
        const { server } = this;
        const states = [...server.registry.entries.values()].map((entry) => entry.thread?.state).filter(Boolean);

        for (const state of states) {
            this.largest = Math.max(this.largest, (state.memory?.heap ?? 0) + (state.memory?.external ?? 0));
        }

        const advice = recommendation({ largest: this.largest });

        return {
            id: server.identity.id,
            name: server.name,
            version: SERVER_VERSION,
            started: new Date(this.started).toISOString(),
            uptime: Date.now() - this.started,
            addresses: [`http://localhost:${server.port}`, ...server.addresses()],
            admin: server.adminPort ? `http://localhost:${server.adminPort}` : null,
            adminKey: null,
            internet: this.internet(),
            power: { keepAwake: server.settings.get("keepAwake"), holding: Boolean(server.registry.holding), platform: process.platform },
            bonjour: this.bonjour(),
            nearby: server.nearby.list(),
            worlds: { kept: server.worlds.size, going: server.registry.going.length, waiting: server.registry.queue.length, atOnce: server.settings.get("worldsAtOnce") },
            recommended: { ...advice, words: `Recommended: up to ${advice.most} at once (memory allows ${advice.memory}, the processor ${advice.cpu}).`, worldMemory: Math.max(this.largest, WORLD_MEMORY) },
            machine: { memory: os.totalmem(), cores: os.availableParallelism?.() ?? os.cpus().length },
            blocked: server.access.blocks.blocked().map(({ address, until, times }) => ({ address, until: new Date(until).toISOString(), times })),
        };
    }

    /**
     * Whether it answers the internet (§9.1, §9.4), in words: { on (the `internet` setting), open
     * (it answers there now: `direct`ly, with its certificate, or `tunneled`, through Tailscale
     * Funnel), certificate (what it says of itself: x509.js describe; or null), addresses (where
     * the internet reaches it), words, acme, router, funnel (each as it stands, in words), tests
     * (what games have said of reaching it from elsewhere, the latest first, in words) }.
     */
    internet() {
        const { server } = this;
        const on = server.settings.get("internet");
        const certificate = server.certificate;
        const day = (when) => when.slice(0, 10);
        const funnel = server.funnel?.state() ?? null;
        const direct = on && Boolean(certificate);
        const tunneled = on && server.settings.get("funnel") && Boolean(funnel?.url);
        const open = direct || tunneled;
        const acme = server.certifier?.state() ?? null;
        const through = tunneled ? `through Tailscale Funnel, at ${funnel.url} (Tailscale's certificate)` : "";
        const words = direct
            ? `Answers the internet, over TLS alone, at ${server.secureAddresses().join(" and ")}${tunneled ? `, and ${through}` : ""}. Its certificate, from ${certificate.issuer}, runs till ${day(certificate.notAfter)}. Plain http from the internet is refused; a page asked for that way is sent on to https.`
            : tunneled
              ? `Answers the internet ${through}. Plain http from the internet is refused.`
              : certificate
                ? `Doesn't answer the internet: it's closed to it (“Answer the internet” is off in Settings). It has a certificate for ${certificate.names.join(", ")}, till ${day(certificate.notAfter)}.`
                : on
                  ? `It's open to the internet, but has no certificate yet${server.settings.get("funnel") ? ", and Tailscale Funnel isn't open," : ""} so it can't be reached securely and the internet isn't answered. Set up a way in below.`
                  : "Answers its own Wi-Fi alone: it's closed to the internet (“Answer the internet” is off in Settings), and has no certificate.";

        const router = server.router?.state() ?? null;

        return {
            on,
            open,
            direct,
            tunneled,
            certificate,
            addresses: server.internetAddresses(),
            words,
            acme: acme && { ...acme, words: this.#acmeWords(acme) },
            router: router && { ...router, asking: server.settings.get("router"), words: this.#routerWords(router) },
            funnel: funnel && { ...funnel, asking: server.settings.get("funnel"), words: this.#funnelWords(funnel) },
            tests: { words: this.#testWords(server.reports[0] ?? null), reports: server.reports },
        };
    }

    // How Tailscale Funnel stands, in words (funnel.js)
    #funnelWords({ working, url, port, error, retryAt }) {
        const { server } = this;

        if (!server.settings.get("funnel")) {
            return "Tailscale Funnel isn't asked for. It's the way in for a home whose provider shares its address (CGNAT), where no router setting helps: free, with a Tailscale account.";
        }

        if (!server.settings.get("internet")) {
            return "Tailscale Funnel isn't asked for while the server's closed to the internet.";
        }

        if (server.tunnelError) {
            return server.tunnelError;
        }

        if (working && !url) {
            return "Asking Tailscale for Funnel…";
        }

        if (error || !url) {
            return `Tailscale Funnel isn't open: ${error?.message ?? "it wasn't asked."}${retryAt ? ` It asks again at ${retryAt.slice(11, 16)} (UTC), or now if you ask.` : ""}`;
        }

        return `Tailscale Funnel brings the internet to the server at ${url}, with Tailscale's own certificate, through the tunnel on this computer alone (port ${port}). Players type ${url.replace(/^https:\/\//, "")} in the game.`;
    }

    /** Tailscale Funnel asked for again, now (after allowing it, or signing in to Tailscale). */
    async askFunnel() {
        const { server } = this;

        if (!server.funnel || !server.settings.get("internet") || !server.settings.get("funnel")) {
            throw new Refused(409, "no-funnel", "Tailscale Funnel is asked for only while the server's open to the internet and “Tailscale Funnel” is on in Settings.");
        }

        await server.followFunnel();
        await server.funnel.refresh();

        return { internet: this.internet() };
    }

    // What the latest test of reaching the server from elsewhere said, in words
    #testWords(report) {
        if (!report) {
            return `Not tested from outside yet. On a phone on its cellular data (not this Wi-Fi), ${this.server.internetAddresses().length ? "scan the code below, or " : ""}open the game, add the server by its internet address and use “Test this server”: what it finds comes back here.`;
        }

        const at = `${report.at.slice(0, 10)} ${report.at.slice(11, 16)} (UTC)`;
        const reached = report.results.filter((one) => one.ok);
        const missed = report.results.filter((one) => !one.ok);
        const list = (ones, say) => ones.map(say).join("; ");
        const found = [
            reached.length ? `reached it at ${list(reached, (one) => `${one.address}${one.ms !== null ? ` (${one.ms} ms${one.socket ? ", and played there" : ""})` : ""}`)}` : null,
            missed.length ? `couldn't at ${list(missed, (one) => `${one.address}${one.error ? ` (${one.error})` : ""}`)}` : null,
        ]
            .filter(Boolean)
            .join(", and ");

        if (report.from === "home") {
            return `Last tested ${at} from this server's own Wi-Fi: ${found}. From here that doesn't show the internet can reach it: test from a phone on its cellular data.`;
        }

        // (Through Funnel, from wherever Tailscale says it came from; "tunnel" if it didn't say)
        const where = [report.tunnel ? "through Tailscale Funnel" : null, report.address !== "tunnel" ? `from ${report.address}` : null].filter(Boolean).join(", ");

        return `Last tested ${at} from the internet (${where}): ${found}.`;
    }

    /**
     * What a game found trying to reach the server ("Test this server", from anywhere: the game
     * says what it tried, `results` [{ address, ok, ms, socket, error }], and it's kept if they're
     * this server's own addresses), with where the report came from (`request`: the guards' say).
     * The last 5 are kept. Returns { report, words }.
     */
    async report(body, { address, from, tunnel = false }) {
        const { server } = this;
        const own = new Set([...server.addresses(), ...server.secureAddresses(), ...server.internetAddresses()].map((one) => one.toLowerCase()));
        const given = Array.isArray(body?.results) ? body.results.slice(0, 8) : [];
        const results = given
            .filter((one) => typeof one?.address === "string" && one.address.length <= 200)
            .map((one) => ({
                address: one.address.toLowerCase().replace(/\/+$/, ""),
                ok: one.ok === true,
                socket: one.socket === true,
                ms: Number.isFinite(one.ms) ? Math.round(Math.min(Math.max(one.ms, 0), 60000)) : null,
                error: typeof one.error === "string" ? one.error.replace(/[^\x20-\x7e]/g, "").slice(0, 120) || null : null,
            }))
            .filter((one) => own.has(one.address));

        if (!results.length) {
            throw new Refused(400, "bad-request", "A test's report says which of this server's addresses it tried.");
        }

        const report = { at: new Date().toISOString(), from, tunnel: Boolean(tunnel), address, results };
        const reached = results.filter((one) => one.ok).length;

        server.reports = [report, ...server.reports].slice(0, 5);
        await this.journal(`A game tested reaching the server from ${from === "home" ? "its own Wi-Fi" : `the internet (${address})`}: it reached ${reached} of the ${results.length} address${results.length === 1 ? "" : "es"} it tried.`);

        return { report, words: this.#testWords(report) };
    }

    // How the router stands, in words (router.js): what it forwards, how the internet sees this
    // home, whether the server reached itself; or why it won't, and how to forward it by hand
    #routerWords({ on, working, methodLabel, gateway, lan, mappings, pinhole, external, seen, sharing, hairpin, error, retryAt }) {
        const { server } = this;
        const port = server.port;
        const byHand = `Forward it by hand: in the router's settings${gateway ? ` (at http://${gateway}/)` : ""}, send TCP port ${port} to this computer${lan ? ` (${lan})` : ""}, port ${port}.`;
        const listed = (ports) => (ports.length > 1 ? `${ports.slice(0, -1).join(", ")} and ${ports.at(-1)}` : ports[0]);

        if (!server.settings.get("internet")) {
            return "The router isn't asked: the internet isn't answered.";
        }

        if (!server.settings.get("router")) {
            return `The router isn't asked (“Ask the router” is off in Settings). ${byHand}`;
        }

        if (working && !mappings.length) {
            return "Asking the router to let the internet in…";
        }

        if (!on || error) {
            return `The router wouldn't let the internet in: ${error?.message ?? "it wasn't asked."} ${byHand}${retryAt ? ` It asks again at ${retryAt.slice(11, 16)} (UTC).` : ""}`;
        }

        const lines = [`The router (${methodLabel}) sends the internet's port ${listed(mappings.map(({ external }) => external))} to this computer${mappings.some(({ lifetime }) => lifetime) ? ", asked again as it runs out" : ""}. Its public address is ${external ?? "unknown"}.`];

        if (sharing === "carrier") {
            lines.push(`But that's an address a provider shares between homes (CGNAT): the internet can't reach the server through the router. Ask the provider for a public address of your own, or use a tunnel.`);
        } else if (sharing === "double") {
            lines.push(`But that's a private address: another router stands between this one and the internet. Forward the port on that one too.`);
        } else if (sharing === "beyond") {
            lines.push(`But the internet sees this home as ${seen}: another NAT (a provider's) stands beyond the router, and the internet can't reach the server this way.`);
        } else if (hairpin === true) {
            lines.push("The server reached itself by its public address: the port is open.");
        } else if (hairpin === false) {
            lines.push("The server couldn't reach itself by its public address. Many routers can't do that, so it proves nothing: try from a phone on its cellular data.");
        }

        if (pinhole) {
            lines.push(`Over IPv6, the router's firewall lets the internet in to ${pinhole.address}.`);
        }

        return lines.join(" ");
    }

    /** The router asked again (what it forwards, and how far the internet gets), now. */
    async askRouter() {
        const { server } = this;

        if (!server.router || !server.settings.get("internet") || !server.settings.get("router")) {
            throw new Refused(409, "no-router", "The router's asked only while the internet's answered and “Ask the router” is on in Settings.");
        }

        await server.router.refresh();

        return { internet: this.internet() };
    }

    // How getting free certificates stands, in words
    #acmeWords({ names, label, working, renewAt, retryAt, last, issued, pointedAt }) {
        const day = (when) => when.slice(0, 10);
        const pointed = pointedAt ? ` The name points at ${pointedAt}.` : "";

        if (working) {
            return `Getting a certificate for ${names.join(", ")} from Let's Encrypt (${routeWords(label)})…`;
        }

        if (last && !last.ok) {
            return `Couldn't get a certificate for ${names.join(", ")}: ${last.message} It tries again ${retryAt ? `at ${retryAt.slice(11, 16)} on ${day(retryAt)} (UTC)` : "later"}, or now if you ask.${pointed}`;
        }

        return issued
            ? `Gets its certificate for ${names.join(", ")} from Let's Encrypt (${routeWords(label)}) and renews it itself: next about ${day(renewAt)}.${pointed}`
            : `Set to get a certificate for ${names.join(", ")} from Let's Encrypt (${routeWords(label)}).${pointed}`;
    }

    /** What getting a free certificate needs, for the page's form: the routes, the DNS hosts (and where each's token comes from), the CA's terms of service. */
    async acmeChoices() {
        const terms = await this.server.certifier.terms();

        return { routes: ROUTES, hosts: DNS_HOSTS, terms, tokens: this.server.certifier.tokens?.where ?? null };
    }

    /**
     * A free certificate's route set up (certify.js setUp): checked, kept, and a certificate asked
     * for at once. Refused, saying why, if it can't be (the token's never said back, nor journalled).
     */
    async setUpAcme(body, { by = null } = {}) {
        const { route, name = null, host = null, token = null, address = null, email = null, agree = false } = body ?? {};
        let state;

        try {
            state = await this.server.certifier.setUp({ route, name, host, token, address, email: email || null, agree });
        } catch (error) {
            throw new Refused(400, "acme", error.message);
        }

        await this.journal(`Free certificates from Let's Encrypt were set up (${routeWords(state.label)}) for ${state.names.join(", ")}${by ? ` by ${by}` : ""}.`);

        return { internet: this.internet() };
    }

    /** A free certificate asked for now, not waiting for its time (or its next try). */
    async renewAcme({ by = null } = {}) {
        if (!this.server.certifier.state()) {
            throw new Refused(409, "no-acme", "Free certificates aren't set up.");
        }

        this.server.certifier.renew({ force: true }).catch(() => {});
        await this.journal(`A new certificate was asked for now${by ? ` by ${by}` : ""}.`);

        return { internet: this.internet() };
    }

    /** Free certificates no longer got (the route and its token forgotten); the certificate there is stays till it runs out, or it's taken out. */
    async forgetAcme({ by = null } = {}) {
        await this.server.certifier.forget();
        await this.journal(`Free certificates were no longer to be got${by ? ` (${by})` : ""}: the certificate there is stays till it runs out.`);

        return { internet: this.internet() };
    }

    /** A certificate of the owner's own kept and taken up (PEM: its key, and its chain). Refused, saying why, if they can't be used together. */
    async useCertificate({ key, cert }, { by = null } = {}) {
        if (typeof key !== "string" || typeof cert !== "string") {
            throw new Refused(400, "bad-request", "A certificate comes as its key and its chain, each PEM.");
        }

        let info;

        try {
            info = await this.server.useCertificate({ key, cert });
        } catch (error) {
            throw new Refused(400, "certificate", error.message);
        }

        await this.journal(`A certificate for ${info.names.join(", ")} was put in${by ? ` by ${by}` : ""}, running till ${info.notAfter.slice(0, 10)}.`);

        return { internet: this.internet() };
    }

    /** Its certificate let go: the internet's no longer answered. */
    async dropCertificate({ by = null } = {}) {
        await this.server.dropCertificate();
        await this.journal(`The server's certificate was taken out${by ? ` by ${by}` : ""}: it no longer answers the internet.`);

        return { internet: this.internet() };
    }

    /**
     * Whether it's shown to others on the Wi-Fi (nearby.js), in words (§8.2): { on (the setting),
     * as (the name it's shown under), refused ({ code, message }), words }.
     */
    bonjour() {
        const setting = this.server.settings.get("bonjour");
        const { available, as, refused } = this.server.nearby.state();
        const words = !available
            ? "This server runs without Bonjour: players type its address."
            : !setting
              ? "Not shown to others on the Wi-Fi, nor looking for them: Bonjour is off in Settings. Players type the address."
              : refused
                ? refused.message
                : as
                  ? `Shown to others on the Wi-Fi as “${as}”, and looking for the servers near it.`
                  : "Showing it to others on the Wi-Fi…";

        return { on: setting && available, as, refused, words };
    }

    /** The server's settings, each with what it's for, its range and its default (storage/settings.js SETTINGS). */
    settings() {
        return this.server.settings.all();
    }

    /** The server's settings changed: each checked first. Some wait for a restart (the ports). */
    async changeSettings(changes, { by = null } = {}) {
        const changed = await this.server.settings.change(changes);

        if (!changed.ok) {
            throw new Refused(400, "bad-request", changed.reasons.join(" "));
        }

        this.server.registry.refill();
        this.server.nearby.follow(this.server.settings.get("bonjour"));
        if (Object.hasOwn(changes, "tunnelPort")) {
            await this.server.closeTunnel();
        }

        this.server.closeToInternet();
        this.server.followRouter();
        this.server.followFunnel();

        // (The broker turned off, everyone on it let go; relaying turned on or off, its lists told again)
        if (changes.broker === false) {
            this.server.broker?.closeWhere(() => true);
        } else if (Object.hasOwn(changes, "relaying")) {
            this.server.broker?.refresh();
        }

        await this.journal(`The server's settings were changed${by ? ` by ${by}` : ""}: ${Object.entries(changes).map(([key, value]) => `${key} ${value}`).join(", ")}.`);

        return { settings: this.settings(), restart: ["port", "adminPort"].some((key) => Object.hasOwn(changes, key)) };
    }

    /** The creator keys (they make worlds). */
    creators() {
        return this.server.access.secrets.creators();
    }

    /** A new creator key, labelled. Returns { key (shown this once), creator }. */
    async issueCreator(label, { by = null } = {}) {
        const made = await this.server.access.secrets.issueCreator(label);

        await this.journal(`A creator key, "${made.creator.label}", was made${by ? ` by ${by}` : ""}.`);

        return made;
    }

    /** A creator key revoked. */
    async revokeCreator(id, { by = null } = {}) {
        if (!(await this.server.access.secrets.revokeCreator(id))) {
            throw new Refused(404, "no-key", "There's no such creator key working.");
        }

        await this.journal(`A creator key (${id}) was revoked${by ? ` by ${by}` : ""}.`);

        return { revoked: id };
    }

    /** A new admin key (the old no longer works). Returns it: shown this once. */
    async newAdminKey() {
        const key = await this.server.access.secrets.newAdminKey();

        this.server.adminKey = key;
        await this.journal("A new admin key was made, on the server's own computer: the old one no longer works.");

        return { key };
    }

    /**
     * What's happened (§10 Activity): the server's journal and every world's, newest first, at
     * most `lines` of them; each { when, world (its id, or null for the server's), name, text }.
     */
    async activity(lines = ACTIVITY_LINES) {
        const read = async (file, world, name) =>
            (await readFile(file, "utf8").catch(() => ""))
                .split("\n")
                .slice(-lines - 1)
                .map((line) => /^(\S+) (.*)$/.exec(line))
                .filter(Boolean)
                .map(([, when, text]) => ({ when, world, name, text }));

        const all = [
            ...(await read(path.join(this.server.root, SERVER_JOURNAL), null, "The server")),
            ...(await Promise.all([...this.server.worlds.values()].map((stored) => read(path.join(stored.folder, JOURNAL), stored.id, stored.meta.name)))).flat(),
        ];

        return all.sort((a, b) => b.when.localeCompare(a.when)).slice(0, lines);
    }

    /**
     * How the server's keeping up (§10 Health): for each world going, its steps (mean, 99th
     * percentile, worst), its memory, how many are in its battle (actors), its thread's CPU time
     * (cpu: µs, user and system), what it's made ahead between steps (made: chunks, tiles of
     * buildings' insides), its players, its latest save's size, and whether it's slow;
     * and the server's own memory and the machine's load.
     */
    async health() {
        const worlds = [];

        for (const entry of this.server.registry.going) {
            const state = entry.thread.state;
            const save = await stat(path.join(entry.stored.folder, STATE, NOW)).catch(() => null);
            const steps = state?.steps ?? null;

            worlds.push({
                id: entry.id,
                name: entry.stored.meta.name,
                life: entry.life,
                steps,
                slow: (steps?.p99 ?? 0) > SLOW_STEP,
                memory: state?.memory ?? null,
                actors: state?.actors ?? null,
                cpu: state?.cpu ?? null,
                made: state?.made ?? null,
                players: state?.players.filter((one) => one.id).length ?? 0,
                present: state?.present ?? 0,
                save: save?.size ?? null,
            });
        }

        const memory = process.memoryUsage();

        return {
            health: worlds.some((world) => world.slow) ? "slow" : "ok",
            worlds,
            server: { rss: memory.rss, heap: memory.heapUsed, uptime: Date.now() - this.started },
            machine: { memory: os.totalmem(), free: os.freemem(), load: os.loadavg(), cores: os.availableParallelism?.() ?? os.cpus().length },
        };
    }
}
