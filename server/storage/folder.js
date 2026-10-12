// The world server's data folder (generated/world_server_plan.md §5, §5.1): everything it keeps,
// in one folder (platform/index.js says where). At its root, VERSION says how the folder's laid
// out (LAYOUT_VERSION) and which server laid it out. Opened by an older server than that, it's
// refused, saying which server it needs; by a newer one, it's laid out anew a step at a time
// (LAYOUT_STEPS: files moved or split), on opening, before anything else, after everything in it
// has been copied into its backups. Then its settings (settings.js) are opened, as they are.
//
//   VERSION                 the layout's version, and the server that laid it out
//   server.json             the server's settings
//   backups/server/         copies made before the folder or its settings were brought forward
//   worlds/                 the worlds it keeps (worlds.js)
//   (and the rest as generated/world_server_plan.md §5 has them, as they come)

import { cp, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ensureFolder, stampOf, writeAtomic } from "./files.js";
import { CONFIG_VERSION, Settings } from "./settings.js";
import { checkVersion, SERVER_VERSION } from "./versions.js";
import { WorldStore } from "./worlds.js";

/** How the data folder's laid out: bump it, with a step in LAYOUT_STEPS, when what's in it moves. */
export const LAYOUT_VERSION = 1;

/** The steps that lay an older server's folder out anew: [n] takes it (its root) from version n to n + 1. */
export const LAYOUT_STEPS = Object.freeze({});

/** What's at its root: the layout's version, the settings, and the backups. */
export const VERSION_FILE = "VERSION";
export const SETTINGS_FILE = "server.json";
export const BACKUPS = "backups";

/** Where the copies made before the folder's brought forward go (in BACKUPS: a world's go by its id, which is never this). */
export const SERVER_BACKUPS = "server";

// VERSION as it's written: the layout's version on the first line, the server that wrote it on the second
const versionText = (layout) => `${layout}\nPellagos server ${SERVER_VERSION}\n`;

/** How a data folder's laid out, as its VERSION says: { layout, writtenBy }, or null if it has none. */
export async function readLayout(root) {
    let text;

    try {
        text = await readFile(path.join(root, VERSION_FILE), "utf8");
    } catch (error) {
        if (error.code === "ENOENT") {
            return null;
        }

        throw error;
    }

    const [first = "", second = ""] = text.split(/\r?\n/);

    return { layout: /^\d+$/.test(first.trim()) ? Number(first.trim()) : NaN, writtenBy: /^Pellagos server (\S+)$/.exec(second.trim())?.[1] ?? null };
}

export class DataFolder {
    constructor(root, settings) {
        /** Where it is, the server's settings in it, and the worlds it keeps. */
        this.root = root;
        this.settings = settings;
        this.worlds = new WorldStore(root);
    }

    /**
     * The data folder at `root`, opened: made, if there's nothing there; laid out anew if an older
     * server laid it out (a copy of it made first); refused if a newer one did (versions.js
     * NewerDataError, saying which server it needs), or if it has things in it but no VERSION
     * (not a data folder of the server's). Its settings opened as settings.js has them.
     * `current`, `steps`, `configVersion` and `settingsSteps` are as they are but for the tests;
     * `clock` says when it is (the backups' names).
     */
    static async open(root, { current = LAYOUT_VERSION, steps = LAYOUT_STEPS, configVersion = CONFIG_VERSION, settingsSteps, clock = () => new Date() } = {}) {
        await ensureFolder(root);

        let layout = await readLayout(root);

        if (!layout) {
            const there = (await readdir(root)).filter((name) => !name.startsWith("."));

            if (there.length) {
                throw new Error(`${root} isn't a Pellagos server's data folder: there are things in it, but no ${VERSION_FILE}. Choose an empty folder, or the one the server made.`);
            }

            await writeAtomic(path.join(root, VERSION_FILE), versionText(current));
            layout = { layout: current, writtenBy: SERVER_VERSION };
        }

        if (checkVersion(`The data folder ${root}`, { found: layout.layout, current, writtenBy: layout.writtenBy })) {
            // (Every step there before any's taken: never left half laid out for want of one)
            for (let version = layout.layout; version < current; version++) {
                if (typeof steps[version] !== "function") {
                    throw new Error(`The data folder ${root}: there's no way forward from layout ${version} (a step's missing).`);
                }
            }

            await DataFolder.#backUp(root, `before-layout-${current}`, clock());

            for (let version = layout.layout; version < current; version++) {
                await steps[version](root);
                await writeAtomic(path.join(root, VERSION_FILE), versionText(version + 1));
            }
        }

        const settings = await Settings.open(path.join(root, SETTINGS_FILE), {
            current: configVersion,
            steps: settingsSteps,
            beforeMoving: async (file) => {
                const copy = path.join(root, BACKUPS, SERVER_BACKUPS, `${stampOf(clock())}-before-settings-${configVersion}.json`);

                await ensureFolder(path.dirname(copy));
                await cp(file, copy);
            },
        });

        return new DataFolder(root, settings);
    }

    // Everything in the folder but its backups, copied into them (BACKUPS/SERVER_BACKUPS/<when>-<why>/)
    static async #backUp(root, why, when) {
        const into = path.join(root, BACKUPS, SERVER_BACKUPS, `${stampOf(when)}-${why}`);

        await ensureFolder(into);

        for (const name of await readdir(root)) {
            if (name !== BACKUPS) {
                await cp(path.join(root, name), path.join(into, name), { recursive: true });
            }
        }

        return into;
    }
}
