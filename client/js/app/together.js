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

/** Why the relay turned a game away: shown to its player. */
export const RELAY_ERRORS = Object.freeze({
    "no-room": "There's no world open with that code.",
    full: "That world's full.",
    busy: "Too many worlds are open just now. Try again soon.",
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

/**
 * The link to the relay: a WebSocket, what's said over it in the relay's lines (server/relay.js).
 * Hears: onPeer(peer), onFrom(peer, text), onGone(peer) as a host; onData(text), onClosed() (the
 * host's gone) as one who's joined; onDrop() when the link itself is lost.
 */
export class RelayLink {
    /** A link to the relay at `address`, once it's open (rejects if it can't be reached). */
    static open(address = relayAddress()) {
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
                resolve(new RelayLink(socket));
            });
            socket.addEventListener("error", () => {
                clearTimeout(timer);
                reject(new Error("unreachable"));
            });
        });
    }

    constructor(socket) {
        this.socket = socket;
        this.waiting = null;
        this.closing = false;
        this.onPeer = () => {};
        this.onFrom = () => {};
        this.onGone = () => {};
        this.onData = () => {};
        this.onClosed = () => {};
        this.onDrop = () => {};

        socket.addEventListener("message", ({ data }) => this.#hear(String(data)));
        socket.addEventListener("close", () => {
            this.waiting?.reject(new Error("unreachable"));
            this.waiting = null;

            if (!this.closing) {
                this.onDrop();
            }
        });
    }

    #hear(text) {
        const at = text.indexOf("\n");
        const [line, rest] = at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 1)];
        const [what, about] = line.split(" ");

        switch (what) {
            case "hosting":
            case "joined":
                this.waiting?.resolve(about);
                this.waiting = null;
                break;
            case "error":
                this.waiting?.reject(new Error(about));
                this.waiting = null;
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
            case "data":
                this.onData(rest);
                break;
            case "closed":
                this.closing = true;
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
    host() {
        return this.#ask("host");
    }

    /** Join the room with a code: resolves with this one's name in it (rejects: "no-room", "full"). */
    join(code) {
        return this.#ask(`join ${code}`);
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
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(text);
        }
    }

    close() {
        this.closing = true;
        this.socket.close();
    }
}

/**
 * Open a game's world to others (its host being this game's): resolves with { code (for others
 * to join by), hosting (core/netplay.js), close() (closed to others again) }. Hears onChange()
 * when someone comes or goes, and onDrop() if the link's lost.
 */
export async function openWorld(game, { address = relayAddress(), onChange = () => {}, onDrop = () => {} } = {}) {
    const link = await RelayLink.open(address);
    const code = await link.host();
    const hosting = new Hosting(game.host, { send: (peer, text) => link.to(peer, text) });

    hosting.onJoin = () => onChange();
    hosting.onLeave = () => onChange();
    link.onFrom = (peer, text) => hosting.hear(peer, text);
    link.onGone = (peer) => hosting.gone(peer);
    link.onDrop = () => {
        game.hosting = null;
        hosting.stop();
        onDrop();
    };
    game.hosting = hosting;

    return {
        code,
        hosting,
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
 * heard), close() }. Hears onClosed() if the host closes the world, onDrop() if the link's lost.
 */
export async function joinWorld({ code, character, address = relayAddress(), onClosed = () => {}, onDrop = () => {} }) {
    const link = await RelayLink.open(address);

    try {
        await link.join(cleanCode(code));
    } catch (error) {
        link.close();
        throw error;
    }

    const joining = new Joining({ send: (text) => link.data(text) });

    link.onData = (text) => joining.hear(text);
    link.onClosed = onClosed;
    link.onDrop = onDrop;
    joining.hello(character);

    return { joining, close: () => link.close() };
}
