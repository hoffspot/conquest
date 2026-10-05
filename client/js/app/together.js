// Playing together in the browser (docs/WAR.md M11): a world opened to others, or another's
// joined, through the relay (server/relay.js), by a WebSocket. What's said over it, and what it
// means, is core/netplay.js's; this only carries it.
//
//   const world = await openWorld(game);                 // { code, hosting, close() }
//   const joined = await joinWorld({ code, character }); // { joining, close() }

import { Hosting, Joining } from "../core/netplay.js";

export { NET_REFUSALS } from "../core/netplay.js";

/** How long to wait for the relay to answer (ms). */
const RELAY_TIMEOUT = 8000;

/**
 * Keeping the link: how often it asks the relay whether it's still there (ms, once it's been
 * answered: an older relay doesn't), and how long an ask can go unanswered before the link's
 * taken for dropped (a link can die without closing: a phone that's moved from Wi-Fi to its mobile
 * network). Dropped, it's made again on a new link (the relay keeps its place a while: RELAY_LIMITS
 * grace), after `first` ms, then twice as long each try up to `most`, each a little more or less
 * (`jitter`, a share, so that everyone dropped at once doesn't come back at once), given up on
 * after `within` ms or when the relay says its place is gone.
 */
export const LINK_TIMING = Object.freeze({ ping: 4000, patience: 10000, first: 500, most: 8000, jitter: 0.25, within: 45000 });

/** The close code of a link given up on to come back on another (server/relay.js RECONNECTING). */
const RECONNECTING = 4000;

/** Why the relay turned a game away: shown to its player. */
export const RELAY_ERRORS = Object.freeze({
    "no-room": "There's no world open with that code.",
    full: "That world's full.",
    busy: "Too many worlds are open just now. Try again soon.",
    away: "That world's host has lost their link for a moment. Try again soon.",
    unreachable: "Couldn't reach the relay that games play together through.",
});

/**
 * Where the relay is: `?relay=` (a ws:// or wss:// address), else on the server the game came
 * from (its /relay: `npm start` serves both).
 */
export function relayAddress(location = window.location) {
    const given = new URLSearchParams(location.search).get("relay");

    if (given && /^wss?:\/\//.test(given)) {
        return given;
    }

    return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/relay`;
}

/** A room's code as it's typed: letters only, upper case, four of them. */
export function cleanCode(text) {
    return String(text ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

// A WebSocket to the relay once it's open (rejects if it can't be reached in time)
function connect(address) {
    return new Promise((resolve, reject) => {
        let socket;

        try {
            socket = new WebSocket(address);
        } catch {
            reject(new Error("unreachable"));

            return;
        }

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error("unreachable"));
        }, RELAY_TIMEOUT);

        socket.addEventListener("open", () => {
            clearTimeout(timer);
            resolve(socket);
        });
        socket.addEventListener("error", () => {
            clearTimeout(timer);
            reject(new Error("unreachable"));
        });
    });
}

/**
 * The link to the relay: a WebSocket, what's said over it in the relay's lines (server/relay.js).
 * Hears: onPeer(peer), onFrom(peer, text), onGone(peer), onHere(peers) (who's still in, back
 * after a drop) as a host; onData(text), onClosed() (the host's gone), onAway() and onBack() (the
 * host's link dropped, and back) as one who's joined; onLost() when its own link's dropped, and it's
 * coming back on another; onFound() once it has; onDrop() when it's lost for good.
 */
export class RelayLink {
    /** A link to the relay at `address`, once it's open (rejects if it can't be reached). */
    static async open(address = relayAddress(), timing = LINK_TIMING) {
        return new RelayLink(await connect(address), address, timing);
    }

    constructor(socket, address = null, timing = LINK_TIMING) {
        this.address = address;
        this.timing = timing;
        this.waiting = null;
        this.closing = false;

        /** Its place in a room, to take back on a new link: { line (what's said to), code }. */
        this.place = null;

        /** Whether the relay answers pings (an older one doesn't: its link's never judged by them). */
        this.answers = false;
        this.pingedAt = null;

        /** When the ping being timed went (ms), to hear how long the relay took to answer it (onRtt). */
        this.timedAt = null;
        this.tickedAt = 0;
        this.heartbeat = null;
        this.reconnecting = false;
        this.retryTimer = null;

        this.onPeer = () => {};
        this.onFrom = () => {};
        this.onGone = () => {};
        this.onHere = () => {};
        this.onData = () => {};
        this.onClosed = () => {};
        this.onAway = () => {};
        this.onBack = () => {};
        this.onLost = () => {};
        this.onFound = () => {};
        this.onDrop = () => {};

        /** Told how long the relay took to answer a ping (ms): the round trip over this game's own link. */
        this.onRtt = () => {};

        this.#attach(socket);
    }

    #attach(socket) {
        this.socket = socket;

        socket.addEventListener("message", ({ data }) => {
            if (this.socket === socket) {
                this.#hear(String(data));
            }
        });
        socket.addEventListener("close", ({ code }) => {
            if (this.socket !== socket) {
                return;
            }

            this.waiting?.reject(new Error("unreachable"));
            this.waiting = null;

            // (Closed by the relay on purpose, or never given a place: gone; else, dropped)
            if (this.closing) {
                return;
            }

            if (this.place && code !== 1000 && !this.reconnecting) {
                this.#lost();
            } else if (!this.reconnecting) {
                this.#drop();
            }
        });
    }

    #hear(text) {
        const at = text.indexOf("\n");
        const [line, rest] = at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
        const [what, about, token] = line.split(" ");

        // (Anything heard: the link's still there)
        this.pingedAt = null;

        switch (what) {
            case "hosting":
                this.place = token ? { line: `rehost ${about} ${token}`, code: about } : null;
                this.waiting?.resolve(about);
                this.waiting = null;
                break;
            case "joined":
                this.place = token ? { line: `rejoin ${this.code} ${about} ${token}`, code: this.code } : null;
                this.waiting?.resolve(about);
                this.waiting = null;
                break;
            case "error":
                this.waiting?.reject(new Error(about));
                this.waiting = null;
                break;
            case "pong":
                this.answers = true;

                if (this.timedAt !== null) {
                    this.onRtt(performance.now() - this.timedAt);
                    this.timedAt = null;
                }

                break;
            case "peer":
                this.onPeer(about);
                break;
            case "from":
                this.onFrom(about, rest);
                break;
            case "gone":
                this.onGone(about);
                break;
            case "here":
                this.onHere(line.split(" ").slice(1));
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
                this.closing = true;
                this.#stopBeating();
                this.onClosed();
                break;
            default:
                break;
        }
    }

    // Say something, and wait for the relay's answer
    #ask(line) {
        return new Promise((resolve, reject) => {
            this.waiting = { resolve, reject };
            this.socket.send(line);
        });
    }

    /** Open a room: resolves with its code. */
    async host() {
        const code = await this.#ask("host");

        this.#beat();

        return code;
    }

    /** Join the room with a code: resolves with this one's name in it (rejects: "no-room", "full", "away"). */
    async join(code) {
        this.code = code;

        const peer = await this.#ask(`join ${code}`);

        this.#beat();

        return peer;
    }

    // Asking every so often whether the link's still there (answered: pong, or anything at all);
    // an ask unanswered too long, dropped (a page that's been asleep given a fresh ask first)
    #beat() {
        this.#stopBeating();
        this.tickedAt = Date.now();
        this.heartbeat = setInterval(() => {
            const now = Date.now();
            const slept = now - this.tickedAt > this.timing.patience;

            this.tickedAt = now;

            if (this.pingedAt !== null && !slept && this.answers && now - this.pingedAt > this.timing.patience) {
                this.#lost();
            } else if (this.pingedAt === null || slept) {
                this.pingedAt = now;
                this.#ping();
            }
        }, this.timing.ping);
    }

    // A ping, timed if none is being (its answer heard by onRtt; one unanswered too long, given up on)
    #ping() {
        if (!this.#timing()) {
            this.timedAt = performance.now();
        }

        this.#send("ping");
    }

    #timing() {
        return this.timedAt !== null && performance.now() - this.timedAt < this.timing.patience;
    }

    /** Time a round trip to the relay now (heard by onRtt), unless one's being timed already. */
    measure() {
        if (this.socket && !this.reconnecting && !this.#timing()) {
            this.#ping();
        }
    }

    #stopBeating() {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
        this.pingedAt = null;
        this.timedAt = null;
    }

    // The link's dropped: its place taken back on a new one, trying again and again, less often
    #lost() {
        if (this.reconnecting || this.closing) {
            return;
        }

        this.reconnecting = true;
        this.#stopBeating();

        const old = this.socket;

        this.socket = null;

        try {
            old?.close(RECONNECTING);
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
                const socket = await connect(this.address);

                if (this.closing) {
                    socket.close();

                    return;
                }

                this.#attach(socket);
                await this.#ask(this.place.line);
                this.reconnecting = false;
                this.#beat();
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

    // Lost for good
    #drop() {
        if (this.closing) {
            return;
        }

        this.closing = true;
        this.reconnecting = false;
        this.#stopBeating();
        clearTimeout(this.retryTimer);

        try {
            this.socket?.close();
        } catch {
            // (Already closed)
        }

        this.onDrop();
    }

    /** As a host: say something to one who's joined. */
    to(peer, text) {
        this.#send(`to ${peer}\n${text}`);
    }

    /** As a host: put one who's joined out. */
    kick(peer) {
        this.#send(`kick ${peer}`);
    }

    /** As one who's joined: say something to the host. */
    data(text) {
        this.#send(`data\n${text}`);
    }

    #send(text) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(text);
        }
    }

    close() {
        this.closing = true;
        this.#stopBeating();
        clearTimeout(this.retryTimer);
        this.socket?.close();
    }
}

/**
 * Open a game's world to others (its host being this game's): resolves with { code (for others
 * to join by), hosting (core/netplay.js), link (the RelayLink), close() (closed to others again) }. Hears onChange()
 * when someone comes or goes; onLink("lost") when its link's dropped and it's coming back on
 * another, onLink(null) once it has (everyone sent the world again); and onDrop() if the link's
 * lost for good.
 */
export async function openWorld(game, { address = relayAddress(), onChange = () => {}, onLink = () => {}, onDrop = () => {}, timing = LINK_TIMING } = {}) {
    const link = await RelayLink.open(address, timing);
    const code = await link.host();
    const hosting = new Hosting(game.host, { send: (peer, text) => link.to(peer, text) });

    hosting.onJoin = () => onChange();
    hosting.onLeave = () => onChange();
    link.onFrom = (peer, text) => hosting.hear(peer, text);
    link.onGone = (peer) => hosting.gone(peer);
    link.onHere = (peers) => hosting.still(peers);
    link.onLost = () => onLink("lost");
    link.onFound = () => {
        hosting.resync();
        onLink(null);
    };
    link.onDrop = () => {
        game.hosting = null;
        hosting.stop();
        onDrop();
    };
    game.hosting = hosting;

    return {
        code,
        hosting,
        link,
        close() {
            game.hosting = null;
            hosting.stop();
            link.close();
        },
    };
}

/**
 * Join the world open with `code`, as a character (as Host.join takes it): resolves once the
 * relay's let it in, with { joining (core/netplay.js: its onWelcome, onState and onRefused to be
 * heard), link (the RelayLink), close() }. Hears onClosed() if the host closes the world; onLink("lost") when its link's
 * dropped and it's coming back on another, onLink("away") when the host's has, onLink(null) once
 * all's well again (the world asked for again); and onDrop() if the link's lost for good.
 */
export async function joinWorld({ code, character, address = relayAddress(), onClosed = () => {}, onLink = () => {}, onDrop = () => {}, timing = LINK_TIMING }) {
    const link = await RelayLink.open(address, timing);

    try {
        await link.join(cleanCode(code));
    } catch (error) {
        link.close();
        throw error;
    }

    const joining = new Joining({ send: (text) => link.data(text), clock: () => performance.now() });

    link.onData = (text) => joining.hear(text);
    link.onClosed = onClosed;
    link.onAway = () => onLink("away");
    link.onBack = () => onLink(null);
    link.onLost = () => onLink("lost");
    link.onFound = () => {
        joining.resync();
        onLink(null);
    };
    link.onDrop = onDrop;
    joining.hello(character);

    return { joining, link, close: () => link.close() };
}
