// Linux, and any other system this has no file of its own for: the XDG base directories (the
// data in $XDG_DATA_HOME, the logs in $XDG_STATE_HOME, the caches in $XDG_CACHE_HOME), each
// where the specification puts it under the home folder if it isn't set (or isn't absolute).
// Kept awake by systemd-inhibit where there's systemd (and nothing where there isn't). Bonjour
// through Avahi's tools (avahi-utils), where avahi-daemon runs. The router (the default gateway)
// from the kernel's routing tables, /proc/net/route and /proc/net/ipv6_route.

import { spawn as spawnProcess } from "node:child_process";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";
import { refusal, SERVICE, ToolHandle } from "./bonjour.js";
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

/** The computer's own name, if it has one apart from its host name: not on Linux (its host name serves). */
export function computerName() {
    return Promise.resolve(null);
}

/** What a line of an Avahi tool's says went wrong, if it does: a refusal. */
export function avahiRefusal(line) {
    if (/^Failed to (?:connect to Avahi server|create client object)/.test(line)) {
        return refusal(/Daemon not running/i.test(line) ? "no-daemon" : "failed", line.trim());
    }

    return /^Failed to /.test(line) ? refusal("failed", line.trim()) : null;
}

// avahi-browse's parsable names: \DDD (a byte, in decimal) and \X (X itself)
const unescape = (text) => text.replace(/\\(\d{3}|.)/g, (all, escaped) => (/^\d{3}$/.test(escaped) ? String.fromCharCode(Number(escaped)) : escaped));

/** TXT strings as avahi-browse shows them: "a=b" "c=d" (quoted, with \" and \\ escaped). */
export function avahiTxt(field) {
    return [...String(field ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(([, inside]) => inside.replace(/\\(.)/g, "$1"));
}

/**
 * A line of `avahi-browse -rpk`'s: { kind ("+" seen, "=" resolved, "-" gone), where (its
 * interface and protocol), name, and for "=": host, address, port, txt }, or null.
 */
export function avahiLine(line) {
    const fields = line.split(";");

    if (!["+", "=", "-"].includes(fields[0]) || fields.length < 6 || fields[4] !== SERVICE) {
        return null;
    }

    const seen = { kind: fields[0], where: `${fields[1]};${fields[2]}`, name: unescape(fields[3]) };

    return fields[0] === "=" ? { ...seen, host: fields[6], address: fields[7], ipv4: fields[2] === "IPv4", port: Number(fields[8]), txt: avahiTxt(fields.slice(9).join(";")) } : seen;
}

/**
 * Bonjour on Linux (§2), by Avahi's tools: advertise({ name, port, txt }) by
 * avahi-publish-service, browse() by avahi-browse, which resolves as it finds (so its "found"
 * carries the host, address, port and TXT, and there's no resolving apart).
 */
export function bonjour({ spawn = spawnProcess } = {}) {
    return {
        advertise({ name, port, txt }) {
            return new ToolHandle(spawn, ["avahi-publish-service", "-s", name, SERVICE, String(port), ...txt], (line) => {
                const established = /^Established under name '(.*)'$/.exec(line.trim());

                return established ? ["registered", established[1]] : avahiRefusal(line) ? ["refused", avahiRefusal(line)] : null;
            });
        },

        browse() {
            // (Each instance is seen on each interface and protocol: lost with the last)
            const seen = new Map();

            return new ToolHandle(spawn, ["avahi-browse", "-rpk", SERVICE], (line) => {
                const refused = avahiRefusal(line);

                if (refused) {
                    return ["refused", refused];
                }

                const change = avahiLine(line);

                if (!change || change.kind === "+") {
                    return null;
                }

                const on = seen.get(change.name) ?? new Map();

                if (change.kind === "=") {
                    on.set(change.where, change);
                    seen.set(change.name, on);

                    // (Its IPv4 address, where it has one: the one a phone's browser surely reaches)
                    const best = [...on.values()].find((one) => one.ipv4) ?? change;

                    return ["found", { name: change.name, host: best.host, address: best.address, port: best.port, txt: best.txt }];
                }

                on.delete(change.where);

                if (on.size) {
                    return null;
                }

                seen.delete(change.name);

                return ["lost", { name: change.name }];
            });
        },

        resolve(name) {
            return Promise.reject({ code: "unsupported", message: `${name} is resolved as it's browsed here.` });
        },
    };
}

/** The IPv4 default gateway in /proc/net/route's table (its lowest metric), or null. */
export function routeTable(text) {
    const routes = String(text)
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => fields.length >= 8 && fields[1] === "00000000" && parseInt(fields[3], 16) & 0x2)
        .sort((a, b) => Number(a[6]) - Number(b[6]));
    const hex = routes[0]?.[2];

    // (The gateway's bytes, as the kernel holds them: least significant first)
    return hex ? [6, 4, 2, 0].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(".") : null;
}

/** The IPv6 default gateway in /proc/net/ipv6_route's table (its lowest metric; a link-local one with its interface), or null. */
export function routeTable6(text) {
    const routes = String(text)
        .split("\n")
        .map((line) => line.trim().split(/\s+/))
        .filter((fields) => fields.length >= 10 && /^0{32}$/.test(fields[0]) && fields[1] === "00" && !/^0{32}$/.test(fields[4]))
        .sort((a, b) => parseInt(a[5], 16) - parseInt(b[5], 16));
    const [route] = routes;

    if (!route) {
        return null;
    }

    // (Written short, as URLs write it)
    const address = new URL(`http://[${route[4].match(/.{4}/g).join(":")}]`).hostname.slice(1, -1);

    return address.startsWith("fe80:") ? `${address}%${route[9]}` : address;
}

/** The default gateways, for IPv4 and IPv6, from the kernel's tables: { v4, v6 } (each an address, or null). */
export async function gateways({ readFile = readFileAsync } = {}) {
    const [v4, v6] = await Promise.all([readFile("/proc/net/route", "utf8").then(routeTable, () => null), readFile("/proc/net/ipv6_route", "utf8").then(routeTable6, () => null)]);

    return { v4, v6 };
}

/** Where Tailscale's command may be, in turn. */
export const TAILSCALE = Object.freeze(["tailscale", "/usr/bin/tailscale", "/usr/sbin/tailscale"]);
