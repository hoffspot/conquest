// macOS (generated/world_server_plan.md §5, §8.2, §11): the data in Application Support and the
// logs in Logs, each in a folder named by the server's id; what can be made again in Caches. Kept
// awake while players are in by caffeinate, which ends itself if the server does. Bonjour through
// dns-sd, macOS's own tool for its responder (mDNSResponder): run from Terminal it needs no Local
// Network permission of its own (Terminal's children are exempt); refused, it says so with one of
// DNSServiceErrorType's codes, which are named for the owner here.

import { execFile as execFileProcess, spawn as spawnProcess } from "node:child_process";
import path from "node:path";
import { refusal, SERVICE, ToolHandle } from "./bonjour.js";
import { APP_ID } from "./names.js";

const DNS_SD = "/usr/bin/dns-sd";

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

/** The computer's own name, as the owner set it (System Settings › General › Sharing), or null. */
export function computerName({ execFile = execFileProcess } = {}) {
    return new Promise((resolve) => {
        try {
            execFile("/usr/sbin/scutil", ["--get", "ComputerName"], { timeout: 2000 }, (error, stdout) => resolve(error ? null : String(stdout).trim() || null));
        } catch {
            resolve(null);
        }
    });
}

// dns-sd's refusals (dns_sd.h's DNSServiceErrorType): the Local Network permission's (PolicyDenied,
// NoAuth, NotPermitted), and mDNSResponder not running (ServiceNotRunning)
const DENIED = new Set([-65570, -65555, -65571]);
const NOT_RUNNING = -65563;

/** What a line of dns-sd's says went wrong, if it does: a refusal. */
export function dnsSdRefusal(line) {
    const failed = /(?:fail|error)\D*?(-655\d\d)\b/i.exec(line);

    if (!failed) {
        return null;
    }

    const code = Number(failed[1]);

    return refusal(DENIED.has(code) ? "denied" : code === NOT_RUNNING ? "not-running" : "failed", `dns-sd: ${line.trim()}`);
}

/** A line of `dns-sd -B`'s: { add, interfaceIndex, name } (an instance added or removed), or null. */
export function browseLine(line) {
    const found = /^\s*\d+:\d+:\d+\.\d+\s+(Add|Rmv)\s+\d+\s+(\d+)\s+\S+\s+_pellagos\._tcp\.\s+(.*?)\s*$/.exec(line);

    return found ? { add: found[1] === "Add", interfaceIndex: Number(found[2]), name: found[3] } : null;
}

/** A line of `dns-sd -L`'s saying where a service is: { host, port }, or null. */
export function reachedLine(line) {
    const found = /can be reached at (\S+?)\.?:(\d+) \(interface \d+\)/.exec(line);

    return found ? { host: found[1], port: Number(found[2]) } : null;
}

/** The TXT record as `dns-sd -L` shows it (" key=value ...", with the shell's characters escaped): its strings. */
export function txtLine(line) {
    return line
        .trim()
        .split(/(?<!\\) /)
        .filter(Boolean)
        .map((entry) => entry.replace(/\\(.)/g, "$1"));
}

/**
 * Bonjour on macOS (§8.2), by dns-sd: advertise({ name, port, txt }) and browse() give handles
 * (bonjour.js); resolve(name) where an instance is, { host, port, txt }, or a refusal thrown.
 */
export function bonjour({ spawn = spawnProcess } = {}) {
    const browsing = new Map();

    return {
        advertise({ name, port, txt }) {
            return new ToolHandle(spawn, [DNS_SD, "-R", name, SERVICE, "local", String(port), ...txt], (line) => {
                const registered = /Got a reply for service (.*)\._pellagos\._tcp\.\S*: Name now registered and active/.exec(line);

                return registered ? ["registered", registered[1]] : dnsSdRefusal(line) ? ["refused", dnsSdRefusal(line)] : null;
            });
        },

        browse() {
            // (An instance is seen once on each interface it's on: found on the first, lost with the last)
            const seen = new Map();

            browsing.clear();

            return new ToolHandle(spawn, [DNS_SD, "-B", SERVICE, "local"], (line) => {
                const refused = dnsSdRefusal(line);

                if (refused) {
                    return ["refused", refused];
                }

                const change = browseLine(line);

                if (!change) {
                    return null;
                }

                const on = seen.get(change.name) ?? new Set();

                if (change.add) {
                    on.add(change.interfaceIndex);
                    seen.set(change.name, on);

                    return on.size === 1 ? ["found", { name: change.name }] : null;
                }

                on.delete(change.interfaceIndex);

                if (on.size) {
                    return null;
                }

                seen.delete(change.name);

                return ["lost", { name: change.name }];
            });
        },

        resolve(name, { timeout = 5000 } = {}) {
            return new Promise((resolve, reject) => {
                let reached = null;
                let settle = null;

                const done = (value, error = null) => {
                    clearTimeout(timer);
                    clearTimeout(settle);
                    handle.stop();
                    error ? reject(error) : resolve(value);
                };
                const timer = setTimeout(() => done(null, { code: "timeout", message: `${name} didn't say where it is.` }), timeout);
                const handle = new ToolHandle(spawn, [DNS_SD, "-L", name, SERVICE, "local"], (line) => {
                    const refused = dnsSdRefusal(line);

                    if (refused) {
                        return ["refused", refused];
                    }

                    if (reached) {
                        done({ ...reached, txt: /=/.test(line) ? txtLine(line) : [] });
                    } else if ((reached = reachedLine(line))) {
                        // (Its TXT record comes on the next line: waited for a moment)
                        settle = setTimeout(() => done({ ...reached, txt: [] }), 300);
                    }

                    return null;
                });

                handle.on("refused", (why) => done(null, why));
                handle.on("ended", (why) => done(null, why));
            });
        },
    };
}
