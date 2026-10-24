// Players' own worlds through a world server's broker (generated/world_server_plan.md §8.3, §9.6,
// §12.3; server/broker.js): a world opened in a player's browser, listed on the server, and
// joined point to point, browser to browser (WebRTC: one reliable, ordered data channel for each
// who joins); or, when that can't be made within PEER_TIMING.direct, relayed by the server over
// the broker's own socket. What's said over it, and what it means, is core/netplay.js's: these
// are links, as app/together.js RelayLink is, and Hosting and Joining don't know which they have.
//
//   const host = await BrokerHost.open(brokerOf(server));   // the broker's word: { ice, relaying }
//   const code = await host.host({ name, people, players, most, net, visibility, ...await reachability(host) });
//   const joiner = await BrokerJoin.open(brokerOf(server));
//   await joiner.join(code);                                 // its name for the host: "p7"
//
// A message too big for a data channel to be sure of (a world's snapshot: hundreds of KB) is cut
// into PIECE-long pieces and joined again (piecesOf, Pieces); a channel with too much waiting to
// go waits till it's gone down (back-pressure). A joined game whose direct link drops asks for it
// again (ICE restart, through the broker); not back within PEER_TIMING.restart, it's relayed.

/** Where on a world server the broker is, and the subprotocol it speaks. */
export const BROKER_PATH = "/broker";
export const BROKER_PROTOCOL = "pellagos.broker.1";

/**
 * How long things may take (ms): the broker's answer to an ask; a direct link being made before
 * it's relayed instead; one dropped coming back; how often a world's listing is kept (the broker
 * lets it go after 45 s); how long the reachability check gathers; and keeping the host's link
 * to the broker (as app/together.js LINK_TIMING: pinged, given up on, made again with backoff).
 */
export const PEER_TIMING = Object.freeze({ answer: 8000, direct: 10000, restart: 5000, keep: 15000, gather: 3000, ping: 4000, patience: 10000, first: 500, most: 8000, jitter: 0.25, within: 40000 });

/** How long a piece of a message may be (characters: at most 48 KB as UTF-8, under the 64 KB every data channel takes). */
export const PIECE = 16384;

/** Back-pressure: past HIGH bytes waiting to go on a channel, pieces wait till it's down to LOW. */
export const HIGH = 1024 * 1024;
export const LOW = 256 * 1024;

/** Why the broker turned a game away: shown to its player. */
export const BROKER_ERRORS = Object.freeze({
    "no-room": "There's no world open with that code.",
    full: "That world's full.",
    away: "That world's host has lost their link for a moment. Try again soon.",
    busy: "Too many worlds are listed on that server just now. Try again soon.",
    "too-many": "Too many worlds are listed from here on that server already.",
    "relaying-off": "Your games couldn't link directly, and that server doesn't pass games' messages on for them.",
    gone: "That world's listing has gone.",
    bad: "That server couldn't take this world's listing.",
    unreachable: "Couldn't reach that server's broker.",
});

/** A world server's broker, at its address ({ host, port, secure }: app/servers.js). */
export function brokerOf({ host, port, secure }) {
    return `${secure ? "wss" : "ws"}://${host}:${port}${BROKER_PATH}`;
}

/** A message cut into pieces for a data channel: each "+" but the last, "=" (joined again by Pieces). */
export function piecesOf(text, size = PIECE) {
    if (text.length <= size) {
        return [`=${text}`];
    }

    const pieces = [];

    for (let at = 0; at < text.length; at += size) {
        pieces.push(`${at + size >= text.length ? "=" : "+"}${text.slice(at, at + size)}`);
    }

    return pieces;
}

/** Pieces joined again: add(piece) returns the whole message once its last piece has come, else null. */
export class Pieces {
    constructor() {
        this.parts = [];
    }

    add(piece) {
        const text = String(piece);

        this.parts.push(text.slice(1));

        if (text[0] !== "=") {
            return null;
        }

        const whole = this.parts.join("");

        this.parts = [];

        return whole;
    }
}

// (Home: the Wi-Fi's private ranges, link-local, the machine itself, and .local names, as
// app/servers.js homeHost has them)
const PRIVATE_V4 = [
    [10, 8],
    [172 * 256 + 16, 12],
    [192 * 256 + 168, 16],
    [169 * 256 + 254, 16],
    [127, 8],
];

function privateAddress(address) {
    const text = String(address ?? "").toLowerCase();

    if (!text || text.endsWith(".local") || text === "::1" || /^f[cd]|^fe[89ab]/.test(text)) {
        return true;
    }

    const v4 = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(text);

    if (!v4) {
        return false;
    }

    const top = Number(v4[1]) * 256 + Number(v4[2]);

    return PRIVATE_V4.some(([base, bits]) => (bits === 8 ? Number(v4[1]) === base : top >> (16 - bits) === base >> (16 - bits)));
}

/**
 * Whether a host can be reached, from the ICE candidates it gathered ([{ type, address, port,
 * relatedAddress, relatedPort }]): `direct` from anywhere (a public address of its own, or one its
 * router maps the same way for every STUN server it asked: not a symmetric NAT, which maps each
 * anew and lets no one in it didn't ask), `local` from its own network (any address there).
 */
export function reachabilityOf(candidates) {
    const hosts = candidates.filter(({ type }) => type === "host");
    const mapped = candidates.filter(({ type }) => type === "srflx");
    const ports = new Map();

    for (const { address, port, relatedAddress, relatedPort } of mapped) {
        const base = `${relatedAddress}:${relatedPort}`;

        ports.set(base, (ports.get(base) ?? new Set()).add(`${address}:${port}`));
    }

    const symmetric = [...ports.values()].some((seen) => seen.size > 1);

    return {
        direct: hosts.some(({ address }) => address && !privateAddress(address)) || (mapped.length > 0 && !symmetric),
        local: hosts.length > 0,
    };
}

// A candidate's parts (as RTCIceCandidate has them, else from its candidate line)
function partsOf(candidate) {
    if (candidate.type) {
        return { type: candidate.type, address: candidate.address, port: candidate.port, relatedAddress: candidate.relatedAddress, relatedPort: candidate.relatedPort };
    }

    const words = String(candidate.candidate ?? "").split(" ");
    const after = (word) => words[words.indexOf(word) + 1] ?? null;

    return { type: after("typ"), address: words[4], port: Number(words[5]), relatedAddress: after("raddr"), relatedPort: Number(after("rport")) };
}

/**
 * The reachability check (plan §8.3): ICE candidates gathered once, with the broker's STUN
 * servers (`ice`), for up to PEER_TIMING.gather ms. Returns { direct, local }.
 */
export async function reachability({ ice = [], RTC = globalThis.RTCPeerConnection, timing = PEER_TIMING } = {}) {
    if (!RTC) {
        return { direct: false, local: false };
    }

    const connection = new RTC({ iceServers: ice });
    const candidates = [];

    try {
        connection.createDataChannel("probe");
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, timing.gather);

            connection.addEventListener("icecandidate", ({ candidate }) => {
                if (candidate) {
                    candidates.push(partsOf(candidate));
                } else {
                    clearTimeout(timer);
                    resolve();
                }
            });
            connection
                .createOffer()
                .then((offer) => connection.setLocalDescription(offer))
                .catch(resolve);
        });
    } finally {
        connection.close();
    }

    return reachabilityOf(candidates);
}

// A WebSocket to the broker once it's open and has said its word ({ ice, relaying }); rejects
// "unreachable" if it can't be reached in time
function connect(address, timing) {
    return new Promise((resolve, reject) => {
        let socket;

        try {
            socket = new WebSocket(address, BROKER_PROTOCOL);
        } catch {
            reject(new Error("unreachable"));

            return;
        }

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error("unreachable"));
        }, timing.answer);

        socket.addEventListener("message", function first({ data }) {
            const text = String(data);

            if (text.startsWith("broker ")) {
                clearTimeout(timer);
                socket.removeEventListener("message", first);

                try {
                    resolve({ socket, word: JSON.parse(text.slice(7)) });
                } catch {
                    resolve({ socket, word: { ice: [], relaying: false } });
                }
            }
        });
        socket.addEventListener("error", () => {
            clearTimeout(timer);
            reject(new Error("unreachable"));
        });
        socket.addEventListener("close", () => {
            clearTimeout(timer);
            reject(new Error("unreachable"));
        });
    });
}

// The first line of a message, and what's after it
function split(text) {
    const at = text.indexOf("\n");

    return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
}

// A data channel, sending in pieces and waiting when too much is waiting to go
class Channel {
    constructor(channel) {
        this.channel = channel;
        this.waiting = [];
        this.pieces = new Pieces();
        channel.bufferedAmountLowThreshold = LOW;
        channel.addEventListener("bufferedamountlow", () => this.#flush());
    }

    get open() {
        return this.channel.readyState === "open";
    }

    send(text) {
        this.waiting.push(...piecesOf(text));
        this.#flush();
    }

    #flush() {
        while (this.waiting.length && this.open && this.channel.bufferedAmount <= HIGH) {
            this.channel.send(this.waiting.shift());
        }
    }

    /** A piece heard: the whole message, once it's come (else null). */
    heard(data) {
        return this.pieces.add(data);
    }

    close() {
        this.waiting = [];

        try {
            this.channel.close();
        } catch {
            // (Already closed)
        }
    }
}

// What a link to the broker has in common: its socket and the broker's word, asks answered,
// lines heard, the round trip timed
class BrokerSocket {
    constructor({ socket, word }, address, { RTC = globalThis.RTCPeerConnection, timing = PEER_TIMING } = {}) {
        Object.assign(this, { address, RTC, timing, word });
        this.waiting = null;
        this.closing = false;
        this.timedAt = null;

        /** Told how long the broker took to answer a ping (ms). */
        this.onRtt = () => {};
        this.attach(socket);
    }

    /** The STUN servers to try, as the broker said. */
    get ice() {
        return this.word?.ice ?? [];
    }

    attach(socket) {
        this.socket = socket;
        socket.addEventListener("message", ({ data }) => {
            if (this.socket === socket) {
                this.#hear(String(data));
            }
        });
        socket.addEventListener("close", () => {
            if (this.socket === socket) {
                this.waiting?.reject(new Error("unreachable"));
                this.waiting = null;
                this.dropped();
            }
        });
    }

    #hear(text) {
        const [line, rest] = split(text);
        const [what, ...words] = line.split(" ");

        if (what === "pong") {
            if (this.timedAt !== null) {
                this.onRtt(performance.now() - this.timedAt);
                this.timedAt = null;
            }

            this.pongAt = Date.now();

            return;
        }

        if (what === "broker") {
            try {
                this.word = JSON.parse(line.slice(7));
            } catch {
                // (Kept as it was)
            }

            return;
        }

        if (what === "error" && this.waiting) {
            this.waiting.reject(new Error(words[0] ?? "unreachable"));
            this.waiting = null;

            return;
        }

        if (this.waiting?.what === what) {
            this.waiting.resolve(words);
            this.waiting = null;

            return;
        }

        this.heard(what, words, rest);
    }

    // Say something, and wait for the broker's answer (a line starting `what`)
    ask(line, what) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiting = null;
                reject(new Error("unreachable"));
            }, this.timing.answer);

            this.waiting = {
                what,
                resolve: (words) => {
                    clearTimeout(timer);
                    resolve(words);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                },
            };
            this.send(line);
        });
    }

    send(text) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(text);
        }
    }

    /** Time a round trip to the broker now (heard by onRtt). */
    measure() {
        if (this.timedAt === null || performance.now() - this.timedAt > this.timing.patience) {
            this.timedAt = performance.now();
            this.send("ping");
        }
    }

    // A connection to the other game, with the broker's STUN servers; candidates sent through the broker
    rtcFor(peer) {
        const connection = new this.RTC({ iceServers: this.ice });

        connection.addEventListener("icecandidate", ({ candidate }) => {
            if (candidate) {
                this.send(`signal ${peer}\n${JSON.stringify({ candidate: candidate.toJSON ? candidate.toJSON() : candidate })}`);
            }
        });

        return connection;
    }

    // A signal from the other game, for `connection` (candidates kept till its remote description's set)
    async signalled(connection, held, said, { answer = false } = {}) {
        let signal;

        try {
            signal = JSON.parse(said);
        } catch {
            return null;
        }

        if (signal.sdp) {
            await connection.setRemoteDescription(signal.sdp);

            for (const candidate of held.splice(0)) {
                await connection.addIceCandidate(candidate).catch(() => {});
            }

            if (answer && signal.sdp.type === "offer") {
                await connection.setLocalDescription(await connection.createAnswer());

                return connection.localDescription;
            }
        } else if (signal.candidate) {
            if (connection.remoteDescription) {
                await connection.addIceCandidate(signal.candidate).catch(() => {});
            } else {
                held.push(signal.candidate);
            }
        }

        return null;
    }

    // (Lines that aren't answers: each link's own)
    heard() {}

    // (The socket closed: each link's own)
    dropped() {}
}

/**
 * A browser's world listed on a world server's broker, and those who join it: a link Hosting
 * (core/netplay.js) sends over as it does the relay's (to, kick; onFrom, onGone, onHere, onLost,
 * onFound, onDrop, onRtt, measure, close). `playersNow()` says how many are in it, for the listing.
 */
export class BrokerHost extends BrokerSocket {
    /** A link to the broker at `address`, once it's said its word. Rejects "unreachable". */
    static async open(address, options = {}) {
        return new BrokerHost(await connect(address, options.timing ?? PEER_TIMING), address, options);
    }

    constructor(opened, address, options) {
        super(opened, address, options);

        /** Those who've come to it (by the broker's name for them): { connection, channel, relayed, held, gone }. */
        this.peers = new Map();
        this.id = null;
        this.token = null;
        this.keeping = null;
        this.reconnecting = false;
        this.playersNow = () => 1;

        this.onPeer = () => {};
        this.onFrom = () => {};
        this.onGone = () => {};
        this.onHere = () => {};
        this.onLost = () => {};
        this.onFound = () => {};
        this.onDrop = () => {};
    }

    /** List the world (`announcement`: server/broker.js announcementOf): resolves with its code. Rejects with the broker's reason. */
    async host(announcement) {
        const [id, token] = await this.ask(`announce\n${JSON.stringify(announcement)}`, "announced");

        Object.assign(this, { id, token, announcement });
        this.#keep();

        return id;
    }

    /**
     * Take back a listing kept for this world (`id`, `token`, as announced before), its page
     * started again and the world opened anew (`announcement` as host's): those in it from before
     * told to come in again (server/broker.js "closed again"). Resolves with its code; rejects
     * "gone" once the broker's let it go.
     */
    async reclaim(id, token, announcement) {
        await this.ask(`keep ${id} ${token}\n${JSON.stringify({ players: this.playersNow(), visibility: announcement.visibility, afresh: true })}`, "announced");
        Object.assign(this, { id, token, announcement });
        this.#keep();

        return id;
    }

    /** Listed for everyone on the server to see (`listed`), or for its code alone. */
    list(listed) {
        this.announcement = { ...this.announcement, visibility: listed ? "listed" : "code" };
        this.send(`keep ${this.id} ${this.token}\n${JSON.stringify({ players: this.playersNow(), visibility: this.announcement.visibility })}`);
    }

    // The listing kept every PEER_TIMING.keep ms, saying how many are in it; and the broker asked
    // every so often whether it's still there (an ask unanswered too long, it's dropped; a page
    // that's been asleep given a fresh ask first)
    #keep() {
        clearInterval(this.keeping);
        this.keptAt = Date.now();
        this.tickedAt = Date.now();
        this.pingedAt = null;
        this.keeping = setInterval(() => {
            const now = Date.now();
            const slept = now - this.tickedAt > this.timing.patience;

            this.tickedAt = now;

            if (now - this.keptAt >= this.timing.keep) {
                this.keptAt = now;
                this.send(`keep ${this.id} ${this.token}\n${JSON.stringify({ players: this.playersNow() })}`);
            }

            if (this.pingedAt !== null && (this.pongAt ?? 0) < this.pingedAt && !slept) {
                if (now - this.pingedAt > this.timing.patience) {
                    this.#lost();
                }
            } else {
                this.pingedAt = now;
                this.send("ping");
            }
        }, this.timing.ping);
    }

    heard(what, words, rest) {
        const [peer] = words;

        switch (what) {
            case "peer":
                this.#peer(peer);
                break;
            case "signal":
                this.#signal(peer, rest);
                break;
            case "relay": {
                const place = this.peers.get(peer);

                if (place && !place.channel?.open) {
                    place.relayed = true;
                    place.connection?.close();
                    place.connection = null;
                    this.onPeer(peer);
                }

                break;
            }
            case "from":
                this.onFrom(peer, rest);
                break;
            case "gone": {
                const place = this.peers.get(peer);

                // (One linked directly is gone when its channel closes: the broker's word for it
                // matters only while it's relayed, or not yet linked)
                if (place && (place.relayed || !place.channel?.open)) {
                    this.#gone(peer);
                }

                break;
            }
            case "here":
                this.onHere([...words, ...[...this.peers.entries()].filter(([, place]) => place.channel?.open).map(([name]) => name)]);
                break;
            case "error":
                // (Its listing gone though its link's open, the broker's word on a keep: an older
                // server's, which didn't keep one whose page was slowed in the background. Said so,
                // not its code shown on as if anyone could still join with it)
                if (peer === "gone" && this.id && !this.reconnecting) {
                    this.#drop();
                }

                break;
            default:
                break;
        }
    }

    // Someone come: their connection made ready for their offer, their channel heard once it's open
    #peer(peer) {
        if (!this.RTC) {
            this.peers.set(peer, { connection: null, channel: null, relayed: false, held: [], gone: false });

            return;
        }

        const connection = this.rtcFor(peer);
        const place = { connection, channel: null, relayed: false, held: [], gone: false };

        this.peers.set(peer, place);
        connection.addEventListener("datachannel", ({ channel }) => {
            const link = new Channel(channel);

            place.channel = link;
            channel.addEventListener("open", () => this.onPeer(peer));
            channel.addEventListener("message", ({ data }) => {
                const text = link.heard(data);

                if (text !== null) {
                    this.onFrom(peer, text);
                }
            });
            channel.addEventListener("close", () => !place.relayed && this.#gone(peer));
        });
        connection.addEventListener("connectionstatechange", () => {
            if (connection.connectionState === "failed" && place.channel?.open === false && !place.relayed) {
                this.#gone(peer);
            }
        });
    }

    async #signal(peer, said) {
        const place = this.peers.get(peer);

        if (!place?.connection) {
            return;
        }

        const answer = await this.signalled(place.connection, place.held, said, { answer: true }).catch(() => null);

        if (answer) {
            this.send(`signal ${peer}\n${JSON.stringify({ sdp: answer.toJSON ? answer.toJSON() : answer })}`);
        }
    }

    #gone(peer) {
        const place = this.peers.get(peer);

        if (!place || place.gone) {
            return;
        }

        place.gone = true;
        this.peers.delete(peer);
        place.channel?.close();
        place.connection?.close();
        this.onGone(peer);
    }

    /** Say something to one who's joined. */
    to(peer, text) {
        const place = this.peers.get(peer);

        if (place?.channel?.open) {
            place.channel.send(text);
        } else if (place?.relayed) {
            this.send(`to ${peer}\n${text}`);
        }
    }

    /** Put one who's joined out. */
    kick(peer) {
        this.send(`kick ${peer}`);
        this.#gone(peer);
    }

    // The broker's link dropped: those linked directly carry on; it's made again, and the listing
    // kept on it (those relayed told who's still here), or it's lost for good
    dropped() {
        if (this.closing || this.reconnecting) {
            return;
        }

        this.#lost();
    }

    #lost() {
        if (this.reconnecting || this.closing) {
            return;
        }

        this.reconnecting = true;
        clearInterval(this.keeping);

        const old = this.socket;

        this.socket = null;

        try {
            old?.close(4000);
        } catch {
            // (Already closed)
        }

        this.onLost();
        this.#retry(0, Date.now() + this.timing.within);
    }

    #retry(tries, until) {
        const { first, most, jitter } = this.timing;
        const wait = Math.min(most, first * 2 ** tries) * (1 + jitter * (2 * Math.random() - 1));

        if (Date.now() + wait > until) {
            this.#drop();

            return;
        }

        this.retryTimer = setTimeout(async () => {
            try {
                const { socket, word } = await connect(this.address, this.timing);

                if (this.closing) {
                    socket.close();

                    return;
                }

                this.word = word;
                this.attach(socket);
                await this.ask(`keep ${this.id} ${this.token}`, "announced");
                this.reconnecting = false;
                this.pingedAt = null;
                this.#keep();
                this.onFound();
            } catch (error) {
                if (this.closing) {
                    return;
                }

                if (error.message === "gone") {
                    this.#drop();
                } else {
                    this.#retry(tries + 1, until);
                }
            }
        }, wait);
    }

    #drop() {
        if (this.closing) {
            return;
        }

        this.closing = true;
        this.reconnecting = false;
        clearInterval(this.keeping);
        clearTimeout(this.retryTimer);
        this.socket?.close();
        this.onDrop();
    }

    /** Taken down: the listing withdrawn, everyone's link closed. */
    close() {
        this.closing = true;
        clearInterval(this.keeping);
        clearTimeout(this.retryTimer);

        if (this.id) {
            this.send(`withdraw ${this.id}`);
        }

        for (const peer of [...this.peers.keys()]) {
            const place = this.peers.get(peer);

            place.channel?.close();
            place.connection?.close();
        }

        this.peers.clear();
        this.socket?.close(1000);
    }
}

/**
 * A game joining a browser's world through the broker: a link Joining (core/netplay.js) sends
 * over as it does the relay's (data; onData, onClosed, onAway, onBack, onLost, onFound, onDrop,
 * onRtt, measure, close). `how`: "direct" or "relayed", once it's linked.
 */
export class BrokerJoin extends BrokerSocket {
    /** A link to the broker at `address`, once it's said its word. Rejects "unreachable". */
    static async open(address, options = {}) {
        return new BrokerJoin(await connect(address, options.timing ?? PEER_TIMING), address, options);
    }

    constructor(opened, address, options) {
        super(opened, address, options);
        this.peer = null;
        this.connection = null;
        this.channel = null;
        this.held = [];
        this.how = null;
        this.linked = null;
        this.restarting = null;

        this.onData = () => {};
        this.onClosed = () => {};
        this.onAway = () => {};
        this.onBack = () => {};
        this.onLost = () => {};
        this.onFound = () => {};
        this.onDrop = () => {};
    }

    /**
     * Into the world listed with `code`: resolves with this game's name for its host once it's
     * linked, directly or (after PEER_TIMING.direct) relayed. Rejects with the broker's reason
     * (no-room, full, away, relaying-off, unreachable).
     */
    async join(code) {
        const [peer] = await this.ask(`connect ${String(code).toUpperCase()}`, "peer");

        this.peer = peer;

        // (No WebRTC in this browser: relayed at once)
        if (!this.RTC) {
            await this.#relay();

            return peer;
        }

        const linked = new Promise((resolve, reject) => (this.linked = { resolve, reject }));

        this.#direct();

        // (Its failing is the join's: linked's rejected with it)
        const timer = setTimeout(() => this.#relay().catch(() => {}), this.timing.direct);

        try {
            await linked;
        } finally {
            clearTimeout(timer);
        }

        return peer;
    }

    // A direct link offered: its channel made, the offer and candidates sent through the broker
    async #direct() {
        const connection = this.rtcFor(this.peer);
        const channel = new Channel(connection.createDataChannel("pellagos", { ordered: true }));

        this.connection = connection;
        this.channel = channel;
        channel.channel.addEventListener("open", () => {
            if (this.how === "relayed") {
                return;
            }

            this.how = "direct";
            this.linked?.resolve();
            this.linked = null;

            if (this.restarting) {
                clearTimeout(this.restarting);
                this.restarting = null;
                this.onFound();
            }
        });
        channel.channel.addEventListener("message", ({ data }) => {
            const text = channel.heard(data);

            if (text !== null) {
                this.onData(text);
            }
        });
        channel.channel.addEventListener("close", () => {
            if (this.how === "direct" && !this.closing) {
                this.#relayAfterDrop();
            }
        });
        connection.addEventListener("connectionstatechange", () => {
            if (this.how === "direct" && connection.connectionState === "disconnected" && !this.restarting) {
                this.#restart();
            }
        });
        await this.#offer();
    }

    async #offer() {
        try {
            await this.connection.setLocalDescription(await this.connection.createOffer());
            this.send(`signal ${this.peer}\n${JSON.stringify({ sdp: this.connection.localDescription.toJSON ? this.connection.localDescription.toJSON() : this.connection.localDescription })}`);
        } catch {
            // (Closed meanwhile)
        }
    }

    // The direct link dropped (a phone gone from Wi-Fi to its mobile network): asked for again
    // through the broker, and relayed if it isn't back in time
    #restart() {
        this.onLost();
        this.restarting = setTimeout(() => {
            this.restarting = null;
            this.#relayAfterDrop({ lost: true });
        }, this.timing.restart);

        try {
            this.connection.restartIce();
            this.#offer();
        } catch {
            // (No ICE restart here: relayed when the time's up)
        }
    }

    async #relayAfterDrop({ lost = false } = {}) {
        if (this.how !== "direct" || this.closing) {
            return;
        }

        if (!lost) {
            this.onLost();
        }

        try {
            await this.#relay();
            this.onFound();
        } catch {
            this.#drop();
        }
    }

    // Relayed by the server instead: the direct attempt let go (unless it's opened meanwhile: its
    // host, linked directly, takes no notice of the broker's word, and nor does this)
    async #relay() {
        if (this.how === "relayed" || (this.how === "direct" && this.channel?.open)) {
            return;
        }

        try {
            await this.ask(`relay ${this.peer}`, "relay");
        } catch (error) {
            this.linked?.reject(error);
            this.linked = null;

            throw error;
        }

        if (this.how === "direct" && this.channel?.open) {
            return;
        }

        this.how = "relayed";
        this.channel?.close();
        this.connection?.close();
        this.linked?.resolve();
        this.linked = null;
    }

    heard(what, words, rest) {
        switch (what) {
            case "signal":
                if (words[0] === this.peer && this.connection && this.how !== "relayed") {
                    this.signalled(this.connection, this.held, rest).catch(() => {});
                }

                break;
            case "relay":
                // (The host asked for it: so be it, unless the direct link's open)
                if (this.how !== "relayed" && !(this.how === "direct" && this.channel?.open)) {
                    this.how = "relayed";
                    this.channel?.close();
                    this.connection?.close();
                    this.linked?.resolve();
                    this.linked = null;
                }

                break;
            case "data":
                this.onData(rest);
                break;
            case "away":
                this.onAway();
                break;
            case "back":
                this.onBack();
                break;
            case "closed":
                // (Its host's page started again, its world opened anew: "again")
                this.closing = true;
                this.onClosed(words[0] ?? null);
                break;
            default:
                break;
        }
    }

    /** Say something to the host. */
    data(text) {
        if (this.how === "direct" && this.channel?.open) {
            this.channel.send(text);
        } else if (this.how === "relayed") {
            this.send(`data\n${text}`);
        }
    }

    // The broker's link closed: while relayed, that's the world lost; linked directly, play goes on
    dropped() {
        if (this.closing) {
            return;
        }

        if (this.how !== "direct") {
            this.linked?.reject(new Error("unreachable"));
            this.linked = null;
            this.#drop();
        }
    }

    #drop() {
        if (this.closing) {
            return;
        }

        this.closing = true;
        this.channel?.close();
        this.connection?.close();
        this.onDrop();
    }

    close() {
        this.closing = true;
        clearTimeout(this.restarting);
        this.channel?.close();
        this.connection?.close();
        this.socket?.close(1000);
    }
}
