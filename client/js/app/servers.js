// Worlds on world servers, as the game knows them (generated/world_server_plan.md §7.6, §8.1, §9.5,
// §12): the servers a player's added (by an address, or an invite link), remembered in
// localStorage with what they hold for each (a world's key, their return ticket), and how the game
// talks to one: its card (/api/v1/status, which anyone may ask for), into a world (/enter, or a
// short code's /codes/redeem), worlds made, and the play socket (app/together.js RelayLink).
//
// Nothing secret goes to an address until the server there has proved it's the one meant: its play
// socket's `hi` answered with its id, public key and the game's nonce signed (core/identity.js).
// The first time, the id's pinned (or taken from the invite link, which is better); after that a
// different one stops everything, and only a fresh invite link pins again.
//
//   const servers = new KnownServers();                      // localStorage pellagos.servers
//   const record = servers.remember(addressOf("studio-mac.local"));
//   const client = new ServerClient(record, { servers });
//   await client.status();                                   // the server's card and listed worlds
//   const entered = await client.enter({ world, key });      // proves the server first
//   const { joining } = await client.play({ world, session: entered.session, character, hero });

import { newNonce, verifyIdentity } from "../core/identity.js";
import { Joining, NET_VERSION } from "../core/netplay.js";
import { addressOf, DEFAULT_PORT, inviteLink, inviteOf } from "./invites.js";
import { LINK_TIMING, RelayLink } from "./together.js";

export { addressOf, DEFAULT_PORT, inviteLink, inviteOf };

/** Where the game remembers the servers its player knows, and the shape that's in (bumped with a step forward). */
export const SERVERS_KEY = "pellagos.servers";
export const SERVERS_VERSION = 1;

/** Where a server's API and play socket are, and the play socket's subprotocol (server/api.js, server/play.js). */
export const API_PATH = "/api/v1";
export const PLAY_PATH = "/play";
export const PLAY_PROTOCOL = "pellagos.play.1";

/** How long a call to a server's API may take (ms). */
export const CALL_TIMEOUT = 10000;

/** What a code of servers and tickets starts with (KnownServers export). */
const EXPORTED = "pellagos-servers.1.";

/** Why a world server turned the game away, or sent it out: shown to its player (server/access/policy.js REFUSED, server/play.js). */
export const SERVER_REFUSALS = Object.freeze({
    "no-world": "There's no such world on that server.",
    key: "That key doesn't open this world (or no longer does).",
    banned: "You've been banned from this world.",
    locked: "That world's locked: only its owner can come in just now.",
    home: "That key only works at home, on the server's own Wi-Fi.",
    role: "Only the world's owner can do that.",
    full: "That world's full.",
    version: "That world's played in another version of the game. Open the game from the server's own page.",
    code: "That code doesn't open anything here (or no longer does).",
    wait: "Too many tries: wait a moment, then try again.",
    "too-many": "You're already in that world on too many devices.",
    newer: "That world was kept by a newer version of the server.",
    broken: "That world couldn't be opened just now. Try again soon.",
    gone: "Your place in that world wasn't kept.",
    kicked: "You were sent out of the world.",
    afk: "You were away too long, so you were sent out of the world.",
    "key-revoked": "The key you came in by was revoked.",
    "world-deleted": "That world was deleted.",
    "set-aside": "The world's owner set it aside for now: it's saved, and you can come back in.",
    "server-stopping": "The server's stopping.",
    internet: "That server only answers its own Wi-Fi for now.",
    host: "That address isn't one the server answers to.",
    origin: "That server won't take games opened from this page. Open the game from the server's own page.",
    unreachable: "Couldn't reach that server.",
    identity: "This isn't the server you played on before. Nothing was sent to it. If it should be, follow a fresh invite link from its owner.",
    proof: "That server couldn't prove who it is, so nothing was sent to it.",
});

/** A world server's refusal (or sending out): `error` its code (SERVER_REFUSALS), `message` what to show. */
export class ServerRefusal extends Error {
    constructor(error, message = SERVER_REFUSALS[error] ?? "That server refused.", extra = {}) {
        super(message);
        Object.assign(this, { error, ...extra });
    }
}

/** A server's own web address (its page, and its API under API_PATH). */
export function baseOf({ host, port, secure }) {
    return `${secure ? "https" : "http"}://${host}:${port}`;
}

/** Its play socket's address. */
export function playOf({ host, port, secure }) {
    return `${secure ? "wss" : "ws"}://${host}:${port}${PLAY_PATH}`;
}

// base64url, of text (UTF-8)
const encode64 = (text) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(text)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
const decode64 = (text) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0)));

/**
 * The servers a player knows, kept in `storage` (localStorage) under SERVERS_KEY: each by its
 * address's key, { key, host, port, secure, id (pinned), name, seen, maker (a creator or admin
 * key, if they've one), worlds: { [world]: { name, key, ticket, player, role } } }.
 */
export class KnownServers {
    constructor(storage = globalThis.localStorage) {
        this.storage = storage;
        this.servers = new Map();

        try {
            const kept = JSON.parse(storage?.getItem(SERVERS_KEY) ?? "null");

            if (kept?.version === SERVERS_VERSION) {
                for (const one of kept.servers ?? []) {
                    if (addressOf(one?.key)) {
                        this.servers.set(one.key, { worlds: {}, ...one });
                    }
                }
            }
        } catch {
            // (Not readable: none known)
        }
    }

    #save() {
        try {
            this.storage?.setItem(SERVERS_KEY, JSON.stringify({ version: SERVERS_VERSION, servers: [...this.servers.values()] }));
        } catch {
            // (Storage full or refused: known for now, not kept)
        }
    }

    /** Every server known, the one played on last first. */
    list() {
        return [...this.servers.values()].sort((a, b) => (b.seen ?? 0) - (a.seen ?? 0));
    }

    /** A server by its address's key, or null. */
    get(key) {
        return this.servers.get(key) ?? null;
    }

    /** A server remembered (its address, as addressOf gives it, and anything else known of it): its record. */
    remember(address, fields = {}) {
        const record = { worlds: {}, id: null, name: null, seen: null, ...this.servers.get(address.key), key: address.key, host: address.host, port: address.port, secure: address.secure, ...fields };

        this.servers.set(address.key, record);
        this.#save();

        return record;
    }

    /** What's known of a world on a server, updated with `fields` ({ name, key, ticket, player, role }). */
    keepWorld(key, world, fields) {
        const record = this.servers.get(key);

        if (!record) {
            return null;
        }

        record.worlds[world] = { ...record.worlds[world], ...fields };
        this.#save();

        return record.worlds[world];
    }

    /** A world forgotten (its key and ticket with it). */
    forgetWorld(key, world) {
        const record = this.servers.get(key);

        if (record) {
            delete record.worlds[world];
            this.#save();
        }
    }

    /** A server forgotten, and all it held. */
    forget(key) {
        this.servers.delete(key);
        this.#save();
    }

    /** Everything known, as a code to carry to another page or device (it holds keys and tickets: keep it to yourself). */
    export() {
        return `${EXPORTED}${encode64(JSON.stringify({ version: SERVERS_VERSION, servers: this.list() }))}`;
    }

    /**
     * A code from export() taken in: servers not known added; worlds' keys and tickets added to
     * those known; a server known by another id kept as it is (its pin isn't moved by a code).
     * Returns { added, merged, conflicts } (each a list of servers' keys), or null if it isn't a code.
     */
    import(code) {
        let given;

        try {
            given = JSON.parse(decode64(String(code ?? "").trim().replace(EXPORTED, "")));
        } catch {
            return null;
        }

        if (!String(code ?? "").trim().startsWith(EXPORTED) || given?.version !== SERVERS_VERSION || !Array.isArray(given.servers)) {
            return null;
        }

        const result = { added: [], merged: [], conflicts: [] };

        for (const one of given.servers) {
            const address = addressOf(`${one?.secure ? "https" : "http"}://${one?.key}`);

            if (!address) {
                continue;
            }

            const known = this.servers.get(address.key);

            if (!known) {
                this.servers.set(address.key, { worlds: {}, ...one, ...address });
                result.added.push(address.key);
            } else if (known.id && one.id && known.id !== one.id) {
                result.conflicts.push(address.key);
            } else {
                known.id ??= one.id ?? null;
                known.name ??= one.name ?? null;
                known.maker ??= one.maker;

                for (const [world, held] of Object.entries(one.worlds ?? {})) {
                    known.worlds[world] = { ...held, ...known.worlds[world] };
                }

                result.merged.push(address.key);
            }
        }

        this.#save();

        return result;
    }
}

/**
 * The game talking to one world server (its `record`, as KnownServers keeps it; pinned ids saved
 * back to `servers`). `expect` is the id an invite link carries: the server must prove it, and it's
 * pinned (a fresh invite link is the only way a pin's moved). `fetch`, `timing` are for the tests.
 */
export class ServerClient {
    constructor(record, { servers = null, expect = null, fetch = globalThis.fetch?.bind(globalThis), timing = LINK_TIMING } = {}) {
        Object.assign(this, { record, servers, expect, fetch, timing });

        /** The id it's proved this time (null until it has). */
        this.proven = null;
    }

    // A call to its API: the answer, or throws a ServerRefusal
    async #call(method, path, { body = null, session = null, key = null } = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT);
        let response;

        try {
            response = await this.fetch(`${baseOf(this.record)}${API_PATH}${path}`, {
                method,
                headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(session ? { Authorization: `Bearer ${session}` } : key ? { Authorization: `Key ${key}` } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {}),
                signal: controller.signal,
            });
        } catch {
            throw new ServerRefusal("unreachable");
        } finally {
            clearTimeout(timer);
        }

        let answer = null;

        try {
            answer = await response.json();
        } catch {
            // (Not JSON: whatever answered isn't a world server)
        }

        if (!response.ok || !answer) {
            throw new ServerRefusal(answer?.error ?? "unreachable", SERVER_REFUSALS[answer?.error] ?? answer?.message, answer?.wait ? { wait: answer.wait } : {});
        }

        return answer;
    }

    /** Its card (anyone may ask): { server: { id, version, net... }, addresses, worlds (listed), ... }. Its name and when it was seen remembered. */
    async status() {
        const started = performance.now();
        const answer = await this.#call("GET", "/status");

        answer.rtt = performance.now() - started;
        this.record = this.servers?.remember(this.record, { seen: Date.now(), name: answer.server?.name ?? this.record.name }) ?? this.record;

        return answer;
    }

    /**
     * It's proved it's the server meant (its play socket's `hi`), before anything secret goes to
     * it: its id, pinned if it wasn't. Throws ServerRefusal "identity" if it's another's, "proof" if
     * it can't prove anything.
     */
    async prove() {
        if (this.proven) {
            return this.proven;
        }

        let link;

        try {
            link = await RelayLink.open(playOf(this.record), this.timing, PLAY_PROTOCOL);
        } catch {
            throw new ServerRefusal("unreachable");
        }

        try {
            this.proven = await this.#proof(link);

            return this.proven;
        } finally {
            link.close();
        }
    }

    // The server's proof, on a link: its id (pinned if it wasn't), or throws
    async #proof(link) {
        const nonce = newNonce();
        let id;
        let publicKey;
        let signature;

        try {
            [id, publicKey, signature] = await link.prove(nonce);
        } catch {
            throw new ServerRefusal("proof");
        }

        if (!verifyIdentity({ id, publicKey, nonce, signature })) {
            throw new ServerRefusal("proof");
        }

        const pinned = this.expect ?? this.record.id;

        if (pinned && pinned !== id) {
            throw new ServerRefusal("identity");
        }

        if (this.record.id !== id) {
            this.record = this.servers?.remember(this.record, { id }) ?? { ...this.record, id };
        }

        return id;
    }

    // What it says of entering: the world's key, ticket and who the player is there remembered
    #entered(world, answer, key, ticket = null) {
        this.servers?.keepWorld(this.record.key, world, {
            name: answer.card?.name,
            ...(key ? { key } : {}),
            ...(answer.ticket || ticket ? { ticket: answer.ticket ?? ticket } : {}),
            player: answer.player,
            role: answer.role,
        });
        this.record = this.servers?.remember(this.record, { seen: Date.now() }) ?? this.record;

        return answer;
    }

    /**
     * Into a world, by its key or the player's ticket there (what's remembered, unless given):
     * { session, ticket?, role, world, card, player, heroes, life, position }. Proves the server
     * first. Throws ServerRefusal.
     */
    async enter({ world, key = this.record.worlds?.[world]?.key ?? null, ticket = this.record.worlds?.[world]?.ticket ?? null }) {
        await this.prove();

        return this.#entered(world, await this.#call("POST", "/enter", { body: { world, ...(key ? { key } : {}), ...(ticket ? { ticket } : {}), net: NET_VERSION } }), key, ticket);
    }

    /** A short code traded for its world and key, then into it, as enter(). Proves the server first. */
    async redeem(code) {
        await this.prove();

        const answer = await this.#call("POST", "/codes/redeem", { body: { code: String(code).toUpperCase().replace(/[^0-9A-Z]/g, ""), net: NET_VERSION } });

        return this.#entered(answer.world, answer, answer.key);
    }

    /** The worlds it lists, and those the caller holds a key for (a session, or a creator or admin key). */
    async worlds({ session = null, key = null } = {}) {
        await this.prove();

        return (await this.#call("GET", "/worlds", { session, key })).worlds;
    }

    /**
     * A world made, with a creator or admin key (`maker`): { world, name, ownerKey, playerKey }. The
     * owner's key kept for it, so the one who made it comes in as its owner.
     */
    async makeWorld(maker, { name, race, heroes = "kept", firstHero = "new", seed } = {}) {
        await this.prove();

        const made = await this.#call("POST", "/worlds", { key: maker, body: { name, race, heroes, firstHero, ...(Number.isSafeInteger(seed) ? { seed } : {}) } });

        this.servers?.keepWorld(this.record.key, made.world, { name: made.name, key: made.ownerKey, playerKey: made.playerKey, role: "owner" });

        return made;
    }

    /** A world's keys and short codes (its owner's session): { keys, codes }. */
    async keys(world, session) {
        return this.#call("GET", `/worlds/${world}/keys`, { session });
    }

    /** A key made for a world (its owner's session): { key, record }. */
    async issueKey(world, session, { label, role = "player", expires = null, uses = null }) {
        return this.#call("POST", `/worlds/${world}/keys`, { session, body: { label, role, ...(expires ? { expires } : {}), ...(uses ? { uses } : {}) } });
    }

    /** A key revoked (by its id, the first four characters): those who came in by it sent out. */
    async revokeKey(world, session, id) {
        return this.#call("DELETE", `/worlds/${world}/keys/${id}`, { session });
    }

    /** A short code made for one of a world's keys (its owner's session): { code, record }. */
    async makeCode(world, session, { key, minutes, uses }) {
        return this.#call("POST", `/worlds/${world}/codes`, { session, body: { key, ...(minutes ? { minutes } : {}), ...(uses ? { uses } : {}) } });
    }

    /**
     * Into the world on its play socket, by the session enter() gave: resolves, once the world's
     * let it in (onWaiting(n) meanwhile, while it waits its turn), with { joining (core/netplay.js:
     * its onWelcome, onState and onRefused to be heard), link, close() }. Asks to join as
     * `character` (as Host.join takes it), as `hero` (a kept hero's slot, or "new") in a world that
     * keeps them. Hears onClosed(reason) if it's sent out (SERVER_REFUSALS), onLink("lost"/null)
     * as its link drops and comes back, onDrop() if it's lost for good. The server proves itself
     * first, on the same socket.
     */
    async play({ world, session, character, hero, onWaiting = () => {}, onClosed = () => {}, onLink = () => {}, onDrop = () => {} }) {
        let link;

        try {
            link = await RelayLink.open(playOf(this.record), this.timing, PLAY_PROTOCOL);
        } catch {
            throw new ServerRefusal("unreachable");
        }

        try {
            await this.#proof(link);
            link.onWaiting = onWaiting;
            await link.enter(world, session);
        } catch (error) {
            link.close();
            throw error instanceof ServerRefusal ? error : new ServerRefusal(error.message);
        }

        const joining = new Joining({ send: (text) => link.data(text), clock: () => performance.now() });

        link.onData = (text) => joining.hear(text);
        link.onClosed = (reason) => onClosed(reason);
        link.onLost = () => onLink("lost");
        link.onFound = () => {
            joining.resync();
            onLink(null);
        };
        link.onDrop = onDrop;
        joining.hello(character, { hero });

        return { joining, link, close: () => link.close() };
    }
}
