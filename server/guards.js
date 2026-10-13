// What every request to the world server passes before anything's done with it (generated/
// world_server_plan.md §9.1, §13):
//
// - From home only, for now: plain http and ws are taken only from home addresses (the Wi-Fi, the
//   machine itself); the internet gets TLS alone, which comes with S6, so until then it's refused.
// - Its Host one of the server's own names or addresses, so a page on some other site can't reach
//   it by pointing a name of its own at the server's address (DNS rebinding).
// - Its Origin, if it's a browser's, the server's own, the game's on GitHub Pages, or one the owner
//   adds: an exact list, no wildcards, and never `null` (cross-site WebSocket hijacking).
// - An address blocked a while for too many refusals (access/limits.js) refused.
// - Bodies no bigger than LIMITS_HTTP.body, read within a time.

import os from "node:os";
import { isHome, plainAddress } from "./access/addresses.js";

/** HTTP's limits: the biggest body (bytes), and how long a request may take to come in (ms). */
export const LIMITS_HTTP = Object.freeze({ body: 64 * 1024, headers: 5000, request: 10000, keepAlive: 5000 });

/** Where the game's played from besides the server itself: its copy on GitHub Pages. */
export const GAME_ORIGINS = Object.freeze(["https://hoffspot.github.io"]);

/** A refusal, as /api/v1 says it: { error, message } with an HTTP status. */
export class Refusal extends Error {
    constructor(status, error, message, extra = {}) {
        super(message);
        Object.assign(this, { status, error, extra });
    }
}

/**
 * The names and addresses the server answers to on `port`: localhost and the machine's loopback,
 * its host name (and that's .local), every address it has, and any `names` its owner adds; each
 * as a Host header carries it (with the port, and IPv6 in brackets).
 */
export function hostsOf(port, { names = [], interfaces = os.networkInterfaces(), hostname = os.hostname() } = {}) {
    const bare = new Set(["localhost", "127.0.0.1", "::1", hostname.toLowerCase(), `${hostname.toLowerCase().replace(/\.local$/, "")}.local`, ...names.map((name) => name.toLowerCase())]);

    for (const address of Object.values(interfaces).flat()) {
        if (address?.address) {
            bare.add(address.address.toLowerCase().replace(/%.*$/, ""));
        }
    }

    const hosts = new Set();

    for (const name of bare) {
        const shown = name.includes(":") ? `[${name}]` : name;

        hosts.add(`${shown}:${port}`);

        if (port === 80) {
            hosts.add(shown);
        }
    }

    return hosts;
}

/** The origins a browser page may call the server from: its own (each of `hosts`, over http), the game's (GAME_ORIGINS), and the owner's own (`extra`). */
export function originsOf(hosts, extra = []) {
    return new Set([...[...hosts].map((host) => `http://${host}`), ...GAME_ORIGINS, ...extra]);
}

/**
 * Whether a request (or a socket's upgrade) may be taken, before anything's read of it: from where
 * (`address`), to which Host, from which Origin. Throws a Refusal if not.
 */
export function guard({ address, host, origin }, { hosts, origins, blocks }) {
    const from = plainAddress(address);

    if (!from || !isHome(from)) {
        throw new Refusal(403, "internet", "This server doesn't answer the internet yet: only its own Wi-Fi.");
    }

    const blocked = blocks?.blockedFor(from) ?? 0;

    if (blocked > 0) {
        throw new Refusal(429, "wait", "Too many refused requests from here: try again later.", { wait: Math.ceil(blocked / 1000) });
    }

    if (!host || !hosts.has(String(host).toLowerCase())) {
        throw new Refusal(421, "host", "That isn't one of this server's names.");
    }

    // (A browser always says where its page is from; anything else, a Node client say, needn't)
    if (origin !== undefined && !origins.has(origin)) {
        throw new Refusal(403, "origin", "Pages from there may not use this server.");
    }

    return from;
}

/** A request's body, as JSON (an object), refused if it's bigger than LIMITS_HTTP.body or isn't JSON. */
export async function bodyOf(request, limit = LIMITS_HTTP.body) {
    const parts = [];
    let length = 0;

    for await (const part of request) {
        length += part.length;

        if (length > limit) {
            throw new Refusal(413, "too-big", "That's more than this server takes.");
        }

        parts.push(part);
    }

    if (!length) {
        return {};
    }

    try {
        const body = JSON.parse(Buffer.concat(parts).toString("utf8"));

        if (body === null || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("not an object");
        }

        return body;
    } catch {
        throw new Refusal(400, "bad-request", "That isn't a request this server understands.");
    }
}

/** A request's address (its target, as a URL), or null if it isn't one (`GET http://[` parses as no URL). */
export function urlOf(target) {
    try {
        return new URL(target, "http://server");
    } catch {
        return null;
    }
}

/** A JSON answer (with the CORS header for `origin`, if it's one allowed). */
export function answer(response, status, value, { origin = null } = {}) {
    const text = JSON.stringify(value);

    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(text),
        "Cache-Control": "no-store",
        ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    });
    response.end(text);
}
