// The broker (generated/world_server_plan.md §8.3, §9.6, §12.3): players' own worlds, hosted in
// their browsers, listed on the server, and the games that join them helped to connect, point to
// point (WebRTC), or relayed through the server when they can't. It runs no world, and reads
// nothing of what's said but who it's for. A WebSocket at BROKER_PATH, subprotocol
// BROKER_PROTOCOL, framed as the relay's are (relay.js Socket: a first line, then what's carried).
//
//   broker -> any    "broker {ice, relaying}"      on connecting: the STUN servers to try, and
//                                                  whether the server relays when direct fails
//   host -> broker   "announce {name, people, players, most, net, visibility, direct, local, temporary}"
//                                                  -> "announced ID TOKEN" (ID: the world's code,
//                                                     CODE_LENGTH letters; or "error busy",
//                                                     "error too-many", "error bad")
//                    "keep ID TOKEN[\n{players, visibility}]"  every 15 s, or it's gone after 45 s; from a new
//                                                  link, it's the host's again -> "announced ID
//                                                  TOKEN", "here pN pN..." (or "error gone")
//                    "withdraw ID"                 taken down: those joined through it told "closed"
//                    "to pN\n..."                  relayed, to one who's joined
//                    "kick pN"                     relayed, put them out
//   anyone           "watch"                       -> "seen [listing...]", then "+ {listing}" and "- ID"
//                    "ping"                        -> "pong"
//   joiner -> broker "connect ID"                  -> "peer pN" (or "error no-room", "error full",
//                                                     "error away"); its host's told "peer pN"
//                    "data\n..."                   relayed, to the host
//   either           "signal pN\n{sdp or candidate}"  passed on as it is, as "signal pN\n..."
//                    "relay pN"                    fall back to relaying: both told "relay pN" (or
//                                                  "error relaying-off")
//   broker -> host   "from pN\n..."                relayed, from one who's joined
//                    "gone pN"                     their link to the broker's closed
//   broker -> joiner "data\n..."                   relayed, from the host
//                    "away", "back"                the host's link has dropped (it has till its
//                                                  listing expires to come back), and it's back
//                    "closed"                      the world's gone
//
// A listing (as watchers see it): { id, name, people, players, most, net, direct, through (relayed
// by the server, not direct), near (probably on the watcher's own network: the same public
// address, or both at home; a hint, never a grant), temporary (an iPhone's: dropped quickly) }.
// A world's listed if it asks to be (visibility "listed", not "code" alone), and its host can be
// reached directly, or the server relays, or it's on the watcher's own network (`local`); else it's
// hidden. One that's code alone is joined by its code, and never listed.

import { createHash } from "node:crypto";
import { connectionOf, guard, Refusal, urlOf } from "./guards.js";
import { Counts, LIMITS, Rate } from "./access/limits.js";
import { hashOf, newToken, sameHash } from "./access/tokens.js";
import { roomCode, Socket } from "./relay.js";

/** Where on the server the broker is, and the subprotocol it speaks. */
export const BROKER_PATH = "/broker";
export const BROKER_PROTOCOL = "pellagos.broker.1";

/**
 * Its limits: the longest message (bytes: a world's snapshot, relayed to one who's joined, is the
 * biggest; anything else may be `small`), how much may wait to go to one slow to take it, listings
 * per address and in all, how long one lasts without a keep, how many signals a connection attempt
 * may pass, how many may join one world at once, how long a new link has to say what it's for, and
 * how often each's asked whether it's still there (let go if it doesn't answer for `timeout`); all
 * ms but the sizes and counts.
 */
export const BROKER_LIMITS = Object.freeze({
    message: 4 * 1024 * 1024,
    small: 64 * 1024,
    backlog: 8 * 1024 * 1024,
    perAddress: 3,
    listings: 100,
    expire: 45000,
    signals: 50,
    joiners: 15,
    sayWithin: 10000,
    ping: 20000,
    timeout: 60000,
});

/** The STUN servers games try by default (free; plan §9.6): the server's own owner can give others. */
export const ICE_SERVERS = Object.freeze([{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }]);

// The WebSocket handshake's magic (RFC 6455 section 1.3)
const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// What an announcement may say, and how long each may be
const PEOPLES = /^[a-z]{1,16}$/;
const NAME_MOST = 60;

// The first line of a message, and what's after it
function split(text) {
    const at = text.indexOf("\n");

    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
}

function parse(text) {
    try {
        const value = JSON.parse(text);

        return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
        return null;
    }
}

const count = (value, most) => (Number.isInteger(value) && value >= 0 && value <= most ? value : null);

/** An announcement as it's kept (what's said of it checked, and cut to size), or null if it can't be. */
export function announcementOf(said) {
    const name = typeof said?.name === "string" ? said.name.replace(/\s+/g, " ").trim().slice(0, NAME_MOST) : "";
    const most = count(said?.most, 64);
    const players = count(said?.players, 64);

    if (!name || most === null || most < 1 || players === null || !Number.isInteger(said.net) || (said.people !== undefined && !PEOPLES.test(String(said.people)))) {
        return null;
    }

    return {
        name,
        people: said.people ?? null,
        players: Math.min(players, most),
        most,
        net: said.net,
        visibility: said.visibility === "code" ? "code" : "listed",
        direct: said.direct === true,
        local: said.local === true,
        temporary: said.temporary === true,
    };
}

/**
 * Put the broker on HTTP servers (`httpServers`: one, or several, as the one port's plain and TLS
 * halves). `server` gives what it needs: { access, settings (its `broker` and `relaying`), and what
 * guards.js asks }. `ice`: the STUN servers games are told to try. Returns { listings (by id),
 * refresh() (everyone watching sent the list again: after the relaying setting changes),
 * close() }.
 */
export function attachBroker(httpServers, server, { limits = BROKER_LIMITS, ice = ICE_SERVERS, clock = Date.now } = {}) {
    const { policy } = server.access;

    /** By id: { id, token (hashed), said (announcementOf), host (its socket, or null while it's away), address, from, keptAt, joiners (by pN: { socket, signals, relayed }), expiry }. */
    const listings = new Map();

    /** By pN: { listing, socket (the joiner's), signals, relayed }. */
    const attempts = new Map();
    const sockets = new Set();
    const watchers = new Set();
    const perAddress = new Counts(LIMITS.socketsPerAddress);
    const listedBy = new Counts(limits.perAddress);
    const signalling = new Rate(LIMITS.chat, { clock });
    const commands = new Rate(LIMITS.commands, { clock });
    let next = 1;

    const relaying = () => server.settings.get("relaying") !== false;

    // Whether one at `a` is probably on the same network as one at `b` (both at home, or the same public address)
    const near = (a, b) => (a.from === "home" && b.from === "home") || (a.from === "internet" && b.from === "internet" && a.address === b.address);

    // A listing as `watcher` sees it, or null if it's hidden from them
    const seenBy = (listing, watcher) => {
        const { said } = listing;
        const close = near(listing, watcher);

        if (said.visibility !== "listed" || !(said.direct || relaying() || (said.local && close))) {
            return null;
        }

        return { id: listing.id, name: said.name, people: said.people, players: said.players, most: said.most, net: said.net, direct: said.direct, through: !said.direct && relaying(), near: close, temporary: said.temporary };
    };

    // Each watcher told of a listing as it is now (or that it's gone, or hidden from them)
    const told = (listing, { gone = false } = {}) => {
        for (const watcher of watchers) {
            const seen = gone ? null : seenBy(listing, watcher);

            if (seen) {
                watcher.listed.add(listing.id);
                watcher.send(`+ ${JSON.stringify(seen)}`);
            } else if (watcher.listed.delete(listing.id)) {
                watcher.send(`- ${listing.id}`);
            }
        }
    };

    const seenList = (watcher) => {
        const seen = [...listings.values()].map((listing) => seenBy(listing, watcher)).filter(Boolean);

        watcher.listed = new Set(seen.map(({ id }) => id));
        watcher.send(`seen ${JSON.stringify(seen)}`);
    };

    // An attempt to join over: its host told, its joiner's link closed
    const endAttempt = (peer, { tellHost = true, close = true } = {}) => {
        const attempt = attempts.get(peer);

        if (!attempt) {
            return;
        }

        attempts.delete(peer);
        attempt.listing.joiners.delete(peer);
        signalling.forget(attempt);
        commands.forget(attempt);

        if (tellHost) {
            attempt.listing.host?.send(`gone ${peer}`);
        }

        if (close) {
            attempt.socket.send("closed");
            attempt.socket.close(1000);
        }
    };

    // A listing gone: those joined through it told, watchers told, its address's count given back
    const withdraw = (listing) => {
        if (listings.get(listing.id) !== listing) {
            return;
        }

        clearTimeout(listing.expiry);
        listings.delete(listing.id);
        listedBy.give(listing.address);

        for (const peer of [...listing.joiners.keys()]) {
            endAttempt(peer, { tellHost: false });
        }

        if (listing.host) {
            listing.host.hosting.delete(listing.id);
        }

        told(listing, { gone: true });
        policy.on("withdrawn", { listing: listing.id });
    };

    // Kept: it lasts limits.expire from now
    const keep = (listing) => {
        clearTimeout(listing.expiry);
        listing.keptAt = clock();
        listing.expiry = setTimeout(() => withdraw(listing), limits.expire);
        listing.expiry.unref?.();
    };

    const announce = (socket, rest) => {
        const said = announcementOf(parse(rest));

        if (!said) {
            socket.send("error bad");

            return;
        }

        const allowed = policy.allows(policy.identify({ address: socket.address, from: socket.from }).principal, "broker.announce");

        if (!allowed.yes) {
            socket.send(`error ${allowed.why}`);

            return;
        }

        if (listings.size >= limits.listings) {
            socket.send("error busy");

            return;
        }

        if (!listedBy.take(socket.address)) {
            socket.send("error too-many");

            return;
        }

        const token = newToken();
        const listing = { id: roomCode(new Set(listings.keys())), token: hashOf(token), said, host: socket, address: socket.address, from: socket.from, keptAt: 0, joiners: new Map(), expiry: null };

        listings.set(listing.id, listing);
        socket.hosting.set(listing.id, listing);
        keep(listing);
        socket.send(`announced ${listing.id} ${token}`);
        told(listing);
        policy.on("announced", { listing: listing.id, address: socket.address });
    };

    // A keep (from the host's link, or a new one taking it back); with what's changed
    const kept = (socket, id, token, rest) => {
        const listing = listings.get(String(id ?? "").toUpperCase());

        if (!listing || !sameHash(hashOf(String(token ?? "")), listing.token)) {
            socket.send("error gone");

            return;
        }

        keep(listing);

        // (What's changed: how many are in it, and whether it's listed)
        const changes = rest ? parse(rest) : null;
        const players = count(changes?.players, 64);
        const visibility = ["listed", "code"].includes(changes?.visibility) ? changes.visibility : listing.said.visibility;

        if ((players !== null && players !== listing.said.players) || visibility !== listing.said.visibility) {
            listing.said.players = Math.min(players ?? listing.said.players, listing.said.most);
            listing.said.visibility = visibility;
            told(listing);
        }

        if (listing.host !== socket) {
            const old = listing.host;

            old?.hosting.delete(listing.id);
            listing.host = socket;
            socket.hosting.set(listing.id, listing);
            socket.send(`announced ${listing.id} ${token}`);
            socket.send(["here", ...[...listing.joiners.entries()].filter(([, attempt]) => attempt.relayed).map(([peer]) => peer)].join(" "));

            for (const attempt of listing.joiners.values()) {
                attempt.socket.send("back");
            }
        }
    };

    const connect = (socket, id) => {
        const listing = listings.get(String(id ?? "").toUpperCase());
        const allowed = policy.allows(policy.identify({ address: socket.address, from: socket.from }).principal, "broker.connect");

        if (!allowed.yes) {
            socket.send(`error ${allowed.why}`);

            return;
        }

        const refusal = !listing ? "no-room" : listing.joiners.size >= limits.joiners || listing.said.players >= listing.said.most ? "full" : !listing.host ? "away" : null;

        if (refusal) {
            socket.send(`error ${refusal}`);

            return;
        }

        const peer = `p${next++}`;
        const attempt = { peer, listing, socket, signals: 0, relayed: false };

        attempts.set(peer, attempt);
        listing.joiners.set(peer, attempt);
        socket.attempt = attempt;
        joining(attempt);
        socket.send(`peer ${peer}`);
        listing.host.send(`peer ${peer} ${JSON.stringify({ near: near(listing, socket) })}`);
    };

    // A signal passed on (each attempt may pass limits.signals, and a link about 100 a minute)
    const signal = (attempt, toHost, rest) => {
        if (attempt.signals >= limits.signals || !signalling.allow(attempt)) {
            (toHost ? attempt.socket : attempt.listing.host)?.send(`error signals`);

            return;
        }

        attempt.signals++;
        (toHost ? attempt.listing.host : attempt.socket)?.send(`signal ${attempt.peer}\n${rest}`);
    };

    // Relaying asked for: both told, or the asker told it isn't done here
    const relay = (attempt, asker) => {
        if (!relaying()) {
            asker.send(`error relaying-off`);

            return;
        }

        attempt.relayed = true;
        attempt.socket.send(`relay ${attempt.peer}`);
        attempt.listing.host?.send(`relay ${attempt.peer}`);
    };

    // A bad message: struck against its address, and the link closed
    const bad = (socket) => {
        policy.on("refused", { why: "bad-request", address: socket.address });
        socket.close(1008);
    };

    // A joiner's link: signals and (relayed) what's said to the host
    const joining = (attempt) => {
        const { socket } = attempt;

        socket.onMessage = (text) => {
            const [line, rest] = split(text);
            const [what, peer] = line.split(" ");

            // (Said before relaying's agreed, or too fast: dropped)
            if (what === "data") {
                if (attempt.relayed && commands.allow(attempt)) {
                    attempt.listing.host?.send(`from ${attempt.peer}\n${rest}`);
                }
            } else if (what === "signal" && peer === attempt.peer && text.length <= limits.small) {
                signal(attempt, true, rest);
            } else if (what === "relay" && peer === attempt.peer) {
                relay(attempt, socket);
            } else if (what === "ping") {
                socket.send("pong");
            } else {
                bad(socket);
            }
        };
        socket.onClose = () => {
            closed(socket);

            if (attempts.get(attempt.peer) === attempt) {
                endAttempt(attempt.peer, { close: false });
            }
        };
    };

    // A host's link (and, before it's said what it's for, anyone's): announcing, keeping, relaying
    // to those joined through it, watching
    const hear = (socket, text) => {
        const [line, rest] = split(text);
        const [what, ...words] = line.split(" ");
        const listing = (id) => socket.hosting.get(String(id ?? "").toUpperCase()) ?? null;
        const ownAttempt = (peer) => {
            const attempt = attempts.get(peer);

            return attempt && socket.hosting.get(attempt.listing.id) === attempt.listing ? attempt : null;
        };

        if (what !== "to" && text.length > limits.small) {
            socket.close(1009);

            return;
        }

        socket.said = true;

        switch (what) {
            case "announce":
                announce(socket, rest);
                break;
            case "keep":
                kept(socket, words[0], words[1], rest);
                break;
            case "withdraw": {
                const mine = listing(words[0]);

                if (mine) {
                    withdraw(mine);
                }

                break;
            }
            case "watch":
                watchers.add(socket);
                seenList(socket);
                break;
            case "unwatch":
                watchers.delete(socket);
                break;
            case "connect":
                if (socket.hosting.size || watchers.has(socket)) {
                    bad(socket);
                } else {
                    connect(socket, words[0]);
                }

                break;
            case "to": {
                const attempt = ownAttempt(words[0]);

                if (attempt?.relayed) {
                    attempt.socket.send(`data\n${rest}`);
                }

                break;
            }
            case "kick": {
                const attempt = ownAttempt(words[0]);

                if (attempt) {
                    endAttempt(attempt.peer, { tellHost: true });
                }

                break;
            }
            case "signal": {
                const attempt = ownAttempt(words[0]);

                if (attempt) {
                    signal(attempt, false, rest);
                }

                break;
            }
            case "relay": {
                const attempt = ownAttempt(words[0]);

                if (attempt) {
                    relay(attempt, socket);
                }

                break;
            }
            case "ping":
                socket.send("pong");
                break;
            default:
                bad(socket);
        }
    };

    // A link closed: no longer watching; any listing it hosted kept till it expires (unless its
    // host said it was leaving), those relayed through it told it's away
    const closed = (socket) => {
        sockets.delete(socket);
        watchers.delete(socket);
        perAddress.give(socket.address);
        clearTimeout(socket.late);

        for (const listing of [...socket.hosting.values()]) {
            if (listing.host !== socket) {
                continue;
            }

            listing.host = null;

            if (socket.left) {
                withdraw(listing);
            } else {
                for (const attempt of listing.joiners.values()) {
                    attempt.socket.send("away");
                }
            }
        }

        socket.hosting.clear();
    };

    const welcome = (socket) => {
        socket.hosting = new Map();
        socket.listed = new Set();
        socket.said = false;
        socket.late = setTimeout(() => !socket.said && socket.close(1008), limits.sayWithin);
        socket.late.unref?.();
        socket.onMessage = (text) => hear(socket, text);
        socket.onClose = () => closed(socket);
        socket.send(`broker ${JSON.stringify({ ice, relaying: relaying() })}`);
    };

    const upgrade = (request, raw, head) => {
        // (The play socket's is play.js's)
        if (urlOf(request.url)?.pathname !== BROKER_PATH) {
            return;
        }

        const refuse = (status, why) => raw.end(`HTTP/1.1 ${status} ${why}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
        const key = request.headers["sec-websocket-key"];
        const protocols = String(request.headers["sec-websocket-protocol"] ?? "")
            .split(",")
            .map((one) => one.trim());
        let address;
        let from;
        let tunnel;

        if (server.settings.get("broker") === false) {
            refuse(403, "broker-off");

            return;
        }

        try {
            ({ address, from, tunnel } = guard(connectionOf(request), server));
        } catch (error) {
            if (error instanceof Refusal) {
                policy.on("refused", { why: error.error, address: request.socket.remoteAddress });
                refuse(error.status, error.error);

                return;
            }

            throw error;
        }

        if (String(request.headers.upgrade).toLowerCase() !== "websocket" || !key || !protocols.includes(BROKER_PROTOCOL)) {
            refuse(400, "Bad Request");

            return;
        }

        if (!perAddress.take(address)) {
            refuse(429, "Too Many");

            return;
        }

        const accept = createHash("sha1")
            .update(key + MAGIC)
            .digest("base64");

        raw.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, `Sec-WebSocket-Protocol: ${BROKER_PROTOCOL}`, "", ""].join("\r\n"));

        const socket = new Socket(raw, head, { limit: limits.message, backlog: limits.backlog });

        Object.assign(socket, { address, from, tunnel });
        sockets.add(socket);
        welcome(socket);
    };

    const listeners = [httpServers].flat();

    for (const listener of listeners) {
        listener.on("upgrade", upgrade);
    }

    // Each still there? (Those that don't answer for a while are let go)
    const pinging = setInterval(() => {
        const now = Date.now();

        for (const socket of sockets) {
            if (now - socket.heardAt > limits.timeout) {
                socket.close(1001);
            } else {
                socket.ping();
            }
        }
    }, limits.ping);

    pinging.unref?.();

    return {
        listings,

        /** The listings as one at `{ address, from }` sees them (the status card's `players`). */
        seen(watcher) {
            return [...listings.values()].map((listing) => seenBy(listing, watcher)).filter(Boolean);
        },

        /** Everyone watching sent the list again (after the relaying setting changes), and told whether it relays. */
        refresh() {
            for (const socket of sockets) {
                socket.send(`broker ${JSON.stringify({ ice, relaying: relaying() })}`);
            }

            for (const watcher of watchers) {
                seenList(watcher);
            }
        },

        /** Everyone in through `test` (a socket's { address, from, tunnel }) let go: the internet closed, say. */
        closeWhere(test) {
            for (const socket of [...sockets]) {
                if (test(socket)) {
                    socket.close(1001);
                }
            }
        },

        close() {
            clearInterval(pinging);

            for (const listener of listeners) {
                listener.off("upgrade", upgrade);
            }

            for (const listing of listings.values()) {
                clearTimeout(listing.expiry);
            }

            listings.clear();
            attempts.clear();

            for (const socket of sockets) {
                socket.close(1001);
            }
        },
    };
}

