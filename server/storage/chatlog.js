// The server's chat log (generated/multiplayer_scaling_plan.md 6B-6): what's said in its public
// worlds, kept thirty days, so a report of a player can show what was said between the two and
// the server's owner can read what a report is about. It exists only for public worlds: nothing
// said in any other world is written anywhere (server/play.js `said`).
//
// A line a day's file, `chat/<world>/<YYYY-MM-DD>.jsonl`, each a line of JSON:
//
//   { at, from, identity, name, channel, text, quick, to }
//
// `from` is the sayer's player id in that world and `identity` their own (storage/players.js),
// or null; `channel` is one of CHAT_CHANNELS; `quick`, a phrase's id where one was chosen; `to`,
// the player ids it went to. The words are scrubbed as the structured log's are (log.js `scrub`):
// anything shaped like a key, a token or a whole address is never written.
//
// A day's file is deleted once it's more than CHATLOG.days old (`prune`: as the log's opened, and
// as each new day's first line is written). The folder is left out of the server's archive
// (storage/archive.js), so no backup keeps a line longer than that.

import { appendFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { scrub } from "../log.js";
import { ensureFolder, exists, FILE_MODE } from "./files.js";

const DAY = 86400000;

/** Its folder in the server's; how many days a line's kept; how many of a world's latest lines are held in memory, for a report to read. */
export const CHATLOG = Object.freeze({ folder: "chat", days: 30, recent: 400 });

/** Where a line was said. */
export const CHAT_CHANNELS = Object.freeze(["party", "squad", "dm", "shout", "area"]);

/** The channel of a line as core/netplay.js Session tells it ({ shout, area, squad, dm }). */
export const channelOf = (line) => (line?.shout === true ? "shout" : line?.area === true ? "area" : line?.squad === true ? "squad" : line?.dm ? "dm" : "party");

const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const WORLD = /^[A-Za-z0-9_-]{1,64}$/;

export class ChatLog {
    constructor(root, { clock = Date.now } = {}) {
        this.folder = path.join(root, CHATLOG.folder);
        this.clock = clock;
        /** Each world's latest lines, oldest first. */
        this.recent = new Map();
        this.writing = Promise.resolve();
        this.error = null;
        this.day = null;
    }

    /** The log of the server whose data folder is `root`, its old days deleted. */
    static async open(root, options = {}) {
        const log = new ChatLog(root, options);

        await log.prune();

        return log;
    }

    /**
     * A line said in a public world, kept: in memory for a report to read, and written in its
     * turn (`writing` says when). Returns what was kept, or null for what isn't a line.
     */
    add(world, { from, identity = null, name = "", channel, text, quick = null, to = [] } = {}) {
        if (!WORLD.test(String(world)) || typeof from !== "string" || typeof text !== "string" || !CHAT_CHANNELS.includes(channel)) {
            return null;
        }

        const now = this.clock();
        const entry = { at: new Date(now).toISOString(), from, identity, name: scrub(String(name)), channel, text: scrub(text), ...(quick !== null ? { quick } : {}), to: to.filter((one) => typeof one === "string") };
        const recent = this.recent.get(world) ?? this.recent.set(world, []).get(world);

        recent.push(entry);
        recent.splice(0, Math.max(0, recent.length - CHATLOG.recent));

        const day = dayOf(now);
        const aged = this.day !== null && this.day !== day;

        this.day = day;
        this.writing = this.writing
            .then(async () => {
                await ensureFolder(path.join(this.folder, world));
                await appendFile(path.join(this.folder, world, `${day}.jsonl`), `${JSON.stringify(entry)}\n`, { mode: FILE_MODE });

                if (aged) {
                    await this.#prune(now);
                }
            })
            .then(
                () => {
                    this.error = null;
                },
                (error) => {
                    this.error = error.message;
                },
            );

        return entry;
    }

    /**
     * The latest lines between two players of a world (their player ids), oldest first, `most`
     * at most: each said by one of them and gone to the other. From what's in memory: since the
     * server started, and a world's latest CHATLOG.recent.
     */
    between(world, one, other, most = 20) {
        return (this.recent.get(world) ?? []).filter((line) => (line.from === one && line.to.includes(other)) || (line.from === other && line.to.includes(one))).slice(-most);
    }

    async #prune(now) {
        if (!(await exists(this.folder))) {
            return 0;
        }

        const oldest = dayOf(now - CHATLOG.days * DAY);
        let gone = 0;

        for (const world of await readdir(this.folder, { withFileTypes: true })) {
            if (!world.isDirectory()) {
                continue;
            }

            const folder = path.join(this.folder, world.name);
            const files = await readdir(folder);

            for (const file of files) {
                const day = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file)?.[1];

                if (day && day < oldest) {
                    await rm(path.join(folder, file), { force: true });
                    gone++;
                }
            }
        }

        return gone;
    }

    /** Every day's file more than CHATLOG.days old deleted, in its turn. Returns how many. */
    prune(now = this.clock()) {
        let gone = 0;

        this.writing = this.writing.then(async () => {
            gone = await this.#prune(now);
        }).catch((error) => {
            this.error = error.message;
        });

        return this.writing.then(() => gone);
    }

    /** Once everything said so far is written. */
    flush() {
        return this.writing;
    }
}
