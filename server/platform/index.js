// The world server's platform layer (generated/world_server_plan.md §2): everything that differs
// between operating systems, behind one small interface, so that nothing else in the server
// changes from one to another. A file for each (darwin.js first; linux.js and win32.js fill in
// the same functions), chosen by `process.platform`. For now, where the server keeps its data,
// logs and caches, keeping the machine awake while players are in, the computer's own name, and
// Bonjour (bonjour.js: what each system's tool shares), and where tokens for others' services are
// kept (the Keychain on macOS), the router's address (the default gateway), and where Tailscale's
// command is (for Funnel); running at login comes later (S8). Nothing outside this folder may run a command only one system has
// (test/registry.test.js checks).

import { execFile as execFileProcess } from "node:child_process";
import os from "node:os";
import { TokenFile } from "../storage/tokens.js";
import * as darwin from "./darwin.js";
import * as linux from "./linux.js";
import * as win32 from "./win32.js";

export { cardOfTxt, REFUSALS, SERVICE, txtOf } from "./bonjour.js";
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

/**
 * The machine kept from sleeping while players are in (generated/world_server_plan.md §11):
 * returns { command (what it runs, or null if this system can't yet), stop() }. `system` is this
 * machine's, and `spawn` Node's, unless given.
 */
export function keepAwake({ system = process.platform, ...options } = {}) {
    return platformFor(system).keepAwake(options);
}

/** The computer's own name as its owner set it (macOS's "Studio Mac"), or null where there's none apart from its host name. */
export function computerName({ system = process.platform, ...options } = {}) {
    return platformFor(system).computerName(options);
}

/**
 * Bonjour on this machine (generated/world_server_plan.md §8.2): { advertise({ name, port, txt }),
 * browse(), resolve(name) } (bonjour.js says what each gives). `system` is this machine's, and
 * `spawn` Node's, unless given (as the tests give them: a fake responder).
 */
export function bonjour({ system = process.platform, ...options } = {}) {
    return platformFor(system).bonjour(options);
}

/**
 * Where the server keeps tokens for others' services (a DNS host's: §13): macOS's Keychain, or
 * elsewhere `file` (storage/tokens.js, 0600). { where, get(name), set(name, token), remove(name) }.
 */
export function tokenStore({ system = process.platform, file, ...options } = {}) {
    return system === "darwin" ? darwin.keychain(options) : new TokenFile(file);
}

/** The router: the default gateways, for IPv4 and IPv6 ({ v4, v6 }, each an address or null). */
export function gateways({ system = process.platform, ...options } = {}) {
    return platformFor(system).gateways(options);
}

/**
 * Tailscale's command (generated/world_server_plan.md §9.4), wherever this system keeps it (each of
 * its platform's TAILSCALE tried in turn): run(args, { timeout }) resolves { ok, stdout, stderr,
 * timedOut } once it's run (ok false if it failed), or { missing: true } if it isn't installed.
 * `execFile` for the tests.
 */
export function tailscale({ system = process.platform, execFile = execFileProcess } = {}) {
    const commands = platformFor(system).TAILSCALE;

    return async (args, { timeout = 15000 } = {}) => {
        for (const command of commands) {
            const done = await new Promise((resolve) => execFile(command, args, { timeout, maxBuffer: 1 << 20 }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") })));

            if (done.error?.code === "ENOENT" || done.error?.code === "EACCES") {
                continue;
            }

            return { ok: !done.error, stdout: done.stdout, stderr: done.stderr, timedOut: Boolean(done.error?.killed) };
        }

        return { missing: true };
    };
}
