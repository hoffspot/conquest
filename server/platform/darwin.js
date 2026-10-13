// macOS (generated/world_server_plan.md §5, §11): the data in Application Support and the logs
// in Logs, each in a folder named by the server's id; what can be made again in Caches. Kept
// awake while players are in by caffeinate, which ends itself if the server does.

import { spawn as spawnProcess } from "node:child_process";
import path from "node:path";
import { APP_ID } from "./names.js";

/** Where the server keeps things: { data, logs, cache }. */
export function folders({ home }) {
    const library = path.posix.join(home, "Library");

    return {
        data: path.posix.join(library, "Application Support", APP_ID),
        logs: path.posix.join(library, "Logs", APP_ID),
        cache: path.posix.join(library, "Caches", APP_ID),
    };
}

/**
 * The Mac kept from sleeping while players are in (§11): `caffeinate -i` holds off idle sleep, and
 * `-w` ends it if the server ends. Never `pmset`: the owner's settings are theirs. Returns
 * { command, stop() }.
 */
export function keepAwake({ spawn = spawnProcess, pid = process.pid } = {}) {
    const command = ["/usr/bin/caffeinate", "-i", "-w", String(pid)];
    const child = spawn(command[0], command.slice(1), { stdio: "ignore" });

    child.on("error", () => {});
    child.unref?.();

    return { command, stop: () => child.kill() };
}
