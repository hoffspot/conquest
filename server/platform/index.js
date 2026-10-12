// The world server's platform layer (generated/world_server_plan.md §2): everything that differs
// between operating systems, behind one small interface, so that nothing else in the server
// changes from one to another. A file for each (darwin.js first; linux.js and win32.js fill in
// the same functions), chosen by `process.platform`. For now, where the server keeps its data,
// logs and caches; keeping the machine awake, Bonjour, secrets and running at login come with the
// server itself (S2, S5, S8).

import os from "node:os";
import * as darwin from "./darwin.js";
import * as linux from "./linux.js";
import * as win32 from "./win32.js";

export { APP_FOLDER, APP_ID, APP_NAME } from "./names.js";

/** Where its data goes instead (one folder), if set: as the tests and `--data` have it. */
export const DATA_OVERRIDE = "PELLAGOS_SERVER_DATA";

const PLATFORMS = Object.freeze({ darwin, linux, win32 });

/** The platform's file for an operating system (`process.platform`'s name): Linux's for any other. */
export function platformFor(system = process.platform) {
    return PLATFORMS[system] ?? linux;
}

/**
 * Where the server keeps things on this machine: { data, logs, cache } (absolute paths: its data
 * folder, generated/world_server_plan.md §5; its logs; what it can make again). `system`, `env`
 * and `home` are this machine's unless given (as the tests give them).
 */
export function folders({ system = process.platform, env = process.env, home = os.homedir() } = {}) {
    const found = platformFor(system).folders({ env, home });

    return env[DATA_OVERRIDE] ? { ...found, data: env[DATA_OVERRIDE] } : found;
}
