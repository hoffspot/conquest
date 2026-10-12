// How the world server writes what it keeps (generated/world_server_plan.md §5, §5.1): never in
// place. Each file's written whole to a temporary file beside it, made to reach the disk (fsync),
// and only then put where it goes (rename, which replaces the old one at once), and the folder made
// to reach the disk too: so a crash or a power cut leaves the old file or the new one, never half
// of either. Folders are the owner's alone (0700), and so are files (0600).

import { randomBytes } from "node:crypto";
import { access, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

/** Who may open what the server keeps: its owner alone. */
export const FOLDER_MODE = 0o700;
export const FILE_MODE = 0o600;

const gzipped = promisify(gzip);
const gunzipped = promisify(gunzip);

/** A folder (and those it's in) made, if it isn't there. */
export async function ensureFolder(folder) {
    await mkdir(folder, { recursive: true, mode: FOLDER_MODE });
}

/** Whether there's a file or folder at `file`. */
export async function exists(file) {
    try {
        await access(file);

        return true;
    } catch {
        return false;
    }
}

// A folder's entries (a rename into it) made to reach the disk. (Windows can't open a folder to:
// there a rename reaches it as it's done)
async function syncFolder(folder) {
    let handle = null;

    try {
        handle = await open(folder, "r");
        await handle.sync();
    } catch (error) {
        if (!["EISDIR", "EPERM", "EINVAL", "EBADF", "EACCES"].includes(error.code)) {
            throw error;
        }
    } finally {
        await handle?.close();
    }
}

/**
 * `data` (a string or bytes) written to `file` atomically: whole, or not at all (the old file left
 * as it was). Its folder's made if it isn't there.
 */
export async function writeAtomic(file, data, { mode = FILE_MODE } = {}) {
    const folder = path.dirname(file);
    const temporary = path.join(folder, `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
    let handle = null;

    await ensureFolder(folder);

    try {
        handle = await open(temporary, "wx", mode);
        await handle.writeFile(data);
        await handle.sync();
        await handle.close();
        handle = null;
        await rename(temporary, file);
    } catch (error) {
        await handle?.close().catch(() => {});
        await rm(temporary, { force: true });
        throw error;
    }

    await syncFolder(folder);
}

/** `value` written to `file` as JSON (indented, to be read by people too), atomically. */
export async function writeJSON(file, value) {
    await writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** What's in `file`, as JSON. */
export async function readJSON(file) {
    return JSON.parse(await readFile(file, "utf8"));
}

/** `text` written to `file` gzipped, atomically. */
export async function writeGzip(file, text) {
    await writeAtomic(file, await gzipped(Buffer.from(text, "utf8")));
}

/** The text in a gzipped `file`. */
export async function readGzip(file) {
    return (await gunzipped(await readFile(file))).toString("utf8");
}

/** A moment as a file's name can carry it (UTC, to the second): "2026-10-12T22-41-05Z". */
export function stampOf(date) {
    return date.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
}
