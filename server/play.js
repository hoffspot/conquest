// The world server's play socket (generated/world_server_plan.md §12.2): a WebSocket at PLAY_PATH,
// subprotocol PLAY_PROTOCOL, framed as the relay's are (relay.js Socket: a first line, then what's
// carried), so a game's link to it works as its link to the relay does (heartbeat, backoff, grace).
//
//   game -> server   "hi NONCE"                  prove who you are  -> "hi ID PUBLIC-KEY SIGNATURE"
//                    "enter WORLD SESSION"       into a world (a session from /api/v1/enter)
//                                                -> "waiting N" while it waits its turn (N: its place),
//                                                   then "entered PEER TOKEN"; or "closed REASON"
//                    "reenter WORLD PEER TOKEN"  back on a new link  -> "entered PEER TOKEN" (or "closed gone")
//                    "data\n..."                 to the world (core/netplay.js: hello, command...)
//                    "ping"                      still there?  -> "pong"
//   server -> game   "data\n..."                 from the world (welcome, ops, state, paused...)
//                    "closed REASON"             out, and why: kicked, afk, elsewhere (their character
//                                                taken over on another device), banned, key-revoked,
//                                                world-deleted, server-stopping, or a refusal
//
// A socket that hasn't entered a world within PLAY_LIMITS.enterWithin is closed. One whose link
// drops (without saying it's leaving, or found dead: silent for PLAY_LIMITS.timeout) keeps its place
// for PLAY_LIMITS.grace, five minutes, its player not present meanwhile (world-worker.js), and can
// take it back with the token it was given; not back by then, it's let go of, its player out of the
// world. Their player coming in again meanwhile, on another device or after a crash, takes their
// character over (core/netplay.js Hosting #takeOver): the place kept for the old link let go.

import { nannyFor, nannySettings } from "./access/nanny.js";
import { createHash } from "node:crypto";
import { connectionOf, guard, Refusal, urlOf } from "./guards.js";
import { Counts, LIMITS, Rate } from "./access/limits.js";
import { hashOf, newToken, sameHash } from "./access/tokens.js";
import { DEFLATE_ACCEPTED, deflateOffered, RECONNECTING, Socket } from "./relay.js";

/** Where on the server the play socket is, and the subprotocol it speaks. */
export const PLAY_PATH = "/play";
export const PLAY_PROTOCOL = "pellagos.play.1";

/**
 * The play socket that speaks bytes as well (generated/multiplayer_scaling_plan.md 3-12): all of
 * PLAY_PROTOCOL's, and messages of bytes either way (relay.js sendBinary, onBinary), for the
 * frames a replicated world will send. A game that offers it is answered with it; one that
 * offers only PLAY_PROTOCOL plays as ever. Till there are frames, the one message of bytes
 * spoken is the tests' echo: one whose first byte is BINARY.echo comes back as it was sent.
 * A view's frame begins with its VIEW_VERSION (client/js/core/view.js), which is never 0.
 */
export const PLAY_BINARY = "pellagos.play.2";
export const BINARY = Object.freeze({ echo: 0 });

/**
 * Its limits: the longest message from a game (bytes: a world's snapshots only ever go the other
 * way; a character coming in is the longest, as a host takes it: core/netplay.js HEARD), how much may wait to go to one slow to take it, how long to enter a world, how long a
 * dropped link's place is kept, and how often each's asked whether it's still there (and let go
 * if it doesn't answer for `timeout`); `frames`: how much may wait unwritten for a game sent a
 * world's frames before it's let go (bytes: such a game is held back for long before, core/
 * viewfeed.js LAG); all ms but `message`, `backlog` and `frames`.
 */
export const PLAY_LIMITS = Object.freeze({ message: 256 * 1024, backlog: 8 * 1024 * 1024, frames: 256 * 1024, enterWithin: 10000, grace: 300000, ping: 20000, timeout: 60000 });

// The WebSocket handshake's magic (RFC 6455 section 1.3)
const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// The first line of a message, and what's after it
function split(text) {
    const at = text.indexOf("\n");

    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
}

/**
 * The play socket on HTTP servers (`httpServers`: one, or several, as the one port's plain and TLS
 * halves). `server` gives what it needs: { access, registry, identity, and what guards.js asks,
 * metaOf(world) (its world.json, or null) }. `others`: the paths other sockets on the same servers
 * answer (the broker's), left to them. Returns { places, close(), closeWhere(test, reason),
 * send(world, peer, text), kicked(world, peer, reason) }, and what it counts for the server's
 * metrics (server-metrics.js reads them when it's asked): `sockets` (those open), `closed` (how
 * many it's sent out or refused, by why) and `traffic` (by world: { messages, bytes, wire } sent
 * to its players' games, as each socket counts them, and `received`, bytes heard from them).
 */
export function attachPlay(httpServers, server, { limits = PLAY_LIMITS, clock = Date.now, others = [] } = {}) {
    const { registry, identity } = server;
    const { policy } = server.access;

    /** Those in a world, by `${world} ${peer}`: { world, peer, player, role, via, socket, token, address, from ("home" or "internet"), away }. */
    const places = new Map();
    const sockets = new Set();
    // (A server opened with limits of its own in place of these, world-server.js: only a soak's is)
    const perAddress = new Counts(server.limits?.socketsPerAddress ?? LIMITS.socketsPerAddress);
    const perTicket = new Counts(LIMITS.socketsPerTicket);
    const rate = new Rate(LIMITS.commands, { clock });
    const closed = new Map();
    const traffic = new Map();
    let next = 1;

    const placeKey = (world, peer) => `${world} ${peer}`;

    // A world's traffic so far (made at nothing, the first time)
    const trafficOf = (world) => {
        let counted = traffic.get(world);

        if (!counted) {
            counted = { messages: 0, bytes: 0, wire: 0, received: 0 };
            traffic.set(world, counted);
        }

        return counted;
    };

    // Out of the world for good: the world told, the place let go
    const leave = (place) => {
        clearTimeout(place.away);

        if (places.get(placeKey(place.world, place.peer)) !== place) {
            return;
        }

        places.delete(placeKey(place.world, place.peer));
        perTicket.give(`${place.world} ${place.player}`);
        rate.forget(place);
        registry.entries.get(place.world)?.thread?.leave(place.peer);
        policy.on("left", { world: place.world, player: place.player });
    };

    // Sent out (or refused), saying why
    const shut = (socket, reason) => {
        closed.set(reason, (closed.get(reason) ?? 0) + 1);
        socket.send(`closed ${reason}`);
        socket.close(1000);
    };

    // A place's socket: what it says goes to the world; dropped, its place kept a while
    const playing = (place) => {
        const { socket } = place;
        const thread = registry.entries.get(place.world)?.thread;
        const counted = trafficOf(place.world);

        socket.onMessage = (text) => {
            const [line, rest] = split(text);

            if (line === "data") {
                counted.received += Buffer.byteLength(text);

                if (rate.allow(place)) {
                    thread?.data(place.peer, rest);
                }
            } else if (line === "ping") {
                socket.send("pong");
            } else {
                policy.on("refused", { why: "bad-request", address: place.address });
                socket.close(1008);
            }
        };
        // (Bytes, where they're spoken: the tests' echo, and nothing else yet)
        socket.onBinary = (bytes) => {
            counted.received += bytes.length;

            if (bytes[0] !== BINARY.echo) {
                policy.on("refused", { why: "bad-request", address: place.address });
                socket.close(1008);
            } else if (rate.allow(place)) {
                socket.sendBinary(bytes);
            }
        };
        socket.onClose = () => {
            sockets.delete(socket);
            perAddress.give(place.address);

            if (places.get(placeKey(place.world, place.peer)) !== place || place.socket !== socket) {
                return;
            }

            if (socket.left) {
                leave(place);

                return;
            }

            thread?.drop(place.peer);
            place.away = setTimeout(() => leave(place), limits.grace);
            place.away.unref?.();
        };
    };

    // Into a world, by a session: let in (waiting its turn if it must), given a place
    // Whether one coming into a world from a country's kept to the quick chat's phrases (access/nanny.js)
    // (and why, as they're told in the chat panel: { why, code, threshold })
    const nannyOf = (world, country) => {
        const { on, why, code, threshold } = nannyFor({ country, record: null, world: { public: server.metaOf(world)?.settings?.public === true }, settings: nannySettings(server.settings), now: clock() });

        return { on, why: on ? { why, code, threshold } : null };
    };

    // Which country a connection's from: null where it can't be told (no file, a stale one, an
    // address in no country's range, the server's own network)
    const countryOf = (socket, address) => socket?.country ?? server.countries?.country(address) ?? null;

    const enter = async (socket, address, world, session) => {
        const { principal } = policy.identify({ world, session, address, from: socket.from });
        const allowed = policy.allows(principal, "world.enter", { world, meta: server.metaOf(world) });

        if (!allowed.yes) {
            policy.on("refused", { why: allowed.why, world, address });
            shut(socket, allowed.why);

            return;
        }

        if (!perTicket.take(`${world} ${principal.player.id}`)) {
            shut(socket, "too-many");

            return;
        }

        // (As many in all its worlds as its setting says, playersAtOnce: LIMITS.players at the most)
        if (places.size >= (server.playersAtOnce ?? server.limits?.players ?? LIMITS.players)) {
            perTicket.give(`${world} ${principal.player.id}`);
            shut(socket, "full");

            return;
        }

        let thread;

        try {
            thread = await registry.enter(world, { onWaiting: (at) => socket.send(`waiting ${at}`) });
        } catch (error) {
            perTicket.give(`${world} ${principal.player.id}`);
            shut(socket, error.name === "NewerDataError" ? "newer" : "broken");

            return;
        }

        if (!socket.open) {
            perTicket.give(`${world} ${principal.player.id}`);

            return;
        }

        const peer = `p${next++}`;
        const token = newToken();
        // (Kept to the quick chat's phrases, by where they connect from: access/nanny.js. Their
        // country by the server's country file, net/geoip.js; a front's own word for it is
        // 6B-20, and no record's kept of them yet, 6B-1)
        const country = countryOf(socket, address);
        const kept = nannyOf(world, country);
        const place = { world, peer, country, nanny: kept.on, nannyWhy: kept.why, player: principal.player.id, role: principal.role, via: principal.via, socket, token: hashOf(token), address, from: socket.from, tunnel: socket.tunnel, away: null };

        places.set(placeKey(world, peer), place);
        thread.enter(peer, { player: place.player, role: place.role, nanny: place.nanny, why: place.nannyWhy });
        playing(place);
        socket.send(`entered ${peer} ${token}`);
    };

    // Back on a new link: the place theirs again
    const reenter = (socket, address, world, peer, token) => {
        const place = places.get(placeKey(world, peer));

        if (!place || !sameHash(hashOf(String(token)), place.token)) {
            policy.on("refused", { why: "gone", world, address });
            shut(socket, "gone");

            return;
        }

        const old = place.socket;

        clearTimeout(place.away);
        place.away = null;
        place.socket = socket;
        place.address = address;
        place.from = socket.from;
        place.tunnel = socket.tunnel;

        if (old !== socket && old.open) {
            old.onMessage = () => {};
            old.onClose = () => {
                sockets.delete(old);
                perAddress.give(old.address);
            };
            old.close(RECONNECTING);
        }

        playing(place);
        registry.entries.get(world)?.thread?.back(peer);
        socket.send(`entered ${peer} ${token}`);
    };

    // Someone new: proving the server, then into a world (or back into one)
    const welcome = (socket, address) => {
        const late = setTimeout(() => socket.close(1008), limits.enterWithin);

        late.unref?.();
        socket.onMessage = (text) => {
            const [line] = split(text);
            const [what, ...rest] = line.split(" ");

            if (what === "hi") {
                const proof = identity.answer(rest[0]);

                if (proof) {
                    socket.send(`hi ${proof.id} ${proof.publicKey} ${proof.signature}`);
                } else {
                    socket.close(1008);
                }
            } else if (what === "enter" && rest.length === 2) {
                clearTimeout(late);
                socket.onMessage = () => {};
                enter(socket, address, rest[0], rest[1]);
            } else if (what === "reenter" && rest.length === 3) {
                clearTimeout(late);
                reenter(socket, address, ...rest);
            } else if (what === "ping") {
                socket.send("pong");
            } else {
                policy.on("refused", { why: "bad-request", address });
                socket.close(1008);
            }
        };
        socket.onClose = () => {
            clearTimeout(late);
            sockets.delete(socket);
            perAddress.give(address);
        };
    };

    const upgrade = (request, raw, head) => {
        const refuse = (status, why) => raw.end(`HTTP/1.1 ${status} ${why}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);

        // (Nothing but the play socket and `others` take an upgrade: any other's refused, not left hanging)
        const path = urlOf(request.url)?.pathname;

        if (path !== PLAY_PATH) {
            if (!others.includes(path)) {
                refuse(404, "Not Found");
            }

            return;
        }

        const key = request.headers["sec-websocket-key"];
        const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((one) => one.trim());
        let address;
        let from;
        let tunnel;

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

        if (String(request.headers.upgrade).toLowerCase() !== "websocket" || !key || !(protocols.includes(PLAY_PROTOCOL) || protocols.includes(PLAY_BINARY))) {
            refuse(400, "Bad Request");

            return;
        }

        if (!perAddress.take(address)) {
            refuse(429, "Too Many");

            return;
        }

        const accept = createHash("sha1").update(key + MAGIC).digest("base64");
        // (Bytes too, for a game that offers them: PLAY_BINARY)
        const spoken = protocols.includes(PLAY_BINARY) ? PLAY_BINARY : PLAY_PROTOCOL;

        // (Compressed, for a browser that offers it, unless the server's set not to: the world as a
        // player comes in is a sixth the size: server/relay.js DEFLATE)
        const deflate = server.settings?.get("compress") !== false && deflateOffered(request.headers);

        raw.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, `Sec-WebSocket-Protocol: ${spoken}`, ...(deflate ? [DEFLATE_ACCEPTED] : []), "", ""].join("\r\n"));

        const socket = new Socket(raw, head, { limit: limits.message, backlog: limits.backlog, deflate, binary: spoken === PLAY_BINARY });

        socket.address = address;
        socket.from = from;
        socket.tunnel = tunnel;
        sockets.add(socket);
        welcome(socket, address);
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
        places,
        /** Who's kept to the quick chat's phrases worked out again (the server's settings changed, or a world's): each world told of whoever's changed. */
        renanny() {
            for (const place of places.values()) {
                // (Their country looked up again: the country file may have been read since)
                place.country = countryOf(place.socket, place.address);

                const { on, why } = nannyOf(place.world, place.country);

                if (on !== place.nanny || JSON.stringify(why) !== JSON.stringify(place.nannyWhy)) {
                    place.nanny = on;
                    place.nannyWhy = why;
                    registry.entries.get(place.world)?.thread?.nanny(place.peer, on, why);
                }
            }
        },
        sockets,
        closed,
        traffic,

        /** What a world sends a player's game (its place's socket, if it's linked), counted as its socket counts it. */
        send(world, peer, text) {
            const socket = places.get(placeKey(world, peer))?.socket;

            if (!socket) {
                return;
            }

            const { sent } = socket;
            const { messages, bytes, wire } = sent;

            socket.send(`data\n${text}`);

            const counted = trafficOf(world);

            counted.messages += sent.messages - messages;
            counted.bytes += sent.bytes - bytes;
            counted.wire += sent.wire - wire;
        },

        /** Bytes a world sends a player's game (a frame: PLAY_BINARY), if its socket's linked and speaks them; counted as send's are. */
        sendBinary(world, peer, bytes) {
            const socket = places.get(placeKey(world, peer))?.socket;

            if (!socket?.binary) {
                return;
            }

            // (What waits unwritten from before this, looked at before more's put with it: what
            // was sent a step ago should have gone. Some waiting, the world's told, to send
            // this game nothing till it's gone (core/viewfeed.js LAG; the scaling plan's 3-27),
            // and told again once it has; too much, and the game's let go: it would be shown
            // a world long past)
            const waiting = socket.waiting;

            if (waiting > limits.frames) {
                socket.close(1008);

                return;
            }

            if (waiting > 0 && !socket.backed) {
                const tell = (count) => registry.entries.get(world)?.thread?.waiting?.(peer, count);

                socket.backed = true;
                socket.onDrain = () => {
                    socket.backed = false;
                    socket.onDrain = null;
                    tell(0);
                };
                tell(waiting);
            }

            const { sent } = socket;
            const { messages, bytes: had, wire } = sent;

            socket.sendBinary(bytes);

            const counted = trafficOf(world);

            counted.messages += sent.messages - messages;
            counted.bytes += sent.bytes - had;
            counted.wire += sent.wire - wire;
        },

        /** A player a world's sent out (afk): their socket closed, saying why. */
        kicked(world, peer, reason) {
            const place = places.get(placeKey(world, peer));

            if (place) {
                leave(place);
                shut(place.socket, reason);
            }
        },

        /** Everyone whose place passes `test` sent out, saying why (`reason`: key-revoked, banned, world-deleted...). Returns how many. */
        closeWhere(test, reason) {
            let count = 0;

            for (const place of [...places.values()]) {
                if (test(place)) {
                    leave(place);
                    shut(place.socket, reason);
                    count++;
                }
            }

            return count;
        },

        close(reason = "server-stopping") {
            clearInterval(pinging);
            for (const listener of listeners) {
                listener.off("upgrade", upgrade);
            }

            for (const place of [...places.values()]) {
                clearTimeout(place.away);
                shut(place.socket, reason);
            }

            places.clear();

            for (const socket of sockets) {
                socket.close(1001);
            }
        },
    };
}
