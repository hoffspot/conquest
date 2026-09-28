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
//   host -> relay:   "host"                    open a room      -> "hosting CODE"
//                    "to PEER\n..."            to one who's joined
//                    "all\n..."                to all who've joined
//                    "kick PEER"               put them out
//   peer -> relay:   "join CODE"               join a room      -> "joined PEER" (or "error no-room")
//                    "data\n..."               to the host
//   relay -> host:   "peer PEER"               someone's joined
//                    "from PEER\n..."          what they said
//                    "gone PEER"               they've left
//   relay -> peer:   "data\n..."               what the host said
//                    "closed"                  the host's gone (and so's the room)

import crypto from "node:crypto";

/** Where on the server the relay is. */
export const RELAY_PATH = "/relay";

/**
 * How much the relay carries: the longest message (bytes: a world's state is the biggest), how
 * many rooms at once, how many in each besides its host; how often it checks each is still there,
 * and how long before one that doesn't answer is let go (ms).
 */
export const RELAY_LIMITS = Object.freeze({ message: 32 * 1024 * 1024, rooms: 500, peers: 15, ping: 20000, timeout: 60000 });

/** The letters a room's code is made of (no I or O, which look like 1 and 0). */
export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** How long a room's code is. */
export const CODE_LENGTH = 4;

// The WebSocket handshake's magic (RFC 6455 section 1.3)
const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

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
    constructor(socket, head = Buffer.alloc(0), { limit = RELAY_LIMITS.message } = {}) {
        this.socket = socket;
        this.limit = limit;
        this.buffer = head;
        this.parts = [];
        this.partsLength = 0;
        this.open = true;
        this.heardAt = Date.now();

        /** Hears each message (text), and when it's closed. */
        this.onMessage = () => {};
        this.onClose = () => {};

        socket.setNoDelay?.(true);
        socket.on("data", (data) => {
            this.buffer = this.buffer.length ? Buffer.concat([this.buffer, data]) : data;
            this.#read();
        });
        socket.on("close", () => this.#closed());
        socket.on("error", () => this.#closed());
        socket.on("end", () => this.#closed());

        if (head.length) {
            this.#read();
        }
    }

    /** Send a message (text). */
    send(text) {
        if (this.open) {
            this.#frame(OPCODES.text, Buffer.from(text, "utf8"));
        }
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
        this.socket.end();
        this.#closed();
    }

    #closed() {
        if (this.open) {
            this.open = false;
            this.socket.destroy();
            this.onClose();
        }
    }

    // A frame out (the server's frames aren't masked)
    #frame(opcode, payload) {
        const length = payload.length;
        const header = length < 126 ? Buffer.alloc(2) : length < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);

        header[0] = 0x80 | opcode;

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
        while (this.open && this.buffer.length >= 2) {
            const first = this.buffer[0];
            const second = this.buffer[1];
            const fin = (first & 0x80) !== 0;
            const opcode = first & 0x0f;
            const masked = (second & 0x80) !== 0;
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
                return;
            }

            const mask = this.buffer.subarray(offset, offset + 4);
            const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length));

            for (let k = 0; k < payload.length; k++) {
                payload[k] ^= mask[k & 3];
            }

            this.buffer = this.buffer.subarray(offset + 4 + length);
            this.heardAt = Date.now();
            this.#hear(opcode, fin, payload);
        }
    }

    #hear(opcode, fin, payload) {
        switch (opcode) {
            case OPCODES.text:
            case OPCODES.continuation:
                if (opcode === OPCODES.text && this.parts.length) {
                    this.close(1002);

                    return;
                }

                this.parts.push(payload);
                this.partsLength += payload.length;

                if (fin) {
                    const text = Buffer.concat(this.parts).toString("utf8");

                    this.parts = [];
                    this.partsLength = 0;
                    this.onMessage(text);
                }

                break;
            case OPCODES.ping:
                this.#frame(OPCODES.pong, payload);
                break;
            case OPCODES.pong:
                break;
            case OPCODES.close:
                this.close(1000);
                break;
            default:
                // (Binary: not spoken here)
                this.close(1003);
        }
    }
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
 * Put the relay on an HTTP server (at `path`). Returns { rooms (by code: { host, peers (by id),
 * next }), close() }.
 */
export function attachRelay(httpServer, { path = RELAY_PATH, limits = RELAY_LIMITS } = {}) {
    const rooms = new Map();
    const sockets = new Set();

    // Someone new: what they say first says who they are (a host, or joining a room)
    const welcome = (socket) => {
        socket.onMessage = (text) => {
            const [line] = split(text);
            const [what, code] = line.split(" ");

            if (what === "host") {
                if (rooms.size >= limits.rooms) {
                    socket.send("error busy");
                    socket.close();

                    return;
                }

                const room = { code: roomCode(new Set(rooms.keys())), host: socket, peers: new Map(), next: 1 };

                rooms.set(room.code, room);
                hosting(room);
                socket.send(`hosting ${room.code}`);
            } else if (what === "join") {
                const room = rooms.get(String(code ?? "").toUpperCase());

                if (!room) {
                    socket.send("error no-room");
                    socket.close();

                    return;
                }

                if (room.peers.size >= limits.peers) {
                    socket.send("error full");
                    socket.close();

                    return;
                }

                const peer = `p${room.next++}`;

                room.peers.set(peer, socket);
                joined(room, peer, socket);
                socket.send(`joined ${peer}`);
                room.host.send(`peer ${peer}`);
            } else {
                socket.close(1008);
            }
        };
    };

    // A room's host: what they say goes to one who's joined, or all of them; gone, so's the room
    const hosting = (room) => {
        const { host } = room;

        host.onMessage = (text) => {
            const [line, rest] = split(text);
            const [what, peer] = line.split(" ");

            if (what === "to") {
                room.peers.get(peer)?.send(`data\n${rest}`);
            } else if (what === "all") {
                for (const socket of room.peers.values()) {
                    socket.send(`data\n${rest}`);
                }
            } else if (what === "kick") {
                room.peers.get(peer)?.close();
            }
        };
        host.onClose = () => {
            sockets.delete(host);
            rooms.delete(room.code);

            for (const socket of room.peers.values()) {
                socket.send("closed");
                socket.close();
            }

            room.peers.clear();
        };
    };

    // One who's joined a room: what they say goes to its host; gone, the host's told
    const joined = (room, peer, socket) => {
        socket.onMessage = (text) => {
            const [line, rest] = split(text);

            if (line === "data") {
                room.host.send(`from ${peer}\n${rest}`);
            }
        };
        socket.onClose = () => {
            sockets.delete(socket);

            if (room.peers.get(peer) === socket) {
                room.peers.delete(peer);
                room.host.send(`gone ${peer}`);
            }
        };
    };

    const upgrade = (request, socket, head) => {
        const key = request.headers["sec-websocket-key"];

        if (new URL(request.url, "http://relay").pathname !== path || String(request.headers.upgrade).toLowerCase() !== "websocket" || !key) {
            socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");

            return;
        }

        const accept = crypto.createHash("sha1").update(key + MAGIC).digest("base64");

        socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));

        const one = new Socket(socket, head, { limit: limits.message });

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

            for (const socket of sockets) {
                socket.close(1001);
            }
        },
    };
}
