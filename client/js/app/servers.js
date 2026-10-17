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
// Home and away (§9.1): a server's card lists all its addresses, at home and on the internet, and
// says whether the one asking seems to be at the server's home. The game keeps them with the server
// and reaches it by whichever answers: the one that last did first, then (at home) its home
// addresses, else the one it was added by and its internet ones. An address typed bare is tried
// secure first, unless it's at home and the page isn't. **Test this server** tries each internet
// address (its card, and its play socket proving it's the server), and tells the server how it went.
//
//   const servers = new KnownServers();                      // localStorage pellagos.servers
//   const record = servers.remember(addressOf("studio-mac.local"));
//   const client = new ServerClient(record, { servers });
//   await client.status();                                   // the server's card and listed worlds
//   const entered = await client.enter({ world, key });      // proves the server first
//   const { joining } = await client.play({ world, session: entered.session, character, hero });

import { newNonce, verifyIdentity } from "../core/identity.js";
import { Joining, NET_VERSION, versionWords } from "../core/netplay.js";
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

/** How long a call to a server's API may take (ms); and asking one of a server's addresses when there's another to try. */
export const CALL_TIMEOUT = 10000;

/**
 * What the game sends to bring a world to a server (as server/manage.js BRING_FORMAT reads it),
 * and how long the server may take to make it (ms): its land's made from its seed first.
 */
export const BRING_FORMAT = "pellagos.bring.1";
export const BRING_TIMEOUT = 120000;

// A value as JSON, gzipped where the browser can (CompressionStream): bytes to send
async function packed(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));

    if (typeof CompressionStream !== "function") {
        return bytes;
    }

    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}
export const REACH_TIMEOUT = 4000;

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
    version: versionWords(undefined, { server: true }),
    code: "That code doesn't open anything here (or no longer does).",
    wait: "Too many tries: wait a moment, then try again.",
    busy: "Too many newcomers have come into that world lately: try again in an hour or so.",
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
    internet: "That server only answers its own Wi-Fi.",
    secure: "From the internet, that server takes secure connections alone: use its https:// address.",
    "internet-closed": "The server's owner closed it to the internet.",
    host: "That address isn't one the server answers to.",
    origin: "That server won't take games opened from this page. Open the game from the server's own page.",
    unreachable: "Couldn't reach that server.",
    walled: "This page was opened over https, and browsers won't let it reach a server at home over plain http. Open the game from the server instead.",
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

// (Home: the Wi-Fi's private IPv4 ranges, link-local, the machine itself, IPv6 unique-local and
// link-local, and .local names: as the server counts them, server/access/addresses.js)
const HOME_V4 = Object.freeze([
    ["10.0.0.0", 8],
    ["172.16.0.0", 12],
    ["192.168.0.0", 16],
    ["169.254.0.0", 16],
    ["127.0.0.0", 8],
]);
const v4Value = (text) => text.split(".").reduce((all, part) => all * 256 + Number(part), 0);

/** Whether a host (a name or an address, IPv6 bracketed or not) is at home: a .local name, localhost, or a home address. */
export function homeHost(host) {
    const bare = String(host ?? "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "");

    if (bare === "localhost" || bare.endsWith(".local") || bare === "::1") {
        return true;
    }

    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);

    if (v4) {
        const value = v4Value(bare);

        return HOME_V4.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(v4Value(base) / 2 ** (32 - bits)));
    }

    return /^f[cd][0-9a-f]{0,2}:/.test(bare) || /^fe[89ab][0-9a-f]?:/.test(bare);
}

/**
 * A server's addresses from its card (/status `addresses`: URLs), as the game knows them: [{ host,
 * port, secure, key, url (as the server says it), home }].
 */
export function addressesOf(card) {
    return (card?.addresses ?? [])
        .map((url) => ({ url: String(url).replace(/\/+$/, ""), address: addressOf(url) }))
        .filter(({ address }) => address)
        .map(({ url, address }) => ({ ...address, url, home: homeHost(address.host) }));
}

/**
 * The addresses a server's tried at, in turn (`record`, as KnownServers keeps it): the one that
 * last answered; then, if it was last seen at home, its home addresses, the one it was added by and
 * its internet ones; else the one it was added by (secure first, if it was typed bare and isn't at
 * home or this page is secure), its internet addresses and its home ones. Plain ones a secure page
 * can't reach go last. `secure`: whether this page is.
 */
export function candidatesOf(record, { secure = globalThis.location?.protocol === "https:" } = {}) {
    const as = (secured) => ({ host: record.host, port: record.port, secure: secured, key: record.key });
    const own = record.bare ? (homeHost(record.host) && !secure ? [as(false), as(true)] : [as(true), as(false)]) : [as(Boolean(record.secure))];
    const known = record.addresses ?? [];
    const home = known.filter((one) => one.home);
    const away = known.filter((one) => !one.home);
    const last = record.via ? [...own, ...known].filter((one) => `${one.secure ? "s" : ""}${one.key}` === record.via) : [];
    const ordered = [...last, ...(record.home ? [...home, ...own, ...away] : [...own, ...away, ...home])];
    const seen = new Set();
    const unique = ordered.filter((one) => {
        const id = `${one.secure ? "s" : ""}${one.key}`;

        return !seen.has(id) && seen.add(id);
    });

    return [...unique.filter((one) => one.secure || !secure), ...unique.filter((one) => !one.secure && secure)];
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
    constructor(record, { servers = null, expect = null, fetch = globalThis.fetch?.bind(globalThis), timing = LINK_TIMING, secure = globalThis.location?.protocol === "https:" } = {}) {
        Object.assign(this, { record, servers, expect, fetch, timing, secure });

        /** The id it's proved this time (null until it has). */
        this.proven = null;

        /** Where it's reached this time (one of candidatesOf: null until it's been), and its card from there. */
        this.via = null;
        this.card = null;
    }

    // A call to its API (`at` one of its addresses: where it's reached, unless given): the answer,
    // or throws a ServerRefusal
    async #call(method, path, { body = null, raw = null, session = null, key = null, at = null, timeout = CALL_TIMEOUT } = {}) {
        const target = at ?? this.via ?? (await this.reach());
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        let response;

        try {
            // (A body as JSON; or `raw`, bytes sent as they are: a file's)
            response = await this.fetch(`${baseOf(target)}${API_PATH}${path}`, {
                method,
                headers: { ...(raw ? { "Content-Type": "application/octet-stream" } : body ? { "Content-Type": "application/json" } : {}), ...(session ? { Authorization: `Bearer ${session}` } : key ? { Authorization: `Key ${key}` } : {}) },
                ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}),
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
            // (Another version: which is the newer, by the server's version where it says it)
            const message = answer?.error === "version" ? versionWords(answer.net, { server: true }) : (SERVER_REFUSALS[answer?.error] ?? answer?.message);

            throw new ServerRefusal(answer?.error ?? "unreachable", message, answer?.wait ? { wait: answer.wait } : {});
        }

        return answer;
    }

    /**
     * Where it's reached (candidatesOf: the first of its addresses whose card answers, a card that's
     * another server's passed over unless it's at the address it was added by, where proving it
     * says so). Throws ServerRefusal ("unreachable" if none answers).
     */
    async reach() {
        if (this.via) {
            return this.via;
        }

        const tried = candidatesOf(this.record, { secure: this.secure });
        const pinned = this.expect ?? this.record.id;
        let failed = null;

        for (const [index, address] of tried.entries()) {
            const started = performance.now();

            try {
                const answer = await this.#call("GET", "/status", { at: address, timeout: index < tried.length - 1 ? REACH_TIMEOUT : CALL_TIMEOUT });

                if (pinned && answer.server?.id !== pinned && address.key !== this.record.key) {
                    continue;
                }

                answer.rtt = performance.now() - started;
                Object.assign(this, { via: address, card: answer });

                return address;
            } catch (error) {
                failed = error;

                // (A refusal is an answer: it's there)
                if (error instanceof ServerRefusal && error.error !== "unreachable") {
                    this.via = address;
                    throw error;
                }
            }
        }

        throw failed ?? new ServerRefusal("unreachable");
    }

    /**
     * Its card (anyone may ask): { server: { id, version, net... }, addresses, you, worlds (listed),
     * ... }, from wherever it's reached. Its name, when it was seen, its addresses (at home and on the
     * internet), whether this device seemed to be at its home, and where it answered, remembered.
     */
    async status() {
        let answer;

        if (this.via && !this.card) {
            const started = performance.now();

            answer = await this.#call("GET", "/status");
            answer.rtt = performance.now() - started;
        } else {
            await this.reach();
            answer = this.card;
        }

        // (Where it answered kept among its addresses, though its card may not name it)
        const id = (one) => `${one.secure ? "s" : ""}${one.key}`;
        const listed = addressesOf(answer);
        const reached = this.via.key === this.record.key || listed.some((one) => id(one) === id(this.via)) ? [] : [{ ...this.via, url: baseOf(this.via), home: homeHost(this.via.host) }];

        this.card = null;
        this.record =
            this.servers?.remember(this.record, {
                seen: Date.now(),
                name: answer.server?.name ?? this.record.name,
                addresses: [...listed, ...reached],
                home: Boolean(answer.you?.home),
                via: `${this.via.secure ? "s" : ""}${this.via.key}`,
            }) ?? this.record;

        return answer;
    }

    /**
     * Test this server (§9.3): each of its internet addresses tried from here (its card, and its play
     * socket, the server proving it's the one meant), and how it went sent to the server's page.
     * Returns { results: [{ address (as the server says it), ok, ms, socket, error }], reported,
     * home (this device seemed to be at the server's home, which proves nothing of the internet) }.
     */
    async test({ timeout = CALL_TIMEOUT } = {}) {
        const card = await this.status();
        const internet = addressesOf(card)
            .filter((one) => !one.home)
            .slice(0, 8);
        const pinned = this.expect ?? this.record.id ?? card.server?.id ?? null;
        const results = [];

        for (const address of internet) {
            const started = performance.now();

            try {
                const answer = await this.#call("GET", "/status", { at: address, timeout });

                if (pinned && answer.server?.id !== pinned) {
                    throw new ServerRefusal("identity");
                }

                const ms = Math.round(performance.now() - started);

                results.push({ address: address.url, ok: true, ms, socket: await this.#proves(address, pinned) });
            } catch (error) {
                results.push({ address: address.url, ok: false, error: error.error ?? "unreachable" });
            }
        }

        let reported = false;

        if (results.length) {
            const to = internet.find((one, index) => results[index].ok) ?? this.via;

            reported = await this.#call("POST", "/reachability", { at: to, body: { results } }).then(
                () => true,
                () => false,
            );
        }

        return { results, reported, home: Boolean(card.you?.home) };
    }

    // Whether the server at `address` proves on its play socket that it's the one meant
    async #proves(address, pinned) {
        let link = null;

        try {
            link = await RelayLink.open(playOf(address), this.timing, PLAY_PROTOCOL);

            const nonce = newNonce();
            const [id, publicKey, signature] = await link.prove(nonce);

            return verifyIdentity({ id, publicKey, nonce, signature }) && (!pinned || id === pinned);
        } catch {
            return false;
        } finally {
            link?.close();
        }
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

        await this.reach();

        try {
            link = await RelayLink.open(playOf(this.via), this.timing, PLAY_PROTOCOL);
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

    /**
     * A hero of the player's kept in a world (by its slot), as a character file to take home
     * (app/character-file.js): { name, text, count }. Throws ServerRefusal.
     */
    async heroFile({ world, session, slot }) {
        return this.#call("GET", `/worlds/${world}/heroes/${slot}`, { session });
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

    /**
     * A character's own world brought to the server ("Bring my world to the server": server/
     * manage.js bringSolo), with a creator or admin key (`maker`): `character` as app/save.js
     * exportCharacter gives one, the world named `name` (or after them), its first heroes as
     * `firstHero` has them. A world of the server's, with the land and the war of theirs, their
     * hero its first kept hero, and they its owner: { world, name, ownerKey, playerKey, ticket,
     * player, hero, turn, left }. The owner's key and their ticket kept for it, so they come in as
     * its owner, to their hero. Proves the server first. Throws ServerRefusal.
     */
    async bringWorld(maker, { character, name = null, firstHero = "new" }) {
        await this.prove();

        const brought = await this.#call("POST", "/worlds/bring", { key: maker, raw: await packed({ format: BRING_FORMAT, net: NET_VERSION, name, firstHero, character }), timeout: BRING_TIMEOUT });

        this.servers?.keepWorld(this.record.key, brought.world, { name: brought.name, key: brought.ownerKey, playerKey: brought.playerKey, ticket: brought.ticket, player: brought.player, role: "owner" });

        return brought;
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

    /**
     * A world's invite link (its owner's session, or a trusted player's that may invite: server/
     * manage.js invite): one for anyone, to the game's page on the server itself at its internet
     * address (or, closed to the internet, its Wi-Fi's), with the world's players' key: { link,
     * key, page, everywhere, open }. Or `replace`d: the old link letting nobody else in. The
     * players' key kept for the world.
     */
    async invite(world, session, { replace = false } = {}) {
        const made = await this.#call("POST", `/worlds/${world}/invite`, { session, body: replace ? { replace: true } : {} });

        this.servers?.keepWorld(this.record.key, world, { playerKey: made.key });

        return made;
    }

    /** A world's settings changed (its owner's session: `settings`, as server/storage/worlds.js WORLD_SETTINGS has them): its details. */
    async changeWorld(world, session, settings) {
        return this.#call("PATCH", `/worlds/${world}`, { session, body: { settings } });
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

        await this.reach();

        try {
            link = await RelayLink.open(playOf(this.via), this.timing, PLAY_PROTOCOL);
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
