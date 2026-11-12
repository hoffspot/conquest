// The relay (docs/WAR.md M11): how the games playing in one world talk to each other. A player
// who opens their world to others (its host: their game is its one authority) gets a room with a
// short code; anyone given the code joins it; the relay passes what each says to the other,
// untouched. It knows nothing of the game: the host's game says who's in the world, and what
// happens in it.
//
// It's a WebSocket endpoint on the game's own server (RELAY_PATH), written out here in full (RFC
// 6455: text messages, pings, closing), so the server needs nothing but Node.
//
// Each message is a line saying what it is, then what's carried, as it was sent:
//
//   host -> relay:   "host"                    open a room      -> "hosting CODE TOKEN"
//                    "rehost CODE TOKEN"       back on a new link (below) -> "hosting CODE TOKEN",
//                                              then "here PEER PEER..." (or "error gone")
//                    "to PEER\n..."            to one who's joined
//                    "all\n..."                to all who've joined
//                    "kick PEER"               put them out  -> "gone PEER"
//   peer -> relay:   "join CODE"               join a room      -> "joined PEER TOKEN" (or "error
//                                              no-room", "error full", "error away")
//                    "rejoin CODE PEER TOKEN"  back on a new link -> "joined PEER TOKEN" (or "error gone")
//                    "data\n..."               to the host
//   either:          "ping"                    still there?  -> "pong"
//   relay -> host:   "peer PEER"               someone's joined
//                    "from PEER\n..."          what they said
//                    "gone PEER"               they've left
//   relay -> peer:   "data\n..."               what the host said
//                    "away"                    the host's link has dropped (it has a while to come back)
//                    "back"                    it's back
//                    "closed"                  the host's gone (and so's the room)
//
// A link that drops (a phone moving from Wi-Fi to its mobile network, or losing its signal a
// moment) isn't a leaving: its place is kept for a while (RELAY_LIMITS.grace), and the host or
// peer can take it back on a new link with the token it was given. One that closes its link
// saying so has left (unless it says it's only reconnecting: RECONNECTING).

import crypto from "node:crypto";
import zlib from "node:zlib";

/** Where on the server the relay is. */
export const RELAY_PATH = "/relay";

/**
 * How much the relay carries: the longest message (bytes: a world's state is the biggest, 80 to
 * 300 KB as it's read, a sixth of that compressed, so this is plenty), how much can wait to go to one who's slow
 * to take it before they're let go (bytes), how many rooms at once, how many in each besides its
 * host; how often it checks each is still there, how long before one that doesn't answer is let
 * go, and how long the place of one whose link has dropped is kept for them (ms).
 */
export const RELAY_LIMITS = Object.freeze({ message: 4 * 1024 * 1024, backlog: 8 * 1024 * 1024, rooms: 500, peers: 15, ping: 20000, timeout: 60000, grace: 30000 });

/** The close code of a link given up on to come back on another: its place kept (not a leaving). */
export const RECONNECTING = 4000;

/** The letters a room's code is made of (no I or O, which look like 1 and 0). */
export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** How long a room's code is. */
export const CODE_LENGTH = 4;

// The WebSocket handshake's magic (RFC 6455 section 1.3)
const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/**
 * Messages compressed (permessage-deflate, RFC 7692), for a browser that offers it, which every
 * one does of itself: the game's code says and hears the same text either way. What's sent is
 * compressed only if it's longer than `over` bytes (a world, as a player comes in or is sent it
 * again: 80 to 300 KB of JSON, a sixth of that compressed, in a millisecond or two at
 * `level` 1; a step's worth of what's been done is 50 to 120 bytes and gains nothing), the last
 * long one kept (`keep` bytes and over) for the next socket sent the very same. What's heard is
 * whatever the browser chose, which is everything, 13 microseconds a message to read. Neither end
 * keeps anything from one message to the next (both `no_context_takeover`), so a socket costs no
 * memory for it between messages.
 */
export const DEFLATE = Object.freeze({ over: 1024, level: 1, keep: 16 * 1024 });

// What's taken off the end of a message compressed, and put back to read one (RFC 7692 section 7.2)
const TAIL = Buffer.from([0x00, 0x00, 0xff, 0xff]);

// The last long message compressed, for whoever's sent the same next (the world again to everyone)
const packedLast = { text: null, packed: null };

/**
 * Whether a WebSocket handshake offers compression this server takes (`headers`: the request's):
 * permessage-deflate, in any offer that doesn't ask the server for a smaller window than it uses.
 * And the header line that accepts it.
 */
export function deflateOffered(headers) {
    return String(headers?.["sec-websocket-extensions"] ?? "")
        .split(",")
        .map((offer) => offer.split(";").map((part) => part.trim().toLowerCase()))
        .some(([name, ...params]) => name === "permessage-deflate" && !params.some((param) => param.startsWith("server_max_window_bits")));
}

export const DEFLATE_ACCEPTED = "Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover";

const OPCODES = Object.freeze({ continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa });

// The first line of a message, and what's after it
function split(text) {
    const at = text.indexOf("\n");

    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
}

/**
 * One end of a WebSocket, on a socket that's been upgraded: messages in and out as text. Frames
 * it can't make sense of, or too long, close it.
 */
export class Socket {
    /**
     * @param {object} socket - The socket, upgraded (the handshake answered).
     * @param {Buffer} [head] - What came on it after the handshake.
     * @param {object} [options]
     * @param {number} [options.limit] - The longest message taken (bytes, as it's sent and as it
     *   reads once it's uncompressed).
     * @param {number} [options.backlog] - How much may wait to go before it's let go (bytes).
     * @param {boolean} [options.deflate] - Whether the handshake agreed to compressed messages
     *   (deflateOffered, DEFLATE_ACCEPTED).
     */
    constructor(socket, head = Buffer.alloc(0), { limit = RELAY_LIMITS.message, backlog = RELAY_LIMITS.backlog, deflate = false } = {}) {
        this.socket = socket;
        this.limit = limit;
        this.backlog = backlog;
        this.deflate = deflate;
        this.buffer = head;

        /** What it's sent: messages, their bytes as text, and as they went (compressed or not). */
        this.sent = { messages: 0, bytes: 0, wire: 0 };

        // What's come since, kept in pieces until there's enough of it for the frame being read
        // (`needed` bytes, with `buffer`): joined once, not again with every piece
        this.incoming = [];
        this.incomingLength = 0;
        this.needed = 0;
        this.parts = [];
        this.partsLength = 0;
        // (Whether the message being heard, in `parts`, is compressed: its first frame says)
        this.packed = false;
        this.open = true;
        this.heardAt = Date.now();

        /** Whether the far end closed it, saying it's leaving (not only reconnecting). */
        this.left = false;

        /** Hears each message (text), and when it's closed. */
        this.onMessage = () => {};
        this.onClose = () => {};

        socket.setNoDelay?.(true);
        socket.on("data", (data) => {
            this.incoming.push(data);
            this.incomingLength += data.length;

            if (this.buffer.length + this.incomingLength < this.needed) {
                return;
            }

            this.buffer = this.buffer.length || this.incoming.length > 1 ? Buffer.concat([this.buffer, ...this.incoming]) : data;
            this.incoming = [];
            this.incomingLength = 0;
            this.#read();
        });
        socket.on("close", () => this.#closed());
        socket.on("error", () => this.#closed());
        socket.on("end", () => this.#closed());

        if (head.length) {
            this.#read();
        }
    }

    /** Send a message (text). One too slow to take what's sent (too much waiting to go) is let go. */
    send(text) {
        if (!this.open) {
            return;
        }

        if (this.socket.writableLength > this.backlog) {
            this.close(1008);

            return;
        }

        const data = Buffer.from(text, "utf8");
        const packed = this.deflate && data.length > DEFLATE.over ? Socket.#pack(text, data) : null;

        this.sent.messages++;
        this.sent.bytes += data.length;
        this.sent.wire += (packed ?? data).length;
        this.#frame(OPCODES.text, packed ?? data, packed !== null);
    }

    // A message compressed as permessage-deflate has it: raw deflate, flushed, less its last four
    // bytes; or null if it came out no smaller. The last long one's kept: the world sent again to
    // everyone at once is compressed once
    static #pack(text, data) {
        if (data.length >= DEFLATE.keep && packedLast.text === text) {
            return packedLast.packed;
        }

        const out = zlib.deflateRawSync(data, { level: DEFLATE.level, finishFlush: zlib.constants.Z_SYNC_FLUSH });
        const packed = out.length > TAIL.length && out.subarray(-TAIL.length).equals(TAIL) && out.length - TAIL.length < data.length ? out.subarray(0, out.length - TAIL.length) : null;

        if (data.length >= DEFLATE.keep) {
            Object.assign(packedLast, { text, packed });
        }

        return packed;
    }

    /** Ask whether it's still there. */
    ping() {
        if (this.open) {
            this.#frame(OPCODES.ping, Buffer.alloc(0));
        }
    }

    /** Close it (saying why: a close code, 1000 all's well). */
    close(code = 1000) {
        if (!this.open) {
            return;
        }

        const payload = Buffer.alloc(2);

        payload.writeUInt16BE(code);
        this.#frame(OPCODES.close, payload);

        // (The closing frame, and anything before it, let go out before the socket's destroyed)
        this.socket.end();
        this.#closed({ now: false });
        setTimeout(() => this.socket.destroy(), 2000).unref?.();
    }

    #closed({ now = true } = {}) {
        if (this.open) {
            this.open = false;

            if (now) {
                this.socket.destroy();
            }

            this.onClose();
        }
    }

    // A frame out (the server's frames aren't masked), marked if its message is compressed
    #frame(opcode, payload, packed = false) {
        const length = payload.length;
        const header = length < 126 ? Buffer.alloc(2) : length < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);

        header[0] = 0x80 | (packed ? 0x40 : 0) | opcode;

        if (length < 126) {
            header[1] = length;
        } else if (length < 65536) {
            header[1] = 126;
            header.writeUInt16BE(length, 2);
        } else {
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(length), 2);
        }

        this.socket.write(Buffer.concat([header, payload]));
    }

    // The frames in what's come so far (a client's are always masked)
    #read() {
        this.needed = 0;

        while (this.open && this.buffer.length >= 2) {
            const first = this.buffer[0];
            const second = this.buffer[1];
            const fin = (first & 0x80) !== 0;
            const opcode = first & 0x0f;
            const masked = (second & 0x80) !== 0;

            // (A frame marked compressed where that wasn't agreed, or that isn't a message's first;
            // or marked with what means nothing here: not made sense of)
            if ((first & 0x30) !== 0 || ((first & 0x40) !== 0 && (!this.deflate || opcode !== OPCODES.text))) {
                this.close(1002);

                return;
            }
            let length = second & 0x7f;
            let offset = 2;

            if (length === 126) {
                if (this.buffer.length < 4) {
                    return;
                }

                length = this.buffer.readUInt16BE(2);
                offset = 4;
            } else if (length === 127) {
                if (this.buffer.length < 10) {
                    return;
                }

                const long = this.buffer.readBigUInt64BE(2);

                if (long > BigInt(this.limit)) {
                    this.close(1009);

                    return;
                }

                length = Number(long);
                offset = 10;
            }

            if (!masked || length > this.limit || this.partsLength + length > this.limit) {
                this.close(masked ? 1009 : 1002);

                return;
            }

            if (this.buffer.length < offset + 4 + length) {
                this.needed = offset + 4 + length;

                return;
            }

            const mask = this.buffer.subarray(offset, offset + 4);
            const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));

            for (let k = 0; k < payload.length; k++) {
                payload[k] ^= mask[k & 3];
            }

            this.buffer = this.buffer.subarray(offset + 4 + length);
            this.heardAt = Date.now();
            this.#hear(opcode, fin, payload, (first & 0x40) !== 0);
        }
    }

    #hear(opcode, fin, payload, packed = false) {
        switch (opcode) {
            case OPCODES.text:
            case OPCODES.continuation:
                if (opcode === OPCODES.text && this.parts.length) {
                    this.close(1002);

                    return;
                }

                if (opcode === OPCODES.text) {
                    this.packed = packed;
                }

                this.parts.push(payload);
                this.partsLength += payload.length;

                if (fin) {
                    let whole = Buffer.concat(this.parts);

                    this.parts = [];
                    this.partsLength = 0;

                    // (Compressed: read back, to no more than the longest message taken, whatever
                    // it says it holds; one that won't read, or is longer, closes it)
                    if (this.packed) {
                        try {
                            whole = zlib.inflateRawSync(Buffer.concat([whole, TAIL]), { finishFlush: zlib.constants.Z_SYNC_FLUSH, maxOutputLength: this.limit });
                        } catch (error) {
                            this.close(error?.code === "ERR_BUFFER_TOO_LARGE" ? 1009 : 1007);

                            return;
                        }
                    }

                    this.onMessage(whole.toString("utf8"));
                }

                break;
            case OPCODES.ping:
                this.#frame(OPCODES.pong, payload);
                break;
            case OPCODES.pong:
                break;
            case OPCODES.close: {
                // (Closed saying why: left, unless it's only coming back on another link; the code
                // said back, as RFC 6455 section 5.5.1 has it, where it's one that can be)
                const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;

                this.left = code !== RECONNECTING;
                this.close(code === 1000 || code === 1001 || (code >= 3000 && code <= 4999) ? code : 1000);
                break;
            }
            default:
                // (Binary: not spoken here)
                this.close(1003);
        }
    }
}

/** A new place's token, for taking it back on a new link: 72 random bits. */
function token() {
    return crypto.randomBytes(9).toString("base64url");
}

// Whether a token given is the one kept (in the same time, whatever's given)
function same(given, kept) {
    const a = Buffer.from(String(given ?? ""));
    const b = Buffer.from(kept);

    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A new room's code: CODE_LENGTH letters, none of the codes in `taken`. */
export function roomCode(taken, random = (n) => crypto.randomInt(n)) {
    for (;;) {
        const code = Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[random(CODE_LETTERS.length)]).join("");

        if (!taken.has(code)) {
            return code;
        }
    }
}

/**
 * Put the relay on an HTTP server (at `path`). Returns { rooms (by code: { code, host (its socket),
 * token, away (while its link's dropped), peers (by name: { socket, token, away }), next }),
 * close() }.
 */
export function attachRelay(httpServer, { path = RELAY_PATH, limits = RELAY_LIMITS } = {}) {
    const rooms = new Map();
    const sockets = new Set();
    const grace = limits.grace ?? RELAY_LIMITS.grace;

    // Someone new: what they say first says who they are (a host, or joining a room; or either,
    // back on a new link)
    const welcome = (socket) => {
        socket.onMessage = (text) => {
            const [line] = split(text);
            const [what, code, ...rest] = line.split(" ");
            const room = rooms.get(String(code ?? "").toUpperCase());

            if (what === "host") {
                if (rooms.size >= limits.rooms) {
                    socket.send("error busy");
                    socket.close();

                    return;
                }

                const made = { code: roomCode(new Set(rooms.keys())), host: socket, token: token(), away: null, peers: new Map(), next: 1 };

                rooms.set(made.code, made);
                hosting(made);
                socket.send(`hosting ${made.code} ${made.token}`);
            } else if (what === "rehost") {
                if (!room || !same(rest[0], room.token)) {
                    socket.send("error gone");
                    socket.close();

                    return;
                }

                rehosting(room, socket);
            } else if (what === "join") {
                const refusal = !room ? "no-room" : room.peers.size >= limits.peers ? "full" : room.away ? "away" : null;

                if (refusal) {
                    socket.send(`error ${refusal}`);
                    socket.close();

                    return;
                }

                const peer = `p${room.next++}`;
                const place = { socket, token: token(), away: null };

                room.peers.set(peer, place);
                joined(room, peer, place);
                socket.send(`joined ${peer} ${place.token}`);
                room.host.send(`peer ${peer}`);
            } else if (what === "rejoin") {
                const [peer, given] = rest;
                const place = room?.peers.get(peer);

                if (!place || !same(given, place.token)) {
                    socket.send("error gone");
                    socket.close();

                    return;
                }

                rejoined(room, peer, place, socket);
            } else {
                socket.close(1008);
            }
        };
    };

    // A socket given up on for another: let go, and not heard of again
    const replaced = (socket) => {
        socket.onMessage = () => {};
        socket.onClose = () => sockets.delete(socket);
        socket.close(RECONNECTING);
    };

    // A room gone (its host left, or didn't come back in time): everyone in it told
    const closeRoom = (room) => {
        clearTimeout(room.away);
        rooms.delete(room.code);

        for (const place of room.peers.values()) {
            clearTimeout(place.away);
            place.socket.send("closed");
            place.socket.close();
        }

        room.peers.clear();
    };

    // One who's joined out of the room: the host's told
    const leave = (room, peer) => {
        const place = room.peers.get(peer);

        if (place) {
            clearTimeout(place.away);
            room.peers.delete(peer);
            room.host.send(`gone ${peer}`);
        }
    };

    // A room's host: what they say goes to one who's joined, or all of them; left, so's the room;
    // their link dropped, it's kept a while for them to come back to
    const hosting = (room) => {
        const { host } = room;

        host.onMessage = (text) => {
            const [line, rest] = split(text);
            const [what, peer] = line.split(" ");

            if (what === "to") {
                room.peers.get(peer)?.socket.send(`data\n${rest}`);
            } else if (what === "all") {
                for (const { socket } of room.peers.values()) {
                    socket.send(`data\n${rest}`);
                }
            } else if (what === "kick") {
                const place = room.peers.get(peer);

                leave(room, peer);
                place?.socket.close();
            } else if (what === "ping") {
                host.send("pong");
            }
        };
        host.onClose = () => {
            sockets.delete(host);

            if (room.host !== host || rooms.get(room.code) !== room) {
                return;
            }

            if (host.left) {
                closeRoom(room);

                return;
            }

            room.away = setTimeout(() => closeRoom(room), grace);
            room.away.unref?.();

            for (const { socket } of room.peers.values()) {
                socket.send("away");
            }
        };
    };

    // A host back on a new link: the room theirs again, told who's still in it; those in it told
    const rehosting = (room, socket) => {
        const old = room.host;

        clearTimeout(room.away);
        room.away = null;
        room.host = socket;

        if (old !== socket) {
            replaced(old);
        }

        hosting(room);
        socket.send(`hosting ${room.code} ${room.token}`);
        socket.send(["here", ...room.peers.keys()].join(" "));

        for (const place of room.peers.values()) {
            place.socket.send("back");
        }
    };

    // One who's joined a room: what they say goes to its host; left, the host's told; their link
    // dropped, their place is kept a while for them to come back to
    const joined = (room, peer, place) => {
        const { socket } = place;

        socket.onMessage = (text) => {
            const [line, rest] = split(text);

            if (line === "data") {
                room.host.send(`from ${peer}\n${rest}`);
            } else if (line === "ping") {
                socket.send("pong");
            }
        };
        socket.onClose = () => {
            sockets.delete(socket);

            if (room.peers.get(peer) !== place || place.socket !== socket) {
                return;
            }

            if (socket.left) {
                leave(room, peer);

                return;
            }

            place.away = setTimeout(() => leave(room, peer), grace);
            place.away.unref?.();
        };
    };

    // One who'd joined, back on a new link: their place theirs again (and told if the host's away)
    const rejoined = (room, peer, place, socket) => {
        const old = place.socket;

        clearTimeout(place.away);
        place.away = null;
        place.socket = socket;

        if (old !== socket) {
            replaced(old);
        }

        joined(room, peer, place);
        socket.send(`joined ${peer} ${place.token}`);

        if (room.away) {
            socket.send("away");
        }
    };

    const upgrade = (request, socket, head) => {
        const key = request.headers["sec-websocket-key"];

        // (An address that isn't one, `GET http://[` say, refused like any other: not thrown, which would end the server)
        if (!URL.canParse(request.url, "http://relay") || new URL(request.url, "http://relay").pathname !== path || String(request.headers.upgrade).toLowerCase() !== "websocket" || !key) {
            socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");

            return;
        }

        const accept = crypto.createHash("sha1").update(key + MAGIC).digest("base64");

        const deflate = deflateOffered(request.headers);

        socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, ...(deflate ? [DEFLATE_ACCEPTED] : []), "", ""].join("\r\n"));

        const one = new Socket(socket, head, { limit: limits.message, backlog: limits.backlog ?? RELAY_LIMITS.backlog, deflate });

        sockets.add(one);
        one.onClose = () => sockets.delete(one);
        welcome(one);
    };

    httpServer.on("upgrade", upgrade);

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
        rooms,
        close() {
            clearInterval(pinging);
            httpServer.off("upgrade", upgrade);

            for (const room of rooms.values()) {
                clearTimeout(room.away);

                for (const place of room.peers.values()) {
                    clearTimeout(place.away);
                }
            }

            for (const socket of sockets) {
                socket.close(1001);
            }
        },
    };
}
