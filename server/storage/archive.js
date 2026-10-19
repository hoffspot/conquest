// A whole server in one file (docs/SERVER.md, "Archives"): everything in its data folder it
// needs to be itself again, for its owner to keep, to move it to another computer, or to put it
// back after it's been taken off (the Mac installer's --uninstall offers to make one first). Its
// settings, its identity (the key it proves its id with, so players' games know it again), its
// admin key's and creator keys' hashes, its certificates, its journal, and every world: what it
// is, its saves, the heroes it keeps, who may come in (its keys' and tickets' hashes, its players,
// its bans) and its journal. Not its backups, the versions updates installed, or a DNS host's
// token (never carried about in a file: it's given again on the management page).
//
// ARCHIVE_FORMAT: gzipped JSON, { format, archivedBy (the server's version), archived (when),
// layout (the data folder's, folder.js), files: { "<path in the data folder>": { text } or
// { gz } (a gzipped file's text) or { base64 } } }. It holds keys' hashes and the server's own
// key: whoever has it can stand in for the server, so it's kept as the data folder is.
//
// Restored (restore everything), it's put in place of what's in the data folder when the server
// next starts (stageRestore, then applyRestore as folder.js DataFolder.open begins), what was there
// copied into backups/server/ first; then the folder's opened as any is, brought forward a step at
// a time if an older server kept it (folder.js, settings.js, worlds.js, access/), and each world's
// save as it's opened (reopen.js). Or its worlds are taken from it one at a time, as new worlds
// with keys of their own (worldBundle, for manage.js importWorld).

import { cp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync, gzip, gzipSync } from "node:zlib";
import { decode } from "../../client/js/core/wire.js";
import { VERSIONS } from "../update/installed.js";
import { BACKUPS, ensureFolder, exists, FILE_MODE, SERVER_JOURNAL, stampOf } from "./files.js";
import { forward, SERVER_VERSION } from "./versions.js";
import { FORMAT_STEPS, FORMAT_VERSION, HEROES, STATE, StoredWorld, VISITORS, WORLD_FILE, WORLDS } from "./worlds.js";

/** An archive's format (and the versions of it a server reads: this one, and any before it). */
export const ARCHIVE_FORMAT = "pellagos.archive.1";
const ARCHIVE_VERSION = 1;

/** How big an archive may be (bytes) to be read: as it's sent (gzipped), and once unpacked. */
export const ARCHIVE_LIMIT = 256 * 1024 * 1024;
export const ARCHIVE_UNPACKED = 480 * 1024 * 1024;

/** Where an archive being restored is put, in the data folder, till the server next starts and puts it in place. */
export const RESTORING = "restoring";

// (Written last of all there: an archive staged whole, not one cut short)
const STAGED = ".staged.json";

// What's left out: the backups, the versions updates installed, an archive being restored; and a DNS host's token
const LEFT_OUT = new Set([BACKUPS, VERSIONS, RESTORING]);
const SECRET = new Set(["certificates/tokens.json"]);

// A path in the data folder, as an archive names it: plain names, "/" between them, never "." or ".."
const SAFE_PATH = /^(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9_][A-Za-z0-9._-]{0,127}(?:\/[A-Za-z0-9_][A-Za-z0-9._-]{0,127}){0,7}$/;

const gzipped = promisify(gzip);

/** Refused: an archive that can't be read (`message` says why), or one from a newer server (`newer`). */
export class ArchiveError extends Error {
    constructor(message, { newer = false } = {}) {
        super(message);
        this.name = "ArchiveError";
        this.newer = newer;
    }
}

// A file's bytes as an archive keeps them: a gzipped file's text (so the archive's own gzip packs
// it well), other text as it is, anything else in base64
function entryOf(name, bytes) {
    if (name.endsWith(".gz")) {
        try {
            const unpacked = gunzipSync(bytes);
            const text = unpacked.toString("utf8");

            if (Buffer.from(text, "utf8").equals(unpacked)) {
                return { gz: text };
            }
        } catch {
            // (Not gzip after all: kept as it is, below)
        }
    }

    const text = bytes.toString("utf8");

    return Buffer.from(text, "utf8").equals(bytes) ? { text } : { base64: bytes.toString("base64") };
}

/** An archive's entry's bytes, as they're written back. */
export function bytesOf(entry) {
    if (typeof entry?.gz === "string") {
        return gzipSync(Buffer.from(entry.gz, "utf8"));
    }

    return typeof entry?.text === "string" ? Buffer.from(entry.text, "utf8") : Buffer.from(String(entry?.base64 ?? ""), "base64");
}

// Every file in the data folder an archive keeps: [path (with "/"), bytes]
async function filesIn(root, under = "") {
    const files = [];

    for (const entry of await readdir(path.join(root, under), { withFileTypes: true }).catch(() => [])) {
        const name = under ? `${under}/${entry.name}` : entry.name;

        if (entry.name.startsWith(".") || (!under && LEFT_OUT.has(entry.name)) || SECRET.has(name)) {
            continue;
        }

        if (entry.isDirectory()) {
            files.push(...(await filesIn(root, name)));
        } else if (entry.isFile()) {
            files.push([name, await readFile(path.join(root, name))]);
        }
    }

    return files;
}

/**
 * The data folder at `root` as an archive (ARCHIVE_FORMAT): { name (a file name for it, by the
 * server's `name`), body (bytes), worlds (how many) }. What's on the disk: a world going should be
 * saved first (manage.js archive does).
 */
export async function archiveFolder(root, { name = "Pellagos server", when = new Date() } = {}) {
    const files = {};
    let layout = null;

    for (const [file, bytes] of await filesIn(root)) {
        files[file] = entryOf(file, bytes);

        if (file === "VERSION") {
            layout = Number.parseInt(bytes.toString("utf8"), 10) || null;
        }
    }

    const worlds = Object.keys(files).filter((file) => new RegExp(`^${WORLDS}/[^/]+/${WORLD_FILE}$`).test(file)).length;
    const body = await gzipped(Buffer.from(JSON.stringify({ format: ARCHIVE_FORMAT, archivedBy: SERVER_VERSION, archived: when.toISOString(), layout, files })));
    const safe = String(name).replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "Pellagos-server";

    return { name: `${safe}-${stampOf(when)}.pellagos-archive`, body, worlds };
}

/**
 * An archive read (`bytes`, as archiveFolder made it, gzipped or not): { archivedBy, archived,
 * layout, files (a Map: path → entry) }. Refused (ArchiveError) if it isn't one, if it's in a
 * newer format than this server reads, or if it names a file outside the data folder.
 */
export function readArchive(bytes) {
    let archive;

    try {
        const packed = bytes[0] === 0x1f && bytes[1] === 0x8b;

        archive = JSON.parse((packed ? gunzipSync(bytes, { maxOutputLength: ARCHIVE_UNPACKED }) : bytes).toString("utf8"));
    } catch {
        throw new ArchiveError("That isn't a Pellagos server's archive.");
    }

    const version = Number(/^pellagos\.archive\.(\d+)$/.exec(archive?.format ?? "")?.[1]);

    if (!Number.isInteger(version) || !archive.files || typeof archive.files !== "object") {
        throw new ArchiveError("That isn't a Pellagos server's archive.");
    }

    if (version > ARCHIVE_VERSION) {
        throw new ArchiveError(`That archive's in a newer format (${archive.format}), made by Pellagos server ${archive.archivedBy ?? "(unknown)"}: it needs that server, or a newer one.`, { newer: true });
    }

    const files = new Map();

    for (const [file, entry] of Object.entries(archive.files)) {
        const top = file.split("/")[0];

        if (!SAFE_PATH.test(file) || LEFT_OUT.has(top) || SECRET.has(file) || !entry || typeof entry !== "object") {
            throw new ArchiveError(`That archive names a file it can't hold (${JSON.stringify(file).slice(0, 80)}): it isn't one a Pellagos server made.`);
        }

        files.set(file, entry);
    }

    return { archivedBy: archive.archivedBy ?? null, archived: archive.archived ?? null, layout: Number.isInteger(archive.layout) ? archive.layout : null, files };
}

// A world's world.json in an archive, brought forward as the server reads it (worlds.js), or null if it doesn't read
function metaIn(archive, id) {
    try {
        const { formatVersion, writtenBy = null, ...meta } = JSON.parse(bytesOf(archive.files.get(`${WORLDS}/${id}/${WORLD_FILE}`)).toString("utf8"));

        return { ...forward(`The world ${id} in the archive`, meta, { found: formatVersion, current: FORMAT_VERSION, steps: FORMAT_STEPS, writtenBy }), id, writtenBy };
    } catch {
        return null;
    }
}

// A world's newest save in an archive that reads (as worlds.js StoredWorld.newest takes them): { text, snapshot, from }, or null
function newestSave(archive, id) {
    for (const name of StoredWorld.saves) {
        const entry = archive.files.get(`${WORLDS}/${id}/${STATE}/${name}`);

        if (!entry) {
            continue;
        }

        try {
            const text = typeof entry.gz === "string" ? entry.gz : gunzipSync(bytesOf(entry)).toString("utf8");
            const snapshot = decode(text);

            if (snapshot && typeof snapshot === "object" && Number.isInteger(snapshot.version)) {
                return { text, snapshot, from: name };
            }
        } catch {
            // (That one doesn't read: the next)
        }
    }

    return null;
}

/** The ids of the worlds in an archive (those whose world.json is in it). */
export function worldIds(archive) {
    const pattern = new RegExp(`^${WORLDS}/([^/]+)/${WORLD_FILE}$`);

    return [...archive.files.keys()].map((file) => pattern.exec(file)?.[1]).filter(Boolean);
}

/**
 * The worlds in an archive, as the management page lists them before they're brought in: [{ id,
 * name, race, heroes (its mode), savedAt, played, kept (heroes kept), players (who've been),
 * version (of the game its newest save was kept by, or null if it's never been saved, or none
 * reads) }].
 */
export function worldsIn(archive) {
    return worldIds(archive).map((id) => {
        const meta = metaIn(archive, id);
        const save = newestSave(archive, id);
        const kept = [...archive.files.keys()].filter((file) => file.startsWith(`${WORLDS}/${id}/${HEROES}/`)).length;
        let players = 0;

        try {
            players = Object.keys(JSON.parse(bytesOf(archive.files.get(`${WORLDS}/${id}/access.json`)).toString("utf8")).players ?? {}).length;
        } catch {
            players = 0;
        }

        return { id, name: meta?.name ?? id, race: meta?.race ?? null, heroes: meta?.heroes ?? null, savedAt: meta?.savedAt ?? null, played: meta?.played ?? 0, kept, players, version: save?.snapshot.version ?? null, reads: Boolean(meta) };
    });
}

/**
 * One world in an archive as manage.js importWorld takes a world's file (its EXPORT_FORMAT, as
 * `format`): what it is, its newest save that reads, the heroes it keeps, and what it remembers of
 * its visitors. Null if it isn't in
 * it, or its world.json doesn't read.
 */
export function worldBundle(archive, id, format) {
    const meta = metaIn(archive, id);

    if (!meta) {
        return null;
    }

    const heroes = {};
    const prefix = `${WORLDS}/${id}/${HEROES}/`;

    for (const [file, entry] of archive.files) {
        const [player, slot, more] = file.startsWith(prefix) ? file.slice(prefix.length).split("/") : [];

        if (player && slot && !more) {
            try {
                heroes[player] ??= {};
                heroes[player][slot] = JSON.parse(bytesOf(entry).toString("utf8"));
            } catch {
                // (A hero that doesn't read isn't brought)
            }
        }
    }

    // (And what it remembers of its visitors, by player, each by their character's id)
    const visitors = {};
    const remembered = `${WORLDS}/${id}/${VISITORS}/`;

    for (const [file, entry] of archive.files) {
        const [player, name, more] = file.startsWith(remembered) ? file.slice(remembered.length).split("/") : [];

        if (player && name && !more) {
            try {
                visitors[player] ??= {};
                visitors[player][name] = JSON.parse(bytesOf(entry).toString("utf8"));
            } catch {
                // (One that doesn't read isn't brought)
            }
        }
    }

    const { writtenBy, ...world } = meta;

    return { format, exportedBy: writtenBy ?? archive.archivedBy, exported: archive.archived, world, snapshot: newestSave(archive, id)?.text ?? null, heroes, visitors };
}

/**
 * An archive put in the data folder at `root` to be restored (RESTORING), for applyRestore to put
 * in place when the server next starts. What was staged before is let go of.
 */
export async function stageRestore(root, archive, { by = null, when = new Date() } = {}) {
    const into = path.join(root, RESTORING);

    await rm(into, { recursive: true, force: true });
    await ensureFolder(into);

    for (const [file, entry] of archive.files) {
        const to = path.join(into, ...file.split("/"));

        await ensureFolder(path.dirname(to));
        await writeFile(to, bytesOf(entry), { mode: FILE_MODE });
    }

    await writeFile(path.join(into, STAGED), JSON.stringify({ archivedBy: archive.archivedBy, archived: archive.archived, staged: when.toISOString(), by }), { mode: FILE_MODE });
}

/**
 * An archive staged to be restored (stageRestore) put in place in the data folder at `root`, as
 * the server starts (before anything in it's opened): everything there but the backups and the
 * versions updates installed copied into backups/server/<when>-before-restore/ first, then let go
 * of, then the archive's files put where they were. Returns what was restored ({ archivedBy,
 * archived, backup }), or null if nothing was staged (one cut short is let go of).
 */
export async function applyRestore(root, { when = new Date() } = {}) {
    const staged = path.join(root, RESTORING);

    if (!(await exists(staged))) {
        return null;
    }

    let said;

    try {
        said = JSON.parse(await readFile(path.join(staged, STAGED), "utf8"));
    } catch {
        await rm(staged, { recursive: true, force: true });

        return null;
    }

    const backup = `${stampOf(when)}-before-restore`;
    const into = path.join(root, BACKUPS, "server", backup);

    await ensureFolder(into);

    for (const name of await readdir(root)) {
        if (!LEFT_OUT.has(name)) {
            await cp(path.join(root, name), path.join(into, name), { recursive: true });
            await rm(path.join(root, name), { recursive: true, force: true });
        }
    }

    await rm(path.join(staged, STAGED), { force: true });

    for (const name of await readdir(staged)) {
        await rename(path.join(staged, name), path.join(root, name));
    }

    await rm(staged, { recursive: true, force: true });
    await writeFile(path.join(root, SERVER_JOURNAL), `${when.toISOString()} Restored from an archive Pellagos server ${said.archivedBy ?? "(unknown)"} made${said.archived ? ` on ${said.archived}` : ""}${said.by ? `, as ${said.by} asked` : ""}: what was here before is in ${BACKUPS}/server/${backup}/.\n`, { flag: "a", mode: FILE_MODE });

    return { archivedBy: said.archivedBy ?? null, archived: said.archived ?? null, backup };
}
