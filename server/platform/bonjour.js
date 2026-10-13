// What every system's Bonjour shares (generated/world_server_plan.md §8.2): the service the
// servers advertise and browse for, what its TXT record carries, and the handles darwin.js
// (dns-sd) and linux.js (avahi) give back. Each system's own tool is run as a child process and
// its output read a line at a time; nothing here speaks multicast DNS itself, so the system's own
// responder (and its permissions) decide.
//
// A handle is an event emitter, with stop():
//   advertise → "registered" (the name it's known by, which the responder may have changed to
//               make it unique), "refused" ({ code, message }), "ended" ({ code, message })
//   browse    → "found" ({ name, host?, port?, address?, txt? }: the host and TXT where the tool
//               resolves as it browses), "lost" ({ name }), "refused", "ended"
// A refusal is the system saying no (macOS's Local Network permission, a responder not running,
// no tools): it says what to do. "ended" is the tool stopping unasked.

import { EventEmitter } from "node:events";

/** The service Pellagos servers advertise. */
export const SERVICE = "_pellagos._tcp";

/** The TXT record's own version (txtvers), for a later change to what it carries. */
export const TXT_VERSION = 1;

/** Why Bonjour can't be had, by what the system said: what the page tells the owner. */
export const REFUSALS = Object.freeze({
    denied: "macOS refused Bonjour: open System Settings › Privacy & Security › Local Network, and let the app that runs the server (Terminal, say) find devices on the network. Play carries on without it: players type the address.",
    "not-running": "Bonjour isn't running on this computer. Play carries on without it: players type the address.",
    "no-tools": "This computer has no Bonjour tools (macOS's dns-sd, or avahi-utils on Linux). Play carries on without it: players type the address.",
    "no-daemon": "Avahi isn't running: install and start avahi-daemon to be seen on the Wi-Fi. Play carries on without it: players type the address.",
    unsupported: "Bonjour isn't supported on this system yet. Play carries on without it: players type the address.",
    failed: "Bonjour failed. Play carries on without it: players type the address.",
});

/** A refusal: { code, message } (the code one of REFUSALS'). */
export const refusal = (code, detail = null) => ({ code, message: REFUSALS[code] ?? REFUSALS.failed, ...(detail ? { detail } : {}) });

// A TXT value kept to letters, digits and . _ - %: no tool's escaping (dns-sd's for the shell,
// avahi's for its own quoting) can touch it, so it reads back as it was written
const encode = (value) => encodeURIComponent(String(value)).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const decode = (value) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

/**
 * The TXT record a server advertises (§8.2): its id, name, version, NET_VERSION, play port and
 * how many worlds it lists, as "key=value" strings.
 */
export function txtOf({ id, name, version, net, port, worlds }) {
    return [`txtvers=${TXT_VERSION}`, `id=${encode(id)}`, `name=${encode(name)}`, `version=${encode(version)}`, `net=${Number(net) | 0}`, `port=${Number(port) | 0}`, `worlds=${Number(worlds) | 0}`];
}

/**
 * A server's card from its TXT record ("key=value" strings, or a map): { id, name, version, net,
 * port, worlds }, or null if it isn't a Pellagos server's (no id).
 */
export function cardOfTxt(txt) {
    const pairs = new Map(Array.isArray(txt) ? txt.map((entry) => [entry.slice(0, entry.indexOf("=") < 0 ? entry.length : entry.indexOf("=")), entry.indexOf("=") < 0 ? "" : entry.slice(entry.indexOf("=") + 1)]) : Object.entries(txt ?? {}));
    const id = decode(pairs.get("id") ?? "");

    if (!/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/.test(id)) {
        return null;
    }

    const number = (key) => (Number.isFinite(Number(pairs.get(key))) ? Number(pairs.get(key)) : null);

    return { id, name: decode(pairs.get("name") ?? "").slice(0, 80) || null, version: decode(pairs.get("version") ?? "") || null, net: number("net"), port: number("port"), worlds: number("worlds") };
}

/** Each line a stream gives, as it comes (a partial last line kept till it's ended). */
export function eachLine(stream, onLine) {
    let held = "";

    stream?.setEncoding?.("utf8");
    stream?.on?.("data", (chunk) => {
        const lines = (held + chunk).split(/\r?\n/);

        held = lines.pop();
        lines.forEach(onLine);
    });
    stream?.on?.("end", () => {
        if (held) {
            onLine(held);
            held = "";
        }
    });
}

/**
 * A running tool's handle: the events above, and stop(). `classify(line)` reads each line of its
 * output (stdout and stderr both) and returns what it said, if anything: an [event, value] pair.
 * The first refusal ends it; so does stop(), which says nothing more.
 */
export class ToolHandle extends EventEmitter {
    constructor(spawn, command, classify) {
        super();
        this.command = command;
        this.stopped = false;
        this.refused = null;

        let child;

        try {
            child = spawn(command[0], command.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
        } catch (error) {
            queueMicrotask(() => this.#refuse(refusal(error?.code === "ENOENT" ? "no-tools" : "failed", error?.message)));

            return;
        }

        this.child = child;

        const read = (line) => {
            if (this.stopped || this.refused) {
                return;
            }

            const said = classify(line);

            if (said?.[0] === "refused") {
                this.#refuse(said[1]);
            } else if (said) {
                this.emit(...said);
            }
        };

        eachLine(child.stdout, read);
        eachLine(child.stderr, read);
        child.on("error", (error) => this.#refuse(refusal(error?.code === "ENOENT" ? "no-tools" : "failed", error?.message)));
        child.on("exit", (code, signal) => {
            if (!this.stopped && !this.refused) {
                this.emit("ended", { code: "ended", message: `It stopped (${signal ?? `exit ${code}`}).` });
            }
        });
    }

    #refuse(why) {
        if (this.stopped || this.refused) {
            return;
        }

        this.refused = why;
        this.#kill();
        this.emit("refused", why);
    }

    #kill() {
        try {
            this.child?.kill();
        } catch {
            // (Gone already)
        }
    }

    /** It's stopped, saying nothing more. */
    stop() {
        this.stopped = true;
        this.#kill();
    }
}

/** A handle that's refused at once (a system with no Bonjour). */
export function refusedHandle(code) {
    const handle = new EventEmitter();

    handle.command = null;
    handle.stopped = false;
    handle.refused = refusal(code);
    handle.stop = () => {
        handle.stopped = true;
    };
    queueMicrotask(() => !handle.stopped && handle.emit("refused", handle.refused));

    return handle;
}
