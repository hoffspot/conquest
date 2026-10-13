// Linux, and any other system this has no file of its own for: the XDG base directories (the
// data in $XDG_DATA_HOME, the logs in $XDG_STATE_HOME, the caches in $XDG_CACHE_HOME), each
// where the specification puts it under the home folder if it isn't set (or isn't absolute).
// Kept awake by systemd-inhibit where there's systemd (and nothing where there isn't).

import { spawn as spawnProcess } from "node:child_process";
import path from "node:path";
import { APP_FOLDER, APP_NAME } from "./names.js";

// An XDG folder: as set, if it's an absolute path; else its default under the home folder
const base = (env, name, home, fallback) => (path.posix.isAbsolute(env[name] ?? "") ? env[name] : path.posix.join(home, ...fallback));

/** Where the server keeps things: { data, logs, cache }. */
export function folders({ env, home }) {
    return {
        data: path.posix.join(base(env, "XDG_DATA_HOME", home, [".local", "share"]), APP_FOLDER),
        logs: path.posix.join(base(env, "XDG_STATE_HOME", home, [".local", "state"]), APP_FOLDER, "logs"),
        cache: path.posix.join(base(env, "XDG_CACHE_HOME", home, [".cache"]), APP_FOLDER),
    };
}

/**
 * The machine kept from sleeping while players are in: a sleep inhibitor from systemd, held by a
 * command that ends when the server does. Where there's no systemd it fails quietly. Returns
 * { command, stop() }.
 */
export function keepAwake({ spawn = spawnProcess, pid = process.pid } = {}) {
    const command = ["systemd-inhibit", "--what=idle:sleep", `--who=${APP_NAME}`, "--why=Players are in a world", "--mode=block", "tail", `--pid=${pid}`, "-f", "/dev/null"];
    const child = spawn(command[0], command.slice(1), { stdio: "ignore" });

    child.on("error", () => {});
    child.unref?.();

    return { command, stop: () => child.kill() };
}
